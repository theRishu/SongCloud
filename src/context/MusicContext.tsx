
"use client";

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

interface Song {
    id: string;
    title: string;
    album?: string;
    artists?: string;
    image: string;
    mediaUrl?: string;
    duration?: number;
    source?: string;
    quality?: string;
    url?: string;
}

type Playlist = {
    id: string;
    name: string;
    tracks: Song[];
    system?: boolean;
};

interface MusicContextType {
    currentSong: Song | null;
    isPlaying: boolean;
    playSong: (song: Song) => void;
    togglePlay: () => void;
    downloadSong: (song: Song) => Promise<void>;
    volume: number;
    setVolume: (v: number) => void;
    currentTime: number;
    duration: number;
    seekTo: (timeSeconds: number) => void;
    history: Song[];
    clearHistory: () => void;
    playlists: Playlist[];
    createPlaylist: (name: string) => string;
    deletePlaylist: (playlistId: string) => void;
    renamePlaylist: (playlistId: string, name: string) => void;
    addToPlaylist: (playlistId: string, song: Song) => void;
    addManyToPlaylist: (playlistId: string, songs: Song[]) => void;
    removeFromPlaylist: (playlistId: string, song: Song) => void;
    toggleLike: (song: Song) => void;
    isLiked: (song: Song) => boolean;
}

const MusicContext = createContext<MusicContextType | undefined>(undefined);

const HISTORY_KEY = "songcloud_history";
const PLAYLISTS_KEY = "songcloud_playlists_v1";
const LIKED_PLAYLIST_ID = "liked";

function sanitizeSong(value: unknown): Song | null {
    if (!value || typeof value !== "object") return null;
    const obj = value as Record<string, unknown>;

    const id = typeof obj.id === "string" ? obj.id : null;
    const title = typeof obj.title === "string" ? obj.title : null;
    const image = typeof obj.image === "string" ? obj.image : null;
    if (!id || !title || !image) return null;

    const duration = typeof obj.duration === "number" && Number.isFinite(obj.duration) ? obj.duration : undefined;

    return {
        id,
        title,
        album: typeof obj.album === "string" ? obj.album : undefined,
        artists: typeof obj.artists === "string" ? obj.artists : undefined,
        image,
        mediaUrl: typeof obj.mediaUrl === "string" ? obj.mediaUrl : undefined,
        duration,
        source: typeof obj.source === "string" ? obj.source : undefined,
        quality: typeof obj.quality === "string" ? obj.quality : undefined,
        url: typeof obj.url === "string" ? obj.url : undefined,
    };
}

function songKey(song: Song) {
    return `${song.source || "jio"}:${song.id}`;
}

function generatePlaylistId() {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return crypto.randomUUID();
    }
    return `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function MusicProvider({ children }: { children: React.ReactNode }) {
    const [currentSong, setCurrentSong] = useState<Song | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [volume, setVolume] = useState(0.7);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [history, setHistory] = useState<Song[]>([]);
    const [historyLoaded, setHistoryLoaded] = useState(false);
    const [playlists, setPlaylists] = useState<Playlist[]>([
        { id: LIKED_PLAYLIST_ID, name: "Liked Songs", tracks: [], system: true },
    ]);
    const [playlistsLoaded, setPlaylistsLoaded] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const saved = window.localStorage.getItem(HISTORY_KEY);
            if (!saved) return;

            const parsed: unknown = JSON.parse(saved);
            if (!Array.isArray(parsed)) return;

            const sanitized: Song[] = parsed.flatMap((item) => {
                const song = sanitizeSong(item);
                return song ? [song] : [];
            });

            setHistory(sanitized);
        } catch {
            // ignore parse failures
        } finally {
            setHistoryLoaded(true);
        }
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!historyLoaded) return;
        try {
            window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        } catch {
            // ignore storage failures
        }
    }, [history, historyLoaded]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const saved = window.localStorage.getItem(PLAYLISTS_KEY);
            if (!saved) return;

            const parsed: unknown = JSON.parse(saved);
            if (!Array.isArray(parsed)) return;

            const sanitized: Playlist[] = parsed.flatMap((item) => {
                if (!item || typeof item !== "object") return [];
                const obj = item as Record<string, unknown>;

                const id = typeof obj.id === "string" ? obj.id : null;
                const name = typeof obj.name === "string" ? obj.name : null;
                const tracks = Array.isArray(obj.tracks)
                    ? obj.tracks.flatMap((t) => {
                        const song = sanitizeSong(t);
                        return song ? [song] : [];
                    })
                    : [];

                if (!id || !name) return [];
                const system = typeof obj.system === "boolean" ? obj.system : undefined;
                return [{ id, name, tracks: tracks.slice(0, 2000), system }];
            });

            setPlaylists((prev) => {
                const liked = sanitized.find((p) => p.id === LIKED_PLAYLIST_ID);
                const withoutLiked = sanitized.filter((p) => p.id !== LIKED_PLAYLIST_ID);
                const baseLiked = liked ?? prev.find((p) => p.id === LIKED_PLAYLIST_ID) ?? { id: LIKED_PLAYLIST_ID, name: "Liked Songs", tracks: [], system: true };
                return [{ ...baseLiked, system: true }, ...withoutLiked];
            });
        } catch {
            // ignore parse failures
        } finally {
            setPlaylistsLoaded(true);
        }
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") return;
        if (!playlistsLoaded) return;
        try {
            window.localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
        } catch {
            // ignore storage failures
        }
    }, [playlists, playlistsLoaded]);

    const clearHistory = useCallback(() => {
        setHistory([]);
    }, []);

    const createPlaylist = useCallback((name: string) => {
        const cleaned = name.trim();
        const finalName = cleaned.length > 0 ? cleaned : "New Playlist";
        const id = generatePlaylistId();
        setPlaylists((prev) => [...prev, { id, name: finalName, tracks: [] }]);
        return id;
    }, []);

    const deletePlaylist = useCallback((playlistId: string) => {
        if (playlistId === LIKED_PLAYLIST_ID) return;
        setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));
    }, []);

    const renamePlaylist = useCallback((playlistId: string, name: string) => {
        const cleaned = name.trim();
        if (!cleaned) return;
        if (playlistId === LIKED_PLAYLIST_ID) return;
        setPlaylists((prev) => prev.map((p) => (p.id === playlistId ? { ...p, name: cleaned } : p)));
    }, []);

    const addManyToPlaylist = useCallback((playlistId: string, songs: Song[]) => {
        setPlaylists((prev) =>
            prev.map((playlist) => {
                if (playlist.id !== playlistId) return playlist;

                const existing = new Set(playlist.tracks.map(songKey));
                const toAdd = songs.flatMap((song) => {
                    const normalized: Song = { ...song, source: song.source || "jio" };
                    const key = songKey(normalized);
                    if (existing.has(key)) return [];
                    existing.add(key);
                    return [normalized];
                });

                if (toAdd.length === 0) return playlist;

                const nextTracks =
                    playlistId === LIKED_PLAYLIST_ID ? [...toAdd.reverse(), ...playlist.tracks] : [...playlist.tracks, ...toAdd];

                return { ...playlist, tracks: nextTracks.slice(0, 2000) };
            })
        );
    }, []);

    const addToPlaylist = useCallback(
        (playlistId: string, song: Song) => {
            addManyToPlaylist(playlistId, [song]);
        },
        [addManyToPlaylist]
    );

    const removeFromPlaylist = useCallback((playlistId: string, song: Song) => {
        const key = songKey(song);
        setPlaylists((prev) =>
            prev.map((playlist) => {
                if (playlist.id !== playlistId) return playlist;
                const next = playlist.tracks.filter((t) => songKey(t) !== key);
                return next.length === playlist.tracks.length ? playlist : { ...playlist, tracks: next };
            })
        );
    }, []);

    const isLiked = useCallback(
        (song: Song) => {
            const liked = playlists.find((p) => p.id === LIKED_PLAYLIST_ID);
            if (!liked) return false;
            const key = songKey({ ...song, source: song.source || "jio" });
            return liked.tracks.some((t) => songKey(t) === key);
        },
        [playlists]
    );

    const toggleLike = useCallback((song: Song) => {
        const normalized: Song = { ...song, source: song.source || "jio" };
        setPlaylists((prev) =>
            prev.map((playlist) => {
                if (playlist.id !== LIKED_PLAYLIST_ID) return playlist;
                const key = songKey(normalized);
                const exists = playlist.tracks.some((t) => songKey(t) === key);
                if (exists) {
                    return { ...playlist, tracks: playlist.tracks.filter((t) => songKey(t) !== key) };
                }
                return { ...playlist, tracks: [normalized, ...playlist.tracks].slice(0, 2000) };
            })
        );
    }, []);

    const playSong = useCallback(async (song: Song) => {
        let resolvedSong: Song = song;

        if (!song.mediaUrl) {
            const res = await fetch(`/api/song?id=${song.id}&type=${song.source || "jio"}`);
            const data: unknown = await res.json();
            const obj = data as Record<string, unknown> | null;
            const mediaUrl = typeof obj?.mediaUrl === "string" ? obj.mediaUrl : null;
            const quality = typeof obj?.quality === "string" ? obj.quality : undefined;
            const dur = typeof obj?.duration === "number" ? obj.duration : undefined;
            const artists = typeof obj?.artists === "string" ? obj.artists : undefined;
            const album = typeof obj?.album === "string" ? obj.album : undefined;
            const image = typeof obj?.image === "string" ? obj.image : undefined;
            const error = typeof obj?.error === "string" ? obj.error : null;

            if (mediaUrl) {
                resolvedSong = { ...song, mediaUrl, duration: dur, quality, artists: artists ?? song.artists, album: album ?? song.album, image: image ?? song.image };
            } else if (error) {
                alert(error);
                return;
            }
        }

        setCurrentSong(resolvedSong);
        setCurrentTime(0);
        setDuration(resolvedSong.duration ?? 0);
        if (audioRef.current) {
            audioRef.current.src = resolvedSong.mediaUrl || "";
            audioRef.current.currentTime = 0;
            void audioRef.current.play();
        }

        // Add to history
        setHistory((prev) => {
            const filtered = prev.filter((s) => s.id !== resolvedSong.id);
            return [resolvedSong, ...filtered].slice(0, 50);
        });
    }, []);

    const togglePlay = useCallback(() => {
        const audio = audioRef.current;
        if (!audio) return;

        if (audio.paused) {
            void audio.play();
        } else {
            audio.pause();
        }
    }, []);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume;
        }
    }, [volume]);

    const seekTo = useCallback((timeSeconds: number) => {
        const audio = audioRef.current;
        if (!audio) return;

        const safeDuration = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
        const clamped = Math.min(Math.max(timeSeconds, 0), safeDuration || Math.max(duration, 0));
        audio.currentTime = clamped;
        setCurrentTime(clamped);
    }, [duration]);

    const downloadSong = useCallback(async (song: Song) => {
        let url = song.mediaUrl;

        if (!url) {
            const res = await fetch(`/api/song?id=${song.id}&type=${song.source || "jio"}`);
            const data: unknown = await res.json();
            const obj = data as Record<string, unknown> | null;
            url = typeof obj?.mediaUrl === "string" ? obj.mediaUrl : undefined;
            const error = typeof obj?.error === "string" ? obj.error : null;
            if (error) {
                alert(error);
                return;
            }
        }

        if (!url) {
            alert("Download unavailable for this track.");
            return;
        }

        const a = document.createElement("a");
        a.href = url;
        a.download = `${song.title}.mp3`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }, []);

    return (
        <MusicContext.Provider value={{ 
            currentSong,
            isPlaying,
            playSong,
            togglePlay,
            downloadSong,
            volume,
            setVolume,
            currentTime,
            duration,
            seekTo,
            history,
            clearHistory,
            playlists,
            createPlaylist,
            deletePlaylist,
            renamePlaylist,
            addToPlaylist,
            addManyToPlaylist,
            removeFromPlaylist,
            toggleLike,
            isLiked,
        }}>
            {children}
            <audio 
                ref={audioRef} 
                onLoadedMetadata={(e) => {
                    const next = Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0;
                    setDuration(next);
                }}
                onDurationChange={(e) => {
                    const next = Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : 0;
                    setDuration(next);
                }}
                onTimeUpdate={(e) => {
                    const next = Number.isFinite(e.currentTarget.currentTime) ? e.currentTarget.currentTime : 0;
                    setCurrentTime(next);
                }}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
            />
        </MusicContext.Provider>
    );
}

export function useMusic() {
    const context = useContext(MusicContext);
    if (!context) throw new Error('useMusic must be used within MusicProvider');
    return context;
}
