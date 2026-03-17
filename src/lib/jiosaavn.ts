import axios from 'axios';
import CryptoJS from 'crypto-js';

const DES_KEY_STRING = '38346591';

const JIO_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.jiosaavn.com/',
};

type JioSongDetails = {
  id: string;
  encrypted_media_url: string;
  song: string;
  album: string;
  primary_artists: string;
  image: string;
  duration: number;
  release_date: string;
  language: string;
  '320kbps'?: string;
};

type JioSongDetailsResponse = Record<string, JioSongDetails>;

export function decryptUrl(encUrl: string): string | null {
  try {
    const key = CryptoJS.enc.Utf8.parse(DES_KEY_STRING);
    const decrypted = CryptoJS.DES.decrypt(encUrl, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    const decryptedUrl = decrypted.toString(CryptoJS.enc.Utf8);
    if (!decryptedUrl) return null;
    // Always force 320kbps
    return decryptedUrl
      .replace(/_96\.(mp4|m4a)/, '_320.$1')
      .replace(/_160\.(mp4|m4a)/, '_320.$1');
  } catch (error) {
    console.error('[jiosaavn] Decryption failed:', error);
    return null;
  }
}

export function formatString(str: string): string {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&copy;/g, '©')
    .replace(/<[^>]*>/g, '')  // strip HTML tags
    .trim();
}

function upgradeImage(url: string): string {
  return url.replace(/50x50|150x150|300x300/g, '500x500');
}

/**
 * Search JioSaavn for songs matching query.
 * Returns up to `limit` results (default 30).
 */
export async function searchJioSaavn(query: string, limit = 30) {
  const url = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&cc=in&p=1&n=${limit}&q=${encodeURIComponent(query)}`;
  const response = await axios.get(url, {
    timeout: 9_000,
    headers: JIO_HEADERS,
  });
  const data = response.data;
  const songs = data?.results;
  if (!Array.isArray(songs)) return [];

  return songs.flatMap((song) => {
    if (!song?.id || !song?.song || !song?.image) return [];
    return [{
      id: song.id as string,
      title: formatString(song.song as string),
      subtitle: formatString((song.primary_artists as string) ?? ''),
      image: upgradeImage(song.image as string),
      url: song.perma_url as string | undefined,
      source: 'jio',
    }];
  });
}

/**
 * Resolves full details + decrypted media URL for a JioSaavn song ID.
 */
export async function getSongDetails(id: string) {
  const url = `https://www.jiosaavn.com/api.php?__call=song.getDetails&cc=in&_marker=0%3F_marker%3D0&_format=json&pids=${id}`;
  const response = await axios.get<JioSongDetailsResponse>(url, {
    timeout: 9_000,
    headers: JIO_HEADERS,
  });
  const data = response.data;
  const song = data?.[id];
  if (!song) return null;

  const mediaUrl = decryptUrl(song.encrypted_media_url);

  return {
    id: song.id,
    title: formatString(song.song),
    album: formatString(song.album),
    artists: formatString(song.primary_artists),
    image: upgradeImage(song.image),
    mediaUrl: mediaUrl ?? undefined,
    duration: song.duration,
    releaseDate: song.release_date,
    language: song.language,
    quality: song['320kbps'] === 'true' ? '320kbps' : '160kbps',
    source: 'jio',
    ...(mediaUrl ? {} : { error: 'Stream unavailable' }),
  };
}

/**
 * Resolves JioSaavn song details for multiple IDs in parallel (up to 3 concurrent).
 * Returns the first successfully resolved result with a valid mediaUrl.
 */
export async function resolveFirstValid(ids: string[]): Promise<ReturnType<typeof getSongDetails> extends Promise<infer R> ? R : never | null> {
  const CHUNK = 3;
  for (let i = 0; i < Math.min(ids.length, CHUNK * 2); i += CHUNK) {
    const batch = ids.slice(i, i + CHUNK);
    const results = await Promise.allSettled(batch.map(id => getSongDetails(id)));
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value?.mediaUrl) {
        return r.value as any;
      }
    }
  }
  return null;
}
