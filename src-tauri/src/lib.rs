pub mod discord_rpc;
pub mod downloader;
pub mod lyrics;
pub mod metadata;
pub mod streamer;
#[cfg(windows)]
pub mod taskbar;
pub mod audio_session;
pub mod smart_settings;
pub mod playback_state;
#[cfg(windows)]
pub mod audio_monitor;
pub mod smart_playback;
pub mod db;

use base64::Engine;
use downloader::{run_download, stop_download, DownloaderState};
use lyrics::{get_local_lyrics, save_lrc_file, LyricsResult};
use metadata::{extract_metadata, TrackMetadata};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
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
        let default_audio_dir = dirs::audio_dir()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| {
                dirs::home_dir()
                    .map(|p| p.join("Music").to_string_lossy().to_string())
                    .unwrap_or_else(|| "Music".to_string())
            });
        Self {
            music_directories: vec![default_audio_dir.clone()],
            download_directory: default_audio_dir,
            volume: 0.8,
            equalizer_preset: "Flat".to_string(),
        }
    }
}

pub struct AppState {
    pub downloader: DownloaderState,
    pub settings: Mutex<AppSettings>,
    pub tray_playlists: Mutex<Vec<TrayPlaylist>>,
    pub discord: discord_rpc::DiscordRpcManager,
    pub db: Mutex<rusqlite::Connection>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LibraryCacheEntry {
    pub mtime: u64,
    pub size: u64,
    pub track: TrackMetadata,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LibraryCache {
    pub version: u32,
    pub entries: std::collections::HashMap<String, LibraryCacheEntry>,
}

pub fn get_appdata_dir() -> PathBuf {
    if let Ok(appdata) = std::env::var("APPDATA") {
        PathBuf::from(appdata).join("OfflinePlayer")
    } else {
        dirs::config_dir()
            .map(|p| p.join("OfflinePlayer"))
            .unwrap_or_else(|| PathBuf::from("OfflinePlayer"))
    }
}

pub fn get_covers_dir() -> PathBuf {
    let dir = get_appdata_dir().join("covers");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn get_library_cache_path() -> PathBuf {
    let dir = get_appdata_dir();
    let _ = std::fs::create_dir_all(&dir);
    dir.join("library_cache.json")
}

fn load_library_cache_from_disk() -> LibraryCache {
    let path = get_library_cache_path();
    if path.is_file() {
        if let Ok(data) = std::fs::read_to_string(&path) {
            if let Ok(cache) = serde_json::from_str::<LibraryCache>(&data) {
                return cache;
            }
        }
    }
    LibraryCache {
        version: 1,
        entries: std::collections::HashMap::new(),
    }
}

fn save_library_cache_to_disk(cache: &LibraryCache) {
    let cache_file = get_library_cache_path();
    let tmp_file = cache_file.with_extension("tmp");
    if let Ok(json) = serde_json::to_string(cache) {
        if std::fs::write(&tmp_file, json).is_ok() {
            let _ = std::fs::rename(tmp_file, cache_file);
        }
    }
}

pub fn update_track_session_urls(track: &mut TrackMetadata) {
    let current_port = streamer::SERVER_PORT.load(std::sync::atomic::Ordering::SeqCst);
    track.stream_url = streamer::get_stream_url(&track.file_path);
    if let Some(ref cover) = track.cover_art {
        if let Some(pos) = cover.find("/cover?") {
            track.cover_art = Some(format!("http://127.0.0.1:{}{}", current_port, &cover[pos..]));
        }
    } else {
        // If track has no cover URL, check if artwork exists in APPDATA covers dir
        let covers_dir = get_covers_dir();
        let clean_artist = if track.artist.to_lowercase().contains("unknown") { "" } else { track.artist.trim() };
        let term = if clean_artist.is_empty() {
            track.title.trim().to_string()
        } else {
            format!("{} {}", clean_artist, track.title.trim())
        };
        let term_hash = metadata::deterministic_id(&term);
        let track_id = metadata::deterministic_id(&track.file_path);

        if covers_dir.join(format!("{}.jpg", term_hash)).is_file()
            || covers_dir.join(format!("{}.png", term_hash)).is_file()
            || covers_dir.join(format!("{}.txt", term_hash)).is_file()
        {
            track.cover_art = Some(streamer::get_cover_url(&term_hash, &track.file_path));
        } else if covers_dir.join(format!("{}.jpg", track_id)).is_file()
            || covers_dir.join(format!("{}.png", track_id)).is_file()
            || covers_dir.join(format!("{}.txt", track_id)).is_file()
        {
            track.cover_art = Some(streamer::get_cover_url(&track_id, &track.file_path));
        }
    }
}

#[tauri::command]
async fn load_cached_library() -> Result<Vec<TrackMetadata>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let cache = load_library_cache_from_disk();
        let mut tracks: Vec<TrackMetadata> = cache.entries.into_values().map(|e| e.track).collect();

        for track in &mut tracks {
            update_track_session_urls(track);
        }

        tracks.sort_by(|a, b| {
            a.artist
                .to_lowercase()
                .cmp(&b.artist.to_lowercase())
                .then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
        });

        Ok(tracks)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn scan_library(state: State<'_, AppState>, directories: Option<Vec<String>>) -> Result<Vec<TrackMetadata>, String> {
    let dirs_to_scan = match directories {
        Some(d) if !d.is_empty() => d,
        _ => {
            let lock = state.settings.lock().unwrap();
            let mut dirs = if !lock.music_directories.is_empty() {
                lock.music_directories.clone()
            } else {
                let default_dir = dirs::audio_dir()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|| {
                        dirs::home_dir()
                            .map(|p| p.join("Music").to_string_lossy().to_string())
                            .unwrap_or_else(|| "Music".to_string())
                    });
                vec![default_dir]
            };
            if !lock.download_directory.is_empty() && !dirs.contains(&lock.download_directory) {
                dirs.push(lock.download_directory.clone());
            }
            dirs
        }
    };

    tauri::async_runtime::spawn_blocking(move || {
        let mut cache = load_library_cache_from_disk();
        let mut tracks = Vec::new();
        let mut seen_paths = std::collections::HashSet::new();

        let valid_extensions = ["mp3", "m4a", "flac", "wav", "ogg", "opus", "aac", "webm", "alac", "aiff", "aif"];

        for dir_path in &dirs_to_scan {
            let p = Path::new(&dir_path);
            if !p.exists() || !p.is_dir() {
                continue;
            }

            for entry in WalkDir::new(p).follow_links(true).into_iter().flatten() {
                if entry.file_type().is_file() {
                    if let Some(ext) = entry.path().extension().and_then(|s| s.to_str()) {
                        if valid_extensions.contains(&ext.to_lowercase().as_str()) {
                            let path_str = entry.path().to_string_lossy().to_string();
                            if seen_paths.insert(path_str.clone()) {
                                let (mtime, size) = match entry.metadata() {
                                    Ok(m) => {
                                        let mt = m
                                            .modified()
                                            .ok()
                                            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                            .map(|d| d.as_secs())
                                            .unwrap_or(0);
                                        (mt, m.len())
                                    }
                                    Err(_) => (0, 0),
                                };

                                // Delta check: if unmodified, reuse cached metadata
                                if let Some(cached_entry) = cache.entries.get(&path_str) {
                                    if cached_entry.mtime == mtime && cached_entry.size == size {
                                        let mut track = cached_entry.track.clone();
                                        update_track_session_urls(&mut track);
                                        tracks.push(track);
                                        continue;
                                    }
                                }

                                // New or modified file: extract metadata with lofty
                                if let Some(mut meta) = extract_metadata(entry.path()) {
                                    cache.entries.insert(
                                        path_str,
                                        LibraryCacheEntry {
                                            mtime,
                                            size,
                                            track: meta.clone(),
                                        },
                                    );
                                    update_track_session_urls(&mut meta);
                                    tracks.push(meta);
                                }
                            }
                        }
                    }
                }
            }
        }

        // Prune deleted files only if their directory was scanned and the file is gone
        cache.entries.retain(|path, _| {
            if seen_paths.contains(path) {
                return true;
            }
            let p = Path::new(path);
            let under_scanned_dir = dirs_to_scan.iter().any(|d| p.starts_with(Path::new(d)));
            if under_scanned_dir && !p.exists() {
                return false;
            }
            true
        });

        // Save updated cache atomically
        save_library_cache_to_disk(&cache);

        // Sync scanned cache entries into SQLite database
        if let Ok(conn) = db::init_db() {
            let cached_tracks: Vec<TrackMetadata> = cache.entries.values().map(|e| e.track.clone()).collect();
            let _ = db::upsert_tracks(&conn, &cached_tracks);
            let active_paths: Vec<String> = cache.entries.keys().cloned().collect();
            let _ = db::prune_deleted_tracks(&conn, &active_paths);
        }

        // Sort by artist, then title
        tracks.sort_by(|a, b| {
            a.artist
                .to_lowercase()
                .cmp(&b.artist.to_lowercase())
                .then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
        });

        tracks
    })
    .await
    .map_err(|e| e.to_string())
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
    let mut clean_path = file_path.replace('/', "\\");
    if clean_path.starts_with(r"\\?\") {
        clean_path = clean_path[4..].to_string();
    }
    let path = Path::new(&clean_path);
    if !path.exists() {
        if let Some(parent) = path.parent() {
            if parent.exists() {
                #[cfg(windows)]
                {
                    use std::os::windows::process::CommandExt;
                    use std::process::Command;
                    let parent_str = parent.to_string_lossy().replace('/', "\\");
                    let _ = Command::new("explorer")
                        .raw_arg(format!("\"{}\"", parent_str))
                        .spawn();
                    return Ok(());
                }
            }
        }
        return Err("File or folder does not exist".to_string());
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        use std::process::Command;
        if path.is_dir() {
            let _ = Command::new("explorer")
                .raw_arg(format!("\"{}\"", clean_path))
                .spawn();
        } else {
            let _ = Command::new("explorer")
                .raw_arg(format!("/select,\"{}\"", clean_path))
                .spawn();
        }
    }
    #[cfg(not(windows))]
    {
        use std::process::Command;
        let _ = Command::new("xdg-open").arg(path).spawn();
    }
    Ok(())
}

#[tauri::command]
async fn delete_track_file(file_path: String) -> Result<(), String> {
    let mut clean_path = file_path.replace('/', "\\");
    if clean_path.starts_with(r"\\?\") {
        clean_path = clean_path[4..].to_string();
    }
    let path = Path::new(&clean_path);
    if !path.exists() {
        return Err("File does not exist on disk".to_string());
    }
    std::fs::remove_file(path).map_err(|e| format!("Failed to delete file from disk: {}", e))?;

    // Also remove from library cache
    let mut cache = load_library_cache_from_disk();
    if cache.entries.remove(&file_path).is_some() || cache.entries.remove(&clean_path).is_some() {
        save_library_cache_to_disk(&cache);
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
fn update_taskbar_playback_state(is_playing: bool) {
    #[cfg(windows)]
    taskbar::update_play_state(is_playing);
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrayPlaylist {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnlineSearchResult {
    pub track_name: String,
    pub artist_name: String,
    pub album_name: String,
    pub preview_url: Option<String>,
    pub artwork_url: Option<String>,
    pub duration_ms: u64,
    pub track_url: Option<String>,
}

fn build_tray_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>, _playlists: &[TrayPlaylist]) -> Result<tauri::menu::Menu<R>, tauri::Error> {
    let show_i = MenuItemBuilder::with_id("show", "Show MusicVault").build(app)?;
    let sep1 = PredefinedMenuItem::separator(app)?;

    let lib_i = MenuItemBuilder::with_id("view:songs", "Library").build(app)?;
    let liked_i = MenuItemBuilder::with_id("view:liked", "Liked Songs").build(app)?;
    let dl_i = MenuItemBuilder::with_id("view:download", "Downloader").build(app)?;
    let vis_i = MenuItemBuilder::with_id("view:visualizer", "Visualizer").build(app)?;
    let pls_i = MenuItemBuilder::with_id("view:playlists", "Playlists").build(app)?;

    let sep_actions = PredefinedMenuItem::separator(app)?;
    let new_pl_i = MenuItemBuilder::with_id("pl:new", "New Random Playlist").build(app)?;
    let folder_i = MenuItemBuilder::with_id("tool:folder", "Open Music Folder").build(app)?;
    let settings_i = MenuItemBuilder::with_id("view:settings", "Settings").build(app)?;

    let sep2 = PredefinedMenuItem::separator(app)?;
    let quit_i = MenuItemBuilder::with_id("quit", "Quit").build(app)?;

    MenuBuilder::new(app)
        .items(&[
            &show_i,
            &sep1,
            &lib_i,
            &liked_i,
            &dl_i,
            &vis_i,
            &pls_i,
            &sep_actions,
            &new_pl_i,
            &folder_i,
            &settings_i,
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
        let _ = w.unminimize();
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
        let _ = w.unminimize();
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
fn open_tray_view(app: AppHandle, view: String) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
    let _ = app.emit("tray://open-view", view);
    if let Some(p) = app.get_webview_window("tray_popup") {
        let _ = p.hide();
    }
}

#[tauri::command]
fn open_tray_folder(app: AppHandle, state: State<'_, AppState>) {
    let dir = {
        let lock = state.settings.lock().unwrap();
        lock.download_directory.clone()
    };
    let _ = open_in_explorer(dir);
    if let Some(p) = app.get_webview_window("tray_popup") {
        let _ = p.hide();
    }
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn get_smart_playback_settings() -> smart_settings::SmartPlaybackSettings {
    smart_playback::get_smart_playback_manager().get_settings()
}

#[tauri::command]
fn update_smart_playback_settings(settings: smart_settings::SmartPlaybackSettings) {
    smart_playback::get_smart_playback_manager().update_settings(settings);
}

#[tauri::command]
fn set_smart_playback_enabled(enabled: bool) {
    smart_playback::get_smart_playback_manager().set_enabled(enabled);
}

#[tauri::command]
fn update_excluded_applications(apps: Vec<String>) {
    smart_playback::get_smart_playback_manager().update_excluded_applications(apps);
}

#[tauri::command]
fn get_audio_monitor_status() -> smart_playback::SmartPlaybackStatus {
    smart_playback::get_smart_playback_manager().get_status()
}

#[tauri::command]
fn get_active_audio_sessions() -> Vec<audio_session::AudioSessionInfo> {
    smart_playback::get_smart_playback_manager().get_active_sessions()
}

#[tauri::command]
fn report_user_playback_action(action: playback_state::UserAction) {
    smart_playback::get_smart_playback_manager().handle_user_action(action);
}

fn update_cache_cover_for_track(artist: &str, title: &str, cover_url: &str) {
    let mut cache = load_library_cache_from_disk();
    let mut updated = false;
    let clean_artist = artist.trim().to_lowercase();
    let clean_title = title.trim().to_lowercase();
    for entry in cache.entries.values_mut() {
        if entry.track.artist.trim().to_lowercase() == clean_artist
            && entry.track.title.trim().to_lowercase() == clean_title
        {
            if entry.track.cover_art.as_deref() != Some(cover_url) {
                entry.track.cover_art = Some(cover_url.to_string());
                updated = true;
            }
        }
    }
    if updated {
        save_library_cache_to_disk(&cache);
    }
}

#[tauri::command]
async fn fetch_cover_art(artist: String, title: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let clean_artist = if artist.to_lowercase().contains("unknown") { "" } else { artist.trim() };
        let term = if clean_artist.is_empty() {
            title.trim().to_string()
        } else {
            format!("{} {}", clean_artist, title.trim())
        };
        let hash = crate::metadata::deterministic_id(&term);
        
        let cache_dir = get_covers_dir();
        let jpg_file = cache_dir.join(format!("{}.jpg", hash));
        let png_file = cache_dir.join(format!("{}.png", hash));
        let txt_file = cache_dir.join(format!("{}.txt", hash));
        
        if jpg_file.is_file() || png_file.is_file() {
            let url = crate::streamer::get_cover_url(&hash, "");
            update_cache_cover_for_track(&artist, &title, &url);
            return Ok(Some(url));
        }

        if txt_file.is_file() {
            if let Ok(raw_content) = std::fs::read_to_string(&txt_file) {
                let trimmed = raw_content.trim();
                let b64_str = if let Some(idx) = trimmed.find(";base64,") {
                    &trimmed[idx + 8..]
                } else {
                    trimmed
                };
                if let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(b64_str.trim()) {
                    let is_png = trimmed.contains("image/png") || bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]);
                    let target = if is_png { &png_file } else { &jpg_file };
                    let _ = std::fs::write(target, &bytes);
                    let _ = std::fs::remove_file(&txt_file);
                    let url = crate::streamer::get_cover_url(&hash, "");
                    update_cache_cover_for_track(&artist, &title, &url);
                    return Ok(Some(url));
                }
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
                                        let is_png = bytes.starts_with(&[0x89, 0x50, 0x4E, 0x47]);
                                        let target = if is_png {
                                            cache_dir.join(format!("{}.png", hash))
                                        } else {
                                            cache_dir.join(format!("{}.jpg", hash))
                                        };
                                        if std::fs::write(&target, &bytes).is_ok() {
                                            return Some(crate::streamer::get_cover_url(&hash, ""));
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            None
        };

        if let Some(cover_url) = search_itunes(&term) {
            update_cache_cover_for_track(&artist, &title, &cover_url);
            return Ok(Some(cover_url));
        }

        let clean_title = title.split('(').next().unwrap_or(&title).split('[').next().unwrap_or(&title).trim();
        if !clean_title.is_empty() && clean_title != term {
            if let Some(cover_url) = search_itunes(clean_title) {
                update_cache_cover_for_track(&artist, &title, &cover_url);
                return Ok(Some(cover_url));
            }
        }

        Ok(None)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn save_track_tags(
    file_path: String,
    title: String,
    artist: String,
    album: String,
    year: Option<u32>,
    cover_art: Option<String>,
) -> Result<TrackMetadata, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = PathBuf::from(&file_path);
        let updated = metadata::save_track_metadata(&path, &title, &artist, &album, year, cover_art)?;

        // Update library cache on disk
        let mut cache = load_library_cache_from_disk();
        let (mtime, size) = match std::fs::metadata(&path) {
            Ok(m) => {
                let mt = m
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                (mt, m.len())
            }
            Err(_) => (0, 0),
        };
        cache.entries.insert(
            file_path,
            LibraryCacheEntry {
                mtime,
                size,
                track: updated.clone(),
            },
        );
        save_library_cache_to_disk(&cache);

        Ok(updated)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn handle_dropped_paths(paths: Vec<String>) -> Result<Vec<TrackMetadata>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let valid_extensions = ["mp3", "m4a", "flac", "wav", "ogg", "opus", "aac", "webm", "alac", "aiff", "aif"];
        let mut results = Vec::new();
        let mut seen = std::collections::HashSet::new();

        for p_str in paths {
            let p = PathBuf::from(p_str);
            if p.is_file() {
                if let Some(ext) = p.extension().and_then(|s| s.to_str()).map(|s| s.to_lowercase()) {
                    if valid_extensions.contains(&ext.as_str()) {
                        let path_str = p.to_string_lossy().to_string();
                        if seen.insert(path_str) {
                            if let Some(meta) = metadata::extract_metadata(&p) {
                                results.push(meta);
                            }
                        }
                    }
                }
            } else if p.is_dir() {
                for entry in WalkDir::new(&p).follow_links(true).into_iter().filter_map(|e| e.ok()) {
                    if entry.file_type().is_file() {
                        let ep = entry.path();
                        if let Some(ext) = ep.extension().and_then(|s| s.to_str()).map(|s| s.to_lowercase()) {
                            if valid_extensions.contains(&ext.as_str()) {
                                let path_str = ep.to_string_lossy().to_string();
                                if seen.insert(path_str) {
                                    if let Some(meta) = metadata::extract_metadata(ep) {
                                        results.push(meta);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        if !results.is_empty() {
            let mut cache = load_library_cache_from_disk();
            let mut updated = false;
            for track in &results {
                let p = Path::new(&track.file_path);
                let (mtime, size) = match p.metadata() {
                    Ok(m) => {
                        let mt = m
                            .modified()
                            .ok()
                            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                            .map(|d| d.as_secs())
                            .unwrap_or(0);
                        (mt, m.len())
                    }
                    Err(_) => (0, 0),
                };
                cache.entries.insert(
                    track.file_path.clone(),
                    LibraryCacheEntry {
                        mtime,
                        size,
                        track: track.clone(),
                    },
                );
                updated = true;
            }
            if updated {
                save_library_cache_to_disk(&cache);
            }
        }
        Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn update_discord_status(
    state: State<'_, AppState>,
    title: String,
    artist: String,
    album: String,
    is_playing: bool,
    duration: Option<f64>,
    position: Option<f64>,
) -> Result<(), String> {
    let discord = state.discord.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let dur_secs = duration.map(|d| d.round() as u64);
        let pos_secs = position.map(|p| p.round() as u64);
        discord.set_activity(
            &title,
            &artist,
            &album,
            is_playing,
            dur_secs,
            pos_secs,
        );
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn clear_discord_status(state: State<'_, AppState>) -> Result<(), String> {
    let discord = state.discord.clone();
    tauri::async_runtime::spawn_blocking(move || {
        discord.clear_activity();
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn search_spotify(query: String, limit: Option<u32>, country: Option<String>) -> Result<Vec<OnlineSearchResult>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let limit = limit.unwrap_or(30).min(50);
        let encoded_query = percent_encoding::utf8_percent_encode(&query, percent_encoding::NON_ALPHANUMERIC).to_string();
        let country_param = match country {
            Some(ref c) if !c.trim().is_empty() => format!("&country={}", c.trim().to_uppercase()),
            _ => String::new(),
        };
        let url = format!(
            "https://itunes.apple.com/search?term={}&media=music&limit={}{}",
            encoded_query, limit, country_param
        );

        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(6))
            .build()
            .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

        let resp = client
            .get(&url)
            .send()
            .map_err(|e| format!("iTunes search request failed: {}", e))?;

        let json: serde_json::Value = resp
            .json()
            .map_err(|e| format!("Failed to parse iTunes response: {}", e))?;

        let results = json
            .get("results")
            .and_then(|r| r.as_array())
            .cloned()
            .unwrap_or_default();

        let tracks: Vec<OnlineSearchResult> = results
            .iter()
            .filter_map(|item| {
                let track_name = item.get("trackName")?.as_str()?.to_string();
                let artist_name = item.get("artistName")?.as_str()?.to_string();
                let album_name = item
                    .get("collectionName")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Unknown Album")
                    .to_string();
                let preview_url = item.get("previewUrl").and_then(|v| v.as_str()).map(String::from);
                let artwork_url = item
                    .get("artworkUrl100")
                    .and_then(|v| v.as_str())
                    .map(|u| u.replace("100x100", "600x600"));
                let duration_ms = item.get("trackTimeMillis").and_then(|v| v.as_u64()).unwrap_or(0);
                let track_url = item.get("trackViewUrl").and_then(|v| v.as_str()).map(String::from);

                Some(OnlineSearchResult {
                    track_name,
                    artist_name,
                    album_name,
                    preview_url,
                    artwork_url,
                    duration_ms,
                    track_url,
                })
            })
            .collect();

        Ok(tracks)
    })
    .await
    .map_err(|e| e.to_string())?
}

const STREAM_RESOLVER_PY: &str = include_str!("../scripts/stream_resolver.py");

static STREAM_URL_CACHE: std::sync::LazyLock<Mutex<std::collections::HashMap<String, String>>> =
    std::sync::LazyLock::new(|| Mutex::new(std::collections::HashMap::new()));

#[tauri::command]
fn check_cached_stream_url(title: String, artist: String) -> Option<String> {
    let cache_key = format!("{} - {}", artist.trim().to_lowercase(), title.trim().to_lowercase());
    let cache = STREAM_URL_CACHE.lock().unwrap();
    cache.get(&cache_key).cloned()
}

#[tauri::command]
async fn get_online_stream_url(
    app: AppHandle,
    title: String,
    artist: String,
) -> Result<String, String> {
    let cache_key = format!("{} - {}", artist.trim().to_lowercase(), title.trim().to_lowercase());
    {
        let cache = STREAM_URL_CACHE.lock().unwrap();
        if let Some(cached_url) = cache.get(&cache_key) {
            return Ok(cached_url.clone());
        }
    }

    tauri::async_runtime::spawn_blocking(move || {
        let cur_dir = std::env::current_dir().unwrap_or_default();
        let mut python_candidates: Vec<PathBuf> = Vec::new();

        python_candidates.push(cur_dir.join(".venv").join("Scripts").join("python.exe"));
        python_candidates.push(cur_dir.join(".venv").join("bin").join("python"));
        if let Some(home) = dirs::home_dir() {
            python_candidates.push(home.join(".musicvault").join(".venv").join("Scripts").join("python.exe"));
            python_candidates.push(home.join(".musicvault").join(".venv").join("bin").join("python"));
        }

        let python_path = python_candidates
            .into_iter()
            .find(|p| p.is_file())
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|| {
                if Command::new("python").arg("--version").stdout(Stdio::null()).stderr(Stdio::null()).status().is_ok() {
                    "python".to_string()
                } else if Command::new("py").arg("--version").stdout(Stdio::null()).stderr(Stdio::null()).status().is_ok() {
                    "py".to_string()
                } else {
                    "python3".to_string()
                }
            });

        let mut candidate_paths = Vec::new();
        if let Ok(res_dir) = app.path().resource_dir() {
            candidate_paths.push(res_dir.join("scripts").join("stream_resolver.py"));
            candidate_paths.push(res_dir.join("stream_resolver.py"));
        }
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(exe_dir) = exe_path.parent() {
                candidate_paths.push(exe_dir.join("scripts").join("stream_resolver.py"));
                candidate_paths.push(exe_dir.join("stream_resolver.py"));
            }
        }
        candidate_paths.push(cur_dir.join("src-tauri").join("scripts").join("stream_resolver.py"));
        candidate_paths.push(cur_dir.join("scripts").join("stream_resolver.py"));

        let script_path = if let Some(found) = candidate_paths.into_iter().find(|p| p.is_file()) {
            found
        } else {
            let fallback_dir = dirs::config_dir()
                .map(|p| p.join("OfflinePlayer").join("scripts"))
                .unwrap_or_else(|| cur_dir.join("scripts"));
            let _ = std::fs::create_dir_all(&fallback_dir);
            let fallback_file = fallback_dir.join("stream_resolver.py");
            let _ = std::fs::write(&fallback_file, STREAM_RESOLVER_PY);
            fallback_file
        };

        let mut cmd = Command::new(&python_path);
        let query = format!("{} - {}", artist.trim(), title.trim());
        cmd.arg(script_path)
            .arg(&query)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        let output = cmd.output().map_err(|e| format!("Failed to spawn stream resolver: {}", e))?;
        if output.status.success() {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&stdout) {
                if parsed.get("success").and_then(|v| v.as_bool()).unwrap_or(false) {
                    if let Some(url) = parsed.get("data").and_then(|d| d.get("url")).and_then(|u| u.as_str()) {
                        let proxy_url = streamer::get_proxy_stream_url(url);
                        let mut cache = STREAM_URL_CACHE.lock().unwrap();
                        cache.insert(cache_key, proxy_url.clone());
                        return Ok(proxy_url);
                    }
                }
            }
        }

        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Stream resolver could not locate audio stream: {}", stderr))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn db_get_library(state: State<'_, AppState>) -> Result<Vec<TrackMetadata>, String> {
    let mut tracks = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::get_all_tracks(&conn).map_err(|e| e.to_string())?
    };

    if tracks.is_empty() {
        let cache = load_library_cache_from_disk();
        if !cache.entries.is_empty() {
            let cached_tracks: Vec<TrackMetadata> = cache.entries.into_values().map(|e| e.track).collect();
            let conn = state.db.lock().map_err(|e| e.to_string())?;
            let _ = db::upsert_tracks(&conn, &cached_tracks);
            tracks = cached_tracks;
        }
    }

    for track in &mut tracks {
        update_track_session_urls(track);
    }

    Ok(tracks)
}

#[tauri::command]
async fn db_record_playback_session(
    state: State<'_, AppState>,
    session: db::PlaybackSessionInput,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::record_playback_session(&conn, &session).map_err(|e| e.to_string())
}

#[tauri::command]
async fn db_get_top_tracks(
    state: State<'_, AppState>,
    time_range: String,
    limit: Option<u32>,
) -> Result<Vec<TrackMetadata>, String> {
    let mut tracks = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::get_top_tracks(&conn, &time_range, limit.unwrap_or(50)).map_err(|e| e.to_string())?
    };

    for track in &mut tracks {
        update_track_session_urls(track);
    }

    Ok(tracks)
}

#[tauri::command]
async fn db_get_playlists(state: State<'_, AppState>) -> Result<Vec<db::DbPlaylist>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::get_all_playlists(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
async fn db_create_playlist(
    state: State<'_, AppState>,
    name: String,
    description: Option<String>,
    cover_color: Option<String>,
    cover_art: Option<String>,
    initial_track_ids: Option<Vec<String>>,
    is_smart: Option<bool>,
    smart_rules: Option<String>,
) -> Result<db::DbPlaylist, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let id = format!("pl_{}", now_ms);
    let tracks = initial_track_ids.unwrap_or_default();

    db::create_playlist(
        &conn,
        &id,
        &name,
        description.as_deref(),
        cover_art.as_deref(),
        cover_color.as_deref(),
        is_smart.unwrap_or(false),
        smart_rules.as_deref(),
        &tracks,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn db_get_playlist_tracks(
    state: State<'_, AppState>,
    playlist_id: String,
) -> Result<Vec<TrackMetadata>, String> {
    let mut tracks = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        db::get_playlist_tracks(&conn, &playlist_id).map_err(|e| e.to_string())?
    };

    for track in &mut tracks {
        update_track_session_urls(track);
    }

    Ok(tracks)
}

#[tauri::command]
async fn db_add_tracks_to_playlist(
    state: State<'_, AppState>,
    playlist_id: String,
    track_ids: Vec<String>,
) -> Result<usize, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::add_tracks_to_playlist(&conn, &playlist_id, &track_ids).map_err(|e| e.to_string())
}

#[tauri::command]
async fn db_remove_track_from_playlist(
    state: State<'_, AppState>,
    playlist_id: String,
    track_id: String,
    position: Option<i32>,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::remove_track_from_playlist(&conn, &playlist_id, &track_id, position).map_err(|e| e.to_string())
}

#[tauri::command]
async fn db_reorder_playlist_tracks(
    state: State<'_, AppState>,
    playlist_id: String,
    ordered_track_ids: Vec<String>,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::reorder_playlist_tracks(&conn, &playlist_id, &ordered_track_ids).map_err(|e| e.to_string())
}

#[tauri::command]
async fn db_update_playlist(
    state: State<'_, AppState>,
    id: String,
    name: Option<String>,
    description: Option<String>,
    cover_color: Option<String>,
    cover_art: Option<String>,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::update_playlist(
        &conn,
        &id,
        name.as_deref(),
        description.as_deref(),
        cover_color.as_deref(),
        cover_art.as_deref(),
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn db_delete_playlist(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    db::delete_playlist(&conn, &id).map_err(|e| e.to_string())
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let port = streamer::start_stream_server();
    println!("MusicVault local audio streaming server started on 127.0.0.1:{}", port);

    let initial_settings = load_persisted_settings();
    let db_conn = match db::init_db() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("Warning: Failed to initialize SQLite database: {}", e);
            rusqlite::Connection::open_in_memory().unwrap()
        }
    };
    let app_state = AppState {
        downloader: DownloaderState::default(),
        settings: Mutex::new(initial_settings),
        tray_playlists: Mutex::new(Vec::new()),
        discord: discord_rpc::DiscordRpcManager::new(),
        db: Mutex::new(db_conn),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
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
                                let _ = window.unminimize();
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
                                let scale = popup.scale_factor().unwrap_or(1.0);
                                let phys_w = 228.0 * scale;
                                let phys_h = 360.0 * scale;
                                let pos_x = (click_x - phys_w + 10.0 * scale).max(10.0);
                                let pos_y = (click_y - phys_h - 10.0 * scale).max(10.0);

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
                    smart_playback::get_smart_playback_manager().init(app.handle().clone());

                    #[cfg(target_os = "windows")]
                    {
                        if window_vibrancy::apply_mica(&window, Some(true)).is_err() {
                            let _ = window_vibrancy::apply_acrylic(&window, Some((15, 14, 21, 160)));
                        }
                    }
                }

                // Always disable default WebView2 browser context menus on all windows and ensure webview controller transparency
                for label in ["main", "tray_popup"] {
                    if let Some(w) = app.get_webview_window(label) {
                        let _ = w.with_webview(|wv| {
                            unsafe {
                                use webview2_com::Microsoft::Web::WebView2::Win32::{COREWEBVIEW2_COLOR, ICoreWebView2Controller2};
                                use windows::core::Interface;
                                let controller = wv.controller();
                                if let Ok(c2) = controller.cast::<ICoreWebView2Controller2>() {
                                    let _ = c2.SetDefaultBackgroundColor(COREWEBVIEW2_COLOR {
                                        A: 0,
                                        R: 0,
                                        G: 0,
                                        B: 0,
                                    });
                                }
                                if let Ok(core) = controller.CoreWebView2() {
                                    if let Ok(settings) = core.Settings() {
                                        let _ = settings.SetAreDefaultContextMenusEnabled(false);
                                        #[cfg(not(debug_assertions))]
                                        let _ = settings.SetAreDevToolsEnabled(false);
                                    }
                                }
                            }
                        });
                    }
                }

                // Clean up any legacy installation directory or shortcuts from pre-rename versions
                std::thread::spawn(|| {
                    if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
                        let legacy_dir = std::path::PathBuf::from(&local_appdata).join("Offline player");
                        if legacy_dir.exists() {
                            let _ = std::fs::remove_dir_all(legacy_dir);
                        }
                    }
                    if let Ok(appdata) = std::env::var("APPDATA") {
                        let legacy_lnk = std::path::PathBuf::from(&appdata)
                            .join("Microsoft\\Windows\\Start Menu\\Programs\\Offline player.lnk");
                        if legacy_lnk.exists() {
                            let _ = std::fs::remove_file(legacy_lnk);
                        }
                    }
                });
            }

            Ok(())
        })
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            if id == "show" {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.unminimize();
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            } else if id == "quit" {
                app.exit(0);
            } else if id == "tool:folder" {
                let state: State<'_, AppState> = app.state();
                let dir = {
                    let lock = state.settings.lock().unwrap();
                    lock.download_directory.clone()
                };
                let _ = open_in_explorer(dir);
            } else if id.starts_with("view:") {
                let view = &id[5..];
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.unminimize();
                    let _ = w.show();
                    let _ = w.set_focus();
                }
                let _ = app.emit("tray://open-view", view);
            } else if id == "pl:new" {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.unminimize();
                    let _ = w.show();
                    let _ = w.set_focus();
                }
                let _ = app.emit("tray://new-playlist", ());
            } else if id.starts_with("pl:") {
                let pl_id = &id[3..];
                open_tray_playlist(app.clone(), pl_id.to_string());
            }
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
            load_cached_library,
            scan_library,
            get_audio_url,
            start_download,
            cancel_download,
            get_track_lyrics,
            save_track_lyrics,
            open_in_explorer,
            delete_track_file,
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
            open_tray_view,
            open_tray_folder,
            quit_app,
            save_track_tags,
            handle_dropped_paths,
            update_discord_status,
            clear_discord_status,
            search_spotify,
            check_cached_stream_url,
            get_online_stream_url,
            get_smart_playback_settings,
            update_smart_playback_settings,
            set_smart_playback_enabled,
            update_excluded_applications,
            get_audio_monitor_status,
            get_active_audio_sessions,
            report_user_playback_action,
            db_get_library,
            db_record_playback_session,
            db_get_top_tracks,
            db_get_playlists,
            db_create_playlist,
            db_get_playlist_tracks,
            db_add_tracks_to_playlist,
            db_remove_track_from_playlist,
            db_reorder_playlist_tracks,
            db_update_playlist,
            db_delete_playlist,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::Ordering;

    #[test]
    fn test_update_track_session_urls() {
        streamer::SERVER_PORT.store(49200, Ordering::SeqCst);

        let mut track = TrackMetadata {
            id: "track_123".to_string(),
            file_path: "C:\\Music\\song.mp3".to_string(),
            title: "Test Song".to_string(),
            artist: "Test Artist".to_string(),
            album: "Test Album".to_string(),
            duration: 180.0,
            duration_str: "3:00".to_string(),
            year: Some(2025),
            bitrate: Some(320),
            size_bytes: 4096,
            cover_art: Some("http://127.0.0.1:11111/cover?id=abc&file=C%3A%5CMusic%5Csong.mp3".to_string()),
            stream_url: "http://127.0.0.1:11111/audio?file=C%3A%5CMusic%5Csong.mp3".to_string(),
            lyrics: None,
            replay_gain: None,
            track_number: Some(1),
            disc_number: Some(1),
            genre: Some("Rock".to_string()),
        };

        update_track_session_urls(&mut track);

        assert!(track.stream_url.starts_with("http://127.0.0.1:49200/audio?file="));
        assert_eq!(
            track.cover_art,
            Some("http://127.0.0.1:49200/cover?id=abc&file=C%3A%5CMusic%5Csong.mp3".to_string())
        );

        // Switch to a new session port (simulating app restart)
        streamer::SERVER_PORT.store(56789, Ordering::SeqCst);
        update_track_session_urls(&mut track);

        assert!(track.stream_url.starts_with("http://127.0.0.1:56789/audio?file="));
        assert_eq!(
            track.cover_art,
            Some("http://127.0.0.1:56789/cover?id=abc&file=C%3A%5CMusic%5Csong.mp3".to_string())
        );
    }

    #[test]
    fn test_library_cache_serialization() {
        let mut cache = LibraryCache::default();
        let track = TrackMetadata {
            id: "track_456".to_string(),
            file_path: "C:\\Music\\another.flac".to_string(),
            title: "Another Song".to_string(),
            artist: "Another Artist".to_string(),
            album: "Another Album".to_string(),
            duration: 210.0,
            duration_str: "3:30".to_string(),
            year: Some(2024),
            bitrate: Some(1000),
            size_bytes: 8192,
            cover_art: None,
            stream_url: "http://127.0.0.1:3000/audio?file=test".to_string(),
            lyrics: None,
            replay_gain: None,
            track_number: None,
            disc_number: None,
            genre: None,
        };

        cache.entries.insert(
            track.file_path.clone(),
            LibraryCacheEntry {
                mtime: 1700000000,
                size: 8192,
                track: track.clone(),
            },
        );

        let json = serde_json::to_string(&cache).expect("Serialization failed");
        let deserialized: LibraryCache = serde_json::from_str(&json).expect("Deserialization failed");

        assert_eq!(deserialized.entries.len(), 1);
        let entry = deserialized.entries.get(&track.file_path).expect("Entry not found");
        assert_eq!(entry.mtime, 1700000000);
        assert_eq!(entry.size, 8192);
        assert_eq!(entry.track.title, "Another Song");
    }

    #[test]
    fn test_update_track_session_urls_resolves_disk_cover() {
        streamer::SERVER_PORT.store(49200, Ordering::SeqCst);
        let covers_dir = get_covers_dir();
        let term = "DiskArtist DiskTitle";
        let hash = metadata::deterministic_id(term);
        let test_cover_file = covers_dir.join(format!("{}.jpg", hash));
        let _ = std::fs::write(&test_cover_file, b"fake_jpeg_bytes");

        let mut track = TrackMetadata {
            id: "disk_track_1".to_string(),
            file_path: "C:\\Music\\disk_song.mp3".to_string(),
            title: "DiskTitle".to_string(),
            artist: "DiskArtist".to_string(),
            album: "DiskAlbum".to_string(),
            duration: 120.0,
            duration_str: "2:00".to_string(),
            year: None,
            bitrate: None,
            size_bytes: 1024,
            cover_art: None,
            stream_url: "".to_string(),
            lyrics: None,
            replay_gain: None,
            track_number: None,
            disc_number: None,
            genre: None,
        };

        update_track_session_urls(&mut track);
        assert!(track.cover_art.is_some());
        let cover = track.cover_art.unwrap();
        let port = streamer::SERVER_PORT.load(Ordering::SeqCst);
        assert!(cover.starts_with(&format!("http://127.0.0.1:{}/cover?id=", port)));
        assert!(cover.contains(&hash));

        // Cleanup
        let _ = std::fs::remove_file(test_cover_file);
    }

    #[test]
    fn test_cache_retain_preserves_unscanned_directories() {
        let mut cache = LibraryCache::default();
        let track_a = TrackMetadata {
            id: "a".to_string(),
            file_path: "C:\\FolderA\\songA.mp3".to_string(),
            title: "Song A".to_string(),
            artist: "Artist A".to_string(),
            album: "Album A".to_string(),
            duration: 100.0,
            duration_str: "1:40".to_string(),
            year: None,
            bitrate: None,
            size_bytes: 500,
            cover_art: None,
            stream_url: "".to_string(),
            lyrics: None,
            replay_gain: None,
            track_number: None,
            disc_number: None,
            genre: None,
        };
        let track_b = TrackMetadata {
            id: "b".to_string(),
            file_path: "D:\\FolderB\\songB.mp3".to_string(),
            title: "Song B".to_string(),
            artist: "Artist B".to_string(),
            album: "Album B".to_string(),
            duration: 100.0,
            duration_str: "1:40".to_string(),
            year: None,
            bitrate: None,
            size_bytes: 500,
            cover_art: None,
            stream_url: "".to_string(),
            lyrics: None,
            replay_gain: None,
            track_number: None,
            disc_number: None,
            genre: None,
        };

        cache.entries.insert("C:\\FolderA\\songA.mp3".to_string(), LibraryCacheEntry { mtime: 1, size: 500, track: track_a });
        cache.entries.insert("D:\\FolderB\\songB.mp3".to_string(), LibraryCacheEntry { mtime: 2, size: 500, track: track_b });

        // Simulate scanning ONLY "C:\FolderA", where songA was seen
        let dirs_to_scan = vec!["C:\\FolderA".to_string()];
        let mut seen_paths = std::collections::HashSet::new();
        seen_paths.insert("C:\\FolderA\\songA.mp3".to_string());

        // Prune logic from scan_library
        cache.entries.retain(|path, _| {
            if seen_paths.contains(path) {
                return true;
            }
            let p = Path::new(path);
            let under_scanned_dir = dirs_to_scan.iter().any(|d| p.starts_with(Path::new(d)));
            if under_scanned_dir && !p.exists() {
                return false;
            }
            true
        });

        // Track B in FolderB MUST be preserved!
        assert_eq!(cache.entries.len(), 2);
        assert!(cache.entries.contains_key("C:\\FolderA\\songA.mp3"));
        assert!(cache.entries.contains_key("D:\\FolderB\\songB.mp3"));
    }
}
