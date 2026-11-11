import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
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
  CalendarDays,
  Trophy,
  Crown,
  Trash2,
  X,
  ChevronUp,
  Minus,
  Pencil,
  Mic2,
  Shuffle,
  ArrowUpDown,
  Sparkles,
} from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Track } from '../types';
import { usePlayer } from '../context/PlayerContext';
import { getTrackColor } from '../utils/helpers';
import { renderHighlightedSnippet, getMatchingLyricSnippet, isCjkText } from '../utils/lyricsSearch';
import { getArtistPlaylistTrackIds, cleanArtistName } from '../utils/artistUtils';
import { resolveTrackAlbumName, isJunkAlbumName } from '../utils/albumUtils';
import { formatListeningTime } from '../utils/affinityEngine';
import { DeleteTrackModal } from './DeleteTrackModal';
import { EditTrackTagsModal } from './EditTrackTagsModal';

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
    topTracksTimeRange,
    setTopTracksTimeRange,
    deleteTrack,
    searchQuery,
    setSearchQuery,
    themeAppearance,
    removeTrackFromPlaylist,
    removeTracksFromPlaylist,
    updateTrackMetadata,
    shuffle,
    toggleShuffle,
  } = usePlayer();

  const isGlass = themeAppearance === 'aura_glass';
  const isCustomPlaylist = Boolean(playlistId && playlistId !== 'all' && playlistId !== 'liked');
  const isAlbumView = Boolean(playlistId?.startsWith('album_'));
  const hasMultiDisc = useMemo(() => {
    return isAlbumView && tracks.some((t) => t.disc_number && t.disc_number > 1);
  }, [isAlbumView, tracks]);

  // Sorting state
  type SortField = 'default' | 'title' | 'artist' | 'album' | 'duration';
  type SortDirection = 'asc' | 'desc';

  const [sortField, setSortField] = useState<SortField>('default');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const displayTracks = useMemo(() => {
    if (sortField === 'default') return tracks;
    const list = [...tracks];
    list.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'title') {
        comparison = (a.title || '').localeCompare(b.title || '');
      } else if (sortField === 'artist') {
        comparison = (a.artist || '').localeCompare(b.artist || '');
      } else if (sortField === 'album') {
        comparison = (a.album || '').localeCompare(b.album || '');
      } else if (sortField === 'duration') {
        comparison = (a.duration || 0) - (b.duration || 0);
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return list;
  }, [tracks, sortField, sortDirection]);

  const totalDurationStr = useMemo(() => {
    const totalSeconds = tracks.reduce((acc, t) => acc + (t.duration || 0), 0);
    if (!totalSeconds) return '';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    if (hours > 0) {
      return `${hours} hr ${minutes} min`;
    }
    return `${minutes} min`;
  }, [tracks]);

  const handleSortClick = (field: SortField) => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else {
        setSortField('default');
        setSortDirection('asc');
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const isThisListPlaying = Boolean(
    isPlaying && currentTrack && tracks.some((t) => t.id === currentTrack.id)
  );

  const handleHeroPlayAll = () => {
    if (displayTracks.length === 0) return;
    if (isThisListPlaying) {
      togglePlay();
    } else {
      playTrack(displayTracks[0], displayTracks, playlistId);
    }
  };

  const handleHeroShuffle = () => {
    if (displayTracks.length === 0) return;
    const randomIndex = Math.floor(Math.random() * displayTracks.length);
    if (!shuffle) {
      toggleShuffle();
    }
    playTrack(displayTracks[randomIndex], displayTracks, playlistId);
  };

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
  const [trackToEditTags, setTrackToEditTags] = useState<Track | null>(null);
  const [isPlaylistDropdownOpen, setIsPlaylistDropdownOpen] = useState(false);
  const [isNewPlaylistModalOpen, setIsNewPlaylistModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');
  const [newPlaylistColor, setNewPlaylistColor] = useState(PRESET_COLORS[0]);
  const [flashingTrackId, setFlashingTrackId] = useState<string | null>(null);
  const [isScrolledHeader, setIsScrolledHeader] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const updateMargin = () => {
      if (listRef.current && scrollContainerRef.current) {
        const listRect = listRef.current.getBoundingClientRect();
        const containerRect = scrollContainerRef.current.getBoundingClientRect();
        const offset = listRect.top - containerRect.top + scrollContainerRef.current.scrollTop;
        setScrollMargin(Math.max(0, Math.round(offset)));
      }
    };
    updateMargin();
  }, [title, subtitle, coverArt, tracks.length]);

  useEffect(() => {
    const updateMargin = () => {
      if (listRef.current && scrollContainerRef.current) {
        const listRect = listRef.current.getBoundingClientRect();
        const containerRect = scrollContainerRef.current.getBoundingClientRect();
        const offset = listRect.top - containerRect.top + scrollContainerRef.current.scrollTop;
        setScrollMargin(Math.max(0, Math.round(offset)));
      }
    };
    window.addEventListener('resize', updateMargin);
    return () => window.removeEventListener('resize', updateMargin);
  }, []);

  const rowVirtualizer = useVirtualizer({
    count: displayTracks.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: (index: number) => {
      const track = displayTracks[index];
      if (!track) return 48;
      const hasSnippet =
        track.matchingLyricSnippet !== undefined
          ? Boolean(track.matchingLyricSnippet)
          : (searchQuery.trim().length >= 3 || isCjkText(searchQuery))
          ? Boolean(getMatchingLyricSnippet(track.id, track.lyrics, searchQuery)?.snippet)
          : false;
      return hasSnippet ? 70 : 48;
    },
    overscan: 12,
    scrollMargin,
    getItemKey: (index) => displayTracks[index]?.id ?? index,
  });

  // Re-measure virtual rows dynamically when search query or track count changes
  const displayTrackCount = displayTracks.length;
  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      rowVirtualizer.measure();
    });
    return () => cancelAnimationFrame(rafId);
  }, [searchQuery, displayTrackCount]);

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

  // Listen for scroll-to-track event to locate & flash currently playing track in view
  useEffect(() => {
    const handleScrollToTrack = (e: Event) => {
      const customEvent = e as CustomEvent<{ trackId?: string; title?: string; artist?: string }>;
      const targetId = customEvent.detail?.trackId;
      const targetTitle = customEvent.detail?.title?.trim().toLowerCase();
      const targetArtist = customEvent.detail?.artist?.trim().toLowerCase();
      if (!targetId && !targetTitle) return;

      let idx = displayTracks.findIndex(
        (t) =>
          (targetId && t.id === targetId) ||
          (targetTitle &&
            t.title?.trim().toLowerCase() === targetTitle &&
            (!targetArtist || t.artist?.trim().toLowerCase() === targetArtist))
      );

      // If user had a search filter hiding the track, clear it so the full list is shown
      if (idx === -1 && searchQuery.trim()) {
        setSearchQuery('');
        return;
      }

      if (idx !== -1) {
        rowVirtualizer.scrollToIndex(idx, { align: 'center', behavior: 'smooth' });
        const matchedId = displayTracks[idx].id;
        setFlashingTrackId(matchedId);

        // Backup DOM query alignment once virtual node mounts
        setTimeout(() => {
          const rowEl = scrollContainerRef.current?.querySelector(`[data-track-id="${matchedId}"]`) as HTMLElement | null;
          if (rowEl) {
            rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 50);

        setTimeout(() => {
          setFlashingTrackId((prev) => (prev === matchedId ? null : prev));
        }, 1800);
      }
    };

    window.addEventListener('scroll-to-track', handleScrollToTrack);
    return () => window.removeEventListener('scroll-to-track', handleScrollToTrack);
  }, [displayTracks, rowVirtualizer]);

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
        ref={scrollContainerRef}
        onScroll={(e) => {
          const st = (e.currentTarget as HTMLElement).scrollTop;
          const threshold = scrollMargin > 0 ? Math.max(20, scrollMargin - 12) : (title ? 180 : 20);
          const shouldBeScrolled = st > threshold;
          if (shouldBeScrolled !== isScrolledHeader) {
            setIsScrolledHeader(shouldBeScrolled);
          }
        }}
        className="flex-1 overflow-y-auto overflow-x-hidden pb-24 select-none relative"
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
        {/* Modern Hero Header with Dynamic Album Art / Collage */}
        {title && (
          <div className={`relative p-6 md:p-8 flex flex-col md:flex-row md:items-end justify-between gap-6 md:gap-8 transition-colors duration-300 ${
            isGlass
              ? 'bg-gradient-to-b from-white/[0.04] via-transparent to-transparent'
              : 'bg-gradient-to-b from-[#181622]/80 via-[#100F15]/40 to-transparent'
          } shrink-0 overflow-hidden`}>
            {/* Ambient diffused atmospheric glow */}
            <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-[var(--accent)]/[0.08] blur-[100px] pointer-events-none" />

            {/* Left: Artwork + Title Metadata */}
            <div className="flex items-end gap-6 md:gap-8 min-w-0 flex-1 relative z-10">
              {/* Artwork Container with rich drop-shadow and hover play overlay */}
              <div className="w-36 h-36 md:w-44 md:h-44 lg:w-48 lg:h-48 rounded-2xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-white/[0.12] shrink-0 bg-[#14131A] flex items-center justify-center relative group/heroart transition-transform duration-300 hover:scale-[1.02]">
                {isCollage ? (
                  <div className="w-full h-full grid grid-cols-2 grid-rows-2">
                    {tracksWithCovers.slice(0, 4).map((art, i) => (
                      <img key={i} src={art} alt="" className="w-full h-full object-cover transition-transform duration-300 group-hover/heroart:scale-105" />
                    ))}
                  </div>
                ) : heroCover ? (
                  <img src={heroCover} alt={title} className="w-full h-full object-cover transition-transform duration-300 group-hover/heroart:scale-105" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-[#1A1924] to-[#121118]">
                    <Disc3 className="w-16 h-16 text-[var(--accent)]/40 animate-pulse" />
                  </div>
                )}

                {/* Quick Play overlay on artwork hover */}
                <button
                  type="button"
                  onClick={handleHeroPlayAll}
                  className="absolute inset-0 bg-black/50 opacity-0 group-hover/heroart:opacity-100 flex items-center justify-center transition-all duration-200 cursor-pointer backdrop-blur-[2px]"
                  aria-label={isThisListPlaying ? "Pause" : "Play"}
                >
                  <div className="w-14 h-14 rounded-full bg-[var(--accent)] text-[var(--accent-contrast,#000000)] flex items-center justify-center shadow-xl hover:scale-110 active:scale-95 transition-transform" style={{ boxShadow: '0 8px 24px var(--accent-glow)' }}>
                    {isThisListPlaying ? (
                      <Pause className="w-6 h-6 fill-current" />
                    ) : (
                      <Play className="w-6 h-6 fill-current ml-0.5" />
                    )}
                  </div>
                </button>
              </div>

              {/* Title & Metadata */}
              <div className="flex flex-col gap-2 min-w-0 flex-1 pb-1">
                <span className="text-[11px] font-bold uppercase tracking-widest text-[var(--accent)] flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-[var(--accent)]" />
                  <span>
                    {playlistId === 'top_tracks'
                      ? 'Personal Affinity Engine'
                      : title === 'Liked Songs'
                      ? 'Playlist'
                      : 'Collection'}
                  </span>
                </span>

                <h1 className="text-3xl md:text-5xl font-black text-[#F4F2F7] tracking-tight truncate leading-tight drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)]">
                  {title}
                </h1>

                {/* Subtitle & Live Stats */}
                <div className="flex items-center gap-2 text-xs text-[#A9A5B3] font-medium mt-0.5 flex-wrap">
                  <span className="text-[#F4F2F7] font-semibold">MusicVault</span>
                  <span className="text-[#555260]">•</span>
                  <span>{tracks.length} {tracks.length === 1 ? 'song' : 'songs'}</span>
                  {totalDurationStr && (
                    <>
                      <span className="text-[#555260]">•</span>
                      <span className="font-mono text-[#8E8A98]">{totalDurationStr}</span>
                    </>
                  )}
                </div>

                {/* Spotify-style Time Range Selector Pills for Top Tracks */}
                {playlistId === 'top_tracks' && (
                  <div className="flex items-center gap-2 mt-3 pt-1">
                    <button
                      type="button"
                      onClick={() => setTopTracksTimeRange('short_term')}
                      className={`group/pill flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 active:scale-95 cursor-pointer ${
                        topTracksTimeRange === 'short_term'
                          ? 'bg-[var(--accent)] text-[var(--accent-contrast,#000000)] font-bold'
                          : 'bg-[#16151D] text-[#8E8A99] hover:text-[#F4F2F7] hover:bg-[#1E1D27] border border-[#2B2936] hover:border-[#3D3A4B]'
                      }`}
                      style={topTracksTimeRange === 'short_term' ? { boxShadow: '0 2px 12px var(--accent-glow)' } : undefined}
                    >
                      <Flame
                        className={`w-3.5 h-3.5 transition-transform duration-200 group-hover/pill:scale-110 ${
                          topTracksTimeRange === 'short_term'
                            ? 'fill-current text-current'
                            : 'text-[#FF7A00] fill-[#FF7A00]/25'
                        }`}
                      />
                      <span>On Repeat (30 Days)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopTracksTimeRange('medium_term')}
                      className={`group/pill flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 active:scale-95 cursor-pointer ${
                        topTracksTimeRange === 'medium_term'
                          ? 'bg-[var(--accent)] text-[var(--accent-contrast,#000000)] font-bold'
                          : 'bg-[#16151D] text-[#8E8A99] hover:text-[#F4F2F7] hover:bg-[#1E1D27] border border-[#2B2936] hover:border-[#3D3A4B]'
                      }`}
                      style={topTracksTimeRange === 'medium_term' ? { boxShadow: '0 2px 12px var(--accent-glow)' } : undefined}
                    >
                      <CalendarDays
                        className={`w-3.5 h-3.5 transition-transform duration-200 group-hover/pill:scale-110 ${
                          topTracksTimeRange === 'medium_term'
                            ? 'stroke-current stroke-[2.3]'
                            : 'text-[#00F2FE]'
                        }`}
                      />
                      <span>Past 6 Months</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTopTracksTimeRange('all_time')}
                      className={`group/pill flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 active:scale-95 cursor-pointer ${
                        topTracksTimeRange === 'all_time'
                          ? 'bg-[var(--accent)] text-[var(--accent-contrast,#000000)] font-bold'
                          : 'bg-[#16151D] text-[#8E8A99] hover:text-[#F4F2F7] hover:bg-[#1E1D27] border border-[#2B2936] hover:border-[#3D3A4B]'
                      }`}
                      style={topTracksTimeRange === 'all_time' ? { boxShadow: '0 2px 12px var(--accent-glow)' } : undefined}
                    >
                      <Trophy
                        className={`w-3.5 h-3.5 transition-transform duration-200 group-hover/pill:scale-110 ${
                          topTracksTimeRange === 'all_time'
                            ? 'fill-current text-current'
                            : 'text-[#E8C77A] fill-[#E8C77A]/30'
                        }`}
                      />
                      <span>All Time</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Actions in Hero Header (Restored to Clean Original Placement) */}
            <div className="flex items-center gap-3 shrink-0 relative z-10 pb-1 self-end">
              {/* Play All Button */}
              <button
                type="button"
                onClick={handleHeroPlayAll}
                disabled={displayTracks.length === 0}
                className="w-12 h-12 rounded-full bg-[var(--accent)] hover:opacity-95 disabled:opacity-50 text-[var(--accent-contrast,#000000)] hover:scale-105 active:scale-95 transition-all duration-200 flex items-center justify-center cursor-pointer shrink-0"
                style={{ boxShadow: '0 6px 22px var(--accent-glow)' }}
                title={isThisListPlaying ? "Pause" : "Play all"}
                aria-label={isThisListPlaying ? "Pause" : "Play all"}
              >
                {isThisListPlaying ? (
                  <Pause className="w-5 h-5 fill-current" />
                ) : (
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                )}
              </button>

              {/* Shuffle Button */}
              <button
                type="button"
                onClick={handleHeroShuffle}
                disabled={displayTracks.length === 0}
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer border ${
                  shuffle
                    ? 'bg-[var(--accent-muted)] text-[var(--accent)] border-[var(--accent-border)] shadow-sm'
                    : 'bg-white/[0.04] hover:bg-white/[0.08] text-[#8E8A98] hover:text-[#F4F2F7] border-white/[0.08]'
                }`}
                title={shuffle ? "Shuffle is ON (Click to toggle)" : "Shuffle play"}
                aria-label="Shuffle"
              >
                <Shuffle className="w-4 h-4" />
              </button>

              {/* Add All to Queue */}
              <button
                type="button"
                onClick={() => addTracksToQueue(displayTracks)}
                disabled={displayTracks.length === 0}
                className="w-10 h-10 rounded-full flex items-center justify-center bg-white/[0.04] hover:bg-white/[0.08] text-[#8E8A98] hover:text-[#F4F2F7] border border-white/[0.08] hover:border-white/[0.15] transition-all duration-200 hover:scale-105 active:scale-95 cursor-pointer"
                title="Add all tracks to Queue"
                aria-label="Add all to Queue"
              >
                <ListPlus className="w-4 h-4" />
              </button>

              {/* Save as Playlist (for Top Tracks) */}
              {playlistId === 'top_tracks' && tracks.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const rangeLabel =
                      topTracksTimeRange === 'short_term'
                        ? 'On Repeat'
                        : topTracksTimeRange === 'medium_term'
                        ? 'Past 6 Months'
                        : 'All Time';
                    const ids = tracks.map((t) => t.id);
                    createPlaylist(
                      `Top Tracks (${rangeLabel})`,
                      `Your personal ${rangeLabel} listening affinity mix • ${ids.length} tracks`,
                      ids,
                      '#E8C77A'
                    );
                  }}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#E8C77A]/15 hover:bg-[#E8C77A]/25 text-[#E8C77A] border border-[#E8C77A]/30 text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer"
                  title="Save current Top Tracks as a permanent playlist"
                >
                  <ListPlus className="w-3.5 h-3.5" />
                  <span>Save</span>
                </button>
              )}

              {/* Sort Reset Pill */}
              {sortField !== 'default' && (
                <button
                  type="button"
                  onClick={() => { setSortField('default'); setSortDirection('asc'); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--accent-muted)] hover:bg-[var(--accent)]/20 text-[var(--accent)] border border-[var(--accent-border)] text-[11px] font-semibold transition-all active:scale-95 cursor-pointer"
                  title="Reset sort order to default"
                >
                  <ArrowUpDown className="w-3 h-3" />
                  <span className="capitalize">{sortField}</span>
                  <X className="w-3 h-3 ml-0.5 opacity-70 hover:opacity-100" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Track Table */}
        <div className="px-6 md:px-8 pb-4">
          {displayTracks.length === 0 ? (
            <div className="py-20 text-center text-[#777381]">
              <Disc3 className="w-10 h-10 mx-auto mb-3 text-[#555260] animate-pulse" />
              <p className="text-xs font-medium text-[#A9A5B3]">No songs found in this view</p>
              <p className="text-[11px] text-[#777381] mt-1">
                Check your search query or add music directories in Settings.
              </p>
            </div>
          ) : (
            <div className="w-full text-xs">
              {/* Seamless Sticky Table Header (Full-width edge-to-edge, No Box Cutout) */}
              <div className={`sticky top-0 z-20 transition-all duration-200 -mx-6 md:-mx-8 px-9 md:px-11 ${
                isScrolledHeader
                  ? isGlass
                    ? 'bg-black/30 backdrop-blur-2xl border-b border-white/[0.08] shadow-[0_4px_20px_rgba(0,0,0,0.25)]'
                    : 'bg-[#0E0D14]/85 backdrop-blur-2xl border-b border-white/[0.08] shadow-[0_4px_20px_rgba(0,0,0,0.35)]'
                  : 'bg-transparent border-b border-white/[0.06]'
              } grid ${
                hasMultiDisc
                  ? 'grid-cols-[48px_minmax(0,1fr)_80px_40px] md:grid-cols-[48px_minmax(0,2.5fr)_minmax(0,1.5fr)_80px_40px]'
                  : 'grid-cols-[40px_minmax(0,1fr)_80px_40px] md:grid-cols-[40px_minmax(0,2.5fr)_minmax(0,1.5fr)_80px_40px]'
              } items-center py-2.5 text-[#8E8A98] uppercase tracking-wider font-semibold text-[10px] select-none`}>
                {/* Index / Select All Checkbox Header */}
                <div className="text-center flex items-center justify-center">
                  {selectedTrackIds.size > 0 ? (
                    <button
                      type="button"
                      onClick={toggleSelectAll}
                      className="w-4 h-4 rounded-md bg-[var(--accent)] text-[var(--accent-contrast,#000000)] flex items-center justify-center mx-auto shadow-sm transition-transform active:scale-90 cursor-pointer"
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
                      onClick={() => handleSortClick('default')}
                      className="group/select-header w-4 h-4 flex items-center justify-center mx-auto cursor-pointer"
                      title="Sort by index / Reset sort"
                      aria-label="Index header"
                    >
                      <span className="font-mono text-[10px] group-hover/select-header:hidden text-[#8E8A98] group-hover/select-header:text-[var(--accent)] transition-colors">#</span>
                      <div className="hidden group-hover/select-header:flex w-3.5 h-3.5 rounded border border-[#8E8A98] hover:border-[var(--accent)] items-center justify-center transition-colors" />
                    </button>
                  )}
                </div>

                <div
                  onClick={() => handleSortClick('title')}
                  className="pl-1 flex items-center gap-1 cursor-pointer hover:text-[#F4F2F7] transition-colors"
                  title="Click to sort by Title"
                >
                  <span>Title</span>
                  {sortField === 'title' && (
                    <span className="text-[var(--accent)] text-xs font-bold leading-none">
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>

                <div
                  onClick={() => handleSortClick('album')}
                  className="hidden md:flex items-center gap-1 cursor-pointer hover:text-[#F4F2F7] transition-colors"
                  title="Click to sort by Album"
                >
                  <span>{playlistId === 'top_tracks' ? 'Listening Stats' : 'Album'}</span>
                  {sortField === 'album' && (
                    <span className="text-[var(--accent)] text-xs font-bold leading-none">
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>

                <div
                  onClick={() => handleSortClick('duration')}
                  className="text-right pr-2 cursor-pointer hover:text-[#F4F2F7] transition-colors flex items-center justify-end gap-1"
                  title="Click to sort by Duration"
                >
                  <Clock className="w-3 h-3 inline-block text-[#8E8A98]" />
                  {sortField === 'duration' && (
                    <span className="text-[var(--accent)] text-xs font-bold leading-none">
                      {sortDirection === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </div>

                <div className="text-center"></div>
              </div>

              {/* Virtualized Contiguous Track Rows */}
              <div
                ref={listRef}
                className="pt-1.5"
                style={{
                  height: `${rowVirtualizer.getTotalSize()}px`,
                  width: '100%',
                  position: 'relative',
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const track = displayTracks[virtualRow.index];
                  if (!track) return null;
                  const idx = virtualRow.index;
                  const isCurrent = currentTrack?.id === track.id;
                  const isSelected = selectedTrackIds.has(track.id);
                  const isLiked = likedTrackIds.has(track.id);
                  const isMenuOpen = activeMenuTrackId === track.id;
                  const trackColor = getTrackColor(track.title, track.artist);
                  const isTopTracksView = playlistId === 'top_tracks';
                  const trackNum = isAlbumView && track.track_number && track.track_number > 0 ? track.track_number : idx + 1;
                  const showDiscBadge = isAlbumView && Boolean(track.disc_number && track.disc_number > 1);
                  const matchingSnippet =
                    track.matchingLyricSnippet !== undefined
                      ? track.matchingLyricSnippet
                      : (searchQuery.trim().length >= 3 || isCjkText(searchQuery))
                      ? getMatchingLyricSnippet(track.id, track.lyrics, searchQuery)?.snippet ?? null
                      : null;

                  return (
                    <div
                      key={virtualRow.key}
                      data-index={virtualRow.index}
                      ref={rowVirtualizer.measureElement}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start - (rowVirtualizer.options.scrollMargin ?? 0)}px)`,
                        zIndex: isMenuOpen ? 30 : 1,
                      }}
                      className="pb-1 box-border"
                    >
                      <div
                        data-track-row="true"
                        data-track-id={track.id}
                        onClick={(e) => handleRowClick(e, track, idx)}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        setFlashingTrackId(track.id);
                        setTimeout(() => {
                          setFlashingTrackId((prev) => (prev === track.id ? null : prev));
                        }, 400);
                        playTrack(track, displayTracks, playlistId);
                      }}
                      onContextMenu={(e) => handleContextMenu(e, track)}
                      className={`group grid ${
                        hasMultiDisc
                          ? 'grid-cols-[48px_minmax(0,1fr)_80px_40px] md:grid-cols-[48px_minmax(0,2.5fr)_minmax(0,1.5fr)_80px_40px]'
                          : 'grid-cols-[40px_minmax(0,1fr)_80px_40px] md:grid-cols-[40px_minmax(0,2.5fr)_minmax(0,1.5fr)_80px_40px]'
                      } items-center px-3 ${
                        matchingSnippet ? 'min-h-[66px] py-2' : 'h-[46px] py-1'
                      } rounded-xl transition-all duration-150 cursor-pointer ${
                        flashingTrackId === track.id ? 'animate-row-flash' : ''
                      } ${
                        isSelected
                          ? isCurrent
                            ? 'bg-[var(--accent-muted)] border border-[var(--accent)] text-[#F4F2F7]'
                            : 'bg-[var(--accent-muted)] border border-[var(--accent-border)] text-[#F4F2F7]'
                          : isCurrent
                          ? 'bg-[var(--accent-muted)] border border-[var(--accent-border)] text-[#F4F2F7]'
                          : 'border border-transparent hover:bg-white/[0.04] hover:border-white/[0.06] text-[#8E8A98]'
                      }`}
                      style={
                        isSelected || isCurrent
                          ? { boxShadow: isSelected && isCurrent ? '0 0 14px var(--accent-glow)' : '0 0 10px var(--accent-glow)' }
                          : undefined
                      }
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
                            className="w-4 h-4 rounded-md bg-[var(--accent)] text-[var(--accent-contrast,#000000)] flex items-center justify-center mx-auto shadow-sm cursor-pointer transition-transform duration-150 hover:scale-110 active:scale-90"
                            title="Selected (Click to deselect)"
                            aria-label="Deselect track"
                          >
                            <Check className="w-3 h-3 stroke-[3]" />
                          </button>
                        ) : selectedTrackIds.size > 0 ? (
                          <>
                            <span
                              className={`inline-block font-mono text-[11px] group-hover:hidden ${
                                isCurrent ? 'text-[var(--accent)] font-bold' : 'text-[#65616F]'
                              }`}
                            >
                              {isCurrent ? (
                                <div className="flex items-center justify-center gap-1 shrink-0 whitespace-nowrap">
                                  {showDiscBadge && (
                                    <span
                                      className="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-[#292736] text-[#A5A1B0] border border-[#3A3748] leading-none shrink-0"
                                      title={`Disc ${track.disc_number}`}
                                    >
                                      D{track.disc_number}
                                    </span>
                                  )}
                                  <div
                                    className="flex items-end justify-center gap-[2.5px] w-3.5 h-3.5 py-0.5 shrink-0"
                                    aria-label={isPlaying ? 'Playing' : 'Paused'}
                                  >
                                    <span
                                      className="w-[2.5px] h-full bg-[var(--accent)] rounded-full origin-bottom animate-eq-bar-1"
                                      style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
                                    />
                                    <span
                                      className="w-[2.5px] h-full bg-[var(--accent)] rounded-full origin-bottom animate-eq-bar-2"
                                      style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
                                    />
                                    <span
                                      className="w-[2.5px] h-full bg-[var(--accent)] rounded-full origin-bottom animate-eq-bar-3"
                                      style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="inline-flex items-center justify-center gap-1 shrink-0 whitespace-nowrap">
                                  {showDiscBadge && (
                                    <span
                                      className="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-[#292736] text-[#A5A1B0] border border-[#3A3748] leading-none shrink-0"
                                      title={`Disc ${track.disc_number}`}
                                    >
                                      D{track.disc_number}
                                    </span>
                                  )}
                                  {isTopTracksView ? (
                                    <span
                                      className={`font-black text-[11px] font-mono inline-flex items-center justify-center gap-0.5 ${
                                        idx === 0
                                          ? 'text-[#E8C77A]'
                                          : idx === 1
                                          ? 'text-[#D1D5DB]'
                                          : idx === 2
                                          ? 'text-[#CD7F32]'
                                          : 'text-[#65616F]'
                                      }`}
                                    >
                                      {idx === 0 && <Crown className="w-2.5 h-2.5 fill-[#E8C77A] text-[#E8C77A] inline-block mr-0.5" />}
                                      #{idx + 1}
                                    </span>
                                  ) : (
                                    <span className="shrink-0">{trackNum}</span>
                                  )}
                                </span>
                              )}
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleTrackSelection(track.id);
                              }}
                              className="hidden group-hover:flex w-4 h-4 rounded-md border border-[#65616F] hover:border-[var(--accent)] hover:bg-[var(--accent-muted)] items-center justify-center mx-auto shadow-sm cursor-pointer transition-all duration-150 active:scale-90"
                              title="Select track"
                              aria-label="Select track"
                            />
                          </>
                        ) : (
                          <>
                            <span
                              className={`inline-block font-mono text-[11px] group-hover:hidden ${
                                isCurrent ? 'text-[var(--accent)] font-bold' : 'text-[#65616F]'
                              }`}
                            >
                              {isCurrent ? (
                                <div className="flex items-center justify-center gap-1 shrink-0 whitespace-nowrap">
                                  {showDiscBadge && (
                                    <span
                                      className="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-[#292736] text-[#A5A1B0] border border-[#3A3748] leading-none shrink-0"
                                      title={`Disc ${track.disc_number}`}
                                    >
                                      D{track.disc_number}
                                    </span>
                                  )}
                                  <div
                                    className="flex items-end justify-center gap-[2.5px] w-3.5 h-3.5 py-0.5 shrink-0"
                                    aria-label={isPlaying ? 'Playing' : 'Paused'}
                                  >
                                    <span
                                      className="w-[2.5px] h-full bg-[var(--accent)] rounded-full origin-bottom animate-eq-bar-1"
                                      style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
                                    />
                                    <span
                                      className="w-[2.5px] h-full bg-[var(--accent)] rounded-full origin-bottom animate-eq-bar-2"
                                      style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
                                    />
                                    <span
                                      className="w-[2.5px] h-full bg-[var(--accent)] rounded-full origin-bottom animate-eq-bar-3"
                                      style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
                                    />
                                  </div>
                                </div>
                              ) : (
                                <span className="inline-flex items-center justify-center gap-1 shrink-0 whitespace-nowrap">
                                  {showDiscBadge && (
                                    <span
                                      className="text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-[#292736] text-[#A5A1B0] border border-[#3A3748] leading-none shrink-0"
                                      title={`Disc ${track.disc_number}`}
                                    >
                                      D{track.disc_number}
                                    </span>
                                  )}
                                  {isTopTracksView ? (
                                    <span
                                      className={`font-black text-[11px] font-mono inline-flex items-center justify-center gap-0.5 ${
                                        idx === 0
                                          ? 'text-[#E8C77A]'
                                          : idx === 1
                                          ? 'text-[#D1D5DB]'
                                          : idx === 2
                                          ? 'text-[#CD7F32]'
                                          : 'text-[#65616F]'
                                      }`}
                                    >
                                      {idx === 0 && <Crown className="w-2.5 h-2.5 fill-[#E8C77A] text-[#E8C77A] inline-block mr-0.5" />}
                                      #{idx + 1}
                                    </span>
                                  ) : (
                                    <span className="shrink-0">{trackNum}</span>
                                  )}
                                </span>
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
                                  playTrack(track, displayTracks, playlistId);
                                }
                              }}
                              className="group/rowplay hidden group-hover:inline-flex items-center justify-center w-6 h-6 rounded-full text-[#F4F2F7] hover:text-[var(--accent)] transition-all duration-200 hover:scale-110 active:scale-90 cursor-pointer"
                              aria-label={isCurrent && isPlaying ? 'Pause' : 'Play'}
                            >
                              {isCurrent && isPlaying ? (
                                <Pause className="w-3.5 h-3.5 fill-current discord-icon discord-icon-pop" />
                              ) : (
                                <Play className="w-3.5 h-3.5 fill-current ml-0.5 discord-icon discord-icon-pop" />
                              )}
                            </button>
                          </>
                        )}
                      </div>

                      {/* Title & Artist */}
                      <div className="flex items-center gap-3 min-w-0 pr-3">
                        <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 border border-white/[0.08] shadow-sm bg-[#12111A]">
                          {track.cover_art ? (
                            <img
                              src={track.cover_art}
                              alt=""
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
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
                        <div className="flex flex-col min-w-0 justify-center">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`font-semibold truncate text-xs transition-colors duration-200 ${
                                isCurrent
                                  ? 'text-[var(--accent)]'
                                  : isSelected
                                  ? 'text-[#F4F2F7]'
                                  : 'text-[#F4F2F7] group-hover:text-[var(--accent)]'
                              }`}
                            >
                              {track.title}
                            </span>
                            {isTopTracksView && track.stats?.isOnRepeat && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[var(--accent-muted)] text-[var(--accent)] border border-[var(--accent-border)] text-[9px] font-semibold shrink-0 shadow-sm">
                                <Flame className="w-2.5 h-2.5 fill-[var(--accent)] text-[var(--accent)]" />
                                <span>On Repeat</span>
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-[#8E8A98] group-hover:text-[#A9A5B3] truncate transition-colors">
                            {track.artist}
                          </span>
                          {matchingSnippet && (
                            <div
                              className="flex items-center gap-1.5 mt-1 text-[10px] min-w-0 max-w-full"
                              title={`Lyrics match: "${matchingSnippet}"`}
                            >
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[var(--accent-muted)] border border-[var(--accent-border)] text-[var(--accent)] text-[10px] font-medium shrink-0 shadow-sm">
                                <Mic2 className="w-2.5 h-2.5 text-[var(--accent)]" />
                                <span>Lyrics match:</span>
                              </span>
                              <span className="truncate min-w-0 italic text-[#B5B1BF] text-[10.5px]">
                                "{renderHighlightedSnippet(matchingSnippet, searchQuery)}"
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Album / Listening Stats */}
                      <div className="hidden md:block text-[#777381] group-hover:text-[#8E8A98] truncate text-[11px] pr-3 transition-colors">
                        {isTopTracksView && track.stats ? (
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="text-[#AAA6B2] font-semibold">
                              {track.stats.playCount} {track.stats.playCount === 1 ? 'listen' : 'listens'}
                            </span>
                            <span className="text-[#555260]">•</span>
                            <span className="text-[#777381]">
                              {formatListeningTime(track.stats.totalListenDuration)}
                            </span>
                          </div>
                        ) : (
                          track.album
                        )}
                      </div>

                      {/* Duration & Like */}
                      <div className="flex items-center justify-end gap-2.5 font-mono text-[11px] text-[#8E8A98] group-hover:text-[#F4F2F7] pr-2 transition-colors">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLike(track.id);
                          }}
                          className={`group/like p-1 transition-all duration-200 active:scale-90 cursor-pointer ${
                            isLiked
                              ? 'text-[#E8C77A] opacity-100'
                              : 'text-[#65616F] opacity-0 group-hover:opacity-100 hover:text-[#E8C77A]'
                          }`}
                          aria-label={isLiked ? 'Remove from liked' : 'Add to liked'}
                        >
                          <Heart
                            className={`w-3.5 h-3.5 discord-icon discord-icon-heart ${
                              isLiked ? 'fill-[#E8C77A] text-[#E8C77A]' : ''
                            }`}
                          />
                        </button>
                        {isTopTracksView && (() => {
                          const count = track.playCount ?? getPlayCount(track.id);
                          if (!count || count <= 0) return null;
                          return (
                            <span
                              className="hidden sm:inline-flex items-center gap-1 text-[10px] text-[#A9A5B3] group-hover:text-[#E8C77A] font-semibold bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 rounded-md transition-colors"
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
                          className={`group/more p-1.5 rounded-lg transition-all duration-200 active:scale-90 cursor-pointer ${
                            isMenuOpen
                              ? 'opacity-100 text-[#F4F2F7] bg-[#1E1D26]'
                              : 'text-[#65616F] hover:text-[#F4F2F7] hover:bg-[#1D1C23] opacity-0 group-hover:opacity-100'
                          }`}
                          aria-label="More options"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5 discord-icon discord-icon-pop" />
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
                                  <Check className="w-3.5 h-3.5 text-[var(--accent)] animate-in fade-in zoom-in-95 duration-200 shrink-0" />
                                ) : (
                                  <ListPlus className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 transition-transform duration-200 group-hover/item:scale-110" />
                                )}
                                <span
                                  className={`truncate transition-colors duration-200 ${
                                    actionFeedback?.trackId === track.id && actionFeedback.action === 'queue'
                                      ? 'text-[var(--accent)] font-medium'
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
                                            isPlSaved ? 'text-[var(--accent)] font-medium' : ''
                                          }`}
                                        >
                                          {isPlSaved ? `Added to ${pl.name}` : pl.name}
                                        </span>
                                        {isPlSaved ? (
                                          <Check className="w-3 h-3 text-[var(--accent)] animate-in fade-in zoom-in-95 duration-200 shrink-0" />
                                        ) : (
                                          <Plus className="w-3 h-3 text-[#65616F] group-hover/pl:text-[var(--accent)] shrink-0 transition-transform duration-200 group-hover/pl:scale-110" />
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

                            {/* Edit Tags & Art */}
                            <div className="border-t border-[#25232F] my-1 pt-1">
                              <button
                                onClick={() => {
                                  setActiveMenuTrackId(null);
                                  setTrackToEditTags(track);
                                }}
                                className="w-full px-2.5 py-1.5 rounded-lg text-left text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#1E1D26] active:scale-[0.98] transition-all duration-200 flex items-center justify-between cursor-pointer group/item text-xs"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <Pencil className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 transition-transform duration-200 group-hover/item:scale-110" />
                                  <span className="truncate">Edit Tags & Art...</span>
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
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[var(--accent-muted)] text-[var(--accent)] text-xs font-semibold border border-[var(--accent-border)] shrink-0">
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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1E1D27] hover:bg-[#282635] text-[#F4F2F7] hover:text-[var(--accent)] text-xs font-medium border border-[#2F2D3D] transition-all duration-150 cursor-pointer active:scale-95 shrink-0"
              title="Add selected songs to playlist"
            >
              <ListPlus className="w-3.5 h-3.5 text-[var(--accent)]" />
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
                  className="w-full px-2.5 py-2 rounded-xl text-left text-[var(--accent)] hover:bg-[var(--accent-muted)] active:scale-[0.98] transition-all flex items-center gap-2 text-xs font-semibold cursor-pointer group"
                >
                  <div className="w-6 h-6 rounded-lg bg-[var(--accent-muted)] flex items-center justify-center shrink-0">
                    <Plus className="w-3.5 h-3.5 text-[var(--accent)]" />
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
                                background: pl.coverColor ? `${pl.coverColor}25` : 'var(--accent-muted)',
                                color: pl.coverColor || 'var(--accent)',
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1E1D27] hover:bg-[#282635] text-[#F4F2F7] hover:text-[var(--accent)] text-xs font-medium border border-[#2F2D3D] transition-all duration-150 cursor-pointer active:scale-95 shrink-0"
            title="Queue all selected tracks"
          >
            <ListMusic className="w-3.5 h-3.5 text-[var(--accent)]" />
            <span>Add to Queue</span>
          </button>

          {/* Play Selection Button */}
          <button
            type="button"
            onClick={handleBatchPlay}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#1E1D27] hover:bg-[#282635] text-[#F4F2F7] hover:text-[var(--accent)] text-xs font-medium border border-[#2F2D3D] transition-all duration-150 cursor-pointer active:scale-95 shrink-0"
            title="Play selected tracks"
          >
            <Play className="w-3 h-3 fill-current text-[var(--accent)]" />
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
                  <div className="flex items-center gap-1.5 text-[var(--accent)] font-semibold text-xs">
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
                    <Play className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 fill-[var(--accent)]" />
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
                    <ListPlus className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 transition-transform duration-200 group-hover:scale-110" />
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
                    className="w-full px-2.5 py-1.5 rounded-lg text-left text-[var(--accent)] hover:bg-[var(--accent-muted)] active:scale-[0.98] transition-all duration-200 flex items-center gap-2 cursor-pointer text-xs font-semibold"
                  >
                    <Plus className="w-3 h-3 text-[var(--accent)]" />
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
                          <Plus className="w-3 h-3 text-[#65616F] group-hover:text-[var(--accent)] shrink-0" />
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
                      <Pause className="w-3.5 h-3.5 text-[var(--accent)] shrink-0" />
                    ) : (
                      <Play className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 fill-[var(--accent)]" />
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
                    <ListPlus className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 transition-transform duration-200 group-hover:scale-110" />
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
                    className="w-full px-2.5 py-1.5 rounded-lg text-left text-[var(--accent)] hover:bg-[var(--accent-muted)] active:scale-[0.98] transition-all duration-200 flex items-center gap-2 cursor-pointer text-xs font-semibold"
                  >
                    <Plus className="w-3 h-3 text-[var(--accent)]" />
                    <span className="truncate">New Playlist...</span>
                  </button>

                  {/* Create Playlist for Artist */}
                  {contextMenu.track.artist && (
                    <button
                      type="button"
                      onClick={() => {
                        const artistName = contextMenu.track.artist?.trim() || 'Unknown Artist';
                        const artistTrackIds = getArtistPlaylistTrackIds(tracks, artistName);
                        const artistColor = getTrackColor(artistName, 'Artist');
                        createPlaylist(
                          artistName,
                          `Complete collection of ${artistTrackIds.length} songs including ${artistName}`,
                          artistTrackIds,
                          artistColor.bg
                        );
                        setContextMenu(null);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg text-left text-[#AAA6B2] hover:text-[var(--accent)] hover:bg-[var(--accent-muted)] active:scale-[0.98] transition-all duration-200 flex items-center gap-2 cursor-pointer text-xs font-medium"
                      title={`Create playlist containing all songs including ${contextMenu.track.artist}`}
                    >
                      <Mic2 className="w-3 h-3 text-[var(--accent)]" />
                      <span className="truncate">Playlist for "{cleanArtistName(contextMenu.track.artist)}"</span>
                    </button>
                  )}

                  {/* Create Playlist for Album */}
                  {!isJunkAlbumName(contextMenu.track.album) && (
                    <button
                      type="button"
                      onClick={() => {
                        const albumName = resolveTrackAlbumName(contextMenu.track);
                        const albumTracks = tracks.filter((t) => resolveTrackAlbumName(t).toLowerCase() === albumName.toLowerCase());
                        const albumColor = getTrackColor(albumName, contextMenu.track.artist || 'Album');
                        createPlaylist(
                          albumName,
                          `Album • ${albumTracks.length} tracks`,
                          albumTracks.map((t) => t.id),
                          albumColor.bg
                        );
                        setContextMenu(null);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-lg text-left text-[#AAA6B2] hover:text-[var(--accent)] hover:bg-[var(--accent-muted)] active:scale-[0.98] transition-all duration-200 flex items-center gap-2 cursor-pointer text-xs font-medium"
                      title={`Create playlist for album "${contextMenu.track.album}"`}
                    >
                      <Disc3 className="w-3 h-3 text-[var(--accent)]" />
                      <span className="truncate">Playlist for "{contextMenu.track.album}"</span>
                    </button>
                  )}

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
                          <Plus className="w-3 h-3 text-[#65616F] group-hover:text-[var(--accent)] shrink-0" />
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

                {/* Edit Tags & Art */}
                <div className="border-t border-[#25232F] my-1 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const track = contextMenu.track;
                      setContextMenu(null);
                      setTrackToEditTags(track);
                    }}
                    className="w-full px-2.5 py-1.5 rounded-lg text-left text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#1E1D26] active:scale-[0.98] transition-all duration-200 flex items-center justify-between cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Pencil className="w-3.5 h-3.5 text-[var(--accent)] shrink-0 transition-transform duration-200 group-hover:scale-110" />
                      <span className="truncate">Edit Tags & Art...</span>
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

      {/* Edit Track Tags Modal */}
      <EditTrackTagsModal
        track={trackToEditTags}
        isOpen={!!trackToEditTags}
        onClose={() => setTrackToEditTags(null)}
        onSave={(updated) => {
          updateTrackMetadata(updated);
          setTrackToEditTags(null);
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
                  <ListPlus className="w-4 h-4 text-[var(--accent)]" />
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
                  } border text-xs text-[#F4F2F7] placeholder-[#65616F] focus:outline-none focus:border-[var(--accent)]/50 transition-colors`}
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
                  } border text-xs text-[#F4F2F7] placeholder-[#65616F] focus:outline-none focus:border-[var(--accent)]/50 transition-colors`}
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
                  className="px-4 py-2 rounded-xl bg-[var(--accent)] hover:opacity-90 disabled:opacity-50 text-[var(--accent-contrast,#000000)] font-semibold text-xs shadow-md transition-all duration-200 active:scale-95 cursor-pointer"
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
