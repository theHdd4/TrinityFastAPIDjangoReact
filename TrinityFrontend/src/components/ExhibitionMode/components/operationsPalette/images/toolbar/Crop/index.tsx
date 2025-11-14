import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

const isDevEnvironment = process.env.NODE_ENV === 'development';
export const cropLog = (...args: unknown[]) => {
  if (!isDevEnvironment) {
    return;
  }
  // eslint-disable-next-line no-console
  console.debug('[ImageCrop]', ...args);
};

export type CropHandle = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';

export type CropShape = 'rectangle' | 'circle' | 'rounded-rectangle';

export interface ImageCropInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface ImageCropConfig {
  insets: ImageCropInsets;
  shape?: CropShape;
  borderRadius?: number; // For rounded-rectangle (0-50, percentage)
}

const clampCropValue = (value: number) => Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), 95);
// No rounding during live updates - keep full precision for continuous movement
const roundCropValue = (value: number) => value; // No rounding - keep full precision
// Only round to 2 decimal places for final storage
const roundCropValueFinal = (value: number) => Math.round(value * 100) / 100;
const MIN_VISIBLE_PERCENT = 5;

export const DEFAULT_CROP_INSETS: ImageCropInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export const areCropInsetsEqual = (a: ImageCropInsets, b: ImageCropInsets): boolean =>
  a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;

export const normalizeCropInsets = (value: unknown, finalize: boolean = false): ImageCropInsets => {
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

  // Use higher precision during live updates, round only when finalizing
  const roundFn = finalize ? roundCropValueFinal : roundCropValue;

  return {
    top: roundFn(resolvedTop),
    right: roundFn(resolvedRight),
    bottom: roundFn(resolvedBottom),
    left: roundFn(resolvedLeft),
  } satisfies ImageCropInsets;
};

export const sanitizeImageCrop = (value: unknown): ImageCropInsets => normalizeCropInsets(value);

export const hasCrop = (insets: ImageCropInsets): boolean =>
  insets.top > 0 || insets.right > 0 || insets.bottom > 0 || insets.left > 0;

export interface CropRenderMetrics {
  widthPercent: number;
  heightPercent: number;
  translateXPercent: number;
  translateYPercent: number;
  scaleX: number;
  scaleY: number;
}

export const resolveCropRenderMetrics = (insets: ImageCropInsets): CropRenderMetrics => {
  const normalized = normalizeCropInsets(insets);
  const widthPercent = Math.max(MIN_VISIBLE_PERCENT, 100 - normalized.left - normalized.right);
  const heightPercent = Math.max(MIN_VISIBLE_PERCENT, 100 - normalized.top - normalized.bottom);

  const translateXPercent = (normalized.left / widthPercent) * 100;
  const translateYPercent = (normalized.top / heightPercent) * 100;

  const scaleX = 100 / widthPercent;
  const scaleY = 100 / heightPercent;

  return {
    widthPercent,
    heightPercent,
    translateXPercent,
    translateYPercent,
    scaleX,
    scaleY,
  } satisfies CropRenderMetrics;
};

interface DragState {
  handle: CropHandle;
  startX: number;
  startY: number;
  containerRect: DOMRect;
  initialCrop: ImageCropInsets;
}

const computeNextCrop = (
  handle: CropHandle,
  deltaXPercent: number,
  deltaYPercent: number,
  initial: ImageCropInsets,
  finalize: boolean = false,
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
    return normalizeCropInsets({ top: nextTop, right: nextRight, bottom: nextBottom, left: nextLeft }, finalize);
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

  return normalizeCropInsets({ top: nextTop, right: nextRight, bottom: nextBottom, left: nextLeft }, finalize);
};

export interface UseImageCropInteractionOptions {
  isCropping: boolean;
  cropInsets?: ImageCropInsets | null;
  containerRef: React.RefObject<HTMLElement | null>;
  onPreviewChange?: (next: ImageCropInsets) => void;
  onCropChange?: (next: ImageCropInsets) => void;
  onCropCommit?: (final: ImageCropInsets) => void;
}

export interface UseImageCropInteractionResult {
  isDragging: boolean;
  normalizedCrop: ImageCropInsets;
  beginCropDrag: (handle: CropHandle, event: React.PointerEvent<HTMLElement>) => boolean;
}

export const useImageCropInteraction = ({
  isCropping,
  cropInsets,
  containerRef,
  onPreviewChange,
  onCropChange,
  onCropCommit,
}: UseImageCropInteractionOptions): UseImageCropInteractionResult => {
  const dragStateRef = useRef<DragState | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const normalizedCropFromProps = useMemo(() => normalizeCropInsets(cropInsets), [cropInsets]);
  const [previewCrop, setPreviewCrop] = useState<ImageCropInsets>(normalizedCropFromProps);
  const previewCropRef = useRef<ImageCropInsets>(normalizedCropFromProps);

  useEffect(() => {
    previewCropRef.current = previewCrop;
  }, [previewCrop]);

  const commitPreviewCrop = useCallback(
    (next: ImageCropInsets) => {
      previewCropRef.current = next;
      setPreviewCrop(next);
      onPreviewChange?.(next);
    },
    [onPreviewChange],
  );

  const syncPreviewCrop = useCallback(
    (next: ImageCropInsets) => {
      if (areCropInsetsEqual(previewCropRef.current, next)) {
        return;
      }
      commitPreviewCrop(next);
    },
    [commitPreviewCrop],
  );

  useEffect(() => {
    cropLog('Crop mode state changed', { isCropping });
    if (!isCropping) {
      syncPreviewCrop(normalizedCropFromProps);
    }
  }, [isCropping, normalizedCropFromProps, syncPreviewCrop]);

  useEffect(() => {
    cropLog('Received crop props update', normalizedCropFromProps);
    syncPreviewCrop(normalizedCropFromProps);
  }, [normalizedCropFromProps, syncPreviewCrop]);

  const handleCropPointerMove = useCallback(
    (event: PointerEvent) => {
      const state = dragStateRef.current;
      if (!state || !onCropChange) {
        if (!state) {
          cropLog('Pointer move ignored – no drag state');
        }
        if (!onCropChange) {
          cropLog('Pointer move ignored – missing onCropChange handler');
        }
        return;
      }

      const { handle, startX, startY, containerRect, initialCrop } = state;
      if (containerRect.width <= 0 || containerRect.height <= 0) {
        cropLog('Pointer move ignored – invalid container rect', containerRect);
        return;
      }

      // Calculate delta with full precision for smooth continuous movement
      // No rounding or batching - update immediately for smoothness
      const deltaXPercent = ((event.clientX - startX) / containerRect.width) * 100;
      const deltaYPercent = ((event.clientY - startY) / containerRect.height) * 100;
      
      // Compute next crop with full precision (no rounding during live updates)
      const next = computeNextCrop(handle, deltaXPercent, deltaYPercent, initialCrop, false);
      
      // Update immediately without batching for continuous movement
      commitPreviewCrop(next);
      onCropChange(next);
    },
    [commitPreviewCrop, onCropChange],
  );

  const handleCropPointerUp = useCallback(() => {
    if (!dragStateRef.current) {
      cropLog('Pointer up ignored – no drag state');
      return;
    }
    
    // Finalize the current preview crop with proper rounding for storage
    const finalized = normalizeCropInsets(previewCropRef.current, true);
    commitPreviewCrop(finalized);
    onCropChange?.(finalized);
    
    window.removeEventListener('pointermove', handleCropPointerMove);
    window.removeEventListener('pointerup', handleCropPointerUp);
    dragStateRef.current = null;
    setIsDragging(false);
    cropLog('Pointer up – committing crop');
    
    // Commit with finalized (rounded) values
    onCropCommit?.(finalized);
  }, [handleCropPointerMove, onCropCommit, commitPreviewCrop, onCropChange]);

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handleCropPointerMove);
      window.removeEventListener('pointerup', handleCropPointerUp);
    };
  }, [handleCropPointerMove, handleCropPointerUp]);

  useEffect(() => {
    if (!isCropping) {
      window.removeEventListener('pointermove', handleCropPointerMove);
      window.removeEventListener('pointerup', handleCropPointerUp);
      dragStateRef.current = null;
      setIsDragging(false);
    }
  }, [handleCropPointerMove, handleCropPointerUp, isCropping]);

  const beginCropDrag = useCallback(
    (handle: CropHandle, event: React.PointerEvent<HTMLElement>) => {
      if (!isCropping || !onCropChange) {
        cropLog('Begin drag ignored – crop disabled or missing handler', {
          isCropping,
          hasOnCropChange: Boolean(onCropChange),
        });
        return false;
      }

      const container = containerRef.current;
      if (!container) {
        cropLog('Begin drag ignored – missing container ref');
        return false;
      }

      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        cropLog('Begin drag ignored – invalid container rect', rect);
        return false;
      }

      event.preventDefault();
      event.stopPropagation();

      dragStateRef.current = {
        handle,
        startX: event.clientX,
        startY: event.clientY,
        containerRect: rect,
        initialCrop: previewCropRef.current,
      };
      setIsDragging(true);
      cropLog('Begin drag', {
        handle,
        containerRect: rect,
        initialCrop: normalizedCropFromProps,
      });
      window.addEventListener('pointermove', handleCropPointerMove);
      window.addEventListener('pointerup', handleCropPointerUp);
      return true;
    },
    [
      containerRef,
      handleCropPointerMove,
      handleCropPointerUp,
      isCropping,
      normalizedCropFromProps,
      onCropChange,
    ],
  );

  return useMemo(
    () => ({
      isDragging,
      normalizedCrop: previewCrop,
      beginCropDrag,
    }),
    [beginCropDrag, isDragging, previewCrop],
  );
};

interface ImageCropOverlayProps {
  cropInsets: ImageCropInsets;
  isDragging: boolean;
  onBeginDrag: (handle: CropHandle, event: React.PointerEvent<HTMLElement>) => void;
  onResetCrop?: (() => void) | null;
  showReset?: boolean;
  cropShape?: CropShape;
  borderRadius?: number;
  isReCropMode?: boolean; // True when re-cropping an already-cropped image
}

const cornerHandles: ReadonlyArray<{ handle: CropHandle; className: string }> = [
  { handle: 'nw', className: 'top-0 left-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize' },
  { handle: 'ne', className: 'top-0 right-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize' },
  { handle: 'sw', className: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize' },
  { handle: 'se', className: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize' },
];

const edgeHandles: ReadonlyArray<{ handle: CropHandle; className: string }> = [
  { handle: 'n', className: 'top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-n-resize' },
  { handle: 's', className: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 cursor-s-resize' },
  { handle: 'e', className: 'top-1/2 right-0 translate-x-1/2 -translate-y-1/2 cursor-e-resize' },
  { handle: 'w', className: 'top-1/2 left-0 -translate-x-1/2 -translate-y-1/2 cursor-w-resize' },
];

export const ImageCropOverlay: React.FC<ImageCropOverlayProps> = ({
  cropInsets,
  isDragging,
  onBeginDrag,
  onResetCrop,
  showReset = true,
  cropShape = 'rectangle',
  borderRadius = 12,
  isReCropMode = false,
}) => {
  const cropStyle: React.CSSProperties = {
    top: `${cropInsets.top}%`,
    right: `${cropInsets.right}%`,
    bottom: `${cropInsets.bottom}%`,
    left: `${cropInsets.left}%`,
    cursor: isDragging ? 'grabbing' : 'grab',
  };

  // Calculate dimensions for shape-based overlay
  const cropWidth = 100 - cropInsets.left - cropInsets.right;
  const cropHeight = 100 - cropInsets.top - cropInsets.bottom;
  const cropAspectRatio = cropWidth / cropHeight;

  // For circle, use the smaller dimension to maintain aspect ratio
  const circleSize = cropShape === 'circle' ? Math.min(cropWidth, cropHeight) : null;
  const circleStyle: React.CSSProperties | undefined =
    cropShape === 'circle' && circleSize
      ? {
          width: `${circleSize}%`,
          height: `${circleSize}%`,
          left: `${cropInsets.left + (cropWidth - circleSize) / 2}%`,
          top: `${cropInsets.top + (cropHeight - circleSize) / 2}%`,
          borderRadius: '50%',
        }
      : undefined;

  const roundedRectBorderRadius =
    cropShape === 'rounded-rectangle' ? `${Math.min(borderRadius, 50)}%` : undefined;

  // Create SVG mask path for non-rectangular shapes
  const getMaskPath = () => {
    if (cropShape === 'circle' && circleSize) {
      const centerX = cropInsets.left + cropWidth / 2;
      const centerY = cropInsets.top + cropHeight / 2;
      const radius = circleSize / 2;
      // Create a mask that shows only the circle area
      return `M 0 0 L 100 0 L 100 100 L 0 100 Z M ${centerX} ${centerY} m -${radius} 0 a ${radius} ${radius} 0 1 1 ${circleSize} 0 a ${radius} ${radius} 0 1 1 -${circleSize} 0 Z`;
    }
    return null;
  };

  const maskPath = getMaskPath();

  return (
    <>
      {/* Overlay with shape-based masking */}
      {/* In re-crop mode, use lighter overlay to show full image in background */}
      <div 
        className="pointer-events-none absolute inset-0 z-30 transition-opacity duration-100" 
        style={{ willChange: 'opacity' }}
      >
        {maskPath ? (
          <svg className="absolute inset-0 h-full w-full" style={{ pointerEvents: 'none' }}>
            <defs>
              <mask id={`crop-mask-${cropShape}`}>
                <rect width="100%" height="100%" fill="black" />
                <path d={maskPath} fill="white" fillRule="evenodd" />
              </mask>
            </defs>
            <rect 
              width="100%" 
              height="100%" 
              fill={isReCropMode ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.4)'} 
              mask={`url(#crop-mask-${cropShape})`} 
            />
          </svg>
        ) : (
          <>
            <div 
              className="absolute left-0 right-0 top-0 bg-black/40" 
              style={{ 
                height: `${cropInsets.top}%`,
                opacity: isReCropMode ? 0.6 : 1,
              }} 
            />
            <div
              className="absolute left-0 right-0 bg-black/40"
              style={{
                top: `${100 - cropInsets.bottom}%`,
                height: `${cropInsets.bottom}%`,
                opacity: isReCropMode ? 0.6 : 1,
              }}
            />
            <div
              className="absolute left-0 bg-black/40"
              style={{
                top: `${cropInsets.top}%`,
                bottom: `${cropInsets.bottom}%`,
                width: `${cropInsets.left}%`,
                opacity: isReCropMode ? 0.6 : 1,
              }}
            />
            <div
              className="absolute right-0 bg-black/40"
              style={{
                top: `${cropInsets.top}%`,
                bottom: `${cropInsets.bottom}%`,
                width: `${cropInsets.right}%`,
                opacity: isReCropMode ? 0.6 : 1,
              }}
            />
          </>
        )}
      </div>
      {/* Crop boundary with shape styling */}
      <div
        className={cn(
          'absolute z-40 border-2 border-primary/80 bg-transparent transition-all duration-75 ease-out',
          isDragging 
            ? 'shadow-[0_0_0_999px_rgba(59,130,246,0.15)] border-primary' 
            : 'shadow-[0_0_0_999px_rgba(15,23,42,0.3)]',
          cropShape === 'circle' && 'rounded-full',
          cropShape === 'rounded-rectangle' && 'rounded-2xl',
        )}
        style={{
          ...(cropShape === 'circle' && circleStyle ? circleStyle : cropStyle),
          borderRadius:
            cropShape === 'circle'
              ? '50%'
              : cropShape === 'rounded-rectangle'
                ? roundedRectBorderRadius
                : undefined,
          willChange: 'top, right, bottom, left, width, height',
          // Disable transitions during dragging for instant updates
          transition: isDragging ? 'none' : 'all 75ms ease-out',
        }}
        onPointerDown={event => onBeginDrag('move', event)}
      >
        <div
          className={cn(
            'pointer-events-none absolute inset-0 border border-white/40',
            cropShape === 'circle' && 'rounded-full',
            cropShape === 'rounded-rectangle' && 'rounded-2xl',
          )}
          style={{
            borderRadius:
              cropShape === 'circle'
                ? '50%'
                : cropShape === 'rounded-rectangle'
                  ? roundedRectBorderRadius
                  : undefined,
          }}
        />
        {/* Grid lines for better visual guidance */}
        {cropShape !== 'circle' && (
          <>
            <div className="pointer-events-none absolute inset-0 border-t border-white/20" style={{ top: '33.33%' }} />
            <div className="pointer-events-none absolute inset-0 border-t border-white/20" style={{ top: '66.66%' }} />
            <div className="pointer-events-none absolute inset-0 border-l border-white/20" style={{ left: '33.33%' }} />
            <div className="pointer-events-none absolute inset-0 border-l border-white/20" style={{ left: '66.66%' }} />
          </>
        )}
        <div className="absolute left-2 top-2 flex items-center gap-2 rounded-full bg-primary/90 px-3 py-1 text-xs font-medium text-white shadow">
          <span className="capitalize">
            {isReCropMode ? 'Re-crop' : 'Crop'} {cropShape.replace('-', ' ')}
          </span>
          {showReset && onResetCrop && (
            <button
              type="button"
              className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white/80 hover:bg-white/20"
              onPointerDown={event => event.stopPropagation()}
              onClick={event => {
                event.preventDefault();
                event.stopPropagation();
                onResetCrop();
              }}
            >
              Reset
            </button>
          )}
          <span className="text-[10px] text-white/60 ml-1">ESC to exit</span>
        </div>
        {/* Only show handles for rectangle and rounded-rectangle */}
        {cropShape !== 'circle' && (
          <>
            {cornerHandles.map(def => (
              <span
                key={def.handle}
                className={cn(
                  'absolute z-50 h-4 w-4 rounded-full border-2 border-primary/90 bg-white shadow-lg transition-all duration-100',
                  'hover:scale-125 hover:border-primary hover:shadow-xl',
                  isDragging && 'scale-110 border-primary shadow-xl',
                  def.className,
                )}
                style={{ willChange: 'transform' }}
                onPointerDown={event => onBeginDrag(def.handle, event)}
              />
            ))}
            {edgeHandles.map(def => (
              <span
                key={def.handle}
                className={cn(
                  'absolute z-50 h-4 w-4 rounded-full border-2 border-primary/90 bg-white shadow-lg transition-all duration-100',
                  'hover:scale-125 hover:border-primary hover:shadow-xl',
                  isDragging && 'scale-110 border-primary shadow-xl',
                  def.className,
                )}
                style={{ willChange: 'transform' }}
                onPointerDown={event => onBeginDrag(def.handle, event)}
              />
            ))}
          </>
        )}
        {/* Circle handles - 8 points around the circle */}
        {cropShape === 'circle' && circleSize && (
          <>
            {[
              { angle: 0, handle: 'e' },
              { angle: 45, handle: 'ne' },
              { angle: 90, handle: 'n' },
              { angle: 135, handle: 'nw' },
              { angle: 180, handle: 'w' },
              { angle: 225, handle: 'sw' },
              { angle: 270, handle: 's' },
              { angle: 315, handle: 'se' },
            ].map(({ angle, handle }) => {
              const rad = (angle * Math.PI) / 180;
              const radius = 50; // 50% of the circle container
              const x = 50 + (radius * Math.cos(rad));
              const y = 50 + (radius * Math.sin(rad));
              return (
                <span
                  key={handle}
                  className={cn(
                    'absolute z-50 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary/90 bg-white shadow-lg transition-all duration-100',
                    'hover:scale-125 hover:border-primary hover:shadow-xl',
                    isDragging && 'scale-110 border-primary shadow-xl',
                  )}
                  style={{
                    left: `${x}%`,
                    top: `${y}%`,
                    willChange: 'transform',
                  }}
                  onPointerDown={event => onBeginDrag(handle as CropHandle, event)}
                />
              );
            })}
          </>
        )}
      </div>
    </>
  );
};
