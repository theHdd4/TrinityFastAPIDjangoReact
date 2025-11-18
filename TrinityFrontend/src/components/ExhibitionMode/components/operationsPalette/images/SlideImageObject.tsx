import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Crop, FlipHorizontal, FlipVertical, CircleDashed, Maximize2, Move, Sparkles, Trash2, Square, Circle } from 'lucide-react';
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
  CropShape,
  DEFAULT_CROP_INSETS,
  ImageCropInsets,
  ImageCropOverlay,
  areCropInsetsEqual,
  cropLog,
  hasCrop as hasActiveCrop,
  normalizeCropInsets,
  resolveCropRenderMetrics,
  useImageCropInteraction,
} from './toolbar/Crop';

interface ImageToolbarProps {
  name?: string | null;
  previewSrc?: string | null;
  fitMode: 'cover' | 'contain';
  isCropping: boolean;
  cropShape?: CropShape;
  flipHorizontal: boolean;
  flipVertical: boolean;
  isAnimated: boolean;
  opacity: number;
  onToggleFit?: () => void;
  onToggleCrop?: () => void;
  onCropShapeChange?: (shape: CropShape) => void;
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
  cropShape = 'rectangle',
  flipHorizontal,
  flipVertical,
  isAnimated,
  opacity,
  onToggleFit,
  onToggleCrop,
  onCropShapeChange,
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
        {isCropping && onCropShapeChange && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                onMouseDown={handleToolbarMouseDown}
                className={controlChipClasses(true)}
                aria-haspopup="menu"
              >
                {cropShape === 'circle' ? (
                  <Circle className="h-4 w-4" />
                ) : cropShape === 'rounded-rectangle' ? (
                  <Square className="h-4 w-4 rounded-sm" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                <span className="capitalize ml-1">{cropShape.replace('-', ' ')}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="center"
              className="z-[4000] min-w-[160px] rounded-xl border border-border/70 bg-background/95 p-1.5 shadow-2xl"
            >
              <DropdownMenuItem
                onSelect={event => {
                  event.preventDefault();
                  onCropShapeChange('rectangle');
                }}
                className="gap-2 text-sm"
              >
                <Square className="h-4 w-4" />
                Rectangle
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={event => {
                  event.preventDefault();
                  onCropShapeChange('rounded-rectangle');
                }}
                className="gap-2 text-sm"
              >
                <Square className="h-4 w-4 rounded-sm" />
                Rounded Rectangle
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={event => {
                  event.preventDefault();
                  onCropShapeChange('circle');
                }}
                className="gap-2 text-sm"
              >
                <Circle className="h-4 w-4" />
                Circle
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
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
                event.stopPropagation();
                console.log('[ImageToolbar] Flip horizontal selected', { hasHandler: !!onFlipHorizontal });
                if (onFlipHorizontal) {
                  onFlipHorizontal();
                }
              }}
              onPointerDown={event => {
                // Prevent pointer events from bubbling to prevent deselection
                event.preventDefault();
                event.stopPropagation();
              }}
              onMouseDown={event => {
                // Prevent mouse events from bubbling
                event.preventDefault();
                event.stopPropagation();
              }}
              className="gap-2 text-sm"
            >
              <FlipHorizontal className="h-4 w-4" />
              <span className="flex-1">Flip horizontal</span>
              <span className="text-xs text-muted-foreground">H</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!onFlipVertical}
              onSelect={event => {
                event.preventDefault();
                event.stopPropagation();
                console.log('[ImageToolbar] Flip vertical selected', { hasHandler: !!onFlipVertical });
                if (onFlipVertical) {
                  onFlipVertical();
                }
              }}
              onPointerDown={event => {
                // Prevent pointer events from bubbling to prevent deselection
                event.preventDefault();
                event.stopPropagation();
              }}
              onMouseDown={event => {
                // Prevent mouse events from bubbling
                event.preventDefault();
                event.stopPropagation();
              }}
              className="gap-2 text-sm"
            >
              <FlipVertical className="h-4 w-4" />
              <span className="flex-1">Flip vertical</span>
              <span className="text-xs text-muted-foreground">V</span>
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
  cropShape?: CropShape;
  cropBorderRadius?: number;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  isAnimated?: boolean;
  opacity?: number;
  cropInsets?: ImageCropInsets | null;
  onInteract: () => void;
  onToolbarStateChange: (objectId: string, toolbar: React.ReactNode | null) => void;
  onToggleFit?: (objectId: string) => void;
  onToggleCrop?: (objectId: string) => void;
  onCropShapeChange?: (objectId: string, shape: CropShape) => void;
  onFlipHorizontal?: (objectId: string) => void;
  onFlipVertical?: (objectId: string) => void;
  onToggleAnimate?: (objectId: string) => void;
  onRequestPositionPanel?: (objectId: string) => void;
  onOpacityChange?: (objectId: string, opacity: number) => void;
  onCropChange?: (objectId: string, next: ImageCropInsets) => void;
  onCropCommit?: (objectId: string, finalCrop: ImageCropInsets) => void;
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
  cropShape = 'rectangle',
  cropBorderRadius = 12,
  flipHorizontal = false,
  flipVertical = false,
  isAnimated = false,
  opacity = 1,
  cropInsets = DEFAULT_CROP_INSETS,
  onInteract,
  onToolbarStateChange,
  onToggleFit,
  onToggleCrop,
  onCropShapeChange,
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
  const normalizedCropFromProps = useMemo(() => normalizeCropInsets(cropInsets), [cropInsets]);
  const [liveCrop, setLiveCrop] = useState<ImageCropInsets>(normalizedCropFromProps);
  const [localFitMode, setLocalFitMode] = useState<'cover' | 'contain'>(fitMode);
  const [localFlipHorizontal, setLocalFlipHorizontal] = useState<boolean>(flipHorizontal ?? false);
  const [localFlipVertical, setLocalFlipVertical] = useState<boolean>(flipVertical ?? false);
  const [localAnimated, setLocalAnimated] = useState<boolean>(isAnimated);
  const [localOpacity, setLocalOpacity] = useState<number>(clampOpacity(opacity));

  useEffect(() => {
    setLiveCrop(previous => (areCropInsetsEqual(previous, normalizedCropFromProps) ? previous : normalizedCropFromProps));
  }, [normalizedCropFromProps]);

  useEffect(() => {
    setLocalFitMode(fitMode);
  }, [fitMode]);

  useEffect(() => {
    console.log('[SlideImageObject] flipHorizontal prop changed', { id, flipHorizontal, currentLocal: localFlipHorizontal });
    if (localFlipHorizontal !== flipHorizontal) {
      setLocalFlipHorizontal(flipHorizontal);
    }
  }, [flipHorizontal, id]); // Removed localFlipHorizontal from deps to avoid infinite loops

  useEffect(() => {
    console.log('[SlideImageObject] flipVertical prop changed', { id, flipVertical, currentLocal: localFlipVertical });
    if (localFlipVertical !== flipVertical) {
      setLocalFlipVertical(flipVertical);
    }
  }, [flipVertical, id]); // Removed localFlipVertical from deps to avoid infinite loops

  useEffect(() => {
    setLocalAnimated(isAnimated);
  }, [isAnimated]);

  useEffect(() => {
    setLocalOpacity(clampOpacity(opacity));
  }, [opacity]);

  // Handle Enter key to exit crop mode
  useEffect(() => {
    if (!isCropping || !onToggleCrop) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        cropLog('Enter pressed - exiting crop mode', { id });
        onToggleCrop(id);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isCropping, id, onToggleCrop]);

  // Handle keyboard shortcuts for flip operations
  useEffect(() => {
    if (!canEdit || !isSelected || isCropping) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle shortcuts when no input/textarea is focused
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // H key for horizontal flip
      if (event.key === 'h' || event.key === 'H') {
        if (onFlipHorizontal) {
          event.preventDefault();
          event.stopPropagation();
          onFlipHorizontal(id);
        }
        return;
      }

      // V key for vertical flip
      if (event.key === 'v' || event.key === 'V') {
        if (onFlipVertical) {
          event.preventDefault();
          event.stopPropagation();
          onFlipVertical(id);
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [canEdit, isSelected, isCropping, id, onFlipHorizontal, onFlipVertical]);

  // Handle click outside to finalize crop
  useEffect(() => {
    if (!isCropping || !onToggleCrop || !containerRef.current) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      // Check if click is outside the crop container
      if (containerRef.current && !containerRef.current.contains(target)) {
        // Check if click is not on the toolbar
        const toolbar = document.querySelector('[data-image-toolbar-root]');
        if (toolbar && toolbar.contains(target)) {
          return; // Don't exit if clicking on toolbar
        }
        cropLog('Click outside - finalizing crop', { id });
        onToggleCrop(id);
      }
    };

    // Use a small delay to avoid immediate exit when entering crop mode
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCropping, id, onToggleCrop]);

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
      cropLog('Request crop change', { id, next });
      onCropChange?.(id, next);
    },
    [id, onCropChange],
  );

  const handleCropCommit = useCallback(
    (finalCrop: ImageCropInsets) => {
      cropLog('Commit crop request', { id, crop: finalCrop });
      onCropCommit?.(id, finalCrop);
    },
    [id, onCropCommit],
  );

  const { beginCropDrag, isDragging: isCropDragging } = useImageCropInteraction({
    isCropping,
    cropInsets,
    containerRef,
    onPreviewChange: setLiveCrop,
    onCropChange: handleCropChange,
    onCropCommit: handleCropCommit,
  });

  const handleToggleCrop = useCallback(() => {
    if (!onToggleCrop) {
      return;
    }
    // Don't call onInteract here to prevent deselection when entering crop mode
    // The crop toggle itself should maintain selection
    cropLog('Toggle crop request', { id });
    onToggleCrop(id);
  }, [id, onToggleCrop]);

  const handleFlipHorizontal = useCallback(() => {
    if (!onFlipHorizontal) {
      console.warn('[SlideImageObject] handleFlipHorizontal: onFlipHorizontal handler not provided', { id });
      return;
    }
    console.log('[SlideImageObject] handleFlipHorizontal called', { id, currentFlip: flipHorizontal });
    // Don't update local state optimistically - let props update drive the state
    // This prevents race conditions where re-render happens before props update
    // Note: onInteract() is already called by updateImageProps, so we don't need to call it here
    onFlipHorizontal(id);
  }, [id, onFlipHorizontal, flipHorizontal]);

  const handleFlipVertical = useCallback(() => {
    if (!onFlipVertical) {
      console.warn('[SlideImageObject] handleFlipVertical: onFlipVertical handler not provided', { id });
      return;
    }
    console.log('[SlideImageObject] handleFlipVertical called', { id, currentFlip: flipVertical });
    // Don't update local state optimistically - let props update drive the state
    // This prevents race conditions where re-render happens before props update
    // Note: onInteract() is already called by updateImageProps, so we don't need to call it here
    onFlipVertical(id);
  }, [id, onFlipVertical, flipVertical]);

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

  const handleCropShapeChange = useCallback(
    (shape: CropShape) => {
      if (!onCropShapeChange) {
        return;
      }
      onInteract();
      onCropShapeChange(id, shape);
    },
    [id, onInteract, onCropShapeChange],
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
        cropShape={cropShape}
        flipHorizontal={localFlipHorizontal}
        flipVertical={localFlipVertical}
        isAnimated={localAnimated}
        opacity={localOpacity}
        onToggleFit={onToggleFit ? handleToggleFit : undefined}
        onToggleCrop={onToggleCrop ? handleToggleCrop : undefined}
        onCropShapeChange={onCropShapeChange ? handleCropShapeChange : undefined}
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
    handleCropShapeChange,
    handleFlipHorizontal,
    handleFlipVertical,
    handleOpacityChange,
    handleRequestPosition,
    localAnimated,
    localFlipHorizontal,
    localFlipVertical,
    localFitMode,
    isCropping,
    cropShape,
    localOpacity,
    name,
    onRequestPositionPanel,
    onToggleAnimate,
    onToggleFit,
    onToggleCrop,
    onCropShapeChange,
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

    // Keep toolbar visible when cropping, even if not selected
    // This ensures the crop controls remain accessible
    const shouldShowToolbar = isSelected || isCropping;
    onToolbarStateChange(id, shouldShowToolbar ? toolbar : null);

    return () => {
      onToolbarStateChange(id, null);
    };
  }, [canEdit, id, isSelected, isCropping, onToolbarStateChange, toolbar]);

  const resolvedName = name && name.trim().length > 0 ? name : 'Slide image';
  const hasCrop = hasActiveCrop(liveCrop);

  const cropRenderMetrics = useMemo(() => resolveCropRenderMetrics(liveCrop), [liveCrop]);

  useEffect(() => {
    cropLog('Live crop state updated', { id, crop: liveCrop });
  }, [id, liveCrop]);

  const cropWrapperTransform = useMemo(() => {
    // State 1: No crop applied - show full image
    if (!hasCrop && !isCropping) {
      return 'translate3d(0, 0, 0) scale(1, 1)';
    }

    // State 2: Re-crop mode - show full original image in background
    // Don't apply transform so user can see the full image and expand crop area
    if (hasCrop && isCropping) {
      return 'translate3d(0, 0, 0) scale(1, 1)';
    }

    // State 3: Crop finalized - container will be resized, so no transform needed
    // The container dimensions will match the cropped area, so just show image normally
    return 'translate3d(0, 0, 0) scale(1, 1)';
  }, [hasCrop, isCropping]);

  const cropWrapperStyle = useMemo<React.CSSProperties>(
    () => ({
      transform: cropWrapperTransform,
      transformOrigin: 'top left',
      willChange: 'transform',
      // No transition during cropping for instant updates, smooth transition when exiting
      transition: isCropping ? 'none' : 'transform 0.2s ease-out',
      // Ensure sub-pixel rendering for smooth movement
      backfaceVisibility: 'hidden',
      perspective: 1000,
    }),
    [cropWrapperTransform, isCropping],
  );

  useEffect(() => {
    if (!hasCrop && !isCropping) {
      return;
    }

    cropLog('Render crop transform', {
      id,
      crop: liveCrop,
      metrics: cropRenderMetrics,
      transform: cropWrapperTransform,
      hasCrop,
      isCropping,
    });
  }, [cropRenderMetrics, cropWrapperTransform, hasCrop, id, isCropping, liveCrop]);

  const handleResetCrop = useCallback(() => {
    if (!onResetCrop) {
      return;
    }
    onInteract();
    cropLog('Reset crop request', { id });
    setLiveCrop(DEFAULT_CROP_INSETS);
    onResetCrop(id);
  }, [id, onInteract, onResetCrop]);

  const imageStyle = useMemo<React.CSSProperties>(
    () => {
      // Use props directly instead of local state to ensure immediate updates
      const flipH = flipHorizontal ?? false;
      const flipV = flipVertical ?? false;
      const scaleX = flipH ? -1 : 1;
      const scaleY = flipV ? -1 : 1;

      console.log('[SlideImageObject] imageStyle computed', { 
        id, 
        flipHorizontal: flipH,
        flipVertical: flipV,
        localFlipHorizontal, 
        localFlipVertical, 
        scaleX, 
        scaleY,
        transform: `scaleX(${scaleX}) scaleY(${scaleY})`
      });

      const baseStyle: React.CSSProperties = {
        '--image-flip-scale-x': `${scaleX}`,
        '--image-flip-scale-y': `${scaleY}`,
        transform: `scaleX(${scaleX}) scaleY(${scaleY})`,
        transformOrigin: 'center center',
        opacity: clampOpacity(localOpacity),
      };

      // Apply crop shape mask when not in crop mode
      if (hasCrop && !isCropping) {
        if (cropShape === 'circle') {
          baseStyle.borderRadius = '50%';
          baseStyle.clipPath = 'circle(50% at 50% 50%)';
        } else if (cropShape === 'rounded-rectangle') {
          baseStyle.borderRadius = `${Math.min(cropBorderRadius, 50)}%`;
        }
      }

      return baseStyle;
    },
    [flipHorizontal, flipVertical, localOpacity, hasCrop, isCropping, cropShape, cropBorderRadius], // Use props directly
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
          <div className="h-full w-full" data-crop-stage>
            <div className="h-full w-full" style={cropWrapperStyle} data-crop-transform>
              <img
                src={src}
                alt={resolvedName}
                className={cn(
                  'slide-image-visual h-full w-full object-cover',
                  localFitMode === 'contain' ? 'object-contain' : 'object-cover',
                  localAnimated && 'animate-slide-image',
                )}
                style={imageStyle}
                data-crop-image
              />
            </div>
          </div>
          {/* Re-crop mode: Show current crop area as overlay on full image */}
          {isCropping && hasCrop && (
            <div
              className="pointer-events-none absolute z-20 border-2 border-dashed border-yellow-400/60 bg-yellow-400/10"
              style={{
                top: `${liveCrop.top}%`,
                right: `${liveCrop.right}%`,
                bottom: `${liveCrop.bottom}%`,
                left: `${liveCrop.left}%`,
                borderRadius:
                  cropShape === 'circle'
                    ? '50%'
                    : cropShape === 'rounded-rectangle'
                      ? `${Math.min(cropBorderRadius, 50)}%`
                      : undefined,
              }}
            >
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="rounded-full bg-yellow-400/90 px-3 py-1 text-xs font-medium text-yellow-900 shadow-lg">
                  Current crop area
                </span>
              </div>
            </div>
          )}
          {isCropping && (
            <ImageCropOverlay
              cropInsets={liveCrop}
              isDragging={isCropDragging}
              onBeginDrag={handleCropPointerDown}
              onResetCrop={onResetCrop && hasCrop ? handleResetCrop : undefined}
              cropShape={cropShape}
              borderRadius={cropBorderRadius}
              isReCropMode={hasCrop}
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

