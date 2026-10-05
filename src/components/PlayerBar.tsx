import React, { useRef } from 'react';
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
  PictureInPicture2,
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
    toggleMiniPlayer,
  } = usePlayer();

  const progressBarRef = useRef<HTMLDivElement>(null);
  const hoverLineRef = useRef<HTMLDivElement>(null);
  const hoverTooltipRef = useRef<HTMLDivElement>(null);

  const isLiked = currentTrack ? likedTrackIds.has(currentTrack.id) : false;

  const handleProgressMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration <= 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const hTime = pos * duration;
    
    if (hoverLineRef.current && hoverTooltipRef.current) {
      hoverLineRef.current.style.width = `${pos * 100}%`;
      hoverTooltipRef.current.style.left = `${pos * 100}%`;
      hoverTooltipRef.current.innerText = formatTime(hTime);
      hoverLineRef.current.style.display = 'block';
      hoverTooltipRef.current.style.display = 'block';
    }
  };

  const handleProgressMouseLeave = () => {
    if (hoverLineRef.current && hoverTooltipRef.current) {
      hoverLineRef.current.style.display = 'none';
      hoverTooltipRef.current.style.display = 'none';
    }
  };

  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || duration <= 0) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(pos * duration);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const effectiveVol = isMuted ? 0 : volume;
  const volPercent = Math.round(effectiveVol * 100);

  const trackColor = currentTrack
    ? getTrackColor(currentTrack.title, currentTrack.artist)
    : { bg: '#16151C', text: '#777381', glow: 'transparent' };

  return (
    <footer className="h-20 shrink-0 px-3 sm:px-6 flex items-center justify-between border-t border-[#292731]/40 bg-[#100F14]/95 backdrop-blur-xl z-20 select-none overflow-hidden">
      {/* LEFT: Track Info & Champagne Heart */}
      <div className="flex items-center gap-2 sm:gap-3 flex-1 sm:flex-none sm:w-1/4 min-w-0 max-w-[200px] sm:max-w-[280px] md:max-w-[320px] shrink-0">
        {currentTrack ? (
          <>
            <div className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-lg overflow-hidden border border-[#292731] shrink-0 bg-[#16151C]">
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
            <div className="flex flex-col min-w-0 pr-1 sm:pr-2">
              <span className="text-xs font-semibold text-[#F4F2F7] truncate">
                {currentTrack.title}
              </span>
              <span className="text-[10px] sm:text-[11px] text-[#777381] truncate">
                {currentTrack.artist}
              </span>
            </div>
            <button
              onClick={() => toggleLike(currentTrack.id)}
              className={`p-1 sm:p-1.5 rounded-full transition-all duration-200 active:scale-90 cursor-pointer shrink-0 ${
                isLiked ? 'text-[#E8C77A]' : 'text-[#65616F] hover:text-[#E8C77A]'
              }`}
              title={isLiked ? 'Remove from Liked' : 'Save to Liked'}
              aria-label={isLiked ? 'Remove from Liked' : 'Save to Liked'}
            >
              <Heart className={`w-4 h-4 transition-transform duration-300 ${isLiked ? 'fill-[#E8C77A] text-[#E8C77A] scale-110' : 'scale-100'}`} />
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
            className={`relative p-1 sm:p-1.5 rounded-full transition-all duration-200 active:scale-95 cursor-pointer ${
              shuffle ? 'text-[#19E6A0]' : 'text-[#777381] hover:text-[#F4F2F7]'
            }`}
            title="Shuffle"
            aria-label="Shuffle"
          >
            <Shuffle className="w-3.5 h-3.5" />
            {shuffle && <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#19E6A0] animate-in fade-in zoom-in duration-200" />}
          </button>

          <button
            onClick={prevTrack}
            className="p-1 sm:p-1.5 rounded-full text-[#B8B4C0] hover:text-[#F4F2F7] transition-all duration-200 active:scale-90 cursor-pointer"
            title="Previous (Ctrl+Left)"
            aria-label="Previous Track"
          >
            <SkipBack className="w-4 h-4 fill-current" />
          </button>

          <button
            onClick={togglePlay}
            className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#19E6A0] hover:bg-[#35F0B1] text-black flex items-center justify-center shadow transition-all duration-200 hover:scale-[1.03] active:scale-95 cursor-pointer shrink-0"
            title="Play / Pause (Space)"
            aria-label="Play or Pause"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-black text-black animate-in zoom-in duration-200" />
            ) : (
              <Play className="w-4 h-4 fill-black text-black ml-0.5 animate-in zoom-in duration-200" />
            )}
          </button>

          <button
            onClick={nextTrack}
            className="p-1 sm:p-1.5 rounded-full text-[#B8B4C0] hover:text-[#F4F2F7] transition-all duration-200 active:scale-90 cursor-pointer"
            title="Next (Ctrl+Right)"
            aria-label="Next Track"
          >
            <SkipForward className="w-4 h-4 fill-current" />
          </button>

          <button
            onClick={cycleRepeat}
            className={`relative p-1 sm:p-1.5 rounded-full transition-all duration-200 active:scale-95 cursor-pointer ${
              repeatMode !== 'off' ? 'text-[#19E6A0]' : 'text-[#777381] hover:text-[#F4F2F7]'
            }`}
            title={`Repeat: ${repeatMode}`}
            aria-label={`Repeat: ${repeatMode}`}
          >
            {repeatMode === 'one' ? <Repeat1 className="w-3.5 h-3.5" /> : <Repeat className="w-3.5 h-3.5" />}
            {repeatMode !== 'off' && <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-[#19E6A0] animate-in fade-in zoom-in duration-200" />}
          </button>
        </div>

        {/* Time Scrubber */}
        <div className="w-full flex items-center gap-2 sm:gap-3 text-[10px] sm:text-[11px] text-[#777381] font-mono">
          <span className="w-7 sm:w-8 text-right shrink-0">{formatTime(currentTime)}</span>

          <div
            ref={progressBarRef}
            onClick={handleProgressClick}
            onMouseMove={handleProgressMouseMove}
            onMouseLeave={handleProgressMouseLeave}
            className="relative flex-1 h-3 flex items-center cursor-pointer group py-1 min-w-[60px]"
          >
            {/* Background Track */}
            <div className="w-full h-1 bg-[#292731] rounded-full overflow-hidden relative group-hover:h-1.5 transition-all duration-200">
              {/* Hover line */}
              <div
                ref={hoverLineRef}
                className="absolute top-0 bottom-0 bg-white/10 hidden"
              />
              {/* Active filled progress */}
              <div
                className="h-full bg-[#19E6A0] rounded-full relative"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Scrubber Knob */}
            <div
              className="absolute w-2.5 h-2.5 bg-[#F4F2F7] rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity duration-200 -translate-x-1/2 pointer-events-none"
              style={{ left: `${progressPercent}%` }}
            />

            {/* Hover Tooltip */}
            <div
              ref={hoverTooltipRef}
              className="absolute -top-7 px-1.5 py-0.5 rounded bg-[#16151C] border border-[#292731] text-[10px] text-[#F4F2F7] font-mono -translate-x-1/2 shadow hidden animate-in fade-in duration-150"
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
          className={`p-1 sm:p-1.5 rounded-full transition-all duration-200 active:scale-95 cursor-pointer shrink-0 ${
            isVisualizerActive ? 'text-[#19E6A0] bg-[#19E6A0]/10' : 'text-[#777381] hover:text-[#F4F2F7]'
          }`}
          title="Audio Visualizer"
          aria-label="Toggle Audio Visualizer"
        >
          <Radio className="w-4 h-4" />
        </button>

        {/* Live Lyrics Button */}
        <button
          onClick={onToggleLyrics}
          className={`p-1 sm:p-1.5 rounded-full transition-all duration-200 active:scale-95 cursor-pointer shrink-0 ${
            isLyricsActive ? 'text-[#19E6A0] bg-[#19E6A0]/10' : 'text-[#777381] hover:text-[#F4F2F7]'
          }`}
          title="Lyrics"
          aria-label="Toggle Lyrics"
        >
          <Mic2 className="w-4 h-4" />
        </button>

        {/* Equalizer Button */}
        <button
          onClick={onToggleEqualizer}
          className={`p-1 sm:p-1.5 rounded-full transition-all duration-200 active:scale-95 cursor-pointer shrink-0 ${
            isEqualizerActive ? 'text-[#19E6A0] bg-[#19E6A0]/10' : 'text-[#777381] hover:text-[#F4F2F7]'
          }`}
          title="Equalizer"
          aria-label="Toggle Equalizer"
        >
          <Sliders className="w-4 h-4" />
        </button>

        {/* Queue Button */}
        <button
          onClick={onToggleQueue}
          className={`p-1 sm:p-1.5 rounded-full transition-all duration-200 active:scale-95 cursor-pointer shrink-0 ${
            isQueueActive ? 'text-[#19E6A0] bg-[#19E6A0]/10' : 'text-[#777381] hover:text-[#F4F2F7]'
          }`}
          title="Playing Queue"
          aria-label="Toggle Playing Queue"
        >
          <ListOrdered className="w-4 h-4" />
        </button>

        {/* Mini Player Toggle */}
        <button
          onClick={toggleMiniPlayer}
          className="p-1 sm:p-1.5 rounded-full text-[#777381] hover:text-[#19E6A0] transition-all duration-200 active:scale-95 cursor-pointer shrink-0"
          title="Floating Mini Player (Ctrl+M)"
          aria-label="Toggle Floating Mini Player"
        >
          <PictureInPicture2 className="w-4 h-4" />
        </button>

        {/* Volume Scrubber */}
        <div className="flex items-center gap-1.5 sm:gap-2 pl-1.5 sm:pl-2 border-l border-[#292731] shrink-0">
          <button
            onClick={toggleMute}
            className="text-[#777381] hover:text-[#F4F2F7] transition-all duration-200 active:scale-90 cursor-pointer p-0.5"
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
            value={effectiveVol}
            onChange={(e) => setVolumeLevel(parseFloat(e.target.value))}
            className="w-16 sm:w-20 md:w-24 h-1 slider-track cursor-pointer transition-all shrink-0"
            style={{
              background: `linear-gradient(to right, #19E6A0 0%, #19E6A0 ${volPercent}%, #292731 ${volPercent}%, #292731 100%)`
            }}
            title={`Volume: ${volPercent}%`}
            aria-label="Volume slider"
          />
        </div>
      </div>
    </footer>
  );
};
