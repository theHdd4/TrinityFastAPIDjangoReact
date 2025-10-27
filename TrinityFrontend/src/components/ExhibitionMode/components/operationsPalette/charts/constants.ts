import { AreaChart, BarChart3, Circle, Columns3, LineChart, PieChart } from 'lucide-react';
import type { ChartColorScheme, ChartConfig, ChartDataRow, ChartType, ChartTypeDefinition } from './types';

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
  legendPosition: 'bottom',
};

export const CHART_TYPES: ChartTypeDefinition[] = [
  {
    id: 'verticalBar',
    name: 'Vertical bar',
    icon: Columns3,
    colorClass: 'text-blue-500',
    gradient: 'from-blue-500/20 to-cyan-500/20',
  },
  {
    id: 'horizontalBar',
    name: 'Horizontal bar',
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
    id: 'area',
    name: 'Area',
    icon: AreaChart,
    colorClass: 'text-emerald-500',
    gradient: 'from-emerald-500/20 to-teal-500/20',
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
  // Light & Bright Schemes
  {
    id: 'default',
    name: 'Ocean Breeze',
    icon: '🌊',
    colors: ['#3b82f6', '#06b6d4', '#0ea5e9', '#38bdf8', '#7dd3fc'],
    category: 'light',
  },
  {
    id: 'pastel',
    name: 'Soft Pastels',
    icon: '🌸',
    colors: ['#f9a8d4', '#93c5fd', '#86efac', '#fde047', '#fca5a5'],
    category: 'light',
  },
  {
    id: 'spring',
    name: 'Spring Garden',
    icon: '🌼',
    colors: ['#bbf7d0', '#fde68a', '#fed7aa', '#fca5a5', '#e9d5ff'],
    category: 'light',
  },
  {
    id: 'sunset',
    name: 'Sunset Sky',
    icon: '🌅',
    colors: ['#fef3c7', '#fed7aa', '#fca5a5', '#f9a8d4', '#ddd6fe'],
    category: 'light',
  },
  {
    id: 'mint',
    name: 'Mint Fresh',
    icon: '🌿',
    colors: ['#a7f3d0', '#6ee7b7', '#34d399', '#10b981', '#059669'],
    category: 'light',
  },
  {
    id: 'lavender',
    name: 'Lavender Dream',
    icon: '💜',
    colors: ['#ede9fe', '#ddd6fe', '#c4b5fd', '#a78bfa', '#8b5cf6'],
    category: 'light',
  },
  {
    id: 'peach',
    name: 'Peach Melba',
    icon: '🍑',
    colors: ['#ffe4e6', '#fecdd3', '#fda4af', '#fb7185', '#f43f5e'],
    category: 'light',
  },
  {
    id: 'sky',
    name: 'Clear Sky',
    icon: '☁️',
    colors: ['#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9'],
    category: 'light',
  },

  // Vibrant Schemes
  {
    id: 'vibrant',
    name: 'Electric',
    icon: '⚡',
    colors: ['#a855f7', '#06b6d4', '#10b981', '#f59e0b', '#ef4444'],
    category: 'vibrant',
  },
  {
    id: 'neon',
    name: 'Neon Lights',
    icon: '💡',
    colors: ['#ff00ff', '#00ffff', '#00ff00', '#ffff00', '#ff6600'],
    category: 'vibrant',
  },
  {
    id: 'tropical',
    name: 'Tropical Paradise',
    icon: '🌴',
    colors: ['#f43f5e', '#ec4899', '#8b5cf6', '#06b6d4', '#10b981'],
    category: 'vibrant',
  },
  {
    id: 'aurora',
    name: 'Aurora Borealis',
    icon: '✨',
    colors: ['#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'],
    category: 'vibrant',
  },
  {
    id: 'rainbow',
    name: 'Rainbow Burst',
    icon: '🌈',
    colors: ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6'],
    category: 'vibrant',
  },
  {
    id: 'candy',
    name: 'Candy Shop',
    icon: '🍭',
    colors: ['#f472b6', '#fb923c', '#fbbf24', '#a3e635', '#60a5fa'],
    category: 'vibrant',
  },

  // Dark Schemes
  {
    id: 'midnight',
    name: 'Midnight Blue',
    icon: '🌌',
    colors: ['#1e3a8a', '#1e40af', '#2563eb', '#3b82f6', '#60a5fa'],
    category: 'dark',
  },
  {
    id: 'deepforest',
    name: 'Deep Forest',
    icon: '🌲',
    colors: ['#064e3b', '#065f46', '#047857', '#059669', '#10b981'],
    category: 'dark',
  },
  {
    id: 'royal',
    name: 'Royal Purple',
    icon: '👑',
    colors: ['#581c87', '#6b21a8', '#7c3aed', '#8b5cf6', '#a78bfa'],
    category: 'dark',
  },
  {
    id: 'crimson',
    name: 'Crimson Night',
    icon: '🌙',
    colors: ['#7f1d1d', '#991b1b', '#dc2626', '#ef4444', '#f87171'],
    category: 'dark',
  },
  {
    id: 'slate',
    name: 'Slate Storm',
    icon: '🌧️',
    colors: ['#1e293b', '#334155', '#475569', '#64748b', '#94a3b8'],
    category: 'dark',
  },
  {
    id: 'ember',
    name: 'Dark Ember',
    icon: '🔥',
    colors: ['#7c2d12', '#9a3412', '#c2410c', '#ea580c', '#f97316'],
    category: 'dark',
  },
  {
    id: 'ocean',
    name: 'Deep Ocean',
    icon: '🌊',
    colors: ['#164e63', '#155e75', '#0e7490', '#0891b2', '#06b6d4'],
    category: 'dark',
  },
  {
    id: 'plum',
    name: 'Dark Plum',
    icon: '🍇',
    colors: ['#4a044e', '#701a75', '#86198f', '#a21caf', '#c026d3'],
    category: 'dark',
  },

  // Classic & Professional
  {
    id: 'monochrome',
    name: 'Monochrome',
    icon: '⚫',
    colors: ['#171717', '#404040', '#737373', '#a3a3a3', '#d4d4d4'],
    category: 'classic',
  },
  {
    id: 'corporate',
    name: 'Corporate Blue',
    icon: '🏢',
    colors: ['#1e40af', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd'],
    category: 'classic',
  },
  {
    id: 'earth',
    name: 'Earth Tones',
    icon: '🌎',
    colors: ['#78350f', '#92400e', '#b45309', '#d97706', '#f59e0b'],
    category: 'classic',
  },
  {
    id: 'navy',
    name: 'Navy & Gold',
    icon: '⚓',
    colors: ['#1e3a8a', '#1e40af', '#d97706', '#f59e0b', '#fbbf24'],
    category: 'classic',
  },
  {
    id: 'burgundy',
    name: 'Burgundy Wine',
    icon: '🍷',
    colors: ['#7f1d1d', '#991b1b', '#b91c1c', '#dc2626', '#ef4444'],
    category: 'classic',
  },
  {
    id: 'emerald',
    name: 'Emerald Classic',
    icon: '💎',
    colors: ['#064e3b', '#065f46', '#047857', '#059669', '#10b981'],
    category: 'classic',
  },
  {
    id: 'steel',
    name: 'Steel Gray',
    icon: '🛠️',
    colors: ['#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1'],
    category: 'classic',
  },

  // Sophisticated
  {
    id: 'rose',
    name: 'Rose Gold',
    icon: '🌹',
    colors: ['#be185d', '#db2777', '#ec4899', '#f472b6', '#f9a8d4'],
    category: 'sophisticated',
  },
  {
    id: 'teal',
    name: 'Teal Elegance',
    icon: '🦚',
    colors: ['#115e59', '#0f766e', '#0d9488', '#14b8a6', '#2dd4bf'],
    category: 'sophisticated',
  },
  {
    id: 'sage',
    name: 'Sage Green',
    icon: '🍃',
    colors: ['#84cc16', '#a3e635', '#bef264', '#d9f99d', '#ecfccb'],
    category: 'sophisticated',
  },
  {
    id: 'wine',
    name: 'Wine & Roses',
    icon: '🍷',
    colors: ['#881337', '#9f1239', '#e11d48', '#f43f5e', '#fb7185'],
    category: 'sophisticated',
  },
  {
    id: 'azure',
    name: 'Azure Depths',
    icon: '🌀',
    colors: ['#075985', '#0369a1', '#0284c7', '#0ea5e9', '#38bdf8'],
    category: 'sophisticated',
  },
];

export const LEGEND_POSITIONS: { id: ChartConfig['legendPosition']; name: string }[] = [
  { id: 'top', name: 'Top' },
  { id: 'bottom', name: 'Bottom' },
  { id: 'left', name: 'Left' },
  { id: 'right', name: 'Right' },
];

export const DEFAULT_CHART_WIDTH = 420;
export const DEFAULT_CHART_HEIGHT = 320;

export const normalizeChartType = (type?: string): ChartType => {
  switch (type) {
    case 'verticalBar':
    case 'horizontalBar':
    case 'line':
    case 'area':
    case 'pie':
    case 'donut':
      return type;
    case 'column':
      return 'verticalBar';
    case 'bar':
      return 'horizontalBar';
    default:
      return DEFAULT_CHART_CONFIG.type;
  }
};
