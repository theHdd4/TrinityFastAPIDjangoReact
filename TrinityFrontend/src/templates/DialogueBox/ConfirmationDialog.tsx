import React from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  description: string;
  icon: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  iconBgClass?: string;
  confirmButtonClass?: string;
}

const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
  onCancel,
  title,
  description,
  icon,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  iconBgClass = 'bg-blue-500',
  confirmButtonClass = 'bg-green-500 hover:bg-green-600',
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md border-2 border-blue-200 bg-white shadow-xl">
        <div className="relative">
          <DialogHeader className="text-center pb-6">
            <div className={`mx-auto w-12 h-12 ${iconBgClass} rounded-full flex items-center justify-center mb-4`}>
              {icon}
            </div>
            <DialogTitle className="text-xl font-medium text-gray-800">
              {title}
            </DialogTitle>
            <DialogDescription className="text-gray-600 mt-2 leading-relaxed">
              {description}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-2">
            <Button
              variant="outline"
              onClick={onCancel}
              className="flex-1 h-10 border-2 border-gray-300 hover:border-gray-400 bg-white hover:bg-gray-50 text-gray-700 transition-colors duration-200"
            >
              <X className="w-4 h-4 mr-2" />
              {cancelLabel}
            </Button>
            <Button
              onClick={onConfirm}
              className={`flex-1 h-10 ${confirmButtonClass} text-white transition-colors duration-200`}
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              {confirmLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ConfirmationDialog;
