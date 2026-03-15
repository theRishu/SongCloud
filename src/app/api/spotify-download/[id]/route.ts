import { NextRequest } from "next/server";
import { scrapeSpotifyPlaylist } from "@/lib/spotify";
import { MemoryCache } from "@/lib/memoryCache";
import { errorResponse, jsonResponse, optionsResponse, requireApiKey } from "@/lib/apiHttp";

export const runtime = "nodejs";

type PlaylistResponse = Record<string, unknown>;
const dlCache = new MemoryCache<PlaylistResponse>({ maxEntries: 100, ttlMs: 15 * 60_000 });

export function OPTIONS(req: NextRequest) {
  return optionsResponse(req);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  const resolvedParams = await params;
  const { searchParams } = new URL(req.url);
  
  let id = resolvedParams.id || searchParams.get("id") || searchParams.get("pl");
  if (!id) return errorResponse(req, "ID is required", 400);

  // Clean the ID
  id = id.split('?')[0];

  if (!/^[a-zA-Z0-9]{22}$/.test(id)) {
    return errorResponse(req, "Invalid Spotify playlist ID in path", 400);
  }

  const cacheKey = `dl:${id}`;
  const cached = dlCache.get(cacheKey);
  if (cached) return jsonResponse(req, cached, { cacheSeconds: 300 });

  try {
    // 100% WEBSCRAPE - NO API TO AVOID RATE LIMITS
    const playlistData = await scrapeSpotifyPlaylist(id);

    if (!playlistData) {
      return errorResponse(req, "Could not scrape playlist. Make sure it is public.", 404);
    }

    const origin = req.nextUrl.origin;
    
    const enrichedTracks = playlistData.tracks.map((track: Record<string, unknown>) => {
      const trackId = typeof track.id === "string" ? track.id : "";
      const trackTitle = typeof track.title === "string" ? track.title : "";
      const artistText =
        typeof track.artists === "string"
          ? track.artists
          : typeof track.subtitle === "string"
          ? track.subtitle
          : "";
      const metadata = `&title=${encodeURIComponent(trackTitle)}&artists=${encodeURIComponent(artistText)}`;
      return {
        ...track,
        downloadUrl: `${origin}/api/song?id=${trackId}&type=spotify_playlist&redirect=true${metadata}`,
        streamUrl: `${origin}/api/song?id=${trackId}&type=spotify_playlist&redirect=true${metadata}`,
      };
    });

    // Generate bash script
    const bashScript = enrichedTracks
      .map((t: Record<string, unknown>) => {
        const tId = typeof t.id === "string" ? t.id : "";
        const tTitle = typeof t.title === "string" ? t.title : "";
        const artistText =
          typeof t.artists === "string"
            ? t.artists
            : typeof t.subtitle === "string"
            ? t.subtitle
            : "";
        const metadata = `&title=${encodeURIComponent(tTitle)}&artists=${encodeURIComponent(artistText)}`;
        return `curl -L "${origin}/api/song?id=${tId}&type=spotify_playlist&redirect=true${metadata}" -o "${tTitle.replace(/["\\]/g, "")}.mp3"`;
      })
      .join("; ");

    const result = {
      ...playlistData,
      tracks: enrichedTracks,
      bashScript,
      source: "webscraper"
    };

    dlCache.set(cacheKey, result);
    return jsonResponse(req, result, { cacheSeconds: 600 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Error";
    return errorResponse(req, message, 500);
  }
}
