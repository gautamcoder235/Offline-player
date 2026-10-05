import React, { useRef } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Heart,
  Maximize2,
  Music,
  X,
  Volume2,
  VolumeX,
  Shuffle,
  Repeat,
  Repeat1,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { formatTime } from '../utils/helpers';
import { getCurrentWindow } from '@tauri-apps/api/window';

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
  const isLiked = currentTrack ? likedTrackIds.has(currentTrack.id) : false;
  const progressPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration <= 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    seekTo(ratio * duration);
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
        className="flex items-center justify-between px-1 h-6 cursor-grab active:cursor-grabbing shrink-0"
        data-tauri-drag-region
        onMouseDown={handleStartDragging}
      >
        {/* Subtle discreet drag pill handle */}
        <div className="flex items-center pointer-events-none pl-1" data-tauri-drag-region>
          <div className="w-8 h-1 rounded-full bg-white/15" />
        </div>

        <div className="flex items-center gap-1 shrink-0" onMouseDown={(e) => e.stopPropagation()}>
          {/* Quick Mute */}
          <button
            onClick={toggleMute}
            className="p-1.5 rounded-lg text-[#777381] hover:text-[#F4F2F7] hover:bg-white/5 transition-colors duration-150 cursor-pointer"
            title={isMuted || volume === 0 ? 'Unmute' : 'Mute'}
            aria-label="Toggle Mute"
          >
            {isMuted || volume === 0 ? <VolumeX className="w-3.5 h-3.5 text-[#FF667A]" /> : <Volume2 className="w-3.5 h-3.5" />}
          </button>

          {/* Expand to Full App */}
          <button
            onClick={toggleMiniPlayer}
            className="p-1.5 rounded-lg text-[#777381] hover:text-[#19E6A0] hover:bg-white/5 transition-colors duration-150 cursor-pointer"
            title="Expand to Full Player (Ctrl+M)"
            aria-label="Expand Player"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>

          {/* Close / Hide to Tray */}
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-[#777381] hover:text-[#FF667A] hover:bg-[#FF667A]/10 transition-colors duration-150 cursor-pointer"
            title="Hide to Tray"
            aria-label="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Center Stage: Artwork & Track Metadata */}
      <div className="flex items-center gap-3.5 px-1 py-0.5 min-w-0" onMouseDown={(e) => e.stopPropagation()}>
        {/* Cover Artwork */}
        <div className="w-16 h-16 rounded-xl overflow-hidden bg-[#16151C] border border-white/[0.08] shrink-0 shadow-lg flex items-center justify-center relative group">
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

        {/* Track Title, Artist, & Album */}
        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center gap-1.5">
            <h4 className="text-sm font-bold text-[#F4F2F7] truncate leading-tight">
              {currentTrack?.title || 'No Track Selected'}
            </h4>
            {currentTrack && (
              <button
                onClick={() => toggleLike(currentTrack.id)}
                className={`p-1 rounded-lg transition-transform duration-150 active:scale-90 cursor-pointer shrink-0 ${
                  isLiked ? 'text-[#E8C77A]' : 'text-[#65616F] hover:text-[#E8C77A]'
                }`}
                title={isLiked ? 'Remove from Liked' : 'Add to Liked'}
                aria-label="Like Track"
              >
                <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-[#E8C77A]' : ''}`} />
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
        </div>
      </div>

      {/* Bottom Area: Progress Scrubber & Controls */}
      <div className="space-y-2 px-1" onMouseDown={(e) => e.stopPropagation()}>
        {/* Progress Bar & Timestamps */}
        <div className="flex items-center gap-2 text-[10px] font-mono text-[#777381]">
          <span className="w-7 text-right shrink-0">{formatTime(currentTime)}</span>
          <div
            ref={progressBarRef}
            onClick={handleProgressClick}
            className="relative flex-1 h-3 flex items-center cursor-pointer group py-1"
          >
            <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden group-hover:h-1.5 transition-all duration-150">
              <div
                className="h-full bg-[#19E6A0] rounded-full"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div
              className="absolute w-2.5 h-2.5 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity duration-150 -translate-x-1/2 pointer-events-none"
              style={{ left: `${progressPercent}%` }}
            />
          </div>
          <span className="w-7 text-left shrink-0">{formatTime(duration)}</span>
        </div>

        {/* Playback Controls Row */}
        <div className="flex items-center justify-center gap-3 pt-0.5">
          <button
            onClick={toggleShuffle}
            className={`p-1.5 rounded-lg transition-colors duration-150 active:scale-90 cursor-pointer ${
              shuffle ? 'text-[#19E6A0] bg-[#19E6A0]/10' : 'text-[#65616F] hover:text-[#AAA6B2]'
            }`}
            title={shuffle ? 'Shuffle On' : 'Shuffle Off'}
            aria-label="Toggle Shuffle"
          >
            <Shuffle className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={prevTrack}
            className="p-1.5 text-[#AAA6B2] hover:text-white transition-colors duration-150 active:scale-90 cursor-pointer"
            title="Previous Track"
            aria-label="Previous Track"
          >
            <SkipBack className="w-4 h-4 fill-current" />
          </button>

          <button
            onClick={togglePlay}
            className="w-9 h-9 rounded-full bg-[#19E6A0] hover:bg-[#35F0B1] text-black flex items-center justify-center shadow-lg transition-transform duration-150 hover:scale-105 active:scale-95 cursor-pointer shrink-0"
            title="Play / Pause"
            aria-label="Play or Pause"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-black text-black" />
            ) : (
              <Play className="w-4 h-4 fill-black text-black ml-0.5" />
            )}
          </button>

          <button
            onClick={nextTrack}
            className="p-1.5 text-[#AAA6B2] hover:text-white transition-colors duration-150 active:scale-90 cursor-pointer"
            title="Next Track"
            aria-label="Next Track"
          >
            <SkipForward className="w-4 h-4 fill-current" />
          </button>

          <button
            onClick={cycleRepeat}
            className={`p-1.5 rounded-lg transition-colors duration-150 active:scale-90 cursor-pointer ${
              repeatMode !== 'off' ? 'text-[#19E6A0] bg-[#19E6A0]/10' : 'text-[#65616F] hover:text-[#AAA6B2]'
            }`}
            title={`Repeat: ${repeatMode}`}
            aria-label="Cycle Repeat Mode"
          >
            {repeatMode === 'one' ? <Repeat1 className="w-3.5 h-3.5" /> : <Repeat className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
};
