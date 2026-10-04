import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Track, RepeatMode, Playlist, ParsedLyrics } from '../types';

import { audioEngine, EQUALIZER_PRESETS } from '../services/audioEngine';
import { parseLrcLyrics } from '../utils/helpers';

interface ToastInfo {
  id: string;
  title: string;
  subtitle: string;
  cover?: string | null;
}

interface PlayerContextType {
  tracks: Track[];
  currentTrack: Track | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeatMode: RepeatMode;
  queue: Track[];
  likedTrackIds: Set<string>;
  playlists: Playlist[];
  equalizerPreset: string;
  customGains: [number, number, number, number, number];
  currentLyrics: ParsedLyrics | null;
  isLoadingLyrics: boolean;
  activeLyricIndex: number;
  toast: ToastInfo | null;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  // Controls
  playTrack: (track: Track, newQueue?: Track[]) => Promise<void>;
  togglePlay: () => void;
  nextTrack: () => void;
  prevTrack: () => void;
  seekTo: (time: number) => void;
  setVolumeLevel: (vol: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggleLike: (trackId: string) => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (index: number) => void;
  moveQueueItem: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  createPlaylist: (name: string, description?: string) => void;
  deletePlaylist: (id: string) => void;
  addTrackToPlaylist: (playlistId: string, trackId: string) => void;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  setPreset: (name: string) => void;
  setCustomGain: (bandIndex: number, gain: number) => void;
  refreshLibrary: (directories?: string[]) => Promise<void>;
  saveLyrics: (track: Track, lrcContent: string) => Promise<void>;
  openInExplorer: (filePath: string) => Promise<void>;
}

const PlayerContext = createContext<PlayerContextType | null>(null);

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [shuffle, setShuffle] = useState<boolean>(false);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off');
  const [queue, setQueue] = useState<Track[]>([]);
  const [likedTrackIds, setLikedTrackIds] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('offline_player_liked');
      return saved ? new Set(JSON.parse(saved)) : new Set();
    } catch {
      return new Set();
    }
  });
  const [playlists, setPlaylists] = useState<Playlist[]>(() => {
    try {
      const saved = localStorage.getItem('offline_player_playlists');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [equalizerPreset, setEqualizerPreset] = useState<string>('Flat');
  const [customGains, setCustomGains] = useState<[number, number, number, number, number]>([0, 0, 0, 0, 0]);
  const [currentLyrics, setCurrentLyrics] = useState<ParsedLyrics | null>(null);
  const [isLoadingLyrics, setIsLoadingLyrics] = useState<boolean>(false);
  const [activeLyricIndex, setActiveLyricIndex] = useState<number>(-1);
  const [toast, setToast] = useState<ToastInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Refs for audio engine callbacks to avoid stale closures
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const currentTrackRef = useRef(currentTrack);
  currentTrackRef.current = currentTrack;
  const repeatModeRef = useRef(repeatMode);
  repeatModeRef.current = repeatMode;
  const shuffleRef = useRef(shuffle);
  shuffleRef.current = shuffle;
  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const currentTimeRef = useRef(currentTime);
  currentTimeRef.current = currentTime;
  const durationRef = useRef(duration);
  durationRef.current = duration;
  const volumeRef = useRef(volume);
  volumeRef.current = volume;
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  const showToast = useCallback((title: string, subtitle: string, cover?: string | null) => {
    const id = Date.now().toString();
    setToast({ id, title, subtitle, cover });
    setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, 4000);
  }, []);

  // Save liked & playlists to localStorage
  useEffect(() => {
    localStorage.setItem('offline_player_liked', JSON.stringify([...likedTrackIds]));
  }, [likedTrackIds]);

  useEffect(() => {
    localStorage.setItem('offline_player_playlists', JSON.stringify(playlists));
  }, [playlists]);

  // Load Initial Library from Tauri
  const refreshLibrary = useCallback(async (directories?: string[]) => {
    try {
      const scannedTracks = await invoke<Track[]>('scan_library', {
        directories: directories || null,
      });
      setTracks(scannedTracks);
      if (scannedTracks.length > 0 && !currentTrackRef.current) {
        setQueue(scannedTracks);
      }
    } catch (e) {
      console.error('Failed to scan library:', e);
    }
  }, []);

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  // Load lyrics for track
  const fetchLyrics = useCallback(async (track: Track) => {
    setIsLoadingLyrics(true);
    setCurrentLyrics(null);
    setActiveLyricIndex(-1);

    try {
      // 1. Check local LRC or embedded tags
      const localResult = await invoke<{ synced: boolean; lyrics: string; source: string } | null>(
        'get_track_lyrics',
        { filePath: track.file_path }
      );

      if (localResult && localResult.lyrics) {
        const parsed = parseLrcLyrics(localResult.lyrics);
        setCurrentLyrics(parsed);
        setIsLoadingLyrics(false);
        return;
      }

      // 2. Fetch from LRCLIB
      const params = new URLSearchParams({
        track_name: track.title,
        artist_name: track.artist,
        duration: Math.round(track.duration).toString(),
      });

      const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        const lrcContent = data.syncedLyrics || data.plainLyrics;
        if (lrcContent) {
          const parsed = parseLrcLyrics(lrcContent);
          setCurrentLyrics(parsed);

          // Save locally if synced
          if (data.syncedLyrics) {
            invoke('save_track_lyrics', {
              filePath: track.file_path,
              lyricsContent: data.syncedLyrics,
            }).catch(console.warn);
          }
          setIsLoadingLyrics(false);
          return;
        }
      }
    } catch (e) {
      console.warn('Lyrics fetch error:', e);
    }

    // 3. Fallback dummy lyrics if none found
    setCurrentLyrics({
      isSynced: false,
      lines: [
        { time: 0, text: `♫ ${track.title} ♫` },
        { time: 4, text: `Artist: ${track.artist}` },
        { time: 8, text: `Album: ${track.album}` },
        { time: 12, text: 'No synchronized lyrics available for this song.' },
      ],
      rawText: '',
      source: 'fallback',
    });
    setIsLoadingLyrics(false);
  }, []);

  // Update active lyric line based on currentTime
  useEffect(() => {
    if (!currentLyrics || !currentLyrics.isSynced || currentLyrics.lines.length === 0) {
      return;
    }
    const lines = currentLyrics.lines;
    let activeIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (currentTime >= lines[i].time - 0.25) {
        activeIdx = i;
      } else {
        break;
      }
    }
    setActiveLyricIndex(activeIdx);
  }, [currentTime, currentLyrics]);

  // Audio Engine Hookups
  useEffect(() => {
    audioEngine.onTimeUpdate = (cTime, dur) => {
      setCurrentTime(cTime);
      if (dur > 0) setDuration(dur);
    };

    audioEngine.onPlay = () => setIsPlaying(true);
    audioEngine.onPause = () => setIsPlaying(false);

    audioEngine.onEnded = () => {
      const mode = repeatModeRef.current;
      if (mode === 'one') {
        audioEngine.seek(0);
        audioEngine.play();
      } else {
        // Play next track
        handleNextTrack();
      }
    };
  }, []);

  // Next Track Logic
  const handleNextTrack = useCallback(() => {
    const q = queueRef.current;
    const current = currentTrackRef.current;
    if (!current || q.length === 0) return;

    if (shuffleRef.current && q.length > 1) {
      let randIdx = Math.floor(Math.random() * q.length);
      while (q[randIdx].id === current.id && q.length > 1) {
        randIdx = Math.floor(Math.random() * q.length);
      }
      playTrack(q[randIdx]);
      return;
    }

    const currentIndex = q.findIndex((t) => t.id === current.id);
    if (currentIndex !== -1 && currentIndex + 1 < q.length) {
      playTrack(q[currentIndex + 1]);
    } else if (repeatModeRef.current === 'all' && q.length > 0) {
      playTrack(q[0]);
    } else {
      setIsPlaying(false);
    }
  }, []);

  const handlePrevTrack = useCallback(() => {
    if (currentTime > 3) {
      audioEngine.seek(0);
      return;
    }
    const q = queueRef.current;
    const current = currentTrackRef.current;
    if (!current || q.length === 0) return;

    const currentIndex = q.findIndex((t) => t.id === current.id);
    if (currentIndex > 0) {
      playTrack(q[currentIndex - 1]);
    } else if (q.length > 0) {
      playTrack(q[q.length - 1]);
    }
  }, [currentTime]);

  const playTrack = useCallback(
    async (track: Track, newQueue?: Track[]) => {
      if (newQueue) {
        setQueue(newQueue);
      }
      
      let trackToPlay = track;
      // Fetch cover art if missing
      if (!track.cover_art) {
        try {
          const art = await invoke<string | null>('fetch_cover_art', { artist: track.artist, title: track.title });
          if (art) {
            trackToPlay = { ...track, cover_art: art };
            setTracks(prev => prev.map(t => t.id === track.id ? { ...t, cover_art: art } : t));
          }
        } catch (e) {
          console.warn('Cover art fetch failed:', e);
        }
      }

      setCurrentTrack(trackToPlay);
      setDuration(trackToPlay.duration || 0);
      setCurrentTime(0);

      showToast(trackToPlay.title, trackToPlay.artist, trackToPlay.cover_art);
      fetchLyrics(trackToPlay);

      try {
        await audioEngine.loadTrack(trackToPlay.stream_url);
        await audioEngine.play();
        setIsPlaying(true);
      } catch (e) {
        console.error('Failed to play track:', e);
      }
    },
    [fetchLyrics, showToast]
  );

  const togglePlay = useCallback(() => {
    if (!currentTrack) {
      if (tracks.length > 0) {
        playTrack(tracks[0], tracks);
      }
      return;
    }

    if (isPlaying) {
      audioEngine.pause();
      setIsPlaying(false);
    } else {
      audioEngine.play();
      setIsPlaying(true);
    }
  }, [currentTrack, isPlaying, playTrack, tracks]);

  // Tray Event Listeners
  useEffect(() => {
    let unlistenPlayPause: (() => void) | undefined;
    let unlistenNext: (() => void) | undefined;
    let unlistenPrev: (() => void) | undefined;

    const setupTrayListeners = async () => {
      unlistenPlayPause = await listen('tray://play-pause', () => togglePlay());
      unlistenNext = await listen('tray://next', () => handleNextTrack());
      unlistenPrev = await listen('tray://prev', () => handlePrevTrack());
    };

    setupTrayListeners();

    return () => {
      if (unlistenPlayPause) unlistenPlayPause();
      if (unlistenNext) unlistenNext();
      if (unlistenPrev) unlistenPrev();
    };
  }, [togglePlay, handleNextTrack, handlePrevTrack]);

  const seekTo = useCallback((time: number) => {
    audioEngine.seek(time);
    setCurrentTime(time);
  }, []);

  const setVolumeLevel = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, vol));
    setVolume(clamped);
    audioEngine.setVolume(clamped);
    if (clamped > 0 && isMuted) {
      setIsMuted(false);
      audioEngine.setMuted(false);
    }
  }, [isMuted]);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      audioEngine.setMuted(next);
      return next;
    });
  }, []);

  const toggleShuffle = useCallback(() => {
    setShuffle((prev) => !prev);
  }, []);

  const cycleRepeat = useCallback(() => {
    setRepeatMode((prev) => {
      if (prev === 'off') return 'all';
      if (prev === 'all') return 'one';
      return 'off';
    });
  }, []);

  const toggleLike = useCallback((trackId: string) => {
    setLikedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return next;
    });
  }, []);

  const addToQueue = useCallback((track: Track) => {
    setQueue((prev) => [...prev, track]);
    showToast('Added to Queue', track.title, track.cover_art);
  }, [showToast]);

  const removeFromQueue = useCallback((index: number) => {
    setQueue((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const moveQueueItem = useCallback((fromIndex: number, toIndex: number) => {
    setQueue((prev) => {
      if (fromIndex < 0 || fromIndex >= prev.length || toIndex < 0 || toIndex >= prev.length) {
        return prev;
      }
      const nextQueue = [...prev];
      const [item] = nextQueue.splice(fromIndex, 1);
      nextQueue.splice(toIndex, 0, item);
      return nextQueue;
    });
  }, []);

  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  const createPlaylist = useCallback((name: string, description?: string) => {
    const newPl: Playlist = {
      id: Date.now().toString(),
      name,
      description,
      track_ids: [],
      createdAt: Date.now(),
    };
    setPlaylists((prev) => [...prev, newPl]);
  }, []);

  const deletePlaylist = useCallback((id: string) => {
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const addTrackToPlaylist = useCallback((playlistId: string, trackId: string) => {
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id === playlistId) {
          if (!pl.track_ids.includes(trackId)) {
            return { ...pl, track_ids: [...pl.track_ids, trackId] };
          }
        }
        return pl;
      })
    );
  }, []);

  const removeTrackFromPlaylist = useCallback((playlistId: string, trackId: string) => {
    setPlaylists((prev) =>
      prev.map((pl) => {
        if (pl.id === playlistId) {
          return { ...pl, track_ids: pl.track_ids.filter((id) => id !== trackId) };
        }
        return pl;
      })
    );
  }, []);

  const setPreset = useCallback((name: string) => {
    setEqualizerPreset(name);
    audioEngine.setPreset(name);
    const p = EQUALIZER_PRESETS.find((x) => x.name === name);
    if (p) {
      setCustomGains([...p.gains]);
    }
  }, []);

  const setCustomGain = useCallback((bandIndex: number, gain: number) => {
    setEqualizerPreset('Custom');
    setCustomGains((prev) => {
      const next = [...prev] as [number, number, number, number, number];
      next[bandIndex] = gain;
      audioEngine.setBandGain(bandIndex, gain);
      return next;
    });
  }, []);

  const saveLyricsHandler = useCallback(async (track: Track, lrcContent: string) => {
    try {
      await invoke('save_track_lyrics', { filePath: track.file_path, lyricsContent: lrcContent });
      const parsed = parseLrcLyrics(lrcContent);
      setCurrentLyrics(parsed);
      showToast('Lyrics Saved', track.title);
    } catch (e) {
      console.error('Failed to save lyrics:', e);
    }
  }, [showToast]);

  const openInExplorer = useCallback(async (filePath: string) => {
    try {
      await invoke('open_in_explorer', { filePath });
    } catch (e) {
      console.error('Failed to open file in explorer:', e);
    }
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'ArrowLeft' && !e.ctrlKey) {
        e.preventDefault();
        seekTo(Math.max(0, currentTimeRef.current - 5));
      } else if (e.code === 'ArrowRight' && !e.ctrlKey) {
        e.preventDefault();
        seekTo(Math.min(durationRef.current, currentTimeRef.current + 5));
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        setVolumeLevel(Math.min(1, volumeRef.current + 0.05));
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        setVolumeLevel(Math.max(0, volumeRef.current - 0.05));
      } else if (e.ctrlKey && e.code === 'ArrowLeft') {
        e.preventDefault();
        handlePrevTrack();
      } else if (e.ctrlKey && e.code === 'ArrowRight') {
        e.preventDefault();
        handleNextTrack();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        toggleMute();
      } else if (e.code === 'KeyL' && currentTrackRef.current) {
        e.preventDefault();
        toggleLike(currentTrackRef.current.id);
      } else if (e.ctrlKey && e.code === 'KeyB') {
        e.preventDefault();
        window.dispatchEvent(new Event('toggle-sidebar'));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNextTrack, handlePrevTrack, seekTo, setVolumeLevel, toggleLike, toggleMute, togglePlay]);

  return (
    <PlayerContext.Provider
      value={{
        tracks,
        currentTrack,
        isPlaying,
        currentTime,
        duration,
        volume,
        isMuted,
        shuffle,
        repeatMode,
        queue,
        likedTrackIds,
        playlists,
        equalizerPreset,
        customGains,
        currentLyrics,
        isLoadingLyrics,
        activeLyricIndex,
        toast,
        searchQuery,
        setSearchQuery,
        playTrack,
        togglePlay,
        nextTrack: handleNextTrack,
        prevTrack: handlePrevTrack,
        seekTo,
        setVolumeLevel,
        toggleMute,
        toggleShuffle,
        cycleRepeat,
        toggleLike,
        addToQueue,
        removeFromQueue,
        moveQueueItem,
        clearQueue,
        createPlaylist,
        deletePlaylist,
        addTrackToPlaylist,
        removeTrackFromPlaylist,
        setPreset,
        setCustomGain,
        refreshLibrary,
        saveLyrics: saveLyricsHandler,
        openInExplorer,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within PlayerProvider');
  }
  return context;
};
