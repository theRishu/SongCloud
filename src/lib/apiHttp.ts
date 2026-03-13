import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

type JsonInit = {
  status?: number;
  headers?: HeadersInit;
  cacheSeconds?: number;
};

function getCorsOrigin(req: NextRequest | null) {
  const configured = (process.env.SONGCLOUD_CORS_ORIGIN ?? "*").trim();
  if (!configured || configured === "*") return "*";

  const origin = req?.headers.get("origin");
  return origin && origin === configured ? origin : configured;
}

export function corsHeaders(req: NextRequest | null) {
  const origin = getCorsOrigin(req);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, X-API-Key",
    "Access-Control-Expose-Headers": "Retry-After",
  };

  if (origin !== "*") headers.Vary = "Origin";
  return headers;
}

export function optionsResponse(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req) });
}

export function jsonResponse<T>(req: NextRequest | null, data: T, init?: JsonInit) {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(corsHeaders(req))) {
    headers.set(key, value);
  }

  if (!headers.has("Cache-Control")) {
    const seconds = init?.cacheSeconds;
    headers.set("Cache-Control", seconds && seconds > 0 ? `public, max-age=${seconds}` : "no-store");
  }

  headers.set("X-Content-Type-Options", "nosniff");

  return NextResponse.json(data, { status: init?.status ?? 200, headers });
}

export function errorResponse(req: NextRequest | null, message: string, status = 500, init?: Omit<JsonInit, "status">) {
  return jsonResponse(req, { error: message }, { ...init, status });
}

function timingSafeEqualString(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function requireApiKey(req: NextRequest) {
  const required = process.env.SONGCLOUD_API_KEY;
  if (!required) return null;

  const provided = req.headers.get("x-api-key") ?? new URL(req.url).searchParams.get("api_key") ?? "";
  if (!provided) return errorResponse(req, "Missing API key", 401);
  if (!timingSafeEqualString(provided, required)) return errorResponse(req, "Invalid API key", 401);

  return null;
}
