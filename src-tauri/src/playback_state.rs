use serde::{Deserialize, Serialize};
use std::time::Instant;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum PlayerStateKind {
    PlayingNormally,
    PausedByExternalAudio,
    PausedByUser,
    Stopped,
    Resuming,
}

#[derive(Debug, Clone)]
pub enum PlaybackState {
    PlayingNormally,
    PausedByExternalAudio {
        interrupting_app: String,
        paused_at: Instant,
    },
    PausedByUser,
    Stopped,
    Resuming {
        resume_at: Instant,
        interrupting_app: Option<String>,
    },
}

impl PlaybackState {
    pub fn kind(&self) -> PlayerStateKind {
        match self {
            PlaybackState::PlayingNormally => PlayerStateKind::PlayingNormally,
            PlaybackState::PausedByExternalAudio { .. } => PlayerStateKind::PausedByExternalAudio,
            PlaybackState::PausedByUser => PlayerStateKind::PausedByUser,
            PlaybackState::Stopped => PlayerStateKind::Stopped,
            PlaybackState::Resuming { .. } => PlayerStateKind::Resuming,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum UserAction {
    Play,
    Pause,
    Stop,
    TrackChange,
}

#[derive(Debug, Clone, PartialEq)]
pub enum PlaybackDecision {
    None,
    PauseMusic { reason: String, app_name: String },
    StartResumeTimer { delay_ms: u64 },
    ResumeMusic,
    CancelResumeTimer,
}

/// The state machine that manages playback state and prioritizes user actions over automation.
pub struct PlaybackStateMachine {
    current_state: PlaybackState,
    /// When the user manually starts playback while external audio is still active,
    /// we set this flag so we do not immediately fight the user and re-pause playback.
    user_override_active: bool,
}

impl PlaybackStateMachine {
    pub fn new() -> Self {
        Self {
            current_state: PlaybackState::Stopped,
            user_override_active: false,
        }
    }

    pub fn current_state(&self) -> &PlaybackState {
        &self.current_state
    }

    pub fn state_kind(&self) -> PlayerStateKind {
        self.current_state.kind()
    }

    pub fn is_paused_by_external_audio(&self) -> bool {
        matches!(
            self.current_state,
            PlaybackState::PausedByExternalAudio { .. } | PlaybackState::Resuming { .. }
        )
    }

    pub fn interrupting_app(&self) -> Option<String> {
        match &self.current_state {
            PlaybackState::PausedByExternalAudio { interrupting_app, .. } => {
                Some(interrupting_app.clone())
            }
            PlaybackState::Resuming { interrupting_app, .. } => interrupting_app.clone(),
            _ => None,
        }
    }

    pub fn resume_countdown_ms(&self) -> Option<u64> {
        if let PlaybackState::Resuming { resume_at, .. } = &self.current_state {
            let now = Instant::now();
            if *resume_at > now {
                Some((*resume_at - now).as_millis() as u64)
            } else {
                Some(0)
            }
        } else {
            None
        }
    }

    /// Handles an explicit user action (e.g. clicking Play/Pause in the UI, taskbar, or media keys).
    /// Explicit user actions always have highest priority.
    pub fn handle_user_action(&mut self, action: UserAction, external_audio_active: bool) -> PlaybackDecision {
        match action {
            UserAction::Play => {
                // If user clicks play while external audio is active, they explicitly want to hear music.
                // We set user_override_active so we don't immediately pause it again.
                if external_audio_active {
                    self.user_override_active = true;
                } else {
                    self.user_override_active = false;
                }
                self.current_state = PlaybackState::PlayingNormally;
                PlaybackDecision::None
            }
            UserAction::Pause => {
                self.user_override_active = false;
                self.current_state = PlaybackState::PausedByUser;
                PlaybackDecision::None
            }
            UserAction::Stop => {
                self.user_override_active = false;
                self.current_state = PlaybackState::Stopped;
                PlaybackDecision::None
            }
            UserAction::TrackChange => {
                // If user changes track while PausedByExternalAudio or Resuming,
                // we transition to PausedByUser so we don't unexpectedly restore playback
                // of the new track automatically unless the user presses play.
                match self.current_state {
                    PlaybackState::PausedByExternalAudio { .. } | PlaybackState::Resuming { .. } => {
                        self.current_state = PlaybackState::PausedByUser;
                    }
                    _ => {}
                }
                PlaybackDecision::None
            }
        }
    }

    /// Handles the event when external audio starts producing meaningful sound.
    pub fn handle_external_audio_started(
        &mut self,
        app_name: String,
        enabled: bool,
        auto_pause: bool,
    ) -> PlaybackDecision {
        if !enabled || !auto_pause {
            return PlaybackDecision::None;
        }

        // If user explicitly overrode external audio by pressing play during an ongoing session, ignore it
        if self.user_override_active {
            return PlaybackDecision::None;
        }

        match &self.current_state {
            PlaybackState::PlayingNormally => {
                self.current_state = PlaybackState::PausedByExternalAudio {
                    interrupting_app: app_name.clone(),
                    paused_at: Instant::now(),
                };
                PlaybackDecision::PauseMusic {
                    reason: "External audio started".to_string(),
                    app_name,
                }
            }
            PlaybackState::Resuming { .. } => {
                // External audio resumed before countdown expired; abort countdown and stay paused
                self.current_state = PlaybackState::PausedByExternalAudio {
                    interrupting_app: app_name,
                    paused_at: Instant::now(),
                };
                PlaybackDecision::CancelResumeTimer
            }
            PlaybackState::PausedByUser | PlaybackState::Stopped | PlaybackState::PausedByExternalAudio { .. } => {
                // Respect user manual pause/stop; do nothing
                PlaybackDecision::None
            }
        }
    }

    /// Handles the event when all relevant external audio activity has stopped.
    pub fn handle_external_audio_stopped(
        &mut self,
        enabled: bool,
        auto_resume: bool,
        resume_delay_ms: u64,
    ) -> PlaybackDecision {
        // Reset user override once external audio completely stops
        self.user_override_active = false;

        if !enabled || !auto_resume {
            return PlaybackDecision::None;
        }

        match &self.current_state {
            PlaybackState::PausedByExternalAudio { interrupting_app, .. } => {
                if resume_delay_ms == 0 {
                    self.current_state = PlaybackState::PlayingNormally;
                    PlaybackDecision::ResumeMusic
                } else {
                    let resume_at = Instant::now() + std::time::Duration::from_millis(resume_delay_ms);
                    self.current_state = PlaybackState::Resuming {
                        resume_at,
                        interrupting_app: Some(interrupting_app.clone()),
                    };
                    PlaybackDecision::StartResumeTimer { delay_ms: resume_delay_ms }
                }
            }
            _ => PlaybackDecision::None,
        }
    }

    /// Handles the resume timer expiring after resume_delay_ms.
    pub fn handle_resume_timer_fired(&mut self, external_audio_active: bool) -> PlaybackDecision {
        if let PlaybackState::Resuming { .. } = self.current_state {
            if external_audio_active {
                // Audio became active again or never fully stopped, revert to paused
                self.current_state = PlaybackState::PausedByExternalAudio {
                    interrupting_app: "External Application".to_string(),
                    paused_at: Instant::now(),
                };
                PlaybackDecision::CancelResumeTimer
            } else {
                self.current_state = PlaybackState::PlayingNormally;
                PlaybackDecision::ResumeMusic
            }
        } else {
            PlaybackDecision::None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normal_pause_and_resume_flow() {
        let mut sm = PlaybackStateMachine::new();
        // User starts music
        sm.handle_user_action(UserAction::Play, false);
        assert_eq!(sm.state_kind(), PlayerStateKind::PlayingNormally);

        // External audio starts (e.g. YouTube)
        let dec = sm.handle_external_audio_started("Google Chrome".into(), true, true);
        assert_eq!(
            dec,
            PlaybackDecision::PauseMusic {
                reason: "External audio started".into(),
                app_name: "Google Chrome".into(),
            }
        );
        assert_eq!(sm.state_kind(), PlayerStateKind::PausedByExternalAudio);
        assert_eq!(sm.interrupting_app(), Some("Google Chrome".into()));

        // External audio stops
        let dec2 = sm.handle_external_audio_stopped(true, true, 2000);
        assert_eq!(dec2, PlaybackDecision::StartResumeTimer { delay_ms: 2000 });
        assert_eq!(sm.state_kind(), PlayerStateKind::Resuming);

        // Resume timer fires with no external audio
        let dec3 = sm.handle_resume_timer_fired(false);
        assert_eq!(dec3, PlaybackDecision::ResumeMusic);
        assert_eq!(sm.state_kind(), PlayerStateKind::PlayingNormally);
    }

    #[test]
    fn test_user_manual_pause_is_respected() {
        let mut sm = PlaybackStateMachine::new();
        sm.handle_user_action(UserAction::Play, false);
        // User manually pauses music
        sm.handle_user_action(UserAction::Pause, false);
        assert_eq!(sm.state_kind(), PlayerStateKind::PausedByUser);

        // External audio starts and then stops
        let dec = sm.handle_external_audio_started("Google Chrome".into(), true, true);
        assert_eq!(dec, PlaybackDecision::None);
        assert_eq!(sm.state_kind(), PlayerStateKind::PausedByUser);

        let dec2 = sm.handle_external_audio_stopped(true, true, 2000);
        assert_eq!(dec2, PlaybackDecision::None);
        assert_eq!(sm.state_kind(), PlayerStateKind::PausedByUser);
    }

    #[test]
    fn test_user_manual_pause_while_auto_paused() {
        let mut sm = PlaybackStateMachine::new();
        sm.handle_user_action(UserAction::Play, false);
        sm.handle_external_audio_started("Google Chrome".into(), true, true);
        assert_eq!(sm.state_kind(), PlayerStateKind::PausedByExternalAudio);

        // User manually pauses or confirms pause in the UI
        sm.handle_user_action(UserAction::Pause, true);
        assert_eq!(sm.state_kind(), PlayerStateKind::PausedByUser);

        // External audio stops; music should NOT resume!
        let dec = sm.handle_external_audio_stopped(true, true, 2000);
        assert_eq!(dec, PlaybackDecision::None);
        assert_eq!(sm.state_kind(), PlayerStateKind::PausedByUser);
    }

    #[test]
    fn test_user_manual_resume_during_external_audio() {
        let mut sm = PlaybackStateMachine::new();
        sm.handle_user_action(UserAction::Play, false);
        sm.handle_external_audio_started("Google Chrome".into(), true, true);
        assert_eq!(sm.state_kind(), PlayerStateKind::PausedByExternalAudio);

        // User explicitly clicks Play while external audio is still going
        sm.handle_user_action(UserAction::Play, true);
        assert_eq!(sm.state_kind(), PlayerStateKind::PlayingNormally);

        // Subsequent external audio event from the same session does not fight the user
        let dec = sm.handle_external_audio_started("Google Chrome".into(), true, true);
        assert_eq!(dec, PlaybackDecision::None);
        assert_eq!(sm.state_kind(), PlayerStateKind::PlayingNormally);
    }

    #[test]
    fn test_track_change_while_auto_paused() {
        let mut sm = PlaybackStateMachine::new();
        sm.handle_user_action(UserAction::Play, false);
        sm.handle_external_audio_started("Google Chrome".into(), true, true);
        assert_eq!(sm.state_kind(), PlayerStateKind::PausedByExternalAudio);

        // User changes track while paused
        sm.handle_user_action(UserAction::TrackChange, true);
        assert_eq!(sm.state_kind(), PlayerStateKind::PausedByUser);

        // External audio stops -> should NOT automatically resume
        let dec = sm.handle_external_audio_stopped(true, true, 2000);
        assert_eq!(dec, PlaybackDecision::None);
        assert_eq!(sm.state_kind(), PlayerStateKind::PausedByUser);
    }

    #[test]
    fn test_resume_timer_cancelled_by_new_external_audio() {
        let mut sm = PlaybackStateMachine::new();
        sm.handle_user_action(UserAction::Play, false);
        sm.handle_external_audio_started("Google Chrome".into(), true, true);

        // External audio stops -> Resuming timer starts
        let dec = sm.handle_external_audio_stopped(true, true, 2000);
        assert_eq!(dec, PlaybackDecision::StartResumeTimer { delay_ms: 2000 });
        assert_eq!(sm.state_kind(), PlayerStateKind::Resuming);

        // New audio starts before timer finishes (e.g. next YouTube video)
        let dec2 = sm.handle_external_audio_started("Google Chrome".into(), true, true);
        assert_eq!(dec2, PlaybackDecision::CancelResumeTimer);
        assert_eq!(sm.state_kind(), PlayerStateKind::PausedByExternalAudio);

        // Timer fires later -> should be rejected because state is no longer Resuming
        let dec3 = sm.handle_resume_timer_fired(true);
        assert_eq!(dec3, PlaybackDecision::None);
    }
}
