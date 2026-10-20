import React from 'react';

export interface AnimatedCloseProps {
  className?: string;
  size?: number;
}

export const AnimatedClose: React.FC<AnimatedCloseProps> = ({
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
      className={`animated-close-icon ${className}`}
    >
      {/* Scissor-twist Cross: Blade Line 1 (NW to SE diagonal) */}
      <line x1="18" y1="6" x2="6" y2="18" className="close-blade close-blade-1" />

      {/* Scissor-twist Cross: Blade Line 2 (NE to SW diagonal) */}
      <line x1="6" y1="6" x2="18" y2="18" className="close-blade close-blade-2" />
    </svg>
  );
};
