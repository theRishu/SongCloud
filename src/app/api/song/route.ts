import { NextRequest } from "next/server";
import { getSongDetails as getJioDetails, searchJioSaavn } from "@/lib/jiosaavn";
import { getTidalId, getHighQualityStream } from "@/lib/tidal";
import { MemoryCache } from "@/lib/memoryCache";
import { errorResponse, jsonResponse, optionsResponse, requireApiKey } from "@/lib/apiHttp";

export const runtime = "nodejs";

const songCache = new MemoryCache<Record<string, unknown>>({ maxEntries: 500, ttlMs: 30 * 60_000 });

function normalizeType(value: string | null) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return "jio";
  if (normalized === "jio" || normalized === "saavn" || normalized === "jiosaavn") return "jio";
  if (normalized === "spotify" || normalized === "spotify_playlist" || normalized === "spotify-playlist") return "spotify_playlist";
  return null;
}

export function OPTIONS(req: NextRequest) {
  return optionsResponse(req);
}

export async function GET(req: NextRequest) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  const type = normalizeType(searchParams.get("type") ?? searchParams.get("source"));

  if (!id) return errorResponse(req, "ID is required", 400);
  if (id.length > 128) return errorResponse(req, "ID too long", 400);
  if (!type) return errorResponse(req, "Invalid type", 400);
  
  const cacheKey = `${type}:${id}`;
  const cached = songCache.get(cacheKey);
  if (cached) return jsonResponse(req, cached, { cacheSeconds: 60 });

  try {
    let result: Record<string, unknown> = {};
    let status = 200;

    if (type === "spotify_playlist") {
      const qTitle = searchParams.get("title");
      const qArtists = searchParams.get("artists") || searchParams.get("subtitle");

      if (!qTitle || !qArtists) {
        return errorResponse(req, "title and artists are required for spotify_playlist resolution", 400);
      }

      const query = `${qTitle} ${qArtists}`.trim();

      const isLikelyPreview = (url: string | null) => !url || url.includes("p.scdn.co") || url.includes("mp3-preview");

      let resolved = false;

      try {
        const jioResults = await searchJioSaavn(query);
        if (jioResults.length > 0) {
          const firstMatch = await getJioDetails(jioResults[0].id);
          if (firstMatch?.mediaUrl && !isLikelyPreview(firstMatch.mediaUrl)) {
            resolved = true;
            result = {
              title: qTitle,
              artists: qArtists,
              album: firstMatch.album,
              duration: firstMatch.duration,
              image: firstMatch.image,
              mediaUrl: firstMatch.mediaUrl,
              quality: firstMatch.quality || "320kbps",
              source: "jio_full_stream_official",
            };
          }
        }
      } catch {
        console.warn("JioSaavn resolution failed, trying Tidal fallback.");
      }

      if (!resolved) {
        const tidalId = await getTidalId(id).catch(() => null);
        const tidalUrl = tidalId ? await getHighQualityStream(tidalId, "LOSSLESS").catch(() => null) : null;
        if (tidalUrl && !isLikelyPreview(tidalUrl)) {
          resolved = true;
          result = {
            title: qTitle,
            artists: qArtists,
            mediaUrl: tidalUrl,
            quality: "FLAC",
            source: "tidal_full_stream_official",
          };
        }
      }

      if (resolved && typeof result.mediaUrl === "string") {
        if (searchParams.get("redirect") === "true") {
          return Response.redirect(result.mediaUrl, 302);
        }
      } else {
        status = 404;
        result = { error: "No playable source found for this track." };
      }
    } else {
      // JioSaavn Direct Resolution
      const details = await getJioDetails(id);
      if (!details) return errorResponse(req, "Song not found", 404);
      result = details as unknown as Record<string, unknown>;
      
      if (searchParams.get("redirect") === "true" && typeof result.mediaUrl === "string") {
        return Response.redirect(result.mediaUrl, 302);
      }
      
      if (typeof result.error === "string") status = 502;
    }

    if (status === 200 && result.mediaUrl) {
        songCache.set(cacheKey, result);
    }
    return jsonResponse(req, result, { status, cacheSeconds: 60 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(req, message, 500);
  }
}
