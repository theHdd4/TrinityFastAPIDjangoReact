import React, { useCallback, useEffect, useMemo } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronsDown,
  ChevronsUp,
  Crop,
  FlipHorizontal,
  ImagePlus,
  Move,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ImageToolbarProps {
  name?: string | null;
  previewSrc?: string | null;
  fitMode: 'cover' | 'contain';
  isFlipped: boolean;
  isAnimated: boolean;
  onToggleFit?: () => void;
  onToggleFlip?: () => void;
  onToggleAnimate?: () => void;
  onRequestPosition?: () => void;
  onRequestReplace?: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onDelete?: () => void;
}

const Separator = () => <span className="h-6 w-px shrink-0 rounded-full bg-border/60" />;

const ImageToolbar: React.FC<ImageToolbarProps> = ({
  name,
  previewSrc,
  fitMode,
  isFlipped,
  isAnimated,
  onToggleFit,
  onToggleFlip,
  onToggleAnimate,
  onRequestPosition,
  onRequestReplace,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
  onDelete,
}) => {
  const handleToolbarMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
  };

  const controlChipClasses = (active?: boolean) =>
    cn(
      'inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[13px] font-medium text-muted-foreground transition-colors',
      active
        ? 'bg-foreground text-background shadow-sm'
        : 'bg-transparent hover:bg-muted/40 hover:text-foreground',
    );

  const layerButtons = useMemo(
    () =>
      [
        { id: 'forward', icon: ArrowUp, handler: onBringForward },
        { id: 'backward', icon: ArrowDown, handler: onSendBackward },
        { id: 'front', icon: ChevronsUp, handler: onBringToFront },
        { id: 'back', icon: ChevronsDown, handler: onSendToBack },
      ].filter(entry => typeof entry.handler === 'function'),
    [onBringForward, onBringToFront, onSendBackward, onSendToBack],
  );

  return (
    <div
      className="relative flex w-full max-w-full items-center justify-center gap-2 whitespace-nowrap rounded-full border border-border/70 bg-background/95 px-3 py-2.5 text-sm shadow-[0_24px_48px_-22px_rgba(124,58,237,0.35)] backdrop-blur-lg"
      data-image-toolbar-root
    >
      <div className="flex min-w-0 items-center gap-2">
        <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full border border-border/60 bg-muted/40">
          {previewSrc ? (
            <img src={previewSrc} alt={name ?? 'Selected image'} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Img
            </div>
          )}
        </div>
        {name && <span className="max-w-[180px] truncate text-sm font-medium text-foreground">{name}</span>}
      </div>
      <Separator />
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={onToggleFit}
          onMouseDown={handleToolbarMouseDown}
          disabled={!onToggleFit}
          className={controlChipClasses(fitMode === 'cover')}
          aria-pressed={fitMode === 'cover'}
        >
          <Crop className="h-4 w-4" />
          {fitMode === 'cover' ? 'Crop' : 'Fit'}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={onToggleFlip}
          onMouseDown={handleToolbarMouseDown}
          disabled={!onToggleFlip}
          className={controlChipClasses(isFlipped)}
          aria-pressed={isFlipped}
        >
          <FlipHorizontal className="h-4 w-4" />
          Flip
        </Button>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={onToggleAnimate}
          onMouseDown={handleToolbarMouseDown}
          disabled={!onToggleAnimate}
          className={cn(controlChipClasses(isAnimated), 'gap-1')}
          aria-pressed={isAnimated}
        >
          <Sparkles className="h-4 w-4 text-purple-500" />
          Animate
        </Button>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={onRequestPosition}
          onMouseDown={handleToolbarMouseDown}
          disabled={!onRequestPosition}
          className={controlChipClasses(false)}
        >
          <Move className="h-4 w-4" />
          Position
        </Button>
      </div>
      {layerButtons.length > 0 && (
        <>
          <Separator />
          <div className="flex items-center gap-1">
            {layerButtons.map(entry => {
              const Icon = entry.icon;
              return (
                <Button
                  key={entry.id}
                  variant="ghost"
                  size="icon"
                  type="button"
                  className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
                  onClick={entry.handler as () => void}
                  onMouseDown={handleToolbarMouseDown}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              );
            })}
          </div>
        </>
      )}
      {onRequestReplace && (
        <>
          <Separator />
          <Button
            variant="ghost"
            size="icon"
            type="button"
            onClick={onRequestReplace}
            onMouseDown={handleToolbarMouseDown}
            className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
          >
            <ImagePlus className="h-4 w-4" />
          </Button>
        </>
      )}
      {onDelete && (
        <>
          <Separator />
          <Button
            variant="ghost"
            size="icon"
            type="button"
            className="h-8 w-8 shrink-0 rounded-full text-destructive hover:text-destructive"
            onClick={onDelete}
            onMouseDown={handleToolbarMouseDown}
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
  fitMode?: 'cover' | 'contain';
  isFlipped?: boolean;
  isAnimated?: boolean;
  onInteract: () => void;
  onToolbarStateChange: (objectId: string, toolbar: React.ReactNode | null) => void;
  onToggleFit?: () => void;
  onToggleFlip?: () => void;
  onToggleAnimate?: () => void;
  onRequestPositionPanel?: () => void;
  onRequestReplace?: () => void;
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
  fitMode = 'cover',
  isFlipped = false,
  isAnimated = false,
  onInteract,
  onToolbarStateChange,
  onToggleFit,
  onToggleFlip,
  onToggleAnimate,
  onRequestPositionPanel,
  onRequestReplace,
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

  const handleToggleFit = useCallback(() => {
    if (!onToggleFit) {
      return;
    }
    onInteract();
    onToggleFit();
  }, [onInteract, onToggleFit]);

  const handleToggleFlip = useCallback(() => {
    if (!onToggleFlip) {
      return;
    }
    onInteract();
    onToggleFlip();
  }, [onInteract, onToggleFlip]);

  const handleToggleAnimate = useCallback(() => {
    if (!onToggleAnimate) {
      return;
    }
    onInteract();
    onToggleAnimate();
  }, [onInteract, onToggleAnimate]);

  const handleRequestPosition = useCallback(() => {
    if (!onRequestPositionPanel) {
      return;
    }
    onInteract();
    onRequestPositionPanel();
  }, [onInteract, onRequestPositionPanel]);

  const handleRequestReplace = useCallback(() => {
    if (!onRequestReplace) {
      return;
    }
    onInteract();
    onRequestReplace();
  }, [onInteract, onRequestReplace]);

  const toolbar = useMemo(() => {
    if (!canEdit) {
      return null;
    }

    return (
      <ImageToolbar
        name={name}
        previewSrc={src}
        fitMode={fitMode}
        isFlipped={isFlipped}
        isAnimated={isAnimated}
        onToggleFit={onToggleFit ? handleToggleFit : undefined}
        onToggleFlip={onToggleFlip ? handleToggleFlip : undefined}
        onToggleAnimate={onToggleAnimate ? handleToggleAnimate : undefined}
        onRequestPosition={onRequestPositionPanel ? handleRequestPosition : undefined}
        onRequestReplace={onRequestReplace ? handleRequestReplace : undefined}
        onBringForward={handleBringForward}
        onSendBackward={handleSendBackward}
        onBringToFront={handleBringToFront}
        onSendToBack={handleSendToBack}
        onDelete={onDelete}
      />
    );
  }, [
    canEdit,
    fitMode,
    handleBringForward,
    handleSendBackward,
    handleBringToFront,
    handleSendToBack,
    handleToggleAnimate,
    handleToggleFit,
    handleToggleFlip,
    handleRequestPosition,
    handleRequestReplace,
    isAnimated,
    isFlipped,
    name,
    onRequestPositionPanel,
    onRequestReplace,
    onToggleAnimate,
    onToggleFit,
    onToggleFlip,
    onDelete,
    src,
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
        <img
          src={src}
          alt={resolvedName}
          className={cn(
            'slide-image-visual h-full w-full object-cover',
            fitMode === 'contain' ? 'object-contain' : 'object-cover',
            isAnimated && 'animate-slide-image',
          )}
          style={{ '--image-flip-scale': isFlipped ? -1 : 1 } as React.CSSProperties}
        />
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
