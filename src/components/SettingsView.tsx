import React, { useState, useEffect } from 'react';
import {
  Folder,
  Plus,
  Trash2,
  RefreshCw,
  FolderOpen,
  Keyboard,
  Info,
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
    { key: 'Ctrl + B', desc: 'Toggle sidebar' },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-8 py-8 select-none max-w-4xl mx-auto w-full space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/5">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">Settings & Library</h2>
          <p className="text-xs text-gray-400 mt-1">
            Manage local music directories, scanner behavior, and keyboard shortcuts.
          </p>
        </div>

        {saveSuccess && (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-xs font-semibold border border-emerald-500/30">
            <Check className="w-3.5 h-3.5" />
            <span>Saved</span>
          </span>
        )}
      </div>

      {/* Music Folders Section */}
      <div className="p-6 rounded-xl glass-panel bg-black/30 border border-white/10 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Folder className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Music Library Folders</h3>
              <p className="text-xs text-gray-400">
                Folders scanned by the Rust backend for offline audio files
              </p>
            </div>
          </div>

          <button
            onClick={handleRescan}
            disabled={isScanning}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-white transition-colors duration-150 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Rescan All</span>
          </button>
        </div>

        {/* Directory List */}
        <div className="space-y-2">
          {settings.music_directories.map((dir) => (
            <div
              key={dir}
              className="flex items-center justify-between p-3 rounded-lg bg-white/[0.04] border border-white/5 hover:bg-white/[0.07] transition-colors duration-150"
            >
              <div className="flex items-center gap-3 min-w-0 pr-3">
                <Folder className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-mono text-xs text-gray-200 truncate">{dir}</span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => openInExplorer(dir)}
                  className="p-1.5 text-gray-400 hover:text-white rounded-md transition-colors cursor-pointer"
                  title="Open folder in Explorer"
                  aria-label="Open folder in Explorer"
                >
                  <FolderOpen className="w-4 h-4" />
                </button>
                {settings.music_directories.length > 1 && (
                  <button
                    onClick={() => handleRemoveDirectory(dir)}
                    className="p-1.5 text-gray-400 hover:text-rose-400 rounded-md transition-colors cursor-pointer"
                    title="Remove folder"
                    aria-label="Remove folder"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Add custom folder input */}
        <div className="flex gap-2 pt-2">
          <input
            type="text"
            value={newDirInput}
            onChange={(e) => setNewDirInput(e.target.value)}
            placeholder="Enter absolute directory path (e.g. D:\MyMusic)..."
            className="flex-1 px-4 py-2.5 rounded-lg bg-black/40 border border-white/10 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
          />
          <button
            onClick={handleAddDirectory}
            disabled={!newDirInput.trim()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold text-xs transition-colors duration-150 shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Folder</span>
          </button>
        </div>
      </div>

      {/* Download Directory Configuration Section */}
      <div className="p-6 rounded-xl glass-panel bg-black/30 border border-white/10 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Download className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Default Download Directory</h3>
              <p className="text-xs text-gray-400">
                Target destination folder for Spotify downloads via Savify
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => openInExplorer(settings.download_directory)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-gray-300 hover:text-white border border-white/10 transition-colors duration-150 cursor-pointer"
              title="Reveal in Windows Explorer"
            >
              <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
              <span>Reveal Folder</span>
            </button>
            <button
              onClick={handleResetDownloadDir}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-semibold text-gray-400 hover:text-white border border-white/10 transition-colors duration-150 cursor-pointer"
              title="Reset to default music directory"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Default</span>
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={downloadDirInput}
            onChange={(e) => setDownloadDirInput(e.target.value)}
            placeholder="Enter absolute download folder path..."
            className="flex-1 px-4 py-2.5 rounded-lg bg-black/40 border border-white/10 font-mono text-xs text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
          />
          <button
            onClick={handleSaveDownloadDir}
            disabled={!downloadDirInput.trim() || downloadDirInput === settings.download_directory}
            className="px-4 py-2.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-black font-bold text-xs transition-colors duration-150 shadow-sm cursor-pointer"
          >
            Save Target
          </button>
        </div>
      </div>

      {/* Library Statistics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-5 rounded-xl glass-panel bg-white/[0.02] border border-white/5">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">
            Offline Tracks
          </span>
          <span className="text-2xl font-black text-white">{tracks.length}</span>
        </div>

        <div className="p-5 rounded-xl glass-panel bg-white/[0.02] border border-white/5">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">
            Storage Size
          </span>
          <span className="text-2xl font-black text-white">{formatBytes(totalBytes)}</span>
        </div>

        <div className="p-5 rounded-xl glass-panel bg-white/[0.02] border border-white/5">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider block mb-1">
            Audio Quality
          </span>
          <span className="text-2xl font-black text-[var(--accent)]">320 kbps</span>
        </div>
      </div>

      {/* Keyboard Shortcuts Table */}
      <div className="p-6 rounded-xl glass-panel bg-black/30 border border-white/10 space-y-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Keyboard className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Keyboard Shortcuts</h3>
            <p className="text-xs text-gray-400">Quick controls without lifting your hands</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          {shortcuts.map((sc) => (
            <div
              key={sc.key}
              className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/5"
            >
              <span className="text-xs text-gray-300">{sc.desc}</span>
              <kbd className="px-2.5 py-1 rounded-md bg-black/60 border border-white/20 font-mono text-[11px] text-[var(--accent)] font-bold shadow-inner">
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>

      {/* App Info Footer */}
      <div className="flex items-center justify-between px-2 pt-2 text-[11px] text-gray-500">
        <div className="flex items-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-gray-400" />
          <span>Offline Player Desktop v0.1.0 • Tauri v2 + Rust Backend</span>
        </div>
        <span>Built for Gautam</span>
      </div>
    </div>
  );
};
