import { useState, useCallback } from 'react';

export type GroupByStage = 'measures' | 'grouping' | 'operations';

export interface MeasureConfig {
  field: string;
  aggregator: string;
  weight_by?: string;
  rename_to?: string;
}

export interface GroupByGuidedFlowState {
  currentStage: GroupByStage;
  dataSource?: string;
  // Add other state fields as needed for groupby workflow
  selectedMeasures?: string[];
  selectedIdentifiers?: string[];
  measureConfigs?: MeasureConfig[];
  isPerforming?: boolean;
  performCompleted?: boolean;
  canProceedToNext?: boolean; // Validation state for Next button
  [key: string]: any; // Allow additional fields
}

const STAGE_ORDER: GroupByStage[] = ['measures', 'grouping', 'operations'];

export const useGroupByGuidedFlow = (initialState?: Partial<GroupByGuidedFlowState>) => {
  const [state, setState] = useState<GroupByGuidedFlowState>({
    currentStage: 'measures',
    ...initialState,
  });

  const getStageIndex = useCallback((stage: GroupByStage): number => {
    return STAGE_ORDER.indexOf(stage);
  }, []);

  const goToNextStage = useCallback(() => {
    setState(prev => {
      const currentIndex = getStageIndex(prev.currentStage);
      if (currentIndex < STAGE_ORDER.length - 1) {
        return {
          ...prev,
          currentStage: STAGE_ORDER[currentIndex + 1],
          canProceedToNext: false, // Reset validation for new stage
        };
      }
      return prev;
    });
  }, [getStageIndex]);

  const goToPreviousStage = useCallback(() => {
    setState(prev => {
      const currentIndex = getStageIndex(prev.currentStage);
      if (currentIndex > 0) {
        return {
          ...prev,
          currentStage: STAGE_ORDER[currentIndex - 1],
          canProceedToNext: false, // Reset validation for new stage
        };
      }
      return prev;
    });
  }, [getStageIndex]);

  const goToStage = useCallback((stage: GroupByStage) => {
    setState(prev => ({
      ...prev,
      currentStage: stage,
      canProceedToNext: false, // Reset validation for new stage
    }));
  }, []);

  const restartFlow = useCallback(() => {
    setState({
      currentStage: 'measures',
      selectedMeasures: [],
      selectedIdentifiers: [],
      measureConfigs: [],
      isPerforming: false,
      performCompleted: false,
      canProceedToNext: false,
    });
  }, []);

  const updateState = useCallback((updates: Partial<GroupByGuidedFlowState>) => {
    setState(prev => ({
      ...prev,
      ...updates,
    }));
  }, []);

  return {
    state,
    setState,
    goToNextStage,
    goToPreviousStage,
    goToStage,
    restartFlow,
    updateState,
    STAGE_ORDER,
  };
};
