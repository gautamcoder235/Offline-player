import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  X,
  Play,
  Pause,
  Loader2,
  Copy,
  Download,
  Music2,
  AlertCircle,
  RefreshCw,
  Globe,
  CheckCircle2,
  Check,
  Minus,
  ListPlus,
  ListMusic,
  Plus,
  ChevronUp,
  Clock,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayer, ONLINE_STREAM_CACHE, resolveOnlineStream } from '../context/PlayerContext';
import { audioEngine } from '../services/audioEngine';
import { Track, OnlineSearchResult, DownloadLogEvent } from '../types';

type SearchState = 'idle' | 'loading' | 'results' | 'empty' | 'error';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (!ms || isNaN(ms)) return '--:--';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function getUserCountry(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (tz.includes('Calcutta') || tz.includes('Kolkata') || tz.includes('India')) return 'IN';
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || navigator.language || '';
    const match = locale.match(/[-_]([A-Za-z]{2})\b/);
    if (match) return match[1].toUpperCase();
  } catch {}
  return 'US';
}

function buildSpotifySearchUrl(trackName: string, artistName: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(trackName + ' ' + artistName)}`;
}

const NORMALIZE_CACHE = new Map<string, string>();

function normalizeSearchText(str: string): string {
  if (!str) return '';
  const cached = NORMALIZE_CACHE.get(str);
  if (cached !== undefined) return cached;
  const res = str
    .toLowerCase()
    .replace(/\(\s*(?:feat\.?|ft\.?)[^)]*\)/gi, '')
    .replace(/\[\s*(?:feat\.?|ft\.?)[^\]]*\]/gi, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (NORMALIZE_CACHE.size > 3000) {
    NORMALIZE_CACHE.clear();
  }
  NORMALIZE_CACHE.set(str, res);
  return res;
}

const DEFAULT_TOP_HITS_QUERY = 'Top Hits';

const QUICK_SEARCH_CHIPS = [
  { label: 'Top Hits', query: 'Top Hits' },
  { label: 'The Weeknd', query: 'The Weeknd' },
  { label: 'Billie Eilish', query: 'Billie Eilish' },
  { label: 'Taylor Swift', query: 'Taylor Swift' },
  { label: 'Lo-Fi Chill', query: 'Lofi hip hop beats' },
  { label: 'Electronic', query: 'Electronic Dance' },
  { label: 'Rock Classics', query: 'Rock classics' },
  { label: 'Hip-Hop', query: 'Hip Hop Billboard' },
];

const PRESET_COLORS = [
  '#19E6A0', // Emerald Mint
  '#00F2FE', // Electric Cyan
  '#FF007F', // Neon Magenta
  '#9D4EDD', // Electric Purple
  '#E8C77A', // Champagne Gold
  '#FF7A00', // Sunset Coral
];

// ─── Memoized Search Result Row Components ────────────────────────────────────

interface QuickSongRowProps {
  track: OnlineSearchResult;
  index: number;
  isPlayingThis: boolean;
  isResolving: boolean;
  inLib: boolean;
  isDl: boolean;
  onPlay: (track: OnlineSearchResult, index: number) => void;
  onDownload: (track: OnlineSearchResult) => void;
  onPrefetch?: (track: OnlineSearchResult) => void;
}

const QuickSongRow = React.memo<QuickSongRowProps>(({
  track,
  index,
  isPlayingThis,
  isResolving,
  inLib,
  isDl,
  onPlay,
  onDownload,
  onPrefetch,
}) => {
  return (
    <div
      id={`online-quick-row-${index}`}
      onClick={() => onPlay(track, index)}
      onMouseEnter={() => onPrefetch?.(track)}
      className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl transition-all duration-150 group cursor-pointer ${
        isPlayingThis
          ? 'bg-[var(--accent-muted)] border border-[var(--accent-border)]'
          : 'hover:bg-white/[0.04] border border-transparent'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-9 h-9 rounded-lg overflow-hidden shrink-0 bg-[#0C0B12] border border-white/[0.06] relative group/subart shadow-sm">
          {track.artwork_url ? (
            <img src={track.artwork_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <Music2 className="w-4 h-4 text-[#65616F] m-auto" />
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPlay(track, index);
            }}
            className="absolute inset-0 bg-black/60 opacity-0 group-hover/subart:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
            aria-label="Play track"
          >
            {isResolving ? (
              <Loader2 className="w-3.5 h-3.5 text-[var(--accent)] animate-spin" />
            ) : isPlayingThis ? (
              <Pause className="w-3.5 h-3.5 text-[var(--accent)] fill-current" />
            ) : (
              <Play className="w-3.5 h-3.5 text-white fill-current ml-0.5" />
            )}
          </button>
        </div>
        <div className="flex flex-col min-w-0 truncate">
          <span className={`text-xs font-semibold truncate ${isPlayingThis ? 'text-[var(--accent)]' : 'text-[#F4F2F7]'}`}>
            {track.track_name}
          </span>
          <span className="text-[11px] text-[#777381] truncate">
            {track.artist_name}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0 ml-2">
        {/* Animated Equalizer when playing */}
        {isPlayingThis ? (
          <div className="flex items-end justify-center gap-[2px] w-3.5 h-3.5">
            <span className="w-[2.5px] bg-[var(--accent)] rounded-full anim-bar-1" />
            <span className="w-[2.5px] bg-[var(--accent)] rounded-full anim-bar-2" />
            <span className="w-[2.5px] bg-[var(--accent)] rounded-full anim-bar-3" />
          </div>
        ) : (
          <span className="text-[11px] font-mono tabular-nums text-[#65616F]">
            {formatDuration(track.duration_ms)}
          </span>
        )}

        {/* Download Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!inLib && !isDl) onDownload(track);
          }}
          disabled={inLib || isDl}
          className={`w-7 h-7 flex items-center justify-center rounded-lg text-xs font-medium transition-all active:scale-90 cursor-pointer ${
            inLib
              ? 'text-[var(--accent)] bg-[var(--accent-muted)] cursor-default'
              : isDl
              ? 'text-[#AAA6B2] cursor-wait'
              : 'text-[#65616F] hover:text-[var(--accent)] hover:bg-white/[0.06]'
          }`}
          title={inLib ? 'Already downloaded in library' : 'Download song locally'}
          aria-label="Download song"
        >
          {isDl ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
          ) : inLib ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)]" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  );
});

interface SearchResultRowProps {
  track: OnlineSearchResult;
  idx: number;
  isSelected: boolean;
  isPlayingThis: boolean;
  isResolving: boolean;
  inLib: boolean;
  isDl: boolean;
  isQueued: boolean;
  isCopied: boolean;
  downloadProgress?: number;
  hasMultiSelection: boolean;
  onRowClick: (index: number, e: React.MouseEvent) => void;
  onToggleSelection: (index: number) => void;
  onPlay: (track: OnlineSearchResult, index: number) => void;
  onDownload: (track: OnlineSearchResult) => void;
  onCopyLink: (track: OnlineSearchResult) => void;
  onPrefetch?: (track: OnlineSearchResult) => void;
}

const SearchResultRow = React.memo<SearchResultRowProps>(({
  track,
  idx,
  isSelected,
  isPlayingThis,
  isResolving,
  inLib,
  isDl,
  isQueued,
  isCopied,
  downloadProgress,
  hasMultiSelection,
  onRowClick,
  onToggleSelection,
  onPlay,
  onDownload,
  onCopyLink,
  onPrefetch,
}) => {
  return (
    <div
      id={`online-track-row-${idx}`}
      onClick={(e) => onRowClick(idx, e)}
      onMouseEnter={() => onPrefetch?.(track)}
      className={`grid grid-cols-[40px_minmax(0,1fr)_60px_68px] md:grid-cols-[40px_minmax(0,2.5fr)_minmax(0,1.5fr)_60px_68px] gap-2 items-center px-3 h-[46px] rounded-xl transition-all duration-150 group cursor-pointer ${
        isSelected
          ? isPlayingThis
            ? 'bg-[var(--accent-muted)] border border-[var(--accent)] shadow-[0_0_14px_var(--accent-glow)] text-[#F4F2F7]'
            : 'bg-[var(--accent-muted)] border border-[var(--accent-border)] shadow-[0_0_10px_var(--accent-glow)] text-[#F4F2F7]'
          : isPlayingThis
          ? 'bg-[#19181F] border border-[var(--accent)]/50 shadow-[0_0_14px_var(--accent-glow)] text-[#F4F2F7]'
          : 'border border-transparent hover:bg-[#1D1C23] hover:border-[#292731]/50 text-[#9A96A5]'
      }`}
    >
      {/* Col 1: Index Number / Checkbox / Play button / Dancing Equalizer */}
      <div className="text-center relative flex items-center justify-center w-full">
        {isSelected ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleSelection(idx);
            }}
            className="w-4 h-4 rounded-md bg-[var(--accent)] text-[var(--accent-contrast,#000000)] flex items-center justify-center mx-auto shadow-sm cursor-pointer transition-transform duration-150 hover:scale-110 active:scale-90"
            title="Selected (Click to deselect)"
            aria-label="Deselect track"
          >
            <Check className="w-3 h-3 stroke-[3]" />
          </button>
        ) : isResolving ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)] mx-auto" />
        ) : isPlayingThis ? (
          <>
            <div className="group-hover:hidden flex items-end justify-center gap-[2px] w-3.5 h-3.5 mx-auto">
              <span className="w-[2.5px] bg-[var(--accent)] rounded-full anim-bar-1" />
              <span className="w-[2.5px] bg-[var(--accent)] rounded-full anim-bar-2" />
              <span className="w-[2.5px] bg-[var(--accent)] rounded-full anim-bar-3" />
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPlay(track, idx);
              }}
              className="hidden group-hover:inline-flex items-center justify-center w-6 h-6 rounded-full text-[var(--accent)] hover:scale-110 active:scale-90 transition-all cursor-pointer mx-auto"
              title="Pause"
              aria-label="Pause"
            >
              <Pause className="w-3.5 h-3.5 fill-current" />
            </button>
          </>
        ) : hasMultiSelection ? (
          <>
            <span className="inline-block font-mono text-[11px] group-hover:hidden text-[#65616F]">
              {String(idx + 1).padStart(2, '0')}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelection(idx);
              }}
              className="hidden group-hover:flex w-3.5 h-3.5 rounded border border-[#65616F] hover:border-[var(--accent)] hover:bg-[var(--accent-muted)] items-center justify-center mx-auto shadow-sm cursor-pointer transition-all duration-150 active:scale-90"
              title="Select track"
              aria-label="Select track"
            />
          </>
        ) : (
          <>
            <span className="inline-block font-mono text-[11px] tabular-nums group-hover:hidden text-[#65616F]">
              {String(idx + 1).padStart(2, '0')}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPlay(track, idx);
              }}
              className="hidden group-hover:inline-flex items-center justify-center w-6 h-6 rounded-full text-[#F4F2F7] hover:text-[var(--accent)] hover:scale-110 active:scale-90 transition-all cursor-pointer mx-auto"
              title="Play now"
              aria-label="Play now"
            >
              <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
            </button>
          </>
        )}
      </div>

      {/* Col 2: Cover Art + Title & Artist */}
      <div className="flex items-center gap-3 min-w-0 pr-2 pl-1">
        <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 border border-white/[0.06] bg-[#0C0B12] relative group/rowart">
          {track.artwork_url ? (
            <img src={track.artwork_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music2 className="w-3.5 h-3.5 text-[#65616F]" />
            </div>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPlay(track, idx);
            }}
            className="absolute inset-0 bg-black/60 opacity-0 group-hover/rowart:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
            title={isPlayingThis ? 'Pause' : 'Play now'}
            aria-label="Play or pause"
          >
            {isResolving ? (
              <Loader2 className="w-3 h-3 text-[var(--accent)] animate-spin" />
            ) : isPlayingThis ? (
              <Pause className="w-3 h-3 text-[var(--accent)] fill-current" />
            ) : (
              <Play className="w-3 h-3 text-white fill-current ml-0.5" />
            )}
          </button>
        </div>
        <div className="flex flex-col min-w-0">
          <span
            className={`text-xs font-semibold truncate ${
              isPlayingThis ? 'text-[var(--accent)]' : 'text-[#F4F2F7]'
            }`}
          >
            {track.track_name}
          </span>
          <span className="text-[11px] text-[#777381] truncate">
            {track.artist_name}
          </span>
        </div>
      </div>

      {/* Col 3: Album */}
      <div className="hidden md:block truncate pr-2">
        <span className="text-[11px] text-[#65616F] truncate block">
          {track.album_name}
        </span>
      </div>

      {/* Col 4: Duration */}
      <div className="text-right pr-2 shrink-0 whitespace-nowrap">
        <span className="text-[11px] font-mono tabular-nums text-[#65616F]">
          {formatDuration(track.duration_ms)}
        </span>
      </div>

      {/* Col 5: Actions (Icon-only Download + Copy Link) */}
      <div className="flex items-center justify-center gap-1 shrink-0 whitespace-nowrap">
        {/* 1-Click Download Icon Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!inLib && !isDl && !isQueued) onDownload(track);
          }}
          disabled={inLib || isDl || isQueued}
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0 ${
            inLib
              ? 'bg-[var(--accent-muted)] text-[var(--accent)] cursor-default'
              : isDl
              ? 'bg-white/[0.04] text-[var(--accent)] cursor-wait'
              : isQueued
              ? 'bg-[#E8C77A]/10 text-[#E8C77A] cursor-wait'
              : 'text-[#65616F] hover:text-[var(--accent)] hover:bg-white/[0.06]'
          }`}
          title={
            inLib
              ? 'Saved locally in library'
              : isDl
              ? (downloadProgress ? `Downloading (${downloadProgress}%)` : 'Downloading...')
              : isQueued
              ? 'Download queued'
              : `Download ${track.track_name}`
          }
          aria-label={inLib ? 'Song is already in library' : `Download ${track.track_name}`}
        >
          {isDl ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
          ) : isQueued ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#E8C77A]" />
          ) : inLib ? (
            <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)]" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Copy Spotify Search link */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCopyLink(track);
          }}
          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all cursor-pointer shrink-0 ${
            isCopied
              ? 'bg-[var(--accent-muted)] text-[var(--accent)]'
              : 'text-[#65616F] hover:text-[#F4F2F7] hover:bg-white/[0.06]'
          }`}
          title={isCopied ? 'Link copied!' : 'Copy Spotify link'}
          aria-label={`Copy Spotify link for ${track.track_name}`}
        >
          {isCopied ? (
            <Check className="w-3.5 h-3.5 text-[var(--accent)]" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
    </div>
  );
});

// ─── Main Component ─────────────────────────────────────────────────────────────

interface OnlineSearchViewProps {
  initialQuery?: string;
  onNavigateToDownloader?: (url: string) => void;
}

export const OnlineSearchView: React.FC<OnlineSearchViewProps> = ({
  initialQuery = '',
}) => {
  const {
    currentTrack,
    isPlaying,
    playTrack,
    togglePlay,
    tracks,
    refreshLibrary,
    playlists,
    createPlaylist,
    addTracksToPlaylist,
    themeAppearance,
  } = usePlayer();

  const isGlass = themeAppearance === 'aura_glass';

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<OnlineSearchResult[]>([]);
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [lastQuery, setLastQuery] = useState('');
  const [downloadDir, setDownloadDir] = useState('');

  // Downloading trackers: Map track identifier -> 'queued' | 'downloading' | 'completed' | 'failed'
  const [downloadStatuses, setDownloadStatuses] = useState<Record<string, 'queued' | 'downloading' | 'completed' | 'failed'>>({});
  const [downloadProgresses, setDownloadProgresses] = useState<Record<string, number>>({});
  const [activeDownloadTitle, setActiveDownloadTitle] = useState<string | null>(null);

  // Resolving stream URL loading tracker (for tracks without preview URL)
  const [resolvingTrackKey, setResolvingTrackKey] = useState<string | null>(null);
  const [copiedTrackKey, setCopiedTrackKey] = useState<string | null>(null);

  // Multi-selection state
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [anchorIndex, setAnchorIndex] = useState<number | null>(null);

  // Sequential batch download queue
  const batchQueueRef = useRef<OnlineSearchResult[]>([]);
  const [isBatchDownloading, setIsBatchDownloading] = useState(false);
  const isBatchDownloadingRef = useRef(false);
  isBatchDownloadingRef.current = isBatchDownloading;
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchCompletedCount, setBatchCompletedCount] = useState(0);
  const [, setBatchCurrentTrack] = useState<string | null>(null);

  // Playlist creation dropdown & modal
  const [isPlaylistDropdownOpen, setIsPlaylistDropdownOpen] = useState(false);
  const [isNewPlaylistModalOpen, setIsNewPlaylistModalOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [newPlaylistDesc, setNewPlaylistDesc] = useState('');
  const [newPlaylistColor, setNewPlaylistColor] = useState(PRESET_COLORS[0]);
  const playlistDropdownRef = useRef<HTMLDivElement>(null);

  // Search input & debouncing
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resultsRef = useRef(results);
  resultsRef.current = results;
  const selectedIndicesRef = useRef(selectedIndices);
  selectedIndicesRef.current = selectedIndices;
  const anchorIndexRef = useRef(anchorIndex);
  anchorIndexRef.current = anchorIndex;
  const downloadDirRef = useRef(downloadDir);
  downloadDirRef.current = downloadDir;
  const togglePlayRef = useRef(togglePlay);
  togglePlayRef.current = togglePlay;
  const playTrackRef = useRef(playTrack);
  playTrackRef.current = playTrack;

  // Cached default Top Hits results
  const defaultResultsRef = useRef<OnlineSearchResult[] | null>(null);
  const isLoadingDefaultRef = useRef(false);

  // Load configured download directory
  useEffect(() => {
    invoke<{ download_directory: string }>('get_settings')
      .then((s) => {
        if (s?.download_directory) setDownloadDir(s.download_directory);
      })
      .catch(console.warn);
  }, []);

  // Clear selections when results change
  useEffect(() => {
    setSelectedIndices(new Set());
    setAnchorIndex(null);
    setIsPlaylistDropdownOpen(false);
  }, [results]);

  // Click outside listener for playlist dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (playlistDropdownRef.current && !playlistDropdownRef.current.contains(e.target as Node)) {
        setIsPlaylistDropdownOpen(false);
      }
    };
    if (isPlaylistDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPlaylistDropdownOpen]);

  // Global Keyboard shortcuts: '/' or Ctrl+K to focus search, Escape to clear selection, Ctrl+A to select all
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInputFocused =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (!isInputFocused && (e.key === '/' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'))) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        return;
      }

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
        if (selectedIndices.size > 0) {
          e.preventDefault();
          setSelectedIndices(new Set());
          setAnchorIndex(null);
          return;
        }
      }

      if (isInputFocused) return;

      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyA' || e.key.toLowerCase() === 'a')) {
        if (results.length > 0) {
          e.preventDefault();
          const allIndices = new Set<number>();
          for (let i = 0; i < results.length; i++) {
            allIndices.add(i);
          }
          setSelectedIndices(allIndices);
          setAnchorIndex(0);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isNewPlaylistModalOpen, isPlaylistDropdownOpen, selectedIndices.size, results.length]);

  // Helper to convert OnlineSearchResult to playable Track with instant preview URL support
  const mapResultToTrack = useCallback((res: OnlineSearchResult, streamUrl?: string): Track => {
    return {
      id: `online_${encodeURIComponent(res.artist_name)}_${encodeURIComponent(res.track_name)}`,
      file_path: '',
      title: res.track_name,
      artist: res.artist_name,
      album: res.album_name || 'Online Music',
      duration: Math.round(res.duration_ms / 1000) || 180,
      duration_str: formatDuration(res.duration_ms),
      size_bytes: 0,
      cover_art: res.artwork_url,
      stream_url: streamUrl || res.preview_url || '',
      preview_url: res.preview_url || undefined,
      is_online: true,
    };
  }, []);

  // Memoized maps for instant O(1) library track lookup without regex on every render
  const { exactLibraryMap, titleLibraryMap } = useMemo(() => {
    const exact = new Map<string, Track>();
    const byTitle = new Map<string, Array<{ track: Track; cleanArtist: string; artistTokens: string[] }>>();

    for (const t of tracks) {
      const cleanTitle = normalizeSearchText(t.title);
      const cleanArtist = normalizeSearchText(t.artist);
      if (!cleanTitle) continue;

      const exactKey = `${cleanTitle}:::${cleanArtist}`;
      if (!exact.has(exactKey)) {
        exact.set(exactKey, t);
      }

      const artistTokens = cleanArtist
        ? t.artist.split(/\s*(?:,|&|\/|feat\.?|ft\.?)\s*/i).map(normalizeSearchText).filter(Boolean)
        : [];

      let list = byTitle.get(cleanTitle);
      if (!list) {
        list = [];
        byTitle.set(cleanTitle, list);
      }
      list.push({ track: t, cleanArtist, artistTokens });
    }

    return { exactLibraryMap: exact, titleLibraryMap: byTitle };
  }, [tracks]);

  // Helper to check if a track is in the local offline library (Instant O(1) map lookup)
  const findLibraryTrack = useCallback(
    (track: OnlineSearchResult): Track | null => {
      if (!tracks || tracks.length === 0) return null;
      const cleanTitle = normalizeSearchText(track.track_name);
      const cleanArtist = normalizeSearchText(track.artist_name);
      if (!cleanTitle) return null;

      // 1. Direct O(1) exact title + artist match
      const exactKey = `${cleanTitle}:::${cleanArtist}`;
      const exactMatch = exactLibraryMap.get(exactKey);
      if (exactMatch) return exactMatch;

      // 2. O(1) Title lookup with small candidate list for token/fuzzy artist match
      const candidates = titleLibraryMap.get(cleanTitle);
      if (!candidates || candidates.length === 0) return null;

      if (!cleanArtist) {
        return candidates[0].track;
      }

      const targetTokens = track.artist_name.split(/\s*(?:,|&|\/|feat\.?|ft\.?)\s*/i).map(normalizeSearchText).filter(Boolean);

      for (const cand of candidates) {
        if (!cand.cleanArtist || cand.cleanArtist === cleanArtist) {
          return cand.track;
        }
        if (
          cand.artistTokens.some((tok) => tok && cleanArtist.includes(tok)) ||
          targetTokens.some((tok) => tok && cand.cleanArtist.includes(tok))
        ) {
          return cand.track;
        }
      }

      return null;
    },
    [tracks, exactLibraryMap, titleLibraryMap],
  );

  const isTrackInLibrary = useCallback(
    (track: OnlineSearchResult) => Boolean(findLibraryTrack(track)),
    [findLibraryTrack],
  );

  // Check if track is currently active in PlayerContext
  const isThisTrackPlaying = useCallback(
    (track: OnlineSearchResult) => {
      if (!currentTrack) return false;

      const expectedOnlineId = `online_${encodeURIComponent(track.artist_name)}_${encodeURIComponent(track.track_name)}`;

      // 1. If currentTrack is an online track, ONLY match via exact ID
      if (currentTrack.is_online || currentTrack.id.startsWith('online_')) {
        return currentTrack.id === expectedOnlineId;
      }

      // 2. If currentTrack is a local offline library track, match ONLY if findLibraryTrack(track)?.id === currentTrack.id
      const libTrack = findLibraryTrack(track);
      if (libTrack && libTrack.id === currentTrack.id) {
        return true;
      }

      return false;
    },
    [currentTrack, findLibraryTrack],
  );

  const isThisTrackPlayingRef = useRef(isThisTrackPlaying);
  isThisTrackPlayingRef.current = isThisTrackPlaying;
  const findLibraryTrackRef = useRef(findLibraryTrack);
  findLibraryTrackRef.current = findLibraryTrack;

  // Sequential batch downloader runner
  const startNextBatchItem = useCallback(async () => {
    if (batchQueueRef.current.length === 0) {
      setIsBatchDownloading(false);
      setActiveDownloadTitle(null);
      setBatchCurrentTrack(null);
      await refreshLibrary().catch(console.warn);
      return;
    }

    const nextTrack = batchQueueRef.current.shift();
    if (!nextTrack) {
      setIsBatchDownloading(false);
      return;
    }

    const key = `${nextTrack.artist_name} - ${nextTrack.track_name}`;
    setDownloadStatuses((prev) => ({ ...prev, [key]: 'downloading' }));
    setDownloadProgresses((prev) => ({ ...prev, [key]: 10 }));
    setActiveDownloadTitle(nextTrack.track_name);
    setBatchCurrentTrack(nextTrack.track_name);

    try {
      await invoke('start_download', {
        url: `${nextTrack.artist_name} - ${nextTrack.track_name}`,
        outputDir: downloadDir || undefined,
      });
    } catch (err) {
      console.error('Batch download failed for:', key, err);
      setDownloadStatuses((prev) => ({ ...prev, [key]: 'failed' }));
      setBatchCompletedCount((c) => c + 1);
      setTimeout(() => {
        startNextBatchItem();
      }, 500);
    }
  }, [downloadDir, refreshLibrary]);

  // Listen to Tauri download events in real-time
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen<DownloadLogEvent>('download://event', (e) => {
        const payload = e.payload;
        if (!payload) return;

        if (payload.title || payload.track) {
          const percent = payload.percent ?? 0;
          const normPayloadTrack = payload.track ? normalizeSearchText(payload.track) : '';
          const normPayloadFull = (payload.artist && payload.title)
            ? normalizeSearchText(`${payload.artist} - ${payload.title}`)
            : '';
          const normPayloadTitle = payload.title ? normalizeSearchText(payload.title) : '';

          const isKeyMatch = (key: string) => {
            const normKey = normalizeSearchText(key);
            if (!normKey) return false;
            if (normPayloadFull && normKey === normPayloadFull) return true;
            if (normPayloadTrack && normKey === normPayloadTrack) return true;
            // Fallback for title-only events (exact normalized title match against key's title portion)
            const keyTitlePart = normalizeSearchText(key.split(' - ').slice(1).join(' - ')) || normKey;
            if (normPayloadTitle && keyTitlePart === normPayloadTitle) return true;
            return false;
          };

          setDownloadStatuses((prev) => {
            const next = { ...prev };
            for (const key of Object.keys(next)) {
              if (isKeyMatch(key)) {
                if (payload.type === 'track_done' || payload.status === 'completed' || payload.status === 'already_exists') {
                  next[key] = 'completed';
                } else if (payload.status === 'failed') {
                  next[key] = 'failed';
                } else {
                  next[key] = 'downloading';
                }
              }
            }
            return next;
          });

          setDownloadProgresses((prev) => {
            const next = { ...prev };
            for (const key of Object.keys(next)) {
              if (isKeyMatch(key)) {
                next[key] = percent;
              }
            }
            return next;
          });
        }

        if (payload.type === 'completed' || payload.status === 'completed' || payload.status === 'already_exists') {
          if (isBatchDownloadingRef.current && batchQueueRef.current.length > 0) {
            setBatchCompletedCount((c) => c + 1);
            setTimeout(() => {
              startNextBatchItem();
            }, 600);
          } else if (isBatchDownloadingRef.current && batchQueueRef.current.length === 0) {
            setBatchCompletedCount((c) => c + 1);
            setIsBatchDownloading(false);
            setActiveDownloadTitle(null);
            setBatchCurrentTrack(null);
            refreshLibrary().catch(console.warn);
          } else {
            setActiveDownloadTitle(null);
            refreshLibrary().catch(console.warn);
          }
        } else if (payload.status === 'failed') {
          if (isBatchDownloadingRef.current && batchQueueRef.current.length > 0) {
            setBatchCompletedCount((c) => c + 1);
            setTimeout(() => {
              startNextBatchItem();
            }, 600);
          } else if (isBatchDownloadingRef.current) {
            setIsBatchDownloading(false);
            setActiveDownloadTitle(null);
            setBatchCurrentTrack(null);
          }
        }
      });
    };

    setupListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, [refreshLibrary, startNextBatchItem]);

  // Search logic
  const performSearch = useCallback(async (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setResults([]);
      setSearchState('idle');
      return;
    }

    setSearchState('loading');
    setErrorMsg('');
    setLastQuery(trimmed);

    try {
      const data = await invoke<OnlineSearchResult[]>('search_spotify', {
        query: trimmed,
        limit: 40,
        country: getUserCountry(),
      });

      if (data && data.length > 0) {
        setResults(data);
        setSearchState('results');
      } else {
        setResults([]);
        setSearchState('empty');
      }
    } catch (err) {
      setResults([]);
      setErrorMsg(String(err));
      setSearchState('error');
    }
  }, []);

  // Load default Top Hits results (while keeping search bar input empty)
  const loadDefaultTopHits = useCallback(async () => {
    if (defaultResultsRef.current && defaultResultsRef.current.length > 0) {
      setResults(defaultResultsRef.current);
      setSearchState('results');
      setLastQuery(DEFAULT_TOP_HITS_QUERY);
      return;
    }

    if (isLoadingDefaultRef.current) return;
    isLoadingDefaultRef.current = true;
    setSearchState('loading');
    setErrorMsg('');

    try {
      const data = await invoke<OnlineSearchResult[]>('search_spotify', {
        query: DEFAULT_TOP_HITS_QUERY,
        limit: 40,
        country: getUserCountry(),
      });

      if (data && data.length > 0) {
        defaultResultsRef.current = data;
        setResults(data);
        setSearchState('results');
        setLastQuery(DEFAULT_TOP_HITS_QUERY);
      } else {
        setResults([]);
        setSearchState('empty');
      }
    } catch (err) {
      console.warn('Failed to load default Top Hits:', err);
      setResults([]);
      setErrorMsg(String(err));
      setSearchState('error');
    } finally {
      isLoadingDefaultRef.current = false;
    }
  }, []);

  // Sync initial query: If initialQuery is provided, search it; otherwise show Top Hits with clear search bar
  useEffect(() => {
    if (initialQuery.trim()) {
      setQuery(initialQuery);
      performSearch(initialQuery);
    } else {
      setQuery('');
      loadDefaultTopHits();
    }
  }, [initialQuery, performSearch, loadDefaultTopHits]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setQuery(val);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (!val.trim()) {
        if (defaultResultsRef.current && defaultResultsRef.current.length > 0) {
          setResults(defaultResultsRef.current);
          setSearchState('results');
          setLastQuery(DEFAULT_TOP_HITS_QUERY);
        } else {
          loadDefaultTopHits();
        }
        return;
      }

      debounceRef.current = setTimeout(() => {
        performSearch(val);
      }, 350);
    },
    [performSearch, loadDefaultTopHits],
  );

  const handleClear = useCallback(() => {
    setQuery('');
    setLastQuery(DEFAULT_TOP_HITS_QUERY);
    if (defaultResultsRef.current && defaultResultsRef.current.length > 0) {
      setResults(defaultResultsRef.current);
      setSearchState('results');
    } else {
      loadDefaultTopHits();
    }
    inputRef.current?.focus();
  }, [loadDefaultTopHits]);

  const handleChipClick = (chipQuery: string, chipLabel: string) => {
    if (chipLabel === 'Top Hits') {
      setQuery('');
      if (defaultResultsRef.current && defaultResultsRef.current.length > 0) {
        setResults(defaultResultsRef.current);
        setSearchState('results');
        setLastQuery(DEFAULT_TOP_HITS_QUERY);
      } else {
        loadDefaultTopHits();
      }
    } else {
      setQuery(chipQuery);
      performSearch(chipQuery);
    }
  };

  // ── 1-Click Download Handler ───────────────────────────────────────────────

  const handleDownloadTrack = useCallback(
    async (track: OnlineSearchResult) => {
      const key = `${track.artist_name} - ${track.track_name}`;
      setDownloadStatuses((prev) => ({ ...prev, [key]: 'downloading' }));
      setDownloadProgresses((prev) => ({ ...prev, [key]: 10 }));
      setActiveDownloadTitle(track.track_name);

      try {
        await invoke('start_download', {
          url: `${track.artist_name} - ${track.track_name}`,
          outputDir: downloadDirRef.current || undefined,
        });
      } catch (err) {
        console.error('Failed to start download:', err);
        setDownloadStatuses((prev) => ({ ...prev, [key]: 'failed' }));
        setActiveDownloadTitle(null);
      }
    },
    [],
  );

  // Fast stream prefetching on row hover for 0ms instant click-to-play
  const handlePrefetchStream = useCallback((track: OnlineSearchResult) => {
    const cacheKey = `${track.artist_name.trim().toLowerCase()} - ${track.track_name.trim().toLowerCase()}`;
    if (!ONLINE_STREAM_CACHE.has(cacheKey)) {
      resolveOnlineStream(track.track_name, track.artist_name).catch(() => {});
    }
  }, []);

  // Background stream warming for top 2 results when search finishes
  useEffect(() => {
    if (results.length > 0) {
      for (let i = 0; i < Math.min(2, results.length); i++) {
        const item = results[i];
        const key = `${item.artist_name.trim().toLowerCase()} - ${item.track_name.trim().toLowerCase()}`;
        if (!ONLINE_STREAM_CACHE.has(key)) {
          resolveOnlineStream(item.track_name, item.artist_name).catch(() => {});
        }
      }
    }
  }, [results]);

  // Listen for scroll-to-track to locate and flash active online song
  useEffect(() => {
    const handleScrollToTrack = (e: Event) => {
      const customEvent = e as CustomEvent<{ trackId?: string; title?: string; artist?: string }>;
      const targetTitle = customEvent.detail?.title?.trim().toLowerCase();
      const targetArtist = customEvent.detail?.artist?.trim().toLowerCase();
      if (!targetTitle) return;

      const idx = results.findIndex(
        (r) =>
          r.track_name.trim().toLowerCase() === targetTitle &&
          (!targetArtist || r.artist_name.trim().toLowerCase() === targetArtist)
      );

      if (idx !== -1) {
        setTimeout(() => {
          const el = document.getElementById(`online-track-row-${idx}`) || document.getElementById(`online-quick-row-${idx}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('animate-row-flash');
            setTimeout(() => el.classList.remove('animate-row-flash'), 1500);
          }
        }, 50);
      }
    };

    window.addEventListener('scroll-to-track', handleScrollToTrack);
    return () => window.removeEventListener('scroll-to-track', handleScrollToTrack);
  }, [results]);

  // ── Spotify-Style Playback (Zero Lag, Instant Playback) ─────────────────────

  const playOnlineTrack = useCallback(
    async (track: OnlineSearchResult, trackIndex: number) => {
      // 1. If this track is already playing, toggle play/pause immediately
      if (isThisTrackPlayingRef.current(track)) {
        togglePlayRef.current();
        return;
      }

      const key = `${track.artist_name} - ${track.track_name}`;
      const cacheKey = `${track.artist_name.trim().toLowerCase()} - ${track.track_name.trim().toLowerCase()}`;

      // 2. If track is already downloaded locally, play offline file instantly!
      const libTrack = findLibraryTrackRef.current(track);
      if (libTrack) {
        const contextTracks = resultsRef.current.map((r) => {
          const matched = findLibraryTrackRef.current(r);
          return matched || mapResultToTrack(r, r.preview_url || '');
        });
        playTrackRef.current(libTrack, contextTracks, 'online_search');
        return;
      }

      // 3. Online Track Playback:
      // Check if full stream is already in cache
      let fullStream = ONLINE_STREAM_CACHE.get(cacheKey);

      const contextTracks = resultsRef.current.map((r, i) => {
        if (i === trackIndex) {
          const streamUrl = fullStream || r.preview_url || '';
          return mapResultToTrack(r, streamUrl);
        }
        const matched = findLibraryTrackRef.current(r);
        return matched || mapResultToTrack(r, r.preview_url || '');
      });

      if (fullStream) {
        const onlineTrack = mapResultToTrack(track, fullStream);
        try {
          await playTrackRef.current(onlineTrack, contextTracks, 'online_search');
        } catch (err) {
          console.error('Playback failed for online track:', err);
        }
        return;
      }

      // 4. Instant 0ms Preview Playback with background full stream resolution
      if (track.preview_url) {
        const onlineTrack = mapResultToTrack(track, track.preview_url);
        // Start playing preview immediately with zero delay
        playTrackRef.current(onlineTrack, contextTracks, 'online_search').catch(console.error);

        // Resolve full stream in background and seamlessly upgrade active deck
        setResolvingTrackKey(key);
        resolveOnlineStream(track.track_name, track.artist_name)
          .then((resolvedUrl) => {
            if (resolvedUrl) {
              audioEngine.upgradeActiveStream(resolvedUrl);
            }
          })
          .catch((err) => {
            console.warn('Background stream resolution failed:', err);
          })
          .finally(() => {
            setResolvingTrackKey(null);
          });
        return;
      }

      // 5. Fallback if track has no preview URL: must wait for stream resolution
      setResolvingTrackKey(key);
      try {
        fullStream = await resolveOnlineStream(track.track_name, track.artist_name);
      } catch (err) {
        console.warn('Failed to resolve online stream:', err);
      } finally {
        setResolvingTrackKey(null);
      }

      const streamUrlToUse = fullStream || '';
      const onlineTrack = mapResultToTrack(track, streamUrlToUse);

      try {
        await playTrackRef.current(onlineTrack, contextTracks, 'online_search');
      } catch (err) {
        console.error('Playback failed for online track:', err);
      }
    },
    [mapResultToTrack],
  );

  // ── Multi-Select Logic (Matching TrackList.tsx) ─────────────────────────────

  const allSelected = results.length > 0 && selectedIndices.size === results.length;

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIndices(new Set());
      setAnchorIndex(null);
    } else {
      const all = new Set<number>();
      for (let i = 0; i < resultsRef.current.length; i++) {
        all.add(i);
      }
      setSelectedIndices(all);
      if (resultsRef.current.length > 0) setAnchorIndex(0);
    }
  }, [allSelected]);

  const toggleTrackSelection = useCallback((index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
    setAnchorIndex(index);
  }, []);

  const handleRowClick = useCallback(
    (index: number, e: React.MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('a') || target.closest('input')) {
        return;
      }

      if (e.shiftKey) {
        e.preventDefault();
        window.getSelection()?.removeAllRanges();

        const anchorIdx = anchorIndexRef.current ?? 0;
        const start = Math.min(anchorIdx, index);
        const end = Math.max(anchorIdx, index);
        const rangeIndices: number[] = [];
        for (let i = start; i <= end; i++) {
          rangeIndices.push(i);
        }

        if (e.ctrlKey || e.metaKey) {
          setSelectedIndices((prev) => {
            const next = new Set(prev);
            rangeIndices.forEach((i) => next.add(i));
            return next;
          });
        } else {
          setSelectedIndices(new Set(rangeIndices));
        }
      } else if (e.ctrlKey || e.metaKey) {
        toggleTrackSelection(index);
      } else {
        // Single click on row immediately plays the track, like Spotify desktop!
        if (selectedIndicesRef.current.size > 0) {
          setSelectedIndices(new Set());
        }
        setAnchorIndex(index);
        const targetTrack = resultsRef.current[index];
        if (targetTrack) {
          playOnlineTrack(targetTrack, index);
        }
      }
    },
    [toggleTrackSelection, playOnlineTrack],
  );

  // ── Batch Actions ─────────────────────────────────────────────────────────

  const handleBatchDownload = useCallback(() => {
    if (selectedIndices.size === 0 || isBatchDownloading) return;

    const selectedTracks = Array.from(selectedIndices)
      .sort((a, b) => a - b)
      .map((i) => results[i])
      .filter(Boolean);

    const toDownload = selectedTracks.filter((t) => {
      const key = `${t.artist_name} - ${t.track_name}`;
      const inLib = isTrackInLibrary(t) || downloadStatuses[key] === 'completed';
      return !inLib;
    });

    if (toDownload.length === 0) {
      return;
    }

    setDownloadStatuses((prev) => {
      const next = { ...prev };
      toDownload.forEach((t) => {
        const key = `${t.artist_name} - ${t.track_name}`;
        next[key] = 'queued';
      });
      return next;
    });

    batchQueueRef.current = [...toDownload];
    setBatchTotal(toDownload.length);
    setBatchCompletedCount(0);
    setIsBatchDownloading(true);

    startNextBatchItem();
  }, [selectedIndices, isBatchDownloading, results, isTrackInLibrary, downloadStatuses, startNextBatchItem]);

  const handleCreatePlaylistSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const name = newPlaylistName.trim();
      if (!name) return;

      const selectedTracks = Array.from(selectedIndices)
        .sort((a, b) => a - b)
        .map((i) => results[i])
        .filter(Boolean);

      const matchedIds: string[] = [];
      const needsDownload: OnlineSearchResult[] = [];

      selectedTracks.forEach((t) => {
        const libTrack = findLibraryTrack(t);
        if (libTrack) {
          matchedIds.push(libTrack.id);
        } else {
          needsDownload.push(t);
        }
      });

      createPlaylist(name, newPlaylistDesc.trim() || undefined, matchedIds, newPlaylistColor);

      if (needsDownload.length > 0) {
        batchQueueRef.current = [...batchQueueRef.current, ...needsDownload];
        setBatchTotal((prev) => prev + needsDownload.length);
        setIsBatchDownloading(true);
        startNextBatchItem();
      }

      setIsNewPlaylistModalOpen(false);
      setNewPlaylistName('');
      setNewPlaylistDesc('');
      setSelectedIndices(new Set());
      setAnchorIndex(null);
    },
    [
      newPlaylistName,
      newPlaylistDesc,
      newPlaylistColor,
      selectedIndices,
      results,
      findLibraryTrack,
      createPlaylist,
      startNextBatchItem,
    ],
  );

  const handleBatchAddToExistingPlaylist = useCallback(
    (playlistId: string) => {
      const selectedTracks = Array.from(selectedIndices)
        .sort((a, b) => a - b)
        .map((i) => results[i])
        .filter(Boolean);

      const matchedIds: string[] = [];
      const needsDownload: OnlineSearchResult[] = [];

      selectedTracks.forEach((t) => {
        const libTrack = findLibraryTrack(t);
        if (libTrack) {
          matchedIds.push(libTrack.id);
        } else {
          needsDownload.push(t);
        }
      });

      if (matchedIds.length > 0) {
        addTracksToPlaylist(playlistId, matchedIds);
      }

      if (needsDownload.length > 0) {
        batchQueueRef.current = [...batchQueueRef.current, ...needsDownload];
        setBatchTotal((prev) => prev + needsDownload.length);
        setIsBatchDownloading(true);
        startNextBatchItem();
      }

      setIsPlaylistDropdownOpen(false);
      setSelectedIndices(new Set());
      setAnchorIndex(null);
    },
    [selectedIndices, results, findLibraryTrack, addTracksToPlaylist, startNextBatchItem],
  );

  const handleCopyLink = useCallback(async (track: OnlineSearchResult) => {
    const key = `${track.artist_name} - ${track.track_name}`;
    const url = buildSpotifySearchUrl(track.track_name, track.artist_name);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedTrackKey(key);
      setTimeout(() => setCopiedTrackKey(null), 2200);
    } catch {
      console.warn('Could not copy to clipboard');
    }
  }, []);

  // Top result (rank #1) and remaining tracks
  const topResult = results.length > 0 ? results[0] : null;
  const remainingTracks = useMemo(() => (results.length > 1 ? results.slice(1) : []), [results]);

  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-hidden select-none bg-transparent relative">
      <style>{`
        @keyframes musicBar1 {
          0%, 100% { height: 4px; }
          50% { height: 14px; }
        }
        @keyframes musicBar2 {
          0%, 100% { height: 14px; }
          50% { height: 5px; }
        }
        @keyframes musicBar3 {
          0%, 100% { height: 8px; }
          50% { height: 15px; }
        }
        .anim-bar-1 { animation: musicBar1 0.75s ease-in-out infinite; }
        .anim-bar-2 { animation: musicBar2 1.05s ease-in-out infinite 0.15s; }
        .anim-bar-3 { animation: musicBar3 0.85s ease-in-out infinite 0.3s; }
      `}</style>

      {/* Search Input & Quick Discovery Chips */}
      <div className="px-6 pt-5 pb-3 flex flex-col gap-3 shrink-0">
        <div className="relative flex items-center bg-[#121118]/80 backdrop-blur-xl rounded-xl border border-white/[0.08] focus-within:border-[var(--accent)]/50 focus-within:ring-2 focus-within:ring-[var(--accent)]/15 transition-all h-[44px] shadow-[0_4px_24px_rgba(0,0,0,0.35)]">
          <Search className="w-4 h-4 ml-3.5 text-[#65616F] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            placeholder="Search songs, artists, or albums to stream or download..."
            className="w-full pl-3 pr-24 h-full text-xs bg-transparent text-[#F4F2F7] placeholder-[#65616F] focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && query.trim()) {
                performSearch(query);
              } else if (e.key === 'Escape' && query) {
                e.stopPropagation();
                handleClear();
              }
            }}
          />

          {/* Quick Keyboard Shortcut / Clear Action */}
          <div className="absolute right-2.5 flex items-center gap-1.5">
            {activeDownloadTitle && (
              <span className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium text-[var(--accent)] bg-[var(--accent-muted)] border border-[var(--accent-border)] px-2.5 py-0.5 rounded-full mr-1 animate-in fade-in">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="truncate max-w-[140px]">{activeDownloadTitle}</span>
              </span>
            )}
            {!query && (
              <kbd className="hidden md:inline-flex items-center px-2 py-0.5 text-[10px] font-mono text-[#65616F] bg-white/[0.03] border border-white/[0.06] rounded-md pointer-events-none select-none">
                / to search
              </kbd>
            )}
            <AnimatePresence>
              {query && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  transition={{ duration: 0.12 }}
                  type="button"
                  onClick={handleClear}
                  className="p-1.5 rounded-lg text-[#777381] hover:text-[#F4F2F7] hover:bg-white/[0.06] transition-all duration-150 active:scale-90 cursor-pointer"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Quick Discovery Tags (Chips) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5 pb-0.5 text-xs">
          {QUICK_SEARCH_CHIPS.map((chip, idx) => {
            const isChipActive = query.trim()
              ? query.toLowerCase() === chip.query.toLowerCase()
              : chip.label === 'Top Hits';

            return (
              <button
                key={idx}
                type="button"
                onClick={() => handleChipClick(chip.query, chip.label)}
                className={`px-3 py-1 rounded-xl text-[11px] font-medium transition-all duration-150 active:scale-95 cursor-pointer shrink-0 border ${
                  isChipActive
                    ? 'bg-[var(--accent-muted)] text-[var(--accent)] border-[var(--accent-border)] shadow-sm'
                    : 'bg-white/[0.03] hover:bg-white/[0.07] text-[#AAA6B2] hover:text-[#F4F2F7] border-white/[0.06]'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Results / Idle View */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {/* ── Idle State ──── */}
        {searchState === 'idle' && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 select-none">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="flex flex-col items-center max-w-md"
            >
              <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-3">
                <Globe className="w-6 h-6 text-[var(--accent)]" />
              </div>
              <h3 className="text-sm font-semibold text-[#8E8A98]">
                Search & Stream Any Song Instantly
              </h3>
            </motion.div>
          </div>
        )}

        {/* ── Skeleton Loading State (ui-ux-pro-max: Avoid CLS with modern pulse layout) ──── */}
        {searchState === 'loading' && (
          <div className="flex-1 min-h-0 overflow-hidden px-6 md:px-8 pt-2 animate-pulse select-none">
            {/* Top Result + Quick Songs Skeleton */}
            <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 mb-6">
              <div className="flex flex-col gap-2">
                <div className="w-20 h-3 bg-white/[0.04] rounded" />
                <div className="p-5 rounded-2xl bg-[#121118]/70 border border-white/[0.06] min-h-[220px] flex flex-col justify-between">
                  <div className="flex items-start gap-4">
                    <div className="w-24 h-24 rounded-xl bg-white/[0.06] shrink-0" />
                    <div className="flex-1 flex flex-col gap-2 pt-1">
                      <div className="w-3/4 h-4 bg-white/[0.06] rounded" />
                      <div className="w-1/2 h-3 bg-white/[0.04] rounded" />
                      <div className="w-16 h-4 bg-white/[0.04] rounded-full mt-2" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
                    <div className="w-20 h-7 bg-white/[0.04] rounded-xl" />
                    <div className="w-24 h-7 bg-white/[0.04] rounded-xl" />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <div className="w-16 h-3 bg-white/[0.04] rounded" />
                <div className="flex flex-col gap-1 p-2 rounded-2xl bg-[#121118]/70 border border-white/[0.06]">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="flex items-center justify-between px-2.5 py-2">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-9 h-9 rounded-lg bg-white/[0.06] shrink-0" />
                        <div className="flex flex-col gap-1.5 flex-1 max-w-[200px]">
                          <div className="w-full h-3.5 bg-white/[0.06] rounded" />
                          <div className="w-2/3 h-3 bg-white/[0.04] rounded" />
                        </div>
                      </div>
                      <div className="w-10 h-3 bg-white/[0.04] rounded" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Skeleton Table Rows */}
            <div className="flex flex-col gap-1.5 mt-4">
              <div className="w-20 h-3 bg-white/[0.04] rounded mb-1" />
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="grid grid-cols-[40px_minmax(0,1fr)_60px_68px] md:grid-cols-[40px_minmax(0,2.5fr)_minmax(0,1.5fr)_60px_68px] gap-2 items-center px-3 h-[46px] rounded-xl bg-white/[0.02]"
                >
                  <div className="w-3.5 h-3.5 bg-white/[0.04] rounded mx-auto" />
                  <div className="flex items-center gap-3 pr-2 pl-1">
                    <div className="w-8 h-8 rounded-lg bg-white/[0.06] shrink-0" />
                    <div className="flex-1 flex flex-col gap-1.5">
                      <div className="w-1/2 h-3.5 bg-white/[0.06] rounded" />
                      <div className="w-1/3 h-2.5 bg-white/[0.04] rounded" />
                    </div>
                  </div>
                  <div className="w-24 h-3 bg-white/[0.04] rounded hidden md:block" />
                  <div className="w-10 h-3 bg-white/[0.04] rounded ml-auto pr-2" />
                  <div className="flex items-center justify-center gap-1">
                    <div className="w-7 h-7 bg-white/[0.04] rounded-lg" />
                    <div className="w-7 h-7 bg-white/[0.04] rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Empty State ──── */}
        {searchState === 'empty' && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 select-none">
            <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-3">
              <Music2 className="w-6 h-6 text-[#65616F]" />
            </div>
            <p className="text-sm font-semibold text-[#F4F2F7]">No songs found</p>
            <p className="text-xs text-[#777381] mt-1">
              No results for "<span className="text-[#AAA6B2]">{lastQuery}</span>"
            </p>
          </div>
        )}

        {/* ── Error State ──── */}
        {searchState === 'error' && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 select-none">
            <div className="w-14 h-14 rounded-2xl bg-[#FF667A]/10 border border-[#FF667A]/20 flex items-center justify-center mb-3">
              <AlertCircle className="w-6 h-6 text-[#FF667A]" />
            </div>
            <p className="text-sm font-semibold text-[#F4F2F7]">Search error</p>
            <p className="text-xs text-[#777381] mt-1 max-w-sm">{errorMsg || 'Failed to search online music.'}</p>
            <button
              type="button"
              onClick={() => performSearch(lastQuery)}
              className="mt-4 flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[var(--accent)] hover:opacity-95 text-[var(--accent-contrast,#000000)] font-semibold text-xs transition-all active:scale-95 cursor-pointer shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* ── Results State ──── */}
        {searchState === 'results' && results.length > 0 && (
          <div className="flex-1 min-h-0 overflow-y-auto px-6 md:px-8 pb-32">
            {/* Spotify Signature: Top Result & Quick Songs Row */}
            {topResult && (
              <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 mb-6 pt-2">
                {/* Left: Top Result Highlight Card */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#65616F]">
                    Top Result
                  </span>
                  <div className="p-5 rounded-2xl bg-[#121118]/70 hover:bg-[#161520]/80 backdrop-blur-xl border border-white/[0.06] hover:border-white/[0.12] transition-all duration-200 group relative flex flex-col justify-between shadow-[0_4px_24px_rgba(0,0,0,0.35)] min-h-[220px]">
                    <div className="flex items-start gap-4">
                      {/* Cover Art */}
                      <div className="w-24 h-24 rounded-xl overflow-hidden shrink-0 bg-[#0C0B12] border border-white/[0.08] shadow-lg relative group/topart">
                        {topResult.artwork_url ? (
                          <img
                            src={topResult.artwork_url}
                            alt=""
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Music2 className="w-7 h-7 text-[#65616F]" />
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => playOnlineTrack(topResult, 0)}
                          className="absolute inset-0 bg-black/60 opacity-0 group-hover/topart:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                          title={isThisTrackPlaying(topResult) && isPlaying ? 'Pause' : 'Play now'}
                          aria-label={isThisTrackPlaying(topResult) && isPlaying ? 'Pause' : 'Play now'}
                        >
                          {resolvingTrackKey === `${topResult.artist_name} - ${topResult.track_name}` ? (
                            <Loader2 className="w-6 h-6 text-[var(--accent)] animate-spin" />
                          ) : isThisTrackPlaying(topResult) && isPlaying ? (
                            <Pause className="w-6 h-6 text-[var(--accent)] fill-current" />
                          ) : (
                            <Play className="w-6 h-6 text-white fill-current ml-0.5" />
                          )}
                        </button>
                      </div>

                      <div className="flex flex-col min-w-0 flex-1 pt-0.5">
                        <span className="text-base font-bold text-[#F4F2F7] truncate leading-snug group-hover:text-[var(--accent)] transition-colors">
                          {topResult.track_name}
                        </span>
                        <span className="text-xs text-[#AAA6B2] truncate mt-1 font-medium">
                          {topResult.artist_name}
                        </span>
                        {topResult.album_name && (
                          <span className="text-[11px] text-[#777381] truncate mt-0.5">
                            {topResult.album_name}
                          </span>
                        )}
                        {isTrackInLibrary(topResult) && (
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[10px] font-semibold bg-[var(--accent-muted)] text-[var(--accent)] border border-[var(--accent-border)] px-2 py-0.5 rounded-full flex items-center gap-1">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              <span>In Library</span>
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom Actions inside Top Result */}
                    <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-white/[0.06]">
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => playOnlineTrack(topResult, 0)}
                          className="w-10 h-10 rounded-full bg-[var(--accent)] hover:opacity-95 text-[var(--accent-contrast,#000000)] shadow-[0_4px_16px_var(--accent-glow)] hover:scale-105 active:scale-95 transition-all flex items-center justify-center shrink-0 cursor-pointer"
                          title={isThisTrackPlaying(topResult) && isPlaying ? 'Pause' : 'Play now'}
                          aria-label={isThisTrackPlaying(topResult) && isPlaying ? 'Pause song' : 'Play song'}
                        >
                          {resolvingTrackKey === `${topResult.artist_name} - ${topResult.track_name}` ? (
                            <Loader2 className="w-4 h-4 text-black animate-spin" />
                          ) : isThisTrackPlaying(topResult) && isPlaying ? (
                            <Pause className="w-4 h-4 fill-current" />
                          ) : (
                            <Play className="w-4 h-4 fill-current ml-0.5" />
                          )}
                        </button>

                        <div className="flex flex-col">
                          <span className="text-xs font-semibold text-[#F4F2F7]">
                            {isThisTrackPlaying(topResult) && isPlaying ? 'Now Playing' : 'Play Track'}
                          </span>
                          <span className="text-[11px] font-mono tabular-nums text-[#65616F]">
                            {formatDuration(topResult.duration_ms)}
                          </span>
                        </div>
                      </div>

                      {/* Download Button on Top Result */}
                      {(() => {
                        const key = `${topResult.artist_name} - ${topResult.track_name}`;
                        const inLib = isTrackInLibrary(topResult) || downloadStatuses[key] === 'completed';
                        const isDl = downloadStatuses[key] === 'downloading';

                        return (
                          <button
                            type="button"
                            onClick={() => !inLib && !isDl && handleDownloadTrack(topResult)}
                            disabled={inLib || isDl}
                            className={`min-h-[34px] flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all active:scale-95 ${
                              inLib
                                ? 'bg-[var(--accent-muted)] text-[var(--accent)] border border-[var(--accent-border)] cursor-default'
                                : isDl
                                ? 'bg-white/[0.04] text-[var(--accent)] border border-white/[0.06] cursor-wait'
                                : 'bg-white/[0.04] hover:bg-[var(--accent)] text-[#AAA6B2] hover:text-[var(--accent-contrast,#000000)] border border-white/[0.06] hover:border-[var(--accent)] cursor-pointer shadow-sm'
                            }`}
                          >
                            {isDl ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--accent)]" />
                                <span>{downloadProgresses[key] ? `${downloadProgresses[key]}%` : 'Saving'}</span>
                              </>
                            ) : inLib ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent)]" />
                                <span>In Library</span>
                              </>
                            ) : (
                              <>
                                <Download className="w-3.5 h-3.5" />
                                <span>Download</span>
                              </>
                            )}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Right: Quick Next 4 Songs */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#65616F]">
                    Songs
                  </span>
                  <div className="flex flex-col gap-0.5 rounded-2xl bg-[#121118]/70 backdrop-blur-xl border border-white/[0.06] p-2 shadow-[0_4px_24px_rgba(0,0,0,0.35)]">
                    {results.slice(0, 4).map((track, i) => {
                      const isPlayingThis = isThisTrackPlaying(track) && isPlaying;
                      const isResolving = resolvingTrackKey === `${track.artist_name} - ${track.track_name}`;
                      const key = `${track.artist_name} - ${track.track_name}`;
                      const inLib = isTrackInLibrary(track) || downloadStatuses[key] === 'completed';
                      const isDl = downloadStatuses[key] === 'downloading';

                      return (
                        <QuickSongRow
                          key={i}
                          track={track}
                          index={i}
                          isPlayingThis={isPlayingThis}
                          isResolving={isResolving}
                          inLib={inLib}
                          isDl={isDl}
                          onPlay={playOnlineTrack}
                          onDownload={handleDownloadTrack}
                          onPrefetch={handlePrefetchStream}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* All Remaining Songs Table */}
            {remainingTracks.length > 0 && (
              <div className="flex flex-col mt-4">
                <div className="flex items-center justify-between pb-2 mb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-[#65616F]">
                    All Results
                  </span>
                  <span className="text-[11px] font-mono tabular-nums text-[#65616F]">
                    {results.length} songs
                  </span>
                </div>

                {/* Table Header matching TrackList.tsx with Select All Checkbox */}
                <div className="grid grid-cols-[40px_minmax(0,1fr)_60px_68px] md:grid-cols-[40px_minmax(0,2.5fr)_minmax(0,1.5fr)_60px_68px] gap-2 items-center px-3 pb-2.5 border-b border-[#292731]/40 text-[#65616F] uppercase tracking-wider font-semibold text-[10px]">
                  {/* Select All Checkbox */}
                  <div className="text-center flex items-center justify-center">
                    {selectedIndices.size > 0 ? (
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
                        onClick={toggleSelectAll}
                        className="group/select-header w-4 h-4 flex items-center justify-center mx-auto cursor-pointer"
                        title="Select all (Ctrl+A)"
                        aria-label="Select all"
                      >
                        <span className="font-mono text-[10px] text-[#65616F] group-hover/select-header:hidden">#</span>
                        <div className="hidden group-hover/select-header:flex w-3.5 h-3.5 rounded border border-[#65616F] hover:border-[var(--accent)] items-center justify-center transition-colors" />
                      </button>
                    )}
                  </div>
                  <div className="pl-1">Title & Artist</div>
                  <div className="hidden md:block">Album</div>
                  <div className="text-right pr-2">
                    <Clock className="w-3 h-3 inline-block text-[#65616F]" />
                  </div>
                  <div className="text-center"></div>
                </div>

                {/* Rows matching TrackList.tsx */}
                <div className="flex flex-col gap-1 pt-1.5">
                  {results.map((track, idx) => {
                    const isSelected = selectedIndices.has(idx);
                    const isPlayingThis = isThisTrackPlaying(track) && isPlaying;
                    const isResolving = resolvingTrackKey === `${track.artist_name} - ${track.track_name}`;
                    const key = `${track.artist_name} - ${track.track_name}`;
                    const inLib = isTrackInLibrary(track) || downloadStatuses[key] === 'completed';
                    const isDl = downloadStatuses[key] === 'downloading';
                    const isQueued = downloadStatuses[key] === 'queued';
                    const isCopied = copiedTrackKey === key;

                    return (
                      <SearchResultRow
                        key={idx}
                        track={track}
                        idx={idx}
                        isSelected={isSelected}
                        isPlayingThis={isPlayingThis}
                        isResolving={isResolving}
                        inLib={inLib}
                        isDl={isDl}
                        isQueued={isQueued}
                        isCopied={isCopied}
                        downloadProgress={downloadProgresses[key]}
                        hasMultiSelection={selectedIndices.size > 0}
                        onRowClick={handleRowClick}
                        onToggleSelection={toggleTrackSelection}
                        onPlay={playOnlineTrack}
                        onDownload={handleDownloadTrack}
                        onCopyLink={handleCopyLink}
                        onPrefetch={handlePrefetchStream}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating Multi-Select Batch Action Bar (Matching TrackList.tsx) */}
      {selectedIndices.size > 0 && (
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
              {selectedIndices.size} {selectedIndices.size === 1 ? 'song' : 'songs'} selected
            </span>
          </div>

          <div className="w-[1px] h-5 bg-[#2F2D3D] mx-0.5" />

          {/* Batch Download Button */}
          <button
            type="button"
            onClick={handleBatchDownload}
            disabled={isBatchDownloading}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 active:scale-95 cursor-pointer shrink-0 shadow-sm ${
              isBatchDownloading
                ? 'bg-[var(--accent-muted)] text-[var(--accent)] border border-[var(--accent-border)] cursor-wait'
                : 'bg-[var(--accent)] hover:opacity-95 text-[var(--accent-contrast,#000000)] font-bold shadow-[0_2px_12px_var(--accent-glow)]'
            }`}
            title="Download all selected songs locally"
          >
            {isBatchDownloading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>
                  Downloading {batchCompletedCount + 1}/{batchTotal}
                </span>
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                <span>Download Selected ({selectedIndices.size})</span>
              </>
            )}
          </button>

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

            {/* Playlist dropdown menu */}
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
                          onClick={() => handleBatchAddToExistingPlaylist(pl.id)}
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

          {/* Clear Selection Button */}
          <button
            type="button"
            onClick={() => {
              setSelectedIndices(new Set());
              setAnchorIndex(null);
            }}
            className="p-1.5 rounded-xl text-[#777381] hover:text-[#F4F2F7] hover:bg-[#1E1D26] transition-colors cursor-pointer active:scale-90 shrink-0 ml-0.5"
            title="Clear selection (Esc)"
            aria-label="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* New Playlist from Selection Modal (Matching TrackList.tsx) */}
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
                  ? 'bg-[#14131A]/85 backdrop-blur-2xl border border-white/[0.12] shadow-[0_25px_50px_rgba(0,0,0,0.9)]'
                  : 'bg-[#14131A] border border-[#292731] shadow-2xl'
              } w-full max-w-sm space-y-4 animate-in zoom-in-95 duration-200`}
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
                Creating a new playlist with {selectedIndices.size} selected{' '}
                {selectedIndices.size === 1 ? 'song' : 'songs'}.
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
                  placeholder="Selected online favorites..."
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
                  className="px-4 py-2 rounded-xl bg-[var(--accent)] hover:opacity-95 disabled:opacity-50 text-[var(--accent-contrast,#000000)] font-semibold text-xs shadow-md transition-all duration-200 active:scale-95 cursor-pointer"
                >
                  Create Playlist
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </div>
  );
};
