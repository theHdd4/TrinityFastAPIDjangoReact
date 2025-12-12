import React, { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu';
import { Plus, Minus, BarChart3, Filter, X, Layers, LineChart, ChevronDown, ChevronUp, Copy } from 'lucide-react';
import { ChartMakerSettings, ChartMakerConfig } from '@/components/LaboratoryMode/store/laboratoryStore';
import TraceManager from './TraceManager';
import { migrateLegacyChart, toggleChartMode, validateChart } from '../utils/traceUtils';

interface ChartMakerVisualizationProps {
  settings: ChartMakerSettings;
  onSettingsChange: (newSettings: Partial<ChartMakerSettings>) => void;
  onRenderCharts: () => void;
}

const ChartMakerVisualization: React.FC<ChartMakerVisualizationProps> = ({
  settings,
  onSettingsChange,
  onRenderCharts
}) => {
  // Debounce timers for chart re-rendering (1.5 seconds)
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});
  
  // Local state for title inputs to prevent overwriting during typing
  const [localTitles, setLocalTitles] = useState<Record<number, string>>({});
  
  // Track which chart is expanded (accordion - only one at a time)
  const [expandedChart, setExpandedChart] = useState<number>(-1);
  
  // Track chart deletion confirmation dialog
  const [chartToDelete, setChartToDelete] = useState<number | null>(null);
  
  // Watch for selectedChartIndex from canvas click
  useEffect(() => {
    const selectedChartIndex = (settings as any).selectedChartIndex;
    if (selectedChartIndex !== undefined && selectedChartIndex >= 0) {
      setExpandedChart(selectedChartIndex);
      // Clear the selectedChartIndex after expanding
      onSettingsChange({ selectedChartIndex: undefined } as any);
    }
  }, [(settings as any).selectedChartIndex]);

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
    
    // Only update the layout setting, don't add or remove charts
    // Charts are now added via the + button in the canvas
    onSettingsChange({
      numberOfCharts: newNumber
    });
  };

  const updateChart = (index: number, updates: Partial<ChartMakerConfig>) => {
    const newCharts = [...settings.charts];
    const prevChart = newCharts[index];
    
    // 🔧 CRITICAL FIX: Preserve the original chart ID - it must NEVER change
    const originalChartId = prevChart.id;
    if (!originalChartId) {
      console.error('❌ [UPDATE-CHART] Chart without ID detected!', { index, chart: prevChart });
      return;
    }
    
    // Migrate legacy chart format before applying updates
    const migratedChart = migrateLegacyChart(prevChart);

    // 🔧 CRITICAL FIX: Ensure filters is always initialized as an object
    if (!migratedChart.filters) {
      migratedChart.filters = {};
    }

    // Merge updates into migrated chart first
    let updatedChart: ChartMakerConfig = { ...migratedChart, ...updates } as ChartMakerConfig;
    
    // 🔧 CRITICAL: Force preserve original chart ID - NEVER allow it to change
    updatedChart.id = originalChartId;
    
    // 🔧 CRITICAL FIX: Ensure filters persists through updates
    if (!updatedChart.filters) {
      updatedChart.filters = {};
    }

    // Enforce chart type compatibility with legend selections
    const nextLegendField = updates.legendField !== undefined ? updates.legendField : updatedChart.legendField;
    const legendActive = nextLegendField && nextLegendField !== 'aggregate';
    const nextType = updates.type !== undefined ? updates.type : updatedChart.type;

    if (legendActive && nextType === 'pie') {
      updatedChart = {
        ...updatedChart,
        type: 'line'
      };
    }

    // If axes changed, strip any existing filters that target those axes
    const axisSelections: string[] = [];
    if (updates.xAxis) axisSelections.push(updates.xAxis);
    if (updates.yAxis) axisSelections.push(updates.yAxis);

    if (axisSelections.length > 0) {
      // Legacy single-series filters
      if (updatedChart.filters) {
        axisSelections.forEach(axis => {
          if (updatedChart.filters && axis in updatedChart.filters) {
            const { [axis]: _removed, ...rest } = updatedChart.filters;
            updatedChart.filters = rest;
          }
        });
      }

      // Advanced-mode trace-specific filters
      if (updatedChart.traces) {
        updatedChart.traces = updatedChart.traces.map(trace => {
          if (!trace.filters) return trace;
          const newTraceFilters = { ...trace.filters } as Record<string, string[]>;
          axisSelections.forEach(axis => {
            if (axis in newTraceFilters) {
              delete newTraceFilters[axis];
            }
          });
          return { ...trace, filters: newTraceFilters };
        });
      }
    }

    // Determine if changes require chart re-rendering
    const resetKeys: (keyof ChartMakerConfig)[] = ['xAxis', 'yAxis', 'filters', 'traces', 'type'];
    const needsReset = resetKeys.some(key => key in updates);

    // 🔧 CRITICAL: Final check - ensure ID is preserved
    const finalChart = {
      ...updatedChart,
      ...(needsReset ? { chartRendered: false, chartConfig: undefined, filteredData: undefined } : {}),
      id: originalChartId // Force preserve original ID
    };
    
    // Verify ID hasn't changed
    if (finalChart.id !== originalChartId) {
      console.error('❌ [UPDATE-CHART] Chart ID changed during update! Forcing restore.', {
        originalId: originalChartId,
        newId: finalChart.id
      });
      finalChart.id = originalChartId;
    }
    
    newCharts[index] = finalChart;

    onSettingsChange({ charts: newCharts });

  };

  const toggleMode = (chartIndex: number) => {
    const chart = settings.charts[chartIndex];
    const toggledChart = toggleChartMode(chart);
    updateChart(chartIndex, toggledChart);
  };
  
  const handleConfirmDelete = () => {
    if (chartToDelete === null) return;
    
    const newCharts = settings.charts
      .filter((_, i) => i !== chartToDelete)
      .map((chart, newIndex) => ({
        ...chart,
        // Update chart IDs and titles to reflect new positions
        id: (newIndex + 1).toString(),
        title: chart.title.match(/^Chart \d+$/) ? `Chart ${newIndex + 1}` : chart.title
      }));
    
    // Adjust expanded chart index if needed
    if (expandedChart === chartToDelete) {
      setExpandedChart(-1);
    } else if (expandedChart > chartToDelete) {
      setExpandedChart(expandedChart - 1);
    }
    onSettingsChange({ charts: newCharts });
    setChartToDelete(null);
  };

  const handleDuplicateChart = (index: number) => {
    const chartToDuplicate = settings.charts[index];
    if (!chartToDuplicate) return;
    
    // Generate a new unique ID for the duplicate
    const existingIds = settings.charts.map(c => {
      const idNum = parseInt(c.id);
      return isNaN(idNum) ? 0 : idNum;
    });
    const maxId = existingIds.length > 0 ? Math.max(...existingIds) : 0;
    const newId = (maxId + 1).toString();
    
    // Create a deep copy of the chart with a new ID and updated title
    const duplicatedChart: ChartMakerConfig = {
      ...chartToDuplicate,
      id: newId,
      title: `${chartToDuplicate.title} (Copy)`,
      chartRendered: false,
      chartConfig: undefined,
      filteredData: undefined,
      chartLoading: false,
      // Deep copy traces if they exist
      traces: chartToDuplicate.traces ? JSON.parse(JSON.stringify(chartToDuplicate.traces)) : undefined,
      // Deep copy filters
      filters: chartToDuplicate.filters ? { ...chartToDuplicate.filters } : {}
    };
    
    // Insert the duplicate right after the original chart
    const newCharts = [...settings.charts];
    newCharts.splice(index + 1, 0, duplicatedChart);
    
    onSettingsChange({ charts: newCharts });
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

  const toNumericValue = (value: unknown): number | null => {
    if (value === null || value === undefined) return null;
    
    if (typeof value === 'number') {
      const numericValue = value as number;
      return Number.isFinite(numericValue) ? numericValue : null;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed === '') return null;
      const parsed = Number(trimmed);
      return Number.isFinite(parsed) ? parsed : null;
    }

    if (typeof value === 'bigint') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  };

  const hasSufficientUniqueValues = (column: string) => getUniqueValues(column).length > 1;

  const hasValidNumericValues = (column: string) => {
    if (!settings.uploadedData) return false;

    const uniqueMap = (settings.uploadedData.uniqueValuesByColumn ||
      settings.uploadedData.unique_values) as Record<string, unknown[]> | undefined;

    if (uniqueMap && Array.isArray(uniqueMap[column])) {
      const uniqueValues = (uniqueMap[column] as unknown[])
        .map(value => toNumericValue(value))
        .filter((value): value is number => value !== null);
      if (uniqueValues.length > 0) {
        return true;
      }
      return false;
    }

    if (Array.isArray(settings.uploadedData.rows) && settings.uploadedData.rows.length > 0) {
      const values = settings.uploadedData.rows
        .map(row => toNumericValue(row[column]))
        .filter((value): value is number => value !== null);
      if (values.length > 0) {
        return true;
      }
    }

    // Fall back to trusting backend classification when no data is available on the client
    return Array.isArray(settings.uploadedData.numericColumns)
      ? settings.uploadedData.numericColumns.includes(column)
      : true;
  };

  const getNumericColumns = () => {
    if (!settings.uploadedData) return [];

    const sourceColumns = (settings.uploadedData.numericColumns && settings.uploadedData.numericColumns.length > 0)
      ? settings.uploadedData.numericColumns
      : settings.uploadedData.columns;

    return sourceColumns.filter(hasValidNumericValues);
  };

  const getXAxisColumns = () => {
    if (!settings.uploadedData) return [];
    const numericColumns = new Set(getNumericColumns());
    const categoricalColumns = new Set(getCategoricalColumns());
    const allColumns = settings.uploadedData.allColumns || settings.uploadedData.columns;
    return allColumns.filter(column => numericColumns.has(column) || categoricalColumns.has(column));
  };

  const getAvailableColumns = () => {
    if (!settings.uploadedData) return { numeric: [], categorical: [] };
    
    const numeric = getNumericColumns();
    const categorical = settings.uploadedData.categoricalColumns || [];
    const allColumns = settings.uploadedData.allColumns || [];
    
    // Find any columns that aren't categorized and add them to categorical
    const categorizedColumns = new Set([...numeric, ...categorical]);
    const uncategorizedColumns = allColumns.filter(col => !categorizedColumns.has(col));
    
    return {
      numeric,
      categorical: [...categorical, ...uncategorizedColumns].filter(hasSufficientUniqueValues),
    };
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
      return settings.uploadedData.categoricalColumns.filter(hasSufficientUniqueValues);
    }
    
    // Fallback to frontend calculation
    return settings.uploadedData.columns.filter(column => isCategoricalColumn(column) && hasSufficientUniqueValues(column));
  };

  const getLegendColumns = () => {
    if (!settings.uploadedData) return [];

    const categorical = getCategoricalColumns();
    const numericColumns = getNumericColumns();
    const filteredNumeric = numericColumns
      .filter(column => getUniqueValues(column).length < 20)
      .filter(hasSufficientUniqueValues);

    return Array.from(new Set([...categorical, ...filteredNumeric]));
  };

  const updateFilter = (chartIndex: number, column: string, values: string[]) => {
    const newCharts = [...settings.charts];
    // 🔧 CRITICAL FIX: Ensure filters object exists before updating
    if (!newCharts[chartIndex].filters) {
      newCharts[chartIndex].filters = {};
    }
    newCharts[chartIndex].filters = {
      ...newCharts[chartIndex].filters,
      [column]: values
    };
    onSettingsChange({ charts: newCharts });
  };

  const removeFilter = (chartIndex: number, column: string) => {
    const newCharts = [...settings.charts];
    // 🔧 CRITICAL FIX: Ensure filters object exists before removing
    if (!newCharts[chartIndex].filters) {
      newCharts[chartIndex].filters = {};
    }
    const { [column]: removed, ...remainingFilters } = newCharts[chartIndex].filters;
    newCharts[chartIndex].filters = remainingFilters;
    onSettingsChange({ charts: newCharts });
  };

  // Return ALL columns for filtering
  const getAvailableFilterColumns = () => {
    if (!settings.uploadedData) return [];

    const numeric = new Set(getNumericColumns());
    const categorical = new Set(getCategoricalColumns());
    const allColumns = settings.uploadedData.allColumns ||
      [...(settings.uploadedData.numericColumns || []), ...(settings.uploadedData.categoricalColumns || [])];

    return allColumns.filter(column => numeric.has(column) || categorical.has(column));
  };

  // Remove filters for columns that no longer exist in the dataset
  React.useEffect(() => {
    settings.charts.forEach((chart, chartIndex) => {
      const available = getAvailableFilterColumns();
      if (chart.filters && typeof chart.filters === 'object') {
        Object.keys(chart.filters).forEach(col => {
          if (!available.includes(col)) {
            removeFilter(chartIndex, col);
          }
        });
      }
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
              <Label className="text-xs">Charts Per Row (max 2)</Label>
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
              <p className="text-xs text-muted-foreground mt-1">Use the + button in canvas to add more charts</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex-1 overflow-hidden">
        <ScrollArea className="w-full">
          <div className="space-y-4 pr-4 w-full">
            {settings.charts.map((chart, index) => {
              // Migrate legacy chart format
              const migratedChart = migrateLegacyChart(chart);

              return (
                <ContextMenu key={chart.id}>
                  <ContextMenuTrigger asChild>
                    <Card className="w-full" data-chart-settings={index}>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm">{chart.title}</CardTitle>
                      <div className="flex items-center gap-2">
                        {/* <TooltipProvider>
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
                        </TooltipProvider> */}
                        
                        {/* Collapse/Expand Icon */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => setExpandedChart(expandedChart === index ? -1 : index)}
                        >
                          {expandedChart === index ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </Button>
                        
                        {/* Remove Chart Icon */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 hover:bg-red-100 hover:text-red-600"
                          onClick={() => setChartToDelete(index)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    {/* Mode description */}
                    {/* <div className="text-xs text-muted-foreground">
                      {migratedChart.isAdvancedMode 
                        ? "Multi-Series: Create multiple data series with individual filters"
                        : "Simple: Single Y-axis with basic filtering"
                      }
                    </div> */}
                  </CardHeader>
                  {expandedChart === index && (
                  <CardContent className="space-y-4">
                    {/* Mode-specific Configuration */}
                    {migratedChart.isAdvancedMode ? (
                      // Advanced Mode - Multiple Traces
                      <>
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
                                {chart.legendField && chart.legendField !== 'aggregate' && (
                                  <SelectItem value="stacked_bar">Stacked Bar Chart</SelectItem>
                                )}
                                <SelectItem value="area">Area Chart</SelectItem>
                                <SelectItem value="scatter">Scatter Plot</SelectItem>
                                {(!chart.legendField || chart.legendField === 'aggregate') && (
                                  <SelectItem value="pie">Pie Chart</SelectItem>
                                )}
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
                                 {getXAxisColumns().map((column) => (
                                   <SelectItem key={column} value={column}>{column}</SelectItem>
                                 ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="border-t pt-4 w-full">
                          <TraceManager
                            chart={migratedChart}
                            onUpdateChart={(updates) => updateChart(index, updates)}
                            availableColumns={getAvailableColumns()}
                            getUniqueValues={getUniqueValues}
                          />
                        </div>

                        {/* Show Note Box Toggle */}
                        <div className="flex items-center justify-between pt-4 border-t">
                          <Label className="text-xs">Show Note Box</Label>
                          <Switch
                            checked={chart.showNote || false}
                            onCheckedChange={(checked) => updateChart(index, { showNote: checked })}
                          />
                        </div>
                      </>
                    ) : (
                      // Simple Mode - Single Y-axis and Filters
                      <>
                        {/* Chart Title and Chart Type in one row */}
                        <div className="grid grid-cols-2 gap-3">
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
                                {chart.legendField && chart.legendField !== 'aggregate' && (
                                  <SelectItem value="stacked_bar">Stacked Bar Chart</SelectItem>
                                )}
                                <SelectItem value="area">Area Chart</SelectItem>
                                <SelectItem value="scatter">Scatter Plot</SelectItem>
                                {(!chart.legendField || chart.legendField === 'aggregate') && (
                                  <SelectItem value="pie">Pie Chart</SelectItem>
                                )}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        {/* X-Axis and Y-Axis in one row */}
                        <div className="grid grid-cols-2 gap-3">
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
                                 {getXAxisColumns().map((column) => (
                                   <SelectItem key={column} value={column}>{column}</SelectItem>
                                 ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label className="text-xs">Y-Axis</Label>
                            <div className="flex gap-1">
                              <Select 
                                value={chart.yAxis} 
                                onValueChange={(value) => updateChart(index, { yAxis: value })}
                              >
                                <SelectTrigger className="mt-1 flex-1">
                                  <SelectValue placeholder="Select Y-axis column">
                                    {chart.secondYAxis === undefined && chart.yAxis ? chart.yAxis.substring(0, 4) : (chart.yAxis || 'Select Y-axis column')}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {getNumericColumns().map((column) => (
                                    <SelectItem key={column} value={column}>{column}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {chart.secondYAxis === undefined && (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="mt-1 h-9 px-2"
                                  onClick={() => updateChart(index, { secondYAxis: '' })}
                                  title="Add second Y-axis"
                                >
                                  <Plus className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Second Y-Axis if enabled */}
                        {chart.secondYAxis !== undefined && (
                          <div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label className="text-xs">Axis Mode</Label>
                                <Select 
                                  value={chart.dualAxisMode || 'dual'} 
                                  onValueChange={(value) => updateChart(index, { dualAxisMode: value as 'dual' | 'single' })}
                                >
                                  <SelectTrigger className="mt-1">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="dual">Second Axis</SelectItem>
                                    <SelectItem value="single">First Axis</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="text-xs">Second Y-Axis</Label>
                                <div className="flex gap-1 mt-1">
                                  <Select 
                                    value={chart.secondYAxis} 
                                    onValueChange={(value) => updateChart(index, { secondYAxis: value })}
                                  >
                                    <SelectTrigger className="flex-1">
                                      <SelectValue placeholder="Select second Y-axis column">
                                        {chart.secondYAxis ? chart.secondYAxis.substring(0, 4) : 'Select second Y-axis column'}
                                      </SelectValue>
                                    </SelectTrigger>
                                    <SelectContent>
                                      {getNumericColumns().map((column) => (
                                        <SelectItem key={column} value={column}>{column}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-9 px-2 hover:bg-red-100 hover:text-red-600"
                                    onClick={() => updateChart(index, { secondYAxis: undefined })}
                                    title="Remove second Y-axis"
                                  >
                                    <X className="w-4 h-4" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        <div>
                          <Label className="text-xs">Aggregation</Label>
                          <Select 
                            value={chart.aggregation || 'sum'} 
                            onValueChange={(value: 'sum' | 'mean' | 'count' | 'min' | 'max') => updateChart(index, { aggregation: value })}
                          >
                          <SelectTrigger className="mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sum">Sum</SelectItem>
                            <SelectItem value="mean">Average</SelectItem>
                            <SelectItem value="count">Count</SelectItem>
                            <SelectItem value="min">Minimum</SelectItem>
                            <SelectItem value="max">Maximum</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                        <div>
                          <Label className="text-xs">Segregate Field Values</Label>
                          <Select 
                            value={chart.legendField || 'aggregate'} 
                            onValueChange={(value) => updateChart(index, { legendField: value })}
                          >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Show Aggregate" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="aggregate">Show Aggregate</SelectItem>
                            {getLegendColumns().map((column) => (
                              <SelectItem key={column} value={column}>{column}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                        <div>
                          <Label className="text-xs">Filters</Label>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {/* 🔧 CRITICAL FIX: Ensure filters is always an object before iterating */}
                            {Object.entries(chart.filters || {}).map(([column, values]) => (
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
                                    // 🔧 CRITICAL FIX: Allow filters if xAxis is set AND (yAxis OR secondYAxis) is set
                                    // For dual Y-axis charts, secondYAxis might be set instead of yAxis
                                    !chart.xAxis || 
                                    chart.xAxis === 'None' || 
                                    (!chart.yAxis && !chart.secondYAxis) || 
                                    (chart.yAxis === 'None' && !chart.secondYAxis) ||
                                    getAvailableFilterColumns().length === 0
                                  }
                                  style={{
                                    opacity: (
                                      !chart.xAxis || 
                                      chart.xAxis === 'None' || 
                                      (!chart.yAxis && !chart.secondYAxis) || 
                                      (chart.yAxis === 'None' && !chart.secondYAxis) ||
                                      getAvailableFilterColumns().length === 0
                                    ) ? 0.5 : 1
                                  }}
                                >
                                  <Filter className="w-3 h-3 mr-1" />
                                  Add Filter
                                </Button>
                              </PopoverTrigger>
                               <PopoverContent className="w-64" align="start">
                                 <div className="space-y-3">
                                   <Label className="text-xs font-medium">Select Column to Filter</Label>
                                   {getAvailableFilterColumns().length === 0 ? (
                                     <p className="text-xs text-muted-foreground">No columns available for filtering</p>
                                   ) : (
                                     <div style={{ maxHeight: '224px', overflowY: 'auto' }}>
                                       {getAvailableFilterColumns().map((column) => (
                                         <div key={column}>
                                           <Button
                                             variant="ghost"
                                             size="sm"
                                             className="w-full justify-start"
                                             onClick={() => {
                                               // 🔧 CRITICAL FIX: Ensure filters exists before checking
                                               if (!chart.filters || !chart.filters[column]) {
                                                 // Initialize with ALL unique values selected by default
                                                 const allValues = getUniqueValues(column);
                                                 updateFilter(index, column, allValues);
                                               }
                                             }}
                                             disabled={!!(chart.filters && chart.filters[column])}
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

                        {/* Show Note Box Toggle */}
                        <div className="flex items-center justify-between pt-2">
                          <Label className="text-xs">Show Note Box</Label>
                          <Switch
                            checked={chart.showNote || false}
                            onCheckedChange={(checked) => updateChart(index, { showNote: checked })}
                          />
                        </div>
                      </>
                    )}
                  </CardContent>
                  )}
                    </Card>
                  </ContextMenuTrigger>
                  <ContextMenuContent>
                    <ContextMenuItem onClick={() => handleDuplicateChart(index)}>
                      <Copy className="w-4 h-4 mr-2" />
                      Create Duplicate
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </div>
        </ScrollArea>
      </div>

      <div className="sticky bottom-0 pt-4 border-t bg-white z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <Button 
          onClick={onRenderCharts} 
          className="w-full"
          disabled={!settings.uploadedData || settings.charts.some(chart => !validateChart(migrateLegacyChart(chart)))}
        >
          <BarChart3 className="w-4 h-4 mr-2" />
          Render Charts
        </Button>
      </div>
      
      {/* Chart Deletion Confirmation Dialog */}
      <AlertDialog open={chartToDelete !== null} onOpenChange={(open) => !open && setChartToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Chart?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {chartToDelete !== null ? `Chart ${chartToDelete + 1}` : 'this chart'}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setChartToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-red-600 hover:bg-red-700">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ChartMakerVisualization;