import sys
import os
import json
from pathlib import Path

# Add Savify or virtualenv site-packages to sys.path if needed
script_dir = Path(__file__).resolve().parent
for cand in [
    script_dir / "savify",
    script_dir.parent / "savify",
    Path.home() / ".musicvault" / "savify",
    Path.home() / ".gemini" / "antigravity" / "scratch" / "savify",
]:
    if cand.exists() and str(cand) not in sys.path:
        sys.path.insert(0, str(cand))

try:
    import yt_dlp
except Exception as e:
    print(json.dumps({"success": False, "error": f"Failed to import yt-dlp: {e}"}))
    sys.exit(1)

def resolve(query):
    ydl_opts = {
        'format': 'bestaudio[ext=m4a]/bestaudio/best',
        'noplaylist': True,
        'quiet': True,
        'no_warnings': True,
        'skip_download': True,
        'extract_flat': False,
        'socket_timeout': 8,
        'retries': 1,
        'youtube_include_dash_manifest': False,
        'youtube_include_hls_manifest': False,
        'nocheckcertificate': True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"ytsearch1:{query} audio", download=False)
            if not info:
                return None
            if 'entries' in info and len(info['entries']) > 0:
                entry = info['entries'][0]
                return {
                    'url': entry.get('url'),
                    'duration': entry.get('duration'),
                    'title': entry.get('title'),
                }
            if 'url' in info:
                return {
                    'url': info.get('url'),
                    'duration': info.get('duration'),
                    'title': info.get('title'),
                }
            return None
    except Exception as e:
        return None

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Query parameter missing"}))
        sys.exit(1)

    query = sys.argv[1].strip()
    result = resolve(query)
    if result and result.get('url'):
        print(json.dumps({"success": True, "data": result}))
    else:
        print(json.dumps({"success": False, "error": "Stream not found"}))
