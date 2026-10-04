import sys
import os
import json
import time
from pathlib import Path

# Add Savify project directory to sys.path
SAVIFY_DIR = Path(r"C:\Users\sharm\.gemini\antigravity\scratch\savify")
if str(SAVIFY_DIR) not in sys.path:
    sys.path.insert(0, str(SAVIFY_DIR))

try:
    from savify import Savify
    from savify.types import Quality, Format, Type
    from savify.utils import PathHolder, safe_path_string
    from savify.spotify import Spotify
except Exception as e:
    print(json.dumps({"type": "error", "message": f"Failed to import Savify: {str(e)}"}))
    sys.exit(1)

def emit(data):
    print(json.dumps(data), flush=True)

def main():
    if len(sys.argv) < 2:
        emit({"type": "error", "message": "Usage: savify_bridge.py <spotify_url_or_search> [output_dir]"})
        sys.exit(1)

    query = sys.argv[1].strip()
    if not query or query.startswith("-"):
        emit({"type": "error", "message": "Invalid Spotify link or query provided."})
        sys.exit(1)

    output_dir = sys.argv[2] if len(sys.argv) > 2 else r"C:\Users\sharm\Music\Spotify offline"
    out_path = Path(output_dir)
    out_path.mkdir(parents=True, exist_ok=True)

    emit({"type": "status", "message": f"Connecting to Spotify...", "percent": 5})

    try:
        # Avoid 5-second GitHub update check latency
        Savify.check_for_updates = lambda self: None

        path_holder = PathHolder(downloads_path=str(out_path))
        savify_inst = Savify(
            quality=Quality.Q320K,
            download_format=Format.MP3,
            path_holder=path_holder,
            retry=2,
            skip_cover_art=False
        )

        emit({"type": "status", "message": "Fetching metadata and track list...", "percent": 15})
        queue = savify_inst._parse_query(query)

        if not queue:
            emit({"type": "error", "message": "No tracks found for the provided query or URL."})
            sys.exit(0)

        # Deduplication
        seen = set()
        unique_queue = []
        for track in queue:
            artist_key = track.artists[0].lower().strip() if track.artists else ""
            title_key = track.name.lower().strip()
            key = (artist_key, title_key)
            if key not in seen:
                seen.add(key)
                unique_queue.append(track)

        total = len(unique_queue)

        # Detect playlist / album name
        detected_collection_name = ""
        is_collection = False
        query_lower = query.lower()
        if "playlist" in query_lower or "album" in query_lower:
            is_collection = True
            try:
                import urllib.request
                import re
                req = urllib.request.Request(query, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
                with urllib.request.urlopen(req, timeout=3.5) as resp:
                    html = resp.read().decode('utf-8', errors='ignore')
                    m = re.search(r'<meta property="og:title" content="([^"]+)"', html)
                    if not m:
                        m = re.search(r'<title>([^<|]+)', html)
                    if m:
                        detected_collection_name = m.group(1).strip()
            except Exception:
                pass

            if not detected_collection_name and unique_queue and unique_queue[0].album_name:
                detected_collection_name = unique_queue[0].album_name
            elif not detected_collection_name:
                detected_collection_name = "Downloaded Playlist"

        track_list_preview = [
            {"title": t.name, "artists": t.artists, "album": t.album_name}
            for t in unique_queue[:50]
        ]

        emit({
            "type": "tracklist",
            "total": total,
            "tracks": track_list_preview,
            "playlist_name": detected_collection_name if is_collection else None,
            "is_collection": is_collection,
            "percent": 25,
            "message": f"Found {total} track(s) to process."
        })

        # Process downloads
        succeeded = 0
        failed = 0

        for idx, track in enumerate(unique_queue):
            expected_filename = safe_path_string(f"{str(track)}.mp3")
            expected_file = out_path / expected_filename
            current_num = idx + 1
            progress_pct = int(25 + ((current_num - 1) / total) * 70)

            # Skip if already exists and > 500KB
            if expected_file.is_file() and expected_file.stat().st_size > 500_000:
                succeeded += 1
                artist_name = track.artists[0] if track.artists else "Unknown Artist"
                emit({
                    "type": "track_done",
                    "current": current_num,
                    "total": total,
                    "percent": int(25 + (current_num / total) * 70),
                    "track": str(track),
                    "title": track.name,
                    "artist": artist_name,
                    "album": track.album_name or "",
                    "file_path": str(expected_file),
                    "status": "already_exists",
                    "message": f"Already downloaded: {str(track)}"
                })
                continue

            emit({
                "type": "track_progress",
                "current": current_num,
                "total": total,
                "percent": progress_pct,
                "track": str(track),
                "status": "downloading",
                "message": f"Downloading ({current_num}/{total}): {str(track)}"
            })

            try:
                res = savify_inst._download(track)
                if res and res.get("returncode") == 0:
                    succeeded += 1
                    artist_name = track.artists[0] if track.artists else "Unknown Artist"
                    actual_location = res.get("location") if res else None
                    if actual_location and os.path.isfile(str(actual_location)):
                        file_location = str(actual_location)
                    elif expected_file.is_file():
                        file_location = str(expected_file)
                    else:
                        file_location = str(actual_location or expected_file)
                    emit({
                        "type": "track_done",
                        "current": current_num,
                        "total": total,
                        "percent": int(25 + (current_num / total) * 70),
                        "track": str(track),
                        "title": track.name,
                        "artist": artist_name,
                        "album": track.album_name or "",
                        "file_path": file_location,
                        "status": "completed",
                        "message": f"Completed: {str(track)}"
                    })
                else:
                    failed += 1
                    err_msg = res.get("error", "Unknown download error") if res else "Unknown error"
                    emit({
                        "type": "track_progress",
                        "current": current_num,
                        "total": total,
                        "percent": int(25 + (current_num / total) * 70),
                        "track": str(track),
                        "status": "failed",
                        "message": f"Failed: {str(track)} ({err_msg})"
                    })
            except Exception as ex:
                failed += 1
                emit({
                    "type": "track_progress",
                    "current": current_num,
                    "total": total,
                    "percent": int(25 + (current_num / total) * 70),
                    "track": str(track),
                    "status": "failed",
                    "message": f"Error: {str(track)} ({str(ex)})"
                })

        emit({
            "type": "completed",
            "percent": 100,
            "total": total,
            "succeeded": succeeded,
            "failed": failed,
            "playlist_name": detected_collection_name if is_collection else None,
            "is_collection": is_collection,
            "message": f"Finished downloading: {succeeded} succeeded, {failed} failed."
        })

    except Exception as e:
        emit({"type": "error", "message": f"Downloader error: {str(e)}"})
        sys.exit(1)

if __name__ == "__main__":
    main()
