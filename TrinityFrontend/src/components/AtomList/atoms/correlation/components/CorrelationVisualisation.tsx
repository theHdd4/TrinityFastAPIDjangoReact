import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { 
  Palette,
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

  // Update visualization options
  const updateVizOptions = (updates: Partial<typeof vizOptions>) => {
    onDataChange({
      visualizationOptions: {
        ...vizOptions,
        ...updates
      }
    });
  };

  return (
    <div className="p-2 space-y-2 h-full overflow-auto">
      {/* Heatmap Color Scheme Control */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center space-x-1">
            <Palette className="h-4 w-4" />
            <span>Heatmap Color Scheme</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <Select 
            value={vizOptions.heatmapColorScheme} 
            onValueChange={(value) => updateVizOptions({ heatmapColorScheme: value })}
          >
            <SelectTrigger className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {colorSchemes.map((scheme) => (
                <SelectItem key={scheme.id} value={scheme.id}>
                  <div className="flex items-center space-x-2">
                    <div className={`w-4 h-4 rounded bg-gradient-to-r ${scheme.preview}`}></div>
                    <span className="text-sm">{scheme.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Variable Color Selection */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center space-x-1">
            <Target className="h-4 w-4" />
            <span>Variable Colors</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">
              Variable 1 ({data.selectedVar1 || 'None'})
            </label>
            <div className="flex gap-2">
              {variableColors.map((color) => (
                <button
                  key={color}
                  className={`w-6 h-6 rounded border-2 ${
                    vizOptions.var1Color === color ? 'border-foreground' : 'border-gray-300'
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => updateVizOptions({ var1Color: color })}
                />
              ))}
            </div>
          </div>
          <div>
            <label className="text-sm text-muted-foreground mb-2 block">
              Variable 2 ({data.selectedVar2 || 'None'})
            </label>
            <div className="flex gap-2">
              {variableColors.map((color) => (
                <button
                  key={color}
                  className={`w-6 h-6 rounded border-2 ${
                    vizOptions.var2Color === color ? 'border-foreground' : 'border-gray-300'
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
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center space-x-1">
            <Zap className="h-4 w-4" />
            <span>Data Processing</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center space-x-3">
            <Switch
              checked={vizOptions.normalizeValues}
              onCheckedChange={(checked) => updateVizOptions({ normalizeValues: checked })}
              className="data-[state=checked]:bg-primary"
            />
            <span className="text-sm text-muted-foreground">
              Normalize Y values (-1 to 1)
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CorrelationVisualisation;
