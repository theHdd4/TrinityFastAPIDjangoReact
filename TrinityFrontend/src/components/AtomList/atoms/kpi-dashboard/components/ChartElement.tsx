import React, { useMemo } from 'react';
import RechartsChartRenderer from '@/templates/charts/RechartsChartRenderer';
import { ChartMakerMetadata } from '@/components/ExhibitionMode/components/atoms/ChartMaker/types';
import { getFilteredData } from '@/components/ExhibitionMode/components/atoms/ChartMaker/shared';
import { BarChart3 } from 'lucide-react';

interface ChartElementProps {
  chartMetadata?: ChartMakerMetadata;
  width?: number;
  height?: number;
}

const ChartElement: React.FC<ChartElementProps> = ({ 
  chartMetadata, 
  width, 
  height = 300 
}) => {
  // If no chart metadata, show placeholder
  if (!chartMetadata || !chartMetadata.chartState) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 space-y-3">
        <BarChart3 className="w-8 h-8 text-blue-500" />
        <p className="text-sm font-medium text-foreground">Chart</p>
        <p className="text-xs text-muted-foreground text-center px-4">
          Import a chart from Chart Maker to visualize data
        </p>
      </div>
    );
  }

  const chartState = chartMetadata.chartState;
  const chartContext = chartMetadata.chartContext;

  // Prepare data for RechartsChartRenderer
  const chartData = useMemo(() => {
    if (!chartState || !chartContext) {
      return [];
    }
    return getFilteredData(chartState, chartContext);
  }, [chartState, chartContext]);

  // Convert chart type from laboratory format to RechartsChartRenderer format
  const chartType = useMemo(() => {
    const type = chartState?.chartType || 'line';
    const typeMap: Record<string, 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart' | 'stacked_bar_chart'> = {
      'bar': 'bar_chart',
      'line': 'line_chart',
      'pie': 'pie_chart',
      'area': 'area_chart',
      'scatter': 'scatter_chart',
      'stacked_bar': 'stacked_bar_chart',
    };
    return typeMap[type] || 'line_chart';
  }, [chartState?.chartType]);

  // Determine yFields for dual axis support
  let yFields: string[] | undefined = undefined;
  let yAxisLabels: string[] | undefined = undefined;

  if (chartState) {
    const traces = chartState.traces || [];
    const isAdvancedMode = chartState.isAdvancedMode === true;
    
    // PRIORITY: If secondYAxis exists, use dual-axis mode
    if (chartState.secondYAxis) {
      const yAxis = chartState.yAxis ? String(chartState.yAxis).trim() : '';
      const secondYAxis = String(chartState.secondYAxis).trim();
      
      if (yAxis && secondYAxis) {
        yFields = [yAxis, secondYAxis];
        yAxisLabels = [yAxis, secondYAxis];
      }
    }
    // Use traces if explicitly in advanced mode AND secondYAxis is NOT set
    else if (isAdvancedMode && traces.length > 0) {
      yFields = traces.map((t: any) => t.dataKey || t.yAxis);
      yAxisLabels = traces.map((t: any) => t.name || t.dataKey || t.yAxis);
    }
  }

  // Determine if we should force single axis rendering
  const shouldForceSingleAxis = chartState?.dualAxisMode === 'single' && chartState?.secondYAxis && String(chartState.secondYAxis || '').trim().length > 0;

  if (!chartData || chartData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 space-y-3">
        <BarChart3 className="w-8 h-8 text-blue-500" />
        <p className="text-sm font-medium text-foreground">No Chart Data</p>
        <p className="text-xs text-muted-foreground text-center px-4">
          Chart data is not available. Please import a chart with data.
        </p>
      </div>
    );
  }

  // Get saved chart configuration from chartConfig
  const chartConfig = chartContext?.chartConfig;
  
  // Map yFields to actual column names in the data
  let mappedYFields = yFields;
  if (yFields && yFields.length > 1 && chartData.length > 0) {
    const firstRow = chartData[0];
    const dataKeys = firstRow ? Object.keys(firstRow) : [];
    
    mappedYFields = yFields.map((yField) => {
      if (dataKeys.includes(yField)) {
        return yField;
      }
      const matchingKey = dataKeys.find(key => key.startsWith(yField + '_') || key === yField);
      if (matchingKey) {
        return matchingKey;
      }
      return yField;
    });
  }
  
  const finalYFields = mappedYFields || yFields;
  const finalYField = finalYFields && finalYFields.length > 0 ? finalYFields[0] : chartState.yAxis;
  
  const rendererProps = {
    type: chartType,
    data: chartData,
    xField: chartState.xAxis,
    yField: finalYField,
    yFields: finalYFields,
    title: chartMetadata.chartTitle,
    xAxisLabel: chartState.xAxis,
    yAxisLabel: chartState.yAxis,
    yAxisLabels: yAxisLabels,
    legendField: chartState.legendField && chartState.legendField !== 'aggregate' ? chartState.legendField : undefined,
    colors: chartConfig?.colors || ['#3b82f6', '#8b5cf6', '#10b981', '#f97316', '#ef4444'],
    width: width || 0,
    height: height,
    theme: chartConfig?.theme,
    showLegend: chartConfig?.showLegend,
    showXAxisLabels: chartConfig?.showXAxisLabels,
    showYAxisLabels: chartConfig?.showYAxisLabels,
    showDataLabels: chartConfig?.showDataLabels,
    showGrid: chartConfig?.showGrid,
    sortOrder: chartConfig?.sortOrder || null,
    sortColumn: chartConfig?.sortColumn,
    enableScroll: chartConfig?.enableScroll,
    chartsPerRow: chartConfig?.chartsPerRow,
    forceSingleAxis: shouldForceSingleAxis,
    seriesSettings: chartConfig?.seriesSettings,
  };

  return (
    <div className="w-full h-full flex items-center justify-center p-2">
      <div style={{ width: '100%', height: `${height}px`, maxWidth: '100%' }}>
        <RechartsChartRenderer {...rendererProps} />
      </div>
    </div>
  );
};

export default ChartElement;

