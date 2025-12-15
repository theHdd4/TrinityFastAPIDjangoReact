import { create } from "zustand";
import { safeStringify } from "@/utils/safeStringify";
import { atoms as allAtoms } from "@/components/AtomList/data";
import { ClarificationRequestMessage as ClarificationRequest } from "@/types/streaming";
import { LABORATORY_API } from "@/lib/api";
import type { UploadStage, GuidedUploadFlowState } from "@/components/AtomList/atoms/data-upload/components/guided-upload/useGuidedUploadFlow";

const dedupeCards = (cards: LayoutCard[]): LayoutCard[] => {
  if (!Array.isArray(cards)) return [];

  const seen = new Set<string>();
  const deduped: LayoutCard[] = [];

  // Keep last occurrence of each id to mirror backend behavior
  for (let i = cards.length - 1; i >= 0; i--) {
    const card = cards[i];
    if (!card?.id) continue;
    if (seen.has(card.id)) continue;
    seen.add(card.id);
    deduped.push(card);
  }

  return deduped.reverse();
};

export interface TextBoxSettings {
  format: "quill-delta" | "markdown" | "html" | "plain";
  content: string;
  allow_variables: boolean;
  max_chars: number;
  text_align: "left" | "center" | "right" | "justify";
  font_size: number;
  font_family: string;
  text_color: string;
  background_color?: string;
  bold: boolean;
  italics: boolean;
  underline: boolean;
  strikethrough?: boolean;
  list_type?: "none" | "bullet" | "number";
  headline: string;
  slide_layout: "full" | "sidebar" | "note-callout";
  transition_effect: "none" | "fade" | "typewriter";
  lock_content: boolean;
}

export interface TextBoxConfig {
  id: string;
  title?: string;
  content?: string;
  html?: string;
  settings?: Partial<TextBoxSettings>;
}

export const DEFAULT_TEXTBOX_SETTINGS: TextBoxSettings = {
  format: "plain",
  content: "",
  allow_variables: false,
  max_chars: 100,
  text_align: "left",
  font_size: 14,
  font_family: "Inter",
  text_color: "#000000",
  background_color: "transparent",
  bold: false,
  italics: false,
  underline: false,
  strikethrough: false,
  list_type: "none",
  headline: "",
  slide_layout: "full",
  transition_effect: "none",
  lock_content: false,
};

export interface DataUploadSettings {
  masterFile: string;
  fileValidation: boolean;
  /** When true, allow uploads without selecting a master file */
  bypassMasterUpload?: boolean;
  /** When true, enable column classifier functionality */
  enableColumnClassifier?: boolean;
  columnConfig: Record<string, Record<string, string>>;
  frequency: string;
  dimensions: Record<string, unknown>;
  measures: Record<string, unknown>;
  uploadedFiles: string[];
  /** Column classifier data - same structure as Column Classifier Atom */
  classifierData?: ColumnClassifierData;
  /** Selected dataframe for classification */
  classifierSelectedFile?: string;
  /** Classifier dimensions array */
  classifierDimensions?: string[];
  /** List of all custom dimensions created (stays even when unchecked) */
  classifierCustomDimensionsList?: string[];
  /** Enable dimension mapping in classifier */
  classifierEnableDimensionMapping?: boolean;
  /** Array of file names that have saved classifier configurations */
  classifierSavedFiles?: string[];
  validatorId?: string;
  selectedMasterFile?: string;
  requiredFiles?: string[];
  validations?: Record<string, any>;
  fileMappings?: Record<string, string>;
  /** Map of displayed master file names to the original names known by the backend */
  fileKeyMap?: Record<string, string>;
  /** Map of uploaded file display names to the stored MinIO object path */
  filePathMap?: Record<string, string>;
  /** Map of uploaded file display names to their file size in bytes */
  fileSizeMap?: Record<string, number>;
  /** Map of file names to their dtype changes (column name -> new dtype or {dtype, format}) */
  dtypeChanges?: Record<string, Record<string, string | { dtype: string; format: string }>>;
  /** Map of file names to their missing value strategies (column name -> strategy config) */
  missingValueStrategies?: Record<string, Record<string, { strategy: string; value?: string }>>;
  /** Set of file names that have had changes applied */
  filesWithAppliedChanges?: string[];
  /** Map of file names to their metadata (columns info, row/column counts) */
  filesMetadata?: Record<string, {
    columns: Array<{
      name: string;
      dtype: string;
      missing_count: number;
      missing_percentage: number;
      sample_values: any[];
    }>;
    total_rows: number;
    total_columns: number;
  }>;
  /** Map of file names to validation results (success/failure messages) - saved when validation steps enabled */
  validationResults?: Record<string, string>;
  /** Map of file names to detailed validation reports - saved when validation steps enabled */
  validationDetails?: Record<string, any[]>;
  /** List of file names that were validated (from saved dataframes) - saved when validation steps enabled */
  validatedFiles?: string[];
}

export const DEFAULT_DATAUPLOAD_SETTINGS: DataUploadSettings = {
  masterFile: "",
  fileValidation: true,
  bypassMasterUpload: false,
  enableColumnClassifier: false,
  columnConfig: {},
  frequency: "monthly",
  dimensions: {},
  measures: {},
  uploadedFiles: [],
  validatorId: undefined,
  requiredFiles: [],
  validations: {},
  fileMappings: {},
  fileKeyMap: {},
  filePathMap: {},
  fileSizeMap: {},
  dtypeChanges: {},
  missingValueStrategies: {},
  filesWithAppliedChanges: [],
  filesMetadata: {},
  classifierData: {
    files: [],
    activeFileIndex: 0,
  },
  classifierSelectedFile: "",
  classifierDimensions: [],
  classifierCustomDimensionsList: [],
  classifierEnableDimensionMapping: false,
  classifierSavedFiles: [],
};

export const createDefaultDataUploadSettings = (): DataUploadSettings => ({
  masterFile: "",
  fileValidation: true,
  bypassMasterUpload: true,
  enableColumnClassifier: false,
  columnConfig: {},
  frequency: "monthly",
  dimensions: {},
  measures: {},
  uploadedFiles: [],
  validatorId: undefined,
  requiredFiles: [],
  validations: {},
  fileMappings: {},
  fileKeyMap: {},
  filePathMap: {},
  fileSizeMap: {},
  dtypeChanges: {},
  missingValueStrategies: {},
  filesWithAppliedChanges: [],
  filesMetadata: {},
  classifierData: {
    files: [],
    activeFileIndex: 0,
  },
  classifierSelectedFile: "",
  classifierDimensions: [],
  classifierCustomDimensionsList: [],
  classifierEnableDimensionMapping: false,
  classifierSavedFiles: [],
});

export interface FeatureOverviewExhibitionSelectionDimension {
  name: string;
  value: string;
}

export type FeatureOverviewExhibitionComponentType =
  | 'statistical_summary'
  | 'trend_analysis';

export interface FeatureOverviewExhibitionSelectionStatistics {
  summary?: Record<string, any>;
  timeseries?: Array<Record<string, any>>;
  full?: Record<string, any>;
}

export interface FeatureOverviewVisualizationManifestChart {
  type: string;
  theme?: string;
  showLegend?: boolean;
  // showAxisLabels?: boolean;
  showXAxisLabels?: boolean;
  showYAxisLabels?: boolean;
  showDataLabels?: boolean;
  showGrid?: boolean;
  xField?: string;
  yField?: string;
  yFields?: string[];
  colorPalette?: string[];
  legendField?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  sortOrder?: 'asc' | 'desc' | null;
  seriesSettings?: Record<string, { color?: string; showDataLabels?: boolean }>;
}

export interface FeatureOverviewVisualizationManifestTable {
  columns: string[];
  rows: Array<Record<string, any>>;
  visibility?: Record<string, boolean>;
}

export interface FeatureOverviewVisualizationManifestData {
  summary?: Record<string, any>;
  timeseries?: Array<Record<string, any>>;
  skuRow?: Record<string, any>;
  combination?: Record<string, string>;
  statisticalFull?: Record<string, any>;
}

export interface FeatureOverviewVisualizationManifest {
  id: string;
  version: string;
  componentType: FeatureOverviewExhibitionComponentType;
  metric: string;
  label?: string;
  dimensions: FeatureOverviewExhibitionSelectionDimension[];
  capturedAt: string;
  data: FeatureOverviewVisualizationManifestData;
  chart?: FeatureOverviewVisualizationManifestChart;
  table?: FeatureOverviewVisualizationManifestTable;
  featureContext?: FeatureOverviewExhibitionSelectionContext;
}

export interface FeatureOverviewExhibitionSelectionChartState {
  chartType: string;
  theme: string;
  showDataLabels: boolean;
  // showAxisLabels: boolean;
  showXAxisLabels: boolean;
  showYAxisLabels: boolean;
  showGrid: boolean;
  showLegend: boolean;
  xAxisField: string;
  yAxisField: string;
  colorPalette?: string[];
  legendField?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  sortOrder?: 'asc' | 'desc' | null;
  seriesSettings?: Record<string, { color?: string; showDataLabels?: boolean }>;
}

export interface FeatureOverviewExhibitionSelectionContext {
  dataSource?: string;
  availableMetrics?: string[];
  xAxis?: string;
  dimensionMap?: Record<string, string[]>;
}

export interface FeatureOverviewExhibitionSelection {
  key: string;
  metric: string;
  componentType?: FeatureOverviewExhibitionComponentType;
  combination: Record<string, string>;
  dimensions: FeatureOverviewExhibitionSelectionDimension[];
  rowId?: string | number;
  label?: string;
  statisticalDetails?: FeatureOverviewExhibitionSelectionStatistics;
  chartState?: FeatureOverviewExhibitionSelectionChartState;
  featureContext?: FeatureOverviewExhibitionSelectionContext;
  skuRow?: Record<string, any>;
  capturedAt?: string;
  manifestId?: string;
  visualizationManifest?: FeatureOverviewVisualizationManifest;
}

export interface FeatureOverviewSettings {
  selectedColumns: string[];
  hierarchicalView: boolean;
  dataSource: string;
  csvDisplay?: string;
  filterCriteria: Record<string, unknown>;
  columnSummary?: any[];
  allColumns?: any[];
  numericColumns?: string[];
  marketDims?: string[];
  productDims?: string[];
  yAxes?: string[];
  xAxis?: string;
  skuTable?: any[];
  statDataMap?: Record<string, any>;
  activeMetric?: string;
  activeRow?: number | null;
  dimensionMap?: Record<string, string[]>;
  filterUnique?: boolean;
  isLoading?: boolean;
  loadingMessage?: string;
  loadingStatus?: string;
  exhibitionSelections?: FeatureOverviewExhibitionSelection[];
}

export const DEFAULT_FEATURE_OVERVIEW_SETTINGS: FeatureOverviewSettings = {
  selectedColumns: [],
  hierarchicalView: true,
  dataSource: "",
  csvDisplay: "",
  filterCriteria: {},
  columnSummary: [],
  allColumns: [],
  numericColumns: [],
  marketDims: [],
  productDims: [],
  yAxes: [],
  xAxis: "date",
  skuTable: [],
  statDataMap: {},
  activeMetric: "",
  activeRow: null,
  dimensionMap: {},
  filterUnique: true,
  isLoading: false,
  loadingMessage: '',
  loadingStatus: '',
  exhibitionSelections: [],
};

export interface ConcatSettings {
  file1: File | string | null;
  file2: File | string | null;
  direction: string;
  performConcat: boolean;
  concatResults?: any;
  concatId?: string;
}

export const DEFAULT_CONCAT_SETTINGS: ConcatSettings = {
  file1: null,
  file2: null,
  direction: "vertical",
  performConcat: false,
  concatResults: undefined,
  concatId: undefined,
};

export interface CorrelationSettings {
  variables: string[];
  selectedVar1: string | null;
  selectedVar2: string | null;
  correlationMatrix: number[][];
  timeSeriesData: Array<{
    date: Date | number;
    var1Value: number;
    var2Value: number;
  }>;
  timeSeriesIsDate?: boolean;
  identifiers: {
    identifier3: string;
    identifier4: string;
    identifier6: string;
    identifier7: string;
    identifier15: string;
  };
  settings: {
    dataSource: string;
    dataset: string;
    dateFrom: string;
    dateTo: string;
    aggregationLevel: string;
    correlationMethod: string;
    selectData: string;
    selectFilter: string;
    uploadedFile?: string;
    filterDimensions?: Record<string, string[]>;
  };
  // Enhanced visualization options
  visualizationOptions?: {
    heatmapColorScheme: string;
    var1Color: string;
    var2Color: string;
    normalizeValues: boolean;
    selectedVizType: string;
  };
  // Add missing properties for saved dataframes
  selectedFile?: string;  // Selected dataframe object_name
  validatorAtomId?: string;  // Validator atom ID for column extraction
  selectedColumns?: string[];  // Selected columns for correlation analysis
  selectedNumericColumnsForMatrix?: string[];  // Selected numerical columns to display in correlation matrix (default: all)
  // File processing related data
  fileData?: {
    fileName: string;
    rawData: any[];
    numericColumns: string[];
    dateColumns: string[];
    categoricalColumns: string[];
    columnValues?: { [columnName: string]: string[] }; // Cached unique values for categorical columns
    isProcessed: boolean;
  };
  isUsingFileData?: boolean;
  showAllColumns?: boolean;
  filteredFilePath?: string;
  // Column values loading state
  columnValuesLoading?: boolean;
  columnValuesError?: string;
  // Date analysis data
  dateAnalysis?: {
    has_date_data: boolean;
    date_columns: Array<{
      column_name: string;
      min_date?: string;
      max_date?: string;
      format_detected: string;
      granularity: string;
      sample_values: string[];
      is_valid_date: boolean;
    }>;
    overall_date_range?: {
      min_date: string;
      max_date: string;
    };
    recommended_granularity: string;
    date_format_detected: string;
  };
  // Note functionality (matching ChartMaker pattern)
  note?: string;
  showNote?: boolean;
}

export const DEFAULT_CORRELATION_SETTINGS: CorrelationSettings = {
  variables: [],
  selectedVar1: null,
  selectedVar2: null,
  correlationMatrix: [],
  timeSeriesData: [],
  timeSeriesIsDate: true,
  identifiers: {
    identifier3: 'All',
    identifier4: 'All',
    identifier6: 'All',
    identifier7: 'All',
    identifier15: 'All'
  },
  settings: {
    dataSource: 'CSV',
    dataset: '',
    dateFrom: '01 JAN 2023',
    dateTo: '31 DEC 2024',
    aggregationLevel: 'None',
    correlationMethod: 'pearson',
    selectData: 'Single Selection',
    selectFilter: 'Single Selection',
    uploadedFile: undefined,
    filterDimensions: {}
  },
  visualizationOptions: {
    heatmapColorScheme: 'RdBu',
    var1Color: '#ef4444',
    var2Color: '#3b82f6',
    normalizeValues: false,
    selectedVizType: 'heatmap'
  },
  selectedFile: undefined,
  validatorAtomId: undefined,
  selectedColumns: [],
  fileData: undefined,
  isUsingFileData: true,  // Default to always using file data
  showAllColumns: false,
  filteredFilePath: undefined,
  columnValuesLoading: false,
  columnValuesError: undefined,
  note: '',
  showNote: false
};

export interface ColumnClassifierColumn {
  name: string;
  category: "identifiers" | "measures" | "unclassified" | string;
}

export interface ColumnClassifierFile {
  fileName: string;
  filePath?: string; // MinIO path for saving configuration
  columns: ColumnClassifierColumn[];
  customDimensions: { [key: string]: string[] };
}

export interface ColumnClassifierData {
  files: ColumnClassifierFile[];
  activeFileIndex: number;
}

export interface ColumnClassifierSettings {
  data: ColumnClassifierData;
  validatorId?: string;
  fileKey?: string;
  dimensions: string[];
  assignments: { [key: string]: string[] };
  enableDimensionMapping?: boolean;
  enableColumnView?: boolean;
  filterColumnViewUnique?: boolean;
  isLoading?: boolean;
  loadingMessage?: string;
  loadingStatus?: string;
}

export const DEFAULT_COLUMN_CLASSIFIER_SETTINGS: ColumnClassifierSettings = {
  data: {
    files: [],
    activeFileIndex: 0,
  },
  validatorId: "",
  fileKey: "",
  dimensions: [],
  assignments: {},
  enableDimensionMapping: false,
  enableColumnView: true,
  filterColumnViewUnique: false,
  isLoading: false,
  loadingMessage: '',
  loadingStatus: '',
};

export interface DataFrameOperationsSettings {
  rowsPerPage: number;
  searchTerm: string;
  sortColumns: Array<{ column: string; direction: 'asc' | 'desc' }>;
  filters: { [key: string]: any };
  selectedColumns: string[];
  showRowNumbers: boolean;
  enableEditing: boolean;
  uploadedFile?: string;
  selectedFile?: string;
  tableData?: any;
  data?: any;
}

export const DEFAULT_DATAFRAME_OPERATIONS_SETTINGS: DataFrameOperationsSettings = {
  rowsPerPage: 15,
  searchTerm: '',
  sortColumns: [],
  filters: {},
  selectedColumns: [],
  showRowNumbers: true,
  enableEditing: true,
  selectedFile: '',
  tableData: undefined,
  data: undefined,
};

export interface ChartData {
  columns: string[];
  rows: Record<string, any>[];
  numeric_columns?: string[];
  categorical_columns?: string[];
  unique_values?: Record<string, string[]>;
  file_id?: string;
  row_count?: number;
  allColumns?: string[];
  numericColumns?: string[];
  categoricalColumns?: string[];
  uniqueValuesByColumn?: Record<string, string[]>;
}

export interface ChartTraceConfig {
  yAxis: string;
  name?: string;
  filters: Record<string, string[]>;
  color?: string;
  aggregation?: 'sum' | 'mean' | 'count' | 'min' | 'max';
  legend_field?: string;
}

export interface ChartMakerConfig {
  id: string;
  title: string;
  type: 'line' | 'bar' | 'area' | 'pie' | 'scatter' | 'stacked_bar';
  xAxis: string;
  yAxis: string;
  secondYAxis?: string;
  dualAxisMode?: 'dual' | 'single'; // 'dual' = separate axes, 'single' = combined single axis
  filters: Record<string, string[]>;
  aggregation?: 'sum' | 'mean' | 'count' | 'min' | 'max';
  legendField?: string;
  sortOrder?: 'asc' | 'desc' | null;
  sortColumn?: string;
  chartConfig?: {
    theme?: string;
    showLegend?: boolean;
    showXAxisLabels?: boolean;
    showYAxisLabels?: boolean;
    showDataLabels?: boolean;
    showGrid?: boolean;
    sortOrder?: 'asc' | 'desc' | null;
    sortColumn?: string;
    seriesSettings?: Record<string, { color?: string; showDataLabels?: boolean }>; // Per-series settings for right-click menu
    [key: string]: any; // Allow other properties
  };
  filteredData?: Record<string, any>[];
  chartRendered?: boolean;
  chartLoading?: boolean;
  lastUpdateTime?: number;
  isAdvancedMode?: boolean;
  traces?: ChartTraceConfig[];
  showNote?: boolean; // Toggle to show/hide note box
  note?: string; // Note text stored in chart config
}

// ChartMaker Exhibition Types
export type ChartMakerExhibitionComponentType = 'chart';

export interface ChartMakerExhibitionSelectionChartState {
  chartType: string;
  xAxis: string;
  yAxis: string;
  secondYAxis?: string;
  dualAxisMode?: 'dual' | 'single'; // 'dual' = separate axes, 'single' = combined single axis
  filters: Record<string, string[]>;
  aggregation?: 'sum' | 'mean' | 'count' | 'min' | 'max';
  legendField?: string;
  isAdvancedMode?: boolean;
  traces?: ChartTraceConfig[];
  note?: string; // Note text (stored but not displayed in exhibition for now)
}

export interface ChartMakerExhibitionSelectionContext {
  dataSource?: string;
  uploadedData?: ChartData | null;
  chartConfig?: any; // Include chartConfig to preserve processed data
}

export interface ChartMakerExhibitionSelection {
  key: string;
  chartId: string;
  chartTitle: string;
  componentType?: ChartMakerExhibitionComponentType;
  chartState?: ChartMakerExhibitionSelectionChartState;
  chartContext?: ChartMakerExhibitionSelectionContext;
  capturedAt?: string;
  manifestId?: string;
}

export interface ChartMakerSettings {
  dataSource?: string;
  fileId?: string;
  uploadedData: ChartData | null;
  numberOfCharts: number;
  charts: ChartMakerConfig[];
  loading: {
    uploading: boolean;
    fetchingColumns: boolean;
    fetchingUniqueValues: boolean;
    filtering: boolean;
  };
  error?: string;
  exhibitionSelections?: ChartMakerExhibitionSelection[];
}

export interface SelectModelsFeatureSettings {
  uploadedFile: File | null;
  selectedDataset: string;
  ensembleMethod: boolean;
  selectedScope: string;
  availableScopes: string[];
  selectedVariable: string;
  modelResults: any[];
  modelFilters: {
    mape: number;
    pValue: number;
    rSquared: number;
    aic: number;
    filters: string[];
  };
  selectedModel: string;
  performanceData: any[];
  isRunning: boolean;
  dataType: string;
  aggregationLevel: string;
  combinationStatus?: any;
  combinationStatusMinimized?: boolean;
}

// EvaluateModelsFeature Exhibition Types
export type EvaluateModelsFeatureExhibitionComponentType = 'graph';

export interface EvaluateModelsFeatureExhibitionSelectionGraphState {
  graphType: string;
  graphName: string;
  graphId: string;
  selected: boolean;
  combinationName?: string; // Add combination name for individual graph tracking
  chartTypePreference?: string; // Store chart type preference (bar_chart, line_chart, etc.)
}

export interface EvaluateModelsFeatureExhibitionSelectionContext {
  selectedDataframe?: string;
  scope?: string;
  selectedCombinations?: string[];
  identifiers?: Array<{
    id: string;
    name: string;
    selected: boolean;
  }>;
  modelResults?: any[];
  identifiersData?: {[key: string]: {column_name: string | null, unique_values: string[]}};
  selectedIdentifierValues?: {[key: string]: string[]};
  chartData?: Array<{name: string; value: number}>;
}

export interface EvaluateModelsFeatureExhibitionSelection {
  key: string;
  graphId: string;
  graphTitle: string;
  componentType?: EvaluateModelsFeatureExhibitionComponentType;
  graphState?: EvaluateModelsFeatureExhibitionSelectionGraphState;
  graphContext?: EvaluateModelsFeatureExhibitionSelectionContext;
  capturedAt?: string;
  manifestId?: string;
}

export interface EvaluateModelsFeatureSettings {
  data: {
    selectedDataframe: string;
    scope: string;
    selectedCombinations: string[];
    identifiers: Array<{
      id: string;
      name: string;
      selected: boolean;
    }>;
    graphs: Array<{
      id: string;
      name: string;
      type: 'waterfall' | 'contribution' | 'actual-vs-predicted' | 'elasticity' | 'beta' | 'averages';
      selected: boolean;
    }>;
    availableColumns: string[];
    modelResults: any[];
    identifiersData?: {[key: string]: {column_name: string | null, unique_values: string[]}};
    selectedIdentifierValues?: {[key: string]: string[]};
    comments?: Record<string, Array<{id: string, text: string, timestamp: string}>>;
    newComments?: Record<string, string>;
    columnFilters?: {[key: string]: string[]};
    sortColumn?: string;
    sortDirection?: 'asc' | 'desc';
  };
  settings: {
    showLegend: boolean;
    chartHeight: number;
    autoRefresh: boolean;
  };
  exhibitionSelections?: EvaluateModelsFeatureExhibitionSelection[];
}

export const DEFAULT_EVALUATE_MODELS_FEATURE_SETTINGS: EvaluateModelsFeatureSettings = {
  data: {
    selectedDataframe: '',
    scope: 'SCOPE 12',
    selectedCombinations: [],
    identifiers: [],
    graphs: [
      { id: '1', name: 'Waterfall Chart', type: 'waterfall', selected: true },
      { id: '2', name: 'Contribution Chart', type: 'contribution', selected: true },
      { id: '3', name: 'Actual vs Predicted', type: 'actual-vs-predicted', selected: true },
      { id: '4', name: 'Elasticity', type: 'elasticity', selected: true },
      { id: '5', name: 'Beta', type: 'beta', selected: true },
      { id: '6', name: 'Averages', type: 'averages', selected: true },
    ],
    availableColumns: ['Column 1', 'Column 2', 'Column 3', 'Column 4'],
    modelResults: [],
    identifiersData: {},
    selectedIdentifierValues: {},
    comments: {},
    newComments: {},
    columnFilters: {},
    sortColumn: '',
    sortDirection: 'desc'
  },
  settings: {
    showLegend: true,
    chartHeight: 300,
    autoRefresh: false
  },
  exhibitionSelections: [],
};

export const DEFAULT_CHART_MAKER_SETTINGS: ChartMakerSettings = {
  dataSource: '',
  fileId: '',
  uploadedData: null,
  numberOfCharts: 1,
  charts: [
    {
      id: '1',
      title: 'Chart 1',
      type: 'line',
      xAxis: '',
      yAxis: '',
      filters: {},
      aggregation: 'sum',
      legendField: 'aggregate',
      chartRendered: false,
      chartLoading: false,
      isAdvancedMode: false,
      traces: [],
      showNote: false,
    },
  ],
  loading: {
    uploading: false,
    fetchingColumns: false,
    fetchingUniqueValues: false,
    filtering: false,
  },
  error: undefined,
  exhibitionSelections: [],
};

export interface ClusteringData {
  selectedIdentifiers: string[];
  availableIdentifiers: string[]; // <-- Added to store all available identifier columns
  availableMeasures: string[];
  selectedMeasures: string[];
  selectedDataFile: string;
  objectName: string; // <-- Added default value
  allColumns: string[]; // <-- Added to store all columns
  
  // Date range filtering
  dateRange?: {
    column: string;
    fromDate: string;
    toDate: string;
  };
  
  // Output path management
  outputPath?: string; // Full path to saved clustering results
  outputFilename?: string; // Custom filename for the output
  
  // Algorithm configuration
  algorithm?: string;
  
  // K-selection method
  k_selection?: 'manual' | 'elbow' | 'silhouette' | 'gap';
  
  // Manual K selection
  n_clusters?: number;
  
  // Auto-K selection parameters
  k_min?: number;
  k_max?: number;
  gap_b?: number;
  
  // Legacy support
  use_elbow?: boolean;
  
  // Algorithm-specific parameters
  eps?: number;
  min_samples?: number;
  linkage?: 'ward' | 'complete' | 'average' | 'single';
  threshold?: number;
  covariance_type?: 'full' | 'tied' | 'diag' | 'spherical';
  
  // Performance parameters
  random_state?: number;
  n_init?: number;
  
  // Legacy support - keeping for backward compatibility
  clusteringConfig?: ClusteringConfig;
  clusterResults: ClusterResults | null;
  isRunning: boolean;
}

export interface ClusteringConfig {
  clusteringMethod: string;
  numberOfClusters: number;
  identifiers: Record<string, string>;
  selectedMeasure: string;
  // New algorithm-specific parameters
  algorithmParams: {
    // K-means parameters
    n_clusters?: number;
    // HAC parameters
    linkage?: 'ward' | 'complete' | 'average' | 'single';
    // BIRCH parameters
    threshold?: number;
    // DBSCAN parameters
    eps?: number;
    min_samples?: number;
    // GMM parameters
    covariance_type?: 'full' | 'tied' | 'diag' | 'spherical';
    // Performance parameters
    random_state?: number;
    n_init?: number;
  };
}

export interface ClusterResults {
  // Data info
  original_rows?: number;
  filtered_rows?: number;
  columns_used?: string[];
  
  // Filter info
  filters_applied?: any;
  filtered_file_path?: string;
  
  // Clustering results
  algorithm_used?: string;
  n_clusters_found?: number;
  cluster_sizes?: Record<string, number>; // cluster_id -> count
  cluster_stats?: Array<{
    cluster_id: number | string;
    size: number;
    centroid: Record<string, number>; // column -> centroid value
    min_values: Record<string, number>; // column -> min value
    max_values: Record<string, number>; // column -> max value
    column_names?: string[]; // List of column names
  }>;
  clustered_file_path?: string;
  
  // Output data with cluster IDs
  output_data?: any[];  // Full dataframe with cluster_id column
  
  // Preview (optional)
  preview_data?: any[];
  
  // Metadata
  timestamp?: string;
  processing_time_ms?: number;
  
  // Legacy support
  message?: string;
  clusters_path?: string;
  filtered_path?: string;
  duration_ms?: number;
}

export interface ClusteringSettings {
  clusteringData: ClusteringData;
}

export const DEFAULT_CLUSTERING_SETTINGS: ClusteringSettings = {
  clusteringData: {
    selectedIdentifiers: [],
    availableIdentifiers: [], // <-- Added to store all available identifier columns
    availableMeasures: [],
    selectedMeasures: [],
    selectedDataFile: '',
    objectName: '', // <-- Added default value
    allColumns: [], // <-- Added to store all columns
    
    // Date range filtering
    dateRange: undefined,
    
    // Output path management
    outputPath: '',
    outputFilename: '',
    
    // Algorithm configuration
    algorithm: 'kmeans',
    
    // K-selection method
    k_selection: 'elbow',
    
    // Manual K selection
    n_clusters: 3,
    
    // Auto-K selection parameters
    k_min: 2,
    k_max: 10,
    gap_b: 10,
    
    // Legacy support
    use_elbow: false,
    
    // Algorithm-specific parameters
    eps: 0.5,
    min_samples: 5,
    linkage: 'ward',
    threshold: 0.5,
    covariance_type: 'full',
    
    // Performance parameters
    random_state: 0,
    n_init: 10,
    // Legacy support - keeping for backward compatibility
    clusteringConfig: {
      clusteringMethod: 'K-Means',
      numberOfClusters: 3,
      identifiers: {},
      selectedMeasure: '',
      algorithmParams: {
        n_clusters: 3,
        linkage: 'ward',
        threshold: 0.5,
        eps: 0.5,
        min_samples: 5,
        covariance_type: 'full',
        random_state: 0,
        n_init: 10
      }
    },
    clusterResults: null,
    isRunning: false
  }
};

// ✅ UPDATED: New nested scenario structure for better isolation
export interface ScenarioPlannerSettings {
  // ✅ NEW: Scenario-specific data structure
  allScenarios: string[];
  selectedScenario: string;
  scenarios: {
    [scenarioId: string]: {
      identifiers: Array<{
        id: string;
        name: string;
        values: Array<{
          id: string;
          name: string;
          checked: boolean;
        }>;
      }>;
      features: Array<{
        id: string;
        name: string;
        selected: boolean;
      }>;
      outputs: Array<{
        id: string;
        name: string;
        selected: boolean;
      }>;
      combinations: Array<{
        id: string;
        combination_id: string;
      }>;
      referenceMethod: 'mean' | 'period-mean' | 'period-median' | 'median';
      referencePeriod: {
        from: string;
        to: string;
      };
      resultViews: Array<{
        id: string;
        name: string;
        selectedCombinations: string[];
      }>;
      selectedView: string;
      combinationInputs?: {
        [combinationId: string]: {
          [featureId: string]: {
            input: string;
            change: string;
          };
        };
      };
      originalReferenceValues?: {
        [combinationId: string]: {
          [featureId: string]: number;
        };
      };
      scenarioResults?: {
        runId: string;
        viewId: string;
        viewName: string;
        datasetUsed: string;
        createdAt: string;
        modelsProcessed: number;
        flat: any;
        hierarchy: any[];
        individuals: any[];
      };
      // ✅ NEW: Per-view results storage
      viewResults?: {
        [viewId: string]: {
          runId: string;
          viewId: string;
          viewName: string;
          datasetUsed: string;
          createdAt: string;
          modelsProcessed: number;
          flat: any;
          hierarchy: any[];
          individuals: any[];
        };
      };
      aggregatedViews?: Array<{
        id: string;
        name: string;
        identifierOrder: string[];
        selectedIdentifiers: Record<string, string[]>;
      }>;
    };
  };
  
  // Global settings (shared across all scenarios)
  referenceMethod: 'mean' | 'period-mean' | 'period-median' | 'median';
  referencePeriod: {
    from: string;
    to: string;
  };
  selectedResultScenario: string;
  selectedView: string;
  
  // Backend data (shared across all scenarios)
  scenarioData?: {
    selectedDataFile?: string;
    objectName?: string;
    allColumns?: string[];
    availableIdentifiers?: string[];
    availableMeasures?: string[];
    selectedIdentifiers?: string[];
    selectedMeasures?: string[];
    outputPath?: string;
    outputFilename?: string;
  };
  backendIdentifiers?: any;
  backendFeatures?: any;
  backendCombinations?: any;
  backendDateRange?: {
    start_date: string;
    end_date: string;
  };
  
  // ✅ NEW: Properties for auto-refresh functionality
  referenceValuesNeedRefresh?: boolean;
  lastReferenceMethod?: 'mean' | 'period-mean' | 'period-median' | 'median';
  lastReferencePeriod?: {
    from: string;
    to: string;
  };
  
  // ✅ NEW: Property to control refresh functionality
  refreshEnabled?: boolean;
  
  // ✅ NEW: Backward compatibility properties (computed from current scenario)
  // These prevent infinite loops by providing the old flat structure
  // NOTE: These are NOT stored in the store - they are computed on-demand
  identifiers?: Array<{
    id: string;
    name: string;
    values: Array<{
      id: string;
      name: string;
      checked: boolean;
    }>;
  }>;
  features?: Array<{
    id: string;
    name: string;
    selected: boolean;
  }>;
  outputs?: Array<{
    id: string;
    name: string;
    selected: boolean;
  }>;
  combinations?: Array<{
    id: string;
    combination_id: string;
  }>;
  resultViews?: Array<{
    id: string;
    name: string;
    selectedCombinations: string[];
  }>;
  selectedCombinations?: string[];
  combinationInputs?: {
    [combinationId: string]: {
      [featureId: string]: {
        input: string;
        change: string;
      };
    };
  };
  originalReferenceValues?: {
    [combinationId: string]: {
      [featureId: string]: number;
    };
  };
  aggregatedViews?: Array<{
    id: string;
    name: string;
    identifierOrder: string[];
    selectedIdentifiers: Record<string, string[]>;
  }>;
  
  // Legacy properties for backward compatibility
  scenarioResults?: any;
}

export const DEFAULT_SCENARIO_PLANNER_SETTINGS: ScenarioPlannerSettings = {
  allScenarios: ['scenario-1'],
  selectedScenario: 'scenario-1',
  scenarios: {
    'scenario-1': {
      identifiers: [], // Will be populated from backend
      features: [], // Will be populated from backend
      outputs: [], // Will be populated from backend
      combinations: [], // Will be generated from identifiers
      referenceMethod: 'mean',
      referencePeriod: null,
      resultViews: [
        { id: 'view-1', name: 'View 1', selectedCombinations: [] },
        { id: 'view-2', name: 'View 2', selectedCombinations: [] },
        { id: 'view-3', name: 'View 3', selectedCombinations: [] }
      ],
      selectedView: 'view-1',
      combinationInputs: {},
      originalReferenceValues: {},
      aggregatedViews: [] // Will be created from backend identifiers
    }
  },
  
  // Global settings (shared across all scenarios)
  referenceMethod: 'mean',
  referencePeriod: null,
  selectedResultScenario: 'scenario-1',
  selectedView: 'view-1',
  
  // Backend data (shared across all scenarios)
  scenarioData: {
    selectedDataFile: '',
    objectName: '',
    allColumns: [],
    availableIdentifiers: [],
    availableMeasures: [],
    selectedIdentifiers: [],
    selectedMeasures: [],
    outputPath: '',
    outputFilename: ''
  },
  
  // ✅ NEW: Default values for auto-refresh functionality
  referenceValuesNeedRefresh: false,
  lastReferenceMethod: 'mean',
  lastReferencePeriod: null,
  
  // ✅ NEW: Default value for refresh functionality
  refreshEnabled: false
};

export interface ExploreData {
  dataframe?: string;
  dimensions: string[];
  measures: string[];
  graphLayout: {
    numberOfGraphsInRow: number;
    rows: number;
  };
  allColumns?: string[];
  numericalColumns?: string[];
  columnSummary?: any[];
  showDataSummary?: boolean;
  filterUnique?: boolean;
  chartType?: string;
  xAxis?: string;
  yAxis?: string;
  xAxisLabel?: string;
  yAxisLabel?: string;
  title?: string;
  legendField?: string;
  aggregation?: string;
  weightColumn?: string;
  dateFilters?: Array<{
    column: string;
    values: string[];
  }>;
  columnClassifierConfig?: {
    identifiers: string[];
    measures: string[];
    dimensions: { [key: string]: string[] };
    client_name?: string;
    app_name?: string;
    project_name?: string;
  };
  availableDimensions?: string[];
  availableMeasures?: string[];
  availableIdentifiers?: string[];
  chartReadyData?: any;
  fallbackDimensions?: string[];
  fallbackMeasures?: string[];
  applied?: boolean;
  chartDataSets?: { [idx: number]: any };
  chartGenerated?: { [chartIndex: number]: boolean };
  chartNotes?: { [chartIndex: number]: string };
  [key: string]: any;
}

export interface ExploreSettings {
  dataSource: string;
  enableFiltering?: boolean;
  enableExport?: boolean;
  autoRefresh?: boolean;
  [key: string]: any;
}

export const DEFAULT_EXPLORE_DATA: ExploreData = {
  dimensions: [],
  measures: [],
  graphLayout: { numberOfGraphsInRow: 1, rows: 1 },
  applied: false,
};

export const DEFAULT_EXPLORE_SETTINGS: ExploreSettings = {
  dataSource: "",
  enableFiltering: false,
  enableExport: false,
  autoRefresh: false,
};

// Auto-regressive Models Atom Settings
export interface AutoRegressiveModelConfig {
  id: string;
  name: string;
  parameters: Record<string, any>;
}

export interface TimeSeriesTransformation {
  id: string;
  component1: string;
  component2: string;
  transformationType: string;
}

export interface AutoRegressiveModelsData {
  uploadedFile: File | null;
  selectedDataset: string;
  selectedScope: string;
  selectedCombinations: string[];
  selectedModels: string[];
  modelConfigs: AutoRegressiveModelConfig[];
  targetVariable: string;
  timeVariable: string;
  exogenousVariables: (string | string[])[];
  transformations: TimeSeriesTransformation[];
  availableFiles?: string[];
  availableColumns: string[];
  scopes: string[];
  outputFileName: string;
  timeSeriesLength?: number;
  forecastHorizon?: number;
  validationSplit?: number;
  frequency?: string;
  availableDateColumns?: string[];
  modelResults?: any;
  lastRunTimestamp?: string;
  trainingStatus?: 'idle' | 'training' | 'completed' | 'error';
  lastError?: string;
}

export interface AutoRegressiveModelsSettings {
  dataType: string;
  aggregationLevel: string;
  dateFrom: string;
  dateTo: string;
}

export const DEFAULT_AUTO_REGRESSIVE_MODELS_DATA: AutoRegressiveModelsData = {
  uploadedFile: null,
  selectedDataset: '',
  selectedScope: '',
  selectedCombinations: [],
  selectedModels: ['ARIMA', 'SARIMA', 'Holt-Winters', 'ETS', 'Prophet'],
  modelConfigs: [
    { id: 'ARIMA', name: 'ARIMA', parameters: { 'AR Order': '1', 'Differencing': '1', 'MA Order': '1' } },
    { id: 'SARIMA', name: 'SARIMA', parameters: { 'AR Order': '1', 'Differencing': '1', 'MA Order': '1', 'Seasonal Period': '12' } },
    { id: 'Holt-Winters', name: 'Holt-Winters', parameters: { 'Trend': 'additive', 'Seasonal': 'additive', 'Seasonal Periods': '12' } },
    { id: 'ETS', name: 'ETS', parameters: { 'Error': 'additive', 'Trend': 'additive', 'Seasonal': 'additive' } },
    { id: 'Prophet', name: 'Prophet', parameters: { 'Growth': 'linear', 'Seasonality': 'additive', 'Holidays': 'auto' } }
  ],
  targetVariable: '',
  timeVariable: '',
  exogenousVariables: [],
  transformations: [],
  availableFiles: [],
  availableColumns: ['Time', 'Target', 'Feature 1', 'Feature 2', 'Feature 3', 'Feature 4', 'Feature 5'],
  scopes: ['Scope 1', 'Scope 2', 'Scope 3', 'Scope 4', 'Scope 5'],
  outputFileName: '',
  timeSeriesLength: 100,
  forecastHorizon: 12,
  validationSplit: 0.2,
  frequency: 'D',
  availableDateColumns: ['Date'],
  trainingStatus: 'idle',
  lastRunTimestamp: undefined,
  lastError: undefined
};

export const DEFAULT_AUTO_REGRESSIVE_MODELS_SETTINGS: AutoRegressiveModelsSettings = {
  dataType: '',
  aggregationLevel: '',
  dateFrom: '',
  dateTo: ''
};

// Select Models Auto-regressive Atom Settings
export interface SelectModelsAutoRegressiveData {
  selectedScope: string;
  availableScopes: string[];
  selectedVariable: string;
  modelResults: any[];
  modelFilters: {
    mape: number;
    pValue: number;
    rSquared: number;
    aic: number;
    filters: string[];
  };
  selectedModel: string;
  performanceData: any[];
  isRunning: boolean;
  dataType: string;
  aggregationLevel: string;
}

export const DEFAULT_SELECT_MODELS_AUTO_REGRESSIVE_DATA: SelectModelsAutoRegressiveData = {
  selectedScope: 'SCOPE 12',
  availableScopes: ['SCOPE 12', 'SCOPE 13', 'SCOPE 14', 'SCOPE 15'],
  selectedVariable: 'Select Variable to View Model Results',
  modelResults: [
    { name: 'Jan', value: 45 },
    { name: 'Feb', value: 62 },
    { name: 'Mar', value: 38 },
    { name: 'Apr', value: 75 },
    { name: 'May', value: 55 },
    { name: 'Jun', value: 88 },
    { name: 'Jul', value: 42 },
    { name: 'Aug', value: 68 },
    { name: 'Sep', value: 35 },
    { name: 'Oct', value: 92 },
    { name: 'Nov', value: 58 },
    { name: 'Dec', value: 73 }
  ],
  modelFilters: {
    mape: 0.75,
    pValue: 0.45,
    rSquared: 0.82,
    aic: 0.63,
    filters: []
  },
  selectedModel: 'Select Model to View Model Performance',
  performanceData: [],
  isRunning: false,
  dataType: '',
  aggregationLevel: ''
};

// Evaluate Models Auto-regressive Atom Settings
export interface EvaluateModelsAutoRegressiveData {
  selectedScope: string;
  availableScopes: string[];
  selectedVariable: string;
  modelResults: any[];
  evaluationMetrics: {
    mape: number;
    rmse: number;
    mae: number;
    rSquared: number;
  };
  selectedModel: string;
  performanceData: any[];
  isRunning: boolean;
  dataType: string;
  aggregationLevel: string;
}

export const DEFAULT_EVALUATE_MODELS_AUTO_REGRESSIVE_DATA: EvaluateModelsAutoRegressiveData = {
  selectedScope: 'SCOPE 12',
  availableScopes: ['SCOPE 12', 'SCOPE 13', 'SCOPE 14', 'SCOPE 15'],
  selectedVariable: 'Select Variable to Evaluate',
  modelResults: [],
  evaluationMetrics: {
    mape: 0,
    rmse: 0,
    mae: 0,
    rSquared: 0
  },
  selectedModel: 'Select Model to Evaluate',
  performanceData: [],
  isRunning: false,
  dataType: '',
  aggregationLevel: ''
};

export const DEFAULT_SELECT_MODELS_FEATURE_SETTINGS: SelectModelsFeatureSettings = {
  uploadedFile: null,
  selectedDataset: '',
  ensembleMethod: true,
  selectedScope: 'SCOPE 12',
  availableScopes: ['SCOPE 12', 'SCOPE 13', 'SCOPE 14', 'SCOPE 15'],
  selectedVariable: 'Select Variable to View Model Results',
  modelResults: [
    { name: 'Jan', value: 45 },
    { name: 'Feb', value: 62 },
    { name: 'Mar', value: 38 },
    { name: 'Apr', value: 75 },
    { name: 'May', value: 55 },
    { name: 'Jun', value: 88 },
    { name: 'Jul', value: 42 },
    { name: 'Aug', value: 68 },
    { name: 'Sep', value: 35 },
    { name: 'Oct', value: 92 },
    { name: 'Nov', value: 58 },
    { name: 'Dec', value: 73 }
  ],
  modelFilters: {
    mape: 0.75,
    pValue: 0.45,
    rSquared: 0.82,
    aic: 0.63,
    filters: []
  },
  selectedModel: 'Select Model to View Model Performance',
  performanceData: [],
  isRunning: false,
  dataType: '',
  aggregationLevel: ''
};

export interface ScopeSelectorPreviewRow {
  scopeId: string;
  values: Record<string, string>;
  count: number;
  pctPass?: boolean;
}

export interface ScopeSelectorSettings {
  scopes: Array<{
    id: string;
    name: string;
    identifiers: { [key: string]: string };
    timeframe: {
      from: string;
      to: string;
    };
  }>;
  availableIdentifiers: string[];
  selectedIdentifiers: string[];
  measures?: string[];
  allColumns?: Array<{
    column_name: string;
    dtype: string;
  }>;
  dataSource?: string;
  previewRows?: ScopeSelectorPreviewRow[];
}

export const DEFAULT_SCOPE_SELECTOR_SETTINGS: ScopeSelectorSettings = {
  scopes: [],
  availableIdentifiers: [],
  selectedIdentifiers: [],
  measures: [],
  allColumns: [],
  dataSource: '',
  previewRows: []
};

export interface BuildModelFeatureBasedSettings {
  data: {
    uploadedFile: File | null;
    selectedDataset: string;
    selectedScope: string;
    selectedCombinations: string[];
    selectedModels: string[];
    modelConfigs: Array<{
      id: string;
      name: string;
      parameters: Record<string, any>;
    }>;
    yVariable: string;
    xVariables: (string | string[])[];
    transformations: Array<{
      id: string;
      component1: string;
      component2: string;
      operation: string;
    }>;
    availableFiles?: string[];
    availableColumns: string[];
    scopes: string[];
    outputFileName: string;
    kFolds?: number;
    testSize?: number;
  };
  settings: {
    dataType: string;
    aggregationLevel: string;
    dateFrom: string;
    dateTo: string;
  };
  modelResult?: any;
  modelError?: string | null;
}

export const DEFAULT_BUILD_MODEL_FEATURE_BASED_SETTINGS: BuildModelFeatureBasedSettings = {
  data: {
    uploadedFile: null,
    selectedDataset: '',
    selectedScope: '',
    selectedCombinations: [],
    selectedModels: ['Linear Regression', 'Ridge Regression', 'Lasso Regression', 'ElasticNet Regression', 'Bayesian Ridge Regression', 'Custom Constrained Ridge', 'Constrained Linear Regression'],
    modelConfigs: [
      { id: 'Linear Regression', name: 'Linear Regression', parameters: {} },
      { id: 'Ridge Regression', name: 'Ridge Regression', parameters: { 'Alpha': '1.0' } },
      { id: 'Lasso Regression', name: 'Lasso Regression', parameters: { 'Alpha': '1.0' } },
      { id: 'ElasticNet Regression', name: 'ElasticNet Regression', parameters: { 'Alpha': '1.0', 'L1 Ratio': '0.5' } },
      { id: 'Bayesian Ridge Regression', name: 'Bayesian Ridge Regression', parameters: {} },
      { id: 'Custom Constrained Ridge', name: 'Custom Constrained Ridge', parameters: { 'L2 Penalty': '0.1', 'Learning Rate': '0.001', 'Iterations': '10000', 'Adam': 'false' } },
      { id: 'Constrained Linear Regression', name: 'Constrained Linear Regression', parameters: { 'Learning Rate': '0.001', 'Iterations': '10000', 'Adam': 'false' } }
    ],
    yVariable: '',
    xVariables: [],
    transformations: [],
    availableFiles: [],
    availableColumns: [],
    scopes: [],
    outputFileName: '',
    kFolds: 5,
    testSize: 0.2
  },
  settings: {
    dataType: '',
    aggregationLevel: '',
    dateFrom: '',
    dateTo: ''
  },
  modelResult: null,
  modelError: null
};
export interface DroppedAtom {
  id: string;
  atomId: string;
  title: string;
  category: string;
  color: string;
  llm?: string;
  source?: 'ai' | 'manual';
  settings?: any;
}

export interface CardVariable {
  id: string;
  name: string;
  formula?: string;
  value?: string;
  description?: string;
  usageSummary?: string;
  appended: boolean;
  originCardId: string;
  originVariableId?: string;
  originAtomId?: string;
  clientId?: string;
  appId?: string;
  projectId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface LayoutCard {
  id: string;
  atoms: DroppedAtom[];
  isExhibited: boolean;
  moleculeId?: string;
  moleculeTitle?: string;
  variables?: CardVariable[];
  textBoxEnabled?: boolean;
  textBoxContent?: string;
  textBoxHtml?: string;
  textBoxSettings?: TextBoxSettings;
  textBoxes?: TextBoxConfig[];
  order?: number; // For positioning standalone cards between molecules
  afterMoleculeId?: string; // Reference to molecule this card is positioned after
  beforeMoleculeId?: string; // Reference to molecule this card is positioned before
  betweenMolecules?: [string, string]; // [moleculeId1, moleculeId2] - card is between these two molecules
  afterLastMolecule?: boolean; // true if card is after the last molecule (converted to betweenMolecules when new molecule added)
  beforeFirstMolecule?: boolean; // true if card is before the first molecule
}

// GroupBy Atom Settings
export interface GroupByAtomSettings {
  // Data source and validation
  dataSource?: string;
  validator_atom_id?: string;
  allColumns?: Array<{ column: string; data_type: string; unique_count?: number }>;
  
  // Identifiers and measures
  identifiers?: string[];
  measures?: string[];
  selectedIdentifiers?: string[];
  selectedMeasures?: Array<{ field: string; aggregator: string; weight_by?: string; rename_to?: string }>;
  selectedMeasureNames?: string[];
  selectedAggregationMethods?: string[];
  
  // Draggable lists for settings tab
  identifierList?: string[];
  measureList?: string[];
  
  // Configuration panel state
  configCollapsed?: boolean;
  
  // Pagination state
  currentPage?: number;
  
  // Results filtering and sorting
  resultsSortColumn?: string;
  resultsSortDirection?: 'asc' | 'desc';
  resultsColumnFilters?: Record<string, string[]>;
  
  // Cardinality view filtering and sorting
  sortColumn?: string;
  sortDirection?: 'asc' | 'desc';
  columnFilters?: Record<string, string[]>;
  showCardinalityView?: boolean;
  
  // GroupBy results
  groupbyResults?: {
    result_file?: string;
    result_shape?: [number, number];
    row_count?: number;
    columns?: string[];
    unsaved_data?: Record<string, any>[];
  };
}

export const DEFAULT_GROUPBY_ATOM_SETTINGS: GroupByAtomSettings = {
  dataSource: '',
  validator_atom_id: '',
  allColumns: [],
  identifiers: [],
  measures: [],
  selectedIdentifiers: [],
  selectedMeasures: [],
  selectedMeasureNames: [],
  selectedAggregationMethods: ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'],
  identifierList: [],
  measureList: [],
  configCollapsed: false,
  currentPage: 1,
  resultsSortColumn: '',
  resultsSortDirection: 'asc',
  resultsColumnFilters: {},
  sortColumn: 'unique_count',
  sortDirection: 'desc',
  columnFilters: {},
  showCardinalityView: false,
  groupbyResults: {
    result_file: '',
    result_shape: [0, 0],
    row_count: 0,
    columns: [],
    unsaved_data: []
  }
};

export interface PivotTableSettings {
  dataSource?: string;
  dataSourceColumns?: string[];
  fields: string[];
  selectedFields: string[];
  rowFields: string[];
  columnFields: string[];
  valueFields: { field: string; aggregation: string; weightColumn?: string }[];
  filterFields: string[];
  pivotResults: any[];
  pivotStatus?: 'idle' | 'pending' | 'success' | 'failed';
  pivotError?: string | null;
  pivotUpdatedAt?: string;
  pivotRowCount?: number;
  pivotLastSavedPath?: string | null;
  pivotLastSavedAt?: string | null;
  pivotFilterOptions?: Record<string, string[]>;
  pivotFilterSelections?: Record<string, string[]>;
  pivotSorting?: Record<string, { 
    type: 'asc' | 'desc' | 'value_asc' | 'value_desc';
    level?: number;
    preserve_hierarchy?: boolean;
  }>;
  grandTotalsMode?: 'off' | 'rows' | 'columns' | 'both';
  subtotalsMode?: 'off' | 'top' | 'bottom';
  percentageMode?: 'off' | 'row' | 'column' | 'grand_total';
  percentageDecimals?: number;
  pivotStyleId?: string;
  pivotStyleOptions?: {
    rowHeaders: boolean;
    columnHeaders: boolean;
    bandedRows: boolean;
  };
  pivotHierarchy?: any[];
  pivotColumnHierarchy?: any[];
  reportLayout?: 'compact' | 'outline' | 'tabular';
  collapsedKeys?: string[];
}

export const DEFAULT_PIVOT_TABLE_SETTINGS: PivotTableSettings = {
  dataSource: '',
  dataSourceColumns: [],
  fields: [],
  selectedFields: [],
  rowFields: [],
  columnFields: [],
  valueFields: [],
  filterFields: [],
  pivotResults: [],
  pivotStatus: 'idle',
  pivotError: null,
  pivotUpdatedAt: undefined,
  pivotRowCount: 0,
  pivotLastSavedPath: null,
  pivotLastSavedAt: null,
  pivotFilterOptions: {},
  pivotFilterSelections: {},
  pivotSorting: {},
  grandTotalsMode: 'off',
  subtotalsMode: 'off',
  percentageMode: 'off',
  percentageDecimals: 2,
  pivotStyleId: 'light-slate',
  pivotStyleOptions: {
    rowHeaders: true,
    columnHeaders: true,
    bandedRows: false,
  },
  pivotHierarchy: [],
  pivotColumnHierarchy: [],
  reportLayout: 'compact',
  collapsedKeys: [],
};

export interface UnpivotSettings {
  atomId?: string;
  projectId?: string;
  workflowId?: string;
  atomName?: string;
  datasetPath?: string;
  dataSourceColumns?: string[];
  idVars: string[];
  valueVars: string[];
  variableColumnName: string;
  valueColumnName: string;
  preFilters: Array<{ field: string; include?: string[]; exclude?: string[] }>;
  postFilters: Array<{ field: string; include?: string[]; exclude?: string[] }>;
  autoRefresh: boolean;
  unpivotResults: any[];
  unpivotStatus?: 'idle' | 'pending' | 'success' | 'failed';
  unpivotError?: string | null;
  unpivotUpdatedAt?: string;
  unpivotRowCount?: number;
  unpivotSummary?: {
    original_rows?: number;
    original_columns?: number;
    unpivoted_rows?: number;
    unpivoted_columns?: number;
    id_vars_count?: number;
    value_vars_count?: number;
  };
  unpivotLastSavedPath?: string | null;
  unpivotLastSavedAt?: string | null;
  computationTime?: number;
}

export const DEFAULT_UNPIVOT_SETTINGS: UnpivotSettings = {
  idVars: [],
  valueVars: [],
  variableColumnName: 'variable',
  valueColumnName: 'value',
  preFilters: [],
  postFilters: [],
  autoRefresh: true,
  unpivotResults: [],
  unpivotStatus: 'idle',
  unpivotError: null,
  unpivotUpdatedAt: undefined,
  unpivotRowCount: 0,
  unpivotSummary: {},
  unpivotLastSavedPath: null,
  unpivotLastSavedAt: null,
  computationTime: 0,
};

export interface MetricsOperation {
  id: string;
  type: string;
  name: string;
  columns?: string[];
  rename?: string;
  param?: string | number | Record<string, any>;
}

export interface VariableOperation {
  id: string;
  numericalColumn: string;
  method: string;
  secondColumn: string;
  secondInputType?: 'column' | 'number';
  secondValue?: string;
  customName?: string;
}

export interface ConstantAssignment {
  id: string;
  variableName: string;
  value: string;
}

export interface MetricsInputSettings {
  dataSource: string;
  operations: MetricsOperation[];
  currentTab: 'input' | 'variables' | 'column-operations' | 'exhibition';
  // Variable tab specific settings
  variableComputeMode?: 'whole-dataframe' | 'within-group';
  variableType?: 'dataframe' | 'constant';
  computeWithinGroup?: boolean;
  variableIdentifiers?: string[];
  selectedVariableIdentifiers?: string[];
  variableOperations?: VariableOperation[];
  constantAssignments?: ConstantAssignment[];
  variableIdentifiersListOpen?: boolean;
  // Column operations tab specific settings
  columnOpsAllIdentifiers?: string[]; // Unfiltered identifiers for compute_metrics_within_group
  columnOpsSelectedIdentifiers?: string[]; // Filtered identifiers (date columns removed) for display
  columnOpsSelectedIdentifiersForBackend?: string[]; // Selected identifiers for backend operations
  columnOpsIdentifiersListOpen?: boolean;
  // Context for table atom auto-display
  contextCardId?: string; // Card ID when metric operation is initiated
  contextAtomId?: string; // Atom ID when metric operation is initiated
}

export const DEFAULT_METRICS_INPUT_SETTINGS: MetricsInputSettings = {
  dataSource: '',
  operations: [],
  currentTab: 'input',
  variableComputeMode: 'whole-dataframe',
  variableType: 'dataframe',
  computeWithinGroup: false,
  variableIdentifiers: [],
  selectedVariableIdentifiers: [],
  variableOperations: [{ id: '1', numericalColumn: '', method: 'sum', secondColumn: '' }],
  constantAssignments: [{ id: '1', variableName: '', value: '' }],
  variableIdentifiersListOpen: false,
  columnOpsAllIdentifiers: [],
  columnOpsSelectedIdentifiers: [],
  columnOpsSelectedIdentifiersForBackend: [],
  columnOpsIdentifiersListOpen: false,
  contextCardId: undefined,
  contextAtomId: undefined,
};

// Mode constants
export type LaboratorySubMode = 'analytics' | 'dashboard';

// Dashboard mode allowed atoms
export const DASHBOARD_ALLOWED_ATOMS = [
  'dataframe-operations',
  'chart-maker',
  'correlation',
  'table',
  'kpi-dashboard'
] as const;

// Helper function to get allowed atoms based on mode
export const getAllowedAtoms = (mode: LaboratorySubMode) => {
  if (mode === 'analytics') {
    return allAtoms;  // All atoms for analytics mode
  }
  // Dashboard mode: filter to only allowed atoms
  return allAtoms.filter(atom => DASHBOARD_ALLOWED_ATOMS.includes(atom.id as any));
};

interface LaboratoryStore {
  // --- State Properties ---
  cards: LayoutCard[];
  auxPanelActive: 'settings' | 'frames' | null;
  auxiliaryMenuLeftOpen: boolean;
  metricsInputs: MetricsInputSettings;
  subMode: LaboratorySubMode;
  isLaboratorySession: boolean;
  pendingClarification?: ClarificationRequest | null;
  activeGuidedFlows: Record<string, { atomId: string; currentStage: UploadStage; state: Partial<GuidedUploadFlowState> }>;
  globalGuidedModeEnabled: boolean;

  // --- Basic Setters ---
  setCards: (cards: LayoutCard[]) => void;
  setAuxPanelActive: (panel: 'settings' | 'frames' | null) => void;
  setAuxiliaryMenuLeftOpen: (open: boolean) => void;
  setSubMode: (mode: LaboratorySubMode) => void;
  setIsLaboratorySession: (active: boolean) => void;
  setPendingClarification: (payload: ClarificationRequest | null) => void;
  reset: () => void;

  // --- Card & Atom Actions ---
  updateCard: (cardId: string, updates: Partial<LayoutCard>) => void;
  updateAtomSettings: (atomId: string, settings: any) => void;
  getAtom: (atomId: string) => DroppedAtom | undefined;

  // --- Variable Actions ---
  addCardVariable: (cardId: string, variable: CardVariable) => void;
  deleteCardVariable: (cardId: string, variableId: string) => void;
  toggleCardVariableAppend: (cardId: string, variableId: string, appended: boolean) => void;
  updateCardVariable: (
    cardId: string,
    variableId: string,
    update: Partial<Omit<CardVariable, 'id' | 'originCardId'>>
  ) => void;

  // --- Metrics Actions ---
  updateMetricsInputs: (updates: Partial<MetricsInputSettings>) => void;
  addMetricsOperation: (operation: MetricsOperation) => void;
  updateMetricsOperation: (operationId: string, updates: Partial<MetricsOperation>) => void;
  removeMetricsOperation: (operationId: string) => void;

  // --- Table Atom Auto-Display Actions ---
  replaceAtomWithTable: (
    cardId: string,
    currentAtomId: string,
    newDataframePath: string
  ) => Promise<{ success: boolean; tableAtomId?: string; error?: string }>;
  createCardWithTableAtom: (
    objectName: string,
    position?: number
  ) => Promise<string | null>;
  updateTableAtomWithFile: (
    atomId: string,
    objectName: string
  ) => Promise<void>;
  findCardByAtomId: (atomId: string) => LayoutCard | undefined;
  findCardIndex: (cardId: string) => number;

  // --- Guided Flow Actions ---
  setActiveGuidedFlow: (atomId: string, currentStage: UploadStage, state?: Partial<GuidedUploadFlowState>) => void;
  updateGuidedFlowStage: (atomId: string, stage: UploadStage) => void;
  removeActiveGuidedFlow: (atomId: string) => void;
  
  // --- Guided Mode Toggle Actions ---
  setGlobalGuidedMode: (enabled: boolean) => void;
  toggleAtomGuidedMode: (atomId: string) => void;
  isGuidedModeActiveForAtom: (atomId: string) => boolean;
}

export const useLaboratoryStore = create<LaboratoryStore>((set, get) => ({
  cards: [],
  auxPanelActive: null,
  auxiliaryMenuLeftOpen: true,
  isLaboratorySession: typeof window !== 'undefined'
    ? window.location.pathname.toLowerCase().includes('laboratory')
    : true,
  pendingClarification: typeof window !== 'undefined'
    ? (() => {
        const stored = localStorage.getItem('trinity_lab_pending_clarification');
        if (!stored) return null;
        try {
          return JSON.parse(stored);
        } catch (error) {
          console.warn('Failed to parse pending clarification from storage', error);
          return null;
        }
      })()
    : null,
  metricsInputs: DEFAULT_METRICS_INPUT_SETTINGS,
  subMode: 'analytics',  // Default to analytics mode
  activeGuidedFlows: {},
  globalGuidedModeEnabled: false,
  setCards: (cards: LayoutCard[]) => {
    const currentSubMode = get().subMode;
    
    console.log('🔍 [DIAGNOSIS] ========== STORE SETCARDS CALLED ==========');
    console.log('🔍 [DIAGNOSIS] setCards called:', {
      cardsCount: cards?.length || 0,
      subMode: currentSubMode,
      cardAtomIds: cards?.map(c => c.atoms.map(a => a.atomId)).flat() || [],
      timestamp: new Date().toISOString()
    });
    
    // FIX: Ensure cards is always an array
    if (!Array.isArray(cards)) {
      console.error('🔍 [DIAGNOSIS] ❌ [Laboratory Store] setCards called with non-array:', cards);
      set({ cards: [] });
      return;
    }
    
    // CRITICAL FIX: Enforce one atom per card - normalize all cards to have only first atom
    let cardsToSet = cards.map(card => ({
      ...card,
      atoms: Array.isArray(card.atoms) && card.atoms.length > 0 ? [card.atoms[0]] : []
    }));
    
    // CRITICAL: Apply mode filtering when setting cards in the store
    // This is a defensive measure - cards should already be filtered, but this ensures no leakage
    if (currentSubMode === 'dashboard' && cardsToSet.length > 0) {
      const allowedAtomIdsSet = new Set(DASHBOARD_ALLOWED_ATOMS);
      const filteredCards: LayoutCard[] = [];
      
      for (const card of cardsToSet) {
        const allowedAtoms = (card.atoms || []).filter(atom => 
          allowedAtomIdsSet.has(atom.atomId as any)
        );
        
        // CRITICAL FIX: Allow empty cards OR cards with allowed atoms
        // Empty cards must be preserved for "Add New Card" functionality in dashboard mode
        if (allowedAtoms.length > 0 || (card.atoms || []).length === 0) {
          // Keep only first allowed atom (one atom per card), or preserve empty array
          filteredCards.push({
            ...card,
            atoms: allowedAtoms.length > 0 ? allowedAtoms.slice(0, 1) : []
          });
        }
      }
      
      if (filteredCards.length !== cardsToSet.length) {
        console.warn('🔍 [DIAGNOSIS] ⚠️ [Laboratory Store] Filtered cards in setCards (dashboard mode):', {
          original: cardsToSet.length,
          filtered: filteredCards.length,
          removed: cardsToSet.length - filteredCards.length,
          removedCards: cardsToSet.filter(card => {
            const allowedAtoms = (card.atoms || []).filter(atom => 
              allowedAtomIdsSet.has(atom.atomId as any)
            );
            return allowedAtoms.length === 0;
          }).map(c => ({
            id: c.id,
            atoms: c.atoms.map(a => a.atomId)
          }))
        });
      }
      cardsToSet = filteredCards;
    }
    
    const uniqueCards = dedupeCards(cardsToSet);
    if (uniqueCards.length !== cardsToSet.length) {
      console.warn('🔍 [DIAGNOSIS] [Laboratory Store] Deduped cards to avoid duplicates', {
        incoming: cardsToSet.length,
        unique: uniqueCards.length,
      });
    }
    
    console.log('🔍 [DIAGNOSIS] Setting cards to store:', {
      count: uniqueCards.length,
      subMode: currentSubMode,
      cardAtomIds: uniqueCards.map(c => c.atoms.map(a => a.atomId)).flat()
    });
    console.log('🔍 [DIAGNOSIS] ========== STORE SETCARDS COMPLETE ==========');
    
    set({ cards: uniqueCards });
  },
  
  setAuxPanelActive: (panel: 'settings' | 'frames' | null) => {
    set({ auxPanelActive: panel });
  },

  setAuxiliaryMenuLeftOpen: (open: boolean) => {
    set({ auxiliaryMenuLeftOpen: open });
  },

  setSubMode: (mode: LaboratorySubMode) => {
    const currentMode = get().subMode;
    const currentCards = get().cards;
    
    console.log('🔍 [DIAGNOSIS] ========== MODE SWITCH START ==========');
    console.log('🔍 [DIAGNOSIS] setSubMode called:', {
      from: currentMode,
      to: mode,
      currentCardsCount: currentCards?.length || 0,
      currentCardAtomIds: currentCards?.map(c => c.atoms.map(a => a.atomId)).flat() || [],
      timestamp: new Date().toISOString()
    });
    
    // Clear old mode's localStorage entries before switching
    if (currentMode && currentMode !== mode) {
      const oldMoleculesKey = currentMode === 'analytics' 
        ? 'workflow-molecules-analytics' 
        : 'workflow-molecules-dashboard';
      const oldAtomsKey = currentMode === 'analytics'
        ? 'workflow-selected-atoms-analytics'
        : 'workflow-selected-atoms-dashboard';
      const oldDataKey = currentMode === 'analytics'
        ? 'workflow-data-analytics'
        : 'workflow-data-dashboard';
      
      console.log('🔍 [DIAGNOSIS] Clearing localStorage for old mode:', {
        oldMode: currentMode,
        keys: { oldMoleculesKey, oldAtomsKey, oldDataKey },
        oldMoleculesValue: localStorage.getItem(oldMoleculesKey),
        oldAtomsValue: localStorage.getItem(oldAtomsKey),
        oldDataValue: localStorage.getItem(oldDataKey)
      });
      
      localStorage.removeItem(oldMoleculesKey);
      localStorage.removeItem(oldAtomsKey);
      localStorage.removeItem(oldDataKey);
      
      console.info('🔍 [DIAGNOSIS] Cleared localStorage for old mode:', currentMode);
    }
    
    // CRITICAL: Clear cards FIRST, then set new mode
    // This ensures cards are cleared before any useEffect hooks fire that depend on subMode
    console.log('🔍 [DIAGNOSIS] Clearing cards before mode switch');
    set({ cards: [] });
    set({ subMode: mode });
    console.info('🔍 [DIAGNOSIS] Switched mode from', currentMode, 'to', mode, '- cards cleared');
    console.log('🔍 [DIAGNOSIS] ========== MODE SWITCH COMPLETE ==========');
  },

  setIsLaboratorySession: (active: boolean) => {
    set({ isLaboratorySession: active });
  },

  setPendingClarification: (payload: ClarificationRequest | null) => {
    set({ pendingClarification: payload });
    if (typeof window !== 'undefined') {
      try {
        if (payload) {
          localStorage.setItem('trinity_lab_pending_clarification', safeStringify(payload));
        } else {
          localStorage.removeItem('trinity_lab_pending_clarification');
        }
      } catch (error) {
        console.warn('Failed to persist pending clarification', error);
      }
    }
  },

  updateCard: (cardId: string, updates: Partial<LayoutCard>) => {
    set((state) => ({
      cards: state.cards.map((card) => {
        if (card.id === cardId) {
          const updatedCard = { ...card, ...updates };
          // CRITICAL FIX: Enforce one atom per card - keep only first atom if atoms are being updated
          if (updates.atoms && Array.isArray(updates.atoms)) {
            updatedCard.atoms = updates.atoms.slice(0, 1);
          } else if (updatedCard.atoms && Array.isArray(updatedCard.atoms) && updatedCard.atoms.length > 1) {
            updatedCard.atoms = [updatedCard.atoms[0]];
          }
          return updatedCard;
        }
        return card;
      }),
    }));
  },

  updateAtomSettings: (atomId: string, settings: any) => {
    // console.log('=== Store: updateAtomSettings called ===');
    // console.log('Store: atomId:', atomId);
    // console.log('Store: settings to update:', settings);
    
    set((state) => {
      // FIX: Ensure cards is always an array
      if (!Array.isArray(state.cards)) {
        console.error('[Laboratory Store] state.cards is not an array in updateAtomSettings:', state.cards);
        return { cards: [] };
      }
      
      const updatedCards = state.cards.map((card) => ({
        ...card,
        atoms: Array.isArray(card.atoms) ? card.atoms.map((atom) =>
          atom.id === atomId
            ? { 
                ...atom, 
                settings: { 
                  ...(atom.settings || {}), 
                  ...settings
                } 
              }
            : atom,
        ) : [],
      }));
      
      return { cards: updatedCards };
    });
  },

  getAtom: (atomId: string) => {
    const state = get();
    // FIX: Ensure cards is always an array
    if (!Array.isArray(state.cards)) {
      console.error('[Laboratory Store] state.cards is not an array in getAtom:', state.cards);
      return undefined;
    }
    return state.cards.flatMap(card => Array.isArray(card.atoms) ? card.atoms : []).find(atom => atom.id === atomId);
  },

  addCardVariable: (cardId: string, variable: CardVariable) => {
    set(state => ({
      cards: state.cards.map(card =>
        card.id === cardId
          ? {
              ...card,
              variables: [...(card.variables ?? []), variable],
            }
          : card,
      ),
    }));
  },

  updateCardVariable: (cardId: string, variableId: string, update: Partial<Omit<CardVariable, 'id' | 'originCardId'>>) => {
    set(state => ({
      cards: state.cards.map(card =>
        card.id === cardId
          ? {
              ...card,
              variables: (card.variables ?? []).map(variable =>
                variable.id === variableId
                  ? {
                      ...variable,
                      ...update,
                      updatedAt: update.updatedAt ?? new Date().toISOString(),
                    }
                  : variable,
              ),
            }
          : card,
      ),
    }));
  },

  deleteCardVariable: (cardId: string, variableId: string) => {
    set(state => ({
      cards: state.cards.map(card =>
        card.id === cardId
          ? {
              ...card,
              variables: (card.variables ?? []).filter(variable => variable.id !== variableId),
            }
          : card,
      ),
    }));
  },

  toggleCardVariableAppend: (cardId: string, variableId: string, appended: boolean) => {
    set(state => ({
      cards: state.cards.map(card =>
        card.id === cardId
          ? {
              ...card,
              variables: (card.variables ?? []).map(variable =>
                variable.id === variableId ? { ...variable, appended } : variable,
              ),
            }
          : card,
      ),
    }));
  },

  updateMetricsInputs: (updates: Partial<MetricsInputSettings>) => {
    set(state => ({
      metricsInputs: {
        ...state.metricsInputs,
        ...updates,
      },
    }));
  },

  addMetricsOperation: (operation: MetricsOperation) => {
    set(state => ({
      metricsInputs: {
        ...state.metricsInputs,
        operations: [...state.metricsInputs.operations, operation],
      },
    }));
  },

  updateMetricsOperation: (operationId: string, updates: Partial<MetricsOperation>) => {
    set(state => ({
      metricsInputs: {
        ...state.metricsInputs,
        operations: state.metricsInputs.operations.map(op =>
          op.id === operationId ? { ...op, ...updates } : op
        ),
      },
    }));
  },

  removeMetricsOperation: (operationId: string) => {
    set(state => ({
      metricsInputs: {
        ...state.metricsInputs,
        operations: state.metricsInputs.operations.filter(op => op.id !== operationId),
      },
    }));
  },

  // --- Table Atom Auto-Display Functions ---
  findCardByAtomId: (atomId: string) => {
    const cards = get().cards;
    if (!Array.isArray(cards)) return undefined;
    return cards.find(card =>
      Array.isArray(card.atoms) && card.atoms.some(atom => atom.id === atomId)
    );
  },

  findCardIndex: (cardId: string) => {
    const cards = get().cards;
    if (!Array.isArray(cards)) return -1;
    return cards.findIndex(card => card.id === cardId);
  },

  updateTableAtomWithFile: async (atomId: string, objectName: string) => {
    // Update atom settings to trigger auto-load
    // We need to explicitly set sourceFile and mode, and ensure tableData is cleared
    // so the auto-load mechanism will trigger
    
    const currentAtom = get().getAtom(atomId);
    if (!currentAtom) {
      console.error('❌ [updateTableAtomWithFile] Atom not found:', atomId);
      return;
    }
    
    const currentSettings = (currentAtom.settings as any) || {};
    const currentSourceFile = currentSettings.sourceFile;
    const isOverwrite = currentSourceFile === objectName; // Same file = overwrite
    
    // Create new settings object with tableData explicitly set to null
    // This ensures the merged settings will have tableData: null (not undefined)
    // Also add reloadTrigger to force useEffect to trigger even if sourceFile is same
    const reloadTrigger = Date.now();
    const newSettings: any = {
      ...currentSettings,
      sourceFile: objectName,
      mode: 'load',
      tableData: null,  // Explicitly set to null to clear existing data
      reloadTrigger: reloadTrigger,  // Force reload even if sourceFile is same (for overwrite case)
    };
    
    console.log('🔄 [updateTableAtomWithFile] Updating atom settings:', {
      atomId,
      objectName,
      currentSourceFile,
      isOverwrite,
      mode: 'load',
      tableDataCleared: true,
      reloadTrigger: reloadTrigger,
      hadTableData: currentSettings.tableData !== undefined && currentSettings.tableData !== null
    });
    
    get().updateAtomSettings(atomId, newSettings);
    
    console.log('✅ [updateTableAtomWithFile] Settings updated, waiting for useEffect to trigger reload');
  },

  createCardWithTableAtom: async (objectName: string, position?: number) => {
    try {
      // console.log('🆕 [createCardWithTableAtom] Starting:', { objectName, position });
      // console.log('🆕 [createCardWithTableAtom] LABORATORY_API:', LABORATORY_API);
      
      const response = await fetch(`${LABORATORY_API}/cards`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          atomId: 'table',
          source: 'ai'
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ [createCardWithTableAtom] API error:', response.status, errorText);
        throw new Error(`Failed to create card: ${response.statusText}`);
      }
      
      const payload = await response.json();
      // console.log('✅ [createCardWithTableAtom] API response:', payload);
      
      const tableAtomInfo = allAtoms.find(a => a.id === 'table');
      
      // Build atom with proper structure
      const atomPayload = Array.isArray(payload.atoms) && payload.atoms.length > 0
        ? payload.atoms[0]
        : { atomId: 'table', id: `table-${Date.now()}-${Math.random().toString(36).substr(2, 9)}` };
      
      const newTableAtom: DroppedAtom = {
        id: atomPayload.id || `table-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        atomId: atomPayload.atomId || 'table',
        title: tableAtomInfo?.title || 'Table',
        category: tableAtomInfo?.category || 'Atom',
        color: tableAtomInfo?.color || 'bg-teal-500',
        source: atomPayload.source || 'ai',
        settings: {
          sourceFile: objectName,
          mode: 'load',
          // Don't set tableData - let auto-load mechanism handle it
          visibleColumns: [],
          columnOrder: [],
          columnWidths: {},
          rowHeight: 24,
          rowHeights: {},
          showRowNumbers: true,
          showSummaryRow: false,
          frozenColumns: 0,
          filters: {},
          sortConfig: [],
          currentPage: 1,
          pageSize: 15,
        }
      };
      
      // console.log('🆕 [createCardWithTableAtom] Created Table atom:', {
      //   id: newTableAtom.id,
      //   sourceFile: objectName
      // });
      
      // Build card from API payload
      const newCard: LayoutCard = {
        id: payload.id,
        atoms: [newTableAtom],
        isExhibited: payload.isExhibited || false,
        moleculeId: payload.molecule_id,
        variables: []
      };
      
      // Add card to store
      const currentCards = get().cards;
      const insertIndex = position !== undefined && position >= 0 
        ? Math.min(position, currentCards.length)
        : currentCards.length;
      const updatedCards = [
        ...currentCards.slice(0, insertIndex),
        newCard,
        ...currentCards.slice(insertIndex)
      ];
      
      // console.log('💾 [createCardWithTableAtom] Updating cards:', {
      //   currentCount: currentCards.length,
      //   newCount: updatedCards.length,
      //   insertIndex
      // });
      
      set({ cards: updatedCards });
      
      // console.log('✅ [createCardWithTableAtom] Successfully created card with Table atom');
      return newTableAtom.id;
    } catch (error) {
      console.error('❌ [createCardWithTableAtom] Error:', error);
      return null;
    }
  },

  replaceAtomWithTable: async (
    cardId: string,
    currentAtomId: string,
    newDataframePath: string
  ) => {
    const cards = get().cards;
    if (!Array.isArray(cards)) {
      console.error('❌ [replaceAtomWithTable] Cards array is invalid');
      return { success: false, error: 'Cards array is invalid' };
    }

    const cardIndex = cards.findIndex(c => c.id === cardId);
    
    if (cardIndex === -1) {
      console.error('❌ [replaceAtomWithTable] Card not found:', cardId);
      return { success: false, error: 'Card not found' };
    }
    
    const card = cards[cardIndex];
    const currentAtom = Array.isArray(card.atoms) 
      ? card.atoms.find(a => a.id === currentAtomId)
      : undefined;
    
    if (!currentAtom) {
      console.error('❌ [replaceAtomWithTable] Atom not found in card:', currentAtomId);
      return { success: false, error: 'Atom not found in card' };
    }
    
    // console.log('🔄 [replaceAtomWithTable] Processing:', {
    //   cardId,
    //   currentAtomId,
    //   currentAtomType: currentAtom.atomId,
    //   newDataframePath
    // });
    
    // Check if current atom is already Table
    if (currentAtom.atomId === 'table') {
      // Just update the existing Table atom
      // console.log('✅ [replaceAtomWithTable] Atom is already Table, updating file');
      await get().updateTableAtomWithFile(currentAtomId, newDataframePath);
      return { success: true, tableAtomId: currentAtomId };
    }
    
    // Get Table atom info from registry
    const tableAtomInfo = allAtoms.find(a => a.id === 'table');
    if (!tableAtomInfo) {
      console.error('❌ [replaceAtomWithTable] Table atom not found in registry');
      return { success: false, error: 'Table atom not found in registry' };
    }
    
    // Create new Table atom
    const newTableAtomId = `table-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newTableAtom: DroppedAtom = {
      id: newTableAtomId,
      atomId: 'table',
      title: tableAtomInfo.title || 'Table',
      category: tableAtomInfo.category || 'Atom',
      color: tableAtomInfo.color || 'bg-teal-500',
      source: 'ai' as const,
      settings: {
        sourceFile: newDataframePath,
        mode: 'load',
        // Don't set tableData - let auto-load mechanism handle it
        visibleColumns: [],
        columnOrder: [],
        columnWidths: {},
        rowHeight: 24,
        rowHeights: {},
        showRowNumbers: true,
        showSummaryRow: false,
        frozenColumns: 0,
        filters: {},
        sortConfig: [],
        currentPage: 1,
        pageSize: 15,
      }
    };
    
    // console.log('🆕 [replaceAtomWithTable] Created new Table atom:', {
    //   id: newTableAtomId,
    //   sourceFile: newDataframePath
    // });
    
    // Create new card for original atom at position cardIndex + 1
    const newCardId = `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newCard: LayoutCard = {
      id: newCardId,
      atoms: [currentAtom], // Move original atom here
      isExhibited: false,
      variables: card.variables || [],
      // Preserve molecule info if exists
      moleculeId: card.moleculeId,
      moleculeTitle: card.moleculeTitle,
    };
    
    // Update cards array:
    // 1. Replace atom in Card N with Table atom
    // 2. Insert new card at position N+1
    const updatedCards = [
      ...cards.slice(0, cardIndex),
      {
        ...card,
        atoms: [newTableAtom] // Replace with Table atom
      },
      newCard, // Insert at N+1
      ...cards.slice(cardIndex + 1) // Shift rest
    ];
    
    // console.log('💾 [replaceAtomWithTable] Updating cards array:', {
    //   totalCards: updatedCards.length,
    //   cardIndex,
    //   newCardInsertedAt: cardIndex + 1
    // });
    
    set({ cards: updatedCards });
    
    // console.log('✅ [replaceAtomWithTable] Successfully replaced atom');
    return { success: true, tableAtomId: newTableAtomId };
  },

  // --- Guided Flow Actions ---
  setActiveGuidedFlow: (atomId: string, currentStage: UploadStage, state?: Partial<GuidedUploadFlowState>) => {
    set((prev) => ({
      activeGuidedFlows: {
        ...prev.activeGuidedFlows,
        [atomId]: {
          atomId,
          currentStage,
          state: state || {},
        },
      },
    }));
  },

  updateGuidedFlowStage: (atomId: string, stage: UploadStage) => {
    set((prev) => {
      const flow = prev.activeGuidedFlows[atomId];
      if (!flow) return prev;
      return {
        activeGuidedFlows: {
          ...prev.activeGuidedFlows,
          [atomId]: {
            ...flow,
            currentStage: stage,
          },
        },
      };
    });
  },

  removeActiveGuidedFlow: (atomId: string) => {
    set((prev) => {
      const { [atomId]: removed, ...rest } = prev.activeGuidedFlows;
      return { activeGuidedFlows: rest };
    });
  },

  // --- Guided Mode Toggle Actions ---
  setGlobalGuidedMode: (enabled: boolean) => {
    set({ globalGuidedModeEnabled: enabled });
  },



  isGuidedModeActiveForAtom: (atomId: string) => {
    const state = get();
    // When global guided mode is enabled, it applies to ALL atoms
    // Individual atom overrides are ignored to maintain global consistency
    return state.globalGuidedModeEnabled;
  },

  reset: () => {
    set({
      cards: [],
      metricsInputs: DEFAULT_METRICS_INPUT_SETTINGS,
      pendingClarification: null,
      activeGuidedFlows: {},
      globalGuidedModeEnabled: false,
    });
    if (typeof window !== 'undefined') {
      localStorage.removeItem('trinity_lab_pending_clarification');
    }
  },
}));
