import React, { useMemo } from 'react';
import RechartsChartRenderer from '@/templates/charts/RechartsChartRenderer';
import { ChartMakerComponentProps } from './types';
import { DEFAULT_CHART_HEIGHT, getFilteredData } from './shared';

const ChartMakerChart: React.FC<ChartMakerComponentProps> = ({ metadata, variant }) => {
  const chartState = metadata.chartState;

  // Prepare data for RechartsChartRenderer (same format as Laboratory Mode)
  const chartData = useMemo(() => {
    if (!chartState || !metadata.chartContext) {
      return [];
    }
    return getFilteredData(chartState, metadata.chartContext);
  }, [chartState, metadata.chartContext]);

  // Convert chart type from laboratory format to RechartsChartRenderer format
  const chartType = useMemo(() => {
    const type = chartState?.chartType || 'line';
    const typeMap: Record<string, 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart'> = {
      'bar': 'bar_chart',
      'line': 'line_chart',
      'pie': 'pie_chart',
      'area': 'area_chart',
      'scatter': 'scatter_chart',
    };
    return typeMap[type] || 'line_chart';
  }, [chartState?.chartType]);

  // Get traces from chartConfig (same as Laboratory Mode)
  const yFields = undefined; // Let renderer use single yField
  const yAxisLabels = undefined;

  if (!chartState) {
    return (
      <div className={`rounded-2xl border border-border bg-background/80 shadow-sm ${variant === 'compact' ? 'p-3' : 'p-6'}`}>
        <div className="flex min-h-[280px] items-center justify-center text-sm text-muted-foreground">
          Chart data will appear here after exporting from laboratory mode.
        </div>
      </div>
    );
  }

  if (!chartData || chartData.length === 0) {
    return (
      <div className={`rounded-2xl border border-border bg-background/80 shadow-sm ${variant === 'compact' ? 'p-3' : 'p-6'}`}>
        <div className="flex min-h-[280px] items-center justify-center text-sm text-muted-foreground">
          Chart data will appear here after exporting from laboratory mode.
        </div>
      </div>
    );
  }

  // Get saved chart configuration from chartConfig
  const chartConfig = metadata.chartContext?.chartConfig;
  
  // Prepare props for RechartsChartRenderer (same format as Laboratory Mode)
  const rendererProps = {
    type: chartType,
    data: chartData,
    xField: chartState.xAxis,
    yField: chartState.yAxis,
    yFields: yFields,
    title: metadata.chartTitle,
    xAxisLabel: chartState.xAxis,
    yAxisLabel: chartState.yAxis,
    yAxisLabels: yAxisLabels,
    legendField: chartState.legendField && chartState.legendField !== 'aggregate' ? chartState.legendField : undefined,
    colors: chartConfig?.colors || ['#3b82f6', '#8b5cf6', '#10b981', '#f97316', '#ef4444'],
    height: DEFAULT_CHART_HEIGHT[variant],
    theme: chartConfig?.theme,
    showLegend: chartConfig?.showLegend,
    // showAxisLabels: chartConfig?.showAxisLabels,
    showXAxisLabels: chartConfig?.showXAxisLabels,
    showYAxisLabels: chartConfig?.showYAxisLabels,
    showDataLabels: chartConfig?.showDataLabels,
    showGrid: chartConfig?.showGrid,
    sortOrder: chartConfig?.sortOrder || null,
    sortColumn: chartConfig?.sortColumn,
    enableScroll: chartConfig?.enableScroll,
    chartsPerRow: chartConfig?.chartsPerRow,
  };

  return (
    <div 
      className={`rounded-2xl border border-border bg-background/80 shadow-sm ${variant === 'compact' ? 'p-3' : 'p-6'}`}
      onContextMenu={(e) => {
        // Prevent context menu in ExhibitionMode to match FeatureOverview behavior
        e.preventDefault();
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
      }}
      onContextMenuCapture={(e) => {
        // Additional capture phase prevention for context menu
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div style={{ width: '100%', height: DEFAULT_CHART_HEIGHT[variant] }}>
        <RechartsChartRenderer {...rendererProps} />
      </div>
    </div>
  );
};

export default ChartMakerChart;
