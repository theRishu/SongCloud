
import axios from 'axios';
import crypto from 'crypto';
import base32Decode from 'base32-decode';

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
