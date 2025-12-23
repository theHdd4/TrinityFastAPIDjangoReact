import React from 'react';

import { cn } from '@/lib/utils';

interface StageLayoutProps {
  title: string;
  explanation: string;
  children: React.ReactNode;
  className?: string;
}

export const StageLayout: React.FC<StageLayoutProps> = ({
  title,
  explanation,
  children,
  className,
}) => {
  return (
    <div className={cn('space-y-6 h-full flex flex-col', className)}>
      {/* Clear Title - Only show if title/explanation provided */}
      {(title || explanation) && (
        <div className="space-y-2 flex-shrink-0">
          {title && <h3 className="text-xl font-semibold text-gray-900">{title}</h3>}
          {explanation && <p className="text-sm text-gray-600">{explanation}</p>}
        </div>
      )}

      {/* Main Content - Single Key Action or Decision */}
      <div className="flex-1 overflow-y-auto w-full min-w-0">
        <div className="w-full min-w-0 overflow-x-hidden">
        {children}
        </div>
      </div>
    </div>
  );
};
