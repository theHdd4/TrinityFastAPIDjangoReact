import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, LineChart, Line, ScatterChart, Scatter, PieChart, Pie, Cell } from 'recharts';
import { Download, Maximize2 } from 'lucide-react';
import { EvaluateModelsFeatureData } from '../EvaluateModelsFeatureAtom';

interface EvaluateModelsFeatureVisualisationProps {
  data: EvaluateModelsFeatureData;
}

const chartData = {
  bar: [
    { name: 'Jan', value: 400, accuracy: 0.85 },
    { name: 'Feb', value: 300, accuracy: 0.89 },
    { name: 'Mar', value: 500, accuracy: 0.92 },
    { name: 'Apr', value: 350, accuracy: 0.87 },
    { name: 'May', value: 450, accuracy: 0.94 }
  ],
  line: [
    { name: 'Epoch 1', loss: 0.8, validation: 0.75 },
    { name: 'Epoch 2', loss: 0.6, validation: 0.65 },
    { name: 'Epoch 3', loss: 0.4, validation: 0.45 },
    { name: 'Epoch 4', loss: 0.3, validation: 0.35 },
    { name: 'Epoch 5', loss: 0.2, validation: 0.25 }
  ],
  scatter: [
    { x: 10, y: 20, z: 5 },
    { x: 15, y: 25, z: 8 },
    { x: 20, y: 30, z: 12 },
    { x: 25, y: 35, z: 15 },
    { x: 30, y: 40, z: 18 }
  ],
  pie: [
    { name: 'Feature A', value: 35, color: '#8884d8' },
    { name: 'Feature B', value: 25, color: '#82ca9d' },
    { name: 'Feature C', value: 20, color: '#ffc658' },
    { name: 'Feature D', value: 20, color: '#ff7c7c' }
  ]
};

const EvaluateModelsFeatureVisualisation: React.FC<EvaluateModelsFeatureVisualisationProps> = ({
  data
}) => {
  const [selectedChart, setSelectedChart] = useState('bar');
  const [selectedMetric, setSelectedMetric] = useState('accuracy');

  const downloadChart = () => {
    // Simulate chart download
    console.log('Downloading chart data...');
  };

  const renderChart = () => {
    switch (selectedChart) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData.bar}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" />
              <YAxis />
              <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        );
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData.line}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="name" />
              <YAxis />
              <Line type="monotone" dataKey="loss" stroke="hsl(var(--primary))" strokeWidth={2} />
              <Line type="monotone" dataKey="validation" stroke="hsl(var(--destructive))" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        );
      case 'scatter':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart data={chartData.scatter}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="x" />
              <YAxis dataKey="y" />
              <Scatter dataKey="z" fill="hsl(var(--primary))" />
            </ScatterChart>
          </ResponsiveContainer>
        );
      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={chartData.pie}
                cx="50%"
                cy="50%"
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
              >
                {chartData.pie.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      {/* Chart Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Visualization Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium">Chart Type</label>
              <Select value={selectedChart} onValueChange={setSelectedChart}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="bar">Bar Chart</SelectItem>
                  <SelectItem value="line">Line Chart</SelectItem>
                  <SelectItem value="scatter">Scatter Plot</SelectItem>
                  <SelectItem value="pie">Pie Chart</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium">Metric</label>
              <Select value={selectedMetric} onValueChange={setSelectedMetric}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="accuracy">Accuracy</SelectItem>
                  <SelectItem value="precision">Precision</SelectItem>
                  <SelectItem value="recall">Recall</SelectItem>
                  <SelectItem value="f1">F1 Score</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Active Scope:</span>
            <Badge variant="secondary">{data.scope}</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Main Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">
              Model Performance - {selectedChart.charAt(0).toUpperCase() + selectedChart.slice(1)} Chart
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={downloadChart}>
                <Download className="h-4 w-4 mr-1" />
                Export
              </Button>
              <Button variant="outline" size="sm">
                <Maximize2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {renderChart()}
        </CardContent>
      </Card>

      {/* Model Comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Model Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Model</th>
                  <th className="text-left p-2">Accuracy</th>
                  <th className="text-left p-2">Precision</th>
                  <th className="text-left p-2">Recall</th>
                  <th className="text-left p-2">F1 Score</th>
                  <th className="text-left p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.identifiers.filter(i => i.selected).map((identifier, index) => (
                  <tr key={identifier.id} className="border-b">
                    <td className="p-2 font-medium">{identifier.name}</td>
                    <td className="p-2">{(0.85 + index * 0.02).toFixed(3)}</td>
                    <td className="p-2">{(0.82 + index * 0.015).toFixed(3)}</td>
                    <td className="p-2">{(0.88 + index * 0.01).toFixed(3)}</td>
                    <td className="p-2">{(0.85 + index * 0.012).toFixed(3)}</td>
                    <td className="p-2">
                      <Badge variant="secondary" className="bg-green-100 text-green-800">
                        Evaluated
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Feature Importance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Feature Importance Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {data.availableColumns.slice(0, 5).map((column, index) => (
              <div key={column} className="flex items-center gap-3">
                <span className="text-xs font-medium w-20 truncate">{column}</span>
                <div className="flex-1 bg-muted rounded h-2">
                  <div 
                    className="bg-primary rounded h-2" 
                    style={{ width: `${(100 - index * 15)}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground w-12">
                  {(100 - index * 15)}%
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EvaluateModelsFeatureVisualisation;