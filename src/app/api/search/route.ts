import { NextRequest } from "next/server";
import { searchJioSaavn } from "@/lib/jiosaavn";
import { searchSpotify } from "@/lib/spotify";
import { MemoryCache } from "@/lib/memoryCache";
import { errorResponse, jsonResponse, optionsResponse, requireApiKey } from "@/lib/apiHttp";

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

function parseLimit(value: string | null) {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return 20;
  return Math.min(50, Math.max(1, parsed));
}

function parseSource(value: string | null): Array<"jio" | "spotify"> {
  const normalized = (value ?? "").trim().toLowerCase();
  if (normalized === "jio") return ["jio"];
  if (normalized === "spotify") return ["spotify"];
  return ["spotify", "jio"];
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
  if (query.length > 120) {
    return errorResponse(req, "Query too long", 400);
  }

  const limit = parseLimit(searchParams.get("limit"));
  const sources = parseSource(searchParams.get("source"));
  const cacheKey = `${query.toLowerCase()}|${limit}|${sources.join(",")}`;

  const cached = searchCache.get(cacheKey);
  if (cached) return jsonResponse(req, cached, { cacheSeconds: 30 });

  try {
    const tasks: Array<Promise<SearchResultItem[]>> = [];
    if (sources.includes("jio")) tasks.push(searchJioSaavn(query) as Promise<SearchResultItem[]>);
    if (sources.includes("spotify")) tasks.push(searchSpotify(query) as Promise<SearchResultItem[]>);

    const settled = await Promise.allSettled(tasks);
    const fulfilled = settled.flatMap((item) => (item.status === "fulfilled" ? item.value : []));

    // If both sources are present, do a simple interleave for variety.
    const jioResults = fulfilled.filter((item) => item.source === "jio");
    const spotifyResults = fulfilled.filter((item) => item.source === "spotify");

    let combined: SearchResultItem[] = [];
    if (sources.length === 2) {
      const maxLen = Math.max(jioResults.length, spotifyResults.length);
      for (let i = 0; i < maxLen; i++) {
        if (spotifyResults[i]) combined.push(spotifyResults[i]);
        if (jioResults[i]) combined.push(jioResults[i]);
      }
    } else {
      combined = fulfilled;
    }

    combined = combined.slice(0, limit);

    searchCache.set(cacheKey, combined);
    return jsonResponse(req, combined, { cacheSeconds: 30 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(req, message, 500);
  }
}
