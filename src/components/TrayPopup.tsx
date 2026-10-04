import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  Heart,
  ListMusic,
  Plus,
  ExternalLink,
  LogOut,
} from 'lucide-react';

interface TrayPlaylist {
  id: string;
  name: string;
}

export const TrayPopup: React.FC = () => {
  const [playlists, setPlaylists] = useState<TrayPlaylist[]>([]);

  useEffect(() => {
    // Ensure transparent window canvas for obsidian glass styling
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';

    invoke<TrayPlaylist[]>('get_tray_playlists')
      .then((pls) => {
        if (pls && Array.isArray(pls)) setPlaylists(pls);
      })
      .catch(console.warn);

    const unlisten = listen<TrayPlaylist[]>('tray://playlists-updated', (e) => {
      if (e.payload && Array.isArray(e.payload)) setPlaylists(e.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  const handleOpen = () => {
    invoke('show_main_window').catch(console.warn);
  };

  const handlePlaylist = (id: string) => {
    invoke('open_tray_playlist', { playlistId: id }).catch(console.warn);
  };

  const handleQuit = () => {
    invoke('quit_app').catch(console.warn);
  };

  return (
    <div className="w-[220px] h-[210px] bg-black border border-[#222225] rounded-xl shadow-[0_16px_40px_rgba(0,0,0,0.95)] p-2.5 flex flex-col justify-between select-none text-[#F4F2F7] overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-2 border-b border-[#1A1A1E] shrink-0">
        <div className="flex items-center gap-2">
          <img src="/app-icon.png" alt="" className="w-4 h-4 rounded-full object-contain shrink-0" />
          <span className="text-[11.5px] font-bold tracking-tight text-white">Offline Player</span>
        </div>
        <button
          onClick={handleOpen}
          className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#19E6A0] hover:bg-[#35F0B1] text-black transition-colors cursor-pointer"
        >
          Open
        </button>
      </div>

      {/* Playlists Section */}
      <div className="flex-1 overflow-y-auto py-1.5 space-y-0.5 min-h-0 pr-0.5 no-scrollbar">
        <div className="text-[9.5px] font-semibold uppercase tracking-wider text-[#66666F] px-1.5 py-0.5">
          Playlists
        </div>

        {/* Liked Songs */}
        <button
          onClick={() => handlePlaylist('liked')}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#141416] text-left transition-colors cursor-pointer group"
        >
          <div className="w-5 h-5 rounded-md bg-[#141418] flex items-center justify-center shrink-0 border border-[#24242A]">
            <Heart className="w-3 h-3 fill-[#19E6A0] text-[#19E6A0]" />
          </div>
          <span className="text-[11.5px] font-medium text-[#E0E0E6] truncate group-hover:text-[#19E6A0]">
            Liked Songs
          </span>
        </button>

        {/* Custom Playlists */}
        {playlists.map((pl) => (
          <button
            key={pl.id}
            onClick={() => handlePlaylist(pl.id)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#141416] text-left transition-colors cursor-pointer group"
          >
            <div className="w-5 h-5 rounded-md bg-[#141418] flex items-center justify-center shrink-0 border border-[#24242A]">
              <ListMusic className="w-3 h-3 text-[#AAA6B2] group-hover:text-[#19E6A0]" />
            </div>
            <span className="text-[11.5px] font-medium text-[#AAA6B2] group-hover:text-white truncate">
              {pl.name}
            </span>
          </button>
        ))}

        {/* New Random Playlist */}
        <button
          onClick={() => handlePlaylist('new')}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[#141416] text-left transition-colors cursor-pointer group text-[#777381] hover:text-[#19E6A0]"
        >
          <div className="w-5 h-5 rounded-md bg-[#101014] flex items-center justify-center shrink-0 border border-dashed border-[#282830]">
            <Plus className="w-3 h-3" />
          </div>
          <span className="text-[11.5px] font-medium truncate">
            New Random Playlist
          </span>
        </button>
      </div>

      {/* Footer Navigation & Quit */}
      <div className="pt-1.5 border-t border-[#1A1A1E] flex items-center justify-between text-[11px] shrink-0">
        <button
          onClick={handleOpen}
          className="flex items-center gap-1.5 text-[#777381] hover:text-white transition-colors cursor-pointer px-1.5 py-0.5 rounded-md hover:bg-[#141416]"
        >
          <ExternalLink className="w-3 h-3" />
          <span>Show App</span>
        </button>

        <button
          onClick={handleQuit}
          className="flex items-center gap-1.5 text-[#777381] hover:text-[#FF667A] transition-colors cursor-pointer px-1.5 py-0.5 rounded-md hover:bg-[#FF667A]/10"
        >
          <LogOut className="w-3 h-3" />
          <span>Quit</span>
        </button>
      </div>
    </div>
  );
};
