import type { SlideObject } from '../../../store/exhibitionStore';
import {
  type ChartConfig,
  type ChartDataRow,
  type ChartObjectProps,
  type ChartType,
  type EditableChartType,
} from './types';

export interface ChartColorScheme {
  id: string;
  name: string;
  colors: string[];
  category: 'light' | 'vibrant' | 'dark' | 'classic' | 'sophisticated';
}

const EDITABLE_CHART_TYPES: readonly EditableChartType[] = ['column', 'bar', 'line', 'pie', 'donut'];
const DIAGRAM_TYPES: readonly ChartType[] = ['blank', 'calendar', 'gantt'];

export const isEditableChartType = (value: ChartType): value is EditableChartType => {
  return (EDITABLE_CHART_TYPES as readonly string[]).includes(value);
};

export const chartTypeOptions = EDITABLE_CHART_TYPES;
export const diagramTypeOptions = DIAGRAM_TYPES;

export const COLOR_SCHEMES: readonly ChartColorScheme[] = [
  { id: 'default', name: 'Ocean Breeze', colors: ['#3b82f6', '#06b6d4', '#0ea5e9', '#38bdf8', '#7dd3fc'], category: 'light' },
  { id: 'pastel', name: 'Soft Pastels', colors: ['#f9a8d4', '#93c5fd', '#86efac', '#fde047', '#fca5a5'], category: 'light' },
  { id: 'spring', name: 'Spring Garden', colors: ['#bbf7d0', '#fde68a', '#fed7aa', '#fca5a5', '#e9d5ff'], category: 'light' },
  { id: 'sunset', name: 'Sunset Sky', colors: ['#fef3c7', '#fed7aa', '#fca5a5', '#f9a8d4', '#ddd6fe'], category: 'light' },
  { id: 'mint', name: 'Mint Fresh', colors: ['#a7f3d0', '#6ee7b7', '#34d399', '#10b981', '#059669'], category: 'light' },
  { id: 'lavender', name: 'Lavender Dream', colors: ['#ede9fe', '#ddd6fe', '#c4b5fd', '#a78bfa', '#8b5cf6'], category: 'light' },
  { id: 'peach', name: 'Peach Melba', colors: ['#ffe4e6', '#fecdd3', '#fda4af', '#fb7185', '#f43f5e'], category: 'light' },
  { id: 'sky', name: 'Clear Sky', colors: ['#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9'], category: 'light' },
  { id: 'vibrant', name: 'Electric', colors: ['#a855f7', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'], category: 'vibrant' },
  { id: 'neon', name: 'Neon Lights', colors: ['#ff00ff', '#00ffff', '#00ff00', '#ffff00', '#ff6600'], category: 'vibrant' },
  { id: 'tropical', name: 'Tropical Paradise', colors: ['#f43f5e', '#ec4899', '#8b5cf6', '#06b6d4', '#10b981'], category: 'vibrant' },
  { id: 'aurora', name: 'Aurora Borealis', colors: ['#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'], category: 'vibrant' },
  { id: 'rainbow', name: 'Rainbow Burst', colors: ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'], category: 'vibrant' },
  { id: 'candy', name: 'Candy Shop', colors: ['#f472b6', '#fb923c', '#fbbf24', '#a3e635', '#60a5fa'], category: 'vibrant' },
  { id: 'midnight', name: 'Midnight Blue', colors: ['#1e3a8a', '#1e40af', '#2563eb', '#3b82f6', '#60a5fa'], category: 'dark' },
  { id: 'deepforest', name: 'Deep Forest', colors: ['#064e3b', '#065f46', '#047857', '#059669', '#10b981'], category: 'dark' },
  { id: 'royal', name: 'Royal Purple', colors: ['#581c87', '#6b21a8', '#7c3aed', '#8b5cf6', '#a78bfa'], category: 'dark' },
  { id: 'crimson', name: 'Crimson Night', colors: ['#7f1d1d', '#991b1b', '#dc2626', '#ef4444', '#f87171'], category: 'dark' },
  { id: 'slate', name: 'Slate Storm', colors: ['#1e293b', '#334155', '#475569', '#64748b', '#94a3b8'], category: 'dark' },
  { id: 'ember', name: 'Dark Ember', colors: ['#7c2d12', '#9a3412', '#c2410c', '#ea580c', '#f97316'], category: 'dark' },
  { id: 'ocean', name: 'Deep Ocean', colors: ['#164e63', '#155e75', '#0e7490', '#0891b2', '#06b6d4'], category: 'dark' },
  { id: 'plum', name: 'Dark Plum', colors: ['#4a044e', '#701a75', '#86198f', '#a21caf', '#c026d3'], category: 'dark' },
  { id: 'monochrome', name: 'Monochrome', colors: ['#171717', '#404040', '#737373', '#a3a3a3', '#d4d4d4'], category: 'classic' },
  { id: 'corporate', name: 'Corporate Blue', colors: ['#1e40af', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd'], category: 'classic' },
  { id: 'earth', name: 'Earth Tones', colors: ['#78350f', '#92400e', '#b45309', '#d97706', '#f59e0b'], category: 'classic' },
  { id: 'navy', name: 'Navy & Gold', colors: ['#1e3a8a', '#1e40af', '#d97706', '#f59e0b', '#fbbf24'], category: 'classic' },
  { id: 'burgundy', name: 'Burgundy Wine', colors: ['#7f1d1d', '#991b1b', '#b91c1c', '#dc2626', '#ef4444'], category: 'classic' },
  { id: 'emerald', name: 'Emerald Classic', colors: ['#064e3b', '#065f46', '#047857', '#059669', '#10b981'], category: 'classic' },
  { id: 'steel', name: 'Steel Gray', colors: ['#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1'], category: 'classic' },
  { id: 'rose', name: 'Rose Gold', colors: ['#be185d', '#db2777', '#ec4899', '#f472b6', '#f9a8d4'], category: 'sophisticated' },
  { id: 'teal', name: 'Teal Elegance', colors: ['#115e59', '#0f766e', '#0d9488', '#14b8a6', '#2dd4bf'], category: 'sophisticated' },
  { id: 'sage', name: 'Sage Green', colors: ['#84cc16', '#a3e635', '#bef264', '#d9f99d', '#ecfccb'], category: 'sophisticated' },
  { id: 'wine', name: 'Wine & Roses', colors: ['#881337', '#9f1239', '#e11d48', '#f43f5e', '#fb7185'], category: 'sophisticated' },
  { id: 'azure', name: 'Azure Depths', colors: ['#075985', '#0369a1', '#0284c7', '#0ea5e9', '#38bdf8'], category: 'sophisticated' },
] as const;

export const DEFAULT_CHART_DATA: readonly ChartDataRow[] = [
  { label: 'Apple', value: 7 },
  { label: 'Key lime', value: 5 },
  { label: 'Cherry', value: 3 },
];

export const DEFAULT_CHART_CONFIG: ChartConfig = {
  type: 'column',
  colorScheme: 'default',
  showLabels: true,
  showValues: false,
  horizontalAlignment: 'center',
  axisIncludesZero: true,
};

export const DEFAULT_CHART_WIDTH = 460;
export const DEFAULT_CHART_HEIGHT = 340;

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const normaliseChartType = (value: unknown): ChartType => {
  if (typeof value !== 'string') {
    return DEFAULT_CHART_CONFIG.type;
  }
  const trimmed = value.trim().toLowerCase();
  if ((EDITABLE_CHART_TYPES as readonly string[]).includes(trimmed)) {
    return trimmed as ChartType;
  }
  if ((DIAGRAM_TYPES as readonly string[]).includes(trimmed)) {
    return trimmed as ChartType;
  }
  return DEFAULT_CHART_CONFIG.type;
};

const normaliseAlignment = (value: unknown): 'left' | 'center' | 'right' => {
  if (value === 'left' || value === 'center' || value === 'right') {
    return value;
  }
  return DEFAULT_CHART_CONFIG.horizontalAlignment;
};

export const getColorSchemeColors = (id: string): string[] => {
  const match = COLOR_SCHEMES.find(scheme => scheme.id === id);
  return match ? match.colors : COLOR_SCHEMES[0].colors;
};

export const parseChartObjectProps = (
  raw: Record<string, unknown> | undefined,
): ChartObjectProps => {
  const props = isRecord(raw) ? raw : {};

  const rawData = Array.isArray(props.chartData)
    ? (props.chartData as unknown[])
    : Array.isArray(props.data)
      ? (props.data as unknown[])
      : [];

  const chartData: ChartDataRow[] = rawData
    .map(entry => {
      if (!isRecord(entry)) {
        return null;
      }
      const label = typeof entry.label === 'string' ? entry.label : String(entry.label ?? '');
      const value = Number(entry.value);
      if (!Number.isFinite(value)) {
        return null;
      }
      return { label, value };
    })
    .filter((entry): entry is ChartDataRow => entry !== null);

  const configCandidate = isRecord(props.chartConfig) ? props.chartConfig : isRecord(props.config) ? props.config : {};

  const chartConfig: ChartConfig = {
    ...DEFAULT_CHART_CONFIG,
    type: normaliseChartType(configCandidate.type),
    colorScheme: typeof configCandidate.colorScheme === 'string'
      ? configCandidate.colorScheme
      : DEFAULT_CHART_CONFIG.colorScheme,
    showLabels: typeof configCandidate.showLabels === 'boolean'
      ? configCandidate.showLabels
      : DEFAULT_CHART_CONFIG.showLabels,
    showValues: typeof configCandidate.showValues === 'boolean'
      ? configCandidate.showValues
      : DEFAULT_CHART_CONFIG.showValues,
    horizontalAlignment: normaliseAlignment(configCandidate.horizontalAlignment),
    axisIncludesZero: typeof configCandidate.axisIncludesZero === 'boolean'
      ? configCandidate.axisIncludesZero
      : DEFAULT_CHART_CONFIG.axisIncludesZero,
  };

  return {
    chartData: chartData.length > 0 ? chartData : [...DEFAULT_CHART_DATA],
    chartConfig,
  };
};

export const createChartSlideObject = (
  id: string,
  data: ChartDataRow[],
  config: ChartConfig,
  overrides: Partial<SlideObject> = {},
): SlideObject => {
  const safeData = data.length > 0 ? data.map(entry => ({ ...entry })) : [...DEFAULT_CHART_DATA];
  const safeConfig: ChartConfig = {
    ...DEFAULT_CHART_CONFIG,
    ...config,
    type: normaliseChartType(config.type),
    horizontalAlignment: normaliseAlignment(config.horizontalAlignment),
    colorScheme: typeof config.colorScheme === 'string' && config.colorScheme
      ? config.colorScheme
      : DEFAULT_CHART_CONFIG.colorScheme,
  };

  const base: SlideObject = {
    id,
    type: 'chart',
    x: 180,
    y: 180,
    width: DEFAULT_CHART_WIDTH,
    height: DEFAULT_CHART_HEIGHT,
    zIndex: 1,
    rotation: 0,
    groupId: null,
    props: {
      chartData: safeData,
      chartConfig: safeConfig,
    },
  } as SlideObject;

  return {
    ...base,
    ...overrides,
    props: {
      ...(base.props ?? {}),
      ...(overrides.props ?? {}),
      chartData: safeData,
      chartConfig: safeConfig,
    },
  };
};
