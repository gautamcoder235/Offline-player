import React, { useEffect, useRef, useState } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { getTrackColor } from '../utils/helpers';
import { extractPalette, DEFAULT_PALETTE, type Palette } from '../utils/palette';
import { useBassLevel } from '../hooks/useBassLevel';

const FADE_MS = 1200;

interface Layer { id: number; palette: Palette }

const BLOBS = [
  { top: '-15%', left: '-10%', size: '70vmax', anim: 'aura-a', dur: '25s' },
  { top: '5%',   left: '45%',  size: '60vmax', anim: 'aura-b', dur: '32s' },
  { top: '45%',  left: '0%',   size: '65vmax', anim: 'aura-c', dur: '41s' },
];

/** One full set of blobs for one track. New layers fade in over the old one. */
const AuraLayer: React.FC<{ palette: Palette; paused: boolean }> = ({ palette, paused }) => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setVisible(true), 30);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div
      className="absolute inset-0"
      style={{ opacity: visible ? 1 : 0, transition: `opacity ${FADE_MS}ms ease-in-out` }}
    >
      {BLOBS.map((b, i) => (
        <div
          key={i}
          className="aura-blob absolute rounded-full"
          style={{
            top: b.top,
            left: b.left,
            width: b.size,
            height: b.size,
            background: `radial-gradient(circle, ${palette.colors[i]} 0%, transparent 65%)`,
            animation: `${b.anim} ${b.dur} ease-in-out infinite alternate`,
            animationPlayState: paused ? 'paused' : 'running',
            willChange: 'transform',
          }}
        />
      ))}
    </div>
  );
};

export const AmbientGlow: React.FC<{ reduceEffects?: boolean }> = ({ reduceEffects = false }) => {
  const { currentTrack, isPlaying } = usePlayer();
  const pulseRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);
  const [layers, setLayers] = useState<Layer[]>([]);

  const trackKey = currentTrack ? `${currentTrack.title}|${currentTrack.artist}` : null;
  const cover = currentTrack?.cover_art ?? null;
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
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#0B0A0F]"
      aria-hidden="true"
    >
      <style>{`
        @keyframes aura-a { from { transform: translate(0,0) scale(1); }       to { transform: translate(14vw,10vh) scale(1.15); } }
        @keyframes aura-b { from { transform: translate(0,0) scale(1.1); }     to { transform: translate(-16vw,12vh) scale(0.9); } }
        @keyframes aura-c { from { transform: translate(0,0) scale(0.95); }    to { transform: translate(12vw,-14vh) scale(1.2); } }
        @media (prefers-reduced-motion: reduce) { .aura-blob { animation: none !important; } }
      `}</style>

      {/* Permanent subtle brand gradient: Electric Mint (top right) & Champagne Gold (left) */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(700px circle at 75% 5%, rgba(25, 230, 160, 0.035), transparent 60%),
            radial-gradient(600px circle at 15% 25%, rgba(232, 199, 122, 0.018), transparent 60%)
          `,
        }}
      />

      {/* Outer div: play/pause dimming (CSS transition). Inner div: bass pulse (driven by --bass). */}
      <div
        className="absolute inset-0"
        style={{
          opacity: isPlaying ? 0.34 : 0.14,
          transition: 'opacity 1000ms ease-in-out',
          filter: reduceEffects ? 'none' : 'blur(70px)',
        }}
      >
        <div
          ref={pulseRef}
          className="absolute inset-0"
          style={{
            opacity: 'calc(0.7 + var(--bass, 0) * 0.3)',
            transform: 'scale(calc(1 + var(--bass, 0) * 0.04))',
          }}
        >
          {layers.map((l) => (
            <AuraLayer key={l.id} palette={l.palette} paused={!isPlaying || reduceEffects} />
          ))}
        </div>
      </div>

      {/* Obsidian vignette to ground the edges in #0B0A0F */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B0A0F]/20 via-transparent to-[#0B0A0F]/80" />
    </div>
  );
};
