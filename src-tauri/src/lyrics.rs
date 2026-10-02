use lofty::file::TaggedFileExt;
use lofty::probe::Probe;
use lofty::tag::ItemKey;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LyricsResult {
    pub synced: bool,
    pub lyrics: String,
    pub source: String,
}

pub fn get_local_lyrics(file_path: &str) -> Option<LyricsResult> {
    let path = PathBuf::from(file_path);

    // 1. Check for .lrc file alongside audio file
    let lrc_path = path.with_extension("lrc");
    if lrc_path.exists() && lrc_path.is_file() {
        if let Ok(content) = std::fs::read_to_string(&lrc_path) {
            let is_synced = content.contains('[') && content.contains(']');
            return Some(LyricsResult {
                synced: is_synced,
                lyrics: content,
                source: "lrc_file".to_string(),
            });
        }
    }

    // 2. Check for .mp3.lrc file alongside audio file
    let alt_lrc = PathBuf::from(format!("{}.lrc", file_path));
    if alt_lrc.exists() && alt_lrc.is_file() {
        if let Ok(content) = std::fs::read_to_string(&alt_lrc) {
            let is_synced = content.contains('[') && content.contains(']');
            return Some(LyricsResult {
                synced: is_synced,
                lyrics: content,
                source: "lrc_file".to_string(),
            });
        }
    }

    // 3. Check for embedded tags (Lyrics item)
    if let Ok(probe) = Probe::open(&path) {
        if let Ok(tagged_file) = probe.read() {
            if let Some(tag) = tagged_file.primary_tag().or_else(|| tagged_file.first_tag()) {
                if let Some(lyrics_val) = tag.get_string(&ItemKey::Lyrics) {
                    let text = lyrics_val.to_string();
                    let is_synced = text.contains('[') && text.contains(']');
                    return Some(LyricsResult {
                        synced: is_synced,
                        lyrics: text,
                        source: "embedded_tag".to_string(),
                    });
                }
            }
        }
    }

    None
}

pub fn save_lrc_file(file_path: &str, lyrics_content: &str) -> Result<(), String> {
    let path = Path::new(file_path);
    let lrc_path = path.with_extension("lrc");
    std::fs::write(lrc_path, lyrics_content).map_err(|e| e.to_string())
}
