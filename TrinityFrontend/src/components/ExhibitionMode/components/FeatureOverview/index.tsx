import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import RechartsChartRenderer from '@/templates/charts/RechartsChartRenderer';
import TableTemplate from '@/templates/tables/table';

interface FeatureOverviewProps {
  metadata?: Record<string, unknown> | null;
  variant?: 'full' | 'compact';
}

type ChartRendererType = 'bar_chart' | 'line_chart' | 'area_chart' | 'pie_chart' | 'scatter_chart';

type ChartRendererConfig = {
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
};

interface FeatureOverviewDimension {
  name?: string;
  value?: string;
}

interface FeatureOverviewChartState {
  chartType?: string;
  theme?: string;
  showDataLabels?: boolean;
  showAxisLabels?: boolean;
  showGrid?: boolean;
  showLegend?: boolean;
  xAxisField?: string;
  yAxisField?: string;
  colorPalette?: string[];
  legendField?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  sortOrder?: 'asc' | 'desc' | null;
}

interface FeatureOverviewStatistics {
  summary?: Record<string, unknown>;
  timeseries?: Array<Record<string, unknown>>;
  full?: Record<string, unknown>;
}

interface FeatureOverviewFeatureContext {
  dataSource?: string;
  availableMetrics?: string[];
  xAxis?: string;
  dimensionMap?: Record<string, string[]>;
}

interface FeatureOverviewSkuStatisticsSettings {
  visibility?: Record<string, boolean>;
  tableRows?: Array<Record<string, unknown>>;
  tableColumns?: string[];
}

interface FeatureOverviewMetadata {
  metric?: string;
  combination?: Record<string, unknown>;
  dimensions?: FeatureOverviewDimension[];
  label?: string;
  chartState?: FeatureOverviewChartState;
  featureContext?: FeatureOverviewFeatureContext;
  statisticalDetails?: FeatureOverviewStatistics;
  skuRow?: Record<string, unknown>;
  capturedAt?: string;
  skuStatisticsSettings?: FeatureOverviewSkuStatisticsSettings;
  chartRendererProps?: unknown;
  chartRendererConfig?: unknown;
  chart_config?: unknown;
  chartConfig?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const ensureRecordArray = (value: unknown): Array<Record<string, unknown>> => {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord) as Array<Record<string, unknown>>;
};

const humanize = (value: string): string =>
  value
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(.)/, (char: string) => char.toUpperCase());

const formatCell = (value: unknown): string => {
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

const deriveChartConfig = (
  metadata: FeatureOverviewMetadata,
  variant: 'full' | 'compact',
): ChartRendererConfig | null =>
  parseDirectChartRendererConfig(metadata, variant) ?? createChartRendererConfig(metadata, variant);

const extractSummaryEntries = (
  stats: FeatureOverviewStatistics | undefined,
): Array<[string, unknown]> => {
  if (!stats || !isRecord(stats.summary)) {
    return [];
  }

  return Object.entries(stats.summary).filter(([, value]) => value != null && typeof value !== 'object');
};

const buildSkuTableModel = (
  settings: FeatureOverviewSkuStatisticsSettings | undefined,
  variant: 'full' | 'compact',
) => {
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

const extractSkuRowEntries = (skuRow: Record<string, unknown> | undefined) => {
  if (!isRecord(skuRow)) {
    return [];
  }

  return Object.entries(skuRow).filter(([, value]) => value != null && typeof value !== 'object');
};

const FeatureOverview: React.FC<FeatureOverviewProps> = ({ metadata, variant = 'full' }) => {
  const parsedMetadata = useMemo<FeatureOverviewMetadata | null>(() => {
    if (!isRecord(metadata)) {
      return null;
    }
    return metadata as FeatureOverviewMetadata;
  }, [metadata]);

  const chartConfig = useMemo(() => {
    if (!parsedMetadata) return null;
    return deriveChartConfig(parsedMetadata, variant);
  }, [parsedMetadata, variant]);

  if (!parsedMetadata) {
    return <p className="text-sm text-muted-foreground">No exhibition data available for this component yet.</p>;
  }

  const dimensions = Array.isArray(parsedMetadata.dimensions)
    ? parsedMetadata.dimensions.filter(dimension => dimension && (dimension.name || dimension.value))
    : [];

  const combinationEntries = parsedMetadata.combination && isRecord(parsedMetadata.combination)
    ? Object.entries(parsedMetadata.combination)
    : [];

  const summaryEntries = useMemo(
    () => extractSummaryEntries(parsedMetadata.statisticalDetails),
    [parsedMetadata.statisticalDetails],
  );

  const skuTableModel = useMemo(
    () => buildSkuTableModel(parsedMetadata.skuStatisticsSettings, variant),
    [parsedMetadata.skuStatisticsSettings, variant],
  );

  const skuRowEntries = useMemo(
    () => extractSkuRowEntries(parsedMetadata.skuRow),
    [parsedMetadata.skuRow],
  );

  const contextEntries = [
    parsedMetadata.featureContext?.dataSource
      ? { label: 'Data source', value: parsedMetadata.featureContext.dataSource }
      : null,
    parsedMetadata.featureContext?.xAxis
      ? { label: 'X-axis', value: parsedMetadata.featureContext.xAxis }
      : null,
    parsedMetadata.capturedAt
      ? {
          label: 'Captured',
          value: new Date(parsedMetadata.capturedAt).toLocaleString(),
        }
      : null,
  ].filter((entry): entry is { label: string; value: string } => Boolean(entry));

  return (
    <div className="space-y-4">
      {dimensions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {dimensions.map((dimension, index) => (
            <Badge key={`${dimension.name}-${dimension.value}-${index}`} variant="outline" className="text-xs">
              {dimension.name ? `${humanize(dimension.name)}: ` : ''}
              {dimension.value || '—'}
            </Badge>
          ))}
        </div>
      )}

      {combinationEntries.length > 0 && (
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          {combinationEntries.map(([key, value]) => (
            <div key={key} className="rounded-xl bg-muted/25 p-3">
              <div className="text-xs font-semibold uppercase text-muted-foreground">{humanize(key)}</div>
              <div className="text-sm text-foreground">{formatCell(value)}</div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-border bg-background/80 p-4 shadow-sm">
        {chartConfig ? (
          <RechartsChartRenderer {...chartConfig} />
        ) : (
          <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            Chart data will appear here after the component captures a visualization in laboratory mode.
          </div>
        )}
      </div>

      {summaryEntries.length > 0 && (
        <dl className="grid gap-3 sm:grid-cols-2">
          {summaryEntries.map(([key, value]) => (
            <div key={key} className="rounded-xl bg-muted/25 p-3">
              <dt className="text-xs font-semibold uppercase text-muted-foreground">{humanize(key)}</dt>
              <dd className="text-base font-semibold text-foreground">{formatCell(value)}</dd>
            </div>
          ))}
        </dl>
      )}

      {skuTableModel && (
        <TableTemplate
          minimizable={false}
          headers={skuTableModel.columns.map(column => (
            <span key={column} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {humanize(column)}
            </span>
          ))}
          customHeader={{
            title: 'Sample combinations',
            subtitle:
              skuTableModel.rows.length < skuTableModel.total
                ? `Showing ${skuTableModel.rows.length} of ${skuTableModel.total}`
                : undefined,
          }}
          bodyClassName="max-h-none"
        >
          {skuTableModel.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="table-row">
              {skuTableModel.columns.map(column => (
                <td key={column} className="table-cell px-4 py-3 text-sm text-foreground/80">
                  {formatCell(row[column])}
                </td>
              ))}
            </tr>
          ))}
        </TableTemplate>
      )}

      {skuRowEntries.length > 0 && (
        <div className="rounded-xl border border-border/60 bg-muted/15 p-4">
          <div className="mb-3 text-xs font-semibold uppercase text-muted-foreground">Highlighted SKU</div>
          <dl className="grid gap-2 sm:grid-cols-2">
            {skuRowEntries.map(([key, value]) => (
              <div key={key} className="rounded-lg bg-background/70 p-3">
                <dt className="text-xs font-semibold uppercase text-muted-foreground">{humanize(key)}</dt>
                <dd className="text-sm text-foreground">{formatCell(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {contextEntries.length > 0 && (
        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          {contextEntries.map(entry => (
            <div key={entry.label}>
              <span className="font-semibold text-foreground">{entry.label}:</span> {entry.value}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FeatureOverview;
