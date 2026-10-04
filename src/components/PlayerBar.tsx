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
    : { bg: '#1f2937', text: '#9ca3af', glow: 'transparent' };

  return (
    <footer className="h-24 px-6 flex items-center justify-between glass-panel border-t border-white/10 bg-[#090a0f]/95 z-20 select-none">
      {/* LEFT: Track Info & Heart */}
      <div className="flex items-center gap-3 w-1/4 min-w-[220px]">
        {currentTrack ? (
          <>
            <div className="relative w-14 h-14 rounded-lg overflow-hidden shadow-sm border border-white/10 shrink-0 group">
              {currentTrack.cover_art ? (
                <img
                  src={currentTrack.cover_art}
                  alt={currentTrack.title}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-lg font-bold"
                  style={{ background: trackColor.bg, color: trackColor.text }}
                >
                  <Disc3 className={`w-7 h-7 ${isPlaying ? 'animate-spin' : ''}`} style={{ animationDuration: '6s' }} />
                </div>
              )}
            </div>
            <div className="flex flex-col min-w-0 pr-2">
              <span className="text-sm font-semibold text-white truncate hover:underline cursor-pointer">
                {currentTrack.title}
              </span>
              <span className="text-xs text-gray-400 truncate hover:text-white cursor-pointer">
                {currentTrack.artist}
              </span>
            </div>
            <button
              onClick={() => toggleLike(currentTrack.id)}
              className={`p-1.5 rounded-full transition-transform hover:scale-110 active:scale-95 cursor-pointer ${
                isLiked ? 'text-rose-500' : 'text-gray-400 hover:text-white'
              }`}
              title={isLiked ? 'Remove from Liked' : 'Save to Liked'}
              aria-label={isLiked ? 'Remove from Liked' : 'Save to Liked'}
            >
              <Heart className={`w-4 h-4 ${isLiked ? 'fill-rose-500 text-rose-500' : ''}`} />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <div className="w-14 h-14 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center">
              <Disc3 className="w-6 h-6 text-gray-600" />
            </div>
            <span>No song selected</span>
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
              shuffle ? 'text-emerald-400' : 'text-gray-400 hover:text-white'
            }`}
            title="Shuffle"
            aria-label="Shuffle"
          >
            <Shuffle className="w-4 h-4" />
          </button>

          <button
            onClick={prevTrack}
            className="p-1.5 rounded-full text-gray-300 hover:text-white hover:bg-white/5 transition-transform active:scale-95 cursor-pointer"
            title="Previous (Ctrl+Left)"
            aria-label="Previous Track"
          >
            <SkipBack className="w-5 h-5 fill-current" />
          </button>

          <button
            onClick={togglePlay}
            className="w-9 h-9 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black flex items-center justify-center shadow-md transition-transform hover:scale-105 active:scale-95 cursor-pointer"
            title="Play / Pause (Space)"
            aria-label="Play or Pause"
          >
            {isPlaying ? (
              <Pause className="w-5 h-5 fill-black text-black" />
            ) : (
              <Play className="w-5 h-5 fill-black text-black ml-0.5" />
            )}
          </button>

          <button
            onClick={nextTrack}
            className="p-1.5 rounded-full text-gray-300 hover:text-white hover:bg-white/5 transition-transform active:scale-95 cursor-pointer"
            title="Next (Ctrl+Right)"
            aria-label="Next Track"
          >
            <SkipForward className="w-5 h-5 fill-current" />
          </button>

          <button
            onClick={cycleRepeat}
            className={`p-1.5 rounded-full transition-colors cursor-pointer ${
              repeatMode !== 'off' ? 'text-emerald-400' : 'text-gray-400 hover:text-white'
            }`}
            title={`Repeat: ${repeatMode}`}
            aria-label={`Repeat: ${repeatMode}`}
          >
            {repeatMode === 'one' ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
          </button>
        </div>

        {/* Time Scrubber */}
        <div className="w-full flex items-center gap-3 text-[11px] text-gray-400 font-mono">
          <span className="w-9 text-right">{formatTime(currentTime)}</span>

          <div
            ref={progressBarRef}
            onClick={handleProgressClick}
            onMouseMove={handleProgressMouseMove}
            onMouseLeave={handleProgressMouseLeave}
            className="relative flex-1 h-3 flex items-center cursor-pointer group py-1"
          >
            {/* Background Track */}
            <div className="w-full h-1 bg-white/15 rounded-full overflow-hidden relative group-hover:h-1.5 transition-all">
              {/* Hover line */}
              {hoverPercent !== null && (
                <div
                  className="absolute top-0 bottom-0 bg-white/20"
                  style={{ width: `${hoverPercent}%` }}
                />
              )}
              {/* Active filled progress */}
              <div
               className="h-full bg-[var(--accent)] rounded-full relative group-hover:bg-[var(--accent-hover)]"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Scrubber Knob */}
            <div
              className="absolute w-3 h-3 bg-white rounded-full shadow-md opacity-0 group-hover:opacity-100 transition-opacity -translate-x-1/2 pointer-events-none"
              style={{ left: `${progressPercent}%` }}
            />

            {/* Hover Tooltip */}
            {hoverTime !== null && (
              <div
                className="absolute -top-7 px-1.5 py-0.5 rounded bg-gray-900 border border-white/20 text-[10px] text-white font-mono -translate-x-1/2 shadow"
                style={{ left: `${hoverPercent}%` }}
              >
                {formatTime(hoverTime)}
              </div>
            )}
          </div>

          <span className="w-9">{formatTime(duration)}</span>
        </div>
      </div>

      {/* RIGHT: Deluxe Audio Suite & Volume */}
      <div className="flex items-center justify-end gap-3 w-1/4 min-w-[220px]">
        {/* Real-time Visualizer Button */}
        <button
          onClick={onToggleVisualizer}
          className={`p-2 transition-colors cursor-pointer ${
            isVisualizerActive ? 'text-[var(--accent)]' : 'text-gray-400 hover:text-white'
          }`}
          title="Audio Visualizer"
          aria-label="Toggle Audio Visualizer"
        >
          <Radio className="w-4 h-4" />
        </button>

        {/* Live Lyrics Button */}
        <button
          onClick={onToggleLyrics}
          className={`p-2 transition-colors cursor-pointer ${
            isLyricsActive ? 'text-[var(--accent)]' : 'text-gray-400 hover:text-white'
          }`}
          title="Lyrics"
          aria-label="Toggle Lyrics"
        >
          <Mic2 className="w-4 h-4" />
        </button>

        {/* Equalizer Button */}
        <button
          onClick={onToggleEqualizer}
          className={`p-2 transition-colors cursor-pointer ${
            isEqualizerActive ? 'text-[var(--accent)]' : 'text-gray-400 hover:text-white'
          }`}
          title="Equalizer"
          aria-label="Toggle Equalizer"
        >
          <Sliders className="w-4 h-4" />
        </button>

        {/* Queue Button */}
        <button
          onClick={onToggleQueue}
          className={`p-2 transition-colors cursor-pointer ${
            isQueueActive ? 'text-[var(--accent)]' : 'text-gray-400 hover:text-white'
          }`}
          title="Playing Queue"
          aria-label="Toggle Playing Queue"
        >
          <ListOrdered className="w-4 h-4" />
        </button>

        {/* Volume Scrubber */}
        <div className="flex items-center gap-2 pl-2 border-l border-white/10">
          <button
            onClick={toggleMute}
            className="text-gray-400 hover:text-white transition-colors cursor-pointer"
            title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
            aria-label="Toggle Mute"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-4 h-4 text-rose-400" />
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
            className="w-24 h-1 slider-track cursor-pointer"
            title={`Volume: ${Math.round(volume * 100)}%`}
            aria-label="Volume slider"
          />
        </div>
      </div>
    </footer>
  );
};
