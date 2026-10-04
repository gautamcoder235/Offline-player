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
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-[#65616F] select-none">
        <Mic2 className="w-12 h-12 mb-3 text-[#4B4854] animate-pulse" />
        <h3 className="text-sm font-semibold text-[#9A96A5]">No Song Playing</h3>
        <p className="text-xs text-[#65616F] mt-1">Play a track to view synchronized lyrics</p>
      </div>
    );
  }

  const trackColor = getTrackColor(currentTrack.title, currentTrack.artist);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden select-none relative bg-[#0B0A0F]">
      {/* Top Bar */}
      <div className="px-8 py-4 flex items-center justify-between border-b border-[#292731] z-10 bg-[#100F14]/90 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-lg overflow-hidden border border-[#292731] shrink-0 bg-[#16151C]">
            {currentTrack.cover_art ? (
              <img src={currentTrack.cover_art} alt="" className="w-full h-full object-cover" />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center font-bold text-xs"
                style={{ background: trackColor.bg, color: trackColor.text }}
              >
                <Disc3 className="w-5 h-5" />
              </div>
            )}
          </div>
          <div>
            <h2 className="text-sm font-bold text-[#F4F2F7] tracking-tight truncate max-w-md">
              {currentTrack.title}
            </h2>
            <p className="text-xs text-[#19E6A0] font-medium truncate max-w-md">
              {currentTrack.artist}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {currentLyrics?.isSynced && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#19E6A0]/10 text-[#19E6A0] text-[11px] font-medium border border-[#19E6A0]/20">
              <Check className="w-3 h-3" />
              <span>Synced Lyrics</span>
            </span>
          )}

          {isEditing ? (
            <button
              onClick={handleSaveEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#19E6A0] hover:bg-[#35F0B1] text-black text-xs font-semibold transition-colors duration-150 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Save</span>
            </button>
          ) : (
            <button
              onClick={handleStartEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#16151C] hover:bg-[#1D1C23] text-[#AAA6B2] hover:text-[#F4F2F7] text-xs font-medium border border-[#292731] transition-colors duration-150 cursor-pointer"
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
          <div className="my-auto flex flex-col items-center gap-2 text-[#19E6A0]">
            <Mic2 className="w-6 h-6 animate-pulse" />
            <p className="text-xs font-medium">Fetching & Synchronizing Lyrics...</p>
          </div>
        ) : isEditing ? (
          <div className="w-full max-w-2xl h-full flex flex-col gap-2 py-4">
            <p className="text-xs text-[#777381] text-left">
              Paste or edit standard LRC timestamps (e.g. [00:15.30] lyric line):
            </p>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              placeholder="[00:10.00] First lyric line&#10;[00:14.50] Second lyric line..."
              className="flex-1 w-full p-4 rounded-xl bg-[#14131A] border border-[#282631] font-mono text-xs text-[#F4F2F7] placeholder-[#65616F] focus:outline-none focus:border-[#19E6A0]/50 resize-none"
            />
          </div>
        ) : !currentLyrics || currentLyrics.lines.length === 0 ? (
          <div className="my-auto flex flex-col items-center gap-2 text-[#65616F]">
            <Mic2 className="w-10 h-10 text-[#4B4854]" />
            <p className="text-xs font-medium text-[#AAA6B2]">No lyrics available</p>
            <p className="text-[11px] text-[#65616F]">
              Click &quot;Edit LRC&quot; above to add synced or plain lyrics for this track.
            </p>
          </div>
        ) : (
          <div className="w-full max-w-2xl space-y-5 py-16">
            {currentLyrics.lines.map((line, idx) => {
              const isActive = idx === activeLyricIndex;
              return (
                <div
                  key={`${line.time}-${idx}`}
                  ref={isActive ? activeLineRef : null}
                  onClick={() => seekTo(line.time)}
                  className={`cursor-pointer transition-[color,transform] duration-200 transform ${
                    isActive
                      ? 'text-2xl sm:text-3xl font-bold text-[#F4F2F7] scale-102 drop-shadow-[0_0_24px_rgba(25,230,160,0.3)]'
                      : 'text-base sm:text-lg font-medium text-[#65616F] hover:text-[#AAA6B2]'
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
