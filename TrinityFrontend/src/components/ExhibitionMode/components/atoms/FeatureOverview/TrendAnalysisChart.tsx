import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import { ChartRendererConfig } from './shared';

type XValueType = 'date' | 'number' | 'category';

interface SeriesPoint {
  xValue: Date | number | string;
  xLabel: string;
  y: number;
}

interface TrendSeries {
  id: string;
  label: string;
  color: string;
  points: SeriesPoint[];
}

interface NormalisedChartData {
  series: TrendSeries[];
  xType: XValueType;
  xLabel?: string;
  yLabel?: string;
}

const DEFAULT_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f97316', '#ef4444'];

const toNumber = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const isValidDate = (value: Date) => Number.isFinite(value.getTime());

const parseXValue = (value: unknown, index: number): { type: XValueType; value: Date | number | string; label: string } => {
  if (value instanceof Date && isValidDate(value)) {
    return { type: 'date', value, label: value.toISOString() };
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return { type: 'number', value, label: String(value) };
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (trimmed.length > 0) {
      const parsedDate = new Date(trimmed);
      if (isValidDate(parsedDate)) {
        return { type: 'date', value: parsedDate, label: trimmed };
      }

      const parsedNumber = Number(trimmed);
      if (Number.isFinite(parsedNumber)) {
        return { type: 'number', value: parsedNumber, label: trimmed };
      }

      return { type: 'category', value: trimmed, label: trimmed };
    }
  }

  return { type: 'category', value: `#${index + 1}`, label: `#${index + 1}` };
};

const determineXType = (values: Array<{ type: XValueType }>): XValueType => {
  if (values.length === 0) {
    return 'category';
  }

  if (values.every(entry => entry.type === 'date')) {
    return 'date';
  }

  if (values.every(entry => entry.type === 'number')) {
    return 'number';
  }

  return 'category';
};

const humanize = (value: string) =>
  value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(.)/, (char: string) => char.toUpperCase());

const buildSeries = (config: ChartRendererConfig): NormalisedChartData => {
  const rows = Array.isArray(config.data) ? config.data : [];
  const xField = config.xField ?? 'index';
  const yFields = Array.isArray(config.yFields) && config.yFields.length > 0
    ? config.yFields.filter(field => typeof field === 'string' && field.length > 0)
    : [];
  const defaultYField = config.yField && typeof config.yField === 'string' ? config.yField : undefined;
  const legendField = typeof config.legendField === 'string' ? config.legendField : undefined;
  const palette = Array.isArray(config.colors) && config.colors.length > 0 ? config.colors : DEFAULT_COLORS;

  const xCandidates = rows.map((row, index) => parseXValue((row as Record<string, unknown>)[xField], index));
  const xType = determineXType(xCandidates);

  const seriesMap = new Map<string, TrendSeries>();

  const ensureSeries = (id: string, label: string, colorIndex: number) => {
    if (!seriesMap.has(id)) {
      seriesMap.set(id, {
        id,
        label,
        color: palette[colorIndex % palette.length],
        points: [],
      });
    }
    return seriesMap.get(id)!;
  };

  if (legendField) {
    const ySource = yFields.length > 0 ? yFields[0] : defaultYField ?? 'value';
    rows.forEach((row, index) => {
      const record = row as Record<string, unknown>;
      const rawY = record[ySource];
      const numericValue = toNumber(rawY);
      if (numericValue == null) {
        return;
      }

      const legendValue = record[legendField];
      const label = legendValue == null ? `Series ${seriesMap.size + 1}` : String(legendValue);
      const series = ensureSeries(label, humanize(label), seriesMap.size);

      const candidate = xCandidates[index];
      series.points.push({
        xValue: candidate.value,
        xLabel: candidate.label,
        y: numericValue,
      });
    });
  } else if (yFields.length > 1) {
    yFields.forEach((field, fieldIndex) => {
      const series = ensureSeries(field, humanize(field), fieldIndex);
      rows.forEach((row, index) => {
        const record = row as Record<string, unknown>;
        const numericValue = toNumber(record[field]);
        if (numericValue == null) {
          return;
        }

        const candidate = xCandidates[index];
        series.points.push({
          xValue: candidate.value,
          xLabel: candidate.label,
          y: numericValue,
        });
      });
    });
  } else {
    const field = defaultYField ?? yFields[0] ?? 'value';
    const series = ensureSeries('trend-series', config.title ?? humanize(field), 0);

    rows.forEach((row, index) => {
      const record = row as Record<string, unknown>;
      const numericValue = toNumber(record[field]);
      if (numericValue == null) {
        return;
      }

      const candidate = xCandidates[index];
      series.points.push({
        xValue: candidate.value,
        xLabel: candidate.label,
        y: numericValue,
      });
    });
  }

  const series = Array.from(seriesMap.values()).map(entry => ({
    ...entry,
    points:
      xType === 'date'
        ? [...entry.points].sort(
            (a, b) =>
              (a.xValue instanceof Date ? a.xValue.getTime() : Number(a.xValue)) -
              (b.xValue instanceof Date ? b.xValue.getTime() : Number(b.xValue)),
          )
        : xType === 'number'
        ? [...entry.points].sort((a, b) => (Number(a.xValue) || 0) - (Number(b.xValue) || 0))
        : entry.points,
  }));

  return {
    series: series.filter(entry => entry.points.length > 0),
    xType,
    xLabel: config.xAxisLabel,
    yLabel: config.yAxisLabel ?? config.title,
  };
};

const formatDateLabel = (value: Date): string => {
  const formatter = d3.timeFormat('%b %Y');
  return formatter(value);
};

const TrendAnalysisChart: React.FC<{ config: ChartRendererConfig }> = ({ config }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [width, setWidth] = useState<number>(600);

  const { series, xType, xLabel, yLabel } = useMemo(() => buildSeries(config), [config]);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const element = containerRef.current;

    if (typeof ResizeObserver === 'undefined') {
      const fallbackWidth = element.clientWidth;
      if (fallbackWidth > 0) {
        setWidth(fallbackWidth);
      }
      return undefined;
    }

    const observer = new ResizeObserver(entries => {
      const entry = entries[0];
      if (!entry) {
        return;
      }

      const nextWidth = entry.contentRect.width;
      if (Number.isFinite(nextWidth) && nextWidth > 0) {
        setWidth(nextWidth);
      }
    });

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current) {
      return;
    }

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const height = Math.max(config.height ?? 320, 240);
    const margin = { top: 24, right: 32, bottom: config.showAxisLabels === false ? 24 : 56, left: 64 };
    const innerWidth = Math.max(width - margin.left - margin.right, 120);
    const innerHeight = Math.max(height - margin.top - margin.bottom, 120);

    svg.attr('width', innerWidth + margin.left + margin.right);
    svg.attr('height', innerHeight + margin.top + margin.bottom);

    const chartGroup = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);

    const allPoints = series.flatMap(entry => entry.points);
    if (allPoints.length === 0) {
      return;
    }

    let xScale:
      | d3.ScaleLinear<number, number>
      | d3.ScalePoint<string>
      | d3.ScaleTime<number, number>;

    if (xType === 'date') {
      const extent = d3.extent(allPoints, point => (point.xValue as Date));
      const domain = extent[0] && extent[1] ? (extent as [Date, Date]) : [new Date(), new Date()];
      xScale = d3.scaleUtc(domain, [0, innerWidth]);
    } else if (xType === 'number') {
      const min = d3.min(allPoints, point => Number(point.xValue)) ?? 0;
      const max = d3.max(allPoints, point => Number(point.xValue)) ?? min + 1;
      const domain = min === max ? [min - 1, max + 1] : [min, max];
      xScale = d3.scaleLinear(domain, [0, innerWidth]);
    } else {
      const domain = Array.from(new Set(allPoints.map(point => String(point.xValue))));
      xScale = d3.scalePoint(domain, [0, innerWidth]).padding(0.5);
    }

    const maxY = d3.max(allPoints, point => point.y) ?? 0;
    const yScale = d3.scaleLinear()
      .domain([0, maxY === 0 ? 1 : maxY * 1.1])
      .range([innerHeight, 0])
      .nice();

    if (config.showGrid !== false) {
      chartGroup
        .append('g')
        .attr('class', 'trend-grid')
        .call(
          d3
            .axisLeft(yScale)
            .tickSize(-innerWidth)
            .tickFormat(() => ''),
        )
        .selectAll('line')
        .attr('stroke', '#e5e7eb')
        .attr('stroke-opacity', 0.4);
    }

    const xAxis =
      xType === 'date'
        ? d3
            .axisBottom(xScale as d3.ScaleTime<number, number>)
            .ticks(Math.min(6, allPoints.length))
            .tickFormat(value => formatDateLabel(value as Date))
        : xType === 'number'
        ? d3.axisBottom(xScale as d3.ScaleLinear<number, number>).ticks(Math.min(6, allPoints.length))
        : d3.axisBottom(xScale as d3.ScalePoint<string>);

    chartGroup
      .append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis as d3.Axis<d3.AxisDomain>)
      .selectAll('text')
      .attr('fill', '#4b5563')
      .style('font-size', '12px');

    const yAxis = d3.axisLeft(yScale).ticks(6).tickFormat(value => `${value}`);

    chartGroup
      .append('g')
      .call(yAxis as d3.Axis<d3.AxisDomain>)
      .selectAll('text')
      .attr('fill', '#4b5563')
      .style('font-size', '12px');

    const lineGenerator = d3
      .line<SeriesPoint>()
      .defined(point => Number.isFinite(point.y))
      .x(point => {
        if (xType === 'date') {
          return (xScale as d3.ScaleTime<number, number>)(point.xValue as Date);
        }
        if (xType === 'number') {
          return (xScale as d3.ScaleLinear<number, number>)(Number(point.xValue));
        }
        return (xScale as d3.ScalePoint<string>)(String(point.xValue)) ?? 0;
      })
      .y(point => yScale(point.y))
      .curve(d3.curveMonotoneX);

    series.forEach(entry => {
      chartGroup
        .append('path')
        .attr('class', `trend-series-${entry.id}`)
        .datum(entry.points)
        .attr('fill', 'none')
        .attr('stroke', entry.color)
        .attr('stroke-width', 3)
        .attr('d', lineGenerator);
    });

    if (config.showAxisLabels !== false) {
      if (xLabel) {
        chartGroup
          .append('text')
          .attr('class', 'x-axis-label')
          .attr('text-anchor', 'middle')
          .attr('x', innerWidth / 2)
          .attr('y', innerHeight + 40)
          .attr('fill', '#6b7280')
          .style('font-weight', 600)
          .text(xLabel);
      }

      if (yLabel) {
        chartGroup
          .append('text')
          .attr('class', 'y-axis-label')
          .attr('text-anchor', 'middle')
          .attr('transform', `rotate(-90)`)
          .attr('x', -innerHeight / 2)
          .attr('y', -48)
          .attr('fill', '#6b7280')
          .style('font-weight', 600)
          .text(yLabel);
      }
    }
  }, [config.height, config.showAxisLabels, config.showGrid, series, width, xLabel, xType, yLabel]);

  if (series.length === 0) {
    return (
      <div className="flex min-h-[280px] items-center justify-center text-sm text-muted-foreground">
        Trend analysis data was not captured for this component.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div ref={containerRef} className="w-full overflow-hidden">
        <svg ref={svgRef} role="img" aria-label={config.title ?? 'Trend analysis chart'} />
      </div>
      {config.showLegend !== false && series.length > 0 && (
        <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
          {series.map(entry => (
            <div key={entry.id} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span>{entry.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TrendAnalysisChart;
