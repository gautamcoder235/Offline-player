import React from 'react';

export interface AnimatedDicesProps {
  className?: string;
  size?: number;
  strokeWidth?: number;
  isRolling?: boolean;
}

export const AnimatedDices: React.FC<AnimatedDicesProps> = ({
  className = 'w-4 h-4',
  size = 24,
  strokeWidth = 1.5,
  isRolling = false,
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`animated-dices-icon ${isRolling ? 'is-rolling' : ''} ${className}`}
    >
      {/* Back Die Cube (Tilted Upper-Right Die: tumbles 45° on hover with mint glow) */}
      <g className="dice-cube dice-back">
        <path
          d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6"
          className="dice-body"
        />
        <path d="M15 6h.01" className="dice-pip" strokeWidth={strokeWidth + 1} />
        <path d="M18 9h.01" className="dice-pip" strokeWidth={strokeWidth + 1} />
      </g>

      {/* Front Die Cube (Lower-Left Die: rolls and bumps on hover) */}
      <g className="dice-cube dice-front">
        <rect
          width="12"
          height="12"
          x="2"
          y="10"
          rx="2"
          ry="2"
          className="dice-body"
        />
        <path d="M6 18h.01" className="dice-pip" strokeWidth={strokeWidth + 1} />
        <path d="M10 14h.01" className="dice-pip" strokeWidth={strokeWidth + 1} />
      </g>
    </svg>
  );
};
