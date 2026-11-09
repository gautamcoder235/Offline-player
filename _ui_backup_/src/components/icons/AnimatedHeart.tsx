import React from 'react';

export interface AnimatedHeartProps {
  className?: string;
  size?: number;
  isLiked?: boolean;
  filled?: boolean;
}

export const AnimatedHeart: React.FC<AnimatedHeartProps> = ({
  className = 'w-4 h-4',
  size = 24,
  isLiked = false,
  filled = false,
}) => {
  const isFilled = isLiked || filled;

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
      className={`animated-heart-icon ${isFilled ? 'is-liked' : ''} ${className}`}
    >
      {/* Heart Contour */}
      <path
        d="M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5"
        className="heart-contour"
        fill={isFilled ? 'currentColor' : 'none'}
      />

      {/* 4 Radial Burst Spark Particles */}
      <circle cx="19" cy="5" r="1.2" className="heart-spark heart-spark-tr" fill="currentColor" stroke="none" />
      <circle cx="19" cy="19" r="1.2" className="heart-spark heart-spark-br" fill="currentColor" stroke="none" />
      <circle cx="5" cy="19" r="1.2" className="heart-spark heart-spark-bl" fill="currentColor" stroke="none" />
      <circle cx="5" cy="5" r="1.2" className="heart-spark heart-spark-tl" fill="currentColor" stroke="none" />
    </svg>
  );
};
