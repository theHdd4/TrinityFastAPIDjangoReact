import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  LineChart, 
  Line,
  ScatterChart,
  Scatter,
  ReferenceLine
} from 'recharts';

interface SelectModelsFeatureVisualisationProps {
  data: any;
}

const SelectModelsFeatureVisualisation: React.FC<SelectModelsFeatureVisualisationProps> = ({ data }) => {
  const modelPerformanceData = [
    { model: 'Linear Regression', accuracy: 85, mape: 12, rsquared: 78, training_time: 2.3 },
    { model: 'Random Forest', accuracy: 91, mape: 8, rsquared: 88, training_time: 15.7 },
    { model: 'XGBoost', accuracy: 93, mape: 6, rsquared: 91, training_time: 8.2 },
    { model: 'Neural Network', accuracy: 89, mape: 9, rsquared: 85, training_time: 45.1 },
    { model: 'Support Vector', accuracy: 87, mape: 10, rsquared: 82, training_time: 12.4 }
  ];

  const residualData = [
    { predicted: 10, actual: 12, residual: 2 },
    { predicted: 15, actual: 14, residual: -1 },
    { predicted: 20, actual: 18, residual: -2 },
    { predicted: 25, actual: 26, residual: 1 },
    { predicted: 30, actual: 28, residual: -2 },
    { predicted: 35, actual: 37, residual: 2 },
    { predicted: 40, actual: 39, residual: -1 },
    { predicted: 45, actual: 44, residual: -1 }
  ];

  const validationCurve = [
    { iteration: 1, training: 0.65, validation: 0.63 },
    { iteration: 2, training: 0.72, validation: 0.69 },
    { iteration: 3, training: 0.78, validation: 0.74 },
    { iteration: 4, training: 0.83, validation: 0.79 },
    { iteration: 5, training: 0.87, validation: 0.82 },
    { iteration: 6, training: 0.90, validation: 0.84 },
    { iteration: 7, training: 0.92, validation: 0.85 },
    { iteration: 8, training: 0.94, validation: 0.85 },
    { iteration: 9, training: 0.95, validation: 0.84 },
    { iteration: 10, training: 0.96, validation: 0.83 }
  ];

  return (
    <div className="w-full h-full p-6 space-y-6 bg-background overflow-y-auto">
      <div className="border-b border-border pb-4">
        <h3 className="text-xl font-semibold text-foreground">Model Selection Visualisation</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Detailed visual analysis of model performance and validation
        </p>
      </div>

      {/* Performance Metrics Comparison */}
      <Card className="p-6">
        <h4 className="text-lg font-medium text-foreground mb-4">Model Performance Metrics</h4>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={modelPerformanceData} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="model" 
              stroke="hsl(var(--muted-foreground))" 
              fontSize={11}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis stroke="hsl(var(--muted-foreground))" />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--card))', 
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px'
              }} 
            />
            <Bar dataKey="accuracy" fill="hsl(var(--primary))" name="Accuracy %" />
            <Bar dataKey="rsquared" fill="hsl(var(--secondary))" name="R-Squared %" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Prediction vs Actual Scatter Plot */}
      <Card className="p-6">
        <h4 className="text-lg font-medium text-foreground mb-4">Predicted vs Actual Values</h4>
        <ResponsiveContainer width="100%" height={350}>
          <ScatterChart data={residualData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              type="number" 
              dataKey="predicted" 
              name="Predicted" 
              stroke="hsl(var(--muted-foreground))" 
            />
            <YAxis 
              type="number" 
              dataKey="actual" 
              name="Actual" 
              stroke="hsl(var(--muted-foreground))" 
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--card))', 
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px'
              }} 
            />
            <Scatter dataKey="actual" fill="hsl(var(--primary))" />
            <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3" />
          </ScatterChart>
        </ResponsiveContainer>
      </Card>

      {/* Training vs Validation Curve */}
      <Card className="p-6">
        <h4 className="text-lg font-medium text-foreground mb-4">Training vs Validation Curve</h4>
        <ResponsiveContainer width="100%" height={350}>
          <LineChart data={validationCurve} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="iteration" 
              stroke="hsl(var(--muted-foreground))" 
              name="Iteration"
            />
            <YAxis stroke="hsl(var(--muted-foreground))" />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'hsl(var(--card))', 
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px'
              }} 
            />
            <Line 
              type="monotone" 
              dataKey="training" 
              stroke="hsl(var(--primary))" 
              strokeWidth={2}
              name="Training Score"
            />
            <Line 
              type="monotone" 
              dataKey="validation" 
              stroke="hsl(var(--secondary))" 
              strokeWidth={2}
              name="Validation Score"
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* Model Selection Summary */}
      <Card className="p-6">
        <h4 className="text-lg font-medium text-foreground mb-4">Selection Criteria Summary</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <span className="text-sm font-medium text-foreground">MAPE Threshold:</span>
              <Badge variant="default">{(data.modelFilters?.mape * 100 || 75).toFixed(0)}%</Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <span className="text-sm font-medium text-foreground">R-Squared Minimum:</span>
              <Badge variant="default">{(data.modelFilters?.rSquared * 100 || 82).toFixed(0)}%</Badge>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <span className="text-sm font-medium text-foreground">P-Value Threshold:</span>
              <Badge variant="default">{(data.modelFilters?.pValue * 100 || 45).toFixed(0)}%</Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <span className="text-sm font-medium text-foreground">AIC Threshold:</span>
              <Badge variant="default">{(data.modelFilters?.aic * 100 || 63).toFixed(0)}%</Badge>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default SelectModelsFeatureVisualisation;