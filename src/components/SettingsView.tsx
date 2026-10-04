import React, { useState, useEffect } from 'react';
import {
  Folder,
  Plus,
  Trash2,
  RefreshCw,
  FolderOpen,
  Keyboard,
  Check,
  Download,
  RotateCcw,
} from 'lucide-react';

import { invoke } from '@tauri-apps/api/core';
import { usePlayer } from '../context/PlayerContext';
import { AppSettings } from '../types';
import { formatBytes } from '../utils/helpers';

export const SettingsView: React.FC = () => {
  const { tracks, refreshLibrary, openInExplorer } = usePlayer();
  const [settings, setSettings] = useState<AppSettings>({
    music_directories: ['C:\\Users\\sharm\\Music\\Spotify offline'],
    download_directory: 'C:\\Users\\sharm\\Music\\Spotify offline',
    volume: 0.8,
    equalizer_preset: 'Flat',
  });

  const [newDirInput, setNewDirInput] = useState('');
  const [downloadDirInput, setDownloadDirInput] = useState('C:\\Users\\sharm\\Music\\Spotify offline');
  const [isScanning, setIsScanning] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    invoke<AppSettings>('get_settings')
      .then((s) => {
        if (s) {
          setSettings(s);
          if (s.download_directory) setDownloadDirInput(s.download_directory);
        }
      })
      .catch(console.warn);
  }, []);

  const handleSave = async (updated: AppSettings) => {
    try {
      await invoke('save_settings', { settings: updated });
      setSettings(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  };

  const handleAddDirectory = () => {
    if (!newDirInput.trim()) return;
    const dir = newDirInput.trim();
    if (!settings.music_directories.includes(dir)) {
      const updated = {
        ...settings,
        music_directories: [...settings.music_directories, dir],
      };
      handleSave(updated);
      refreshLibrary(updated.music_directories);
    }
    setNewDirInput('');
  };

  const handleRemoveDirectory = (dirToRemove: string) => {
    const updated = {
      ...settings,
      music_directories: settings.music_directories.filter((d) => d !== dirToRemove),
    };
    handleSave(updated);
    refreshLibrary(updated.music_directories);
  };

  const handleSaveDownloadDir = () => {
    if (!downloadDirInput.trim()) return;
    const updated = {
      ...settings,
      download_directory: downloadDirInput.trim(),
    };
    handleSave(updated);
  };

  const handleResetDownloadDir = () => {
    const defaultDir = 'C:\\Users\\sharm\\Music\\Spotify offline';
    setDownloadDirInput(defaultDir);
    const updated = {
      ...settings,
      download_directory: defaultDir,
    };
    handleSave(updated);
  };

  const handleRescan = async () => {
    setIsScanning(true);
    await refreshLibrary(settings.music_directories);
    setTimeout(() => setIsScanning(false), 600);
  };

  const totalBytes = tracks.reduce((acc, t) => acc + (t.size_bytes || 0), 0);

  const shortcuts = [
    { key: 'Space', desc: 'Play / Pause audio' },
    { key: '← / →', desc: 'Seek backward / forward 5s' },
    { key: '↑ / ↓', desc: 'Volume up / down 5%' },
    { key: 'Ctrl + ← / →', desc: 'Previous / Next track' },
    { key: 'M', desc: 'Mute / Unmute audio' },
    { key: 'L', desc: 'Like / Favorite current track' },
    { key: 'Ctrl + B', desc: 'Toggle navigation sidebar' },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-8 py-6 select-none max-w-4xl mx-auto w-full space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-[#292731]">
        <div>
          <h2 className="text-xl font-bold text-[#F4F2F7] tracking-tight">Settings & Library</h2>
          <p className="text-xs text-[#9A96A5] mt-0.5">
            Manage local music directories, scanner behavior, and keyboard shortcuts.
          </p>
        </div>

        {saveSuccess && (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-[#19E6A0]/15 text-[#19E6A0] text-xs font-semibold border border-[#19E6A0]/30">
            <Check className="w-3.5 h-3.5" />
            <span>Saved</span>
          </span>
        )}
      </div>

      {/* Music Folders Section */}
      <div className="p-5 rounded-xl bg-[#16151C] border border-[#292731] space-y-3.5 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#14131A] text-[#E8C77A] border border-[#282631]">
              <Folder className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-[#F4F2F7]">Music Library Folders</h3>
              <p className="text-[11px] text-[#777381]">
                Folders scanned by the Rust engine for offline audio files
              </p>
            </div>
          </div>

          <button
            onClick={handleRescan}
            disabled={isScanning}
            className="group flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1D1C23] hover:bg-[#211F26] border border-[#292731] text-xs font-medium text-[#F4F2F7] transition-all duration-200 disabled:opacity-50 cursor-pointer active:scale-[0.98]"
          >
            <RefreshCw className={`w-3.5 h-3.5 transition-transform duration-300 ${isScanning ? 'animate-spin text-[#19E6A0]' : 'group-hover:rotate-90'}`} />
            <span>Rescan All</span>
          </button>
        </div>

        {/* Directory List */}
        <div className="space-y-1.5">
          {settings.music_directories.map((dir) => (
            <div
              key={dir}
              className="flex items-center justify-between p-2.5 rounded-lg bg-[#14131A] border border-[#282631]"
            >
              <div className="flex items-center gap-2.5 min-w-0 pr-3">
                <Folder className="w-3.5 h-3.5 text-[#E8C77A] shrink-0" />
                <span className="font-mono text-xs text-[#AAA6B2] truncate">{dir}</span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => openInExplorer(dir)}
                  className="p-1 text-[#777381] hover:text-[#F4F2F7] hover:bg-[#1C1B22] rounded transition-all duration-200 active:scale-95 cursor-pointer"
                  title="Open folder in Explorer"
                  aria-label="Open folder in Explorer"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                </button>
                {settings.music_directories.length > 1 && (
                  <button
                    onClick={() => handleRemoveDirectory(dir)}
                    className="p-1 text-[#777381] hover:text-[#FF667A] hover:bg-[#1C1B22] rounded transition-all duration-200 active:scale-95 cursor-pointer"
                    title="Remove folder"
                    aria-label="Remove folder"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Add custom folder input */}
        <div className="flex gap-2 pt-1">
          <input
            type="text"
            value={newDirInput}
            onChange={(e) => setNewDirInput(e.target.value)}
            placeholder="Enter absolute directory path (e.g. D:\MyMusic)..."
            className="flex-1 px-3 py-2 rounded-lg bg-[#14131A] border border-[#282631] text-xs text-[#F4F2F7] placeholder-[#65616F] focus:outline-none focus:border-[#19E6A0]/50"
          />
          <button
            onClick={handleAddDirectory}
            disabled={!newDirInput.trim()}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#19E6A0] hover:bg-[#35F0B1] disabled:opacity-50 text-black font-semibold text-xs transition-all duration-200 active:scale-[0.98] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Folder</span>
          </button>
        </div>
      </div>

      {/* Download Directory Configuration Section */}
      <div className="p-5 rounded-xl bg-[#16151C] border border-[#292731] space-y-3.5 shadow-md">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#14131A] text-[#19E6A0] border border-[#282631]">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-[#F4F2F7]">Default Download Destination</h3>
              <p className="text-[11px] text-[#777381]">
                Target directory for songs saved via in-app downloader
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => openInExplorer(settings.download_directory)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1D1C23] hover:bg-[#211F26] text-xs font-medium text-[#AAA6B2] hover:text-[#F4F2F7] border border-[#292731] transition-all duration-200 active:scale-[0.98] cursor-pointer"
              title="Reveal in Windows Explorer"
            >
              <FolderOpen className="w-3.5 h-3.5 text-[#E8C77A]" />
              <span>Reveal Folder</span>
            </button>
            <button
              onClick={handleResetDownloadDir}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1D1C23] hover:bg-[#211F26] text-xs font-medium text-[#777381] hover:text-[#F4F2F7] border border-[#292731] transition-all duration-200 active:scale-[0.98] cursor-pointer"
              title="Reset to default music directory"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={downloadDirInput}
            onChange={(e) => setDownloadDirInput(e.target.value)}
            placeholder="Enter absolute download folder path..."
            className="flex-1 px-3 py-2 rounded-lg bg-[#14131A] border border-[#282631] font-mono text-xs text-[#F4F2F7] placeholder-[#65616F] focus:outline-none focus:border-[#19E6A0]/50"
          />
          <button
            onClick={handleSaveDownloadDir}
            disabled={!downloadDirInput.trim() || downloadDirInput === settings.download_directory}
            className="px-4 py-2 rounded-lg bg-[#19E6A0] hover:bg-[#35F0B1] disabled:opacity-50 text-black font-semibold text-xs transition-all duration-200 active:scale-[0.98] cursor-pointer"
          >
            Save Target
          </button>
        </div>
      </div>

      {/* Library Statistics with Champagne Highlight */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-xl bg-[#16151C] border border-[#292731]">
          <span className="text-[10px] font-semibold text-[#777381] uppercase tracking-wider block mb-1">
            Offline Tracks
          </span>
          <span className="text-xl font-bold text-[#F4F2F7]">{tracks.length}</span>
        </div>

        <div className="p-4 rounded-xl bg-[#16151C] border border-[#292731]">
          <span className="text-[10px] font-semibold text-[#777381] uppercase tracking-wider block mb-1">
            Storage Size
          </span>
          <span className="text-xl font-bold text-[#F4F2F7]">{formatBytes(totalBytes)}</span>
        </div>

        <div className="p-4 rounded-xl bg-[#16151C] border border-[#292731]">
          <span className="text-[10px] font-semibold text-[#777381] uppercase tracking-wider block mb-1">
            Audio Quality
          </span>
          <span className="text-xl font-bold text-[#E8C77A]">320 kbps HQ</span>
        </div>
      </div>

      {/* Keyboard Shortcuts Table */}
      <div className="p-5 rounded-xl bg-[#16151C] border border-[#292731] space-y-3 shadow-md">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#14131A] text-[#AAA6B2] border border-[#282631]">
            <Keyboard className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-[#F4F2F7]">Keyboard Shortcuts</h3>
            <p className="text-[11px] text-[#777381]">Quick desktop playback controls</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
          {shortcuts.map((sc) => (
            <div
              key={sc.key}
              className="flex items-center justify-between p-2.5 rounded-lg bg-[#14131A] border border-[#282631]"
            >
              <span className="text-xs text-[#AAA6B2]">{sc.desc}</span>
              <kbd className="px-2 py-0.5 rounded bg-[#100F14] border border-[#292731] font-mono text-[10px] text-[#19E6A0] font-bold shadow-inner">
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>

      {/* App Info Footer */}
      <div className="flex items-center justify-between px-1 pt-1 text-[11px] text-[#65616F]">
        <div className="flex items-center gap-2">
          <img src="/app-icon.png" alt="Offline Player" className="w-4 h-4 rounded-md object-contain shadow-sm" />
          <span>Offline Player v0.1.0 • Tauri v2 + Rust Audio Engine</span>
        </div>
        <span>Built for Gautam</span>
      </div>
    </div>
  );
};
