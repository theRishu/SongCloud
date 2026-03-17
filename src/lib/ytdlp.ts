
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

export type YtDlpResult = {
    title: string;
    url: string;
    duration: number;
    thumbnail: string;
    uploader: string;
    id: string;
};

export async function getBestAudioUrl(query: string): Promise<YtDlpResult | null> {
    try {
        // Search for the best audio matches on YouTube
        // using --dump-json to get metadata
        // yt-search:1 gets the first result
        const command = `yt-dlp "ytsearch1:${query}" --dump-json --format "bestaudio/best" --no-playlist`;
        const { stdout } = await execPromise(command);
        const data = JSON.parse(stdout);

        return {
            title: data.title,
            url: data.url,
            duration: data.duration,
            thumbnail: data.thumbnail,
            uploader: data.uploader,
            id: data.id
        };
    } catch (error) {
        console.error('yt-dlp resolution failed:', error);
        return null;
    }
}

export async function getYtDlpMetadata(query: string, limit: number = 7) {
    try {
        const command = `yt-dlp "ytsearch${limit}:${query}" --dump-json --format "bestaudio/best" --no-playlist`;
        const { stdout } = await execPromise(command);
        
        // yt-dlp returns multiple json objects separated by newline when searching
        const results = stdout.trim().split('\n').map(line => {
            try {
                const data = JSON.parse(line);
                return {
                    id: data.id,
                    title: data.title,
                    subtitle: data.uploader,
                    image: data.thumbnail,
                    url: data.url,
                    duration: data.duration,
                    source: 'youtube'
                };
            } catch {
                return null;
            }
        }).filter(Boolean);

        return results;
    } catch (error) {
        console.error('yt-dlp search failed:', error);
        return [];
    }
}
