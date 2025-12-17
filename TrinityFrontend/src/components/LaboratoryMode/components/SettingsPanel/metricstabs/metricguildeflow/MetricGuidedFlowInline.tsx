import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, RotateCcw, CheckCircle2, ChevronDown, ChevronUp, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useMetricGuidedFlow, type MetricStage, type MetricGuidedFlowState } from './useMetricGuidedFlow';
import { M0Type } from './stages/M0Type';
import { M1Dataset } from './stages/M1Dataset';
import { M2Operations, type M2OperationsRef } from './stages/M2Operations';
import { M3Preview } from './stages/M3Preview';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { getActiveProjectContext } from '@/utils/projectEnv';

interface MetricGuidedFlowInlineProps {
  /** Optional callback when the full flow completes on preview save */
  onComplete?: (result: {
    createdVariables: any[];
    createdColumns: any[];
    createdTables: any[];
  }) => void;
  /** Initial stage to start from (default: 'type') */
  initialStage?: MetricStage;
  /** Saved state to restore (for resuming) */
  savedState?: Partial<MetricGuidedFlowState>;
  /** Callback when flow should be closed (e.g. user cancels) */
  onClose?: () => void;
  /** Current metrics context atom (if any), used for dataset preselection */
  contextAtomId?: string;
}

const STAGE_COMPONENTS: Record<MetricStage, React.ComponentType<any>> = {
  type: M0Type,
  dataset: M1Dataset,
  operations: M2Operations,
  preview: M3Preview,
};

const STAGE_TITLES: Record<MetricStage, string> = {
  type: 'Select The Type Of Metric You Want To Create',
  dataset: 'Confirm Your Data Source',
  operations: 'Select Operation',
  preview: 'Preview & Save',
};

const STAGE_ORDER: MetricStage[] = ['type', 'dataset', 'operations', 'preview'];

const getStageIndex = (stage: MetricStage): number => STAGE_ORDER.indexOf(stage);
const isStageCompleted = (stage: MetricStage, currentStage: MetricStage): boolean =>
  getStageIndex(stage) < getStageIndex(currentStage);

export const MetricGuidedFlowInline: React.FC<MetricGuidedFlowInlineProps> = ({
  onComplete,
  initialStage,
  savedState,
  onClose,
  contextAtomId,
}) => {
  console.log('[MetricGuidedFlowInline] Component mounted/rendered', {
    initialStage,
    savedState,
    hasOnClose: !!onClose,
    contextAtomId,
  });
  
  const flow = useMetricGuidedFlow(savedState);
  const { state, goToNextStage, goToPreviousStage, restartFlow, goToStage, setState } = flow;
  const { setActiveMetricGuidedFlow, closeMetricGuidedFlow } = useLaboratoryStore();

  // Refs to avoid excessive localStorage writes and keep last saved snapshot
  const prevStateStringRef = useRef<string>('');
  const isInitialMountRef = useRef(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const effectiveInitialStage = initialStage || 'type';

  // Stable snapshot string to detect meaningful changes
  const stateString = useMemo(
    () =>
      JSON.stringify({
        currentStage: state.currentStage,
        selectedType: state.selectedType,
        dataSource: state.dataSource,
        createdVariables: state.createdVariables,
        createdColumns: state.createdColumns,
        createdTables: state.createdTables,
      }),
    [
      state.currentStage,
      state.selectedType,
      state.dataSource,
      state.createdVariables,
      state.createdColumns,
      state.createdTables,
    ],
  );

  // Initialize currentStage from props once
  useEffect(() => {
    if (state.currentStage === 'type' && effectiveInitialStage !== 'type') {
      goToStage(effectiveInitialStage);
    }
    // We intentionally exclude goToStage from deps to avoid re-running
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveInitialStage, state.currentStage]);

  // Sync state into laboratory store and localStorage for trackers & persistence
  useEffect(() => {
    // Skip very first mount snapshot
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      prevStateStringRef.current = stateString;
    } else if (stateString === prevStateStringRef.current) {
      // Nothing meaningful changed
      return;
    }

    prevStateStringRef.current = stateString;

    // 1) Update laboratory store (drives GuidedWorkflowPanel & GuidedFlowStepTrackerPanel)
    setActiveMetricGuidedFlow(state.currentStage, {
      selectedType: state.selectedType,
      dataSource: state.dataSource,
      createdVariables: state.createdVariables,
      createdColumns: state.createdColumns,
      createdTables: state.createdTables,
    });

    // 2) Persist to localStorage (mirrors MetricGuidedFlow.tsx logic)
    const projectContext = getActiveProjectContext();
    if (!projectContext) {
      return;
    }

    const metricFlowState = {
      currentStage: state.currentStage,
      selectedType: state.selectedType,
      dataSource: state.dataSource,
      createdVariables: state.createdVariables,
      createdColumns: state.createdColumns,
      createdTables: state.createdTables,
    };

    const key = `metric-guided-flow-${projectContext.client_name}-${projectContext.app_name}-${projectContext.project_name}`;

    // Debounce writes to avoid thrashing localStorage
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(metricFlowState));
      } catch {
        // Best-effort persistence; ignore quota errors
      }
      saveTimeoutRef.current = null;
    }, 300);
  }, [state, stateString, setActiveMetricGuidedFlow]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const canProceedFromStep = (step: MetricStage): boolean => {
    switch (step) {
      case 'type':
        return state.selectedType !== null;
      case 'dataset':
        return state.dataSource !== '';
      case 'operations':
        return (
          state.createdVariables.length > 0 ||
          state.createdColumns.length > 0 ||
          state.createdTables.length > 0
        );
      case 'preview':
        return true;
      default:
        return false;
    }
  };

  const handleNext = useCallback(async () => {
    // Operations stage is handled separately with Save/Save As buttons
    if (state.currentStage === 'operations') {
      // This should not be called for operations stage anymore
      // But keep as fallback for variable type
      if (state.selectedType === 'variable') {
        const canSave = m2OperationsRef.current?.canSaveVariable();
        const hasCreatedItems = 
          state.createdVariables.length > 0 ||
          state.createdColumns.length > 0 ||
          state.createdTables.length > 0;
        
        if (canSave && !hasCreatedItems && m2OperationsRef.current) {
          console.log('[MetricGuidedFlowInline] Auto-saving variable before proceeding');
          try {
            await m2OperationsRef.current.saveVariable();
            // Navigation will happen via useEffect in M2Operations after onVariableCreated
            return;
          } catch (error) {
            console.error('[MetricGuidedFlowInline] Error auto-saving variable:', error);
            return;
          }
        }
      }
      
      // If we have created items, proceed normally
      if (!canProceedFromStep(state.currentStage)) {
        return;
      }
    } else {
      // For other stages, check normally
      if (!canProceedFromStep(state.currentStage)) {
        return;
      }
    }

    if (state.currentStage === 'preview') {
      onComplete?.({
        createdVariables: state.createdVariables,
        createdColumns: state.createdColumns,
        createdTables: state.createdTables,
      });
      return;
    }

    goToNextStage();
  }, [state, goToNextStage, onComplete, canProceedFromStep]);

  // Handlers for Save/Save As buttons in operations stage
  const handleSaveVariable = useCallback(async () => {
    if (!m2OperationsRef.current) return;
    console.log('[MetricGuidedFlowInline] Save Variable button clicked');
    try {
      await m2OperationsRef.current.saveVariable();
      // Navigation will happen via useEffect in M2Operations after onVariableCreated
    } catch (error) {
      console.error('[MetricGuidedFlowInline] Error saving variable:', error);
    }
  }, []);

  const handleSaveColumn = useCallback(() => {
    if (!m2OperationsRef.current) return;
    console.log('[MetricGuidedFlowInline] Save Column button clicked');
    m2OperationsRef.current.saveColumn();
    // Navigation will happen via useEffect in M2Operations after onColumnCreated (after confirmation dialog)
  }, []);

  const handleSaveColumnAs = useCallback(() => {
    if (!m2OperationsRef.current) return;
    console.log('[MetricGuidedFlowInline] Save Column As button clicked');
    m2OperationsRef.current.saveColumnAs();
    // Navigation will happen via useEffect in M2Operations after onTableCreated
  }, []);

  const handleBack = useCallback(() => {
    if (state.currentStage === 'type') {
      onClose?.();
    } else {
      goToPreviousStage();
    }
  }, [state.currentStage, goToPreviousStage, onClose]);

  const handleRestart = useCallback(() => {
    console.log('[MetricGuidedFlowInline] Restart button clicked - resetting to initial state');
    // Clear localStorage persistence
    const projectContext = getActiveProjectContext();
    const storageKey = `metric-guided-flow-${projectContext.projectId || 'default'}`;
    localStorage.removeItem(storageKey);
    
    // Restart flow to clear all state and go back to type stage
    restartFlow();
    
    // Ensure we're on the type stage (restartFlow already sets currentStage to 'type', but being explicit)
    goToStage('type');
    
    // Update store to reflect the reset state
    setActiveMetricGuidedFlow('type', {
      selectedType: null,
      dataSource: '',
      createdVariables: [],
      createdColumns: [],
      createdTables: [],
      currentStage: 'type',
    });
  }, [restartFlow, goToStage, setActiveMetricGuidedFlow]);

  const handleClose = useCallback(() => {
    //console.log('[MetricGuidedFlowInline] handleClose called - clearing all state');
    
    // Clear localStorage persistence
    const projectContext = getActiveProjectContext();
    if (projectContext) {
      const key = `metric-guided-flow-${projectContext.client_name}-${projectContext.app_name}-${projectContext.project_name}`;
      try {
        localStorage.removeItem(key);
        console.log('[MetricGuidedFlowInline] Cleared localStorage key:', key);
      } catch (error) {
        console.warn('[MetricGuidedFlowInline] Failed to clear localStorage:', error);
      }
    }
    
    // Restart flow to clear all state
    restartFlow();
    
    // Call onClose callback to close the card and update store
    onClose?.();
  }, [onClose, restartFlow]);

  const CurrentStageComponent = STAGE_COMPONENTS[state.currentStage];
  const canGoBack = state.currentStage !== 'type';
  const isLastStage = state.currentStage === 'preview';

  // Track expanded/collapsed completed stages and current stage expansion
  const [expandedCompletedStages, setExpandedCompletedStages] = useState<Set<MetricStage>>(new Set());
  const [isCurrentExpanded, setIsCurrentExpanded] = useState(true);
  const stageRefs = useRef<Record<MetricStage, HTMLDivElement | null>>({} as Record<
    MetricStage,
    HTMLDivElement | null
  >);
  // Ref to access M2Operations save methods
  const m2OperationsRef = useRef<M2OperationsRef>(null);
  // State to track if operations can be saved (for button enablement)
  const [canSaveOperations, setCanSaveOperations] = useState(false);
  const [canSaveColumn, setCanSaveColumn] = useState(false);
  const [isSavingOperations, setIsSavingOperations] = useState(false);
  
  // Check if operations can be saved periodically when on operations stage
  useEffect(() => {
    if (state.currentStage !== 'operations') {
      setCanSaveOperations(false);
      setCanSaveColumn(false);
      setIsSavingOperations(false);
      return;
    }

    const checkCanSave = () => {
      const canSaveVar = m2OperationsRef.current?.canSaveVariable() || false;
      const canSaveCol = m2OperationsRef.current?.canSaveColumn() || false;
      const isSaving = m2OperationsRef.current?.isSaving() || false;
      
      if (canSaveVar !== canSaveOperations || canSaveCol !== canSaveColumn || isSaving !== isSavingOperations) {
        console.log('[MetricGuidedFlowInline] Operations canSave state changed:', {
          canSaveVar,
          canSaveCol,
          isSaving,
          hasCreatedItems: state.createdVariables.length > 0 || state.createdColumns.length > 0 || state.createdTables.length > 0,
        });
      }
      setCanSaveOperations(canSaveVar);
      setCanSaveColumn(canSaveCol);
      setIsSavingOperations(isSaving);
    };

    // Check immediately
    checkCanSave();

    // Check periodically while on operations stage
    const interval = setInterval(checkCanSave, 500);
    return () => clearInterval(interval);
  }, [state.currentStage, canSaveOperations, canSaveColumn, isSavingOperations, state.createdVariables.length, state.createdColumns.length, state.createdTables.length]);

  // Auto-scroll to current stage when it changes
  useEffect(() => {
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
    // Whenever we change stages, expand the new current stage by default
    setIsCurrentExpanded(true);
  }, [state.currentStage]);

  const toggleCompletedStage = useCallback((stage: MetricStage) => {
    setExpandedCompletedStages(prev => {
      const next = new Set(prev);
      if (next.has(stage)) {
        next.delete(stage);
      } else {
        next.add(stage);
      }
      return next;
    });
  }, []);

  const renderStageItem = useCallback(
    (stage: MetricStage) => {
      const isCompleted = isStageCompleted(stage, state.currentStage);
      const isCurrent = stage === state.currentStage;
      const isUpcoming = !isCompleted && !isCurrent;
      const StageComponent = STAGE_COMPONENTS[stage];
      const isExpanded =
        (isCurrent && isCurrentExpanded) ||
        (!isCurrent && isCompleted && expandedCompletedStages.has(stage));

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
          className={`w-full bg-white border-2 ${borderColor} rounded-lg shadow-sm mb-4 flex flex-col transition-all duration-200 ${
            isCurrent ? 'shadow-md' : ''
          }`}
        >
          {/* Stage Header */}
          {isCompleted ? (
            // Completed stages: clickable to expand/collapse
            <button
              onClick={() => toggleCompletedStage(stage)}
              className={`flex items-center justify-between px-6 py-4 border-b ${headerBg} hover:bg-opacity-80 transition-colors cursor-pointer w-full text-left`}
            >
              <div className="flex items-center gap-3">
                {statusIcon}
                <h3 className={`text-base font-semibold ${headerTextColor}`}>{STAGE_TITLES[stage]}</h3>
                <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full">
                  Completed
                </span>
              </div>
              {isExpanded ? (
                <ChevronUp className="w-5 h-5 text-gray-500" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-500" />
              )}
            </button>
          ) : isCurrent ? (
            // Current stage: also clickable to expand/collapse
            <button
              onClick={() => setIsCurrentExpanded(prev => !prev)}
              className={`flex items-center justify-between px-6 py-4 border-b ${headerBg} hover:bg-opacity-80 transition-colors cursor-pointer w-full text-left`}
            >
              <div className="flex items-center gap-3">
                {statusIcon}
                <h2 className={`text-lg font-semibold ${headerTextColor}`}>{STAGE_TITLES[stage]}</h2>
                <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
                  Current
                </span>
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
                <h2 className={`text-lg font-semibold ${headerTextColor}`}>{STAGE_TITLES[stage]}</h2>
                {isUpcoming && (
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
                    Upcoming
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Stage Content */}
          {isExpanded && (
            <div className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
              {isCurrent ? (
                <>
                  <div className={`p-6 ${stage === 'type' ? 'min-h-[120px]' : 'min-h-[320px]'}`}>
                    {stage === 'preview' ? (
                      <StageComponent 
                        flow={flow} 
                        onSave={handleNext} 
                        onClose={handleClose}
                      />
                    ) : stage === 'operations' ? (
                      <StageComponent ref={m2OperationsRef} flow={flow} />
                    ) : stage === 'dataset' ? (
                      <StageComponent flow={flow} contextAtomId={contextAtomId} />
                    ) : (
                      <StageComponent flow={flow} />
                    )}
                  </div>
                  {/* Navigation Footer for current stage */}
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
                        onClick={handleRestart}
                        className="flex items-center gap-2 text-gray-600"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Restart
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      {stage === 'preview' && <Button variant="outline" onClick={handleClose}>
                        Exit
                      </Button>}
                      {!isLastStage && stage === 'operations' ? (
                        // Operations stage: Show Save/Save As buttons based on selectedType
                        state.selectedType === 'variable' ? (
                          // Variable type: Show Save button
                          <Button
                            onClick={handleSaveVariable}
                            disabled={!canSaveOperations || isSavingOperations}
                            className="bg-[#458EE2] hover:bg-[#3a7bc7] text-white disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isSavingOperations ? 'Saving...' : 'Save'}
                          </Button>
                        ) : state.selectedType === 'column' ? (
                          // Column type: Show Save and Save As buttons
                          <>
                            <Button
                              onClick={handleSaveColumnAs}
                              disabled={!canSaveColumn || isSavingOperations}
                              variant="outline"
                              className="disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Save As
                            </Button>
                            <Button
                              onClick={handleSaveColumn}
                              disabled={!canSaveColumn || isSavingOperations}
                              className="bg-[#458EE2] hover:bg-[#3a7bc7] text-white disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isSavingOperations ? 'Saving...' : 'Save'}
                            </Button>
                          </>
                        ) : (
                          // Fallback: Show Continue button if type not set
                          <Button
                            onClick={handleNext}
                            disabled={!canProceedFromStep(stage)}
                            className="bg-[#458EE2] hover:bg-[#3a7bc7] text-white disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Continue
                          </Button>
                        )
                      ) : !isLastStage ? (
                        // Other stages: Show Continue button
                        <Button
                          onClick={handleNext}
                          disabled={!canProceedFromStep(stage)}
                          className="bg-[#458EE2] hover:bg-[#3a7bc7] text-white disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Continue
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </>
              ) : isCompleted && isExpanded ? (
                <div className="p-6 bg-gray-50">
                  {stage === 'preview' ? (
                    <StageComponent 
                      flow={flow} 
                      onSave={() => {}} 
                      onClose={handleClose}
                    />
                  ) : (
                    <StageComponent flow={flow} />
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>
      );
    },
    [
      state.currentStage,
      state.selectedType,
      expandedCompletedStages,
      flow,
      handleNext,
      handleBack,
      handleRestart,
      handleClose,
      handleSaveVariable,
      handleSaveColumn,
      handleSaveColumnAs,
      canGoBack,
      toggleCompletedStage,
      isLastStage,
      canSaveOperations,
      canSaveColumn,
      isSavingOperations,
      canProceedFromStep,
    ],
  );

  return (
    <Card className="w-full bg-white border-2 border-gray-200 rounded-lg shadow-sm p-6">
      <div className="w-full flex flex-col">
        {/* Header describing the inline metric workflow */}
        <div className="mb-4 px-1 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
          Follow these steps to build and review your metric
          </h2>
          <button onClick={handleClose} className="text-sm text-gray-600">
            <XIcon className="w-4 h-4" />
          </button>
        </div>
        {/* Render all stages in sequence (Shopify-style), mirroring GuidedUploadFlowInline */}
        {STAGE_ORDER.map(stage => renderStageItem(stage))}
      </div>
    </Card>
  );
};

