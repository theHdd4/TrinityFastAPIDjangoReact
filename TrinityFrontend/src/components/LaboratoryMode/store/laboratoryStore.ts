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
};

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

export interface ScenarioPlannerSettings {
  selectedScenario: string;
  allScenarios: string[];
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
    identifiers: string[];
    values: Record<string, {
      input: number;
      change: number;
      reference: number;
    }>;
  }>;
  referenceMethod: 'period-mean' | 'mean' | 'period-median' | 'median';
  referencePeriod: {
    from: string;
    to: string;
  };
  resultViews: Array<{
    id: string;
    name: string;
    selectedCombinations: string[];
  }>;
  selectedResultScenario: string;
  selectedView: string;
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
  // ✅ NEW: Properties for auto-refresh functionality
  referenceValuesNeedRefresh?: boolean;
  lastReferenceMethod?: 'period-mean' | 'mean' | 'period-median' | 'median';
  lastReferencePeriod?: {
    from: string;
    to: string;
  };
}

export const DEFAULT_SCENARIO_PLANNER_SETTINGS: ScenarioPlannerSettings = {
  selectedScenario: 'scenario-1',
  allScenarios: ['scenario-1', 'scenario-2'],
  identifiers: [
    {
      id: 'identifier-1',
      name: 'Identifier 1',
      values: [
        { id: '1a', name: 'Identifier 1-A', checked: true },
        { id: '1b', name: 'Identifier 1-B', checked: false },
        { id: '1c', name: 'Identifier 1-C', checked: false },
      ]
    },
    {
      id: 'identifier-2',
      name: 'Identifier 2',
      values: [
        { id: '2a', name: 'Identifier 2-A', checked: true },
        { id: '2b', name: 'Identifier 2-B', checked: false },
        { id: '2c', name: 'Identifier 2-C', checked: false },
      ]
    },
    {
      id: 'identifier-3',
      name: 'Identifier 3',
      values: [
        { id: '3a', name: 'Identifier 3-A', checked: false },
        { id: '3b', name: 'Identifier 3-B', checked: false },
        { id: '3c', name: 'Identifier 3-C', checked: false },
      ]
    },
    {
      id: 'identifier-4',
      name: 'Identifier 4',
      values: [
        { id: '4a', name: 'Identifier 4-A', checked: false },
        { id: '4b', name: 'Identifier 4-B', checked: false },
        { id: '4c', name: 'Identifier 4-C', checked: false },
      ]
    }
  ],
  features: [
    { id: 'feature-1', name: 'Feature 1', selected: true },
    { id: 'feature-2', name: 'Feature 2', selected: true },
    { id: 'feature-3', name: 'Feature 3', selected: true },
    { id: 'feature-4', name: 'Feature 4', selected: true },
    { id: 'feature-5', name: 'Feature 5', selected: false },
    { id: 'feature-6', name: 'Feature 6', selected: false },
    { id: 'feature-7', name: 'Feature 7', selected: false },
  ],
  outputs: [
    { id: 'output-1', name: 'Output 1', selected: true },
    { id: 'output-2', name: 'Output 2', selected: true },
    { id: 'output-3', name: 'Output 3', selected: true },
    { id: 'output-4', name: 'Output 4', selected: true },
  ],
  combinations: [],
  referenceMethod: 'period-mean',
  referencePeriod: { from: '01-JAN-2020', to: '30-MAR-2024' },
  resultViews: [
    { id: 'view-1', name: 'View 1', selectedCombinations: [] },
    { id: 'view-2', name: 'View 2', selectedCombinations: [] },
    { id: 'view-3', name: 'View 3', selectedCombinations: [] },
  ],
  selectedResultScenario: 'scenario-1',
  selectedView: 'view-1',
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
  lastReferenceMethod: 'period-mean',
  lastReferencePeriod: { from: '01-JAN-2020', to: '30-MAR-2024' }
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
  setCards: (cards: LayoutCard[]) => void;
  updateAtomSettings: (atomId: string, settings: any) => void;
  getAtom: (atomId: string) => DroppedAtom | undefined;
  reset: () => void;
}

export const useLaboratoryStore = create<LaboratoryStore>((set, get) => ({
  cards: [],
  setCards: (cards: LayoutCard[]) => {
    set({ cards });
  },

  updateAtomSettings: (atomId: string, settings: any) => {
    console.log('=== Store: updateAtomSettings called ===');
    console.log('Store: atomId:', atomId);
    console.log('Store: settings to update:', settings);
    console.log('Store: resultViews in settings:', settings.resultViews);
    
    set((state) => {
      const updatedCards = state.cards.map((card) => ({
        ...card,
        atoms: card.atoms.map((atom) =>
          atom.id === atomId
            ? { 
                ...atom, 
                settings: { 
                  ...(atom.settings || {}), 
                  ...settings,
                  // Ensure resultViews is properly updated
                  ...(settings.resultViews && { resultViews: settings.resultViews })
                } 
              }
            : atom,
        ),
      }));
      
      // Debug: Log the updated atom settings
      const updatedAtom = updatedCards.flatMap(card => card.atoms).find(atom => atom.id === atomId);
      console.log('Store: Updated atom settings:', updatedAtom?.settings);
      console.log('Store: Updated resultViews:', updatedAtom?.settings?.resultViews);
      console.log('=== Store: updateAtomSettings completed ===');
      
      return { cards: updatedCards };
    });
  },
  getAtom: (atomId) => {
    for (const card of get().cards) {
      const atom = card.atoms.find((a) => a.id === atomId);
      if (atom) return atom;
    }
    return undefined;
  },
  reset: () => {
    set({ cards: [] });
  },
}));






