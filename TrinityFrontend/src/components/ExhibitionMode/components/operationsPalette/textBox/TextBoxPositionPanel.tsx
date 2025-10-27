import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  ArrowBigDown,
  ArrowBigUp,
  BringToFront,
  SendToBack,
  Lock,
  Unlock,
  X,
} from 'lucide-react';
import type { SlideObject } from '../../../store/exhibitionStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type AlignControl = 'top' | 'middle' | 'bottom' | 'left' | 'center' | 'right';

type GeometryUpdates = Partial<Pick<SlideObject, 'width' | 'height' | 'x' | 'y' | 'rotation'>>;

interface TextBoxPositionPanelProps {
  object: SlideObject;
  onClose: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onAlign: (alignment: AlignControl) => void;
  onGeometryChange: (updates: GeometryUpdates) => void;
}

const formatNumber = (value: number) => {
  if (!Number.isFinite(value)) {
    return '0';
  }

  if (Math.abs(value) >= 100) {
    return Math.round(value).toString();
  }

  return Number(value.toFixed(1)).toString();
};

const withUnit = (label: string) => (
  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">{label}</span>
);

export const TextBoxPositionPanel: React.FC<TextBoxPositionPanelProps> = ({
  object,
  onClose,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
  onAlign,
  onGeometryChange,
}) => {
  const rotationValue = typeof object.rotation === 'number' ? object.rotation : 0;
  const [widthValue, setWidthValue] = useState(formatNumber(object.width));
  const [heightValue, setHeightValue] = useState(formatNumber(object.height));
  const [xValue, setXValue] = useState(formatNumber(object.x));
  const [yValue, setYValue] = useState(formatNumber(object.y));
  const [rotationInput, setRotationInput] = useState(formatNumber(rotationValue));
  const [aspectLocked, setAspectLocked] = useState(false);
  const aspectRatioRef = useRef(object.width / Math.max(object.height, 1));

  useEffect(() => {
    setWidthValue(formatNumber(object.width));
    setHeightValue(formatNumber(object.height));
    setXValue(formatNumber(object.x));
    setYValue(formatNumber(object.y));
    setRotationInput(formatNumber(rotationValue));

    const nextRatio = object.width / Math.max(object.height, 1);
    if (!aspectLocked) {
      aspectRatioRef.current = nextRatio;
    }
  }, [aspectLocked, object.height, object.width, object.x, object.y, rotationValue]);

  const commitGeometry = useCallback(
    (updates: GeometryUpdates) => {
      if (Object.keys(updates).length === 0) {
        return;
      }
      onGeometryChange(updates);
    },
    [onGeometryChange],
  );

  const handleWidthCommit = useCallback(() => {
    const parsed = Number(widthValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setWidthValue(formatNumber(object.width));
      return;
    }

    if (aspectLocked) {
      const ratio = aspectRatioRef.current || 1;
      const nextHeight = parsed / ratio;
      commitGeometry({ width: parsed, height: nextHeight });
      return;
    }

    commitGeometry({ width: parsed });
  }, [aspectLocked, commitGeometry, object.width, widthValue]);

  const handleHeightCommit = useCallback(() => {
    const parsed = Number(heightValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setHeightValue(formatNumber(object.height));
      return;
    }

    if (aspectLocked) {
      const ratio = aspectRatioRef.current || 1;
      const nextWidth = parsed * ratio;
      commitGeometry({ height: parsed, width: nextWidth });
      return;
    }

    commitGeometry({ height: parsed });
  }, [aspectLocked, commitGeometry, heightValue, object.height]);

  const handleXCommit = useCallback(() => {
    const parsed = Number(xValue);
    if (!Number.isFinite(parsed)) {
      setXValue(formatNumber(object.x));
      return;
    }

    commitGeometry({ x: parsed });
  }, [commitGeometry, object.x, xValue]);

  const handleYCommit = useCallback(() => {
    const parsed = Number(yValue);
    if (!Number.isFinite(parsed)) {
      setYValue(formatNumber(object.y));
      return;
    }

    commitGeometry({ y: parsed });
  }, [commitGeometry, object.y, yValue]);

  const handleRotationCommit = useCallback(() => {
    const parsed = Number(rotationInput);
    if (!Number.isFinite(parsed)) {
      setRotationInput(formatNumber(rotationValue));
      return;
    }

    const normalised = ((parsed % 360) + 360) % 360;
    commitGeometry({ rotation: normalised });
  }, [commitGeometry, rotationInput, rotationValue]);

  const arrangeButtons = useMemo(
    () => [
      {
        label: 'Forward',
        icon: ArrowBigUp,
        onClick: onBringForward,
      },
      {
        label: 'Backward',
        icon: ArrowBigDown,
        onClick: onSendBackward,
      },
      {
        label: 'To front',
        icon: BringToFront,
        onClick: onBringToFront,
      },
      {
        label: 'To back',
        icon: SendToBack,
        onClick: onSendToBack,
      },
    ],
    [onBringForward, onSendBackward, onBringToFront, onSendToBack],
  );

  const alignButtons = useMemo(
    () => [
      { label: 'Top', value: 'top' as AlignControl, icon: AlignVerticalJustifyStart },
      { label: 'Middle', value: 'middle' as AlignControl, icon: AlignVerticalJustifyCenter },
      { label: 'Bottom', value: 'bottom' as AlignControl, icon: AlignVerticalJustifyEnd },
      { label: 'Left', value: 'left' as AlignControl, icon: AlignHorizontalJustifyStart },
      { label: 'Center', value: 'center' as AlignControl, icon: AlignHorizontalJustifyCenter },
      { label: 'Right', value: 'right' as AlignControl, icon: AlignHorizontalJustifyEnd },
    ],
    [],
  );

  const toggleAspectLock = useCallback(() => {
    setAspectLocked(prev => {
      const next = !prev;
      if (next) {
        aspectRatioRef.current = object.width / Math.max(object.height, 1);
      }
      return next;
    });
  }, [object.height, object.width]);

  return (
    <div className="w-80 shrink-0 rounded-3xl border border-border/70 bg-background/95 shadow-2xl">
      <div className="flex items-center justify-between border-b border-border/60 px-5 py-4">
        <h3 className="text-lg font-semibold text-foreground">Position</h3>
        <Button
          variant="ghost"
          size="icon"
          type="button"
          className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-6 px-5 py-5">
        <div className="flex items-center gap-2 rounded-full bg-muted/40 p-1 text-xs font-semibold text-muted-foreground">
          <button
            type="button"
            className="flex-1 rounded-full bg-background px-4 py-1 text-foreground shadow-sm"
          >
            Arrange
          </button>
          <button
            type="button"
            className="flex-1 cursor-not-allowed rounded-full px-4 py-1 opacity-60"
            aria-disabled
          >
            Layers
          </button>
        </div>

        <section className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Arrange</h4>
          <div className="grid grid-cols-2 gap-3">
            {arrangeButtons.map(option => (
              <Button
                key={option.label}
                type="button"
                variant="outline"
                className="h-auto justify-start gap-2 rounded-2xl border-border/70 bg-background/80 py-3 text-sm font-medium text-foreground hover:bg-muted/40"
                onClick={option.onClick}
              >
                <option.icon className="h-4 w-4" />
                {option.label}
              </Button>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h4 className="text-sm font-semibold text-foreground">Align to page</h4>
          <div className="grid grid-cols-3 gap-3">
            {alignButtons.map(option => (
              <Button
                key={option.value}
                type="button"
                variant="outline"
                className="h-auto justify-start gap-2 rounded-2xl border-border/70 bg-background/80 py-3 text-sm font-medium text-foreground hover:bg-muted/40"
                onClick={() => onAlign(option.value)}
              >
                <option.icon className="h-4 w-4" />
                {option.label}
              </Button>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h4 className="text-sm font-semibold text-foreground">Advanced</h4>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Width</span>
              <div className="relative">
                <Input
                  value={widthValue}
                  onChange={event => setWidthValue(event.target.value)}
                  onBlur={handleWidthCommit}
                  className="h-10 rounded-xl border-border/70 bg-background/80 pr-10 text-sm"
                />
                {withUnit('px')}
              </div>
            </div>
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Height</span>
              <div className="relative">
                <Input
                  value={heightValue}
                  onChange={event => setHeightValue(event.target.value)}
                  onBlur={handleHeightCommit}
                  className="h-10 rounded-xl border-border/70 bg-background/80 pr-10 text-sm"
                />
                {withUnit('px')}
              </div>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className={cn(
              'flex h-10 items-center justify-center gap-2 rounded-xl border-border/70 bg-background/80 text-sm font-medium text-foreground hover:bg-muted/40',
              aspectLocked && 'bg-primary/10 text-primary border-primary/40',
            )}
            onClick={toggleAspectLock}
          >
            {aspectLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
            Ratio
          </Button>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground">X</span>
              <div className="relative">
                <Input
                  value={xValue}
                  onChange={event => setXValue(event.target.value)}
                  onBlur={handleXCommit}
                  className="h-10 rounded-xl border-border/70 bg-background/80 pr-10 text-sm"
                />
                {withUnit('px')}
              </div>
            </div>
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase text-muted-foreground">Y</span>
              <div className="relative">
                <Input
                  value={yValue}
                  onChange={event => setYValue(event.target.value)}
                  onBlur={handleYCommit}
                  className="h-10 rounded-xl border-border/70 bg-background/80 pr-10 text-sm"
                />
                {withUnit('px')}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase text-muted-foreground">Rotate</span>
            <div className="relative">
              <Input
                value={rotationInput}
                onChange={event => setRotationInput(event.target.value)}
                onBlur={handleRotationCommit}
                className="h-10 rounded-xl border-border/70 bg-background/80 pr-10 text-sm"
              />
              {withUnit('°')}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default TextBoxPositionPanel;
