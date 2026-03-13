"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Download, Menu, Trash2 } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import Player from "@/components/Player";
import { useMusic } from "@/context/MusicContext";
import shell from "../page.module.css";
import styles from "./page.module.css";

export default function LibraryPage() {
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

  const { history, playSong, downloadSong, clearHistory } = useMusic();

  const hasHistory = history.length > 0;
  const title = useMemo(() => `Recently played (${history.length})`, [history.length]);

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
              <div className={styles.title}>Library</div>
              <div className={styles.subtitle}>Your listening history lives on this device.</div>
            </div>

            <div className={styles.actions}>
              <button
                type="button"
                className={styles.actionButton}
                onClick={clearHistory}
                disabled={!hasHistory}
                aria-disabled={!hasHistory}
                title={hasHistory ? "Clear history" : "Nothing to clear"}
              >
                <Trash2 size={18} />
                Clear
              </button>
            </div>
          </header>

          <section className={styles.content} aria-label="History">
            <div className={styles.sectionTitle}>{title}</div>

            {hasHistory ? (
              <div className={styles.list}>
                {history.map((song) => (
                  <div
                    key={song.id}
                    className={styles.row}
                    role="button"
                    tabIndex={0}
                    onClick={() => playSong(song)}
                    title="Play"
                    aria-label={`Play ${song.title}`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        playSong(song);
                      }
                    }}
                  >
                    <div className={styles.art}>
                      <Image
                        src={song.image}
                        alt={song.title}
                        fill
                        sizes="56px"
                        style={{ objectFit: "cover" }}
                      />
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
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.empty}>Play a song to see it here.</div>
            )}
          </section>
        </div>
      </div>

      <Player />
    </main>
  );
}
