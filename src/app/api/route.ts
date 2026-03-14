
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
  
  if (accept.includes("text/html")) {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SongCloud API | High Fidelity Music Engine</title>
    <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg: #050505;
            --surface: #0f0f12;
            --surface-hover: #15151a;
            --primary: #8b5cf6;
            --accent: #d946ef;
            --text: #ffffff;
            --text-dim: #94a3b8;
            --green: #10b981;
            --blue: #3b82f6;
        }
        * { box-sizing: border-box; }
        body {
            font-family: 'Outfit', sans-serif;
            background: var(--bg);
            color: var(--text);
            margin: 0;
            padding: 0;
            line-height: 1.6;
            overflow-x: hidden;
        }
        .glow-bg {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: 
                radial-gradient(circle at 10% 10%, rgba(139, 92, 246, 0.05) 0%, transparent 40%),
                radial-gradient(circle at 90% 90%, rgba(217, 70, 239, 0.05) 0%, transparent 40%);
            z-index: -1;
        }
        .container {
            max-width: 1100px;
            margin: 0 auto;
            padding: 6rem 1.5rem;
        }
        header {
            margin-bottom: 6rem;
            text-align: center;
        }
        .badge {
            display: inline-block;
            background: rgba(139, 92, 246, 0.1);
            color: var(--primary);
            padding: 0.5rem 1.5rem;
            border-radius: 3rem;
            font-weight: 700;
            font-size: 0.85rem;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            border: 1px solid rgba(139, 92, 246, 0.2);
            margin-bottom: 2rem;
            animation: fadeInDown 0.8s ease-out;
        }
        h1 {
            font-size: 4.5rem;
            font-weight: 800;
            margin: 0;
            line-height: 1;
            background: linear-gradient(135deg, #fff 0%, #a5b4fc 50%, #c084fc 100%);
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
            letter-spacing: -0.04em;
            animation: scaleIn 1s cubic-bezier(0.165, 0.84, 0.44, 1);
        }
        .hero-desc {
            color: var(--text-dim);
            font-size: 1.25rem;
            margin-top: 1.5rem;
            max-width: 600px;
            margin-left: auto;
            margin-right: auto;
            animation: fadeInUp 1s ease-out 0.2s both;
        }
        .features {
            display: flex;
            gap: 1rem;
            flex-wrap: wrap;
            justify-content: center;
            margin-top: 3rem;
            animation: fadeInUp 1s ease-out 0.4s both;
        }
        .feature-tag {
            background: rgba(255, 255, 255, 0.03);
            padding: 0.6rem 1.25rem;
            border-radius: 0.75rem;
            font-size: 0.95rem;
            font-weight: 500;
            border: 1px solid rgba(255,255,255,0.05);
            color: #cbd5e1;
            backdrop-filter: blur(10px);
        }
        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
            gap: 2rem;
            margin-top: 5rem;
        }
        .endpoint-card {
            background: var(--surface);
            border-radius: 1.5rem;
            padding: 2.5rem;
            border: 1px solid rgba(255,255,255,0.05);
            transition: all 0.4s cubic-bezier(0.23, 1, 0.32, 1);
            position: relative;
            overflow: hidden;
        }
        .endpoint-card:hover {
            transform: translateY(-8px);
            border-color: rgba(139, 92, 246, 0.3);
            box-shadow: 0 30px 60px -12px rgba(0,0,0,0.5);
        }
        .method {
            font-weight: 800;
            padding: 0.4rem 0.8rem;
            border-radius: 0.5rem;
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }
        .method.get { background: var(--green); color: #000; }
        .path {
            font-family: 'JetBrains Mono', monospace;
            font-size: 1.1rem;
            color: #fff;
            font-weight: 600;
            margin-left: 0.75rem;
        }
        .card-desc {
            margin: 1.5rem 0;
            font-size: 1rem;
            color: var(--text-dim);
            min-height: 3rem;
        }
        .code-snippet {
            background: #000;
            padding: 1.25rem;
            border-radius: 1rem;
            font-family: 'JetBrains Mono', monospace;
            font-size: 0.85rem;
            border: 1px solid rgba(255,255,255,0.05);
            color: #94a3b8;
        }
        .curl { color: var(--primary); font-weight: 700; }
        .val { color: #e2e8f0; }

        .pro-banner {
            margin-top: 6rem;
            background: linear-gradient(135deg, rgba(139, 92, 246, 0.1) 0%, rgba(217, 70, 239, 0.1) 100%);
            padding: 3rem;
            border-radius: 2rem;
            border: 1px solid rgba(139, 92, 246, 0.2);
            text-align: left;
            position: relative;
            overflow: hidden;
        }
        .pro-tag {
            background: var(--primary);
            color: #fff;
            padding: 0.25rem 0.75rem;
            border-radius: 0.5rem;
            font-size: 0.7rem;
            font-weight: 800;
            vertical-align: middle;
            margin-right: 0.5rem;
        }
        
        @keyframes scaleIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes fadeInUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes fadeInDown { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

        @media (max-width: 768px) {
            h1 { font-size: 2.5rem; }
            .container { padding-top: 4rem; }
        }
    </style>
</head>
<body>
    <div class="glow-bg"></div>
    <div class="container">
        <header>
            <span class="badge">API Version ${API_VERSION}</span>
            <h1>SongCloud Engine</h1>
            <p class="hero-desc">The ultimate bridge between platforms. High-fidelity streams, official metadata enrichment, and zero-throttled bulk downloader.</p>
            <div class="features">
                ${API_FEATURES.map(f => `<span class="feature-tag">${f}</span>`).join('')}
            </div>
        </header>

        <h2 style="font-size: 2rem; font-weight: 700; margin-bottom: 2rem;">Global Endpoints</h2>

        <div class="grid">
            ${API_ENDPOINTS.map(e => `
                <div class="endpoint-card">
                    <div style="display: flex; align-items: center;">
                        <span class="method get">${e.method}</span>
                        <span class="path">${e.path}</span>
                    </div>
                    <div class="card-desc">${e.description}</div>
                    <div class="code-snippet">
                        <span class="curl">curl</span> -G <span class="val">"${origin}${e.path.replace('[id]', '7fkJX86BHX6qDGdaulfMHa')}"</span>
                    </div>
                </div>
            `).join('')}
        </div>

        <section class="pro-banner">
            <h3 style="margin: 0; font-size: 1.8rem;"><span class="pro-tag">HYBRID ENGINE</span> Deep Sync Architecture</h3>
            <p style="color: var(--text-dim); margin: 1.5rem 0 2rem 0; max-width: 700px;">
                Our engine uses a <strong>Hybrid Scraper + API Resolver</strong>. This ensures zero-throttling on large playlists while maintaining official high-res artwork.
            </p>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-top: 2rem;">
                <div style="background: rgba(255,255,255,0.03); padding: 1.5rem; border-radius: 1rem; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="color: var(--primary); font-weight: 800; margin-bottom: 0.5rem;">META BOOST</div>
                    <div style="font-size: 0.85rem; color: var(--text-dim);">Deep lookups for up to 100 tracks per request. Official titles, unique covers, and cross-platform artist mapping.</div>
                </div>
                <div style="background: rgba(255,255,255,0.03); padding: 1.5rem; border-radius: 1rem; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="color: var(--accent); font-weight: 800; margin-bottom: 0.5rem;">AUTO-SYNCHRONIZE</div>
                    <div style="font-size: 0.85rem; color: var(--text-dim);">Cloned playlists inherit all enriched metadata. Synced libraries stay high-fidelity even when offline.</div>
                </div>
                <div style="background: rgba(255,255,255,0.03); padding: 1.5rem; border-radius: 1rem; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="color: var(--green); font-weight: 800; margin-bottom: 0.5rem;">STRICT HQ</div>
                    <div style="font-size: 0.85rem; color: var(--text-dim);">Aggressive 30-second preview block. Forcing only FLAC or 320kbps streams for the ultimate audio experience.</div>
                </div>
            </div>
        </section>

        <section style="margin-top: 4rem; padding: 2.5rem; background: var(--surface); border-radius: 1.5rem; border: 1px solid rgba(255,255,255,0.05);">
            <h3 style="margin: 0 0 1.5rem 0; font-size: 1.5rem;">How it works (Technical Flow)</h3>
            <div style="font-family: 'JetBrains Mono', monospace; font-size: 0.9rem; color: #94a3b8; line-height: 1.8;">
                <div style="margin-bottom: 1rem;">1. <span style="color: #fff;">Scrape:</span> Playlist structure is extracted via embed-player bypass to avoid 429s.</div>
                <div style="margin-bottom: 1rem;">2. <span style="color: #fff;">Enrich:</span> IDs are verified against Spotify & MusicBrainz for Hi-Res Art and Official MBIDs.</div>
                <div style="margin-bottom: 1rem;">3. <span style="color: #fff;">Resolve:</span> Audio is sourced from Tidal (LOSSLESS) or JioSaavn (320kbps).</div>
                <div>4. <span style="color: #fff;">Secure:</span> Preview URLs from Spotify are strictly filtered and discarded.</div>
            </div>
        </section>

        <footer style="margin-top: 6rem; text-align: center; color: var(--text-dim); font-size: 0.9rem; opacity: 0.6;">
            &copy; 2026 SongCloud • Multi-Source Audio Engine • Port 8086
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

  return jsonResponse(req, {
    service: "SongCloud API",
    version: API_VERSION,
    features: API_FEATURES,
    endpoints: API_ENDPOINTS,
    meta: { status: "active", engine: "V15-Turbo" }
  }, { cacheSeconds: 60 });
}
