import React from 'react';
import { Track } from '../types';

export interface SearchableLine {
  original: string;
  lower: string;
  normalized: string;
  words: string[];
}

interface CachedLyrics {
  cleanLines: string[];
  searchableLines: SearchableLine[];
  fullLowerText: string;
  fullNormalizedText: string;
}

// Memory-capped cache for cleaned lyrics lines and searchable strings
const lyricsCache = new Map<string, CachedLyrics>();
const MAX_CACHE_SIZE = 1500;

// CJK Unicode range: Hiragana, Katakana, CJK Unified Ideographs, Hangul
const CJK_REGEX = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/;

export function isCjkText(str: string): boolean {
  return CJK_REGEX.test(str);
}

/**
 * Normalizes text for search comparison:
 * - Strips diacritics / accents (e.g. café -> cafe, Tití -> titi)
 * - Normalizes smart/curly quotes & apostrophes to ASCII
 * - Replaces punctuation with single spaces while preserving letters/numbers across all alphabets
 * - Collapses multiple spaces and lowercases
 */
export function normalizeSearchText(text: string): string {
  if (!text) return '';
  return text
    .replace(/^\uFEFF/, '') // Strip byte order mark
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Strip combining Latin accents only (e.g. café -> cafe, Tití -> titi)
    .replace(/['\u2018\u2019`]/gu, '') // strip apostrophes so don't / don’t normalize to dont
    .replace(/["\u201C\u201D]/gu, ' ')
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ') // Preserve letters, combining marks (Indic/Arabic), numbers and spaces
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const HEADER_TAG_REGEX = /^\[[a-zA-Z]+:[^\]]*\]/;
const TIMESTAMP_REGEX = /\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]|<\d{1,2}:\d{2}(?:[.:]\d{1,3})?>/g;

/**
 * Extracts clean lyrics lines by stripping LRC timestamp tags and skipping header tags.
 */
export function extractCleanLyricLines(rawLyrics: string): string[] {
  if (!rawLyrics || !rawLyrics.trim()) return [];

  const rawLines = rawLyrics.replace(/^\uFEFF/, '').split(/\r?\n/);
  const clean: string[] = [];

  for (const raw of rawLines) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    // Skip LRC header tags like [ti:], [ar:], [al:], [by:], [offset:], [length:], [re:]
    if (HEADER_TAG_REGEX.test(trimmed)) continue;

    // Strip timestamps like [01:23.45], [1:23.4], <01:23.45>
    const text = trimmed.replace(TIMESTAMP_REGEX, '').trim();
    if (text) {
      clean.push(text);
    }
  }

  return clean;
}

/**
 * Retrieves or builds cached lyrics index for a given track.
 */
export function getCachedLyrics(trackId: string, rawLyrics: string): CachedLyrics {
  const cacheKey = `${trackId}_${rawLyrics.length}`;
  let cached = lyricsCache.get(cacheKey);

  if (!cached) {
    if (lyricsCache.size >= MAX_CACHE_SIZE) {
      // Clear half the cache when limit is reached
      const keysToDelete = Array.from(lyricsCache.keys()).slice(0, Math.floor(MAX_CACHE_SIZE / 2));
      for (const k of keysToDelete) {
        lyricsCache.delete(k);
      }
    }

    const cleanLines = extractCleanLyricLines(rawLyrics);
    const searchableLines: SearchableLine[] = cleanLines.map((line) => {
      const lower = line.toLowerCase();
      const normalized = normalizeSearchText(line);
      const words = normalized.split(/\s+/).filter((w) => w.length > 0);
      return {
        original: line,
        lower,
        normalized,
        words,
      };
    });

    const fullLowerText = searchableLines.map((l) => l.lower).join('\n');
    const fullNormalizedText = searchableLines.map((l) => l.normalized).join('\n');

    cached = {
      cleanLines,
      searchableLines,
      fullLowerText,
      fullNormalizedText,
    };

    lyricsCache.set(cacheKey, cached);
  }

  return cached;
}

/**
 * Generates a clean, word-boundary-aware snippet centered around the matching query,
 * ensuring boundary snapping never slices into the matched terms.
 */
export function createLyricSnippet(
  line: string,
  query: string,
  maxLength: number = 70
): string {
  const trimmed = line.trim();
  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  const qLower = query.toLowerCase().trim();
  const lineLower = trimmed.toLowerCase();

  // 1. Try finding exact raw query in lowercased line
  let matchIdx = lineLower.indexOf(qLower);
  let matchLen = qLower.length;

  // 2. Try finding individual search terms in lowercased line
  if (matchIdx === -1) {
    const rawTerms = qLower.split(/\s+/).filter((w) => w.length >= 2);
    for (const term of rawTerms) {
      const idx = lineLower.indexOf(term);
      if (idx !== -1) {
        matchIdx = idx;
        matchLen = term.length;
        break;
      }
    }
  }

  // 3. Try finding normalized terms in original line
  if (matchIdx === -1) {
    const normTerms = normalizeSearchText(query).split(/\s+/).filter((w) => w.length >= 2);
    for (const term of normTerms) {
      const idx = lineLower.indexOf(term);
      if (idx !== -1) {
        matchIdx = idx;
        matchLen = term.length;
        break;
      }
    }
  }

  if (matchIdx === -1) {
    matchIdx = 0;
    matchLen = Math.min(query.length, 10);
  }

  const matchEnd = matchIdx + matchLen;
  const halfWindow = Math.floor((maxLength - matchLen) / 2);
  let start = Math.max(0, matchIdx - Math.max(10, halfWindow));
  let end = Math.min(trimmed.length, start + maxLength);

  if (end - start < maxLength && start > 0) {
    start = Math.max(0, end - maxLength);
  }

  // Snap start forward to word boundary only if it stays strictly before matchIdx
  if (start > 0) {
    const nextSpace = trimmed.indexOf(' ', start);
    if (nextSpace !== -1 && nextSpace < matchIdx && nextSpace - start < 8) {
      start = nextSpace + 1;
    }
  }

  // Snap end backward to word boundary only if it stays strictly after matchEnd
  if (end < trimmed.length) {
    const prevSpace = trimmed.lastIndexOf(' ', end);
    if (prevSpace !== -1 && prevSpace > matchEnd && end - prevSpace < 8) {
      end = prevSpace;
    }
  }

  let snippet = trimmed.slice(start, end).trim();
  if (start > 0) {
    snippet = '...' + snippet;
  }
  if (end < trimmed.length) {
    snippet = snippet + '...';
  }

  return snippet;
}

export interface LyricSnippetResult {
  snippet: string;
  score: number;
}

/**
 * Checks if a track's lyrics match the query and returns the matching snippet + score if so.
 */
export function getMatchingLyricSnippet(
  trackId: string,
  lyrics: string | null | undefined,
  query: string
): LyricSnippetResult | null {
  const q = query.trim();
  if (!q || !lyrics || !lyrics.trim()) {
    return null;
  }

  const isCjk = isCjkText(q);
  // Latin queries require >= 3 characters to prevent stop-word flooding; CJK characters are semantic words at >= 1 char
  if (!isCjk && q.length < 3) {
    return null;
  }

  const cached = getCachedLyrics(trackId, lyrics);
  const qLower = q.toLowerCase();
  const qNorm = normalizeSearchText(q);
  const qWords = qNorm.split(/\s+/).filter((w) => w.length > 0);

  // Fast pre-check across full text
  const quickLowerHit = cached.fullLowerText.includes(qLower);
  const quickNormHit = qNorm.length >= 2 && cached.fullNormalizedText.includes(qNorm);
  const quickWordsHit =
    qWords.length > 0 && qWords.every((w) => cached.fullNormalizedText.includes(w));

  if (!quickLowerHit && !quickNormHit && !quickWordsHit) {
    return null;
  }

  // 1. Exact phrase match in any line (highest score)
  for (const line of cached.searchableLines) {
    if (line.lower.includes(qLower) || (qNorm.length >= 2 && line.normalized.includes(qNorm))) {
      return {
        snippet: createLyricSnippet(line.original, q),
        score: 55,
      };
    }
  }

  // 2. Multi-word queries: all query words present in the same line
  if (qWords.length >= 2) {
    for (const line of cached.searchableLines) {
      const allMatched = qWords.every((w) => line.normalized.includes(w));
      if (allMatched) {
        return {
          snippet: createLyricSnippet(line.original, q),
          score: 42,
        };
      }
    }

    // 3. Multi-word queries: majority of query words (>= 2 significant words) present in the same line
    const sigWords = qWords.filter((w) => w.length >= 3);
    if (sigWords.length >= 2) {
      for (const line of cached.searchableLines) {
        const matchCount = sigWords.filter((w) => line.normalized.includes(w)).length;
        if (matchCount >= 2) {
          return {
            snippet: createLyricSnippet(line.original, q),
            score: 28,
          };
        }
      }
    }
  }

  // 4. Single-word queries: whole word match in normalized line
  if (qWords.length === 1 && (isCjk || qNorm.length >= 3)) {
    const singleWord = qWords[0];
    for (const line of cached.searchableLines) {
      const isWordMatch = isCjk
        ? line.lower.includes(singleWord)
        : line.words.includes(singleWord) || line.normalized.includes(singleWord);
      if (isWordMatch) {
        return {
          snippet: createLyricSnippet(line.original, q),
          score: 35,
        };
      }
    }
  }

  return null;
}

export interface TrackMatchResult {
  track: Track;
  matched: boolean;
  score: number;
  lyricsSnippet: string | null;
  isLyricsOnlyMatch: boolean;
}

/**
 * Matches a track against title, artist, album, and lyrics.
 * Prioritizes Title & Artist matches, while surfacing subtle lyrics snippets
 * when a song matches via lyrics (especially when title and artist do not).
 */
export function matchTrackWithLyrics(track: Track, rawQuery: string): TrackMatchResult {
  const query = rawQuery.trim();
  if (!query) {
    return {
      track: {
        ...track,
        matchingLyricSnippet: null,
      },
      matched: true,
      score: 0,
      lyricsSnippet: null,
      isLyricsOnlyMatch: false,
    };
  }

  const qLower = query.toLowerCase();
  const qNorm = normalizeSearchText(query);
  const isCjk = isCjkText(query);
  const minLength = isCjk ? 1 : 3;

  const titleLower = track.title.toLowerCase();
  const artistLower = track.artist.toLowerCase();
  const albumLower = track.album.toLowerCase();

  const titleNorm = normalizeSearchText(track.title);
  const artistNorm = normalizeSearchText(track.artist);
  const albumNorm = normalizeSearchText(track.album);

  const titleMatch =
    titleLower.includes(qLower) || (qNorm.length >= minLength && titleNorm.includes(qNorm));

  const artistMatch =
    artistLower.includes(qLower) || (qNorm.length >= minLength && artistNorm.includes(qNorm));

  const albumMatch =
    albumLower.includes(qLower) || (qNorm.length >= minLength && albumNorm.includes(qNorm));

  // Lyrics matching
  let lyricsResult: LyricSnippetResult | null = null;
  if (track.lyrics && track.lyrics.trim() && (isCjk || query.length >= 3)) {
    lyricsResult = getMatchingLyricSnippet(track.id, track.lyrics, query);
  }
  const lyricsMatch = Boolean(lyricsResult);

  const matched = titleMatch || artistMatch || albumMatch || lyricsMatch;
  if (!matched) {
    return {
      track: {
        ...track,
        matchingLyricSnippet: null,
      },
      matched: false,
      score: 0,
      lyricsSnippet: null,
      isLyricsOnlyMatch: false,
    };
  }

  // Calculate search relevance score
  let score = 0;
  if (titleMatch) {
    if (titleLower === qLower || titleNorm === qNorm) score += 160;
    else if (titleLower.startsWith(qLower) || titleNorm.startsWith(qNorm)) score += 130;
    else score += 100;
  }

  if (artistMatch) {
    if (artistLower === qLower || artistNorm === qNorm) score += 120;
    else if (artistLower.startsWith(qLower) || artistNorm.startsWith(qNorm)) score += 95;
    else score += 75;
  }

  if (albumMatch) {
    score += 45;
  }

  if (lyricsResult) {
    score += lyricsResult.score;
  }

  // Display the lyrics snippet pill ONLY when Title and Artist do NOT directly match,
  // so the user clearly sees why this track appeared without redundant UI clutter.
  const isLyricsOnlyMatch = lyricsMatch && !titleMatch && !artistMatch;
  const displaySnippet = isLyricsOnlyMatch && lyricsResult ? lyricsResult.snippet : null;

  return {
    track: {
      ...track,
      matchingLyricSnippet: displaySnippet,
    },
    matched: true,
    score,
    lyricsSnippet: displaySnippet,
    isLyricsOnlyMatch,
  };
}

/**
 * Renders snippet text with matching query terms highlighted in emerald bold.
 * Uses Unicode property classes and boundary checks so partial words (like "sky" in "skyscraper")
 * or single letters (like "i" in "life") are never chopped or falsely highlighted.
 */
export function renderHighlightedSnippet(
  snippet: string,
  query: string
): React.ReactNode {
  if (!query || !query.trim() || !snippet) {
    return snippet;
  }

  const rawTerms = [
    query.trim(),
    ...query.trim().split(/\s+/).filter((w) => w.length > 0),
  ];
  // Deduplicate and sort longest term first to ensure greedy matching of multi-word phrases
  const uniqueTerms = Array.from(new Set(rawTerms)).sort((a, b) => b.length - a.length);

  if (uniqueTerms.length === 0) {
    return snippet;
  }

  const escapeRegExp = (str: string) =>
    str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/['\u2019]/g, "['\u2019]");

  const patterns = uniqueTerms.map((t) => {
    const esc = escapeRegExp(t);
    if (isCjkText(t)) {
      return esc;
    }
    // For natural language words, require word boundary lookaround
    return `(?<![\\p{L}\\p{M}\\p{N}])${esc}(?![\\p{L}\\p{M}\\p{N}])`;
  });

  const fullPattern = `(${patterns.join('|')})`;

  try {
    const regex = new RegExp(fullPattern, 'giu');
    const parts = snippet.split(regex);
    const normWord = (s: string) => s.toLowerCase().replace(/['\u2019]/g, "'");
    const termSet = new Set(uniqueTerms.map(normWord));

    return (
      <>
        {parts.map((part, index) => {
          if (!part) return null;
          const isMatch = termSet.has(normWord(part));
          return isMatch ? (
            <span
              key={index}
              className="text-[#19E6A0] font-semibold not-italic underline decoration-[#19E6A0]/40"
            >
              {part}
            </span>
          ) : (
            <span key={index}>{part}</span>
          );
        })}
      </>
    );
  } catch {
    return snippet;
  }
}
