import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Database, ChevronRight, ChevronDown, ChevronUp, Trash2, Pencil, Loader2, ChevronLeft, Download, Copy, Share2, Upload, Layers, SlidersHorizontal, RefreshCw, X, Wrench, FileText, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { VALIDATE_API, SESSION_API, CLASSIFIER_API, SHARE_LINKS_API } from '@/lib/api';
import { waitForTaskResult } from '@/lib/taskQueue';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus } from 'lucide-react';
import ColumnClassifierDimensionMapping from '@/components/AtomList/atoms/column-classifier/components/ColumnClassifierDimensionMapping';
import { fetchDimensionMapping } from '@/lib/dimensions';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import ConfirmationDialog from '@/templates/DialogueBox/ConfirmationDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { GuidedUploadFlow } from '@/components/AtomList/atoms/data-validate/components/guided-upload';
import { getActiveProjectContext } from '@/utils/projectEnv';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useLaboratoryStore, createDefaultDataUploadSettings, DroppedAtom } from '@/components/LaboratoryMode/store/laboratoryStore';
import { useGuidedFlowPersistence } from '@/components/LaboratoryMode/hooks/useGuidedFlowPersistence';
import { openGuidedMode } from './equalizer_icon';
import { atoms as allAtoms } from '@/components/AtomList/data';

interface Props {
  isOpen: boolean;
  onToggle: () => void;
  collapseDirection?: 'left' | 'right';
}

const SavedDataFramesPanel: React.FC<Props> = ({ isOpen, onToggle, collapseDirection = 'right' }) => {
  // Add rainbow bounce animation style
  const rainbowBounceStyle = `
    @keyframes rainbowBounce {
      0%, 100% {
        transform: translateY(0) scale(1);
        color: #ff0000;
      }
      10% {
        transform: translateY(-8px) scale(1.3);
        color: #ff7f00;
      }
      20% {
        transform: translateY(0) scale(1);
        color: #ffff00;
      }
      30% {
        transform: translateY(-8px) scale(1.3);
        color: #00ff00;
      }
      40% {
        transform: translateY(0) scale(1);
        color: #0000ff;
      }
      50% {
        transform: translateY(-8px) scale(1.3);
        color: #4b0082;
      }
      60% {
        transform: translateY(0) scale(1);
        color: #9400d3;
      }
      70% {
        transform: translateY(-8px) scale(1.3);
        color: #ff0000;
      }
      80% {
        transform: translateY(0) scale(1);
        color: #ff69b4;
      }
      90% {
        transform: translateY(-8px) scale(1.3);
        color: #00ffff;
      }
    }
    .rainbow-bounce-icon {
      animation: rainbowBounce 8s ease-in-out infinite;
      filter: drop-shadow(0 0 8px currentColor);
    }
    
    /* Blinking equalizer animation for unprimed files - Red, Green, Blue, Yellow */
    @keyframes equalizerBlink {
      0% {
        color: #ff6b6b;
        filter: drop-shadow(0 0 6px rgba(255, 107, 107, 0.8)) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
        transform: scale(1) translateZ(0);
      }
      25% {
        color: #51cf66;
        filter: drop-shadow(0 0 6px rgba(81, 207, 102, 0.8)) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
        transform: scale(1.1) translateZ(0);
      }
      50% {
        color: #4dabf7;
        filter: drop-shadow(0 0 6px rgba(77, 171, 247, 0.8)) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
        transform: scale(1.15) translateZ(0);
      }
      75% {
        color: #ffd43b;
        filter: drop-shadow(0 0 6px rgba(255, 212, 59, 0.8)) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
        transform: scale(1.1) translateZ(0);
      }
      100% {
        color: #ff6b6b;
        filter: drop-shadow(0 0 6px rgba(255, 107, 107, 0.8)) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
        transform: scale(1) translateZ(0);
      }
    }
    .equalizer-blink-unprimed {
      animation: equalizerBlink 1.5s ease-in-out infinite;
      will-change: color, filter, transform;
      backface-visibility: hidden;
      perspective: 1000px;
    }
  `;

  interface Frame {
    object_name: string;
    csv_name: string;
    arrow_name?: string;
    last_modified?: string;
    size?: number;
  }
  interface ExcelSheet {
    object_name: string;
    sheet_name: string;
    arrow_name: string;
    csv_name: string;
    last_modified?: string;
    size?: number;
  }
  interface ExcelFolder {
    name: string;
    path: string;
    type: "excel_folder";
    sheets: ExcelSheet[];
  }
  interface ProcessingColumnConfig {
    name: string;
    newName: string;
    originalDtype: string;
    selectedDtype: string;
    sampleValues: string[];
    missingCount: number;
    missingPercentage: number;
    missingStrategy: string;
    missingCustomValue: string;
    datetimeFormat?: string;
    formatDetecting?: boolean;
    formatFailed?: boolean;
    dropColumn: boolean;
    classification?: 'identifiers' | 'measures' | 'unclassified';
  }
  interface TreeNode {
    name: string;
    path: string;
    children?: TreeNode[];
    frame?: Frame;
    isExcelFolder?: boolean;
    isSheetsFolder?: boolean;
    sheets?: ExcelSheet[];
  }

  interface EnvTarget {
    client: string;
    app: string;
    project: string;
  }

  const [files, setFiles] = useState<Frame[]>([]);
  const [excelFolders, setExcelFolders] = useState<ExcelFolder[]>([]);
  const [prefix, setPrefix] = useState('');
  const [filePrimingStatus, setFilePrimingStatus] = useState<Record<string, {
    isApproved: boolean;  // Simple boolean: true = green (approved), false = red (not approved)
  }>>({});
  const [openDirs, setOpenDirs] = useState<Record<string, boolean>>({});
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<
    { type: 'one'; target: string } | { type: 'folder'; target: string } | { type: 'all' } | null
  >(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    target: string;
    frame?: Frame;
    folderPath?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [classifyLoading, setClassifyLoading] = useState<Record<string, boolean>>({});
  const [classifyError, setClassifyError] = useState<Record<string, string>>({});
  const [classifyData, setClassifyData] = useState<Record<string, {
    identifiers: string[];
    measures: string[];
    unclassified: string[];
  }>>({});
  const [columnsByObject, setColumnsByObject] = useState<Record<string, { name: string; category: 'identifiers' | 'measures' | 'unclassified' }[]>>({});
  const [dimensionsByObject, setDimensionsByObject] = useState<Record<string, Record<string, string[]>>>({});
  const [savingByObject, setSavingByObject] = useState<Record<string, boolean>>({});
  const [saveErrorByObject, setSaveErrorByObject] = useState<Record<string, string>>({});
  const [dimensionOptionsByObject, setDimensionOptionsByObject] = useState<Record<string, string[]>>({});
  const [dimensionSelectedByObject, setDimensionSelectedByObject] = useState<Record<string, string[]>>({});
  const [showAddDimInputByObject, setShowAddDimInputByObject] = useState<Record<string, boolean>>({});
  const [newDimInputByObject, setNewDimInputByObject] = useState<Record<string, string>>({});
  const [showDimensionTableByObject, setShowDimensionTableByObject] = useState<Record<string, boolean>>({});
  const [columnDimensionByObject, setColumnDimensionByObject] = useState<Record<string, Record<string, string>>>({});
  const [businessOpenByObject, setBusinessOpenByObject] = useState<Record<string, boolean>>({});
  const [shareDialog, setShareDialog] = useState<{ open: boolean; objectName: string; filename: string } | null>(null);
  const [shareLink, setShareLink] = useState<string>('');
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const shareLinkInputRef = React.useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingFilesQueue, setPendingFilesQueue] = useState<File[]>([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [sheetOptions, setSheetOptions] = useState<string[]>([]);
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]); // Changed to array for multi-select
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [hasMultipleSheets, setHasMultipleSheets] = useState(false);
  const [tempUploadMeta, setTempUploadMeta] = useState<{ 
    file_path: string; 
    file_name: string; 
    workbook_path?: string | null;
    upload_session_id?: string;
    sheetNameMap?: Record<string, string>; // Maps original sheet names to normalized names
  } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [pendingProcessFiles, setPendingProcessFiles] = useState<string[]>([]);
  const [sheetChangeTarget, setSheetChangeTarget] = useState<Frame | null>(null);
  const [sheetChangeOptions, setSheetChangeOptions] = useState<string[]>([]);
  const [sheetChangeSelected, setSheetChangeSelected] = useState('');
  const [sheetChangeLoading, setSheetChangeLoading] = useState(false);
  const [sheetChangeError, setSheetChangeError] = useState('');
  const [hasMultipleSheetsByFile, setHasMultipleSheetsByFile] = useState<Record<string, boolean>>({});
  const [processingTarget, setProcessingTarget] = useState<Frame | null>(null);
  const [modeSelectionTarget, setModeSelectionTarget] = useState<Frame | null>(null);
  const [processingColumns, setProcessingColumns] = useState<ProcessingColumnConfig[]>([]);
  const [processingLoading, setProcessingLoading] = useState(false);
  const [processingSaving, setProcessingSaving] = useState(false);
  const [processingError, setProcessingError] = useState('');
  const [viewTarget, setViewTarget] = useState<Frame | null>(null);

  // Laboratory store hooks for guided flow
  const setActiveGuidedFlow = useLaboratoryStore((state) => state.setActiveGuidedFlow);
  const setGlobalGuidedMode = useLaboratoryStore((state) => state.setGlobalGuidedMode);
  const setDirectReviewTarget = useLaboratoryStore((state) => state.setDirectReviewTarget);
  const directReviewTarget = useLaboratoryStore((state) => state.directReviewTarget);
  const cards = useLaboratoryStore((state) => state.cards);
  const updateCard = useLaboratoryStore((state) => state.updateCard);
  const setCards = useLaboratoryStore((state) => state.setCards);
  const addAtom = useLaboratoryStore((state) => (state as any).addAtom); // May not exist, used only for debugging
  const activeGuidedFlows = useLaboratoryStore((state) => state.activeGuidedFlows);
  const removeActiveGuidedFlow = useLaboratoryStore((state) => state.removeActiveGuidedFlow);
  const globalGuidedModeEnabled = useLaboratoryStore((state) => state.globalGuidedModeEnabled);
  
  // State for mode switching confirmation dialog
  const [modeSwitchConfirmation, setModeSwitchConfirmation] = useState<{
    show: boolean;
    fromMode: 'direct' | 'guided';
    toMode: 'direct' | 'guided';
    frame: Frame | null;
    onConfirm: () => void;
  }>({
    show: false,
    fromMode: 'direct',
    toMode: 'guided',
    frame: null,
    onConfirm: () => {},
  });
  
  // Hook for marking files as primed
  const { markFileAsPrimed } = useGuidedFlowPersistence();

  // Helper function to find or create a data-upload atom
  // Use useCallback to ensure stable function reference
  // Priority: data-upload atom (new integrated approach) > landing-screen atom (legacy) > create new data-upload atom
  const findOrCreateDataUploadAtom = useCallback(() => {
    try {
      console.log('[findOrCreateDataUploadAtom] Looking for data-upload or landing card atom, cards type:', Array.isArray(cards) ? `array(${cards.length})` : typeof cards);
      
      if (Array.isArray(cards)) {
        // First, look for data-upload atom (new integrated approach in Upload atom)
        for (const card of cards) {
          if (card?.atoms && Array.isArray(card.atoms)) {
            for (const atom of card.atoms) {
              if (atom?.atomId === 'data-upload' && atom?.id) {
                console.log('[findOrCreateDataUploadAtom] Found data-upload atom (integrated):', atom.id);
                return atom.id;
              }
            }
          }
        }
        
        // Fallback: look for landing-screen atom (legacy approach)
        for (const card of cards) {
          if (card?.atoms && Array.isArray(card.atoms)) {
            for (const atom of card.atoms) {
              if (atom?.atomId === 'landing-screen' && atom?.id) {
                console.log('[findOrCreateDataUploadAtom] Found landing-screen atom (legacy):', atom.id);
                return atom.id;
              }
            }
          }
        }
      }

      // No existing atom found - create a new data-upload atom
      console.log('[findOrCreateDataUploadAtom] No existing data-upload atom found, creating a new one...');
      
      // Get atom information from allAtoms
      const atomInfo = allAtoms.find(a => a.id === 'data-upload');
      if (!atomInfo) {
        console.error('[findOrCreateDataUploadAtom] data-upload atom not found in allAtoms');
        return '';
      }

      // Generate unique IDs
      const generateId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newAtomId = generateId('data-upload');
      const newCardId = generateId('card');

      // Create new atom with proper structure
      const newAtom: DroppedAtom = {
        id: newAtomId,
        atomId: 'data-upload',
        title: atomInfo.title || 'Data Upload',
        category: atomInfo.category || 'Data Sources',
        color: atomInfo.color || 'bg-blue-500',
        source: 'manual',
        settings: createDefaultDataUploadSettings(),
      };

      // Create new card with the atom
      const newCard = {
        id: newCardId,
        atoms: [newAtom],
        isExhibited: false,
        variables: [],
      };

      // Add the new card to the cards array
      const currentCards = Array.isArray(cards) ? cards : [];
      setCards([...currentCards, newCard]);

      console.log('[findOrCreateDataUploadAtom] Created new data-upload atom:', newAtomId, 'in card:', newCardId);
      return newAtomId;
    } catch (error) {
      console.error('[findOrCreateDataUploadAtom] Error:', error);
      return '';
    }
  }, [cards, setCards]);
  
  const [viewColumns, setViewColumns] = useState<ProcessingColumnConfig[]>([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewError, setViewError] = useState('');
  const [isGuidedUploadFlowOpen, setIsGuidedUploadFlowOpen] = useState(false);
  const [guidedFlowInitialFile, setGuidedFlowInitialFile] = useState<{ name: string; path: string; size?: number } | undefined>(undefined);
  const [guidedFlowInitialStage, setGuidedFlowInitialStage] = useState<'U2' | 'U3' | 'U4' | 'U5' | 'U6'>('U2');

  const getProcessingDtypeOptions = (currentDtype: string) => {
    const baseOptions = [
      { value: 'object', label: 'Object' },
      { value: 'int64', label: 'Integer' },
      { value: 'float64', label: 'Float' },
      { value: 'datetime64', label: 'DateTime' },
      { value: 'bool', label: 'Boolean' },
    ];
    const exists = baseOptions.some(opt => opt.value === currentDtype);
    if (!exists && currentDtype) {
      return [{ value: currentDtype, label: currentDtype }, ...baseOptions];
    }
    return baseOptions;
  };

  const getProcessingMissingOptions = (dtype: string) => {
    const base = [
      { value: 'none', label: 'Keep as Missing' },
      { value: 'drop', label: 'Drop Rows' },
      { value: 'custom', label: 'Custom Value' },
    ];
    if (dtype.includes('int') || dtype.includes('float')) {
      return [
        ...base,
        { value: 'mean', label: 'Fill with Mean' },
        { value: 'median', label: 'Fill with Median' },
        { value: 'zero', label: 'Fill with 0' },
      ];
    }
    if (dtype.includes('str') || dtype === 'object' || dtype === 'string') {
      return [
        ...base,
        { value: 'mode', label: 'Fill with Mode' },
        { value: 'empty', label: 'Fill with Empty String' },
      ];
    }
    return base;
  };

  const getProcessingDtypeBadgeColor = (dtype: string) => {
    const lower = dtype.toLowerCase();
    if (lower.includes('int') || lower.includes('float')) return 'bg-blue-100 text-blue-800';
    if (lower.includes('str') || lower === 'object' || lower === 'string') return 'bg-green-100 text-green-800';
    if (lower.includes('datetime')) return 'bg-purple-100 text-purple-800';
    if (lower.includes('bool')) return 'bg-orange-100 text-orange-800';
    return 'bg-gray-100 text-gray-800';
  };

  const getDimensionTextClass = (dimensionName: string, orderedDims: string[]): string => {
    if (dimensionName === 'unattributed') return 'text-gray-600';
    const palette = [
      'text-purple-600',
      'text-orange-600',
      'text-pink-600',
      'text-cyan-600',
      'text-indigo-600',
      'text-teal-600',
      'text-rose-600',
      'text-amber-600',
      'text-lime-600',
      'text-fuchsia-600',
    ];
    const idx = Math.max(0, orderedDims.indexOf(dimensionName));
    return palette[idx % palette.length];
  };

  const syncColumnsWithConfig = (
    objectName: string,
    base: { identifiers: string[]; measures: string[]; unclassified: string[] },
    cfg?: { identifiers?: string[]; measures?: string[] }
  ) => {
    const idSet = new Set<string>(cfg?.identifiers || base.identifiers || []);
    const msSet = new Set<string>(cfg?.measures || base.measures || []);
    const all = Array.from(new Set<string>([...base.identifiers, ...base.measures, ...base.unclassified]));
    const merged = all.map(name => {
      const category: 'identifiers' | 'measures' | 'unclassified' = idSet.has(name)
        ? 'identifiers'
        : msSet.has(name)
        ? 'measures'
        : 'unclassified';
      return { name, category };
    });
    setColumnsByObject(prev => ({ ...prev, [objectName]: merged }));
  };

  const runClassification = async (objectName: string): Promise<{ identifiers: string[]; measures: string[]; unclassified: string[] } | null> => {
    setClassifyError(prev => ({ ...prev, [objectName]: '' }));
    setClassifyLoading(prev => ({ ...prev, [objectName]: true }));
    try {
      const form = new FormData();
      form.append('dataframe', objectName);
      form.append('identifiers', '[]');
      form.append('measures', '[]');
      form.append('unclassified', '[]');
      form.append('bypass_cache', 'true');
      const res = await fetch(`${CLASSIFIER_API}/classify_columns`, {
        method: 'POST',
        body: form,
        credentials: 'include'
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error((data && data.detail) || 'Failed to classify');
      }
      const fc = data?.final_classification || {};
      setClassifyData(prev => ({
        ...prev,
        [objectName]: {
          identifiers: Array.isArray(fc.identifiers) ? fc.identifiers : [],
          measures: Array.isArray(fc.measures) ? fc.measures : [],
          unclassified: Array.isArray(fc.unclassified) ? fc.unclassified : []
        }
      }));
      // Prefill per-column table using classification (may be overridden by saved config loaded separately)
      syncColumnsWithConfig(objectName, {
        identifiers: Array.isArray(fc.identifiers) ? fc.identifiers : [],
        measures: Array.isArray(fc.measures) ? fc.measures : [],
        unclassified: Array.isArray(fc.unclassified) ? fc.unclassified : []
      });
      // Initialize dimension options and defaults
      setDimensionOptionsByObject(prev => ({
        ...prev,
        [objectName]: Array.from(new Set(['unattributed', 'market', 'product', ...((prev[objectName] || []))]))
      }));
      setDimensionSelectedByObject(prev => ({
        ...prev,
        [objectName]: (prev[objectName] || []).filter(d => d !== 'unattributed').slice(0, 10)
      }));
      // Default identifier columns to 'unattributed' in mapping table
      setColumnDimensionByObject(prev => ({
        ...prev,
        [objectName]: Object.fromEntries(
          ((fc.identifiers || []) as string[]).map((c: string) => [c, 'unattributed'])
        )
      }));
      return {
        identifiers: Array.isArray(fc.identifiers) ? fc.identifiers : [],
        measures: Array.isArray(fc.measures) ? fc.measures : [],
        unclassified: Array.isArray(fc.unclassified) ? fc.unclassified : []
      };
    } catch (e: any) {
      setClassifyError(prev => ({ ...prev, [objectName]: e.message || 'Failed to classify' }));
      return null;
    } finally {
      setClassifyLoading(prev => ({ ...prev, [objectName]: false }));
    }
  };

  const loadSavedMapping = async (objectName: string, base?: { identifiers: string[]; measures: string[]; unclassified: string[] }) => {
    try {
      const { mapping, config } = await fetchDimensionMapping({ objectName });
      if (mapping) {
        setDimensionsByObject(prev => ({ ...prev, [objectName]: mapping }));
        const keys = Object.keys(mapping);
        setDimensionOptionsByObject(prev => ({ ...prev, [objectName]: Array.from(new Set(['unattributed', 'market', 'product', ...keys])) }));
        setDimensionSelectedByObject(prev => ({ ...prev, [objectName]: keys.filter(k => k !== 'unattributed') }));
        // Invert mapping to column->dimension for the table
        const colToDim: Record<string, string> = {};
        Object.entries(mapping).forEach(([dim, cols]) => {
          (cols || []).forEach((col: string) => { colToDim[col] = dim; });
        });
        // Ensure all known identifier columns set
        const allCols = (columnsByObject[objectName] || [])
          .filter(c => c.category === 'identifiers')
          .map(c => c.name);
        allCols.forEach(c => { if (!colToDim[c]) colToDim[c] = 'unattributed'; });
        setColumnDimensionByObject(prev => ({ ...prev, [objectName]: colToDim }));
        setShowDimensionTableByObject(prev => ({ ...prev, [objectName]: true }));
        // If a mapping exists, default the Business Dimensions section to minimized
        setBusinessOpenByObject(prev => ({ ...prev, [objectName]: false }));
      }
      if (config) {
        const baseSet = base || classifyData[objectName] || { identifiers: [], measures: [], unclassified: [] };
        syncColumnsWithConfig(objectName, baseSet as any, {
          identifiers: Array.isArray(config.identifiers) ? config.identifiers : [],
          measures: Array.isArray(config.measures) ? config.measures : []
        });
        // If a saved config exists, minimize the Business Dimensions section by default
        setBusinessOpenByObject(prev => ({ ...prev, [objectName]: false }));
      }
    } catch (err) {
      // ignore if none
    }
  };

  const onToggleExpand = async (objName: string) => {
    setExpandedRows(prev => (prev[objName] ? {} : { [objName]: true }));
    // Ensure default dimension options and selection are present immediately
    setDimensionOptionsByObject(prev => ({
      ...prev,
      [objName]: Array.from(new Set(['unattributed', 'market', 'product', ...((prev[objName] || []))]))
    }));
    setDimensionSelectedByObject(prev => ({
      ...prev,
      [objName]: prev[objName] && prev[objName].length ? prev[objName] : []
    }));
    // Kick off classification and saved mapping load
    let base: { identifiers: string[]; measures: string[]; unclassified: string[] } | null = null;
    if (!classifyData[objName]) {
      base = await runClassification(objName);
    } else {
      base = classifyData[objName];
    }
    await loadSavedMapping(objName, base || undefined);
    setBusinessOpenByObject(prev => ({ ...prev, [objName]: true }));
  };

  const { user } = useAuth();

  const normalizeName = (value: unknown): string =>
    typeof value === 'string' ? value.trim().toLowerCase() : '';

  const extractDisplayContext = (source?: Record<string, any>) => ({
    client:
      typeof source?.CLIENT_NAME === 'string'
        ? source.CLIENT_NAME
        : typeof source?.client_name === 'string'
        ? source.client_name
        : '',
    app:
      typeof source?.APP_NAME === 'string'
        ? source.APP_NAME
        : typeof source?.app_name === 'string'
        ? source.app_name
        : '',
    project:
      typeof source?.PROJECT_NAME === 'string'
        ? source.PROJECT_NAME
        : typeof source?.project_name === 'string'
        ? source.project_name
        : '',
  });

  const formatContext = (ctx: Partial<EnvTarget>) =>
    `CLIENT_NAME=${ctx.client || '∅'} APP_NAME=${ctx.app || '∅'} PROJECT_NAME=${ctx.project || '∅'}`;

  const contextsMatch = (expected: EnvTarget, candidate?: Record<string, any>) => {
    if (!candidate) return false;
    const actual = extractDisplayContext(candidate);
    const actualNorm = {
      client: normalizeName(actual.client),
      app: normalizeName(actual.app),
      project: normalizeName(actual.project),
    };
    const expectedNorm = {
      client: normalizeName(expected.client),
      app: normalizeName(expected.app),
      project: normalizeName(expected.project),
    };
    if (expectedNorm.client) {
      if (!actualNorm.client || actualNorm.client !== expectedNorm.client) {
        return false;
      }
    }
    if (expectedNorm.app) {
      if (!actualNorm.app || actualNorm.app !== expectedNorm.app) {
        return false;
      }
    }
    if (expectedNorm.project) {
      if (!actualNorm.project || actualNorm.project !== expectedNorm.project) {
        return false;
      }
    }
    return true;
  };

  const buildPrefixFromTarget = (target: EnvTarget) => {
    const parts = [target.client, target.app, target.project]
      .map(part => (typeof part === 'string' ? part.trim() : ''))
      .filter(Boolean) as string[];
    return parts.length ? `${parts.join('/')}/` : '';
  };

  const sleep = (ms: number) =>
    new Promise<void>(resolve => {
      window.setTimeout(resolve, ms);
    });

  const readExpectedContext = (): { env: Record<string, any>; target: EnvTarget } => {
    let parsedEnv: Record<string, any> = {};
    const envStr = localStorage.getItem('env');
    if (envStr) {
      try {
        parsedEnv = JSON.parse(envStr);
      } catch {
        parsedEnv = {};
      }
    }

    let currentProjectName = '';
    const currentStr = localStorage.getItem('current-project');
    if (currentStr) {
      try {
        const current = JSON.parse(currentStr);
        if (current && typeof current.name === 'string') {
          currentProjectName = current.name;
        }
      } catch {
        /* ignore */
      }
    }

    const pickValue = (...values: (string | undefined)[]) => {
      for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
          return value.trim();
        }
      }
      return '';
    };

    const target: EnvTarget = {
      client: pickValue(parsedEnv.CLIENT_NAME, parsedEnv.client_name),
      app: pickValue(parsedEnv.APP_NAME, parsedEnv.app_name),
      project: pickValue(parsedEnv.PROJECT_NAME, parsedEnv.project_name, currentProjectName),
    };

    return { env: parsedEnv, target };
  };

  const appendEnvFields = (form: FormData) => {
    const envStr = localStorage.getItem('env');
    if (envStr) {
      try {
        const env = JSON.parse(envStr);
        form.append('client_id', env.CLIENT_ID || '');
        form.append('app_id', env.APP_ID || '');
        form.append('project_id', env.PROJECT_ID || '');
        form.append('client_name', env.CLIENT_NAME || '');
        form.append('app_name', env.APP_NAME || '');
        form.append('project_name', env.PROJECT_NAME || '');
      } catch {
        /* ignore */
      }
    }
    if (user?.id) {
      form.append('user_id', String(user.id));
    }
  };

  const deriveFileKey = (name: string) => {
    const base = name.replace(/\.[^.]+$/, '') || 'dataframe';
    const sanitized = base.replace(/[^A-Za-z0-9_.-]+/g, '_');
    return sanitized || 'dataframe';
  };

  const resetUploadState = () => {
    setPendingFile(null);
    setSheetOptions([]);
    setSelectedSheets([]);
    setUploadingFile(false);
    setUploadError('');
    setHasMultipleSheets(false);
    setTempUploadMeta(null);
    setIsUploadModalOpen(false);
  };

  const finalizeSave = async (meta: { file_path: string; file_name: string }) => {
    setUploadingFile(true);
    try {
      const form = new FormData();
      form.append('validator_atom_id', 'panel-upload');
      form.append('file_paths', JSON.stringify([meta.file_path]));
      const fileKey = deriveFileKey(meta.file_name);
      form.append('file_keys', JSON.stringify([fileKey]));
      form.append('overwrite', 'false');
      const workbookPathsPayload =
        tempUploadMeta?.workbook_path ? [tempUploadMeta.workbook_path] : [];
      const sheetMetadataPayload =
        tempUploadMeta?.workbook_path
          ? [
              {
                sheet_names: sheetOptions.length ? sheetOptions : selectedSheets.length > 0 ? selectedSheets : [],
                selected_sheet: selectedSheets.length > 0 ? selectedSheets[0] : sheetOptions[0] || '',
                original_filename: pendingFile?.name || tempUploadMeta.file_name || '',
              },
            ]
          : [];
      if (workbookPathsPayload.length) {
        form.append('workbook_paths', JSON.stringify(workbookPathsPayload));
      }
      if (sheetMetadataPayload.length) {
        form.append('sheet_metadata', JSON.stringify(sheetMetadataPayload));
      }
      appendEnvFields(form);
      const res = await fetch(`${VALIDATE_API}/save_dataframes`, {
        method: 'POST',
        body: form,
        credentials: 'include'
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || 'Failed to save dataframe');
      }
      toast({ title: 'Dataframe saved', description: `${meta.file_name} uploaded successfully.` });
      // Construct the actual object_name using prefix + fileKey + .arrow extension (this is how MinIO stores it)
      const expectedObjectName = prefix ? `${prefix}${fileKey}.arrow` : `${fileKey}.arrow`;
      setPendingProcessFiles(prev => [...prev, expectedObjectName]);
      resetUploadState();
      setReloadToken(prev => prev + 1);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to save dataframe');
    } finally {
      setUploadingFile(false);
    }
  };

  const finalizeSaveMultiSheet = async (fileName: string, uploadSessionId: string, sheetsToSave: string[]) => {
    setUploadingFile(true);
    try {
      const excelFolderName = fileName.replace(/\.[^.]+$/, '').replace(/\s+/g, '_').replace(/\./g, '_');
      
      for (let index = 0; index < sheetsToSave.length; index++) {
        const sheetName = sheetsToSave[index];
        const sheetIndex = index + 1; // 1-based index
        
        try {
          // Get normalized sheet name from mapping or normalize it
          const normalizedSheetName = tempUploadMeta?.sheetNameMap?.[sheetName] || 
            sheetName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') || 'Sheet';
          
          // Use the convert endpoint to save sheet directly
          const convertForm = new FormData();
          convertForm.append('upload_session_id', uploadSessionId);
          convertForm.append('sheet_name', normalizedSheetName);
          convertForm.append('original_filename', fileName);
          convertForm.append('use_folder_structure', 'false');
          convertForm.append('sheet_index', String(sheetIndex));
          appendEnvFields(convertForm);
          
          const convertRes = await fetch(`${VALIDATE_API}/convert-session-sheet-to-arrow`, {
            method: 'POST',
            body: convertForm,
            credentials: 'include'
          });
          
          if (!convertRes.ok) {
            const errorData = await convertRes.json().catch(() => null);
            const errorText = errorData?.detail || await convertRes.text().catch(() => '');
            console.warn(`Failed to convert sheet ${sheetName}:`, errorText);
            setUploadError(`Failed to save sheet "${sheetName}": ${errorText}`);
            continue;
          }
          
          const convertData = await convertRes.json();
          const sheetPath = convertData.file_path || '';
          const displayFileName = convertData.file_name || `${fileName}_sheet${sheetIndex}`;
          
          if (!sheetPath) {
            console.warn(`No file path returned for sheet ${sheetName}`);
            continue;
          }
          
          // Trigger refresh of SavedDataFramesPanel
          window.dispatchEvent(new CustomEvent('dataframe-saved', { 
            detail: { filePath: sheetPath, fileName: displayFileName } 
          }));
        } catch (err: any) {
          console.error(`Error saving sheet ${sheetName}:`, err);
          setUploadError(`Error saving sheet "${sheetName}": ${err.message || 'Unknown error'}`);
        }
      }
      
      toast({ 
        title: 'Files uploaded successfully', 
        description: `Saved ${sheetsToSave.length} sheet${sheetsToSave.length > 1 ? 's' : ''} from ${fileName}.`,
      });
      
      resetUploadState();
      setReloadToken(prev => prev + 1);
      
      // Process next file in queue if any
      setPendingFilesQueue(prev => {
        if (prev.length > 0) {
          const nextFile = prev[0];
          setTimeout(() => {
            setPendingFile(nextFile);
            setUploadError('');
            setSheetOptions([]);
            setSelectedSheets([]);
            setHasMultipleSheets(false);
            setTempUploadMeta(null);
            setIsUploadModalOpen(true);
            void uploadSelectedFile(nextFile);
          }, 100);
          return prev.slice(1);
        }
        return prev;
      });
    } catch (err: any) {
      setUploadError(err.message || 'Failed to save sheets');
    } finally {
      setUploadingFile(false);
    }
  };

  const uploadSelectedFile = async (file: File, sheets?: string[]) => {
    setUploadingFile(true);
    setUploadError('');
    try {
      // Replace spaces with underscores in filename
      const sanitizedFileName = file.name.replace(/\s+/g, '_');
      const sanitizedFile = sanitizedFileName !== file.name 
        ? new File([file], sanitizedFileName, { type: file.type, lastModified: file.lastModified })
        : file;
      
      // Check if it's an Excel file - use multi-sheet endpoint
      const isExcelFile = sanitizedFileName.toLowerCase().endsWith('.xlsx') || 
                         sanitizedFileName.toLowerCase().endsWith('.xls');
      
      if (isExcelFile) {
        // Use multi-sheet Excel upload endpoint
        const form = new FormData();
        form.append('file', sanitizedFile);
        appendEnvFields(form);
        
        const res = await fetch(`${VALIDATE_API}/upload-excel-multi-sheet`, {
          method: 'POST',
          body: form,
          credentials: 'include'
        });
        
        if (!res.ok) {
          const errorData = await res.json().catch(() => null);
          const detail = errorData?.detail || (typeof errorData === 'string' ? errorData : '');
          throw new Error(detail || 'Upload failed');
        }
        
        const data = await res.json();
        const sheetNames = Array.isArray(data.sheets) ? data.sheets : [];
        const sheetDetails = Array.isArray(data.sheet_details) ? data.sheet_details : [];
        const uploadSessionId = data.upload_session_id || data.session_id;
        const fileName = data.file_name || sanitizedFileName;
        
        if (sheetNames.length === 0) {
          throw new Error('No sheets found in Excel file');
        }
        
        // Create a map of original sheet names to normalized names
        const sheetNameMap = new Map<string, string>();
        sheetDetails.forEach((detail: any) => {
          if (detail.original_name && detail.normalized_name) {
            sheetNameMap.set(detail.original_name, detail.normalized_name);
          }
        });
        
        // If no details, normalize names ourselves
        if (sheetNameMap.size === 0) {
          sheetNames.forEach((name: string) => {
            const normalized = name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '') || 'Sheet';
            sheetNameMap.set(name, normalized);
          });
        }
        
        setTempUploadMeta({
          file_path: data.original_file_path || '',
          file_name: fileName,
          workbook_path: data.original_file_path || null,
          upload_session_id: uploadSessionId,
          sheetNameMap: Object.fromEntries(sheetNameMap),
        });
        
        setSheetOptions(sheetNames);
        setSelectedSheets(sheets || sheetNames); // Default to all sheets
        setHasMultipleSheets(sheetNames.length > 1);
        
        if (sheetNames.length > 1 && !sheets) {
          // Show modal to select sheets
          setUploadingFile(false);
          setIsUploadModalOpen(true);
          return;
        }
        
        // Save all selected sheets
        await finalizeSaveMultiSheet(fileName, uploadSessionId, sheets || sheetNames);
      } else {
        // CSV or other file - use regular upload endpoint
        const form = new FormData();
        form.append('file', sanitizedFile);
        appendEnvFields(form);
        const res = await fetch(`${VALIDATE_API}/upload-file`, {
          method: 'POST',
          body: form,
          credentials: 'include'
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload) {
          const detail = payload?.detail || (typeof payload === 'string' ? payload : '');
          throw new Error(detail || 'Upload failed');
        }
        const data = await waitForTaskResult(payload);
        await finalizeSave({ file_path: data.file_path, file_name: data.file_name || sanitizedFileName });
        
        // Process next file in queue if any
        setPendingFilesQueue(prev => {
          if (prev.length > 0) {
            const nextFile = prev[0];
            setTimeout(() => {
              setPendingFile(nextFile);
              setUploadError('');
              setSheetOptions([]);
              setSelectedSheets([]);
              setHasMultipleSheets(false);
              setTempUploadMeta(null);
              setIsUploadModalOpen(true);
              void uploadSelectedFile(nextFile);
            }, 100);
            return prev.slice(1);
          }
          return prev;
        });
      }
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed');
      setUploadingFile(false);
    }
  };

  const triggerFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleSheetConfirm = () => {
    if (!pendingFile || selectedSheets.length === 0) return;
    if (!tempUploadMeta?.upload_session_id) {
      // Fallback to single sheet upload
      uploadSelectedFile(pendingFile, [selectedSheets[0]]);
      return;
    }
    finalizeSaveMultiSheet(
      tempUploadMeta.file_name,
      tempUploadMeta.upload_session_id,
      selectedSheets
    );
  };

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    
    const fileArray = Array.from(files) as File[];
    const firstFile = fileArray[0];
    const remainingFiles = fileArray.slice(1);
    
    // Store remaining files in queue
    if (remainingFiles.length > 0) {
      setPendingFilesQueue(remainingFiles);
    }
    
    setPendingFile(firstFile);
    setUploadError('');
    setSheetOptions([]);
    setSelectedSheets([]);
    setHasMultipleSheets(false);
    setTempUploadMeta(null);
    setIsUploadModalOpen(true);
    void uploadSelectedFile(firstFile);
    event.target.value = '';
  };

  const closeProcessingModal = () => {
    setProcessingTarget(null);
    setProcessingColumns([]);
    setProcessingError('');
    setProcessingLoading(false);
    setProcessingSaving(false);
  };

  const closeViewModal = () => {
    setViewTarget(null);
    setViewColumns([]);
    setViewError('');
    setViewLoading(false);
  };

  const openViewModal = async (frame: Frame) => {
    setViewTarget(frame);
    setViewColumns([]);
    setViewError('');
    setViewLoading(true);
    try {
      const res = await fetch(`${VALIDATE_API}/file-metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ file_path: frame.object_name })
      });
      
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || 'Failed to load dataframe metadata');
      }
      
      const data = await res.json();
      
      // Load saved config from mongo to get classification
      let savedConfig: { identifiers: string[]; measures: string[] } | null = null;
      const fileName = frame.object_name || '';
      
      try {
        const envStr = localStorage.getItem('env');
        const env = envStr ? JSON.parse(envStr) : {};
        
        const queryParams = new URLSearchParams({
          client_name: env.CLIENT_NAME || '',
          app_name: env.APP_NAME || '',
          project_name: env.PROJECT_NAME || '',
          bypass_cache: 'true',
        });
        if (fileName) {
          queryParams.append('file_name', fileName);
        }
        
        const configRes = await fetch(`${CLASSIFIER_API}/get_config?${queryParams.toString()}`, {
          credentials: 'include'
        });
        
        if (configRes.ok) {
          const configData = await configRes.json();
          if (configData?.data) {
            savedConfig = {
              identifiers: Array.isArray(configData.data.identifiers) ? configData.data.identifiers : [],
              measures: Array.isArray(configData.data.measures) ? configData.data.measures : []
            };
          }
        }
      } catch (err) {
        console.warn('Error fetching saved config for view modal:', err);
      }
      
      // Get default classification if no saved config
      let base: { identifiers: string[]; measures: string[]; unclassified: string[] } | null = null;
      const hasSavedConfig = savedConfig && (savedConfig.identifiers.length > 0 || savedConfig.measures.length > 0);
      
      if (!hasSavedConfig) {
        if (!classifyData[frame.object_name]) {
          base = await runClassification(frame.object_name);
        } else {
          base = classifyData[frame.object_name];
        }
      }
      
      const baseSet = base || { identifiers: [], measures: [], unclassified: [] };
      const idSet = new Set<string>(savedConfig?.identifiers || baseSet.identifiers || []);
      const msSet = new Set<string>(savedConfig?.measures || baseSet.measures || []);
      
      const allColumns = (data.columns || []).map((col: any) => col.name || '').filter(Boolean);
      const classificationMap: Record<string, 'identifiers' | 'measures' | 'unclassified'> = {};
      
      const idMap = new Map<string, string>();
      const msMap = new Map<string, string>();
      idSet.forEach(id => {
        idMap.set(id.toLowerCase(), id);
      });
      msSet.forEach(ms => {
        msMap.set(ms.toLowerCase(), ms);
      });
      
      allColumns.forEach((colName: string) => {
        const colLower = colName.toLowerCase();
        if (idSet.has(colName)) {
          classificationMap[colName] = 'identifiers';
        } else if (msSet.has(colName)) {
          classificationMap[colName] = 'measures';
        } else if (idMap.has(colLower)) {
          classificationMap[colName] = 'identifiers';
        } else if (msMap.has(colLower)) {
          classificationMap[colName] = 'measures';
        } else {
          classificationMap[colName] = 'unclassified';
        }
      });
      
      const cols: ProcessingColumnConfig[] = (data.columns || []).map((col: any) => {
        const dtype = typeof col.dtype === 'string' && col.dtype ? col.dtype : 'object';
        return {
          name: col.name || '',
          newName: col.name || '',
          originalDtype: dtype,
          selectedDtype: dtype,
          sampleValues: Array.isArray(col.sample_values)
            ? col.sample_values.map((val: unknown) => (val === null || val === undefined ? '' : String(val)))
            : [],
          missingCount: typeof col.missing_count === 'number' ? col.missing_count : 0,
          missingPercentage: typeof col.missing_percentage === 'number' ? col.missing_percentage : 0,
          missingStrategy: 'none',
          missingCustomValue: '',
          datetimeFormat: undefined,
          formatDetecting: false,
          formatFailed: false,
          dropColumn: false,
          classification: classificationMap[col.name || ''] || 'unclassified',
        };
      });
      
      // Sort columns by classification
      const sortedCols = cols.sort((a, b) => {
        const rank = { identifiers: 0, measures: 1, unclassified: 2 } as const;
        const aRank = rank[a.classification || 'unclassified'];
        const bRank = rank[b.classification || 'unclassified'];
        return aRank - bRank;
      });
      
      setViewColumns(sortedCols);
    } catch (err: any) {
      setViewError(err.message || 'Failed to load dataframe metadata');
    } finally {
      setViewLoading(false);
    }
  };

  const normalizeFillValue = (value: string, dtype: string) => {
    const trimmed = value.trim();
    if (!trimmed.length) return undefined;
    const dtypeLower = (dtype || '').toLowerCase();
    if (['int', 'integer', 'int64', 'float', 'double', 'float64'].includes(dtypeLower)) {
      const numeric = Number(trimmed);
      return Number.isNaN(numeric) ? trimmed : numeric;
    }
    if (['bool', 'boolean'].includes(dtypeLower)) {
      const normalized = trimmed.toLowerCase();
      if (['true', '1', 'yes'].includes(normalized)) return true;
      if (['false', '0', 'no'].includes(normalized)) return false;
      return trimmed;
    }
    return trimmed;
  };

  // Wrapper function to open guided flow using the separate module
  // Use useCallback to ensure stable function reference
  const handleOpenGuidedFlow = useCallback(async (frame: Frame) => {
    try {
      console.log('[handleOpenGuidedFlow] Starting with frame:', frame);
      console.log('[handleOpenGuidedFlow] Function types:', {
        findOrCreateDataUploadAtom: typeof findOrCreateDataUploadAtom,
        setActiveGuidedFlow: typeof setActiveGuidedFlow,
        setGlobalGuidedMode: typeof setGlobalGuidedMode,
        addAtom: typeof addAtom,
        cards: Array.isArray(cards) ? `array(${cards.length})` : typeof cards,
      });

      // Verify all functions are available before calling
      if (typeof findOrCreateDataUploadAtom !== 'function') {
        console.error('[handleOpenGuidedFlow] findOrCreateDataUploadAtom is not a function, type:', typeof findOrCreateDataUploadAtom);
        return;
      }
      if (typeof setActiveGuidedFlow !== 'function') {
        console.error('[handleOpenGuidedFlow] setActiveGuidedFlow is not a function, type:', typeof setActiveGuidedFlow);
        return;
      }
      if (typeof setGlobalGuidedMode !== 'function') {
        console.error('[handleOpenGuidedFlow] setGlobalGuidedMode is not a function, type:', typeof setGlobalGuidedMode);
        return;
      }
      
      // Verify required functions are available before proceeding
      if (typeof updateCard !== 'function' || typeof setCards !== 'function') {
        console.error('[handleOpenGuidedFlow] updateCard or setCards is not available', {
          updateCard: typeof updateCard,
          setCards: typeof setCards,
        });
        return;
      }

      // Create a wrapper function that ensures findOrCreateDataUploadAtom is called safely
      const safeFindOrCreateAtom = () => {
        try {
          console.log('[handleOpenGuidedFlow] safeFindOrCreateAtom called');
          const result = findOrCreateDataUploadAtom();
          console.log('[handleOpenGuidedFlow] findOrCreateDataUploadAtom returned:', result);
          return result;
        } catch (error) {
          console.error('[handleOpenGuidedFlow] Error in findOrCreateDataUploadAtom:', error);
          return '';
        }
      };
      
      await openGuidedMode({
        frame,
        findOrCreateDataUploadAtom: safeFindOrCreateAtom,
        setActiveGuidedFlow,
        setGlobalGuidedMode,
        cards, // Pass cards as fallback
        updateCard, // Pass updateCard for fallback
        setCards, // Pass setCards for fallback
      });
    } catch (error) {
      console.error('[handleOpenGuidedFlow] Error:', error);
      throw error;
    }
  }, [findOrCreateDataUploadAtom, setActiveGuidedFlow, setGlobalGuidedMode, updateCard, setCards, cards]);

  const openProcessingModal = async (frame: Frame) => {
    // Set direct review target in store to show panel instead of modal
    // Don't set processingTarget to prevent modal from opening
    setDirectReviewTarget(frame);
    
    // Don't set local state - we only want the panel, not the modal
    // setProcessingTarget(frame);
    // setProcessingColumns([]);
    // setProcessingError('');
    // setProcessingLoading(true);
    try {
      const res = await fetch(`${VALIDATE_API}/file-metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
        body: JSON.stringify({ file_path: frame.object_name })
    });
      if (!res.ok) {
      const txt = await res.text().catch(() => '');
        throw new Error(txt || 'Failed to load dataframe metadata');
      }
      const data = await res.json();
      
      // Load saved config from mongo FIRST (exactly like ColumnClassifierAtom does)
      // ColumnClassifierAtom uses fetchDimensionMapping, but we'll use get_config directly
      // to match how it works when dimensions are empty
      console.log('🔍 [Process Modal] Fetching saved config from mongo FIRST');
      let savedConfig: { identifiers: string[]; measures: string[] } | null = null;
      
      // ColumnClassifierAtom uses savedId which is the object_name (full path), not just filename
      // So we should use object_name to match what was saved
      const fileName = frame.object_name || '';
      console.log('🔍 [Process Modal] Using object_name (full path like ColumnClassifierAtom):', fileName);
      
      try {
        // Use get_config endpoint directly (same endpoint ColumnClassifierAtom uses for saving)
        const envStr = localStorage.getItem('env');
        const env = envStr ? JSON.parse(envStr) : {};
        
        const queryParams = new URLSearchParams({
          client_name: env.CLIENT_NAME || '',
          app_name: env.APP_NAME || '',
          project_name: env.PROJECT_NAME || '',
          bypass_cache: 'true', // Always bypass Redis cache to get fresh data from MongoDB
        });
        if (fileName) {
          queryParams.append('file_name', fileName);
        }
        
        console.log('🔍 [Process Modal] Calling get_config with bypass_cache=true:', queryParams.toString());
        const configRes = await fetch(`${CLASSIFIER_API}/get_config?${queryParams.toString()}`, {
          credentials: 'include'
        });
        
        if (configRes.ok) {
          const configData = await configRes.json();
          console.log('🔍 [Process Modal] get_config response:', configData);
          if (configData?.data) {
            savedConfig = {
              identifiers: Array.isArray(configData.data.identifiers) ? configData.data.identifiers : [],
              measures: Array.isArray(configData.data.measures) ? configData.data.measures : []
            };
            console.log('🔍 [Process Modal] Extracted saved config from mongo:', savedConfig);
          } else {
            console.log('🔍 [Process Modal] No data in get_config response');
          }
        } else {
          console.log('🔍 [Process Modal] get_config returned:', configRes.status);
        }
      } catch (err) {
        console.warn('🔍 [Process Modal] Error fetching saved config:', err);
        // ignore if none (exactly like ColumnClassifierAtom does)
      }
      
      // Only get defaults if no saved config exists (exactly like ColumnClassifierAtom logic)
      let base: { identifiers: string[]; measures: string[]; unclassified: string[] } | null = null;
      const hasSavedConfig = savedConfig && (savedConfig.identifiers.length > 0 || savedConfig.measures.length > 0);
      
      if (!hasSavedConfig) {
        console.log('🔍 [Process Modal] No saved config, fetching default classification...');
        // Check if we have cached classification data
        if (!classifyData[frame.object_name]) {
          base = await runClassification(frame.object_name);
          console.log('🔍 [Process Modal] Default classification result:', base);
        } else {
          base = classifyData[frame.object_name];
          console.log('🔍 [Process Modal] Using cached classification:', base);
        }
      } else {
        console.log('🔍 [Process Modal] Using saved config from mongo, skipping defaults');
      }
      
      // Use saved config if exists, otherwise use defaults (exactly like ColumnClassifierAtom does)
      const baseSet = base || { identifiers: [], measures: [], unclassified: [] };
      console.log('🔍 [Process Modal] Base set (defaults):', baseSet);
      console.log('🔍 [Process Modal] Saved config (mongo):', savedConfig);
      
      // Saved config takes precedence (exactly like ColumnClassifierAtom line 147-152)
      const idSet = new Set<string>(savedConfig?.identifiers || baseSet.identifiers || []);
      const msSet = new Set<string>(savedConfig?.measures || baseSet.measures || []);
      console.log('🔍 [Process Modal] Final identifier set:', Array.from(idSet));
      console.log('🔍 [Process Modal] Final measure set:', Array.from(msSet));
      
      const allColumns = (data.columns || []).map((col: any) => col.name || '').filter(Boolean);
      const classificationMap: Record<string, 'identifiers' | 'measures' | 'unclassified'> = {};
      
      // Create case-insensitive lookup maps (column names might have different case)
      const idMap = new Map<string, string>();
      const msMap = new Map<string, string>();
      idSet.forEach(id => {
        idMap.set(id.toLowerCase(), id);
      });
      msSet.forEach(ms => {
        msMap.set(ms.toLowerCase(), ms);
      });
      
      allColumns.forEach((colName: string) => {
        const colLower = colName.toLowerCase();
        // Try exact match first
        if (idSet.has(colName)) {
          classificationMap[colName] = 'identifiers';
        } else if (msSet.has(colName)) {
          classificationMap[colName] = 'measures';
        } 
        // Try case-insensitive match
        else if (idMap.has(colLower)) {
          classificationMap[colName] = 'identifiers';
        } else if (msMap.has(colLower)) {
          classificationMap[colName] = 'measures';
        } else {
          classificationMap[colName] = 'unclassified';
        }
      });
      
      console.log('🔍 [Process Modal] Final classification map:', classificationMap);
      
      const cols: ProcessingColumnConfig[] = (data.columns || []).map((col: any) => {
        const dtype = typeof col.dtype === 'string' && col.dtype ? col.dtype : 'object';
        return {
          name: col.name || '',
          newName: col.name || '',
          originalDtype: dtype,
          selectedDtype: dtype,
          sampleValues: Array.isArray(col.sample_values)
            ? col.sample_values.map((val: unknown) => (val === null || val === undefined ? '' : String(val)))
            : [],
          missingCount: typeof col.missing_count === 'number' ? col.missing_count : 0,
          missingPercentage: typeof col.missing_percentage === 'number' ? col.missing_percentage : 0,
          missingStrategy: 'none',
          missingCustomValue: '',
          datetimeFormat: undefined,
          formatDetecting: false,
          formatFailed: false,
          dropColumn: false,
          classification: classificationMap[col.name || ''] || 'unclassified',
        };
      });
      // Sort columns by classification on initial load (identifiers, measures, unclassified)
      const sortedCols = cols.sort((a, b) => {
        const rank = { identifiers: 0, measures: 1, unclassified: 2 } as const;
        const aRank = rank[a.classification || 'unclassified'];
        const bRank = rank[b.classification || 'unclassified'];
        return aRank - bRank;
      });
      setProcessingColumns(sortedCols);
    } catch (err: any) {
      setProcessingError(err.message || 'Failed to load dataframe metadata');
    } finally {
      setProcessingLoading(false);
    }
  };

  const updateProcessingColumn = (index: number, changes: Partial<ProcessingColumnConfig>) => {
    setProcessingColumns(prev =>
      prev.map((col, idx) => (idx === index ? { ...col, ...changes } : col))
    );
  };

  const detectProcessingDatetimeFormat = async (index: number) => {
    if (!processingTarget) return null;
    updateProcessingColumn(index, { formatDetecting: true, formatFailed: false });
    try {
      const res = await fetch(`${VALIDATE_API}/detect-datetime-format`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          file_path: processingTarget.object_name,
          column_name: processingColumns[index]?.name,
        }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.can_detect && data.detected_format) {
        updateProcessingColumn(index, {
          datetimeFormat: data.detected_format,
          formatDetecting: false,
          formatFailed: false,
        });
        toast({
          title: 'Format Detected',
          description: `Auto-detected format: ${data.detected_format}`,
        });
        return data.detected_format;
      }
      // Format detection failed - silently enable dropdown (no error message)
      // Don't show toast or set failed status
      updateProcessingColumn(index, { formatDetecting: false, formatFailed: false });
      return null;
    } catch (err) {
      // Silently fail - don't show error toast
      updateProcessingColumn(index, { formatDetecting: false, formatFailed: false });
      return null;
    }
  };

  const handleProcessingDtypeChange = async (index: number, dtype: string) => {
    updateProcessingColumn(index, {
      selectedDtype: dtype,
    });
    if (dtype === 'datetime64') {
      const detected = await detectProcessingDatetimeFormat(index);
      if (!detected) {
        updateProcessingColumn(index, { datetimeFormat: undefined });
      }
    } else {
      updateProcessingColumn(index, {
        datetimeFormat: undefined,
        formatDetecting: false,
        formatFailed: false,
      });
    }
  };

  const handleProcessingMissingStrategyChange = (index: number, strategy: string) => {
    updateProcessingColumn(index, {
      missingStrategy: strategy,
      ...(strategy !== 'custom' ? { missingCustomValue: '' } : {}),
    });
  };

  const handleProcessingMissingCustomChange = (index: number, value: string) => {
    updateProcessingColumn(index, { missingCustomValue: value });
  };

  const handleProcessingDropToggle = (index: number, checked: boolean) => {
    if (checked) {
      updateProcessingColumn(index, {
        dropColumn: true,
        missingStrategy: 'none',
        missingCustomValue: '',
        datetimeFormat: undefined,
        formatDetecting: false,
        formatFailed: false,
      });
    } else {
      updateProcessingColumn(index, { dropColumn: false });
    }
  };

  const handleProcessingSave = async () => {
    if (!processingTarget) return;
    const instructions = processingColumns
      .map(col => {
        const instruction: Record<string, any> = { column: col.name };
        if (col.dropColumn) {
          instruction.drop_column = true;
          return instruction;
          }
        const trimmedNewName = col.newName?.trim();
        if (trimmedNewName && trimmedNewName !== col.name) {
          instruction.new_name = trimmedNewName;
        }
        if (col.selectedDtype && col.selectedDtype !== col.originalDtype) {
          instruction.dtype = col.selectedDtype;
          if (col.selectedDtype === 'datetime64' && col.datetimeFormat) {
            instruction.datetime_format = col.datetimeFormat;
          }
    }
        if (col.missingStrategy && col.missingStrategy !== 'none') {
          instruction.missing_strategy = col.missingStrategy;
          if (col.missingStrategy === 'custom') {
            const normalized = normalizeFillValue(col.missingCustomValue || '', col.selectedDtype);
            if (!normalized && normalized !== 0 && normalized !== false) {
    toast({
                title: 'Missing custom value',
                description: `Provide a custom value for ${col.name}.`,
                variant: 'destructive',
              });
              throw new Error('custom-missing-value');
            }
            instruction.custom_value = normalized;
          }
        }
        return instruction;
      })
      .filter(inst => Object.keys(inst).length > 1);

    // Extract identifiers and measures for classification save
    const identifiers = processingColumns
      .filter(c => !c.dropColumn && c.classification === 'identifiers')
      .map(c => c.name);
    const measures = processingColumns
      .filter(c => !c.dropColumn && c.classification === 'measures')
      .map(c => c.name);
    
    // Check if there are any changes (processing instructions OR classification changes)
    const hasProcessingChanges = instructions.length > 0;
    // Always allow saving classifications if there are columns (user may have changed classifications)
    // The modal only opens if there are columns, so this allows classification-only saves
    const canSaveClassifications = processingColumns.length > 0;
    
    if (!hasProcessingChanges && !canSaveClassifications) {
      toast({
        title: 'No changes detected',
        description: 'Adjust at least one column before saving.',
      });
      return;
    }

    setProcessingSaving(true);
    setProcessingError('');
    try {
      // Only process dataframe if there are processing instructions
      if (hasProcessingChanges) {
        const res = await fetch(`${VALIDATE_API}/process_saved_dataframe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            object_name: processingTarget.object_name,
            instructions,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          const detail = data?.detail || (typeof data === 'string' ? data : '');
          throw new Error(detail || 'Failed to process dataframe');
        }
        toast({
          title: 'Dataframe processed',
          description: `${processingTarget.arrow_name || processingTarget.csv_name} updated successfully.`,
        });
      }
      
      // Save classification config (exactly like ColumnClassifierAtom with empty dimensions)
      // identifiers and measures already extracted above
      
      // COMMENTED OUT - dimensions disabled
      // const dimensions = currentFile.customDimensions;
      
      const stored = localStorage.getItem('current-project');
      const envStr = localStorage.getItem('env');
      const project = stored ? JSON.parse(stored) : {};
      const env = envStr ? JSON.parse(envStr) : {};
      
      // ColumnClassifierAtom uses savedId which is the object_name (full path), not just filename
      // So we should use object_name to match what was saved
      const fileName = processingTarget.object_name || '';
      const payload: Record<string, any> = {
        project_id: project.id || null,
        client_name: env.CLIENT_NAME || '',
        app_name: env.APP_NAME || '',
        project_name: env.PROJECT_NAME || '',
        identifiers,
        measures,
        // dimensions: currentFile.customDimensions  // COMMENTED OUT - dimensions disabled
        dimensions: {}  // Empty dimensions object
      };
      if (fileName) {
        payload.file_name = fileName;
      }
      
      try {
        const saveRes = await fetch(`${CLASSIFIER_API}/save_config`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          credentials: 'include'
        });
        
        if (saveRes.ok) {
          toast({ title: 'Configuration Saved Successfully' });
          localStorage.setItem('column-classifier-config', JSON.stringify(payload));
          if (user?.id) {
            const { updateSessionState, addNavigationItem, logSessionState } = await import('@/lib/session');
            updateSessionState(user.id, {
              identifiers,
              measures,
              // dimensions: currentFile.customDimensions,  // COMMENTED OUT - dimensions disabled
              dimensions: {},
            });
            addNavigationItem(user.id, {
              atom: 'column-classifier',
              identifiers,
              measures,
              // dimensions: currentFile.customDimensions,  // COMMENTED OUT - dimensions disabled
              dimensions: {},
            });
            logSessionState(user.id);
          }
          
          // Mark file as primed after successfully saving configuration
          if (fileName) {
            await markFileAsPrimed(fileName);
            // Dispatch events to trigger UI refresh in both panels
            // Use object_name as the key for status updates
            const objectName = processingTarget.object_name;
            window.dispatchEvent(new CustomEvent('dataframe-saved', { 
              detail: { filePath: objectName, fileName: fileName, objectName: objectName } 
            }));
            window.dispatchEvent(new CustomEvent('priming-status-changed', { 
              detail: { objectName: objectName, filePath: objectName, fileName: fileName, status: { isApproved: true } } 
            }));
            window.dispatchEvent(new CustomEvent('force-refresh-priming-status', { 
              detail: { objectName: objectName, isPrimed: true } 
            }));
          }
        } else {
          toast({ title: 'Unable to Save Configuration', variant: 'destructive' });
          try {
            const txt = await saveRes.text();
            console.warn('assignment save error response', txt);
          } catch (err) {
            console.warn('assignment save error parse fail', err);
          }
          if (user?.id) {
            const { logSessionState } = await import('@/lib/session');
            logSessionState(user.id);
          }
        }
      } catch (err) {
        toast({ title: 'Unable to Save Configuration', variant: 'destructive' });
        console.warn('assignment save request failed', err);
        if (user?.id) {
          const { logSessionState } = await import('@/lib/session');
          logSessionState(user.id);
        }
      }
      
      // Sort columns by classification after saving (identifiers, measures, unclassified)
      setProcessingColumns(prev => {
        const sorted = [...prev].sort((a, b) => {
          const rank = { identifiers: 0, measures: 1, unclassified: 2 } as const;
          const aRank = rank[a.classification || 'unclassified'];
          const bRank = rank[b.classification || 'unclassified'];
          return aRank - bRank;
        });
        return sorted;
      });
      
      closeProcessingModal();
      setReloadToken(prev => prev + 1);
    } catch (err: any) {
      if (err?.message === 'custom-missing-value') {
        return;
      }
      setProcessingError(err.message || 'Failed to process dataframe');
    } finally {
      setProcessingSaving(false);
    }
  };

  const closeSheetChangeModal = () => {
    setSheetChangeTarget(null);
    setSheetChangeOptions([]);
    setSheetChangeSelected('');
    setSheetChangeError('');
    setSheetChangeLoading(false);
  };

  const openSheetChangeModal = async (frame: Frame) => {
    setSheetChangeTarget(frame);
    setSheetChangeOptions([]);
    setSheetChangeSelected('');
    setSheetChangeError('');
    setSheetChangeLoading(true);
    try {
      const query = new URLSearchParams({ object_name: frame.object_name }).toString();
      // Skip workbook_metadata for Arrow files - they don't have workbook metadata
      if (frame.object_name.toLowerCase().endsWith('.arrow')) {
        throw new Error('Arrow files do not have workbook metadata');
      }
      
      const res = await fetch(`${VALIDATE_API}/workbook_metadata?${query}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || 'Workbook metadata not found');
      }
      const data = await res.json();
      const sheets = Array.isArray(data.sheet_names) ? data.sheet_names : [];
      if (!sheets.length) {
        throw new Error('No worksheets available');
      }
      setSheetChangeOptions(sheets);
      setSheetChangeSelected(data.selected_sheet || sheets[0]);
      setSheetChangeLoading(false);
    } catch (err: any) {
      closeSheetChangeModal();
      toast({
        title: 'Unable to load workbook',
        description: err.message || 'Workbook metadata not available',
        variant: 'destructive',
      });
    }
  };

  const handleSheetChangeConfirm = async () => {
    if (!sheetChangeTarget || !sheetChangeSelected) return;
    setSheetChangeLoading(true);
    setSheetChangeError('');
    try {
      const form = new FormData();
      form.append('object_name', sheetChangeTarget.object_name);
      form.append('sheet_name', sheetChangeSelected);
      const res = await fetch(`${VALIDATE_API}/change_sheet`, {
        method: 'POST',
        body: form,
        credentials: 'include',
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || 'Failed to update sheet');
      }
      toast({
        title: 'Default sheet updated',
        description: `${sheetChangeTarget.arrow_name || sheetChangeTarget.csv_name} now uses ${sheetChangeSelected}`,
      });
      closeSheetChangeModal();
      setReloadToken(prev => prev + 1);
    } catch (err: any) {
      setSheetChangeError(err.message || 'Failed to update sheet');
    } finally {
      setSheetChangeLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    
    // Listen for dataframe-saved events to trigger refresh
    const handleDataframeSaved = (event?: Event) => {
      if (!cancelled) {
        console.log('[SavedDataFramesPanel] dataframe-saved event received, refreshing...', event);
        setReloadToken(prev => prev + 1);
      }
    };
    
    // Listen for immediate approval status updates (for instant green status after approval)
    const handleForceRefreshPrimingStatus = (event: any) => {
      if (!cancelled && event.detail) {
        const { objectName, isPrimed } = event.detail;
        console.log('[SavedDataFramesPanel] force-refresh-priming-status event received:', { objectName, isPrimed });
        
        // Immediately update the status for this specific file (works for both regular files and sheets in folders)
        // Simple boolean: isApproved = isPrimed
        setFilePrimingStatus(prev => ({
          ...prev,
          [objectName]: {
            isApproved: isPrimed === true,
          }
        }));
        
        // Don't trigger full refresh immediately - it would overwrite the status before backend updates
        // The dataframe-saved event will trigger a refresh after a delay, giving backend time to update
      }
    };
    
    // Listen for priming-status-changed events with status info
    const handlePrimingStatusChanged = (event: any) => {
      if (!cancelled && event.detail) {
        const { objectName, filePath, fileName, status } = event.detail;
        // Try objectName first, then filePath, then fileName (object_name is the key used in status checks)
        const targetObjectName = objectName || filePath || fileName;
        
        if (targetObjectName) {
          console.log('[SavedDataFramesPanel] priming-status-changed event with status:', { targetObjectName, status, eventDetail: event.detail });
          
          // Immediately update the status for this specific file
          // If status is provided, use it; otherwise default to approved (since event means approval just happened)
          const isApproved = status?.isApproved === true || status?.isPrimed === true || (!status || Object.keys(status).length === 0);
          
          setFilePrimingStatus(prev => ({
            ...prev,
            [targetObjectName]: {
              isApproved,
            }
          }));
        }
      }
    };
    
    window.addEventListener('dataframe-saved', handleDataframeSaved);
    window.addEventListener('force-refresh-priming-status', handleForceRefreshPrimingStatus);
    window.addEventListener('priming-status-changed', handlePrimingStatusChanged);

    const load = async () => {
      setLoading(true);
      try {
        let attempt = 0;
        let lastReloadToken = reloadToken; // Track reload token to force immediate refresh when changed
        while (!cancelled) {
          attempt += 1;
          const { env: storedEnv, target } = readExpectedContext();
          
          // If reloadToken changed, reset attempt counter to force immediate refresh
          if (reloadToken !== lastReloadToken) {
            console.log('[SavedDataFramesPanel] Reload token changed, forcing immediate refresh');
            attempt = 0;
            lastReloadToken = reloadToken;
          }
          
          const waitForNextPoll = async () => {
            const delay = Math.min(2000, 200 + attempt * 200);
            if (!cancelled) {
              await sleep(delay);
            }
          };

          if (!target.project) {
            await waitForNextPoll();
            continue;
          }

          let env: Record<string, any> = { ...storedEnv };
          if (target.client) env.CLIENT_NAME = target.client;
          if (target.app) env.APP_NAME = target.app;
          if (target.project) env.PROJECT_NAME = target.project;

          // Include IDs if names are missing, so backend can resolve names dynamically
          const query = new URLSearchParams({
            client_id: env.CLIENT_ID || '',
            app_id: env.APP_ID || '',
            project_id: env.PROJECT_ID || '',
            client_name: target.client || '',
            app_name: target.app || '',
            project_name: target.project || '',
          }).toString();

          if (user) {
            try {
              const payload: any = {
                user_id: user.id,
                client_id: env.CLIENT_ID || '',
                app_id: env.APP_ID || '',
                project_id: env.PROJECT_ID || '',
                client_name: target.client || env.CLIENT_NAME || '',
                app_name: target.app || env.APP_NAME || '',
                project_name: target.project || env.PROJECT_NAME || '',
              };
              const redisRes = await fetch(`${SESSION_API}/init`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
              });
              if (redisRes.ok) {
                const redisData = await redisRes.json();
                const redisEnv = redisData.state?.envvars;
                if (redisEnv) {
                  const merged = { ...env, ...redisEnv };
                  if (contextsMatch(target, merged)) {
                    env = merged;
                    localStorage.setItem('env', JSON.stringify(env));
                  } else {
                    console.warn(
                      `SavedDataFramesPanel session env mismatch expected ${formatContext(target)} but received ${formatContext(extractDisplayContext(merged))}`
                    );
                  }
                }
              }
            } catch (err) {
              console.warn('Redis env fetch failed', err);
            }
          }

          let resolvedPrefix = '';
          try {
            const prefRes = await fetch(
              `${VALIDATE_API}/get_object_prefix?${query}`,
              { credentials: 'include' }
            );
            if (prefRes.ok) {
              const prefData = await prefRes.json();
              resolvedPrefix = prefData.prefix || '';
              if (prefData.environment) {
                const merged = { ...env, ...prefData.environment };
                if (contextsMatch(target, merged)) {
                  env = merged;
                  localStorage.setItem('env', JSON.stringify(env));
                } else {
                  console.warn(
                    `SavedDataFramesPanel prefix env mismatch expected ${formatContext(target)} but received ${formatContext(extractDisplayContext(merged))}`
                  );
                  await waitForNextPoll();
                  continue;
                }
              }
            } else {
              console.warn('get_object_prefix failed', prefRes.status);
            }
          } catch (err) {
            console.warn('get_object_prefix failed', err);
          }

          let data: any = null;
          try {
            const listRes = await fetch(
              `${VALIDATE_API}/list_saved_dataframes?${query}`,
              { credentials: 'include' }
            );
            if (!listRes.ok) {
              console.warn('list_saved_dataframes failed', listRes.status);
              await waitForNextPoll();
              continue;
            }
            try {
              data = await listRes.json();
            } catch (e) {
              console.warn('Failed to parse list_saved_dataframes response', e);
              await waitForNextPoll();
              continue;
            }
          } catch (err) {
            console.warn('list_saved_dataframes request failed', err);
            await waitForNextPoll();
            continue;
          }

          if (!data) {
            await waitForNextPoll();
            continue;
          }

          if (data && data.environment) {
            const merged = { ...env, ...data.environment };
            if (contextsMatch(target, merged)) {
              env = merged;
              localStorage.setItem('env', JSON.stringify(env));
            } else {
              console.warn(
                `SavedDataFramesPanel list env mismatch expected ${formatContext(target)} but received ${formatContext(extractDisplayContext(merged))}`
              );
              await waitForNextPoll();
              continue;
            }
          }

          const effectivePrefix =
            (data?.prefix || resolvedPrefix || buildPrefixFromTarget(target)) ?? '';
          if (!cancelled) {
            setPrefix(effectivePrefix);
          }

          const filtered = Array.isArray(data?.files)
            ? data.files.filter((f: Frame) => {
                if (!f?.arrow_name) return false;
                if (!effectivePrefix) return true;
                return f.object_name?.startsWith(effectivePrefix);
              })
            : [];

          const excelFoldersData = Array.isArray(data?.excel_folders)
            ? data.excel_folders.filter((folder: ExcelFolder) => {
                if (!effectivePrefix) return true;
                return folder.path?.startsWith(effectivePrefix);
              })
            : [];

          if (!cancelled) {
            console.log('[SavedDataFramesPanel] Setting files and excelFolders:', {
              filesCount: filtered.length,
              excelFoldersCount: excelFoldersData.length,
              excelFolders: excelFoldersData
            });
            setFiles(filtered);
            setExcelFolders(excelFoldersData);
            setOpenDirs({});
            setContextMenu(null);
            setRenameTarget(null);
            
            // Check workbook metadata and approval status for files
            const checkFileMetadata = async () => {
              const metadataChecks: Record<string, boolean> = {};
              const approvalStatusChecks: Record<string, {
                isApproved: boolean;
              }> = {};
              
              for (const f of filtered) {
                // Check workbook metadata
                try {
                  const query = new URLSearchParams({ object_name: f.object_name }).toString();
                  // Skip workbook_metadata for Arrow files - they don't have workbook metadata
                  if (!f.object_name.toLowerCase().endsWith('.arrow')) {
                    const res = await fetch(`${VALIDATE_API}/workbook_metadata?${query}`, {
                      credentials: 'include',
                    });
                    if (res.ok) {
                      const metaData = await res.json();
                      const sheetNames = Array.isArray(metaData.sheet_names) ? metaData.sheet_names : [];
                      metadataChecks[f.object_name] = Boolean(
                        metaData.has_multiple_sheets === true || sheetNames.length > 1
                      );
                    } else {
                      metadataChecks[f.object_name] = false;
                    }
                  } else {
                    metadataChecks[f.object_name] = false; // Arrow files don't have multiple sheets
                  }
                } catch {
                  metadataChecks[f.object_name] = false;
                }
                
                // Check approval status - simple check: is file approved (primed flag exists)?
                try {
                  const projectContext = getActiveProjectContext();
                  if (projectContext) {
                    const queryParams = new URLSearchParams({
                      client_name: projectContext.client_name || '',
                      app_name: projectContext.app_name || '',
                      project_name: projectContext.project_name || '',
                      file_name: f.object_name,
                    }).toString();

                    const primingRes = await fetch(
                      `${VALIDATE_API}/check-priming-status?${queryParams}`,
                      { credentials: 'include' }
                    );

                    let isApproved = false;
                    if (primingRes.ok) {
                      const primingData = await primingRes.json();
                      // Simple check: if primed flag exists, file is approved
                      isApproved = primingData?.is_primed === true;
                    }

                    approvalStatusChecks[f.object_name] = {
                      isApproved,
                    };
                  }
                } catch (err) {
                  console.warn('Failed to check approval status for', f.object_name, err);
                  // Default to not approved (red) when status check fails
                  approvalStatusChecks[f.object_name] = {
                    isApproved: false,
                  };
                }
              }
              
              // CRITICAL: Also check approval status for sheets in Excel folders
              // This ensures sheets in folders get proper status updates and turn green
              for (const folder of excelFoldersData) {
                if (Array.isArray(folder.sheets)) {
                  for (const sheet of folder.sheets) {
                    if (!sheet.object_name) continue;
                    
                    // Check approval status for this sheet - simple check: is sheet approved (primed flag exists)?
                    try {
                      const projectContext = getActiveProjectContext();
                      if (projectContext) {
                        const queryParams = new URLSearchParams({
                          client_name: projectContext.client_name || '',
                          app_name: projectContext.app_name || '',
                          project_name: projectContext.project_name || '',
                          file_name: sheet.object_name, // Use sheet's full object_name with folder path
                        }).toString();

                        const primingRes = await fetch(
                          `${VALIDATE_API}/check-priming-status?${queryParams}`,
                          { credentials: 'include' }
                        );

                        let isApproved = false;
                        if (primingRes.ok) {
                          const primingData = await primingRes.json();
                          // Simple check: if primed flag exists, sheet is approved
                          isApproved = primingData?.is_primed === true;
                        }

                        approvalStatusChecks[sheet.object_name] = {
                          isApproved,
                        };
                      }
                    } catch (err) {
                      console.warn('Failed to check approval status for sheet', sheet.object_name, err);
                      // Default to not approved (red) when status check fails
                      approvalStatusChecks[sheet.object_name] = {
                        isApproved: false,
                      };
                    }
                  }
                }
              }
              
              if (!cancelled) {
                setHasMultipleSheetsByFile(metadataChecks);
                setFilePrimingStatus(approvalStatusChecks);
              }
            };
            void checkFileMetadata();
          }

          console.log(
            `📁 SavedDataFramesPanel looking in MinIO folder "${effectivePrefix}" (expected ${formatContext(target)} resolved ${formatContext(extractDisplayContext(env))})`
          );

          return;
        }
      } catch (err) {
        console.error('Failed to load saved dataframes', err);
        if (!cancelled) {
          setFiles([]);
          setPrefix('');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    void load();

    return () => {
      cancelled = true;
      window.removeEventListener('dataframe-saved', handleDataframeSaved);
      window.removeEventListener('force-refresh-priming-status', handleForceRefreshPrimingStatus);
      window.removeEventListener('priming-status-changed', handlePrimingStatusChanged);
    };
  }, [isOpen, user, reloadToken]);

  // Auto-approve function to skip preview modal and directly approve files
  const autoApproveFile = useCallback(async (frame: Frame) => {
    try {
      const fileName = frame.object_name || '';
      const envStr = localStorage.getItem('env');
      const stored = localStorage.getItem('current-project');
      const env = envStr ? JSON.parse(envStr) : {};
      const project = stored ? JSON.parse(stored) : {};

      // Check if config already exists
      let savedConfig: { identifiers: string[]; measures: string[] } | null = null;
      try {
        const queryParams = new URLSearchParams({
          client_name: env.CLIENT_NAME || '',
          app_name: env.APP_NAME || '',
          project_name: env.PROJECT_NAME || '',
          bypass_cache: 'true',
        });
        if (fileName) {
          queryParams.append('file_name', fileName);
        }
        const configRes = await fetch(`${CLASSIFIER_API}/get_config?${queryParams.toString()}`, {
          credentials: 'include'
        });
        if (configRes.ok) {
          const configData = await configRes.json();
          if (configData?.data) {
            savedConfig = {
              identifiers: Array.isArray(configData.data.identifiers) ? configData.data.identifiers : [],
              measures: Array.isArray(configData.data.measures) ? configData.data.measures : []
            };
          }
        }
      } catch (err) {
        console.warn('Error checking saved config:', err);
      }

      // If no saved config, run auto-classification
      let identifiers: string[] = [];
      let measures: string[] = [];
      
      if (savedConfig && (savedConfig.identifiers.length > 0 || savedConfig.measures.length > 0)) {
        // Use existing saved config
        identifiers = savedConfig.identifiers;
        measures = savedConfig.measures;
      } else {
        // Auto-classify columns
        const form = new FormData();
        form.append('dataframe', fileName);
        form.append('identifiers', '[]');
        form.append('measures', '[]');
        form.append('unclassified', '[]');
        form.append('bypass_cache', 'true');
        
        const classifyRes = await fetch(`${CLASSIFIER_API}/classify_columns`, {
          method: 'POST',
          body: form,
          credentials: 'include'
        });
        
        if (classifyRes.ok) {
          const classifyData = await classifyRes.json();
          const fc = classifyData?.final_classification || {};
          identifiers = Array.isArray(fc.identifiers) ? fc.identifiers : [];
          measures = Array.isArray(fc.measures) ? fc.measures : [];
        } else {
          console.warn('Auto-classification failed, skipping approval');
          return;
        }
      }

      // Save classification config
      const payload: Record<string, any> = {
        project_id: project.id || null,
        client_name: env.CLIENT_NAME || '',
        app_name: env.APP_NAME || '',
        project_name: env.PROJECT_NAME || '',
        identifiers,
        measures,
        dimensions: {}
      };
      if (fileName) {
        payload.file_name = fileName;
      }

      const saveRes = await fetch(`${CLASSIFIER_API}/save_config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include'
      });

      if (saveRes.ok) {
        // Mark file as primed
        if (fileName) {
          await markFileAsPrimed(fileName);
          // Use object_name as the key for status updates
          const objectName = frame.object_name;
          window.dispatchEvent(new CustomEvent('dataframe-saved', { 
            detail: { filePath: objectName, fileName: fileName, objectName: objectName } 
          }));
          window.dispatchEvent(new CustomEvent('priming-status-changed', { 
            detail: { objectName: objectName, filePath: objectName, fileName: fileName, status: { isApproved: true } } 
          }));
          window.dispatchEvent(new CustomEvent('force-refresh-priming-status', { 
            detail: { objectName: objectName, isPrimed: true } 
          }));
        }
        toast({ 
          title: 'File approved automatically', 
          description: `${frame.arrow_name || frame.csv_name || frame.object_name} has been classified and primed.` 
        });
      } else {
        console.warn('Failed to save auto-approval config');
      }
    } catch (err) {
      console.error('Error in auto-approve:', err);
      // Silently fail - don't show error to user, just log it
    }
  }, [markFileAsPrimed, toast]);

  // DISABLED: Auto-approve files after upload
  // Files should only be primed when explicitly approved by the user through the guided workflow
  // This prevents files from being automatically primed without user confirmation
  // useEffect(() => {
  //   // Auto-approve files instead of opening preview modal
  //   if (processingTarget || pendingProcessFiles.length === 0 || !files.length) return;
  //   
  //   const nextFileToProcess = pendingProcessFiles[0];
  //   const frame = files.find(f => f.object_name === nextFileToProcess);
  //   if (frame) {
  //     // Remove this file from the queue and auto-approve
  //     setPendingProcessFiles(prev => prev.slice(1));
  //     void autoApproveFile(frame);
  //   }
  // }, [files, pendingProcessFiles, processingTarget, autoApproveFile]);

  const handleOpen = (obj: string) => {
    window.open(`/dataframe?name=${encodeURIComponent(obj)}`, '_blank');
  };

  const handleDownloadCSV = async (obj: string, filename: string) => {
    try {
      const response = await fetch(
        `${VALIDATE_API}/export_csv?object_name=${encodeURIComponent(obj)}`,
        { credentials: 'include' }
      );
      if (!response.ok) {
        throw new Error('Failed to download CSV');
      }
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      const baseFilename = filename || obj.split('/').pop() || 'dataframe';
      const downloadFilename = baseFilename.replace(/\.arrow$/, '') + '.csv';
      link.download = downloadFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      toast({ title: 'Download started', description: 'CSV download has started.' });
    } catch (error: any) {
      console.error('CSV download failed:', error);
      toast({
        title: 'Download failed',
        description: error.message || 'Failed to download CSV',
        variant: 'destructive',
      });
    }
  };

  const handleDownloadExcel = async (obj: string, filename: string) => {
    try {
      const response = await fetch(
        `${VALIDATE_API}/export_excel?object_name=${encodeURIComponent(obj)}`,
        { credentials: 'include' }
      );
      if (!response.ok) {
        throw new Error('Failed to download Excel');
      }
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      const baseFilename = filename || obj.split('/').pop() || 'dataframe';
      const downloadFilename = baseFilename.replace(/\.arrow$/, '') + '.xlsx';
      link.download = downloadFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
      toast({ title: 'Download started', description: 'Excel download has started.' });
    } catch (error: any) {
      console.error('Excel download failed:', error);
      toast({
        title: 'Download failed',
        description: error.message || 'Failed to download Excel',
        variant: 'destructive',
      });
    }
  };

  const handleCopyFile = async (obj: string, filename: string) => {
    try {
      // Generate copy filename: add "_copy" before the extension
      const baseFilename = filename || obj.split('/').pop() || 'dataframe';
      const nameWithoutExt = baseFilename.replace(/\.arrow$/, '');
      
      // Remove the prefix (client/app/project) from the object path
      // and preserve only the folder structure after the prefix
      const relativePath = obj.startsWith(prefix) ? obj.substring(prefix.length) : obj;
      const lastSlashIndex = relativePath.lastIndexOf('/');
      const folderPath = lastSlashIndex !== -1 ? relativePath.substring(0, lastSlashIndex + 1) : '';
      
      // Find an available copy filename by checking existing files
      const getAvailableCopyName = (baseName: string, folder: string): string => {
        // Get all existing file names in the same folder (with prefix)
        const existingFiles = files
          .filter(f => {
            const fRelative = f.object_name.startsWith(prefix) 
              ? f.object_name.substring(prefix.length) 
              : f.object_name;
            return fRelative.startsWith(folder) && fRelative !== relativePath;
          })
          .map(f => {
            const fRelative = f.object_name.startsWith(prefix) 
              ? f.object_name.substring(prefix.length) 
              : f.object_name;
            return fRelative.substring(folder.length); // Get just the filename
          });
        
        // Try base_copy.arrow first
        let copyName = `${baseName}_copy.arrow`;
        if (!existingFiles.includes(copyName)) {
          return copyName;
        }
        
        // If base_copy.arrow exists, try incrementing numbers
        let counter = 1;
        while (true) {
          copyName = `${baseName}_copy_${counter}.arrow`;
          if (!existingFiles.includes(copyName)) {
            return copyName;
          }
          counter++;
          // Safety limit to prevent infinite loop
          if (counter > 1000) {
            throw new Error('Too many copies exist. Please rename manually.');
          }
        }
      };
      
      const copyFilename = getAvailableCopyName(nameWithoutExt, folderPath);
      const newFilePath = folderPath + copyFilename;
      
      const form = new FormData();
      form.append('object_name', obj);
      form.append('new_filename', newFilePath);
      
      const response = await fetch(`${VALIDATE_API}/copy_dataframe`, {
        method: 'POST',
        body: form,
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || 'Failed to duplicate file');
      }
      
      const data = await response.json();
      const copyNameWithoutExt = copyFilename.replace(/\.arrow$/, '');
      const newFile: Frame = {
        object_name: data.new_name || (prefix + newFilePath),
        csv_name: copyNameWithoutExt,
        arrow_name: copyFilename,
        last_modified: data.last_modified,
        size: data.size
      };
      
      // Add the new file to the list
      setFiles(prev => [...prev, newFile]);
      
      toast({ 
        title: 'File duplicated', 
        description: `Duplicate created: ${copyFilename}` 
      });
    } catch (error: any) {
      console.error('Duplicate file failed:', error);
      toast({
        title: 'Duplicate failed',
        description: error.message || 'Failed to duplicate file',
        variant: 'destructive',
      });
    }
  };

  const promptDeleteAll = () => setConfirmDelete({ type: 'all' });

  const promptDeleteOne = (obj: string) =>
    setConfirmDelete({ type: 'one', target: obj });

  const promptDeleteFolder = (folderPath: string) =>
    setConfirmDelete({ type: 'folder', target: folderPath });

  const performDelete = async () => {
    if (!confirmDelete) return;
    if (confirmDelete.type === 'all') {
      await fetch(`${VALIDATE_API}/delete_all_dataframes`, { method: 'DELETE' });
      setFiles([]);
      setExcelFolders([]);
      // Dispatch event to trigger scenario refresh
      setTimeout(() => {
        console.log('[SavedDataFramesPanel] Dispatching dataframe-deleted event (all files)');
        window.dispatchEvent(new CustomEvent('dataframe-deleted'));
      }, 100);
    } else if (confirmDelete.type === 'folder') {
      const folderPath = confirmDelete.target;
      // Ensure folder path ends with / for proper matching
      const normalizedPath = folderPath.endsWith('/') ? folderPath : folderPath + '/';
      
      // Check if this is an Excel folder
      const excelFolder = excelFolders.find(folder => {
        const folderPathNormalized = folder.path.endsWith('/') ? folder.path : folder.path + '/';
        return folderPathNormalized === normalizedPath || folder.path === folderPath;
      });
      
      // Find all files that belong to this folder (files that start with the folder path)
      const filesToDelete = files.filter(f => 
        f.object_name.startsWith(normalizedPath)
      );
      
      // If it's an Excel folder, also get all sheets to delete
      const sheetsToDelete = excelFolder?.sheets || [];
      
      // Delete all files in the folder
      await Promise.all(
        filesToDelete.map(f =>
          fetch(
            `${VALIDATE_API}/delete_dataframe?object_name=${encodeURIComponent(f.object_name)}`,
            { method: 'DELETE', credentials: 'include' }
          )
        )
      );
      
      // Delete all sheets in the Excel folder
      await Promise.all(
        sheetsToDelete.map(sheet =>
          fetch(
            `${VALIDATE_API}/delete_dataframe?object_name=${encodeURIComponent(sheet.object_name)}`,
            { method: 'DELETE', credentials: 'include' }
          )
        )
      );
      
      // Update files state immediately
      setFiles(prev => prev.filter(f => !f.object_name.startsWith(normalizedPath)));
      
      // Remove Excel folder from excelFolders state if it matches
      setExcelFolders(prev => prev.filter(folder => {
        // Check if folder path matches (with or without trailing slash)
        const folderPathNormalized = folder.path.endsWith('/') ? folder.path : folder.path + '/';
        const targetPathNormalized = normalizedPath;
        // Remove if exact match or if folder is inside the deleted path
        return folderPathNormalized !== targetPathNormalized && 
               folder.path !== folderPath &&
               !folder.path.startsWith(normalizedPath);
      }));
      
      // Close any open directories for this folder
      setOpenDirs(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(key => {
          if (key.startsWith(normalizedPath) || key === folderPath) {
            delete updated[key];
          }
        });
        return updated;
      });
      
      // Trigger immediate reload to sync with backend
      setReloadToken(prev => prev + 1);
      
      // Dispatch event to trigger scenario refresh
      setTimeout(() => {
        console.log('[SavedDataFramesPanel] Dispatching dataframe-deleted event (folder)');
        window.dispatchEvent(new CustomEvent('dataframe-deleted'));
      }, 100);
      
      toast({
        title: 'Folder deleted',
        description: `Folder and all its contents have been deleted.`,
      });
    } else {
      const obj = confirmDelete.target;
      await fetch(
        `${VALIDATE_API}/delete_dataframe?object_name=${encodeURIComponent(obj)}`,
        { method: 'DELETE' }
      );
      setFiles(prev => prev.filter(f => f.object_name !== obj));
      // Also check if this file was part of an Excel folder and update accordingly
      setExcelFolders(prev => prev.map(folder => ({
        ...folder,
        sheets: folder.sheets.filter(sheet => sheet.object_name !== obj)
      })).filter(folder => folder.sheets.length > 0)); // Remove empty folders
      // Trigger immediate reload to sync with backend
      setReloadToken(prev => prev + 1);
      
      // Dispatch event to trigger scenario refresh
      setTimeout(() => {
        console.log('[SavedDataFramesPanel] Dispatching dataframe-deleted event (single file)');
        window.dispatchEvent(new CustomEvent('dataframe-deleted'));
      }, 100);
    }
    setConfirmDelete(null);
  };

  const startRename = (obj: string, currentName: string) => {
    setRenameTarget(obj);
    setRenameValue(currentName);
  };

  const commitRename = async (obj: string) => {
    if (!renameValue.trim()) {
      setRenameTarget(null);
      return;
    }
    let filename = renameValue.trim();
    if (!filename.endsWith('.arrow')) {
      filename += '.arrow';
    }
    
    // Remove the prefix (client/app/project) from the object path
    // and preserve only the folder structure after the prefix
    const relativePath = obj.startsWith(prefix) ? obj.substring(prefix.length) : obj;
    const lastSlashIndex = relativePath.lastIndexOf('/');
    const folderPath = lastSlashIndex !== -1 ? relativePath.substring(0, lastSlashIndex + 1) : '';
    const newFilePath = folderPath + filename;
    
    const form = new FormData();
    form.append('object_name', obj);
    form.append('new_filename', newFilePath);
    const res = await fetch(`${VALIDATE_API}/rename_dataframe`, { method: 'POST', body: form });
    if (res.ok) {
      const data = await res.json();
      const base = filename.replace(/\.arrow$/, '');
      setFiles(prev =>
        prev.map(f =>
          f.object_name === obj
            ? { ...f, object_name: data.new_name, csv_name: base, arrow_name: filename }
            : f
        )
      );
    }
    setRenameTarget(null);
  };

  const handleContextMenu = (e: React.MouseEvent, frame: Frame) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      target: frame.object_name,
      frame: frame
    });
  };

  const handleShareFile = async (obj: string, filename: string) => {
    setShareDialog({ open: true, objectName: obj, filename });
    setShareLink('');
    setShareError(null);
    setShareLoading(true);
    
    try {
      // Get project context
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};
      
      const payload = {
        object_name: obj,
        client_name: env.CLIENT_NAME || '',
        app_name: env.APP_NAME || '',
        project_name: env.PROJECT_NAME || '',
      };
      
      const response = await fetch(`${SHARE_LINKS_API}/dataframe/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        let errorMessage = 'Failed to create share link';
        try {
          const errorData = await response.json();
          errorMessage = errorData?.detail || errorData?.error || errorMessage;
          if (typeof errorData === 'string') {
            errorMessage = errorData;
          }
        } catch {
          const text = await response.text().catch(() => '');
          if (text) {
            try {
              const parsed = JSON.parse(text);
              errorMessage = parsed?.detail || parsed?.error || text;
            } catch {
              errorMessage = text || `HTTP ${response.status}: ${response.statusText}`;
            }
          } else {
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
        }
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      const resolvedLink = data.share_url.startsWith('http') 
        ? data.share_url 
        : `${window.location.origin}${data.share_url.startsWith('/') ? '' : '/'}${data.share_url}`;
      setShareLink(resolvedLink);
      toast({ title: 'Share link generated', description: 'Link copied to clipboard' });
      
      // Auto-copy to clipboard (with fallback)
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(resolvedLink);
        }
      } catch {
        // Fallback if clipboard API fails - user can use the copy button
      }
    } catch (error: any) {
      console.error('Failed to generate share link:', error);
      const errorMessage = error.message || 'Failed to generate share link';
      setShareError(errorMessage);
      toast({
        title: 'Share failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setShareLoading(false);
    }
  };

  const handleContextMenuAction = (action: 'edit' | 'delete' | 'classify' | 'downloadCSV' | 'downloadExcel' | 'copy' | 'share' | 'process' | 'view' | 'changeSheet') => {
    if (!contextMenu) return;
    
    if (action === 'edit') {
      if (contextMenu.frame) {
        startRename(contextMenu.target, contextMenu.frame.arrow_name || contextMenu.frame.csv_name);
      }
    } else if (action === 'delete') {
      if (contextMenu.folderPath) {
        promptDeleteFolder(contextMenu.folderPath);
      } else if (contextMenu.frame) {
        promptDeleteOne(contextMenu.target);
      }
    } else if (action === 'classify') {
      if (contextMenu.frame) {
        void onToggleExpand(contextMenu.target);
      }

    } else if (action === 'view') {
      if (contextMenu.frame) {
        openViewModal(contextMenu.frame);
      }
    // } else if (action === 'downloadCSV') {
    //   if (contextMenu.frame) {
    //     handleDownloadCSV(contextMenu.frame.object_name, contextMenu.frame.arrow_name || contextMenu.frame.csv_name);
    //   }
    // } else if (action === 'downloadExcel') {
    //   if (contextMenu.frame) {
    //     handleDownloadExcel(contextMenu.frame.object_name, contextMenu.frame.arrow_name || contextMenu.frame.csv_name);
    //   }
    } else if (action === 'changeSheet') {
      if (contextMenu.frame) {
        openSheetChangeModal(contextMenu.frame);
      }
    } else if (action === 'downloadCSV') {
      handleDownloadCSV(contextMenu.target, contextMenu.frame.arrow_name || contextMenu.frame.csv_name);
    } else if (action === 'downloadExcel') {
      handleDownloadExcel(contextMenu.target, contextMenu.frame.arrow_name || contextMenu.frame.csv_name);
    } else if (action === 'copy') {
      handleCopyFile(contextMenu.target, contextMenu.frame.arrow_name || contextMenu.frame.csv_name);
    } else if (action === 'share') {
      handleShareFile(contextMenu.target, contextMenu.frame.arrow_name || contextMenu.frame.csv_name);
    }
    
    setContextMenu(null);
  };

  const buildTree = (frames: Frame[], pref: string): TreeNode[] => {
    const root: any = { children: {} };
    frames.forEach(f => {
      if (!f.arrow_name) return; // skip placeholder objects like directories
      const rel = f.object_name.startsWith(pref)
        ? f.object_name.slice(pref.length)
        : f.object_name;
      const parts = rel.split('/').filter(Boolean);
      let node = root;
      let currentPath = pref;
      parts.forEach((part, idx) => {
        currentPath += part + (idx < parts.length - 1 ? '/' : '');
        if (!node.children[part]) {
          node.children[part] = { name: part, path: currentPath, children: {} };
        }
        node = node.children[part];
        if (idx === parts.length - 1) {
          node.frame = f;
        }
      });
    });
    const toArr = (n: any): TreeNode[] =>
      Object.values(n.children || {}).map((c: any) => ({
        name: c.name,
        path: c.path,
        frame: c.frame,
        children: toArr(c)
      }));
    return toArr(root);
  };

  // Build tree from regular files
  const tree = buildTree(files, prefix);
  
  // Add Excel folders to the tree with sheets/ folder as intermediate node
  const excelFolderNodes: TreeNode[] = excelFolders.map(folder => {
    // Create a sheets folder node as a child
    const sheetsFolderPath = `${folder.path}sheets/`;
    const sheetsFolderNode: TreeNode = {
      name: 'sheets',
      path: sheetsFolderPath,
      isExcelFolder: false,
      isSheetsFolder: true,
      sheets: folder.sheets.map(sheet => ({
        object_name: sheet.object_name,
        sheet_name: sheet.sheet_name,
        arrow_name: sheet.arrow_name,
        csv_name: sheet.csv_name,
        last_modified: sheet.last_modified,
        size: sheet.size,
      })),
      children: []
    };
    
    return {
      name: folder.name,
      path: folder.path,
      isExcelFolder: true,
      sheets: [], // Sheets are now in the sheets folder node
      children: [sheetsFolderNode] // Add sheets folder as child
    };
  });
  
  // Combine regular tree with Excel folders
  const combinedTree = [...tree, ...excelFolderNodes];

  const toggleDir = (path: string) => {
    setOpenDirs(prev => ({ ...prev, [path]: !prev[path] }));
  };

  // Helper function to get step name
  const getStepName = (step: string): string => {
    const stepNames: Record<string, string> = {
      'U2': 'Step 1',
      'U3': 'Step 2',
      'U4': 'Step 3',
      'U5': 'Step 4',
      'U6': 'Step 5',
    };
    return stepNames[step] || step;
  };

  // Helper function to generate approval status tooltip content
  const getPrimingStatusTooltip = (status: {
    isApproved?: boolean;
  }): string => {
    return status.isApproved 
      ? '✅ Approved - Ready for use'
      : '❌ Not approved - Click equalizer icon to approve';
  };

  const renderNode = (node: TreeNode, level = 0): React.ReactNode => {
    // Handle Excel folders - show children (sheets folder)
    if (node.isExcelFolder) {
      const isOpen = openDirs[node.path];
      // Count total sheets from children (sheets folder)
      const totalSheets = node.children?.find(c => c.isSheetsFolder)?.sheets?.length || 0;
      // Count unprimed sheets in this folder
      const sheetsInFolder = node.children?.find(c => c.isSheetsFolder)?.sheets || [];
      const unprimedCount = sheetsInFolder.filter((sheet: ExcelSheet) => {
        const sheetStatus = filePrimingStatus[sheet.object_name];
        return !sheetStatus?.isApproved;
      }).length;
      const allPrimed = unprimedCount === 0 && totalSheets > 0;
      
      return (
        <div key={node.path} style={{ marginLeft: level * 12 }} className="mt-1">
          <div className="flex items-center justify-between">
            <button
              onClick={() => toggleDir(node.path)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({
                  x: e.clientX,
                  y: e.clientY,
                  target: node.path,
                  folderPath: node.path
                });
              }}
              className="flex items-center text-xs text-gray-700 hover:text-gray-900 font-medium"
            >
              {isOpen ? (
                <ChevronDown className="w-3.5 h-3.5 mr-1" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 mr-1" />
              )}
              <span>{node.name}</span>
              {totalSheets > 0 && (
                <span className="ml-2 text-xs text-gray-500 font-normal">
                  ({totalSheets} sheet{totalSheets !== 1 ? 's' : ''})
                </span>
              )}
              {/* Show unprimed count badge or green dot */}
              {totalSheets > 0 && (
                <>
                  {unprimedCount > 0 ? (
                    <span className="ml-2 inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700 border border-red-300">
                      {unprimedCount} unprimed
                    </span>
                  ) : allPrimed ? (
                    <span className="ml-2 inline-flex items-center justify-center w-2 h-2 rounded-full bg-green-500" title="All sheets primed" />
                  ) : null}
                </>
              )}
            </button>
            <Trash2
              className="w-3.5 h-3.5 text-gray-400 cursor-pointer ml-2 hover:text-red-500"
              onClick={(e) => {
                e.stopPropagation();
                promptDeleteFolder(node.path);
              }}
            />
          </div>
          {isOpen && node.children && (
            <div className="ml-4 mt-1">
              {node.children.map(child => renderNode(child, level + 1))}
            </div>
          )}
        </div>
      );
    }
    
    // Handle sheets folder with expandable sheets
    if (node.isSheetsFolder && node.sheets) {
      const isOpen = openDirs[node.path];
      return (
        <div key={node.path} style={{ marginLeft: level * 12 }} className="mt-1">
          <div className="flex items-center justify-between">
            <button
              onClick={() => toggleDir(node.path)}
              className="flex items-center text-xs text-gray-700 hover:text-gray-900 font-medium"
            >
              {isOpen ? (
                <ChevronDown className="w-3.5 h-3.5 mr-1" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 mr-1" />
              )}
              <span>{node.name}</span>
              <span className="ml-2 text-xs text-gray-500 font-normal">
                ({node.sheets.length} sheet{node.sheets.length !== 1 ? 's' : ''})
              </span>
            </button>
          </div>
          {isOpen && (
            <div className="ml-4 mt-1 space-y-0.5">
              {node.sheets.map((sheet: ExcelSheet) => {
                const sheetStatus = filePrimingStatus[sheet.object_name];
                const sheetTooltipContent = sheetStatus ? getPrimingStatusTooltip(sheetStatus) : 'Status unknown';
                return (
                  <div
                    key={sheet.object_name}
                    className="flex items-center justify-between border p-1.5 rounded hover:bg-gray-50 overflow-hidden"
                  >
                    <TooltipProvider>
                      <div className="flex-1 min-w-0 mr-2 flex items-center gap-2">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => handleOpen(sheet.object_name)}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                handleContextMenu(e, {
                                  object_name: sheet.object_name,
                                  csv_name: sheet.csv_name,
                                  arrow_name: sheet.arrow_name,
                                  last_modified: sheet.last_modified,
                                  size: sheet.size
                                });
                              }}
                              className={`text-xs hover:underline text-left flex-1 truncate overflow-hidden text-ellipsis whitespace-nowrap flex items-center gap-1 ${
                                sheetStatus?.isApproved
                                  ? 'text-green-600 font-medium'
                                  : 'text-red-600 font-medium'
                              }`}
                            >
                              <FileText className="w-3 h-3 text-gray-400 flex-shrink-0" />
                              <span>{sheet.sheet_name}</span>
                              <span className="text-gray-400 font-normal">(.arrow)</span>
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs whitespace-pre-line text-xs">
                            <div className="font-semibold mb-1">{sheet.sheet_name}</div>
                            <div className="border-t pt-1 mt-1">{sheetTooltipContent}</div>
                          </TooltipContent>
                        </Tooltip>
                        {sheetStatus && (
                          <div
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              sheetStatus.isApproved
                                ? 'bg-green-500'
                                : 'bg-red-500'
                            }`}
                          />
                        )}
                      </div>
                    </TooltipProvider>
                    <div className="flex items-center space-x-2 ml-2 flex-shrink-0">
                      <Pencil
                        className="w-3.5 h-3.5 text-gray-400 cursor-pointer"
                        onClick={() => startRename(sheet.object_name, sheet.arrow_name || sheet.csv_name)}
                        title="Rename"
                      />
                      <SlidersHorizontal
                        className={`w-3.5 h-3.5 cursor-pointer ${
                          !sheetStatus?.isApproved 
                            ? 'equalizer-blink-unprimed' 
                            : 'text-gray-400'
                        }`}
                        onClick={() => {
                          console.log('🔍 [SavedDataFramesPanel] Clicked on Excel sheet:', {
                            object_name: sheet.object_name,
                            csv_name: sheet.csv_name,
                            arrow_name: sheet.arrow_name,
                            folderPath: node.path, // Use node.path (Excel folder path)
                            fullSheet: sheet
                          });
                          setModeSelectionTarget({
                            object_name: sheet.object_name,
                            csv_name: sheet.csv_name,
                            arrow_name: sheet.arrow_name,
                            last_modified: sheet.last_modified,
                            size: sheet.size
                          });
                        }}
                        title={!sheetStatus?.isApproved ? "Click to approve this file" : "Process columns"}
                      />
                      {/* Wrench icon removed - not in use */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="p-0 border-0 bg-transparent cursor-pointer"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Download
                              className="w-3.5 h-3.5 text-gray-400 cursor-pointer hover:text-blue-600"
                              title="Download dataframe"
                            />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            onClick={() => handleDownloadCSV(sheet.object_name, sheet.arrow_name || sheet.csv_name)}
                            className="cursor-pointer"
                          >
                            <span>Download as CSV</span>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDownloadExcel(sheet.object_name, sheet.arrow_name || sheet.csv_name)}
                            className="cursor-pointer"
                          >
                            <span>Download as Excel</span>
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Trash2
                        className="w-3.5 h-3.5 text-gray-400 cursor-pointer hover:text-red-500"
                        onClick={() => promptDeleteOne(sheet.object_name)}
                        title="Delete"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }
    
    if (node.frame) {
      const f = node.frame;
      const status = filePrimingStatus[f.object_name];
      const tooltipContent = status ? getPrimingStatusTooltip(status) : 'Status unknown';
      
      return (
        <>
        <div
          key={node.path}
          style={{ marginLeft: level * 12 }}
          className="flex items-center justify-between border p-1.5 rounded hover:bg-gray-50 mt-0.5 overflow-hidden"
        >
          {renameTarget === f.object_name ? (
            <Input
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              onBlur={() => commitRename(f.object_name)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitRename(f.object_name);
                }
              }}
              className="h-5 text-xs flex-1 mr-2 min-w-0"
            />
          ) : (
            <TooltipProvider>
              <div className="flex-1 min-w-0 mr-2 flex items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => handleOpen(f.object_name)}
                      onContextMenu={(e) => handleContextMenu(e, f)}
                      className={`text-xs hover:underline text-left flex-1 truncate overflow-hidden text-ellipsis whitespace-nowrap ${
                        status?.isApproved
                          ? 'text-green-600 font-medium'
                          : 'text-red-600 font-medium'
                      }`}
                    >
                      {f.arrow_name ? f.arrow_name.split('/').pop() : f.csv_name.split('/').pop()}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs whitespace-pre-line text-xs">
                    <div className="font-semibold mb-1">
                      {f.arrow_name ? f.arrow_name.split('/').pop() : f.csv_name.split('/').pop()}
                    </div>
                    <div className="border-t pt-1 mt-1">
                      {tooltipContent}
                    </div>
                  </TooltipContent>
                </Tooltip>
                {/* Status indicator dot */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                        status?.isApproved
                          ? 'bg-green-500'
                          : 'bg-red-500'
                      }`}
                    />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs whitespace-pre-line text-xs">
                    {tooltipContent}
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          )}
          <div className="flex items-center space-x-2 ml-2 flex-shrink-0">
            {/* COMMENTED OUT - 'for classification' button/icon */}
            {/* <button
              type="button"
              title="For Classificaition"
              onClick={() => onToggleExpand(f.object_name)}
              className="p-0"
            >
              {expandedRows[f.object_name] ? (
                <ChevronUp className="w-4 h-4 text-gray-400 cursor-pointer" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-400 cursor-pointer" />
              )}
            </button> */}
            <Pencil
              className="w-3.5 h-3.5 text-gray-400 cursor-pointer"
              onClick={() => startRename(f.object_name, f.arrow_name || f.csv_name)}
            />
            <SlidersHorizontal
              className={`w-3.5 h-3.5 cursor-pointer ${
                !status?.isApproved 
                  ? 'equalizer-blink-unprimed' 
                  : 'text-gray-400'
              }`}
              onClick={() => setModeSelectionTarget(f)}
              title={!status?.isApproved ? "Click to approve this file" : "Process columns"}
            />
            {/* Wrench icon removed - not in use */}
            {hasMultipleSheetsByFile[f.object_name] && (
              <Layers
                className="w-3.5 h-3.5 text-gray-400 cursor-pointer"
                onClick={() => openSheetChangeModal(f)}
                title="Change default sheet"
              />
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="p-0 border-0 bg-transparent cursor-pointer"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download
                    className="w-3.5 h-3.5 text-gray-400 cursor-pointer hover:text-blue-600"
                    title="Download dataframe"
                  />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem
                  onClick={() => handleDownloadCSV(f.object_name, f.arrow_name || f.csv_name)}
                  className="cursor-pointer"
                >
                  <span>Download as CSV</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleDownloadExcel(f.object_name, f.arrow_name || f.csv_name)}
                  className="cursor-pointer"
                >
                  <span>Download as Excel</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Trash2
              className="w-3.5 h-3.5 text-gray-400 cursor-pointer"
              onClick={() => promptDeleteOne(f.object_name)}
            />
          </div>
        </div>
        {expandedRows[f.object_name] && (
          <div
            style={{ marginLeft: level * 12 }}
            className="border rounded p-2 bg-gray-50"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-700">(1/3) Column Classifier</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={!!classifyLoading[f.object_name]}
                  onClick={() => runClassification(f.object_name)}
                >
                  {classifyLoading[f.object_name] ? 'Refresh' : 'Reclassify'}
                </Button>
              </div>
            </div>
            {classifyError[f.object_name] && (
              <div className="text-red-500 text-xs mt-2">{classifyError[f.object_name]}</div>
            )}
            {saveErrorByObject[f.object_name] && (
              <div className="text-red-500 text-xs mt-2">{saveErrorByObject[f.object_name]}</div>
            )}

            {/* Columns table */}
            {columnsByObject[f.object_name]?.length ? (
              <div className="mt-2">
                <div className="grid grid-cols-2 text-[11px] font-semibold text-gray-600 px-1 py-1">
                  <div>Column</div>
                  <div>Classification</div>
                </div>
                <div className="max-h-48 overflow-auto border rounded bg-white">
                  {columnsByObject[f.object_name]
                    .slice()
                    .sort((a, b) => {
                      const rank = { identifiers: 0, measures: 1, unclassified: 2 } as const;
                      return rank[a.category] - rank[b.category];
                    })
                    .map(col => (
                    <div key={col.name} className="grid grid-cols-2 items-center px-2 py-1 text-xs border-b last:border-b-0">
                      <div
                        className={`truncate pr-2 ${col.category === 'identifiers' ? 'text-blue-600' : col.category === 'measures' ? 'text-green-600' : 'text-yellow-600'}`}
                        title={col.name}
                      >
                        {col.name}
                      </div>
                      <div>
                        <Select
                          value={col.category}
                          onValueChange={(val: any) => {
                            setColumnsByObject(prev => ({
                              ...prev,
                              [f.object_name]: (prev[f.object_name] || []).map(c => c.name === col.name ? { ...c, category: val } : c)
                            }));
                          }}
                        >
                          <SelectTrigger className="h-7 py-0 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="identifiers">Identifiers</SelectItem>
                            <SelectItem value="measures">Measures</SelectItem>
                            <SelectItem value="unclassified">Unclassified</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Business Dimensions (compact) */}
            <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs font-medium text-gray-700">(2/3) Business Dimensions</div>
                <button
                  type="button"
                    className="text-[11px] text-gray-600 hover:underline"
                  onClick={() => setBusinessOpenByObject(prev => ({ ...prev, [f.object_name]: !prev[f.object_name] }))}
                >
                  {businessOpenByObject[f.object_name] ? 'Hide' : 'Show'}
                </button>
              </div>
              {/* Creation UI (compact, mirrors settings tab behavior) */}
              {businessOpenByObject[f.object_name] && (
              <div className="border rounded bg-white p-1">
                <div className="mb-1">
                  <Label className="text-[10px]">Select dimensions</Label>
                </div>
                <div className="space-y-1">
                  <div className="text-xs leading-tight">
                    <label className="flex items-center gap-1 cursor-not-allowed opacity-70 select-none">
                      <input type="checkbox" checked readOnly className="h-3 w-3 accent-black" />
                      <span className="text-xs">Unattributed</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                    {(dimensionOptionsByObject[f.object_name] || ['unattributed','market','product'])
                      .filter(d => d !== 'unattributed')
                      .map(dim => {
                        const checked = (dimensionSelectedByObject[f.object_name] || []).includes(dim);
                        return (
                          <label
                            key={dim}
                            className="flex items-center gap-1 text-xs leading-tight cursor-pointer select-none"
                            title={dim}
                          >
                            <input
                              type="checkbox"
                              className="h-3 w-3 accent-black"
                              checked={checked}
                              onChange={() => {
                                setDimensionSelectedByObject(prev => {
                                  const cur = prev[f.object_name] || [];
                                  const next = cur.includes(dim) ? cur.filter(d => d !== dim) : [...cur, dim];
                                  return { ...prev, [f.object_name]: next.slice(0, 10) };
                                });
                              }}
                            />
                            <span className="truncate max-w-[8rem] text-ellipsis whitespace-nowrap text-xs">{dim}</span>
                          </label>
                        );
                      })}
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {((dimensionOptionsByObject[f.object_name] || []).length < 11) && !showAddDimInputByObject[f.object_name] && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAddDimInputByObject(prev => ({ ...prev, [f.object_name]: true }))}
                        className="flex items-center h-6 px-1 text-[10px]"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add Dimension
                      </Button>
                    )}
                    {showAddDimInputByObject[f.object_name] && (
                      <div className="flex items-center gap-2 p-1">
                        <Input
                          value={newDimInputByObject[f.object_name] || ''}
                          onChange={e => setNewDimInputByObject(prev => ({ ...prev, [f.object_name]: e.target.value }))}
                          placeholder=""
                          className="h-6 text-[10px]"
                        />
                        <Button
                          size="sm"
                          className="h-6 px-2 text-[10px]"
                          onClick={() => {
                            const raw = (newDimInputByObject[f.object_name] || '').trim().toLowerCase();
                            if (!raw) { setShowAddDimInputByObject(prev => ({ ...prev, [f.object_name]: false })); return; }
                            setDimensionOptionsByObject(prev => {
                              const cur = prev[f.object_name] || ['unattributed','market','product'];
                              if (cur.includes(raw)) return prev;
                              return { ...prev, [f.object_name]: [...cur, raw] };
                            });
                            setDimensionSelectedByObject(prev => {
                              const cur = prev[f.object_name] || [];
                              if (cur.includes(raw)) return prev;
                              return { ...prev, [f.object_name]: [...cur, raw].slice(0, 10) };
                            });
                            setNewDimInputByObject(prev => ({ ...prev, [f.object_name]: '' }));
                            setShowAddDimInputByObject(prev => ({ ...prev, [f.object_name]: false }));
                          }}
                        >
                          Add
                        </Button>
                      </div>
                    )}
                  </div>
                  <div>
                    <Button
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      disabled={(dimensionSelectedByObject[f.object_name] || []).length === 0}
                      onClick={() => {
                        const dims = ['unattributed', ...((dimensionSelectedByObject[f.object_name] || []).slice(0,10))];
                        const cols = (columnsByObject[f.object_name] || []).filter(c => c.category==='identifiers');
                        // Initialize mapping: all to unattributed by default
                        const nextMap: Record<string, string[]> = dims.reduce((acc, d) => ({ ...acc, [d]: [] }), {} as Record<string,string[]>);
                        cols.forEach(c => { nextMap['unattributed'].push(c.name); });
                        setDimensionsByObject(prev => ({ ...prev, [f.object_name]: nextMap }));
                        setColumnDimensionByObject(prev => ({
                          ...prev,
                          [f.object_name]: Object.fromEntries(cols.map(c => [c.name, 'unattributed']))
                        }));
                        setShowDimensionTableByObject(prev => ({ ...prev, [f.object_name]: true }));
                        // Minimize after saving dimensions
                        setBusinessOpenByObject(prev => ({ ...prev, [f.object_name]: false }));
                      }}
                    >
                      Save Dimensions
                    </Button>
                  </div>
                </div>
              </div>
              )}

              {/* Dimension mapping table (tabular) */}
              {showDimensionTableByObject[f.object_name] && (
                <div className="mt-3">
                  <div className="text-xs font-medium text-gray-700 mb-1">(3/3) Assign Columns to Dimensions</div>
                  <div className="grid grid-cols-2 text-[11px] font-semibold text-gray-600 px-1 py-1">
                    <div>Column</div>
                    <div>Dimension</div>
                  </div>
                  <div className="max-h-48 overflow-auto border rounded bg-white">
                    {(columnsByObject[f.object_name] || []).filter(c => c.category==='identifiers').map(col => (
                      <div key={`map-${col.name}`} className="grid grid-cols-2 items-center px-2 py-1 text-xs border-b last:border-b-0">
                        <div
                          className={`truncate pr-2 ${getDimensionTextClass((columnDimensionByObject[f.object_name] || {})[col.name] || 'unattributed', (dimensionSelectedByObject[f.object_name] || []))}`}
                          title={col.name}
                        >
                          {col.name}
                        </div>
                        <div>
                          <Select
                            value={(columnDimensionByObject[f.object_name] || {})[col.name] || 'unattributed'}
                            onValueChange={(val: string) => {
                              setColumnDimensionByObject(prev => ({
                                ...prev,
                                [f.object_name]: { ...(prev[f.object_name] || {}), [col.name]: val }
                              }));
                              setDimensionsByObject(prev => {
                                const cur = { ...(prev[f.object_name] || {}) } as Record<string,string[]>;
                                const allDims = ['unattributed', ...((dimensionSelectedByObject[f.object_name] || []))];
                                // Remove from every dim first
                                allDims.forEach(d => { if (cur[d]) cur[d] = cur[d].filter(cn => cn !== col.name); });
                                if (!cur[val]) cur[val] = [];
                                cur[val].push(col.name);
                                return { ...prev, [f.object_name]: cur };
                              });
                            }}
                          >
                            <SelectTrigger className="h-7 py-0 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(['unattributed', ...((dimensionSelectedByObject[f.object_name] || []))].map(d => (
                                <SelectItem key={`opt-${d}`} value={d}>{d}</SelectItem>
                              )))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <Button
                      variant="default"
                      className="h-7 w-full"
                      disabled={!!savingByObject[f.object_name] || !columnsByObject[f.object_name]?.length}
                      onClick={async () => {
                        setSaveErrorByObject(prev => ({ ...prev, [f.object_name]: '' }));
                        setSavingByObject(prev => ({ ...prev, [f.object_name]: true }));
                        try {
                          const cols = columnsByObject[f.object_name] || [];
                          const identifiers = cols.filter(c => c.category==='identifiers').map(c => c.name);
                          const measures = cols.filter(c => c.category==='measures').map(c => c.name);
                          const stored = localStorage.getItem('current-project');
                          const envStr = localStorage.getItem('env');
                          const project = stored ? JSON.parse(stored) : {};
                          const env = envStr ? JSON.parse(envStr) : {};
                          const payload: any = {
                            project_id: project.id || null,
                            client_name: env.CLIENT_NAME || '',
                            app_name: env.APP_NAME || '',
                            project_name: env.PROJECT_NAME || '',
                            identifiers,
                            measures,
                            // COMMENTED OUT - dimensions disabled
                            // dimensions: dimensionsByObject[f.object_name] || {},
                            dimensions: {},  // Empty dimensions object (same as ColumnClassifierAtom)
                            file_name: f.object_name
                          };
                          const res = await fetch(`${CLASSIFIER_API}/save_config`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload),
                            credentials: 'include'
                          });
                          if (!res.ok) {
                            const txt = await res.text().catch(()=> '');
                            throw new Error(txt || 'Save failed');
                          }
                          toast({ title: 'Configuration Saved Successfully' });
                          // Save to localStorage exactly like ColumnClassifierAtom (line 435)
                          localStorage.setItem('column-classifier-config', JSON.stringify(payload));
                          // Update session state exactly like ColumnClassifierAtom (lines 436-449)
                          if (user?.id) {
                            const { updateSessionState, addNavigationItem, logSessionState } = await import('@/lib/session');
                            updateSessionState(user.id, {
                              identifiers,
                              measures,
                              // dimensions: currentFile.customDimensions,  // COMMENTED OUT - dimensions disabled
                              dimensions: {},
                            });
                            addNavigationItem(user.id, {
                              atom: 'column-classifier',
                              identifiers,
                              measures,
                              // dimensions: currentFile.customDimensions,  // COMMENTED OUT - dimensions disabled
                              dimensions: {},
                            });
                            logSessionState(user.id);
                          }
                        } catch (err: any) {
                          setSaveErrorByObject(prev => ({ ...prev, [f.object_name]: err.message || 'Save failed' }));
                          if (user?.id) {
                            const { logSessionState } = await import('@/lib/session');
                            logSessionState(user.id);
                          }
                        } finally {
                          setSavingByObject(prev => ({ ...prev, [f.object_name]: false }));
                        }
                      }}
                    >
                      {savingByObject[f.object_name] ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        </>
      );
    }
    const isOpen = openDirs[node.path];
    return (
      <div key={node.path} style={{ marginLeft: level * 12 }} className="mt-1">
        <div className="flex items-center justify-between">
          <button
            onClick={() => toggleDir(node.path)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({
                x: e.clientX,
                y: e.clientY,
                target: node.path,
                folderPath: node.path
              });
            }}
            className="flex items-center text-xs text-gray-700"
          >
            {isOpen ? <ChevronDown className="w-3.5 h-3.5 mr-1" /> : <ChevronRight className="w-3.5 h-3.5 mr-1" />}
            {node.name}
          </button>
          <Trash2
            className="w-3.5 h-3.5 text-gray-400 cursor-pointer ml-2"
            onClick={(e) => {
              e.stopPropagation();
              promptDeleteFolder(node.path);
            }}
          />
        </div>
        {isOpen && node.children?.map(child => renderNode(child, level + 1))}
      </div>
    );
  };

  const borderClass = collapseDirection === 'left' ? 'border-r border-gray-200' : 'border-l border-gray-200';

  if (!isOpen) {
    return (
        <div className={`w-12 bg-white flex flex-col h-full ${borderClass}`}>
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
            <Button variant="ghost" size="sm" onClick={onToggle} className="p-1 h-8 w-8">
              <Database className="w-4 h-4" />
            </Button>
          </div>
        </div>
    );
  }

  const CollapseIcon = collapseDirection === 'left' ? ChevronLeft : ChevronRight;
  const fileInput = (
    <input
      type="file"
      ref={fileInputRef}
      className="hidden"
      accept=".csv,.xlsx,.xls"
      multiple
      onChange={handleFileInput}
    />
  );

  return (
    <div className={`w-80 bg-white flex flex-col h-full ${borderClass}`}>
      <style>{rainbowBounceStyle}</style>
      {fileInput}
      <div className="p-2 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900 flex items-center space-x-2">
          <Database className="w-3.5 h-3.5" />
          <span>Saved DataFrames</span>
        </h3>
        <div className="flex items-center space-x-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={triggerFilePicker}
            className="p-1 h-8 w-8"
            title="Upload dataframe"
          >
            <Upload className={`w-4 h-4 ${combinedTree.length === 0 && excelFolders.length === 0 && !loading ? 'rainbow-bounce-icon' : ''}`} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={promptDeleteAll}
            className="p-1 h-8 w-8"
            title="Delete all"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onToggle} className="p-1 h-8 w-8">
            <CollapseIcon className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-3 text-sm">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-700">
            <div className="w-20 h-20 rounded-full bg-white/60 backdrop-blur-sm flex items-center justify-center mx-auto mb-4 shadow-inner">
              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Loading your dataframes</h3>
            <p className="text-sm text-gray-500">Fetching the latest saved files…</p>
          </div>
        ) : (
          <>
            {combinedTree.length === 0 && excelFolders.length === 0 && <p className="text-sm text-gray-600">No saved dataframes</p>}
            {combinedTree.map(node => renderNode(node))}
          </>
        )}
      </div>
      <ConfirmationDialog
        open={!!confirmDelete}
        onOpenChange={open => {
          if (!open) setConfirmDelete(null);
        }}
        onConfirm={performDelete}
        onCancel={() => setConfirmDelete(null)}
        title={
          confirmDelete?.type === 'all' 
            ? 'Delete All DataFrames' 
            : confirmDelete?.type === 'folder'
            ? 'Delete Folder'
            : 'Delete DataFrame'
        }
        description={
          confirmDelete?.type === 'all'
            ? 'Delete all saved dataframes? This may impact existing projects.'
            : confirmDelete?.type === 'folder'
            ? 'Are you sure you want to delete this folder and all files in it? This may impact existing projects.'
            : 'Are you sure you want to delete this dataframe? This may impact existing projects.'
        }
        icon={<Trash2 className="w-5 h-5 text-white" />}
        confirmLabel="Yes, Delete"
        iconBgClass="bg-red-500"
        confirmButtonClass="bg-red-500 hover:bg-red-600"
      />
      
      {/* Context Menu - Using Portal */}
      {contextMenu && createPortal(
        <div
          className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 9999,
            minWidth: '120px'
          }}
          onMouseLeave={() => setContextMenu(null)}
        >
          {contextMenu.folderPath ? (
            // Folder context menu - only show delete
            <button
              onClick={() => handleContextMenuAction('delete')}
              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
            >
              <Trash2 className="w-4 h-4" />
              <span>Delete Folder</span>
            </button>
          ) : (
            // File context menu - show all options
            <>
              {/* COMMENTED OUT - 'for classification' context menu item */}
              {/* <button
                onClick={() => handleContextMenuAction('classify')}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
              >
                <ChevronDown className="w-4 h-4" />
                <span>Classification</span>
              </button> */}
              <button
                onClick={() => handleContextMenuAction('edit')}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
              >
                <Pencil className="w-4 h-4" />
                <span>Rename</span>
              </button>
              <button
                onClick={() => handleContextMenuAction('view')}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span>View properties</span>
              </button>
              {/* Process columns button removed - wrench icon not in use */}
              {contextMenu.frame && hasMultipleSheetsByFile[contextMenu.frame.object_name] && (
                <button
                  onClick={() => handleContextMenuAction('changeSheet')}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
                >
                  <Layers className="w-4 h-4" />
                  <span>Change default sheet</span>
                </button>
              )}
              {/* <div className="border-t border-gray-200 my-1"></div>
              <button
                onClick={() => handleContextMenuAction('downloadCSV')}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
              >
                <Download className="w-4 h-4" />
                <span>Download as CSV</span>
              </button>
              <button
                onClick={() => handleContextMenuAction('downloadExcel')}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
              >
                <Download className="w-4 h-4" />
                <span>Download as Excel</span>
              </button> */}
              <div className="border-t border-gray-200 my-1"></div>
              <button
            onClick={() => handleContextMenuAction('copy')}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
          >
            <Copy className="w-4 h-4" />
            <span>Duplicate</span>
          </button>
          <button
            onClick={() => handleContextMenuAction('downloadCSV')}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
          >
            <Download className="w-4 h-4" />
            <span>Download as CSV</span>
          </button>
          <button
            onClick={() => handleContextMenuAction('downloadExcel')}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
          >
            <Download className="w-4 h-4" />
            <span>Download as Excel</span>
          </button>
          <button
            onClick={() => handleContextMenuAction('share')}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 flex items-center space-x-2"
          >
            <Share2 className="w-4 h-4" />
            <span>Share</span>
          </button>
          <button
                onClick={() => handleContextMenuAction('delete')}
                className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center space-x-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete</span>
              </button>
            </>
          )}
        </div>,
        document.body
      )}
      {isUploadModalOpen && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-96 max-w-[90vw] p-4">
            <h4 className="text-lg font-semibold text-gray-900 mb-2">Upload DataFrame</h4>
            <p className="text-sm text-gray-600 truncate">{pendingFile?.name || 'No file selected'}</p>
            {uploadError && <p className="text-xs text-red-500 mt-2">{uploadError}</p>}
            {hasMultipleSheets ? (
              <div className="mt-4">
                <Label className="text-xs text-gray-600 mb-2 block">
                  Select worksheets to upload (all selected by default)
                </Label>
                <div className="max-h-64 overflow-y-auto border rounded p-2 space-y-2">
                  {sheetOptions.map(sheet => (
                    <div key={sheet} className="flex items-center space-x-2">
                      <Checkbox
                        id={`sheet-${sheet}`}
                        checked={selectedSheets.includes(sheet)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedSheets(prev => [...prev, sheet]);
                          } else {
                            setSelectedSheets(prev => prev.filter(s => s !== sheet));
                          }
                        }}
                      />
                      <label
                        htmlFor={`sheet-${sheet}`}
                        className="text-sm text-gray-700 cursor-pointer flex-1"
                      >
                        {sheet}
                      </label>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-2">
                  {selectedSheets.length} of {sheetOptions.length} sheet{sheetOptions.length !== 1 ? 's' : ''} selected
                </p>
              </div>
            ) : (
              <div className="mt-4 text-sm text-gray-600">
                {uploadingFile ? 'Processing file…' : 'Preparing upload…'}
              </div>
            )}
            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={resetUploadState}
                disabled={uploadingFile}
              >
                Cancel
              </Button>
              {hasMultipleSheets && (
                <Button
                  size="sm"
                  onClick={handleSheetConfirm}
                  disabled={uploadingFile || selectedSheets.length === 0}
                >
                  Upload {selectedSheets.length} Sheet{selectedSheets.length !== 1 ? 's' : ''}
                </Button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
      {sheetChangeTarget && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-96 max-w-[90vw] p-4">
            <h4 className="text-lg font-semibold text-gray-900 mb-2">Change Default Sheet</h4>
            <p className="text-sm text-gray-600 truncate">
              {sheetChangeTarget.arrow_name || sheetChangeTarget.csv_name || sheetChangeTarget.object_name}
            </p>
            {sheetChangeError && <p className="text-xs text-red-500 mt-2">{sheetChangeError}</p>}
            {sheetChangeOptions.length ? (
              <div className="mt-4">
                <Label className="text-xs text-gray-600 mb-1 block">Select worksheet</Label>
                <Select value={sheetChangeSelected} onValueChange={setSheetChangeSelected}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select sheet" />
                  </SelectTrigger>
                  <SelectContent>
                    {sheetChangeOptions.map(sheet => (
                      <SelectItem key={`sheet-${sheet}`} value={sheet}>
                        {sheet}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="mt-4 text-sm text-gray-600">
                {sheetChangeLoading ? 'Loading worksheets…' : 'No worksheets available'}
              </div>
            )}
            <div className="flex justify-end gap-2 mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={closeSheetChangeModal}
                disabled={sheetChangeLoading}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSheetChangeConfirm}
                disabled={sheetChangeLoading || !sheetChangeSelected || !sheetChangeOptions.length}
              >
                {sheetChangeLoading ? 'Updating…' : 'Update Sheet'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {/* Only show modal if processingTarget is set AND directReviewTarget is NOT set (to prevent both from showing) */}
      {processingTarget && !directReviewTarget && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-[1000px] max-w-[98vw] p-4 max-h-[90vh] flex flex-col">
            <h4 className="text-lg font-semibold text-gray-900 mb-2">Dataframe Profiling (Verify details)</h4>
            <p className="text-sm text-gray-600">
              {processingTarget.arrow_name || processingTarget.csv_name || processingTarget.object_name}
            </p>
            {processingError && <p className="text-xs text-red-500 mt-2">{processingError}</p>}
            <div className="mt-4 flex-1 min-h-0 flex flex-col">
              {processingLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                </div>
              ) : processingColumns.length === 0 ? (
                <p className="text-sm text-gray-600">No columns available.</p>
              ) : (
                <div className="border rounded-lg h-full flex flex-col overflow-hidden">
                  <div className="flex-1 min-h-0 overflow-auto">
                    <table className="w-full min-w-full">
                      <thead className="bg-gradient-to-r from-blue-50 to-blue-100">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b border-gray-200">
                              Column Name
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b border-gray-200">
                              Rename
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b border-gray-200">
                              Current Type
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b border-gray-200">
                              Change Type
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b border-gray-200">
                              Missing Values
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b border-gray-200">
                              Strategy
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b border-gray-200">
                              Classification
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b border-gray-200">
                              Drop Column
                            </th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {processingColumns
                          .map((col) => {
                            // Find original index by column name to use in updateProcessingColumn
                            const originalIdx = processingColumns.findIndex(c => c.name === col.name);
                            const dtypeOptions = getProcessingDtypeOptions(col.originalDtype);
                            const missingOptions = getProcessingMissingOptions(col.selectedDtype);
                            const hasMissingValues = col.missingCount > 0;
                            const inputsDisabled = col.dropColumn;
                            return (
                              <tr key={`process-${col.name}-${originalIdx}`}>
                                <td className="px-3 py-2 align-top">
                                  <div>
                                    <p className="font-medium text-xs text-gray-900">{col.name}</p>
                                    {col.sampleValues && col.sampleValues.length > 0 && (
                                      <p className="text-xs text-gray-500 mt-0.5">
                                        {col.sampleValues.slice(0, 5).join(', ')}
                                        {col.sampleValues.length > 5 && '...'}
                                      </p>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <Input
                                    value={col.newName}
                                    onChange={e => updateProcessingColumn(originalIdx, { newName: e.target.value })}
                                    className="h-7 text-xs"
                                    placeholder="Rename column"
                                    disabled={inputsDisabled}
                                  />
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getProcessingDtypeBadgeColor(col.originalDtype)}`}>
                                    {col.originalDtype}
                                  </span>
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <div className={`space-y-2 ${inputsDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
                                    <Select
                                      value={col.selectedDtype}
                                      onValueChange={value => handleProcessingDtypeChange(originalIdx, value)}
                                      disabled={inputsDisabled}
                                    >
                                      <SelectTrigger className="w-full h-7 text-xs">
                                        <SelectValue placeholder="Select dtype" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {dtypeOptions.map(opt => (
                                          <SelectItem key={`dtype-${col.name}-${opt.value}`} value={opt.value}>
                                            {opt.label}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    {col.selectedDtype === 'datetime64' && (
                                      <div className="space-y-1">
                                        <div className="flex items-center space-x-1">
                                          <Select
                                            value={col.datetimeFormat || ''}
                                            onValueChange={value => updateProcessingColumn(originalIdx, { datetimeFormat: value })}
                                            disabled={inputsDisabled || (!!col.datetimeFormat && !col.formatFailed)}
                                            className="flex-1"
                                          >
                                            <SelectTrigger className="w-full h-7 text-xs">
                                              <SelectValue placeholder="Select format" />
                                            </SelectTrigger>
                                            <SelectContent>
                                              {[
                                                { value: '%Y-%m-%d', label: '%Y-%m-%d (2024-12-31)' },
                                                { value: '%d/%m/%Y', label: '%d/%m/%Y (31/12/2024)' },
                                                { value: '%m/%d/%Y', label: '%m/%d/%Y (12/31/2024)' },
                                                { value: '%d-%m-%Y', label: '%d-%m-%Y (31-12-2024)' },
                                                { value: '%m-%d-%Y', label: '%m-%d-%Y (12-31-2024)' },
                                                { value: '%Y/%m/%d', label: '%Y/%m/%d (2024/12/31)' },
                                                { value: '%d/%m/%y', label: '%d/%m/%y (31/12/24)' },
                                                { value: '%m/%d/%y', label: '%m/%d/%y (12/31/24)' },
                                                { value: '%Y-%m-%d %H:%M:%S', label: '%Y-%m-%d %H:%M:%S (2024-12-31 23:59:59)' },
                                                { value: '%d/%m/%Y %H:%M:%S', label: '%d/%m/%Y %H:%M:%S (31/12/2024 23:59:59)' },
                                                { value: '%m/%d/%Y %H:%M:%S', label: '%m/%d/%Y %H:%M:%S (12/31/2024 23:59:59)' },
                                                { value: '%Y-%m-%dT%H:%M:%S', label: '%Y-%m-%dT%H:%M:%S (ISO 8601)' },
                                              ].map(opt => (
                                                <SelectItem key={`dt-format-${opt.value}`} value={opt.value}>
                                                  {opt.label}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                          {col.datetimeFormat && !col.formatDetecting && (
                                            <button
                                              type="button"
                                              onClick={() => updateProcessingColumn(originalIdx, { datetimeFormat: '' })}
                                              className="flex-shrink-0 p-1 hover:bg-gray-100 rounded text-gray-500 hover:text-gray-700 transition-colors"
                                              title="Clear format"
                                              disabled={inputsDisabled}
                                            >
                                              <X className="w-3 h-3" />
                                            </button>
                                          )}
                                        </div>
                                        {col.formatDetecting && (
                                          <div className="text-xs text-blue-600 flex items-center gap-1">
                                            <RefreshCw className="w-3 h-3 animate-spin" />
                                            Detecting format…
                                          </div>
                                        )}
                                        {col.formatFailed && (
                                          <div className="text-xs text-orange-600">
                                            Format detection failed. Please select manually.
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2 align-top">
                                  {hasMissingValues ? (
                                    <div className="flex items-center gap-1.5 text-xs">
                                      <span className="inline-flex items-center rounded-full border border-red-300 text-red-600 px-2 py-0.5 text-[11px] font-semibold">
                                        {col.missingCount}
                                      </span>
                                      <span className="text-gray-500">
                                        ({col.missingPercentage.toFixed(1)}%)
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-gray-500">None</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 align-top">
                                  {hasMissingValues ? (
                                    <div className={`space-y-1 ${inputsDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
                                      <Select
                                        value={col.missingStrategy}
                                        onValueChange={value => handleProcessingMissingStrategyChange(originalIdx, value)}
                                        disabled={inputsDisabled}
                                      >
                                        <SelectTrigger className="w-full h-7 text-xs">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {missingOptions.map(opt => (
                                            <SelectItem key={`missing-${col.name}-${opt.value}`} value={opt.value}>
                                              {opt.label}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                      {col.missingStrategy === 'custom' && (
                                        <Input
                                          value={col.missingCustomValue}
                                          onChange={e => handleProcessingMissingCustomChange(originalIdx, e.target.value)}
                                          placeholder="Custom value"
                                          className="h-7 text-xs"
                                          disabled={inputsDisabled}
                                        />
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-gray-400">N/A</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <div className={`${inputsDisabled ? 'opacity-50 pointer-events-none' : ''}`}>
                                    <Select
                                      value={col.classification || 'unclassified'}
                                      onValueChange={(value: 'identifiers' | 'measures' | 'unclassified') => updateProcessingColumn(originalIdx, { classification: value })}
                                      disabled={inputsDisabled}
                                    >
                                      <SelectTrigger className={`w-full h-7 text-xs ${
                                        col.classification === 'identifiers' ? 'text-blue-600 border-blue-300' :
                                        col.classification === 'measures' ? 'text-green-600 border-green-300' :
                                        'text-yellow-600 border-yellow-300'
                                      }`}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="identifiers">Identifiers</SelectItem>
                                        <SelectItem value="measures">Measures</SelectItem>
                                        <SelectItem value="unclassified">Unclassified</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <label className="flex items-center gap-2 text-xs text-gray-700">
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 accent-red-600"
                                      checked={col.dropColumn}
                                      onChange={e => handleProcessingDropToggle(originalIdx, e.target.checked)}
                                    />
                                    Drop column
                                  </label>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-gray-200 bg-white">
              <Button
                variant="outline"
                size="sm"
                onClick={closeProcessingModal}
                disabled={processingSaving}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleProcessingSave}
                disabled={processingSaving || processingLoading || !processingColumns.length}
              >
                {processingSaving ? 'Saving…' : 'Approve'}
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* View-only Modal - Shows dataframe properties (read-only) */}
      {viewTarget && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-[1000px] max-w-[98vw] p-4 max-h-[90vh] flex flex-col">
            <h4 className="text-lg font-semibold text-gray-900 mb-2">Dataframe Profiling (Verify details)</h4>
            <p className="text-sm text-gray-600">
              {viewTarget.arrow_name || viewTarget.csv_name || viewTarget.object_name}
            </p>
            {viewError && <p className="text-xs text-red-500 mt-2">{viewError}</p>}
            <div className="mt-4 flex-1 min-h-0 flex flex-col">
              {viewLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-500" />
                </div>
              ) : viewColumns.length === 0 ? (
                <p className="text-sm text-gray-600">No columns available.</p>
              ) : (
                <div className="border rounded-lg h-full flex flex-col overflow-hidden">
                  <div className="flex-1 min-h-0 overflow-auto">
                    <table className="w-full min-w-full">
                      <thead className="bg-gradient-to-r from-blue-50 to-blue-100">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b border-gray-200">
                              Column Name
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b border-gray-200">
                              Rename
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b border-gray-200">
                              Current Type
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b border-gray-200">
                              Change Type
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b border-gray-200">
                              Missing Values
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b border-gray-200">
                              Strategy
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b border-gray-200">
                              Classification
                            </th>
                            <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 border-b border-gray-200">
                              Drop Column
                            </th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {viewColumns
                          .map((col, idx) => {
                            const hasMissingValues = col.missingCount > 0;
                            return (
                              <tr key={`view-${col.name}-${idx}`}>
                                <td className="px-3 py-2 align-top">
                                  <div>
                                    <p className="font-medium text-xs text-gray-900">{col.name}</p>
                                    {col.sampleValues && col.sampleValues.length > 0 && (
                                      <p className="text-xs text-gray-500 mt-0.5">
                                        {col.sampleValues.slice(0, 5).join(', ')}
                                        {col.sampleValues.length > 5 && '...'}
                                      </p>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <Input
                                    value={col.newName}
                                    className="h-7 text-xs bg-gray-50"
                                    placeholder="Rename column"
                                    disabled
                                    readOnly
                                  />
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getProcessingDtypeBadgeColor(col.originalDtype)}`}>
                                    {col.originalDtype}
                                  </span>
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <div className="space-y-2 opacity-50 pointer-events-none">
                                    <Select
                                      value={col.selectedDtype}
                                      disabled
                                    >
                                      <SelectTrigger className="w-full h-7 text-xs">
                                        <SelectValue placeholder="Select dtype" />
                                      </SelectTrigger>
                                    </Select>
                                  </div>
                                </td>
                                <td className="px-3 py-2 align-top">
                                  {hasMissingValues ? (
                                    <div className="flex items-center gap-1.5 text-xs">
                                      <span className="inline-flex items-center rounded-full border border-red-300 text-red-600 px-2 py-0.5 text-[11px] font-semibold">
                                        {col.missingCount}
                                      </span>
                                      <span className="text-gray-500">
                                        ({col.missingPercentage.toFixed(1)}%)
                                      </span>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-gray-500">None</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 align-top">
                                  {hasMissingValues ? (
                                    <div className="space-y-1 opacity-50 pointer-events-none">
                                      <Select
                                        value={col.missingStrategy}
                                        disabled
                                      >
                                        <SelectTrigger className="w-full h-7 text-xs">
                                          <SelectValue />
                                        </SelectTrigger>
                                      </Select>
                                    </div>
                                  ) : (
                                    <span className="text-xs text-gray-400">N/A</span>
                                  )}
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <div className="opacity-50 pointer-events-none">
                                    <Select
                                      value={col.classification || 'unclassified'}
                                      disabled
                                    >
                                      <SelectTrigger className={`w-full h-7 text-xs ${
                                        col.classification === 'identifiers' ? 'text-blue-600 border-blue-300' :
                                        col.classification === 'measures' ? 'text-green-600 border-green-300' :
                                        'text-yellow-600 border-yellow-300'
                                      }`}>
                                        <SelectValue />
                                      </SelectTrigger>
                                    </Select>
                                  </div>
                                </td>
                                <td className="px-3 py-2 align-top">
                                  <label className="flex items-center gap-2 text-xs text-gray-700 opacity-50">
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 accent-red-600"
                                      checked={col.dropColumn}
                                      disabled
                                      readOnly
                                    />
                                    Drop column
                                  </label>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-4 mt-4 border-t border-gray-200 bg-white">
              <Button
                variant="outline"
                size="sm"
                onClick={closeViewModal}
              >
                Close
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Guided Upload Flow - For rule-based checking workflow */}
      {isGuidedUploadFlowOpen && guidedFlowInitialFile && (
        <GuidedUploadFlow
          open={isGuidedUploadFlowOpen}
          onOpenChange={(open) => {
            setIsGuidedUploadFlowOpen(open);
            if (!open) {
              setGuidedFlowInitialFile(undefined);
              setGuidedFlowInitialStage('U1');
            }
          }}
          existingDataframe={guidedFlowInitialFile}
          initialStage={guidedFlowInitialStage}
          onComplete={async (result) => {
            try {
              // Convert guided flow result to processing format
              const fileName = guidedFlowInitialFile.name;
              const columnNameEdits = result.columnNameEdits[fileName] || [];
              const dataTypeSelections = result.dataTypeSelections[fileName] || [];
              const missingValueStrategies = result.missingValueStrategies[fileName] || [];
              const headerSelections = result.headerSelections[fileName];
              
              // Fetch current metadata to get original column info
              const res = await fetch(`${VALIDATE_API}/file-metadata`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ file_path: guidedFlowInitialFile.path })
              });
              
              if (!res.ok) {
                throw new Error('Failed to load dataframe metadata');
              }
              
              const metadata = await res.json();
              const columns = metadata.columns || [];
              
              // Build processing instructions from flow results
              const processingInstructions: any[] = [];
              
              columns.forEach((col: any) => {
                const nameEdit = columnNameEdits.find(e => e.originalName === col.name);
                const typeSelection = dataTypeSelections.find(t => t.columnName === (nameEdit?.editedName || col.name));
                const missingStrategy = missingValueStrategies.find(s => s.columnName === (nameEdit?.editedName || col.name));
                
                const instruction: Record<string, any> = { column: col.name };
                
                if (nameEdit && nameEdit.editedName !== col.name) {
                  instruction.new_name = nameEdit.editedName;
                }
                
                if (typeSelection && typeSelection.selectedType !== col.dtype) {
                  instruction.dtype = typeSelection.selectedType;
                  if (typeSelection.format) {
                    instruction.datetime_format = typeSelection.format;
                  }
                }
                
                if (missingStrategy && missingStrategy.strategy !== 'none') {
                  instruction.missing_strategy = missingStrategy.strategy;
                  if (missingStrategy.value) {
                    instruction.custom_value = missingStrategy.value;
                  }
                }
                
                if (Object.keys(instruction).length > 1) {
                  processingInstructions.push(instruction);
                }
              });
              
              // Process dataframe with instructions
              if (processingInstructions.length > 0) {
                const processRes = await fetch(`${VALIDATE_API}/process_saved_dataframe`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({
                    object_name: guidedFlowInitialFile.path,
                    instructions: processingInstructions,
                    header_row_index: headerSelections?.headerRowIndex,
                    header_row_count: headerSelections?.headerRowCount || 1,
                  }),
                });
                
                if (!processRes.ok) {
                  const errorData = await processRes.json().catch(() => ({}));
                  throw new Error(errorData.detail || 'Failed to process dataframe');
                }
              }
              
              toast({
                title: 'Success',
                description: `${fileName} updated successfully through guided flow.`,
              });
              
              setIsGuidedUploadFlowOpen(false);
              setGuidedFlowInitialFile(undefined);
              setGuidedFlowInitialStage('U1');
              setReloadToken(prev => prev + 1);
              // Refresh priming status after flow completes
              setTimeout(() => {
                const projectContext = getActiveProjectContext();
                if (projectContext && guidedFlowInitialFile) {
                  const queryParams = new URLSearchParams({
                    client_name: projectContext.client_name || '',
                    app_name: projectContext.app_name || '',
                    project_name: projectContext.project_name || '',
                    file_name: guidedFlowInitialFile.path,
                  }).toString();

                  fetch(`${VALIDATE_API}/check-priming-status?${queryParams}`, {
                    credentials: 'include'
                  }).then(res => res.json()).then(data => {
                    setFilePrimingStatus(prev => ({
                      ...prev,
                      [guidedFlowInitialFile.path]: {
                        isPrimed: data?.completed === true,
                        isInProgress: false,
                        currentStage: data?.current_stage,
                      },
                    }));
                  }).catch(() => {});
                }
              }, 1000);
            } catch (err: any) {
              toast({
                title: 'Error',
                description: err.message || 'Failed to process dataframe',
                variant: 'destructive',
              });
            }
          }}
        />
      )}

      {/* Share Dialog */}
      <Dialog
        open={shareDialog?.open || false}
        onOpenChange={(open) => {
          if (!open) {
            setShareDialog(null);
            setShareLink('');
            setShareError(null);
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5" />
              Share DataFrame
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                {shareDialog?.filename || 'DataFrame'}
              </p>
            </div>
            
            {shareLoading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                <span className="ml-2 text-sm text-gray-600">Generating share link...</span>
              </div>
            ) : shareError ? (
              <div className="space-y-3">
                <p className="text-sm text-destructive">
                  {shareError}
                </p>
                <p className="text-xs text-muted-foreground">
                  Note: The database migration for DataFrameShareLink may need to be run. Please contact your administrator.
                </p>
              </div>
            ) : shareLink ? (
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    ref={shareLinkInputRef}
                    value={shareLink}
                    readOnly
                    className="flex-1 text-sm bg-muted"
                    onClick={(e) => {
                      // Select all text when clicking on the input
                      (e.target as HTMLInputElement).select();
                    }}
                  />
                  <Button
                    onClick={async () => {
                      const copyToClipboard = async (text: string, fallbackTarget?: HTMLInputElement | null) => {
                        // Try native clipboard API first
                        if (navigator.clipboard && window.isSecureContext) {
                          try {
                            await navigator.clipboard.writeText(text);
                            return true;
                          } catch (error) {
                            console.warn('navigator.clipboard.writeText failed, trying fallback', error);
                          }
                        }
                        
                        // Fallback: Use the input element with execCommand
                        if (fallbackTarget) {
                          try {
                            const wasReadOnly = fallbackTarget.readOnly;
                            fallbackTarget.readOnly = false;
                            fallbackTarget.focus();
                            fallbackTarget.select();
                            fallbackTarget.setSelectionRange(0, text.length);
                            const successful = document.execCommand('copy');
                            fallbackTarget.readOnly = wasReadOnly;
                            fallbackTarget.blur();
                            return successful;
                          } catch (error) {
                            console.warn('execCommand copy failed', error);
                          }
                        }
                        
                        // Last resort: Create temporary textarea
                        try {
                          const textarea = document.createElement('textarea');
                          textarea.value = text;
                          textarea.style.position = 'fixed';
                          textarea.style.left = '-9999px';
                          textarea.style.top = '0';
                          textarea.setAttribute('readonly', '');
                          document.body.appendChild(textarea);
                          textarea.focus();
                          textarea.select();
                          textarea.setSelectionRange(0, text.length);
                          const successful = document.execCommand('copy');
                          document.body.removeChild(textarea);
                          return successful;
                        } catch (error) {
                          console.warn('textarea fallback copy failed', error);
                          return false;
                        }
                      };
                      
                      try {
                        const success = await copyToClipboard(shareLink, shareLinkInputRef.current);
                        if (success) {
                          toast({ title: 'Link copied', description: 'Share link copied to clipboard' });
                        } else {
                          // If all methods fail, select the text in the input so user can manually copy
                          if (shareLinkInputRef.current) {
                            shareLinkInputRef.current.focus();
                            shareLinkInputRef.current.select();
                            toast({ 
                              title: 'Select the link', 
                              description: 'Link selected - press Ctrl+C to copy', 
                              variant: 'default' 
                            });
                          } else {
                            throw new Error('Copy not supported');
                          }
                        }
                      } catch (error: any) {
                        console.error('Copy failed:', error);
                        toast({ 
                          title: 'Copy failed', 
                          description: 'Please select and copy the link manually', 
                          variant: 'destructive' 
                        });
                      }
                    }}
                    variant="secondary"
                    size="sm"
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Anyone with this link can view the dataframe with pagination.
                </p>
              </div>
            ) : (
              <p className="text-sm text-destructive">
                Failed to generate share link. Please try again.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Mode Selection Dialog */}
      {modeSelectionTarget && (
        <Dialog open={!!modeSelectionTarget} onOpenChange={(open) => !open && setModeSelectionTarget(null)}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Select Mode of Priming</DialogTitle>
              <DialogDescription>
                Choose how you want to prime this file: {modeSelectionTarget.arrow_name || modeSelectionTarget.csv_name || modeSelectionTarget.object_name}
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid gap-3 py-4">
              <Button
                variant="outline"
                className="h-auto flex-col items-start p-4 hover:bg-primary/5 hover:border-primary transition-all"
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const target = modeSelectionTarget;
                  if (target) {
                    // Check if Direct mode is currently active
                    if (directReviewTarget) {
                      // Show confirmation dialog before switching from Direct to Guided mode
                      setModeSwitchConfirmation({
                        show: true,
                        fromMode: 'direct',
                        toMode: 'guided',
                        frame: target,
                        onConfirm: async () => {
                          // Clear Direct mode
                          setDirectReviewTarget(null);
                          // Proceed with Guided mode activation
                          try {
                            if (typeof handleOpenGuidedFlow === 'function') {
                              await handleOpenGuidedFlow(target);
                            } else {
                              console.error('[SavedDataFramesPanel] handleOpenGuidedFlow is not a function, type:', typeof handleOpenGuidedFlow);
                            }
                          } catch (error) {
                            console.error('[SavedDataFramesPanel] Error opening guided flow:', error);
                          }
                          setModeSelectionTarget(null);
                          setModeSwitchConfirmation({ show: false, fromMode: 'direct', toMode: 'guided', frame: null, onConfirm: () => {} });
                        },
                      });
                    } else {
                      // No Direct mode active, proceed directly
                      try {
                        if (typeof handleOpenGuidedFlow === 'function') {
                          await handleOpenGuidedFlow(target);
                        } else {
                          console.error('[SavedDataFramesPanel] handleOpenGuidedFlow is not a function, type:', typeof handleOpenGuidedFlow);
                        }
                      } catch (error) {
                        console.error('[SavedDataFramesPanel] Error opening guided flow:', error);
                      }
                      setModeSelectionTarget(null);
                    }
                  }
                }}
              >
                <div className="flex items-center gap-3 mb-2 w-full">
                  <Wrench className="w-5 h-5 text-primary" />
                  <div className="text-left flex-1">
                    <p className="font-semibold text-sm">1. Guided Mode</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Step-by-step guided process with rule-based checking and validation
                    </p>
                  </div>
                </div>
              </Button>
              
              <Button
                variant="outline"
                className="h-auto flex-col items-start p-4 hover:bg-primary/5 hover:border-primary transition-all"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const target = modeSelectionTarget;
                  if (target) {
                    // Check if Guided mode is active (if globally enabled, show confirmation)
                    if (globalGuidedModeEnabled) {
                      // Get the landing atom ID to clear the flow
                      const atomId = findOrCreateDataUploadAtom();
                      // Show confirmation dialog before switching from Guided to Direct mode
                      setModeSwitchConfirmation({
                        show: true,
                        fromMode: 'guided',
                        toMode: 'direct',
                        frame: target,
                        onConfirm: async () => {
                          // Clear Guided mode state for the landing atom
                          if (atomId) {
                            removeActiveGuidedFlow(atomId);
                            // Check if there are any other active guided flows, if not, disable global guided mode
                            // Use getState() to get fresh state
                            const currentFlows = useLaboratoryStore.getState().activeGuidedFlows;
                            const remainingFlows = Object.keys(currentFlows).filter(id => id !== atomId);
                            if (remainingFlows.length === 0) {
                              setGlobalGuidedMode(false);
                            }
                          }
                          // Proceed with Direct mode activation
                          openProcessingModal(target).catch((error) => {
                            console.error('[SavedDataFramesPanel] Error opening processing modal:', error);
                          });
                          setModeSelectionTarget(null);
                          setModeSwitchConfirmation({ show: false, fromMode: 'guided', toMode: 'direct', frame: null, onConfirm: () => {} });
                        },
                      });
                    } else {
                      // No Guided mode active, proceed directly
                      openProcessingModal(target).catch((error) => {
                        console.error('[SavedDataFramesPanel] Error opening processing modal:', error);
                      });
                      setModeSelectionTarget(null);
                    }
                  }
                }}
              >
                <div className="flex items-center gap-3 mb-2 w-full">
                  <SlidersHorizontal className="w-5 h-5 text-primary" />
                  <div className="text-left flex-1">
                    <p className="font-semibold text-sm">2. Directly Review</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Open processing panel directly to review and configure columns
                    </p>
                  </div>
                </div>
              </Button>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setModeSelectionTarget(null)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      
      {/* Mode Switch Confirmation Dialog */}
      <ConfirmationDialog
        open={modeSwitchConfirmation.show}
        onOpenChange={(open) => {
          if (!open) {
            setModeSwitchConfirmation({ show: false, fromMode: 'direct', toMode: 'guided', frame: null, onConfirm: () => {} });
          }
        }}
        onConfirm={() => {
          modeSwitchConfirmation.onConfirm();
        }}
        onCancel={() => {
          setModeSwitchConfirmation({ show: false, fromMode: 'direct', toMode: 'guided', frame: null, onConfirm: () => {} });
        }}
        title={
          modeSwitchConfirmation.fromMode === 'direct'
            ? 'Switch to Guided Mode?'
            : 'Switch to Direct Review?'
        }
        description={
          modeSwitchConfirmation.fromMode === 'direct'
            ? 'You are currently in Direct Review mode. Switching to Guided Mode will replace the Direct Review panel. Do you want to continue?'
            : 'You are currently in Guided Mode. Switching to Direct Review will exit the Guided Mode workflow. Do you want to continue?'
        }
        icon={<AlertCircle className="w-5 h-5 text-white" />}
        confirmLabel="Yes, Switch"
        cancelLabel="Cancel"
        iconBgClass="bg-blue-500"
        confirmButtonClass="bg-blue-500 hover:bg-blue-600"
      />
    </div>
  );
};

export default SavedDataFramesPanel;
