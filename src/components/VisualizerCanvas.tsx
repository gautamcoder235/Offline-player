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
          ctx.shadowBlur = isPlaying ? 8 : 1;
          ctx.shadowColor = 'rgba(25, 230, 160, 0.4)';

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
          ctx.shadowBlur = isPlaying ? 8 : 1;
          ctx.shadowColor = 'rgba(25, 230, 160, 0.35)';

          ctx.beginPath();
          ctx.roundRect(x, centerY - halfH, barWidth, halfH * 2, [3, 3, 3, 3]);
          ctx.fill();
        }
      } else if (visMode === 'wave') {
        audioEngine.getTimeDomainData(dataArray);

        ctx.lineWidth = 2;
        ctx.strokeStyle = '#19E6A0';
        ctx.shadowBlur = isPlaying ? 10 : 2;
        ctx.shadowColor = 'rgba(25, 230, 160, 0.4)';

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md select-none transition-opacity duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl rounded-2xl bg-[#16151C] p-6 border border-[#292731] shadow-2xl flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#292731]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#14131A] text-[#19E6A0] border border-[#282631]">
              <Radio className={`w-4 h-4 ${isPlaying ? 'animate-pulse' : ''}`} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#F4F2F7] tracking-tight">
                Audio Visualizer
              </h2>
              <p className="text-[11px] text-[#777381]">
                {currentTrack ? `${currentTrack.title} — ${currentTrack.artist}` : 'No track active'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode Switcher */}
            <div className="flex bg-[#14131A] p-0.5 rounded-lg border border-[#282631] text-xs">
              <button
                onClick={() => setVisMode('bars')}
                className={`px-2.5 py-1 rounded-md flex items-center gap-1.5 transition-colors duration-150 cursor-pointer ${
                  visMode === 'bars' ? 'bg-[#211F26] text-[#19E6A0] font-medium' : 'text-[#777381] hover:text-[#F4F2F7]'
                }`}
              >
                <BarChart2 className="w-3.5 h-3.5" />
                <span>Spectrum</span>
              </button>
              <button
                onClick={() => setVisMode('mirror')}
                className={`px-2.5 py-1 rounded-md flex items-center gap-1.5 transition-colors duration-150 cursor-pointer ${
                  visMode === 'mirror' ? 'bg-[#211F26] text-[#19E6A0] font-medium' : 'text-[#777381] hover:text-[#F4F2F7]'
                }`}
              >
                <Disc3 className="w-3.5 h-3.5" />
                <span>Mirror</span>
              </button>
              <button
                onClick={() => setVisMode('wave')}
                className={`px-2.5 py-1 rounded-md flex items-center gap-1.5 transition-colors duration-150 cursor-pointer ${
                  visMode === 'wave' ? 'bg-[#211F26] text-[#19E6A0] font-medium' : 'text-[#777381] hover:text-[#F4F2F7]'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Wave</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1 rounded-lg text-[#777381] hover:text-[#F4F2F7] hover:bg-[#1D1C23] transition-colors cursor-pointer"
              aria-label="Close visualizer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Canvas Display */}
        <div className="relative w-full h-64 rounded-xl bg-[#100F14] border border-[#282631] overflow-hidden flex items-center justify-center">
          <canvas ref={canvasRef} className="w-full h-full block" />
        </div>
      </div>
    </div>
  );
};
