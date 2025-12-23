import React from 'react';
import { CheckCircle2, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UploadStage } from './useGuidedUploadFlow';

interface ProgressStepperProps {
  currentStage: UploadStage;
  className?: string;
  hideStages?: UploadStage[];
}

const STAGES: Array<{ id: UploadStage; label: string; shortLabel: string }> = [
  { id: 'U0', label: 'Upload Dataset', shortLabel: 'Upload' },
  { id: 'U1', label: 'Structural Scan', shortLabel: 'Scan' },
  { id: 'U2', label: 'Confirm Headers', shortLabel: 'Headers' },
  { id: 'U3', label: 'Column Names', shortLabel: 'Columns' },
  { id: 'U4', label: 'Data Types', shortLabel: 'Types' },
  { id: 'U5', label: 'Missing Values', shortLabel: 'Missing' },
  { id: 'U6', label: 'Final Preview', shortLabel: 'Preview' },
  { id: 'U7', label: 'Complete', shortLabel: 'Complete' },
];

export const ProgressStepper: React.FC<ProgressStepperProps> = ({ currentStage, className, hideStages = [] }) => {
  const visibleStages = STAGES.filter(s => !hideStages.includes(s.id));
  const currentIndex = visibleStages.findIndex(s => s.id === currentStage);

  return (
    <div className={cn('w-full py-4', className)}>
      <div className="flex items-center justify-between relative">
        {/* Progress line */}
        <div className="absolute top-5 left-0 right-0 h-0.5 bg-gray-200 -z-10" />
        <div
          className="absolute top-5 left-0 h-0.5 bg-[#458EE2] transition-all duration-300 -z-10"
          style={{
            width: visibleStages.length > 1 
              ? `${(currentIndex / (visibleStages.length - 1)) * 100}%`
              : '0%',
          }}
        />

        {/* Stage indicators */}
        {visibleStages.map((stage, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isUpcoming = index > currentIndex;

          return (
            <div key={stage.id} className="flex flex-col items-center flex-1 relative z-10">
              <div
                className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all duration-300',
                  isCompleted && 'bg-[#41C185] border-[#41C185]',
                  isCurrent && 'bg-[#458EE2] border-[#458EE2] scale-110',
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
              <div className="mt-2 text-center">
                <div
                  className={cn(
                    'text-xs font-medium',
                    isCurrent && 'text-[#458EE2]',
                    isCompleted && 'text-[#41C185]',
                    isUpcoming && 'text-gray-400'
                  )}
                >
                  {stage.shortLabel}
                </div>
                <div
                  className={cn(
                    'text-[10px] mt-0.5',
                    isCurrent ? 'text-[#458EE2]' : 'text-gray-500'
                  )}
                >
                  Step {index + 1}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

