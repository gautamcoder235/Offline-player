pub mod downloader;
pub mod lyrics;
pub mod metadata;
pub mod streamer;

use downloader::{run_download, stop_download, DownloaderState};
use lyrics::{get_local_lyrics, save_lrc_file, LyricsResult};
use metadata::{extract_metadata, TrackMetadata};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, State};
use walkdir::WalkDir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub music_directories: Vec<String>,
    pub download_directory: String,
    pub volume: f32,
    pub equalizer_preset: String,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            music_directories: vec![r"C:\Users\sharm\Music\Spotify offline".to_string()],
            download_directory: r"C:\Users\sharm\Music\Spotify offline".to_string(),
            volume: 0.8,
            equalizer_preset: "Flat".to_string(),
        }
    }
}

pub struct AppState {
    pub downloader: DownloaderState,
    pub settings: Mutex<AppSettings>,
}

fn get_settings_file_path() -> PathBuf {
    let base = std::env::var("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."));
    let dir = base.join("OfflinePlayer");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("settings.json")
}


fn load_persisted_settings() -> AppSettings {
    let file = get_settings_file_path();
    if file.exists() {
        if let Ok(data) = std::fs::read_to_string(&file) {
            if let Ok(settings) = serde_json::from_str::<AppSettings>(&data) {
                return settings;
            }
        }
    }
    AppSettings::default()
}

fn persist_settings(settings: &AppSettings) {
    let file = get_settings_file_path();
    if let Ok(json) = serde_json::to_string_pretty(settings) {
        let _ = std::fs::write(file, json);
    }
}

#[tauri::command]
fn scan_library(directories: Option<Vec<String>>) -> Vec<TrackMetadata> {
    let dirs_to_scan = directories.unwrap_or_else(|| {
        vec![r"C:\Users\sharm\Music\Spotify offline".to_string()]
    });

    let mut tracks = Vec::new();
    let mut seen_paths = std::collections::HashSet::new();

    let valid_extensions = ["mp3", "m4a", "flac", "wav", "ogg"];

    for dir_path in dirs_to_scan {
        let p = Path::new(&dir_path);
        if !p.exists() || !p.is_dir() {
            continue;
        }

        for entry in WalkDir::new(p).follow_links(true).into_iter().flatten() {
            if entry.file_type().is_file() {
                if let Some(ext) = entry.path().extension().and_then(|s| s.to_str()) {
                    if valid_extensions.contains(&ext.to_lowercase().as_str()) {
                        let path_str = entry.path().to_string_lossy().to_string();
                        if seen_paths.insert(path_str) {
                            if let Some(meta) = extract_metadata(entry.path()) {
                                tracks.push(meta);
                            }
                        }
                    }
                }
            }
        }
    }

    // Sort by artist, then title
    tracks.sort_by(|a, b| {
        a.artist
            .to_lowercase()
            .cmp(&b.artist.to_lowercase())
            .then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
    });

    tracks
}

#[tauri::command]
fn get_audio_url(file_path: String) -> String {
    streamer::get_stream_url(&file_path)
}

#[tauri::command]
fn start_download(
    app: AppHandle,
    state: State<'_, AppState>,
    url: String,
    output_dir: Option<String>,
) -> Result<String, String> {
    run_download(app, &state.downloader, url, output_dir)
}

#[tauri::command]
fn cancel_download(state: State<'_, AppState>) -> Result<String, String> {
    stop_download(&state.downloader)
}

#[tauri::command]
fn get_track_lyrics(file_path: String) -> Option<LyricsResult> {
    get_local_lyrics(&file_path)
}

#[tauri::command]
fn save_track_lyrics(file_path: String, lyrics_content: String) -> Result<(), String> {
    save_lrc_file(&file_path, &lyrics_content)
}

#[tauri::command]
fn open_in_explorer(file_path: String) -> Result<(), String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Err("File does not exist".to_string());
    }

    #[cfg(windows)]
    {
        use std::process::Command;
        let _ = Command::new("explorer")
            .arg("/select,")
            .arg(path)
            .spawn();
    }
    Ok(())
}

#[tauri::command]
fn get_settings(state: State<'_, AppState>) -> AppSettings {
    let lock = state.settings.lock().unwrap();
    lock.clone()
}

#[tauri::command]
fn save_settings(state: State<'_, AppState>, settings: AppSettings) -> AppSettings {
    persist_settings(&settings);
    let mut lock = state.settings.lock().unwrap();
    *lock = settings.clone();
    settings
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let port = streamer::start_stream_server();
    println!("Offline Player local audio streaming server started on 127.0.0.1:{}", port);

    let initial_settings = load_persisted_settings();
    let app_state = AppState {
        downloader: DownloaderState::default(),
        settings: Mutex::new(initial_settings),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            scan_library,
            get_audio_url,
            start_download,
            cancel_download,
            get_track_lyrics,
            save_track_lyrics,
            open_in_explorer,
            get_settings,
            save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
