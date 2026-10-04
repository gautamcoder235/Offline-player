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
  Music,
  HardDrive,
  Volume2,
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
    { key: 'Ctrl + K', desc: 'Quick search library' },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-6 md:px-8 py-6 select-none w-full space-y-6 pb-12 bg-[#0B0A0F]">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[#292731]/60">
        <div>
          <h2 className="text-xl font-bold text-[#F4F2F7] tracking-tight">Settings & Library</h2>
          <p className="text-xs text-[#777381] mt-0.5">
            Configure local audio directories, downloader storage, and view shortcuts.
          </p>
        </div>

        {saveSuccess && (
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#19E6A0]/10 text-[#19E6A0] text-xs font-semibold border border-[#19E6A0]/25 animate-in fade-in zoom-in-95 duration-200">
            <Check className="w-3.5 h-3.5" />
            <span>Saved</span>
          </span>
        )}
      </div>

      {/* Music Folders Section */}
      <div className="p-5 rounded-2xl bg-[#14131A] border border-[#282631] space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1C1B24] border border-white/[0.06] flex items-center justify-center text-[#AAA6B2] shadow-sm">
              <Folder className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-[#F4F2F7]">Music Library Folders</h3>
              <p className="text-[11px] text-[#777381]">
                Folders indexed by the audio engine for offline playback
              </p>
            </div>
          </div>

          <button
            onClick={handleRescan}
            disabled={isScanning}
            className="group flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#1C1B23] hover:bg-[#23222C] border border-[#282631] text-xs font-medium text-[#F4F2F7] transition-all duration-200 disabled:opacity-50 cursor-pointer active:scale-[0.98]"
            title="Rescan music library from disk"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-[#AAA6B2] transition-transform duration-300 ${
                isScanning ? 'animate-spin text-[#19E6A0]' : 'group-hover:rotate-90'
              }`}
            />
            <span>Rescan Library</span>
          </button>
        </div>

        {/* Directory List */}
        <div className="space-y-2">
          {settings.music_directories.map((dir) => (
            <div
              key={dir}
              className="flex items-center justify-between p-3 rounded-xl bg-[#0E0D14] border border-[#282631]/80 hover:border-[#282631] transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0 pr-3">
                <Folder className="w-4 h-4 text-[#777381] shrink-0" />
                <span className="font-mono text-xs text-[#AAA6B2] truncate">{dir}</span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => openInExplorer(dir)}
                  className="p-1.5 text-[#777381] hover:text-[#F4F2F7] hover:bg-[#1C1B24] rounded-lg transition-colors cursor-pointer"
                  title="Open folder in Explorer"
                  aria-label="Open folder in Explorer"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                </button>
                {settings.music_directories.length > 1 && (
                  <button
                    onClick={() => handleRemoveDirectory(dir)}
                    className="p-1.5 text-[#777381] hover:text-[#FF667A] hover:bg-[#FF667A]/10 rounded-lg transition-colors cursor-pointer"
                    title="Remove folder from library"
                    aria-label="Remove folder from library"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Add custom folder input */}
        <div className="flex gap-2.5 pt-1">
          <div className="relative flex-1 flex items-center bg-[#0E0D14] rounded-xl border border-[#282631] focus-within:border-[#19E6A0]/50 transition-colors">
            <Folder className="w-4 h-4 ml-3.5 text-[#65616F] shrink-0" />
            <input
              type="text"
              value={newDirInput}
              onChange={(e) => setNewDirInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddDirectory();
                }
              }}
              placeholder="Enter absolute directory path (e.g. D:\Music)..."
              className="w-full pl-3 pr-3 py-2.5 text-xs bg-transparent text-[#F4F2F7] placeholder-[#65616F] focus:outline-none"
            />
          </div>
          <button
            onClick={handleAddDirectory}
            disabled={!newDirInput.trim()}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#19E6A0] hover:bg-[#35F0B1] disabled:bg-[#1A1922] disabled:text-[#65616F] text-black font-semibold text-xs transition-colors shrink-0 cursor-pointer active:scale-[0.98]"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Folder</span>
          </button>
        </div>
      </div>

      {/* Download Directory Configuration Section */}
      <div className="p-5 rounded-2xl bg-[#14131A] border border-[#282631] space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1C1B24] border border-white/[0.06] flex items-center justify-center text-[#AAA6B2] shadow-sm">
              <Download className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-semibold text-[#F4F2F7]">Download Storage Destination</h3>
              <p className="text-[11px] text-[#777381]">
                Directory where songs downloaded via the in-app Downloader are saved
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => openInExplorer(settings.download_directory)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1C1B23] hover:bg-[#23222C] text-xs font-medium text-[#AAA6B2] hover:text-[#F4F2F7] border border-[#282631] transition-colors cursor-pointer active:scale-[0.98]"
              title="Reveal in Windows Explorer"
            >
              <FolderOpen className="w-3.5 h-3.5 text-[#AAA6B2]" />
              <span>Reveal Folder</span>
            </button>
            <button
              onClick={handleResetDownloadDir}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1C1B23] hover:bg-[#23222C] text-xs font-medium text-[#777381] hover:text-[#F4F2F7] border border-[#282631] transition-colors cursor-pointer active:scale-[0.98]"
              title="Reset to default music directory"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
          </div>
        </div>

        <div className="flex gap-2.5">
          <div className="relative flex-1 flex items-center bg-[#0E0D14] rounded-xl border border-[#282631] focus-within:border-[#19E6A0]/50 transition-colors">
            <input
              type="text"
              value={downloadDirInput}
              onChange={(e) => setDownloadDirInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSaveDownloadDir();
                }
              }}
              placeholder="Enter absolute download folder path..."
              className="w-full px-3.5 py-2.5 font-mono text-xs bg-transparent text-[#F4F2F7] placeholder-[#65616F] focus:outline-none"
            />
          </div>
          <button
            onClick={handleSaveDownloadDir}
            disabled={!downloadDirInput.trim() || downloadDirInput === settings.download_directory}
            className="px-4 py-2.5 rounded-xl bg-[#19E6A0] hover:bg-[#35F0B1] disabled:bg-[#1A1922] disabled:text-[#65616F] text-black font-semibold text-xs transition-colors shrink-0 cursor-pointer active:scale-[0.98]"
          >
            Save Target
          </button>
        </div>
      </div>

      {/* Library Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="p-4 rounded-2xl bg-[#14131A] border border-[#282631] flex items-center gap-3.5 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-[#1C1B24] border border-white/[0.06] flex items-center justify-center text-[#AAA6B2] shrink-0">
            <Music className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-semibold text-[#777381] uppercase tracking-wider block">
              Offline Tracks
            </span>
            <span className="text-lg font-bold text-[#F4F2F7] leading-tight block">{tracks.length}</span>
            <span className="text-[10.5px] text-[#65616F]">Indexed in library</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#14131A] border border-[#282631] flex items-center gap-3.5 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-[#1C1B24] border border-white/[0.06] flex items-center justify-center text-[#AAA6B2] shrink-0">
            <HardDrive className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-semibold text-[#777381] uppercase tracking-wider block">
              Storage Size
            </span>
            <span className="text-lg font-bold text-[#F4F2F7] leading-tight block">{formatBytes(totalBytes)}</span>
            <span className="text-[10.5px] text-[#65616F]">Local audio data</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-[#14131A] border border-[#282631] flex items-center gap-3.5 shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-[#1C1B24] border border-white/[0.06] flex items-center justify-center text-[#AAA6B2] shrink-0">
            <Volume2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] font-semibold text-[#777381] uppercase tracking-wider block">
              Audio Quality
            </span>
            <span className="text-lg font-bold text-[#19E6A0] leading-tight block">320 kbps HQ</span>
            <span className="text-[10.5px] text-[#65616F]">High-definition MP3</span>
          </div>
        </div>
      </div>

      {/* Keyboard Shortcuts Table */}
      <div className="p-5 rounded-2xl bg-[#14131A] border border-[#282631] space-y-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#1C1B24] border border-white/[0.06] flex items-center justify-center text-[#AAA6B2] shadow-sm">
            <Keyboard className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-semibold text-[#F4F2F7]">Keyboard Shortcuts</h3>
            <p className="text-[11px] text-[#777381]">Desktop hotkeys for instantaneous control</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {shortcuts.map((sc) => (
            <div
              key={sc.key}
              className="flex items-center justify-between p-3 rounded-xl bg-[#0E0D14] border border-[#282631]/80 hover:border-[#282631] transition-colors"
            >
              <span className="text-xs text-[#AAA6B2]">{sc.desc}</span>
              <kbd className="px-2.5 py-1 rounded-lg bg-[#181722] border border-[#282631] font-mono text-[11px] text-[#19E6A0] font-semibold shadow-sm">
                {sc.key}
              </kbd>
            </div>
          ))}
        </div>
      </div>

      {/* App Info Footer */}
      <div className="flex items-center justify-between px-1 pt-2 text-xs text-[#65616F]">
        <div className="flex items-center gap-2">
          <img src="/app-icon.png" alt="Offline Player" className="w-4 h-4 rounded-md object-contain shadow-sm" />
          <span>Offline Player v0.1.0 • Tauri v2 + Rust Audio Engine</span>
        </div>
        <span className="font-mono text-[11px] text-[#4B4854]">Obsidian Edition</span>
      </div>
    </div>
  );
};
