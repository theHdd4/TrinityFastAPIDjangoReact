import React from 'react';
import { cn } from '@/lib/utils';

interface VariableIconProps {
  className?: string;
}

export const VariableIcon: React.FC<VariableIconProps> = ({ className }) => {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('w-4 h-4', className)}
    >
      {/* Left brace - larger and more prominent */}
      <path d="M7 2c-3 3-3 14 0 17" />

      {/* X - larger and more centered */}
      <path d="M10 9l5 5" />
      <path d="M15 9l-5 5" />

      {/* Right brace - larger and more prominent */}
      <path d="M17 2c3 3 3 14 0 17" />
    </svg>
  );
};
