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
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onViewChange,
  selectedPlaylistId,
  onSelectPlaylist,
  onOpenEqualizer,
  onOpenVisualizer,
}) => {
  const { tracks, likedTrackIds, playlists, createPlaylist, deletePlaylist, isPlaying } = usePlayer();
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
    <aside className="w-64 h-full flex flex-col glass-panel border-r border-white/5 bg-[#0e0f14]/80 select-none z-10">
      {/* Brand Header */}
      <div className="p-5 flex items-center gap-3 border-b border-white/5">
        <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-green-400 shadow-lg shadow-green-500/20">
          <Radio className="w-5 h-5 text-white" />
          {isPlaying && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          )}
        </div>
        <div>
          <h1 className="font-bold text-base tracking-wide bg-gradient-to-r from-white via-gray-100 to-gray-300 bg-clip-text text-transparent">
            Offline Player
          </h1>
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            Offline Mode
          </div>
        </div>
      </div>

      {/* Main Navigation */}
      <div className="p-3 space-y-1">
        <div className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Menu
        </div>
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
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-white/10 text-white shadow-sm border border-white/10'
                  : 'text-gray-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-4 h-4 ${
                    isActive
                      ? item.activeColor || 'text-emerald-400'
                      : 'text-gray-400 group-hover:text-white'
                  }`}
                />
                <span>{item.label}</span>
              </div>
              {item.badge !== undefined && item.badge > 0 && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                    isActive ? 'bg-white/20 text-white' : 'bg-white/5 text-gray-400'
                  }`}
                >
                  {item.badge}
                </span>
              )}
              {item.highlight && (
                <span className="px-1.5 py-0.5 text-[9px] uppercase font-bold tracking-wider rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  New
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Quick Audio Tools */}
      <div className="px-3 py-2 space-y-1 border-t border-white/5">
        <div className="px-3 py-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
          Audio Suite
        </div>
        <button
          onClick={onOpenVisualizer}
          className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 transition-all"
        >
          <Radio className="w-4 h-4 text-cyan-400" />
          <span>Real-time Visualizer</span>
        </button>
        <button
          onClick={onOpenEqualizer}
          className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs font-medium text-gray-300 hover:text-white hover:bg-white/5 transition-all"
        >
          <Sliders className="w-4 h-4 text-purple-400" />
          <span>Equalizer (EQ)</span>
        </button>
      </div>

      {/* Playlists Section */}
      <div className="flex-1 px-3 py-2 overflow-y-auto flex flex-col min-h-0 border-t border-white/5">
        <div className="flex items-center justify-between px-3 py-1.5">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
            Playlists
          </span>
          <button
            onClick={() => setIsCreatingPlaylist(true)}
            className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Create Playlist"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        {isCreatingPlaylist && (
          <form onSubmit={handleCreatePlaylist} className="p-2 mb-2 bg-white/5 rounded-xl border border-white/10">
            <input
              type="text"
              placeholder="Playlist name..."
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              autoFocus
              className="w-full px-2.5 py-1.5 text-xs bg-black/40 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
            />
            <div className="flex justify-end gap-1.5 mt-2">
              <button
                type="button"
                onClick={() => setIsCreatingPlaylist(false)}
                className="px-2 py-1 text-[11px] text-gray-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-2.5 py-1 text-[11px] font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-md"
              >
                Create
              </button>
            </div>
          </form>
        )}

        <div className="space-y-0.5 overflow-y-auto pr-1 flex-1">
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
                  className={`group flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium cursor-pointer transition-all ${
                    isPlActive
                      ? 'bg-white/10 text-white border border-white/10'
                      : 'text-gray-300 hover:text-white hover:bg-white/5'
                  }`}
                  onClick={() => {
                    onSelectPlaylist(pl.id);
                    onViewChange('playlist_detail');
                  }}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <ListMusic className="w-3.5 h-3.5 text-gray-400 group-hover:text-emerald-400" />
                    <span className="truncate">{pl.name}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[10px] text-gray-500">{pl.track_ids.length}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deletePlaylist(pl.id);
                        if (selectedPlaylistId === pl.id) {
                          onViewChange('songs');
                        }
                      }}
                      className="p-1 text-gray-400 hover:text-rose-400"
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

      {/* Footer / Settings */}
      <div className="p-3 border-t border-white/5 bg-black/20">
        <button
          onClick={() => {
            onSelectPlaylist(null);
            onViewChange('settings');
          }}
          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
            currentView === 'settings'
              ? 'bg-white/10 text-white border border-white/10'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Music Folders & Settings</span>
        </button>
      </div>
    </aside>
  );
};
