import React, { useMemo } from 'react';
import { usePlayer } from '../context/PlayerContext';
import { getTrackColor } from '../utils/helpers';

export const AmbientGlow: React.FC = () => {
  const { currentTrack, isPlaying } = usePlayer();

  const glowStyle = useMemo(() => {
    if (!currentTrack) {
      return {
        background: 'radial-gradient(circle at 50% 20%, rgba(30, 215, 96, 0.12) 0%, rgba(11, 12, 16, 0) 70%)',
      };
    }

    const { glow } = getTrackColor(currentTrack.title, currentTrack.artist);

    return {
      background: `radial-gradient(circle at 50% 15%, ${glow} 0%, rgba(15, 23, 42, 0.25) 50%, rgba(11, 12, 16, 0) 80%)`,
      filter: 'blur(80px)',
      opacity: isPlaying ? 0.85 : 0.45,
      transition: 'all 1.2s cubic-bezier(0.16, 1, 0.3, 1)',
    };
  }, [currentTrack, isPlaying]);

  return (
    <div
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
      aria-hidden="true"
    >
      {/* Blurred album cover art backdrop */}
      {currentTrack?.cover_art && (
        <div
          className="absolute inset-0 bg-cover bg-center transition-all duration-1000 transform scale-125 pointer-events-none"
          style={{
            backgroundImage: `url(${currentTrack.cover_art})`,
            filter: 'blur(100px) brightness(0.35) saturate(1.8)',
            opacity: isPlaying ? 0.35 : 0.18,
          }}
        />
      )}

      {/* Dynamic color-tuned radial glow */}
      <div
        className="w-[120%] h-[120%] -top-[10%] -left-[10%] absolute transition-all duration-1000"
        style={glowStyle}
      />
      {/* Subtle vignette overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0b0c10]/40 to-[#0b0c10] pointer-events-none" />
    </div>
  );
};
