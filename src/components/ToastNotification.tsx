import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Disc3 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { getTrackColor } from '../utils/helpers';

export const ToastNotification: React.FC = () => {
  const { toast } = usePlayer();

  const trackColor = toast ? getTrackColor(toast.title, toast.subtitle) : null;

  return (
    <div className="fixed top-11 right-6 z-50 pointer-events-none select-none">
      <AnimatePresence>
        {toast && trackColor && (
          <motion.div
            key={toast.title + toast.subtitle}
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.95 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col rounded-xl bg-[#16151C] border border-[#292731] shadow-2xl max-w-sm overflow-hidden"
          >
            <div className="flex items-center gap-3 px-3.5 py-2.5">
              <div className="w-9 h-9 rounded-md overflow-hidden shrink-0 border border-[#292731] bg-[#14131A]">
                {toast.cover ? (
                  <img src={toast.cover} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center font-bold text-xs"
                    style={{ background: trackColor.bg, color: trackColor.text }}
                  >
                    <Disc3 className="w-4 h-4 text-[#19E6A0]" />
                  </div>
                )}
              </div>

              <div className="flex flex-col min-w-0 pr-1">
                <span className="text-xs font-semibold text-[#F4F2F7] truncate">{toast.title}</span>
                <span className="text-[11px] text-[#777381] truncate">{toast.subtitle}</span>
              </div>
            </div>

            {/* Shrinking duration progress bar at the bottom */}
            <div className="w-full h-0.5 bg-white/5 overflow-hidden">
              <div className="h-full bg-[#19E6A0] animate-toast-progress" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
