import { NextRequest } from "next/server";
import { scrapeSpotifyPlaylist } from "@/lib/spotify";
import { MemoryCache } from "@/lib/memoryCache";
import { errorResponse, jsonResponse, optionsResponse, requireApiKey } from "@/lib/apiHttp";
import axios from "axios";

export const runtime = "nodejs";

const dlCache = new MemoryCache<any>({ maxEntries: 100, ttlMs: 15 * 60_000 });

async function resolvePlaylistId(value: string) {
  let url = value.trim();

  // If it's already an ID
  if (/^[a-zA-Z0-9]{22}$/.test(url)) return url;

  // Handle URI
  const uriMatch = url.match(/^spotify:playlist:([a-zA-Z0-9]{22})$/);
  if (uriMatch) return uriMatch[1];

  // Handle URL
  if (url.startsWith("http")) {
    try {
      // If it's a shortened URL, resolve the redirect
      if (url.includes("spotify.link") || url.includes("spoti.fi")) {
        const res = await axios.get(url, { 
          maxRedirects: 5, 
          timeout: 5000,
          headers: { "User-Agent": "Mozilla/5.0" } 
        });
        url = res.request?.res?.responseUrl || url;
      }
      
      const urlMatch = url.match(/playlist\/([a-zA-Z0-9]{22})/);
      if (urlMatch) return urlMatch[1];
    } catch (e) {
      const urlMatch = url.match(/playlist\/([a-zA-Z0-9]{22})/);
      if (urlMatch) return urlMatch[1];
    }
  }
  return null;
}

export function OPTIONS(req: NextRequest) {
  return optionsResponse(req);
}

export async function GET(req: NextRequest) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("id") || searchParams.get("pl");

  if (!raw) return errorResponse(req, "Playlist ID or URL is required", 400);

  const id = await resolvePlaylistId(raw);
  if (!id) return errorResponse(req, "Invalid Spotify playlist URL", 400);

  const cacheKey = `dl:${id}`;
  const cached = dlCache.get(cacheKey);
  if (cached) return jsonResponse(req, cached, { cacheSeconds: 300 });

  try {
    // 100% WEBSCRAPER - NO Spotify API
    const playlist = await scrapeSpotifyPlaylist(id);
    if (!playlist) return errorResponse(req, "Playlist not found via scraper", 404);

    const origin = req.nextUrl.origin;
    
    const enrichedTracks = playlist.tracks.map((track: any) => {
      const artistText =
        typeof track.artists === "string"
          ? track.artists
          : typeof track.subtitle === "string"
          ? track.subtitle
          : "";
      const metadata = `&title=${encodeURIComponent(track.title)}&artists=${encodeURIComponent(artistText)}`;
      return {
        ...track,
        downloadUrl: `${origin}/api/song?id=${track.id}&type=spotify_playlist&redirect=true${metadata}`,
        streamUrl: `${origin}/api/song?id=${track.id}&type=spotify_playlist&redirect=true${metadata}`,
      };
    });

    const bashScript = enrichedTracks
      .map((t: any) => {
        const artistText =
          typeof t.artists === "string"
            ? t.artists
            : typeof t.subtitle === "string"
            ? t.subtitle
            : "";
        const metadata = `&title=${encodeURIComponent(t.title)}&artists=${encodeURIComponent(artistText)}`;
        return `curl -L "${origin}/api/song?id=${t.id}&type=spotify_playlist&redirect=true${metadata}" -o "${t.title.replace(/["\\]/g, "")}.mp3"`;
      })
      .join("; ");

    const result = {
      ...playlist,
      tracks: enrichedTracks,
      bashScript,
      source: "webscraper",
    };

    dlCache.set(cacheKey, result);
    return jsonResponse(req, result, { cacheSeconds: 600 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return errorResponse(req, message, 500);
  }
}
