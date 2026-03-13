import { NextRequest } from "next/server";
import { getSpotifyPlaylist } from "@/lib/spotify";
import { MemoryCache } from "@/lib/memoryCache";
import { errorResponse, jsonResponse, optionsResponse, requireApiKey } from "@/lib/apiHttp";
import axios from "axios";

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
    const playlist = await getSpotifyPlaylist(id, { maxTracks });
    if (!playlist) return errorResponse(req, "Playlist not found", 404);
    playlistCache.set(cacheKey, playlist as unknown as Record<string, unknown>);
    return jsonResponse(req, playlist, { cacheSeconds: 300 });
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const upstreamMessage =
        error.response?.data && typeof error.response.data === "object"
          ? (error.response.data as Record<string, unknown>)?.error &&
            typeof (error.response.data as Record<string, unknown>).error === "object"
            ? ((error.response.data as { error?: { message?: unknown } }).error?.message as unknown)
            : null
          : null;
      const upstreamText = typeof upstreamMessage === "string" ? upstreamMessage : null;

      if (status === 429) {
        const retryAfter = error.response?.headers?.["retry-after"];
        return errorResponse(req, "Spotify rate limit exceeded. Try again later.", 429, {
          headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined,
        });
      }

      if (status === 401 || status === 403) {
        return errorResponse(req, upstreamText ? `Spotify authorization failed: ${upstreamText}` : "Spotify authorization failed.", 502);
      }

      if (status === 404) {
        return errorResponse(req, "Playlist not found", 404);
      }

      if (typeof status === "number") {
        return errorResponse(req, upstreamText ? `Spotify API error (${status}): ${upstreamText}` : `Spotify API error (${status})`, 502);
      }
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(req, message, 500);
  }
}
