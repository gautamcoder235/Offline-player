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
    <div className="w-[260px] h-[340px] bg-[#121118]/95 backdrop-blur-2xl border border-[#292731] rounded-2xl shadow-[0_16px_40px_rgba(0,0,0,0.7)] p-3 flex flex-col justify-between select-none text-[#F4F2F7] overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-[#282631]/80 shrink-0">
        <div className="flex items-center gap-2">
          <img src="/app-icon.png" alt="" className="w-5 h-5 rounded-full object-contain shrink-0" />
          <span className="text-xs font-bold tracking-tight text-[#F4F2F7]">Offline Player</span>
        </div>
        <button
          onClick={handleOpen}
          className="px-2.5 py-0.5 rounded-lg text-[10px] font-semibold bg-[#19E6A0] hover:bg-[#35F0B1] text-black transition-colors cursor-pointer"
        >
          Open
        </button>
      </div>

      {/* Playlists Section (No play/pause, back, or forward buttons) */}
      <div className="flex-1 overflow-y-auto py-2 space-y-1 min-h-0 pr-0.5">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-[#65616F] px-2 py-0.5">
          Playlists
        </div>

        {/* Liked Songs */}
        <button
          onClick={() => handlePlaylist('liked')}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-[#1D1C23] text-left transition-colors cursor-pointer group"
        >
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#19E6A0]/20 to-[#E8C77A]/20 flex items-center justify-center shrink-0 border border-[#292731]">
            <Heart className="w-3.5 h-3.5 fill-[#19E6A0] text-[#19E6A0]" />
          </div>
          <span className="text-xs font-medium text-[#F4F2F7] truncate group-hover:text-[#19E6A0]">
            Liked Songs
          </span>
        </button>

        {/* Custom Playlists */}
        {playlists.map((pl) => (
          <button
            key={pl.id}
            onClick={() => handlePlaylist(pl.id)}
            className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-[#1D1C23] text-left transition-colors cursor-pointer group"
          >
            <div className="w-6 h-6 rounded-lg bg-[#191822] flex items-center justify-center shrink-0 border border-[#292731]">
              <ListMusic className="w-3.5 h-3.5 text-[#AAA6B2] group-hover:text-[#19E6A0]" />
            </div>
            <span className="text-xs font-medium text-[#AAA6B2] group-hover:text-[#F4F2F7] truncate">
              {pl.name}
            </span>
          </button>
        ))}

        {/* New Random Playlist */}
        <button
          onClick={() => handlePlaylist('new')}
          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl hover:bg-[#1D1C23] text-left transition-colors cursor-pointer group text-[#777381] hover:text-[#19E6A0]"
        >
          <div className="w-6 h-6 rounded-lg bg-[#16151C] flex items-center justify-center shrink-0 border border-dashed border-[#292731]">
            <Plus className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-medium truncate">
            New Random Playlist
          </span>
        </button>
      </div>

      {/* Footer Navigation & Quit */}
      <div className="pt-2 border-t border-[#282631]/80 flex items-center justify-between text-xs shrink-0">
        <button
          onClick={handleOpen}
          className="flex items-center gap-1.5 text-[#777381] hover:text-[#F4F2F7] transition-colors cursor-pointer px-2 py-1 rounded-lg hover:bg-[#1A1922]"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          <span>Show App</span>
        </button>

        <button
          onClick={handleQuit}
          className="flex items-center gap-1.5 text-[#777381] hover:text-[#FF667A] transition-colors cursor-pointer px-2 py-1 rounded-lg hover:bg-[#FF667A]/10"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Quit</span>
        </button>
      </div>
    </div>
  );
};
