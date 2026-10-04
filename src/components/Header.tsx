import React, { useState } from 'react';
import { Search, RefreshCw, X } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';

interface HeaderProps {
  filterType: 'all' | 'artists' | 'albums';
  onFilterChange: (type: 'all' | 'artists' | 'albums') => void;
}

export const Header: React.FC<HeaderProps> = ({ filterType, onFilterChange }) => {
  const { searchQuery, setSearchQuery, refreshLibrary, tracks } = usePlayer();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refreshLibrary();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  return (
    <header className="h-14 px-6 flex items-center justify-between gap-4 border-b border-[#292731] bg-[#100F14]/90 backdrop-blur-md z-10 select-none">
      {/* 6. Precision Search Bar */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#777381] pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search tracks, artists, albums..."
          className="w-full pl-10 pr-9 py-2 rounded-lg text-xs bg-[#14131A] border border-[#282631] text-[#F4F2F7] placeholder-[#65616F] focus:outline-none focus:border-[#19E6A0]/50 focus:ring-2 focus:ring-[#19E6A0]/10 transition-colors duration-150"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#777381] hover:text-[#F4F2F7] p-0.5 cursor-pointer"
            aria-label="Clear search query"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Filter Category Tabs */}
      <div className="flex items-center gap-1 bg-[#14131A] p-0.5 rounded-lg border border-[#282631]">
        {(['all', 'artists', 'albums'] as const).map((type) => {
          const isActive = filterType === type;
          return (
            <button
              key={type}
              onClick={() => onFilterChange(type)}
              className={`px-3 py-1 rounded-md text-[11px] font-medium capitalize transition-colors duration-150 cursor-pointer ${
                isActive
                  ? 'bg-[#211F26] text-[#F4F2F7] shadow-sm'
                  : 'text-[#9A96A5] hover:text-[#F4F2F7] hover:bg-[#1D1C23]'
              }`}
            >
              {type}
            </button>
          );
        })}
      </div>

      {/* Right: Library Count & Rescan Action */}
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-[#777381] font-mono">
          <span>{tracks.length} tracks</span>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#16151C] hover:bg-[#1D1C23] border border-[#292731] text-[#9A96A5] hover:text-[#F4F2F7] transition-colors duration-150 disabled:opacity-50 cursor-pointer"
          title="Rescan audio library"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#19E6A0]' : ''}`} />
          <span className="hidden sm:inline">Rescan</span>
        </button>
      </div>
    </header>
  );
};
