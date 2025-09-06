import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend, Tooltip, LabelList } from 'recharts';
import { Settings, ChevronDown } from 'lucide-react';

// Color themes from chart template
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
  viewMode?: 'hierarchy' | 'flat';
  viewIdentifiers?: Record<string, string[]>;
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
  viewMode = 'hierarchy',
  viewIdentifiers,
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

  const handleColorThemeClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
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
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
        setShowColorSubmenu(false);
      }
    };

    if (showMenu || showColorSubmenu) {
      document.addEventListener('click', handleClickOutside, false);
      return () => {
        document.removeEventListener('click', handleClickOutside, false);
      };
    }
  }, [showMenu, showColorSubmenu]);
  
  // Transform data for Recharts format
  const chartData = data.map(item => ({
    name: item.combinationLabel,
    baseline: item.baseline || 0,
    scenario: item.prediction,
    uplift: item.pct_uplift,
    delta: item.delta || 0
  }));

  // Custom tooltip content
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const baselineData = payload.find((p: any) => p.dataKey === 'baseline');
      const scenarioData = payload.find((p: any) => p.dataKey === 'scenario');
      
      return (
        <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
          <p className="font-semibold text-gray-800 mb-2">{label}</p>
          {baselineData && (
            <p className="text-blue-600 text-sm">
              Baseline: {baselineData.value?.toLocaleString() || 'N/A'}
            </p>
          )}
          {scenarioData && (
            <p className="text-green-600 text-sm">
              Scenario: {scenarioData.value?.toLocaleString() || 'N/A'}
            </p>
          )}
          {scenarioData && baselineData && (
            <p className="text-gray-600 text-sm">
              Uplift: {((scenarioData.value - baselineData.value) / baselineData.value * 100).toFixed(2)}%
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  // Dropdown menu component
  const DropdownMenu = () => {
    if (!showMenu) return null;

    return (
      <div className="absolute top-full right-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-2 z-50">
        {/* Color Theme Option */}
        <div className="relative">
          <button
            className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3 text-gray-700"
            onClick={handleColorThemeClick}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM21 5a2 2 0 00-2-2h-4a2 2 0 00-2 2v12a4 4 0 004 4h4a2 2 0 002-2V5z" />
            </svg>
            <span>Color Theme</span>
            <ChevronDown className="w-4 h-4 ml-auto" />
          </button>
          
          {/* Color Theme Submenu */}
          {showColorSubmenu && (
            <div className="absolute left-full top-0 ml-1 w-40 bg-white border border-gray-300 rounded-lg shadow-xl p-2">
              <div className="px-2 py-2 text-sm font-semibold text-gray-700 border-b border-gray-200 mb-2">
                Color Themes
              </div>
              <div className="grid grid-cols-1 gap-1">
                {Object.entries(COLOR_THEMES).map(([themeKey, themeData]) => (
                  <button
                    key={themeKey}
                    className="px-3 py-2 text-xs text-left hover:bg-gray-50 flex items-center gap-2 rounded"
                    onClick={() => handleThemeChange(themeKey)}
                  >
                    <div 
                      className="w-3 h-3 rounded-full border border-gray-300"
                      style={{ backgroundColor: themeData.primary }}
                    />
                    <span>{themeData.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Grid Toggle */}
        <button
          className="w-full px-4 py-2 text-sm text-left hover:bg-gray-50 flex items-center gap-3 text-gray-700"
          onClick={() => {
            handleGridToggle();
            setShowMenu(false);
          }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
          <span>Grid</span>
          <div className="ml-auto">
            <div className={`w-4 h-3 rounded border ${currentShowGrid ? 'bg-blue-500 border-blue-500' : 'bg-gray-200 border-gray-300'}`}>
              {currentShowGrid && (
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
          onClick={() => {
            handleLegendToggle();
            setShowMenu(false);
          }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span>Legend</span>
          <div className="ml-auto">
            <div className={`w-4 h-3 rounded border ${currentShowLegend ? 'bg-blue-500 border-blue-500' : 'bg-gray-200 border-gray-300'}`}>
              {currentShowLegend && (
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
          onClick={() => {
            handleAxisLabelsToggle();
            setShowMenu(false);
          }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
          <span>Axis Labels</span>
          <div className="ml-auto">
            <div className={`w-4 h-3 rounded border ${currentShowAxisLabels ? 'bg-blue-500 border-blue-500' : 'bg-gray-200 border-gray-300'}`}>
              {currentShowAxisLabels && (
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
          onClick={() => {
            handleDataLabelsToggle();
            setShowMenu(false);
          }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
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
      </div>
    );
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
      <div className="mb-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-800">
            {viewMode === 'hierarchy' ? 'Individual Results' : 'Aggregated Results'}
          </h3>
          
          {/* Controls */}
          <div className="flex gap-2">
            {/* Theme Selector */}
            <div className="flex gap-1">
              {Object.entries(COLOR_THEMES).map(([themeKey, themeData]) => (
                <button
                  key={themeKey}
                  onClick={() => {
                    setSelectedTheme(themeKey);
                    if (onThemeChange) {
                      onThemeChange(themeKey);
                    }
                  }}
                  className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                    currentTheme === themeKey
                      ? 'bg-blue-100 border-blue-300 text-blue-700'
                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                  title={themeData.name}
                >
                  <div 
                    className="w-3 h-3 rounded-full border border-gray-300"
                    style={{ backgroundColor: themeData.primary }}
                  />
                </button>
              ))}
            </div>
            
            {/* Menu Button */}
            <div className="relative border-l border-gray-300 pl-2">
              <button
                onClick={handleMenuToggle}
                className="px-2 py-1 text-xs rounded-md border border-gray-300 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
                title="Chart Settings"
                ref={menuRef}
              >
                <Settings className="w-3 h-3" />
              </button>
              <DropdownMenu />
            </div>
          </div>
        </div>
      </div>
      
      <div className="w-full h-full relative">
        <ResponsiveContainer width="100%" height={height}>
          <BarChart 
            data={chartData} 
            margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
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
            fontSize={11}
            fontWeight={500}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            angle={-45}
            textAnchor="end"
            height={80}
            label={currentShowAxisLabels ? { 
              value: 'Categories', 
              position: 'bottom', 
              style: { fontSize: '12px', fontWeight: 'bold', fill: '#374151' }
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
            tickFormatter={(value) => value.toLocaleString()}
            label={currentShowAxisLabels ? { 
              value: 'Values', 
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
          
          {/* Baseline bars */}
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
                formatter={(value) => value.toLocaleString()}
                style={{ fontSize: '10px', fontWeight: '500', fill: '#374151' }}
              />
            )}
          </Bar>
          
          {/* Scenario bars */}
          <Bar 
            dataKey="scenario" 
            fill="url(#scenarioGradient)"
            radius={[4, 4, 0, 0]}
            filter="url(#barShadow)"
            name="Scenario"
          >
            {currentShowDataLabels && (
              <LabelList 
                dataKey="scenario" 
                position="top" 
                formatter={(value) => value.toLocaleString()}
                style={{ fontSize: '10px', fontWeight: '500', fill: '#374151' }}
              />
            )}
          </Bar>
        </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default ScenarioResultsChart;
