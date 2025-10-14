export interface FeatureOverviewDimension {
  name?: string;
  value?: string;
}

export interface FeatureOverviewChartState {
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

export interface FeatureOverviewStatistics {
  summary?: Record<string, unknown>;
  timeseries?: Array<Record<string, unknown>>;
  full?: Record<string, unknown>;
}

export interface FeatureOverviewFeatureContext {
  dataSource?: string;
  availableMetrics?: string[];
  xAxis?: string;
  dimensionMap?: Record<string, string[]>;
}

export interface FeatureOverviewSkuStatisticsSettings {
  visibility?: Record<string, boolean>;
  tableRows?: Array<Record<string, unknown>>;
  tableColumns?: string[];
}

export type FeatureOverviewViewType = 'statistical_summary' | 'trend_analysis';

export type FeatureOverviewRendererType =
  | 'bar_chart'
  | 'line_chart'
  | 'area_chart'
  | 'pie_chart'
  | 'scatter_chart';

export interface FeatureOverviewChartRendererConfig {
  type: FeatureOverviewRendererType;
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

export interface FeatureOverviewVizSpec {
  renderer: 'recharts';
  version: number;
  config: FeatureOverviewChartRendererConfig;
}

export interface FeatureOverviewVisualisationManifest {
  manifestId: string;
  componentId: string;
  atomId?: string;
  view?: FeatureOverviewViewType | string;
  createdAt?: string;
  thumbnail?: string | null;
  vizSpec?: FeatureOverviewVizSpec;
  chartData?: Record<string, unknown>;
  skuData?: Record<string, unknown>;
}

export interface FeatureOverviewMetadata {
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
  viewType?: FeatureOverviewViewType;
  visualisationManifest?: FeatureOverviewVisualisationManifest;
}

export interface FeatureOverviewComponentProps {
  metadata: FeatureOverviewMetadata;
  variant: 'full' | 'compact';
}

export interface FeatureOverviewProps {
  metadata?: Record<string, unknown> | null;
  manifest?: FeatureOverviewVisualisationManifest | null;
  variant?: 'full' | 'compact';
}
