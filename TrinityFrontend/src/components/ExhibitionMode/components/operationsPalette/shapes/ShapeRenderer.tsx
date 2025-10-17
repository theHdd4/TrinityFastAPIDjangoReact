import React, { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { getDefaultShapeProps, type ShapeDefinition, type ShapeStrokeStyle } from './constants';

interface ShapeRendererProps {
  definition: ShapeDefinition;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeStyle?: ShapeStrokeStyle;
  opacity?: number;
  className?: string;
}

const getDashPattern = (style: ShapeStrokeStyle | undefined, width: number): string | undefined => {
  switch (style) {
    case 'dashed':
      return `${Math.max(width * 3, 12)} ${Math.max(width * 2, 8)}`;
    case 'dash-dot':
      return `${Math.max(width * 3, 12)} ${Math.max(width * 1.8, 6)} ${Math.max(width, 4)} ${Math.max(width * 1.8, 6)}`;
    case 'dotted':
      return `${Math.max(width, 4)} ${Math.max(width * 1.6, 6)}`;
    default:
      return undefined;
  }
};

export const ShapeRenderer: React.FC<ShapeRendererProps> = ({
  definition,
  fill,
  stroke,
  strokeWidth,
  strokeStyle,
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

  const dashArray =
    strokeStyle && resolvedStrokeWidth > 0 ? getDashPattern(strokeStyle, resolvedStrokeWidth) : undefined;

  const styleProps = {
    fill: isLineShape ? 'none' : resolvedFill,
    stroke: resolvedStroke,
    strokeWidth: resolvedStrokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    vectorEffect: 'non-scaling-stroke' as const,
    strokeDasharray: dashArray,
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
    const scaleX = 100 / safeWidth;
    const scaleY = 100 / safeHeight;
    const translateX = -paddedX * scaleX;
    const translateY = -paddedY * scaleY;
    const nextTransform = `translate(${translateX}, ${translateY}) scale(${scaleX}, ${scaleY})`;

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
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className={cn('h-full w-full', className)}
      role="presentation"
    >
      <g transform={transform}>
        <g ref={contentGroupRef} opacity={svgOpacity} data-shape-content>
          {content}
        </g>
      </g>
    </svg>
  );
};

export default ShapeRenderer;
