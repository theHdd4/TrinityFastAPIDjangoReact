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
  activeMetric: '',
  activeRow: null
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
    set((state) => {
      const updatedCards = state.cards.map((card) => ({
        ...card,
        atoms: card.atoms.map((atom) => {
          if (atom.id === atomId) {
            return { ...atom, settings };
          }
          return atom;
        })
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
