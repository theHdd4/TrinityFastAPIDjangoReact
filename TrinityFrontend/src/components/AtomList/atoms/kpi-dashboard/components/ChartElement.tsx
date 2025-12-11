import React, { useMemo } from 'react';
import RechartsChartRenderer from '@/templates/charts/RechartsChartRenderer';
import { ChartMakerConfig } from '@/components/LaboratoryMode/store/laboratoryStore';
import { BarChart3 } from 'lucide-react';

interface ChartElementProps {
  chartConfig?: ChartMakerConfig;
  width?: number;
  height?: number;
}

const ChartElement: React.FC<ChartElementProps> = ({ 
  chartConfig, 
  width, 
  height = 300 
}) => {
  // If no chart config or chart not rendered, show placeholder
  if (!chartConfig || !chartConfig.chartRendered || !chartConfig.chartConfig) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 space-y-3">
        <BarChart3 className="w-8 h-8 text-blue-500" />
        <p className="text-sm font-medium text-foreground">Chart</p>
        <p className="text-xs text-muted-foreground text-center px-4">
          Configure and render a chart in the Charts tab to visualize data
        </p>
      </div>
    );
  }

  // Get chart data from rendered chart config
  const chartData = useMemo(() => {
    if (!chartConfig.chartConfig || !chartConfig.chartConfig.data) {
      return [];
    }
    return chartConfig.chartConfig.data;
  }, [chartConfig.chartConfig]);

  // Convert chart type from laboratory format to RechartsChartRenderer format
  const chartType = useMemo(() => {
    const type = chartConfig.type || 'line';
    const typeMap: Record<string, 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart' | 'stacked_bar_chart'> = {
      'bar': 'bar_chart',
      'line': 'line_chart',
      'pie': 'pie_chart',
      'area': 'area_chart',
      'scatter': 'scatter_chart',
      'stacked_bar': 'stacked_bar_chart',
    };
    return typeMap[type] || 'line_chart';
  }, [chartConfig.type]);

  // Determine yFields for dual axis support
  let yFields: string[] | undefined = undefined;
  let yAxisLabels: string[] | undefined = undefined;

  // PRIORITY: If secondYAxis exists, use dual-axis mode
  if (chartConfig.secondYAxis) {
    const yAxis = chartConfig.yAxis ? String(chartConfig.yAxis).trim() : '';
    const secondYAxis = String(chartConfig.secondYAxis).trim();
    
    if (yAxis && secondYAxis) {
      yFields = [yAxis, secondYAxis];
      yAxisLabels = [yAxis, secondYAxis];
    }
  }
  // Use traces if explicitly in advanced mode AND secondYAxis is NOT set
  else if (chartConfig.isAdvancedMode && chartConfig.traces && chartConfig.traces.length > 0) {
    yFields = chartConfig.traces.map((t: any) => t.dataKey || t.yAxis);
    yAxisLabels = chartConfig.traces.map((t: any) => t.name || t.dataKey || t.yAxis);
  }

  // Determine if we should force single axis rendering
  const shouldForceSingleAxis = chartConfig.dualAxisMode === 'single' && chartConfig.secondYAxis && String(chartConfig.secondYAxis || '').trim().length > 0;

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

  // Get saved chart configuration from rendered chart config
  const renderedChartConfig = chartConfig.chartConfig;
  
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
  const finalYField = finalYFields && finalYFields.length > 0 ? finalYFields[0] : chartConfig.yAxis;
  
  const rendererProps = {
    type: chartType,
    data: chartData,
    xField: chartConfig.xAxis,
    yField: finalYField,
    yFields: finalYFields,
    title: chartConfig.title,
    xAxisLabel: chartConfig.xAxis,
    yAxisLabel: chartConfig.yAxis,
    yAxisLabels: yAxisLabels,
    legendField: chartConfig.legendField && chartConfig.legendField !== 'aggregate' ? chartConfig.legendField : undefined,
    colors: renderedChartConfig?.colors || ['#3b82f6', '#8b5cf6', '#10b981', '#f97316', '#ef4444'],
    width: 0, // Use 0 to make chart responsive to container width
    height: height,
    theme: renderedChartConfig?.theme,
    showLegend: renderedChartConfig?.showLegend,
    showXAxisLabels: renderedChartConfig?.showXAxisLabels,
    showYAxisLabels: renderedChartConfig?.showYAxisLabels,
    showDataLabels: renderedChartConfig?.showDataLabels,
    showGrid: renderedChartConfig?.showGrid,
    sortOrder: renderedChartConfig?.sortOrder || null,
    sortColumn: renderedChartConfig?.sortColumn,
    enableScroll: renderedChartConfig?.enableScroll,
    chartsPerRow: renderedChartConfig?.chartsPerRow,
    forceSingleAxis: shouldForceSingleAxis,
    seriesSettings: renderedChartConfig?.seriesSettings,
    showNote: false, // Note box is rendered in ChartElement, not RechartsChartRenderer
  };

  const showNote = chartConfig.showNote || false;
  
  return (
    <div className={`w-full h-full ${showNote ? 'flex flex-col' : 'flex items-center justify-center'}`} style={{ maxHeight: '100%', maxWidth: '100%', padding: '8px', minWidth: 0, minHeight: 0 }}>
      <div className={`w-full ${showNote ? 'flex-1 min-h-0' : 'h-full'}`} style={{ maxWidth: '100%', maxHeight: showNote ? '100%' : '100%', overflow: 'hidden', minWidth: 0, minHeight: 0, width: '100%' }}>
        <RechartsChartRenderer {...rendererProps} />
      </div>
      {showNote && (
        <div className="mt-2 p-2 bg-gray-50 border border-gray-200 rounded-lg flex-shrink-0">
          <textarea
            placeholder="Add your notes here..."
            className="w-full min-h-[60px] p-2 text-xs border border-gray-300 rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{ fontFamily: 'inherit' }}
          />
        </div>
      )}
    </div>
  );
};

export default ChartElement;

