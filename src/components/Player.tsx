
"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Maximize2, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume2 } from "lucide-react";
import Image from "next/image";
import React from "react";
import { useMusic } from "@/context/MusicContext";
import styles from "./Player.module.css";

function formatTime(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "0:00";
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

export default function Player() {
  const shouldReduceMotion = useReducedMotion();
  const {
    currentSong,
    isPlaying,
    togglePlay,
    currentTime,
    duration,
    seekTo,
    volume,
    setVolume,
    queue,
    nextTrack,
    previousTrack,
    isShuffle,
    toggleShuffle,
    repeatMode,
    cycleRepeat,
  } = useMusic();
  const progressBarRef = React.useRef<HTMLDivElement | null>(null);
  const isSeekingRef = React.useRef(false);

  const safeDuration = currentSong ? (duration > 0 ? duration : (currentSong.duration ?? 0)) : 0;
  const safeCurrentTime = Math.min(Math.max(currentTime, 0), safeDuration || Infinity);

  // Use useMemo for performance and to satisfy the hook count consistency
  const progress = React.useMemo(() => {
    if (!safeDuration || safeDuration <= 0) return 0;
    return Math.min(100, Math.max(0, (safeCurrentTime / safeDuration) * 100));
  }, [safeCurrentTime, safeDuration]);

  if (!currentSong) return null;

  const seekFromClientX = (clientX: number) => {
    const bar = progressBarRef.current;
    if (!bar || !safeDuration) return;

    const rect = bar.getBoundingClientRect();
    if (rect.width <= 0) return;

    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    seekTo(ratio * safeDuration);
  };

  return (
    <motion.div
      initial={shouldReduceMotion ? false : { y: 100 }}
      animate={shouldReduceMotion ? undefined : { y: 0 }}
      className={`${styles.player} glass`}
      role="region"
      aria-label="Player"
    >
      <div className={styles.songInfo}>
        <motion.div
          animate={shouldReduceMotion ? undefined : { scale: isPlaying ? 1.03 : 1 }}
          transition={shouldReduceMotion ? undefined : { duration: 0.35, ease: "easeOut" }}
          className={styles.cover}
        >
          <Image
            src={currentSong.image}
            alt={currentSong.title}
            fill
            sizes="(max-width: 900px) 48px, 56px"
            className={styles.coverImage}
          />
        </motion.div>

        <div className={styles.meta}>
          <div className={styles.titleRow}>
            <div className={styles.songTitle}>{currentSong.title}</div>
            {currentSong.quality === "FLAC" ? <span className={styles.badge}>FLAC</span> : null}
          </div>
          <div className={styles.songSubtitle}>{currentSong.artists || currentSong.album}</div>
        </div>
      </div>

      <div className={styles.controls}>
        <div className={styles.controlRow} aria-label="Controls">
          <button
            type="button"
            className={`${styles.iconButton} ${styles.secondaryControl} ${isShuffle ? styles.activeControl : ""}`}
            aria-label="Shuffle"
            aria-pressed={isShuffle}
            onClick={toggleShuffle}
            title={isShuffle ? "Shuffle on" : "Shuffle off"}
          >
            <Shuffle size={18} />
          </button>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.secondaryControl}`}
            aria-label="Previous"
            onClick={previousTrack}
            disabled={queue.length <= 1}
            aria-disabled={queue.length <= 1}
            title={queue.length <= 1 ? "No previous track" : "Previous"}
          >
            <SkipBack size={22} />
          </button>
          <button type="button" onClick={togglePlay} className={styles.playButton} aria-label={isPlaying ? "Pause" : "Play"}>
            {isPlaying ? <Pause size={22} /> : <Play size={22} />}
          </button>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.secondaryControl}`}
            aria-label="Next"
            onClick={nextTrack}
            disabled={queue.length <= 1}
            aria-disabled={queue.length <= 1}
            title={queue.length <= 1 ? "No next track" : "Next"}
          >
            <SkipForward size={22} />
          </button>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.secondaryControl} ${repeatMode !== "off" ? styles.activeControl : ""}`}
            aria-label="Repeat"
            aria-pressed={repeatMode !== "off"}
            onClick={cycleRepeat}
            title={
              repeatMode === "one" ? "Repeat one" : repeatMode === "all" ? "Repeat all" : "Repeat off"
            }
          >
            {repeatMode === "one" ? <Repeat1 size={18} /> : <Repeat size={18} />}
          </button>
        </div>

        <div className={styles.progressRow}>
          <span className={styles.time}>{formatTime(safeCurrentTime)}</span>
          <div
            ref={progressBarRef}
            className={styles.progressBar}
            role="slider"
            tabIndex={0}
            aria-label="Seek"
            aria-valuemin={0}
            aria-valuemax={Math.floor(safeDuration || 0)}
            aria-valuenow={Math.floor(safeCurrentTime)}
            onClick={(e) => seekFromClientX(e.clientX)}
            onPointerDown={(e) => {
              isSeekingRef.current = true;
              e.currentTarget.setPointerCapture(e.pointerId);
              seekFromClientX(e.clientX);
            }}
            onPointerMove={(e) => {
              if (!isSeekingRef.current) return;
              seekFromClientX(e.clientX);
            }}
            onPointerUp={() => {
              isSeekingRef.current = false;
            }}
            onPointerCancel={() => {
              isSeekingRef.current = false;
            }}
            onKeyDown={(e) => {
              if (!safeDuration) return;
              const step = 5;
              if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
                e.preventDefault();
                seekTo(safeCurrentTime - step);
              } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
                e.preventDefault();
                seekTo(safeCurrentTime + step);
              } else if (e.key === "Home") {
                e.preventDefault();
                seekTo(0);
              } else if (e.key === "End") {
                e.preventDefault();
                seekTo(safeDuration);
              }
            }}
          >
            <motion.div className={styles.progressFill} style={{ width: `${progress}%` }} />
            <div className={styles.progressKnob} style={{ left: `${progress}%` }} />
          </div>
          <span className={styles.time}>{formatTime(safeDuration)}</span>
        </div>
      </div>

      <div className={styles.extras}>
        <div className={styles.volume}>
          <Volume2 size={18} />
          <input
            className={styles.volumeSlider}
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label="Volume"
          />
        </div>
        <button type="button" className={styles.iconButton} aria-label="Expand">
          <Maximize2 size={18} />
        </button>
      </div>
    </motion.div>
  );
}
