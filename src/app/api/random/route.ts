import { NextRequest } from "next/server";
import { searchJioSaavn, getSongDetails } from "@/lib/jiosaavn";
import { jsonResponse, errorResponse, optionsResponse, requireApiKey } from "@/lib/apiHttp";

export const runtime = "nodejs";

// A diverse pool of moods/genres to randomly pick from
const RANDOM_QUERIES = [
  "bollywood hits 2024", "arijit singh best songs", "trending hindi songs",
  "punjabi party songs", "lo-fi chill beats", "romantic hindi songs",
  "rap hip hop india", "old classic bollywood", "workout gym songs",
  "midnight vibes songs", "devotional songs", "dance party hits",
  "sufi songs", "indie pop", "soul music", "a r rahman hits",
  "pritam songs", "atif aslam best", "sunidhi chauhan hits",
  "kishore kumar classics", "lata mangeshkar songs", "diljit dosanjh hits",
  "ap dhillon songs", "sidhu moosewala tribute", "shubh songs 2024",
];

export function OPTIONS(req: NextRequest) {
  return optionsResponse(req);
}

export async function GET(req: NextRequest) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  try {
    // Pick a random query from the pool
    const query = RANDOM_QUERIES[Math.floor(Math.random() * RANDOM_QUERIES.length)];

    // Search JioSaavn
    const results = await searchJioSaavn(query);
    if (!results.length) {
      return errorResponse(req, "No songs found", 404);
    }

    // Pick a random result from the top 10 (avoids always getting index 0)
    const pool = results.slice(0, Math.min(10, results.length));
    const picked = pool[Math.floor(Math.random() * pool.length)];

    // Resolve full media URL
    const details = await getSongDetails(picked.id);
    if (!details) {
      return errorResponse(req, "Song details unavailable", 404);
    }

    return jsonResponse(req, {
      id: details.id,
      title: details.title,
      subtitle: details.artists,
      artists: details.artists,
      image: details.image,
      mediaUrl: details.mediaUrl,
      duration: details.duration,
      album: details.album,
      quality: details.quality,
      source: "jio",
      pickedQuery: query,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return errorResponse(req, message, 500);
  }
}
