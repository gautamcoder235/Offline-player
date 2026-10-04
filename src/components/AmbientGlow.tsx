import React from 'react';
import { usePlayer } from '../context/PlayerContext';
import { getTrackColor } from '../utils/helpers';

export const AmbientGlow: React.FC = () => {
  const { currentTrack, isPlaying } = usePlayer();

  const trackColor = currentTrack ? getTrackColor(currentTrack.title, currentTrack.artist) : null;

  return (
    <div
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden bg-[#0B0A0F]"
      aria-hidden="true"
    >
      {/* 1. Permanent subtle dual ambient gradient: Electric Mint (top right) & Champagne Gold (left) */}
      <div
        className="absolute inset-0"
        style={{
          background: `
            radial-gradient(700px circle at 75% 5%, rgba(25, 230, 160, 0.035), transparent 60%),
            radial-gradient(600px circle at 15% 25%, rgba(232, 199, 122, 0.018), transparent 60%)
          `,
        }}
      />

      {/* 2. When a track plays: extremely soft ambient aura extracted from cover artwork */}
      {currentTrack?.cover_art ? (
        <div
          className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000 transform scale-110 pointer-events-none"
          style={{
            backgroundImage: `url(${currentTrack.cover_art})`,
            filter: 'blur(90px) brightness(0.28) saturate(1.4)',
            opacity: isPlaying ? 0.22 : 0.08,
          }}
        />
      ) : trackColor ? (
        <div
          className="w-[100%] h-[100%] -top-[10%] left-[10%] absolute transition-opacity duration-1000 pointer-events-none"
          style={{
            background: `radial-gradient(circle at 50% 20%, ${trackColor.glow} 0%, transparent 60%)`,
            filter: 'blur(80px)',
            opacity: isPlaying ? 0.16 : 0.06,
          }}
        />
      ) : null}

      {/* 3. Deep obsidian vignette to ground all edges firmly in #0B0A0F */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0B0A0F]/20 via-transparent to-[#0B0A0F]/80 pointer-events-none" />
    </div>
  );
};
