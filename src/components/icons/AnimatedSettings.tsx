import React from 'react';

export interface AnimatedSettingsProps {
  className?: string;
  size?: number;
  strokeWidth?: number;
  isSpinning?: boolean;
}

export const AnimatedSettings: React.FC<AnimatedSettingsProps> = ({
  className = 'w-4 h-4',
  size = 24,
  strokeWidth = 1.5,
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
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`animated-settings-icon ${isSpinning ? 'is-spinning' : ''} ${className}`}
    >
      {/* Outer Cog Gear Teeth (spins 90° with momentum on hover) */}
      <path
        d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"
        className="settings-cog"
      />

      {/* Static Center Axle Core & Bearing */}
      <g className="settings-axle-group">
        <circle cx="12" cy="12" r="3" className="settings-axle" />
        <circle cx="12" cy="12" r="0.8" className="settings-pin" fill="currentColor" stroke="none" />
      </g>
    </svg>
  );
};
