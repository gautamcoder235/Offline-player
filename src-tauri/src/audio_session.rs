use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[cfg(windows)]
use windows::Win32::Foundation::CloseHandle;
#[cfg(windows)]
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
#[cfg(windows)]
use windows::Win32::System::Threading::{
    OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioSessionInfo {
    pub session_id: String,
    pub pid: u32,
    pub process_name: String,
    pub display_name: String,
    pub state: String, // "Active", "Inactive", "Expired"
    pub peak_level: f32,
    pub is_producing_audio: bool,
    pub is_excluded: bool,
    pub is_self: bool,
}

#[derive(Debug, Clone)]
pub struct SessionTrackingData {
    pub session_id: String,
    pub pid: u32,
    pub process_name: String,
    pub display_name: String,
    pub state: String,
    pub peak_level: f32,
    pub is_active_state: bool,
    pub is_producing_audio: bool,
    pub first_heard_audio: Option<Instant>,
    pub last_heard_audio: Option<Instant>,
}

const PID_CACHE_TTL: Duration = Duration::from_secs(10);
const PID_CACHE_MAX_ENTRIES: usize = 1024;

struct PidClassification {
    is_self: bool,
    evaluated_at: Instant,
}

static PROCESS_NAME_CACHE: Mutex<Option<HashMap<u32, (String, String)>>> = Mutex::new(None);
static PID_CLASSIFICATION_CACHE: Mutex<Option<HashMap<u32, PidClassification>>> = Mutex::new(None);

#[cfg(windows)]
/// Snapshot the entire process tree on Windows, returning a map of PID -> (parent_pid, exe_name).
pub fn get_process_tree() -> HashMap<u32, (u32, String)> {
    let mut map = HashMap::new();
    unsafe {
        if let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) {
            let mut entry = PROCESSENTRY32W::default();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

            if Process32FirstW(snapshot, &mut entry).is_ok() {
                loop {
                    let null_pos = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
                    let name = String::from_utf16_lossy(&entry.szExeFile[..null_pos]);
                    map.insert(entry.th32ProcessID, (entry.th32ParentProcessID, name));

                    if Process32NextW(snapshot, &mut entry).is_err() {
                        break;
                    }
                }
            }
            let _ = CloseHandle(snapshot);
        }
    }
    map
}

/// Helper to check if a process name is a generic host process (like WebView2, svchost, etc.).
pub fn is_generic_host_process(name: &str) -> bool {
    let lower = name.to_lowercase();
    matches!(
        lower.as_str(),
        "msedgewebview2.exe" | "svchost.exe" | "rundll32.exe" | "audiodg.exe" | "dllhost.exe"
    )
}

#[cfg(windows)]
fn is_self_process_in_tree(pid: u32, tree: &HashMap<u32, (u32, String)>) -> (bool, Vec<u32>) {
    let my_pid = std::process::id();
    let mut curr = pid;
    let mut visited = Vec::new();
    let mut is_descendant = false;

    for _ in 0..15 {
        visited.push(curr);
        if curr == my_pid {
            is_descendant = true;
            break;
        }
        if let Some(&(parent_pid, _)) = tree.get(&curr) {
            if parent_pid == 0 || parent_pid == curr {
                break;
            }
            curr = parent_pid;
        } else {
            break;
        }
    }

    (is_descendant, visited)
}

fn store_pid_classification(pid: u32, is_self: bool, now: Instant) {
    if let Ok(mut guard) = PID_CLASSIFICATION_CACHE.lock() {
        let map = guard.get_or_insert_with(HashMap::new);
        if map.len() >= PID_CACHE_MAX_ENTRIES {
            map.retain(|_, v| now.duration_since(v.evaluated_at) < PID_CACHE_TTL);
        }
        map.insert(pid, PidClassification { is_self, evaluated_at: now });
    }
}

/// Check if a process ID belongs to our application or its child processes (e.g. our own WebView2 runtime).
/// Caches both positive and negative classifications with a TTL to eliminate repeated process tree snapshots.
pub fn is_self_process(pid: u32) -> bool {
    let my_pid = std::process::id();
    if pid == my_pid || pid == 0 {
        return true;
    }

    let now = Instant::now();

    // Fast path: check cached positive & negative PID classifications
    if let Ok(guard) = PID_CLASSIFICATION_CACHE.lock() {
        if let Some(ref map) = *guard {
            if let Some(entry) = map.get(&pid) {
                if entry.is_self || now.duration_since(entry.evaluated_at) < PID_CACHE_TTL {
                    return entry.is_self;
                }
            }
        }
    }

    #[cfg(windows)]
    {
        let tree = get_process_tree();
        let (is_descendant, visited) = is_self_process_in_tree(pid, &tree);

        if is_descendant {
            for p in visited {
                store_pid_classification(p, true, now);
            }
            return true;
        } else {
            store_pid_classification(pid, false, now);
            return false;
        }
    }

    #[cfg(not(windows))]
    false
}

/// Query the process executable name and human-readable display name for a given PID.
/// If the process is hosted in a generic container (like msedgewebview2.exe),
/// this traces up to the root application (e.g. WhatsApp.Root.exe -> "WhatsApp").
pub fn get_process_info(pid: u32) -> (String, String) {
    if pid == 0 {
        return ("System".to_string(), "System Audio".to_string());
    }

    // Check cache first
    {
        let cache = PROCESS_NAME_CACHE.lock().unwrap();
        if let Some(ref map) = *cache {
            if let Some(info) = map.get(&pid) {
                return info.clone();
            }
        }
    }

    #[cfg(windows)]
    {
        let tree = get_process_tree();
        let my_pid = std::process::id();
        let now = Instant::now();

        // 1. Check/evaluate self process using the already-captured process tree
        let (is_self, visited) = is_self_process_in_tree(pid, &tree);
        if is_self {
            for p in visited {
                store_pid_classification(p, true, now);
            }
            let res = ("offline-player.exe".to_string(), "Spotify Offline".to_string());
            let mut cache = PROCESS_NAME_CACHE.lock().unwrap();
            let map = cache.get_or_insert_with(HashMap::new);
            map.insert(pid, res.clone());
            return res;
        } else {
            store_pid_classification(pid, false, now);
        }

        // 2. Look up the process entry in the process tree
        let (immediate_parent, immediate_name) = match tree.get(&pid) {
            Some(&(p, ref name)) => (p, name.clone()),
            None => {
                // Fallback: try QueryFullProcessImageNameW
                let name = unsafe {
                    if let Ok(handle) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
                        let mut buffer = [0u16; 1024];
                        let mut size = buffer.len() as u32;
                        let res = if QueryFullProcessImageNameW(
                            handle,
                            PROCESS_NAME_WIN32,
                            windows::core::PWSTR(buffer.as_mut_ptr()),
                            &mut size,
                        )
                        .is_ok()
                        {
                            let full_path = String::from_utf16_lossy(&buffer[..size as usize]);
                            Path::new(&full_path)
                                .file_name()
                                .map(|s| s.to_string_lossy().to_string())
                                .unwrap_or_else(|| format!("Process ({})", pid))
                        } else {
                            format!("Process ({})", pid)
                        };
                        let _ = CloseHandle(handle);
                        res
                    } else {
                        format!("Process ({})", pid)
                    }
                };
                (0, name)
            }
        };

        // 3. If the process is a generic host (e.g. msedgewebview2.exe, svchost.exe),
        // trace ancestor parents to find the actual hosting application (e.g. WhatsApp.Root.exe)
        let mut resolved_exe = immediate_name.clone();
        if is_generic_host_process(&immediate_name) {
            let mut curr = immediate_parent;
            for _ in 0..15 {
                if curr == 0 || curr == my_pid {
                    break;
                }
                if let Some(&(parent_pid, ref name)) = tree.get(&curr) {
                    let lower = name.to_lowercase();
                    if lower == "explorer.exe" {
                        break;
                    }
                    if !is_generic_host_process(name) {
                        resolved_exe = name.clone();
                        break;
                    }
                    curr = parent_pid;
                } else {
                    break;
                }
            }
        }

        let display_name = format_display_name(&resolved_exe);
        let result = (resolved_exe, display_name);

        let mut cache = PROCESS_NAME_CACHE.lock().unwrap();
        let map = cache.get_or_insert_with(HashMap::new);
        map.insert(pid, result.clone());
        return result;
    }

    #[cfg(not(windows))]
    (format!("Process ({})", pid), format!("Process {}", pid))
}

/// Helper to turn "msedge.exe" -> "Microsoft Edge", "chrome.exe" -> "Google Chrome", etc.
pub fn format_display_name(exe_name: &str) -> String {
    let lower = exe_name.to_lowercase();
    if lower.contains("whatsapp") {
        return "WhatsApp".to_string();
    }
    match lower.as_str() {
        "chrome.exe" => "Google Chrome".to_string(),
        "msedge.exe" => "Microsoft Edge".to_string(),
        "firefox.exe" => "Mozilla Firefox".to_string(),
        "brave.exe" => "Brave Browser".to_string(),
        "opera.exe" => "Opera".to_string(),
        "discord.exe" => "Discord".to_string(),
        "spotify.exe" => "Spotify".to_string(),
        "vlc.exe" => "VLC Media Player".to_string(),
        "wmplayer.exe" => "Windows Media Player".to_string(),
        "steam.exe" => "Steam".to_string(),
        "telegram.exe" => "Telegram".to_string(),
        "slack.exe" => "Slack".to_string(),
        "zoom.exe" => "Zoom".to_string(),
        "teams.exe" | "ms-teams.exe" => "Microsoft Teams".to_string(),
        "obs64.exe" | "obs32.exe" => "OBS Studio".to_string(),
        "offline-player.exe" => "Spotify Offline".to_string(),
        _ => {
            let stem = Path::new(exe_name)
                .file_stem()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| exe_name.to_string());
            if stem.is_empty() {
                exe_name.to_string()
            } else {
                let mut chars = stem.chars();
                match chars.next() {
                    None => String::new(),
                    Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_display_name() {
        assert_eq!(format_display_name("chrome.exe"), "Google Chrome");
        assert_eq!(format_display_name("CHROME.EXE"), "Google Chrome");
        assert_eq!(format_display_name("msedge.exe"), "Microsoft Edge");
        assert_eq!(format_display_name("discord.exe"), "Discord");
        assert_eq!(format_display_name("WhatsApp.Root.exe"), "WhatsApp");
        assert_eq!(format_display_name("whatsapp.exe"), "WhatsApp");
        assert_eq!(format_display_name("spotify.exe"), "Spotify");
        assert_eq!(format_display_name("vlc.exe"), "VLC Media Player");
        assert_eq!(format_display_name("mygame.exe"), "Mygame");
    }

    #[test]
    fn test_is_self_process() {
        let current_pid = std::process::id();
        assert!(is_self_process(current_pid));
        assert!(is_self_process(0));
        assert!(!is_self_process(999999999));

        // Verify negative classification was cached in PID_CLASSIFICATION_CACHE
        {
            let guard = PID_CLASSIFICATION_CACHE.lock().unwrap();
            let map = guard.as_ref().expect("PID cache should be initialized");
            let entry = map.get(&999999999).expect("Negative PID classification should be cached");
            assert!(!entry.is_self);
        }
        assert!(!is_self_process(999999999));
    }
}
