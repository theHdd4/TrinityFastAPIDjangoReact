import React from 'react';
import { ShapeRenderer } from './ShapeRenderer';
import { findShapeDefinition, parseShapeObjectProps } from './constants';

interface SlideShapeObjectProps {
  props: Record<string, unknown> | undefined;
}

export const SlideShapeObject: React.FC<SlideShapeObjectProps> = ({ props }) => {
  const shapeId = typeof props?.shapeId === 'string' ? props.shapeId : null;
  const definition = findShapeDefinition(shapeId);

  if (!definition) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded-xl bg-muted/20 text-xs text-muted-foreground">
        Unknown shape
      </div>
    );
  }

  const parsed = parseShapeObjectProps(props, definition);

  return (
    <ShapeRenderer
      definition={definition}
      fill={parsed.fill}
      stroke={parsed.stroke}
      strokeWidth={parsed.strokeWidth}
      opacity={parsed.opacity}
      className="h-full w-full"
    />
  );
};

export default SlideShapeObject;
