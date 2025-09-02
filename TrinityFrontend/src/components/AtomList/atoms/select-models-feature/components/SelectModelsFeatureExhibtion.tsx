import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface SelectModelsFeatureExhibitionProps {
  data: any;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--muted))'];

const SelectModelsFeatureExhibition: React.FC<SelectModelsFeatureExhibitionProps> = ({ data }) => {
  const modelComparisonData = [
    { name: 'Linear Regression', accuracy: 0.85, mape: 0.12, rsquared: 0.78 },
    { name: 'Random Forest', accuracy: 0.91, mape: 0.08, rsquared: 0.88 },
    { name: 'XGBoost', accuracy: 0.93, mape: 0.06, rsquared: 0.91 },
    { name: 'Neural Network', accuracy: 0.89, mape: 0.09, rsquared: 0.85 }
  ];

  const featureImportanceData = [
    { name: 'Price', importance: 0.35 },
    { name: 'Seasonality', importance: 0.25 },
    { name: 'Promotion', importance: 0.20 },
    { name: 'Competition', importance: 0.15 },
    { name: 'Economic Index', importance: 0.05 }
  ];

  return (
    <div className="w-full h-full p-6 space-y-6 bg-background overflow-y-auto">
      <div className="border-b border-border pb-4">
        <h3 className="text-xl font-semibold text-foreground">Model Selection Exhibition</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Comprehensive view of model performance and selection results
        </p>
      </div>

      {/* Current Configuration */}
      <Card className="p-6">
        <h4 className="text-lg font-medium text-foreground mb-4">Current Configuration</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-sm text-muted-foreground">Selected Scope:</span>
            <div className="mt-1">
              <Badge variant="default">{data.selectedScope || 'Not Selected'}</Badge>
            </div>
          </div>
          <div>
            <span className="text-sm text-muted-foreground">Ensemble Method:</span>
            <div className="mt-1">
              <Badge variant={data.ensembleMethod ? "default" : "secondary"}>
                {data.ensembleMethod ? "Enabled" : "Disabled"}
              </Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* Model Comparison Chart */}
      <Card className="p-6">
        <h4 className="text-lg font-medium text-foreground mb-4">Model Performance Comparison</h4>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={modelComparisonData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis 
              dataKey="name" 
              stroke="hsl(var(--muted-foreground))" 
              fontSize={12}
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
            <Bar dataKey="accuracy" fill="hsl(var(--primary))" name="Accuracy" />
            <Bar dataKey="rsquared" fill="hsl(var(--secondary))" name="R-Squared" />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Feature Importance */}
      <Card className="p-6">
        <h4 className="text-lg font-medium text-foreground mb-4">Feature Importance</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={featureImportanceData}
                  dataKey="importance"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {featureImportanceData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-3">
            {featureImportanceData.map((feature, index) => (
              <div key={feature.name} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <span className="text-sm font-medium text-foreground">{feature.name}</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 bg-background rounded-full h-2">
                    <div 
                      className="h-2 rounded-full" 
                      style={{ 
                        width: `${feature.importance * 100}%`,
                        backgroundColor: COLORS[index % COLORS.length]
                      }}
                    />
                  </div>
                  <span className="text-sm text-muted-foreground w-12 text-right">
                    {(feature.importance * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Model Selection Summary */}
      <Card className="p-6">
        <h4 className="text-lg font-medium text-foreground mb-4">Selection Summary</h4>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-sm font-medium text-foreground">Best Performing Model:</span>
            <Badge variant="default">XGBoost</Badge>
          </div>
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-sm font-medium text-foreground">Overall Accuracy:</span>
            <span className="text-sm text-muted-foreground">93%</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-sm font-medium text-foreground">MAPE Score:</span>
            <span className="text-sm text-muted-foreground">0.06</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
            <span className="text-sm font-medium text-foreground">R-Squared Value:</span>
            <span className="text-sm text-muted-foreground">0.91</span>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default SelectModelsFeatureExhibition;