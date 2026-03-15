"use client";

import React, { useCallback, useEffect, useState } from "react";
import Sidebar from "@/components/Sidebar";
import Player from "@/components/Player";
import { useMusic } from "@/context/MusicContext";
import styles from "./AppShell.module.css";

type AppShellRenderProps = {
  isSidebarOpen: boolean;
  openSidebar: () => void;
  closeSidebar: () => void;
};

export default function AppShell({
  children,
}: {
  children: (props: AppShellRenderProps) => React.ReactNode;
}) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { currentSong, togglePlay } = useMusic();

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

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.code !== "Space") return;
      if (!currentSong) return;

      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTypingTarget =
        tag === "input" || tag === "textarea" || tag === "select" || Boolean(target?.isContentEditable);
      if (isTypingTarget) return;

      e.preventDefault();
      togglePlay();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentSong, togglePlay]);

  return (
    <main className={styles.root}>
      <div className={styles.background} aria-hidden="true">
        <div className={styles.blobOne} />
        <div className={styles.blobTwo} />
      </div>

      <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />

      <div className={styles.content}>{children({ isSidebarOpen, openSidebar, closeSidebar })}</div>

      <Player />
    </main>
  );
}
