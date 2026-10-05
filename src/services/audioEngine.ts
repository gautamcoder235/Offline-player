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

export class AudioEngine {
  private audio: HTMLAudioElement;
  private audioCtx: AudioContext | null = null;
  private sourceNode: MediaElementAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private gainNode: GainNode | null = null;
  private filters: BiquadFilterNode[] = [];
  private isInitialized = false;

  public onTimeUpdate?: (currentTime: number, duration: number) => void;
  public onEnded?: () => void;
  public onPlay?: () => void;
  public onPause?: () => void;
  public onError?: (err: string) => void;
  public onLoadedMetadata?: (duration: number) => void;

  constructor() {
    this.audio = new Audio();
    this.audio.crossOrigin = 'anonymous';
    this.audio.preload = 'auto';

    this.audio.addEventListener('timeupdate', () => {
      if (this.onTimeUpdate) {
        this.onTimeUpdate(this.audio.currentTime, this.audio.duration || 0);
      }
    });

    this.audio.addEventListener('ended', () => {
      if (this.onEnded) this.onEnded();
    });

    this.audio.addEventListener('play', () => {
      if (this.onPlay) this.onPlay();
    });

    this.audio.addEventListener('pause', () => {
      if (this.onPause) this.onPause();
    });

    this.audio.addEventListener('loadedmetadata', () => {
      if (this.onLoadedMetadata) {
        this.onLoadedMetadata(this.audio.duration || 0);
      }
    });

    this.audio.addEventListener('error', (e) => {
      console.error('Audio playback error', e);
      if (this.onError) {
        this.onError('Failed to play audio track');
      }
    });
  }

  private initAudioContext() {
    if (this.isInitialized) return;

    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioContextClass();

      this.sourceNode = this.audioCtx.createMediaElementSource(this.audio);
      this.analyserNode = this.audioCtx.createAnalyser();
      this.analyserNode.fftSize = 512;
      this.analyserNode.smoothingTimeConstant = 0.78;

      this.gainNode = this.audioCtx.createGain();

      // Create 5-band equalizer filters: 60Hz, 250Hz, 1kHz, 4kHz, 14kHz
      const freqs = [60, 250, 1000, 4000, 14000];
      const types: BiquadFilterType[] = ['lowshelf', 'peaking', 'peaking', 'peaking', 'highshelf'];

      this.filters = freqs.map((freq, i) => {
        const filter = this.audioCtx!.createBiquadFilter();
        filter.type = types[i];
        filter.frequency.value = freq;
        filter.gain.value = 0;
        return filter;
      });

      // Chain: Source -> Filter0 -> Filter1 -> ... -> Filter4 -> Analyser -> Gain -> Destination
      let prevNode: AudioNode = this.sourceNode;
      for (const filter of this.filters) {
        prevNode.connect(filter);
        prevNode = filter;
      }
      prevNode.connect(this.analyserNode);
      this.analyserNode.connect(this.gainNode);
      this.gainNode.connect(this.audioCtx.destination);

      this.isInitialized = true;
    } catch (e) {
      console.warn('AudioContext initialization failed or deferred:', e);
    }
  }

  public async loadTrack(streamUrl: string): Promise<void> {
    this.initAudioContext();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
    this.audio.src = streamUrl;
    this.audio.load();
  }

  public async play(): Promise<void> {
    this.initAudioContext();
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      await this.audioCtx.resume();
    }
    try {
      await this.audio.play();
    } catch (err) {
      console.warn('Playback play() was rejected:', err);
    }
  }

  public pause(): void {
    this.audio.pause();
  }

  public getCurrentSrc(): string {
    return this.audio.src || '';
  }

  public isPaused(): boolean {
    return this.audio.paused;
  }

  public seek(timeInSeconds: number): void {
    if (!isNaN(timeInSeconds) && isFinite(timeInSeconds)) {
      this.audio.currentTime = timeInSeconds;
    }
  }

  public crossfadeDuration: number = 0;

  public setCrossfadeDuration(sec: number): void {
    this.crossfadeDuration = Math.max(0, Math.min(12, sec));
  }

  public async fadeOut(durationSec: number = 0.8): Promise<void> {
    if (!this.gainNode || !this.audioCtx) return;
    try {
      const dur = Math.max(0.1, durationSec);
      const now = this.audioCtx.currentTime;
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
      this.gainNode.gain.linearRampToValueAtTime(0.0001, now + dur);
      await new Promise((resolve) => setTimeout(resolve, dur * 1000));
    } catch (e) {
      console.warn('fadeOut error:', e);
    }
  }

  public async fadeIn(targetVolume: number = 1.0, durationSec: number = 0.8): Promise<void> {
    if (!this.gainNode || !this.audioCtx) return;
    try {
      const dur = Math.max(0.1, durationSec);
      const now = this.audioCtx.currentTime;
      const clampedVol = Math.max(0.01, Math.min(1, targetVolume));
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.setValueAtTime(0.0001, now);
      this.gainNode.gain.linearRampToValueAtTime(clampedVol, now + dur);
    } catch (e) {
      console.warn('fadeIn error:', e);
    }
  }

  public setVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this.audio.volume = clamped;
    if (this.gainNode && this.audioCtx) {
      try {
        const now = this.audioCtx.currentTime;
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(clamped, now);
      } catch {
        // Gain scheduling catch
      }
    }
  }

  public setMuted(muted: boolean): void {
    this.audio.muted = muted;
    if (this.gainNode && this.audioCtx) {
      try {
        const now = this.audioCtx.currentTime;
        this.gainNode.gain.cancelScheduledValues(now);
        this.gainNode.gain.setValueAtTime(muted ? 0.0001 : this.audio.volume, now);
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
    if (!this.filters || this.filters.length !== 5) return;
    for (let i = 0; i < 5; i++) {
      if (this.filters[i]) {
        this.filters[i].gain.value = gains[i];
      }
    }
  }

  public setBandGain(bandIndex: number, gain: number): void {
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
    return this.audio.duration || 0;
  }

  public get currentTime(): number {
    return this.audio.currentTime || 0;
  }
}

export const audioEngine = new AudioEngine();
