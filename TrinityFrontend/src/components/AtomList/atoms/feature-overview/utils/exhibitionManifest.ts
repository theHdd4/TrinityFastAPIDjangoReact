import { FeatureOverviewVisualizationManifest } from '@/components/LaboratoryMode/store/laboratoryStore';

export const clonePlain = <T,>(value: T): T => {
  if (value === undefined || value === null) {
    return value;
  }

  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
};

export type ManifestChartRendererProps = {
  type: 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart';
  data: Array<Record<string, any>>;
  height: number;
  xField?: string;
  yField?: string;
  yFields?: string[];
  colors?: string[];
  legendField?: string;
  theme?: string;
  title?: string;
  showLegend?: boolean;
  // showAxisLabels?: boolean;
  showXAxisLabels?: boolean;
  showYAxisLabels?: boolean;
  showDataLabels?: boolean;
  showGrid?: boolean;
  xAxisLabel?: string;
  yAxisLabel?: string;
  sortOrder?: 'asc' | 'desc' | null;
  seriesSettings?: Record<string, { color?: string; showDataLabels?: boolean }>;
};

const normaliseManifestChartType = (
  type?: string | null,
): ManifestChartRendererProps['type'] | undefined => {
  if (!type) {
    return undefined;
  }

  const value = type.toLowerCase();
  if (value.includes('line')) return 'line_chart';
  if (value.includes('area')) return 'area_chart';
  if (value.includes('scatter')) return 'scatter_chart';
  if (value.includes('pie')) return 'pie_chart';
  if (value.includes('bar') || value.includes('column')) return 'bar_chart';
  return undefined;
};

export const buildChartRendererPropsFromManifest = (
  manifest?: FeatureOverviewVisualizationManifest,
): ManifestChartRendererProps | undefined => {
  if (!manifest || !manifest.chart) {
    return undefined;
  }

  const chartType = normaliseManifestChartType(manifest.chart.type);
  if (!chartType) {
    return undefined;
  }

  const manifestData = Array.isArray(manifest.data?.timeseries)
    ? clonePlain(manifest.data.timeseries)
    : manifest.data?.summary
      ? [clonePlain(manifest.data.summary)]
      : [];

  const yFields = Array.isArray(manifest.chart.yFields)
    ? manifest.chart.yFields.filter((field): field is string => typeof field === 'string' && field.length > 0)
    : undefined;

  const sortOrder = manifest.chart.sortOrder;

  return {
    type: chartType,
    data: manifestData,
    height: 320,
    xField: manifest.chart.xField,
    yField: manifest.chart.yField,
    yFields,
    colors: manifest.chart.colorPalette,
    legendField: manifest.chart.legendField,
    theme: manifest.chart.theme,
    title: manifest.label ?? manifest.metric,
    showLegend: manifest.chart.showLegend,
    // showAxisLabels: manifest.chart.showAxisLabels,
    showXAxisLabels: manifest.chart.showXAxisLabels,
    showYAxisLabels: manifest.chart.showYAxisLabels,
    showDataLabels: manifest.chart.showDataLabels,
    showGrid: manifest.chart.showGrid,
    xAxisLabel: manifest.chart.xAxisLabel,
    yAxisLabel: manifest.chart.yAxisLabel,
    sortOrder:
      sortOrder === 'asc' || sortOrder === 'desc'
        ? sortOrder
        : sortOrder === null
        ? null
        : undefined,
    seriesSettings: manifest.chart.seriesSettings,
  };
};

export const buildTableDataFromManifest = (
  manifest?: FeatureOverviewVisualizationManifest,
): { headers: string[]; rows: Array<Record<string, any>> } | undefined => {
  if (!manifest || !manifest.table) {
    return undefined;
  }

  const rows = Array.isArray(manifest.table.rows)
    ? manifest.table.rows.map(row => ({ ...row }))
    : [];

  if (rows.length === 0) {
    return undefined;
  }

  const columns = Array.isArray(manifest.table.columns) && manifest.table.columns.length > 0
    ? [...manifest.table.columns]
    : Object.keys(rows[0]);

  return {
    headers: columns,
    rows,
  };
};
