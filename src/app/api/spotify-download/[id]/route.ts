import { NextRequest } from "next/server";
import { scrapeSpotifyPlaylist } from "@/lib/spotify";
import { MemoryCache } from "@/lib/memoryCache";
import { errorResponse, jsonResponse, optionsResponse, requireApiKey } from "@/lib/apiHttp";

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
    // 100% WEBSCRAPE - NO API TO AVOID RATE LIMITS
    const playlistData = await scrapeSpotifyPlaylist(id);

    if (!playlistData) {
      return errorResponse(req, "Could not scrape playlist. Make sure it is public.", 404);
    }

    const origin = req.nextUrl.origin;
    
    const enrichedTracks = playlistData.tracks.map((track: any) => {
      const metadata = `&title=${encodeURIComponent(track.title)}&artists=${encodeURIComponent(track.subtitle)}&enrich=true`;
      return {
        ...track,
        downloadUrl: `${origin}/api/song?id=${track.id}&type=spotify&redirect=true${metadata}`,
        streamUrl: `${origin}/api/song?id=${track.id}&type=spotify&redirect=true${metadata}`
      };
    });

    // Generate bash script
    const bashScript = enrichedTracks.map((t: any) => {
        const metadata = `&title=${encodeURIComponent(t.title)}&artists=${encodeURIComponent(t.subtitle)}`;
        return `curl -L "${origin}/api/song?id=${t.id}&type=spotify&redirect=true${metadata}" -o "${t.title.replace(/["\\]/g, '')}.mp3"`;
    }).join('; ');

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
