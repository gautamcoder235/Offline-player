import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Disc3, Play, Pause, ArrowLeft, ListPlus, Check } from 'lucide-react';
import { Track, ViewMode } from '../types';
import { usePlayer } from '../context/PlayerContext';
import { getTrackColor } from '../utils/helpers';
import { TrackList } from './TrackList';
import { groupTracksIntoAlbums, AlbumGroup } from '../utils/albumUtils';

interface AlbumsViewProps {
  tracks: Track[];
  onSelectPlaylist?: (id: string | null) => void;
  onViewChange?: (view: ViewMode) => void;
}

export const AlbumsView: React.FC<AlbumsViewProps> = ({
  tracks,
  onSelectPlaylist,
  onViewChange,
}) => {
  const { currentTrack, isPlaying, playTrack, togglePlay, createPlaylist, playingPlaylistId } = usePlayer();
  const [selectedAlbumKey, setSelectedAlbumKey] = useState<string | null>(() => {
    if (playingPlaylistId && playingPlaylistId.startsWith('album_')) {
      return playingPlaylistId.replace('album_', '');
    }
    return null;
  });
  const [createdFeedback, setCreatedFeedback] = useState(false);

  // Intelligently group tracks into cohesive albums (soundtracks & compilations unified, junk emoji resolved)
  const albums = useMemo(() => {
    return groupTracksIntoAlbums(tracks);
  }, [tracks]);

  // Synchronize when locate-current-track is triggered
  React.useEffect(() => {
    const handleLocate = (e: Event) => {
      const customEvent = e as CustomEvent<{ track: Track }>;
      const track = customEvent.detail?.track || currentTrack;
      if (!track) return;
      if (playingPlaylistId && playingPlaylistId.startsWith('album_')) {
        setSelectedAlbumKey(playingPlaylistId.replace('album_', ''));
      } else if (track.album) {
        const found = albums.find(
          (a) => a.tracks.some((t) => t.id === track.id) || a.name.toLowerCase() === track.album.toLowerCase()
        );
        if (found) setSelectedAlbumKey(found.key);
      }
    };
    window.addEventListener('locate-current-track', handleLocate);
    return () => window.removeEventListener('locate-current-track', handleLocate);
  }, [albums, currentTrack, playingPlaylistId]);

  const selectedAlbum = useMemo(() => {
    if (!selectedAlbumKey) return null;
    return albums.find((a) => a.key === selectedAlbumKey) || null;
  }, [albums, selectedAlbumKey]);

  const handleCreatePlaylist = (album: AlbumGroup) => {
    const albumColor = getTrackColor(album.name, album.artist);
    const trackIds = album.tracks.map((t) => t.id);

    const newPl = createPlaylist(
      album.name,
      `Album by ${album.artist} • ${trackIds.length} tracks`,
      trackIds,
      albumColor.bg
    );

    setCreatedFeedback(true);
    setTimeout(() => setCreatedFeedback(false), 2000);

    if (newPl?.id && onSelectPlaylist && onViewChange) {
      onSelectPlaylist(newPl.id);
      onViewChange('playlist_detail');
    }
  };

  // If viewing a drilled-down album detail
  if (selectedAlbum) {
    const isThisAlbumPlaying =
      currentTrack &&
      selectedAlbum.tracks.some((t) => t.id === currentTrack.id) &&
      isPlaying;

    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        {/* Top Action Bar */}
        <div className="p-4 sm:p-6 pb-2 flex flex-wrap items-center justify-between gap-3 shrink-0 border-b border-[#24222E]/60 bg-[#121118]/40 backdrop-blur-md z-10">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setSelectedAlbumKey(null)}
              className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#16151D] hover:bg-[#201E29] text-xs font-medium text-[#AAA6B2] hover:text-[#F4F2F7] border border-[#2B2936] transition-colors cursor-pointer active:scale-95 shadow-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5 discord-icon discord-icon-prev" />
              <span>All Albums</span>
            </button>
          </div>

          {/* Action Buttons: Play Album & Save as Playlist */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (isThisAlbumPlaying) {
                  togglePlay();
                } else if (selectedAlbum.tracks.length > 0) {
                  playTrack(selectedAlbum.tracks[0], selectedAlbum.tracks, `album_${selectedAlbum.key}`);
                }
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-[#19E6A0] hover:bg-[#16CE8F] text-black text-xs font-bold shadow-md transition-all active:scale-95 cursor-pointer"
            >
              {isThisAlbumPlaying ? (
                <>
                  <Pause className="w-3.5 h-3.5 fill-current" />
                  <span>Pause Album</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  <span>Play Album</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleCreatePlaylist(selectedAlbum)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#1E1D27] hover:bg-[#282635] text-[#F4F2F7] hover:text-[#19E6A0] border border-[#2D2B3B] hover:border-[#19E6A0]/40 text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer"
              title="Save this album into your playlists"
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
          tracks={selectedAlbum.tracks}
          title={selectedAlbum.name}
          subtitle={`${selectedAlbum.artist}${selectedAlbum.year ? ` • ${selectedAlbum.year}` : ''} • ${selectedAlbum.tracks.length} tracks${
            selectedAlbum.isCompilation ? ' • Compilation' : ''
          }`}
          coverArt={selectedAlbum.coverArt || undefined}
          playlistId={`album_${selectedAlbum.key}`}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 md:p-8 select-none">
      {/* Header */}
      <div className="flex items-end justify-between mb-6 pb-4 border-b border-white/[0.06]">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[#F4F2F7] tracking-tight">
            Albums
          </h1>
          <p className="text-xs text-[#777381] mt-0.5">
            {albums.length} {albums.length === 1 ? 'album' : 'albums'} • {tracks.length} {tracks.length === 1 ? 'song' : 'songs'}
          </p>
        </div>
      </div>

      {albums.length === 0 ? (
        <div className="py-20 text-center text-[#65616F]">
          <Disc3 className="w-12 h-12 mx-auto mb-3 text-[#4B4854] animate-pulse" />
          <p className="text-xs font-medium text-[#9A96A5]">No albums found</p>
          <p className="text-[11px] text-[#65616F] mt-1">Scan a folder with audio files to see your albums here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {albums.map((album) => {
            const isThisAlbumPlaying =
              currentTrack &&
              album.tracks.some((t) => t.id === currentTrack.id) &&
              isPlaying;
            const albumColor = getTrackColor(album.name, album.artist);

            return (
              <motion.div
                key={album.key}
                whileHover={{ y: -5, scale: 1.01 }}
                transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
                onClick={() => setSelectedAlbumKey(album.key)}
                className="group relative p-3.5 rounded-2xl bg-[#121118]/70 hover:bg-[#181622]/90 border border-white/[0.06] hover:border-[#19E6A0]/30 shadow-[0_4px_20px_rgba(0,0,0,0.35)] hover:shadow-[0_8px_30px_rgba(25,230,160,0.12)] backdrop-blur-xl transition-all duration-300 cursor-pointer flex flex-col gap-3"
              >
                {/* Album Cover Art Tile */}
                <div className="w-full aspect-square rounded-xl overflow-hidden bg-[#16151E] border border-white/[0.08] relative shadow-lg">
                  {album.coverArt ? (
                    <img
                      src={album.coverArt}
                      alt={album.name}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-108"
                    />
                  ) : (
                    <div
                      className="w-full h-full flex flex-col items-center justify-center p-3 text-center"
                      style={{ background: albumColor.bg, color: albumColor.text }}
                    >
                      <Disc3 className="w-10 h-10 mb-1 opacity-70" />
                      <span className="text-[10px] font-bold line-clamp-2">{album.name}</span>
                    </div>
                  )}

                  {/* Floating Action Buttons on Hover */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent opacity-0 group-hover:opacity-100 flex items-center justify-center gap-3 transition-opacity duration-200 backdrop-blur-[2px]">
                    {/* Play Album Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isThisAlbumPlaying) {
                          togglePlay();
                        } else if (album.tracks.length > 0) {
                          playTrack(album.tracks[0], album.tracks, `album_${album.key}`);
                        }
                      }}
                      className="w-11 h-11 rounded-full bg-[#19E6A0] hover:bg-[#35F0B1] text-black shadow-[0_4px_20px_rgba(25,230,160,0.4)] flex items-center justify-center transition-transform hover:scale-110 active:scale-95 cursor-pointer"
                      title={isThisAlbumPlaying ? 'Pause Album' : 'Play Album'}
                      aria-label={isThisAlbumPlaying ? 'Pause Album' : 'Play Album'}
                    >
                      {isThisAlbumPlaying ? (
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
                        handleCreatePlaylist(album);
                      }}
                      className="w-9 h-9 rounded-full bg-[#16151E]/90 hover:bg-[#19E6A0] text-[#AAA6B2] hover:text-black border border-white/[0.12] hover:border-[#19E6A0] shadow-xl flex items-center justify-center transition-all hover:scale-110 active:scale-95 cursor-pointer"
                      title={`Save "${album.name}" as a playlist`}
                      aria-label={`Save "${album.name}" as a playlist`}
                    >
                      <ListPlus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Album Info */}
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-[#F4F2F7] group-hover:text-[#19E6A0] truncate transition-colors">
                    {album.name}
                  </h3>
                  <p className="text-[11px] text-[#9A96A5] truncate mt-0.5">
                    {album.artist}
                  </p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] text-[#65616F] font-mono">
                      {album.tracks.length} track{album.tracks.length === 1 ? '' : 's'}
                    </span>
                    {album.year && (
                      <>
                        <span className="text-[10px] text-[#44414D]">•</span>
                        <span className="text-[10px] text-[#65616F] font-mono">{album.year}</span>
                      </>
                    )}
                    {album.isCompilation && (
                      <span className="text-[9px] font-semibold text-[#19E6A0] bg-[#19E6A0]/10 border border-[#19E6A0]/20 px-1.5 py-0.2 rounded">
                        Compilation
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
};
