use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter, Manager};

const SAVIFY_BRIDGE_PY: &str = include_str!("../scripts/savify_bridge.py");

pub struct DownloaderState {
    pub current_process: Arc<Mutex<Option<Child>>>,
}

impl Default for DownloaderState {
    fn default() -> Self {
        Self {
            current_process: Arc::new(Mutex::new(None)),
        }
    }
}

pub fn run_download(
    app: AppHandle,
    state: &DownloaderState,
    url: String,
    output_dir: Option<String>,
) -> Result<String, String> {
    let cur_dir = std::env::current_dir().unwrap_or_default();
    let mut python_candidates: Vec<PathBuf> = Vec::new();

    // Check virtualenv in current directory or user home
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
            // Check if 'python' or 'py' or 'python3' responds
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
        candidate_paths.push(res_dir.join("scripts").join("savify_bridge.py"));
        candidate_paths.push(res_dir.join("savify_bridge.py"));
    }
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            candidate_paths.push(exe_dir.join("scripts").join("savify_bridge.py"));
            candidate_paths.push(exe_dir.join("savify_bridge.py"));
        }
    }
    candidate_paths.push(cur_dir.join("src-tauri").join("scripts").join("savify_bridge.py"));
    candidate_paths.push(cur_dir.join("scripts").join("savify_bridge.py"));
    if let Ok(local_appdata) = std::env::var("LOCALAPPDATA") {
        candidate_paths.push(PathBuf::from(&local_appdata).join("MusicVault").join("scripts").join("savify_bridge.py"));
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        candidate_paths.push(PathBuf::from(&appdata).join("OfflinePlayer").join("scripts").join("savify_bridge.py"));
    }

    let script_path = if let Some(found) = candidate_paths.into_iter().find(|p| p.is_file()) {
        found
    } else {
        // Fallback: automatically extract the embedded script to %APPDATA%/OfflinePlayer/scripts/savify_bridge.py
        let fallback_dir = dirs::config_dir()
            .map(|p| p.join("OfflinePlayer").join("scripts"))
            .unwrap_or_else(|| cur_dir.join("scripts"));
        let _ = std::fs::create_dir_all(&fallback_dir);
        let fallback_file = fallback_dir.join("savify_bridge.py");
        std::fs::write(&fallback_file, SAVIFY_BRIDGE_PY)
            .map_err(|e| format!("Failed to extract embedded savify_bridge.py: {}", e))?;
        fallback_file
    };

    let default_output = dirs::audio_dir()
        .map(|p| p.join("Spotify offline").to_string_lossy().to_string())
        .unwrap_or_else(|| {
            dirs::home_dir()
                .map(|p| p.join("Music").join("Spotify offline").to_string_lossy().to_string())
                .unwrap_or_else(|| "Music".to_string())
        });
    let target_dir = output_dir.unwrap_or(default_output);

    let mut cmd = Command::new(&python_path);
    cmd.arg(script_path)
        .arg(&url)
        .arg(&target_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd.spawn().map_err(|e| format!("Failed to spawn download process: {}", e))?;

    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;

    let proc_arc = state.current_process.clone();
    {
        let mut lock = proc_arc.lock().unwrap();
        *lock = Some(child);
    }

    let app_stdout = app.clone();
    let app_stderr = app.clone();
    let proc_arc_clone = proc_arc.clone();

    // Concurrent thread to drain stderr continuously so the OS pipe buffer never fills and freezes
    let stderr_worker = thread::spawn(move || {
        let err_reader = BufReader::new(stderr);
        for line in err_reader.lines().flatten() {
            let trimmed = line.trim();
            if !trimmed.is_empty() {
                let _ = app_stderr.emit("download://log", trimmed.to_string());
            }
        }
    });

    // Concurrent thread to parse JSON events and stream stdout lines
    thread::spawn(move || {
        let reader = BufReader::new(stdout);
        for line in reader.lines().flatten() {
            let trimmed = line.trim();
            if trimmed.starts_with('{') && trimmed.ends_with('}') {
                if let Ok(json_val) = serde_json::from_str::<serde_json::Value>(trimmed) {
                    let _ = app_stdout.emit("download://event", json_val);
                    continue;
                }
            }
            if !trimmed.is_empty() {
                let _ = app_stdout.emit("download://log", trimmed.to_string());
            }
        }

        // Wait for stderr drain thread to conclude
        let _ = stderr_worker.join();

        // Wait for process completion
        let status = {
            let mut lock = proc_arc_clone.lock().unwrap();
            if let Some(mut c) = lock.take() {
                c.wait().ok()
            } else {
                None
            }
        };

        let code = status.and_then(|s| s.code()).unwrap_or(-1);
        let _ = app_stdout.emit("download://complete", serde_json::json!({ "exit_code": code }));
    });

    Ok("Download process initiated".to_string())
}

pub fn stop_download(state: &DownloaderState) -> Result<String, String> {
    let mut lock = state.current_process.lock().unwrap();
    if let Some(mut child) = lock.take() {
        let pid = child.id();
        #[cfg(windows)]
        {
            use std::process::Command;
            // On Windows, child.kill() only kills the python wrapper, leaving child yt-dlp/ffmpeg processes alive.
            // taskkill /F /T kills the entire process tree cleanly.
            let _ = Command::new("taskkill")
                .args(["/F", "/T", "/PID", &pid.to_string()])
                .spawn();
        }
        let _ = child.kill();
        Ok("Download stopped".to_string())
    } else {
        Ok("No active download".to_string())
    }
}
