export interface Track {
  id: string;
  file_path: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  duration_str: string;
  year?: number | null;
  bitrate?: number | null;
  size_bytes: number;
  cover_art?: string | null;
  stream_url: string;
  playCount?: number;
}

export type RepeatMode = 'off' | 'all' | 'one';

export type ThemeAppearance = 'default' | 'aura_glass';

export type ViewMode =
  | 'songs'
  | 'albums'
  | 'artists'
  | 'top_tracks'
  | 'playlists'
  | 'playlist_detail'
  | 'liked'
  | 'download'
  | 'lyrics'
  | 'visualizer'
  | 'settings';

export interface M3UTrackEntry {
  duration: number;
  title: string;
  artist?: string;
  path: string;
}

export interface M3UPlaylist {
  name?: string;
  entries: M3UTrackEntry[];
}

export interface Playlist {
  id: string;
  name: string;
  description?: string;
  track_ids: string[];
  createdAt: number;
  coverColor?: string;
  cover_art?: string;
}

export interface EqualizerPreset {
  name: string;
  gains: [number, number, number, number, number]; // 60Hz, 250Hz, 1kHz, 4kHz, 14kHz
}

export interface LyricLine {
  time: number; // in seconds
  text: string;
}

export interface ParsedLyrics {
  isSynced: boolean;
  lines: LyricLine[];
  rawText: string;
  source: string;
}

export interface AppSettings {
  music_directories: string[];
  download_directory: string;
  volume: number;
  equalizer_preset: string;
  crossfade_duration?: number;
}

export interface DownloadLogEvent {
  type: string;
  message?: string;
  percent?: number;
  track?: string;
  title?: string;
  artist?: string;
  album?: string;
  file_path?: string;
  status?: string;
  total?: number;
  current?: number;
  succeeded?: number;
  failed?: number;
  tracks?: Array<{ title: string; artists: string[]; album: string }>;
  playlist_name?: string | null;
  is_collection?: boolean;
}
