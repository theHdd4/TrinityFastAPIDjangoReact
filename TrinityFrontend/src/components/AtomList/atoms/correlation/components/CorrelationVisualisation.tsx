import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { 
  BarChart3, 
  ScatterChart, 
  TrendingUp, 
  Download, 
  Maximize2, 
  RefreshCw, 
  Settings,
  Palette,
  Grid,
  Eye
} from 'lucide-react';
import { CorrelationSettings } from '@/components/LaboratoryMode/store/laboratoryStore';

interface CorrelationVisualisationProps {
  data: CorrelationSettings;
}

const CorrelationVisualisation: React.FC<CorrelationVisualisationProps> = ({ data }) => {
  const [selectedViz, setSelectedViz] = useState('heatmap');
  const [colorScheme, setColorScheme] = useState('RdBu');
  const [selectedVar1, setSelectedVar1] = useState('sales');
  const [selectedVar2, setSelectedVar2] = useState('marketing');
  const [isLoading, setIsLoading] = useState(false);

  const variables = [
    { id: 'sales', name: 'Sales Volume', category: 'business' },
    { id: 'marketing', name: 'Marketing Spend', category: 'business' },
    { id: 'price', name: 'Price', category: 'financial' },
    { id: 'demand', name: 'Demand', category: 'market' },
    { id: 'satisfaction', name: 'Customer Satisfaction', category: 'experience' },
  ];

  const colorSchemes = [
    { id: 'RdBu', name: 'Red-Blue', preview: 'from-red-500 to-blue-500' },
    { id: 'RdYlBu', name: 'Red-Yellow-Blue', preview: 'from-red-500 via-yellow-300 to-blue-500' },
    { id: 'Spectral', name: 'Spectral', preview: 'from-purple-500 via-green-300 to-orange-500' },
    { id: 'Viridis', name: 'Viridis', preview: 'from-purple-900 via-teal-500 to-yellow-300' },
  ];

  const vizOptions = [
    { id: 'heatmap', name: 'Heatmap', icon: BarChart3 },
    { id: 'scatter', name: 'Scatter', icon: ScatterChart },
    { id: 'network', name: 'Network', icon: TrendingUp },
  ];

  const refreshData = () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 1200);
  };

  return (
    <div className="p-1.5 space-y-1.5 h-full overflow-auto bg-gradient-to-br from-background via-background to-muted/10">
      {/* Ultra Compact Header */}
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center space-x-1">
          <div className="p-0.5 bg-primary/10 rounded-sm">
            <Eye className="h-3 w-3 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Charts</h2>
            <p className="text-[10px] text-muted-foreground leading-none">Interactive viz</p>
          </div>
        </div>
        <div className="flex items-center space-x-0.5">
          <Button variant="outline" size="sm" onClick={refreshData} disabled={isLoading} className="h-5 px-1 text-[10px]">
            <RefreshCw className={`h-2.5 w-2.5 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" size="sm" className="h-5 px-1 text-[10px]">
            <Download className="h-2.5 w-2.5" />
          </Button>
        </div>
      </div>

      {/* Ultra Compact Visualization Selection */}
      <Card className="shadow-sm border bg-gradient-to-br from-card to-card/50">
        <CardContent className="p-1">
          <div className="grid grid-cols-3 gap-0.5">
            {vizOptions.map((option) => (
              <Button
                key={option.id}
                variant={selectedViz === option.id ? 'default' : 'outline'}
                className={`h-auto p-1 flex flex-col items-center space-y-0 text-[10px] ${
                  selectedViz === option.id ? 'bg-primary text-primary-foreground' : ''
                }`}
                onClick={() => setSelectedViz(option.id)}
              >
                <option.icon className="h-2.5 w-2.5 mb-0.5" />
                <span className="truncate text-[9px]">{option.name}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Ultra Compact Controls */}
      <div className="grid grid-cols-1 gap-1">
        {(selectedViz === 'heatmap' || selectedViz === 'network') && (
          <Card>
            <CardHeader className="pb-0.5">
              <CardTitle className="text-[10px] flex items-center space-x-0.5">
                <Palette className="h-2.5 w-2.5" />
                <span>Color</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Select value={colorScheme} onValueChange={setColorScheme}>
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
        )}

        {selectedViz === 'scatter' && (
          <Card>
            <CardHeader className="pb-0.5">
              <CardTitle className="text-[10px]">Variables</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-1">
              <div>
                <label className="text-[9px] text-muted-foreground">X-Axis</label>
                <Select value={selectedVar1} onValueChange={setSelectedVar1}>
                  <SelectTrigger className="h-5 text-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {variables.map((variable) => (
                      <SelectItem key={variable.id} value={variable.id}>
                        <div className="flex flex-col">
                          <span className="text-[10px]">{variable.name}</span>
                          <span className="text-[8px] bg-muted px-1 py-0 rounded">
                            {variable.category}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-[9px] text-muted-foreground">Y-Axis</label>
                <Select value={selectedVar2} onValueChange={setSelectedVar2}>
                  <SelectTrigger className="h-5 text-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {variables.map((variable) => (
                      <SelectItem key={variable.id} value={variable.id}>
                        <div className="flex flex-col">
                          <span className="text-[10px]">{variable.name}</span>
                          <span className="text-[8px] bg-muted px-1 py-0 rounded">
                            {variable.category}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-0.5">
            <CardTitle className="text-[10px] flex items-center space-x-0.5">
              <Settings className="h-2.5 w-2.5" />
              <span>Options</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            <Button variant="outline" size="sm" className="w-full justify-start h-5 text-[10px] px-1">
              <Grid className="h-2.5 w-2.5 mr-0.5" />
              Grid
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start h-5 text-[10px] px-1">
              <Maximize2 className="h-2.5 w-2.5 mr-0.5" />
              Full
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Ultra Compact Main Visualization */}
      <Card className="shadow-sm border-0 bg-gradient-to-br from-card to-card/50 flex-1">
        <CardHeader className="pb-1">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-0.5 text-[11px]">
              {React.createElement(vizOptions.find(v => v.id === selectedViz)?.icon || BarChart3, { className: "h-3 w-3" })}
              <span>{vizOptions.find(v => v.id === selectedViz)?.name}</span>
            </CardTitle>
            <div className="flex items-center space-x-0.5">
              {selectedViz === 'heatmap' && (
                <span className="text-[8px] bg-muted px-1 py-0 rounded">
                  {variables.length}×{variables.length}
                </span>
              )}
              {selectedViz === 'scatter' && (
                <span className="text-[8px] bg-muted px-1 py-0 rounded">
                  75 pts
                </span>
              )}
              {selectedViz === 'network' && (
                <span className="text-[8px] bg-muted px-1 py-0 rounded">
                  {variables.length} nodes
                </span>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0 p-1">
          <div className="bg-muted/20 rounded-md p-2 min-h-[180px] flex items-center justify-center">
            <div className="text-center">
              <div className="h-16 w-16 bg-muted rounded-lg flex items-center justify-center mx-auto mb-2">
                {React.createElement(vizOptions.find(v => v.id === selectedViz)?.icon || BarChart3, { 
                  className: "h-8 w-8 text-muted-foreground" 
                })}
              </div>
              <p className="text-[10px] text-muted-foreground">
                {isLoading ? "Loading..." : `${vizOptions.find(v => v.id === selectedViz)?.name} Chart`}
              </p>
              <p className="text-[8px] text-muted-foreground mt-1">
                Interactive visualization placeholder
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ultra Compact Export */}
      <Card className="shadow-sm border-0 bg-gradient-to-br from-card to-card/50">
        <CardContent className="p-1">
          <div className="grid grid-cols-4 gap-0.5">
            <Button variant="outline" className="h-5 text-[9px] px-1">
              PNG
            </Button>
            <Button variant="outline" className="h-5 text-[9px] px-1">
              SVG
            </Button>
            <Button variant="outline" className="h-5 text-[9px] px-1">
              PDF
            </Button>
            <Button variant="outline" className="h-5 text-[9px] px-1">
              Data
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CorrelationVisualisation;
