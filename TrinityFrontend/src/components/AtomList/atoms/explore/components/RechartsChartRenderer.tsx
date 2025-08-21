import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
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

interface Props {
  type: 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart';
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
  onGridToggle?: (enabled: boolean) => void; // Callback for grid toggle
  onLegendToggle?: (enabled: boolean) => void; // Callback for legend toggle
  onAxisLabelsToggle?: (enabled: boolean) => void; // Callback for axis labels toggle
  onDataLabelsToggle?: (enabled: boolean) => void; // Callback for data labels toggle
  onSave?: () => void; // Callback for save action
  onSortChange?: (chartIndex: number) => void; // Callback when sorting changes
  showLegend?: boolean; // External control for legend visibility
  showAxisLabels?: boolean; // External control for axis labels visibility
  showDataLabels?: boolean; // External control for data labels visibility
  showGrid?: boolean; // External control for grid visibility
  chartsPerRow?: number; // For multi pie chart layouts
}

// Excel-like color themes
const COLOR_THEMES = {
  'default': {
    name: 'Default',
    primary: '#6366f1',
    secondary: '#a5b4fc',
    tertiary: '#e0e7ff',
    palette: ['#6366f1', '#a5b4fc', '#e0e7ff', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D']
  },
  'blue': {
    name: 'Blue',
    primary: '#3b82f6',
    secondary: '#60a5fa',
    tertiary: '#dbeafe',
    palette: ['#1e40af', '#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe', '#eff6ff']
  },
  'green': {
    name: 'Green',
    primary: '#10b981',
    secondary: '#6ee7b7',
    tertiary: '#d1fae5',
    palette: ['#065f46', '#10b981', '#6ee7b7', '#a7f3d0', '#d1fae5', '#ecfdf5']
  },
  'purple': {
    name: 'Purple',
    primary: '#8b5cf6',
    secondary: '#c4b5fd',
    tertiary: '#ede9fe',
    palette: ['#581c87', '#8b5cf6', '#c4b5fd', '#ddd6fe', '#ede9fe', '#faf5ff']
  },
  'orange': {
    name: 'Orange',
    primary: '#f59e0b',
    secondary: '#fcd34d',
    tertiary: '#fef3c7',
    palette: ['#92400e', '#f59e0b', '#fcd34d', '#fde68a', '#fef3c7', '#fffbeb']
  },
  'red': {
    name: 'Red',
    primary: '#ef4444',
    secondary: '#f87171',
    tertiary: '#fecaca',
    palette: ['#991b1b', '#ef4444', '#f87171', '#fca5a5', '#fecaca', '#fef2f2']
  },
  'teal': {
    name: 'Teal',
    primary: '#14b8a6',
    secondary: '#5eead4',
    tertiary: '#ccfbf1',
    palette: ['#134e4a', '#14b8a6', '#5eead4', '#99f6e4', '#ccfbf1', '#f0fdfa']
  },
  'pink': {
    name: 'Pink',
    primary: '#ec4899',
    secondary: '#f9a8d4',
    tertiary: '#fce7f3',
    palette: ['#831843', '#ec4899', '#f9a8d4', '#fbcfe8', '#fce7f3', '#fdf2f8']
  },
  'gray': {
    name: 'Gray',
    primary: '#6b7280',
    secondary: '#9ca3af',
    tertiary: '#f3f4f6',
    palette: ['#374151', '#6b7280', '#9ca3af', '#d1d5db', '#f3f4f6', '#f9fafb']
  },
  'indigo': {
    name: 'Indigo',
    primary: '#4f46e5',
    secondary: '#818cf8',
    tertiary: '#e0e7ff',
    palette: ['#312e81', '#4f46e5', '#818cf8', '#a5b4fc', '#e0e7ff', '#eef2ff']
  },
  'cyan': {
    name: 'Cyan',
    primary: '#06b6d4',
    secondary: '#67e8f9',
    tertiary: '#cffafe',
    palette: ['#164e63', '#06b6d4', '#67e8f9', '#a5f3fc', '#cffafe', '#ecfeff']
  },
  'lime': {
    name: 'Lime',
    primary: '#84cc16',
    secondary: '#bef264',
    tertiary: '#f7fee7',
    palette: ['#3f6212', '#84cc16', '#bef264', '#d9f99d', '#f7fee7', '#f7fee7']
  },
  'amber': {
    name: 'Amber',
    primary: '#f59e0b',
    secondary: '#fbbf24',
    tertiary: '#fef3c7',
    palette: ['#78350f', '#f59e0b', '#fbbf24', '#fcd34d', '#fef3c7', '#fffbeb']
  },
  'emerald': {
    name: 'Emerald',
    primary: '#059669',
    secondary: '#34d399',
    tertiary: '#d1fae5',
    palette: ['#064e3b', '#059669', '#34d399', '#6ee7b7', '#d1fae5', '#ecfdf5']
  },
  'violet': {
    name: 'Violet',
    primary: '#7c3aed',
    secondary: '#a78bfa',
    tertiary: '#ede9fe',
    palette: ['#4c1d95', '#7c3aed', '#a78bfa', '#c4b5fd', '#ede9fe', '#faf5ff']
  },
  'fuchsia': {
    name: 'Fuchsia',
    primary: '#d946ef',
    secondary: '#f0abfc',
    tertiary: '#fae8ff',
    palette: ['#701a75', '#d946ef', '#f0abfc', '#f5d0fe', '#fae8ff', '#fdf4ff']
  },
  'rose': {
    name: 'Rose',
    primary: '#e11d48',
    secondary: '#fb7185',
    tertiary: '#ffe4e6',
    palette: ['#881337', '#e11d48', '#fb7185', '#fda4af', '#ffe4e6', '#fff1f2']
  },
  'slate': {
    name: 'Slate',
    primary: '#475569',
    secondary: '#94a3b8',
    tertiary: '#f1f5f9',
    palette: ['#1e293b', '#475569', '#94a3b8', '#cbd5e1', '#f1f5f9', '#f8fafc']
  },
  'zinc': {
    name: 'Zinc',
    primary: '#71717a',
    secondary: '#a1a1aa',
    tertiary: '#f4f4f5',
    palette: ['#27272a', '#71717a', '#a1a1aa', '#d4d4d8', '#f4f4f5', '#fafafa']
  },
  'neutral': {
    name: 'Neutral',
    primary: '#737373',
    secondary: '#a3a3a3',
    tertiary: '#f5f5f5',
    palette: ['#262626', '#737373', '#a3a3a3', '#d4d4d4', '#f5f5f5', '#fafafa']
  },
  'stone': {
    name: 'Stone',
    primary: '#78716c',
    secondary: '#a8a29e',
    tertiary: '#f5f5f4',
    palette: ['#292524', '#78716c', '#a8a29e', '#d6d3d1', '#f5f5f4', '#fafaf9']
  },
  'sky': {
    name: 'Sky',
    primary: '#0ea5e9',
    secondary: '#38bdf8',
    tertiary: '#e0f2fe',
    palette: ['#0c4a6e', '#0ea5e9', '#38bdf8', '#7dd3fc', '#e0f2fe', '#f0f9ff']
  },
  'blue-gray': {
    name: 'Blue Gray',
    primary: '#64748b',
    secondary: '#94a3b8',
    tertiary: '#f1f5f9',
    palette: ['#334155', '#64748b', '#94a3b8', '#cbd5e1', '#f1f5f9', '#f8fafc']
  },
  'cool-gray': {
    name: 'Cool Gray',
    primary: '#6b7280',
    secondary: '#9ca3af',
    tertiary: '#f3f4f6',
    palette: ['#374151', '#6b7280', '#9ca3af', '#d1d5db', '#f3f4f6', '#f9fafb']
  },
  'warm-gray': {
    name: 'Warm Gray',
    primary: '#78716c',
    secondary: '#a8a29e',
    tertiary: '#f5f5f4',
    palette: ['#44403c', '#78716c', '#a8a29e', '#d6d3d1', '#f5f5f4', '#fafaf9']
  }
};

// Fallback flat palette (first scheme spread + legacy colors)
// Default palette for explore charts - base colors with lighter shades
const DEFAULT_COLORS = [
  '#FFBD59', '#FFC878', '#FFD897',
  '#41C185', '#5CD29A', '#78E3AF',
  '#458EE2', '#6BA4E8', '#91BAEE',
  '#F5F5F5', '#E0E0E0', '#C5C5C5'
];

const FONT_FAMILY = `'Inter', 'Segoe UI', sans-serif`;

// Number formatting function for large numbers
const formatLargeNumber = (value: number): string => {
  const absValue = Math.abs(value);
  
  if (absValue >= 1000000000) { // Billions (10^9)
    const scaled = value / 1000000000;
    return scaled.toFixed(0) + 'B';
  } else if (absValue >= 1000000) { // Millions (10^6)
    const scaled = value / 1000000;
    return scaled.toFixed(0) + 'M';
  } else if (absValue >= 1000) { // Thousands (10^3)
    const scaled = value / 1000;
    return scaled.toFixed(0) + 'K';
  } else {
    return value.toString(); // Numbers less than 1000
  }
};

// Format numbers for tooltips - show exact values without suffixes
const formatTooltipNumber = (value: number): string => {
  // For tooltips, show the exact number with proper formatting
  if (Number.isInteger(value)) {
    return value.toLocaleString(); // Add commas for thousands separators
  } else {
    return value.toLocaleString(undefined, { 
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
  width = 400, 
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
  onGridToggle,
  onLegendToggle,
  onAxisLabelsToggle,
  onDataLabelsToggle,
  onSave,
  onSortChange, // Callback when sorting changes
  showLegend: propShowLegend, // External control for legend visibility
  showAxisLabels: propShowAxisLabels, // External control for axis labels visibility
  showDataLabels: propShowDataLabels, // External control for data labels visibility
  showGrid: propShowGrid, // External control for grid visibility
  chartsPerRow
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





  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const chartRef = useRef<HTMLDivElement>(null);

  // State for chart options
  const [showGrid, setShowGrid] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [showAxisLabels, setShowAxisLabels] = useState(true);
  const [showDataLabels, setShowDataLabels] = useState(true);

  // Use data prop directly now that sorting is removed
  const chartData = data;

    // State to store transformed data that preserves legend fields
  // CRITICAL FIX: Store the detected legend field to ensure consistency
  const [detectedLegendField, setDetectedLegendField] = useState<string | null>(null);

  // Use data directly for rendering.
  // When pie charts return an object keyed by legend values, flatten the slices
  // so that downstream logic expecting an array (e.g. key detection) continues
  // to work.
  const chartDataForRendering = useMemo(() => {
    if (!data) return [];

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

        return (data as any[]).map((item) => {
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
      }
      return data;
    }

    if (type === 'pie_chart' && typeof data === 'object') {
      // If a legend field is provided, the backend may return an object keyed by legend value
      if (legendField) {
        try {
          return Object.values(data as Record<string, any[]>).flat();
        } catch {
          return [];
        }
      }

      // When no legend field is provided, convert simple key-value pairs to an
      // array of objects. Some APIs return values as nested objects (e.g.
      // { category: { metric: 10 } }), which would otherwise break the pie
      // chart because Recharts expects numeric values. Extract the first
      // numeric field from such objects.
      try {
        const xKeyName = xField || 'name';
        const yKeyName = yField || 'value';

        return Object.entries(data as Record<string, any>).map(([name, value]) => {
          let numericValue: any = value;
          if (typeof value === 'object' && value !== null) {
            const firstNumber = Object.values(value).find(v => typeof v === 'number');
            numericValue = firstNumber !== undefined ? firstNumber : value;
          }
          return { [xKeyName]: name, [yKeyName]: numericValue };
        });
      } catch {
        return [];
      }
    }

    return [];
  }, [data, type, legendField]);

  // Simple chart render key
  const chartRenderKey = useMemo(() => {
    const key = `chart-${type}-${chartDataForRendering.length}`;
    return key;
  }, [type, chartDataForRendering]);
  
  // Use external props if provided, otherwise use internal state
  const currentShowGrid = propShowGrid !== undefined ? propShowGrid : showGrid;
  const currentShowLegend = propShowLegend !== undefined ? propShowLegend : showLegend;
  const currentShowAxisLabels = propShowAxisLabels !== undefined ? propShowAxisLabels : showAxisLabels;
  const currentShowDataLabels = propShowDataLabels !== undefined ? propShowDataLabels : showDataLabels;

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
  ): { pivoted: any[]; uniqueValues: string[] } => {
    if (!rows || rows.length === 0) return { pivoted: [], uniqueValues: [] };

    // Case-insensitive matching of provided keys to actual row keys
    const sampleRow = rows[0] || {};
    const actualXKey = Object.keys(sampleRow).find(k => k.toLowerCase() === xKey.toLowerCase()) || xKey;
    const actualYKey = Object.keys(sampleRow).find(k => k.toLowerCase() === yKey.toLowerCase()) || yKey;
    const actualLegendKey = Object.keys(sampleRow).find(k => k.toLowerCase() === legendKey.toLowerCase()) || legendKey;

    // Collect unique legend values preserving insertion order
    const uniqueValues: string[] = [];

    // Map from x value to aggregated object
    const map = new Map<string | number, any>();

    rows.forEach((row) => {
      const xVal = row[actualXKey];
      const legendVal = row[actualLegendKey];
      const yVal = row[actualYKey];
      if (legendVal !== undefined && !uniqueValues.includes(legendVal)) uniqueValues.push(legendVal);

      const existing = map.get(xVal) || { [xKey]: xVal };
      existing[legendVal] = yVal;
      map.set(xVal, existing);
    });

    return { pivoted: Array.from(map.values()), uniqueValues };
  };

  // Memoized pivoted data for line charts and bar charts with legend field
  const { pivoted: pivotedLineData, uniqueValues: legendValues } = useMemo(() => {
    if ((type === 'line_chart' || type === 'bar_chart' || type === 'area_chart' || type === 'scatter_chart') && legendField && xField && yField) {
      // Check if data is already pivoted (has multiple Y-axis columns)
      const isDataAlreadyPivoted = chartDataForRendering.length > 0 && 
        chartDataForRendering[0] && 
        Object.keys(chartDataForRendering[0]).some(key => 
          key !== xField && 
          key !== legendField && 
          typeof chartDataForRendering[0][key] === 'number'
        );
      
      if (isDataAlreadyPivoted) {
        // Data is already pivoted, extract legend values from column names
        const firstRow = chartDataForRendering[0];
        const legendColumns = Object.keys(firstRow).filter(key => {
          // Filter out X-axis field (case-insensitive)
          const isXAxisField = key.toLowerCase() === xField.toLowerCase() || 
                              key.toLowerCase() === 'year' || 
                              key.toLowerCase() === 'date' || 
                              key.toLowerCase() === 'category' ||
                              key.toLowerCase() === 'label';
          
          // Only include numeric fields that are NOT X-axis fields
          return !isXAxisField && typeof firstRow[key] === 'number';
        });
        
        return { 
          pivoted: chartDataForRendering, 
          uniqueValues: legendColumns 
        };
      } else {
        // Data needs pivoting, use the existing function
        return pivotDataByLegend(chartDataForRendering, xField, yField, legendField);
      }
    }
    return { pivoted: [], uniqueValues: [] };
  }, [type, chartDataForRendering, xField, yField, legendField]);
  
  // Styling for axis ticks & labels
  const axisTickStyle = { fontFamily: FONT_FAMILY, fontSize: 12, fill: '#475569' } as const;
  const axisLabelStyle = { 
    fontFamily: FONT_FAMILY, 
    fontSize: 14, 
    fontWeight: 'bold',
    fill: '#334155' 
  } as const;

  // Handle right-click context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
    setShowColorSubmenu(false); // Always close submenu when opening main menu
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
  const handleColorThemeClick = () => {
    setShowColorSubmenu(prevState => {
      const newState = !prevState;
      return newState;
    });
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
  const handleAxisLabelsToggle = () => {
    const newAxisLabelsState = !showAxisLabels;
    setShowAxisLabels(newAxisLabelsState);
    setShowContextMenu(false);
    setShowColorSubmenu(false);
    if (onAxisLabelsToggle) {
      onAxisLabelsToggle(newAxisLabelsState);
    }
  };

  // Handle data labels toggle
  const handleDataLabelsToggle = () => {
    const newDataLabelsState = !showDataLabels;
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
      
      // Only close menus if click is outside ALL active menus
      if (isOutsideMainMenu && isOutsideColorSubmenu) {
        // Add a small delay to ensure button clicks are processed first
        setTimeout(() => {
          setShowContextMenu(false);
          setShowColorSubmenu(false);
        }, 50);
      }
    };

    if (showContextMenu || showColorSubmenu) {
      // Use a longer delay to allow submenu to open properly
      const timeoutId = setTimeout(() => {
        document.addEventListener('click', handleClickOutside, false);
      }, 200);
      
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('click', handleClickOutside, false);
      };
    }
  }, [showContextMenu, showColorSubmenu]);

  // Context menu component
  const ContextMenu = () => {
    if (!showContextMenu) return null;

    return (
      <div 
        className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-lg py-2 min-w-48 context-menu"
        style={{ 
          left: contextMenuPosition.x, 
          top: contextMenuPosition.y,
          transform: 'translate(-50%, -100%)',
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
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleColorThemeClick();
          }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z" />
          </svg>
          <span>Color Theme</span>
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
          className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3 text-gray-700"
          onClick={handleAxisLabelsToggle}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
          <span>Axis Labels</span>
          <div className="ml-auto">
            <div className={`w-4 h-3 rounded border ${showAxisLabels ? 'bg-blue-500 border-blue-500' : 'bg-gray-200 border-gray-300'}`}>
              {showAxisLabels && (
                <svg className="w-4 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          </div>
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
            <div className={`w-4 h-3 rounded border ${showDataLabels ? 'bg-blue-500 border-blue-500' : 'bg-gray-200 border-gray-300'}`}>
              {showDataLabels && (
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
        <button
          className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3 text-gray-700"
          onClick={handleSave}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
          </svg>
          <span>Save</span>
        </button>
      </div>
    );
  };

  // Color theme submenu component
  const ColorThemeSubmenu = () => {
    if (!showColorSubmenu) return null;

    return (
      <div 
        className="fixed z-[9999] bg-white border border-gray-300 rounded-lg shadow-xl p-3 color-submenu"
        style={{ 
          left: contextMenuPosition.x + 96, // Half of min-w-48 (192px/2) + small gap
          top: contextMenuPosition.y - 120, // Align with the context menu
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
        } else if (type === 'bar_chart') {
          // For bar charts, prioritize actual field names over generic keys
          xKey = xField || (availableKeys.includes('x') ? 'x' : availableKeys.includes('name') ? 'name' : availableKeys.includes('category') ? 'category' : availableKeys[0]);
          yKey = yField || (availableKeys.includes('y') ? 'y' : availableKeys.includes('value') ? 'value' : availableKeys[1] || availableKeys[0]);
        } else if (type === 'line_chart') {
          xKey = availableKeys.includes('x') ? 'x' : availableKeys.includes('date') ? 'date' : availableKeys[0];
          yKey = availableKeys.includes('y') ? 'y' : availableKeys.includes('value') ? 'value' : availableKeys[1] || availableKeys[0];
        }
        
      }
    } else {
      // If xKey and yKey are provided but don't exist in the data, try to auto-detect
      if (firstItem && (!firstItem[xKey] || !firstItem[yKey])) {
        const availableKeys = Object.keys(firstItem);
        
        if (type === 'pie_chart') {
          xKey = availableKeys.includes('name') ? 'name' : availableKeys.includes('label') ? 'label' : availableKeys[0];
          yKey = availableKeys.includes('value') ? 'value' : availableKeys[1] || availableKeys[0];
        } else if (type === 'bar_chart') {
          xKey = xField || (availableKeys.includes('x') ? 'x' : availableKeys.includes('name') ? 'name' : availableKeys.includes('category') ? 'category' : availableKeys[0]);
          yKey = yField || (availableKeys.includes('y') ? 'y' : availableKeys.includes('value') ? 'value' : availableKeys[1] || availableKeys[0]);
        } else if (type === 'line_chart') {
          xKey = availableKeys.includes('x') ? 'x' : availableKeys.includes('date') ? 'date' : availableKeys[0];
          yKey = availableKeys.includes('y') ? 'y' : availableKeys.includes('value') ? 'value' : availableKeys[1] || availableKeys[0];
        }
        
      }
    }
    
    // Handle dual Y-axes detection
    if (yKeys.length === 0 && yFields && yFields.length > 0) {
      yKeys = yFields;
    } else if (yKeys.length === 0 && firstItem) {
      const availableKeys = Object.keys(firstItem);
      // For dual Y-axes, try to find multiple numeric fields
      const numericKeys = availableKeys.filter(key => 
        key !== xKey && 
        key !== 'category' && 
        key !== 'label' &&
        typeof firstItem[key] === 'number' && 
        !isNaN(firstItem[key])
      );
      if (numericKeys.length >= 2) {
        yKeys = numericKeys.slice(0, 2); // Take first two numeric fields
      } else if (numericKeys.length === 1) {
        yKeys = [numericKeys[0]];
      }
    }
    
    

    

    
    // If we have yFields but the data only has 'x' and 'y' keys, we need to transform the data
    if (yFields && yFields.length > 1 && firstItem && firstItem.x !== undefined && firstItem.y !== undefined) {
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
        const transformedData = chartDataForRendering.map((item: any, index: number) => {
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
        });
        
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

    // CRITICAL FIX: Transform data for charts when data has generic keys
    let transformedChartData = chartDataForRendering;
    if ((type === 'bar_chart' || type === 'line_chart' || type === 'area_chart' || type === 'scatter_chart') && xField && yField && chartDataForRendering.length > 0) {
      const firstItem = chartDataForRendering[0];
      const availableKeys = Object.keys(firstItem);
      
      // Check if data has generic keys OR if the field names don't match what we expect
      const needsTransformation = availableKeys.includes('x') || availableKeys.includes('y') || availableKeys.includes('name') || availableKeys.includes('value') ||
                                 (xField && !availableKeys.includes(xField)) || (yField && !availableKeys.includes(yField));
      
      if (needsTransformation) {
        
        transformedChartData = chartDataForRendering.map((item: any) => {
          const transformed: any = {};
          
          // Map keys to actual field names
          if (item.x !== undefined) {
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
            transformed[xField] = item[Object.keys(item)[0]];
          }
          
          if (item.y !== undefined) {
            transformed[yField] = item.y;
          } else if (item.value !== undefined) {
            transformed[yField] = item.value;
          } else if (item.Volume !== undefined) {
            transformed[yField] = item.Volume;
          } else if (item.volume !== undefined) {
            transformed[yField] = item.volume;
          } else {
            transformed[yField] = item[Object.keys(item)[1]] || item[Object.keys(item)[0]];
          }
          
          // Preserve legend field if present
          if (legendField) {
            if (item[legendField] !== undefined) {
              transformed[legendField] = item[legendField];
            } else {
              const keys = Object.keys(item);
              const foundKey = keys.find(key => key.toLowerCase() === legendField.toLowerCase());
              if (foundKey) {
                transformed[foundKey] = item[foundKey];
              }
            }
          }

          return transformed;
        });

      }
    }

    switch (type) {
      case 'bar_chart':
        
        /* -------------------------------------------------------------
         * Multi-bar rendering when a legend field is provided
         * ----------------------------------------------------------- */
        if (legendField && legendValues.length > 0 && pivotedLineData.length > 0) {
          // Use first available key as X-axis key
          const xKeyForBar = xField || Object.keys(pivotedLineData[0])[0];
        return (
            <BarChart data={pivotedLineData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              {currentShowGrid && <CartesianGrid strokeDasharray="3 3" />}
              <XAxis
                dataKey={xKeyForBar}
                label={currentShowAxisLabels && xAxisLabel ? { value: capitalizeWords(xAxisLabel), position: 'bottom', style: axisLabelStyle } : undefined}
                tick={axisTickStyle}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatLargeNumber}
                label={currentShowAxisLabels && yAxisLabel ? { value: capitalizeWords(yAxisLabel), angle: -90, position: 'left', style: axisLabelStyle } : undefined}
                tick={axisTickStyle}
                tickLine={false}
              />
              <Tooltip 
                content={({ active, payload, label }) => {
                  if (active && payload && payload.length) {
                    return (
                      <div className="explore-chart-tooltip">
                        <p className="font-semibold text-gray-900 mb-2 text-sm">{label}</p>
                        {payload.map((entry: any, index: number) => {
                          return (
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
                  wrapperStyle={{ paddingTop: '15px', fontSize: '11px' }}
                />
              )}
              {legendValues.map((seriesKey, idx) => (
                <Bar
                  key={seriesKey}
                  dataKey={seriesKey}
                  name={seriesKey}
                  fill={palette[idx % palette.length]}
                  animationDuration={800}
                  animationEasing="ease-out"
                >
                  {currentShowDataLabels && (
                    <LabelList 
                      dataKey={seriesKey} 
                      position="top" 
                      formatter={(value) => formatLargeNumber(value)}
                      style={{ fontSize: '11px', fontWeight: '500', fill: '#374151' }}
                    />
                  )}
                </Bar>
              ))}
            </BarChart>
          );
        } else {
          // ---- Fallback to original single-bar rendering ----
          return (
            <BarChart data={transformedChartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              {currentShowGrid && <CartesianGrid strokeDasharray="3 3" />}
            <XAxis 
              dataKey={xKey} 
                label={currentShowAxisLabels && xAxisLabel && xAxisLabel.trim() ? { value: capitalizeWords(xAxisLabel), position: 'bottom', style: axisLabelStyle } : undefined}
              tick={axisTickStyle}
              tickLine={false}
            />
            {/* Primary Y-Axis (Left) */}
            <YAxis 
              yAxisId={0}
                label={currentShowAxisLabels && yAxisLabel && yAxisLabel.trim() ? { value: capitalizeWords(yAxisLabel), angle: -90, position: 'left', style: axisLabelStyle } : undefined}
              tick={axisTickStyle}
              tickLine={false}
              tickFormatter={formatLargeNumber}
            />
            {/* Secondary Y-Axis (Right) - only if we have dual Y-axes */}
            {(yKeys.length > 1 || (yFields && yFields.length > 1)) && (
              <YAxis 
                yAxisId={1}
                orientation="right"
                  label={currentShowAxisLabels && yAxisLabels && yAxisLabels[1] ? { value: capitalizeWords(yAxisLabels[1]), angle: 90, position: 'right', style: axisLabelStyle } : undefined}
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
                          displayName = yAxisLabel || yAxisLabels?.[0] || 'Value';
                        } else if (entry.dataKey === yKeys[1] || entry.dataKey === yFields?.[1]) {
                          displayName = yAxisLabels?.[1] || yFields?.[1] || 'Value';
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
                wrapperStyle={{ 
                  paddingTop: '15px',
                  paddingBottom: '10px',
                  fontSize: '11px',
                  marginBottom: '0px'
                }}
                formatter={(value, entry) => {
                  // Format legend labels for dual y-axes
                  if (yFields && yFields.length > 1) {
                    const fieldIndex = entry.dataKey === yKey ? 0 : 1;
                    const fieldName = yFields[fieldIndex];
                    const label = yAxisLabels && yAxisLabels[fieldIndex] ? yAxisLabels[fieldIndex] : fieldName;
                    return capitalizeWords(label);
                  }
                  // For single Y-axis, use the actual Y-axis label instead of generic "Value"
                  if (entry.dataKey === yKey) {
                    return capitalizeWords(yAxisLabel || yAxisLabels?.[0] || 'Value');
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
            <Bar dataKey={yKey} fill="url(#barGradient1)" animationDuration={800} animationEasing="ease-out" yAxisId={0}>
                {currentShowDataLabels && (
                <LabelList 
                  dataKey={yKey} 
                  position="top" 
                  formatter={(value) => formatLargeNumber(value)}
                  style={{ fontSize: '11px', fontWeight: '500', fill: '#374151' }}
                />
              )}
            </Bar>
            {/* Secondary Bar - only if we have dual Y-axes */}
            {(yKeys.length > 1 || (yFields && yFields.length > 1)) && (
              <Bar dataKey={yKeys[1] || yFields[1]} fill="url(#barGradient2)" animationDuration={800} animationEasing="ease-out" yAxisId={1}>
                  {currentShowDataLabels && (
                  <LabelList 
                    dataKey={yKeys[1] || yFields[1]} 
                    position="top" 
                    formatter={(value) => formatLargeNumber(value)}
                    style={{ fontSize: '11px', fontWeight: '500', fill: '#374151' }}
                  />
                )}
              </Bar>
            )}
          </BarChart>
        );
        }



      case 'line_chart':
        /* -------------------------------------------------------------
         * Multi-line rendering when a legend field is provided
         * ----------------------------------------------------------- */
        if (legendField && legendValues.length > 0 && pivotedLineData.length > 0) {
          // Use first available key as X-axis key
          const xKeyForLine = xField || Object.keys(pivotedLineData[0])[0];
          return (
            <LineChart data={pivotedLineData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              {currentShowGrid && <CartesianGrid strokeDasharray="3 3" />}
              <XAxis
                dataKey={xKeyForLine}
                label={currentShowAxisLabels && xAxisLabel ? { value: capitalizeWords(xAxisLabel), position: 'bottom', style: axisLabelStyle } : undefined}
                tick={axisTickStyle}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatLargeNumber}
                label={currentShowAxisLabels && yAxisLabel ? { value: capitalizeWords(yAxisLabel), angle: -90, position: 'left', style: axisLabelStyle } : undefined}
                tick={axisTickStyle}
                tickLine={false}
              />
              <Tooltip formatter={(v: number) => formatTooltipNumber(v as number)} />
              {currentShowLegend && (
                <Legend
                  layout="horizontal"
                  verticalAlign="bottom"
                  align="center"
                  wrapperStyle={{ paddingTop: '15px', fontSize: '11px' }}
                />
              )}
              {legendValues.map((seriesKey, idx) => (
                <Line
                  key={seriesKey}
                  type="monotone"
                  dataKey={seriesKey}
                  name={seriesKey}
                  stroke={palette[idx % palette.length]}
                  strokeWidth={2}
                  dot={{ r: 0 }}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: '#fff' }}
                >
                  {currentShowDataLabels && (
                    <LabelList
                      dataKey={seriesKey}
                      position="top"
                      formatter={formatLargeNumber}
                      style={{ fontSize: '11px', fontWeight: '500', fill: '#374151' }}
                    />
                  )}
                </Line>
              ))}
            </LineChart>
          );
        } else {
          // ---- Fallback to original single-line rendering ----
          // Original single line chart logic
          return (
            <LineChart data={transformedChartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }} className="explore-chart-line">
              {currentShowGrid && <CartesianGrid strokeDasharray="3 3" />}
              <XAxis 
                dataKey={xKey}
                label={currentShowAxisLabels && xAxisLabel && xAxisLabel.trim() ? { value: capitalizeWords(xAxisLabel), position: 'bottom', style: axisLabelStyle } : undefined}
                tick={axisTickStyle}
                tickLine={false}
              />
              {/* Primary Y-Axis (Left) */}
              <YAxis 
                yAxisId={0}
                label={currentShowAxisLabels && yAxisLabel && yAxisLabel.trim() ? { value: capitalizeWords(yAxisLabel), angle: -90, position: 'left', style: axisLabelStyle } : undefined}
                tick={axisTickStyle}
                tickLine={false}
                tickFormatter={formatLargeNumber}
              />
              {/* Secondary Y-Axis (Right) - only if we have dual Y-axes */}
              {(yKeys.length > 1 || (yFields && yFields.length > 1)) && (
                <YAxis 
                  yAxisId={1}
                  orientation="right"
                  label={currentShowAxisLabels && yAxisLabels && yAxisLabels[1] ? { value: capitalizeWords(yAxisLabels[1]), angle: 90, position: 'right', style: axisLabelStyle } : undefined}
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
                            displayName = yAxisLabel || yAxisLabels?.[0] || 'Value';
                          } else if (entry.dataKey === yKeys[1] || entry.dataKey === yFields?.[1]) {
                            displayName = yAxisLabels?.[1] || yFields?.[1] || 'Value';
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
                  wrapperStyle={{ 
                    paddingTop: '15px',
                    paddingBottom: '10px',
                    fontSize: '11px',
                    marginBottom: '0px'
                  }}
                  formatter={(value, entry) => {
                    // Format legend labels for dual y-axes
                    if (yFields && yFields.length > 1) {
                      const fieldIndex = entry.dataKey === yKey ? 0 : 1;
                      const fieldName = yFields[fieldIndex];
                      const label = yAxisLabels && yAxisLabels[fieldIndex] ? yAxisLabels[fieldIndex] : fieldName;
                      return capitalizeWords(label);
                    }
                    // For single Y-axis, use the actual Y-axis label instead of generic "Y"
                    if (entry.dataKey === yKey) {
                      return capitalizeWords(yAxisLabel || yAxisLabels?.[0] || 'Value');
                    }
                    return capitalizeWords(value);
                  }}
                />
              )}
              {/* Primary Line */}
              <Line 
                type="monotone" 
                dataKey={yKey} 
                stroke={palette[0]} 
                strokeWidth={2}
                dot={{ fill: palette[0], strokeWidth: 0, r: 0 }}
                activeDot={{ 
                  r: 6, 
                  fill: palette[0], 
                  stroke: 'white', 
                  strokeWidth: 3,
                  style: { cursor: 'pointer' }
                }}
                yAxisId={0}
              >
                {showDataLabels && (
                  <LabelList 
                    dataKey={yKey} 
                    position="top" 
                    formatter={(value) => formatLargeNumber(value)}
                    style={{ fontSize: '11px', fontWeight: '500', fill: '#374151' }}
                    offset={10}
                  />
                )}
              </Line>
              {/* Secondary Line - only if we have dual Y-axes */}
              {(yKeys.length > 1 || (yFields && yFields.length > 1)) && (
                <Line 
                  type="monotone" 
                  dataKey={yKeys[1] || yFields[1]} 
                  stroke={palette[1]} 
                  strokeWidth={2}
                  dot={{ fill: palette[1], strokeWidth: 0, r: 0 }}
                  activeDot={{ 
                    r: 6, 
                    fill: palette[1], 
                    stroke: 'white', 
                    strokeWidth: 3,
                    style: { cursor: 'pointer' }
                  }}
                  yAxisId={1}
                >
                  {showDataLabels && (
                    <LabelList 
                      dataKey={yKeys[1] || yFields[1]} 
                      position="top" 
                      formatter={(value) => formatLargeNumber(value)}
                      style={{ fontSize: '11px', fontWeight: '500', fill: '#374151' }}
                      offset={10}
                    />
                  )}
                </Line>
              )}
            </LineChart>
          );
        }
        break;

      case 'area_chart':
        if (legendField && legendValues.length > 0 && pivotedLineData.length > 0) {
          const xKeyForArea = xField || Object.keys(pivotedLineData[0])[0];
          return (
            <AreaChart data={pivotedLineData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              {currentShowGrid && <CartesianGrid strokeDasharray="3 3" />}
              <XAxis
                dataKey={xKeyForArea}
                label={currentShowAxisLabels && xAxisLabel ? { value: capitalizeWords(xAxisLabel), position: 'bottom', style: axisLabelStyle } : undefined}
                tick={axisTickStyle}
                tickLine={false}
              />
              <YAxis
                tickFormatter={formatLargeNumber}
                label={currentShowAxisLabels && yAxisLabel ? { value: capitalizeWords(yAxisLabel), angle: -90, position: 'left', style: axisLabelStyle } : undefined}
                tick={axisTickStyle}
                tickLine={false}
              />
              <Tooltip formatter={(v: number) => formatTooltipNumber(v)} />
              {currentShowLegend && (
                <Legend
                  layout="horizontal"
                  verticalAlign="bottom"
                  align="center"
                  wrapperStyle={{ paddingTop: '15px', fontSize: '11px' }}
                />
              )}
              {legendValues.map((seriesKey, idx) => (
                <Area
                  key={seriesKey}
                  type="monotone"
                  dataKey={seriesKey}
                  stroke={palette[idx % palette.length]}
                  fill={palette[(idx + 1) % palette.length]}
                />
              ))}
            </AreaChart>
          );
        }
        return (
          <AreaChart data={transformedChartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
            {currentShowGrid && <CartesianGrid strokeDasharray="3 3" />}
            <XAxis
              dataKey={xKey}
              label={currentShowAxisLabels && xAxisLabel && xAxisLabel.trim() ? { value: capitalizeWords(xAxisLabel), position: 'bottom', style: axisLabelStyle } : undefined}
              tick={axisTickStyle}
              tickLine={false}
            />
            <YAxis
              yAxisId={0}
              label={currentShowAxisLabels && yAxisLabel && yAxisLabel.trim() ? { value: capitalizeWords(yAxisLabel), angle: -90, position: 'left', style: axisLabelStyle } : undefined}
              tick={axisTickStyle}
              tickLine={false}
              tickFormatter={formatLargeNumber}
            />
            {(yKeys.length > 1 || (yFields && yFields.length > 1)) && (
              <YAxis
                yAxisId={1}
                orientation="right"
                label={currentShowAxisLabels && yAxisLabels && yAxisLabels[1] ? { value: capitalizeWords(yAxisLabels[1]), angle: 90, position: 'right', style: axisLabelStyle } : undefined}
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
                wrapperStyle={{ paddingTop: '15px', fontSize: '11px' }}
              />
            )}
            <Area type="monotone" dataKey={yKey} stroke={palette[0]} fill={palette[1]} yAxisId={0} />
            {(yKeys.length > 1 || (yFields && yFields.length > 1)) && (
              <Area type="monotone" dataKey={yKeys[1] || yFields[1]} stroke={palette[1]} fill={palette[2]} yAxisId={1} />
            )}
          </AreaChart>
        );

      case 'scatter_chart':
        return (
          <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
            {currentShowGrid && <CartesianGrid strokeDasharray="3 3" />}
            <XAxis
              dataKey={xKey}
              label={currentShowAxisLabels && xAxisLabel && xAxisLabel.trim() ? { value: capitalizeWords(xAxisLabel), position: 'bottom', style: axisLabelStyle } : undefined}
              tick={axisTickStyle}
              tickLine={false}
            />
            <YAxis
              yAxisId={0}
              label={currentShowAxisLabels && yAxisLabel && yAxisLabel.trim() ? { value: capitalizeWords(yAxisLabel), angle: -90, position: 'left', style: axisLabelStyle } : undefined}
              tick={axisTickStyle}
              tickLine={false}
              tickFormatter={formatLargeNumber}
            />
            {(yKeys.length > 1 || (yFields && yFields.length > 1)) && (
              <YAxis
                yAxisId={1}
                orientation="right"
                label={currentShowAxisLabels && yAxisLabels && yAxisLabels[1] ? { value: capitalizeWords(yAxisLabels[1]), angle: 90, position: 'right', style: axisLabelStyle } : undefined}
                tick={axisTickStyle}
                tickLine={false}
                tickFormatter={formatLargeNumber}
              />
            )}
            <Tooltip formatter={(v: number) => formatTooltipNumber(v)} />
            {legendField && currentShowLegend && (
              <Legend
                layout="horizontal"
                verticalAlign="bottom"
                align="center"
                wrapperStyle={{ paddingTop: '15px', fontSize: '11px' }}
              />
            )}
            {legendField && legendValues.length > 0 && pivotedLineData.length > 0 ? (
              legendValues.map((seriesKey, idx) => (
                <Scatter key={seriesKey} data={pivotedLineData} dataKey={seriesKey} name={seriesKey} fill={palette[idx % palette.length]} />
              ))
            ) : (
              <> 
                <Scatter data={transformedChartData} dataKey={yKey} fill={palette[0]} yAxisId={0} />
                {(yKeys.length > 1 || (yFields && yFields.length > 1)) && (
                  <Scatter data={transformedChartData} dataKey={yKeys[1] || yFields[1]} fill={palette[1]} yAxisId={1} />
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
                  <PieChart width={300} height={300} onContextMenu={handleContextMenu}>
                    <Pie
                      data={slices}
                      cx="50%"
                      cy="50%"
                      outerRadius="80%"
                      innerRadius="20%"
                      dataKey={measureKey}
                      nameKey={nameKey}
                      label={showDataLabels ? <CustomPieLabel /> : null}
                      labelLine={false}
                    >
                      {slices.map((entry: any, sliceIdx: number) => (
                        <Cell
                          key={`cell-${sliceIdx}`}
                          fill={palette[sliceIdx % palette.length]}
                          stroke="#fff"
                          strokeWidth={2}
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
            <PieChart margin={{ top: 20, right: 20, left: 20, bottom: 60 }} onContextMenu={handleContextMenu}>
              <Pie
                data={chartDataForRendering}
                cx="50%"
                cy="50%"
                label={showDataLabels ? <CustomPieLabel /> : null}
                labelLine={false}
                outerRadius="80%"
                innerRadius="20%"
                fill="#8884d8"
                dataKey={primaryYKey}
                nameKey={xKey}
                animationBegin={0}
                animationDuration={1000}
                animationEasing="ease-out"
              >
                {chartDataForRendering.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={palette[index % palette.length]}
                    stroke="#fff"
                    strokeWidth={2}
                  />
                ))}
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
                            displayName = yAxisLabel || yAxisLabels?.[0] || 'Value';
                          } else if (entry.dataKey === yKeys[1] || entry.dataKey === yFields?.[1]) {
                            displayName = yAxisLabels?.[1] || yFields?.[1] || 'Value';
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
            <PieChart margin={{ top: 20, right: 20, left: 20, bottom: 60 }} onContextMenu={handleContextMenu}>
              <Pie
                data={chartDataForRendering}
                cx="50%"
                cy="50%"
                label={showDataLabels ? <CustomPieLabel /> : null}
                labelLine={false}
                outerRadius="80%"
                innerRadius="20%"
                fill="#8884d8"
                dataKey={yKey}
                nameKey={xKey}
                animationBegin={0}
                animationDuration={1000}
                animationEasing="ease-out"
              >
                {chartDataForRendering.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={palette[index % palette.length]}
                    stroke="#fff"
                    strokeWidth={2}
                  />
                ))}
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
                            displayName = yAxisLabel || yAxisLabels?.[0] || 'Value';
                          } else if (entry.dataKey === yKeys[1] || entry.dataKey === yFields?.[1]) {
                            displayName = yAxisLabels?.[1] || yFields?.[1] || 'Value';
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
    <div className="w-full h-full flex flex-col">
      {title && (
        <div className="text-center mb-3">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
        </div>
      )}

      <div className="w-full h-full relative flex-1 min-w-0">
        <div 
          className={`w-full h-full transition-all duration-500 ease-in-out ${enableScroll ? 'overflow-x-auto overflow-y-hidden chart-scroll-container' : 'overflow-hidden'}`}
          style={{ 
            paddingBottom: type === 'pie_chart' ? '10px' : '10px',
            paddingTop: type === 'pie_chart' ? '8px' : '16px',
            maxWidth: '100%',
            width: '100%',
            scrollbarWidth: enableScroll ? 'thin' : 'none',
            scrollbarColor: enableScroll ? '#cbd5e1 #f1f5f9' : 'transparent'
          }}
          onContextMenu={handleContextMenu}
          ref={chartRef}
        >
          <div 
            className={`w-full h-full p-4 ${type === 'pie_chart' ? 'flex items-center justify-center' : ''}`}
            style={{ 
              minWidth: enableScroll ? (() => {
                // Calculate width based on chart type and data length
                const baseWidth = 800; // Minimum width
                let calculatedWidth = baseWidth;
                
                if (type === 'line_chart' || type === 'bar_chart') {
                  // For line and bar charts, allocate more width per data point
                  calculatedWidth = Math.max(chartDataForRendering.length * 60, baseWidth);
                } else if (type === 'pie_chart') {
                  // For pie charts, use fixed width as they don't need horizontal scrolling
                  calculatedWidth = baseWidth;
                }
                
                return `${calculatedWidth}px`;
              })() : '100%',
              maxWidth: '100%',
              width: '100%',
              overflow: 'hidden',
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
        <ContextMenu />
        <ColorThemeSubmenu />
      </div>
    </div>
  );
};

export default RechartsChartRenderer; 