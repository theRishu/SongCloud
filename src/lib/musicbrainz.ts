
import axios from 'axios';

const USER_AGENT = 'SongCloud/1.2.0 ( contact@example.com )';

export async function searchMusicBrainz(query: string, limit: number = 10) {
    try {
        const url = `https://musicbrainz.org/ws/2/recording?query=${encodeURIComponent(query)}&fmt=json&limit=${limit}`;
        
        const response = await axios.get(url, {
            headers: { 'User-Agent': USER_AGENT }
        });
        
        const recordings = response.data.recordings || [];
        
        return recordings.map((recording: any) => {
            const releaseId = recording.releases?.[0]?.id;
            return {
                id: recording.id,
                title: recording.title,
                artists: recording['artist-credit']?.[0]?.name || 'Unknown Artist',
                album: recording.releases?.[0]?.title || 'Unknown Album',
                releaseId: releaseId,
                image: releaseId ? `https://coverartarchive.org/release/${releaseId}/front-500` : '',
                source: 'musicbrainz'
            };
        });
    } catch (error) {
        console.error('MusicBrainz search failed:', error);
        return [];
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
