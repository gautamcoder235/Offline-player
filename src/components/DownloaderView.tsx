import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Download,
  ArrowDownToLine,
  CheckCircle2,
  Terminal,
  Loader2,
  ClipboardPaste,
  StopCircle,
  Link2,
  ChevronDown,
  ChevronUp,
  Folder,
  X,
  Music2,
} from 'lucide-react';

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { usePlayer } from '../context/PlayerContext';
import { Track, DownloadLogEvent, AppSettings } from '../types';
import { TrackList } from './TrackList';
import { AnimatePresence, motion } from 'framer-motion';

// Persistent singleton download state across tab / view switches
interface DownloadSessionState {
  url: string;
  isDownloading: boolean;
  progressPercent: number;
  statusMessage: string;
  currentTrackName: string;
  logs: string[];
  summary: { total: number; succeeded: number; failed: number } | null;
  sessionTracks: Track[];
  detectedPlaylistName: string | null;
  isCollection: boolean;
  currentProcessUrl: string;
}

const globalSession: DownloadSessionState = {
  url: '',
  isDownloading: false,
  progressPercent: 0,
  statusMessage: 'Ready to download Spotify songs',
  currentTrackName: '',
  logs: [],
  summary: null,
  sessionTracks: [],
  detectedPlaylistName: null,
  isCollection: false,
  currentProcessUrl: '',
};

type SessionListener = () => void;
const sessionListeners = new Set<SessionListener>();

let notifyRafId: number | null = null;
function notifySessionListeners() {
  if (notifyRafId !== null) return;
  notifyRafId = requestAnimationFrame(() => {
    notifyRafId = null;
    sessionListeners.forEach((fn) => fn());
  });
}

let refreshDebounceTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleRefreshLibrary(delay = 1000) {
  if (refreshDebounceTimer) clearTimeout(refreshDebounceTimer);
  refreshDebounceTimer = setTimeout(() => {
    refreshDebounceTimer = null;
    globalCallbacks.refreshLibrary();
  }, delay);
}

let isGlobalListening = false;
const globalCallbacks: {
  tracks: Track[];
  refreshLibrary: () => void;
  createPlaylist: (name: string, description?: string, initialTrackIds?: string[], coverColor?: string) => void;
} = {
  tracks: [],
  refreshLibrary: () => {},
  createPlaylist: () => {},
};

function initGlobalListeners() {
  if (isGlobalListening) return;
  isGlobalListening = true;

  listen<DownloadLogEvent>('download://event', (e) => {
    const payload = e.payload;
    if (payload.message) globalSession.statusMessage = payload.message;
    if (payload.percent !== undefined) globalSession.progressPercent = payload.percent;
    if (payload.track) globalSession.currentTrackName = payload.track;
    if (payload.playlist_name) globalSession.detectedPlaylistName = payload.playlist_name;
    if (payload.is_collection) globalSession.isCollection = true;

    // Handle error events from python/savify
    if (payload.type === 'error') {
      globalSession.isDownloading = false;
      globalSession.statusMessage = payload.message || 'Download failed';
      globalSession.logs = [...globalSession.logs, `[ERROR] ${payload.message || 'Unknown error'}`];
      notifySessionListeners();
      return;
    }

    // Handle track completion or already exists in real-time
    const isDone =
      payload.type === 'track_done' ||
      (payload.type === 'track_progress' && (payload.status === 'completed' || payload.status === 'already_exists'));

    if (isDone) {
      const title = payload.title || payload.track || 'Track';
      const artist = payload.artist || 'Unknown Artist';
      const album = payload.album || '';
      const filePath = payload.file_path || '';

      const alreadyInSession = globalSession.sessionTracks.some(
        (t) =>
          (filePath && t.file_path && t.file_path.toLowerCase() === filePath.toLowerCase()) ||
          (t.title.toLowerCase() === title.toLowerCase() && t.artist.toLowerCase() === artist.toLowerCase())
      );

      if (!alreadyInSession) {
        const libMatch = globalCallbacks.tracks.find(
          (t) =>
            (filePath && t.file_path && t.file_path.toLowerCase() === filePath.toLowerCase()) ||
            (t.title.toLowerCase() === title.toLowerCase() && t.artist.toLowerCase() === artist.toLowerCase())
        );

        const newTrack: Track = libMatch || {
          id: filePath || `${artist}-${title}-${Date.now()}`,
          file_path: filePath,
          title,
          artist,
          album,
          duration: 0,
          duration_str: '--:--',
          size_bytes: 0,
          cover_art: null,
          stream_url: '',
        };

        globalSession.sessionTracks = [...globalSession.sessionTracks, newTrack];

        // Resolve active audio streaming URL asynchronously so it plays without error
        if (filePath && !newTrack.stream_url) {
          invoke<string>('get_audio_url', { filePath })
            .then((freshUrl) => {
              if (freshUrl) {
                globalSession.sessionTracks = globalSession.sessionTracks.map((t) =>
                  t.file_path === filePath ? { ...t, stream_url: freshUrl } : t
                );
                notifySessionListeners();
              }
            })
            .catch(() => {});
        }
      }

      // Debounce library refresh to avoid freezing disk while downloading
      scheduleRefreshLibrary(2500);
    }

    if (payload.type === 'completed') {
      globalSession.summary = {
        total: payload.total || 0,
        succeeded: payload.succeeded || 0,
        failed: payload.failed || 0,
      };
      globalSession.isDownloading = false;

      const isColl =
        Boolean(payload.is_collection) ||
        globalSession.isCollection ||
        globalSession.currentProcessUrl.toLowerCase().includes('playlist') ||
        globalSession.currentProcessUrl.toLowerCase().includes('album') ||
        Boolean(payload.playlist_name) ||
        Boolean(globalSession.detectedPlaylistName);

      if (isColl && globalSession.sessionTracks.length > 0) {
        const plName =
          payload.playlist_name ||
          globalSession.detectedPlaylistName ||
          (globalSession.currentProcessUrl.toLowerCase().includes('album') ? 'Downloaded Album' : 'Downloaded Playlist');
        const colors = ['#19E6A0', '#00F2FE', '#FF007F', '#9D4EDD', '#E8C77A', '#FF7A00'];
        const color = colors[Math.floor(Math.random() * colors.length)];

        const validIds = globalSession.sessionTracks
          .map((st) => {
            const match = globalCallbacks.tracks.find(
              (t) =>
                (st.file_path && t.file_path && t.file_path.toLowerCase() === st.file_path.toLowerCase()) ||
                (t.title.toLowerCase() === st.title.toLowerCase() && t.artist.toLowerCase() === st.artist.toLowerCase())
            );
            return match ? match.id : st.id;
          })
          .filter((id) => !id.startsWith('session-'));

        if (validIds.length > 0) {
          globalCallbacks.createPlaylist(
            plName,
            `Downloaded from Spotify (${new Date().toLocaleDateString()})`,
            validIds,
            color
          );
          globalSession.statusMessage = `Saved playlist "${plName}" with ${validIds.length} tracks to Your Playlists!`;
        }
      }

      scheduleRefreshLibrary(300);
    }

    notifySessionListeners();
  });

  listen<string>('download://log', (e) => {
    const raw = e.payload || '';
    const cleanLog = raw.includes('\r') ? raw.split('\r').pop()?.trim() || raw : raw.trim();
    if (!cleanLog) return;
    globalSession.logs = [...globalSession.logs.slice(-100), cleanLog];
    notifySessionListeners();
  });

  listen<{ exit_code: number }>('download://complete', (e) => {
    globalSession.isDownloading = false;
    if (e.payload?.exit_code !== 0 && (!globalSession.summary || globalSession.summary.succeeded === 0)) {
      globalSession.statusMessage = 'Download process stopped or encountered an error';
    }
    scheduleRefreshLibrary(300);
    notifySessionListeners();
  });
}

export const DownloaderView: React.FC = () => {
  const { tracks, refreshLibrary, openInExplorer, createPlaylist } = usePlayer();
  const [downloadDir, setDownloadDir] = useState<string>(() => {
    return localStorage.getItem('musicvault_download_dir') || '';
  });
  const [activeTab, setActiveTab] = useState<'session' | 'all'>('all');
  const [showLogs, setShowLogs] = useState(false);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  // Sync latest player callbacks to global listener
  globalCallbacks.tracks = tracks;
  globalCallbacks.refreshLibrary = refreshLibrary;
  globalCallbacks.createPlaylist = createPlaylist;

  // Local re-render trigger
  const [, setTick] = useState(0);

  useEffect(() => {
    initGlobalListeners();
    const handleUpdate = () => setTick((t) => t + 1);
    const handleLocate = () => setActiveTab('all');

    sessionListeners.add(handleUpdate);
    window.addEventListener('locate-current-track', handleLocate);
    return () => {
      sessionListeners.delete(handleUpdate);
      window.removeEventListener('locate-current-track', handleLocate);
    };
  }, []);

  useEffect(() => {
    invoke<AppSettings>('get_settings')
      .then((s) => {
        if (s?.download_directory) {
          setDownloadDir(s.download_directory);
          localStorage.setItem('musicvault_download_dir', s.download_directory);
        } else {
          // Fallback if not configured
          const fallback = 'C:\\Users\\sharm\\Music\\Spotify offline';
          setDownloadDir(fallback);
        }
      })
      .catch(() => {
        if (!downloadDir) {
          setDownloadDir('C:\\Users\\sharm\\Music\\Spotify offline');
        }
      });
  }, []);

  // Compute offline tracks located in the download directory
  const downloadedTracks = useMemo(() => {
    if (!downloadDir) {
      return tracks.filter((t) => t.file_path && t.file_path.toLowerCase().includes('spotify offline'));
    }
    const normDir = downloadDir.toLowerCase().replace(/\\/g, '/').replace(/\/$/, '');
    return tracks.filter((t) => {
      if (!t.file_path) return false;
      const normPath = t.file_path.toLowerCase().replace(/\\/g, '/');
      return normPath.startsWith(normDir) || normPath.includes('spotify offline');
    });
  }, [tracks, downloadDir]);

  // Sync session tracks with library metadata when tracks updates
  useEffect(() => {
    if (tracks.length === 0 || globalSession.sessionTracks.length === 0) return;
    let changed = false;
    const enriched = globalSession.sessionTracks.map((st) => {
      const match = tracks.find(
        (t) =>
          (st.file_path && t.file_path && t.file_path.toLowerCase() === st.file_path.toLowerCase()) ||
          (t.title.toLowerCase() === st.title.toLowerCase() && t.artist.toLowerCase() === st.artist.toLowerCase())
      );
      if (match) {
        if (
          st.id !== match.id ||
          st.duration !== match.duration ||
          st.cover_art !== match.cover_art ||
          st.stream_url !== match.stream_url
        ) {
          changed = true;
          return { ...st, ...match };
        }
      }
      return st;
    });

    if (changed) {
      globalSession.sessionTracks = enriched;
      notifySessionListeners();
    }
  }, [tracks]);

  useEffect(() => {
    if (showLogs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'auto' });
    }
  }, [globalSession.logs.length, showLogs]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const clean = text.replace(/^["']|["']$/g, '').trim();
        globalSession.url = clean;
        notifySessionListeners();
      }
    } catch (e) {
      console.warn('Clipboard read error:', e);
    }
  };

  const handleClearUrl = () => {
    globalSession.url = '';
    notifySessionListeners();
  };

  const handleBrowseDownloadDir = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: 'Select Music Download Folder',
      });
      if (selected && typeof selected === 'string') {
        setDownloadDir(selected);
        localStorage.setItem('musicvault_download_dir', selected);
        try {
          const cur = await invoke<AppSettings>('get_settings');
          await invoke('save_settings', { settings: { ...cur, download_directory: selected } });
          refreshLibrary();
        } catch (err) {
          console.warn('Failed to persist settings:', err);
        }
      }
    } catch (e) {
      console.warn('Folder picker error:', e);
    }
  };

  const handleStartDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetUrl = globalSession.url.replace(/^["']|["']$/g, '').trim();
    if (!targetUrl || globalSession.isDownloading) return;

    // Reset session trackers for this active download process
    globalSession.sessionTracks = [];
    globalSession.detectedPlaylistName = null;
    globalSession.isCollection = false;
    globalSession.currentProcessUrl = targetUrl;
    globalSession.isDownloading = true;
    globalSession.progressPercent = 5;
    globalSession.statusMessage = 'Initiating download...';
    globalSession.currentTrackName = '';
    globalSession.summary = null;
    globalSession.logs = [`[START] Connecting to Spotify: ${targetUrl}`];
    setActiveTab('session');
    notifySessionListeners();

    try {
      await invoke('start_download', {
        url: targetUrl,
        outputDir: downloadDir || undefined,
      });
    } catch (err) {
      globalSession.isDownloading = false;
      globalSession.statusMessage = `Error: ${String(err)}`;
      globalSession.logs = [...globalSession.logs, `[ERROR] ${String(err)}`];
      notifySessionListeners();
    }
  };

  const handleCancel = async () => {
    try {
      await invoke('cancel_download');
      globalSession.isDownloading = false;
      globalSession.statusMessage = 'Download process stopped';
      globalSession.logs = [...globalSession.logs, '[CANCELLED] User terminated download process'];
      notifySessionListeners();
    } catch (e) {
      console.warn('Cancel error:', e);
    }
  };

  const {
    url,
    isDownloading,
    progressPercent,
    statusMessage,
    currentTrackName,
    logs,
    summary,
    sessionTracks,
  } = globalSession;

  const currentDisplayTracks = activeTab === 'session' ? sessionTracks : downloadedTracks;

  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-hidden select-none bg-transparent">
      {/* Top Compact Controls & Input Bar */}
      <div className="px-6 pt-5 pb-3 flex flex-col gap-2.5 shrink-0">
        <form onSubmit={handleStartDownload} className="flex items-center gap-2.5">
          <div className="relative flex-1 flex items-center bg-[#121118]/80 backdrop-blur-xl rounded-xl border border-white/[0.08] focus-within:border-[#19E6A0]/50 focus-within:ring-2 focus-within:ring-[#19E6A0]/15 transition-all h-[44px] shadow-[0_4px_24px_rgba(0,0,0,0.35)]">
            <Link2 className="w-4 h-4 ml-3.5 text-[#65616F] shrink-0" />
            <input
              type="text"
              value={url}
              onChange={(e) => {
                globalSession.url = e.target.value;
                notifySessionListeners();
              }}
              disabled={isDownloading}
              placeholder="Paste Spotify track, album, or playlist link (or song search)..."
              className="w-full pl-3 pr-20 h-full text-xs bg-transparent text-[#F4F2F7] placeholder-[#65616F] focus:outline-none disabled:opacity-50"
            />

            <div className="absolute right-2.5 flex items-center gap-1">
              {url.length > 0 && !isDownloading && (
                <button
                  type="button"
                  onClick={handleClearUrl}
                  className="p-1.5 rounded-lg text-[#777381] hover:text-[#FF667A] hover:bg-white/[0.06] transition-all duration-150 active:scale-90 cursor-pointer"
                  title="Clear input"
                  aria-label="Clear input"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={handlePaste}
                disabled={isDownloading}
                className="p-1.5 rounded-lg text-[#777381] hover:text-[#19E6A0] hover:bg-white/[0.06] transition-all duration-150 active:scale-90 cursor-pointer"
                title="Paste from clipboard"
                aria-label="Paste from clipboard"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {isDownloading ? (
            <button
              type="button"
              onClick={handleCancel}
              className="h-[44px] flex items-center gap-2 px-5 rounded-xl bg-[#FF667A]/15 hover:bg-[#FF667A]/25 text-[#FF667A] border border-[#FF667A]/30 font-medium text-xs transition-all duration-150 active:scale-95 shrink-0 cursor-pointer shadow-sm"
            >
              <StopCircle className="w-4 h-4" />
              <span>Stop</span>
            </button>
          ) : (
            <button
              type="submit"
              disabled={!url.trim()}
              className="h-[44px] flex items-center gap-2 px-5 rounded-xl bg-[#19E6A0] hover:bg-[#35F0B1] disabled:bg-[#1A1922] disabled:text-[#65616F] text-black font-semibold text-xs transition-all duration-150 active:scale-95 shrink-0 cursor-pointer shadow-[0_2px_14px_rgba(25,230,160,0.3)] disabled:shadow-none"
            >
              <Download className="w-4 h-4" />
              <span>Download</span>
            </button>
          )}
        </form>

        {/* Minimal Meta Row: Target Folder & Activity Logs Toggle */}
        <div className="flex items-center justify-between text-[11px] text-[#777381] px-1">
          <div className="flex items-center gap-1.5 truncate">
            <Folder className="w-3.5 h-3.5 text-[#19E6A0] shrink-0" />
            <span>Save to:</span>
            <span
              onClick={() => openInExplorer(downloadDir)}
              className="text-[#AAA6B2] hover:text-[#19E6A0] cursor-pointer truncate transition-colors font-mono text-[10.5px]"
              title="Click to reveal folder in Explorer"
            >
              {downloadDir || 'Configuring folder...'}
            </span>
            <button
              type="button"
              onClick={handleBrowseDownloadDir}
              className="ml-1 px-2 py-0.5 rounded-md text-[10px] text-[#8E8A98] hover:text-[#F4F2F7] hover:bg-white/[0.06] border border-white/[0.06] transition-colors cursor-pointer"
              title="Change download folder location"
            >
              Change
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowLogs((prev) => !prev)}
            className="flex items-center gap-1.5 text-[11px] text-[#777381] hover:text-[#AAA6B2] hover:bg-white/[0.04] px-2 py-0.5 rounded-lg transition-all duration-150 active:scale-95 cursor-pointer shrink-0 ml-2"
          >
            <Terminal className="w-3 h-3 text-[#19E6A0]" />
            <span>Activity Log {logs.length > 0 ? `(${logs.length})` : ''}</span>
            {showLogs ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* Live Download Status & Progress Bar */}
        <AnimatePresence>
          {(isDownloading || progressPercent > 0 || summary) && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.98 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="p-3.5 rounded-2xl bg-[#121118]/80 backdrop-blur-xl border border-white/[0.06] space-y-2 shrink-0 shadow-lg"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {isDownloading ? (
                    <Loader2 className="w-4 h-4 text-[#19E6A0] animate-spin shrink-0" />
                  ) : summary ? (
                    <motion.div
                      animate={{ scale: [1, 1.25, 1] }}
                      transition={{ duration: 0.4, ease: 'easeOut' }}
                      className="shrink-0"
                    >
                      <CheckCircle2 className="w-4 h-4 text-[#19E6A0]" />
                    </motion.div>
                  ) : null}
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-semibold text-[#F4F2F7] truncate">
                      {currentTrackName ? currentTrackName : statusMessage}
                    </span>
                    {currentTrackName && statusMessage && statusMessage !== currentTrackName && (
                      <span className="text-[11px] text-[#777381] truncate">({statusMessage})</span>
                    )}
                  </div>
                </div>
                <span className="text-xs font-mono font-semibold text-[#19E6A0] bg-[#19E6A0]/10 px-2 py-0.5 rounded-full shrink-0">
                  {progressPercent}%
                </span>
              </div>

              <div className="w-full h-1.5 rounded-full bg-[#201F2B] overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#19E6A0] to-[#35F0B1] rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {summary && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2 }}
                  className="pt-0.5 flex items-center gap-4 text-xs font-medium"
                >
                  <span className="text-[#19E6A0]">✓ {summary.succeeded} downloaded</span>
                  {summary.failed > 0 && (
                    <span className="text-[#FF667A]">✗ {summary.failed} failed</span>
                  )}
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Collapsible Activity Stream */}
        <AnimatePresence>
          {showLogs && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="rounded-2xl bg-[#0E0D15]/90 backdrop-blur-2xl border border-white/[0.08] overflow-hidden shrink-0 shadow-2xl"
            >
              <div className="px-4 py-1.5 bg-[#08070D]/90 border-b border-white/[0.04] flex justify-end">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    globalSession.logs = [];
                    notifySessionListeners();
                  }}
                  className="text-[11px] text-[#65616F] hover:text-[#9A96A5] transition-all duration-150 active:scale-95 cursor-pointer"
                >
                  Clear logs
                </button>
              </div>
              <div className="p-3 font-mono text-[11px] text-[#9A96A5] bg-[#08070D]/90 max-h-44 overflow-y-auto space-y-1">
                {logs.length === 0 ? (
                  <div className="text-[#65616F]">Ready. Download activity will display here...</div>
                ) : (
                  logs.map((log, i) => (
                    <div
                      key={i}
                      className={`leading-relaxed break-all ${
                        log.includes('[ERROR]') || log.includes('failed')
                          ? 'text-[#FF667A]'
                          : log.includes('Downloaded') || log.includes('Completed')
                          ? 'text-[#19E6A0]'
                          : 'text-[#777381]'
                      }`}
                    >
                      {log}
                    </div>
                  ))
                )}
                <div ref={logsEndRef} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Main Full-Space Stage: Downloaded Tracks vs Active Session Tabs */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Navigation Segments Bar */}
        <div className="px-6 pt-1 pb-2 flex items-center justify-between shrink-0">
          <div className="h-[34px] flex items-center gap-1 bg-[#121118]/80 backdrop-blur-xl p-0.5 rounded-xl border border-white/[0.08] shadow-sm relative">
            <button
              onClick={() => setActiveTab('all')}
              className={`relative flex items-center gap-2 h-full px-3 rounded-lg text-xs font-semibold transition-colors duration-150 cursor-pointer ${
                activeTab === 'all'
                  ? 'text-[#F4F2F7]'
                  : 'text-[#8E8A98] hover:text-[#F4F2F7]'
              }`}
            >
              {activeTab === 'all' && (
                <motion.div
                  layoutId="downloader-active-tab-indicator"
                  className="absolute inset-0 bg-white/[0.08] rounded-lg border border-white/[0.08] shadow-[0_2px_8px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] pointer-events-none"
                  transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                />
              )}
              <Music2 className="relative z-10 w-3.5 h-3.5 text-[#19E6A0]" />
              <span className="relative z-10">Downloaded Tracks</span>
              <span className="relative z-10 text-[10px] font-mono text-[#8E8A98] bg-white/[0.06] px-1.5 py-0.2 rounded-full">
                {downloadedTracks.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('session')}
              className={`relative flex items-center gap-2 h-full px-3 rounded-lg text-xs font-semibold transition-colors duration-150 cursor-pointer ${
                activeTab === 'session'
                  ? 'text-[#F4F2F7]'
                  : 'text-[#8E8A98] hover:text-[#F4F2F7]'
              }`}
            >
              {activeTab === 'session' && (
                <motion.div
                  layoutId="downloader-active-tab-indicator"
                  className="absolute inset-0 bg-white/[0.08] rounded-lg border border-white/[0.08] shadow-[0_2px_8px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] pointer-events-none"
                  transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                />
              )}
              <ArrowDownToLine className="relative z-10 w-3.5 h-3.5 text-[#19E6A0]" />
              <span className="relative z-10">Session Queue</span>
              {sessionTracks.length > 0 && (
                <span className="relative z-10 text-[10px] font-mono text-[#19E6A0] bg-[#19E6A0]/15 px-1.5 py-0.2 rounded-full">
                  {sessionTracks.length}
                </span>
              )}
            </button>
          </div>

          {isDownloading && (
            <span className="text-[11px] text-[#19E6A0] flex items-center gap-1.5 font-medium animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Downloading active queue...</span>
            </span>
          )}
        </div>

        {/* Content View: TrackList or Empty State with silky spatial elevation transition */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col relative">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{
                opacity: 0,
                y: activeTab === 'session' ? 12 : -12,
                scale: 0.992,
                filter: 'blur(3px)',
              }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
                filter: 'blur(0px)',
                transition: {
                  duration: 0.22,
                  ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
                },
              }}
              exit={{
                opacity: 0,
                y: activeTab === 'session' ? -8 : 8,
                scale: 0.996,
                filter: 'blur(2px)',
                transition: {
                  duration: 0.12,
                  ease: [0.4, 0, 1, 1] as [number, number, number, number],
                },
              }}
              className="flex-1 min-h-0 flex flex-col will-change-[transform,opacity,filter]"
            >
              {currentDisplayTracks.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 select-none">
                  <div className="w-14 h-14 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center mb-3">
                    <ArrowDownToLine className="w-6 h-6 text-[#19E6A0]" />
                  </div>
                  <h3 className="text-sm font-semibold text-[#8E8A98]">
                    {activeTab === 'session' ? 'Paste a link above to start downloading' : 'No offline tracks in download folder'}
                  </h3>
                </div>
              ) : (
                <TrackList tracks={currentDisplayTracks} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};