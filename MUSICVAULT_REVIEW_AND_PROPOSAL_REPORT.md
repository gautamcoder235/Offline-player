# MUSICVAULT: COMPREHENSIVE ARCHITECTURAL AUDIT & PRIORITIZED IMPROVEMENT PROPOSAL REPORT

**Application**: MusicVault (`offline-player` v0.1.9)  
**Target Architecture**: Tauri v2 + Rust 1.8x + React 19 + TypeScript + SQLite (WAL) + Tailwind CSS v4  
**Date of Audit**: November 2026  
**Status**: Publication-Grade Architectural Review & Proposal Deliverable  

---

## TABLE OF CONTENTS
1. [Executive Summary & Application Profile](#1-executive-summary--application-profile)
   - 1.1 Application Overview & Technology Stack
   - 1.2 Architectural System Topology
   - 1.3 High-Level Subsystem Health Scorecard
   - 1.4 Critical Vulnerabilities & Executive Blockers
2. [Deep-Dive Subsystem Audit Findings](#2-deep-dive-subsystem-audit-findings)
   - 2.1 Rust Backend & Core Architecture
   - 2.2 SQLite Persistence & Dual-Storage Desynchronization
   - 2.3 Audio Session Monitoring & Smart Playback Engine
   - 2.4 Frontend UI/UX Architecture & State Management
   - 2.5 Audio Playback Engine, DSP & Visualization
   - 2.6 Security Posture & Vulnerability Analysis
   - 2.7 Test Suites & Quality Assurance Status
3. [Competitive Gap Analysis](#3-competitive-gap-analysis)
   - 3.1 Competitive Benchmark Matrix (MusicVault vs Foobar2000 vs Spotify vs Cider vs Feishin)
   - 3.2 Strategic Differentiators & Competitive Liabilities
4. [Prioritized Actionable Improvement & Feature Proposals](#4-prioritized-actionable-improvement--feature-proposals)
   - 4.1 Domain 1: Architecture & Code Health (ARCH-01 to ARCH-05)
   - 4.2 Domain 2: Performance & Resource Usage (PERF-01 to PERF-04)
   - 4.3 Domain 3: UI/UX Polish & Accessibility (UIUX-01 to UIUX-05)
   - 4.4 Domain 4: New Audio/Player Features & Ecosystem (FEAT-01 to FEAT-08)
5. [Phased Implementation Roadmap](#5-phased-implementation-roadmap)
   - 5.1 Phase 1: Immediate Critical Fixes (Security, Broken Tests, Capabilities)
   - 5.2 Phase 2: Performance Optimization & State Modernization
   - 5.3 Phase 3: Desktop UI/UX Polish & Hardening
   - 5.4 Phase 4: High-Value Audio & Ecosystem Features
6. [Verification, Reproduction & Test Plan](#6-verification-reproduction--test-plan)
   - 6.1 Backend Test & Compilation Verification
   - 6.2 Security Vulnerability Exploitation & Verification Procedures
   - 6.3 Frontend Performance & State Profiling Procedures
   - 6.4 Regression & Acceptance Test Matrix

---

## 1. EXECUTIVE SUMMARY & APPLICATION PROFILE

### 1.1 Application Overview & Technology Stack
**MusicVault** is a hybrid desktop music workstation developed under Tauri v2, engineered to unify local offline music management, streaming audio playback, parametric acoustic equalization, live synchronized lyrics, and intelligent system-level audio ducking. 

The application utilizes a distributed desktop architecture combining a high-performance native Rust core with a modern React 19 webview interface:

```
+---------------------------------------------------------------------------------------------------+
|                                       MUSICVAULT RUNTIME                                          |
+---------------------------------------------------------------------------------------------------+
|  FRONTEND PRESENTATION LAYER (Chromium WebView2)                                                  |
|  - Framework: React 19.1.0, TypeScript 5.8, Vite 8.0.16                                          |
|  - Styling: Tailwind CSS v4 (@tailwindcss/vite), Framer Motion 14.3.0, Lucide Icons              |
|  - Audio Pipeline: HTML5 Audio Dual Decks (Deck A & B) -> Web Audio API BiquadFilterNodes (5-EQ)  |
|  - Visualization: High-DPI HTML5 Canvas (Fibonacci Particle Orb, Mirrored FFT, Liquid Waves)       |
|  - Storage Cache: localStorage (Synchronous JSON serialization)                                    |
+---------------------------------------------------------------------------------------------------+
                                            |   ^
                    Tauri v2 IPC Protocol   |   |  Events / Async Commands
                    (JSON-RPC Serialization)|   |  (scan_library, get_settings, audio-monitor)
                                            v   |
+---------------------------------------------------------------------------------------------------+
|  NATIVE BACKEND CORE (Rust 1.8x, tauri v2.0)                                                      |
|  - Database: SQLite 3 (via rusqlite 0.42.0 [bundled]), WAL Mode, Foreign Keys                      |
|  - Audio Session Hook: Windows CoreAudio WASAPI (IAudioSessionManager2, IAudioMeterInformation)    |
|  - Tag Extraction & Probing: Lofty 0.21, ID3v2, Vorbis, FLAC, MP4/AAC                              |
|  - Local Streaming Server: tiny_http 0.12 (Internal HTTP daemon on 127.0.0.1:dynamic_port)        |
|  - Downloader Bridge: Python 3 Subprocess (savify_bridge.py / yt-dlp)                              |
|  - Platform Hooks: Windows Taskbar ThumbBar Buttons (ITaskbarList3), Discord Rich Presence         |
+---------------------------------------------------------------------------------------------------+
```

### 1.2 Architectural System Topology
1. **Frontend**: Monolithic React single-page application executing inside Microsoft Edge WebView2 on Windows. UI state, audio playback scheduling, playlist structures, and lyrics synchronization are bound into a 2,585-line provider context (`src/context/PlayerContext.tsx`).
2. **Backend**: Multithreaded Rust daemon managing filesystem operations, SQLite relational database persistence (`%APPDATA%/OfflinePlayer/library.db`), Windows OS audio session monitoring, taskbar thumbnail icons, and an internal HTTP audio daemon (`src-tauri/src/streamer.rs`).
3. **Data Bridges**: JSON-RPC over Tauri IPC bridge connecting React UI handlers to Rust handlers in `src-tauri/src/lib.rs`.

### 1.3 High-Level Subsystem Health Scorecard

| Subsystem Domain | Grade | Status Summary | Primary Liability / Risk |
|:---|:---:|:---|:---|
| **Security & Isolation** | **F** | **CRITICAL** | Arbitrary local file disclosure via HTTP streaming daemon; open forward proxy; disabled CSP. |
| **Test Suites & CI/CD** | **F** | **BROKEN** | Backend unit tests fail to compile (`E0063`); 0 frontend test coverage; no CI scripts. |
| **State Management** | **D** | **DEGRADED** | 2,585-line monolithic context; 4Hz state thrashing re-rendering 19 top-level views during playback. |
| **Data Persistence** | **D+** | **FRACTURED** | Dual-storage divergence: SQLite tables are ignored while `localStorage` stores JSON strings. |
| **Audio Engine & DSP** | **B** | **FUNCTIONAL** | Dual-deck HTML5/Web Audio pipeline with smooth Bézier 5-band EQ; lacks bit-perfect WASAPI output. |
| **Audio Session Monitor**| **C-** | **INEFFICIENT** | Continuous 150ms `CreateToolhelp32Snapshot` system calls due to missing negative PID cache. |
| **UI Polish & Styling** | **B+** | **GOOD** | Discord-grade animations, micro-interactions, and canvas visualizers; marred by 212 hardcoded hexes. |
| **Feature Richness** | **A-** | **INNOVATIVE** | Integrated smart audio ducking, live synced lyrics, taskbar preview controls, floating mini player. |

### 1.4 Critical Vulnerabilities & Executive Blockers
- **Blocker 1 (Security Vulnerability — Arbitrary File Read)**: The internal HTTP server in `streamer.rs:87-107` accepts unauthenticated HTTP requests on `127.0.0.1` with `Access-Control-Allow-Origin: *` and serves arbitrary file paths without path sandboxing or directory containment checks. Any webpage loaded in a local web browser can exfiltrate local files (SSH keys, system files, documents).
- **Blocker 2 (Build & CI Blocker — Broken Test Suite)**: Running `cargo test` fails with 6 compiler errors (`E0063: missing fields in initializer of metadata::TrackMetadata`). Regression testing and automated CI/CD pipelines are completely broken.
- **Blocker 3 (Performance Degradation — 4Hz Rendering Cascade)**: `PlayerContext.tsx:1533-1536` triggers React state updates 4 times per second (`currentTime`). Because the context value is an inline object without selector isolation, 19 views—including the entire virtualized track table, sidebar, header, and settings—re-render 4 times every second during playback.
- **Blocker 4 (Background Battery & CPU Drain — Toolhelp32 Loop)**: `audio_monitor.rs:374` invokes `is_self_process()` every 150ms for every external audio session. Because negative results are never cached, the backend invokes `CreateToolhelp32Snapshot` dozens of times per second, generating unneeded CPU wakeups and laptop battery depletion.

---

## 2. DEEP-DIVE SUBSYSTEM AUDIT FINDINGS

### 2.1 Rust Backend & Core Architecture

#### 2.1.1 Cargo Dependencies and Build Profiles
Inspection of `src-tauri/Cargo.toml`:
- Tauri v2 core: `tauri = { version = "2", features = ["tray-icon"] }` (line 16).
- Official plugins included: `tauri-plugin-opener`, `tauri-plugin-updater`, `tauri-plugin-process`, `tauri-plugin-dialog`.
- **Missing Single-Instance Enforcement**: `tauri-plugin-single-instance` is absent. If a user clicks an associated audio file in Windows Explorer or launches the executable twice, multiple independent instances spawn simultaneously, leading to SQLite write-lock contention, multiple system tray icons, and conflicting taskbar hook bindings.
- Release profile optimizations (lines 22-28):
  ```toml
  [profile.release]
  codegen-units = 1
  lto = true
  opt-level = 3
  panic = "abort"
  strip = true
  ```
  The compiler optimization configuration is production-grade, delivering aggressive binary stripping, Link-Time Optimization (LTO), and single-codegen unit emission.

#### 2.1.2 Tauri Configuration & Process Spawning
Inspection of `src-tauri/tauri.conf.json`:
- Window setup defines `"main"` (lines 14-24) and `"tray_popup"` (lines 25-37).
- In `src-tauri/capabilities/default.json:5`, the security capability manifest specifies `"windows": ["main"]`. The secondary window `"tray_popup"` is omitted. In Tauri v2, any window not declared in capability definitions is denied access to core IPC commands, causing runtime permission errors when the tray popup attempts to interact with the backend.
- In `src-tauri/src/downloader.rs:11, 122-124`:
  ```rust
  pub struct DownloaderState {
      pub current_process: Arc<Mutex<Option<Child>>>,
  }
  ...
  // In start_download():
  *state.current_process.lock().unwrap() = Some(child);
  ```
  Starting a subsequent download silently replaces `*state.current_process` without terminating or checking the previous child process, resulting in orphaned background Python/yt-dlp processes consuming system memory and bandwidth.

#### 2.1.3 Embedded Streaming Server Concurrency
In `src-tauri/src/streamer.rs:21-27`:
```rust
thread::spawn(move || {
    for request in server.incoming_requests() {
        thread::spawn(move || {
            handle_request(request);
        });
    }
});
```
The streaming server spawns an unconstrained native OS thread for every incoming HTTP request without a worker pool or bounded semaphore. A burst of requests (e.g. rapid cover art loading or seek scrub events) can spawn dozens of concurrent threads, exhausting OS thread handles.

Furthermore, dynamic port allocation (`SERVER_PORT: AtomicU16`, line 12) generates ephemeral URLs (`http://127.0.0.1:{port}/audio?file=...`) which are written directly into database rows and local caches. When the application restarts on a different port, all persisted URLs become stale, requiring runtime string rewriting via `update_track_session_urls()` (`src-tauri/src/lib.rs:150-181`).

---

### 2.2 SQLite Persistence & Dual-Storage Desynchronization

#### 2.2.1 Database Schema & Concurrency Setup
In `src-tauri/src/db.rs`:
- Database path: `%APPDATA%\OfflinePlayer\library.db` (lines 48-52).
- PRAGMA configurations (lines 59-61):
  ```rust
  conn.pragma_update(None, "journal_mode", "WAL")?;
  conn.pragma_update(None, "synchronous", "NORMAL")?;
  conn.pragma_update(None, "foreign_keys", "ON")?;
  ```
  WAL mode and NORMAL synchrony are correctly configured for local desktop operations.
- **Missing Busy Timeout**: `db.rs` never configures `conn.busy_timeout(...)`. When SQLite encounters concurrent locks, it returns `SQLITE_BUSY` immediately rather than waiting for an in-flight transaction to finish.

#### 2.2.2 Connection Contention
In `src-tauri/src/lib.rs:310`, `scan_library()` establishes an independent SQLite connection via `db::init_db()` while `state.db` holds a pre-existing connection wrapped in `Mutex<Connection>`. When `scan_library()` performs long-running batch upserts on its standalone connection, any concurrent frontend read/write (e.g., `db_record_playback_session`) attempting to acquire `state.db` triggers immediate `SQLITE_BUSY` crashes.

#### 2.2.3 Dual-Storage Desynchronization (JSON Cache vs SQLite)
The application architecture suffers from an unresolved split between JSON disk files and SQLite:
1. `save_track_tags()` (`src-tauri/src/lib.rs:774-814`): Rewrites ID3 tags on disk and writes to `library_cache.json`, but **never executes an `UPDATE tracks` statement in SQLite `library.db`**.
2. `delete_track_file()` (`src-tauri/src/lib.rs:416-433`): Deletes the file from disk and removes it from `library_cache.json`, but **never executes `DELETE FROM tracks` in `library.db`**.
3. Frontend Playlists (`src/context/PlayerContext.tsx:258-262, 800-807`): Playlists and liked track IDs are saved directly to browser `localStorage` as JSON strings. Although `src-tauri/src/db.rs` contains fully realized relational tables for `playlists` and `playlist_tracks`, the frontend bypasses them entirely.

#### 2.2.4 Inefficient Queries & Table Scans
- **Missing Title Index**: In `src-tauri/src/db.rs:273-280`:
  ```sql
  SELECT id, file_path, title, artist, album, ... FROM tracks ORDER BY title COLLATE NOCASE ASC;
  ```
  Indexes exist on `artist`, `album`, `album_artist`, `play_count`, and `last_played`, but **no index exists on `(title COLLATE NOCASE)`**. Sorting a 25,000-track library requires a full in-memory table sort on every cold load.
- **Inefficient Playlist Mutations**: In `remove_track_from_playlist()` (`db.rs:694-704`) and `reorder_playlist_tracks()` (`db.rs:734-747`), the backend executes `DELETE FROM playlist_tracks WHERE playlist_id = ?1` and re-inserts every track sequentially in a loop, instead of updating specific row positions.
- **Synchronous Filesystem Calls in Open Transactions**: In `prune_deleted_tracks()` (`db.rs:300-309`), `std::path::Path::new(&t.file_path).exists()` is called synchronously for every track in the library inside an active transaction (`tx = conn.unchecked_transaction()?`). If a library references disconnected network drives or slow external HDDs, SQLite remains locked for the entire duration of the I/O sweep.

---

### 2.3 Audio Session Monitoring & Smart Playback Engine

#### 2.3.1 Windows WASAPI Architecture
MusicVault's smart playback system is designed to monitor external system audio and automatically duck or pause offline music playback when external streams (e.g. YouTube in Chrome, Discord voice, games) become active:
- Implementation files: `src-tauri/src/audio_session.rs` and `src-tauri/src/audio_monitor.rs`.
- Leverages native Windows CoreAudio COM interfaces: `IAudioSessionManager2`, `IAudioSessionEnumerator`, `IAudioSessionControl2`, and `IAudioMeterInformation`.

#### 2.3.2 Critical CPU Spin-Loop via Toolhelp32 Snapshot
In `src-tauri/src/audio_session.rs:84-135`:
```rust
pub fn is_self_process(pid: u32) -> bool {
    let my_pid = std::process::id();
    if pid == my_pid || pid == 0 { return true; }
    
    // Checks KNOWN_SELF_PIDS
    if let Ok(pids) = KNOWN_SELF_PIDS.lock() {
        if pids.contains(&pid) { return true; }
    }
    
    // Fallback: Walks entire process tree via CreateToolhelp32Snapshot
    let tree = get_process_tree(); // calls CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
    ...
    if is_child {
        if let Ok(mut pids) = KNOWN_SELF_PIDS.lock() {
            pids.insert(pid); // Only caches positive matches!
        }
        return true;
    }
    false // Negative match is never cached!
}
```
In `src-tauri/src/audio_monitor.rs:314, 373-376`:
```rust
// Polling interval is 150ms when external audio is active
for session in sessions.values_mut() {
    if !session.is_self && is_self_process(session.pid) {
        session.is_self = true;
    }
}
```
**Mechanism of Inefficiency**:
Every 150ms, the monitor iterates through active external audio sessions (Chrome, Discord, Zoom, Spotify, Steam). For every non-self process, it calls `is_self_process(pid)`. Because external processes are never in `KNOWN_SELF_PIDS` and negative results are not cached, `is_self_process()` calls `get_process_tree()` every single cycle. `CreateToolhelp32Snapshot` captures the state of all running processes in the OS, allocates memory, and copies process descriptors up to 20 times per second, resulting in noticeable background CPU overhead.

#### 2.3.3 Session ID Collision Bug
In `src-tauri/src/audio_monitor.rs:461`:
```rust
session_infos.push(AudioSessionInfo {
    session_id: session.process_name.clone(), // BUG: Should be unique session identifier
    pid: session.pid,
    ...
});
```
Assigning `process_name` instead of a unique session identifier creates collisions whenever a multi-process application (such as Google Chrome, which runs dozens of sub-processes with identical image names `chrome.exe`) registers multiple audio streams.

#### 2.3.4 Taskbar Controls vs System Media Transport Controls (SMTC)
- `src-tauri/src/taskbar.rs` implements Windows 7/10/11 Taskbar Thumbnail Toolbar buttons (`ITaskbarList3::ThumbBarAddButtons`, lines 200-246) using GDI bitmap buttons (lines 74-173).
- **Absence of Native Windows SMTC**: There is no `ISystemMediaTransportControls` implementation in Rust. SMTC is delegated entirely to the Chromium webview frontend via `navigator.mediaSession` in `src/context/PlayerContext.tsx:1741-1772`.
- **Background Suspension Vulnerability**: When MusicVault is hidden to the system tray (`window.hide()`, `lib.rs:471`), Microsoft Edge WebView2 background power management suspends or deprioritizes the JavaScript execution thread. When suspended, hardware media keys (Play/Pause, Next Track, Volume) freeze or exhibit multi-second latency until the window is restored.

#### 2.3.5 System Tray Menu Collisions
In `src-tauri/src/lib.rs:547-550, 1325-1345`:
- The tray setup registers a right-click handler (`on_tray_icon_event`) to compute physical coordinates and show `tray_popup`.
- Concurrently, `update_tray_playlists()` executes `tray.set_menu(Some(new_menu))`, attaching an OS native Win32 context menu to the same tray icon.
- When the user right-clicks the tray icon, the OS native context menu and the custom webview popup window render simultaneously on top of one another.
- Coordinates for `tray_popup` (`lib.rs:1334-1338`) assume a primary display with a bottom-aligned taskbar:
  ```rust
  let pos_x = (click_x - phys_w + 10.0 * scale).max(10.0);
  let pos_y = (click_y - phys_h - 10.0 * scale).max(10.0);
  ```
  On multi-monitor setups or taskbars docked to the top or sides, the tray popup renders off-screen or overlaps the taskbar.

---

### 2.4 Frontend UI/UX Architecture & State Management

#### 2.4.1 Monolithic Context Architecture (`PlayerContext.tsx`)
`src/context/PlayerContext.tsx` is 2,585 lines long and acts as a central repository for the entire frontend application. It manages:
- Playback state (`isPlaying`, `currentTime`, `duration`, `volume`, `isMuted`, `shuffle`, `repeatMode`)
- Audio engine routing and dual-deck crossfade logic
- Complete library track array (`tracks`) and active queue (`queue`)
- Playlist management and liked song sets
- Search queries, active filters, and sort configurations
- Web Audio 5-band equalizer gains and presets
- Synced lyrics parsing and line index scheduling
- Smart playback session monitoring and external audio threshold ducking
- Windows taskbar thumbnail synchronization and Discord RPC status
- Toast notifications and modal triggers

#### 2.4.2 High-Frequency 4Hz Re-Render Cascade
In `src/context/PlayerContext.tsx:1533-1536`:
```typescript
if (now - lastTime >= 250 || cTime === 0) {
  lastTime = now;
  setCurrentTime(cTime);
  if (effectiveDur > 0) setDuration(effectiveDur);
}
```
And in lines 2486-2575:
```typescript
<PlayerContext.Provider
  value={{
    tracks, currentTrack, isPlaying, currentTime, duration, volume, isMuted,
    shuffle, repeatMode, queue, contextTracks, likedTrackIds, playlists,
    equalizerPreset, customGains, currentLyrics, isLoadingLyrics,
    activeLyricIndex, toast, searchQuery, setSearchQuery, playTrack, ...
  }}
>
```
**Mechanism of Performance Degradation**:
`currentTime` is updated every 250ms (4 times per second). In React, when a context provider's `value` reference changes, every single component calling `useContext(PlayerContext)` or `usePlayer()` must re-render unless wrapped in custom selector hooks. 

In MusicVault, **19 core views and components** consume `usePlayer()`:
- `TrackList.tsx:90` (entire virtualized library table)
- `Sidebar.tsx:64` (navigation tree and playlist links)
- `Header.tsx:21` (search input, status pills, user avatar)
- `AlbumsView.tsx:21` (album grid cards)
- `ArtistsView.tsx:21` (artist grid cards)
- `PlaylistsView.tsx:67` (playlist manager)
- `SettingsView.tsx:51` (system configuration panels)
- `TitleBar.tsx:8` (window controls and title text)
- `VisualizerView.tsx` and `MiniPlayer.tsx`

Every 250 milliseconds, all 19 component subtrees re-evaluate. While `@tanstack/react-virtual` mitigates DOM re-allocations in `TrackList.tsx`, the virtualizer hooks, filter expressions, and sorting algorithms recalculate continuously, causing dropped frames during scrolling and unnecessary CPU utilization during idle music playback.

#### 2.4.3 Synchronous `localStorage` UI Thread Blocking
In `src/context/PlayerContext.tsx:825-832`:
```typescript
useEffect(() => {
  if (tracks.length > 0) {
    try {
      const lightweight = tracks.map(({ lyrics, ...rest }) => rest);
      localStorage.setItem('offline_player_track_index', JSON.stringify(lightweight));
    } catch (e) {
      console.warn('Failed to save track index to localStorage:', e);
    }
  }
}, [tracks]);
```
Every time the `tracks` array reference changes (such as during folder scans or when lyrics are attached to a track during playback), the entire library array is serialized into JSON and written synchronously to `localStorage` on the main JavaScript thread. For a library of 10,000 tracks, this stringifies ~5-8 MB of JSON, freezing UI interactions and risking browser `QuotaExceededError` crashes.

Furthermore, in `PlayerContext.tsx:338-346`, up to 2,500 play session events are stored in `localStorage.setItem('offline_player_play_events', ...)` without truncation or compaction.

#### 2.4.4 Async Tauri Event Listener Lifecycle Memory Leaks
In `src/App.tsx:141-172` and `284-323`:
```typescript
// App.tsx:141-172
const setupDragDrop = async () => {
  try {
    const appWindow = getCurrentWebviewWindow();
    unlisten = await appWindow.onDragDropEvent(async (event) => { ... });
  } catch (err) {}
};
setupDragDrop();
return () => {
  if (unlisten) unlisten();
};
```
And in `App.tsx:284-323`:
```typescript
useEffect(() => {
  let unlistenOpenView: (() => void) | undefined;
  let unlistenOpenPlaylist: (() => void) | undefined;
  let unlistenNewPlaylist: (() => void) | undefined;

  const setupTrayNavigation = async () => {
    unlistenOpenView = await listen('tray://open-view', ...);
    unlistenOpenPlaylist = await listen('tray://open-playlist', ...);
    unlistenNewPlaylist = await listen('tray://new-playlist', async () => {
      createPlaylist(); // Captures createPlaylist reference
    });
  };
  setupTrayNavigation();

  return () => {
    if (unlistenOpenView) unlistenOpenView();
    if (unlistenOpenPlaylist) unlistenOpenPlaylist();
    if (unlistenNewPlaylist) unlistenNewPlaylist();
  };
}, [createPlaylist, playlists.length, tracks]);
```
**Mechanism of the Leak**:
`setupTrayNavigation` has `[createPlaylist, playlists.length, tracks]` in its dependency array. Whenever a playlist is created or a track is updated, the effect unmounts and remounts. Because `appWindow.listen()` returns a `Promise`, the cleanup function executes *before* the async promise resolves. `unlistenOpenView` is `undefined` at the moment of cleanup. As a result, the previous listeners are never unregistered. Duplicate event listeners accumulate, and triggering "New Playlist" from the tray icon creates 2, 3, or more duplicate playlists simultaneously.

#### 2.4.5 Unvirtualized Grids in Album and Artist Views
While `TrackList.tsx` utilizes `@tanstack/react-virtual`, `src/components/AlbumsView.tsx:181` and `src/components/ArtistsView.tsx:181` render raw CSS grids:
```tsx
<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
  {albums.map((album) => (
    <motion.div key={album.name} ...>
      ...
    </motion.div>
  ))}
</div>
```
In a library with 1,500 albums, all 1,500 album cards, nested Framer Motion motion divs, album cover `<img>` tags, and hover controls are mounted into the DOM simultaneously, leading to heavy DOM tree depth and scroll jank.

---

### 2.5 Audio Playback Engine, DSP & Visualization

#### 2.5.1 Dual-Deck Audio Engine Architecture
Implemented in `src/services/audioEngine.ts:1-686`:
- Architecture: Dual HTML5 `<audio>` elements (`deckA` and `deckB`) bridged into the Web Audio API via `AudioContext.createMediaElementSource()`.
- Signal Routing Chain:
  ```
  [HTMLAudioElement (Deck A)] ---> [Deck Gain A] ---\
                                                     +---> [Pre-Gain (ReplayGain)] ---> [5-Band Biquad EQ] ---> [AnalyserNode] ---> [Master Gain] ---> [AudioDestinationNode]
  [HTMLAudioElement (Deck B)] ---> [Deck Gain B] ---/
  ```
- Output device sink routing is implemented via `audio.setSinkId()` and `audioCtx.setSinkId()` (lines 191-204).
- Gapless preloading is handled by queuing the upcoming track into the inactive deck (`preloadNext()`, lines 294-315). Crossfades execute via linear gain ramps (`transitionTo()`, lines 330-385).

#### 2.5.2 Resampling & Audiophile DAC Limitation
Because playback relies on the browser's Web Audio API (`AudioContext`), high-resolution audio files (e.g. 24-bit/96kHz or 192kHz FLAC) are resampled by the OS browser audio mixer to the system default rate (typically 44.1kHz or 48kHz). Bit-perfect, bit-accurate playback passing unadulterated PCM directly to external USB DACs is technically impossible through Web Audio API without a native Rust audio pipeline (such as `cpal` with WASAPI exclusive mode).

#### 2.5.3 5-Band Equalizer & Biquad Filter Processing
In `src/components/EqualizerModal.tsx:19-65` and `audioEngine.ts:642-659`:
- Filter topology: 5 BiquadFilterNodes:
  - 60 Hz: Low-shelf filter
  - 250 Hz: Peaking bandpass filter
  - 1,000 Hz: Peaking bandpass filter
  - 4,000 Hz: Peaking bandpass filter
  - 14,000 Hz: High-shelf filter
- Curve visualization: Evaluates dynamic Catmull-Rom / Cardinal spline Bézier curves rendered to SVG, matching physical fader handle positions. Gain parameter adjustments apply exponential smoothing to avoid audio popping.

#### 2.5.4 60 FPS Visualizer Engine & Canvas Allocations
Implemented in `src/components/VisualizerView.tsx:1-490` and `VisualizerCanvas.tsx:1-249`:
- Connects to Web Audio `AnalyserNode` (`fftSize: 512`, `smoothingTimeConstant: 0.78`).
- Features 3 visualization modes:
  1. *Radial Particle Orb*: 1,100 points distributed on a Fibonacci sphere lattice with 3D perspective projection and 32 pre-rendered radial glow sprites.
  2. *Spectrum Analyzer*: 64-band mirrored frequency bars with peak decay physics.
  3. *Liquid Waves*: 5 overlapping sinusoidal Bézier waves driven by low-frequency band energy.
- **Canvas Allocation Flaw**: In `VisualizerView.tsx:129`, the sprite generator `makeSprite()` instantiates 32 off-screen HTML canvas elements each time the effect runs or the visualizer mode changes, causing unnecessary garbage collector churn.

#### 2.5.5 Synced Lyrics Parser Discrepancies
Inspection of lyrics processing reveals discrepancies between utility parsers:
1. `src/utils/helpers.ts:47`:
   ```typescript
   const timeRegex = /\[(\d{2}):(\d{2})\.?(\d{2,3})?\]/g;
   ```
   **Bugs**: Rejects single-digit minutes (e.g. `[1:23.45]`), rejects colon-delimited centiseconds (e.g. `[01:23:45]`), and fails to parse standard LRC header offset tags (`[offset:+/-ms]`).
2. `src/utils/lyricsSearch.tsx:51`:
   ```typescript
   const TIMESTAMP_REGEX = /\[\d{1,2}:\d{2}(?:[.:]\d{1,3})?\]|<\d{1,2}:\d{2}(?:[.:]\d{1,3})?>/g;
   ```
   This regex accommodates single-digit minutes and karaoke tags (`<...>`), but is not utilized in `helpers.ts`.
3. `src/components/LyricsView.tsx`: Displays line-by-line synced lyrics; word-level karaoke animations are not supported.

#### 2.5.6 Disconnected Acoustic Accent Engine
In `src/components/AmbientGlow.tsx:170-171` and `src/utils/palette.ts`:
```typescript
// AmbientGlow computes album art dominant color and executes:
document.documentElement.style.setProperty('--song-accent', palette.accent);
```
**Dead Token Discovery**: A full text search across `src/` reveals that `--song-accent` is **never referenced in any CSS or component file**. All UI controls strictly reference `--accent`, which remains pinned to the static 4-color manual theme selector (`emerald`, `gold`, `slate`, `cyan`). The dynamic album-art harmony engine extracts colors on every song transition, but never applies them to the interface.

Additionally, in `src/components/PlaylistsView.tsx:42-49`, `getContrastTextColor('[var(--accent)]')` passes `'[var(--accent)]'` to `parseInt(hex.substring(0, 2), 16)`. Parsing `'[v'` produces `NaN` (`0`), causing the function to default to `#FFFFFF` (white text on bright emerald mint buttons).

---

### 2.6 Security Posture & Vulnerability Analysis

#### 2.6.1 VULN-01 (Critical): Arbitrary Local File Disclosure via Local Streamer
- **File**: `src-tauri/src/streamer.rs:65-107`
- **CVSS v3.1 Score**: **8.6 (High / Critical)** `CVSS:3.1/AV:L/AC:L/PR:N/UI:R/S:C/C:H/I:N/A:N`
- **Vulnerability Mechanism**:
  ```rust
  let decoded_path_str = percent_decode_str(encoded_file).decode_utf8_lossy().to_string();
  let path = PathBuf::from(&decoded_path_str);
  if !path.exists() || !path.is_file() { ... }
  let mut file = match File::open(&path) { ... }
  ```
  The endpoint `/audio?file=<encoded_path>` runs on an unauthenticated HTTP port on `127.0.0.1`. Every response includes:
  ```rust
  response.add_header(Header::from_bytes(&b"Access-Control-Allow-Origin"[..], &b"*"[..]).unwrap());
  ```
  There is no session token, no cookie authentication, and **no directory restriction** ensuring the path is within the user's music library.
- **Exploitation Scenario**: A user opens an external website while MusicVault is running. The malicious webpage scans `http://127.0.0.1:10000-65535` via JavaScript `fetch()`. Once the streamer port is discovered, the script fetches arbitrary files:
  ```javascript
  fetch('http://127.0.0.1:12345/audio?file=C:/Users/victim/.ssh/id_rsa')
    .then(r => r.text())
    .then(sshKey => exfiltrate(sshKey));
  ```
  The file contents are returned with full CORS authorization, allowing unrestricted exfiltration of user files.

#### 2.6.2 VULN-02 (Critical): Unauthenticated Open HTTP Forward Proxy
- **File**: `src-tauri/src/streamer.rs:212-272`
- **CVSS v3.1 Score**: **7.5 (High)** `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N`
- **Vulnerability Mechanism**:
  The `/proxy?url=<target>` endpoint accepts any HTTP or HTTPS URL, fetches it via `PROXY_CLIENT` with spoofed User-Agent headers, and streams the response back with `Access-Control-Allow-Origin: *`. This turns the local application into an unauthenticated open forward proxy on localhost.

#### 2.6.3 VULN-03 (High): Disabled Content Security Policy
- **File**: `src-tauri/tauri.conf.json:39-41`
- **Vulnerability Mechanism**:
  ```json
  "security": {
    "csp": null
  }
  ```
  Disabling CSP allows execution of arbitrary inline scripts, loading of remote unvetted scripts, and unconstrained websocket/HTTP connections within the desktop webview, weakening defense-in-depth protections.

#### 2.6.4 VULN-04 (High): Capability Misconfiguration for Secondary Windows
- **File**: `src-tauri/capabilities/default.json:5`
- **Vulnerability Mechanism**:
  The permissions scope declares `"windows": ["main"]`, omitting `"tray_popup"`. In Tauri v2's capability security model, unlisted windows cannot invoke backend IPC commands, breaking interactions within the secondary tray window.

#### 2.6.5 VULN-05 (Medium): Shell Argument Injection Risk in Explorer Invocation
- **File**: `src-tauri/src/lib.rs:383-404`
- **Vulnerability Mechanism**:
  ```rust
  Command::new("explorer").raw_arg(format!("/select,\"{}\"", clean_path)).spawn();
  ```
  Using `raw_arg()` bypasses Windows standard parameter sanitization. If an audio file path contains embedded double quotes or shell metacharacters, malformed arguments are passed directly to `explorer.exe`.

---

### 2.7 Test Suites & Quality Assurance Status

#### 2.7.1 Rust Backend Test Compilation Failure
Executing `cargo test --manifest-path src-tauri/Cargo.toml` fails immediately:
```
error[E0063]: missing fields `album_artist`, `date_added`, `file_format` and 2 other fields in initializer of `metadata::TrackMetadata`
   --> src\metadata.rs:528:20
    |
528 |         let meta = TrackMetadata {
    |                    ^^^^^^^^^^^^^ missing `album_artist`, `date_added`, `file_format` and 2 other fields

error[E0063]: missing fields `album_artist`, `date_added`, `file_format` and 2 other fields in initializer of `metadata::TrackMetadata`
    --> src\lib.rs:1530:25
error[E0063]: missing fields `album_artist`, `date_added`, `file_format` and 2 other fields in initializer of `metadata::TrackMetadata`
    --> src\lib.rs:1572:21
error[E0063]: missing fields `album_artist`, `date_added`, `file_format` and 2 other fields in initializer of `metadata::TrackMetadata`
    --> src\lib.rs:1620:25
error[E0063]: missing fields `album_artist`, `date_added`, `file_format` and 2 other fields in initializer of `metadata::TrackMetadata`
    --> src\lib.rs:1654:23
error[E0063]: missing fields `album_artist`, `date_added`, `file_format` and 2 other fields in initializer of `metadata::TrackMetadata`
    --> src\lib.rs:1673:23
error: could not compile `offline-player` (lib test) due to 6 previous errors
```
**Root Cause**: Struct fields (`album_artist`, `file_format`, `date_added`, `play_count`, `last_played`) were added to `TrackMetadata` in `metadata.rs`, but `TrackMetadata` does not derive or implement `Default`, and test fixture struct instantiations were never updated. As a result, the test suite cannot compile.

#### 2.7.2 Backend Test Coverage Gaps
Inspecting `src-tauri/src/`:
- `db.rs`: 0 unit tests. No tests for schema migrations, transactions, concurrency, or play history.
- `downloader.rs`: 0 unit tests.
- `lyrics.rs`: 0 unit tests.
- `discord_rpc.rs`: 0 unit tests.
- `taskbar.rs`: 0 unit tests.
- Integration tests: Zero files under `src-tauri/tests`.

#### 2.7.3 Frontend Test Setup & Zero Coverage
Inspecting `package.json:1-38`:
- Testing dependencies installed: **None** (`vitest`, `jest`, `@testing-library/react`, `@testing-library/jest-dom`, and `jsdom` are absent).
- Test scripts: **None** (`npm test` does not exist; only `"dev"`, `"build"`, `"preview"`, and `"tauri"` are declared).
- Existing test files in `src/`: **0 test files (0% test coverage)**.
- Critical algorithms operating completely untested:
  - `affinityEngine.ts` (listening habit weights, scoring formulas)
  - `palette.ts` (12-bin HSL quantization and contrast ratio calculation)
  - `helpers.ts` (LRC lyrics parser, duration formatting)
  - `m3u.ts` (playlist file parser/exporter)
  - `albumUtils.ts` (compilation and multi-disc grouping)

---

## 3. COMPETITIVE GAP ANALYSIS

### 3.1 Competitive Benchmark Matrix
MusicVault is benchmarked against four leading desktop music players: **Foobar2000 v2.1** (audiophile gold standard), **Spotify Desktop** (commercial streaming baseline), **Cider v2** (modern Electron/Vue Apple Music client), and **Feishin v0.12** (community-favorite Navidrome/Subsonic desktop client).

| Feature Dimension | MusicVault (Current) | Foobar2000 v2 | Spotify Desktop | Cider v2 | Feishin |
|:---|:---|:---|:---|:---|:---|
| **Audio Output Subsystem** | Chromium Web Audio API (OS resampled to 44.1/48kHz) | WASAPI Exclusive, ASIO, bit-perfect DAC pass-through | OS shared audio mixer | Web Audio / native CoreAudio | MPV / Web Audio backend |
| **Directory Auto-Watch** | ❌ Manual "Scan" button only | ✅ Win32 `ReadDirectoryChangesW` | ✅ Local files folder watcher | ❌ Cloud catalog only | ✅ Inotify / filesystem change polling |
| **Gapless Playback** | ⚠️ Dual deck swap; minor decoder boundary latency | ✅ Sample-accurate buffer stitching (0ms) | ✅ Seamless gapless engine | ✅ Native gapless transition | ✅ MPV sample-accurate gapless |
| **DSP & Equalization** | ⚠️ 5-band graphic EQ (60Hz to 14kHz) | ✅ 18-band graphic, parametric, VST plugins | ⚠️ 6-band graphic presets | ✅ 10-band graphic, spatial audio | ✅ 10-band EQ, ReplayGain DSP |
| **Loudness Normalization** | ⚠️ Basic tag gain multiplier; no peak limiter | ✅ EBU R128 (-18 LUFS) & ReplayGain 2.0 | ✅ ReplayGain (-14 LUFS normal/loud) | ✅ Sound Check (-16 LUFS) | ✅ ReplayGain track/album gain |
| **Batch Metadata Tagging** | ❌ Single-track edit modal only | ✅ Advanced multi-track tagger & renamer | ❌ Read-only | ❌ Cloud-managed | ⚠️ Basic metadata editing |
| **Smart Playlists** | ❌ Inactive in UI (schema exists in SQLite) | ✅ Complex queries (`%genre% IS Rock`) | ⚠️ Smart Shuffle only | ✅ Smart rules & smart playlists | ✅ Smart playlists by rating/genre |
| **Scrobbling** | ❌ Discord RPC only | ✅ Last.fm, ListenBrainz plugins | ✅ Native Last.fm scrobbling | ✅ Last.fm & ListenBrainz native | ✅ Native Last.fm & ListenBrainz |
| **Synced Lyrics** | ⚠️ Line-by-line synced LRC | ⚠️ Plugin-based line LRC | ✅ Word-by-word animated karaoke | ✅ Word-by-word fluid karaoke | ⚠️ Line-synced LRC |
| **External Audio Ducking** | ✅ WASAPI smart session monitor & ducking | ❌ None | ❌ None | ❌ None | ❌ None |
| **Memory / Footprint** | ~180MB RAM; spikes on unvirtualized views | ~35MB RAM; instant startup | ~450MB RAM (Electron multi-process) | ~280MB RAM | ~220MB RAM |

### 3.2 Strategic Differentiators & Competitive Liabilities
- **Key Differentiators**:
  - *WASAPI Smart Audio Ducking*: MusicVault's ability to automatically duck or pause music when external Windows audio sessions (videos, voice calls) become active is unique among desktop music players.
  - *Integrated Offline Downloader & YouTube/Spotify Search*: Direct integration with Python-based stream resolvers provides an integrated discovery-to-download pipeline.
  - *Native Windows Taskbar ThumbBar Controls*: Direct Win32 thumbnail toolbar buttons provide fast controls without restoring the main window.
- **Key Competitive Liabilities**:
  - Lack of automated filesystem folder watching forces manual library re-scans.
  - Absence of Last.fm / ListenBrainz scrobbling isolates the player from music tracking ecosystems.
  - Web Audio 48kHz resampling limits audiophile appeal compared to Foobar2000's bit-perfect WASAPI output.
  - Lack of batch metadata tag editing complicates managing large multi-album collections.

---

## 4. PRIORITIZED ACTIONABLE IMPROVEMENT & FEATURE PROPOSALS

### 4.1 Domain 1: Architecture & Code Health

#### ARCH-01: Repair Broken Backend Unit Test Suite
- **Priority**: **P0 (Immediate)**
- **Technical Rationale**: Running `cargo test` currently fails with 6 compiler errors (`E0063`). Automated testing and CI/CD validation are blocked until test fixtures match the expanded `TrackMetadata` struct.
- **Implementation Blueprint**:
  In `src-tauri/src/metadata.rs`, implement `Default` for `TrackMetadata`:
  ```rust
  impl Default for TrackMetadata {
      fn default() -> Self {
          Self {
              id: String::new(),
              file_path: String::new(),
              title: String::new(),
              artist: String::new(),
              album: String::new(),
              album_artist: None,
              file_format: None,
              date_added: None,
              play_count: 0,
              last_played: None,
              duration: 0.0,
              duration_str: "0:00".to_string(),
              year: None,
              bitrate: None,
              size_bytes: 0,
              cover_art: None,
              stream_url: String::new(),
              lyrics: None,
              replay_gain: None,
              track_number: None,
              disc_number: None,
              genre: None,
          }
      }
  }
  ```
  In `src-tauri/src/metadata.rs:528` and `src-tauri/src/lib.rs:1530, 1572, 1620, 1654, 1673`, append `..Default::default()` to all test struct initializers.
- **Complexity**: Low (1 hour)
- **Impact**: Critical (Restores backend compilation and test readiness)

#### ARCH-02: Migrate Playlists & Liked Songs from `localStorage` to SQLite
- **Priority**: **P1 (High)**
- **Technical Rationale**: Storing playlists and liked tracks in `localStorage` creates a split architecture where existing SQLite tables (`playlists`, `playlist_tracks`) are ignored, leaving user data vulnerable to browser storage evictions.
- **Implementation Blueprint**:
  1. Deprecate `localStorage.getItem('offline_player_playlists')` and `localStorage.setItem('offline_player_playlists')` in `src/context/PlayerContext.tsx:258-262, 800-807`.
  2. Wire frontend playlist actions to existing Tauri commands: `db_get_playlists`, `db_create_playlist`, `db_add_tracks_to_playlist`, `db_remove_track_from_playlist`, `db_delete_playlist`.
  3. Add one-time migration hook on app startup: if `localStorage` contains legacy playlists, bulk-insert them into SQLite and set a migration flag.
- **Complexity**: Medium (1-2 days)
- **Impact**: High (Eliminates data loss risk, supports large playlists reliably)

#### ARCH-03: Decompose Monolithic `PlayerContext.tsx` via Zustand Stores
- **Priority**: **P1 (High)**
- **Technical Rationale**: The 2,585-line context combines playback timing, library catalogs, audio filters, lyrics, and modals into a single provider. Because React context re-renders all consumers on any value update, high-frequency playback ticks cause unnecessary tree-wide re-renders.
- **Implementation Blueprint**:
  Split `PlayerContext.tsx` into modular Zustand stores with selector support:
  - `usePlaybackStore`: `isPlaying`, `volume`, `isMuted`, `repeatMode`, `shuffle`, `currentTrack`, `queue`
  - `useProgressStore`: `currentTime`, `duration`, `bufferedTime` (high-frequency slice)
  - `useLibraryStore`: `tracks`, `playlists`, `likedTrackIds`, `searchQuery`
  - `useLyricsStore`: `currentLyrics`, `activeLyricIndex`, `isLoadingLyrics`
  - `useUIStore`: `activeModal`, `isMiniPlayer`, `toast`
- **Complexity**: High (3-4 days)
- **Impact**: High (Prevents unnecessary re-renders, simplifies codebase maintainability)

#### ARCH-04: Implement Global React Error Boundary & Fallback UI
- **Priority**: **P1 (High)**
- **Technical Rationale**: Uncaught errors in canvas render loops, Web Audio nodes, or lyrics parsers currently cause white-screen crashes for the entire application.
- **Implementation Blueprint**:
  In `src/components/ErrorBoundary.tsx`, implement a React error boundary wrapping `MainApp` in `src/main.tsx:9-13`:
  ```tsx
  export class ErrorBoundary extends React.Component<Props, State> {
    state = { hasError: false, error: null };
    static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
    componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('App Crash:', error, info); }
    render() {
      if (this.state.hasError) {
        return (
          <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#0a0a0f] text-white p-6">
            <h2 className="text-xl font-bold mb-2">MusicVault Encountered an Error</h2>
            <p className="text-sm text-neutral-400 mb-4">{this.state.error?.message}</p>
            <button onClick={() => window.location.reload()} className="px-4 py-2 bg-emerald-500 rounded-lg text-black font-semibold">
              Restart Player
            </button>
          </div>
        );
      }
      return this.props.children;
    }
  }
  ```
- **Complexity**: Low (2 hours)
- **Impact**: High (Prevents total UI lockup on unexpected exceptions)

#### ARCH-05: Optimize SQLite Prune Query & Add Missing Indexes
- **Priority**: **P2 (Medium)**
- **Technical Rationale**: `prune_deleted_tracks` in `db.rs:292-300` loads all tracks into memory to diff paths. Furthermore, queries ordering by `title COLLATE NOCASE ASC` perform table scans due to a missing index.
- **Implementation Blueprint**:
  In `src-tauri/src/db.rs`:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_tracks_title_nocase ON tracks(title COLLATE NOCASE ASC);
  ```
  And in `prune_deleted_tracks`, stream missing file paths in batches and execute:
  ```sql
  DELETE FROM tracks WHERE id IN (SELECT value FROM json_each(?1));
  ```
- **Complexity**: Low (3 hours)
- **Impact**: Medium (Reduces cold startup and library scan times)

---

### 4.2 Domain 2: Performance & Resource Usage

#### PERF-01: Decouple High-Frequency Playback Progress from React Context
- **Priority**: **P0 (Immediate)**
- **Technical Rationale**: Pushing `currentTime` updates to React state 4 times per second (`PlayerContext.tsx:1533-1536`) causes 19 major consumer components to re-render continuously during playback.
- **Implementation Blueprint**:
  1. Remove `currentTime` and `duration` from `PlayerContext.Provider`.
  2. Implement a lightweight pub/sub event emitter or micro-store for playback timing:
     ```typescript
     // src/services/progressEmitter.ts
     type ProgressListener = (time: number, duration: number) => void;
     const listeners = new Set<ProgressListener>();
     export const subscribeProgress = (fn: ProgressListener) => {
       listeners.add(fn);
       return () => listeners.delete(fn);
     };
     export const emitProgress = (time: number, duration: number) => {
       listeners.forEach(fn => fn(time, duration));
     };
     ```
  3. In `PlayerBar.tsx`, subscribe the scrub bar and time labels directly to `subscribeProgress`, updating the DOM element text and slider fill via refs or requestAnimationFrame without triggering component re-renders.
- **Complexity**: Medium (1-2 days)
- **Impact**: Critical (Eliminates idle rendering jank, drops playback CPU usage significantly)

#### PERF-02: Implement Grid Virtualization for Album and Artist Views
- **Priority**: **P1 (High)**
- **Technical Rationale**: `AlbumsView.tsx:181` and `ArtistsView.tsx:181` render all cards simultaneously into the DOM. For collections with 1,000+ albums or artists, mounting thousands of Framer Motion wrappers causes noticeable scroll stutter.
- **Implementation Blueprint**:
  In `AlbumsView.tsx` and `ArtistsView.tsx`, integrate `@tanstack/react-virtual` row windowing:
  ```tsx
  const rowVirtualizer = useVirtualizer({
    count: Math.ceil(albums.length / columnCount),
    getScrollElement: () => parentRef.current,
    estimateSize: () => 260,
    overscan: 2,
  });
  ```
  Render only visible rows containing `columnCount` cards each.
- **Complexity**: Medium (1 day)
- **Impact**: High (Smooth 60fps scrolling across large libraries)

#### PERF-03: Route-Level Code Splitting & Dynamic Imports in Vite
- **Priority**: **P2 (Medium)**
- **Technical Rationale**: Running `npm run build` produces a monolithic 883 kB JavaScript bundle. Secondary windows like `tray_popup` (228x360 px) load this full bundle on launch.
- **Implementation Blueprint**:
  In `src/App.tsx`, convert secondary views to `React.lazy()`:
  ```tsx
  const DownloaderView = React.lazy(() => import('./components/DownloaderView'));
  const EqualizerModal = React.lazy(() => import('./components/EqualizerModal'));
  const VisualizerView = React.lazy(() => import('./components/VisualizerView'));
  const SettingsView = React.lazy(() => import('./components/SettingsView'));
  const OnlineSearchView = React.lazy(() => import('./components/OnlineSearchView'));
  ```
  Wrap views with `<Suspense fallback={<LoadingSpinner />}>`.
- **Complexity**: Low (3 hours)
- **Impact**: Medium (Reduces initial bundle size to ~250 kB, accelerating cold start)

#### PERF-04: Negative Caching for `is_self_process` in Audio Monitor
- **Priority**: **P1 (High)**
- **Technical Rationale**: `audio_monitor.rs:374` checks `is_self_process(session.pid)` every 150ms. Because negative results are not cached, it repeatedly executes `CreateToolhelp32Snapshot`, creating background CPU overhead.
- **Implementation Blueprint**:
  In `src-tauri/src/audio_session.rs`, implement a TTL-based cache for PID classifications:
  ```rust
  struct PidClassification {
      is_self: bool,
      evaluated_at: Instant,
  }
  static PID_CACHE: Mutex<Option<HashMap<u32, PidClassification>>> = Mutex::new(None);

  pub fn is_self_process(pid: u32) -> bool {
      let my_pid = std::process::id();
      if pid == my_pid || pid == 0 { return true; }
      
      let now = Instant::now();
      if let Ok(guard) = PID_CACHE.lock() {
          if let Some(ref cache) = *guard {
              if let Some(entry) = cache.get(&pid) {
                  if now.duration_since(entry.evaluated_at) < Duration::from_secs(10) {
                      return entry.is_self;
                  }
              }
          }
      }
      
      let is_self = evaluate_process_is_child(pid);
      if let Ok(mut guard) = PID_CACHE.lock() {
          let cache = guard.get_or_insert_with(HashMap::new);
          cache.insert(pid, PidClassification { is_self, evaluated_at: now });
      }
      is_self
  }
  ```
- **Complexity**: Low (2 hours)
- **Impact**: High (Cuts background snapshot frequency from 20/sec down to near-zero)

---

### 4.3 Domain 3: UI/UX Polish & Accessibility

#### UIUX-01: Keyboard Navigation & ARIA Compliance in `TrackList.tsx`
- **Priority**: **P1 (High)**
- **Technical Rationale**: Track rows are rendered as non-focusable `<div>` elements without `tabIndex`, `role="row"`, or `aria-selected` attributes (`TrackList.tsx:1088-1100`). Keyboard-only and assistive technology users cannot navigate the library.
- **Implementation Blueprint**:
  1. Add `tabIndex={0}`, `role="row"`, and `aria-selected={isSelected}` to track rows.
  2. Implement an active focus index:
     - `ArrowDown` / `ArrowUp`: Move row focus up/down
     - `Enter`: Play focused track
     - `Space`: Toggle selection
     - `Delete`: Remove selected track from playlist
  3. Add visible focus indicators via Tailwind `focus-visible:ring-1 focus-visible:ring-emerald-500/50`.
- **Complexity**: Medium (1 day)
- **Impact**: High (Achieves WCAG 2.1 AA keyboard accessibility)

#### UIUX-02: Consolidate Color Tokens & Eliminate Hardcoded Hex Codes
- **Priority**: **P2 (Medium)**
- **Technical Rationale**: Over 212 hardcoded hex color codes are scattered across `TrackList.tsx` (174 occurrences) and `PlayerBar.tsx` (38 occurrences), bypassing CSS variables and breaking theme consistency.
- **Implementation Blueprint**:
  1. Audit and replace hardcoded hex codes with semantic CSS variables:
     - `#121118`, `#181622` -> `var(--bg-surface)`
     - `#F4F2F7` -> `var(--text-primary)`
     - `#65616F`, `#4B4854` -> `var(--text-secondary)`
     - Emerald/cyan accent hexes -> `var(--accent)`
  2. Fix `getContrastTextColor()` in `src/components/PlaylistsView.tsx:42-49` to handle CSS variable strings safely.
- **Complexity**: Medium (1 day)
- **Impact**: Medium (Enables consistent styling and custom theme support)

#### UIUX-03: Lower Window Constraints for Scaled Displays
- **Priority**: **P1 (High)**
- **Technical Rationale**: `tauri.conf.json:19-20` enforces `"minWidth": 1150, "minHeight": 750`. On 1366x768 screens or 1080p laptops with 125%/150% Windows scaling (effective 720px height), the window overflows the screen boundaries and taskbar.
- **Implementation Blueprint**:
  In `src-tauri/tauri.conf.json:19-20`, update window limits:
  ```json
  "minWidth": 960,
  "minHeight": 640
  ```
  In `src/App.tsx:180`, adjust sidebar collapse threshold to trigger below 1024px.
- **Complexity**: Low (1 hour)
- **Impact**: High (Prevents window clipping on standard laptop displays)

#### UIUX-04: Atomic Mini-Player Transition Engine
- **Priority**: **P2 (Medium)**
- **Technical Rationale**: Toggling Mini Player executes a 6-step sequential asynchronous IPC waterfall on Windows (`unmaximize`, `innerSize`, `setMinSize`, `setMaxSize`, `setSize`, `setAlwaysOnTop`), causing noticeable window jitter and layout reflow flashes.
- **Implementation Blueprint**:
  Create a dedicated Rust command `toggle_mini_player(enable: bool)` that batches window changes atomically using native Win32 `SetWindowPos()` with flags `SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED`, eliminating multi-step async jitter.
- **Complexity**: Low (3 hours)
- **Impact**: Medium (Smooth, flicker-free mini-player transitions)

#### UIUX-05: Desktop Right-Click Context Menus for Albums and Artists
- **Priority**: **P2 (Medium)**
- **Technical Rationale**: While `TrackList.tsx` has custom context menus, right-clicking albums or artists does nothing or triggers the suppressed browser menu.
- **Implementation Blueprint**:
  Port the context menu component to `AlbumsView.tsx` and `ArtistsView.tsx`, providing standard desktop options:
  - "Play Album / Artist"
  - "Add Album to Queue"
  - "Save Album as Playlist"
  - "Open Album Folder in Explorer"
- **Complexity**: Medium (1 day)
- **Impact**: Medium (Consistent desktop UX across all media views)

---

### 4.4 Domain 4: New Audio/Player Features & Ecosystem

#### FEAT-01: Secure Local Streaming Server with Path Sandboxing & Tokens
- **Priority**: **P0 (Immediate)**
- **Technical Rationale**: The unauthenticated HTTP server in `streamer.rs` allows arbitrary local file reads and functions as an open proxy on localhost with wildcard CORS.
- **Implementation Blueprint**:
  1. Generate an ephemeral 128-bit cryptographically secure session token on startup (`AUTH_TOKEN: OnceCell<String>`).
  2. Require `?token=<auth_token>` on all requests to `/audio` and `/cover`.
  3. Restrict `Access-Control-Allow-Origin` to `http://tauri.localhost` or `tauri://localhost`.
  4. Perform canonical path containment checks in `/audio`:
     ```rust
     let canonical_path = std::fs::canonicalize(&path).map_err(|_| "Not found")?;
     let allowed_dirs = get_authorized_music_directories();
     if !allowed_dirs.iter().any(|dir| canonical_path.starts_with(dir)) {
         return respond_forbidden("Access denied: path outside music directories");
     }
     ```
  5. Remove `/proxy` entirely or restrict it to whitelisted CDNs (e.g. Spotify/iTunes album art).
- **Complexity**: Low (3 hours)
- **Impact**: Critical (Eliminates high-severity security vulnerability)

#### FEAT-02: Configure Tauri Capabilities for Secondary Windows & Enable CSP
- **Priority**: **P0 (Immediate)**
- **Technical Rationale**: Disabling CSP (`csp: null`) removes webview script protections, and omitting `"tray_popup"` from `capabilities/default.json:5` causes IPC permission denials in the tray window.
- **Implementation Blueprint**:
  1. In `src-tauri/capabilities/default.json:5`, add `"tray_popup"`:
     ```json
     "windows": ["main", "tray_popup"]
     ```
  2. In `src-tauri/tauri.conf.json:39-41`, define a Content Security Policy:
     ```json
     "security": {
       "csp": "default-src 'self' tauri: localhost; media-src 'self' http://127.0.0.1:* tauri: blob:; img-src 'self' http://127.0.0.1:* https: data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:;"
     }
     ```
- **Complexity**: Low (1 hour)
- **Impact**: High (Restores capability permissions and enforces webview security)

#### FEAT-03: Audio Error Handling & Audio Device Disconnect Resilience
- **Priority**: **P1 (High)**
- **Technical Rationale**: `audioEngine.onError` is never registered in `PlayerContext.tsx`, and Rust emits `"audio-device-changed"` but the frontend has zero listeners for it. Unplugging headphones causes playback to hang silently.
- **Implementation Blueprint**:
  1. In `PlayerContext.tsx`, assign `audioEngine.onError = (msg) => showToast('Playback Error', msg, 'error');`.
  2. Add an event listener for `"audio-device-changed"` in `PlayerContext.tsx`:
     ```typescript
     listen('audio-device-changed', async () => {
       await audioEngine.refreshAudioSink();
       showToast('Audio Device', 'Output device reconnected', 'info');
     });
     ```
- **Complexity**: Low (2 hours)
- **Impact**: High (Handles audio errors and device disconnections gracefully)

#### FEAT-04: Filesystem Directory Watcher (`notify` Crate)
- **Priority**: **P2 (Medium)**
- **Technical Rationale**: Users must manually click "Scan Library" to detect new downloads or deleted tracks. Modern desktop players (Foobar2000, Spotify) monitor music folders automatically.
- **Implementation Blueprint**:
  1. Add `notify = "6.1"` to `src-tauri/Cargo.toml`.
  2. In `src-tauri/src/watcher.rs`, initialize a background filesystem watcher on configured music folders.
  3. On file creation, deletion, or modification, emit `library://file-changed` over Tauri IPC to update the SQLite database and notify the frontend incrementally without a full re-scan.
- **Complexity**: Medium (2 days)
- **Impact**: High (Matches Foobar2000/Spotify local library behavior)

#### FEAT-05: Last.fm & ListenBrainz Scrobbling Integration
- **Priority**: **P2 (Medium)**
- **Technical Rationale**: Music tracking enthusiasts rely on scrobbling to log listening history. MusicVault currently only supports Discord Rich Presence.
- **Implementation Blueprint**:
  1. In `src-tauri/src/scrobbler.rs`, implement Last.fm Scrobbling 2.0 and ListenBrainz APIs.
  2. Add authentication fields (API key, session token) to Settings.
  3. When a track plays past 50% or 4 minutes, submit the scrobble session in the background.
- **Complexity**: Medium (2 days)
- **Impact**: Medium (High-demand feature for music tracking communities)

#### FEAT-06: Batch Metadata Tag Editor
- **Priority**: **P2 (Medium)**
- **Technical Rationale**: Currently, metadata can only be edited one track at a time (`EditTrackTagsModal.tsx`). Cleaning up album titles, artist names, or genres across 50 tracks is tedious.
- **Implementation Blueprint**:
  1. Enhance `EditTrackTagsModal.tsx` to accept `Track[]` instead of a single track.
  2. Fields leave unchanged values intact while applying updated fields (e.g. Genre, Year, Artist) to all selected tracks.
  3. In `src-tauri/src/lib.rs`, add `save_batch_track_tags(ids, tags)` to update files and SQLite rows in a single background transaction.
- **Complexity**: Medium (2 days)
- **Impact**: High (Standard music management tool for library curation)

#### FEAT-07: Dynamic Smart Playlist Rule Engine
- **Priority**: **P3 (Long-term)**
- **Technical Rationale**: SQLite already includes `is_smart` and `smart_rules` columns in the `playlists` table (`db.rs:115-126`), but the frontend has no UI to create or evaluate smart playlists.
- **Implementation Blueprint**:
  1. Build a rule builder UI: Match [All / Any] of conditions (`Play Count >= X`, `Year = Y`, `Genre contains Z`, `Date Added within N days`).
  2. Implement a SQL query generator in `db.rs` that translates JSON rule definitions into SQL `WHERE` clauses for automated dynamic playlist populations.
- **Complexity**: High (3 days)
- **Impact**: High (Activates existing database schema investment)

#### FEAT-08: Word-by-Word Animated Karaoke Lyrics
- **Priority**: **P3 (Long-term)**
- **Technical Rationale**: While line-by-line synced lyrics are implemented, modern desktop players (Apple Music, Spotify, Cider) feature word-by-word timed karaoke lyrics with smooth visual transitions.
- **Implementation Blueprint**:
  1. Extend the lyrics parser to support enhanced LRC / TTML / Syllable timestamps (`<00:01.23> Word`).
  2. In `LyricsView.tsx`, render words as individual inline spans animated with Framer Motion, applying active glow and scale transitions in sync with playback.
- **Complexity**: Medium (2-3 days)
- **Impact**: Medium (Delivers an elevated, modern visual lyrics experience)

---

## 5. PHASED IMPLEMENTATION ROADMAP

```
=====================================================================================================
                                PHASED IMPLEMENTATION ROADMAP
=====================================================================================================

Phase 1: Immediate Critical Fixes (Security, Broken Tests, Capabilities)  [Timeline: Days 1 - 3]
-----------------------------------------------------------------------------------------------------
  - ARCH-01: Fix TrackMetadata Default & compile cargo test suite
  - FEAT-01: Sandbox streamer.rs, enforce path containment, add session token, remove CORS *
  - FEAT-02: Add tray_popup to capabilities/default.json & configure strict CSP
  - PERF-04: Implement PID negative caching in audio_session.rs to stop Toolhelp32 snapshot loop
  - Milestones: All backend tests pass; security audit verification complete; CPU idle drops.

Phase 2: Performance Optimization & State Modernization                   [Timeline: Weeks 1 - 2]
-----------------------------------------------------------------------------------------------------
  - PERF-01: Decouple currentTime from React Context via progress micro-store / pub-sub
  - ARCH-02: Migrate playlists & liked tracks from localStorage to SQLite
  - PERF-02: Add grid virtualization to AlbumsView & ArtistsView
  - ARCH-03: Decompose monolithic PlayerContext into discrete Zustand slices
  - PERF-03: Implement Vite code-splitting and dynamic imports for secondary views
  - Milestones: 4Hz re-render cascade eliminated; large libraries scroll at 60fps; cold start <500ms.

Phase 3: Desktop UI/UX Polish & Hardening                                  [Timeline: Weeks 2 - 3]
-----------------------------------------------------------------------------------------------------
  - UIUX-01: Add keyboard navigation (ArrowUp/Down, Enter) & ARIA attributes in TrackList
  - UIUX-02: Consolidate hardcoded hex colors into semantic CSS variables
  - UIUX-03: Adjust minWidth to 960px & minHeight to 640px in tauri.conf.json
  - ARCH-04: Implement React ErrorBoundary in main.tsx
  - FEAT-03: Register audioEngine.onError and wire audio-device-changed listeners
  - UIUX-04: Atomic mini-player window transitions via native Win32 SetWindowPos
  - UIUX-05: Desktop right-click context menus for Albums and Artists
  - Milestones: WCAG 2.1 AA keyboard compliance; responsive window scaling; robust error handling.

Phase 4: High-Value Audio & Ecosystem Features                             [Timeline: Weeks 3 - 5]
-----------------------------------------------------------------------------------------------------
  - FEAT-04: Implement filesystem folder watcher using notify crate
  - FEAT-05: Integrate Last.fm & ListenBrainz scrobbling service
  - FEAT-06: Implement batch metadata tag editor for multi-track selections
  - FEAT-07: Build UI and query generator for dynamic Smart Playlists
  - FEAT-08: Enhance synced lyrics to support word-by-word karaoke animations
  - Milestones: Parity with Foobar2000 and Spotify local files; automated catalog sync.
=====================================================================================================
```

---

## 6. VERIFICATION, REPRODUCTION & TEST PLAN

### 6.1 Backend Test & Compilation Verification

#### Test Suite Compilation Verification
Execute the standard Rust test suite from the repository root:
```powershell
cargo test --manifest-path src-tauri/Cargo.toml
```
- **Current Defect (Before ARCH-01)**: Fails with 6 instances of compiler error `E0063: missing fields in initializer of metadata::TrackMetadata`.
- **Expected Result (Post ARCH-01)**: The compiler succeeds with zero errors, and all unit tests in `src-tauri` execute and pass cleanly.

#### Static Typechecking & Frontend Build
Execute the TypeScript typechecker and production bundler:
```powershell
npx tsc --noEmit
npm run build
```
- **Expected Result**: Clean compilation with exit code 0. Post-PERF-03, Vite emitted asset chunks should no longer trigger the `>500 kB` bundle size warning.

---

### 6.2 Security Vulnerability Exploitation & Verification Procedures

#### Verifying Localhost Arbitrary File Disclosure (VULN-01)
1. Launch MusicVault in development or production mode.
2. Check the console log or process netstat for the dynamic streaming port:
   `MusicVault local audio streaming server started on 127.0.0.1:<PORT>`
3. In a terminal, send an HTTP GET request for a sensitive file outside the music directory:
   ```powershell
   curl -i "http://127.0.0.1:<PORT>/audio?file=C:%5CWindows%5CSystem32%5Cdrivers%5Cetc%5Chosts"
   ```
   - **Vulnerable Behavior**: Returns `HTTP/1.1 200 OK` or `206 Partial Content` with the contents of the `hosts` file and `Access-Control-Allow-Origin: *`.
   - **Remediated Behavior (Post FEAT-01)**: Returns `HTTP/1.1 403 Forbidden` (`"Access Denied: Path outside music library"`) or `401 Unauthorized` (missing session token).

#### Verifying Unauthenticated Open Proxy (VULN-02)
Execute a request through the `/proxy` endpoint:
```powershell
curl -i "http://127.0.0.1:<PORT>/proxy?url=https://httpbin.org/ip"
```
- **Vulnerable Behavior**: Returns the external IP address response via `tiny_http`.
- **Remediated Behavior (Post FEAT-01)**: Returns `HTTP/1.1 403 Forbidden` or `404 Not Found`.

#### Verifying Secondary Window Capability Enforcement (VULN-04)
Inspect `src-tauri/capabilities/default.json`. Confirm `"windows"` contains both `"main"` and `"tray_popup"`. Verify that actions performed from the tray popup window (such as updating playlists or opening settings) execute without Tauri permission errors.

---

### 6.3 Frontend Performance & State Profiling Procedures

#### Verifying 4Hz Re-render Decoupling (PERF-01)
1. In `src/components/AlbumsView.tsx` or `src/components/Header.tsx`, add a debug counter:
   ```typescript
   console.count('AlbumsView Render');
   ```
2. Start playback of an audio track.
- **Current Defect**: `AlbumsView Render` increments 4 times every second continuously while the track plays.
- **Remediated Behavior (Post PERF-01)**: `AlbumsView Render` logs on initial mount, search query changes, or library updates, but remains completely idle during audio playback ticks.

#### Verifying Toolhelp32 CPU Snapshot Reduction (PERF-04)
1. Open Windows Task Manager or Process Hacker.
2. Launch MusicVault alongside Google Chrome playing an external YouTube video.
3. Observe MusicVault background CPU utilization and thread wakeups.
- **Current Defect**: CPU utilization remains elevated due to repeated `CreateToolhelp32Snapshot` calls every 150ms.
- **Remediated Behavior (Post PERF-04)**: CPU utilization drops to near 0% during idle playback monitoring due to 10-second TTL negative PID caching.

---

### 6.4 Regression & Acceptance Test Matrix

| Test ID | Domain | Test Procedure | Acceptance Criteria |
|:---|:---|:---|:---|
| **TEST-01** | Test Suite | Run `cargo test --manifest-path src-tauri/Cargo.toml` | All unit tests compile and pass with 0 errors. |
| **TEST-02** | Security | Request `/audio?file=C:/Windows/win.ini` via HTTP GET | Server responds with HTTP 403 Forbidden. |
| **TEST-03** | Security | Check `Access-Control-Allow-Origin` on `/audio` responses | Wildcard `*` is absent; restricted to localhost. |
| **TEST-04** | Performance | Monitor React DevTools Profiler during 30s playback | `TrackList`, `Sidebar`, and `Header` render 0 times on ticks. |
| **TEST-05** | Performance | Scroll through a library with 1,500 albums in `AlbumsView` | Virtualized grid renders smoothly at 60fps. |
| **TEST-06** | State / DB | Create playlist, restart app, clear browser `localStorage` | Playlists persist intact from SQLite database. |
| **TEST-07** | UI / A11y | Navigate library using only `ArrowDown`, `ArrowUp`, `Enter` | Selected track plays; focus indicator is visible. |
| **TEST-08** | Audio | Unplug default audio output device (headphones/DAC) | Audio engine switches output sink without crashing. |
| **TEST-09** | Windowing | Launch app on 1366x768 display scaling | Window fits screen without overflowing taskbar. |
| **TEST-10** | Features | Drop a new MP3 file into configured music folder | Track appears in library automatically via folder watcher. |

---

## 7. CONCLUSION

MusicVault possesses strong desktop foundations, combining high-performance Rust subsystems, low-level WASAPI audio session integration, and visual polish. However, architectural debt—in particular, the unauthenticated local streaming server, broken backend unit tests, 4Hz monolithic context re-rendering, and dual-storage drift between SQLite and `localStorage`—undermines stability, security, and performance.

By executing the prioritized 4-phase remediation roadmap outlined in this report:
1. **Security & Build Stability** are restored immediately in Phase 1 (sandboxing the local streamer, fixing `cargo test`, and updating Tauri capabilities).
2. **Performance & Architecture** are modernized in Phase 2 (decoupling playback ticks, virtualizing grid views, and migrating state to SQLite).
3. **Desktop Polish & Accessibility** are hardened in Phase 3 (WCAG keyboard navigation, unified color tokens, responsive display limits, and error boundaries).
4. **Ecosystem & Feature Growth** are unlocked in Phase 4 (folder auto-watching, Last.fm scrobbling, batch tag editing, and dynamic smart playlists).

This engineering sequence will transition MusicVault from a promising prototype into an audiophile-grade, robust, and secure desktop music management platform.
