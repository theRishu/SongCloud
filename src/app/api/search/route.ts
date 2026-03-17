import { NextRequest } from "next/server";
import { searchJioSaavn } from "@/lib/jiosaavn";
import { MemoryCache } from "@/lib/memoryCache";
import { errorResponse, jsonResponse, optionsResponse, requireApiKey } from "@/lib/apiHttp";
import { searchMusicBrainz } from "@/lib/musicbrainz";
import { getYtDlpMetadata } from "@/lib/ytdlp";

export const runtime = "nodejs";

export type SearchResultItem = {
  id: string;
  title: string;
  subtitle?: string;
  image: string;
  source: string;
  url?: string;
};

const searchCache = new MemoryCache<SearchResultItem[]>({ maxEntries: 200, ttlMs: 2 * 60_000 });

function normalizeSource(value: string | null) {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return "jio";
  if (normalized === "jio") return "jio";
  if (normalized === "spotify" || normalized === "all") return "jio";
  return null;
}

function parseLimit(value: string | null) {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return 7;
  return Math.min(50, Math.max(1, parsed));
}

export function OPTIONS(req: NextRequest) {
  return optionsResponse(req);
}

function isProbablyEnglish(query: string): boolean {
  // Simple heuristic: if it contains many common English words or no devanagari-like patterns
  // For now, if it's alphanumeric, we can check both or just prioritize one.
  // Many Indian users search Hindi songs in English.
  // Let's check for Devanagari characters first.
  const hasDevanagari = /[\u0900-\u097F]/.test(query);
  if (hasDevanagari) return false;
  
  // If it's specifically requested or if it looks like an international artist.
  return true; // Default to true but we'll use lang param if available
}

export async function GET(req: NextRequest) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  const { searchParams } = new URL(req.url);
  const rawQuery = searchParams.get("q");
  const query = rawQuery?.trim();

  if (!query) return errorResponse(req, "Query is required", 400);
  if (query.length > 120) return errorResponse(req, "Query too long", 400);

  const lang = searchParams.get("lang")?.toLowerCase() || (isProbablyEnglish(query) ? "en" : "hi");
  const limit = parseLimit(searchParams.get("limit") || "10");
  
  const cacheKey = `${query.toLowerCase()}|${limit}|${lang}`;

  const cached = searchCache.get(cacheKey);
  if (cached) return jsonResponse(req, cached, { cacheSeconds: 30 });

  try {
    let results: any[] = [];
    
    if (lang === "en") {
      // English -> MusicBrainz
      const mbResults = await searchMusicBrainz(query, limit);
      results = mbResults.map((r: any) => ({
        id: r.id,
        title: r.title,
        subtitle: r.artists,
        image: r.image || "https://img.icons8.com/color/512/music-record.png", // Generic music icon if no cover found
        source: "musicbrainz",
        mbid: r.id
      }));
    } else {
      // Hindi -> JioSaavn
      results = (await searchJioSaavn(query)) as SearchResultItem[];
    }

    // If we have few results or want to enrich with yt-dlp metadata as well
    if (results.length < limit) {
        const ytResults = await getYtDlpMetadata(query, limit - results.length);
        results = [...results, ...ytResults];
    }

    const sliced = results.slice(0, limit);
    searchCache.set(cacheKey, sliced);
    return jsonResponse(req, sliced, { cacheSeconds: 30 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(req, message, 500);
  }
}
