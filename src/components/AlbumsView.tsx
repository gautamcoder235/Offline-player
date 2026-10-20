import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Disc3, Play, Pause, ArrowLeft } from 'lucide-react';
import { Track } from '../types';
import { usePlayer } from '../context/PlayerContext';
import { getTrackColor } from '../utils/helpers';
import { TrackList } from './TrackList';

interface AlbumsViewProps {
  tracks: Track[];
}

interface AlbumGroup {
  name: string;
  artist: string;
  year?: number | null;
  coverArt?: string | null;
  tracks: Track[];
}

export const AlbumsView: React.FC<AlbumsViewProps> = ({ tracks }) => {
  const { currentTrack, isPlaying, playTrack, togglePlay } = usePlayer();
  const [selectedAlbum, setSelectedAlbum] = useState<AlbumGroup | null>(null);

  // Group tracks by album name
  const albums = useMemo(() => {
    const map = new Map<string, AlbumGroup>();

    for (const track of tracks) {
      const albumName = track.album?.trim() || 'Unknown Album';
      const key = `${albumName.toLowerCase()}___${(track.artist || '').toLowerCase()}`;

      if (!map.has(key)) {
        map.set(key, {
          name: albumName,
          artist: track.artist || 'Unknown Artist',
          year: track.year || null,
          coverArt: track.cover_art || null,
          tracks: [track],
        });
      } else {
        const group = map.get(key)!;
        group.tracks.push(track);
        if (!group.coverArt && track.cover_art) {
          group.coverArt = track.cover_art;
        }
        if (!group.year && track.year) {
          group.year = track.year;
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [tracks]);

  // If viewing a drilled-down album detail
  if (selectedAlbum) {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        <div className="p-4 sm:p-6 pb-0 flex items-center gap-3 shrink-0">
          <button
            onClick={() => setSelectedAlbum(null)}
            className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#16151D] hover:bg-[#201E29] text-xs font-medium text-[#AAA6B2] hover:text-[#F4F2F7] border border-[#2B2936] transition-colors cursor-pointer active:scale-95"
          >
            <ArrowLeft className="w-3.5 h-3.5 discord-icon discord-icon-prev" />
            <span>All Albums</span>
          </button>
        </div>

        <TrackList
          tracks={selectedAlbum.tracks}
          title={selectedAlbum.name}
          subtitle={`${selectedAlbum.artist}${selectedAlbum.year ? ` • ${selectedAlbum.year}` : ''} • ${selectedAlbum.tracks.length} tracks`}
          coverArt={selectedAlbum.coverArt || undefined}
          playlistId={`album_${selectedAlbum.name}`}
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
            Albums
          </h1>
          <p className="text-xs text-[#777381] mt-0.5">
            {albums.length} albums • {tracks.length} total tracks
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
                key={`${album.name}-${album.artist}`}
                whileHover={{ y: -4 }}
                transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
                onClick={() => setSelectedAlbum(album)}
                className="group relative p-3 rounded-2xl bg-[#14131A] hover:bg-[#1C1B25] border border-[#25232F] hover:border-[#333040] shadow-md transition-all duration-200 cursor-pointer flex flex-col gap-2.5"
              >
                {/* Album Cover Art Tile */}
                <div className="w-full aspect-square rounded-xl overflow-hidden bg-[#181720] border border-[#2A2836] relative shadow-inner">
                  {album.coverArt ? (
                    <img
                      src={album.coverArt}
                      alt={album.name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
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

                  {/* Floating Play Button on Hover */}
                  <div className="absolute right-2.5 bottom-2.5 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all duration-200">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isThisAlbumPlaying) {
                          togglePlay();
                        } else if (album.tracks.length > 0) {
                          playTrack(album.tracks[0], album.tracks, `album_${album.name}`);
                        }
                      }}
                      className="group/albumplay w-10 h-10 rounded-full bg-[#19E6A0] hover:bg-[#16CE8F] text-black shadow-xl flex items-center justify-center transition-transform hover:scale-110 active:scale-95 cursor-pointer"
                      title={isThisAlbumPlaying ? 'Pause Album' : 'Play Album'}
                      aria-label={isThisAlbumPlaying ? 'Pause Album' : 'Play Album'}
                    >
                      {isThisAlbumPlaying ? (
                        <Pause className="w-4 h-4 fill-current discord-icon discord-icon-pop" />
                      ) : (
                        <Play className="w-4 h-4 fill-current ml-0.5 discord-icon discord-icon-pop" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Album Info */}
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-[#F4F2F7] group-hover:text-[#19E6A0] truncate transition-colors">
                    {album.name}
                  </h3>
                  <p className="text-[11px] text-[#777381] truncate mt-0.5">
                    {album.artist}
                  </p>
                  <p className="text-[10px] text-[#555260] font-mono mt-0.5">
                    {album.tracks.length} tracks{album.year ? ` • ${album.year}` : ''}
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
