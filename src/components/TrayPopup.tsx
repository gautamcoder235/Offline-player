import React, { useEffect, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Music,
  Heart,
  Download,
  Radio,
  ListMusic,
  Plus,
  FolderOpen,
  Settings,
  ExternalLink,
  LogOut,
} from 'lucide-react';

interface TrayPlaylist {
  id: string;
  name: string;
}

export const TrayPopup: React.FC = () => {
  const [playlists, setPlaylists] = useState<TrayPlaylist[]>([]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Ensure transparent window canvas for obsidian styling with zero square corner artifacts
    document.documentElement.classList.add('tray-popup-mode');
    document.body.classList.add('tray-popup-mode');
    document.documentElement.style.setProperty('background', 'transparent', 'important');
    document.documentElement.style.setProperty('background-color', 'transparent', 'important');
    document.body.style.setProperty('background', 'transparent', 'important');
    document.body.style.setProperty('background-color', 'transparent', 'important');
    const root = document.getElementById('root');
    if (root) {
      root.style.setProperty('background', 'transparent', 'important');
      root.style.setProperty('background-color', 'transparent', 'important');
    }

    // Direct wheel event listener ensuring mousewheel scrolling always works across the entire popup window
    const handleWheel = (e: WheelEvent) => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop += e.deltaY;
      }
    };
    window.addEventListener('wheel', handleWheel, { passive: true });

    invoke<TrayPlaylist[]>('get_tray_playlists')
      .then((pls) => {
        if (pls && Array.isArray(pls)) setPlaylists(pls);
      })
      .catch(console.warn);

    const unlisten = listen<TrayPlaylist[]>('tray://playlists-updated', (e) => {
      if (e.payload && Array.isArray(e.payload)) setPlaylists(e.payload);
    });

    return () => {
      window.removeEventListener('wheel', handleWheel);
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleOpen = () => {
    invoke('show_main_window').catch(console.warn);
  };

  const handleView = (view: string) => {
    invoke('open_tray_view', { view }).catch(console.warn);
  };

  const handlePlaylist = (id: string) => {
    invoke('open_tray_playlist', { playlistId: id }).catch(console.warn);
  };

  const handleNewPlaylist = () => {
    invoke('open_tray_playlist', { playlistId: 'new' }).catch(console.warn);
  };

  const handleOpenFolder = () => {
    invoke('open_tray_folder').catch(console.warn);
  };

  const handleQuit = () => {
    invoke('quit_app').catch(console.warn);
  };

  return (
    <div className="w-full h-full bg-black border border-[#222226] rounded-xl shadow-[0_16px_40px_rgba(0,0,0,0.95)] p-2.5 flex flex-col justify-between select-none text-[#F4F2F7] overflow-hidden box-border">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#1A1A1E] shrink-0">
        <div
          onClick={handleOpen}
          className="flex items-center gap-2 cursor-pointer group py-0.5 -my-0.5 px-1 -mx-1 rounded hover:bg-[#141417] transition-colors"
          title="Open Offline Player"
        >
          <img src="/app-icon.png" alt="" className="w-4 h-4 rounded-full object-contain shrink-0 group-hover:scale-105 transition-transform" />
          <span className="text-[11.5px] font-bold tracking-tight text-white group-hover:text-[#19E6A0] transition-colors">Offline Player</span>
        </div>
        <button
          onClick={handleOpen}
          className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#1C1C20] hover:bg-[#25252A] text-[#D0D0D8] hover:text-white border border-[#2B2B32] transition-colors cursor-pointer"
        >
          Open
        </button>
      </div>

      {/* Main Options Stream */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto py-1 space-y-2 min-h-0 pr-1 overscroll-contain select-none"
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(255, 255, 255, 0.2) transparent',
        }}
      >
        {/* Navigation Category */}
        <div className="space-y-0.5">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-[#666672] px-1.5 py-0.5">
            Navigate
          </div>

          <button
            onClick={() => handleView('songs')}
            className="w-full flex items-center gap-2.5 px-2 py-1 rounded-lg hover:bg-[#141417] text-left transition-colors cursor-pointer group"
          >
            <div className="w-4 h-4 flex items-center justify-center shrink-0">
              <Music className="w-3.5 h-3.5 text-[#8E8A98] group-hover:text-white transition-colors" />
            </div>
            <span className="text-[11.5px] font-medium text-[#C8C6D0] group-hover:text-white truncate">
              Library
            </span>
          </button>

          <button
            onClick={() => handlePlaylist('liked')}
            className="w-full flex items-center gap-2.5 px-2 py-1 rounded-lg hover:bg-[#141417] text-left transition-colors cursor-pointer group"
          >
            <div className="w-4 h-4 flex items-center justify-center shrink-0">
              <Heart className="w-3.5 h-3.5 text-[#8E8A98] group-hover:text-white transition-colors" />
            </div>
            <span className="text-[11.5px] font-medium text-[#C8C6D0] group-hover:text-white truncate">
              Liked Songs
            </span>
          </button>

          <button
            onClick={() => handleView('download')}
            className="w-full flex items-center gap-2.5 px-2 py-1 rounded-lg hover:bg-[#141417] text-left transition-colors cursor-pointer group"
          >
            <div className="w-4 h-4 flex items-center justify-center shrink-0">
              <Download className="w-3.5 h-3.5 text-[#8E8A98] group-hover:text-white transition-colors" />
            </div>
            <span className="text-[11.5px] font-medium text-[#C8C6D0] group-hover:text-white truncate">
              Downloader
            </span>
          </button>

          <button
            onClick={() => handleView('visualizer')}
            className="w-full flex items-center gap-2.5 px-2 py-1 rounded-lg hover:bg-[#141417] text-left transition-colors cursor-pointer group"
          >
            <div className="w-4 h-4 flex items-center justify-center shrink-0">
              <Radio className="w-3.5 h-3.5 text-[#8E8A98] group-hover:text-white transition-colors" />
            </div>
            <span className="text-[11.5px] font-medium text-[#C8C6D0] group-hover:text-white truncate">
              Visualizer
            </span>
          </button>

          <button
            onClick={() => handleView('playlists')}
            className="w-full flex items-center gap-2.5 px-2 py-1 rounded-lg hover:bg-[#141417] text-left transition-colors cursor-pointer group"
          >
            <div className="w-4 h-4 flex items-center justify-center shrink-0">
              <ListMusic className="w-3.5 h-3.5 text-[#8E8A98] group-hover:text-white transition-colors" />
            </div>
            <span className="text-[11.5px] font-medium text-[#C8C6D0] group-hover:text-white truncate">
              Playlists
            </span>
          </button>
        </div>

        {/* Quick Actions Category */}
        <div className="space-y-0.5 pt-1 border-t border-[#18181C]">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-[#666672] px-1.5 py-0.5">
            Actions & Tools
          </div>

          <button
            onClick={handleNewPlaylist}
            className="w-full flex items-center gap-2.5 px-2 py-1 rounded-lg hover:bg-[#141417] text-left transition-colors cursor-pointer group"
          >
            <div className="w-4 h-4 flex items-center justify-center shrink-0">
              <Plus className="w-3.5 h-3.5 text-[#8E8A98] group-hover:text-white transition-colors" />
            </div>
            <span className="text-[11.5px] font-medium text-[#C8C6D0] group-hover:text-white truncate">
              New Playlist
            </span>
          </button>

          <button
            onClick={handleOpenFolder}
            className="w-full flex items-center gap-2.5 px-2 py-1 rounded-lg hover:bg-[#141417] text-left transition-colors cursor-pointer group"
          >
            <div className="w-4 h-4 flex items-center justify-center shrink-0">
              <FolderOpen className="w-3.5 h-3.5 text-[#8E8A98] group-hover:text-white transition-colors" />
            </div>
            <span className="text-[11.5px] font-medium text-[#C8C6D0] group-hover:text-white truncate">
              Music Folder
            </span>
          </button>

          <button
            onClick={() => handleView('settings')}
            className="w-full flex items-center gap-2.5 px-2 py-1 rounded-lg hover:bg-[#141417] text-left transition-colors cursor-pointer group"
          >
            <div className="w-4 h-4 flex items-center justify-center shrink-0">
              <Settings className="w-3.5 h-3.5 text-[#8E8A98] group-hover:text-white transition-colors" />
            </div>
            <span className="text-[11.5px] font-medium text-[#C8C6D0] group-hover:text-white truncate">
              Settings
            </span>
          </button>
        </div>

        {/* Custom Playlists (if any) */}
        {playlists.length > 0 && (
          <div className="space-y-0.5 pt-1 border-t border-[#18181C]">
            <div className="text-[9px] font-semibold uppercase tracking-wider text-[#666672] px-1.5 py-0.5">
              Your Playlists
            </div>
            {playlists.map((pl) => (
              <button
                key={pl.id}
                onClick={() => handlePlaylist(pl.id)}
                className="w-full flex items-center gap-2.5 px-2 py-1 rounded-lg hover:bg-[#141417] text-left transition-colors cursor-pointer group"
              >
                <div className="w-4 h-4 flex items-center justify-center shrink-0">
                  <ListMusic className="w-3.5 h-3.5 text-[#8E8A98] group-hover:text-white transition-colors" />
                </div>
                <span className="text-[11.5px] font-medium text-[#C8C6D0] group-hover:text-white truncate">
                  {pl.name}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer Navigation & Quit */}
      <div className="pt-1.5 border-t border-[#1A1A1E] flex items-center justify-between text-[11px] shrink-0">
        <button
          onClick={handleOpen}
          className="flex items-center gap-1.5 text-[#8E8A98] hover:text-white transition-colors cursor-pointer px-1.5 py-0.5 rounded-md hover:bg-[#141417]"
        >
          <ExternalLink className="w-3 h-3 text-[#8E8A98] hover:text-white transition-colors" />
          <span>Show App</span>
        </button>

        <button
          onClick={handleQuit}
          className="flex items-center gap-1.5 text-[#8E8A98] hover:text-[#FF667A] transition-colors cursor-pointer px-1.5 py-0.5 rounded-md hover:bg-[#FF667A]/10"
        >
          <LogOut className="w-3 h-3 text-[#8E8A98] hover:text-[#FF667A] transition-colors" />
          <span>Quit</span>
        </button>
      </div>
    </div>
  );
};
