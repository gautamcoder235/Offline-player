import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Mic2, Play, Pause, ArrowLeft } from 'lucide-react';
import { Track } from '../types';
import { usePlayer } from '../context/PlayerContext';
import { getTrackColor } from '../utils/helpers';
import { TrackList } from './TrackList';

interface ArtistsViewProps {
  tracks: Track[];
}

interface ArtistGroup {
  name: string;
  coverArt?: string | null;
  albumCount: number;
  tracks: Track[];
}

export const ArtistsView: React.FC<ArtistsViewProps> = ({ tracks }) => {
  const { currentTrack, isPlaying, playTrack, togglePlay } = usePlayer();
  const [selectedArtist, setSelectedArtist] = useState<ArtistGroup | null>(null);

  // Group tracks by artist name
  const artists = useMemo(() => {
    const map = new Map<string, { tracks: Track[]; albums: Set<string>; coverArt?: string | null }>();

    for (const track of tracks) {
      const artistName = track.artist?.trim() || 'Unknown Artist';
      const key = artistName.toLowerCase();

      if (!map.has(key)) {
        const albums = new Set<string>();
        if (track.album) albums.add(track.album.toLowerCase());
        map.set(key, {
          tracks: [track],
          albums,
          coverArt: track.cover_art || null,
        });
      } else {
        const group = map.get(key)!;
        group.tracks.push(track);
        if (track.album) group.albums.add(track.album.toLowerCase());
        if (!group.coverArt && track.cover_art) {
          group.coverArt = track.cover_art;
        }
      }
    }

    const list: ArtistGroup[] = [];
    map.forEach((data, _) => {
      const firstTrack = data.tracks[0];
      list.push({
        name: firstTrack.artist || 'Unknown Artist',
        coverArt: data.coverArt,
        albumCount: data.albums.size || 1,
        tracks: data.tracks,
      });
    });

    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [tracks]);

  // If viewing a drilled-down artist detail
  if (selectedArtist) {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        <div className="p-4 sm:p-6 pb-0 flex items-center gap-3 shrink-0">
          <button
            onClick={() => setSelectedArtist(null)}
            className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#16151D] hover:bg-[#201E29] text-xs font-medium text-[#AAA6B2] hover:text-[#F4F2F7] border border-[#2B2936] transition-colors cursor-pointer active:scale-95"
          >
            <ArrowLeft className="w-3.5 h-3.5 discord-icon discord-icon-prev" />
            <span>All Artists</span>
          </button>
        </div>

        <TrackList
          tracks={selectedArtist.tracks}
          title={selectedArtist.name}
          subtitle={`Artist • ${selectedArtist.tracks.length} songs • ${selectedArtist.albumCount} albums`}
          coverArt={selectedArtist.coverArt || undefined}
          playlistId={`artist_${selectedArtist.name}`}
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
            {artists.length} artists in your offline music library
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

            return (
              <motion.div
                key={artist.name}
                whileHover={{ y: -4 }}
                transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
                onClick={() => setSelectedArtist(artist)}
                className="group p-4 rounded-2xl bg-[#14131A] hover:bg-[#1C1B25] border border-[#25232F] hover:border-[#333040] shadow-md transition-all duration-200 cursor-pointer flex flex-col items-center text-center gap-3"
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

                  {/* Floating Play Button on Hover */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isThisArtistPlaying) {
                          togglePlay();
                        } else if (artist.tracks.length > 0) {
                          playTrack(artist.tracks[0], artist.tracks, `artist_${artist.name}`);
                        }
                      }}
                      className="group/artistplay w-11 h-11 rounded-full bg-[#19E6A0] hover:bg-[#16CE8F] text-black shadow-xl flex items-center justify-center transition-transform hover:scale-110 active:scale-95 cursor-pointer"
                      title={isThisArtistPlaying ? 'Pause Artist' : 'Play Artist'}
                      aria-label={isThisArtistPlaying ? 'Pause Artist' : 'Play Artist'}
                    >
                      {isThisArtistPlaying ? (
                        <Pause className="w-5 h-5 fill-current discord-icon discord-icon-pop" />
                      ) : (
                        <Play className="w-5 h-5 fill-current ml-0.5 discord-icon discord-icon-pop" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Artist Info */}
                <div className="w-full min-w-0">
                  <h3 className="text-xs font-bold text-[#F4F2F7] group-hover:text-[#19E6A0] truncate transition-colors">
                    {artist.name}
                  </h3>
                  <p className="text-[11px] text-[#777381] mt-0.5">
                    Artist • {artist.tracks.length} songs
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
