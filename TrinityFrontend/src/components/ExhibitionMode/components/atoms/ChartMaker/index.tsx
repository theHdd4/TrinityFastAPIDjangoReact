import React, { useMemo } from 'react';
import ChartMakerChart from './ChartMakerChart';
import { DEFAULT_CHART_MAKER_METADATA, parseChartMakerMetadata } from './shared';
import { ChartMakerComponentProps, ChartMakerProps } from './types';

const ChartMaker: React.FC<ChartMakerProps> = ({ metadata, variant = 'full' }) => {
  const parsedMetadata = useMemo(() => parseChartMakerMetadata(metadata), [metadata]);
  const resolvedMetadata = parsedMetadata ?? DEFAULT_CHART_MAKER_METADATA;

  // Check if we have multiple charts in the charts array
  const chartsArray = Array.isArray((metadata as any)?.charts) ? (metadata as any).charts : [];
  const hasMultipleCharts = chartsArray.length > 1;

  // If multiple charts, render each separately with numbering
  if (hasMultipleCharts) {
    return (
      <div className="flex flex-col gap-6 sm:gap-8">
        {chartsArray.map((chart: any, index: number) => {
          // Create metadata for this specific chart
          const chartMetadata = {
            ...resolvedMetadata,
            chartId: chart.id || resolvedMetadata.chartId,
            chartTitle: `Chart ${index + 1}: ${chart.title || resolvedMetadata.chartTitle || 'Untitled Chart'}`,
            chartState: {
              ...resolvedMetadata.chartState,
              chartType: (chart.type || resolvedMetadata.chartState?.chartType || 'line') as any,
              xAxis: chart.xAxis || resolvedMetadata.chartState?.xAxis || '',
              yAxis: chart.yAxis || resolvedMetadata.chartState?.yAxis || '',
              secondYAxis: chart.secondYAxis || resolvedMetadata.chartState?.secondYAxis,
              dualAxisMode: chart.dualAxisMode || resolvedMetadata.chartState?.dualAxisMode,
              filters: (chart.filters && typeof chart.filters === 'object' && !Array.isArray(chart.filters))
                ? chart.filters
                : (resolvedMetadata.chartState?.filters || {}),
              aggregation: chart.aggregation || resolvedMetadata.chartState?.aggregation || 'sum',
              legendField: chart.legendField || resolvedMetadata.chartState?.legendField,
              isAdvancedMode: chart.isAdvancedMode || resolvedMetadata.chartState?.isAdvancedMode || false,
              traces: Array.isArray(chart.traces) ? chart.traces : resolvedMetadata.chartState?.traces,
              note: typeof chart.note === 'string' ? chart.note : resolvedMetadata.chartState?.note,
            },
            chartContext: {
              ...resolvedMetadata.chartContext,
              dataSource: (metadata as any)?.dataSource || (metadata as any)?.fileId || resolvedMetadata.chartContext?.dataSource,
              uploadedData: (metadata as any)?.uploadedData || resolvedMetadata.chartContext?.uploadedData,
              chartConfig: {
                data: chart.chartConfig?.data || chart.filteredData || resolvedMetadata.chartContext?.chartConfig?.data || [],
                theme: chart.chartConfig?.theme || resolvedMetadata.chartContext?.chartConfig?.theme,
                showLegend: chart.chartConfig?.showLegend !== undefined ? chart.chartConfig.showLegend : resolvedMetadata.chartContext?.chartConfig?.showLegend,
                showXAxisLabels: chart.chartConfig?.showXAxisLabels !== undefined ? chart.chartConfig.showXAxisLabels : resolvedMetadata.chartContext?.chartConfig?.showXAxisLabels,
                showYAxisLabels: chart.chartConfig?.showYAxisLabels !== undefined ? chart.chartConfig.showYAxisLabels : resolvedMetadata.chartContext?.chartConfig?.showYAxisLabels,
                showDataLabels: chart.chartConfig?.showDataLabels !== undefined ? chart.chartConfig.showDataLabels : resolvedMetadata.chartContext?.chartConfig?.showDataLabels,
                showGrid: chart.chartConfig?.showGrid !== undefined ? chart.chartConfig.showGrid : resolvedMetadata.chartContext?.chartConfig?.showGrid,
                sortOrder: chart.sortOrder || chart.chartConfig?.sortOrder || resolvedMetadata.chartContext?.chartConfig?.sortOrder || null,
                sortColumn: chart.sortColumn || chart.chartConfig?.sortColumn || resolvedMetadata.chartContext?.chartConfig?.sortColumn,
                colors: chart.chartConfig?.colors || resolvedMetadata.chartContext?.chartConfig?.colors,
                seriesSettings: chart.chartConfig?.seriesSettings || resolvedMetadata.chartContext?.chartConfig?.seriesSettings,
              },
            },
          };

          const componentProps: ChartMakerComponentProps = {
            metadata: chartMetadata,
            variant: (variant === 'compact' || variant === 'full') ? variant : 'full',
          };

          return <ChartMakerChart key={chart.id || index} {...componentProps} />;
        })}
      </div>
    );
  }

  // Single chart - use existing logic
  const componentProps: ChartMakerComponentProps = {
    metadata: resolvedMetadata,
    variant: (variant === 'compact' || variant === 'full') ? variant : 'full',
  };

  return <ChartMakerChart {...componentProps} />;
};

export default ChartMaker;