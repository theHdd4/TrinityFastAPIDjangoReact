import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { useGuidedUploadFlow, type UploadStage, type GuidedUploadFlowState } from './useGuidedUploadFlow';
import { U0FileUpload } from './stages/U0FileUpload';
import { U1StructuralScan } from './stages/U1StructuralScan';
import { U2UnderstandingFiles } from './stages/U2UnderstandingFiles';
import { U3ReviewColumnNames } from './stages/U3ReviewColumnNames';
import { U4ReviewDataTypes } from './stages/U4ReviewDataTypes';
import { U5MissingValues } from './stages/U5MissingValues';
import { U6FinalPreview } from './stages/U6FinalPreview';
import { U7Success } from './stages/U7Success';
import { ArrowLeft, RotateCcw, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
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
  /** If provided, start from an existing dataframe (skip U0) */
  existingDataframe?: {
    name: string;
    path: string;
    size?: number;
  };
  /** Initial stage to start from (default: U0 or U1 if existingDataframe) */
  initialStage?: UploadStage;
  /** Saved state to restore (for resuming) */
  savedState?: Partial<GuidedUploadFlowState>;
  /** Callback when flow should be closed */
  onClose?: () => void;
}

const STAGE_COMPONENTS: Record<UploadStage, React.ComponentType<any>> = {
  U0: U0FileUpload,
  U1: U1StructuralScan,
  U2: U2UnderstandingFiles,
  U3: U3ReviewColumnNames,
  U4: U4ReviewDataTypes,
  U5: U5MissingValues,
  U6: U6FinalPreview,
  U7: U7Success,
};

const STAGE_TITLES: Record<UploadStage, string> = {
  U0: 'Upload Your Dataset',
  U1: 'Structural Scan',
  U2: 'Step 3: Confirm Your Column Headers',
  U3: 'Step 4: Review Your Column Names',
  U4: 'Step 5: Review Your Column Types',
  U5: 'Step 6: Review Missing Values',
  U6: 'Step 7: Final Preview Before Priming',
  U7: 'Your Data Is Ready',
};

const STAGE_ORDER: UploadStage[] = ['U0', 'U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7'];

// Helper to get stage index
const getStageIndex = (stage: UploadStage): number => {
  return STAGE_ORDER.indexOf(stage);
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
}) => {
  const flow = useGuidedUploadFlow(savedState);
  const { state, goToNextStage, goToPreviousStage, restartFlow, addUploadedFiles, goToStage } = flow;
  const { saveState, markFileAsPrimed } = useGuidedFlowPersistence();
  const { setActiveGuidedFlow, updateGuidedFlowStage, removeActiveGuidedFlow } = useLaboratoryStore();

  // Refs to track previous values and prevent unnecessary saves
  const prevStageRef = useRef<UploadStage | null>(null);
  const prevStateStringRef = useRef<string>('');
  const prevStoreStateStringRef = useRef<string>('');
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialMountRef = useRef(true);
  const lastSavedStateRef = useRef<string>('');

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

  // Determine initial stage
  const effectiveInitialStage = initialStage || (existingDataframe ? 'U1' : 'U0');

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
    if (existingDataframe && state.uploadedFiles.length === 0) {
      addUploadedFiles([{
        name: existingDataframe.name,
        path: existingDataframe.path,
        size: existingDataframe.size || 0,
      }]);
    }

    // Set initial stage - only if we're at U0 and haven't initialized from savedState
    if (state.currentStage === 'U0' && effectiveInitialStage !== 'U0' && !hasInitializedFromSavedStateRef.current) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f74def83-6ab6-4eaa-b691-535eeb501a5a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'GuidedUploadFlowInline.tsx:139',message:'Resetting stage to initial',data:{from:state.currentStage,to:effectiveInitialStage,initialStage},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'A'})}).catch(()=>{});
      // #endregion
      goToStage(effectiveInitialStage);
    }
  }, [existingDataframe, initialStage, effectiveInitialStage, savedState, state.currentStage, state.uploadedFiles.length, addUploadedFiles, goToStage]);

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

  // Mark completion when reaching U7
  useEffect(() => {
    if (state.currentStage === 'U7' && state.uploadedFiles.length > 0) {
      state.uploadedFiles.forEach(file => {
        markFileAsPrimed(file.path || file.name);
      });
    }
  }, [state.currentStage, state.uploadedFiles, markFileAsPrimed]);

  const handleNext = async () => {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/f74def83-6ab6-4eaa-b691-535eeb501a5a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'GuidedUploadFlowInline.tsx:221',message:'handleNext called',data:{currentStage:state.currentStage},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
    // #endregion
    
    if (state.currentStage === 'U6') {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/f74def83-6ab6-4eaa-b691-535eeb501a5a',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'GuidedUploadFlowInline.tsx:223',message:'Calling goToNextStage from U6',data:{from:state.currentStage},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      
      // CRITICAL: Apply all transformations before moving to U7
      const chosenIndex = state.selectedFileIndex !== undefined && state.selectedFileIndex < state.uploadedFiles.length 
        ? state.selectedFileIndex : 0;
      const currentFile = state.uploadedFiles[chosenIndex];
      
      if (currentFile?.path) {
        try {
          const currentColumnEdits = state.columnNameEdits[currentFile.name] || [];
          const currentDataTypes = state.dataTypeSelections[currentFile.name] || [];
          const currentStrategies = state.missingValueStrategies[currentFile.name] || [];
          
          // Build columns_to_drop from columnNameEdits (U3) - columns marked as keep=false
          const columnsToDrop: string[] = [];
          currentColumnEdits.forEach(edit => {
            if (edit.keep === false) {
              columnsToDrop.push(edit.originalName);
            }
          });
          
          // Build column_renames from columnNameEdits (U3) - only for kept columns
          const columnRenames: Record<string, string> = {};
          currentColumnEdits.forEach(edit => {
            if (edit.keep !== false && edit.editedName && edit.editedName !== edit.originalName) {
              columnRenames[edit.originalName] = edit.editedName;
            }
          });
          
          // Build dtype_changes from dataTypeSelections (U4)
          const dtypeChanges: Record<string, string | { dtype: string; format?: string }> = {};
          currentDataTypes.forEach(dt => {
            // Use updateType (user's selection from U4) instead of selectedType
            const userSelectedType = dt.updateType || dt.selectedType;
            if (userSelectedType && userSelectedType !== dt.detectedType) {
              if ((userSelectedType === 'date' || userSelectedType === 'datetime') && dt.format) {
                dtypeChanges[dt.columnName] = { dtype: 'datetime64', format: dt.format };
              } else {
                // Map frontend types to backend types
                const backendType = userSelectedType === 'number' ? 'float64' : 
                                   userSelectedType === 'int' ? 'int64' :
                                   userSelectedType === 'float' ? 'float64' :
                                   userSelectedType === 'category' ? 'object' :
                                   userSelectedType === 'string' ? 'object' :
                                   userSelectedType === 'date' ? 'datetime64' :
                                   userSelectedType === 'datetime' ? 'datetime64' :
                                   userSelectedType === 'boolean' ? 'bool' :
                                   userSelectedType;
                dtypeChanges[dt.columnName] = backendType;
              }
            }
          });
          
          // Build missing_value_strategies from missingValueStrategies (U5)
          const missingValueStrategiesPayload: Record<string, { strategy: string; value?: string | number }> = {};
          currentStrategies.forEach(s => {
            if (s.strategy !== 'none') {
              const strategyConfig: { strategy: string; value?: string | number } = {
                strategy: s.strategy,
              };
              if (s.strategy === 'custom' && s.value !== undefined) {
                strategyConfig.value = s.value;
              }
              missingValueStrategiesPayload[s.columnName] = strategyConfig;
            }
          });
          
          // Apply transformations if there are any changes
          if (columnsToDrop.length > 0 || Object.keys(columnRenames).length > 0 || Object.keys(dtypeChanges).length > 0 || Object.keys(missingValueStrategiesPayload).length > 0) {
            console.log('🔄 Applying final transformations before U7:', { columnsToDrop, columnRenames, dtypeChanges, missingValueStrategiesPayload });
            
            const transformRes = await fetch(`${UPLOAD_API}/apply-data-transformations`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                file_path: currentFile.path,
                columns_to_drop: columnsToDrop,
                column_renames: columnRenames,
                dtype_changes: dtypeChanges,
                missing_value_strategies: missingValueStrategiesPayload,
              }),
            });
            
            if (transformRes.ok) {
              console.log('✅ Transformations applied successfully before U7');
            } else {
              console.warn('⚠️ Failed to apply transformations before U7');
            }
          }
        } catch (error) {
          console.error('Error applying transformations before U7:', error);
        }
      }
      
      goToNextStage();
    } else if (state.currentStage === 'U7') {
      const projectContext = getActiveProjectContext();
      if (projectContext && state.uploadedFiles.length > 0) {
        for (const file of state.uploadedFiles) {
          // Finalize the primed file - save transformed data to saved dataframes location
          try {
            console.log('🔄 Finalizing primed file:', file.path || file.name);
            
            // Get column classifications from dataTypeSelections (U4 stage)
            const dataTypes = state.dataTypeSelections[file.name] || [];
            const columnClassifications = dataTypes.map(dt => ({
              columnName: dt.columnName,
              columnRole: dt.columnRole || 'identifier', // Default to identifier if not set
            }));
            
            console.log('📊 Sending column classifications:', columnClassifications);
            
            const finalizeRes = await fetch(`${UPLOAD_API}/finalize-primed-file`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                file_path: file.path,
                file_name: file.name,
                client_name: projectContext.client_name || '',
                app_name: projectContext.app_name || '',
                project_name: projectContext.project_name || '',
                validator_atom_id: atomId || 'guided-upload',
                column_classifications: columnClassifications,
              }),
            });
            
            if (finalizeRes.ok) {
              const result = await finalizeRes.json();
              console.log('✅ File finalized successfully:', result);
              // Trigger refresh of SavedDataFramesPanel
              window.dispatchEvent(new CustomEvent('dataframe-saved', { 
                detail: { filePath: result.saved_path, fileName: file.name } 
              }));
            } else {
              console.warn('⚠️ Failed to finalize file:', await finalizeRes.text());
              // Fallback to just marking as primed
              await markFileAsPrimed(file.path || file.name);
            }
          } catch (error) {
            console.error('Error finalizing primed file:', error);
            // Fallback to just marking as primed
            await markFileAsPrimed(file.path || file.name);
          }
        }
      }
      
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
    if (existingDataframe) {
      if (state.currentStage === 'U1') {
        onClose?.();
      } else {
        goToPreviousStage();
      }
    } else {
      if (state.currentStage === 'U0') {
        onClose?.();
      } else {
        goToPreviousStage();
      }
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
  const canGoBack = existingDataframe ? state.currentStage !== 'U1' : state.currentStage !== 'U0';
  const isLastStage = state.currentStage === 'U7';

  // Track expanded collapsed stages (for viewing completed stages)
  const [expandedCompletedStages, setExpandedCompletedStages] = useState<Set<UploadStage>>(new Set());
  
  // Ref for scrolling to current stage
  const stageRefs = useRef<Record<UploadStage, HTMLDivElement | null>>({} as Record<UploadStage, HTMLDivElement | null>);

  // Auto-scroll to current stage when it changes
  useEffect(() => {
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

  // Memoize stage rendering to prevent unnecessary re-renders
  const renderStageItem = useCallback((stage: UploadStage) => {
    const isCompleted = isStageCompleted(stage, state.currentStage);
    const isCurrent = stage === state.currentStage;
    const isUpcoming = !isCompleted && !isCurrent;
    const StageComponent = STAGE_COMPONENTS[stage];
    const isExpanded = isCurrent || (isCompleted && expandedCompletedStages.has(stage));

    // Determine stage status and styling
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
        ref={(el) => {
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
          <button
            onClick={() => toggleCompletedStage(stage)}
            className={`flex items-center justify-between px-6 py-4 border-b ${headerBg} hover:bg-opacity-80 transition-colors cursor-pointer w-full text-left`}
          >
            <div className="flex items-center gap-3">
              {statusIcon}
              <h3 className={`text-base font-semibold ${headerTextColor}`}>
                {STAGE_TITLES[stage]}
              </h3>
              <span className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full">Completed</span>
            </div>
            {isExpanded ? (
              <ChevronUp className="w-5 h-5 text-gray-500" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-500" />
            )}
          </button>
        ) : (
          <div className={`flex items-center justify-between px-6 py-4 border-b ${headerBg} flex-shrink-0`}>
            <div className="flex items-center gap-3">
              {statusIcon}
              <h2 className={`text-lg font-semibold ${headerTextColor}`}>
                {STAGE_TITLES[stage]}
              </h2>
              {isCurrent && (
                <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded-full">Current</span>
              )}
              {isUpcoming && (
                <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">Upcoming</span>
              )}
            </div>
          </div>
        )}

        {/* Stage Content - Only show if current or expanded */}
        {isExpanded && (
          <div className="flex-1 overflow-y-auto">
            {isCurrent ? (
              <>
                <div className="p-6 min-h-[400px]">
                  {state.currentStage === 'U1' || state.currentStage === 'U2' ? (
                    <StageComponent 
                      flow={flow} 
                      onNext={handleNext} 
                      onBack={handleBack}
                      onRestart={handleRestart}
                      onCancel={handleClose}
                    />
                  ) : state.currentStage === 'U6' ? (
                    <StageComponent 
                      flow={flow} 
                      onNext={handleNext} 
                      onBack={handleBack}
                      onGoToStage={goToStage}
                    />
                  ) : state.currentStage === 'U7' ? (
                    <StageComponent 
                      flow={flow}
                      onClose={handleClose}
                      onRestart={handleRestart}
                    />
                  ) : (
                    <StageComponent flow={flow} onNext={handleNext} onBack={handleBack} />
                  )}
                </div>

                {/* Navigation Footer for current stage */}
                {state.currentStage !== 'U1' && state.currentStage !== 'U2' && state.currentStage !== 'U6' && state.currentStage !== 'U7' && (
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
                        Restart Upload
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={handleClose}>
                        Cancel
                      </Button>
                      {!isLastStage && (
                        <Button
                          onClick={handleNext}
                          className="bg-[#458EE2] hover:bg-[#3a7bc7] text-white"
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
              <div className="p-6 bg-gray-50">
                {stage === 'U1' || stage === 'U2' ? (
                  <StageComponent 
                    flow={flow} 
                    onNext={() => {}} 
                    onBack={() => {}}
                    onRestart={handleRestart}
                    onCancel={handleClose}
                  />
                ) : stage === 'U6' ? (
                  <StageComponent 
                    flow={flow} 
                    onNext={() => {}} 
                    onBack={() => {}}
                    onGoToStage={goToStage}
                  />
                ) : stage === 'U7' ? (
                  <StageComponent 
                    flow={flow}
                    onClose={handleClose}
                    onRestart={handleRestart}
                  />
                ) : (
                  <StageComponent flow={flow} onNext={() => {}} onBack={() => {}} />
                )}
              </div>
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
  ]);

  return (
    <div className="w-full mt-4 flex flex-col">
      {/* Render ALL stages in sequence (Shopify-style) */}
      {STAGE_ORDER.map(stage => renderStageItem(stage))}
    </div>
  );
};

