import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { safeStringify } from '@/utils/safeStringify';
import { sanitizeLabConfig, persistLaboratoryConfig } from '@/utils/projectStorage';
import { Card, Card as AtomBox } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Grid3X3, Trash2, Settings, ChevronDown, Minus, RefreshCcw, Maximize2, X, HelpCircle, HelpCircleIcon, GripVertical } from 'lucide-react';
import { useExhibitionStore } from '../../../ExhibitionMode/store/exhibitionStore';
import ConfirmationDialog from '@/templates/DialogueBox/ConfirmationDialog';
import { atoms as allAtoms } from '@/components/AtomList/data';
import { molecules } from '@/components/MoleculeList/data';
import {
  REGISTRY_API,
  TEXT_API,
  CARD_API,
  LAB_ACTIONS_API,
  LABORATORY_API,
  VALIDATE_API,
  FEATURE_OVERVIEW_API,
  CLASSIFIER_API,
  MOLECULES_API,
} from '@/lib/api';
import { AIChatBot, AtomAIChatBot } from '@/components/TrinityAI';
import LoadingAnimation from '@/templates/LoadingAnimation/LoadingAnimation';
import { AtomSuggestion } from '@/components/AtomSuggestion';
import TextBoxEditor from '@/components/AtomList/atoms/text-box/TextBoxEditor';
import DataUploadValidateAtom from '@/components/AtomList/atoms/data-upload-validate/DataUploadValidateAtom';
import FeatureOverviewAtom from '@/components/AtomList/atoms/feature-overview/FeatureOverviewAtom';
import ConcatAtom from '@/components/AtomList/atoms/concat/ConcatAtom';
import MergeAtom from '@/components/AtomList/atoms/merge/MergeAtom';
import ColumnClassifierAtom from '@/components/AtomList/atoms/column-classifier/ColumnClassifierAtom';
import SelectModelsFeatureAtom from '@/components/AtomList/atoms/select-models-feature/SelectModelsFeatureAtom';
import DataFrameOperationsAtom from '@/components/AtomList/atoms/dataframe-operations/DataFrameOperationsAtom';
import ScopeSelectorAtom from '@/components/AtomList/atoms/scope-selector/ScopeSelectorAtom';
import CreateColumnAtom from '@/components/AtomList/atoms/createcolumn/CreateColumnAtom';
import GroupByAtom from '@/components/AtomList/atoms/groupby-wtg-avg/GroupByAtom';
import CorrelationAtom from '@/components/AtomList/atoms/correlation/CorrelationAtom';
import ChartMakerAtom from '@/components/AtomList/atoms/chart-maker/ChartMakerAtom';
import BuildModelFeatureBasedAtom from '@/components/AtomList/atoms/build-model-feature-based/BuildModelFeatureBasedAtom';
import ExploreAtom from '@/components/AtomList/atoms/explore/ExploreAtom';
import EvaluateModelsFeatureAtom from '@/components/AtomList/atoms/evaluate-models-feature/EvaluateModelsFeatureAtom';
import AutoRegressiveModelsAtom from '@/components/AtomList/atoms/auto-regressive-models/AutoRegressiveModelsAtom';
import SelectModelsAutoRegressiveAtom from '@/components/AtomList/atoms/select-models-auto-regressive/SelectModelsAutoRegressiveAtom';
import EvaluateModelsAutoRegressiveAtom from '@/components/AtomList/atoms/evaluate-models-auto-regressive/EvaluateModelsAutoRegressiveAtom';
import ClusteringAtom from '@/components/AtomList/atoms/clustering/ClusteringAtom';
import ScenarioPlannerAtom from '@/components/AtomList/atoms/scenario-planner/ScenarioPlannerAtom';
import { fetchDimensionMapping } from '@/lib/dimensions';
import { useToast } from '@/hooks/use-toast';
import {
  registerPrefillController,
  cancelPrefillController,
} from '@/components/AtomList/atoms/column-classifier/prefillManager';

import {
  useLaboratoryStore,
  LayoutCard,
  DroppedAtom,
  DEFAULT_TEXTBOX_SETTINGS,
  createDefaultDataUploadSettings,
  DEFAULT_FEATURE_OVERVIEW_SETTINGS,
  DEFAULT_DATAFRAME_OPERATIONS_SETTINGS,
  DEFAULT_CHART_MAKER_SETTINGS,
  DEFAULT_SELECT_MODELS_FEATURE_SETTINGS,
  DEFAULT_AUTO_REGRESSIVE_MODELS_SETTINGS,
  DEFAULT_AUTO_REGRESSIVE_MODELS_DATA,
  DataUploadSettings,
  ColumnClassifierColumn,
  DEFAULT_EXPLORE_SETTINGS,
  DEFAULT_EXPLORE_DATA,
} from '../../store/laboratoryStore';
import { deriveWorkflowMolecules, WorkflowMolecule } from './helpers';
import { LABORATORY_PROJECT_STATE_API } from '@/lib/api';
import { getActiveProjectContext } from '@/utils/projectEnv';


interface CanvasAreaProps {
  onAtomSelect?: (atomId: string) => void;
  onCardSelect?: (cardId: string, exhibited: boolean) => void;
  selectedCardId?: string;
  onToggleSettingsPanel?: () => void;
  onToggleHelpPanel?: () => void;
  canEdit: boolean;
  onPendingChangesUpdate?: (changes: { deletedMolecules: string[]; deletedAtoms: { moleculeId: string; atomId: string }[]; addedAtoms: { moleculeId: string; atomId: string; position: number }[] }) => void;
}

interface CanvasAreaRef {
  syncWorkflowCollection: () => Promise<void>;
}


const STORAGE_KEY = 'laboratory-layout-cards';

const LLM_MAP: Record<string, string> = {
  concat: 'Agent Concat',
  'chart-maker': 'Agent Chart Maker',
  merge: 'Agent Merge',
  'create-column': 'Agent Create Transform',
  'groupby-wtg-avg': 'Agent GroupBy',
  'explore': 'Agent Explore',
  'dataframe-operations': 'Agent DataFrame Operations',
};

const hydrateDroppedAtom = (atom: any): DroppedAtom => {
  const info = allAtoms.find(at => at.id === atom.atomId);
  return {
    ...atom,
    llm: atom.llm || LLM_MAP[atom.atomId],
    color: atom.color || info?.color || 'bg-gray-400',
  };
};

const hydrateLayoutCards = (rawCards: any): LayoutCard[] | null => {
  if (!Array.isArray(rawCards)) {
    return null;
  }

  return rawCards.map((card: any) => {
    const hydratedCard: any = {
      id: card.id,
      atoms: Array.isArray(card.atoms)
        ? card.atoms.map((atom: any) => hydrateDroppedAtom(atom))
        : [],
      isExhibited: !!card.isExhibited,
      moleculeId: card.moleculeId,
      moleculeTitle: card.moleculeTitle,
      collapsed: card.collapsed || false,
      scroll_position: card.scroll_position || 0,
    };
    
    // Preserve position field explicitly - can be number, null, or undefined
    // Only set if the key exists in the card object to avoid overwriting with undefined
    if ('position' in card) {
      hydratedCard.position = card.position;
    }
    
    return hydratedCard;
  });
};

// Function to fetch atom configurations from MongoDB
const fetchAtomConfigurationsFromMongoDB = async (): Promise<{
  cards: LayoutCard[];
  workflowMolecules: WorkflowMolecule[];
} | null> => {
  try {
    const projectContext = getActiveProjectContext();
    if (!projectContext) {
      console.warn('[Laboratory API] No project context available for MongoDB fetch');
      return null;
    }

    const requestUrl = `${LABORATORY_PROJECT_STATE_API}/get/${projectContext.client_name}/${projectContext.app_name}/${projectContext.project_name}`;
    

    const response = await fetch(requestUrl, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      console.warn('[Laboratory API] Failed to fetch atom configurations from MongoDB', {
        status: response.status,
        statusText: response.statusText,
      });
      return null;
    }

    const data = await response.json();
    
    if (data.status === 'ok' && data.cards && Array.isArray(data.cards)) {
      console.info('[Laboratory API] Successfully fetched atom configurations from MongoDB', {
        cardsCount: data.cards.length,
        workflowMoleculesCount: data.workflow_molecules?.length || 0,
      });

      // The backend already returns cards in the correct format, so we can use them directly
      const cards = data.cards.map((card: any) => {
        // The backend already formats the atoms correctly, so we can use them directly
        return {
          id: card.id,
          atoms: card.atoms || [],
          isExhibited: card.isExhibited || false,
          moleculeId: card.moleculeId,
          moleculeTitle: card.moleculeTitle,
          collapsed: card.collapsed || false,
          scroll_position: card.scroll_position || 0,
          position: card.position, // Add position for standalone cards
        };
      });

      // Log standalone cards for debugging
      const standaloneCards = cards.filter(card => !card.moleculeId);
      const workflowCards = cards.filter(card => card.moleculeId);
      if (standaloneCards.length > 0) {
        console.info('[Laboratory API] MongoDB returned standalone cards:', {
          count: standaloneCards.length,
          standaloneCardIds: standaloneCards.map(c => ({ id: c.id, atomId: c.atoms[0]?.atomId, position: c.position }))
        });
      }
      console.info('[Laboratory API] MongoDB cards breakdown:', {
        total: cards.length,
        workflow: workflowCards.length,
        standalone: standaloneCards.length
      });

      // Use workflow molecules from backend directly - no assignments needed
      const workflowMolecules = data.workflow_molecules || [];
      
      return { cards, workflowMolecules };
    } else {
      console.warn('[Laboratory API] Invalid response format from MongoDB fetch', data);
      return null;
    }
  } catch (error) {
    console.error('[Laboratory API] Error fetching atom configurations from MongoDB', error);
    return null;
  }
};

const CanvasArea = React.forwardRef<CanvasAreaRef, CanvasAreaProps>(({
  onAtomSelect,
  onCardSelect,
  selectedCardId,
  onToggleSettingsPanel,
  onToggleHelpPanel,
  canEdit,
  onPendingChangesUpdate,
}, ref) => {
  const { cards: layoutCards, setCards: setLayoutCards, updateAtomSettings } = useLaboratoryStore();
  const [workflowMolecules, setWorkflowMolecules] = useState<WorkflowMolecule[]>([]);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>({});
  const [collapsedMolecules, setCollapsedMolecules] = useState<Record<string, boolean>>({});
  const [addDragTarget, setAddDragTarget] = useState<string | null>(null);
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [draggedMoleculeId, setDraggedMoleculeId] = useState<string | null>(null);
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);
  const [dragOverMoleculeId, setDragOverMoleculeId] = useState<string | null>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [showAtomSuggestion, setShowAtomSuggestion] = useState<Record<string, boolean>>({});
  const [isCanvasLoading, setIsCanvasLoading] = useState(true);
  const [moleculeToDelete, setMoleculeToDelete] = useState<{moleculeId: string, moleculeTitle: string} | null>(null);
  const [deleteMoleculeDialogOpen, setDeleteMoleculeDialogOpen] = useState(false);
  
  // Track pending changes for cross-collection sync
  const [pendingChanges, setPendingChanges] = useState<{
    deletedMolecules: string[];
    deletedAtoms: { moleculeId: string; atomId: string }[];
    addedAtoms: { moleculeId: string; atomId: string; position: number }[];
  }>({
    deletedMolecules: [],
    deletedAtoms: [],
    addedAtoms: []
  });
  const loadingMessages = useMemo(
    () => [
      'Loading project canvas',
      'Fetching atom details',
      'Preparing interactive workspace',
    ],
    [],
  );
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const currentLoadingMessage =
    loadingMessages[loadingMessageIndex] ?? loadingMessages[0] ?? 'Loading';
  const prevLayout = React.useRef<LayoutCard[] | null>(null);
  const initialLoad = React.useRef(true);

  useEffect(() => {
    if (!expandedCard) {
      return;
    }

    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setExpandedCard(null);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [expandedCard]);

  const { setCards } = useExhibitionStore();
  const { toast } = useToast();

  interface ColumnInfo {
    column: string;
    data_type: string;
    unique_count: number;
    unique_values: string[];
  }

  interface ColumnSummaryOptions {
    signal?: AbortSignal;
    statusCb?: (status: string) => void;
    retries?: number;
    retryDelayMs?: number;
  }

  const sleep = (ms: number) =>
    new Promise(resolve => {
      setTimeout(resolve, ms);
    });

  const fetchColumnSummary = async (
    csv: string,
    { signal, statusCb, retries = 0, retryDelayMs = 800 }: ColumnSummaryOptions = {},
  ) => {
    if (!csv || !/\.[^/]+$/.test(csv.trim())) {
      return { summary: [], numeric: [], xField: '' };
    }

    let attempt = 0;
    let lastResult = { summary: [] as ColumnInfo[], numeric: [] as string[], xField: '' };

    while (attempt <= retries) {
      if (signal?.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      const label =
        attempt === 0 ? 'Fetching column summary' : `Retrying column summary (${attempt + 1})`;
      statusCb?.(label);
      console.log(
        `${attempt === 0 ? '🔎' : '🔄'} ${label.toLowerCase()} for`,
        csv,
      );

      try {
        const res = await fetch(
          `${FEATURE_OVERVIEW_API}/column_summary?object_name=${encodeURIComponent(csv)}`,
          { signal },
        );
        if (!res.ok) {
          console.warn('⚠️ column summary request failed', res.status);
        } else {
          const data = await res.json();
          const summary: ColumnInfo[] = (data.summary || []).filter(Boolean);
          console.log('ℹ️ fetched column summary rows', summary.length);
          const numeric = summary
            .filter(c => !['object', 'string'].includes(c.data_type.toLowerCase()))
            .map(c => c.column);
          const xField =
            summary.find(c => c.column.toLowerCase().includes('date'))?.column ||
            (summary[0]?.column || '');
          lastResult = { summary, numeric, xField };
          if (summary.length > 0) {
            return lastResult;
          }
        }
      } catch (err) {
        if ((err as any)?.name === 'AbortError') {
          console.warn('ℹ️ column summary fetch aborted');
          throw err;
        }
        console.error('⚠️ failed to fetch column summary', err);
      }

      attempt += 1;
      if (attempt <= retries && retryDelayMs > 0) {
        await sleep(retryDelayMs);
      }
    }

    return lastResult;
  };

  const prefetchDataframe = async (
    name: string,
    signal?: AbortSignal,
    statusCb?: (s: string) => void,
  ) => {
    if (!name || !/\.[^/]+$/.test(name.trim())) return;
    try {
      statusCb?.('Fetching flight table');
      console.log('✈️ fetching flight table', name);
      const fr = await fetch(
        `${FEATURE_OVERVIEW_API}/flight_table?object_name=${encodeURIComponent(name)}`,
        { credentials: 'include', signal }
      );
      if (fr.ok) {
        await fr.arrayBuffer();
        console.log('✅ fetched flight table', name);
      }
      statusCb?.('Prefetching Dataframe');
      console.log('🔎 prefetching dataframe', name);
      const res = await fetch(
        `${FEATURE_OVERVIEW_API}/cached_dataframe?object_name=${encodeURIComponent(name)}`,
        { credentials: 'include', signal }
      );
      if (res.ok) {
        await res.text();
        console.log('✅ prefetched dataframe', name);
      } else {
        console.warn('⚠️ prefetch dataframe failed', res.status);
      }
    } catch (err) {
      if ((err as any)?.name !== 'AbortError') {
        console.error('⚠️ prefetch dataframe error', err);
      }
    }
  };


  const findLatestDataSource = async (signal?: AbortSignal) => {
    console.log('🔎 searching for latest data source');

    type Candidate = {
      csv: string;
      display?: string;
      identifiers?: string[];
      summary?: ColumnInfo[];
      numeric?: string[];
      xField?: string;
    } | null;

    let layoutCandidate: Candidate = null;

    if (Array.isArray(layoutCards)) {
      outer: for (let i = (Array.isArray(layoutCards) ? layoutCards.length : 0) - 1; i >= 0; i--) {
        const card = layoutCards[i];
        for (let j = card.atoms.length - 1; j >= 0; j--) {
          const a = card.atoms[j];
          if (a.atomId === 'feature-overview' && a.settings?.dataSource) {
            console.log('✔️ found feature overview data source', a.settings.dataSource);
            const existingColumns: ColumnInfo[] = Array.isArray(a.settings?.allColumns)
              ? (a.settings.allColumns as ColumnInfo[]).filter(Boolean)
              : [];
            const cols =
              existingColumns.length > 0
                ? {
                    summary: existingColumns,
                    numeric: Array.isArray(a.settings?.numericColumns)
                      ? (a.settings.numericColumns as string[])
                      : [],
                    xField: a.settings?.xAxis || '',
                  }
                : await fetchColumnSummary(a.settings.dataSource, {
                    signal,
                    retries: 2,
                  });
            layoutCandidate = {
              csv: a.settings.dataSource,
              display: a.settings.csvDisplay || a.settings.dataSource,
              identifiers: a.settings.selectedColumns || [],
              ...(cols || {}),
            };
            break outer;
          }
          if (a.atomId === 'data-upload-validate') {
            const req = a.settings?.requiredFiles?.[0];
            const validatorId = a.settings?.validatorId;
            if (req) {
              try {
                const [ticketRes, confRes] = await Promise.all([
                  fetch(`${VALIDATE_API}/latest_ticket/${encodeURIComponent(req)}`, { signal }),
                  validatorId
                    ? fetch(`${VALIDATE_API}/get_validator_config/${validatorId}`, { signal })
                    : Promise.resolve(null as any),
                ]);
                if (ticketRes.ok) {
                  const ticket = await ticketRes.json();
                  if (ticket.arrow_name) {
                    console.log('✔️ using validated data source', ticket.arrow_name);
                    const cols = await fetchColumnSummary(ticket.arrow_name, {
                      signal,
                      retries: 2,
                    });
                    let ids: string[] = [];
                    if (confRes && confRes.ok) {
                      const cfg = await confRes.json();
                      ids =
                        cfg.classification?.[req]?.final_classification?.identifiers || [];
                    }
                    layoutCandidate = {
                      csv: ticket.arrow_name,
                      display: ticket.csv_name,
                      identifiers: ids,
                      ...(cols || {}),
                    };
                    break outer;
                  }
                }
              } catch (err) {
                if ((err as any)?.name === 'AbortError') {
                  throw err;
                }
              }
            }
          }
        }
      }
    }

    let env: any = {};
    const envStr = localStorage.getItem('env');
    if (envStr) {
      try {
        env = JSON.parse(envStr);
      } catch {
        env = {};
      }
    }

    const params = new URLSearchParams({
      client_id: env.CLIENT_ID || '',
      app_id: env.APP_ID || '',
      project_id: env.PROJECT_ID || '',
      client_name: env.CLIENT_NAME || '',
      app_name: env.APP_NAME || '',
      project_name: env.PROJECT_NAME || '',
    });
    const query = params.toString() ? `?${params.toString()}` : '';

    try {
      const latestRes = await fetch(
        `${VALIDATE_API}/latest_project_dataframe${query}`,
        { credentials: 'include', signal }
      );
      if (latestRes.ok) {
        const latestData = await latestRes.json();
        const latestName = latestData?.object_name;
        if (typeof latestName === 'string' && latestName.trim()) {
          console.log(
            '✔️ defaulting to latest flight dataframe',
            latestName,
            latestData?.source || 'unknown'
          );
          if (layoutCandidate && layoutCandidate.csv === latestName) {
            return {
              ...layoutCandidate,
              display:
                latestData?.csv_name || layoutCandidate.display || layoutCandidate.csv,
            };
          }
          const cols = await fetchColumnSummary(latestName, {
            signal,
            retries: 2,
          });
          return {
            csv: latestName,
            display: latestData?.csv_name || latestName,
            ...(cols || {}),
          };
        }
      } else {
        console.warn('⚠️ latest_project_dataframe failed', latestRes.status);
      }
    } catch (err) {
      if ((err as any)?.name === 'AbortError') {
        throw err;
      }
      console.warn('⚠️ latest_project_dataframe request failed', err);
    }

    if (layoutCandidate) {
      return layoutCandidate;
    }

    try {
      const res = await fetch(`${VALIDATE_API}/list_saved_dataframes${query}`, {
        signal,
      });
      if (res.ok) {
        const data = await res.json();
        interface SavedFrameMeta {
          object_name: string;
          csv_name?: string;
          last_modified?: string;
        }
        const files: SavedFrameMeta[] = Array.isArray(data.files)
          ? data.files
          : [];
        const validFiles = files.filter(
          f => typeof f.object_name === 'string' && /\.[^/]+$/.test(f.object_name.trim())
        );
        let fallback: SavedFrameMeta | null = null;
        let latest: { file: SavedFrameMeta; ts: number } | null = null;
        for (const item of validFiles) {
          fallback = item;
          const ts = item.last_modified ? Date.parse(item.last_modified) : NaN;
          if (!Number.isNaN(ts)) {
            if (!latest || ts > latest.ts) {
              latest = { file: item, ts };
            }
          }
        }
        const chosen = latest?.file || fallback;
        if (chosen && chosen.object_name) {
          console.log('✔️ defaulting to latest saved dataframe', chosen.object_name);
          const cols = await fetchColumnSummary(chosen.object_name, {
            signal,
            retries: 2,
          });
          return {
            csv: chosen.object_name,
            display: chosen.csv_name || chosen.object_name,
            ...(cols || {}),
          };
        }
      }
    } catch (err) {
      if ((err as any)?.name === 'AbortError') {
        throw err;
      }
    }

    return null;
  };

  const prefillFeatureOverview = async (cardId: string, atomId: string) => {
    const controller = new AbortController();
    registerPrefillController(atomId, controller);
    updateAtomSettings(atomId, {
      isLoading: true,
      loadingMessage: 'Loading',
      loadingStatus: 'Fetching flight table',
    });
    try {
      const prev = await findLatestDataSource(controller.signal);
      if (!prev || !prev.csv) {
        console.warn('⚠️ no data source found for feature overview');
        updateAtomSettings(atomId, { isLoading: false, loadingStatus: '', loadingMessage: '' });
        return;
      }
      console.log('ℹ️ prefill data source details', prev);
      await prefetchDataframe(prev.csv, controller.signal, status =>
        updateAtomSettings(atomId, { loadingStatus: status }),
      );

      let summaryDetails = {
        summary: Array.isArray(prev.summary) ? prev.summary.filter(Boolean) : [],
        numeric: Array.isArray(prev.numeric) ? prev.numeric : [],
        xField: typeof prev.xField === 'string' ? prev.xField : '',
      };

      if (summaryDetails.summary.length === 0) {
        summaryDetails = await fetchColumnSummary(prev.csv, {
          signal: controller.signal,
          statusCb: status => updateAtomSettings(atomId, { loadingStatus: status }),
          retries: 2,
        });
      }

      updateAtomSettings(atomId, { loadingStatus: 'Fetching dimension mapping' });
      const { mapping: rawMapping } = await fetchDimensionMapping({
        objectName: prev.csv,
        signal: controller.signal,
      });
      const summary = Array.isArray(summaryDetails.summary)
        ? summaryDetails.summary.filter(Boolean)
        : [];
      const summaryColumnSet = new Set(
        summary.map(col => col.column).filter(column => !!column),
      );
      const numericColumns = Array.isArray(summaryDetails.numeric)
        ? Array.from(
            new Set(summaryDetails.numeric.filter(col => summaryColumnSet.has(col))),
          )
        : [];
      const identifiers = Array.isArray(prev.identifiers)
        ? prev.identifiers.filter(Boolean)
        : [];
      const validIdentifiers = identifiers.filter(id => summaryColumnSet.has(id));
      const identifierSummary =
        validIdentifiers.length > 0
          ? summary.filter(s => validIdentifiers.includes(s.column))
          : [];
      const columnSummary = identifierSummary.length > 0 ? identifierSummary : summary;
      const selected =
        validIdentifiers.length > 0
          ? Array.from(new Set(validIdentifiers))
          : Array.from(new Set(columnSummary.map(cc => cc.column)));
      const mapping = Object.fromEntries(
        Object.entries(rawMapping)
          .filter(([key]) => key.toLowerCase() !== 'unattributed')
          .map(([dimension, cols]) => {
            const values = Array.isArray(cols)
              ? Array.from(new Set(cols.filter(col => summaryColumnSet.has(col))))
              : [];
            return [dimension, values];
          })
          .filter(([, cols]) => cols.length > 0),
      );
      console.log('✅ pre-filling feature overview with', prev.csv);

      updateAtomSettings(atomId, { loadingStatus: 'Preparing feature overview' });
      updateAtomSettings(atomId, {
        dataSource: prev.csv,
        csvDisplay: prev.display || prev.csv,
        allColumns: summary,
        columnSummary,
        selectedColumns: selected,
        numericColumns,
        dimensionMap: mapping,
        xAxis: summaryDetails.xField || prev.xField || 'date',
        isLoading: false,
        loadingStatus: '',
        loadingMessage: '',
      });
    } catch (err) {
      if ((err as any)?.name === 'AbortError') {
        console.log('ℹ️ prefill feature overview aborted');
      } else {
        console.error('⚠️ prefill feature overview error', err);
      }
      updateAtomSettings(atomId, { isLoading: false, loadingStatus: '', loadingMessage: '' });
    } finally {
      cancelPrefillController(atomId);
    }
  };

  const prefillColumnClassifier = async (atomId: string) => {
    const quotes = [
      'To deny our own impulses is to deny the very thing that makes us human. Select the file in properties if you want to exercise choice.',
      'Working the Trinity Magic!',
      'Choice is an illusion created between those with power and those without',
      'Choice. The problem is choice',
    ];
    let quoteIndex = 1;
    const showQuote = () => {
      toast({ title: quotes[quoteIndex % quotes.length] });
      quoteIndex++;
    };
    const controller = new AbortController();
    registerPrefillController(atomId, controller);
    updateAtomSettings(atomId, {
      isLoading: true,
      loadingMessage: quotes[0],
      loadingStatus: 'Fetching flight table',
    });
    showQuote();
    const quoteTimer = setInterval(showQuote, 5000);

    try {
      const prev = await findLatestDataSource(controller.signal);
      if (!prev || !prev.csv) {
        console.warn('⚠️ no dataframe found for column classifier');
        updateAtomSettings(atomId, {
          isLoading: false,
          loadingStatus: '',
          loadingMessage: '',
        });
        return;
      }
      console.log('ℹ️ prefill column classifier with', prev.csv);
      await prefetchDataframe(prev.csv, controller.signal, status =>
        updateAtomSettings(atomId, { loadingStatus: status }),
      );
      const form = new FormData();
      form.append('dataframe', prev.csv);
      updateAtomSettings(atomId, { loadingStatus: 'Classifying Dataframe' });
      const res = await fetch(`${CLASSIFIER_API}/classify_columns`, {
        method: 'POST',
        body: form,
        credentials: 'include',
        signal: controller.signal,
      });
      if (!res.ok) {
        console.warn('⚠️ auto classification failed', res.status);
        updateAtomSettings(atomId, {
          isLoading: false,
          loadingStatus: '',
          loadingMessage: '',
        });
        return;
      }
      const data = await res.json();
      const columns: ColumnClassifierColumn[] = [
        ...data.final_classification.identifiers.map((name: string) => ({
          name,
          category: 'identifiers',
        })),
        ...data.final_classification.measures.map((name: string) => ({
          name,
          category: 'measures',
        })),
        ...data.final_classification.unclassified.map((name: string) => ({
          name,
          category: 'unclassified',
        })),
      ];
      updateAtomSettings(atomId, {
        validatorId: prev.csv,
        assignments: {},
        data: {
          files: [
            {
              fileName: prev.csv,
              columns,
              customDimensions: {},
            },
          ],
          activeFileIndex: 0,
        },
        isLoading: false,
        loadingStatus: '',
        loadingMessage: '',
      });
      toast({ title: 'Success! We are still here!' });
    } catch (err) {
      if ((err as any)?.name === 'AbortError') {
        console.log('ℹ️ prefill column classifier aborted');
      } else {
        console.error('⚠️ prefill column classifier error', err);
      }
      updateAtomSettings(atomId, { isLoading: false, loadingStatus: '', loadingMessage: '' });
    } finally {
      clearInterval(quoteTimer);
      cancelPrefillController(atomId);
    }
  };

  const prefillScopeSelector = async (atomId: string) => {
    const prev = await findLatestDataSource();
    if (!prev || !prev.csv) {
      console.warn('⚠️ no data source found for scope selector');
      return;
    }
    await prefetchDataframe(prev.csv);
    const { mapping: rawMapping } = await fetchDimensionMapping({ objectName: prev.csv });
    const identifiers = Object.entries(rawMapping || {})
      .filter(
        ([k]) =>
          k.toLowerCase() !== 'unattributed' &&
          k.toLowerCase() !== 'unattributed_dimensions'
      )
      .flatMap(([, v]) => v)
      .filter(Boolean);
    let allColumns = Array.isArray(prev.summary) ? prev.summary.filter(Boolean) : [];
    if (allColumns.length === 0) {
      const fetched = await fetchColumnSummary(prev.csv, { retries: 1 });
      allColumns = Array.isArray(fetched.summary) ? fetched.summary.filter(Boolean) : [];
    }
    const allCats = allColumns
      .filter(col => {
        const dataType = col.data_type?.toLowerCase() || '';
        return (dataType === 'object' || dataType === 'category') && col.column;
      })
      .map(col => col.column);
    const selected = identifiers.filter(id => allCats.includes(id));
    console.log('✅ pre-filling scope selector with', prev.csv);
    updateAtomSettings(atomId, {
      dataSource: prev.csv,
      allColumns,
      availableIdentifiers: allCats,
      selectedIdentifiers: selected,
    });
  };

  // Load saved layout and workflow rendering
  useEffect(() => {
    let initialCards: LayoutCard[] | null = null;
    let initialWorkflow: WorkflowMolecule[] | undefined;
    let isMounted = true;
    // Removed hasAppliedInitialCards flag to prevent blocking subsequent data loads
    let hasPendingAsyncLoad = false;

    const markLoadingComplete = () => {
      if (!isMounted) {
        return;
      }
      setIsCanvasLoading(false);
    };

    const applyInitialCards = (
      cards: LayoutCard[] | null | undefined,
      workflowOverride?: WorkflowMolecule[],
    ) => {
      if (!isMounted) {
        return;
      }

      console.log('[Laboratory API] applyInitialCards called with:', {
        cardsCount: cards?.length || 0,
        workflowOverrideCount: workflowOverride?.length || 0,
        cards: cards
      });

      const normalizedCards = Array.isArray(cards) ? cards : [];
      console.log('[Laboratory API] Normalized cards:', normalizedCards);
      
      // Debug: Check molecule info in cards
      const cardsWithMoleculeInfo = normalizedCards.filter(card => card.moleculeId);
      const cardsWithoutMoleculeInfo = normalizedCards.filter(card => !card.moleculeId);
      console.log('[Laboratory API] Cards with molecule info:', cardsWithMoleculeInfo.length);
      console.log('[Laboratory API] Cards without molecule info (standalone):', cardsWithoutMoleculeInfo.length);
      
      if (cardsWithoutMoleculeInfo.length > 0) {
        console.log('[Laboratory API] Standalone cards (no moleculeId):', cardsWithoutMoleculeInfo.map(c => ({ 
          id: c.id, 
          atomId: c.atoms[0]?.atomId,
          position: c.position 
        })));
      }
      
      // Only try to fetch molecule info from MongoDB if:
      // 1. We have cards without moleculeId (potential standalone or legacy cards)
      // 2. AND we also have cards with moleculeId (mixed state - might need to merge)
      // 3. BUT if ALL cards are standalone (no moleculeId), preserve them as-is
      if (cardsWithoutMoleculeInfo.length > 0 && cardsWithMoleculeInfo.length > 0) {
        console.log('[Laboratory API] Mixed cards detected - attempting to fetch molecule information from MongoDB for cards without molecule info');
        
        // Try to fetch molecule information from MongoDB to see if standalone cards should get moleculeId
        fetchAtomConfigurationsFromMongoDB()
          .then((mongoData) => {
            if (mongoData && mongoData.cards.length > 0) {
              console.log('[Laboratory API] Found MongoDB data with molecule info, updating cards');
              
              // Create maps for both workflow cards (with moleculeId) and standalone cards (with position)
              const mongoCardMap = new Map(); // For workflow cards (with moleculeId)
              const mongoStandaloneMap = new Map(); // For standalone cards (with position, no moleculeId)
              
              mongoData.cards.forEach(mongoCard => {
                const atomId = mongoCard.atoms[0]?.atomId;
                if (atomId) {
                  if (mongoCard.moleculeId) {
                    // Workflow card - map by atomId
                    mongoCardMap.set(atomId, mongoCard);
                  } else if (mongoCard.position !== undefined && mongoCard.position !== null) {
                    // Standalone card with position - map by atomId
                    mongoStandaloneMap.set(atomId, mongoCard);
                    console.log(`[Laboratory API] Found standalone card from MongoDB with position:`, {
                      atomId,
                      cardId: mongoCard.id,
                      position: mongoCard.position
                    });
                  }
                }
              });
              

              const updatedCards = normalizedCards.map(card => {
                const atomId = card.atoms[0]?.atomId;

                if (!card.moleculeId && atomId) {
                  // Check if this standalone card has position in MongoDB
                  if (mongoStandaloneMap.has(atomId)) {
                    const mongoCard = mongoStandaloneMap.get(atomId);
                    console.log(`[Laboratory API] Updating standalone card ${atomId} with position from MongoDB:`, {
                      position: mongoCard.position,
                      mongoCardId: mongoCard.id,
                      currentCardId: card.id
                    });
                    // Merge MongoDB card data (especially position) with current card
                    const mergedCard: any = {
                      ...card,
                      position: mongoCard.position, // Preserve position from MongoDB
                    };
                    
                    // Optionally preserve other fields if they exist
                    if ('collapsed' in mongoCard) mergedCard.collapsed = mongoCard.collapsed;
                    if ('scroll_position' in mongoCard) mergedCard.scroll_position = mongoCard.scroll_position;
                    if ('isExhibited' in mongoCard) mergedCard.isExhibited = mongoCard.isExhibited;
                    
                    return mergedCard;
                  }
                  // Check if it should get moleculeId from MongoDB
                  if (mongoCardMap.has(atomId)) {
                    const mongoCard = mongoCardMap.get(atomId);
                    console.log(`[Laboratory API] Updating standalone card ${atomId} with molecule info from MongoDB:`, {
                      moleculeId: mongoCard.moleculeId,
                      moleculeTitle: mongoCard.moleculeTitle
                    });
                    return {
                      ...card,
                      moleculeId: mongoCard.moleculeId,
                      moleculeTitle: mongoCard.moleculeTitle
                    };
                  }
                }
                // Preserve card as-is (either already has moleculeId, or is truly standalone)
                return card;
              });
              
              console.log('[Laboratory API] Updated cards with MongoDB molecule info:', updatedCards);
              
              // Use workflow molecules from MongoDB if available
              if (mongoData.workflowMolecules && mongoData.workflowMolecules.length > 0) {
                console.log('[Laboratory API] Using workflow molecules from MongoDB:', mongoData.workflowMolecules);
                workflow = mongoData.workflowMolecules;
                
                // Set cards directly - no assignment needed
                setLayoutCards(updatedCards);
              } else {
                setLayoutCards(updatedCards);
              }
            } else {
              console.log('[Laboratory API] No MongoDB data found, preserving all cards as-is (including standalone)');
              setLayoutCards(normalizedCards);
            }
          })
          .catch((error) => {
            console.error('[Laboratory API] Failed to fetch molecule info from MongoDB:', error);
            console.log('[Laboratory API] Preserving all cards as-is (including standalone)');
            setLayoutCards(normalizedCards);
          });
      } else {
        // Either all cards are with moleculeId, or all are standalone - use them as-is
        console.log('[Laboratory API] All cards are consistent (all workflow or all standalone), using as-is');
        setLayoutCards(normalizedCards);
      }
      
      // Check for saved workflowMolecules in localStorage if no override provided
      let workflow = workflowOverride;
      if (!workflow) {
        const storedWorkflowMolecules = localStorage.getItem('workflow-molecules');
        if (storedWorkflowMolecules) {
          try {
            workflow = JSON.parse(storedWorkflowMolecules);
          } catch (e) {
            console.error('Failed to parse stored workflow molecules', e);
            workflow = deriveWorkflowMolecules(normalizedCards);
          }
        } else {
          workflow = deriveWorkflowMolecules(normalizedCards);
        }
      }
      
      console.log('[Laboratory API] Setting workflow molecules:', workflow);
      
      // Debug: Compare molecule IDs between workflow molecules and cards
      const workflowMoleculeIds = workflow.map(m => m.moleculeId);
      const cardMoleculeIds = normalizedCards.map(c => c.moleculeId).filter(id => id);
      console.log('[Laboratory API] Molecule ID comparison:', {
        workflowMoleculeIds,
        cardMoleculeIds,
        match: workflowMoleculeIds.every(id => cardMoleculeIds.includes(id))
      });
      
      // No need for complex assignment - use workflow molecules directly from backend
      
      // Filter out empty molecule containers (molecules with 0 atoms)
      const validWorkflow = workflow.filter(molecule => molecule.atoms.length > 0);
      
      if (validWorkflow.length !== workflow.length) {
        console.log('[Laboratory API] Removed empty molecule containers:', 
          workflow.length - validWorkflow.length, 'empty molecules removed');
      }
      
      setWorkflowMolecules(validWorkflow);

      // Set all workflow molecules as collapsed by default
      if (validWorkflow.length > 0) {
        const initialCollapsedState: Record<string, boolean> = {};
        validWorkflow.forEach(molecule => {
          initialCollapsedState[molecule.moleculeId] = true; // true = collapsed
        });
        console.log('[Laboratory API] Setting collapsed molecules state:', initialCollapsedState);
        setCollapsedMolecules(initialCollapsedState);
      }
      
      // Set cards directly - no assignment needed as molecules are handled separately
      setLayoutCards(normalizedCards);

      markLoadingComplete();
    };

    // Check for both workflow-selected-atoms and workflow-data
    const storedAtoms = localStorage.getItem('workflow-selected-atoms');
    const storedWorkflowData = localStorage.getItem('workflow-data');
    let workflowAtoms: {
      atomName: string;
      moleculeId: string;
      moleculeTitle: string;
      order: number;
    }[] = [];

    if (storedAtoms) {
      try {
        workflowAtoms = JSON.parse(storedAtoms);

        const moleculeMap = new Map<string, WorkflowMolecule>();
        workflowAtoms.forEach(atom => {
          if (!moleculeMap.has(atom.moleculeId)) {
            moleculeMap.set(atom.moleculeId, {
              moleculeId: atom.moleculeId,
              moleculeTitle: atom.moleculeTitle,
              atoms: [],
            });
          }
          moleculeMap.get(atom.moleculeId)!.atoms.push({
            atomName: atom.atomName,
            order: atom.order,
          });
        });

        moleculeMap.forEach(molecule => {
          molecule.atoms.sort((a, b) => a.order - b.order);
        });

        const molecules = Array.from(moleculeMap.values());
        if (molecules.length > 0) {
          initialWorkflow = molecules;
        }

        const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]/g, '');
        initialCards = workflowAtoms.map(atom => {
          const atomInfo =
            allAtoms.find(
              a =>
                normalize(a.id) === normalize(atom.atomName) ||
                normalize(a.title) === normalize(atom.atomName),
            ) || ({} as any);
          const atomId = atomInfo.id || atom.atomName;
          const dropped: DroppedAtom = {
            id: `${atom.atomName}-${Date.now()}-${Math.random()}`,
            atomId,
            title: atomInfo.title || atom.atomName,
            category: atomInfo.category || 'Atom',
            color: atomInfo.color || 'bg-gray-400',
            source: 'manual',
            llm: LLM_MAP[atomId],
          };
          return {
            id: `card-${atom.atomName}-${Date.now()}-${Math.random()}`,
            atoms: [dropped],
            isExhibited: false,
            moleculeId: atom.moleculeId,
            moleculeTitle: atom.moleculeTitle,
          } as LayoutCard;
        });

        localStorage.removeItem('workflow-selected-atoms');
      } catch (e) {
        console.error('Failed to parse workflow atoms', e);
        workflowAtoms = [];
      }
    } else if (storedWorkflowData) {
      // Handle workflow-data format from handleRenderWorkflow
      try {
        const workflowData = JSON.parse(storedWorkflowData);
        console.log('Processing workflow-data:', workflowData);
        
        if (workflowData.molecules && Array.isArray(workflowData.molecules)) {
          // Convert workflow-data format to workflowAtoms format
          workflowAtoms = [];
          workflowData.molecules.forEach((molecule: any, moleculeIndex: number) => {
            if (molecule.atoms && Array.isArray(molecule.atoms)) {
              molecule.atoms.forEach((atomId: string, atomIndex: number) => {
                workflowAtoms.push({
                  atomName: atomId,
                  moleculeId: molecule.id,
                  moleculeTitle: molecule.title,
                  order: atomIndex
                });
              });
            }
          });

          const moleculeMap = new Map<string, WorkflowMolecule>();
          workflowAtoms.forEach(atom => {
            if (!moleculeMap.has(atom.moleculeId)) {
              moleculeMap.set(atom.moleculeId, {
                moleculeId: atom.moleculeId,
                moleculeTitle: atom.moleculeTitle,
                atoms: [],
              });
            }
            moleculeMap.get(atom.moleculeId)!.atoms.push({
              atomName: atom.atomName,
              order: atom.order,
            });
          });

          moleculeMap.forEach(molecule => {
            molecule.atoms.sort((a, b) => a.order - b.order);
          });

          const molecules = Array.from(moleculeMap.values());
          if (molecules.length > 0) {
            initialWorkflow = molecules;
            // Save the molecules to workflow-molecules localStorage for future switches
            localStorage.setItem('workflow-molecules', JSON.stringify(molecules));
          }

          const normalize = (s: string) => s.toLowerCase().replace(/[\s_-]/g, '');
          initialCards = workflowAtoms.map(atom => {
            const atomInfo =
              allAtoms.find(
                a =>
                  normalize(a.id) === normalize(atom.atomName) ||
                  normalize(a.title) === normalize(atom.atomName),
              ) || ({} as any);
            const atomId = atomInfo.id || atom.atomName;
            const dropped: DroppedAtom = {
              id: `${atom.atomName}-${Date.now()}-${Math.random()}`,
              atomId,
              title: atomInfo.title || atom.atomName,
              category: atomInfo.category || 'Atom',
              color: atomInfo.color || 'bg-gray-400',
              source: 'manual',
              llm: LLM_MAP[atomId],
            };
            return {
              id: `card-${atom.atomName}-${Date.now()}-${Math.random()}`,
              atoms: [dropped],
              isExhibited: false,
              moleculeId: atom.moleculeId,
              moleculeTitle: atom.moleculeTitle,
            } as LayoutCard;
          });

          localStorage.removeItem('workflow-data');
        }
      } catch (e) {
        console.error('Failed to parse workflow-data', e);
        localStorage.removeItem('workflow-data');
      }
    }

    if (!workflowAtoms.length) {
      const storedLayout = localStorage.getItem(STORAGE_KEY);
      if (storedLayout && storedLayout !== 'undefined') {
        try {
          const raw = JSON.parse(storedLayout);
          initialCards = hydrateLayoutCards(raw);
        } catch (e) {
          console.error('Failed to parse stored laboratory layout', e);
          localStorage.removeItem(STORAGE_KEY);
        }
      } else {
        const current = localStorage.getItem('current-project');
        if (current) {
          let projectId: string | undefined;
          try {
            projectId = JSON.parse(current).id;
          } catch {
            projectId = undefined;
          }

          if (projectId) {
            hasPendingAsyncLoad = true;
            fetch(`${REGISTRY_API}/projects/${projectId}/`, { credentials: 'include' })
              .then(res => (res.ok ? res.json() : null))
              .then(async data => {
                if (!data || !isMounted) {
                  return;
                }

                if (data.environment) {
                  try {
                    const env = data.environment || {};
                    await fetchDimensionMapping();
                  } catch (err) {
                    console.warn('config prefetch failed', err);
                    localStorage.removeItem('column-classifier-config');
                  }
                }

                if (data.state && data.state.laboratory_config) {
                  const cfg = sanitizeLabConfig(data.state.laboratory_config);
                  const cached = persistLaboratoryConfig(cfg);
                  if (!cached) {
                    console.warn('Storage quota exceeded while caching laboratory config from registry.');
                  }
                  if (!storedAtoms && data.state.workflow_selected_atoms) {
                    localStorage.setItem(
                      'workflow-selected-atoms',
                      safeStringify(data.state.workflow_selected_atoms),
                    );
                  }

                  // Check for workflowMolecules in the project state
                  if (data.state.workflowMolecules && Array.isArray(data.state.workflowMolecules)) {
                    localStorage.setItem('workflow-molecules', safeStringify(data.state.workflowMolecules));
                  }

                  const cardsFromConfig = hydrateLayoutCards(cfg.cards);
                  // Check for workflowMolecules in the project state before applying cards
                  let projectWorkflow = initialWorkflow;
                  if (data.state.workflowMolecules && Array.isArray(data.state.workflowMolecules) && !projectWorkflow) {
                    projectWorkflow = data.state.workflowMolecules;
                  }
                  applyInitialCards(cardsFromConfig, projectWorkflow);
                }
              })
              .catch(() => {
                /* ignore load failures */
              })
              .finally(() => {
                // Always try MongoDB as fallback if project registry fetch failed or returned no data
                console.info('[Laboratory API] Project registry fetch completed, checking MongoDB as fallback');
                fetchAtomConfigurationsFromMongoDB()
                  .then((mongoData) => {
                    if (mongoData && mongoData.cards.length > 0) {
                      console.info('[Laboratory API] Successfully loaded atom configurations from MongoDB fallback');
                      applyInitialCards(mongoData.cards, mongoData.workflowMolecules);
                    } else {
                      console.info('[Laboratory API] No atom configurations found in MongoDB fallback');
                      markLoadingComplete();
                    }
                  })
                  .catch((error) => {
                    console.error('[Laboratory API] Failed to fetch from MongoDB fallback', error);
                    markLoadingComplete();
                  });
              });
          }
        }
      }
    }

    if (initialCards) {
      // If no initialWorkflow was set from workflow atoms/data, check for saved workflow molecules
      if (!initialWorkflow) {
        const storedWorkflowMolecules = localStorage.getItem('workflow-molecules');
        if (storedWorkflowMolecules) {
          try {
            initialWorkflow = JSON.parse(storedWorkflowMolecules);
          } catch (e) {
            console.error('Failed to parse stored workflow molecules during layout load', e);
          }
        }
      }
      // Always fetch from MongoDB first (skip localStorage molecule info check)
      console.info('[Laboratory API] Fetching data directly from MongoDB (skipping localStorage molecule info check)');
      fetchAtomConfigurationsFromMongoDB()
        .then((mongoData) => {
          if (mongoData && mongoData.cards.length > 0) {
            console.info('[Laboratory API] Found MongoDB data, using it instead of localStorage');
            applyInitialCards(mongoData.cards, mongoData.workflowMolecules);
          } else {
            console.info('[Laboratory API] No MongoDB data found, using localStorage data as fallback');
            applyInitialCards(initialCards, initialWorkflow);
          }
        })
        .catch((error) => {
          console.error('[Laboratory API] MongoDB fetch failed, using localStorage data as fallback', error);
          applyInitialCards(initialCards, initialWorkflow);
        });
    } else if (!hasPendingAsyncLoad) {
      // Even if no initialCards, check if we need to restore workflow molecules from saved layout
      const storedLayout = localStorage.getItem(STORAGE_KEY);
      const storedWorkflowMolecules = localStorage.getItem('workflow-molecules');
      
      if (storedLayout && storedLayout !== 'undefined') {
        try {
          const raw = JSON.parse(storedLayout);
          const layoutCards = hydrateLayoutCards(raw);
          let workflowMolecules: WorkflowMolecule[] | undefined;
          
          if (storedWorkflowMolecules) {
            try {
              workflowMolecules = JSON.parse(storedWorkflowMolecules);
            } catch (e) {
              console.warn('Failed to parse stored workflow molecules', e);
            }
          }
          
          // Load cards even if there are no workflow molecules (for standalone atoms)
          if (layoutCards && layoutCards.length > 0) {
            console.log('[Laboratory API] Loading cards from localStorage:', {
              cardsCount: layoutCards.length,
              standaloneCards: layoutCards.filter(c => !c.moleculeId).length,
              workflowCards: layoutCards.filter(c => c.moleculeId).length,
              hasWorkflowMolecules: !!workflowMolecules
            });
            applyInitialCards(layoutCards, workflowMolecules);
          } else {
            markLoadingComplete();
          }
        } catch (e) {
          console.error('Failed to parse stored layout or workflow molecules', e);
          markLoadingComplete();
        }
      } else {
        // If no local storage data, try to fetch from MongoDB as a fallback
        console.info('[Laboratory API] No local storage data found, attempting to fetch from MongoDB');
        console.log('[Laboratory API] Current project context:', getActiveProjectContext());
        fetchAtomConfigurationsFromMongoDB()
          .then((mongoData) => {
            console.log('[Laboratory API] MongoDB fetch result:', mongoData);
            if (mongoData && mongoData.cards.length > 0) {
              console.info('[Laboratory API] Successfully loaded atom configurations from MongoDB');
              console.log('[Laboratory API] Cards to apply:', mongoData.cards);
              console.log('[Laboratory API] Workflow molecules to apply:', mongoData.workflowMolecules);
              applyInitialCards(mongoData.cards, mongoData.workflowMolecules);
            } else {
              console.info('[Laboratory API] No atom configurations found in MongoDB');
              markLoadingComplete();
            }
          })
          .catch((error) => {
            console.error('[Laboratory API] Failed to fetch from MongoDB, falling back to empty state', error);
            markLoadingComplete();
          });
      }
    }

    return () => {
      isMounted = false;
    };
  }, []);


  useEffect(() => {
    if (!isCanvasLoading) {
      return;
    }

    if (typeof window === 'undefined' || loadingMessages.length <= 1) {
      return;
    }

    const interval = window.setInterval(() => {
      setLoadingMessageIndex(prev => (prev + 1) % loadingMessages.length);
    }, 2200);

    return () => {
      window.clearInterval(interval);
    };
  }, [isCanvasLoading, loadingMessages]);

  useEffect(() => {
    if (!isCanvasLoading) {
      setLoadingMessageIndex(0);
    }
  }, [isCanvasLoading]);

  // Persist layout to localStorage safely and store undo snapshot
  useEffect(() => {
    if (initialLoad.current) {
      prevLayout.current = Array.isArray(layoutCards)
        ? layoutCards.map(c => ({ ...c, atoms: [...c.atoms] }))
        : [];
      initialLoad.current = false;
    } else if (prevLayout.current) {
      const current = localStorage.getItem('current-project');
      if (current) {
        try {
          const proj = JSON.parse(current);
          // Include workflowMolecules in the state being saved
          const stateWithMolecules = {
            ...prevLayout.current,
            workflowMolecules: workflowMolecules
          };
          fetch(`${LAB_ACTIONS_API}/`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project: proj.id, state: stateWithMolecules }),
          }).catch(() => {});
        } catch {
          /* ignore */
        }
      }
      prevLayout.current = Array.isArray(layoutCards)
        ? layoutCards.map(c => ({ ...c, atoms: [...c.atoms] }))
        : [];
    }
  }, [layoutCards, workflowMolecules]);

  // Sync cards with exhibition store
  useEffect(() => {
    setCards(layoutCards);
  }, [layoutCards, setCards]);

  // Persist workflowMolecules to localStorage only when we have cards with molecule info
  useEffect(() => {
    const hasCardsWithMoleculeId = Array.isArray(layoutCards) && 
      layoutCards.some(card => card.moleculeId);
    
    if (workflowMolecules.length > 0 && hasCardsWithMoleculeId) {
      localStorage.setItem('workflow-molecules', JSON.stringify(workflowMolecules));
    } else if (!hasCardsWithMoleculeId && workflowMolecules.length === 0) {
      // Clear workflow molecules from localStorage when in regular laboratory mode
      localStorage.removeItem('workflow-molecules');
    }
  }, [workflowMolecules, layoutCards]);

  // Ensure workflow molecules are restored when layout cards exist but workflow molecules are missing
  useEffect(() => {
    // Only run after initial loading is complete
    if (isCanvasLoading) return;
    
    // Check if we have layout cards but no workflow molecules
    const hasCardsWithMoleculeId = Array.isArray(layoutCards) && 
      layoutCards.some(card => card.moleculeId);
    
    if (hasCardsWithMoleculeId && workflowMolecules.length === 0) {
      // Try to restore workflow molecules from localStorage
      const storedWorkflowMolecules = localStorage.getItem('workflow-molecules');
      if (storedWorkflowMolecules) {
        try {
          const molecules = JSON.parse(storedWorkflowMolecules);
          if (Array.isArray(molecules) && molecules.length > 0) {
            setWorkflowMolecules(molecules);
            
            // Set collapsed state for restored molecules
            const initialCollapsedState: Record<string, boolean> = {};
            molecules.forEach((molecule: any) => {
              initialCollapsedState[molecule.moleculeId] = true; // collapsed by default
            });
            setCollapsedMolecules(initialCollapsedState);
          }
        } catch (e) {
          console.error('Failed to restore workflow molecules from localStorage:', e);
        }
      }
    }
  }, [layoutCards, workflowMolecules, isCanvasLoading]);

  const handleDragOver = (e: React.DragEvent, cardId: string) => {
    e.preventDefault();
    setDragOver(cardId);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(null);
  };

  const handleDrop = (e: React.DragEvent, cardId: string) => {
    e.preventDefault();
    setDragOver(null);
    
    const atomData = e.dataTransfer.getData('application/json');
    if (atomData) {
      const atom = JSON.parse(atomData);
      const info = allAtoms.find(a => a.id === atom.id);

      const newAtom: DroppedAtom = {
        id: `${atom.id}-${Date.now()}`,
        atomId: atom.id,
        title: info?.title || atom.title || atom.id,
        category: info?.category || atom.category || 'Atom',
        color: info?.color || atom.color || 'bg-gray-400',
        source: 'manual',
        llm: LLM_MAP[atom.id],
        settings:
          atom.id === 'text-box'
            ? { ...DEFAULT_TEXTBOX_SETTINGS }
            : atom.id === 'data-upload-validate'
            ? createDefaultDataUploadSettings()
            : atom.id === 'feature-overview'
            ? { ...DEFAULT_FEATURE_OVERVIEW_SETTINGS }
            : atom.id === 'explore'
            ? { data: { ...DEFAULT_EXPLORE_DATA }, settings: { ...DEFAULT_EXPLORE_SETTINGS } }
            : atom.id === 'chart-maker'
            ? { ...DEFAULT_CHART_MAKER_SETTINGS }
            : atom.id === 'dataframe-operations'
            ? { ...DEFAULT_DATAFRAME_OPERATIONS_SETTINGS }
            : atom.id === 'select-models-feature'
            ? { ...DEFAULT_SELECT_MODELS_FEATURE_SETTINGS }
            : atom.id === 'auto-regressive-models'
            ? { data: { ...DEFAULT_AUTO_REGRESSIVE_MODELS_DATA }, settings: { ...DEFAULT_AUTO_REGRESSIVE_MODELS_SETTINGS } }
            : undefined,
      };
      
      // Find the card to get its moleculeId and current atom count
      const card = (Array.isArray(layoutCards) ? layoutCards : []).find(c => c.id === cardId);
      
      // Calculate position accounting for existing workflow molecule atoms
      let atomPosition = card?.atoms ? card.atoms.length : 0;
      
      // If card belongs to a molecule, map position to workflow molecule's atom array
      if (card?.moleculeId) {
        const workflowMolecule = workflowMolecules.find(m => m.moleculeId === card.moleculeId);
        if (workflowMolecule) {
          // Get ALL cards belonging to this molecule (a molecule can have multiple cards)
          const moleculeCards = (Array.isArray(layoutCards) ? layoutCards : [])
            .filter(c => c.moleculeId === card.moleculeId);
          
          // Collect ALL atoms from ALL cards in this molecule, maintaining card order
          const allMoleculeAtomIds: string[] = [];
          moleculeCards.forEach(moleculeCard => {
            moleculeCard.atoms.forEach(atom => {
              allMoleculeAtomIds.push(atom.atomId);
            });
          });
          
          // Get workflow molecule atom IDs
          const workflowAtomIds = workflowMolecule.atoms.map(a => typeof a === 'string' ? a : a.atomName);
          
          // Find where this card's atoms start in the full molecule atom array
          let cardStartIndex = 0;
          for (let i = 0; i < moleculeCards.length; i++) {
            if (moleculeCards[i].id === card.id) {
              break;
            }
            cardStartIndex += moleculeCards[i].atoms.length;
          }
          
          // Position in full molecule atom array = card start index + atom position in card
          const fullMoleculePosition = cardStartIndex + atomPosition;
          
          // Calculate how many atoms before the insertion point exist in the workflow molecule
          const atomsBeforeInsert = allMoleculeAtomIds.slice(0, fullMoleculePosition);
          const existingAtomsCount = atomsBeforeInsert.filter(atomId => workflowAtomIds.includes(atomId)).length;
          
          // Position in workflow molecule = existing atoms count
          atomPosition = existingAtomsCount;
          
          console.log(`📝 Position calculation for ${newAtom.atomId}: card index=${atomPosition}, card start in molecule=${cardStartIndex}, full molecule position=${fullMoleculePosition}, workflow position=${atomPosition}, existing workflow atoms=${workflowAtomIds.length}`);
        }
      }
      
      setLayoutCards(
        (Array.isArray(layoutCards) ? layoutCards : []).map(card =>
          card.id === cardId
            ? { ...card, atoms: [...card.atoms, newAtom] }
            : card
        )
      );

      // Track atom addition for cross-collection sync if card belongs to a molecule
      if (card?.moleculeId) {
        setPendingChanges(prev => ({
          ...prev,
          addedAtoms: [...prev.addedAtoms, { 
            moleculeId: card.moleculeId, 
            atomId: newAtom.atomId,
            position: atomPosition
          }]
        }));
        console.log(`📝 Tracked atom addition: ${newAtom.atomId} to molecule ${card.moleculeId} at position ${atomPosition} (will sync on save)`);
      }

      if (atom.id === 'feature-overview') {
        prefillFeatureOverview(cardId, newAtom.id);
      } else if (atom.id === 'column-classifier') {
        prefillColumnClassifier(newAtom.id);
      } else if (atom.id === 'scope-selector') {
        prefillScopeSelector(newAtom.id);
      }
    }
  };

const addNewCard = (moleculeId?: string, position?: number) => {
  const info = moleculeId ? molecules.find(m => m.id === moleculeId) : undefined;
  const newCard: LayoutCard = {
    id: generateClientId('card'),
    atoms: [],
    isExhibited: false,
    moleculeId,
    moleculeTitle: info?.title,
    position: moleculeId ? undefined : position, // Set position for standalone cards
  };
  
    const arr = Array.isArray(layoutCards) ? layoutCards : [];
  
  // For standalone cards with a position value, find the correct insertion index
  if (!moleculeId && position !== undefined) {
    // Find the insertion index by counting cards that should come before this position
    let insertIndex = arr.length; // Default to end
    
    for (let i = 0; i < arr.length; i++) {
      const card = arr[i];
      // If this card is a standalone with a position greater than new card's position
      if (!card.moleculeId && typeof card.position === 'number' && card.position > position) {
        insertIndex = i;
        break;
      }
      // If this card is in a molecule and new card should come before molecules
      if (card.moleculeId && position < 0) {
        insertIndex = i;
        break;
      }
    }
    
    setLayoutCards([
      ...arr.slice(0, insertIndex),
      newCard,
      ...arr.slice(insertIndex),
    ]);
  } else if (position === undefined || position >= arr.length) {
    setLayoutCards([...arr, newCard]);
  } else {
    // For cards in molecules or integer positions, use position as array index
    const insertIndex = Math.floor(position);
    setLayoutCards([
      ...arr.slice(0, insertIndex),
      newCard,
      ...arr.slice(insertIndex),
    ]);
  }
  
  setCollapsedCards(prev => ({ ...prev, [newCard.id]: false }));

  // Scroll to the newly created card after a short delay to ensure it's rendered
  setTimeout(() => {
    const cardElement = document.querySelector(`[data-card-id="${newCard.id}"]`);
    if (cardElement) {
      cardElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, 100);
};

type AtomPayload = Partial<DroppedAtom> & {
  atomId?: string;
  settings?: any;
  source?: 'ai' | 'manual';
  llm?: string;
};

type CardPayload = Partial<Omit<LayoutCard, 'atoms'>> & {
  atoms?: AtomPayload[];
};

function generateClientId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  const random = Math.random().toString(36).slice(2);
  return `${prefix}-${Date.now()}-${random}`;
}

const getDefaultSettingsForAtom = (atomId: string) => {
  switch (atomId) {
    case 'text-box':
      return { ...DEFAULT_TEXTBOX_SETTINGS };
    case 'data-upload-validate':
      return createDefaultDataUploadSettings();
    case 'feature-overview':
      return { ...DEFAULT_FEATURE_OVERVIEW_SETTINGS };
    case 'explore':
      return { data: { ...DEFAULT_EXPLORE_DATA }, settings: { ...DEFAULT_EXPLORE_SETTINGS } };
    case 'chart-maker':
      return { ...DEFAULT_CHART_MAKER_SETTINGS };
    case 'dataframe-operations':
      return { ...DEFAULT_DATAFRAME_OPERATIONS_SETTINGS };
    case 'select-models-feature':
      return { ...DEFAULT_SELECT_MODELS_FEATURE_SETTINGS };
    case 'auto-regressive-models':
      return {
        data: { ...DEFAULT_AUTO_REGRESSIVE_MODELS_DATA },
        settings: { ...DEFAULT_AUTO_REGRESSIVE_MODELS_SETTINGS },
      };
    default:
      return undefined;
  }
};

const buildAtomFromApiPayload = (fallbackAtomId: string, payload?: AtomPayload): DroppedAtom => {
  const resolvedAtomId = payload?.atomId ?? fallbackAtomId;
  const atomInfo = allAtoms.find(a => a.id === resolvedAtomId);
  return {
    id: payload?.id ?? generateClientId(resolvedAtomId),
    atomId: resolvedAtomId,
    title: payload?.title ?? atomInfo?.title ?? resolvedAtomId,
    category: payload?.category ?? atomInfo?.category ?? 'Atom',
    color: payload?.color ?? atomInfo?.color ?? 'bg-gray-400',
    source: payload?.source ?? 'manual',
    llm: payload?.llm ?? LLM_MAP[resolvedAtomId],
    settings: payload?.settings ?? getDefaultSettingsForAtom(resolvedAtomId),
  };
};

const buildCardFromApiPayload = (
  payload: CardPayload | null | undefined,
  fallbackAtomId: string,
  fallbackMoleculeId?: string,
): LayoutCard => {
  const cardId = payload?.id ?? generateClientId('card');
  const atomsPayload =
    payload?.atoms && Array.isArray(payload.atoms) && payload.atoms.length > 0
      ? payload.atoms
      : [{ atomId: fallbackAtomId }];
  const atoms = atomsPayload.map(atom => buildAtomFromApiPayload(atom.atomId ?? fallbackAtomId, atom));
  const moleculeId = payload?.moleculeId ?? fallbackMoleculeId;
  const moleculeInfo = moleculeId ? molecules.find(m => m.id === moleculeId) : undefined;

  return {
    id: cardId,
    atoms,
    isExhibited: Boolean(payload?.isExhibited),
    moleculeId,
    moleculeTitle: payload?.moleculeTitle ?? moleculeInfo?.title,
  };
};

const prefillAtomIfRequired = (cardId: string, atom: DroppedAtom) => {
  if (atom.atomId === 'feature-overview') {
    void prefillFeatureOverview(cardId, atom.id);
  } else if (atom.atomId === 'column-classifier') {
    void prefillColumnClassifier(atom.id);
  } else if (atom.atomId === 'scope-selector') {
    void prefillScopeSelector(atom.id);
  }
};

const createFallbackCard = (atomId: string, moleculeId?: string): LayoutCard => {
  const cardInfo = moleculeId ? molecules.find(m => m.id === moleculeId) : undefined;
  const fallbackAtom = buildAtomFromApiPayload(atomId, {
    atomId,
    source: 'manual',
  });
  return {
    id: generateClientId('card'),
    atoms: [fallbackAtom],
    isExhibited: false,
    moleculeId,
    moleculeTitle: cardInfo?.title,
  };
};

const addNewCardWithAtom = async (
  atomId: string,
  moleculeId?: string,
  position?: number
) => {
  const arr = Array.isArray(layoutCards) ? layoutCards : [];
  const insertIndex =
    position === undefined || position >= arr.length ? arr.length : position;

  try {
    if (typeof window !== 'undefined') {
      console.info('[Laboratory API] Creating card', {
        endpoint: `${LABORATORY_API}/cards`,
        origin: window.location.origin,
        payload: { atomId, moleculeId },
      });
    }

    const response = await fetch(`${LABORATORY_API}/cards`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ atomId, moleculeId }),
    });
    if (!response.ok) {
      if (typeof window !== 'undefined') {
        console.error('[Laboratory API] Create card request failed', {
          endpoint: `${LABORATORY_API}/cards`,
          status: response.status,
          statusText: response.statusText,
        });
      }
      throw new Error(`Request failed with status ${response.status}`);
    }
    const payload = (await response.json()) as CardPayload;
    const newCard = buildCardFromApiPayload(payload, atomId, moleculeId);
    setLayoutCards([
      ...arr.slice(0, insertIndex),
      newCard,
      ...arr.slice(insertIndex),
    ]);
    setCollapsedCards(prev => ({ ...prev, [newCard.id]: false }));
    newCard.atoms.forEach(atom => prefillAtomIfRequired(newCard.id, atom));
  } catch (err) {
    console.error('⚠️ Failed to create laboratory card via API, using fallback', err);
    toast({
      title: 'Unable to reach laboratory service',
      description: 'Using local defaults for the new card. Please verify your network connection.',
      variant: 'destructive',
    });
    const fallbackCard = createFallbackCard(atomId, moleculeId);
    setLayoutCards([
      ...arr.slice(0, insertIndex),
      fallbackCard,
      ...arr.slice(insertIndex),
    ]);
    setCollapsedCards(prev => ({ ...prev, [fallbackCard.id]: false }));
    fallbackCard.atoms.forEach(atom => prefillAtomIfRequired(fallbackCard.id, atom));
  }
};

const handleDropNewCard = async (
  e: React.DragEvent,
  moleculeId?: string,
  position?: number
) => {
  e.preventDefault();
  setDragOver(null);
  setAddDragTarget(null);
  const atomData = e.dataTransfer.getData('application/json');
  if (!atomData) return;
  const atom = JSON.parse(atomData);
  if (!atom?.id) return;
  await addNewCardWithAtom(atom.id, moleculeId, position);
};


const handleAddDragEnter = (e: React.DragEvent, targetId: string) => {
  e.preventDefault();
  setAddDragTarget(targetId);
};

const handleAddDragLeave = (e: React.DragEvent) => {
  e.preventDefault();
  setAddDragTarget(null);
};

// Card reordering handlers
const handleCardDragStart = (e: React.DragEvent, cardId: string) => {
  if (!canEdit) return;
  setDraggedCardId(cardId);
  e.dataTransfer.setData('text/plain', ''); // Required for drag to work
  e.dataTransfer.effectAllowed = 'move';
};

const handleCardDragOver = (e: React.DragEvent, targetCardId: string) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  setDragOverCardId(targetCardId);
};

const handleCardDragLeave = (e: React.DragEvent) => {
  e.preventDefault();
  setDragOverCardId(null);
};

const handleCardDrop = (e: React.DragEvent, targetCardId: string) => {
  e.preventDefault();
  setDragOverCardId(null);
  
  if (!draggedCardId || draggedCardId === targetCardId) {
    setDraggedCardId(null);
    return;
  }
  
  const arr = Array.isArray(layoutCards) ? layoutCards : [];
  const draggedIndex = arr.findIndex(card => card.id === draggedCardId);
  const targetIndex = arr.findIndex(card => card.id === targetCardId);
  
  if (draggedIndex === -1 || targetIndex === -1) {
    setDraggedCardId(null);
    return;
  }
  
  // Reorder cards
  const newCards = [...arr];
  const [draggedCard] = newCards.splice(draggedIndex, 1);
  newCards.splice(targetIndex, 0, draggedCard);
  
  setLayoutCards(newCards);
  setCards(newCards);
  setDraggedCardId(null);
};

// Molecule reordering handlers
const handleMoleculeDragStart = (e: React.DragEvent, moleculeId: string) => {
  if (!canEdit) return;
  setDraggedMoleculeId(moleculeId);
  e.dataTransfer.setData('text/plain', ''); // Required for drag to work
  e.dataTransfer.effectAllowed = 'move';
};

const handleMoleculeDragOver = (e: React.DragEvent, targetMoleculeId: string) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  setDragOverMoleculeId(targetMoleculeId);
};

const handleMoleculeDragLeave = (e: React.DragEvent) => {
  e.preventDefault();
  setDragOverMoleculeId(null);
};

const handleMoleculeDrop = (e: React.DragEvent, targetMoleculeId: string) => {
  e.preventDefault();
  setDragOverMoleculeId(null);
  
  if (!draggedMoleculeId || draggedMoleculeId === targetMoleculeId) {
    setDraggedMoleculeId(null);
    return;
  }
  
  const arr = [...workflowMolecules];
  const draggedIndex = arr.findIndex(mol => mol.moleculeId === draggedMoleculeId);
  const targetIndex = arr.findIndex(mol => mol.moleculeId === targetMoleculeId);
  
  if (draggedIndex === -1 || targetIndex === -1) {
    setDraggedMoleculeId(null);
    return;
  }
  
  // Reorder molecules
  const newMolecules = [...arr];
  const [draggedMolecule] = newMolecules.splice(draggedIndex, 1);
  newMolecules.splice(targetIndex, 0, draggedMolecule);
  
  setWorkflowMolecules(newMolecules);
  // Update localStorage
  localStorage.setItem('workflow-molecules', JSON.stringify(newMolecules));
  setDraggedMoleculeId(null);
};

  const removeAtom = (cardId: string, atomId: string) => {
    const arr = Array.isArray(layoutCards) ? layoutCards : [];
    const card = arr.find(c => c.id === cardId);
    const atom = card?.atoms.find(a => a.id === atomId);
    if (atom?.atomId === 'data-upload-validate') {
      const vid = (atom.settings as DataUploadSettings)?.validatorId;
      if (vid) {
        fetch(`${VALIDATE_API}/delete_validator_atom/${vid}`, { method: 'DELETE' }).catch(() => {});
      }
    }
    setLayoutCards(
      arr.map(c =>
        c.id === cardId ? { ...c, atoms: c.atoms.filter(a => a.id !== atomId) } : c
      )
    );
    
    // Track atom deletion for cross-collection sync
    if (card?.moleculeId && atom) {
      const deletionRecord = { 
        moleculeId: card.moleculeId, 
        atomId: atom.atomId // Use atom type (e.g., "text-box") not internal ID
      };
      
      setPendingChanges(prev => ({
        ...prev,
        deletedAtoms: [...prev.deletedAtoms, deletionRecord]
      }));
      
      console.log(`📝 Tracked atom deletion:`, deletionRecord);
      console.log(`📝 Atom details:`, { 
        internalId: atomId, 
        atomType: atom.atomId, 
        title: atom.title,
        moleculeId: card.moleculeId,
        moleculeTitle: card.moleculeTitle 
      });
    }
  };


  const normalizeName = (s: string) => s.toLowerCase().replace(/[\s_-]/g, '');
  const aliasMap: Record<string, string> = {
    concatenate: 'concat',
  };

  const addAtomByName = (cardId: string, atomName: string) => {
    let norm = normalizeName(atomName);
    norm = aliasMap[norm] || norm;
    const info = allAtoms.find(
      a => normalizeName(a.id) === norm || normalizeName(a.title) === norm
    );
    if (!info) return;
    const newAtom = buildAtomFromApiPayload(info.id, {
      atomId: info.id,
      source: 'ai',
    });
    
    // Find the card to get its moleculeId and current atom count
    const card = (Array.isArray(layoutCards) ? layoutCards : []).find(c => c.id === cardId);
    
    // Calculate position accounting for existing workflow molecule atoms
    let atomPosition = card?.atoms ? card.atoms.length : 0;
    
    // If card belongs to a molecule, map position to workflow molecule's atom array
    if (card?.moleculeId) {
      const workflowMolecule = workflowMolecules.find(m => m.moleculeId === card.moleculeId);
      if (workflowMolecule) {
        // Get ALL cards belonging to this molecule (a molecule can have multiple cards)
        const moleculeCards = (Array.isArray(layoutCards) ? layoutCards : [])
          .filter(c => c.moleculeId === card.moleculeId);
        
        // Collect ALL atoms from ALL cards in this molecule, maintaining card order
        const allMoleculeAtomIds: string[] = [];
        moleculeCards.forEach(moleculeCard => {
          moleculeCard.atoms.forEach(atom => {
            allMoleculeAtomIds.push(atom.atomId);
          });
        });
        
        // Get workflow molecule atom IDs
        const workflowAtomIds = workflowMolecule.atoms.map(a => typeof a === 'string' ? a : a.atomName);
        
        // Find where this card's atoms start in the full molecule atom array
        let cardStartIndex = 0;
        for (let i = 0; i < moleculeCards.length; i++) {
          if (moleculeCards[i].id === card.id) {
            break;
          }
          cardStartIndex += moleculeCards[i].atoms.length;
        }
        
        // Position in full molecule atom array = card start index + atom position in card
        const fullMoleculePosition = cardStartIndex + atomPosition;
        
        // Calculate how many atoms before the insertion point exist in the workflow molecule
        const atomsBeforeInsert = allMoleculeAtomIds.slice(0, fullMoleculePosition);
        const existingAtomsCount = atomsBeforeInsert.filter(atomId => workflowAtomIds.includes(atomId)).length;
        
        // Position in workflow molecule = existing atoms count
        atomPosition = existingAtomsCount;
        
        console.log(`📝 Position calculation for ${newAtom.atomId}: card index=${atomPosition}, card start in molecule=${cardStartIndex}, full molecule position=${fullMoleculePosition}, workflow position=${atomPosition}, existing workflow atoms=${workflowAtomIds.length}`);
      }
    }
    
    setLayoutCards(
      (Array.isArray(layoutCards) ? layoutCards : []).map(card =>
        card.id === cardId ? { ...card, atoms: [...card.atoms, newAtom] } : card
      )
    );

    // Track atom addition for cross-collection sync if card belongs to a molecule
    if (card?.moleculeId) {
      setPendingChanges(prev => ({
        ...prev,
        addedAtoms: [...prev.addedAtoms, { 
          moleculeId: card.moleculeId, 
          atomId: newAtom.atomId,
          position: atomPosition
        }]
      }));
      console.log(`📝 Tracked atom addition: ${newAtom.atomId} to molecule ${card.moleculeId} at position ${atomPosition} (will sync on save)`);
    }

    prefillAtomIfRequired(cardId, newAtom);
  };

  const handleAddAtomFromSuggestion = (atomId: string, atomData: any, targetCardId?: string) => {
    const cardId = targetCardId || selectedCardId;
    if (cardId) {
      addAtomByName(cardId, atomId);
    }
  };


  const deleteCard = async (cardId: string) => {
    const arr = Array.isArray(layoutCards) ? layoutCards : [];
    const card = arr.find(c => c.id === cardId);
    const updated = arr.filter(c => c.id !== cardId);
    setLayoutCards(updated);
    setCards(updated);
    setCollapsedCards(prev => {
      const copy = { ...prev };
      delete copy[cardId];
      return copy;
    });

    if (card) {
      // Track card deletion for cross-collection sync
      if (card.moleculeId) {
        // If card belongs to a molecule, track all atoms in this card for deletion
        card.atoms.forEach(atom => {
          setPendingChanges(prev => ({
            ...prev,
            deletedAtoms: [...prev.deletedAtoms, { 
              moleculeId: card.moleculeId, 
              atomId: atom.atomId 
            }]
          }));
        });
        console.log(`📝 Tracked card deletion: card ${cardId} with ${card.atoms.length} atoms from molecule ${card.moleculeId} (will sync on save)`);
      } else {
        // If standalone card, track individual atom deletions
        card.atoms.forEach(atom => {
          setPendingChanges(prev => ({
            ...prev,
            deletedAtoms: [...prev.deletedAtoms, { 
              moleculeId: 'standalone', // Special marker for standalone atoms
              atomId: atom.atomId 
            }]
          }));
        });
        console.log(`📝 Tracked standalone card deletion: card ${cardId} with ${card.atoms.length} atoms (will sync on save)`);
      }

      card.atoms.forEach(atom => {
        if (atom.atomId === 'text-box') {
          fetch(`${TEXT_API}/text/${atom.id}`, { method: 'DELETE' }).catch(() => {});
        } else if (atom.atomId === 'data-upload-validate') {
          const vid = (atom.settings as DataUploadSettings)?.validatorId;
          if (vid) {
            fetch(`${VALIDATE_API}/delete_validator_atom/${vid}`, { method: 'DELETE' }).catch(() => {});
          }
        }
      });
      fetch(`${CARD_API}/cards/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(card)
      }).catch(() => {});
    }

    const current = localStorage.getItem('current-project');
    if (current) {
      try {
        const proj = JSON.parse(current);
        const sanitized = sanitizeLabConfig({ cards: updated });
        await fetch(`${REGISTRY_API}/projects/${proj.id}/`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: { laboratory_config: sanitized } }),
        });
      } catch {
        /* ignore */
      }
    }
  };

  const handleAtomClick = (e: React.MouseEvent, atomId: string) => {
    e.stopPropagation();
    if (onAtomSelect) {
      onAtomSelect(atomId);
    }
  };

  const handleAtomSettingsClick = (e: React.MouseEvent, atomId: string) => {
    e.stopPropagation();
    if (onAtomSelect) {
      onAtomSelect(atomId);
    }
    onToggleSettingsPanel?.();
  };

  const handleCardSettingsClick = (
    e: React.MouseEvent,
    cardId: string,
    exhibited: boolean
  ) => {
    e.stopPropagation();
    if (onCardSelect) {
      onCardSelect(cardId, exhibited);
    }
    onToggleSettingsPanel?.();
  };

  const handleCardClick = (
    e: React.MouseEvent,
    cardId: string,
    exhibited: boolean
  ) => {
    e.stopPropagation();
    if (onCardSelect) {
      onCardSelect(cardId, exhibited);
    }
  };

  const toggleCardCollapse = (id: string) => {
    setCollapsedCards(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleCardExpand = (id: string) => {
    setExpandedCard(expandedCard === id ? null : id);
  };

  const toggleMoleculeCollapse = (moleculeId: string) => {
    setCollapsedMolecules(prev => ({ ...prev, [moleculeId]: !prev[moleculeId] }));
  };

  const requestDeleteMoleculeContainer = (moleculeId: string, moleculeTitle: string) => {
    setMoleculeToDelete({ moleculeId, moleculeTitle });
    setDeleteMoleculeDialogOpen(true);
  };

  const confirmDeleteMoleculeContainer = async () => {
    if (!moleculeToDelete) return;
    await deleteMoleculeContainer(moleculeToDelete.moleculeId);
    setDeleteMoleculeDialogOpen(false);
    setMoleculeToDelete(null);
  };

  const cancelDeleteMoleculeContainer = () => {
    setDeleteMoleculeDialogOpen(false);
    setMoleculeToDelete(null);
  };

  const handleDeleteMoleculeDialogOpenChange = (open: boolean) => {
    if (open) {
      setDeleteMoleculeDialogOpen(true);
    } else {
      cancelDeleteMoleculeContainer();
    }
  };

  const deleteMoleculeContainer = async (moleculeId: string) => {
    // Get current molecule order BEFORE deletion to calculate new positions
    const currentMolecules = [...workflowMolecules];
    const deletedIndex = currentMolecules.findIndex(mol => mol.moleculeId === moleculeId);
    
    // Get all cards associated with this molecule BEFORE updating state
    const arr = Array.isArray(layoutCards) ? layoutCards : [];
    const moleculeCards = arr.filter(card => card.moleculeId === moleculeId);
    
    // Update standalone cards positions BEFORE removing the molecule
    // Position logic: position in [moleculeIndex, moleculeIndex + 1) means "before molecule at moleculeIndex"
    // When a molecule is deleted, all positions after it shift down by 1
    const updatedCardsWithRepositioned = arr.map(card => {
      // Only update standalone cards (cards without moleculeId)
      if (card.moleculeId) {
        return card; // Keep molecule cards as-is (they'll be filtered out later)
      }
      
      // Skip cards without position (they stay where they are)
      if (typeof card.position !== 'number') {
        return card;
      }
      
      const cardPosition = card.position;
      let needsUpdate = false;
      const updatedCard = { ...card };
      
      // If card is positioned before the deleted molecule (position < deletedIndex)
      // It stays in place (no change needed)
      if (cardPosition < deletedIndex) {
        return card;
      }
      
      // If card is positioned in the deleted molecule's range [deletedIndex, deletedIndex + 1)
      // It was "before molecule at deletedIndex + 1" (the next molecule)
      // After deletion, that next molecule moves to deletedIndex
      // So card should be "before molecule at deletedIndex", position in [deletedIndex, deletedIndex + 1)
      // Use deletedIndex + 0.5 to place it in the middle of that range
      if (cardPosition >= deletedIndex && cardPosition < deletedIndex + 1) {
        // If there's a molecule after the deleted one, position card to appear before it
        // The next molecule (previously at deletedIndex + 1) is now at deletedIndex
        // Card should be at position in range [deletedIndex, deletedIndex + 1) = deletedIndex + 0.5
        if (deletedIndex < currentMolecules.length - 1) {
          // Position to appear before the molecule that's now at deletedIndex
          updatedCard.position = deletedIndex + 0.5;
          needsUpdate = true;
          console.log(`🔄 Repositioning standalone card "${card.id}": position ${cardPosition} → ${updatedCard.position} (was between deleted molecule at index ${deletedIndex} and next, now before next molecule at index ${deletedIndex})`);
        } else {
          // No molecule after - deleted molecule was the last one
          // After deletion, new last molecule is at index (currentMolecules.length - 2)
          // Card should be at position >= (currentMolecules.length - 1) to appear after the new last molecule
          const newMoleculeCount = currentMolecules.length - 1;
          if (newMoleculeCount > 0) {
            // Position card after the new last molecule
            // Use newMoleculeCount (not + 0.5) to ensure it's >= newMoleculeCount and appears in "after last" section
            // The rendering logic checks: position >= workflowMolecules.length for "after last"
            updatedCard.position = newMoleculeCount;
          } else {
            // No molecules left - position at negative
            updatedCard.position = -0.5;
          }
          needsUpdate = true;
          console.log(`🔄 Repositioning standalone card "${card.id}": position ${cardPosition} → ${updatedCard.position} (deleted molecule was last, moving card after remaining molecules)`);
        }
      }
      
      // If card is positioned after the deleted molecule (position >= deletedIndex + 1)
      if (cardPosition >= deletedIndex + 1) {
        // Check if the deleted molecule was the last one
        if (deletedIndex === currentMolecules.length - 1) {
          // Deleted molecule was the last one (at index currentMolecules.length - 1)
          // Cards positioned after it (position >= deletedIndex + 1) should remain after the new last molecule
          // After deletion, new moleculeCount = currentMolecules.length - 1
          // Cards should be at position >= (new moleculeCount) to appear after the new last molecule
          // The new last molecule is now at index (currentMolecules.length - 2)
          // To appear after it, card needs position >= (currentMolecules.length - 1)
          const newMoleculeCount = currentMolecules.length - 1;
          if (newMoleculeCount > 0) {
            // Position cards after the new last molecule: position >= newMoleculeCount
            // Use newMoleculeCount (not + 0.5) to ensure it's >= newMoleculeCount and appears in "after last" section
            // The rendering logic checks: position >= workflowMolecules.length for "after last"
            updatedCard.position = newMoleculeCount;
          } else {
            // No molecules left - position cards at negative (before first if any added)
            updatedCard.position = -0.5;
          }
          needsUpdate = true;
          console.log(`🔄 Repositioning standalone card "${card.id}": position ${cardPosition} → ${updatedCard.position} (deleted molecule was last, keeping card after new last molecule at index ${currentMolecules.length - 2})`);
        } else {
          // Deleted molecule was not the last one - just shift down by 1
          updatedCard.position = cardPosition - 1;
          needsUpdate = true;
          console.log(`🔄 Repositioning standalone card "${card.id}": position ${cardPosition} → ${updatedCard.position} (shifting down due to deleted molecule)`);
        }
      }
      
      return needsUpdate ? updatedCard : card;
    });
    
    // Remove cards from layoutCards state (filter out molecule cards)
    const updatedCards = updatedCardsWithRepositioned.filter(card => card.moleculeId !== moleculeId);
    setLayoutCards(updatedCards);
    setCards(updatedCards);
    
    // Handle backend deletion for each card without calling deleteCard (to avoid state conflicts)
    for (const card of moleculeCards) {
      if (card) {
        // Handle atom-specific backend deletions
        card.atoms.forEach(atom => {
          if (atom.atomId === 'text-box') {
            fetch(`${TEXT_API}/text/${atom.id}`, { method: 'DELETE' }).catch(() => {});
          } else if (atom.atomId === 'data-upload-validate') {
            const vid = (atom.settings as DataUploadSettings)?.validatorId;
            if (vid) {
              fetch(`${VALIDATE_API}/delete_validator_atom/${vid}`, { method: 'DELETE' }).catch(() => {});
            }
          }
        });
        
        // Archive the card
        fetch(`${CARD_API}/cards/archive`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(card)
        }).catch(() => {});
      }
      
      // Remove from collapsed cards state
      setCollapsedCards(prev => {
        const copy = { ...prev };
        delete copy[card.id];
        return copy;
      });
    }
    
    // Update project state with the new cards list (excluding deleted cards)
    const current = localStorage.getItem('current-project');
    if (current) {
      try {
        const proj = JSON.parse(current);
        const sanitized = sanitizeLabConfig({ cards: updatedCards });
        await fetch(`${REGISTRY_API}/projects/${proj.id}/`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: { laboratory_config: sanitized } }),
        });
      } catch {
        /* ignore */
      }
    }
    
    // Remove the molecule from workflowMolecules and update localStorage
    setWorkflowMolecules(prev => {
      const updatedMolecules = prev.filter(mol => mol.moleculeId !== moleculeId);
      
      // Update localStorage
      if (updatedMolecules.length > 0) {
        localStorage.setItem('workflow-molecules', JSON.stringify(updatedMolecules));
      } else {
        localStorage.removeItem('workflow-molecules');
      }
      
      return updatedMolecules;
    });
    
    // Clear collapsed state for this molecule
    setCollapsedMolecules(prev => {
      const copy = { ...prev };
      delete copy[moleculeId];
      return copy;
    });
    
    // Track molecule deletion for cross-collection sync
    setPendingChanges(prev => ({
      ...prev,
      deletedMolecules: [...prev.deletedMolecules, moleculeId]
    }));
    console.log(`📝 Tracked molecule deletion: ${moleculeId} (will sync on save)`);
  };

  // Sync Laboratory changes to Workflow collection
  const syncWorkflowCollectionOnLaboratorySave = async () => {
    try {
      console.log('🔄 Syncing Laboratory changes to Workflow collection...');
      
      const hasPendingChanges = pendingChanges.deletedMolecules.length > 0 || 
                                pendingChanges.deletedAtoms.length > 0 || 
                                pendingChanges.addedAtoms.length > 0;
      
      if (!hasPendingChanges) {
        console.log('📝 No pending molecule/atom changes to sync');
      }
      
      // Get current workflow configuration
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};
      
      const response = await fetch(`${MOLECULES_API}/workflow/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          user_id: '',
          client_name: env.CLIENT_NAME || 'default_client',
          app_name: env.APP_NAME || 'default_app',
          project_name: env.PROJECT_NAME || 'default_project'
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.workflow_data) {
          let updatedCanvasMolecules = [...result.workflow_data.canvas_molecules];
          
          // Handle molecule deletions
          if (pendingChanges.deletedMolecules.length > 0) {
            updatedCanvasMolecules = updatedCanvasMolecules.filter(
              mol => !pendingChanges.deletedMolecules.includes(mol.id)
            );
            console.log(`🗑️ Removed ${pendingChanges.deletedMolecules.length} molecules from workflow config`);
          }
          
          // Handle atom deletions
          if (pendingChanges.deletedAtoms.length > 0) {
            console.log('🔍 Processing atom deletions:', pendingChanges.deletedAtoms);
            console.log('🔍 Current workflow molecules:', updatedCanvasMolecules.map(m => ({ id: m.id, atoms: m.atoms })));
            
            // Separate molecule-based and standalone atom deletions
            const moleculeBasedDeletions = pendingChanges.deletedAtoms.filter(change => change.moleculeId !== 'standalone');
            const standaloneDeletions = pendingChanges.deletedAtoms.filter(change => change.moleculeId === 'standalone');
            
            // Handle molecule-based atom deletions
            updatedCanvasMolecules = updatedCanvasMolecules.map(molecule => {
              const atomsToRemove = moleculeBasedDeletions
                .filter(change => change.moleculeId === molecule.id)
                .map(change => change.atomId);
              
              console.log(`🔍 Molecule ${molecule.id}: atoms to remove =`, atomsToRemove);
              console.log(`🔍 Molecule ${molecule.id}: current atoms =`, molecule.atoms);
              
              if (atomsToRemove.length > 0) {
                const updatedMolecule = {
                  ...molecule,
                  atoms: molecule.atoms.filter(atom => !atomsToRemove.includes(atom)),
                  atomOrder: molecule.atomOrder.filter(atom => !atomsToRemove.includes(atom))
                };
                console.log(`🔍 Molecule ${molecule.id}: updated atoms =`, updatedMolecule.atoms);
                return updatedMolecule;
              }
              return molecule;
            });
            
            // Handle standalone atom deletions - remove atoms from ALL molecules
            if (standaloneDeletions.length > 0) {
              const standaloneAtomTypes = standaloneDeletions.map(change => change.atomId);
              console.log(`🔍 Removing standalone atoms from all molecules:`, standaloneAtomTypes);
              
              updatedCanvasMolecules = updatedCanvasMolecules.map(molecule => {
                const updatedMolecule = {
                  ...molecule,
                  atoms: molecule.atoms.filter(atom => !standaloneAtomTypes.includes(atom)),
                  atomOrder: molecule.atomOrder.filter(atom => !standaloneAtomTypes.includes(atom))
                };
                return updatedMolecule;
              });
            }
            
            console.log(`🗑️ Removed ${pendingChanges.deletedAtoms.length} atoms from workflow config`);
          }
          
          // Handle atom additions
          if (pendingChanges.addedAtoms.length > 0) {
            console.log('➕ Processing atom additions:', pendingChanges.addedAtoms);
            
            // Get current Laboratory cards to map atoms to their actual positions
            const currentCards = Array.isArray(layoutCards) ? layoutCards : [];
            
            // Group additions by molecule and sort by position
            const additionsByMolecule = pendingChanges.addedAtoms.reduce((acc, addition) => {
              if (!acc[addition.moleculeId]) {
                acc[addition.moleculeId] = [];
              }
              acc[addition.moleculeId].push(addition);
              return acc;
            }, {} as Record<string, Array<{ atomId: string; position: number }>>);
            
            // Add atoms to existing molecules at specific positions
            updatedCanvasMolecules = updatedCanvasMolecules.map(molecule => {
              const atomsToAdd = additionsByMolecule[molecule.id] || [];
              
              if (atomsToAdd.length > 0) {
                console.log(`➕ Molecule ${molecule.id}: adding atoms =`, atomsToAdd.map(a => ({ atomId: a.atomId, pos: a.position })));
                console.log(`➕ Molecule ${molecule.id}: current atoms =`, molecule.atoms);
                
                // Find ALL cards for this molecule (a molecule can have multiple cards)
                const moleculeCards = currentCards.filter(c => c.moleculeId === molecule.id);
                
                // Collect ALL atoms from ALL cards in this molecule, maintaining card order
                const allCardAtomIds: string[] = [];
                moleculeCards.forEach(card => {
                  card.atoms.forEach(atom => {
                    allCardAtomIds.push(atom.atomId);
                  });
                });
                
                console.log(`➕ Molecule ${molecule.id}: ${moleculeCards.length} cards, ${allCardAtomIds.length} total atoms across cards`);
                
                // Create a working copy of the atoms array
                let updatedAtoms = [...(molecule.atoms || [])];
                
                // Build the final atom order based on ALL cards' atom order
                // This ensures atoms are inserted in the same order as they appear across all cards
                const finalAtomOrder: string[] = [];
                
                // First, add atoms that exist in both cards and workflow, maintaining card order
                allCardAtomIds.forEach(atomId => {
                  if (updatedAtoms.includes(atomId) && !finalAtomOrder.includes(atomId)) {
                    finalAtomOrder.push(atomId);
                  } else if (!updatedAtoms.includes(atomId) && atomsToAdd.some(a => a.atomId === atomId)) {
                    // New atom being added - insert at its position
                    finalAtomOrder.push(atomId);
                  }
                });
                
                // Add any workflow atoms that aren't in the cards (shouldn't happen, but safety check)
                updatedAtoms.forEach(atomId => {
                  if (!finalAtomOrder.includes(atomId)) {
                    finalAtomOrder.push(atomId);
                  }
                });
                
                // If we built a final order from the cards, use it; otherwise use position-based insertion
                if (finalAtomOrder.length > 0 && allCardAtomIds.length > 0) {
                  updatedAtoms = finalAtomOrder;
                } else {
                  // Fallback: Insert atoms at their tracked positions
                  const sortedAdditions = [...atomsToAdd].sort((a, b) => a.position - b.position);
                  sortedAdditions.forEach(addition => {
                    const atomExists = updatedAtoms.includes(addition.atomId);
                    if (!atomExists) {
                      const insertPosition = Math.min(addition.position, updatedAtoms.length);
                      updatedAtoms.splice(insertPosition, 0, addition.atomId);
                    }
                  });
                }
                
                const updatedMolecule = {
                  ...molecule,
                  atoms: updatedAtoms,
                  atomOrder: updatedAtoms // Keep atomOrder in sync with atoms
                };
                
                console.log(`➕ Molecule ${molecule.id}: updated atoms =`, updatedMolecule.atoms);
                return updatedMolecule;
              }
              return molecule;
            });
            
            console.log(`➕ Added ${pendingChanges.addedAtoms.length} atoms to workflow config`);
          }
          
          // Build standalone cards array from Laboratory Mode cards
          // Calculate explicit molecule references based on position
          const standaloneCardsForWorkflow = Array.isArray(layoutCards)
            ? layoutCards
                .filter(card => !card.moleculeId && card.atoms.length > 0)
                .map(card => {
                  const cardData: any = {
                    id: card.id,
                    atomId: card.atoms[0]?.atomId || '',
                    title: card.atoms[0]?.title || 'Atom',
                    position: typeof card.position === 'number' ? card.position : undefined // Keep for backward compatibility
                  };
                  
                  // Calculate explicit molecule references based on position
                  // Position logic: position in range [i, i+1) means "before molecule at index i"
                  // So position 1 appears before molecule at index 1, which is BETWEEN molecule 0 and molecule 1
                  if (typeof card.position === 'number') {
                    const position = card.position;
                    const moleculeCount = updatedCanvasMolecules.length;
                    
                    if (position < 0) {
                      // Before first molecule
                      cardData.beforeFirstMolecule = true;
                    } else if (position >= 0 && position < 1) {
                      // Before first molecule (position in [0, 1))
                      if (moleculeCount > 0) {
                        cardData.beforeFirstMolecule = true;
                      }
                    } else if (position >= moleculeCount) {
                      // After last molecule
                      cardData.afterLastMolecule = true;
                      if (moleculeCount > 0) {
                        cardData.afterMoleculeId = updatedCanvasMolecules[moleculeCount - 1].id;
                      }
                    } else {
                      // Position is in range [1, moleculeCount)
                      // Position in [i, i+1) means "before molecule at index i", which is "between molecule i-1 and i"
                      const beforeMoleculeIndex = Math.floor(position);
                      
                      if (beforeMoleculeIndex === 0) {
                        // Position in [0, 1) - before first molecule (already handled above)
                        cardData.beforeFirstMolecule = true;
                      } else if (beforeMoleculeIndex > 0 && beforeMoleculeIndex < moleculeCount) {
                        // Between two molecules: after molecule at index (beforeMoleculeIndex - 1), before molecule at index beforeMoleculeIndex
                        const afterMoleculeIndex = beforeMoleculeIndex - 1;
                        cardData.betweenMolecules = [
                          updatedCanvasMolecules[afterMoleculeIndex].id,
                          updatedCanvasMolecules[beforeMoleculeIndex].id
                        ];
                        cardData.afterMoleculeId = updatedCanvasMolecules[afterMoleculeIndex].id;
                        cardData.beforeMoleculeId = updatedCanvasMolecules[beforeMoleculeIndex].id;
                      } else if (beforeMoleculeIndex >= moleculeCount) {
                        // After last molecule
                        cardData.afterLastMolecule = true;
                        if (moleculeCount > 0) {
                          cardData.afterMoleculeId = updatedCanvasMolecules[moleculeCount - 1].id;
                        }
                      }
                    }
                  } else {
                    // No position defined - assume after last molecule
                    const moleculeCount = updatedCanvasMolecules.length;
                    if (moleculeCount > 0) {
                      cardData.afterLastMolecule = true;
                      cardData.afterMoleculeId = updatedCanvasMolecules[moleculeCount - 1].id;
                    }
                  }
                  
                  return cardData;
                })
            : [];
          
          console.log('📦 Syncing standalone cards to Workflow with molecule references:', {
            count: standaloneCardsForWorkflow.length,
            cards: standaloneCardsForWorkflow.map(c => ({
              id: c.id,
              atomId: c.atomId,
              betweenMolecules: c.betweenMolecules,
              afterLastMolecule: c.afterLastMolecule,
              beforeFirstMolecule: c.beforeFirstMolecule,
              position: c.position
            }))
          });
          
          // Save updated workflow configuration
          await fetch(`${MOLECULES_API}/workflow/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              canvas_molecules: updatedCanvasMolecules,
              custom_molecules: result.workflow_data.custom_molecules || [],
              standalone_cards: standaloneCardsForWorkflow,
              user_id: '',
              client_name: env.CLIENT_NAME || 'default_client',
              app_name: env.APP_NAME || 'default_app',
              project_name: env.PROJECT_NAME || 'default_project'
            })
          });
          
          // Clear pending changes after successful sync
          setPendingChanges({
            deletedMolecules: [],
            deletedAtoms: [],
            addedAtoms: []
          });
          
          console.log('✅ Laboratory changes synced to Workflow collection');
        }
      }
    } catch (error) {
      console.error('❌ Failed to sync Laboratory changes to Workflow collection:', error);
    }
  };

  // Expose sync function to parent component via ref
  React.useImperativeHandle(ref, () => ({
    syncWorkflowCollection: syncWorkflowCollectionOnLaboratorySave
  }), [pendingChanges, layoutCards]);

  // Notify parent component when pending changes update
  React.useEffect(() => {
    if (onPendingChangesUpdate) {
      onPendingChangesUpdate(pendingChanges);
    }
  }, [pendingChanges, onPendingChangesUpdate]);

  const refreshCardAtoms = async (cardId: string) => {
    const card = (Array.isArray(layoutCards) ? layoutCards : []).find(c => c.id === cardId);
    if (!card) return;
    for (const atom of card.atoms) {
      if (atom.atomId === 'feature-overview') {
        await prefillFeatureOverview(cardId, atom.id);
      } else if (atom.atomId === 'column-classifier') {
        await prefillColumnClassifier(atom.id);
      } else if (atom.atomId === 'scope-selector') {
        await prefillScopeSelector(atom.id);
      }
    }
  };

  if (isCanvasLoading) {
    return (
      <div className="relative h-full w-full bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <LoadingAnimation status={currentLoadingMessage} className="rounded-xl" />
      </div>
    );
  }

  if (workflowMolecules.length > 0) {
    return (
      <>
        <ConfirmationDialog
          open={deleteMoleculeDialogOpen}
          onOpenChange={handleDeleteMoleculeDialogOpenChange}
          onConfirm={confirmDeleteMoleculeContainer}
          onCancel={cancelDeleteMoleculeContainer}
          title="Delete molecule container?"
          description={`Deleting "${moleculeToDelete?.moleculeTitle || ''}" will remove the container and all its associated atoms. This action cannot be undone.`}
          icon={<Trash2 className="w-6 h-6 text-white" />}
          iconBgClass="bg-red-500"
          confirmLabel="Yes, delete"
          cancelLabel="Cancel"
          confirmButtonClass="bg-red-500 hover:bg-red-600"
        />
      <div className="h-full bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm overflow-auto">
        <div className={canEdit ? '' : 'pointer-events-none'}>
          <div className="p-6 space-y-6">
            {/* Unified rendering logic for molecules and standalone cards */}
            {(() => {
              // Create a unified array of items (molecules and standalone cards)
              const unifiedItems = [];
              let itemIndex = 0;
              
              // Collect ALL standalone cards first
              const allStandaloneCards = Array.isArray(layoutCards) 
                ? layoutCards.filter(card => !card.moleculeId)
                : [];
              
              console.log('[Laboratory API] Rendering standalone cards:', {
                total: allStandaloneCards.length,
                cards: allStandaloneCards.map(c => ({ 
                  id: c.id, 
                  atomId: c.atoms[0]?.atomId,
                  position: c.position 
                }))
              });
              
              // Add standalone cards that should appear before the first molecule
              const standaloneCardsBefore = allStandaloneCards.filter(card => 
                typeof card.position === 'number' && card.position < 0
              );
              
              standaloneCardsBefore.forEach(card => {
                unifiedItems.push({
                  type: 'standalone-card',
                  data: card,
                  index: itemIndex++
                });
              });
              
              // Process molecules and their associated standalone cards
              workflowMolecules.forEach((molecule, moleculeIndex) => {
                // Add standalone cards that should appear before this molecule
                const standaloneCardsBeforeMolecule = allStandaloneCards.filter(card => 
                  typeof card.position === 'number' &&
                  card.position >= moleculeIndex && 
                  card.position < moleculeIndex + 1
                );
                
                standaloneCardsBeforeMolecule.forEach(card => {
                  unifiedItems.push({
                    type: 'standalone-card',
                    data: card,
                    index: itemIndex++
                  });
                });
                
                // Add the molecule
                unifiedItems.push({
                  type: 'molecule',
                  data: molecule,
                  index: itemIndex++,
                  moleculeIndex
                });
              });
              
              // Add standalone cards that should appear after the last molecule
              // Include cards with position >= workflowMolecules.length OR undefined/null position
              const standaloneCardsAfter = allStandaloneCards.filter(card => 
                card.position === undefined || 
                card.position === null || 
                (typeof card.position === 'number' && card.position >= workflowMolecules.length)
              );
              
              console.log('[Laboratory API] Standalone cards after molecules:', {
                count: standaloneCardsAfter.length,
                cards: standaloneCardsAfter.map(c => ({ 
                  id: c.id, 
                  atomId: c.atoms[0]?.atomId,
                  position: c.position 
                }))
              });
              
              standaloneCardsAfter.forEach(card => {
                unifiedItems.push({
                  type: 'standalone-card',
                  data: card,
                  index: itemIndex++
                });
              });
              
              return unifiedItems.map((item, unifiedIndex) => {
                if (item.type === 'standalone-card') {
                  const card = item.data;
                        const cardTitle = card.atoms.length > 0
                            ? card.atoms[0].title
                            : 'Card';
                  
                        return (
                    <React.Fragment key={`standalone-${card.id}`}>
                        <Card
                          data-card-id={card.id}
                          className={`w-full ${collapsedCards[card.id] ? '' : 'min-h-[200px]'} bg-white rounded-2xl border-2 transition-all duration-300 flex flex-col overflow-hidden ${
                            dragOverCardId === card.id
                              ? 'border-blue-500 bg-blue-50 shadow-lg'
                              : draggedCardId === card.id
                              ? 'opacity-50'
                              : dragOver === card.id
                              ? 'border-[#458EE2] bg-gradient-to-br from-blue-50 to-blue-100 shadow-lg'
                              : 'border-gray-200 shadow-sm hover:shadow-md'
                          }`}
                          draggable={canEdit}
                          onDragStart={(e) => handleCardDragStart(e, card.id)}
                          onDragOver={(e) => {
                            handleCardDragOver(e, card.id);
                          handleDragOver(e, card.id);
                          }}
                          onDragLeave={(e) => {
                            handleCardDragLeave(e);
                          handleDragLeave(e);
                          }}
                          onDrop={(e) => {
                            handleCardDrop(e, card.id);
                          handleDrop(e, card.id);
                          }}
                        >
                          <div className="flex items-center justify-between p-4 border-b border-gray-100">
                            <div className="flex items-center space-x-2">
                              {canEdit && (
                                <div 
                                  className="cursor-move p-1 hover:bg-gray-100 rounded"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  title="Drag to reorder"
                                >
                                  <GripVertical className="w-3 h-3 text-gray-400" />
                                </div>
                              )}
                              <span className="text-sm font-medium text-gray-700">
                                {cardTitle}
                              </span>
                              <AIChatBot
                                cardId={card.id}
                                cardTitle={cardTitle}
                                onAddAtom={(id, atom) => addAtomByName(id, atom)}
                                disabled={card.atoms.length > 0}
                              />
                            </div>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={e => { e.stopPropagation(); deleteCard(card.id); }}
                                className="p-1 hover:bg-gray-100 rounded"
                              >
                                <Trash2 className="w-4 h-4 text-gray-400" />
                              </button>
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  toggleCardExpand(card.id);
                                }}
                                className="p-1 hover:bg-gray-100 rounded"
                                title="Expand Card"
                              >
                                <Maximize2 className="w-4 h-4 text-gray-400" />
                              </button>
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  toggleCardCollapse(card.id);
                                }}
                                className="p-1 hover:bg-gray-100 rounded"
                                title="Toggle Card"
                              >
                                {collapsedCards[card.id] ? (
                                  <ChevronDown className="w-4 h-4 text-gray-400" />
                                ) : (
                                  <Minus className="w-4 h-4 text-gray-400" />
                                )}
                              </button>
                            </div>
                          </div>

                          <div className={`flex-1 flex flex-col p-4 overflow-y-auto ${collapsedCards[card.id] ? 'hidden' : ''}`}>
                            {card.atoms.length === 0 ? (
                              <div className="flex-1 flex flex-col items-center justify-center text-center border-2 border-dashed border-gray-300 rounded-lg min-h-[140px] mb-4">
                              <AtomSuggestion
                                cardId={card.id}
                                isVisible={true}
                                onClose={() => setShowAtomSuggestion(prev => ({ ...prev, [card.id]: false }))}
                                onAddAtom={handleAddAtomFromSuggestion}
                              />
                              </div>
                            ) : (
                              <div
                              className={`grid gap-4 w-full ${
                                card.atoms.length === 1
                                  ? 'grid-cols-1'
                                  : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                              }`}
                            >
                              {card.atoms.map((atom) => (
                                  <AtomBox
                                    key={atom.id}
                                    className="p-4 cursor-pointer hover:shadow-lg transition-all duration-200 group border border-gray-200 bg-white overflow-hidden"
                                    onClick={(e) => handleAtomClick(e, atom.id)}
                                  >
                                    <div className="flex items-center justify-between mb-3">
                                      <div className="flex items-center space-x-1">
                                        <div className={`w-3 h-3 ${atom.color} rounded-full`}></div>
                                        <AtomAIChatBot
                                          atomId={atom.id}
                                          atomType={atom.atomId}
                                          atomTitle={atom.title}
                                          disabled={!LLM_MAP[atom.atomId]}
                                          className="transition-transform hover:scale-110"
                                        />
                                        <button
                                          onClick={e => handleAtomSettingsClick(e, atom.id)}
                                          className="p-1 hover:bg-gray-100 rounded transition-transform hover:scale-110"
                                          title="Atom Settings"
                                        >
                                          <Settings className="w-4 h-4 text-gray-400" />
                                        </button>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (onAtomSelect) {
                                            onAtomSelect(atom.id);
                                          }
                                          onToggleHelpPanel?.();
                                        }}
                                        className="p-1 hover:bg-gray-100 rounded transition-transform hover:scale-110"
                                        title="Help"
                                      >
                                        <span className="w-4 h-4 text-gray-400 text-base font-bold flex items-center justify-center">?</span>
                                        </button>
                                      </div>
                                      <button
                                      onClick={(e) => {
                                          e.stopPropagation();
                                          removeAtom(card.id, atom.id);
                                        }}
                                        className="p-1 hover:bg-gray-100 rounded transition-transform hover:scale-110"
                                      >
                                        <Trash2 className="w-4 h-4 text-gray-400" />
                                      </button>
                                    </div>

                                  {/* Atom Content */}
                                    {atom.atomId === 'text-box' ? (
                                      <TextBoxEditor textId={atom.id} />
                                    ) : atom.atomId === 'data-upload-validate' ? (
                                      <DataUploadValidateAtom atomId={atom.id} />
                                    ) : atom.atomId === 'feature-overview' ? (
                                      <FeatureOverviewAtom atomId={atom.id} />
                                  ) : atom.atomId === 'clustering' ? (
                                    <ClusteringAtom atomId={atom.id} />
                                    ) : atom.atomId === 'explore' ? (
                                      <ExploreAtom atomId={atom.id} />
                                    ) : atom.atomId === 'chart-maker' ? (
                                      <ChartMakerAtom atomId={atom.id} />
                                    ) : atom.atomId === 'concat' ? (
                                      <ConcatAtom atomId={atom.id} />
                                    ) : atom.atomId === 'merge' ? (
                                      <MergeAtom atomId={atom.id} />
                                    ) : atom.atomId === 'column-classifier' ? (
                                      <ColumnClassifierAtom atomId={atom.id} />
                                    ) : atom.atomId === 'dataframe-operations' ? (
                                      <DataFrameOperationsAtom atomId={atom.id} />
                                    ) : atom.atomId === 'create-column' ? (
                                      <CreateColumnAtom atomId={atom.id} />
                                    ) : atom.atomId === 'groupby-wtg-avg' ? (
                                      <GroupByAtom atomId={atom.id} />
                                    ) : atom.atomId === 'build-model-feature-based' ? (
                                      <BuildModelFeatureBasedAtom atomId={atom.id} />
                                  ) : atom.atomId === 'scenario-planner' ? (
                                    <ScenarioPlannerAtom atomId={atom.id} />
                                    ) : atom.atomId === 'select-models-feature' ? (
                                      <SelectModelsFeatureAtom atomId={atom.id} />
                                    ) : atom.atomId === 'evaluate-models-feature' ? (
                                      <EvaluateModelsFeatureAtom atomId={atom.id} />
                                    ) : atom.atomId === 'scope-selector' ? (
                                      <ScopeSelectorAtom atomId={atom.id} />
                                    ) : atom.atomId === 'correlation' ? (
                                      <CorrelationAtom atomId={atom.id} />
                                    ) : atom.atomId === 'auto-regressive-models' ? (
                                      <AutoRegressiveModelsAtom atomId={atom.id} />
                                    ) : atom.atomId === 'select-models-auto-regressive' ? (
                                      <SelectModelsAutoRegressiveAtom atomId={atom.id} />
                                    ) : atom.atomId === 'evaluate-models-auto-regressive' ? (
                                      <EvaluateModelsAutoRegressiveAtom atomId={atom.id} />
                                    ) : (
                                      <div>
                                        <h4 className="font-semibold text-gray-900 mb-1 text-sm">{atom.title}</h4>
                                        <p className="text-xs text-gray-600 mb-2">{atom.category}</p>
                                        <p className="text-xs text-gray-500">Configure this atom for your application</p>
                                      </div>
                                    )}
                                  </AtomBox>
                                ))}
                              </div>
                            )}
                          </div>
                        </Card>
                      
                      {/* Add New Card Button after standalone card */}
                      <div className="flex justify-center my-4">
                        <button
                          onClick={() => {
                            // Calculate position as midpoint between current card and next card
                            const currentCardPosition = card.position;
                            
                            // Find the next standalone card in the same zone
                            let nextCardPosition: number | undefined;
                            for (let i = unifiedIndex + 1; i < unifiedItems.length; i++) {
                              const nextItem = unifiedItems[i];
                              if (nextItem.type === 'standalone-card') {
                                const nextCard = nextItem.data;
                                if (typeof nextCard.position === 'number') {
                                  nextCardPosition = nextCard.position;
                                  break;
                                }
                              } else if (nextItem.type === 'molecule') {
                                // Stop at next molecule - we're at the end of the zone
                                break;
                              }
                            }
                            
                            // Calculate new position
                            let newPosition: number;
                            if (typeof currentCardPosition === 'number' && typeof nextCardPosition === 'number') {
                              // Midpoint between current and next card
                              newPosition = (currentCardPosition + nextCardPosition) / 2;
                            } else if (typeof currentCardPosition === 'number') {
                              // No next card in zone, add small increment
                              newPosition = currentCardPosition + 0.1;
                            } else {
                              // Fallback to unified index
                              newPosition = unifiedIndex + 1;
                            }
                            
                            addNewCard(undefined, newPosition);
                          }}
                          onDragEnter={e => handleAddDragEnter(e, `standalone-${unifiedIndex}`)}
                          onDragLeave={handleAddDragLeave}
                          onDragOver={e => e.preventDefault()}
                          onDrop={e => {
                            // Calculate position as midpoint between current card and next card
                            const currentCardPosition = card.position;
                            
                            // Find the next standalone card in the same zone
                            let nextCardPosition: number | undefined;
                            for (let i = unifiedIndex + 1; i < unifiedItems.length; i++) {
                              const nextItem = unifiedItems[i];
                              if (nextItem.type === 'standalone-card') {
                                const nextCard = nextItem.data;
                                if (typeof nextCard.position === 'number') {
                                  nextCardPosition = nextCard.position;
                                  break;
                                }
                              } else if (nextItem.type === 'molecule') {
                                // Stop at next molecule - we're at the end of the zone
                                break;
                              }
                            }
                            
                            // Calculate new position
                            let newPosition: number;
                            if (typeof currentCardPosition === 'number' && typeof nextCardPosition === 'number') {
                              // Midpoint between current and next card
                              newPosition = (currentCardPosition + nextCardPosition) / 2;
                            } else if (typeof currentCardPosition === 'number') {
                              // No next card in zone, add small increment
                              newPosition = currentCardPosition + 0.1;
                            } else {
                              // Fallback to unified index
                              newPosition = unifiedIndex + 1;
                            }
                            
                            void handleDropNewCard(e, undefined, newPosition);
                          }}
                          className={`flex flex-col items-center justify-center px-2 py-2 bg-white border-2 border-dashed rounded-xl hover:border-[#458EE2] hover:bg-blue-50 transition-all duration-500 ease-in-out group ${addDragTarget === `standalone-${unifiedIndex}` ? 'min-h-[160px] w-full border-[#458EE2] bg-blue-50' : 'border-gray-300'}`}
                          title="Add new card"
                        >
                          <Plus className={`w-5 h-5 text-gray-400 group-hover:text-[#458EE2] transition-transform duration-500 ${addDragTarget === `standalone-${unifiedIndex}` ? 'scale-125 mb-2' : ''}`} />
                          <span
                            className="w-0 h-0 overflow-hidden ml-0 group-hover:ml-2 group-hover:w-[120px] group-hover:h-auto text-gray-600 group-hover:text-[#458EE2] font-medium whitespace-nowrap transition-all duration-500 ease-in-out"
                          >
                            Add New Card
                          </span>
                        </button>
                </div>
                    </React.Fragment>
                  );
                } else if (item.type === 'molecule') {
                  const molecule = item.data;
                  const moleculeIndex = item.moleculeIndex;
                  const isCollapsed = collapsedMolecules[molecule.moleculeId];
                  const moleculeCards = Array.isArray(layoutCards) 
                    ? layoutCards.filter(card => card.moleculeId === molecule.moleculeId)
                    : [];
                  const atomCount = moleculeCards.reduce((sum, card) => sum + (card.atoms?.length || 0), 0);

                return (
                    <React.Fragment key={molecule.moleculeId}>
                      <Card 
                        className={`bg-white border-2 shadow-lg rounded-xl overflow-hidden transition-all duration-200 ${
                          dragOverMoleculeId === molecule.moleculeId 
                            ? 'border-blue-500 bg-blue-50' 
                            : draggedMoleculeId === molecule.moleculeId
                            ? 'opacity-50'
                            : 'border-gray-200'
                        }`}
                        draggable={canEdit}
                        onDragStart={(e) => handleMoleculeDragStart(e, molecule.moleculeId)}
                        onDragOver={(e) => handleMoleculeDragOver(e, molecule.moleculeId)}
                        onDragLeave={handleMoleculeDragLeave}
                        onDrop={(e) => handleMoleculeDrop(e, molecule.moleculeId)}
                      >
                        {/* Collapsible Molecule Header */}
                        <div 
                          className="flex items-center justify-between p-3 bg-white border-b border-gray-200 cursor-pointer hover:bg-gray-50 transition-all duration-200"
                          onClick={() => toggleMoleculeCollapse(molecule.moleculeId)}
                        >
                          <div className="flex items-center space-x-3">
                            {canEdit && (
                              <div 
                                className="cursor-move p-1 hover:bg-gray-100 rounded"
                                onMouseDown={(e) => e.stopPropagation()}
                                title="Drag to reorder"
                              >
                                <GripVertical className="w-4 h-4 text-gray-400" />
                              </div>
                            )}
                            <div className="flex items-center space-x-2">
                              <div className="w-2 h-8 bg-yellow-400 rounded-full shadow-sm"></div>
                            </div>
                            <div>
                              <h3 className="text-lg font-bold text-gray-900 tracking-tight">
                                {molecule.moleculeTitle}
                              </h3>
                              <div className="flex items-center space-x-3 mt-1">
                                <div className="flex items-center space-x-1">
                                  <span className="text-xs font-medium text-black">
                                    {atomCount} atom{atomCount !== 1 ? 's' : ''}
                                  </span>
                                </div>
                                <div className="flex items-center space-x-1">
                                  <span className="text-xs font-medium text-gray-600">
                                    {moleculeCards.length} card{moleculeCards.length !== 1 ? 's' : ''}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                requestDeleteMoleculeContainer(molecule.moleculeId, molecule.moleculeTitle);
                              }}
                              className="p-2 hover:bg-red-50 rounded-lg transition-all duration-200 hover:shadow-sm"
                              title="Delete Container"
                            >
                              <Trash2 className="w-4 h-4 text-gray-600 hover:text-red-600" />
                            </button>
                            <button 
                              className="p-2 hover:bg-white/50 rounded-lg transition-all duration-200 hover:shadow-sm"
                              onClick={() => toggleMoleculeCollapse(molecule.moleculeId)}
                              title={isCollapsed ? 'Expand molecule' : 'Collapse molecule'}
                            >
                              <ChevronDown 
                                className={`w-5 h-5 text-gray-700 transition-transform duration-300 ${
                                  isCollapsed ? '-rotate-90' : 'rotate-0'
                                }`}
                              />
                            </button>
                          </div>
                        </div>

                        {/* Molecule Content */}
                        {!isCollapsed && (
                        <div className="p-6 space-y-6 w-full bg-gradient-to-br from-gray-50 to-white">
                            {Array.isArray(layoutCards) &&
                              layoutCards
                                .filter(card => card.moleculeId === molecule.moleculeId)
                                .map((card, cardIndex, cards) => {
                                const cardTitle = card.moleculeId && molecule.moleculeTitle
                        ? card.atoms.length > 0
                                    ? `${molecule.moleculeTitle} - ${card.atoms[0].title}`
                                    : `${molecule.moleculeTitle} - Card`
                        : card.atoms.length > 0
                          ? card.atoms[0].title
                          : 'Card';
                      return (
                        <React.Fragment key={card.id}>
                        <Card
                          data-card-id={card.id}
                          className={`w-full ${collapsedCards[card.id] ? '' : 'min-h-[200px]'} bg-white rounded-2xl border-2 transition-all duration-300 flex flex-col overflow-hidden ${
                            dragOverCardId === card.id
                              ? 'border-blue-500 bg-blue-50 shadow-lg'
                              : draggedCardId === card.id
                              ? 'opacity-50'
                              : dragOver === card.id
                              ? 'border-[#458EE2] bg-gradient-to-br from-blue-50 to-blue-100 shadow-lg'
                              : 'border-gray-200 shadow-sm hover:shadow-md'
                          }`}
                          draggable={canEdit}
                          onDragStart={(e) => handleCardDragStart(e, card.id)}
                          onDragOver={(e) => {
                            handleCardDragOver(e, card.id);
                            handleDragOver(e, card.id); // Keep existing functionality
                          }}
                          onDragLeave={(e) => {
                            handleCardDragLeave(e);
                            handleDragLeave(e); // Keep existing functionality
                          }}
                          onDrop={(e) => {
                            handleCardDrop(e, card.id);
                            handleDrop(e, card.id); // Keep existing functionality
                          }}
                        >
                          <div className="flex items-center justify-between p-4 border-b border-gray-100">
                            <div className="flex items-center space-x-2">
                              {canEdit && (
                                <div 
                                  className="cursor-move p-1 hover:bg-gray-100 rounded"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  title="Drag to reorder"
                                >
                                  <GripVertical className="w-3 h-3 text-gray-400" />
                                </div>
                              )}
                              <span className="text-sm font-medium text-gray-700">
                                {cardTitle}
                              </span>
                              <AIChatBot
                                cardId={card.id}
                                cardTitle={cardTitle}
                                onAddAtom={(id, atom) => addAtomByName(id, atom)}
                                disabled={card.atoms.length > 0}
                              />
                            </div>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={e => { e.stopPropagation(); deleteCard(card.id); }}
                                className="p-1 hover:bg-gray-100 rounded"
                              >
                                <Trash2 className="w-4 h-4 text-gray-400" />
                              </button>
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  toggleCardExpand(card.id);
                                }}
                                className="p-1 hover:bg-gray-100 rounded"
                                title="Expand Card"
                              >
                                <Maximize2 className="w-4 h-4 text-gray-400" />
                              </button>
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  toggleCardCollapse(card.id);
                                }}
                                className="p-1 hover:bg-gray-100 rounded"
                                title="Toggle Card"
                              >
                                {collapsedCards[card.id] ? (
                                  <ChevronDown className="w-4 h-4 text-gray-400" />
                                ) : (
                                  <Minus className="w-4 h-4 text-gray-400" />
                                )}
                              </button>
                            </div>
                          </div>

                          <div className={`flex-1 flex flex-col p-4 overflow-y-auto ${collapsedCards[card.id] ? 'hidden' : ''}`}>
                            {card.atoms.length === 0 ? (
                              <div className="flex-1 flex flex-col items-center justify-center text-center border-2 border-dashed border-gray-300 rounded-lg min-h-[140px] mb-4">
                                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                          <Grid3X3 className="w-8 h-8 text-gray-400" />
                                        </div>
                                        <p className="text-gray-500 mb-2">No atoms in this section</p>
                                        <p className="text-sm text-gray-400">Configure this atom for your application</p>
                              </div>
                            ) : (
                              <div
                                        className={`grid gap-4 w-full ${
                                          card.atoms.length === 1
                                            ? 'grid-cols-1'
                                            : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                                        }`}
                                      >
                                        {card.atoms.map(atom => (
                                  <AtomBox
                                    key={atom.id}
                                    className="p-4 cursor-pointer hover:shadow-lg transition-all duration-200 group border border-gray-200 bg-white overflow-hidden"
                                    onClick={(e) => handleAtomClick(e, atom.id)}
                                  >
                                    <div className="flex items-center justify-between mb-3">
                                      <div className="flex items-center space-x-1">
                                        <div className={`w-3 h-3 ${atom.color} rounded-full`}></div>
                                        <AtomAIChatBot
                                          atomId={atom.id}
                                          atomType={atom.atomId}
                                          atomTitle={atom.title}
                                          disabled={!LLM_MAP[atom.atomId]}
                                          className="transition-transform hover:scale-110"
                                        />
                                        <button
                                          onClick={e => handleAtomSettingsClick(e, atom.id)}
                                          className="p-1 hover:bg-gray-100 rounded transition-transform hover:scale-110"
                                          title="Atom Settings"
                                        >
                                          <Settings className="w-4 h-4 text-gray-400" />
                                        </button>
                                      </div>
                                      <button
                                                onClick={e => {
                                          e.stopPropagation();
                                          removeAtom(card.id, atom.id);
                                        }}
                                        className="p-1 hover:bg-gray-100 rounded transition-transform hover:scale-110"
                                      >
                                        <Trash2 className="w-4 h-4 text-gray-400" />
                                      </button>
                                    </div>
                                    
                                    {atom.atomId === 'text-box' ? (
                                      <TextBoxEditor textId={atom.id} />
                                    ) : atom.atomId === 'data-upload-validate' ? (
                                      <DataUploadValidateAtom atomId={atom.id} />
                                    ) : atom.atomId === 'feature-overview' ? (
                                      <FeatureOverviewAtom atomId={atom.id} />
                                    ) : atom.atomId === 'explore' ? (
                                      <ExploreAtom atomId={atom.id} />
                                    ) : atom.atomId === 'chart-maker' ? (
                                      <ChartMakerAtom atomId={atom.id} />
                                    ) : atom.atomId === 'concat' ? (
                                      <ConcatAtom atomId={atom.id} />
                                    ) : atom.atomId === 'merge' ? (
                                      <MergeAtom atomId={atom.id} />
                                    ) : atom.atomId === 'column-classifier' ? (
                                      <ColumnClassifierAtom atomId={atom.id} />
                                    ) : atom.atomId === 'dataframe-operations' ? (
                                      <DataFrameOperationsAtom atomId={atom.id} />
                                    ) : atom.atomId === 'create-column' ? (
                                      <CreateColumnAtom atomId={atom.id} />
                                    ) : atom.atomId === 'groupby-wtg-avg' ? (
                                      <GroupByAtom atomId={atom.id} />
                                    ) : atom.atomId === 'build-model-feature-based' ? (
                                      <BuildModelFeatureBasedAtom atomId={atom.id} />
                                    ) : atom.atomId === 'select-models-feature' ? (
                                      <SelectModelsFeatureAtom atomId={atom.id} />
                                    ) : atom.atomId === 'evaluate-models-feature' ? (
                                      <EvaluateModelsFeatureAtom atomId={atom.id} />
                                    ) : atom.atomId === 'scope-selector' ? (
                                      <ScopeSelectorAtom atomId={atom.id} />
                                    ) : atom.atomId === 'correlation' ? (
                                      <CorrelationAtom atomId={atom.id} />
                                    ) : atom.atomId === 'auto-regressive-models' ? (
                                      <AutoRegressiveModelsAtom atomId={atom.id} />
                                    ) : atom.atomId === 'select-models-auto-regressive' ? (
                                      <SelectModelsAutoRegressiveAtom atomId={atom.id} />
                                    ) : atom.atomId === 'evaluate-models-auto-regressive' ? (
                                      <EvaluateModelsAutoRegressiveAtom atomId={atom.id} />
                                    ) : (
                                      <div>
                                        <h4 className="font-semibold text-gray-900 mb-1 text-sm">{atom.title}</h4>
                                        <p className="text-xs text-gray-600 mb-2">{atom.category}</p>
                                        <p className="text-xs text-gray-500">Configure this atom for your application</p>
                                      </div>
                                    )}
                                  </AtomBox>
                                ))}
                              </div>
                            )}
                          </div>
                        </Card>
                                
                                {/* Add New Card Button after each card */}
                          <div className="flex justify-center my-4">
                            <button
                                    onClick={() => {
                                      // Find the actual array index of the current card in the full layoutCards array
                                      const arr = Array.isArray(layoutCards) ? layoutCards : [];
                                      const actualIndex = arr.findIndex(c => c.id === card.id);
                                      // Insert after the current card, or at end if not found
                                      const insertIndex = actualIndex >= 0 ? actualIndex + 1 : arr.length;
                                      addNewCard(molecule.moleculeId, insertIndex);
                                    }}
                                    onDragEnter={e => handleAddDragEnter(e, `molecule-${molecule.moleculeId}-${cardIndex}`)}
                              onDragLeave={handleAddDragLeave}
                              onDragOver={e => e.preventDefault()}
                              onDrop={e => {
                                      // Find the actual array index of the current card in the full layoutCards array
                                      const arr = Array.isArray(layoutCards) ? layoutCards : [];
                                      const actualIndex = arr.findIndex(c => c.id === card.id);
                                      // Insert after the current card, or at end if not found
                                      const insertIndex = actualIndex >= 0 ? actualIndex + 1 : arr.length;
                                      void handleDropNewCard(e, molecule.moleculeId, insertIndex);
                              }}
                                    className={`flex flex-col items-center justify-center px-2 py-2 bg-white border-2 border-dashed rounded-xl hover:border-[#458EE2] hover:bg-blue-50 transition-all duration-500 ease-in-out group ${addDragTarget === `molecule-${molecule.moleculeId}-${cardIndex}` ? 'min-h-[160px] w-full border-[#458EE2] bg-blue-50' : 'border-gray-300'}`}
                              title="Add new card"
                            >
                                    <Plus className={`w-5 h-5 text-gray-400 group-hover:text-[#458EE2] transition-transform duration-500 ${addDragTarget === `molecule-${molecule.moleculeId}-${cardIndex}` ? 'scale-125 mb-2' : ''}`} />
                              <span
                                className="w-0 h-0 overflow-hidden ml-0 group-hover:ml-2 group-hover:w-[120px] group-hover:h-auto text-gray-600 group-hover:text-[#458EE2] font-medium whitespace-nowrap transition-all duration-500 ease-in-out"
                              >
                                Add New Card
                              </span>
                            </button>
                          </div>
                        </React.Fragment>
                      );
                    })}

                  </div>
                        )}
                      </Card>
                      
                      {/* Add New Card Button after each molecule */}
                      <div className="flex justify-center my-6">
                        <button
                          onClick={() => {
                            // Find the first standalone card after this molecule
                            let firstCardPosition: number | undefined;
                            for (let i = unifiedIndex + 1; i < unifiedItems.length; i++) {
                              const nextItem = unifiedItems[i];
                              if (nextItem.type === 'standalone-card') {
                                const nextCard = nextItem.data;
                                if (typeof nextCard.position === 'number') {
                                  firstCardPosition = nextCard.position;
                                  break;
                                }
                              } else if (nextItem.type === 'molecule') {
                                // Stop at next molecule
                                break;
                              }
                            }
                            
                            // Calculate new position
                            let newPosition: number;
                            if (typeof firstCardPosition === 'number') {
                              // Midpoint between next molecule zone start and first card
                              newPosition = ((moleculeIndex + 1) + firstCardPosition) / 2;
                            } else {
                              // No cards before next molecule, place in middle of next molecule's zone
                              // Cards render BEFORE a molecule if position >= moleculeIndex && < moleculeIndex + 1
                              // So to appear AFTER Molecule N, card needs position in range [N+1, N+2)
                              newPosition = (moleculeIndex + 1) + 0.5;
                            }
                            
                            addNewCard(undefined, newPosition);
                          }}
                          onDragEnter={e => handleAddDragEnter(e, `after-molecule-${moleculeIndex}`)}
                          onDragLeave={handleAddDragLeave}
                          onDragOver={e => e.preventDefault()}
                          onDrop={e => {
                            // Find the first standalone card after this molecule
                            let firstCardPosition: number | undefined;
                            for (let i = unifiedIndex + 1; i < unifiedItems.length; i++) {
                              const nextItem = unifiedItems[i];
                              if (nextItem.type === 'standalone-card') {
                                const nextCard = nextItem.data;
                                if (typeof nextCard.position === 'number') {
                                  firstCardPosition = nextCard.position;
                                  break;
                                }
                              } else if (nextItem.type === 'molecule') {
                                // Stop at next molecule
                                break;
                              }
                            }
                            
                            // Calculate new position
                            let newPosition: number;
                            if (typeof firstCardPosition === 'number') {
                              // Midpoint between next molecule zone start and first card
                              newPosition = ((moleculeIndex + 1) + firstCardPosition) / 2;
                            } else {
                              // No cards before next molecule, place in middle of next molecule's zone
                              // Cards render BEFORE a molecule if position >= moleculeIndex && < moleculeIndex + 1
                              // So to appear AFTER Molecule N, card needs position in range [N+1, N+2)
                              newPosition = (moleculeIndex + 1) + 0.5;
                            }
                            
                            void handleDropNewCard(e, undefined, newPosition);
                          }}
                          className={`flex flex-col items-center justify-center px-2 py-2 bg-white border-2 border-dashed rounded-xl hover:border-[#458EE2] hover:bg-blue-50 transition-all duration-500 ease-in-out group ${addDragTarget === `after-molecule-${moleculeIndex}` ? 'min-h-[160px] w-full border-[#458EE2] bg-blue-50' : 'border-gray-300'}`}
                          title="Add new card outside molecules"
                        >
                          <Plus className={`w-5 h-5 text-gray-400 group-hover:text-[#458EE2] transition-transform duration-500 ${addDragTarget === `after-molecule-${moleculeIndex}` ? 'scale-125 mb-2' : ''}`} />
                          <span
                            className="w-0 h-0 overflow-hidden ml-0 group-hover:ml-2 group-hover:w-[120px] group-hover:h-auto text-gray-600 group-hover:text-[#458EE2] font-medium whitespace-nowrap transition-all duration-500 ease-in-out"
                          >
                            Add New Card
                          </span>
                        </button>
                      </div>
                    </React.Fragment>
                );
              }
              return null;
              });
            })()}
                        
                </div>
          </div>
        </div>

        {/* Fullscreen Card Modal */}
        {expandedCard &&
          createPortal(
            <div
              className="fixed inset-0 z-40 pointer-events-none"
              role="dialog"
              aria-modal="true"
            >
              <div
                className="absolute inset-0 bg-black/40 pointer-events-auto"
                aria-hidden="true"
                onClick={() => setExpandedCard(null)}
              />
              <div className="relative flex h-full w-full flex-col bg-gray-50 shadow-2xl pointer-events-auto">
                <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white shadow-sm">
                  <div className="flex items-center space-x-2">
                  <span className="text-lg font-semibold text-gray-900">
                    {(() => {
                      // Look for the card in both layoutCards and workflowMolecules
                      let card = Array.isArray(layoutCards) ? layoutCards.find(c => c.id === expandedCard) : undefined;
                      
                      // If not found in layoutCards, look in workflowMolecules
                      if (!card && Array.isArray(workflowMolecules)) {
                        for (const molecule of workflowMolecules) {
                          const moleculeCards = Array.isArray(layoutCards) ? 
                            layoutCards.filter(c => c.moleculeId === molecule.moleculeId) : [];
                          card = moleculeCards.find(c => c.id === expandedCard);
                          if (card) break;
                        }
                      }
                      
                      if (!card) return 'Card';
                      return card.moleculeTitle
                        ? (card.atoms.length > 0 ? `${card.moleculeTitle} - ${card.atoms[0].title}` : card.moleculeTitle)
                        : card.atoms.length > 0
                          ? card.atoms[0].title
                          : 'Card';
                    })()}
                  </span>
                  </div>
                  <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setExpandedCard(null)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Close Fullscreen"
                  >
                    <X className="w-5 h-5 text-gray-500" />
                  </button>
                  </div>
                </div>

                {/* Fullscreen Content */}
                <div className="flex-1 flex flex-col px-8 py-4 space-y-4 overflow-auto">
                {(() => {
                // Look for the card in both layoutCards and workflowMolecules
                let card = Array.isArray(layoutCards) ? layoutCards.find(c => c.id === expandedCard) : undefined;
                
                // If not found in layoutCards, look in workflowMolecules
                if (!card && Array.isArray(workflowMolecules)) {
                  for (const molecule of workflowMolecules) {
                    const moleculeCards = Array.isArray(layoutCards) ? 
                      layoutCards.filter(c => c.moleculeId === molecule.moleculeId) : [];
                    card = moleculeCards.find(c => c.id === expandedCard);
                    if (card) break;
                  }
                }
                
                if (!card) return null;

                  return card.atoms.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center border-2 border-dashed border-gray-300 rounded-lg min-h-[400px]">
                      <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                        <Grid3X3 className="w-10 h-10 text-gray-400" />
                      </div>
                      <p className="text-gray-500 text-lg mb-2">No atoms in this section</p>
                      <p className="text-sm text-gray-400">Configure this atom for your application</p>
                    </div>
                  ) : (
                    <div className={`grid gap-6 w-full overflow-visible ${card.atoms.length === 1 ? 'grid-cols-1' : card.atoms.length === 2 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3'}`}>
                      {card.atoms.map((atom) => (
                        <AtomBox
                          key={`${atom.id}-expanded`}
                          className="p-6 border border-gray-200 bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 min-h-[400px] flex flex-col overflow-visible"
                        >
                          {/* Atom Header */}
                          <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center space-x-2">
                              <div className={`w-3 h-3 ${atom.color} rounded-full`}></div>
                              <h4 className="font-semibold text-gray-900 text-lg">{atom.title}</h4>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                removeAtom(card.id, atom.id);
                              }}
                              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                              <Trash2 className="w-4 h-4 text-gray-400" />
                            </button>
                          </div>

                          {/* Atom Content */}
                          <div className="w-full flex-1 overflow-visible">
                            {atom.atomId === 'text-box' ? (
                              <TextBoxEditor textId={atom.id} />
                            ) : atom.atomId === 'data-upload-validate' ? (
                              <DataUploadValidateAtom atomId={atom.id} />
                            ) : atom.atomId === 'feature-overview' ? (
                              <FeatureOverviewAtom atomId={atom.id} />
                            ) : atom.atomId === 'clustering' ? (
                              <ClusteringAtom atomId={atom.id} />
                            ) : atom.atomId === 'explore' ? (
                              <ExploreAtom atomId={atom.id} />
                            ) : atom.atomId === 'chart-maker' ? (
                              <ChartMakerAtom atomId={atom.id} />
                            ) : atom.atomId === 'concat' ? (
                              <ConcatAtom atomId={atom.id} />
                            ) : atom.atomId === 'merge' ? (
                              <MergeAtom atomId={atom.id} />
                            ) : atom.atomId === 'column-classifier' ? (
                              <ColumnClassifierAtom atomId={atom.id} />
                            ) : atom.atomId === 'dataframe-operations' ? (
                              <DataFrameOperationsAtom atomId={atom.id} />
                            ) : atom.atomId === 'create-column' ? (
                              <CreateColumnAtom atomId={atom.id} />
                            ) : atom.atomId === 'groupby-wtg-avg' ? (
                              <GroupByAtom atomId={atom.id} />
                            ) : atom.atomId === 'build-model-feature-based' ? (
                              <BuildModelFeatureBasedAtom atomId={atom.id} />
                            ) : atom.atomId === 'scenario-planner' ? (
                              <ScenarioPlannerAtom atomId={atom.id} />
                            ) : atom.atomId === 'select-models-feature' ? (
                              <SelectModelsFeatureAtom atomId={atom.id} />
                            ) : atom.atomId === 'evaluate-models-feature' ? (
                              <EvaluateModelsFeatureAtom atomId={atom.id} />
                            ) : atom.atomId === 'scope-selector' ? (
                              <ScopeSelectorAtom atomId={atom.id} />
                            ) : atom.atomId === 'correlation' ? (
                              <CorrelationAtom atomId={atom.id} />
                            ) : atom.atomId === 'auto-regressive-models' ? (
                              <AutoRegressiveModelsAtom atomId={atom.id} />
                            ) : atom.atomId === 'select-models-auto-regressive' ? (
                              <SelectModelsAutoRegressiveAtom atomId={atom.id} />
                            ) : atom.atomId === 'evaluate-models-auto-regressive' ? (
                              <EvaluateModelsAutoRegressiveAtom atomId={atom.id} />
                            ) : (
                              <div>
                                <h4 className="font-semibold text-gray-900 mb-2 text-lg">{atom.title}</h4>
                                <p className="text-sm text-gray-600 mb-3">{atom.category}</p>
                                <p className="text-sm text-gray-500">
                                  Configure this atom for your application
                                </p>
                              </div>
                            )}
                          </div>
                        </AtomBox>
                      ))}
                    </div>
                  );
                })()}
                </div>
              </div>
            </div>,
            document.body,
          )}
      </>
    );
  }

  return (
    <div className="h-full w-full bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm overflow-auto">
      <div className={canEdit ? '' : 'pointer-events-none'}>
      {/* Layout Cards Container */}
      <div className="p-6 space-y-6 w-full">
        {Array.isArray(layoutCards) && layoutCards.length > 0 && layoutCards.map((card, index) => {
          const cardTitle = card.moleculeTitle
            ? (card.atoms.length > 0 ? `${card.moleculeTitle} - ${card.atoms[0].title}` : card.moleculeTitle)
            : card.atoms.length > 0
              ? card.atoms[0].title
              : 'Card';
          return (
          <React.Fragment key={card.id}>
          <Card
            data-card-id={card.id}
            className={`w-full ${collapsedCards[card.id] ? '' : 'min-h-[200px]'} bg-white rounded-2xl border-2 transition-all duration-300 flex flex-col overflow-hidden ${
              dragOver === card.id
                ? 'border-[#458EE2] bg-gradient-to-br from-blue-50 to-blue-100 shadow-lg'
                : 'border-gray-200 shadow-sm hover:shadow-md'
            }`}
            onClick={(e) => handleCardClick(e, card.id, card.isExhibited)}
            onDragOver={(e) => handleDragOver(e, card.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, card.id)}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium text-gray-700">
                  {cardTitle}
                </span>
                <AIChatBot
                  cardId={card.id}
                  cardTitle={cardTitle}
                  onAddAtom={(id, atom) => addAtomByName(id, atom)}
                  disabled={card.atoms.length > 0}
                />
                {card.atoms.length > 0 && (
                  <button
                    onClick={e => handleCardSettingsClick(e, card.id, card.isExhibited)}
                    className="p-1 hover:bg-gray-100 rounded"
                    title="Card Settings"
                  >
                    <Settings className="w-4 h-4 text-gray-400" />
                  </button>
                )}
                <button
                  onClick={e => {
                    e.stopPropagation();
                    refreshCardAtoms(card.id);
                  }}
                  className="p-1 hover:bg-gray-100 rounded"
                  title="Refresh Atom"
                >
                  <RefreshCcw className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={e => { e.stopPropagation(); deleteCard(card.id); }}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <Trash2 className="w-4 h-4 text-gray-400" />
                </button>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    toggleCardExpand(card.id);
                  }}
                  className="p-1 hover:bg-gray-100 rounded"
                  title="Expand Card"
                >
                  <Maximize2 className="w-4 h-4 text-gray-400" />
                </button>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    toggleCardCollapse(card.id);
                  }}
                  className="p-1 hover:bg-gray-100 rounded"
                  title="Toggle Card"
                >
                  {collapsedCards[card.id] ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <Minus className="w-4 h-4 text-gray-400" />
                  )}
                </button>
              </div>
            </div>

            {/* Card Content */}
            <div className={`flex-1 flex flex-col p-4 overflow-y-auto ${collapsedCards[card.id] ? 'hidden' : ''}`}>
              {card.atoms.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center border-2 border-dashed border-gray-300 rounded-lg min-h-[140px] mb-4">
                  <AtomSuggestion
                    cardId={card.id}
                    isVisible={true}
                    onClose={() => setShowAtomSuggestion(prev => ({ ...prev, [card.id]: false }))}
                    onAddAtom={handleAddAtomFromSuggestion}
                  />
                </div>
              ) : (
                <div
                  className={`grid gap-4 w-full ${
                    card.atoms.length === 1
                      ? 'grid-cols-1'
                      : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
                  }`}
                >
                  {card.atoms.map((atom) => (
                    <AtomBox
                      key={atom.id}
                      className="p-4 cursor-pointer hover:shadow-lg transition-all duration-200 group border border-gray-200 bg-white overflow-hidden"
                      onClick={(e) => handleAtomClick(e, atom.id)}
                    >
                      {/* Atom Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-1">
                          <div className={`w-3 h-3 ${atom.color} rounded-full`}></div>
                          <AtomAIChatBot
                            atomId={atom.id}
                            atomType={atom.atomId}
                            atomTitle={atom.title}
                            disabled={!LLM_MAP[atom.atomId]}
                            className="transition-transform hover:scale-110"
                          />
                          <button
                            onClick={e => handleAtomSettingsClick(e, atom.id)}
                            className="p-1 hover:bg-gray-100 rounded transition-transform hover:scale-110"
                            title="Atom Settings"
                          >
                            <Settings className="w-4 h-4 text-gray-400" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onAtomSelect) {
                                onAtomSelect(atom.id);
                              }
                              onToggleHelpPanel?.();
                            }}
                            className="p-1 hover:bg-gray-100 rounded transition-transform hover:scale-110"
                            title="Help"
                          >
                            <span className="w-4 h-4 text-gray-400 text-base font-bold flex items-center justify-center">?</span>
                          </button>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeAtom(card.id, atom.id);
                          }}
                          className="p-1 hover:bg-gray-100 rounded transition-transform hover:scale-110"
                        >
                          <Trash2 className="w-4 h-4 text-gray-400" />
                        </button>
                      </div>
                      
                      {/* Atom Content */}
                      {atom.atomId === 'text-box' ? (
                        <TextBoxEditor textId={atom.id} />
                      ) : atom.atomId === 'data-upload-validate' ? (
                        <DataUploadValidateAtom atomId={atom.id} />
                      ) : atom.atomId === 'feature-overview' ? (
                        <FeatureOverviewAtom atomId={atom.id} />
                      ) : atom.atomId === 'clustering' ? (
                        <ClusteringAtom atomId={atom.id} />
                      ) : atom.atomId === 'explore' ? (
                        <ExploreAtom atomId={atom.id} />
                      ) : atom.atomId === 'chart-maker' ? (
                        <ChartMakerAtom atomId={atom.id} />
                      ) : atom.atomId === 'concat' ? (
                        <ConcatAtom atomId={atom.id} />
                      ) : atom.atomId === 'merge' ? (
                        <MergeAtom atomId={atom.id} />
                      ) : atom.atomId === 'column-classifier' ? (
                        <ColumnClassifierAtom atomId={atom.id} />
                      ) : atom.atomId === 'dataframe-operations' ? (
                        <DataFrameOperationsAtom atomId={atom.id} />
                      ) : atom.atomId === 'create-column' ? (
                        <CreateColumnAtom atomId={atom.id} />
                      ) : atom.atomId === 'groupby-wtg-avg' ? (
                        <GroupByAtom atomId={atom.id} />
                      ) : atom.atomId === 'build-model-feature-based' ? (
                          <BuildModelFeatureBasedAtom atomId={atom.id} />
                       ) : atom.atomId === 'scenario-planner' ? (
                          <ScenarioPlannerAtom atomId={atom.id} />
                       ) : atom.atomId === 'select-models-feature' ? (
                        <SelectModelsFeatureAtom atomId={atom.id} />
                       ) : atom.atomId === 'evaluate-models-feature' ? (
                        <EvaluateModelsFeatureAtom atomId={atom.id} />
                       ) : atom.atomId === 'scope-selector' ? (
                        <ScopeSelectorAtom atomId={atom.id} />
                      ) : atom.atomId === 'correlation' ? (
                        <CorrelationAtom atomId={atom.id} />
                      ) : atom.atomId === 'auto-regressive-models' ? (
                        <AutoRegressiveModelsAtom atomId={atom.id} />
                      ) : atom.atomId === 'select-models-auto-regressive' ? (
                        <SelectModelsAutoRegressiveAtom atomId={atom.id} />
                      ) : atom.atomId === 'evaluate-models-auto-regressive' ? (
                        <EvaluateModelsAutoRegressiveAtom atomId={atom.id} />
                      ) : (
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-1 text-sm">{atom.title}</h4>
                          <p className="text-xs text-gray-600 mb-2">{atom.category}</p>
                          <p className="text-xs text-gray-500">
                            Configure this atom for your application
                          </p>
                        </div>
                      )}
                    </AtomBox>
                  ))}
                </div>
              )}
            </div>
          </Card>
          {index < (Array.isArray(layoutCards) ? layoutCards.length : 0) - 1 && (
            <div className="flex justify-center my-4">
              <button
                onClick={() => addNewCard(undefined, index + 1)}
                onDragEnter={e => handleAddDragEnter(e, `p-${index}`)}
                onDragLeave={handleAddDragLeave}
                onDragOver={e => e.preventDefault()}
                onDrop={e => {
                  void handleDropNewCard(e, undefined, index + 1);
                }}
                className={`flex flex-col items-center justify-center px-2 py-2 bg-white border-2 border-dashed rounded-xl hover:border-[#458EE2] hover:bg-blue-50 transition-all duration-500 ease-in-out group ${addDragTarget === `p-${index}` ? 'min-h-[160px] w-full border-[#458EE2] bg-blue-50' : 'border-gray-300'}`}
                title="Add new card"
              >
                <Plus className={`w-5 h-5 text-gray-400 group-hover:text-[#458EE2] transition-transform duration-500 ${addDragTarget === `p-${index}` ? 'scale-125 mb-2' : ''}`} />
                <span
                  className="w-0 h-0 overflow-hidden ml-0 group-hover:ml-2 group-hover:w-[120px] group-hover:h-auto text-gray-600 group-hover:text-[#458EE2] font-medium whitespace-nowrap transition-all duration-500 ease-in-out"
                >
                  Add New Card
                </span>
              </button>
            </div>
          )}
          </React.Fragment>
          );
        })}

        {/* Add New Card Button */}
        <div className="flex justify-center">
          <button
            onClick={() => addNewCard()}
            onDragEnter={e => handleAddDragEnter(e, 'end')}
            onDragLeave={handleAddDragLeave}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              void handleDropNewCard(e);
            }}
            className={`flex flex-col items-center justify-center px-2 py-2 bg-white border-2 border-dashed rounded-xl hover:border-[#458EE2] hover:bg-blue-50 transition-all duration-500 ease-in-out group ${addDragTarget === 'end' ? 'min-h-[160px] w-full border-[#458EE2] bg-blue-50' : 'border-gray-300'}`}
          >
            <Plus className={`w-5 h-5 text-gray-400 group-hover:text-[#458EE2] transition-transform duration-500 ${addDragTarget === 'end' ? 'scale-125 mb-2' : ''}`} />
            <span
              className="w-0 h-0 overflow-hidden ml-0 group-hover:ml-2 group-hover:w-[120px] group-hover:h-auto text-gray-600 group-hover:text-[#458EE2] font-medium whitespace-nowrap transition-all duration-500 ease-in-out"
            >
              Add New Card
            </span>
          </button>
        </div>
      </div>
      </div>

      {/* Fullscreen Card Modal */}
      {expandedCard &&
        createPortal(
          <div
            className="fixed inset-0 z-40 pointer-events-none"
            role="dialog"
            aria-modal="true"
          >
            <div
              className="absolute inset-0 bg-black/40 pointer-events-auto"
              aria-hidden="true"
              onClick={() => setExpandedCard(null)}
            />
            <div className="relative flex h-full w-full flex-col bg-gray-50 shadow-2xl pointer-events-auto">
              <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white shadow-sm">
                <div className="flex items-center space-x-2">
                <span className="text-lg font-semibold text-gray-900">
                  {(() => {
                    const card = Array.isArray(layoutCards) ? layoutCards.find(c => c.id === expandedCard) : undefined;
                    if (!card) return 'Card';
                    return card.moleculeTitle
                      ? (card.atoms.length > 0 ? `${card.moleculeTitle} - ${card.atoms[0].title}` : card.moleculeTitle)
                      : card.atoms.length > 0
                        ? card.atoms[0].title
                        : 'Card';
                  })()}
                </span>
                </div>
                <div className="flex items-center space-x-2">
                <button
                  onClick={() => setExpandedCard(null)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Close Fullscreen"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
                </div>
              </div>

              {/* Fullscreen Content */}
              <div className="flex-1 flex flex-col px-8 py-4 space-y-4 overflow-auto">
                {(() => {
                const card = Array.isArray(layoutCards) ? layoutCards.find(c => c.id === expandedCard) : undefined;
                if (!card) return null;

                return card.atoms.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center border-2 border-dashed border-gray-300 rounded-lg min-h-[400px]">
                    <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mb-6">
                      <Grid3X3 className="w-10 h-10 text-gray-400" />
                    </div>
                    <p className="text-gray-500 text-lg mb-2">No atoms in this section</p>
                    <p className="text-sm text-gray-400">Configure this atom for your application</p>
                  </div>
                ) : (
                  <div className={`grid gap-6 w-full overflow-visible ${card.atoms.length === 1 ? 'grid-cols-1' : card.atoms.length === 2 ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3'}`}>
                    {card.atoms.map((atom) => (
                      <AtomBox
                        key={`${atom.id}-expanded`}
                        className="p-6 border border-gray-200 bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 min-h-[400px] flex flex-col overflow-visible"
                      >
                        {/* Atom Header */}
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center space-x-2">
                            <div className={`w-3 h-3 ${atom.color} rounded-full`}></div>
                            <h4 className="font-semibold text-gray-900 text-lg">{atom.title}</h4>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              removeAtom(card.id, atom.id);
                            }}
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4 text-gray-400" />
                          </button>
                        </div>

                        {/* Atom Content */}
                        <div className="w-full flex-1 overflow-visible">
                          {atom.atomId === 'text-box' ? (
                            <TextBoxEditor textId={atom.id} />
                          ) : atom.atomId === 'data-upload-validate' ? (
                            <DataUploadValidateAtom atomId={atom.id} />
                          ) : atom.atomId === 'feature-overview' ? (
                            <FeatureOverviewAtom atomId={atom.id} />
                          ) : atom.atomId === 'clustering' ? (
                            <ClusteringAtom atomId={atom.id} />
                          ) : atom.atomId === 'explore' ? (
                            <ExploreAtom atomId={atom.id} />
                          ) : atom.atomId === 'chart-maker' ? (
                            <ChartMakerAtom atomId={atom.id} />
                          ) : atom.atomId === 'concat' ? (
                            <ConcatAtom atomId={atom.id} />
                          ) : atom.atomId === 'merge' ? (
                            <MergeAtom atomId={atom.id} />
                          ) : atom.atomId === 'column-classifier' ? (
                            <ColumnClassifierAtom atomId={atom.id} />
                          ) : atom.atomId === 'dataframe-operations' ? (
                            <DataFrameOperationsAtom atomId={atom.id} />
                          ) : atom.atomId === 'create-column' ? (
                            <CreateColumnAtom atomId={atom.id} />
                          ) : atom.atomId === 'groupby-wtg-avg' ? (
                            <GroupByAtom atomId={atom.id} />
                          ) : atom.atomId === 'build-model-feature-based' ? (
                            <BuildModelFeatureBasedAtom atomId={atom.id} />
                          ) : atom.atomId === 'scenario-planner' ? (
                            <ScenarioPlannerAtom atomId={atom.id} />
                          ) : atom.atomId === 'select-models-feature' ? (
                            <SelectModelsFeatureAtom atomId={atom.id} />
                          ) : atom.atomId === 'evaluate-models-feature' ? (
                            <EvaluateModelsFeatureAtom atomId={atom.id} />
                          ) : atom.atomId === 'scope-selector' ? (
                            <ScopeSelectorAtom atomId={atom.id} />
                          ) : atom.atomId === 'correlation' ? (
                            <CorrelationAtom atomId={atom.id} />
                          ) : (
                            <div>
                              <h4 className="font-semibold text-gray-900 mb-2 text-lg">{atom.title}</h4>
                              <p className="text-sm text-gray-600 mb-3">{atom.category}</p>
                              <p className="text-sm text-gray-500">
                                Configure this atom for your application
                              </p>
                            </div>
                          )}
                        </div>
                      </AtomBox>
                    ))}
                  </div>
                );
              })()}
              </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
});

export default CanvasArea;