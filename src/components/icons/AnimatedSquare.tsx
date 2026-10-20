import React from 'react';

export interface AnimatedSquareProps {
  className?: string;
  size?: number;
}

export const AnimatedSquare: React.FC<AnimatedSquareProps> = ({
  className = 'w-3 h-3',
  size = 24,
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
      className={`animated-square-icon ${className}`}
    >
      {/* Top-Left Bracket Corner */}
      <path
        d="M 5 13 L 5 7 A 2 2 0 0 1 7 5 L 13 5"
        className="square-corner square-corner-tl"
      />

      {/* Bottom-Right Bracket Corner */}
      <path
        d="M 19 11 L 19 17 A 2 2 0 0 1 17 19 L 11 19"
        className="square-corner square-corner-br"
      />
    </svg>
  );
};
