import React from 'react';
import { Badge } from '@/components/ui/badge';
import RechartsChartRenderer from '@/templates/charts/RechartsChartRenderer';
import TableTemplate from '@/templates/tables/table';
import {
  FeatureOverviewChartState,
  FeatureOverviewDimension,
  FeatureOverviewFeatureContext,
  FeatureOverviewMetadata,
  FeatureOverviewChartRendererConfig,
  FeatureOverviewVisualisationManifest,
  FeatureOverviewVizSpec,
  FeatureOverviewSkuStatisticsSettings,
  FeatureOverviewStatistics,
  FeatureOverviewViewType,
} from './types';

const DEFAULT_TREND_ANALYSIS_DATA: Array<{
  date: string;
  salesvalue: number;
  series: string;
}> = [
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

const cloneDefaultTrendAnalysisData = () =>
  DEFAULT_TREND_ANALYSIS_DATA.map(point => ({ ...point }));

export const DEFAULT_FEATURE_OVERVIEW_TREND_METADATA: FeatureOverviewMetadata = {
  metric: 'SalesValue',
  label: 'SalesValue trend analysis',
  chartState: {
    chartType: 'line_chart',
    xAxisField: 'date',
    yAxisField: 'salesvalue',
    legendField: 'series',
    showLegend: true,
    showAxisLabels: true,
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
};

export const ensureArray = <T,>(value: unknown): T[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value as T[];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed as T[];
        }
      } catch (error) {
        console.warn('[FeatureOverview] Failed to parse array JSON payload', error);
      }
    }
  }
  return [];
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const ensureRecordArray = (value: unknown): Array<Record<string, unknown>> => {
  return ensureArray<unknown>(value)
    .filter(isRecord)
    .map(entry => ({ ...entry } as Record<string, unknown>));
};

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
    if (lowered === 'true') return true;
    if (lowered === 'false') return false;
    if (lowered === '1' || lowered === 'yes' || lowered === 'y') return true;
    if (lowered === '0' || lowered === 'no' || lowered === 'n') return false;
  }
  return undefined;
};

const safeJsonParse = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn('[FeatureOverview] Failed to parse JSON payload', error);
    return null;
  }
};

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      const parsed = safeJsonParse(trimmed);
      if (isRecord(parsed)) {
        return parsed;
      }
    }
  }

  return null;
};

const normaliseDimensions = (value: unknown) => {
  const dimensions = ensureArray<unknown>(value)
    .map(entry => {
      const record = toRecord(entry);
      if (!record) return null;
      const name =
        asString(record.name) ??
        asString(record.dimension) ??
        asString(record.label);
      const dimensionValue = asString(record.value) ?? asString(record.key) ?? asString(record.id);

      if (!name && !dimensionValue) {
        return null;
      }

      return {
        ...(name ? { name } : {}),
        ...(dimensionValue ? { value: dimensionValue } : {}),
      } as FeatureOverviewDimension;
    })
    .filter((dimension): dimension is FeatureOverviewDimension => Boolean(dimension));

  return dimensions.length > 0 ? dimensions : undefined;
};

const normaliseStatistics = (value: unknown): FeatureOverviewStatistics | undefined => {
  const record = toRecord(value);
  if (!record) {
    return undefined;
  }

  let summaryRecord = toRecord(record.summary ?? record['statistical_summary']);
  if (!summaryRecord) {
    const summaryEntries = ensureArray<unknown>(record.summary).map(entry => {
      const summaryItem = toRecord(entry);
      if (!summaryItem) {
        return null;
      }

      const key =
        asString(summaryItem.key) ??
        asString(summaryItem.label) ??
        asString(summaryItem.metric) ??
        asString(summaryItem.name);
      if (!key) {
        return null;
      }

      const value = summaryItem.value ?? summaryItem.metricValue ?? summaryItem.data;
      return [key, value] as [string, unknown];
    });

    const filteredEntries = summaryEntries.filter((entry): entry is [string, unknown] => Boolean(entry));
    if (filteredEntries.length > 0) {
      summaryRecord = filteredEntries.reduce<Record<string, unknown>>((acc, [key, value]) => {
        acc[key] = value;
        return acc;
      }, {});
    }
  }

  const summary = summaryRecord ? { ...summaryRecord } : undefined;
  const timeseries = ensureRecordArray(record.timeseries ?? record['time_series']);
  const fullRecord = toRecord(record.full);

  if (!summary && timeseries.length === 0 && !fullRecord) {
    return undefined;
  }

  const result: FeatureOverviewStatistics = {};
  if (summary) {
    result.summary = summary;
  }
  if (timeseries.length > 0) {
    result.timeseries = timeseries;
  }
  if (fullRecord) {
    result.full = fullRecord;
  }

  return result;
};

const normaliseFeatureContext = (value: unknown): FeatureOverviewFeatureContext | undefined => {
  const record = toRecord(value);
  if (!record) {
    return undefined;
  }

  const result: FeatureOverviewFeatureContext = {};

  const dataSource = asString(record.dataSource ?? record['data_source']);
  if (dataSource) {
    result.dataSource = dataSource;
  }

  const availableMetrics = ensureArray<string>(record.availableMetrics ?? record['available_metrics']).filter(
    metric => typeof metric === 'string',
  );
  if (availableMetrics.length > 0) {
    result.availableMetrics = availableMetrics;
  }

  const xAxis = asString(record.xAxis ?? record['x_axis']);
  if (xAxis) {
    result.xAxis = xAxis;
  }

  const dimensionMapRecord = toRecord(record.dimensionMap ?? record['dimension_map']);
  if (dimensionMapRecord) {
    const dimensionMap = Object.entries(dimensionMapRecord).reduce<Record<string, string[]>>((acc, [key, rawValue]) => {
      const entries = ensureArray<string>(rawValue).filter(entry => typeof entry === 'string');
      if (entries.length > 0) {
        acc[key] = entries;
      }
      return acc;
    }, {});

    if (Object.keys(dimensionMap).length > 0) {
      result.dimensionMap = dimensionMap;
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
};

const normaliseSkuStatisticsSettings = (value: unknown): FeatureOverviewSkuStatisticsSettings | undefined => {
  const record = toRecord(value);
  if (!record) {
    return undefined;
  }

  const visibilityRecord = toRecord(record.visibility);
  const visibility = visibilityRecord
    ? Object.entries(visibilityRecord).reduce<Record<string, boolean>>((acc, [key, rawValue]) => {
        const boolValue = asBoolean(rawValue);
        if (boolValue !== undefined) {
          acc[key] = boolValue;
        }
        return acc;
      }, {})
    : undefined;

  const tableRows = ensureRecordArray(record.tableRows ?? record['table_rows']);
  const tableColumns = ensureArray<string>(record.tableColumns ?? record['table_columns']).filter(
    (column): column is string => typeof column === 'string',
  );

  if (!visibility && tableRows.length === 0 && tableColumns.length === 0) {
    return undefined;
  }

  const result: FeatureOverviewSkuStatisticsSettings = {};

  if (visibility && Object.keys(visibility).length > 0) {
    result.visibility = visibility;
  }
  if (tableRows.length > 0) {
    result.tableRows = tableRows;
  }
  if (tableColumns.length > 0) {
    result.tableColumns = tableColumns;
  }

  return result;
};

const parseVisualizationManifest = (
  value: unknown,
): FeatureOverviewVisualisationManifest | null => {
  const record = toRecord(value);
  if (!record) {
    return null;
  }

  const manifestId = asString(record['manifestId'] ?? record['manifest_id']);
  const componentId = asString(record['componentId'] ?? record['component_id']);
  if (!manifestId || !componentId) {
    return null;
  }

  const manifest: FeatureOverviewVisualisationManifest = {
    manifestId,
    componentId,
  };

  const atomId = asString(record['atomId'] ?? record['atom_id']);
  if (atomId) {
    manifest.atomId = atomId;
  }

  const view = asString(record['view']);
  if (view) {
    manifest.view = view;
  }

  const createdAt = asString(record['createdAt'] ?? record['created_at']);
  if (createdAt) {
    manifest.createdAt = createdAt;
  }

  const thumbnail = asString(record['thumbnail']);
  if (thumbnail) {
    manifest.thumbnail = thumbnail;
  }

  const vizSpecRecord = toRecord(record['vizSpec'] ?? record['viz_spec']);
  if (vizSpecRecord) {
    const renderer = asString(vizSpecRecord['renderer']) ?? 'recharts';
    const versionCandidate = vizSpecRecord['version'];
    const version =
      typeof versionCandidate === 'number'
        ? versionCandidate
        : Number.isFinite(Number(versionCandidate))
          ? Number(versionCandidate)
          : 1;
    const configRecord = toRecord(vizSpecRecord['config']);

    if (configRecord) {
      const clonedConfig = cloneJson(configRecord) as FeatureOverviewChartRendererConfig;
      manifest.vizSpec = {
        renderer: renderer === 'recharts' ? 'recharts' : 'recharts',
        version,
        config: clonedConfig,
      };
    }
  }

  const chartDataRecord = toRecord(record['chartData'] ?? record['chart_data']);
  if (chartDataRecord) {
    manifest.chartData = cloneJson(chartDataRecord);
  }

  const skuDataRecord = toRecord(record['skuData'] ?? record['sku_data']);
  if (skuDataRecord) {
    manifest.skuData = cloneJson(skuDataRecord);
  }

  return manifest;
};

const normaliseChartState = (value: unknown): FeatureOverviewChartState | undefined => {
  const record = toRecord(value);
  if (!record) {
    return undefined;
  }

  const chartState: FeatureOverviewChartState = {};

  const chartType = asString(record.chartType ?? record['chart_type']);
  if (chartType) {
    chartState.chartType = chartType;
  }

  const theme = asString(record.theme);
  if (theme) {
    chartState.theme = theme;
  }

  const showDataLabels = asBoolean(record.showDataLabels ?? record['show_data_labels']);
  if (showDataLabels !== undefined) {
    chartState.showDataLabels = showDataLabels;
  }

  const showAxisLabels = asBoolean(record.showAxisLabels ?? record['show_axis_labels']);
  if (showAxisLabels !== undefined) {
    chartState.showAxisLabels = showAxisLabels;
  }

  const showGrid = asBoolean(record.showGrid ?? record['show_grid']);
  if (showGrid !== undefined) {
    chartState.showGrid = showGrid;
  }

  const showLegend = asBoolean(record.showLegend ?? record['show_legend']);
  if (showLegend !== undefined) {
    chartState.showLegend = showLegend;
  }

  const xAxisField = asString(record.xAxisField ?? record['x_axis_field'] ?? record['xAxis']);
  if (xAxisField) {
    chartState.xAxisField = xAxisField;
  }

  const yAxisField = asString(record.yAxisField ?? record['y_axis_field'] ?? record['yAxis']);
  if (yAxisField) {
    chartState.yAxisField = yAxisField;
  }

  const palette = ensureArray<string>(record.colorPalette ?? record['color_palette']).filter(
    (color): color is string => typeof color === 'string',
  );
  if (palette.length > 0) {
    chartState.colorPalette = palette;
  }

  const legendField = asString(record.legendField ?? record['legend_field']);
  if (legendField) {
    chartState.legendField = legendField;
  }

  const xAxisLabel = asString(record.xAxisLabel ?? record['x_axis_label']);
  if (xAxisLabel) {
    chartState.xAxisLabel = xAxisLabel;
  }

  const yAxisLabel = asString(record.yAxisLabel ?? record['y_axis_label']);
  if (yAxisLabel) {
    chartState.yAxisLabel = yAxisLabel;
  }

  const rawSortOrder = record.sortOrder ?? record['sort_order'];
  if (rawSortOrder === null) {
    chartState.sortOrder = null;
  }

  const sortOrder = asString(rawSortOrder);
  if (sortOrder === 'asc' || sortOrder === 'desc') {
    chartState.sortOrder = sortOrder;
  }

  return Object.keys(chartState).length > 0 ? chartState : undefined;
};

const parsePossibleJson = (value: unknown): unknown => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      const parsed = safeJsonParse(trimmed);
      if (parsed !== null) {
        return parsed;
      }
    }
  }
  return value;
};

const normaliseViewType = (value: unknown): FeatureOverviewViewType => {
  const candidate = asString(value)?.toLowerCase();
  if (candidate === 'trend_analysis' || candidate === 'trend-analysis') {
    return 'trend_analysis';
  }
  return 'statistical_summary';
};

export const humanize = (value: string): string =>
  value
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(.)/, (char: string) => char.toUpperCase());

export const formatCell = (value: unknown): string => {
  if (value == null) {
    return '—';
  }
  if (value instanceof Date) {
    return value.toLocaleString();
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toLocaleString() : String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  return String(value);
};

const cloneJson = <T,>(value: T): T => {
  if (value == null) {
    return value;
  }

  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
};

export type ChartRendererType = FeatureOverviewRendererType;

export type ChartRendererConfig = FeatureOverviewChartRendererConfig;

const DEFAULT_TREND_CHART_HEIGHT = {
  full: 300,
  compact: 220,
} as const;

export const buildDefaultTrendChartConfig = (variant: 'full' | 'compact'): ChartRendererConfig => ({
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
  showAxisLabels: true,
  showDataLabels: false,
  showGrid: true,
  sortOrder: null,
});

const toRendererType = (value: unknown): ChartRendererType | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.toLowerCase();
  switch (normalized) {
    case 'bar_chart':
    case 'bar':
    case 'bar-chart':
      return 'bar_chart';
    case 'line_chart':
    case 'line':
    case 'line-chart':
      return 'line_chart';
    case 'area_chart':
    case 'area':
    case 'area-chart':
      return 'area_chart';
    case 'pie_chart':
    case 'pie':
    case 'pie-chart':
      return 'pie_chart';
    case 'scatter_chart':
    case 'scatter':
    case 'scatter-chart':
      return 'scatter_chart';
    default:
      return null;
  }
};

const addFallbackCandidate = (fallbacks: string[], candidate?: string | null) => {
  if (!candidate) {
    return;
  }

  const trimmed = candidate.trim();
  if (!trimmed) {
    return;
  }

  if (!fallbacks.includes(trimmed)) {
    fallbacks.push(trimmed);
  }
};

const buildFieldFallbacks = (
  field: string | undefined,
  additional: string[],
): string[] => {
  const fallbacks: string[] = [];

  if (typeof field === 'string' && field.length > 0) {
    const trimmed = field.trim();
    addFallbackCandidate(fallbacks, trimmed);
    addFallbackCandidate(fallbacks, trimmed.toLowerCase());

    const snake = trimmed
      .replace(/([a-z\d])([A-Z])/g, '$1_$2')
      .replace(/[\s-]+/g, '_');
    addFallbackCandidate(fallbacks, snake);
    addFallbackCandidate(fallbacks, snake.toLowerCase());

    const condensed = trimmed.replace(/[\s_-]+/g, '');
    addFallbackCandidate(fallbacks, condensed);
    addFallbackCandidate(fallbacks, condensed.toLowerCase());
  }

  additional.forEach(candidate => addFallbackCandidate(fallbacks, candidate));

  return fallbacks;
};

const sanitizeTimeseries = (
  entries: Array<Record<string, unknown>>,
  xField: string,
  yField: string,
): Array<Record<string, unknown>> => {
  const xFieldFallbacks = buildFieldFallbacks(xField, ['date', 'timestamp', 'time', 'index', 'period']);
  const yFieldFallbacks = buildFieldFallbacks(yField, ['value', 'metricValue', 'metric_value', 'metricvalue', 'y']);

  return entries
    .map((entry, index) => {
      const normalised: Record<string, unknown> = { ...entry };

      const resolvedX = xFieldFallbacks.find(field => entry[field] != null);
      if (resolvedX) {
        normalised[xField] = entry[resolvedX];
      } else if (normalised[xField] == null) {
        normalised[xField] = index + 1;
      }

      const resolvedYField = yFieldFallbacks.find(field => entry[field] != null);
      if (!resolvedYField) {
        return null;
      }

      const rawValue = entry[resolvedYField];
      const numericValue =
        typeof rawValue === 'number'
          ? rawValue
          : typeof rawValue === 'string'
          ? Number(rawValue)
          : Number.NaN;

      if (!Number.isFinite(numericValue)) {
        return null;
      }

      normalised[yField] = numericValue;

      return normalised;
    })
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
};

const prepareChartData = (
  stats: FeatureOverviewStatistics | undefined,
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

const findMatchingKey = (row: Record<string, unknown>, candidate?: string) => {
  if (!candidate) {
    return undefined;
  }

  const lower = candidate.toLowerCase();
  return Object.keys(row).find(key => key.toLowerCase() === lower);
};

const ensureRenderableChartConfig = (
  config: ChartRendererConfig | null,
): ChartRendererConfig | null => {
  if (!config) {
    return null;
  }

  const data = Array.isArray(config.data) ? config.data : [];
  if (data.length === 0) {
    return null;
  }

  const firstRow = (data.find(entry => entry && typeof entry === 'object') as Record<string, unknown>) ?? {};
  const sanitizedConfig: ChartRendererConfig = { ...config };

  if (sanitizedConfig.xField) {
    const resolvedX = findMatchingKey(firstRow, sanitizedConfig.xField);
    if (resolvedX) {
      sanitizedConfig.xField = resolvedX;
    }
  }

  if (sanitizedConfig.legendField) {
    const resolvedLegend = findMatchingKey(firstRow, sanitizedConfig.legendField);
    if (!resolvedLegend) {
      delete sanitizedConfig.legendField;
      sanitizedConfig.showLegend = false;
    } else {
      sanitizedConfig.legendField = resolvedLegend;
    }
  }

  const numericKeys = Object.entries(firstRow)
    .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
    .map(([key]) => key);

  if (numericKeys.length === 0) {
    return sanitizedConfig;
  }

  const resolvedY = sanitizedConfig.yField
    ? findMatchingKey(firstRow, sanitizedConfig.yField) ?? null
    : null;

  if (!resolvedY) {
    const fallbackY = numericKeys.find(
      key => key !== sanitizedConfig.xField && key !== sanitizedConfig.legendField,
    );

    if (fallbackY) {
      sanitizedConfig.yField = fallbackY;
      if (!sanitizedConfig.yAxisLabel) {
        sanitizedConfig.yAxisLabel = humanize(fallbackY);
      }
    }

    return sanitizedConfig;
  }

  sanitizedConfig.yField = resolvedY;
  return sanitizedConfig;
};

const parseDirectChartRendererConfig = (
  metadata: FeatureOverviewMetadata,
  variant: 'full' | 'compact',
): ChartRendererConfig | null => {
  const candidate =
    metadata.chartRendererProps ??
    metadata.chartRendererConfig ??
    metadata.chart_config ??
    metadata.chartConfig;

  if (!isRecord(candidate)) {
    return null;
  }

  const type =
    toRendererType(candidate.type) ||
    toRendererType(candidate['chart_type']) ||
    toRendererType(candidate['chartType']);

  const data = ensureRecordArray(
    candidate.data ?? candidate['filtered_data'] ?? candidate['filteredData'],
  );

  if (!type || data.length === 0) {
    return null;
  }

  const height = DEFAULT_TREND_CHART_HEIGHT[variant];

  const config: ChartRendererConfig = {
    type,
    data,
    height,
  };

  if (typeof candidate.xField === 'string') config.xField = candidate.xField;
  if (typeof candidate['x_field'] === 'string') config.xField = candidate['x_field'] as string;
  if (typeof candidate.yField === 'string') config.yField = candidate.yField;
  if (typeof candidate['y_field'] === 'string') config.yField = candidate['y_field'] as string;

  const yFieldsCandidate = candidate.yFields ?? candidate['y_fields'];
  if (Array.isArray(yFieldsCandidate)) {
    const normalized = yFieldsCandidate.filter(field => typeof field === 'string') as string[];
    if (normalized.length > 0) {
      config.yFields = normalized;
    }
  }

  const yAxisLabelsCandidate = candidate.yAxisLabels ?? candidate['y_axis_labels'];
  if (Array.isArray(yAxisLabelsCandidate)) {
    const normalized = yAxisLabelsCandidate.filter(label => typeof label === 'string') as string[];
    if (normalized.length > 0) {
      config.yAxisLabels = normalized;
    }
  }

  const legendFieldCandidate = candidate.legendField ?? candidate['legend_field'];
  if (Array.isArray(legendFieldCandidate)) {
    const normalized = legendFieldCandidate.find(value => typeof value === 'string') as string | undefined;
    if (normalized) {
      config.legendField = normalized;
    }
  } else if (typeof legendFieldCandidate === 'string') {
    config.legendField = legendFieldCandidate;
  }

  const colorsCandidate = candidate.colors ?? candidate.palette;
  if (Array.isArray(colorsCandidate)) {
    const normalized = colorsCandidate.filter(color => typeof color === 'string') as string[];
    if (normalized.length > 0) {
      config.colors = normalized;
    }
  }

  if (typeof candidate.theme === 'string') {
    config.theme = candidate.theme;
  }
  if (typeof candidate.title === 'string') {
    config.title = candidate.title;
  }
  if (typeof candidate.xAxisLabel === 'string') {
    config.xAxisLabel = candidate.xAxisLabel;
  }
  if (typeof candidate.yAxisLabel === 'string') {
    config.yAxisLabel = candidate.yAxisLabel;
  }

  if (typeof candidate.showLegend === 'boolean') config.showLegend = candidate.showLegend;
  if (typeof candidate.showAxisLabels === 'boolean') config.showAxisLabels = candidate.showAxisLabels;
  if (typeof candidate.showDataLabels === 'boolean') config.showDataLabels = candidate.showDataLabels;
  if (typeof candidate.showGrid === 'boolean') config.showGrid = candidate.showGrid;

  const sortOrderCandidate = candidate.sortOrder ?? candidate['sort_order'];
  if (sortOrderCandidate === 'asc' || sortOrderCandidate === 'desc' || sortOrderCandidate === null) {
    config.sortOrder = sortOrderCandidate;
  }

  return config;
};

const createChartRendererConfig = (
  metadata: FeatureOverviewMetadata,
  variant: 'full' | 'compact',
): ChartRendererConfig | null => {
  const chartState = metadata.chartState ?? {};
  const xField = chartState.xAxisField || 'index';
  const yField = chartState.yAxisField || metadata.metric || 'value';
  const type = toRendererType(chartState.chartType) ?? 'line_chart';
  const data = prepareChartData(metadata.statisticalDetails, xField, yField);

  if (data.length === 0) {
    return null;
  }

  const height = DEFAULT_TREND_CHART_HEIGHT[variant];

  return {
    type,
    data,
    height,
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
    showAxisLabels: chartState.showAxisLabels,
    showDataLabels: chartState.showDataLabels,
    showGrid: chartState.showGrid,
    sortOrder: chartState.sortOrder ?? null,
  };
};

export const deriveChartConfig = (
  metadata: FeatureOverviewMetadata,
  variant: 'full' | 'compact',
): ChartRendererConfig | null =>
  ensureRenderableChartConfig(
    (() => {
      const manifestConfig = metadata.visualisationManifest?.vizSpec?.config;
      if (manifestConfig) {
        const clonedConfig: ChartRendererConfig = {
          ...manifestConfig,
          data: Array.isArray(manifestConfig.data)
            ? manifestConfig.data.map(entry => ({ ...(entry as Record<string, unknown>) }))
            : [],
          height:
            typeof manifestConfig.height === 'number' && Number.isFinite(manifestConfig.height)
              ? manifestConfig.height
              : DEFAULT_TREND_CHART_HEIGHT[variant],
        };

        if (clonedConfig.data.length === 0) {
          const manifestTimeseries = ensureRecordArray(
            metadata.visualisationManifest?.chartData?.['timeseries'],
          );
          const metadataTimeseries = ensureRecordArray(metadata.statisticalDetails?.timeseries);
          const fallbackData =
            manifestTimeseries.length > 0 ? manifestTimeseries : metadataTimeseries;

          if (fallbackData.length > 0) {
            clonedConfig.data = fallbackData.map(entry => ({ ...entry }));
          }
        }

        if (manifestConfig.yFields) {
          clonedConfig.yFields = [...manifestConfig.yFields];
        }

        if (manifestConfig.yAxisLabels) {
          clonedConfig.yAxisLabels = [...manifestConfig.yAxisLabels];
        }

        if (manifestConfig.colors) {
          clonedConfig.colors = [...manifestConfig.colors];
        }

        return clonedConfig;
      }

      return (
        parseDirectChartRendererConfig(metadata, variant) ??
        createChartRendererConfig(metadata, variant) ??
        buildDefaultTrendChartConfig(variant)
      );
    })(),
  );

export const extractSummaryEntries = (
  stats: FeatureOverviewStatistics | undefined,
): Array<[string, unknown]> => {
  if (!stats || !isRecord(stats.summary)) {
    return [];
  }

  return Object.entries(stats.summary).filter(([, value]) => value != null && typeof value !== 'object');
};

export const buildSkuTableModel = (
  settings: FeatureOverviewMetadata['skuStatisticsSettings'],
  variant: 'full' | 'compact',
): { columns: string[]; rows: Array<Record<string, unknown>>; total: number } | null => {
  if (!settings) {
    return null;
  }

  const columns = Array.isArray(settings.tableColumns)
    ? settings.tableColumns.filter(column => typeof column === 'string')
    : [];
  const rows = ensureRecordArray(settings.tableRows);

  if (columns.length === 0 || rows.length === 0) {
    return null;
  }

  const limit = variant === 'compact' ? 3 : 6;

  return {
    columns,
    rows: rows.slice(0, limit),
    total: rows.length,
  };
};

export const extractSkuRowEntries = (skuRow: Record<string, unknown> | undefined) => {
  if (!isRecord(skuRow)) {
    return [];
  }

  return Object.entries(skuRow).filter(([, value]) => value != null && typeof value !== 'object');
};

export const collectDimensions = (metadata: FeatureOverviewMetadata) =>
  Array.isArray(metadata.dimensions)
    ? metadata.dimensions.filter(dimension => dimension && (dimension.name || dimension.value))
    : [];

export const collectCombinationEntries = (metadata: FeatureOverviewMetadata) =>
  metadata.combination && isRecord(metadata.combination)
    ? Object.entries(metadata.combination)
    : [];

export const buildContextEntries = (metadata: FeatureOverviewMetadata) =>
  [
    metadata.featureContext?.dataSource
      ? { label: 'Data source', value: metadata.featureContext.dataSource }
      : null,
    metadata.featureContext?.xAxis
      ? { label: 'X-axis', value: metadata.featureContext.xAxis }
      : null,
    metadata.capturedAt
      ? {
          label: 'Captured',
          value: new Date(metadata.capturedAt).toLocaleString(),
        }
      : null,
  ].filter((entry): entry is { label: string; value: string } => Boolean(entry));

export const renderChart = (config: ChartRendererConfig | null) => {
  if (!config) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        Chart data will appear here after the component captures a visualization in laboratory mode.
      </div>
    );
  }

  return <RechartsChartRenderer {...config} />;
};

export const renderTable = (
  model: ReturnType<typeof buildSkuTableModel>,
): React.ReactNode => {
  if (!model) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        Statistical summary will be displayed here after saving combinations in laboratory mode.
      </div>
    );
  }

  return (
    <TableTemplate
      minimizable={false}
      headers={model.columns.map(column => (
        <span key={column} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {humanize(column)}
        </span>
      ))}
      customHeader={{
        title: 'Sample combinations',
        subtitle:
          model.rows.length < model.total ? `Showing ${model.rows.length} of ${model.total}` : undefined,
      }}
      bodyClassName="max-h-none"
    >
      {model.rows.map((row, rowIndex) => (
        <tr key={rowIndex} className="table-row">
          {model.columns.map(column => (
            <td key={column} className="table-cell px-4 py-3 text-sm text-foreground/80">
              {formatCell(row[column])}
            </td>
          ))}
        </tr>
      ))}
    </TableTemplate>
  );
};

export const parseFeatureOverviewMetadata = (
  metadata: unknown,
  manifestOverride?: FeatureOverviewVisualisationManifest | null,
): FeatureOverviewMetadata | null => {
  const record = toRecord(metadata);
  const nested = record ? toRecord(record.metadata) : null;
  const base: Record<string, unknown> = record
    ? { ...record, ...(nested || {}) }
    : nested
      ? { ...nested }
      : {};

  const result: FeatureOverviewMetadata = {};
  const manifest =
    manifestOverride ??
    parseVisualizationManifest(base['visualisationManifest'] ?? base['visualisation_manifest']);

  if (!record && !manifest) {
    return null;
  }

  if (manifest) {
    result.visualisationManifest = manifest;
  }

  const metric = asString(base['metric'] ?? base['dependent_variable']);
  if (metric) {
    result.metric = metric;
  }

  const combination = toRecord(base['combination'] ?? base['combination_details']);
  if (combination) {
    result.combination = { ...combination };
  }

  const dimensions = normaliseDimensions(base['dimensions'] ?? base['dimension_combinations']);
  if (dimensions) {
    result.dimensions = dimensions;
  }

  const label = asString(base['label'] ?? base['title'] ?? base['metric_label']);
  if (label) {
    result.label = label;
  }

  const chartState = normaliseChartState(base['chartState'] ?? base['chart_state']);
  if (chartState) {
    result.chartState = chartState;
  }

  const featureContext = normaliseFeatureContext(base['featureContext'] ?? base['feature_context']);
  if (featureContext) {
    result.featureContext = featureContext;
  }

  const statisticalDetails = normaliseStatistics(base['statisticalDetails'] ?? base['statistical_details']);
  if (statisticalDetails) {
    result.statisticalDetails = statisticalDetails;
  }

  const skuRow = toRecord(base['skuRow'] ?? base['sku_row']);
  if (skuRow) {
    result.skuRow = skuRow;
  }

  const capturedAt = asString(base['capturedAt'] ?? base['captured_at']);
  if (capturedAt) {
    result.capturedAt = capturedAt;
  }

  const skuStatisticsSettings = normaliseSkuStatisticsSettings(
    base['skuStatisticsSettings'] ?? base['sku_statistics_settings'],
  );
  if (skuStatisticsSettings) {
    result.skuStatisticsSettings = skuStatisticsSettings;
  }

  const selections = ensureRecordArray(base['exhibitionSelections'] ?? base['exhibition_selections']);
  const primarySelection = selections.length > 0 ? selections[0] : null;
  const primarySelectionRecord = primarySelection ? toRecord(primarySelection) : null;
  const selectionNested = primarySelectionRecord?.metadata && isRecord(primarySelectionRecord.metadata)
    ? { ...primarySelectionRecord, ...(primarySelectionRecord.metadata as Record<string, unknown>) }
    : primarySelectionRecord ?? null;

  if (selectionNested) {
    if (!result.metric) {
      const fallbackMetric = asString(selectionNested['metric'] ?? selectionNested['dependent_variable']);
      if (fallbackMetric) {
        result.metric = fallbackMetric;
      }
    }

    if (!result.combination) {
      const selectionCombination = toRecord(selectionNested['combination'] ?? selectionNested['combination_details']);
      if (selectionCombination) {
        result.combination = { ...selectionCombination };
      }
    }

    if (!result.dimensions) {
      const selectionDimensions = normaliseDimensions(
        selectionNested['dimensions'] ?? selectionNested['dimension_combinations'],
      );
      if (selectionDimensions) {
        result.dimensions = selectionDimensions;
      }
    }

    if (!result.label) {
      const selectionLabel = asString(
        selectionNested['label'] ?? selectionNested['title'] ?? selectionNested['metric_label'],
      );
      if (selectionLabel) {
        result.label = selectionLabel;
      }
    }

    if (!result.chartState) {
      const selectionChartState = normaliseChartState(
        selectionNested['chartState'] ?? selectionNested['chart_state'],
      );
      if (selectionChartState) {
        result.chartState = selectionChartState;
      }
    }

    if (!result.featureContext) {
      const selectionFeatureContext = normaliseFeatureContext(
        selectionNested['featureContext'] ?? selectionNested['feature_context'],
      );
      if (selectionFeatureContext) {
        result.featureContext = selectionFeatureContext;
      }
    }

    if (!result.statisticalDetails) {
      const selectionStats = normaliseStatistics(
        selectionNested['statisticalDetails'] ?? selectionNested['statistical_details'],
      );
      if (selectionStats) {
        result.statisticalDetails = selectionStats;
      }
    }

    if (!result.skuRow) {
      const selectionSkuRow = toRecord(selectionNested['skuRow'] ?? selectionNested['sku_row']);
      if (selectionSkuRow) {
        result.skuRow = selectionSkuRow;
      }
    }

    if (!result.capturedAt) {
      const selectionCapturedAt = asString(
        selectionNested['capturedAt'] ?? selectionNested['captured_at'],
      );
      if (selectionCapturedAt) {
        result.capturedAt = selectionCapturedAt;
      }
    }

    if (!result.skuStatisticsSettings) {
      const selectionSkuSettings = normaliseSkuStatisticsSettings(
        selectionNested['skuStatisticsSettings'] ?? selectionNested['sku_statistics_settings'],
      );
      if (selectionSkuSettings) {
        result.skuStatisticsSettings = selectionSkuSettings;
      }
    }
  }

  if ('chartRendererProps' in base || 'chart_renderer_props' in base) {
    result.chartRendererProps = parsePossibleJson(
      base['chartRendererProps'] ?? base['chart_renderer_props'],
    );
  }

  if ('chartRendererConfig' in base || 'chart_renderer_config' in base) {
    result.chartRendererConfig = parsePossibleJson(
      base['chartRendererConfig'] ?? base['chart_renderer_config'],
    );
  }

  if ('chartConfig' in base) {
    result.chartConfig = parsePossibleJson(base['chartConfig']);
  }

  if ('chart_config' in base) {
    result.chart_config = parsePossibleJson(base['chart_config']);
  }

  if (!result.chartRendererProps && selectionNested && ('chartRendererProps' in selectionNested || 'chart_renderer_props' in selectionNested)) {
    result.chartRendererProps = parsePossibleJson(
      selectionNested['chartRendererProps'] ?? selectionNested['chart_renderer_props'],
    );
  }

  if (!result.chartRendererConfig && selectionNested && ('chartRendererConfig' in selectionNested || 'chart_renderer_config' in selectionNested)) {
    result.chartRendererConfig = parsePossibleJson(
      selectionNested['chartRendererConfig'] ?? selectionNested['chart_renderer_config'],
    );
  }

  if (!result.chartConfig && selectionNested && 'chartConfig' in selectionNested) {
    result.chartConfig = parsePossibleJson(selectionNested['chartConfig']);
  }

  if (!result.chart_config && selectionNested && 'chart_config' in selectionNested) {
    result.chart_config = parsePossibleJson(selectionNested['chart_config']);
  }

  const baseViewType = normaliseViewType(base['viewType'] ?? base['view_type']);
  const selectionViewType = selectionNested
    ? normaliseViewType(selectionNested['viewType'] ?? selectionNested['view_type'])
    : undefined;
  result.viewType = baseViewType ?? selectionViewType ?? (manifest?.view ? normaliseViewType(manifest.view) : undefined);

  if (!result.chartState && manifest?.vizSpec?.config) {
    const { config } = manifest.vizSpec;
    result.chartState = {
      chartType: config.type,
      theme: config.theme,
      showDataLabels: config.showDataLabels,
      showAxisLabels: config.showAxisLabels,
      showGrid: config.showGrid,
      showLegend: config.showLegend,
      xAxisField: config.xField,
      yAxisField: config.yField,
      colorPalette: Array.isArray(config.colors) ? [...config.colors] : undefined,
      legendField: config.legendField,
      xAxisLabel: config.xAxisLabel,
      yAxisLabel: config.yAxisLabel,
      sortOrder: config.sortOrder ?? null,
    };
  }

  if (!result.statisticalDetails && manifest?.chartData) {
    const stats: FeatureOverviewStatistics = {};
    const summaryRecord = toRecord(manifest.chartData['summary']);
    if (summaryRecord) {
      stats.summary = { ...summaryRecord };
    }
    const timeseriesRecords = ensureRecordArray(manifest.chartData['timeseries']);
    if (timeseriesRecords.length > 0) {
      stats.timeseries = timeseriesRecords;
    }
    const fullRecord = toRecord(manifest.chartData['full']);
    if (fullRecord) {
      stats.full = { ...fullRecord };
    }
    if (Object.keys(stats).length > 0) {
      result.statisticalDetails = stats;
    }
  }

  if (!result.skuRow && manifest?.skuData) {
    result.skuRow = { ...manifest.skuData };
  }

  if (!result.capturedAt && manifest?.createdAt) {
    result.capturedAt = manifest.createdAt;
  }

  if (!result.skuStatisticsSettings && manifest?.chartData) {
    const manifestSkuSettings = normaliseSkuStatisticsSettings(manifest.chartData['skuStatisticsSettings']);
    if (manifestSkuSettings) {
      result.skuStatisticsSettings = manifestSkuSettings;
    }
  }

  return result;
};

export const renderSummaryEntries = (entries: Array<[string, unknown]>) => {
  if (entries.length === 0) {
    return null;
  }

  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-xl bg-muted/25 p-3">
          <dt className="text-xs font-semibold uppercase text-muted-foreground">{humanize(key)}</dt>
          <dd className="text-base font-semibold text-foreground">{formatCell(value)}</dd>
        </div>
      ))}
    </dl>
  );
};

export const renderSkuDetails = (entries: Array<[string, unknown]>) => {
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border/60 bg-muted/15 p-4">
      <div className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Highlighted SKU</div>
      <dl className="grid gap-2 sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <div key={key} className="rounded-lg bg-background/70 p-3">
            <dt className="text-xs font-semibold uppercase text-muted-foreground">{humanize(key)}</dt>
            <dd className="text-sm text-foreground">{formatCell(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};

export const renderContextEntries = (
  entries: ReturnType<typeof buildContextEntries>,
): React.ReactNode => {
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
      {entries.map(entry => (
        <div key={entry.label}>
          <span className="font-semibold text-foreground">{entry.label}:</span> {entry.value}
        </div>
      ))}
    </div>
  );
};

export const renderDimensions = (dimensions: ReturnType<typeof collectDimensions>) => {
  if (dimensions.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {dimensions.map((dimension, index) => (
        <Badge key={`${dimension.name}-${dimension.value}-${index}`} variant="outline" className="text-xs">
          {dimension.name ? `${humanize(dimension.name)}: ` : ''}
          {dimension.value || '—'}
        </Badge>
      ))}
    </div>
  );
};

export const renderCombinationEntries = (entries: ReturnType<typeof collectCombinationEntries>) => {
  if (entries.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-2 text-sm sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-xl bg-muted/25 p-3">
          <div className="text-xs font-semibold uppercase text-muted-foreground">{humanize(key)}</div>
          <div className="text-sm text-foreground">{formatCell(value)}</div>
        </div>
      ))}
    </div>
  );
};
