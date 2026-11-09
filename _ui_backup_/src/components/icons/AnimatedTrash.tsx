import React from 'react';

export interface AnimatedTrashProps {
  className?: string;
  size?: number;
  strokeWidth?: number;
  isOpen?: boolean;
}

export const AnimatedTrash: React.FC<AnimatedTrashProps> = ({
  className = 'w-4 h-4',
  size = 24,
  strokeWidth = 1.5,
  isOpen = false,
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
      className={`animated-trash-icon ${isOpen ? 'is-open' : ''} ${className}`}
    >
      {/* Grounded Bin Body with interior structural ribs */}
      <g className="trash-body">
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" className="trash-bin" />
        <line x1="10" x2="10" y1="11" y2="17" className="trash-rib trash-rib-left" />
        <line x1="14" x2="14" y1="11" y2="17" className="trash-rib trash-rib-right" />
      </g>

      {/* Hinged Lid Assembly: Horizontal rim + top handle */}
      <g className="trash-lid">
        <path d="M3 6h18" className="trash-lid-rim" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" className="trash-lid-handle" />
      </g>
    </svg>
  );
};
