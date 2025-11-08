import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crop, FlipHorizontal, FlipVertical, CircleDashed, Maximize2, Move, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import {
  CropHandle,
  DEFAULT_CROP_INSETS,
  ImageCropInsets,
  ImageCropOverlay,
  hasCrop as hasActiveCrop,
  useImageCropInteraction,
} from './toolbar/Crop';

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
  onDelete?: () => void;
}

const Separator = () => <span className="h-6 w-px shrink-0 rounded-full bg-border/60" />;

const clampOpacity = (value: number) => Math.min(Math.max(value, 0), 1);

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
        {onOpacityChange && (
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
        )}
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
  onToggleFit?: (objectId: string) => void;
  onToggleCrop?: (objectId: string) => void;
  onFlipHorizontal?: (objectId: string) => void;
  onFlipVertical?: (objectId: string) => void;
  onToggleAnimate?: (objectId: string) => void;
  onRequestPositionPanel?: (objectId: string) => void;
  onOpacityChange?: (objectId: string, opacity: number) => void;
  onCropChange?: (objectId: string, next: ImageCropInsets) => void;
  onCropCommit?: (objectId: string) => void;
  onResetCrop?: (objectId: string) => void;
  onDelete?: (objectId: string) => void;
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
  onDelete,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
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

  const handleToggleFit = useCallback(() => {
    if (!onToggleFit) {
      return;
    }
    const nextFit = localFitMode === 'contain' ? 'cover' : 'contain';
    setLocalFitMode(nextFit);
    onInteract();
    onToggleFit(id);
  }, [id, localFitMode, onInteract, onToggleFit]);

  const handleCropChange = useCallback(
    (next: ImageCropInsets) => {
      onCropChange?.(id, next);
    },
    [id, onCropChange],
  );

  const handleCropCommit = useCallback(() => {
    onCropCommit?.(id);
  }, [id, onCropCommit]);

  const { beginCropDrag, isDragging: isCropDragging, normalizedCrop } = useImageCropInteraction({
    isCropping,
    cropInsets,
    containerRef,
    onCropChange: handleCropChange,
    onCropCommit: handleCropCommit,
  });

  const handleToggleCrop = useCallback(() => {
    if (!onToggleCrop) {
      return;
    }
    onInteract();
    onToggleCrop(id);
  }, [id, onInteract, onToggleCrop]);

  const handleFlipHorizontal = useCallback(() => {
    if (!onFlipHorizontal) {
      return;
    }
    setLocalFlipHorizontal(previous => !previous);
    onInteract();
    onFlipHorizontal(id);
  }, [id, onFlipHorizontal, onInteract]);

  const handleFlipVertical = useCallback(() => {
    if (!onFlipVertical) {
      return;
    }
    setLocalFlipVertical(previous => !previous);
    onInteract();
    onFlipVertical(id);
  }, [id, onFlipVertical, onInteract]);

  const handleOpacityChange = useCallback(
    (value: number) => {
      if (!onOpacityChange) {
        return;
      }
      const clamped = clampOpacity(value);
      setLocalOpacity(clamped);
      onInteract();
      onOpacityChange(id, clamped);
    },
    [id, onInteract, onOpacityChange],
  );

  const handleToggleAnimate = useCallback(() => {
    if (!onToggleAnimate) {
      return;
    }
    setLocalAnimated(previous => !previous);
    onInteract();
    onToggleAnimate(id);
  }, [id, onInteract, onToggleAnimate]);

  const handleRequestPosition = useCallback(() => {
    if (!onRequestPositionPanel) {
      return;
    }
    onInteract();
    onRequestPositionPanel(id);
  }, [id, onInteract, onRequestPositionPanel]);

  const handleCropPointerDown = useCallback(
    (handle: CropHandle, event: React.PointerEvent<HTMLElement>) => {
      const started = beginCropDrag(handle, event);
      if (started) {
        onInteract();
      }
    },
    [beginCropDrag, onInteract],
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
        onDelete={onDelete ? () => onDelete(id) : undefined}
      />
    );
  }, [
    canEdit,
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
    id,
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
  const hasCrop = hasActiveCrop(normalizedCrop);

  const handleResetCrop = useCallback(() => {
    if (!onResetCrop) {
      return;
    }
    onInteract();
    onResetCrop(id);
  }, [id, onInteract, onResetCrop]);

  const clipPathValue = useMemo(() => {
    if (!hasCrop) {
      return undefined;
    }

    const insetValues = [
      normalizedCrop.top,
      normalizedCrop.right,
      normalizedCrop.bottom,
      normalizedCrop.left,
    ]
      .map(value => `${value}%`)
      .join(' ');

    return `inset(${insetValues})`;
  }, [hasCrop, normalizedCrop.bottom, normalizedCrop.left, normalizedCrop.right, normalizedCrop.top]);

  const imageStyle = useMemo<React.CSSProperties>(
    () => {
      const scaleX = localFlipHorizontal ? -1 : 1;
      const scaleY = localFlipVertical ? -1 : 1;

      return {
        '--image-flip-scale-x': `${scaleX}`,
        '--image-flip-scale-y': `${scaleY}`,
        transform: `scaleX(${scaleX}) scaleY(${scaleY})`,
        transformOrigin: 'center center',
        opacity: clampOpacity(localOpacity),
        clipPath: clipPathValue,
      } as React.CSSProperties;
    },
    [clipPathValue, localFlipHorizontal, localFlipVertical, localOpacity],
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
            <ImageCropOverlay
              cropInsets={normalizedCrop}
              isDragging={isCropDragging}
              onBeginDrag={handleCropPointerDown}
              onResetCrop={onResetCrop && hasCrop ? handleResetCrop : undefined}
            />
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
            onDelete(id);
          }}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
};

export default SlideImageObject;
