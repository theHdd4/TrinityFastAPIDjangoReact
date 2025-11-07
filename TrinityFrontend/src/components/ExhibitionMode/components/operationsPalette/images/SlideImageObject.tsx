import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronsDown,
  ChevronsUp,
  Crop,
  FlipHorizontal,
  FlipVertical,
  CircleDashed,
  Maximize2,
  Move,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface ImageToolbarProps {
  name?: string | null;
  previewSrc?: string | null;
  fitMode: 'cover' | 'contain';
  isCropping: boolean;
  flipHorizontal: boolean;
  flipVertical: boolean;
  isAnimated: boolean;
  opacity: number;
  onToggleFit?: () => void;
  onToggleCrop?: () => void;
  onFlipHorizontal?: () => void;
  onFlipVertical?: () => void;
  onToggleAnimate?: () => void;
  onRequestPosition?: () => void;
  onOpacityChange?: (opacity: number) => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onDelete?: () => void;
}

const Separator = () => <span className="h-6 w-px shrink-0 rounded-full bg-border/60" />;

const clampOpacity = (value: number) => Math.min(Math.max(value, 0), 1);

interface ImageCropInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const DEFAULT_CROP_INSETS: ImageCropInsets = { top: 0, right: 0, bottom: 0, left: 0 };

const clampCropValue = (value: number) => Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), 95);
const roundCropValue = (value: number) => Math.round(value * 100) / 100;
const MIN_VISIBLE_PERCENT = 5;

const normalizeCropInsets = (value: unknown): ImageCropInsets => {
  if (!value || typeof value !== 'object') {
    return DEFAULT_CROP_INSETS;
  }

  const candidate = value as Partial<ImageCropInsets>;
  const top = clampCropValue(candidate.top ?? 0);
  const right = clampCropValue(candidate.right ?? 0);
  const bottom = clampCropValue(candidate.bottom ?? 0);
  const left = clampCropValue(candidate.left ?? 0);

  const maxTop = Math.max(0, 100 - MIN_VISIBLE_PERCENT - bottom);
  const resolvedTop = Math.min(top, maxTop);
  const maxBottom = Math.max(0, 100 - MIN_VISIBLE_PERCENT - resolvedTop);
  const resolvedBottom = Math.min(bottom, maxBottom);
  const maxLeft = Math.max(0, 100 - MIN_VISIBLE_PERCENT - right);
  const resolvedLeft = Math.min(left, maxLeft);
  const maxRight = Math.max(0, 100 - MIN_VISIBLE_PERCENT - resolvedLeft);
  const resolvedRight = Math.min(right, maxRight);

  return {
    top: roundCropValue(resolvedTop),
    right: roundCropValue(resolvedRight),
    bottom: roundCropValue(resolvedBottom),
    left: roundCropValue(resolvedLeft),
  } satisfies ImageCropInsets;
};

const ImageToolbar: React.FC<ImageToolbarProps> = ({
  name,
  previewSrc,
  fitMode,
  isCropping,
  flipHorizontal,
  flipVertical,
  isAnimated,
  opacity,
  onToggleFit,
  onToggleCrop,
  onFlipHorizontal,
  onFlipVertical,
  onToggleAnimate,
  onRequestPosition,
  onOpacityChange,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
  onDelete,
}) => {
  const handleToolbarMouseDown = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
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
          onClick={onToggleCrop}
          onMouseDown={handleToolbarMouseDown}
          disabled={!onToggleCrop}
          className={controlChipClasses(isCropping)}
          aria-pressed={isCropping}
        >
          <Crop className="h-4 w-4" />
          Crop
        </Button>
        <Button
          variant="ghost"
          size="sm"
          type="button"
          onClick={onToggleFit}
          onMouseDown={handleToolbarMouseDown}
          disabled={!onToggleFit}
          className={controlChipClasses(fitMode === 'contain')}
          aria-pressed={fitMode === 'contain'}
        >
          <Maximize2 className="h-4 w-4" />
          Fit
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onMouseDown={handleToolbarMouseDown}
              disabled={!onFlipHorizontal && !onFlipVertical}
              className={controlChipClasses(flipHorizontal || flipVertical)}
              aria-haspopup="menu"
            >
              <FlipHorizontal className="h-4 w-4" />
              Flip
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="center"
            className="z-[4000] min-w-[160px] rounded-xl border border-border/70 bg-background/95 p-1.5 shadow-2xl"
          >
            <DropdownMenuItem
              disabled={!onFlipHorizontal}
              onSelect={event => {
                event.preventDefault();
                onFlipHorizontal?.();
              }}
              className="gap-2 text-sm"
            >
              <FlipHorizontal className="h-4 w-4" />
              Flip horizontal
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!onFlipVertical}
              onSelect={event => {
                event.preventDefault();
                onFlipVertical?.();
              }}
              className="gap-2 text-sm"
            >
              <FlipVertical className="h-4 w-4" />
              Flip vertical
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
      {onOpacityChange && (
        <>
          <Separator />
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                className={cn(
                  controlChipClasses(opacity < 1),
                  'gap-1 px-3 text-[13px] font-medium',
                )}
                onMouseDown={handleToolbarMouseDown}
              >
                <CircleDashed className="h-4 w-4" />
                Opacity {Math.round(opacity * 100)}%
              </Button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="center"
              className="z-[4000] w-56 rounded-xl border border-border/70 bg-background/95 p-4 shadow-2xl"
              data-text-toolbar-root
            >
              <label className="flex flex-col gap-2 text-xs font-medium text-muted-foreground">
                <span>Opacity</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(opacity * 100)}
                  onChange={event => {
                    const value = Number(event.target.value);
                    if (!Number.isFinite(value)) {
                      return;
                    }
                    onOpacityChange?.(clampOpacity(value / 100));
                  }}
                  className="h-2 w-full cursor-pointer accent-primary"
                />
              </label>
            </PopoverContent>
          </Popover>
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
  isCropping?: boolean;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  isAnimated?: boolean;
  opacity?: number;
  cropInsets?: ImageCropInsets | null;
  onInteract: () => void;
  onToolbarStateChange: (objectId: string, toolbar: React.ReactNode | null) => void;
  onToggleFit?: () => void;
  onToggleCrop?: () => void;
  onFlipHorizontal?: () => void;
  onFlipVertical?: () => void;
  onToggleAnimate?: () => void;
  onRequestPositionPanel?: () => void;
  onOpacityChange?: (opacity: number) => void;
  onCropChange?: (next: ImageCropInsets) => void;
  onCropCommit?: () => void;
  onResetCrop?: () => void;
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
  isCropping = false,
  flipHorizontal = false,
  flipVertical = false,
  isAnimated = false,
  opacity = 1,
  cropInsets = DEFAULT_CROP_INSETS,
  onInteract,
  onToolbarStateChange,
  onToggleFit,
  onToggleCrop,
  onFlipHorizontal,
  onFlipVertical,
  onToggleAnimate,
  onRequestPositionPanel,
  onOpacityChange,
  onCropChange,
  onCropCommit,
  onResetCrop,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
  onDelete,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cropDragStateRef = useRef<{
    handle: 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';
    startX: number;
    startY: number;
    containerRect: DOMRect;
    initialCrop: ImageCropInsets;
  } | null>(null);
  const [isCropDragging, setIsCropDragging] = useState(false);
  const normalizedCrop = useMemo(() => normalizeCropInsets(cropInsets), [cropInsets]);
  const [localFitMode, setLocalFitMode] = useState<'cover' | 'contain'>(fitMode);
  const [localFlipHorizontal, setLocalFlipHorizontal] = useState<boolean>(flipHorizontal);
  const [localFlipVertical, setLocalFlipVertical] = useState<boolean>(flipVertical);
  const [localAnimated, setLocalAnimated] = useState<boolean>(isAnimated);
  const [localOpacity, setLocalOpacity] = useState<number>(clampOpacity(opacity));

  useEffect(() => {
    setLocalFitMode(fitMode);
  }, [fitMode]);

  useEffect(() => {
    setLocalFlipHorizontal(flipHorizontal);
  }, [flipHorizontal]);

  useEffect(() => {
    setLocalFlipVertical(flipVertical);
  }, [flipVertical]);

  useEffect(() => {
    setLocalAnimated(isAnimated);
  }, [isAnimated]);

  useEffect(() => {
    setLocalOpacity(clampOpacity(opacity));
  }, [opacity]);

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
    const nextFit = localFitMode === 'contain' ? 'cover' : 'contain';
    setLocalFitMode(nextFit);
    onInteract();
    onToggleFit();
  }, [localFitMode, onInteract, onToggleFit]);

  const handleToggleCrop = useCallback(() => {
    if (!onToggleCrop) {
      return;
    }
    onInteract();
    onToggleCrop();
  }, [onInteract, onToggleCrop]);

  const handleFlipHorizontal = useCallback(() => {
    if (!onFlipHorizontal) {
      return;
    }
    setLocalFlipHorizontal(previous => !previous);
    onInteract();
    onFlipHorizontal();
  }, [onFlipHorizontal, onInteract]);

  const handleFlipVertical = useCallback(() => {
    if (!onFlipVertical) {
      return;
    }
    setLocalFlipVertical(previous => !previous);
    onInteract();
    onFlipVertical();
  }, [onFlipVertical, onInteract]);

  const handleOpacityChange = useCallback(
    (value: number) => {
      if (!onOpacityChange) {
        return;
      }
      const clamped = clampOpacity(value);
      setLocalOpacity(clamped);
      onInteract();
      onOpacityChange(clamped);
    },
    [onInteract, onOpacityChange],
  );

  const handleToggleAnimate = useCallback(() => {
    if (!onToggleAnimate) {
      return;
    }
    setLocalAnimated(previous => !previous);
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

  const computeNextCrop = useCallback(
    (
      handle: 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se',
      deltaXPercent: number,
      deltaYPercent: number,
      initial: ImageCropInsets,
    ): ImageCropInsets => {
      const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
      let nextTop = initial.top;
      let nextRight = initial.right;
      let nextBottom = initial.bottom;
      let nextLeft = initial.left;

      if (handle === 'move') {
        const width = 100 - initial.left - initial.right;
        const height = 100 - initial.top - initial.bottom;
        const maxLeft = Math.max(0, 100 - width);
        const maxTop = Math.max(0, 100 - height);
        const proposedLeft = clamp(initial.left + deltaXPercent, 0, maxLeft);
        const proposedTop = clamp(initial.top + deltaYPercent, 0, maxTop);
        nextLeft = proposedLeft;
        nextTop = proposedTop;
        nextRight = 100 - width - proposedLeft;
        nextBottom = 100 - height - proposedTop;
        return normalizeCropInsets({ top: nextTop, right: nextRight, bottom: nextBottom, left: nextLeft });
      }

      if (handle.includes('n')) {
        const maxTop = 100 - MIN_VISIBLE_PERCENT - initial.bottom;
        nextTop = clamp(initial.top + deltaYPercent, 0, maxTop);
      }
      if (handle.includes('s')) {
        const maxBottom = 100 - MIN_VISIBLE_PERCENT - nextTop;
        nextBottom = clamp(initial.bottom - deltaYPercent, 0, maxBottom);
      }
      if (handle.includes('w')) {
        const maxLeft = 100 - MIN_VISIBLE_PERCENT - initial.right;
        nextLeft = clamp(initial.left + deltaXPercent, 0, maxLeft);
      }
      if (handle.includes('e')) {
        const maxRight = 100 - MIN_VISIBLE_PERCENT - nextLeft;
        nextRight = clamp(initial.right - deltaXPercent, 0, maxRight);
      }

      return normalizeCropInsets({ top: nextTop, right: nextRight, bottom: nextBottom, left: nextLeft });
    },
    [],
  );

  const handleCropPointerMove = useCallback(
    (event: PointerEvent) => {
      const state = cropDragStateRef.current;
      if (!state || !onCropChange) {
        return;
      }

      const { handle, startX, startY, containerRect, initialCrop } = state;
      if (containerRect.width <= 0 || containerRect.height <= 0) {
        return;
      }

      const deltaXPercent = ((event.clientX - startX) / containerRect.width) * 100;
      const deltaYPercent = ((event.clientY - startY) / containerRect.height) * 100;
      const next = computeNextCrop(handle, deltaXPercent, deltaYPercent, initialCrop);
      onCropChange(next);
    },
    [computeNextCrop, onCropChange],
  );

  const handleCropPointerUp = useCallback(
    () => {
      if (!cropDragStateRef.current) {
        return;
      }
      window.removeEventListener('pointermove', handleCropPointerMove);
      window.removeEventListener('pointerup', handleCropPointerUp);
      cropDragStateRef.current = null;
      setIsCropDragging(false);
      onCropCommit?.();
    },
    [handleCropPointerMove, onCropCommit],
  );

  const handleCropPointerDown = useCallback(
    (
      handle: 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se',
      event: React.PointerEvent<HTMLDivElement>,
    ) => {
      if (!isCropping || !onCropChange) {
        return;
      }

      const container = containerRef.current;
      if (!container) {
        return;
      }

      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onInteract();

      cropDragStateRef.current = {
        handle,
        startX: event.clientX,
        startY: event.clientY,
        containerRect: rect,
        initialCrop: normalizedCrop,
      };
      setIsCropDragging(true);
      window.addEventListener('pointermove', handleCropPointerMove);
      window.addEventListener('pointerup', handleCropPointerUp);
    },
    [handleCropPointerMove, handleCropPointerUp, isCropping, normalizedCrop, onCropChange, onInteract],
  );

  const toolbar = useMemo(() => {
    if (!canEdit) {
      return null;
    }

    return (
      <ImageToolbar
        name={name}
        previewSrc={src}
        fitMode={localFitMode}
        isCropping={isCropping}
        flipHorizontal={localFlipHorizontal}
        flipVertical={localFlipVertical}
        isAnimated={localAnimated}
        opacity={localOpacity}
        onToggleFit={onToggleFit ? handleToggleFit : undefined}
        onToggleCrop={onToggleCrop ? handleToggleCrop : undefined}
        onFlipHorizontal={onFlipHorizontal ? handleFlipHorizontal : undefined}
        onFlipVertical={onFlipVertical ? handleFlipVertical : undefined}
        onToggleAnimate={onToggleAnimate ? handleToggleAnimate : undefined}
        onRequestPosition={onRequestPositionPanel ? handleRequestPosition : undefined}
        onOpacityChange={onOpacityChange ? handleOpacityChange : undefined}
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
    handleToggleAnimate,
    handleToggleFit,
    handleToggleCrop,
    handleFlipHorizontal,
    handleFlipVertical,
    handleOpacityChange,
    handleRequestPosition,
    localAnimated,
    localFlipHorizontal,
    localFlipVertical,
    localFitMode,
    isCropping,
    localOpacity,
    name,
    onRequestPositionPanel,
    onToggleAnimate,
    onToggleFit,
    onToggleCrop,
    onFlipHorizontal,
    onFlipVertical,
    onOpacityChange,
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

  useEffect(() => {
    if (!isCropping) {
      window.removeEventListener('pointermove', handleCropPointerMove);
      window.removeEventListener('pointerup', handleCropPointerUp);
      cropDragStateRef.current = null;
      setIsCropDragging(false);
    }

    return () => {
      window.removeEventListener('pointermove', handleCropPointerMove);
      window.removeEventListener('pointerup', handleCropPointerUp);
    };
  }, [handleCropPointerMove, handleCropPointerUp, isCropping]);

  const resolvedName = name && name.trim().length > 0 ? name : 'Slide image';
  const hasCrop =
    normalizedCrop.top > 0 ||
    normalizedCrop.right > 0 ||
    normalizedCrop.bottom > 0 ||
    normalizedCrop.left > 0;

  const clipPathValue = useMemo(() => {
    if (!hasCrop) {
      return undefined;
    }
    return `inset(${normalizedCrop.top}% ${normalizedCrop.right}% ${normalizedCrop.bottom}% ${normalizedCrop.left}%)`;
  }, [hasCrop, normalizedCrop.bottom, normalizedCrop.left, normalizedCrop.right, normalizedCrop.top]);

  const imageStyle = useMemo<React.CSSProperties>(
    () => ({
      '--image-flip-scale-x': localFlipHorizontal ? -1 : 1,
      '--image-flip-scale-y': localFlipVertical ? -1 : 1,
      opacity: clampOpacity(localOpacity),
      clipPath: clipPathValue,
    }),
    [clipPathValue, localFlipHorizontal, localFlipVertical, localOpacity],
  );

  const cropCornerHandles = useMemo(
    () => [
      { handle: 'nw' as const, className: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize' },
      { handle: 'ne' as const, className: 'top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize' },
      { handle: 'sw' as const, className: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize' },
      { handle: 'se' as const, className: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize' },
    ],
    [],
  );

  const cropEdgeHandles = useMemo(
    () => [
      { handle: 'n' as const, className: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-n-resize' },
      { handle: 's' as const, className: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-s-resize' },
      { handle: 'e' as const, className: 'top-1/2 right-0 translate-x-1/2 -translate-y-1/2 cursor-e-resize' },
      { handle: 'w' as const, className: 'top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 cursor-w-resize' },
    ],
    [],
  );

  return (
    <div
      className={cn(
        'relative h-full w-full overflow-hidden',
        canEdit ? 'group' : undefined,
        fullBleed ? 'rounded-none' : 'rounded-2xl',
      )}
      ref={containerRef}
    >
      {src ? (
        <>
          <img
            src={src}
            alt={resolvedName}
            className={cn(
              'slide-image-visual h-full w-full object-cover',
              localFitMode === 'contain' ? 'object-contain' : 'object-cover',
              localAnimated && 'animate-slide-image',
            )}
            style={imageStyle}
          />
          {isCropping && (
            <>
              <div className="pointer-events-none absolute inset-0 z-30">
                <div className="absolute left-0 right-0 top-0 bg-black/40" style={{ height: `${normalizedCrop.top}%` }} />
                <div
                  className="absolute left-0 right-0 bg-black/40"
                  style={{
                    top: `${100 - normalizedCrop.bottom}%`,
                    height: `${normalizedCrop.bottom}%`,
                  }}
                />
                <div
                  className="absolute left-0 bg-black/40"
                  style={{
                    top: `${normalizedCrop.top}%`,
                    bottom: `${normalizedCrop.bottom}%`,
                    width: `${normalizedCrop.left}%`,
                  }}
                />
                <div
                  className="absolute right-0 bg-black/40"
                  style={{
                    top: `${normalizedCrop.top}%`,
                    bottom: `${normalizedCrop.bottom}%`,
                    width: `${normalizedCrop.right}%`,
                  }}
                />
              </div>
              <div
                className={cn(
                  'absolute z-40 border-2 border-primary/80 bg-transparent',
                  isCropDragging ? 'shadow-[0_0_0_999px_rgba(59,130,246,0.12)]' : 'shadow-[0_0_0_999px_rgba(15,23,42,0.25)]',
                )}
                style={{
                  top: `${normalizedCrop.top}%`,
                  right: `${normalizedCrop.right}%`,
                  bottom: `${normalizedCrop.bottom}%`,
                  left: `${normalizedCrop.left}%`,
                  cursor: isCropDragging ? 'grabbing' : 'grab',
                }}
                onPointerDown={event => handleCropPointerDown('move', event)}
              >
                <div className="pointer-events-none absolute inset-0 border border-white/40" />
                <div className="absolute left-2 top-2 flex items-center gap-2 rounded-full bg-primary/90 px-3 py-1 text-xs font-medium text-white shadow">
                  Crop mode
                  {onResetCrop && hasCrop && (
                    <button
                      type="button"
                      className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/80 hover:bg-white/20"
                      onPointerDown={event => event.stopPropagation()}
                      onClick={event => {
                        event.preventDefault();
                        event.stopPropagation();
                        onInteract();
                        onResetCrop();
                      }}
                    >
                      Reset
                    </button>
                  )}
                </div>
                {cropCornerHandles.map(def => (
                  <span
                    key={def.handle}
                    className={cn('absolute z-50 h-3 w-3 rounded-full border border-background bg-white', def.className)}
                    onPointerDown={event => handleCropPointerDown(def.handle, event)}
                  />
                ))}
                {cropEdgeHandles.map(def => (
                  <span
                    key={def.handle}
                    className={cn('absolute z-50 h-3 w-3 rounded-full border border-background bg-white', def.className)}
                    onPointerDown={event => handleCropPointerDown(def.handle, event)}
                  />
                ))}
              </div>
            </>
          )}
        </>
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
