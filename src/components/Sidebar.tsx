import React, { useState } from 'react';
import {
  Music,
  Heart,
  Download,
  Mic2,
  Settings,
  Plus,
  Radio,
  Sliders,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  ListMusic,
  Flame,
  FileUp,
  FileDown,
  Pencil,
} from 'lucide-react';

import { usePlayer } from '../context/PlayerContext';
import { useUpdate } from '../context/UpdateContext';
import { ViewMode, Playlist } from '../types';
import { DeletePlaylistModal } from './DeletePlaylistModal';
import { EditPlaylistModal } from './EditPlaylistModal';

interface SidebarProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  selectedPlaylistId: string | null;
  onSelectPlaylist: (id: string | null) => void;
  onOpenEqualizer: () => void;
  onOpenVisualizer?: () => void;
  isCollapsed: boolean;
  onToggle: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onViewChange,
  selectedPlaylistId,
  onSelectPlaylist,
  onOpenEqualizer,
  isCollapsed,
  onToggle,
}) => {
  const {
    tracks,
    likedTrackIds,
    playlists,
    createPlaylist,
    updatePlaylist,
    deletePlaylist,
    topTracks,
    importPlaylistM3U,
    exportPlaylistM3U,
    playingPlaylistId,
    isPlaying,
  } = usePlayer();
  const { status: updateStatus } = useUpdate();
  const hasUpdateNotification = updateStatus === 'update-available' || updateStatus === 'completed';
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [playlistToDelete, setPlaylistToDelete] = useState<Playlist | null>(null);
  const [playlistToEdit, setPlaylistToEdit] = useState<Playlist | null>(null);

  const RANDOM_PLAYLIST_NAMES = [
    'Late Night Chill',
    'Neon Vibes',
    'Acoustic Bliss',
    'Daily Discovery',
    'Golden Hour',
    'Retro Wave',
    'Focus Flow',
    'Midnight Grooves',
    'Velvet Lounge',
    'Coffee & Vinyl',
    'Dreamscape',
    'Sunset Drive',
    'Heavy Rotation',
    'Indie Horizon',
    'Cosmic Melodies',
    'Deep Atmosphere',
  ];

  const PLAYLIST_COLORS = [
    '#19E6A0', // Mint
    '#E8C77A', // Gold
    '#7F5AF0', // Purple
    '#2CB67D', // Emerald
    '#FF667A', // Rose
    '#3B82F6', // Blue
    '#F59E0B', // Amber
    '#EC4899', // Pink
    '#06B6D4', // Cyan
  ];

  const getRandomPlaylistName = () => {
    const existingNames = new Set(playlists.map((p) => p.name.toLowerCase()));
    const available = RANDOM_PLAYLIST_NAMES.filter((n) => !existingNames.has(n.toLowerCase()));
    if (available.length > 0) {
      return available[Math.floor(Math.random() * available.length)];
    }
    return `Custom Mix #${playlists.length + 1}`;
  };

  const getRandomColor = () => {
    return PLAYLIST_COLORS[Math.floor(Math.random() * PLAYLIST_COLORS.length)];
  };

  const getRandomTracks = (count = 5): string[] => {
    if (tracks.length === 0) return [];
    const shuffled = [...tracks].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, tracks.length)).map((t) => t.id);
  };

  const handleCreateRandomPlaylist = () => {
    const randomName = getRandomPlaylistName();
    const randomColor = getRandomColor();
    const randomTrackIds = getRandomTracks(5);
    const newPl = createPlaylist(randomName, 'Curated random mix', randomTrackIds, randomColor);
    if (newPl?.id) {
      onSelectPlaylist(newPl.id);
      onViewChange('playlist_detail');
    }
  };

  const handleCreatePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = newPlaylistName.trim() || getRandomPlaylistName();
    const randomColor = getRandomColor();
    const randomTrackIds = newPlaylistName.trim() ? [] : getRandomTracks(5);
    const newPl = createPlaylist(finalName, undefined, randomTrackIds, randomColor);
    setNewPlaylistName('');
    setIsCreatingPlaylist(false);
    if (newPl?.id) {
      onSelectPlaylist(newPl.id);
      onViewChange('playlist_detail');
    }
  };

  const renderPlaylistCover = (pl: typeof playlists[0], collapsed: boolean) => {
    const plTracks = tracks.filter((t) => pl.track_ids.includes(t.id));
    const coverArts = plTracks
      .map((t) => t.cover_art)
      .filter((c): c is string => Boolean(c));
    const uniqueCovers = Array.from(new Set(pl.cover_art ? [pl.cover_art, ...coverArts] : coverArts));
    const accentColor = pl.coverColor || '#19E6A0';
    const sizeClass = collapsed ? 'w-7 h-7 rounded-lg' : 'w-6 h-6 rounded-md';

    if (pl.cover_art) {
      return (
        <div
          className={`${sizeClass} overflow-hidden shrink-0 border border-white/[0.08] shadow-sm bg-[#16151C] transition-transform duration-200 group-hover:scale-105`}
        >
          <img src={pl.cover_art} alt={pl.name} className="w-full h-full object-cover" />
        </div>
      );
    }

    if (uniqueCovers.length >= 4) {
      return (
        <div
          className={`${sizeClass} overflow-hidden shrink-0 border border-white/[0.08] shadow-sm bg-[#16151C] grid grid-cols-2 grid-rows-2 transition-transform duration-200 group-hover:scale-105`}
        >
          {uniqueCovers.slice(0, 4).map((art, i) => (
            <img key={i} src={art} alt="" className="w-full h-full object-cover" />
          ))}
        </div>
      );
    }

    if (uniqueCovers.length > 0) {
      return (
        <div
          className={`${sizeClass} overflow-hidden shrink-0 border border-white/[0.08] shadow-sm bg-[#16151C] transition-transform duration-200 group-hover:scale-105`}
        >
          <img src={uniqueCovers[0]} alt={pl.name} className="w-full h-full object-cover" />
        </div>
      );
    }

    return (
      <div
        className={`${sizeClass} overflow-hidden shrink-0 border border-white/[0.08] shadow-sm flex items-center justify-center transition-transform duration-200 group-hover:scale-105`}
        style={{
          background: `linear-gradient(135deg, ${accentColor}25, #14131A)`,
        }}
      >
        <ListMusic className={collapsed ? 'w-3.5 h-3.5' : 'w-3 h-3'} style={{ color: accentColor }} />
      </div>
    );
  };

  // Group 1: Primary Navigation
  const primaryNav = [
    {
      id: 'songs' as ViewMode,
      label: 'Library',
      icon: Music,
      badge: tracks.length,
    },
    {
      id: 'liked' as ViewMode,
      label: 'Liked Songs',
      icon: Heart,
      badge: likedTrackIds.size,
    },
    {
      id: 'top_tracks' as ViewMode,
      label: 'Top Tracks',
      icon: Flame,
      badge: topTracks.length > 0 ? topTracks.length : undefined,
    },
    {
      id: 'download' as ViewMode,
      label: 'Downloader',
      icon: Download,
    },
  ];

  // Group 2: Playback Tools
  const toolNav = [
    {
      id: 'visualizer' as ViewMode,
      label: 'Visualizer',
      icon: Radio,
      onClick: () => {
        onSelectPlaylist(null);
        onViewChange('visualizer');
      },
      isActive: currentView === 'visualizer',
    },
    {
      id: 'equalizer' as ViewMode,
      label: 'Equalizer',
      icon: Sliders,
      onClick: onOpenEqualizer,
      isActive: false,
    },
    {
      id: 'lyrics' as ViewMode,
      label: 'Live Lyrics',
      icon: Mic2,
      onClick: () => {
        onSelectPlaylist(null);
        onViewChange('lyrics');
      },
      isActive: currentView === 'lyrics',
    },
  ];

  return (
    <aside
      className={`${
        isCollapsed ? 'w-[68px]' : 'w-[284px]'
      } transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-[width] h-full flex flex-col bg-[#0E0D12]/85 backdrop-blur-xl border-r border-white/5 select-none z-10 overflow-hidden shrink-0 no-scrollbar`}
    >
      {/* Top Header: Clean header without unnecessary border lines */}
      <div
        className={`pt-2 pb-1.5 ${
          isCollapsed ? 'px-0 justify-center' : 'px-6 justify-between'
        } flex items-center shrink-0`}
      >
        {!isCollapsed && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#65616F] px-1">
            Navigation
          </span>
        )}
        <button
          onClick={onToggle}
          className="group p-1.5 rounded-xl text-[#777381] hover:text-[#F4F2F7] hover:bg-[#16151C] transition-all duration-200 active:scale-95 cursor-pointer"
          title={isCollapsed ? 'Expand Sidebar (Ctrl+B)' : 'Collapse Sidebar (Ctrl+B)'}
          aria-label="Toggle Sidebar"
        >
          {isCollapsed ? (
            <PanelLeftOpen className="w-[18px] h-[18px] transition-transform duration-200 group-hover:scale-[1.05]" strokeWidth={1.5} />
          ) : (
            <PanelLeftClose className="w-[18px] h-[18px] transition-transform duration-200 group-hover:scale-[1.05]" strokeWidth={1.5} />
          )}
        </button>
      </div>

      {/* Scrollable Navigation Body: slides/scrolls smoothly without any visible scrollbar */}
      <div
        className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {/* Primary Navigation: 42px row height with ~24px pitch */}
        <div className={`${isCollapsed ? 'px-2.5' : 'px-5'} pt-2 space-y-2 shrink-0`}>
        {primaryNav.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          const isPlayingThis =
            (item.id === 'liked' && playingPlaylistId === 'liked') ||
            (item.id === 'top_tracks' && playingPlaylistId === 'top_tracks') ||
            (item.id === 'songs' && playingPlaylistId === 'all');

          return (
            <button
              key={item.id}
              onClick={() => {
                onSelectPlaylist(null);
                onViewChange(item.id);
              }}
              className={`group relative w-full h-[42px] flex items-center ${
                isCollapsed ? 'justify-center px-0' : 'justify-between px-3.5'
              } rounded-[14px] text-xs font-medium transition-all duration-200 active:scale-[0.98] cursor-pointer ${
                isPlayingThis && !isActive
                  ? 'bg-[#19E6A0]/10 text-[#19E6A0] border border-[#19E6A0]/20'
                  : isActive
                  ? 'bg-[#19181F] text-[#F4F2F7] shadow-sm'
                  : 'text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#16151C]'
              }`}
              title={isCollapsed ? item.label : undefined}
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Curved pill indicator (soft rounded floating capsule, no sharp edge bar) */}
                {isActive && !isCollapsed && (
                  <div className="w-1 h-3.5 rounded-full bg-[#19E6A0] -ml-1 mr-0.5 shrink-0 shadow-[0_0_6px_rgba(25,230,160,0.5)] animate-in fade-in zoom-in-95 duration-200" />
                )}
                <Icon
                  className={`w-[18px] h-[18px] shrink-0 transition-colors duration-200 ${
                    isPlayingThis
                      ? 'text-[#19E6A0]'
                      : isActive
                      ? 'text-[#19E6A0]'
                      : 'text-[#777381] group-hover:text-[#F4F2F7]'
                  }`}
                  strokeWidth={1.5}
                />
                {!isCollapsed && <span className={`truncate ${isPlayingThis ? 'text-[#19E6A0] font-semibold' : ''}`}>{item.label}</span>}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {!isCollapsed && isPlayingThis && (
                  <div
                    className="flex items-end justify-center gap-[2px] w-3 h-3 shrink-0"
                    aria-label={isPlaying ? 'Playing' : 'Paused'}
                    title={isPlaying ? 'Playing' : 'Paused'}
                  >
                    <span
                      className="w-[2px] h-full bg-[#19E6A0] rounded-full origin-bottom animate-eq-bar-1"
                      style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
                    />
                    <span
                      className="w-[2px] h-full bg-[#19E6A0] rounded-full origin-bottom animate-eq-bar-2"
                      style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
                    />
                    <span
                      className="w-[2px] h-full bg-[#19E6A0] rounded-full origin-bottom animate-eq-bar-3"
                      style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
                    />
                  </div>
                )}
                {!isCollapsed && item.badge !== undefined && item.badge > 0 && (
                  <span className="text-[10px] font-mono text-[#65616F] shrink-0">{item.badge}</span>
                )}
                {isCollapsed && isPlayingThis && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#19E6A0] shadow-[0_0_6px_rgba(25,230,160,0.8)] animate-pulse" />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* 28px vertical spacing before, 18px after divider */}
      <div className={`${isCollapsed ? 'mx-3 my-4' : 'mx-6 mt-7 mb-4'} border-t border-[#292731]/40 shrink-0`} />

      {/* Playback Tools: 42px row height with ~24px pitch */}
      <div className={`${isCollapsed ? 'px-2.5' : 'px-5'} shrink-0`}>
        {!isCollapsed && (
          <div className="px-1 mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#65616F]">
            Playback Tools
          </div>
        )}
        <div className="space-y-2">
          {toolNav.map((tool) => {
            const Icon = tool.icon;
            const isActive = tool.isActive || false;
            return (
              <button
                key={tool.id}
                onClick={tool.onClick}
                className={`group relative w-full h-[42px] flex items-center ${
                  isCollapsed ? 'justify-center px-0' : 'gap-3 px-3.5'
                } rounded-[14px] text-xs font-medium transition-all duration-200 active:scale-[0.98] cursor-pointer ${
                  isActive
                    ? 'bg-[#19181F] text-[#F4F2F7] shadow-sm'
                    : 'text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#16151C]'
                }`}
                title={isCollapsed ? tool.label : undefined}
              >
                {isActive && !isCollapsed && (
                  <div className="w-1 h-3.5 rounded-full bg-[#19E6A0] -ml-1 mr-0.5 shrink-0 shadow-[0_0_6px_rgba(25,230,160,0.5)] animate-in fade-in zoom-in-95 duration-200" />
                )}
                <Icon
                  className={`w-[18px] h-[18px] shrink-0 transition-colors duration-200 ${
                    isActive ? 'text-[#19E6A0]' : 'text-[#777381] group-hover:text-[#F4F2F7]'
                  }`}
                  strokeWidth={1.5}
                />
                {!isCollapsed && <span>{tool.label}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Divider */}
      <div className={`${isCollapsed ? 'mx-3 my-3' : 'mx-6 mt-7 mb-4'} border-t border-[#292731]/40 shrink-0`} />

      {/* Playlists Section: Visible in both expanded and collapsed (toggle off) mode */}
      {isCollapsed ? (
        <div className="px-2 shrink-0 flex flex-col items-center gap-1.5">
          {/* Main Playlists Icon Button */}
          <button
            onClick={() => {
              onSelectPlaylist(null);
              onViewChange('playlists');
            }}
            className={`group relative w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 active:scale-95 cursor-pointer ${
              currentView === 'playlists'
                ? 'bg-[#19181F] text-[#F4F2F7] shadow-sm'
                : 'text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#16151C]'
            }`}
            title="All Playlists"
            aria-label="All Playlists"
          >
            {currentView === 'playlists' && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 rounded-r-full bg-[#19E6A0] shadow-[0_0_6px_rgba(25,230,160,0.5)] animate-in fade-in zoom-in-95 duration-200" />
            )}
            <ListMusic
              className={`w-[18px] h-[18px] shrink-0 transition-colors duration-200 ${
                currentView === 'playlists' ? 'text-[#19E6A0]' : 'text-[#777381] group-hover:text-[#F4F2F7]'
              }`}
              strokeWidth={1.5}
            />
          </button>

          {/* Add Playlist Icon Button (assigns random choice to add/set in it) */}
          <button
            onClick={handleCreateRandomPlaylist}
            className="w-11 h-11 rounded-xl flex items-center justify-center text-[#777381] hover:text-[#19E6A0] hover:bg-[#16151C] transition-all duration-200 active:scale-95 cursor-pointer group"
            title="Add Playlist (Random Choice)"
            aria-label="Add Playlist"
          >
            <Plus className="w-[18px] h-[18px] transition-transform duration-200 group-hover:scale-110" strokeWidth={1.5} />
          </button>

          {/* List of Custom Playlists in Collapsed Mode */}
          {playlists.length > 0 && (
            <div className="space-y-1 max-h-44 overflow-y-auto no-scrollbar w-full flex flex-col items-center pt-1">
              {playlists.map((pl) => {
                const isPlActive = currentView === 'playlist_detail' && selectedPlaylistId === pl.id;
                const isPlPlaying = playingPlaylistId === pl.id;
                return (
                  <button
                    key={pl.id}
                    onClick={() => {
                      onSelectPlaylist(pl.id);
                      onViewChange('playlist_detail');
                    }}
                    className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 active:scale-95 cursor-pointer group ${
                      isPlPlaying
                        ? 'bg-[#19E6A0]/15 text-[#19E6A0] ring-1 ring-[#19E6A0]/50 shadow-[0_0_12px_rgba(25,230,160,0.18)]'
                        : isPlActive
                        ? 'bg-[#19181F] text-[#F4F2F7] shadow-sm'
                        : 'text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#16151C]'
                    }`}
                    title={isPlPlaying ? `${pl.name} (${isPlaying ? 'Playing' : 'Paused'})` : pl.name}
                    aria-label={pl.name}
                  >
                    {isPlActive && !isPlPlaying && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-3.5 rounded-r-full bg-[#19E6A0] shadow-[0_0_4px_rgba(25,230,160,0.5)] animate-in fade-in zoom-in-95 duration-200" />
                    )}
                    {renderPlaylistCover(pl, true)}
                    {isPlPlaying && (
                      <div className="absolute -bottom-1 -right-1 bg-[#100F14] rounded-full p-1 border border-[#19E6A0]/50 flex items-center justify-center shadow-lg">
                        <div className="flex items-end gap-[1.5px] w-2.5 h-2.5">
                          <span
                            className="w-[1.5px] h-full bg-[#19E6A0] rounded-full origin-bottom animate-eq-bar-1"
                            style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
                          />
                          <span
                            className="w-[1.5px] h-full bg-[#19E6A0] rounded-full origin-bottom animate-eq-bar-2"
                            style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
                          />
                          <span
                            className="w-[1.5px] h-full bg-[#19E6A0] rounded-full origin-bottom animate-eq-bar-3"
                            style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
                          />
                        </div>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="px-5 shrink-0 flex flex-col">
          <div className="flex items-center justify-between px-1 mb-2 shrink-0">
            <button
              onClick={() => {
                onSelectPlaylist(null);
                onViewChange('playlists');
              }}
              className="text-[10px] font-semibold uppercase tracking-wider text-[#65616F] hover:text-[#F4F2F7] transition-all duration-200 active:scale-[0.98] cursor-pointer"
            >
              Playlists
            </button>
            <div className="flex items-center gap-1">
              <button
                onClick={handleCreateRandomPlaylist}
                className="px-1.5 py-0.5 rounded-md text-[10px] text-[#777381] hover:text-[#19E6A0] hover:bg-[#16151C] transition-all duration-200 active:scale-[0.98] cursor-pointer"
                title="Quick Add (Random Choice)"
              >
                Random
              </button>
              <button
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.m3u,.m3u8';
                  input.onchange = async (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0];
                    if (file) await importPlaylistM3U(file);
                  };
                  input.click();
                }}
                className="group p-1 rounded-lg text-[#777381] hover:text-[#19E6A0] hover:bg-[#16151C] transition-all duration-200 active:scale-95 cursor-pointer"
                title="Import Playlist (.m3u)"
                aria-label="Import Playlist"
              >
                <FileUp className="w-3.5 h-3.5 transition-transform duration-200 group-hover:-translate-y-0.5" strokeWidth={1.5} />
              </button>
              <button
                onClick={() => setIsCreatingPlaylist(!isCreatingPlaylist)}
                className="group p-1 rounded-lg text-[#777381] hover:text-[#F4F2F7] hover:bg-[#16151C] transition-all duration-200 active:scale-95 cursor-pointer"
                title="Create Playlist"
                aria-label="Create Playlist"
              >
                <Plus className="w-3.5 h-3.5 transition-transform duration-200 group-hover:scale-110" strokeWidth={1.5} />
              </button>
            </div>
          </div>

          {isCreatingPlaylist && (
            <form onSubmit={handleCreatePlaylist} className="px-1 mb-2 shrink-0 animate-in fade-in slide-in-from-top-1 duration-200">
              <input
                type="text"
                placeholder="Playlist name (or Enter for random)..."
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                autoFocus
                onBlur={() => {
                  if (!newPlaylistName.trim()) setIsCreatingPlaylist(false);
                }}
                className="w-full px-3 py-1.5 text-xs bg-[#14131A] border border-[#282631] rounded-xl text-[#F4F2F7] placeholder-[#65616F] focus:outline-none focus:border-[#19E6A0]/50 transition-colors"
              />
            </form>
          )}

          {/* Empty State */}
          {playlists.length === 0 ? (
            <div className="pt-6 pb-2 text-center select-none animate-in fade-in duration-300">
              <p className="text-xs text-[#777381] font-medium">No custom playlists</p>
              <button
                onClick={handleCreateRandomPlaylist}
                className="mt-1.5 text-[11px] text-[#19E6A0] hover:underline cursor-pointer transition-all duration-200 active:scale-95"
              >
                + Create random playlist
              </button>
            </div>
          ) : (
            <div className="space-y-1">
              {playlists.map((pl) => {
                const isPlActive = currentView === 'playlist_detail' && selectedPlaylistId === pl.id;
                const isPlPlaying = playingPlaylistId === pl.id;
                return (
                  <div
                    key={pl.id}
                    className={`group relative flex items-center justify-between px-2.5 h-10 rounded-xl text-xs font-medium cursor-pointer transition-all duration-200 active:scale-[0.98] ${
                      isPlPlaying
                        ? 'bg-[#19E6A0]/10 text-[#19E6A0] border border-[#19E6A0]/25 shadow-[0_0_12px_rgba(25,230,160,0.08)]'
                        : isPlActive
                        ? 'bg-[#19181F] text-[#F4F2F7]'
                        : 'text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#16151C]'
                    }`}
                    onClick={() => {
                      onSelectPlaylist(pl.id);
                      onViewChange('playlist_detail');
                    }}
                  >
                    {isPlActive && !isPlPlaying && (
                      <div className="w-1 h-3.5 rounded-full bg-[#19E6A0] -ml-1 mr-1.5 shrink-0 shadow-[0_0_4px_rgba(25,230,160,0.5)] animate-in fade-in zoom-in-95 duration-200" />
                    )}
                    <div className="flex items-center gap-2.5 truncate flex-1 min-w-0">
                      {renderPlaylistCover(pl, false)}
                      <span className={`truncate ${isPlPlaying ? 'text-[#19E6A0] font-semibold' : ''}`}>{pl.name}</span>
                    </div>

                    {/* Spotify-style Animated Equalizer Indicator */}
                    {isPlPlaying && (
                      <div
                        className="flex items-end justify-center gap-[2.5px] w-3.5 h-3.5 shrink-0 ml-1.5 mr-0.5 group-hover:opacity-30 transition-opacity duration-150"
                        aria-label={isPlaying ? 'Playing' : 'Paused'}
                        title={isPlaying ? 'Playing' : 'Paused'}
                      >
                        <span
                          className="w-[2.5px] h-full bg-[#19E6A0] rounded-full origin-bottom animate-eq-bar-1"
                          style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
                        />
                        <span
                          className="w-[2.5px] h-full bg-[#19E6A0] rounded-full origin-bottom animate-eq-bar-2"
                          style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
                        />
                        <span
                          className="w-[2.5px] h-full bg-[#19E6A0] rounded-full origin-bottom animate-eq-bar-3"
                          style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
                        />
                      </div>
                    )}
                    <div className="flex items-center gap-0.5 shrink-0 ml-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPlaylistToEdit(pl);
                        }}
                        className="p-1 text-[#777381] hover:text-[#19E6A0] opacity-0 group-hover:opacity-100 transition-all duration-200 active:scale-90 cursor-pointer"
                        aria-label="Edit playlist"
                        title="Edit"
                      >
                        <Pencil className="w-3 h-3 transition-transform duration-200 hover:scale-110" strokeWidth={1.5} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          exportPlaylistM3U(pl.id);
                        }}
                        className="p-1 text-[#777381] hover:text-[#19E6A0] opacity-0 group-hover:opacity-100 transition-all duration-200 active:scale-90 cursor-pointer"
                        aria-label="Export playlist (.m3u8)"
                        title="Export (.m3u8)"
                      >
                        <FileDown className="w-3 h-3 transition-transform duration-200 hover:scale-110" strokeWidth={1.5} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPlaylistToDelete(pl);
                        }}
                        className="p-1 text-[#777381] hover:text-[#FF667A] opacity-0 group-hover:opacity-100 transition-all duration-200 active:scale-90 cursor-pointer"
                        aria-label="Delete playlist"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3 transition-transform duration-200 hover:scale-110" strokeWidth={1.5} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Flexible Space: Absorbs window height without stretching navigation rows */}
      <div className="flex-1 min-h-[12px]" />
      </div>

      {/* Pinned Bottom Footer / Settings: Compact assigned space with clean subtle divider */}
      <div className={`${isCollapsed ? 'py-2 px-2' : 'py-2 px-5'} border-t border-[#292731]/40 shrink-0`}>
        <button
          onClick={() => {
            onSelectPlaylist(null);
            onViewChange('settings');
          }}
          className={`group relative w-full h-[36px] flex items-center ${
            isCollapsed ? 'justify-center px-0' : 'gap-3 px-3.5'
          } rounded-xl text-xs font-medium transition-all duration-200 active:scale-[0.98] cursor-pointer ${
            currentView === 'settings'
              ? 'bg-[#19181F] text-[#F4F2F7] shadow-sm'
              : 'text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#16151C]'
          }`}
          title={isCollapsed ? 'Settings' : undefined}
        >
          {currentView === 'settings' && !isCollapsed && (
            <div className="w-1 h-3 rounded-full bg-[#19E6A0] -ml-1 mr-0.5 shrink-0 shadow-[0_0_6px_rgba(25,230,160,0.5)] animate-in fade-in zoom-in-95 duration-200" />
          )}
          <div className="relative shrink-0">
            <Settings
              className={`w-[17px] h-[17px] transition-all duration-300 group-hover:rotate-45 ${
                currentView === 'settings' ? 'text-[#19E6A0]' : 'text-[#777381] group-hover:text-[#F4F2F7]'
              }`}
              strokeWidth={1.5}
            />
            {hasUpdateNotification && isCollapsed && (
              <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#19E6A0] shadow-[0_0_6px_rgba(25,230,160,0.8)] animate-pulse" />
            )}
          </div>
          {!isCollapsed && (
            <div className="flex items-center justify-between flex-1 min-w-0">
              <span className="truncate">Settings</span>
              {hasUpdateNotification && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold bg-[#19E6A0]/15 text-[#19E6A0] border border-[#19E6A0]/30 animate-pulse shrink-0">
                  <span className="w-1 h-1 rounded-full bg-[#19E6A0]" />
                  <span>Update</span>
                </span>
              )}
            </div>
          )}
        </button>
      </div>

      {/* Modals */}
      <DeletePlaylistModal
        playlist={playlistToDelete}
        isOpen={Boolean(playlistToDelete)}
        tracks={tracks}
        onClose={() => setPlaylistToDelete(null)}
        onConfirm={(pl) => {
          deletePlaylist(pl.id);
          if (selectedPlaylistId === pl.id) {
            onViewChange('songs');
          }
        }}
      />

      <EditPlaylistModal
        playlist={playlistToEdit}
        isOpen={Boolean(playlistToEdit)}
        tracks={tracks}
        onClose={() => setPlaylistToEdit(null)}
        onSave={(id, updates) => {
          updatePlaylist(id, updates);
        }}
      />
    </aside>
  );
};
