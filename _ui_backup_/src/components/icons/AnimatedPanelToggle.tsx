import React from 'react';

export interface AnimatedPanelToggleProps {
  className?: string;
  size?: number;
  strokeWidth?: number;
  isCollapsed?: boolean;
}

export const AnimatedPanelToggle: React.FC<AnimatedPanelToggleProps> = ({
  className = 'w-[18px] h-[18px]',
  size = 24,
  strokeWidth = 1.5,
  isCollapsed = false,
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
      className={`animated-panel-toggle-icon ${isCollapsed ? 'is-collapsed' : 'is-expanded'} ${className}`}
    >
      {/* Outer Window Frame */}
      <rect width="18" height="18" x="3" y="3" rx="2" className="panel-frame" />

      {/* Sliding Divider Door Line (slides along track on hover) */}
      <line x1="9" x2="9" y1="3" y2="21" className="panel-divider" />

      {/* Directional Chevron Indicator */}
      {isCollapsed ? (
        <path d="m14 9 3 3-3 3" className="panel-chevron panel-chevron-open" />
      ) : (
        <path d="m16 15-3-3 3-3" className="panel-chevron panel-chevron-close" />
      )}
    </svg>
  );
};
