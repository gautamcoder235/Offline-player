import React, { useEffect, useRef, useState } from 'react';
import { Radio, X, Activity, BarChart2, Disc3 } from 'lucide-react';
import { audioEngine } from '../services/audioEngine';
import { usePlayer } from '../context/PlayerContext';

interface VisualizerCanvasProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VisualizerCanvas: React.FC<VisualizerCanvasProps> = ({ isOpen, onClose }) => {
  const { currentTrack, isPlaying } = usePlayer();
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
        const gap = 4;
        const totalBarWidth = (width - gap * (barCount - 1)) / barCount;
        const barWidth = Math.max(2, totalBarWidth);

        for (let i = 0; i < barCount; i++) {
          const sampleIdx = Math.floor((i / barCount) * (bufferLength / 2));
          const val = dataArray[sampleIdx] || 0;
          const barHeight = isPlaying ? Math.max(4, (val / 255) * (height - 20)) : 4;
          const x = i * (barWidth + gap);
          const y = height - barHeight;

          // Glowing gradient
          const grad = ctx.createLinearGradient(0, height, 0, y);
          grad.addColorStop(0, '#10b981'); // Emerald
          grad.addColorStop(0.5, '#06b6d4'); // Cyan
          grad.addColorStop(1, '#a855f7'); // Purple

          ctx.fillStyle = grad;
          ctx.shadowBlur = isPlaying ? 12 : 2;
          ctx.shadowColor = '#06b6d4';

          ctx.beginPath();
          ctx.roundRect(x, y, barWidth, barHeight, [4, 4, 0, 0]);
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
          grad.addColorStop(0, '#a855f7');
          grad.addColorStop(0.5, '#10b981');
          grad.addColorStop(1, '#a855f7');

          ctx.fillStyle = grad;
          ctx.shadowBlur = isPlaying ? 10 : 2;
          ctx.shadowColor = '#10b981';

          ctx.beginPath();
          ctx.roundRect(x, centerY - halfH, barWidth, halfH * 2, [3, 3, 3, 3]);
          ctx.fill();
        }
      } else if (visMode === 'wave') {
        audioEngine.getTimeDomainData(dataArray);

        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#34d399';
        ctx.shadowBlur = isPlaying ? 14 : 2;
        ctx.shadowColor = '#34d399';

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

        ctx.lineTo(width, height / 2);
        ctx.stroke();
      }

      ctx.restore();
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isOpen, visMode, isPlaying]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md select-none animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl glass-panel-elevated rounded-3xl p-6 border border-white/10 shadow-2xl flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Radio className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Real-Time Audio Visualizer
              </h2>
              <p className="text-xs text-gray-400">
                {currentTrack ? `${currentTrack.title} — ${currentTrack.artist}` : 'No track active'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Visualizer Mode Switcher */}
            <div className="flex bg-white/5 p-1 rounded-xl border border-white/5 text-xs">
              <button
                onClick={() => setVisMode('bars')}
                className={`px-3 py-1 rounded-lg flex items-center gap-1.5 transition-all ${
                  visMode === 'bars' ? 'bg-white/10 text-white font-medium shadow' : 'text-gray-400 hover:text-white'
                }`}
              >
                <BarChart2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Spectrum</span>
              </button>
              <button
                onClick={() => setVisMode('mirror')}
                className={`px-3 py-1 rounded-lg flex items-center gap-1.5 transition-all ${
                  visMode === 'mirror' ? 'bg-white/10 text-white font-medium shadow' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Disc3 className="w-3.5 h-3.5 text-purple-400" />
                <span>Mirror</span>
              </button>
              <button
                onClick={() => setVisMode('wave')}
                className={`px-3 py-1 rounded-lg flex items-center gap-1.5 transition-all ${
                  visMode === 'wave' ? 'bg-white/10 text-white font-medium shadow' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                <span>Wave</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Canvas Display */}
        <div className="relative w-full h-64 rounded-2xl bg-black/50 border border-white/5 overflow-hidden flex items-center justify-center">
          <canvas ref={canvasRef} className="w-full h-full block" />
        </div>
      </div>
    </div>
  );
};
