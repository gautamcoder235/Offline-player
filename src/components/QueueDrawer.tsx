import React from 'react';
import { ListOrdered, X, Trash2, Play, Disc3, ChevronUp, ChevronDown } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { getTrackColor } from '../utils/helpers';

interface QueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QueueDrawer: React.FC<QueueDrawerProps> = ({ isOpen, onClose }) => {
  const { currentTrack, queue, playTrack, removeFromQueue, moveQueueItem, clearQueue, isPlaying } = usePlayer();

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end bg-black/60 backdrop-blur-sm select-none transition-opacity duration-200"
      onClick={onClose}
    >
      <div
        className="w-80 h-full glass-panel-elevated bg-[#111219]/95 border-l border-white/10 p-5 flex flex-col gap-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <ListOrdered className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="text-sm font-bold text-white tracking-wide">Play Queue</h2>
            <span className="px-2 py-0.5 rounded-full bg-white/10 text-[10px] text-gray-300 font-semibold">
              {queue.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {queue.length > 0 && (
              <button
                onClick={clearQueue}
                className="p-1.5 text-gray-400 hover:text-rose-400 rounded-lg transition-colors cursor-pointer"
                title="Clear queue"
                aria-label="Clear queue"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              aria-label="Close queue drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Now Playing */}
        {currentTrack && (
          <div className="space-y-1.5">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
              Now Playing
            </span>
            <div className="p-3 rounded-xl bg-[var(--accent-muted)] border border-[var(--accent)]/20 flex items-center gap-3">
              <div className="w-10 h-10 rounded-md overflow-hidden shrink-0 border border-white/10 shadow-sm">
                {currentTrack.cover_art ? (
                  <img src={currentTrack.cover_art} alt="" className="w-full h-full object-cover" />
                ) : (
                  (() => {
                    const curColor = getTrackColor(currentTrack.title, currentTrack.artist);
                    return (
                      <div
                        className="w-full h-full flex items-center justify-center font-bold text-xs"
                        style={{ background: curColor.bg, color: curColor.text }}
                      >
                        <Disc3 className={`w-5 h-5 ${isPlaying ? 'animate-spin' : ''}`} />
                      </div>
                    );
                  })()
                )}

              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-xs font-semibold text-white truncate">
                  {currentTrack.title}
                </span>
                <span className="text-[11px] text-[var(--accent)] truncate">
                  {currentTrack.artist}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Up Next List */}
        <div className="flex-1 flex flex-col min-h-0">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Next Up
          </span>

          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            {queue.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-500">
                Queue is empty. Right-click or use ••• on any track to add to queue.
              </div>
            ) : (
              queue.map((track, idx) => {
                const trackColor = getTrackColor(track.title, track.artist);
                return (
                  <div
                    key={`${track.id}-${idx}`}
                    className="group flex items-center justify-between p-2 rounded-xl hover:bg-white/5 transition-colors duration-150 cursor-pointer"
                    onClick={() => playTrack(track)}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                      <div className="w-8 h-8 rounded-md overflow-hidden shrink-0 border border-white/5 relative">
                        {track.cover_art ? (
                          <img src={track.cover_art} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div
                            className="w-full h-full flex items-center justify-center font-bold text-[9px]"
                            style={{ background: trackColor.bg, color: trackColor.text }}
                          >
                            <Disc3 className="w-4 h-4" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-black/40 hidden group-hover:flex items-center justify-center">
                          <Play className="w-3.5 h-3.5 text-white fill-current" />
                        </div>
                      </div>

                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-medium text-white truncate group-hover:text-[var(--accent)] transition-colors duration-150">
                          {track.title}
                        </span>
                        <span className="text-[10px] text-gray-400 truncate">{track.artist}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-mono text-gray-500 mr-0.5">
                        {track.duration_str}
                      </span>
                      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        {idx > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              moveQueueItem(idx, idx - 1);
                            }}
                            className="p-0.5 text-gray-400 hover:text-[var(--accent)] rounded transition-colors cursor-pointer"
                            title="Move track up"
                            aria-label="Move track up"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {idx < queue.length - 1 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              moveQueueItem(idx, idx + 1);
                            }}
                            className="p-0.5 text-gray-400 hover:text-[var(--accent)] rounded transition-colors cursor-pointer"
                            title="Move track down"
                            aria-label="Move track down"
                          >
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeFromQueue(idx);
                          }}
                          className="p-0.5 text-gray-400 hover:text-[var(--danger)] rounded transition-colors ml-0.5 cursor-pointer"
                          title="Remove from queue"
                          aria-label="Remove from queue"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
