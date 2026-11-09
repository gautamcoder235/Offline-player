import React from 'react';

export interface AnimatedRepeatProps {
  className?: string;
  size?: number;
  mode?: 'off' | 'all' | 'one' | string;
  single?: boolean;
}

export const AnimatedRepeat: React.FC<AnimatedRepeatProps> = ({
  className = 'w-3.5 h-3.5',
  size = 24,
  mode = 'off',
  single,
}) => {
  const isSingle = single !== undefined ? single : mode === 'one';
  const isActive = mode !== 'off' || single;

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
      className={`animated-repeat-icon ${isActive ? 'is-active' : ''} ${isSingle ? 'is-single' : ''} ${className}`}
    >
      {/* Upper Orbital Arc with Arrowhead */}
      <g className="repeat-orbit repeat-orbit-upper">
        <path
          d="M3 11v-1a4 4 0 0 1 4-4h14"
          className="repeat-arc repeat-arc-upper"
        />
        <path
          d="m17 2 4 4-4 4"
          className="repeat-arrow repeat-arrow-upper"
        />
      </g>

      {/* Center "1" Badge for Single Repeat */}
      {isSingle && (
        <g className="repeat-badge-one">
          <path
            d="M11 10h1.2v4"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}

      {/* Lower Orbital Arc with Arrowhead */}
      <g className="repeat-orbit repeat-orbit-lower">
        <path
          d="M21 13v1a4 4 0 0 1-4 4H3"
          className="repeat-arc repeat-arc-lower"
        />
        <path
          d="m7 22-4-4 4-4"
          className="repeat-arrow repeat-arrow-lower"
        />
      </g>
    </svg>
  );
};
