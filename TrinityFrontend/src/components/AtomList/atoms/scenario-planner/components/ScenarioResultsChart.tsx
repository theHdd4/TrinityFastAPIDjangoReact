import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface ScenarioData {
  identifiers: Record<string, string>;
  prediction: number;
  pct_uplift: number;
  combinationLabel: string;
  run_id: string;
}

interface ScenarioResultsChartProps {
  data: ScenarioData[];
  width?: number;
  height?: number;
}

export const ScenarioResultsChart: React.FC<ScenarioResultsChartProps> = ({ 
  data, 
  width = 800, 
  height = 400 
}) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!data || data.length === 0 || !svgRef.current) return;

    // Clear previous chart
    d3.select(svgRef.current).selectAll("*").remove();

    // Set up dimensions and margins
    const margin = { top: 60, right: 30, bottom: 120, left: 80 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;

    // Create SVG
    const svg = d3.select(svgRef.current)
      .attr("width", width)
      .attr("height", height);

    // Create chart group
    const chartGroup = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Set up scales
    const xScale = d3.scaleBand()
      .domain(data.map(d => d.combinationLabel))
      .range([0, chartWidth])
      .padding(0.2);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(data, d => d.prediction) || 0])
      .nice()
      .range([chartHeight, 0]);

    // Create color scale based on uplift - simple conditional colors
    const getBarColor = (uplift: number) => {
      if (uplift > 0) return "#22c55e"; // Green for positive
      if (uplift < 0) return "#ef4444"; // Red for negative  
      return "#eab308"; // Yellow for zero/neutral
    };

    // Add bars
    const bars = chartGroup.selectAll(".bar")
      .data(data)
      .enter()
      .append("rect")
      .attr("class", "bar")
      .attr("x", d => xScale(d.combinationLabel) || 0)
      .attr("y", d => yScale(d.prediction))
      .attr("width", xScale.bandwidth())
      .attr("height", d => chartHeight - yScale(d.prediction))
      .attr("fill", d => getBarColor(d.pct_uplift))
      .attr("stroke", "#333")
      .attr("stroke-width", 1)
      .style("cursor", "pointer");

    // Add hover effects
    bars.on("mouseover", function(event, d) {
      d3.select(this)
        .attr("stroke-width", 2)
        .attr("stroke", "#000");
      
      // Show tooltip
      const tooltip = d3.select("body").append("div")
        .attr("class", "d3-tooltip")
        .style("position", "absolute")
        .style("background", "rgba(0, 0, 0, 0.8)")
        .style("color", "white")
        .style("padding", "8px")
        .style("border-radius", "4px")
        .style("font-size", "12px")
        .style("pointer-events", "none")
        .style("z-index", "1000");

      tooltip.html(`
        <div><strong>${d.combinationLabel}</strong></div>
        <div>Prediction: ${typeof d.prediction === 'number' ? d.prediction.toLocaleString() : d.prediction}</div>
        <div>Uplift: ${typeof d.pct_uplift === 'number' ? d.pct_uplift.toFixed(2) : d.pct_uplift}%</div>
        <div>Combination: ${d.combinationLabel}</div>
      `)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 10) + "px");
    })
    .on("mouseout", function() {
      d3.select(this)
        .attr("stroke-width", 1)
        .attr("stroke", "#333");
      
      d3.selectAll(".d3-tooltip").remove();
    });

    // Add percentage uplift labels on top of bars
    chartGroup.selectAll(".uplift-label")
      .data(data)
      .enter()
      .append("text")
      .attr("class", "uplift-label")
      .attr("x", d => (xScale(d.combinationLabel) || 0) + xScale.bandwidth() / 2)
      .attr("y", d => yScale(d.prediction) - 5)
      .attr("text-anchor", "middle")
      .style("font-size", "11px")
      .style("font-weight", "bold")
      .style("fill", "#333")
      .text(d => {
        const uplift = typeof d.pct_uplift === 'number' ? d.pct_uplift : 0;
        return `${uplift > 0 ? '+' : ''}${uplift.toFixed(1)}%`;
      });

    // Add prediction value labels on bars
    chartGroup.selectAll(".value-label")
      .data(data)
      .enter()
      .append("text")
      .attr("class", "value-label")
      .attr("x", d => (xScale(d.combinationLabel) || 0) + xScale.bandwidth() / 2)
      .attr("y", d => yScale(d.prediction) + (chartHeight - yScale(d.prediction)) / 2)
      .attr("text-anchor", "middle")
      .style("font-size", "10px")
      .style("font-weight", "bold")
      .style("fill", "white")
      .style("text-shadow", "1px 1px 1px rgba(0,0,0,0.7)")
      .text(d => d.prediction.toLocaleString());

    // Add X axis (without labels)
    chartGroup.append("g")
      .attr("transform", `translate(0,${chartHeight})`)
      .call(d3.axisBottom(xScale).tickFormat(() => "")); // Remove X-axis labels

    // Add Y axis (without label)
    chartGroup.append("g")
      .call(d3.axisLeft(yScale).tickFormat(d3.format(".2s")));

    // Add title
    svg.append("text")
      .attr("x", width / 2)
      .attr("y", margin.top / 2)
      .attr("text-anchor", "middle")
      .style("font-size", "16px")
      .style("font-weight", "bold")
      .text("Scenario Results - Individual Predictions");

    // Remove legend - keeping color scale for bars but removing the visual legend

  }, [data, width, height]);

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
        <div className="text-center">
          <div className="text-lg font-medium text-gray-600 mb-2">No Results Available</div>
          <div className="text-sm text-gray-500">Run a scenario to see results</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      <svg ref={svgRef} className="border border-gray-200 rounded-lg bg-white"></svg>
    </div>
  );
};

export default ScenarioResultsChart;
