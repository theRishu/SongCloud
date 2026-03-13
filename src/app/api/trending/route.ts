import { NextRequest } from "next/server";
import axios from "axios";
import { MemoryCache } from "@/lib/memoryCache";
import { errorResponse, jsonResponse, optionsResponse, requireApiKey } from "@/lib/apiHttp";

export const runtime = "nodejs";

type TrendingItem = {
  id: string;
  title: string;
  subtitle: string;
  image: string;
};

const trendingCache = new MemoryCache<TrendingItem[]>({ maxEntries: 5, ttlMs: 5 * 60_000 });

function parseLimit(value: string | null) {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return 15;
  return Math.min(50, Math.max(1, parsed));
}

function normalizeTrending(data: unknown): TrendingItem[] {
  if (!Array.isArray(data)) return [];

  const mapped: TrendingItem[] = [];
  for (const chart of data) {
    if (!chart || typeof chart !== "object") continue;
    const obj = chart as Record<string, unknown>;
    const id = obj.listid ?? obj.id;
    const title = obj.title ?? obj.name ?? obj.listname;
    const image = obj.image;

    if ((typeof id !== "string" && typeof id !== "number") || typeof title !== "string" || typeof image !== "string") {
      continue;
    }

    mapped.push({
      id: String(id),
      title,
      subtitle: "Top Chart",
      image: image.replace("150x150", "500x500"),
    });
  }
  return mapped;
}

export function OPTIONS(req: NextRequest) {
  return optionsResponse(req);
}

export async function GET(req: NextRequest) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams.get("limit"));

  const cached = trendingCache.get("charts");
  if (cached) {
    return jsonResponse(req, cached.slice(0, limit), { cacheSeconds: 60 });
  }

  try {
    const url = `https://www.jiosaavn.com/api.php?__call=content.getCharts&_format=json&_marker=0&cc=in`;
    const response = await axios.get(url, {
      timeout: 10_000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
    });

    const normalized = normalizeTrending(response.data);
    trendingCache.set("charts", normalized);
    return jsonResponse(req, normalized.slice(0, limit), { cacheSeconds: 60 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(req, message, 500);
  }
}
