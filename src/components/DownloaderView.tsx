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
    <div className="flex-1 flex flex-col h-full overflow-y-auto px-8 py-6 select-none max-w-5xl mx-auto w-full gap-5">
      {/* Header Banner */}
      <div className="p-6 rounded-xl bg-[#16151C] border border-[#292731] shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#777381]">
              Savify Engine
            </span>
            <span className="text-[10px] text-[#65616F]">•</span>
            <span className="text-[10px] font-mono font-semibold text-[#E8C77A]">320 kbps HQ</span>
          </div>
          <h2 className="text-xl font-bold text-[#F4F2F7] tracking-tight">Spotify Music Downloader</h2>
          <p className="text-xs text-[#9A96A5] mt-1">
            Download songs, playlists, or albums directly into your offline library.
          </p>
        </div>

        <button
          onClick={() => openInExplorer(downloadDir)}
          className="flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#1D1C23] hover:bg-[#211F26] text-[#AAA6B2] hover:text-[#F4F2F7] border border-[#292731] text-xs font-medium transition-colors duration-150 shrink-0 cursor-pointer"
        >
          <FolderOpen className="w-4 h-4 text-[#E8C77A]" />
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
            className="w-full pl-4 pr-24 py-3 rounded-lg bg-[#14131A] border border-[#282631] text-xs text-[#F4F2F7] placeholder-[#65616F] focus:outline-none focus:border-[#19E6A0]/50 focus:ring-2 focus:ring-[#19E6A0]/10 transition-colors duration-150 disabled:opacity-50"
          />
          <div className="absolute right-2 flex items-center">
            <button
              type="button"
              onClick={handlePaste}
              disabled={isDownloading}
              className="p-1.5 rounded-md text-[#777381] hover:text-[#F4F2F7] hover:bg-[#1D1C23] text-xs transition-colors cursor-pointer"
              title="Paste from clipboard"
              aria-label="Paste from clipboard"
            >
              <ClipboardPaste className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="text-[11px] text-[#65616F] truncate">
            Target folder: <span className="font-mono text-[#9A96A5]">{downloadDir}</span>
          </span>

          <div className="flex items-center gap-2">
            {isDownloading ? (
              <button
                type="button"
                onClick={handleCancel}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#FF667A] hover:bg-[#ff4d64] text-white font-semibold text-xs transition-colors cursor-pointer"
              >
                <StopCircle className="w-4 h-4" />
                <span>Stop Download</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!url.trim()}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-[#19E6A0] hover:bg-[#35F0B1] disabled:bg-[#16151C] disabled:text-[#65616F] text-black font-semibold text-xs transition-colors cursor-pointer"
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
        <div className="p-4 rounded-xl bg-[#16151C] border border-[#292731] space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isDownloading ? (
                <Loader2 className="w-3.5 h-3.5 text-[#19E6A0] animate-spin" />
              ) : summary ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-[#19E6A0]" />
              ) : null}
              <span className="text-xs font-medium text-[#F4F2F7]">{statusMessage}</span>
            </div>
            <span className="text-xs font-mono font-semibold text-[#19E6A0]">
              {progressPercent}%
            </span>
          </div>

          {currentTrackName && (
            <p className="text-[11px] text-[#777381] truncate">
              Processing: <span className="text-[#AAA6B2]">{currentTrackName}</span>
            </p>
          )}

          {/* Progress bar */}
          <div className="w-full h-1.5 rounded-full bg-[#292731] overflow-hidden">
            <div
              className="h-full bg-[#19E6A0] rounded-full transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          {summary && (
            <div className="pt-1 flex items-center gap-3 text-xs font-medium">
              <span className="text-[#19E6A0]">✓ {summary.succeeded} downloaded</span>
              {summary.failed > 0 && (
                <span className="text-[#FF667A]">✗ {summary.failed} failed</span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Terminal Log Console */}
      <div className="flex-1 flex flex-col min-h-[200px] rounded-xl bg-[#100F14] border border-[#292731] overflow-hidden">
        <div className="px-4 py-2 bg-[#16151C] border-b border-[#292731] flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-mono text-[#777381]">
            <Terminal className="w-3.5 h-3.5 text-[#19E6A0]" />
            <span>Savify Console</span>
          </div>
          <button
            onClick={() => setLogs([])}
            className="text-[11px] text-[#65616F] hover:text-[#AAA6B2] transition-colors cursor-pointer"
          >
            Clear logs
          </button>
        </div>

        <div className="flex-1 p-3 font-mono text-[11px] text-[#9A96A5] overflow-y-auto space-y-1">
          {logs.length === 0 ? (
            <div className="text-[#65616F]">Console ready. Download logs will stream here...</div>
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
    </div>
  );
};
