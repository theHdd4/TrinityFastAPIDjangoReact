import { useState, useCallback } from 'react';

export interface MeasureConfig {
  field: string;
  aggregator: string;
  weight_by?: string;
  rename_to?: string;
}

export interface GroupByGuidedFlowState {
  dataSource?: string;
  selectedIdentifiers?: string[];
  measureConfigs?: MeasureConfig[];
  isPerforming?: boolean;
  [key: string]: any;
}

export const useGroupByGuidedFlow = (initialState?: Partial<GroupByGuidedFlowState>) => {
  const [state, setState] = useState<GroupByGuidedFlowState>({
    ...initialState,
  });

  const restartFlow = useCallback(() => {
    setState({
      selectedIdentifiers: [],
      measureConfigs: [],
      isPerforming: false,
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
    restartFlow,
    updateState,
  };
};
