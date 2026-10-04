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
fn scan_library(state: State<'_, AppState>, directories: Option<Vec<String>>) -> Vec<TrackMetadata> {
    let dirs_to_scan = match directories {
        Some(d) if !d.is_empty() => d,
        _ => {
            let lock = state.settings.lock().unwrap();
            if !lock.music_directories.is_empty() {
                lock.music_directories.clone()
            } else {
                vec![r"C:\Users\sharm\Music\Spotify offline".to_string()]
            }
        }
    };

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
    let effective_output = match output_dir {
        Some(d) if !d.is_empty() => Some(d),
        _ => {
            let lock = state.settings.lock().unwrap();
            Some(lock.download_directory.clone())
        }
    };
    run_download(app, &state.downloader, url, effective_output)
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
        return Err("File or folder does not exist".to_string());
    }

    #[cfg(windows)]
    {
        use std::process::Command;
        if path.is_dir() {
            let _ = Command::new("explorer").arg(path).spawn();
        } else {
            let _ = Command::new("explorer")
                .arg(format!("/select,{}", path.display()))
                .spawn();
        }
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

use tauri::tray::{TrayIconBuilder, TrayIconEvent, MouseButton, MouseButtonState};
use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem};
use tauri::{Manager, WindowEvent, Emitter};

#[tauri::command]
fn app_minimize(window: tauri::WebviewWindow) {
    let _ = window.minimize();
}

#[tauri::command]
fn app_toggle_maximize(window: tauri::WebviewWindow) {
    if let Ok(is_max) = window.is_maximized() {
        if is_max {
            let _ = window.unmaximize();
        } else {
            let _ = window.maximize();
        }
    }
}

#[tauri::command]
fn app_close(window: tauri::WebviewWindow) {
    let _ = window.hide();
}

#[tauri::command]
fn app_start_dragging(window: tauri::WebviewWindow) {
    let _ = window.start_dragging();
}

#[tauri::command]
fn fetch_cover_art(artist: String, title: String) -> Result<Option<String>, String> {
    let term = format!("{} {}", artist, title);
    let hash = crate::metadata::deterministic_id(&term);
    
    let base = std::env::var("APPDATA")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."));
    let cache_dir = base.join("OfflinePlayer").join("covers");
    let _ = std::fs::create_dir_all(&cache_dir);
    let cache_file = cache_dir.join(format!("{}.txt", hash));
    
    if cache_file.exists() {
        if let Ok(cached_data) = std::fs::read_to_string(&cache_file) {
            return Ok(Some(cached_data));
        }
    }
    
    let url = format!("https://itunes.apple.com/search?term={}&media=music&limit=1", percent_encoding::utf8_percent_encode(&term, percent_encoding::NON_ALPHANUMERIC));
    
    if let Ok(resp) = reqwest::blocking::get(&url) {
        if let Ok(json) = resp.json::<serde_json::Value>() {
            if let Some(results) = json.get("results").and_then(|r| r.as_array()) {
                if let Some(first) = results.first() {
                    if let Some(art_url) = first.get("artworkUrl100").and_then(|u| u.as_str()) {
                        let high_res_url = art_url.replace("100x100", "600x600");
                        if let Ok(img_resp) = reqwest::blocking::get(&high_res_url) {
                            if let Ok(bytes) = img_resp.bytes() {
                                use base64::{Engine as _, engine::general_purpose};
                                let encoded = general_purpose::STANDARD.encode(&bytes);
                                let base64_str = format!("data:image/jpeg;base64,{}", encoded);
                                let _ = std::fs::write(&cache_file, &base64_str);
                                return Ok(Some(base64_str));
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(None)
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
        .setup(|app| {
            let show_i = MenuItemBuilder::with_id("show", "Show Offline Player").build(app)?;
            let play_i = MenuItemBuilder::with_id("play-pause", "Play / Pause").build(app)?;
            let next_i = MenuItemBuilder::with_id("next", "Next Track").build(app)?;
            let prev_i = MenuItemBuilder::with_id("prev", "Previous Track").build(app)?;
            let quit_i = MenuItemBuilder::with_id("quit", "Quit").build(app)?;
            let sep1 = PredefinedMenuItem::separator(app)?;
            let sep2 = PredefinedMenuItem::separator(app)?;

            let menu = MenuBuilder::new(app)
                .items(&[&show_i, &sep1, &play_i, &next_i, &prev_i, &sep2, &quit_i])
                .build()?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .icon(app.default_window_icon().unwrap().clone())
                .on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "play-pause" => {
                            let _ = app.emit("tray://play-pause", ());
                        }
                        "next" => {
                            let _ = app.emit("tray://next", ());
                        }
                        "prev" => {
                            let _ = app.emit("tray://prev", ());
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        if let Some(window) = tray.app_handle().get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
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
            fetch_cover_art,
            app_minimize,
            app_toggle_maximize,
            app_close,
            app_start_dragging,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
