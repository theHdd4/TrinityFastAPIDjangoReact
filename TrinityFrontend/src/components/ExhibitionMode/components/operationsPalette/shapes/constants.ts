import type { SlideObject } from '../../../store/exhibitionStore';

export interface ShapeCategory {
  id: string;
  label: string;
}

type ShapePoint = readonly [number, number];

export type ShapeGeometry =
  | { kind: 'rect'; rx?: number; ry?: number }
  | { kind: 'circle'; radius?: number }
  | { kind: 'ellipse'; rx?: number; ry?: number }
  | { kind: 'polygon'; points: readonly ShapePoint[] }
  | { kind: 'polyline'; points: readonly ShapePoint[] }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'path'; d: string };

export type ShapeStrokeStyle = 'solid' | 'dashed' | 'dash-dot' | 'dotted';

const SHAPE_STROKE_STYLES: readonly ShapeStrokeStyle[] = ['solid', 'dashed', 'dash-dot', 'dotted'] as const;

export interface ShapeObjectProps {
  shapeId: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeStyle: ShapeStrokeStyle;
  opacity: number;
}

export interface ShapeDefinition {
  id: string;
  label: string;
  categoryId: string;
  keywords: readonly string[];
  geometry: ShapeGeometry;
  defaultProps?: Partial<ShapeObjectProps>;
}

export const SHAPE_PANEL_WIDTH = 352;
export const DEFAULT_SHAPE_WIDTH = 260;
export const DEFAULT_SHAPE_HEIGHT = 200;

export const SHAPE_CATEGORIES: readonly ShapeCategory[] = [
  { id: 'lines', label: 'Lines' },
  { id: 'basic', label: 'Basic shapes' },
  { id: 'polygons', label: 'Polygons' },
  { id: 'stars', label: 'Stars' },
  { id: 'arrows', label: 'Arrows' },
  { id: 'flowchart', label: 'Flowchart shapes' },
  { id: 'bubbles', label: 'Speech bubbles' },
  { id: 'clouds', label: 'Clouds' },
] as const;

const polygon = (...points: ShapePoint[]): readonly ShapePoint[] => points;

const SHAPE_DEFAULTS: ShapeObjectProps = {
  shapeId: 'rectangle',
  fill: '#111827',
  stroke: 'transparent',
  strokeWidth: 0,
  strokeStyle: 'solid',
  opacity: 1,
};

export const SHAPE_DEFINITIONS: readonly ShapeDefinition[] = [
  // Lines
  {
    id: 'line-horizontal',
    label: 'Line',
    categoryId: 'lines',
    keywords: ['line', 'horizontal'],
    geometry: { kind: 'line', x1: 10, y1: 50, x2: 90, y2: 50 },
    defaultProps: { fill: 'transparent', stroke: '#111827', strokeWidth: 6 },
  },
  {
    id: 'line-vertical',
    label: 'Vertical line',
    categoryId: 'lines',
    keywords: ['line', 'vertical'],
    geometry: { kind: 'line', x1: 50, y1: 10, x2: 50, y2: 90 },
    defaultProps: { fill: 'transparent', stroke: '#111827', strokeWidth: 6 },
  },
  {
    id: 'line-diagonal',
    label: 'Diagonal line',
    categoryId: 'lines',
    keywords: ['line', 'diagonal'],
    geometry: { kind: 'line', x1: 14, y1: 86, x2: 86, y2: 14 },
    defaultProps: { fill: 'transparent', stroke: '#111827', strokeWidth: 6 },
  },
  // Basic shapes
  {
    id: 'rectangle',
    label: 'Rectangle',
    categoryId: 'basic',
    keywords: ['rectangle', 'box'],
    geometry: { kind: 'rect' },
    defaultProps: { stroke: 'transparent', strokeWidth: 0, fill: '#111827' },
  },
  {
    id: 'rounded-rectangle',
    label: 'Rounded rectangle',
    categoryId: 'basic',
    keywords: ['rounded', 'rectangle'],
    geometry: { kind: 'rect', rx: 15, ry: 15 },
    defaultProps: { stroke: 'transparent', strokeWidth: 0, fill: '#111827' },
  },
  {
    id: 'ellipse',
    label: 'Ellipse',
    categoryId: 'basic',
    keywords: ['ellipse', 'oval'],
    geometry: { kind: 'ellipse', rx: 42, ry: 32 },
    defaultProps: { stroke: 'transparent', strokeWidth: 0, fill: '#111827' },
  },
  {
    id: 'circle',
    label: 'Circle',
    categoryId: 'basic',
    keywords: ['circle'],
    geometry: { kind: 'circle', radius: 38 },
    defaultProps: { stroke: 'transparent', strokeWidth: 0, fill: '#111827' },
  },
  {
    id: 'triangle',
    label: 'Triangle',
    categoryId: 'basic',
    keywords: ['triangle'],
    geometry: { kind: 'polygon', points: polygon([50, 12], [88, 84], [12, 84]) },
    defaultProps: { stroke: 'transparent', strokeWidth: 0, fill: '#111827' },
  },
  {
    id: 'diamond',
    label: 'Diamond',
    categoryId: 'basic',
    keywords: ['diamond', 'rhombus'],
    geometry: { kind: 'polygon', points: polygon([50, 10], [90, 50], [50, 90], [10, 50]) },
    defaultProps: { stroke: 'transparent', strokeWidth: 0, fill: '#111827' },
  },
  // Polygons
  {
    id: 'pentagon',
    label: 'Pentagon',
    categoryId: 'polygons',
    keywords: ['pentagon'],
    geometry: {
      kind: 'polygon',
      points: polygon([50, 8], [88, 38], [72, 88], [28, 88], [12, 38]),
    },
    defaultProps: { stroke: 'transparent', strokeWidth: 0, fill: '#111827' },
  },
  {
    id: 'hexagon',
    label: 'Hexagon',
    categoryId: 'polygons',
    keywords: ['hexagon'],
    geometry: {
      kind: 'polygon',
      points: polygon([28, 12], [72, 12], [92, 50], [72, 88], [28, 88], [8, 50]),
    },
    defaultProps: { stroke: 'transparent', strokeWidth: 0, fill: '#111827' },
  },
  {
    id: 'octagon',
    label: 'Octagon',
    categoryId: 'polygons',
    keywords: ['octagon'],
    geometry: {
      kind: 'polygon',
      points: polygon([38, 6], [62, 6], [86, 30], [86, 70], [62, 94], [38, 94], [14, 70], [14, 30]),
    },
    defaultProps: { stroke: 'transparent', strokeWidth: 0, fill: '#111827' },
  },
  // Stars
  {
    id: 'star',
    label: 'Star',
    categoryId: 'stars',
    keywords: ['star'],
    geometry: {
      kind: 'polygon',
      points: polygon([50, 8], [60, 36], [90, 36], [66, 54], [74, 84], [50, 66], [26, 84], [34, 54], [10, 36], [40, 36]),
    },
    defaultProps: { stroke: 'transparent', strokeWidth: 0, fill: '#111827' },
  },
  {
    id: 'burst',
    label: 'Burst',
    categoryId: 'stars',
    keywords: ['burst', 'explosion'],
    geometry: {
      kind: 'polygon',
      points: polygon(
        [50, 6],
        [60, 26],
        [82, 18],
        [74, 40],
        [94, 50],
        [74, 60],
        [82, 82],
        [60, 74],
        [50, 94],
        [40, 74],
        [18, 82],
        [26, 60],
        [6, 50],
        [26, 40],
        [18, 18],
        [40, 26],
      ),
    },
    defaultProps: { stroke: 'transparent', strokeWidth: 0, fill: '#111827' },
  },
  // Arrows
  {
    id: 'arrow-right',
    label: 'Right arrow',
    categoryId: 'arrows',
    keywords: ['arrow', 'right'],
    geometry: {
      kind: 'polygon',
      points: polygon([10, 40], [58, 40], [58, 20], [90, 50], [58, 80], [58, 60], [10, 60]),
    },
    defaultProps: { stroke: 'transparent', strokeWidth: 0, fill: '#111827' },
  },
  {
    id: 'arrow-left',
    label: 'Left arrow',
    categoryId: 'arrows',
    keywords: ['arrow', 'left'],
    geometry: {
      kind: 'polygon',
      points: polygon([90, 40], [42, 40], [42, 20], [10, 50], [42, 80], [42, 60], [90, 60]),
    },
    defaultProps: { stroke: 'transparent', strokeWidth: 0, fill: '#111827' },
  },
  {
    id: 'arrow-up',
    label: 'Up arrow',
    categoryId: 'arrows',
    keywords: ['arrow', 'up'],
    geometry: {
      kind: 'polygon',
      points: polygon([50, 12], [78, 40], [66, 40], [66, 88], [34, 88], [34, 40], [22, 40]),
    },
    defaultProps: { stroke: 'transparent', strokeWidth: 0, fill: '#111827' },
  },
  {
    id: 'arrow-down',
    label: 'Down arrow',
    categoryId: 'arrows',
    keywords: ['arrow', 'down'],
    geometry: {
      kind: 'polygon',
      points: polygon([34, 12], [66, 12], [66, 60], [78, 60], [50, 88], [22, 60], [34, 60]),
    },
    defaultProps: { stroke: 'transparent', strokeWidth: 0, fill: '#111827' },
  },
  // Flowchart
  {
    id: 'process',
    label: 'Process',
    categoryId: 'flowchart',
    keywords: ['flowchart', 'process'],
    geometry: { kind: 'rect' },
    defaultProps: { stroke: 'transparent', strokeWidth: 0, fill: '#111827' },
  },
  {
    id: 'decision',
    label: 'Decision',
    categoryId: 'flowchart',
    keywords: ['flowchart', 'decision', 'diamond'],
    geometry: { kind: 'polygon', points: polygon([50, 10], [88, 50], [50, 90], [12, 50]) },
    defaultProps: { stroke: 'transparent', strokeWidth: 0, fill: '#111827' },
  },
  {
    id: 'terminator',
    label: 'Terminator',
    categoryId: 'flowchart',
    keywords: ['flowchart', 'terminator', 'start', 'end'],
    geometry: { kind: 'rect', rx: 30, ry: 30 },
    defaultProps: { stroke: 'transparent', strokeWidth: 0, fill: '#111827' },
  },
  {
    id: 'data',
    label: 'Data',
    categoryId: 'flowchart',
    keywords: ['flowchart', 'data', 'parallelogram'],
    geometry: { kind: 'polygon', points: polygon([20, 20], [80, 12], [80, 80], [20, 88]) },
    defaultProps: { stroke: 'transparent', strokeWidth: 0, fill: '#111827' },
  },
  // Speech bubbles
  {
    id: 'speech-rectangle',
    label: 'Speech bubble',
    categoryId: 'bubbles',
    keywords: ['speech', 'bubble', 'dialog'],
    geometry: {
      kind: 'path',
      d: 'M16 20h68c6 0 10 4 10 10v30c0 6-4 10-10 10H46l-12 16v-16H16c-6 0-10-4-10-10V30c0-6 4-10 10-10z',
    },
    defaultProps: { stroke: 'transparent', strokeWidth: 0, fill: '#111827' },
  },
  {
    id: 'speech-oval',
    label: 'Oval bubble',
    categoryId: 'bubbles',
    keywords: ['speech', 'bubble', 'oval'],
    geometry: {
      kind: 'path',
      d: 'M50 12c22 0 40 13 40 30 0 17-18 30-40 30-4 0-8-.4-12-1.2L22 86v-18C16 62 10 54 10 42 10 25 28 12 50 12z',
    },
    defaultProps: { stroke: 'transparent', strokeWidth: 0, fill: '#111827' },
  },
  {
    id: 'thought-bubble',
    label: 'Thought bubble',
    categoryId: 'bubbles',
    keywords: ['thought', 'bubble', 'cloud'],
    geometry: {
      kind: 'path',
      d: 'M66 24c7.5 0 13.5 6 13.5 13.5 0 1.7-.3 3.3-.8 4.9 5.6 2.6 9.3 8.3 9.3 14.6 0 9.2-7.5 16.7-16.7 16.7H32.7C22.5 73.7 14 65.2 14 55c0-6.2 3.1-11.8 8.2-15.2-.2-1-.3-2.1-.3-3.1 0-9 7.3-16.3 16.3-16.3 3.8 0 7.3 1.2 10.1 3.4C51.7 17 57.6 14 64.1 14 74.1 14 82 21.9 82 31.9c0 1.9-.3 3.7-.9 5.4z',
    },
    defaultProps: { stroke: 'transparent', strokeWidth: 0, fill: '#111827' },
  },
  // Clouds
  {
    id: 'cloud',
    label: 'Cloud',
    categoryId: 'clouds',
    keywords: ['cloud'],
    geometry: {
      kind: 'path',
      d: 'M72 38a16 16 0 0 0-30-8 18 18 0 0 0-26 16c0 10 8 18 18 18h46c10 0 18-8 18-18s-8-18-18-18h-8z',
    },
    defaultProps: { stroke: 'transparent', strokeWidth: 0, fill: '#111827' },
  },
  {
    id: 'double-cloud',
    label: 'Double cloud',
    categoryId: 'clouds',
    keywords: ['cloud'],
    geometry: {
      kind: 'path',
      d: 'M30 68h48c10 0 18-8 18-18 0-8-5-15-12-17.4C82 22 72 14 60 14c-10 0-19 6-22.8 14.6C26 30.4 18 38 18 48c0 11 9 20 20 20h-8z',
    },
    defaultProps: { stroke: 'transparent', strokeWidth: 0, fill: '#111827' },
  },
] as const;

export const getDefaultShapeProps = (definition?: ShapeDefinition | null): ShapeObjectProps => {
  const base: ShapeObjectProps = {
    ...SHAPE_DEFAULTS,
    shapeId: definition?.id ?? SHAPE_DEFAULTS.shapeId,
  };

  if (!definition?.defaultProps) {
    return base;
  }

  return {
    ...base,
    ...definition.defaultProps,
    shapeId: definition.id,
  };
};

export const parseShapeObjectProps = (
  props: Record<string, unknown> | undefined,
  definition?: ShapeDefinition | null,
): ShapeObjectProps => {
  const defaults = getDefaultShapeProps(definition);
  const fill = typeof props?.fill === 'string' && props.fill.trim().length > 0 ? props.fill : defaults.fill;
  const stroke =
    typeof props?.stroke === 'string' && props.stroke.trim().length > 0 ? props.stroke : defaults.stroke;
  const strokeWidthRaw = Number(props?.strokeWidth);
  const strokeWidth = Number.isFinite(strokeWidthRaw) ? Math.max(0, strokeWidthRaw) : defaults.strokeWidth;
  const strokeStyle =
    typeof props?.strokeStyle === 'string' &&
    SHAPE_STROKE_STYLES.includes(props.strokeStyle as ShapeStrokeStyle)
      ? (props.strokeStyle as ShapeStrokeStyle)
      : defaults.strokeStyle;
  const opacityRaw = Number(props?.opacity);
  const opacity = Number.isFinite(opacityRaw) ? Math.min(Math.max(opacityRaw, 0), 1) : defaults.opacity;

  return {
    shapeId: defaults.shapeId,
    fill,
    stroke,
    strokeWidth,
    strokeStyle,
    opacity,
  };
};

export const findShapeDefinition = (shapeId: string | undefined | null): ShapeDefinition | null => {
  if (!shapeId) {
    return null;
  }

  return SHAPE_DEFINITIONS.find(shape => shape.id === shapeId) ?? null;
};

export const createShapeSlideObject = (
  id: string,
  shape: ShapeDefinition,
  overrides: Partial<SlideObject> = {},
  propsOverrides: Partial<ShapeObjectProps> = {},
): SlideObject => {
  const defaults = getDefaultShapeProps(shape);
  const props: ShapeObjectProps = {
    ...defaults,
    ...propsOverrides,
    shapeId: shape.id,
  };

  return {
    id,
    type: 'shape',
    x: 160,
    y: 160,
    width: DEFAULT_SHAPE_WIDTH,
    height: DEFAULT_SHAPE_HEIGHT,
    zIndex: 1,
    rotation: 0,
    groupId: null,
    props,
    ...overrides,
  };
};

export const matchesShapeQuery = (definition: ShapeDefinition, query: string): boolean => {
  if (!query) {
    return true;
  }

  const normalised = query.trim().toLowerCase();
  if (normalised.length === 0) {
    return true;
  }

  if (definition.label.toLowerCase().includes(normalised)) {
    return true;
  }

  return definition.keywords.some(keyword => keyword.toLowerCase().includes(normalised));
};
