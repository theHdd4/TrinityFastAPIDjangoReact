import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import RechartsChartRenderer from '@/templates/charts/RechartsChartRenderer';
import { BarChart3, TrendingUp, BarChart2, Triangle, Zap, Maximize2, ChevronDown, ChevronLeft, ChevronRight, Filter, X, LineChart as LineChartIcon, PieChart as PieChartIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ChartData, ChartMakerConfig } from '@/components/LaboratoryMode/store/laboratoryStore';
import './ChartMakerCanvas.css';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useResponsiveChartLayout } from '@/hooks/useResponsiveChartLayout';
import { migrateLegacyChart, DEFAULT_TRACE_COLORS } from '../utils/traceUtils';
import ChatBubble from './ChatBubble';
import AtomAIChatBot from '@/components/TrinityAI/AtomAIChatBot';

// Extend ChartData type to include uniqueValuesByColumn for type safety
interface ChartDataWithUniqueValues extends ChartData {
  uniqueValuesByColumn?: Record<string, string[]>;
}

interface ChartMakerCanvasProps {
  atomId: string;
  charts: ChartMakerConfig[];
  data: ChartData | null;
  onChartTypeChange?: (chartId: string, newType: ChartMakerConfig['type']) => void;
  onChartFilterChange?: (chartId: string, column: string, values: string[]) => void;
  onTraceFilterChange?: (chartId: string, traceIndex: number, column: string, values: string[]) => void;
  isFullWidthMode?: boolean; // When atom list and global properties tabs are hidden
}

const ChartMakerCanvas: React.FC<ChartMakerCanvasProps> = ({ atomId, charts, data, onChartTypeChange, onChartFilterChange, onTraceFilterChange, isFullWidthMode = false }) => {
  const typedData = data as ChartDataWithUniqueValues | null;
  const [fullscreenChart, setFullscreenChart] = useState<ChartMakerConfig | null>(null);
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);
  const [lastSelectedIdx, setLastSelectedIdx] = useState<number | null>(null);
  const [previewTypes, setPreviewTypes] = useState<Record<string, ChartMakerConfig['type'] | null>>({});
  const [currentTraceIndex, setCurrentTraceIndex] = useState<Record<string, number>>({});
  const [currentTracePages, setCurrentTracePages] = useState<Record<string, number>>({});
  const [emphasizedTrace, setEmphasizedTrace] = useState<Record<string, string | null>>({});
  const [dimmedXValues, setDimmedXValues] = useState<Record<string, Set<string>>>({});

  // Chat bubble state management
  const [chatBubble, setChatBubble] = useState<{
    visible: boolean;
    chartId: string | null;
    anchor: { x: number; y: number };
  }>({
    visible: false,
    chartId: null,
    anchor: { x: 0, y: 0 }
  });
  const [chatBubbleShouldRender, setChatBubbleShouldRender] = useState(false);
  const [overlayActive, setOverlayActive] = useState(false);

  // Mouse hold detection refs
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const holdTargetRef = useRef<{ chartId: string; element: HTMLElement } | null>(null);
  const debounceTimers = useRef<Record<string, NodeJS.Timeout | number | null>>({});
  
  // Container ref for responsive layout
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Get responsive layout configuration
  const { layoutConfig, isCompact } = useResponsiveChartLayout(charts.length, containerRef);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(timer => {
        if (timer) clearTimeout(timer as number);
      });
    };
  }, []);

  // Debounce utility
  const debounce = (fn: () => void, delay: number, chartId: string) => {
    if (debounceTimers.current[chartId]) clearTimeout(debounceTimers.current[chartId] as number);
    debounceTimers.current[chartId] = setTimeout(fn, delay);
  };

  const getUniqueValuesForColumn = (column: string) => {
    // Use backend-provided unique values if available
    if (typedData && (typedData.unique_values || typedData.uniqueValuesByColumn)) {
      const uniqueMap = typedData.unique_values || typedData.uniqueValuesByColumn;
      if (uniqueMap && uniqueMap[column]) {
        return uniqueMap[column];
      }
    }
    // Fallback to frontend calculation
    if (!typedData || !Array.isArray(typedData.rows)) return [];
    const values = new Set(typedData.rows.map(row => String(row[column])));
    return Array.from(values).filter(v => v !== '');
  };

  const chartTypeIcons = {
    line: TrendingUp,
    bar: BarChart2,
    area: Triangle,
    pie: PieChartIcon,
    scatter: Zap
  };

  const chartTypeLabels = {
    line: 'Line',
    bar: 'Bar',
    area: 'Area',
    pie: 'Pie',
    scatter: 'Scatter'
  };

  const getFilteredData = (chart: ChartMakerConfig) => {
    // Prefer backend-provided data when available
    if (chart.chartConfig && chart.chartConfig.data) {
      return chart.chartConfig.data;
    }
    // Fallback to filtering uploaded data based on selected identifiers
    if (!typedData || !Array.isArray(typedData.rows)) return [];

    const { filters = {} } = chart;
    return typedData.rows.filter(row =>
      Object.entries(filters).every(([col, values]) => {
        if (!values || values.length === 0) return true;
        return values.includes(String(row[col]));
      })
    );
  };

  const getChartColors = (index: number) => {
    const colorSchemes = [
      {
        primary: "#6366f1", // modern indigo
        secondary: "#a5b4fc",
        tertiary: "#e0e7ff",
        gradient: "from-blue-500 to-blue-600",
        darkAccent: "#4338ca",
        lightAccent: "#f0f9ff"
      },
      {
        primary: "#06b6d4", // modern cyan
        secondary: "#67e8f9",
        tertiary: "#cffafe",
        gradient: "from-cyan-500 via-cyan-600 to-blue-600",
        darkAccent: "#0891b2",
        lightAccent: "#f0fdfa"
      },
      {
        primary: "#8b5cf6", // modern violet
        secondary: "#c4b5fd",
        tertiary: "#ede9fe",
        gradient: "from-blue-500 to-blue-600",
        darkAccent: "#7c3aed",
        lightAccent: "#faf5ff"
      },
      {
        primary: "#f59e0b", // modern amber
        secondary: "#fcd34d",
        tertiary: "#fef3c7",
        gradient: "from-amber-500 via-orange-500 to-red-500",
        darkAccent: "#d97706",
        lightAccent: "#fffbeb"
      },
      {
        primary: "#ef4444", // modern red
        secondary: "#f87171",
        tertiary: "#fecaca",
        gradient: "from-red-500 via-red-600 to-pink-600",
        darkAccent: "#dc2626",
        lightAccent: "#fef2f2"
      },
      {
        primary: "#10b981", // modern emerald
        secondary: "#6ee7b7",
        tertiary: "#d1fae5",
        gradient: "from-emerald-500 via-green-500 to-teal-600",
        darkAccent: "#059669",
        lightAccent: "#f0fdf4"
      }
    ];
    return colorSchemes[index % colorSchemes.length];
  };

  const chartConfig = {
    data: {
      label: "Data",
      color: "hsl(var(--chart-1))",
    },
  };

  // Chat bubble handlers
  const handleMouseDown = (e: React.MouseEvent, chartId: string) => {
    if (e.button !== 0) return; // Only left click
    
    e.stopPropagation();
    
    // Store the target element reference
    const target = e.currentTarget as HTMLElement;
    
    // Start the long press timer
    longPressTimerRef.current = setTimeout(() => {
      // Check if target still exists before calling getBoundingClientRect
      if (!target || !target.getBoundingClientRect) {
        return;
      }
      
      try {
        // Calculate bubble position
        const rect = target.getBoundingClientRect();
        const position = {
          x: rect.left + rect.width / 2,
          y: rect.bottom + 10
        };
        
        setChatBubble({
          visible: true,
          chartId,
          anchor: position
        });
        setChatBubbleShouldRender(true);
        setOverlayActive(false); // Will be activated after animation
      } catch (error) {
        console.warn('Error calculating bubble position:', error);
      }
    }, 700);
    
    // Setup cleanup listeners on window
    const cleanup = () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      window.removeEventListener('mouseup', cleanup);
      window.removeEventListener('mouseleave', cleanup);
    };
    
    window.addEventListener('mouseup', cleanup);
    window.addEventListener('mouseleave', cleanup);
  };

  const handleChartTypeSelect = (type: string) => {
    if (chatBubble.chartId) {
      onChartTypeChange?.(chatBubble.chartId, type as ChartMakerConfig['type']);
      setChatBubble({ ...chatBubble, visible: false });
    }
  };

  const handleCloseChatBubble = () => {
    setChatBubble({ ...chatBubble, visible: false });
  };

  const handleBubbleExited = () => {
    setChatBubbleShouldRender(false);
  };

  // Activate overlay after bubble entry animation completes, deactivate immediately on exit
  useEffect(() => {
    if (chatBubble.visible && chatBubbleShouldRender) {
      // Delay overlay activation to allow bubble entry animation to complete (300ms + buffer)
      const timer = setTimeout(() => {
        setOverlayActive(true);
      }, 350); // Slightly longer than entry animation duration (300ms)
      return () => clearTimeout(timer);
    } else {
      // Immediately deactivate overlay when bubble starts hiding
      if (overlayActive) {
        setOverlayActive(false);
      }
    }
  }, [chatBubble.visible, chatBubbleShouldRender, overlayActive]);


const renderChart = (
  chart: ChartMakerConfig,
  index: number,
  chartKey?: string,
  heightClass?: string,
  _isFullscreen = false
) => {
  if ((chart as any).chartLoading) {
    const loadingHeight = heightClass || (isCompact ? 'h-56' : 'h-80');
    const colors = getChartColors(index);
    return (
      <div className={`flex flex-col items-center justify-center ${loadingHeight} bg-gradient-to-br from-white/50 to-gray-50/50 backdrop-blur-sm relative overflow-hidden`}>
        <div className="absolute inset-0 chart-loading"></div>
        <div className="relative z-10 flex flex-col items-center space-y-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-4 border-gray-200 animate-spin"></div>
            <div
              className="absolute inset-0 w-12 h-12 rounded-full border-4 border-transparent animate-spin"
              style={{ borderTopColor: colors.primary, borderRightColor: colors.primary, animationDuration: '1s', animationDirection: 'reverse' }}
            ></div>
          </div>
          <div className="text-center">
            <div className="text-sm font-medium text-gray-700 mb-1">Rendering Chart</div>
            <div className="text-xs text-gray-500">Creating beautiful visualization...</div>
          </div>
        </div>
      </div>
    );
  }

  const previewType = previewTypes[chart.id];
  const config = chart.chartConfig || {};
  const rawType = previewType || config.chart_type || chart.type;
  const typeMap: Record<string, string> = {
    line: 'line_chart',
    bar: 'bar_chart',
    area: 'area_chart',
    pie: 'pie_chart',
    scatter: 'scatter_chart',
    line_chart: 'line_chart',
    bar_chart: 'bar_chart',
    area_chart: 'area_chart',
    pie_chart: 'pie_chart',
    scatter_chart: 'scatter_chart',
  };
  const rendererType = typeMap[rawType] || 'line_chart';
  const chartData = config.data || getFilteredData(chart);
  const traces = config.traces || [];
  const xAxisConfig = chart.chartRendered && config.x_axis
    ? {
        ...config.x_axis,
        dataKey: (config.x_axis as any).dataKey || (config.x_axis as any).data_key || chart.xAxis,
      }
    : { dataKey: chart.xAxis };
  const yAxisConfig = chart.chartRendered && config.y_axis
    ? {
        ...config.y_axis,
        dataKey: (config.y_axis as any).dataKey || (config.y_axis as any).data_key || chart.yAxis,
      }
    : { dataKey: chart.yAxis };
  const key = chartKey || chart.lastUpdateTime || chart.id;
  const chartHeight = heightClass || '';

  if (
    !chart.chartRendered ||
    !chartData.length ||
    !xAxisConfig.dataKey ||
    (!yAxisConfig.dataKey && traces.length === 0)
  ) {
    return (
      <div className={`flex items-center justify-center ${chartHeight || 'h-64'} text-muted-foreground`}>
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
            <LineChartIcon className="w-8 h-8 text-slate-400" />
          </div>
          <p className="font-medium">Configure chart settings</p>
          <p className="text-sm">Select X-axis and Y-axis to display data</p>
        </div>
      </div>
    );
  }

  const colors = getChartColors(index);
  const rendererProps = {
    key,
    type: rendererType as 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart',
    data: chartData,
    xField: xAxisConfig.dataKey,
    yField: traces.length ? undefined : yAxisConfig.dataKey,
    yFields: traces.length ? traces.map((t: any) => t.dataKey) : undefined,
    title: chart.title,
    xAxisLabel: xAxisConfig.label || xAxisConfig.dataKey,
    yAxisLabel: yAxisConfig.label || yAxisConfig.dataKey,
    yAxisLabels: traces.length ? traces.map((t: any) => t.name || t.dataKey) : undefined,
    colors: [colors.primary, colors.secondary, colors.tertiary],
    theme: chart.chartConfig?.theme,
    showLegend: chart.chartConfig?.showLegend,
    showAxisLabels: chart.chartConfig?.showAxisLabels,
    showDataLabels: chart.chartConfig?.showDataLabels,
    showGrid: chart.chartConfig?.showGrid,
  } as const;

  return (
    <div className={`w-full ${chartHeight}`}>
      <RechartsChartRenderer {...rendererProps} />
    </div>
  );
};


  if (charts.length === 0) {
    return (
      <div className="w-full h-full p-6 bg-gradient-to-br from-slate-50 via-blue-50/30 to-blue-50/50 overflow-y-auto relative">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-20">
          <svg width="80" height="80" viewBox="0 0 80 80" className="absolute inset-0 w-full h-full">
            <defs>
              <pattern id="emptyGrid" width="80" height="80" patternUnits="userSpaceOnUse">
                <path d="M 80 0 L 0 0 0 80" fill="none" stroke="rgb(148 163 184 / 0.15)" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#emptyGrid)" />
          </svg>
        </div>
        
        <div className="relative z-10 flex items-center justify-center h-full">
          <div className="text-center max-w-md">
            <div className="w-24 h-24 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-2xl transform rotate-3 hover:rotate-0 transition-transform duration-300">
              <BarChart3 className="w-12 h-12 text-white drop-shadow-lg" />
            </div>
            <h3 className="text-3xl font-bold text-gray-900 mb-3 bg-gradient-to-r from-blue-500 to-blue-600 bg-clip-text text-transparent">
              Chart Maker
            </h3>
            <p className="text-gray-600 mb-6 text-lg font-medium leading-relaxed">
              Create beautiful interactive charts and visualizations
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full min-h-[28rem] flex flex-col bg-gradient-to-br from-slate-50 via-blue-50/30 to-blue-50/50 relative overflow-hidden">
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-30">
        <svg width="60" height="60" viewBox="0 0 60 60" className="absolute inset-0 w-full h-full">
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="rgb(148 163 184 / 0.1)" strokeWidth="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      {/* Header with chart count and AI assistant */}
      <div className="relative z-10 flex items-center justify-between p-4 border-b border-gray-200 bg-white/90 backdrop-blur-sm">
        <div className="flex items-center space-x-2">
          <BarChart3 className="w-5 h-5 text-gray-600" />
          <span className="text-sm font-medium text-gray-700">
            {charts.length === 0 ? 'No Charts' : `${charts.length} Chart${charts.length === 1 ? '' : 's'}`}
          </span>
        </div>
        <div className="flex items-center space-x-2">
          {/* <AtomAIChatBot
            atomId={atomId}
            atomType="chart-maker"
            atomTitle="Chart Maker"
            className="mr-2"
          /> */}
          {/* <Button
            variant="outline"
            size="sm"
            onClick={() => setFullscreenChart(charts[0] || null)}
            disabled={charts.length === 0}
            className="text-xs"
          >
            <Maximize2 className="w-3 h-3 mr-1" />
            Fullscreen
          </Button> */}
        </div>
      </div>
      
      <div className="relative z-10 p-6 overflow-hidden">
        <div
          className={`grid gap-6 ${layoutConfig.containerClass} transition-all duration-300 ease-in-out`}
          style={{
            gridTemplateRows: layoutConfig.rows > 1 ? `repeat(${layoutConfig.rows}, 1fr)` : '1fr'
          }}
        >
          {charts.map((chart, index) => {
            const colors = getChartColors(index);
            
            return (
                   <Card
                     key={chart.id}
                    className="chart-card border border-black shadow-xl bg-white/95 backdrop-blur-sm overflow-hidden transform hover:scale-[1.02] transition-all duration-300 relative flex flex-col group hover:shadow-2xl"
                   >
                    <div className="bg-white border-b border-black p-4 relative flex-shrink-0 group-hover:shadow-lg transition-shadow duration-300">
                      <CardTitle className={`font-bold text-gray-900 flex items-center justify-between ${isCompact ? 'text-base' : 'text-lg'}`}>
                        <div className="flex items-center">
                          <BarChart3 className={`mr-2 ${isCompact ? 'w-4 h-4' : 'w-5 h-5'} text-gray-900`} />
                          {chart.title}
                        </div>
                        {/* Hints container - aligned in same row */}
                        <div className="flex items-center gap-2">
                          {/* Interaction hint for multi-trace charts */}
                          {(chart.chartConfig?.traces && chart.chartConfig.traces.length > 1) && (
                            <div className="flex items-center text-xs text-gray-700 bg-yellow-50 border border-yellow-200 rounded-full px-2 py-1">
                              {chart.chartConfig.chart_type === 'bar' ? (
                                <>
                                  <span className="hidden sm:inline">Click: trace, Ctrl+Click: dim x-axis</span>
                                  <span className="sm:hidden">Click to emphasize</span>
                                </>
                              ) : (
                                <>
                                  <span className="hidden sm:inline">Click traces to emphasize</span>
                                  <span className="sm:hidden">Click to emphasize</span>
                                </>
                              )}
                            </div>
                          )}
                          {/* Alt+Click expand hint */}
                          <div className="flex items-center text-xs text-gray-700 bg-yellow-50 border border-yellow-200 rounded-full px-2 py-1">
                            <span>Alt+Click to expand</span>
                          </div>
                        </div>
                      </CardTitle>
                      {/* Transparent overlay for Alt+Click fullscreen and mouse hold for chart type switching */}
                      <div
                        className="absolute inset-0 cursor-pointer"
                        style={{ background: 'transparent', zIndex: 10 }}
                        onClick={e => {
                          if (e.altKey) {
                            setFullscreenChart(chart);
                            setFullscreenIndex(index);
                          }
                        }}
                        onMouseDown={e => handleMouseDown(e, chart.id)}
                        title="Alt+Click to expand, Hold to change chart type"
                      />
                     </div>
                     
                      {/* Filter Controls - Support both simple and multi-series modes */}
                      {(() => {
                        const migratedChart = migrateLegacyChart(chart);
                        
                        if (migratedChart.isAdvancedMode && migratedChart.traces && migratedChart.traces.length > 0) {
                          // Multi-series mode: Show filters by column with series pagination
                          const allFilterColumns = new Set<string>();
                          migratedChart.traces.forEach(trace => {
                            Object.keys(trace.filters || {}).forEach(column => allFilterColumns.add(column));
                          });
                          
                          if (allFilterColumns.size === 0) return null;
                          
                          return (
                            <div className="bg-gradient-to-r from-white/80 via-gray-50/90 to-white/80 backdrop-blur-sm p-4 border-b border-gray-200/60 shadow-inner relative overflow-hidden">
                              {/* Subtle texture overlay */}
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                              
                              {/* Responsive grid layout for filter columns */}
                              <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {Array.from(allFilterColumns).map(column => {
                                  // Find traces that use this column for filtering
                                  const tracesWithColumn = migratedChart.traces!.map((trace, idx) => ({ trace, idx }))
                                    .filter(({ trace }) => trace.filters && trace.filters[column]);
                                  
                                  if (tracesWithColumn.length === 0) return null;
                                  
                                  // Get current trace index for this column
                                  const currentIdx = currentTraceIndex[`${chart.id}-${column}`] || 0;
                                  const currentTraceInfo = tracesWithColumn[currentIdx] || tracesWithColumn[0];
                                  const selectedValues = currentTraceInfo.trace.filters[column] || [];
                                  const uniqueValues = getUniqueValuesForColumn(column);
                                  
                                  return (
                                    <div key={column} className="flex flex-col space-y-2">
                                      {/* Filter dropdown with compact layout */}
                                      <div className="flex flex-col gap-2">
                                        <Label className={`font-semibold text-gray-800 ${isCompact ? 'text-xs' : 'text-sm'} bg-gradient-to-r from-gray-700 to-gray-600 bg-clip-text text-transparent truncate`}>
                                          {column}
                                        </Label>
                                        <Popover>
                                          <PopoverTrigger asChild>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className={`justify-between w-full font-medium ${isCompact ? 'h-8 text-xs' : 'h-9 text-sm'} 
                                                bg-gradient-to-r from-white to-gray-50/50 hover:from-gray-50 hover:to-white 
                                                border-gray-300/60 hover:border-gray-400/60 shadow-sm hover:shadow-md 
                                                transition-all duration-200 backdrop-blur-sm group`}
                                              title={(() => {
                                                // Create detailed tooltip showing all series selections
                                                const allSeriesSelections = tracesWithColumn.map(({ trace, idx }) => {
                                                  const seriesName = trace.name || `Series ${idx + 1}`;
                                                  const seriesValues = trace.filters?.[column] || [];
                                                  return `${seriesName}: ${seriesValues.length > 0 ? seriesValues.join(', ') : 'No values'}`;
                                                }).join('\n');
                                                return allSeriesSelections;
                                              })()}
                                            >
                                              <span className="truncate font-medium text-gray-700 group-hover:text-gray-900 transition-colors text-left">
                                                {(() => {
                                                  // Group selections by series for display
                                                  const seriesGroups = tracesWithColumn.map(({ trace, idx }) => {
                                                    const seriesName = trace.name || `S${idx + 1}`;
                                                    const seriesValues = trace.filters?.[column] || [];
                                                    if (seriesValues.length === 0) return `${seriesName}: None`;
                                                    if (seriesValues.length === 1) return `${seriesName}: ${seriesValues[0]}`;
                                                    return `${seriesName}: ${seriesValues.length} selected`;
                                                  });
                                                  
                                                  if (seriesGroups.length === 0) return "No filters";
                                                  if (seriesGroups.length === 1) return seriesGroups[0];
                                                  
                                                  // For multiple series, show a compact summary
                                                  const totalSelected = tracesWithColumn.reduce((sum, { trace }) => 
                                                    sum + (trace.filters?.[column]?.length || 0), 0);
                                                  return `${tracesWithColumn.length} series (${totalSelected} filters)`;
                                                })()}
                                              </span>
                                              <ChevronDown className="h-3 w-3 text-gray-500 group-hover:text-gray-700 transition-colors flex-shrink-0 ml-2" />
                                            </Button>
                                          </PopoverTrigger>
                                          <PopoverContent className="w-80 p-0 bg-white/95 backdrop-blur-lg border-gray-200/60 shadow-2xl rounded-lg overflow-hidden" align="start">
                                            <div className="p-4 border-b border-gray-200/60 bg-gradient-to-r from-gray-50/80 to-white/80">
                                              <div className="flex items-center justify-between">
                                                <span className="text-sm font-semibold text-gray-800 bg-gradient-to-r from-gray-700 to-gray-600 bg-clip-text text-transparent">
                                                  Filter by {column}
                                                </span>
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  className="h-7 px-3 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100/60 transition-all duration-200"
                                                  onClick={() => {
                                                    // Clear all series filters for this column
                                                    tracesWithColumn.forEach(({ idx }) => {
                                                      onTraceFilterChange?.(chart.id, idx, column, []);
                                                    });
                                                  }}
                                                >
                                                  Clear All
                                                </Button>
                                              </div>
                                            </div>
                                            
                                            {/* Series pagination inside dropdown */}
                                            {tracesWithColumn.length > 1 && (
                                              <div className="p-4 border-b border-gray-200/60 bg-gradient-to-r from-white/50 to-gray-50/50">
                                                <div className="flex items-center justify-between mb-3">
                                                  <span className="text-xs text-gray-700 font-semibold">Series:</span>
                                                </div>
                                                <div className="flex flex-wrap gap-2">
                                                  {tracesWithColumn.map(({ trace, idx }, seriesIdx) => {
                                                    const isCurrentSeries = currentIdx === seriesIdx;
                                                    const seriesName = trace.name || `Series ${idx + 1}`;
                                                    const seriesFilters = trace.filters?.[column] || [];
                                                    const seriesColor = trace.color || DEFAULT_TRACE_COLORS[idx % DEFAULT_TRACE_COLORS.length];
                                                    
                                                    return (
                                                      <Button
                                                        key={idx}
                                                        variant={isCurrentSeries ? "default" : "outline"}
                                                        size="sm"
                                                        className={`h-7 px-3 text-xs flex items-center gap-2 font-medium transition-all duration-200 ${
                                                          isCurrentSeries 
                                                            ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md hover:shadow-lg' 
                                                            : 'bg-white/80 hover:bg-gray-50 border-gray-300/60 hover:border-gray-400/60'
                                                        }`}
                                                        onClick={() => setCurrentTraceIndex(prev => ({
                                                          ...prev,
                                                          [`${chart.id}-${column}`]: seriesIdx
                                                        }))}
                                                        title={`${seriesName} (${seriesColor}) - ${seriesFilters.length > 0 ? `${seriesFilters.length} values selected` : 'No values selected'}`}
                                                      >
                                                        {/* Color indicator */}
                                                        <div 
                                                          className="w-2.5 h-2.5 rounded-full border border-white/60 flex-shrink-0 shadow-sm"
                                                          style={{ backgroundColor: seriesColor }}
                                                        />
                                                        <span className="truncate font-medium">{seriesName}</span>
                                                        {seriesFilters.length > 0 && (
                                                          <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px] font-semibold bg-white/80 text-gray-700">
                                                            {seriesFilters.length}
                                                          </Badge>
                                                        )}
                                                      </Button>
                                                    );
                                                  })}
                                                </div>
                                              </div>
                                            )}
                                            
                                            <div className="flex gap-2 p-3 border-b border-gray-200/60 bg-gradient-to-r from-gray-50/40 to-white/40">
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                className="flex-1 h-7 text-xs font-medium bg-white/80 hover:bg-gray-50 border-gray-300/60 hover:border-gray-400/60 transition-all duration-200"
                                                onClick={() => onTraceFilterChange?.(chart.id, currentTraceInfo.idx, column, uniqueValues)}
                                              >
                                                All
                                              </Button>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                className="flex-1 h-7 text-xs font-medium bg-white/80 hover:bg-gray-50 border-gray-300/60 hover:border-gray-400/60 transition-all duration-200"
                                                onClick={() => onTraceFilterChange?.(chart.id, currentTraceInfo.idx, column, [])}
                                              >
                                                None
                                              </Button>
                                            </div>
                                            <ScrollArea className="filter-scroll-area max-h-48 bg-white/50">
                                              <div className="p-3">
                                                <div className="text-xs text-gray-700 mb-3 font-semibold bg-gradient-to-r from-gray-600 to-gray-500 bg-clip-text text-transparent">
                                                  Values for {currentTraceInfo.trace.name || `Series ${currentTraceInfo.idx + 1}`}:
                                                </div>
                                                <RadioGroup value="" onValueChange={() => {}}>
                                                  <div className="space-y-1.5">
                                                    {uniqueValues.map((value, valueIdx) => (
                                                      <div key={value} className="flex items-center space-x-2 cursor-pointer p-2 rounded-md hover:bg-gray-50/80 transition-colors group"
                                                        onClick={e => {
                                                          if (!onTraceFilterChange) return;
                                                          const selectedValues = currentTraceInfo.trace.filters?.[column] || [];
                                                          if (e.shiftKey && lastSelectedIdx !== null) {
                                                            // Range select
                                                            const [start, end] = [lastSelectedIdx, valueIdx].sort((a, b) => a - b);
                                                            const range = uniqueValues.slice(start, end + 1);
                                                            const newSelected = Array.from(new Set([...selectedValues, ...range]));
                                                            onTraceFilterChange(chart.id, currentTraceInfo.idx, column, newSelected);
                                                            setLastSelectedIdx(valueIdx);
                                                          } else if (e.ctrlKey || e.metaKey) {
                                                            // Toggle selection
                                                            const isSelected = selectedValues.includes(value);
                                                            const newSelected = isSelected
                                                              ? selectedValues.filter(v => v !== value)
                                                              : [...selectedValues, value];
                                                            onTraceFilterChange(chart.id, currentTraceInfo.idx, column, newSelected);
                                                            setLastSelectedIdx(valueIdx);
                                                          } else {
                                                            // Single select (radio behavior)
                                                            onTraceFilterChange(chart.id, currentTraceInfo.idx, column, [value]);
                                                            setLastSelectedIdx(valueIdx);
                                                          }
                                                        }}
                                                        tabIndex={0}
                                                        onKeyDown={e => {
                                                          if (e.key === ' ' || e.key === 'Enter') {
                                                            e.preventDefault();
                                                            if (!onTraceFilterChange) return;
                                                            const selectedValues = currentTraceInfo.trace.filters?.[column] || [];
                                                            if (e.shiftKey && lastSelectedIdx !== null) {
                                                              const [start, end] = [lastSelectedIdx, valueIdx].sort((a, b) => a - b);
                                                              const range = uniqueValues.slice(start, end + 1);
                                                              const newSelected = Array.from(new Set([...selectedValues, ...range]));
                                                              onTraceFilterChange(chart.id, currentTraceInfo.idx, column, newSelected);
                                                              setLastSelectedIdx(valueIdx);
                                                            } else if (e.ctrlKey || e.metaKey) {
                                                              const isSelected = selectedValues.includes(value);
                                                              const newSelected = isSelected
                                                                ? selectedValues.filter(v => v !== value)
                                                                : [...selectedValues, value];
                                                              onTraceFilterChange(chart.id, currentTraceInfo.idx, column, newSelected);
                                                              setLastSelectedIdx(valueIdx);
                                                            } else {
                                                              onTraceFilterChange(chart.id, currentTraceInfo.idx, column, [value]);
                                                              setLastSelectedIdx(valueIdx);
                                                            }
                                                          }
                                                        }}
                                                      >
                                                        <RadioGroupItem 
                                                          value={value} 
                                                          checked={(currentTraceInfo.trace.filters?.[column] || []).includes(value)} 
                                                          tabIndex={-1} 
                                                        />
                                                        <label className="text-xs cursor-pointer flex-1 truncate font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
                                                          {value || '(empty)'}
                                                        </label>
                                                      </div>
                                                    ))}
                                                  </div>
                                                </RadioGroup>
                                              </div>
                                            </ScrollArea>
                                          </PopoverContent>
                                        </Popover>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        } else {
                          // Simple mode: Original filter controls
                          if (Object.keys(chart.filters).length === 0) return null;
                          
                          return (
                            <div className="bg-gradient-to-r from-white/80 via-gray-50/90 to-white/80 backdrop-blur-sm p-4 border-b border-gray-200/60 shadow-inner relative overflow-hidden">
                              {/* Subtle texture overlay */}
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                              
                              {/* Responsive grid layout for simple filter columns */}
                              <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {Object.entries(chart.filters).map(([column, selectedValues]) => {
                                  const uniqueValues = getUniqueValuesForColumn(column);
                                  return (
                                    <div key={column} className="flex flex-col space-y-2">
                                      <Label className={`font-semibold text-gray-800 ${isCompact ? 'text-xs' : 'text-sm'} bg-gradient-to-r from-gray-700 to-gray-600 bg-clip-text text-transparent truncate`}>
                                        {column}
                                      </Label>
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            className={`justify-between w-full font-medium ${isCompact ? 'h-8 text-xs' : 'h-9 text-sm'} 
                                              bg-gradient-to-r from-white to-gray-50/50 hover:from-gray-50 hover:to-white 
                                              border-gray-300/60 hover:border-gray-400/60 shadow-sm hover:shadow-md 
                                              transition-all duration-200 backdrop-blur-sm group`}
                                          >
                                            <span className="truncate font-medium text-gray-700 group-hover:text-gray-900 transition-colors text-left">
                                              {selectedValues.length === 0
                                                ? "No values selected"
                                                : selectedValues.length === uniqueValues.length
                                                ? "All values"
                                                : selectedValues.length === 1
                                                ? selectedValues[0]
                                                : `${selectedValues.length} selected`
                                              }
                                            </span>
                                            <ChevronDown className="h-3 w-3 text-gray-500 group-hover:text-gray-700 transition-colors flex-shrink-0 ml-2" />
                                          </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-56 p-0 bg-white/95 backdrop-blur-lg border-gray-200/60 shadow-2xl rounded-lg overflow-hidden" align="start">
                                          <div className="p-4 border-b border-gray-200/60 bg-gradient-to-r from-gray-50/80 to-white/80">
                                            <div className="flex items-center justify-between">
                                              <span className="text-sm font-semibold text-gray-800 bg-gradient-to-r from-gray-700 to-gray-600 bg-clip-text text-transparent">
                                                Filter by {column}
                                              </span>
                                              {selectedValues.length > 0 && (
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  className="h-7 px-3 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100/60 transition-all duration-200"
                                                  onClick={() => onChartFilterChange?.(chart.id, column, [])}
                                                >
                                                  Clear
                                                </Button>
                                              )}
                                            </div>
                                          </div>
                                          <div className="flex gap-2 p-3 border-b border-gray-200/60 bg-gradient-to-r from-gray-50/40 to-white/40">
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="flex-1 h-7 text-xs font-medium bg-white/80 hover:bg-gray-50 border-gray-300/60 hover:border-gray-400/60 transition-all duration-200"
                                              onClick={() => onChartFilterChange?.(chart.id, column, uniqueValues)}
                                            >
                                              All
                                            </Button>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="flex-1 h-7 text-xs font-medium bg-white/80 hover:bg-gray-50 border-gray-300/60 hover:border-gray-400/60 transition-all duration-200"
                                              onClick={() => onChartFilterChange?.(chart.id, column, [])}
                                            >
                                              None
                                            </Button>
                                          </div>
                                          <ScrollArea className="filter-scroll-area bg-white/50">
                                            <RadioGroup value="" onValueChange={() => {}}>
                                              <div className="p-3 space-y-2">
                                                {uniqueValues.map((value, valueIdx) => (
                                                  <div key={value} className="flex items-center space-x-2 cursor-pointer p-2 rounded-md hover:bg-gray-50/80 transition-colors group"
                                                    onClick={e => {
                                                      if (!onChartFilterChange) return;
                                                      if (e.shiftKey && lastSelectedIdx !== null) {
                                                        // Range select
                                                        const [start, end] = [lastSelectedIdx, valueIdx].sort((a, b) => a - b);
                                                        const range = uniqueValues.slice(start, end + 1);
                                                        const newSelected = Array.from(new Set([...selectedValues, ...range]));
                                                        onChartFilterChange(chart.id, column, newSelected);
                                                        setLastSelectedIdx(valueIdx);
                                                      } else if (e.ctrlKey || e.metaKey) {
                                                        // Toggle selection
                                                        const isSelected = selectedValues.includes(value);
                                                        const newSelected = isSelected
                                                          ? selectedValues.filter(v => v !== value)
                                                          : [...selectedValues, value];
                                                        onChartFilterChange(chart.id, column, newSelected);
                                                        setLastSelectedIdx(valueIdx);
                                                      } else {
                                                        // Single select (radio behavior)
                                                        onChartFilterChange(chart.id, column, [value]);
                                                        setLastSelectedIdx(valueIdx);
                                                      }
                                                    }}
                                                    tabIndex={0}
                                                    onKeyDown={e => {
                                                      if (e.key === ' ' || e.key === 'Enter') {
                                                        e.preventDefault();
                                                        if (!onChartFilterChange) return;
                                                        if (e.shiftKey && lastSelectedIdx !== null) {
                                                          const [start, end] = [lastSelectedIdx, valueIdx].sort((a, b) => a - b);
                                                          const range = uniqueValues.slice(start, end + 1);
                                                          const newSelected = Array.from(new Set([...selectedValues, ...range]));
                                                          onChartFilterChange(chart.id, column, newSelected);
                                                          setLastSelectedIdx(valueIdx);
                                                        } else if (e.ctrlKey || e.metaKey) {
                                                          const isSelected = selectedValues.includes(value);
                                                          const newSelected = isSelected
                                                            ? selectedValues.filter(v => v !== value)
                                                            : [...selectedValues, value];
                                                          onChartFilterChange(chart.id, column, newSelected);
                                                          setLastSelectedIdx(valueIdx);
                                                        } else {
                                                          onChartFilterChange(chart.id, column, [value]);
                                                          setLastSelectedIdx(valueIdx);
                                                        }
                                                      }
                                                    }}
                                                  >
                                                    <RadioGroupItem value={value} checked={selectedValues.includes(value)} tabIndex={-1} />
                                                    <label className="text-xs cursor-pointer flex-1 truncate font-medium text-gray-700 group-hover:text-gray-900 transition-colors">
                                                      {value || '(empty)'}
                                                    </label>
                                                  </div>
                                                ))}
                                              </div>
                                            </RadioGroup>
                                          </ScrollArea>
                                        </PopoverContent>
                                      </Popover>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        }
                      })()}
                     
                     <CardContent className={`${isCompact ? 'p-2' : 'p-4'}`}>
                       <div className="overflow-hidden">
                         {renderChart(chart, index)}
                       </div>
                     </CardContent>
                   </Card>
            );
          })}
        </div>
      </div>

      {/* Fullscreen Modal */}
      <Dialog open={!!fullscreenChart} onOpenChange={() => setFullscreenChart(null)}>
        <DialogContent className="chart-container max-w-6xl h-[80vh] p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              {fullscreenChart?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            {fullscreenChart && fullscreenIndex !== null && (
              <div className="h-full">
                {renderChart(fullscreenChart, fullscreenIndex, `fullscreen-${fullscreenChart.id}`, 'h-full', true)}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Chat Bubble Portal */}
      {chatBubbleShouldRender && (
        <>
          {/* Overlay for outside click detection */}
          {overlayActive && (
            <div
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 3000,
                background: 'transparent',
                pointerEvents: 'auto',
                cursor: 'default'
              }}
              onMouseDown={(e) => {
                // Prevent the click from propagating to other components
                e.preventDefault();
                e.stopPropagation();
                handleCloseChatBubble();
              }}
            />
          )}
          
          {/* Bubble container */}
          <div 
            style={{
              position: 'fixed',
              left: chatBubble.anchor.x,
              top: chatBubble.anchor.y,
              transform: 'translate(-50%, 0)',
              zIndex: 4000,
            }}
            onMouseDown={(e) => {
              // Prevent clicks on bubble from propagating to overlay or other components
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <ChatBubble
              visible={chatBubble.visible}
              chartType={chatBubble.chartId ? charts.find(c => c.id === chatBubble.chartId)?.type || 'line' : 'line'}
              onChartTypeSelect={handleChartTypeSelect}
              onClose={handleCloseChatBubble}
              onExited={handleBubbleExited}
            />
          </div>
        </>
      )}
    </div>
  );
};

export default ChartMakerCanvas;
                        