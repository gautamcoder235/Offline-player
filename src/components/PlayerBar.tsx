import React, { useState, useRef } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  Volume1,
  VolumeX,
  Heart,
  ListOrdered,
  Mic2,
  Sliders,
  Radio,
  Disc3,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { formatTime, getTrackColor } from '../utils/helpers';

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
  } = usePlayer();

  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const isLiked = currentTrack ? likedTrackIds.has(currentTrack.id) : false;

  const handleProgressMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration <= 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverTime(pos * duration);
  };

  const handleProgressMouseLeave = () => {
    setHoverTime(null);
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration <= 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(pos * duration);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const hoverPercent = duration > 0 && hoverTime !== null ? (hoverTime / duration) * 100 : null;

  const trackColor = currentTrack
    ? getTrackColor(currentTrack.title, currentTrack.artist)
    : { bg: '#16151C', text: '#777381', glow: 'transparent' };

  return (
    <footer className="h-20 px-6 flex items-center justify-between border-t border-[#292731] bg-[#100F14]/95 backdrop-blur-xl z-20 select-none">
      {/* LEFT: Track Info & Champagne Heart */}
      <div className="flex items-center gap-3 w-1/4 min-w-[220px]">
        {currentTrack ? (
          <>
            <div className="relative w-12 h-12 rounded-lg overflow-hidden border border-[#292731] shrink-0 bg-[#16151C]">
              {currentTrack.cover_art ? (
                <img
                  src={currentTrack.cover_art}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover"
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
            <div className="flex flex-col min-w-0 pr-2">
              <span className="text-xs font-semibold text-[#F4F2F7] truncate">
                {currentTrack.title}
              </span>
              <span className="text-[11px] text-[#777381] truncate">
                {currentTrack.artist}
              </span>
            </div>
            <button
              onClick={() => toggleLike(currentTrack.id)}
              className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                isLiked ? 'text-[#E8C77A]' : 'text-[#65616F] hover:text-[#E8C77A]'
              }`}
              title={isLiked ? 'Remove from Liked' : 'Save to Liked'}
              aria-label={isLiked ? 'Remove from Liked' : 'Save to Liked'}
            >
              <Heart className={`w-4 h-4 ${isLiked ? 'fill-[#E8C77A] text-[#E8C77A]' : ''}`} />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-3 text-xs text-[#65616F]">
            <div className="w-12 h-12 rounded-lg bg-[#16151C] border border-[#292731] flex items-center justify-center">
              <Disc3 className="w-5 h-5 text-[#4B4854]" />
            </div>
            <span className="text-[11px]">No song selected</span>
          </div>
        )}
      </div>

      {/* CENTER: Playback Controls & Scrubber */}
      <div className="flex flex-col items-center gap-1.5 w-2/4 max-w-xl">
        {/* Buttons */}
        <div className="flex items-center gap-5">
          <button
            onClick={toggleShuffle}
            className={`p-1.5 rounded-full transition-colors cursor-pointer ${
              shuffle ? 'text-[#19E6A0]' : 'text-[#777381] hover:text-[#F4F2F7]'
            }`}
            title="Shuffle"
            aria-label="Shuffle"
          >
            <Shuffle className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={prevTrack}
            className="p-1.5 rounded-full text-[#B8B4C0] hover:text-[#F4F2F7] transition-colors cursor-pointer"
            title="Previous (Ctrl+Left)"
            aria-label="Previous Track"
          >
            <SkipBack className="w-4 h-4 fill-current" />
          </button>

          <button
            onClick={togglePlay}
            className="w-9 h-9 rounded-full bg-[#19E6A0] hover:bg-[#35F0B1] text-black flex items-center justify-center shadow transition-transform hover:scale-105 active:scale-95 cursor-pointer"
            title="Play / Pause (Space)"
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
            className="p-1.5 rounded-full text-[#B8B4C0] hover:text-[#F4F2F7] transition-colors cursor-pointer"
            title="Next (Ctrl+Right)"
            aria-label="Next Track"
          >
            <SkipForward className="w-4 h-4 fill-current" />
          </button>

          <button
            onClick={cycleRepeat}
            className={`p-1.5 rounded-full transition-colors cursor-pointer ${
              repeatMode !== 'off' ? 'text-[#19E6A0]' : 'text-[#777381] hover:text-[#F4F2F7]'
            }`}
            title={`Repeat: ${repeatMode}`}
            aria-label={`Repeat: ${repeatMode}`}
          >
            {repeatMode === 'one' ? <Repeat1 className="w-3.5 h-3.5" /> : <Repeat className="w-3.5 h-3.5" />}
          </button>
        </div>

        {/* Time Scrubber */}
        <div className="w-full flex items-center gap-3 text-[11px] text-[#777381] font-mono">
          <span className="w-8 text-right">{formatTime(currentTime)}</span>

          <div
            ref={progressBarRef}
            onClick={handleProgressClick}
            onMouseMove={handleProgressMouseMove}
            onMouseLeave={handleProgressMouseLeave}
            className="relative flex-1 h-3 flex items-center cursor-pointer group py-1"
          >
            {/* Background Track */}
            <div className="w-full h-1 bg-[#292731] rounded-full overflow-hidden relative group-hover:h-1.5 transition-all">
              {/* Hover line */}
              {hoverPercent !== null && (
                <div
                  className="absolute top-0 bottom-0 bg-white/10"
                  style={{ width: `${hoverPercent}%` }}
                />
              )}
              {/* Active filled progress */}
              <div
                className="h-full bg-[#19E6A0] rounded-full relative"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Scrubber Knob */}
            <div
              className="absolute w-2.5 h-2.5 bg-[#F4F2F7] rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity -translate-x-1/2 pointer-events-none"
              style={{ left: `${progressPercent}%` }}
            />

            {/* Hover Tooltip */}
            {hoverTime !== null && (
              <div
                className="absolute -top-7 px-1.5 py-0.5 rounded bg-[#16151C] border border-[#292731] text-[10px] text-[#F4F2F7] font-mono -translate-x-1/2 shadow"
                style={{ left: `${hoverPercent}%` }}
              >
                {formatTime(hoverTime)}
              </div>
            )}
          </div>

          <span className="w-8">{formatTime(duration)}</span>
        </div>
      </div>

      {/* RIGHT: Tools & Volume */}
      <div className="flex items-center justify-end gap-3 w-1/4 min-w-[220px]">
        {/* Real-time Visualizer Button */}
        <button
          onClick={onToggleVisualizer}
          className={`p-1.5 transition-colors cursor-pointer ${
            isVisualizerActive ? 'text-[#19E6A0]' : 'text-[#777381] hover:text-[#F4F2F7]'
          }`}
          title="Audio Visualizer"
          aria-label="Toggle Audio Visualizer"
        >
          <Radio className="w-4 h-4" />
        </button>

        {/* Live Lyrics Button */}
        <button
          onClick={onToggleLyrics}
          className={`p-1.5 transition-colors cursor-pointer ${
            isLyricsActive ? 'text-[#19E6A0]' : 'text-[#777381] hover:text-[#F4F2F7]'
          }`}
          title="Lyrics"
          aria-label="Toggle Lyrics"
        >
          <Mic2 className="w-4 h-4" />
        </button>

        {/* Equalizer Button */}
        <button
          onClick={onToggleEqualizer}
          className={`p-1.5 transition-colors cursor-pointer ${
            isEqualizerActive ? 'text-[#19E6A0]' : 'text-[#777381] hover:text-[#F4F2F7]'
          }`}
          title="Equalizer"
          aria-label="Toggle Equalizer"
        >
          <Sliders className="w-4 h-4" />
        </button>

        {/* Queue Button */}
        <button
          onClick={onToggleQueue}
          className={`p-1.5 transition-colors cursor-pointer ${
            isQueueActive ? 'text-[#19E6A0]' : 'text-[#777381] hover:text-[#F4F2F7]'
          }`}
          title="Playing Queue"
          aria-label="Toggle Playing Queue"
        >
          <ListOrdered className="w-4 h-4" />
        </button>

        {/* Volume Scrubber */}
        <div className="flex items-center gap-2 pl-2 border-l border-[#292731]">
          <button
            onClick={toggleMute}
            className="text-[#777381] hover:text-[#F4F2F7] transition-colors cursor-pointer"
            title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
            aria-label="Toggle Mute"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-[#FF667A]" />
            ) : volume < 0.5 ? (
              <Volume1 className="w-4 h-4" />
            ) : (
              <Volume2 className="w-4 h-4" />
            )}
          </button>

          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={(e) => setVolumeLevel(parseFloat(e.target.value))}
            className="w-20 h-1 slider-track cursor-pointer"
            title={`Volume: ${Math.round(volume * 100)}%`}
            aria-label="Volume slider"
          />
        </div>
      </div>
    </footer>
  );
};
