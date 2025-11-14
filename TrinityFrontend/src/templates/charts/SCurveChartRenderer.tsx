import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import "./chart.css";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  LabelList
} from 'recharts';
import * as d3 from 'd3';

// Import the AxisLabelEditor from RechartsChartRenderer
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

// Excel-like color themes (same as RechartsChartRenderer)
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
  }
};

const FONT_FAMILY = `'Inter', 'Segoe UI', sans-serif`;

// Number formatting function for large numbers with proper precision
const formatLargeNumber = (value: any): string => {
  if (value === undefined || value === null || isNaN(value)) {
    return "";
  }
  
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numValue)) {
    return "";
  }
  
  const absValue = Math.abs(numValue);

  const formatScaled = (scaled: number): string => {
    return parseFloat(scaled.toFixed(2)).toString();
  };

  if (absValue >= 1_000_000_000) {
    return `${formatScaled(numValue / 1_000_000_000)}B`;
  } else if (absValue >= 1_000_000) {
    return `${formatScaled(numValue / 1_000_000)}M`;
  } else if (absValue >= 1_000) {
    return `${formatScaled(numValue / 1_000)}K`;
  }
  return parseFloat(numValue.toFixed(2)).toString();
};

// Format numbers for tooltips - show exact values without suffixes
const formatTooltipNumber = (value: any): string => {
  if (value === undefined || value === null || isNaN(value)) {
    return "";
  }
  
  const numValue = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(numValue)) {
    return "";
  }
  
  if (Number.isInteger(numValue)) {
    return numValue.toLocaleString();
  } else {
    return numValue.toLocaleString(undefined, { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 6 
    });
  }
};

interface SCurveData {
  x: number;
  y: number;
  percent_change: number;
}

interface CurveAnalysis {
  max_point: {
    media_value: number;
    volume_prediction: number;
    percent_change: number | null;
  };
  min_point: {
    media_value: number;
    volume_prediction: number;
    percent_change: number | null;
  };
}

interface SCurveProps {
  data: SCurveData[];
  curveAnalysis?: CurveAnalysis;
  width?: number;
  height?: number;
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  colors?: string[];
  enableScroll?: boolean;
  theme?: string;
  onThemeChange?: (theme: string) => void;
  onGridToggle?: (enabled: boolean) => void;
  onLegendToggle?: (enabled: boolean) => void;
  onAxisLabelsToggle?: (enabled: boolean) => void;
  onDataLabelsToggle?: (enabled: boolean) => void;
  onSave?: () => void;
  showLegend?: boolean;
  // showAxisLabels?: boolean;
  showXAxisLabels?: boolean; // External control for X axis labels visibility
  showYAxisLabels?: boolean; // External control for Y axis labels visibility
  showDataLabels?: boolean;
  initialShowDataLabels?: boolean;
  showGrid?: boolean;
  showMinMaxLines?: boolean; // New prop to control min/max lines visibility
}

const SCurveChartRenderer: React.FC<SCurveProps> = ({ 
  data, 
  curveAnalysis,
  width = 0,
  height = 300,
  title,
  xAxisLabel = "Media Investment",
  yAxisLabel = "Volume Prediction",
  colors,
  enableScroll = false,
  theme: propTheme,
  onThemeChange,
  onGridToggle,
  onLegendToggle,
  onAxisLabelsToggle,
  onDataLabelsToggle,
  onSave,
  showLegend: propShowLegend,
  // showAxisLabels: propShowAxisLabels,
  showXAxisLabels: propShowXAxisLabels,
  showYAxisLabels: propShowYAxisLabels,
  showDataLabels: propShowDataLabels,
  initialShowDataLabels,
  showGrid: propShowGrid,
  showMinMaxLines = true
}) => {

  // State for color theme
  const [selectedTheme, setSelectedTheme] = useState<string>('default');
  const currentTheme = selectedTheme !== 'default' ? selectedTheme : (propTheme || 'default');
  
  useEffect(() => {
    if (propTheme && selectedTheme === 'default') {
      setSelectedTheme(propTheme);
    }
  }, [propTheme, selectedTheme]);

  const [showContextMenu, setShowContextMenu] = useState(false);
  const [showColorSubmenu, setShowColorSubmenu] = useState(false);
  const [showAxisLabelSubmenu, setShowAxisLabelSubmenu] = useState(false);
  const [showAxisToggleSubmenu, setShowAxisToggleSubmenu] = useState(false);
  const [colorSubmenuPos, setColorSubmenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [axisLabelSubmenuPos, setAxisLabelSubmenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [axisToggleSubmenuPos, setAxisToggleSubmenuPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 });
  const chartRef = useRef<HTMLDivElement>(null);

  // State for custom axis labels
  const getStorageKey = () => {
    const chartId = `${xAxisLabel}_${yAxisLabel}_${width}_${height}_${title || 'no_title'}`;
    return `s_curve_labels_${chartId}`;
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
  const [customTitle, setCustomTitle] = useState<string>(() => {
    try {
      return localStorage.getItem(`${getStorageKey()}_title`) || '';
    } catch {
      return '';
    }
  });

  // Save custom labels to localStorage
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
  }, [customXAxisLabel, xAxisLabel, yAxisLabel]);

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
  }, [customYAxisLabel, xAxisLabel, yAxisLabel]);

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
  }, [customTitle, xAxisLabel, yAxisLabel]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowContextMenu(false);
    setShowColorSubmenu(false);
    setShowAxisLabelSubmenu(false);
    setShowAxisToggleSubmenu(false);
  };

  // Handler for axis label editing submenu
  const handleAxisLabelClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setAxisLabelSubmenuPos({ x: rect.right + 4, y: rect.top });
    setShowAxisLabelSubmenu(prev => !prev);
    setShowColorSubmenu(false);
    setShowAxisToggleSubmenu(false);
  }, []);

  // Handler for axis toggle submenu
  const handleAxisToggleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setAxisToggleSubmenuPos({ x: rect.right + 4, y: rect.top });
    setShowAxisToggleSubmenu(prev => !prev);
    setShowColorSubmenu(false);
    setShowAxisLabelSubmenu(false);
  }, []);

  const overlayVisible = showContextMenu || showColorSubmenu || showAxisLabelSubmenu || showAxisToggleSubmenu;

  // State for chart options
  const [showGrid, setShowGrid] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [showAxisLabels, setShowAxisLabels] = useState(true);
  const [showXAxisLabels, setShowXAxisLabels] = useState(true);
  const [showYAxisLabels, setShowYAxisLabels] = useState(true);
  const [showDataLabels, setShowDataLabels] = useState(initialShowDataLabels ?? true);

  // Sync internal states with external props
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

  // Use external props if provided, otherwise use internal state
  const currentShowGrid = propShowGrid !== undefined ? propShowGrid : showGrid;
  const currentShowLegend = propShowLegend !== undefined ? propShowLegend : showLegend;
  // const currentShowAxisLabels = propShowAxisLabels !== undefined ? propShowAxisLabels : showAxisLabels;
  const currentShowXAxisLabels = propShowXAxisLabels !== undefined ? propShowXAxisLabels : showXAxisLabels;
  const currentShowYAxisLabels = propShowYAxisLabels !== undefined ? propShowYAxisLabels : showYAxisLabels;
  const currentShowDataLabels = propShowDataLabels !== undefined ? propShowDataLabels : showDataLabels;

  // Use custom axis labels if provided, otherwise fall back to props
  const effectiveXAxisLabel = customXAxisLabel || xAxisLabel;
  const effectiveYAxisLabel = customYAxisLabel || yAxisLabel;

  // Calculate dynamic margins based on axis labels visibility
  const getChartMargins = () => {
    // Base margins for when no axis labels are shown
    let left = 20;
    let bottom = 80;
    
    // Adjust based on which axis labels are visible
    if (currentShowYAxisLabels) {
      left = 80; // Add space for Y-axis label
    }
    
    // Bottom margin stays at 80 for both with and without X-axis labels
    // (space needed for category names)
    
    return { top: 20, right: 20, left, bottom };
  };

  // Get current theme colors
  const theme = useMemo(() => {
    const selectedTheme = COLOR_THEMES[currentTheme as keyof typeof COLOR_THEMES] || COLOR_THEMES.default;
    return selectedTheme;
  }, [currentTheme]);

  const palette = useMemo(() => {
    const themePalette = (colors && colors.length > 0) ? colors : theme.palette;
    return themePalette && themePalette.length > 0 ? themePalette : ['#6366f1', '#a5b4fc', '#e0e7ff'];
  }, [colors, currentTheme, theme.palette]);
  
  // Helper function to capitalize first letter of each word
  const capitalizeWords = (text: string): string => {
    return text.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  };

  // Styling for axis ticks & labels
  const axisTickStyle = { fontFamily: FONT_FAMILY, fontSize: 12, fill: '#475569' } as const;
  const xAxisTickStyle = { fontFamily: FONT_FAMILY, fontSize: 12, fill: '#475569', angle: -45, textAnchor: 'end' } as const;

  // Compact formatter for axis and marker labels
  // 0-999: show as-is
  // 1,000-999,999: show in K
  // 1,000,000 and above: show in M
  const formatCompact = (value: any): string => {
    const num = typeof value === 'string' ? parseFloat(value) : value;
    if (num === undefined || num === null || isNaN(num)) return '';
    const abs = Math.abs(num);
    if (abs < 1_000) {
      return Number.isInteger(num) ? num.toString() : num.toFixed(2);
    }
    if (abs < 1_000_000) {
      return `${(num / 1_000).toFixed(2)}K`;
    }
    return `${(num / 1_000_000).toFixed(2)}M`;
  };
  
  const axisLabelStyle = {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: 'bold',
    fill: '#334155',
    textAnchor: 'middle'
  } as const;
  
  const effectiveYAxisLabelStyle = {
    fontFamily: FONT_FAMILY,
    fontSize: 14,
    fontWeight: 'bold',
    fill: '#334155',
    textAnchor: 'middle',
  } as const;
  
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
    setShowColorSubmenu(false);
    setShowAxisLabelSubmenu(false);
  };

  // Handle theme change
  const handleThemeChange = (themeName: string) => {
    setSelectedTheme(themeName);
    setShowContextMenu(false);
    setShowColorSubmenu(false);
    
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
    setShowAxisLabelSubmenu(false);
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
    setShowXAxisLabels(newAxisLabelsState);
    setShowYAxisLabels(newAxisLabelsState);
    setShowContextMenu(false);
    setShowColorSubmenu(false);
    if (onAxisLabelsToggle) {
      onAxisLabelsToggle(newAxisLabelsState);
    }
  };

  // Handle X-axis labels toggle
  const handleXAxisLabelsToggle = () => {
    const newXAxisLabelsState = !showXAxisLabels;
    setShowXAxisLabels(newXAxisLabelsState);
    setShowContextMenu(false);
    setShowColorSubmenu(false);
  };

  // Handle Y-axis labels toggle
  const handleYAxisLabelsToggle = () => {
    const newYAxisLabelsState = !showYAxisLabels;
    setShowYAxisLabels(newYAxisLabelsState);
    setShowContextMenu(false);
    setShowColorSubmenu(false);
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
      const target = e.target as Element;
      const isOutsideMainMenu = !target.closest('.context-menu');
      const isOutsideColorSubmenu = !target.closest('.color-submenu');
      const isOutsideAxisLabelSubmenu = !target.closest('.axis-label-submenu');
      const isOutsideAxisToggleSubmenu = !target.closest('.axis-toggle-submenu');

      if (isOutsideMainMenu && isOutsideColorSubmenu && isOutsideAxisLabelSubmenu && isOutsideAxisToggleSubmenu) {
        setTimeout(() => {
          setShowContextMenu(false);
          setShowColorSubmenu(false);
          setShowAxisLabelSubmenu(false);
          setShowAxisToggleSubmenu(false);
        }, 50);
      }
    };

    if (showContextMenu || showColorSubmenu || showAxisLabelSubmenu || showAxisToggleSubmenu) {
      const timeoutId = setTimeout(() => {
        document.addEventListener('click', handleClickOutside, false);
      }, 200);
      
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('click', handleClickOutside, false);
      };
    }
  }, [showContextMenu, showColorSubmenu, showAxisLabelSubmenu, showAxisToggleSubmenu]);

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

  // Axis Label Submenu component
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
    // Check if data is empty or invalid
    if (!data || data.length === 0 || !Array.isArray(data)) {
      return (
        <div className="flex items-center justify-center h-full text-gray-500">
          <div className="text-center">
            <div className="text-lg font-medium">No Data Available</div>
            <div className="text-sm">No S-curve data available for this variable</div>
          </div>
        </div>
      );
    }

    // Precompute y-min (x-axis baseline) and helpers to obtain y at a given x
    const yMin = Math.min(...data.map(d => (typeof d.y === 'number' ? d.y : Number(d.y) || 0)));
    const getNearestYAtX = (xValue: number | undefined | null): number | null => {
      if (xValue === undefined || xValue === null || !data || data.length === 0) return null;
      let nearest = data[0];
      let minDelta = Math.abs((data[0].x as number) - (xValue as number));
      for (let i = 1; i < data.length; i++) {
        const delta = Math.abs((data[i].x as number) - (xValue as number));
        if (delta < minDelta) {
          minDelta = delta;
          nearest = data[i];
        }
      }
      return typeof nearest.y === 'number' ? nearest.y : Number(nearest.y) || 0;
    };

    const minPointY = curveAnalysis?.min_point ? getNearestYAtX(curveAnalysis.min_point.media_value) : null;
    const maxPointY = curveAnalysis?.max_point ? getNearestYAtX(curveAnalysis.max_point.media_value) : null;
    const basePointY = curveAnalysis?.base_point ? getNearestYAtX(curveAnalysis.base_point.media_value) : null;

    return (
      <LineChart data={data} margin={getChartMargins()}>
        {currentShowGrid && <CartesianGrid strokeDasharray="3 3" />}
        
        <XAxis
          dataKey="x"
          label={currentShowXAxisLabels && effectiveXAxisLabel && effectiveXAxisLabel.trim() ? 
            { value: capitalizeWords(effectiveXAxisLabel), position: 'bottom', style: effectiveXAxisLabelStyle, offset: 36 } : 
            undefined
          }
          tick={xAxisTickStyle}
          tickLine={false}
          tickFormatter={formatCompact}
          domain={['dataMin', 'dataMax']}
        />
        
        <YAxis
          label={currentShowYAxisLabels && effectiveYAxisLabel && effectiveYAxisLabel.trim() ? 
            // Increase label offset to push text further from the Y-axis line
            { value: capitalizeWords(effectiveYAxisLabel), angle: -90, position: 'left', style: effectiveYAxisLabelStyle, offset: 20 } : 
            undefined
          }
          tick={axisTickStyle}
          tickLine={false}
          tickFormatter={formatCompact}
          domain={['dataMin', 'dataMax']}
        />
        
        <Tooltip 
          content={({ active, payload, label }) => {
            if (active && payload && payload.length) {
              return (
                <div className="explore-chart-tooltip">
                  <p className="font-semibold text-gray-900 mb-2 text-sm">
                    Media Investment: {formatCompact(label)}
                  </p>
                  {payload.map((entry: any, index: number) => (
                    <div key={index} className="flex items-center gap-2 mb-1">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className="text-sm font-medium text-gray-700">
                        Volume Prediction: 
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

        {/* Main S-curve line */}
        <Line 
          type="monotone" 
          dataKey="y" 
          stroke={palette[0]} 
          strokeWidth={3}
          dot={{ fill: palette[0], strokeWidth: 0, r: 0 }}
          activeDot={{ 
            r: 6, 
            fill: palette[0], 
            stroke: 'white', 
            strokeWidth: 3,
            style: { cursor: 'pointer' }
          }}
        >
          {currentShowDataLabels && (
            <LabelList 
              dataKey="y" 
              position="top" 
              formatter={(value) => formatLargeNumber(value)}
              style={{ fontSize: '11px', fontWeight: '500', fill: '#374151' }}
              offset={10}
            />
          )}
        </Line>

        {/* Min Point Vertical Line */}
        {showMinMaxLines && curveAnalysis?.min_point && (minPointY !== null) && (
          <ReferenceLine
            segment={[
              { x: curveAnalysis.min_point.media_value, y: yMin },
              { x: curveAnalysis.min_point.media_value, y: minPointY }
            ]}
            stroke="#ef4444"
            strokeWidth={2}
            strokeDasharray="5 5"
            label={{
              value: `${formatCompact(curveAnalysis.min_point.media_value)}`,
              position: "top",
              style: { 
                fontSize: '12px', 
                fontWeight: 'bold', 
                fill: '#ef4444',
                textAnchor: 'middle'
              }
            }}
          />
        )}

        {/* Max Point Vertical Line */}
        {showMinMaxLines && curveAnalysis?.max_point && (maxPointY !== null) && (
          <ReferenceLine
            segment={[
              { x: curveAnalysis.max_point.media_value, y: yMin },
              { x: curveAnalysis.max_point.media_value, y: maxPointY }
            ]}
            stroke="#10b981"
            strokeWidth={2}
            strokeDasharray="5 5"
            label={{
              value: `${formatCompact(curveAnalysis.max_point.media_value)}`,
              position: "top",
              style: { 
                fontSize: '12px', 
                fontWeight: 'bold', 
                fill: '#10b981',
                textAnchor: 'middle'
              }
            }}
          />
        )}

        {/* Base (Original) Point Vertical Line */}
        {curveAnalysis?.base_point && (basePointY !== null) && (
          <ReferenceLine
            segment={[
              { x: curveAnalysis.base_point.media_value, y: yMin },
              { x: curveAnalysis.base_point.media_value, y: basePointY }
            ]}
            stroke="#111827"
            strokeWidth={2}
            strokeDasharray="3 3"
            label={{
              value: `${formatCompact(curveAnalysis.base_point.media_value)}`,
              position: "top",
              style: { 
                fontSize: '12px', 
                fontWeight: 'bold', 
                fill: '#111827',
                textAnchor: 'middle'
              }
            }}
          />
        )}
      </LineChart>
    );
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div
        className="w-full h-full relative flex-1 min-w-0"
        style={{ height: height ? `${height}px` : '100%', width: width ? `${width}px` : '100%' }}
      >
        <div 
          className="w-full h-full transition-all duration-500 ease-in-out overflow-y-auto overflow-x-hidden chart-scroll-container"
          style={{ 
            paddingBottom: '10px',
            paddingTop: '16px',
            maxWidth: '100%',
            width: '100%',
            scrollbarWidth: 'thin',
            scrollbarColor: '#cbd5e1 #f1f5f9'
          }}
          onContextMenu={handleContextMenu}
          ref={chartRef}
        >
          <div 
            className="w-full h-full p-4"
            style={{ 
              minHeight: '300px',
              maxWidth: '100%',
              width: '100%',
              overflow: 'visible'
            }}
          >
            <ResponsiveContainer 
              width="100%" 
              height="100%" 
              className="w-full h-full"
              style={{ 
                maxWidth: '100%', 
                overflow: 'hidden'
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
                        <p className="text-sm">Error rendering S-curve chart</p>
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
        <AxisLabelSubmenu />
        <AxisToggleSubmenu />
      </div>
    </div>
  );
};

export default SCurveChartRenderer;
