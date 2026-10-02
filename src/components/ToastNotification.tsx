import React from 'react';
import { Disc3 } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { getTrackColor } from '../utils/helpers';

export const ToastNotification: React.FC = () => {
  const { toast } = usePlayer();

  if (!toast) return null;

  const trackColor = getTrackColor(toast.title, toast.subtitle);

  return (
    <div className="fixed top-6 right-6 z-50 animate-in slide-in-from-top-4 fade-in duration-300 pointer-events-none select-none">
      <div className="flex items-center gap-3.5 px-4 py-3 rounded-2xl glass-panel-elevated bg-[#12131b]/95 border border-white/15 shadow-2xl max-w-sm">
        <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 border border-white/10 shadow">
          {toast.cover ? (
            <img src={toast.cover} alt="" className="w-full h-full object-cover" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center font-bold text-xs"
              style={{ background: trackColor.bg, color: trackColor.text }}
            >
              <Disc3 className="w-5 h-5 text-emerald-400" />
            </div>
          )}
        </div>

        <div className="flex flex-col min-w-0 pr-1">
          <span className="text-xs font-bold text-white truncate">{toast.title}</span>
          <span className="text-[11px] text-gray-400 truncate">{toast.subtitle}</span>
        </div>
      </div>
    </div>
  );
};
