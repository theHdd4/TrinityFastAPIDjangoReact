import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ProgressStepper } from './ProgressStepper';
import { useGuidedUploadFlow, type UploadStage } from './useGuidedUploadFlow';
// Import stage components from data-upload folder (shared components)
import { U2UnderstandingFiles } from '../../../data-upload/components/guided-upload/stages/U2UnderstandingFiles';
import { U3ReviewColumnNames } from '../../../data-upload/components/guided-upload/stages/U3ReviewColumnNames';
import { U4ReviewDataTypes } from './stages/U4ReviewDataTypes';
import { U5MissingValues } from '../../../data-upload/components/guided-upload/stages/U5MissingValues';
import { U6FinalPreview } from '../../../data-upload/components/guided-upload/stages/U6FinalPreview';
import { ArrowLeft, RotateCcw, X, Minimize2, Maximize2 } from 'lucide-react';
import { useGuidedFlowPersistence } from '@/components/LaboratoryMode/hooks/useGuidedFlowPersistence';
import { getActiveProjectContext } from '@/utils/projectEnv';
import { VALIDATE_API } from '@/lib/api';
import { GuidedUploadFlowState } from '../../../data-upload/components/guided-upload';

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
  /** Initial stage to start from (default: U2 - U0 and U1 removed) */
  initialStage?: UploadStage;
  /** Saved state to restore (for resuming) */
  savedState?: Partial<GuidedUploadFlowState>;
}

const STAGE_COMPONENTS: Record<UploadStage, React.ComponentType<any>> = {
  U2: U2UnderstandingFiles,
  U3: U3ReviewColumnNames,
  U4: U4ReviewDataTypes,
  U5: U5MissingValues,   // U5: Missing Value Review
  U6: U6FinalPreview,    // U6: Final Preview & Data Primed (final step)
};

const STAGE_TITLES: Record<UploadStage, string> = {
  U2: 'Step 1: Confirm Your Column Headers',
  U3: 'Step 2: Review Your Column Names',
  U4: 'Step 3: Review Your Column Types',
  U5: 'Step 4: Review Missing Values',
  U6: 'Step 5: Final Preview & Priming Complete',
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

    // Set initial stage - always start at U2
    if (!state.currentStage || state.currentStage === 'U0' || state.currentStage === 'U1') {
      goToStage('U2');
    }
  }, [open, existingDataframe, initialStage, effectiveInitialStage, savedState, state.currentStage, state.uploadedFiles.length, addUploadedFiles, goToStage]);

  // Save state on each stage change
  React.useEffect(() => {
    if (open && state.currentStage) {
      saveState(state);
    }
  }, [open, state, saveState]);

  // DO NOT automatically mark files as primed when reaching U6
  // Files should only be marked as primed when explicitly approved in U6FinalPreview
  // This prevents files from being marked as primed before they're actually approved

  const handleNext = async () => {
    if (state.currentStage === 'U6') {
      // U6 is the final step - flow is complete
      // U6FinalPreview component handles all finalization (priming, saving, etc.)
      // Just close the flow
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
            
            const transformRes = await fetch(`${VALIDATE_API}/process_saved_dataframe`, {
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
      // Move to next stage (U2->U3->U4->U5->U6)
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
  // U2 is the first stage - can't go back from U2
  const canGoBack = state.currentStage !== 'U2';
  const isLastStage = state.currentStage === 'U6';
  
  // Only U2-U6 are visible (U0 and U1 removed)
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
          ) : (
            <CurrentStageComponent 
              flow={flow}
              onClose={handleCancel}
              onRestart={handleRestart}
            />
          ) : (
            <CurrentStageComponent flow={flow} onNext={handleNext} onBack={handleBack} />
          )}
        </div>

        {/* Navigation Footer - Consistent across all stages (hidden for U2 and U6 as they have their own controls) */}
        {!isMinimized && state.currentStage !== 'U2' && state.currentStage !== 'U6' && (
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

