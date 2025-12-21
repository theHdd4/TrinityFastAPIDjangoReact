import React, { useState, useRef, useEffect, useCallback } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGroupByGuidedFlow, type GroupByStage } from "./useGroupByGuidedFlow";
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import G1Measures from "./G1Meausres";
import G2Grouping from "./G2Grouping";
import G3Operations from "./G3Operations";

const STAGE_COMPONENTS: Record<GroupByStage, React.ComponentType<any>> = {
  measures: G1Measures,
  grouping: G2Grouping,
  operations: G3Operations,
};

const STAGE_TITLES: Record<GroupByStage, string> = {
  measures: "Select Your Measures",
  grouping: "Choose Grouping Columns",
  operations: "Configure Operations & Perform",
};

const STAGE_ORDER: GroupByStage[] = ['measures', 'grouping', 'operations'];

const getStageIndex = (stage: GroupByStage): number => STAGE_ORDER.indexOf(stage);
const isStageCompleted = (stage: GroupByStage, currentStage: GroupByStage): boolean =>
  getStageIndex(stage) < getStageIndex(currentStage);

interface InlineGroupByGuidedFlowProps {
  atomId: string;
}

export const InlineGroupByGuidedFlow: React.FC<InlineGroupByGuidedFlowProps> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const settings = atom?.settings || {};
  const dataSource = settings.dataSource || '';
  
  // Initialize flow with dataSource
  const flow = useGroupByGuidedFlow({ dataSource });
  const { state, goToNextStage, goToPreviousStage, restartFlow, updateState, STAGE_ORDER } = flow;
  
  // Track previous data source to detect changes
  const prevDataSourceRef = useRef<string>('');
  
  // Unified expanded stages state - single source of truth
  // Start with only current stage expanded, completed stages are collapsed by default
  const [expandedStages, setExpandedStages] = useState<Set<GroupByStage>>(new Set(['measures']));
  const stageRefs = useRef<Record<GroupByStage, HTMLDivElement | null>>({} as Record<GroupByStage, HTMLDivElement | null>);

  // Track manually expanded stages separately to preserve them across stage changes
  const manuallyExpandedRef = useRef<Set<GroupByStage>>(new Set());
  
  // Update dataSource in flow state when it changes, and reset flow if data source changes while guided mode is on
  useEffect(() => {
    // Skip on initial mount (when prevDataSourceRef is empty)
    if (prevDataSourceRef.current && 
        settings.showGuidedMode && 
        dataSource && 
        dataSource !== prevDataSourceRef.current) {
      // Data source changed while guided mode is on - reset flow
      restartFlow();
      updateState({ dataSource });
      // Reset expanded stages to M1 only
      setExpandedStages(new Set(['measures']));
      // Clear manually expanded stages
      manuallyExpandedRef.current.clear();
    }
    
    // Always update dataSource in flow state (if not already set)
    if (dataSource && state.dataSource !== dataSource) {
      updateState({ dataSource });
    }
    
    // Update previous data source ref
    prevDataSourceRef.current = dataSource;
  }, [dataSource, settings.showGuidedMode, state.dataSource, updateState, restartFlow]);

  // Auto-expand only current stage when it changes (collapse auto-expanded completed stages, but preserve manual expansions)
  useEffect(() => {
    setExpandedStages(prev => {
      const next = new Set<GroupByStage>();
      // Always expand the current stage
      next.add(state.currentStage);
      // Preserve manually expanded completed stages
      manuallyExpandedRef.current.forEach(stage => {
        if (stage !== state.currentStage && isStageCompleted(stage, state.currentStage)) {
          next.add(stage);
        }
      });
      return next;
    });
    
    const currentStageElement = stageRefs.current[state.currentStage];
    if (currentStageElement) {
      setTimeout(() => {
        currentStageElement.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
          inline: 'nearest',
        });
      }, 100);
    }
  }, [state.currentStage]);

  // Unified toggle function for all stages (completed and current)
  const toggleStage = useCallback((stage: GroupByStage) => {
    setExpandedStages(prev => {
      const next = new Set(prev);
      const isCompleted = isStageCompleted(stage, state.currentStage);
      const isCurrent = stage === state.currentStage;
      
      if (next.has(stage)) {
        // Collapsing
        next.delete(stage);
        // If it's a completed stage, remove from manually expanded tracking
        if (isCompleted && !isCurrent) {
          manuallyExpandedRef.current.delete(stage);
        }
      } else {
        // Expanding
        next.add(stage);
        // If it's a completed stage, track it as manually expanded
        if (isCompleted && !isCurrent) {
          manuallyExpandedRef.current.add(stage);
        }
      }
      return next;
    });
  }, [state.currentStage]);

  const handleNext = useCallback(() => {
    // Check if current stage has a custom next handler (for saving state)
    const stageHandler = (flow as any).handleStageNext;
    if (stageHandler) {
      stageHandler();
    } else {
      goToNextStage();
    }
  }, [goToNextStage, flow]);

  const handleBack = useCallback(() => {
    goToPreviousStage();
  }, [goToPreviousStage]);

  const handleReset = useCallback(() => {
    restartFlow();
    // Clear manually expanded stages on reset
    manuallyExpandedRef.current.clear();
    // Reset expanded stages to only the first stage
    setExpandedStages(new Set(['measures']));
  }, [restartFlow]);

  const canGoBack = state.currentStage !== 'measures';
  const isLastStage = state.currentStage === 'operations';
  
  // Check if current stage can proceed (for disabling Next button)
  // Uses canProceedToNext from flow state which is updated by child components
  const canProceed = state.canProceedToNext === true;

  const renderStageItem = useCallback(
    (stage: GroupByStage) => {
      const isCompleted = isStageCompleted(stage, state.currentStage);
      const isCurrent = stage === state.currentStage;
      const isUpcoming = !isCompleted && !isCurrent;
      const StageComponent = STAGE_COMPONENTS[stage];
      const isExpanded = expandedStages.has(stage);

      let statusIcon: React.ReactNode;
      let headerBg = 'bg-white';
      let borderColor = 'border-gray-200';
      let headerTextColor = 'text-gray-900';

      if (isCompleted) {
        statusIcon = <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />;
        headerBg = 'bg-green-50';
        borderColor = 'border-green-200';
      } else if (isCurrent) {
        statusIcon = (
          <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-semibold flex-shrink-0">
            {getStageIndex(stage) + 1}
          </div>
        );
        headerBg = 'bg-blue-50';
        borderColor = 'border-blue-300';
      } else {
        statusIcon = (
          <div className="w-5 h-5 rounded-full border-2 border-dashed border-gray-300 flex-shrink-0" />
        );
        headerBg = 'bg-gray-50';
        borderColor = 'border-gray-200';
        headerTextColor = 'text-gray-500';
      }

      return (
        <div
          key={stage}
          ref={el => {
            if (el) {
              stageRefs.current[stage] = el;
            }
          }}
          className={`w-full min-w-0 overflow-hidden bg-white border-2 ${borderColor} rounded-lg shadow-sm mb-4 flex flex-col transition-all duration-200 ${
            isCurrent ? 'shadow-md' : ''
          }`}
        >
          {/* Stage Header */}
          {isCompleted || isCurrent ? (
            // Completed and current stages: clickable to expand/collapse
            <button
              onClick={() => toggleStage(stage)}
              className={`flex items-center justify-between px-6 py-4 border-b ${headerBg} hover:bg-opacity-80 transition-colors cursor-pointer w-full text-left`}
            >
              <div className="flex items-center gap-3">
                {statusIcon}
                <h3 className={`text-sm font-medium ${headerTextColor}`}>{STAGE_TITLES[stage]}</h3>
              </div>
              {isExpanded ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </button>
          ) : (
            // Upcoming stages: non-interactive (still show label)
            <div
              className={`flex items-center justify-between px-6 py-4 border-b ${headerBg} flex-shrink-0`}
            >
              <div className="flex items-center gap-3">
                {statusIcon}
                <h2 className={`text-sm font-medium ${headerTextColor}`}>{STAGE_TITLES[stage]}</h2>
              </div>
            </div>
          )}

          {/* Stage Content */}
          {isExpanded && (
            <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
              {isCurrent ? (
                <>
                  <div className="p-6">
                    <StageComponent flow={flow} atomId={atomId} />
                  </div>
                  {/* Navigation Footer for current stage - hide Next button on last stage */}
                  <div className="flex items-center justify-between pt-4 px-6 pb-4 border-t bg-gray-50 flex-shrink-0">
                    <div className="flex gap-2">
                      {canGoBack && (
                        <Button
                          variant="outline"
                          onClick={handleBack}
                          className="flex items-center gap-2"
                        >
                          <ArrowLeft className="w-4 h-4" />
                          Back
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        onClick={handleReset}
                        className="flex items-center gap-2 text-gray-600"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Reset
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      {/* Always show Next button if not on the last stage, but disable if validation fails */}
                      {!isLastStage && (
                        <Button
                          onClick={handleNext}
                          disabled={!canProceed}
                          className="bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Next
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              ) : isCompleted && isExpanded ? (
                <div className="p-6 bg-gray-50 opacity-70">
                  <StageComponent flow={flow} atomId={atomId} readOnly={true} />
                </div>
              ) : null}
            </div>
          )}
        </div>
      );
    },
    [
      state.currentStage,
      expandedStages,
      flow,
      handleNext,
      handleBack,
      handleReset,
      canGoBack,
      toggleStage,
      isLastStage,
      atomId,
      canProceed,
    ],
  );

  return (
    <div className="w-full min-w-0">
      <div className="w-full flex flex-col">
        {/* Header */}
        <div className="mb-4 px-1">
          <h2 className="text-lg font-semibold text-gray-900">
            Follow these steps to configure your Group By operation
          </h2>
        </div>
        {/* Render all stages in sequence */}
        {STAGE_ORDER.map(stage => renderStageItem(stage))}
      </div>
    </div>
  );
};
