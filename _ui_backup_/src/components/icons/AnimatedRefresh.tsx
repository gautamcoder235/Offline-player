import React from 'react';

export interface AnimatedRefreshProps {
  className?: string;
  size?: number;
  isSpinning?: boolean;
}

export const AnimatedRefresh: React.FC<AnimatedRefreshProps> = ({
  className = 'w-3.5 h-3.5',
  size = 24,
  isSpinning = false,
}) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`animated-refresh-icon ${isSpinning ? 'is-spinning' : ''} ${className}`}
    >
      {/* Top Clockwise Semicircular Arrow */}
      <g className="refresh-arm refresh-arm-top">
        <path
          d="M 3 12 a 9 9 0 0 1 9 -9 c 2.65 0 5.06 1.05 6.84 2.74 L 21 8"
          className="refresh-arc"
        />
        <polyline points="21 3 21 8 16 8" className="refresh-arrow" />
      </g>

      {/* Bottom Clockwise Semicircular Arrow */}
      <g className="refresh-arm refresh-arm-bottom">
        <path
          d="M 21 12 a 9 9 0 0 1 -9 9 c -2.65 0 -5.06 -1.05 -6.84 -2.74 L 3 16"
          className="refresh-arc"
        />
        <polyline points="3 21 3 16 8 16" className="refresh-arrow" />
      </g>
    </svg>
  );
};
