import React, { useRef, useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Play,
  Pause,
  ListOrdered,
  Mic2,
  Disc3,
  PictureInPicture2,
  Moon,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { audioEngine } from '../services/audioEngine';
import { formatTime, getTrackColor } from '../utils/helpers';
import {
  AnimatedVolume,
  AnimatedShuffle,
  AnimatedRepeat,
  AnimatedHeart,
  AnimatedSkip,
} from './icons';

interface PlayerBarProps {
  onToggleLyrics: () => void;
  isLyricsActive: boolean;
  onToggleQueue: () => void;
  isQueueActive: boolean;
}

export const PlayerBar: React.FC<PlayerBarProps> = ({
  onToggleLyrics,
  isLyricsActive,
  onToggleQueue,
  isQueueActive,
}) => {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    volume,
    isMuted,
    shuffle,
    repeatMode,
    queue,
    likedTrackIds,
    togglePlay,
    nextTrack,
    prevTrack,
    seekTo,
    setVolumeLevel,
    toggleMute,
    toggleShuffle,
    cycleRepeat,
    toggleLike,
    toggleMiniPlayer,
    sleepTimerMinutes,
    sleepTimerRemainingSec,
    setSleepTimer,
    coverMap,
    themeAppearance,
  } = usePlayer();
  const isGlass = themeAppearance === 'aura_glass';

  // Playbar drag & scrubbing state + DOM refs for 0ms lag synchronization
  const progressBarRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const progressKnobRef = useRef<HTMLDivElement>(null);
  const currentTimeDisplayRef = useRef<HTMLSpanElement>(null);
  const hoverLineRef = useRef<HTMLDivElement>(null);
  const hoverTooltipRef = useRef<HTMLDivElement>(null);
  const isDraggingProgressRef = useRef<boolean>(false);
  const [isDraggingProgress, setIsDraggingProgress] = useState<boolean>(false);
  const [dragProgressPercent, setDragProgressPercent] = useState<number | null>(null);
  const lastRealtimeSeekRef = useRef<number>(0);

  // Volume bar drag state + DOM refs for 0ms lag synchronization
  const volumeBarRef = useRef<HTMLDivElement>(null);
  const volumeFillRef = useRef<HTMLDivElement>(null);
  const volumeKnobRef = useRef<HTMLDivElement>(null);
  const volumeTooltipRef = useRef<HTMLDivElement>(null);
  const isDraggingVolumeRef = useRef<boolean>(false);
  const [isDraggingVolume, setIsDraggingVolume] = useState<boolean>(false);
  const [showVolumeTooltip, setShowVolumeTooltip] = useState<boolean>(false);

  const [isSleepMenuOpen, setIsSleepMenuOpen] = useState<boolean>(false);
  const sleepMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sleepMenuRef.current && !sleepMenuRef.current.contains(e.target as Node)) {
        setIsSleepMenuOpen(false);
      }
    };
    if (isSleepMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isSleepMenuOpen]);

  const isLiked = currentTrack ? likedTrackIds.has(currentTrack.id) : false;

  // Real-time audio seek: throttled to ~30ms to provide fluid realtime audio scrub without audio buffer stutter
  const performRealtimeSeek = (time: number) => {
    const now = performance.now();
    if (now - lastRealtimeSeekRef.current >= 30) {
      lastRealtimeSeekRef.current = now;
      audioEngine.seek(time);
    }
  };

  // Helper to calculate progress ratio from clientX
  const getProgressRatio = (clientX: number): number => {
    if (!progressBarRef.current) return 0;
    const rect = progressBarRef.current.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const handleProgressPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !progressBarRef.current || duration <= 0) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    isDraggingProgressRef.current = true;
    setIsDraggingProgress(true);

    // Hide hover line during dragging so there is no desynchronized line
    if (hoverLineRef.current) hoverLineRef.current.style.display = 'none';

    const ratio = getProgressRatio(e.clientX);
    const percent = ratio * 100;
    const targetTime = ratio * duration;

    // Instant synchronous DOM updates for zero latency between knob and line
    if (progressFillRef.current) progressFillRef.current.style.width = `${percent}%`;
    if (progressKnobRef.current) progressKnobRef.current.style.left = `${percent}%`;
    if (currentTimeDisplayRef.current) currentTimeDisplayRef.current.innerText = formatTime(targetTime);
    if (hoverTooltipRef.current) {
      hoverTooltipRef.current.style.left = `${percent}%`;
      hoverTooltipRef.current.innerText = formatTime(targetTime);
      hoverTooltipRef.current.style.display = 'block';
    }

    setDragProgressPercent(percent);
    performRealtimeSeek(targetTime);
  };

  const handleProgressPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration <= 0) return;
    const ratio = getProgressRatio(e.clientX);
    const percent = ratio * 100;
    const targetTime = ratio * duration;

    if (isDraggingProgressRef.current) {
      // Keep hover line hidden while dragging
      if (hoverLineRef.current) hoverLineRef.current.style.display = 'none';

      // Instant synchronous DOM updates
      if (progressFillRef.current) progressFillRef.current.style.width = `${percent}%`;
      if (progressKnobRef.current) progressKnobRef.current.style.left = `${percent}%`;
      if (currentTimeDisplayRef.current) currentTimeDisplayRef.current.innerText = formatTime(targetTime);
      if (hoverTooltipRef.current) {
        hoverTooltipRef.current.style.left = `${percent}%`;
        hoverTooltipRef.current.innerText = formatTime(targetTime);
        hoverTooltipRef.current.style.display = 'block';
      }

      setDragProgressPercent(percent);
      performRealtimeSeek(targetTime);
    } else {
      // Passive hover preview
      if (hoverLineRef.current) {
        hoverLineRef.current.style.width = `${percent}%`;
        hoverLineRef.current.style.display = 'block';
      }
      if (hoverTooltipRef.current) {
        hoverTooltipRef.current.style.left = `${percent}%`;
        hoverTooltipRef.current.innerText = formatTime(targetTime);
        hoverTooltipRef.current.style.display = 'block';
      }
    }
  };

  const handleProgressPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingProgressRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    isDraggingProgressRef.current = false;
    setIsDraggingProgress(false);

    if (progressBarRef.current && duration > 0) {
      const ratio = getProgressRatio(e.clientX);
      const targetTime = ratio * duration;
      seekTo(targetTime); // commit seek and persist last played
    }
    setDragProgressPercent(null);

    if (hoverLineRef.current) hoverLineRef.current.style.display = 'none';
    if (hoverTooltipRef.current) hoverTooltipRef.current.style.display = 'none';
  };

  const handleProgressPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingProgressRef.current) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      isDraggingProgressRef.current = false;
      setIsDraggingProgress(false);
      setDragProgressPercent(null);
      if (hoverLineRef.current) hoverLineRef.current.style.display = 'none';
      if (hoverTooltipRef.current) hoverTooltipRef.current.style.display = 'none';
    }
  };

  const handleProgressPointerLeave = () => {
    if (!isDraggingProgressRef.current) {
      if (hoverLineRef.current) hoverLineRef.current.style.display = 'none';
      if (hoverTooltipRef.current) hoverTooltipRef.current.style.display = 'none';
    }
  };

  const handleProgressKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (duration <= 0) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      seekTo(Math.min(duration, currentTime + 5));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      seekTo(Math.max(0, currentTime - 5));
    }
  };

  // Helper to calculate volume ratio from clientX
  const getVolumeRatio = (clientX: number): number => {
    if (!volumeBarRef.current) return 0;
    const rect = volumeBarRef.current.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const handleVolumePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !volumeBarRef.current) return;
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    isDraggingVolumeRef.current = true;
    setIsDraggingVolume(true);
    setShowVolumeTooltip(true);

    const ratio = getVolumeRatio(e.clientX);
    const pct = Math.round(ratio * 100);

    // Instant synchronous update on both fill and knob
    if (volumeFillRef.current) volumeFillRef.current.style.width = `${pct}%`;
    if (volumeKnobRef.current) volumeKnobRef.current.style.left = `${pct}%`;
    if (volumeTooltipRef.current) {
      volumeTooltipRef.current.style.left = `${pct}%`;
      volumeTooltipRef.current.innerText = `${pct}%`;
    }

    setVolumeLevel(ratio);
  };

  const handleVolumePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!volumeBarRef.current || !isDraggingVolumeRef.current) return;
    const ratio = getVolumeRatio(e.clientX);
    const pct = Math.round(ratio * 100);

    // Instant synchronous update on both fill and knob
    if (volumeFillRef.current) volumeFillRef.current.style.width = `${pct}%`;
    if (volumeKnobRef.current) volumeKnobRef.current.style.left = `${pct}%`;
    if (volumeTooltipRef.current) {
      volumeTooltipRef.current.style.left = `${pct}%`;
      volumeTooltipRef.current.innerText = `${pct}%`;
    }

    setVolumeLevel(ratio);
  };

  const handleVolumePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingVolumeRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    isDraggingVolumeRef.current = false;
    setIsDraggingVolume(false);
    setShowVolumeTooltip(false);
  };

  const handleVolumePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingVolumeRef.current) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      isDraggingVolumeRef.current = false;
      setIsDraggingVolume(false);
      setShowVolumeTooltip(false);
    }
  };

  const handleVolumeWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const step = 0.05;
    const delta = e.deltaY < 0 ? step : -step;
    setVolumeLevel(Math.max(0, Math.min(1, (isMuted ? 0 : volume) + delta)));
  };

  const handleVolumeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      setVolumeLevel(Math.min(1, (isMuted ? 0 : volume) + 0.05));
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      setVolumeLevel(Math.max(0, (isMuted ? 0 : volume) - 0.05));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setVolumeLevel(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setVolumeLevel(1);
    }
  };

  const progressPercent =
    isDraggingProgress && dragProgressPercent !== null
      ? dragProgressPercent
      : duration > 0
      ? (currentTime / duration) * 100
      : 0;

  const displayedCurrentTime =
    isDraggingProgress && dragProgressPercent !== null
      ? (dragProgressPercent / 100) * duration
      : currentTime;

  const effectiveVol = isMuted ? 0 : volume;
  const volPercent = Math.round(effectiveVol * 100);

  const handleLocateCurrentTrack = useCallback(() => {
    if (!currentTrack) return;
    window.dispatchEvent(
      new CustomEvent('locate-current-track', {
        detail: {
          track: currentTrack,
        },
      })
    );
  }, [currentTrack]);

  const trackColor = currentTrack
    ? getTrackColor(currentTrack.title, currentTrack.artist)
    : { bg: '#0D0B13', text: '#7E7A8A', glow: 'transparent' };

  return (
    <footer className={`h-[76px] shrink-0 px-4 md:px-6 flex items-center justify-between transition-colors duration-300 ${
      isGlass
        ? 'bg-[#0A0910]/55 backdrop-blur-2xl border-t border-white/[0.08] shadow-[0_-8px_32px_rgba(0,0,0,0.5)]'
        : 'bg-[#0E0E13]/98 backdrop-blur-3xl border-t border-white/[0.06] shadow-[0_-8px_32px_rgba(0,0,0,0.7)]'
    } z-20 select-none overflow-visible relative`}>
      {/* =========================================================================
          LEFT COLUMN: Now-Playing Track Info & High-Res Artwork
          ========================================================================= */}
      <div className="flex-1 min-w-0 max-w-[360px] flex items-center gap-3">
        {currentTrack ? (
          <>
            {/* High-res Album Art (52x52px) with click-to-locate navigation */}
            <div
              onClick={handleLocateCurrentTrack}
              className="relative group/cover w-[52px] h-[52px] rounded-xl overflow-hidden shrink-0 bg-[#0D0B13] border border-white/[0.08] shadow-[0_4px_16px_rgba(0,0,0,0.5)] transition-all duration-300 cursor-pointer hover:scale-105 active:scale-95"
              title={`Jump to "${currentTrack.title}" in library`}
            >
              {(() => {
                const nowPlayingCover = coverMap[currentTrack.id] || currentTrack.cover_art;
                return nowPlayingCover ? (
                  <img
                    key={nowPlayingCover}
                    src={nowPlayingCover}
                    alt={currentTrack.title}
                    className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover/cover:scale-110"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-sm font-bold"
                    style={{ background: trackColor.bg, color: trackColor.text }}
                  >
                    <Disc3 className={`w-5 h-5 ${isPlaying ? 'animate-spin' : ''}`} style={{ animationDuration: '6s' }} />
                  </div>
                );
              })()}

              {/* Subtle emerald ring when playing */}
              {isPlaying && (
                <div className="absolute inset-0 rounded-xl ring-1 ring-[var(--accent)]/40 pointer-events-none" />
              )}
            </div>

            {/* Track Title & Artist with click-to-locate navigation */}
            <AnimatePresence mode="wait">
              <motion.div
                key={currentTrack.id}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.15 }}
                className="flex flex-col min-w-0 justify-center flex-1 pr-1"
              >
                <span
                  onClick={handleLocateCurrentTrack}
                  className="text-[13px] font-bold text-[#FFFFFF] truncate leading-tight hover:text-[var(--accent)] hover:underline active:opacity-80 transition-all cursor-pointer"
                  title={`Jump to "${currentTrack.title}" in library`}
                >
                  {currentTrack.title}
                </span>
                <span
                  onClick={handleLocateCurrentTrack}
                  className="text-[11px] font-medium text-[#9C98A6] truncate leading-tight hover:text-white hover:underline active:opacity-80 transition-all cursor-pointer mt-0.5"
                  title={`Jump to "${currentTrack.artist}" in library`}
                >
                  {currentTrack.artist}
                </span>
              </motion.div>
            </AnimatePresence>

            {/* Animated Heart Button with pop micro-interaction */}
            <button
              onClick={() => toggleLike(currentTrack.id)}
              className={`group/heart relative p-2 rounded-full transition-all duration-200 active:scale-75 hover:scale-110 cursor-pointer shrink-0 ${
                isLiked
                  ? 'text-[#E8C77A] hover:bg-[#E8C77A]/10'
                  : 'text-[#65616F] hover:text-[#E8C77A] hover:bg-white/[0.06]'
              }`}
              title={isLiked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
              aria-label={isLiked ? 'Remove from Liked Songs' : 'Save to Liked Songs'}
            >
              <AnimatedHeart
                isLiked={isLiked}
                className="w-4 h-4 discord-icon discord-icon-heart"
              />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-3 text-xs text-[#7E7A8A]">
            <div className="w-[52px] h-[52px] rounded-xl bg-[#14121B] border border-white/[0.06] flex items-center justify-center shrink-0 shadow-inner">
              <Disc3 className="w-5 h-5 text-[#4B4854]" />
            </div>
            <div className="flex flex-col">
              <span className="text-[13px] font-bold text-[#65616F]">No track playing</span>
              <span className="text-[11px] text-[#4B4854]">Choose a song to start</span>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          CENTER COLUMN: Main Playback Controls & High-Precision Scrubber (~540px)
          ========================================================================= */}
      <div className="flex-1 max-w-[540px] px-2 sm:px-4 min-w-0 flex flex-col items-center justify-center gap-1.5">
        {/* Controls Row */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 md:gap-4">
          {/* Shuffle with active neon dot */}
          <button
            type="button"
            onClick={toggleShuffle}
            className={`group/shuffle relative w-8 h-8 aspect-square rounded-full flex items-center justify-center transition-all duration-200 hover:scale-108 active:scale-95 cursor-pointer shrink-0 ${
              shuffle ? 'text-[#19E6A0]' : 'text-[#94A3B8] hover:text-[#19E6A0] hover:bg-white/[0.08]'
            }`}
            title={shuffle ? 'Shuffle enabled' : 'Shuffle disabled'}
            aria-label="Shuffle"
          >
            <AnimatedShuffle active={shuffle} className="w-4 h-4 discord-icon discord-icon-shuffle" />
            {shuffle && (
              <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#19E6A0] shadow-[0_0_6px_#19E6A0] animate-in fade-in zoom-in duration-200" />
            )}
          </button>

          {/* Previous Track with perfect circular geometry & centered icon */}
          <button
            type="button"
            onClick={prevTrack}
            className="group/prev relative w-8 h-8 aspect-square rounded-full flex items-center justify-center text-[#94A3B8] hover:text-[#19E6A0] hover:bg-white/[0.08] active:bg-white/[0.14] transition-all duration-200 hover:scale-108 active:scale-92 cursor-pointer shrink-0 shadow-none hover:shadow-[0_0_10px_rgba(255,255,255,0.05)]"
            title="Previous (Ctrl+Left)"
            aria-label="Previous Track"
          >
            <AnimatedSkip direction="prev" className="w-4 h-4 discord-icon discord-icon-prev" />
          </button>

          {/* Play/Pause Button: 38x38px with signature emerald gradient & drop shadow */}
          <button
            type="button"
            onClick={togglePlay}
            style={{ background: 'linear-gradient(135deg, #1DB954, #19E6A0)' }}
            className="w-[38px] h-[38px] aspect-square rounded-full text-black flex items-center justify-center shadow-[0_2px_14px_rgba(25,230,160,0.38)] hover:shadow-[0_2px_20px_rgba(25,230,160,0.6)] transition-all duration-200 hover:scale-108 active:scale-95 cursor-pointer shrink-0"
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-black text-black discord-icon discord-icon-pop animate-in zoom-in duration-150" />
            ) : (
              <Play className="w-4 h-4 fill-black text-black ml-0.5 discord-icon discord-icon-pop animate-in zoom-in duration-150" />
            )}
          </button>

          {/* Next Track with perfect circular geometry & centered icon */}
          <button
            type="button"
            onClick={nextTrack}
            className="group/next relative w-8 h-8 aspect-square rounded-full flex items-center justify-center text-[#94A3B8] hover:text-[#19E6A0] hover:bg-white/[0.08] active:bg-white/[0.14] transition-all duration-200 hover:scale-108 active:scale-92 cursor-pointer shrink-0 shadow-none hover:shadow-[0_0_10px_rgba(255,255,255,0.05)]"
            title="Next (Ctrl+Right)"
            aria-label="Next Track"
          >
            <AnimatedSkip direction="next" className="w-4 h-4 discord-icon discord-icon-next" />
          </button>

          {/* Repeat Mode with active badge/dot ('1' or 'all') */}
          <button
            type="button"
            onClick={cycleRepeat}
            className={`group/repeat relative w-8 h-8 aspect-square rounded-full flex items-center justify-center transition-all duration-200 hover:scale-108 active:scale-95 cursor-pointer shrink-0 ${
              repeatMode !== 'off' ? 'text-[#19E6A0]' : 'text-[#94A3B8] hover:text-[#19E6A0] hover:bg-white/[0.08]'
            }`}
            title={`Repeat: ${repeatMode}`}
            aria-label={`Repeat: ${repeatMode}`}
          >
            <AnimatedRepeat
              mode={repeatMode}
              single={repeatMode === 'one'}
              className="w-4 h-4 discord-icon discord-icon-repeat"
            />
            {repeatMode === 'all' && (
              <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-[#19E6A0] shadow-[0_0_6px_#19E6A0] animate-in fade-in zoom-in duration-200" />
            )}
            {repeatMode === 'one' && (
              <span className="absolute -top-0.5 right-0.5 text-[8px] font-mono font-black text-[#19E6A0] leading-none drop-shadow-[0_0_4px_#19E6A0]">
                1
              </span>
            )}
          </button>
        </div>

        {/* Scrubber Row */}
        <div className="w-full flex items-center gap-2.5 font-mono text-[11px] text-[#7E7A8A]">
          <span ref={currentTimeDisplayRef} className="w-9 text-right shrink-0 tabular-nums">
            {formatTime(displayedCurrentTime)}
          </span>

          <div
            ref={progressBarRef}
            role="slider"
            tabIndex={0}
            aria-label="Seek track position"
            aria-valuenow={Math.round(displayedCurrentTime)}
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuetext={formatTime(displayedCurrentTime)}
            onPointerDown={handleProgressPointerDown}
            onPointerMove={handleProgressPointerMove}
            onPointerUp={handleProgressPointerUp}
            onPointerCancel={handleProgressPointerCancel}
            onPointerLeave={handleProgressPointerLeave}
            onKeyDown={handleProgressKeyDown}
            className={`relative flex-1 h-5 flex items-center min-w-[80px] select-none touch-none group/scrubber outline-none ${
              isDraggingProgress ? 'cursor-grabbing' : 'cursor-pointer'
            }`}
          >
            {/* Background Track: 4px base interactive track, expands slightly on hover */}
            <div
              className={`w-full bg-white/[0.12] rounded-full overflow-hidden relative transition-[height] duration-150 ${
                isDraggingProgress ? 'h-[5px]' : 'h-[4px] group-hover/scrubber:h-[5px]'
              }`}
            >
              {/* Hover preview line */}
              <div
                ref={hoverLineRef}
                className="absolute top-0 bottom-0 left-0 bg-white/20 rounded-full hidden pointer-events-none"
              />

              {/* Glowing Emerald Gradient Fill */}
              <div
                ref={progressFillRef}
                style={{
                  width: `${progressPercent}%`,
                  background: 'linear-gradient(90deg, #1DB954, #19E6A0)',
                }}
                className={`h-full rounded-full relative transition-none ${
                  isPlaying || isDraggingProgress ? 'shadow-[0_0_10px_rgba(25,230,160,0.4)]' : ''
                }`}
              />
            </div>

            {/* Smooth Playhead Knob: expands on hover/drag */}
            <div
              ref={progressKnobRef}
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 bg-white rounded-full ring-2 ring-[#19E6A0] shadow-[0_0_8px_rgba(25,230,160,0.7)] pointer-events-none transition-[width,height,opacity,transform] duration-150 ease-out ${
                isDraggingProgress
                  ? 'w-3 h-3 opacity-100 scale-110 ring-4 ring-[#19E6A0]/50 shadow-[0_0_12px_rgba(25,230,160,0.9)]'
                  : 'w-0 h-0 opacity-0 group-hover/scrubber:w-3 group-hover/scrubber:h-3 group-hover/scrubber:opacity-100'
              }`}
              style={{ left: `${progressPercent}%` }}
            />

            {/* Hover preview timestamp tooltip */}
            <div
              ref={hoverTooltipRef}
              className="absolute -top-8 px-2 py-0.5 rounded-md bg-[#14121B]/95 backdrop-blur-md border border-white/10 text-[10px] text-white font-mono -translate-x-1/2 shadow-xl hidden pointer-events-none z-30"
            >
              0:00
            </div>
          </div>

          <span className="w-9 text-left shrink-0 tabular-nums">
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* =========================================================================
          RIGHT COLUMN: Utility Island & Volume Slider
          ========================================================================= */}
      <div className="flex-1 min-w-0 max-w-[340px] flex items-center justify-end gap-1 sm:gap-1.5">
        {/* Live Lyrics button with microphone icon */}
        <button
          onClick={onToggleLyrics}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer shrink-0 ${
            isLyricsActive
              ? 'text-[#19E6A0] bg-[#19E6A0]/15 ring-1 ring-[#19E6A0]/30 shadow-[0_0_10px_rgba(25,230,160,0.25)]'
              : 'text-[#94A3B8] hover:text-[#19E6A0] hover:bg-white/[0.08]'
          }`}
          title={isLyricsActive ? 'Close Lyrics' : 'Live Lyrics'}
          aria-label="Toggle Lyrics"
        >
          <Mic2 className="w-4 h-4 discord-icon discord-icon-pop" />
        </button>

        {/* Queue drawer toggle with count badge */}
        <button
          onClick={onToggleQueue}
          className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer shrink-0 ${
            isQueueActive
              ? 'text-[#19E6A0] bg-[#19E6A0]/15 ring-1 ring-[#19E6A0]/30 shadow-[0_0_10px_rgba(25,230,160,0.25)]'
              : 'text-[#94A3B8] hover:text-[#19E6A0] hover:bg-white/[0.08]'
          }`}
          title="Playing Queue"
          aria-label="Toggle Playing Queue"
        >
          <ListOrdered className="w-4 h-4 discord-icon discord-icon-pop" />
          {queue && queue.length > 0 && (
            <span className="absolute -top-1 -right-1 px-1 min-w-[15px] h-3.5 rounded-full bg-[#19E6A0] text-black font-extrabold text-[9px] flex items-center justify-center leading-none shadow-[0_0_6px_rgba(25,230,160,0.6)]">
              {queue.length > 99 ? '99+' : queue.length}
            </span>
          )}
        </button>

        {/* Sleep timer dropdown with moon icon and countdown badge */}
        <div className="relative shrink-0" ref={sleepMenuRef}>
          <button
            onClick={() => setIsSleepMenuOpen((prev) => !prev)}
            className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer shrink-0 ${
              sleepTimerMinutes !== null
                ? 'text-[#19E6A0] bg-[#19E6A0]/15 ring-1 ring-[#19E6A0]/30 shadow-[0_0_10px_rgba(25,230,160,0.25)]'
                : 'text-[#94A3B8] hover:text-[#19E6A0] hover:bg-white/[0.08]'
            }`}
            title={
              sleepTimerRemainingSec !== null
                ? `Sleep Timer: ${Math.floor(sleepTimerRemainingSec / 60)}m ${sleepTimerRemainingSec % 60}s remaining`
                : 'Bedtime Sleep Timer'
            }
            aria-label="Bedtime Sleep Timer"
          >
            <Moon className="w-4 h-4 discord-icon discord-icon-shuffle" />
            {sleepTimerMinutes !== null && (
              <span className="absolute -top-1 -right-1 px-1 h-3.5 min-w-[15px] rounded-full bg-[#19E6A0] text-black font-bold text-[9px] font-mono flex items-center justify-center leading-none shadow-[0_0_6px_rgba(25,230,160,0.6)] animate-pulse">
                {sleepTimerRemainingSec !== null ? `${Math.ceil(sleepTimerRemainingSec / 60)}m` : '✓'}
              </span>
            )}
          </button>

          {/* Sleep Timer Dropdown Popup */}
          {isSleepMenuOpen && (
            <div className="absolute bottom-full mb-3 right-0 w-48 rounded-2xl bg-[#14141A]/95 backdrop-blur-2xl border border-white/[0.10] shadow-[0_16px_40px_rgba(0,0,0,0.85)] p-2.5 space-y-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-150 select-none">
              <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#94A3B8] border-b border-white/[0.08] mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Moon className="w-3 h-3 text-[#19E6A0]" />
                  Sleep Timer
                </span>
                {sleepTimerRemainingSec !== null && (
                  <span className="text-[#19E6A0] font-mono font-bold">
                    {Math.floor(sleepTimerRemainingSec / 60)}m {sleepTimerRemainingSec % 60}s
                  </span>
                )}
              </div>

              {[15, 30, 45, 60].map((mins) => (
                <button
                  key={mins}
                  onClick={() => {
                    setSleepTimer(mins);
                    setIsSleepMenuOpen(false);
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-lg text-left transition-all flex items-center justify-between cursor-pointer ${
                    sleepTimerMinutes === mins
                      ? 'bg-[#19E6A0]/15 text-[#19E6A0] font-semibold'
                      : 'text-[#94A3B8] hover:text-white hover:bg-white/[0.08]'
                  }`}
                >
                  <span>{mins} minutes</span>
                  {sleepTimerMinutes === mins && (
                    <div className="w-1.5 h-1.5 rounded-full bg-[#19E6A0] shadow-[0_0_6px_#19E6A0]" />
                  )}
                </button>
              ))}

              {duration > 0 && currentTime < duration && (
                <button
                  onClick={() => {
                    setSleepTimer(-1);
                    setIsSleepMenuOpen(false);
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-lg text-left transition-all flex items-center justify-between cursor-pointer ${
                    sleepTimerMinutes === -1
                      ? 'bg-[#19E6A0]/15 text-[#19E6A0] font-semibold'
                      : 'text-[#94A3B8] hover:text-white hover:bg-white/[0.08]'
                  }`}
                >
                  <span>End of track</span>
                  {sleepTimerMinutes === -1 ? (
                    <div className="w-1.5 h-1.5 rounded-full bg-[#19E6A0] shadow-[0_0_6px_#19E6A0]" />
                  ) : (
                    <span className="text-[10px] font-mono text-[#64748B]">
                      ~{Math.ceil((duration - currentTime) / 60)}m
                    </span>
                  )}
                </button>
              )}

              {sleepTimerMinutes !== null && (
                <div className="border-t border-white/[0.08] pt-1.5 mt-1.5">
                  <button
                    onClick={() => {
                      setSleepTimer(null);
                      setIsSleepMenuOpen(false);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg text-left text-[#FF667A] hover:bg-[#FF667A]/15 transition-colors flex items-center justify-between cursor-pointer font-medium"
                  >
                    <span>Turn off timer</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mini-player popout button */}
        <button
          onClick={toggleMiniPlayer}
          className="w-8 h-8 rounded-full flex items-center justify-center text-[#7E7A8A] hover:text-white hover:bg-white/[0.08] transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer shrink-0"
          title="Floating Mini Player (Ctrl+M)"
          aria-label="Toggle Floating Mini Player"
        >
          <PictureInPicture2 className="w-4 h-4 discord-icon discord-icon-pop" />
        </button>

        {/* Volume slider */}
        <div className="flex items-center gap-1.5 sm:gap-2 pl-2 border-l border-white/[0.08] shrink-0 group/vol">
          <button
            onClick={toggleMute}
            className="group/mute text-[#7E7A8A] hover:text-white p-1 rounded-full hover:bg-white/[0.06] transition-all duration-200 active:scale-90 cursor-pointer"
            title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
            aria-label="Toggle Mute"
          >
            <AnimatedVolume
              volume={volume}
              isMuted={isMuted}
              className={`w-4 h-4 discord-icon ${
                isMuted || volume === 0 ? 'text-[#FF667A]' : 'discord-icon-volume'
              }`}
            />
          </button>

          <div
            ref={volumeBarRef}
            role="slider"
            tabIndex={0}
            aria-label="Volume slider"
            aria-valuenow={volPercent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuetext={`${volPercent}%`}
            onPointerDown={handleVolumePointerDown}
            onPointerMove={handleVolumePointerMove}
            onPointerUp={handleVolumePointerUp}
            onPointerCancel={handleVolumePointerCancel}
            onPointerEnter={() => setShowVolumeTooltip(true)}
            onPointerLeave={() => {
              if (!isDraggingVolumeRef.current) setShowVolumeTooltip(false);
            }}
            onWheel={handleVolumeWheel}
            onKeyDown={handleVolumeKeyDown}
            className={`relative w-16 sm:w-20 md:w-24 h-5 flex items-center select-none touch-none group/voltrack outline-none focus-visible:ring-1 focus-visible:ring-[#19E6A0]/50 rounded-full ${
              isDraggingVolume ? 'cursor-grabbing' : 'cursor-pointer'
            }`}
            title={`Volume: ${volPercent}% (Scroll or Drag to adjust)`}
          >
            {/* Background Track: 4px default, expands smoothly on hover */}
            <div
              className={`w-full bg-white/[0.12] rounded-full overflow-hidden relative transition-[height] duration-150 ${
                isDraggingVolume ? 'h-[5px]' : 'h-[4px] group-hover/voltrack:h-[5px]'
              }`}
            >
              {/* Active filled volume with glowing gradient */}
              <div
                ref={volumeFillRef}
                style={{
                  width: `${volPercent}%`,
                  background: 'linear-gradient(90deg, #1DB954, #19E6A0)',
                }}
                className={`h-full rounded-full transition-none ${
                  isDraggingVolume || volPercent > 0 ? 'shadow-[0_0_8px_rgba(25,230,160,0.4)]' : ''
                }`}
              />
            </div>

            {/* Volume Scrubber Knob: expands from 0px to 10px on hover/drag */}
            <div
              ref={volumeKnobRef}
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 bg-white rounded-full ring-2 ring-[#19E6A0] shadow-[0_0_8px_rgba(25,230,160,0.7)] pointer-events-none transition-[width,height,opacity,transform] duration-150 ease-out ${
                isDraggingVolume
                  ? 'w-2.5 h-2.5 opacity-100 scale-110'
                  : 'w-0 h-0 opacity-0 group-hover/voltrack:w-2.5 group-hover/voltrack:h-2.5 group-hover/voltrack:opacity-100'
              }`}
              style={{ left: `${volPercent}%` }}
            />

            {/* Volume Tooltip on Hover / Drag */}
            {(showVolumeTooltip || isDraggingVolume) && (
              <div
                ref={volumeTooltipRef}
                className="absolute -top-7 px-1.5 py-0.5 rounded-md bg-[#14121B]/95 backdrop-blur-md border border-white/10 text-[10px] text-white font-mono -translate-x-1/2 shadow-xl pointer-events-none animate-in fade-in duration-100 z-30"
                style={{ left: `${volPercent}%` }}
              >
                {volPercent}%
              </div>
            )}
          </div>
        </div>
      </div>
    </footer>
  );
};
