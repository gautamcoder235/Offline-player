import React, { useState } from 'react';
import {
  Music,
  Heart,
  ListMusic,
  Download,
  Mic2,
  Settings,
  Plus,
  Radio,
  Sliders,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

import { usePlayer } from '../context/PlayerContext';
import { ViewMode } from '../types';

interface SidebarProps {
  currentView: ViewMode;
  onViewChange: (view: ViewMode) => void;
  selectedPlaylistId: string | null;
  onSelectPlaylist: (id: string | null) => void;
  onOpenEqualizer: () => void;
  onOpenVisualizer: () => void;
  isCollapsed: boolean;
  onToggle: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onViewChange,
  selectedPlaylistId,
  onSelectPlaylist,
  onOpenEqualizer,
  onOpenVisualizer,
  isCollapsed,
  onToggle,
}) => {
  const { tracks, likedTrackIds, playlists, createPlaylist, deletePlaylist } = usePlayer();
  const [isCreatingPlaylist, setIsCreatingPlaylist] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');

  const handleCreatePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;
    createPlaylist(newPlaylistName.trim());
    setNewPlaylistName('');
    setIsCreatingPlaylist(false);
  };

  const navItems = [
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
      activeColor: 'text-rose-400',
    },
    {
      id: 'download' as ViewMode,
      label: 'Downloader',
      icon: Download,
      highlight: true,
    },
    {
      id: 'lyrics' as ViewMode,
      label: 'Live Lyrics',
      icon: Mic2,
    },
  ];

  return (
    <aside className={`${isCollapsed ? 'w-[60px]' : 'w-56'} transition-[width] duration-200 ease-out h-full flex flex-col glass-panel border-r border-white/5 bg-[#0e0f14]/80 select-none z-10 overflow-hidden shrink-0`}>
      {/* Brand Header */}
      <div className={`p-4 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} gap-3 border-b border-white/5 shrink-0`}>
        {!isCollapsed && (
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-600">
              <Radio className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-sm tracking-wide text-white">
                Offline Player
              </h1>
              <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                Offline Mode
              </div>
            </div>
          </div>
        )}
        <button
          onClick={onToggle}
          className="text-gray-400 hover:text-white transition-colors cursor-pointer"
          title={isCollapsed ? "Expand Sidebar (Ctrl+B)" : "Collapse Sidebar (Ctrl+B)"}
          aria-label="Toggle Sidebar"
        >
          {isCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
        </button>
      </div>

      {/* Main Navigation */}
      <div className="p-2 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                onSelectPlaylist(null);
                onViewChange(item.id);
              }}
              className={`relative w-full flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} px-3 py-2 rounded-lg text-sm font-medium transition-colors duration-150 cursor-pointer ${
                isActive
                  ? 'bg-white/8 text-white'
                  : 'text-gray-300 hover:text-white hover:bg-white/5'
              }`}
              title={isCollapsed ? item.label : undefined}
            >
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4/5 bg-emerald-400 rounded-r-full" />
              )}
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-4 h-4 ${
                    isActive
                      ? item.activeColor || 'text-emerald-400'
                      : 'text-gray-400 group-hover:text-white'
                  }`}
                />
                {!isCollapsed && <span>{item.label}</span>}
              </div>
              {!isCollapsed && item.badge !== undefined && item.badge > 0 && (
                <span className="text-[11px] font-semibold text-gray-400">
                  {item.badge}
                </span>
              )}
              {!isCollapsed && item.highlight && (
                <span className="px-1.5 py-0.5 text-[9px] uppercase font-bold tracking-wider rounded bg-emerald-500/20 text-emerald-300">
                  New
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Quick Audio Tools */}
      <div className="px-2 py-2 space-y-1">
        <div className="border-t border-white/5 my-1"></div>
        <button
          onClick={onOpenVisualizer}
          className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-3'} py-2 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 transition-colors duration-150 cursor-pointer`}
          title={isCollapsed ? "Visualizer" : undefined}
        >
          <Radio className="w-4 h-4 text-cyan-400" />
          {!isCollapsed && <span>Visualizer</span>}
        </button>
        <button
          onClick={onOpenEqualizer}
          className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-3'} py-2 rounded-lg text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 transition-colors duration-150 cursor-pointer`}
          title={isCollapsed ? "Equalizer" : undefined}
        >
          <Sliders className="w-4 h-4 text-purple-400" />
          {!isCollapsed && <span>Equalizer</span>}
        </button>
      </div>

      {/* Playlists Section */}
      {!isCollapsed && (
        <div className="flex-1 px-2 py-2 overflow-y-auto flex flex-col min-h-0">
          <div className="border-t border-white/5 my-1"></div>
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
              Playlists
            </span>
            <button
              onClick={() => setIsCreatingPlaylist(true)}
              className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors duration-150 cursor-pointer"
              title="Create Playlist"
              aria-label="Create Playlist"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {isCreatingPlaylist && (
            <form onSubmit={handleCreatePlaylist} className="px-2 mb-2">
              <input
                type="text"
                placeholder="Playlist name..."
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                autoFocus
                onBlur={() => {
                  if (!newPlaylistName.trim()) setIsCreatingPlaylist(false);
                }}
                className="w-full px-2 py-1 text-xs bg-black/40 border border-white/10 rounded-md text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
              />
            </form>
          )}

          <div className="space-y-0.5 overflow-y-auto flex-1">
            {playlists.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-gray-500">
                No playlists yet. Click + to create one.
              </div>
            ) : (
              playlists.map((pl) => {
                const isPlActive = currentView === 'playlist_detail' && selectedPlaylistId === pl.id;
                return (
                  <div
                    key={pl.id}
                    className={`group relative flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors duration-150 ${
                      isPlActive
                        ? 'bg-white/8 text-white'
                        : 'text-gray-300 hover:text-white hover:bg-white/5'
                    }`}
                    onClick={() => {
                      onSelectPlaylist(pl.id);
                      onViewChange('playlist_detail');
                    }}
                  >
                    {isPlActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-3/5 bg-emerald-400 rounded-r-full" />
                    )}
                    <div className="flex items-center gap-2.5 truncate">
                      <ListMusic className="w-3.5 h-3.5 text-gray-400 group-hover:text-emerald-400" />
                      <span className="truncate">{pl.name}</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deletePlaylist(pl.id);
                          if (selectedPlaylistId === pl.id) {
                            onViewChange('songs');
                          }
                        }}
                        className="p-1 text-gray-400 hover:text-rose-400 cursor-pointer"
                        aria-label="Delete playlist"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Footer / Settings */}
      <div className={`p-2 border-t border-white/5 bg-black/20 ${isCollapsed ? 'mt-auto' : ''}`}>
        <button
          onClick={() => {
            onSelectPlaylist(null);
            onViewChange('settings');
          }}
          className={`relative w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-3'} py-2.5 rounded-lg text-xs font-medium transition-colors duration-150 cursor-pointer ${
            currentView === 'settings'
              ? 'bg-white/8 text-white'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
          title={isCollapsed ? "Settings" : undefined}
        >
          {currentView === 'settings' && (
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-3/5 bg-emerald-400 rounded-r-full" />
          )}
          <Settings className="w-4 h-4" />
          {!isCollapsed && <span>Settings</span>}
        </button>
      </div>
    </aside>
  );
};
