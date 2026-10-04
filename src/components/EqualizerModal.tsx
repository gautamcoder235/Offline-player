import React, { useRef } from 'react';
import { Sliders, X, RotateCcw } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { EQUALIZER_PRESETS } from '../services/audioEngine';

interface EqualizerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EqualizerModal: React.FC<EqualizerModalProps> = ({ isOpen, onClose }) => {
  const { equalizerPreset, setPreset, customGains, setCustomGain } = usePlayer();
  const draggingBandRef = useRef<number | null>(null);

  if (!isOpen) return null;

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
    setPreset('Flat');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md select-none transition-opacity duration-200 p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-2xl bg-[#16151C] p-6 border border-[#292731] shadow-2xl flex flex-col gap-5 text-[#F4F2F7] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#292731]">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-[#100F14] text-[#19E6A0] border border-[#292731] shadow-inner">
              <Sliders className="w-5 h-5 text-[#19E6A0]" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#F4F2F7] tracking-tight">Audio Equalizer</h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="px-2.5 py-1.5 rounded-lg text-xs text-[#777381] hover:text-[#F4F2F7] hover:bg-[#1D1C23] border border-[#292731] transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Reset all bands to 0 dB Flat"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#777381] hover:text-[#F4F2F7] hover:bg-[#1D1C23] transition-colors cursor-pointer"
              aria-label="Close Equalizer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 1. Interactive Frequency Response Curve (SVG Graph) */}
        <div className="w-full rounded-xl bg-[#100F14] border border-[#292731] p-3 relative overflow-hidden shadow-inner">
          {/* Top Info Header */}
          <div className="flex items-center justify-between text-[10px] text-[#777381] mb-1 font-mono">
            <span>20 Hz</span>
            <span className="text-[#E8C77A] font-semibold">ACOUSTIC FREQUENCY RESPONSE</span>
            <span>20 kHz</span>
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
                  <stop offset="100%" stopColor="#E8C77A" />
                </linearGradient>

                {/* Shaded Area Fill */}
                <linearGradient id="eqAreaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="rgba(25, 230, 160, 0.25)" />
                  <stop offset="50%" stopColor="rgba(25, 230, 160, 0.08)" />
                  <stop offset="100%" stopColor="rgba(25, 230, 160, 0)" />
                </linearGradient>

                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* dB Horizontal Guidelines */}
              {/* +12 dB */}
              <line x1="0" y1="16" x2="500" y2="16" stroke="#292731" strokeDasharray="3 3" strokeWidth="1" />
              <text x="6" y="14" fill="#65616F" fontSize="9" fontFamily="monospace">+12dB</text>

              {/* +6 dB */}
              <line x1="0" y1="38" x2="500" y2="38" stroke="#292731" strokeDasharray="2 4" strokeWidth="1" />
              <text x="6" y="36" fill="#65616F" fontSize="9" fontFamily="monospace">+6dB</text>

              {/* 0 dB Baseline (Neutral Reference) */}
              <line x1="0" y1="60" x2="500" y2="60" stroke="#3A3845" strokeWidth="1.5" />
              <text x="6" y="58" fill="#9A96A5" fontSize="9" fontFamily="monospace" fontWeight="bold">0dB</text>

              {/* -6 dB */}
              <line x1="0" y1="82" x2="500" y2="82" stroke="#292731" strokeDasharray="2 4" strokeWidth="1" />
              <text x="6" y="80" fill="#65616F" fontSize="9" fontFamily="monospace">-6dB</text>

              {/* -12 dB */}
              <line x1="0" y1="104" x2="500" y2="104" stroke="#292731" strokeDasharray="3 3" strokeWidth="1" />
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
                filter="url(#glow)"
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
                      r="7"
                      fill={isBoosted ? '#19E6A0' : isCut ? '#FF667A' : '#777381'}
                      fillOpacity="0.25"
                    />
                    {/* Inner Core Point */}
                    <circle
                      cx={b.x}
                      cy={cy}
                      r="3.5"
                      fill={isBoosted ? '#E8C77A' : '#F4F2F7'}
                      stroke={isBoosted ? '#19E6A0' : '#292731'}
                      strokeWidth="1.5"
                    />
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* 2. Precision 5-Band Studio Faders (Zero Clipping Layout) */}
        <div className="p-4 rounded-xl bg-[#100F14] border border-[#292731] grid grid-cols-5 gap-3">
          {bandConfigs.map((band, idx) => {
            const gain = customGains[idx] || 0;
            // 0 dB is at 50% height. -12dB is 100%, +12dB is 0%
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
                  className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold transition-colors ${
                    isBoost
                      ? gain > 6
                        ? 'text-[#E8C77A] bg-[#E8C77A]/10 border border-[#E8C77A]/20'
                        : 'text-[#19E6A0] bg-[#19E6A0]/10 border border-[#19E6A0]/20'
                      : isZero
                      ? 'text-[#777381] bg-[#16151C] border border-[#292731]'
                      : 'text-[#FF667A] bg-[#FF667A]/10 border border-[#FF667A]/20'
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
                  title={`${band.label} (${band.freq}): ${gain} dB (Double click to zero)`}
                >
                  {/* Vertical Slot Groove */}
                  <div className="w-2 h-full bg-[#1A1822] rounded-full relative overflow-hidden border border-[#292731]">
                    {/* Zero Reference Notch */}
                    <div className="absolute top-1/2 left-0 right-0 h-[1.5px] bg-[#65616F] -translate-y-1/2 z-10" />

                    {/* Active Gain Fill Bar */}
                    {isBoost ? (
                      <div
                        className="absolute left-0 right-0 bg-gradient-to-t from-[#19E6A0] to-[#E8C77A] rounded-t-full transition-all duration-75"
                        style={{
                          bottom: '50%',
                          height: `${(gain / 12) * 50}%`,
                        }}
                      />
                    ) : !isZero ? (
                      <div
                        className="absolute left-0 right-0 bg-[#FF667A] rounded-b-full transition-all duration-75"
                        style={{
                          top: '50%',
                          height: `${(-gain / 12) * 50}%`,
                        }}
                      />
                    ) : null}
                  </div>

                  {/* Hardware Fader Thumb Knob */}
                  <div
                    className={`absolute w-7 h-4 rounded-md shadow-lg border flex items-center justify-center transition-transform hover:scale-105 active:scale-95 cursor-grab active:cursor-grabbing ${
                      isBoost
                        ? 'bg-[#211F26] border-[#19E6A0] shadow-[0_0_8px_rgba(25,230,160,0.3)]'
                        : isZero
                        ? 'bg-[#1D1C23] border-[#3A3845]'
                        : 'bg-[#211F26] border-[#FF667A]'
                    }`}
                    style={{
                      top: `calc(${thumbTopPercent}% - 8px)`,
                    }}
                  >
                    {/* Center Grip Line */}
                    <div
                      className={`w-3.5 h-[1.5px] rounded-full ${
                        isBoost ? 'bg-[#19E6A0]' : isZero ? 'bg-[#777381]' : 'bg-[#FF667A]'
                      }`}
                    />
                  </div>
                </div>

                {/* Bottom Frequency & Label */}
                <div className="text-center">
                  <span className="block text-xs font-bold text-[#F4F2F7] tracking-tight">
                    {band.freq}
                  </span>
                  <span className="block text-[10px] font-medium text-[#777381] uppercase tracking-wider">
                    {band.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* 3. Preset Selector Pills (Clean symmetrical layout) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[11px] font-semibold text-[#777381] uppercase tracking-wider">
              Acoustic Presets
            </span>
            <span className="text-[11px] text-[#65616F]">
              Double-click any fader to zero
            </span>
          </div>

          <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
            {EQUALIZER_PRESETS.map((p) => {
              const isActive = equalizerPreset.toLowerCase() === p.name.toLowerCase();
              return (
                <button
                  key={p.name}
                  onClick={() => setPreset(p.name)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors duration-150 cursor-pointer text-center truncate ${
                    isActive
                      ? 'bg-[#19181F] text-[#19E6A0] border border-[#19E6A0]/50 shadow-sm font-semibold'
                      : 'bg-[#100F14] text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#16151C] border border-[#292731]'
                  }`}
                  title={p.name}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
