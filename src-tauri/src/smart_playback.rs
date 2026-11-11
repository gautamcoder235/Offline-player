use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, Sender};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use serde::{Deserialize, Serialize};

use crate::audio_session::AudioSessionInfo;
use crate::playback_state::{PlaybackDecision, PlaybackStateMachine, UserAction};
use crate::smart_settings::{load_smart_settings, save_smart_settings, SmartPlaybackSettings};

#[cfg(windows)]
use crate::audio_monitor::{AudioMonitor, AudioMonitorListener};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmartPlaybackStatus {
    pub enabled: bool,
    pub is_monitoring: bool,
    pub is_external_audio_active: bool,
    pub current_state: String,
    pub is_paused_by_external_audio: bool,
    pub interrupting_app: Option<String>,
    pub resume_countdown_ms: Option<u64>,
    pub active_sessions: Vec<AudioSessionInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExternalAudioStartedPayload {
    pub app_name: String,
    pub pid: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SmartPausePayload {
    pub reason: String,
    pub app_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDeviceChangedPayload {
    pub device_name: String,
}

pub struct SmartPlaybackManager {
    app_handle: OnceLock<AppHandle>,
    settings: Mutex<SmartPlaybackSettings>,
    state_machine: Mutex<PlaybackStateMachine>,
    cached_sessions: Mutex<Vec<AudioSessionInfo>>,
    is_external_audio_active: AtomicBool,
    resume_cancel_tx: Mutex<Option<Sender<()>>>,
    #[cfg(windows)]
    monitor: Mutex<Option<AudioMonitor>>,
}

static MANAGER: OnceLock<SmartPlaybackManager> = OnceLock::new();

pub fn get_smart_playback_manager() -> &'static SmartPlaybackManager {
    MANAGER.get_or_init(|| {
        let settings = load_smart_settings();
        SmartPlaybackManager {
            app_handle: OnceLock::new(),
            settings: Mutex::new(settings),
            state_machine: Mutex::new(PlaybackStateMachine::new()),
            cached_sessions: Mutex::new(Vec::new()),
            is_external_audio_active: AtomicBool::new(false),
            resume_cancel_tx: Mutex::new(None),
            #[cfg(windows)]
            monitor: Mutex::new(None),
        }
    })
}

impl SmartPlaybackManager {
    pub fn init(&self, app: AppHandle) {
        let _ = self.app_handle.set(app.clone());

        #[cfg(windows)]
        {
            let settings = self.settings.lock().unwrap().clone();
            let listener = Arc::new(AudioMonitorListener {
                on_audio_activity: Box::new(|is_active, primary_app, sessions| {
                    get_smart_playback_manager().on_audio_activity(is_active, primary_app, sessions);
                }),
                on_device_changed: Box::new(|device_name| {
                    get_smart_playback_manager().on_device_changed(device_name);
                }),
            });

            match AudioMonitor::start(settings, listener) {
                Ok(monitor) => {
                    *self.monitor.lock().unwrap() = Some(monitor);
                }
                Err(err) => {
                    eprintln!("Failed to start Windows AudioMonitor: {}", err);
                }
            }
        }
    }

    fn on_audio_activity(
        &self,
        is_active: bool,
        primary_app: Option<String>,
        sessions: Vec<AudioSessionInfo>,
    ) {
        let was_active = self.is_external_audio_active.swap(is_active, Ordering::SeqCst);
        *self.cached_sessions.lock().unwrap() = sessions.clone();

        let app_opt = self.app_handle.get();

        // Emit session list update to frontend
        if let Some(app) = app_opt {
            let _ = app.emit("audio-session-updated", &sessions);
        }

        let settings = self.settings.lock().unwrap().clone();

        if is_active && !was_active {
            // External audio just started
            let app_name = primary_app.unwrap_or_else(|| "External Application".to_string());
            let pid = sessions.iter().find(|s| s.is_producing_audio).map(|s| s.pid).unwrap_or(0);

            if let Some(app) = app_opt {
                let _ = app.emit(
                    "external-audio-started",
                    ExternalAudioStartedPayload {
                        app_name: app_name.clone(),
                        pid,
                    },
                );
            }

            let decision = {
                let mut sm = self.state_machine.lock().unwrap();
                sm.handle_external_audio_started(app_name, settings.enabled, settings.auto_pause)
            };

            self.execute_decision(decision);
        } else if !is_active && was_active {
            // External audio just stopped
            if let Some(app) = app_opt {
                let _ = app.emit("external-audio-stopped", ());
            }

            let decision = {
                let mut sm = self.state_machine.lock().unwrap();
                sm.handle_external_audio_stopped(settings.enabled, settings.auto_resume, settings.resume_delay_ms)
            };

            self.execute_decision(decision);
        }
    }

    fn on_device_changed(&self, device_name: String) {
        if let Some(app) = self.app_handle.get() {
            let _ = app.emit(
                "audio-device-changed",
                AudioDeviceChangedPayload { device_name },
            );
        }
    }

    pub fn handle_user_action(&self, action: UserAction) {
        // Cancel any pending resume timer whenever user interacts with playback
        self.cancel_resume_timer();

        let is_ext_active = self.is_external_audio_active.load(Ordering::SeqCst);
        let decision = {
            let mut sm = self.state_machine.lock().unwrap();
            sm.handle_user_action(action, is_ext_active)
        };

        self.execute_decision(decision);
    }

    fn cancel_resume_timer(&self) {
        let mut tx_guard = self.resume_cancel_tx.lock().unwrap();
        if let Some(tx) = tx_guard.take() {
            let _ = tx.send(());
        }
    }

    fn execute_decision(&self, decision: PlaybackDecision) {
        match decision {
            PlaybackDecision::None => {}
            PlaybackDecision::PauseMusic { reason, app_name } => {
                self.cancel_resume_timer();
                if let Some(app) = self.app_handle.get() {
                    let _ = app.emit(
                        "smart-playback-paused",
                        SmartPausePayload { reason, app_name },
                    );
                }
            }
            PlaybackDecision::CancelResumeTimer => {
                self.cancel_resume_timer();
            }
            PlaybackDecision::StartResumeTimer { delay_ms } => {
                self.cancel_resume_timer();
                let (tx, rx) = channel::<()>();
                *self.resume_cancel_tx.lock().unwrap() = Some(tx);

                thread::spawn(move || {
                    // Wait for delay or cancellation
                    match rx.recv_timeout(Duration::from_millis(delay_ms)) {
                        Ok(()) => {
                            // Cancelled
                        }
                        Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                            // Delay finished! Re-check if external audio is active
                            let manager = get_smart_playback_manager();
                            let is_active = manager.is_external_audio_active.load(Ordering::SeqCst);
                            let decision = {
                                let mut sm = manager.state_machine.lock().unwrap();
                                sm.handle_resume_timer_fired(is_active)
                            };
                            manager.execute_decision(decision);
                        }
                        Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                            // Cancelled / channel dropped
                        }
                    }
                });
            }
            PlaybackDecision::ResumeMusic => {
                self.cancel_resume_timer();
                if let Some(app) = self.app_handle.get() {
                    let _ = app.emit("smart-playback-resumed", ());
                }
            }
        }
    }

    pub fn get_settings(&self) -> SmartPlaybackSettings {
        self.settings.lock().unwrap().clone()
    }

    pub fn update_settings(&self, new_settings: SmartPlaybackSettings) {
        save_smart_settings(&new_settings);
        *self.settings.lock().unwrap() = new_settings.clone();

        #[cfg(windows)]
        {
            if let Some(ref monitor) = *self.monitor.lock().unwrap() {
                monitor.update_settings(new_settings);
            }
        }
    }

    pub fn set_enabled(&self, enabled: bool) {
        let mut settings = self.settings.lock().unwrap().clone();
        settings.enabled = enabled;
        self.update_settings(settings);
    }

    pub fn update_excluded_applications(&self, apps: Vec<String>) {
        let mut settings = self.settings.lock().unwrap().clone();
        settings.excluded_applications = apps;
        self.update_settings(settings);
    }

    pub fn get_status(&self) -> SmartPlaybackStatus {
        let settings = self.settings.lock().unwrap().clone();
        let sm = self.state_machine.lock().unwrap();
        let is_ext_active = self.is_external_audio_active.load(Ordering::SeqCst);
        let sessions = self.cached_sessions.lock().unwrap().clone();

        #[cfg(windows)]
        let is_monitoring = self.monitor.lock().unwrap().is_some();
        #[cfg(not(windows))]
        let is_monitoring = false;

        SmartPlaybackStatus {
            enabled: settings.enabled,
            is_monitoring,
            is_external_audio_active: is_ext_active,
            current_state: format!("{:?}", sm.state_kind()),
            is_paused_by_external_audio: sm.is_paused_by_external_audio(),
            interrupting_app: sm.interrupting_app(),
            resume_countdown_ms: sm.resume_countdown_ms(),
            active_sessions: sessions,
        }
    }

    pub fn get_active_sessions(&self) -> Vec<AudioSessionInfo> {
        self.cached_sessions.lock().unwrap().clone()
    }
}
