import { useCallback, useState, useRef } from 'react';

/**
 * Metric guided flow stages.
 *
 * We keep semantic string keys (type, dataset, operations, preview)
 * rather than numeric stages to align with existing MetricGuideFlowModal tabs.
 */
export type MetricStage = 'type' | 'dataset' | 'operations' | 'preview';

export interface CreatedVariable {
  name: string;
  value?: string;
  method: 'assign' | 'compute';
  description?: string;
  // Detailed operation information for better descriptions
  operationDetails?: {
    operationMethod: string; // 'sum', 'mean', 'max', etc.
    column?: string; // Column name used
    groupBy?: string[]; // Identifiers used for grouping
    secondColumn?: string; // For operations like add, subtract
    customName?: string;
  };
}

export interface CreatedColumn {
  columnName: string;
  tableName: string; // original table
  operations: string[]; // list of operations applied (kept for backward compatibility)
  objectName: string; // for URL construction
  // Detailed operation information
  operationDetails?: Array<{
    type: string; // Operation type
    columns: string[]; // Columns used
    method?: string; // For grouped operations (e.g., 'sum', 'mean')
    identifiers?: string[]; // For group by operations
    parameters?: Record<string, any>; // Additional parameters
  }>;
}

export interface CreatedTable {
  newTableName: string;
  originalTableName: string;
  objectName: string; // for URL construction
}

/**
 * Core metric flow payload shared across all steps.
 */
export interface MetricFlowState {
  selectedType: 'variable' | 'column' | null;
  dataSource: string;
  createdVariables: CreatedVariable[];
  createdColumns: CreatedColumn[];
  createdTables: CreatedTable[];
}

/**
 * Full guided flow state with current stage.
 */
export interface MetricGuidedFlowState extends MetricFlowState {
  currentStage: MetricStage;
  /** Tracks which stage we navigated back from (set by handleBack, cleared after processing) */
  navigatedBackFrom: MetricStage | null;
}

const INITIAL_FLOW_STATE: MetricFlowState = {
  selectedType: null,
  dataSource: '',
  createdVariables: [],
  createdColumns: [],
  createdTables: [],
};

const INITIAL_METRIC_GUIDED_STATE: MetricGuidedFlowState = {
  currentStage: 'type',
  navigatedBackFrom: null,
  ...INITIAL_FLOW_STATE,
};

export const STEP_ORDER: MetricStage[] = ['type', 'dataset', 'operations', 'preview'];

export interface UseMetricGuidedFlowResult {
  state: MetricGuidedFlowState;
  setState: React.Dispatch<React.SetStateAction<MetricGuidedFlowState>>;
  goToStage: (stage: MetricStage) => void;
  goToNextStage: () => void;
  goToPreviousStage: () => void;
  restartFlow: () => void;
  saveStageSnapshot: (stage: MetricStage) => void;
  restoreStageSnapshot: (stage: MetricStage) => MetricFlowState | null;
  clearStageSnapshot: (stage: MetricStage) => void;
  clearAllSnapshots: () => void;
}

/**
 * Hook that encapsulates the metric guided flow state machine.
 * Mirrors the pattern of useGuidedUploadFlow but tailored for metrics.
 */
export function useMetricGuidedFlow(
  initialState?: Partial<MetricGuidedFlowState>,
): UseMetricGuidedFlowResult {
  // Store snapshots of state at each stage when Continue is clicked
  const stageSnapshotsRef = useRef<Map<MetricStage, MetricFlowState>>(new Map());

  const [state, setState] = useState<MetricGuidedFlowState>(() => {
    if (!initialState) {
      return INITIAL_METRIC_GUIDED_STATE;
    }

    return {
      ...INITIAL_METRIC_GUIDED_STATE,
      ...initialState,
      // Ensure nested arrays are always present
      createdVariables: initialState.createdVariables ?? INITIAL_FLOW_STATE.createdVariables,
      createdColumns: initialState.createdColumns ?? INITIAL_FLOW_STATE.createdColumns,
      createdTables: initialState.createdTables ?? INITIAL_FLOW_STATE.createdTables,
      selectedType:
        initialState.selectedType !== undefined
          ? initialState.selectedType
          : INITIAL_FLOW_STATE.selectedType,
      dataSource: initialState.dataSource ?? INITIAL_FLOW_STATE.dataSource,
      currentStage: initialState.currentStage ?? INITIAL_METRIC_GUIDED_STATE.currentStage,
      navigatedBackFrom: null, // Always start with no back navigation flag
    };
  });

  const goToStage = useCallback((stage: MetricStage) => {
    setState(prev => {
      const currentIndex = STEP_ORDER.indexOf(prev.currentStage);
      const targetIndex = STEP_ORDER.indexOf(stage);
      
      // If moving forward to a later stage, save snapshot of current stage
      if (currentIndex !== -1 && targetIndex !== -1 && targetIndex > currentIndex) {
        const snapshot: MetricFlowState = {
          selectedType: prev.selectedType,
          dataSource: prev.dataSource,
          createdVariables: [...prev.createdVariables],
          createdColumns: [...prev.createdColumns],
          createdTables: [...prev.createdTables],
        };
        stageSnapshotsRef.current.set(prev.currentStage, snapshot);
      }
      
      return {
        ...prev,
        currentStage: stage,
      };
    });
  }, []);

  const goToNextStage = useCallback(() => {
    setState(prev => {
      const currentIndex = STEP_ORDER.indexOf(prev.currentStage);
      if (currentIndex === -1 || currentIndex >= STEP_ORDER.length - 1) {
        return prev;
      }
      
      // Save snapshot of current stage before moving forward
      const snapshot: MetricFlowState = {
        selectedType: prev.selectedType,
        dataSource: prev.dataSource,
        createdVariables: [...prev.createdVariables],
        createdColumns: [...prev.createdColumns],
        createdTables: [...prev.createdTables],
      };
      stageSnapshotsRef.current.set(prev.currentStage, snapshot);
      
      return {
        ...prev,
        currentStage: STEP_ORDER[currentIndex + 1],
      };
    });
  }, []);

  const goToPreviousStage = useCallback(() => {
    setState(prev => {
      const currentIndex = STEP_ORDER.indexOf(prev.currentStage);
      if (currentIndex <= 0) {
        return prev;
      }
      return {
        ...prev,
        currentStage: STEP_ORDER[currentIndex - 1],
      };
    });
  }, []);

  const restartFlow = useCallback(() => {
    setState(INITIAL_METRIC_GUIDED_STATE);
    stageSnapshotsRef.current.clear();
  }, []);

  // Save snapshot of current state for a specific stage
  const saveStageSnapshot = useCallback((stage: MetricStage, stateToSnapshot?: MetricGuidedFlowState) => {
    const stateToUse = stateToSnapshot || state;
    const snapshot: MetricFlowState = {
      selectedType: stateToUse.selectedType,
      dataSource: stateToUse.dataSource,
      createdVariables: [...stateToUse.createdVariables],
      createdColumns: [...stateToUse.createdColumns],
      createdTables: [...stateToUse.createdTables],
    };
    stageSnapshotsRef.current.set(stage, snapshot);
  }, [state]);

  // Restore snapshot for a specific stage
  const restoreStageSnapshot = useCallback((stage: MetricStage): MetricFlowState | null => {
    return stageSnapshotsRef.current.get(stage) || null;
  }, []);

  // Clear snapshot for a specific stage
  const clearStageSnapshot = useCallback((stage: MetricStage) => {
    stageSnapshotsRef.current.delete(stage);
  }, []);

  // Clear all snapshots
  const clearAllSnapshots = useCallback(() => {
    stageSnapshotsRef.current.clear();
  }, []);

  return {
    state,
    setState,
    goToStage,
    goToNextStage,
    goToPreviousStage,
    restartFlow,
    saveStageSnapshot,
    restoreStageSnapshot,
    clearStageSnapshot,
    clearAllSnapshots,
  };
}

export type ReturnTypeFromUseMetricGuidedFlow = ReturnType<typeof useMetricGuidedFlow>;

