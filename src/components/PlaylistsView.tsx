import React, { useState } from 'react';
import { ListMusic, Plus, Play, Trash2 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { TrackList } from './TrackList';

interface PlaylistsViewProps {
  selectedPlaylistId: string | null;
  onSelectPlaylist: (id: string | null) => void;
}

export const PlaylistsView: React.FC<PlaylistsViewProps> = ({
  selectedPlaylistId,
  onSelectPlaylist,
}) => {
  const { playlists, tracks, createPlaylist, deletePlaylist, playTrack } = usePlayer();
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    createPlaylist(name.trim(), desc.trim() || undefined);
    setName('');
    setDesc('');
    setIsCreating(false);
  };

  // If a playlist is selected, show detail view
  if (selectedPlaylistId) {
    const selectedPlaylist = playlists.find((p) => p.id === selectedPlaylistId);
    if (!selectedPlaylist) {
      return (
        <div className="flex-1 p-8 text-center text-gray-500">
          Playlist not found.{' '}
          <button
            onClick={() => onSelectPlaylist(null)}
            className="text-emerald-400 underline ml-1"
          >
            Back to playlists
          </button>
        </div>
      );
    }

    const playlistTracks = tracks.filter((t) => selectedPlaylist.track_ids.includes(t.id));

    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="p-8 flex items-end justify-between gap-6 bg-gradient-to-b from-purple-950/40 via-transparent to-transparent border-b border-white/5">
          <div className="flex items-end gap-6">
            <div className="w-36 h-36 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-800 flex items-center justify-center shadow-2xl border border-white/10 shrink-0">
              <ListMusic className="w-16 h-16 text-white/90" />
            </div>
            <div className="space-y-2">
              <span className="text-xs uppercase tracking-wider font-bold text-purple-400">
                Custom Playlist
              </span>
              <h1 className="text-3xl font-extrabold text-white tracking-tight">
                {selectedPlaylist.name}
              </h1>
              <p className="text-xs text-gray-400">
                {selectedPlaylist.description || `${playlistTracks.length} tracks in this playlist`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {playlistTracks.length > 0 && (
              <button
                onClick={() => playTrack(playlistTracks[0], playlistTracks)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-all shadow-lg shadow-emerald-500/20"
              >
                <Play className="w-4 h-4 fill-black" />
                <span>Play All</span>
              </button>
            )}
            <button
              onClick={() => onSelectPlaylist(null)}
              className="px-4 py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-semibold border border-white/10 transition-all"
            >
              Back
            </button>
          </div>
        </div>

        <TrackList tracks={playlistTracks} />
      </div>
    );
  }

  // All Playlists Grid
  return (
    <div className="flex-1 overflow-y-auto px-8 py-8 select-none max-w-6xl mx-auto w-full space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-white/5">
        <div>
          <h2 className="text-2xl font-black text-white tracking-tight">Your Playlists</h2>
          <p className="text-xs text-gray-400 mt-1">Organize your offline songs into custom collections</p>
        </div>

        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs transition-all shadow-lg shadow-emerald-500/20"
        >
          <Plus className="w-4 h-4" />
          <span>New Playlist</span>
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-6 rounded-3xl glass-panel bg-black/40 border border-white/10 max-w-md space-y-3">
          <h3 className="text-sm font-bold text-white">Create New Playlist</h3>
          <input
            type="text"
            placeholder="Playlist Title"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="w-full px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500"
          />
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-3 py-1.5 text-xs text-gray-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs"
            >
              Save
            </button>
          </div>
        </form>
      )}

      {playlists.length === 0 ? (
        <div className="py-24 text-center text-gray-500">
          <ListMusic className="w-12 h-12 mx-auto mb-3 text-gray-600" />
          <p className="text-sm font-medium">No playlists created yet</p>
          <p className="text-xs text-gray-600 mt-1">Click &quot;New Playlist&quot; to build your first collection.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {playlists.map((pl) => (
            <div
              key={pl.id}
              onClick={() => onSelectPlaylist(pl.id)}
              className="group glass-card p-4 rounded-2xl cursor-pointer flex flex-col justify-between h-48 relative overflow-hidden"
            >
              <div className="w-full h-24 rounded-xl bg-gradient-to-br from-indigo-900/60 to-purple-900/60 flex items-center justify-center border border-white/5 group-hover:scale-102 transition-transform">
                <ListMusic className="w-8 h-8 text-white/80" />
              </div>

              <div className="pt-2 flex items-center justify-between">
                <div className="min-w-0 flex-1 pr-2">
                  <h4 className="text-sm font-semibold text-white truncate">{pl.name}</h4>
                  <span className="text-[11px] text-gray-400">{pl.track_ids.length} songs</span>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deletePlaylist(pl.id);
                  }}
                  className="p-1.5 text-gray-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Delete playlist"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
