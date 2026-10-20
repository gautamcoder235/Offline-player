import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AnimatedSearch, AnimatedRefresh, AnimatedClose } from './icons';
import { usePlayer } from '../context/PlayerContext';

import { ViewMode } from '../types';

interface HeaderProps {
  filterType: 'all' | 'artists' | 'albums' | 'top';
  onFilterChange: (type: 'all' | 'artists' | 'albums' | 'top') => void;
  currentView?: ViewMode;
  onViewChange?: (view: ViewMode) => void;
}

export const Header: React.FC<HeaderProps> = ({
  filterType,
  onFilterChange,
  currentView,
  onViewChange,
}) => {
  const { searchQuery, setSearchQuery, refreshLibrary, tracks } = usePlayer();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshLibrary();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  return (
    <header className="h-14 px-4 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 bg-transparent select-none shrink-0 min-w-0 overflow-hidden">
      {/* Left: Search Bar & Filter Category Tabs (Grouped for responsive placement) */}
      <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 max-w-xl">
        <div className="group/search relative flex-1 min-w-[90px] sm:min-w-[140px] max-w-sm focus-within:max-w-md transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]">
          <AnimatedSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#777381] pointer-events-none group-hover/search:text-[#19E6A0] group-focus-within/search:text-[#19E6A0]" />
          <input
            id="global-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              if (
                e.target.value &&
                currentView &&
                ['lyrics', 'visualizer', 'settings', 'download', 'playlists', 'playlist_detail'].includes(currentView)
              ) {
                onViewChange?.('songs');
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                if (searchQuery) {
                  setSearchQuery('');
                } else {
                  (e.target as HTMLInputElement).blur();
                }
              }
            }}
            placeholder="Search tracks, artists, albums, or lyrics..."
            className="w-full pl-9 sm:pl-10 pr-14 sm:pr-16 py-2 rounded-xl text-xs bg-[#14131A] border border-[#282631]/80 text-[#F4F2F7] placeholder-[#65616F] focus:outline-none focus:border-[#19E6A0]/50 focus:ring-2 focus:ring-[#19E6A0]/10 transition-all duration-200 truncate"
          />
          <AnimatePresence>
            {searchQuery ? (
              <motion.button
                key="clear-search"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                onClick={() => setSearchQuery('')}
                className="group/clear absolute right-2.5 sm:right-3 top-1/2 -translate-y-1/2 text-[#777381] hover:text-[#F4F2F7] p-0.5 cursor-pointer transition-colors duration-200"
                aria-label="Clear search query"
              >
                <AnimatedClose className="w-3.5 h-3.5" />
              </motion.button>
            ) : (
              <motion.kbd
                key="kbd-shortcut"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="hidden sm:inline-flex items-center absolute right-2.5 sm:right-3 top-1/2 -translate-y-1/2 text-[10px] text-[#65616F] bg-[#1C1B23] border border-[#2D2A38] px-1.5 py-0.5 rounded font-mono pointer-events-none select-none"
              >
                Ctrl+K
              </motion.kbd>
            )}
          </AnimatePresence>
        </div>

        {/* Filter Category Tabs with sliding pill transition */}
        <div className="flex items-center gap-0.5 sm:gap-1 bg-[#14131A] p-0.5 rounded-xl border border-[#282631]/80 shrink-0 relative">
          {(['all', 'artists', 'albums', 'top'] as const).map((type) => {
            const isActive = filterType === type;
            return (
              <button
                key={type}
                onClick={() => onFilterChange(type)}
                className={`relative px-2.5 sm:px-3 py-1 rounded-lg text-[11px] font-medium capitalize transition-all duration-200 cursor-pointer whitespace-nowrap active:scale-[0.96] ${
                  isActive ? 'text-[#F4F2F7]' : 'text-[#9A96A5] hover:text-[#F4F2F7]'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="header-filter-pill"
                    className="absolute inset-0 bg-[#211F26] rounded-lg shadow-sm border border-white/[0.04]"
                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                  />
                )}
                <span className="relative z-10">{type === 'top' ? 'Top Tracks' : type}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Library Count & Rescan Action */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-[#777381] font-mono shrink-0">
          <span>{tracks.length} tracks</span>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="group flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-medium bg-[#16151C] hover:bg-[#1D1C23] border border-[#292731] text-[#9A96A5] hover:text-[#F4F2F7] transition-all duration-200 disabled:opacity-50 cursor-pointer shrink-0 active:scale-[0.96]"
          title="Rescan audio library"
        >
          <AnimatedRefresh isSpinning={isRefreshing} className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Rescan</span>
        </button>
      </div>
    </header>
  );
};
