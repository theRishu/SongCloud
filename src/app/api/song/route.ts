import { NextRequest } from "next/server";
import { getSongDetails as getJioDetails, searchJioSaavn, resolveFirstValid } from "@/lib/jiosaavn";
import { MemoryCache } from "@/lib/memoryCache";
import { errorResponse, jsonResponse, optionsResponse, requireApiKey } from "@/lib/apiHttp";
import { getBestAudioUrl } from "@/lib/ytdlp";

export const runtime = "nodejs";

// Long TTL — audio URLs from JioSaavn have long expiry
const songCache = new MemoryCache<Record<string, unknown>>({ maxEntries: 1000, ttlMs: 60 * 60_000 });

function normalizeType(value: string | null) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return "jio";
  if (normalized === "jio" || normalized === "saavn" || normalized === "jiosaavn") return "jio";
  if (normalized === "spotify" || normalized.startsWith("spotify")) return "spotify_playlist";
  if (normalized === "musicbrainz" || normalized === "mbid") return "musicbrainz";
  if (normalized === "youtube" || normalized === "yt") return "youtube";
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
  if (cached) return jsonResponse(req, cached, { cacheSeconds: 120 });

  try {
    let result: Record<string, unknown> = {};
    let status = 200;

    // ── Spotify / MusicBrainz resolution (search by title+artist) ──────────────
    if (type === "spotify_playlist" || type === "musicbrainz") {
      const qTitle = searchParams.get("title");
      const qArtists = searchParams.get("artists") || searchParams.get("subtitle");

      if (!qTitle) return errorResponse(req, "title is required for resolution", 400);

      const query = `${qTitle} ${qArtists || ""}`.trim();
      let resolved = false;

      // 1️⃣ JioSaavn search — grab top 5 candidates and resolve them in parallel
      try {
        const jioResults = await searchJioSaavn(query, 6);
        if (jioResults.length > 0) {
          const topIds = jioResults.slice(0, 5).map(r => r.id);
          const firstMatch = await resolveFirstValid(topIds);
          if (firstMatch?.mediaUrl) {
            resolved = true;
            result = {
              title: qTitle,
              artists: qArtists,
              album: firstMatch.album,
              duration: firstMatch.duration,
              image: firstMatch.image,
              mediaUrl: firstMatch.mediaUrl,
              quality: firstMatch.quality || "320kbps",
              source: "jio_resolved",
            };
          }
        }
      } catch (e) {
        console.error("[song] JioSaavn resolution error:", (e as Error).message);
      }

      // 2️⃣ Fallback: yt-dlp (with timeout built-in)
      if (!resolved) {
        const ytData = await getBestAudioUrl(query);
        if (ytData?.url) {
          resolved = true;
          result = {
            title: qTitle || ytData.title,
            artists: qArtists || ytData.uploader,
            image: ytData.thumbnail,
            mediaUrl: ytData.url,
            duration: ytData.duration,
            quality: "High",
            source: "youtube_yt_dlp",
          };
        }
      }

      if (!resolved) {
        status = 404;
        result = { error: "No playable source found for this track." };
      } else if (searchParams.get("redirect") === "true" && typeof result.mediaUrl === "string") {
        return Response.redirect(result.mediaUrl, 302);
      }

    // ── YouTube direct resolution ────────────────────────────────────────────
    } else if (type === "youtube") {
      const ytData = await getBestAudioUrl(id);
      if (!ytData) return errorResponse(req, "YouTube media not found", 404);
      result = { ...ytData, mediaUrl: ytData.url, source: "youtube_yt_dlp" };
      if (searchParams.get("redirect") === "true" && typeof result.mediaUrl === "string") {
        return Response.redirect(result.mediaUrl, 302);
      }

    // ── JioSaavn direct by ID ────────────────────────────────────────────────
    } else {
      const details = await getJioDetails(id);
      if (!details) return errorResponse(req, "Song not found on JioSaavn", 404);
      result = details as unknown as Record<string, unknown>;
      if (typeof result.error === "string") status = 502;
      if (searchParams.get("redirect") === "true" && typeof result.mediaUrl === "string") {
        return Response.redirect(result.mediaUrl, 302);
      }
    }

    // Cache only successful responses with a valid media URL
    if (status === 200 && result.mediaUrl) {
      songCache.set(cacheKey, result);
    }

    return jsonResponse(req, result, { status, cacheSeconds: 60 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[song] Unhandled:", message);
    return errorResponse(req, message, 500);
  }
}
