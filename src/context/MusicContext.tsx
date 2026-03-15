
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
    queue: Song[];
    queueIndex: number;
    isShuffle: boolean;
    repeatMode: "off" | "one" | "all";
    playSong: (song: Song) => void;
    playQueue: (songs: Song[], startIndex?: number) => void;
    togglePlay: () => void;
    nextTrack: () => void;
    previousTrack: () => void;
    toggleShuffle: () => void;
    cycleRepeat: () => void;
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

function shuffleInPlace<T>(items: T[]) {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
}

function shuffleAround<T>(items: T[], startIndex: number) {
    if (items.length <= 1) return items.slice();
    const clamped = Math.min(Math.max(startIndex, 0), items.length - 1);
    const current = items[clamped];
    const rest = items.filter((_, idx) => idx !== clamped);
    shuffleInPlace(rest);
    return [current, ...rest];
}

export function MusicProvider({ children }: { children: React.ReactNode }) {
    const [currentSong, setCurrentSong] = useState<Song | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [queue, setQueue] = useState<Song[]>([]);
    const [queueIndex, setQueueIndex] = useState(-1);
    const [isShuffle, setIsShuffle] = useState(false);
    const [repeatMode, setRepeatMode] = useState<"off" | "one" | "all">("off");
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
    const queueRef = useRef<Song[]>([]);
    const queueIndexRef = useRef(-1);
    const isShuffleRef = useRef(false);
    const repeatModeRef = useRef<"off" | "one" | "all">("off");
    const playTokenRef = useRef(0);

    useEffect(() => {
        queueRef.current = queue;
    }, [queue]);

    useEffect(() => {
        queueIndexRef.current = queueIndex;
    }, [queueIndex]);

    useEffect(() => {
        isShuffleRef.current = isShuffle;
    }, [isShuffle]);

    useEffect(() => {
        repeatModeRef.current = repeatMode;
    }, [repeatMode]);

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

    const resolveSong = useCallback(async (song: Song) => {
        const normalized: Song = { ...song, source: song.source || "jio" };
        if (normalized.mediaUrl) return normalized;

        try {
            const params = new URLSearchParams({ id: normalized.id, type: normalized.source || "jio" });
            if (normalized.source !== "jio") {
                params.set("title", normalized.title);
                const artistText = normalized.artists || "";
                if (artistText) params.set("artists", artistText);
            }
            const res = await fetch(`/api/song?${params.toString()}`);
            const data: unknown = await res.json().catch(() => null);
            const obj = data as Record<string, unknown> | null;
            const mediaUrl = typeof obj?.mediaUrl === "string" ? obj.mediaUrl : null;
            const quality = typeof obj?.quality === "string" ? obj.quality : undefined;
            const dur = typeof obj?.duration === "number" ? obj.duration : undefined;
            const artists = typeof obj?.artists === "string" ? obj.artists : undefined;
            const album = typeof obj?.album === "string" ? obj.album : undefined;
            const image = typeof obj?.image === "string" ? obj.image : undefined;
            const error = typeof obj?.error === "string" ? obj.error : null;

            if (mediaUrl) {
                return {
                    ...normalized,
                    mediaUrl,
                    duration: dur,
                    quality,
                    artists: artists ?? normalized.artists,
                    album: album ?? normalized.album,
                    image: image ?? normalized.image,
                };
            }

            if (error) {
                alert(error);
                return null;
            }

            alert("Playback unavailable for this track.");
            return null;
        } catch {
            alert("Failed to load track.");
            return null;
        }
    }, []);

    const commitNowPlaying = useCallback((song: Song) => {
        setCurrentSong(song);
        setCurrentTime(0);
        setDuration(song.duration ?? 0);

        const audio = audioRef.current;
        if (audio) {
            audio.src = song.mediaUrl || "";
            audio.currentTime = 0;
            void audio.play();
        }

        setHistory((prev) => {
            const key = songKey(song);
            const filtered = prev.filter((s) => songKey(s) !== key);
            return [song, ...filtered].slice(0, 50);
        });
    }, []);

    const playSong = useCallback(
        async (song: Song) => {
            const token = ++playTokenRef.current;
            const normalized: Song = { ...song, source: song.source || "jio" };
            const key = songKey(normalized);

            const previousQueue = queueRef.current;
            const previousIndex = queueIndexRef.current;

            let nextQueue = previousQueue;
            let nextIndex = previousQueue.findIndex((s) => songKey(s) === key);

            if (nextIndex === -1) {
                nextQueue = [normalized];
                nextIndex = 0;
                queueRef.current = nextQueue;
                setQueue(nextQueue);
            }

            queueIndexRef.current = nextIndex;
            setQueueIndex(nextIndex);

            const resolved = await resolveSong(normalized);

            if (token !== playTokenRef.current) return;

            if (!resolved) {
                queueRef.current = previousQueue;
                setQueue(previousQueue);
                queueIndexRef.current = previousIndex;
                setQueueIndex(previousIndex);
                return;
            }

            commitNowPlaying(resolved);
        },
        [commitNowPlaying, resolveSong]
    );

    const playQueue = useCallback(
        (songs: Song[], startIndex = 0) => {
            const unique: Song[] = [];
            const seen = new Set<string>();

            for (const song of songs) {
                const normalized: Song = { ...song, source: song.source || "jio" };
                const key = songKey(normalized);
                if (seen.has(key)) continue;
                seen.add(key);
                unique.push(normalized);
            }

            if (unique.length === 0) return;

            const clampedIndex = Math.min(Math.max(startIndex, 0), unique.length - 1);

            let nextQueue = unique;
            let nextIndex = clampedIndex;

            if (isShuffleRef.current && unique.length > 1) {
                nextQueue = shuffleAround(unique, clampedIndex);
                nextIndex = 0;
            }

            queueRef.current = nextQueue;
            setQueue(nextQueue);
            queueIndexRef.current = nextIndex;
            setQueueIndex(nextIndex);

            void playSong(nextQueue[nextIndex]);
        },
        [playSong]
    );

    const nextTrack = useCallback(() => {
        const q = queueRef.current;
        if (q.length === 0) return;

        const idx = queueIndexRef.current;
        const nextIndex = idx + 1;

        if (nextIndex < q.length) {
            queueIndexRef.current = nextIndex;
            setQueueIndex(nextIndex);
            void playSong(q[nextIndex]);
            return;
        }

        if (repeatModeRef.current === "all" && q.length > 0) {
            queueIndexRef.current = 0;
            setQueueIndex(0);
            void playSong(q[0]);
        }
    }, [playSong]);

    const previousTrack = useCallback(() => {
        const audio = audioRef.current;
        if (audio && audio.currentTime > 4) {
            audio.currentTime = 0;
            setCurrentTime(0);
            return;
        }

        const q = queueRef.current;
        if (q.length === 0) return;

        const idx = queueIndexRef.current;
        const prevIndex = idx - 1;

        if (prevIndex >= 0) {
            queueIndexRef.current = prevIndex;
            setQueueIndex(prevIndex);
            void playSong(q[prevIndex]);
            return;
        }

        if (repeatModeRef.current === "all" && q.length > 0) {
            const last = q.length - 1;
            queueIndexRef.current = last;
            setQueueIndex(last);
            void playSong(q[last]);
            return;
        }

        if (audio) {
            audio.currentTime = 0;
            setCurrentTime(0);
        }
    }, [playSong]);

    const toggleShuffle = useCallback(() => {
        setIsShuffle((prev) => {
            const next = !prev;
            isShuffleRef.current = next;

            if (next) {
                const q = queueRef.current;
                const idx = queueIndexRef.current;
                if (q.length > 1 && idx >= 0) {
                    const shuffled = shuffleAround(q, idx);
                    queueRef.current = shuffled;
                    setQueue(shuffled);
                    queueIndexRef.current = 0;
                    setQueueIndex(0);
                }
            }

            return next;
        });
    }, []);

    const cycleRepeat = useCallback(() => {
        setRepeatMode((prev) => {
            const next = prev === "off" ? "all" : prev === "all" ? "one" : "off";
            repeatModeRef.current = next;
            return next;
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
            const params = new URLSearchParams({ id: song.id, type: song.source || "jio" });
            if (song.source && song.source !== "jio") {
                params.set("title", song.title);
                const artistText = song.artists || "";
                if (artistText) params.set("artists", artistText);
            }
            const res = await fetch(`/api/song?${params.toString()}`);
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
	            queue,
	            queueIndex,
	            isShuffle,
	            repeatMode,
	            playSong,
	            playQueue,
	            togglePlay,
	            nextTrack,
	            previousTrack,
	            toggleShuffle,
	            cycleRepeat,
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
	                onEnded={() => {
	                    const audio = audioRef.current;
	                    const mode = repeatModeRef.current;
	                    const q = queueRef.current;
	                    const idx = queueIndexRef.current;

	                    if (audio && mode === "one") {
	                        audio.currentTime = 0;
	                        setCurrentTime(0);
	                        void audio.play();
	                        return;
	                    }

	                    const nextIndex = idx + 1;
	                    if (q.length > 0 && nextIndex < q.length) {
	                        queueIndexRef.current = nextIndex;
	                        setQueueIndex(nextIndex);
	                        void playSong(q[nextIndex]);
	                        return;
	                    }

	                    if (q.length > 0 && mode === "all") {
	                        queueIndexRef.current = 0;
	                        setQueueIndex(0);
	                        void playSong(q[0]);
	                        return;
	                    }

	                    setIsPlaying(false);
	                }}
	            />
	        </MusicContext.Provider>
	    );
	}

export function useMusic() {
    const context = useContext(MusicContext);
    if (!context) throw new Error('useMusic must be used within MusicProvider');
    return context;
}
