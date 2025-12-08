import React from 'react';
import { Lightbulb, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StageLayoutProps {
  title: string;
  explanation: string;
  children: React.ReactNode;
  helpText?: string;
  aiInsight?: string;
  className?: string;
}

export const StageLayout: React.FC<StageLayoutProps> = ({
  title,
  explanation,
  children,
  helpText,
  aiInsight,
  className,
}) => {
  return (
    <div className={cn('space-y-6', className)}>
      {/* Clear Title */}
      <div className="space-y-2">
        <h3 className="text-xl font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-600">{explanation}</p>
      </div>

      {/* Main Content - Single Key Action or Decision */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        {children}
      </div>

      {/* Optional Help Text */}
      {helpText && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
          <Info className="w-5 h-5 text-[#458EE2] mt-0.5 flex-shrink-0" />
          <p className="text-sm text-gray-700">{helpText}</p>
        </div>
      )}

      {/* Optional AI Insight */}
      {aiInsight && (
        <div className="bg-[#FFBD59] bg-opacity-10 border border-[#FFBD59] rounded-lg p-4 flex items-start gap-3">
          <Lightbulb className="w-5 h-5 text-[#FFBD59] mt-0.5 flex-shrink-0" />
          <p className="text-sm text-gray-700">{aiInsight}</p>
        </div>
      )}
    </div>
  );
};

