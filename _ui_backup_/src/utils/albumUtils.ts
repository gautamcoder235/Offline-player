import type { Track } from '../types';
import { cleanArtistName, normalizeArtistKey, splitArtistString } from './artistUtils';

export interface AlbumGroup {
  key: string;
  name: string;
  artist: string;
  year?: number | null;
  coverArt?: string | null;
  tracks: Track[];
  isCompilation: boolean;
  trackCount: number;
}

/**
 * Common generic album names that should be qualified by the primary artist
 * so different artists' "Greatest Hits" or "Live" albums don't collide.
 */
const GENERIC_ALBUM_NAMES = new Set([
  'greatest hits',
  'live',
  'ep',
  'single',
  'singles',
  'best of',
  'the best of',
  'remix',
  'remixes',
  'anthology',
  'acoustic',
  'unplugged',
  'deluxe',
  'self-titled',
  'platinum hits',
  'gold',
]);

/**
 * Checks if an album tag is junk, a placeholder, or just emojis/symbols (e.g. "🫡").
 */
export function isJunkAlbumName(name?: string | null): boolean {
  if (!name || !name.trim()) return true;
  const trimmed = name.trim();

  // Strip non-letter and non-number characters across all scripts/languages
  const lettersOrDigits = trimmed.replace(/[^\p{L}\p{N}]/gu, '');
  if (lettersOrDigits.length === 0) {
    // Contains only emojis or punctuation symbols like "🫡"
    return true;
  }

  const lower = trimmed.toLowerCase();
  if (
    [
      'offline music',
      'unknown album',
      'unknown',
      'untitled',
      'album',
      'various',
      'track',
    ].includes(lower)
  ) {
    return true;
  }

  return false;
}

/**
 * Resolves an album name for a track:
 * - If the track has a legitimate album tag, uses it
 * - If the album tag is junk or emojis (e.g. "🫡"), falls back to the track title as a Single
 * - If no title, falls back to "Singles & Releases"
 */
export function resolveTrackAlbumName(track: Track): string {
  if (!isJunkAlbumName(track.album)) {
    return track.album.trim();
  }

  if (track.title && track.title.trim()) {
    return track.title.trim();
  }

  return 'Singles & Releases';
}

/**
 * Normalizes an album key for consistent comparison across cases and accents.
 */
export function normalizeAlbumKey(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Determines the best representative artist label for an album group:
 * - Single primary artist -> "Coldplay"
 * - 2 primary artists -> "Artist 1 & Artist 2"
 * - 3+ primary artists -> "Various Artists" (or "Soundtrack" if soundtrack detected)
 */
export function determineAlbumArtist(tracks: Track[], albumName: string): { artist: string; isCompilation: boolean } {
  if (tracks.length === 0) {
    return { artist: 'Unknown Artist', isCompilation: false };
  }

  const primaryArtistsSet = new Set<string>();
  const primaryArtistsList: string[] = [];

  for (const t of tracks) {
    const rawArtist = t.artist?.trim() || 'Unknown Artist';
    const parts = splitArtistString(rawArtist);
    const primary = cleanArtistName(parts[0] || 'Unknown Artist');
    const key = normalizeArtistKey(primary);

    if (key && !primaryArtistsSet.has(key)) {
      primaryArtistsSet.add(key);
      primaryArtistsList.push(primary);
    }
  }

  if (primaryArtistsList.length === 1) {
    return { artist: primaryArtistsList[0], isCompilation: false };
  }

  if (primaryArtistsList.length === 2) {
    return {
      artist: `${primaryArtistsList[0]} & ${primaryArtistsList[1]}`,
      isCompilation: false,
    };
  }

  // 3+ distinct artists: Check for soundtrack keywords
  const lowerAlbum = albumName.toLowerCase();
  const isSoundtrack =
    lowerAlbum.includes('soundtrack') ||
    lowerAlbum.includes('original motion picture') ||
    lowerAlbum.includes(' ost');

  if (isSoundtrack) {
    return { artist: 'Original Soundtrack', isCompilation: true };
  }

  return { artist: 'Various Artists', isCompilation: true };
}

/**
 * Intelligently groups tracks into albums.
 * - Never fractures albums by individual track artists (soundtracks and compilations stay together!)
 * - Correctly resolves junk / emoji album tags (e.g. "🫡") into proper single releases
 * - Keeps generic titles (e.g. "Greatest Hits") separated by artist
 * - Preserves disc and track numbering order
 */
export function groupTracksIntoAlbums(tracks: Track[]): AlbumGroup[] {
  const map = new Map<string, { name: string; key: string; tracks: Track[] }>();

  for (const track of tracks) {
    const albumName = resolveTrackAlbumName(track);
    const normalizedName = normalizeAlbumKey(albumName);

    // If it's a generic album name like "Greatest Hits" or "Live", qualify with primary artist
    let groupKey = normalizedName;
    if (GENERIC_ALBUM_NAMES.has(normalizedName)) {
      const parts = splitArtistString(track.artist || '');
      const primary = normalizeArtistKey(parts[0] || 'Unknown Artist');
      groupKey = `${normalizedName}___${primary}`;
    }

    if (!map.has(groupKey)) {
      map.set(groupKey, {
        name: albumName,
        key: groupKey,
        tracks: [track],
      });
    } else {
      map.get(groupKey)!.tracks.push(track);
    }
  }

  const result: AlbumGroup[] = [];

  map.forEach((data) => {
    // Sort tracks by disc_number and track_number, then by title
    data.tracks.sort((a, b) => {
      const discA = a.disc_number && a.disc_number > 0 ? a.disc_number : 1;
      const discB = b.disc_number && b.disc_number > 0 ? b.disc_number : 1;
      if (discA !== discB) return discA - discB;
      const trackA = a.track_number && a.track_number > 0 ? a.track_number : 9999;
      const trackB = b.track_number && b.track_number > 0 ? b.track_number : 9999;
      if (trackA !== trackB) return trackA - trackB;
      return a.title.localeCompare(b.title);
    });

    const { artist, isCompilation } = determineAlbumArtist(data.tracks, data.name);

    // Representative cover art: First track with cover art
    const coverArt = data.tracks.find((t) => Boolean(t.cover_art))?.cover_art || null;

    // Representative year
    const year = data.tracks.find((t) => Boolean(t.year))?.year || null;

    result.push({
      key: data.key,
      name: data.name,
      artist,
      year,
      coverArt,
      tracks: data.tracks,
      isCompilation,
      trackCount: data.tracks.length,
    });
  });

  return result.sort((a, b) => a.name.localeCompare(b.name));
}
