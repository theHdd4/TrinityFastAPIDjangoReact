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
  processed?: boolean; // Whether file has been processed/saved (not just uploaded to tmp/)
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
  keep?: boolean; // Keep/Delete toggle - true = keep, false = delete
}

export interface DataTypeSelection {
  columnName: string;
  detectedType: string;
  selectedType: string;
  updateType?: string; // Backend data type: int, float, string, date, datetime, boolean
  format?: string; // For date types
  columnRole?: 'identifier' | 'measure'; // Identifier (dimension) or Measure (metric)
}

export interface MissingValueStrategy {
  columnName: string;
  strategy: 'drop' | 'mean' | 'median' | 'mode' | 'zero' | 'empty' | 'custom' | 'ffill' | 'bfill' | 'none';
  value?: string | number; // Required for 'custom' strategy
}

export interface GuidedUploadFlowState {
  currentStage: UploadStage;
  uploadedFiles: UploadedFileInfo[];
  selectedFileIndex?: number; // Index of the file selected in U1 for processing in subsequent stages
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
  currentStage: 'U2', // Start at U2 (Confirm Headers) - U1 removed
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
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f74def83-6ab6-4eaa-b691-535eeb501a5a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useGuidedUploadFlow.ts:92',message:'goToStage called',data:{to:stage,currentState:stateRef.current.currentStage},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    setState(prev => {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f74def83-6ab6-4eaa-b691-535eeb501a5a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useGuidedUploadFlow.ts:94',message:'goToStage setState',data:{from:prev.currentStage,to:stage},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      return { ...prev, currentStage: stage };
    });
  }, []);

  const goToNextStage = useCallback(() => {
    // U1 removed - start from U2
    const stages: UploadStage[] = ['U2', 'U3', 'U4', 'U5', 'U6', 'U7'];
    const currentIndex = stages.indexOf(state.currentStage);
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f74def83-6ab6-4eaa-b691-535eeb501a5a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'useGuidedUploadFlow.ts:96',message:'goToNextStage called',data:{currentStage:state.currentStage,currentIndex,nextStage:currentIndex < stages.length - 1 ? stages[currentIndex + 1] : 'none'},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'D'})}).catch(()=>{});
    // #endregion
    if (currentIndex < stages.length - 1) {
      goToStage(stages[currentIndex + 1]);
    }
  }, [state.currentStage, goToStage]);

  const goToPreviousStage = useCallback(() => {
    // U1 removed - start from U2
    const stages: UploadStage[] = ['U2', 'U3', 'U4', 'U5', 'U6', 'U7'];
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

  const setSelectedFileIndex = useCallback((fileIndex: number) => {
    setState(prev => ({
      ...prev,
      selectedFileIndex: fileIndex,
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
    setSelectedFileIndex,
  };
}

export type ReturnTypeFromUseGuidedUploadFlow = ReturnType<typeof useGuidedUploadFlow>;

