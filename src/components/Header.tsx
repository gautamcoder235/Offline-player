import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AnimatedSearch, AnimatedRefresh, AnimatedClose } from './icons';
import { usePlayer } from '../context/PlayerContext';
import { Globe } from 'lucide-react';
import { ViewMode } from '../types';

interface HeaderProps {
  filterType: 'all' | 'artists' | 'albums' | 'top' | 'online';
  onFilterChange: (type: 'all' | 'artists' | 'albums' | 'top' | 'online') => void;
  currentView?: ViewMode;
  onViewChange?: (view: ViewMode) => void;
}

export const Header: React.FC<HeaderProps> = ({
  filterType,
  onFilterChange,
  currentView,
  onViewChange,
}) => {
  const { searchQuery, setSearchQuery, refreshLibrary, themeAppearance } = usePlayer();
  const isGlass = themeAppearance === 'aura_glass';
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshLibrary();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const filterOptions = [
    { id: 'all', label: 'All' },
    { id: 'artists', label: 'Artists' },
    { id: 'albums', label: 'Albums' },
    { id: 'top', label: 'Top Tracks' },
    { id: 'online', label: 'Online' },
  ] as const;

  return (
    <header className={`h-[56px] px-4 sm:px-6 flex items-center justify-between gap-3 sm:gap-4 transition-colors duration-300 ${
      isGlass
        ? 'bg-transparent border-b border-white/[0.05]'
        : 'bg-[#0B0A10]/40 backdrop-blur-xl border-b border-white/[0.04]'
    } select-none shrink-0 min-w-0 overflow-hidden`}>
      {/* Left: Search Bar & Filter Category Tabs */}
      <div className="flex items-center gap-2.5 sm:gap-3 flex-1 min-w-0 max-w-2xl">
        {/* Search bar with standardized 34px height */}
        <div className="group/search relative flex-1 min-w-[120px] sm:min-w-[160px] max-w-xs sm:max-w-sm focus-within:max-w-md transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]">
          <div className="relative h-[34px] flex items-center bg-[#13111A]/80 hover:bg-[#161420]/90 focus-within:bg-[#161420] border border-white/[0.07] hover:border-white/[0.12] focus-within:border-[var(--accent)]/50 rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.25)] focus-within:ring-2 focus-within:ring-[var(--accent)]/15 transition-all duration-200">
            <AnimatedSearch className="absolute left-3 w-4 h-4 text-[#8E8A98] pointer-events-none group-hover/search:text-[var(--accent)] group-focus-within/search:text-[var(--accent)] transition-colors duration-200 shrink-0" />
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
                } else if (e.key === 'Enter' && searchQuery.trim() && currentView === 'online_search') {
                  e.currentTarget.blur();
                }
              }}
              placeholder="Search tracks, artists, albums, or lyrics..."
              className="w-full h-full pl-9 pr-14 sm:pr-16 text-xs font-medium text-[#F4F2F7] placeholder-[#65616F] bg-transparent outline-none truncate"
            />
            <AnimatePresence>
              {searchQuery ? (
                <motion.button
                  key="clear-search"
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.6, opacity: 0 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  onClick={() => setSearchQuery('')}
                  className="group/clear absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-[#8E8A98] hover:text-[#F4F2F7] hover:bg-white/[0.08] rounded-lg cursor-pointer transition-colors duration-150 active:scale-90"
                  aria-label="Clear search query"
                  title="Clear search"
                >
                  <AnimatedClose className="w-3.5 h-3.5" />
                </motion.button>
              ) : (
                <motion.kbd
                  key="kbd-shortcut"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="hidden sm:inline-flex items-center absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono font-medium text-[#8E8A98] bg-white/[0.04] border border-white/[0.08] px-1.5 py-0.5 rounded-md shadow-sm pointer-events-none select-none"
                >
                  Ctrl+K
                </motion.kbd>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Category Filter Tabs with standardized 34px container */}
        <div className="h-[34px] flex items-center gap-0.5 bg-[#13111A]/80 border border-white/[0.07] backdrop-blur-xl p-0.5 rounded-xl shadow-[0_2px_12px_rgba(0,0,0,0.25)] shrink-0 relative">
          {filterOptions.map((opt) => {
            const isActive = filterType === opt.id;
            const isOnline = opt.id === 'online';

            return (
              <button
                key={opt.id}
                onClick={() => onFilterChange(opt.id)}
                className={`relative h-[28px] px-2.5 sm:px-3 rounded-lg text-[11px] font-medium transition-colors duration-200 cursor-pointer whitespace-nowrap active:scale-[0.96] flex items-center gap-1.5 ${
                  isActive ? 'text-[#F4F2F7]' : 'text-[#8E8A98] hover:text-[#F4F2F7]'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="header-filter-pill"
                    className="absolute inset-0 bg-white/[0.08] rounded-lg border border-white/[0.08] shadow-[0_2px_8px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.08)] pointer-events-none"
                    transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                  />
                )}
                {isOnline && (
                  <Globe
                    className={`w-3.5 h-3.5 transition-colors ${
                      isActive ? 'text-[var(--accent)]' : 'text-[#8E8A98]'
                    }`}
                  />
                )}
                <span className="relative z-10">{opt.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right: Rescan Action */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="group flex items-center gap-1.5 h-[32px] px-3 rounded-lg text-xs font-medium text-[#8E8A98] hover:text-[#F4F2F7] hover:bg-white/[0.05] border border-white/[0.05] hover:border-white/[0.1] transition-all duration-150 disabled:opacity-50 cursor-pointer shrink-0 active:scale-95"
          title="Rescan audio library"
        >
          <AnimatedRefresh
            isSpinning={isRefreshing}
            className="w-3.5 h-3.5 group-hover:text-[var(--accent)] transition-colors"
          />
          <span className="hidden sm:inline">Rescan</span>
        </button>
      </div>
    </header>
  );
};
