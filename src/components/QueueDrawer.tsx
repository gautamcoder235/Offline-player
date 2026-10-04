import React from 'react';
import { ListOrdered, X, Trash2, Play, Disc3, ChevronUp, ChevronDown } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { getTrackColor } from '../utils/helpers';

interface QueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QueueDrawer: React.FC<QueueDrawerProps> = ({ isOpen, onClose }) => {
  const {
    currentTrack,
    queue,
    contextTracks,
    playTrack,
    playQueueTrack,
    addToQueue,
    removeFromQueue,
    moveQueueItem,
    clearQueue,
    isPlaying,
  } = usePlayer();

  // Upcoming tracks from the current album/playlist context
  const upcomingContextTracks = React.useMemo(() => {
    if (!currentTrack || contextTracks.length === 0) return [];
    const idx = contextTracks.findIndex((t) => t.id === currentTrack.id);
    if (idx !== -1) {
      return contextTracks.slice(idx + 1);
    }
    return contextTracks;
  }, [currentTrack, contextTracks]);

  return (
    <div
      className={`fixed inset-0 z-40 flex justify-end bg-black/70 backdrop-blur-sm select-none transition-opacity duration-300 ${
        isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      onClick={onClose}
    >
      <div
        className={`w-80 h-full bg-[#100F14] border-l border-[#292731] p-5 flex flex-col gap-4 shadow-2xl transform transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#292731]">
          <div className="flex items-center gap-2.5">
            <ListOrdered className="w-4 h-4 text-[#19E6A0]" />
            <h2 className="text-sm font-bold text-[#F4F2F7] tracking-tight">Play Queue</h2>
            <span className="px-2 py-0.5 rounded-full bg-[#16151C] text-[10px] text-[#AAA6B2] font-mono border border-[#292731]">
              {queue.length}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {queue.length > 0 && (
              <button
                onClick={clearQueue}
                className="p-1 text-[#777381] hover:text-[#FF667A] rounded transition-colors cursor-pointer"
                title="Clear queue"
                aria-label="Clear queue"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 text-[#777381] hover:text-[#F4F2F7] rounded transition-colors cursor-pointer"
              aria-label="Close queue drawer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Now Playing */}
        {currentTrack && (
          <div className="space-y-1.5 shrink-0">
            <span className="text-[10px] font-semibold text-[#777381] uppercase tracking-wider">
              Now Playing
            </span>
            <div className="p-2.5 rounded-xl bg-[#19181F] border-l-2 border-[#19E6A0] border-y border-r border-[#292731] flex items-center gap-3">
              <div className="w-10 h-10 rounded-md overflow-hidden shrink-0 border border-[#292731] bg-[#16151C]">
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
                <span className="text-xs font-semibold text-[#F4F2F7] truncate">
                  {currentTrack.title}
                </span>
                <span className="text-[11px] text-[#19E6A0] truncate">
                  {currentTrack.artist}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Scrollable Streams: User Queue + Context Queue */}
        <div className="flex-1 flex flex-col min-h-0 overflow-y-auto space-y-4 pr-1">
          {/* User Queue (Next Up) */}
          <div className="space-y-1">
            <span className="text-[10px] font-semibold text-[#777381] uppercase tracking-wider block mb-1">
              Next in Queue
            </span>

            {queue.length === 0 ? (
              <div className="py-4 text-center text-xs text-[#65616F] bg-[#141318]/50 rounded-lg border border-[#23212B] px-3">
                Queue is empty. Use ••• on any track to add to queue.
              </div>
            ) : (
              queue.map((track, idx) => {
                const trackColor = getTrackColor(track.title, track.artist);
                return (
                  <div
                    key={`${track.id}-${idx}`}
                    className="group flex items-center justify-between p-2 rounded-lg hover:bg-[#1D1C23] transition-colors duration-150 cursor-pointer"
                    onClick={() => playQueueTrack(idx)}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                      <div className="w-8 h-8 rounded-md overflow-hidden shrink-0 border border-[#292731] bg-[#16151C] relative">
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
                        <span className="text-xs font-medium text-[#F4F2F7] truncate group-hover:text-[#19E6A0] transition-colors duration-150">
                          {track.title}
                        </span>
                        <span className="text-[10px] text-[#777381] truncate">{track.artist}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-mono text-[#65616F] mr-0.5">
                        {track.duration_str}
                      </span>
                      <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        {idx > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              moveQueueItem(idx, idx - 1);
                            }}
                            className="p-0.5 text-[#777381] hover:text-[#19E6A0] rounded transition-colors cursor-pointer"
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
                            className="p-0.5 text-[#777381] hover:text-[#19E6A0] rounded transition-colors cursor-pointer"
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
                          className="p-0.5 text-[#777381] hover:text-[#FF667A] rounded transition-colors ml-0.5 cursor-pointer"
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

          {/* Context Queue (Next from Playlist) */}
          {upcomingContextTracks.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-[#23212B]">
              <span className="text-[10px] font-semibold text-[#777381] uppercase tracking-wider block mb-1">
                Next From Playlist
              </span>
              {upcomingContextTracks.slice(0, 20).map((track) => {
                const trackColor = getTrackColor(track.title, track.artist);
                return (
                  <div
                    key={`ctx-${track.id}`}
                    className="group flex items-center justify-between p-2 rounded-lg hover:bg-[#1D1C23] transition-colors duration-150 cursor-pointer"
                    onClick={() => playTrack(track)}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                      <div className="w-8 h-8 rounded-md overflow-hidden shrink-0 border border-[#292731] bg-[#16151C] relative">
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
                        <span className="text-xs font-medium text-[#F4F2F7] truncate group-hover:text-[#19E6A0] transition-colors duration-150">
                          {track.title}
                        </span>
                        <span className="text-[10px] text-[#777381] truncate">{track.artist}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <span className="text-[10px] font-mono text-[#65616F] mr-0.5">
                        {track.duration_str}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          addToQueue(track);
                        }}
                        className="p-1 opacity-0 group-hover:opacity-100 text-[#777381] hover:text-[#19E6A0] rounded transition-opacity cursor-pointer"
                        title="Add to queue"
                        aria-label="Add to queue"
                      >
                        <ListOrdered className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
