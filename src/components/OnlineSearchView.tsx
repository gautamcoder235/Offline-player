import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  FolderOpen,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { motion, AnimatePresence } from 'framer-motion';
import { usePlayer } from '../context/PlayerContext';
import { audioEngine } from '../services/audioEngine';
import { OnlineSearchResult, DownloadLogEvent } from '../types';

type SearchState = 'idle' | 'loading' | 'results' | 'empty' | 'error';

// ─── Helpers ────────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (!ms || isNaN(ms)) return '--:--';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function buildSpotifySearchUrl(trackName: string, artistName: string): string {
  return `https://open.spotify.com/search/${encodeURIComponent(trackName + ' ' + artistName)}`;
}

const QUICK_SEARCH_CHIPS = [
  { label: '🔥 Trending Hits', query: 'Top Hits 2025' },
  { label: '🌙 The Weeknd', query: 'The Weeknd' },
  { label: '🌟 Billie Eilish', query: 'Billie Eilish' },
  { label: '✨ Taylor Swift', query: 'Taylor Swift' },
  { label: '🎧 Lo-Fi Beats', query: 'Lofi hip hop beats' },
  { label: '⚡ Electronic', query: 'Electronic Dance' },
  { label: '🎸 Rock Classics', query: 'Rock classics' },
  { label: '🎤 Hip-Hop', query: 'Hip Hop Billboard' },
];

// ─── Mini Preview Player ────────────────────────────────────────────────────────

interface PreviewPlayerProps {
  track: OnlineSearchResult;
  isPlaying: boolean;
  progress: number;
  onToggle: () => void;
  onSeek: (ratio: number) => void;
  onClose: () => void;
  onDownload: () => void;
  isDownloaded: boolean;
  isDownloading: boolean;
}

const PreviewPlayer: React.FC<PreviewPlayerProps> = ({
  track,
  isPlaying,
  progress,
  onToggle,
  onSeek,
  onClose,
  onDownload,
  isDownloaded,
  isDownloading,
}) => {
  const barRef = useRef<HTMLDivElement>(null);

  const handleBarClick = (e: React.MouseEvent) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(ratio);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className="mx-6 mb-3 mt-1 rounded-2xl bg-[#14131A] border border-[#282631] px-4 py-3 flex items-center gap-3.5 shrink-0 shadow-2xl"
    >
      {/* Artwork */}
      <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-[#1A1922] border border-[#282631]">
        {track.artwork_url ? (
          <img src={track.artwork_url} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Music2 className="w-4 h-4 text-[#65616F]" />
          </div>
        )}
      </div>

      {/* Info & Progress */}
      <div className="flex flex-col min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 truncate">
            <span className="text-xs font-semibold text-[#F4F2F7] truncate">{track.track_name}</span>
            <span className="text-[11px] text-[#777381] truncate">{track.artist_name}</span>
          </div>
          <span className="text-[10px] font-mono text-[#19E6A0] bg-[#19E6A0]/10 px-2 py-0.5 rounded-full shrink-0">
            Preview 30s
          </span>
        </div>

        {/* Progress bar */}
        <div
          ref={barRef}
          onClick={handleBarClick}
          className="mt-2 w-full h-1.5 rounded-full bg-[#201F2B] cursor-pointer group relative overflow-hidden"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#19E6A0] to-[#35F0B1] transition-[width] duration-100"
            style={{ width: `${Math.min(100, progress * 100)}%` }}
          />
        </div>
      </div>

      {/* Play / Pause */}
      <button
        type="button"
        onClick={onToggle}
        className="w-8 h-8 rounded-full bg-[#19E6A0] hover:bg-[#35F0B1] text-black flex items-center justify-center shrink-0 transition-all duration-150 active:scale-90 cursor-pointer shadow-md"
        title={isPlaying ? 'Pause preview' : 'Play preview'}
      >
        {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
      </button>

      {/* Download Action inside preview bar */}
      <button
        type="button"
        onClick={onDownload}
        disabled={isDownloading || isDownloaded}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 active:scale-95 shrink-0 ${
          isDownloaded
            ? 'bg-[#19E6A0]/15 text-[#19E6A0] border border-[#19E6A0]/30 cursor-default'
            : isDownloading
            ? 'bg-[#211F26] text-[#AAA6B2] border border-[#282631] cursor-wait'
            : 'bg-[#16151C] hover:bg-[#19E6A0] text-[#F4F2F7] hover:text-black border border-[#282631] cursor-pointer'
        }`}
      >
        {isDownloading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#19E6A0]" />
            <span>Downloading</span>
          </>
        ) : isDownloaded ? (
          <>
            <CheckCircle2 className="w-3.5 h-3.5 text-[#19E6A0]" />
            <span>In Library</span>
          </>
        ) : (
          <>
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </>
        )}
      </button>

      {/* Close preview button */}
      <button
        type="button"
        onClick={onClose}
        className="p-1 rounded-lg text-[#777381] hover:text-[#F4F2F7] hover:bg-[#1B1A24] transition-all cursor-pointer"
        title="Close preview"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
};

// ─── Main Component ─────────────────────────────────────────────────────────────

interface OnlineSearchViewProps {
  initialQuery?: string;
  onNavigateToDownloader?: (url: string) => void;
}

export const OnlineSearchView: React.FC<OnlineSearchViewProps> = ({
  initialQuery = '',
  onNavigateToDownloader,
}) => {
  const { tracks, refreshLibrary, openInExplorer } = usePlayer();

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<OnlineSearchResult[]>([]);
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [lastQuery, setLastQuery] = useState('');
  const [downloadDir, setDownloadDir] = useState('');

  // Downloading trackers: Map track identifier -> 'downloading' | 'completed' | 'failed'
  const [downloadStatuses, setDownloadStatuses] = useState<Record<string, 'downloading' | 'completed' | 'failed'>>({});
  const [downloadProgresses, setDownloadProgresses] = useState<Record<string, number>>({});
  const [activeDownloadTitle, setActiveDownloadTitle] = useState<string | null>(null);

  // Audio preview state
  const [previewTrackIndex, setPreviewTrackIndex] = useState<number | null>(null);
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [previewProgress, setPreviewProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRafRef = useRef<number | null>(null);

  // Search input & debouncing
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load configured download directory
  useEffect(() => {
    invoke<{ download_directory: string }>('get_settings')
      .then((s) => {
        if (s?.download_directory) setDownloadDir(s.download_directory);
      })
      .catch(console.warn);
  }, []);

  // Listen to Tauri download events in real-time
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await listen<DownloadLogEvent>('download://event', (e) => {
        const payload = e.payload;
        if (!payload) return;

        if (payload.title || payload.track) {
          const title = (payload.title || payload.track || '').toLowerCase();
          const percent = payload.percent ?? 0;

          setDownloadStatuses((prev) => {
            const next = { ...prev };
            for (const key of Object.keys(next)) {
              if (key.toLowerCase().includes(title) || title.includes(key.toLowerCase())) {
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
              if (key.toLowerCase().includes(title) || title.includes(key.toLowerCase())) {
                next[key] = percent;
              }
            }
            return next;
          });
        }

        if (payload.type === 'completed') {
          setActiveDownloadTitle(null);
          // Auto refresh library so newly downloaded song is ready to play offline
          refreshLibrary().catch(console.warn);
        }
      });
    };

    setupListener();

    return () => {
      if (unlisten) unlisten();
    };
  }, [refreshLibrary]);

  // Check if a song is already present in the user's offline music library
  const isTrackInLibrary = useCallback(
    (track: OnlineSearchResult) => {
      if (!tracks || tracks.length === 0) return false;
      const cleanTitle = track.track_name.toLowerCase().trim();
      const cleanArtist = track.artist_name.toLowerCase().trim();

      return tracks.some((t) => {
        const tTitle = t.title.toLowerCase().trim();
        const tArtist = t.artist.toLowerCase().trim();

        // Exact match or substring match
        const titleMatch = tTitle === cleanTitle || tTitle.includes(cleanTitle) || cleanTitle.includes(tTitle);
        const artistMatch = tArtist === cleanArtist || tArtist.includes(cleanArtist) || cleanArtist.includes(tArtist);

        return titleMatch && (cleanArtist === '' || artistMatch);
      });
    },
    [tracks],
  );

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
        limit: 35,
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

  // Sync initial query
  useEffect(() => {
    if (initialQuery.trim()) {
      setQuery(initialQuery);
      performSearch(initialQuery);
    }
  }, [initialQuery, performSearch]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setQuery(val);

      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (!val.trim()) {
        setResults([]);
        setSearchState('idle');
        return;
      }

      debounceRef.current = setTimeout(() => {
        performSearch(val);
      }, 350);
    },
    [performSearch],
  );

  const handleClear = useCallback(() => {
    setQuery('');
    setResults([]);
    setSearchState('idle');
    setLastQuery('');
    stopPreview();
    inputRef.current?.focus();
  }, []);

  const handleChipClick = (chipQuery: string) => {
    setQuery(chipQuery);
    performSearch(chipQuery);
  };

  // ── 1-Click Download Handler ───────────────────────────────────────────────

  const handleDownloadTrack = async (track: OnlineSearchResult) => {
    const key = `${track.artist_name} - ${track.track_name}`;
    setDownloadStatuses((prev) => ({ ...prev, [key]: 'downloading' }));
    setDownloadProgresses((prev) => ({ ...prev, [key]: 10 }));
    setActiveDownloadTitle(track.track_name);

    try {
      await invoke('start_download', {
        url: `${track.artist_name} - ${track.track_name}`,
        outputDir: downloadDir || undefined,
      });
    } catch (err) {
      console.error('Failed to start download:', err);
      setDownloadStatuses((prev) => ({ ...prev, [key]: 'failed' }));
      setActiveDownloadTitle(null);
    }
  };

  // ── Audio preview player logic ──────────────────────────────────────────────

  const stopPreview = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (progressRafRef.current) {
      cancelAnimationFrame(progressRafRef.current);
      progressRafRef.current = null;
    }
    setPreviewTrackIndex(null);
    setIsPreviewPlaying(false);
    setPreviewProgress(0);
  }, []);

  const updateProgress = useCallback(() => {
    if (audioRef.current && !audioRef.current.paused) {
      const dur = audioRef.current.duration || 30;
      setPreviewProgress(audioRef.current.currentTime / dur);
      progressRafRef.current = requestAnimationFrame(updateProgress);
    }
  }, []);

  const playPreview = useCallback(
    (index: number) => {
      const track = results[index];
      if (!track?.preview_url) return;

      // If clicking the same track that is already playing, toggle play/pause
      if (previewTrackIndex === index && audioRef.current) {
        if (isPreviewPlaying) {
          audioRef.current.pause();
          setIsPreviewPlaying(false);
          if (progressRafRef.current) cancelAnimationFrame(progressRafRef.current);
        } else {
          audioRef.current.play();
          setIsPreviewPlaying(true);
          progressRafRef.current = requestAnimationFrame(updateProgress);
        }
        return;
      }

      // Pause the main offline audio player so audio doesn't overlap
      audioEngine.pause();

      // Stop any existing preview
      stopPreview();

      // Start new preview
      const audio = new Audio(track.preview_url);
      audio.volume = 0.8;
      audioRef.current = audio;
      setPreviewTrackIndex(index);
      setIsPreviewPlaying(true);
      setPreviewProgress(0);

      audio.addEventListener('ended', () => {
        setIsPreviewPlaying(false);
        setPreviewProgress(1);
        if (progressRafRef.current) cancelAnimationFrame(progressRafRef.current);
      });

      audio.addEventListener('error', () => {
        stopPreview();
      });

      audio.play().then(() => {
        progressRafRef.current = requestAnimationFrame(updateProgress);
      }).catch(console.warn);
    },
    [results, previewTrackIndex, isPreviewPlaying, stopPreview, updateProgress],
  );

  const togglePreviewPlayback = useCallback(() => {
    if (!audioRef.current) return;
    if (isPreviewPlaying) {
      audioRef.current.pause();
      setIsPreviewPlaying(false);
      if (progressRafRef.current) cancelAnimationFrame(progressRafRef.current);
    } else {
      audioRef.current.play();
      setIsPreviewPlaying(true);
      progressRafRef.current = requestAnimationFrame(updateProgress);
    }
  }, [isPreviewPlaying, updateProgress]);

  const seekPreview = useCallback((ratio: number) => {
    if (!audioRef.current) return;
    const dur = audioRef.current.duration || 30;
    audioRef.current.currentTime = ratio * dur;
    setPreviewProgress(ratio);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopPreview();
    };
  }, [stopPreview]);

  // Top result (rank #1) and remaining tracks
  const topResult = results.length > 0 ? results[0] : null;
  const remainingTracks = useMemo(() => (results.length > 1 ? results.slice(1) : []), [results]);

  const previewTrack = previewTrackIndex !== null ? results[previewTrackIndex] : null;

  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-hidden select-none bg-transparent">
      {/* Top Header & Search Input */}
      <div className="px-6 pt-5 pb-3 flex flex-col gap-3 shrink-0">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-[#F4F2F7] tracking-tight">Online Search</h2>
            {searchState === 'results' && results.length > 0 && (
              <span className="text-[11px] font-mono text-[#AAA6B2] bg-[#16151C] border border-[#282631] px-2.5 py-0.5 rounded-full">
                {results.length} tracks found
              </span>
            )}
            {activeDownloadTitle && (
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#19E6A0] bg-[#19E6A0]/10 border border-[#19E6A0]/25 px-2.5 py-0.5 rounded-full animate-pulse">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Downloading {activeDownloadTitle}...</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onNavigateToDownloader && (
              <button
                onClick={() => onNavigateToDownloader(query)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#16151C] hover:bg-[#1D1C23] text-[#AAA6B2] hover:text-[#19E6A0] border border-[#292731]/60 text-xs font-medium transition-all duration-150 active:scale-95 cursor-pointer shrink-0"
                title="View full Downloader and active queues"
              >
                <Download className="w-3.5 h-3.5 text-[#19E6A0]" />
                <span className="hidden sm:inline">Downloader</span>
              </button>
            )}
            {downloadDir && (
              <button
                onClick={() => openInExplorer(downloadDir)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#16151C] hover:bg-[#1D1C23] text-[#AAA6B2] hover:text-[#F4F2F7] border border-[#292731]/60 text-xs font-medium transition-all duration-150 active:scale-95 cursor-pointer shrink-0"
                title="Open local download directory"
              >
                <FolderOpen className="w-3.5 h-3.5 text-[#AAA6B2]" />
                <span className="hidden sm:inline">Music Folder</span>
              </button>
            )}
          </div>
        </div>

        {/* Search Input Card */}
        <div className="p-3 rounded-2xl bg-[#14131A] border border-[#282631] flex flex-col gap-2.5 shadow-lg">
          <div className="relative flex items-center bg-[#0E0D14] rounded-xl border border-[#282631] focus-within:border-[#19E6A0]/50 transition-colors">
            <Search className="w-4 h-4 ml-3.5 text-[#65616F] shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={handleInputChange}
              placeholder="Search millions of songs online to listen or download locally..."
              className="w-full pl-3 pr-10 py-2.5 text-xs bg-transparent text-[#F4F2F7] placeholder-[#65616F] focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && query.trim()) {
                  performSearch(query);
                } else if (e.key === 'Escape' && query) {
                  e.stopPropagation();
                  handleClear();
                }
              }}
            />
            <AnimatePresence>
              {query && (
                <motion.button
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  transition={{ duration: 0.12 }}
                  type="button"
                  onClick={handleClear}
                  className="absolute right-2 p-1.5 rounded-lg text-[#777381] hover:text-[#F4F2F7] hover:bg-[#1B1A24] transition-all duration-150 active:scale-90 cursor-pointer"
                  title="Clear search"
                  aria-label="Clear search"
                >
                  <X className="w-3.5 h-3.5" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>

          {/* Quick Discovery Tags */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-0.5 pb-0.5 text-xs">
            <div className="flex items-center gap-1 text-[11px] text-[#65616F] mr-1 shrink-0">
              <Sparkles className="w-3 h-3 text-[#19E6A0]" />
              <span>Explore:</span>
            </div>
            {QUICK_SEARCH_CHIPS.map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleChipClick(chip.query)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all duration-150 active:scale-95 cursor-pointer shrink-0 border ${
                  query === chip.query
                    ? 'bg-[#19E6A0]/15 text-[#19E6A0] border-[#19E6A0]/30'
                    : 'bg-[#1A1922] hover:bg-[#22202C] text-[#AAA6B2] hover:text-[#F4F2F7] border-[#282631]'
                }`}
              >
                {chip.label}
              </button>
            ))}
          </div>
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
              <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-b from-[#1C1B26] to-[#12111A] border border-white/[0.08] shadow-[0_8px_24px_rgba(0,0,0,0.5)] flex items-center justify-center mb-4">
                <div className="absolute inset-0 rounded-2xl bg-[#19E6A0]/10 blur-xl pointer-events-none" />
                <div className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center relative z-10">
                  <Globe className="w-5 h-5 text-[#19E6A0] stroke-[1.6]" />
                </div>
              </div>
              <h3 className="text-base font-bold text-[#F4F2F7] tracking-tight">
                Search & Download Any Song Online
              </h3>
              <p className="text-xs text-[#777381] mt-2 leading-relaxed">
                Discover any track from the global music catalog, stream high-fidelity previews, and save 320kbps MP3s directly to your offline music library with one click.
              </p>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                {QUICK_SEARCH_CHIPS.slice(0, 4).map((chip, i) => (
                  <button
                    key={i}
                    onClick={() => handleChipClick(chip.query)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#14131A] hover:bg-[#1C1B26] border border-[#282631] text-xs text-[#AAA6B2] hover:text-[#F4F2F7] transition-all duration-150 cursor-pointer active:scale-95"
                  >
                    <span>{chip.label}</span>
                    <ArrowRight className="w-3 h-3 text-[#65616F]" />
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}

        {/* ── Loading State ──── */}
        {searchState === 'loading' && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 select-none">
            <Loader2 className="w-8 h-8 text-[#19E6A0] animate-spin mb-3" />
            <p className="text-xs font-semibold text-[#F4F2F7]">Searching music catalog...</p>
            <p className="text-[11px] text-[#777381] mt-1">Retrieving songs, album arts, and audio previews</p>
          </div>
        )}

        {/* ── Empty State ──── */}
        {searchState === 'empty' && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 select-none">
            <div className="w-14 h-14 rounded-2xl bg-[#1A1922] border border-[#282631] flex items-center justify-center mb-4">
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
            <div className="w-14 h-14 rounded-2xl bg-[#FF667A]/10 border border-[#FF667A]/20 flex items-center justify-center mb-4">
              <AlertCircle className="w-6 h-6 text-[#FF667A]" />
            </div>
            <p className="text-sm font-semibold text-[#F4F2F7]">Search error</p>
            <p className="text-xs text-[#777381] mt-1 max-w-sm">{errorMsg || 'Failed to search online music.'}</p>
            <button
              type="button"
              onClick={() => performSearch(lastQuery)}
              className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl bg-[#19E6A0] hover:bg-[#35F0B1] text-black font-semibold text-xs transition-all active:scale-95 cursor-pointer"
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
              <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 mb-6 pt-2">
                {/* Left: Top Result Highlight Card */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#AAA6B2]">
                    Top Result
                  </span>
                  <div className="p-4 rounded-2xl bg-[#14131A] hover:bg-[#1A1924] border border-[#282631] transition-all duration-200 group relative flex flex-col justify-between shadow-xl min-h-[220px]">
                    <div className="flex items-start gap-4">
                      {/* Large Cover Art with ambient glow */}
                      <div className="w-24 h-24 rounded-xl overflow-hidden shrink-0 bg-[#1A1922] border border-white/[0.08] shadow-lg relative group/topart">
                        {topResult.artwork_url ? (
                          <img
                            src={topResult.artwork_url}
                            alt=""
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Music2 className="w-8 h-8 text-[#65616F]" />
                          </div>
                        )}
                        {topResult.preview_url && (
                          <button
                            type="button"
                            onClick={() => playPreview(0)}
                            className="absolute inset-0 bg-black/60 opacity-0 group-hover/topart:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                          >
                            {previewTrackIndex === 0 && isPreviewPlaying ? (
                              <Pause className="w-6 h-6 text-white" />
                            ) : (
                              <Play className="w-6 h-6 text-white ml-0.5" />
                            )}
                          </button>
                        )}
                      </div>

                      <div className="flex flex-col min-w-0 flex-1 pt-1">
                        <span className="text-base font-bold text-[#F4F2F7] truncate leading-tight group-hover:text-[#19E6A0] transition-colors">
                          {topResult.track_name}
                        </span>
                        <span className="text-xs text-[#AAA6B2] truncate mt-1">
                          {topResult.artist_name}
                        </span>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[10px] font-semibold bg-[#22202C] text-[#AAA6B2] px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Song
                          </span>
                          <span className="text-[11px] font-mono text-[#777381]">
                            {formatDuration(topResult.duration_ms)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Actions inside Top Result */}
                    <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-[#282631]/60">
                      <div className="flex items-center gap-2">
                        {topResult.preview_url && (
                          <button
                            type="button"
                            onClick={() => playPreview(0)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#16151C] hover:bg-[#1D1C23] text-xs font-semibold text-[#F4F2F7] border border-[#282631] transition-all cursor-pointer active:scale-95"
                          >
                            {previewTrackIndex === 0 && isPreviewPlaying ? (
                              <>
                                <Pause className="w-3.5 h-3.5 text-[#19E6A0]" />
                                <span>Pause</span>
                              </>
                            ) : (
                              <>
                                <Play className="w-3.5 h-3.5 text-[#19E6A0]" />
                                <span>Preview 30s</span>
                              </>
                            )}
                          </button>
                        )}
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
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                              inLib
                                ? 'bg-[#19E6A0]/15 text-[#19E6A0] border border-[#19E6A0]/30 cursor-default'
                                : isDl
                                ? 'bg-[#211F26] text-[#AAA6B2] border border-[#282631] cursor-wait'
                                : 'bg-[#19E6A0] hover:bg-[#35F0B1] text-black cursor-pointer shadow-lg hover:shadow-[#19E6A0]/25'
                            }`}
                          >
                            {isDl ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>{downloadProgresses[key] ? `Downloading ${downloadProgresses[key]}%` : 'Downloading...'}</span>
                              </>
                            ) : inLib ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-[#19E6A0]" />
                                <span>In Library</span>
                              </>
                            ) : (
                              <>
                                <Download className="w-3.5 h-3.5" />
                                <span>Download Song</span>
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
                  <span className="text-xs font-bold uppercase tracking-wider text-[#AAA6B2]">
                    Songs
                  </span>
                  <div className="flex flex-col gap-1 rounded-2xl bg-[#14131A] border border-[#282631] p-2">
                    {results.slice(0, 4).map((track, i) => {
                      const isPlayingThis = previewTrackIndex === i && isPreviewPlaying;
                      const key = `${track.artist_name} - ${track.track_name}`;
                      const inLib = isTrackInLibrary(track) || downloadStatuses[key] === 'completed';
                      const isDl = downloadStatuses[key] === 'downloading';

                      return (
                        <div
                          key={i}
                          className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-[#1A1922] transition-colors group"
                        >
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-[#1A1922] relative group/subart">
                              {track.artwork_url ? (
                                <img src={track.artwork_url} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <Music2 className="w-4 h-4 text-[#65616F] m-auto" />
                              )}
                              {track.preview_url && (
                                <button
                                  type="button"
                                  onClick={() => playPreview(i)}
                                  className="absolute inset-0 bg-black/60 opacity-0 group-hover/subart:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                                >
                                  {isPlayingThis ? (
                                    <Pause className="w-3 h-3 text-white" />
                                  ) : (
                                    <Play className="w-3 h-3 text-white ml-0.5" />
                                  )}
                                </button>
                              )}
                            </div>
                            <div className="flex flex-col min-w-0 truncate">
                              <span className={`text-xs font-semibold truncate ${isPlayingThis ? 'text-[#19E6A0]' : 'text-[#F4F2F7]'}`}>
                                {track.track_name}
                              </span>
                              <span className="text-[11px] text-[#777381] truncate">
                                {track.artist_name}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0 ml-2">
                            <span className="text-[11px] font-mono text-[#777381]">
                              {formatDuration(track.duration_ms)}
                            </span>

                            {/* Download Button */}
                            <button
                              type="button"
                              onClick={() => !inLib && !isDl && handleDownloadTrack(track)}
                              disabled={inLib || isDl}
                              className={`p-1.5 rounded-lg text-xs font-medium transition-all active:scale-90 cursor-pointer ${
                                inLib
                                  ? 'text-[#19E6A0] bg-[#19E6A0]/10 cursor-default'
                                  : isDl
                                  ? 'text-[#AAA6B2] cursor-wait'
                                  : 'text-[#777381] hover:text-[#19E6A0] hover:bg-[#19E6A0]/10'
                              }`}
                              title={inLib ? 'Already downloaded in library' : 'Download song locally'}
                            >
                              {isDl ? (
                                <Loader2 className="w-4 h-4 animate-spin text-[#19E6A0]" />
                              ) : inLib ? (
                                <CheckCircle2 className="w-4 h-4 text-[#19E6A0]" />
                              ) : (
                                <Download className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* All Remaining Songs Table */}
            {remainingTracks.length > 0 && (
              <div className="flex flex-col mt-4">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#292731]/60">
                  <span className="text-xs font-bold uppercase tracking-wider text-[#AAA6B2]">
                    All Results
                  </span>
                  <span className="text-[11px] font-mono text-[#65616F]">
                    {results.length} songs
                  </span>
                </div>

                {/* Table Header */}
                <div className="grid grid-cols-[44px_minmax(0,2.5fr)_minmax(0,1.5fr)_80px_110px] items-center px-3 pb-2 text-[#65616F] uppercase tracking-wider font-semibold text-[10px]">
                  <div className="text-center">#</div>
                  <div className="pl-1">Title</div>
                  <div className="hidden md:block">Album</div>
                  <div className="text-right pr-2">Duration</div>
                  <div className="text-center">Download</div>
                </div>

                {/* Rows */}
                <div className="flex flex-col gap-0.5">
                  {results.map((track, idx) => {
                    const isCurrentPreview = previewTrackIndex === idx;
                    const isPlayingThis = isCurrentPreview && isPreviewPlaying;
                    const key = `${track.artist_name} - ${track.track_name}`;
                    const inLib = isTrackInLibrary(track) || downloadStatuses[key] === 'completed';
                    const isDl = downloadStatuses[key] === 'downloading';

                    return (
                      <div
                        key={idx}
                        className={`grid grid-cols-[44px_minmax(0,2.5fr)_minmax(0,1.5fr)_80px_110px] items-center px-3 py-2 rounded-xl transition-all group ${
                          isCurrentPreview
                            ? 'bg-[#19E6A0]/[0.08] border border-[#19E6A0]/20'
                            : 'hover:bg-[#15141D] border border-transparent'
                        }`}
                      >
                        {/* Artwork / Play Button */}
                        <div className="flex items-center justify-center">
                          <div className="w-9 h-9 rounded-lg overflow-hidden bg-[#1A1922] border border-[#282631] relative group/subart">
                            {track.artwork_url ? (
                              <img src={track.artwork_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Music2 className="w-4 h-4 text-[#65616F] m-auto" />
                            )}
                            {track.preview_url && (
                              <button
                                type="button"
                                onClick={() => playPreview(idx)}
                                className="absolute inset-0 bg-black/60 opacity-0 group-hover/subart:opacity-100 flex items-center justify-center transition-opacity cursor-pointer"
                              >
                                {isPlayingThis ? (
                                  <Pause className="w-3.5 h-3.5 text-white" />
                                ) : (
                                  <Play className="w-3.5 h-3.5 text-white ml-0.5" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Title & Artist */}
                        <div className="flex flex-col min-w-0 pl-1 pr-2">
                          <span className={`text-xs font-semibold truncate ${isPlayingThis ? 'text-[#19E6A0]' : 'text-[#F4F2F7]'}`}>
                            {track.track_name}
                          </span>
                          <span className="text-[11px] text-[#777381] truncate">
                            {track.artist_name}
                          </span>
                        </div>

                        {/* Album */}
                        <div className="hidden md:block truncate pr-2">
                          <span className="text-[11px] text-[#65616F] truncate block">
                            {track.album_name}
                          </span>
                        </div>

                        {/* Duration */}
                        <div className="text-right pr-2">
                          <span className="text-[11px] font-mono text-[#777381]">
                            {formatDuration(track.duration_ms)}
                          </span>
                        </div>

                        {/* Download & Preview Actions */}
                        <div className="flex items-center justify-center gap-1.5">
                          {/* 1-Click Download Button */}
                          <button
                            type="button"
                            onClick={() => !inLib && !isDl && handleDownloadTrack(track)}
                            disabled={inLib || isDl}
                            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all active:scale-95 ${
                              inLib
                                ? 'bg-[#19E6A0]/15 text-[#19E6A0] border border-[#19E6A0]/25 cursor-default'
                                : isDl
                                ? 'bg-[#211F26] text-[#AAA6B2] border border-[#282631] cursor-wait'
                                : 'bg-[#19E6A0]/10 hover:bg-[#19E6A0] text-[#19E6A0] hover:text-black border border-[#19E6A0]/30 cursor-pointer shadow-sm'
                            }`}
                            title={inLib ? 'Saved locally in library' : 'Download & save locally'}
                          >
                            {isDl ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>{downloadProgresses[key] ? `${downloadProgresses[key]}%` : 'Saving'}</span>
                              </>
                            ) : inLib ? (
                              <>
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Saved</span>
                              </>
                            ) : (
                              <>
                                <Download className="w-3 h-3" />
                                <span>Download</span>
                              </>
                            )}
                          </button>

                          {/* Copy Spotify Search link */}
                          <button
                            type="button"
                            onClick={async () => {
                              const url = buildSpotifySearchUrl(track.track_name, track.artist_name);
                              await navigator.clipboard.writeText(url);
                            }}
                            className="p-1 rounded-lg text-[#65616F] hover:text-[#AAA6B2] hover:bg-[#1A1922] transition-colors cursor-pointer"
                            title="Copy Spotify Search link"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Floating 30s Audio Preview Player Bar */}
      <AnimatePresence>
        {previewTrack && (
          <PreviewPlayer
            track={previewTrack}
            isPlaying={isPreviewPlaying}
            progress={previewProgress}
            onToggle={togglePreviewPlayback}
            onSeek={seekPreview}
            onClose={stopPreview}
            onDownload={() => handleDownloadTrack(previewTrack)}
            isDownloaded={isTrackInLibrary(previewTrack) || downloadStatuses[`${previewTrack.artist_name} - ${previewTrack.track_name}`] === 'completed'}
            isDownloading={downloadStatuses[`${previewTrack.artist_name} - ${previewTrack.track_name}`] === 'downloading'}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
