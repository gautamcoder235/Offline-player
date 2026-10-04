import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Heart,
  BarChart2,
  Disc3,
  Waves,
  CircleDot,
} from 'lucide-react';
import { audioEngine } from '../services/audioEngine';
import { usePlayer } from '../context/PlayerContext';
import { getTrackColor } from '../utils/helpers';

type VisualizerMode = 'spectrum' | 'radial' | 'waves';

const MODES: { id: VisualizerMode; label: string; icon: typeof Waves; accent: string }[] = [
  { id: 'radial', label: 'Particle Orb', icon: CircleDot, accent: '#00F2FE' },
  { id: 'spectrum', label: 'Spectrum', icon: BarChart2, accent: '#19E6A0' },
  { id: 'waves', label: 'Liquid Waves', icon: Waves, accent: '#19E6A0' },
];

const BINS = 256;
const ORB_POINTS = 1100;
const SPRITES = 32;
const SPEC_BARS = 44; // per side (mirrored from center)
const BG = '14,13,18';

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

// Cyan -> violet -> magenta ramp
const ramp = (t: number): [number, number, number] => {
  const stops: [number, number, number][] = [
    [0, 242, 254],
    [138, 60, 240],
    [255, 0, 127],
  ];
  const p = clamp(t) * 2;
  const i = Math.min(1, Math.floor(p));
  const f = p - i;
  const a = stops[i];
  const b = stops[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f].map(
    Math.round
  ) as [number, number, number];
};

// Pre-rendered glow sprite: far cheaper than shadowBlur on every dot
const makeSprite = ([r, g, b]: [number, number, number]) => {
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const x = c.getContext('2d')!;
  const grad = x.createRadialGradient(24, 24, 0, 24, 24, 24);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.12, `rgba(${r},${g},${b},0.95)`);
  grad.addColorStop(0.45, `rgba(${r},${g},${b},0.22)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = grad;
  x.fillRect(0, 0, 48, 48);
  return c;
};

export const VisualizerView: React.FC = () => {
  const { currentTrack, isPlaying, togglePlay, nextTrack, prevTrack, likedTrackIds, toggleLike } =
    usePlayer();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [visMode, setVisMode] = useState<VisualizerMode>('radial');

  // Read isPlaying from a ref so play/pause doesn't restart the render loop
  const playingRef = useRef(isPlaying);
  playingRef.current = isPlaying;

  const isLiked = currentTrack ? likedTrackIds.has(currentTrack.id) : false;
  const trackColor = currentTrack
    ? getTrackColor(currentTrack.title, currentTrack.artist)
    : { bg: '#16151C', text: '#777381', glow: 'transparent' };

  // Evenly distributed sphere points (Fibonacci lattice: no pole clumping like lat/long rings)
  const orb = useMemo(() => {
    const xs = new Float32Array(ORB_POINTS);
    const ys = new Float32Array(ORB_POINTS);
    const zs = new Float32Array(ORB_POINTS);
    const bins = new Uint8Array(ORB_POINTS);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < ORB_POINTS; i++) {
      const y = 1 - (2 * (i + 0.5)) / ORB_POINTS;
      const rad = Math.sqrt(1 - y * y);
      const th = i * golden;
      xs[i] = Math.cos(th) * rad;
      ys[i] = y;
      zs[i] = Math.sin(th) * rad;
      const around = (((th / (Math.PI * 2)) % 1) + 1) % 1;
      bins[i] = Math.floor((around * 0.5 + Math.abs(y) * 0.5) * 150);
    }
    return { xs, ys, zs, bins };
  }, []);

  const sm = useRef(new Float32Array(BINS)); // attack/decay smoothed
  const sp = useRef(new Float32Array(BINS)); // + spatial smoothing
  const st = useRef({
    phase: 0,
    rotY: 0,
    avgBass: 0,
    kick: 0,
    cool: 0,
    rings: [] as { r: number; a: number }[],
    peaks: new Float32Array(SPEC_BARS),
    vel: new Float32Array(SPEC_BARS),
  });

  // Keyboard: 1 / 2 / 3 switch modes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      const m = MODES[Number(e.key) - 1];
      if (m) setVisMode(m.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const data = new Uint8Array(BINS);
    const time = new Uint8Array(BINS);
    const sprites = Array.from({ length: SPRITES }, (_, i) => makeSprite(ramp(i / (SPRITES - 1))));

    let w = 0;
    let h = 0;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let raf = 0;

    const render = () => {
      raf = requestAnimationFrame(render);
      const playing = playingRef.current;
      const s = st.current;
      const smooth = sm.current;
      const spat = sp.current;
      s.phase += playing ? 0.02 : 0.006;

      audioEngine.getFrequencyData(data);
      audioEngine.getTimeDomainData(time);

      // --- Smoothing: fast attack, quick decay, then 3-tap spatial blur ---
      for (let i = 0; i < BINS; i++) {
        const raw = playing ? data[i] / 255 : 0;
        smooth[i] += (raw - smooth[i]) * (raw > smooth[i] ? 0.75 : 0.2);
      }
      for (let i = 0; i < BINS; i++) {
        const p = smooth[i > 0 ? i - 1 : i];
        const n = smooth[i < BINS - 1 ? i + 1 : i];
        spat[i] = 0.18 * p + 0.64 * smooth[i] + 0.18 * n;
      }
      const band = (a: number, b: number) => {
        let t = 0;
        for (let i = a; i < b; i++) t += spat[i];
        return t / (b - a);
      };
      const bass = clamp(band(0, 14) * 1.5);
      const mid = clamp(band(14, 70) * 1.4);
      const treble = clamp(band(70, 190) * 1.6);

      // --- Beat detection: bass vs. its own running average ---
      if (playing && s.cool <= 0 && bass > s.avgBass * 1.18 + 0.05) {
        s.kick = 1;
        s.cool = 12;
        s.rings.push({ r: 0, a: 0.55 });
      }
      s.avgBass += (bass - s.avgBass) * 0.05;
      s.cool--;
      s.kick *= 0.9;

      // --- Frame: translucent clear for soft motion trails ---
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgba(${BG},${visMode === 'spectrum' ? 0.38 : 0.24})`;
      ctx.fillRect(0, 0, w, h);

      if (visMode === 'radial') {
        const cx = w / 2;
        const cy = h / 2;
        const base = Math.min(w, h) * 0.25;

        const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, base * (2 + s.kick * 0.5));
        glow.addColorStop(0, `rgba(0,242,254,${0.1 + s.kick * 0.1})`);
        glow.addColorStop(0.5, `rgba(138,43,226,${0.05 + s.kick * 0.05})`);
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, w, h);

        ctx.globalCompositeOperation = 'lighter'; // additive: no depth sort needed

        // Shockwave rings fired on each beat
        for (let k = s.rings.length - 1; k >= 0; k--) {
          const ring = s.rings[k];
          ring.r += base * 0.045;
          ring.a *= 0.94;
          if (ring.a < 0.02) {
            s.rings.splice(k, 1);
            continue;
          }
          ctx.globalAlpha = ring.a;
          ctx.strokeStyle = 'rgb(0,242,254)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(cx, cy, base + ring.r, (base + ring.r) * 0.38, -0.14, 0, Math.PI * 2);
          ctx.stroke();
        }

        s.rotY += (0.004 + mid * 0.02 + s.kick * 0.03) * (playing ? 1 : 0.35);
        const tilt = 0.45 + Math.sin(s.phase * 0.3) * 0.15;
        const cY = Math.cos(s.rotY);
        const sY = Math.sin(s.rotY);
        const cX = Math.cos(tilt);
        const sX = Math.sin(tilt);
        const fov = base * 5;
        const { xs, ys, zs, bins } = orb;

        for (let i = 0; i < ORB_POINTS; i++) {
          const f = playing ? spat[bins[i]] : 0;
          const wv = playing ? Math.abs(time[(i * 3) % BINS] - 128) / 128 : 0;
          const r =
            base *
            (0.62 + f * 0.7 + wv * 0.12 + bass * 0.22 + s.kick * 0.12 +
              (playing ? 0 : Math.sin(s.phase * 1.4 + ys[i] * 3) * 0.02));

          const x0 = xs[i] * r;
          const y0 = ys[i] * r;
          const z0 = zs[i] * r;
          const x1 = x0 * cY + z0 * sY;
          const z1 = -x0 * sY + z0 * cY;
          const y2 = y0 * cX - z1 * sX;
          const z2 = y0 * sX + z1 * cX;

          const sc = fov / (fov + z2);
          const sx = cx + x1 * sc;
          const sy = cy + y2 * sc;

          const depth = clamp(0.5 - z2 / (base * 2.2)); // 1 = near camera
          const hue = clamp((x1 / base + 1.2) / 2.4);
          const size = (7 + f * 16 + s.kick * 3 + treble * 3) * sc * (0.55 + depth * 0.8);

          ctx.globalAlpha = clamp(0.2 + depth * 0.6 + f * 0.3);
          ctx.drawImage(sprites[Math.floor(hue * (SPRITES - 1))], sx - size / 2, sy - size / 2, size, size);
        }
      } else if (visMode === 'spectrum') {
        const cx = w / 2;
        const baseline = h * 0.76;
        const maxH = h * 0.58;
        const gap = Math.max(2, w / 420);
        const bw = Math.max(2, (w * 0.88) / 2 / SPEC_BARS - gap);
        ctx.globalCompositeOperation = 'lighter';

        for (let i = 0; i < SPEC_BARS; i++) {
          const t = i / (SPEC_BARS - 1);
          const fi = Math.pow(t, 1.6) * (BINS - 90) + t * 4; // bass at center, treble at edges
          const i0 = Math.floor(fi);
          const fr = fi - i0;
          const raw = playing ? spat[i0] * (1 - fr) + spat[Math.min(BINS - 1, i0 + 1)] * fr : 0;
          const e = clamp(Math.tanh(raw * 1.6) * (1 + t * 0.35));
          const bh = playing ? Math.max(3, e * maxH) : 2;

          // Peak caps with gravity
          if (bh > s.peaks[i]) {
            s.peaks[i] = bh;
            s.vel[i] = 0;
          } else {
            s.vel[i] += 0.9;
            s.peaks[i] = Math.max(2, s.peaks[i] - s.vel[i]);
          }

          const color = `hsl(${158 + t * 40}, 85%, ${52 + e * 18}%)`;
          const off = i * (bw + gap);
          for (const x of [cx + off, cx - off - bw]) {
            ctx.globalAlpha = 0.9;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.roundRect(x, baseline - bh, bw, bh, [3, 3, 0, 0]);
            ctx.fill();

            ctx.globalAlpha = 0.12; // reflection
            ctx.fillRect(x, baseline + 3, bw, bh * 0.35);

            if (playing && s.peaks[i] > 6) {
              ctx.globalAlpha = 0.95;
              ctx.fillStyle = '#E8C77A';
              ctx.fillRect(x, baseline - s.peaks[i] - 5, bw, 2.5);
            }
          }
        }
      } else {
        // Liquid waves
        const centerY = h * 0.54;
        const pts = 64;
        ctx.globalCompositeOperation = 'lighter';

        const layers = [
          { off: 0, start: 0, amp: 0.75, rgb: '232,199,122', lw: 1.8 },
          { off: Math.PI * 0.75, start: 4, amp: 0.95, rgb: '53,240,177', lw: 2.2 },
          { off: Math.PI * 1.45, start: 1, amp: 1.25, rgb: '25,230,160', lw: 3 },
        ];

        for (const L of layers) {
          const xy: number[] = [];
          for (let i = 0; i <= pts; i++) {
            const p = i / pts;
            const energy = playing ? spat[Math.min(BINS - 1, Math.floor(L.start + p * 48))] : 0.05;
            const sum =
              Math.sin(p * Math.PI * 3 + s.phase + L.off) * 0.55 +
              Math.cos(p * Math.PI * 5 - s.phase * 0.85 + L.off * 1.4) * 0.3 +
              Math.sin(p * Math.PI * 2 + s.phase * 1.3) * 0.15;
            const amp =
              (energy * 0.85 + (playing ? 0.2 : 0.05) + s.kick * 0.1) *
              h * 0.36 * L.amp * (0.3 + Math.sin(p * Math.PI) * 0.7);
            xy.push(p * w, centerY + sum * amp);
          }
          const trace = () => {
            ctx.beginPath();
            ctx.moveTo(xy[0], xy[1]);
            for (let i = 2; i < xy.length - 2; i += 2) {
              ctx.quadraticCurveTo(xy[i], xy[i + 1], (xy[i] + xy[i + 2]) / 2, (xy[i + 1] + xy[i + 3]) / 2);
            }
            ctx.lineTo(xy[xy.length - 2], xy[xy.length - 1]);
          };

          trace();
          ctx.lineTo(w, h);
          ctx.lineTo(0, h);
          ctx.closePath();
          const fill = ctx.createLinearGradient(0, centerY - 100, 0, h);
          fill.addColorStop(0, `rgba(${L.rgb},0.24)`);
          fill.addColorStop(1, `rgba(${L.rgb},0)`);
          ctx.globalAlpha = 1;
          ctx.fillStyle = fill;
          ctx.fill();

          // Soft halo pass + crisp line pass (replaces expensive shadowBlur)
          trace();
          ctx.strokeStyle = `rgba(${L.rgb},0.18)`;
          ctx.lineWidth = L.lw * 5;
          ctx.stroke();
          trace();
          ctx.strokeStyle = `rgba(${L.rgb},0.85)`;
          ctx.lineWidth = L.lw;
          ctx.stroke();
        }
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    render();
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [visMode, orb]);

  return (
    <div className="flex-1 flex flex-col h-full w-full overflow-hidden select-none relative bg-[#0E0D12]">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block" />

      <div className="relative z-10 w-full px-8 pt-6 pb-2 flex items-center justify-between shrink-0 bg-gradient-to-b from-[#0E0D12]/90 via-[#0E0D12]/40 to-transparent">
        {currentTrack ? (
          <div className="flex items-center gap-4">
            <div className="relative w-14 h-14 rounded-xl overflow-hidden border border-[#292731] shadow-xl bg-[#16151C] shrink-0">
              {currentTrack.cover_art ? (
                <img src={currentTrack.cover_art} alt={currentTrack.title} className="w-full h-full object-cover" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center"
                  style={{ background: trackColor.bg, color: trackColor.text }}
                >
                  <Disc3
                    className={`w-7 h-7 ${isPlaying ? 'animate-spin' : ''}`}
                    style={{ animationDuration: '6s' }}
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col min-w-0">
              <h3 className="text-base font-bold text-[#F4F2F7] tracking-tight truncate max-w-md">
                {currentTrack.title}
              </h3>
              <p className="text-xs text-[#9A96A5] truncate max-w-md mt-0.5">
                {currentTrack.artist} {currentTrack.album ? `— ${currentTrack.album}` : ''}
              </p>
            </div>

            <button
              onClick={() => toggleLike(currentTrack.id)}
              className={`p-2 rounded-full transition-colors cursor-pointer ml-1 ${
                isLiked ? 'text-[#E8C77A]' : 'text-[#65616F] hover:text-[#E8C77A]'
              }`}
              title={isLiked ? 'Remove from Liked' : 'Save to Liked'}
            >
              <Heart className={`w-4 h-4 ${isLiked ? 'fill-[#E8C77A] text-[#E8C77A]' : ''}`} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-xs text-[#65616F]">
            <Disc3 className="w-5 h-5 text-[#4B4854]" />
            <span>Select any track to begin real-time audio visualization</span>
          </div>
        )}

        {currentTrack && (
          <div className="flex items-center gap-2.5">
            <button
              onClick={prevTrack}
              className="p-2 rounded-full text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#16151C]/80 transition-colors cursor-pointer"
              title="Previous Track"
            >
              <SkipBack className="w-4 h-4 fill-current" />
            </button>
            <button
              onClick={togglePlay}
              className="w-9 h-9 rounded-full bg-[#19E6A0] hover:bg-[#35F0B1] text-black flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 cursor-pointer"
              title="Play / Pause"
            >
              {isPlaying ? (
                <Pause className="w-4 h-4 fill-black text-black" />
              ) : (
                <Play className="w-4 h-4 fill-black text-black ml-0.5" />
              )}
            </button>
            <button
              onClick={nextTrack}
              className="p-2 rounded-full text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#16151C]/80 transition-colors cursor-pointer"
              title="Next Track"
            >
              <SkipForward className="w-4 h-4 fill-current" />
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 pointer-events-none" />

      <div className="relative z-10 w-full pb-7 flex items-center justify-center shrink-0">
        <div className="flex items-center bg-[#14131A]/90 backdrop-blur-md p-1 rounded-xl border border-[#282631]/80 text-xs shadow-2xl gap-1">
          {MODES.map(({ id, label, icon: Icon, accent }, idx) => {
            const active = visMode === id;
            return (
              <button
                key={id}
                onClick={() => setVisMode(id)}
                aria-pressed={active}
                title={`${label} (${idx + 1})`}
                className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors duration-150 cursor-pointer ${
                  active
                    ? 'bg-[#211F26] font-semibold shadow-sm'
                    : 'text-[#777381] hover:text-[#F4F2F7] hover:bg-[#1A1922]'
                }`}
                style={active ? { color: accent } : undefined}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
