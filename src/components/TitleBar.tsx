import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X } from 'lucide-react';

export function TitleBar() {
  const appWindow = getCurrentWindow();

  return (
    <div
      data-tauri-drag-region
      className="flex justify-between items-center w-full h-[36px] bg-[#0a0b0e]/80 backdrop-blur-xl border-b border-white/[0.06] select-none z-50 sticky top-0"
    >
      <div className="flex items-center gap-2 px-3 pointer-events-none text-white">
        <img src="/app-icon.png" alt="Offline Player" className="w-4 h-4 rounded-sm" />
        <span className="text-xs font-semibold tracking-wide">Offline Player</span>
      </div>

      <div className="flex h-full">
        <button
          aria-label="Minimize"
          className="flex items-center justify-center w-[46px] h-[36px] text-white/70 hover:bg-white/10 hover:text-white transition-colors duration-150 cursor-pointer"
          onClick={() => appWindow.minimize()}
        >
          <Minus className="w-4 h-4" />
        </button>
        <button
          aria-label="Maximize or Restore"
          className="flex items-center justify-center w-[46px] h-[36px] text-white/70 hover:bg-white/10 hover:text-white transition-colors duration-150 cursor-pointer"
          onClick={() => appWindow.toggleMaximize()}
        >
          <Square className="w-4 h-4" />
        </button>
        <button
          aria-label="Close"
          className="flex items-center justify-center w-[46px] h-[36px] text-white/70 hover:bg-red-500 hover:text-white transition-colors duration-150 cursor-pointer"
          onClick={() => appWindow.close()}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
