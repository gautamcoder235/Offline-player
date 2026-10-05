import React, { useState, useMemo, useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { PlayerProvider, usePlayer } from './context/PlayerContext';
import { UpdateProvider } from './context/UpdateContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { PlayerBar } from './components/PlayerBar';
import { TrackList } from './components/TrackList';
import { DownloaderView } from './components/DownloaderView';
import { LyricsView } from './components/LyricsView';
import { SettingsView } from './components/SettingsView';
import { PlaylistsView } from './components/PlaylistsView';
import { EqualizerModal } from './components/EqualizerModal';
import { VisualizerView } from './components/VisualizerView';
import { QueueDrawer } from './components/QueueDrawer';
import { ToastNotification } from './components/ToastNotification';
import { AmbientGlow } from './components/AmbientGlow';
import { MiniPlayer } from './components/MiniPlayer';
import { ViewMode } from './types';
import './App.css';

import { getCurrentWindow } from '@tauri-apps/api/window';
import { TitleBar } from './components/TitleBar';
import { TrayPopup } from './components/TrayPopup';

const MainApp: React.FC = () => {
  const {
    tracks,
    searchQuery,
    likedTrackIds,
    createPlaylist,
    playlists,
    topTracks,
    isMiniPlayer,
    themeAppearance,
  } = usePlayer();
  const isGlass = themeAppearance === 'aura_glass';
  const [currentView, setCurrentView] = useState<ViewMode>('songs');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'artists' | 'albums' | 'top'>('all');

  const [isEqualizerOpen, setIsEqualizerOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('offline_player_sidebar_collapsed') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('offline_player_sidebar_collapsed', String(isSidebarCollapsed));
  }, [isSidebarCollapsed]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) {
        setIsSidebarCollapsed(true);
      }
    };
    const handleToggle = () => setIsSidebarCollapsed(prev => !prev);
    
    window.addEventListener('resize', handleResize);
    window.addEventListener('toggle-sidebar', handleToggle);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('toggle-sidebar', handleToggle);
    };
  }, []);

  // Listen for global focus-search shortcut (Ctrl+K)
  useEffect(() => {
    const handleFocusSearch = () => {
      if (['settings', 'visualizer', 'download', 'lyrics'].includes(currentView)) {
        setCurrentView('songs');
      }
      setTimeout(() => {
        const input = document.getElementById('global-search-input') as HTMLInputElement | null;
        if (input) {
          input.focus();
          input.select();
        }
      }, 50);
    };

    window.addEventListener('focus-search', handleFocusSearch);
    return () => window.removeEventListener('focus-search', handleFocusSearch);
  }, [currentView]);

  // Listen for Tray context menu navigation events
  useEffect(() => {
    let unlistenOpenView: (() => void) | undefined;
    let unlistenOpenPlaylist: (() => void) | undefined;
    let unlistenNewPlaylist: (() => void) | undefined;

    const setupTrayNavigation = async () => {
      unlistenOpenView = await listen<ViewMode>('tray://open-view', (event) => {
        setSelectedPlaylistId(null);
        setCurrentView(event.payload);
      });
      unlistenOpenPlaylist = await listen<string>('tray://open-playlist', (event) => {
        setSelectedPlaylistId(event.payload);
        setCurrentView('playlist_detail');
      });
      unlistenNewPlaylist = await listen('tray://new-playlist', () => {
        const pool = [
          'Late Night Chill',
          'Neon Vibes',
          'Acoustic Bliss',
          'Daily Discovery',
          'Golden Hour',
          'Retro Wave',
          'Focus Flow',
          'Midnight Grooves',
        ];
        const colors = ['#19E6A0', '#E8C77A', '#7F5AF0', '#2CB67D', '#FF667A', '#3B82F6'];
        const randomName = pool[Math.floor(Math.random() * pool.length)] + ` #${playlists.length + 1}`;
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        const randomTracks = tracks.slice(0, Math.min(5, tracks.length)).map((t) => t.id);
        const newPl = createPlaylist(randomName, 'Curated random mix', randomTracks, randomColor);
        if (newPl?.id) {
          setSelectedPlaylistId(newPl.id);
          setCurrentView('playlist_detail');
        }
      });
    };

    setupTrayNavigation();

    return () => {
      if (unlistenOpenView) unlistenOpenView();
      if (unlistenOpenPlaylist) unlistenOpenPlaylist();
      if (unlistenNewPlaylist) unlistenNewPlaylist();
    };
  }, [createPlaylist, playlists.length, tracks]);

  // Filtered tracks based on search query & category
  const filteredTracks = useMemo(() => {
    let list = tracks;

    if (currentView === 'liked') {
      list = list.filter((t) => likedTrackIds.has(t.id));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.artist.toLowerCase().includes(q) ||
          t.album.toLowerCase().includes(q)
      );
    }

    if (filterType === 'artists') {
      list = [...list].sort((a, b) => a.artist.localeCompare(b.artist));
    } else if (filterType === 'albums') {
      list = [...list].sort((a, b) => a.album.localeCompare(b.album));
    }

    return list;
  }, [tracks, currentView, likedTrackIds, searchQuery, filterType]);

  const renderMainContent = () => {
    switch (currentView) {
      case 'visualizer':
        return <VisualizerView />;
      case 'download':
        return <DownloaderView />;
      case 'lyrics':
        return <LyricsView />;
      case 'settings':
        return <SettingsView />;
      case 'playlists':
      case 'playlist_detail':
        return (
          <PlaylistsView
            selectedPlaylistId={selectedPlaylistId}
            onSelectPlaylist={setSelectedPlaylistId}
            onViewChange={setCurrentView}
          />
        );
      case 'top_tracks':
        return (
          <TrackList
            tracks={topTracks}
            title="Top Played Tracks"
            subtitle="Your most listened offline songs"
            playlistId="top_tracks"
          />
        );
      case 'liked':
        return (
          <TrackList
            tracks={filteredTracks}
            title="Liked Songs"
            subtitle={`${filteredTracks.length} saved favorite songs`}
            playlistId="liked"
          />
        );
      case 'songs':
      default:
        return (
          <TrackList
            tracks={filteredTracks}
            title="All Offline Music"
            subtitle={`${filteredTracks.length} tracks found on this computer`}
            playlistId="all"
          />
        );
    }
  };

  if (isMiniPlayer) {
    return (
      <div className="w-screen h-screen overflow-hidden bg-[#0E0D13]">
        <MiniPlayer />
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-screen w-screen overflow-hidden ${isGlass ? 'bg-[#07060A]' : 'bg-[#0B0A0F]'} text-[#F4F2F7] relative`}>
      <TitleBar />
      {/* Dynamic Ambient Glow Tinted by Album Art */}
      <AmbientGlow />

      {/* Main App Frame */}
      <div className="flex flex-1 overflow-hidden z-10 pt-0 min-h-0">
        {/* Left Sidebar */}
        <Sidebar
          currentView={currentView}
          onViewChange={setCurrentView}
          selectedPlaylistId={selectedPlaylistId}
          onSelectPlaylist={setSelectedPlaylistId}
          onOpenEqualizer={() => setIsEqualizerOpen(true)}
          onOpenVisualizer={() => setCurrentView((prev) => (prev === 'visualizer' ? 'songs' : 'visualizer'))}
          isCollapsed={isSidebarCollapsed}
          onToggle={() => setIsSidebarCollapsed(prev => !prev)}
        />

        {/* Center Main Stage - Rounded Card Canvas with Uniform Decreased Spacing */}
        <main className={`flex-1 flex flex-col overflow-hidden relative min-h-0 m-1.5 rounded-2xl transition-all duration-300 ${
          isGlass
            ? 'bg-[#0F0E15]/45 backdrop-blur-2xl border border-white/[0.08] shadow-2xl'
            : 'bg-[#100F14] border border-[#292731]/40 shadow-sm'
        }`}>
          <Header 
            filterType={currentView === 'top_tracks' ? 'top' : filterType} 
            onFilterChange={(type) => {
              if (type === 'top') {
                setCurrentView('top_tracks');
              } else {
                setFilterType(type as any);
                if (currentView === 'top_tracks') setCurrentView('songs');
              }
            }} 
          />
          <div className="flex-1 overflow-hidden flex flex-col">{renderMainContent()}</div>
        </main>
      </div>

      {/* Persistent Bottom Player Bar */}
      <PlayerBar
        onToggleLyrics={() => setCurrentView((prev) => (prev === 'lyrics' ? 'songs' : 'lyrics'))}
        isLyricsActive={currentView === 'lyrics'}
        onToggleQueue={() => setIsQueueOpen((prev) => !prev)}
        isQueueActive={isQueueOpen}
        onToggleEqualizer={() => setIsEqualizerOpen((prev) => !prev)}
        isEqualizerActive={isEqualizerOpen}
        onToggleVisualizer={() => setCurrentView((prev) => (prev === 'visualizer' ? 'songs' : 'visualizer'))}
        isVisualizerActive={currentView === 'visualizer'}
      />

      {/* Modals & Overlays */}
      <EqualizerModal isOpen={isEqualizerOpen} onClose={() => setIsEqualizerOpen(false)} />
      <QueueDrawer isOpen={isQueueOpen} onClose={() => setIsQueueOpen(false)} />
      <ToastNotification />
    </div>
  );
};

export default function App() {
  const isTrayPopup = typeof window !== 'undefined' && getCurrentWindow().label === 'tray_popup';

  if (isTrayPopup) {
    if (typeof document !== 'undefined') {
      document.documentElement.classList.add('tray-popup-mode');
      document.body.classList.add('tray-popup-mode');
      document.documentElement.style.setProperty('background', 'transparent', 'important');
      document.documentElement.style.setProperty('background-color', 'transparent', 'important');
      document.documentElement.style.setProperty('height', '100vh', 'important');
      document.documentElement.style.setProperty('width', '100vw', 'important');
      document.documentElement.style.setProperty('overflow', 'hidden', 'important');
      document.body.style.setProperty('background', 'transparent', 'important');
      document.body.style.setProperty('background-color', 'transparent', 'important');
      document.body.style.setProperty('height', '100vh', 'important');
      document.body.style.setProperty('width', '100vw', 'important');
      document.body.style.setProperty('overflow', 'hidden', 'important');
    }
    return <TrayPopup />;
  }

  return (
    <PlayerProvider>
      <UpdateProvider>
        <MainApp />
      </UpdateProvider>
    </PlayerProvider>
  );
}
