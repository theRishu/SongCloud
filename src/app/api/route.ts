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
  const origin = req.nextUrl.origin;
  
  // If request is from a browser, show beautiful HTML docs
  if (accept.includes("text/html")) {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SongCloud API Reference</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #0b0e14;
            --card: #151921;
            --card-hover: #1c232e;
            --primary: #a78bfa;
            --primary-glow: rgba(167, 139, 250, 0.15);
            --text: #f8fafc;
            --text-dim: #94a3b8;
            --code-bg: #000000;
            --green: #10b981;
        }
        body {
            font-family: 'Inter', sans-serif;
            background: var(--bg);
            color: var(--text);
            margin: 0;
            padding: 0;
            line-height: 1.6;
        }
        .container {
            max-width: 1000px;
            margin: 0 auto;
            padding: 4rem 2rem;
        }
        header {
            margin-bottom: 5rem;
            text-align: center;
        }
        h1 {
            font-size: 3.5rem;
            font-weight: 800;
            margin: 0;
            background: linear-gradient(135deg, #fff 0%, var(--primary) 100%);
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
            letter-spacing: -0.02em;
        }
        .version {
            color: var(--primary);
            font-weight: 700;
            background: var(--primary-glow);
            padding: 0.25rem 0.75rem;
            border-radius: 0.5rem;
            font-size: 1rem;
            vertical-align: middle;
            border: 1px solid rgba(167, 139, 250, 0.2);
        }
        .features {
            display: flex;
            gap: 0.75rem;
            flex-wrap: wrap;
            justify-content: center;
            margin-top: 1.5rem;
        }
        .feature-tag {
            background: var(--card);
            padding: 0.5rem 1.25rem;
            border-radius: 2rem;
            font-size: 0.85rem;
            font-weight: 500;
            border: 1px solid rgba(255,255,255,0.05);
            color: var(--text-dim);
        }
        .section-title {
            font-size: 1.5rem;
            font-weight: 700;
            margin-bottom: 2rem;
            color: var(--text);
            display: flex;
            align-items: center;
            gap: 0.75rem;
        }
        .section-title::after {
            content: '';
            flex: 1;
            height: 1px;
            background: rgba(255,255,255,0.05);
        }
        .endpoint-card {
            background: var(--card);
            border-radius: 1.25rem;
            padding: 2rem;
            margin-bottom: 2.5rem;
            border: 1px solid rgba(255,255,255,0.03);
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
        }
        .method {
            background: var(--green);
            color: #000;
            font-weight: 800;
            padding: 0.3rem 0.6rem;
            border-radius: 0.4rem;
            font-size: 0.75rem;
            text-transform: uppercase;
        }
        .path {
            font-family: 'JetBrains Mono', monospace;
            font-size: 1.15rem;
            color: var(--primary);
            font-weight: 600;
            margin-left: 0.5rem;
        }
        .description {
            margin: 1.25rem 0;
            font-size: 1.05rem;
            color: var(--text-dim);
        }
        .example-label {
            font-size: 0.8rem;
            text-transform: uppercase;
            color: var(--primary);
            font-weight: 700;
            margin-bottom: 0.75rem;
            display: block;
        }
        .code-block {
            background: var(--code-bg);
            padding: 1.25rem;
            border-radius: 0.75rem;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.9rem;
            overflow-x: auto;
            border: 1px solid rgba(255,255,255,0.05);
            color: #e2e8f0;
            position: relative;
        }
        .code-block code {
            display: block;
            white-space: pre;
        }
        .param-info {
            margin-top: 1.5rem;
            padding-top: 1.5rem;
            border-top: 1px solid rgba(255,255,255,0.05);
        }
        .param-row {
            display: flex;
            gap: 1rem;
            margin-bottom: 0.5rem;
            font-size: 0.9rem;
        }
        .param-name {
            color: var(--primary);
            font-family: 'JetBrains Mono', monospace;
            min-width: 80px;
        }
        .footer {
            margin-top: 6rem;
            text-align: center;
            color: var(--text-dim);
            font-size: 0.85rem;
            padding-bottom: 4rem;
        }
        .curl-cmd {
            color: #6ee7b7;
        }
        .url-val {
            color: #fbbf24;
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>SongCloud API <span class="version">v${API_VERSION}</span></h1>
            <p style="color: var(--text-dim); margin-top: 1rem;">Professional music metadata and bulk download service.</p>
            <div class="features">
                ${API_FEATURES.map(f => `<span class="feature-tag">${f}</span>`).join('')}
            </div>
        </header>

        <h2 class="section-title">Core Endpoints</h2>

        <div class="endpoints">
            ${API_ENDPOINTS.map(e => `
                <div class="endpoint-card">
                    <div style="display: flex; align-items: center; justify-content: space-between;">
                        <div>
                            <span class="method">${e.method}</span>
                            <span class="path">${e.path}</span>
                        </div>
                    </div>
                    
                    <div class="description">${e.description}</div>

                    <div class="example-area">
                        <span class="example-label">Example Usage</span>
                        <div class="code-block">
                            <span class="curl-cmd">curl</span> -X ${e.method} <span class="url-val">"${origin}${e.path.replace('[id]', '7fkJX86BHX6qDGdaulfMHa').replace('[source]', 'spotify')}"</span>
                        </div>
                    </div>

                    ${(e as any).params ? `
                        <div class="param-info">
                            <span class="example-label">Query Parameters</span>
                            ${(e as any).params.map((p: string) => `
                                <div class="param-row">
                                    <span class="param-name">${p}</span>
                                    <span style="color: var(--text-dim)">${p.endsWith('?') ? 'Optional' : 'Required'} parameter for track resolution.</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `).join('')}
        </div>

        <section style="margin-top: 4rem; background: var(--card); padding: 2.5rem; border-radius: 1.5rem; border: 1px solid var(--primary-glow);">
            <h3 style="margin-top: 0; color: var(--primary);">🚀 Pro Tip: Bulk Downloading</h3>
            <p>Our <strong>/api/spotify-download</strong> endpoint returns a <code>bashScript</code> field. You can execute this string directly in your terminal to download entire playlists as MP3s in seconds.</p>
            <div class="code-block">
                sh -c "$(curl -s "${origin}/api/spotify-download/7fkJX86BHX6qDGdaulfMHa" | jq -r .bashScript)"
            </div>
        </section>

        <div class="footer">
            Built for High-Speed Music Discovery • Running on Port ${process.env.PORT || 8086}
        </div>
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
