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
                id: deterministic_id(&file_path_str),
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

    let mut title = None;
    let mut artist = None;
    let mut album = None;
    let mut year = None;
    let mut cover_art = None;

    // Search across primary tag and any additional tags
    let tags_to_check: Vec<&lofty::tag::Tag> = if let Some(p) = tagged_file.primary_tag() {
        let mut list = vec![p];
        for t in tagged_file.tags() {
            if !std::ptr::eq(p, t) {
                list.push(t);
            }
        }
        list
    } else {
        tagged_file.tags().iter().collect()
    };

    for tag in tags_to_check {
        if title.is_none() {
            if let Some(t) = tag.title() {
                let trimmed = t.trim();
                if !trimmed.is_empty() {
                    title = Some(trimmed.to_string());
                }
            }
        }
        if artist.is_none() {
            if let Some(a) = tag.artist() {
                let trimmed = a.trim();
                if !trimmed.is_empty() {
                    artist = Some(trimmed.to_string());
                }
            }
        }
        if album.is_none() {
            if let Some(al) = tag.album() {
                let trimmed = al.trim();
                if !trimmed.is_empty() {
                    album = Some(trimmed.to_string());
                }
            }
        }
        if year.is_none() {
            year = tag.year();
        }
        if cover_art.is_none() {
            if let Some(pic) = tag.pictures().first() {
                let mime = match pic.mime_type() {
                    Some(m) => m.as_str(),
                    None => "image/jpeg",
                };
                cover_art = Some(format!("data:{};base64,{}", mime, BASE64.encode(pic.data())));
            }
        }
    }

    // Check adjacent folder files for cover art fallback if not embedded
    if cover_art.is_none() {
        if let Some(parent) = file_path.parent() {
            let candidates = [
                file_path.with_extension("jpg"),
                file_path.with_extension("png"),
                file_path.with_extension("jpeg"),
                parent.join("cover.jpg"),
                parent.join("folder.jpg"),
                parent.join("album.jpg"),
                parent.join("cover.png"),
                parent.join("folder.png"),
            ];
            for cand in candidates {
                if cand.is_file() {
                    if let Ok(bytes) = std::fs::read(&cand) {
                        let mime = if cand.extension().and_then(|s| s.to_str()) == Some("png") {
                            "image/png"
                        } else {
                            "image/jpeg"
                        };
                        cover_art = Some(format!("data:{};base64,{}", mime, BASE64.encode(&bytes)));
                        break;
                    }
                }
            }
        }
    }

    let title = title.unwrap_or(default_title);
    let artist = artist.unwrap_or(default_artist);
    let album = album.unwrap_or_else(|| "Offline Music".to_string());

    let stream_url = crate::streamer::get_stream_url(&file_path_str);

    Some(TrackMetadata {
        id: deterministic_id(&file_path_str),
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

pub fn deterministic_id(input: &str) -> String {
    // 64-bit FNV-1a hash: stable across all Rust compiler versions and OS platforms
    let mut hash: u64 = 0xcbf29ce484222325;
    for byte in input.as_bytes() {
        hash ^= *byte as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{:016x}", hash)
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
                        assert!(!m.id.is_empty());
                        assert!(!m.title.is_empty());
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

