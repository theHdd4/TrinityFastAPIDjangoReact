import React, { useMemo } from 'react';
import RechartsChartRenderer from '@/templates/charts/RechartsChartRenderer';
import { EvaluateModelsFeatureComponentProps } from './types';

const DEFAULT_CHART_HEIGHT = {
  full: 400,
  compact: 280,
} as const;

const EvaluateModelsFeatureChart: React.FC<EvaluateModelsFeatureComponentProps> = ({ 
  metadata, 
  variant = 'full' 
}) => {
  const { graphState, graphContext } = metadata;

  // Extract chart data and configuration from the metadata
  const chartData = useMemo(() => {
    if (!graphContext?.chartData) {
      return [];
    }
    return graphContext.chartData;
  }, [graphContext]);

  const chartType = useMemo(() => {
    if (!graphState) {
      return 'bar_chart';
    }
    
    // If chartTypePreference is provided, use it (from laboratory settings)
    if (graphState.chartTypePreference) {
      return graphState.chartTypePreference;
    }
    
    // Fallback: Map graph types to Recharts chart types
    const graphTypeMap: Record<string, 'bar_chart' | 'line_chart' | 'area_chart' | 'pie_chart' | 'scatter_chart'> = {
      'waterfall': 'bar_chart',
      'elasticity': 'bar_chart',
      'contribution': 'bar_chart',
      'roi': 'bar_chart',
      'beta': 'bar_chart',
      'actual-vs-predicted': 'line_chart',
      's-curve': 'line_chart',
      'averages': 'bar_chart',
    };
    
    return graphTypeMap[graphState.graphType] || 'bar_chart';
  }, [graphState]);


  if (!chartData || chartData.length === 0) {
    return (
      <div className={`rounded-2xl border border-border bg-background/80 shadow-sm ${variant === 'compact' ? 'p-3' : 'p-6'}`}>
        <div className="flex min-h-[280px] items-center justify-center text-sm text-muted-foreground">
          Chart data will appear here after exporting from laboratory mode.
        </div>
      </div>
    );
  }

  // Prepare props for RechartsChartRenderer
  const rendererProps = useMemo(() => {
    // Set field names based on chart type
    let xField = 'name';
    let yField = 'value';
    let xAxisLabel = 'Period';
    let yAxisLabel = 'Value';

    if (graphState?.graphType === 'actual-vs-predicted') {
      xField = 'actual';
      yField = 'predicted';
      xAxisLabel = 'Actual';
      yAxisLabel = 'Predicted';
    }

    // Get chart configuration from graphContext
    const chartConfig = graphContext?.chartConfig;

    return {
      type: chartConfig?.chartType || chartType,
      data: chartData,
      xField,
      yField,
      title: metadata.graphTitle,
      xAxisLabel,
      yAxisLabel,
      colors: ['#3b82f6', '#8b5cf6', '#10b981', '#f97316', '#ef4444'],
      height: DEFAULT_CHART_HEIGHT[variant],
      showLegend: chartConfig?.showLegend !== undefined ? chartConfig.showLegend : true,
      showAxisLabels: chartConfig?.showAxisLabels !== undefined ? chartConfig.showAxisLabels : true,
      showGrid: chartConfig?.showGrid !== undefined ? chartConfig.showGrid : true,
      showDataLabels: chartConfig?.showDataLabels !== undefined ? chartConfig.showDataLabels : false,
      theme: chartConfig?.theme || 'default',
      sortOrder: chartConfig?.sortOrder || null,
    };
  }, [chartType, chartData, metadata.graphTitle, variant, graphState?.graphType, graphContext?.chartConfig]);

  return (
    <div 
      className={`rounded-2xl border border-border bg-background/80 shadow-sm ${variant === 'compact' ? 'p-3' : 'p-6'}`}
      onContextMenu={(e) => {
        // Prevent context menu in ExhibitionMode to match ChartMaker and FeatureOverview behavior
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

export default EvaluateModelsFeatureChart;
