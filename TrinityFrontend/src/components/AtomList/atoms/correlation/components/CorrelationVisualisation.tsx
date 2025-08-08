
import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
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
import * as d3 from 'd3';
import { CorrelationSettings } from '@/components/LaboratoryMode/store/laboratoryStore';

interface CorrelationVisualisationProps {
  data: CorrelationSettings;
}

const CorrelationVisualisation: React.FC<CorrelationVisualisationProps> = ({ data }) => {
  const heatmapRef = useRef<SVGSVGElement>(null);
  const scatterRef = useRef<SVGSVGElement>(null);
  const networkRef = useRef<SVGSVGElement>(null);
  const [selectedViz, setSelectedViz] = useState('heatmap');
  const [selectedVar1, setSelectedVar1] = useState('sales');
  const [selectedVar2, setSelectedVar2] = useState('marketing');
  const [isLoading, setIsLoading] = useState(false);
  const [colorScheme, setColorScheme] = useState('RdBu');

  const variables = [
    { id: 'sales', name: 'Sales Volume', category: 'business' },
    { id: 'marketing', name: 'Marketing Spend', category: 'business' },
    { id: 'price', name: 'Price', category: 'financial' },
    { id: 'demand', name: 'Demand', category: 'market' },
    { id: 'temperature', name: 'Temperature', category: 'external' },
    { id: 'advertising', name: 'Advertising', category: 'business' },
  ];

  const colorSchemes = [
    { id: 'RdBu', name: 'Red-Blue', preview: 'from-red-500 to-blue-500' },
    { id: 'RdYlBu', name: 'Red-Yellow-Blue', preview: 'from-red-500 via-yellow-300 to-blue-500' },
    { id: 'Spectral', name: 'Spectral', preview: 'from-purple-500 via-green-300 to-orange-500' },
    { id: 'Viridis', name: 'Viridis', preview: 'from-purple-900 via-teal-500 to-yellow-300' },
  ];

  // Generate enhanced correlation matrix
  const correlationMatrix = variables.map((var1, i) =>
    variables.map((var2, j) => ({
      x: i,
      y: j,
      var1: var1.name,
      var2: var2.name,
      value: i === j ? 1 : (Math.random() * 2 - 1) * Math.pow(0.9, Math.abs(i - j)),
      category1: var1.category,
      category2: var2.category
    }))
  ).flat();

  // Generate scatter plot data with clusters
  const scatterData = Array.from({ length: 75 }, (_, i) => ({
    x: Math.random() * 100 + 20 + (Math.sin(i * 0.1) * 15),
    y: Math.random() * 100 + 20 + (Math.cos(i * 0.1) * 15),
    size: Math.random() * 15 + 5,
    cluster: Math.floor(Math.random() * 3),
    id: i
  }));

  const refreshData = () => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 1200);
  };

  useEffect(() => {
    if (selectedViz === 'heatmap' && heatmapRef.current) {
      drawEnhancedHeatmap();
    } else if (selectedViz === 'scatter' && scatterRef.current) {
      drawEnhancedScatterPlot();
    } else if (selectedViz === 'network' && networkRef.current) {
      drawNetworkDiagram();
    }
  }, [selectedViz, selectedVar1, selectedVar2, colorScheme, isLoading]);

  const drawEnhancedHeatmap = () => {
    if (!heatmapRef.current) return;

    const svg = d3.select(heatmapRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 100, right: 40, bottom: 120, left: 140 };
    const width = 700 - margin.left - margin.right;
    const height = 600 - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const cellSize = Math.min(width / variables.length, height / variables.length);

    // Enhanced color scale based on selection
    let colorScale;
    switch (colorScheme) {
      case 'RdYlBu':
        colorScale = d3.scaleSequential(d3.interpolateRdYlBu).domain([1, -1]);
        break;
      case 'Spectral':
        colorScale = d3.scaleSequential(d3.interpolateSpectral).domain([1, -1]);
        break;
      case 'Viridis':
        colorScale = d3.scaleSequential(d3.interpolateViridis).domain([-1, 1]);
        break;
      default:
        colorScale = d3.scaleSequential(d3.interpolateRdBu).domain([1, -1]);
    }

    // Add background grid
    g.selectAll('.grid-line-h')
      .data(d3.range(variables.length + 1))
      .enter().append('line')
      .attr('class', 'grid-line-h')
      .attr('x1', 0)
      .attr('x2', cellSize * variables.length)
      .attr('y1', d => d * cellSize)
      .attr('y2', d => d * cellSize)
      .attr('stroke', 'hsl(var(--border))')
      .attr('stroke-width', 0.5)
      .attr('opacity', 0.3);

    g.selectAll('.grid-line-v')
      .data(d3.range(variables.length + 1))
      .enter().append('line')
      .attr('class', 'grid-line-v')
      .attr('y1', 0)
      .attr('y2', cellSize * variables.length)
      .attr('x1', d => d * cellSize)
      .attr('x2', d => d * cellSize)
      .attr('stroke', 'hsl(var(--border))')
      .attr('stroke-width', 0.5)
      .attr('opacity', 0.3);

    // Create enhanced cells with animations
    const cells = g.selectAll('.cell')
      .data(correlationMatrix)
      .enter().append('rect')
      .attr('class', 'cell')
      .attr('x', d => d.x * cellSize + 2)
      .attr('y', d => d.y * cellSize + 2)
      .attr('width', 0)
      .attr('height', 0)
      .attr('fill', d => colorScale(d.value))
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 2)
      .attr('rx', 4)
      .style('cursor', 'pointer')
      .style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))')
      .on('mouseover', function(event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('stroke-width', 4)
          .attr('stroke', 'hsl(var(--primary))')
          .style('filter', 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))');
        
        // Enhanced tooltip
        showTooltip(event, d, g);
      })
      .on('mouseout', function() {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('stroke-width', 2)
          .attr('stroke', '#ffffff')
          .style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))');
        hideTooltip(g);
      });

    // Animate cells appearing
    cells.transition()
      .duration(800)
      .delay((_, i) => i * 50)
      .attr('width', cellSize - 4)
      .attr('height', cellSize - 4);

    // Add correlation values with better styling
    g.selectAll('.cell-text')
      .data(correlationMatrix)
      .enter().append('text')
      .attr('class', 'cell-text')
      .attr('x', d => d.x * cellSize + cellSize / 2)
      .attr('y', d => d.y * cellSize + cellSize / 2)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', `${Math.min(cellSize / 6, 12)}px`)
      .attr('font-weight', '700')
      .attr('fill', d => {
        const brightness = d3.color(colorScale(d.value))?.rgb();
        if (brightness) {
          const luminance = (brightness.r * 299 + brightness.g * 587 + brightness.b * 114) / 1000;
          return luminance > 128 ? '#000000' : '#ffffff';
        }
        return Math.abs(d.value) > 0.6 ? '#ffffff' : 'hsl(var(--foreground))';
      })
      .style('pointer-events', 'none')
      .style('opacity', 0)
      .text(d => d.value.toFixed(2))
      .transition()
      .duration(1000)
      .delay(800)
      .style('opacity', 1);

    // Enhanced labels with categories
    g.selectAll('.row-label')
      .data(variables)
      .enter().append('text')
      .attr('class', 'row-label')
      .attr('x', -20)
      .attr('y', (_, i) => i * cellSize + cellSize / 2)
      .attr('text-anchor', 'end')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', '14px')
      .attr('font-weight', '600')
      .attr('fill', 'hsl(var(--foreground))')
      .style('opacity', 0)
      .text(d => d.name)
      .transition()
      .duration(600)
      .delay(1000)
      .style('opacity', 1);

    g.selectAll('.col-label')
      .data(variables)
      .enter().append('text')
      .attr('class', 'col-label')
      .attr('x', (_, i) => i * cellSize + cellSize / 2)
      .attr('y', -20)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'bottom')
      .attr('font-size', '14px')
      .attr('font-weight', '600')
      .attr('fill', 'hsl(var(--foreground))')
      .attr('transform', (_, i) => `rotate(-45, ${i * cellSize + cellSize / 2}, -20)`)
      .style('opacity', 0)
      .text(d => d.name)
      .transition()
      .duration(600)
      .delay(1200)
      .style('opacity', 1);

    // Add enhanced color legend
    addColorLegend(svg, colorScale, margin, width);
  };

  const drawEnhancedScatterPlot = () => {
    if (!scatterRef.current) return;

    const svg = d3.select(scatterRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 40, right: 40, bottom: 70, left: 70 };
    const width = 600 - margin.left - margin.right;
    const height = 450 - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const xScale = d3.scaleLinear()
      .domain(d3.extent(scatterData, d => d.x) as [number, number])
      .range([0, width])
      .nice();

    const yScale = d3.scaleLinear()
      .domain(d3.extent(scatterData, d => d.y) as [number, number])
      .range([height, 0])
      .nice();

    const sizeScale = d3.scaleLinear()
      .domain(d3.extent(scatterData, d => d.size) as [number, number])
      .range([4, 16]);

    const clusterColors = ['hsl(var(--primary))', 'hsl(var(--destructive))', 'hsl(var(--secondary))'];

    // Add grid
    g.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale)
        .tickSize(-height)
        .tickFormat(() => ''))
      .style('stroke-dasharray', '3,3')
      .style('opacity', 0.3);

    g.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(yScale)
        .tickSize(-width)
        .tickFormat(() => ''))
      .style('stroke-dasharray', '3,3')
      .style('opacity', 0.3);

    // Add trend line with confidence interval
    const trendLine = d3.line<any>()
      .x(d => xScale(d.x))
      .y(d => yScale(d.y))
      .curve(d3.curveMonotoneX);

    const sortedData = [...scatterData].sort((a, b) => a.x - b.x);
    
    g.append('path')
      .datum(sortedData)
      .attr('fill', 'none')
      .attr('stroke', 'hsl(var(--primary))')
      .attr('stroke-width', 3)
      .attr('stroke-dasharray', '8,4')
      .attr('opacity', 0.8)
      .attr('d', trendLine)
      .style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))');

    // Add confidence interval
    const confidenceArea = d3.area<any>()
      .x(d => xScale(d.x))
      .y0(d => yScale(d.y - 10))
      .y1(d => yScale(d.y + 10))
      .curve(d3.curveMonotoneX);

    g.append('path')
      .datum(sortedData)
      .attr('fill', 'hsl(var(--primary))')
      .attr('opacity', 0.1)
      .attr('d', confidenceArea);

    // Add interactive points with animations
    g.selectAll('.dot')
      .data(scatterData)
      .enter().append('circle')
      .attr('class', 'dot')
      .attr('r', 0)
      .attr('cx', d => xScale(d.x))
      .attr('cy', d => yScale(d.y))
      .attr('fill', d => clusterColors[d.cluster])
      .attr('fill-opacity', 0.7)
      .attr('stroke', d => clusterColors[d.cluster])
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))')
      .on('mouseover', function(event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('r', sizeScale(d.size) * 1.5)
          .style('filter', 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))');
        
        showScatterTooltip(event, d, g);
      })
      .on('mouseout', function(event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('r', sizeScale(d.size))
          .style('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))');
        hideTooltip(g);
      })
      .transition()
      .duration(800)
      .delay((_, i) => i * 20)
      .attr('r', d => sizeScale(d.size));

    // Enhanced axes
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale))
      .style('color', 'hsl(var(--foreground))')
      .selectAll('text')
      .style('font-size', '12px');

    g.append('g')
      .call(d3.axisLeft(yScale))
      .style('color', 'hsl(var(--foreground))')
      .selectAll('text')
      .style('font-size', '12px');

    // Axis labels
    g.append('text')
      .attr('transform', 'rotate(-90)')
      .attr('y', 0 - margin.left)
      .attr('x', 0 - (height / 2))
      .attr('dy', '1em')
      .attr('text-anchor', 'middle')
      .attr('fill', 'hsl(var(--foreground))')
      .attr('font-weight', '600')
      .text(variables.find(v => v.id === selectedVar2)?.name || 'Variable 2');

    g.append('text')
      .attr('transform', `translate(${width / 2}, ${height + margin.bottom - 20})`)
      .attr('text-anchor', 'middle')
      .attr('fill', 'hsl(var(--foreground))')
      .attr('font-weight', '600')
      .text(variables.find(v => v.id === selectedVar1)?.name || 'Variable 1');

    // Add cluster legend
    const legend = g.append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${width - 100}, 20)`);

    ['Cluster 1', 'Cluster 2', 'Cluster 3'].forEach((cluster, i) => {
      const legendRow = legend.append('g')
        .attr('transform', `translate(0, ${i * 25})`);

      legendRow.append('circle')
        .attr('r', 6)
        .attr('fill', clusterColors[i]);

      legendRow.append('text')
        .attr('x', 15)
        .attr('y', 5)
        .attr('font-size', '12px')
        .attr('fill', 'hsl(var(--foreground))')
        .text(cluster);
    });
  };

  const drawNetworkDiagram = () => {
    if (!networkRef.current) return;

    const svg = d3.select(networkRef.current);
    svg.selectAll('*').remove();

    const width = 600;
    const height = 500;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.3;

    const g = svg.append('g')
      .attr('transform', `translate(${width/2},${height/2})`);

    // Position nodes in a circle
    const nodePositions = variables.map((v, i) => {
      const angle = (i * 2 * Math.PI) / variables.length;
      return {
        ...v,
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        index: i
      };
    });

    // Create links based on correlation strength
    const links = correlationMatrix
      .filter(d => d.x !== d.y && Math.abs(d.value) > 0.3)
      .map(d => ({
        source: nodePositions[d.x],
        target: nodePositions[d.y],
        value: d.value,
        strength: Math.abs(d.value)
      }));

    // Draw links
    const linkScale = d3.scaleLinear()
      .domain([0.3, 1])
      .range([1, 8]);

    g.selectAll('.link')
      .data(links)
      .enter().append('line')
      .attr('class', 'link')
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y)
      .attr('stroke', d => d.value > 0 ? 'hsl(var(--primary))' : 'hsl(var(--destructive))')
      .attr('stroke-width', d => linkScale(d.strength))
      .attr('opacity', 0.6)
      .style('stroke-linecap', 'round');

    // Draw nodes
    g.selectAll('.node')
      .data(nodePositions)
      .enter().append('circle')
      .attr('class', 'node')
      .attr('cx', d => d.x)
      .attr('cy', d => d.y)
      .attr('r', 20)
      .attr('fill', 'hsl(var(--card))')
      .attr('stroke', 'hsl(var(--primary))')
      .attr('stroke-width', 3)
      .style('cursor', 'pointer')
      .style('filter', 'drop-shadow(0 4px 8px rgba(0,0,0,0.1))')
      .on('mouseover', function() {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('r', 25)
          .style('filter', 'drop-shadow(0 6px 12px rgba(0,0,0,0.2))');
      })
      .on('mouseout', function() {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('r', 20)
          .style('filter', 'drop-shadow(0 4px 8px rgba(0,0,0,0.1))');
      });

    // Add node labels
    g.selectAll('.node-label')
      .data(nodePositions)
      .enter().append('text')
      .attr('class', 'node-label')
      .attr('x', d => d.x)
      .attr('y', d => d.y)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'middle')
      .attr('font-size', '10px')
      .attr('font-weight', '600')
      .attr('fill', 'hsl(var(--foreground))')
      .style('pointer-events', 'none')
      .text(d => d.name.split(' ')[0]);
  };

  const showTooltip = (event: any, d: any, g: any) => {
    const tooltip = g.append('g')
      .attr('class', 'tooltip')
      .attr('transform', `translate(${event.offsetX - 100}, ${event.offsetY - 80})`);

    const rect = tooltip.append('rect')
      .attr('x', -60)
      .attr('y', -40)
      .attr('width', 120)
      .attr('height', 60)
      .attr('fill', 'hsl(var(--popover))')
      .attr('stroke', 'hsl(var(--border))')
      .attr('stroke-width', 2)
      .attr('rx', 8)
      .style('filter', 'drop-shadow(0 4px 12px rgba(0,0,0,0.15))');

    tooltip.append('text')
      .attr('text-anchor', 'middle')
      .attr('y', -20)
      .attr('font-size', '12px')
      .attr('font-weight', '600')
      .attr('fill', 'hsl(var(--popover-foreground))')
      .text(`${d.var1} × ${d.var2}`);

    tooltip.append('text')
      .attr('text-anchor', 'middle')
      .attr('y', -5)
      .attr('font-size', '14px')
      .attr('font-weight', '700')
      .attr('fill', d.value > 0 ? 'hsl(var(--primary))' : 'hsl(var(--destructive))')
      .text(d.value.toFixed(3));

    tooltip.append('text')
      .attr('text-anchor', 'middle')
      .attr('y', 15)
      .attr('font-size', '10px')
      .attr('fill', 'hsl(var(--muted-foreground))')
      .text(`${Math.abs(d.value) > 0.7 ? 'Strong' : Math.abs(d.value) > 0.4 ? 'Moderate' : 'Weak'}`);
  };

  const showScatterTooltip = (event: any, d: any, g: any) => {
    const tooltip = g.append('g')
      .attr('class', 'tooltip')
      .attr('transform', `translate(${event.offsetX}, ${event.offsetY - 60})`);

    const rect = tooltip.append('rect')
      .attr('x', -40)
      .attr('y', -30)
      .attr('width', 80)
      .attr('height', 50)
      .attr('fill', 'hsl(var(--popover))')
      .attr('stroke', 'hsl(var(--border))')
      .attr('stroke-width', 2)
      .attr('rx', 6)
      .style('filter', 'drop-shadow(0 4px 12px rgba(0,0,0,0.15))');

    tooltip.append('text')
      .attr('text-anchor', 'middle')
      .attr('y', -15)
      .attr('font-size', '11px')
      .attr('font-weight', '600')
      .attr('fill', 'hsl(var(--popover-foreground))')
      .text(`Point ${d.id + 1}`);

    tooltip.append('text')
      .attr('text-anchor', 'middle')
      .attr('y', 0)
      .attr('font-size', '10px')
      .attr('fill', 'hsl(var(--muted-foreground))')
      .text(`(${d.x.toFixed(1)}, ${d.y.toFixed(1)})`);

    tooltip.append('text')
      .attr('text-anchor', 'middle')
      .attr('y', 15)
      .attr('font-size', '10px')
      .attr('fill', 'hsl(var(--muted-foreground))')
      .text(`Cluster ${d.cluster + 1}`);
  };

  const hideTooltip = (g: any) => {
    g.selectAll('.tooltip').remove();
  };

  const addColorLegend = (svg: any, colorScale: any, margin: any, width: number) => {
    const legendWidth = 200;
    const legendHeight = 20;
    
    const legend = svg.append('g')
      .attr('transform', `translate(${margin.left + (width - legendWidth) / 2}, ${margin.top + 420})`);

    const legendScale = d3.scaleLinear()
      .domain([-1, 1])
      .range([0, legendWidth]);

    const legendAxis = d3.axisBottom(legendScale)
      .ticks(5)
      .tickFormat(d3.format('.1f'));

    const defs = svg.append('defs');
    const gradient = defs.append('linearGradient')
      .attr('id', 'legend-gradient')
      .attr('gradientUnits', 'userSpaceOnUse')
      .attr('x1', 0)
      .attr('x2', legendWidth);

    gradient.selectAll('stop')
      .data(d3.range(-1, 1.1, 0.1))
      .enter().append('stop')
      .attr('offset', d => `${((d + 1) / 2) * 100}%`)
      .attr('stop-color', d => colorScale(d));

    legend.append('rect')
      .attr('width', legendWidth)
      .attr('height', legendHeight)
      .style('fill', 'url(#legend-gradient)')
      .attr('rx', 4);

    legend.append('g')
      .attr('transform', `translate(0, ${legendHeight})`)
      .call(legendAxis)
      .style('color', 'hsl(var(--foreground))');

    legend.append('text')
      .attr('x', legendWidth / 2)
      .attr('y', -8)
      .attr('text-anchor', 'middle')
      .attr('font-size', '12px')
      .attr('font-weight', '600')
      .attr('fill', 'hsl(var(--foreground))')
      .text('Correlation Coefficient');
  };

  const vizOptions = [
    { id: 'heatmap', name: 'Correlation Heatmap', icon: BarChart3, desc: 'Matrix view of all correlations' },
    { id: 'scatter', name: 'Scatter Plot', icon: ScatterChart, desc: 'Relationship between two variables' },
    { id: 'network', name: 'Network Diagram', icon: TrendingUp, desc: 'Correlation network visualization' },
  ];

  return (
    <div className="p-3 space-y-3 h-full overflow-auto bg-gradient-to-br from-background via-background to-muted/10">
      {/* Compact Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="p-1 bg-primary/10 rounded">
            <Eye className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Visualizations</h2>
            <p className="text-xs text-muted-foreground">Interactive charts</p>
          </div>
        </div>
        <div className="flex items-center space-x-1">
          <Button variant="outline" size="sm" onClick={refreshData} disabled={isLoading} className="h-7 px-2 text-xs">
            <RefreshCw className={`h-3 w-3 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Loading' : 'Refresh'}
          </Button>
          <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
            <Download className="h-3 w-3 mr-1" />
            Export
          </Button>
        </div>
      </div>

      {/* Compact Visualization Selection */}
      <Card className="shadow-sm border bg-gradient-to-br from-card to-card/50">
        <CardContent className="p-2">
          <div className="grid grid-cols-3 gap-1">
            {vizOptions.map((option) => (
              <Button
                key={option.id}
                variant={selectedViz === option.id ? 'default' : 'outline'}
                className={`h-auto p-2 flex flex-col items-center space-y-1 text-xs ${
                  selectedViz === option.id ? 'bg-primary text-primary-foreground' : ''
                }`}
                onClick={() => setSelectedViz(option.id)}
              >
                <option.icon className="h-3 w-3" />
                <span className="font-medium text-[10px] leading-tight text-center">{option.name}</span>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Compact Chart Controls */}
      <div className="grid grid-cols-1 gap-2">{/* Changed from lg:grid-cols-3 gap-4 */}
        {selectedViz === 'heatmap' && (
          <Card>
            <CardHeader className="pb-1">
              <CardTitle className="text-xs flex items-center space-x-1">
                <Palette className="h-3 w-3" />
                <span>Color Scheme</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <Select value={colorScheme} onValueChange={setColorScheme}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {colorSchemes.map((scheme) => (
                    <SelectItem key={scheme.id} value={scheme.id}>
                      <div className="flex items-center space-x-1">
                        <div className={`w-3 h-3 rounded bg-gradient-to-r ${scheme.preview}`}></div>
                        <span className="text-xs">{scheme.name}</span>
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
            <CardHeader className="pb-1">
              <CardTitle className="text-xs">Variables</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-2">
              <div>
                <label className="text-xs text-muted-foreground">X-Axis</label>
                <Select value={selectedVar1} onValueChange={setSelectedVar1}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {variables.map((variable) => (
                      <SelectItem key={variable.id} value={variable.id}>
                        <div className="flex flex-col">
                          <span className="text-xs">{variable.name}</span>
                          <Badge variant="outline" className="text-[10px] w-fit py-0">
                            {variable.category}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Y-Axis</label>
                <Select value={selectedVar2} onValueChange={setSelectedVar2}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {variables.map((variable) => (
                      <SelectItem key={variable.id} value={variable.id}>
                        <div className="flex flex-col">
                          <span className="text-xs">{variable.name}</span>
                          <Badge variant="outline" className="text-[10px] w-fit py-0">
                            {variable.category}
                          </Badge>
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
          <CardHeader className="pb-1">
            <CardTitle className="text-xs flex items-center space-x-1">
              <Settings className="h-3 w-3" />
              <span>Display</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            <Button variant="outline" size="sm" className="w-full justify-start h-6 text-xs px-2">
              <Grid className="h-3 w-3 mr-1" />
              Grid
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start h-6 text-xs px-2">
              <Maximize2 className="h-3 w-3 mr-1" />
              Fullscreen
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Compact Main Visualization */}
      <Card className="shadow-lg border-0 bg-gradient-to-br from-card to-card/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-1 text-sm">
              {React.createElement(vizOptions.find(v => v.id === selectedViz)?.icon || BarChart3, { className: "h-4 w-4" })}
              <span>{vizOptions.find(v => v.id === selectedViz)?.name}</span>
            </CardTitle>
            <div className="flex items-center space-x-1">
              {selectedViz === 'heatmap' && (
                <Badge variant="outline" className="text-[10px] py-0 px-1">
                  {variables.length}×{variables.length}
                </Badge>
              )}
              {selectedViz === 'scatter' && (
                <Badge variant="outline" className="text-[10px] py-0 px-1">
                  {scatterData.length} pts
                </Badge>
              )}
              {selectedViz === 'network' && (
                <Badge variant="outline" className="text-[10px] py-0 px-1">
                  {variables.length} nodes
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="bg-muted/30 rounded-lg p-3">
            {selectedViz === 'heatmap' && (
              <svg
                ref={heatmapRef}
                width={500}
                height={400}
                className="w-full h-auto drop-shadow-lg"
              />
            )}
            
            {selectedViz === 'scatter' && (
              <svg
                ref={scatterRef}
                width={450}
                height={350}
                className="w-full h-auto drop-shadow-lg"
              />
            )}
            
            {selectedViz === 'network' && (
              <svg
                ref={networkRef}
                width={450}
                height={350}
                className="w-full h-auto drop-shadow-lg"
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Compact Chart Actions */}
      <Card className="shadow-lg border-0 bg-gradient-to-br from-card to-card/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Export</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="grid grid-cols-4 gap-1">
            <Button variant="outline" className="h-7 text-xs px-2">
              <Download className="h-3 w-3" />
            </Button>
            <Button variant="outline" className="h-7 text-xs px-2">
              SVG
            </Button>
            <Button variant="outline" className="h-7 text-xs px-2">
              PDF
            </Button>
            <Button variant="outline" className="h-7 text-xs px-2">
              Data
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CorrelationVisualisation;