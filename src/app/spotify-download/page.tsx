"use client";

import { useMemo, useState } from "react";
import AppShell from "@/components/AppShell";
import dlStyles from "./SpotifyDownload.module.css";
import { Copy, Download, Link as LinkIcon, Loader2, Menu, Music, Play, Terminal, X } from "lucide-react";
import { useMusic } from "@/context/MusicContext";
import Image from "next/image";

type DownloadTrack = {
  id: string;
  title: string;
  subtitle: string;
  image: string;
  source: string;
  downloadUrl: string;
  streamUrl?: string;
};

type PlaylistData = {
  id: string;
  title: string;
  description: string;
  owner: string;
  total: number;
  tracks: DownloadTrack[];
  bashScript?: string;
};

export default function SpotifyDownloadPage() {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [playlist, setPlaylist] = useState<PlaylistData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloadingIndices, setDownloadingIndices] = useState<Set<number>>(new Set());
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const { downloadSong, playQueue, createPlaylist, addManyToPlaylist } = useMusic();

  const playlistSongs = useMemo(() => {
    if (!playlist) return [];
    return playlist.tracks.map((track) => ({
      id: track.id,
      title: track.title,
      artists: track.subtitle,
      image:
        track.image ||
        "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=120&h=120&fit=crop",
      source: "spotify_playlist",
      mediaUrl: track.streamUrl || track.downloadUrl,
    }));
  }, [playlist]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const fetchPlaylist = async () => {
    if (!url.trim()) return;
    setIsLoading(true);
    setError(null);
    setPlaylist(null);
    try {
      // Use the path-based URL if it looks like a clean ID
      const cleanedUrl = url.trim();
      const isIdOnly = /^[a-zA-Z0-9]{22}$/.test(cleanedUrl);
      const apiEndpoint = isIdOnly 
        ? `/api/spotify-download/${cleanedUrl}` 
        : `/api/spotify-download?id=${encodeURIComponent(cleanedUrl)}`;

      const res = await fetch(apiEndpoint);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to fetch playlist");
      }
      setPlaylist(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async (track: DownloadTrack, index: number) => {
    setDownloadingIndices((prev) => new Set(prev).add(index));
    try {
      await downloadSong({
        id: track.id,
        title: track.title,
        artists: track.subtitle,
        image: track.image,
        source: "spotify_playlist",
        mediaUrl: track.downloadUrl,
      });
    } finally {
      setDownloadingIndices((prev) => {
        const next = new Set(prev);
        next.delete(index);
        return next;
      });
    }
  };

  const downloadAll = async () => {
    if (!playlist || isDownloadingAll) return;
    setIsDownloadingAll(true);
    
    for (let i = 0; i < playlist.tracks.length; i++) {
        const track = playlist.tracks[i];
        await handleDownload(track, i);
        // Small delay between downloads to be nice to the browser and server
        await new Promise(resolve => setTimeout(resolve, 850));
    }
    
    setIsDownloadingAll(false);
    showToast("Batch download complete!");
  };

  const clonePlaylist = () => {
    if (!playlist) return;
    
    // Convert DownloadTracks to the Song format used in MusicContext
    const songs = playlist.tracks.map(track => ({
        id: track.id,
        title: track.title,
        artists: track.subtitle,
        image: track.image,
        source: "spotify_playlist",
        mediaUrl: track.streamUrl || track.downloadUrl
    }));

    const newPlaylistId = createPlaylist(playlist.title);
    addManyToPlaylist(newPlaylistId, songs);
    showToast("Playlist cloned to library!");
  };

  const copyBashScript = () => {
    if (!playlist?.bashScript) return;
    navigator.clipboard.writeText(playlist.bashScript);
    showToast("Bash command copied to clipboard!");
  };

  return (
    <AppShell>
      {({ openSidebar }) => (
        <div className={dlStyles.container}>
            {toast && <div className={dlStyles.toast}>{toast}</div>}

            <header className={dlStyles.header}>
                <button type="button" className={dlStyles.menuButton} onClick={openSidebar} aria-label="Open menu">
                    <Menu size={20} />
                </button>
                <h1 className={dlStyles.title}>Spotify Playlist Downloader</h1>
                <p className={dlStyles.subtitle}>High-speed bulk downloading. Get all tracks in one go.</p>
            </header>

            <div className={dlStyles.searchBox}>
                <div className={dlStyles.inputWrapper}>
                    <LinkIcon className={dlStyles.icon} size={20} />
                    <input 
                        type="text" 
                        placeholder="Spotify Playlist URL or ID..." 
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        className={dlStyles.input}
                        onKeyDown={(e) => e.key === "Enter" && fetchPlaylist()}
                    />
                    {url && (
                        <button onClick={() => setUrl("")} className={dlStyles.clearBtn}>
                            <X size={18} />
                        </button>
                    )}
                </div>
                <button 
                    onClick={fetchPlaylist} 
                    disabled={isLoading || !url.trim()}
                    className={dlStyles.fetchBtn}
                >
                    {isLoading ? <Loader2 className={dlStyles.spin} size={20} /> : "Fetch Playlist"}
                </button>
            </div>

            {error && <div className={dlStyles.error}>{error}</div>}

            {playlist && (
                <div className={dlStyles.results}>
                    <div className={dlStyles.playlistInfo}>
                        <div className={dlStyles.playlistMeta}>
                            <h2 className={dlStyles.playlistTitle}>{playlist.title}</h2>
                            <p className={dlStyles.playlistDesc}>{playlist.description}</p>
                            <div className={dlStyles.playlistStats}>
                                <span className={dlStyles.playlistCount}>{playlist.total} tracks</span>
                                <span className={dlStyles.playlistOwner}>by {playlist.owner}</span>
                            </div>
                        </div>
                        <div className={dlStyles.batchActions}>
                            {playlist.bashScript && (
                                <button className={dlStyles.toolBtn} onClick={copyBashScript} title="Copy bash command for terminal download">
                                    <Terminal size={18} />
                                    <span>CLI Script</span>
                                </button>
                            )}
                            <button 
                                className={dlStyles.cloneBtn}
                                onClick={clonePlaylist}
                                title="Clone this playlist to your local library"
                            >
                                <Copy size={18} />
                                <span>Clone</span>
                            </button>
                            <button 
                                className={dlStyles.downloadAllBtn}
                                onClick={downloadAll}
                                disabled={isDownloadingAll}
                            >
                                {isDownloadingAll ? (
                                    <><Loader2 className={dlStyles.spin} size={18} /> Downloading...</>
                                ) : (
                                    <><Download size={18} /> Download All</>
                                )}
                            </button>
                        </div>
                    </div>

                    <div className={dlStyles.trackList}>
                        {playlist.tracks.map((track, idx) => (
                            <div key={track.id} className={`${dlStyles.trackItem} ${downloadingIndices.has(idx) ? dlStyles.trackItemDownloading : ''}`}>
                                <div className={dlStyles.trackRank}>{idx + 1}</div>
                                <div className={dlStyles.trackArt}>
                                    <Image 
                                      src={track.image || "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=100&h=100&fit=crop"} 
                                      alt={track.title} 
                                      fill 
                                      sizes="44px" 
                                      className={dlStyles.trackImage}
                                    />
                                    <button 
                                        className={dlStyles.itemPlayBtn}
                                        onClick={() => playQueue(playlistSongs, idx)}
                                    >
                                        <Play size={16} fill="white" />
                                    </button>
                                </div>
                                <div className={dlStyles.trackDetails}>
                                    <div className={dlStyles.trackName}>{track.title}</div>
                                    <div className={dlStyles.trackArtists}>{track.subtitle}</div>
                                </div>
                                <div className={dlStyles.trackActions}>
                                    <button 
                                        className={dlStyles.trackDownloadBtn}
                                        onClick={() => handleDownload(track, idx)}
                                        disabled={downloadingIndices.has(idx)}
                                        title="Download"
                                    >
                                        {downloadingIndices.has(idx) ? (
                                            <Loader2 className={dlStyles.spin} size={18} />
                                        ) : (
                                            <Download size={18} />
                                        )}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {!playlist && !isLoading && !error && (
                <div className={dlStyles.emptyState}>
                    <Music size={48} className={dlStyles.emptyIcon} />
                    <p>Enter a Spotify playlist URL to begin the bulk download process.</p>
                </div>
            )}
        </div>
      )}
    </AppShell>
  );
}
