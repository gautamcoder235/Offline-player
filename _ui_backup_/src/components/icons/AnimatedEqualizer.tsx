import React from 'react';

interface AnimatedEqualizerProps {
  className?: string;
  size?: number;
}

export const AnimatedEqualizer: React.FC<AnimatedEqualizerProps> = ({
  className = 'w-4 h-4',
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
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`animated-eq-icon ${className}`}
    >
      {/* 3 Continuous Vertical Guide Tracks */}
      <line x1="4" x2="4" y1="3" y2="21" className="eq-track" strokeWidth={1.2} />
      <line x1="12" x2="12" y1="3" y2="21" className="eq-track" strokeWidth={1.2} />
      <line x1="20" x2="20" y1="3" y2="21" className="eq-track" strokeWidth={1.2} />

      {/* Fader Knob 1 (Left): Starts lower at y=14, glides UP on hover */}
      <line x1="1.5" x2="6.5" y1="14" y2="14" className="eq-fader eq-fader-1" strokeWidth={2.4} />

      {/* Fader Knob 2 (Middle): Starts higher at y=8, glides DOWN on hover */}
      <line x1="9.5" x2="14.5" y1="8" y2="8" className="eq-fader eq-fader-2" strokeWidth={2.4} />

      {/* Fader Knob 3 (Right): Starts at y=16, glides UP on hover */}
      <line x1="17.5" x2="22.5" y1="16" y2="16" className="eq-fader eq-fader-3" strokeWidth={2.4} />
    </svg>
  );
};
