import React, { useMemo } from 'react';
import TextBoxDisplay from '@/components/AtomList/atoms/text-box/TextBoxDisplay';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import RechartsChartRenderer from '@/templates/charts/RechartsChartRenderer';
import TableTemplate from '@/templates/tables/table';
import type { DroppedAtom } from '../store/exhibitionStore';
import FeatureOverviewSlideVisualization from './FeatureOverviewSlideVisualization';

interface ExhibitedAtomRendererProps {
  atom: DroppedAtom;
  variant?: 'full' | 'compact';
}

type AtomMetadata = Record<string, unknown> | undefined;

type TableRow = Record<string, unknown>;

interface TablePreviewData {
  headers: string[];
  rows: TableRow[];
}

type ChartKind = 'bar' | 'line' | 'area' | 'pie';

interface ChartPreviewSeries {
  key: string;
}

interface ChartPreviewSpec {
  type: ChartKind;
  xKey: string;
  series: ChartPreviewSeries[];
  data: Array<Record<string, unknown>>;
}

interface ChartStateMetadata {
  chartType?: string;
  theme?: string;
  showLegend?: boolean;
  showAxisLabels?: boolean;
  showDataLabels?: boolean;
  showGrid?: boolean;
  xAxisField?: string;
  yAxisField?: string;
  colorPalette?: string[];
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  legendField?: string;
}

type ChartRendererType = 'bar_chart' | 'line_chart' | 'area_chart' | 'pie_chart';

interface ChartRendererConfig {
  type: ChartRendererType;
  data: Array<Record<string, unknown>>;
  height: number;
  xField?: string;
  yField?: string;
  yFields?: string[];
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
}

const ensureArray = <T,>(value: unknown): T[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value as T[];
  return [];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const humanize = (value: string): string => {
  return value
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(.)/, (char: string) => char.toUpperCase());
};

const formatValue = (value: unknown): string => {
  if (value == null) {
    return '—';
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toLocaleString() : String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  return String(value);
};

const extractTableData = (metadata: AtomMetadata): TablePreviewData | null => {
  if (!metadata) {
    return null;
  }

  const candidates: Array<unknown> = [
    metadata['tableData'],
    metadata['previewTable'],
    metadata['table'],
    metadata['data'],
    metadata['rows'],
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    if (isRecord(candidate)) {
      const headers = ensureArray<string>(candidate.headers);
      const rows = ensureArray<TableRow>(candidate.rows);

      if (headers.length > 0 && rows.length > 0) {
        return { headers, rows };
      }

      if (Array.isArray(candidate.data)) {
        const derivedRows = candidate.data.filter(isRecord) as TableRow[];
        if (derivedRows.length > 0) {
          const derivedHeaders = Object.keys(derivedRows[0]);
          if (derivedHeaders.length > 0) {
            return {
              headers: derivedHeaders,
              rows: derivedRows,
            };
          }
        }
      }
    }

    if (Array.isArray(candidate) && candidate.length > 0 && isRecord(candidate[0])) {
      const rows = candidate as TableRow[];
      const headers = Object.keys(rows[0]);
      if (headers.length > 0) {
        return {
          headers,
          rows,
        };
      }
    }
  }

  return null;
};

const deriveNumericKeys = (sample: Record<string, unknown>): string[] => {
  return Object.entries(sample)
    .filter(([, value]) => {
      if (typeof value === 'number') {
        return Number.isFinite(value);
      }
      const parsed = Number(value);
      return Number.isFinite(parsed);
    })
    .map(([key]) => key);
};

const deriveCategoricalKey = (sample: Record<string, unknown>): string => {
  const preferred = ['x', 'label', 'category', 'name'];
  for (const key of preferred) {
    if (key in sample) {
      return key;
    }
  }

  const stringEntry = Object.entries(sample).find(([, value]) => typeof value === 'string');
  if (stringEntry) {
    return stringEntry[0];
  }

  return 'index';
};

const normaliseMultiSeriesData = (
  data: Array<Record<string, unknown>>,
  series: ChartPreviewSeries[],
  xKey: string,
) => {
  const grouped: Record<string | number, Record<string, unknown>> = {};

  data.forEach((entry, index) => {
    if (!isRecord(entry)) return;
    const key = (entry[xKey] as string | number | undefined) ?? index;
    if (!grouped[key]) {
      grouped[key] = { [xKey]: key };
    }

    series.forEach(serie => {
      if (entry[serie.key] != null) {
        const rawValue = entry[serie.key];
        const numeric = typeof rawValue === 'number' ? rawValue : Number(rawValue);
        if (Number.isFinite(numeric)) {
          grouped[key][serie.key] = numeric;
        }
      }
    });
  });

  return Object.values(grouped);
};

const extractChartSpec = (metadata: AtomMetadata): ChartPreviewSpec | null => {
  if (!metadata) {
    return null;
  }

  const candidateRaw =
    metadata['chartData'] ??
    metadata['chart_data'] ??
    metadata['chart'] ??
    metadata['chartMetadata'] ??
    metadata['chart_metadata'] ??
    metadata['chartState'] ??
    metadata['visualisation'] ??
    metadata['visualization'];

  const candidateRecord = isRecord(candidateRaw) ? candidateRaw : undefined;

  const rawSource = Array.isArray(candidateRaw)
    ? candidateRaw
    : Array.isArray(candidateRecord?.['data'])
      ? candidateRecord?.['data']
      : Array.isArray(metadata['data'])
        ? metadata['data']
        : null;

  if (!rawSource || rawSource.length === 0) {
    return null;
  }

  const rawRecords = (rawSource as unknown[]).filter(isRecord) as Array<Record<string, unknown>>;
  if (rawRecords.length === 0) {
    return null;
  }

  const chartTypeRaw =
    (candidateRecord &&
      ((candidateRecord['chart_type'] as string | undefined) ??
        (candidateRecord['type'] as string | undefined))) ??
    (metadata && (metadata['chartType'] as string | undefined)) ??
    (metadata && (metadata['chart_type'] as string | undefined)) ??
    (metadata && (metadata['type'] as string | undefined));

  const chartType = typeof chartTypeRaw === 'string' ? chartTypeRaw.toLowerCase() : '';
  const sample = rawRecords[0];

  const possiblePie =
    sample &&
    ((typeof sample.value === 'number' && ('label' in sample || 'name' in sample)) ||
      (typeof sample.y === 'number' && ('x' in sample || 'label' in sample)));

  if (possiblePie || chartType.includes('pie')) {
    const labelKey = 'label' in sample ? 'label' : 'name' in sample ? 'name' : 'x' in sample ? 'x' : deriveCategoricalKey(sample);
    const valueKey = 'value' in sample ? 'value' : 'y' in sample ? 'y' : deriveNumericKeys(sample)[0];
    if (!valueKey) {
      return null;
    }

    const data = rawRecords
      .map((entry, index) => {
        const label = (entry[labelKey] as string | number | undefined) ?? `Slice ${index + 1}`;
        const rawValue = entry[valueKey];
        const numeric = typeof rawValue === 'number' ? rawValue : Number(rawValue);
        if (!Number.isFinite(numeric)) {
          return null;
        }
        return {
          name: label,
          value: numeric,
        };
      })
      .filter((item): item is { name: string | number; value: number } => item !== null);

    if (data.length === 0) {
      return null;
    }

    return {
      type: 'pie',
      xKey: 'name',
      series: [{ key: 'value' }],
      data,
    };
  }

  const numericKeys = deriveNumericKeys(sample);
  if (numericKeys.length === 0) {
    return null;
  }

  const xKey = deriveCategoricalKey(sample);
  const series = numericKeys.map(key => ({ key }));
  const data = normaliseMultiSeriesData(rawRecords, series, xKey);

  if (data.length === 0) {
    return null;
  }

  let type: ChartKind = 'bar';
  if (chartType.includes('line')) {
    type = 'line';
  } else if (chartType.includes('area')) {
    type = 'area';
  }

  return {
    type,
    xKey,
    series,
    data,
  };
};

const DEFAULT_CHART_COLORS = ['#458EE2', '#41C185', '#FFBD59', '#6B5CD5', '#E75A7C', '#5CC3E2'];

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0 ? value : undefined;

const asBoolean = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

const asStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const entries = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return entries.length > 0 ? entries : undefined;
};

const getMetadataString = (metadata: AtomMetadata, keys: string[]): string | undefined => {
  if (!metadata) {
    return undefined;
  }

  for (const key of keys) {
    const value = metadata[key];
    const result = asString(value);
    if (result) {
      return result;
    }
  }

  return undefined;
};

const extractChartState = (metadata: AtomMetadata): ChartStateMetadata | undefined => {
  if (!metadata) {
    return undefined;
  }

  const candidate = metadata['chartState'] ?? metadata['chart_state'] ?? metadata['chartConfig'] ?? metadata['chart_config'];
  if (!isRecord(candidate)) {
    return undefined;
  }

  return {
    chartType: asString(candidate['chartType'] ?? candidate['chart_type']),
    theme: asString(candidate['theme']),
    showLegend: asBoolean(candidate['showLegend'] ?? candidate['show_legend']),
    showAxisLabels: asBoolean(candidate['showAxisLabels'] ?? candidate['show_axis_labels']),
    showDataLabels: asBoolean(candidate['showDataLabels'] ?? candidate['show_data_labels']),
    showGrid: asBoolean(candidate['showGrid'] ?? candidate['show_grid']),
    xAxisField: asString(candidate['xAxisField'] ?? candidate['x_axis_field'] ?? candidate['xAxis']),
    yAxisField: asString(candidate['yAxisField'] ?? candidate['y_axis_field'] ?? candidate['yAxis']),
    colorPalette: asStringArray(candidate['colorPalette'] ?? candidate['color_palette']),
    title: asString(candidate['title']),
    xAxisLabel: asString(candidate['xAxisLabel'] ?? candidate['x_axis_label']),
    yAxisLabel: asString(candidate['yAxisLabel'] ?? candidate['y_axis_label']),
    legendField: asString(candidate['legendField'] ?? candidate['legend_field']),
  };
};

const extractColorPalette = (
  metadata: AtomMetadata,
  chartState: ChartStateMetadata | undefined,
  seriesLength: number,
): string[] | undefined => {
  const candidates = [
    chartState?.colorPalette,
    asStringArray(metadata?.['colors']),
    asStringArray(metadata?.['colorPalette']),
    asStringArray(metadata?.['palette']),
    asStringArray(metadata?.['seriesColors']),
    asStringArray(metadata?.['series_colors']),
    asStringArray(metadata?.['colorScheme']),
    asStringArray(metadata?.['color_scheme']),
  ];

  for (const candidate of candidates) {
    if (candidate && candidate.length > 0) {
      return candidate;
    }
  }

  if (seriesLength > 0) {
    return DEFAULT_CHART_COLORS.slice(0, Math.max(seriesLength, 1));
  }

  return undefined;
};

const createChartRendererConfig = (
  spec: ChartPreviewSpec,
  metadata: AtomMetadata,
  variant: 'full' | 'compact',
): ChartRendererConfig | null => {
  const chartState = extractChartState(metadata ?? {});
  const height = variant === 'compact' ? 240 : 360;
  const typeMap: Record<ChartKind, ChartRendererType> = {
    bar: 'bar_chart',
    line: 'line_chart',
    area: 'area_chart',
    pie: 'pie_chart',
  };

  const base: ChartRendererConfig = {
    type: typeMap[spec.type],
    data: spec.data,
    height,
  };

  const colorPalette = extractColorPalette(metadata, chartState, spec.series.length);
  const metadataTitle = getMetadataString(metadata, ['chartTitle', 'chart_title', 'title']);
  const metadataXAxis = getMetadataString(metadata, ['xAxisLabel', 'x_axis_label', 'xAxis', 'x_axis']);
  const metadataYAxis = getMetadataString(metadata, ['yAxisLabel', 'y_axis_label', 'yAxis', 'y_axis']);
  const metadataLegendField = getMetadataString(metadata, ['legendField', 'legend_field']);

  if (spec.type === 'pie') {
    base.xField = 'name';
    base.yField = 'value';
    base.legendField = chartState?.legendField ?? metadataLegendField ?? 'name';
    base.colors = colorPalette;
    base.showLegend = chartState?.showLegend ?? true;
  } else {
    const primarySeries = spec.series[0];
    if (!primarySeries) {
      return null;
    }
    base.xField = chartState?.xAxisField ?? spec.xKey;
    base.yField = chartState?.yAxisField ?? primarySeries.key;
    if (spec.series.length > 1) {
      base.yFields = spec.series.map(series => series.key);
      base.showLegend = chartState?.showLegend ?? true;
    } else if (chartState?.showLegend !== undefined) {
      base.showLegend = chartState.showLegend;
    }
    base.colors = colorPalette;
    if (chartState?.legendField || metadataLegendField) {
      base.legendField = chartState?.legendField ?? metadataLegendField;
    }
  }

  base.theme = chartState?.theme ?? getMetadataString(metadata, ['theme']);
  base.title = chartState?.title ?? metadataTitle;
  base.xAxisLabel = chartState?.xAxisLabel ?? metadataXAxis;
  base.yAxisLabel = chartState?.yAxisLabel ?? metadataYAxis;

  if (chartState?.showAxisLabels !== undefined) {
    base.showAxisLabels = chartState.showAxisLabels;
  }
  if (chartState?.showDataLabels !== undefined) {
    base.showDataLabels = chartState.showDataLabels;
  }
  if (chartState?.showGrid !== undefined) {
    base.showGrid = chartState.showGrid;
  }

  if (!base.xAxisLabel && typeof base.xField === 'string') {
    base.xAxisLabel = humanize(base.xField);
  }
  if (!base.yAxisLabel && typeof base.yField === 'string') {
    base.yAxisLabel = humanize(base.yField);
  }

  return base;
};

const renderTableTemplate = (table: TablePreviewData, variant: 'full' | 'compact') => {
  const rowLimit = variant === 'compact' ? 6 : 12;
  const rows = table.rows.slice(0, rowLimit);

  return (
    <div className="space-y-2">
      <TableTemplate
        headers={table.headers.map(header => (
          <span key={header} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {header}
          </span>
        ))}
        minimizable={false}
        bodyClassName="max-h-72"
        borderColor="border-purple-500"
      >
        {rows.map((row, index) => (
          <tr key={`row-${index}`} className="odd:bg-muted/20 even:bg-background">
            {table.headers.map(header => (
              <td key={header} className="px-4 py-2 text-sm text-foreground/80">
                {formatValue(row[header])}
              </td>
            ))}
          </tr>
        ))}
      </TableTemplate>
      {table.rows.length > rows.length && (
        <div className="text-xs text-muted-foreground">
          Showing {rows.length.toLocaleString()} of {table.rows.length.toLocaleString()} rows
        </div>
      )}
    </div>
  );
};

const renderHtmlPreview = (metadata: AtomMetadata) => {
  if (!metadata) {
    return null;
  }

  const html =
    (typeof metadata['previewHtml'] === 'string' && metadata['previewHtml']) ||
    (typeof metadata['html'] === 'string' && metadata['html']) ||
    (typeof metadata['rendered'] === 'string' && metadata['rendered']);

  if (!html) {
    return null;
  }

  return (
    <div
      className="prose prose-sm max-w-none dark:prose-invert"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

const DefaultExhibitedAtom: React.FC<
  ExhibitedAtomRendererProps & { metadata: AtomMetadata }
> = ({ atom, variant, metadata }) => {
  const safeMetadata = metadata ?? {};
  const simpleEntries = Object.entries(safeMetadata).filter(([, value]) =>
    value == null || ['string', 'number', 'boolean'].includes(typeof value),
  );
  const complexEntries = Object.entries(safeMetadata).filter(([, value]) =>
    value != null && typeof value === 'object',
  );

  if (simpleEntries.length === 0 && complexEntries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This component is ready for exhibition. Configure it in Laboratory mode to capture a visual preview.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {simpleEntries.length > 0 && (
        <dl
          className={cn(
            'grid gap-2 text-sm',
            variant === 'compact' ? 'grid-cols-1' : 'grid-cols-2',
          )}
        >
          {simpleEntries.map(([key, value]) => (
            <div key={key} className="rounded-lg bg-muted/30 p-3">
              <dt className="text-xs font-semibold uppercase text-muted-foreground">
                {humanize(key)}
              </dt>
              <dd className="text-sm text-foreground">{formatValue(value)}</dd>
            </div>
          ))}
        </dl>
      )}

      {complexEntries.map(([key, value]) => (
        <div key={key} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {humanize(key)}
          </p>
          <pre className="max-h-48 overflow-auto rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
            {JSON.stringify(value, null, 2)}
          </pre>
        </div>
      ))}
    </div>
  );
};

const ExhibitedAtomRenderer: React.FC<ExhibitedAtomRendererProps> = ({ atom, variant = 'full' }) => {
  const metadata = useMemo<AtomMetadata>(
    () => (isRecord(atom.metadata) ? atom.metadata : undefined),
    [atom.metadata],
  );
  const tableData = useMemo(() => extractTableData(metadata), [metadata]);
  const chartSpec = useMemo(() => extractChartSpec(metadata), [metadata]);
  const chartConfig = useMemo(
    () => (chartSpec ? createChartRendererConfig(chartSpec, metadata, variant) : null),
    [chartSpec, metadata, variant],
  );
  const htmlPreview = useMemo(() => renderHtmlPreview(metadata), [metadata]);

  if (atom.atomId === 'text-box') {
    return (
      <div className={cn('rounded-2xl border border-border bg-muted/30 p-4', variant === 'compact' && 'p-3')}>
        <TextBoxDisplay textId={atom.id} />
      </div>
    );
  }

  if (atom.atomId === 'feature-overview') {
    return <FeatureOverviewSlideVisualization metadata={atom.metadata} variant={variant} />;
  }

  const previewImage = typeof metadata?.['previewImage'] === 'string' ? (metadata['previewImage'] as string) : undefined;

  if (previewImage && previewImage.length > 0) {
    return (
      <div className="rounded-2xl border border-border bg-background/80 p-4 shadow-sm">
        <img
          src={previewImage}
          alt={`${atom.title} preview`}
          className="w-full rounded-xl border border-border/40 object-contain"
        />
      </div>
    );
  }

  if (tableData) {
    return renderTableTemplate(tableData, variant);
  }

  if (chartConfig) {
    return (
      <div className="rounded-2xl border border-border bg-background/80 p-4 shadow-sm">
        <RechartsChartRenderer {...chartConfig} />
      </div>
    );
  }

  if (htmlPreview) {
    return (
      <div className="rounded-2xl border border-border bg-background/80 p-4 shadow-sm">
        {htmlPreview}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary" className="bg-muted text-foreground">
          {humanize(atom.atomId)}
        </Badge>
        <Badge variant="outline" className="text-xs uppercase">
          {atom.category}
        </Badge>
      </div>
      <DefaultExhibitedAtom atom={atom} variant={variant} metadata={metadata} />
    </div>
  );
};

export default ExhibitedAtomRenderer;
