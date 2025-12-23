import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertCircle } from 'lucide-react';
import type { UploadStage } from './useGuidedUploadFlow';

interface UpdateStageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage: UploadStage;
  stageLabel: string;
  hasChanges: boolean;
  onUpdate: () => void;
  onUpdateAndContinue: () => void;
  onApprove?: () => void;
  onCancel: () => void;
}

const STAGE_LABELS: Record<UploadStage, string> = {
  U0: 'Choose Your Data Source',
  U1: 'Structural Scan',
  U2: 'Confirm Your Column Headers',
  U3: 'Review Your Column Names',
  U4: 'Review Your Column Types',
  U5: 'Review Missing Values',
  U6: 'Final Preview Before Priming',
  U7: 'Your Data Is Ready',
};

export const UpdateStageDialog: React.FC<UpdateStageDialogProps> = ({
  open,
  onOpenChange,
  stage,
  stageLabel,
  hasChanges,
  onUpdate,
  onUpdateAndContinue,
  onApprove,
  onCancel,
}) => {
  const displayLabel = stageLabel || STAGE_LABELS[stage] || stage;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-blue-600" />
            Update {displayLabel}
          </DialogTitle>
          <DialogDescription className="pt-2">
            {hasChanges ? (
              <>
                You've made changes to this completed step. How would you like to proceed?
                <ul className="mt-3 space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <span className="font-semibold">Update:</span>
                    <span>Save your changes and return to the last active step.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="font-semibold">Update and Continue:</span>
                    <span>Save your changes and move to the next step.</span>
                  </li>
                  {onApprove && (
                    <li className="flex items-start gap-2">
                      <span className="font-semibold">Approve:</span>
                      <span>Accept the changes and prime the data (green color - ready for use).</span>
                    </li>
                  )}
                </ul>
              </>
            ) : (
              <>
                You're viewing a completed step. Would you like to make changes?
              </>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => {
              onCancel();
              onOpenChange(false);
            }}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          {hasChanges && (
            <>
              <Button
                onClick={() => {
                  onUpdate();
                  onOpenChange(false);
                }}
                variant="default"
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700"
              >
                Update
              </Button>
              <Button
                onClick={() => {
                  onUpdateAndContinue();
                  onOpenChange(false);
                }}
                variant="default"
                className="w-full sm:w-auto bg-green-600 hover:bg-green-700"
              >
                Update and Continue
              </Button>
              {onApprove && (
                <Button
                  onClick={() => {
                    onApprove();
                    onOpenChange(false);
                  }}
                  variant="default"
                  className="w-full sm:w-auto bg-gradient-to-r from-[#41C185] to-[#3AB077] hover:from-[#3AB077] hover:to-[#34A06B] text-white"
                >
                  Approve
                </Button>
              )}
            </>
          )}
          {!hasChanges && (
            <Button
              onClick={() => {
                onCancel();
                onOpenChange(false);
              }}
              variant="default"
              className="w-full sm:w-auto"
            >
              OK
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
