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
    <header className="h-16 px-6 flex items-center justify-between gap-4 border-b border-white/5 glass-panel bg-black/20 z-10">
      {/* Search Bar */}
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by title, artist, or album..."
          className="w-full pl-10 pr-9 py-2 rounded-lg text-sm bg-white/5 hover:bg-white/10 focus:bg-white/10 border border-white/10 text-white placeholder-gray-400 focus:outline-none focus:border-emerald-500/50 transition-colors duration-150"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white p-0.5 cursor-pointer"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Filter Category Pills */}
      <div className="flex items-center gap-1.5 bg-white/5 p-1 rounded-lg border border-white/5">
        {(['all', 'artists', 'albums'] as const).map((type) => (
          <button
            key={type}
            onClick={() => onFilterChange(type)}
            className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors duration-150 cursor-pointer ${
              filterType === type
                ? 'bg-white/12 text-white'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {type}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 text-[11px] text-gray-400">
          <span>{tracks.length} offline tracks</span>
        </div>

        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 hover:text-white transition-colors duration-150 disabled:opacity-50 cursor-pointer"
          title="Rescan audio library"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
          <span className="hidden sm:inline">Rescan</span>
        </button>
      </div>
    </header>
  );
};
