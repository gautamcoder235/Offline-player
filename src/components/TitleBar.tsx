import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Minus, Square, X } from 'lucide-react';

export function TitleBar() {
  const appWindow = getCurrentWindow();

  const handleMinimize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await invoke('app_minimize');
    } catch {
      try {
        await appWindow.minimize();
      } catch (err) {
        console.warn('minimize failed:', err);
      }
    }
  };

  const handleToggleMaximize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await invoke('app_toggle_maximize');
    } catch {
      try {
        await appWindow.toggleMaximize();
      } catch (err) {
        console.warn('toggleMaximize failed:', err);
      }
    }
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await invoke('app_close');
    } catch {
      try {
        await appWindow.close();
      } catch (err) {
        console.warn('close failed:', err);
      }
    }
  };

  const handleStartDragging = async (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    try {
      await appWindow.startDragging();
    } catch {
      try {
        await invoke('app_start_dragging');
      } catch (err) {
        console.warn('startDragging failed:', err);
      }
    }
  };

  return (
    <div
      data-tauri-drag-region
      onMouseDown={handleStartDragging}
      onDoubleClick={handleToggleMaximize}
      className="flex justify-between items-center w-full h-[40px] shrink-0 bg-[#0E0D12] select-none z-50 sticky top-0 cursor-default"
    >
      {/* Left: App Brand */}
      <div data-tauri-drag-region className="flex items-center gap-2 px-3.5 pointer-events-none shrink-0">
        <img
          src="/app-icon.png"
          alt="MusicVault"
          className="w-7 h-7 rounded-full object-contain shrink-0 drop-shadow-md select-none"
        />
        <span className="text-[13.5px] font-semibold text-[#F4F2F7] tracking-tight leading-none select-none">
          MusicVault
        </span>
        <span className="text-[11px] text-[#4B4854] select-none mx-0.5">•</span>
        <span className="text-[11.5px] font-medium text-[#777381] select-none tracking-normal">
          created by GAUTAM KUMAR
        </span>
      </div>

      {/* Middle Drag Spacer */}
      <div
        data-tauri-drag-region
        onMouseDown={handleStartDragging}
        onDoubleClick={handleToggleMaximize}
        className="flex-1 h-full cursor-default"
      />

      {/* Right: Window Controls */}
      <div className="flex h-full items-stretch">
        <button
          type="button"
          aria-label="Minimize window"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={handleMinimize}
          className="flex items-center justify-center w-[46px] h-full text-[#9A96A5] hover:bg-[#1D1C23] hover:text-[#F4F2F7] transition-colors duration-150 cursor-pointer"
        >
          <Minus className="w-3.5 h-3.5 pointer-events-none" />
        </button>
        <button
          type="button"
          aria-label="Maximize or Restore window"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={handleToggleMaximize}
          className="flex items-center justify-center w-[46px] h-full text-[#9A96A5] hover:bg-[#1D1C23] hover:text-[#F4F2F7] transition-colors duration-150 cursor-pointer"
        >
          <Square className="w-3 h-3 pointer-events-none" />
        </button>
        <button
          type="button"
          aria-label="Close to background tray"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={handleClose}
          className="flex items-center justify-center w-[46px] h-full text-[#9A96A5] hover:bg-[#FF667A] hover:text-white transition-colors duration-150 cursor-pointer"
        >
          <X className="w-3.5 h-3.5 pointer-events-none" />
        </button>
      </div>
    </div>
  );
}
