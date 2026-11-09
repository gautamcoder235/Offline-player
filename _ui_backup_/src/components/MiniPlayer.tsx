import React, { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Play,
  Pause,
  Maximize2,
  Music,
  X,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { audioEngine } from '../services/audioEngine';
import { formatTime } from '../utils/helpers';
import { getCurrentWindow } from '@tauri-apps/api/window';
import {
  AnimatedVolume,
  AnimatedShuffle,
  AnimatedRepeat,
  AnimatedHeart,
  AnimatedSkip,
} from './icons';

export const MiniPlayer: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    nextTrack,
    prevTrack,
    seekTo,
    setVolumeLevel,
    toggleLike,
    likedTrackIds,
    toggleMiniPlayer,
    volume,
    isMuted,
    toggleMute,
    shuffle,
    toggleShuffle,
    repeatMode,
    cycleRepeat,
  } = usePlayer();

  const progressBarRef = useRef<HTMLDivElement>(null);
  const progressFillRef = useRef<HTMLDivElement>(null);
  const progressKnobRef = useRef<HTMLDivElement>(null);
  const currentTimeDisplayRef = useRef<HTMLSpanElement>(null);
  const isDraggingProgressRef = useRef<boolean>(false);
  const [isDraggingProgress, setIsDraggingProgress] = useState<boolean>(false);
  const [dragProgressPercent, setDragProgressPercent] = useState<number | null>(null);
  const lastRealtimeSeekRef = useRef<number>(0);

  const miniVolumeRef = useRef<HTMLDivElement>(null);
  const miniVolumeFillRef = useRef<HTMLDivElement>(null);
  const miniVolumeKnobRef = useRef<HTMLDivElement>(null);
  const isDraggingVolumeRef = useRef<boolean>(false);
  const [isDraggingVolume, setIsDraggingVolume] = useState<boolean>(false);

  const isLiked = currentTrack ? likedTrackIds.has(currentTrack.id) : false;

  const effectiveVol = isMuted ? 0 : volume;
  const volPercent = Math.round(effectiveVol * 100);

  const progressPercent =
    isDraggingProgress && dragProgressPercent !== null
      ? dragProgressPercent
      : duration > 0
      ? Math.min(100, Math.max(0, (currentTime / duration) * 100))
      : 0;

  const displayedTime =
    isDraggingProgress && dragProgressPercent !== null
      ? (dragProgressPercent / 100) * duration
      : currentTime;

  const performRealtimeSeek = (time: number) => {
    const now = performance.now();
    if (now - lastRealtimeSeekRef.current >= 30) {
      lastRealtimeSeekRef.current = now;
      audioEngine.seek(time);
    }
  };

  const getProgressRatio = (clientX: number): number => {
    if (!progressBarRef.current) return 0;
    const rect = progressBarRef.current.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const handleProgressPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !progressBarRef.current || duration <= 0) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    isDraggingProgressRef.current = true;
    setIsDraggingProgress(true);

    const ratio = getProgressRatio(e.clientX);
    const percent = ratio * 100;
    const targetTime = ratio * duration;

    if (progressFillRef.current) progressFillRef.current.style.width = `${percent}%`;
    if (progressKnobRef.current) progressKnobRef.current.style.left = `${percent}%`;
    if (currentTimeDisplayRef.current) currentTimeDisplayRef.current.innerText = formatTime(targetTime);

    setDragProgressPercent(percent);
    performRealtimeSeek(targetTime);
  };

  const handleProgressPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || !isDraggingProgressRef.current) return;
    const ratio = getProgressRatio(e.clientX);
    const percent = ratio * 100;
    const targetTime = ratio * duration;

    if (progressFillRef.current) progressFillRef.current.style.width = `${percent}%`;
    if (progressKnobRef.current) progressKnobRef.current.style.left = `${percent}%`;
    if (currentTimeDisplayRef.current) currentTimeDisplayRef.current.innerText = formatTime(targetTime);

    setDragProgressPercent(percent);
    performRealtimeSeek(targetTime);
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
      seekTo(targetTime);
    }
    setDragProgressPercent(null);
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
    }
  };

  const getVolumeRatio = (clientX: number): number => {
    if (!miniVolumeRef.current) return 0;
    const rect = miniVolumeRef.current.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  };

  const handleVolumePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || !miniVolumeRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    isDraggingVolumeRef.current = true;
    setIsDraggingVolume(true);
    const ratio = getVolumeRatio(e.clientX);
    const pct = Math.round(ratio * 100);

    if (miniVolumeFillRef.current) miniVolumeFillRef.current.style.width = `${pct}%`;
    if (miniVolumeKnobRef.current) miniVolumeKnobRef.current.style.left = `${pct}%`;

    setVolumeLevel(ratio);
  };

  const handleVolumePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!miniVolumeRef.current || !isDraggingVolumeRef.current) return;
    const ratio = getVolumeRatio(e.clientX);
    const pct = Math.round(ratio * 100);

    if (miniVolumeFillRef.current) miniVolumeFillRef.current.style.width = `${pct}%`;
    if (miniVolumeKnobRef.current) miniVolumeKnobRef.current.style.left = `${pct}%`;

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
    }
  };

  const handleVolumeWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const step = 0.05;
    const delta = e.deltaY < 0 ? step : -step;
    setVolumeLevel(Math.max(0, Math.min(1, (isMuted ? 0 : volume) + delta)));
  };

  const handleStartDragging = async (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    try {
      await getCurrentWindow().startDragging();
    } catch {
      // Browser fallback
    }
  };

  const handleClose = async () => {
    try {
      await getCurrentWindow().hide();
    } catch {
      // Fallback
    }
  };

  return (
    <div
      className="w-full h-full p-3.5 flex flex-col justify-between bg-[#0E0D13] select-none overflow-hidden text-[#F4F2F7] border border-white/[0.08]"
      data-tauri-drag-region
      onMouseDown={handleStartDragging}
    >
      {/* Top Header Bar / Drag Region */}
      <div
        className="flex items-center justify-end px-1 h-6 cursor-grab active:cursor-grabbing shrink-0"
        data-tauri-drag-region
        onMouseDown={handleStartDragging}
      >
        <div className="flex items-center gap-1 shrink-0" onMouseDown={(e) => e.stopPropagation()}>
          {/* Draggable Mini Volume Control */}
          <div className="flex items-center gap-1.5 group/minivol mr-1">
            <button
              onClick={toggleMute}
              className="group/mute p-1.5 rounded-lg text-[#777381] hover:text-[#F4F2F7] hover:bg-white/5 transition-colors duration-150 cursor-pointer"
              title={isMuted || volume === 0 ? 'Unmute' : 'Mute'}
              aria-label="Toggle Mute"
            >
              <AnimatedVolume
                volume={volume}
                isMuted={isMuted}
                className={`w-3.5 h-3.5 discord-icon ${
                  isMuted || volume === 0 ? 'text-[#FF667A] discord-icon-trash' : 'discord-icon-volume'
                }`}
              />
            </button>
            <div
              ref={miniVolumeRef}
              role="slider"
              tabIndex={0}
              aria-label="Volume slider"
              aria-valuenow={volPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              onPointerDown={handleVolumePointerDown}
              onPointerMove={handleVolumePointerMove}
              onPointerUp={handleVolumePointerUp}
              onPointerCancel={handleVolumePointerCancel}
              onWheel={handleVolumeWheel}
              className={`relative w-12 sm:w-16 h-3 flex items-center select-none touch-none py-0.5 ${
                isDraggingVolume ? 'cursor-grabbing' : 'cursor-pointer'
              }`}
              title={`Volume: ${volPercent}%`}
            >
              <div className={`w-full bg-white/10 rounded-full overflow-hidden relative transition-[height] duration-150 ${
                isDraggingVolume ? 'h-1.5' : 'h-1 group-hover/minivol:h-1.5'
              }`}>
                <div
                  ref={miniVolumeFillRef}
                  className="h-full bg-[#19E6A0] rounded-full transition-none"
                  style={{ width: `${volPercent}%` }}
                />
              </div>
              <div
                ref={miniVolumeKnobRef}
                className={`absolute w-2 h-2 bg-white rounded-full shadow -translate-x-1/2 pointer-events-none transition-[transform,opacity] duration-150 ${
                  isDraggingVolume
                    ? 'opacity-100 scale-125 ring-2 ring-[#19E6A0]/50'
                    : 'opacity-0 group-hover/minivol:opacity-100'
                }`}
                style={{ left: `${volPercent}%` }}
              />
            </div>
          </div>

          {/* Expand to Full App */}
          <button
            onClick={toggleMiniPlayer}
            className="group/exp p-1.5 rounded-lg text-[#777381] hover:text-[#19E6A0] hover:bg-white/5 transition-colors duration-150 cursor-pointer"
            title="Expand to Full Player (Ctrl+M)"
            aria-label="Expand Player"
          >
            <Maximize2 className="w-3.5 h-3.5 discord-icon discord-icon-pop" />
          </button>

          {/* Close / Hide to Tray */}
          <button
            onClick={handleClose}
            className="group/close p-1.5 rounded-lg text-[#777381] hover:text-[#FF667A] hover:bg-[#FF667A]/10 transition-colors duration-150 cursor-pointer"
            title="Hide to Tray"
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5 discord-icon discord-icon-close" />
          </button>
        </div>
      </div>

      {/* Center Stage: Artwork & Track Metadata */}
      <div className="flex items-center gap-3.5 px-1 py-0.5 min-w-0" onMouseDown={(e) => e.stopPropagation()}>
        {/* Cover Artwork */}
        <div className={`w-16 h-16 rounded-xl overflow-hidden bg-[#16151C] border border-white/[0.08] shrink-0 shadow-lg flex items-center justify-center relative group transition-all duration-500 ${
          isPlaying ? 'shadow-[0_0_18px_rgba(25,230,160,0.3)] border-[#19E6A0]/40' : ''
        }`}>
          {currentTrack?.cover_art ? (
            <img
              src={currentTrack.cover_art}
              alt={currentTrack.title}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1C1B24] to-[#121118]">
              <Music className="w-7 h-7 text-[#65616F]" />
            </div>
          )}
        </div>

        {/* Track Title, Artist, & Album with Crossfade */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTrack?.id || 'none'}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -3 }}
            transition={{ duration: 0.15 }}
            className="flex-1 min-w-0 pr-1"
          >
            <div className="flex items-center gap-1.5">
              <h4 className="text-sm font-bold text-[#F4F2F7] truncate leading-tight">
                {currentTrack?.title || 'No Track Selected'}
              </h4>
              {currentTrack && (
                <button
                  onClick={() => toggleLike(currentTrack.id)}
                  className={`group/heart p-1 rounded-lg transition-transform duration-150 active:scale-90 cursor-pointer shrink-0 ${
                    isLiked ? 'text-[#E8C77A]' : 'text-[#65616F] hover:text-[#E8C77A]'
                  }`}
                  title={isLiked ? 'Remove from Liked' : 'Add to Liked'}
                  aria-label="Like Track"
                >
                  <AnimatedHeart
                    isLiked={isLiked}
                    className="w-3.5 h-3.5 discord-icon discord-icon-heart"
                  />
                </button>
              )}
            </div>
            <p className="text-xs text-[#AAA6B2] truncate leading-tight mt-1 font-medium">
              {currentTrack?.artist || 'MusicVault Offline'}
            </p>
            {currentTrack?.album && (
              <p className="text-[11px] text-[#65616F] truncate leading-tight mt-0.5">
                {currentTrack.album}
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom Area: Progress Scrubber & Controls */}
      <div className="space-y-2 px-1" onMouseDown={(e) => e.stopPropagation()}>
        {/* Progress Bar & Timestamps */}
        <div className="flex items-center gap-2 text-[10px] font-mono text-[#777381]">
          <span ref={currentTimeDisplayRef} className="w-7 text-right shrink-0">{formatTime(displayedTime)}</span>
          <div
            ref={progressBarRef}
            role="slider"
            tabIndex={0}
            aria-label="Seek track position"
            aria-valuenow={Math.round(displayedTime)}
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            onPointerDown={handleProgressPointerDown}
            onPointerMove={handleProgressPointerMove}
            onPointerUp={handleProgressPointerUp}
            onPointerCancel={handleProgressPointerCancel}
            className={`relative flex-1 h-3 flex items-center py-1 select-none touch-none group outline-none ${
              isDraggingProgress ? 'cursor-grabbing' : 'cursor-pointer'
            }`}
          >
            <div className={`w-full bg-white/10 rounded-full overflow-hidden transition-[height] duration-150 ${
              isDraggingProgress ? 'h-1.5' : 'h-1 group-hover:h-1.5'
            }`}>
              <div
                ref={progressFillRef}
                className={`h-full bg-[#19E6A0] rounded-full transition-none ${isPlaying ? 'shadow-[0_0_8px_rgba(25,230,160,0.5)]' : ''}`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div
              ref={progressKnobRef}
              className={`absolute w-2.5 h-2.5 bg-white rounded-full shadow -translate-x-1/2 pointer-events-none transition-[transform,opacity] duration-150 ${
                isDraggingProgress
                  ? 'opacity-100 scale-125 ring-2 ring-[#19E6A0]/60 shadow-[0_0_8px_rgba(25,230,160,0.7)]'
                  : 'opacity-0 group-hover:opacity-100'
              } ${isPlaying ? 'animate-progress-glow ring-2 ring-[#19E6A0]/40' : ''}`}
              style={{ left: `${progressPercent}%` }}
            />
          </div>
          <span className="w-7 text-left shrink-0">{formatTime(duration)}</span>
        </div>

        {/* Playback Controls Row */}
        <div className="flex items-center justify-center gap-3 pt-0.5">
          <button
            onClick={toggleShuffle}
            className={`group/shuffle p-1.5 rounded-lg transition-all duration-150 active:scale-90 cursor-pointer ${
              shuffle ? 'text-[#19E6A0] bg-[#19E6A0]/10' : 'text-[#65616F] hover:text-[#AAA6B2]'
            }`}
            title={shuffle ? 'Shuffle On' : 'Shuffle Off'}
            aria-label="Toggle Shuffle"
          >
            <AnimatedShuffle active={shuffle} className="w-3.5 h-3.5 discord-icon discord-icon-shuffle" />
          </button>

          <button
            onClick={prevTrack}
            className="group/prev p-1.5 text-[#AAA6B2] hover:text-white transition-all duration-150 active:scale-90 cursor-pointer"
            title="Previous Track"
            aria-label="Previous Track"
          >
            <AnimatedSkip direction="prev" className="w-4 h-4 discord-icon discord-icon-prev" />
          </button>

          <button
            onClick={togglePlay}
            className={`group/play w-9 h-9 rounded-full bg-[#19E6A0] hover:bg-[#35F0B1] text-black flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer shrink-0 ${
              isPlaying ? 'animate-breathe-glow' : ''
            }`}
            title="Play / Pause"
            aria-label="Play or Pause"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-black text-black discord-icon discord-icon-pop" />
            ) : (
              <Play className="w-4 h-4 fill-black text-black ml-0.5 discord-icon discord-icon-pop" />
            )}
          </button>

          <button
            onClick={nextTrack}
            className="group/next p-1.5 text-[#AAA6B2] hover:text-white transition-all duration-150 active:scale-90 cursor-pointer"
            title="Next Track"
            aria-label="Next Track"
          >
            <AnimatedSkip direction="next" className="w-4 h-4 discord-icon discord-icon-next" />
          </button>

          <button
            onClick={cycleRepeat}
            className={`group/repeat p-1.5 rounded-lg transition-all duration-150 active:scale-90 cursor-pointer ${
              repeatMode !== 'off' ? 'text-[#19E6A0] bg-[#19E6A0]/10' : 'text-[#65616F] hover:text-[#AAA6B2]'
            }`}
            title={`Repeat: ${repeatMode}`}
            aria-label="Cycle Repeat Mode"
          >
            <AnimatedRepeat
              mode={repeatMode}
              single={repeatMode === 'one'}
              className="w-3.5 h-3.5 discord-icon discord-icon-repeat"
            />
          </button>
        </div>
      </div>
    </div>
  );
};
