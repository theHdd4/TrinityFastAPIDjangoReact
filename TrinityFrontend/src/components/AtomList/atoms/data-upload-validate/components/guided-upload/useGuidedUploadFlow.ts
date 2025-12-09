import { useState, useCallback, useRef } from 'react';

export type UploadStage = 'U0' | 'U1' | 'U2' | 'U3' | 'U4' | 'U5' | 'U6' | 'U7';

export interface UploadedFileInfo {
  name: string;
  path: string;
  size: number;
  fileKey?: string;
  sheetNames?: string[];
  selectedSheet?: string;
  totalSheets?: number;
}

export interface HeaderSelection {
  headerRowIndex: number;
  headerRowCount: number; // 1, 2, or 3 for multi-row headers
  noHeader: boolean;
}

export interface ColumnNameEdit {
  originalName: string;
  editedName: string;
  aiSuggested?: boolean;
  historicalMatch?: boolean;
}

export interface DataTypeSelection {
  columnName: string;
  detectedType: string;
  selectedType: string;
  format?: string; // For date types
}

export interface MissingValueStrategy {
  columnName: string;
  strategy: 'fill_zero' | 'fill_mean' | 'fill_median' | 'forward_fill' | 'replace_unknown' | 'leave_missing' | 'drop_rows';
  value?: string | number;
}

export interface GuidedUploadFlowState {
  currentStage: UploadStage;
  uploadedFiles: UploadedFileInfo[];
  headerSelections: Record<string, HeaderSelection>; // keyed by file name
  columnNameEdits: Record<string, ColumnNameEdit[]>; // keyed by file name
  dataTypeSelections: Record<string, DataTypeSelection[]>; // keyed by file name
  missingValueStrategies: Record<string, MissingValueStrategy[]>; // keyed by file name
  fileMetadata: Record<string, {
    rowCount?: number;
    columnCount?: number;
    previewData?: any[][];
  }>;
}

const INITIAL_STATE: GuidedUploadFlowState = {
  currentStage: 'U0',
  uploadedFiles: [],
  headerSelections: {},
  columnNameEdits: {},
  dataTypeSelections: {},
  missingValueStrategies: {},
  fileMetadata: {},
};

export function useGuidedUploadFlow(initialState?: Partial<GuidedUploadFlowState>) {
  const [state, setState] = useState<GuidedUploadFlowState>(() => {
    if (initialState) {
      return {
        ...INITIAL_STATE,
        ...initialState,
        // Ensure all required fields are present
        uploadedFiles: initialState.uploadedFiles || [],
        headerSelections: initialState.headerSelections || {},
        columnNameEdits: initialState.columnNameEdits || {},
        dataTypeSelections: initialState.dataTypeSelections || {},
        missingValueStrategies: initialState.missingValueStrategies || {},
        fileMetadata: initialState.fileMetadata || {},
      };
    }
    return INITIAL_STATE;
  });
  const stateRef = useRef(state);
  
  // Keep ref in sync with state
  stateRef.current = state;

  const goToStage = useCallback((stage: UploadStage) => {
    setState(prev => ({ ...prev, currentStage: stage }));
  }, []);

  const goToNextStage = useCallback(() => {
    const stages: UploadStage[] = ['U0', 'U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7'];
    const currentIndex = stages.indexOf(state.currentStage);
    if (currentIndex < stages.length - 1) {
      goToStage(stages[currentIndex + 1]);
    }
  }, [state.currentStage, goToStage]);

  const goToPreviousStage = useCallback(() => {
    const stages: UploadStage[] = ['U0', 'U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7'];
    const currentIndex = stages.indexOf(state.currentStage);
    if (currentIndex > 0) {
      goToStage(stages[currentIndex - 1]);
    }
  }, [state.currentStage, goToStage]);

  const restartFlow = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  const addUploadedFiles = useCallback((files: UploadedFileInfo[]) => {
    setState(prev => ({
      ...prev,
      uploadedFiles: [...prev.uploadedFiles, ...files],
    }));
  }, []);

  const updateFileMetadata = useCallback((fileName: string, metadata: {
    rowCount?: number;
    columnCount?: number;
    previewData?: any[][];
  }) => {
    setState(prev => ({
      ...prev,
      fileMetadata: {
        ...prev.fileMetadata,
        [fileName]: {
          ...prev.fileMetadata[fileName],
          ...metadata,
        },
      },
    }));
  }, []);

  const setHeaderSelection = useCallback((fileName: string, selection: HeaderSelection) => {
    setState(prev => ({
      ...prev,
      headerSelections: {
        ...prev.headerSelections,
        [fileName]: selection,
      },
    }));
  }, []);

  const setColumnNameEdits = useCallback((fileName: string, edits: ColumnNameEdit[]) => {
    setState(prev => ({
      ...prev,
      columnNameEdits: {
        ...prev.columnNameEdits,
        [fileName]: edits,
      },
    }));
  }, []);

  const setDataTypeSelections = useCallback((fileName: string, selections: DataTypeSelection[]) => {
    setState(prev => ({
      ...prev,
      dataTypeSelections: {
        ...prev.dataTypeSelections,
        [fileName]: selections,
      },
    }));
  }, []);

  const setMissingValueStrategies = useCallback((fileName: string, strategies: MissingValueStrategy[]) => {
    setState(prev => ({
      ...prev,
      missingValueStrategies: {
        ...prev.missingValueStrategies,
        [fileName]: strategies,
      },
    }));
  }, []);

  const updateFileSheetSelection = useCallback((fileName: string, sheetName: string) => {
    setState(prev => ({
      ...prev,
      uploadedFiles: prev.uploadedFiles.map(file =>
        file.name === fileName ? { ...file, selectedSheet: sheetName } : file
      ),
    }));
  }, []);

  const updateUploadedFilePath = useCallback((fileName: string, newPath: string) => {
    setState(prev => ({
      ...prev,
      uploadedFiles: prev.uploadedFiles.map(file =>
        file.name === fileName ? { ...file, path: newPath, processed: true } : file
      ),
    }));
  }, []);

  return {
    state,
    goToStage,
    goToNextStage,
    goToPreviousStage,
    restartFlow,
    addUploadedFiles,
    updateFileMetadata,
    setHeaderSelection,
    setColumnNameEdits,
    setDataTypeSelections,
    setMissingValueStrategies,
    updateFileSheetSelection,
    updateUploadedFilePath,
  };
}

export type ReturnTypeFromUseGuidedUploadFlow = ReturnType<typeof useGuidedUploadFlow>;

