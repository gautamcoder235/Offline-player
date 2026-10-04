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

    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="p-8 flex items-end justify-between gap-6 bg-gradient-to-b from-[#16151C]/60 via-transparent to-transparent border-b border-[#292731]">
          <div className="flex items-end gap-6">
            <div className="w-32 h-32 rounded-xl bg-[#16151C] border border-[#292731] flex items-center justify-center shadow-lg shrink-0">
              <ListMusic className="w-12 h-12 text-[#E8C77A]" />
            </div>
            <div className="space-y-1.5">
              <span className="text-[10px] uppercase tracking-wider font-bold text-[#E8C77A]">
                Custom Playlist
              </span>
              <h1 className="text-2xl font-bold text-[#F4F2F7] tracking-tight">
                {selectedPlaylist.name}
              </h1>
              <p className="text-xs text-[#9A96A5]">
                {selectedPlaylist.description || `${playlistTracks.length} tracks in this collection`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {playlistTracks.length > 0 && (
              <button
                onClick={() => playTrack(playlistTracks[0], playlistTracks)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#19E6A0] hover:bg-[#35F0B1] text-black font-semibold text-xs transition-colors duration-150 shadow cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-black" />
                <span>Play All</span>
              </button>
            )}
            <button
              onClick={() => onSelectPlaylist(null)}
              className="px-3.5 py-2 rounded-lg bg-[#1D1C23] hover:bg-[#211F26] text-[#AAA6B2] hover:text-[#F4F2F7] text-xs font-medium border border-[#292731] transition-colors duration-150 cursor-pointer"
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
    <div className="flex-1 overflow-y-auto px-8 py-6 select-none max-w-6xl mx-auto w-full space-y-5">
      <div className="flex items-center justify-between pb-3 border-b border-[#292731]">
        <div>
          <h2 className="text-xl font-bold text-[#F4F2F7] tracking-tight">Your Playlists</h2>
          <p className="text-xs text-[#9A96A5] mt-0.5">Organize your offline songs into custom collections</p>
        </div>

        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#19E6A0] hover:bg-[#35F0B1] text-black font-semibold text-xs transition-colors duration-150 shadow cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>New Playlist</span>
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="p-4 rounded-xl bg-[#16151C] border border-[#292731] max-w-md space-y-2.5 shadow-md">
          <h3 className="text-xs font-bold text-[#F4F2F7]">Create New Playlist</h3>
          <input
            type="text"
            placeholder="Playlist Title"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className="w-full px-3 py-2 rounded-lg bg-[#14131A] border border-[#282631] text-xs text-[#F4F2F7] placeholder-[#65616F] focus:outline-none focus:border-[#19E6A0]/50"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-[#14131A] border border-[#282631] text-xs text-[#F4F2F7] placeholder-[#65616F] focus:outline-none focus:border-[#19E6A0]/50"
          />
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-3 py-1.5 text-xs text-[#777381] hover:text-[#F4F2F7] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3.5 py-1.5 rounded-lg bg-[#19E6A0] hover:bg-[#35F0B1] text-black font-semibold text-xs cursor-pointer"
            >
              Save
            </button>
          </div>
        </form>
      )}

      {playlists.length === 0 ? (
        <div className="py-20 text-center text-[#65616F]">
          <ListMusic className="w-10 h-10 mx-auto mb-2 text-[#4B4854]" />
          <p className="text-xs font-medium text-[#9A96A5]">No playlists created yet</p>
          <p className="text-[11px] text-[#65616F] mt-1">Click &quot;New Playlist&quot; to build your first collection.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
          {playlists.map((pl) => (
            <div
              key={pl.id}
              onClick={() => onSelectPlaylist(pl.id)}
              className="group p-3.5 rounded-xl bg-[#16151C] hover:bg-[#1D1C23] border border-[#292731] hover:border-[#19E6A0]/30 cursor-pointer flex flex-col justify-between h-44 relative transition-colors duration-150"
            >
              <div className="w-full h-24 rounded-lg bg-[#14131A] border border-[#282631] flex items-center justify-center">
                <ListMusic className="w-8 h-8 text-[#E8C77A]" />
              </div>

              <div className="pt-2 flex items-center justify-between">
                <div className="min-w-0 flex-1 pr-2">
                  <h4 className="text-xs font-semibold text-[#F4F2F7] truncate">{pl.name}</h4>
                  <span className="text-[10px] text-[#777381] font-mono">{pl.track_ids.length} songs</span>
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deletePlaylist(pl.id);
                  }}
                  className="p-1 text-[#65616F] hover:text-[#FF667A] opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  title="Delete playlist"
                  aria-label="Delete playlist"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
