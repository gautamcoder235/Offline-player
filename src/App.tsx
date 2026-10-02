import React, { useState, useMemo } from 'react';
import { PlayerProvider, usePlayer } from './context/PlayerContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { PlayerBar } from './components/PlayerBar';
import { TrackList } from './components/TrackList';
import { DownloaderView } from './components/DownloaderView';
import { LyricsView } from './components/LyricsView';
import { SettingsView } from './components/SettingsView';
import { PlaylistsView } from './components/PlaylistsView';
import { EqualizerModal } from './components/EqualizerModal';
import { VisualizerCanvas } from './components/VisualizerCanvas';
import { QueueDrawer } from './components/QueueDrawer';
import { ToastNotification } from './components/ToastNotification';
import { AmbientGlow } from './components/AmbientGlow';
import { ViewMode } from './types';
import './App.css';

const MainApp: React.FC = () => {
  const { tracks, searchQuery, likedTrackIds } = usePlayer();
  const [currentView, setCurrentView] = useState<ViewMode>('songs');
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'artists' | 'albums'>('all');

  const [isEqualizerOpen, setIsEqualizerOpen] = useState(false);
  const [isVisualizerOpen, setIsVisualizerOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);

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
          />
        );
      case 'liked':
        return (
          <TrackList
            tracks={filteredTracks}
            title="Liked Songs"
            subtitle={`${filteredTracks.length} saved favorite songs`}
          />
        );
      case 'songs':
      default:
        return (
          <TrackList
            tracks={filteredTracks}
            title="All Offline Music"
            subtitle={`${filteredTracks.length} tracks found on this computer`}
          />
        );
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0a0b0e] text-white relative">
      {/* Dynamic Ambient Glow Tinted by Album Art */}
      <AmbientGlow />

      {/* Main App Frame */}
      <div className="flex flex-1 overflow-hidden z-10">
        {/* Left Sidebar */}
        <Sidebar
          currentView={currentView}
          onViewChange={setCurrentView}
          selectedPlaylistId={selectedPlaylistId}
          onSelectPlaylist={setSelectedPlaylistId}
          onOpenEqualizer={() => setIsEqualizerOpen(true)}
          onOpenVisualizer={() => setIsVisualizerOpen(true)}
        />

        {/* Center Main Stage */}
        <main className="flex-1 flex flex-col overflow-hidden relative">
          <Header filterType={filterType} onFilterChange={setFilterType} />
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
        onToggleVisualizer={() => setIsVisualizerOpen((prev) => !prev)}
        isVisualizerActive={isVisualizerOpen}
      />

      {/* Modals & Overlays */}
      <EqualizerModal isOpen={isEqualizerOpen} onClose={() => setIsEqualizerOpen(false)} />
      <VisualizerCanvas isOpen={isVisualizerOpen} onClose={() => setIsVisualizerOpen(false)} />
      <QueueDrawer isOpen={isQueueOpen} onClose={() => setIsQueueOpen(false)} />
      <ToastNotification />
    </div>
  );
};

export default function App() {
  return (
    <PlayerProvider>
      <MainApp />
    </PlayerProvider>
  );
}
