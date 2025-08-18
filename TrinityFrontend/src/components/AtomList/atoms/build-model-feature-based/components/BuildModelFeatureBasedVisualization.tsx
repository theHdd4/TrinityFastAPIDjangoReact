import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { BarChart3, LineChart, PieChart, ScatterChart } from 'lucide-react';
import { BuildModelFeatureBasedData } from '../BuildModelFeatureBasedAtom';

interface BuildModelFeatureBasedVisualisationProps {
  data: BuildModelFeatureBasedData;
}

const BuildModelFeatureBasedVisualisation: React.FC<BuildModelFeatureBasedVisualisationProps> = ({ data }) => {
  return (
    <div className="space-y-6">
      <Card>
        <div className="p-4 border-b bg-muted/30">
          <h4 className="font-medium text-foreground flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            Chart Settings
          </h4>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <Label>Chart Type</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <Button variant="outline" size="sm" className="justify-start">
                <BarChart3 className="w-4 h-4 mr-2" />
                Bar
              </Button>
              <Button variant="outline" size="sm" className="justify-start">
                <LineChart className="w-4 h-4 mr-2" />
                Line
              </Button>
              <Button variant="outline" size="sm" className="justify-start">
                <ScatterChart className="w-4 h-4 mr-2" />
                Scatter
              </Button>
              <Button variant="outline" size="sm" className="justify-start">
                <PieChart className="w-4 h-4 mr-2" />
                Pie
              </Button>
            </div>
          </div>

          <div>
            <Label>X-Axis</Label>
            <Select>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Select X-axis variable" />
              </SelectTrigger>
              <SelectContent>
                {data.availableColumns.map(col => (
                  <SelectItem key={col} value={col}>{col}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Y-Axis</Label>
            <Select>
              <SelectTrigger className="mt-2">
                <SelectValue placeholder="Select Y-axis variable" />
              </SelectTrigger>
              <SelectContent>
                {data.availableColumns.map(col => (
                  <SelectItem key={col} value={col}>{col}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card>
        <div className="p-4 border-b bg-muted/30">
          <h4 className="font-medium text-foreground">Model Performance</h4>
        </div>
        <div className="p-4">
          <div className="space-y-3">
            <div className="flex justify-between items-center p-2 bg-muted/50 rounded-lg">
              <span className="text-sm text-muted-foreground">R² Score</span>
              <span className="text-sm font-semibold text-foreground">-</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/50 rounded-lg">
              <span className="text-sm text-muted-foreground">RMSE</span>
              <span className="text-sm font-semibold text-foreground">-</span>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/50 rounded-lg">
              <span className="text-sm text-muted-foreground">MAE</span>
              <span className="text-sm font-semibold text-foreground">-</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default BuildModelFeatureBasedVisualisation;