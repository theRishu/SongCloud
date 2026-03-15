import axios from "axios";
import { MemoryCache } from "./memoryCache";
import { searchJioSaavn } from "./jiosaavn";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36";

type ImageSource = { url?: string; width?: number; height?: number };

type ScrapedTrack = {
  id: string;
  title: string;
  subtitle: string;
  artists: string;
  album?: string;
  duration?: number;
  image: string;
  thumbnail: string;
  source: "spotify_playlist";
};

type ScrapedPlaylist = {
  id: string;
  title: string;
  description: string;
  image: string;
  owner: string;
  total: number;
  tracks: ScrapedTrack[];
  truncated: boolean;
  scraped: boolean;
};

const scrapeCache = new MemoryCache<ScrapedPlaylist>({ maxEntries: 100, ttlMs: 10 * 60_000 });
const coverCache = new MemoryCache<string>({ maxEntries: 5000, ttlMs: 48 * 60 * 60_000 });

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function trackKey(title: string, artists: string) {
  return `${normalizeText(title)}|${normalizeText(artists)}`;
}

function pickLargestImage(sources: unknown): string {
  if (!Array.isArray(sources)) return "";
  const candidates: Array<{ url: string; score: number }> = [];

  for (const src of sources) {
    if (typeof src === "string") {
      candidates.push({ url: src, score: 0 });
      continue;
    }
    if (isRecord(src) && typeof src.url === "string") {
      const widthRaw = src.width ?? src.w;
      const heightRaw = src.height ?? src.h;
      const width =
        typeof widthRaw === "number"
          ? widthRaw
          : typeof widthRaw === "string"
          ? Number.parseInt(widthRaw, 10)
          : 0;
      const height =
        typeof heightRaw === "number"
          ? heightRaw
          : typeof heightRaw === "string"
          ? Number.parseInt(heightRaw, 10)
          : 0;
      candidates.push({ url: src.url, score: width * height });
    }
  }

  if (candidates.length === 0) return "";
  candidates.sort((a, b) => b.score - a.score);
  if (candidates[0].score === 0) return candidates[candidates.length - 1].url;
  return candidates[0].url;
}

function upgradeSpotifyImageUrl(url: string): string {
  if (!url) return url;
  let upgraded = url;
  const sizeMap: Record<string, string> = {
    "00001e02": "0000b273",
    "00004851": "0000b273",
  };
  for (const [from, to] of Object.entries(sizeMap)) {
    if (upgraded.includes(from)) {
      upgraded = upgraded.replace(from, to);
    }
  }
  if (upgraded.includes("w=")) {
    upgraded = upgraded.replace(/w=\d+/g, "w=640");
  }
  if (upgraded.includes("h=")) {
    upgraded = upgraded.replace(/h=\d+/g, "h=640");
  }
  return upgraded;
}

function isLowResImage(url: string): boolean {
  if (!url) return true;
  const lower = url.toLowerCase();
  if (lower.includes("00001e02") || lower.includes("00004851")) return true;
  const dimMatch = lower.match(/(\d{2,3})x(\d{2,3})/);
  if (dimMatch) {
    const w = Number.parseInt(dimMatch[1], 10);
    const h = Number.parseInt(dimMatch[2], 10);
    if (Number.isFinite(w) && Number.isFinite(h) && Math.max(w, h) <= 360) return true;
  }
  const wMatch = lower.match(/w=(\d{2,3})/);
  const hMatch = lower.match(/h=(\d{2,3})/);
  const w = wMatch ? Number.parseInt(wMatch[1], 10) : null;
  const h = hMatch ? Number.parseInt(hMatch[1], 10) : null;
  if (w && w <= 360) return true;
  if (h && h <= 360) return true;
  return false;
}

function imageScore(url: string): number {
  if (!url) return 0;
  const lower = url.toLowerCase();
  let score = 1000;
  const dimMatch = lower.match(/(\d{2,4})x(\d{2,4})/);
  if (dimMatch) {
    const w = Number.parseInt(dimMatch[1], 10);
    const h = Number.parseInt(dimMatch[2], 10);
    if (Number.isFinite(w) && Number.isFinite(h)) score = w * h;
  }
  const wMatch = lower.match(/w=(\d{2,4})/);
  const hMatch = lower.match(/h=(\d{2,4})/);
  if (wMatch && hMatch) {
    const w = Number.parseInt(wMatch[1], 10);
    const h = Number.parseInt(hMatch[1], 10);
    if (Number.isFinite(w) && Number.isFinite(h)) score = w * h;
  }
  if (lower.includes("0000b273")) score += 200000;
  return score;
}

function extractImageFromRecord(record: unknown): string {
  if (!isRecord(record)) return "";
  const directUrl = typeof record.image === "string" ? record.image : "";
  if (directUrl) return directUrl;

  const coverArt = isRecord(record["coverArt"]) ? record["coverArt"] : null;
  const imageObj = isRecord(record["image"]) ? record["image"] : null;
  const coverArtAlt = isRecord(record["cover_art"]) ? record["cover_art"] : null;
  const sources =
    (coverArt && coverArt["sources"]) ??
    record["images"] ??
    (imageObj && imageObj["sources"]) ??
    (coverArtAlt && coverArtAlt["sources"]);
  return pickLargestImage(sources);
}

function parseTrackIdFromString(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes("spotify:track:")) {
    const parts = trimmed.split("spotify:track:");
    const last = parts[parts.length - 1];
    return last ? last.split("?")[0] : null;
  }
  const urlMatch = trimmed.match(/track\/([a-zA-Z0-9]{16,})/);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9]{16,}$/.test(trimmed)) return trimmed;
  return null;
}

function extractTrackId(track: Record<string, unknown>): string | null {
  const directKeys = ["id", "trackId", "track_id", "uid"];
  for (const key of directKeys) {
    const value = track[key];
    if (typeof value === "string") {
      const parsed = parseTrackIdFromString(value);
      if (parsed) return parsed;
    }
  }

  const uriCandidates = ["uri", "trackUri", "track_uri", "link", "url"];
  for (const key of uriCandidates) {
    const value = track[key];
    if (typeof value === "string") {
      const parsed = parseTrackIdFromString(value);
      if (parsed) return parsed;
    }
  }
  return null;
}

function extractTitle(track: Record<string, unknown>): string | null {
  const nestedTrack = isRecord(track["track"]) ? track["track"] : null;
  const title =
    (typeof track.title === "string" && track.title) ||
    (typeof track.name === "string" && track.name) ||
    (nestedTrack && typeof nestedTrack["name"] === "string" && (nestedTrack["name"] as string));
  return title || null;
}

function extractArtists(track: Record<string, unknown>): string {
  if (typeof track.subtitle === "string" && track.subtitle.trim()) return track.subtitle.trim();
  if (typeof track.artists === "string" && track.artists.trim()) return track.artists.trim();

  const rawArtists = track.artists;
  if (Array.isArray(rawArtists)) {
    const names = rawArtists
      .map((artist) => (isRecord(artist) && typeof artist.name === "string" ? artist.name : null))
      .filter((name): name is string => Boolean(name));
    if (names.length > 0) return names.join(", ");
  }

  const nestedTrack = isRecord(track["track"]) ? track["track"] : null;
  if (nestedTrack && Array.isArray(nestedTrack["artists"])) {
    const names = (nestedTrack["artists"] as unknown[])
      .map((artist) => (isRecord(artist) && typeof artist.name === "string" ? artist.name : null))
      .filter((name): name is string => Boolean(name));
    if (names.length > 0) return names.join(", ");
  }

  return "";
}

function extractAlbum(track: Record<string, unknown>): string | undefined {
  const nestedTrack = isRecord(track["track"]) ? track["track"] : null;
  const nestedAlbum =
    nestedTrack && isRecord(nestedTrack["album"]) ? (nestedTrack["album"] as Record<string, unknown>) : null;
  const album =
    (isRecord(track.album) && typeof track.album.name === "string" && track.album.name) ||
    (isRecord(track.album) && typeof track.album.title === "string" && track.album.title) ||
    (nestedAlbum && typeof nestedAlbum["name"] === "string" && (nestedAlbum["name"] as string));
  return album || undefined;
}

function extractDuration(track: Record<string, unknown>): number | undefined {
  const durationRaw =
    (typeof track.durationMs === "number" && track.durationMs) ||
    (typeof track.duration_ms === "number" && track.duration_ms) ||
    (typeof track.duration === "number" && track.duration);
  if (!durationRaw) return undefined;
  if (durationRaw > 1000) return Math.round(durationRaw / 1000);
  return durationRaw;
}

function extractTrackImage(track: Record<string, unknown>, playlistImage: string): string {
  const trackImage = extractImageFromRecord(track);
  if (trackImage) return trackImage;

  if (isRecord(track["album"])) {
    const albumImage = extractImageFromRecord(track["album"]);
    if (albumImage) return albumImage;
  }

  const nestedTrack = isRecord(track["track"]) ? track["track"] : null;
  if (nestedTrack && isRecord(nestedTrack["album"])) {
    const albumImage = extractImageFromRecord(nestedTrack["album"]);
    if (albumImage) return albumImage;
  }

  if (isRecord(track["albumOfTrack"])) {
    const albumImage = extractImageFromRecord(track["albumOfTrack"]);
    if (albumImage) return albumImage;
  }

  return playlistImage;
}

function unwrapTrack(item: unknown): Record<string, unknown> | null {
  if (!isRecord(item)) return null;
  if (isRecord(item.track)) return item.track as Record<string, unknown>;
  if (isRecord(item.item)) return item.item as Record<string, unknown>;
  if (isRecord(item.data)) return item.data as Record<string, unknown>;
  if (isRecord(item.content)) return item.content as Record<string, unknown>;
  if (isRecord(item.track_data)) return item.track_data as Record<string, unknown>;
  if (isRecord(item.trackData)) return item.trackData as Record<string, unknown>;
  return item;
}

function parseNextData(html: string): Record<string, unknown> | null {
  const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function isPlaylistEntity(entity: unknown, playlistId: string) {
  if (!isRecord(entity)) return false;
  const id = typeof entity.id === "string" ? entity.id : null;
  const uri = typeof entity.uri === "string" ? entity.uri : null;
  if (id !== playlistId && uri !== `spotify:playlist:${playlistId}`) return false;
  return typeof entity.name === "string" || typeof entity.title === "string";
}

function findPlaylistEntity(root: Record<string, unknown>, playlistId: string): Record<string, unknown> | null {
  const anyRoot = root as any;
  const direct = anyRoot?.props?.pageProps?.state?.data?.entity;
  if (isPlaylistEntity(direct, playlistId)) return direct as Record<string, unknown>;

  const candidate =
    anyRoot?.props?.pageProps?.state?.data?.entities?.items?.[playlistId] ??
    anyRoot?.props?.pageProps?.state?.data?.entities?.[playlistId];
  if (isPlaylistEntity(candidate, playlistId)) return candidate as Record<string, unknown>;

  const queue: unknown[] = [root];
  const visited = new Set<object>();
  while (queue.length > 0) {
    const node = queue.shift();
    if (!isRecord(node)) continue;
    if (visited.has(node)) continue;
    visited.add(node);

    if (isPlaylistEntity(node, playlistId)) return node;

    for (const value of Object.values(node)) {
      if (isRecord(value) || Array.isArray(value)) queue.push(value);
    }
  }
  return null;
}

function looksLikeTrackItem(item: unknown): boolean {
  const raw = unwrapTrack(item);
  if (!raw) return false;
  const id = extractTrackId(raw);
  if (id) return true;
  const uri = typeof raw.uri === "string" ? raw.uri : null;
  const trackUri = typeof raw.trackUri === "string" ? raw.trackUri : null;
  return Boolean((uri && uri.includes("spotify:track")) || (trackUri && trackUri.includes("spotify:track")));
}

function extractTrackContainer(root: unknown) {
  const queue: unknown[] = [root];
  const visited = new Set<object>();

  while (queue.length > 0) {
    const node = queue.shift();
    if (!isRecord(node)) {
      if (Array.isArray(node)) {
        for (const item of node) queue.push(item);
      }
      continue;
    }
    if (visited.has(node)) continue;
    visited.add(node);

    const items =
      (Array.isArray(node.items) && node.items) ||
      (Array.isArray(node.trackList) && node.trackList) ||
      (isRecord(node.tracks) && Array.isArray(node.tracks.items) && node.tracks.items);

    if (items && items.some(looksLikeTrackItem)) {
      const next =
        (typeof node.next === "string" && node.next) ||
        (isRecord(node.tracks) && typeof node.tracks.next === "string" && node.tracks.next) ||
        (isRecord(node.trackList) && typeof node.trackList.next === "string" && node.trackList.next) ||
        null;
      const total =
        (typeof node.total === "number" && node.total) ||
        (typeof node.trackCount === "number" && node.trackCount) ||
        (isRecord(node.tracks) && typeof node.tracks.total === "number" && node.tracks.total) ||
        undefined;
      return { items, next, total };
    }

    for (const value of Object.values(node)) {
      if (isRecord(value) || Array.isArray(value)) queue.push(value);
    }
  }
  return null;
}

async function fetchHtml(url: string) {
  const response = await axios.get(url, {
    timeout: 12_000,
    headers: { "User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9" },
  });
  return response.data as string;
}

async function fetchJson(url: string) {
  const response = await axios.get(url, {
    timeout: 12_000,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  return response.data as unknown;
}

function normalizeNextUrl(nextUrl: string, origin: string) {
  if (nextUrl.startsWith("http://") || nextUrl.startsWith("https://")) return nextUrl;
  if (nextUrl.startsWith("/")) return `${origin}${nextUrl}`;
  return `${origin}/${nextUrl}`;
}

async function fetchNextDataFromUrl(url: string): Promise<Record<string, unknown> | null> {
  try {
    const html = await fetchHtml(url);
    return parseNextData(html);
  } catch {
    return null;
  }
}

async function fetchPlaylistData(playlistId: string): Promise<{ data: Record<string, unknown>; origin: string } | null> {
  const origin = "https://open.spotify.com";
  const htmlUrls = [
    `${origin}/playlist/${playlistId}`,
    `${origin}/embed/playlist/${playlistId}`,
  ];

  for (const url of htmlUrls) {
    const data = await fetchNextDataFromUrl(url);
    if (data) return { data, origin };
  }

  const jsonUrls = [
    `${origin}/playlist/${playlistId}?__a=1&__d=dis`,
    `${origin}/playlist/${playlistId}?__a=1`,
  ];

  for (const url of jsonUrls) {
    try {
      const json = await fetchJson(url);
      if (isRecord(json)) return { data: json as Record<string, unknown>, origin };
    } catch {
      // continue
    }
  }

  return null;
}

export async function scrapeSpotifyPlaylist(playlistId: string): Promise<ScrapedPlaylist | null> {
  const cached = scrapeCache.get(playlistId);
  if (cached) return cached;

  const source = await fetchPlaylistData(playlistId);
  if (!source) return null;
  const { data, origin } = source;

  const playlistEntity = findPlaylistEntity(data, playlistId);
  const playlistImage = upgradeSpotifyImageUrl(
    extractImageFromRecord(playlistEntity) || extractImageFromRecord(data)
  );
  const title =
    (playlistEntity && typeof playlistEntity.name === "string" && playlistEntity.name) ||
    (playlistEntity && typeof playlistEntity.title === "string" && playlistEntity.title) ||
    "Spotify Playlist";
  const description =
    (playlistEntity && typeof playlistEntity.description === "string" && playlistEntity.description) ||
    (playlistEntity && typeof playlistEntity.subtitle === "string" && playlistEntity.subtitle) ||
    "";
  const owner =
    (playlistEntity &&
      isRecord(playlistEntity.owner) &&
      typeof playlistEntity.owner.display_name === "string" &&
      playlistEntity.owner.display_name) ||
    (playlistEntity &&
      isRecord(playlistEntity.owner) &&
      typeof playlistEntity.owner.name === "string" &&
      playlistEntity.owner.name) ||
    "Spotify";

  const initialContainer = extractTrackContainer(playlistEntity) ?? extractTrackContainer(data);
  if (!initialContainer) return null;

  const tracks: ScrapedTrack[] = [];
  const seen = new Set<string>();

  const addTracks = (items: unknown[]) => {
    for (const item of items) {
      const raw = unwrapTrack(item);
      if (!raw) continue;
      const id = extractTrackId(raw);
      const title = extractTitle(raw);
      if (!id || !title) continue;
      const artists = extractArtists(raw);
      if (!artists) continue;
      const key = trackKey(title, artists);
      const image = upgradeSpotifyImageUrl(extractTrackImage(raw, playlistImage));
      const album = extractAlbum(raw);
      const duration = extractDuration(raw);

      if (seen.has(key)) {
        const existing = tracks.find((t) => trackKey(t.title, t.artists) === key);
        if (existing) {
          const existingScore = imageScore(existing.image);
          const nextScore = imageScore(image);
          if (nextScore > existingScore) {
            existing.image = image;
            existing.thumbnail = image;
          }
          if (!existing.album && album) existing.album = album;
          if (!existing.duration && duration) existing.duration = duration;
          if (!existing.id) existing.id = id;
        }
        continue;
      }

      seen.add(key);

      tracks.push({
        id,
        title,
        subtitle: artists,
        artists,
        album,
        duration,
        image,
        thumbnail: image,
        source: "spotify_playlist",
      });
    }
  };

  addTracks(initialContainer.items);

  let nextUrl = initialContainer.next;
  let guard = 0;
  while (nextUrl && guard < 50) {
    guard += 1;
    const normalizedNext = normalizeNextUrl(nextUrl, origin);
    if (normalizedNext.includes("api.spotify.com")) {
      break;
    }
    const pageJson = await fetchJson(normalizedNext);
    const nextContainer = extractTrackContainer(pageJson);
    if (!nextContainer) break;
    addTracks(nextContainer.items);
    nextUrl = nextContainer.next;
  }

  const fillMissingCovers = async () => {
    const missing = tracks.filter(
      (track) => !track.image || track.image === playlistImage || isLowResImage(track.image)
    );
    if (missing.length === 0) return;

    const queue = [...missing];
    const workerCount = Math.min(6, queue.length);

    const workers = Array.from({ length: workerCount }, async () => {
      while (queue.length > 0) {
        const track = queue.shift();
        if (!track) break;
        const key = trackKey(track.title, track.artists);
        const cached = coverCache.get(key);
        if (cached) {
          track.image = cached;
          track.thumbnail = cached;
          continue;
        }

        try {
          const results = await searchJioSaavn(`${track.title} ${track.artists}`.trim());
          const image = results?.[0]?.image ?? "";
          if (image) {
            coverCache.set(key, image);
            track.image = image;
            track.thumbnail = image;
          }
        } catch (e) {
          // Keep playlist image as fallback
        }
      }
    });

    await Promise.all(workers);
  };

  await fillMissingCovers();

  const total =
    (playlistEntity &&
      typeof playlistEntity.total === "number" &&
      playlistEntity.total) ||
    (playlistEntity &&
      typeof playlistEntity.trackCount === "number" &&
      playlistEntity.trackCount) ||
    (playlistEntity &&
      isRecord(playlistEntity.tracks) &&
      typeof playlistEntity.tracks.total === "number" &&
      playlistEntity.tracks.total) ||
    (initialContainer.total ?? tracks.length);

  const result: ScrapedPlaylist = {
    id: playlistId,
    title,
    description,
    image: playlistImage,
    owner,
    total,
    tracks,
    truncated: tracks.length < total,
    scraped: true,
  };

  scrapeCache.set(playlistId, result);
  return result;
}
