import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { usePlayer } from '../context/PlayerContext';
import { EQUALIZER_PRESETS } from '../services/audioEngine';
import { AnimatedEqualizer, AnimatedClose, AnimatedRefresh } from './icons';

interface EqualizerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EqualizerModal: React.FC<EqualizerModalProps> = ({ isOpen, onClose }) => {
  const { equalizerPreset, setPreset, customGains, setCustomGain, themeAppearance } = usePlayer();
  const isGlass = themeAppearance === 'aura_glass';
  const draggingBandRef = useRef<number | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  const bandConfigs = [
    { freq: '60 Hz', label: 'Sub Bass', desc: 'Punch & Rumble', x: 50 },
    { freq: '250 Hz', label: 'Bass', desc: 'Warmth & Body', x: 150 },
    { freq: '1 kHz', label: 'Mids', desc: 'Vocals & Lead', x: 250 },
    { freq: '4 kHz', label: 'Treble', desc: 'Presence & Edge', x: 350 },
    { freq: '14 kHz', label: 'Air', desc: 'Brilliance & Sparkle', x: 450 },
  ];

  // Helper to map dB (-12 to +12) to SVG coordinate Y (105 to 15, center 0dB = 60)
  const dbToSvgY = (gain: number) => {
    const clamped = Math.max(-12, Math.min(12, gain));
    return 60 - (clamped / 12) * 44;
  };

  // Spline points calculation
  const splinePoints = [
    { x: 0, y: dbToSvgY((customGains[0] || 0) * 0.7) },
    { x: bandConfigs[0].x, y: dbToSvgY(customGains[0] || 0) },
    { x: bandConfigs[1].x, y: dbToSvgY(customGains[1] || 0) },
    { x: bandConfigs[2].x, y: dbToSvgY(customGains[2] || 0) },
    { x: bandConfigs[3].x, y: dbToSvgY(customGains[3] || 0) },
    { x: bandConfigs[4].x, y: dbToSvgY(customGains[4] || 0) },
    { x: 500, y: dbToSvgY((customGains[4] || 0) * 0.7) },
  ];

  // Cardinal spline converted to SVG cubic Bézier
  const getCurvePath = (pts: { x: number; y: number }[]): string => {
    if (pts.length < 2) return '';
    let path = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;

      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      path += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return path;
  };

  const curvePath = getCurvePath(splinePoints);
  const areaPath = `${curvePath} L 500 60 L 0 60 Z`;

  // Precision Fader pointer interactions
  const handleFaderPointerDown = (bandIdx: number, e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingBandRef.current = bandIdx;
    updateFaderFromPointer(bandIdx, e.clientY, e.currentTarget.getBoundingClientRect());
  };

  const handleFaderPointerMove = (bandIdx: number, e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingBandRef.current === bandIdx) {
      updateFaderFromPointer(bandIdx, e.clientY, e.currentTarget.getBoundingClientRect());
    }
  };

  const handleFaderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (draggingBandRef.current !== null) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      draggingBandRef.current = null;
    }
  };

  const updateFaderFromPointer = (bandIdx: number, clientY: number, rect: DOMRect) => {
    const relY = clientY - rect.top;
    const ratio = Math.max(0, Math.min(1, relY / rect.height));
    // 0 = top (+12dB), 1 = bottom (-12dB)
    const rawDb = 12 - ratio * 24;
    const stepped = Math.round(rawDb * 2) / 2; // 0.5 dB step
    setCustomGain(bandIdx, stepped);
  };

  const handleReset = () => {
    setIsResetting(true);
    setPreset('Flat');
    setTimeout(() => setIsResetting(false), 500);
  };

  const modalContent = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md select-none p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            className={`relative w-full max-w-2xl rounded-2xl ${
              isGlass
                ? 'bg-[#1B2127]/90 backdrop-blur-2xl border border-white/[0.1] shadow-[0_25px_60px_rgba(0,0,0,0.85)]'
                : 'bg-[#1B2127] border border-[#2B3540] shadow-[0_25px_60px_rgba(0,0,0,0.85)]'
            } p-6 flex flex-col gap-5 text-[#F4F2F7] overflow-hidden`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Ambient Radial Top Glow Matching App Identity */}
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-48 bg-[#19E6A0]/10 rounded-full blur-3xl pointer-events-none" />

            {/* Header */}
            <div className="relative z-10 flex items-center justify-between pb-3.5 border-b border-[#2B3540]">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-[#19E6A0]/10 text-[#19E6A0] border border-[#19E6A0]/25 shadow-[0_0_15px_rgba(25,230,160,0.2)] flex items-center justify-center">
                  <AnimatedEqualizer size={20} className="w-5 h-5 text-[#19E6A0]" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-[#F4F2F7] tracking-tight">Audio Equalizer</h2>
                  <p className="text-[11px] text-[#8E99A6] mt-0.5">5-Band Studio Parametric Acoustic Response</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleReset}
                  className="group px-3 py-1.5 rounded-lg text-xs font-medium text-[#8E99A6] hover:text-[#19E6A0] bg-[#222A32] hover:bg-[#19E6A0]/10 border border-[#2E3946] hover:border-[#19E6A0]/30 transition-all duration-200 active:scale-95 flex items-center gap-1.5 cursor-pointer"
                  title="Reset all bands to 0 dB Flat"
                >
                  <AnimatedRefresh isSpinning={isResetting} className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
                <button
                  onClick={onClose}
                  className="group/close p-1.5 rounded-lg text-[#8E99A6] hover:text-[#FF667A] hover:bg-[#FF667A]/10 border border-transparent hover:border-[#FF667A]/30 transition-all duration-200 active:scale-90 cursor-pointer"
                  aria-label="Close Equalizer"
                >
                  <AnimatedClose className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* 1. Interactive Frequency Response Curve (SVG Graph) - Unified #1B2127 */}
            <div className={`relative z-10 w-full rounded-2xl bg-[#1B2127] border ${
              isGlass ? 'border-white/[0.08]' : 'border-[#2B3540]'
            } p-4 shadow-inner overflow-hidden`}>
              {/* Header Info */}
              <div className="flex items-center justify-between text-[10px] text-[#777381] mb-2 font-mono">
                <span className="text-[#65616F] font-semibold">20 Hz</span>
                <span className="flex items-center gap-1.5 text-[10px] font-semibold text-[#9A96A5] uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#19E6A0] animate-pulse shadow-[0_0_6px_rgba(25,230,160,0.8)]" />
                  Frequency Response Curve
                </span>
                <span className="text-[#65616F] font-semibold">20 kHz</span>
              </div>

              <div className="relative w-full h-32">
                <svg
                  viewBox="0 0 500 120"
                  preserveAspectRatio="none"
                  className="w-full h-full overflow-visible"
                >
                  <defs>
                    {/* Curve Glow Gradient */}
                    <linearGradient id="eqCurveGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#19E6A0" />
                      <stop offset="50%" stopColor="#35F0B1" />
                      <stop offset="100%" stopColor="#19E6A0" />
                    </linearGradient>

                    {/* Shaded Area Fill */}
                    <linearGradient id="eqAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="rgba(25, 230, 160, 0.28)" />
                      <stop offset="50%" stopColor="rgba(25, 230, 160, 0.08)" />
                      <stop offset="100%" stopColor="rgba(25, 230, 160, 0)" />
                    </linearGradient>

                    <filter id="eqGlow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>

                  {/* dB Horizontal Guidelines */}
                  <line x1="0" y1="16" x2="500" y2="16" stroke="#23212B" strokeDasharray="3 3" strokeWidth="1" />
                  <text x="6" y="14" fill="#65616F" fontSize="9" fontFamily="monospace">+12dB</text>

                  <line x1="0" y1="38" x2="500" y2="38" stroke="#23212B" strokeDasharray="2 4" strokeWidth="1" />
                  <text x="6" y="36" fill="#65616F" fontSize="9" fontFamily="monospace">+6dB</text>

                  {/* 0 dB Baseline (Neutral Reference) with subtle mint accent */}
                  <line x1="0" y1="60" x2="500" y2="60" stroke="#3A3845" strokeWidth="1.5" />
                  <line x1="0" y1="60" x2="500" y2="60" stroke="rgba(25, 230, 160, 0.2)" strokeWidth="1.5" />
                  <text x="6" y="58" fill="#19E6A0" fontSize="9" fontFamily="monospace" fontWeight="bold">0dB</text>

                  <line x1="0" y1="82" x2="500" y2="82" stroke="#23212B" strokeDasharray="2 4" strokeWidth="1" />
                  <text x="6" y="80" fill="#65616F" fontSize="9" fontFamily="monospace">-6dB</text>

                  <line x1="0" y1="104" x2="500" y2="104" stroke="#23212B" strokeDasharray="3 3" strokeWidth="1" />
                  <text x="6" y="102" fill="#65616F" fontSize="9" fontFamily="monospace">-12dB</text>

                  {/* Vertical Frequency Guidelines */}
                  {bandConfigs.map((b) => (
                    <line
                      key={b.freq}
                      x1={b.x}
                      y1="10"
                      x2={b.x}
                      y2="110"
                      stroke="rgba(255, 255, 255, 0.04)"
                      strokeWidth="1"
                    />
                  ))}

                  {/* Shaded Area Under Spline */}
                  <path d={areaPath} fill="url(#eqAreaGradient)" />

                  {/* Dynamic Frequency Response Spline Curve */}
                  <path
                    d={curvePath}
                    fill="none"
                    stroke="url(#eqCurveGradient)"
                    strokeWidth="2.5"
                    filter="url(#eqGlow)"
                  />

                  {/* 5 Dynamic Frequency Response Control Points */}
                  {bandConfigs.map((b, idx) => {
                    const gain = customGains[idx] || 0;
                    const cy = dbToSvgY(gain);
                    const isBoosted = gain > 0;
                    const isCut = gain < 0;

                    return (
                      <g key={b.freq} className="transition-transform duration-75">
                        {/* Outer Glow Halo */}
                        <circle
                          cx={b.x}
                          cy={cy}
                          r={isBoosted || isCut ? "8" : "6"}
                          fill={isBoosted ? '#19E6A0' : isCut ? '#FF667A' : '#777381'}
                          fillOpacity={isBoosted || isCut ? 0.35 : 0.15}
                        />
                        {/* Inner Core Point */}
                        <circle
                          cx={b.x}
                          cy={cy}
                          r="3.5"
                          fill={isBoosted ? '#19E6A0' : isCut ? '#FF667A' : '#F4F2F7'}
                          stroke={isBoosted ? '#35F0B1' : isCut ? '#FF4D6D' : '#19E6A0'}
                          strokeWidth="1.5"
                        />
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>

            {/* 2. Precision 5-Band Studio Faders - Unified #1B2127 */}
            <div className={`relative z-10 p-5 rounded-2xl bg-[#1B2127] border ${
              isGlass ? 'border-white/[0.08]' : 'border-[#2B3540]'
            } grid grid-cols-5 gap-3 shadow-inner`}>
              {bandConfigs.map((band, idx) => {
                const gain = customGains[idx] || 0;
                const thumbTopPercent = ((12 - gain) / 24) * 100;
                const isZero = gain === 0;
                const isBoost = gain > 0;

                return (
                  <div
                    key={band.freq}
                    className="flex flex-col items-center justify-between h-56 select-none group"
                  >
                    {/* Gain Readout Badge */}
                    <div
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-mono font-semibold transition-all duration-150 ${
                        isBoost
                          ? 'text-[#19E6A0] bg-[#19E6A0]/15 border border-[#19E6A0]/35 shadow-[0_0_10px_rgba(25,230,160,0.25)]'
                          : isZero
                          ? 'text-[#8E99A6] bg-[#222A32] border border-[#2E3946]'
                          : 'text-[#FF667A] bg-[#FF667A]/15 border border-[#FF667A]/35 shadow-[0_0_10px_rgba(255,102,122,0.2)]'
                      }`}
                    >
                      {gain > 0 ? `+${gain.toFixed(1)}` : gain.toFixed(1)} dB
                    </div>

                    {/* Custom Vertical Fader Track */}
                    <div
                      onPointerDown={(e) => handleFaderPointerDown(idx, e)}
                      onPointerMove={(e) => handleFaderPointerMove(idx, e)}
                      onPointerUp={handleFaderPointerUp}
                      onDoubleClick={() => setCustomGain(idx, 0)}
                      className="relative w-8 h-36 flex items-center justify-center cursor-pointer touch-none"
                      title={`${band.label} (${band.freq}): ${gain} dB (Double-click to reset)`}
                    >
                      {/* Vertical Slot Groove */}
                      <div className="w-2.5 h-full bg-[#14181D] rounded-full relative overflow-hidden border border-[#26303A] shadow-inner">
                        {/* Zero Reference Notch */}
                        <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-[#3A4756] -translate-y-1/2 z-10" />

                        {/* Active Gain Fill Bar */}
                        {isBoost ? (
                          <div
                            className="absolute left-0 right-0 bg-gradient-to-t from-[#19E6A0] to-[#35F0B1] rounded-t-full shadow-[0_0_8px_rgba(25,230,160,0.5)] transition-all duration-75"
                            style={{
                              bottom: '50%',
                              height: `${(gain / 12) * 50}%`,
                            }}
                          />
                        ) : !isZero ? (
                          <div
                            className="absolute left-0 right-0 bg-gradient-to-b from-[#FF667A] to-[#FF4D6D] rounded-b-full shadow-[0_0_8px_rgba(255,102,122,0.4)] transition-all duration-75"
                            style={{
                              top: '50%',
                              height: `${(-gain / 12) * 50}%`,
                            }}
                          />
                        ) : null}
                      </div>

                      {/* Hardware Fader Thumb Knob with Unified #1B2127 Tone */}
                      <div
                        className={`absolute w-7 h-4.5 rounded-lg shadow-xl border flex items-center justify-center transition-transform hover:scale-110 active:scale-95 cursor-grab active:cursor-grabbing ${
                          isBoost
                            ? 'bg-gradient-to-b from-[#2B3540] to-[#202831] border-[#19E6A0] shadow-[0_0_12px_rgba(25,230,160,0.4)]'
                            : isZero
                            ? 'bg-gradient-to-b from-[#2B3540] to-[#202831] border-[#3C4A5A] hover:border-[#19E6A0]/60'
                            : 'bg-gradient-to-b from-[#2B3540] to-[#202831] border-[#FF667A] shadow-[0_0_12px_rgba(255,102,122,0.35)]'
                        }`}
                        style={{
                          top: `calc(${thumbTopPercent}% - 9px)`,
                        }}
                      >
                        {/* Center Indicator Line */}
                        <div
                          className={`w-3.5 h-[2px] rounded-full transition-colors ${
                            isBoost
                              ? 'bg-[#19E6A0] shadow-[0_0_4px_rgba(25,230,160,0.8)]'
                              : isZero
                              ? 'bg-[#8E99A6]'
                              : 'bg-[#FF667A] shadow-[0_0_4px_rgba(255,102,122,0.8)]'
                          }`}
                        />
                      </div>
                    </div>

                    {/* Bottom Frequency & Label */}
                    <div className="text-center group-hover:scale-105 transition-transform duration-150">
                      <span className="block text-xs font-bold text-[#F4F2F7] tracking-tight group-hover:text-[#19E6A0] transition-colors">
                        {band.freq}
                      </span>
                      <span className="block text-[10px] font-semibold text-[#8E99A6] uppercase tracking-wider">
                        {band.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 3. Preset Selector Pills */}
            <div className="relative z-10 space-y-2">
              <div className="flex items-center justify-between text-xs px-1">
                <span className="text-[11px] font-semibold text-[#8E99A6] uppercase tracking-wider flex items-center gap-1.5">
                  Acoustic Presets
                </span>
                <span className="text-[11px] text-[#6C7989] font-mono">
                  Double-click fader to reset 0 dB
                </span>
              </div>

              <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                {EQUALIZER_PRESETS.map((p) => {
                  const isActive = equalizerPreset.toLowerCase() === p.name.toLowerCase();
                  return (
                    <button
                      key={p.name}
                      onClick={() => setPreset(p.name)}
                      className={`px-2.5 py-2 rounded-xl text-xs font-medium transition-all duration-200 cursor-pointer text-center truncate active:scale-95 ${
                        isActive
                          ? 'bg-[#19E6A0] text-black font-semibold shadow-[0_0_14px_rgba(25,230,160,0.4)] border border-[#19E6A0] scale-[1.02]'
                          : 'bg-[#222A32] text-[#8E99A6] hover:text-[#F4F2F7] hover:bg-[#2B3540] border border-[#2E3946]'
                      }`}
                      title={p.name}
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};
