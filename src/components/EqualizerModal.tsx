import React from 'react';
import { Sliders, X, RotateCcw } from 'lucide-react';
import { usePlayer } from '../context/PlayerContext';
import { EQUALIZER_PRESETS } from '../services/audioEngine';

interface EqualizerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EqualizerModal: React.FC<EqualizerModalProps> = ({ isOpen, onClose }) => {
  const { equalizerPreset, setPreset, customGains, setCustomGain } = usePlayer();

  if (!isOpen) return null;

  const bandLabels = [
    { freq: '60 Hz', name: 'Sub Bass' },
    { freq: '250 Hz', name: 'Bass' },
    { freq: '1 kHz', name: 'Mids' },
    { freq: '4 kHz', name: 'Treble' },
    { freq: '14 kHz', name: 'Air' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md select-none animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg glass-panel-elevated rounded-3xl p-6 border border-white/10 shadow-2xl flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">Audio Equalizer</h2>
              <p className="text-xs text-gray-400">Fine-tune frequencies & audio dynamics</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Preset Selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Presets
            </span>
            <button
              onClick={() => setPreset('Flat')}
              className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-white transition-colors"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {EQUALIZER_PRESETS.map((p) => (
              <button
                key={p.name}
                onClick={() => setPreset(p.name)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
                  equalizerPreset.toLowerCase() === p.name.toLowerCase()
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow'
                    : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-white/5'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Sliders */}
        <div className="p-4 rounded-2xl bg-black/40 border border-white/5 flex justify-between items-end gap-3 h-52">
          {bandLabels.map((band, idx) => {
            const gain = customGains[idx] || 0;
            return (
              <div key={band.freq} className="flex-1 flex flex-col items-center justify-between h-full">
                <span className="text-[10px] font-mono text-gray-400">
                  {gain > 0 ? `+${gain}` : gain} dB
                </span>

                <div className="relative flex-1 flex items-center justify-center my-2">
                  <input
                    type="range"
                    min="-12"
                    max="12"
                    step="0.5"
                    value={gain}
                    onChange={(e) => setCustomGain(idx, parseFloat(e.target.value))}
                    className="slider-track appearance-none cursor-pointer"
                    style={{
                      transform: 'rotate(-90deg)',
                      width: '100px',
                    }}
                  />
                </div>

                <div className="text-center">
                  <span className="block text-xs font-semibold text-white">{band.freq}</span>
                  <span className="block text-[9px] text-gray-500">{band.name}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
