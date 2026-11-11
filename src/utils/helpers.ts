import { LyricLine, ParsedLyrics } from '../types';

export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function getTrackColor(title: string, artist: string): { bg: string; text: string; glow: string } {
  const str = `${title}-${artist}`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Curated acoustic analogous / harmonized palette for fallback badges (avoids chaotic 360° rainbow saturation)
  const HARMONIZED_TONES = [
    { bg: 'hsl(162, 36%, 17%)', text: 'hsl(162, 72%, 74%)', glow: 'hsla(162, 70%, 45%, 0.25)' }, // Emerald Slate
    { bg: 'hsl(182, 34%, 18%)', text: 'hsl(182, 68%, 74%)', glow: 'hsla(182, 65%, 45%, 0.25)' }, // Oceanic Teal
    { bg: 'hsl(198, 35%, 19%)', text: 'hsl(198, 70%, 76%)', glow: 'hsla(198, 68%, 48%, 0.25)' }, // Nordic Cyan
    { bg: 'hsl(224, 30%, 20%)', text: 'hsl(224, 65%, 80%)', glow: 'hsla(224, 60%, 50%, 0.25)' }, // Deep Indigo
    { bg: 'hsl(256, 26%, 20%)', text: 'hsl(256, 58%, 78%)', glow: 'hsla(256, 55%, 48%, 0.25)' }, // Smoked Violet
    { bg: 'hsl(348, 28%, 20%)', text: 'hsl(348, 62%, 78%)', glow: 'hsla(348, 60%, 48%, 0.25)' }, // Muted Rose
    { bg: 'hsl(36, 32%, 18%)', text: 'hsl(36, 68%, 76%)', glow: 'hsla(36, 65%, 46%, 0.25)' },   // Warm Cedar
    { bg: 'hsl(140, 24%, 18%)', text: 'hsl(140, 50%, 75%)', glow: 'hsla(140, 48%, 45%, 0.25)' }, // Titanium Sage
  ];

  const index = Math.abs(hash) % HARMONIZED_TONES.length;
  return HARMONIZED_TONES[index];
}

export function parseLrcLyrics(lrcText: string): ParsedLyrics {
  if (!lrcText || !lrcText.trim()) {
    return { isSynced: false, lines: [], rawText: '', source: 'none' };
  }

  const lines = lrcText.split(/\r?\n/);
  const timeRegex = /\[(\d{2}):(\d{2})\.?(\d{2,3})?\]/g;
  const parsedLines: LyricLine[] = [];
  let isSynced = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const matches = [...line.matchAll(timeRegex)];
    if (matches.length > 0) {
      isSynced = true;
      const text = line.replace(timeRegex, '').trim();
      for (const match of matches) {
        const mins = parseInt(match[1], 10);
        const secs = parseInt(match[2], 10);
        const msStr = match[3] || '0';
        const ms = parseInt(msStr.padEnd(3, '0').slice(0, 3), 10);
        const time = mins * 60 + secs + ms / 1000;
        parsedLines.push({ time, text });
      }
    }
  }

  if (isSynced && parsedLines.length > 0) {
    parsedLines.sort((a, b) => a.time - b.time);
    return {
      isSynced: true,
      lines: parsedLines,
      rawText: lrcText,
      source: 'synced',
    };
  }

  // Fallback plain lines
  const plainLines = lines
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('[ti:') && !l.startsWith('[ar:') && !l.startsWith('[al:'))
    .map((text, idx) => ({ time: idx * 4, text }));

  return {
    isSynced: false,
    lines: plainLines,
    rawText: lrcText,
    source: 'plain',
  };
}
