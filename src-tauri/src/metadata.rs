use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use lofty::file::{AudioFile, TaggedFileExt};
use lofty::picture::{MimeType, Picture, PictureType};
use lofty::probe::Probe;
use lofty::tag::{Accessor, ItemKey};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

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
    pub lyrics: Option<String>,
    pub replay_gain: Option<f64>,
    pub track_number: Option<u32>,
    pub disc_number: Option<u32>,
    pub genre: Option<String>,
}

pub fn save_track_metadata(
    file_path: &Path,
    title: &str,
    artist: &str,
    album: &str,
    year: Option<u32>,
    cover_art: Option<String>,
) -> Result<TrackMetadata, String> {
    let probe = Probe::open(file_path).map_err(|e| e.to_string())?;
    let mut tagged_file = probe.read().map_err(|e| e.to_string())?;

    let tag = match tagged_file.primary_tag_mut() {
        Some(t) => t,
        None => {
            if let Some(first) = tagged_file.first_tag_mut() {
                first
            } else {
                let tag_type = tagged_file.primary_tag_type();
                tagged_file.insert_tag(lofty::tag::Tag::new(tag_type));
                tagged_file.primary_tag_mut().ok_or("Failed to create tag")?
            }
        }
    };

    tag.set_title(title.to_string());
    tag.set_artist(artist.to_string());
    tag.set_album(album.to_string());
    if let Some(y) = year {
        tag.set_year(y);
    }

    if let Some(art_str) = cover_art {
        if !art_str.trim().is_empty() {
            let raw_base64 = if let Some(idx) = art_str.find(";base64,") {
                &art_str[idx + 8..]
            } else {
                &art_str
            };

            if let Ok(bytes) = BASE64.decode(raw_base64.trim()) {
                let mime = if art_str.contains("image/png") {
                    MimeType::Png
                } else {
                    MimeType::Jpeg
                };
                let picture = Picture::new_unchecked(PictureType::CoverFront, Some(mime), None, bytes);
                tag.set_picture(0, picture);
            }
        }
    }

    tagged_file.save_to_path(file_path, lofty::config::WriteOptions::default()).map_err(|e| e.to_string())?;

    let covers_dir = crate::get_covers_dir();
    let track_id = deterministic_id(&file_path.to_string_lossy());
    let _ = std::fs::remove_file(covers_dir.join(format!("{}.jpg", track_id)));
    let _ = std::fs::remove_file(covers_dir.join(format!("{}.png", track_id)));
    let _ = std::fs::remove_file(covers_dir.join(format!("{}.txt", track_id)));
    let term = format!("{} {}", artist.trim(), title.trim());
    let term_hash = deterministic_id(&term);
    let _ = std::fs::remove_file(covers_dir.join(format!("{}.jpg", term_hash)));
    let _ = std::fs::remove_file(covers_dir.join(format!("{}.png", term_hash)));
    let _ = std::fs::remove_file(covers_dir.join(format!("{}.txt", term_hash)));

    extract_metadata(file_path).ok_or_else(|| "Failed to re-read metadata".to_string())
}



fn format_duration(seconds: f64) -> String {
    let total_secs = seconds.round() as u64;
    let mins = total_secs / 60;
    let secs = total_secs % 60;
    format!("{}:{:02}", mins, secs)
}

fn parse_number_tag(tag: &lofty::tag::Tag, accessor_val: Option<u32>, key: &ItemKey) -> Option<u32> {
    if let Some(val) = accessor_val.filter(|&n| n > 0) {
        return Some(val);
    }
    if let Some(s) = tag.get_string(key) {
        let clean = s.split('/').next().unwrap_or("").trim();
        if let Ok(n) = clean.parse::<u32>() {
            if n > 0 {
                return Some(n);
            }
        }
    }
    None
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
    let clean_fallback = fallback_title.trim_start_matches(|c| c == ' ' || c == '-').trim();
    let (default_artist, default_title) = if clean_fallback.contains(" - ") {
        let parts: Vec<&str> = clean_fallback.splitn(2, " - ").collect();
        let artist_candidate = parts[0].trim();
        let title_candidate = parts[1].trim();
        if artist_candidate.is_empty() {
            ("Unknown Artist".to_string(), title_candidate.to_string())
        } else {
            (artist_candidate.to_string(), title_candidate.to_string())
        }
    } else {
        ("Unknown Artist".to_string(), clean_fallback.to_string())
    };

    let probe = Probe::open(file_path).ok()?;
    let tagged_file = match probe.read() {
        Ok(f) => f,
        Err(_) => {
            let stream_url = crate::streamer::get_stream_url(&file_path_str);
            let lrc_path = file_path.with_extension("lrc");
            let lyrics = if lrc_path.is_file() {
                std::fs::read(&lrc_path).map(|b| String::from_utf8_lossy(&b).to_string()).ok()
            } else {
                let alt_lrc = PathBuf::from(format!("{}.lrc", file_path_str));
                if alt_lrc.is_file() {
                    std::fs::read(&alt_lrc).map(|b| String::from_utf8_lossy(&b).to_string()).ok()
                } else {
                    None
                }
            };
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
                lyrics,
                replay_gain: None,
                track_number: None,
                disc_number: None,
                genre: None,
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
    let mut has_embedded_art = false;
    let mut lyrics = None;
    let mut replay_gain = None;
    let mut track_number = None;
    let mut disc_number = None;
    let mut genre = None;

    // Check adjacent .lrc file (preferred source)
    let lrc_path = file_path.with_extension("lrc");
    if lrc_path.is_file() {
        lyrics = std::fs::read(&lrc_path).map(|b| String::from_utf8_lossy(&b).to_string()).ok();
    } else {
        let alt_lrc = PathBuf::from(format!("{}.lrc", file_path_str));
        if alt_lrc.is_file() {
            lyrics = std::fs::read(&alt_lrc).map(|b| String::from_utf8_lossy(&b).to_string()).ok();
        }
    }

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
        if track_number.is_none() {
            track_number = parse_number_tag(tag, tag.track(), &ItemKey::TrackNumber);
        }
        if disc_number.is_none() {
            disc_number = parse_number_tag(tag, tag.disk(), &ItemKey::DiscNumber);
        }
        if genre.is_none() {
            if let Some(g) = tag.genre().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()) {
                genre = Some(g);
            } else if let Some(g) = tag.get_string(&ItemKey::Genre).map(|s| s.trim().to_string()).filter(|s| !s.is_empty()) {
                genre = Some(g);
            }
        }
        if !has_embedded_art && !tag.pictures().is_empty() {
            has_embedded_art = true;
        }
        if lyrics.is_none() {
            if let Some(lyr) = tag.get_string(&ItemKey::Lyrics) {
                let trimmed = lyr.trim();
                if !trimmed.is_empty() {
                    lyrics = Some(trimmed.to_string());
                }
            }
        }
        if replay_gain.is_none() {
            if let Some(rg) = tag.get_string(&ItemKey::ReplayGainTrackGain) {
                let cleaned = rg.replace("dB", "").replace("db", "").trim().to_string();
                if let Ok(val) = cleaned.parse::<f64>() {
                    replay_gain = Some(val);
                }
            }
        }
    }

    // Check track-specific image files first (e.g. SongName.jpg or SongName.png)
    let mut has_track_specific_art = false;
    let track_specific = [
        file_path.with_extension("jpg"),
        file_path.with_extension("png"),
        file_path.with_extension("jpeg"),
    ];
    for cand in &track_specific {
        if cand.is_file() {
            has_track_specific_art = true;
            break;
        }
    }

    // For directory-level artwork (cover.jpg/folder.jpg), only accept if the parent directory
    // is explicitly named after this album or artist (to prevent a rogue folder.jpg in a shared
    // music downloads folder from contaminating hundreds of unrelated songs).
    let mut has_folder_art = false;
    if let (Some(parent), Some(alb)) = (file_path.parent(), &album) {
        let alb_clean = alb.trim().to_lowercase();
        let folder_name = parent
            .file_name()
            .and_then(|n| n.to_str())
            .map(|s| s.trim().to_lowercase())
            .unwrap_or_default();

        if !alb_clean.is_empty() && (folder_name == alb_clean || folder_name.contains(&alb_clean)) {
            let folder_cands = [
                parent.join("cover.jpg"),
                parent.join("cover.png"),
                parent.join("album.jpg"),
                parent.join("album.png"),
                parent.join("folder.jpg"),
                parent.join("folder.png"),
            ];
            for cand in &folder_cands {
                if cand.is_file() {
                    has_folder_art = true;
                    break;
                }
            }
        }
    }

    let title = title.unwrap_or(default_title);
    let artist = artist.unwrap_or(default_artist);
    let album = album.unwrap_or_else(|| "Offline Music".to_string());

    // Check local cover art cache in APPDATA
    let clean_artist = if artist.to_lowercase().contains("unknown") { "" } else { artist.trim() };
    let term = if clean_artist.is_empty() {
        title.trim().to_string()
    } else {
        format!("{} {}", clean_artist, title.trim())
    };
    let term_hash = deterministic_id(&term);
    let track_id = deterministic_id(&file_path_str);

    let mut appdata_art_id = None;
    let covers_dir = crate::get_covers_dir();
    if covers_dir.join(format!("{}.jpg", term_hash)).is_file()
        || covers_dir.join(format!("{}.png", term_hash)).is_file()
        || covers_dir.join(format!("{}.txt", term_hash)).is_file()
    {
        appdata_art_id = Some(term_hash);
    } else if covers_dir.join(format!("{}.jpg", track_id)).is_file()
        || covers_dir.join(format!("{}.png", track_id)).is_file()
        || covers_dir.join(format!("{}.txt", track_id)).is_file()
    {
        appdata_art_id = Some(track_id.clone());
    }

    let has_artwork = has_embedded_art || has_track_specific_art || has_folder_art || appdata_art_id.is_some();
    let cover_art = if has_artwork {
        let art_id = appdata_art_id.unwrap_or_else(|| track_id.clone());
        Some(crate::streamer::get_cover_url(&art_id, &file_path_str))
    } else {
        None
    };

    let stream_url = crate::streamer::get_stream_url(&file_path_str);

    Some(TrackMetadata {
        id: track_id,
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
        lyrics,
        replay_gain,
        track_number,
        disc_number,
        genre,
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
        let dir = dirs::audio_dir().unwrap_or_else(|| PathBuf::from("Music"));
        if dir.exists() {
            let mut total = 0;
            let mut with_art = 0;
            let mut with_lyrics = 0;
            if let Ok(read_dir) = std::fs::read_dir(&dir) {
                for entry in read_dir.flatten() {
                    if entry.path().extension().and_then(|s| s.to_str()) == Some("mp3") {
                        total += 1;
                        if let Some(m) = extract_metadata(&entry.path()) {
                            assert!(!m.id.is_empty());
                            assert!(!m.title.is_empty());
                            if m.cover_art.is_some() {
                                with_art += 1;
                            }
                            if m.lyrics.is_some() {
                                with_lyrics += 1;
                            }
                        }
                    }
                }
            }
            println!("Total MP3s scanned: {}, With cover art: {}, With lyrics: {}", total, with_art, with_lyrics);
        }
    }

    #[test]
    fn test_save_track_metadata_persistence() {
        let dir = dirs::audio_dir().unwrap_or_else(|| PathBuf::from("Music"));
        let mut sample_mp3 = None;
        if dir.exists() {
            if let Ok(read_dir) = std::fs::read_dir(&dir) {
                for entry in read_dir.flatten() {
                    if entry.path().extension().and_then(|s| s.to_str()) == Some("mp3") {
                        sample_mp3 = Some(entry.path());
                        break;
                    }
                }
            }
        }

        if let Some(src) = sample_mp3 {
            let temp_path = std::env::temp_dir().join(format!("test_track_{}.mp3", deterministic_id("test")));
            let _ = std::fs::copy(&src, &temp_path);
            if temp_path.exists() {
                let test_title = "Antigravity Test Title";
                let test_artist = "Antigravity Test Artist";
                let test_album = "Antigravity Test Album";
                let test_year = Some(2026);
                let test_art = Some("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==".to_string());

                let result = save_track_metadata(
                    &temp_path,
                    test_title,
                    test_artist,
                    test_album,
                    test_year,
                    test_art,
                );

                assert!(result.is_ok(), "save_track_metadata failed: {:?}", result.err());
                let meta = result.unwrap();
                assert_eq!(meta.title, test_title);
                assert_eq!(meta.artist, test_artist);
                assert_eq!(meta.album, test_album);
                assert_eq!(meta.year, test_year);
                assert!(meta.cover_art.is_some());
                assert!(meta.cover_art.as_ref().unwrap().contains("/cover?id="));
                assert!(!meta.cover_art.as_ref().unwrap().starts_with("data:image"));

                // Re-extract from disk to prove lofty persisted tags to the file
                let re_extracted = extract_metadata(&temp_path).expect("Failed to re-extract saved file");
                assert_eq!(re_extracted.title, test_title);
                assert_eq!(re_extracted.artist, test_artist);
                assert_eq!(re_extracted.album, test_album);
                assert_eq!(re_extracted.year, test_year);
                assert!(re_extracted.cover_art.is_some());
                assert!(re_extracted.cover_art.as_ref().unwrap().contains("/cover?id="));
                assert!(!re_extracted.cover_art.as_ref().unwrap().starts_with("data:image"));

                let _ = std::fs::remove_file(temp_path);
            }
        }
    }

    #[test]
    fn test_track_metadata_fields() {
        let meta = TrackMetadata {
            id: "test_id".to_string(),
            file_path: "test.mp3".to_string(),
            title: "Test".to_string(),
            artist: "Artist".to_string(),
            album: "Album".to_string(),
            duration: 120.0,
            duration_str: "2:00".to_string(),
            year: Some(2025),
            bitrate: Some(320),
            size_bytes: 1024,
            cover_art: None,
            stream_url: "http://127.0.0.1:4545/stream/test.mp3".to_string(),
            lyrics: None,
            replay_gain: None,
            track_number: Some(4),
            disc_number: Some(2),
            genre: Some("Rock".to_string()),
        };
        assert_eq!(meta.track_number, Some(4));
        assert_eq!(meta.disc_number, Some(2));
        assert_eq!(meta.genre, Some("Rock".to_string()));

        let json = serde_json::to_string(&meta).unwrap();
        let deserialized: TrackMetadata = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.track_number, Some(4));
        assert_eq!(deserialized.disc_number, Some(2));
        assert_eq!(deserialized.genre, Some("Rock".to_string()));
    }

    #[test]
    fn test_lofty_tag_track_disc_genre() {
        use lofty::tag::{Accessor, ItemKey, ItemValue, Tag, TagItem, TagType};
        let mut tag = Tag::new(TagType::Id3v2);
        tag.set_track(5);
        tag.set_disk(2);
        tag.set_genre("Jazz".to_string());

        assert_eq!(tag.track(), Some(5));
        assert_eq!(tag.disk(), Some(2));
        assert_eq!(tag.genre().as_deref(), Some("Jazz"));

        // Test string insertion e.g. "03/12" and "1/2"
        let mut tag2 = Tag::new(TagType::Id3v2);
        tag2.insert(TagItem::new(ItemKey::TrackNumber, ItemValue::Text("03/12".to_string())));
        tag2.insert(TagItem::new(ItemKey::DiscNumber, ItemValue::Text("1/2".to_string())));
        tag2.insert(TagItem::new(ItemKey::Genre, ItemValue::Text("Classical".to_string())));

        let parsed_track = parse_number_tag(&tag2, tag2.track(), &ItemKey::TrackNumber);
        let parsed_disk = parse_number_tag(&tag2, tag2.disk(), &ItemKey::DiscNumber);

        assert_eq!(parsed_track, Some(3));
        assert_eq!(parsed_disk, Some(1));
        assert_eq!(tag2.genre().as_deref().or_else(|| tag2.get_string(&ItemKey::Genre)), Some("Classical"));
    }
}

