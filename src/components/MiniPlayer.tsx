import React, { useRef } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Heart,
  Maximize2,
  Pin,
  PinOff,
  Music,
  X,
  Volume2,
  VolumeX,
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
    isAlwaysOnTop,
    toggleAlwaysOnTop,
    volume,
    isMuted,
    toggleMute,
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
      className="w-full h-full p-2.5 flex flex-col justify-between bg-[#0E0D13]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl select-none overflow-hidden text-[#F4F2F7]"
      data-tauri-drag-region
      onMouseDown={handleStartDragging}
    >
      {/* Top Drag & Control Bar */}
      <div
        className="flex items-center justify-between text-[10px] text-[#777381] px-0.5 cursor-grab active:cursor-grabbing shrink-0"
        data-tauri-drag-region
        onMouseDown={handleStartDragging}
      >
        <div className="flex items-center gap-1.5 pointer-events-none" data-tauri-drag-region>
          <img src="/app-icon.png" alt="MusicVault" className="w-3.5 h-3.5 rounded-full object-contain" />
          <span className="font-semibold uppercase tracking-wider text-[#A29EAD] text-[9.5px]">MusicVault</span>
          {isAlwaysOnTop && (
            <span className="bg-[#19E6A0]/15 text-[#19E6A0] text-[8.5px] font-bold px-1 py-0.2 rounded">
              PINNED
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0" onMouseDown={(e) => e.stopPropagation()}>
          {/* Always on top pin toggle */}
          <button
            onClick={toggleAlwaysOnTop}
            className={`p-1 rounded-md transition-colors duration-150 cursor-pointer ${
              isAlwaysOnTop ? 'text-[#19E6A0] bg-[#19E6A0]/10' : 'text-[#777381] hover:text-[#F4F2F7] hover:bg-white/5'
            }`}
            title={isAlwaysOnTop ? 'Unpin from Top' : 'Pin Always on Top'}
            aria-label="Toggle Always on Top"
          >
            {isAlwaysOnTop ? <Pin className="w-3 h-3 fill-current" /> : <PinOff className="w-3 h-3" />}
          </button>

          {/* Quick Mute */}
          <button
            onClick={toggleMute}
            className="p-1 rounded-md text-[#777381] hover:text-[#F4F2F7] hover:bg-white/5 transition-colors duration-150 cursor-pointer"
            title={isMuted || volume === 0 ? 'Unmute' : 'Mute'}
            aria-label="Toggle Mute"
          >
            {isMuted || volume === 0 ? <VolumeX className="w-3 h-3 text-[#FF667A]" /> : <Volume2 className="w-3 h-3" />}
          </button>

          {/* Expand to Full App */}
          <button
            onClick={toggleMiniPlayer}
            className="p-1 rounded-md text-[#777381] hover:text-[#19E6A0] hover:bg-white/5 transition-colors duration-150 cursor-pointer"
            title="Expand to Full Player (Ctrl+M)"
            aria-label="Expand Player"
          >
            <Maximize2 className="w-3 h-3" />
          </button>

          {/* Close / Hide to Tray */}
          <button
            onClick={handleClose}
            className="p-1 rounded-md text-[#777381] hover:text-[#FF667A] hover:bg-[#FF667A]/10 transition-colors duration-150 cursor-pointer"
            title="Hide to Tray"
            aria-label="Close"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Main Track & Playback Row */}
      <div className="flex items-center gap-2.5 px-0.5 min-w-0" onMouseDown={(e) => e.stopPropagation()}>
        {/* Cover Artwork */}
        <div className="w-11 h-11 rounded-xl overflow-hidden bg-[#181720] border border-white/10 shrink-0 shadow flex items-center justify-center relative">
          {currentTrack?.cover_art ? (
            <img src={currentTrack.cover_art} alt={currentTrack.title} className="w-full h-full object-cover" />
          ) : (
            <Music className="w-5 h-5 text-[#65616F]" />
          )}
        </div>

        {/* Track Title & Artist */}
        <div className="flex-1 min-w-0 pr-1">
          <p className="text-xs font-bold text-[#F4F2F7] truncate leading-tight">
            {currentTrack?.title || 'No Track Selected'}
          </p>
          <p className="text-[10.5px] text-[#AAA6B2] truncate leading-tight mt-0.5">
            {currentTrack?.artist || 'MusicVault Offline'}
          </p>
        </div>

        {/* Controls Cluster */}
        <div className="flex items-center gap-1 shrink-0">
          {currentTrack && (
            <button
              onClick={() => toggleLike(currentTrack.id)}
              className={`p-1 rounded-lg transition-transform duration-150 active:scale-90 cursor-pointer ${
                isLiked ? 'text-[#E8C77A]' : 'text-[#65616F] hover:text-[#E8C77A]'
              }`}
              title={isLiked ? 'Remove from Liked' : 'Add to Liked'}
              aria-label="Like Track"
            >
              <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-[#E8C77A]' : ''}`} />
            </button>
          )}

          <button
            onClick={prevTrack}
            className="p-1 text-[#AAA6B2] hover:text-white transition-colors duration-150 active:scale-90 cursor-pointer"
            title="Previous Track"
            aria-label="Previous Track"
          >
            <SkipBack className="w-3.5 h-3.5 fill-current" />
          </button>

          <button
            onClick={togglePlay}
            className="w-7 h-7 rounded-full bg-[#19E6A0] hover:bg-[#35F0B1] text-black flex items-center justify-center shadow transition-transform duration-150 hover:scale-105 active:scale-95 cursor-pointer shrink-0"
            title="Play / Pause"
            aria-label="Play or Pause"
          >
            {isPlaying ? (
              <Pause className="w-3.5 h-3.5 fill-black text-black" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-black text-black ml-0.5" />
            )}
          </button>

          <button
            onClick={nextTrack}
            className="p-1 text-[#AAA6B2] hover:text-white transition-colors duration-150 active:scale-90 cursor-pointer"
            title="Next Track"
            aria-label="Next Track"
          >
            <SkipForward className="w-3.5 h-3.5 fill-current" />
          </button>
        </div>
      </div>

      {/* Slim Progress Bar & Timers */}
      <div className="flex items-center gap-2 text-[9.5px] font-mono text-[#777381] px-0.5" onMouseDown={(e) => e.stopPropagation()}>
        <span className="w-6 text-right shrink-0">{formatTime(currentTime)}</span>
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
            className="absolute w-2 h-2 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity duration-150 -translate-x-1/2 pointer-events-none"
            style={{ left: `${progressPercent}%` }}
          />
        </div>
        <span className="w-6 text-left shrink-0">{formatTime(duration)}</span>
      </div>
    </div>
  );
};
