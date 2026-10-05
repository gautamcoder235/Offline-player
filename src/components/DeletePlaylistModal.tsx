import React, { useEffect } from 'react';
import { AlertTriangle, Trash2, X, Music } from 'lucide-react';
import { Playlist, Track } from '../types';

interface DeletePlaylistModalProps {
  playlist: Playlist | null;
  isOpen: boolean;
  tracks?: Track[];
  onClose: () => void;
  onConfirm: (playlist: Playlist) => void;
}

export const DeletePlaylistModal: React.FC<DeletePlaylistModalProps> = ({
  playlist,
  isOpen,
  tracks = [],
  onClose,
  onConfirm,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !playlist) return null;

  // Resolve cover preview
  const playlistTracks = tracks.filter((t) => playlist.track_ids.includes(t.id));
  const coverArts = playlistTracks
    .map((t) => t.cover_art)
    .filter((c): c is string => Boolean(c));
  const uniqueCovers = Array.from(new Set(playlist.cover_art ? [playlist.cover_art, ...coverArts] : coverArts));

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[#16151C] border border-[#292731] shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-200 text-left"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-playlist-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FF667A]/15 border border-[#FF667A]/30 flex items-center justify-center text-[#FF667A] shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 id="delete-playlist-title" className="text-base font-bold text-[#F4F2F7]">
                Delete Playlist?
              </h3>
              <p className="text-xs text-[#AAA6B2] mt-0.5">This action cannot be undone.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#65616F] hover:text-[#F4F2F7] hover:bg-[#201F29] transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Playlist Card Preview */}
        <div className="flex items-center gap-3.5 p-3 rounded-xl bg-[#100F14] border border-[#282631]">
          <div className="w-12 h-12 rounded-lg overflow-hidden bg-[#16151C] border border-white/10 shrink-0 flex items-center justify-center">
            {playlist.cover_art ? (
              <img src={playlist.cover_art} alt={playlist.name} className="w-full h-full object-cover" />
            ) : uniqueCovers.length >= 4 ? (
              <div className="w-full h-full grid grid-cols-2 grid-rows-2">
                {uniqueCovers.slice(0, 4).map((art, i) => (
                  <img key={i} src={art} alt="" className="w-full h-full object-cover" />
                ))}
              </div>
            ) : uniqueCovers.length > 0 ? (
              <img src={uniqueCovers[0]} alt={playlist.name} className="w-full h-full object-cover" />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, ${playlist.coverColor || '#19E6A0'}25, #14131A)`,
                }}
              >
                <Music className="w-5 h-5" style={{ color: playlist.coverColor || '#19E6A0' }} />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-[#F4F2F7] truncate">{playlist.name}</h4>
            <p className="text-xs text-[#777381] mt-0.5">
              {playlist.track_ids.length} {playlist.track_ids.length === 1 ? 'song' : 'songs'} in collection
            </p>
          </div>
        </div>

        {/* Informative reassurance note */}
        <p className="text-xs text-[#8E8A98] leading-relaxed">
          Are you sure you want to delete <span className="text-[#F4F2F7] font-semibold">“{playlist.name}”</span>?
          The playlist will be removed from your library, but none of your local audio files on disk will be deleted.
        </p>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            autoFocus
            className="px-4 py-2 rounded-xl text-xs font-semibold text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#201F29] border border-[#282631] transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm(playlist);
              onClose();
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#FF667A] hover:bg-[#FF4D66] text-black shadow-lg shadow-[#FF667A]/20 transition-all active:scale-95 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete Playlist</span>
          </button>
        </div>
      </div>
    </div>
  );
};
