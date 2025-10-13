import React, { useMemo } from 'react';
import TextBoxDisplay from '@/components/AtomList/atoms/text-box/TextBoxDisplay';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import Table from '@/templates/tables/table';
import RechartsChartRenderer from '@/templates/charts/RechartsChartRenderer';
import type { DroppedAtom } from '../store/exhibitionStore';
import FeatureOverviewSlideVisualization from './FeatureOverviewSlideVisualization';

interface ExhibitedAtomRendererProps {
  atom: DroppedAtom;
  variant?: 'full' | 'compact';
}

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
  title?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  showLegend?: boolean;
  showAxisLabels?: boolean;
  showGrid?: boolean;
  showDataLabels?: boolean;
  legendField?: string;
  theme?: string;
  colorPalette?: string[];
  primarySeriesKey?: string;
}

const ensureArray = <T,>(value: unknown): T[] => {
  if (!value) return [];
  if (Array.isArray(value)) return value as T[];
  return [];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(entry => (typeof entry === 'string' ? entry : undefined))
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
};

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

const extractTableData = (metadata: Record<string, unknown> | undefined): TablePreviewData | null => {
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

const extractChartSpec = (metadata: Record<string, unknown> | undefined): ChartPreviewSpec | null => {
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

  const chartStateCandidate =
    (metadata && isRecord(metadata['chartState']) ? (metadata['chartState'] as Record<string, unknown>) : undefined) ??
    (candidateRecord && isRecord(candidateRecord['chartState'])
      ? (candidateRecord['chartState'] as Record<string, unknown>)
      : undefined);

  const chartState = isRecord(chartStateCandidate) ? chartStateCandidate : {};

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
    (chartState && (chartState['chartType'] as string | undefined)) ??
    (candidateRecord &&
      ((candidateRecord['chart_type'] as string | undefined) ??
        (candidateRecord['type'] as string | undefined))) ??
    (metadata && (metadata['chartType'] as string | undefined)) ??
    (metadata && (metadata['chart_type'] as string | undefined)) ??
    (metadata && (metadata['type'] as string | undefined));

  const chartType = typeof chartTypeRaw === 'string' ? chartTypeRaw.toLowerCase() : '';
  const xFieldFromState = typeof chartState['xAxisField'] === 'string' ? (chartState['xAxisField'] as string) : undefined;
  const yFieldFromState = typeof chartState['yAxisField'] === 'string' ? (chartState['yAxisField'] as string) : undefined;
  const yFieldsFromState = toStringArray(chartState['yAxisFields']);
  const xAxisLabelFromState =
    typeof chartState['xAxisLabel'] === 'string' ? (chartState['xAxisLabel'] as string) : undefined;
  const yAxisLabelFromState =
    typeof chartState['yAxisLabel'] === 'string' ? (chartState['yAxisLabel'] as string) : undefined;
  const legendFieldFromState =
    typeof chartState['legendField'] === 'string' ? (chartState['legendField'] as string) : undefined;
  const showLegendFromState =
    typeof chartState['showLegend'] === 'boolean' ? (chartState['showLegend'] as boolean) : undefined;
  const showAxisLabelsFromState =
    typeof chartState['showAxisLabels'] === 'boolean' ? (chartState['showAxisLabels'] as boolean) : undefined;
  const showGridFromState =
    typeof chartState['showGrid'] === 'boolean' ? (chartState['showGrid'] as boolean) : undefined;
  const showDataLabelsFromState =
    typeof chartState['showDataLabels'] === 'boolean' ? (chartState['showDataLabels'] as boolean) : undefined;
  const themeFromState = typeof chartState['theme'] === 'string' ? (chartState['theme'] as string) : undefined;
  const colorPaletteFromState = toStringArray(chartState['colorPalette']);
  const chartTitleFromState = typeof chartState['title'] === 'string' ? (chartState['title'] as string) : undefined;

  const sample = rawRecords[0];

  const possiblePie =
    sample &&
    ((typeof sample.value === 'number' && ('label' in sample || 'name' in sample)) ||
      (typeof sample.y === 'number' && ('x' in sample || 'label' in sample)));

  const resolveTitle = () => {
    const candidates = [chartTitleFromState, candidateRecord?.['title'], metadata['title'], metadata['label']];
    const resolved = candidates.find(candidate => typeof candidate === 'string' && candidate.trim().length > 0);
    return typeof resolved === 'string' ? resolved : undefined;
  };

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
      title: resolveTitle(),
      legendField: legendFieldFromState,
      showLegend: showLegendFromState,
      showAxisLabels: showAxisLabelsFromState,
      showGrid: showGridFromState,
      showDataLabels: showDataLabelsFromState,
      theme: themeFromState,
      colorPalette: colorPaletteFromState.length > 0 ? colorPaletteFromState : undefined,
      primarySeriesKey: 'value',
    };
  }

  const numericKeysSource = yFieldsFromState.length > 0 ? yFieldsFromState : deriveNumericKeys(sample);
  const numericKeys = numericKeysSource.length > 0 ? numericKeysSource : deriveNumericKeys(sample);
  if (numericKeys.length === 0) {
    return null;
  }

  const xKey = xFieldFromState || deriveCategoricalKey(sample);
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

  const primarySeriesKey = yFieldFromState && numericKeys.includes(yFieldFromState)
    ? yFieldFromState
    : series[0]?.key;

  const xAxisLabel =
    xAxisLabelFromState ??
    (typeof metadata['xAxisLabel'] === 'string' ? (metadata['xAxisLabel'] as string) : undefined);
  const yAxisLabel =
    yAxisLabelFromState ??
    (typeof metadata['yAxisLabel'] === 'string' ? (metadata['yAxisLabel'] as string) : undefined);

  return {
    type,
    xKey,
    series,
    data,
    title: resolveTitle(),
    xAxisLabel,
    yAxisLabel,
    showLegend: showLegendFromState,
    showAxisLabels: showAxisLabelsFromState,
    showGrid: showGridFromState,
    showDataLabels: showDataLabelsFromState,
    legendField: legendFieldFromState,
    theme: themeFromState,
    colorPalette: colorPaletteFromState.length > 0 ? colorPaletteFromState : undefined,
    primarySeriesKey,
  };
};

const renderTablePreview = (table: TablePreviewData, variant: 'full' | 'compact') => {
  const rowLimit = variant === 'compact' ? 6 : 12;
  const rows = table.rows.slice(0, rowLimit);
  const bodyClassName = cn('overflow-y-auto', variant === 'compact' ? 'max-h-[240px]' : 'max-h-[360px]');

  return (
    <div className="space-y-2">
      <Table
        headers={table.headers.map(header => (
          <span key={header} className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {header}
          </span>
        ))}
        minimizable={false}
        bodyClassName={bodyClassName}
        borderColor="border-slate-300"
      >
        {rows.length > 0 ? (
          rows.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`} className="table-row">
              {table.headers.map(header => (
                <td key={header} className="table-cell text-sm">
                  {formatValue(row[header])}
                </td>
              ))}
            </tr>
          ))
        ) : (
          <tr className="table-row">
            <td className="table-cell text-center text-muted-foreground" colSpan={table.headers.length}>
              No data available
            </td>
          </tr>
        )}
      </Table>
      {table.rows.length > rows.length && (
        <p className="text-xs text-muted-foreground">
          Showing {rows.length.toLocaleString()} of {table.rows.length.toLocaleString()} rows
        </p>
      )}
    </div>
  );
};

const renderChartPreview = (spec: ChartPreviewSpec, variant: 'full' | 'compact') => {
  const height = variant === 'compact' ? 260 : 360;
  const typeMap: Record<ChartKind, 'bar_chart' | 'line_chart' | 'area_chart' | 'pie_chart'> = {
    bar: 'bar_chart',
    line: 'line_chart',
    area: 'area_chart',
    pie: 'pie_chart',
  };

  const resolvedType = typeMap[spec.type] ?? 'bar_chart';
  const primarySeriesKey = spec.primarySeriesKey ?? spec.series[0]?.key ?? (spec.type === 'pie' ? 'value' : undefined);
  const showLegend = spec.showLegend ?? (spec.type === 'pie' || spec.series.length > 1);
  const showAxisLabels = spec.showAxisLabels ?? spec.type !== 'pie';
  const showGrid = spec.showGrid ?? spec.type !== 'pie';
  const xAxisLabel = spec.xAxisLabel ?? humanize(spec.xKey);
  const yAxisLabel = spec.yAxisLabel ?? (primarySeriesKey ? humanize(primarySeriesKey) : undefined);

  return (
    <div className="rounded-2xl border border-border bg-background/80 p-4 shadow-sm">
      <RechartsChartRenderer
        type={resolvedType}
        data={spec.data}
        xField={spec.xKey}
        yField={primarySeriesKey}
        yFields={spec.series.length > 1 ? spec.series.map(serie => serie.key) : undefined}
        height={height}
        title={spec.title}
        xAxisLabel={xAxisLabel}
        yAxisLabel={yAxisLabel}
        legendField={spec.legendField}
        colors={spec.colorPalette && spec.colorPalette.length > 0 ? spec.colorPalette : undefined}
        showLegend={showLegend}
        showAxisLabels={showAxisLabels}
        showGrid={showGrid}
        showDataLabels={spec.showDataLabels}
        theme={spec.theme}
      />
    </div>
  );
};

const renderHtmlPreview = (metadata: Record<string, unknown> | undefined) => {
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

const DefaultExhibitedAtom: React.FC<ExhibitedAtomRendererProps> = ({ atom, variant }) => {
  const metadata = isRecord(atom.metadata) ? atom.metadata : {};
  const simpleEntries = Object.entries(metadata).filter(([, value]) =>
    value == null || ['string', 'number', 'boolean'].includes(typeof value),
  );
  const complexEntries = Object.entries(metadata).filter(([, value]) =>
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
  const metadata = useMemo(() => (isRecord(atom.metadata) ? atom.metadata : undefined), [atom.metadata]);
  const tableData = useMemo(() => extractTableData(metadata), [metadata]);
  const chartSpec = useMemo(() => extractChartSpec(metadata), [metadata]);
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
    return renderTablePreview(tableData, variant);
  }

  if (chartSpec) {
    return (
      <div className="rounded-2xl border border-border bg-background/80 p-4 shadow-sm">
        {renderChartPreview(chartSpec, variant)}
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
      <DefaultExhibitedAtom atom={atom} variant={variant} />
    </div>
  );
};

export default ExhibitedAtomRenderer;
