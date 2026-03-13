import { NextRequest } from "next/server";
import { API_ENDPOINTS, API_FEATURES, API_VERSION } from "@/lib/apiSpec";
import { jsonResponse, optionsResponse, requireApiKey } from "@/lib/apiHttp";

export const runtime = "nodejs";

export function OPTIONS(req: NextRequest) {
  return optionsResponse(req);
}

export async function GET(req: NextRequest) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  return jsonResponse(
    req,
    {
      service: "SongCloud API",
      version: API_VERSION,
      port: Number(process.env.PORT || 8086),
      features: API_FEATURES,
      endpoints: API_ENDPOINTS,
    },
    { cacheSeconds: 60 }
  );
}
