import React from 'react';

export interface AnimatedSkipProps {
  direction?: 'next' | 'prev';
  className?: string;
  size?: number;
}

export const AnimatedSkip: React.FC<AnimatedSkipProps> = ({
  direction = 'next',
  className = 'w-4 h-4',
  size = 24,
}) => {
  const isNext = direction === 'next';

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
      className={`animated-skip-icon skip-${direction} ${className}`}
    >
      {isNext ? (
        <>
          {/* Forward Arrowhead (Polygon) */}
          <polygon
            points="5 4 16 12 5 20"
            className="skip-arrow skip-arrow-next"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth={1.2}
            strokeLinejoin="round"
          />

          {/* Vertical Elastic Stop Bar */}
          <line
            x1="20"
            y1="4"
            x2="20"
            y2="20"
            className="skip-bar skip-bar-next"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          {/* Vertical Elastic Stop Bar */}
          <line
            x1="4"
            y1="4"
            x2="4"
            y2="20"
            className="skip-bar skip-bar-prev"
            stroke="currentColor"
            strokeWidth={2.2}
            strokeLinecap="round"
          />

          {/* Backward Arrowhead (Polygon) */}
          <polygon
            points="19 4 8 12 19 20"
            className="skip-arrow skip-arrow-prev"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth={1.2}
            strokeLinejoin="round"
          />
        </>
      )}
    </svg>
  );
};
