import React, { useState, useEffect } from 'react';
import { Trash2, AlertTriangle, X, Music, HardDrive, Library } from 'lucide-react';
import { Track } from '../types';

interface DeleteTrackModalProps {
  track: Track | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (track: Track, deleteFromDisk: boolean) => void;
}

export const DeleteTrackModal: React.FC<DeleteTrackModalProps> = ({
  track,
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [deleteFromDisk, setDeleteFromDisk] = useState<boolean>(true);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !track) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200 select-none"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[#16151C] border border-[#292731] shadow-2xl p-6 space-y-5 animate-in zoom-in-95 duration-200 text-left"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-track-title"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#FF667A]/15 border border-[#FF667A]/30 flex items-center justify-center text-[#FF667A] shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 id="delete-track-title" className="text-base font-bold text-[#F4F2F7]">
                Delete Track?
              </h3>
              <p className="text-xs text-[#AAA6B2] mt-0.5">Choose how you want to remove this song</p>
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

        {/* Track Preview Card */}
        <div className="flex items-center gap-3.5 p-3 rounded-xl bg-[#100F14] border border-[#282631]">
          <div className="w-12 h-12 rounded-lg overflow-hidden bg-[#16151C] border border-white/10 shrink-0 flex items-center justify-center">
            {track.cover_art ? (
              <img src={track.cover_art} alt={track.title} className="w-full h-full object-cover" />
            ) : (
              <Music className="w-5 h-5 text-[#65616F]" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-[#F4F2F7] truncate">{track.title}</h4>
            <p className="text-xs text-[#AAA6B2] truncate mt-0.5">{track.artist}</p>
            <p className="text-[10px] text-[#65616F] truncate mt-0.5 font-mono">{track.file_path}</p>
          </div>
        </div>

        {/* Deletion Options */}
        <div className="space-y-2">
          <div
            onClick={() => setDeleteFromDisk(true)}
            className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
              deleteFromDisk
                ? 'bg-[#FF667A]/10 border-[#FF667A]/40 text-[#F4F2F7]'
                : 'bg-[#100F14] border-[#282631] text-[#AAA6B2] hover:bg-[#16151E]'
            }`}
          >
            <div className={`mt-0.5 p-1 rounded-lg ${deleteFromDisk ? 'bg-[#FF667A]/20 text-[#FF667A]' : 'text-[#65616F]'}`}>
              <HardDrive className="w-4 h-4" />
            </div>
            <div className="flex-1 text-xs">
              <div className="font-semibold flex items-center justify-between">
                <span>Delete file permanently from PC</span>
                <input
                  type="radio"
                  name="deleteType"
                  checked={deleteFromDisk}
                  onChange={() => setDeleteFromDisk(true)}
                  className="accent-[#FF667A] cursor-pointer"
                />
              </div>
              <p className="text-[11px] text-[#8E8A98] mt-0.5">
                Deletes the audio file from your hard drive and removes it from all playlists.
              </p>
            </div>
          </div>

          <div
            onClick={() => setDeleteFromDisk(false)}
            className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
              !deleteFromDisk
                ? 'bg-[#19E6A0]/10 border-[#19E6A0]/40 text-[#F4F2F7]'
                : 'bg-[#100F14] border-[#282631] text-[#AAA6B2] hover:bg-[#16151E]'
            }`}
          >
            <div className={`mt-0.5 p-1 rounded-lg ${!deleteFromDisk ? 'bg-[#19E6A0]/20 text-[#19E6A0]' : 'text-[#65616F]'}`}>
              <Library className="w-4 h-4" />
            </div>
            <div className="flex-1 text-xs">
              <div className="font-semibold flex items-center justify-between">
                <span>Remove from library & playlists only</span>
                <input
                  type="radio"
                  name="deleteType"
                  checked={!deleteFromDisk}
                  onChange={() => setDeleteFromDisk(false)}
                  className="accent-[#19E6A0] cursor-pointer"
                />
              </div>
              <p className="text-[11px] text-[#8E8A98] mt-0.5">
                Keeps the original audio file safe on your computer.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#292731]/40">
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
              onConfirm(track, deleteFromDisk);
              onClose();
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-[#FF667A] hover:bg-[#FF4D66] text-black shadow-lg shadow-[#FF667A]/20 transition-all active:scale-95 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{deleteFromDisk ? 'Delete File from Disk' : 'Remove Track'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
