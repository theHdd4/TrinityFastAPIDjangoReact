import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { ChevronDown, TrendingUp, BarChart3, Target, Zap } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CorrelationSettings } from '@/components/LaboratoryMode/store/laboratoryStore';

interface CorrelationCanvasProps {
  data: CorrelationSettings;
  onDataChange: (newData: Partial<CorrelationSettings>) => void;
}

const CorrelationCanvas: React.FC<CorrelationCanvasProps> = ({ data, onDataChange }) => {
  const heatmapRef = useRef<SVGSVGElement>(null);
  const timeSeriesRef = useRef<SVGSVGElement>(null);

  // Draw correlation heatmap
  useEffect(() => {
    if (!heatmapRef.current || !data.correlationMatrix) return;

    const svg = d3.select(heatmapRef.current);
    svg.selectAll("*").remove();

    const margin = { top: 40, right: 20, bottom: 60, left: 80 };
    const width = 600 - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Create scales
    const xScale = d3.scaleBand()
      .domain(data.variables)
      .range([0, width])
      .padding(0.05);

    const yScale = d3.scaleBand()
      .domain(data.variables)
      .range([0, height])
      .padding(0.05);

    const colorScale = d3.scaleSequential(d3.interpolateRdBu)
      .domain([1, -1]);

    // Add cells
    data.variables.forEach((yVar, i) => {
      data.variables.forEach((xVar, j) => {
        const correlation = data.correlationMatrix[i][j];
        
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
              .style("font-size", "12px")
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
            onDataChange({
              selectedVar1: xVar,
              selectedVar2: yVar
            });
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
      .data(data.variables)
      .enter().append("text")
      .attr("class", "x-label")
      .attr("x", d => xScale(d)! + xScale.bandwidth() / 2)
      .attr("y", height + 20)
      .attr("text-anchor", "middle")
      .style("font-size", "12px")
      .style("font-weight", "500")
      .style("fill", "#666")
      .text(d => d);

    g.selectAll(".y-label")
      .data(data.variables)
      .enter().append("text")
      .attr("class", "y-label")
      .attr("x", -10)
      .attr("y", d => yScale(d)! + yScale.bandwidth() / 2)
      .attr("text-anchor", "end")
      .attr("dy", "0.35em")
      .style("font-size", "12px")
      .style("font-weight", "500")
      .style("fill", "#666")
      .text(d => d);

  }, [data.correlationMatrix, data.variables]);

  // Draw time series chart
  useEffect(() => {
    if (!timeSeriesRef.current || !data.timeSeriesData.length) return;

    const svg = d3.select(timeSeriesRef.current);
    svg.selectAll("*").remove();

    const margin = { top: 20, right: 120, bottom: 40, left: 60 };
    const width = 600 - margin.left - margin.right;
    const height = 200 - margin.top - margin.bottom;

    const g = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Create scales
    const xScale = d3.scaleTime()
      .domain(d3.extent(data.timeSeriesData, d => d.date) as [Date, Date])
      .range([0, width]);

    const yScale1 = d3.scaleLinear()
      .domain(d3.extent(data.timeSeriesData, d => d.var1Value) as [number, number])
      .range([height, 0]);

    const yScale2 = d3.scaleLinear()
      .domain(d3.extent(data.timeSeriesData, d => d.var2Value) as [number, number])
      .range([height, 0]);

    // Create line generators
    const line1 = d3.line<typeof data.timeSeriesData[0]>()
      .x(d => xScale(d.date))
      .y(d => yScale1(d.var1Value))
      .curve(d3.curveMonotoneX);

    const line2 = d3.line<typeof data.timeSeriesData[0]>()
      .x(d => xScale(d.date))
      .y(d => yScale2(d.var2Value))
      .curve(d3.curveMonotoneX);

    // Add lines
    g.append("path")
      .datum(data.timeSeriesData)
      .attr("fill", "none")
      .attr("stroke", "#ef4444")
      .attr("stroke-width", 2)
      .attr("d", line1);

    g.append("path")
      .datum(data.timeSeriesData)
      .attr("fill", "none")
      .attr("stroke", "#3b82f6")
      .attr("stroke-width", 2)
      .attr("d", line2);

    // Add axes
    g.append("g")
      .attr("transform", `translate(0,${height})`)
      .call(d3.axisBottom(xScale).tickFormat(d3.timeFormat("%b")));

    g.append("g")
      .call(d3.axisLeft(yScale1));

    // Add legend
    const legend = g.append("g")
      .attr("transform", `translate(${width + 20}, 20)`);

    legend.append("line")
      .attr("x1", 0).attr("x2", 20)
      .attr("y1", 0).attr("y2", 0)
      .attr("stroke", "#ef4444")
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
      .attr("stroke", "#3b82f6")
      .attr("stroke-width", 2);

    legend.append("text")
      .attr("x", 25)
      .attr("y", 20)
      .attr("dy", "0.35em")
      .style("font-size", "12px")
      .style("fill", "#666")
      .text(data.selectedVar2);

  }, [data.timeSeriesData, data.selectedVar1, data.selectedVar2]);

  const getCorrelationValue = () => {
    const var1Index = data.variables.indexOf(data.selectedVar1);
    const var2Index = data.variables.indexOf(data.selectedVar2);
    if (var1Index !== -1 && var2Index !== -1) {
      return data.correlationMatrix[var1Index][var2Index];
    }
    return 0;
  };

  return (
    <div className="w-full h-full bg-background p-6 overflow-y-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Correlation Analysis</h1>
            <p className="text-muted-foreground text-sm">Discover relationships between your variables</p>
          </div>
          <Badge variant="outline" className="flex items-center gap-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            Live Analysis
          </Badge>
        </div>

        {/* Filter Dimensions */}
        <Card className="p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            Filter Dimensions
          </h3>
          <div className="grid grid-cols-5 gap-3">
            {Object.entries(data.identifiers).map(([key, value]) => {
              const labels: Record<string, string> = {
                identifier3: 'Market',
                identifier4: 'Product', 
                identifier6: 'Region',
                identifier7: 'Channel',
                identifier15: 'Period'
              };
              const label = labels[key] || key;
              return (
                <div key={key} className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-muted-foreground">{label}</label>
                  <Select
                    value={value}
                    onValueChange={(newValue) => {
                      onDataChange({
                        identifiers: {
                          ...data.identifiers,
                          [key]: newValue
                        }
                      });
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All">All</SelectItem>
                      <SelectItem value="Option 1">Option 1</SelectItem>
                      <SelectItem value="Option 2">Option 2</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Correlation Heatmap - Full Width */}
      <div className="mb-6">
        <Card className="overflow-hidden">
          <div className="p-6">
            <svg ref={heatmapRef} width="100%" height="400" className="w-full"></svg>
          </div>
        </Card>
      </div>

      {/* Time Series + Analysis Setup */}
      <div className="grid grid-cols-12 gap-6">
        {/* Time Series Chart */}
        <div className="col-span-8">
          <Card className="overflow-hidden">
            <div className="p-4 border-b bg-muted/30">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Time Series Comparison
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Visualize how {data.selectedVar1} and {data.selectedVar2} change over time
              </p>
            </div>
            <div className="p-6">
              <svg ref={timeSeriesRef} width="100%" height="300" className="w-full"></svg>
            </div>
          </Card>
        </div>

        {/* Analysis Setup */}
        <div className="col-span-4">
          <Card className="overflow-hidden">
            <div className="p-4 border-b bg-muted/30">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-primary" />
                Analysis Setup
              </h3>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">Primary Variable</label>
                <Select
                  value={data.selectedVar1}
                  onValueChange={(value) => onDataChange({ selectedVar1: value })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {data.variables.map(variable => (
                      <SelectItem key={variable} value={variable}>{variable}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">Secondary Variable</label>
                <Select
                  value={data.selectedVar2}
                  onValueChange={(value) => onDataChange({ selectedVar2: value })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {data.variables.map(variable => (
                      <SelectItem key={variable} value={variable}>{variable}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Correlation Result */}
              <div className="bg-muted/50 rounded-lg p-4 border">
                <div className="text-center">
                  <div className="text-2xl font-bold text-foreground mb-1">
                    {getCorrelationValue().toFixed(3)}
                  </div>
                  <div className="text-sm text-muted-foreground">Correlation Coefficient</div>
                  <Badge 
                    variant={
                      Math.abs(getCorrelationValue()) > 0.7 ? "destructive" :
                      Math.abs(getCorrelationValue()) > 0.3 ? "default" : "secondary"
                    }
                    className="mt-2"
                  >
                    {Math.abs(getCorrelationValue()) > 0.7 ? 'Strong' :
                     Math.abs(getCorrelationValue()) > 0.3 ? 'Moderate' : 'Weak'} Correlation
                  </Badge>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default CorrelationCanvas;