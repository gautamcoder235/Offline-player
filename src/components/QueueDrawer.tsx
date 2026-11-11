import React from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, Reorder } from 'framer-motion';
import { ListOrdered, Play, Disc3, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { getTrackColor } from '../utils/helpers';
import { AnimatedTrash, AnimatedClose } from './icons';

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
    themeAppearance,
    reorderQueue,
    coverMap,
  } = usePlayer();
  const isGlass = themeAppearance === 'aura_glass';

  // Upcoming tracks from the current album/playlist context
  const upcomingContextTracks = React.useMemo(() => {
    if (!currentTrack || contextTracks.length === 0) return [];
    const idx = contextTracks.findIndex((t) => t.id === currentTrack.id);
    if (idx !== -1) {
      return contextTracks.slice(idx + 1);
    }
    return contextTracks;
  }, [currentTrack, contextTracks]);

  const drawerContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed top-[40px] inset-x-0 bottom-0 z-40 flex justify-end bg-black/70 backdrop-blur-sm select-none"
          onClick={onClose}
        >
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className={`w-80 h-full ${
              isGlass ? 'bg-[#0B0A11]/75 backdrop-blur-3xl border-l border-t border-white/[0.08]' : 'bg-[#0E0D14]/96 backdrop-blur-2xl border-l border-t border-white/[0.06]'
            } p-5 flex flex-col gap-4 shadow-2xl`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <ListOrdered className="w-4 h-4 text-[#19E6A0]" />
                <h2 className="text-sm font-bold text-[#F4F2F7] tracking-tight">Play Queue</h2>
                <span className="px-2 py-0.5 rounded-full bg-white/[0.04] text-[10px] text-[#AAA6B2] font-mono border border-white/[0.08]">
                  {queue.length}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {queue.length > 0 && (
                  <button
                    onClick={clearQueue}
                    className="group/clear p-1 text-[#777381] hover:text-[#FF667A] hover:bg-white/[0.08] rounded transition-all duration-150 active:scale-90 cursor-pointer"
                    title="Clear queue"
                    aria-label="Clear queue"
                  >
                    <AnimatedTrash className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="group/close p-1 text-[#777381] hover:text-[#F4F2F7] hover:bg-white/[0.08] rounded transition-all duration-150 active:scale-90 cursor-pointer"
                  aria-label="Close queue drawer"
                >
                  <AnimatedClose className="w-4 h-4" />
                </button>
              </div>
            </div>

        {/* Now Playing */}
        {currentTrack && (
          <div className="space-y-1.5 shrink-0">
            <span className="text-[10px] font-semibold text-[#777381] uppercase tracking-wider">
              Now Playing
            </span>
            <div className="p-2.5 rounded-xl bg-[#13111C] border-l-2 border-[#19E6A0] border-y border-r border-white/[0.07] flex items-center gap-3 shadow-md">
              <div className="w-10 h-10 rounded-md overflow-hidden shrink-0 border border-white/[0.08] bg-[#07060A]">
                {(() => {
                  const nowCover = coverMap[currentTrack.id] || currentTrack.cover_art;
                  return nowCover ? (
                    <img src={nowCover} alt="" className="w-full h-full object-cover" />
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
                  );
                })()}
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
              <Reorder.Group axis="y" values={queue} onReorder={reorderQueue} className="space-y-1">
                {queue.map((track, idx) => {
                  const trackColor = getTrackColor(track.title, track.artist);
                  const itemKey = track.queueId || `${track.id}-${idx}`;
                  return (
                    <Reorder.Item
                      key={itemKey}
                      value={track}
                      className="group flex items-center justify-between p-2 rounded-lg hover:bg-[#1D1C23] active:bg-[#25242E] transition-colors duration-150 cursor-grab active:cursor-grabbing select-none"
                      onClick={() => playQueueTrack(idx)}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                        <GripVertical className="w-3.5 h-3.5 text-[#4B4854] group-hover:text-[#777381] shrink-0 discord-icon group-hover:scale-110" />
                        <div className="w-8 h-8 rounded-md overflow-hidden shrink-0 border border-white/[0.08] bg-[#07060A] relative pointer-events-none">
                          {(() => {
                            const qCover = coverMap[track.id] || track.cover_art;
                            return qCover ? (
                              <img src={qCover} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div
                                className="w-full h-full flex items-center justify-center font-bold text-[9px]"
                                style={{ background: trackColor.bg, color: trackColor.text }}
                              >
                                <Disc3 className="w-4 h-4" />
                              </div>
                            );
                          })()}
                          <div className="absolute inset-0 bg-black/40 hidden group-hover:flex items-center justify-center">
                            <Play className="w-3.5 h-3.5 text-white fill-current discord-icon discord-icon-pop" />
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
                        <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          {idx > 0 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                moveQueueItem(idx, idx - 1);
                              }}
                              className="group/up p-1 text-[#777381] hover:text-[#19E6A0] hover:bg-white/[0.08] rounded transition-all duration-200 active:scale-90 cursor-pointer"
                              title="Move track up"
                              aria-label="Move track up"
                            >
                              <ChevronUp className="w-3.5 h-3.5 discord-icon discord-icon-pop" />
                            </button>
                          )}
                          {idx < queue.length - 1 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                moveQueueItem(idx, idx + 1);
                              }}
                              className="group/down p-1 text-[#777381] hover:text-[#19E6A0] hover:bg-white/[0.08] rounded transition-all duration-200 active:scale-90 cursor-pointer"
                              title="Move track down"
                              aria-label="Move track down"
                            >
                              <ChevronDown className="w-3.5 h-3.5 discord-icon discord-icon-pop" />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFromQueue(idx);
                            }}
                            className="group/del p-1 text-[#777381] hover:text-[#FF667A] hover:bg-white/[0.08] rounded transition-all duration-200 active:scale-90 ml-0.5 cursor-pointer"
                            title="Remove from queue"
                            aria-label="Remove from queue"
                          >
                            <AnimatedTrash className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </Reorder.Item>
                  );
                })}
              </Reorder.Group>
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
                      <div className="w-8 h-8 rounded-md overflow-hidden shrink-0 border border-white/[0.08] bg-[#07060A] relative">
                        {(() => {
                          const upCover = coverMap[track.id] || track.cover_art;
                          return upCover ? (
                            <img src={upCover} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div
                              className="w-full h-full flex items-center justify-center font-bold text-[9px]"
                              style={{ background: trackColor.bg, color: trackColor.text }}
                            >
                              <Disc3 className="w-4 h-4" />
                            </div>
                          );
                        })()}
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
                        className="group/add p-1 opacity-0 group-hover:opacity-100 text-[#777381] hover:text-[#19E6A0] hover:bg-white/[0.08] rounded transition-all duration-200 active:scale-90 cursor-pointer"
                        title="Add to queue"
                        aria-label="Add to queue"
                      >
                        <ListOrdered className="w-3.5 h-3.5 discord-icon discord-icon-pop" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(drawerContent, document.body) : null;
};
