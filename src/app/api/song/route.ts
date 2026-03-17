import { NextRequest } from "next/server";
import { getSongDetails as getJioDetails, searchJioSaavn } from "@/lib/jiosaavn";
import { getTidalId, getHighQualityStream } from "@/lib/tidal";
import { MemoryCache } from "@/lib/memoryCache";
import { errorResponse, jsonResponse, optionsResponse, requireApiKey } from "@/lib/apiHttp";

export const runtime = "nodejs";

const songCache = new MemoryCache<Record<string, unknown>>({ maxEntries: 500, ttlMs: 30 * 60_000 });

import { getBestAudioUrl } from "@/lib/ytdlp";

function normalizeType(value: string | null) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return "jio";
  if (normalized === "jio" || normalized === "saavn" || normalized === "jiosaavn") return "jio";
  if (normalized === "spotify" || normalized === "spotify_playlist" || normalized === "spotify-playlist") return "spotify_playlist";
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
  if (cached) return jsonResponse(req, cached, { cacheSeconds: 60 });

  try {
    let result: Record<string, unknown> = {};
    let status = 200;

    if (type === "spotify_playlist" || type === "musicbrainz") {
      const qTitle = searchParams.get("title");
      const qArtists = searchParams.get("artists") || searchParams.get("subtitle");

      if (!qTitle) {
        return errorResponse(req, "title is required for resolution", 400);
      }

      const query = `${qTitle} ${qArtists || ""}`.trim();
      const isLikelyPreview = (url: string | null) => !url || url.includes("p.scdn.co") || url.includes("mp3-preview");

      let resolved = false;

      // Try JioSaavn first for potential high quality official streams
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
              source: "jio_resolved",
            };
          }
        }
      } catch {}

      // Fallback to yt-dlp if not resolved
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

      if (resolved && typeof result.mediaUrl === "string") {
        if (searchParams.get("redirect") === "true") {
          return Response.redirect(result.mediaUrl, 302);
        }
      } else {
        status = 404;
        result = { error: "No playable source found for this track." };
      }
    } else if (type === "youtube") {
      const ytData = await getBestAudioUrl(id); // Use id as query or video id
      if (!ytData) return errorResponse(req, "YouTube song not found", 404);
      result = {
          ...ytData,
          mediaUrl: ytData.url,
          source: "youtube_yt_dlp"
      };
      if (searchParams.get("redirect") === "true" && typeof result.mediaUrl === "string") {
        return Response.redirect(result.mediaUrl, 302);
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
