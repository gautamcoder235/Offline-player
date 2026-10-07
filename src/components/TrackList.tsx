import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
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
  X,
  ChevronUp,
  Minus,
} from 'lucide-react';
import { Track } from '../types';
import { usePlayer } from '../context/PlayerContext';
import { getTrackColor } from '../utils/helpers';
import { renderHighlightedSnippet, getMatchingLyricSnippet, isCjkText } from '../utils/lyricsSearch';
import { DeleteTrackModal } from './DeleteTrackModal';

interface TrackListProps {
  tracks: Track[];
  title?: string;
  subtitle?: string;
  coverArt?: string | null;
  playlistId?: string;
}

const PRESET_COLORS = [
  '#19E6A0', // Emerald Mint
  '#00F2FE', // Electric Cyan
  '#FF007F', // Neon Magenta
  '#9D4EDD', // Electric Purple
  '#E8C77A', // Champagne Gold
  '#FF7A00', // Sunset Coral
];

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
    addTracksToQueue,
    playlists,
    addTrackToPlaylist,
    addTracksToPlaylist,
    createPlaylist,
    openInExplorer,
    getPlayCount,
    deleteTrack,
    searchQuery,
    themeAppearance,
    removeTrackFromPlaylist,
    removeTracksFromPlaylist,
  } = usePlayer();

  const isGlass = themeAppearance === 'aura_glass';
  const isCustomPlaylist = Boolean(playlistId && playlistId !== 'all' && playlistId !== 'liked');

  // Multi-selection state
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const [anchorTrackId, setAnchorTrackId] = useState<string | null>(null);

  // UI state for menus & modals
  const [activeMenuTrackId, setActiveMenuTrackId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    track: Track;
    isBatch?: boolean;
  } | null>(null);
  const [trackToDelete, setTrackToDelete] = useState<Track | null>(null);
  const [isPlaylistDropdownOpen, setIsPlaylistDropdownOpen] = useState(false);
  const [isNewPlaylistModalOpen, setIsNewPlaylistModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');
  const [newPlaylistColor, setNewPlaylistColor] = useState(PRESET_COLORS[0]);

  const [actionFeedback, setActionFeedback] = useState<{
    trackId: string;
    action: 'queue' | 'playlist' | 'explorer';
    id?: string;
  } | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const contextMenuRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const playlistDropdownRef = useRef<HTMLDivElement>(null);

  // Clear selections when switching playlists or collections
  useEffect(() => {
    setSelectedTrackIds(new Set());
    setAnchorTrackId(null);
    setIsPlaylistDropdownOpen(false);
  }, [playlistId, title]);

  // Clean up selected track IDs if songs are filtered out
  useEffect(() => {
    setSelectedTrackIds((prev) => {
      if (prev.size === 0) return prev;
      const currentValidIds = new Set(tracks.map((t) => t.id));
      const next = new Set<string>();
      for (const id of prev) {
        if (currentValidIds.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
    setAnchorTrackId((prev) => (prev && tracks.some((t) => t.id === prev) ? prev : null));
  }, [tracks]);

  // Selected tracks ordered as they appear in the current track list view
  const selectedTracksInOrder = useMemo(() => {
    return tracks.filter((t) => selectedTrackIds.has(t.id));
  }, [tracks, selectedTrackIds]);

  const allSelected = tracks.length > 0 && selectedTrackIds.size === tracks.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedTrackIds(new Set());
      setAnchorTrackId(null);
    } else {
      setSelectedTrackIds(new Set(tracks.map((t) => t.id)));
      if (tracks.length > 0) {
        setAnchorTrackId(tracks[0].id);
      }
    }
  };

  const toggleTrackSelection = (trackId: string) => {
    setSelectedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return next;
    });
    setAnchorTrackId(trackId);
  };

  // Keyboard shortcuts: Escape to clear selection, Ctrl+A to select all
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape precedence: modal -> dropdown -> contextMenu -> 3dotsMenu -> track selection
      if (e.key === 'Escape') {
        if (isNewPlaylistModalOpen) {
          e.preventDefault();
          setIsNewPlaylistModalOpen(false);
          return;
        }
        if (isPlaylistDropdownOpen) {
          e.preventDefault();
          setIsPlaylistDropdownOpen(false);
          return;
        }
        if (contextMenu) {
          e.preventDefault();
          setContextMenu(null);
          return;
        }
        if (activeMenuTrackId) {
          e.preventDefault();
          setActiveMenuTrackId(null);
          return;
        }
      }

      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === 'Escape') {
        if (selectedTrackIds.size > 0) {
          e.preventDefault();
          setSelectedTrackIds(new Set());
          setAnchorTrackId(null);
        }
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.code === 'KeyA' || e.key.toLowerCase() === 'a')
      ) {
        if (tracks.length > 0) {
          e.preventDefault();
          setSelectedTrackIds(new Set(tracks.map((t) => t.id)));
          setAnchorTrackId(tracks[0].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isNewPlaylistModalOpen,
    isPlaylistDropdownOpen,
    contextMenu,
    activeMenuTrackId,
    selectedTrackIds.size,
    tracks,
  ]);

  // Click outside listener for single track 3-dots menu
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

  // Dismiss context menu on click outside, scroll, Escape
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
        // Do NOT close context menu if scrolling within the context menu's own playlists list
        if (contextMenuRef.current && contextMenuRef.current.contains(event.target as Node)) {
          return;
        }
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

  // Dismiss floating action bar playlist dropdown on outside click
  useEffect(() => {
    if (!isPlaylistDropdownOpen) return;

    const handleDismissDropdown = (event: MouseEvent) => {
      if (
        playlistDropdownRef.current &&
        !playlistDropdownRef.current.contains(event.target as Node)
      ) {
        setIsPlaylistDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleDismissDropdown);
    return () => {
      document.removeEventListener('mousedown', handleDismissDropdown);
    };
  }, [isPlaylistDropdownOpen]);

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  // Row Click: Shift+Click range, Ctrl+Click toggle, plain click select
  const handleRowClick = (e: React.MouseEvent, track: Track, index: number) => {
    if (e.shiftKey) {
      // Prevent browser text selection when shift-clicking rows
      e.preventDefault();
      window.getSelection()?.removeAllRanges();

      // Range selection from anchor
      let anchorIdx = -1;
      if (anchorTrackId) {
        anchorIdx = tracks.findIndex((t) => t.id === anchorTrackId);
      }
      if (anchorIdx === -1) {
        anchorIdx = index;
        setAnchorTrackId(track.id);
      }

      const start = Math.min(anchorIdx, index);
      const end = Math.max(anchorIdx, index);
      const rangeIds = tracks.slice(start, end + 1).map((t) => t.id);

      if (e.ctrlKey || e.metaKey) {
        // Ctrl+Shift+Click: Union range with existing selection
        const next = new Set(selectedTrackIds);
        rangeIds.forEach((id) => next.add(id));
        setSelectedTrackIds(next);
      } else {
        // Plain Shift+Click: Replace selection with range from anchor to clicked row
        setSelectedTrackIds(new Set(rangeIds));
      }
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl+Click / Cmd+Click: Toggle individual selection
      toggleTrackSelection(track.id);
    } else {
      // Plain Click (no Shift or Ctrl): Plays the track immediately (restoring original behavior),
      // clears any active multi-selection, and updates the selection anchor.
      if (selectedTrackIds.size > 0) {
        setSelectedTrackIds(new Set());
      }
      setAnchorTrackId(track.id);

      if (currentTrack?.id === track.id) {
        togglePlay();
      } else {
        playTrack(track, tracks, playlistId);
      }
    }
  };

  // Right-click context menu handler
  const handleContextMenu = (e: React.MouseEvent, track: Track) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveMenuTrackId(null);
    setIsPlaylistDropdownOpen(false);

    const isCurrentSelection = selectedTrackIds.has(track.id);
    const isBatchMode = isCurrentSelection && selectedTrackIds.size > 1;

    if (!isCurrentSelection) {
      // If right clicking on an unselected row, clear any active batch selection and target only this track
      if (selectedTrackIds.size > 0) {
        setSelectedTrackIds(new Set());
      }
      setAnchorTrackId(track.id);
    }

    const menuWidth = 240;
    const menuHeight = isBatchMode ? 340 : 330;
    const x = Math.min(e.clientX, window.innerWidth - menuWidth - 12);
    const y = Math.min(e.clientY, window.innerHeight - menuHeight - 12);

    setContextMenu({
      x: Math.max(12, x),
      y: Math.max(12, y),
      track,
      isBatch: isBatchMode,
    });
  };

  // Batch actions
  const handleBatchAddToQueue = () => {
    if (selectedTracksInOrder.length > 0) {
      addTracksToQueue(selectedTracksInOrder);
    }
    setContextMenu(null);
    setIsPlaylistDropdownOpen(false);
  };

  const handleBatchAddToPlaylist = (targetPlaylistId: string) => {
    if (selectedTracksInOrder.length > 0) {
      const ids = selectedTracksInOrder.map((t) => t.id);
      addTracksToPlaylist(targetPlaylistId, ids);
    }
    setContextMenu(null);
    setIsPlaylistDropdownOpen(false);
  };

  const handleBatchPlay = () => {
    if (selectedTracksInOrder.length > 0) {
      playTrack(selectedTracksInOrder[0], selectedTracksInOrder, playlistId);
    }
    setContextMenu(null);
  };

  const handleBatchToggleLike = () => {
    for (const t of selectedTracksInOrder) {
      if (!likedTrackIds.has(t.id)) {
        toggleLike(t.id);
      }
    }
    setContextMenu(null);
  };

  const handleCreatePlaylistSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    const ids = selectedTracksInOrder.map((t) => t.id);
    createPlaylist(
      newPlaylistName.trim(),
      newPlaylistDesc.trim() || undefined,
      ids,
      newPlaylistColor
    );

    setNewPlaylistName('');
    setNewPlaylistDesc('');
    setIsNewPlaylistModalOpen(false);
    setSelectedTrackIds(new Set());
    setAnchorTrackId(null);
  };

  // Single track actions
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

  const triggerAddToPlaylist = (plId: string, track: Track) => {
    addTrackToPlaylist(plId, track.id);
    setActionFeedback({ trackId: track.id, action: 'playlist', id: plId });
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

  // Dynamic Album Art / Collage
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
    <div className="flex-1 flex flex-col min-h-0 relative select-none">
      {/* Scrollable Track Content */}
      <div
        className="flex-1 overflow-y-auto pb-24 select-none"
        onClick={(e) => {
          // Deselect when clicking empty space (not on rows or buttons)
          const target = e.target as HTMLElement;
          if (target.closest('[data-track-row], button, input, textarea, a, [role="button"]')) {
            return;
          }
          if (selectedTrackIds.size > 0) {
            setSelectedTrackIds(new Set());
            setAnchorTrackId(null);
          }
        }}
      >
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
                {/* Index / Select All Checkbox Header */}
                <div className="text-center flex items-center justify-center">
                  {selectedTrackIds.size > 0 ? (
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="w-4 h-4 rounded-md bg-[#19E6A0] text-black flex items-center justify-center mx-auto shadow-sm transition-transform active:scale-90 cursor-pointer"
                      title={allSelected ? 'Deselect all (Esc)' : 'Select all (Ctrl+A)'}
                      aria-label="Toggle select all"
                    >
                      {allSelected ? (
                        <Check className="w-3 h-3 stroke-[3]" />
                      ) : (
                        <Minus className="w-3 h-3 stroke-[3]" />
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="group/select-header w-4 h-4 flex items-center justify-center mx-auto cursor-pointer"
                      title="Select all (Ctrl+A)"
                      aria-label="Select all"
                    >
                      <span className="font-mono text-[10px] text-[#65616F] group-hover/select-header:hidden">#</span>
                      <div className="hidden group-hover/select-header:flex w-3.5 h-3.5 rounded border border-[#65616F] hover:border-[#19E6A0] items-center justify-center transition-colors" />
                    </button>
                  )}
                </div>

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
                  const isSelected = selectedTrackIds.has(track.id);
                  const isLiked = likedTrackIds.has(track.id);
                  const isMenuOpen = activeMenuTrackId === track.id;
                  const trackColor = getTrackColor(track.title, track.artist);
                  const matchingSnippet =
                    track.matchingLyricSnippet !== undefined
                      ? track.matchingLyricSnippet
                      : (searchQuery.trim().length >= 3 || isCjkText(searchQuery))
                      ? getMatchingLyricSnippet(track.id, track.lyrics, searchQuery)?.snippet ?? null
                      : null;

                  return (
                    <div
                      key={track.id}
                      data-track-row="true"
                      onClick={(e) => handleRowClick(e, track, idx)}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        playTrack(track, tracks, playlistId);
                      }}
                      onContextMenu={(e) => handleContextMenu(e, track)}
                      className={`group grid grid-cols-[40px_minmax(0,1fr)_80px_40px] md:grid-cols-[40px_minmax(0,2.5fr)_minmax(0,1.5fr)_80px_40px] items-center px-3 py-2 rounded-xl transition-all duration-150 cursor-pointer ${
                        isSelected
                          ? isCurrent
                            ? 'bg-[#19E6A0]/20 border border-[#19E6A0] shadow-[0_0_14px_rgba(25,230,160,0.14)] text-[#F4F2F7]'
                            : 'bg-[#19E6A0]/10 border border-[#19E6A0]/45 shadow-[0_0_10px_rgba(25,230,160,0.06)] text-[#F4F2F7]'
                          : isCurrent
                          ? 'bg-[#19181F] border border-[#19E6A0]/50 shadow-[0_0_14px_rgba(25,230,160,0.06)] text-[#F4F2F7]'
                          : 'border border-transparent hover:bg-[#1D1C23] hover:border-[#292731]/50 text-[#9A96A5]'
                      }`}
                    >
                      {/* Index / Play Button / Checkbox */}
                      <div className="text-center relative">
                        {isSelected ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTrackSelection(track.id);
                            }}
                            className="w-4 h-4 rounded-md bg-[#19E6A0] text-black flex items-center justify-center mx-auto shadow-sm cursor-pointer transition-transform duration-150 hover:scale-110 active:scale-90"
                            title="Selected (Click to deselect)"
                            aria-label="Deselect track"
                          >
                            <Check className="w-3 h-3 stroke-[3]" />
                          </button>
                        ) : selectedTrackIds.size > 0 ? (
                          <>
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
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleTrackSelection(track.id);
                              }}
                              className="hidden group-hover:flex w-4 h-4 rounded-md border border-[#65616F] hover:border-[#19E6A0] hover:bg-[#19E6A0]/10 items-center justify-center mx-auto shadow-sm cursor-pointer transition-all duration-150 active:scale-90"
                              title="Select track"
                              aria-label="Select track"
                            />
                          </>
                        ) : (
                          <>
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

                            {/* Hover Play Button */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isCurrent) {
                                  togglePlay();
                                } else {
                                  playTrack(track, tracks, playlistId);
                                }
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
                          </>
                        )}
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
                              isCurrent
                                ? 'text-[#19E6A0]'
                                : isSelected
                                ? 'text-[#F4F2F7] font-semibold'
                                : 'text-[#F4F2F7] group-hover:text-[#19E6A0]'
                            }`}
                          >
                            {track.title}
                          </span>
                          <span className="text-[11px] text-[#777381] truncate">
                            {track.artist}
                          </span>
                          {matchingSnippet && (
                            <div
                              className="flex items-center gap-1.5 mt-1 text-[10px] min-w-0 max-w-full"
                              title={`Lyrics match: "${matchingSnippet}"`}
                            >
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#19E6A0]/10 border border-[#19E6A0]/25 text-[#19E6A0] text-[10px] font-medium shrink-0 shadow-sm">
                                💬 Lyrics match:
                              </span>
                              <span className="truncate min-w-0 italic text-[#B5B1BF] text-[10.5px]">
                                "{renderHighlightedSnippet(matchingSnippet, searchQuery)}"
                              </span>
                            </div>
                          )}
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

                      {/* Context / More Menu Button */}
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

                        {/* 3-Dots Dropdown Menu */}
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
      </div>

      {/* Floating Batch Action Bar */}
      {selectedTrackIds.size > 0 && (
        <div
          className={`absolute bottom-5 left-1/2 -translate-x-1/2 z-40 max-w-[95%] sm:max-w-max flex items-center gap-2 px-3 py-2 rounded-2xl ${
            isGlass
              ? 'bg-[#14131A]/80 backdrop-blur-2xl border border-white/[0.12] shadow-[0_20px_50px_rgba(0,0,0,0.85)]'
              : 'bg-[#14131A]/95 backdrop-blur-2xl border border-[#2F2D3D] shadow-[0_16px_40px_rgba(0,0,0,0.7)]'
          } animate-in fade-in slide-in-from-bottom-3 duration-200 select-none`}
        >
          {/* Selected Count Badge */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#19E6A0]/15 text-[#19E6A0] text-xs font-semibold border border-[#19E6A0]/30 shrink-0">
            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>
              {selectedTracksInOrder.length}{' '}
              {selectedTracksInOrder.length === 1 ? 'song' : 'songs'} selected
            </span>
          </div>

          <div className="w-[1px] h-5 bg-[#2F2D3D] mx-0.5" />

          {/* Add to Playlist Popup Dropdown */}
          <div className="relative" ref={playlistDropdownRef}>
            <button
              type="button"
              onClick={() => setIsPlaylistDropdownOpen((prev) => !prev)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1E1D27] hover:bg-[#282635] text-[#F4F2F7] hover:text-[#19E6A0] text-xs font-medium border border-[#2F2D3D] transition-all duration-150 cursor-pointer active:scale-95 shrink-0"
              title="Add selected songs to playlist"
            >
              <ListPlus className="w-3.5 h-3.5 text-[#19E6A0]" />
              <span>Add to Playlist</span>
              <ChevronUp
                className={`w-3 h-3 text-[#777381] transition-transform duration-200 ${
                  isPlaylistDropdownOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {isPlaylistDropdownOpen && (
              <div
                className={`absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-64 p-1.5 rounded-2xl ${
                  isGlass
                    ? 'bg-[#14131A]/85 backdrop-blur-2xl border border-white/[0.12] shadow-[0_25px_50px_rgba(0,0,0,0.9)]'
                    : 'bg-[#14131A]/98 backdrop-blur-2xl border border-[#2F2D3D] shadow-[0_20px_45px_rgba(0,0,0,0.85)]'
                } z-50 animate-in fade-in slide-in-from-bottom-2 duration-150`}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Create New Playlist Option */}
                <button
                  type="button"
                  onClick={() => {
                    setIsPlaylistDropdownOpen(false);
                    setIsNewPlaylistModalOpen(true);
                  }}
                  className="w-full px-2.5 py-2 rounded-xl text-left text-[#19E6A0] hover:bg-[#19E6A0]/10 active:scale-[0.98] transition-all flex items-center gap-2 text-xs font-semibold cursor-pointer group"
                >
                  <div className="w-6 h-6 rounded-lg bg-[#19E6A0]/20 flex items-center justify-center shrink-0">
                    <Plus className="w-3.5 h-3.5 text-[#19E6A0]" />
                  </div>
                  <span className="truncate">New Playlist with selected</span>
                </button>

                {playlists.length > 0 && (
                  <>
                    <div className="border-t border-[#25232F] my-1" />
                    <div className="px-2.5 py-1 text-[10px] text-[#65616F] uppercase font-semibold tracking-wider">
                      Existing Playlists
                    </div>
                    <div className="space-y-0.5 max-h-48 overflow-y-auto">
                      {playlists.map((pl) => (
                        <button
                          key={pl.id}
                          type="button"
                          onClick={() => handleBatchAddToPlaylist(pl.id)}
                          className="w-full px-2.5 py-1.5 rounded-xl text-left text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#1E1D26] active:scale-[0.98] transition-all flex items-center justify-between gap-2 cursor-pointer text-xs group"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className="w-4 h-4 rounded-md shrink-0 flex items-center justify-center text-[9px] font-bold"
                              style={{
                                background: pl.coverColor ? `${pl.coverColor}25` : '#19E6A025',
                                color: pl.coverColor || '#19E6A0',
                              }}
                            >
                              <ListMusic className="w-2.5 h-2.5" />
                            </div>
                            <span className="truncate">{pl.name}</span>
                          </div>
                          <span className="text-[10px] text-[#65616F] font-mono shrink-0">
                            {pl.track_ids.length}
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Add to Queue Button */}
          <button
            type="button"
            onClick={handleBatchAddToQueue}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1E1D27] hover:bg-[#282635] text-[#F4F2F7] hover:text-[#19E6A0] text-xs font-medium border border-[#2F2D3D] transition-all duration-150 cursor-pointer active:scale-95 shrink-0"
            title="Queue all selected tracks"
          >
            <ListMusic className="w-3.5 h-3.5 text-[#19E6A0]" />
            <span>Add to Queue</span>
          </button>

          {/* Play Selection Button */}
          <button
            type="button"
            onClick={handleBatchPlay}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#1E1D27] hover:bg-[#282635] text-[#F4F2F7] hover:text-[#19E6A0] text-xs font-medium border border-[#2F2D3D] transition-all duration-150 cursor-pointer active:scale-95 shrink-0"
            title="Play selected tracks"
          >
            <Play className="w-3 h-3 fill-current text-[#19E6A0]" />
            <span>Play</span>
          </button>

          {/* Remove from Playlist (when in a custom playlist) */}
          {isCustomPlaylist && (
            <button
              type="button"
              onClick={() => {
                removeTracksFromPlaylist(
                  playlistId!,
                  selectedTracksInOrder.map((t) => t.id)
                );
                setSelectedTrackIds(new Set());
                setAnchorTrackId(null);
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#FF667A]/15 hover:bg-[#FF667A]/25 text-[#FF667A] text-xs font-medium border border-[#FF667A]/30 transition-all duration-150 cursor-pointer active:scale-95 shrink-0"
              title="Remove selected tracks from this playlist"
            >
              <Trash2 className="w-3 h-3 text-[#FF667A]" />
              <span>Remove</span>
            </button>
          )}

          {/* Clear Selection Button */}
          <button
            type="button"
            onClick={() => {
              setSelectedTrackIds(new Set());
              setAnchorTrackId(null);
            }}
            className="p-1.5 rounded-xl text-[#777381] hover:text-[#F4F2F7] hover:bg-[#1E1D26] transition-colors cursor-pointer active:scale-90 shrink-0 ml-0.5"
            title="Clear selection (Esc)"
            aria-label="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Global Right-Click Context Menu (Single or Batch Mode) */}
      {contextMenu &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={contextMenuRef}
            style={{
              position: 'fixed',
              left: `${contextMenu.x}px`,
              top: `${contextMenu.y}px`,
            }}
            className={`w-56 p-1.5 rounded-xl ${
              isGlass
                ? 'bg-[#14131A]/85 backdrop-blur-2xl border border-white/[0.12] shadow-[0_25px_50px_rgba(0,0,0,0.9)]'
                : 'bg-[#14131A]/95 backdrop-blur-2xl border border-[#2B2936] shadow-[0_20px_40px_rgba(0,0,0,0.85)]'
            } text-xs z-50 animate-menu-enter select-none`}
            onClick={(e) => e.stopPropagation()}
          >
            {contextMenu.isBatch ? (
              /* Batch Context Menu */
              <>
                <div className="px-2.5 py-1.5 border-b border-[#25232F] mb-1">
                  <div className="flex items-center gap-1.5 text-[#19E6A0] font-semibold text-xs">
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>{selectedTracksInOrder.length} songs selected</span>
                  </div>
                </div>

                {/* Play Selection */}
                <button
                  type="button"
                  onClick={handleBatchPlay}
                  className="w-full px-2.5 py-1.5 rounded-lg text-left text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#1E1D26] active:scale-[0.98] transition-all duration-200 flex items-center justify-between cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Play className="w-3.5 h-3.5 text-[#19E6A0] shrink-0 fill-[#19E6A0]" />
                    <span className="truncate">Play Selection</span>
                  </div>
                </button>

                {/* Add Batch to Queue */}
                <button
                  type="button"
                  onClick={handleBatchAddToQueue}
                  className="w-full px-2.5 py-1.5 rounded-lg text-left text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#1E1D26] active:scale-[0.98] transition-all duration-200 flex items-center justify-between cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ListPlus className="w-3.5 h-3.5 text-[#19E6A0] shrink-0 transition-transform duration-200 group-hover:scale-110" />
                    <span className="truncate">Add to Queue</span>
                  </div>
                </button>

                {/* Save Batch to Liked */}
                <button
                  type="button"
                  onClick={handleBatchToggleLike}
                  className="w-full px-2.5 py-1.5 rounded-lg text-left text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#1E1D26] active:scale-[0.98] transition-all duration-200 flex items-center justify-between cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Heart className="w-3.5 h-3.5 text-[#E8C77A] shrink-0 fill-[#E8C77A]/30 transition-transform duration-200 group-hover:scale-110" />
                    <span className="truncate">Save to Liked Songs</span>
                  </div>
                </button>

                {/* Batch Add to Playlist Section */}
                <div className="border-t border-[#25232F] my-1 pt-1">
                  <div className="flex items-center justify-between px-2.5 py-1 text-[10px] text-[#65616F] uppercase font-semibold tracking-wider">
                    <div className="flex items-center gap-1.5">
                      <ListMusic className="w-3 h-3 text-[#65616F]" />
                      <span>Add to Playlist</span>
                    </div>
                  </div>

                  {/* New Playlist from Selection */}
                  <button
                    type="button"
                    onClick={() => {
                      setContextMenu(null);
                      setIsNewPlaylistModalOpen(true);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg text-left text-[#19E6A0] hover:bg-[#19E6A0]/10 active:scale-[0.98] transition-all duration-200 flex items-center gap-2 cursor-pointer text-xs font-semibold"
                  >
                    <Plus className="w-3 h-3 text-[#19E6A0]" />
                    <span className="truncate">New Playlist...</span>
                  </button>

                  {/* Existing Playlists */}
                  {playlists.length > 0 && (
                    <div className="space-y-0.5 max-h-32 overflow-y-auto mt-0.5">
                      {playlists.map((pl) => (
                        <button
                          key={pl.id}
                          type="button"
                          onClick={() => handleBatchAddToPlaylist(pl.id)}
                          className="w-full px-2.5 py-1 rounded-lg text-left text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#1E1D26] active:scale-[0.98] transition-all duration-200 flex items-center justify-between gap-2 cursor-pointer group text-xs"
                        >
                          <span className="truncate flex-1">{pl.name}</span>
                          <Plus className="w-3 h-3 text-[#65616F] group-hover:text-[#19E6A0] shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Remove from this Playlist (when in custom playlist) */}
                {isCustomPlaylist && (
                  <div className="border-t border-[#25232F] my-1 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        removeTracksFromPlaylist(
                          playlistId!,
                          selectedTracksInOrder.map((t) => t.id)
                        );
                        setSelectedTrackIds(new Set());
                        setAnchorTrackId(null);
                        setContextMenu(null);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg text-left text-[#FF667A] hover:bg-[#FF667A]/15 active:scale-[0.98] transition-all duration-200 flex items-center justify-between cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Trash2 className="w-3.5 h-3.5 text-[#FF667A] shrink-0 transition-transform duration-200 group-hover:scale-110" />
                        <span className="truncate font-medium">Remove from Playlist</span>
                      </div>
                    </button>
                  </div>
                )}

                {/* Clear Selection */}
                <div className="border-t border-[#25232F] my-1 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTrackIds(new Set());
                      setAnchorTrackId(null);
                      setContextMenu(null);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg text-left text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#1E1D26] active:scale-[0.98] transition-all duration-200 flex items-center gap-2 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5 text-[#777381]" />
                    <span className="truncate">Clear Selection</span>
                  </button>
                </div>
              </>
            ) : (
              /* Single Track Context Menu */
              <>
                {/* Track Summary Header */}
                <div className="px-2.5 py-1.5 border-b border-[#25232F] mb-1">
                  <p className="font-semibold text-[#F4F2F7] truncate text-xs">{contextMenu.track.title}</p>
                  <p className="text-[10px] text-[#777381] truncate">{contextMenu.track.artist}</p>
                </div>

                {/* Play / Pause */}
                <button
                  type="button"
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
                  type="button"
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
                  type="button"
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
                <div className="border-t border-[#25232F] my-1 pt-1">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] text-[#65616F] uppercase font-semibold tracking-wider">
                    <ListMusic className="w-3 h-3 text-[#65616F]" />
                    <span>Add to Playlist</span>
                  </div>

                  {/* New Playlist from this track */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedTrackIds(new Set([contextMenu.track.id]));
                      setAnchorTrackId(contextMenu.track.id);
                      setContextMenu(null);
                      setIsNewPlaylistModalOpen(true);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg text-left text-[#19E6A0] hover:bg-[#19E6A0]/10 active:scale-[0.98] transition-all duration-200 flex items-center gap-2 cursor-pointer text-xs font-semibold"
                  >
                    <Plus className="w-3 h-3 text-[#19E6A0]" />
                    <span className="truncate">New Playlist...</span>
                  </button>

                  {playlists.length > 0 && (
                    <div className="space-y-0.5 max-h-32 overflow-y-auto mt-0.5">
                      {playlists.map((pl) => (
                        <button
                          key={pl.id}
                          type="button"
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
                  )}
                </div>

                {/* Remove from this Playlist (when in custom playlist) */}
                {isCustomPlaylist && (
                  <div className="border-t border-[#25232F] my-1 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        removeTrackFromPlaylist(playlistId!, contextMenu.track.id);
                        setContextMenu(null);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg text-left text-[#FF667A] hover:bg-[#FF667A]/15 active:scale-[0.98] transition-all duration-200 flex items-center justify-between cursor-pointer group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Trash2 className="w-3.5 h-3.5 text-[#FF667A] shrink-0 transition-transform duration-200 group-hover:scale-110" />
                        <span className="truncate font-medium">Remove from Playlist</span>
                      </div>
                    </button>
                  </div>
                )}

                {/* Reveal in Explorer */}
                <div className="border-t border-[#25232F] my-1 pt-1">
                  <button
                    type="button"
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
                    type="button"
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
              </>
            )}
          </div>,
          document.body
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

      {/* New Playlist from Selection Modal */}
      {isNewPlaylistModalOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200 select-none"
            onClick={() => setIsNewPlaylistModalOpen(false)}
          >
            <form
              onSubmit={handleCreatePlaylistSubmit}
              onClick={(e) => e.stopPropagation()}
              className={`p-5 rounded-2xl ${
                isGlass
                  ? 'bg-[#16151C]/85 backdrop-blur-2xl border border-white/[0.12] shadow-[0_25px_50px_rgba(0,0,0,0.9)]'
                  : 'bg-[#16151C] border border-[#292731] shadow-2xl'
              } w-full max-w-sm space-y-4 shadow-2xl animate-in zoom-in-95 duration-200`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ListPlus className="w-4 h-4 text-[#19E6A0]" />
                  <h3 className="text-sm font-bold text-[#F4F2F7]">New Playlist from Selection</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsNewPlaylistModalOpen(false)}
                  className="text-[#65616F] hover:text-[#F4F2F7] hover:bg-[#1C1B22] p-1 rounded-lg transition-all duration-200 active:scale-90 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-[11px] text-[#777381]">
                Creating a new playlist with {selectedTracksInOrder.length} selected{' '}
                {selectedTracksInOrder.length === 1 ? 'song' : 'songs'}.
              </p>

              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-[#AAA6B2] uppercase tracking-wider">
                  Title
                </label>
                <input
                  type="text"
                  placeholder="My Awesome Playlist"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  autoFocus
                  className={`w-full px-3 py-2.5 rounded-xl ${
                    isGlass ? 'bg-[#100F14]/70 border-white/[0.1]' : 'bg-[#100F14] border-[#282631]'
                  } border text-xs text-[#F4F2F7] placeholder-[#65616F] focus:outline-none focus:border-[#19E6A0]/50 transition-colors`}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-[#AAA6B2] uppercase tracking-wider">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Selected favorites..."
                  value={newPlaylistDesc}
                  onChange={(e) => setNewPlaylistDesc(e.target.value)}
                  className={`w-full px-3 py-2.5 rounded-xl ${
                    isGlass ? 'bg-[#100F14]/70 border-white/[0.1]' : 'bg-[#100F14] border-[#282631]'
                  } border text-xs text-[#F4F2F7] placeholder-[#65616F] focus:outline-none focus:border-[#19E6A0]/50 transition-colors`}
                />
              </div>

              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-[#AAA6B2] uppercase tracking-wider">
                  Accent Color
                </label>
                <div className="flex items-center gap-2 pt-1">
                  {PRESET_COLORS.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setNewPlaylistColor(col)}
                      className={`w-6 h-6 rounded-full transition-transform duration-200 cursor-pointer active:scale-90 ${
                        newPlaylistColor === col ? 'scale-125 ring-2 ring-white' : 'hover:scale-110'
                      }`}
                      style={{ backgroundColor: col }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewPlaylistModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-medium text-[#777381] hover:text-[#F4F2F7] hover:bg-[#1C1B22] transition-all duration-200 active:scale-95 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newPlaylistName.trim()}
                  className="px-4 py-2 rounded-xl bg-[#19E6A0] hover:bg-[#35F0B1] disabled:opacity-50 text-black font-semibold text-xs shadow-md transition-all duration-200 active:scale-95 cursor-pointer"
                >
                  Create Playlist
                </button>
              </div>
            </form>
          </div>,
          document.body
        )}
    </div>
  );
};
