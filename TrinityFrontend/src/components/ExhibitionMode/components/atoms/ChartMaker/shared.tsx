import { ChartMakerMetadata } from './types';
import { ChartMakerExhibitionSelectionChartState } from '@/components/LaboratoryMode/store/laboratoryStore';

// Default chart height constants similar to FeatureOverview
export const DEFAULT_CHART_HEIGHT = {
  full: 400, // Increased height for better visibility
  compact: 280, // Smaller for compact variant
} as const;

// Default metadata similar to FeatureOverview's DEFAULT_FEATURE_OVERVIEW_TREND_METADATA
export const DEFAULT_CHART_MAKER_METADATA: ChartMakerMetadata = {
  chartTitle: 'Untitled Chart',
  chartState: {
    chartType: 'line',
    xAxis: '',
    yAxis: '',
    filters: {},
    aggregation: 'sum',
    legendField: 'aggregate',
    isAdvancedMode: false,
    traces: [],
  },
  chartContext: {
    dataSource: '',
    uploadedData: null,
  },
  capturedAt: new Date().toISOString(),
  sourceAtomTitle: 'Chart Maker',
};

// Helper function to check if value is a record/object
const isRecord = (value: unknown): value is Record<string, unknown> => {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
};

// Helper function to ensure array of records
const ensureRecordArray = (value: unknown): Array<Record<string, unknown>> => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord);
};

// Parse metadata similar to FeatureOverview's parseFeatureOverviewMetadata
export const parseChartMakerMetadata = (metadata: unknown): ChartMakerMetadata | null => {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  // Handle nested metadata structure that comes from MongoDB (similar to FeatureOverview)
  const nested = (metadata as any).metadata && typeof (metadata as any).metadata === 'object'
    ? { ...metadata, ...(metadata as any).metadata }
    : metadata;

  const result: ChartMakerMetadata = {};

  // First, try to extract from top-level metadata
  const chartId = typeof nested.chartId === 'string' ? nested.chartId : 
                  typeof nested.chart_id === 'string' ? nested.chart_id :
                  typeof nested.id === 'string' ? nested.id : undefined;
  if (chartId) {
    result.chartId = chartId;
  }

  const chartTitle = typeof nested.chartTitle === 'string' ? nested.chartTitle :
                     typeof nested.chart_title === 'string' ? nested.chart_title :
                     typeof nested.title === 'string' ? nested.title : undefined;
  if (chartTitle) {
    result.chartTitle = chartTitle;
  }

  if (nested.chartState && typeof nested.chartState === 'object') {
    result.chartState = nested.chartState as ChartMakerExhibitionSelectionChartState;
  } else if (nested.chart_state && typeof nested.chart_state === 'object') {
    // Handle MongoDB field naming variations
    result.chartState = nested.chart_state as ChartMakerExhibitionSelectionChartState;
  }

  if (nested.chartContext && typeof nested.chartContext === 'object') {
    result.chartContext = nested.chartContext;
  } else if (nested.chart_context && typeof nested.chart_context === 'object') {
    // Handle MongoDB field naming variations
    result.chartContext = nested.chart_context;
  }

  const capturedAt = typeof nested.capturedAt === 'string' ? nested.capturedAt : undefined;
  if (capturedAt) {
    result.capturedAt = capturedAt;
  }

  const sourceAtomTitle = typeof nested.sourceAtomTitle === 'string' ? nested.sourceAtomTitle : undefined;
  if (sourceAtomTitle) {
    result.sourceAtomTitle = sourceAtomTitle;
  }

  // ✅ NEW: Check exhibitionSelections array (similar to FeatureOverview)
  // This is where Chart Maker stores chart data when saved from Laboratory Mode
  const selections = ensureRecordArray(nested.exhibitionSelections ?? nested['exhibition_selections']);
  const primarySelection = selections[0];
  const selection = primarySelection && isRecord(primarySelection.metadata)
    ? { ...primarySelection, ...(primarySelection.metadata as Record<string, unknown>) }
    : primarySelection;

  // Extract from selection if not found at top level
  if (selection) {
    // Chart ID
    if (!result.chartId) {
      const selectionChartId = typeof selection.chartId === 'string' ? selection.chartId : 
                               typeof selection.chart_id === 'string' ? selection.chart_id :
                               typeof selection.id === 'string' ? selection.id : undefined;
      if (selectionChartId) {
        result.chartId = selectionChartId;
      }
    }

    // Chart Title
    if (!result.chartTitle) {
      const selectionChartTitle = typeof selection.chartTitle === 'string' ? selection.chartTitle :
                                  typeof selection.chart_title === 'string' ? selection.chart_title :
                                  typeof selection.title === 'string' ? selection.title : undefined;
      if (selectionChartTitle) {
        result.chartTitle = selectionChartTitle;
      }
    }

    // Chart State - CRITICAL: This is where chartState is stored
    if (!result.chartState) {
      if (selection.chartState && typeof selection.chartState === 'object') {
        result.chartState = selection.chartState as ChartMakerExhibitionSelectionChartState;
      } else if (selection.chart_state && typeof selection.chart_state === 'object') {
        result.chartState = selection.chart_state as ChartMakerExhibitionSelectionChartState;
      }
    }

    // Chart Context - CRITICAL: This is where chartContext is stored
    if (!result.chartContext) {
      if (selection.chartContext && typeof selection.chartContext === 'object') {
        result.chartContext = selection.chartContext;
      } else if (selection.chart_context && typeof selection.chart_context === 'object') {
        result.chartContext = selection.chart_context;
      }
    }

    // Captured At
    if (!result.capturedAt) {
      const selectionCapturedAt = typeof selection.capturedAt === 'string' ? selection.capturedAt : undefined;
      if (selectionCapturedAt) {
        result.capturedAt = selectionCapturedAt;
      }
    }

    // Source Atom Title
    if (!result.sourceAtomTitle) {
      const selectionSourceAtomTitle = typeof selection.sourceAtomTitle === 'string' ? selection.sourceAtomTitle : undefined;
      if (selectionSourceAtomTitle) {
        result.sourceAtomTitle = selectionSourceAtomTitle;
      }
    }
  }

  // ✅ NEW: Check charts array (for Dashboard Mode charts)
  // This is where charts are stored when created in Dashboard Mode (not manually staged)
  const chartsArray = Array.isArray(nested.charts) ? nested.charts : [];
  const primaryChart = chartsArray[0];

  // Extract from chart if not found in exhibitionSelections
  if (primaryChart && typeof primaryChart === 'object') {
    // Chart ID
    if (!result.chartId) {
      const chartId = typeof primaryChart.id === 'string' ? primaryChart.id : undefined;
      if (chartId) {
        result.chartId = chartId;
      }
    }

    // Chart Title
    if (!result.chartTitle) {
      const chartTitle = typeof primaryChart.title === 'string' ? primaryChart.title : undefined;
      if (chartTitle) {
        result.chartTitle = chartTitle;
      }
    }

    // Chart State - Convert from ChartMakerConfig format to ChartMakerExhibitionSelectionChartState
    if (!result.chartState) {
      result.chartState = {
        chartType: (typeof primaryChart.type === 'string' ? primaryChart.type : 'line') as any,
        xAxis: typeof primaryChart.xAxis === 'string' ? primaryChart.xAxis : '',
        yAxis: typeof primaryChart.yAxis === 'string' ? primaryChart.yAxis : '',
        secondYAxis: typeof primaryChart.secondYAxis === 'string' ? primaryChart.secondYAxis : undefined,
        dualAxisMode: primaryChart.dualAxisMode === 'dual' || primaryChart.dualAxisMode === 'single' 
          ? primaryChart.dualAxisMode 
          : undefined,
        filters: (primaryChart.filters && typeof primaryChart.filters === 'object' && !Array.isArray(primaryChart.filters))
          ? primaryChart.filters as Record<string, string[]>
          : {},
        aggregation: (primaryChart.aggregation === 'sum' || primaryChart.aggregation === 'mean' || 
                      primaryChart.aggregation === 'count' || primaryChart.aggregation === 'min' || 
                      primaryChart.aggregation === 'max')
          ? primaryChart.aggregation
          : 'sum',
        legendField: typeof primaryChart.legendField === 'string' ? primaryChart.legendField : undefined,
        isAdvancedMode: primaryChart.isAdvancedMode === true,
        traces: Array.isArray(primaryChart.traces) ? primaryChart.traces : undefined,
        note: typeof primaryChart.note === 'string' ? primaryChart.note : undefined,
      };
    }

    // Chart Context - Extract chartConfig data
    if (!result.chartContext) {
      const chartConfig = primaryChart.chartConfig && typeof primaryChart.chartConfig === 'object' 
        ? primaryChart.chartConfig 
        : {};
      
      // Get chart data from chartConfig.data or filteredData
      const chartData = Array.isArray(chartConfig.data) 
        ? chartConfig.data 
        : (Array.isArray(primaryChart.filteredData) ? primaryChart.filteredData : []);

      result.chartContext = {
        dataSource: typeof nested.dataSource === 'string' ? nested.dataSource : 
                      (typeof nested.fileId === 'string' ? nested.fileId : undefined),
        uploadedData: nested.uploadedData || null,
        chartConfig: {
          data: chartData,
          theme: typeof chartConfig.theme === 'string' ? chartConfig.theme : undefined,
          showLegend: chartConfig.showLegend === true,
          showXAxisLabels: chartConfig.showXAxisLabels !== false, // Default to true
          showYAxisLabels: chartConfig.showYAxisLabels !== false, // Default to true
          showDataLabels: chartConfig.showDataLabels === true,
          showGrid: chartConfig.showGrid !== false, // Default to true
          sortOrder: (primaryChart.sortOrder === 'asc' || primaryChart.sortOrder === 'desc' || primaryChart.sortOrder === null)
            ? primaryChart.sortOrder
            : (chartConfig.sortOrder === 'asc' || chartConfig.sortOrder === 'desc' || chartConfig.sortOrder === null)
              ? chartConfig.sortOrder
              : null,
          sortColumn: typeof primaryChart.sortColumn === 'string' ? primaryChart.sortColumn : 
                     (typeof chartConfig.sortColumn === 'string' ? chartConfig.sortColumn : undefined),
          colors: Array.isArray(chartConfig.colors) ? chartConfig.colors : undefined,
          seriesSettings: chartConfig.seriesSettings && typeof chartConfig.seriesSettings === 'object' 
            ? chartConfig.seriesSettings 
            : undefined,
        },
      };
    }
  }

  return Object.keys(result).length > 0 ? result : null;
};

// Get filtered data similar to ChartMakerCanvas.getFilteredData
export const getFilteredData = (chartState: ChartMakerExhibitionSelectionChartState, chartContext: any) => {
  // Prefer backend-provided data when available (same as ChartMakerCanvas)
  // This matches the exact logic from ChartMakerCanvas.getFilteredData
  if (chartContext?.chartConfig?.data && Array.isArray(chartContext.chartConfig.data)) {
    return chartContext.chartConfig.data;
  }
  
  // Fallback to filtering uploaded data based on selected identifiers
  if (!chartContext?.uploadedData || !Array.isArray(chartContext.uploadedData.rows)) {
    return [];
  }

  const { filters = {} } = chartState;
  return chartContext.uploadedData.rows.filter((row: any) =>
    Object.entries(filters).every(([col, values]) => {
      if (!values || !Array.isArray(values) || values.length === 0) return true;
      return values.includes(String(row[col]));
    })
  );
};

