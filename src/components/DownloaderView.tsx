import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  FolderOpen,
  CheckCircle2,
  Terminal,
  Loader2,
  ClipboardPaste,
  StopCircle,
} from 'lucide-react';

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { usePlayer } from '../context/PlayerContext';
import { DownloadLogEvent } from '../types';

export const DownloaderView: React.FC = () => {
  const { refreshLibrary, openInExplorer } = usePlayer();
  const [url, setUrl] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Ready to download Spotify songs');
  const [currentTrackName, setCurrentTrackName] = useState('');
  const [logs, setLogs] = useState<string[]>([]);
  const [summary, setSummary] = useState<{ total: number; succeeded: number; failed: number } | null>(null);

  const logsEndRef = useRef<HTMLDivElement | null>(null);
  const [downloadDir, setDownloadDir] = useState('C:\\Users\\sharm\\Music\\Spotify offline');

  useEffect(() => {
    invoke<{ download_directory: string }>('get_settings')
      .then((s) => {
        if (s?.download_directory) setDownloadDir(s.download_directory);
      })
      .catch(console.warn);
  }, []);

  // Listen to Tauri downloader streaming events
  useEffect(() => {
    let unlistenEvent: (() => void) | null = null;
    let unlistenLog: (() => void) | null = null;
    let unlistenComplete: (() => void) | null = null;

    const setupListeners = async () => {
      unlistenEvent = await listen<DownloadLogEvent>('download://event', (e) => {
        const payload = e.payload;
        if (payload.message) {
          setStatusMessage(payload.message);
        }
        if (payload.percent !== undefined) {
          setProgressPercent(payload.percent);
        }
        if (payload.track) {
          setCurrentTrackName(payload.track);
        }
        if (payload.type === 'completed') {
          setSummary({
            total: payload.total || 0,
            succeeded: payload.succeeded || 0,
            failed: payload.failed || 0,
          });
          setIsDownloading(false);
          refreshLibrary();
        }
      });

      unlistenLog = await listen<string>('download://log', (e) => {
        setLogs((prev) => [...prev.slice(-150), e.payload]);
      });

      unlistenComplete = await listen<{ exit_code: number }>('download://complete', () => {
        setIsDownloading(false);
        refreshLibrary();
      });
    };

    setupListeners();

    return () => {
      if (unlistenEvent) unlistenEvent();
      if (unlistenLog) unlistenLog();
      if (unlistenComplete) unlistenComplete();
    };
  }, [refreshLibrary]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setUrl(text.trim());
    } catch (e) {
      console.warn('Clipboard read error:', e);
    }
  };

  const handleStartDownload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim() || isDownloading) return;

    setIsDownloading(true);
    setProgressPercent(5);
    setStatusMessage('Initiating Savify downloader...');
    setCurrentTrackName('');
    setSummary(null);
    setLogs([`[START] Connecting to Spotify: ${url}`]);

    try {
      await invoke('start_download', {
        url: url.trim(),
        outputDir: downloadDir,
      });
    } catch (err) {
      setIsDownloading(false);
      setStatusMessage(`Error: ${String(err)}`);
      setLogs((prev) => [...prev, `[ERROR] ${String(err)}`]);
    }
  };

  const handleCancel = async () => {
    try {
      await invoke('cancel_download');
      setIsDownloading(false);
      setStatusMessage('Download process stopped');
      setLogs((prev) => [...prev, '[CANCELLED] User terminated download process']);
    } catch (e) {
      console.warn('Cancel error:', e);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto px-8 py-6 select-none max-w-5xl mx-auto w-full gap-6">
      {/* Header Banner */}
      <div className="p-6 rounded-xl glass-panel-elevated bg-gradient-to-r from-emerald-950/40 via-[#13141c]/90 to-cyan-950/30 border border-white/10 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-bold text-[10px] uppercase tracking-wider border border-emerald-500/30">
              Savify Engine
            </span>
            <span className="text-xs text-gray-400">Strictly 320 kbps MP3</span>
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">Spotify Music Downloader</h2>
          <p className="text-xs text-gray-400 mt-1">
            Download songs, playlists, or albums directly into your offline library.
          </p>
        </div>

        <button
          onClick={() => openInExplorer(downloadDir)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-200 hover:text-white border border-white/10 text-xs font-semibold transition-colors duration-150 shrink-0"
        >
          <FolderOpen className="w-4 h-4 text-emerald-400" />
          <span>Open Music Folder</span>
        </button>
      </div>

      {/* Input Form */}
      <form onSubmit={handleStartDownload} className="flex flex-col gap-3">
        <div className="relative flex items-center">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={isDownloading}
            placeholder="Paste Spotify track, album, or playlist URL (e.g. https://open.spotify.com/...)"
            className="w-full pl-5 pr-28 py-3.5 rounded-lg bg-black/50 border border-white/10 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500 transition-colors duration-150 shadow-inner disabled:opacity-50"
          />
          <div className="absolute right-3 flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePaste}
              disabled={isDownloading}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 text-xs flex items-center gap-1 transition-colors duration-150"
              title="Paste from clipboard"
            >
              <ClipboardPaste className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-[11px] text-gray-500 truncate">
            Target folder: <span className="font-mono text-gray-400">{downloadDir}</span>
          </span>

          <div className="flex items-center gap-2">
            {isDownloading ? (
              <button
                type="button"
                onClick={handleCancel}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-colors duration-150 shadow-lg"
              >
                <StopCircle className="w-4 h-4" />
                <span>Stop Download</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!url.trim()}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:bg-gray-800 disabled:text-gray-500 text-black font-bold text-xs transition-colors duration-150 shadow-lg hover:scale-[1.02] active:scale-[0.98]"
              >
                <Download className="w-4 h-4" />
                <span>Start Download</span>
              </button>
            )}
          </div>
        </div>
      </form>

      {/* Live Download Status & Progress Bar */}
      {(isDownloading || progressPercent > 0 || summary) && (
        <div className="p-5 rounded-xl glass-panel bg-black/40 border border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {isDownloading ? (
                <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
              ) : summary ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              ) : null}
              <span className="text-xs font-semibold text-white">{statusMessage}</span>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-400">
              {progressPercent}%
            </span>
          </div>

          {currentTrackName && (
            <p className="text-xs text-gray-400 truncate">
              Processing: <span className="text-white font-medium">{currentTrackName}</span>
            </p>
          )}

          {/* Progress bar */}
          <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden relative">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400 rounded-full transition-colors duration-150 relative"
              style={{ width: `${progressPercent}%` }}
            >
              {isDownloading && (
                <div className="absolute inset-0 bg-white/20 animate-pulse" />
              )}
            </div>
          </div>

          {summary && (
            <div className="pt-2 flex items-center gap-4 text-xs font-medium text-gray-300">
              <span className="text-emerald-400">✓ {summary.succeeded} downloaded</span>
              {summary.failed > 0 && (
                <span className="text-rose-400">✗ {summary.failed} failed</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Terminal Log Console */}
      <div className="flex-1 flex flex-col min-h-[220px] rounded-xl bg-black/70 border border-white/10 overflow-hidden shadow-2xl">
        <div className="px-4 py-2.5 bg-white/5 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono text-gray-400">
            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
            <span>Savify Stream Console</span>
          </div>
          <button
            onClick={() => setLogs([])}
            className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors duration-150"
          >
            Clear logs
          </button>
        </div>

        <div className="flex-1 p-4 font-mono text-[11px] text-gray-300 overflow-y-auto space-y-1">
          {logs.length === 0 ? (
            <div className="text-gray-600">Console ready. Logs will appear here during download...</div>
          ) : (
            logs.map((log, i) => (
              <div
                key={i}
                className={`leading-relaxed break-all ${
                  log.includes('[ERROR]') || log.includes('failed')
                    ? 'text-rose-400'
                    : log.includes('Downloaded') || log.includes('Completed')
                    ? 'text-emerald-400 font-semibold'
                    : 'text-gray-400'
                }`}
              >
                {log}
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
};
