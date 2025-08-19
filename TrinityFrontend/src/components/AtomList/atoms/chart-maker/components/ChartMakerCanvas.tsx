import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend } from 'recharts';
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

// Extend ChartData type to include uniqueValuesByColumn for type safety
interface ChartDataWithUniqueValues extends ChartData {
  uniqueValuesByColumn?: Record<string, string[]>;
}

interface ChartMakerCanvasProps {
  charts: ChartMakerConfig[];
  data: ChartData | null;
  onChartTypeChange?: (chartId: string, newType: ChartMakerConfig['type']) => void;
  onChartFilterChange?: (chartId: string, column: string, values: string[]) => void;
  onTraceFilterChange?: (chartId: string, traceIndex: number, column: string, values: string[]) => void;
  isFullWidthMode?: boolean; // When atom list and global properties tabs are hidden
}

const ChartMakerCanvas: React.FC<ChartMakerCanvasProps> = ({ charts, data, onChartTypeChange, onChartFilterChange, onTraceFilterChange, isFullWidthMode = false }) => {
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
    // Only use backend-generated chart data
    if (chart.chartConfig && chart.chartConfig.data) {
      return chart.chartConfig.data;
    }
    // No fallback to frontend logic
    return [];
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

  const renderChart = (chart: ChartMakerConfig, index: number, chartKey?: string, heightClass?: string, isFullscreen = false) => {
    // Show loading spinner if chart is loading
    if ((chart as any).chartLoading) {
      const loadingHeight = isCompact ? 'h-56' : 'h-80';
      const colors = getChartColors(index);
      return (
        <div className={`flex flex-col items-center justify-center ${loadingHeight} bg-gradient-to-br from-white/50 to-gray-50/50 backdrop-blur-sm relative overflow-hidden`}>
          {/* Background shimmer effect */}
          <div className="absolute inset-0 chart-loading"></div>
          
          {/* Modern loading animation */}
          <div className="relative z-10 flex flex-col items-center space-y-4">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-4 border-gray-200 animate-spin"></div>
              <div 
                className="absolute inset-0 w-12 h-12 rounded-full border-4 border-transparent animate-spin"
                style={{
                  borderTopColor: colors.primary,
                  borderRightColor: colors.primary,
                  animationDuration: '1s',
                  animationDirection: 'reverse'
                }}
              ></div>
            </div>
            
            <div className="text-center">
              <div className="text-sm font-medium text-gray-700 mb-1">
                Rendering Chart
              </div>
              <div className="text-xs text-gray-500">
                Creating beautiful visualization...
              </div>
            </div>
            
            {/* Floating chart icons */}
            <div className="absolute inset-0 pointer-events-none">
              <BarChart3 
                className="absolute top-4 left-4 w-4 h-4 text-gray-300 animate-pulse" 
                style={{ animationDelay: '0s' }}
              />
              <TrendingUp 
                className="absolute top-8 right-6 w-3 h-3 text-gray-300 animate-pulse" 
                style={{ animationDelay: '0.5s' }}
              />
              <BarChart2 
                className="absolute bottom-6 left-8 w-3 h-3 text-gray-300 animate-pulse" 
                style={{ animationDelay: '1s' }}
              />
            </div>
          </div>
        </div>
      );
    }
    // Use preview type if set, else actual type
    const previewType = previewTypes[chart.id];
    // Use backend config if available
    const config = chart.chartConfig || {};
    const chartType = previewType || config.chart_type || chart.type;
    const chartData = config.data || getFilteredData(chart);
    const traces = config.traces || [];
    const xAxisConfig = config.x_axis || { dataKey: chart.xAxis };
    const yAxisConfig = config.y_axis || { dataKey: chart.yAxis };
    const colors = getChartColors(index);
    const key = chartKey || chart.lastUpdateTime || chart.id;

    // Dynamic height based on layout or use provided height class
    // Give more height when sidebars are hidden (full width mode)
    const chartHeight = heightClass || (() => {
      if (isFullWidthMode) {
        return isCompact ? 'h-64' : layoutConfig.layout === 'vertical' ? 'h-[28rem]' : 'h-[36rem]';
      }
      // Increased heights for better visibility when sidebars are open
      return isCompact ? 'h-56' : layoutConfig.layout === 'vertical' ? 'h-[24rem]' : 'h-[28rem]';
    })();

    if (!chartData.length || !xAxisConfig.dataKey || (!yAxisConfig.dataKey && traces.length === 0)) {
      return (
        <div className={`flex items-center justify-center ${chartHeight} text-muted-foreground`}>
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
              <LineChart className="w-8 h-8 text-slate-400" />
            </div>
            <p className="font-medium">Configure chart settings</p>
            <p className="text-sm">Select X-axis and Y-axis to display data</p>
          </div>
        </div>
      );
    }

    switch (chartType) {
      case 'line':
        return (
          <ChartContainer key={key} config={config} className={`chart-container ${chartHeight} w-full`}>
            <LineChart 
              data={chartData} 
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
              onClick={() => {
                // Clear trace emphasis when clicking on chart background
                setEmphasizedTrace(prev => ({ ...prev, [chart.id]: null }));
              }}
            >
                <defs>
                  <linearGradient id={`lineGradient-${chart.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={colors.primary} stopOpacity={0.8}/>
                    <stop offset="100%" stopColor={colors.primary} stopOpacity={0.1}/>
                  </linearGradient>
                  <filter id={`lineShadow-${chart.id}`} x="-50%" y="-50%" width="200%" height="200%">
                    <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.3" floodColor={colors.primary}/>
                  </filter>
                </defs>
                <CartesianGrid 
                  strokeDasharray="3 3" 
                  stroke="#e2e8f0" 
                  strokeOpacity={0.6}
                  vertical={false}
                />
                <XAxis 
                  {...xAxisConfig} 
                  stroke="#64748b"
                  fontSize={11}
                  fontWeight={500}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                />
                <YAxis 
                  {...(yAxisConfig.dataKey ? yAxisConfig : { type: yAxisConfig.type || 'number' })} 
                  stroke="#64748b"
                  fontSize={11}
                  fontWeight={500}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  width={60}
                />
                <ChartTooltip 
                  content={<ChartTooltipContent />} 
                  contentStyle={{ 
                    backgroundColor: 'rgba(255, 255, 255, 0.98)', 
                    border: 'none', 
                    borderRadius: '12px', 
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
                    backdropFilter: 'blur(10px)',
                    fontSize: '12px',
                    fontWeight: 500
                  }} 
                  cursor={{ stroke: colors.primary, strokeWidth: 1, strokeOpacity: 0.4 }}
                />
                {traces.length > 0 ? traces.map((trace, i) => {
                  const isEmphasized = emphasizedTrace[chart.id] === trace.dataKey;
                  const isOtherEmphasized = emphasizedTrace[chart.id] && emphasizedTrace[chart.id] !== trace.dataKey;
                  const traceColor = trace.stroke || trace.fill || DEFAULT_TRACE_COLORS[i % DEFAULT_TRACE_COLORS.length];
                  
                  // Custom dot component that handles clicks
                  const CustomActiveDot = (props: any) => {
                    const { cx, cy, fill } = props;
                    return (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={6}
                        fill={fill}
                        stroke="white"
                        strokeWidth={3}
                        style={{ cursor: 'pointer' }}
                        filter={`url(#lineShadow-${chart.id})`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setEmphasizedTrace(prev => ({
                            ...prev,
                            [chart.id]: prev[chart.id] === trace.dataKey ? null : trace.dataKey
                          }));
                        }}
                      />
                    );
                  };
                  
                  return (
                    <Line 
                      key={trace.dataKey || i} 
                      type="monotone" 
                      dataKey={trace.dataKey} 
                      stroke={traceColor}
                      strokeOpacity={isOtherEmphasized ? 0.4 : 1}
                      strokeWidth={isEmphasized ? 4 : 2}
                      fill={`url(#lineGradient-${chart.id})`}
                      dot={{ 
                        fill: traceColor, 
                        strokeWidth: 0, 
                        r: 0,
                        filter: `url(#lineShadow-${chart.id})`
                      }}
                      activeDot={<CustomActiveDot fill={traceColor} />}
                      filter={isEmphasized ? `url(#lineShadow-${chart.id})` : undefined}
                    />
                  );
                }) : (
                  <Line 
                    type="monotone" 
                    dataKey={yAxisConfig.dataKey} 
                    stroke={colors.primary}
                    strokeWidth={3}
                    fill={`url(#lineGradient-${chart.id})`}
                    dot={{ 
                      fill: colors.primary, 
                      strokeWidth: 0, 
                      r: 0
                    }}
                    activeDot={{ 
                      r: 6, 
                      fill: colors.primary, 
                      stroke: 'white', 
                      strokeWidth: 3,
                      filter: `url(#lineShadow-${chart.id})`,
                      style: { cursor: 'pointer' }
                    }}
                    filter={`url(#lineShadow-${chart.id})`}
                  />
                )}
                {/* Add legend for multi-trace charts */}
                {traces.length > 0 && (
                  <Legend 
                    wrapperStyle={{ 
                      paddingTop: '20px',
                      fontSize: '12px',
                      opacity: 0.8
                    }}
                    iconType="line"
                    formatter={(value) => {
                      // Find the trace that matches this dataKey and return its name
                      const matchingTrace = traces.find(trace => trace.dataKey === value);
                      return matchingTrace ? matchingTrace.name : value;
                    }}
                  />
                )}
              </LineChart>
            </ChartContainer>
        );
      case 'bar':
        // Process data to apply x-axis dimming (multiple x-values can be dimmed)
        const processedBarData = dimmedXValues[chart.id] && dimmedXValues[chart.id].size > 0
          ? chartData.map(item => {
              const isDimmed = dimmedXValues[chart.id].has(String(item[xAxisConfig.dataKey]));
              const newItem = { ...item };
              
              // Dim selected x-values for all traces
              if (isDimmed && traces.length > 0) {
                traces.forEach(trace => {
                  newItem[`${trace.dataKey}_dimmed`] = true;
                });
              }
              return newItem;
            })
          : chartData;
          
        return (
          <ChartContainer key={key} config={config} className={`chart-container ${chartHeight} w-full`}>
            <BarChart 
              data={processedBarData} 
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
              onClick={() => {
                // Clear trace emphasis when clicking on chart background (but keep dimmed x-values)
                setEmphasizedTrace(prev => ({ ...prev, [chart.id]: null }));
              }}
            >
              <defs>
                <linearGradient id={`barGradient-${chart.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors.primary} stopOpacity={1}/>
                  <stop offset="100%" stopColor={colors.darkAccent} stopOpacity={0.8}/>
                </linearGradient>
                <filter id={`barShadow-${chart.id}`} x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="0" dy="4" stdDeviation="4" floodOpacity="0.2" floodColor={colors.primary}/>
                </filter>
              </defs>
              <CartesianGrid 
                strokeDasharray="3 3" 
                stroke="#e2e8f0" 
                strokeOpacity={0.6}
                vertical={false}
              />
              <XAxis 
                {...xAxisConfig} 
                stroke={dimmedXValues[chart.id] && dimmedXValues[chart.id].size > 0 ? "#374151" : "#64748b"}
                fontSize={11}
                fontWeight={500}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                onClick={(data) => {
                  if (data && data.value) {
                    const xValue = String(data.value);
                    setDimmedXValues(prev => {
                      const currentSet = prev[chart.id] || new Set();
                      const newSet = new Set(currentSet);
                      
                      if (newSet.has(xValue)) {
                        newSet.delete(xValue); // Remove if already dimmed
                      } else {
                        newSet.add(xValue); // Add to dimmed set
                      }
                      
                      return { ...prev, [chart.id]: newSet };
                    });
                    setEmphasizedTrace(prev => ({ ...prev, [chart.id]: null }));
                  }
                }}
                style={{ cursor: 'pointer' }}
              />
              <YAxis 
                {...(yAxisConfig.dataKey ? yAxisConfig : { type: yAxisConfig.type || 'number' })} 
                stroke="#64748b"
                fontSize={11}
                fontWeight={500}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={60}
              />
              <ChartTooltip 
                content={<ChartTooltipContent />} 
                contentStyle={{ 
                  backgroundColor: 'rgba(255, 255, 255, 0.98)', 
                  border: 'none', 
                  borderRadius: '12px', 
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
                  backdropFilter: 'blur(10px)',
                  fontSize: '12px',
                  fontWeight: 500
                }} 
                cursor={{ fill: 'rgba(0, 0, 0, 0.04)' }}
              />
              {traces.length > 0 ? traces.map((trace, i) => {
                const isEmphasized = emphasizedTrace[chart.id] === trace.dataKey;
                const isOtherEmphasized = emphasizedTrace[chart.id] && emphasizedTrace[chart.id] !== trace.dataKey;
                const traceColor = trace.stroke || trace.fill || DEFAULT_TRACE_COLORS[i % DEFAULT_TRACE_COLORS.length];
                
                // Custom bar shape that handles clicks
                const CustomBar = (props: any) => {
                  const { x, y, width, height, payload } = props;
                  const isXDimmed = payload && payload[`${trace.dataKey}_dimmed`];
                  const finalColor = isXDimmed ? `${traceColor}60` : traceColor;
                  const finalOpacity = isXDimmed ? 0.4 : (isOtherEmphasized ? 0.3 : 0.8);
                  
                  return (
                    <rect
                      x={x}
                      y={y}
                      width={width}
                      height={height}
                      fill={finalColor}
                      fillOpacity={finalOpacity}
                      stroke={traceColor}
                      strokeWidth={isEmphasized ? 2 : 0}
                      rx={6}
                      ry={6}
                      style={{ cursor: 'pointer' }}
                      filter={isEmphasized ? `url(#barShadow-${chart.id})` : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (e.ctrlKey || e.metaKey) {
                          // Ctrl/Cmd + click for x-axis dimming (additive)
                          const xValue = String(payload[xAxisConfig.dataKey]);
                          setDimmedXValues(prev => {
                            const currentSet = prev[chart.id] || new Set();
                            const newSet = new Set(currentSet);
                            
                            if (newSet.has(xValue)) {
                              newSet.delete(xValue); // Remove if already dimmed
                            } else {
                              newSet.add(xValue); // Add to dimmed set
                            }
                            
                            return { ...prev, [chart.id]: newSet };
                          });
                          setEmphasizedTrace(prev => ({ ...prev, [chart.id]: null }));
                        } else {
                          // Regular click for trace emphasis
                          setEmphasizedTrace(prev => ({
                            ...prev,
                            [chart.id]: prev[chart.id] === trace.dataKey ? null : trace.dataKey
                          }));
                          setDimmedXValues(prev => ({ ...prev, [chart.id]: new Set() }));
                        }
                      }}
                    />
                  );
                };
                
                return (
                  <Bar 
                    key={trace.dataKey || i} 
                    dataKey={trace.dataKey} 
                    fill={traceColor}
                    fillOpacity={isOtherEmphasized ? 0.3 : 0.8}
                    stroke={traceColor}
                    strokeWidth={isEmphasized ? 2 : 0}
                    radius={[6, 6, 0, 0]}
                    filter={isEmphasized ? `url(#barShadow-${chart.id})` : undefined}
                    style={{ cursor: 'pointer' }}
                    shape={<CustomBar />}
                  />
                );
              }) : (
                <Bar 
                  dataKey={yAxisConfig.dataKey} 
                  fill={`url(#barGradient-${chart.id})`}
                  radius={[6, 6, 0, 0]}
                  filter={`url(#barShadow-${chart.id})`}
                  style={{ cursor: 'pointer' }}
                />
              )}
              {/* Add legend for multi-trace charts */}
              {traces.length > 0 && (
                <Legend 
                  wrapperStyle={{ 
                    paddingTop: '20px',
                    fontSize: '12px',
                    opacity: 0.8
                  }}
                  iconType="rect"
                  formatter={(value) => {
                    // Find the trace that matches this dataKey and return its name
                    const matchingTrace = traces.find(trace => trace.dataKey === value);
                    return matchingTrace ? matchingTrace.name : value;
                  }}
                />
              )}
            </BarChart>
          </ChartContainer>
        );
      case 'area':
        return (
          <ChartContainer key={key} config={config} className={`chart-container ${chartHeight} w-full`}>
            <AreaChart 
              data={chartData} 
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
              onClick={() => {
                // Clear trace emphasis when clicking on chart background
                setEmphasizedTrace(prev => ({ ...prev, [chart.id]: null }));
              }}
            >
              <defs>
                <linearGradient id={`areaGradient-${chart.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={colors.primary} stopOpacity={0.6}/>
                  <stop offset="50%" stopColor={colors.primary} stopOpacity={0.3}/>
                  <stop offset="100%" stopColor={colors.primary} stopOpacity={0.05}/>
                </linearGradient>
                <filter id={`areaShadow-${chart.id}`} x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.3" floodColor={colors.primary}/>
                </filter>
              </defs>
              <CartesianGrid 
                strokeDasharray="3 3" 
                stroke="#e2e8f0" 
                strokeOpacity={0.6}
                vertical={false}
              />
              <XAxis 
                {...xAxisConfig} 
                stroke="#64748b"
                fontSize={11}
                fontWeight={500}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <YAxis 
                {...(yAxisConfig.dataKey ? yAxisConfig : { type: yAxisConfig.type || 'number' })} 
                stroke="#64748b"
                fontSize={11}
                fontWeight={500}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={60}
              />
              <ChartTooltip 
                content={<ChartTooltipContent />} 
                contentStyle={{ 
                  backgroundColor: 'rgba(255, 255, 255, 0.98)', 
                  border: 'none', 
                  borderRadius: '12px', 
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
                  backdropFilter: 'blur(10px)',
                  fontSize: '12px',
                  fontWeight: 500
                }} 
                cursor={{ stroke: colors.primary, strokeWidth: 1, strokeOpacity: 0.4 }}
              />
              {traces.length > 0 ? traces.map((trace, i) => {
                const isEmphasized = emphasizedTrace[chart.id] === trace.dataKey;
                const isOtherEmphasized = emphasizedTrace[chart.id] && emphasizedTrace[chart.id] !== trace.dataKey;
                const traceColor = trace.stroke || trace.fill || DEFAULT_TRACE_COLORS[i % DEFAULT_TRACE_COLORS.length];
                
                // Custom active dot for area charts
                const CustomActiveDot = (props: any) => {
                  const { cx, cy, fill } = props;
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={6}
                      fill={fill}
                      stroke="white"
                      strokeWidth={3}
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEmphasizedTrace(prev => ({
                          ...prev,
                          [chart.id]: prev[chart.id] === trace.dataKey ? null : trace.dataKey
                        }));
                      }}
                    />
                  );
                };
                
                return (
                  <Area 
                    key={trace.dataKey || i} 
                    type="monotone" 
                    dataKey={trace.dataKey} 
                    stroke={traceColor} 
                    fill={traceColor}
                    fillOpacity={isOtherEmphasized ? 0.1 : 0.3}
                    strokeOpacity={isOtherEmphasized ? 0.4 : 1}
                    strokeWidth={isEmphasized ? 4 : 2}
                    filter={isEmphasized ? `url(#areaShadow-${chart.id})` : undefined}
                    dot={{ 
                      fill: traceColor, 
                      strokeWidth: 0, 
                      r: 0
                    }}
                    activeDot={<CustomActiveDot fill={traceColor} />}
                  />
                );
              }) : (
                <Area 
                  type="monotone" 
                  dataKey={yAxisConfig.dataKey} 
                  stroke={colors.primary} 
                  fill={`url(#areaGradient-${chart.id})`}
                  strokeWidth={3}
                  filter={`url(#areaShadow-${chart.id})`}
                  dot={{ 
                    fill: colors.primary, 
                    strokeWidth: 0, 
                    r: 0
                  }}
                  activeDot={{ 
                    r: 6, 
                    fill: colors.primary, 
                    stroke: 'white', 
                    strokeWidth: 3,
                    style: { cursor: 'pointer' }
                  }}
                />
              )}
              {/* Add legend for multi-trace charts */}
              {traces.length > 0 && (
                <Legend 
                  wrapperStyle={{ 
                    paddingTop: '20px',
                    fontSize: '12px',
                    opacity: 0.8
                  }}
                  iconType="rect"
                  formatter={(value) => {
                    // Find the trace that matches this dataKey and return its name
                    const matchingTrace = traces.find(trace => trace.dataKey === value);
                    return matchingTrace ? matchingTrace.name : value;
                  }}
                />
              )}
            </AreaChart>
          </ChartContainer>
        );
      case 'scatter':
        return (
          <ChartContainer key={key} config={config} className={`chart-container ${chartHeight} w-full`}>
            <ScatterChart 
              data={chartData} 
              margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
              onClick={() => {
                // Clear trace emphasis when clicking on chart background
                setEmphasizedTrace(prev => ({ ...prev, [chart.id]: null }));
              }}
            >
              <defs>
                <radialGradient id={`scatterGradient-${chart.id}`} cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor={colors.primary} stopOpacity={1}/>
                  <stop offset="100%" stopColor={colors.darkAccent} stopOpacity={0.7}/>
                </radialGradient>
                <filter id={`scatterShadow-${chart.id}`} x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.4" floodColor={colors.primary}/>
                </filter>
              </defs>
              <CartesianGrid 
                strokeDasharray="3 3" 
                stroke="#e2e8f0" 
                strokeOpacity={0.6}
              />
              <XAxis 
                {...xAxisConfig} 
                stroke="#64748b"
                fontSize={11}
                fontWeight={500}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <YAxis 
                {...(yAxisConfig.dataKey ? yAxisConfig : { type: yAxisConfig.type || 'number' })} 
                stroke="#64748b"
                fontSize={11}
                fontWeight={500}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={60}
              />
              <ChartTooltip 
                content={<ChartTooltipContent />} 
                contentStyle={{ 
                  backgroundColor: 'rgba(255, 255, 255, 0.98)', 
                  border: 'none', 
                  borderRadius: '12px', 
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
                  backdropFilter: 'blur(10px)',
                  fontSize: '12px',
                  fontWeight: 500
                }} 
                cursor={{ strokeDasharray: '3 3' }}
              />
              {traces.length > 0 ? traces.map((trace, i) => {
                const isEmphasized = emphasizedTrace[chart.id] === trace.dataKey;
                const isOtherEmphasized = emphasizedTrace[chart.id] && emphasizedTrace[chart.id] !== trace.dataKey;
                const traceColor = trace.stroke || trace.fill || DEFAULT_TRACE_COLORS[i % DEFAULT_TRACE_COLORS.length];
                
                // Custom scatter shape that handles clicks
                const CustomScatter = (props: any) => {
                  const { cx, cy } = props;
                  const radius = isEmphasized ? 6 : 4;
                  const opacity = isOtherEmphasized ? 0.3 : 0.8;
                  
                  return (
                    <circle
                      cx={cx}
                      cy={cy}
                      r={radius}
                      fill={traceColor}
                      fillOpacity={opacity}
                      style={{ cursor: 'pointer' }}
                      filter={isEmphasized ? `url(#scatterShadow-${chart.id})` : undefined}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEmphasizedTrace(prev => ({
                          ...prev,
                          [chart.id]: prev[chart.id] === trace.dataKey ? null : trace.dataKey
                        }));
                      }}
                    />
                  );
                };
                
                return (
                  <Scatter 
                    key={trace.dataKey || i} 
                    dataKey={trace.dataKey} 
                    fill={traceColor}
                    fillOpacity={isOtherEmphasized ? 0.3 : 0.8}
                    r={isEmphasized ? 6 : 4}
                    filter={isEmphasized ? `url(#scatterShadow-${chart.id})` : undefined}
                    style={{ cursor: 'pointer' }}
                    shape={<CustomScatter />}
                  />
                );
              }) : (
                <Scatter 
                  dataKey={yAxisConfig.dataKey} 
                  fill={`url(#scatterGradient-${chart.id})`}
                  fillOpacity={0.8}
                  filter={`url(#scatterShadow-${chart.id})`}
                  style={{ cursor: 'pointer' }}
                />
              )}
              {/* Add legend for multi-trace charts */}
              {traces.length > 0 && (
                <Legend 
                  wrapperStyle={{ 
                    paddingTop: '20px',
                    fontSize: '12px',
                    opacity: 0.8
                  }}
                  iconType="circle"
                  formatter={(value) => {
                    // Find the trace that matches this dataKey and return its name
                    const matchingTrace = traces.find(trace => trace.dataKey === value);
                    return matchingTrace ? matchingTrace.name : value;
                  }}
                />
              )}
            </ScatterChart>
          </ChartContainer>
        );
      case 'pie':
        // Pie chart expects data as [{ name, value }]
        const pieData = (chartData as any[]).reduce((acc: { name: string; value: number }[], row) => {
          const key = row[xAxisConfig.dataKey];
          const value = Number(row[yAxisConfig.dataKey]) || 0;
          const existing = acc.find(item => item.name === key);
          if (existing) {
            existing.value += value;
          } else {
            acc.push({ name: key, value });
          }
          return acc;
        }, []);

        // Modern pie color palette with better harmony
        const modernPieColors = [
          "#8884d8", // blue (matches backend and single-series first color)
          colors.secondary,
          colors.tertiary,
          "#3b82f6", // blue
          "#f59e0b", // amber
          "#ef4444", // red
          "#06b6d4", // cyan
          "#84cc16", // lime
          "#f97316", // orange
          "#ec4899", // pink
        ];

        return (
          <ChartContainer key={key} config={config} className={`chart-container ${chartHeight} w-full`}>
            <PieChart
              onClick={() => {
                // Clear trace emphasis when clicking on chart background
                setEmphasizedTrace(prev => ({ ...prev, [chart.id]: null }));
              }}
            >
              <defs>
                {modernPieColors.map((color, i) => (
                  <linearGradient key={i} id={`pieGradient-${chart.id}-${i}`} x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={1}/>
                    <stop offset="100%" stopColor={color} stopOpacity={0.8}/>
                  </linearGradient>
                ))}
                <filter id={`pieShadow-${chart.id}`} x="-50%" y="-50%" width="200%" height="200%">
                  <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.15" floodColor="#000000"/>
                </filter>
              </defs>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                outerRadius={isCompact ? 65 : 95}
                innerRadius={isCompact ? 25 : 35}
                dataKey="value"
                stroke="white"
                strokeWidth={3}
                filter={`url(#pieShadow-${chart.id})`}
                label={({ name, percent }) => 
                  percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ''
                }
                labelLine={false}
                style={{ fontSize: '11px', fontWeight: 500 }}
              >
                {pieData.map((entry, i) => (
                  <Cell 
                    key={`cell-${i}`} 
                    fill={`url(#pieGradient-${chart.id}-${i % modernPieColors.length})`}
                    style={{ cursor: 'pointer' }}
                  />
                ))}
              </Pie>
              <ChartTooltip 
                content={<ChartTooltipContent />} 
                contentStyle={{ 
                  backgroundColor: 'rgba(255, 255, 255, 0.98)', 
                  border: 'none', 
                  borderRadius: '12px', 
                  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
                  backdropFilter: 'blur(10px)',
                  fontSize: '12px',
                  fontWeight: 500
                }} 
              />
            </PieChart>
          </ChartContainer>
        );
      default:
        return null;
    }
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
      
      <div className="relative z-10 flex-1 p-6 overflow-hidden">
        <div
          className={`grid gap-6 ${layoutConfig.containerClass} transition-all duration-300 ease-in-out h-full`}
          style={{
            gridTemplateRows: layoutConfig.rows > 1 ? `repeat(${layoutConfig.rows}, 1fr)` : '1fr'
          }}
        >
          {charts.map((chart, index) => {
            const colors = getChartColors(index);
            
            return (
                   <Card 
                     key={chart.id} 
                    className="chart-card border-0 shadow-xl bg-white/95 backdrop-blur-sm overflow-hidden transform hover:scale-[1.02] transition-all duration-300 relative flex flex-col h-full group hover:shadow-2xl"
                     onContextMenu={e => {
                       e.preventDefault(); // Disable right-click context menu
                       e.stopPropagation();
                     }}
                   >
                    <div className="bg-white border-b-2 border-yellow-400 p-4 relative flex-shrink-0 group-hover:shadow-lg transition-shadow duration-300">
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
                        onContextMenu={e => {
                           e.preventDefault(); // Disable right-click context menu
                           e.stopPropagation();
                         }}
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
                     
                     <CardContent className={`flex-1 overflow-hidden ${isCompact ? 'p-2' : 'p-4'} flex flex-col`}>
                       <div className="flex-1 overflow-hidden min-h-0">
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
                        