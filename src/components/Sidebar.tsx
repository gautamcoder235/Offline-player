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
      id: 'download' as ViewMode,
      label: 'Downloader',
      icon: Download,
    },
  ];

  // Group 2: Playback Tools
  const toolNav = [
    {
      id: 'visualizer',
      label: 'Visualizer',
      icon: Radio,
      onClick: onOpenVisualizer,
    },
    {
      id: 'equalizer',
      label: 'Equalizer',
      icon: Sliders,
      onClick: onOpenEqualizer,
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
        isCollapsed ? 'w-[60px]' : 'w-56'
      } transition-[width] duration-200 ease-out h-full flex flex-col bg-[#0E0D12] border-r border-[#292731] select-none z-10 overflow-hidden shrink-0`}
    >
      {/* Top Header: Collapse Toggle */}
      <div
        className={`h-14 px-3 flex items-center ${
          isCollapsed ? 'justify-center' : 'justify-between'
        } border-b border-[#292731] shrink-0`}
      >
        {!isCollapsed && (
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#777381] pl-1">
            Navigation
          </span>
        )}
        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg text-[#777381] hover:text-[#F4F2F7] hover:bg-[#16151C] transition-colors duration-150 cursor-pointer"
          title={isCollapsed ? 'Expand Sidebar (Ctrl+B)' : 'Collapse Sidebar (Ctrl+B)'}
          aria-label="Toggle Sidebar"
        >
          {isCollapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      {/* Primary Navigation */}
      <div className="p-2 space-y-0.5">
        {primaryNav.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                onSelectPlaylist(null);
                onViewChange(item.id);
              }}
              className={`relative w-full flex items-center ${
                isCollapsed ? 'justify-center px-0' : 'justify-between px-3'
              } py-2 rounded-lg text-xs font-medium transition-colors duration-150 cursor-pointer ${
                isActive
                  ? 'bg-[#19181F] text-[#F4F2F7]'
                  : 'text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#16151C]'
              }`}
              title={isCollapsed ? item.label : undefined}
            >
              {isActive && (
                <div className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-[#19E6A0] rounded-r-full" />
              )}
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-4 h-4 transition-colors ${
                    isActive ? 'text-[#19E6A0]' : 'text-[#777381] group-hover:text-[#B8B4C0]'
                  }`}
                />
                {!isCollapsed && <span>{item.label}</span>}
              </div>
              {!isCollapsed && item.badge !== undefined && item.badge > 0 && (
                <span className="text-[10px] font-mono text-[#65616F]">{item.badge}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* 1px Thin Divider */}
      <div className="mx-3 my-1 border-t border-[#292731]" />

      {/* Playback Tools */}
      <div className="p-2 space-y-0.5">
        {!isCollapsed && (
          <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#65616F]">
            Playback Tools
          </div>
        )}
        {toolNav.map((tool) => {
          const Icon = tool.icon;
          const isActive = tool.isActive || false;
          return (
            <button
              key={tool.id}
              onClick={tool.onClick}
              className={`relative w-full flex items-center ${
                isCollapsed ? 'justify-center px-0' : 'gap-3 px-3'
              } py-2 rounded-lg text-xs font-medium transition-colors duration-150 cursor-pointer ${
                isActive
                  ? 'bg-[#19181F] text-[#F4F2F7]'
                  : 'text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#16151C]'
              }`}
              title={isCollapsed ? tool.label : undefined}
            >
              {isActive && (
                <div className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-[#19E6A0] rounded-r-full" />
              )}
              <Icon
                className={`w-4 h-4 transition-colors ${
                  isActive ? 'text-[#19E6A0]' : 'text-[#777381]'
                }`}
              />
              {!isCollapsed && <span>{tool.label}</span>}
            </button>
          );
        })}
      </div>

      {/* 1px Thin Divider */}
      <div className="mx-3 my-1 border-t border-[#292731]" />

      {/* Playlists Section */}
      {!isCollapsed && (
        <div className="flex-1 px-2 py-1 overflow-y-auto flex flex-col min-h-0">
          <div className="flex items-center justify-between px-3 py-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#65616F]">
              Playlists
            </span>
            <button
              onClick={() => setIsCreatingPlaylist(true)}
              className="p-1 rounded-md text-[#777381] hover:text-[#F4F2F7] hover:bg-[#16151C] transition-colors duration-150 cursor-pointer"
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
                className="w-full px-2.5 py-1 text-xs bg-[#14131A] border border-[#282631] rounded-md text-[#F4F2F7] placeholder-[#65616F] focus:outline-none focus:border-[#19E6A0]/50"
              />
            </form>
          )}

          <div className="space-y-0.5 overflow-y-auto flex-1">
            {playlists.length === 0 ? (
              <div className="px-3 py-3 text-center text-[11px] text-[#65616F]">
                No custom playlists
              </div>
            ) : (
              playlists.map((pl) => {
                const isPlActive = currentView === 'playlist_detail' && selectedPlaylistId === pl.id;
                return (
                  <div
                    key={pl.id}
                    className={`group relative flex items-center justify-between px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors duration-150 ${
                      isPlActive
                        ? 'bg-[#19181F] text-[#F4F2F7]'
                        : 'text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#16151C]'
                    }`}
                    onClick={() => {
                      onSelectPlaylist(pl.id);
                      onViewChange('playlist_detail');
                    }}
                  >
                    {isPlActive && (
                      <div className="absolute left-0 top-1 bottom-1 w-[2px] bg-[#19E6A0] rounded-r-full" />
                    )}
                    <div className="flex items-center gap-2.5 truncate">
                      <ListMusic
                        className={`w-3.5 h-3.5 ${
                          isPlActive ? 'text-[#19E6A0]' : 'text-[#777381]'
                        }`}
                      />
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
                        className="p-1 text-[#777381] hover:text-[#FF667A] cursor-pointer"
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
      <div className={`p-2 border-t border-[#292731] bg-[#0E0D12] ${isCollapsed ? 'mt-auto' : ''}`}>
        <button
          onClick={() => {
            onSelectPlaylist(null);
            onViewChange('settings');
          }}
          className={`relative w-full flex items-center ${
            isCollapsed ? 'justify-center px-0' : 'gap-3 px-3'
          } py-2 rounded-lg text-xs font-medium transition-colors duration-150 cursor-pointer ${
            currentView === 'settings'
              ? 'bg-[#19181F] text-[#F4F2F7]'
              : 'text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#16151C]'
          }`}
          title={isCollapsed ? 'Settings' : undefined}
        >
          {currentView === 'settings' && (
            <div className="absolute left-0 top-1.5 bottom-1.5 w-[2px] bg-[#19E6A0] rounded-r-full" />
          )}
          <Settings
            className={`w-4 h-4 ${
              currentView === 'settings' ? 'text-[#19E6A0]' : 'text-[#777381]'
            }`}
          />
          {!isCollapsed && <span>Settings</span>}
        </button>
      </div>
    </aside>
  );
};
