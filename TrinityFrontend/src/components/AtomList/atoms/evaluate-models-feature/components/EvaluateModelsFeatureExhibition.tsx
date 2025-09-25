import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { EvaluateModelsFeatureData } from '../EvaluateModelsFeatureAtom';

interface EvaluateModelsFeatureExhibitionProps {
  data: EvaluateModelsFeatureData;
}

// Sample data for exhibition mode
const sampleWaterfallData = [
  { name: 'Base', value: 100 },
  { name: 'Factor 1', value: 20 },
  { name: 'Factor 2', value: -15 },
  { name: 'Factor 3', value: 25 },
  { name: 'Total', value: 130 }
];

const sampleContributionData = [
  { name: 'Segment A', value: 40, color: '#8884d8' },
  { name: 'Segment B', value: 30, color: '#82ca9d' },
  { name: 'Segment C', value: 30, color: '#ffc658' }
];

const EvaluateModelsFeatureExhibition: React.FC<EvaluateModelsFeatureExhibitionProps> = ({
  data
}) => {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold">Model Evaluation Results</h2>
        <Badge variant="secondary" className="bg-primary/10 text-primary">
          {data.scope}
        </Badge>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Model Accuracy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">94.2%</div>
            <p className="text-xs text-muted-foreground">Feature-based evaluation</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">R² Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">0.891</div>
            <p className="text-xs text-muted-foreground">Coefficient of determination</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">RMSE</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">12.4</div>
            <p className="text-xs text-muted-foreground">Root Mean Square Error</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Waterfall Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Feature Impact Analysis</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={sampleWaterfallData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="name" fontSize={11} />
                <YAxis fontSize={11} />
                <Bar 
                  dataKey="value" 
                  fill="hsl(var(--primary))" 
                  radius={[2, 2, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Contribution Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Feature Contribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={sampleContributionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {sampleContributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-2">
              {sampleContributionData.map((item, index) => (
                <div key={index} className="flex items-center gap-2 text-xs">
                  <div 
                    className="w-3 h-3 rounded" 
                    style={{ backgroundColor: item.color }}
                  />
                  <span>{item.name}: {item.value}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Evaluation Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Features Evaluated:</span>
              <span className="font-medium">{data.identifiers.filter(i => i.selected).length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Selected Visualizations:</span>
              <span className="font-medium">{data.graphs.filter(g => g.selected).length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Data Source:</span>
              <span className="font-medium">{data.selectedDataframe || 'No dataset selected'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Evaluation Scope:</span>
              <span className="font-medium">{data.scope}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default EvaluateModelsFeatureExhibition;