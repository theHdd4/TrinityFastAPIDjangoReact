import React, { useCallback, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { ShapeRenderer } from './ShapeRenderer';
import ShapeToolbar from './ShapeToolbar';
import {
  findShapeDefinition,
  parseShapeObjectProps,
  type ShapeDefinition,
  type ShapeObjectProps,
  type ShapeStrokeStyle,
} from './constants';

interface SlideShapeObjectProps {
  id: string;
  canEdit: boolean;
  isSelected: boolean;
  props: Record<string, unknown> | undefined;
  onUpdateProps: (updates: Partial<ShapeObjectProps>) => void;
  onToolbarStateChange: (objectId: string, toolbar: React.ReactNode | null) => void;
  onDelete?: () => void;
  onRequestPositionPanel?: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onInteract: () => void;
}

const isFillSupported = (definition: ShapeDefinition | null) => {
  if (!definition) {
    return false;
  }
  const kind = definition.geometry.kind;
  return kind !== 'line' && kind !== 'polyline';
};

export const SlideShapeObject: React.FC<SlideShapeObjectProps> = ({
  id,
  canEdit,
  isSelected,
  props,
  onUpdateProps,
  onToolbarStateChange,
  onDelete,
  onRequestPositionPanel,
  onBringToFront,
  onSendToBack,
  onInteract,
}) => {
  const shapeId = typeof props?.shapeId === 'string' ? props.shapeId : null;
  const definition = useMemo(() => findShapeDefinition(shapeId), [shapeId]);

  const parsed = useMemo(() => parseShapeObjectProps(props, definition ?? undefined), [definition, props]);
  const supportsFill = isFillSupported(definition);

  const handleFillChange = useCallback(
    (color: string) => {
      if (!supportsFill) {
        return;
      }
      onInteract();
      onUpdateProps({ fill: color });
    },
    [onInteract, onUpdateProps, supportsFill],
  );

  const handleStrokeChange = useCallback(
    (color: string) => {
      onInteract();
      onUpdateProps({ stroke: color });
    },
    [onInteract, onUpdateProps],
  );

  const handleStrokeWidthChange = useCallback(
    (width: number) => {
      onInteract();
      onUpdateProps({ strokeWidth: width });
    },
    [onInteract, onUpdateProps],
  );

  const handleStrokeStyleChange = useCallback(
    (style: ShapeStrokeStyle) => {
      onInteract();
      onUpdateProps({ strokeStyle: style });
    },
    [onInteract, onUpdateProps],
  );

  const handleOpacityChange = useCallback(
    (opacity: number) => {
      onInteract();
      onUpdateProps({ opacity });
    },
    [onInteract, onUpdateProps],
  );

  const handleBringToFront = useCallback(() => {
    onInteract();
    onBringToFront();
  }, [onBringToFront, onInteract]);

  const handleSendToBack = useCallback(() => {
    onInteract();
    onSendToBack();
  }, [onInteract, onSendToBack]);

  const toolbar = useMemo(() => {
    if (!canEdit || !definition) {
      return null;
    }

    return (
      <ShapeToolbar
        label={definition.label}
        fill={parsed.fill}
        stroke={parsed.stroke}
        strokeWidth={parsed.strokeWidth}
        strokeStyle={parsed.strokeStyle}
        opacity={parsed.opacity}
        supportsFill={supportsFill}
        onFillChange={supportsFill ? handleFillChange : undefined}
        onStrokeChange={handleStrokeChange}
        onStrokeWidthChange={handleStrokeWidthChange}
        onStrokeStyleChange={handleStrokeStyleChange}
        onOpacityChange={handleOpacityChange}
        onBringToFront={handleBringToFront}
        onSendToBack={handleSendToBack}
        onRequestAnimate={() => {}}
        onRequestPosition={onRequestPositionPanel}
        onDelete={onDelete}
      />
    );
  }, [
    canEdit,
    definition,
    handleBringToFront,
    handleFillChange,
    handleOpacityChange,
    handleSendToBack,
    handleStrokeChange,
    handleStrokeStyleChange,
    handleStrokeWidthChange,
    onDelete,
    onRequestPositionPanel,
    parsed.fill,
    parsed.opacity,
    parsed.stroke,
    parsed.strokeStyle,
    parsed.strokeWidth,
    supportsFill,
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

  if (!definition) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 text-xs text-muted-foreground">
        Unknown shape
      </div>
    );
  }

  const selectionOverlay =
    isSelected && definition ? (
      <div
        className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center text-yellow-400"
        aria-hidden="true"
      >
        <ShapeRenderer
          definition={definition}
          fill="transparent"
          stroke="currentColor"
          strokeWidth={2}
          strokeStyle="dotted"
          opacity={1}
          className="h-full w-full"
        />
      </div>
    ) : null;

  return (
    <div
      className={cn(
        'relative h-full w-full rounded-2xl border border-transparent bg-transparent transition-colors',
        canEdit && 'hover:border-border/70',
      )}
    >
      {selectionOverlay}
      <ShapeRenderer
        definition={definition}
        fill={parsed.fill}
        stroke={parsed.stroke}
        strokeWidth={parsed.strokeWidth}
        strokeStyle={parsed.strokeStyle}
        opacity={parsed.opacity}
        className="h-full w-full"
      />
    </div>
  );
};

export default SlideShapeObject;
