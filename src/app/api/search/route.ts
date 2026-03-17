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

// Extended TTL: 10 min for search — results don't change that fast
const searchCache = new MemoryCache<SearchResultItem[]>({ maxEntries: 400, ttlMs: 10 * 60_000 });

function parseLimit(value: string | null): number {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(50, Math.max(1, parsed));
}

function isProbablyEnglish(query: string): boolean {
  return !/[\u0900-\u097F]/.test(query); // no Devanagari → treat as English
}

const AVOID_WORDS = ["remix", "unplugged", "lofi", "slowed", "reverb", "cover", "8d", "mashup", "instrumental", "karaoke"];

function filterOfficialOnly(results: SearchResultItem[], query: string): SearchResultItem[] {
  const lowerQuery = query.toLowerCase();
  const allowedOverrides = AVOID_WORDS.filter(w => lowerQuery.includes(w));
  return results.filter(r => {
    const text = `${r.title || ""} ${r.subtitle || ""}`.toLowerCase();
    for (const word of AVOID_WORDS) {
      if (!allowedOverrides.includes(word) && text.includes(word)) return false;
    }
    return true;
  });
}

export function OPTIONS(req: NextRequest) {
  return optionsResponse(req);
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
  const limit = parseLimit(searchParams.get("limit"));

  const cacheKey = `${query.toLowerCase()}|${limit}|${lang}`;
  const cached = searchCache.get(cacheKey);
  if (cached) return jsonResponse(req, cached, { cacheSeconds: 60 });

  try {
    let results: SearchResultItem[] = [];

    if (lang === "en") {
      // ── English: MusicBrainz first, yt-dlp enrichment only if needed ───────
      const [mbResults, ytResults] = await Promise.allSettled([
        searchMusicBrainz(query, limit),
        // Only start yt-dlp if we expect MB to be thin — fire in parallel
        getYtDlpMetadata(`${query} official audio`, Math.max(5, limit - 10)),
      ]);

      if (mbResults.status === "fulfilled" && mbResults.value.length > 0) {
        results = mbResults.value.map((r: any) => ({
          id: r.id,
          title: r.title,
          subtitle: r.artists,
          image: r.image || "https://img.icons8.com/color/512/music-record.png",
          source: "musicbrainz",
          mbid: r.id,
        }));
      }

      // Append yt-dlp results only if we're short on hits
      if (results.length < limit && ytResults.status === "fulfilled" && ytResults.value) {
        const ytIds = new Set(results.map(r => r.id));
        results = [...results, ...(ytResults.value as SearchResultItem[]).filter(r => !ytIds.has(r.id))];
      }
    } else {
      // ── Hindi: JioSaavn is primary, fast and reliable ───────────────────────
      results = (await searchJioSaavn(query, Math.max(limit, 30))) as SearchResultItem[];

      // Only call yt-dlp if JioSaavn returns very few results
      if (results.length < 5) {
        const ytResults = await getYtDlpMetadata(`${query} hindi song official`, Math.max(5, limit));
        const jioIds = new Set(results.map(r => r.id));
        results = [...results, ...(ytResults as SearchResultItem[]).filter(r => !jioIds.has(r.id))];
      }
    }

    results = filterOfficialOnly(results, query);
    const sliced = results.slice(0, limit);

    searchCache.set(cacheKey, sliced);
    return jsonResponse(req, sliced, { cacheSeconds: 60 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[search] Unhandled:", message);
    return errorResponse(req, message, 500);
  }
}
