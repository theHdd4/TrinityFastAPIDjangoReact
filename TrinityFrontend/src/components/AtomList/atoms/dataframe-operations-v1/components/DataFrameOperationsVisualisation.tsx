import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { BarChart3, PieChart, LineChart, ScatterChart, TrendingUp, Download } from 'lucide-react';
import { BarChart, Bar, LineChart as RechartsLineChart, Line, PieChart as RechartsPieChart, Cell, Pie, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ScatterChart as RechartsScatterChart, Scatter } from 'recharts';
import { DataFrameData } from '../DataFrameOperationsAtom';

interface DataFrameOperationsVisualisationProps {
  data: DataFrameData | null;
}

interface ChartConfig {
  type: 'bar' | 'pie' | 'line' | 'scatter';
  xAxis: string;
  yAxis: string;
}

function safeToString(val: any): string {
  if (val === undefined || val === null) return '';
  try {
    return val.toString();
  } catch {
    return '';
  }
}

const DataFrameOperationsVisualisation: React.FC<DataFrameOperationsVisualisationProps> = ({ data }) => {
  const [selectedChart, setSelectedChart] = useState<ChartConfig | null>(null);
  const [showAxisSelector, setShowAxisSelector] = useState(false);
  const [chartData, setChartData] = useState<any[]>([]);

  if (!data) {
    return (
      <Card className="p-4 border border-border">
        <div className="text-center py-8">
          <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <h4 className="font-medium text-foreground mb-2">No Data Available</h4>
          <p className="text-sm text-muted-foreground">Upload data to create visualizations</p>
        </div>
      </Card>
    );
  }

  const numericColumns = data.headers.filter(header => data.columnTypes[header] === 'number');
  const textColumns = data.headers.filter(header => data.columnTypes[header] === 'text');
  const allColumns = data.headers;

  const handleChartSelect = (type: ChartConfig['type']) => {
    setSelectedChart({ type, xAxis: '', yAxis: '' });
    setShowAxisSelector(true);
  };

  const generateChart = () => {
    if (!selectedChart?.xAxis || !selectedChart?.yAxis || !data) return;
    
    // Process data for chart
    const processedData = data.rows.map(row => ({
      [selectedChart.xAxis]: row[selectedChart.xAxis],
      [selectedChart.yAxis]: row[selectedChart.yAxis],
      name: safeToString(row[selectedChart.xAxis])
    })).filter(item => 
      item[selectedChart.xAxis] !== null && 
      item[selectedChart.xAxis] !== undefined &&
      item[selectedChart.yAxis] !== null && 
      item[selectedChart.yAxis] !== undefined
    );

    setChartData(processedData);
    setShowAxisSelector(false);
  };

  const downloadChart = () => {
    // Simple implementation - you could enhance this with actual chart image export
    const csvContent = "data:text/csv;charset=utf-8," + 
      `${selectedChart?.xAxis},${selectedChart?.yAxis}\n` +
      chartData.map(row => `${row[selectedChart?.xAxis || '']},${row[selectedChart?.yAxis || '']}`).join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "chart_data.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderChart = () => {
    if (!selectedChart || !chartData.length) return null;

    const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', '#8884d8', '#82ca9d', '#ffc658', '#ff7c7c', '#8dd1e1'];

    switch (selectedChart.type) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={selectedChart.xAxis} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey={selectedChart.yAxis} fill="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        );
      
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <RechartsLineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={selectedChart.xAxis} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey={selectedChart.yAxis} stroke="hsl(var(--primary))" strokeWidth={2} />
            </RechartsLineChart>
          </ResponsiveContainer>
        );
      
      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <RechartsPieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey={selectedChart.yAxis}
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </RechartsPieChart>
          </ResponsiveContainer>
        );
      
      case 'scatter':
        return (
          <ResponsiveContainer width="100%" height={400}>
            <RechartsScatterChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey={selectedChart.xAxis} />
              <YAxis dataKey={selectedChart.yAxis} />
              <Tooltip cursor={{ strokeDasharray: '3 3' }} />
              <Scatter dataKey={selectedChart.yAxis} fill="hsl(var(--primary))" />
            </RechartsScatterChart>
          </ResponsiveContainer>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* Chart Selection */}
      <Card className="border border-border shadow-sm">
        <div className="p-4">
          <h4 className="font-medium text-foreground mb-4 flex items-center">
            <TrendingUp className="w-4 h-4 text-primary mr-2" />
            Create Visualization
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <Button 
              variant="outline" 
              size="sm" 
              className="h-16 flex flex-col items-center justify-center hover:bg-primary/5 hover:border-primary"
              onClick={() => handleChartSelect('bar')}
            >
              <BarChart3 className="w-5 h-5 mb-1 text-primary" />
              <span className="text-xs">Bar Chart</span>
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-16 flex flex-col items-center justify-center hover:bg-primary/5 hover:border-primary"
              onClick={() => handleChartSelect('pie')}
            >
              <PieChart className="w-5 h-5 mb-1 text-primary" />
              <span className="text-xs">Pie Chart</span>
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-16 flex flex-col items-center justify-center hover:bg-primary/5 hover:border-primary"
              onClick={() => handleChartSelect('line')}
            >
              <LineChart className="w-5 h-5 mb-1 text-primary" />
              <span className="text-xs">Line Chart</span>
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-16 flex flex-col items-center justify-center hover:bg-primary/5 hover:border-primary"
              onClick={() => handleChartSelect('scatter')}
            >
              <ScatterChart className="w-5 h-5 mb-1 text-primary" />
              <span className="text-xs">Scatter Plot</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* Axis Selection */}
      {showAxisSelector && selectedChart && (
        <Card className="border border-border shadow-sm">
          <div className="p-4">
            <h4 className="font-medium text-foreground mb-4">Configure {selectedChart.type.charAt(0).toUpperCase() + selectedChart.type.slice(1)} Chart</h4>
            <div className="space-y-4">
              <div>
                <Label htmlFor="x-axis" className="text-sm font-medium">X-Axis Column</Label>
                <Select value={selectedChart.xAxis} onValueChange={(value) => setSelectedChart({...selectedChart, xAxis: value})}>
                  <SelectTrigger className="w-full mt-1">
                    <SelectValue placeholder="Select X-axis column" />
                  </SelectTrigger>
                  <SelectContent>
                    {allColumns.map(column => (
                      <SelectItem key={column} value={column}>
                        {column} ({data.columnTypes[column]})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="y-axis" className="text-sm font-medium">Y-Axis Column</Label>
                <Select value={selectedChart.yAxis} onValueChange={(value) => setSelectedChart({...selectedChart, yAxis: value})}>
                  <SelectTrigger className="w-full mt-1">
                    <SelectValue placeholder="Select Y-axis column" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedChart.type === 'pie' ? (
                      numericColumns.map(column => (
                        <SelectItem key={column} value={column}>
                          {column} (number)
                        </SelectItem>
                      ))
                    ) : (
                      numericColumns.map(column => (
                        <SelectItem key={column} value={column}>
                          {column} (number)
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex space-x-2 pt-2">
                <Button 
                  onClick={generateChart} 
                  disabled={!selectedChart.xAxis || !selectedChart.yAxis}
                  className="flex-1"
                >
                  Generate Chart
                </Button>
                <Button variant="outline" onClick={() => setShowAxisSelector(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Chart Display */}
      {selectedChart && chartData.length > 0 && !showAxisSelector && (
        <Card className="border border-border shadow-sm">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h4 className="font-medium text-foreground">
                {selectedChart.type.charAt(0).toUpperCase() + selectedChart.type.slice(1)} Chart
              </h4>
              <div className="flex space-x-2">
                <Button variant="outline" size="sm" onClick={() => setShowAxisSelector(true)}>
                  Edit Configuration
                </Button>
                <Button variant="outline" size="sm" onClick={downloadChart}>
                  <Download className="w-4 h-4 mr-2" />
                  Download Chart
                </Button>
              </div>
            </div>
            <div className="w-full">
              {renderChart()}
            </div>
            <div className="mt-4 text-sm text-muted-foreground">
              <p><strong>X-Axis:</strong> {selectedChart.xAxis}</p>
              <p><strong>Y-Axis:</strong> {selectedChart.yAxis}</p>
              <p><strong>Data Points:</strong> {chartData.length}</p>
            </div>
          </div>
        </Card>
      )}

      {/* Data Summary */}
      <Card className="border border-border shadow-sm">
        <div className="p-4">
          <h4 className="font-medium text-foreground mb-4">Data Summary</h4>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Rows:</span>
              <span className="font-medium text-foreground">{data.rows.length.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Columns:</span>
              <span className="font-medium text-foreground">{data.headers.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Numeric Columns:</span>
              <span className="font-medium text-foreground">{numericColumns.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Text Columns:</span>
              <span className="font-medium text-foreground">{textColumns.length}</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default DataFrameOperationsVisualisation;