import type { Track } from '../types';

/**
 * Well-known bands / artist names containing commas, ampersands, or plus signs
 * that must NOT be split into separate individual artists.
 */
const PROTECTED_ARTISTS = new Set([
  'simon & garfunkel',
  'earth, wind & fire',
  'crosby, stills, nash & young',
  'crosby, stills & nash',
  'above & beyond',
  'florence + the machine',
  'florence and the machine',
  'kool & the gang',
  'hall & oates',
  'daryl hall & john oates',
  'tom petty and the heartbreakers',
  'bob dylan & the band',
  'kc & the sunshine band',
  'huey lewis & the news',
  'captain & tennille',
  'mumford & sons',
  'iron & wine',
  'king gizzard & the lizard wizard',
  'tyler, the creator',
  'blood, sweat & tears',
  'emerson, lake & palmer',
  'peter, paul and mary',
  'sly & the family stone',
  'joan jett & the blackhearts',
  'echo & the bunnymen',
  'siouxsie and the banshees',
  'of monsters and men',
  'francis and the lights',
  'marina and the diamonds',
  'alvin and the chipmunks',
  'ziggy marley & the melody makers',
]);

/**
 * Cleans an artist name string:
 * - Strips leading/trailing punctuation, quotes, brackets
 * - Strips YouTube/streaming suffixes like "(Official Video)", " - Topic", "(Remastered)"
 * - Collapses consecutive whitespace
 */
export function cleanArtistName(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/^["'`\s]+|["'`\s]+$/g, '')
    .replace(/\s*-\s*topic$/i, '')
    .replace(/\s*\((?:official(?:\s+(?:video|audio|music\s+video))?|remastered|lyrics?|deluxe)\)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes an artist name for case/accent-insensitive key comparisons.
 */
export function normalizeArtistKey(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['`"\.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts featured artists from a song's title if present:
 * e.g. "Closer (feat. Halsey)" -> ["Halsey"]
 * e.g. "Get Lucky [feat. Pharrell Williams & Nile Rodgers]" -> ["Pharrell Williams", "Nile Rodgers"]
 */
export function extractArtistsFromTitle(title: string): string[] {
  if (!title) return [];

  // Match (feat. ...), [feat. ...], (ft. ...), (with ...), (featuring ...)
  const featureRegex = /[([{\s](?:feat\.?|ft\.?|featuring|with)\s+([^\])}]+)[\])}]/gi;
  const extracted: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = featureRegex.exec(title)) !== null) {
    const rawContent = match[1];
    if (rawContent) {
      const parts = splitArtistString(rawContent);
      extracted.push(...parts);
    }
  }

  return extracted;
}

/**
 * Splits a composite artist string into individual artist names,
 * respecting protected band names (e.g. "Earth, Wind & Fire").
 */
export function splitArtistString(raw: string): string[] {
  const trimmed = cleanArtistName(raw);
  if (!trimmed) return [];

  const lower = trimmed.toLowerCase();
  if (PROTECTED_ARTISTS.has(lower)) {
    return [trimmed];
  }

  // Check if string contains any protected artist so we don't accidentally shatter it
  let working = trimmed;
  const placeholders: Map<string, string> = new Map();
  let placeholderIndex = 0;

  for (const protectedName of PROTECTED_ARTISTS) {
    const idx = working.toLowerCase().indexOf(protectedName);
    if (idx !== -1) {
      const token = `__PROTECTED_ARTIST_${placeholderIndex++}__`;
      const originalSub = working.substring(idx, idx + protectedName.length);
      placeholders.set(token, originalSub);
      working = working.substring(0, idx) + token + working.substring(idx + protectedName.length);
    }
  }

  // Split on delimiters:
  // 1. Semicolons: ;
  // 2. Slashes or pipes with whitespace: \s+[/\\|]\s+
  // 3. Commas: ,\s*
  // 4. Feature tokens: \s+(?:feat\.?|ft\.?|featuring|with|vs\.?)\s+
  // 5. Ampersand / plus / x: \s+(&|\+|x|X)\s+
  const splitRegex = /(?:;\s*|\s+[/\\|]\s+|,\s*|\s+(?:feat\.?|ft\.?|featuring|with|vs\.?)\s+|\s+(?:&|\+|x|X)\s+)/i;

  const rawParts = working.split(splitRegex);
  const result: string[] = [];

  for (const part of rawParts) {
    let resolved = part;
    placeholders.forEach((orig, token) => {
      resolved = resolved.replace(token, orig);
    });

    const cleaned = cleanArtistName(resolved);
    if (cleaned && cleaned.length > 0 && !result.some((r) => r.toLowerCase() === cleaned.toLowerCase())) {
      result.push(cleaned);
    }
  }

  return result.length > 0 ? result : [trimmed];
}

/**
 * Parses all artists participating in a track:
 * - primary: The lead artist (first artist in artist tag)
 * - features: Additional artists from artist tag + title
 * - all: Unique combined list of all participating artists
 */
export function parseTrackArtists(track: Track): {
  primary: string;
  features: string[];
  all: string[];
} {
  const rawArtist = track.artist?.trim() || 'Unknown Artist';
  const artistParts = splitArtistString(rawArtist);
  const titleFeatures = extractArtistsFromTitle(track.title);

  const primary = artistParts[0] || 'Unknown Artist';
  const featureCandidates = [...artistParts.slice(1), ...titleFeatures];

  const primaryKey = normalizeArtistKey(primary);
  const seenKeys = new Set<string>([primaryKey]);
  const features: string[] = [];

  for (const feat of featureCandidates) {
    const key = normalizeArtistKey(feat);
    if (key && !seenKeys.has(key)) {
      seenKeys.add(key);
      features.push(feat);
    }
  }

  const all = [primary, ...features];
  return { primary, features, all };
}

/**
 * Checks whether a given track includes a specific artist (either as lead or collaborator/feature).
 */
export function trackIncludesArtist(track: Track, artistName: string): boolean {
  if (!artistName || !artistName.trim()) return false;
  const targetKey = normalizeArtistKey(artistName);
  if (!targetKey) return false;

  const { all } = parseTrackArtists(track);
  for (const art of all) {
    if (normalizeArtistKey(art) === targetKey) {
      return true;
    }
  }

  // Fallback substring check on raw artist tag for unconventional formats
  const rawArtistKey = normalizeArtistKey(track.artist || '');
  if (rawArtistKey.includes(targetKey)) {
    return true;
  }

  return false;
}

export interface ArtistGroup {
  name: string;
  normalizedKey: string;
  tracks: Track[];
  leadTracks: Track[];
  collabTracks: Track[];
  albumCount: number;
  coverArt?: string | null;
}

/**
 * Groups a collection of tracks by all artists included in them.
 * Every collaboration or featured song correctly appears under each participating artist!
 */
export function groupTracksByArtist(tracks: Track[]): ArtistGroup[] {
  const map = new Map<
    string,
    {
      name: string;
      leadTracks: Track[];
      collabTracks: Track[];
      albums: Set<string>;
      coverArt?: string | null;
    }
  >();

  for (const track of tracks) {
    const { primary, features } = parseTrackArtists(track);

    // 1. Primary / Lead artist
    const primaryKey = normalizeArtistKey(primary);
    if (!map.has(primaryKey)) {
      const albums = new Set<string>();
      if (track.album) albums.add(track.album.toLowerCase());
      map.set(primaryKey, {
        name: primary,
        leadTracks: [track],
        collabTracks: [],
        albums,
        coverArt: track.cover_art || null,
      });
    } else {
      const g = map.get(primaryKey)!;
      if (!g.leadTracks.some((t) => t.id === track.id)) {
        g.leadTracks.push(track);
      }
      if (track.album) g.albums.add(track.album.toLowerCase());
      if (!g.coverArt && track.cover_art) g.coverArt = track.cover_art;
    }

    // 2. Collaborators / Featured artists
    for (const feat of features) {
      const featKey = normalizeArtistKey(feat);
      if (!featKey) continue;

      if (!map.has(featKey)) {
        const albums = new Set<string>();
        if (track.album) albums.add(track.album.toLowerCase());
        map.set(featKey, {
          name: feat,
          leadTracks: [],
          collabTracks: [track],
          albums,
          coverArt: track.cover_art || null,
        });
      } else {
        const g = map.get(featKey)!;
        if (!g.collabTracks.some((t) => t.id === track.id) && !g.leadTracks.some((t) => t.id === track.id)) {
          g.collabTracks.push(track);
        }
        if (track.album) g.albums.add(track.album.toLowerCase());
        if (!g.coverArt && track.cover_art) g.coverArt = track.cover_art;
      }
    }
  }

  const groups: ArtistGroup[] = [];

  map.forEach((data, normalizedKey) => {
    // Combine lead tracks followed by collab tracks, deduplicated by id
    const trackMap = new Map<string, Track>();
    data.leadTracks.forEach((t) => trackMap.set(t.id, t));
    data.collabTracks.forEach((t) => {
      if (!trackMap.has(t.id)) trackMap.set(t.id, t);
    });

    const allTracks = Array.from(trackMap.values());

    // Sort tracks by title for consistent artist view
    allTracks.sort((a, b) => a.title.localeCompare(b.title));

    groups.push({
      name: data.name,
      normalizedKey,
      tracks: allTracks,
      leadTracks: data.leadTracks,
      collabTracks: data.collabTracks,
      albumCount: data.albums.size || 1,
      coverArt: data.coverArt,
    });
  });

  return groups.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Finds all tracks in a collection that include an artist (lead + collab).
 */
export function getArtistTracks(tracks: Track[], artistName: string): {
  all: Track[];
  lead: Track[];
  collab: Track[];
} {
  const targetKey = normalizeArtistKey(artistName);
  if (!targetKey) {
    return { all: [], lead: [], collab: [] };
  }

  const lead: Track[] = [];
  const collab: Track[] = [];
  const seenIds = new Set<string>();

  for (const track of tracks) {
    if (seenIds.has(track.id)) continue;
    const { primary, features } = parseTrackArtists(track);
    const primaryKey = normalizeArtistKey(primary);

    if (primaryKey === targetKey) {
      seenIds.add(track.id);
      lead.push(track);
    } else if (features.some((f) => normalizeArtistKey(f) === targetKey) || trackIncludesArtist(track, artistName)) {
      seenIds.add(track.id);
      collab.push(track);
    }
  }

  lead.sort((a, b) => a.title.localeCompare(b.title));
  collab.sort((a, b) => a.title.localeCompare(b.title));

  return {
    all: [...lead, ...collab],
    lead,
    collab,
  };
}

/**
 * Returns all track IDs for an artist, suitable for creating an artist playlist.
 * Lead tracks appear first, followed by collaborations and features.
 */
export function getArtistPlaylistTrackIds(tracks: Track[], artistName: string): string[] {
  const { all } = getArtistTracks(tracks, artistName);
  return all.map((t) => t.id);
}
