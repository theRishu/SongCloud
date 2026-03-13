
import axios from 'axios';

const TIDAL_APIS = [
    "https://hifi-one.spotisaver.net",
    "https://hifi-two.spotisaver.net",
    "https://eu-central.monochrome.tf",
    "https://us-west.monochrome.tf",
    "https://api.monochrome.tf"
];

export async function getTidalId(spotifyId: string): Promise<string | null> {
    try {
        const spotifyUrl = `https://open.spotify.com/track/${spotifyId}`;
        const songLinkUrl = `https://api.song.link/v1-alpha.1/links?url=${encodeURIComponent(spotifyUrl)}`;
        const response = await axios.get(songLinkUrl, { timeout: 10_000 });
        
        const tidalLink = response.data.linksByPlatform?.tidal?.url;
        if (!tidalLink) return null;

        const matches = tidalLink.match(/\/track\/(\d+)/);
        return matches ? matches[1] : null;
    } catch (error) {
        console.error('Failed to get Tidal ID:', error);
        return null;
    }
}

export async function getHighQualityStream(tidalId: string, quality: string = 'LOSSLESS'): Promise<string | null> {
    // qualities: HI_RES, LOSSLESS, HIGH, LOW
    for (const api of TIDAL_APIS) {
        try {
            const url = `${api}/track/?id=${tidalId}&quality=${quality}`;
            const response = await axios.get(url, { timeout: 5000 });
            
            // The API might return an array of objects
            const data = response.data;
            if (Array.isArray(data)) {
                for (const item of data) {
                    if (item.OriginalTrackUrl) return item.OriginalTrackUrl;
                }
            } else if (data.data?.manifest) {
                // Handle manifest if needed, but for now looking for direct URLs
                // Most community APIs return the direct URL in v1 or manifest in v2
                return null; // For simplicity, we prioritize direct URLs first
            }
        } catch {
            continue;
        }
    }
    return null;
}
