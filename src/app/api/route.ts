import { NextRequest, NextResponse } from "next/server";
import { API_ENDPOINTS, API_FEATURES, API_VERSION } from "@/lib/apiSpec";
import { jsonResponse, optionsResponse, requireApiKey, corsHeaders } from "@/lib/apiHttp";

export const runtime = "nodejs";

export function OPTIONS(req: NextRequest) {
  return optionsResponse(req);
}

export async function GET(req: NextRequest) {
  const auth = requireApiKey(req);
  if (auth) return auth;

  const accept = req.headers.get("accept") || "";
  
  // If request is from a browser, show beautiful HTML docs
  if (accept.includes("text/html")) {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SongCloud API Documentation</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #0f172a;
            --card: #1e293b;
            --primary: #a78bfa;
            --text: #f8fafc;
            --text-dim: #94a3b8;
        }
        body {
            font-family: 'Inter', sans-serif;
            background: var(--bg);
            color: var(--text);
            margin: 0;
            padding: 2rem;
            line-height: 1.6;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
        }
        header {
            margin-bottom: 3rem;
            text-align: center;
        }
        h1 {
            font-size: 3rem;
            font-weight: 800;
            margin: 0;
            background: linear-gradient(135deg, #fff 0%, var(--primary) 100%);
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .version {
            color: var(--primary);
            font-weight: 600;
            background: rgba(167, 139, 250, 0.1);
            padding: 0.2rem 0.6rem;
            border-radius: 0.4rem;
            font-size: 0.9rem;
        }
        .features {
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
            justify-content: center;
            margin-top: 1rem;
        }
        .feature-tag {
            background: var(--card);
            padding: 0.4rem 1rem;
            border-radius: 2rem;
            font-size: 0.85rem;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .endpoint-card {
            background: var(--card);
            border-radius: 1rem;
            padding: 1.5rem;
            margin-bottom: 1.5rem;
            border: 1px solid rgba(255,255,255,0.05);
            transition: transform 0.2s;
        }
        .endpoint-card:hover {
            transform: translateY(-2px);
            border-color: var(--primary);
        }
        .method {
            background: #10b981;
            color: #000;
            font-weight: 800;
            padding: 0.2rem 0.5rem;
            border-radius: 0.3rem;
            font-size: 0.8rem;
            margin-right: 0.5rem;
        }
        .path {
            font-family: monospace;
            font-size: 1.1rem;
            color: var(--primary);
        }
        .description {
            margin-top: 0.5rem;
            color: var(--text-dim);
        }
        .params {
            margin-top: 1rem;
            font-size: 0.9rem;
        }
        .param-tag {
            background: rgba(0,0,0,0.3);
            padding: 0.2rem 0.5rem;
            border-radius: 0.3rem;
            margin-right: 0.4rem;
        }
        footer {
            margin-top: 4rem;
            text-align: center;
            color: var(--text-dim);
            font-size: 0.9rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>SongCloud API <span class="version">v${API_VERSION}</span></h1>
            <div class="features">
                ${API_FEATURES.map(f => `<span class="feature-tag">${f}</span>`).join('')}
            </div>
        </header>

        <div class="endpoints">
            ${API_ENDPOINTS.map(e => `
                <div class="endpoint-card">
                    <div>
                        <span class="method">${e.method}</span>
                        <span class="path">${e.path}</span>
                    </div>
                    <div class="description">${e.description}</div>
                    ${(e as any).params ? `
                        <div class="params">
                            <strong>Params:</strong>
                            ${(e as any).params.map((p: string) => `<span class="param-tag">${p}</span>`).join('')}
                        </div>
                    ` : ''}
                </div>
            `).join('')}
        </div>

        <footer>
            Running on port ${process.env.PORT || 8086} • SongCloud Music Service
        </footer>
    </div>
</body>
</html>
    `;
    return new NextResponse(html, {
      headers: {
        ...corsHeaders(req),
        "Content-Type": "text/html",
      }
    });
  }

  // Fallback to JSON for programmatic access
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
