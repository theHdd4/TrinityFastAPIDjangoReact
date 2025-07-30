import { ChartMakerConfig, ChartTraceConfig } from '@/components/LaboratoryMode/store/laboratoryStore';
import { ChartTrace } from '@/services/chartMakerApi';

// Default color palette for traces - matches backend colors
export const DEFAULT_TRACE_COLORS = [
  '#8884d8', // blue (matches backend first color)
  '#82ca9d', // green
  '#ffc658', // yellow
  '#ff7300', // orange
  '#8dd1e1', // light blue
  '#d084d0', // purple
  '#6366f1', // modern indigo
  '#06b6d4', // modern cyan  
  '#ef4444', // modern red
  '#10b981', // modern emerald
];

// Convert legacy single yAxis/filters to traces format
export const migrateLegacyChart = (chart: ChartMakerConfig): ChartMakerConfig => {
  if (chart.traces && chart.traces.length > 0) {
    // Already in new format
    return chart;
  }

  // Preserve existing mode preference if set, otherwise default to simple
  const isAdvancedMode = chart.isAdvancedMode ?? false;

  if (!chart.yAxis) {
    // No Y-axis selected yet - return empty traces but preserve mode
    return { ...chart, traces: [], isAdvancedMode };
  }

  // Convert legacy format to traces
  const legacyTrace: ChartTraceConfig = {
    yAxis: chart.yAxis,
    name: chart.yAxis,
    filters: chart.filters || {},
    color: DEFAULT_TRACE_COLORS[0],
    aggregation: 'sum',
  };

  return {
    ...chart,
    traces: [legacyTrace],
    isAdvancedMode,
  };
};

// Convert traces to API format
export const buildTracesForAPI = (chart: ChartMakerConfig): ChartTrace[] => {
  if (chart.isAdvancedMode && chart.traces && chart.traces.length > 0) {
    // Use advanced mode traces with individual filters
    return chart.traces.map((trace, index) => ({
      x_column: chart.xAxis,
      y_column: trace.yAxis,
      name: trace.name || trace.yAxis,
      chart_type: chart.type,
      aggregation: trace.aggregation || 'sum',
      color: trace.color || DEFAULT_TRACE_COLORS[index % DEFAULT_TRACE_COLORS.length],
      filters: trace.filters || {}, // Include trace-specific filters
    }));
  }

  // Fallback to legacy single trace
  if (!chart.yAxis) return [];
  
  return [{
    x_column: chart.xAxis,
    y_column: chart.yAxis,
    name: chart.title,
    chart_type: chart.type,
    aggregation: 'sum',
  }];
};

// Merge filters from all traces for API call
export const mergeTraceFilters = (chart: ChartMakerConfig): Record<string, string[]> => {
  if (chart.isAdvancedMode && chart.traces && chart.traces.length > 0) {
    // For advanced mode, combine all trace filters
    const mergedFilters: Record<string, string[]> = {};
    
    chart.traces.forEach(trace => {
      Object.entries(trace.filters || {}).forEach(([column, values]) => {
        if (!mergedFilters[column]) {
          mergedFilters[column] = [];
        }
        // Union of all values (no duplicates)
        values.forEach(value => {
          if (!mergedFilters[column].includes(value)) {
            mergedFilters[column].push(value);
          }
        });
      });
    });
    
    return mergedFilters;
  }

  // Fallback to legacy filters
  return chart.filters || {};
};

// Validate chart configuration
export const validateChart = (chart: ChartMakerConfig): boolean => {
  if (!chart.xAxis) return false;

  if (chart.isAdvancedMode) {
    return chart.traces && chart.traces.length > 0 && 
           chart.traces.every(trace => trace.yAxis);
  }

  return !!chart.yAxis;
};

// Add a new trace to a chart
export const addTrace = (chart: ChartMakerConfig, yAxis: string = ''): ChartMakerConfig => {
  const existingTraces = chart.traces || [];
  const colorIndex = existingTraces.length % DEFAULT_TRACE_COLORS.length;
  
  const newTrace: ChartTraceConfig = {
    yAxis,
    name: yAxis || `Trace ${existingTraces.length + 1}`,
    filters: {},
    color: DEFAULT_TRACE_COLORS[colorIndex],
    aggregation: 'sum',
  };

  return {
    ...chart,
    traces: [...existingTraces, newTrace],
    chartRendered: false, // Reset render status when adding traces
  };
};

// Remove a trace from a chart
export const removeTrace = (chart: ChartMakerConfig, traceIndex: number): ChartMakerConfig => {
  if (!chart.traces || traceIndex < 0 || traceIndex >= chart.traces.length) {
    return chart;
  }

  const newTraces = chart.traces.filter((_, index) => index !== traceIndex);
  
  return {
    ...chart,
    traces: newTraces,
    chartRendered: false, // Reset render status when removing traces
  };
};

// Update a specific trace
export const updateTrace = (
  chart: ChartMakerConfig, 
  traceIndex: number, 
  updates: Partial<ChartTraceConfig>
): ChartMakerConfig => {
  if (!chart.traces || traceIndex < 0 || traceIndex >= chart.traces.length) {
    return chart;
  }

  const newTraces = [...chart.traces];
  newTraces[traceIndex] = { ...newTraces[traceIndex], ...updates };

  return {
    ...chart,
    traces: newTraces,
    chartRendered: false, // Reset render status when updating traces
  };
};

// Switch between simple and advanced mode
export const toggleChartMode = (chart: ChartMakerConfig): ChartMakerConfig => {
  const migratedChart = migrateLegacyChart(chart);
  
  if (migratedChart.isAdvancedMode) {
    // Switch to simple mode - use first trace as legacy values
    const firstTrace = migratedChart.traces?.[0];
    return {
      ...migratedChart,
      isAdvancedMode: false,
      yAxis: firstTrace?.yAxis || '',
      filters: firstTrace?.filters || {},
    };
  } else {
    // Switch to advanced mode
    const newChart = {
      ...migratedChart,
      isAdvancedMode: true,
    };
    
    // If no traces exist yet, add one empty trace to get started
    if (!newChart.traces || newChart.traces.length === 0) {
      return addTrace(newChart, '');
    }
    
    return newChart;
  }
};
