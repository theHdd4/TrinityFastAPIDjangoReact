import React from 'react';
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
  };

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
      <g opacity={svgOpacity}>{content}</g>
    </svg>
  );
};

export default ShapeRenderer;
