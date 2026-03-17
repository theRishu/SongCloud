import axios from 'axios';
import CryptoJS from 'crypto-js';

const DES_KEY_STRING = '38346591';

type JioAutocompleteSong = {
    id: string;
    title: string;
    subtitle: string;
    image: string;
    url?: string;
};

type JioAutocompleteResponse = {
    songs?: {
        data?: JioAutocompleteSong[];
    };
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

export function decryptUrl(encUrl: string) {
    try {
        const key = CryptoJS.enc.Utf8.parse(DES_KEY_STRING);
        const decrypted = CryptoJS.DES.decrypt(
            encUrl,
            key,
            { mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7 }
        );
        
        const decryptedUrl = decrypted.toString(CryptoJS.enc.Utf8);
        if (!decryptedUrl) return null;
        
        return decryptedUrl.replace("_96.mp4", "_320.mp4").replace("_96.m4a", "_320.m4a");
    } catch (error) {
        console.error('Decryption failed:', error);
        return null;
    }
}

export function formatString(str: string) {
    if (!str) return '';
    return str
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&#039;/g, "'")
        .replace(/&copy;/g, '©');
}

export async function searchJioSaavn(query: string) {
    // Using search.getResults for 30 results instead of autocomplete's few
    const url = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&cc=in&p=1&n=30&q=${encodeURIComponent(query)}`;
    const response = await axios.get(url, {
        timeout: 10_000,
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
            Accept: "application/json",
        },
    });
    const data = response.data;
    
    const songs = data?.results;
    if (Array.isArray(songs)) {
        return songs.flatMap((song) => {
            if (!song?.id || !song?.song || !song?.image) return [];
            return [
                {
                    id: song.id,
                    title: formatString(song.song),
                    subtitle: formatString(song.primary_artists ?? ''),
                    image: song.image.replace(/50x50|150x150/g, "500x500"),
                    url: song.perma_url,
                    source: "jio",
                }
            ];
        });
    }
    return [];
}

export async function getSongDetails(id: string) {
    const url = `https://www.jiosaavn.com/api.php?__call=song.getDetails&cc=in&_marker=0%3F_marker%3D0&_format=json&pids=${id}`;
    const response = await axios.get<JioSongDetailsResponse>(url, {
        timeout: 10_000,
        headers: {
            "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
            Accept: "application/json",
        },
    });
    const data = response.data;
    
    const song = data?.[id];
    if (song) {
        const mediaUrl = decryptUrl(song.encrypted_media_url);
        
        return {
            id: song.id,
            title: formatString(song.song),
            album: formatString(song.album),
            artists: formatString(song.primary_artists),
            image: song.image.replace(/50x50|150x150/g, "500x500"),
            mediaUrl: mediaUrl ?? undefined,
            duration: song.duration,
            releaseDate: song.release_date,
            language: song.language,
            quality: song['320kbps'] === 'true' ? '320kbps' : '160kbps',
            source: "jio",
            ...(mediaUrl ? {} : { error: "Stream unavailable" }),
        };
    }
    return null;
}
