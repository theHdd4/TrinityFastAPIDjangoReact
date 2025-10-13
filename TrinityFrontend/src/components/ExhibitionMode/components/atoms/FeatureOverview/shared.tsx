import React from 'react';
import { Badge } from '@/components/ui/badge';
import RechartsChartRenderer from '@/templates/charts/RechartsChartRenderer';
import TableTemplate from '@/templates/tables/table';
import {
  FeatureOverviewChartState,
  FeatureOverviewDimension,
  FeatureOverviewFeatureContext,
  FeatureOverviewMetadata,
  FeatureOverviewSkuStatisticsSettings,
  FeatureOverviewStatistics,
  FeatureOverviewViewType,
} from './types';

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
  showAxisLabels?: boolean;
  showDataLabels?: boolean;
  showGrid?: boolean;
  sortOrder?: 'asc' | 'desc' | null;
}

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

const sanitizeTimeseries = (
  entries: Array<Record<string, unknown>>,
  xField: string,
  yField: string,
): Array<Record<string, unknown>> =>
  entries
    .map((entry, index) => {
      if (typeof entry[xField] === 'undefined' || entry[xField] === null) {
        return { ...entry, [xField]: index + 1 };
      }
      return entry;
    })
    .filter(entry => {
      const value = entry[yField];
      if (typeof value === 'number') {
        return Number.isFinite(value);
      }
      if (typeof value === 'string') {
        const parsed = Number(value);
        return Number.isFinite(parsed);
      }
      return false;
    });

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

  const height = variant === 'compact' ? 220 : 300;

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

  const height = variant === 'compact' ? 220 : 300;

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
  parseDirectChartRendererConfig(metadata, variant) ?? createChartRendererConfig(metadata, variant);

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

export const parseFeatureOverviewMetadata = (metadata: unknown): FeatureOverviewMetadata | null => {
  const record = toRecord(metadata);
  if (!record) {
    return null;
  }

  const nested = toRecord(record.metadata);
  const base = nested ? { ...record, ...nested } : record;

  const result: FeatureOverviewMetadata = {};

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

  const viewType = normaliseViewType(base['viewType'] ?? base['view_type']);
  result.viewType = viewType;

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
