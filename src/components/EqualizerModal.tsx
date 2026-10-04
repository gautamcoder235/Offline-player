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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md select-none transition-opacity duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl bg-[#16151C] p-6 border border-[#292731] shadow-2xl flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#292731]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-[#14131A] text-[#19E6A0] border border-[#282631]">
              <Sliders className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#F4F2F7] tracking-tight">Audio Equalizer</h2>
              <p className="text-[11px] text-[#777381]">5-band frequency shaping</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#777381] hover:text-[#F4F2F7] hover:bg-[#1D1C23] transition-colors cursor-pointer"
            aria-label="Close Equalizer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Preset Selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-[#777381] uppercase tracking-wider">
              Presets
            </span>
            <button
              onClick={() => setPreset('Flat')}
              className="flex items-center gap-1 text-[11px] text-[#777381] hover:text-[#F4F2F7] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {EQUALIZER_PRESETS.map((p) => {
              const isActive = equalizerPreset.toLowerCase() === p.name.toLowerCase();
              return (
                <button
                  key={p.name}
                  onClick={() => setPreset(p.name)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors duration-150 cursor-pointer ${
                    isActive
                      ? 'bg-[#211F26] text-[#19E6A0] border border-[#19E6A0]/40'
                      : 'bg-[#14131A] text-[#AAA6B2] hover:text-[#F4F2F7] hover:bg-[#1D1C23] border border-[#282631]'
                  }`}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sliders */}
        <div className="p-4 rounded-xl bg-[#100F14] border border-[#282631] flex justify-between items-end gap-3 h-52">
          {bandLabels.map((band, idx) => {
            const gain = customGains[idx] || 0;
            return (
              <div key={band.freq} className="flex-1 flex flex-col items-center justify-between h-full">
                <span className="text-[10px] font-mono text-[#777381]">
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
                      width: '90px',
                    }}
                    aria-label={`${band.name} EQ`}
                  />
                </div>

                <div className="text-center">
                  <span className="block text-[11px] font-medium text-[#F4F2F7]">{band.freq}</span>
                  <span className="block text-[9px] text-[#65616F]">{band.name}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
