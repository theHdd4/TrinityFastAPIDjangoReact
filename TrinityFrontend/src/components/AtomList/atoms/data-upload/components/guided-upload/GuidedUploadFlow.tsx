import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ProgressStepper } from './ProgressStepper';
import { useGuidedUploadFlow, type UploadStage } from './useGuidedUploadFlow';
import { U0FileUpload } from './stages/U0FileUpload';
import { U1StructuralScan } from './stages/U1StructuralScan';
import { U2UnderstandingFiles } from './stages/U2UnderstandingFiles';
import { U3ReviewColumnNames } from './stages/U3ReviewColumnNames';
import { U4ReviewDataTypes } from './stages/U4ReviewDataTypes';
import { U5MissingValues } from './stages/U5MissingValues';
import { U6FinalPreview } from './stages/U6FinalPreview';
import { U7Success } from './stages/U7Success';
import { ArrowLeft, RotateCcw, X, Minimize2, Maximize2 } from 'lucide-react';
import { useGuidedFlowPersistence } from '@/components/LaboratoryMode/hooks/useGuidedFlowPersistence';
import { getActiveProjectContext } from '@/utils/projectEnv';
import { UPLOAD_API } from '@/lib/api';
import { GuidedUploadFlowState } from '../../../data-validate/components/guided-upload';

interface GuidedUploadFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
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
}

const STAGE_COMPONENTS: Record<UploadStage, React.ComponentType<any>> = {
  U0: U0FileUpload,
  U1: U1StructuralScan,
  U2: U2UnderstandingFiles,
  U3: U3ReviewColumnNames,
  U4: U4ReviewDataTypes,
  U5: U5MissingValues,   // U5: Missing Value Review
  U6: U6FinalPreview,    // U6: Final Preview & Data Primed
  U7: U7Success,         // U7: Priming Completed & Next Actions
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

export const GuidedUploadFlow: React.FC<GuidedUploadFlowProps> = ({
  open,
  onOpenChange,
  onComplete,
  existingDataframe,
  initialStage,
  savedState,
}) => {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(true); // Start maximized (fullscreen)
  const flow = useGuidedUploadFlow(savedState);
  const { state, goToNextStage, goToPreviousStage, restartFlow, addUploadedFiles, goToStage } = flow;
  const { saveState, markFileAsPrimed } = useGuidedFlowPersistence();

  // Determine initial stage
  const effectiveInitialStage = initialStage || (existingDataframe ? 'U1' : 'U0');

  // Initialize flow state on open
  React.useEffect(() => {
    if (!open) return;

    // If saved state provided, use it (for resuming)
    if (savedState && savedState.currentStage) {
      // State is already initialized via useGuidedUploadFlow hook
      // Just ensure we're on the correct stage
      if (state.currentStage !== savedState.currentStage) {
        goToStage(savedState.currentStage);
      }
      return;
    }

    // If existing dataframe provided, initialize flow with it
    if (existingDataframe && state.uploadedFiles.length === 0) {
      addUploadedFiles([{
        name: existingDataframe.name,
        path: existingDataframe.path,
        size: existingDataframe.size || 0,
      }]);
    }

    // Set initial stage
    if (state.currentStage === 'U0' && effectiveInitialStage !== 'U0') {
      goToStage(effectiveInitialStage);
    }
  }, [open, existingDataframe, initialStage, effectiveInitialStage, savedState, state.currentStage, state.uploadedFiles.length, addUploadedFiles, goToStage]);

  // Save state on each stage change
  React.useEffect(() => {
    if (open && state.currentStage) {
      saveState(state);
    }
  }, [open, state, saveState]);

  // Mark completion when reaching U7
  React.useEffect(() => {
    if (state.currentStage === 'U7' && state.uploadedFiles.length > 0) {
      // Mark each uploaded file as primed
      state.uploadedFiles.forEach(file => {
        markFileAsPrimed(file.path || file.name);
      });
    }
  }, [state.currentStage, state.uploadedFiles, markFileAsPrimed]);

  const handleNext = async () => {
    if (state.currentStage === 'U6') {
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
      
      // Move from U6 (Final Preview) to U7 (Success)
      goToNextStage();
    } else if (state.currentStage === 'U7') {
      // Flow complete - finalize and save primed files
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
                validator_atom_id: 'guided-upload',
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
      
      // Flow complete
      onComplete?.({
        uploadedFiles: state.uploadedFiles,
        headerSelections: state.headerSelections,
        columnNameEdits: state.columnNameEdits,
        dataTypeSelections: state.dataTypeSelections,
        missingValueStrategies: state.missingValueStrategies,
      });
      onOpenChange(false);
    } else {
      goToNextStage();
    }
  };

  const handleBack = () => {
    // For existing dataframes, prevent going back to U0
    if (existingDataframe) {
      if (state.currentStage === 'U1') {
        onOpenChange(false);
      } else {
        goToPreviousStage();
      }
    } else {
      if (state.currentStage === 'U0') {
        onOpenChange(false);
      } else {
        goToPreviousStage();
      }
    }
  };

  const handleRestart = () => {
    restartFlow();
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const CurrentStageComponent = STAGE_COMPONENTS[state.currentStage];
  // For existing dataframes, don't allow going back to U0
  const canGoBack = existingDataframe ? state.currentStage !== 'U1' : state.currentStage !== 'U0';
  const isLastStage = state.currentStage === 'U7';
  
  // Hide U0 stage from progress stepper if existing dataframe
  const visibleStages = existingDataframe 
    ? ['U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7'] as UploadStage[]
    : ['U0', 'U1', 'U2', 'U3', 'U4', 'U5', 'U6', 'U7'] as UploadStage[];

  const toggleMinimize = () => {
    setIsMinimized(!isMinimized);
    if (isMinimized) {
      setIsMaximized(true); // When restoring, go back to maximized
    }
  };

  const toggleMaximize = () => {
    setIsMaximized(!isMaximized);
    setIsMinimized(false); // Can't be minimized and maximized at the same time
  };

  const dialogClassName = isMinimized
    ? "max-w-md h-auto max-h-[200px] bottom-4 right-4 top-auto left-auto translate-x-0 translate-y-0"
    : isMaximized
    ? "max-w-[100vw] max-h-[100vh] w-full h-full top-0 left-0 translate-x-0 translate-y-0 rounded-none"
    : "max-w-6xl max-h-[95vh] w-[95vw] h-[95vh]";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className={`${dialogClassName} overflow-hidden flex flex-col p-0`} 
        hideCloseButton
      >
        {/* Header with controls */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-gray-50 flex-shrink-0">
          <div className="flex items-center gap-4 flex-1">
            <h2 className="text-xl font-semibold text-gray-900">
              {STAGE_TITLES[state.currentStage]}
            </h2>
            {!isMinimized && (
              <div className="flex-1">
                <ProgressStepper currentStage={state.currentStage} hideStages={existingDataframe ? ['U0'] : []} />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleMinimize}
              className="h-8 w-8"
              title={isMinimized ? "Restore" : "Minimize"}
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
            {!isMinimized && (
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleMaximize}
                className="h-8 w-8"
                title={isMaximized ? "Restore window" : "Maximize"}
              >
                {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8"
              title="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Stage Content */}
        <div className={`flex-1 overflow-y-auto ${isMinimized ? 'hidden' : ''} p-6`}>
          {state.currentStage === 'U1' || state.currentStage === 'U2' ? (
            <CurrentStageComponent 
              flow={flow} 
              onNext={handleNext} 
              onBack={handleBack}
              onRestart={handleRestart}
              onCancel={handleCancel}
            />
          ) : state.currentStage === 'U6' ? (
            <CurrentStageComponent 
              flow={flow} 
              onNext={handleNext} 
              onBack={handleBack}
              onGoToStage={goToStage}
            />
          ) : state.currentStage === 'U7' ? (
            <CurrentStageComponent 
              flow={flow}
              onClose={handleCancel}
              onRestart={handleRestart}
            />
          ) : (
            <CurrentStageComponent flow={flow} onNext={handleNext} onBack={handleBack} />
          )}
        </div>

        {/* Navigation Footer - Consistent across all stages (hidden for U1, U2, U6, and U7 as they have their own controls) */}
        {!isMinimized && state.currentStage !== 'U1' && state.currentStage !== 'U2' && state.currentStage !== 'U6' && state.currentStage !== 'U7' && (
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
              <Button variant="outline" onClick={handleCancel}>
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
      </DialogContent>
    </Dialog>
  );
};

