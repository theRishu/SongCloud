import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

// Hard cap so one yt-dlp call never hangs the server
const YT_DLP_TIMEOUT_MS = 12_000;

export type YtDlpResult = {
  title: string;
  url: string;
  duration: number;
  thumbnail: string;
  uploader: string;
  id: string;
};

/** Wraps a promise with a ms timeout — resolves to null on timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, label = 'operation'): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) =>
      setTimeout(() => { console.warn(`[yt-dlp] ${label} timed out after ${ms}ms`); resolve(null); }, ms)
    ),
  ]);
}

/**
 * Resolves the single best audio URL from YouTube for a given query.
 * Uses --get-url instead of --dump-json for faster turnaround.
 */
export async function getBestAudioUrl(query: string): Promise<YtDlpResult | null> {
  const work = (async () => {
    try {
      // Fetch only what we need: one match, best audio, no playlist
      const jsonCmd = `yt-dlp "ytsearch1:${query.replace(/"/g, '')}" --dump-json --format "bestaudio[ext=m4a]/bestaudio/best" --no-playlist --no-warnings --socket-timeout 8`;
      const { stdout } = await execPromise(jsonCmd, { timeout: YT_DLP_TIMEOUT_MS });
      const trimmed = stdout.trim();
      if (!trimmed) return null;
      const data = JSON.parse(trimmed);
      return {
        title: data.title as string,
        url: data.url as string,
        duration: data.duration as number,
        thumbnail: (data.thumbnail || data.thumbnails?.[0]?.url || '') as string,
        uploader: (data.uploader || data.channel || '') as string,
        id: data.id as string,
      };
    } catch (error) {
      console.error('[yt-dlp] getBestAudioUrl failed:', (error as Error).message?.slice(0, 120));
      return null;
    }
  })();

  return withTimeout(work, YT_DLP_TIMEOUT_MS, `getBestAudioUrl(${query.slice(0, 40)})`);
}

/**
 * Gets metadata for multiple YouTube results in ONE yt-dlp call.
 * Much faster than calling getBestAudioUrl repeatedly.
 */
export async function getYtDlpMetadata(query: string, limit = 7) {
  const work = (async () => {
    try {
      const safeQuery = query.replace(/"/g, '');
      const command = `yt-dlp "ytsearch${limit}:${safeQuery}" --dump-json --format "bestaudio[ext=m4a]/bestaudio/best" --no-playlist --no-warnings --flat-playlist --socket-timeout 8`;
      const { stdout } = await execPromise(command, { timeout: YT_DLP_TIMEOUT_MS });

      return stdout
        .trim()
        .split('\n')
        .flatMap((line) => {
          try {
            const data = JSON.parse(line);
            if (!data?.id || !data?.title) return [];
            return [{
              id: data.id as string,
              title: data.title as string,
              subtitle: (data.uploader || data.channel || '') as string,
              image: (data.thumbnail || data.thumbnails?.[0]?.url || '') as string,
              url: data.url as string,
              duration: data.duration as number,
              source: 'youtube',
            }];
          } catch {
            return [];
          }
        });
    } catch (error) {
      console.error('[yt-dlp] getYtDlpMetadata failed:', (error as Error).message?.slice(0, 120));
      return [];
    }
  })();

  const result = await withTimeout(work, YT_DLP_TIMEOUT_MS, `getYtDlpMetadata(${query.slice(0, 40)})`);
  return result ?? [];
}
