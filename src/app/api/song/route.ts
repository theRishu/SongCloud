import { NextRequest } from "next/server";
import { getSongDetails as getJioDetails, searchJioSaavn } from "@/lib/jiosaavn";
import { getTidalId, getHighQualityStream } from "@/lib/tidal";
import { getSpotifyTrack } from "@/lib/spotify";
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
  
  const cacheKey = `${type}:${id}`;
  const cached = songCache.get(cacheKey);
  if (cached) return jsonResponse(req, cached, { cacheSeconds: 60 });

  try {
    let result: Record<string, unknown> = {};
    let status = 200;
    let hqUrl: string | null = null;

    if (type === "spotify") {
      const qTitle = searchParams.get("title");
      const qArtists = searchParams.get("artists") || searchParams.get("subtitle");
      const shouldEnrich = searchParams.get("enrich") === "true";
      
      let track: any = null;
      if (qTitle && qArtists) {
        track = { title: qTitle, artists: qArtists, id };
      } else {
        try {
          track = await getSpotifyTrack(id);
        } catch (e) {
          console.warn("Spotify API metadata fetch failed, using minimal info.");
          track = { title: "Unknown Track", artists: "Unknown Artist", id };
        }
      }

      // MusicBrainz Enrichment for "Official" feeling
      if (shouldEnrich) {
        try {
          const { searchMusicBrainz, getCoverArt } = await import("@/lib/musicbrainz");
          const mbData = await searchMusicBrainz(track.title, track.artists);
          if (mbData) {
              track.officialTitle = mbData.title;
              track.officialArtist = mbData.artist;
              track.mbid = mbData.mbid;
              if (mbData.releaseId) {
                  const officialArt = await getCoverArt(mbData.releaseId);
                  if (officialArt) track.image = officialArt;
              }
          }
        } catch (e) {
             console.warn("MusicBrainz enrichment failed, continuing...");
        }
      }

      const tidalId = await getTidalId(id).catch(() => null);
      let hqUrl = null;
      if (tidalId) {
        hqUrl = await getHighQualityStream(tidalId, "LOSSLESS").catch(() => null);
      }

      // If Tidal fails or returns a preview (sanity check), use JioSaavn (Full 320kbps)
      const isLikelyPreview = (url: string | null) => !url || url.includes("p.scdn.co") || url.includes("mp3-preview");
      
      if (isLikelyPreview(hqUrl)) {
        const { searchJioSaavn, getSongDetails: getJioDetails } = await import("@/lib/jiosaavn");
        const query = `${track.title} ${track.artists}`.trim();
        const jioResults = await searchJioSaavn(query);
        
        if (jioResults.length > 0) {
          const firstMatch = await getJioDetails(jioResults[0].id);
          if (firstMatch?.mediaUrl && !isLikelyPreview(firstMatch.mediaUrl)) {
            hqUrl = firstMatch.mediaUrl;
            result = {
              ...track,
              image: track.image || firstMatch.image,
              album: firstMatch.album,
              duration: firstMatch.duration,
              quality: firstMatch.quality || "320kbps",
              source: "jio_full_stream_official"
            };
          }
        }
      } else {
        result = {
          ...track,
          mediaUrl: hqUrl,
          quality: "FLAC",
          source: "tidal_full_stream_official"
        };
      }

      if (hqUrl && !isLikelyPreview(hqUrl)) {
        if (searchParams.get("redirect") === "true") {
          return Response.redirect(hqUrl, 302);
        }
        result.mediaUrl = hqUrl;
      } else {
        status = 404;
        result = { error: "Strict Policy: Full-length audio only. No high-quality source found for this track." };
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
