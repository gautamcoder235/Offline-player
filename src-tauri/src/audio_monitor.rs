#![cfg(windows)]

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant};

use windows::Win32::Foundation::PROPERTYKEY;
use windows::Win32::Media::Audio::Endpoints::IAudioMeterInformation;
use windows::Win32::Media::Audio::*;
use windows::Win32::System::Com::*;
use windows_core::{implement, Interface, Ref, BOOL, PCWSTR};

use crate::audio_session::{get_process_info, is_self_process, AudioSessionInfo};
use crate::smart_settings::SmartPlaybackSettings;

#[derive(Clone)]
struct SendWrapper<T>(pub T);
unsafe impl<T> Send for SendWrapper<T> {}
unsafe impl<T> Sync for SendWrapper<T> {}

impl<T> std::ops::Deref for SendWrapper<T> {
    type Target = T;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

// Messages dispatched from COM callbacks to the monitor event loop
enum MonitorMsg {
    SessionCreated(SendWrapper<IAudioSessionControl>),
    SessionStateChanged {
        session_id: String,
        state: AudioSessionState,
    },
    SessionDisconnected {
        session_id: String,
    },
    DefaultDeviceChanged,
    SettingsUpdated(SmartPlaybackSettings),
    Stop,
}

#[implement(IAudioSessionNotification)]
struct SessionNotificationCallback {
    tx: Sender<MonitorMsg>,
}

impl IAudioSessionNotification_Impl for SessionNotificationCallback_Impl {
    fn OnSessionCreated(&self, newsession: Ref<'_, IAudioSessionControl>) -> windows::core::Result<()> {
        if let Ok(control) = newsession.ok() {
            let _ = self.tx.send(MonitorMsg::SessionCreated(SendWrapper(control.clone())));
        }
        Ok(())
    }
}

#[implement(IAudioSessionEvents)]
struct SessionEventsCallback {
    session_id: String,
    tx: Sender<MonitorMsg>,
}

impl IAudioSessionEvents_Impl for SessionEventsCallback_Impl {
    fn OnDisplayNameChanged(
        &self,
        _newdisplayname: &PCWSTR,
        _eventcontext: *const windows_core::GUID,
    ) -> windows::core::Result<()> {
        Ok(())
    }
    fn OnIconPathChanged(
        &self,
        _newiconpath: &PCWSTR,
        _eventcontext: *const windows_core::GUID,
    ) -> windows::core::Result<()> {
        Ok(())
    }
    fn OnSimpleVolumeChanged(
        &self,
        _newvolume: f32,
        _newmute: BOOL,
        _eventcontext: *const windows_core::GUID,
    ) -> windows::core::Result<()> {
        Ok(())
    }
    fn OnChannelVolumeChanged(
        &self,
        _channelcount: u32,
        _newchannlevolumearray: *const f32,
        _changedchannel: u32,
        _eventcontext: *const windows_core::GUID,
    ) -> windows::core::Result<()> {
        Ok(())
    }
    fn OnGroupingParamChanged(
        &self,
        _newgroupingparam: *const windows_core::GUID,
        _eventcontext: *const windows_core::GUID,
    ) -> windows::core::Result<()> {
        Ok(())
    }
    fn OnStateChanged(&self, newstate: AudioSessionState) -> windows::core::Result<()> {
        let _ = self.tx.send(MonitorMsg::SessionStateChanged {
            session_id: self.session_id.clone(),
            state: newstate,
        });
        Ok(())
    }
    fn OnSessionDisconnected(&self, _disconnectreason: AudioSessionDisconnectReason) -> windows::core::Result<()> {
        let _ = self.tx.send(MonitorMsg::SessionDisconnected {
            session_id: self.session_id.clone(),
        });
        Ok(())
    }
}

#[implement(IMMNotificationClient)]
struct DeviceNotificationCallback {
    tx: Sender<MonitorMsg>,
}

impl IMMNotificationClient_Impl for DeviceNotificationCallback_Impl {
    fn OnDeviceStateChanged(&self, _pwstrdeviceid: &PCWSTR, _dwnewstate: DEVICE_STATE) -> windows::core::Result<()> {
        Ok(())
    }
    fn OnDeviceAdded(&self, _pwstrdeviceid: &PCWSTR) -> windows::core::Result<()> {
        Ok(())
    }
    fn OnDeviceRemoved(&self, _pwstrdeviceid: &PCWSTR) -> windows::core::Result<()> {
        Ok(())
    }
    fn OnDefaultDeviceChanged(
        &self,
        flow: EDataFlow,
        role: ERole,
        _pwstrdefaultdeviceid: &PCWSTR,
    ) -> windows::core::Result<()> {
        // eRender = 0, eMultimedia = 1, eConsole = 0
        if flow == eRender && (role == eMultimedia || role == eConsole) {
            let _ = self.tx.send(MonitorMsg::DefaultDeviceChanged);
        }
        Ok(())
    }
    fn OnPropertyValueChanged(
        &self,
        _pwstrdeviceid: &PCWSTR,
        _key: &PROPERTYKEY,
    ) -> windows::core::Result<()> {
        Ok(())
    }
}

struct TrackedSession {
    control2: IAudioSessionControl2,
    meter: Option<IAudioMeterInformation>,
    events_callback: IAudioSessionEvents,
    pid: u32,
    process_name: String,
    display_name: String,
    state: AudioSessionState,
    peak_level: f32,
    is_self: bool,
    first_heard_audio: Option<Instant>,
    last_heard_audio: Option<Instant>,
    is_producing_audio: bool,
}

pub struct AudioMonitorListener {
    pub on_audio_activity: Box<dyn Fn(bool, Option<String>, Vec<AudioSessionInfo>) + Send + Sync>,
    pub on_device_changed: Box<dyn Fn(String) + Send + Sync>,
}

pub struct AudioMonitor {
    tx: Sender<MonitorMsg>,
    worker_handle: Option<JoinHandle<()>>,
    is_running: Arc<AtomicBool>,
}

impl AudioMonitor {
    pub fn start(
        settings: SmartPlaybackSettings,
        listener: Arc<AudioMonitorListener>,
    ) -> Result<Self, String> {
        let (tx, rx) = channel::<MonitorMsg>();
        let is_running = Arc::new(AtomicBool::new(true));
        let is_running_clone = Arc::clone(&is_running);
        let tx_clone = tx.clone();

        let handle = thread::Builder::new()
            .name("AudioMonitorWorker".to_string())
            .spawn(move || {
                run_monitor_loop(rx, tx_clone, settings, listener, is_running_clone);
            })
            .map_err(|e| format!("Failed to spawn AudioMonitor thread: {}", e))?;

        Ok(Self {
            tx,
            worker_handle: Some(handle),
            is_running,
        })
    }

    pub fn update_settings(&self, settings: SmartPlaybackSettings) {
        let _ = self.tx.send(MonitorMsg::SettingsUpdated(settings));
    }

    pub fn stop(&mut self) {
        self.is_running.store(false, Ordering::SeqCst);
        let _ = self.tx.send(MonitorMsg::Stop);
        if let Some(handle) = self.worker_handle.take() {
            let _ = handle.join();
        }
    }
}

impl Drop for AudioMonitor {
    fn drop(&mut self) {
        self.stop();
    }
}

fn run_monitor_loop(
    rx: Receiver<MonitorMsg>,
    tx: Sender<MonitorMsg>,
    mut settings: SmartPlaybackSettings,
    listener: Arc<AudioMonitorListener>,
    is_running: Arc<AtomicBool>,
) {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }

    let mut sessions: HashMap<String, TrackedSession> = HashMap::new();
    let mut current_enumerator: Option<IMMDeviceEnumerator> = None;
    let mut device_callback_holder: Option<IMMNotificationClient> = None;
    let mut current_session_manager: Option<IAudioSessionManager2> = None;
    let mut session_notification_callback_holder: Option<IAudioSessionNotification> = None;

    // Initialize device enumerator and device callback
    let init_enumerator = || -> Option<(IMMDeviceEnumerator, IMMNotificationClient)> {
        unsafe {
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()?;
            let callback: IMMNotificationClient = DeviceNotificationCallback { tx: tx.clone() }.into();
            let _ = enumerator.RegisterEndpointNotificationCallback(&callback);
            Some((enumerator, callback))
        }
    };

    if let Some((enumerator, cb)) = init_enumerator() {
        current_enumerator = Some(enumerator);
        device_callback_holder = Some(cb);
    }

    // Bind to the default rendering device
    let bind_default_device = |enumerator: &IMMDeviceEnumerator,
                               sessions_map: &mut HashMap<String, TrackedSession>|
     -> Option<(IAudioSessionManager2, IAudioSessionNotification, String)> {
        // Clear old sessions
        cleanup_sessions(sessions_map);

        unsafe {
            let device: IMMDevice = match enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia) {
                Ok(dev) => dev,
                Err(_) => enumerator.GetDefaultAudioEndpoint(eRender, eConsole).ok()?,
            };

            let mut device_name = "Default Output Device".to_string();
            if let Ok(id_pwstr) = device.GetId() {
                if !id_pwstr.is_null() {
                    device_name = id_pwstr.to_string().unwrap_or_default();
                    CoTaskMemFree(Some(id_pwstr.as_ptr() as *const _));
                }
            }

            let session_manager: IAudioSessionManager2 = device.Activate(CLSCTX_ALL, None).ok()?;
            let session_cb: IAudioSessionNotification = SessionNotificationCallback { tx: tx.clone() }.into();
            let _ = session_manager.RegisterSessionNotification(&session_cb);

            // Enumerate current sessions
            if let Ok(enum_session) = session_manager.GetSessionEnumerator() {
                if let Ok(count) = enum_session.GetCount() {
                    for i in 0..count {
                        if let Ok(control) = enum_session.GetSession(i) {
                            add_session(control, sessions_map, &tx);
                        }
                    }
                }
            }

            Some((session_manager, session_cb, device_name))
        }
    };

    if let Some(ref enumerator) = current_enumerator {
        if let Some((sm, scb, dev_name)) = bind_default_device(enumerator, &mut sessions) {
            current_session_manager = Some(sm);
            session_notification_callback_holder = Some(scb);
            (listener.on_device_changed)(dev_name);
        }
    }

    let mut last_external_active_state = false;
    let mut last_activity_report = Instant::now();

    while is_running.load(Ordering::SeqCst) {
        // Decide polling interval: if active external sessions exist, check every 150ms;
        // if none exist, sleep until an event or max 500ms
        let has_active_external = sessions.values().any(|s| !s.is_self && s.state == AudioSessionStateActive);
        let timeout = if has_active_external {
            Duration::from_millis(150)
        } else {
            Duration::from_millis(500)
        };

        match rx.recv_timeout(timeout) {
            Ok(msg) => match msg {
                MonitorMsg::SessionCreated(control) => {
                    add_session(control.0, &mut sessions, &tx);
                }
                MonitorMsg::SessionStateChanged { session_id, state } => {
                    if let Some(session) = sessions.get_mut(&session_id) {
                        session.state = state;
                        if state != AudioSessionStateActive {
                            session.is_producing_audio = false;
                            session.first_heard_audio = None;
                            session.peak_level = 0.0;
                        }
                    }
                }
                MonitorMsg::SessionDisconnected { session_id } => {
                    if let Some(session) = sessions.remove(&session_id) {
                        unsafe {
                            let _ = session.control2.UnregisterAudioSessionNotification(&session.events_callback);
                        }
                    }
                }
                MonitorMsg::DefaultDeviceChanged => {
                    if let Some(ref enumerator) = current_enumerator {
                        if let Some((sm, scb, dev_name)) = bind_default_device(enumerator, &mut sessions) {
                            // Unregister old session notification
                            if let (Some(old_sm), Some(old_scb)) = (&current_session_manager, &session_notification_callback_holder) {
                                unsafe {
                                    let _ = old_sm.UnregisterSessionNotification(old_scb);
                                }
                            }
                            current_session_manager = Some(sm);
                            session_notification_callback_holder = Some(scb);
                            (listener.on_device_changed)(dev_name);
                        }
                    }
                }
                MonitorMsg::SettingsUpdated(new_settings) => {
                    settings = new_settings;
                }
                MonitorMsg::Stop => {
                    break;
                }
            },
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                // Timeout elapsed: periodic peak sampling
            }
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                break;
            }
        }

        // Sample audio peak levels on active sessions
        let now = Instant::now();
        for session in sessions.values_mut() {
            if !session.is_self && is_self_process(session.pid) {
                session.is_self = true;
            }

            if session.is_self || session.pid == 0 {
                continue;
            }

            if session.state == AudioSessionStateActive {
                let mut peak = 0.0f32;
                let has_meter = if let Some(ref meter) = session.meter {
                    if let Ok(val) = unsafe { meter.GetPeakValue() } {
                        peak = val;
                        true
                    } else {
                        false
                    }
                } else {
                    false
                };

                session.peak_level = peak;

                let is_audible = if has_meter {
                    peak >= settings.activity_threshold
                } else {
                    // Meter fallback: session state is active
                    true
                };

                if is_audible {
                    if session.first_heard_audio.is_none() {
                        session.first_heard_audio = Some(now);
                    }
                    session.last_heard_audio = Some(now);

                    let continuous_dur = now.duration_since(session.first_heard_audio.unwrap());
                    if continuous_dur >= Duration::from_millis(settings.min_audio_duration_ms) {
                        session.is_producing_audio = true;
                    }
                } else {
                    // Silence hangover: keep is_producing_audio true for 600ms before clearing
                    // to prevent jitter between rapid pauses or quiet syllables
                    if let Some(last_heard) = session.last_heard_audio {
                        if now.duration_since(last_heard) > Duration::from_millis(600) {
                            session.is_producing_audio = false;
                            session.first_heard_audio = None;
                        }
                    } else {
                        session.is_producing_audio = false;
                    }
                }
            } else {
                session.peak_level = 0.0;
                session.is_producing_audio = false;
                session.first_heard_audio = None;
            }
        }

        // Determine if any non-excluded external application is producing audio
        let mut is_external_active = false;
        let mut primary_app_name: Option<String> = None;
        let mut session_infos = Vec::new();

        for session in sessions.values() {
            if session.is_self || session.pid == 0 {
                continue;
            }

            let is_excluded = is_application_excluded(&session.process_name, &settings.excluded_applications);

            if session.is_producing_audio && !is_excluded {
                is_external_active = true;
                if primary_app_name.is_none() {
                    primary_app_name = Some(session.display_name.clone());
                }
            }

            #[allow(non_upper_case_globals)]
            let state_str = match session.state {
                AudioSessionStateActive => "Active".to_string(),
                AudioSessionStateInactive => "Inactive".to_string(),
                AudioSessionStateExpired => "Expired".to_string(),
                _ => "Unknown".to_string(),
            };

            session_infos.push(AudioSessionInfo {
                session_id: session.process_name.clone(),
                pid: session.pid,
                process_name: session.process_name.clone(),
                display_name: session.display_name.clone(),
                state: state_str,
                peak_level: session.peak_level,
                is_producing_audio: session.is_producing_audio,
                is_excluded,
                is_self: session.is_self,
            });
        }

        // Sort session infos: active producing audio first, then display name
        session_infos.sort_by(|a, b| {
            b.is_producing_audio
                .cmp(&a.is_producing_audio)
                .then_with(|| a.display_name.cmp(&b.display_name))
        });

        // Report activity change or periodic status update (at most every 500ms)
        let state_changed = is_external_active != last_external_active_state;
        let interval_elapsed = now.duration_since(last_activity_report) >= Duration::from_millis(500);

        if state_changed || interval_elapsed {
            last_external_active_state = is_external_active;
            last_activity_report = now;
            (listener.on_audio_activity)(is_external_active, primary_app_name, session_infos);
        }
    }

    // Clean up on exit
    cleanup_sessions(&mut sessions);
    if let (Some(ref sm), Some(ref scb)) = (&current_session_manager, &session_notification_callback_holder) {
        unsafe {
            let _ = sm.UnregisterSessionNotification(scb);
        }
    }
    if let (Some(ref enumerator), Some(ref cb)) = (&current_enumerator, &device_callback_holder) {
        unsafe {
            let _ = enumerator.UnregisterEndpointNotificationCallback(cb);
        }
    }

    unsafe {
        CoUninitialize();
    }
}

fn add_session(
    control: IAudioSessionControl,
    sessions: &mut HashMap<String, TrackedSession>,
    tx: &Sender<MonitorMsg>,
) {
    unsafe {
        let control2: IAudioSessionControl2 = match control.cast() {
            Ok(c) => c,
            Err(_) => return,
        };

        let pid = match control2.GetProcessId() {
            Ok(p) => p,
            Err(_) => return,
        };

        let state = control2.GetState().unwrap_or(AudioSessionStateInactive);

        let mut id_str = format!("pid_{}", pid);
        if let Ok(inst_id) = control2.GetSessionInstanceIdentifier() {
            if !inst_id.is_null() {
                if let Ok(s) = inst_id.to_string() {
                    id_str = s;
                }
                CoTaskMemFree(Some(inst_id.as_ptr() as *const _));
            }
        }

        let is_self = is_self_process(pid);
        let (process_name, display_name) = get_process_info(pid);
        let meter: Option<IAudioMeterInformation> = control.cast().ok();

        let events_callback: IAudioSessionEvents = SessionEventsCallback {
            session_id: id_str.clone(),
            tx: tx.clone(),
        }
        .into();

        let _ = control2.RegisterAudioSessionNotification(&events_callback);

        sessions.insert(
            id_str,
            TrackedSession {
                control2,
                meter,
                events_callback,
                pid,
                process_name,
                display_name,
                state,
                peak_level: 0.0,
                is_self,
                first_heard_audio: None,
                last_heard_audio: None,
                is_producing_audio: false,
            },
        );
    }
}

fn cleanup_sessions(sessions: &mut HashMap<String, TrackedSession>) {
    for (_, session) in sessions.drain() {
        unsafe {
            let _ = session.control2.UnregisterAudioSessionNotification(&session.events_callback);
        }
    }
}

pub fn is_application_excluded(process_name: &str, excluded_list: &[String]) -> bool {
    let lower_name = process_name.to_lowercase();
    if lower_name == "offline-player.exe" {
        return true;
    }

    let stem = std::path::Path::new(&lower_name)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| lower_name.clone());

    for excluded in excluded_list {
        let ex_lower = excluded.trim().to_lowercase();
        if ex_lower.is_empty() {
            continue;
        }
        let ex_stem = std::path::Path::new(&ex_lower)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| ex_lower.clone());

        if lower_name == ex_lower || stem == ex_stem || lower_name.contains(&ex_lower) || stem.contains(&ex_stem) {
            return true;
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_application_excluded() {
        let excluded = vec![
            "discord.exe".to_string(),
            "obs64.exe".to_string(),
            "steam".to_string(),
        ];

        // Exact match
        assert!(is_application_excluded("discord.exe", &excluded));
        assert!(is_application_excluded("DISCORD.EXE", &excluded));

        // Stem match
        assert!(is_application_excluded("discord", &excluded));
        assert!(is_application_excluded("Discord.exe", &excluded));
        assert!(is_application_excluded("steam.exe", &excluded));
        assert!(is_application_excluded("obs64.exe", &excluded));

        // Non-excluded
        assert!(!is_application_excluded("chrome.exe", &excluded));
        assert!(!is_application_excluded("firefox.exe", &excluded));
        assert!(!is_application_excluded("vlc.exe", &excluded));
    }
}
