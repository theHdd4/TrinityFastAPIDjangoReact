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
    set((state) => {
      const updatedCards = state.cards.map((card) => ({
        ...card,
        atoms: card.atoms.map((atom) =>
          atom.id === atomId
            ? { ...atom, settings: { ...(atom.settings || {}), ...settings } }
            : atom,
        ),
      }));
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
