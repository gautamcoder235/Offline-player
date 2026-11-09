import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Radio, Activity, BarChart2, Disc3 } from 'lucide-react';
import { audioEngine } from '../services/audioEngine';
import { usePlayer } from '../context/PlayerContext';
import { AnimatedClose } from './icons';

interface VisualizerCanvasProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VisualizerCanvas: React.FC<VisualizerCanvasProps> = ({ isOpen, onClose }) => {
  const { currentTrack, isPlaying, themeAppearance } = usePlayer();
  const isGlass = themeAppearance === 'aura_glass';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [visMode, setVisMode] = useState<'bars' | 'wave' | 'mirror'>('bars');

  useEffect(() => {
    if (!isOpen) return;

    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = 128;
    const dataArray = new Uint8Array(bufferLength);

    const render = () => {
      animId = requestAnimationFrame(render);

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      if (visMode === 'bars') {
        audioEngine.getFrequencyData(dataArray);

        const barCount = 48;
        const gap = 3;
        const barWidth = (width - gap * (barCount - 1)) / barCount;

        for (let i = 0; i < barCount; i++) {
          const sampleIdx = Math.floor((i / barCount) * (bufferLength / 2));
          const val = dataArray[sampleIdx] || 0;
          const barHeight = isPlaying ? Math.max(3, ((val / 255) * height) * 0.95) : 3;
          const x = i * (barWidth + gap);
          const y = height - barHeight;

          // Electric Mint to Champagne Gold peak gradient
          const grad = ctx.createLinearGradient(0, height, 0, y);
          grad.addColorStop(0, '#19E6A0'); // Electric Mint base
          grad.addColorStop(0.7, '#35F0B1');
          grad.addColorStop(1, '#E8C77A'); // Champagne Gold peak

          ctx.fillStyle = grad;
          ctx.shadowBlur = isPlaying ? 10 : 2;
          ctx.shadowColor = 'rgba(25, 230, 160, 0.45)';

          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, [3, 3, 0, 0]);
          ctx.fill();
        }
      } else if (visMode === 'mirror') {
        audioEngine.getFrequencyData(dataArray);

        const barCount = 40;
        const gap = 3;
        const barWidth = (width - gap * (barCount - 1)) / barCount;
        const centerY = height / 2;

        for (let i = 0; i < barCount; i++) {
          const sampleIdx = Math.floor((i / barCount) * (bufferLength / 2));
          const val = dataArray[sampleIdx] || 0;
          const halfH = isPlaying ? Math.max(3, ((val / 255) * centerY) * 0.9) : 3;
          const x = i * (barWidth + gap);

          const grad = ctx.createLinearGradient(0, centerY - halfH, 0, centerY + halfH);
          grad.addColorStop(0, '#E8C77A'); // Champagne Gold peak
          grad.addColorStop(0.5, '#19E6A0'); // Mint center
          grad.addColorStop(1, '#E8C77A'); // Champagne Gold peak

          ctx.fillStyle = grad;
          ctx.shadowBlur = isPlaying ? 10 : 2;
          ctx.shadowColor = 'rgba(25, 230, 160, 0.4)';

          ctx.beginPath();
          ctx.roundRect(x, centerY - halfH, barWidth, halfH * 2, [3, 3, 3, 3]);
          ctx.fill();
        }
      } else if (visMode === 'wave') {
        audioEngine.getTimeDomainData(dataArray);

        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#19E6A0';
        ctx.shadowBlur = isPlaying ? 12 : 3;
        ctx.shadowColor = 'rgba(25, 230, 160, 0.5)';

        ctx.beginPath();
        const sliceWidth = width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = isPlaying ? dataArray[i] / 128.0 : 1.0;
          const y = (v * height) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
          x += sliceWidth;
        }

        ctx.stroke();

        // Soft ambient gradient glow underneath the wave
        if (isPlaying) {
          ctx.lineTo(width, height);
          ctx.lineTo(0, height);
          ctx.closePath();
          const fill = ctx.createLinearGradient(0, height / 2, 0, height);
          fill.addColorStop(0, 'rgba(25, 230, 160, 0.12)');
          fill.addColorStop(0.5, 'rgba(127, 90, 240, 0.05)');
          fill.addColorStop(1, 'rgba(0, 0, 0, 0)');
          ctx.fillStyle = fill;
          ctx.fill();
        }
      }

      ctx.restore();
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isOpen, visMode, isPlaying]);

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
            className={`relative w-full max-w-3xl rounded-2xl ${
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
                  <Radio className={`w-4 h-4 ${isPlaying ? 'animate-pulse' : ''}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-[#F4F2F7] tracking-tight">Audio Visualizer</h2>
                    <span className="w-1.5 h-1.5 rounded-full bg-[#19E6A0] animate-pulse" />
                  </div>
                  <p className="text-xs text-[#8E99A6] truncate max-w-md mt-0.5">
                    {currentTrack ? `${currentTrack.title} — ${currentTrack.artist}` : 'Real-time frequency rendering'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                {/* Mode Switcher */}
                <div className="flex bg-[#222A32] p-1 rounded-xl border border-[#2E3946] text-xs gap-1">
                  {[
                    { id: 'bars', label: 'Spectrum', icon: BarChart2 },
                    { id: 'mirror', label: 'Mirror', icon: Disc3 },
                    { id: 'wave', label: 'Wave', icon: Activity },
                  ].map(({ id, label, icon: Icon }) => {
                    const active = visMode === id;
                    return (
                      <button
                        key={id}
                        onClick={() => setVisMode(id as any)}
                        className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all duration-200 cursor-pointer ${
                          active
                            ? 'bg-[#19E6A0]/15 text-[#19E6A0] font-semibold border border-[#19E6A0]/30 shadow-[0_0_12px_rgba(25,230,160,0.2)]'
                            : 'text-[#8E99A6] hover:text-[#F4F2F7] hover:bg-white/[0.04]'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Close Button with Danger Red Hover */}
                <button
                  onClick={onClose}
                  className="p-2 rounded-xl text-[#8E8A99] hover:text-[#FF667A] hover:bg-[#FF667A]/10 border border-transparent hover:border-[#FF667A]/25 transition-all duration-200 cursor-pointer"
                  aria-label="Close visualizer"
                >
                  <AnimatedClose className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Canvas Display with Unified #1B2127 Ambient Backdrop */}
            <div className="relative w-full h-72 rounded-xl bg-[#14181D] border border-[#26303A] overflow-hidden flex items-center justify-center shadow-inner">
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 bg-[#19E6A0]/[0.05] rounded-full blur-3xl" />
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,#14181D_90%)]" />
              </div>
              <canvas ref={canvasRef} className="relative z-10 w-full h-full block" />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
};
