
"use client";

import { useEffect } from "react";
import { Heart, Home, Library, ListMusic, PlusCircle, Search, X, DownloadCloud } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMusic } from "@/context/MusicContext";
import styles from "./Sidebar.module.css";

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { createPlaylist } = useMusic();

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const closeIfOpen = () => {
    if (isOpen) onClose();
  };

  const openCreatePlaylist = () => {
    const name = prompt("Playlist name:");
    if (!name) return;
    const id = createPlaylist(name);
    closeIfOpen();
    router.push(`/playlists/${id}`);
  };

  const isPlaylistsActive = pathname === "/playlists" || pathname.startsWith("/playlists/");

  return (
    <>
      <button
        type="button"
        className={clsx(styles.overlay, isOpen && styles.overlayOpen)}
        onClick={onClose}
        aria-label="Close menu"
      />

      <aside className={clsx("glass", styles.sidebar, isOpen && styles.sidebarOpen)}>
        <div className={styles.brandRow}>
          <div className={styles.brandLeft}>
            <div className={styles.logoIcon}>
              <Library color="#ffffff" size={22} />
            </div>
            <h1 className={clsx(styles.brandText, "gradient-text")}>SongCloud</h1>
          </div>

          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <nav className={styles.section} aria-label="Menu">
          <p className={styles.sectionTitle}>Menu</p>
          <NavItem href="/" icon={<Home size={20} />} label="Home" active={pathname === "/"} onSelect={closeIfOpen} />
          <NavItem
            href="/explore"
            icon={<Search size={20} />}
            label="Explore"
            active={pathname === "/explore"}
            onSelect={closeIfOpen}
          />
          <NavItem
            href="/library"
            icon={<Library size={20} />}
            label="Library"
            active={pathname === "/library"}
            onSelect={closeIfOpen}
          />
          <NavItem
            href="/spotify-download"
            icon={<DownloadCloud size={20} />}
            label="Downloader"
            active={pathname === "/spotify-download"}
            onSelect={closeIfOpen}
          />
        </nav>

        <nav className={styles.section} aria-label="Your Playlist">
          <p className={styles.sectionTitle}>Your Playlist</p>
          <NavItem href="/playlists" icon={<ListMusic size={20} />} label="Playlists" active={isPlaylistsActive} onSelect={closeIfOpen} />
          <NavItem href="/playlists/liked" icon={<Heart size={20} />} label="Liked Songs" active={pathname === "/playlists/liked"} onSelect={closeIfOpen} />
          <NavItem icon={<PlusCircle size={20} />} label="Create New" onSelect={openCreatePlaylist} />
        </nav>
      </aside>
    </>
  );
}

function NavItem({
  icon,
  label,
  active = false,
  href,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  href?: string;
  onSelect?: () => void;
}) {
  const className = clsx(styles.navItem, active && styles.navItemActive);

  if (href) {
    return (
      <Link href={href} className={className} aria-current={active ? "page" : undefined} onClick={onSelect}>
        <span className={styles.navIcon}>{icon}</span>
        <span className={styles.navLabel}>{label}</span>
      </Link>
    );
  }

  return (
    <button
      type="button"
      className={className}
      aria-current={active ? "page" : undefined}
      onClick={onSelect}
    >
      <span className={styles.navIcon}>{icon}</span>
      <span className={styles.navLabel}>{label}</span>
    </button>
  );
}
