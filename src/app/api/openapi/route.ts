import { NextRequest } from "next/server";
import { API_VERSION } from "@/lib/apiSpec";
import { jsonResponse, optionsResponse, requireApiKey } from "@/lib/apiHttp";

export const runtime = "nodejs";

export function OPTIONS(req: NextRequest) {
  return optionsResponse(req);
}

export async function GET(req: NextRequest) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  const origin = new URL(req.url).origin;

  const spec = {
    openapi: "3.0.3",
    info: {
      title: "SongCloud API",
      version: API_VERSION,
    },
    servers: [{ url: origin }],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
          description: "Only required if the server sets SONGCLOUD_API_KEY.",
        },
      },
      schemas: {
        ErrorResponse: {
          type: "object",
          additionalProperties: false,
          properties: {
            error: { type: "string" },
          },
          required: ["error"],
        },
        SearchResultItem: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            subtitle: { type: "string" },
            image: { type: "string" },
            source: { type: "string", enum: ["spotify", "jio"] },
            url: { type: "string" },
          },
          required: ["id", "title", "image", "source"],
        },
        TrendingItem: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            subtitle: { type: "string" },
            image: { type: "string" },
          },
          required: ["id", "title", "subtitle", "image"],
        },
        ChartResponse: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            image: { type: "string" },
            total: { type: "integer" },
            tracks: { type: "array", items: { $ref: "#/components/schemas/SearchResultItem" } },
            truncated: { type: "boolean" },
          },
          required: ["id", "title", "image", "total", "tracks", "truncated"],
        },
        PlaylistResponse: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            image: { type: "string" },
            owner: { type: "string" },
            total: { type: "integer" },
            tracks: { type: "array", items: { $ref: "#/components/schemas/SearchResultItem" } },
            truncated: { type: "boolean" },
          },
          required: ["id", "title", "description", "image", "owner", "total", "tracks", "truncated"],
        },
        SongResponse: {
          oneOf: [
            {
              type: "object",
              additionalProperties: true,
              properties: {
                id: { type: "string" },
                title: { type: "string" },
                image: { type: "string" },
                source: { type: "string", enum: ["spotify", "jio"] },
                mediaUrl: { type: "string" },
                duration: { type: "integer" },
                quality: { type: "string" },
                album: { type: "string" },
                artists: { type: "string" },
              },
              required: ["mediaUrl"],
            },
            { $ref: "#/components/schemas/ErrorResponse" },
          ],
        },
      },
    },
    paths: {
      "/api": {
        get: {
          summary: "API index",
          responses: {
            "200": {
              description: "API info",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
        options: { summary: "CORS preflight", responses: { "204": { description: "No content" } } },
      },
      "/api/openapi": {
        get: {
          summary: "OpenAPI schema",
          responses: {
            "200": {
              description: "OpenAPI JSON",
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        },
      },
      "/api/search": {
        get: {
          summary: "Search tracks",
          parameters: [
            { name: "q", in: "query", required: true, schema: { type: "string" } },
            { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 50 } },
            {
              name: "source",
              in: "query",
              required: false,
              schema: { type: "string", enum: ["spotify", "jio", "all"] },
            },
          ],
          responses: {
            "200": {
              description: "Results",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/SearchResultItem" } },
                },
              },
            },
            "400": { description: "Bad request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          },
        },
      },
      "/api/trending": {
        get: {
          summary: "Trending charts",
          parameters: [{ name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 50 } }],
          responses: {
            "200": {
              description: "Charts",
              content: {
                "application/json": {
                  schema: { type: "array", items: { $ref: "#/components/schemas/TrendingItem" } },
                },
              },
            },
          },
        },
      },
      "/api/chart": {
        get: {
          summary: "Fetch a JioSaavn chart and its tracks",
          parameters: [
            { name: "id", in: "query", required: true, schema: { type: "string" } },
            { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 200 } },
          ],
          responses: {
            "200": { description: "Chart", content: { "application/json": { schema: { $ref: "#/components/schemas/ChartResponse" } } } },
            "400": { description: "Bad request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          },
        },
      },
      "/api/playlist": {
        get: {
          summary: "Fetch Spotify playlist (clone)",
          parameters: [
            { name: "id", in: "query", required: true, schema: { type: "string" } },
            { name: "limit", in: "query", required: false, schema: { type: "integer", minimum: 1, maximum: 2000 } },
          ],
          responses: {
            "200": { description: "Playlist", content: { "application/json": { schema: { $ref: "#/components/schemas/PlaylistResponse" } } } },
            "400": { description: "Bad request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
            "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
            "429": { description: "Rate limited", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          },
        },
      },
      "/api/song": {
        get: {
          summary: "Resolve a stream URL",
          parameters: [
            { name: "id", in: "query", required: true, schema: { type: "string" } },
            { name: "type", in: "query", required: false, schema: { type: "string", enum: ["spotify", "jio"] } },
          ],
          responses: {
            "200": { description: "Resolved", content: { "application/json": { schema: { $ref: "#/components/schemas/SongResponse" } } } },
            "400": { description: "Bad request", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
            "404": { description: "Not found", content: { "application/json": { schema: { $ref: "#/components/schemas/ErrorResponse" } } } },
          },
        },
      },
    },
  };

  return jsonResponse(req, spec, { cacheSeconds: 300 });
}
