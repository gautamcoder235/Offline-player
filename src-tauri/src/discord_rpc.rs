use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};

// MusicVault registered discord client ID (or open music player application ID)
const DISCORD_APP_ID: &str = "1209581177650581564";

#[derive(Clone)]
pub struct DiscordRpcManager {
    client: Arc<Mutex<Option<DiscordIpcClient>>>,
}

impl DiscordRpcManager {
    pub fn new() -> Self {
        Self {
            client: Arc::new(Mutex::new(None)),
        }
    }

    pub fn set_activity(
        &self,
        title: &str,
        artist: &str,
        album: &str,
        is_playing: bool,
        duration_secs: Option<u64>,
        current_pos_secs: Option<u64>,
    ) {
        let mut guard = match self.client.lock() {
            Ok(g) => g,
            Err(_) => return,
        };

        if guard.is_none() {
            if let Ok(mut client) = DiscordIpcClient::new(DISCORD_APP_ID) {
                if client.connect().is_ok() {
                    *guard = Some(client);
                }
            }
        }

        if let Some(client) = guard.as_mut() {
            let mut act = activity::Activity::new();
            act = act.details(title);
            let state_text = if is_playing {
                format!("by {}", artist)
            } else {
                format!("Paused • {}", artist)
            };
            act = act.state(&state_text);

            let assets = activity::Assets::new().large_image("musicvault").large_text(album);
            act = act.assets(assets);

            if is_playing {
                if let (Some(dur), Some(pos)) = (duration_secs, current_pos_secs) {
                    if let Ok(now) = SystemTime::now().duration_since(UNIX_EPOCH) {
                        let now_secs = now.as_secs() as i64;
                        let start_time = now_secs - pos as i64;
                        let end_time = start_time + dur as i64;
                        act = act.timestamps(activity::Timestamps::new().start(start_time).end(end_time));
                    }
                }
            }

            if client.set_activity(act).is_err() {
                let _ = client.close();
                *guard = None;
            }
        }
    }

    pub fn clear_activity(&self) {
        if let Ok(mut guard) = self.client.lock() {
            if let Some(client) = guard.as_mut() {
                let _ = client.clear_activity();
            }
        }
    }
}
