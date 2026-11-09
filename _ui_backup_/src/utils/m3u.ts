import { Track } from '../types';

export function generateM3U8(playlistName: string, tracks: Track[]): string {
  let content = '#EXTM3U\n';
  content += '#EXTENC:UTF-8\n';
  content += `#PLAYLIST:${playlistName}\n`;

  for (const track of tracks) {
    const durationSec = Math.round(track.duration || 0);
    const title = track.title || 'Unknown Title';
    const artist = track.artist || 'Unknown Artist';
    content += `#EXTINF:${durationSec},${artist} - ${title}\n`;
    content += `${track.file_path}\n`;
  }

  return content;
}

export function parseM3U8(content: string): { name?: string; entries: Array<{ duration: number; title: string; artist?: string; path: string }> } {
  const lines = content.split(/\r?\n/);
  const entries: Array<{ duration: number; title: string; artist?: string; path: string }> = [];
  let name: string | undefined = undefined;

  let currentDuration = 0;
  let currentTitle = '';
  let currentArtist = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith('#PLAYLIST:')) {
      name = line.substring(10).trim();
    } else if (line.startsWith('#EXTINF:')) {
      // #EXTINF:duration,Artist - Title OR #EXTINF:duration,Title
      const infoPart = line.substring(8);
      const firstComma = infoPart.indexOf(',');
      if (firstComma !== -1) {
        currentDuration = parseInt(infoPart.substring(0, firstComma).trim(), 10) || 0;
        const textPart = infoPart.substring(firstComma + 1).trim();
        const hyphenIndex = textPart.indexOf(' - ');
        if (hyphenIndex !== -1) {
          currentArtist = textPart.substring(0, hyphenIndex).trim();
          currentTitle = textPart.substring(hyphenIndex + 3).trim();
        } else {
          currentArtist = '';
          currentTitle = textPart;
        }
      }
    } else if (!line.startsWith('#')) {
      entries.push({
        duration: currentDuration,
        title: currentTitle || 'Unknown Title',
        artist: currentArtist || undefined,
        path: line
      });
      // reset for next entry
      currentDuration = 0;
      currentTitle = '';
      currentArtist = '';
    }
  }

  return { name, entries };
}

export function downloadBlob(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
