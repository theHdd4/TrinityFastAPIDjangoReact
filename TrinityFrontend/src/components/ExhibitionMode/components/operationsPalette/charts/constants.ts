import {
  BarChart3,
  Circle,
  Columns3,
  LineChart,
  PieChart,
} from 'lucide-react';
import type { ChartColorScheme, ChartConfig, ChartDataRow, ChartTypeDefinition } from './types';

export const DEFAULT_CHART_DATA: ChartDataRow[] = [
  { label: 'Apple', value: 7 },
  { label: 'Key lime', value: 5 },
  { label: 'Cherry', value: 3 },
];

export const DEFAULT_CHART_CONFIG: ChartConfig = {
  type: 'pie',
  colorScheme: 'default',
  showLabels: true,
  showValues: false,
  horizontalAlignment: 'center',
  axisIncludesZero: true,
};

export const CHART_TYPES: ChartTypeDefinition[] = [
  {
    id: 'column',
    name: 'Column',
    icon: Columns3,
    colorClass: 'text-blue-500',
    gradient: 'from-blue-500/20 to-cyan-500/20',
  },
  {
    id: 'bar',
    name: 'Bar',
    icon: BarChart3,
    colorClass: 'text-purple-500',
    gradient: 'from-purple-500/20 to-pink-500/20',
  },
  {
    id: 'line',
    name: 'Line',
    icon: LineChart,
    colorClass: 'text-green-500',
    gradient: 'from-green-500/20 to-emerald-500/20',
  },
  {
    id: 'pie',
    name: 'Pie',
    icon: PieChart,
    colorClass: 'text-orange-500',
    gradient: 'from-orange-500/20 to-amber-500/20',
  },
  {
    id: 'donut',
    name: 'Donut',
    icon: Circle,
    colorClass: 'text-pink-500',
    gradient: 'from-pink-500/20 to-rose-500/20',
  },
];

export const COLOR_SCHEMES: ChartColorScheme[] = [
  {
    id: 'default',
    name: 'Default',
    icon: '🎨',
    colors: ['#3b82f6', '#8b5cf6', '#ec4899'],
  },
  {
    id: 'vibrant',
    name: 'Vibrant',
    icon: '✨',
    colors: ['#a855f7', '#06b6d4', '#10b981'],
  },
  {
    id: 'pastel',
    name: 'Pastel',
    icon: '🌸',
    colors: ['#f9a8d4', '#93c5fd', '#86efac'],
  },
  {
    id: 'monochrome',
    name: 'Monochrome',
    icon: '⚫',
    colors: ['#525252', '#737373', '#a3a3a3'],
  },
];

export const LEGEND_POSITIONS = [
  { id: 'top', name: 'Top' },
  { id: 'bottom', name: 'Bottom' },
  { id: 'left', name: 'Left' },
  { id: 'right', name: 'Right' },
] as const;

export const DEFAULT_CHART_WIDTH = 420;
export const DEFAULT_CHART_HEIGHT = 320;
