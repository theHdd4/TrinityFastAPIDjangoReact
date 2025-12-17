import React from 'react';
import { Sparkles, Table, Info, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { StageLayout } from '../components/StageLayout';
import type { ReturnTypeFromUseMetricGuidedFlow } from '../useMetricGuidedFlow';

interface M0TypeProps {
  flow: ReturnTypeFromUseMetricGuidedFlow;
}

export const M0Type: React.FC<M0TypeProps> = ({ flow }) => {
  const { state, setState } = flow;
  const selected = state.selectedType;

  const handleSelection = (type: 'variable' | 'column') => {
    setState(prev => {
      if (prev.selectedType !== type) {
        return {
          ...prev,
          selectedType: type,
          createdVariables: [],
          createdColumns: [],
          createdTables: [],
        };
      }
      return { ...prev, selectedType: type };
    });
  };

  return (
    <StageLayout title="" explanation="" className="max-w-xl mx-auto">
      <div className="flex justify-center">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full px-4 justify-items-center">

          {/* ================= Variable ================= */}
          <button
            onClick={() => handleSelection('variable')}
            className={cn(
              'w-full max-w-sm relative rounded-xl border p-6 transition-all flex items-center justify-center',
              selected === 'variable'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            )}
          >
            {/* Radio */}
            <div className="absolute top-4 right-4">
              <div
                className={cn(
                  'h-4 w-4 rounded-full border flex items-center justify-center',
                  selected === 'variable'
                    ? 'border-primary bg-primary'
                    : 'border-muted-foreground/40'
                )}
              >
                {selected === 'variable' && (
                  <Check className="h-3 w-3 text-white" />
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-muted p-2">
              <Sparkles
                  className={cn(
                    'h-6 w-6 transition-colors',
                    selected === 'variable' ? 'text-blue-600' : 'text-muted-foreground'
                  )}
                />

              </div>

              <div className="flex items-center gap-1">
                <h4 className="font-medium text-base">Variable</h4>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      <div className="space-y-2 text-xs">
                        <p className="font-medium">Variable</p>
                        <p className="text-muted-foreground">
                          A standalone value that is either computed from data or manually assigned.
                        </p>
                        <p className="italic text-muted-foreground">
                          Examples:
                          <br />• g = 9.8
                          <br />• total_sales_in_2024
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </button>

          {/* ================= Column ================= */}
          <button
            onClick={() => handleSelection('column')}
            className={cn(
              'w-full max-w-sm relative rounded-xl border p-6 transition-all flex items-center justify-center',
              selected === 'column'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            )}
          >
            {/* Radio */}
            <div className="absolute top-4 right-4">
              <div
                className={cn(
                  'h-4 w-4 rounded-full border flex items-center justify-center',
                  selected === 'column'
                    ? 'border-primary bg-primary'
                    : 'border-muted-foreground/40'
                )}
              >
                {selected === 'column' && (
                  <Check className="h-3 w-3 text-white" />
                )}
              </div>
            </div>

            {/* Content */}
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-muted p-2">
              <Table
                className={cn(
                  'h-6 w-6 transition-colors',
                  selected === 'column' ? 'text-blue-600' : 'text-muted-foreground'
                )}
              />
              </div>

              <div className="flex items-center gap-1">
                <h4 className="font-medium text-base">Column</h4>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      <div className="space-y-2 text-xs">
                        <p className="font-medium">Derived Column</p>
                        <p className="text-muted-foreground">
                          A new column created by applying transformations on the dataset.
                        </p>
                        <p className="italic text-muted-foreground">
                          Examples:
                          <br />• growth_rate
                          <br />• Z_transformation
                          <br />• ratio
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </button>

        </div>
      </div>
    </StageLayout>
  );
};
