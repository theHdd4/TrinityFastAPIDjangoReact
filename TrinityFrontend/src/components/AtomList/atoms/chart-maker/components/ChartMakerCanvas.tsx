import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts';
import { BarChart3, TrendingUp, BarChart2, Triangle, Zap, Maximize2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { ChartData, ChartConfig } from '../ChartMakerAtom';
import { ChartMakerConfig } from '@/components/LaboratoryMode/store/laboratoryStore';
import './ChartMakerCanvas.css';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useResponsiveChartLayout } from '@/hooks/useResponsiveChartLayout';

// Extend ChartData type to include uniqueValuesByColumn for type safety
interface ChartDataWithUniqueValues extends ChartData {
  uniqueValuesByColumn?: Record<string, string[]>;
}

interface ChartMakerCanvasProps {
  charts: ChartMakerConfig[];
  data: ChartData | null;
  onChartTypeChange?: (chartId: string, newType: ChartConfig['type']) => void;
  onChartFilterChange?: (chartId: string, column: string, values: string[]) => void;
}

const ChartMakerCanvas: React.FC<ChartMakerCanvasProps> = ({ charts, data, onChartTypeChange, onChartFilterChange }) => {
  const typedData = data as ChartDataWithUniqueValues | null;
  const [fullscreenChart, setFullscreenChart] = useState<ChartMakerConfig | null>(null);
  const [fullscreenIndex, setFullscreenIndex] = useState<number | null>(null);
  const [lastSelectedIdx, setLastSelectedIdx] = useState<number | null>(null);
  const [previewTypes, setPreviewTypes] = useState<Record<string, ChartConfig['type'] | null>>({});
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
    pie: BarChart3,
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
        primary: "#3b82f6", // blue
        secondary: "#93c5fd",
        gradient: "from-blue-500 to-blue-600"
      },
      {
        primary: "#10b981", // green  
        secondary: "#6ee7b7",
        gradient: "from-green-500 to-green-600"
      },
      {
        primary: "#8b5cf6", // purple
        secondary: "#c4b5fd",
        gradient: "from-purple-500 to-purple-600"
      },
      {
        primary: "#f59e0b", // amber
        secondary: "#fcd34d",
        gradient: "from-amber-500 to-amber-600"
      },
      {
        primary: "#ef4444", // red
        secondary: "#fca5a5",
        gradient: "from-red-500 to-red-600"
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

  const renderChart = (chart: ChartMakerConfig, index: number) => {
    // Show loading spinner if chart is loading
    if ((chart as any).chartLoading) {
      const loadingHeight = isCompact ? 'h-40' : 'h-64';
      return (
        <div className={`flex items-center justify-center ${loadingHeight}`}>
          <svg className="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
          </svg>
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
    const key = chart.lastUpdateTime || chart.id;

    // Dynamic height based on layout
    const chartHeight = isCompact ? 'h-40' : layoutConfig.layout === 'vertical' ? 'h-48' : 'h-56';

    if (!chartData.length || !xAxisConfig.dataKey || !yAxisConfig.dataKey) {
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
          <ChartContainer key={key} config={config} className={`${chartHeight} w-full`}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis {...xAxisConfig} />
              <YAxis {...yAxisConfig} />
              <ChartTooltip content={<ChartTooltipContent />} contentStyle={{ backgroundColor: 'white', border: 'none', borderRadius: '8px', boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.2)' }} />
              {traces.length > 0 ? traces.map((trace, i) => (
                <Line key={trace.dataKey || i} type={trace.type || 'monotone'} dataKey={trace.dataKey} stroke={trace.stroke || colors.primary} strokeWidth={trace.strokeWidth || 3} dot={{ fill: trace.stroke || colors.primary, strokeWidth: 2, r: 4 }} activeDot={{ r: 6, fill: trace.stroke || colors.primary, stroke: 'white', strokeWidth: 2 }} />
              )) : (
                <Line type="monotone" dataKey={yAxisConfig.dataKey} stroke={colors.primary} strokeWidth={3} dot={{ fill: colors.primary, strokeWidth: 2, r: 4 }} activeDot={{ r: 6, fill: colors.primary, stroke: 'white', strokeWidth: 2 }} />
              )}
            </LineChart>
          </ChartContainer>
        );
      case 'bar':
        return (
          <ChartContainer key={key} config={config} className={`${chartHeight} w-full`}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis {...xAxisConfig} />
              <YAxis {...yAxisConfig} />
              <ChartTooltip content={<ChartTooltipContent />} contentStyle={{ backgroundColor: 'white', border: 'none', borderRadius: '8px', boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.2)' }} />
              {traces.length > 0 ? traces.map((trace, i) => (
                <Bar key={trace.dataKey || i} dataKey={trace.dataKey} fill={trace.fill || colors.primary} radius={[4, 4, 0, 0]} />
              )) : (
                <Bar dataKey={yAxisConfig.dataKey} fill={colors.primary} radius={[4, 4, 0, 0]} />
              )}
            </BarChart>
          </ChartContainer>
        );
      case 'area':
        return (
          <ChartContainer key={key} config={config} className={`${chartHeight} w-full`}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis {...xAxisConfig} />
              <YAxis {...yAxisConfig} />
              <ChartTooltip content={<ChartTooltipContent />} contentStyle={{ backgroundColor: 'white', border: 'none', borderRadius: '8px', boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.2)' }} />
              {traces.length > 0 ? traces.map((trace, i) => (
                <Area key={trace.dataKey || i} type={trace.type || 'monotone'} dataKey={trace.dataKey} stroke={trace.stroke || colors.primary} fill={trace.fill || colors.primary} fillOpacity={trace.fillOpacity || 0.2} strokeWidth={trace.strokeWidth || 2} />
              )) : (
                <Area type="monotone" dataKey={yAxisConfig.dataKey} stroke={colors.primary} fill={colors.primary} fillOpacity={0.2} strokeWidth={2} />
              )}
            </AreaChart>
          </ChartContainer>
        );
      case 'scatter':
        return (
          <ChartContainer key={key} config={config} className={`${chartHeight} w-full`}>
            <ScatterChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis {...xAxisConfig} />
              <YAxis {...yAxisConfig} />
              <ChartTooltip content={<ChartTooltipContent />} contentStyle={{ backgroundColor: 'white', border: 'none', borderRadius: '8px', boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.2)' }} />
              {traces.length > 0 ? traces.map((trace, i) => (
                <Scatter key={trace.dataKey || i} dataKey={trace.dataKey} fill={trace.fill || colors.primary} />
              )) : (
                <Scatter dataKey={yAxisConfig.dataKey} fill={colors.primary} />
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
        return (
          <ChartContainer key={key} config={config} className={`${chartHeight} w-full`}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                outerRadius={isCompact ? 60 : 90}
                innerRadius={isCompact ? 20 : 30}
                fill={colors.primary}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {pieData.map((entry, i) => {
                  const pieColors = [colors.primary, colors.secondary, "#8b5cf6", "#f59e0b", "#ef4444"];
                  return (
                    <Cell key={`cell-${i}`} fill={pieColors[i % pieColors.length]} stroke="white" strokeWidth={2} />
                  );
                })}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent />} contentStyle={{ backgroundColor: 'white', border: 'none', borderRadius: '8px', boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.2)' }} />
            </PieChart>
          </ChartContainer>
        );
      default:
        return null;
    }
  };

  if (charts.length === 0) {
    return (
      <div className="w-full h-full p-6 bg-gradient-to-br from-slate-50 to-blue-50 overflow-y-auto">
        <div className="flex items-center justify-center h-full">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-xl">
              <BarChart3 className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">Chart Maker</h3>
            <p className="text-gray-600 mb-4">
              Create beautiful interactive charts and visualizations
            </p>
            <p className="text-sm text-gray-500">
              Upload data and configure charts in the settings panel to get started
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full p-6 bg-gradient-to-br from-slate-50 to-blue-50 overflow-hidden">
      <div className="mb-6">
        <div className="flex items-center mb-4">
          <div className="w-1 h-8 bg-gradient-to-b from-blue-500 to-blue-600 rounded-full mr-4"></div>
          <h2 className="text-2xl font-bold text-gray-900">Chart Maker</h2>
        </div>
        <p className="text-gray-600">Interactive data visualization dashboard</p>
      </div>
      
      <div className="flex-1 overflow-auto">
        <div 
          className={`grid gap-6 ${layoutConfig.containerClass} transition-all duration-300 ease-in-out`}
          style={{
            gridTemplateRows: layoutConfig.rows > 1 ? `repeat(${layoutConfig.rows}, ${layoutConfig.cardHeight})` : layoutConfig.cardHeight,
            minHeight: 'fit-content'
          }}
        >
          {charts.map((chart, index) => {
            const colors = getChartColors(index);
            
            // For mixed layout (3 charts on medium screens), handle special positioning
            const gridColumnSpan = layoutConfig.layout === 'mixed' && charts.length === 3 ? 
              (index === 2 ? 'col-span-2' : 'col-span-1') : '';
            
            return (
              <ContextMenu key={chart.id}>
                 <ContextMenuTrigger>
                   <Card className={`border-0 shadow-xl bg-white/90 backdrop-blur-sm overflow-hidden transform hover:scale-105 transition-all duration-300 relative ${gridColumnSpan}`}>
                     <div className={`bg-gradient-to-r ${colors.gradient} p-4 relative`}>
                       <CardTitle className={`font-bold text-white flex items-center ${isCompact ? 'text-base' : 'text-lg'}`}>
                         <BarChart3 className={`mr-2 ${isCompact ? 'w-4 h-4' : 'w-5 h-5'}`} />
                         {chart.title}
                       </CardTitle>
                       {/* Transparent overlay for Alt+Click fullscreen */}
                       <div
                         className="absolute inset-0 cursor-pointer"
                         style={{ background: 'transparent', zIndex: 10 }}
                         onClick={e => {
                           if (e.altKey) {
                             setFullscreenChart(chart);
                             setFullscreenIndex(index);
                           }
                         }}
                         title="Alt+Click to expand"
                       />
                     </div>
                     
                      {/* Filter Controls - Compact version for small screens */}
                      {Object.keys(chart.filters).length > 0 && (
                        <div className="bg-gray-50 p-3 border-b">
                          <div className="space-y-2">
                            {Object.entries(chart.filters).map(([column, selectedValues]) => {
                              const uniqueValues = getUniqueValuesForColumn(column);
                              return (
                                <div key={column} className="flex items-center gap-2">
                                  <Label className={`font-medium text-gray-700 min-w-fit ${isCompact ? 'text-xs' : 'text-xs'}`}>
                                    {column}:
                                  </Label>
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className={`justify-between flex-1 font-normal ${isCompact ? 'h-6 text-xs' : 'h-7 text-xs'}`}
                                      >
                                        <span className="truncate">
                                          {selectedValues.length === 0
                                            ? "No values selected"
                                            : selectedValues.length === uniqueValues.length
                                            ? "All values"
                                            : selectedValues.length === 1
                                            ? selectedValues[0]
                                            : `${selectedValues.length} selected`
                                          }
                                        </span>
                                        <ChevronDown className="h-3 w-3 opacity-50" />
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-56 p-0" align="start">
                                      <div className="p-3 border-b">
                                        <div className="flex items-center justify-between">
                                          <span className="text-sm font-medium">Filter by {column}</span>
                                          {selectedValues.length > 0 && (
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-6 px-2 text-xs"
                                              onClick={() => onChartFilterChange?.(chart.id, column, [])}
                                            >
                                              Clear
                                            </Button>
                                          )}
                                        </div>
                                      </div>
                                      <div className="flex gap-2 p-2 border-b">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="flex-1 h-6 text-xs"
                                          onClick={() => onChartFilterChange?.(chart.id, column, uniqueValues)}
                                        >
                                          All
                                        </Button>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="flex-1 h-6 text-xs"
                                          onClick={() => onChartFilterChange?.(chart.id, column, [])}
                                        >
                                          None
                                        </Button>
                                      </div>
                                      <ScrollArea className="filter-scroll-area">
                                        <RadioGroup value="" onValueChange={() => {}}>
                                          <div className="p-2 space-y-1">
                                            {uniqueValues.map((value, valueIdx) => (
                                              <div key={value} className="flex items-center space-x-2 cursor-pointer"
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
                                                <label className="text-xs cursor-pointer flex-1 truncate">
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
                      )}
                     
                     <CardContent className={`overflow-hidden ${isCompact ? 'p-2' : 'p-4'}`}>
                       <div className="overflow-hidden h-full">
                         {renderChart(chart, index)}
                       </div>
                     </CardContent>
                   </Card>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48">
                  {(Object.keys(chartTypeIcons) as Array<'line' | 'bar' | 'area' | 'pie' | 'scatter'>).map((type) => {
                    const Icon = chartTypeIcons[type];
                    const isActive = (previewTypes[chart.id] || chart.type) === type;
                    return (
                      <ContextMenuItem
                        key={type}
                        className={`flex items-center gap-2 ${isActive ? 'bg-accent' : ''}`}
                        onClick={() => {
                          if (previewTypes[chart.id]) setPreviewTypes(prev => ({ ...prev, [chart.id]: null }));
                          onChartTypeChange?.(chart.id, type);
                        }}
                      >
                        <Icon className="h-4 w-4" />
                        {chartTypeLabels[type]}
                      </ContextMenuItem>
                    );
                  })}
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </div>
      </div>

      {/* Fullscreen Modal */}
      <Dialog open={!!fullscreenChart} onOpenChange={() => setFullscreenChart(null)}>
        <DialogContent className="max-w-6xl h-[80vh] p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              {fullscreenChart?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            {fullscreenChart && fullscreenIndex !== null && (
              <div className="h-full">
                <ChartContainer config={chartConfig} className="h-full w-full">
                  {(() => {
                    const chartData = getFilteredData(fullscreenChart);
                    const colors = getChartColors(fullscreenIndex);
                    
                    if (!chartData.length || !fullscreenChart.xAxis || !fullscreenChart.yAxis) {
                      return (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
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

                    switch (fullscreenChart.type) {
                      case 'line':
                        return (
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis 
                                dataKey={fullscreenChart.xAxis} 
                                stroke="#64748b"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                              />
                              <YAxis 
                                stroke="#64748b"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                              />
                              <ChartTooltip 
                                content={<ChartTooltipContent />}
                                contentStyle={{
                                  backgroundColor: 'white',
                                  border: 'none',
                                  borderRadius: '8px',
                                  boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.2)'
                                }}
                              />
                              <Line 
                                type="monotone" 
                                dataKey={fullscreenChart.yAxis} 
                                stroke={colors.primary}
                                strokeWidth={3}
                                dot={{ fill: colors.primary, strokeWidth: 2, r: 4 }}
                                activeDot={{ r: 6, fill: colors.primary, stroke: 'white', strokeWidth: 2 }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        );
                      
                      case 'bar':
                        return (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis 
                                dataKey={fullscreenChart.xAxis} 
                                stroke="#64748b"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                              />
                              <YAxis 
                                stroke="#64748b"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                              />
                              <ChartTooltip 
                                content={<ChartTooltipContent />}
                                contentStyle={{
                                  backgroundColor: 'white',
                                  border: 'none',
                                  borderRadius: '8px',
                                  boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.2)'
                                }}
                              />
                              <Bar 
                                dataKey={fullscreenChart.yAxis} 
                                fill={colors.primary}
                                radius={[4, 4, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        );
                      
                      case 'area':
                        return (
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis 
                                dataKey={fullscreenChart.xAxis} 
                                stroke="#64748b"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                              />
                              <YAxis 
                                stroke="#64748b"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                              />
                              <ChartTooltip 
                                content={<ChartTooltipContent />}
                                contentStyle={{
                                  backgroundColor: 'white',
                                  border: 'none',
                                  borderRadius: '8px',
                                  boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.2)'
                                }}
                              />
                              <Area 
                                type="monotone" 
                                dataKey={fullscreenChart.yAxis} 
                                stroke={colors.primary}
                                fill={colors.primary}
                                fillOpacity={0.2}
                                strokeWidth={2}
                              />
                            </AreaChart>
                          </ResponsiveContainer>
                        );
                      
                      case 'scatter':
                        return (
                          <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                              <XAxis 
                                dataKey={fullscreenChart.xAxis} 
                                stroke="#64748b"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                              />
                              <YAxis 
                                dataKey={fullscreenChart.yAxis} 
                                stroke="#64748b"
                                fontSize={12}
                                tickLine={false}
                                axisLine={false}
                              />
                              <ChartTooltip 
                                content={<ChartTooltipContent />}
                                contentStyle={{
                                  backgroundColor: 'white',
                                  border: 'none',
                                  borderRadius: '8px',
                                  boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.2)'
                                }}
                              />
                              <Scatter fill={colors.primary} />
                            </ScatterChart>
                          </ResponsiveContainer>
                        );
                      
                      case 'pie':
                        const pieData = (chartData as any[]).reduce((acc: { name: string; value: number }[], row) => {
                          const key = row[fullscreenChart.xAxis];
                          const value = Number(row[fullscreenChart.yAxis]) || 0;
                          const existing = acc.find(item => item.name === key);
                          
                          if (existing) {
                            existing.value += value;
                          } else {
                            acc.push({ name: key, value });
                          }
                          
                          return acc;
                        }, []);

                        return (
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                outerRadius={200}
                                innerRadius={80}
                                fill={colors.primary}
                                dataKey="value"
                                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                labelLine={false}
                              >
                                {pieData.map((entry, index) => {
                                  const pieColors = [colors.primary, colors.secondary, "#8b5cf6", "#f59e0b", "#ef4444"];
                                  return (
                                    <Cell 
                                      key={`cell-${index}`} 
                                      fill={pieColors[index % pieColors.length]} 
                                      stroke="white"
                                      strokeWidth={2}
                                    />
                                  );
                                })}
                              </Pie>
                              <ChartTooltip 
                                content={<ChartTooltipContent />}
                                contentStyle={{
                                  backgroundColor: 'white',
                                  border: 'none',
                                  borderRadius: '8px',
                                  boxShadow: '0 10px 30px -10px rgba(0, 0, 0, 0.2)'
                                }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        );
                      
                      default:
                        return null;
                    }
                  })()}
                </ChartContainer>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChartMakerCanvas;