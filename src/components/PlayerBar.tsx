import React, { useRef, useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Play,
  Pause,
  ListOrdered,
  Mic2,
  Radio,
  Disc3,
  PictureInPicture2,
  Moon,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { audioEngine } from '../services/audioEngine';
import { formatTime, getTrackColor } from '../utils/helpers';
import {
  AnimatedEqualizer,
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
  onToggleEqualizer: () => void;
  isEqualizerActive: boolean;
  onToggleVisualizer: () => void;
  isVisualizerActive: boolean;
}

export const PlayerBar: React.FC<PlayerBarProps> = ({
  onToggleLyrics,
  isLyricsActive,
  onToggleQueue,
  isQueueActive,
  onToggleEqualizer,
  isEqualizerActive,
  onToggleVisualizer,
  isVisualizerActive,
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
    themeAppearance,
    sleepTimerMinutes,
    sleepTimerRemainingSec,
    setSleepTimer,
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

    // Hide hover line during dragging so there is NO desynchronized ghost/back-glow line!
    if (hoverLineRef.current) hoverLineRef.current.style.display = 'none';

    const ratio = getProgressRatio(e.clientX);
    const percent = ratio * 100;
    const targetTime = ratio * duration;

    // Instant synchronous DOM updates for zero latency between dot and line
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

      // Instant synchronous DOM updates: fill width, knob left, time text, tooltip
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
      // Passive hover preview only
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

  const trackColor = currentTrack
    ? getTrackColor(currentTrack.title, currentTrack.artist)
    : { bg: '#16151C', text: '#777381', glow: 'transparent' };

  return (
    <footer className={`h-20 shrink-0 px-3 sm:px-6 flex items-center justify-between transition-colors duration-300 ${
      isGlass
        ? 'border-t border-white/[0.08] bg-[#100F14]/45 backdrop-blur-2xl'
        : 'border-t border-[#292731]/40 bg-[#100F14]'
    } z-20 select-none overflow-hidden`}>
      {/* LEFT: Track Info & Champagne Heart */}
      <div className="flex items-center gap-2 sm:gap-3 flex-1 sm:flex-none sm:w-1/4 min-w-0 max-w-[200px] sm:max-w-[280px] md:max-w-[320px] shrink-0">
        {currentTrack ? (
          <>
            <div className={`relative w-10 h-10 sm:w-12 sm:h-12 rounded-lg overflow-hidden border border-[#292731] shrink-0 bg-[#16151C] transition-shadow duration-500 ${
              isPlaying ? 'shadow-[0_0_14px_rgba(25,230,160,0.25)] border-[#19E6A0]/30' : ''
            }`}>
              {currentTrack.cover_art ? (
                <img
                  src={currentTrack.cover_art}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-sm font-bold"
                  style={{ background: trackColor.bg, color: trackColor.text }}
                >
                  <Disc3 className={`w-5 h-5 ${isPlaying ? 'animate-spin' : ''}`} style={{ animationDuration: '6s' }} />
                </div>
              )}
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={currentTrack.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16 }}
                className="flex flex-col min-w-0 pr-1 sm:pr-2 flex-1"
              >
                <span className="text-xs font-semibold text-[#F4F2F7] truncate">
                  {currentTrack.title}
                </span>
                <span className="text-[10px] sm:text-[11px] text-[#777381] truncate">
                  {currentTrack.artist}
                </span>
              </motion.div>
            </AnimatePresence>
            <button
              onClick={() => toggleLike(currentTrack.id)}
              className={`group/heart p-1 sm:p-1.5 rounded-full transition-all duration-200 active:scale-90 cursor-pointer shrink-0 ${
                isLiked ? 'text-[#E8C77A]' : 'text-[#65616F] hover:text-[#E8C77A]'
              }`}
              title={isLiked ? 'Remove from Liked' : 'Save to Liked'}
              aria-label={isLiked ? 'Remove from Liked' : 'Save to Liked'}
            >
              <AnimatedHeart
                isLiked={isLiked}
                className="w-4 h-4 discord-icon discord-icon-heart"
              />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-2.5 text-xs text-[#65616F]">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-[#16151C] border border-[#292731] flex items-center justify-center shrink-0">
              <Disc3 className="w-5 h-5 text-[#4B4854]" />
            </div>
            <span className="text-[11px] truncate">No song selected</span>
          </div>
        )}
      </div>

      {/* CENTER: Playback Controls & Scrubber */}
      <div className="flex flex-col items-center gap-1 sm:gap-1.5 flex-1 max-w-xl px-2 sm:px-4 min-w-0">
        {/* Buttons */}
        <div className="flex items-center gap-2.5 sm:gap-4 md:gap-5">
          <button
            onClick={toggleShuffle}
            className={`group/shuffle relative p-1 sm:p-1.5 rounded-full transition-all duration-200 active:scale-95 cursor-pointer ${
              shuffle ? 'text-[#19E6A0]' : 'text-[#777381] hover:text-[#F4F2F7]'
            }`}
            title="Shuffle"
            aria-label="Shuffle"
          >
            <AnimatedShuffle active={shuffle} className="w-3.5 h-3.5 discord-icon discord-icon-shuffle" />
            {shuffle && <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#19E6A0] animate-in fade-in zoom-in duration-200" />}
          </button>

          <button
            onClick={prevTrack}
            className="group/prev p-1 sm:p-1.5 rounded-full text-[#B8B4C0] hover:text-[#F4F2F7] transition-all duration-200 active:scale-90 cursor-pointer"
            title="Previous (Ctrl+Left)"
            aria-label="Previous Track"
          >
            <AnimatedSkip direction="prev" className="w-4 h-4 discord-icon discord-icon-prev" />
          </button>

          <button
            onClick={togglePlay}
            className={`group/play w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#19E6A0] hover:bg-[#35F0B1] text-black flex items-center justify-center shadow transition-all duration-300 hover:scale-[1.06] active:scale-95 cursor-pointer shrink-0 ${
              isPlaying ? 'animate-breathe-glow' : ''
            }`}
            title="Play / Pause (Space)"
            aria-label="Play or Pause"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-black text-black discord-icon discord-icon-pop animate-in zoom-in duration-200" />
            ) : (
              <Play className="w-4 h-4 fill-black text-black ml-0.5 discord-icon discord-icon-pop animate-in zoom-in duration-200" />
            )}
          </button>

          <button
            onClick={nextTrack}
            className="group/next p-1 sm:p-1.5 rounded-full text-[#B8B4C0] hover:text-[#F4F2F7] transition-all duration-200 active:scale-90 cursor-pointer"
            title="Next (Ctrl+Right)"
            aria-label="Next Track"
          >
            <AnimatedSkip direction="next" className="w-4 h-4 discord-icon discord-icon-next" />
          </button>

          <button
            onClick={cycleRepeat}
            className={`group/repeat relative p-1 sm:p-1.5 rounded-full transition-all duration-200 active:scale-95 cursor-pointer ${
              repeatMode !== 'off' ? 'text-[#19E6A0]' : 'text-[#777381] hover:text-[#F4F2F7]'
            }`}
            title={`Repeat: ${repeatMode}`}
            aria-label={`Repeat: ${repeatMode}`}
          >
            <AnimatedRepeat
              mode={repeatMode}
              single={repeatMode === 'one'}
              className="w-3.5 h-3.5 discord-icon discord-icon-repeat"
            />
            {repeatMode !== 'off' && <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#19E6A0] animate-in fade-in zoom-in duration-200" />}
          </button>
        </div>

        {/* Time Scrubber */}
        <div className="w-full flex items-center gap-2 sm:gap-3 text-[10px] sm:text-[11px] text-[#777381] font-mono">
          <span ref={currentTimeDisplayRef} className="w-7 sm:w-8 text-right shrink-0">{formatTime(displayedCurrentTime)}</span>

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
            className={`relative flex-1 h-3 flex items-center py-1 min-w-[60px] select-none touch-none group outline-none ${
              isDraggingProgress ? 'cursor-grabbing' : 'cursor-pointer'
            }`}
          >
            {/* Background Track */}
            <div className={`w-full bg-[#292731] rounded-full overflow-hidden relative transition-[height] duration-200 ${
              isDraggingProgress ? 'h-1.5' : 'h-1 group-hover:h-1.5'
            }`}>
              {/* Hover line */}
              <div
                ref={hoverLineRef}
                className="absolute top-0 bottom-0 bg-white/10 hidden pointer-events-none"
              />
              {/* Active filled progress */}
              <div
                ref={progressFillRef}
                className={`h-full bg-[#19E6A0] rounded-full relative transition-none ${isPlaying ? 'shadow-[0_0_8px_rgba(25,230,160,0.4)]' : ''}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Scrubber Knob */}
            <div
              ref={progressKnobRef}
              className={`absolute w-2.5 h-2.5 bg-[#F4F2F7] rounded-full shadow -translate-x-1/2 pointer-events-none transition-[transform,opacity,box-shadow] duration-150 ${
                isDraggingProgress
                  ? 'opacity-100 scale-125 ring-2 ring-[#19E6A0]/60 shadow-[0_0_10px_rgba(25,230,160,0.8)]'
                  : 'opacity-0 group-hover:opacity-100 group-hover:scale-110'
              } ${isPlaying ? 'animate-progress-glow ring-2 ring-[#19E6A0]/40' : ''}`}
              style={{ left: `${progressPercent}%` }}
            />

            {/* Hover Tooltip */}
            <div
              ref={hoverTooltipRef}
              className="absolute -top-7 px-1.5 py-0.5 rounded bg-[#16151C] border border-[#292731] text-[10px] text-[#F4F2F7] font-mono -translate-x-1/2 shadow hidden pointer-events-none z-30"
            >
              0:00
            </div>
          </div>

          <span className="w-7 sm:w-8 shrink-0">{formatTime(duration)}</span>
        </div>
      </div>

      {/* RIGHT: Tools & Volume */}
      <div className="flex items-center justify-end gap-1.5 sm:gap-2 md:gap-3 shrink-0 min-w-fit">
        {/* Real-time Visualizer Button */}
        <button
          onClick={onToggleVisualizer}
          className={`group/vis p-1 sm:p-1.5 rounded-full transition-all duration-200 active:scale-95 cursor-pointer shrink-0 ${
            isVisualizerActive ? 'text-[#19E6A0] bg-[#19E6A0]/10' : 'text-[#777381] hover:text-[#F4F2F7]'
          }`}
          title="Audio Visualizer"
          aria-label="Toggle Audio Visualizer"
        >
          <Radio className="w-4 h-4 discord-icon discord-icon-pop" />
        </button>

        {/* Live Lyrics Button */}
        <button
          onClick={onToggleLyrics}
          className={`group/lyrics p-1 sm:p-1.5 rounded-full transition-all duration-200 active:scale-95 cursor-pointer shrink-0 ${
            isLyricsActive ? 'text-[#19E6A0] bg-[#19E6A0]/10' : 'text-[#777381] hover:text-[#F4F2F7]'
          }`}
          title="Lyrics"
          aria-label="Toggle Lyrics"
        >
          <Mic2 className="w-4 h-4 discord-icon discord-icon-pop" />
        </button>

        {/* Equalizer Button */}
        <button
          onClick={onToggleEqualizer}
          className={`group/eq p-1 sm:p-1.5 rounded-full transition-all duration-200 active:scale-95 cursor-pointer shrink-0 ${
            isEqualizerActive ? 'text-[#19E6A0] bg-[#19E6A0]/10' : 'text-[#777381] hover:text-[#F4F2F7]'
          }`}
          title="Equalizer"
          aria-label="Toggle Equalizer"
        >
          <AnimatedEqualizer className="w-4 h-4 discord-icon" />
        </button>

        {/* Queue Button */}
        <button
          onClick={onToggleQueue}
          className={`group/queue p-1 sm:p-1.5 rounded-full transition-all duration-200 active:scale-95 cursor-pointer shrink-0 ${
            isQueueActive ? 'text-[#19E6A0] bg-[#19E6A0]/10' : 'text-[#777381] hover:text-[#F4F2F7]'
          }`}
          title="Playing Queue"
          aria-label="Toggle Playing Queue"
        >
          <ListOrdered className="w-4 h-4 discord-icon discord-icon-pop" />
        </button>

        {/* Mini Player Toggle */}
        <button
          onClick={toggleMiniPlayer}
          className="group/mini p-1 sm:p-1.5 rounded-full text-[#777381] hover:text-[#19E6A0] transition-all duration-200 active:scale-95 cursor-pointer shrink-0"
          title="Floating Mini Player (Ctrl+M)"
          aria-label="Toggle Floating Mini Player"
        >
          <PictureInPicture2 className="w-4 h-4 discord-icon discord-icon-pop" />
        </button>

        {/* Sleep Timer Menu */}
        <div className="relative shrink-0" ref={sleepMenuRef}>
          <button
            onClick={() => setIsSleepMenuOpen((prev) => !prev)}
            className={`group/sleep p-1 sm:p-1.5 rounded-full transition-all duration-200 active:scale-95 cursor-pointer relative ${
              sleepTimerMinutes !== null
                ? 'text-[#19E6A0] bg-[#19E6A0]/10 shadow-[0_0_10px_rgba(25,230,160,0.2)]'
                : 'text-[#777381] hover:text-[#F4F2F7]'
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
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#19E6A0] animate-pulse" />
            )}
          </button>

          {/* Sleep Timer Dropdown Popup */}
          {isSleepMenuOpen && (
            <div
              className={`absolute bottom-full mb-3 right-0 w-44 rounded-xl ${
                isGlass
                  ? 'bg-[#16151C]/90 backdrop-blur-2xl border border-white/[0.12] shadow-[0_16px_40px_rgba(0,0,0,0.8)]'
                  : 'bg-[#16151C] border border-[#292731] shadow-2xl'
              } p-2 space-y-1 z-50 text-xs animate-in fade-in zoom-in-95 duration-150 select-none`}
            >
              <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#777381] border-b border-[#25232F] mb-1 flex items-center justify-between">
                <span>Sleep Timer</span>
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
                  className={`w-full px-2.5 py-1.5 rounded-lg text-left transition-colors flex items-center justify-between cursor-pointer ${
                    sleepTimerMinutes === mins
                      ? 'bg-[#19E6A0]/15 text-[#19E6A0] font-semibold'
                      : 'text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#1E1D26]'
                  }`}
                >
                  <span>{mins} minutes</span>
                  {sleepTimerMinutes === mins && <div className="w-1.5 h-1.5 rounded-full bg-[#19E6A0]" />}
                </button>
              ))}

              {duration > 0 && currentTime < duration && (
                <button
                  onClick={() => {
                    setSleepTimer(-1);
                    setIsSleepMenuOpen(false);
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-lg text-left transition-colors flex items-center justify-between cursor-pointer ${
                    sleepTimerMinutes === -1
                      ? 'bg-[#19E6A0]/15 text-[#19E6A0] font-semibold'
                      : 'text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#1E1D26]'
                  }`}
                >
                  <span>End of track</span>
                  {sleepTimerMinutes === -1 ? (
                    <div className="w-1.5 h-1.5 rounded-full bg-[#19E6A0]" />
                  ) : (
                    <span className="text-[10px] font-mono text-[#65616F]">
                      ~{Math.ceil((duration - currentTime) / 60)}m
                    </span>
                  )}
                </button>
              )}

              {sleepTimerMinutes !== null && (
                <div className="border-t border-[#25232F] pt-1 mt-1">
                  <button
                    onClick={() => {
                      setSleepTimer(null);
                      setIsSleepMenuOpen(false);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg text-left text-[#FF667A] hover:bg-[#FF667A]/10 transition-colors flex items-center justify-between cursor-pointer font-medium"
                  >
                    <span>Turn off timer</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Volume Scrubber with drag, hover track expansion, and mousewheel support */}
        <div className="flex items-center gap-1.5 sm:gap-2 pl-1.5 sm:pl-2 border-l border-[#292731] shrink-0 group/vol">
          <button
            onClick={toggleMute}
            className="group/mute text-[#777381] hover:text-[#F4F2F7] transition-all duration-200 active:scale-90 cursor-pointer p-0.5"
            title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
            aria-label="Toggle Mute"
          >
            <AnimatedVolume
              volume={volume}
              isMuted={isMuted}
              className={`w-4 h-4 discord-icon ${
                isMuted || volume === 0 ? 'text-[#FF667A] discord-icon-trash' : 'discord-icon-volume'
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
            className={`relative w-16 sm:w-20 md:w-24 h-4 flex items-center select-none touch-none py-1 group/track outline-none focus-visible:ring-1 focus-visible:ring-[#19E6A0]/50 rounded-full ${
              isDraggingVolume ? 'cursor-grabbing' : 'cursor-pointer'
            }`}
            title={`Volume: ${volPercent}% (Scroll or Drag to adjust)`}
          >
            {/* Background Track */}
            <div className={`w-full bg-[#292731] rounded-full overflow-hidden relative transition-[height] duration-200 ${
              isDraggingVolume ? 'h-1.5' : 'h-1 group-hover/vol:h-1.5'
            }`}>
              {/* Active filled volume */}
              <div
                ref={volumeFillRef}
                className={`h-full bg-[#19E6A0] rounded-full transition-none ${
                  isDraggingVolume ? 'shadow-[0_0_8px_rgba(25,230,160,0.5)]' : ''
                }`}
                style={{ width: `${volPercent}%` }}
              />
            </div>

            {/* Volume Scrubber Knob */}
            <div
              ref={volumeKnobRef}
              className={`absolute w-2.5 h-2.5 bg-[#F4F2F7] rounded-full shadow -translate-x-1/2 pointer-events-none transition-[transform,opacity,box-shadow] duration-150 ${
                isDraggingVolume
                  ? 'opacity-100 scale-125 ring-2 ring-[#19E6A0]/50 shadow-[0_0_8px_rgba(25,230,160,0.7)]'
                  : 'opacity-0 group-hover/vol:opacity-100 group-hover/vol:scale-110'
              }`}
              style={{ left: `${volPercent}%` }}
            />

            {/* Volume Tooltip on Hover / Drag */}
            {(showVolumeTooltip || isDraggingVolume) && (
              <div
                ref={volumeTooltipRef}
                className="absolute -top-7 px-1.5 py-0.5 rounded bg-[#16151C] border border-[#292731] text-[10px] text-[#F4F2F7] font-mono -translate-x-1/2 shadow pointer-events-none animate-in fade-in duration-100 z-30"
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
