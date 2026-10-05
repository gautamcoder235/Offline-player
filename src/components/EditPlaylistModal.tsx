import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, RotateCcw, Check, Music, Camera } from 'lucide-react';
import { Playlist, Track } from '../types';

interface EditPlaylistModalProps {
  playlist: Playlist | null;
  isOpen: boolean;
  tracks?: Track[];
  onClose: () => void;
  onSave: (
    playlistId: string,
    updates: {
      name: string;
      description?: string;
      coverColor?: string;
      cover_art?: string;
    }
  ) => void;
}

const PRESET_COLORS = [
  '#19E6A0', // Emerald Mint
  '#00F2FE', // Electric Cyan
  '#FF007F', // Neon Magenta
  '#9D4EDD', // Electric Purple
  '#E8C77A', // Champagne Gold
  '#FF7A00', // Sunset Coral
  '#3B82F6', // Cobalt Blue
  '#10B981', // Forest Emerald
];

// Compresses and scales image to a max 400x400 to prevent high-res images from bloating localStorage
const compressImage = (dataUrl: string, maxSize = 400): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > height) {
        if (width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      } else {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
};

export const EditPlaylistModal: React.FC<EditPlaylistModalProps> = ({
  playlist,
  isOpen,
  tracks = [],
  onClose,
  onSave,
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coverColor, setCoverColor] = useState(PRESET_COLORS[0]);
  const [coverArt, setCoverArt] = useState<string | undefined>(undefined);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (playlist && isOpen) {
      setName(playlist.name || '');
      setDescription(playlist.description || '');
      setCoverColor(playlist.coverColor || PRESET_COLORS[0]);
      setCoverArt(playlist.cover_art || undefined);
    }
  }, [playlist, isOpen]);

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

  // Find tracks belonging to this playlist
  const playlistTracks = tracks.filter((t) => playlist.track_ids.includes(t.id));
  const availableTrackCovers = Array.from(
    new Set(
      playlistTracks
        .map((t) => t.cover_art)
        .filter((art): art is string => Boolean(art))
    )
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (PNG, JPG, WebP).');
      return;
    }

    setIsProcessingImage(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        if (typeof reader.result === 'string') {
          const compressed = await compressImage(reader.result, 400);
          setCoverArt(compressed);
          setIsProcessingImage(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setIsProcessingImage(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSave(playlist.id, {
      name: name.trim(),
      description: description.trim() || undefined,
      coverColor,
      cover_art: coverArt || undefined,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200 select-none overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-[#16151C] border border-[#292731] shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-200 text-left my-8"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-playlist-title"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-1 border-b border-[#292731]/40">
          <div>
            <h3 id="edit-playlist-title" className="text-base font-bold text-[#F4F2F7]">
              Edit Playlist Details
            </h3>
            <p className="text-xs text-[#AAA6B2] mt-0.5">Customize cover image, name, and theme</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#65616F] hover:text-[#F4F2F7] hover:bg-[#201F29] transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Cover Image Section */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-[#AAA6B2] uppercase tracking-wider block">
              Playlist Artwork
            </label>

            <div className="flex flex-col sm:flex-row items-center gap-4 p-3.5 rounded-xl bg-[#100F14] border border-[#282631]">
              {/* Preview Thumbnail with clickable overlay */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="relative w-28 h-28 rounded-xl overflow-hidden bg-[#181720] border border-white/10 shrink-0 flex items-center justify-center cursor-pointer group shadow-md"
                title="Click to upload custom cover"
              >
                {coverArt ? (
                  <img src={coverArt} alt="Cover preview" className="w-full h-full object-cover" />
                ) : availableTrackCovers.length >= 4 ? (
                  <div className="w-full h-full grid grid-cols-2 grid-rows-2">
                    {availableTrackCovers.slice(0, 4).map((art, i) => (
                      <img key={i} src={art} alt="" className="w-full h-full object-cover" />
                    ))}
                  </div>
                ) : availableTrackCovers.length > 0 ? (
                  <img src={availableTrackCovers[0]} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center"
                    style={{
                      background: `linear-gradient(135deg, ${coverColor}33, #121118)`,
                    }}
                  >
                    <Music className="w-8 h-8" style={{ color: coverColor }} />
                  </div>
                )}

                {/* Hover overlay with camera icon */}
                <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-white">
                  <Camera className="w-5 h-5 text-[#19E6A0]" />
                  <span className="text-[10px] font-medium">Change Art</span>
                </div>

                {isProcessingImage && (
                  <div className="absolute inset-0 bg-black/75 flex items-center justify-center text-xs text-[#19E6A0]">
                    Processing...
                  </div>
                )}
              </div>

              {/* Upload & Reset Buttons */}
              <div className="flex-1 space-y-2 text-center sm:text-left min-w-0">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="image/*"
                  className="hidden"
                />

                <div className="flex flex-wrap items-center gap-2 justify-center sm:justify-start">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#201F29] hover:bg-[#282734] text-xs font-medium text-[#F4F2F7] border border-[#353342] transition-colors cursor-pointer active:scale-95"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#19E6A0]" />
                    <span>Upload Image</span>
                  </button>

                  {coverArt && (
                    <button
                      type="button"
                      onClick={() => setCoverArt(undefined)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#201F29] hover:bg-[#282734] text-xs font-medium text-[#AAA6B2] hover:text-[#FF667A] border border-[#353342] transition-colors cursor-pointer active:scale-95"
                      title="Revert to dynamic track collage"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Remove Custom Art</span>
                    </button>
                  )}
                </div>

                <p className="text-[11px] text-[#777381] leading-tight">
                  Supports JPG, PNG, and WebP. Automatically optimized for fast playback.
                </p>

                {/* Quick-pick from tracks inside the playlist */}
                {availableTrackCovers.length > 0 && (
                  <div className="pt-1">
                    <span className="text-[10px] text-[#AAA6B2] block mb-1">
                      Or pick from track albums:
                    </span>
                    <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
                      {availableTrackCovers.slice(0, 6).map((art, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setCoverArt(art)}
                          className={`w-7 h-7 rounded-md overflow-hidden border shrink-0 transition-all cursor-pointer ${
                            coverArt === art
                              ? 'border-[#19E6A0] scale-110 shadow-sm'
                              : 'border-white/10 opacity-70 hover:opacity-100 hover:scale-105'
                          }`}
                          title="Use this album artwork"
                        >
                          <img src={art} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Title Field */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-[#AAA6B2] uppercase tracking-wider block">
              Playlist Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Playlist title"
              className="w-full px-3.5 py-2 rounded-xl bg-[#100F14] border border-[#282631] text-xs text-[#F4F2F7] placeholder-[#65616F] focus:outline-none focus:border-[#19E6A0]/60 transition-colors"
            />
          </div>

          {/* Description Field */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-[#AAA6B2] uppercase tracking-wider block">
              Description (Optional)
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Give your playlist a mood or description..."
              className="w-full px-3.5 py-2 rounded-xl bg-[#100F14] border border-[#282631] text-xs text-[#F4F2F7] placeholder-[#65616F] focus:outline-none focus:border-[#19E6A0]/60 transition-colors resize-none"
            />
          </div>

          {/* Accent Color Palette */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-[#AAA6B2] uppercase tracking-wider block">
              Theme Accent Color
            </label>
            <div className="flex items-center gap-2.5 pt-1">
              {PRESET_COLORS.map((col) => (
                <button
                  key={col}
                  type="button"
                  onClick={() => setCoverColor(col)}
                  className={`w-6 h-6 rounded-full transition-transform duration-150 cursor-pointer flex items-center justify-center ${
                    coverColor === col ? 'scale-125 ring-2 ring-white shadow-md' : 'hover:scale-110 opacity-80'
                  }`}
                  style={{ backgroundColor: col }}
                  aria-label={`Select color ${col}`}
                >
                  {coverColor === col && <Check className="w-3 h-3 text-black stroke-[3]" />}
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#292731]/40">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#201F29] border border-[#282631] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-5 py-2 rounded-xl text-xs font-semibold bg-[#19E6A0] hover:bg-[#35F0B1] disabled:opacity-50 text-black shadow-lg shadow-[#19E6A0]/20 transition-all active:scale-95 cursor-pointer"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
