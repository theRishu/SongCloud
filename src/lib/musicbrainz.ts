
import axios from 'axios';

const USER_AGENT = 'SongCloud/1.2.0 ( contact@example.com )';

export async function searchMusicBrainz(title: string, artist: string) {
    try {
        const query = `recording:"${title}" AND artist:"${artist}"`;
        const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=1`;
        
        const response = await axios.get(url, {
            headers: { 'User-Agent': USER_AGENT }
        });
        
        const recording = response.data.recordings?.[0];
        if (!recording) return null;

        return {
            mbid: recording.id,
            title: recording.title,
            artist: recording['artist-credit']?.[0]?.name,
            album: recording.releases?.[0]?.title,
            releaseId: recording.releases?.[0]?.id,
        };
    } catch (error) {
        console.error('MusicBrainz search failed:', error);
        return null;
    }
}

export async function getCoverArt(releaseMbid: string) {
    try {
        const url = `https://coverartarchive.org/release/${releaseMbid}`;
        const response = await axios.get(url);
        return response.data.images?.[0]?.image ?? null;
    } catch {
        // Many releases don't have cover art in CAA
        return null;
    }
}
