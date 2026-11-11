import React, { useState, useMemo, useEffect, useRef } from 'react';
import { AnimatePresence, motion, Variants } from 'framer-motion';
import { listen } from '@tauri-apps/api/event';
import { PlayerProvider, usePlayer } from './context/PlayerContext';
import { UpdateProvider } from './context/UpdateContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { PlayerBar } from './components/PlayerBar';
import { TrackList } from './components/TrackList';
import { DownloaderView } from './components/DownloaderView';
import { OnlineSearchView } from './components/OnlineSearchView';
import { LyricsView } from './components/LyricsView';
import { SettingsView } from './components/SettingsView';
import { PlaylistsView } from './components/PlaylistsView';
import { EqualizerModal } from './components/EqualizerModal';
import { VisualizerView } from './components/VisualizerView';
import { QueueDrawer } from './components/QueueDrawer';
import { ToastNotification } from './components/ToastNotification';
import { AmbientGlow } from './components/AmbientGlow';
import { MiniPlayer } from './components/MiniPlayer';
import { ViewMode, Track } from './types';
import { matchTrackWithLyrics, TrackMatchResult } from './utils/lyricsSearch';
import './App.css';

import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { UploadCloud } from 'lucide-react';
import { TitleBar } from './components/TitleBar';
import { TrayPopup } from './components/TrayPopup';
import { AlbumsView } from './components/AlbumsView';
import { ArtistsView } from './components/ArtistsView';

const VIEW_INDEX_MAP: Record<string, number> = {
  songs: 0,
  online_search: 1,
  liked: 2,
  top_tracks: 3,
  download: 4,
  playlists: 5,
  playlist_detail: 5.5,
  albums: 5.6,
  artists: 5.7,
  visualizer: 6,
  lyrics: 7,
  settings: 8,
};

const FILTER_INDEX_MAP: Record<string, number> = {
  all: 0,
  artists: 1,
  albums: 2,
  top: 3,
  online: 4,
};

const tabVariants: Variants = {
  initial: (dir: number) => ({
    opacity: 0,
    y: dir >= 0 ? 14 : -14,
    scale: 0.992,
    filter: 'blur(4px)',
  }),
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      duration: 0.24,
      ease: [0.16, 1, 0.3, 1] as [number, number, number, number],
    },
  },
  exit: (dir: number) => ({
    opacity: 0,
    y: dir >= 0 ? -10 : 10,
    scale: 0.995,
    filter: 'blur(2px)',
    transition: {
      duration: 0.12,
      ease: [0.4, 0, 1, 1] as [number, number, number, number],
    },
  }),
};

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
    addDroppedTracks,
    currentTrack,
    playingPlaylistId,
  } = usePlayer();
  const isGlass = themeAppearance === 'aura_glass';
  const [currentView, setCurrentView] = useState<ViewMode>('songs');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'artists' | 'albums' | 'top'>('all');
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const prevViewRef = useRef<ViewMode>(currentView);
  const prevFilterRef = useRef<string>(filterType);
  const prevPlaylistIdRef = useRef<string | null>(selectedPlaylistId);
  const [navDirection, setNavDirection] = useState<number>(1);

  // Directional navigation tracker for spatial tab transition glide
  useEffect(() => {
    let dir = 1;
    if (currentView !== prevViewRef.current) {
      const prevIdx = VIEW_INDEX_MAP[prevViewRef.current] ?? 0;
      const curIdx = VIEW_INDEX_MAP[currentView] ?? 0;
      dir = curIdx >= prevIdx ? 1 : -1;
      prevViewRef.current = currentView;
    } else if (filterType !== prevFilterRef.current) {
      const prevIdx = FILTER_INDEX_MAP[prevFilterRef.current] ?? 0;
      const curIdx = FILTER_INDEX_MAP[filterType] ?? 0;
      dir = curIdx >= prevIdx ? 1 : -1;
      prevFilterRef.current = filterType;
    } else if (selectedPlaylistId !== prevPlaylistIdRef.current) {
      dir = selectedPlaylistId ? 1 : -1;
      prevPlaylistIdRef.current = selectedPlaylistId;
    }
    setNavDirection(dir);
  }, [currentView, filterType, selectedPlaylistId]);

  const [isEqualizerOpen, setIsEqualizerOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('offline_player_sidebar_collapsed') === 'true';
  });

  // Window-wide drag and drop listener for audio files & folders
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupDragDrop = async () => {
      try {
        const appWindow = getCurrentWebviewWindow();
        unlisten = await appWindow.onDragDropEvent(async (event) => {
          if (event.payload.type === 'enter' || event.payload.type === 'over') {
            setIsDraggingOver(true);
          } else if (event.payload.type === 'leave') {
            setIsDraggingOver(false);
          } else if (event.payload.type === 'drop') {
            setIsDraggingOver(false);
            const droppedPaths = event.payload.paths;
            if (droppedPaths && droppedPaths.length > 0) {
              try {
                const newTracks = await invoke<any[]>('handle_dropped_paths', { paths: droppedPaths });
                addDroppedTracks(newTracks || []);
              } catch (err) {
                console.error('Failed to process dropped paths:', err);
              }
            }
          }
        });
      } catch (err) {
        console.warn('Drag and drop listener registration skipped or failed:', err);
      }
    };

    setupDragDrop();

    return () => {
      if (unlisten) unlisten();
    };
  }, [addDroppedTracks]);

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
      if (['settings', 'visualizer', 'download', 'lyrics', 'online_search'].includes(currentView)) {
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

  // Listen for locate-current-track event from PlayerBar
  useEffect(() => {
    const handleLocateCurrentTrack = (e: Event) => {
      const customEvent = e as CustomEvent<{ track: Track }>;
      const track = customEvent.detail?.track || currentTrack;
      if (!track) return;

      const pid = playingPlaylistId;

      // Smart routing: determine destination view based on origin or track metadata
      if (pid === 'online_search' || track.id.startsWith('online_') || track.is_online || (!track.file_path && track.stream_url)) {
        setCurrentView('online_search');
      } else if (pid === 'download') {
        setCurrentView('download');
      } else if (pid === 'liked') {
        setSelectedPlaylistId(null);
        setCurrentView('liked');
      } else if (pid === 'top_tracks') {
        setSelectedPlaylistId(null);
        setCurrentView('top_tracks');
      } else if (pid && pid.startsWith('album_')) {
        setFilterType('albums');
        setCurrentView('albums');
      } else if (pid && pid.startsWith('artist_')) {
        setFilterType('artists');
        setCurrentView('artists');
      } else if (pid && playlists.some((p) => p.id === pid)) {
        setSelectedPlaylistId(pid);
        setCurrentView('playlist_detail');
      } else {
        // Default to All Offline Music
        setSelectedPlaylistId(null);
        setFilterType('all');
        setCurrentView('songs');
      }

      // Allow the view to render, then trigger smooth scroll & flash highlight across Framer Motion transitions
      const triggerScroll = () => {
        window.dispatchEvent(
          new CustomEvent('scroll-to-track', {
            detail: { trackId: track.id, title: track.title, artist: track.artist },
          })
        );
      };

      // Staggered triggers:
      // 40ms: Instant highlight if already on target view
      // 160ms: Target view mounted
      // 340ms: Framer Motion spatial tab animation complete
      // 520ms: Final safety alignment once virtual list settles
      const timers = [
        setTimeout(triggerScroll, 40),
        setTimeout(triggerScroll, 160),
        setTimeout(triggerScroll, 340),
        setTimeout(triggerScroll, 520),
      ];
      return () => {
        timers.forEach(clearTimeout);
      };
    };

    window.addEventListener('locate-current-track', handleLocateCurrentTrack);
    return () => window.removeEventListener('locate-current-track', handleLocateCurrentTrack);
  }, [currentTrack, playingPlaylistId, playlists]);

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

  // Filtered tracks based on search query & category (with lyrics matching and ranking)
  const filteredTracks = useMemo(() => {
    let list = currentView === 'top_tracks' ? topTracks : tracks;

    if (currentView === 'liked') {
      list = list.filter((t) => likedTrackIds.has(t.id));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim();
      const matchedResults: TrackMatchResult[] = [];

      for (const t of list) {
        const result = matchTrackWithLyrics(t, q);
        if (result.matched) {
          matchedResults.push(result);
        }
      }

      if (filterType === 'artists') {
        matchedResults.sort((a, b) => a.track.artist.localeCompare(b.track.artist) || a.track.title.localeCompare(b.track.title));
      } else if (filterType === 'albums') {
        matchedResults.sort((a, b) => a.track.album.localeCompare(b.track.album) || a.track.title.localeCompare(b.track.title));
      } else {
        matchedResults.sort((a, b) => b.score - a.score || a.track.artist.localeCompare(b.track.artist) || a.track.title.localeCompare(b.track.title));
      }

      return matchedResults.map((r) => r.track);
    }

    if (filterType === 'artists') {
      list = [...list].sort((a, b) => a.artist.localeCompare(b.artist) || a.title.localeCompare(b.title));
    } else if (filterType === 'albums') {
      list = [...list].sort((a, b) => a.album.localeCompare(b.album) || a.title.localeCompare(b.title));
    }

    return list;
  }, [tracks, topTracks, currentView, likedTrackIds, searchQuery, filterType]);

  const renderMainContent = () => {
    switch (currentView) {
      case 'visualizer':
        return <VisualizerView />;
      case 'download':
        return <DownloaderView />;
      case 'online_search':
        return (
          <OnlineSearchView
            initialQuery={searchQuery}
            onNavigateToDownloader={() => setCurrentView('download')}
          />
        );
      case 'lyrics':
        return <LyricsView />;
      case 'settings':
        return <SettingsView />;
      case 'albums':
        return (
          <AlbumsView
            tracks={filteredTracks}
            onSelectPlaylist={setSelectedPlaylistId}
            onViewChange={setCurrentView}
          />
        );
      case 'artists':
        return (
          <ArtistsView
            tracks={filteredTracks}
            onSelectPlaylist={setSelectedPlaylistId}
            onViewChange={setCurrentView}
          />
        );
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
            tracks={filteredTracks}
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
        if (filterType === 'albums') {
          return (
            <AlbumsView
              tracks={filteredTracks}
              onSelectPlaylist={setSelectedPlaylistId}
              onViewChange={setCurrentView}
            />
          );
        }
        if (filterType === 'artists') {
          return (
            <ArtistsView
              tracks={filteredTracks}
              onSelectPlaylist={setSelectedPlaylistId}
              onViewChange={setCurrentView}
            />
          );
        }
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
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#08080B] text-[#F8FAFC] relative">
      {/* Window-wide Drag and Drop Overlay */}
      {isDraggingOver && (
        <div className="fixed inset-0 z-50 bg-[#08080B]/90 backdrop-blur-md flex flex-col items-center justify-center border-2 border-dashed border-[var(--accent)] pointer-events-none animate-in fade-in duration-150 select-none">
          <div className="p-6 rounded-2xl bg-[#14141A] border border-white/[0.08] flex flex-col items-center gap-3 shadow-2xl">
            <UploadCloud className="w-12 h-12 text-[var(--accent)] animate-bounce" />
            <div className="text-center">
              <h3 className="text-base font-bold text-[#F8FAFC]">Drop audio files or folders here</h3>
              <p className="text-xs text-[#94A3B8] mt-1">Instant addition to your library</p>
            </div>
          </div>
        </div>
      )}

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

        {/* Center Main Stage */}
        <main className={`flex-1 flex flex-col overflow-hidden relative min-h-0 transition-colors duration-300 ${
          isGlass
            ? 'bg-[#0E0E13]/45 backdrop-blur-2xl'
            : 'bg-[#0E0E13]'
        }`}>
          <Header 
            filterType={currentView === 'online_search' ? 'online' : currentView === 'top_tracks' ? 'top' : filterType} 
            onFilterChange={(type) => {
              if (type === 'online') {
                setCurrentView('online_search');
              } else if (type === 'top') {
                setCurrentView('top_tracks');
              } else {
                setFilterType(type as any);
                if (currentView === 'top_tracks' || currentView === 'online_search') setCurrentView('songs');
              }
            }} 
            currentView={currentView}
            onViewChange={setCurrentView}
          />
          <div className="flex-1 overflow-hidden flex flex-col relative">
            <AnimatePresence mode="wait" custom={navDirection}>
              <motion.div
                key={currentView === 'playlist_detail' ? `playlist_detail_${selectedPlaylistId}` : `${currentView}_${filterType}`}
                custom={navDirection}
                variants={tabVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                className="flex-1 overflow-hidden flex flex-col will-change-[transform,opacity,filter]"
              >
                {renderMainContent()}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      {/* Persistent Bottom Player Bar */}
      <PlayerBar
        onToggleLyrics={() => setCurrentView((prev) => (prev === 'lyrics' ? 'songs' : 'lyrics'))}
        isLyricsActive={currentView === 'lyrics'}
        onToggleQueue={() => setIsQueueOpen((prev) => !prev)}
        isQueueActive={isQueueOpen}
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
