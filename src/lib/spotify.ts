import axios from 'axios';
import crypto from 'crypto';
import base32Decode from 'base32-decode';
import { MemoryCache } from './memoryCache';

const SPOTIFY_TOTP_SECRET = "GM3TMMJTGYZTQNZVGM4DINJZHA4TGOBYGMZTCMRTGEYDSMJRHE4TEOBUG4YTCMRUGQ4DQOJUGQYTAMRRGA2TCMJSHE3TCMBY";

type SpotifyTokenResponse = {
    accessToken: string;
    clientId: string;
    accessTokenExpirationTimestampMs?: number;
};

type SpotifyClientCredentialsResponse = {
    access_token: string;
    token_type: "Bearer";
    expires_in: number;
};

type SpotifyArtist = { name: string };
type SpotifyImage = { url: string };
type SpotifyAlbum = { name: string; images: SpotifyImage[] };

type SpotifyTrack = {
    id: string;
    name: string;
    artists: SpotifyArtist[];
    album: SpotifyAlbum;
    duration_ms: number;
    explicit: boolean;
    external_urls: {
        spotify: string;
    };
};

type SpotifySearchResponse = {
    tracks: {
        items: SpotifyTrack[];
    };
};

type SpotifyPlaylistMetaResponse = {
    id: string;
    name: string;
    description: string;
    images: SpotifyImage[];
    owner: {
        display_name: string;
    };
    tracks: {
        total: number;
    };
};

type SpotifyPlaylistTracksPageResponse = {
    items: Array<{
        track: SpotifyTrack | null;
    }>;
    next: string | null;
    total: number;
    offset: number;
    limit: number;
};

let cachedSpotifyToken: { accessToken: string; clientId: string; expiresAtMs: number } | null = null;

// Simple TOTP generator
function generateTOTP(secret: string) {
    const key = Buffer.from(base32Decode(secret, 'RFC4648'));
    const epoch = Math.floor(Date.now() / 1000);
    const time = Buffer.alloc(8);
    time.writeBigInt64BE(BigInt(Math.floor(epoch / 30)));

    const hmac = crypto.createHmac('sha1', key);
    hmac.update(time);
    const digest = hmac.digest();

    const offset = digest[digest.length - 1] & 0xf;
    const code = (
        ((digest[offset] & 0x7f) << 24) |
        ((digest[offset + 1] & 0xff) << 16) |
        ((digest[offset + 2] & 0xff) << 8) |
        (digest[offset + 3] & 0xff)
    ) % 1000000;

    return code.toString().padStart(6, '0');
}

export async function getSpotifyToken() {
    const now = Date.now();
    if (cachedSpotifyToken && cachedSpotifyToken.expiresAtMs - 30_000 > now) {
        return { accessToken: cachedSpotifyToken.accessToken, clientId: cachedSpotifyToken.clientId };
    }

    const clientIdEnv = process.env.SPOTIFY_CLIENT_ID;
    const clientSecretEnv = process.env.SPOTIFY_CLIENT_SECRET;
    if (clientIdEnv && clientSecretEnv) {
        const body = new URLSearchParams({ grant_type: "client_credentials" }).toString();
        const auth = Buffer.from(`${clientIdEnv}:${clientSecretEnv}`).toString("base64");
        const response = await axios.post<SpotifyClientCredentialsResponse>("https://accounts.spotify.com/api/token", body, {
            timeout: 10_000,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                Authorization: `Basic ${auth}`,
                Accept: "application/json",
            },
        });

        cachedSpotifyToken = {
            accessToken: response.data.access_token,
            clientId: clientIdEnv,
            expiresAtMs: now + Math.max(1, response.data.expires_in) * 1000,
        };

        return {
            accessToken: response.data.access_token,
            clientId: clientIdEnv,
        };
    }

    const totp = generateTOTP(SPOTIFY_TOTP_SECRET);
    const url = `https://open.spotify.com/api/token?reason=init&productType=web-player&totp=${totp}&totpVer=61&totpServer=${totp}`;
    
    const response = await axios.get<SpotifyTokenResponse>(url, {
        timeout: 10_000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
            'Accept': 'application/json'
        }
    });

    cachedSpotifyToken = {
        accessToken: response.data.accessToken,
        clientId: response.data.clientId,
        expiresAtMs: typeof response.data.accessTokenExpirationTimestampMs === "number"
            ? response.data.accessTokenExpirationTimestampMs
            : now + 30 * 60_000,
    };

    return {
        accessToken: response.data.accessToken,
        clientId: response.data.clientId
    };
}

export async function getSpotifyTrack(id: string) {
    const { accessToken } = await getSpotifyToken();
    const url = `https://api.spotify.com/v1/tracks/${id}`;
    
    const response = await axios.get<SpotifyTrack>(url, {
        timeout: 10_000,
        headers: {
            'Authorization': `Bearer ${accessToken}`
        }
    });

    const track = response.data;
    return {
        id: track.id,
        title: track.name,
        artists: track.artists.map((a) => a.name).join(', '),
        album: track.album.name,
        image: track.album.images[0]?.url ?? "",
        duration: Math.floor(track.duration_ms / 1000),
        isExplicit: track.explicit,
        url: track.external_urls.spotify,
        source: 'spotify'
    };
}

export async function searchSpotify(query: string) {
    try {
        const { accessToken } = await getSpotifyToken();
        const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`;
        
        const response = await axios.get<SpotifySearchResponse>(url, {
            timeout: 10_000,
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        return response.data.tracks.items.map((track) => ({
            id: track.id,
            title: track.name,
            subtitle: track.artists.map((a) => a.name).join(', '),
            image: track.album.images[0]?.url ?? "",
            source: 'spotify'
        }));
    } catch (error) {
        console.error('Spotify search failed:', error);
        return [];
    }
}

export async function getSpotifyPlaylist(playlistId: string, options?: { maxTracks?: number }) {
    const { accessToken } = await getSpotifyToken();
    const maxTracks = Math.max(1, Math.min(2000, options?.maxTracks ?? 1000));

    const metaUrl = `https://api.spotify.com/v1/playlists/${playlistId}?fields=id,name,description,images,owner(display_name),tracks(total)`;

    let data: SpotifyPlaylistMetaResponse;
    try {
        const response = await axios.get<SpotifyPlaylistMetaResponse>(metaUrl, {
            timeout: 10_000,
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        data = response.data;
    } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) return null;
        throw error;
    }

    const total = typeof data.tracks?.total === "number" ? data.tracks.total : 0;

    const tracks: Array<{ id: string; title: string; subtitle: string; image: string; source: "spotify" }> = [];
    const pageSize = 100;
    let offset = 0;

    while (offset < total && tracks.length < maxTracks) {
        const remaining = maxTracks - tracks.length;
        const limit = Math.max(1, Math.min(pageSize, remaining));
        const pageUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}&fields=items(track(id,name,artists(name),album(name,images(url)))),next,total,offset,limit`;

        let page: SpotifyPlaylistTracksPageResponse;
        try {
            const response = await axios.get<SpotifyPlaylistTracksPageResponse>(pageUrl, {
                timeout: 10_000,
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            });
            page = response.data;
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) return null;
            throw error;
        }

        for (const item of page.items ?? []) {
            const track = item.track;
            if (!track?.id) continue;
            tracks.push({
                id: track.id,
                title: track.name,
                subtitle: track.artists.map((a) => a.name).join(', '),
                image: track.album.images[0]?.url ?? "",
                source: 'spotify'
            });
        }

        offset += page.limit || limit;
        if (!page.next) break;
    }

    return {
        id: data.id,
        title: data.name,
        description: data.description,
        image: data.images[0]?.url ?? "",
        owner: data.owner.display_name,
        total,
        tracks,
        truncated: tracks.length < total,
    };
}

const trackMetaCache = new MemoryCache<any>({ maxEntries: 1000, ttlMs: 24 * 60 * 60_000 }); // 24 hour cache

export async function getSpotifyTracks(ids: string[]) {
    if (ids.length === 0) return [];
    
    // Check cache first
    const results: any[] = [];
    const missingIds: string[] = [];
    
    for (const id of ids) {
        const cached = trackMetaCache.get(id);
        if (cached) results.push(cached);
        else missingIds.push(id);
    }
    
    if (missingIds.length === 0) return results;

    const { accessToken } = await getSpotifyToken().catch(() => ({ accessToken: null }));
    if (!accessToken) return results;
    
    // Batch missing in 50s
    const chunks = [];
    for (let i = 0; i < missingIds.length; i += 50) {
        chunks.push(missingIds.slice(i, i + 50));
    }

    const fetchedTracks: any[] = [];
    for (const chunk of chunks) {
        try {
            const url = `https://api.spotify.com/v1/tracks?ids=${chunk.join(',')}`;
            const response = await axios.get(url, {
                timeout: 5000,
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            const tracks = response.data.tracks.filter((t: any) => t !== null).map((track: any) => {
                const meta = {
                    id: track.id,
                    title: track.name,
                    subtitle: track.artists.map((a: any) => a.name).join(', '),
                    image: track.album.images[0]?.url || track.album.images[1]?.url || "",
                    source: 'spotify'
                };
                trackMetaCache.set(track.id, meta);
                return meta;
            });
            fetchedTracks.push(...tracks);
        } catch (e) {
            console.warn("Spotify batch metadata failed for a chunk.");
        }
    }
    return [...results, ...fetchedTracks];
}

export async function scrapeSpotifyPlaylist(playlistId: string) {
    const url = `https://open.spotify.com/embed/playlist/${playlistId}`;
    const response = await axios.get(url, {
        timeout: 10_000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
        }
    });

    const html = response.data;
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!match) return null;

    try {
        const data = JSON.parse(match[1]);
        const entity = data.props.pageProps.state.data.entity;
        const playlistImage = entity.coverArt?.sources?.[0]?.url ?? "";
        
        const trackList = entity.trackList || [];
        const trackIds = trackList.map((item: any) => item.uri.split(':').pop());

        // INCREASED LIMIT: Boost first 100 tracks (most common playlist size)
        // With the new trackMetaCache, subsequent fetches for same tracks are instant
        const boostedMetadata = await getSpotifyTracks(trackIds.slice(0, 100)).catch(() => []);
        const metadataMap = new Map(boostedMetadata.map((t: any) => [t.id, t]));

        const tracks = await Promise.all(trackList.map(async (item: any, index: number) => {
            const trackId = item.uri.split(':').pop();
            const boosted = metadataMap.get(trackId);
            
            let finalImage = boosted?.image || playlistImage;

            // EMERGENCY FALLBACK: Increased to 30 tracks for deeper unique coverage when API fails
            if (finalImage === playlistImage && index < 30) {
                try {
                    const { searchJioSaavn } = await import("./jiosaavn");
                    const searchRes = await searchJioSaavn(`${item.title} ${item.subtitle}`);
                    if (searchRes?.[0]?.image) {
                        finalImage = searchRes[0].image;
                        // Cache this fallback too!
                        trackMetaCache.set(trackId, { 
                            id: trackId, 
                            title: item.title, 
                            subtitle: item.subtitle, 
                            image: finalImage, 
                            source: 'spotify' 
                        });
                    }
                } catch (e) {}
            }

            return {
                id: trackId,
                title: boosted?.title || item.title,
                subtitle: boosted?.subtitle || item.subtitle,
                image: finalImage,
                source: 'spotify'
            };
        }));

        return {
            id: entity.id,
            title: entity.title,
            description: entity.subtitle,
            image: playlistImage,
            owner: entity.authors?.[0]?.name ?? "Spotify",
            total: trackList.length,
            tracks,
            truncated: false,
            scraped: true
        };
    } catch (e) {
        console.error("Scraper failed to parse JSON:", e);
        return null;
    }
}



export async function getSpotifyPlaylistHybrid(playlistId: string, options?: { maxTracks?: number }) {
    // 1. Always try scraper first (Fastest, zero rate limit risk)
    let playlist: any = await scrapeSpotifyPlaylist(playlistId).catch(() => null);
    
    const limit = options?.maxTracks ?? 1000;
    const currentCount = playlist?.tracks?.length ?? 0;
    const totalCount = playlist?.total ?? 0;

    // 2. If scraper is missing tracks and we want more than just the first batch, use API booster
    if (!playlist || (totalCount > currentCount && limit > currentCount)) {
        try {
            const apiData = await getSpotifyPlaylist(playlistId, options);
            if (apiData) {
                // If we already had scraper data, merge them to keep unique images from scraper if API fails metadata
                if (playlist) {
                    playlist = {
                        ...apiData,
                        tracks: apiData.tracks.map((t: any) => {
                            const scraped = playlist.tracks.find((st: any) => st.id === t.id);
                            return scraped ? { ...t, image: scraped.image || t.image } : t;
                        })
                    };
                } else {
                    playlist = apiData;
                }
            }
        } catch (e) {
            console.warn("Spotify API booster failed, staying with scraper/null.");
        }
    }

    return playlist;
}
