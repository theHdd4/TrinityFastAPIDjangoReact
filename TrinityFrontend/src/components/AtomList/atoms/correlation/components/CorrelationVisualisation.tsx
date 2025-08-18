import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { 
  BarChart3, 
  ScatterChart, 
  TrendingUp, 
  RefreshCw, 
  Settings,
  Palette,
  Eye,
  Target,
  Zap
} from 'lucide-react';
import { CorrelationSettings } from '@/components/LaboratoryMode/store/laboratoryStore';

interface CorrelationVisualisationProps {
  data: CorrelationSettings;
  onDataChange: (newData: Partial<CorrelationSettings>) => void;
}

const CorrelationVisualisation: React.FC<CorrelationVisualisationProps> = ({ data, onDataChange }) => {
  // Get current visualization options or use defaults
  const vizOptions = data.visualizationOptions || {
    heatmapColorScheme: 'RdBu',
    var1Color: '#ef4444',
    var2Color: '#3b82f6',
    normalizeValues: false,
    selectedVizType: 'heatmap'
  };

  const [isLoading, setIsLoading] = useState(false);

  // Color scheme options for heatmap
  const colorSchemes = [
    { 
      id: 'RdBu', 
      name: 'Red-Blue', 
      preview: 'from-red-500 to-blue-500'
    },
    { 
      id: 'RdYlBu', 
      name: 'Red-Yellow-Blue', 
      preview: 'from-red-500 via-yellow-300 to-blue-500'
    },
    { 
      id: 'Spectral', 
      name: 'Spectral', 
      preview: 'from-purple-500 via-green-300 to-orange-500'
    },
    { 
      id: 'Viridis', 
      name: 'Viridis', 
      preview: 'from-purple-900 via-teal-500 to-yellow-300'
    },
    { 
      id: 'Plasma', 
      name: 'Plasma', 
      preview: 'from-purple-800 via-pink-500 to-yellow-300'
    },
  ];

  // Variable color options
  const variableColors = [
    '#ef4444', // Red
    '#3b82f6', // Blue
    '#10b981', // Green
    '#f59e0b', // Amber
    '#8b5cf6', // Purple
  ];

  // Visualization type options
  const vizTypeOptions = [
    { id: 'heatmap', name: 'Heatmap', icon: BarChart3 },
    { id: 'scatter', name: 'Scatter', icon: ScatterChart },
    { id: 'timeseries', name: 'Time Series', icon: TrendingUp },
  ];

  // Update visualization options
  const updateVizOptions = (updates: Partial<typeof vizOptions>) => {
    onDataChange({
      visualizationOptions: {
        ...vizOptions,
        ...updates
      }
    });
  };

  // Refresh data function
  const refreshData = () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 1200);
  };

  // Get correlation value for current selection
  const getCorrelationValue = () => {
    if (!data.selectedVar1 || !data.selectedVar2) {
      return null;
    }
    
    const variables = data.isUsingFileData && data.fileData?.numericColumns 
      ? data.fileData.numericColumns 
      : (data.variables || []);
    
    if (!variables || !data.correlationMatrix) {
      return null;
    }
    
    const var1Index = variables.indexOf(data.selectedVar1);
    const var2Index = variables.indexOf(data.selectedVar2);
    
    if (var1Index !== -1 && var2Index !== -1 && 
        data.correlationMatrix[var1Index] && 
        data.correlationMatrix[var1Index][var2Index] !== undefined) {
      const value = data.correlationMatrix[var1Index][var2Index];
      return isNaN(value) ? null : value;
    }
    return null;
  };

  // Get current variables for display
  const allCurrentVariables = data.isUsingFileData && data.fileData?.numericColumns 
    ? data.fileData.numericColumns 
    : (data.variables || []);

  return (
    <div className="p-1.5 space-y-1.5 h-full overflow-auto bg-gradient-to-br from-background via-background to-muted/10">
      {/* Ultra Compact Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center space-x-1">
          <div className="p-0.5 bg-primary/10 rounded-sm">
            <Eye className="h-3 w-3 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Enhanced Charts</h2>
            <p className="text-[10px] text-muted-foreground leading-none">Canvas visualization controls</p>
          </div>
        </div>
        <div className="flex items-center space-x-0.5">
          <Button variant="outline" size="sm" onClick={refreshData} disabled={isLoading} className="h-5 px-1 text-[10px]">
            <RefreshCw className={`h-2.5 w-2.5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Ultra Compact Visualization Selection */}
      <Card className="shadow-sm border bg-gradient-to-br from-card to-card/50">
        <CardContent className="p-1">
          <div className="grid grid-cols-3 gap-0.5">
            {vizTypeOptions.map((option) => (
              <Button
                key={option.id}
                variant={vizOptions.selectedVizType === option.id ? 'default' : 'outline'}
                className={`h-auto p-1 flex flex-col items-center space-y-0 text-[10px] ${
                  vizOptions.selectedVizType === option.id ? 'bg-primary text-primary-foreground' : ''
                }`}
                onClick={() => updateVizOptions({ selectedVizType: option.id })}
              >
                <option.icon className="h-2.5 w-2.5 mb-0.5" />
                <span className="truncate text-[9px]">{option.name}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Enhanced Controls */}
      <div className="grid grid-cols-1 gap-1">
        {/* Heatmap Color Scheme Control */}
        <Card>
          <CardHeader className="pb-0.5">
            <CardTitle className="text-[10px] flex items-center space-x-0.5">
              <Palette className="h-2.5 w-2.5" />
              <span>Heatmap Color Scheme</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <Select 
              value={vizOptions.heatmapColorScheme} 
              onValueChange={(value) => updateVizOptions({ heatmapColorScheme: value })}
            >
              <SelectTrigger className="h-5 text-[10px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {colorSchemes.map((scheme) => (
                  <SelectItem key={scheme.id} value={scheme.id}>
                    <div className="flex items-center space-x-0.5">
                      <div className={`w-2 h-2 rounded bg-gradient-to-r ${scheme.preview}`}></div>
                      <span className="text-[10px]">{scheme.name}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Variable Color Selection */}
        <Card>
          <CardHeader className="pb-0.5">
            <CardTitle className="text-[10px] flex items-center space-x-0.5">
              <Target className="h-2.5 w-2.5" />
              <span>Variable Colors</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            <div>
              <label className="text-[9px] text-muted-foreground mb-1 block">
                Variable 1 ({data.selectedVar1 || 'None'})
              </label>
              <div className="flex gap-0.5">
                {variableColors.map((color) => (
                  <button
                    key={color}
                    className={`w-3 h-3 rounded-sm border-2 ${
                      vizOptions.var1Color === color ? 'border-foreground' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => updateVizOptions({ var1Color: color })}
                  />
                ))}
              </div>
            </div>
            <div>
              <label className="text-[9px] text-muted-foreground mb-1 block">
                Variable 2 ({data.selectedVar2 || 'None'})
              </label>
              <div className="flex gap-0.5">
                {variableColors.map((color) => (
                  <button
                    key={color}
                    className={`w-3 h-3 rounded-sm border-2 ${
                      vizOptions.var2Color === color ? 'border-foreground' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => updateVizOptions({ var2Color: color })}
                  />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data Normalization Control */}
        <Card>
          <CardHeader className="pb-0.5">
            <CardTitle className="text-[10px] flex items-center space-x-0.5">
              <Zap className="h-2.5 w-2.5" />
              <span>Data Processing</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center space-x-2">
              <Switch
                checked={vizOptions.normalizeValues}
                onCheckedChange={(checked) => updateVizOptions({ normalizeValues: checked })}
                className="data-[state=checked]:bg-primary"
              />
              <span className="text-[9px] text-muted-foreground">
                Normalize Y values (-1 to 1)
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Variable Selection for Analysis */}
        <Card>
          <CardHeader className="pb-0.5">
            <CardTitle className="text-[10px]">Variable Selection</CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            <div>
              <label className="text-[9px] text-muted-foreground">Variable 1</label>
              <Select 
                value={data.selectedVar1 || ''} 
                onValueChange={(value) => onDataChange({ selectedVar1: value })}
              >
                <SelectTrigger className="h-5 text-[10px]">
                  <SelectValue placeholder="Select variable" />
                </SelectTrigger>
                <SelectContent>
                  {allCurrentVariables.map((variable) => (
                    <SelectItem key={variable} value={variable}>
                      <span className="text-[10px]">{variable}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-[9px] text-muted-foreground">Variable 2</label>
              <Select 
                value={data.selectedVar2 || ''} 
                onValueChange={(value) => onDataChange({ selectedVar2: value })}
              >
                <SelectTrigger className="h-5 text-[10px]">
                  <SelectValue placeholder="Select variable" />
                </SelectTrigger>
                <SelectContent>
                  {allCurrentVariables.map((variable) => (
                    <SelectItem key={variable} value={variable}>
                      <span className="text-[10px]">{variable}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Correlation Info */}
        {data.selectedVar1 && data.selectedVar2 && (
          <Card>
            <CardHeader className="pb-0.5">
              <CardTitle className="text-[10px] flex items-center space-x-0.5">
                <TrendingUp className="h-2.5 w-2.5" />
                <span>Correlation Info</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-center">
                <div className="text-lg font-bold text-foreground mb-1">
                  {getCorrelationValue() !== null ? getCorrelationValue()!.toFixed(3) : '---'}
                </div>
                <div className="text-[9px] text-muted-foreground mb-1">Correlation Coefficient</div>
                {getCorrelationValue() !== null && (
                  <Badge 
                    variant={
                      Math.abs(getCorrelationValue()!) > 0.7 ? "destructive" :
                      Math.abs(getCorrelationValue()!) > 0.3 ? "default" : "secondary"
                    }
                    className="text-[8px]"
                  >
                    {Math.abs(getCorrelationValue()!) > 0.7 ? 'Strong' :
                     Math.abs(getCorrelationValue()!) > 0.3 ? 'Moderate' : 'Weak'} Correlation
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default CorrelationVisualisation;
