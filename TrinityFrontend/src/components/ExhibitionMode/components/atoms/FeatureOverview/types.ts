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

export interface FeatureOverviewExhibitionControls {
  enableComponentTitle?: boolean;
  allowEditInExhibition?: boolean;
  transparentBackground?: boolean;
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
  exhibitionControls?: FeatureOverviewExhibitionControls;
}

export interface FeatureOverviewComponentProps {
  metadata: FeatureOverviewMetadata;
  variant: 'full' | 'compact';
}

export interface FeatureOverviewProps {
  metadata?: Record<string, unknown> | null;
  variant?: 'full' | 'compact';
}
