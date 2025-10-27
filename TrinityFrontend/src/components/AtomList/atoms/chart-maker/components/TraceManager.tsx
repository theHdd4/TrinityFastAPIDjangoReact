import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Plus, Minus, X, Palette, Settings, Filter } from 'lucide-react';
import { ChartMakerConfig, ChartTraceConfig } from '@/components/LaboratoryMode/store/laboratoryStore';
import { 
  addTrace, 
  removeTrace, 
  updateTrace, 
  DEFAULT_TRACE_COLORS 
} from '../utils/traceUtils';

interface TraceManagerProps {
  chart: ChartMakerConfig;
  onUpdateChart: (updates: Partial<ChartMakerConfig>) => void;
  availableColumns: { numeric: string[]; categorical: string[] };
  getUniqueValues: (column: string) => string[];
}

const TraceManager: React.FC<TraceManagerProps> = ({
  chart,
  onUpdateChart,
  availableColumns,
  getUniqueValues,
}) => {
  const traces = chart.traces || [];
  const maxTraces = 5; // Limit for performance

  // Debounce timers for trace name inputs (1.5 seconds)
  const debounceTimers = useRef<Record<string, NodeJS.Timeout>>({});
  
  // Local state for trace name inputs to prevent overwriting during typing
  const [localTraceNames, setLocalTraceNames] = useState<Record<number, string>>({});

  // Initialize local trace names when traces change
  useEffect(() => {
    const newLocalNames: Record<number, string> = {};
    traces.forEach((trace, index) => {
      // Only update if we don't already have a local value for this trace
      if (localTraceNames[index] === undefined) {
        newLocalNames[index] = trace.name || '';
      }
    });
    if (Object.keys(newLocalNames).length > 0) {
      setLocalTraceNames(prev => ({ ...prev, ...newLocalNames }));
    }
  }, [traces.length]); // Only depend on trace count, not individual trace changes

  // Cleanup debounce timers on unmount
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(timer => {
        if (timer) clearTimeout(timer);
      });
    };
  }, []);

  // Debounce utility for trace updates (1.5 seconds)
  const debounceTraceUpdate = (traceIndex: number, fn: () => void, delay: number = 1500) => {
    const key = `trace-${traceIndex}`;
    if (debounceTimers.current[key]) {
      clearTimeout(debounceTimers.current[key]);
    }
    debounceTimers.current[key] = setTimeout(fn, delay);
  };

  const handleAddTrace = () => {
    if (traces.length >= maxTraces) return;
    
    // Get existing filter columns from any existing trace
    const existingFilterColumns = traces.length > 0 
      ? Object.keys(traces[0].filters || {})
      : [];
    
    // Create initial filters object with existing columns but empty values
    const inheritedFilters: Record<string, string[]> = {};
    existingFilterColumns.forEach(column => {
      inheritedFilters[column] = [];
    });
    
    const updatedChart = addTrace(chart);
    // Update the new trace with inherited filter columns
    if (updatedChart.traces && updatedChart.traces.length > 0) {
      const newTraceIndex = updatedChart.traces.length - 1;
      updatedChart.traces[newTraceIndex] = {
        ...updatedChart.traces[newTraceIndex],
        filters: inheritedFilters
      };
    }
    
    onUpdateChart({ traces: updatedChart.traces });
  };

  const handleRemoveTrace = (index: number) => {
    const updatedChart = removeTrace(chart, index);
    onUpdateChart({ traces: updatedChart.traces });
    // Clean up local state for removed trace
    setLocalTraceNames(prev => {
      const newState = { ...prev };
      delete newState[index];
      return newState;
    });
  };

  const handleUpdateTrace = (index: number, updates: Partial<ChartTraceConfig>) => {
    const updatedChart = updateTrace(chart, index, updates);
    onUpdateChart({ traces: updatedChart.traces });
  };

  // Handle trace name changes with local state and debouncing
  const handleTraceNameChange = (index: number, newName: string) => {
    // Update local state immediately for UI responsiveness
    setLocalTraceNames(prev => ({ ...prev, [index]: newName }));
    
    // Debounce the actual trace update
    debounceTraceUpdate(index, () => {
      handleUpdateTrace(index, { name: newName });
    });
  };

  // Global filter management - add a filter column to ALL traces
  const handleAddGlobalFilter = (column: string) => {
    if (traces.length === 0) return;
    
    // Initialize with ALL unique values selected by default
    const allValues = getUniqueValues(column);
    
    // Update all traces to include this filter column with all values selected
    const updatedTraces = traces.map(trace => ({
      ...trace,
      filters: {
        ...trace.filters,
        [column]: allValues
      }
    }));
    
    onUpdateChart({ traces: updatedTraces });
  };

  // Global filter management - remove a filter column from ALL traces
  const handleRemoveGlobalFilter = (column: string) => {
    if (traces.length === 0) return;
    
    // Remove this filter column from all traces
    const updatedTraces = traces.map(trace => {
      const { [column]: removed, ...remainingFilters } = trace.filters || {};
      return {
        ...trace,
        filters: remainingFilters
      };
    });
    
    onUpdateChart({ traces: updatedTraces });
  };

  // Get available filter columns (columns that aren't already used as filters)
  const getAvailableFilterColumns = () => {
    // Get existing filter columns from any trace (they should all have the same columns)
    const existingFilterColumns = traces.length > 0 
      ? Object.keys(traces[0].filters || {})
      : [];
    
    // Combine all columns (numeric and categorical) and exclude only those already used as filters
    const allColumns = [...availableColumns.numeric, ...availableColumns.categorical];
    
    return allColumns.filter(col => 
      !existingFilterColumns.includes(col)
    );
  };

  // Get all current filter columns (should be same across all traces)
  const getCurrentFilterColumns = () => {
    return traces.length > 0 ? Object.keys(traces[0].filters || {}) : [];
  };

  return (
    <div className="space-y-4 w-full">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4" />
          <span className="font-medium">Data Series ({traces.length}/{maxTraces})</span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleAddTrace}
          disabled={traces.length >= maxTraces}
          className="h-8"
        >
          <Plus className="w-3 h-3 mr-1" />
          Add Series
        </Button>
      </div>

      {/* Global Filter Management - only show if we have traces */}
      {traces.length > 0 && (
        <Card className="w-full">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Filter className="w-4 h-4" />
              Global Filters
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Display current filter columns */}
            {getCurrentFilterColumns().length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs">Active Filter Columns</Label>
                <div className="flex flex-wrap gap-1">
                  {getCurrentFilterColumns().map(column => (
                    <Badge key={column} variant="secondary" className="flex items-center gap-1 text-xs">
                      {column}
                      <X 
                        className="w-3 h-3 cursor-pointer hover:text-red-500" 
                        onClick={() => handleRemoveGlobalFilter(column)}
                      />
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            {/* Add Global Filter button */}
            <Popover>
              <PopoverTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full h-8"
                  disabled={
                    // Disable if no x-axis selected for any trace or no available columns
                    !chart.xAxis || 
                    traces.every(trace => !trace.yAxis) ||
                    getAvailableFilterColumns().length === 0
                  }
                >
                  <Filter className="w-3 h-3 mr-1" />
                  Add Filter
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" align="start">
                <div className="space-y-3">
                  <Label className="text-xs font-medium">Select Column to Filter</Label>
                  {(() => {
                    const availableFilterColumns = getAvailableFilterColumns();
                    
                    return availableFilterColumns.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No more columns available for filtering</p>
                    ) : (
                      <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        {availableFilterColumns.map((column) => (
                          <div key={column}>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full justify-start hover:bg-accent"
                              onClick={() => {
                                handleAddGlobalFilter(column);
                              }}
                            >
                              {column}
                            </Button>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </PopoverContent>
            </Popover>
          </CardContent>
        </Card>
      )}

      {/* Traces List */}
      <div className="space-y-3 w-full">
        {traces.map((trace, index) => (
          <Card key={index} className="relative w-full">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: trace.color || DEFAULT_TRACE_COLORS[index % DEFAULT_TRACE_COLORS.length] }}
                  />
                  <CardTitle className="text-sm">Series {index + 1}</CardTitle>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRemoveTrace(index)}
                  disabled={traces.length === 1}
                  className="h-6 w-6 p-0"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            </CardHeader>
            
            <CardContent className="space-y-3">
              {/* Y-Axis Selection */}
              <div className="space-y-1">
                <Label className="text-xs">Y-Axis Column</Label>
                <Select
                  value={trace.yAxis}
                  onValueChange={(value) => {
                    // Update both yAxis and name to the new column value
                    handleUpdateTrace(index, { yAxis: value, name: value });
                    // Also update local state to reflect the change immediately
                    setLocalTraceNames(prev => ({ ...prev, [index]: value || '' }));
                  }}
                >
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Select column" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableColumns.numeric.map(column => (
                      <SelectItem key={column} value={column}>{column}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Custom Name */}
              <div className="space-y-1">
                <Label className="text-xs">Series Name (optional)</Label>
                <Input
                  value={localTraceNames[index] ?? trace.name ?? ''}
                  onChange={(e) => handleTraceNameChange(index, e.target.value)}
                  placeholder={trace.yAxis || `Series ${index + 1}`}
                  className="h-8"
                />
              </div>

              {/* Color Picker */}
              <div className="space-y-1">
                <Label className="text-xs">Color</Label>
                <div className="flex gap-1">
                  {DEFAULT_TRACE_COLORS.map((color) => (
                    <Button
                      key={color}
                      size="sm"
                      variant="outline"
                      className={`w-6 h-6 p-0 rounded-full border-2 ${
                        trace.color === color ? 'border-gray-400' : 'border-gray-200'
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => handleUpdateTrace(index, { color })}
                    />
                  ))}
                </div>
              </div>

              {/* Aggregation */}
              <div className="space-y-1">
                <Label className="text-xs">Aggregation</Label>
                <Select
                  value={trace.aggregation || 'sum'}
                  onValueChange={(value: 'sum' | 'mean' | 'count' | 'min' | 'max') => 
                    handleUpdateTrace(index, { aggregation: value })
                  }
                >
                  <SelectTrigger className="h-8">
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
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {traces.length === 0 && (
        <Card className="border-dashed w-full">
          <CardContent className="flex flex-col items-center justify-center py-6">
            <div className="text-center space-y-2">
              <Palette className="w-8 h-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No data series configured</p>
              <Button size="sm" onClick={handleAddTrace}>
                <Plus className="w-3 h-3 mr-1" />
                Add First Series
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TraceManager;
