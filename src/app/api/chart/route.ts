import { NextRequest } from "next/server";
import axios from "axios";
import { MemoryCache } from "@/lib/memoryCache";
import { errorResponse, jsonResponse, optionsResponse, requireApiKey } from "@/lib/apiHttp";
import { formatString } from "@/lib/jiosaavn";

export const runtime = "nodejs";

type ChartTrack = {
  id: string;
  title: string;
  subtitle?: string;
  image: string;
  source: "jio";
  url?: string;
};

type ChartResponse = {
  id: string;
  title: string;
  image: string;
  total: number;
  tracks: ChartTrack[];
  truncated: boolean;
};

type JioPlaylistDetailsResponse = {
  listid?: string;
  listname?: string;
  image?: string;
  list_count?: number | string;
  songs?: Array<{
    id?: string;
    song?: string;
    primary_artists?: string;
    image?: string;
    perma_url?: string;
  }>;
};

const chartCache = new MemoryCache<ChartResponse>({ maxEntries: 50, ttlMs: 5 * 60_000 });

function parseLimit(value: string | null) {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(200, Math.max(1, parsed));
}

function normalizeChartId(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 32) return null;
  if (!/^[0-9]+$/.test(trimmed)) return null;
  return trimmed;
}

function normalizeImage(url: string) {
  return url.replace("150x150", "500x500");
}

export function OPTIONS(req: NextRequest) {
  return optionsResponse(req);
}

export async function GET(req: NextRequest) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("id") ?? searchParams.get("listid");
  if (!raw) return errorResponse(req, "Chart ID is required", 400);

  const id = normalizeChartId(raw);
  if (!id) return errorResponse(req, "Invalid chart ID", 400);

  const limit = parseLimit(searchParams.get("limit"));
  const cacheKey = `${id}|${limit}`;
  const cached = chartCache.get(cacheKey);
  if (cached) return jsonResponse(req, cached, { cacheSeconds: 60 });

  try {
    const url = `https://www.jiosaavn.com/api.php?__call=playlist.getDetails&_format=json&_marker=0&cc=in&listid=${id}`;
    const response = await axios.get<JioPlaylistDetailsResponse>(url, {
      timeout: 10_000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
        Accept: "application/json",
      },
    });

    const data = response.data ?? {};
    const songs = Array.isArray(data.songs) ? data.songs : [];

    const normalizedTracks: ChartTrack[] = songs.slice(0, limit).flatMap((song) => {
      if (!song?.id || !song.song || !song.image) return [];
      return [
        {
          id: song.id,
          title: formatString(song.song),
          subtitle: formatString(song.primary_artists ?? ""),
          image: normalizeImage(song.image),
          source: "jio",
          url: typeof song.perma_url === "string" ? song.perma_url : undefined,
        },
      ];
    });

    const totalRaw = data.list_count;
    const totalParsed =
      typeof totalRaw === "number"
        ? totalRaw
        : typeof totalRaw === "string"
          ? Number.parseInt(totalRaw, 10)
          : Number.NaN;
    const total = Number.isFinite(totalParsed) ? totalParsed : songs.length;

    const payload: ChartResponse = {
      id: String(data.listid ?? id),
      title: formatString(data.listname ?? "Chart"),
      image: typeof data.image === "string" ? normalizeImage(data.image) : "",
      total,
      tracks: normalizedTracks,
      truncated: normalizedTracks.length < total,
    };

    chartCache.set(cacheKey, payload);
    return jsonResponse(req, payload, { cacheSeconds: 60 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(req, message, 500);
  }
}

