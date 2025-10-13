import React from 'react';
import { Badge } from '@/components/ui/badge';
import RechartsChartRenderer from '@/templates/charts/RechartsChartRenderer';
import TableTemplate from '@/templates/tables/table';
import { FeatureOverviewMetadata, FeatureOverviewStatistics } from './types';

export const ensureArray = <T,>(value: unknown): T[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value as T[];
  return [];
};

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const ensureRecordArray = (value: unknown): Array<Record<string, unknown>> => {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord) as Array<Record<string, unknown>>;
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
  if (!isRecord(metadata)) {
    return null;
  }
  return metadata as FeatureOverviewMetadata;
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
