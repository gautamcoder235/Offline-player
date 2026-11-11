import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { AnimatedMinus, AnimatedSquare, AnimatedClose } from './icons';
import { usePlayer } from '../context/PlayerContext';

export function TitleBar() {
  const { themeAppearance } = usePlayer();
  const isGlass = themeAppearance === 'aura_glass';
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
    <header
      data-tauri-drag-region
      onMouseDown={handleStartDragging}
      onDoubleClick={handleToggleMaximize}
      className={`flex justify-between items-center w-full h-[40px] shrink-0 transition-colors duration-300 ${
        isGlass
          ? 'bg-[#07060A]/40 backdrop-blur-xl border-b border-white/[0.06]'
          : 'bg-[#07060A]/90 backdrop-blur-md border-b border-white/[0.05]'
      } select-none z-50 sticky top-0 cursor-default`}
    >
      {/* Draggable TitleBar Space */}
      <div
        data-tauri-drag-region
        onMouseDown={handleStartDragging}
        onDoubleClick={handleToggleMaximize}
        className="flex-1 h-full cursor-default"
      />

      {/* Right: Window Controls */}
      <div className="flex items-stretch h-full shrink-0">
        <button
          type="button"
          aria-label="Minimize window"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={handleMinimize}
          className="group flex items-center justify-center w-[46px] h-full text-[#9A96A5] hover:bg-white/[0.06] hover:text-[#F4F2F7] active:scale-95 transition-colors duration-150 cursor-pointer"
        >
          <AnimatedMinus className="w-3.5 h-3.5 pointer-events-none" />
        </button>
        <button
          type="button"
          aria-label="Maximize or Restore window"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={handleToggleMaximize}
          className="group flex items-center justify-center w-[46px] h-full text-[#9A96A5] hover:bg-white/[0.06] hover:text-[#F4F2F7] active:scale-95 transition-colors duration-150 cursor-pointer"
        >
          <AnimatedSquare className="w-3 h-3 pointer-events-none" />
        </button>
        <button
          type="button"
          aria-label="Close to background tray"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={handleClose}
          className="group flex items-center justify-center w-[46px] h-full text-[#9A96A5] hover:bg-[#E81123] hover:text-white active:scale-95 transition-colors duration-150 cursor-pointer"
        >
          <AnimatedClose className="w-3.5 h-3.5 pointer-events-none" />
        </button>
      </div>
    </header>
  );
}
