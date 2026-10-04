import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  FolderOpen,
  CheckCircle2,
  Terminal,
  Loader2,
  ClipboardPaste,
  StopCircle,
  Link2,
  ChevronDown,
  ChevronUp,
  Folder,
} from 'lucide-react';

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { usePlayer } from '../context/PlayerContext';
import { Track, DownloadLogEvent } from '../types';
import { TrackList } from './TrackList';

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

function notifySessionListeners() {
  sessionListeners.forEach((fn) => fn());
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
          stream_url: filePath
            ? `http://127.0.0.1:49152/stream?file=${encodeURIComponent(filePath)}`
            : '',
        };

        globalSession.sessionTracks = [...globalSession.sessionTracks, newTrack];
      }

      globalCallbacks.refreshLibrary();
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

      globalCallbacks.refreshLibrary();
    }

    notifySessionListeners();
  });

  listen<string>('download://log', (e) => {
    globalSession.logs = [...globalSession.logs.slice(-150), e.payload];
    notifySessionListeners();
  });

  listen<{ exit_code: number }>('download://complete', () => {
    globalSession.isDownloading = false;
    globalCallbacks.refreshLibrary();
    notifySessionListeners();
  });
}

export const DownloaderView: React.FC = () => {
  const { tracks, refreshLibrary, openInExplorer, createPlaylist } = usePlayer();
  const [downloadDir, setDownloadDir] = useState('C:\\Users\\sharm\\Music\\Spotify offline');
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
    sessionListeners.add(handleUpdate);
    return () => {
      sessionListeners.delete(handleUpdate);
    };
  }, []);

  useEffect(() => {
    invoke<{ download_directory: string }>('get_settings')
      .then((s) => {
        if (s?.download_directory) setDownloadDir(s.download_directory);
      })
      .catch(console.warn);
  }, []);

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
    if (showLogs) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [globalSession.logs.length, showLogs]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        globalSession.url = text.trim();
        notifySessionListeners();
      }
    } catch (e) {
      console.warn('Clipboard read error:', e);
    }
  };

  const handleStartDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetUrl = globalSession.url.trim();
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
    notifySessionListeners();

    try {
      await invoke('start_download', {
        url: targetUrl,
        outputDir: downloadDir,
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

  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-hidden select-none bg-[#0B0A0F]">
      {/* Top Compact Controls & Action Header */}
      <div className="px-6 pt-5 pb-3 flex flex-col gap-3 shrink-0">
        {/* Title & Folder Button */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-[#F4F2F7] tracking-tight">Downloader</h2>
            <span className="text-[11px] font-mono text-[#19E6A0] bg-[#19E6A0]/10 border border-[#19E6A0]/20 px-2.5 py-0.5 rounded-full">
              {sessionTracks.length} session tracks
            </span>
          </div>

          <button
            onClick={() => openInExplorer(downloadDir)}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#16151C] hover:bg-[#1D1C23] text-[#AAA6B2] hover:text-[#F4F2F7] border border-[#292731]/60 text-xs font-medium transition-colors cursor-pointer shrink-0"
            title="Open music storage folder"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[#E8C77A]" />
            <span>Open Music Folder</span>
          </button>
        </div>

        {/* Compact Single-Card Input */}
        <div className="p-3 rounded-2xl bg-[#14131A] border border-[#282631] flex flex-col gap-2.5">
          <form onSubmit={handleStartDownload} className="flex items-center gap-2.5">
            <div className="relative flex-1 flex items-center bg-[#0E0D14] rounded-xl border border-[#282631] focus-within:border-[#19E6A0]/50 transition-colors">
              <Link2 className="w-4 h-4 ml-3.5 text-[#65616F] shrink-0" />
              <input
                type="text"
                value={url}
                onChange={(e) => {
                  globalSession.url = e.target.value;
                  notifySessionListeners();
                }}
                disabled={isDownloading}
                placeholder="Paste Spotify track, album, or playlist link..."
                className="w-full pl-3 pr-10 py-2.5 text-xs bg-transparent text-[#F4F2F7] placeholder-[#65616F] focus:outline-none disabled:opacity-50"
              />
              <button
                type="button"
                onClick={handlePaste}
                disabled={isDownloading}
                className="absolute right-2 p-1.5 rounded-lg text-[#777381] hover:text-[#F4F2F7] hover:bg-[#1B1A24] transition-colors cursor-pointer"
                title="Paste from clipboard"
                aria-label="Paste from clipboard"
              >
                <ClipboardPaste className="w-3.5 h-3.5" />
              </button>
            </div>

            {isDownloading ? (
              <button
                type="button"
                onClick={handleCancel}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#FF667A]/15 hover:bg-[#FF667A]/25 text-[#FF667A] border border-[#FF667A]/30 font-medium text-xs transition-colors shrink-0 cursor-pointer"
              >
                <StopCircle className="w-3.5 h-3.5" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!url.trim()}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#19E6A0] hover:bg-[#35F0B1] disabled:bg-[#1A1922] disabled:text-[#65616F] text-black font-semibold text-xs transition-colors shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>
            )}
          </form>

          {/* Target Folder & Activity Logs Toggle */}
          <div className="flex items-center justify-between text-[11px] text-[#65616F] px-1">
            <div className="flex items-center gap-1.5 truncate">
              <Folder className="w-3 h-3 text-[#777381] shrink-0" />
              <span>Target folder:</span>
              <span
                onClick={() => openInExplorer(downloadDir)}
                className="text-[#9A96A5] hover:text-[#F4F2F7] cursor-pointer truncate transition-colors font-mono text-[10.5px]"
                title="Click to view folder in Explorer"
              >
                {downloadDir}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowLogs((prev) => !prev)}
              className="flex items-center gap-1 text-[11px] text-[#777381] hover:text-[#AAA6B2] transition-colors cursor-pointer shrink-0 ml-2"
            >
              <Terminal className="w-3 h-3 text-[#19E6A0]" />
              <span>Activity Log {logs.length > 0 ? `(${logs.length})` : ''}</span>
              {showLogs ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>
        </div>

        {/* Live Download Status & Progress Bar */}
        {(isDownloading || progressPercent > 0 || summary) && (
          <div className="p-3 rounded-2xl bg-[#14131A] border border-[#282631] space-y-2 shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                {isDownloading ? (
                  <Loader2 className="w-4 h-4 text-[#19E6A0] animate-spin shrink-0" />
                ) : summary ? (
                  <CheckCircle2 className="w-4 h-4 text-[#19E6A0] shrink-0" />
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
              <div className="pt-0.5 flex items-center gap-4 text-xs font-medium">
                <span className="text-[#19E6A0]">✓ {summary.succeeded} downloaded</span>
                {summary.failed > 0 && (
                  <span className="text-[#FF667A]">✗ {summary.failed} failed</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Collapsible Activity Stream */}
        {showLogs && (
          <div className="rounded-2xl bg-[#14131A] border border-[#282631] overflow-hidden shrink-0">
            <div className="px-4 py-1.5 bg-[#0E0D14] flex justify-end">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  globalSession.logs = [];
                  notifySessionListeners();
                }}
                className="text-[11px] text-[#65616F] hover:text-[#AAA6B2] transition-colors cursor-pointer"
              >
                Clear logs
              </button>
            </div>
            <div className="p-3 font-mono text-[11px] text-[#9A96A5] bg-[#0E0D14] max-h-44 overflow-y-auto space-y-1">
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
          </div>
        )}
      </div>

      {/* Main Full-Space Stage: List songs downloaded currently during this active download process */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="px-6 pt-2 pb-1 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[#AAA6B2]">
              Session Downloaded Songs
            </span>
            <span className="text-[11px] font-mono text-[#65616F]">
              ({sessionTracks.length})
            </span>
          </div>

          {isDownloading && (
            <span className="text-[11px] text-[#19E6A0] flex items-center gap-1.5 font-medium animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Downloading to library...</span>
            </span>
          )}
        </div>

        {/* Captures Full Remaining View Space with Normal App Track List View */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {sessionTracks.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-8 select-none">
              <div className="w-14 h-14 rounded-2xl bg-[#14131A] border border-[#282631] flex items-center justify-center mb-3">
                <Download className="w-6 h-6 text-[#19E6A0]/70" />
              </div>
              <p className="text-sm font-semibold text-[#F4F2F7]">No active downloads</p>
              <p className="text-xs text-[#777381] mt-1 max-w-sm">
                Only songs downloaded during the active download process will be shown here. Paste a link above to start downloading.
              </p>
            </div>
          ) : (
            <TrackList tracks={sessionTracks} />
          )}
        </div>
      </div>
    </div>
  );
};
