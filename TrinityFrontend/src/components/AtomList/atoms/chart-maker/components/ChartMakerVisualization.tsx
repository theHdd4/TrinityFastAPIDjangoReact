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
import { Plus, Minus, BarChart3, Filter, X } from 'lucide-react';
import { ChartConfig } from '../ChartMakerAtom';
import { ChartMakerSettings, ChartMakerConfig } from '@/components/LaboratoryMode/store/laboratoryStore';

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
    newCharts[index] = { ...newCharts[index], ...updates };
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
            {settings.charts.slice(0, settings.numberOfCharts).map((chart, index) => (
              <Card key={chart.id}>
                <CardHeader>
                  <CardTitle className="text-sm">Chart {index + 1}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-xs">Chart Title</Label>
                    <Input
                      value={chart.title}
                      onChange={(e) => updateChart(index, { title: e.target.value })}
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
                    <div className="mt-1 space-y-2">
                      {Object.entries(chart.filters).map(([column, values]) => (
                        <div key={column} className="flex items-center gap-2">
                          <Badge variant="secondary" className="flex items-center gap-1">
                            {column}: {values.length} selected
                            <X 
                              className="w-3 h-3 cursor-pointer" 
                              onClick={() => removeFilter(index, column)}
                            />
                          </Badge>
                        </div>
                      ))}
                      
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="w-full">
                            <Filter className="w-3 h-3 mr-1" />
                            Add Filter
                          </Button>
                        </PopoverTrigger>
                         <PopoverContent className="w-64" align="start">
                           <div className="space-y-3">
                             <Label className="text-xs font-medium">Select Categorical Column to Filter</Label>
                             {getCategoricalColumns().length === 0 ? (
                               <p className="text-xs text-muted-foreground">No categorical columns available for filtering</p>
                             ) : (
                               <div style={{ maxHeight: '224px', overflowY: 'auto' }}>
                                 {getCategoricalColumns().map((column) => (
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
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="pt-4 border-t">
        <Button 
          onClick={onRenderCharts} 
          className="w-full"
          disabled={!settings.uploadedData || settings.charts.some(chart => !chart.xAxis || !chart.yAxis)}
        >
          <BarChart3 className="w-4 h-4 mr-2" />
          Render Charts
        </Button>
      </div>
    </div>
  );
};

export default ChartMakerVisualization;