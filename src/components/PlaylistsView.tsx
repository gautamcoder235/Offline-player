import React, { useState } from 'react';
import {
  ListMusic,
  Plus,
  Play,
  Trash2,
  Heart,
  X,
  FolderPlus,
} from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { TrackList } from './TrackList';
import { ViewMode } from '../types';

interface PlaylistsViewProps {
  selectedPlaylistId: string | null;
  onSelectPlaylist: (id: string | null) => void;
  onViewChange?: (view: ViewMode) => void;
}

const PRESET_COLORS = [
  '#19E6A0', // Emerald Mint
  '#00F2FE', // Electric Cyan
  '#FF007F', // Neon Magenta
  '#9D4EDD', // Electric Purple
  '#E8C77A', // Champagne Gold
  '#FF7A00', // Sunset Coral
];

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
    deletePlaylist,
    playTrack,
  } = usePlayer();

  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createPlaylist(name.trim(), desc.trim() || undefined, [], selectedColor);
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
            className="text-[#19E6A0] underline ml-1 cursor-pointer"
          >
            Back to playlists
          </button>
        </div>
      );
    }

    const playlistTracks = tracks.filter((t) => selectedPlaylist.track_ids.includes(t.id));
    const coverArts = playlistTracks
      .map((t) => t.cover_art)
      .filter((c): c is string => !!c);
    const uniqueCovers = Array.from(new Set(coverArts));

    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0B0A0F]">
        <div className="p-6 md:p-8 flex items-end justify-between gap-6 bg-gradient-to-b from-[#181722]/80 via-[#100F14]/40 to-transparent border-b border-[#292731]/40 shrink-0 min-w-0">
          <div className="flex items-end gap-6 min-w-0 flex-1">
            <div className="w-32 h-32 md:w-36 md:h-36 rounded-2xl overflow-hidden bg-[#16151C] border border-[#292731]/60 flex items-center justify-center shadow-2xl shrink-0">
              {uniqueCovers.length >= 4 ? (
                <div className="w-full h-full grid grid-cols-2 grid-rows-2">
                  {uniqueCovers.slice(0, 4).map((art, i) => (
                    <img key={i} src={art} alt="" className="w-full h-full object-cover" />
                  ))}
                </div>
              ) : uniqueCovers.length > 0 ? (
                <img
                  src={uniqueCovers[0]}
                  alt={selectedPlaylist.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{
                    background: `linear-gradient(135deg, ${selectedPlaylist.coverColor || '#19E6A0'}22, #14131A)`,
                  }}
                >
                  <ListMusic
                    className="w-12 h-12"
                    style={{ color: selectedPlaylist.coverColor || '#19E6A0' }}
                  />
                </div>
              )}
            </div>
            <div className="space-y-1.5 min-w-0 flex-1 pb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#AAA6B2]">
                Playlist
              </span>
              <h1 className="text-2xl md:text-3xl font-extrabold text-[#F4F2F7] tracking-tight truncate">
                {selectedPlaylist.name}
              </h1>
              <p className="text-xs text-[#777381]">
                {selectedPlaylist.description || `${playlistTracks.length} tracks in this collection`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {playlistTracks.length > 0 && (
              <button
                onClick={() => playTrack(playlistTracks[0], playlistTracks)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#19E6A0] hover:bg-[#35F0B1] text-black font-semibold text-xs transition-all duration-200 shadow-lg cursor-pointer hover:scale-[1.03] active:scale-95"
              >
                <Play className="w-3.5 h-3.5 fill-black" />
                <span>Play All</span>
              </button>
            )}
            <button
              onClick={() => onSelectPlaylist(null)}
              className="px-3.5 py-2 rounded-xl bg-[#1D1C23] hover:bg-[#211F26] text-[#AAA6B2] hover:text-[#F4F2F7] text-xs font-medium border border-[#292731] transition-all duration-200 active:scale-95 cursor-pointer"
            >
              Back
            </button>
          </div>
        </div>

        <TrackList tracks={playlistTracks} />
      </div>
    );
  }

  // All Playlists Grid View
  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-y-auto px-8 py-7 select-none bg-[#0B0A0F]">
      {/* Top Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[#292731]/40 shrink-0 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-[#F4F2F7] tracking-tight">Your Playlists</h2>
            <span className="text-xs font-mono text-[#AAA6B2] bg-[#16151C] border border-[#282631] px-2.5 py-0.5 rounded-full">
              {playlists.length + 1} collections
            </span>
          </div>
          <p className="text-xs text-[#777381] mt-1">
            Personal collections and automatically saved Spotify downloads
          </p>
        </div>

        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#19E6A0] hover:bg-[#35F0B1] text-black font-semibold text-xs transition-all duration-200 shadow-lg hover:scale-[1.03] active:scale-95 cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Playlist</span>
        </button>
      </div>

      {/* Creation Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreate}
            className="p-5 rounded-2xl bg-[#16151C] border border-[#292731] w-full max-w-sm space-y-4 shadow-2xl animate-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#F4F2F7]">Create New Playlist</h3>
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="text-[#65616F] hover:text-[#F4F2F7] hover:bg-[#1C1B22] p-1 rounded-lg transition-all duration-200 active:scale-90 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-[#AAA6B2] uppercase tracking-wider">
                Title
              </label>
              <input
                type="text"
                placeholder="My Awesome Playlist"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                className="w-full px-3 py-2.5 rounded-xl bg-[#100F14] border border-[#282631] text-xs text-[#F4F2F7] placeholder-[#65616F] focus:outline-none focus:border-[#19E6A0]/50 transition-colors"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-[#AAA6B2] uppercase tracking-wider">
                Description (Optional)
              </label>
              <input
                type="text"
                placeholder="Chill tracks for coding..."
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[#100F14] border border-[#282631] text-xs text-[#F4F2F7] placeholder-[#65616F] focus:outline-none focus:border-[#19E6A0]/50 transition-colors"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[11px] font-semibold text-[#AAA6B2] uppercase tracking-wider">
                Accent Color
              </label>
              <div className="flex items-center gap-2 pt-1">
                {PRESET_COLORS.map((col) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setSelectedColor(col)}
                    className={`w-6 h-6 rounded-full transition-transform duration-200 cursor-pointer active:scale-90 ${
                      selectedColor === col ? 'scale-125 ring-2 ring-white' : 'hover:scale-110'
                    }`}
                    style={{ backgroundColor: col }}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-3.5 py-2 text-xs font-medium text-[#777381] hover:text-[#F4F2F7] hover:bg-[#1C1B22] transition-all duration-200 active:scale-95 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!name.trim()}
                className="px-4 py-2 rounded-xl bg-[#19E6A0] hover:bg-[#35F0B1] disabled:opacity-50 text-black font-semibold text-xs shadow-md transition-all duration-200 active:scale-95 cursor-pointer"
              >
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Grid: Liked Songs Hero Card + Custom Playlists */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
        {/* Special Hero Card: Liked Songs */}
        <div
          onClick={() => onViewChange?.('liked')}
          className="col-span-1 sm:col-span-2 p-5 rounded-2xl bg-gradient-to-br from-[#19E6A0]/25 via-[#351070]/30 to-[#14131A] border border-[#292731] hover:border-[#19E6A0]/50 transition-all duration-200 cursor-pointer group flex flex-col justify-between relative shadow-xl min-h-[180px] active:scale-[0.98]"
        >
          <div className="flex items-start justify-between">
            <div className="w-11 h-11 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg transition-transform duration-300 group-hover:scale-105">
              <Heart className="w-6 h-6 fill-[#19E6A0] text-[#19E6A0]" />
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#AAA6B2] bg-white/10 border border-white/10 px-2.5 py-0.5 rounded-full">
              Auto Playlist
            </span>
          </div>

          <div className="pr-12">
            <h3 className="text-xl font-black text-[#F4F2F7] tracking-tight group-hover:text-[#19E6A0] transition-colors duration-200">
              Liked Songs
            </h3>
            <p className="text-xs text-[#AAA6B2] mt-1 font-medium">
              {likedTrackIds.size} favorite songs
            </p>
          </div>

          {likedTracks.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                playTrack(likedTracks[0], likedTracks);
              }}
              className="absolute bottom-4 right-4 w-11 h-11 rounded-full bg-[#19E6A0] hover:bg-[#35F0B1] text-black shadow-2xl flex items-center justify-center transition-all duration-200 transform translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 hover:scale-[1.05] active:scale-95 cursor-pointer"
              title="Play Liked Songs"
            >
              <Play className="w-5 h-5 fill-black text-black ml-0.5" />
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
          const accentColor = pl.coverColor || '#19E6A0';

          return (
            <div
              key={pl.id}
              onClick={() => onSelectPlaylist(pl.id)}
              className="p-3.5 rounded-2xl bg-[#14131A] hover:bg-[#1B1A24] border border-[#282631] hover:border-[#383545] transition-all duration-200 cursor-pointer group flex flex-col gap-3 relative shadow-md hover:shadow-xl active:scale-[0.98]"
            >
              {/* Square Aspect Ratio Cover with 2x2 Collage or Artwork */}
              <div className="aspect-square w-full rounded-xl overflow-hidden shadow-md bg-[#0E0D14] relative border border-[#292731]/70 flex items-center justify-center transition-transform duration-300 group-hover:scale-[1.02]">
                {uniqueCovers.length >= 4 ? (
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
                      playTrack(playlistTracks[0], playlistTracks);
                    }}
                    className="absolute bottom-2.5 right-2.5 w-10 h-10 rounded-full bg-[#19E6A0] hover:bg-[#35F0B1] text-black shadow-2xl flex items-center justify-center transition-all duration-200 transform translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 hover:scale-[1.05] active:scale-95 cursor-pointer"
                    title={`Play ${pl.name}`}
                  >
                    <Play className="w-4 h-4 fill-black text-black ml-0.5" />
                  </button>
                )}
              </div>

              {/* Card Meta & Delete Action */}
              <div className="flex items-center justify-between min-w-0">
                <div className="min-w-0 flex-1 pr-1">
                  <h4 className="text-xs font-bold text-[#F4F2F7] truncate group-hover:text-[#19E6A0] transition-colors duration-200">
                    {pl.name}
                  </h4>
                  <span className="text-[11px] text-[#777381] font-mono mt-0.5 block">
                    {pl.track_ids.length} songs
                  </span>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deletePlaylist(pl.id);
                  }}
                  className="p-1.5 text-[#65616F] hover:text-[#FF667A] opacity-0 group-hover:opacity-100 transition-all duration-200 rounded-lg hover:bg-[#FF667A]/10 cursor-pointer active:scale-90"
                  title="Delete playlist"
                  aria-label="Delete playlist"
                >
                  <Trash2 className="w-3.5 h-3.5 transition-transform duration-200 hover:scale-110" />
                </button>
              </div>
            </div>
          );
        })}

        {/* Quick Create Card if Playlists are few */}
        {playlists.length < 3 && (
          <button
            onClick={() => setIsCreating(true)}
            className="p-3.5 rounded-2xl border-2 border-dashed border-[#282631] hover:border-[#19E6A0]/50 hover:bg-[#16151C]/50 transition-all duration-200 cursor-pointer flex flex-col items-center justify-center gap-3 text-[#65616F] hover:text-[#19E6A0] min-h-[180px] group active:scale-[0.98]"
          >
            <div className="w-10 h-10 rounded-xl bg-[#14131A] flex items-center justify-center border border-[#282631] group-hover:border-[#19E6A0]/40 transition-colors duration-200">
              <FolderPlus className="w-5 h-5 text-[#777381] group-hover:text-[#19E6A0] transition-transform duration-200 group-hover:scale-110" />
            </div>
            <span className="text-xs font-semibold">Create Playlist</span>
          </button>
        )}
      </div>
    </div>
  );
};
