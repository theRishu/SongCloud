import { NextRequest } from "next/server";
import { scrapeSpotifyPlaylist } from "@/lib/spotify";
import { MemoryCache } from "@/lib/memoryCache";
import { errorResponse, jsonResponse, optionsResponse, requireApiKey } from "@/lib/apiHttp";

export const runtime = "nodejs";

const playlistCache = new MemoryCache<Record<string, unknown>>({ maxEntries: 50, ttlMs: 10 * 60_000 });

function parseMaxTracks(value: string | null) {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return 1000;
  return Math.min(2000, Math.max(1, parsed));
}

function normalizePlaylistId(value: string) {
  const trimmed = value.trim();
  const urlMatch = trimmed.match(/playlist\/([a-zA-Z0-9]+)/);
  if (urlMatch) return urlMatch[1];
  const uriMatch = trimmed.match(/^spotify:playlist:([a-zA-Z0-9]+)$/);
  if (uriMatch) return uriMatch[1];
  return trimmed;
}

export function OPTIONS(req: NextRequest) {
  return optionsResponse(req);
}

export async function GET(req: NextRequest) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("id");

  if (!raw) return errorResponse(req, "Playlist ID is required", 400);

  const id = normalizePlaylistId(raw);
  if (!/^[a-zA-Z0-9]{22}$/.test(id)) {
    return errorResponse(req, "Invalid playlist ID", 400);
  }

  const maxTracks = parseMaxTracks(searchParams.get("limit"));
  const cacheKey = `${id}|${maxTracks}`;
  const cached = playlistCache.get(cacheKey);
  if (cached) return jsonResponse(req, cached, { cacheSeconds: 60 });

  try {
    const playlist = await scrapeSpotifyPlaylist(id);
    if (!playlist) return errorResponse(req, "Playlist not found", 404);

    const limitedTracks = playlist.tracks.slice(0, maxTracks);
    const response = {
      ...playlist,
      tracks: limitedTracks,
      truncated: playlist.total > limitedTracks.length,
    };

    playlistCache.set(cacheKey, response as unknown as Record<string, unknown>);
    return jsonResponse(req, response, { cacheSeconds: 300 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Error";
    return errorResponse(req, message, 500);
  }
}
