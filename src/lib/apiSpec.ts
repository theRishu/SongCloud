export const API_VERSION = "1.2.0" as const;

export const API_FEATURES = ["JioSaavn Search", "Trending Charts", "Spotify Playlist Scraper", "Song Stream Resolver", "Spotify Bulk Downloader"] as const;

export const API_ENDPOINTS = [
  {
    path: "/api",
    method: "GET",
    description: "API index (this document).",
  },
  {
    path: "/api/openapi",
    method: "GET",
    description: "OpenAPI 3 schema for generating clients.",
  },
  {
    path: "/api/search",
    method: "GET",
    params: ["q", "limit?", "source?"],
    description: "Search tracks (JioSaavn only; source accepted for compatibility).",
  },
  {
    path: "/api/trending",
    method: "GET",
    params: ["limit?"],
    description: "Top charts (normalized).",
  },
  {
    path: "/api/chart",
    method: "GET",
    params: ["id", "limit?"],
    description: "Fetch a JioSaavn chart (playlist) and its tracks.",
  },
  {
    path: "/api/playlist",
    method: "GET",
    params: ["id", "limit?"],
    description: "Fetch a Spotify playlist via scraper.",
  },
  {
    path: "/api/spotify-download/[id]",
    method: "GET",
    params: ["id (Playlist ID)"],
    description: "Fetch a Spotify playlist with direct download links. Path-based version avoids terminal parse errors.",
  },
  {
    path: "/api/random",
    method: "GET",
    description: "Returns a random ready-to-play song (JioSaavn). Great for shuffle/discovery.",
  },
  {
    path: "/api/song",
    method: "GET",
    params: ["id", "type?"],
    description: "Resolve a stream URL (if available).",
  },
] as const;
