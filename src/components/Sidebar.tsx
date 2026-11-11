import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Music,
  Heart,
  Download,
  Mic2,
  Plus,
  Radio,
  ListMusic,
  Flame,
  Pencil,
  Globe,
} from 'lucide-react';

import { usePlayer } from '../context/PlayerContext';
import { useUpdate } from '../context/UpdateContext';
import { ViewMode, Playlist } from '../types';
import {
  AnimatedEqualizer,
  AnimatedTrash,
  AnimatedSettings,
  AnimatedDices,
  AnimatedFileTransfer,
  AnimatedPanelToggle,
} from './icons';
import { DeletePlaylistModal } from './DeletePlaylistModal';
import { EditPlaylistModal } from './EditPlaylistModal';
import { getArtistPlaylistTrackIds } from '../utils/artistUtils';
import { resolveTrackAlbumName } from '../utils/albumUtils';

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
    exportPlaylistM3U,
    playingPlaylistId,
    isPlaying,
    themeAppearance,
  } = usePlayer();
  const isGlass = themeAppearance === 'aura_glass';
  const { status: updateStatus } = useUpdate();
  const hasUpdateNotification = updateStatus === 'update-available' || updateStatus === 'completed';
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [playlistToDelete, setPlaylistToDelete] = useState<Playlist | null>(null);
  const [playlistToEdit, setPlaylistToEdit] = useState<Playlist | null>(null);
  const [isRollingDice, setIsRollingDice] = useState(false);

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
    '[var(--accent)]', // Mint
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
    setIsRollingDice(true);
    setTimeout(() => setIsRollingDice(false), 600);
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
    const trimmed = newPlaylistName.trim();
    const finalName = trimmed || getRandomPlaylistName();
    const randomColor = getRandomColor();

    let randomTrackIds: string[] = [];
    let playlistDesc: string | undefined = undefined;

    if (trimmed) {
      const albumTracks = tracks.filter((t) => resolveTrackAlbumName(t).toLowerCase() === trimmed.toLowerCase());
      if (albumTracks.length > 0) {
        randomTrackIds = albumTracks.map((t) => t.id);
        playlistDesc = `Album • ${albumTracks.length} tracks`;
      } else {
        const artistTrackIds = getArtistPlaylistTrackIds(tracks, trimmed);
        if (artistTrackIds.length > 0) {
          randomTrackIds = artistTrackIds;
          playlistDesc = `Complete collection of songs including ${trimmed}`;
        }
      }
    } else {
      randomTrackIds = getRandomTracks(5);
      playlistDesc = 'Curated random mix';
    }

    const newPl = createPlaylist(finalName, playlistDesc, randomTrackIds, randomColor);
    setNewPlaylistName('');
    setIsCreatingPlaylist(false);
    if (newPl?.id) {
      onSelectPlaylist(newPl.id);
      onViewChange('playlist_detail');
    }
  };

  // Precompute/memoize playlist track cover art map to eliminate O(N * M) filtering on every render
  const playlistCoversMap = useMemo(() => {
    const trackCoverMap = new Map<string, string>();
    for (const t of tracks) {
      if (t.cover_art) {
        trackCoverMap.set(t.id, t.cover_art);
      }
    }

    const map = new Map<string, string[]>();
    for (const pl of playlists) {
      const covers: string[] = [];
      if (pl.cover_art) {
        covers.push(pl.cover_art);
      }
      for (const tid of pl.track_ids) {
        const c = trackCoverMap.get(tid);
        if (c && !covers.includes(c)) {
          covers.push(c);
          if (covers.length >= 4) break;
        }
      }
      map.set(pl.id, covers);
    }
    return map;
  }, [tracks, playlists]);

  const renderPlaylistCover = (pl: typeof playlists[0], collapsed: boolean) => {
    const uniqueCovers = playlistCoversMap.get(pl.id) || (pl.cover_art ? [pl.cover_art] : []);
    const accentColor = pl.coverColor || '[var(--accent)]';
    const sizeClass = collapsed ? 'w-8 h-8 rounded-lg' : 'w-7 h-7 rounded-lg';

    if (pl.cover_art) {
      return (
        <div
          className={`${sizeClass} overflow-hidden shrink-0 border border-white/[0.08] shadow-sm bg-[#0D0B13] transition-transform duration-200 group-hover:scale-105`}
        >
          <img src={pl.cover_art} alt={pl.name} className="w-full h-full object-cover" />
        </div>
      );
    }

    if (uniqueCovers.length >= 4) {
      return (
        <div
          className={`${sizeClass} overflow-hidden shrink-0 border border-white/[0.08] shadow-sm bg-[#0D0B13] grid grid-cols-2 grid-rows-2 transition-transform duration-200 group-hover:scale-105`}
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
          className={`${sizeClass} overflow-hidden shrink-0 border border-white/[0.08] shadow-sm bg-[#0D0B13] transition-transform duration-200 group-hover:scale-105`}
        >
          <img src={uniqueCovers[0]} alt={pl.name} className="w-full h-full object-cover" />
        </div>
      );
    }

    return (
      <div
        className={`${sizeClass} overflow-hidden shrink-0 border border-white/[0.08] shadow-sm flex items-center justify-center transition-transform duration-200 group-hover:scale-105`}
        style={{
          background: `linear-gradient(135deg, ${accentColor}30, #07060A)`,
        }}
      >
        <ListMusic className={collapsed ? 'w-4 h-4' : 'w-3.5 h-3.5'} style={{ color: accentColor }} />
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
      id: 'online_search' as ViewMode,
      label: 'Search Online',
      icon: Globe,
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
      icon: AnimatedEqualizer,
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
      } transition-[width,background-color] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] will-change-[width] h-full flex flex-col ${
        isGlass
          ? 'bg-[#0A0910]/45 backdrop-blur-2xl border-r border-white/[0.07]'
          : 'bg-[#0C0C10] border-r border-white/[0.05]'
      } select-none z-10 overflow-hidden shrink-0 no-scrollbar`}
    >
      {/* Top Header: MusicVault Brand Mark on left, Panel Toggle on right */}
      <div
        className={`h-[56px] ${
          isCollapsed ? 'px-0 justify-center' : 'pl-3.5 pr-1 justify-between'
        } flex items-center shrink-0`}
      >
        {!isCollapsed && (
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] shadow-[0_2px_8px_rgba(0,0,0,0.2)] select-none">
            <img
              src="/app-icon.png"
              alt="MusicVault"
              className="w-5 h-5 rounded-md object-contain shrink-0 select-none shadow-sm"
            />
            <div className="flex items-center gap-2">
              <span className="inline-flex rounded-full h-2 w-2 bg-[#19E6A0] shadow-[0_0_8px_rgba(25,230,160,0.6)]" />
              <span className="text-[14px] font-bold text-[#F4F2F7] tracking-tight leading-none select-none">
                MusicVault
              </span>
            </div>
          </div>
        )}
        <button
          onClick={onToggle}
          className={`${
            isCollapsed ? 'w-11 h-11' : 'w-[34px] h-[34px]'
          } rounded-xl text-[#8E8A98] hover:text-[#F4F2F7] hover:bg-white/[0.06] border border-transparent hover:border-white/[0.08] flex items-center justify-center transition-all duration-200 active:scale-95 cursor-pointer shadow-sm`}
          title={isCollapsed ? 'Expand Sidebar (Ctrl+B)' : 'Collapse Sidebar (Ctrl+B)'}
          aria-label="Toggle Sidebar"
        >
          <AnimatedPanelToggle
            isCollapsed={isCollapsed}
            className="w-[18px] h-[18px]"
            strokeWidth={1.5}
          />
        </button>
      </div>

      {/* Scrollable Navigation Body */}
      <div
        className="flex-1 min-h-0 overflow-y-auto no-scrollbar flex flex-col"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {/* Primary Navigation: 42px row height with rounded-xl corners */}
        <div className={`${isCollapsed ? 'px-2.5 items-center' : 'px-4'} pt-1 space-y-1.5 shrink-0 flex flex-col`}>
          {primaryNav.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            const isPlayingThis =
              (item.id === 'liked' && playingPlaylistId === 'liked') ||
              (item.id === 'top_tracks' && playingPlaylistId === 'top_tracks') ||
              (item.id === 'songs' && playingPlaylistId === 'all');

            if (isCollapsed) {
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onSelectPlaylist(null);
                    onViewChange(item.id);
                  }}
                  className={`group relative w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 active:scale-95 cursor-pointer ${
                    isActive
                      ? 'text-[#F4F2F7]'
                      : 'text-[#8E8A98] hover:text-[#F4F2F7] hover:bg-white/[0.05]'
                  }`}
                  title={item.label}
                  aria-label={item.label}
                >
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active-bg-collapsed"
                      className="absolute inset-0 rounded-xl bg-white/[0.06] border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] pointer-events-none"
                      transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                    />
                  )}
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active-capsule-collapsed"
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-[#19E6A0] shadow-[0_0_8px_rgba(25,230,160,0.8),0_0_16px_rgba(25,230,160,0.4)]"
                      transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                    />
                  )}
                  <Icon
                    className={`w-[18px] h-[18px] shrink-0 transition-colors ${
                      isPlayingThis
                        ? 'text-[#19E6A0]'
                        : isActive
                        ? 'text-[#19E6A0]'
                        : 'text-[#8E8A98] group-hover:text-[#19E6A0]'
                    }`}
                    strokeWidth={1.5}
                  />
                  {isPlayingThis && (
                    <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#19E6A0]" />
                  )}
                </button>
              );
            }

            return (
              <button
                key={item.id}
                onClick={() => {
                  onSelectPlaylist(null);
                  onViewChange(item.id);
                }}
                className={`group relative w-full h-[42px] flex items-center justify-between px-3.5 rounded-xl text-xs font-medium transition-all duration-200 active:scale-[0.98] cursor-pointer ${
                  isPlayingThis && !isActive
                    ? 'bg-[#19E6A0]/10 text-[#19E6A0] border border-[#19E6A0]/25'
                    : isActive
                    ? 'text-[#F4F2F7]'
                    : 'text-[#8E8A98] hover:text-[#F4F2F7] hover:bg-white/[0.04]'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active-bg"
                    className="absolute inset-0 rounded-xl bg-white/[0.06] border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] pointer-events-none"
                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                  />
                )}

                <div className="relative z-10 flex items-center gap-3 min-w-0">
                  {/* Smooth active capsule indicator with emerald neon glow */}
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active-capsule"
                      className="w-1 h-4 rounded-full bg-[#19E6A0] -ml-1 mr-0.5 shrink-0 shadow-[0_0_8px_rgba(25,230,160,0.8),0_0_16px_rgba(25,230,160,0.4)]"
                      transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                    />
                  )}
                  <Icon
                    className={`w-[18px] h-[18px] shrink-0 transition-colors ${
                      isPlayingThis
                        ? 'text-[#19E6A0]'
                        : isActive
                        ? 'text-[#19E6A0]'
                        : 'text-[#8E8A98] group-hover:text-[#19E6A0]'
                    }`}
                    strokeWidth={1.5}
                  />
                  <span
                    className={`truncate transition-colors ${
                      isPlayingThis ? 'text-[#19E6A0] font-semibold' : isActive ? 'text-[#F4F2F7] font-medium' : 'text-[#8E8A98]'
                    }`}
                  >
                    {item.label}
                  </span>
                </div>

                <div className="relative z-10 flex items-center gap-2 shrink-0">
                  {/* Animated equalizer bars when that playlist/view is currently playing */}
                  {isPlayingThis && (
                    <div
                      className="flex items-end justify-center gap-[2.5px] w-3.5 h-3.5 shrink-0"
                      aria-label={isPlaying ? 'Playing' : 'Paused'}
                      title={isPlaying ? 'Playing' : 'Paused'}
                    >
                      <span
                        className="w-[2px] h-full bg-[#19E6A0] rounded-full origin-bottom animate-eq-bar-1 shadow-[0_0_4px_rgba(25,230,160,0.6)]"
                        style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
                      />
                      <span
                        className="w-[2px] h-full bg-[#19E6A0] rounded-full origin-bottom animate-eq-bar-2 shadow-[0_0_4px_rgba(25,230,160,0.6)]"
                        style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
                      />
                      <span
                        className="w-[2px] h-full bg-[#19E6A0] rounded-full origin-bottom animate-eq-bar-3 shadow-[0_0_4px_rgba(25,230,160,0.6)]"
                        style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
                      />
                    </div>
                  )}
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="text-[10px] font-mono text-[#8E8A98] bg-white/[0.04] border border-white/[0.04] px-1.5 py-0.5 rounded-md shrink-0">
                      {item.badge}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div className={`${isCollapsed ? 'mx-3 my-3' : 'mx-5 my-4'} border-t border-white/[0.06] shrink-0`} />

        {/* Playback Tools Section with subtle pill borders */}
        <div className={`${isCollapsed ? 'px-2.5 items-center' : 'px-4'} shrink-0 flex flex-col`}>
          <div className={`${isCollapsed ? 'space-y-1.5' : 'space-y-1.5'} w-full`}>
            {toolNav.map((tool) => {
              const Icon = tool.icon;
              const isActive = tool.isActive || false;

              if (isCollapsed) {
                return (
                  <button
                    key={tool.id}
                    onClick={tool.onClick}
                    className={`group relative w-11 h-11 rounded-xl flex items-center justify-center border border-white/[0.04] bg-white/[0.015] hover:bg-white/[0.05] hover:border-white/[0.08] transition-all duration-200 active:scale-95 cursor-pointer ${
                      isActive ? 'text-[#F4F2F7] border-white/[0.1] bg-white/[0.06]' : 'text-[#8E8A98] hover:text-[#F4F2F7]'
                    }`}
                    title={tool.label}
                    aria-label={tool.label}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="sidebar-active-bg-collapsed"
                        className="absolute inset-0 rounded-xl bg-white/[0.06] border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] pointer-events-none"
                        transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                      />
                    )}
                    {isActive && (
                      <motion.div
                        layoutId="sidebar-active-capsule-collapsed"
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-[#19E6A0] shadow-[0_0_8px_rgba(25,230,160,0.8),0_0_16px_rgba(25,230,160,0.4)]"
                        transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                      />
                    )}
                    <Icon
                      className={`w-[18px] h-[18px] shrink-0 transition-colors ${
                        isActive ? 'text-[#19E6A0]' : 'text-[#8E8A98] group-hover:text-[#19E6A0]'
                      }`}
                      strokeWidth={1.5}
                    />
                  </button>
                );
              }

              return (
                <button
                  key={tool.id}
                  onClick={tool.onClick}
                  className={`group relative w-full h-[42px] flex items-center gap-3 px-3.5 rounded-xl text-xs font-medium border border-white/[0.04] bg-white/[0.015] hover:bg-white/[0.04] hover:border-white/[0.08] transition-all duration-200 active:scale-[0.98] cursor-pointer ${
                    isActive ? 'text-[#F4F2F7] border-white/[0.1] bg-white/[0.06]' : 'text-[#8E8A98] hover:text-[#F4F2F7]'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="sidebar-active-bg"
                      className="absolute inset-0 rounded-xl bg-white/[0.06] border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] pointer-events-none"
                      transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                    />
                  )}
                  <div className="relative z-10 flex items-center gap-3 min-w-0">
                    {isActive && (
                      <motion.div
                        layoutId="sidebar-active-capsule"
                        className="w-1 h-4 rounded-full bg-[#19E6A0] -ml-1 mr-0.5 shrink-0 shadow-[0_0_8px_rgba(25,230,160,0.8),0_0_16px_rgba(25,230,160,0.4)]"
                        transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                      />
                    )}
                    <Icon
                      className={`w-[18px] h-[18px] shrink-0 transition-colors ${
                        isActive ? 'text-[#19E6A0]' : 'text-[#8E8A98] group-hover:text-[#19E6A0]'
                      }`}
                      strokeWidth={1.5}
                    />
                    <span className="truncate transition-colors">{tool.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Divider */}
        <div className={`${isCollapsed ? 'mx-3 my-3' : 'mx-5 my-4'} border-t border-white/[0.06] shrink-0`} />

        {/* Playlists Section */}
        {isCollapsed ? (
          <div className="px-2 shrink-0 flex flex-col items-center gap-2">
            {/* Main Playlists Icon Button */}
            <button
              onClick={() => {
                onSelectPlaylist(null);
                onViewChange('playlists');
              }}
              className={`group relative w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 active:scale-95 cursor-pointer ${
                currentView === 'playlists'
                  ? 'bg-white/[0.06] border border-white/[0.08] text-[#F4F2F7] shadow-sm'
                  : 'text-[#8E8A98] hover:text-[#F4F2F7] hover:bg-white/[0.05]'
              }`}
              title="All Playlists"
              aria-label="All Playlists"
            >
              {currentView === 'playlists' && (
                <motion.div
                  layoutId="sidebar-active-capsule-collapsed"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-[#19E6A0] shadow-[0_0_8px_rgba(25,230,160,0.8),0_0_16px_rgba(25,230,160,0.4)]"
                  transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                />
              )}
              <ListMusic
                className={`w-[18px] h-[18px] shrink-0 transition-colors ${
                  currentView === 'playlists' ? 'text-[#19E6A0]' : 'text-[#8E8A98] group-hover:text-[#19E6A0]'
                }`}
                strokeWidth={1.5}
              />
            </button>

            {/* Add Playlist Icon Button with Sleek Random Mix Generator */}
            <button
              onClick={handleCreateRandomPlaylist}
              className="w-11 h-11 rounded-xl flex items-center justify-center text-[#8E8A98] hover:text-[#19E6A0] hover:bg-[#19E6A0]/10 border border-transparent hover:border-[#19E6A0]/30 transition-all duration-200 active:scale-90 cursor-pointer group"
              title="Add Playlist (Random Mix)"
              aria-label="Add Playlist"
            >
              <AnimatedDices
                className={`w-[18px] h-[18px] transition-colors ${
                  isRollingDice ? 'text-[#19E6A0]' : ''
                }`}
                isRolling={isRollingDice}
                strokeWidth={1.5}
              />
            </button>

            {/* List of Custom Playlists in Collapsed Mode */}
            {playlists.length > 0 && (
              <div className="space-y-1.5 max-h-48 overflow-y-auto no-scrollbar w-full flex flex-col items-center pt-1">
                {playlists.map((pl) => {
                  const isPlActive = currentView === 'playlist_detail' && selectedPlaylistId === pl.id;
                  const isPlPlaying = playingPlaylistId === pl.id;
                  const plAccent = pl.coverColor || '[var(--accent)]';
                  return (
                    <button
                      key={pl.id}
                      onClick={() => {
                        onSelectPlaylist(pl.id);
                        onViewChange('playlist_detail');
                      }}
                      className={`relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 active:scale-95 cursor-pointer group ${
                        isPlPlaying
                          ? 'shadow-md ring-1 ring-[#19E6A0]/40'
                          : isPlActive
                          ? 'bg-white/[0.08] border border-white/[0.1] text-[#F4F2F7]'
                          : 'text-[#8E8A98] hover:text-[#F4F2F7] hover:bg-white/[0.05]'
                      }`}
                      style={
                        isPlPlaying
                          ? {
                              backgroundColor: `${plAccent}20`,
                              boxShadow: `0 0 12px ${plAccent}35`,
                            }
                          : undefined
                      }
                      title={isPlPlaying ? `${pl.name} (${isPlaying ? 'Playing' : 'Paused'})` : pl.name}
                      aria-label={pl.name}
                    >
                      {isPlActive && !isPlPlaying && (
                        <div
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 rounded-r-full animate-in fade-in zoom-in-95 duration-200"
                          style={{ backgroundColor: plAccent, boxShadow: `0 0 6px ${plAccent}90` }}
                        />
                      )}
                      {renderPlaylistCover(pl, true)}
                      {isPlPlaying && (
                        <div
                          className="absolute -bottom-1 -right-1 bg-[#0B0A10] rounded-full p-1 flex items-center justify-center shadow-lg"
                          style={{ border: `1px solid ${plAccent}80` }}
                        >
                          <div className="flex items-end gap-[1.5px] w-2.5 h-2.5">
                            <span
                              className="w-[1.5px] h-full rounded-full origin-bottom animate-eq-bar-1"
                              style={{
                                backgroundColor: plAccent,
                                animationPlayState: isPlaying ? 'running' : 'paused',
                              }}
                            />
                            <span
                              className="w-[1.5px] h-full rounded-full origin-bottom animate-eq-bar-2"
                              style={{
                                backgroundColor: plAccent,
                                animationPlayState: isPlaying ? 'running' : 'paused',
                              }}
                            />
                            <span
                              className="w-[1.5px] h-full rounded-full origin-bottom animate-eq-bar-3"
                              style={{
                                backgroundColor: plAccent,
                                animationPlayState: isPlaying ? 'running' : 'paused',
                              }}
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
          <div className="px-4 shrink-0 flex flex-col">
            <div className="flex items-center justify-between px-1 mb-2 shrink-0">
              <button
                onClick={() => {
                  onSelectPlaylist(null);
                  onViewChange('playlists');
                }}
                className="p-1 rounded-lg text-[#8E8A98] hover:text-[#F4F2F7] hover:bg-white/[0.05] transition-all duration-150 active:scale-95 cursor-pointer"
                title="View All Playlists"
                aria-label="All Playlists"
              >
                <ListMusic className="w-4 h-4" strokeWidth={1.5} />
              </button>
              <button
                onClick={() => setIsCreatingPlaylist(!isCreatingPlaylist)}
                className="group p-1.5 rounded-lg text-[#8E8A98] hover:text-[#19E6A0] hover:bg-white/[0.05] transition-all duration-150 active:scale-95 cursor-pointer"
                title="Create New Playlist"
                aria-label="Create Playlist"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </div>

            {isCreatingPlaylist && (
              <form onSubmit={handleCreatePlaylist} className="px-1 mb-2.5 shrink-0 animate-in fade-in slide-in-from-top-1 duration-200">
                <input
                  type="text"
                  placeholder="Playlist name (or Enter for random)..."
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                  autoFocus
                  onBlur={() => {
                    if (!newPlaylistName.trim()) setIsCreatingPlaylist(false);
                  }}
                  className="w-full px-3 py-1.5 text-xs bg-[#13111A]/90 border border-white/[0.1] focus:border-[#19E6A0]/60 rounded-xl text-[#F4F2F7] placeholder-[#65616F] outline-none shadow-inner transition-colors"
                />
              </form>
            )}

            {/* Empty State */}
            {playlists.length === 0 ? (
              <div className="pt-6 pb-3 text-center select-none animate-in fade-in duration-300">
                <p className="text-xs text-[#8E8A98] font-medium">No custom playlists</p>
                <button
                  onClick={handleCreateRandomPlaylist}
                  className="mt-2 text-xs text-[#19E6A0] hover:underline cursor-pointer transition-all duration-200 active:scale-95 font-medium"
                >
                  + Create random playlist
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                {playlists.map((pl) => {
                  const isPlActive = currentView === 'playlist_detail' && selectedPlaylistId === pl.id;
                  const isPlPlaying = playingPlaylistId === pl.id;
                  const plAccent = pl.coverColor || '[var(--accent)]';
                  return (
                    <div
                      key={pl.id}
                      className={`group relative flex items-center justify-between px-2.5 h-[42px] rounded-xl text-xs font-medium cursor-pointer transition-all duration-200 active:scale-[0.98] ${
                        isPlPlaying
                          ? 'border shadow-md'
                          : isPlActive
                          ? 'bg-white/[0.06] border border-white/[0.08] text-[#F4F2F7]'
                          : 'text-[#8E8A98] hover:text-[#F4F2F7] hover:bg-white/[0.04]'
                      }`}
                      style={
                        isPlPlaying
                          ? {
                              backgroundColor: `${plAccent}18`,
                              color: plAccent,
                              borderColor: `${plAccent}40`,
                              boxShadow: `0 0 16px ${plAccent}15`,
                            }
                          : undefined
                      }
                      onClick={() => {
                        onSelectPlaylist(pl.id);
                        onViewChange('playlist_detail');
                      }}
                    >
                      {isPlActive && !isPlPlaying && (
                        <div
                          className="w-1 h-3.5 rounded-full -ml-1 mr-1.5 shrink-0 animate-in fade-in zoom-in-95 duration-200"
                          style={{
                            backgroundColor: plAccent,
                            boxShadow: `0 0 6px ${plAccent}80`,
                          }}
                        />
                      )}
                      <div className="flex items-center gap-2.5 truncate flex-1 min-w-0">
                        {renderPlaylistCover(pl, false)}
                        <span
                          className={`truncate transition-colors ${
                            isPlPlaying ? 'font-semibold' : isPlActive ? 'text-[#F4F2F7]' : 'text-[#8E8A98]'
                          }`}
                          style={isPlPlaying ? { color: plAccent } : undefined}
                        >
                          {pl.name}
                        </span>
                      </div>

                      {/* Animated Equalizer Indicator when Playing */}
                      {isPlPlaying && (
                        <div
                          className="flex items-end justify-center gap-[2.5px] w-3.5 h-3.5 shrink-0 ml-1.5 mr-0.5 group-hover:opacity-20 transition-opacity duration-150"
                          aria-label={isPlaying ? 'Playing' : 'Paused'}
                          title={isPlaying ? 'Playing' : 'Paused'}
                        >
                          <span
                            className="w-[2px] h-full rounded-full origin-bottom animate-eq-bar-1"
                            style={{
                              backgroundColor: plAccent,
                              animationPlayState: isPlaying ? 'running' : 'paused',
                            }}
                          />
                          <span
                            className="w-[2px] h-full rounded-full origin-bottom animate-eq-bar-2"
                            style={{
                              backgroundColor: plAccent,
                              animationPlayState: isPlaying ? 'running' : 'paused',
                            }}
                          />
                          <span
                            className="w-[2px] h-full rounded-full origin-bottom animate-eq-bar-3"
                            style={{
                              backgroundColor: plAccent,
                              animationPlayState: isPlaying ? 'running' : 'paused',
                            }}
                          />
                        </div>
                      )}

                      {/* Hover quick action buttons with smooth scale and opacity transitions */}
                      <div className="flex items-center gap-0.5 shrink-0 ml-1 opacity-0 group-hover:opacity-100 transition-all duration-200">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPlaylistToEdit(pl);
                          }}
                          className="p-1 rounded-lg text-[#8E8A98] hover:text-[#19E6A0] hover:bg-white/[0.08] hover:scale-110 active:scale-90 transition-all duration-150 cursor-pointer"
                          aria-label="Edit playlist"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            exportPlaylistM3U(pl.id);
                          }}
                          className="p-1 rounded-lg text-[#8E8A98] hover:text-[#19E6A0] hover:bg-white/[0.08] hover:scale-110 active:scale-90 transition-all duration-150 cursor-pointer"
                          aria-label="Export playlist (.m3u8)"
                          title="Export (.m3u8)"
                        >
                          <AnimatedFileTransfer type="down" className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPlaylistToDelete(pl);
                          }}
                          className="p-1 rounded-lg text-[#8E8A98] hover:text-[#FF667A] hover:bg-red-500/10 hover:scale-110 active:scale-90 transition-all duration-150 cursor-pointer"
                          aria-label="Delete playlist"
                          title="Delete"
                        >
                          <AnimatedTrash className="w-3.5 h-3.5" strokeWidth={1.5} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Flexible Space */}
        <div className="flex-1 min-h-[16px]" />
      </div>

      {/* Bottom Settings item with update notification pill */}
      <div className={`${isCollapsed ? 'py-2.5 px-2.5 items-center' : 'py-2.5 px-4'} border-t border-white/[0.06] shrink-0 flex flex-col`}>
        {isCollapsed ? (
          <button
            onClick={() => {
              onSelectPlaylist(null);
              onViewChange('settings');
            }}
            className={`group relative w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 active:scale-95 cursor-pointer ${
              currentView === 'settings'
                ? 'text-[#F4F2F7]'
                : 'text-[#8E8A98] hover:text-[#F4F2F7] hover:bg-white/[0.05]'
            }`}
            title="Settings"
            aria-label="Settings"
          >
            {currentView === 'settings' && (
              <motion.div
                layoutId="sidebar-active-bg-collapsed"
                className="absolute inset-0 rounded-xl bg-white/[0.06] border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] pointer-events-none"
                transition={{ type: 'spring', stiffness: 450, damping: 35 }}
              />
            )}
            {currentView === 'settings' && (
              <motion.div
                layoutId="sidebar-active-capsule-collapsed"
                className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-[#19E6A0] shadow-[0_0_8px_rgba(25,230,160,0.8),0_0_16px_rgba(25,230,160,0.4)]"
                transition={{ type: 'spring', stiffness: 450, damping: 35 }}
              />
            )}
            <AnimatedSettings
              className={`w-[18px] h-[18px] shrink-0 transition-colors ${
                currentView === 'settings' ? 'text-[#19E6A0]' : 'text-[#8E8A98] group-hover:text-[#19E6A0]'
              }`}
              strokeWidth={1.5}
            />
            {hasUpdateNotification && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#19E6A0]" />
            )}
          </button>
        ) : (
          <button
            onClick={() => {
              onSelectPlaylist(null);
              onViewChange('settings');
            }}
            className={`group relative w-full h-[42px] flex items-center justify-between px-3.5 rounded-xl text-xs font-medium transition-all duration-200 active:scale-[0.98] cursor-pointer ${
              currentView === 'settings'
                ? 'text-[#F4F2F7]'
                : 'text-[#8E8A98] hover:text-[#F4F2F7] hover:bg-white/[0.04]'
            }`}
          >
            {currentView === 'settings' && (
              <motion.div
                layoutId="sidebar-active-bg"
                className="absolute inset-0 rounded-xl bg-white/[0.06] border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] pointer-events-none"
                transition={{ type: 'spring', stiffness: 450, damping: 35 }}
              />
            )}
            <div className="relative z-10 flex items-center gap-3 min-w-0">
              {currentView === 'settings' && (
                <motion.div
                  layoutId="sidebar-active-capsule"
                  className="w-1 h-4 rounded-full bg-[#19E6A0] -ml-1 mr-0.5 shrink-0 shadow-[0_0_8px_rgba(25,230,160,0.8),0_0_16px_rgba(25,230,160,0.4)]"
                  transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                />
              )}
              <AnimatedSettings
                className={`w-[18px] h-[18px] shrink-0 transition-colors ${
                  currentView === 'settings' ? 'text-[#19E6A0]' : 'text-[#8E8A98] group-hover:text-[#19E6A0]'
                }`}
                strokeWidth={1.5}
              />
              <span className="truncate transition-colors">Settings</span>
            </div>

            {hasUpdateNotification && (
              <span className="relative z-10 flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#19E6A0]/15 text-[#19E6A0] border border-[#19E6A0]/25 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[#19E6A0]" />
                <span>Update</span>
              </span>
            )}
          </button>
        )}
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
        onExport={(id) => {
          exportPlaylistM3U(id);
        }}
        onDelete={(pl) => {
          setPlaylistToDelete(pl);
        }}
      />
    </aside>
  );
};
