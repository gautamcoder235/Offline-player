import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Upload, Check, Music, Camera, Loader2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { Track } from '../types';

interface EditTrackTagsModalProps {
  track: Track | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updatedTrack: Track) => void;
}

const compressImage = (dataUrl: string, maxSize = 600): Promise<string> => {
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

export const EditTrackTagsModal: React.FC<EditTrackTagsModalProps> = ({
  track,
  isOpen,
  onClose,
  onSave,
}) => {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [year, setYear] = useState('');
  const [coverArt, setCoverArt] = useState<string | null>(null);
  const [hasNewCover, setHasNewCover] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (track) {
      setTitle(track.title || '');
      setArtist(track.artist || '');
      setAlbum(track.album || '');
      setYear(track.year ? track.year.toString() : '');
      setCoverArt(track.cover_art || null);
      setHasNewCover(false);
      setErrorMsg(null);
    }
  }, [track, isOpen]);

  const handleImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const raw = e.target?.result as string;
      if (raw) {
        const compressed = await compressImage(raw);
        setCoverArt(compressed);
        setHasNewCover(true);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!track) return;
    if (!title.trim()) {
      setErrorMsg('Track title cannot be empty.');
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);

    try {
      const yearNum = year.trim() ? parseInt(year.trim(), 10) : undefined;
      const updatedMetadata = await invoke<Track>('save_track_tags', {
        filePath: track.file_path,
        title: title.trim(),
        artist: artist.trim() || 'Unknown Artist',
        album: album.trim() || 'Unknown Album',
        year: !isNaN(yearNum as number) ? yearNum : null,
        coverArt: hasNewCover ? coverArt : null,
      });

      onSave(updatedMetadata);
      onClose();
    } catch (err: unknown) {
      console.error('Failed to save track tags:', err);
      setErrorMsg(typeof err === 'string' ? err : 'Failed to write ID3 tags to audio file.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !track || typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md select-none animate-in fade-in duration-200"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
        className="w-full max-w-lg bg-[#14131A] border border-[#2B2936] rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#24222E]">
          <div className="flex items-center gap-2.5">
            <Music className="w-4 h-4 text-[#19E6A0]" />
            <h2 className="text-sm font-bold text-[#F4F2F7]">Edit Track Tags & Artwork</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#777381] hover:text-[#F4F2F7] hover:bg-[#1E1D26] transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSave} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-[#FF667A]/15 border border-[#FF667A]/30 text-xs text-[#FF667A]">
              {errorMsg}
            </div>
          )}

          <div className="flex gap-5">
            {/* Cover Art Upload / Preview Tile */}
            <div className="flex flex-col items-center gap-2 shrink-0">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="group relative w-32 h-32 rounded-xl border-2 border-dashed border-[#2B2936] hover:border-[#19E6A0]/60 bg-[#1A1924] overflow-hidden flex items-center justify-center cursor-pointer transition-all duration-200 shadow-md"
                title="Click to replace album artwork"
              >
                {coverArt ? (
                  <img src={coverArt} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="flex flex-col items-center text-[#65616F] group-hover:text-[#19E6A0] transition-colors">
                    <Camera className="w-7 h-7 mb-1" />
                    <span className="text-[10px] font-medium">Add Artwork</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center text-white transition-opacity duration-200">
                  <Upload className="w-5 h-5 mb-1" />
                  <span className="text-[10px] font-semibold">Change Art</span>
                </div>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleImageFile(e.target.files[0]);
                  }
                }}
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] text-[#19E6A0] hover:underline cursor-pointer"
              >
                Choose Image...
              </button>
            </div>

            {/* Metadata Fields */}
            <div className="flex-1 space-y-3 min-w-0">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#777381] mb-1">
                  Track Title <span className="text-[#FF667A]">*</span>
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Bohemian Rhapsody"
                  required
                  className="w-full px-3 py-1.5 text-xs bg-[#1C1B24] border border-[#2B2936] rounded-xl text-[#F4F2F7] placeholder-[#65616F] focus:outline-none focus:border-[#19E6A0]/60 focus:ring-1 focus:ring-[#19E6A0]/40 transition-colors"
                />
              </div>

              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#777381] mb-1">
                  Artist
                </label>
                <input
                  type="text"
                  value={artist}
                  onChange={(e) => setArtist(e.target.value)}
                  placeholder="e.g. Queen"
                  className="w-full px-3 py-1.5 text-xs bg-[#1C1B24] border border-[#2B2936] rounded-xl text-[#F4F2F7] placeholder-[#65616F] focus:outline-none focus:border-[#19E6A0]/60 focus:ring-1 focus:ring-[#19E6A0]/40 transition-colors"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#777381] mb-1">
                    Album
                  </label>
                  <input
                    type="text"
                    value={album}
                    onChange={(e) => setAlbum(e.target.value)}
                    placeholder="e.g. A Night at the Opera"
                    className="w-full px-3 py-1.5 text-xs bg-[#1C1B24] border border-[#2B2936] rounded-xl text-[#F4F2F7] placeholder-[#65616F] focus:outline-none focus:border-[#19E6A0]/60 focus:ring-1 focus:ring-[#19E6A0]/40 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#777381] mb-1">
                    Year
                  </label>
                  <input
                    type="number"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    placeholder="1975"
                    className="w-full px-3 py-1.5 text-xs bg-[#1C1B24] border border-[#2B2936] rounded-xl text-[#F4F2F7] placeholder-[#65616F] focus:outline-none focus:border-[#19E6A0]/60 focus:ring-1 focus:ring-[#19E6A0]/40 transition-colors"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2 text-[10px] text-[#65616F] truncate" title={track.file_path}>
            File: <span className="font-mono text-[#777381]">{track.file_path}</span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#24222E]">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-xl text-xs font-medium text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#1C1B24] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#19E6A0] hover:bg-[#16CE8F] text-black text-xs font-semibold shadow-lg shadow-[#19E6A0]/20 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving Tags...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Save ID3 Tags</span>
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>,
    document.body
  );
};
