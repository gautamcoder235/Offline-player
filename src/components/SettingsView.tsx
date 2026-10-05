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
  Sparkles,
  ArrowDownCircle,
  AlertCircle,
  Loader2,
  Sliders,
  Layers,
  Palette,
} from 'lucide-react';

import { invoke } from '@tauri-apps/api/core';
import { usePlayer } from '../context/PlayerContext';
import { useUpdate } from '../context/UpdateContext';
import { AppSettings } from '../types';
import { formatBytes } from '../utils/helpers';

export const SettingsView: React.FC = () => {
  const {
    tracks,
    refreshLibrary,
    openInExplorer,
    crossfadeDuration,
    setCrossfadeDuration,
    themeAppearance,
    setThemeAppearance,
  } = usePlayer();
  const isGlass = themeAppearance === 'aura_glass';
  const {
    status: updateStatus,
    updateInfo,
    currentVersion,
    progress: updateProgress,
    error: updateError,
    checkForUpdates,
    downloadAndInstall,
    restartApp,
    dismissUpdate,
  } = useUpdate();
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
    { key: 'Ctrl + M', desc: 'Toggle Always-On-Top Mini-Player' },
  ];

  return (
    <div className="flex-1 overflow-y-auto px-6 md:px-8 py-6 select-none w-full space-y-6 pb-12 bg-transparent">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[#292731]/60">
        <div>
          <h2 className="text-xl font-bold text-[#F4F2F7] tracking-tight">Settings & Library</h2>
          <p className="text-xs text-[#777381] mt-0.5">
            Configure local audio directories, downloader storage, appearance, and view shortcuts.
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
      <div className={`p-5 rounded-2xl border space-y-4 shadow-sm transition-colors duration-200 ${
        isGlass ? 'bg-[#14131A]/70 backdrop-blur-md border-white/[0.08]' : 'bg-[#14131A] border-[#282631]'
      }`}>
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

      {/* Theme & Background Appearance Section */}
      <div className={`p-5 rounded-2xl border space-y-4 shadow-sm transition-colors duration-200 ${
        isGlass ? 'bg-[#14131A]/70 backdrop-blur-md border-white/[0.08]' : 'bg-[#14131A] border-[#282631]'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1C1B24] border border-white/[0.06] flex items-center justify-center text-[#AAA6B2] shadow-sm">
              <Palette className="w-4 h-4 text-[#19E6A0]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-[#F4F2F7]">Theme & Background Appearance</h3>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-[#1C1B24] border border-[#282631] text-[#19E6A0] font-semibold">
                  {isGlass ? 'Transparent Front Panels' : 'Classic Obsidian'}
                </span>
              </div>
              <p className="text-[11px] text-[#777381]">
                Choose between solid obsidian panels and transparent front panels that react with the playing song's artwork & bass
              </p>
            </div>
          </div>
        </div>

        {/* 2 Selectable Options */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
          {/* Option 1: Classic Obsidian (Default) */}
          <button
            type="button"
            onClick={() => setThemeAppearance('default')}
            className={`p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer relative group flex flex-col justify-between gap-3 ${
              !isGlass
                ? 'bg-[#19E6A0]/10 border-[#19E6A0]/50 shadow-sm'
                : 'bg-[#0E0D14]/80 border-[#282631] hover:border-[#383545] hover:bg-[#121118]'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-colors ${
                  !isGlass
                    ? 'bg-[#19E6A0]/20 border-[#19E6A0]/40 text-[#19E6A0]'
                    : 'bg-[#16151D] border-[#282631] text-[#777381] group-hover:text-[#AAA6B2]'
                }`}>
                  <Layers className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[#F4F2F7]">Classic Obsidian</span>
                    <span className="text-[9px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-[#1C1B24] text-[#AAA6B2] border border-[#282631]">
                      Default
                    </span>
                  </div>
                  <span className="text-[10px] text-[#777381]">Solid Opaque Panels</span>
                </div>
              </div>

              {!isGlass && (
                <div className="w-4 h-4 rounded-full bg-[#19E6A0] flex items-center justify-center shrink-0">
                  <Check className="w-2.5 h-2.5 text-black stroke-[3]" />
                </div>
              )}
            </div>

            <p className="text-[11px] text-[#AAA6B2] leading-relaxed">
              Solid dark opaque panels with subtle edge ambient lighting. Distraction-free, crisp contrast, minimal GPU overhead.
            </p>

            <div className="h-2 rounded-full w-full bg-[#0E0D14] border border-[#282631] overflow-hidden flex">
              <div className="w-1/3 h-full bg-[#181722]" />
              <div className="w-2/3 h-full bg-[#100F14]" />
            </div>
          </button>

          {/* Option 2: Vibrant Aura Glass (Transparent Panels) */}
          <button
            type="button"
            onClick={() => setThemeAppearance('aura_glass')}
            className={`p-4 rounded-xl border text-left transition-all duration-200 cursor-pointer relative group flex flex-col justify-between gap-3 ${
              isGlass
                ? 'bg-[#19E6A0]/10 border-[#19E6A0]/50 shadow-sm'
                : 'bg-[#0E0D14]/80 border-[#282631] hover:border-[#383545] hover:bg-[#121118]'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center border transition-colors ${
                  isGlass
                    ? 'bg-[#19E6A0]/20 border-[#19E6A0]/40 text-[#19E6A0]'
                    : 'bg-[#16151D] border-[#282631] text-[#777381] group-hover:text-[#AAA6B2]'
                }`}>
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[#F4F2F7]">Vibrant Aura Glass</span>
                    <span className="text-[9px] uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-[#19E6A0]/15 text-[#19E6A0] border border-[#19E6A0]/30 font-semibold">
                      Transparent
                    </span>
                  </div>
                  <span className="text-[10px] text-[#777381]">Dynamic Reactive Glass</span>
                </div>
              </div>

              {isGlass && (
                <div className="w-4 h-4 rounded-full bg-[#19E6A0] flex items-center justify-center shrink-0">
                  <Check className="w-2.5 h-2.5 text-black stroke-[3]" />
                </div>
              )}
            </div>

            <p className="text-[11px] text-[#AAA6B2] leading-relaxed">
              Transparent frosted glass front panels that let the playing song's dynamic colors, animated aura blobs, and live bass energy pulse through the entire window.
            </p>

            <div className="h-2 rounded-full w-full bg-gradient-to-r from-[#19E6A0] via-[#E8C77A] to-[#8A5CF6] opacity-80" />
          </button>
        </div>
      </div>

      {/* Download Directory Configuration Section */}
      <div className={`p-5 rounded-2xl border space-y-4 shadow-sm transition-colors duration-200 ${
        isGlass ? 'bg-[#14131A]/70 backdrop-blur-md border-white/[0.08]' : 'bg-[#14131A] border-[#282631]'
      }`}>
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

      {/* Audio Playback & Transitions: Smooth Crossfade */}
      <div className={`p-5 rounded-2xl border space-y-4 shadow-sm transition-colors duration-200 ${
        isGlass ? 'bg-[#14131A]/70 backdrop-blur-md border-white/[0.08]' : 'bg-[#14131A] border-[#282631]'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1C1B24] border border-white/[0.06] flex items-center justify-center text-[#AAA6B2] shadow-sm">
              <Sliders className="w-4 h-4 text-[#19E6A0]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-[#F4F2F7]">Smooth Crossfade</h3>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-[#1C1B24] border border-[#282631] text-[#19E6A0] font-semibold">
                  {crossfadeDuration === 0 ? 'Off' : `${crossfadeDuration}s`}
                </span>
              </div>
              <p className="text-[11px] text-[#777381]">
                Eliminates abrupt silences between consecutive tracks by gently dipping and rising volume during transitions
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {crossfadeDuration > 0 && (
              <button
                onClick={() => setCrossfadeDuration(0)}
                className="px-3 py-1.5 rounded-xl bg-[#1C1B23] hover:bg-[#23222C] text-xs font-medium text-[#777381] hover:text-[#F4F2F7] border border-[#282631] transition-colors cursor-pointer active:scale-[0.98]"
              >
                Disable
              </button>
            )}
            <button
              onClick={() => setCrossfadeDuration(crossfadeDuration === 0 ? 3 : crossfadeDuration)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer active:scale-[0.98] ${
                crossfadeDuration > 0
                  ? 'bg-[#19E6A0]/15 border-[#19E6A0]/30 text-[#19E6A0]'
                  : 'bg-[#1C1B23] border-[#282631] text-[#AAA6B2] hover:text-[#F4F2F7]'
              }`}
            >
              {crossfadeDuration > 0 ? 'Active' : 'Enable (3s)'}
            </button>
          </div>
        </div>

        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between text-[11px] text-[#777381]">
            <span>Crossfade Duration</span>
            <span className="font-mono text-[#F4F2F7] font-medium">
              {crossfadeDuration === 0 ? 'Disabled (0s)' : `${crossfadeDuration} seconds`}
            </span>
          </div>
          <div className="relative flex items-center">
            <input
              type="range"
              min="0"
              max="12"
              step="1"
              value={crossfadeDuration}
              onChange={(e) => setCrossfadeDuration(parseInt(e.target.value, 10))}
              className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-[#201F29] accent-[#19E6A0]"
            />
          </div>
          <div className="flex justify-between text-[10px] text-[#65616F] font-mono px-0.5">
            <span>Off</span>
            <span>2s</span>
            <span>4s</span>
            <span>6s</span>
            <span>8s</span>
            <span>10s</span>
            <span>12s</span>
          </div>
        </div>
      </div>

      {/* Application Updates Section */}
      <div className={`p-5 rounded-2xl border space-y-4 shadow-sm transition-colors duration-200 ${
        isGlass ? 'bg-[#14131A]/70 backdrop-blur-md border-white/[0.08]' : 'bg-[#14131A] border-[#282631]'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#1C1B24] border border-white/[0.06] flex items-center justify-center text-[#AAA6B2] shadow-sm">
              <Sparkles className="w-4 h-4 text-[#19E6A0]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-[#F4F2F7]">Application Updates</h3>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded-md bg-[#1C1B24] border border-[#282631] text-[#AAA6B2]">
                  v{currentVersion}
                </span>
              </div>
              <p className="text-[11px] text-[#777381]">
                Cryptographically signed automatic updates via Tauri v2 architecture
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Status indicator pill */}
            {updateStatus === 'checking' && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1C1B24] border border-[#282631] text-[11px] font-medium text-[#AAA6B2]">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#19E6A0]" />
                <span>Checking...</span>
              </span>
            )}
            {updateStatus === 'up-to-date' && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#19E6A0]/10 border border-[#19E6A0]/25 text-[11px] font-medium text-[#19E6A0]">
                <Check className="w-3.5 h-3.5" />
                <span>Up to date</span>
              </span>
            )}
            {updateStatus === 'completed' && (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#19E6A0]/10 border border-[#19E6A0]/25 text-[11px] font-medium text-[#19E6A0]">
                <Check className="w-3.5 h-3.5" />
                <span>Ready to restart</span>
              </span>
            )}

            {/* Manual Check Button */}
            <button
              onClick={() => void checkForUpdates(false)}
              disabled={updateStatus === 'checking' || updateStatus === 'downloading' || updateStatus === 'installing'}
              className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[#1C1B23] hover:bg-[#23222C] border border-[#282631] text-xs font-medium text-[#F4F2F7] transition-all duration-200 disabled:opacity-50 cursor-pointer active:scale-[0.98]"
              title="Check GitHub for newer releases"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 text-[#AAA6B2] ${
                  updateStatus === 'checking' ? 'animate-spin text-[#19E6A0]' : ''
                }`}
              />
              <span>{updateStatus === 'checking' ? 'Checking...' : 'Check for Updates'}</span>
            </button>

            {/* Download Action Buttons (shown when available or on error with available update) */}
            {(updateStatus === 'update-available' || (updateStatus === 'error' && updateInfo)) && (
              <div className="flex items-center gap-1.5 animate-in fade-in zoom-in-95 duration-200">
                <button
                  onClick={dismissUpdate}
                  className="px-3 py-1.5 rounded-xl bg-[#1C1B23] hover:bg-[#23222C] text-[#AAA6B2] hover:text-[#F4F2F7] text-xs font-medium border border-[#282631] transition-all cursor-pointer"
                  title="Dismiss update notification"
                >
                  Later
                </button>
                <button
                  onClick={() => void downloadAndInstall()}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#19E6A0] hover:bg-[#35F0B1] text-black font-semibold text-xs transition-all duration-200 shadow-sm cursor-pointer active:scale-[0.98]"
                >
                  <ArrowDownCircle className="w-3.5 h-3.5" />
                  <span>Update to v{updateInfo?.version}</span>
                </button>
              </div>
            )}

            {/* Restart Action Button */}
            {updateStatus === 'completed' && (
              <button
                onClick={() => void restartApp()}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#19E6A0] hover:bg-[#35F0B1] text-black font-semibold text-xs transition-all duration-200 shadow-sm cursor-pointer active:scale-[0.98] animate-in fade-in zoom-in-95 duration-200"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restart to Apply</span>
              </button>
            )}
          </div>
        </div>

        {/* Downloading / Installing Progress Bar */}
        {(updateStatus === 'downloading' || updateStatus === 'installing') && (
          <div className="p-3.5 rounded-xl bg-[#0E0D14] border border-[#282631] space-y-2 animate-in fade-in duration-200">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#AAA6B2] flex items-center gap-2">
                {updateStatus === 'downloading' ? (
                  <>
                    <ArrowDownCircle className="w-3.5 h-3.5 text-[#3B82F6] animate-bounce" />
                    <span>Downloading update package...</span>
                  </>
                ) : (
                  <>
                    <Loader2 className="w-3.5 h-3.5 text-[#E8C77A] animate-spin" />
                    <span>Verifying signature & applying binaries...</span>
                  </>
                )}
              </span>
              <span className="font-mono text-[#19E6A0] font-semibold">
                {updateProgress.percent > 0 ? `${updateProgress.percent}%` : ''}
                {updateProgress.totalBytes > 0 ? (
                  <span className="text-[#65616F] font-normal ml-2">
                    ({formatBytes(updateProgress.downloadedBytes)} / {formatBytes(updateProgress.totalBytes)})
                  </span>
                ) : updateProgress.downloadedBytes > 0 ? (
                  <span className="text-[#65616F] font-normal ml-2">
                    ({formatBytes(updateProgress.downloadedBytes)})
                  </span>
                ) : null}
              </span>
            </div>

            <div className="w-full h-2 rounded-full bg-[#1C1B24] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#19E6A0] to-[#35F0B1] transition-all duration-200 rounded-full"
                style={{ width: `${Math.max(5, updateProgress.percent)}%` }}
              />
            </div>
          </div>
        )}

        {/* Completed / Ready to Apply Banner */}
        {updateStatus === 'completed' && updateInfo && (
          <div className="p-3.5 rounded-xl bg-[#19E6A0]/10 border border-[#19E6A0]/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in duration-200">
            <div className="flex items-center gap-2.5 min-w-0">
              <Check className="w-4 h-4 text-[#19E6A0] shrink-0" />
              <div>
                <p className="text-xs font-semibold text-[#19E6A0]">
                  MusicVault v{updateInfo.version} is ready to install
                </p>
                <p className="text-[11px] text-[#AAA6B2] mt-0.5">
                  Package has been downloaded and verified. Restart application to complete the update.
                </p>
              </div>
            </div>
            <button
              onClick={() => void restartApp()}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#19E6A0] hover:bg-[#35F0B1] text-black font-semibold text-xs transition-all duration-200 shadow-sm cursor-pointer shrink-0 active:scale-[0.98]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restart Now</span>
            </button>
          </div>
        )}

        {/* Release Notes Card */}
        {updateInfo && (
          <div className="p-3.5 rounded-xl bg-[#0E0D14] border border-[#282631] space-y-2 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-[#F4F2F7]">
                  Release Notes for v{updateInfo.version}
                </span>
                {updateInfo.date && (
                  <span className="text-[10px] text-[#65616F]">
                    Published {new Date(updateInfo.date).toLocaleDateString()}
                  </span>
                )}
              </div>
              <span className="text-[10px] font-mono text-[#19E6A0]">Available Now</span>
            </div>
            {updateInfo.body ? (
              <div className="text-xs text-[#AAA6B2] bg-[#14131A] p-3 rounded-lg border border-[#282631]/60 whitespace-pre-wrap font-sans leading-relaxed max-h-40 overflow-y-auto no-scrollbar">
                {updateInfo.body}
              </div>
            ) : (
              <p className="text-xs text-[#777381] italic">No release notes provided for this version.</p>
            )}
          </div>
        )}

        {/* Error Notification */}
        {updateError && (
          <div className="p-3 rounded-xl bg-[#FF667A]/10 border border-[#FF667A]/25 flex items-start gap-3 animate-in fade-in duration-200">
            <AlertCircle className="w-4 h-4 text-[#FF667A] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-[#FF667A] font-medium">Update Error</p>
              <p className="text-[11px] text-[#FF667A]/80 mt-0.5 break-words">{updateError}</p>
            </div>
            <button
              onClick={() => {
                if (updateInfo) {
                  void downloadAndInstall();
                } else {
                  void checkForUpdates(false);
                }
              }}
              className="text-[11px] font-semibold text-[#FF667A] hover:underline shrink-0 cursor-pointer"
            >
              {updateInfo ? 'Retry Download' : 'Retry Check'}
            </button>
          </div>
        )}
      </div>

      {/* Library Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className={`p-4 rounded-2xl border flex items-center gap-3.5 shadow-sm transition-colors duration-200 ${
          isGlass ? 'bg-[#14131A]/70 backdrop-blur-md border-white/[0.08]' : 'bg-[#14131A] border-[#282631]'
        }`}>
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

        <div className={`p-4 rounded-2xl border flex items-center gap-3.5 shadow-sm transition-colors duration-200 ${
          isGlass ? 'bg-[#14131A]/70 backdrop-blur-md border-white/[0.08]' : 'bg-[#14131A] border-[#282631]'
        }`}>
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

        <div className={`p-4 rounded-2xl border flex items-center gap-3.5 shadow-sm transition-colors duration-200 ${
          isGlass ? 'bg-[#14131A]/70 backdrop-blur-md border-white/[0.08]' : 'bg-[#14131A] border-[#282631]'
        }`}>
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
      <div className={`p-5 rounded-2xl border space-y-4 shadow-sm transition-colors duration-200 ${
        isGlass ? 'bg-[#14131A]/70 backdrop-blur-md border-white/[0.08]' : 'bg-[#14131A] border-[#282631]'
      }`}>
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
          <img src="/app-icon.png" alt="MusicVault" className="w-4 h-4 rounded-md object-contain shadow-sm" />
          <span>MusicVault v{currentVersion} • Tauri v2 + Rust Audio Engine</span>
        </div>
        <span className="font-mono text-[11px] text-[#4B4854]">Obsidian Edition</span>
      </div>
    </div>
  );
};
