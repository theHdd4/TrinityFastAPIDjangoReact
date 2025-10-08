import { create } from "zustand";
import { safeStringify } from "@/utils/safeStringify";

export interface TextBoxSettings {
  format: "quill-delta" | "markdown" | "html" | "plain";
  content: string;
  allow_variables: boolean;
  max_chars: number;
  text_align: "left" | "center" | "right" | "justify";
  font_size: number;
  font_family: string;
  text_color: string;
  bold: boolean;
  italics: boolean;
  underline: boolean;
  headline: string;
  slide_layout: "full" | "sidebar" | "note-callout";
  transition_effect: "none" | "fade" | "typewriter";
  lock_content: boolean;
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
  bold: false,
  italics: false,
  underline: false,
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
  columnConfig: Record<string, Record<string, string>>;
  frequency: string;
  dimensions: Record<string, unknown>;
  measures: Record<string, unknown>;
  uploadedFiles: string[];
  validatorId?: string;
  requiredFiles?: string[];
  validations?: Record<string, any>;
  fileMappings?: Record<string, string>;
  /** Map of displayed master file names to the original names known by the backend */
  fileKeyMap?: Record<string, string>;
  /** Map of uploaded file display names to the stored MinIO object path */
  filePathMap?: Record<string, string>;
  /** Map of uploaded file display names to their file size in bytes */
  fileSizeMap?: Record<string, number>;
}

export const DEFAULT_DATAUPLOAD_SETTINGS: DataUploadSettings = {
  masterFile: "",
  fileValidation: true,
  bypassMasterUpload: false,
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
};

export const createDefaultDataUploadSettings = (): DataUploadSettings => ({
  masterFile: "",
  fileValidation: true,
  bypassMasterUpload: false,
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
});

export interface FeatureOverviewExhibitionSelectionDimension {
  name: string;
  value: string;
}

export interface FeatureOverviewExhibitionSelection {
  key: string;
  metric: string;
  combination: Record<string, string>;
  dimensions: FeatureOverviewExhibitionSelectionDimension[];
  rowId?: string | number;
  label?: string;
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
  columnValuesLoading: false,
  columnValuesError: undefined
};

export interface ColumnClassifierColumn {
  name: string;
  category: "identifiers" | "measures" | "unclassified" | string;
}

export interface ColumnClassifierFile {
  fileName: string;
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
}

export interface ChartMakerConfig {
  id: string;
  title: string;
  type: 'line' | 'bar' | 'area' | 'pie' | 'scatter';
  xAxis: string;
  yAxis: string;
  filters: Record<string, string[]>;
  chartConfig?: any;
  filteredData?: Record<string, any>[];
  chartRendered?: boolean;
  chartLoading?: boolean;
  lastUpdateTime?: number;
  isAdvancedMode?: boolean;
  traces?: ChartTraceConfig[];
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
  }
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
      chartRendered: false,
      chartLoading: false,
      isAdvancedMode: false,
      traces: [],
    },
  ],
  loading: {
    uploading: false,
    fetchingColumns: false,
    fetchingUniqueValues: false,
    filtering: false,
  },
  error: undefined,
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
    availableColumns: ['Feature 1', 'Feature 2', 'Feature 3', 'Feature 4', 'Feature 5', 'Feature 6', 'Feature 7', 'Feature 8'],
    scopes: ['Scope 1', 'Scope 2', 'Scope 3', 'Scope 4', 'Scope 5'],
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

export interface LayoutCard {
  id: string;
  atoms: DroppedAtom[];
  isExhibited: boolean;
  moleculeId?: string;
  moleculeTitle?: string;
}

interface LaboratoryStore {
  cards: LayoutCard[];
  auxPanelActive: 'settings' | 'frames' | null;
  setCards: (cards: LayoutCard[]) => void;
  setAuxPanelActive: (panel: 'settings' | 'frames' | null) => void;
  updateAtomSettings: (atomId: string, settings: any) => void;
  getAtom: (atomId: string) => DroppedAtom | undefined;
  reset: () => void;
}

export const useLaboratoryStore = create<LaboratoryStore>((set, get) => ({
  cards: [],
  auxPanelActive: null,
  setCards: (cards: LayoutCard[]) => {
    set({ cards });
  },
  
  setAuxPanelActive: (panel: 'settings' | 'frames' | null) => {
    set({ auxPanelActive: panel });
  },

  updateAtomSettings: (atomId: string, settings: any) => {
    // console.log('=== Store: updateAtomSettings called ===');
    // console.log('Store: atomId:', atomId);
    // console.log('Store: settings to update:', settings);
    
    set((state) => {
      const updatedCards = state.cards.map((card) => ({
        ...card,
        atoms: card.atoms.map((atom) =>
          atom.id === atomId
            ? { 
                ...atom, 
                settings: { 
                  ...(atom.settings || {}), 
                  ...settings
                } 
              }
            : atom,
        ),
      }));
      
      return { cards: updatedCards };
    });
  },

  getAtom: (atomId: string) => {
    const state = get();
    return state.cards.flatMap(card => card.atoms).find(atom => atom.id === atomId);
  },

  reset: () => {
    set({ cards: [] });
  },
}));
