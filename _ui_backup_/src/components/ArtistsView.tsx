import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Mic2, Play, Pause, ArrowLeft, ListPlus, Check } from 'lucide-react';
import { Track, ViewMode } from '../types';
import { usePlayer } from '../context/PlayerContext';
import { getTrackColor } from '../utils/helpers';
import { TrackList } from './TrackList';
import { groupTracksByArtist, ArtistGroup } from '../utils/artistUtils';

interface ArtistsViewProps {
  tracks: Track[];
  onSelectPlaylist?: (id: string | null) => void;
  onViewChange?: (view: ViewMode) => void;
}

export const ArtistsView: React.FC<ArtistsViewProps> = ({
  tracks,
  onSelectPlaylist,
  onViewChange,
}) => {
  const { currentTrack, isPlaying, playTrack, togglePlay, createPlaylist } = usePlayer();
  const [selectedArtistKey, setSelectedArtistKey] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'lead' | 'collab'>('all');
  const [createdFeedback, setCreatedFeedback] = useState(false);

  // Group tracks by artist name using robust multi-artist parsing & collaboration extraction
  const artists = useMemo(() => {
    return groupTracksByArtist(tracks);
  }, [tracks]);

  // Reactive lookup for the currently selected artist
  const selectedArtist: ArtistGroup | null = useMemo(() => {
    if (!selectedArtistKey) return null;
    return artists.find((a) => a.normalizedKey === selectedArtistKey) || null;
  }, [artists, selectedArtistKey]);

  // Tracks filtered by the selected tab (All vs Lead vs Collabs)
  const displayedTracks = useMemo(() => {
    if (!selectedArtist) return [];
    if (filterTab === 'lead') return selectedArtist.leadTracks;
    if (filterTab === 'collab') return selectedArtist.collabTracks;
    return selectedArtist.tracks;
  }, [selectedArtist, filterTab]);

  const handleCreatePlaylist = (artist: ArtistGroup) => {
    const artistColor = getTrackColor(artist.name, 'Artist');
    const trackIds = artist.tracks.map((t) => t.id);

    const newPl = createPlaylist(
      artist.name,
      `Complete collection of ${trackIds.length} songs including ${artist.name}`,
      trackIds,
      artistColor.bg
    );

    setCreatedFeedback(true);
    setTimeout(() => setCreatedFeedback(false), 2000);

    if (newPl?.id && onSelectPlaylist && onViewChange) {
      onSelectPlaylist(newPl.id);
      onViewChange('playlist_detail');
    }
  };

  // If viewing a drilled-down artist detail
  if (selectedArtist) {
    const hasCollabs = selectedArtist.collabTracks.length > 0;
    const isThisArtistPlaying =
      currentTrack &&
      selectedArtist.tracks.some((t) => t.id === currentTrack.id) &&
      isPlaying;

    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        {/* Top Action Bar */}
        <div className="p-4 sm:p-6 pb-2 flex flex-wrap items-center justify-between gap-3 shrink-0 border-b border-[#24222E]/60 bg-[#121118]/40 backdrop-blur-md z-10">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => {
                setSelectedArtistKey(null);
                setFilterTab('all');
              }}
              className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#16151D] hover:bg-[#201E29] text-xs font-medium text-[#AAA6B2] hover:text-[#F4F2F7] border border-[#2B2936] transition-colors cursor-pointer active:scale-95 shadow-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5 discord-icon discord-icon-prev" />
              <span>All Artists</span>
            </button>

            {/* Filter Tabs if artist has collaborations */}
            {hasCollabs && (
              <div className="flex items-center gap-1 bg-[#14131A] p-0.5 rounded-xl border border-[#272533]">
                <button
                  type="button"
                  onClick={() => setFilterTab('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    filterTab === 'all'
                      ? 'bg-[#19E6A0] text-black font-semibold shadow-sm'
                      : 'text-[#8E8A99] hover:text-[#F4F2F7]'
                  }`}
                >
                  All ({selectedArtist.tracks.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab('lead')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    filterTab === 'lead'
                      ? 'bg-[#19E6A0] text-black font-semibold shadow-sm'
                      : 'text-[#8E8A99] hover:text-[#F4F2F7]'
                  }`}
                >
                  Lead ({selectedArtist.leadTracks.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab('collab')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    filterTab === 'collab'
                      ? 'bg-[#19E6A0] text-black font-semibold shadow-sm'
                      : 'text-[#8E8A99] hover:text-[#F4F2F7]'
                  }`}
                >
                  Features ({selectedArtist.collabTracks.length})
                </button>
              </div>
            )}
          </div>

          {/* Action Buttons: Play Artist & Create Playlist */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (isThisArtistPlaying) {
                  togglePlay();
                } else if (selectedArtist.tracks.length > 0) {
                  playTrack(selectedArtist.tracks[0], selectedArtist.tracks, `artist_${selectedArtist.normalizedKey}`);
                }
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#19E6A0] hover:bg-[#16CE8F] text-black text-xs font-bold shadow-md transition-all active:scale-95 cursor-pointer"
            >
              {isThisArtistPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>Pause Artist</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  <span>Play Artist</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleCreatePlaylist(selectedArtist)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1E1D27] hover:bg-[#282635] text-[#F4F2F7] hover:text-[#19E6A0] border border-[#2D2B3B] hover:border-[#19E6A0]/40 text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer"
              title="Save all songs featuring this artist into a dedicated playlist"
            >
              {createdFeedback ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#19E6A0]" />
                  <span className="text-[#19E6A0]">Playlist Created!</span>
                </>
              ) : (
                <>
                  <ListPlus className="w-3.5 h-3.5 text-[#19E6A0]" />
                  <span>Save as Playlist</span>
                </>
              )}
            </button>
          </div>
        </div>

        <TrackList
          tracks={displayedTracks}
          title={selectedArtist.name}
          subtitle={`Artist • ${selectedArtist.tracks.length} songs${
            hasCollabs
              ? ` (${selectedArtist.leadTracks.length} lead, ${selectedArtist.collabTracks.length} features)`
              : ''
          } • ${selectedArtist.albumCount} albums`}
          coverArt={selectedArtist.coverArt || undefined}
          playlistId={`artist_${selectedArtist.normalizedKey}`}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 select-none">
      {/* Header */}
      <div className="flex items-end justify-between mb-6 pb-4 border-b border-[#24222E]">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#777381]">
            Library Collection
          </span>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#F4F2F7] tracking-tight">
            Artists
          </h1>
          <p className="text-xs text-[#777381] mt-0.5">
            {artists.length} artists in your offline music library (including collaborations & features)
          </p>
        </div>
      </div>

      {artists.length === 0 ? (
        <div className="py-20 text-center text-[#65616F]">
          <Mic2 className="w-12 h-12 mx-auto mb-3 text-[#4B4854] animate-pulse" />
          <p className="text-xs font-medium text-[#9A96A5]">No artists found</p>
          <p className="text-[11px] text-[#65616F] mt-1">Scan a folder with audio files to see your artists here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
          {artists.map((artist) => {
            const isThisArtistPlaying =
              currentTrack &&
              artist.tracks.some((t) => t.id === currentTrack.id) &&
              isPlaying;
            const artistColor = getTrackColor(artist.name, 'Artist');
            const hasFeatures = artist.collabTracks.length > 0;

            return (
              <motion.div
                key={artist.normalizedKey}
                whileHover={{ y: -4 }}
                transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
                onClick={() => {
                  setSelectedArtistKey(artist.normalizedKey);
                  setFilterTab('all');
                }}
                className="group p-4 rounded-2xl bg-[#14131A] hover:bg-[#1C1B25] border border-[#25232F] hover:border-[#333040] shadow-md transition-all duration-200 cursor-pointer flex flex-col items-center text-center gap-3 relative"
              >
                {/* Circular Artist Avatar Card */}
                <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden bg-[#181720] border-2 border-[#2A2836] group-hover:border-[#19E6A0]/50 relative shadow-lg transition-colors">
                  {artist.coverArt ? (
                    <img
                      src={artist.coverArt}
                      alt={artist.name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex flex-col items-center justify-center font-bold text-lg"
                      style={{ background: artistColor.bg, color: artistColor.text }}
                    >
                      <Mic2 className="w-8 h-8 opacity-75 mb-0.5" />
                      <span>{artist.name.charAt(0).toUpperCase()}</span>
                    </div>
                  )}

                  {/* Floating Action Buttons on Hover */}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2.5 transition-opacity duration-200 backdrop-blur-[2px]">
                    {/* Play Artist Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isThisArtistPlaying) {
                          togglePlay();
                        } else if (artist.tracks.length > 0) {
                          playTrack(artist.tracks[0], artist.tracks, `artist_${artist.normalizedKey}`);
                        }
                      }}
                      className="w-10 h-10 rounded-full bg-[#19E6A0] hover:bg-[#16CE8F] text-black shadow-xl flex items-center justify-center transition-transform hover:scale-110 active:scale-95 cursor-pointer"
                      title={isThisArtistPlaying ? 'Pause Artist' : 'Play Artist'}
                      aria-label={isThisArtistPlaying ? 'Pause Artist' : 'Play Artist'}
                    >
                      {isThisArtistPlaying ? (
                        <Pause className="w-4 h-4 fill-current discord-icon discord-icon-pop" />
                      ) : (
                        <Play className="w-4 h-4 fill-current ml-0.5 discord-icon discord-icon-pop" />
                      )}
                    </button>

                    {/* Quick Create Playlist Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCreatePlaylist(artist);
                      }}
                      className="w-9 h-9 rounded-full bg-[#1A1924] hover:bg-[#19E6A0] text-[#AAA6B2] hover:text-black border border-[#333142] hover:border-[#19E6A0] shadow-xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer"
                      title={`Create playlist from ${artist.name}`}
                      aria-label={`Create playlist from ${artist.name}`}
                    >
                      <ListPlus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Artist Info */}
                <div className="w-full min-w-0">
                  <h3 className="text-xs font-bold text-[#F4F2F7] group-hover:text-[#19E6A0] truncate transition-colors">
                    {artist.name}
                  </h3>
                  <p className="text-[11px] text-[#777381] mt-0.5 truncate">
                    {artist.tracks.length} song{artist.tracks.length === 1 ? '' : 's'}
                    {hasFeatures ? ` (${artist.collabTracks.length} feat.)` : ''}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};
