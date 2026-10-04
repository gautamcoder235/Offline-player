pub mod downloader;
pub mod lyrics;
pub mod metadata;
pub mod streamer;
#[cfg(windows)]
pub mod taskbar;

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
    pub tray_playlists: Mutex<Vec<TrayPlaylist>>,
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
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder, PredefinedMenuItem};
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
fn update_taskbar_playback_state(is_playing: bool) {
    #[cfg(windows)]
    taskbar::update_play_state(is_playing);
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrayPlaylist {
    pub id: String,
    pub name: String,
}

fn build_tray_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>, playlists: &[TrayPlaylist]) -> Result<tauri::menu::Menu<R>, tauri::Error> {
    let show_i = MenuItemBuilder::with_id("show", "Show Offline Player").build(app)?;
    let sep1 = PredefinedMenuItem::separator(app)?;

    let liked_i = MenuItemBuilder::with_id("pl:liked", "♥ Liked Songs").build(app)?;
    let sep_pl = PredefinedMenuItem::separator(app)?;
    let mut pl_builder = SubmenuBuilder::new(app, "Playlists")
        .item(&liked_i)
        .item(&sep_pl);

    let mut custom_items = Vec::new();
    for pl in playlists {
        let item = MenuItemBuilder::with_id(format!("pl:{}", pl.id), &pl.name).build(app)?;
        custom_items.push(item);
    }
    for item in &custom_items {
        pl_builder = pl_builder.item(item);
    }

    let sep_pl2 = PredefinedMenuItem::separator(app)?;
    let new_pl_i = MenuItemBuilder::with_id("pl:new", "+ New Random Playlist").build(app)?;
    let pl_submenu = pl_builder
        .item(&sep_pl2)
        .item(&new_pl_i)
        .build()?;

    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit_i = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    MenuBuilder::new(app)
        .items(&[
            &show_i,
            &sep1,
            &pl_submenu,
            &sep2,
            &quit_i,
        ])
        .build()
}

#[tauri::command]
fn update_tray_playlists(state: State<'_, AppState>, app: AppHandle, playlists: Vec<TrayPlaylist>) -> Result<(), String> {
    {
        let mut lock = state.tray_playlists.lock().unwrap();
        *lock = playlists.clone();
    }
    let _ = app.emit("tray://playlists-updated", &playlists);
    if let Some(tray) = app.tray_by_id("main_tray") {
        if let Ok(new_menu) = build_tray_menu(&app, &playlists) {
            let _ = tray.set_menu(Some(new_menu));
        }
    }
    Ok(())
}

#[tauri::command]
fn get_tray_playlists(state: State<'_, AppState>) -> Vec<TrayPlaylist> {
    state.tray_playlists.lock().unwrap().clone()
}

#[tauri::command]
fn show_main_window(app: AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
    if let Some(p) = app.get_webview_window("tray_popup") {
        let _ = p.hide();
    }
}

#[tauri::command]
fn open_tray_playlist(app: AppHandle, playlist_id: String) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.set_focus();
    }
    if playlist_id == "liked" {
        let _ = app.emit("tray://open-view", "liked");
    } else if playlist_id == "new" {
        let _ = app.emit("tray://new-playlist", ());
    } else {
        let _ = app.emit("tray://open-playlist", playlist_id);
    }
    if let Some(p) = app.get_webview_window("tray_popup") {
        let _ = p.hide();
    }
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn fetch_cover_art(artist: String, title: String) -> Result<Option<String>, String> {
    let clean_artist = if artist.to_lowercase().contains("unknown") { "" } else { artist.trim() };
    let term = if clean_artist.is_empty() {
        title.trim().to_string()
    } else {
        format!("{} {}", clean_artist, title.trim())
    };
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

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(4))
        .build()
        .unwrap_or_default();

    let search_itunes = |search_query: &str| -> Option<String> {
        let url = format!(
            "https://itunes.apple.com/search?term={}&media=music&limit=1",
            percent_encoding::utf8_percent_encode(search_query, percent_encoding::NON_ALPHANUMERIC)
        );
        if let Ok(resp) = client.get(&url).send() {
            if let Ok(json) = resp.json::<serde_json::Value>() {
                if let Some(results) = json.get("results").and_then(|r| r.as_array()) {
                    if let Some(first) = results.first() {
                        if let Some(art_url) = first.get("artworkUrl100").and_then(|u| u.as_str()) {
                            let high_res_url = art_url.replace("100x100", "600x600");
                            if let Ok(img_resp) = client.get(&high_res_url).send() {
                                if let Ok(bytes) = img_resp.bytes() {
                                    use base64::{Engine as _, engine::general_purpose};
                                    let encoded = general_purpose::STANDARD.encode(&bytes);
                                    return Some(format!("data:image/jpeg;base64,{}", encoded));
                                }
                            }
                        }
                    }
                }
            }
        }
        None
    };

    if let Some(base64_str) = search_itunes(&term) {
        let _ = std::fs::write(&cache_file, &base64_str);
        return Ok(Some(base64_str));
    }

    let clean_title = title.split('(').next().unwrap_or(&title).split('[').next().unwrap_or(&title).trim();
    if !clean_title.is_empty() && clean_title != term {
        if let Some(base64_str) = search_itunes(clean_title) {
            let _ = std::fs::write(&cache_file, &base64_str);
            return Ok(Some(base64_str));
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
        tray_playlists: Mutex::new(Vec::new()),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(app_state)
        .setup(|app| {
            let _tray = TrayIconBuilder::with_id("main_tray")
                .icon(app.default_window_icon().unwrap().clone())
                .on_tray_icon_event(|tray, event| {
                    match event {
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } => {
                            if let Some(window) = tray.app_handle().get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                            if let Some(popup) = tray.app_handle().get_webview_window("tray_popup") {
                                let _ = popup.hide();
                            }
                        }
                        TrayIconEvent::Click {
                            button: MouseButton::Right,
                            button_state: MouseButtonState::Up,
                            position,
                            ..
                        } => {
                            if let Some(popup) = tray.app_handle().get_webview_window("tray_popup") {
                                let click_x = position.x;
                                let click_y = position.y;
                                let popup_w = 260.0;
                                let popup_h = 340.0;
                                let pos_x = (click_x - popup_w + 10.0).max(10.0);
                                let pos_y = (click_y - popup_h - 10.0).max(10.0);

                                let _ = popup.set_position(tauri::Position::Physical(tauri::PhysicalPosition::new(pos_x as i32, pos_y as i32)));
                                let _ = popup.show();
                                let _ = popup.set_focus();
                            }
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            #[cfg(windows)]
            {
                if let Some(window) = app.get_webview_window("main") {
                    if let Some(icon) = app.default_window_icon() {
                        let _ = window.set_icon(icon.clone());
                    }
                    if let Ok(hwnd) = window.hwnd() {
                        taskbar::init_taskbar(app.handle().clone(), hwnd);
                    }
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "tray_popup" {
                if let WindowEvent::Focused(false) = event {
                    let _ = window.hide();
                }
            } else if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
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
            update_taskbar_playback_state,
            update_tray_playlists,
            get_tray_playlists,
            show_main_window,
            open_tray_playlist,
            quit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
