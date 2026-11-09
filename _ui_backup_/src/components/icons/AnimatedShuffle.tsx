import React from 'react';

export interface AnimatedShuffleProps {
  className?: string;
  size?: number;
  active?: boolean;
}

export const AnimatedShuffle: React.FC<AnimatedShuffleProps> = ({
  className = 'w-3.5 h-3.5',
  size = 24,
  active = false,
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`animated-shuffle-icon ${active ? 'is-active' : ''} ${className}`}
    >
      {/* Track 1: Diagonal crossing track (bottom-left to top-right) */}
      <path
        d="M2 18h1.97a4 4 0 0 0 3.3-1.7l5.45-8.6a4 4 0 0 1 3.3-1.7H21"
        className="shuffle-track shuffle-track-1"
      />

      {/* Track 2: Diagonal crossing track (top-left to bottom-right) */}
      <path
        d="M2 6h1.97a4 4 0 0 1 3.3 1.7l5.45 8.6a4 4 0 0 0 3.3 1.7H21"
        className="shuffle-track shuffle-track-2"
      />

      {/* Upper Arrowhead */}
      <path
        d="m18 2 4 4-4 4"
        className="shuffle-arrow shuffle-arrow-upper"
      />

      {/* Lower Arrowhead */}
      <path
        d="m18 14 4 4-4 4"
        className="shuffle-arrow shuffle-arrow-lower"
      />
    </svg>
  );
};
