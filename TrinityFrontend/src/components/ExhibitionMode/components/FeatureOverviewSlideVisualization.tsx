import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  AreaChart,
  Area,
  LabelList,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

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
  tableRows?: Record<string, unknown>[];
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
}

interface FeatureOverviewSlideVisualizationProps {
  metadata?: Record<string, unknown> | null;
  variant?: 'full' | 'compact';
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const humanize = (value: string | undefined): string => {
  if (!value) return '';
  return value
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(.)/, (char: string) => char.toUpperCase());
};

const toNumeric = (value: unknown): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const sanitizeTimeseries = (
  entries: Array<Record<string, unknown>>,
  xField: string,
  yField: string,
) =>
  entries
    .map((entry, index) => {
      const next = { ...entry };
      if (typeof next[xField] === 'undefined') {
        next[xField] = index + 1;
      }
      return next;
    })
    .filter(entry => toNumeric(entry[yField]) !== null);

const prepareChartData = (
  stats: FeatureOverviewStatistics | undefined,
  xField: string,
  yField: string,
) => {
  if (!stats) {
    return [];
  }

  if (Array.isArray(stats.timeseries) && stats.timeseries.length > 0) {
    return sanitizeTimeseries(stats.timeseries as Array<Record<string, unknown>>, xField, yField);
  }

  if (isRecord(stats.summary)) {
    return Object.entries(stats.summary)
      .filter(([, value]) => toNumeric(value) !== null)
      .map(([key, value]) => ({ [xField]: humanize(key), [yField]: toNumeric(value) }));
  }

  return [];
};

const renderChart = (
  chartType: string,
  data: Array<Record<string, unknown>>,
  xField: string,
  yField: string,
  color: string,
  height: number,
  options: FeatureOverviewChartState,
) => {
  if (data.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">
        Exhibition preview will appear here once the atom captures a chart.
      </div>
    );
  }

  const { showGrid = true, showAxisLabels = true, showLegend = true, showDataLabels = false } = options;

  const axisLabelFormatter = (value: unknown) =>
    typeof value === 'number' ? value.toLocaleString() : String(value);

  const axisProps = {
    tickLine: false,
    axisLine: false,
    fontSize: 12,
  } as const;

  const common = (
    <>
      {showGrid && <CartesianGrid strokeDasharray="3 3" opacity={0.2} />}
      <XAxis
        dataKey={xField}
        hide={!showAxisLabels}
        angle={0}
        tickMargin={12}
        {...axisProps}
      />
      <YAxis
        hide={!showAxisLabels}
        tickFormatter={axisLabelFormatter}
        width={80}
        {...axisProps}
      />
      <Tooltip formatter={value => (typeof value === 'number' ? value.toLocaleString() : value)} />
      {showLegend && <Legend />}
    </>
  );

  switch (chartType) {
    case 'bar_chart':
      return (
        <ResponsiveContainer width="100%" height={height}>
          <BarChart data={data}>
            {common}
            <Bar dataKey={yField} fill={color} radius={[8, 8, 0, 0]}>
              {showDataLabels && (
                <LabelList dataKey={yField} position="top" formatter={axisLabelFormatter} className="text-xs" />
              )}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      );
    case 'area_chart':
      return (
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={data}>
            {common}
            <Area dataKey={yField} fill={color} stroke={color} strokeWidth={2} type="monotone">
              {showDataLabels && (
                <LabelList dataKey={yField} position="top" formatter={axisLabelFormatter} className="text-xs" />
              )}
            </Area>
          </AreaChart>
        </ResponsiveContainer>
      );
    case 'line_chart':
    default:
      return (
        <ResponsiveContainer width="100%" height={height}>
          <LineChart data={data}>
            {common}
            <Line type="monotone" dataKey={yField} stroke={color} strokeWidth={3} dot={showDataLabels}>
              {showDataLabels && (
                <LabelList dataKey={yField} position="top" formatter={axisLabelFormatter} className="text-xs" />
              )}
            </Line>
          </LineChart>
        </ResponsiveContainer>
      );
  }
};

const renderSummary = (stats: FeatureOverviewStatistics | undefined) => {
  if (!stats || !isRecord(stats.summary)) {
    return null;
  }

  const entries = Object.entries(stats.summary).filter(([, value]) =>
    value != null && typeof value !== 'object',
  );
  if (entries.length === 0) {
    return null;
  }

  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key} className="rounded-xl bg-muted/25 p-3">
          <dt className="text-xs font-semibold uppercase text-muted-foreground">{humanize(key)}</dt>
          <dd className="text-base font-semibold text-foreground">
            {typeof value === 'number' ? value.toLocaleString() : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
};

const renderSkuTable = (
  settings: FeatureOverviewSkuStatisticsSettings | undefined,
  variant: 'full' | 'compact',
) => {
  if (!settings) {
    return null;
  }

  const rows = Array.isArray(settings.tableRows) ? settings.tableRows : [];
  const columns = Array.isArray(settings.tableColumns) ? settings.tableColumns : [];

  if (rows.length === 0 || columns.length === 0) {
    return null;
  }

  const limit = variant === 'compact' ? 2 : 4;
  const displayedRows = rows.slice(0, limit);

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase text-muted-foreground">Sample combinations</div>
      <div className="overflow-hidden rounded-xl border border-border">
        <ScrollArea className="max-h-48">
          <table className="w-full border-collapse text-xs">
            <thead className="bg-muted/40 text-muted-foreground">
              <tr>
                {columns.map(column => (
                  <th key={String(column)} className="px-3 py-2 text-left font-medium">
                    {humanize(typeof column === 'string' ? column : String(column))}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedRows.map((row, index) => (
                <tr key={index} className={index % 2 === 0 ? 'bg-background' : 'bg-muted/10'}>
                  {columns.map(column => {
                    const key = typeof column === 'string' ? column : String(column);
                    const cellValue = (row as Record<string, unknown>)[key];
                    return (
                      <td key={key} className="px-3 py-2 text-muted-foreground">
                        {formatCell(cellValue)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollArea>
      </div>
    </div>
  );
};

const formatCell = (value: unknown): string => {
  if (value == null) {
    return '—';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toLocaleString() : String(value);
  }
  if (value instanceof Date) {
    return value.toLocaleString();
  }
  return String(value);
};

const FeatureOverviewSlideVisualization: React.FC<FeatureOverviewSlideVisualizationProps> = ({
  metadata,
  variant = 'full',
}) => {
  const parsedMetadata: FeatureOverviewMetadata | null = useMemo(() => {
    if (!isRecord(metadata)) {
      return null;
    }
    return metadata as FeatureOverviewMetadata;
  }, [metadata]);

  if (!parsedMetadata) {
    return (
      <p className="text-sm text-muted-foreground">No exhibition data available for this component yet.</p>
    );
  }

  const dimensions = Array.isArray(parsedMetadata.dimensions)
    ? parsedMetadata.dimensions.filter(dimension => dimension && (dimension.name || dimension.value))
    : [];

  const combinationEntries = parsedMetadata.combination && isRecord(parsedMetadata.combination)
    ? Object.entries(parsedMetadata.combination)
    : [];

  const chartState: FeatureOverviewChartState = parsedMetadata.chartState ?? {};
  const chartType = typeof chartState.chartType === 'string' ? chartState.chartType : 'line_chart';
  const xField = chartState.xAxisField || 'index';
  const yField = chartState.yAxisField || parsedMetadata.metric || 'value';
  const colorPalette = Array.isArray(chartState.colorPalette) && chartState.colorPalette.length > 0
    ? chartState.colorPalette
    : undefined;
  const accentColor = colorPalette?.[0] || 'hsl(var(--primary))';

  const chartData = useMemo(
    () => prepareChartData(parsedMetadata.statisticalDetails, xField, yField),
    [parsedMetadata.statisticalDetails, xField, yField],
  );

  const chartHeight = variant === 'compact' ? 180 : 240;

  return (
    <div className="space-y-4">
      {dimensions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {dimensions.map((dimension, index) => (
            <Badge key={`${dimension.name}-${dimension.value}-${index}`} variant="outline" className="text-xs">
              {humanize(dimension.name)}: {dimension.value || '—'}
            </Badge>
          ))}
        </div>
      )}

      {combinationEntries.length > 0 && (
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          {combinationEntries.map(([key, value]) => (
            <div key={key} className="rounded-lg bg-muted/25 p-3">
              <div className="text-xs font-semibold uppercase text-muted-foreground">{humanize(key)}</div>
              <div className="text-sm text-foreground">{formatCell(value)}</div>
            </div>
          ))}
        </div>
      )}

      {renderSummary(parsedMetadata.statisticalDetails)}

      <div className="rounded-2xl border border-border bg-background/80 p-3 shadow-inner">
        {renderChart(chartType, chartData, xField, yField, accentColor, chartHeight, chartState)}
      </div>

      {parsedMetadata.featureContext && (
        <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          {parsedMetadata.featureContext.dataSource && (
            <div>
              <span className="font-semibold text-foreground">Data:</span> {parsedMetadata.featureContext.dataSource}
            </div>
          )}
          {parsedMetadata.featureContext.xAxis && (
            <div>
              <span className="font-semibold text-foreground">X Axis:</span> {parsedMetadata.featureContext.xAxis}
            </div>
          )}
          {Array.isArray(parsedMetadata.featureContext.availableMetrics) &&
            parsedMetadata.featureContext.availableMetrics.length > 0 && (
              <div className="sm:col-span-2">
                <span className="font-semibold text-foreground">Available metrics:</span>{' '}
                {parsedMetadata.featureContext.availableMetrics.join(', ')}
              </div>
            )}
        </div>
      )}

      {parsedMetadata.capturedAt && (
        <div className="text-xs text-muted-foreground">
          Captured on{' '}
          <span className="font-medium text-foreground">
            {new Date(parsedMetadata.capturedAt).toLocaleString()}
          </span>
        </div>
      )}

      {renderSkuTable(parsedMetadata.skuStatisticsSettings, variant)}
    </div>
  );
};

export default FeatureOverviewSlideVisualization;
