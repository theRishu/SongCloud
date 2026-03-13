"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, Download, Heart, ListPlus, Menu, Play, PlusCircle, Search as SearchIcon, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMusic } from "@/context/MusicContext";
import styles from "./SearchBar.module.css";

type SearchBarProps = {
  onOpenSidebar: () => void;
};

type SearchResult = {
  id: string;
  title: string;
  subtitle?: string;
  image: string;
  source?: "spotify" | "jio";
  url?: string;
};

type TrendingItem = {
  id: string;
  title: string;
  subtitle: string;
  image: string;
};

type PlaylistApiTrack = {
  id: string;
  title: string;
  subtitle?: string;
  image: string;
  source: string;
  url?: string;
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

const searchCache = new Map<string, SearchResult[]>();
const chartCache = new Map<string, SearchResult[]>();
let trendingCache: TrendingItem[] | null = null;

function isSearchResult(value: unknown): value is SearchResult {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  const source = obj.source;
  const isSourceValid = source === "spotify" || source === "jio" || typeof source === "undefined";
  return typeof obj.id === "string" && typeof obj.title === "string" && typeof obj.image === "string" && isSourceValid;
}

function isTrendingItem(value: unknown): value is TrendingItem {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.title === "string" &&
    typeof obj.subtitle === "string" &&
    typeof obj.image === "string"
  );
}

function toSong(value: SearchResult | PlaylistApiTrack) {
  return {
    id: value.id,
    title: value.title,
    artists: value.subtitle,
    image: value.image,
    source: (typeof value.source === "string" ? value.source : "jio") as "spotify" | "jio",
    url: typeof value.url === "string" ? value.url : undefined,
  };
}

function getErrorMessage(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  return typeof obj.error === "string" ? obj.error : null;
}

function normalizeQuery(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function getShareOrigin() {
  const configured = (process.env.NEXT_PUBLIC_APP_ORIGIN ?? "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  return typeof window !== "undefined" ? window.location.origin : "";
}

type Toast = { type: "success" | "error" | "info"; message: string };

export default function SearchBar({ onOpenSidebar }: SearchBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [trending, setTrending] = useState<TrendingItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importRaw, setImportRaw] = useState("");
  const [importMode, setImportMode] = useState<"new" | "existing">("new");
  const [importTargetId, setImportTargetId] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const [songToAdd, setSongToAdd] = useState<SearchResult | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState("");

  const { playSong, downloadSong, playlists, createPlaylist, addToPlaylist, addManyToPlaylist, toggleLike, isLiked } =
    useMusic();

  const urlQuery = searchParams.get("q") || "";

  const showToast = useCallback((message: string, type: Toast["type"] = "info") => {
    setToast({ message, type });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timeout);
  }, [toast]);

  const playlistOptions = useMemo(() => playlists, [playlists]);

  useEffect(() => {
    if (importMode !== "existing") return;
    if (importTargetId) return;
    if (playlistOptions.length === 0) return;
    setImportTargetId(playlistOptions[0].id);
  }, [importMode, importTargetId, playlistOptions]);

  const closeImport = useCallback(() => {
    setIsImportOpen(false);
    setImportError(null);
    setIsImporting(false);
    setImportRaw("");
    setImportMode("new");
    setImportTargetId("");
  }, []);

  const closeAddSong = useCallback(() => {
    setSongToAdd(null);
    setNewPlaylistName("");
  }, []);

  useEffect(() => {
    if (!isImportOpen && !songToAdd) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (songToAdd) closeAddSong();
      if (isImportOpen) closeImport();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeAddSong, closeImport, isImportOpen, songToAdd]);

  useEffect(() => {
    if (urlQuery === query) return;

    if (query) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("q", query);
      params.delete("chart");
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    } else {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("q");
      params.delete("chart");
      const next = params.toString();
      router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
    }
  }, [pathname, query, urlQuery, router, searchParams]);

  useEffect(() => {
    const fetchTrending = async () => {
      if (trendingCache) {
        setTrending(trendingCache);
        return;
      }

      try {
        const res = await fetch(`/api/trending?limit=15`);
        const data: unknown = await res.json();
        if (!Array.isArray(data)) return;

        const parsed = data.filter(isTrendingItem);
        trendingCache = parsed;
        setTrending(parsed);
      } catch (e) {
        console.error("Failed to fetch trending:", e);
      }
    };

    fetchTrending();
  }, []);

  useEffect(() => {
    const fetchResults = async () => {
      if (query.length < 2) {
        setResults([]);
        return;
      }

      const chartFromUrlRaw = searchParams.get("chart");
      const chartFromUrl =
        chartFromUrlRaw && /^[0-9]{1,32}$/.test(chartFromUrlRaw.trim()) ? chartFromUrlRaw.trim() : null;

      const chartId = chartFromUrl ?? null;
      if (chartId) {
        const cached = chartCache.get(chartId);
        if (cached) {
          setResults(cached);
          return;
        }

        setIsSearching(true);
        try {
          const res = await fetch(`/api/chart?id=${encodeURIComponent(chartId)}&limit=50`);
          const data: unknown = await res.json().catch(() => null);

          if (!res.ok) {
            const message = getErrorMessage(data) ?? `Chart fetch failed (${res.status})`;
            showToast(message, "error");
            setResults([]);
            return;
          }

          const obj = data as Record<string, unknown> | null;
          const tracksRaw = obj?.tracks;
          if (!Array.isArray(tracksRaw)) {
            setResults([]);
            return;
          }

          const parsed = tracksRaw.filter(isSearchResult);
          chartCache.set(chartId, parsed);
          setResults(parsed);
          return;
        } catch (error) {
          console.error("Chart fetch failed:", error);
          showToast("Chart fetch failed", "error");
          setResults([]);
          return;
        } finally {
          setIsSearching(false);
        }
      }

      const chartMatch = trending.find((item) => normalizeQuery(item.title) === normalizeQuery(query));
      if (chartMatch) {
        const cached = chartCache.get(chartMatch.id);
        if (cached) {
          setResults(cached);
          return;
        }

        setIsSearching(true);
        try {
          const res = await fetch(`/api/chart?id=${encodeURIComponent(chartMatch.id)}&limit=50`);
          const data: unknown = await res.json().catch(() => null);

          if (!res.ok) {
            const message = getErrorMessage(data) ?? `Chart fetch failed (${res.status})`;
            showToast(message, "error");
            setResults([]);
            return;
          }

          const obj = data as Record<string, unknown> | null;
          const tracksRaw = obj?.tracks;
          if (!Array.isArray(tracksRaw)) {
            setResults([]);
            return;
          }

          const parsed = tracksRaw.filter(isSearchResult);
          chartCache.set(chartMatch.id, parsed);
          setResults(parsed);
          return;
        } catch (error) {
          console.error("Chart fetch failed:", error);
          showToast("Chart fetch failed", "error");
          setResults([]);
          return;
        } finally {
          setIsSearching(false);
        }
      }

      const cached = searchCache.get(query);
      if (cached) {
        setResults(cached);
        return;
      }

      setIsSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data: unknown = await res.json();
        if (!Array.isArray(data)) {
          setResults([]);
          return;
        }

        const parsed = data.filter(isSearchResult);
        searchCache.set(query, parsed);
        setResults(parsed);
      } catch (error) {
        console.error("Search failed:", error);
      } finally {
        setIsSearching(false);
      }
    };

    const timeout = setTimeout(fetchResults, 300);
    return () => clearTimeout(timeout);
  }, [query, searchParams, trending, showToast]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Link copied", "success");
    } catch (err) {
      console.error("Failed to copy:", err);
      showToast("Copy failed", "error");
    }
  };

  const playPlaylist = async (item: TrendingItem) => {
    // In a real app, we'd fetch the playlist songs. 
    // For now, we search for the title to show songs.
    setQuery(item.title);
  };

  const importSpotifyPlaylist = useCallback(async () => {
    const raw = importRaw.trim();
    if (!raw) return;

    setImportError(null);
    setIsImporting(true);
    try {
      const res = await fetch(`/api/playlist?id=${encodeURIComponent(raw)}&limit=2000`);
      const data: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        const message = getErrorMessage(data) ?? `Playlist import failed (${res.status})`;
        const retryAfter = res.headers.get("Retry-After");
        setImportError(res.status === 429 && retryAfter ? `${message} Retry after ${retryAfter}s.` : message);
        return;
      }

      const obj = data as Partial<PlaylistApiResponse>;
      if (!obj.title || !Array.isArray(obj.tracks)) {
        setImportError("Playlist response invalid");
        return;
      }

      const songs = obj.tracks.map(toSong);

      let targetId = importTargetId;
      if (importMode === "new") {
        targetId = createPlaylist(obj.title);
      } else if (!targetId) {
        setImportError("Select a playlist to add into.");
        return;
      }

      addManyToPlaylist(targetId, songs);
      closeImport();
      router.push(`/playlists/${targetId}`);

      const total = typeof obj.total === "number" ? obj.total : songs.length;
      const truncated = Boolean(obj.truncated);
      showToast(
        `Imported ${songs.length}/${total} tracks${truncated ? " (truncated)" : ""}`,
        truncated ? "info" : "success"
      );
    } catch (error) {
      console.error("Playlist import failed:", error);
      setImportError("Failed to import playlist");
    } finally {
      setIsImporting(false);
    }
  }, [addManyToPlaylist, closeImport, createPlaylist, importMode, importRaw, importTargetId, router, showToast]);

  const addSongIntoPlaylist = useCallback(
    (playlistId: string, result: SearchResult) => {
      addToPlaylist(playlistId, toSong(result));
      closeAddSong();
      const playlistName = playlistOptions.find((p) => p.id === playlistId)?.name ?? "playlist";
      showToast(`Added to "${playlistName}"`, "success");
    },
    [addToPlaylist, closeAddSong, playlistOptions, showToast]
  );

  const createPlaylistAndAddSong = useCallback(() => {
    if (!songToAdd) return;
    const cleaned = newPlaylistName.trim();
    if (!cleaned) {
      showToast("Enter a playlist name", "error");
      return;
    }
    const id = createPlaylist(cleaned);
    addToPlaylist(id, toSong(songToAdd));
    closeAddSong();
    showToast(`Created "${cleaned}"`, "success");
    router.push(`/playlists/${id}`);
  }, [addToPlaylist, closeAddSong, createPlaylist, newPlaylistName, router, showToast, songToAdd]);

  return (
    <div className={styles.root}>
      <AnimatePresence>
        {toast ? (
          <motion.div
            key="toast"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`${styles.toast} ${
              toast.type === "success" ? styles.toastSuccess : toast.type === "error" ? styles.toastError : ""
            }`}
            role="status"
            aria-live="polite"
          >
            {toast.message}
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isImportOpen ? (
          <motion.div
            key="importOverlay"
            className={styles.dialogOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeImport}
            role="presentation"
          >
            <motion.div
              className={styles.dialog}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Import Spotify playlist"
            >
              <div className={styles.dialogHeader}>
                <div>
                  <div className={styles.dialogTitle}>Import Spotify playlist</div>
                  <div className={styles.dialogSubtitle}>Save it into your local playlists.</div>
                </div>
                <button type="button" className={styles.dialogClose} onClick={closeImport} aria-label="Close">
                  <X size={18} />
                </button>
              </div>

              <div className={styles.dialogBody}>
                <label className={styles.dialogLabel} htmlFor="spotify-playlist">
                  Playlist URL / ID
                </label>
                <input
                  id="spotify-playlist"
                  className={styles.dialogInput}
                  placeholder="https://open.spotify.com/playlist/…"
                  value={importRaw}
                  onChange={(e) => setImportRaw(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />

                <div className={styles.dialogRadioRow} role="radiogroup" aria-label="Import mode">
                  <label className={styles.dialogRadio}>
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === "new"}
                      onChange={() => setImportMode("new")}
                    />
                    New playlist
                  </label>
                  <label className={styles.dialogRadio}>
                    <input
                      type="radio"
                      name="importMode"
                      checked={importMode === "existing"}
                      onChange={() => setImportMode("existing")}
                    />
                    Add to existing
                  </label>
                </div>

                {importMode === "existing" ? (
                  <div className={styles.dialogRow}>
                    <label className={styles.dialogLabel} htmlFor="import-target">
                      Target playlist
                    </label>
                    <select
                      id="import-target"
                      className={styles.dialogSelect}
                      value={importTargetId}
                      onChange={(e) => setImportTargetId(e.target.value)}
                    >
                      {playlistOptions.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className={styles.dialogHint}>Creates a new playlist named after the Spotify playlist.</div>
                )}

                {importError ? <div className={styles.dialogError}>{importError}</div> : null}
              </div>

              <div className={styles.dialogActions}>
                <button type="button" className={styles.dialogButton} onClick={closeImport}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={`${styles.dialogButton} ${styles.dialogButtonPrimary}`}
                  onClick={() => void importSpotifyPlaylist()}
                  disabled={isImporting || !importRaw.trim()}
                  aria-disabled={isImporting || !importRaw.trim()}
                  title={isImporting ? "Importing…" : "Import"}
                >
                  {isImporting ? "Importing…" : "Import"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {songToAdd ? (
          <motion.div
            key="addOverlay"
            className={styles.dialogOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeAddSong}
            role="presentation"
          >
            <motion.div
              className={styles.dialog}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Add to playlist"
            >
              <div className={styles.dialogHeader}>
                <div>
                  <div className={styles.dialogTitle}>Add to playlist</div>
                  <div className={styles.dialogSubtitle}>{songToAdd.title}</div>
                </div>
                <button type="button" className={styles.dialogClose} onClick={closeAddSong} aria-label="Close">
                  <X size={18} />
                </button>
              </div>

              <div className={styles.dialogBody}>
                <div className={styles.playlistList} role="list">
                  {playlistOptions.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={styles.playlistRow}
                      onClick={() => addSongIntoPlaylist(p.id, songToAdd)}
                      role="listitem"
                      title={`Add to ${p.name}`}
                    >
                      <div className={styles.playlistRowTitle}>{p.name}</div>
                      <div className={styles.playlistRowMeta}>{p.tracks.length} tracks</div>
                    </button>
                  ))}
                </div>

                <div className={styles.dialogDivider} aria-hidden="true">
                  or
                </div>

                <div className={styles.newPlaylistRow}>
                  <input
                    className={styles.dialogInput}
                    placeholder="New playlist name…"
                    value={newPlaylistName}
                    onChange={(e) => setNewPlaylistName(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className={`${styles.dialogButton} ${styles.dialogButtonPrimary}`}
                    onClick={createPlaylistAndAddSong}
                    disabled={!newPlaylistName.trim()}
                    aria-disabled={!newPlaylistName.trim()}
                  >
                    Create
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.searchRow}>
            <button type="button" className={styles.menuButton} onClick={onOpenSidebar} aria-label="Open menu">
              <Menu size={20} />
            </button>

            <div className={styles.inputWrapper}>
              <SearchIcon className={styles.searchIcon} size={20} />
              <input
                type="text"
                placeholder="Search for songs, artists, or albums…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className={styles.input}
                inputMode="search"
                autoComplete="off"
                spellCheck={false}
              />
              {query ? (
                <button
                  type="button"
                  className={styles.clearButton}
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                >
                  <X size={18} />
                </button>
              ) : null}
            </div>
            
            <button
              type="button"
              onClick={() => setIsImportOpen(true)}
              className={`${styles.menuButton} ${styles.cloneButton}`}
              title="Import Spotify playlist"
              aria-label="Import Spotify playlist"
            >
              <PlusCircle size={22} color="#a78bfa" />
            </button>
          </div>
        </div>
      </header>

      <main className={`${styles.main} custom-scrollbar`}>
        <div className={styles.mainInner}>
          <AnimatePresence mode="wait">
            {query.length < 2 ? (
              <motion.div
                key="trending"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={styles.section}
              >
                <div className={styles.title}>Top Trending</div>
                <div className={styles.grid}>
                  {trending.length > 0
                    ? trending.map((item, idx) => (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, scale: 0.98 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: idx * 0.04 }}
                          className={styles.card}
                          onClick={() => setQuery(item.title)}
                        >
                          <div className={styles.art}>
                            <Image
                              src={item.image}
                              alt={item.title}
                              fill
                              sizes="(max-width: 900px) 45vw, 200px"
                              className={styles.artImage}
                            />
                            <div className={styles.imageOverlay}>
                              <button
                                type="button"
                                className={`${styles.actionButton} ${styles.playAction}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  playPlaylist(item);
                                }}
                                aria-label="Play Playlist"
                              >
                                <Play fill="white" size={22} />
                              </button>
                                  <button
                                type="button"
                                className={`${styles.actionButton} ${styles.downloadAction}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  copyToClipboard(
                                    getShareOrigin() +
                                      "/?q=" +
                                      encodeURIComponent(item.title) +
                                      "&chart=" +
                                      encodeURIComponent(item.id)
                                  );
                                }}
                                aria-label="Copy Link"
                              >
                                <Copy size={20} />
                              </button>
                            </div>
                          </div>
                          <div className={styles.cardTitle}>{item.title}</div>
                          <div className={styles.cardMetaRow}>
                            <div className={styles.cardSubtitle}>{item.subtitle}</div>
                          </div>
                        </motion.div>
                      ))
                    : [1, 2, 3, 4, 5].map((i) => <CardSkeleton key={i} />)}
                </div>
              </motion.div>
            ) : (
              <motion.div key="results" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                {isSearching ? (
                  <div className={styles.grid}>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                      <CardSkeleton key={i} />
                    ))}
                  </div>
                ) : results.length === 0 ? (
                  <div className={styles.empty}>
                    <div className={styles.emptyTitle}>No results</div>
                    <div className={styles.emptySubtitle}>Try a different search.</div>
                  </div>
                ) : (
                  <div className={styles.grid}>
                    {results.map((result, idx) => {
                      const song = toSong(result);
                      const liked = isLiked(song);

                      return (
                      <motion.div
                        key={`${result.source || "jio"}:${result.id}`}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: idx * 0.03 }}
                        className={styles.card}
                        role="button"
                        tabIndex={0}
                        onClick={() => playSong(song)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            playSong(song);
                          }
                        }}
                      >
                        <div className={styles.art}>
                          <Image
                            src={result.image}
                            alt={result.title}
                            fill
                            sizes="(max-width: 900px) 45vw, 200px"
                            className={styles.artImage}
                          />
                          <div className={styles.imageOverlay}>
                            <button
                              type="button"
                              className={`${styles.actionButton} ${styles.playAction}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                playSong(song);
                              }}
                              aria-label="Play"
                            >
                              <Play fill="white" size={22} />
                            </button>
                            <button
                               type="button"
                               className={`${styles.actionButton} ${styles.downloadAction}`}
                               onClick={(e) => {
                                 e.stopPropagation();
                                 copyToClipboard(getShareOrigin() + "/?q=" + encodeURIComponent(result.title));
                               }}
                               aria-label="Copy Link"
                             >
                               <Copy size={20} />
                             </button>
                             <button
                               type="button"
                               className={`${styles.actionButton} ${styles.downloadAction}`}
                               onClick={(e) => {
                                 e.stopPropagation();
                                 downloadSong(song);
                               }}
                               aria-label="Download"
                             >
                               <Download size={22} />
                             </button>
                             <button
                               type="button"
                               className={`${styles.actionButton} ${styles.downloadAction}`}
                               onClick={(e) => {
                                 e.stopPropagation();
                                 setSongToAdd(result);
                               }}
                               aria-label="Add to playlist"
                               title="Add to playlist"
                             >
                               <ListPlus size={22} />
                             </button>
                             <button
                               type="button"
                               className={`${styles.actionButton} ${styles.downloadAction}`}
                               onClick={(e) => {
                                 e.stopPropagation();
                                 toggleLike(song);
                                 showToast(liked ? "Removed from Liked" : "Added to Liked", "success");
                               }}
                               aria-label={liked ? "Unlike" : "Like"}
                               title={liked ? "Unlike" : "Like"}
                             >
                               <Heart size={22} fill={liked ? "white" : "none"} />
                             </button>
                          </div>
                        </div>

                        <div className={styles.cardTitle}>{result.title}</div>
                        <div className={styles.cardMetaRow}>
                          <div className={styles.cardSubtitle}>{result.subtitle}</div>
                          <span
                            className={`${styles.sourceBadge} ${
                              result.source === "spotify" ? styles.sourceBadgeSpotify : ""
                            }`}
                          >
                            {result.source === "spotify" ? "Spotify" : "Jio"}
                          </span>
                        </div>
                      </motion.div>
                    );
                    })}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <div className={styles.skeletonArt} />
      <div className={`${styles.skeletonLine} ${styles.skeletonLineWide}`} />
      <div className={`${styles.skeletonLine} ${styles.skeletonLineNarrow}`} />
    </div>
  );
}
