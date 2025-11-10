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

export interface ImageCropInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const clampCropValue = (value: number) => Math.min(Math.max(Number.isFinite(value) ? value : 0, 0), 95);
const roundCropValue = (value: number) => Math.round(value * 100) / 100;
const MIN_VISIBLE_PERCENT = 5;

export const DEFAULT_CROP_INSETS: ImageCropInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export const areCropInsetsEqual = (a: ImageCropInsets, b: ImageCropInsets): boolean =>
  a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;

export const normalizeCropInsets = (value: unknown): ImageCropInsets => {
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

      const deltaXPercent = ((event.clientX - startX) / containerRect.width) * 100;
      const deltaYPercent = ((event.clientY - startY) / containerRect.height) * 100;
      const next = computeNextCrop(handle, deltaXPercent, deltaYPercent, initialCrop);
      commitPreviewCrop(next);
      cropLog('Pointer move', {
        handle,
        deltaXPercent,
        deltaYPercent,
        initialCrop,
        next,
      });
      onCropChange(next);
    },
    [commitPreviewCrop, onCropChange],
  );

  const handleCropPointerUp = useCallback(() => {
    if (!dragStateRef.current) {
      cropLog('Pointer up ignored – no drag state');
      return;
    }
    window.removeEventListener('pointermove', handleCropPointerMove);
    window.removeEventListener('pointerup', handleCropPointerUp);
    dragStateRef.current = null;
    setIsDragging(false);
    cropLog('Pointer up – committing crop');
    onCropCommit?.(previewCropRef.current);
  }, [handleCropPointerMove, onCropCommit]);

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
}) => {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-30">
        <div className="absolute left-0 right-0 top-0 bg-black/40" style={{ height: `${cropInsets.top}%` }} />
        <div
          className="absolute left-0 right-0 bg-black/40"
          style={{
            top: `${100 - cropInsets.bottom}%`,
            height: `${cropInsets.bottom}%`,
          }}
        />
        <div
          className="absolute left-0 bg-black/40"
          style={{
            top: `${cropInsets.top}%`,
            bottom: `${cropInsets.bottom}%`,
            width: `${cropInsets.left}%`,
          }}
        />
        <div
          className="absolute right-0 bg-black/40"
          style={{
            top: `${cropInsets.top}%`,
            bottom: `${cropInsets.bottom}%`,
            width: `${cropInsets.right}%`,
          }}
        />
      </div>
      <div
        className={cn(
          'absolute z-40 border-2 border-primary/80 bg-transparent',
          isDragging ? 'shadow-[0_0_0_999px_rgba(59,130,246,0.12)]' : 'shadow-[0_0_0_999px_rgba(15,23,42,0.25)]',
        )}
        style={{
          top: `${cropInsets.top}%`,
          right: `${cropInsets.right}%`,
          bottom: `${cropInsets.bottom}%`,
          left: `${cropInsets.left}%`,
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
        onPointerDown={event => onBeginDrag('move', event)}
      >
        <div className="pointer-events-none absolute inset-0 border border-white/40" />
        <div className="absolute left-2 top-2 flex items-center gap-2 rounded-full bg-primary/90 px-3 py-1 text-xs font-medium text-white shadow">
          Crop mode
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
        </div>
        {cornerHandles.map(def => (
          <span
            key={def.handle}
            className={cn('absolute z-50 h-3 w-3 rounded-full border border-background bg-white', def.className)}
            onPointerDown={event => onBeginDrag(def.handle, event)}
          />
        ))}
        {edgeHandles.map(def => (
          <span
            key={def.handle}
            className={cn('absolute z-50 h-3 w-3 rounded-full border border-background bg-white', def.className)}
            onPointerDown={event => onBeginDrag(def.handle, event)}
          />
        ))}
      </div>
    </>
  );
};
