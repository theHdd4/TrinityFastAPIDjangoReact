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
      // If type changes, clear all created items as they're type-specific
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
    <StageLayout
      title=""
      explanation=""
    >
      <div className="flex justify-center">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-2xl w-full px-6 justify-items-center">
          {/* Variable */}
          <button
            onClick={() => handleSelection('variable')}
            className={cn(
              'w-full max-w-sm relative rounded-xl border p-6 text-center transition-all flex flex-col items-center justify-between',
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

            <div className="flex flex-col items-center space-y-4 w-full flex-1">
              {/* Icon at top center */}
              <div className="rounded-lg bg-muted p-3 mt-4">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>

              {/* Header with info icon */}
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-base">Create a Variable</h4>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      <div className="space-y-2 text-xs">
                        <p className="font-medium">Variable</p>
                        <p className="text-muted-foreground">
                          A standalone number or label that can be computed or manually assigned.
                        </p>
                        <p className="italic text-muted-foreground">
                          Examples:
                          <br />• total_sales
                          <br />• avg_discount
                          <br />• growth_target = 1.12
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {/* Bullet points at bottom */}
              <ul className="text-sm text-muted-foreground space-y-1 mt-auto mb-4">
                <li>• Compute Variable</li>
                <li>• Assign Variable</li>
              </ul>
            </div>
          </button>

          {/* Column */}
          <button
            onClick={() => handleSelection('column')}
            className={cn(
              'w-full max-w-sm relative rounded-xl border p-6 text-center transition-all flex flex-col items-center justify-between',
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

            <div className="flex flex-col items-center space-y-4 w-full flex-1">
              {/* Icon at top center */}
              <div className="rounded-lg bg-muted p-3 mt-4">
                <Table className="h-8 w-8 text-primary" />
              </div>

              {/* Header with info icon */}
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-base">Create a New Column</h4>
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
                          <br />• lagged_price
                          <br />• sum_by_brand
                          <br />• SKU_rank_by_region
                        </p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {/* Bullet points at bottom */}
              <ul className="text-sm text-muted-foreground space-y-1 mt-auto mb-4">
                <li>• Row-wise operations</li>
                <li>• Grouped transformations</li>
              </ul>
            </div>
          </button>
        </div>
      </div>
    </StageLayout>
  );
};
