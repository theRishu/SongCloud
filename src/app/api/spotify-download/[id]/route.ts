import { NextRequest } from "next/server";
import { getSpotifyPlaylist, scrapeSpotifyPlaylist } from "@/lib/spotify";
import { MemoryCache } from "@/lib/memoryCache";
import { errorResponse, jsonResponse, optionsResponse, requireApiKey } from "@/lib/apiHttp";
import axios from "axios";

export const runtime = "nodejs";

const dlCache = new MemoryCache<any>({ maxEntries: 100, ttlMs: 15 * 60_000 });

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
    let playlistData: any = null;

    // Use scraper first to ensure reliability and bypass rate limits
    try {
      playlistData = await scrapeSpotifyPlaylist(id);
    } catch (e) {
      console.warn("Primary scraper failed, trying API fallback...", e);
    }

    // If scraper failed, try official API
    if (!playlistData) {
      playlistData = await getSpotifyPlaylist(id, { maxTracks: 2000 });
    }

    if (!playlistData) return errorResponse(req, "Playlist not found", 404);

    const origin = req.nextUrl.origin;
    
    const enrichedTracks = playlistData.tracks.map((track: any) => ({
      ...track,
      downloadUrl: `${origin}/api/song?id=${track.id}&type=spotify`
    }));

    // Generate bash script that skips on failure (; instead of &&)
    const bashScript = enrichedTracks.map((t: any) => 
        `curl -L "${origin}/api/song?id=${t.id}&type=spotify" -o "${t.title.replace(/["\\]/g, '')}.mp3"`
    ).join('; ');

    const result = {
      ...playlistData,
      tracks: enrichedTracks,
      bashScript,
      source: playlistData.scraped ? "scraper" : "api"
    };

    dlCache.set(cacheKey, result);
    return jsonResponse(req, result, { cacheSeconds: 600 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal Error";
    return errorResponse(req, message, 500);
  }
}
