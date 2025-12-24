import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { useGuidedUploadFlow, type UploadStage, type GuidedUploadFlowState } from './useGuidedUploadFlow';
import { U2UnderstandingFiles } from './stages/U2UnderstandingFiles';
import { U3ReviewColumnNames } from './stages/U3ReviewColumnNames';
import { U4ReviewDataTypes } from './stages/U4ReviewDataTypes';
import { U5MissingValues } from './stages/U5MissingValues';
import { U6FinalPreview } from './stages/U6FinalPreview';
import { ArrowLeft, RotateCcw, CheckCircle2, ChevronDown, ChevronUp, Maximize2 } from 'lucide-react';
import { useGuidedFlowPersistence } from '@/components/LaboratoryMode/hooks/useGuidedFlowPersistence';
import { getActiveProjectContext } from '@/utils/projectEnv';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { UPLOAD_API } from '@/lib/api';

interface GuidedUploadFlowInlineProps {
  atomId: string;
  onComplete?: (result: {
    uploadedFiles: any[];
    headerSelections: Record<string, any>;
    columnNameEdits: Record<string, any[]>;
    dataTypeSelections: Record<string, any[]>;
    missingValueStrategies: Record<string, any[]>;
  }) => void;
  /** If provided, start from an existing dataframe */
  existingDataframe?: {
    name: string;
    path: string;
    size?: number;
  };
  /** Initial stage to start from (default: U2 - U0 and U1 removed) */
  initialStage?: UploadStage;
  /** Saved state to restore (for resuming) */
  savedState?: Partial<GuidedUploadFlowState>;
  /** Callback when flow should be closed */
  onClose?: () => void;
  /** Whether the flow is in maximization mode (shows 20 rows instead of 5) */
  isMaximized?: boolean;
}

// Only U2-U6 are used now (U0, U1, and U7 removed)
const STAGE_COMPONENTS: Partial<Record<UploadStage, React.ComponentType<any>>> = {
  U2: U2UnderstandingFiles,
  U3: U3ReviewColumnNames,
  U4: U4ReviewDataTypes,
  U5: U5MissingValues,
  U6: U6FinalPreview,
};

const STAGE_TITLES: Partial<Record<UploadStage, string>> = {
  U2: 'Confirm Your Column Headers',
  U3: 'Review Your Column Names',
  U4: 'Review Your Column Types',
  U5: 'Review Missing Values',
  U6: 'Final Preview Before Priming', // U6 handles priming - no U7 needed
};

// Stage order: only U2-U6 (U0, U1, and U7 removed)
const STAGE_ORDER: UploadStage[] = ['U2', 'U3', 'U4', 'U5', 'U6'];

// All stages are visible in the inline flow
const VISIBLE_STAGES: UploadStage[] = ['U2', 'U3', 'U4', 'U5', 'U6'];

// Helper to get stage index
const getStageIndex = (stage: UploadStage): number => {
  return STAGE_ORDER.indexOf(stage);
};

// Helper to get display step number (U2=1, U3=2, etc.)
const getDisplayStepNumber = (stage: UploadStage): number => {
  const stageMap: Partial<Record<UploadStage, number>> = {
    'U2': 1,
    'U3': 2,
    'U4': 3,
    'U5': 4,
    'U6': 5,
  };
  return stageMap[stage] || 0;
};

// Helper to check if a stage is completed
const isStageCompleted = (stage: UploadStage, currentStage: UploadStage): boolean => {
  return getStageIndex(stage) < getStageIndex(currentStage);
};

export const GuidedUploadFlowInline: React.FC<GuidedUploadFlowInlineProps> = ({
  atomId,
  onComplete,
  existingDataframe,
  initialStage,
  savedState,
  onClose,
  isMaximized = false,
}) => {
  // CRITICAL FIX: If existingDataframe is provided, merge its path into savedState BEFORE initializing the hook
  // This ensures the correct path (with folder structure) is used even if savedState has a wrong/stripped path
  const mergedSavedState = useMemo(() => {
    if (existingDataframe && existingDataframe.path && savedState?.uploadedFiles) {
      // Check if any file in savedState matches existingDataframe.name but has wrong path
      const updatedFiles = savedState.uploadedFiles.map(file => {
        if (file.name === existingDataframe.name && file.path !== existingDataframe.path) {
          console.log('🔧 [GuidedUploadFlowInline] Merging correct path into savedState:', {
            fileName: file.name,
            oldPath: file.path,
            newPath: existingDataframe.path
          });
          return { ...file, path: existingDataframe.path };
        }
        return file;
      });
      
      // If no matching file found, add it
      const hasMatchingFile = updatedFiles.some(f => f.name === existingDataframe.name);
      if (!hasMatchingFile) {
        updatedFiles.push({
          name: existingDataframe.name,
          path: existingDataframe.path,
          size: existingDataframe.size || 0,
        });
        console.log('🔧 [GuidedUploadFlowInline] Added file with correct path to savedState');
      }
      
      return {
        ...savedState,
        uploadedFiles: updatedFiles,
      };
    }
    return savedState;
  }, [existingDataframe, savedState]);
  
  const flow = useGuidedUploadFlow(mergedSavedState);
  const { state, goToNextStage, goToPreviousStage, restartFlow, addUploadedFiles, goToStage, updateUploadedFilePath } = flow;
  const { saveState, markFileAsPrimed } = useGuidedFlowPersistence();
  const { setActiveGuidedFlow, updateGuidedFlowStage, removeActiveGuidedFlow } = useLaboratoryStore();
  
  // Get the store's current stage for this atom to sync with right panel clicks
  const storeCurrentStage = useLaboratoryStore((s) => s.activeGuidedFlows[atomId]?.currentStage);

  // Refs to track previous values and prevent unnecessary saves
  const prevStageRef = useRef<UploadStage | null>(null);
  const lastInternalStageRef = useRef<UploadStage>(state.currentStage);
  const prevStateStringRef = useRef<string>('');
  const prevStoreStateStringRef = useRef<string>('');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialMountRef = useRef(true);
  const lastSavedStateRef = useRef<string>('');
  const u2ContinueHandlerRef = useRef<(() => void) | null>(null);
  const u2ContinueDisabledRef = useRef<(() => boolean) | null>(null);

  // Create stable state string representation - only recalculate when actual values change
  const stateString = useMemo(() => {
    return JSON.stringify({
      currentStage: state.currentStage,
      uploadedFiles: state.uploadedFiles,
      headerSelections: state.headerSelections,
      columnNameEdits: state.columnNameEdits,
      dataTypeSelections: state.dataTypeSelections,
      missingValueStrategies: state.missingValueStrategies,
    });
  }, [
    state.currentStage,
    state.uploadedFiles.length, // Only track length to avoid reference issues
    state.uploadedFiles.map(f => f.name + f.path).join(','), // Track file identity
    Object.keys(state.headerSelections).length,
    Object.keys(state.columnNameEdits).length,
    Object.keys(state.dataTypeSelections).length,
    Object.keys(state.missingValueStrategies).length,
  ]);

  // Determine initial stage - always start from U2 now (U0 and U1 removed)
  const effectiveInitialStage = initialStage || 'U2';

  // Track if we've already initialized from savedState to prevent re-initialization
  const hasInitializedFromSavedStateRef = useRef(false);
  
  // Initialize flow state
  useEffect(() => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f74def83-6ab6-4eaa-b691-535eeb501a5a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'GuidedUploadFlowInline.tsx:119',message:'Init effect triggered',data:{currentStage:state.currentStage,effectiveInitialStage,hasSavedState:!!savedState?.currentStage,savedStateStage:savedState?.currentStage,hasExistingDataframe:!!existingDataframe,uploadedFilesLength:state.uploadedFiles.length,hasInitialized:hasInitializedFromSavedStateRef.current},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
    // #endregion
    
    // If saved state provided, use it (for resuming) - but only once on mount
    if (savedState && savedState.currentStage && !hasInitializedFromSavedStateRef.current) {
      if (state.currentStage !== savedState.currentStage) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/f74def83-6ab6-4eaa-b691-535eeb501a5a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'GuidedUploadFlowInline.tsx:123',message:'Resetting stage from savedState (first time only)',data:{from:state.currentStage,to:savedState.currentStage},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
        // #endregion
        hasInitializedFromSavedStateRef.current = true;
        goToStage(savedState.currentStage);
      } else {
        hasInitializedFromSavedStateRef.current = true;
      }
      return;
    }
    
    // Mark as initialized if we had savedState but didn't need to change stage
    if (savedState && savedState.currentStage && !hasInitializedFromSavedStateRef.current) {
      hasInitializedFromSavedStateRef.current = true;
    }

    // If existing dataframe provided, initialize flow with it
    // CRITICAL: Use existingDataframe.path as-is - it should contain the full MinIO path including folder structure
    // For Excel sheets in folders, this should be something like: "Quant Matrix AI/blank/New Custom Project/folder_name/sheets/Sheet1.arrow"
    // IMPORTANT: Always use the fresh existingDataframe path, even if savedState has files, to ensure the correct path is used
    if (existingDataframe) {
      console.log('🔍 [GuidedUploadFlowInline] Initializing with existing dataframe:', {
        name: existingDataframe.name,
        path: existingDataframe.path,
        fullDataframe: existingDataframe,
        currentUploadedFilesLength: state.uploadedFiles.length,
        currentUploadedFilesPaths: state.uploadedFiles.map(f => f.path)
      });
      
      // Validate that path includes folder structure for Excel sheets
      const path = existingDataframe.path || '';
      const pathSegments = path.split('/').filter(s => s.length > 0);
      const isExcelFolderFile = pathSegments.length >= 5 && pathSegments[pathSegments.length - 3] === 'sheets';
      
      if (isExcelFolderFile) {
        console.log('✅ [GuidedUploadFlowInline] Detected Excel folder file, path includes folder structure:', path);
      } else {
        console.warn('⚠️ [GuidedUploadFlowInline] Path may not include folder structure:', path, 'segments:', pathSegments);
      }
      
      // CRITICAL FIX: Always replace uploadedFiles with the fresh existingDataframe path
      // This ensures we use the correct path even if savedState has an old/stripped path
      // IMPORTANT: We need to update the path immediately, regardless of what's in state
      // because savedState might have a wrong/stripped path that needs to be corrected
      
      // Find matching file by name (path might be wrong)
      const existingFileIndex = state.uploadedFiles.findIndex(f => f.name === existingDataframe.name);
      const existingFile = existingFileIndex >= 0 ? state.uploadedFiles[existingFileIndex] : null;
      const hasCorrectPath = existingFile && existingFile.path === existingDataframe.path;
      
      if (!hasCorrectPath) {
        console.log('🔧 [GuidedUploadFlowInline] Path mismatch detected - correcting path:', {
          existingPath: existingFile?.path || '(no file found)',
          correctPath: existingDataframe.path,
          fileName: existingDataframe.name,
          existingFileIndex,
          uploadedFilesLength: state.uploadedFiles.length
        });
        
        if (state.uploadedFiles.length === 0) {
          // No files yet, add the correct one
          addUploadedFiles([{
            name: existingDataframe.name,
            path: existingDataframe.path, // Use exact path from existingDataframe - should include full folder structure
            size: existingDataframe.size || 0,
          }]);
          console.log('✅ [GuidedUploadFlowInline] Added file with correct path via addUploadedFiles');
        } else if (existingFileIndex >= 0 && updateUploadedFilePath) {
          // File exists but path is wrong - update it
          updateUploadedFilePath(existingDataframe.name, existingDataframe.path);
          console.log('✅ [GuidedUploadFlowInline] Updated file path via updateUploadedFilePath:', {
            fileName: existingDataframe.name,
            oldPath: existingFile.path,
            newPath: existingDataframe.path
          });
        } else if (state.uploadedFiles.length > 0 && updateUploadedFilePath) {
          // File might be at index 0 even if name doesn't match (edge case)
          // Update the first file's path to match existingDataframe
          const firstFile = state.uploadedFiles[0];
          updateUploadedFilePath(firstFile.name, existingDataframe.path);
          console.log('⚠️ [GuidedUploadFlowInline] Updated first file path (name mismatch, using path from existingDataframe):', {
            fileName: firstFile.name,
            oldPath: firstFile.path,
            newPath: existingDataframe.path,
            existingDataframeName: existingDataframe.name
          });
        } else {
          console.error('❌ [GuidedUploadFlowInline] Cannot update path - updateUploadedFilePath not available or unexpected state');
        }
      } else {
        console.log('✅ [GuidedUploadFlowInline] File already has correct path, no update needed:', {
          fileName: existingDataframe.name,
          path: existingDataframe.path
        });
      }
    }

    // Set initial stage if we're not at a valid stage (U2-U6)
    if (!['U2', 'U3', 'U4', 'U5', 'U6'].includes(state.currentStage) && !hasInitializedFromSavedStateRef.current) {
      goToStage(effectiveInitialStage);
    }
  }, [existingDataframe, initialStage, effectiveInitialStage, savedState, state.currentStage, state.uploadedFiles.length, state.uploadedFiles, addUploadedFiles, updateUploadedFilePath, goToStage]);

  // Debounced save function
  const debouncedSave = useCallback((stateToSave: GuidedUploadFlowState) => {
    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Debounce save by 500ms
    saveTimeoutRef.current = setTimeout(() => {
      saveState(stateToSave);
      saveTimeoutRef.current = null;
    }, 500);
  }, [saveState]);

  // Update store when state changes (only on actual meaningful changes)
  // Use stateString to prevent unnecessary re-renders
  useEffect(() => {
    // Only update store if state actually changed
    if (stateString !== prevStoreStateStringRef.current) {
      prevStoreStateStringRef.current = stateString;
      
      // Use a stable state snapshot
      const stateSnapshot = {
        currentStage: state.currentStage,
        uploadedFiles: state.uploadedFiles,
        headerSelections: state.headerSelections,
        columnNameEdits: state.columnNameEdits,
        dataTypeSelections: state.dataTypeSelections,
        missingValueStrategies: state.missingValueStrategies,
        fileMetadata: state.fileMetadata,
      };
      
      // Track stage changes separately
      const stageChanged = prevStageRef.current !== state.currentStage;
      if (stageChanged) {
        // #region agent log
        fetch('http://127.0.0.1:7242/ingest/f74def83-6ab6-4eaa-b691-535eeb501a5a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'GuidedUploadFlowInline.tsx:177',message:'Stage changed detected',data:{from:prevStageRef.current,to:state.currentStage},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
        // #endregion
        prevStageRef.current = state.currentStage;
      }
      
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f74def83-6ab6-4eaa-b691-535eeb501a5a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'GuidedUploadFlowInline.tsx:180',message:'Calling setActiveGuidedFlow',data:{atomId,stage:state.currentStage,stageChanged},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
      // #endregion
      setActiveGuidedFlow(atomId, state.currentStage, stateSnapshot);
    }
  }, [atomId, stateString, state.currentStage, state.fileMetadata, setActiveGuidedFlow]);

  // Save state only when meaningful changes occur (debounced)
  // Use stateString to prevent unnecessary re-renders
  useEffect(() => {
    // Skip on initial mount
    if (isInitialMountRef.current) {
      isInitialMountRef.current = false;
      prevStateStringRef.current = stateString;
      lastSavedStateRef.current = stateString;
      return;
    }

    // Only save if state actually changed and hasn't been saved yet
    if (stateString !== prevStateStringRef.current && stateString !== lastSavedStateRef.current) {
      prevStateStringRef.current = stateString;
      lastSavedStateRef.current = stateString;
      debouncedSave(state);
    }
  }, [stateString, debouncedSave, state]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Sync with store's stage when right panel navigation occurs (EXTERNAL navigation only)
  // This allows clicking on steps in the right panel to navigate the canvas
  useEffect(() => {
    // Only process if store has a valid stage and it differs from internal state
    if (!storeCurrentStage || storeCurrentStage === state.currentStage) {
      lastInternalStageRef.current = state.currentStage;
      return;
    }
    
    // Detect EXTERNAL navigation (from right panel clicking):
    // - Store changed to a different stage
    // - But our internal state hasn't changed since last render (lastInternalStageRef)
    // This distinguishes from INTERNAL navigation where internal changes first, then store catches up
    
    const internalJustChanged = state.currentStage !== lastInternalStageRef.current;
    
    if (internalJustChanged) {
      // Internal state just changed - this is internal navigation (Continue button)
      // Store will catch up via the setActiveGuidedFlow effect, don't interfere
      lastInternalStageRef.current = state.currentStage;
      return;
    }
    
    // Internal state hasn't changed but store is different = EXTERNAL navigation from right panel
    const storeIndex = getStageIndex(storeCurrentStage);
    const currentIndex = getStageIndex(state.currentStage);
    
    // Only allow backward navigation from the right panel (going to completed steps)
    if (storeIndex < currentIndex) {
      lastInternalStageRef.current = storeCurrentStage;
      goToStage(storeCurrentStage);
    }
  }, [storeCurrentStage, state.currentStage, goToStage]);

  // No need to mark as primed here - U6FinalPreview handles it

  const handleNext = async () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f74def83-6ab6-4eaa-b691-535eeb501a5a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'GuidedUploadFlowInline.tsx:221',message:'handleNext called',data:{currentStage:state.currentStage},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    if (state.currentStage === 'U6') {
      // U6FinalPreview's handleSave already handles everything:
      // - process_saved_dataframe (overwrites file in-place)
      // - save_config (saves classifications)
      // - mark as primed
      // So we just move to the next stage - no additional processing needed
      goToNextStage();
    } else if (state.currentStage === 'U7') {
      // Flow complete - U6FinalPreview already did all the work
      onComplete?.({
        uploadedFiles: state.uploadedFiles,
        headerSelections: state.headerSelections,
        columnNameEdits: state.columnNameEdits,
        dataTypeSelections: state.dataTypeSelections,
        missingValueStrategies: state.missingValueStrategies,
      });
      
      // Don't remove flow - keep it open per user preference
    } else if (state.currentStage === 'U5') {
      // Apply missing value transformations when leaving U5
      // Using the same API as SavedDataFramesPanel (/process_saved_dataframe) which works correctly
      const chosenIndex = state.selectedFileIndex !== undefined && state.selectedFileIndex < state.uploadedFiles.length 
        ? state.selectedFileIndex : 0;
      const currentFile = state.uploadedFiles[chosenIndex];
      
      if (currentFile?.path) {
        const currentStrategies = state.missingValueStrategies[currentFile.name] || [];
        
        // Build instructions array in the same format as SavedDataFramesPanel
        const instructions: Array<{ column: string; missing_strategy?: string; custom_value?: string | number }> = [];
        
        currentStrategies.forEach(s => {
          if (s.strategy !== 'none') {
            const instruction: { column: string; missing_strategy?: string; custom_value?: string | number } = {
              column: s.columnName,
              missing_strategy: s.strategy,
            };
            if (s.strategy === 'custom' && s.value !== undefined) {
              instruction.custom_value = s.value;
            }
            instructions.push(instruction);
          }
        });
        
        // Apply missing value transformations if there are any
        if (instructions.length > 0) {
          try {
            console.log('🔄 U5->U6: Applying missing value transformations via process_saved_dataframe:', instructions);
            
            const transformRes = await fetch(`${UPLOAD_API}/process_saved_dataframe`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                object_name: currentFile.path,
                instructions: instructions,
              }),
            });
            
            if (transformRes.ok) {
              const result = await transformRes.json();
              console.log('✅ U5->U6: Missing value transformations applied successfully:', result);
            } else {
              const errorText = await transformRes.text();
              console.warn('⚠️ U5->U6: Failed to apply missing value transformations:', errorText);
            }
          } catch (error) {
            console.error('❌ U5->U6: Error applying missing value transformations:', error);
          }
        }
      }
      
      goToNextStage();
    } else {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f74def83-6ab6-4eaa-b691-535eeb501a5a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'GuidedUploadFlowInline.tsx:242',message:'Calling goToNextStage (default)',data:{from:state.currentStage},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      goToNextStage();
    }
  };

  const handleBack = () => {
    // U2 is the first stage - if at U2, close the guided flow
    if (state.currentStage === 'U2') {
      onClose?.();
    } else {
      goToPreviousStage();
    }
  };

  const handleRestart = () => {
    restartFlow();
  };

  const handleClose = () => {
    removeActiveGuidedFlow(atomId);
    onClose?.();
  };

  const CurrentStageComponent = STAGE_COMPONENTS[state.currentStage];
  // U2 is the first stage in the panel
  const canGoBack = state.currentStage !== 'U2';
  const isLastStage = state.currentStage === 'U6';

  // Track expanded collapsed stages (for viewing completed stages)
  const [expandedCompletedStages, setExpandedCompletedStages] = useState<Set<UploadStage>>(new Set());
  
  // Track if current stage is collapsed
  const [isCurrentStageCollapsed, setIsCurrentStageCollapsed] = useState(false);
  
  // Handle when user makes changes on an expanded completed stage
  const handleCompletedStageChange = useCallback((stage: UploadStage) => {
    // Only handle if this is a completed stage that's expanded but not current
    const isCompleted = isStageCompleted(stage, state.currentStage);
    const isExpanded = expandedCompletedStages.has(stage);
    
    if (isCompleted && isExpanded && stage !== state.currentStage) {
      // Make this stage current
      goToStage(stage);
      
      // Collapse all stages below this one (they need to be redone)
      setExpandedCompletedStages(prev => {
        const next = new Set(prev);
        const currentIndex = getStageIndex(stage);
        STAGE_ORDER.forEach(s => {
          if (getStageIndex(s) > currentIndex) {
            next.delete(s);
          }
        });
        return next;
      });
    }
  }, [state.currentStage, expandedCompletedStages, goToStage]);

  // Monitor flow state changes to detect when user makes changes on expanded completed stages
  const prevFlowStateRef = useRef<string>('');
  useEffect(() => {
    // Check if we're viewing an expanded completed stage
    const viewingCompletedStage = Array.from(expandedCompletedStages).find(stage => {
      const isCompleted = isStageCompleted(stage, state.currentStage);
      return isCompleted && stage !== state.currentStage;
    });

    if (viewingCompletedStage && stateString !== prevFlowStateRef.current && prevFlowStateRef.current !== '') {
      // State changed while viewing a completed stage - user made a change
      // Make that stage current and collapse stages below
      handleCompletedStageChange(viewingCompletedStage);
    }
    
    prevFlowStateRef.current = stateString;
  }, [stateString, expandedCompletedStages, state.currentStage, handleCompletedStageChange]);
  
  // Ref for scrolling to current stage
  const stageRefs = useRef<Record<UploadStage, HTMLDivElement | null>>({} as Record<UploadStage, HTMLDivElement | null>);

  // Auto-scroll to current stage when it changes and ensure it's expanded
  useEffect(() => {
    // Auto-expand current stage when it changes
    setIsCurrentStageCollapsed(false);
    
    const currentStageElement = stageRefs.current[state.currentStage];
    if (currentStageElement) {
      // Smooth scroll to current stage
      setTimeout(() => {
        currentStageElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start',
          inline: 'nearest'
        });
      }, 100);
    }
  }, [state.currentStage]);

  const toggleCompletedStage = useCallback((stage: UploadStage) => {
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

  const toggleCurrentStage = useCallback(() => {
    setIsCurrentStageCollapsed(prev => !prev);
  }, []);

  // Memoize stage rendering to prevent unnecessary re-renders
  const renderStageItem = useCallback((stage: UploadStage) => {
    const isCompleted = isStageCompleted(stage, state.currentStage);
    const isCurrent = stage === state.currentStage;
    const isUpcoming = !isCompleted && !isCurrent;
    const StageComponent = STAGE_COMPONENTS[stage];
    const isExpanded = (isCurrent && !isCurrentStageCollapsed) || (isCompleted && expandedCompletedStages.has(stage));

    // Determine stage status and styling
    let statusIcon: React.ReactNode;
    let headerBg = 'bg-white';
    let borderColor = 'border-gray-200';
    let headerTextColor = 'text-gray-900';

    if (isCompleted) {
      statusIcon = <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />;
      headerBg = 'bg-gray-50';
      borderColor = 'border-gray-200';
    } else if (isCurrent) {
      // Get the display step number (U2=1, U3=2, etc. since U0 and U1 are removed)
      const stepNumber = getDisplayStepNumber(stage);
      statusIcon = (
        <div className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-semibold flex-shrink-0">
          {stepNumber}
        </div>
      );
      headerBg = 'bg-gray-50';
      borderColor = 'border-gray-200';
    } else {
      statusIcon = (
        <div className="w-4 h-4 rounded-full border-2 border-dashed border-gray-300 flex-shrink-0" />
      );
      headerBg = 'bg-gray-50';
      borderColor = 'border-gray-200';
      headerTextColor = 'text-gray-500';
    }

    return (
      <div 
        key={stage}
        ref={(el) => {
          if (el) {
            stageRefs.current[stage] = el;
          }
        }}
        className={`w-full bg-white border-2 ${borderColor} rounded-lg mb-4 flex flex-col transition-all duration-200 ${
          isCurrent ? 'shadow-md' : 'shadow-sm'
        }`}
      >
        {/* Stage Header */}
        {isCompleted ? (
          <div className={`flex items-center justify-between px-4 py-3 border-b border-gray-100 ${headerBg} hover:bg-gray-100 transition-colors w-full`}>
            <button
              onClick={() => toggleCompletedStage(stage)}
              className="flex items-center gap-2 flex-1 text-left"
            >
              {statusIcon}
              <h3 className={`text-sm font-semibold ${headerTextColor}`}>
                {STAGE_TITLES[stage]}
              </h3>
              <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">Completed</span>
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(
                      new CustomEvent('laboratory-card-expand', {
                        detail: { atomId },
                      }),
                    );
                  }
                }}
                className="p-1.5 hover:bg-gray-200 rounded transition-colors"
                title="Maximize Card"
              >
                <Maximize2 className="w-4 h-4 text-gray-600" />
              </button>
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              )}
            </div>
          </div>
        ) : (
          <div className={`flex items-center justify-between px-4 py-3 border-b border-gray-100 ${headerBg} flex-shrink-0 w-full transition-colors ${
            isCurrent ? 'hover:bg-gray-100' : ''
          }`}>
            <button
              onClick={isCurrent ? toggleCurrentStage : undefined}
              className={`flex items-center gap-2 relative flex-1 text-left ${
                isCurrent ? 'cursor-pointer' : 'cursor-default'
              }`}
            >
              <div className="flex items-center gap-2 relative">
                {/* Blue line inside - positioned on the left of the content */}
                {isCurrent && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#458EE2] rounded-r" />
                )}
                <div className={`flex items-center gap-2 ${isCurrent ? 'pl-3' : ''}`}>
                  {statusIcon}
                  <h3 className={`text-sm font-semibold ${headerTextColor}`}>
                    {STAGE_TITLES[stage]}
                  </h3>
                  {isCurrent && (
                    <span className="text-xs text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">Current</span>
                  )}
                  {isUpcoming && (
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Upcoming</span>
                  )}
                </div>
              </div>
            </button>
            <div className="flex items-center gap-2">
              {(isCurrent || isCompleted) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(
                        new CustomEvent('laboratory-card-expand', {
                          detail: { atomId },
                        }),
                      );
                    }
                  }}
                  className="p-1.5 hover:bg-gray-200 rounded transition-colors"
                  title="Maximize Card"
                >
                  <Maximize2 className="w-4 h-4 text-gray-600" />
                </button>
              )}
              {isCurrent && (
                isExpanded ? (
                  <ChevronUp className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-500" />
                )
              )}
            </div>
          </div>
        )}

        {/* Stage Content - Only show if current or expanded */}
        {isExpanded && (
          <div className="flex-1 overflow-y-auto">
                {isCurrent ? (
              <>
                <div className="p-6 min-h-[10px]">
                  {state.currentStage === 'U2' ? (
                    <StageComponent 
                      flow={flow} 
                      onNext={handleNext} 
                      onBack={handleBack}
                      onRestart={handleRestart}
                      onCancel={handleClose}
                      onRegisterContinueHandler={(handler) => {
                        u2ContinueHandlerRef.current = handler;
                      }}
                      onRegisterContinueDisabled={(getDisabled) => {
                        u2ContinueDisabledRef.current = getDisabled;
                      }}
                      isMaximized={isMaximized}
                    />
                  ) : state.currentStage === 'U6' ? (
                    <StageComponent 
                      flow={flow} 
                      onNext={handleNext} 
                      onBack={handleBack}
                      onGoToStage={goToStage}
                      isMaximized={isMaximized}
                    />
                  ) : (
                    <StageComponent flow={flow} onNext={handleNext} onBack={handleBack} isMaximized={isMaximized} />
                  )}
                </div>

                {/* Navigation Footer for current stage */}
                {state.currentStage !== 'U6' && (
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
                      {state.currentStage !== 'U2' && (
                        <Button
                          variant="ghost"
                          onClick={handleRestart}
                          className="flex items-center gap-2 text-gray-600"
                        >
                          <RotateCcw className="w-4 h-4" />
                          Reset option
                        </Button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={handleClose}>
                        Cancel
                      </Button>
                      {!isLastStage && (
                        <Button
                          onClick={() => {
                            // Use U2's custom handler if available, otherwise use default handleNext
                            if (state.currentStage === 'U2' && u2ContinueHandlerRef.current) {
                              u2ContinueHandlerRef.current();
                            } else {
                              handleNext();
                            }
                          }}
                          disabled={state.currentStage === 'U2' && u2ContinueDisabledRef.current ? u2ContinueDisabledRef.current() : false}
                          className={state.currentStage === 'U2' && u2ContinueDisabledRef.current && u2ContinueDisabledRef.current() 
                            ? "bg-gray-400 hover:bg-gray-400 text-white cursor-not-allowed" 
                            : "bg-[#458EE2] hover:bg-[#3a7bc7] text-white"}
                        >
                          Continue
                        </Button>
                      )}
                      {isLastStage && (
                        <Button
                          onClick={handleNext}
                          className="bg-[#41C185] hover:bg-[#36a870] text-white"
                        >
                          Proceed to Next Steps
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : isCompleted && isExpanded ? (
              <>
                <div className="p-6 min-h-[10px]">
                  {stage === 'U2' ? (
                    <StageComponent 
                      flow={flow} 
                      onNext={() => {}} 
                      onBack={() => {}}
                      onRestart={handleRestart}
                      onCancel={handleClose}
                      onStageDataChange={() => handleCompletedStageChange(stage)}
                      isMaximized={isMaximized}
                    />
                  ) : stage === 'U3' ? (
                    <StageComponent 
                      flow={flow} 
                      onNext={() => {}} 
                      onBack={() => {}}
                      onStageDataChange={() => handleCompletedStageChange(stage)}
                      isMaximized={isMaximized}
                    />
                  ) : stage === 'U4' ? (
                    <StageComponent 
                      flow={flow} 
                      onNext={() => {}} 
                      onBack={() => {}}
                      onStageDataChange={() => handleCompletedStageChange(stage)}
                      isMaximized={isMaximized}
                    />
                  ) : stage === 'U5' ? (
                    <StageComponent 
                      flow={flow} 
                      onNext={() => {}} 
                      onBack={() => {}}
                      onStageDataChange={() => handleCompletedStageChange(stage)}
                      isMaximized={isMaximized}
                    />
                  ) : stage === 'U6' ? (
                    <StageComponent 
                      flow={flow} 
                      onNext={() => {}} 
                      onBack={() => {}}
                      onGoToStage={goToStage}
                      onStageDataChange={() => handleCompletedStageChange(stage)}
                      isMaximized={isMaximized}
                    />
                  ) : (
                    <StageComponent 
                      flow={flow} 
                      onNext={() => {}} 
                      onBack={() => {}}
                      onStageDataChange={() => handleCompletedStageChange(stage)}
                      isMaximized={isMaximized}
                    />
                  )}
                </div>

                {/* Navigation Footer for expanded completed stage */}
                {stage !== 'U6' && (
                  <div className="flex items-center justify-between pt-4 px-6 pb-4 border-t bg-gray-50 flex-shrink-0">
                    <div className="flex gap-2">
                      {getStageIndex(stage) > getStageIndex('U2') && (
                        <Button
                          variant="outline"
                          onClick={() => {
                            const prevStage = STAGE_ORDER[getStageIndex(stage) - 1];
                            goToStage(prevStage);
                            // Collapse all stages from current onwards when navigating back
                            setExpandedCompletedStages(prev => {
                              const next = new Set(prev);
                              const currentIndex = getStageIndex(stage);
                              STAGE_ORDER.forEach(s => {
                                if (getStageIndex(s) >= currentIndex) {
                                  next.delete(s);
                                }
                              });
                              return next;
                            });
                          }}
                          className="flex items-center gap-2"
                        >
                          <ArrowLeft className="w-4 h-4" />
                          Back
                        </Button>
                      )}
                      {stage !== 'U2' && (
                        <Button
                          variant="ghost"
                          onClick={handleRestart}
                          className="flex items-center gap-2 text-gray-600"
                        >
                          <RotateCcw className="w-4 h-4" />
                          Reset option
                        </Button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={handleClose}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() => {
                          // Make this stage current first
                          goToStage(stage);
                            // Collapse all stages from current onwards when navigating forward
                            setExpandedCompletedStages(prev => {
                              const next = new Set(prev);
                              const currentIndex = getStageIndex(stage);
                              STAGE_ORDER.forEach(s => {
                                if (getStageIndex(s) >= currentIndex) {
                                  next.delete(s);
                                }
                              });
                              return next;
                            });
                            // Navigate to next stage
                            const nextStage = STAGE_ORDER[getStageIndex(stage) + 1];
                            if (nextStage) {
                              setTimeout(() => {
                                goToStage(nextStage);
                              }, 50);
                            }
                          }}
                          className="bg-[#458EE2] hover:bg-[#3a7bc7] text-white"
                        >
                          Continue
                        </Button>
                    </div>
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}
      </div>
    );
  }, [
    state.currentStage,
    expandedCompletedStages,
    flow,
    handleNext,
    handleBack,
    handleRestart,
    handleClose,
    goToStage,
    canGoBack,
    isLastStage,
    toggleCompletedStage,
    toggleCurrentStage,
    isCurrentStageCollapsed,
  ]);

  // Helper function to render stage content for maximized view
  const renderMaximizedStageContent = useCallback((stage: UploadStage) => {
    const StageComponent = STAGE_COMPONENTS[stage];
    
    return (
      <div className="p-8">
        {stage === 'U2' ? (
          <StageComponent 
            flow={flow} 
            onNext={() => {}} 
            onBack={() => {}}
            onRestart={handleRestart}
            onCancel={handleClose}
            // Register the same U2 handlers used in the inline footer so
            // the fullscreen footer buttons can trigger the correct logic
            onRegisterContinueHandler={(handler: () => void) => {
              u2ContinueHandlerRef.current = handler;
            }}
            onRegisterContinueDisabled={(getDisabled: () => boolean) => {
              u2ContinueDisabledRef.current = getDisabled;
            }}
            isMaximized={true}
          />
        ) : stage === 'U6' ? (
          <StageComponent 
            flow={flow} 
            onNext={() => {}} 
            onBack={() => {}}
            onGoToStage={goToStage}
            isMaximized={true}
          />
        ) : (
          <StageComponent 
            flow={flow} 
            onNext={() => {}} 
            onBack={() => {}}
            isMaximized={true}
          />
        )}
      </div>
    );
  }, [flow, handleRestart, handleClose, goToStage]);

  return (
    <>
      <div className="w-full mt-2 flex flex-col" style={{ maxWidth: '100%', width: '100%' }}>
        {/* Render only visible stages (U2-U6) */}
        {VISIBLE_STAGES.map(stage => renderStageItem(stage))}
      </div>
    </>
  );
};

