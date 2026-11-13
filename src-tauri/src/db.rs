use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use crate::metadata::TrackMetadata;

pub struct DbState {
    pub conn: Mutex<Connection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbPlaylist {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub cover_art: Option<String>,
    pub cover_color: Option<String>,
    pub is_smart: bool,
    pub smart_rules: Option<String>,
    pub created_at: u64,
    pub updated_at: u64,
    pub sort_order: Option<String>,
    pub track_count: usize,
    pub total_duration: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DbAlbum {
    pub id: String,
    pub title: String,
    pub album_artist: String,
    pub year: Option<u32>,
    pub cover_art: Option<String>,
    pub track_count: usize,
    pub total_duration: f64,
    pub is_compilation: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaybackSessionInput {
    pub track_id: String,
    pub duration_played: f64,
    pub track_duration: f64,
    pub completed: bool,
    pub was_replay: bool,
}

pub fn get_db_path() -> PathBuf {
    let dir = crate::get_appdata_dir();
    let _ = std::fs::create_dir_all(&dir);
    dir.join("library.db")
}

pub fn init_db() -> Result<Connection, rusqlite::Error> {
    let path = get_db_path();
    let conn = Connection::open(path)?;
    conn.busy_timeout(std::time::Duration::from_secs(5))?;

    // Enable WAL mode & foreign keys for high-performance concurrent reads
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "synchronous", "NORMAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;

    run_migrations(&conn)?;
    Ok(conn)
}

fn run_migrations(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at INTEGER NOT NULL
        );
        "
    )?;

    let current_version: u32 = conn
        .query_row(
            "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if current_version < 1 {
        conn.execute_batch(
            "
            BEGIN TRANSACTION;

            CREATE TABLE IF NOT EXISTS tracks (
                id TEXT PRIMARY KEY,
                file_path TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                album TEXT NOT NULL,
                album_artist TEXT,
                duration REAL NOT NULL,
                duration_str TEXT NOT NULL,
                year INTEGER,
                bitrate INTEGER,
                size_bytes INTEGER NOT NULL,
                cover_art TEXT,
                stream_url TEXT NOT NULL,
                lyrics TEXT,
                replay_gain REAL,
                track_number INTEGER,
                disc_number INTEGER,
                genre TEXT,
                file_format TEXT,
                date_added INTEGER NOT NULL,
                play_count INTEGER NOT NULL DEFAULT 0,
                last_played INTEGER
            );

            CREATE TABLE IF NOT EXISTS playlists (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                cover_art TEXT,
                cover_color TEXT,
                is_smart INTEGER NOT NULL DEFAULT 0,
                smart_rules TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                sort_order TEXT DEFAULT 'custom'
            );

            CREATE TABLE IF NOT EXISTS playlist_tracks (
                playlist_id TEXT NOT NULL,
                track_id TEXT NOT NULL,
                position INTEGER NOT NULL,
                added_at INTEGER NOT NULL,
                PRIMARY KEY (playlist_id, track_id, position),
                FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
                FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS play_history (
                id TEXT PRIMARY KEY,
                track_id TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                duration_played REAL NOT NULL,
                completed INTEGER NOT NULL,
                was_replay INTEGER NOT NULL,
                FOREIGN KEY (track_id) REFERENCES tracks(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
            CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album);
            CREATE INDEX IF NOT EXISTS idx_tracks_album_artist ON tracks(album_artist);
            CREATE INDEX IF NOT EXISTS idx_tracks_play_count ON tracks(play_count DESC);
            CREATE INDEX IF NOT EXISTS idx_tracks_last_played ON tracks(last_played DESC);
            CREATE INDEX IF NOT EXISTS idx_playlist_tracks_pos ON playlist_tracks(playlist_id, position);
            CREATE INDEX IF NOT EXISTS idx_play_history_time ON play_history(timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_play_history_track ON play_history(track_id);

            INSERT INTO schema_migrations (version, applied_at) VALUES (1, unixepoch());

            COMMIT;
            "
        )?;
    }

    Ok(())
}

// ============================================================================
// Tracks CRUD & Sync
// ============================================================================

pub fn upsert_tracks(conn: &Connection, tracks: &[TrackMetadata]) -> Result<usize> {
    let mut stmt = conn.prepare_cached(
        "
        INSERT INTO tracks (
            id, file_path, title, artist, album, album_artist, duration, duration_str,
            year, bitrate, size_bytes, cover_art, stream_url, lyrics, replay_gain,
            track_number, disc_number, genre, file_format, date_added, play_count, last_played
        ) VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
            ?9, ?10, ?11, ?12, ?13, ?14, ?15,
            ?16, ?17, ?18, ?19, ?20, COALESCE((SELECT play_count FROM tracks WHERE id = ?1), 0),
            (SELECT last_played FROM tracks WHERE id = ?1)
        )
        ON CONFLICT(id) DO UPDATE SET
            file_path = excluded.file_path,
            title = excluded.title,
            artist = excluded.artist,
            album = excluded.album,
            album_artist = excluded.album_artist,
            duration = excluded.duration,
            duration_str = excluded.duration_str,
            year = excluded.year,
            bitrate = excluded.bitrate,
            size_bytes = excluded.size_bytes,
            cover_art = COALESCE(excluded.cover_art, tracks.cover_art),
            stream_url = excluded.stream_url,
            lyrics = COALESCE(excluded.lyrics, tracks.lyrics),
            replay_gain = excluded.replay_gain,
            track_number = excluded.track_number,
            disc_number = excluded.disc_number,
            genre = excluded.genre,
            file_format = excluded.file_format;
        ",
    )?;

    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let tx = conn.unchecked_transaction()?;
    let mut count = 0;

    for track in tracks {
        let added_at = track.date_added.unwrap_or(now) as i64;
        stmt.execute(params![
            track.id,
            track.file_path,
            track.title,
            track.artist,
            track.album,
            track.album_artist,
            track.duration,
            track.duration_str,
            track.year,
            track.bitrate,
            track.size_bytes as i64,
            track.cover_art,
            track.stream_url,
            track.lyrics,
            track.replay_gain,
            track.track_number,
            track.disc_number,
            track.genre,
            track.file_format,
            added_at,
        ])?;
        count += 1;
    }

    tx.commit()?;
    Ok(count)
}

fn row_to_track(row: &rusqlite::Row) -> Result<TrackMetadata> {
    Ok(TrackMetadata {
        id: row.get(0)?,
        file_path: row.get(1)?,
        title: row.get(2)?,
        artist: row.get(3)?,
        album: row.get(4)?,
        album_artist: row.get(5)?,
        duration: row.get(6)?,
        duration_str: row.get(7)?,
        year: row.get(8)?,
        bitrate: row.get(9)?,
        size_bytes: row.get::<_, i64>(10)? as u64,
        cover_art: row.get(11)?,
        stream_url: row.get(12)?,
        lyrics: row.get(13)?,
        replay_gain: row.get(14)?,
        track_number: row.get(15)?,
        disc_number: row.get(16)?,
        genre: row.get(17)?,
        file_format: row.get(18)?,
        date_added: row.get::<_, Option<i64>>(19)?.map(|v| v as u64),
        play_count: row.get::<_, Option<i64>>(20)?.unwrap_or(0) as u32,
        last_played: row.get::<_, Option<i64>>(21)?.map(|v| v as u64),
    })
}

pub fn get_all_tracks(conn: &Connection) -> Result<Vec<TrackMetadata>> {
    let mut stmt = conn.prepare(
        "
        SELECT id, file_path, title, artist, album, album_artist, duration, duration_str,
               year, bitrate, size_bytes, cover_art, stream_url, lyrics, replay_gain,
               track_number, disc_number, genre, file_format, date_added, play_count, last_played
        FROM tracks
        ORDER BY title COLLATE NOCASE ASC
        ",
    )?;

    let rows = stmt.query_map([], row_to_track)?;

    let mut tracks = Vec::new();
    for r in rows {
        tracks.push(r?);
    }
    Ok(tracks)
}

pub fn prune_deleted_tracks(conn: &Connection, active_paths: &[String]) -> Result<usize> {
    if active_paths.is_empty() {
        return Ok(0);
    }
    let all = get_all_tracks(conn)?;
    let active_set: std::collections::HashSet<&str> = active_paths.iter().map(|s| s.as_str()).collect();

    let mut deleted_count = 0;
    let tx = conn.unchecked_transaction()?;
    {
        let mut del_stmt = tx.prepare("DELETE FROM tracks WHERE id = ?1")?;
        for t in all {
            if !active_set.contains(t.file_path.as_str()) && !std::path::Path::new(&t.file_path).exists() {
                del_stmt.execute(params![t.id])?;
                deleted_count += 1;
            }
        }
    }
    tx.commit()?;
    Ok(deleted_count)
}

// ============================================================================
// Top Tracks & Play History
// ============================================================================

pub fn record_playback_session(conn: &Connection, session: &PlaybackSessionInput) -> Result<()> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let event_id = format!("{}_{}", session.track_id, now);
    let is_qualified = session.duration_played >= 30.0 || session.completed;

    let tx = conn.unchecked_transaction()?;

    // 1. Insert play event into history
    tx.execute(
        "
        INSERT INTO play_history (id, track_id, timestamp, duration_played, completed, was_replay)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ",
        params![
            event_id,
            session.track_id,
            now as i64,
            session.duration_played,
            session.completed as i32,
            session.was_replay as i32,
        ],
    )?;

    // 2. Increment play count if qualified listen
    if is_qualified {
        tx.execute(
            "
            UPDATE tracks
            SET play_count = play_count + 1,
                last_played = ?2
            WHERE id = ?1
            ",
            params![session.track_id, now as i64],
        )?;
    } else {
        tx.execute(
            "
            UPDATE tracks
            SET last_played = ?2
            WHERE id = ?1
            ",
            params![session.track_id, now as i64],
        )?;
    }

    tx.commit()?;
    Ok(())
}

pub fn get_top_tracks(conn: &Connection, time_range: &str, limit: u32) -> Result<Vec<TrackMetadata>> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let sql = match time_range {
        "short_term" => {
            "
            SELECT t.id, t.file_path, t.title, t.artist, t.album, t.album_artist, t.duration, t.duration_str,
                   t.year, t.bitrate, t.size_bytes, t.cover_art, t.stream_url, t.lyrics, t.replay_gain,
                   t.track_number, t.disc_number, t.genre, t.file_format, t.date_added,
                   COUNT(h.id) as period_plays, t.last_played
            FROM tracks t
            JOIN play_history h ON t.id = h.track_id
            WHERE h.timestamp >= ?1 AND (h.duration_played >= 30.0 OR h.completed = 1)
            GROUP BY t.id
            ORDER BY period_plays DESC, t.last_played DESC
            LIMIT ?2
            "
        }
        "medium_term" => {
            "
            SELECT t.id, t.file_path, t.title, t.artist, t.album, t.album_artist, t.duration, t.duration_str,
                   t.year, t.bitrate, t.size_bytes, t.cover_art, t.stream_url, t.lyrics, t.replay_gain,
                   t.track_number, t.disc_number, t.genre, t.file_format, t.date_added,
                   COUNT(h.id) as period_plays, t.last_played
            FROM tracks t
            JOIN play_history h ON t.id = h.track_id
            WHERE h.timestamp >= ?1 AND (h.duration_played >= 30.0 OR h.completed = 1)
            GROUP BY t.id
            ORDER BY period_plays DESC, t.last_played DESC
            LIMIT ?2
            "
        }
        _ => {
            "
            SELECT id, file_path, title, artist, album, album_artist, duration, duration_str,
                   year, bitrate, size_bytes, cover_art, stream_url, lyrics, replay_gain,
                   track_number, disc_number, genre, file_format, date_added, play_count, last_played
            FROM tracks
            WHERE play_count > 0
            ORDER BY play_count DESC, last_played DESC
            LIMIT ?2
            "
        }
    };

    let mut stmt = conn.prepare(sql)?;
    let mut tracks = Vec::new();

    let window_start = match time_range {
        "short_term" => now.saturating_sub(30 * 86_400_000) as i64,
        "medium_term" => now.saturating_sub(180 * 86_400_000) as i64,
        _ => 0i64,
    };

    let rows = stmt.query_map(params![window_start, limit], row_to_track)?;

    for r in rows {
        tracks.push(r?);
    }

    // Fallback: If time-range period has fewer than 10 tracks, supplement with all-time top tracks
    if tracks.len() < 10 && time_range != "all_time" {
        let mut fallback_stmt = conn.prepare(
            "
            SELECT id, file_path, title, artist, album, album_artist, duration, duration_str,
                   year, bitrate, size_bytes, cover_art, stream_url, lyrics, replay_gain,
                   track_number, disc_number, genre, file_format, date_added, play_count, last_played
            FROM tracks
            WHERE play_count > 0
            ORDER BY play_count DESC, last_played DESC
            LIMIT ?1
            "
        )?;
        let existing_ids: std::collections::HashSet<String> = tracks.iter().map(|t| t.id.clone()).collect();
        let fallback_rows = fallback_stmt.query_map(params![limit], row_to_track)?;

        for r in fallback_rows {
            if let Ok(t) = r {
                if !existing_ids.contains(&t.id) && tracks.len() < limit as usize {
                    tracks.push(t);
                }
            }
        }
    }

    Ok(tracks)
}

// ============================================================================
// Playlists CRUD & Reordering
// ============================================================================

pub fn get_all_playlists(conn: &Connection) -> Result<Vec<DbPlaylist>> {
    let mut stmt = conn.prepare(
        "
        SELECT p.id, p.name, p.description, p.cover_art, p.cover_color,
               p.is_smart, p.smart_rules, p.created_at, p.updated_at, p.sort_order,
               COUNT(pt.track_id) as track_count,
               COALESCE(SUM(t.duration), 0.0) as total_duration
        FROM playlists p
        LEFT JOIN playlist_tracks pt ON p.id = pt.playlist_id
        LEFT JOIN tracks t ON pt.track_id = t.id
        GROUP BY p.id
        ORDER BY p.updated_at DESC
        ",
    )?;

    let rows = stmt.query_map([], |row| {
        Ok(DbPlaylist {
            id: row.get(0)?,
            name: row.get(1)?,
            description: row.get(2)?,
            cover_art: row.get(3)?,
            cover_color: row.get(4)?,
            is_smart: row.get::<_, i32>(5)? != 0,
            smart_rules: row.get(6)?,
            created_at: row.get::<_, i64>(7)? as u64,
            updated_at: row.get::<_, i64>(8)? as u64,
            sort_order: row.get(9)?,
            track_count: row.get::<_, i64>(10)? as usize,
            total_duration: row.get(11)?,
        })
    })?;

    let mut playlists = Vec::new();
    for r in rows {
        playlists.push(r?);
    }
    Ok(playlists)
}

pub fn create_playlist(
    conn: &Connection,
    id: &str,
    name: &str,
    description: Option<&str>,
    cover_art: Option<&str>,
    cover_color: Option<&str>,
    is_smart: bool,
    smart_rules: Option<&str>,
    track_ids: &[String],
) -> Result<DbPlaylist> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let tx = conn.unchecked_transaction()?;

    tx.execute(
        "
        INSERT INTO playlists (id, name, description, cover_art, cover_color, is_smart, smart_rules, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
        ",
        params![
            id,
            name,
            description,
            cover_art,
            cover_color,
            is_smart as i32,
            smart_rules,
            now as i64,
        ],
    )?;

    if !track_ids.is_empty() {
        let mut stmt = tx.prepare(
            "
            INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position, added_at)
            VALUES (?1, ?2, ?3, ?4)
            ",
        )?;
        for (pos, tid) in track_ids.iter().enumerate() {
            stmt.execute(params![id, tid, pos as i32, now as i64])?;
        }
    }

    tx.commit()?;

    let total_duration: f64 = conn
        .query_row(
            "
            SELECT COALESCE(SUM(t.duration), 0.0)
            FROM playlist_tracks pt
            JOIN tracks t ON pt.track_id = t.id
            WHERE pt.playlist_id = ?1
            ",
            params![id],
            |row| row.get(0),
        )
        .unwrap_or(0.0);

    Ok(DbPlaylist {
        id: id.to_string(),
        name: name.to_string(),
        description: description.map(|s| s.to_string()),
        cover_art: cover_art.map(|s| s.to_string()),
        cover_color: cover_color.map(|s| s.to_string()),
        is_smart,
        smart_rules: smart_rules.map(|s| s.to_string()),
        created_at: now,
        updated_at: now,
        sort_order: Some("custom".to_string()),
        track_count: track_ids.len(),
        total_duration,
    })
}

pub fn get_playlist_tracks(conn: &Connection, playlist_id: &str) -> Result<Vec<TrackMetadata>> {
    // Check if smart playlist
    let smart_info: Option<(bool, Option<String>)> = conn
        .query_row(
            "SELECT is_smart, smart_rules FROM playlists WHERE id = ?1",
            params![playlist_id],
            |row| Ok((row.get::<_, i32>(0)? != 0, row.get(1)?)),
        )
        .ok();

    if let Some((true, Some(rules))) = smart_info {
        return evaluate_smart_playlist(conn, &rules);
    }

    let mut stmt = conn.prepare(
        "
        SELECT t.id, t.file_path, t.title, t.artist, t.album, t.album_artist, t.duration, t.duration_str,
               t.year, t.bitrate, t.size_bytes, t.cover_art, t.stream_url, t.lyrics, t.replay_gain,
               t.track_number, t.disc_number, t.genre, t.file_format, t.date_added, t.play_count, t.last_played
        FROM playlist_tracks pt
        JOIN tracks t ON pt.track_id = t.id
        WHERE pt.playlist_id = ?1
        ORDER BY pt.position ASC
        ",
    )?;

    let rows = stmt.query_map(params![playlist_id], row_to_track)?;

    let mut tracks = Vec::new();
    for r in rows {
        tracks.push(r?);
    }
    Ok(tracks)
}

pub fn add_tracks_to_playlist(conn: &Connection, playlist_id: &str, track_ids: &[String]) -> Result<usize> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let current_max: i32 = conn
        .query_row(
            "SELECT COALESCE(MAX(position), -1) FROM playlist_tracks WHERE playlist_id = ?1",
            params![playlist_id],
            |row| row.get(0),
        )
        .unwrap_or(-1);

    let tx = conn.unchecked_transaction()?;
    let mut added = 0;
    {
        let mut stmt = tx.prepare(
            "
            INSERT OR IGNORE INTO playlist_tracks (playlist_id, track_id, position, added_at)
            VALUES (?1, ?2, ?3, ?4)
            ",
        )?;

        for (offset, tid) in track_ids.iter().enumerate() {
            let pos = current_max + 1 + (offset as i32);
            let rows = stmt.execute(params![playlist_id, tid, pos, now as i64])?;
            added += rows;
        }

        tx.execute(
            "UPDATE playlists SET updated_at = ?2 WHERE id = ?1",
            params![playlist_id, now as i64],
        )?;
    }

    tx.commit()?;
    Ok(added)
}

pub fn remove_track_from_playlist(conn: &Connection, playlist_id: &str, track_id: &str, position: Option<i32>) -> Result<()> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let tx = conn.unchecked_transaction()?;

    if let Some(pos) = position {
        tx.execute(
            "DELETE FROM playlist_tracks WHERE playlist_id = ?1 AND track_id = ?2 AND position = ?3",
            params![playlist_id, track_id, pos],
        )?;
    } else {
        tx.execute(
            "DELETE FROM playlist_tracks WHERE playlist_id = ?1 AND track_id = ?2",
            params![playlist_id, track_id],
        )?;
    }

    // Re-pack remaining positions seamlessly (0, 1, 2, ...)
    let mut stmt = tx.prepare(
        "
        SELECT track_id, position, added_at
        FROM playlist_tracks
        WHERE playlist_id = ?1
        ORDER BY position ASC
        ",
    )?;
    let rows = stmt.query_map(params![playlist_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)?, row.get::<_, i64>(2)? as u64))
    })?;

    let remaining: Vec<(String, i32, u64)> = rows.filter_map(|r| r.ok()).collect();
    drop(stmt);

    tx.execute("DELETE FROM playlist_tracks WHERE playlist_id = ?1", params![playlist_id])?;
    let mut ins = tx.prepare(
        "
        INSERT INTO playlist_tracks (playlist_id, track_id, position, added_at)
        VALUES (?1, ?2, ?3, ?4)
        ",
    )?;
    for (new_pos, (tid, _, added_at)) in remaining.into_iter().enumerate() {
        ins.execute(params![playlist_id, tid, new_pos as i32, added_at as i64])?;
    }
    drop(ins);

    tx.execute("UPDATE playlists SET updated_at = ?2 WHERE id = ?1", params![playlist_id, now as i64])?;
    tx.commit()?;
    Ok(())
}

pub fn reorder_playlist_tracks(conn: &Connection, playlist_id: &str, ordered_track_ids: &[String]) -> Result<()> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let tx = conn.unchecked_transaction()?;

    // Fetch existing added_at timestamps to preserve them
    let mut stmt = tx.prepare(
        "SELECT track_id, added_at FROM playlist_tracks WHERE playlist_id = ?1",
    )?;
    let mut added_at_map = std::collections::HashMap::new();
    let rows = stmt.query_map(params![playlist_id], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)? as u64))
    })?;
    for r in rows {
        if let Ok((tid, at)) = r {
            added_at_map.insert(tid, at);
        }
    }
    drop(stmt);

    tx.execute("DELETE FROM playlist_tracks WHERE playlist_id = ?1", params![playlist_id])?;

    let mut ins = tx.prepare(
        "
        INSERT INTO playlist_tracks (playlist_id, track_id, position, added_at)
        VALUES (?1, ?2, ?3, ?4)
        ",
    )?;

    for (pos, tid) in ordered_track_ids.iter().enumerate() {
        let added_at = added_at_map.get(tid).copied().unwrap_or(now);
        ins.execute(params![playlist_id, tid, pos as i32, added_at as i64])?;
    }
    drop(ins);

    tx.execute("UPDATE playlists SET updated_at = ?2 WHERE id = ?1", params![playlist_id, now as i64])?;
    tx.commit()?;
    Ok(())
}

pub fn update_playlist(
    conn: &Connection,
    id: &str,
    name: Option<&str>,
    description: Option<&str>,
    cover_art: Option<&str>,
    cover_color: Option<&str>,
) -> Result<()> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    conn.execute(
        "
        UPDATE playlists
        SET name = COALESCE(?2, name),
            description = COALESCE(?3, description),
            cover_art = COALESCE(?4, cover_art),
            cover_color = COALESCE(?5, cover_color),
            updated_at = ?6
        WHERE id = ?1
        ",
        params![id, name, description, cover_art, cover_color, now as i64],
    )?;
    Ok(())
}

pub fn delete_playlist(conn: &Connection, id: &str) -> Result<()> {
    conn.execute("DELETE FROM playlists WHERE id = ?1", params![id])?;
    Ok(())
}

// ============================================================================
// Smart Playlist Rules Evaluator
// ============================================================================

fn evaluate_smart_playlist(conn: &Connection, rules_json: &str) -> Result<Vec<TrackMetadata>> {
    #[derive(Deserialize)]
    struct SmartRule {
        rule_type: String, // "most_played", "recently_added", "favorites", "recently_played", "never_played"
        limit: Option<u32>,
    }

    let parsed: SmartRule = serde_json::from_str(rules_json).unwrap_or(SmartRule {
        rule_type: "most_played".to_string(),
        limit: Some(50),
    });

    let lim = parsed.limit.unwrap_or(50);

    let sql = match parsed.rule_type.as_str() {
        "recently_added" => {
            "
            SELECT id, file_path, title, artist, album, album_artist, duration, duration_str,
                   year, bitrate, size_bytes, cover_art, stream_url, lyrics, replay_gain,
                   track_number, disc_number, genre, file_format, date_added, play_count, last_played
            FROM tracks
            ORDER BY date_added DESC
            LIMIT ?1
            "
        }
        "recently_played" => {
            "
            SELECT id, file_path, title, artist, album, album_artist, duration, duration_str,
                   year, bitrate, size_bytes, cover_art, stream_url, lyrics, replay_gain,
                   track_number, disc_number, genre, file_format, date_added, play_count, last_played
            FROM tracks
            WHERE last_played IS NOT NULL
            ORDER BY last_played DESC
            LIMIT ?1
            "
        }
        "never_played" => {
            "
            SELECT id, file_path, title, artist, album, album_artist, duration, duration_str,
                   year, bitrate, size_bytes, cover_art, stream_url, lyrics, replay_gain,
                   track_number, disc_number, genre, file_format, date_added, play_count, last_played
            FROM tracks
            WHERE play_count = 0
            ORDER BY date_added DESC
            LIMIT ?1
            "
        }
        _ => {
            // Default: Most played
            "
            SELECT id, file_path, title, artist, album, album_artist, duration, duration_str,
                   year, bitrate, size_bytes, cover_art, stream_url, lyrics, replay_gain,
                   track_number, disc_number, genre, file_format, date_added, play_count, last_played
            FROM tracks
            WHERE play_count > 0
            ORDER BY play_count DESC, last_played DESC
            LIMIT ?1
            "
        }
    };

    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map(params![lim], row_to_track)?;

    let mut tracks = Vec::new();
    for r in rows {
        tracks.push(r?);
    }
    Ok(tracks)
}
