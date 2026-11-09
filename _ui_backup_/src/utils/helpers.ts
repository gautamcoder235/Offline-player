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
  const hue = Math.abs(hash) % 360;
  return {
    bg: `hsl(${hue}, 65%, 25%)`,
    text: `hsl(${hue}, 80%, 75%)`,
    glow: `hsla(${hue}, 75%, 45%, 0.45)`,
  };
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
