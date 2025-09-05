import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { BarChart3, LineChart, PieChart, ScatterChart, TrendingUp, Activity, Clock } from 'lucide-react';
import { AutoRegressiveModelsData } from '../AutoRegressiveModelsAtom';

interface AutoRegressiveModelsVisualisationProps {
  data: AutoRegressiveModelsData;
}

const AutoRegressiveModelsVisualisation: React.FC<AutoRegressiveModelsVisualisationProps> = ({ data }) => {
  return (
    <div className="space-y-6">
      <Card>
        <div className="p-4 border-b bg-muted/30">
          <h4 className="font-medium text-foreground flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            Time Series Chart Settings
          </h4>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <Label>Chart Type</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Button variant="outline" size="sm" className="justify-start">
                <LineChart className="w-4 h-4 mr-2" />
                Time Series
              </Button>
              <Button variant="outline" size="sm" className="justify-start">
                <TrendingUp className="w-4 h-4 mr-2" />
                Forecast
              </Button>
              <Button variant="outline" size="sm" className="justify-start">
                <Activity className="w-4 h-4 mr-2" />
                Residuals
              </Button>
              <Button variant="outline" size="sm" className="justify-start">
                <BarChart3 className="w-4 h-4 mr-2" />
                Performance
              </Button>
            </div>
          </div>

          <div>
            <Label>Time Variable (X-Axis)</Label>
            <Select>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Select time variable" />
              </SelectTrigger>
              <SelectContent>
                {data.availableColumns.map(col => (
                  <SelectItem key={col} value={col}>{col}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Target Variable (Y-Axis)</Label>
            <Select>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Select target variable" />
              </SelectTrigger>
              <SelectContent>
                {data.availableColumns.map(col => (
                  <SelectItem key={col} value={col}>{col}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Forecast Periods</Label>
            <Select>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Select forecast periods" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 period</SelectItem>
                <SelectItem value="3">3 periods</SelectItem>
                <SelectItem value="6">6 periods</SelectItem>
                <SelectItem value="12">12 periods</SelectItem>
                <SelectItem value="24">24 periods</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-4 border-b bg-muted/30">
          <h4 className="font-medium text-foreground">Time Series Model Performance</h4>
        </div>
        <div className="p-4">
          <div className="space-y-3">
            <div className="flex justify-between items-center p-2 bg-muted/50 rounded-lg">
              <span className="text-sm text-muted-foreground">RMSE</span>
              <span className="text-sm font-semibold text-foreground">-</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/50 rounded-lg">
              <span className="text-sm text-muted-foreground">MAE</span>
              <span className="text-sm font-semibold text-foreground">-</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/50 rounded-lg">
              <span className="text-sm text-muted-foreground">MAPE</span>
              <span className="text-sm font-semibold text-foreground">-</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/50 rounded-lg">
              <span className="text-sm text-muted-foreground">AIC</span>
              <span className="text-sm font-semibold text-foreground">-</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/50 rounded-lg">
              <span className="text-sm text-muted-foreground">BIC</span>
              <span className="text-sm font-semibold text-foreground">-</span>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-4 border-b bg-muted/30">
          <h4 className="font-medium text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Time Series Configuration
          </h4>
        </div>
        <div className="p-4">
          <div className="space-y-3">
            <div className="flex justify-between items-center p-2 bg-muted/50 rounded-lg">
              <span className="text-sm text-muted-foreground">Data Points</span>
              <span className="text-sm font-semibold text-foreground">{data.timeSeriesLength || 'N/A'}</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/50 rounded-lg">
              <span className="text-sm text-muted-foreground">Forecast Horizon</span>
              <span className="text-sm font-semibold text-foreground">{data.forecastHorizon || 'N/A'} periods</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/50 rounded-lg">
              <span className="text-sm text-muted-foreground">Validation Split</span>
              <span className="text-sm font-semibold text-foreground">
                {data.validationSplit ? `${(data.validationSplit * 100).toFixed(0)}%` : 'N/A'}
              </span>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-4 border-b bg-muted/30">
          <h4 className="font-medium text-foreground">Model Comparison</h4>
        </div>
        <div className="p-4">
          <div className="space-y-3">
            {data.selectedModels.map((model, index) => (
              <div key={index} className="flex justify-between items-center p-2 bg-muted/50 rounded-lg">
                <span className="text-sm text-muted-foreground">{model}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">RMSE:</span>
                  <span className="text-sm font-semibold text-foreground">-</span>
                  <span className="text-xs text-muted-foreground">MAE:</span>
                  <span className="text-sm font-semibold text-foreground">-</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-4 border-b bg-muted/30">
          <h4 className="font-medium text-foreground">Forecast Visualization</h4>
        </div>
        <div className="p-4">
          <div className="text-center py-8 text-gray-500">
            <TrendingUp className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>Forecast visualization will appear here</p>
            <p className="text-sm">Select variables and run models to see results</p>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default AutoRegressiveModelsVisualisation;
