import React, { useCallback, useEffect, useMemo } from 'react';
import { ArrowDown, ArrowUp, ChevronsDown, ChevronsUp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ImageToolbarProps {
  name?: string | null;
  onBringForward: () => void;
  onSendBackward: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onDelete?: () => void;
}

const Separator = () => <span className="h-6 w-px shrink-0 rounded-full bg-border/60" />;

const ImageToolbar: React.FC<ImageToolbarProps> = ({
  name,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
  onDelete,
}) => {
  return (
    <div className="flex items-center gap-2">
      {name && <span className="max-w-[160px] truncate text-sm font-medium text-foreground">{name}</span>}
      <Separator />
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
      {onDelete && (
        <>
          <Separator />
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className="h-8 w-8 shrink-0 rounded-full text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </>
      )}
    </div>
  );
};

interface SlideImageObjectProps {
  id: string;
  canEdit: boolean;
  isSelected: boolean;
  src: string | null;
  name: string | null;
  fullBleed?: boolean;
  onInteract: () => void;
  onToolbarStateChange: (objectId: string, toolbar: React.ReactNode | null) => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onDelete?: () => void;
}

export const SlideImageObject: React.FC<SlideImageObjectProps> = ({
  id,
  canEdit,
  isSelected,
  src,
  name,
  fullBleed = false,
  onInteract,
  onToolbarStateChange,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
  onDelete,
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

  const toolbar = useMemo(() => {
    if (!canEdit) {
      return null;
    }

    return (
      <ImageToolbar
        name={name}
        onBringForward={handleBringForward}
        onSendBackward={handleSendBackward}
        onBringToFront={handleBringToFront}
        onSendToBack={handleSendToBack}
        onDelete={onDelete}
      />
    );
  }, [
    canEdit,
    handleBringForward,
    handleSendBackward,
    handleBringToFront,
    handleSendToBack,
    name,
    onDelete,
  ]);

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

  const resolvedName = name && name.trim().length > 0 ? name : 'Slide image';

  return (
    <div
      className={cn(
        'relative h-full w-full overflow-hidden',
        canEdit ? 'group' : undefined,
        fullBleed ? 'rounded-none' : 'rounded-2xl',
      )}
    >
      {src ? (
        <img src={src} alt={resolvedName} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-muted/20 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Image
        </div>
      )}
      {canEdit && isSelected && onDelete && (
        <Button
          size="icon"
          variant="ghost"
          type="button"
          className="absolute top-3 right-3 h-9 w-9 rounded-full text-muted-foreground hover:text-destructive"
          onClick={() => {
            onInteract();
            onDelete();
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};

export default SlideImageObject;
