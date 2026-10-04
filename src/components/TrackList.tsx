import React, { useState, useRef, useEffect } from 'react';
import {
  Play,
  Pause,
  Heart,
  MoreHorizontal,
  Clock,
  Plus,
  FolderOpen,
  Disc3,
  BarChart2,
} from 'lucide-react';
import { Track } from '../types';
import { usePlayer } from '../context/PlayerContext';
import { getTrackColor } from '../utils/helpers';

interface TrackListProps {
  tracks: Track[];
  title?: string;
  subtitle?: string;
  coverArt?: string | null;
}

export const TrackList: React.FC<TrackListProps> = ({
  tracks,
  title,
  subtitle,
  coverArt,
}) => {
  const {
    currentTrack,
    isPlaying,
    playTrack,
    togglePlay,
    likedTrackIds,
    toggleLike,
    addToQueue,
    playlists,
    addTrackToPlaylist,
    openInExplorer,
  } = usePlayer();

  const [activeMenuTrackId, setActiveMenuTrackId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenuTrackId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleRowClick = (track: Track) => {
    if (currentTrack?.id === track.id) {
      togglePlay();
    } else {
      playTrack(track, tracks);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto pb-12 select-none">
      {/* Hero Banner with Champagne accent */}
      {title && (
        <div className="p-8 flex items-end gap-6 bg-gradient-to-b from-[#16151C]/60 via-transparent to-transparent border-b border-[#292731]">
          <div className="w-32 h-32 rounded-xl overflow-hidden shadow-lg border border-[#292731] shrink-0 bg-[#16151C] flex items-center justify-center">
            {coverArt ? (
              <img src={coverArt} alt={title} className="w-full h-full object-cover" />
            ) : (
              <Disc3 className="w-14 h-14 text-[#65616F]" />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider font-bold text-[#E8C77A]">
                Collection
              </span>
              <span className="text-[10px] text-[#65616F]">•</span>
              <span className="text-[10px] text-[#777381] font-mono">320 kbps HQ</span>
            </div>
            <h1 className="text-2xl font-bold text-[#F4F2F7] tracking-tight">{title}</h1>
            <p className="text-xs text-[#9A96A5]">
              {subtitle || `${tracks.length} tracks available offline`}
            </p>
          </div>
        </div>
      )}

      {/* Track Table */}
      <div className="px-6 py-3">
        {tracks.length === 0 ? (
          <div className="py-20 text-center text-[#65616F]">
            <Disc3 className="w-10 h-10 mx-auto mb-3 text-[#4B4854] animate-pulse" />
            <p className="text-xs font-medium text-[#9A96A5]">No songs found in this view</p>
            <p className="text-[11px] text-[#65616F] mt-1">
              Check your search query or add music directories in Settings.
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-[#292731] text-[#65616F] uppercase tracking-wider font-semibold text-[10px]">
                <th className="w-12 pb-2.5 pl-3 text-center">#</th>
                <th className="pb-2.5">Title</th>
                <th className="pb-2.5 hidden md:table-cell">Album</th>
                <th className="w-24 pb-2.5 text-right pr-4">
                  <Clock className="w-3 h-3 inline-block text-[#65616F]" />
                </th>
                <th className="w-12 pb-2.5 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#292731]/40">
              {tracks.map((track, idx) => {
                const isCurrent = currentTrack?.id === track.id;
                const isLiked = likedTrackIds.has(track.id);
                const isMenuOpen = activeMenuTrackId === track.id;
                const trackColor = getTrackColor(track.title, track.artist);

                return (
                  <tr
                    key={track.id}
                    onDoubleClick={() => playTrack(track, tracks)}
                    className={`group transition-colors duration-150 cursor-pointer ${
                      isCurrent
                        ? 'bg-[#19181F] border-l-2 border-[#19E6A0] shadow-[inset_0_0_24px_rgba(25,230,160,0.04)]'
                        : 'hover:bg-[#1D1C23] border-l-2 border-transparent text-[#9A96A5]'
                    }`}
                  >
                    {/* Index / Play Button */}
                    <td className="py-2 pl-3 text-center relative w-12">
                      <span
                        className={`inline-block font-mono text-[11px] group-hover:hidden ${
                          isCurrent ? 'text-[#19E6A0] font-bold' : 'text-[#65616F]'
                        }`}
                      >
                        {isCurrent && isPlaying ? (
                          <BarChart2 className="w-3.5 h-3.5 mx-auto animate-pulse text-[#19E6A0]" />
                        ) : (
                          idx + 1
                        )}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRowClick(track);
                        }}
                        className="hidden group-hover:inline-flex items-center justify-center w-6 h-6 rounded-full text-[#F4F2F7] hover:text-[#19E6A0] transition-colors cursor-pointer"
                        aria-label={isCurrent && isPlaying ? 'Pause' : 'Play'}
                      >
                        {isCurrent && isPlaying ? (
                          <Pause className="w-3 h-3 fill-current" />
                        ) : (
                          <Play className="w-3 h-3 fill-current ml-0.5" />
                        )}
                      </button>
                    </td>

                    {/* Title & Artist */}
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-md overflow-hidden shrink-0 border border-[#292731] shadow-sm bg-[#16151C]">
                          {track.cover_art ? (
                            <img
                              src={track.cover_art}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div
                              className="w-full h-full flex items-center justify-center font-bold text-[10px]"
                              style={{ background: trackColor.bg, color: trackColor.text }}
                            >
                              <Disc3 className="w-4 h-4" />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span
                            className={`font-medium truncate text-xs ${
                              isCurrent ? 'text-[#19E6A0]' : 'text-[#F4F2F7]'
                            }`}
                          >
                            {track.title}
                          </span>
                          <span className="text-[11px] text-[#777381] truncate">
                            {track.artist}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Album */}
                    <td className="py-2 pr-4 hidden md:table-cell text-[#777381] truncate max-w-xs text-[11px]">
                      {track.album}
                    </td>

                    {/* Duration & Like (Champagne Gold for Liked State) */}
                    <td className="py-2 pr-4 text-right font-mono text-[11px] text-[#777381]">
                      <div className="flex items-center justify-end gap-2.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLike(track.id);
                          }}
                          className={`p-1 transition-opacity cursor-pointer ${
                            isLiked
                              ? 'text-[#E8C77A] opacity-100'
                              : 'text-[#65616F] opacity-0 group-hover:opacity-100 hover:text-[#E8C77A]'
                          }`}
                          aria-label={isLiked ? 'Remove from liked' : 'Add to liked'}
                        >
                          <Heart
                            className={`w-3.5 h-3.5 ${
                              isLiked ? 'fill-[#E8C77A] text-[#E8C77A]' : ''
                            }`}
                          />
                        </button>
                        <span>{track.duration_str}</span>
                      </div>
                    </td>

                    {/* Context / More Menu */}
                    <td className="py-2 pr-3 text-center relative w-12">
                      <div className="relative inline-block" ref={isMenuOpen ? menuRef : null}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuTrackId(isMenuOpen ? null : track.id);
                          }}
                          className="p-1 rounded-md text-[#65616F] hover:text-[#F4F2F7] hover:bg-[#1D1C23] opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          aria-label="More options"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>

                        {isMenuOpen && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 top-6 w-48 py-1.5 rounded-lg bg-[#16151C] border border-[#292731] text-xs shadow-xl z-50"
                          >
                            <button
                              onClick={() => {
                                addToQueue(track);
                                setActiveMenuTrackId(null);
                              }}
                              className="w-full px-3 py-1.5 text-left text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#1D1C23] flex items-center gap-2.5 cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5 text-[#19E6A0]" />
                              <span>Add to Queue</span>
                            </button>

                            {playlists.length > 0 && (
                              <div className="border-t border-[#292731] my-1 pt-1">
                                <div className="px-3 py-1 text-[10px] text-[#65616F] uppercase font-semibold">
                                  Add to Playlist
                                </div>
                                {playlists.map((pl) => (
                                  <button
                                    key={pl.id}
                                    onClick={() => {
                                      addTrackToPlaylist(pl.id, track.id);
                                      setActiveMenuTrackId(null);
                                    }}
                                    className="w-full px-4 py-1 text-left text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#1D1C23] truncate cursor-pointer text-xs"
                                  >
                                    + {pl.name}
                                  </button>
                                ))}
                              </div>
                            )}

                            <div className="border-t border-[#292731] my-1 pt-1">
                              <button
                                onClick={() => {
                                  openInExplorer(track.file_path);
                                  setActiveMenuTrackId(null);
                                }}
                                className="w-full px-3 py-1.5 text-left text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#1D1C23] flex items-center gap-2.5 cursor-pointer text-xs"
                              >
                                <FolderOpen className="w-3.5 h-3.5 text-[#E8C77A]" />
                                <span>Reveal in Explorer</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
