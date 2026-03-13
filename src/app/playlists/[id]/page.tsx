"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ArrowLeft, Download, Menu, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import Player from "@/components/Player";
import { useMusic } from "@/context/MusicContext";
import shell from "../../page.module.css";
import styles from "./page.module.css";

function safeFilename(name: string) {
  return name.replace(/[^\w.-]+/g, "_").slice(0, 80) || "playlist";
}

export default function PlaylistDetailsPage() {
  const params = useParams<{ id?: string }>();
  const playlistId = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";
  const router = useRouter();

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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

  const { playlists, playSong, downloadSong, removeFromPlaylist, deletePlaylist, renamePlaylist } = useMusic();

  const playlist = useMemo(() => playlists.find((p) => p.id === playlistId) ?? null, [playlists, playlistId]);

  const exportJson = () => {
    if (!playlist) return;
    const payload = { ...playlist, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeFilename(playlist.name)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRename = () => {
    if (!playlist || playlist.system) return;
    const next = prompt("New playlist name:", playlist.name);
    if (!next) return;
    renamePlaylist(playlist.id, next);
  };

  const handleDelete = () => {
    if (!playlist || playlist.system) return;
    if (!confirm(`Delete "${playlist.name}"?`)) return;
    deletePlaylist(playlist.id);
    router.push("/playlists");
  };

  if (!playlist) {
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
                <div className={styles.title}>Playlist not found</div>
                <div className={styles.subtitle}>This playlist does not exist on this device.</div>
              </div>
            </header>
            <div className={styles.content}>
              <Link href="/playlists" className={styles.backLink}>
                <ArrowLeft size={16} />
                Back to playlists
              </Link>
            </div>
          </div>
        </div>

        <Player />
      </main>
    );
  }

  const hasTracks = playlist.tracks.length > 0;

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
              <div className={styles.titleRow}>
                <Link href="/playlists" className={styles.backIcon} aria-label="Back to playlists" title="Back">
                  <ArrowLeft size={18} />
                </Link>
                <div className={styles.title}>{playlist.name}</div>
              </div>
              <div className={styles.subtitle}>{playlist.tracks.length} tracks</div>
            </div>

            <div className={styles.actions}>
              <button type="button" className={styles.actionButton} onClick={exportJson} title="Export JSON">
                Export
              </button>
              {!playlist.system ? (
                <>
                  <button type="button" className={styles.iconButton} onClick={handleRename} aria-label="Rename" title="Rename">
                    <Pencil size={18} />
                  </button>
                  <button type="button" className={styles.iconButton} onClick={handleDelete} aria-label="Delete" title="Delete">
                    <Trash2 size={18} />
                  </button>
                </>
              ) : null}
            </div>
          </header>

          <section className={styles.content} aria-label="Tracks">
            {hasTracks ? (
              <div className={styles.list}>
                {playlist.tracks.map((song) => (
                  <div
                    key={`${song.source || "jio"}:${song.id}`}
                    className={styles.row}
                    role="button"
                    tabIndex={0}
                    onClick={() => playSong(song)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        playSong(song);
                      }
                    }}
                    title="Play"
                    aria-label={`Play ${song.title}`}
                  >
                    <div className={styles.art}>
                      <Image src={song.image} alt={song.title} fill sizes="56px" style={{ objectFit: "cover" }} />
                    </div>
                    <div className={styles.meta}>
                      <div className={styles.songTitle}>{song.title}</div>
                      <div className={styles.songSubtitle}>{song.artists || song.album}</div>
                    </div>
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.iconButton}
                        onClick={(e) => {
                          e.stopPropagation();
                          void downloadSong(song);
                        }}
                        aria-label="Download"
                        title="Download"
                      >
                        <Download size={18} />
                      </button>
                      {!playlist.system ? (
                        <button
                          type="button"
                          className={styles.iconButton}
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromPlaylist(playlist.id, song);
                          }}
                          aria-label="Remove"
                          title="Remove"
                        >
                          <Trash2 size={18} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>Add tracks from search to see them here.</div>
            )}
          </section>
        </div>
      </div>

      <Player />
    </main>
  );
}

