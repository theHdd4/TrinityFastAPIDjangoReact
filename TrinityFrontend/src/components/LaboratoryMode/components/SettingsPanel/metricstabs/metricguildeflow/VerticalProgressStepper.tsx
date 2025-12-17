import React from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MetricStage } from './useMetricGuidedFlow';

interface VerticalProgressStepperProps {
  currentStage: MetricStage;
  className?: string;
}

const STAGES: Array<{ id: MetricStage; label: string; shortLabel: string; category?: string }> = [
  { id: 'type', label: 'Select The Type Of Metric You Want To Create', shortLabel: 'Type', category: 'SETUP' },
  { id: 'dataset', label: 'Confirm Your Data Source', shortLabel: 'Dataset', category: 'CONFIGURATION' },
  { id: 'operations', label: 'Operations', shortLabel: 'Operations', category: 'CONFIGURATION' },
  { id: 'preview', label: 'Complete', shortLabel: 'Complete', category: 'EXECUTION' },
];

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  SETUP: { bg: 'bg-blue-500', text: 'text-white', border: 'border-blue-500' },
  CONFIGURATION: { bg: 'bg-green-500', text: 'text-white', border: 'border-green-500' },
  VALIDATION: { bg: 'bg-yellow-500', text: 'text-black', border: 'border-yellow-500' },
  EXECUTION: { bg: 'bg-blue-500', text: 'text-white', border: 'border-blue-500' },
};

export const VerticalProgressStepper: React.FC<VerticalProgressStepperProps> = ({ 
  currentStage, 
  className 
}) => {
  const currentIndex = STAGES.findIndex(s => s.id === currentStage);

  return (
    <div className={cn('flex flex-col gap-4 py-2', className)}>
      {STAGES.map((stage, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isUpcoming = index > currentIndex;
        const category = stage.category || 'SETUP';
        const categoryColor = CATEGORY_COLORS[category] || CATEGORY_COLORS.SETUP;

        return (
          <div key={stage.id} className="flex items-start gap-3 relative">
            {/* Vertical line connector */}
            {index < STAGES.length - 1 && (
              <div className="absolute left-5 top-10 w-0.5 h-full -z-10">
                <div className={cn(
                  'w-full h-full transition-all duration-300',
                  isCompleted ? 'bg-[#41C185]' : 'bg-gray-200'
                )} />
              </div>
            )}

            {/* Stage indicator circle */}
            <div className="relative z-10 flex-shrink-0">
              <div
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300',
                  isCompleted && 'bg-[#41C185] border-[#41C185]',
                  isCurrent && 'bg-[#458EE2] border-[#458EE2] scale-110 shadow-lg',
                  isUpcoming && 'bg-white border-gray-300'
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-6 h-6 text-white" />
                ) : (
                  <Circle
                    className={cn(
                      'w-6 h-6',
                      isCurrent ? 'text-white fill-white' : 'text-gray-300 fill-white'
                    )}
                  />
                )}
              </div>
            </div>

            {/* Stage content */}
            <div className="flex-1 pt-1">
              <div className="flex items-center gap-2 mb-1">
                <span className={cn(
                  'px-2 py-0.5 rounded text-xs font-semibold',
                  categoryColor.bg,
                  categoryColor.text,
                  categoryColor.border,
                  'border'
                )}>
                  {category}
                </span>
                {isCompleted && (
                  <span className="text-xs text-green-600 font-medium">✓ Complete</span>
                )}
              </div>
              <div
                className={cn(
                  'text-sm font-medium',
                  isCurrent && 'text-[#458EE2]',
                  isCompleted && 'text-[#41C185]',
                  isUpcoming && 'text-gray-400'
                )}
              >
                {stage.label}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {stage.id}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
