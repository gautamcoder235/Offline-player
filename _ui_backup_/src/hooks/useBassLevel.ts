import { useEffect, type RefObject } from 'react';
import { audioEngine } from '../services/audioEngine';

const BASS_BINS = 3;      // fftSize 512 @ 44.1kHz → ~86Hz/bin, bins 0-2 ≈ 0-258Hz
const FLOOR = 0.5;        // ignore the constant low-end hum; only react to hits
const ATTACK = 0.3;       // fast rise on a kick
const RELEASE = 0.05;     // slow fall so it breathes instead of flickers

/**
 * Writes a smoothed 0..1 bass level to `--bass` on the referenced element.
 * Uses a CSS variable (not React state) so nothing re-renders at 60fps.
 */
export function useBassLevel(ref: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!active || reduceMotion) {
      el.style.setProperty('--bass', '0');
      return;
    }

    const data = new Uint8Array(256);
    let envelope = 0;
    let raf = 0;

    const tick = () => {
      audioEngine.getFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < BASS_BINS; i++) sum += data[i];
      const raw = sum / (BASS_BINS * 255);
      const target = Math.max(0, (raw - FLOOR) / (1 - FLOOR));
      envelope += (target > envelope ? ATTACK : RELEASE) * (target - envelope);
      el.style.setProperty('--bass', envelope.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      el.style.setProperty('--bass', '0');
    };
  }, [ref, active]);
}
