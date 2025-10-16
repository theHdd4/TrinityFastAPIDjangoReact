import React, { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { getDefaultShapeProps, type ShapeDefinition } from './constants';

interface ShapeRendererProps {
  definition: ShapeDefinition;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  className?: string;
}

export const ShapeRenderer: React.FC<ShapeRendererProps> = ({
  definition,
  fill,
  stroke,
  strokeWidth,
  opacity,
  className,
}) => {
  const defaults = getDefaultShapeProps(definition);
  const geometry = definition.geometry;
  const isLineShape = geometry.kind === 'line' || geometry.kind === 'polyline';
  const contentGroupRef = useRef<SVGGElement | null>(null);
  const [transform, setTransform] = useState('translate(0, 0) scale(1)');

  const resolvedFill =
    !isLineShape && typeof fill === 'string' && fill.trim().length > 0 ? fill : defaults.fill;
  const rawStroke = typeof stroke === 'string' && stroke.trim().length > 0 ? stroke : defaults.stroke;
  const defaultStrokeForLines = rawStroke === 'transparent' ? '#111827' : rawStroke;
  const effectiveStrokeWidth =
    typeof strokeWidth === 'number' && Number.isFinite(strokeWidth)
      ? Math.max(0, strokeWidth)
      : defaults.strokeWidth;
  const lineStrokeWidth = isLineShape && effectiveStrokeWidth <= 0 ? 4 : effectiveStrokeWidth;
  const resolvedStrokeWidth = isLineShape ? lineStrokeWidth : effectiveStrokeWidth;

  const resolvedStroke = isLineShape
    ? defaultStrokeForLines
    : resolvedStrokeWidth > 0
      ? rawStroke === 'transparent'
        ? resolvedFill
        : rawStroke
      : 'none';

  const svgOpacity = typeof opacity === 'number' && Number.isFinite(opacity) ? opacity : defaults.opacity;

  const styleProps = {
    fill: isLineShape ? 'none' : resolvedFill,
    stroke: resolvedStroke,
    strokeWidth: resolvedStrokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    vectorEffect: 'non-scaling-stroke' as const,
  };

  useLayoutEffect(() => {
    const contentNode = contentGroupRef.current;
    if (!contentNode) {
      return;
    }

    const bbox = contentNode.getBBox();
    if (!Number.isFinite(bbox.width) || !Number.isFinite(bbox.height)) {
      return;
    }

    const hasVisibleStroke = resolvedStroke !== 'none' && resolvedStrokeWidth > 0;
    const strokePadding = hasVisibleStroke ? resolvedStrokeWidth : 0;
    const halfStroke = strokePadding / 2;
    const paddedX = bbox.x - halfStroke;
    const paddedY = bbox.y - halfStroke;
    const paddedWidth = bbox.width + strokePadding;
    const paddedHeight = bbox.height + strokePadding;

    const safeWidth = Math.max(paddedWidth, 1);
    const safeHeight = Math.max(paddedHeight, 1);
    const scale = Math.min(100 / safeWidth, 100 / safeHeight);

    const scaledWidth = safeWidth * scale;
    const scaledHeight = safeHeight * scale;
    const offsetX = (100 - scaledWidth) / 2;
    const offsetY = (100 - scaledHeight) / 2;

    const translateX = offsetX - paddedX * scale;
    const translateY = offsetY - paddedY * scale;
    const nextTransform = `translate(${translateX}, ${translateY}) scale(${scale})`;

    setTransform(prev => (prev === nextTransform ? prev : nextTransform));
  }, [definition, resolvedStroke, resolvedStrokeWidth]);

  const renderGeometry = () => {
    switch (geometry.kind) {
      case 'rect': {
        return (
          <rect
            x={12}
            y={12}
            width={76}
            height={76}
            rx={geometry.rx ?? geometry.ry ?? 0}
            ry={geometry.ry ?? geometry.rx ?? 0}
            {...styleProps}
          />
        );
      }
      case 'circle': {
        const radius = geometry.radius ?? 38;
        return <circle cx={50} cy={50} r={radius} {...styleProps} />;
      }
      case 'ellipse': {
        const rx = geometry.rx ?? 46;
        const ry = geometry.ry ?? 32;
        return <ellipse cx={50} cy={50} rx={rx} ry={ry} {...styleProps} />;
      }
      case 'polygon': {
        const points = geometry.points.map(point => point.join(',')).join(' ');
        return <polygon points={points} {...styleProps} />;
      }
      case 'polyline': {
        const points = geometry.points.map(point => point.join(',')).join(' ');
        return <polyline points={points} {...styleProps} />;
      }
      case 'line': {
        return <line x1={geometry.x1} y1={geometry.y1} x2={geometry.x2} y2={geometry.y2} {...styleProps} />;
      }
      case 'path': {
        return <path d={geometry.d} {...styleProps} />;
      }
      default:
        return null;
    }
  };

  const content = renderGeometry();

  if (!content) {
    return null;
  }

  return (
    <svg viewBox="0 0 100 100" className={cn('h-full w-full', className)} role="presentation">
      <g transform={transform}>
        <g ref={contentGroupRef} opacity={svgOpacity} data-shape-content>
          {content}
        </g>
      </g>
    </svg>
  );
};

export default ShapeRenderer;
