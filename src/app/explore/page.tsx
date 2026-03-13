"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import SearchBar from "@/components/SearchBar";
import Player from "@/components/Player";
import styles from "../page.module.css";

export default function Explore() {
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

  return (
    <main className={styles.root}>
      <div className={styles.background} aria-hidden="true">
        <div className={styles.blobOne} />
        <div className={styles.blobTwo} />
      </div>

      <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />

      <div className={styles.content}>
        <Suspense fallback={<div className={styles.loading}>Initializing…</div>}>
          <SearchBar onOpenSidebar={openSidebar} />
        </Suspense>
      </div>

      <Player />
    </main>
  );
}

