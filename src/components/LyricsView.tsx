import React, { useEffect, useRef, useState } from 'react';
import { Mic2, Edit3, Check, Disc3 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { getTrackColor } from '../utils/helpers';

export const LyricsView: React.FC = () => {
  const {
    currentTrack,
    currentLyrics,
    isLoadingLyrics,
    activeLyricIndex,
    seekTo,
    saveLyrics,
  } = usePlayer();

  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to active lyric line
  useEffect(() => {
    if (isEditing || !activeLineRef.current || !scrollContainerRef.current) return;
    activeLineRef.current.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, [activeLyricIndex, isEditing]);

  const handleStartEdit = () => {
    setEditText(currentLyrics?.rawText || '');
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!currentTrack) return;
    await saveLyrics(currentTrack, editText);
    setIsEditing(false);
  };

  if (!currentTrack) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-500 select-none">
        <Mic2 className="w-16 h-16 mb-4 text-gray-600 animate-pulse" />
        <h3 className="text-base font-semibold text-gray-300">No Song Playing</h3>
        <p className="text-xs text-gray-500 mt-1">Play a track to view synchronized lyrics</p>
      </div>
    );
  }

  const trackColor = getTrackColor(currentTrack.title, currentTrack.artist);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none relative">
      {/* Top Bar */}
      <div className="px-8 py-5 flex items-center justify-between border-b border-white/5 z-10 glass-panel bg-black/20">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl overflow-hidden border border-white/10 shrink-0">
            {currentTrack.cover_art ? (
              <img src={currentTrack.cover_art} alt="" className="w-full h-full object-cover" />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center font-bold text-xs"
                style={{ background: trackColor.bg, color: trackColor.text }}
              >
                <Disc3 className="w-6 h-6" />
              </div>
            )}
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-wide truncate max-w-md">
              {currentTrack.title}
            </h2>
            <p className="text-xs text-emerald-400 font-medium truncate max-w-md">
              {currentTrack.artist}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentLyrics?.isSynced && (
            <span className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-500/10 text-emerald-400 text-xs border border-emerald-500/20">
              <Check className="w-3 h-3" />
              <span>Synced Lyrics</span>
            </span>
          )}

          {isEditing ? (
            <button
              onClick={handleSaveEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors duration-150 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save Lyrics</span>
            </button>
          ) : (
            <button
              onClick={handleStartEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-xs font-medium border border-white/10 transition-colors duration-150 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit LRC</span>
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-8 py-16 flex flex-col items-center justify-start text-center"
      >
        {isLoadingLyrics ? (
          <div className="my-auto flex flex-col items-center gap-3 text-emerald-400">
            <Mic2 className="w-8 h-8 animate-bounce" />
            <p className="text-sm font-medium">Fetching & Synchronizing Lyrics...</p>
          </div>
        ) : isEditing ? (
          <div className="w-full max-w-2xl h-full flex flex-col gap-3 py-4">
            <p className="text-xs text-gray-400 text-left">
              Paste or edit standard LRC timestamps (e.g. [00:15.30] lyrics line) or plain text:
            </p>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              placeholder="[00:10.00] First lyric line&#10;[00:14.50] Second lyric line..."
              className="flex-1 w-full p-4 rounded-2xl bg-black/60 border border-white/10 font-mono text-xs text-white placeholder-gray-600 focus:outline-none focus:border-emerald-500 resize-none"
            />
          </div>
        ) : !currentLyrics || currentLyrics.lines.length === 0 ? (
          <div className="my-auto flex flex-col items-center gap-2 text-gray-500">
            <Mic2 className="w-12 h-12 text-gray-600" />
            <p className="text-sm font-medium text-gray-300">No lyrics available</p>
            <p className="text-xs text-gray-500">
              Click &quot;Edit LRC&quot; above to add synced or plain lyrics for this track.
            </p>
          </div>
        ) : (
          <div className="w-full max-w-2xl space-y-6 py-20">
            {currentLyrics.lines.map((line, idx) => {
              const isActive = idx === activeLyricIndex;
              return (
                <div
                  key={`${line.time}-${idx}`}
                  ref={isActive ? activeLineRef : null}
                  onClick={() => seekTo(line.time)}
                  className={`cursor-pointer transition-[color,transform] duration-300 transform ${
                    isActive
                      ? 'text-2xl sm:text-3xl font-extrabold text-white scale-105'
                      : 'text-lg sm:text-xl font-medium text-gray-500 hover:text-gray-300 hover:scale-101 opacity-60'
                  }`}
                >
                  <p className="leading-relaxed">{line.text}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
