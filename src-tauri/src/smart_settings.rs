use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmartPlaybackSettings {
    pub enabled: bool,
    pub auto_pause: bool,
    pub auto_resume: bool,
    pub resume_delay_ms: u64,
    pub min_audio_duration_ms: u64,
    pub activity_threshold: f32,
    pub excluded_applications: Vec<String>,
}

impl Default for SmartPlaybackSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            auto_pause: true,
            auto_resume: true,
            resume_delay_ms: 2000,
            min_audio_duration_ms: 300,
            activity_threshold: 0.005,
            excluded_applications: vec![
                "discord.exe".to_string(),
            ],
        }
    }
}

pub fn get_smart_settings_path() -> PathBuf {
    let base = std::env::var("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."));
    let dir = base.join("OfflinePlayer");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("smart_playback_settings.json")
}

pub fn load_smart_settings() -> SmartPlaybackSettings {
    let path = get_smart_settings_path();
    if path.exists() {
        if let Ok(data) = std::fs::read_to_string(&path) {
            if let Ok(settings) = serde_json::from_str::<SmartPlaybackSettings>(&data) {
                return settings;
            }
        }
    }
    SmartPlaybackSettings::default()
}

pub fn save_smart_settings(settings: &SmartPlaybackSettings) {
    let path = get_smart_settings_path();
    if let Ok(json) = serde_json::to_string_pretty(settings) {
        let _ = std::fs::write(path, json);
    }
}
