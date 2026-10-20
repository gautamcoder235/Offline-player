import React from 'react';

export interface AnimatedMinusProps {
  className?: string;
  size?: number;
}

export const AnimatedMinus: React.FC<AnimatedMinusProps> = ({
  className = 'w-3.5 h-3.5',
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
      className={`animated-minus-icon ${className}`}
    >
      {/* Left Segment */}
      <line x1="5" y1="12" x2="12" y2="12" className="minus-segment minus-segment-left" />

      {/* Right Segment */}
      <line x1="12" y1="12" x2="19" y2="12" className="minus-segment minus-segment-right" />
    </svg>
  );
};
