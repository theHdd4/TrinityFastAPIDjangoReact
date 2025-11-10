import React, { useCallback, useEffect, useMemo } from 'react';
import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, Edit3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import SlideChart from './SlideChart';
import type { ChartConfig, ChartDataRow } from './types';

interface ChartToolbarProps {
  onBringForward: () => void;
  onSendBackward: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onRequestEdit?: () => void;
}

const Separator = () => <span className="h-6 w-px shrink-0 rounded-full bg-border/60" />;

const ChartToolbar: React.FC<ChartToolbarProps> = ({
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
  onRequestEdit,
}) => (
  <div className="flex items-center gap-2">
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        type="button"
        className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
        onClick={onBringForward}
      >
        <ArrowUp className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        type="button"
        className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
        onClick={onSendBackward}
      >
        <ArrowDown className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        type="button"
        className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
        onClick={onBringToFront}
      >
        <ChevronsUp className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        type="button"
        className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
        onClick={onSendToBack}
      >
        <ChevronsDown className="h-4 w-4" />
      </Button>
    </div>
    {onRequestEdit && (
      <>
        <Separator />
        <Button
          variant="ghost"
          size="sm"
          type="button"
          className="gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          onClick={onRequestEdit}
        >
          <Edit3 className="h-4 w-4" />
          Edit data
        </Button>
      </>
    )}
  </div>
);

interface SlideChartObjectProps {
  id: string;
  canEdit: boolean;
  isSelected: boolean;
  data: ChartDataRow[];
  config: ChartConfig;
  captureId?: string;
  onToolbarStateChange: (objectId: string, toolbar: React.ReactNode | null) => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onRequestEdit?: () => void;
  onInteract: () => void;
}

export const SlideChartObject: React.FC<SlideChartObjectProps> = ({
  id,
  canEdit,
  isSelected,
  data,
  config,
  captureId,
  onToolbarStateChange,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
  onRequestEdit,
  onInteract,
}) => {
  const handleBringForward = useCallback(() => {
    onInteract();
    onBringForward();
  }, [onBringForward, onInteract]);

  const handleSendBackward = useCallback(() => {
    onInteract();
    onSendBackward();
  }, [onInteract, onSendBackward]);

  const handleBringToFront = useCallback(() => {
    onInteract();
    onBringToFront();
  }, [onBringToFront, onInteract]);

  const handleSendToBack = useCallback(() => {
    onInteract();
    onSendToBack();
  }, [onInteract, onSendToBack]);

  const handleRequestEdit = useCallback(() => {
    if (!onRequestEdit) {
      return;
    }
    onInteract();
    onRequestEdit();
  }, [onInteract, onRequestEdit]);

  const toolbar = useMemo(() => {
    if (!canEdit) {
      return null;
    }

    return (
      <ChartToolbar
        onBringForward={handleBringForward}
        onSendBackward={handleSendBackward}
        onBringToFront={handleBringToFront}
        onSendToBack={handleSendToBack}
        onRequestEdit={onRequestEdit ? handleRequestEdit : undefined}
      />
    );
  }, [canEdit, handleBringForward, handleSendBackward, handleBringToFront, handleSendToBack, handleRequestEdit, onRequestEdit]);

  useEffect(() => {
    if (!canEdit) {
      onToolbarStateChange(id, null);
      return () => {
        onToolbarStateChange(id, null);
      };
    }

    onToolbarStateChange(id, isSelected ? toolbar : null);

    return () => {
      onToolbarStateChange(id, null);
    };
  }, [canEdit, id, isSelected, onToolbarStateChange, toolbar]);

  return (
    <div className={cn('relative h-full w-full overflow-hidden rounded-2xl bg-background/95')}>
      <SlideChart data={data} config={config} className="h-full w-full" captureId={captureId} />
    </div>
  );
};

export default SlideChartObject;
