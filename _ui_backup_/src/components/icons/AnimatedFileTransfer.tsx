import React from 'react';

export interface AnimatedFileTransferProps {
  type?: 'up' | 'down';
  className?: string;
  size?: number;
  strokeWidth?: number;
}

export const AnimatedFileTransfer: React.FC<AnimatedFileTransferProps> = ({
  type = 'up',
  className = 'w-4 h-4',
  size = 24,
  strokeWidth = 1.5,
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
      className={`animated-file-transfer-icon file-transfer-${type} ${className}`}
    >
      {/* Grounded Document Sheet Outline with folded corner */}
      <g className="file-sheet">
        <path
          d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"
          className="file-outline"
        />
        <path d="M14 2v5a1 1 0 0 0 1 1h5" className="file-corner" />
      </g>

      {/* Directional Arrow (Glides vertically on hover) */}
      {type === 'up' ? (
        <g className="file-arrow file-arrow-up">
          <path d="M12 12v6" className="file-arrow-stem" />
          <path d="m15 15-3-3-3 3" className="file-arrow-head" />
        </g>
      ) : (
        <g className="file-arrow file-arrow-down">
          <path d="M12 18v-6" className="file-arrow-stem" />
          <path d="m9 15 3 3 3-3" className="file-arrow-head" />
        </g>
      )}
    </svg>
  );
};
