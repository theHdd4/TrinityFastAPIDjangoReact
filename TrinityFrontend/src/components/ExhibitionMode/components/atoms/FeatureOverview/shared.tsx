import React from 'react';
import { FeatureOverviewComponentProps, FeatureOverviewMetadata, FeatureOverviewStatistics } from './types';

export type ChartRendererType = 'bar_chart' | 'line_chart' | 'area_chart' | 'pie_chart' | 'scatter_chart';

export interface ChartRendererConfig {
  type: ChartRendererType;
  data: Array<Record<string, unknown>>;
  height: number;
  xField?: string;
  yField?: string;
  yFields?: string[];
  yAxisLabels?: string[];
  legendField?: string;
  colors?: string[];
  theme?: string;
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  showLegend?: boolean;
  // showAxisLabels?: boolean;
  showXAxisLabels?: boolean;
  showYAxisLabels?: boolean;
  showDataLabels?: boolean;
  showGrid?: boolean;
  sortOrder?: 'asc' | 'desc' | null;
}

const DEFAULT_TREND_ANALYSIS_DATA: Array<{ date: string; salesvalue: number; series: string }> = [
  { date: '2022-04-01', salesvalue: 98542.13, series: 'SalesValue' },
  { date: '2022-05-01', salesvalue: 102384.91, series: 'SalesValue' },
  { date: '2022-06-01', salesvalue: 87651.72, series: 'SalesValue' },
  { date: '2022-07-01', salesvalue: 113245.68, series: 'SalesValue' },
  { date: '2022-08-01', salesvalue: 127584.22, series: 'SalesValue' },
  { date: '2022-09-01', salesvalue: 91845.3, series: 'SalesValue' },
  { date: '2022-10-01', salesvalue: 108742.41, series: 'SalesValue' },
  { date: '2022-11-01', salesvalue: 121854.77, series: 'SalesValue' },
  { date: '2022-12-01', salesvalue: 74628.4, series: 'SalesValue' },
  { date: '2023-01-01', salesvalue: 96521.89, series: 'SalesValue' },
  { date: '2023-02-01', salesvalue: 118742.11, series: 'SalesValue' },
  { date: '2023-03-01', salesvalue: 83215.04, series: 'SalesValue' },
  { date: '2023-04-01', salesvalue: 121852.66, series: 'SalesValue' },
];

const cloneDefaultTrendAnalysisData = () => DEFAULT_TREND_ANALYSIS_DATA.map(point => ({ ...point }));

export const DEFAULT_FEATURE_OVERVIEW_TREND_METADATA: FeatureOverviewMetadata = {
  metric: 'SalesValue',
  label: 'SalesValue trend analysis',
  chartState: {
    chartType: 'line_chart',
    xAxisField: 'date',
    yAxisField: 'salesvalue',
    legendField: 'series',
    showLegend: true,
    // showAxisLabels: true,
    showGrid: true,
    colorPalette: ['#6366F1'],
    xAxisLabel: 'Date',
    yAxisLabel: 'SalesValue',
  },
  featureContext: {
    dataSource: 'Sample feature overview dataset',
    xAxis: 'Date',
    availableMetrics: ['SalesValue'],
  },
  statisticalDetails: {
    timeseries: cloneDefaultTrendAnalysisData().map(entry => ({
      date: entry.date,
      salesvalue: entry.salesvalue,
      series: entry.series,
      value: entry.salesvalue,
    })),
  },
  viewType: 'trend_analysis',
  exhibitionControls: {
    transparentBackground: true,
  },
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return undefined;
};

const asBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === 'string') {
    const lowered = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(lowered)) return true;
    if (['false', '0', 'no', 'n'].includes(lowered)) return false;
  }
  return undefined;
};

const safeParseJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch (error) {
    return undefined;
  }
};

const ensureArray = <T,>(value: unknown): T[] => {
  if (Array.isArray(value)) {
    return value as T[];
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      const parsed = safeParseJson(trimmed);
      if (Array.isArray(parsed)) {
        return parsed as T[];
      }
    }
  }

  return [];
};

const ensureRecordArray = (value: unknown): Array<Record<string, unknown>> =>
  ensureArray<unknown>(value)
    .filter(isRecord)
    .map(entry => ({ ...entry }));

const mergeStatistics = (
  target: FeatureOverviewStatistics | undefined,
  updates: FeatureOverviewStatistics,
): FeatureOverviewStatistics => {
  const next: FeatureOverviewStatistics = target ? { ...target } : {};

  if (updates.summary && (!next.summary || Object.keys(next.summary).length === 0)) {
    next.summary = { ...updates.summary };
  }
  if (updates.timeseries && updates.timeseries.length > 0 && (!next.timeseries || next.timeseries.length === 0)) {
    next.timeseries = updates.timeseries.map(entry => ({ ...entry }));
  }
  if (updates.full && (!next.full || Object.keys(next.full).length === 0)) {
    next.full = { ...updates.full };
  }

  return next;
};

const normaliseStatistics = (value: unknown): FeatureOverviewStatistics | undefined => {
  if (!value) {
    return undefined;
  }

  if (isRecord(value)) {
    const summary = isRecord(value.summary) ? { ...value.summary } : undefined;
    const summaryEntries = ensureArray<unknown>(value.summary)
      .map(entry => (isRecord(entry) ? entry : null))
      .filter((entry): entry is Record<string, unknown> => Boolean(entry));
    const summaryFromEntries = summaryEntries.reduce<Record<string, unknown>>((acc, entry) => {
      const key = asString(entry.key) ?? asString(entry.label) ?? asString(entry.metric) ?? asString(entry.name);
      if (!key) {
        return acc;
      }
      acc[key] = entry.value ?? entry.metricValue ?? entry.data;
      return acc;
    }, {});

    const timeseries = ensureRecordArray(value.timeseries ?? value['time_series']);
    const full = isRecord(value.full) ? { ...value.full } : undefined;

    if (!summary && Object.keys(summaryFromEntries).length === 0 && timeseries.length === 0 && !full) {
      return undefined;
    }

    const stats: FeatureOverviewStatistics = {};
    if (summary || Object.keys(summaryFromEntries).length > 0) {
      stats.summary = summary ?? summaryFromEntries;
    }
    if (timeseries.length > 0) {
      stats.timeseries = timeseries;
    }
    if (full) {
      stats.full = full;
    }

    return stats;
  }

  return undefined;
};

const normaliseFeatureContext = (value: unknown) => {
  if (!isRecord(value)) {
    return undefined;
  }

  const result: FeatureOverviewMetadata['featureContext'] = {};
  const dataSource = asString(value.dataSource ?? value['data_source']);
  if (dataSource) {
    result.dataSource = dataSource;
  }

  const xAxis = asString(value.xAxis ?? value['x_axis']);
  if (xAxis) {
    result.xAxis = xAxis;
  }

  const availableMetrics = ensureArray<string>(value.availableMetrics ?? value['available_metrics']).filter(
    (entry): entry is string => typeof entry === 'string',
  );
  if (availableMetrics.length > 0) {
    result.availableMetrics = availableMetrics;
  }

  return Object.keys(result).length > 0 ? result : undefined;
};

const normaliseChartState = (value: unknown) => {
  if (!isRecord(value)) {
    return undefined;
  }

  const chartState: FeatureOverviewMetadata['chartState'] = {};
  const chartType = asString(value.chartType ?? value['chart_type']);
  if (chartType) chartState.chartType = chartType;
  const xAxisField = asString(value.xAxisField ?? value['x_axis_field'] ?? value['xAxis']);
  if (xAxisField) chartState.xAxisField = xAxisField;
  const yAxisField = asString(value.yAxisField ?? value['y_axis_field'] ?? value['yAxis']);
  if (yAxisField) chartState.yAxisField = yAxisField;
  const legendField = asString(value.legendField ?? value['legend_field']);
  if (legendField) chartState.legendField = legendField;
  const xAxisLabel = asString(value.xAxisLabel ?? value['x_axis_label']);
  if (xAxisLabel) chartState.xAxisLabel = xAxisLabel;
  const yAxisLabel = asString(value.yAxisLabel ?? value['y_axis_label']);
  if (yAxisLabel) chartState.yAxisLabel = yAxisLabel;

  const palette = ensureArray<string>(value.colorPalette ?? value['color_palette']).filter(
    (entry): entry is string => typeof entry === 'string' && entry.length > 0,
  );
  if (palette.length > 0) {
    chartState.colorPalette = palette;
  }

  const showLegend = asBoolean(value.showLegend ?? value['show_legend']);
  if (showLegend !== undefined) chartState.showLegend = showLegend;
  // const showAxisLabels = asBoolean(value.showAxisLabels ?? value['show_axis_labels']);
  // if (showAxisLabels !== undefined) chartState.showAxisLabels = showAxisLabels;
  const showXAxisLabels = asBoolean(value.showXAxisLabels ?? value['show_x_axis_labels']);
  if (showXAxisLabels !== undefined) chartState.showXAxisLabels = showXAxisLabels;
  const showYAxisLabels = asBoolean(value.showYAxisLabels ?? value['show_y_axis_labels']);
  if (showYAxisLabels !== undefined) chartState.showYAxisLabels = showYAxisLabels;
  const showDataLabels = asBoolean(value.showDataLabels ?? value['show_data_labels']);
  if (showDataLabels !== undefined) chartState.showDataLabels = showDataLabels;
  const showGrid = asBoolean(value.showGrid ?? value['show_grid']);
  if (showGrid !== undefined) chartState.showGrid = showGrid;

  const sortOrder = asString(value.sortOrder ?? value['sort_order']);
  if (sortOrder === 'asc' || sortOrder === 'desc') {
    chartState.sortOrder = sortOrder;
  } else if (value.sortOrder === null || value['sort_order'] === null) {
    chartState.sortOrder = null;
  }

  return Object.keys(chartState).length > 0 ? chartState : undefined;
};

const normaliseSkuStatisticsSettings = (value: unknown) => {
  if (!isRecord(value)) {
    return undefined;
  }

  const settings: FeatureOverviewMetadata['skuStatisticsSettings'] = {};
  const tableRows = ensureRecordArray(value.tableRows ?? value['table_rows']);
  if (tableRows.length > 0) {
    settings.tableRows = tableRows;
  }
  const tableColumns = ensureArray<string>(value.tableColumns ?? value['table_columns']).filter(
    (entry): entry is string => typeof entry === 'string',
  );
  if (tableColumns.length > 0) {
    settings.tableColumns = tableColumns;
  }

  const visibilityRecord = isRecord(value.visibility) ? value.visibility : undefined;
  if (visibilityRecord) {
    const visibility = Object.entries(visibilityRecord).reduce<Record<string, boolean>>((acc, [key, raw]) => {
      const boolValue = asBoolean(raw);
      if (boolValue !== undefined) {
        acc[key] = boolValue;
      }
      return acc;
    }, {});
    if (Object.keys(visibility).length > 0) {
      settings.visibility = visibility;
    }
  }

  return Object.keys(settings).length > 0 ? settings : undefined;
};

const normaliseExhibitionControls = (value: unknown) => {
  if (!isRecord(value)) {
    return undefined;
  }

  const controls: NonNullable<FeatureOverviewMetadata['exhibitionControls']> = {};

  const enableComponentTitle = asBoolean(
    value.enableComponentTitle ?? value['enable_component_title'] ?? value['component_title'],
  );
  if (enableComponentTitle !== undefined) {
    controls.enableComponentTitle = enableComponentTitle;
  }

  const allowEditInExhibition = asBoolean(
    value.allowEditInExhibition ?? value['allow_edit_in_exhibition'] ?? value['allowEdit'],
  );
  if (allowEditInExhibition !== undefined) {
    controls.allowEditInExhibition = allowEditInExhibition;
  }

  const transparentBackground = asBoolean(
    value.transparentBackground ?? value['transparent_background'] ?? value['makeTransparent'],
  );
  if (transparentBackground !== undefined) {
    controls.transparentBackground = transparentBackground;
  }

  return Object.keys(controls).length > 0 ? controls : undefined;
};

const parsePossibleJson = (value: unknown) => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      return safeParseJson(trimmed) ?? value;
    }
  }
  return value;
};

const normaliseViewType = (value: unknown): FeatureOverviewMetadata['viewType'] => {
  const candidate = asString(value)?.toLowerCase();
  return candidate === 'trend_analysis' || candidate === 'trend-analysis' ? 'trend_analysis' : 'statistical_summary';
};

const applyVisualizationManifest = (
  target: FeatureOverviewMetadata,
  manifestCandidate: unknown,
) => {
  if (!isRecord(manifestCandidate)) {
    return;
  }

  const manifest = manifestCandidate;

  const metric = asString(manifest.metric);
  if (metric && !target.metric) {
    target.metric = metric;
  }

  const label = asString(manifest.label);
  if (label && !target.label) {
    target.label = label;
  }

  const capturedAt = asString(manifest.capturedAt ?? manifest['captured_at']);
  if (capturedAt && !target.capturedAt) {
    target.capturedAt = capturedAt;
  }

  if (!target.featureContext) {
    const context = normaliseFeatureContext(manifest.featureContext ?? manifest['feature_context']);
    if (context) {
      target.featureContext = context;
    }
  }

  const chartState = normaliseChartState(manifest.chart ?? manifest['chart_state'] ?? manifest['chartState']);
  if (chartState) {
    target.chartState = { ...chartState, ...(target.chartState ?? {}) };
  }

  const data = manifest.data && isRecord(manifest.data) ? manifest.data : undefined;
  if (data) {
    const summary = isRecord(data.summary) ? { ...data.summary } : undefined;
    const timeseries = ensureRecordArray(data.timeseries);
    const full = isRecord(data.statisticalFull ?? data.full)
      ? { ...(data.statisticalFull ?? data.full) as Record<string, unknown> }
      : undefined;

    const stats: FeatureOverviewStatistics = {};
    if (summary) stats.summary = summary;
    if (timeseries.length > 0) stats.timeseries = timeseries;
    if (full) stats.full = full;

    if (Object.keys(stats).length > 0) {
      target.statisticalDetails = mergeStatistics(target.statisticalDetails, stats);
    }
  }

  if (!target.viewType && manifest.componentType) {
    target.viewType = normaliseViewType(manifest.componentType);
  }

  const chartConfig = manifest.chart ?? manifest['chartConfig'] ?? manifest['chart_config'];
  if (chartConfig && !target.chartRendererProps) {
    target.chartRendererProps = chartConfig;
  }
};

export const parseFeatureOverviewMetadata = (metadata: unknown): FeatureOverviewMetadata | null => {
  if (!isRecord(metadata)) {
    return null;
  }

  const nested = isRecord(metadata.metadata)
    ? { ...metadata, ...(metadata.metadata as Record<string, unknown>) }
    : metadata;

  const result: FeatureOverviewMetadata = {};

  const metric = asString(nested.metric ?? nested['dependent_variable']);
  if (metric) {
    result.metric = metric;
  }

  const label = asString(nested.label ?? nested.title ?? nested['metric_label']);
  if (label) {
    result.label = label;
  }

  const chartState = normaliseChartState(nested.chartState ?? nested['chart_state']);
  if (chartState) {
    result.chartState = chartState;
  }

  const featureContext = normaliseFeatureContext(nested.featureContext ?? nested['feature_context']);
  if (featureContext) {
    result.featureContext = featureContext;
  }

  const statistics = normaliseStatistics(nested.statisticalDetails ?? nested['statistical_details']);
  if (statistics) {
    result.statisticalDetails = statistics;
  }

  const skuRow = isRecord(nested.skuRow ?? nested['sku_row'])
    ? { ...(nested.skuRow ?? nested['sku_row']) as Record<string, unknown> }
    : undefined;
  if (skuRow) {
    result.skuRow = skuRow;
  }

  const capturedAt = asString(nested.capturedAt ?? nested['captured_at']);
  if (capturedAt) {
    result.capturedAt = capturedAt;
  }

  const skuSettings = normaliseSkuStatisticsSettings(
    nested.skuStatisticsSettings ?? nested['sku_statistics_settings'],
  );
  if (skuSettings) {
    result.skuStatisticsSettings = skuSettings;
  }

  const exhibitionControls = normaliseExhibitionControls(
    nested.exhibitionControls ?? nested['exhibition_controls'],
  );
  if (exhibitionControls) {
    result.exhibitionControls = exhibitionControls;
  }

  if ('chartRendererProps' in nested || 'chart_renderer_props' in nested) {
    result.chartRendererProps = parsePossibleJson(nested.chartRendererProps ?? nested['chart_renderer_props']);
  }
  if ('chartRendererConfig' in nested || 'chart_renderer_config' in nested) {
    result.chartRendererConfig = parsePossibleJson(nested.chartRendererConfig ?? nested['chart_renderer_config']);
  }
  if ('chartConfig' in nested) {
    result.chartConfig = parsePossibleJson(nested.chartConfig);
  }
  if ('chart_config' in nested) {
    result.chart_config = parsePossibleJson(nested.chart_config);
  }

  const selections = ensureRecordArray(nested.exhibitionSelections ?? nested['exhibition_selections']);
  const primarySelection = selections[0];
  const selection = primarySelection && isRecord(primarySelection.metadata)
    ? { ...primarySelection, ...(primarySelection.metadata as Record<string, unknown>) }
    : primarySelection;

  if (selection) {
    if (!result.metric) {
      const selectionMetric = asString(selection.metric ?? selection['dependent_variable']);
      if (selectionMetric) {
        result.metric = selectionMetric;
      }
    }

    if (!result.label) {
      const selectionLabel = asString(selection.label ?? selection.title ?? selection['metric_label']);
      if (selectionLabel) {
        result.label = selectionLabel;
      }
    }

    if (!result.chartState) {
      const selectionChartState = normaliseChartState(selection.chartState ?? selection['chart_state']);
      if (selectionChartState) {
        result.chartState = selectionChartState;
      }
    }

    if (!result.featureContext) {
      const selectionContext = normaliseFeatureContext(selection.featureContext ?? selection['feature_context']);
      if (selectionContext) {
        result.featureContext = selectionContext;
      }
    }

    if (!result.statisticalDetails) {
      const selectionStats = normaliseStatistics(selection.statisticalDetails ?? selection['statistical_details']);
      if (selectionStats) {
        result.statisticalDetails = selectionStats;
      }
    }

    if (!result.skuRow) {
      const selectionSkuRow = isRecord(selection.skuRow ?? selection['sku_row'])
        ? { ...(selection.skuRow ?? selection['sku_row']) as Record<string, unknown> }
        : undefined;
      if (selectionSkuRow) {
        result.skuRow = selectionSkuRow;
      }
    }

    if (!result.capturedAt) {
      const selectionCapturedAt = asString(selection.capturedAt ?? selection['captured_at']);
      if (selectionCapturedAt) {
        result.capturedAt = selectionCapturedAt;
      }
    }

    if (!result.skuStatisticsSettings) {
      const selectionSkuSettings = normaliseSkuStatisticsSettings(
        selection.skuStatisticsSettings ?? selection['sku_statistics_settings'],
      );
      if (selectionSkuSettings) {
        result.skuStatisticsSettings = selectionSkuSettings;
      }
    }

    if (!result.exhibitionControls) {
      const selectionControls = normaliseExhibitionControls(
        selection.exhibitionControls ?? selection['exhibition_controls'],
      );
      if (selectionControls) {
        result.exhibitionControls = selectionControls;
      }
    }

    if (!result.chartRendererProps && ('chartRendererProps' in selection || 'chart_renderer_props' in selection)) {
      result.chartRendererProps = parsePossibleJson(selection.chartRendererProps ?? selection['chart_renderer_props']);
    }
    if (!result.chartRendererConfig && ('chartRendererConfig' in selection || 'chart_renderer_config' in selection)) {
      result.chartRendererConfig = parsePossibleJson(selection.chartRendererConfig ?? selection['chart_renderer_config']);
    }
    if (!result.chartConfig && 'chartConfig' in selection) {
      result.chartConfig = parsePossibleJson(selection.chartConfig);
    }
    if (!result.chart_config && 'chart_config' in selection) {
      result.chart_config = parsePossibleJson(selection.chart_config);
    }

    applyVisualizationManifest(result, selection.visualizationManifest ?? selection['visualization_manifest']);
  }

  applyVisualizationManifest(result, nested.visualizationManifest ?? nested['visualization_manifest']);

  const baseViewType = normaliseViewType(nested.viewType ?? nested['view_type']);
  const selectionViewType = selection ? normaliseViewType(selection.viewType ?? selection['view_type']) : undefined;
  result.viewType = baseViewType ?? selectionViewType ?? result.viewType ?? 'statistical_summary';

  return Object.keys(result).length > 0 ? result : null;
};

const DEFAULT_TREND_CHART_HEIGHT = {
  full: 400,
  compact: 280,
} as const;

const toRendererType = (value: unknown): ChartRendererType | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const candidate = value.toLowerCase();
  if (candidate.includes('line')) return 'line_chart';
  if (candidate.includes('area')) return 'area_chart';
  if (candidate.includes('scatter')) return 'scatter_chart';
  if (candidate.includes('pie')) return 'pie_chart';
  if (candidate.includes('bar') || candidate.includes('column')) return 'bar_chart';
  return null;
};

const buildDefaultTrendChartConfig = (variant: FeatureOverviewComponentProps['variant']): ChartRendererConfig => ({
  type: 'line_chart',
  data: cloneDefaultTrendAnalysisData(),
  height: DEFAULT_TREND_CHART_HEIGHT[variant],
  xField: 'date',
  yField: 'salesvalue',
  legendField: 'series',
  colors: ['#6366F1'],
  theme: 'default',
  title: 'SalesValue trend analysis',
  xAxisLabel: 'Date',
  yAxisLabel: 'SalesValue',
  showLegend: true,
  // showAxisLabels: true,
  showDataLabels: false,
  showGrid: true,
  sortOrder: null,
});

const buildFieldFallbacks = (value?: string) => {
  if (!value) {
    return [] as string[];
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return [] as string[];
  }
  const snake = trimmed.replace(/([a-z\d])([A-Z])/g, '$1_$2').replace(/[\s-]+/g, '_');
  const condensed = trimmed.replace(/[\s_-]+/g, '');
  return Array.from(
    new Set([trimmed, trimmed.toLowerCase(), snake, snake.toLowerCase(), condensed, condensed.toLowerCase()]),
  );
};

const sanitizeTimeseries = (
  rows: Array<Record<string, unknown>>,
  xField: string,
  yField: string,
): Array<Record<string, unknown>> => {
  const xCandidates = [...buildFieldFallbacks(xField), 'date', 'timestamp', 'time', 'index', 'period'];
  const yCandidates = [...buildFieldFallbacks(yField), 'value', 'metricValue', 'metric_value', 'metricvalue', 'y'];

  return rows
    .map((row, index) => {
      const normalised: Record<string, unknown> = { ...row };

      const resolvedX = xCandidates.find(candidate => row[candidate] != null);
      if (resolvedX) {
        normalised[xField] = row[resolvedX];
      } else if (normalised[xField] == null) {
        normalised[xField] = index + 1;
      }

      const resolvedY = yCandidates.find(candidate => row[candidate] != null);
      if (!resolvedY) {
        return null;
      }

      const rawValue = row[resolvedY];
      const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue);
      if (!Number.isFinite(numericValue)) {
        return null;
      }

      normalised[yField] = numericValue;
      return normalised;
    })
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
};

const prepareChartData = (
  stats: FeatureOverviewMetadata['statisticalDetails'],
  xField: string,
  yField: string,
): Array<Record<string, unknown>> => {
  if (!stats) {
    return [];
  }

  const timeseries = ensureRecordArray(stats.timeseries);
  if (timeseries.length > 0) {
    return sanitizeTimeseries(timeseries, xField, yField);
  }

  if (isRecord(stats.summary)) {
    return Object.entries(stats.summary)
      .map(([key, value], index) => ({
        [xField]: key || index,
        [yField]: typeof value === 'number' ? value : Number(value),
      }))
      .filter(entry => Number.isFinite(entry[yField] as number));
  }

  return [];
};

const ensureRenderableChartConfig = (config: ChartRendererConfig | null): ChartRendererConfig | null => {
  if (!config) {
    return null;
  }

  if (!Array.isArray(config.data) || config.data.length === 0) {
    return null;
  }

  const firstRow = config.data.find(entry => isRecord(entry)) as Record<string, unknown> | undefined;
  if (!firstRow) {
    return null;
  }

  const normalised: ChartRendererConfig = { ...config };

  if (normalised.xField && !(normalised.xField in firstRow)) {
    const fallback = Object.keys(firstRow).find(key => key.toLowerCase() === normalised.xField!.toLowerCase());
    if (fallback) {
      normalised.xField = fallback;
    }
  }

  const numericKeys = Object.entries(firstRow)
    .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
    .map(([key]) => key);

  if (!normalised.yField || !numericKeys.includes(normalised.yField)) {
    const fallback = normalised.yField
      ? Object.keys(firstRow).find(key => key.toLowerCase() === normalised.yField!.toLowerCase())
      : undefined;
    if (fallback && numericKeys.includes(fallback)) {
      normalised.yField = fallback;
    } else if (numericKeys.length > 0) {
      normalised.yField = numericKeys[0];
      if (!normalised.yAxisLabel) {
        normalised.yAxisLabel = humanize(numericKeys[0]);
      }
    }
  }

  if (normalised.legendField && !(normalised.legendField in firstRow)) {
    const legendFallback = Object.keys(firstRow).find(key => key.toLowerCase() === normalised.legendField!.toLowerCase());
    if (legendFallback) {
      normalised.legendField = legendFallback;
    } else {
      delete normalised.legendField;
      normalised.showLegend = false;
    }
  }

  return normalised;
};

const parseDirectChartRendererConfig = (
  metadata: FeatureOverviewMetadata,
  variant: FeatureOverviewComponentProps['variant'],
): ChartRendererConfig | null => {
  const candidate = metadata.chartRendererProps ?? metadata.chartRendererConfig ?? metadata.chart_config ?? metadata.chartConfig;
  if (!isRecord(candidate)) {
    return null;
  }

  const type =
    toRendererType(candidate.type) ||
    toRendererType(candidate['chart_type']) ||
    toRendererType(candidate['chartType']);

  const rawData = ensureRecordArray(candidate.data ?? candidate['filtered_data'] ?? candidate['filteredData']);
  if (!type || rawData.length === 0) {
    return null;
  }

  const config: ChartRendererConfig = {
    type,
    data: rawData, // Will be sanitized later
    height: DEFAULT_TREND_CHART_HEIGHT[variant],
  };

  if (typeof candidate.xField === 'string') config.xField = candidate.xField;
  if (typeof candidate['x_field'] === 'string') config.xField = candidate['x_field'] as string;
  if (typeof candidate.yField === 'string') config.yField = candidate.yField;
  if (typeof candidate['y_field'] === 'string') config.yField = candidate['y_field'] as string;
  
  // Sanitize the data to match the expected field names
  if (config.xField && config.yField) {
    config.data = sanitizeTimeseries(rawData, config.xField, config.yField);
  }

  const yFields = candidate.yFields ?? candidate['y_fields'];
  if (Array.isArray(yFields)) {
    const normalised = yFields.filter(field => typeof field === 'string') as string[];
    if (normalised.length > 0) {
      config.yFields = normalised;
    }
  }

  const yAxisLabels = candidate.yAxisLabels ?? candidate['y_axis_labels'];
  if (Array.isArray(yAxisLabels)) {
    const normalised = yAxisLabels.filter(label => typeof label === 'string') as string[];
    if (normalised.length > 0) {
      config.yAxisLabels = normalised;
    }
  }

  const legendField = candidate.legendField ?? candidate['legend_field'];
  if (typeof legendField === 'string') {
    config.legendField = legendField;
  }

  const colors = candidate.colors ?? candidate.palette;
  if (Array.isArray(colors)) {
    const normalised = colors.filter(color => typeof color === 'string') as string[];
    if (normalised.length > 0) {
      config.colors = normalised;
    }
  }

  if (typeof candidate.theme === 'string') config.theme = candidate.theme;
  if (typeof candidate.title === 'string') config.title = candidate.title;
  if (typeof candidate.xAxisLabel === 'string') config.xAxisLabel = candidate.xAxisLabel;
  if (typeof candidate.yAxisLabel === 'string') config.yAxisLabel = candidate.yAxisLabel;

  if (typeof candidate.showLegend === 'boolean') config.showLegend = candidate.showLegend;
  // if (typeof candidate.showAxisLabels === 'boolean') config.showAxisLabels = candidate.showAxisLabels;
  if (typeof candidate.showXAxisLabels === 'boolean') config.showXAxisLabels = candidate.showXAxisLabels;
  if (typeof candidate.showYAxisLabels === 'boolean') config.showYAxisLabels = candidate.showYAxisLabels;
  if (typeof candidate.showDataLabels === 'boolean') config.showDataLabels = candidate.showDataLabels;
  if (typeof candidate.showGrid === 'boolean') config.showGrid = candidate.showGrid;

  const sortOrder = candidate.sortOrder ?? candidate['sort_order'];
  if (sortOrder === 'asc' || sortOrder === 'desc' || sortOrder === null) {
    config.sortOrder = sortOrder;
  }

  return config;
};

const createChartRendererConfig = (
  metadata: FeatureOverviewMetadata,
  variant: FeatureOverviewComponentProps['variant'],
): ChartRendererConfig | null => {
  const chartState = metadata.chartState ?? {};
  const xField = chartState.xAxisField || 'index';
  const yField = chartState.yAxisField || metadata.metric || 'value';
  const type = toRendererType(chartState.chartType) ?? 'line_chart';
  
  const data = prepareChartData(metadata.statisticalDetails, xField, yField);

  if (data.length === 0) {
    return null;
  }

  return {
    type,
    data,
    height: DEFAULT_TREND_CHART_HEIGHT[variant],
    xField,
    yField,
    legendField: chartState.legendField,
    colors: Array.isArray(chartState.colorPalette)
      ? (chartState.colorPalette.filter(color => typeof color === 'string') as string[])
      : undefined,
    theme: chartState.theme,
    title: metadata.label ?? metadata.metric,
    xAxisLabel: chartState.xAxisLabel ?? chartState.xAxisField,
    yAxisLabel: chartState.yAxisLabel ?? chartState.yAxisField ?? metadata.metric,
    showLegend: chartState.showLegend,
    // showAxisLabels: chartState.showAxisLabels,
    showXAxisLabels: chartState.showXAxisLabels,
    showYAxisLabels: chartState.showYAxisLabels,
    showDataLabels: chartState.showDataLabels,
    showGrid: chartState.showGrid,
    sortOrder: chartState.sortOrder ?? null,
  };
};

export const deriveChartConfig = (
  metadata: FeatureOverviewMetadata,
  variant: FeatureOverviewComponentProps['variant'],
): ChartRendererConfig | null => {
  const directConfig = parseDirectChartRendererConfig(metadata, variant);
  const createdConfig = createChartRendererConfig(metadata, variant);
  const defaultConfig = buildDefaultTrendChartConfig(variant);
  
  return ensureRenderableChartConfig(
    directConfig ?? createdConfig ?? defaultConfig,
  );
};

export const extractSummaryEntries = (stats: FeatureOverviewStatistics | undefined): Array<[string, unknown]> => {
  if (!stats || !isRecord(stats.summary)) {
    return [];
  }

  return Object.entries(stats.summary).filter(([, value]) => value != null && typeof value !== 'object');
};

const humanize = (value: string): string =>
  value
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(.)/, (char: string) => char.toUpperCase());

export const renderSummaryEntries = (entries: Array<[string, unknown]>) => {
  if (entries.length === 0) {
    return null;
  }

  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-xl bg-muted/25 p-3">
          <dt className="text-xs font-semibold uppercase text-muted-foreground">{humanize(key)}</dt>
          <dd className="text-base font-semibold text-foreground">{value == null ? '—' : String(value)}</dd>
        </div>
      ))}
    </dl>
  );
};
