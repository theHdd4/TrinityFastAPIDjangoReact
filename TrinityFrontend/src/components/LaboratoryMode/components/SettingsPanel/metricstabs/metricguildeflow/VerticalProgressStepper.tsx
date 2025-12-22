import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MetricStage } from './useMetricGuidedFlow';

interface VerticalProgressStepperProps {
  currentStage: MetricStage;
  className?: string;
  onStageClick?: (stage: MetricStage) => void;
}

const STAGES: Array<{ id: MetricStage; label: string }> = [
  { id: 'type', label: 'Metrics Type' },
  { id: 'dataset', label: 'Confirm Data Source' },
  { id: 'operations', label: 'Select Operation' },
  { id: 'preview', label: 'Preview and Save' },
];

export const VerticalProgressStepper: React.FC<VerticalProgressStepperProps> = ({
  currentStage, 
  className,
  onStageClick,
}) => {
  const currentIndex = STAGES.findIndex(s => s.id === currentStage);

  const handleStageClick = (stage: MetricStage, index: number) => {
    // Allow clicking on completed stages or the current stage
    if (onStageClick && index <= currentIndex) {
      onStageClick(stage);
    }
  };

  return (
    <div className={cn('flex flex-col gap-0', className)}>
      {STAGES.map((stage, index) => {
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;
        const isUpcoming = index > currentIndex;
        const isClickable = index <= currentIndex && onStageClick;

        return (
          <div 
            key={stage.id} 
            onClick={() => handleStageClick(stage.id, index)}
            className={cn(
              "flex items-center gap-3 py-3 px-2 rounded-lg transition-all duration-200 relative",
              isClickable && "cursor-pointer hover:bg-gray-50",
              isCurrent && "bg-blue-50/50",
              !isClickable && isUpcoming && "opacity-50"
            )}
          >
            {/* Vertical line connector */}
            {index < STAGES.length - 1 && (
              <div className="absolute left-[17px] top-[36px] w-0.5 h-6">
                <div className={cn(
                  'w-full h-full transition-all duration-300',
                  isCompleted ? 'bg-[#41C185]' : 'bg-gray-200'
                )} />
              </div>
            )}

            {/* Radio button / indicator */}
            <div className="relative z-10 flex-shrink-0">
              <div
                className={cn(
                  'w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all duration-300',
                  isCompleted && 'bg-[#41C185] border-[#41C185]',
                  isCurrent && 'bg-[#458EE2] border-[#458EE2] shadow-sm',
                  isUpcoming && 'bg-white border-gray-300'
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                ) : isCurrent ? (
                  <div className="w-2 h-2 rounded-full bg-white" />
                ) : (
                  <div className="w-2 h-2 rounded-full bg-gray-300" />
                )}
              </div>
            </div>

            {/* Stage label */}
            <div
              className={cn(
                'text-sm font-medium flex-1',
                isCurrent && 'text-[#458EE2] font-semibold',
                isCompleted && 'text-[#41C185]',
                isUpcoming && 'text-gray-400'
              )}
            >
              {stage.label}
            </div>

            {/* Completed indicator */}
            {isCompleted && (
              <span className="text-xs text-green-600 font-medium">✓</span>
            )}

            {/* Current indicator */}
            {isCurrent && (
              <span className="text-xs text-blue-500 font-medium bg-blue-100 px-2 py-0.5 rounded-full">Current</span>
            )}
          </div>
        );
      })}
    </div>
  );
};
