"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Menu, PlusCircle, Trash2, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Player from "@/components/Player";
import { useMusic } from "@/context/MusicContext";
import shell from "../page.module.css";
import styles from "./page.module.css";

type PlaylistApiTrack = {
  id: string;
  title: string;
  subtitle?: string;
  image: string;
  source: string;
};

type PlaylistApiResponse = {
  id: string;
  title: string;
  description: string;
  image: string;
  owner: string;
  total: number;
  tracks: PlaylistApiTrack[];
  truncated: boolean;
};

function toSong(track: PlaylistApiTrack) {
  return {
    id: track.id,
    title: track.title,
    artists: track.subtitle,
    image: track.image,
    source: track.source,
  };
}

export default function PlaylistsPage() {
  const router = useRouter();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const openSidebar = useCallback(() => setIsSidebarOpen(true), []);
  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);

  useEffect(() => {
    if (!isSidebarOpen) return;
    if (typeof window === "undefined") return;
    if (!window.matchMedia("(max-width: 900px)").matches) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isSidebarOpen]);

  const { playlists, createPlaylist, deletePlaylist, addManyToPlaylist } = useMusic();

  const customPlaylists = useMemo(() => playlists.filter((p) => !p.system), [playlists]);

  const createNew = () => {
    const name = prompt("Playlist name:");
    if (!name) return;
    const id = createPlaylist(name);
    router.push(`/playlists/${id}`);
  };

  const importFromSpotify = async () => {
    const raw = prompt("Enter Spotify Playlist ID / URL:");
    if (!raw) return;

    setIsImporting(true);
    try {
      const res = await fetch(`/api/playlist?id=${encodeURIComponent(raw)}&limit=2000`);
      const data: unknown = await res.json().catch(() => null);
      const obj = data as Partial<PlaylistApiResponse> & { error?: string };

      if (obj.error) {
        alert(obj.error);
        return;
      }

      if (!res.ok) {
        alert(`Import failed (${res.status})`);
        return;
      }

      if (!obj.title || !Array.isArray(obj.tracks)) {
        alert("Playlist response invalid");
        return;
      }

      const id = createPlaylist(obj.title);
      addManyToPlaylist(id, obj.tracks.map(toSong));
      router.push(`/playlists/${id}`);
    } catch {
      alert("Failed to import playlist");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <main className={shell.root}>
      <div className={shell.background} aria-hidden="true">
        <div className={shell.blobOne} />
        <div className={shell.blobTwo} />
      </div>

      <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />

      <div className={shell.content}>
        <div className={styles.root}>
          <header className={styles.header}>
            <button type="button" className={styles.menuButton} onClick={openSidebar} aria-label="Open menu">
              <Menu size={20} />
            </button>

            <div className={styles.titleBlock}>
              <div className={styles.title}>Playlists</div>
              <div className={styles.subtitle}>Create playlists and import Spotify playlists.</div>
            </div>

            <div className={styles.actions}>
              <button type="button" className={styles.actionButton} onClick={createNew} title="Create playlist">
                <PlusCircle size={18} />
                Create
              </button>
              <button
                type="button"
                className={styles.actionButton}
                onClick={() => void importFromSpotify()}
                disabled={isImporting}
                aria-disabled={isImporting}
                title={isImporting ? "Importing…" : "Import Spotify playlist"}
              >
                <Upload size={18} />
                Import
              </button>
            </div>
          </header>

          <section className={styles.content} aria-label="Your playlists">
            <div className={styles.sectionTitle}>Your playlists</div>

            {customPlaylists.length === 0 ? (
              <div className={styles.empty}>
                <div className={styles.emptyTitle}>No playlists yet</div>
                <div className={styles.emptySubtitle}>Create one or import from Spotify.</div>
              </div>
            ) : (
              <div className={styles.list}>
                {customPlaylists.map((playlist) => (
                  <div key={playlist.id} className={styles.row}>
                    <Link href={`/playlists/${playlist.id}`} className={styles.rowLink} title="Open playlist">
                      <div className={styles.rowTitle}>{playlist.name}</div>
                      <div className={styles.rowMeta}>{playlist.tracks.length} tracks</div>
                    </Link>
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={() => deletePlaylist(playlist.id)}
                        aria-label="Delete playlist"
                        title="Delete"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      <Player />
    </main>
  );
}
