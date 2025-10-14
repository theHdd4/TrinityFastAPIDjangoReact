import React, { useEffect, useMemo, useRef } from 'react';
import * as d3 from 'd3';
import type { ChartRendererConfig } from './shared';

interface TrendAnalysisChartProps {
  config: ChartRendererConfig;
}

type TrendDatum = {
  label: string;
  value: number;
};

const buildChartData = (config: ChartRendererConfig): TrendDatum[] => {
  const xField = config.xField ?? 'date';
  const yField = config.yField ?? 'value';

  return (config.data ?? [])
    .map(row => {
      const record = row as Record<string, unknown>;
      const rawLabel = record[xField];
      const rawValue = record[yField];

      if (rawLabel == null) {
        return null;
      }

      const parsedValue = typeof rawValue === 'number' ? rawValue : Number(rawValue);
      if (!Number.isFinite(parsedValue)) {
        return null;
      }

      return {
        label: String(rawLabel),
        value: parsedValue,
      } as TrendDatum;
    })
    .filter((entry): entry is TrendDatum => Boolean(entry));
};

const isParsableDate = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
};

const TrendAnalysisChart: React.FC<TrendAnalysisChartProps> = ({ config }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gradientId = useMemo(() => `trend-analysis-gradient-${Math.random().toString(36).slice(2)}`, []);
  const chartData = useMemo(() => buildChartData(config), [config]);
  const width = 720;
  const height = config.height ?? 320;

  useEffect(() => {
    if (!svgRef.current) {
      return;
    }

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    if (chartData.length === 0) {
      return;
    }

    const margin = { top: 24, right: 32, bottom: 56, left: 72 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const labelledData = chartData.map(entry => ({ ...entry }));

    const allLabelsAreDates = labelledData.every(entry => isParsableDate(entry.label));

    if (allLabelsAreDates) {
      labelledData.sort((a, b) => Date.parse(a.label) - Date.parse(b.label));
    }

    const xScale = allLabelsAreDates
      ? d3
          .scaleTime()
          .domain(d3.extent(labelledData, d => new Date(d.label)) as [Date, Date])
          .range([0, innerWidth])
      : d3
          .scaleBand<string>()
          .domain(labelledData.map(d => d.label))
          .range([0, innerWidth])
          .padding(0.2);

    const maxValue = d3.max(labelledData, d => d.value) ?? 0;
    const minValue = d3.min(labelledData, d => d.value) ?? 0;
    const yScale = d3
      .scaleLinear()
      .domain([Math.min(0, minValue), maxValue])
      .nice()
      .range([innerHeight, 0]);

    const defs = svg.append('defs');
    const primaryColor = (config.colors && config.colors[0]) || '#3b82f6';
    const secondaryColor = (config.colors && config.colors[1]) || '#8b5cf6';
    const tertiaryColor = (config.colors && config.colors[2]) || '#06b6d4';

    const gradient = defs
      .append('linearGradient')
      .attr('id', gradientId)
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '100%')
      .attr('y2', '0%');

    gradient.append('stop').attr('offset', '0%').attr('stop-color', primaryColor);
    gradient.append('stop').attr('offset', '50%').attr('stop-color', secondaryColor);
    gradient.append('stop').attr('offset', '100%').attr('stop-color', tertiaryColor);

    const container = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const axisBottom = container
      .append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .style('color', '#6b7280');

    if (allLabelsAreDates) {
      axisBottom
        .call(d3.axisBottom(xScale as d3.ScaleTime<number, number>).ticks(6).tickFormat(d3.timeFormat('%b %Y')))
        .selectAll('text')
        .style('font-size', '12px');
    } else {
      axisBottom
        .call(d3.axisBottom(xScale as d3.ScaleBand<string>))
        .selectAll('text')
        .style('font-size', '12px')
        .attr('transform', labelledData.length > 8 ? 'rotate(-30)' : null)
        .style('text-anchor', labelledData.length > 8 ? 'end' : 'middle');
    }

    container
      .append('g')
      .call(d3.axisLeft(yScale).ticks(5).tickSize(-innerWidth).tickFormat(d => d3.format('~s')(d as number)))
      .selectAll('text')
      .style('font-size', '12px')
      .style('color', '#6b7280');

    container
      .selectAll('.grid-line')
      .data(yScale.ticks(5))
      .join('line')
      .attr('class', 'grid-line')
      .attr('x1', 0)
      .attr('x2', innerWidth)
      .attr('y1', d => yScale(d))
      .attr('y2', d => yScale(d))
      .attr('stroke', '#e2e8f0')
      .attr('stroke-dasharray', '4 4');

    const lineGenerator = d3
      .line<TrendDatum>()
      .x(d => {
        if (allLabelsAreDates) {
          return (xScale as d3.ScaleTime<number, number>)(new Date(d.label)) ?? 0;
        }
        const bandScale = xScale as d3.ScaleBand<string>;
        const position = bandScale(d.label);
        return (position ?? 0) + bandScale.bandwidth() / 2;
      })
      .y(d => yScale(d.value))
      .curve(d3.curveMonotoneX);

    container
      .append('path')
      .datum(labelledData)
      .attr('fill', 'none')
      .attr('stroke', `url(#${gradientId})`)
      .attr('stroke-width', 3)
      .attr('d', lineGenerator);

    container
      .selectAll('.trend-dot')
      .data(labelledData)
      .join('circle')
      .attr('class', 'trend-dot')
      .attr('cx', d => {
        if (allLabelsAreDates) {
          return (xScale as d3.ScaleTime<number, number>)(new Date(d.label)) ?? 0;
        }
        const bandScale = xScale as d3.ScaleBand<string>;
        const position = bandScale(d.label);
        return (position ?? 0) + bandScale.bandwidth() / 2;
      })
      .attr('cy', d => yScale(d.value))
      .attr('r', 4)
      .attr('fill', primaryColor)
      .attr('stroke', '#ffffff')
      .attr('stroke-width', 2);

    const tooltipGroup = container.append('g').style('display', 'none');
    tooltipGroup.append('circle').attr('r', 5).attr('fill', primaryColor);
    const tooltipBackground = tooltipGroup
      .append('rect')
      .attr('fill', 'rgba(15, 23, 42, 0.9)')
      .attr('rx', 6)
      .attr('ry', 6)
      .attr('height', 32);
    const tooltipText = tooltipGroup
      .append('text')
      .attr('fill', '#f8fafc')
      .attr('font-size', 12)
      .attr('dy', '1em')
      .attr('dx', 12);

    const overlay = container
      .append('rect')
      .attr('fill', 'transparent')
      .attr('width', innerWidth)
      .attr('height', innerHeight)
      .on('mouseover', () => tooltipGroup.style('display', null))
      .on('mouseout', () => tooltipGroup.style('display', 'none'))
      .on('mousemove', event => {
        const [mx] = d3.pointer(event);

        let closest: TrendDatum | null = null;
        let closestDistance = Infinity;
        labelledData.forEach(d => {
          const pointX = allLabelsAreDates
            ? (xScale as d3.ScaleTime<number, number>)(new Date(d.label)) ?? 0
            : ((xScale as d3.ScaleBand<string>)(d.label) ?? 0) + (xScale as d3.ScaleBand<string>).bandwidth() / 2;
          const distance = Math.abs(mx - pointX);
          if (distance < closestDistance) {
            closestDistance = distance;
            closest = d;
          }
        });

        if (!closest) {
          return;
        }

        const pointX = allLabelsAreDates
          ? (xScale as d3.ScaleTime<number, number>)(new Date(closest.label)) ?? 0
          : ((xScale as d3.ScaleBand<string>)(closest.label) ?? 0) + (xScale as d3.ScaleBand<string>).bandwidth() / 2;
        const pointY = yScale(closest.value);

        tooltipGroup.attr('transform', `translate(${pointX}, ${pointY})`);
        const formattedValue = d3.format(',')(closest.value);
        tooltipText.text(`${closest.label}: ${formattedValue}`);
        const textWidth = (tooltipText.node() as SVGTextElement)?.getBBox().width ?? 0;
        tooltipBackground.attr('width', textWidth + 24).attr('x', -12).attr('y', -36);
      });

    if (config.xAxisLabel) {
      container
        .append('text')
        .attr('x', innerWidth / 2)
        .attr('y', innerHeight + margin.bottom - 16)
        .attr('text-anchor', 'middle')
        .attr('fill', '#475569')
        .attr('font-size', 12)
        .attr('font-weight', 600)
        .text(config.xAxisLabel);
    }

    if (config.yAxisLabel) {
      container
        .append('text')
        .attr('transform', `rotate(-90)`)
        .attr('x', -innerHeight / 2)
        .attr('y', -margin.left + 16)
        .attr('text-anchor', 'middle')
        .attr('fill', '#475569')
        .attr('font-size', 12)
        .attr('font-weight', 600)
        .text(config.yAxisLabel);
    }
  }, [chartData, config.colors, config.height, config.xAxisLabel, config.yAxisLabel, gradientId, height, width]);

  if (chartData.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Trend data will appear here after the component captures a visualization in laboratory mode.
      </div>
    );
  }

  const title = config.title ?? config.yAxisLabel ?? 'Trend Analysis';

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col">
        <span className="text-sm font-medium text-muted-foreground">{config.xAxisLabel ?? 'Timeseries'}</span>
        <h4 className="text-xl font-semibold text-foreground">{title}</h4>
      </div>
      <div className="w-full overflow-hidden rounded-xl border border-border bg-background/80">
        <svg
          ref={svgRef}
          width="100%"
          height="100%"
          viewBox={`0 0 ${width} ${height}`}
          className="overflow-visible"
        />
      </div>
    </div>
  );
};

export default TrendAnalysisChart;
