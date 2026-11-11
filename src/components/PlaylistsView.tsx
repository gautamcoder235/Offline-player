import React, { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ListMusic,
  Plus,
  Play,
  Heart,
  X,
  FolderPlus,
  Flame,
  Pencil,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { TrackList } from './TrackList';
import { ViewMode, Playlist } from '../types';
import { AnimatedTrash, AnimatedFileTransfer } from './icons';
import { DeletePlaylistModal } from './DeletePlaylistModal';
import { EditPlaylistModal } from './EditPlaylistModal';
import { groupTracksByArtist, getArtistTracks } from '../utils/artistUtils';
import { groupTracksIntoAlbums } from '../utils/albumUtils';

interface PlaylistsViewProps {
  selectedPlaylistId: string | null;
  onSelectPlaylist: (id: string | null) => void;
  onViewChange?: (view: ViewMode) => void;
}

const PRESET_COLORS = [
  '[var(--accent)]', // Emerald Mint
  '#00F2FE', // Electric Cyan
  '#FF007F', // Neon Magenta
  '#9D4EDD', // Electric Purple
  '#E8C77A', // Champagne Gold
  '#FF7A00', // Sunset Coral
  '#3B82F6', // Cobalt Blue
  '#10B981', // Forest Emerald
];

const getContrastTextColor = (hexColor: string): string => {
  const clean = hexColor.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) || 0;
  const g = parseInt(clean.substring(2, 4), 16) || 0;
  const b = parseInt(clean.substring(4, 6), 16) || 0;
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128 ? '#000000' : '#FFFFFF';
};

export const PlaylistsView: React.FC<PlaylistsViewProps> = ({
  selectedPlaylistId,
  onSelectPlaylist,
  onViewChange,
}) => {
  const {
    playlists,
    tracks,
    likedTrackIds,
    createPlaylist,
    updatePlaylist,
    deletePlaylist,
    playTrack,
    topTracks,
    exportPlaylistM3U,
    importPlaylistM3U,
  } = usePlayer();

  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [autoIncludeArtistTracks, setAutoIncludeArtistTracks] = useState(true);
  const [playlistToDelete, setPlaylistToDelete] = useState<Playlist | null>(null);
  const [playlistToEdit, setPlaylistToEdit] = useState<Playlist | null>(null);
  const isCreateBackdropMouseDownRef = useRef(false);

  // Group artists from library for quick selection
  const libraryArtists = useMemo(() => groupTracksByArtist(tracks), [tracks]);
  // Group albums from library for quick selection
  const libraryAlbums = useMemo(() => groupTracksIntoAlbums(tracks), [tracks]);

  // Check if current playlist name matches an album
  const matchingAlbum = useMemo(() => {
    if (!name.trim()) return null;
    const lower = name.trim().toLowerCase();
    return libraryAlbums.find((a) => a.name.toLowerCase() === lower) || null;
  }, [libraryAlbums, name]);

  // Check if current playlist name matches an artist in the library
  const matchingArtistTracks = useMemo(() => {
    if (!name.trim()) return [];
    const { all } = getArtistTracks(tracks, name.trim());
    return all;
  }, [tracks, name]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    let initialTrackIds: string[] = [];
    if (autoIncludeArtistTracks) {
      if (matchingAlbum) {
        initialTrackIds = matchingAlbum.tracks.map((t) => t.id);
      } else if (matchingArtistTracks.length > 0) {
        initialTrackIds = matchingArtistTracks.map((t) => t.id);
      }
    }

    createPlaylist(
      name.trim(),
      desc.trim() ||
        (matchingAlbum
          ? `Album by ${matchingAlbum.artist} • ${initialTrackIds.length} tracks`
          : initialTrackIds.length > 0
          ? `Complete collection of songs including ${name.trim()}`
          : undefined),
      initialTrackIds,
      selectedColor
    );
    setName('');
    setDesc('');
    setIsCreating(false);
  };

  const likedTracks = tracks.filter((t) => likedTrackIds.has(t.id));

  // If a playlist is selected, show detail view
  if (selectedPlaylistId) {
    const selectedPlaylist = playlists.find((p) => p.id === selectedPlaylistId);
    if (!selectedPlaylist) {
      return (
        <div className="flex-1 p-8 text-center text-[#65616F]">
          Playlist not found.{' '}
          <button
            onClick={() => onSelectPlaylist(null)}
            className="text-[var(--accent)] underline ml-1 cursor-pointer"
          >
            Back to playlists
          </button>
        </div>
      );
    }

    const playlistTracks = useMemo(() => {
      const idSet = new Set(selectedPlaylist.track_ids);
      return tracks.filter((t) => idSet.has(t.id));
    }, [tracks, selectedPlaylist.track_ids]);

    const uniqueCovers = useMemo(() => {
      const coverArts = playlistTracks
        .map((t) => t.cover_art)
        .filter((c): c is string => Boolean(c));
      return Array.from(new Set(coverArts));
    }, [playlistTracks]);

    const accentColor = selectedPlaylist.coverColor || '[var(--accent)]';
    const playTextColor = getContrastTextColor(accentColor);

    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-transparent relative">
        {/* Ambient Top Glow Banner derived from the playlist's chosen accent color */}
        <div
          className="absolute top-0 left-0 right-0 h-96 pointer-events-none transition-all duration-700 ease-out z-0"
          style={{
            background: `radial-gradient(ellipse 90% 120% at 20% -10%, ${accentColor}40 0%, ${accentColor}12 55%, transparent 80%)`,
          }}
        />

        {/* Ambient Floating Glow Blob behind artwork */}
        <div
          className="absolute -top-12 -left-10 w-80 h-80 rounded-full pointer-events-none blur-3xl opacity-30 z-0 transition-all duration-700"
          style={{
            backgroundColor: accentColor,
          }}
        />

        <div
          className="relative z-10 p-6 md:p-8 flex items-end justify-between gap-6 border-b border-white/[0.05] shrink-0 min-w-0 bg-[#0E0D14]/75 backdrop-blur-2xl"
        >
          <div className="flex items-end gap-6 min-w-0 flex-1">
            <div
              onClick={() => setPlaylistToEdit(selectedPlaylist)}
              className="relative group w-32 h-32 md:w-36 md:h-36 rounded-2xl overflow-hidden bg-[#121019] border border-white/[0.08] flex items-center justify-center shadow-[0_12px_36px_rgba(0,0,0,0.7)] shrink-0 cursor-pointer transition-all duration-300 hover:border-white/[0.18]"
              title="Click to edit playlist artwork and details"
            >
              {selectedPlaylist.cover_art ? (
                <img
                  src={selectedPlaylist.cover_art}
                  alt={selectedPlaylist.name}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : uniqueCovers.length >= 4 ? (
                <div className="w-full h-full grid grid-cols-2 grid-rows-2 transition-transform duration-300 group-hover:scale-105">
                  {uniqueCovers.slice(0, 4).map((art, i) => (
                    <img key={i} src={art} alt="" className="w-full h-full object-cover" />
                  ))}
                </div>
              ) : uniqueCovers.length > 0 ? (
                <img
                  src={uniqueCovers[0]}
                  alt={selectedPlaylist.name}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{
                    background: `linear-gradient(135deg, ${accentColor}25, #07060A)`,
                  }}
                >
                  <ListMusic
                    className="w-12 h-12"
                    style={{ color: accentColor }}
                  />
                </div>
              )}

              {/* Hover overlay for quick edit */}
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-white">
                <Pencil className="w-5 h-5 text-[var(--accent)]" />
                <span className="text-[10px] font-medium">Edit Details</span>
              </div>
            </div>

            <div className="space-y-1.5 min-w-0 flex-1 pb-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onSelectPlaylist(null)}
                  className="group inline-flex items-center gap-1 text-[11px] font-medium text-[#777381] hover:text-[var(--accent)] transition-colors cursor-pointer"
                  title="Back to all playlists"
                >
                  <ArrowLeft className="w-3 h-3 transition-transform duration-200 group-hover:-translate-x-0.5" />
                  <span>Playlists</span>
                </button>
                <span className="text-[#353342] text-xs">/</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[#AAA6B2]">
                  Playlist
                </span>
              </div>

              <div className="flex items-center gap-2 group/title min-w-0">
                <h1
                  onClick={() => setPlaylistToEdit(selectedPlaylist)}
                  className="text-2xl md:text-3xl font-extrabold text-[#F4F2F7] tracking-tight truncate cursor-pointer transition-colors"
                  style={{
                    textShadow: `0 0 35px ${accentColor}25`,
                  }}
                  title="Click to edit playlist details"
                >
                  {selectedPlaylist.name}
                </h1>
                <button
                  type="button"
                  onClick={() => setPlaylistToEdit(selectedPlaylist)}
                  className="p-1 rounded-lg text-[#777381] hover:text-[var(--accent)] hover:bg-[var(--accent-muted)] transition-colors cursor-pointer shrink-0 opacity-70 group-hover/title:opacity-100"
                  title="Edit playlist details"
                  aria-label="Edit playlist details"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-xs text-[#777381] truncate">
                {selectedPlaylist.description || `${playlistTracks.length} tracks in this collection`}
              </p>
            </div>
          </div>

          <div className="flex items-center shrink-0">
            {playlistTracks.length > 0 && (
              <button
                onClick={() => playTrack(playlistTracks[0], playlistTracks, selectedPlaylist.id)}
                className="group/playall flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-xs transition-all duration-200 shadow-lg cursor-pointer hover:scale-[1.03] active:scale-95 shrink-0 whitespace-nowrap"
                style={{
                  backgroundColor: accentColor,
                  color: playTextColor,
                  boxShadow: `0 8px 24px ${accentColor}40`,
                }}
              >
                <Play className="w-3.5 h-3.5 fill-current discord-icon discord-icon-pop" />
                <span>Play All</span>
              </button>
            )}
          </div>
        </div>

        <TrackList key={selectedPlaylist.id} tracks={playlistTracks} playlistId={selectedPlaylist.id} />

        {/* Modals for Detail View */}
        <DeletePlaylistModal
          playlist={playlistToDelete}
          isOpen={Boolean(playlistToDelete)}
          tracks={tracks}
          onClose={() => setPlaylistToDelete(null)}
          onConfirm={(pl) => {
            deletePlaylist(pl.id);
            onSelectPlaylist(null);
          }}
        />

        <EditPlaylistModal
          playlist={playlistToEdit}
          isOpen={Boolean(playlistToEdit)}
          tracks={tracks}
          onClose={() => setPlaylistToEdit(null)}
          onSave={(id, updates) => {
            updatePlaylist(id, updates);
          }}
          onExport={(id) => {
            exportPlaylistM3U(id);
          }}
          onDelete={(pl) => {
            setPlaylistToDelete(pl);
          }}
          onBackToPlaylists={() => {
            onSelectPlaylist(null);
          }}
        />
      </div>
    );
  }

  // All Playlists Grid View
  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-y-auto px-8 py-7 select-none bg-transparent">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] shrink-0 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-[#F4F2F7] tracking-tight">Playlists</h2>
          </div>
          <p className="text-xs text-[#777381] mt-0.5">
            {playlists.length + 1} {playlists.length === 0 ? 'playlist' : 'playlists'}
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.m3u,.m3u8';
              input.onchange = async (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) await importPlaylistM3U(file);
              };
              input.click();
            }}
            className="group h-[34px] flex items-center gap-2 px-3.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[#AAA6B2] hover:text-[#F4F2F7] text-xs font-medium border border-white/[0.08] transition-all duration-200 shadow-sm active:scale-95 cursor-pointer shrink-0"
            title="Import .m3u or .m3u8 playlist file"
          >
            <AnimatedFileTransfer type="up" className="w-4 h-4 text-[var(--accent)]" />
            <span>Import Playlist</span>
          </button>

          <button
            onClick={() => setIsCreating(true)}
            className="group/newpl h-[34px] flex items-center gap-2 px-4 rounded-xl bg-[var(--accent)] hover:opacity-95 text-[var(--accent-contrast,#000000)] font-semibold text-xs transition-all duration-200 shadow-lg hover:scale-[1.03] active:scale-95 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 discord-icon discord-icon-pop" />
            <span>New Playlist</span>
          </button>
        </div>
      </div>

      {/* Creation Modal */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {isCreating && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 select-none"
                onMouseDown={(e) => {
                  isCreateBackdropMouseDownRef.current = e.target === e.currentTarget;
                }}
                onClick={(e) => {
                  if (e.target === e.currentTarget && isCreateBackdropMouseDownRef.current) {
                    setIsCreating(false);
                  }
                  isCreateBackdropMouseDownRef.current = false;
                }}
              >
                <motion.form
                  initial={{ opacity: 0, scale: 0.95, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 8 }}
                  transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
                  onSubmit={handleCreate}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  className="p-5 rounded-2xl bg-[#0D0B13]/95 backdrop-blur-2xl border border-white/[0.08] w-full max-w-sm space-y-4 shadow-[0_24px_64px_rgba(0,0,0,0.85)] relative overflow-hidden"
                >
                  {/* Dynamic ambient accent glow inside create form */}
                  <div
                    className="absolute -top-12 -right-12 w-36 h-36 rounded-full pointer-events-none blur-3xl opacity-20 transition-all duration-500 ease-out z-0"
                    style={{ backgroundColor: selectedColor }}
                  />
                  <div
                    className="absolute top-0 left-0 right-0 h-0.5 pointer-events-none transition-colors duration-500 z-0"
                    style={{ backgroundColor: selectedColor, boxShadow: `0 0 10px ${selectedColor}` }}
                  />

                  <div className="relative z-10 flex items-center justify-between">
                    <h3 className="text-sm font-bold text-[#F4F2F7]">Create New Playlist</h3>
                    <button
                      type="button"
                      onClick={() => setIsCreating(false)}
                      className="text-[#65616F] hover:text-[#F4F2F7] hover:bg-white/[0.08] p-1.5 rounded-lg transition-all duration-150 active:scale-90 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="relative z-10 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-[#AAA6B2] uppercase tracking-wider">
                        Title
                      </label>
                      {libraryArtists.length > 0 && (
                        <select
                          value=""
                          onChange={(e) => {
                            if (e.target.value) {
                              setName(e.target.value);
                            }
                          }}
                          className="text-[10px] text-[#777381] hover:text-[var(--accent)] bg-[#07060A] px-2 py-0.5 rounded-lg border border-white/[0.08] outline-none cursor-pointer"
                        >
                          <option value="" disabled className="text-[#777381]">
                            Fill from artist/album...
                          </option>
                          <optgroup label="Artists" className="bg-[#07060A] text-[var(--accent)]">
                            {libraryArtists.slice(0, 30).map((art) => (
                              <option key={art.normalizedKey} value={art.name} className="text-[#F4F2F7]">
                                {art.name} ({art.tracks.length} songs)
                              </option>
                            ))}
                          </optgroup>
                          <optgroup label="Albums" className="bg-[#07060A] text-[var(--accent)]">
                            {libraryAlbums.slice(0, 30).map((alb) => (
                              <option key={alb.key} value={alb.name} className="text-[#F4F2F7]">
                                {alb.name} ({alb.tracks.length} tracks)
                              </option>
                            ))}
                          </optgroup>
                        </select>
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder="My Awesome Playlist"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoFocus
                      className="w-full px-3 h-10 rounded-xl bg-[#07060A]/80 border border-white/[0.08] text-xs text-[#F4F2F7] placeholder-[#65616F] focus:outline-none focus:border-[var(--accent)]/50 transition-all"
                    />
                    {matchingAlbum ? (
                      <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--accent-muted)] border border-[var(--accent-border)] text-xs text-[var(--accent)]">
                        <div className="flex items-center gap-1.5 min-w-0 pr-2">
                          <Sparkles className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">
                            Album detected: <strong>{matchingAlbum.tracks.length}</strong> tracks in "{matchingAlbum.name}"
                          </span>
                        </div>
                        <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold select-none shrink-0">
                          <input
                            type="checkbox"
                            checked={autoIncludeArtistTracks}
                            onChange={(e) => setAutoIncludeArtistTracks(e.target.checked)}
                            className="rounded accent-[var(--accent)]"
                          />
                          <span>Auto-include</span>
                        </label>
                      </div>
                    ) : matchingArtistTracks.length > 0 ? (
                      <div className="flex items-center justify-between p-2 rounded-xl bg-[var(--accent-muted)] border border-[var(--accent-border)] text-xs text-[var(--accent)]">
                        <div className="flex items-center gap-1.5 min-w-0 pr-2">
                          <Sparkles className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">
                            Artist detected: <strong>{matchingArtistTracks.length}</strong> songs included
                          </span>
                        </div>
                        <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold select-none shrink-0">
                          <input
                            type="checkbox"
                            checked={autoIncludeArtistTracks}
                            onChange={(e) => setAutoIncludeArtistTracks(e.target.checked)}
                            className="rounded accent-[var(--accent)]"
                          />
                          <span>Auto-include</span>
                        </label>
                      </div>
                    ) : null}
                  </div>

                  <div className="relative z-10 space-y-2">
                    <label className="text-[11px] font-semibold text-[#AAA6B2] uppercase tracking-wider">
                      Description (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="Chill tracks for coding..."
                      value={desc}
                      onChange={(e) => setDesc(e.target.value)}
                      className="w-full px-3 h-10 rounded-xl bg-[#07060A]/80 border border-white/[0.08] text-xs text-[#F4F2F7] placeholder-[#65616F] focus:outline-none focus:border-[var(--accent)]/50 transition-all"
                    />
                  </div>

                  <div className="relative z-10 space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-[#AAA6B2] uppercase tracking-wider">
                        Accent Color
                      </label>
                      <span className="text-[10px] text-[#777381]">
                        Banner glow & play buttons
                      </span>
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      {PRESET_COLORS.map((col) => (
                        <button
                          key={col}
                          type="button"
                          onClick={() => setSelectedColor(col)}
                          className={`w-6 h-6 rounded-full transition-transform duration-200 cursor-pointer active:scale-90 ${
                            selectedColor === col ? 'scale-125 ring-2 ring-white shadow-md' : 'hover:scale-110 opacity-80'
                          }`}
                          style={{ backgroundColor: col }}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="relative z-10 flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsCreating(false)}
                      className="px-3.5 py-2 text-xs font-medium text-[#777381] hover:text-[#F4F2F7] hover:bg-[#1C1B22] transition-all duration-150 active:scale-95 rounded-xl cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!name.trim()}
                      className="px-4 py-2 rounded-xl disabled:opacity-50 font-semibold text-xs shadow-md transition-all duration-150 active:scale-95 cursor-pointer"
                      style={{
                        backgroundColor: selectedColor,
                        color: getContrastTextColor(selectedColor),
                        boxShadow: `0 4px 14px ${selectedColor}40`,
                      }}
                    >
                      Create
                    </button>
                  </div>
                </motion.form>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}

      {/* Main Grid: Liked Songs Hero Card + Custom Playlists */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
        {/* Special Hero Card: Liked Songs */}
        <div
          onClick={() => onViewChange?.('liked')}
          className="col-span-1 sm:col-span-2 p-5 rounded-2xl bg-gradient-to-br from-[var(--accent-muted)] via-[#1A1230]/40 to-[#0F0E16]/80 backdrop-blur-xl border border-white/[0.08] hover:border-[var(--accent-border)] transition-all duration-300 cursor-pointer group flex flex-col justify-between relative shadow-[0_8px_32px_rgba(0,0,0,0.5)] hover:shadow-[0_12px_40px_var(--accent-glow)] min-h-[180px] active:scale-[0.98] overflow-hidden"
        >
          {/* Subtle ambient corner glow */}
          <div className="absolute -top-12 -right-12 w-28 h-28 rounded-full bg-[var(--accent-muted)] blur-2xl pointer-events-none group-hover:bg-[var(--accent-muted)] transition-colors" />

          <div className="flex items-start justify-between relative z-10">
            <div className="w-11 h-11 rounded-xl bg-white/[0.08] backdrop-blur-md border border-white/[0.14] flex items-center justify-center shadow-lg transition-transform duration-300 group-hover:scale-105">
              <Heart className="w-6 h-6 fill-[var(--accent)] text-[var(--accent)]" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9A96A5] bg-white/[0.06] border border-white/[0.08] px-2.5 py-0.5 rounded-full">
              Auto Playlist
            </span>
          </div>

          <div className="pr-12 relative z-10">
            <h3 className="text-xl font-black text-[#F4F2F7] tracking-tight group-hover:text-[var(--accent)] transition-colors duration-200">
              Liked Songs
            </h3>
            <p className="text-xs text-[#9A96A5] mt-1 font-medium">
              {likedTrackIds.size} favorite songs
            </p>
          </div>

          {likedTracks.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                playTrack(likedTracks[0], likedTracks, 'liked');
              }}
              className="group/likedplay absolute bottom-4 right-4 w-11 h-11 rounded-full bg-[var(--accent)] hover:opacity-95 text-[var(--accent-contrast,#000000)] shadow-[0_4px_20px_var(--accent-glow)] flex items-center justify-center transition-all duration-200 transform translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 hover:scale-[1.05] active:scale-95 cursor-pointer z-10"
              title="Play Liked Songs"
            >
              <Play className="w-5 h-5 fill-black text-black ml-0.5 discord-icon discord-icon-pop" />
            </button>
          )}
        </div>

        {/* Special Hero Card: Top Tracks */}
        <div
          onClick={() => onViewChange?.('top_tracks')}
          className="col-span-1 sm:col-span-2 p-5 rounded-2xl bg-gradient-to-br from-[#F5C056]/15 via-[#301C0A]/40 to-[#0F0E16]/80 backdrop-blur-xl border border-white/[0.08] hover:border-[#F5C056]/40 transition-all duration-300 cursor-pointer group flex flex-col justify-between relative shadow-[0_8px_32px_rgba(0,0,0,0.5)] hover:shadow-[0_12px_40px_rgba(245,192,86,0.15)] min-h-[180px] active:scale-[0.98] overflow-hidden"
        >
          {/* Subtle ambient corner glow */}
          <div className="absolute -top-12 -right-12 w-28 h-28 rounded-full bg-[#F5C056]/20 blur-2xl pointer-events-none group-hover:bg-[#F5C056]/30 transition-colors" />

          <div className="flex items-start justify-between relative z-10">
            <div className="w-11 h-11 rounded-xl bg-white/[0.08] backdrop-blur-md border border-white/[0.14] flex items-center justify-center shadow-lg transition-transform duration-300 group-hover:scale-105">
              <Flame className="w-6 h-6 fill-[#F5C056] text-[#F5C056]" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#F5C056] bg-[#F5C056]/10 border border-[#F5C056]/20 px-2.5 py-0.5 rounded-full">
              Most Played
            </span>
          </div>

          <div className="pr-12 relative z-10">
            <h3 className="text-xl font-black text-[#F4F2F7] tracking-tight group-hover:text-[#F5C056] transition-colors duration-200">
              Top Played Mix
            </h3>
            <p className="text-xs text-[#9A96A5] mt-1 font-medium">
              {topTracks.length} tracks ranked by your listens
            </p>
          </div>

          {topTracks.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                playTrack(topTracks[0], topTracks, 'top_tracks');
              }}
              className="group/topplay absolute bottom-4 right-4 w-11 h-11 rounded-full bg-[#F5C056] hover:bg-[#F8CF75] text-black shadow-[0_4px_20px_rgba(245,192,86,0.4)] flex items-center justify-center transition-all duration-200 transform translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 hover:scale-[1.05] active:scale-95 cursor-pointer z-10"
              title="Play Top Tracks"
            >
              <Play className="w-5 h-5 fill-black text-black ml-0.5 discord-icon discord-icon-pop" />
            </button>
          )}
        </div>

        {/* User & Downloaded Custom Playlists */}
        {playlists.map((pl) => {
          const playlistTracks = tracks.filter((t) => pl.track_ids.includes(t.id));
          const coverArts = playlistTracks
            .map((t) => t.cover_art)
            .filter((c): c is string => !!c);
          const uniqueCovers = Array.from(new Set(coverArts));
          const accentColor = pl.coverColor || '[var(--accent)]';
          const playTextColor = getContrastTextColor(accentColor);

          return (
            <div
              key={pl.id}
              onClick={() => onSelectPlaylist(pl.id)}
              className="p-3.5 rounded-2xl bg-[#121118]/70 hover:bg-[#181622]/90 backdrop-blur-xl border border-white/[0.06] hover:border-white/[0.14] transition-all duration-200 cursor-pointer group flex flex-col gap-3 relative shadow-[0_4px_20px_rgba(0,0,0,0.35)] hover:shadow-[0_12px_36px_rgba(0,0,0,0.6)] active:scale-[0.98] overflow-hidden"
            >
              {/* Top Accent Indicator on Hover */}
              <div
                className="absolute top-0 left-0 right-0 h-[2.5px] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-t-2xl"
                style={{
                  backgroundColor: accentColor,
                  boxShadow: `0 0 10px ${accentColor}`,
                }}
              />

              {/* Ambient Glow behind card on hover */}
              <div
                className="absolute -top-10 -right-10 w-24 h-24 rounded-full pointer-events-none blur-2xl opacity-0 group-hover:opacity-25 transition-opacity duration-500"
                style={{
                  backgroundColor: accentColor,
                }}
              />

              {/* Square Aspect Ratio Cover with 2x2 Collage or Artwork */}
              <div className="aspect-square w-full rounded-xl overflow-hidden shadow-md bg-[#0E0D14] relative border border-white/[0.08] flex items-center justify-center transition-transform duration-300 group-hover:scale-[1.02]">
                {pl.cover_art ? (
                  <img src={pl.cover_art} alt={pl.name} className="w-full h-full object-cover" />
                ) : uniqueCovers.length >= 4 ? (
                  <div className="w-full h-full grid grid-cols-2 grid-rows-2">
                    {uniqueCovers.slice(0, 4).map((art, i) => (
                      <img key={i} src={art} alt="" className="w-full h-full object-cover" />
                    ))}
                  </div>
                ) : uniqueCovers.length > 0 ? (
                  <img src={uniqueCovers[0]} alt={pl.name} className="w-full h-full object-cover" />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, ${accentColor}25, #121118)`,
                    }}
                  >
                    <ListMusic className="w-10 h-10" style={{ color: accentColor }} />
                  </div>
                )}

                {/* Floating Play Button on Hover */}
                {playlistTracks.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      playTrack(playlistTracks[0], playlistTracks, pl.id);
                    }}
                    className="absolute bottom-2.5 right-2.5 w-10 h-10 rounded-full shadow-2xl flex items-center justify-center transition-all duration-200 transform translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 hover:scale-[1.06] active:scale-95 cursor-pointer"
                    style={{
                      backgroundColor: accentColor,
                      color: playTextColor,
                      boxShadow: `0 4px 16px ${accentColor}60`,
                    }}
                    title={`Play ${pl.name}`}
                  >
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  </button>
                )}
              </div>

              {/* Card Meta & Delete Action */}
              <div className="flex items-center justify-between min-w-0">
                <div className="min-w-0 flex-1 pr-1">
                  <h4
                    className="text-xs font-bold text-[#F4F2F7] truncate transition-colors duration-200"
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.color = accentColor;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.color = '';
                    }}
                  >
                    {pl.name}
                  </h4>
                  <span className="text-[11px] text-[#777381] font-mono mt-0.5 block">
                    {pl.track_ids.length} songs
                  </span>
                </div>

                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-200">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPlaylistToEdit(pl);
                    }}
                    className="p-1.5 text-[#65616F] hover:text-[var(--accent)] rounded-lg hover:bg-[var(--accent-muted)] cursor-pointer active:scale-90"
                    title="Edit playlist"
                    aria-label="Edit playlist"
                  >
                    <Pencil className="w-3.5 h-3.5 transition-transform duration-200 hover:scale-110" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      exportPlaylistM3U(pl.id);
                    }}
                    className="group/btn p-1.5 text-[#65616F] hover:text-[var(--accent)] rounded-lg hover:bg-[var(--accent-muted)] cursor-pointer active:scale-90"
                    title="Export playlist (.m3u8)"
                    aria-label="Export playlist"
                  >
                    <AnimatedFileTransfer type="down" className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPlaylistToDelete(pl);
                    }}
                    className="group/btn p-1.5 text-[#65616F] hover:text-[#FF667A] rounded-lg hover:bg-[#FF667A]/10 cursor-pointer active:scale-90"
                    title="Delete playlist"
                    aria-label="Delete playlist"
                  >
                    <AnimatedTrash className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}

        {/* Quick Create Card if Playlists are few */}
        {playlists.length < 3 && (
          <button
            onClick={() => setIsCreating(true)}
            className="p-3.5 rounded-2xl border-2 border-dashed border-white/[0.1] hover:border-[var(--accent)]/50 hover:bg-white/[0.02] transition-all duration-200 cursor-pointer flex flex-col items-center justify-center gap-3 text-[#65616F] hover:text-[var(--accent)] min-h-[180px] group active:scale-[0.98]"
          >
            <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center border border-white/[0.08] group-hover:border-[var(--accent-border)] transition-colors duration-200">
              <FolderPlus className="w-5 h-5 text-[#777381] group-hover:text-[var(--accent)] transition-transform duration-200 group-hover:scale-110" />
            </div>
            <span className="text-xs font-semibold">Create Playlist</span>
          </button>
        )}
      </div>

      {/* Modals for Grid View */}
      <DeletePlaylistModal
        playlist={playlistToDelete}
        isOpen={Boolean(playlistToDelete)}
        tracks={tracks}
        onClose={() => setPlaylistToDelete(null)}
        onConfirm={(pl) => {
          deletePlaylist(pl.id);
        }}
      />

      <EditPlaylistModal
        playlist={playlistToEdit}
        isOpen={Boolean(playlistToEdit)}
        tracks={tracks}
        onClose={() => setPlaylistToEdit(null)}
        onSave={(id, updates) => {
          updatePlaylist(id, updates);
        }}
        onExport={(id) => {
          exportPlaylistM3U(id);
        }}
        onDelete={(pl) => {
          setPlaylistToDelete(pl);
        }}
      />
    </div>
  );
};
