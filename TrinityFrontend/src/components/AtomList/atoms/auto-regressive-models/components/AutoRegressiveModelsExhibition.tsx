import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, FileText, Share2, BarChart3, TrendingUp, Clock, Target, Zap } from 'lucide-react';
import { AutoRegressiveModelsData } from '../AutoRegressiveModelsAtom';

interface AutoRegressiveModelsExhibitionProps {
  data: AutoRegressiveModelsData;
}

const AutoRegressiveModelsExhibition: React.FC<AutoRegressiveModelsExhibitionProps> = ({ data }) => {
  return (
    <div className="space-y-6">
      <Card>
        <div className="p-4 border-b bg-muted/30">
          <h4 className="font-medium text-foreground flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Export Options
          </h4>
        </div>
        <div className="p-4 space-y-4">
          <Button className="w-full justify-start" variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export Model Results
          </Button>
          
          <Button className="w-full justify-start" variant="outline">
            <Share2 className="w-4 h-4 mr-2" />
            Share Analysis
          </Button>
        </div>
      </Card>

      <Card>
        <div className="p-4 border-b bg-muted/30">
          <h4 className="font-medium text-foreground flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            Model Summary
          </h4>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Selected Models:</span>
            <span className="text-sm font-medium">{data.selectedModels?.length || 0}</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Target Variable:</span>
            <span className="text-sm font-medium">{data.targetVariable || 'Not selected'}</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Time Variable:</span>
            <span className="text-sm font-medium">{data.timeVariable || 'Not selected'}</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Forecast Horizon:</span>
            <span className="text-sm font-medium">{data.forecastHorizon || 12} periods</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-sm text-muted-foreground">Transformations:</span>
            <span className="text-sm font-medium">{data.transformations?.length || 0}</span>
          </div>
        </div>
      </Card>

      {data.selectedModels && data.selectedModels.length > 0 && (
        <Card>
          <div className="p-4 border-b bg-muted/30">
            <h4 className="font-medium text-foreground flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Selected Models
            </h4>
          </div>
          <div className="p-4">
            <div className="flex flex-wrap gap-2">
              {data.selectedModels.map((model) => (
                <Badge key={model} variant="secondary">
                  {model}
                </Badge>
              ))}
            </div>
          </div>
        </Card>
      )}

      {data.modelConfigs && data.modelConfigs.length > 0 && (
        <Card>
          <div className="p-4 border-b bg-muted/30">
            <h4 className="font-medium text-foreground flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              Model Configurations
            </h4>
          </div>
          <div className="p-4">
            <div className="space-y-3">
              {data.modelConfigs.map((config) => (
                <div key={config.id} className="border rounded-lg p-3">
                  <h5 className="font-medium text-sm mb-2">{config.name}</h5>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(config.parameters).map(([key, value]) => (
                      <div key={key} className="text-xs">
                        <span className="text-muted-foreground">{key}:</span>
                        <span className="ml-1 font-medium">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      {data.transformations && data.transformations.length > 0 && (
        <Card>
          <div className="p-4 border-b bg-muted/30">
            <h4 className="font-medium text-foreground flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" />
              Time Series Transformations
            </h4>
          </div>
          <div className="p-4">
            <div className="space-y-3">
              {data.transformations.map((transformation) => (
                <div key={transformation.id} className="border rounded-lg p-3">
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Component 1:</span>
                      <span className="ml-1 font-medium">{transformation.component1 || 'Not set'}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Type:</span>
                      <span className="ml-1 font-medium">{transformation.transformationType}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Component 2:</span>
                      <span className="ml-1 font-medium">{transformation.component2 || 'Not set'}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <Card>
        <div className="p-4 border-b bg-muted/30">
          <h4 className="font-medium text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            Training Status
          </h4>
        </div>
        <div className="p-4">
          <div className="space-y-3">
            <div className="flex justify-between items-center p-2 bg-muted/50 rounded-lg">
              <span className="text-sm text-muted-foreground">Status</span>
              <Badge variant="outline">Ready to Train</Badge>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/50 rounded-lg">
              <span className="text-sm text-muted-foreground">Validation Split</span>
              <span className="text-sm font-semibold text-foreground">
                {((data.validationSplit || 0.2) * 100).toFixed(0)}%
              </span>
            </div>
            <div className="flex justify-between items-center p-2 bg-muted/50 rounded-lg">
              <span className="text-sm text-muted-foreground">Time Series Length</span>
              <span className="text-sm font-semibold text-foreground">
                {data.timeSeriesLength || 100} periods
              </span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default AutoRegressiveModelsExhibition;
