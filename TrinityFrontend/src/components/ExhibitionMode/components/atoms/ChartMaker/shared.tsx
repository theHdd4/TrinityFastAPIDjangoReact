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

  return result;
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

