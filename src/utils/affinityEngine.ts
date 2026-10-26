import { Track } from '../types';

export interface PlayEvent {
  id: string;
  trackId: string;
  timestamp: number; // Unix epoch ms
  durationPlayed: number; // Seconds spent actually listening
  trackDuration: number;
  completed: boolean; // Played >= 80% or reached natural end
  wasReplay: boolean; // Looped/replayed within 15 minutes of previous play
}

export interface TrackListeningStats {
  trackId: string;
  playCount: number; // Qualified plays (>= 30s)
  completeCount: number; // Full completions (>= 80%)
  skipCount: number; // Skipped before 30s
  totalListenDuration: number; // Total seconds listened
  lastPlayedAt: number; // Timestamp
  firstPlayedAt: number;
  replayCount: number;
  scoreShortTerm: number; // 30-day "On Repeat" affinity
  scoreMediumTerm: number; // 180-day affinity
  scoreAllTime: number; // Lifetime affinity
  isOnRepeat: boolean; // Frequently played & completed in last 14 days
}

export type TopTracksTimeRange = 'short_term' | 'medium_term' | 'all_time';

const MAX_STORED_EVENTS = 2500;
const ONE_HOUR = 3600 * 1000;
const ONE_DAY = 24 * ONE_HOUR;

/**
 * Calculates exponential decay factor: e^(-lambda * dt)
 */
function calculateRecencyWeight(eventTime: number, now: number, halfLifeDays: number): number {
  const dtDays = Math.max(0, (now - eventTime) / ONE_DAY);
  const lambda = Math.LN2 / halfLifeDays;
  return Math.exp(-lambda * dtDays);
}

/**
 * Computes base score for a single play event based on listening depth.
 * - < 15s: 0 (accidental click/skip)
 * - 15s - 30s: 0.25 (quick sample)
 * - 30s - 80%: 0.65 (partial listen)
 * - >= 80% or completed: 1.0 (qualified listen)
 * - Replay bonus: +0.75 multiplier (user looping the song)
 */
function scoreSingleEvent(event: PlayEvent): number {
  if (event.durationPlayed < 15) {
    return 0;
  }

  let base = 0.5;
  if (event.completed) {
    base = 1.0;
  } else if (event.trackDuration > 0) {
    const ratio = event.durationPlayed / event.trackDuration;
    if (ratio >= 0.8) {
      base = 1.0;
    } else if (ratio >= 0.5) {
      base = 0.8;
    } else if (event.durationPlayed >= 30) {
      base = 0.6;
    } else {
      base = 0.25;
    }
  } else if (event.durationPlayed >= 30) {
    base = 0.6;
  }

  if (event.wasReplay) {
    base *= 1.75; // Loop/repeat bonus
  }

  return base;
}

/**
 * Evaluates all events for a track and calculates its affinity scores across time ranges,
 * incorporating completion rates, dwell time, and user explicit signals (likes, playlists).
 */
export function calculateTrackStats(
  track: Track,
  events: PlayEvent[],
  isLiked: boolean,
  playlistCount: number,
  now: number = Date.now()
): TrackListeningStats {
  let playCount = 0;
  let completeCount = 0;
  let skipCount = 0;
  let totalListenDuration = 0;
  let firstPlayedAt = 0;
  let lastPlayedAt = 0;
  let replayCount = 0;

  let rawShortScore = 0;
  let rawMediumScore = 0;
  let rawAllTimeScore = 0;

  let recent14DaysCompletions = 0;
  let recent14DaysPlays = 0;

  for (const ev of events) {
    if (ev.durationPlayed < 15) {
      skipCount++;
      continue;
    }

    if (ev.durationPlayed >= 30) {
      playCount++;
    }

    if (ev.completed || (ev.trackDuration > 0 && ev.durationPlayed / ev.trackDuration >= 0.8)) {
      completeCount++;
    }

    if (ev.wasReplay) {
      replayCount++;
    }

    totalListenDuration += ev.durationPlayed;

    if (!firstPlayedAt || ev.timestamp < firstPlayedAt) {
      firstPlayedAt = ev.timestamp;
    }
    if (!lastPlayedAt || ev.timestamp > lastPlayedAt) {
      lastPlayedAt = ev.timestamp;
    }

    const ageMs = now - ev.timestamp;
    const eventScore = scoreSingleEvent(ev);

    // Short term (30 days window, 10-day half life)
    if (ageMs <= 30 * ONE_DAY) {
      const recency = calculateRecencyWeight(ev.timestamp, now, 10);
      rawShortScore += eventScore * recency;

      if (ageMs <= 14 * ONE_DAY) {
        recent14DaysPlays++;
        if (ev.completed) {
          recent14DaysCompletions++;
        }
      }
    }

    // Medium term (180 days window, 45-day half life)
    if (ageMs <= 180 * ONE_DAY) {
      const recency = calculateRecencyWeight(ev.timestamp, now, 45);
      rawMediumScore += eventScore * recency;
    }

    // All time (cumulative with 180-day half life)
    const allTimeRecency = calculateRecencyWeight(ev.timestamp, now, 180);
    rawAllTimeScore += eventScore * allTimeRecency;
  }

  // Dwell time bonus (longer songs reward actual hours spent)
  const dwellBonus = Math.min(5, (totalListenDuration / 3600) * 1.5);

  // Completion loyalty ratio bonus
  const totalAttempts = playCount + skipCount;
  const completionRatio = totalAttempts > 0 ? completeCount / totalAttempts : 0;
  const loyaltyBonus = completionRatio >= 0.8 ? 2.0 : completionRatio >= 0.5 ? 1.0 : -1.0;

  // Explicit signals: Liked (+3.5), In Custom Playlists (+1.2 per playlist, max +4.8)
  const explicitBonus = (isLiked ? 3.5 : 0) + Math.min(4.8, playlistCount * 1.2);

  // Short term score: Heavily recency-weighted, with modest explicit boost
  const scoreShortTerm = rawShortScore > 0 ? rawShortScore * 4.0 + (isLiked ? 1.5 : 0) + (recent14DaysPlays >= 3 ? 3.0 : 0) : 0;

  // Medium term score
  const scoreMediumTerm = rawMediumScore > 0 ? rawMediumScore * 2.5 + explicitBonus * 0.8 + dwellBonus : 0;

  // All time score
  const scoreAllTime =
    rawAllTimeScore > 0 || (track.playCount && track.playCount > 0)
      ? rawAllTimeScore * 2.0 + (track.playCount || 0) * 0.8 + explicitBonus + dwellBonus + loyaltyBonus
      : 0;

  // Spotify "On Repeat" Criteria:
  // Played >= 3 times in last 14 days, with >= 2 completions
  const isOnRepeat = recent14DaysPlays >= 3 && recent14DaysCompletions >= 2;

  return {
    trackId: track.id,
    playCount,
    completeCount,
    skipCount,
    totalListenDuration,
    lastPlayedAt,
    firstPlayedAt,
    replayCount,
    scoreShortTerm: Math.round(scoreShortTerm * 10) / 10,
    scoreMediumTerm: Math.round(scoreMediumTerm * 10) / 10,
    scoreAllTime: Math.round(scoreAllTime * 10) / 10,
    isOnRepeat,
  };
}

/**
 * Compiles and ranks tracks by affinity score according to the chosen time range.
 */
export function rankTopTracks(
  tracks: Track[],
  events: PlayEvent[],
  likedTrackIds: Set<string>,
  playlists: Array<{ track_ids: string[] }>,
  timeRange: TopTracksTimeRange = 'all_time',
  legacyPlayCounts: Record<string, number> = {}
): Array<Track & { stats: TrackListeningStats }> {
  const eventsByTrack = new Map<string, PlayEvent[]>();
  for (const ev of events) {
    if (!eventsByTrack.has(ev.trackId)) {
      eventsByTrack.set(ev.trackId, []);
    }
    eventsByTrack.get(ev.trackId)!.push(ev);
  }

  // Count playlist inclusions per track
  const playlistCounts = new Map<string, number>();
  for (const pl of playlists) {
    for (const tid of pl.track_ids) {
      playlistCounts.set(tid, (playlistCounts.get(tid) || 0) + 1);
    }
  }

  const now = Date.now();
  const ranked: Array<Track & { stats: TrackListeningStats }> = [];

  for (const track of tracks) {
    const trackEvents = eventsByTrack.get(track.id) || [];
    const isLiked = likedTrackIds.has(track.id);
    const plCount = playlistCounts.get(track.id) || 0;

    // Legacy fallback seed if track has legacy play counts but no new events
    const legacyCount = legacyPlayCounts[track.id] || legacyPlayCounts[`${track.artist} - ${track.title}`] || track.playCount || 0;
    const trackWithLegacy = { ...track, playCount: Math.max(track.playCount || 0, legacyCount) };

    const stats = calculateTrackStats(trackWithLegacy, trackEvents, isLiked, plCount, now);

    // Pick score for the active time range
    let activeScore = 0;
    if (timeRange === 'short_term') {
      activeScore = stats.scoreShortTerm;
    } else if (timeRange === 'medium_term') {
      activeScore = stats.scoreMediumTerm;
    } else {
      activeScore = stats.scoreAllTime;
    }

    // Only include tracks that have actually been played / scored
    if (activeScore > 0 || stats.playCount > 0 || (timeRange === 'all_time' && legacyCount > 0)) {
      ranked.push({
        ...trackWithLegacy,
        stats,
      });
    }
  }

  // Sort descending by score
  ranked.sort((a, b) => {
    let scoreA = 0;
    let scoreB = 0;
    if (timeRange === 'short_term') {
      scoreA = a.stats.scoreShortTerm;
      scoreB = b.stats.scoreShortTerm;
    } else if (timeRange === 'medium_term') {
      scoreA = a.stats.scoreMediumTerm;
      scoreB = b.stats.scoreMediumTerm;
    } else {
      scoreA = a.stats.scoreAllTime;
      scoreB = b.stats.scoreAllTime;
    }

    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }
    // Tie-breaker: completed listens, then total duration
    if (b.stats.completeCount !== a.stats.completeCount) {
      return b.stats.completeCount - a.stats.completeCount;
    }
    return b.stats.totalListenDuration - a.stats.totalListenDuration;
  });

  return ranked;
}

/**
 * Trims events array to prevent unbounded storage growth while preserving
 * meaningful recent events.
 */
export function pruneEvents(events: PlayEvent[]): PlayEvent[] {
  if (events.length <= MAX_STORED_EVENTS) {
    return events;
  }
  // Keep the most recent events
  return [...events].sort((a, b) => a.timestamp - b.timestamp).slice(-MAX_STORED_EVENTS);
}

/**
 * Formats a duration in seconds into human-readable minutes or hours:
 * e.g. 85 -> "1m 25s", 4200 -> "1 hr 10 mins"
 */
export function formatListeningTime(seconds: number): string {
  if (!seconds || seconds <= 0) return '0 mins';
  const mins = Math.floor(seconds / 60);
  if (mins < 60) {
    return `${mins} min${mins === 1 ? '' : 's'}`;
  }
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return `${hours} hr${hours === 1 ? '' : 's'} ${remainingMins} min${remainingMins === 1 ? '' : 's'}`;
}
