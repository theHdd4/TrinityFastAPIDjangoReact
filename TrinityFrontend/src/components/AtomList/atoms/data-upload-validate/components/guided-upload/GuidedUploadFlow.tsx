import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ProgressStepper } from './ProgressStepper';
import { useGuidedUploadFlow, type UploadStage } from './useGuidedUploadFlow';
import { U0FileUpload } from './stages/U0FileUpload';
import { U1StructuralScan } from './stages/U1StructuralScan';
import { U2UnderstandingFiles } from './stages/U2UnderstandingFiles';
import { U3ConfirmHeaders } from './stages/U3ConfirmHeaders';
import { U4ReviewColumnNames } from './stages/U4ReviewColumnNames';
import { U5ReviewDataTypes } from './stages/U5ReviewDataTypes';
import { U6MissingValues } from './stages/U6MissingValues';
import { U7Summary } from './stages/U7Summary';
import { ArrowLeft, RotateCcw, X } from 'lucide-react';
import { useGuidedFlowPersistence } from '@/components/LaboratoryMode/hooks/useGuidedFlowPersistence';
import { getActiveProjectContext } from '@/utils/projectEnv';

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
  U3: U3ConfirmHeaders,
  U4: U4ReviewColumnNames,
  U5: U5ReviewDataTypes,
  U6: U6MissingValues,
  U7: U7Summary,
};

const STAGE_TITLES: Record<UploadStage, string> = {
  U0: 'Upload Your Dataset',
  U1: 'Structural Scan',
  U2: 'Understanding Your File(s)',
  U3: 'Confirm Your Column Headers',
  U4: 'Review Column Names',
  U5: 'Confirm Data Types',
  U6: 'How Should Trinity Handle Missing Values?',
  U7: 'Upload Complete — Your Data Is Ready',
};

export const GuidedUploadFlow: React.FC<GuidedUploadFlowProps> = ({
  open,
  onOpenChange,
  onComplete,
  existingDataframe,
  initialStage,
  savedState,
}) => {
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
    if (state.currentStage === 'U7') {
      // Flow complete - mark files as primed
      const projectContext = getActiveProjectContext();
      if (projectContext && state.uploadedFiles.length > 0) {
        // Mark each uploaded file as primed
        for (const file of state.uploadedFiles) {
          await markFileAsPrimed(file.path || file.name);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" hideCloseButton>
        {/* Progress Stepper */}
        <div className="mb-6">
          <ProgressStepper currentStage={state.currentStage} hideStages={existingDataframe ? ['U0'] : []} />
        </div>

        {/* Stage Content */}
        <div className="min-h-[400px] py-4">
          <CurrentStageComponent flow={flow} onNext={handleNext} onBack={handleBack} />
        </div>

        {/* Navigation Footer - Consistent across all stages */}
        <div className="flex items-center justify-between pt-4 border-t">
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
      </DialogContent>
    </Dialog>
  );
};

