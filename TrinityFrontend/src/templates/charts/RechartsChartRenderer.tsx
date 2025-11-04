import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';

// Separate component for axis label editing to prevent re-renders
const AxisLabelEditor = React.memo(({ 
  xAxisLabel, 
  yAxisLabel, 
  customXAxisLabel, 
  customYAxisLabel, 
  title,
  customTitle,
  position, 
  onSave, 
  onCancel 
}: {
  xAxisLabel?: string;
  yAxisLabel?: string;
  customXAxisLabel: string;
  customYAxisLabel: string;
  title?: string;
  customTitle: string;
  position: { x: number; y: number };
  onSave: (x: string, y: string, t: string) => void;
  onCancel: () => void;
}) => {
  const [tempX, setTempX] = useState(customXAxisLabel || xAxisLabel || '');
  const [tempY, setTempY] = useState(customYAxisLabel || yAxisLabel || '');
  const [tempTitle, setTempTitle] = useState(customTitle || title || '');

  useEffect(() => {
    setTempX(customXAxisLabel || xAxisLabel || '');
    setTempY(customYAxisLabel || yAxisLabel || '');
    setTempTitle(customTitle || title || '');
  }, [customXAxisLabel, customYAxisLabel, customTitle, xAxisLabel, yAxisLabel, title]);

  return (
    <div
      className="fixed z-[9999] bg-white border border-gray-300 rounded-lg shadow-xl p-4 axis-label-submenu"
      style={{
        left: position.x,
        top: position.y,
        minWidth: '280px',
        maxHeight: '400px'
      }}
    >
      <div className="px-2 py-2 text-sm font-semibold text-gray-700 border-b border-gray-200 mb-3">
        Edit Chart Labels
      </div>
      
      <div className="space-y-4">
        {/* Chart Title */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Chart Title
          </label>
          <input
            type="text"
            value={tempTitle}
            onChange={(e) => setTempTitle(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            placeholder={title || 'Enter chart title'}
          />
        </div>
        
        {/* X-Axis Label */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            X-Axis Label
          </label>
          <input
            type="text"
            value={tempX}
            onChange={(e) => setTempX(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            placeholder={xAxisLabel || 'Enter X-axis label'}
          />
        </div>
        
        {/* Y-Axis Label */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Y-Axis Label
          </label>
          <input
            type="text"
            value={tempY}
            onChange={(e) => setTempY(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            placeholder={yAxisLabel || 'Enter Y-axis label'}
          />
        </div>
        
        {/* Action Buttons */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={() => {
              setTempX(customXAxisLabel || xAxisLabel || '');
              setTempY(customYAxisLabel || yAxisLabel || '');
              setTempTitle(customTitle || title || '');
              onCancel();
            }}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(tempX, tempY, tempTitle)}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded transition-colors"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
});
import "./chart.css";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LabelList
} from 'recharts';
import * as d3 from 'd3';

interface Props {
  type: 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart' | 'stacked_bar_chart';
  data: any[];
  xField?: string;
  yField?: string;
  yFields?: string[]; // For dual Y-axes
  width?: number;
  height?: number;
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  yAxisLabels?: string[]; // For dual Y-axes
  legendField?: string; // Field to use for creating multiple lines/series
  colors?: string[];
  enableScroll?: boolean; // New prop for enabling horizontal scroll
  theme?: string; // Theme prop to receive from parent
  onThemeChange?: (theme: string) => void; // Callback for theme changes
  onChartTypeChange?: (type: 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart' | 'stacked_bar_chart') => void; // Callback for chart type changes
  onGridToggle?: (enabled: boolean) => void; // Callback for grid toggle
  onLegendToggle?: (enabled: boolean) => void; // Callback for legend toggle
  // onAxisLabelsToggle?: (enabled: boolean) => void; // Callback for axis labels toggle
  onXAxisLabelsToggle?: (enabled: boolean) => void; // Callback for X axis labels toggle
  onYAxisLabelsToggle?: (enabled: boolean) => void; // Callback for Y axis labels toggle
  onDataLabelsToggle?: (enabled: boolean) => void; // Callback for data labels toggle
  onSave?: () => void; // Callback for save action
  sortOrder?: 'asc' | 'desc' | null; // Current sort order
  onSortChange?: (order: 'asc' | 'desc' | null) => void; // Callback when sorting changes
  sortColumn?: string; // Column to sort by
  onSortColumnChange?: (column: string) => void; // Callback when sort column changes
  showLegend?: boolean; // External control for legend visibility
  // showAxisLabels?: boolean; // External control for axis labels visibility
  showXAxisLabels?: boolean; // External control for X axis labels visibility
  showYAxisLabels?: boolean; // External control for Y axis labels visibility
  showDataLabels?: boolean; // External control for data labels visibility
  initialShowDataLabels?: boolean; // Default state for data labels
  showGrid?: boolean; // External control for grid visibility
  chartsPerRow?: number; // For multi pie chart layouts
  captureId?: string;
  forceSingleAxis?: boolean; // Force rendering multiple series on single axis instead of dual axes
  stackBars?: boolean; // Enable stacked bar chart when legendField is present
}

// Excel-like color themes
const COLOR_THEMES = {
  'default': {
    name: 'Default',
    primary: '#6366f1',
    secondary: '#a5b4fc',
    tertiary: '#e0e7ff',
    palette: ['#6366f1', '#a5b4fc', '#e0e7ff', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA15E', '#BC6C25', '#9B59B6', '#E74C3C', '#3498DB', '#1ABC9C', '#F39C12', '#16A085', '#27AE60', '#E67E22', '#C0392B', '#8E44AD', '#2980B9', '#34495E', '#2C3E50', '#95A5A6', '#7F8C8D', '#EC7063', '#5DADE2', '#52BE80', '#F4D03F', '#E8DAEF', '#FADBD8', '#D5DBDB', '#A9CCE3', '#F8C471', '#85C1E2', '#73C6B6']
  },
  'blue': {
    name: 'Blue',
    primary: '#3b82f6',
    secondary: '#60a5fa',
    tertiary: '#dbeafe',
    palette: ['#1e40af', '#1e3a8a', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe', '#eff6ff', '#0c4a6e', '#075985', '#0369a1', '#0284c7', '#0ea5e9', '#38bdf8', '#7dd3fc', '#bae6fd', '#e0f2fe', '#f0f9ff', '#164e63', '#0e7490', '#0891b2', '#06b6d4', '#22d3ee', '#67e8f9', '#a5f3fc', '#cffafe', '#ecfeff', '#1e293b', '#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0', '#0f172a', '#1c4a6e', '#1e4d72', '#2563eb', '#3b82f6']
  },
  'green': {
    name: 'Green',
    primary: '#10b981',
    secondary: '#6ee7b7',
    tertiary: '#d1fae5',
    palette: ['#065f46', '#064e3b', '#047857', '#059669', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5', '#ecfdf5', '#022c22', '#0f766e', '#0d9488', '#14b8a6', '#2dd4bf', '#5eead4', '#99f6e4', '#ccfbf1', '#f0fdfa', '#14532d', '#166534', '#15803d', '#16a34a', '#22c55e', '#4ade80', '#86efac', '#bbf7d0', '#dcfce7', '#f0fdf4', '#1a365d', '#2d5016', '#365314', '#3f6212', '#4a7c59', '#54875d', '#65a30d', '#84cc16', '#a3e635', '#bef264', '#d9f99d']
  },
  'purple': {
    name: 'Purple',
    primary: '#8b5cf6',
    secondary: '#c4b5fd',
    tertiary: '#ede9fe',
    palette: ['#581c87', '#6b21a8', '#7e22ce', '#9333ea', '#a855f7', '#c084fc', '#d8b4fe', '#e9d5ff', '#f3e8ff', '#4c1d95', '#5b21b6', '#6d28d9', '#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe', '#faf5ff', '#3b0764', '#4a044e', '#581c87', '#6b21a8', '#7e22ce', '#9333ea', '#a855f7', '#c084fc', '#d8b4fe', '#e9d5ff', '#f3e8ff', '#4c1d95', '#5b21b6', '#6d28d9', '#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe', '#faf5ff']
  },
  'orange': {
    name: 'Orange',
    primary: '#f59e0b',
    secondary: '#fcd34d',
    tertiary: '#fef3c7',
    palette: ['#92400e', '#78350f', '#b45309', '#d97706', '#f59e0b', '#fbbf24', '#fcd34d', '#fde68a', '#fef3c7', '#fffbeb', '#9a3412', '#7c2d12', '#c2410c', '#ea580c', '#f97316', '#fb923c', '#fdba74', '#fed7aa', '#ffedd5', '#713f12', '#854d0e', '#a16207', '#ca8a04', '#eab308', '#facc15', '#fde047', '#fef08a', '#fef9c3', '#7c2d12', '#9a3412', '#c2410c', '#ea580c', '#f97316', '#fb923c', '#fdba74', '#fed7aa', '#ffedd5', '#78350f', '#92400e', '#b45309']
  },
  'red': {
    name: 'Red',
    primary: '#ef4444',
    secondary: '#f87171',
    tertiary: '#fecaca',
    palette: ['#991b1b', '#7f1d1d', '#b91c1c', '#dc2626', '#ef4444', '#f87171', '#fca5a5', '#fecaca', '#fee2e2', '#fef2f2', '#9f1239', '#881337', '#be123c', '#e11d48', '#f43f5e', '#fb7185', '#fda4af', '#fecdd3', '#ffe4e6', '#fff1f2', '#4c0519', '#7f1d1d', '#991b1b', '#b91c1c', '#dc2626', '#ef4444', '#f87171', '#fca5a5', '#fecaca', '#fee2e2', '#9f1239', '#be123c', '#e11d48', '#f43f5e', '#fb7185', '#fda4af', '#fecdd3', '#ffe4e6', '#fff1f2', '#ffebee']
  },
  'teal': {
    name: 'Teal',
    primary: '#14b8a6',
    secondary: '#5eead4',
    tertiary: '#ccfbf1',
    palette: ['#134e4a', '#042f2e', '#115e59', '#0f766e', '#0d9488', '#14b8a6', '#2dd4bf', '#5eead4', '#99f6e4', '#ccfbf1', '#d1fae5', '#f0fdfa', '#083344', '#0e7490', '#0891b2', '#06b6d4', '#22d3ee', '#67e8f9', '#a5f3fc', '#cffafe', '#ecfeff', '#164e63', '#155e75', '#0e7490', '#0891b2', '#06b6d4', '#22d3ee', '#67e8f9', '#a5f3fc', '#cffafe', '#042f2e', '#134e4a', '#115e59', '#0f766e', '#0d9488', '#14b8a6', '#2dd4bf', '#5eead4', '#99f6e4', '#ccfbf1', '#f0fdfa']
  },
  'pink': {
    name: 'Pink',
    primary: '#ec4899',
    secondary: '#f9a8d4',
    tertiary: '#fce7f3',
    palette: ['#831843', '#881337', '#9f1239', '#be185d', '#db2777', '#ec4899', '#f472b6', '#f9a8d4', '#fbcfe8', '#fce7f3', '#fdf2f8', '#4a044e', '#701a75', '#86198f', '#a21caf', '#c026d3', '#d946ef', '#e879f9', '#f0abfc', '#f5d0fe', '#fae8ff', '#831843', '#9f1239', '#be185d', '#db2777', '#ec4899', '#f472b6', '#f9a8d4', '#fbcfe8', '#fce7f3', '#881337', '#9f1239', '#be185d', '#db2777', '#ec4899', '#f472b6', '#f9a8d4', '#fbcfe8', '#fce7f3', '#fdf2f8']
  },
  'gray': {
    name: 'Gray',
    primary: '#6b7280',
    secondary: '#9ca3af',
    tertiary: '#f3f4f6',
    palette: ['#374151', '#111827', '#1f2937', '#4b5563', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb', '#f3f4f6', '#f9fafb', '#030712', '#111827', '#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb', '#f3f4f6', '#0f172a', '#1e293b', '#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0', '#f1f5f9', '#f8fafc', '#18181b', '#27272a', '#3f3f46', '#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#e4e4e7', '#f4f4f5', '#fafafa']
  },
  'indigo': {
    name: 'Indigo',
    primary: '#4f46e5',
    secondary: '#818cf8',
    tertiary: '#e0e7ff',
    palette: ['#312e81', '#1e1b4b', '#4338ca', '#4f46e5', '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff', '#eef2ff', '#1e293b', '#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0', '#f1f5f9', '#312e81', '#4338ca', '#4f46e5', '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff', '#1e1b4b', '#312e81', '#4338ca', '#4f46e5', '#6366f1', '#818cf8', '#a5b4fc', '#c7d2fe', '#e0e7ff', '#eef2ff', '#312e81', '#4338ca', '#4f46e5', '#818cf8']
  },
  'cyan': {
    name: 'Cyan',
    primary: '#06b6d4',
    secondary: '#67e8f9',
    tertiary: '#cffafe',
    palette: ['#164e63', '#083344', '#0e7490', '#0891b2', '#06b6d4', '#22d3ee', '#67e8f9', '#a5f3fc', '#cffafe', '#ecfeff', '#155e75', '#0e7490', '#0891b2', '#06b6d4', '#22d3ee', '#67e8f9', '#a5f3fc', '#cffafe', '#0c4a6e', '#075985', '#0284c7', '#0ea5e9', '#38bdf8', '#7dd3fc', '#bae6fd', '#e0f2fe', '#164e63', '#155e75', '#0e7490', '#0891b2', '#06b6d4', '#22d3ee', '#67e8f9', '#a5f3fc', '#cffafe', '#ecfeff', '#083344', '#0e7490', '#0891b2', '#06b6d4']
  },
  'lime': {
    name: 'Lime',
    primary: '#84cc16',
    secondary: '#bef264',
    tertiary: '#f7fee7',
    palette: ['#3f6212', '#365314', '#4a7c59', '#65a30d', '#84cc16', '#a3e635', '#bef264', '#d9f99d', '#f7fee7', '#1a2e05', '#365314', '#3f6212', '#4a7c59', '#65a30d', '#84cc16', '#a3e635', '#bef264', '#d9f99d', '#14532d', '#166534', '#15803d', '#16a34a', '#22c55e', '#4ade80', '#86efac', '#bbf7d0', '#dcfce7', '#f0fdf4', '#1a2e05', '#365314', '#3f6212', '#4a7c59', '#65a30d', '#84cc16', '#a3e635', '#bef264', '#d9f99d', '#f7fee7', '#ecfdf5']
  },
  'amber': {
    name: 'Amber',
    primary: '#f59e0b',
    secondary: '#fbbf24',
    tertiary: '#fef3c7',
    palette: ['#78350f', '#713f12', '#854d0e', '#a16207', '#ca8a04', '#eab308', '#facc15', '#fde047', '#fef08a', '#fef9c3', '#92400e', '#b45309', '#d97706', '#f59e0b', '#fbbf24', '#fcd34d', '#fde68a', '#fef3c7', '#fffbeb', '#9a3412', '#c2410c', '#ea580c', '#f97316', '#fb923c', '#fdba74', '#fed7aa', '#ffedd5', '#78350f', '#854d0e', '#a16207', '#ca8a04', '#eab308', '#facc15', '#fde047', '#fef08a', '#fef9c3', '#fffbeb', '#92400e', '#b45309', '#f59e0b']
  },
  'emerald': {
    name: 'Emerald',
    primary: '#059669',
    secondary: '#34d399',
    tertiary: '#d1fae5',
    palette: ['#064e3b', '#022c22', '#065f46', '#047857', '#059669', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5', '#ecfdf5', '#14532d', '#166534', '#15803d', '#16a34a', '#22c55e', '#4ade80', '#86efac', '#bbf7d0', '#dcfce7', '#f0fdf4', '#064e3b', '#065f46', '#047857', '#059669', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5', '#022c22', '#065f46', '#047857', '#059669', '#10b981', '#34d399', '#6ee7b7', '#a7f3d0', '#d1fae5', '#ecfdf5']
  },
  'violet': {
    name: 'Violet',
    primary: '#7c3aed',
    secondary: '#a78bfa',
    tertiary: '#ede9fe',
    palette: ['#4c1d95', '#3b0764', '#581c87', '#6b21a8', '#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe', '#faf5ff', '#4c1d95', '#5b21b6', '#6d28d9', '#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe', '#faf5ff', '#3b0764', '#581c87', '#6b21a8', '#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe', '#4c1d95', '#581c87', '#6b21a8', '#7c3aed', '#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe', '#faf5ff']
  },
  'fuchsia': {
    name: 'Fuchsia',
    primary: '#d946ef',
    secondary: '#f0abfc',
    tertiary: '#fae8ff',
    palette: ['#701a75', '#4a044e', '#86198f', '#a21caf', '#c026d3', '#d946ef', '#e879f9', '#f0abfc', '#f5d0fe', '#fae8ff', '#fdf4ff', '#831843', '#9f1239', '#be185d', '#db2777', '#ec4899', '#f472b6', '#f9a8d4', '#fbcfe8', '#fce7f3', '#701a75', '#86198f', '#a21caf', '#c026d3', '#d946ef', '#e879f9', '#f0abfc', '#f5d0fe', '#fae8ff', '#4a044e', '#86198f', '#a21caf', '#c026d3', '#d946ef', '#e879f9', '#f0abfc', '#f5d0fe', '#fae8ff', '#fdf4ff', '#831843']
  },
  'rose': {
    name: 'Rose',
    primary: '#e11d48',
    secondary: '#fb7185',
    tertiary: '#ffe4e6',
    palette: ['#881337', '#4c0519', '#9f1239', '#be123c', '#e11d48', '#f43f5e', '#fb7185', '#fda4af', '#fecdd3', '#ffe4e6', '#fff1f2', '#991b1b', '#7f1d1d', '#b91c1c', '#dc2626', '#ef4444', '#f87171', '#fca5a5', '#fecaca', '#fee2e2', '#fef2f2', '#881337', '#9f1239', '#be123c', '#e11d48', '#f43f5e', '#fb7185', '#fda4af', '#fecdd3', '#ffe4e6', '#4c0519', '#9f1239', '#be123c', '#e11d48', '#f43f5e', '#fb7185', '#fda4af', '#fecdd3', '#ffe4e6', '#fff1f2']
  },
  'slate': {
    name: 'Slate',
    primary: '#475569',
    secondary: '#94a3b8',
    tertiary: '#f1f5f9',
    palette: ['#1e293b', '#0f172a', '#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0', '#f1f5f9', '#f8fafc', '#111827', '#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb', '#f3f4f6', '#f9fafb', '#18181b', '#27272a', '#3f3f46', '#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#e4e4e7', '#f4f4f5', '#fafafa', '#0f172a', '#1e293b', '#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0', '#f1f5f9', '#f8fafc']
  },
  'zinc': {
    name: 'Zinc',
    primary: '#71717a',
    secondary: '#a1a1aa',
    tertiary: '#f4f4f5',
    palette: ['#27272a', '#18181b', '#3f3f46', '#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#e4e4e7', '#f4f4f5', '#fafafa', '#111827', '#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb', '#f3f4f6', '#f9fafb', '#0f172a', '#1e293b', '#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0', '#f1f5f9', '#f8fafc', '#18181b', '#27272a', '#3f3f46', '#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#e4e4e7', '#f4f4f5', '#fafafa']
  },
  'neutral': {
    name: 'Neutral',
    primary: '#737373',
    secondary: '#a3a3a3',
    tertiary: '#f5f5f5',
    palette: ['#262626', '#171717', '#404040', '#525252', '#737373', '#a3a3a3', '#d4d4d4', '#e5e5e5', '#f5f5f5', '#fafafa', '#111827', '#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb', '#f3f4f6', '#f9fafb', '#18181b', '#27272a', '#3f3f46', '#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#e4e4e7', '#f4f4f5', '#fafafa', '#171717', '#262626', '#404040', '#525252', '#737373', '#a3a3a3', '#d4d4d4', '#e5e5e5', '#f5f5f5', '#fafafa']
  },
  'stone': {
    name: 'Stone',
    primary: '#78716c',
    secondary: '#a8a29e',
    tertiary: '#f5f5f4',
    palette: ['#292524', '#1c1917', '#44403c', '#57534e', '#78716c', '#a8a29e', '#d6d3d1', '#e7e5e4', '#f5f5f4', '#fafaf9', '#111827', '#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb', '#f3f4f6', '#f9fafb', '#18181b', '#27272a', '#3f3f46', '#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#e4e4e7', '#f4f4f5', '#fafafa', '#1c1917', '#292524', '#44403c', '#57534e', '#78716c', '#a8a29e', '#d6d3d1', '#e7e5e4', '#f5f5f4', '#fafaf9']
  },
  'sky': {
    name: 'Sky',
    primary: '#0ea5e9',
    secondary: '#38bdf8',
    tertiary: '#e0f2fe',
    palette: ['#0c4a6e', '#082f49', '#075985', '#0369a1', '#0284c7', '#0ea5e9', '#38bdf8', '#7dd3fc', '#bae6fd', '#e0f2fe', '#f0f9ff', '#164e63', '#0e7490', '#0891b2', '#06b6d4', '#22d3ee', '#67e8f9', '#a5f3fc', '#cffafe', '#ecfeff', '#1e40af', '#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe', '#eff6ff', '#0c4a6e', '#075985', '#0284c7', '#0ea5e9', '#38bdf8', '#7dd3fc', '#bae6fd', '#e0f2fe', '#f0f9ff', '#082f49', '#0c4a6e', '#075985']
  },
  'blue-gray': {
    name: 'Blue Gray',
    primary: '#64748b',
    secondary: '#94a3b8',
    tertiary: '#f1f5f9',
    palette: ['#334155', '#1e293b', '#0f172a', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0', '#f1f5f9', '#f8fafc', '#374151', '#4b5563', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb', '#f3f4f6', '#f9fafb', '#1e293b', '#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0', '#f1f5f9', '#0f172a', '#1e293b', '#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0', '#f1f5f9', '#f8fafc', '#374151', '#4b5563', '#6b7280', '#9ca3af']
  },
  'cool-gray': {
    name: 'Cool Gray',
    primary: '#6b7280',
    secondary: '#9ca3af',
    tertiary: '#f3f4f6',
    palette: ['#374151', '#1f2937', '#111827', '#4b5563', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb', '#f3f4f6', '#f9fafb', '#1e293b', '#334155', '#475569', '#64748b', '#94a3b8', '#cbd5e1', '#e2e8f0', '#f1f5f9', '#f8fafc', '#18181b', '#27272a', '#3f3f46', '#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#e4e4e7', '#f4f4f5', '#fafafa', '#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb', '#f3f4f6', '#f9fafb', '#111827']
  },
  'warm-gray': {
    name: 'Warm Gray',
    primary: '#78716c',
    secondary: '#a8a29e',
    tertiary: '#f5f5f4',
    palette: ['#44403c', '#292524', '#1c1917', '#57534e', '#78716c', '#a8a29e', '#d6d3d1', '#e7e5e4', '#f5f5f4', '#fafaf9', '#374151', '#4b5563', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb', '#f3f4f6', '#f9fafb', '#18181b', '#27272a', '#3f3f46', '#52525b', '#71717a', '#a1a1aa', '#d4d4d8', '#e4e4e7', '#f4f4f5', '#fafafa', '#292524', '#44403c', '#57534e', '#78716c', '#a8a29e', '#d6d3d1', '#e7e5e4', '#f5f5f4', '#fafaf9', '#1c1917', '#292524']
  }
};

const MODERN_PIE_COLORS = [
  '#8884d8', '#a5b4fc', '#e0e7ff', '#3b82f6', '#f59e0b', '#ef4444', '#06b6d4', '#84cc16', '#f97316', '#ec4899',
  '#6366f1', '#8b5cf6', '#10b981', '#14b8a6', '#f59e0b', '#e11d48', '#06b6d4', '#22d3ee', '#84cc16', '#bef264',
  '#4f46e5', '#7c3aed', '#059669', '#0d9488', '#ca8a04', '#dc2626', '#0891b2', '#67e8f9', '#65a30d', '#a3e635',
  '#4338ca', '#6b21a8', '#047857', '#0f766e', '#a16207', '#b91c1c', '#155e75', '#a5f3fc', '#4a7c59', '#d9f99d',
  '#312e81', '#581c87', '#065f46', '#134e4a', '#78350f', '#991b1b', '#164e63', '#cffafe', '#365314', '#f7fee7'
];

// Fallback flat palette (first scheme spread + legacy colors)
// Default palette for explore charts - base colors with lighter shades
const DEFAULT_COLORS = [
  '#FFBD59', '#FFC878', '#FFD897', '#41C185', '#5CD29A', '#78E3AF', '#458EE2', '#6BA4E8', '#91BAEE',
  '#F5F5F5', '#E0E0E0', '#C5C5C5', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA15E',
  '#BC6C25', '#9B59B6', '#E74C3C', '#3498DB', '#1ABC9C', '#F39C12', '#16A085', '#27AE60', '#E67E22',
  '#C0392B', '#8E44AD', '#2980B9', '#34495E', '#2C3E50', '#95A5A6', '#7F8C8D', '#EC7063', '#5DADE2',
  '#52BE80', '#F4D03F', '#E8DAEF', '#FADBD8', '#D5DBDB', '#A9CCE3', '#F8C471', '#85C1E2', '#73C6B6'
];

const FONT_FAMILY = `'Inter', 'Segoe UI', sans-serif`;

// Number formatting function for large numbers with proper precision
const formatLargeNumber = (value: any): string => {
  // Handle non-numeric values like ChartMaker does
  if (value === undefined || value === null || isNaN(value)) {
    return "";
  }
  
  // Convert to number if it's a string
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  // Check if conversion was successful
  if (isNaN(numValue)) {
    return "";
  }
  
  const absValue = Math.abs(numValue);

  const formatScaled = (scaled: number): string => {
    // Keep at most two decimals and trim trailing zeros (e.g. 2.34M, 2M)
    return parseFloat(scaled.toFixed(2)).toString();
  };

  if (absValue >= 1_000_000_000) { // Billions (10^9)
    return `${formatScaled(numValue / 1_000_000_000)}B`;
  } else if (absValue >= 1_000_000) { // Millions (10^6)
    return `${formatScaled(numValue / 1_000_000)}M`;
  } else if (absValue >= 1_000) { // Thousands (10^3)
    return `${formatScaled(numValue / 1_000)}K`;
  }
  return parseFloat(numValue.toFixed(2)).toString(); // Numbers less than 1000, max 2 decimals
};

// Format numbers for tooltips - show exact values without suffixes
const formatTooltipNumber = (value: any): string => {
  // Handle non-numeric values like ChartMaker does
  if (value === undefined || value === null || isNaN(value)) {
    return "";
  }
  
  // Convert to number if it's a string
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  // Check if conversion was successful
  if (isNaN(numValue)) {
    return "";
  }
  
  // For tooltips, show the exact number with proper formatting
  if (Number.isInteger(numValue)) {
    return numValue.toLocaleString(); // Add commas for thousands separators
  } else {
    return numValue.toLocaleString(undefined, { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 6 
    }); // Show up to 6 decimal places if needed
  }
};

// Custom label component for pie chart with better positioning
const CustomPieLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent, name }: any) => {
  const RADIAN = Math.PI / 180;
  // Position labels closer to the center for better visibility
  const radius = innerRadius + (outerRadius - innerRadius) * 0.3;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  // Only show labels for slices with > 1%
  if (percent < 0.01) return null;

  return (
    <text 
      x={x} 
      y={y} 
      textAnchor="middle" 
      dominantBaseline="central"
      style={{ 
        fontSize: '11px', 
        fontWeight: 'bold',
        textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
        pointerEvents: 'none',
        opacity: percent > 0.02 ? 1 : 0.8
      }}
    >
      {`${(percent * 100).toFixed(1)}%`}
    </text>
  );
};

const RechartsChartRenderer: React.FC<Props> = ({ 
  type, 
  data, 
  xField, 
  yField, 
  yFields,
  width = 0,
  height = 300,
  title,
  xAxisLabel,
  yAxisLabel,
  yAxisLabels,
  legendField,
  colors,
  enableScroll = false,
  theme: propTheme, // Use propTheme from parent
  onThemeChange,
  onChartTypeChange,
  onGridToggle,
  onLegendToggle,
  // onAxisLabelsToggle,
  onXAxisLabelsToggle,
  onYAxisLabelsToggle,
  onDataLabelsToggle,
  onSave,
  sortOrder,
  onSortChange, // Callback when sorting changes
  sortColumn: propSortColumn, // Column to sort by
  onSortColumnChange, // Callback when sort column changes
  showLegend: propShowLegend, // External control for legend visibility
  // showAxisLabels: propShowAxisLabels, // External control for axis labels visibility
  showXAxisLabels: propShowXAxisLabels,
  showYAxisLabels: propShowYAxisLabels,
  showDataLabels: propShowDataLabels, // External control for data labels visibility
  initialShowDataLabels,
  showGrid: propShowGrid, // External control for grid visibility
  chartsPerRow,
  captureId,
  forceSingleAxis = false,
  stackBars = false,
}) => {

  // State for color theme - simplified approach
  const [selectedTheme, setSelectedTheme] = useState<string>('default');
  // Use selectedTheme if user has made a choice, otherwise use propTheme
  const currentTheme = selectedTheme !== 'default' ? selectedTheme : (propTheme || 'default');
  
  // Update selectedTheme when propTheme changes (but only if user hasn't made a selection)
  useEffect(() => {
    if (propTheme && selectedTheme === 'default') {
      setSelectedTheme(propTheme);
    }
  }, [propTheme, selectedTheme]);

  const [showContextMenu, setShowContextMenu] = useState(false);
  const [showColorSubmenu, setShowColorSubmenu] = useState(false);
  const [showSortSubmenu, setShowSortSubmenu] = useState(false);
  const [showChartTypeSubmenu, setShowChartTypeSubmenu] = useState(false);
  const [showAxisLabelSubmenu, setShowAxisLabelSubmenu] = useState(false);
  const [showAxisToggleSubmenu, setShowAxisToggleSubmenu] = useState(false);
  const [colorSubmenuPos, setColorSubmenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [sortSubmenuPos, setSortSubmenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [internalSortColumn, setInternalSortColumn] = useState<string>('');
  // Use prop sortColumn if provided, otherwise use internal state
  const sortColumn = propSortColumn !== undefined ? propSortColumn : internalSortColumn;
  const setSortColumn = (column: string) => {
    console.log('🔍 CHART: setSortColumn called', { column, hasPropCallback: !!onSortColumnChange });
    if (onSortColumnChange) {
      onSortColumnChange(column);
    } else {
      setInternalSortColumn(column);
    }
  };
  
  // Debug log when sortColumn changes
  useEffect(() => {
    console.log('🔍 CHART: sortColumn changed', { sortColumn, propSortColumn, internalSortColumn, sortOrder });
  }, [sortColumn, propSortColumn, internalSortColumn, sortOrder]);
  const [chartTypeSubmenuPos, setChartTypeSubmenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [axisLabelSubmenuPos, setAxisLabelSubmenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [axisToggleSubmenuPos, setAxisToggleSubmenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const chartRef = useRef<HTMLDivElement>(null);
  const rootAttributes = captureId
    ? { 'data-exhibition-chart-root': 'true', 'data-exhibition-chart-id': captureId }
    : {};

  // State for custom axis labels - use localStorage to persist across component recreations
  // Create a unique key based on chart props to make it chart-specific (excluding type for persistence across chart types)
  const getStorageKey = () => {
    const chartId = `${xAxisLabel}_${yAxisLabel}_${width}_${height}_${title || 'no_title'}`;
    return `chart_labels_${chartId}`;
  };
  
  const [customXAxisLabel, setCustomXAxisLabel] = useState<string>(() => {
    try {
      return localStorage.getItem(`${getStorageKey()}_x`) || '';
    } catch {
      return '';
    }
  });
  const [customYAxisLabel, setCustomYAxisLabel] = useState<string>(() => {
    try {
      return localStorage.getItem(`${getStorageKey()}_y`) || '';
    } catch {
      return '';
    }
  });
  const [showXAxisLabelDialog, setShowXAxisLabelDialog] = useState(false);
  const [showYAxisLabelDialog, setShowYAxisLabelDialog] = useState(false);
  const [tempXAxisLabel, setTempXAxisLabel] = useState<string>('');
  const [tempYAxisLabel, setTempYAxisLabel] = useState<string>('');
  const [customTitle, setCustomTitle] = useState<string>(() => {
    try {
      return localStorage.getItem(`${getStorageKey()}_title`) || '';
    } catch {
      return '';
    }
  });
  const titleEditableRef = useRef<HTMLDivElement | null>(null);
  const [isTitleFocused, setIsTitleFocused] = useState(false);

  // State for per-series settings (color and data labels)
  interface SeriesSettings {
    color?: string;
    showDataLabels?: boolean;
  }
  const [seriesSettings, setSeriesSettings] = useState<Record<string, SeriesSettings>>({});
  const [selectedSeries, setSelectedSeries] = useState<{ dataKey: string; name: string; currentColor: string } | null>(null);
  const [showSeriesSettingsModal, setShowSeriesSettingsModal] = useState(false);

  const resolvedTitle = useMemo(() => {
    const trimmedCustom = customTitle?.trim?.() ?? '';
    if (trimmedCustom.length > 0) {
      return trimmedCustom;
    }
    return typeof title === 'string' ? title : '';
  }, [customTitle, title]);

  useEffect(() => {
    if (!titleEditableRef.current || isTitleFocused) {
      return;
    }
    titleEditableRef.current.textContent = resolvedTitle;
  }, [resolvedTitle, isTitleFocused]);

  const handleTitleFocus = useCallback(() => {
    setIsTitleFocused(true);
  }, []);

  const handleTitleInput = useCallback(() => {
    if (!titleEditableRef.current) {
      return;
    }
    setCustomTitle(titleEditableRef.current.textContent ?? '');
  }, [setCustomTitle]);

  const handleTitleBlur = useCallback(() => {
    setIsTitleFocused(false);
    if (!titleEditableRef.current) {
      return;
    }
    const nextValue = (titleEditableRef.current.textContent ?? '').trim();
    setCustomTitle(nextValue);
  }, [setCustomTitle]);

  const handleTitleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      titleEditableRef.current?.blur();
    }
  }, []);

  // Save custom labels to localStorage whenever they change
  useEffect(() => {
    try {
      if (customXAxisLabel) {
        localStorage.setItem(`${getStorageKey()}_x`, customXAxisLabel);
      } else {
        localStorage.removeItem(`${getStorageKey()}_x`);
      }
    } catch (e) {
      // Ignore localStorage errors
    }
  }, [customXAxisLabel, xAxisLabel, yAxisLabel, type]);

  useEffect(() => {
    try {
      if (customYAxisLabel) {
        localStorage.setItem(`${getStorageKey()}_y`, customYAxisLabel);
      } else {
        localStorage.removeItem(`${getStorageKey()}_y`);
      }
    } catch (e) {
      // Ignore localStorage errors
    }
  }, [customYAxisLabel, xAxisLabel, yAxisLabel, type]);

  useEffect(() => {
    try {
      if (customTitle) {
        localStorage.setItem(`${getStorageKey()}_title`, customTitle);
      } else {
        localStorage.removeItem(`${getStorageKey()}_title`);
      }
    } catch (e) {
      // Ignore localStorage errors
    }
  }, [customTitle, xAxisLabel, yAxisLabel, type]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowContextMenu(false);
    setShowColorSubmenu(false);
    setShowSortSubmenu(false);
    setShowChartTypeSubmenu(false);
    setShowAxisLabelSubmenu(false);
    setShowAxisToggleSubmenu(false);
  };

  // Handler for axis label editing submenu
  const handleAxisLabelClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setAxisLabelSubmenuPos({ x: rect.right + 4, y: rect.top });
    
    // Initialize temp values with current values
    setTempXAxisLabel(customXAxisLabel || xAxisLabel || '');
    setTempYAxisLabel(customYAxisLabel || yAxisLabel || '');
    
    setShowAxisLabelSubmenu(prev => !prev);
    setShowColorSubmenu(false);
    setShowSortSubmenu(false);
    setShowChartTypeSubmenu(false);
    setShowAxisToggleSubmenu(false);
  }, [customXAxisLabel, xAxisLabel, customYAxisLabel, yAxisLabel]);

  // Handler for axis toggle submenu
  const handleAxisToggleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setAxisToggleSubmenuPos({ x: rect.right + 4, y: rect.top });
    setShowAxisToggleSubmenu(prev => !prev);
    setShowColorSubmenu(false);
    setShowSortSubmenu(false);
    setShowChartTypeSubmenu(false);
    setShowAxisLabelSubmenu(false);
  }, []);

  // Handler for saving X-axis label
  const handleSaveXAxisLabel = () => {
    setCustomXAxisLabel(tempXAxisLabel);
    setShowXAxisLabelDialog(false);
  };

  // Handler for saving Y-axis label
  const handleSaveYAxisLabel = () => {
    setCustomYAxisLabel(tempYAxisLabel);
    setShowYAxisLabelDialog(false);
  };

  // Handler for canceling axis label editing
  const handleCancelAxisLabelEdit = () => {
    setShowXAxisLabelDialog(false);
    setShowYAxisLabelDialog(false);
  };


  const overlayVisible = showContextMenu || showColorSubmenu || showSortSubmenu || showChartTypeSubmenu || showAxisLabelSubmenu || showAxisToggleSubmenu;

  // State for chart options
  const [showGrid, setShowGrid] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [showAxisLabels, setShowAxisLabels] = useState(true);
  const [showXAxisLabels, setShowXAxisLabels] = useState(true);
  const [showYAxisLabels, setShowYAxisLabels] = useState(true);
  const [showDataLabels, setShowDataLabels] = useState(initialShowDataLabels ?? true);

  // Sync internal states with external props for persistence
  useEffect(() => {
    if (propShowGrid !== undefined) setShowGrid(propShowGrid);
  }, [propShowGrid]);

  useEffect(() => {
    if (propShowLegend !== undefined) setShowLegend(propShowLegend);
  }, [propShowLegend]);

  // useEffect(() => {
  //   if (propShowAxisLabels !== undefined) {
  //     setShowAxisLabels(propShowAxisLabels);
  //     setShowXAxisLabels(propShowAxisLabels);
  //     setShowYAxisLabels(propShowAxisLabels);
  //   }
  // }, [propShowAxisLabels]);

  useEffect(() => {
    if (propShowXAxisLabels !== undefined) setShowXAxisLabels(propShowXAxisLabels);
  }, [propShowXAxisLabels]);

  useEffect(() => {
    if (propShowYAxisLabels !== undefined) setShowYAxisLabels(propShowYAxisLabels);
  }, [propShowYAxisLabels]);

  useEffect(() => {
    if (propShowDataLabels !== undefined) setShowDataLabels(propShowDataLabels);
  }, [propShowDataLabels]);

  // Use data prop directly now that sorting is removed
  const chartData = data;

    // State to store transformed data that preserves legend fields
  // CRITICAL FIX: Store the detected legend field to ensure consistency
  const [detectedLegendField, setDetectedLegendField] = useState<string | null>(null);

  // Helper function to sort data based on sortOrder
  const sortData = (data: any[], sortOrder: 'asc' | 'desc' | null, sortKey: string): any[] => {
    if (!sortOrder || !data || data.length === 0 || !sortKey) {
      console.log('🔍 SORT: Skipping sort', { sortOrder, dataLength: data?.length, sortKey });
      return data;
    }

    console.log('🔍 SORT: Sorting data', { sortKey, sortOrder, dataLength: data.length, firstItem: data[0] });
    
    const sorted = [...data].sort((a, b) => {
      const aValue = a[sortKey];
      const bValue = b[sortKey];
      
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;
      
      if (sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });
    
    console.log('🔍 SORT: Sorted result', { first: sorted[0], last: sorted[sorted.length - 1] });
    return sorted;
  };

  // Use data directly for rendering.
  // When pie charts return an object keyed by legend values, flatten the slices
  // so that downstream logic expecting an array (e.g. key detection) continues
  // to work.
  const chartDataForRendering = useMemo(() => {
    if (!data || !Array.isArray(data)) return [];

    let processedData: any[] = [];

    // When data is already an array, handle special cases for pie charts
    if (Array.isArray(data)) {
      // Backend may return pie chart data as array of [label, value] when
      // no legend field is specified. Convert such tuples into objects that
      // Recharts can understand.
      if (
        type === 'pie_chart' &&
        (!legendField || legendField === '') &&
        Array.isArray(data[0])
      ) {
        const xKeyName = xField || 'name';
        const yKeyName = yField || 'value';

        processedData = (data as any[]).map((item) => {
          const [name, rawValue] = item as [any, any];
          let numericValue = rawValue;
          if (typeof rawValue === 'object' && rawValue !== null) {
            const firstNumber = Object.values(rawValue).find(
              (v) => typeof v === 'number'
            );
            numericValue = firstNumber !== undefined ? firstNumber : rawValue;
          }
          return { [xKeyName]: name, [yKeyName]: numericValue };
        });
      } else {
        processedData = data;
      }
    } else if (type === 'pie_chart' && typeof data === 'object') {
      // If a legend field is provided, the backend may return an object keyed by legend value
      if (legendField) {
        try {
          processedData = Object.values(data as Record<string, any[]>).flat();
        } catch {
          processedData = [];
        }
      } else {
        // When no legend field is provided, convert simple key-value pairs to an
        // array of objects. Some APIs return values as nested objects (e.g.
        // { category: { metric: 10 } }), which would otherwise break the pie
        // chart because Recharts expects numeric values. Extract the first
        // numeric field from such objects.
        try {
          const xKeyName = xField || 'name';
          const yKeyName = yField || 'value';

          processedData = Object.entries(data as Record<string, any>).map(([name, value]) => {
            let numericValue: any = value;
            if (typeof value === 'object' && value !== null) {
              const firstNumber = Object.values(value).find(v => typeof v === 'number');
              numericValue = firstNumber !== undefined ? firstNumber : value;
            }
            return { [xKeyName]: name, [yKeyName]: numericValue };
          });
        } catch {
          processedData = [];
        }
      }
    }

    // Apply sorting if sortOrder is specified and we have data
    if (sortOrder && processedData.length > 0) {
      // Determine the sort key, checking if it exists in the processed data (case-insensitive)
      let sortKey = sortColumn || yField || 'value';
      
      // Verify the sortKey exists in the data (case-insensitive match)
      if (processedData[0]) {
        const dataKeys = Object.keys(processedData[0]);
        
        // Try exact match first
        if (processedData[0][sortKey] === undefined) {
          // Try case-insensitive match
          const matchedKey = dataKeys.find(k => k.toLowerCase() === sortKey.toLowerCase());
          if (matchedKey) {
            sortKey = matchedKey;
          } else {
            // Fallback to first available non-system key
            const availableKeys = dataKeys.filter(k => 
              k !== 'series' && k !== 'group' && k !== 'legend' && !k.endsWith('_series')
            );
            sortKey = availableKeys[0] || sortKey;
          }
        }
      }
      
      processedData = sortData(processedData, sortOrder, sortKey);
    }

    return processedData;
  }, [data, type, legendField, sortOrder, yField, sortColumn]);

  // Simple chart render key
  const chartRenderKey = useMemo(() => {
    const key = `chart-${type}-${chartDataForRendering.length}`;
    return key;
  }, [type, chartDataForRendering]);
  
  // Use external props if provided, otherwise use internal state
  const currentShowGrid = propShowGrid !== undefined ? propShowGrid : showGrid;
  // Force legend on when using single axis mode with multiple series
  const currentShowLegend = (propShowLegend !== undefined ? propShowLegend : showLegend) || forceSingleAxis;
  // const currentShowAxisLabels = propShowAxisLabels !== undefined ? propShowAxisLabels : showAxisLabels;
  const currentShowXAxisLabels = propShowXAxisLabels !== undefined ? propShowXAxisLabels : showXAxisLabels;
  const currentShowYAxisLabels = propShowYAxisLabels !== undefined ? propShowYAxisLabels : showYAxisLabels;
  const currentShowDataLabels = propShowDataLabels !== undefined ? propShowDataLabels : showDataLabels;

  // Use custom axis labels if provided, otherwise fall back to props
  const effectiveXAxisLabel = customXAxisLabel || xAxisLabel;
  const effectiveYAxisLabel = customYAxisLabel || yAxisLabel;
  const effectiveYAxisLabels = yAxisLabels; // For dual Y-axes, we don't have custom editing yet

  // Calculate dynamic margins based on axis labels visibility
  const getChartMargins = () => {
    // Base margins for when no axis labels are shown
    let left = 20;
    let bottom = 80;
    
    // Adjust based on which axis labels are visible
    if (currentShowYAxisLabels) {
      left = 60; // Add space for Y-axis label
    }
    
    if (currentShowXAxisLabels) {
      bottom = 100; // Add space for X-axis label
    }
    
    return { top: 20, right: 20, left, bottom };
  };

  // Calculate dynamic margins for pie charts (no axis labels, but may have legend)
  const getPieChartMargins = () => {
    return { top: 20, right: 20, left: 20, bottom: 20 };
  };

  // Get current theme colors - recalculate whenever currentTheme changes
  const theme = useMemo(() => {
    const selectedTheme = COLOR_THEMES[currentTheme as keyof typeof COLOR_THEMES] || COLOR_THEMES.default;
    return selectedTheme;
  }, [currentTheme]);

  const scheme = useMemo(() => {
    return {
      primary: theme.primary,
      secondary: theme.secondary,
      tertiary: theme.tertiary
    };
  }, [currentTheme, theme]);

  const palette = useMemo(() => {
    const themePalette = (colors && colors.length > 0) ? colors : theme.palette;
    return themePalette && themePalette.length > 0 ? themePalette : DEFAULT_COLORS;
  }, [colors, currentTheme, theme.palette]);
  
  // Helper function to capitalize first letter of each word
  const capitalizeWords = (text: string): string => {
    return text.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  };

  /* ------------------------------------------------------------------
   * Pivot data so each unique legend value becomes its own numeric key
   * Example input rows: { xField: '2024', legendField: 'Asia', yField: 100 }
   * After pivot (legendField='region'): [{ xField:'2024', Asia:100, Europe:50 }]
   * ------------------------------------------------------------------ */
  const pivotDataByLegend = (
    rows: any[],
    xKey: string,
    yKey: string,
    legendKey: string
  ): { pivoted: any[]; uniqueValues: string[]; actualXKey: string } => {
    if (!rows || rows.length === 0) return { pivoted: [], uniqueValues: [], actualXKey: xKey };

    // Case-insensitive matching of provided keys to actual row keys
    const sampleRow = rows[0] || {};
    const actualXKey = Object.keys(sampleRow).find(k => k.toLowerCase() === xKey.toLowerCase()) || xKey;
    const actualYKey = Object.keys(sampleRow).find(k => k.toLowerCase() === yKey.toLowerCase()) || yKey;
    const actualLegendKey = Object.keys(sampleRow).find(k => k.toLowerCase() === legendKey.toLowerCase()) || legendKey;

    // Collect unique legend values preserving insertion order
    const uniqueValues: string[] = [];

    // Map from x value to aggregated object
    const map = new Map<string, any>();

    rows.forEach((row) => {
      // Resolve X value with multiple fallbacks so original data labels are preserved
      let xVal = row[actualXKey];
      if (xVal === undefined) {
        xVal =
          row.x ??
          row.name ??
          row.category ??
          row.Year ??
          row.year;
      }
      // If no valid X value is found, skip this row to prevent accidental
      // replacement of the X-axis label with a Y-axis value.
      if (xVal === undefined) return;

      // Coerce numeric strings back to numbers so axis labels keep original type
      if (typeof xVal === 'string' && xVal.trim() !== '' && !isNaN(Number(xVal))) {
        xVal = Number(xVal);
      }

      // Resolve legend and Y values with generic fallbacks
      let legendVal = row[actualLegendKey];
      if (legendVal === undefined) {
        const fallbackLegendKey = Object.keys(row).find(k => k !== actualXKey && k !== actualYKey);
        legendVal = row[legendKey] ?? row.legend ?? row.series ?? row.group ?? (fallbackLegendKey ? row[fallbackLegendKey] : undefined);
      }

      let rawY = row[actualYKey];
      if (rawY === undefined) {
        const fallbackYKey = Object.keys(row).find(k => k !== actualXKey && k !== actualLegendKey);
        rawY = row.y ?? row.value ?? row.Volume ?? row.volume ?? (fallbackYKey ? row[fallbackYKey] : undefined);
      }

      const yVal = typeof rawY === 'number' ? rawY : Number(String(rawY).replace(/,/g, ''));
      if (legendVal !== undefined && !uniqueValues.includes(String(legendVal))) uniqueValues.push(String(legendVal));

      // Use stringified key to preserve original order and ensure exact matches
      const key = String(xVal);
      const existing = map.get(key) || { [actualXKey]: xVal };

      // Safeguard: If legend value happens to match the X-axis key name,
      // store the legend series under a suffixed key to avoid overwriting
      // the actual X value.
      const legendKeyName = String(legendVal) === actualXKey ? `${legendVal}_series` : legendVal;
      existing[legendKeyName] = yVal;
      // Ensure the original X value is always retained
      existing[actualXKey] = xVal;
      map.set(key, existing);
    });

    const pivotedArray = Array.from(map.values()).sort((a, b) => {
      const aVal = a[actualXKey];
      const bVal = b[actualXKey];
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return aVal - bVal;
      }
      return String(aVal).localeCompare(String(bVal));
    });

    return { pivoted: pivotedArray, uniqueValues, actualXKey };
  };

  // Memoized pivoted data for charts with legend field
  const { pivoted: pivotedLineData, uniqueValues: legendValues, actualXKey: pivotActualXKey } = useMemo(() => {
    if ((type === 'line_chart' || type === 'bar_chart' || type === 'stacked_bar_chart' || type === 'area_chart' || type === 'scatter_chart') && legendField && xField && yField) {
      // Check if data is already pivoted (has multiple numeric columns beyond
      // the designated x, y, and legend fields)
      const firstRow = chartDataForRendering[0];
      const numericColumns = firstRow
        ? Object.keys(firstRow).filter(key => {
            const lower = key.toLowerCase();
            if (lower === xField.toLowerCase()) return false;
            if (lower === yField.toLowerCase()) return false;
            if (lower === legendField.toLowerCase()) return false;
            return typeof firstRow[key] === 'number';
          })
        : [];
      const isDataAlreadyPivoted = numericColumns.length > 1;

      if (isDataAlreadyPivoted) {
        // Data is already pivoted, extract legend values from column names
        const legendColumns = Object.keys(firstRow).filter(key => {
          // Filter out X-axis field (case-insensitive)
          const isXAxisField = key.toLowerCase() === xField.toLowerCase() ||
                              key.toLowerCase() === yField.toLowerCase() ||
                              key.toLowerCase() === 'year' ||
                              key.toLowerCase() === 'date' ||
                              key.toLowerCase() === 'category' ||
                              key.toLowerCase() === 'label';

          // Only include numeric fields that are NOT X-axis fields
          return !isXAxisField && typeof firstRow[key] === 'number';
        });

        const actualXKey =
          Object.keys(firstRow).find(k => k.toLowerCase() === xField.toLowerCase()) ||
          Object.keys(firstRow).find(k => !legendColumns.includes(k)) ||
          Object.keys(firstRow)[0];

        let pivotedData = chartDataForRendering;
        
        // Apply sorting to pivoted data if sortOrder is set
        if (sortOrder && sortColumn && pivotedData.length > 0) {
          let sortKey = sortColumn;
          
          // Case-insensitive key matching
          if (pivotedData[0]) {
            const dataKeys = Object.keys(pivotedData[0]);
            const matchedKey = dataKeys.find(k => k.toLowerCase() === sortKey.toLowerCase());
            if (matchedKey) {
              sortKey = matchedKey;
            }
          }
          
          if (pivotedData[0] && pivotedData[0][sortKey] !== undefined) {
            pivotedData = sortData(pivotedData, sortOrder, sortKey);
          }
        }

        return {
          pivoted: pivotedData,
          uniqueValues: legendColumns,
          actualXKey
        };
      }
      // Data needs pivoting, use the existing function
      let pivotResult = pivotDataByLegend(chartDataForRendering, xField, yField, legendField);
      
      // Apply sorting to pivoted data if sortOrder is set
      if (sortOrder && sortColumn && pivotResult.pivoted.length > 0) {
        let sortKey = sortColumn;
        
        // Case-insensitive key matching
        if (pivotResult.pivoted[0]) {
          const dataKeys = Object.keys(pivotResult.pivoted[0]);
          const matchedKey = dataKeys.find(k => k.toLowerCase() === sortKey.toLowerCase());
          if (matchedKey) {
            sortKey = matchedKey;
          }
        }
        
        if (pivotResult.pivoted[0] && pivotResult.pivoted[0][sortKey] !== undefined) {
          const sortedPivoted = sortData(pivotResult.pivoted, sortOrder, sortKey);
          return {
            ...pivotResult,
            pivoted: sortedPivoted
          };
        }
      }
      
      return pivotResult;
    }
    return { pivoted: [], uniqueValues: [], actualXKey: xField };
  }, [type, chartDataForRendering, xField, yField, legendField, sortOrder, sortColumn]);

  // Styling for axis ticks & labels
  const axisTickStyle = { fontFamily: FONT_FAMILY, fontSize: 12, fill: '#475569' } as const;
  const xAxisTickStyle = { fontFamily: FONT_FAMILY, fontSize: 12, fill: '#475569', angle: -45, textAnchor: 'end' } as const;
  
  // Custom tick formatter for X-axis to show full value
  const xAxisTickFormatter = (value: any) => {
    const strValue = String(value);
    return strValue.length > 15 ? strValue.substring(0, 15) + '...' : strValue;
  };
  const axisLabelStyle = {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: 'bold',
    fill: '#334155',
    textAnchor: 'middle'
  } as const;
  
  // Y-axis label style with reduced spacing from axis
  const effectiveYAxisLabelStyle = {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: 'bold',
    fill: '#334155',
    textAnchor: 'middle',
  } as const;
  
  // X-axis label style with increased spacing from axis
  const effectiveXAxisLabelStyle = {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: 'bold',
    fill: '#334155',
    textAnchor: 'middle',
  } as const;

  // Handle right-click context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });

    setShowContextMenu(true);
    setShowColorSubmenu(false); // Always close submenu when opening main menu
    setShowSortSubmenu(false);
    setShowAxisLabelSubmenu(false);
  };

  // Handle theme change
  const handleThemeChange = (themeName: string) => {
    // Always update the internal theme when a theme change is requested
    // This allows dynamic theme changes even when a prop theme is provided
    setSelectedTheme(themeName);
    
    // Close the menus
    setShowContextMenu(false);
    setShowColorSubmenu(false);
    
    // Call the callback if provided
    if (onThemeChange) {
      onThemeChange(themeName);
    }
  };

  // Handle color theme submenu toggle
  const handleColorThemeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setColorSubmenuPos({ x: rect.right + 4, y: rect.top });
    setShowColorSubmenu(prevState => !prevState);
    setShowSortSubmenu(false);
    setShowAxisLabelSubmenu(false);
  };

  // Handle sort submenu toggle
  const handleSortClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setSortSubmenuPos({ x: rect.right + 4, y: rect.top });
    setShowSortSubmenu(prev => !prev);
    setShowColorSubmenu(false);
    setShowChartTypeSubmenu(false);
    setShowAxisLabelSubmenu(false);
  };

  // Handle chart type submenu toggle
  const handleChartTypeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setChartTypeSubmenuPos({ x: rect.right + 4, y: rect.top });
    setShowChartTypeSubmenu(prev => !prev);
    setShowColorSubmenu(false);
    setShowSortSubmenu(false);
    setShowAxisLabelSubmenu(false);
  };

  // Apply selected sort order
  const handleSortChange = (order: 'asc' | 'desc' | null) => {
    if (onSortChange) {
      onSortChange(order);
    }
    setShowContextMenu(false);
    setShowSortSubmenu(false);
  };

  // Handle chart type change
  const handleChartTypeChange = (newType: 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart' | 'stacked_bar_chart') => {
    if (onChartTypeChange) {
      onChartTypeChange(newType);
    }
    setShowContextMenu(false);
    setShowChartTypeSubmenu(false);
  };

  // Handle grid toggle
  const handleGridToggle = () => {
    const newGridState = !showGrid;
    setShowGrid(newGridState);
    setShowContextMenu(false);
    setShowColorSubmenu(false);
    if (onGridToggle) {
      onGridToggle(newGridState);
    }
  };

  // Handle legend toggle
  const handleLegendToggle = () => {
    const newLegendState = !showLegend;
    setShowLegend(newLegendState);
    setShowContextMenu(false);
    setShowColorSubmenu(false);
    if (onLegendToggle) {
      onLegendToggle(newLegendState);
    }
  };

  // Handle axis labels toggle
  // const handleAxisLabelsToggle = () => {
  //   const newAxisLabelsState = !showAxisLabels;
  //   setShowAxisLabels(newAxisLabelsState);
  //   setShowXAxisLabels(newAxisLabelsState);
  //   setShowYAxisLabels(newAxisLabelsState);
  //   setShowContextMenu(false);
  //   setShowColorSubmenu(false);
  //   if (onAxisLabelsToggle) {
  //     onAxisLabelsToggle(newAxisLabelsState);
  //   }
  // };

  // Handle X-axis labels toggle
  const handleXAxisLabelsToggle = () => {
    const newXAxisLabelsState = !showXAxisLabels;
    setShowXAxisLabels(newXAxisLabelsState);
    setShowContextMenu(false);
    setShowColorSubmenu(false);
    if (onXAxisLabelsToggle) {
      onXAxisLabelsToggle(newXAxisLabelsState);
    }
  };

  // Handle Y-axis labels toggle
  const handleYAxisLabelsToggle = () => {
    const newYAxisLabelsState = !showYAxisLabels;
    setShowYAxisLabels(newYAxisLabelsState);
    setShowContextMenu(false);
    setShowColorSubmenu(false);
    if (onYAxisLabelsToggle) {
      onYAxisLabelsToggle(newYAxisLabelsState);
    }
  };

  // Handle data labels toggle
  const handleDataLabelsToggle = () => {
    const newDataLabelsState = !currentShowDataLabels;
    setShowDataLabels(newDataLabelsState);
    setShowContextMenu(false);
    setShowColorSubmenu(false);
    if (onDataLabelsToggle) {
      onDataLabelsToggle(newDataLabelsState);
    }
  };

  // Handle save action
  const handleSave = () => {
    setShowContextMenu(false);
    setShowColorSubmenu(false);
    if (onSave) {
      onSave();
    }
  };












  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      // Check if the click is outside all menus
      const target = e.target as Element;
      const isOutsideMainMenu = !target.closest('.context-menu');
      const isOutsideColorSubmenu = !target.closest('.color-submenu');
      const isOutsideSortSubmenu = !target.closest('.sort-submenu');
      const isOutsideChartTypeSubmenu = !target.closest('.chart-type-submenu');
      const isOutsideAxisLabelSubmenu = !target.closest('.axis-label-submenu');
      const isOutsideAxisToggleSubmenu = !target.closest('.axis-toggle-submenu');

      // Only close menus if click is outside ALL active menus
      if (isOutsideMainMenu && isOutsideColorSubmenu && isOutsideSortSubmenu && isOutsideChartTypeSubmenu && isOutsideAxisLabelSubmenu && isOutsideAxisToggleSubmenu) {
        // Add a small delay to ensure button clicks are processed first
        setTimeout(() => {
          setShowContextMenu(false);
          setShowColorSubmenu(false);
          setShowSortSubmenu(false);
          setShowChartTypeSubmenu(false);
          setShowAxisLabelSubmenu(false);
          setShowAxisToggleSubmenu(false);
        }, 50);
      }
    };

    if (showContextMenu || showColorSubmenu || showSortSubmenu || showChartTypeSubmenu || showAxisLabelSubmenu || showAxisToggleSubmenu) {
      // Use a longer delay to allow submenu to open properly
      const timeoutId = setTimeout(() => {
        document.addEventListener('click', handleClickOutside, false);
      }, 200);
      
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('click', handleClickOutside, false);
      };
    }
  }, [showContextMenu, showColorSubmenu, showSortSubmenu, showChartTypeSubmenu, showAxisLabelSubmenu, showAxisToggleSubmenu]);

  // Context menu component
  const ContextMenu = () => {
    if (!showContextMenu) return null;

    const menu = (
      <div
        className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg py-2 min-w-48 context-menu"
        style={{
          left: contextMenuPosition.x,
          top: contextMenuPosition.y,
          pointerEvents: 'auto'
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
      >
        {/* Color Theme Option */}
        <button
          className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3 text-gray-700 relative"
          onClick={handleColorThemeClick}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z" />
          </svg>
          <span>Color Theme</span>
          <svg className="w-4 h-4 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Chart Type Option */}
        <button
          className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3 text-gray-700 relative"
          onClick={handleChartTypeClick}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span>Chart Type</span>
          <svg className="w-4 h-4 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Sort Option */}
        <button
          className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3 text-gray-700 relative"
          onClick={handleSortClick}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9l6-6 6 6M18 15l-6 6-6-6" />
          </svg>
          <span>Sort</span>
          <svg className="w-4 h-4 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Grid Toggle */}
        <button
          className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3 text-gray-700"
          onClick={handleGridToggle}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          <span>Grid</span>
          <div className="ml-auto">
            <div className={`w-4 h-3 rounded border ${showGrid ? 'bg-blue-500 border-blue-500' : 'bg-gray-200 border-gray-300'}`}>
              {showGrid && (
                <svg className="w-4 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          </div>
        </button>

        {/* Axis Labels Toggle */}
        <button
          className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3 text-gray-700 relative"
          onClick={handleAxisToggleClick}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
          <span>Axis Labels</span>
          <svg className="w-4 h-4 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Separator */}
        <div className="border-t border-gray-200 my-1"></div>

        {/* Edit Labels */}
        <button
          className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3 text-gray-700"
          onClick={handleAxisLabelClick}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          <span>Edit Labels</span>
          <svg className="w-3 h-3 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Data Labels Toggle */}
        <button
          className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3 text-gray-700"
          onClick={handleDataLabelsToggle}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Data Labels</span>
          <div className="ml-auto">
            <div className={`w-4 h-3 rounded border ${currentShowDataLabels ? 'bg-blue-500 border-blue-500' : 'bg-gray-200 border-gray-300'}`}>
              {currentShowDataLabels && (
                <svg className="w-4 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          </div>
        </button>

        {/* Legend Toggle */}
        <button
          className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3 text-gray-700"
          onClick={handleLegendToggle}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
          </svg>
          <span>Legend</span>
          <div className="ml-auto">
            <div className={`w-4 h-3 rounded border ${showLegend ? 'bg-blue-500 border-blue-500' : 'bg-gray-200 border-gray-300'}`}>
              {showLegend && (
                <svg className="w-4 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          </div>
        </button>

        {/* Save Action */}
        {/* <button
          className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3 text-gray-700"
          onClick={handleSave}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
          <span>Save</span>
        </button> */}
      </div>
    );

    return createPortal(menu, document.body);
  };

  // Color theme submenu component
  const ColorThemeSubmenu = () => {
    if (!showColorSubmenu) return null;

    const submenu = (
      <div
        className="fixed z-[9999] bg-white border border-gray-300 rounded-lg shadow-xl p-3 color-submenu"
        style={{
          left: colorSubmenuPos.x,
          top: colorSubmenuPos.y,
          minWidth: '240px',
          maxHeight: '320px',
          overflowY: 'auto'
        }}
      >
        <div className="px-2 py-2 text-sm font-semibold text-gray-700 border-b border-gray-200 mb-3">
          Color Theme
        </div>
        
        <div className="grid grid-cols-6 gap-2">
          {Object.entries(COLOR_THEMES).map(([themeKey, theme]) => (
            <button
              key={themeKey}
              className={`w-8 h-8 rounded-lg border-2 transition-all duration-200 hover:scale-110 hover:shadow-lg ${
                currentTheme === themeKey 
                  ? 'border-blue-500 shadow-lg ring-2 ring-blue-200 ring-opacity-50' 
                  : 'border-gray-300 hover:border-gray-400 hover:shadow-md'
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleThemeChange(themeKey);
              }}
              title={theme.name}
              style={{
                background: `linear-gradient(135deg, ${theme.primary} 0%, ${theme.secondary} 50%, ${theme.tertiary} 100%)`,
                cursor: 'pointer'
              }}
            >
              {currentTheme === themeKey && (
                <div className="w-full h-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white drop-shadow-lg" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
        <div className="mt-3 pt-2 border-t border-gray-200">
          <div className="text-xs text-gray-500 px-2">
            Click any color to apply the theme to your chart
          </div>
        </div>
      </div>
    );

    return createPortal(submenu, document.body);
  };

  // Sort submenu component
  const SortSubmenu = () => {
    if (!showSortSubmenu) return null;

    // Get columns that are actually used in the graph (exclude pivoted legend values)
    const getUsedColumns = () => {
      const usedColumns = new Set<string>();
      
      // Add X-axis field from chart configuration
      if (xField) {
        usedColumns.add(xField);
      }
      
      // Add Y-axis field(s) from chart configuration
      if (yField) {
        usedColumns.add(yField);
      }
      if (yFields && yFields.length > 0) {
        yFields.forEach(field => {
          usedColumns.add(field);
        });
      }
      
      // Add legend field from chart configuration (original column, not pivoted values)
      if (legendField) {
        usedColumns.add(legendField);
      }
      
      return Array.from(usedColumns);
    };

    const usedColumns = getUsedColumns();

    const submenu = (
      <div
        className="fixed z-[9999] bg-white border border-gray-300 rounded-lg shadow-xl p-2 sort-submenu"
        style={{
          left: sortSubmenuPos.x,
          top: sortSubmenuPos.y,
          minWidth: '200px'
        }}
      >
        <div className="px-2 py-2 text-sm font-semibold text-gray-700 border-b border-gray-200 mb-2">
          Sort
        </div>
        <div className="flex flex-col">
          {/* Column Selection - Show as clickable options */}
          <div className="px-2 py-2 border-b border-gray-100">
            <div className="text-xs text-gray-500 mb-2">Sort by column:</div>
            <div className="space-y-1">
              {usedColumns.map((column) => (
                <button
                  key={column}
                  className={`w-full px-3 py-1 text-sm text-left hover:bg-gray-50 flex items-center gap-2 rounded ${
                    sortColumn === column ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setSortColumn(column);
                    // If no sort order is set yet, default to ascending
                    if (!sortOrder) {
                      handleSortChange('asc');
                    }
                  }}
                >
                  {sortColumn === column && (
                    <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                  <span>{column}</span>
                </button>
              ))}
            </div>
          </div>
          
          <button
            className="px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2"
            onMouseDown={(e) => {
              e.preventDefault();
              handleSortChange(null);
            }}
          >
            {(!sortOrder || sortOrder === null) && (
              <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
            <span>Clear Sort</span>
          </button>
          <button
            className="px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2"
            onMouseDown={(e) => {
              e.preventDefault();
              // If no column is selected, use the first available column
              if (!sortColumn && usedColumns.length > 0) {
                setSortColumn(usedColumns[0]);
              }
              handleSortChange('asc');
            }}
          >
            {sortOrder === 'asc' && (
              <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
            <span>Ascending</span>
          </button>
          <button
            className="px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2"
            onMouseDown={(e) => {
              e.preventDefault();
              // If no column is selected, use the first available column
              if (!sortColumn && usedColumns.length > 0) {
                setSortColumn(usedColumns[0]);
              }
              handleSortChange('desc');
            }}
          >
            {sortOrder === 'desc' && (
              <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            )}
            <span>Descending</span>
          </button>
        </div>
      </div>
    );

    return createPortal(submenu, document.body);
  };





  // Chart type submenu component
  const ChartTypeSubmenu = () => {
    if (!showChartTypeSubmenu) return null;

    const chartTypes = [
      { 
        key: 'pie_chart', 
        label: 'Pie Chart', 
        icon: (
          <svg className="w-5 h-5 text-gray-800" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.94-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
          </svg>
        )
      },
      { 
        key: 'bar_chart', 
        label: 'Bar Chart', 
        icon: (
          <svg className="w-5 h-5 text-gray-800" fill="currentColor" viewBox="0 0 24 24">
            <path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z"/>
            <path d="M4 21h16v1H4z"/>
          </svg>
        )
      },
      // Stacked Bar Chart - only show when legendField exists
      ...(legendField && legendValues.length > 0 ? [{
        key: 'stacked_bar_chart' as const,
        label: 'Stacked Bar Chart',
        icon: (
          <svg className="w-5 h-5 text-gray-800" fill="currentColor" viewBox="0 0 24 24">
            <path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z"/>
            <path d="M4 21h16v1H4z"/>
          </svg>
        )
      }] : []),
      { 
        key: 'line_chart', 
        label: 'Line Chart', 
        icon: (
          <svg className="w-5 h-5 text-gray-800" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z"/>
          </svg>
        )
      },
      { 
        key: 'area_chart', 
        label: 'Area Chart', 
        icon: (
          <svg className="w-5 h-5 text-gray-800" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
          </svg>
        )
      },
      { 
        key: 'scatter_chart', 
        label: 'Scatter Chart', 
        icon: (
          <svg className="w-5 h-5 text-gray-800" fill="currentColor" viewBox="0 0 24 24">
            <circle cx="7" cy="14" r="2"/>
            <circle cx="11" cy="6" r="2"/>
            <circle cx="16" cy="8" r="2"/>
            <circle cx="16" cy="18" r="2"/>
            <circle cx="19" cy="12" r="2"/>
          </svg>
        )
      }
    ];

    const submenu = (
      <div
        className="fixed z-[9999] bg-white border border-gray-300 rounded-lg shadow-xl p-2 chart-type-submenu"
        style={{
          left: chartTypeSubmenuPos.x,
          top: chartTypeSubmenuPos.y,
          minWidth: '180px'
        }}
      >
        <div className="px-2 py-2 text-sm font-semibold text-gray-700 border-b border-gray-200 mb-2">
          Chart Type
        </div>
        <div className="flex flex-col">
          {chartTypes.map((chartType) => (
            <button
              key={chartType.key}
              className="px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2"
              onMouseDown={(e) => {
                e.preventDefault();
                handleChartTypeChange(chartType.key as 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart' | 'stacked_bar_chart');
              }}
            >
              {type === chartType.key && (
                <svg className="w-4 h-4 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
              <span className="mr-2">{chartType.icon}</span>
              <span>{chartType.label}</span>
            </button>
          ))}
        </div>
      </div>
    );

    return createPortal(submenu, document.body);
  };

  // Axis Label Submenu component - completely isolated
  const AxisLabelSubmenu = () => {
    if (!showAxisLabelSubmenu) return null;

    return createPortal(
      <AxisLabelEditor
        xAxisLabel={xAxisLabel}
        yAxisLabel={yAxisLabel}
        customXAxisLabel={customXAxisLabel}
        customYAxisLabel={customYAxisLabel}
        title={title}
        customTitle={customTitle}
        position={axisLabelSubmenuPos}
        onSave={(x, y, t) => {
          setCustomXAxisLabel(x);
          setCustomYAxisLabel(y);
          setCustomTitle(t);
          setShowAxisLabelSubmenu(false);
        }}
        onCancel={() => {
          setShowAxisLabelSubmenu(false);
        }}
      />,
      document.body
    );
  };

  // Axis Toggle Submenu component
  const AxisToggleSubmenu = () => {
    if (!showAxisToggleSubmenu) return null;

    const submenu = (
      <div
        className="fixed z-[9999] bg-white border border-gray-300 rounded-lg shadow-xl p-2 axis-toggle-submenu"
        style={{
          left: axisToggleSubmenuPos.x,
          top: axisToggleSubmenuPos.y,
          minWidth: '200px'
        }}
      >
        <div className="px-2 py-2 text-sm font-semibold text-gray-700 border-b border-gray-200 mb-2">
          Axis Labels
        </div>
        <div className="flex flex-col">
          {/* X-Axis Toggle */}
          <button
            className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3 text-gray-700"
            onClick={handleXAxisLabelsToggle}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            <span>X-Axis</span>
            <div className="ml-auto">
              <div className={`w-4 h-3 rounded border ${showXAxisLabels ? 'bg-blue-500 border-blue-500' : 'bg-gray-200 border-gray-300'}`}>
                {showXAxisLabels && (
                  <svg className="w-4 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </div>
          </button>

          {/* Y-Axis Toggle */}
          <button
            className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3 text-gray-700"
            onClick={handleYAxisLabelsToggle}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            <span>Y-Axis</span>
            <div className="ml-auto">
              <div className={`w-4 h-3 rounded border ${showYAxisLabels ? 'bg-blue-500 border-blue-500' : 'bg-gray-200 border-gray-300'}`}>
                {showYAxisLabels && (
                  <svg className="w-4 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
            </div>
          </button>
        </div>
      </div>
    );

    return createPortal(submenu, document.body);
  };

  const renderChart = () => {
    // Check if data is empty or invalid (skip check for multi-pie structure)
    if (!chartDataForRendering || chartDataForRendering.length === 0 || !Array.isArray(chartDataForRendering)) {
      if (!(type === 'pie_chart' && legendField && data && !Array.isArray(data))) {
        return (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <div className="text-lg font-medium">No Data Available</div>
              <div className="text-sm">No data matches the current filter criteria</div>
            </div>
          </div>
        );
      }
    }
    
    // Debug: Show what data is being used for rendering
    
    // Check if required fields are provided
    if (!xField && !yField) {
      return (
        <div className="flex items-center justify-center h-full text-gray-500">
          <div className="text-center">
            <div className="text-lg font-medium">Chart Configuration Required</div>
            <div className="text-sm">Please select X and Y axes to generate chart</div>
          </div>
        </div>
      );
    }
    
    // Resolve current color scheme and palette based on selected theme
    const theme = COLOR_THEMES[currentTheme as keyof typeof COLOR_THEMES] || COLOR_THEMES.default;
    const scheme = theme; // alias for readability
    const palette = (theme.palette && theme.palette.length > 0) ? theme.palette : DEFAULT_COLORS;
    

    
    // Determine the data keys based on the data structure
    const firstItem = chartDataForRendering[0];
    let xKey = xField;
    let yKey = yField;
    let yKeys: string[] = yFields || [];
    

    // Auto-detect keys based on data structure and chart type
    if (!xKey || !yKey) {
      if (firstItem) {
        const availableKeys = Object.keys(firstItem);
        
        if (type === 'pie_chart') {
          xKey = availableKeys.includes('name') ? 'name' : availableKeys.includes('label') ? 'label' : availableKeys[0];
          yKey = availableKeys.includes('value') ? 'value' : availableKeys[1] || availableKeys[0];
        } else if (type === 'bar_chart' || type === 'stacked_bar_chart') {
          // For bar charts, prioritize actual field names over generic keys
          xKey = xField || (availableKeys.includes('x') ? 'x' : availableKeys.includes('name') ? 'name' : availableKeys.includes('category') ? 'category' : availableKeys[0]);
          yKey = yField || (availableKeys.includes('y') ? 'y' : availableKeys.includes('value') ? 'value' : availableKeys[1] || availableKeys[0]);
    } else if (type === 'line_chart' || type === 'area_chart' || type === 'scatter_chart') {
          // CRITICAL FIX: Use case-insensitive matching to find actual field names first
          if (xField) {
            const matchedXKey = availableKeys.find(k => k.toLowerCase() === xField.toLowerCase());
            xKey = matchedXKey || (availableKeys.includes('x') ? 'x' : availableKeys.find(k => k.toLowerCase() === 'date') || availableKeys[0]);
          } else {
            xKey = availableKeys.includes('x') ? 'x' : availableKeys.find(k => k.toLowerCase() === 'date') || availableKeys[0];
          }
          if (yField) {
            const matchedYKey = availableKeys.find(k => k.toLowerCase() === yField.toLowerCase());
            yKey = matchedYKey || (availableKeys.includes('y') ? 'y' : availableKeys.includes('value') ? 'value' : availableKeys[1] || availableKeys[0]);
          } else {
            yKey = availableKeys.includes('y') ? 'y' : availableKeys.includes('value') ? 'value' : availableKeys[1] || availableKeys[0];
          }
        }
        
      }
    } else {
      // If xKey and yKey are provided but don't exist in the data, try to auto-detect
      // CRITICAL FIX: Use case-insensitive matching to check if keys exist
      if (firstItem) {
        const availableKeys = Object.keys(firstItem);
        const xKeyExists = xKey && availableKeys.some(k => k.toLowerCase() === xKey.toLowerCase());
        const yKeyExists = yKey && availableKeys.some(k => k.toLowerCase() === yKey.toLowerCase());
        
        if (!xKeyExists || !yKeyExists) {
          if (type === 'pie_chart') {
            xKey = availableKeys.includes('name') ? 'name' : availableKeys.includes('label') ? 'label' : availableKeys[0];
            yKey = availableKeys.includes('value') ? 'value' : availableKeys[1] || availableKeys[0];
          } else if (type === 'bar_chart' || type === 'stacked_bar_chart') {
            xKey = xField || (availableKeys.includes('x') ? 'x' : availableKeys.includes('name') ? 'name' : availableKeys.includes('category') ? 'category' : availableKeys[0]);
            yKey = yField || (availableKeys.includes('y') ? 'y' : availableKeys.includes('value') ? 'value' : availableKeys[1] || availableKeys[0]);
          } else if (type === 'line_chart' || type === 'area_chart' || type === 'scatter_chart') {
            // CRITICAL FIX: For line/area/scatter, prioritize actual field names with case-insensitive matching
            if (xField) {
              const matchedXKey = availableKeys.find(k => k.toLowerCase() === xField.toLowerCase());
              xKey = matchedXKey || (availableKeys.includes('x') ? 'x' : availableKeys.find(k => k.toLowerCase() === 'date') || availableKeys[0]);
            } else {
              xKey = availableKeys.includes('x') ? 'x' : availableKeys.find(k => k.toLowerCase() === 'date') || availableKeys[0];
            }
            if (yField) {
              const matchedYKey = availableKeys.find(k => k.toLowerCase() === yField.toLowerCase());
              yKey = matchedYKey || (availableKeys.includes('y') ? 'y' : availableKeys.includes('value') ? 'value' : availableKeys[1] || availableKeys[0]);
            } else {
              yKey = availableKeys.includes('y') ? 'y' : availableKeys.includes('value') ? 'value' : availableKeys[1] || availableKeys[0];
            }
          }
        }
      }
    }
    
    // Determine which Y-axis fields to use. Only include a secondary axis when explicitly configured.
    if (yKeys.length === 0) {
      if (yFields && yFields.length > 0) {
        // Use provided fields (may include multiple for dual axes)
        yKeys = yFields;
      } else if (yField) {
        // Single field explicitly specified – use it as the only Y axis
        yKeys = [yField];
      } else if (firstItem) {
        // Fallback: auto-detect the first numeric field for a single Y axis
        const availableKeys = Object.keys(firstItem);
        const numericKeys = availableKeys.filter(key =>
          key !== xKey &&
          key !== 'category' &&
          key !== 'label' &&
          typeof firstItem[key] === 'number' &&
          !isNaN(firstItem[key])
        );
        if (numericKeys.length > 0) {
          yKeys = [numericKeys[0]];
        }
      }
      if (!yKey && yKeys.length > 0) {
        yKey = yKeys[0];
      }
    }
    
    

    

    
    // If we have yFields but the data only has 'x' and 'y' keys, we need to transform the data
    if (yFields && yFields.length > 1 && firstItem && firstItem.x !== undefined && firstItem.y !== undefined && Array.isArray(chartDataForRendering)) {
      // Transform data to use actual field names instead of generic x/y
      const transformedData = chartDataForRendering.map((item: any, index: number) => {
        const transformed: any = {};
        
        // Keep the x-axis data
        transformed[xKey] = item.x;
        
        // Map y-axis data to actual field names
        if (yFields && yFields.length > 0) {
          // For dual Y-axes, we need to create separate data points for each Y-axis
          // Since the backend only provides one 'y' value, we'll use it for both axes
          // but with different scaling to simulate dual Y-axes
          transformed[yFields[0]] = item.y;
          
          // For the second Y-axis, we'll use a scaled version of the same data
          // This is a workaround until the backend supports multiple measures
          if (yFields.length > 1) {
            // Scale the second Y-axis data differently to make it visually distinct
            const scaleFactor = 0.5; // You can adjust this to make the second axis more or less prominent
            transformed[yFields[1]] = typeof item.y === 'number' ? item.y * scaleFactor : item.y;
          }
        }
        
        // CRITICAL: Preserve the legend field if it exists (case-insensitive)
        if (legendField) {
          // First try exact match
          if (item[legendField] !== undefined) {
            transformed[legendField] = item[legendField];
          } else {
            // Then try case-insensitive match
            const keys = Object.keys(item);
            const foundKey = keys.find(key => key.toLowerCase() === legendField.toLowerCase());
            if (foundKey) {
              transformed[foundKey] = item[foundKey];
            }
          }
        }
        
        return transformed;
      });
      
      // Note: We don't reassign data anymore, chartDataForRendering handles this
      
      // Update the keys to use the actual field names
      if (yFields && yFields.length > 0) {
        yKey = yFields[0];
        yKeys = yFields;
      }
    } else if (yFields && yFields.length > 1 && firstItem) {
      // Check if the data already has the actual field names (backend supports multiple measures)
      const hasActualFieldNames = yFields.every(field => firstItem.hasOwnProperty(field));
      
      if (hasActualFieldNames) {
        // Use the actual field names directly
        yKey = yFields[0];
        yKeys = yFields;
        
        // For dual Y-axes, we need to find the x-axis key (it's usually 'x' or 'category' or the first key that's not a yField)
        if (!xKey) {
          const availableKeys = Object.keys(firstItem);
          const nonYFieldKeys = availableKeys.filter(key => !yFields.includes(key));
          xKey = nonYFieldKeys.find(key => key === 'x' || key === 'category' || key === 'label') || nonYFieldKeys[0] || 'x';
        }
      } else {
        // Fallback to the original transformation logic
        const transformedData = Array.isArray(chartDataForRendering) ? chartDataForRendering.map((item: any, index: number) => {
          const transformed: any = {};
          
          // Keep the x-axis data
          transformed[xKey] = item.x || item[Object.keys(item)[0]];
          
          // Map y-axis data to actual field names
          if (yFields && yFields.length > 0) {
            transformed[yFields[0]] = item.y || item[Object.keys(item)[1]];
            
            if (yFields.length > 1) {
              const scaleFactor = 0.5;
              transformed[yFields[1]] = typeof (item.y || item[Object.keys(item)[1]]) === 'number' 
                ? (item.y || item[Object.keys(item)[1]]) * scaleFactor 
                : (item.y || item[Object.keys(item)[1]]);
            }
          }
          
          // CRITICAL: Preserve the legend field if it exists (case-insensitive)
          if (legendField) {
            // First try exact match
            if (item[legendField] !== undefined) {
              transformed[legendField] = item[legendField];
            } else {
              // Then try case-insensitive match
              const keys = Object.keys(item);
              const foundKey = keys.find(key => key.toLowerCase() === legendField.toLowerCase());
              if (foundKey) {
                transformed[foundKey] = item[foundKey];
              }
            }
          }
          
          return transformed;
        }) : [];
        
        yKey = yFields[0];
        yKeys = yFields;
      }
    }
    
    // Final validation for dual Y-axes - ensure we have the correct keys
    if (yFields && yFields.length > 1 && yKeys.length === 0) {
      yKeys = yFields;
      yKey = yFields[0];
    }
    
    // Validate that we have valid keys before rendering
    if (!xKey || !yKey) {
      return (
        <div className="flex items-center justify-center h-full text-red-500">
          <div className="text-center">
            <div className="text-lg font-medium">Chart Rendering Error</div>
            <div className="text-sm">Invalid data keys: xKey={xKey}, yKey={yKey}</div>
          </div>
        </div>
      );
    }

    // Final validation for dual Y-axes
    const hasDualYAxes = yKeys.length > 1 || (yFields && yFields.length > 1);

    // CRITICAL FIX: Transform data for bar charts, line charts, area charts, and scatter charts when data has generic keys
    // Now also supports dual Y-axes by mapping both Y fields when available
    let transformedChartData = chartDataForRendering;
    if ((type === 'bar_chart' || type === 'stacked_bar_chart' || type === 'line_chart' || type === 'area_chart' || type === 'scatter_chart') && xField && yField && chartDataForRendering.length > 0) {
      const firstItem = chartDataForRendering[0];
      const availableKeys = Object.keys(firstItem);

      // Check if data has generic keys OR if the field names don't match what we expect
      // Use case-insensitive matching to check if actual field names exist
      const hasXField = xField && availableKeys.some(k => k.toLowerCase() === xField.toLowerCase());
      const hasYField = yField && availableKeys.some(k => k.toLowerCase() === yField.toLowerCase());
      const needsTransformation =
        availableKeys.includes('x') ||
        availableKeys.includes('y') ||
        availableKeys.includes('name') ||
        availableKeys.includes('value') ||
        (xField && !hasXField) ||
        (yField && !hasYField) ||
        (yFields && yFields.length > 1 && !yFields.every(f => availableKeys.some(k => k.toLowerCase() === f.toLowerCase())));

      if (needsTransformation) {
        transformedChartData = Array.isArray(chartDataForRendering) ? chartDataForRendering.map((item: any) => {
          const transformed: any = {};
          const availableKeys = Object.keys(item);

          // CRITICAL FIX: First check if the actual field names exist in the item (case-insensitive)
          // This ensures that when xField and yField are explicitly provided, we use them correctly
          // even when data structure changes (e.g., with single filter selection)
          const actualXKey = availableKeys.find(k => k.toLowerCase() === xField.toLowerCase()) || 
                           (item[xField] !== undefined ? xField : null);
          const actualYKey = availableKeys.find(k => k.toLowerCase() === yField.toLowerCase()) || 
                           (item[yField] !== undefined ? yField : null);

          // Map keys to actual field names for X-axis
          // Priority: actual field name > generic 'x' > other fallbacks
          if (actualXKey) {
            transformed[xField] = item[actualXKey];
          } else if (item.x !== undefined) {
            transformed[xField] = item.x;
          } else if (item.name !== undefined) {
            transformed[xField] = item.name;
          } else if (item.category !== undefined) {
            transformed[xField] = item.category;
          } else if (item.Year !== undefined) {
            transformed[xField] = item.Year;
          } else if (item.year !== undefined) {
            transformed[xField] = item.year;
          } else {
            // Last resort: use first key, but ensure it's not the yField
            const firstKey = availableKeys.find(k => k.toLowerCase() !== yField.toLowerCase()) || availableKeys[0];
            transformed[xField] = firstKey ? item[firstKey] : item[Object.keys(item)[0]];
          }

          // Map primary Y field
          // Priority: actual field name > generic 'y' > other fallbacks
          if (actualYKey) {
            transformed[yField] = item[actualYKey];
          } else if (item.y !== undefined) {
            transformed[yField] = item.y;
          } else if (item.value !== undefined) {
            transformed[yField] = item.value;
          } else if (item.Volume !== undefined) {
            transformed[yField] = item.Volume;
          } else if (item.volume !== undefined) {
            transformed[yField] = item.volume;
          } else {
            // Last resort: find a key that's not the xField
            const nonXKeys = availableKeys.filter(k => 
              k.toLowerCase() !== xField.toLowerCase() && 
              k.toLowerCase() !== 'x' && 
              k.toLowerCase() !== 'name' && 
              k.toLowerCase() !== 'category'
            );
            transformed[yField] = nonXKeys.length > 0 
              ? item[nonXKeys[0]] 
              : (availableKeys.length > 1 ? item[availableKeys[1]] : item[availableKeys[0]]);
          }

          // Map secondary Y field when present
          if (yFields && yFields.length > 1) {
            const secondField = yFields[1];
            if (item[secondField] !== undefined) {
              transformed[secondField] = item[secondField];
            } else if (item.y1 !== undefined) {
              transformed[secondField] = item.y1;
            } else if (item.y2 !== undefined) {
              transformed[secondField] = item.y2;
            } else if (item.value2 !== undefined) {
              transformed[secondField] = item.value2;
            } else {
              const otherKeys = Object.keys(item).filter(
                k => k !== 'x' && k !== 'y' && k !== xField && k !== yField
              );
              transformed[secondField] = item[otherKeys[0]];
            }
          }

          return transformed;
        }) : [];

        // CRITICAL FIX: Ensure xKey and yKey use the actual field names after transformation
        // This fixes the issue where xKey/yKey were set incorrectly before transformation
        xKey = xField;
        yKey = yField;
        if (yFields && yFields.length > 0) {
          yKey = yFields[0];
          yKeys = yFields;
        }
      }
    }

    // Calculate combined min/max for single axis mode (when forceSingleAxis is true)
    // Must be calculated after data transformation to use actual field names
    const calculateCombinedDomain = (data: any[], fields: string[]): [number, number] | undefined => {
      if (!forceSingleAxis || !fields || fields.length < 2 || !data || data.length === 0) return undefined;
      
      let min = Infinity;
      let max = -Infinity;
      
      data.forEach(item => {
        fields.forEach(field => {
          const value = item[field];
          if (typeof value === 'number' && !isNaN(value)) {
            min = Math.min(min, value);
            max = Math.max(max, value);
          }
        });
      });
      
      if (min === Infinity || max === -Infinity) return undefined;
      
      // Add small padding (5%) to the domain for better visualization
      const padding = (max - min) * 0.05;
      return [min - padding, max + padding];
    };

    // Calculate combined domain after data transformation
    const combinedDomain = calculateCombinedDomain(transformedChartData, yFields || yKeys);

    switch (type) {
      case 'bar_chart':
        
        /* -------------------------------------------------------------
         * Multi-bar rendering when a legend field is provided
         * ----------------------------------------------------------- */
        if (legendField && legendValues.length > 0 && pivotedLineData.length > 0) {
          const xKeyForBar =
            pivotActualXKey ||
            xField ||
            Object.keys(pivotedLineData[0] || {}).find(k => !legendValues.includes(k)) ||
            Object.keys(pivotedLineData[0] || {})[0];
          return (
            <BarChart data={pivotedLineData} margin={getChartMargins()}>
              {currentShowGrid && <CartesianGrid strokeDasharray="3 3" />}
              <XAxis 
                dataKey={xKeyForBar}
                type="category"
                label={currentShowXAxisLabels && effectiveXAxisLabel ? { value: capitalizeWords(effectiveXAxisLabel), position: 'bottom', style: effectiveXAxisLabelStyle, offset: 35 } : undefined}
                tick={xAxisTickStyle}
                tickLine={false}
                allowDuplicatedCategory={false}
                tickFormatter={xAxisTickFormatter}
                {...(() => {
                  const firstValue = pivotedLineData[0]?.[xKeyForBar];
                  const isNumericOrDate = typeof firstValue === 'number' || firstValue instanceof Date || !isNaN(Date.parse(firstValue));
                  return isNumericOrDate ? {} : { interval: 0, minTickGap: 0, height: 80 };
                })()}
              />
              <YAxis
                tickFormatter={formatLargeNumber}
                label={currentShowYAxisLabels && effectiveYAxisLabel ? { value: capitalizeWords(effectiveYAxisLabel), angle: -90, position: 'left', style: effectiveYAxisLabelStyle, offset: 5 } : undefined}
                tick={axisTickStyle}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="explore-chart-tooltip">
                        <p className="font-semibold text-gray-900 mb-2 text-sm">{label}</p>
                        {payload.map((entry: any, index: number) => (
                          <div key={index} className="flex items-center gap-2 mb-1">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: entry.color }}
                            />
                            <span className="text-sm font-medium text-gray-700">
                              {entry.dataKey}:
                            </span>
                            <span className="text-sm font-semibold text-gray-700">
                              {typeof entry.value === 'number' ? formatTooltipNumber(entry.value) : entry.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return null;
                }}
                cursor={{ stroke: palette[0], strokeWidth: 1, strokeOpacity: 0.4 }}
              />
              {currentShowLegend && (
                <Legend
                  layout="horizontal"
                  verticalAlign="bottom"
                  align="center"
                  wrapperStyle={{ bottom: 20, fontSize: '11px' }}
                />
              )}
              {legendValues.map((seriesKey, idx) => {
                const seriesColor = seriesSettings[seriesKey]?.color || palette[idx % palette.length];
                const seriesShowDataLabels = seriesSettings[seriesKey]?.showDataLabels !== undefined 
                  ? seriesSettings[seriesKey]?.showDataLabels 
                  : currentShowDataLabels;
                return (
                  <Bar
                    key={seriesKey}
                    dataKey={seriesKey}
                    name={seriesKey}
                    fill={seriesColor}
                    animationDuration={800}
                    animationEasing="ease-out"
                    {...(stackBars ? { stackId: "stack" } : {})}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setSelectedSeries({
                        dataKey: seriesKey,
                        name: seriesKey,
                        currentColor: seriesColor
                      });
                      setShowSeriesSettingsModal(true);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {seriesShowDataLabels && (
                      <LabelList
                        dataKey={seriesKey}
                        position="top"
                        formatter={(value) => formatLargeNumber(value)}
                        style={{ fontSize: '11px', fontWeight: '500', fill: '#374151' }}
                      />
                    )}
                  </Bar>
                );
              })}
            </BarChart>
          );
        } else {
          // ---- Fallback to original single-bar rendering ----
          return (
            <BarChart data={transformedChartData} margin={getChartMargins()}>
              {currentShowGrid && <CartesianGrid strokeDasharray="3 3" />}
            <XAxis 
              dataKey={xKey} 
                label={currentShowXAxisLabels && effectiveXAxisLabel && effectiveXAxisLabel.trim() ? { value: capitalizeWords(effectiveXAxisLabel), position: 'bottom', style: effectiveXAxisLabelStyle, offset: 35 } : undefined}
              tick={xAxisTickStyle}
              tickLine={false}
              tickFormatter={xAxisTickFormatter}
              {...(() => {
                const firstValue = transformedChartData[0]?.[xKey];
                const isNumericOrDate = typeof firstValue === 'number' || firstValue instanceof Date || !isNaN(Date.parse(firstValue));
                return isNumericOrDate ? {} : { interval: 0, minTickGap: 0, height: 80 };
              })()}
            />
            {/* Primary Y-Axis (Left) */}
            <YAxis 
              yAxisId={0}
                label={currentShowYAxisLabels && effectiveYAxisLabel && effectiveYAxisLabel.trim() ? { value: capitalizeWords(effectiveYAxisLabel), angle: -90, position: 'left', style: effectiveYAxisLabelStyle, offset: 5 } : undefined}
              tick={axisTickStyle}
              tickLine={false}
              tickFormatter={formatLargeNumber}
              {...(combinedDomain ? { domain: combinedDomain } : {})}
            />
            {/* Secondary Y-Axis (Right) - only if we have dual Y-axes */}
            {(yKeys.length > 1 || (yFields && yFields.length > 1)) && !forceSingleAxis && (
              <YAxis 
                yAxisId={1}
                orientation="right"
                  label={currentShowYAxisLabels && effectiveYAxisLabels && effectiveYAxisLabels[1] ? { value: capitalizeWords(effectiveYAxisLabels[1]), angle: 90, position: 'right', style: effectiveYAxisLabelStyle, offset: 5 } : undefined}
                tick={axisTickStyle}
                tickLine={false}
                tickFormatter={formatLargeNumber}
              />
            )}
            <Tooltip 
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="explore-chart-tooltip">
                      <p className="font-semibold text-gray-900 mb-2 text-sm">{label}</p>
                      {payload.map((entry: any, index: number) => {
                        // Use the actual Y-axis label instead of the dataKey
                        let displayName = entry.dataKey;
                        if (entry.dataKey === yKey) {
                          displayName = effectiveYAxisLabel || effectiveYAxisLabels?.[0] || 'Value';
                        } else if (entry.dataKey === yKeys[1] || entry.dataKey === yFields?.[1]) {
                          displayName = effectiveYAxisLabels?.[1] || yFields?.[1] || 'Value';
                        }
                        
                        return (
                          <div key={index} className="flex items-center gap-2 mb-1">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: entry.color }}
                            />
                            <span className="text-sm font-medium text-gray-700">
                              {displayName}: 
                            </span>
                            <span className="text-sm font-semibold text-gray-700">
                              {typeof entry.value === 'number' ? formatTooltipNumber(entry.value) : entry.value}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  );
                }
                return null;
              }}
              cursor={{ stroke: palette[0], strokeWidth: 1, strokeOpacity: 0.4 }}
            />
            {currentShowLegend && (
              <Legend
                layout="horizontal"
                verticalAlign="bottom"
                align="center"
                wrapperStyle={{ bottom: 20, fontSize: '11px' }}
                formatter={(value, entry) => {
                  // Format legend labels for dual y-axes
                  if (yFields && yFields.length > 1) {
                    const fieldIndex = entry.dataKey === yKey ? 0 : 1;
                    const fieldName = yFields[fieldIndex];
                    const label = effectiveYAxisLabels && effectiveYAxisLabels[fieldIndex] ? effectiveYAxisLabels[fieldIndex] : fieldName;
                    return capitalizeWords(label);
                  }
                  // For single Y-axis, use the actual Y-axis label instead of generic "Value"
                  if (entry.dataKey === yKey) {
                    return capitalizeWords(effectiveYAxisLabel || effectiveYAxisLabels?.[0] || 'Value');
                  }
                  return capitalizeWords(value);
                }}
              />
            )}
            <defs>
              <linearGradient id="barGradient1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={palette[0]} stopOpacity={0.9} />
                <stop offset="100%" stopColor={palette[0]} stopOpacity={0.5} />
              </linearGradient>
              <linearGradient id="barGradient2" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={palette[1]} stopOpacity={0.9} />
                <stop offset="100%" stopColor={palette[1]} stopOpacity={0.5} />
              </linearGradient>
            </defs>
            {/* Primary Bar */}
            {(() => {
              const seriesColor = seriesSettings[yKey]?.color || palette[0];
              const seriesShowDataLabels = seriesSettings[yKey]?.showDataLabels !== undefined 
                ? seriesSettings[yKey]?.showDataLabels 
                : currentShowDataLabels;
              return (
                <Bar 
                  dataKey={yKey} 
                  fill={seriesColor} 
                  animationDuration={800} 
                  animationEasing="ease-out" 
                  yAxisId={0}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setSelectedSeries({
                      dataKey: yKey,
                      name: effectiveYAxisLabel || effectiveYAxisLabels?.[0] || yKey,
                      currentColor: seriesColor
                    });
                    setShowSeriesSettingsModal(true);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {seriesShowDataLabels && (
                    <LabelList 
                      dataKey={yKey} 
                      position="top" 
                      formatter={(value) => formatLargeNumber(value)}
                      style={{ fontSize: '11px', fontWeight: '500', fill: '#374151' }}
                    />
                  )}
                </Bar>
              );
            })()}
            {/* Secondary Bar - only if we have dual Y-axes */}
            {(yKeys.length > 1 || (yFields && yFields.length > 1)) && (() => {
              const secondKey = yKeys[1] || yFields[1];
              const seriesColor = seriesSettings[secondKey]?.color || palette[1];
              const seriesShowDataLabels = seriesSettings[secondKey]?.showDataLabels !== undefined 
                ? seriesSettings[secondKey]?.showDataLabels 
                : currentShowDataLabels;
              return (
                <Bar 
                  dataKey={secondKey} 
                  fill={seriesColor} 
                  animationDuration={800} 
                  animationEasing="ease-out" 
                  yAxisId={forceSingleAxis ? 0 : 1}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setSelectedSeries({
                      dataKey: secondKey,
                      name: effectiveYAxisLabels?.[1] || yFields?.[1] || secondKey,
                      currentColor: seriesColor
                    });
                    setShowSeriesSettingsModal(true);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {seriesShowDataLabels && (
                    <LabelList 
                      dataKey={secondKey} 
                      position="top" 
                      formatter={(value) => formatLargeNumber(value)}
                      style={{ fontSize: '11px', fontWeight: '500', fill: '#374151' }}
                    />
                  )}
                </Bar>
              );
            })()}
          </BarChart>
        );
        }
        break;

      case 'stacked_bar_chart':
        /* -------------------------------------------------------------
         * Stacked bar chart rendering when a legend field is provided
         * ----------------------------------------------------------- */
        if (legendField && legendValues.length > 0 && pivotedLineData.length > 0) {
          const xKeyForBar =
            pivotActualXKey ||
            xField ||
            Object.keys(pivotedLineData[0] || {}).find(k => !legendValues.includes(k)) ||
            Object.keys(pivotedLineData[0] || {})[0];
          return (
            <BarChart data={pivotedLineData} margin={getChartMargins()}>
              {currentShowGrid && <CartesianGrid strokeDasharray="3 3" />}
              <XAxis 
                dataKey={xKeyForBar}
                type="category"
                label={currentShowXAxisLabels && effectiveXAxisLabel ? { value: capitalizeWords(effectiveXAxisLabel), position: 'bottom', style: effectiveXAxisLabelStyle, offset: 35 } : undefined}
                tick={xAxisTickStyle}
                tickLine={false}
                allowDuplicatedCategory={false}
                tickFormatter={xAxisTickFormatter}
                {...(() => {
                  const firstValue = pivotedLineData[0]?.[xKeyForBar];
                  const isNumericOrDate = typeof firstValue === 'number' || firstValue instanceof Date || !isNaN(Date.parse(firstValue));
                  return isNumericOrDate ? {} : { interval: 0, minTickGap: 0, height: 80 };
                })()}
              />
              <YAxis
                tickFormatter={formatLargeNumber}
                label={currentShowYAxisLabels && effectiveYAxisLabel ? { value: capitalizeWords(effectiveYAxisLabel), angle: -90, position: 'left', style: effectiveYAxisLabelStyle, offset: 5 } : undefined}
                tick={axisTickStyle}
                tickLine={false}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="explore-chart-tooltip">
                        <p className="font-semibold text-gray-900 mb-2 text-sm">{label}</p>
                        {payload.map((entry: any, index: number) => (
                          <div key={index} className="flex items-center gap-2 mb-1">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: entry.color }}
                            />
                            <span className="text-sm font-medium text-gray-700">
                              {entry.dataKey}:
                            </span>
                            <span className="text-sm font-semibold text-gray-700">
                              {typeof entry.value === 'number' ? formatTooltipNumber(entry.value) : entry.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return null;
                }}
                cursor={{ stroke: palette[0], strokeWidth: 1, strokeOpacity: 0.4 }}
              />
              {currentShowLegend && (
                <Legend
                  layout="horizontal"
                  verticalAlign="bottom"
                  align="center"
                  wrapperStyle={{ bottom: 20, fontSize: '11px' }}
                />
              )}
              {legendValues.map((seriesKey, idx) => {
                const seriesColor = seriesSettings[seriesKey]?.color || palette[idx % palette.length];
                const seriesShowDataLabels = seriesSettings[seriesKey]?.showDataLabels !== undefined 
                  ? seriesSettings[seriesKey]?.showDataLabels 
                  : currentShowDataLabels;
                return (
                  <Bar
                    key={seriesKey}
                    dataKey={seriesKey}
                    name={seriesKey}
                    fill={seriesColor}
                    animationDuration={800}
                    animationEasing="ease-out"
                    stackId="stack"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setSelectedSeries({
                        dataKey: seriesKey,
                        name: seriesKey,
                        currentColor: seriesColor
                      });
                      setShowSeriesSettingsModal(true);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {seriesShowDataLabels && (
                      <LabelList
                        dataKey={seriesKey}
                        position="inside"
                        formatter={(value) => formatLargeNumber(value)}
                        style={{ 
                          fontSize: '11px', 
                          fontWeight: '600', 
                          fill: '#ffffff',
                          textShadow: '0 0 3px rgba(0,0,0,0.8), 0 0 3px rgba(0,0,0,0.8)',
                          pointerEvents: 'none'
                        }}
                      />
                    )}
                  </Bar>
                );
              })}
            </BarChart>
          );
        } else {
          // Fallback: show message if no legend field
          return (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <div className="text-lg font-medium">Stacked Bar Chart Requires Segregated Field</div>
                <div className="text-sm">Please select a segregated field to use stacked bar chart</div>
              </div>
            </div>
          );
        }
        break;

      case 'line_chart':
        /* -------------------------------------------------------------
         * Multi-line rendering when a legend field is provided
         * ----------------------------------------------------------- */
        if (legendField && legendValues.length > 0 && pivotedLineData.length > 0) {
          // Use the actual X-axis key determined during pivoting
          const xKeyForLine =
            pivotActualXKey ||
            xField ||
            Object.keys(pivotedLineData[0] || {}).find(k => !legendValues.includes(k)) ||
            Object.keys(pivotedLineData[0] || {})[0];
          
          // Check if this is a date axis
          const isDateAxisMultiLine =
            xKeyForLine &&
            xKeyForLine.toLowerCase() === 'date' &&
            pivotedLineData.length > 0 &&
            typeof pivotedLineData[0][xKeyForLine] === 'number';
          const formatDateTickMultiLine = d3.timeFormat('%d-%B-%y');
          
          return (
            <LineChart data={pivotedLineData} margin={getChartMargins()}>
              {currentShowGrid && <CartesianGrid strokeDasharray="3 3" />}
              <XAxis
                dataKey={xKeyForLine}
                label={currentShowXAxisLabels && effectiveXAxisLabel ? { value: capitalizeWords(effectiveXAxisLabel), position: 'bottom', style: effectiveXAxisLabelStyle, offset: 35 } : undefined}
                tick={xAxisTickStyle}
                tickLine={false}
                allowDuplicatedCategory={false}
                tickFormatter={isDateAxisMultiLine ? (value) => formatDateTickMultiLine(new Date(value)) : xAxisTickFormatter}
                {...(() => {
                  const firstValue = pivotedLineData[0]?.[xKeyForLine];
                  const isNumericOrDate = typeof firstValue === 'number' || firstValue instanceof Date || !isNaN(Date.parse(firstValue));
                  return isNumericOrDate ? {} : { interval: 0, minTickGap: 0, height: 80 };
                })()}
              />
              <YAxis
                tickFormatter={formatLargeNumber}
                label={currentShowYAxisLabels && effectiveYAxisLabel ? { value: capitalizeWords(effectiveYAxisLabel), angle: -90, position: 'left', style: effectiveYAxisLabelStyle, offset: 5 } : undefined}
                tick={axisTickStyle}
                tickLine={false}
              />
              <Tooltip 
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="explore-chart-tooltip">
                        <p className="font-semibold text-gray-900 mb-2 text-sm">
                          {isDateAxisMultiLine ? formatDateTickMultiLine(new Date(label)) : label}
                        </p>
                        {payload.map((entry: any, index: number) => (
                          <div key={index} className="flex items-center gap-2 mb-1">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: entry.color }}
                            />
                            <span className="text-sm font-medium text-gray-700">
                              {entry.dataKey}: 
                            </span>
                            <span className="text-sm font-semibold text-gray-700">
                              {typeof entry.value === 'number' ? formatTooltipNumber(entry.value) : entry.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return null;
                }}
                cursor={{ stroke: palette[0], strokeWidth: 1, strokeOpacity: 0.4 }}
              />
              {currentShowLegend && (
                <Legend
                  layout="horizontal"
                  verticalAlign="bottom"
                  align="center"
                  wrapperStyle={{ bottom: 20, fontSize: '11px' }}
                />
              )}
              {legendValues.map((seriesKey, idx) => {
                const seriesColor = seriesSettings[seriesKey]?.color || palette[idx % palette.length];
                const seriesShowDataLabels = seriesSettings[seriesKey]?.showDataLabels !== undefined 
                  ? seriesSettings[seriesKey]?.showDataLabels 
                  : currentShowDataLabels;
                return (
                  <Line
                    key={seriesKey}
                    type="monotone"
                    dataKey={seriesKey}
                    name={seriesKey}
                    stroke={seriesColor}
                    strokeWidth={2}
                    dot={{ r: 0 }}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setSelectedSeries({
                        dataKey: seriesKey,
                        name: seriesKey,
                        currentColor: seriesColor
                      });
                      setShowSeriesSettingsModal(true);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {seriesShowDataLabels && (
                      <LabelList
                        dataKey={seriesKey}
                        position="top"
                        formatter={formatLargeNumber}
                        style={{ fontSize: '11px', fontWeight: '500', fill: '#374151' }}
                      />
                    )}
                  </Line>
                );
              })}
            </LineChart>
          );
        } else {
          // ---- Fallback to original single-line rendering ----
          // Original single line chart logic
          const isDateAxis =
            xKey &&
            xKey.toLowerCase() === 'date' &&
            chartDataForRendering.length > 0 &&
            typeof chartDataForRendering[0][xKey] === 'number';
          const formatDateTick = d3.timeFormat('%d-%B-%y');
          return (
            <LineChart data={transformedChartData} margin={getChartMargins()} className="explore-chart-line">
              {currentShowGrid && <CartesianGrid strokeDasharray="3 3" />}
              <XAxis
                dataKey={xKey}
                label={currentShowXAxisLabels && effectiveXAxisLabel && effectiveXAxisLabel.trim() ? { value: capitalizeWords(effectiveXAxisLabel), position: 'bottom', style: effectiveXAxisLabelStyle, offset: 35 } : undefined}
                tick={xAxisTickStyle}
                tickLine={false}
                tickFormatter={isDateAxis ? (value) => formatDateTick(new Date(value)) : xAxisTickFormatter}
                {...(() => {
                  const firstValue = transformedChartData[0]?.[xKey];
                  const isNumericOrDate = typeof firstValue === 'number' || firstValue instanceof Date || !isNaN(Date.parse(firstValue));
                  return isNumericOrDate ? {} : { interval: 0, minTickGap: 0, height: 80 };
                })()}
              />
              {/* Primary Y-Axis (Left) */}
              <YAxis
                yAxisId={0}
                label={currentShowYAxisLabels && effectiveYAxisLabel && effectiveYAxisLabel.trim() ? { value: capitalizeWords(effectiveYAxisLabel), angle: -90, position: 'left', style: effectiveYAxisLabelStyle, offset: 5 } : undefined}
                tick={axisTickStyle}
                tickLine={false}
                tickFormatter={formatLargeNumber}
                {...(combinedDomain ? { domain: combinedDomain } : { domain: ['dataMin', 'dataMax'] })}
              />
              {/* Secondary Y-Axis (Right) - only if we have dual Y-axes and not forcing single axis */}
              {(yKeys.length > 1 || (yFields && yFields.length > 1)) && !forceSingleAxis && (
                <YAxis
                  yAxisId={1}
                  orientation="right"
                  label={currentShowYAxisLabels && effectiveYAxisLabels && effectiveYAxisLabels[1] ? { value: capitalizeWords(effectiveYAxisLabels[1]), angle: 90, position: 'right', style: effectiveYAxisLabelStyle, offset: 5 } : undefined}
                  tick={axisTickStyle}
                  tickLine={false}
                  tickFormatter={formatLargeNumber}
                  domain={['dataMin', 'dataMax']}
                />
              )}
              <Tooltip 
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="explore-chart-tooltip">
                        <p className="font-semibold text-gray-900 mb-2 text-sm">
                          {isDateAxis ? formatDateTick(new Date(label)) : label}
                        </p>
                        {payload.map((entry: any, index: number) => {
                          // Use the actual Y-axis label instead of the dataKey
                          let displayName = entry.dataKey;
                          if (entry.dataKey === yKey) {
                            displayName = effectiveYAxisLabel || effectiveYAxisLabels?.[0] || 'Value';
                          } else if (entry.dataKey === yKeys[1] || entry.dataKey === yFields?.[1]) {
                            displayName = effectiveYAxisLabels?.[1] || yFields?.[1] || 'Value';
                          }
                          
                          return (
                            <div key={index} className="flex items-center gap-2 mb-1">
                              <div 
                                className="w-3 h-3 rounded-full" 
                                style={{ backgroundColor: entry.color }}
                              />
                              <span className="text-sm font-medium text-gray-700">
                                {displayName}: 
                              </span>
                              <span className="text-sm font-semibold text-gray-700">
                                {typeof entry.value === 'number' ? formatTooltipNumber(entry.value) : entry.value}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }
                  return null;
                }}
                cursor={{ stroke: palette[0], strokeWidth: 1, strokeOpacity: 0.4 }}
              />
              {currentShowLegend && (
                <Legend
                  layout="horizontal"
                  verticalAlign="bottom"
                  align="center"
                  wrapperStyle={{ bottom: 20, fontSize: '11px' }}
                  formatter={(value, entry) => {
                    // Format legend labels for dual y-axes
                    if (yFields && yFields.length > 1) {
                      const fieldIndex = entry.dataKey === yKey ? 0 : 1;
                      const fieldName = yFields[fieldIndex];
                      const label = effectiveYAxisLabels && effectiveYAxisLabels[fieldIndex] ? effectiveYAxisLabels[fieldIndex] : fieldName;
                      return capitalizeWords(label);
                    }
                    // For single Y-axis, use the actual Y-axis label instead of generic "Y"
                    if (entry.dataKey === yKey) {
                      return capitalizeWords(effectiveYAxisLabel || effectiveYAxisLabels?.[0] || 'Value');
                    }
                    return capitalizeWords(value);
                  }}
                />
              )}
              {/* Primary Line */}
              {(() => {
                const seriesColor = seriesSettings[yKey]?.color || palette[0];
                const seriesShowDataLabels = seriesSettings[yKey]?.showDataLabels !== undefined 
                  ? seriesSettings[yKey]?.showDataLabels 
                  : currentShowDataLabels;
                return (
                  <Line 
                    type="monotone" 
                    dataKey={yKey} 
                    stroke={seriesColor} 
                    strokeWidth={2}
                    dot={{ fill: seriesColor, strokeWidth: 0, r: 0 }}
                    activeDot={{ 
                      r: 6, 
                      fill: seriesColor, 
                      stroke: 'white', 
                      strokeWidth: 3,
                      style: { cursor: 'pointer' }
                    }}
                    yAxisId={0}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setSelectedSeries({
                        dataKey: yKey,
                        name: effectiveYAxisLabel || effectiveYAxisLabels?.[0] || yKey,
                        currentColor: seriesColor
                      });
                      setShowSeriesSettingsModal(true);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {seriesShowDataLabels && (
                      <LabelList 
                        dataKey={yKey} 
                        position="top" 
                        formatter={(value) => formatLargeNumber(value)}
                        style={{ fontSize: '11px', fontWeight: '500', fill: '#374151' }}
                        offset={10}
                      />
                    )}
                  </Line>
                );
              })()}
              {/* Secondary Line - only if we have dual Y-axes */}
              {(yKeys.length > 1 || (yFields && yFields.length > 1)) && (() => {
                const secondKey = yKeys[1] || yFields[1];
                const seriesColor = seriesSettings[secondKey]?.color || palette[1];
                const seriesShowDataLabels = seriesSettings[secondKey]?.showDataLabels !== undefined 
                  ? seriesSettings[secondKey]?.showDataLabels 
                  : currentShowDataLabels;
                return (
                  <Line 
                    type="monotone" 
                    dataKey={secondKey} 
                    stroke={seriesColor} 
                    strokeWidth={2}
                    dot={{ fill: seriesColor, strokeWidth: 0, r: 0 }}
                    activeDot={{ 
                      r: 6, 
                      fill: seriesColor, 
                      stroke: 'white', 
                      strokeWidth: 3,
                      style: { cursor: 'pointer' }
                    }}
                    yAxisId={forceSingleAxis ? 0 : 1}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setSelectedSeries({
                        dataKey: secondKey,
                        name: effectiveYAxisLabels?.[1] || yFields?.[1] || secondKey,
                        currentColor: seriesColor
                      });
                      setShowSeriesSettingsModal(true);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {seriesShowDataLabels && (
                      <LabelList 
                        dataKey={secondKey} 
                        position="top" 
                        formatter={(value) => formatLargeNumber(value)}
                        style={{ fontSize: '11px', fontWeight: '500', fill: '#374151' }}
                        offset={10}
                      />
                    )}
                  </Line>
                );
              })()}
            </LineChart>
          );
        }
        break;

      case 'area_chart':
        if (legendField && legendValues.length > 0 && pivotedLineData.length > 0) {
          const xKeyForArea =
            pivotActualXKey ||
            xField ||
            Object.keys(pivotedLineData[0] || {}).find(k => !legendValues.includes(k)) ||
            Object.keys(pivotedLineData[0] || {})[0];
          
          // Check if this is a date axis
          const isDateAxisArea =
            xKeyForArea &&
            xKeyForArea.toLowerCase() === 'date' &&
            pivotedLineData.length > 0 &&
            typeof pivotedLineData[0][xKeyForArea] === 'number';
          const formatDateTickArea = d3.timeFormat('%d-%B-%y');
          
          return (
            <AreaChart data={pivotedLineData} margin={getChartMargins()}>
              {currentShowGrid && <CartesianGrid strokeDasharray="3 3" />}
              <XAxis
                dataKey={xKeyForArea}
                label={currentShowXAxisLabels && effectiveXAxisLabel && effectiveXAxisLabel.trim() ? { value: capitalizeWords(effectiveXAxisLabel), position: 'bottom', style: effectiveXAxisLabelStyle, offset: 35 } : undefined}
                tick={xAxisTickStyle}
                tickLine={false}
                allowDuplicatedCategory={false}
                tickFormatter={isDateAxisArea ? (value) => formatDateTickArea(new Date(value)) : xAxisTickFormatter}
                {...(() => {
                  const firstValue = pivotedLineData[0]?.[xKeyForArea];
                  const isNumericOrDate = typeof firstValue === 'number' || firstValue instanceof Date || !isNaN(Date.parse(firstValue));
                  return isNumericOrDate ? {} : { interval: 0, minTickGap: 0, height: 80 };
                })()}
              />
              <YAxis
                label={currentShowYAxisLabels && effectiveYAxisLabel && effectiveYAxisLabel.trim() ? { value: capitalizeWords(effectiveYAxisLabel), angle: -90, position: 'left', style: effectiveYAxisLabelStyle, offset: 5 } : undefined}
                tick={axisTickStyle}
                tickLine={false}
                tickFormatter={formatLargeNumber}
              />
              <Tooltip 
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="explore-chart-tooltip">
                        <p className="font-semibold text-gray-900 mb-2 text-sm">
                          {isDateAxisArea ? formatDateTickArea(new Date(label)) : label}
                        </p>
                        {payload.map((entry: any, index: number) => (
                          <div key={index} className="flex items-center gap-2 mb-1">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: entry.color }}
                            />
                            <span className="text-sm font-medium text-gray-700">
                              {entry.dataKey}: 
                            </span>
                            <span className="text-sm font-semibold text-gray-700">
                              {typeof entry.value === 'number' ? formatTooltipNumber(entry.value) : entry.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  }
                  return null;
                }}
                cursor={{ stroke: palette[0], strokeWidth: 1, strokeOpacity: 0.4 }}
              />
              {currentShowLegend && (
                <Legend
                  layout="horizontal"
                  verticalAlign="bottom"
                  align="center"
                  wrapperStyle={{ bottom: 20, fontSize: '11px' }}
                />
              )}
              {legendValues.map((seriesKey, idx) => {
                const seriesColor = seriesSettings[seriesKey]?.color || palette[idx % palette.length];
                const seriesShowDataLabels = seriesSettings[seriesKey]?.showDataLabels !== undefined 
                  ? seriesSettings[seriesKey]?.showDataLabels 
                  : currentShowDataLabels;
                return (
                  <Area
                    key={seriesKey}
                    type="monotone"
                    dataKey={seriesKey}
                    name={seriesKey}
                    stroke={seriesColor}
                    fill={seriesColor}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setSelectedSeries({
                        dataKey: seriesKey,
                        name: seriesKey,
                        currentColor: seriesColor
                      });
                      setShowSeriesSettingsModal(true);
                    }}
                    style={{ cursor: 'pointer' }}
                  >
                    {seriesShowDataLabels && (
                      <LabelList
                        dataKey={seriesKey}
                        position="top"
                        formatter={formatLargeNumber}
                        style={{ fontSize: '11px', fontWeight: '500', fill: '#374151' }}
                      />
                    )}
                  </Area>
                );
              })}
            </AreaChart>
          );
        }
        return (
          <AreaChart data={transformedChartData} margin={getChartMargins()}>
            {currentShowGrid && <CartesianGrid strokeDasharray="3 3" />}
            <XAxis
              dataKey={xKey}
              label={currentShowXAxisLabels && effectiveXAxisLabel && effectiveXAxisLabel.trim() ? { value: capitalizeWords(effectiveXAxisLabel), position: 'bottom', style: axisLabelStyle } : undefined}
              tick={xAxisTickStyle}
              tickLine={false}
              tickFormatter={xAxisTickFormatter}
              {...(() => {
                const firstValue = transformedChartData[0]?.[xKey];
                const isNumericOrDate = typeof firstValue === 'number' || firstValue instanceof Date || !isNaN(Date.parse(firstValue));
                return isNumericOrDate ? {} : { interval: 0, minTickGap: 0, height: 80 };
              })()}
            />
            <YAxis
              yAxisId={0}
              label={currentShowYAxisLabels && effectiveYAxisLabel && effectiveYAxisLabel.trim() ? { value: capitalizeWords(effectiveYAxisLabel), angle: -90, position: 'left', style: axisLabelStyle } : undefined}
              tick={axisTickStyle}
              tickLine={false}
              tickFormatter={formatLargeNumber}
              {...(combinedDomain ? { domain: combinedDomain } : {})}
            />
            {(yKeys.length > 1 || (yFields && yFields.length > 1)) && !forceSingleAxis && (
              <YAxis
                yAxisId={1}
                orientation="right"
                label={currentShowYAxisLabels && effectiveYAxisLabels && effectiveYAxisLabels[1] ? { value: capitalizeWords(effectiveYAxisLabels[1]), angle: 90, position: 'right', style: effectiveYAxisLabelStyle, offset: 5 } : undefined}
                tick={axisTickStyle}
                tickLine={false}
                tickFormatter={formatLargeNumber}
              />
            )}
            <Tooltip formatter={(v: number) => formatTooltipNumber(v)} />
            {currentShowLegend && (
              <Legend
                layout="horizontal"
                verticalAlign="bottom"
                align="center"
                wrapperStyle={{ bottom: 20, fontSize: '11px' }}
              />
            )}
            {(() => {
              const seriesColor = seriesSettings[yKey]?.color || palette[0];
              const seriesShowDataLabels = seriesSettings[yKey]?.showDataLabels !== undefined 
                ? seriesSettings[yKey]?.showDataLabels 
                : currentShowDataLabels;
              return (
                <Area 
                  type="monotone" 
                  dataKey={yKey} 
                  stroke={seriesColor} 
                  fill={seriesColor} 
                  yAxisId={0}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setSelectedSeries({
                      dataKey: yKey,
                      name: effectiveYAxisLabel || effectiveYAxisLabels?.[0] || yKey,
                      currentColor: seriesColor
                    });
                    setShowSeriesSettingsModal(true);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {seriesShowDataLabels && (
                    <LabelList 
                      dataKey={yKey} 
                      position="top" 
                      formatter={(value) => formatLargeNumber(value)}
                      style={{ fontSize: '11px', fontWeight: '500', fill: '#374151' }}
                    />
                  )}
                </Area>
              );
            })()}
            {(yKeys.length > 1 || (yFields && yFields.length > 1)) && (() => {
              const secondKey = yKeys[1] || yFields[1];
              const seriesColor = seriesSettings[secondKey]?.color || palette[1];
              const seriesShowDataLabels = seriesSettings[secondKey]?.showDataLabels !== undefined 
                ? seriesSettings[secondKey]?.showDataLabels 
                : currentShowDataLabels;
              return (
                <Area 
                  type="monotone" 
                  dataKey={secondKey} 
                  stroke={seriesColor} 
                  fill={seriesColor} 
                  yAxisId={forceSingleAxis ? 0 : 1}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setSelectedSeries({
                      dataKey: secondKey,
                      name: effectiveYAxisLabels?.[1] || yFields?.[1] || secondKey,
                      currentColor: seriesColor
                    });
                    setShowSeriesSettingsModal(true);
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  {seriesShowDataLabels && (
                    <LabelList 
                      dataKey={secondKey} 
                      position="top" 
                      formatter={(value) => formatLargeNumber(value)}
                      style={{ fontSize: '11px', fontWeight: '500', fill: '#374151' }}
                    />
                  )}
                </Area>
              );
            })()}
          </AreaChart>
        );

      case 'scatter_chart':
        const xKeyForScatter =
          legendField && legendValues.length > 0 && pivotedLineData.length > 0
            ?
                pivotActualXKey ||
                xField ||
                Object.keys(pivotedLineData[0] || {}).find(k => !legendValues.includes(k)) ||
                Object.keys(pivotedLineData[0] || {})[0]
            : xKey;
        
        // Check if this is a date axis
        const isDateAxisScatter =
          xKeyForScatter &&
          xKeyForScatter.toLowerCase() === 'date' &&
          ((legendField && legendValues.length > 0 && pivotedLineData.length > 0) ? 
            (pivotedLineData.length > 0 && typeof pivotedLineData[0][xKeyForScatter] === 'number') :
            (chartDataForRendering.length > 0 && typeof chartDataForRendering[0][xKeyForScatter] === 'number'));
        const formatDateTickScatter = d3.timeFormat('%d-%B-%y');
        
        return (
          <ScatterChart margin={getChartMargins()}>
            {currentShowGrid && <CartesianGrid strokeDasharray="3 3" />}
            <XAxis
              dataKey={xKeyForScatter}
              label={currentShowXAxisLabels && effectiveXAxisLabel && effectiveXAxisLabel.trim() ? { value: capitalizeWords(effectiveXAxisLabel), position: 'bottom', style: effectiveXAxisLabelStyle, offset: 35 } : undefined}
              tick={xAxisTickStyle}
              tickLine={false}
              allowDuplicatedCategory={false}
              tickFormatter={isDateAxisScatter ? (value) => formatDateTickScatter(new Date(value)) : xAxisTickFormatter}
              {...(() => {
                const firstValue = transformedChartData[0]?.[xKeyForScatter];
                const isNumericOrDate = typeof firstValue === 'number' || firstValue instanceof Date || !isNaN(Date.parse(firstValue));
                return isNumericOrDate ? {} : { interval: 0, minTickGap: 0, height: 80 };
              })()}
            />
            <YAxis
              yAxisId={0}
              label={currentShowYAxisLabels && effectiveYAxisLabel && effectiveYAxisLabel.trim() ? { value: capitalizeWords(effectiveYAxisLabel), angle: -90, position: 'left', style: axisLabelStyle } : undefined}
              tick={axisTickStyle}
              tickLine={false}
              tickFormatter={formatLargeNumber}
              {...(combinedDomain ? { domain: combinedDomain } : {})}
            />
            {(yKeys.length > 1 || (yFields && yFields.length > 1)) && !forceSingleAxis && (
              <YAxis
                yAxisId={1}
                orientation="right"
                label={currentShowYAxisLabels && effectiveYAxisLabels && effectiveYAxisLabels[1] ? { value: capitalizeWords(effectiveYAxisLabels[1]), angle: 90, position: 'right', style: effectiveYAxisLabelStyle, offset: 5 } : undefined}
                tick={axisTickStyle}
                tickLine={false}
                tickFormatter={formatLargeNumber}
              />
            )}
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  return (
                    <div className="explore-chart-tooltip">
                      <p className="font-semibold text-gray-900 mb-2 text-sm">
                        {isDateAxisScatter ? formatDateTickScatter(new Date(label)) : label}
                      </p>
                      {payload.map((entry: any, index: number) => (
                        <div key={index} className="flex items-center gap-2 mb-1">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: entry.color }}
                          />
                          <span className="text-sm font-medium text-gray-700">
                            {entry.dataKey}: 
                          </span>
                          <span className="text-sm font-semibold text-gray-700">
                            {typeof entry.value === 'number' ? formatTooltipNumber(entry.value) : entry.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                }
                return null;
              }}
              cursor={{ stroke: palette[0], strokeWidth: 1, strokeOpacity: 0.4 }}
            />
            {legendField && currentShowLegend && (
              <Legend
                layout="horizontal"
                verticalAlign="bottom"
                align="center"
                wrapperStyle={{ bottom: 20, fontSize: '11px' }}
              />
            )}
            {legendField && legendValues.length > 0 && pivotedLineData.length > 0 ? (
              legendValues.map((seriesKey, idx) => {
                const seriesData = pivotedLineData.filter(d => d[seriesKey] !== undefined && d[seriesKey] !== null);
                return (
                  <Scatter key={seriesKey} data={seriesData} dataKey={seriesKey} name={seriesKey} fill={palette[idx % palette.length]}>
                    {currentShowDataLabels && (
                      <LabelList 
                        dataKey={seriesKey} 
                        position="top" 
                        formatter={(value) => formatLargeNumber(value)}
                        style={{ fontSize: '11px', fontWeight: '500', fill: '#374151' }}
                      />
                    )}
                  </Scatter>
                );
              })
            ) : (
              <>
                <Scatter data={transformedChartData} dataKey={yKey} fill={palette[0]} yAxisId={0}>
                  {currentShowDataLabels && (
                    <LabelList 
                      dataKey={yKey} 
                      position="top" 
                      formatter={(value) => formatLargeNumber(value)}
                      style={{ fontSize: '11px', fontWeight: '500', fill: '#374151' }}
                    />
                  )}
                </Scatter>
                {(yKeys.length > 1 || (yFields && yFields.length > 1)) && (
                  <Scatter data={transformedChartData} dataKey={yKeys[1] || yFields[1]} fill={palette[1]} yAxisId={forceSingleAxis ? 0 : 1}>
                    {currentShowDataLabels && (
                      <LabelList 
                        dataKey={yKeys[1] || yFields[1]} 
                        position="top" 
                        formatter={(value) => formatLargeNumber(value)}
                        style={{ fontSize: '11px', fontWeight: '500', fill: '#374151' }}
                      />
                    )}
                  </Scatter>
                )}
              </>
            )}
          </ScatterChart>
        );

      case 'pie_chart':
        // For pie charts with dual Y-axes, we need to handle it differently
        const hasDualYAxesForPie = yKeys.length > 1 || (yFields && yFields.length > 1);

        // Special case: legend field with multiple pie charts
        if (legendField && data) {
          // Support both array and object data structures
          const pieGroups: Record<string, any[]> = Array.isArray(data)
            ? data.reduce((acc: Record<string, any[]>, item: any) => {
                const key = item[legendField] ?? 'Unknown';
                acc[key] = acc[key] || [];
                acc[key].push(item);
                return acc;
              }, {})
            : (data as Record<string, any[]>);

          const measureKey = yKey || yFields?.[0] || 'value';
          const nameKey = xKey || 'name';

          return (
            <div
              className="grid gap-8 w-full"
              style={{ gridTemplateColumns: `repeat(${chartsPerRow || 2}, minmax(0, 1fr))` }}
            >
              {Object.entries(pieGroups).map(([legendValue, slices]) => (
                <div key={legendValue} className="flex flex-col items-center">
                  <PieChart width={300} height={300}>
                    <defs>
                      {MODERN_PIE_COLORS.map((color, i) => (
                        <linearGradient key={i} id={`pieGradient-${i}`} x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor={color} stopOpacity={1} />
                          <stop offset="100%" stopColor={color} stopOpacity={0.8} />
                        </linearGradient>
                      ))}
                      <filter id="pieShadow" x="-50%" y="-50%" width="200%" height="200%">
                        <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.15" floodColor="#000000" />
                      </filter>
                    </defs>
                    <Pie
                      data={slices}
                      cx="50%"
                      cy="50%"
                      outerRadius={95}
                      innerRadius={35}
                      dataKey={measureKey}
                      nameKey={nameKey}
                      stroke="white"
                      strokeWidth={3}
                      filter="url(#pieShadow)"
                      label={currentShowDataLabels ? (({ name, percent }) => percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : '') : undefined}
                      labelLine={false}
                      style={{ fontSize: '11px', fontWeight: 500 }}
                    >
                      {slices.map((entry: any, sliceIdx: number) => (
                        <Cell
                          key={`cell-${sliceIdx}`}
                          fill={`url(#pieGradient-${sliceIdx % MODERN_PIE_COLORS.length})`}
                          style={{ cursor: 'pointer' }}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      cursor={{ stroke: palette[0], strokeWidth: 1, strokeOpacity: 0.4 }}
                      formatter={(value: any) => (typeof value === 'number' ? formatTooltipNumber(value) : value)}
                    />
                    {showLegend && <Legend />}
                  </PieChart>
                  <p className="mt-2 font-semibold text-sm text-gray-700">
                    {capitalizeWords(String(legendValue))}
                  </p>
                </div>
              ))}
            </div>
          );
        }

        if (hasDualYAxesForPie) {
          // For dual Y-axes pie chart, we'll create a combined view or use the first Y-axis
          const primaryYKey = yKeys[0] || yFields[0];

          return (
            <PieChart margin={getPieChartMargins()}>
              <defs>
                {MODERN_PIE_COLORS.map((color, i) => (
                  <linearGradient key={i} id={`pieGradient-${i}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={1} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.8} />
                  </linearGradient>
                ))}
                <filter id="pieShadow" x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.15" floodColor="#000000" />
                </filter>
              </defs>
              <Pie
                data={chartDataForRendering}
                cx="50%"
                cy="50%"
                outerRadius="80%"
                innerRadius="35%"
                stroke="white"
                strokeWidth={3}
                filter="url(#pieShadow)"
                label={currentShowDataLabels ? (({ name, percent }) => percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : '') : undefined}
                labelLine={false}
                dataKey={primaryYKey}
                nameKey={xKey}
                animationBegin={0}
                animationDuration={1000}
                animationEasing="ease-out"
              >
                {Array.isArray(chartDataForRendering) ? chartDataForRendering.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={`url(#pieGradient-${index % MODERN_PIE_COLORS.length})`}
                    style={{ cursor: 'pointer' }}
                  />
                )) : []}
              </Pie>
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="explore-chart-tooltip">
                        <p className="font-semibold text-gray-900 mb-2 text-sm">{label}</p>
                        {payload.map((entry: any, index: number) => {
                          // Use the actual Y-axis label instead of the dataKey
                          let displayName = entry.dataKey;
                          if (entry.dataKey === primaryYKey) {
                            displayName = effectiveYAxisLabel || effectiveYAxisLabels?.[0] || 'Value';
                          } else if (entry.dataKey === yKeys[1] || entry.dataKey === yFields?.[1]) {
                            displayName = effectiveYAxisLabels?.[1] || yFields?.[1] || 'Value';
                          }

                          return (
                            <div key={index} className="flex items-center gap-2 mb-1">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: entry.color }}
                              />
                              <span className="text-sm font-medium text-gray-700">
                                {displayName}:
                              </span>
                              <span className="text-sm font-semibold text-gray-700">
                                {typeof entry.value === 'number' ? formatTooltipNumber(entry.value) : entry.value}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }
                  return null;
                }}
                cursor={{ stroke: palette[0], strokeWidth: 1, strokeOpacity: 0.4 }}
              />
              {showLegend && (
                <Legend
                  layout="horizontal"
                  verticalAlign="bottom"
                  align="center"
                  wrapperStyle={{
                    paddingTop: '10px',
                    fontSize: '11px'
                  }}
                  formatter={(value, entry) => {
                    // For pie charts, the value should be the name from the data
                    // The entry.payload contains the original data item
                    if (entry.payload && typeof entry.payload === 'object' && 'name' in entry.payload) {
                      return capitalizeWords(String(entry.payload.name));
                    }
                    // Fallback: try to find the name from the data array using the value
                    const dataItem = chartDataForRendering.find(item => item[primaryYKey] === entry.value);
                    if (dataItem && dataItem[xKey]) {
                      return capitalizeWords(String(dataItem[xKey]));
                    }
                    return capitalizeWords(String(value));
                  }}
                />
              )}
            </PieChart>
          );
        } else {
          // Single Y-axis pie chart (existing logic)
          return (
            <PieChart margin={getPieChartMargins()}>
              <defs>
                {MODERN_PIE_COLORS.map((color, i) => (
                  <linearGradient key={i} id={`pieGradient-${i}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={1} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.8} />
                  </linearGradient>
                ))}
                <filter id="pieShadow" x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.15" floodColor="#000000" />
                </filter>
              </defs>
              <Pie
                data={chartDataForRendering}
                cx="50%"
                cy="50%"
                outerRadius="80%"
                innerRadius="35%"
                stroke="white"
                strokeWidth={3}
                filter="url(#pieShadow)"
                label={currentShowDataLabels ? (({ name, percent }) => percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : '') : undefined}
                labelLine={false}
                dataKey={yKey}
                nameKey={xKey}
                animationBegin={0}
                animationDuration={1000}
                animationEasing="ease-out"
                style={{ fontSize: '11px', fontWeight: 500 }}
              >
                {Array.isArray(chartDataForRendering) ? chartDataForRendering.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={`url(#pieGradient-${index % MODERN_PIE_COLORS.length})`}
                    style={{ cursor: 'pointer' }}
                  />
                )) : []}
              </Pie>
              <Tooltip
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="explore-chart-tooltip">
                        <p className="font-semibold text-gray-900 mb-2 text-sm">{label}</p>
                        {payload.map((entry: any, index: number) => {
                          // Use the actual Y-axis label instead of the dataKey
                          let displayName = entry.dataKey;
                          if (entry.dataKey === yKey) {
                            displayName = effectiveYAxisLabel || effectiveYAxisLabels?.[0] || 'Value';
                          } else if (entry.dataKey === yKeys[1] || entry.dataKey === yFields?.[1]) {
                            displayName = effectiveYAxisLabels?.[1] || yFields?.[1] || 'Value';
                          }

                          return (
                            <div key={index} className="flex items-center gap-2 mb-1">
                              <div
                                className="w-3 h-3 rounded-full"
                                style={{ backgroundColor: entry.color }}
                              />
                              <span className="text-sm font-medium text-gray-700">
                                {displayName}:
                              </span>
                              <span className="text-sm font-semibold text-gray-700">
                                {typeof entry.value === 'number' ? formatTooltipNumber(entry.value) : entry.value}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }
                  return null;
                }}
                cursor={{ stroke: palette[0], strokeWidth: 1, strokeOpacity: 0.4 }}
              />
              {showLegend && (
                <Legend
                  layout="horizontal"
                  verticalAlign="bottom"
                  align="center"
                  wrapperStyle={{
                    paddingTop: '10px',
                    fontSize: '11px'
                  }}
                  formatter={(value, entry) => {
                    // For pie charts, the value should be the name from the data
                    // The entry.payload contains the original data item
                    if (entry.payload && typeof entry.payload === 'object' && 'name' in entry.payload) {
                      return capitalizeWords(String(entry.payload.name));
                    }
                    // Fallback: try to find the name from the data array using the value
                    const dataItem = chartDataForRendering.find(item => item[yKey] === entry.value);
                    if (dataItem && dataItem[xKey]) {
                      return capitalizeWords(String(dataItem[xKey]));
                    }
                    return capitalizeWords(String(value));
                  }}
                />
              )}
            </PieChart>
          );
        }
        break;

      default:
        return (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <div className="text-lg font-medium">Unsupported chart type</div>
              <div className="text-sm">Chart type '{type}' is not supported</div>
            </div>
          </div>
        );
    }
  };



  return (
    <div className="w-full h-full flex flex-col" {...rootAttributes}>
      {/* <div className="mb-6 flex justify-center">
        <div className="relative w-full max-w-3xl">
          {(((isTitleFocused ? titleEditableRef.current?.textContent : resolvedTitle) ?? '').trim().length === 0) && (
            <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl font-semibold text-gray-400">
              Add chart title
            </span>
          )}
          <div
            ref={titleEditableRef}
            contentEditable
            suppressContentEditableWarning
            className="w-full rounded-2xl border border-transparent bg-white/90 px-6 py-3 text-center text-[36px] font-bold leading-snug text-gray-900 shadow-[0_26px_60px_-30px_rgba(124,58,237,0.35)] outline-none transition-all focus:border-purple-400 focus:ring-4 focus:ring-purple-300/40"
            onFocus={handleTitleFocus}
            onBlur={handleTitleBlur}
            onInput={handleTitleInput}
            onKeyDown={handleTitleKeyDown}
            role="textbox"
            aria-label="Chart title"
            spellCheck={true}
          />
        </div>
      </div> */}

      <div
        className="w-full h-full relative flex-1 min-w-0"
        style={{ height: height ? `${height}px` : '100%', width: width ? `${width}px` : '100%' }}
      >
        <div 
          className="w-full h-full transition-all duration-500 ease-in-out overflow-y-auto overflow-x-hidden chart-scroll-container"
          style={{ 
            paddingBottom: type === 'pie_chart' ? '10px' : '10px',
            paddingTop: type === 'pie_chart' ? '8px' : '16px',
            maxWidth: '100%',
            width: '100%',
            scrollbarWidth: 'thin',
            scrollbarColor: '#cbd5e1 #f1f5f9'
          }}
          onContextMenu={handleContextMenu}
          ref={chartRef}
        >
          <div 
            className={`w-full h-full p-4 ${type === 'pie_chart' ? 'flex items-center justify-center' : ''}`}
            style={{ 
              minHeight: '300px',
              maxWidth: '100%',
              width: '100%',
              overflow: 'visible',
              display: type === 'pie_chart' ? 'flex' : 'block',
              alignItems: type === 'pie_chart' ? 'center' : 'stretch',
              justifyContent: type === 'pie_chart' ? 'center' : 'flex-start'
            }}
          >
            <ResponsiveContainer 
              key={chartRenderKey}
              width="100%" 
              height="100%" 
              className={`w-full h-full ${type === 'pie_chart' ? 'flex items-center justify-center' : ''}`}
              style={{ 
                maxWidth: '100%', 
                overflow: 'hidden',
                display: type === 'pie_chart' ? 'flex' : 'block',
                alignItems: type === 'pie_chart' ? 'center' : 'stretch',
                justifyContent: type === 'pie_chart' ? 'center' : 'flex-start'
              }}
            >
              {(() => {
                try {
                  return renderChart();
                } catch (error) {
                  return (
                    <div className="flex items-center justify-center h-full text-red-500">
                      <div className="text-center">
                        <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                        <p className="text-sm">Error rendering chart</p>
                        <p className="text-xs text-gray-500 mt-1">Please check the console for details</p>
                      </div>
                    </div>
                  );
                }
              })()}
            </ResponsiveContainer>
          </div>
        </div>
        {overlayVisible && (
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'transparent',
              zIndex: 9998,
            }}
            onMouseDown={handleOverlayClick}
          />
        )}
        <ContextMenu />
        <ColorThemeSubmenu />
        <SortSubmenu />
        <ChartTypeSubmenu />
        <AxisLabelSubmenu />
        <AxisToggleSubmenu />
        
        {/* X-Axis Label Edit Dialog */}
        {showXAxisLabelDialog && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000]"
            onClick={handleCancelAxisLabelEdit}
          >
            <div
              className="bg-white rounded-lg p-6 w-96 max-w-md mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-4">Edit X-Axis Label</h3>
              <input
                type="text"
                value={tempXAxisLabel}
                onChange={(e) => setTempXAxisLabel(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter X-axis label"
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={handleCancelAxisLabelEdit}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveXAxisLabel}
                  className="px-4 py-2 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Y-Axis Label Edit Dialog */}
        {showYAxisLabelDialog && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000]"
            onClick={handleCancelAxisLabelEdit}
          >
            <div
              className="bg-white rounded-lg p-6 w-96 max-w-md mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-4">Edit Y-Axis Label</h3>
              <input
                type="text"
                value={tempYAxisLabel}
                onChange={(e) => setTempYAxisLabel(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Enter Y-axis label"
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={handleCancelAxisLabelEdit}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveYAxisLabel}
                  className="px-4 py-2 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Series Settings Modal */}
        {showSeriesSettingsModal && selectedSeries && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000]"
            onClick={() => {
              setShowSeriesSettingsModal(false);
              setSelectedSeries(null);
            }}
          >
            <div
              className="bg-white rounded-lg p-6 w-96 max-w-md mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold mb-4">Series Settings: {selectedSeries.name}</h3>
              
              {/* Color Picker */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={seriesSettings[selectedSeries.dataKey]?.color || selectedSeries.currentColor}
                    onChange={(e) => {
                      setSeriesSettings(prev => ({
                        ...prev,
                        [selectedSeries.dataKey]: {
                          ...prev[selectedSeries.dataKey],
                          color: e.target.value
                        }
                      }));
                    }}
                    className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={seriesSettings[selectedSeries.dataKey]?.color || selectedSeries.currentColor}
                    onChange={(e) => {
                      const color = e.target.value;
                      if (/^#[0-9A-Fa-f]{6}$/.test(color) || /^#[0-9A-Fa-f]{3}$/.test(color)) {
                        setSeriesSettings(prev => ({
                          ...prev,
                          [selectedSeries.dataKey]: {
                            ...prev[selectedSeries.dataKey],
                            color: color
                          }
                        }));
                      }
                    }}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="#000000"
                  />
                </div>
              </div>

              {/* Data Labels Toggle */}
              <div className="mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={seriesSettings[selectedSeries.dataKey]?.showDataLabels !== undefined 
                      ? seriesSettings[selectedSeries.dataKey]?.showDataLabels 
                      : currentShowDataLabels}
                    onChange={(e) => {
                      setSeriesSettings(prev => ({
                        ...prev,
                        [selectedSeries.dataKey]: {
                          ...prev[selectedSeries.dataKey],
                          showDataLabels: e.target.checked
                        }
                      }));
                    }}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Show Data Labels</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => {
                    setShowSeriesSettingsModal(false);
                    setSelectedSeries(null);
                  }}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RechartsChartRenderer; 

