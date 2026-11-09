import React, { useId } from 'react';

export interface AnimatedSearchProps {
  className?: string;
  size?: number;
  isFocused?: boolean;
}

export const AnimatedSearch: React.FC<AnimatedSearchProps> = ({
  className = 'w-4 h-4',
  size = 24,
  isFocused = false,
}) => {
  const rawId = useId();
  const clipId = `search-lens-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;

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
      className={`animated-search-icon ${isFocused ? 'is-focused' : ''} ${className}`}
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="11" cy="11" r="7" />
        </clipPath>
      </defs>

      {/* Circular Magnifying Glass Lens */}
      <circle cx="11" cy="11" r="7.5" className="search-lens" />

      {/* Diagonal Handle Stem */}
      <line x1="16.5" y1="16.5" x2="21" y2="21" className="search-handle" strokeWidth={2.4} />

      {/* Diagonal Specular Light Glint Line across lens (clipped inside glass) */}
      <g clipPath={`url(#${clipId})`}>
        <line
          x1="4"
          y1="14"
          x2="14"
          y2="4"
          className="search-glint"
          strokeWidth={1.8}
        />
      </g>
    </svg>
  );
};
