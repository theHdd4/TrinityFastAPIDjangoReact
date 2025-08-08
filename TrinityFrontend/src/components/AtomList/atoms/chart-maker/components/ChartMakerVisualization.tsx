import React, { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Plus, Minus, BarChart3, Filter, X, Layers, LineChart } from 'lucide-react';
import { ChartConfig } from '../ChartMakerAtom';
import { ChartMakerSettings, ChartMakerConfig } from '@/components/LaboratoryMode/store/laboratoryStore';
import TraceManager from './TraceManager';
import { migrateLegacyChart, toggleChartMode, validateChart } from '../utils/traceUtils';

interface ChartMakerVisualizationProps {
  settings: ChartMakerSettings;
  onSettingsChange: (newSettings: Partial<ChartMakerSettings>) => void;
  onRenderCharts: () => void;
  onChartSettingsImmediateChange?: (chartIndex: number, updates: Partial<ChartMakerConfig>) => void;
}

const ChartMakerVisualization: React.FC<ChartMakerVisualizationProps> = ({
  settings,
  onSettingsChange,
  onRenderCharts,
  onChartSettingsImmediateChange
}) => {
  // Debounce timers for chart re-rendering (1.5 seconds)
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});
  
  // Local state for title inputs to prevent overwriting during typing
  const [localTitles, setLocalTitles] = useState<Record<number, string>>({});

  // Initialize local titles when settings change
  useEffect(() => {
    const newLocalTitles: Record<number, string> = {};
    settings.charts.forEach((chart, index) => {
      // Only update if we don't already have a local value for this chart
      if (localTitles[index] === undefined) {
        newLocalTitles[index] = chart.title;
      }
    });
    if (Object.keys(newLocalTitles).length > 0) {
      setLocalTitles(prev => ({ ...prev, ...newLocalTitles }));
    }
  }, [settings.charts.length]); // Only depend on chart count, not individual chart changes

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(timer => {
        if (timer) clearTimeout(timer);
      });
    };
  }, []);

  // Debounce utility for chart updates (1.5 seconds)
  const debounceChartUpdate = (chartIndex: number, fn: () => void, delay: number = 1500) => {
    const key = `chart-${chartIndex}`;
    if (debounceTimers.current[key]) {
      clearTimeout(debounceTimers.current[key]);
    }
    debounceTimers.current[key] = setTimeout(fn, delay);
  };

  // Handle title changes with local state
  const handleTitleChange = (index: number, newTitle: string) => {
    // Update local state immediately for UI responsiveness
    setLocalTitles(prev => ({ ...prev, [index]: newTitle }));
    
    // Debounce the actual chart update
    debounceChartUpdate(index, () => {
      updateChart(index, { title: newTitle });
    });
  };
  const handleNumberOfChartsChange = (change: number) => {
    const newNumber = Math.max(1, Math.min(2, settings.numberOfCharts + change));
    const newCharts = [...settings.charts];
    
    if (newNumber > settings.numberOfCharts) {
      // Add new charts
      for (let i = settings.numberOfCharts; i < newNumber; i++) {
        newCharts.push({
          id: (i + 1).toString(),
          title: `Chart ${i + 1}`,
          type: 'line',
          xAxis: '',
          yAxis: '',
          filters: {}
        });
      }
    } else {
      // Remove charts
      newCharts.splice(newNumber);
    }
    
    onSettingsChange({
      numberOfCharts: newNumber,
      charts: newCharts
    });
  };

  const updateChart = (index: number, updates: Partial<ChartMakerConfig>) => {
    const newCharts = [...settings.charts];
    const prevChart = newCharts[index];
    // Migrate legacy chart format before applying updates
    const migratedChart = migrateLegacyChart(prevChart);
    newCharts[index] = { ...migratedChart, ...updates };
    onSettingsChange({ charts: newCharts });
    // If chartRendered is true, trigger immediate backend re-render
    if (prevChart.chartRendered && onChartSettingsImmediateChange) {
      onChartSettingsImmediateChange(index, { ...migratedChart, ...updates });
    }
  };

  const toggleMode = (chartIndex: number) => {
    const chart = settings.charts[chartIndex];
    const toggledChart = toggleChartMode(chart);
    updateChart(chartIndex, toggledChart);
  };

  const getAvailableColumns = () => {
    if (!settings.uploadedData) return { numeric: [], categorical: [] };
    
    return {
      numeric: settings.uploadedData.numericColumns || [],
      categorical: settings.uploadedData.categoricalColumns || [],
    };
  };

  const getUniqueValues = (column: string) => {
    if (!settings.uploadedData) return [];
    
    // Use cached unique values from backend if available
    if (settings.uploadedData.uniqueValuesByColumn && settings.uploadedData.uniqueValuesByColumn[column]) {
      return settings.uploadedData.uniqueValuesByColumn[column];
    }
    
    // Fallback to frontend calculation for sample data
    const values = new Set(settings.uploadedData.rows.map(row => String(row[column])));
    return Array.from(values).filter(v => v !== '');
  };

  const isCategoricalColumn = (column: string) => {
    if (!settings.uploadedData) return false;
    
    // Use backend classification if available
    if (settings.uploadedData.categoricalColumns) {
      return settings.uploadedData.categoricalColumns.includes(column);
    }
    
    // Fallback to frontend logic for sample data
    const values = settings.uploadedData.rows.map(row => row[column]);
    const uniqueValues = new Set(values);
    const totalValues = values.length;
    
    // Consider a column categorical if:
    // 1. It has less than 20 unique values, OR
    // 2. The ratio of unique values to total values is less than 0.05 (5%), OR
    // 3. All values are strings that can't be parsed as numbers
    const uniqueCount = uniqueValues.size;
    const uniqueRatio = uniqueCount / totalValues;
    
    const allNonNumeric = values.every(val => 
      val === null || val === undefined || val === '' || isNaN(Number(val))
    );
    
    return uniqueCount < 20 || uniqueRatio < 0.05 || allNonNumeric;
  };

  const getCategoricalColumns = () => {
    if (!settings.uploadedData) return [];
    
    // Use backend classification if available
    if (settings.uploadedData.categoricalColumns) {
      return settings.uploadedData.categoricalColumns;
    }
    
    // Fallback to frontend calculation
    return settings.uploadedData.columns.filter(column => isCategoricalColumn(column));
  };

  const updateFilter = (chartIndex: number, column: string, values: string[]) => {
    const newCharts = [...settings.charts];
    newCharts[chartIndex].filters = {
      ...newCharts[chartIndex].filters,
      [column]: values
    };
    onSettingsChange({ charts: newCharts });
  };

  const removeFilter = (chartIndex: number, column: string) => {
    const newCharts = [...settings.charts];
    const { [column]: removed, ...remainingFilters } = newCharts[chartIndex].filters;
    newCharts[chartIndex].filters = remainingFilters;
    onSettingsChange({ charts: newCharts });
  };

  // Exclude columns with only one unique value, and those selected as xAxis or yAxis
  const getAvailableFilterColumns = () => {
    if (!settings.uploadedData) return [];
    const allCategorical = getCategoricalColumns();
    return allCategorical.filter(column => {
      // Exclude if only one unique value
      const uniqueVals = getUniqueValues(column);
      if (uniqueVals.length <= 1) return false;
      // Exclude if selected as xAxis or yAxis
      if (settings.charts.some(chart => chart.xAxis === column || chart.yAxis === column)) return false;
      return true;
    });
  };

  // Remove filters for columns that are now excluded (e.g., selected as xAxis/yAxis)
  React.useEffect(() => {
    settings.charts.forEach((chart, chartIndex) => {
      const available = getAvailableFilterColumns();
      Object.keys(chart.filters).forEach(col => {
        if (!available.includes(col)) {
          removeFilter(chartIndex, col);
        }
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.charts.map(c => c.xAxis), settings.charts.map(c => c.yAxis)]);

  if (!settings.uploadedData) {
    return (
      <div className="text-center py-8">
        <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground">
          Upload data in the Settings tab to configure charts
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 h-full flex flex-col">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Chart Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Number of Charts (Max 2)</Label>
              <div className="flex items-center gap-2 mt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleNumberOfChartsChange(-1)}
                  disabled={settings.numberOfCharts <= 1}
                >
                  <Minus className="w-3 h-3" />
                </Button>
                <span className="w-8 text-center font-medium">{settings.numberOfCharts}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleNumberOfChartsChange(1)}
                  disabled={settings.numberOfCharts >= 2}
                >
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="space-y-4 pr-4">
            {settings.charts.slice(0, settings.numberOfCharts).map((chart, index) => {
              // Migrate legacy chart format
              const migratedChart = migrateLegacyChart(chart);
              
              return (
                <Card key={chart.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">Chart {index + 1}</CardTitle>
                      <div className="flex items-center gap-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant={migratedChart.isAdvancedMode ? "default" : "outline"}
                                onClick={() => toggleMode(index)}
                                className="h-7 text-xs"
                              >
                                {migratedChart.isAdvancedMode ? (
                                  <>
                                    <Layers className="w-3 h-3 mr-1" />
                                    Multi-Series
                                  </>
                                ) : (
                                  <>
                                    <LineChart className="w-3 h-3 mr-1" />
                                    Simple
                                  </>
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>
                                {migratedChart.isAdvancedMode 
                                  ? "Switch to Simple mode (single Y-axis)" 
                                  : "Switch to Multi-Series mode (multiple Y-axes)"
                                }
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                    {/* Mode description */}
                    <div className="text-xs text-muted-foreground">
                      {migratedChart.isAdvancedMode 
                        ? "Multi-Series: Create multiple data series with individual filters"
                        : "Simple: Single Y-axis with basic filtering"
                      }
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Basic Chart Settings */}
                    <div className="space-y-3">
                      <div>
                        <Label className="text-xs">Chart Title</Label>
                        <Input
                          value={localTitles[index] ?? chart.title}
                          onChange={(e) => handleTitleChange(index, e.target.value)}
                          className="mt-1"
                          placeholder="Enter chart title"
                        />
                      </div>

                      <div>
                        <Label className="text-xs">Chart Type</Label>
                        <Select 
                          value={chart.type} 
                          onValueChange={(value) => updateChart(index, { type: value as any })}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="line">Line Chart</SelectItem>
                            <SelectItem value="bar">Bar Chart</SelectItem>
                            <SelectItem value="area">Area Chart</SelectItem>
                            <SelectItem value="scatter">Scatter Plot</SelectItem>
                            <SelectItem value="pie">Pie Chart</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <Label className="text-xs">X-Axis</Label>
                        <Select 
                          value={chart.xAxis} 
                          onValueChange={(value) => updateChart(index, { xAxis: value })}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Select X-axis column" />
                          </SelectTrigger>
                          <SelectContent>
                            {settings.uploadedData.columns.map((column) => (
                              <SelectItem key={column} value={column}>{column}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Mode-specific Configuration */}
                    {migratedChart.isAdvancedMode ? (
                      // Advanced Mode - Multiple Traces
                      <div className="border-t pt-4">
                        <TraceManager
                          chart={migratedChart}
                          onUpdateChart={(updates) => updateChart(index, updates)}
                          availableColumns={getAvailableColumns()}
                          getUniqueValues={getUniqueValues}
                        />
                      </div>
                    ) : (
                      // Simple Mode - Single Y-axis and Filters
                      <>
                        <div>
                          <Label className="text-xs">Y-Axis</Label>
                          <Select 
                            value={chart.yAxis} 
                            onValueChange={(value) => updateChart(index, { yAxis: value })}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Select Y-axis column" />
                            </SelectTrigger>
                            <SelectContent>
                              {settings.uploadedData.columns.map((column) => (
                                <SelectItem key={column} value={column}>{column}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <Label className="text-xs">Filters</Label>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {Object.entries(chart.filters).map(([column, values]) => (
                              <Badge key={column} variant="secondary" className="flex items-center gap-1">
                                {column}
                                <X 
                                  className="w-3 h-3 cursor-pointer" 
                                  onClick={() => removeFilter(index, column)}
                                />
                              </Badge>
                            ))}
                            
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button 
                                  variant="outline" 
                                  size="sm" 
                                  className="w-full"
                                  disabled={
                                    !chart.xAxis || !chart.yAxis || chart.xAxis === 'None' || chart.yAxis === 'None' || getAvailableFilterColumns().length === 0
                                  }
                                  style={{
                                    opacity: (!chart.xAxis || !chart.yAxis || chart.xAxis === 'None' || chart.yAxis === 'None' || getAvailableFilterColumns().length === 0) ? 0.5 : 1
                                  }}
                                >
                                  <Filter className="w-3 h-3 mr-1" />
                                  Add Filter
                                </Button>
                              </PopoverTrigger>
                               <PopoverContent className="w-64" align="start">
                                 <div className="space-y-3">
                                   <Label className="text-xs font-medium">Select Categorical Column to Filter</Label>
                                   {getAvailableFilterColumns().length === 0 ? (
                                     <p className="text-xs text-muted-foreground">No categorical columns available for filtering</p>
                                   ) : (
                                     <div style={{ maxHeight: '224px', overflowY: 'auto' }}>
                                       {getAvailableFilterColumns().map((column) => (
                                         <div key={column}>
                                           <Button
                                             variant="ghost"
                                             size="sm"
                                             className="w-full justify-start"
                                             onClick={() => {
                                               if (!chart.filters[column]) {
                                                 updateFilter(index, column, []);
                                               }
                                             }}
                                             disabled={!!chart.filters[column]}
                                           >
                                             {column}
                                           </Button>
                                         </div>
                                       ))}
                                     </div>
                                   )}
                                 </div>
                               </PopoverContent>
                            </Popover>
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      <div className="pt-4 border-t">
        <Button 
          onClick={onRenderCharts} 
          className="w-full"
          disabled={!settings.uploadedData || settings.charts.some(chart => !validateChart(migrateLegacyChart(chart)))}
        >
          <BarChart3 className="w-4 h-4 mr-2" />
          Render Charts
        </Button>
      </div>
    </div>
  );
};

export default ChartMakerVisualization;