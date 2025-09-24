import { useCallback, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import ConfirmationDialog from '@/templates/DialogueBox/ConfirmationDialog';

type ConfirmHandler = (nextValue: string) => Promise<void> | void;

interface UseDataSourceChangeWarningOptions {
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export function useDataSourceChangeWarning(
  onConfirmChange: ConfirmHandler,
  options: UseDataSourceChangeWarningOptions = {}
) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingValue, setPendingValue] = useState<string | null>(null);

  const resetDialogState = useCallback(() => {
    setDialogOpen(false);
    setPendingValue(null);
  }, []);

  const requestChange = useCallback(
    (nextValue: string, shouldWarn: boolean) => {
      if (shouldWarn) {
        setPendingValue(nextValue);
        setDialogOpen(true);
        return;
      }

      return onConfirmChange(nextValue);
    },
    [onConfirmChange]
  );

  const handleConfirm = useCallback(async () => {
    if (pendingValue === null) {
      resetDialogState();
      return;
    }

    try {
      await onConfirmChange(pendingValue);
    } finally {
      resetDialogState();
    }
  }, [onConfirmChange, pendingValue, resetDialogState]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        resetDialogState();
      } else {
        setDialogOpen(true);
      }
    },
    [resetDialogState]
  );

  const dialog = (
    <ConfirmationDialog
      open={dialogOpen}
      onOpenChange={handleOpenChange}
      onConfirm={handleConfirm}
      onCancel={resetDialogState}
      title={options.title ?? 'Change data source?'}
      description={
        options.description ??
        'Changing data source will remove existing updates on this atom. Do you want to continue?'
      }
      icon={<AlertTriangle className="w-5 h-5 text-white" />}
      confirmLabel={options.confirmLabel ?? 'Yes, change'}
      cancelLabel={options.cancelLabel ?? 'No, keep current'}
      iconBgClass="bg-amber-500"
      confirmButtonClass="bg-amber-500 hover:bg-amber-600"
    />
  );

  return { requestChange, dialog };
}

export default useDataSourceChangeWarning;
