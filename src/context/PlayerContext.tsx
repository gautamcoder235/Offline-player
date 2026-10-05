import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { LogicalSize } from '@tauri-apps/api/dpi';
import { Track, RepeatMode, Playlist, ParsedLyrics } from '../types';

import { audioEngine, EQUALIZER_PRESETS } from '../services/audioEngine';
import { parseLrcLyrics } from '../utils/helpers';
import { generateM3U8, parseM3U8, downloadBlob } from '../utils/m3u';

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
  playTrack: (track: Track, newQueue?: Track[]) => Promise<void>;
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
  deletePlaylist: (id: string) => void;
  addTrackToPlaylist: (playlistId: string, trackId: string) => void;
  removeTrackFromPlaylist: (playlistId: string, trackId: string) => void;
  setPreset: (name: string) => void;
  setCustomGain: (bandIndex: number, gain: number) => void;
  refreshLibrary: (directories?: string[]) => Promise<void>;
  saveLyrics: (track: Track, lrcContent: string) => Promise<void>;
  openInExplorer: (filePath: string) => Promise<void>;
  getPlayCount: (trackId: string) => number;
  topTracks: Track[];
  exportPlaylistM3U: (playlistId: string) => void;
  importPlaylistM3U: (file: File) => Promise<{ playlistName: string; totalInFile: number; matchedCount: number }>;
  crossfadeDuration: number;
  setCrossfadeDuration: (sec: number) => void;
  isMiniPlayer: boolean;
  toggleMiniPlayer: () => Promise<void>;
  isAlwaysOnTop: boolean;
  toggleAlwaysOnTop: () => Promise<void>;
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

  const getPlayCount = useCallback((trackId: string) => {
    return playCounts[trackId] || 0;
  }, [playCounts]);

  const topTracks = React.useMemo(() => {
    return [...tracks]
      .filter(t => playCounts[t.id] > 0 || playCounts[`${t.artist} - ${t.title}`] > 0 || (t.playCount && t.playCount > 0))
      .map(t => ({ ...t, playCount: playCounts[t.id] || playCounts[`${t.artist} - ${t.title}`] || t.playCount || 0 }))
      .sort((a, b) => (b.playCount || 0) - (a.playCount || 0));
  }, [tracks, playCounts]);

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

  const [equalizerPreset, setEqualizerPreset] = useState<string>('Flat');
  const [customGains, setCustomGains] = useState<[number, number, number, number, number]>([0, 0, 0, 0, 0]);
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

  // Always-On-Top Floating Mini-Player state
  const [isMiniPlayer, setIsMiniPlayer] = useState<boolean>(false);
  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState<boolean>(false);
  const previousSizeRef = useRef<{ width: number; height: number } | null>(null);

  const toggleMiniPlayer = useCallback(async () => {
    try {
      const appWindow = getCurrentWindow();
      if (!isMiniPlayer) {
        // Entering Mini Player mode
        const currentSize = await appWindow.innerSize();
        previousSizeRef.current = { width: currentSize.width, height: currentSize.height };
        await appWindow.setAlwaysOnTop(true);
        setIsAlwaysOnTop(true);
        // Set compact glass widget dimensions (350x135)
        await appWindow.setSize(new LogicalSize(350, 135));
        setIsMiniPlayer(true);
        if (typeof document !== 'undefined') {
          document.body.classList.add('mini-player-active');
        }
      } else {
        // Restoring Full Player
        await appWindow.setAlwaysOnTop(false);
        setIsAlwaysOnTop(false);
        const restoreW = previousSizeRef.current?.width || 1280;
        const restoreH = previousSizeRef.current?.height || 840;
        await appWindow.setSize(new LogicalSize(restoreW, restoreH));
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
    async (track: Track, newContextTracks?: Track[]) => {
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

      showToast(trackToPlay.title, trackToPlay.artist, trackToPlay.cover_art);
      fetchLyrics(trackToPlay);

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

  // Next Track Logic: User Queue first, then context playlist
  const handleNextTrack = useCallback(() => {
    // 1. First priority: Play from user explicit queue
    const q = queueRef.current;
    if (q.length > 0) {
      const [nextTrack, ...remaining] = q;
      setQueue(remaining);
      playTrack(nextTrack);
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
      playTrack(playlist[randIdx]);
      return;
    }

    const curId = currentTrackRef.current?.id;
    let currentIndex = curId ? playlist.findIndex((t) => t.id === curId) : -1;
    if (currentIndex === -1) {
      currentIndex = lastContextIndexRef.current;
    }

    if (currentIndex !== -1 && currentIndex + 1 < playlist.length) {
      playTrack(playlist[currentIndex + 1]);
    } else if (repeatModeRef.current === 'all' && playlist.length > 0) {
      playTrack(playlist[0]);
    } else {
      setIsPlaying(false);
    }
  }, [playTrack]);

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

      // Crossfade transition trigger: gently dip volume before end of track and advance
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
        audioEngine.fadeOut(Math.min(xfade, 2)).then(() => {
          handleNextTrack();
          setTimeout(() => {
            isCrossfadingRef.current = false;
          }, 1200);
        });
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

    audioEngine.onPlay = () => setIsPlaying(true);
    audioEngine.onPause = () => {
      setIsPlaying(false);
      if (currentTrackRef.current) {
        saveLastPlayed(currentTrackRef.current, currentTimeRef.current, durationRef.current);
      }
    };

    audioEngine.onEnded = () => {
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
        handleNextTrack();
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
        getPlayCount,
        topTracks,
        exportPlaylistM3U,
        importPlaylistM3U,
        crossfadeDuration,
        setCrossfadeDuration,
        isMiniPlayer,
        toggleMiniPlayer,
        isAlwaysOnTop,
        toggleAlwaysOnTop,
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
