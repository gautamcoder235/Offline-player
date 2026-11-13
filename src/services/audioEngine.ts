import { EqualizerPreset } from '../types';

export const EQUALIZER_PRESETS: EqualizerPreset[] = [
  { name: 'Flat', gains: [0, 0, 0, 0, 0] },
  { name: 'Bass Boost', gains: [7, 5, -1, 1, 2] },
  { name: 'Vocal', gains: [-3, 1, 6, 4, 1] },
  { name: 'Pop', gains: [-1, 2, 5, 3, -1] },
  { name: 'Rock', gains: [5, 3, -2, 4, 6] },
  { name: 'Electronic', gains: [6, 4, 0, 3, 5] },
  { name: 'Acoustic', gains: [3, 2, 2, 4, 3] },
];

interface Deck {
  id: 'A' | 'B';
  audio: HTMLAudioElement;
  sourceNode: MediaElementAudioSourceNode | null;
  gainNode: GainNode | null;
  ignorePauseUntil: number;
}

export class AudioEngine {
  private deckA: Deck;
  private deckB: Deck;
  private activeDeckId: 'A' | 'B' = 'A';

  private audioCtx: AudioContext | null = null;
  private preGainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private masterGainNode: GainNode | null = null;
  private filters: BiquadFilterNode[] = [];
  private isInitialized = false;

  private savedGains: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  private transitionCounter = 0;
  private crossfadeTimer: ReturnType<typeof setTimeout> | null = null;

  private currentVolume = 0.8;
  private isMuted = false;
  private sinkId: string = '';

  public onTimeUpdate?: (currentTime: number, duration: number) => void;
  public onEnded?: () => void;
  public onPlay?: () => void;
  public onPause?: () => void;
  public onError?: (err: string) => void;
  public onLoadedMetadata?: (duration: number) => void;

  public crossfadeDuration: number = 0;

  constructor() {
    this.deckA = this.createDeck('A');
    this.deckB = this.createDeck('B');
  }

  private createDeck(id: 'A' | 'B'): Deck {
    const audio = new Audio();
    audio.crossOrigin = 'anonymous';
    audio.preload = 'auto';
    // Permanent lock on HTMLAudioElement volume to 1.0 (Fix 1.2)
    audio.volume = 1.0;

    audio.addEventListener('timeupdate', () => {
      if (this.activeDeckId === id && this.onTimeUpdate) {
        this.onTimeUpdate(audio.currentTime, audio.duration || 0);
      }
    });

    audio.addEventListener('ended', () => {
      if (this.activeDeckId === id && this.onEnded) {
        this.onEnded();
      }
    });

    audio.addEventListener('play', () => {
      const deck = id === 'A' ? this.deckA : this.deckB;
      deck.ignorePauseUntil = 0;
      if (this.activeDeckId === id && this.onPlay) {
        this.onPlay();
      }
    });

    audio.addEventListener('pause', () => {
      const deck = id === 'A' ? this.deckA : this.deckB;
      if (audio.ended) {
        return;
      }
      if (deck.ignorePauseUntil > 0) {
        const suppressed = performance.now() <= deck.ignorePauseUntil;
        deck.ignorePauseUntil = 0;
        if (suppressed) {
          return;
        }
      }
      if (this.activeDeckId === id && this.onPause) {
        this.onPause();
      }
    });

    audio.addEventListener('loadedmetadata', () => {
      if (this.activeDeckId === id && this.onLoadedMetadata) {
        this.onLoadedMetadata(audio.duration || 0);
      }
    });

    audio.addEventListener('error', (e) => {
      if (this.activeDeckId === id) {
        console.error(`Deck ${id} audio playback error`, e);
        if (this.onError) {
          this.onError('Failed to play audio track');
        }
      }
    });

    return {
      id,
      audio,
      sourceNode: null,
      gainNode: null,
      ignorePauseUntil: 0,
    };
  }

  private isSameUrl(a: string, b: string): boolean {
    if (!a || !b) return false;
    if (a === b) return true;
    try {
      return new URL(a, window.location.href).href === new URL(b, window.location.href).href;
    } catch {
      return false;
    }
  }

  private pauseDeckInternally(deck: Deck): void {
    if (!deck.audio.paused && !deck.audio.ended) {
      deck.ignorePauseUntil = performance.now() + 300;
    }
    deck.audio.pause();
  }

  private get activeDeck(): Deck {
    return this.activeDeckId === 'A' ? this.deckA : this.deckB;
  }

  private get idleDeck(): Deck {
    return this.activeDeckId === 'A' ? this.deckB : this.deckA;
  }

  private initAudioContext() {
    if (this.isInitialized) return;

    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioContextClass();

      // Setup Deck A
      this.deckA.sourceNode = this.audioCtx.createMediaElementSource(this.deckA.audio);
      this.deckA.gainNode = this.audioCtx.createGain();
      this.deckA.gainNode.gain.setValueAtTime(1.0, this.audioCtx.currentTime);
      this.deckA.sourceNode.connect(this.deckA.gainNode);

      // Setup Deck B
      this.deckB.sourceNode = this.audioCtx.createMediaElementSource(this.deckB.audio);
      this.deckB.gainNode = this.audioCtx.createGain();
      this.deckB.gainNode.gain.setValueAtTime(0.0, this.audioCtx.currentTime);
      this.deckB.sourceNode.connect(this.deckB.gainNode);

      // Pre-gain for ReplayGain / Volume normalization
      this.preGainNode = this.audioCtx.createGain();
      this.preGainNode.gain.setValueAtTime(1.0, this.audioCtx.currentTime);

      this.deckA.gainNode.connect(this.preGainNode);
      this.deckB.gainNode.connect(this.preGainNode);

      // Create 5-band equalizer filters: 60Hz, 250Hz, 1kHz, 4kHz, 14kHz
      const freqs = [60, 250, 1000, 4000, 14000];
      const types: BiquadFilterType[] = ['lowshelf', 'peaking', 'peaking', 'peaking', 'highshelf'];

      this.filters = freqs.map((freq, i) => {
        const filter = this.audioCtx!.createBiquadFilter();
        filter.type = types[i];
        filter.frequency.value = freq;
        filter.gain.value = this.savedGains[i] ?? 0;
        return filter;
      });

      // Chain: preGainNode -> Filter0 -> Filter1 -> ... -> Filter4
      let prevNode: AudioNode = this.preGainNode;
      for (const filter of this.filters) {
        prevNode.connect(filter);
        prevNode = filter;
      }

      // Analyser Node (Receives full-amplitude signal before MasterGain)
      this.analyserNode = this.audioCtx.createAnalyser();
      this.analyserNode.fftSize = 512;
      this.analyserNode.smoothingTimeConstant = 0.78;
      prevNode.connect(this.analyserNode);

      // Master Gain Node (Pure volume attenuation)
      this.masterGainNode = this.audioCtx.createGain();
      const initialMasterGain = this.isMuted ? 0.0001 : this.currentVolume;
      this.masterGainNode.gain.setValueAtTime(initialMasterGain, this.audioCtx.currentTime);

      this.analyserNode.connect(this.masterGainNode);
      this.masterGainNode.connect(this.audioCtx.destination);

      if (this.sinkId) {
        this.setSinkId(this.sinkId).catch(() => {});
      }

      this.isInitialized = true;
    } catch (e) {
      console.warn('AudioContext initialization failed or deferred:', e);
    }
  }

  public setCrossfadeDuration(sec: number): void {
    this.crossfadeDuration = Math.max(0, Math.min(12, sec));
  }

  public async setSinkId(deviceId: string): Promise<void> {
    this.sinkId = deviceId;
    const promises: Promise<void>[] = [];
    if ('setSinkId' in this.deckA.audio) {
      promises.push((this.deckA.audio as any).setSinkId(deviceId));
    }
    if ('setSinkId' in this.deckB.audio) {
      promises.push((this.deckB.audio as any).setSinkId(deviceId));
    }
    if (this.audioCtx && 'setSinkId' in this.audioCtx) {
      promises.push((this.audioCtx as any).setSinkId(deviceId));
    }
    await Promise.allSettled(promises);
  }

  public setPreGain(gainDb: number): void {
    if (!this.preGainNode || !this.audioCtx) return;
    try {
      const linear = Math.pow(10, gainDb / 20);
      const clamped = Math.max(0.1, Math.min(2.5, linear));
      const now = this.audioCtx.currentTime;
      this.preGainNode.gain.cancelScheduledValues(now);
      this.preGainNode.gain.linearRampToValueAtTime(clamped, now + 0.1);
    } catch {
      // ignore
    }
  }

  public resetPreGain(): void {
    if (!this.preGainNode || !this.audioCtx) return;
    try {
      const now = this.audioCtx.currentTime;
      this.preGainNode.gain.cancelScheduledValues(now);
      this.preGainNode.gain.setValueAtTime(1.0, now);
    } catch {
      // ignore
    }
  }

  /**
   * Pre-load next track into the idle deck for zero-latency gapless transition or overlapping crossfade
   */
  public preloadNext(streamUrl: string): void {
    if (!streamUrl) return;
    const idle = this.idleDeck;
    if (!this.isSameUrl(idle.audio.src, streamUrl) || idle.audio.error) {
      this.pauseDeckInternally(idle);
      idle.audio.src = streamUrl;
      idle.audio.load();
    }
  }

  /**
   * Transition between current active deck and idle deck with overlapping crossfade or gapless switch
   */
  public async transitionTo(streamUrl: string, crossfadeSec: number = 0): Promise<boolean> {
    if (!streamUrl) return false;
    const currentTransition = ++this.transitionCounter;
    if (this.crossfadeTimer) {
      clearTimeout(this.crossfadeTimer);
      this.crossfadeTimer = null;
    }

    this.initAudioContext();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
    if (this.transitionCounter !== currentTransition) {
      return false;
    }

    const currentDeck = this.activeDeck;
    const nextDeck = this.idleDeck;

    // Ensure next deck has the correct source without discarding pre-buffered media unnecessarily
    if (!this.isSameUrl(nextDeck.audio.src, streamUrl) || nextDeck.audio.error) {
      this.pauseDeckInternally(nextDeck);
      nextDeck.audio.src = streamUrl;
      nextDeck.audio.load();
    } else if (nextDeck.audio.readyState >= 1 && (nextDeck.audio.ended || nextDeck.audio.currentTime > 0.05)) {
      try {
        nextDeck.audio.currentTime = 0;
      } catch {
        // ignore if not seekable yet
      }
    }

    const dur = Math.max(0, crossfadeSec);
    const now = this.audioCtx ? this.audioCtx.currentTime : 0;

    if (this.masterGainNode && this.audioCtx && !this.isMuted) {
      this.masterGainNode.gain.cancelScheduledValues(now);
      this.masterGainNode.gain.setValueAtTime(this.currentVolume, now);
    }

    if (dur <= 0.05 || !this.audioCtx || !currentDeck.gainNode || !nextDeck.gainNode) {
      // Gapless switch
      if (nextDeck.gainNode && this.audioCtx) {
        nextDeck.gainNode.gain.cancelScheduledValues(now);
        nextDeck.gainNode.gain.setValueAtTime(1.0, now);
      }
      if (currentDeck.gainNode && this.audioCtx) {
        currentDeck.gainNode.gain.cancelScheduledValues(now);
        currentDeck.gainNode.gain.setValueAtTime(0.0, now);
      }
      this.activeDeckId = nextDeck.id;
      this.pauseDeckInternally(currentDeck);
      try {
        await nextDeck.audio.play();
        return this.transitionCounter === currentTransition && !nextDeck.audio.paused;
      } catch (err) {
        console.warn('Gapless playback play() was rejected:', err);
        return false;
      }
    }

    // Overlapping crossfade
    nextDeck.gainNode.gain.cancelScheduledValues(now);
    nextDeck.gainNode.gain.setValueAtTime(0.0001, now);
    nextDeck.gainNode.gain.linearRampToValueAtTime(1.0, now + dur);

    const currentGainVal = currentDeck.gainNode.gain.value;
    currentDeck.gainNode.gain.cancelScheduledValues(now);
    currentDeck.gainNode.gain.setValueAtTime(Math.max(0.0001, currentGainVal), now);
    currentDeck.gainNode.gain.linearRampToValueAtTime(0.0001, now + dur);

    this.activeDeckId = nextDeck.id;

    try {
      await nextDeck.audio.play();
    } catch (err) {
      console.warn('Crossfade next deck play() was rejected:', err);
      this.pauseDeckInternally(currentDeck);
      return false;
    }

    if (this.transitionCounter !== currentTransition) {
      return false;
    }

    // Pause old deck only after crossfade completes if no newer transition started
    this.crossfadeTimer = setTimeout(() => {
      if (this.transitionCounter !== currentTransition) return;
      this.pauseDeckInternally(currentDeck);
      if (currentDeck.gainNode && this.audioCtx) {
        currentDeck.gainNode.gain.setValueAtTime(0.0, this.audioCtx.currentTime);
      }
      this.crossfadeTimer = null;
    }, dur * 1000);

    return !nextDeck.audio.paused;
  }

  /**
   * Seamlessly upgrade the active deck from a preview stream to a full-length high-bitrate stream
   * without interrupting playback, causing pops, or restarting playback position.
   */
  public async upgradeActiveStream(newStreamUrl: string): Promise<boolean> {
    if (!newStreamUrl) return false;
    const currentDeck = this.activeDeck;
    if (currentDeck.audio.src === newStreamUrl) return true;

    this.initAudioContext();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    const currentTransition = this.transitionCounter;
    const wasPlaying = !currentDeck.audio.paused;
    const targetDeck = this.idleDeck;

    return new Promise<boolean>((resolve) => {
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;
      let seekTimeoutId: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        targetDeck.audio.removeEventListener('canplay', onCanPlay);
        targetDeck.audio.removeEventListener('error', onError);
        targetDeck.audio.removeEventListener('seeked', onSeeked);
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (seekTimeoutId) {
          clearTimeout(seekTimeoutId);
          seekTimeoutId = null;
        }
      };

      const finishUpgrade = async () => {
        if (settled) return;
        if (this.transitionCounter !== currentTransition) {
          settled = true;
          cleanup();
          resolve(false);
          return;
        }

        settled = true;
        cleanup();

        if (wasPlaying && !currentDeck.audio.paused) {
          const now = this.audioCtx ? this.audioCtx.currentTime : 0;
          const crossSec = 0.15; // 150ms smooth micro-crossfade

          // Sync timestamp once more to ensure accurate transient alignment
          const finalLivePos = currentDeck.audio.currentTime || 0;
          if (Math.abs(targetDeck.audio.currentTime - finalLivePos) > 0.15) {
            try {
              targetDeck.audio.currentTime = finalLivePos;
            } catch {}
          }

          if (this.audioCtx && targetDeck.gainNode && currentDeck.gainNode) {
            const currentGainVal = currentDeck.gainNode.gain.value;
            targetDeck.gainNode.gain.cancelScheduledValues(now);
            targetDeck.gainNode.gain.setValueAtTime(0.0001, now);
            targetDeck.gainNode.gain.linearRampToValueAtTime(1.0, now + crossSec);

            currentDeck.gainNode.gain.cancelScheduledValues(now);
            currentDeck.gainNode.gain.setValueAtTime(Math.max(0.0001, currentGainVal), now);
            currentDeck.gainNode.gain.linearRampToValueAtTime(0.0001, now + crossSec);
          }

          this.activeDeckId = targetDeck.id;
          try {
            await targetDeck.audio.play();
          } catch (err) {
            console.warn('Failed to play upgraded deck:', err);
          }

          setTimeout(() => {
            if (this.transitionCounter !== currentTransition) return;
            this.pauseDeckInternally(currentDeck);
            if (currentDeck.gainNode && this.audioCtx) {
              currentDeck.gainNode.gain.setValueAtTime(0.0, this.audioCtx.currentTime);
            }
          }, crossSec * 1000 + 50);
        } else {
          this.activeDeckId = targetDeck.id;
        }

        resolve(true);
      };

      const onSeeked = () => {
        targetDeck.audio.removeEventListener('seeked', onSeeked);
        if (seekTimeoutId) {
          clearTimeout(seekTimeoutId);
          seekTimeoutId = null;
        }
        finishUpgrade();
      };

      const onCanPlay = async () => {
        if (settled) return;
        if (this.transitionCounter !== currentTransition) {
          settled = true;
          cleanup();
          resolve(false);
          return;
        }

        // Live timestamp synchronization with seek readiness
        const livePos = currentDeck.audio.currentTime || 0;
        if (livePos > 0.05 && livePos < (targetDeck.audio.duration || Infinity)) {
          try {
            targetDeck.audio.currentTime = livePos;
          } catch (e) {
            console.warn('Could not sync upgraded stream position:', e);
          }

          if (targetDeck.audio.seeking) {
            targetDeck.audio.addEventListener('seeked', onSeeked, { once: true });
            seekTimeoutId = setTimeout(() => {
              onSeeked();
            }, 600);
            return;
          }
        }

        finishUpgrade();
      };

      const onError = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(false);
      };

      this.pauseDeckInternally(targetDeck);
      targetDeck.audio.addEventListener('canplay', onCanPlay, { once: true });
      targetDeck.audio.addEventListener('error', onError, { once: true });
      targetDeck.audio.src = newStreamUrl;
      targetDeck.audio.load();

      timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve(false);
        }
      }, 9000);
    });
  }

  public async loadTrack(streamUrl: string): Promise<boolean> {
    if (!streamUrl) return false;
    const currentTransition = ++this.transitionCounter;
    if (this.crossfadeTimer) {
      clearTimeout(this.crossfadeTimer);
      this.crossfadeTimer = null;
    }

    this.initAudioContext();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
    if (this.transitionCounter !== currentTransition) {
      return false;
    }

    const idle = this.idleDeck;
    const active = this.activeDeck;

    // Reuse already pre-buffered idle deck for zero-stall next-track transitions even when crossfade = 0
    if (this.isSameUrl(idle.audio.src, streamUrl) && idle.audio.readyState >= 2 && !idle.audio.error) {
      this.pauseDeckInternally(active);
      if (active.gainNode && this.audioCtx) {
        active.gainNode.gain.cancelScheduledValues(this.audioCtx.currentTime);
        active.gainNode.gain.setValueAtTime(0.0, this.audioCtx.currentTime);
      }
      if (idle.audio.ended || idle.audio.currentTime > 0.05) {
        try {
          idle.audio.currentTime = 0;
        } catch {
          // ignore if not seekable
        }
      }
      if (idle.gainNode && this.audioCtx) {
        idle.gainNode.gain.cancelScheduledValues(this.audioCtx.currentTime);
        idle.gainNode.gain.setValueAtTime(1.0, this.audioCtx.currentTime);
      }
      this.activeDeckId = idle.id;
      return true;
    }

    this.pauseDeckInternally(idle);
    if (idle.gainNode && this.audioCtx) {
      idle.gainNode.gain.setValueAtTime(0.0, this.audioCtx.currentTime);
    }

    this.pauseDeckInternally(active);
    if (active.gainNode && this.audioCtx) {
      active.gainNode.gain.setValueAtTime(1.0, this.audioCtx.currentTime);
    }
    active.audio.src = streamUrl;
    active.audio.load();
    return true;
  }

  public async play(): Promise<boolean> {
    const opCounter = this.transitionCounter;
    this.initAudioContext();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
    if (this.transitionCounter !== opCounter) {
      return false;
    }
    const audio = this.activeDeck.audio;
    if (audio.ended || (audio.duration > 0 && isFinite(audio.duration) && audio.currentTime >= audio.duration - 0.05)) {
      try {
        audio.currentTime = 0;
      } catch {
        // ignore if not seekable yet
      }
    }
    try {
      await audio.play();
      return this.transitionCounter === opCounter && !audio.paused;
    } catch (err) {
      console.warn('Playback play() was rejected:', err);
      return false;
    }
  }

  public async playWithFadeIn(targetVolume?: number, durationSec: number = 0.8): Promise<boolean> {
    const opCounter = this.transitionCounter;
    this.initAudioContext();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
    if (this.transitionCounter !== opCounter) {
      return false;
    }
    const finalVol = targetVolume !== undefined ? targetVolume : this.currentVolume;
    if (this.masterGainNode && this.audioCtx && !this.isMuted) {
      const now = this.audioCtx.currentTime;
      this.masterGainNode.gain.cancelScheduledValues(now);
      this.masterGainNode.gain.setValueAtTime(0.0001, now);
      this.masterGainNode.gain.linearRampToValueAtTime(Math.max(0.0001, finalVol), now + Math.max(0.1, durationSec));
    }
    try {
      await this.activeDeck.audio.play();
      return this.transitionCounter === opCounter && !this.activeDeck.audio.paused;
    } catch (err) {
      console.warn('Playback playWithFadeIn was rejected:', err);
      return false;
    }
  }

  public async pauseWithFadeOut(durationSec: number = 0.18): Promise<void> {
    if (this.masterGainNode && this.audioCtx && !this.isMuted) {
      const dur = Math.max(0.05, durationSec);
      const now = this.audioCtx.currentTime;
      this.masterGainNode.gain.cancelScheduledValues(now);
      this.masterGainNode.gain.setValueAtTime(this.masterGainNode.gain.value, now);
      this.masterGainNode.gain.linearRampToValueAtTime(0.0001, now + dur);
      await new Promise((resolve) => setTimeout(resolve, dur * 1000));
    }
    this.pause();
    if (this.masterGainNode && this.audioCtx && !this.isMuted) {
      const now = this.audioCtx.currentTime;
      this.masterGainNode.gain.cancelScheduledValues(now);
      this.masterGainNode.gain.setValueAtTime(this.currentVolume, now);
    }
  }

  public pause(): void {
    this.transitionCounter++;
    if (this.crossfadeTimer) {
      clearTimeout(this.crossfadeTimer);
      this.crossfadeTimer = null;
    }
    this.deckA.ignorePauseUntil = 0;
    this.deckB.ignorePauseUntil = 0;
    this.deckA.audio.pause();
    this.deckB.audio.pause();
  }

  public getCurrentSrc(): string {
    return this.activeDeck.audio.src || '';
  }

  public isPaused(): boolean {
    return this.activeDeck.audio.paused;
  }

  public getActiveDeckDuration(): number {
    return this.activeDeck.audio.duration || 0;
  }

  public seek(timeInSeconds: number): void {
    if (!isNaN(timeInSeconds) && isFinite(timeInSeconds)) {
      const activeAudio = this.activeDeck.audio;
      const dur = activeAudio.duration;
      if (dur && isFinite(dur) && dur > 0) {
        // Clamp to avoid premature ended event if dragging seek bar on a preview stream
        const clamped = Math.max(0, Math.min(timeInSeconds, Math.max(0, dur - 0.25)));
        activeAudio.currentTime = clamped;
      } else {
        activeAudio.currentTime = Math.max(0, timeInSeconds);
      }
    }
  }

  public async fadeOut(durationSec: number = 0.8): Promise<void> {
    if (!this.masterGainNode || !this.audioCtx) return;
    try {
      const dur = Math.max(0.1, durationSec);
      const now = this.audioCtx.currentTime;
      this.masterGainNode.gain.cancelScheduledValues(now);
      this.masterGainNode.gain.setValueAtTime(this.masterGainNode.gain.value, now);
      this.masterGainNode.gain.linearRampToValueAtTime(0.0001, now + dur);
      await new Promise((resolve) => setTimeout(resolve, dur * 1000));
    } catch (e) {
      console.warn('fadeOut error:', e);
    }
  }

  public async fadeIn(targetVolume: number = 1.0, durationSec: number = 0.8): Promise<void> {
    if (!this.masterGainNode || !this.audioCtx) return;
    try {
      const dur = Math.max(0.1, durationSec);
      const now = this.audioCtx.currentTime;
      const clampedVol = Math.max(0.01, Math.min(1, targetVolume));
      this.masterGainNode.gain.cancelScheduledValues(now);
      this.masterGainNode.gain.setValueAtTime(0.0001, now);
      this.masterGainNode.gain.linearRampToValueAtTime(clampedVol, now + dur);
    } catch (e) {
      console.warn('fadeIn error:', e);
    }
  }

  public setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this.currentVolume = clamped;
    // Keep audio.volume locked at 1.0; adjust strictly on masterGainNode (Fix 1.2)
    this.deckA.audio.volume = 1.0;
    this.deckB.audio.volume = 1.0;

    if (this.masterGainNode && this.audioCtx) {
      try {
        const now = this.audioCtx.currentTime;
        this.masterGainNode.gain.cancelScheduledValues(now);
        this.masterGainNode.gain.setValueAtTime(this.isMuted ? 0.0001 : clamped, now);
      } catch {
        // Gain scheduling catch
      }
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.masterGainNode && this.audioCtx) {
      try {
        const now = this.audioCtx.currentTime;
        this.masterGainNode.gain.cancelScheduledValues(now);
        this.masterGainNode.gain.setValueAtTime(muted ? 0.0001 : this.currentVolume, now);
      } catch {
        // Gain scheduling catch
      }
    }
  }

  public setPreset(presetName: string): void {
    const preset = EQUALIZER_PRESETS.find((p) => p.name.toLowerCase() === presetName.toLowerCase());
    if (preset) {
      this.setGains(preset.gains);
    }
  }

  public setGains(gains: [number, number, number, number, number]): void {
    this.savedGains = [...gains];
    if (!this.filters || this.filters.length !== 5) return;
    for (let i = 0; i < 5; i++) {
      if (this.filters[i]) {
        this.filters[i].gain.value = gains[i];
      }
    }
  }

  public setBandGain(bandIndex: number, gain: number): void {
    if (bandIndex >= 0 && bandIndex < 5) {
      this.savedGains[bandIndex] = gain;
    }
    if (this.filters[bandIndex]) {
      this.filters[bandIndex].gain.value = gain;
    }
  }

  public getFrequencyData(array: Uint8Array): void {
    if (this.analyserNode) {
      this.analyserNode.getByteFrequencyData(array as unknown as Uint8Array<ArrayBuffer>);
    } else {
      array.fill(0);
    }
  }

  public getTimeDomainData(array: Uint8Array): void {
    if (this.analyserNode) {
      this.analyserNode.getByteTimeDomainData(array as unknown as Uint8Array<ArrayBuffer>);
    } else {
      array.fill(128);
    }
  }

  public get duration(): number {
    return this.activeDeck.audio.duration || 0;
  }

  public get currentTime(): number {
    return this.activeDeck.audio.currentTime || 0;
  }
}

export const audioEngine = new AudioEngine();
