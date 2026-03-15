import { NextRequest } from "next/server";
import { searchJioSaavn } from "@/lib/jiosaavn";
import { MemoryCache } from "@/lib/memoryCache";
import { errorResponse, jsonResponse, optionsResponse, requireApiKey } from "@/lib/apiHttp";

export const runtime = "nodejs";

// JioSaavn-only search — no Spotify API calls, no rate limits, pure webscraping
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

export async function GET(req: NextRequest) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  const { searchParams } = new URL(req.url);
  const rawQuery = searchParams.get("q");
  const query = rawQuery?.trim();

  if (!query) return errorResponse(req, "Query is required", 400);
  if (query.length > 120) return errorResponse(req, "Query too long", 400);

  const source = normalizeSource(searchParams.get("source"));
  if (!source) return errorResponse(req, "Invalid source", 400);

  const limit = parseLimit(searchParams.get("limit"));
  const cacheKey = `${query.toLowerCase()}|${limit}|${source}`;

  const cached = searchCache.get(cacheKey);
  if (cached) return jsonResponse(req, cached, { cacheSeconds: 30 });

  try {
    const results = (await searchJioSaavn(query)) as SearchResultItem[];
    const sliced = results.slice(0, limit);
    searchCache.set(cacheKey, sliced);
    return jsonResponse(req, sliced, { cacheSeconds: 30 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(req, message, 500);
  }
}
