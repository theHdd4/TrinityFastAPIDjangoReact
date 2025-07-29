import React from 'react';
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

  const handleAddTrace = () => {
    if (traces.length >= maxTraces) return;
    const updatedChart = addTrace(chart);
    onUpdateChart({ traces: updatedChart.traces });
  };

  const handleRemoveTrace = (index: number) => {
    const updatedChart = removeTrace(chart, index);
    onUpdateChart({ traces: updatedChart.traces });
  };

  const handleUpdateTrace = (index: number, updates: Partial<ChartTraceConfig>) => {
    const updatedChart = updateTrace(chart, index, updates);
    onUpdateChart({ traces: updatedChart.traces });
  };  return (
    <div className="space-y-4">
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

      {/* Traces List */}
      <div className="space-y-3">
        {traces.map((trace, index) => (
          <Card key={index} className="relative">
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
                  onValueChange={(value) => handleUpdateTrace(index, { yAxis: value, name: value || trace.name })}
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
                  value={trace.name || ''}
                  onChange={(e) => handleUpdateTrace(index, { name: e.target.value })}
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

              {/* Filters */}
              <div className="space-y-2">
                <Label className="text-xs">Filters for this series</Label>
                
                {/* Display existing filters as badges */}
                {Object.entries(trace.filters || {}).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(trace.filters || {}).map(([column, values]) => (
                      <Badge key={column} variant="secondary" className="flex items-center gap-1 text-xs">
                        {column}
                        <X 
                          className="w-3 h-3 cursor-pointer hover:text-red-500" 
                          onClick={() => {
                            const { [column]: removed, ...remainingFilters } = trace.filters || {};
                            handleUpdateTrace(index, { filters: remainingFilters });
                          }}
                        />
                      </Badge>
                    ))}
                  </div>
                )}
                
                {/* Add Filter button */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full h-8"
                      disabled={
                        // Disable if x-axis or y-axis not selected
                        !chart.xAxis || !trace.yAxis ||
                        // Or if no available columns for filtering (with more than 1 unique value)
                        availableColumns.categorical.filter(col => 
                          col !== chart.xAxis && 
                          col !== trace.yAxis && 
                          !trace.filters?.[col] &&
                          getUniqueValues(col).length > 1
                        ).length === 0
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
                        const availableFilterColumns = availableColumns.categorical.filter(col => 
                          col !== chart.xAxis && 
                          col !== trace.yAxis && 
                          !trace.filters?.[col] &&
                          getUniqueValues(col).length > 1
                        );
                        
                        return availableFilterColumns.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No more columns available for filtering</p>
                        ) : (
                          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                            {availableFilterColumns.map((column) => (
                              <div key={column}>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="w-full justify-start"
                                  onClick={() => {
                                    // Add this column as a filter for this trace with empty selection initially (like single mode)
                                    const newFilters = { 
                                      ...trace.filters, 
                                      [column]: [] 
                                    };
                                    handleUpdateTrace(index, { filters: newFilters });
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
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {traces.length === 0 && (
        <Card className="border-dashed">
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
