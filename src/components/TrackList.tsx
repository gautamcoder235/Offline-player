import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Play,
  Pause,
  Heart,
  MoreHorizontal,
  Clock,
  Plus,
  FolderOpen,
  Disc3,
  Check,
  ListPlus,
  ListMusic,
  Flame,
  Trash2,
} from 'lucide-react';
import { Track } from '../types';
import { usePlayer } from '../context/PlayerContext';
import { getTrackColor } from '../utils/helpers';
import { DeleteTrackModal } from './DeleteTrackModal';

interface TrackListProps {
  tracks: Track[];
  title?: string;
  subtitle?: string;
  coverArt?: string | null;
  playlistId?: string;
}

export const TrackList: React.FC<TrackListProps> = ({
  tracks,
  title,
  subtitle,
  coverArt,
  playlistId,
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
    getPlayCount,
    deleteTrack,
  } = usePlayer();

  const [activeMenuTrackId, setActiveMenuTrackId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    track: Track;
  } | null>(null);
  const [trackToDelete, setTrackToDelete] = useState<Track | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const [actionFeedback, setActionFeedback] = useState<{
    trackId: string;
    action: 'queue' | 'playlist' | 'explorer';
    id?: string;
  } | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenuTrackId(null);
        setActionFeedback(null);
        if (feedbackTimerRef.current) {
          clearTimeout(feedbackTimerRef.current);
          feedbackTimerRef.current = null;
        }
      }
    };
    if (activeMenuTrackId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [activeMenuTrackId]);

  // Context menu dismissal handler (click outside, scroll, Escape)
  useEffect(() => {
    if (!contextMenu) return;

    const handleDismiss = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
      }
    };

    const handleKeyOrScroll = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key === 'Escape') {
        setContextMenu(null);
      } else if (event.type === 'scroll') {
        setContextMenu(null);
      }
    };

    document.addEventListener('mousedown', handleDismiss);
    document.addEventListener('scroll', handleKeyOrScroll, true);
    window.addEventListener('keydown', handleKeyOrScroll);

    return () => {
      document.removeEventListener('mousedown', handleDismiss);
      document.removeEventListener('scroll', handleKeyOrScroll, true);
      window.removeEventListener('keydown', handleKeyOrScroll);
    };
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent, track: Track) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveMenuTrackId(null);

    // Approximate context menu dimensions to prevent overflow off-screen
    const menuWidth = 230;
    const menuHeight = 310;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 12);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 12);

    setContextMenu({
      x: Math.max(12, x),
      y: Math.max(12, y),
      track,
    });
  };

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  const triggerAddToQueue = (track: Track) => {
    addToQueue(track);
    setActionFeedback({ trackId: track.id, action: 'queue' });
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => {
      setActionFeedback(null);
      setActiveMenuTrackId(null);
      feedbackTimerRef.current = null;
    }, 450);
  };

  const triggerAddToPlaylist = (playlistId: string, track: Track) => {
    addTrackToPlaylist(playlistId, track.id);
    setActionFeedback({ trackId: track.id, action: 'playlist', id: playlistId });
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => {
      setActionFeedback(null);
      setActiveMenuTrackId(null);
      feedbackTimerRef.current = null;
    }, 450);
  };

  const triggerOpenInExplorer = (track: Track) => {
    openInExplorer(track.file_path);
    setActionFeedback({ trackId: track.id, action: 'explorer' });
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => {
      setActionFeedback(null);
      setActiveMenuTrackId(null);
      feedbackTimerRef.current = null;
    }, 450);
  };

  const handleRowClick = (track: Track) => {
    if (currentTrack?.id === track.id) {
      togglePlay();
    } else {
      playTrack(track, tracks, playlistId);
    }
  };

  // Find up to 4 distinct album artworks from the track list for automatic collage
  const tracksWithCovers = useMemo(() => {
    const list: string[] = [];
    const seen = new Set<string>();
    for (const t of tracks) {
      if (t.cover_art && !seen.has(t.cover_art)) {
        seen.add(t.cover_art);
        list.push(t.cover_art);
        if (list.length >= 4) break;
      }
    }
    return list;
  }, [tracks]);

  const isCollage = !coverArt && tracksWithCovers.length >= 4;
  const heroCover = coverArt || tracksWithCovers[0] || currentTrack?.cover_art || null;

  return (
    <div className="flex-1 overflow-y-auto pb-12 select-none">
      {/* Clean Hero Header with Dynamic Album Art / Collage */}
      {title && (
        <div className="p-6 md:p-8 flex items-end gap-6 bg-gradient-to-b from-[#181722]/70 via-[#100F14]/40 to-transparent shrink-0">
          <div className="w-32 h-32 md:w-36 md:h-36 rounded-2xl overflow-hidden shadow-2xl border border-[#292731]/60 shrink-0 bg-[#16151C] flex items-center justify-center">
            {isCollage ? (
              <div className="w-full h-full grid grid-cols-2 grid-rows-2">
                {tracksWithCovers.slice(0, 4).map((art, i) => (
                  <img key={i} src={art} alt="" className="w-full h-full object-cover" />
                ))}
              </div>
            ) : heroCover ? (
              <img src={heroCover} alt={title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1A1924] to-[#121118]">
                <Disc3 className="w-14 h-14 text-[#E8C77A]/50" />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1.5 min-w-0 flex-1 pb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#AAA6B2]">
              {title === 'Liked Songs' ? 'Playlist' : 'Collection'}
            </span>
            <h1 className="text-2xl md:text-3xl font-extrabold text-[#F4F2F7] tracking-tight truncate">
              {title}
            </h1>
            <p className="text-xs text-[#777381]">
              {subtitle || `${tracks.length} tracks found on this computer`}
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
          <div className="w-full text-xs">
            {/* Header Row */}
            <div className="grid grid-cols-[40px_minmax(0,1fr)_80px_40px] md:grid-cols-[40px_minmax(0,2.5fr)_minmax(0,1.5fr)_80px_40px] items-center px-3 pb-2.5 border-b border-[#292731]/40 text-[#65616F] uppercase tracking-wider font-semibold text-[10px]">
              <div className="text-center">#</div>
              <div className="pl-1">Title</div>
              <div className="hidden md:block">Album</div>
              <div className="text-right pr-2">
                <Clock className="w-3 h-3 inline-block text-[#65616F]" />
              </div>
              <div className="text-center"></div>
            </div>

            {/* Contiguous Track Rows */}
            <div className="pt-1.5 space-y-1">
              {tracks.map((track, idx) => {
                const isCurrent = currentTrack?.id === track.id;
                const isLiked = likedTrackIds.has(track.id);
                const isMenuOpen = activeMenuTrackId === track.id;
                const trackColor = getTrackColor(track.title, track.artist);

                return (
                  <div
                    key={track.id}
                    onClick={() => handleRowClick(track)}
                    onDoubleClick={() => playTrack(track, tracks, playlistId)}
                    onContextMenu={(e) => handleContextMenu(e, track)}
                    className={`group grid grid-cols-[40px_minmax(0,1fr)_80px_40px] md:grid-cols-[40px_minmax(0,2.5fr)_minmax(0,1.5fr)_80px_40px] items-center px-3 py-2 rounded-xl transition-colors duration-150 cursor-pointer ${
                      isCurrent
                        ? 'bg-[#19181F] border border-[#19E6A0]/50 shadow-[0_0_14px_rgba(25,230,160,0.06)] text-[#F4F2F7]'
                        : 'border border-transparent hover:bg-[#1D1C23] hover:border-[#292731]/50 text-[#9A96A5]'
                    }`}
                  >
                    {/* Index / Play Button */}
                    <div className="text-center relative">
                      <span
                        className={`inline-block font-mono text-[11px] group-hover:hidden ${
                          isCurrent ? 'text-[#19E6A0] font-bold' : 'text-[#65616F]'
                        }`}
                      >
                        {isCurrent ? (
                          <div
                            className="flex items-end justify-center gap-[2.5px] w-3.5 h-3.5 mx-auto py-0.5"
                            aria-label={isPlaying ? 'Playing' : 'Paused'}
                          >
                            <span
                              className="w-[2.5px] h-full bg-[#19E6A0] rounded-full origin-bottom animate-eq-bar-1"
                              style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
                            />
                            <span
                              className="w-[2.5px] h-full bg-[#19E6A0] rounded-full origin-bottom animate-eq-bar-2"
                              style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
                            />
                            <span
                              className="w-[2.5px] h-full bg-[#19E6A0] rounded-full origin-bottom animate-eq-bar-3"
                              style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
                            />
                          </div>
                        ) : (
                          idx + 1
                        )}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRowClick(track);
                        }}
                        className="hidden group-hover:inline-flex items-center justify-center w-6 h-6 rounded-full text-[#F4F2F7] hover:text-[#19E6A0] transition-all duration-200 hover:scale-110 active:scale-90 cursor-pointer"
                        aria-label={isCurrent && isPlaying ? 'Pause' : 'Play'}
                      >
                        {isCurrent && isPlaying ? (
                          <Pause className="w-3 h-3 fill-current" />
                        ) : (
                          <Play className="w-3 h-3 fill-current ml-0.5" />
                        )}
                      </button>
                    </div>

                    {/* Title & Artist */}
                    <div className="flex items-center gap-3 min-w-0 pr-3">
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
                          className={`font-medium truncate text-xs transition-colors duration-200 ${
                            isCurrent ? 'text-[#19E6A0]' : 'text-[#F4F2F7] group-hover:text-[#19E6A0]'
                          }`}
                        >
                          {track.title}
                        </span>
                        <span className="text-[11px] text-[#777381] truncate">
                          {track.artist}
                        </span>
                      </div>
                    </div>

                    {/* Album */}
                    <div className="hidden md:block text-[#777381] truncate text-[11px] pr-3">
                      {track.album}
                    </div>

                    {/* Duration & Like */}
                    <div className="flex items-center justify-end gap-2.5 font-mono text-[11px] text-[#777381] pr-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLike(track.id);
                        }}
                        className={`p-1 transition-all duration-200 hover:scale-110 active:scale-90 cursor-pointer ${
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
                      {(() => {
                        const count = track.playCount ?? getPlayCount(track.id);
                        if (!count || count <= 0) return null;
                        return (
                          <span
                            className="hidden sm:inline-flex items-center gap-1 text-[10px] text-[#E8C77A] font-semibold bg-[#E8C77A]/10 px-1.5 py-0.5 rounded-md"
                            title={`${count} listens`}
                          >
                            <Flame className="w-2.5 h-2.5 text-[#E8C77A]" />
                            <span>{count}</span>
                          </span>
                        );
                      })()}
                      <span>{track.duration_str}</span>
                    </div>

                    {/* Context / More Menu */}
                    <div className="text-center relative" ref={isMenuOpen ? menuRef : null}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isMenuOpen) {
                            setActiveMenuTrackId(null);
                            setActionFeedback(null);
                          } else {
                            setActiveMenuTrackId(track.id);
                            setActionFeedback(null);
                          }
                        }}
                        className={`p-1.5 rounded-lg transition-all duration-200 active:scale-90 cursor-pointer ${
                          isMenuOpen
                            ? 'opacity-100 text-[#F4F2F7] bg-[#1E1D26]'
                            : 'text-[#65616F] hover:text-[#F4F2F7] hover:bg-[#1D1C23] opacity-0 group-hover:opacity-100'
                        }`}
                        aria-label="More options"
                      >
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </button>

                      {isMenuOpen && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          className={`absolute right-0 ${
                            idx >= tracks.length - 3
                              ? 'bottom-8 animate-menu-enter-bottom'
                              : 'top-7 animate-menu-enter'
                          } w-52 p-1.5 rounded-xl bg-[#14131A]/95 backdrop-blur-2xl border border-[#2B2936] text-xs shadow-[0_16px_36px_rgba(0,0,0,0.7)] z-50`}
                        >
                          {/* Add to Queue */}
                          <button
                            onClick={() => triggerAddToQueue(track)}
                            className="w-full px-2.5 py-1.5 rounded-lg text-left text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#1E1D26] active:scale-[0.98] transition-all duration-200 flex items-center justify-between cursor-pointer group/item"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {actionFeedback?.trackId === track.id && actionFeedback.action === 'queue' ? (
                                <Check className="w-3.5 h-3.5 text-[#19E6A0] animate-in fade-in zoom-in-95 duration-200 shrink-0" />
                              ) : (
                                <ListPlus className="w-3.5 h-3.5 text-[#19E6A0] shrink-0 transition-transform duration-200 group-hover/item:scale-110" />
                              )}
                              <span
                                className={`truncate transition-colors duration-200 ${
                                  actionFeedback?.trackId === track.id && actionFeedback.action === 'queue'
                                    ? 'text-[#19E6A0] font-medium'
                                    : ''
                                }`}
                              >
                                {actionFeedback?.trackId === track.id && actionFeedback.action === 'queue'
                                  ? 'Added to Queue'
                                  : 'Add to Queue'}
                              </span>
                            </div>
                          </button>

                          {/* Add to Playlist section */}
                          {playlists.length > 0 && (
                            <div className="border-t border-[#25232F] my-1 pt-1">
                              <div className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] text-[#65616F] uppercase font-semibold tracking-wider">
                                <ListMusic className="w-3 h-3 text-[#65616F]" />
                                <span>Add to Playlist</span>
                              </div>
                              <div className="space-y-0.5 max-h-40 overflow-y-auto">
                                {playlists.map((pl) => {
                                  const isPlSaved =
                                    actionFeedback?.trackId === track.id &&
                                    actionFeedback.action === 'playlist' &&
                                    actionFeedback.id === pl.id;

                                  return (
                                    <button
                                      key={pl.id}
                                      onClick={() => triggerAddToPlaylist(pl.id, track)}
                                      className="w-full px-2.5 py-1.5 rounded-lg text-left text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#1E1D26] active:scale-[0.98] transition-all duration-200 flex items-center justify-between gap-2 cursor-pointer group/pl text-xs"
                                    >
                                      <span
                                        className={`truncate flex-1 transition-colors duration-200 ${
                                          isPlSaved ? 'text-[#19E6A0] font-medium' : ''
                                        }`}
                                      >
                                        {isPlSaved ? `Added to ${pl.name}` : pl.name}
                                      </span>
                                      {isPlSaved ? (
                                        <Check className="w-3 h-3 text-[#19E6A0] animate-in fade-in zoom-in-95 duration-200 shrink-0" />
                                      ) : (
                                        <Plus className="w-3 h-3 text-[#65616F] group-hover/pl:text-[#19E6A0] shrink-0 transition-transform duration-200 group-hover/pl:scale-110" />
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Reveal in Explorer */}
                          <div className="border-t border-[#25232F] my-1 pt-1">
                            <button
                              onClick={() => triggerOpenInExplorer(track)}
                              className="w-full px-2.5 py-1.5 rounded-lg text-left text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#1E1D26] active:scale-[0.98] transition-all duration-200 flex items-center justify-between cursor-pointer group/item"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                {actionFeedback?.trackId === track.id && actionFeedback.action === 'explorer' ? (
                                  <Check className="w-3.5 h-3.5 text-[#E8C77A] animate-in fade-in zoom-in-95 duration-200 shrink-0" />
                                ) : (
                                  <FolderOpen className="w-3.5 h-3.5 text-[#E8C77A] shrink-0 transition-transform duration-200 group-hover/item:scale-110" />
                                )}
                                <span
                                  className={`truncate transition-colors duration-200 ${
                                    actionFeedback?.trackId === track.id && actionFeedback.action === 'explorer'
                                      ? 'text-[#E8C77A] font-medium'
                                      : ''
                                  }`}
                                >
                                  {actionFeedback?.trackId === track.id && actionFeedback.action === 'explorer'
                                    ? 'Revealed in Folder'
                                    : 'Reveal in Explorer'}
                                </span>
                              </div>
                            </button>
                          </div>

                          {/* Delete Track */}
                          <div className="border-t border-[#25232F] my-1 pt-1">
                            <button
                              onClick={() => {
                                setActiveMenuTrackId(null);
                                setTrackToDelete(track);
                              }}
                              className="w-full px-2.5 py-1.5 rounded-lg text-left text-[#FF667A] hover:bg-[#FF667A]/15 active:scale-[0.98] transition-all duration-200 flex items-center justify-between cursor-pointer group/item"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <Trash2 className="w-3.5 h-3.5 text-[#FF667A] shrink-0 transition-transform duration-200 group-hover/item:scale-110" />
                                <span className="truncate font-medium">Delete Track...</span>
                              </div>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Global Right-Click Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          style={{
            position: 'fixed',
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
          className="w-56 p-1.5 rounded-xl bg-[#14131A]/95 backdrop-blur-2xl border border-[#2B2936] text-xs shadow-[0_20px_40px_rgba(0,0,0,0.85)] z-50 animate-menu-enter select-none"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Track Summary Header */}
          <div className="px-2.5 py-1.5 border-b border-[#25232F] mb-1">
            <p className="font-semibold text-[#F4F2F7] truncate text-xs">{contextMenu.track.title}</p>
            <p className="text-[10px] text-[#777381] truncate">{contextMenu.track.artist}</p>
          </div>

          {/* Play / Pause */}
          <button
            onClick={() => {
              if (currentTrack?.id === contextMenu.track.id) {
                togglePlay();
              } else {
                playTrack(contextMenu.track, tracks, playlistId);
              }
              setContextMenu(null);
            }}
            className="w-full px-2.5 py-1.5 rounded-lg text-left text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#1E1D26] active:scale-[0.98] transition-all duration-200 flex items-center justify-between cursor-pointer group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {currentTrack?.id === contextMenu.track.id && isPlaying ? (
                <Pause className="w-3.5 h-3.5 text-[#19E6A0] shrink-0" />
              ) : (
                <Play className="w-3.5 h-3.5 text-[#19E6A0] shrink-0 fill-[#19E6A0]" />
              )}
              <span className="truncate">
                {currentTrack?.id === contextMenu.track.id && isPlaying ? 'Pause' : 'Play Now'}
              </span>
            </div>
          </button>

          {/* Add to Queue */}
          <button
            onClick={() => {
              addToQueue(contextMenu.track);
              setContextMenu(null);
            }}
            className="w-full px-2.5 py-1.5 rounded-lg text-left text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#1E1D26] active:scale-[0.98] transition-all duration-200 flex items-center justify-between cursor-pointer group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <ListPlus className="w-3.5 h-3.5 text-[#19E6A0] shrink-0 transition-transform duration-200 group-hover:scale-110" />
              <span className="truncate">Add to Queue</span>
            </div>
          </button>

          {/* Save to Liked */}
          <button
            onClick={() => {
              toggleLike(contextMenu.track.id);
              setContextMenu(null);
            }}
            className="w-full px-2.5 py-1.5 rounded-lg text-left text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#1E1D26] active:scale-[0.98] transition-all duration-200 flex items-center justify-between cursor-pointer group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Heart
                className={`w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110 ${
                  likedTrackIds.has(contextMenu.track.id)
                    ? 'fill-[#E8C77A] text-[#E8C77A]'
                    : 'text-[#E8C77A]'
                }`}
              />
              <span className="truncate">
                {likedTrackIds.has(contextMenu.track.id) ? 'Remove from Liked' : 'Save to Liked Songs'}
              </span>
            </div>
          </button>

          {/* Add to Playlist */}
          {playlists.length > 0 && (
            <div className="border-t border-[#25232F] my-1 pt-1">
              <div className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] text-[#65616F] uppercase font-semibold tracking-wider">
                <ListMusic className="w-3 h-3 text-[#65616F]" />
                <span>Add to Playlist</span>
              </div>
              <div className="space-y-0.5 max-h-32 overflow-y-auto">
                {playlists.map((pl) => (
                  <button
                    key={pl.id}
                    onClick={() => {
                      addTrackToPlaylist(pl.id, contextMenu.track.id);
                      setContextMenu(null);
                    }}
                    className="w-full px-2.5 py-1 rounded-lg text-left text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#1E1D26] active:scale-[0.98] transition-all duration-200 flex items-center justify-between gap-2 cursor-pointer group text-xs"
                  >
                    <span className="truncate flex-1">{pl.name}</span>
                    <Plus className="w-3 h-3 text-[#65616F] group-hover:text-[#19E6A0] shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Reveal in Explorer */}
          <div className="border-t border-[#25232F] my-1 pt-1">
            <button
              onClick={() => {
                openInExplorer(contextMenu.track.file_path);
                setContextMenu(null);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg text-left text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#1E1D26] active:scale-[0.98] transition-all duration-200 flex items-center justify-between cursor-pointer group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <FolderOpen className="w-3.5 h-3.5 text-[#E8C77A] shrink-0 transition-transform duration-200 group-hover:scale-110" />
                <span className="truncate">Reveal in File Explorer</span>
              </div>
            </button>
          </div>

          {/* Delete Track */}
          <div className="border-t border-[#25232F] my-1 pt-1">
            <button
              onClick={() => {
                const track = contextMenu.track;
                setContextMenu(null);
                setTrackToDelete(track);
              }}
              className="w-full px-2.5 py-1.5 rounded-lg text-left text-[#FF667A] hover:bg-[#FF667A]/15 active:scale-[0.98] transition-all duration-200 flex items-center justify-between cursor-pointer group"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Trash2 className="w-3.5 h-3.5 text-[#FF667A] shrink-0 transition-transform duration-200 group-hover:scale-110" />
                <span className="truncate font-medium">Delete Track...</span>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Delete Track Confirmation Modal */}
      <DeleteTrackModal
        track={trackToDelete}
        isOpen={!!trackToDelete}
        onClose={() => setTrackToDelete(null)}
        onConfirm={async (track, deleteFromDisk) => {
          await deleteTrack(track, deleteFromDisk);
          setTrackToDelete(null);
        }}
      />
    </div>
  );
};
