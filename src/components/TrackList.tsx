import React, { useState } from 'react';
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

  const handleRowClick = (track: Track) => {
    if (currentTrack?.id === track.id) {
      togglePlay();
    } else {
      playTrack(track, tracks);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto pb-12 select-none">
      {/* Optional Hero Banner */}
      {title && (
        <div className="p-8 flex items-end gap-6 bg-gradient-to-b from-emerald-950/40 via-transparent to-transparent border-b border-white/5">
          <div className="w-36 h-36 rounded-2xl overflow-hidden shadow-2xl border border-white/10 shrink-0 bg-white/5 flex items-center justify-center">
            {coverArt ? (
              <img src={coverArt} alt={title} className="w-full h-full object-cover" />
            ) : (
              <Disc3 className="w-16 h-16 text-emerald-500/60" />
            )}
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-wider font-bold text-emerald-400">
              Collection
            </span>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">{title}</h1>
            <p className="text-xs text-gray-400">
              {subtitle || `${tracks.length} tracks available offline`}
            </p>
          </div>
        </div>
      )}

      {/* Track Table */}
      <div className="px-6 py-4">
        {tracks.length === 0 ? (
          <div className="py-20 text-center text-gray-500">
            <Disc3 className="w-12 h-12 mx-auto mb-3 text-gray-600 animate-pulse" />
            <p className="text-sm font-medium">No songs found in this view</p>
            <p className="text-xs text-gray-600 mt-1">
              Check your search query or add music directories in Settings.
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-white/5 text-gray-400 uppercase tracking-wider font-semibold text-[10px]">
                <th className="w-12 pb-3 pl-3 text-center">#</th>
                <th className="pb-3">Title</th>
                <th className="pb-3 hidden md:table-cell">Album</th>
                <th className="w-24 pb-3 text-right pr-4">
                  <Clock className="w-3.5 h-3.5 inline-block" />
                </th>
                <th className="w-12 pb-3 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03]">
              {tracks.map((track, idx) => {
                const isCurrent = currentTrack?.id === track.id;
                const isLiked = likedTrackIds.has(track.id);
                const isMenuOpen = activeMenuTrackId === track.id;
                const trackColor = getTrackColor(track.title, track.artist);

                return (
                  <tr
                    key={track.id}
                    onDoubleClick={() => playTrack(track, tracks)}
                    className={`group hover:bg-white/[0.06] transition-colors rounded-xl ${
                      isCurrent ? 'bg-white/[0.08] text-emerald-400' : 'text-gray-300'
                    }`}
                  >
                    {/* Index / Play Button */}
                    <td className="py-2.5 pl-3 text-center relative w-12">
                      <span
                        className={`inline-block font-mono text-gray-500 group-hover:hidden ${
                          isCurrent ? 'text-emerald-400 font-bold' : ''
                        }`}
                      >
                        {isCurrent && isPlaying ? (
                          <BarChart2 className="w-3.5 h-3.5 mx-auto animate-pulse text-emerald-400" />
                        ) : (
                          idx + 1
                        )}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRowClick(track);
                        }}
                        className="hidden group-hover:inline-flex items-center justify-center w-6 h-6 rounded-full text-white hover:text-emerald-400 transition-colors"
                      >
                        {isCurrent && isPlaying ? (
                          <Pause className="w-3.5 h-3.5 fill-current" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                        )}
                      </button>
                    </td>

                    {/* Title & Artist */}
                    <td className="py-2.5 pr-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 border border-white/5 shadow">
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
                            className={`font-medium truncate ${
                              isCurrent ? 'text-emerald-400' : 'text-white'
                            }`}
                          >
                            {track.title}
                          </span>
                          <span className="text-[11px] text-gray-400 truncate">
                            {track.artist}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Album */}
                    <td className="py-2.5 pr-4 hidden md:table-cell text-gray-400 truncate max-w-xs">
                      {track.album}
                    </td>

                    {/* Duration & Like */}
                    <td className="py-2.5 pr-4 text-right font-mono text-gray-400">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLike(track.id);
                          }}
                          className={`p-1 opacity-0 group-hover:opacity-100 transition-opacity ${
                            isLiked ? '!opacity-100 text-rose-500' : 'text-gray-400 hover:text-white'
                          }`}
                        >
                          <Heart className={`w-3.5 h-3.5 ${isLiked ? 'fill-rose-500' : ''}`} />
                        </button>
                        <span>{track.duration_str}</span>
                      </div>
                    </td>

                    {/* Context / More Menu */}
                    <td className="py-2.5 pr-3 text-center relative w-12">
                      <div className="relative inline-block">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveMenuTrackId(isMenuOpen ? null : track.id);
                          }}
                          className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>

                        {isMenuOpen && (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className="absolute right-0 top-6 w-48 py-1.5 rounded-xl glass-panel-elevated bg-[#181920] border border-white/10 text-xs shadow-2xl z-30"
                          >
                            <button
                              onClick={() => {
                                addToQueue(track);
                                setActiveMenuTrackId(null);
                              }}
                              className="w-full px-3 py-1.5 text-left text-gray-300 hover:text-white hover:bg-white/10 flex items-center gap-2.5"
                            >
                              <Plus className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Add to Queue</span>
                            </button>

                            {playlists.length > 0 && (
                              <div className="border-t border-white/5 my-1 pt-1">
                                <div className="px-3 py-1 text-[10px] text-gray-400 uppercase font-semibold">
                                  Add to Playlist
                                </div>
                                {playlists.map((pl) => (
                                  <button
                                    key={pl.id}
                                    onClick={() => {
                                      addTrackToPlaylist(pl.id, track.id);
                                      setActiveMenuTrackId(null);
                                    }}
                                    className="w-full px-4 py-1 text-left text-gray-300 hover:text-white hover:bg-white/10 truncate"
                                  >
                                    + {pl.name}
                                  </button>
                                ))}
                              </div>
                            )}

                            <div className="border-t border-white/5 my-1 pt-1">
                              <button
                                onClick={() => {
                                  openInExplorer(track.file_path);
                                  setActiveMenuTrackId(null);
                                }}
                                className="w-full px-3 py-1.5 text-left text-gray-300 hover:text-white hover:bg-white/10 flex items-center gap-2.5"
                              >
                                <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
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
