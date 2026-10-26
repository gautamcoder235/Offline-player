import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize, PhysicalSize } from '@tauri-apps/api/dpi';
import { Track, RepeatMode, Playlist, ParsedLyrics, ThemeAppearance } from '../types';

import { audioEngine, EQUALIZER_PRESETS } from '../services/audioEngine';
import { parseLrcLyrics } from '../utils/helpers';
import { generateM3U8, parseM3U8, downloadBlob } from '../utils/m3u';
import {
  PlayEvent,
  TrackListeningStats,
  TopTracksTimeRange,
  rankTopTracks,
  pruneEvents,
} from '../utils/affinityEngine';

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
  contextTracks: Track[];
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
  playTrack: (track: Track, newQueue?: Track[], sourcePlaylistId?: string | null) => Promise<void>;
  playQueueTrack: (index: number) => Promise<void>;
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
  createPlaylist: (name: string, description?: string, initialTrackIds?: string[], coverColor?: string) => Playlist;
  updatePlaylist: (id: string, updates: Partial<Pick<Playlist, 'name' | 'description' | 'coverColor' | 'cover_art'>>) => void;
  deletePlaylist: (id: string) => void;
  addTrackToPlaylist: (playlistId: string, trackId: string) => void;
  addTracksToPlaylist: (playlistId: string, trackIds: string[]) => void;
  addTracksToQueue: (tracks: Track[]) => void;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  removeTracksFromPlaylist: (playlistId: string, trackIds: string[]) => void;
  setPreset: (name: string) => void;
  setCustomGain: (bandIndex: number, gain: number) => void;
  refreshLibrary: (directories?: string[]) => Promise<void>;
  saveLyrics: (track: Track, lrcContent: string) => Promise<void>;
  openInExplorer: (filePath: string) => Promise<void>;
  deleteTrack: (track: Track, deleteFileFromDisk?: boolean) => Promise<void>;
  getPlayCount: (trackId: string) => number;
  topTracks: Array<Track & { stats?: TrackListeningStats }>;
  topTracksTimeRange: TopTracksTimeRange;
  setTopTracksTimeRange: (range: TopTracksTimeRange) => void;
  getTrackStats: (trackId: string) => TrackListeningStats | undefined;
  playingPlaylistId: string | null;
  setPlayingPlaylistId: (id: string | null) => void;
  exportPlaylistM3U: (playlistId: string) => void;
  importPlaylistM3U: (file: File) => Promise<{ playlistName: string; totalInFile: number; matchedCount: number }>;
  crossfadeDuration: number;
  setCrossfadeDuration: (sec: number) => void;
  isMiniPlayer: boolean;
  toggleMiniPlayer: () => Promise<void>;
  isAlwaysOnTop: boolean;
  toggleAlwaysOnTop: () => Promise<void>;
  themeAppearance: ThemeAppearance;
  setThemeAppearance: (appearance: ThemeAppearance) => void;
  sleepTimerMinutes: number | null;
  sleepTimerRemainingSec: number | null;
  setSleepTimer: (minutes: number | null) => void;
  reorderQueue: (newQueue: Track[]) => void;
  updateTrackMetadata: (updated: Track) => void;
  addDroppedTracks: (newTracks: Track[]) => void;
}

const PlayerContext = createContext<PlayerContextType | null>(null);

const loadSavedLastPlayed = (): {
  trackId: string;
  track: Track;
  currentTime: number;
  duration: number;
} | null => {
  try {
    const saved = localStorage.getItem('offline_player_last_played');
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    if (parsed && parsed.track && typeof parsed.track.id === 'string') {
      return {
        trackId: parsed.trackId || parsed.track.id,
        track: parsed.track,
        currentTime: typeof parsed.currentTime === 'number' ? parsed.currentTime : 0,
        duration: typeof parsed.duration === 'number' ? parsed.duration : (parsed.track.duration || 0),
      };
    }
    return null;
  } catch {
    return null;
  }
};

export const PlayerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Restore last-played track metadata and playback position from localStorage
  const [savedLastPlayed] = useState(loadSavedLastPlayed);

  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(() => savedLastPlayed?.track || null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(() => savedLastPlayed?.currentTime || 0);
  const [duration, setDuration] = useState<number>(() => savedLastPlayed?.duration || savedLastPlayed?.track?.duration || 0);
  const [volume, setVolume] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('offline_player_volume');
      return saved ? parseFloat(saved) : 0.8;
    } catch {
      return 0.8;
    }
  });
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [shuffle, setShuffle] = useState<boolean>(() => {
    try {
      return localStorage.getItem('offline_player_shuffle') === 'true';
    } catch {
      return false;
    }
  });
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(() => {
    try {
      const saved = localStorage.getItem('offline_player_repeat');
      return (saved as RepeatMode) || 'off';
    } catch {
      return 'off';
    }
  });
  const [queue, setQueue] = useState<Track[]>([]);
  const [contextTracks, setContextTracks] = useState<Track[]>([]);
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

  const [playCounts, setPlayCounts] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('offline_player_play_counts');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [playEvents, setPlayEvents] = useState<PlayEvent[]>(() => {
    try {
      const saved = localStorage.getItem('offline_player_play_events');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [topTracksTimeRange, setTopTracksTimeRangeState] = useState<TopTracksTimeRange>(() => {
    try {
      const saved = localStorage.getItem('offline_player_top_time_range');
      if (saved === 'short_term' || saved === 'medium_term' || saved === 'all_time') {
        return saved;
      }
      return 'all_time';
    } catch {
      return 'all_time';
    }
  });

  const setTopTracksTimeRange = useCallback((range: TopTracksTimeRange) => {
    setTopTracksTimeRangeState(range);
    try {
      localStorage.setItem('offline_player_top_time_range', range);
    } catch {
      // ignore
    }
  }, []);

  // Real-time listening session tracking refs
  const activeListeningSessionRef = useRef<{
    trackId: string;
    trackDuration: number;
    startTime: number;
    accumulatedSeconds: number;
    lastTick: number;
    wasReplay: boolean;
  } | null>(null);

  const recentReplayHistoryRef = useRef<Array<{ trackId: string; timestamp: number }>>([]);

  const finalizeListeningSession = useCallback((completed: boolean = false) => {
    const session = activeListeningSessionRef.current;
    if (!session) return;
    activeListeningSessionRef.current = null;

    const dur = Math.round(session.accumulatedSeconds);
    if (dur < 5) return; // Discard rapid clicks / immediate skips (< 5s)

    const isFullyCompleted = completed || (session.trackDuration > 0 && dur / session.trackDuration >= 0.8);

    const newEvent: PlayEvent = {
      id: `${session.trackId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      trackId: session.trackId,
      timestamp: Date.now(),
      durationPlayed: dur,
      trackDuration: session.trackDuration,
      completed: isFullyCompleted,
      wasReplay: session.wasReplay,
    };

    setPlayEvents((prev) => {
      const next = pruneEvents([...prev, newEvent]);
      try {
        localStorage.setItem('offline_player_play_events', JSON.stringify(next));
      } catch (e) {
        console.warn('Failed to save play events:', e);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      finalizeListeningSession(false);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [finalizeListeningSession]);

  const [playingPlaylistId, setPlayingPlaylistId] = useState<string | null>(() => {
    try {
      return localStorage.getItem('offline_player_playing_playlist') || null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    try {
      if (playingPlaylistId) {
        localStorage.setItem('offline_player_playing_playlist', playingPlaylistId);
      } else {
        localStorage.removeItem('offline_player_playing_playlist');
      }
    } catch {
      // ignore
    }
  }, [playingPlaylistId]);

  const getPlayCount = useCallback((trackId: string) => {
    return playCounts[trackId] || 0;
  }, [playCounts]);

  const topTracks = React.useMemo(() => {
    return rankTopTracks(
      tracks,
      playEvents,
      likedTrackIds,
      playlists,
      topTracksTimeRange,
      playCounts
    );
  }, [tracks, playEvents, likedTrackIds, playlists, topTracksTimeRange, playCounts]);

  const getTrackStats = useCallback(
    (trackId: string) => {
      const item = topTracks.find((t) => t.id === trackId);
      return item?.stats;
    },
    [topTracks]
  );

  const exportPlaylistM3U = useCallback((playlistId: string) => {
    const pl = playlists.find(p => p.id === playlistId);
    if (!pl) return;
    const plTracks = pl.track_ids.map(id => tracks.find(t => t.id === id)).filter(Boolean) as Track[];
    const content = generateM3U8(pl.name, plTracks);
    downloadBlob(`${pl.name}.m3u8`, content, 'audio/x-mpegurl');
  }, [playlists, tracks]);

  const importPlaylistM3U = useCallback(async (file: File) => {
    return new Promise<{ playlistName: string; totalInFile: number; matchedCount: number }>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const parsed = parseM3U8(content);
        const name = parsed.name || file.name.replace(/\.m3u8?$/i, '');
        const matchedIds: string[] = [];
        
        for (const entry of parsed.entries) {
          const match = tracks.find(t => 
            t.file_path === entry.path || 
            `${t.artist} - ${t.title}` === `${entry.artist} - ${entry.title}` ||
            (t.title === entry.title && t.artist === entry.artist)
          );
          if (match && !matchedIds.includes(match.id)) {
            matchedIds.push(match.id);
          }
        }
        
        if (matchedIds.length > 0) {
          const newPl: Playlist = {
            id: Date.now().toString(),
            name,
            track_ids: matchedIds,
            createdAt: Date.now()
          };
          setPlaylists(prev => [...prev, newPl]);
          // showToast is called below via state update logic, or we can just call it here if we want
        }
        resolve({ playlistName: name, totalInFile: parsed.entries.length, matchedCount: matchedIds.length });
      };
      reader.readAsText(file);
    });
  }, [tracks]);

  const [equalizerPreset, setEqualizerPreset] = useState<string>(() => {
    try {
      return localStorage.getItem('offline_player_eq_preset') || 'Flat';
    } catch {
      return 'Flat';
    }
  });

  const [customGains, setCustomGains] = useState<[number, number, number, number, number]>(() => {
    try {
      const saved = localStorage.getItem('offline_player_custom_gains');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 5) {
          return parsed as [number, number, number, number, number];
        }
      }
      const presetName = localStorage.getItem('offline_player_eq_preset') || 'Flat';
      const preset = EQUALIZER_PRESETS.find((p) => p.name.toLowerCase() === presetName.toLowerCase());
      return preset ? [...preset.gains] : [0, 0, 0, 0, 0];
    } catch {
      return [0, 0, 0, 0, 0];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('offline_player_eq_preset', equalizerPreset);
    } catch {}
  }, [equalizerPreset]);

  useEffect(() => {
    try {
      localStorage.setItem('offline_player_custom_gains', JSON.stringify(customGains));
    } catch {}
  }, [customGains]);

  useEffect(() => {
    if (equalizerPreset === 'Custom') {
      audioEngine.setGains(customGains);
    } else {
      audioEngine.setPreset(equalizerPreset);
    }

    try {
      const savedSink = localStorage.getItem('offline_player_audio_sink_id');
      if (savedSink) {
        audioEngine.setSinkId(savedSink).catch(() => {});
      }
    } catch {}
  }, []);

  // Bedtime Sleep Timer state & countdown (Task 3.4)
  const [sleepTimerMinutes, setSleepTimerMinutes] = useState<number | null>(null);
  const [sleepTimerRemainingSec, setSleepTimerRemainingSec] = useState<number | null>(null);
  const sleepTimerRemainingSecRef = useRef<number | null>(null);
  sleepTimerRemainingSecRef.current = sleepTimerRemainingSec;
  const isSleepFadingRef = useRef(false);

  const setSleepTimer = useCallback((minutes: number | null) => {
    setSleepTimerMinutes(minutes);
    isSleepFadingRef.current = false;
    if (minutes === null) {
      setSleepTimerRemainingSec(null);
    } else if (minutes === -1) {
      const rem = Math.max(0, Math.round(durationRef.current - currentTimeRef.current));
      setSleepTimerRemainingSec(rem);
    } else {
      setSleepTimerRemainingSec(minutes * 60);
    }
  }, []);

  const [currentLyrics, setCurrentLyrics] = useState<ParsedLyrics | null>(null);
  const [isLoadingLyrics, setIsLoadingLyrics] = useState<boolean>(false);
  const [activeLyricIndex, setActiveLyricIndex] = useState<number>(-1);
  const [toast, setToast] = useState<ToastInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Crossfade settings (0 = Off, 1-12 seconds)
  const [crossfadeDuration, setCrossfadeDurationState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('offline_player_crossfade_duration');
      return saved ? Math.max(0, Math.min(12, parseInt(saved, 10))) : 0;
    } catch {
      return 0;
    }
  });
  const crossfadeDurationRef = useRef(crossfadeDuration);
  crossfadeDurationRef.current = crossfadeDuration;
  const isCrossfadingRef = useRef(false);

  const setCrossfadeDuration = useCallback((sec: number) => {
    const clamped = Math.max(0, Math.min(12, Math.round(sec)));
    setCrossfadeDurationState(clamped);
    crossfadeDurationRef.current = clamped;
    audioEngine.setCrossfadeDuration(clamped);
    localStorage.setItem('offline_player_crossfade_duration', clamped.toString());
  }, []);

  // Theme & Background Appearance: 'default' (Classic Obsidian) vs 'aura_glass' (Transparent Panels)
  const [themeAppearance, setThemeAppearanceState] = useState<ThemeAppearance>(() => {
    try {
      const saved = localStorage.getItem('offline_player_theme_appearance');
      return (saved === 'default' || saved === 'aura_glass') ? saved : 'aura_glass';
    } catch {
      return 'aura_glass';
    }
  });

  const setThemeAppearance = useCallback((appearance: ThemeAppearance) => {
    setThemeAppearanceState(appearance);
    try {
      localStorage.setItem('offline_player_theme_appearance', appearance);
    } catch (e) {
      console.warn('Failed to save theme appearance:', e);
    }
  }, []);

  // Always-On-Top Floating Mini-Player state
  const [isMiniPlayer, setIsMiniPlayer] = useState<boolean>(false);
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState<boolean>(false);
  const previousSizeRef = useRef<PhysicalSize | LogicalSize | null>(null);

  const toggleMiniPlayer = useCallback(async () => {
    try {
      const appWindow = getCurrentWindow();
      if (!isMiniPlayer) {
        // Entering Mini Player mode
        const wasMaximized = await appWindow.isMaximized();
        if (wasMaximized) {
          await appWindow.unmaximize();
        }
        const currentSize = await appWindow.innerSize();
        previousSizeRef.current = currentSize;

        // 1. Lower min size so window can shrink to fixed 400x250
        await appWindow.setMinSize(new LogicalSize(400, 250));
        await appWindow.setMaxSize(new LogicalSize(400, 250));

        // 2. Set exact fixed dimensions
        await appWindow.setSize(new LogicalSize(400, 250));

        // 3. Make mini player size fixed
        await appWindow.setResizable(false);

        // 4. Set always on top
        await appWindow.setAlwaysOnTop(true);
        setIsAlwaysOnTop(true);

        setIsMiniPlayer(true);
        if (typeof document !== 'undefined') {
          document.body.classList.add('mini-player-active');
        }
      } else {
        // Restoring Full Player
        await appWindow.setAlwaysOnTop(false);
        setIsAlwaysOnTop(false);

        // Remove max size constraint
        await appWindow.setMaxSize(null);

        // Restore minimum size of full app (1150 x 750)
        await appWindow.setMinSize(new LogicalSize(1150, 750));

        // Re-enable resizing
        await appWindow.setResizable(true);

        // Restore previous dimensions
        if (previousSizeRef.current) {
          await appWindow.setSize(previousSizeRef.current);
        } else {
          await appWindow.setSize(new LogicalSize(1280, 840));
        }

        setIsMiniPlayer(false);
        if (typeof document !== 'undefined') {
          document.body.classList.remove('mini-player-active');
        }
      }
    } catch (e) {
      console.warn('Failed to toggle mini player:', e);
      setIsMiniPlayer((prev) => !prev);
    }
  }, [isMiniPlayer]);

  const toggleAlwaysOnTop = useCallback(async () => {
    try {
      const appWindow = getCurrentWindow();
      const nextState = !isAlwaysOnTop;
      await appWindow.setAlwaysOnTop(nextState);
      setIsAlwaysOnTop(nextState);
    } catch (e) {
      console.warn('Failed to toggle always on top:', e);
    }
  }, [isAlwaysOnTop]);

  // Refs for audio engine callbacks to avoid stale closures
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const contextTracksRef = useRef(contextTracks);
  contextTracksRef.current = contextTracks;
  const lastContextIndexRef = useRef<number>(-1);
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
  const hasCountedCurrentPlayRef = useRef(false);

  const showToast = useCallback((title: string, subtitle: string, cover?: string | null) => {
    const id = Date.now().toString();
    setToast({ id, title, subtitle, cover });
    setTimeout(() => {
      setToast((prev) => (prev?.id === id ? null : prev));
    }, 4000);
  }, []);

  // Persist last played track and position
  const saveLastPlayed = useCallback((track: Track | null, time: number, dur: number) => {
    if (!track) return;
    try {
      localStorage.setItem(
        'offline_player_last_played',
        JSON.stringify({
          trackId: track.id,
          track,
          currentTime: Math.max(0, Math.round(time)),
          duration: dur || track.duration || 0,
        })
      );
    } catch (e) {
      console.warn('Failed to save last played:', e);
    }
  }, []);

  // Save liked & playlists to localStorage
  useEffect(() => {
    localStorage.setItem('offline_player_liked', JSON.stringify([...likedTrackIds]));
  }, [likedTrackIds]);

  useEffect(() => {
    localStorage.setItem('offline_player_playlists', JSON.stringify(playlists));
  }, [playlists]);

  useEffect(() => {
    localStorage.setItem('offline_player_volume', volume.toString());
  }, [volume]);

  useEffect(() => {
    localStorage.setItem('offline_player_shuffle', shuffle.toString());
  }, [shuffle]);

  useEffect(() => {
    localStorage.setItem('offline_player_repeat', repeatMode);
  }, [repeatMode]);

  // Set initial volume in audio engine
  useEffect(() => {
    audioEngine.setVolume(volumeRef.current);
  }, []);

  // Ensure last played position is saved if user closes or reloads the window
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (currentTrackRef.current) {
        saveLastPlayed(
          currentTrackRef.current,
          audioEngine.currentTime || currentTimeRef.current,
          durationRef.current
        );
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveLastPlayed]);

  // Load Initial Library from Tauri
  const refreshLibrary = useCallback(async (directories?: string[]) => {
    try {
      const scannedTracks = await invoke<Track[]>('scan_library', {
        directories: directories || null,
      });
      setTracks(scannedTracks);

      // If contextTracks is empty, populate with scanned tracks so user can use next/prev immediately
      if (scannedTracks.length > 0 && contextTracksRef.current.length === 0) {
        setContextTracks(scannedTracks);
      }

      // If current track was restored from localStorage, sync its metadata and stream_url with scanned library
      if (currentTrackRef.current) {
        const found = scannedTracks.find(
          (t) => t.id === currentTrackRef.current!.id || t.file_path === currentTrackRef.current!.file_path
        );
        if (found) {
          setCurrentTrack((prev) => (prev ? { ...prev, ...found } : found));
          if (found.duration && (!durationRef.current || durationRef.current === 0)) {
            setDuration(found.duration);
          }
        }
      }
    } catch (e) {
      console.error('Failed to scan library:', e);
    }
  }, []);

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  // Background cover art auto-fetcher for all offline tracks missing artwork
  useEffect(() => {
    if (tracks.length === 0) return;

    let isCancelled = false;

    const loadMissingCovers = async () => {
      // Find tracks that do not have cover art yet
      const missing = tracks.filter((t) => !t.cover_art);
      if (missing.length === 0) return;

      for (const t of missing) {
        if (isCancelled) break;
        try {
          const art = await invoke<string | null>('fetch_cover_art', {
            artist: t.artist,
            title: t.title,
          });
          if (art && !isCancelled) {
            setTracks((prev) =>
              prev.map((track) => (track.id === t.id ? { ...track, cover_art: art } : track))
            );
            if (currentTrackRef.current?.id === t.id) {
              const updated = { ...currentTrackRef.current, cover_art: art };
              setCurrentTrack(updated);
              saveLastPlayed(updated, currentTimeRef.current, durationRef.current);
            }
          }
        } catch {
          // ignore individual fetch errors
        }
        // Small delay to prevent network throttling
        await new Promise((r) => setTimeout(r, 120));
      }
    };

    loadMissingCovers();

    return () => {
      isCancelled = true;
    };
  }, [tracks.length, saveLastPlayed]);

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
        setTracks((prev) =>
          prev.map((t) => (t.id === track.id ? { ...t, lyrics: localResult.lyrics } : t))
        );
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
          setTracks((prev) =>
            prev.map((t) => (t.id === track.id ? { ...t, lyrics: lrcContent } : t))
          );
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

  // Pre-load lyrics on startup if last-played track is restored
  useEffect(() => {
    if (savedLastPlayed?.track) {
      fetchLyrics(savedLastPlayed.track);
    }
  }, [fetchLyrics, savedLastPlayed]);

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

  const playTrack = useCallback(
    async (track: Track, newContextTracks?: Track[], sourcePlaylistId?: string | null) => {
      if (sourcePlaylistId !== undefined) {
        setPlayingPlaylistId(sourcePlaylistId);
      }
      if (newContextTracks) {
        setContextTracks(newContextTracks);
        const idx = newContextTracks.findIndex((t) => t.id === track.id);
        if (idx !== -1) {
          lastContextIndexRef.current = idx;
        }
      } else {
        const idx = contextTracksRef.current.findIndex((t) => t.id === track.id);
        if (idx !== -1) {
          lastContextIndexRef.current = idx;
        }
      }

      let trackToPlay = track;
      // Fetch cover art if missing
      if (!track.cover_art) {
        try {
          const art = await invoke<string | null>('fetch_cover_art', { artist: track.artist, title: track.title });
          if (art) {
            trackToPlay = { ...track, cover_art: art };
            setTracks((prev) => prev.map((t) => (t.id === track.id ? { ...t, cover_art: art } : t)));
            saveLastPlayed(trackToPlay, 0, trackToPlay.duration || 0);
          }
        } catch (e) {
          console.warn('Cover art fetch failed:', e);
        }
      }

      setCurrentTrack(trackToPlay);
      setDuration(trackToPlay.duration || 0);
      setCurrentTime(0);
      hasCountedCurrentPlayRef.current = false;
      saveLastPlayed(trackToPlay, 0, trackToPlay.duration || 0);

      finalizeListeningSession(false);

      const recent = recentReplayHistoryRef.current;
      const lastPlay = recent[recent.length - 1];
      const wasReplay = Boolean(
        lastPlay && lastPlay.trackId === trackToPlay.id && Date.now() - lastPlay.timestamp < 15 * 60 * 1000
      );
      recent.push({ trackId: trackToPlay.id, timestamp: Date.now() });
      if (recent.length > 25) recent.shift();

      activeListeningSessionRef.current = {
        trackId: trackToPlay.id,
        trackDuration: trackToPlay.duration || 0,
        startTime: Date.now(),
        accumulatedSeconds: 0,
        lastTick: Date.now(),
        wasReplay,
      };

      showToast(trackToPlay.title, trackToPlay.artist, trackToPlay.cover_art);
      fetchLyrics(trackToPlay);

      if (trackToPlay.replay_gain !== null && trackToPlay.replay_gain !== undefined) {
        audioEngine.setPreGain(trackToPlay.replay_gain);
      } else {
        audioEngine.resetPreGain();
      }

      try {
        await audioEngine.loadTrack(trackToPlay.stream_url);
        await audioEngine.play();
        setIsPlaying(true);
        if (crossfadeDurationRef.current > 0) {
          audioEngine.fadeIn(volumeRef.current, Math.min(2.5, crossfadeDurationRef.current));
        }
      } catch (e) {
        console.error('Failed to play track:', e);
      }
    },
    [fetchLyrics, saveLastPlayed, showToast]
  );

  const transitionToTrack = useCallback(
    async (track: Track) => {
      let trackToPlay = track;
      if (!track.cover_art) {
        try {
          const art = await invoke<string | null>('fetch_cover_art', { artist: track.artist, title: track.title });
          if (art) {
            trackToPlay = { ...track, cover_art: art };
            setTracks((prev) => prev.map((t) => (t.id === track.id ? { ...t, cover_art: art } : t)));
            saveLastPlayed(trackToPlay, 0, trackToPlay.duration || 0);
          }
        } catch {
          // ignore
        }
      }

      setCurrentTrack(trackToPlay);
      setDuration(trackToPlay.duration || 0);
      setCurrentTime(0);
      hasCountedCurrentPlayRef.current = false;
      saveLastPlayed(trackToPlay, 0, trackToPlay.duration || 0);

      finalizeListeningSession(false);

      const recent = recentReplayHistoryRef.current;
      const lastPlay = recent[recent.length - 1];
      const wasReplay = Boolean(
        lastPlay && lastPlay.trackId === trackToPlay.id && Date.now() - lastPlay.timestamp < 15 * 60 * 1000
      );
      recent.push({ trackId: trackToPlay.id, timestamp: Date.now() });
      if (recent.length > 25) recent.shift();

      activeListeningSessionRef.current = {
        trackId: trackToPlay.id,
        trackDuration: trackToPlay.duration || 0,
        startTime: Date.now(),
        accumulatedSeconds: 0,
        lastTick: Date.now(),
        wasReplay,
      };

      showToast(trackToPlay.title, trackToPlay.artist, trackToPlay.cover_art);
      fetchLyrics(trackToPlay);

      if (trackToPlay.replay_gain !== null && trackToPlay.replay_gain !== undefined) {
        audioEngine.setPreGain(trackToPlay.replay_gain);
      } else {
        audioEngine.resetPreGain();
      }

      await audioEngine.transitionTo(trackToPlay.stream_url, crossfadeDurationRef.current);
      setIsPlaying(true);
    },
    [fetchLyrics, saveLastPlayed, showToast]
  );

  const playQueueTrack = useCallback(
    async (index: number) => {
      const q = queueRef.current;
      if (index >= 0 && index < q.length) {
        const track = q[index];
        setQueue((prev) => prev.filter((_, i) => i !== index));
        await playTrack(track);
      }
    },
    [playTrack]
  );

  // Next Track Logic: User Queue first, then context playlist with dual-deck crossfade support
  const handleNextTrack = useCallback((isCrossfadeTransition: boolean = false) => {
    // 1. First priority: Play from user explicit queue
    const q = queueRef.current;
    if (q.length > 0) {
      const [nextTrack, ...remaining] = q;
      setQueue(remaining);
      if (isCrossfadeTransition && crossfadeDurationRef.current > 0) {
        transitionToTrack(nextTrack);
      } else {
        playTrack(nextTrack);
      }
      return;
    }

    // 2. Play next track from context tracks (or all library tracks)
    let playlist = contextTracksRef.current.length > 0 ? contextTracksRef.current : tracksRef.current;
    if (playlist.length === 0) return;

    if (shuffleRef.current && playlist.length > 1) {
      const curId = currentTrackRef.current?.id;
      let randIdx = Math.floor(Math.random() * playlist.length);
      while (playlist[randIdx].id === curId && playlist.length > 1) {
        randIdx = Math.floor(Math.random() * playlist.length);
      }
      if (isCrossfadeTransition && crossfadeDurationRef.current > 0) {
        transitionToTrack(playlist[randIdx]);
      } else {
        playTrack(playlist[randIdx]);
      }
      return;
    }

    const curId = currentTrackRef.current?.id;
    let currentIndex = curId ? playlist.findIndex((t) => t.id === curId) : -1;
    if (currentIndex === -1) {
      currentIndex = lastContextIndexRef.current;
    }

    if (currentIndex !== -1 && currentIndex + 1 < playlist.length) {
      if (isCrossfadeTransition && crossfadeDurationRef.current > 0) {
        transitionToTrack(playlist[currentIndex + 1]);
      } else {
        playTrack(playlist[currentIndex + 1]);
      }
    } else if (repeatModeRef.current === 'all' && playlist.length > 0) {
      if (isCrossfadeTransition && crossfadeDurationRef.current > 0) {
        transitionToTrack(playlist[0]);
      } else {
        playTrack(playlist[0]);
      }
    } else {
      setIsPlaying(false);
    }
  }, [playTrack, transitionToTrack]);

  const handlePrevTrack = useCallback(() => {
    if (currentTimeRef.current > 3) {
      audioEngine.seek(0);
      setCurrentTime(0);
      if (currentTrackRef.current) {
        saveLastPlayed(currentTrackRef.current, 0, durationRef.current);
      }
      return;
    }
    let playlist = contextTracksRef.current.length > 0 ? contextTracksRef.current : tracksRef.current;
    if (playlist.length === 0) return;

    const curId = currentTrackRef.current?.id;
    let currentIndex = curId ? playlist.findIndex((t) => t.id === curId) : -1;
    if (currentIndex === -1) {
      currentIndex = lastContextIndexRef.current;
    }

    if (currentIndex > 0) {
      playTrack(playlist[currentIndex - 1]);
    } else if (playlist.length > 0) {
      playTrack(playlist[playlist.length - 1]);
    }
  }, [playTrack, saveLastPlayed]);

  // Audio Engine Hookups
  useEffect(() => {
    let lastTime = 0;
    let lastPersistTime = 0;
    audioEngine.onTimeUpdate = (cTime, dur) => {
      const now = performance.now();
      if (now - lastTime >= 250 || cTime === 0) {
        lastTime = now;
        setCurrentTime(cTime);
        if (dur > 0) setDuration(dur);
      }
      if (now - lastPersistTime >= 1500) {
        lastPersistTime = now;
        if (currentTrackRef.current) {
          saveLastPlayed(currentTrackRef.current, cTime, dur || durationRef.current);
        }
      }

      const realDur = dur || durationRef.current;

      // Update listening session dwell time
      const session = activeListeningSessionRef.current;
      if (session) {
        const timeNow = Date.now();
        const delta = (timeNow - session.lastTick) / 1000;
        if (delta > 0 && delta < 5) {
          session.accumulatedSeconds += delta;
        }
        session.lastTick = timeNow;
        if (realDur > 0 && !session.trackDuration) {
          session.trackDuration = realDur;
        }
      }

      // Overlapping dual-deck crossfade trigger
      const xfade = crossfadeDurationRef.current;
      if (
        xfade > 0 &&
        realDur > 12 &&
        cTime >= realDur - xfade &&
        !isCrossfadingRef.current &&
        isPlayingRef.current &&
        repeatModeRef.current !== 'one'
      ) {
        isCrossfadingRef.current = true;
        handleNextTrack(true);
        setTimeout(() => {
          isCrossfadingRef.current = false;
        }, (xfade + 1) * 1000);
      }

      if (realDur > 0 && cTime >= Math.min(30, realDur * 0.5)) {
        if (!hasCountedCurrentPlayRef.current && currentTrackRef.current) {
          hasCountedCurrentPlayRef.current = true;
          setPlayCounts((prev) => {
            const track = currentTrackRef.current!;
            const next = { ...prev };
            const fallbackKey = `${track.artist} - ${track.title}`;
            next[track.id] = (next[track.id] || next[fallbackKey] || 0) + 1;
            localStorage.setItem('offline_player_play_counts', JSON.stringify(next));
            return next;
          });
        }
      }
    };

    audioEngine.onPlay = () => {
      setIsPlaying(true);
      if (activeListeningSessionRef.current) {
        activeListeningSessionRef.current.lastTick = Date.now();
      }
    };
    audioEngine.onPause = () => {
      setIsPlaying(false);
      if (activeListeningSessionRef.current) {
        const timeNow = Date.now();
        const delta = (timeNow - activeListeningSessionRef.current.lastTick) / 1000;
        if (delta > 0 && delta < 5) {
          activeListeningSessionRef.current.accumulatedSeconds += delta;
        }
        activeListeningSessionRef.current.lastTick = timeNow;
      }
      if (currentTrackRef.current) {
        saveLastPlayed(currentTrackRef.current, currentTimeRef.current, durationRef.current);
      }
    };

    audioEngine.onEnded = () => {
      finalizeListeningSession(true);
      if (!hasCountedCurrentPlayRef.current && currentTrackRef.current) {
        hasCountedCurrentPlayRef.current = true;
        setPlayCounts((prev) => {
          const track = currentTrackRef.current!;
          const next = { ...prev };
          const fallbackKey = `${track.artist} - ${track.title}`;
          next[track.id] = (next[track.id] || next[fallbackKey] || 0) + 1;
          localStorage.setItem('offline_player_play_counts', JSON.stringify(next));
          return next;
        });
      }
      if (currentTrackRef.current) {
        saveLastPlayed(currentTrackRef.current, 0, durationRef.current);
      }
      const mode = repeatModeRef.current;
      if (mode === 'one') {
        audioEngine.seek(0);
        audioEngine.play();
      } else {
        if (!isCrossfadingRef.current) {
          handleNextTrack(false);
        }
      }
    };
  }, [handleNextTrack, saveLastPlayed]);

  const togglePlay = useCallback(async () => {
    const track = currentTrackRef.current;
    if (!track) {
      const allTracks = tracksRef.current;
      if (allTracks.length > 0) {
        await playTrack(allTracks[0], allTracks);
      }
      return;
    }

    const currentlyPlaying = isPlayingRef.current || !audioEngine.isPaused();

    if (currentlyPlaying) {
      audioEngine.pause();
      setIsPlaying(false);
      saveLastPlayed(track, currentTimeRef.current, durationRef.current);
    } else {
      // Audio might not be loaded yet into HTMLAudioElement if freshly restored from previous session
      const currentSrc = audioEngine.getCurrentSrc();
      const needsLoad = !currentSrc || (audioEngine.isPaused() && currentSrc === '');

      if (needsLoad) {
        try {
          let streamUrl = track.stream_url;
          // Refresh URL from backend in case the streaming port changed after app restart
          if (track.file_path) {
            try {
              const freshUrl = await invoke<string>('get_audio_url', { filePath: track.file_path });
              if (freshUrl) {
                streamUrl = freshUrl;
                setCurrentTrack((prev) => (prev ? { ...prev, stream_url: freshUrl } : prev));
              }
            } catch {
              // fallback to existing stream_url
            }
          }
          await audioEngine.loadTrack(streamUrl);
          if (currentTimeRef.current > 0) {
            audioEngine.seek(currentTimeRef.current);
          }
          await audioEngine.play();
          setIsPlaying(true);
          return;
        } catch (e) {
          console.error('Failed to resume track playback:', e);
        }
      }

      await audioEngine.play();
      setIsPlaying(true);
    }
  }, [playTrack, saveLastPlayed]);


  // Sync playlists with Taskbar / System Tray context menu
  useEffect(() => {
    invoke('update_tray_playlists', {
      playlists: playlists.map((p) => ({ id: p.id, name: p.name })),
    }).catch(console.warn);
  }, [playlists]);

  // Sync playback state with Windows Taskbar Thumbnail Toolbar
  useEffect(() => {
    invoke('update_taskbar_playback_state', { isPlaying }).catch(console.warn);
  }, [isPlaying]);

  // Sync window title with current playing track for Taskbar hover preview
  useEffect(() => {
    try {
      const appWindow = getCurrentWindow();
      if (currentTrack) {
        appWindow.setTitle(`${currentTrack.title} • ${currentTrack.artist} — MusicVault`);
      } else {
        appWindow.setTitle('MusicVault');
      }
    } catch (e) {
      console.warn('Failed to set window title:', e);
    }
  }, [currentTrack]);

  // MediaSession API integration for Windows SMTC and Hardware Media Keys
  useEffect(() => {
    if ('mediaSession' in navigator) {
      if (currentTrack) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.title,
          artist: currentTrack.artist,
          album: currentTrack.album || 'Offline Library',
          artwork: currentTrack.cover_art
            ? [{ src: currentTrack.cover_art, sizes: '512x512', type: 'image/jpeg' }]
            : [],
        });
      } else {
        navigator.mediaSession.metadata = null;
      }
    }
  }, [currentTrack]);

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  }, [isPlaying]);

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.setActionHandler('play', () => togglePlay());
      navigator.mediaSession.setActionHandler('pause', () => togglePlay());
      navigator.mediaSession.setActionHandler('previoustrack', () => handlePrevTrack());
      navigator.mediaSession.setActionHandler('nexttrack', () => handleNextTrack());
    }
  }, [togglePlay, handlePrevTrack, handleNextTrack]);

  const seekTo = useCallback((time: number) => {
    audioEngine.seek(time);
    setCurrentTime(time);
    if (currentTrackRef.current) {
      saveLastPlayed(currentTrackRef.current, time, durationRef.current);
      invoke('update_discord_status', {
        title: currentTrackRef.current.title,
        artist: currentTrackRef.current.artist,
        album: currentTrackRef.current.album || 'Unknown Album',
        isPlaying: isPlayingRef.current,
        duration: durationRef.current || currentTrackRef.current.duration || 0,
        position: time,
      }).catch(() => {});
    }
  }, [saveLastPlayed]);

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

  const togglePlayRef = useRef(togglePlay);
  togglePlayRef.current = togglePlay;
  const handleNextTrackRef = useRef(handleNextTrack);
  handleNextTrackRef.current = handleNextTrack;
  const handlePrevTrackRef = useRef(handlePrevTrack);
  handlePrevTrackRef.current = handlePrevTrack;
  const toggleShuffleRef = useRef(toggleShuffle);
  toggleShuffleRef.current = toggleShuffle;
  const cycleRepeatRef = useRef(cycleRepeat);
  cycleRepeatRef.current = cycleRepeat;

  // Tray & Taskbar Event Listeners - registered once on mount with stable listener callbacks
  useEffect(() => {
    let unlistenPlayPause: (() => void) | undefined;
    let unlistenNext: (() => void) | undefined;
    let unlistenPrev: (() => void) | undefined;
    let unlistenShuffle: (() => void) | undefined;
    let unlistenRepeat: (() => void) | undefined;
    let isMounted = true;

    const setupTrayListeners = async () => {
      const u1 = await listen('tray://play-pause', () => togglePlayRef.current());
      const u2 = await listen('tray://next', () => handleNextTrackRef.current());
      const u3 = await listen('tray://prev', () => handlePrevTrackRef.current());
      const u4 = await listen('tray://shuffle', () => toggleShuffleRef.current());
      const u5 = await listen('tray://repeat', () => cycleRepeatRef.current());

      if (!isMounted) {
        u1();
        u2();
        u3();
        u4();
        u5();
      } else {
        unlistenPlayPause = u1;
        unlistenNext = u2;
        unlistenPrev = u3;
        unlistenShuffle = u4;
        unlistenRepeat = u5;
      }
    };

    setupTrayListeners();

    return () => {
      isMounted = false;
      if (unlistenPlayPause) unlistenPlayPause();
      if (unlistenNext) unlistenNext();
      if (unlistenPrev) unlistenPrev();
      if (unlistenShuffle) unlistenShuffle();
      if (unlistenRepeat) unlistenRepeat();
    };
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

  const stampQueueTrack = (track: Track): Track => ({
    ...track,
    queueId: track.queueId || `${track.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  });

  const addToQueue = useCallback((track: Track) => {
    const stamped = stampQueueTrack(track);
    setQueue((prev) => [...prev, stamped]);
    showToast('Added to Queue', track.title, track.cover_art);
  }, [showToast]);

  const addTracksToQueue = useCallback((tracksToAdd: Track[]) => {
    if (!tracksToAdd || tracksToAdd.length === 0) return;
    const stamped = tracksToAdd.map(stampQueueTrack);
    setQueue((prev) => [...prev, ...stamped]);
    showToast(
      'Added to Queue',
      `${tracksToAdd.length} song${tracksToAdd.length > 1 ? 's' : ''} added to queue`
    );
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

  const createPlaylist = useCallback((name: string, description?: string, initialTrackIds?: string[], coverColor?: string): Playlist => {
    const newPl: Playlist = {
      id: Date.now().toString(),
      name,
      description,
      track_ids: initialTrackIds || [],
      createdAt: Date.now(),
      coverColor,
    };
    setPlaylists((prev) => [...prev, newPl]);
    showToast('Playlist Created', name);
    return newPl;
  }, [showToast]);

  const updatePlaylist = useCallback(
    (
      id: string,
      updates: Partial<Pick<Playlist, 'name' | 'description' | 'coverColor' | 'cover_art'>>
    ) => {
      setPlaylists((prev) =>
        prev.map((pl) => {
          if (pl.id === id) {
            return { ...pl, ...updates };
          }
          return pl;
        })
      );
      showToast('Playlist Updated', updates.name || 'Changes saved');
    },
    [showToast]
  );

  const deletePlaylist = useCallback((id: string) => {
    setPlayingPlaylistId((cur) => (cur === id ? null : cur));
    setPlaylists((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) {
        showToast('Playlist Deleted', target.name);
      }
      return prev.filter((p) => p.id !== id);
    });
  }, [showToast]);

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

  const addTracksToPlaylist = useCallback(
    (playlistId: string, trackIds: string[]) => {
      if (!trackIds || trackIds.length === 0) return;
      const targetPl = playlists.find((p) => p.id === playlistId);
      const plName = targetPl?.name || 'Playlist';
      const existingSet = new Set(targetPl?.track_ids || []);
      const toAdd = trackIds.filter((id) => !existingSet.has(id));

      if (toAdd.length > 0) {
        setPlaylists((prev) =>
          prev.map((pl) => {
            if (pl.id === playlistId) {
              const curSet = new Set(pl.track_ids);
              const trulyNew = toAdd.filter((id) => !curSet.has(id));
              return trulyNew.length > 0 ? { ...pl, track_ids: [...pl.track_ids, ...trulyNew] } : pl;
            }
            return pl;
          })
        );
        showToast(
          'Added to Playlist',
          `Added ${toAdd.length} song${toAdd.length > 1 ? 's' : ''} to ${plName}`
        );
      } else {
        showToast('Already in Playlist', `Selected songs already in ${plName}`);
      }
    },
    [playlists, showToast]
  );

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

  const removeTracksFromPlaylist = useCallback(
    (playlistId: string, trackIds: string[]) => {
      if (!trackIds || trackIds.length === 0) return;
      const removeSet = new Set(trackIds);
      const targetPl = playlists.find((p) => p.id === playlistId);
      const plName = targetPl?.name || 'Playlist';

      setPlaylists((prev) =>
        prev.map((pl) => {
          if (pl.id === playlistId) {
            return { ...pl, track_ids: pl.track_ids.filter((id) => !removeSet.has(id)) };
          }
          return pl;
        })
      );
      showToast(
        'Removed from Playlist',
        `Removed ${trackIds.length} song${trackIds.length > 1 ? 's' : ''} from ${plName}`
      );
    },
    [playlists, showToast]
  );

  const deleteTrack = useCallback(
    async (track: Track, deleteFileFromDisk: boolean = false) => {
      try {
        if (deleteFileFromDisk) {
          await invoke('delete_track_file', { filePath: track.file_path });
        }

        // If the deleted track is currently playing, advance to next track or stop
        if (currentTrackRef.current?.id === track.id) {
          if (tracksRef.current.length > 1) {
            handleNextTrack();
          } else {
            audioEngine.pause();
            setCurrentTrack(null);
            setIsPlaying(false);
          }
        }

        // Remove from library tracks
        setTracks((prev) => prev.filter((t) => t.id !== track.id));

        // Remove from contextTracks
        setContextTracks((prev) => prev.filter((t) => t.id !== track.id));

        // Remove from queue
        setQueue((prev) => prev.filter((t) => t.id !== track.id));

        // Remove from liked tracks
        setLikedTrackIds((prev) => {
          const next = new Set(prev);
          next.delete(track.id);
          return next;
        });

        // Remove from all playlists
        setPlaylists((prev) =>
          prev.map((pl) => {
            if (pl.track_ids.includes(track.id)) {
              return {
                ...pl,
                track_ids: pl.track_ids.filter((id) => id !== track.id),
              };
            }
            return pl;
          })
        );

        showToast(
          deleteFileFromDisk ? 'Track Deleted from Disk' : 'Track Removed',
          track.title
        );
      } catch (err) {
        console.error('Failed to delete track:', err);
        showToast('Delete Failed', typeof err === 'string' ? err : 'Could not delete file');
      }
    },
    [handleNextTrack, showToast]
  );

  // Sleep timer interval effect (Task 3.4)
  useEffect(() => {
    if (sleepTimerMinutes === null) {
      setSleepTimerRemainingSec(null);
      return;
    }

    const interval = setInterval(() => {
      let remSec: number;
      if (sleepTimerMinutes === -1) {
        remSec = Math.max(0, Math.round(durationRef.current - currentTimeRef.current));
      } else {
        const cur = sleepTimerRemainingSecRef.current;
        remSec = cur !== null ? cur - 1 : 0;
      }

      if (remSec <= 30 && remSec > 0 && !isSleepFadingRef.current) {
        isSleepFadingRef.current = true;
        audioEngine.fadeOut(remSec).catch(() => {});
      }

      if (remSec <= 0) {
        audioEngine.pause();
        setIsPlaying(false);
        setSleepTimerMinutes(null);
        setSleepTimerRemainingSec(null);
        audioEngine.setVolume(volumeRef.current);
        showToast(
          'Sleep Timer',
          sleepTimerMinutes === -1 ? 'Playback stopped at end of track.' : 'Sleep timer completed. Goodnight!'
        );
      } else {
        setSleepTimerRemainingSec(remSec);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [sleepTimerMinutes, showToast]);

  // Pre-buffer next track into idle deck for gapless & overlapping crossfade (Task 2.1)
  useEffect(() => {
    if (!currentTrack) return;
    let nextTrack: Track | null = null;
    if (queue.length > 0) {
      nextTrack = queue[0];
    } else {
      const playlist = contextTracks.length > 0 ? contextTracks : tracks;
      const idx = playlist.findIndex((t) => t.id === currentTrack.id);
      if (idx !== -1 && idx + 1 < playlist.length) {
        nextTrack = playlist[idx + 1];
      }
    }
    if (nextTrack?.stream_url) {
      audioEngine.preloadNext(nextTrack.stream_url);
    }
  }, [currentTrack?.id, queue, contextTracks, tracks]);

  // Discord Rich Presence status update (Task 4.3)
  useEffect(() => {
    if (currentTrack) {
      invoke('update_discord_status', {
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: currentTrack.album || 'Unknown Album',
        isPlaying,
        duration: duration || currentTrack.duration || 0,
        position: currentTime || 0,
      }).catch(() => {});
    } else {
      invoke('clear_discord_status').catch(() => {});
    }
  }, [currentTrack?.id, isPlaying]);

  const reorderQueue = useCallback((newQueue: Track[]) => {
    setQueue(newQueue);
  }, []);

  const updateTrackMetadata = useCallback((updated: Track) => {
    setTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setQueue((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setContextTracks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setCurrentTrack((prev) => (prev?.id === updated.id ? updated : prev));
    showToast('Tags Updated', `${updated.title} by ${updated.artist}`);
  }, [showToast]);

  const addDroppedTracks = useCallback((dropped: Track[]) => {
    if (!dropped || dropped.length === 0) {
      showToast('No Audio Found', 'Dropped items contain no supported audio tracks');
      return;
    }
    setTracks((prev) => {
      const existingIds = new Set(prev.map((t) => t.id));
      const fresh = dropped.filter((d) => !existingIds.has(d.id));
      return [...fresh, ...prev];
    });
    addTracksToQueue(dropped);
    showToast('Files Imported', `Added ${dropped.length} audio file(s) to library`);
  }, [addTracksToQueue, showToast]);

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
      setTracks((prev) =>
        prev.map((t) => (t.id === track.id ? { ...t, lyrics: lrcContent } : t))
      );
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
      // Global Search Shortcut (Ctrl+K or Cmd+K)
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyK' || e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        window.dispatchEvent(new Event('focus-search'));
        const searchInput = document.getElementById('global-search-input') as HTMLInputElement | null;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
        return;
      }

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
      } else if (e.ctrlKey && (e.code === 'KeyM' || e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        toggleMiniPlayer();
      } else if (!e.ctrlKey && e.code === 'KeyM') {
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
  }, [handleNextTrack, handlePrevTrack, seekTo, setVolumeLevel, toggleLike, toggleMiniPlayer, toggleMute, togglePlay]);

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
        contextTracks,
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
        playQueueTrack,
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
        addTracksToQueue,
        removeFromQueue,
        moveQueueItem,
        clearQueue,
        createPlaylist,
        updatePlaylist,
        deletePlaylist,
        addTrackToPlaylist,
        addTracksToPlaylist,
        removeTrackFromPlaylist,
        removeTracksFromPlaylist,
        setPreset,
        setCustomGain,
        refreshLibrary,
        saveLyrics: saveLyricsHandler,
        openInExplorer,
        deleteTrack,
        getPlayCount,
        topTracks,
        topTracksTimeRange,
        setTopTracksTimeRange,
        getTrackStats,
        playingPlaylistId,
        setPlayingPlaylistId,
        exportPlaylistM3U,
        importPlaylistM3U,
        crossfadeDuration,
        setCrossfadeDuration,
        isMiniPlayer,
        toggleMiniPlayer,
        isAlwaysOnTop,
        toggleAlwaysOnTop,
        themeAppearance,
        setThemeAppearance,
        sleepTimerMinutes,
        sleepTimerRemainingSec,
        setSleepTimer,
        reorderQueue,
        updateTrackMetadata,
        addDroppedTracks,
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
