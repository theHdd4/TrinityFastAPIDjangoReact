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
import { AlertTriangle } from 'lucide-react';

interface WorkflowOverwriteDialogProps {
  isOpen: boolean;
  onOverwrite: () => void;
  onAppend: () => void;
  onCancel: () => void;
}

const WorkflowOverwriteDialog: React.FC<WorkflowOverwriteDialogProps> = ({
  isOpen,
  onOverwrite,
  onAppend,
  onCancel,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-full bg-yellow-100 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-yellow-600" />
            </div>
            <DialogTitle className="text-xl">Workflow Already Exists</DialogTitle>
          </div>
          <DialogDescription className="text-base pt-2">
            There is already a workflow on the canvas. Would you like to overwrite the existing AI-created molecules or append the new ones?
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-3 py-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <h4 className="font-semibold text-sm text-blue-900 mb-1">Overwrite</h4>
            <p className="text-xs text-blue-700">
              Remove all AI-created molecules and create new ones. Manually created molecules will be preserved.
            </p>
          </div>
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <h4 className="font-semibold text-sm text-green-900 mb-1">Append</h4>
            <p className="text-xs text-green-700">
              Keep existing molecules and add new ones to the right of the current workflow.
            </p>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={onOverwrite}
            className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white"
          >
            Overwrite
          </Button>
          <Button
            onClick={onAppend}
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white"
          >
            Append
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default WorkflowOverwriteDialog;

