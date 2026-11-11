import React, { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { getTrackColor } from '../utils/helpers';
import { extractPalette, DEFAULT_PALETTE, type Palette } from '../utils/palette';
import { useBassLevel } from '../hooks/useBassLevel';

const FADE_MS = 1400;

interface Layer {
  id: number;
  palette: Palette;
}

const BLOBS = [
  {
    top: '-12%',
    left: '-8%',
    width: '88vw',
    height: '75vh',
    borderRadius: '42% 58% 70% 30% / 45% 45% 55% 55%',
    anim: 'aura-a',
    dur: '28s',
    colorIdx: 0,
  },
  {
    top: '4%',
    left: '32%',
    width: '84vw',
    height: '70vh',
    borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%',
    anim: 'aura-b',
    dur: '34s',
    colorIdx: 1,
  },
  {
    top: '32%',
    left: '-8%',
    width: '90vw',
    height: '78vh',
    borderRadius: '35% 65% 60% 40% / 50% 60% 40% 50%',
    anim: 'aura-c',
    dur: '42s',
    colorIdx: 2,
  },
  {
    top: '18%',
    left: '16%',
    width: '80vw',
    height: '66vh',
    borderRadius: '50% 50% 40% 60% / 40% 60% 50% 50%',
    anim: 'aura-d',
    dur: '30s',
    colorIdx: 0,
  },
];

/** Smooth Gaussian asymptotic gradient that dissolves seamlessly without sharp edges */
const makeGaussianGradient = (color: string) => `
  radial-gradient(
    ellipse 60% 50% at 50% 50%,
    color-mix(in oklab, ${color} 65%, transparent) 0%,
    color-mix(in oklab, ${color} 45%, transparent) 25%,
    color-mix(in oklab, ${color} 25%, transparent) 50%,
    color-mix(in oklab, ${color} 8%, transparent) 75%,
    color-mix(in oklab, ${color} 1%, transparent) 90%,
    transparent 100%
  )
`;

/** One full set of blended aura layers. New layers crossfade smoothly over previous ones. */
const AuraLayer = React.memo<{ palette: Palette; paused: boolean; reduceEffects: boolean }>(({
  palette,
  paused,
  reduceEffects,
}) => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setVisible(true), 30);
    return () => window.clearTimeout(t);
  }, []);

  const c0 = palette.colors[0] || DEFAULT_PALETTE.colors[0];
  const c1 = palette.colors[1] || DEFAULT_PALETTE.colors[1];
  const c2 = palette.colors[2] || DEFAULT_PALETTE.colors[2];

  return (
    <div
      className="absolute inset-0"
      style={{
        opacity: visible ? 1 : 0,
        transition: `opacity ${FADE_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
        isolation: 'isolate',
      }}
    >
      {/* 1. Base diffuse color wash: provides foundational atmospheric illumination */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 95% 75% at 15% 15%, color-mix(in oklab, ${c0} 38%, transparent) 0%, transparent 75%),
            radial-gradient(ellipse 90% 80% at 85% 25%, color-mix(in oklab, ${c1} 36%, transparent) 0%, transparent 75%),
            radial-gradient(ellipse 100% 85% at 50% 90%, color-mix(in oklab, ${c2} 32%, transparent) 0%, transparent 80%)
          `,
        }}
      />

      {/* 2. Floating organic morphing aura blobs */}
      {BLOBS.map((b, i) => {
        const color = palette.colors[b.colorIdx] || c0;
        return (
          <div
            key={i}
            className="aura-blob absolute pointer-events-none"
            style={{
              top: b.top,
              left: b.left,
              width: b.width,
              height: b.height,
              borderRadius: b.borderRadius,
              background: makeGaussianGradient(color),
              mixBlendMode: 'screen',
              animation: `${b.anim} ${b.dur} ease-in-out infinite alternate`,
              animationPlayState: paused ? 'paused' : 'running',
              transform: 'translate3d(0, 0, 0)',
              backfaceVisibility: 'hidden',
              willChange: reduceEffects ? 'auto' : 'transform',
            }}
          />
        );
      })}
    </div>
  );
});

export const AmbientGlow: React.FC<{ reduceEffects?: boolean }> = ({ reduceEffects = false }) => {
  const { currentTrack, isPlaying, themeAppearance, coverMap } = usePlayer();
  const isGlass = themeAppearance === 'aura_glass';
  const pulseRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);
  const [layers, setLayers] = useState<Layer[]>(() => [
    { id: 0, palette: DEFAULT_PALETTE }
  ]);

  const trackKey = currentTrack ? `${currentTrack.title}|${currentTrack.artist}` : null;
  const cover = currentTrack ? (coverMap[currentTrack.id] || currentTrack.cover_art || null) : null;
  const fallbackGlow = currentTrack ? getTrackColor(currentTrack.title, currentTrack.artist).glow : null;

  useBassLevel(pulseRef, isPlaying && !reduceEffects);

  useEffect(() => {
    if (!trackKey) return;
    let cancelled = false;

    (async () => {
      let palette: Palette;
      if (cover) {
        palette = await extractPalette(cover, trackKey);
      } else if (fallbackGlow) {
        palette = {
          colors: [fallbackGlow, DEFAULT_PALETTE.colors[0], DEFAULT_PALETTE.colors[1]],
          accent: fallbackGlow,
        };
      } else {
        palette = DEFAULT_PALETTE;
      }
      if (cancelled) return;

      const id = ++nextId.current;
      setLayers((prev) => [...prev, { id, palette }]);
      // Expose the accent so the progress bar, active row, etc. can use var(--song-accent)
      document.documentElement.style.setProperty('--song-accent', palette.accent);
      // Once the new layer is fully opaque, drop everything beneath it
      window.setTimeout(() => setLayers((prev) => prev.filter((l) => l.id >= id)), FADE_MS + 100);
    })();

    return () => { cancelled = true; };
  }, [trackKey, cover, fallbackGlow]);

  return (
    <div
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#08080B]"
      style={{
        contain: 'strict',
      }}
      aria-hidden="true"
    >
      <style>{`
        @keyframes aura-a {
          0%   { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
          50%  { transform: translate3d(8vw, 6vh, 0) rotate(35deg) scale(1.08); }
          100% { transform: translate3d(-5vw, 10vh, 0) rotate(70deg) scale(0.96); }
        }
        @keyframes aura-b {
          0%   { transform: translate3d(0, 0, 0) rotate(0deg) scale(1.04); }
          50%  { transform: translate3d(-10vw, 8vh, 0) rotate(-40deg) scale(0.92); }
          100% { transform: translate3d(6vw, -5vh, 0) rotate(-80deg) scale(1.08); }
        }
        @keyframes aura-c {
          0%   { transform: translate3d(0, 0, 0) rotate(0deg) scale(0.96); }
          50%  { transform: translate3d(10vw, -8vh, 0) rotate(45deg) scale(1.10); }
          100% { transform: translate3d(-6vw, 5vh, 0) rotate(90deg) scale(1); }
        }
        @keyframes aura-d {
          0%   { transform: translate3d(0, 0, 0) rotate(0deg) scale(1); }
          50%  { transform: translate3d(-8vw, -6vh, 0) rotate(-30deg) scale(1.06); }
          100% { transform: translate3d(8vw, 8vh, 0) rotate(-60deg) scale(0.94); }
        }
        @media (prefers-reduced-motion: reduce) {
          .aura-blob { animation: none !important; }
        }
      `}</style>

      {/* Outer div: play/pause dimming with single unified high-efficiency blur filter */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: isGlass
            ? (isPlaying ? 0.72 : 0.32)
            : (isPlaying ? 0.32 : 0.12),
          transition: 'opacity 800ms ease-in-out',
          filter: reduceEffects ? 'none' : 'blur(80px) saturate(140%)',
          willChange: 'opacity',
        }}
      >
        {/* Inner div: responsive acoustic bass pulse */}
        <div
          ref={pulseRef}
          className="absolute inset-0"
          style={{
            opacity: 'calc(0.78 + var(--bass, 0) * 0.22)',
            transform: 'scale(calc(1 + var(--bass, 0) * 0.04))',
            willChange: 'transform, opacity',
          }}
        >
          {layers.map((l) => (
            <AuraLayer
              key={l.id}
              palette={l.palette}
              paused={!isPlaying || reduceEffects}
              reduceEffects={reduceEffects}
            />
          ))}
        </div>
      </div>

      {/* Radial Obsidian Vignette & Contrast Shield:
          Protects foreground text legibility while letting the ambient glow halo gracefully around the window */}
      <div
        className={`absolute inset-0 transition-opacity duration-500 pointer-events-none ${
          isGlass ? 'opacity-65' : 'opacity-100'
        }`}
        style={{
          background: isGlass
            ? 'radial-gradient(ellipse 110% 90% at 50% 50%, transparent 40%, rgba(7, 6, 10, 0.35) 75%, rgba(7, 6, 10, 0.75) 100%)'
            : 'radial-gradient(ellipse 110% 90% at 50% 50%, transparent 20%, rgba(7, 6, 10, 0.55) 60%, rgba(7, 6, 10, 0.92) 100%)',
        }}
      />
    </div>
  );
};
