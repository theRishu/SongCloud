import { NextRequest } from "next/server";
import { getSongDetails } from "@/lib/jiosaavn";
import { getSpotifyTrack } from "@/lib/spotify";
import { getTidalId, getHighQualityStream } from "@/lib/tidal";
import { MemoryCache } from "@/lib/memoryCache";
import { errorResponse, jsonResponse, optionsResponse, requireApiKey } from "@/lib/apiHttp";

export const runtime = "nodejs";

const songCache = new MemoryCache<Record<string, unknown>>({ maxEntries: 500, ttlMs: 30 * 60_000 });

function normalizeType(value: string | null) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return "jio";
  if (normalized === "jio" || normalized === "saavn" || normalized === "jiosaavn") return "jio";
  if (normalized === "spotify") return "spotify";
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
  if (type === "spotify" && !/^[a-zA-Z0-9]{22}$/.test(id)) return errorResponse(req, "Invalid Spotify track id", 400);

  const cacheKey = `${type}:${id}`;
  const cached = songCache.get(cacheKey);
  if (cached) return jsonResponse(req, cached, { cacheSeconds: 60 });

  try {
    let result: Record<string, unknown>;
    let status = 200;
    if (type === "spotify") {
      const [track, tidalId] = await Promise.all([getSpotifyTrack(id), getTidalId(id)]);
      let hqUrl = null;
      if (tidalId) {
        hqUrl = await getHighQualityStream(tidalId, "LOSSLESS");
      }

      if (hqUrl) {
        result = { ...track, mediaUrl: hqUrl, quality: "FLAC" };
      } else {
        status = 404;
        result = { error: "Stream not available" };
      }
    } else {
      const details = await getSongDetails(id);
      if (!details) return errorResponse(req, "Song not found", 404);
      result = details as unknown as Record<string, unknown>;
      if (typeof result.error === "string") status = 502;
    }

    songCache.set(cacheKey, result);
    return jsonResponse(req, result, { status, cacheSeconds: 60 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(req, message, 500);
  }
}
