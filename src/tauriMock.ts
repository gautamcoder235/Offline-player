/**
 * Browser preview fallback mock for Tauri internals when running outside the native Tauri shell.
 * Imported before App in main.tsx so CSP stays free of inline <script> tags.
 */
const win = typeof window !== 'undefined' ? (window as unknown as Record<string, any>) : null;

if (win && !win.__TAURI_INTERNALS__) {
  const mockTracks = [
    {
      id: 'mock-1',
      title: 'Dil Mein Ho Tum (From "Cheat India")',
      artist: 'Armaan Malik, Rochak Kohli, Bappi Lahiri',
      album: 'Dil Mein Ho Tum',
      duration: 346,
      duration_str: '5:46',
      file_path: 'C:/Music/Dil Mein Ho Tum.mp3',
      cover_art: null,
      track_number: 1,
      genre: 'Bollywood',
      year: 2019,
    },
    {
      id: 'mock-2',
      title: 'Pehla Pyaar',
      artist: 'Armaan Malik, Vishal Mishra',
      album: 'Kabir Singh',
      duration: 278,
      duration_str: '4:38',
      file_path: 'C:/Music/Pehla Pyaar.mp3',
      cover_art: null,
      track_number: 2,
      genre: 'Bollywood',
      year: 2019,
    },
    {
      id: 'mock-3',
      title: 'Bol Do Na Zara',
      artist: 'Armaan Malik, Amaal Mallik',
      album: 'Azhar',
      duration: 329,
      duration_str: '5:29',
      file_path: 'C:/Music/Bol Do Na Zara.mp3',
      cover_art: null,
      track_number: 3,
      genre: 'Bollywood',
      year: 2016,
    },
    {
      id: 'mock-4',
      title: 'Zameen',
      artist: 'Aryan Singh',
      album: 'Zameen - Single',
      duration: 190,
      duration_str: '3:10',
      file_path: 'C:/Music/Aryan Singh - Zameen.mp3',
      cover_art: null,
      track_number: 4,
      genre: 'Indie',
      year: 2023,
    },
  ];

  win.__TAURI_INTERNALS__ = {
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { label: 'main' },
      windows: [{ label: 'main' }],
      webviews: [{ label: 'main' }],
    },
    invoke: async (cmd: string, args?: { query?: string; country?: string }) => {
      if (cmd === 'scan_library' || cmd === 'load_cached_library') return mockTracks;
      if (cmd === 'get_current_settings') return null;
      if (cmd === 'get_system_volume') return 0.8;
      if (cmd === 'is_maximized') return false;
      if (cmd === 'get_streamer_token') return 'mock-browser-token';
      if (cmd === 'search_spotify') {
        const q = encodeURIComponent(args?.query || '');
        const cc = args?.country || 'IN';
        try {
          const res = await fetch(
            `https://itunes.apple.com/search?term=${q}&media=music&entity=song&limit=25&country=${cc}`
          ).then((r) => r.json());
          return (res.results || []).map((item: Record<string, any>) => ({
            track_name: item.trackName,
            artist_name: item.artistName,
            album_name: item.collectionName || 'Unknown Album',
            preview_url: item.previewUrl,
            artwork_url: item.artworkUrl100
              ? String(item.artworkUrl100).replace('100x100', '600x600')
              : null,
            duration_ms: item.trackTimeMillis || 0,
            track_url: item.trackViewUrl,
          }));
        } catch {
          return [];
        }
      }
      return null;
    },
    transformCallback: () => 1,
    ipc: () => {},
  };

  win.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: () => {},
  };
}

export {};
