export const API_VERSION = "1.1.0" as const;

export const API_FEATURES = ["Unified Search", "Trending Charts", "Spotify Playlist Clone", "Song Stream Resolver"] as const;

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
    description: "Search tracks (Spotify + JioSaavn).",
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
    description: "Fetch a Spotify playlist and its tracks (paged).",
  },
  {
    path: "/api/song",
    method: "GET",
    params: ["id", "type?"],
    description: "Resolve a stream URL (if available).",
  },
] as const;
