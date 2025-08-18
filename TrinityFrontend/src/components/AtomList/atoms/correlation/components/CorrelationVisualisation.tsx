import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { 
  BarChart3, 
  ScatterChart, 
  TrendingUp, 
  Maximize2, 
  RefreshCw, 
  Settings,
  Palette,
  Grid,
  Eye,
  Target,
  Zap
} from 'lucide-react';
import * as d3 from 'd3';
import { CorrelationSettings } from '@/components/LaboratoryMode/store/laboratoryStore';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { correlationAPI } from '../helpers/correlationAPI';

interface CorrelationVisualisationProps {
  data: CorrelationSettings;
  onDataChange: (newData: Partial<CorrelationSettings>) => void;
}

const CorrelationVisualisation: React.FC<CorrelationVisualisationProps> = ({ data, onDataChange }) => {
  // State management
  const [selectedViz, setSelectedViz] = useState('heatmap');
  const [colorScheme, setColorScheme] = useState('RdBu');
  const [selectedVar1Color, setSelectedVar1Color] = useState('#ef4444');
  const [selectedVar2Color, setSelectedVar2Color] = useState('#3b82f6');
  const [normalizeValues, setNormalizeValues] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Refs for D3 visualizations
  const heatmapRef = useRef<SVGSVGElement>(null);
  const timeSeriesRef = useRef<SVGSVGElement>(null);
  
  // Get layout info from store
  const auxPanelActive = useLaboratoryStore(state => state.auxPanelActive);
  const isCompactMode = auxPanelActive !== null;

  // Color scheme options for heatmap
  const colorSchemes = [
    { 
      id: 'RdBu', 
      name: 'Red-Blue', 
      preview: 'from-red-500 to-blue-500',
      interpolator: d3.interpolateRdBu
    },
    { 
      id: 'RdYlBu', 
      name: 'Red-Yellow-Blue', 
      preview: 'from-red-500 via-yellow-300 to-blue-500',
      interpolator: d3.interpolateRdYlBu
    },
    { 
      id: 'Spectral', 
      name: 'Spectral', 
      preview: 'from-purple-500 via-green-300 to-orange-500',
      interpolator: d3.interpolateSpectral
    },
    { 
      id: 'Viridis', 
      name: 'Viridis', 
      preview: 'from-purple-900 via-teal-500 to-yellow-300',
      interpolator: d3.interpolateViridis
    },
    { 
      id: 'Plasma', 
      name: 'Plasma', 
      preview: 'from-purple-800 via-pink-500 to-yellow-300',
      interpolator: d3.interpolatePlasma
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
  const vizOptions = [
    { id: 'heatmap', name: 'Heatmap', icon: BarChart3 },
    { id: 'scatter', name: 'Scatter', icon: ScatterChart },
    { id: 'timeseries', name: 'Time Series', icon: TrendingUp },
  ];

  // Data normalization function
  const normalizeData = (values: number[]): number[] => {
    if (!normalizeValues) return values;
    
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    
    if (range === 0) return values.map(() => 0);
    
    return values.map(value => -1 + 2 * ((value - min) / range));
  };

  // Enhanced time series data fetching function
  const fetchEnhancedTimeSeriesData = async (
    filePath: string, 
    startDate?: string, 
    endDate?: string,
    forceColumns?: { column1: string; column2: string }
  ): Promise<Array<{date: Date | number; var1Value: number; var2Value: number}>> => {
    try {
      console.log('🚀 Fetching enhanced time series data for:', filePath);
      
      // Get highest correlation pair (unless forced columns provided)
      let pairData;
      if (forceColumns) {
        pairData = {
          column1: forceColumns.column1,
          column2: forceColumns.column2,
          correlation: 1.0
        };
      } else {
        pairData = await correlationAPI.getHighestCorrelationPair(filePath);
        console.log('🔗 Pair data:', pairData);
      }
      
      // Get time series data using the combined API
      const timeSeriesData = await correlationAPI.getTimeSeriesData(filePath, {
        column1: pairData.column1,
        column2: pairData.column2,
        start_date: startDate,
        end_date: endDate
      });
      
      console.log('✅ Enhanced time series data prepared:', timeSeriesData.length || 0, 'points');
      return timeSeriesData || [];
      
    } catch (error) {
      console.error('💥 Failed to fetch enhanced time series data:', error);
      return [];
    }
  };

  // Handle variable selection change with data fetching
  const handleVariableSelectionChange = async (var1: string, var2: string) => {
    if (!data.isUsingFileData || !data.fileData?.fileName) {
      console.warn('⚠️ No file data available for time series update');
      return;
    }
    
    const filePath = data.fileData.fileName;
    if (!filePath) {
      console.warn('⚠️ No file path available for time series update');
      return;
    }
    
    try {
      console.log('🔄 Updating time series data for selection:', var1, 'vs', var2);
      
      // Update selected variables first
      onDataChange({
        selectedVar1: var1,
        selectedVar2: var2
      });
      
      // Fetch new time series data with specific columns
      const enhancedTimeSeriesData = await fetchEnhancedTimeSeriesData(
        filePath,
        data.settings?.dateFrom,
        data.settings?.dateTo,
        { column1: var1, column2: var2 }
      );
      
      // Update time series data
      onDataChange({
        timeSeriesData: enhancedTimeSeriesData,
        selectedVar1: var1,
        selectedVar2: var2
      });
      
      console.log('✅ Time series data updated for selection');
    } catch (error) {
      console.error('💥 Failed to update time series for selection:', error);
      onDataChange({
        timeSeriesData: [],
        selectedVar1: var1,
        selectedVar2: var2
      });
    }
  };

  // Refresh data function
  const refreshData = () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 1200);
  };

  // Helper function to filter variables
  const getFilteredVariables = (variables: string[], correlationMatrix: number[][]) => {
    const safeVariables = variables || [];
    
    if (data.showAllColumns) {
      return safeVariables;
    }

    return safeVariables.filter((variable, index) => {
      if (!correlationMatrix || !correlationMatrix[index]) return true;
      
      const hasOtherCorrelations = correlationMatrix[index].some((correlation, corrIndex) => {
        return corrIndex !== index && Math.abs(correlation) > 0.1;
      });
      
      return hasOtherCorrelations;
    });
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

  // Draw correlation heatmap with instant color scheme updates
  useEffect(() => {
    if (!heatmapRef.current || !data.correlationMatrix) return;

    const svg = d3.select(heatmapRef.current);
    svg.selectAll("*").remove();

    // Adjust dimensions based on compact mode
    const margin = isCompactMode 
      ? { top: 20, right: 10, bottom: 35, left: 45 } 
      : { top: 40, right: 20, bottom: 60, left: 80 };
    
    const baseWidth = isCompactMode ? 350 : 600;
    const baseHeight = isCompactMode ? 180 : 300;
    
    const width = baseWidth - margin.left - margin.right;
    const height = baseHeight - margin.top - margin.bottom;

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Get variables from file data or default
    const allVariables = data.isUsingFileData && data.fileData?.numericColumns 
      ? data.fileData.numericColumns 
      : (data.variables || []);

    // Filter variables based on showAllColumns setting
    const variables = getFilteredVariables(allVariables, data.correlationMatrix);

    // Create scales
    const xScale = d3.scaleBand()
      .domain(variables)
      .range([0, width])
      .padding(0.05);

    const yScale = d3.scaleBand()
      .domain(variables)
      .range([0, height])
      .padding(0.05);

    // Get selected color scheme interpolator
    const selectedScheme = colorSchemes.find(scheme => scheme.id === colorScheme);
    const colorScale = d3.scaleSequential(selectedScheme?.interpolator || d3.interpolateRdBu)
      .domain([1, -1]);

    // Add cells
    variables.forEach((yVar, i) => {
      variables.forEach((xVar, j) => {
        // Get the original indices for correlation matrix lookup
        const originalYIndex = allVariables.indexOf(yVar);
        const originalXIndex = allVariables.indexOf(xVar);
        
        // Validate correlation matrix access
        let correlation = 0.0;
        if (data.correlationMatrix && 
            Array.isArray(data.correlationMatrix) && 
            originalYIndex >= 0 && originalYIndex < data.correlationMatrix.length &&
            Array.isArray(data.correlationMatrix[originalYIndex]) &&
            originalXIndex >= 0 && originalXIndex < data.correlationMatrix[originalYIndex].length) {
          const value = data.correlationMatrix[originalYIndex][originalXIndex];
          if (typeof value === 'number' && !isNaN(value) && isFinite(value)) {
            correlation = value;
          } else {
            correlation = originalYIndex === originalXIndex ? 1.0 : 0.0;
          }
        } else {
          correlation = originalYIndex === originalXIndex ? 1.0 : 0.0;
        }
        
        g.append("rect")
          .attr("x", xScale(xVar))
          .attr("y", yScale(yVar))
          .attr("width", xScale.bandwidth())
          .attr("height", yScale.bandwidth())
          .attr("fill", colorScale(correlation))
          .attr("stroke", "white")
          .attr("stroke-width", 1)
          .style("cursor", "pointer")
          .on("mouseover", function(event) {
            d3.select(this).attr("stroke-width", 2).attr("stroke", "#333");
            
            // Tooltip
            const tooltip = d3.select("body").append("div")
              .attr("class", "tooltip")
              .style("position", "absolute")
              .style("background", "rgba(0,0,0,0.8)")
              .style("color", "white")
              .style("padding", "8px")
              .style("border-radius", "4px")
              .style("font-size", isCompactMode ? "10px" : "12px")
              .style("pointer-events", "none")
              .style("z-index", "1000");
            
            tooltip.html(`${xVar} vs ${yVar}<br/>Correlation: ${correlation.toFixed(3)}`)
              .style("left", (event.pageX + 10) + "px")
              .style("top", (event.pageY - 10) + "px");
          })
          .on("mouseout", function() {
            d3.select(this).attr("stroke-width", 1).attr("stroke", "white");
            d3.selectAll(".tooltip").remove();
          })
          .on("click", () => {
            handleVariableSelectionChange(xVar, yVar);
          });

        // Add correlation text for visible cells
        if (Math.abs(correlation) > 0.1) {
          g.append("text")
            .attr("x", xScale(xVar)! + xScale.bandwidth() / 2)
            .attr("y", yScale(yVar)! + yScale.bandwidth() / 2)
            .attr("text-anchor", "middle")
            .attr("dy", "0.35em")
            .style("font-size", "10px")
            .style("font-weight", "500")
            .style("fill", Math.abs(correlation) > 0.6 ? "white" : "#333")
            .style("pointer-events", "none")
            .text(correlation.toFixed(2));
        }
      });
    });

    // Add axis labels
    g.selectAll(".x-label")
      .data(variables)
      .enter().append("text")
      .attr("class", "x-label")
      .attr("x", d => xScale(d)! + xScale.bandwidth() / 2)
      .attr("y", height + 20)
      .attr("text-anchor", "middle")
      .style("font-size", isCompactMode ? "10px" : "12px")
      .style("font-weight", "500")
      .style("fill", "#666")
      .text(d => d);

    g.selectAll(".y-label")
      .data(variables)
      .enter().append("text")
      .attr("class", "y-label")
      .attr("x", -10)
      .attr("y", d => yScale(d)! + yScale.bandwidth() / 2)
      .attr("text-anchor", "end")
      .attr("dy", "0.35em")
      .style("font-size", isCompactMode ? "10px" : "12px")
      .style("font-weight", "500")
      .style("fill", "#666")
      .text(d => d);

  }, [data.correlationMatrix, data.variables, data.isUsingFileData, data.fileData, data.showAllColumns, isCompactMode, colorScheme]);

  // Draw time series chart with instant color and normalization updates
  useEffect(() => {
    if (!timeSeriesRef.current || !data.timeSeriesData?.length) return;

    const svg = d3.select(timeSeriesRef.current);
    svg.selectAll("*").remove();

    // Adjust dimensions based on compact mode
    const margin = isCompactMode 
      ? { top: 10, right: 60, bottom: 25, left: 35 } 
      : { top: 20, right: 120, bottom: 40, left: 60 };
    
    const baseWidth = isCompactMode ? 350 : 600;
    const baseHeight = isCompactMode ? 120 : 200;
    
    const width = baseWidth - margin.left - margin.right;
    const height = baseHeight - margin.top - margin.bottom;

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Validate and clean time series data
    const validData = data.timeSeriesData.filter(d => 
      (d.date instanceof Date || typeof d.date === 'number') &&
      typeof d.var1Value === 'number' && !isNaN(d.var1Value) && isFinite(d.var1Value) &&
      typeof d.var2Value === 'number' && !isNaN(d.var2Value) && isFinite(d.var2Value)
    );

    if (validData.length === 0) {
      g.append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .style("font-size", isCompactMode ? "12px" : "14px")
        .style("fill", "#666")
        .text("No valid time series data available");
      return;
    }

    // Normalize data if option is selected
    const var1Values = normalizeData(validData.map(d => d.var1Value));
    const var2Values = normalizeData(validData.map(d => d.var2Value));

    // Create normalized data array
    const normalizedData = validData.map((d, i) => ({
      ...d,
      var1Value: var1Values[i],
      var2Value: var2Values[i]
    }));

    // Determine if we're using dates or indices
    const hasDatetime = validData.length > 0 && validData[0].date instanceof Date;

    // Create appropriate scales based on data type
    let xScale: any;
    
    if (hasDatetime) {
      const dateExtent = d3.extent(normalizedData, d => d.date as Date) as [Date, Date];
      if (!dateExtent[0] || !dateExtent[1]) {
        g.append("text")
          .attr("x", width / 2)
          .attr("y", height / 2)
          .attr("text-anchor", "middle")
          .style("font-size", isCompactMode ? "12px" : "14px")
          .style("fill", "#666")
          .text("Invalid date range in time series data");
        return;
      }
      xScale = d3.scaleTime()
        .domain(dateExtent)
        .range([0, width]);
    } else {
      const indexExtent = d3.extent(normalizedData, d => d.date as number) as [number, number];
      if (indexExtent[0] === undefined || indexExtent[1] === undefined) {
        g.append("text")
          .attr("x", width / 2)
          .attr("y", height / 2)
          .attr("text-anchor", "middle")
          .style("font-size", isCompactMode ? "12px" : "14px")
          .style("fill", "#666")
          .text("Invalid index range in time series data");
        return;
      }
      xScale = d3.scaleLinear()
        .domain(indexExtent)
        .range([0, width]);
    }

    // Y-scale adjustments for normalization
    const var1Extent = normalizeValues 
      ? [-1, 1] 
      : d3.extent(normalizedData, d => d.var1Value) as [number, number];
    const var2Extent = normalizeValues 
      ? [-1, 1] 
      : d3.extent(normalizedData, d => d.var2Value) as [number, number];

    const yScale1 = d3.scaleLinear()
      .domain(var1Extent[0] !== undefined && var1Extent[1] !== undefined && var1Extent[0] !== var1Extent[1] 
        ? var1Extent 
        : [0, Math.max(...normalizedData.map(d => d.var1Value)) || 100])
      .range([height, 0]);

    const yScale2 = d3.scaleLinear()
      .domain(var2Extent[0] !== undefined && var2Extent[1] !== undefined && var2Extent[0] !== var2Extent[1] 
        ? var2Extent 
        : [0, Math.max(...normalizedData.map(d => d.var2Value)) || 100])
      .range([height, 0]);

    // Create line generators with validation
    const line1 = d3.line<typeof normalizedData[0]>()
      .x(d => {
        const x = xScale(d.date);
        return isNaN(x) ? 0 : x;
      })
      .y(d => {
        const y = yScale1(d.var1Value);
        return isNaN(y) ? height : y;
      })
      .curve(d3.curveMonotoneX);

    const line2 = d3.line<typeof normalizedData[0]>()
      .x(d => {
        const x = xScale(d.date);
        return isNaN(x) ? 0 : x;
      })
      .y(d => {
        const y = yScale2(d.var2Value);
        return isNaN(y) ? height : y;
      })
      .curve(d3.curveMonotoneX);

    // Add lines with selected colors
    try {
      g.append("path")
        .datum(normalizedData)
        .attr("fill", "none")
        .attr("stroke", selectedVar1Color)
        .attr("stroke-width", 2)
        .attr("d", line1);

      g.append("path")
        .datum(normalizedData)
        .attr("fill", "none")
        .attr("stroke", selectedVar2Color)
        .attr("stroke-width", 2)
        .attr("d", line2);

      // Add axes with appropriate formatting
      const xAxis = hasDatetime 
        ? d3.axisBottom(xScale).tickFormat(d3.timeFormat("%b %d"))
        : d3.axisBottom(xScale).tickFormat(d3.format("d"));

      g.append("g")
        .attr("transform", `translate(0,${height})`)
        .call(xAxis);

      g.append("g")
        .call(d3.axisLeft(yScale1));

      // Add legend
      const legend = g.append("g")
        .attr("transform", `translate(${width + 20}, 20)`);

      legend.append("line")
        .attr("x1", 0).attr("x2", 20)
        .attr("y1", 0).attr("y2", 0)
        .attr("stroke", selectedVar1Color)
        .attr("stroke-width", 2);

      legend.append("text")
        .attr("x", 25)
        .attr("y", 0)
        .attr("dy", "0.35em")
        .style("font-size", "12px")
        .style("fill", "#666")
        .text(data.selectedVar1);

      legend.append("line")
        .attr("x1", 0).attr("x2", 20)
        .attr("y1", 20).attr("y2", 20)
        .attr("stroke", selectedVar2Color)
        .attr("stroke-width", 2);

      legend.append("text")
        .attr("x", 25)
        .attr("y", 20)
        .attr("dy", "0.35em")
        .style("font-size", "12px")
        .style("fill", "#666")
        .text(data.selectedVar2);

    } catch (error) {
      console.error('Error rendering time series chart:', error);
      g.append("text")
        .attr("x", width / 2)
        .attr("y", height / 2)
        .attr("text-anchor", "middle")
        .style("font-size", "14px")
        .style("fill", "#ef4444")
        .text("Error rendering time series chart");
    }

  }, [data.timeSeriesData, data.selectedVar1, data.selectedVar2, isCompactMode, selectedVar1Color, selectedVar2Color, normalizeValues]);

  // Get current variables for display
  const allCurrentVariables = data.isUsingFileData && data.fileData?.numericColumns 
    ? data.fileData.numericColumns 
    : (data.variables || []);
  
  const currentVariables = getFilteredVariables(allCurrentVariables, data.correlationMatrix);

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
            <p className="text-[10px] text-muted-foreground leading-none">Interactive visualization</p>
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

      {/* Enhanced Controls */}
      <div className="grid grid-cols-1 gap-1">
        {/* Heatmap Color Scheme Control */}
        {(selectedViz === 'heatmap' || selectedViz === 'timeseries') && (
          <Card>
            <CardHeader className="pb-0.5">
              <CardTitle className="text-[10px] flex items-center space-x-0.5">
                <Palette className="h-2.5 w-2.5" />
                <span>Heatmap Color Scheme</span>
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

        {/* Variable Color Selection */}
        {(selectedViz === 'timeseries' || selectedViz === 'scatter') && (
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
                        selectedVar1Color === color ? 'border-foreground' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setSelectedVar1Color(color)}
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
                        selectedVar2Color === color ? 'border-foreground' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color }}
                      onClick={() => setSelectedVar2Color(color)}
                    />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Data Normalization Control */}
        {(selectedViz === 'timeseries' || selectedViz === 'scatter') && (
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
                  checked={normalizeValues}
                  onCheckedChange={setNormalizeValues}
                  className="data-[state=checked]:bg-primary"
                />
                <span className="text-[9px] text-muted-foreground">
                  Normalize Y values (-1 to 1)
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Variable Selection for Scatter Plot */}
        {selectedViz === 'scatter' && (
          <Card>
            <CardHeader className="pb-0.5">
              <CardTitle className="text-[10px]">Variable Selection</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-1">
              <div>
                <label className="text-[9px] text-muted-foreground">X-Axis</label>
                <Select 
                  value={data.selectedVar1 || ''} 
                  onValueChange={(value) => {
                    if (data.selectedVar2) {
                      handleVariableSelectionChange(value, data.selectedVar2);
                    } else {
                      onDataChange({ selectedVar1: value });
                    }
                  }}
                >
                  <SelectTrigger className="h-5 text-[10px]">
                    <SelectValue placeholder="Select variable" />
                  </SelectTrigger>
                  <SelectContent>
                    {currentVariables.map((variable) => (
                      <SelectItem key={variable} value={variable}>
                        <span className="text-[10px]">{variable}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-[9px] text-muted-foreground">Y-Axis</label>
                <Select 
                  value={data.selectedVar2 || ''} 
                  onValueChange={(value) => {
                    if (data.selectedVar1) {
                      handleVariableSelectionChange(data.selectedVar1, value);
                    } else {
                      onDataChange({ selectedVar2: value });
                    }
                  }}
                >
                  <SelectTrigger className="h-5 text-[10px]">
                    <SelectValue placeholder="Select variable" />
                  </SelectTrigger>
                  <SelectContent>
                    {currentVariables.map((variable) => (
                      <SelectItem key={variable} value={variable}>
                        <span className="text-[10px]">{variable}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Display Options */}
        <Card>
          <CardHeader className="pb-0.5">
            <CardTitle className="text-[10px] flex items-center space-x-0.5">
              <Settings className="h-2.5 w-2.5" />
              <span>Display Options</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1">
            <Button variant="outline" size="sm" className="w-full justify-start h-5 text-[10px] px-1">
              <Grid className="h-2.5 w-2.5 mr-0.5" />
              Toggle Grid
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start h-5 text-[10px] px-1">
              <Maximize2 className="h-2.5 w-2.5 mr-0.5" />
              Fullscreen
            </Button>
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

      {/* Visualization Canvas */}
      <Card className="mt-2">
        <CardContent className="p-2">
          {selectedViz === 'heatmap' && (
            <svg ref={heatmapRef} width="100%" height={isCompactMode ? "220" : "400"} className="w-full"></svg>
          )}
          {selectedViz === 'timeseries' && (
            <svg ref={timeSeriesRef} width="100%" height={isCompactMode ? "150" : "300"} className="w-full"></svg>
          )}
          {selectedViz === 'scatter' && (
            <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
              Scatter plot visualization coming soon...
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CorrelationVisualisation;
