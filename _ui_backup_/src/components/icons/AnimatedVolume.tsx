import React from 'react';

export interface AnimatedVolumeProps {
  className?: string;
  size?: number;
  volume?: number; // 0 to 1
  isMuted?: boolean;
  level?: 'mute' | 'low' | 'high';
}

export const AnimatedVolume: React.FC<AnimatedVolumeProps> = ({
  className = 'w-4 h-4',
  size = 24,
  volume,
  isMuted = false,
  level,
}) => {
  // Determine effective state
  const isMuteState = isMuted || volume === 0 || level === 'mute';
  const isLowState = !isMuteState && (level === 'low' || (volume !== undefined && volume < 0.5));
  const isHighState = !isMuteState && !isLowState;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`animated-volume-icon ${isMuteState ? 'is-muted' : isLowState ? 'is-low' : 'is-high'} ${className}`}
    >
      {/* Speaker Cone (Polygon) */}
      <polygon
        points="11 5 6 9 2 9 2 15 6 15 11 19"
        className="volume-cone"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinejoin="round"
      />

      {/* Mute Scissor Cross */}
      {isMuteState && (
        <g className="volume-cross-group">
          <line x1="22" y1="9" x2="16" y2="15" className="volume-cross volume-cross-1" />
          <line x1="16" y1="9" x2="22" y2="15" className="volume-cross volume-cross-2" />
        </g>
      )}

      {/* Wave Arcs (Active when not muted) */}
      {!isMuteState && (
        <>
          {/* Inner Wave Arc (Wave 1) */}
          <path
            d="M15.5 8.5a5 5 0 0 1 0 7"
            className="volume-wave volume-wave-1"
          />

          {/* Outer Wave Arc (Wave 2) - only visible in high volume */}
          {isHighState && (
            <path
              d="M19 5a9 9 0 0 1 0 14"
              className="volume-wave volume-wave-2"
            />
          )}
        </>
      )}
    </svg>
  );
};
