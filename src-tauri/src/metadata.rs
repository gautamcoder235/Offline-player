use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::probe::Probe;
use lofty::tag::Accessor;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackMetadata {
    pub id: String,
    pub file_path: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub duration: f64,
    pub duration_str: String,
    pub year: Option<u32>,
    pub bitrate: Option<u32>,
    pub size_bytes: u64,
    pub cover_art: Option<String>,
    pub stream_url: String,
}


fn format_duration(seconds: f64) -> String {
    let total_secs = seconds.round() as u64;
    let mins = total_secs / 60;
    let secs = total_secs % 60;
    format!("{}:{:02}", mins, secs)
}

pub fn extract_metadata(file_path: &Path) -> Option<TrackMetadata> {
    let metadata = std::fs::metadata(file_path).ok()?;
    let size_bytes = metadata.len();
    let file_path_str = file_path.to_string_lossy().to_string();

    let fallback_title = file_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Unknown Track")
        .to_string();

    // Default artist & title attempt by splitting "Artist - Title" if present
    let (default_artist, default_title) = if fallback_title.contains(" - ") {
        let parts: Vec<&str> = fallback_title.splitn(2, " - ").collect();
        (parts[0].trim().to_string(), parts[1].trim().to_string())
    } else {
        ("Unknown Artist".to_string(), fallback_title.clone())
    };

    let probe = Probe::open(file_path).ok()?;
    let tagged_file = match probe.read() {
        Ok(f) => f,
        Err(_) => {
            let stream_url = crate::streamer::get_stream_url(&file_path_str);
            return Some(TrackMetadata {
                id: format!("{:x}", md5_hash(&file_path_str)),
                file_path: file_path_str,
                title: default_title,
                artist: default_artist,
                album: "Offline Music".to_string(),
                duration: 0.0,
                duration_str: "0:00".to_string(),
                year: None,
                bitrate: None,
                size_bytes,
                cover_art: None,
                stream_url,
            });
        }
    };

    let properties = tagged_file.properties();
    let duration = properties.duration().as_secs_f64();
    let duration_str = format_duration(duration);
    let bitrate = properties.audio_bitrate();

    let tag = tagged_file.primary_tag().or_else(|| tagged_file.first_tag());

    let (title, artist, album, year, cover_art) = if let Some(tag) = tag {
        let t = tag
            .title()
            .map(|s| s.to_string())
            .unwrap_or(default_title);
        let a = tag
            .artist()
            .map(|s| s.to_string())
            .unwrap_or(default_artist);
        let al = tag
            .album()
            .map(|s| s.to_string())
            .unwrap_or_else(|| "Offline Music".to_string());
        let y = tag.year();

        let cov = tag.pictures().first().map(|pic| {
            let mime = match pic.mime_type() {
                Some(m) => m.as_str(),
                None => "image/jpeg",
            };
            format!("data:{};base64,{}", mime, BASE64.encode(pic.data()))
        });

        (t, a, al, y, cov)
    } else {
        (default_title, default_artist, "Offline Music".to_string(), None, None)
    };

    let stream_url = crate::streamer::get_stream_url(&file_path_str);

    Some(TrackMetadata {
        id: format!("{:x}", md5_hash(&file_path_str)),
        file_path: file_path_str,
        title,
        artist,
        album,
        duration,
        duration_str,
        year,
        bitrate,
        size_bytes,
        cover_art,
        stream_url,
    })

}

fn md5_hash(input: &str) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    input.hash(&mut hasher);
    hasher.finish()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_extract_user_track_metadata() {
        let dir = PathBuf::from(r"C:\Users\sharm\Music\Spotify offline");
        if dir.exists() {
            let mut total = 0;
            let mut with_art = 0;
            for entry in std::fs::read_dir(&dir).unwrap().flatten() {
                if entry.path().extension().and_then(|s| s.to_str()) == Some("mp3") {
                    total += 1;
                    if let Some(m) = extract_metadata(&entry.path()) {
                        if m.cover_art.is_some() {
                            with_art += 1;
                        }
                    }
                }
            }
            println!("Total MP3s scanned: {}, With cover art: {}", total, with_art);
            assert!(total > 0);
        }
    }
}

