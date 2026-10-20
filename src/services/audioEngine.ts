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
      if (this.activeDeckId === id && this.onPlay) {
        this.onPlay();
      }
    });

    audio.addEventListener('pause', () => {
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
    };
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
    const idle = this.idleDeck;
    if (idle.audio.src !== streamUrl) {
      idle.audio.src = streamUrl;
      idle.audio.load();
    }
  }

  /**
   * Transition between current active deck and idle deck with overlapping crossfade or gapless switch
   */
  public async transitionTo(streamUrl: string, crossfadeSec: number = 0): Promise<void> {
    this.initAudioContext();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    const currentTransition = ++this.transitionCounter;
    if (this.crossfadeTimer) {
      clearTimeout(this.crossfadeTimer);
      this.crossfadeTimer = null;
    }

    const currentDeck = this.activeDeck;
    const nextDeck = this.idleDeck;

    // Ensure next deck has the correct source
    if (nextDeck.audio.src !== streamUrl) {
      nextDeck.audio.src = streamUrl;
      nextDeck.audio.load();
    }

    const dur = Math.max(0, crossfadeSec);
    const now = this.audioCtx ? this.audioCtx.currentTime : 0;

    if (dur <= 0.05 || !this.audioCtx || !currentDeck.gainNode || !nextDeck.gainNode) {
      // Gapless switch
      nextDeck.audio.currentTime = 0;
      if (nextDeck.gainNode && this.audioCtx) {
        nextDeck.gainNode.gain.cancelScheduledValues(now);
        nextDeck.gainNode.gain.setValueAtTime(1.0, now);
      }
      if (currentDeck.gainNode && this.audioCtx) {
        currentDeck.gainNode.gain.cancelScheduledValues(now);
        currentDeck.gainNode.gain.setValueAtTime(0.0, now);
      }
      this.activeDeckId = nextDeck.id;
      currentDeck.audio.pause();
      try {
        await nextDeck.audio.play();
      } catch (err) {
        console.warn('Gapless playback play() was rejected:', err);
      }
      return;
    }

    // Overlapping crossfade
    nextDeck.audio.currentTime = 0;
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
    }

    // Pause old deck only after crossfade completes if no newer transition started
    this.crossfadeTimer = setTimeout(() => {
      if (this.transitionCounter !== currentTransition) return;
      currentDeck.audio.pause();
      if (currentDeck.gainNode && this.audioCtx) {
        currentDeck.gainNode.gain.setValueAtTime(0.0, this.audioCtx.currentTime);
      }
      this.crossfadeTimer = null;
    }, dur * 1000);
  }

  public async loadTrack(streamUrl: string): Promise<void> {
    this.initAudioContext();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }

    this.transitionCounter++;
    if (this.crossfadeTimer) {
      clearTimeout(this.crossfadeTimer);
      this.crossfadeTimer = null;
    }
    this.idleDeck.audio.pause();
    if (this.idleDeck.gainNode && this.audioCtx) {
      this.idleDeck.gainNode.gain.setValueAtTime(0.0, this.audioCtx.currentTime);
    }

    const active = this.activeDeck;
    if (active.gainNode && this.audioCtx) {
      active.gainNode.gain.setValueAtTime(1.0, this.audioCtx.currentTime);
    }
    active.audio.src = streamUrl;
    active.audio.load();
  }

  public async play(): Promise<void> {
    this.initAudioContext();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
    try {
      await this.activeDeck.audio.play();
    } catch (err) {
      console.warn('Playback play() was rejected:', err);
    }
  }

  public pause(): void {
    this.deckA.audio.pause();
    this.deckB.audio.pause();
  }

  public getCurrentSrc(): string {
    return this.activeDeck.audio.src || '';
  }

  public isPaused(): boolean {
    return this.activeDeck.audio.paused;
  }

  public seek(timeInSeconds: number): void {
    if (!isNaN(timeInSeconds) && isFinite(timeInSeconds)) {
      this.activeDeck.audio.currentTime = timeInSeconds;
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
