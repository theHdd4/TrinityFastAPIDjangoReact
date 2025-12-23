import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ProgressStepper } from './ProgressStepper';
import { useGuidedUploadFlow, type UploadStage } from './useGuidedUploadFlow';
import { U2UnderstandingFiles } from './stages/U2UnderstandingFiles';
import { U3ReviewColumnNames } from './stages/U3ReviewColumnNames';
import { U4ReviewDataTypes } from './stages/U4ReviewDataTypes';
import { U5MissingValues } from './stages/U5MissingValues';
import { U6FinalPreview } from './stages/U6FinalPreview';
import { ArrowLeft, RotateCcw, X, Minimize2, Maximize2 } from 'lucide-react';
import { useGuidedFlowPersistence } from '@/components/LaboratoryMode/hooks/useGuidedFlowPersistence';
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
  /** Initial stage to start from (default: U2) */
  initialStage?: UploadStage;
  /** Saved state to restore (for resuming) */
  savedState?: Partial<GuidedUploadFlowState>;
}

// Only U2-U6 are used now (U0 handled by atom, U1 and U7 removed)
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
  const { saveState } = useGuidedFlowPersistence();

  // Determine initial stage - always start from U2 (U0 handled by atom, U1 removed)
  const effectiveInitialStage: UploadStage = (initialStage && ['U2', 'U3', 'U4', 'U5', 'U6'].includes(initialStage))
    ? initialStage as UploadStage
    : 'U2';

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
        originalPath: existingDataframe.path,  // Store original path for later use when finalizing
      }]);
    }

    // Set initial stage if we're not at a valid stage (U2-U6)
    if (!['U2', 'U3', 'U4', 'U5', 'U6'].includes(state.currentStage) && effectiveInitialStage) {
      goToStage(effectiveInitialStage);
    }
  }, [open, existingDataframe, initialStage, effectiveInitialStage, savedState, state.currentStage, state.uploadedFiles.length, addUploadedFiles, goToStage]);

  // Save state on each stage change
  React.useEffect(() => {
    if (open && state.currentStage) {
      saveState(state);
    }
  }, [open, state, saveState]);

  // No need to mark as primed here - U6FinalPreview handles it

  const handleNext = async () => {
    if (state.currentStage === 'U6') {
      // U6FinalPreview's handleSave already handles everything:
      // - process_saved_dataframe (overwrites file in-place with exact MinIO path)
      // - save_config (saves classifications)
      // - mark as primed
      // Flow is complete - call onComplete
      onComplete?.({
        uploadedFiles: state.uploadedFiles,
        headerSelections: state.headerSelections,
        columnNameEdits: state.columnNameEdits,
        dataTypeSelections: state.dataTypeSelections,
        missingValueStrategies: state.missingValueStrategies,
      });
    } else {
      // Move to next stage (U2->U3->U4->U5->U6)
      goToNextStage();
    }
  };

  const handleBack = () => {
    // U2 is the first stage - if at U2, close the dialog
    if (state.currentStage === 'U2') {
      onOpenChange(false);
    } else {
      goToPreviousStage();
    }
  };

  const handleRestart = () => {
    restartFlow();
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const CurrentStageComponent = STAGE_COMPONENTS[state.currentStage];
  // U2 is the first stage in the panel
  const canGoBack = state.currentStage !== 'U2';
  const isLastStage = state.currentStage === 'U6';
  
  // Only U2-U6 are visible (U0 handled by atom, U1 and U7 removed)
  const visibleStages: UploadStage[] = ['U2', 'U3', 'U4', 'U5', 'U6'];

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
            console.log('🔄 Applying final transformations before completion:', { columnsToDrop, columnRenames, dtypeChanges, missingValueStrategiesPayload });
            
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
              console.log('✅ Transformations applied successfully before completion');
            } else {
              console.warn('⚠️ Failed to apply transformations before completion');
            }
          }
        } catch (error) {
          console.error('Error applying transformations before completion:', error);
        }
      }
      
      // Complete the flow
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
            
            // Determine original file path - if file was opened from existing dataframe, use that path
            // Otherwise, file.path might be in tmp/ after transformations, so we need to track original
            const originalFilePath = (file as any).originalPath || (file.path && !file.path.includes('tmp/') && !file.path.includes('/tmp/') ? file.path : '');
            
            const finalizeRes = await fetch(`${UPLOAD_API}/finalize-primed-file`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                file_path: file.path,  // Current path (may be in tmp/ after transformations)
                original_file_path: originalFilePath,  // Original path before priming (if priming existing file)
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
      
      onComplete?.({
        uploadedFiles: state.uploadedFiles,
        headerSelections: state.headerSelections,
        columnNameEdits: state.columnNameEdits,
        dataTypeSelections: state.dataTypeSelections,
        missingValueStrategies: state.missingValueStrategies,
      });
      
      // Don't remove flow - keep it open per user preference
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
            
            // Determine original file path - if file was opened from existing dataframe, use that path
            // Otherwise, file.path might be in tmp/ after transformations, so we need to track original
            const originalFilePath = (file as any).originalPath || (file.path && !file.path.includes('tmp/') && !file.path.includes('/tmp/') ? file.path : '');
            
            const finalizeRes = await fetch(`${UPLOAD_API}/finalize-primed-file`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                file_path: file.path,  // Current path (may be in tmp/ after transformations)
                original_file_path: originalFilePath,  // Original path before priming (if priming existing file)
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
      goToNextStage();
    }
  };

  const handleBack = () => {
    // U2 is the first stage - if at U2, close the dialog
    if (state.currentStage === 'U2') {
      onOpenChange(false);
    } else {
      goToPreviousStage();
    }
  };

  const handleRestart = () => {
    restartFlow();
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  const CurrentStageComponent = STAGE_COMPONENTS[state.currentStage];
  // U2 is the first stage in the panel
  const canGoBack = state.currentStage !== 'U2';
  const isLastStage = state.currentStage === 'U6';
  
  // Only U2-U6 are visible (U0 handled by atom, U1 and U7 removed)
  const visibleStages: UploadStage[] = ['U2', 'U3', 'U4', 'U5', 'U6'];

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
                <ProgressStepper currentStage={state.currentStage} hideStages={['U0']} />
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
        <div className={`flex-1 overflow-y-auto ${isMinimized ? 'hidden' : ''} p-6 min-h-0`}>
          {state.currentStage === 'U2' ? (
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
              isMaximized={isMaximized}
            />
          ) : (
            <CurrentStageComponent flow={flow} onNext={handleNext} onBack={handleBack} />
          )}
        </div>

        {/* Navigation Footer - Show for U2, U3, U4, U5 in both normal and maximized mode (U6 has its own controls) */}
        {!isMinimized && ['U2', 'U3', 'U4', 'U5'].includes(state.currentStage) && (
          <div className="flex items-center justify-between pt-4 px-6 pb-4 border-t bg-gray-50 flex-shrink-0 z-10 relative">
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

