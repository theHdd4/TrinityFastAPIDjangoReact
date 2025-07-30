import { create } from 'zustand';
import { safeStringify } from '@/utils/safeStringify';

export interface TextBoxSettings {
  format: 'quill-delta' | 'markdown' | 'html' | 'plain';
  content: string;
  allow_variables: boolean;
  max_chars: number;
  text_align: 'left' | 'center' | 'right' | 'justify';
  font_size: number;
  font_family: string;
  text_color: string;
  bold: boolean;
  italics: boolean;
  underline: boolean;
  headline: string;
  slide_layout: 'full' | 'sidebar' | 'note-callout';
  transition_effect: 'none' | 'fade' | 'typewriter';
  lock_content: boolean;
}

export const DEFAULT_TEXTBOX_SETTINGS: TextBoxSettings = {
  format: 'plain',
  content: '',
  allow_variables: false,
  max_chars: 100,
  text_align: 'left',
  font_size: 14,
  font_family: 'Inter',
  text_color: '#000000',
  bold: false,
  italics: false,
  underline: false,
  headline: '',
  slide_layout: 'full',
  transition_effect: 'none',
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
  classification?: Record<string, { identifiers: string[]; measures: string[] }>;
  fileMappings?: Record<string, string>;
}

export const DEFAULT_DATAUPLOAD_SETTINGS: DataUploadSettings = {
  masterFile: '',
  fileValidation: true,
  bypassMasterUpload: false,
  columnConfig: {},
  frequency: 'monthly',
  dimensions: {},
  measures: {},
  uploadedFiles: [],
  validatorId: undefined,
  requiredFiles: [],
  validations: {},
  classification: {},
  fileMappings: {}
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
  dataSource: '',
  csvDisplay: '',
  filterCriteria: {},
  columnSummary: [],
  allColumns: [],
  numericColumns: [],
  marketDims: [],
  productDims: [],
  yAxes: [],
  xAxis: 'date',
  skuTable: [],
  statDataMap: {},
  activeMetric: "",
  activeRow: null,
  dimensionMap: {},
  filterUnique: false,
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
  direction: 'vertical',
  performConcat: false,
  concatResults: undefined,
  concatId: undefined
};

export interface ColumnClassifierColumn {
  name: string;
  category: 'identifiers' | 'measures' | 'unclassified' | string;
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
}

export const DEFAULT_COLUMN_CLASSIFIER_SETTINGS: ColumnClassifierSettings = {
  data: {
    files: [],
    activeFileIndex: 0
  },
  validatorId: '',
  fileKey: '',
  dimensions: [],
  assignments: {}
};

export interface ChartMakerData {
  file: File;
  columns: string[];
  allColumns: string[];
  uniqueValuesByColumn: Record<string, string[]>;
}

// Enhanced trace configuration for multiple data series
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
  yAxis: string; // Keep for backward compatibility
  filters: Record<string, string[]>; // Keep for backward compatibility
  
  // New multi-trace support
  traces?: ChartTraceConfig[];
  isAdvancedMode?: boolean; // Toggle between simple and advanced mode
  
  filteredData?: Record<string, any>[]; // Store filtered data for this specific chart
  chartConfig?: any; // Store the recharts config returned from backend
  lastUpdateTime?: number; // Timestamp of last update (optional)
  chartRendered?: boolean; // Whether the chart has been rendered (per chart)
  chartLoading?: boolean;  // Whether the chart is loading (per chart)
}

export interface ChartMakerSettings {
  uploadedData: any; // File, columns, and uniqueValuesByColumn
  fileId?: string; // Backend file ID for API calls
  dataSource?: string; // Selected dataframe object name
  numberOfCharts: number;
  charts: ChartMakerConfig[];
  chartResponse?: any; // Raw response from the chart API
  processedChartData?: any[]; // Processed data for recharts
  chartRendered?: boolean; // Whether the chart has been rendered
  lastUpdateTime?: number; // Timestamp of last update
  loading?: {
    uploading: boolean;
    fetchingColumns: boolean;
    fetchingUniqueValues: boolean;
    filtering: boolean;
  };
  error?: string; // Error message if any operation fails
}

export const DEFAULT_CHART_MAKER_SETTINGS: ChartMakerSettings = {
  uploadedData: null,
  fileId: undefined,
  numberOfCharts: 1,
  charts: [{
    id: '1',
    title: 'Chart 1',
    type: 'line',
    xAxis: '',
    yAxis: '',
    filters: {}
  }],
  chartResponse: null,
  processedChartData: [],
  chartRendered: false,
  lastUpdateTime: 0,
  loading: {
    uploading: false,
    fetchingColumns: false,
    fetchingUniqueValues: false,
    filtering: false,
  },
  error: undefined
};

export interface DroppedAtom {
  id: string;
  atomId: string;
  title: string;
  category: string;
  color: string;
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
    set(state => {
      const updatedCards = state.cards.map(card => ({
        ...card,
        atoms: card.atoms.map(atom =>
          atom.id === atomId
            ? { ...atom, settings: { ...(atom.settings || {}), ...settings } }
            : atom
        )
      }));
      return { cards: updatedCards };
    });
  },
  getAtom: (atomId) => {
    for (const card of get().cards) {
      const atom = card.atoms.find(a => a.id === atomId);
      if (atom) return atom;
    }
    return undefined;
  },
  reset: () => {
    set({ cards: [] });
  }
}));
