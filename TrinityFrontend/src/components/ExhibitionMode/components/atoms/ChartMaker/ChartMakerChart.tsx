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

  // Determine yFields for dual axis support (same logic as Laboratory Mode)
  let yFields: string[] | undefined = undefined;
  let yAxisLabels: string[] | undefined = undefined;

  if (chartState) {
    const traces = chartState.traces || [];
    const isAdvancedMode = chartState.isAdvancedMode === true;
    
    // PRIORITY: If secondYAxis exists, use dual-axis mode (simple mode)
    // This takes precedence over traces unless explicitly in advanced mode with multiple traces
    if (chartState.secondYAxis) {
      const yAxis = chartState.yAxis ? String(chartState.yAxis).trim() : '';
      const secondYAxis = String(chartState.secondYAxis).trim();
      
      console.log('🔍 ChartMakerChart - Dual axis branch (PRIORITY):', { 
        yAxis, 
        secondYAxis, 
        yAxisValid: !!yAxis, 
        secondYAxisValid: !!secondYAxis,
        isAdvancedMode,
        tracesLength: traces.length,
      });
      
      // Both axes must be non-empty strings
      if (yAxis && secondYAxis) {
        yFields = [yAxis, secondYAxis];
        yAxisLabels = [yAxis, secondYAxis];
        console.log('🔍 ChartMakerChart - Set yFields to:', yFields);
      } else {
        console.log('🔍 ChartMakerChart - Failed validation, yFields not set');
      }
    }
    // Only use traces if explicitly in advanced mode AND secondYAxis is NOT set
    else if (isAdvancedMode && traces.length > 0) {
      // Advanced mode: use traces
      yFields = traces.map((t: any) => t.dataKey || t.yAxis);
      yAxisLabels = traces.map((t: any) => t.name || t.dataKey || t.yAxis);
      console.log('🔍 ChartMakerChart - Using traces mode (advanced):', { tracesLength: traces.length, yFields });
    } else {
      console.log('🔍 ChartMakerChart - No secondYAxis, single axis mode');
    }
  }

  // Determine if we should force single axis rendering
  const shouldForceSingleAxis = chartState?.dualAxisMode === 'single' && chartState?.secondYAxis && String(chartState.secondYAxis || '').trim().length > 0;

  // Debug logging (after yFields is determined)
  if (chartState?.secondYAxis) {
    console.log('🔍 ChartMakerChart - Dual axis detected:', {
      secondYAxis: chartState.secondYAxis,
      yAxis: chartState.yAxis,
      dualAxisMode: chartState.dualAxisMode,
      yFields,
      yAxisLabels,
      shouldForceSingleAxis,
      tracesLength: chartState.traces?.length || 0,
      conditionCheck: {
        hasSecondYAxis: !!chartState.secondYAxis,
        hasYAxis: !!chartState.yAxis,
        yAxisTrimmed: chartState.yAxis ? String(chartState.yAxis).trim() : '',
        secondYAxisTrimmed: chartState.secondYAxis ? String(chartState.secondYAxis).trim() : '',
      },
    });
  }

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
  
  // Map yFields to actual column names in the data (backend may add _trace_0, _trace_1 suffixes)
  let mappedYFields = yFields;
  if (yFields && yFields.length > 1 && chartData.length > 0) {
    const firstRow = chartData[0];
    const dataKeys = firstRow ? Object.keys(firstRow) : [];
    
    // Try to find columns that match the yField names (exact match or with _trace_ suffix)
    mappedYFields = yFields.map((yField) => {
      // First try exact match
      if (dataKeys.includes(yField)) {
        return yField;
      }
      // Then try to find column that starts with yField name (e.g., TV_Reach_trace_0)
      const matchingKey = dataKeys.find(key => key.startsWith(yField + '_') || key === yField);
      if (matchingKey) {
        console.log(`🔍 ChartMakerChart - Mapped ${yField} to ${matchingKey}`);
        return matchingKey;
      }
      return yField; // Fallback to original if not found
    });
    
    console.log('🔍 ChartMakerChart - Data check:', {
      originalYFields: yFields,
      mappedYFields,
      firstRowKeys: dataKeys,
      firstRow: firstRow,
    });
  }
  
  // Prepare props for RechartsChartRenderer (same format as Laboratory Mode)
  // Use mappedYFields if available, otherwise fall back to yFields
  const finalYFields = mappedYFields || yFields;
  // Use the first mapped Y field for yField prop (for backward compatibility)
  const finalYField = finalYFields && finalYFields.length > 0 ? finalYFields[0] : chartState.yAxis;
  
  const rendererProps = {
    type: chartType,
    data: chartData,
    xField: chartState.xAxis,
    yField: finalYField,
    yFields: finalYFields,
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
    forceSingleAxis: shouldForceSingleAxis,
  };
  
  // Debug: Log renderer props
  if (finalYFields && finalYFields.length > 1) {
    // Verify both columns exist in data
    const firstRow = chartData[0];
    const hasBothColumns = firstRow && 
      finalYFields[0] in firstRow && 
      finalYFields[1] in firstRow;
    
    console.log('🔍 ChartMakerChart - Renderer props:', {
      originalYFields: yFields,
      mappedYFields: finalYFields,
      yAxisLabels,
      forceSingleAxis: shouldForceSingleAxis,
      dataLength: chartData.length,
      yField: finalYField,
      hasBothColumns,
      firstRowSample: firstRow ? {
        [finalYFields[0]]: firstRow[finalYFields[0]],
        [finalYFields[1]]: firstRow[finalYFields[1]],
      } : null,
    });
  }

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
