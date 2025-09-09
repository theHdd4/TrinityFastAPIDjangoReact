import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend, Tooltip, LabelList } from 'recharts';
import { Settings, ChevronDown } from 'lucide-react';

// Color themes from chart template - comprehensive set
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
    palette: ['#292524', '#78716c', '#a8a29e', '#d6d3d1', '#f5f5f4', '#fafaf9']
  }
};

interface ScenarioData {
  identifiers: Record<string, string>;
  prediction: number;
  pct_uplift: number;
  combinationLabel: string;
  run_id: string;
  baseline?: number;
  delta?: number;
  features?: Record<string, any>;
}

interface ScenarioResultsChartProps {
  data: ScenarioData[];
  width?: number;
  height?: number;
  viewMode?: 'individual' | 'aggregated';
  dataLabelType?: 'y-values' | 'uplift';
  yVariable?: string;
  xAxisLabel?: string;
  viewSelectedIdentifiers?: Record<string, string[]>;
  theme?: string;
  onThemeChange?: (theme: string) => void;
  onGridToggle?: (enabled: boolean) => void;
  onLegendToggle?: (enabled: boolean) => void;
  onAxisLabelsToggle?: (enabled: boolean) => void;
  onDataLabelsToggle?: (enabled: boolean) => void;
  showLegend?: boolean;
  showAxisLabels?: boolean;
  showDataLabels?: boolean;
  showGrid?: boolean;
}

export const ScenarioResultsChart: React.FC<ScenarioResultsChartProps> = ({ 
  data, 
  width = 800, 
  height = 400,
  viewMode = 'individual',
  dataLabelType = 'y-values',
  yVariable = 'Value',
  xAxisLabel = 'Categories',
  viewSelectedIdentifiers = {},
  theme: propTheme,
  onThemeChange,
  onGridToggle,
  onLegendToggle,
  onAxisLabelsToggle,
  onDataLabelsToggle,
  showLegend: propShowLegend,
  showAxisLabels: propShowAxisLabels,
  showDataLabels: propShowDataLabels,
  showGrid: propShowGrid
}) => {

  
  // Theme state management
  const [selectedTheme, setSelectedTheme] = useState<string>('default');
  const currentTheme = selectedTheme !== 'default' ? selectedTheme : (propTheme || 'default');
  
  // Toggle state management
  const [showGrid, setShowGrid] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [showAxisLabels, setShowAxisLabels] = useState(true);
  const [showDataLabels, setShowDataLabels] = useState(false);
  
  // Menu state
  const [showMenu, setShowMenu] = useState(false);
  const [showColorSubmenu, setShowColorSubmenu] = useState(false);
  const [showSortSubmenu, setShowSortSubmenu] = useState(false);
  const [colorSubmenuPos, setColorSubmenuPos] = useState({ x: 0, y: 0 });
  const [sortSubmenuPos, setSortSubmenuPos] = useState({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  
  // Use external props if provided, otherwise use internal state
  const currentShowGrid = propShowGrid !== undefined ? propShowGrid : showGrid;
  const currentShowLegend = propShowLegend !== undefined ? propShowLegend : showLegend;
  const currentShowAxisLabels = propShowAxisLabels !== undefined ? propShowAxisLabels : showAxisLabels;
  const currentShowDataLabels = propShowDataLabels !== undefined ? propShowDataLabels : showDataLabels;
  
  
  // Get current theme colors
  const theme = useMemo(() => {
    return COLOR_THEMES[currentTheme as keyof typeof COLOR_THEMES] || COLOR_THEMES.default;
  }, [currentTheme]);

  // Helper function to format data labels in compact format
  const formatDataLabel = (value: number, dataKey: string) => {
    // Safety check for value
    if (typeof value !== 'number' || isNaN(value)) {
      return '0';
    }
    
    // For uplift chart, always show percentage with 3 decimal places
    if (dataLabelType === 'uplift') {
      return `${value.toFixed(3)}%`;
    }
    
    // For y-values chart, show compact format
    if (value >= 1000000000) {
      return `${(value / 1000000000).toFixed(1)}b`;
    } else if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}m`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`;
    } else {
      return value.toString();
    }
  };

  
  // Toggle handlers
  const handleGridToggle = () => {
    const newGridState = !showGrid;
    setShowGrid(newGridState);
    if (onGridToggle) {
      onGridToggle(newGridState);
    }
  };

  const handleLegendToggle = () => {
    const newLegendState = !showLegend;
    setShowLegend(newLegendState);
    if (onLegendToggle) {
      onLegendToggle(newLegendState);
    }
  };

  const handleAxisLabelsToggle = () => {
    const newAxisLabelsState = !showAxisLabels;
    setShowAxisLabels(newAxisLabelsState);
    if (onAxisLabelsToggle) {
      onAxisLabelsToggle(newAxisLabelsState);
    }
  };

  const handleDataLabelsToggle = () => {
    const newDataLabelsState = !showDataLabels;
    setShowDataLabels(newDataLabelsState);
    if (onDataLabelsToggle) {
      onDataLabelsToggle(newDataLabelsState);
    }
  };

  // Menu handlers
  const handleMenuToggle = () => {
    setShowMenu(!showMenu);
    setShowColorSubmenu(false);
  };

  // Right-click context menu handler
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
    setShowMenu(false);
    setShowColorSubmenu(false);
  };

  // Close context menu
  const closeContextMenu = () => {
    setContextMenu(null);
  };

  // Handle sort submenu toggle
  const handleSortClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setSortSubmenuPos({ x: rect.right + 4, y: rect.top });
    setShowSortSubmenu(!showSortSubmenu);
    setShowColorSubmenu(false);
  };

  // Apply selected sort order
  const handleSortChange = (order: 'asc' | 'desc' | null) => {
    setSortOrder(order);
    setContextMenu(null);
    setShowSortSubmenu(false);
  };

  const handleColorThemeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const submenuWidth = 220; // Width of the color submenu
    const spacing = 4; // Spacing from the menu button
    
    // Calculate position to the left of the menu button
    let x = rect.left - submenuWidth - spacing;
    
    // Ensure the menu doesn't go off-screen on the left
    if (x < 10) {
      x = 10; // Minimum 10px from screen edge
    }
    
    setColorSubmenuPos({ x, y: rect.top });
    setShowColorSubmenu(!showColorSubmenu);
  };

  const handleThemeChange = (themeName: string) => {
    setSelectedTheme(themeName);
    setShowMenu(false);
    setShowColorSubmenu(false);
    if (onThemeChange) {
      onThemeChange(themeName);
    }
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Element;
      const isOutsideMainMenu = !target.closest('.dropdown-menu');
      const isOutsideColorSubmenu = !target.closest('.color-submenu');
      const isOutsideSortSubmenu = !target.closest('.sort-submenu');
      const isOutsideContextMenu = !target.closest('.context-menu');

      if (isOutsideMainMenu && isOutsideColorSubmenu && isOutsideSortSubmenu && isOutsideContextMenu) {
        setTimeout(() => {
          setShowMenu(false);
          setShowColorSubmenu(false);
          setShowSortSubmenu(false);
          setContextMenu(null);
        }, 50);
      }
    };

    if (showMenu || showColorSubmenu || showSortSubmenu || contextMenu) {
      const timeoutId = setTimeout(() => {
        document.addEventListener('click', handleClickOutside, false);
      }, 200);
      
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('click', handleClickOutside, false);
      };
    }
  }, [showMenu, showColorSubmenu, showSortSubmenu, contextMenu]);
  
  // Transform data for y-values chart
  const yValuesChartData = useMemo(() => {
    const transformedData = data.map(item => {
      const chartItem = {
        name: item.combinationLabel,
        baseline: item.baseline || 0,
        scenario: item.scenario || 0,
        // ✅ NEW: Store identifiers for multi-line labels
        identifiers: item.identifiers || {}
      };
      return chartItem;
    });

    // Apply sorting if needed
    if (sortOrder === 'asc') {
      return [...transformedData].sort((a, b) => a.scenario - b.scenario);
    } else if (sortOrder === 'desc') {
      return [...transformedData].sort((a, b) => b.scenario - a.scenario);
    }
    
    return transformedData;
  }, [data, sortOrder]);

  // Transform data for uplift chart
  const upliftChartData = useMemo(() => {
    const transformedData = data.map(item => {
      // Extract uplift value properly - it might still be an object from backend
      let upliftValue = 0;
      if (typeof item.pct_uplift === 'object' && item.pct_uplift?.prediction !== undefined) {
        upliftValue = item.pct_uplift.prediction;
      } else if (typeof item.pct_uplift === 'number') {
        upliftValue = item.pct_uplift;
      }
      
      const chartItem = {
        name: item.combinationLabel,
        baseline: 0, // No baseline for uplift chart
        scenario: upliftValue, // Use uplift as the scenario value
        // ✅ NEW: Store identifiers for multi-line labels
        identifiers: item.identifiers || {}
      };
      return chartItem;
    });

    // Apply sorting if needed
    if (sortOrder === 'asc') {
      return [...transformedData].sort((a, b) => a.scenario - b.scenario);
    } else if (sortOrder === 'desc') {
      return [...transformedData].sort((a, b) => b.scenario - a.scenario);
    }
    
    return transformedData;
  }, [data, sortOrder]);

  // Choose which chart data to use based on dataLabelType
  const chartData = dataLabelType === 'uplift' ? upliftChartData : yValuesChartData;

  // ✅ ENHANCED: Multi-line X-axis labels with identifier values
  const formatXAxisTick = (tickItem: any, index: number) => {
    const dataItem = chartData[index];
    if (!dataItem) {
      return tickItem;
    }
    
    // First line: Combination name
    const combinationText = dataItem.name || 'Unknown';
    
    // Second line: Identifier values
    const identifierValuesText = dataItem.identifiers && Object.keys(dataItem.identifiers).length > 0
      ? Object.entries(dataItem.identifiers)
          .map(([key, value]) => value)
          .join(' ')
      : '';
    
    return {
      combinationText,
      identifierValuesText
    };
  };

  // Custom tooltip content
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const baselineData = payload.find((p: any) => p.dataKey === 'baseline');
      const scenarioData = payload.find((p: any) => p.dataKey === 'scenario');
      
      
      // Extract values safely
      const baselineValue = baselineData?.value || baselineData?.payload?.baseline || 0;
      const scenarioValue = scenarioData?.value || scenarioData?.payload?.prediction || 0;
      
      // Calculate uplift safely
      let upliftPercentage = 'N/A';
      if (baselineValue && baselineValue !== 0 && scenarioValue !== undefined) {
        upliftPercentage = ((scenarioValue - baselineValue) / baselineValue * 100).toFixed(2) + '%';
      }
      
      // Get identifier values for tooltip
      const identifierValues = payload[0]?.payload?.identifiers || {};
      const identifierValuesText = Object.keys(identifierValues).length > 0
        ? Object.entries(identifierValues)
            .map(([key, value]) => `${key}: ${value}`)
            .join(', ')
        : '';

      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-800 mb-2">{label}</p>
          {identifierValuesText && (
            <p className="text-gray-600 text-xs mb-2 border-b pb-2">
              {identifierValuesText}
            </p>
          )}
          {baselineData && (
            <p className="text-blue-600 text-sm">
              Baseline: {typeof baselineValue === 'number' ? baselineValue.toLocaleString() : String(baselineValue)}
            </p>
          )}
          {scenarioData && (
            <p className="text-green-600 text-sm">
              Scenario: {typeof scenarioValue === 'number' ? scenarioValue.toLocaleString() : String(scenarioValue)}
            </p>
          )}
          {scenarioData && baselineData && (
            <p className="text-gray-600 text-sm">
              Uplift: {upliftPercentage}
            </p>
          )}
        </div>
      );
    }
    return null;
  };


  // Color theme submenu component (portal-based)
  const ColorThemeSubmenu = () => {
    if (!showColorSubmenu) return null;

    const submenu = (
      <div
        className="fixed z-[9999] bg-white border border-gray-300 rounded-lg shadow-xl p-3 color-submenu"
        style={{
          left: colorSubmenuPos.x,
          top: colorSubmenuPos.y,
          minWidth: '220px',
          maxHeight: '280px',
          overflowY: 'auto'
        }}
      >
        <div className="px-2 py-2 text-sm font-semibold text-gray-700 border-b border-gray-200 mb-3">
          Color Theme
        </div>
        
        <div className="grid grid-cols-8 gap-1.5">
          {Object.entries(COLOR_THEMES).map(([themeKey, themeData]) => (
            <button
              key={themeKey}
              className={`w-6 h-6 rounded-md border-2 transition-all duration-200 hover:scale-110 hover:shadow-lg ${
                currentTheme === themeKey 
                  ? 'border-blue-500 shadow-lg ring-2 ring-blue-200 ring-opacity-50' 
                  : 'border-gray-300 hover:border-gray-400 hover:shadow-md'
              }`}
              onClick={() => handleThemeChange(themeKey)}
              title={themeData.name}
            >
              <div 
                className="w-full h-full rounded-sm"
                style={{ 
                  background: `linear-gradient(135deg, ${themeData.primary} 0%, ${themeData.secondary} 100%)` 
                }}
              />
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

    const submenu = (
      <div
        className="fixed z-[9999] bg-white border border-gray-300 rounded-lg shadow-xl p-2 sort-submenu"
        style={{
          left: sortSubmenuPos.x,
          top: sortSubmenuPos.y,
          minWidth: '160px'
        }}
      >
        <div className="px-2 py-2 text-sm font-semibold text-gray-700 border-b border-gray-200 mb-2">
          Sort by Uplift
        </div>
        <div className="flex flex-col">
          <button
            className="px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2"
            onMouseDown={(e) => {
              e.preventDefault();
              handleSortChange(null);
            }}
          >
            <div className={`w-4 h-4 rounded border-2 ${sortOrder === null ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
              {sortOrder === null && <div className="w-full h-full bg-white rounded-sm scale-50" />}
            </div>
            <span>No Sort</span>
          </button>
          <button
            className="px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2"
            onMouseDown={(e) => {
              e.preventDefault();
              handleSortChange('asc');
            }}
          >
            <div className={`w-4 h-4 rounded border-2 ${sortOrder === 'asc' ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
              {sortOrder === 'asc' && <div className="w-full h-full bg-white rounded-sm scale-50" />}
            </div>
            <span>Sort by Uplift (Low to High)</span>
          </button>
          <button
            className="px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-2"
            onMouseDown={(e) => {
              e.preventDefault();
              handleSortChange('desc');
            }}
          >
            <div className={`w-4 h-4 rounded border-2 ${sortOrder === 'desc' ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
              {sortOrder === 'desc' && <div className="w-full h-full bg-white rounded-sm scale-50" />}
            </div>
            <span>Descending (High to Low)</span>
          </button>
        </div>
      </div>
    );

    return createPortal(submenu, document.body);
  };

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
        <div className="text-center">
          <div className="text-lg font-medium text-gray-600 mb-2">No Results Available</div>
          <div className="text-sm text-gray-500">Run a scenario to see results</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Header with title and right-click hint */}
      <div className="mb-3 flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-800">
          {viewMode === 'individual' ? 'Individual Results' : 'Aggregated Results'} - {dataLabelType === 'uplift' ? 'Uplift %' : 'Y-Values'}
        </h3>
        
        {/* Right-click hint */}
        <div className="text-xs text-gray-500">
          Right-click chart for settings
        </div>
      </div>
      
      {/* Scrollable chart container */}
      <div className="w-full h-80 overflow-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100" onContextMenu={handleContextMenu}>
        <div className="min-w-full" style={{ 
          minWidth: `${Math.max(chartData.length * 100, 600)}px`,
          minHeight: `${Math.max(chartData.length * 50, 350)}px`
        }}>
          <ResponsiveContainer width="100%" height={Math.max(height, 350)}>
            <BarChart 
              data={chartData} 
              margin={{ top: 10, right: 15, left: 50, bottom: 120 }}
            >
          <defs>
            {/* Baseline bar gradient */}
            <linearGradient id="baselineGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.primary} stopOpacity={1}/>
              <stop offset="100%" stopColor={theme.primary} stopOpacity={0.8}/>
            </linearGradient>
            
            {/* Scenario bar gradient */}
            <linearGradient id="scenarioGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={theme.secondary} stopOpacity={1}/>
              <stop offset="100%" stopColor={theme.secondary} stopOpacity={0.8}/>
            </linearGradient>
            
            {/* Shadow filter */}
            <filter id="barShadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="4" stdDeviation="4" floodOpacity="0.2" floodColor="#000"/>
            </filter>
          </defs>
          
          {currentShowGrid && (
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="#e2e8f0" 
              strokeOpacity={0.6}
              vertical={false}
            />
          )}
          
          <XAxis 
            dataKey="name" 
            stroke="#64748b"
            fontSize={8}
            fontWeight={400}
            tickLine={false}
            axisLine={false}
            tickMargin={2}
            angle={-45}
            textAnchor="end"
            height={50}
            interval={0}
            tick={({ x, y, payload, index }) => {
              const dataItem = chartData[index];
              if (!dataItem) {
                return null;
              }

              // For hierarchical display: Group by view identifiers
              const dataItemIdentifiers = dataItem.identifiers || {};
              
              // Find the primary view identifier (first one in viewSelectedIdentifiers)
              const primaryIdentifierKey = Object.keys(viewSelectedIdentifiers)[0];
              const primaryIdentifierValue = primaryIdentifierKey ? dataItemIdentifiers[primaryIdentifierKey] : '';
              
              // Get the combination details (excluding the primary identifier)
              const combinationDetails = Object.entries(dataItemIdentifiers)
                .filter(([key, value]) => key !== primaryIdentifierKey)
                .map(([key, value]) => value)
                .join(', ');

              // Check if this is the first occurrence of this view identifier in the current group
              // This will help us show the view identifier label only once per group
              const isFirstInGroup = index === 0 || 
                (index > 0 && chartData[index - 1] && 
                 chartData[index - 1].identifiers && 
                 chartData[index - 1].identifiers[primaryIdentifierKey] !== primaryIdentifierValue);

              // Calculate the center position for the view identifier label
              // Find the last bar in the current group to calculate the center
              let groupEndIndex = index;
              for (let i = index + 1; i < chartData.length; i++) {
                if (chartData[i] && chartData[i].identifiers && 
                    chartData[i].identifiers[primaryIdentifierKey] === primaryIdentifierValue) {
                  groupEndIndex = i;
                } else {
                  break;
                }
              }

              // Calculate center position more accurately
              // Get the actual spacing between bars from the chart
              const chartWidth = width || 800;
              const dataLength = chartData.length;
              const availableWidth = chartWidth - 100; // Account for margins
              const barSpacing = availableWidth / dataLength;
              
              // Calculate center x position between first and last bar in the group
              const firstBarX = x;
              const lastBarX = x + (groupEndIndex - index) * barSpacing;
              const groupCenterX = isFirstInGroup ? (firstBarX + lastBarX) / 2 : x;

                return (
                  <g>
                    {/* Show combination labels only in individual mode */}
                    {viewMode === 'individual' && (
                      <text
                        x={x}
                        y={y}
                        dx={0}
                        dy={5}
                        angle={-45}
                        textAnchor="middle"
                        fill="#64748b"
                        fontSize={7}
                        fontWeight={400}
                      >
                        <tspan x={x} dy={0} textAnchor="middle">
                          {combinationDetails || 'Unknown Combination'}
                        </tspan>
                      </text>
                    )}
                    
                    {/* Group label (view identifier) - show in both modes but adjust position */}
                    {primaryIdentifierValue && isFirstInGroup && (
                      <text
                        x={groupCenterX}
                        y={viewMode === 'aggregated' ? y + 5 : y + 15}
                        dx={0}
                        dy={0}
                        angle={-45}
                        textAnchor="middle"
                        fill="#64748b"
                        fontSize={9}
                        fontWeight={600}
                      >
                        <tspan x={groupCenterX} textAnchor="middle">
                          {primaryIdentifierValue}
                        </tspan>
                      </text>
                    )}
                  </g>
                );
            }}
            label={currentShowAxisLabels ? { 
              value: xAxisLabel, 
              position: 'bottom', 
              style: { fontSize: '10px', fontWeight: 'bold', fill: '#374151' }
            } : undefined}
          />
          
          <YAxis 
            stroke="#64748b"
            fontSize={11}
            fontWeight={500}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            width={60}
            tickFormatter={(value) => {
              // For uplift chart, show percentages with 3 decimal places
              if (dataLabelType === 'uplift') {
                return `${value.toFixed(3)}%`;
              }
              
              // For y-values chart, show compact format
              if (value >= 1000000000) {
                return `${(value / 1000000000).toFixed(1)}b`;
              } else if (value >= 1000000) {
                return `${(value / 1000000).toFixed(1)}m`;
              } else if (value >= 1000) {
                return `${(value / 1000).toFixed(1)}k`;
              } else {
                return value.toString();
              }
            }}
            label={currentShowAxisLabels ? { 
              value: dataLabelType === 'uplift' ? 'Uplift %' : yVariable, 
              angle: -90, 
              position: 'left', 
              style: { fontSize: '12px', fontWeight: 'bold', fill: '#374151' }
            } : undefined}
          />
          
          <Tooltip content={<CustomTooltip />} />
          
          {currentShowLegend && (
            <Legend 
              verticalAlign="top" 
              height={36}
              wrapperStyle={{
                paddingBottom: '10px'
              }}
            />
          )}
          
          {/* Baseline bars - only show for y-values chart */}
          {dataLabelType === 'y-values' && (
            <Bar 
              dataKey="baseline" 
              fill="url(#baselineGradient)"
              radius={[4, 4, 0, 0]}
              filter="url(#barShadow)"
              name="Baseline"
            >
              {currentShowDataLabels && (
                <LabelList 
                  dataKey="baseline" 
                  position="top" 
                  formatter={(value, entry, index) => formatDataLabel(value, 'baseline')}
                  style={{ fontSize: '10px', fontWeight: '500', fill: '#374151' }}
                />
              )}
            </Bar>
          )}
          
          {/* Scenario bars */}
          <Bar 
            dataKey="scenario" 
            fill="url(#scenarioGradient)"
            radius={[4, 4, 0, 0]}
            filter="url(#barShadow)"
            name={dataLabelType === 'uplift' ? 'Uplift %' : 'Scenario'}
          >
            {currentShowDataLabels && (
              <LabelList 
                dataKey="scenario" 
                position="top" 
                formatter={(value, entry, index) => formatDataLabel(value, 'scenario')}
                style={{ fontSize: '10px', fontWeight: '500', fill: '#374151' }}
              />
            )}
          </Bar>
        </BarChart>
        </ResponsiveContainer>
        </div>
        
        {/* Scroll hint */}
        {chartData.length > 4 && (
          <div className="text-center mt-2 text-xs text-gray-500">
            ← → Scroll horizontally to see all categories | ↑ ↓ Scroll vertically for better view
          </div>
        )}
        
        {/* Color Theme Submenu */}
        <ColorThemeSubmenu />
      </div>
      
      {/* Sort Submenu */}
      <SortSubmenu />
      
      {/* Right-click Context Menu */}
      {contextMenu && (
        <div 
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-2 min-w-[160px] context-menu"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
        >
          {/* Color Theme Option */}
          <button
            className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3 text-gray-700"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleColorThemeClick(e);
              setContextMenu(null);
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z" />
            </svg>
            <span>Color Theme</span>
            <ChevronDown className="w-4 h-4 ml-auto" />
          </button>

          {/* Sort Option */}
          <button
            className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3 text-gray-700"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleSortClick(e);
              setContextMenu(null);
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 9l6-6 6 6M18 15l-6 6-6-6" />
            </svg>
            <span>Sort by Uplift</span>
            <ChevronDown className="w-4 h-4 ml-auto" />
          </button>

          {/* Grid Toggle */}
          <button
            className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3 text-gray-700"
            onClick={() => {
              handleGridToggle();
              setContextMenu(null);
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            <span>Grid</span>
            <div className={`ml-auto w-4 h-4 rounded border-2 ${currentShowGrid ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
              {currentShowGrid && <div className="w-full h-full bg-white rounded-sm scale-50" />}
            </div>
          </button>

          {/* Legend Toggle */}
          <button
            className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3 text-gray-700"
            onClick={() => {
              handleLegendToggle();
              setContextMenu(null);
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span>Legend</span>
            <div className={`ml-auto w-4 h-4 rounded border-2 ${currentShowLegend ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
              {currentShowLegend && <div className="w-full h-full bg-white rounded-sm scale-50" />}
            </div>
          </button>

          {/* Axis Labels Toggle */}
          <button
            className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3 text-gray-700"
            onClick={() => {
              handleAxisLabelsToggle();
              setContextMenu(null);
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m-9 0h10m-10 0a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V6a2 2 0 00-2-2M9 12h6m-6 4h6" />
            </svg>
            <span>Axis Labels</span>
            <div className={`ml-auto w-4 h-4 rounded border-2 ${currentShowAxisLabels ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
              {currentShowAxisLabels && <div className="w-full h-full bg-white rounded-sm scale-50" />}
            </div>
          </button>

          {/* Data Labels Toggle */}
          <button
            className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3 text-gray-700"
            onClick={() => {
              handleDataLabelsToggle();
              setContextMenu(null);
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            <span>Data Labels</span>
            <div className={`ml-auto w-4 h-4 rounded border-2 ${currentShowDataLabels ? 'bg-blue-500 border-blue-500' : 'border-gray-300'}`}>
              {currentShowDataLabels && <div className="w-full h-full bg-white rounded-sm scale-50" />}
            </div>
          </button>
        </div>
      )}
      
      {/* Click outside to close context menu */}
      {contextMenu && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={closeContextMenu}
        />
      )}
    </div>
  );
};

export default ScenarioResultsChart;
