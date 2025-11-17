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
import { resolveTaskResponse } from '@/lib/taskQueue';
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
import PivotTableAtom from '@/components/AtomList/atoms/pivot-table/PivotTableAtom';
import UnpivotAtom from '@/components/AtomList/atoms/unpivot/UnpivotAtom';
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
  DEFAULT_PIVOT_TABLE_SETTINGS,
  DEFAULT_UNPIVOT_SETTINGS,
} from '../../store/laboratoryStore';
import { deriveWorkflowMolecules, WorkflowMolecule, buildUnifiedRenderArray, UnifiedRenderItem } from './helpers';
import { LABORATORY_PROJECT_STATE_API } from '@/lib/api';
import { getActiveProjectContext } from '@/utils/projectEnv';


interface CanvasAreaProps {
  onAtomSelect?: (atomId: string) => void;
  onCardSelect?: (cardId: string, exhibited: boolean) => void;
  selectedCardId?: string;
  onToggleSettingsPanel?: () => void;
  onToggleHelpPanel?: () => void;
  canEdit: boolean;
  cardEditors?: Map<string, {
    card_id: string;
    user_email: string;
    user_name: string;
    user_color: string;
    client_id: string;
  }>;
  onCardFocus?: (cardId: string) => void;
  onCardBlur?: (cardId: string) => void;
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
  'pivot-table': 'Agent Pivot Table',
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

  return rawCards.map((card: any) => ({
    id: card.id,
    atoms: Array.isArray(card.atoms)
      ? card.atoms.map((atom: any) => hydrateDroppedAtom(atom))
      : [],
    isExhibited: !!card.isExhibited,
    moleculeId: card.moleculeId,
    moleculeTitle: card.moleculeTitle,
    order: card.order,
    afterMoleculeId: card.afterMoleculeId ?? card.after_molecule_id ?? undefined,
    beforeMoleculeId: card.beforeMoleculeId ?? card.before_molecule_id ?? undefined,
  }));
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

    console.info('[Laboratory API] Fetching atom configurations from MongoDB', {
      url: requestUrl,
      project: projectContext.project_name,
    });

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
    console.log('[Laboratory API] MongoDB response data:', data);

    if (data.status === 'ok' && data.cards && Array.isArray(data.cards)) {
      console.info('[Laboratory API] Successfully fetched atom configurations from MongoDB', {
        cardsCount: data.cards.length,
        workflowMoleculesCount: data.workflow_molecules?.length || 0,
      });

      // The backend already returns cards in the correct format, so we can use them directly
      // FIX: Ensure data.cards is an array before mapping
      if (!Array.isArray(data.cards)) {
        console.error('[Laboratory API] data.cards is not an array:', data.cards);
        return null;
      }

      const cards = data.cards.map((card: any) => {
        // Handle both camelCase (moleculeId) and snake_case (molecule_id) from backend
        // IMPORTANT: Preserve undefined/null values - these distinguish standalone cards
        const moleculeId = card.moleculeId ?? card.molecule_id ?? undefined;
        const moleculeTitle = card.moleculeTitle ?? card.molecule_title ?? undefined;

        // Get atomId for logging
        const atomId = card.atoms?.[0]?.atomId || 'unknown';

        console.log('[Laboratory API] Processing card from MongoDB:', {
          cardId: card.id,
          atomId: atomId,
          moleculeId: moleculeId,
          moleculeTitle: moleculeTitle,
          atomsCount: card.atoms?.length || 0,
          rawMoleculeId: card.moleculeId,
          rawMolecule_id: card.molecule_id,
          isStandalone: !moleculeId
        });

        // CRITICAL: Preserve moleculeId even if it's null/undefined
        // Cards with moleculeId belong to molecules, cards without are standalone
        // DO NOT remove or modify undefined/null values
        const processedCard: LayoutCard = {
          id: card.id,
          atoms: card.atoms || [],
          isExhibited: card.isExhibited || false,
          moleculeId: moleculeId, // Preserve undefined/null to distinguish standalone cards
          moleculeTitle: moleculeTitle,
          order: card.order,
          afterMoleculeId: card.afterMoleculeId ?? card.after_molecule_id ?? undefined,
          beforeMoleculeId: card.beforeMoleculeId ?? card.before_molecule_id ?? undefined,
        };

        // Validation: Log warning if we expected moleculeId but it's missing
        if (!moleculeId && card.atoms?.length > 0) {
          console.log(`[Laboratory API] ✓ Card ${card.id} (atom: ${atomId}) is standalone (no moleculeId)`);
        } else if (moleculeId) {
          console.log(`[Laboratory API] ✓ Card ${card.id} (atom: ${atomId}) belongs to molecule ${moleculeId}`);
        }

        return processedCard;
      });

      // Debug: Count cards with/without moleculeId
      const cardsWithMoleculeId = cards.filter(c => c.moleculeId);
      const standaloneCards = cards.filter(c => !c.moleculeId);
      console.log('[Laboratory API] Card summary:', {
        total: cards.length,
        withMoleculeId: cardsWithMoleculeId.length,
        standalone: standaloneCards.length,
        withMoleculeIdDetails: cardsWithMoleculeId.map(c => ({
          cardId: c.id,
          atomId: c.atoms[0]?.atomId,
          moleculeId: c.moleculeId
        })),
        standaloneDetails: standaloneCards.map(c => ({
          cardId: c.id,
          atomId: c.atoms[0]?.atomId
        }))
      });

      // Use workflow molecules from backend - restore isActive and moleculeIndex
      // Sort by moleculeIndex to preserve order, then remove moleculeIndex (it's just for ordering)
      const workflowMoleculesRaw = data.workflow_molecules || [];
      let workflowMolecules: WorkflowMolecule[] = [];

      if (workflowMoleculesRaw.length > 0 && workflowMoleculesRaw[0].hasOwnProperty('moleculeIndex')) {
        // New format with moleculeIndex - sort by it and preserve isActive
        workflowMoleculesRaw.sort((a: any, b: any) => {
          const indexA = a.moleculeIndex !== undefined ? a.moleculeIndex : 999999;
          const indexB = b.moleculeIndex !== undefined ? b.moleculeIndex : 999999;
          return indexA - indexB;
        });

        workflowMolecules = workflowMoleculesRaw.map((mol: any) => ({
          moleculeId: mol.moleculeId,
          moleculeTitle: mol.moleculeTitle,
          atoms: mol.atoms || [],
          isActive: mol.isActive !== false // Default to true if not specified
        }));

        console.log('[Laboratory API] Restored workflow molecules from MongoDB with isActive and moleculeIndex:', {
          count: workflowMolecules.length,
          molecules: workflowMolecules.map((m, idx) => ({
            index: idx,
            moleculeId: m.moleculeId,
            moleculeTitle: m.moleculeTitle,
            isActive: m.isActive,
            originalMoleculeIndex: workflowMoleculesRaw[idx]?.moleculeIndex
          }))
        });
      } else {
        // Old format - use as-is (backward compatibility)
        workflowMolecules = workflowMoleculesRaw;
        console.log('[Laboratory API] Using workflow molecules from MongoDB (old format, no moleculeIndex):', workflowMolecules);
      }

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

const buildAtomPositions = (atomOrder: string[] = []) =>
  atomOrder.map((atomId, index) => ({
    atomId,
    order: index,
  }));

const CanvasArea = React.forwardRef<CanvasAreaRef, CanvasAreaProps>(({
  onAtomSelect,
  onCardSelect,
  selectedCardId,
  onToggleSettingsPanel,
  onToggleHelpPanel,
  canEdit,
  cardEditors,
  onCardFocus,
  onCardBlur,
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
  const [pendingChanges, setPendingChanges] = useState<{
    deletedMolecules: string[];
    deletedAtoms: { moleculeId: string; atomId: string }[];
    addedAtoms: { moleculeId: string; atomId: string; position: number }[];
  }>({
    deletedMolecules: [],
    deletedAtoms: [],
    addedAtoms: []
  });
  const [atomToDelete, setAtomToDelete] = useState<{cardId: string, atomId: string, atomTitle: string} | null>(null);
  const [deleteAtomDialogOpen, setDeleteAtomDialogOpen] = useState(false);
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
  const { setCards } = useExhibitionStore();
  const { toast } = useToast();

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

  // Removed: Card focus/blur is now handled only by mouse events (hover)

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
          const raw = await res.json();
          const data = await resolveTaskResponse<{ summary?: ColumnInfo[] }>(raw);
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
      fromMongoDB: boolean = false, // Flag to indicate if cards are from MongoDB
    ) => {
      if (!isMounted) {
        return;
      }

      console.log('[Laboratory API] applyInitialCards called with:', {
        cardsCount: cards?.length || 0,
        workflowOverrideCount: workflowOverride?.length || 0,
        fromMongoDB,
        cards: cards
      });

      const normalizedCards = Array.isArray(cards) ? cards : [];
      console.log('[Laboratory API] Normalized cards:', normalizedCards);

      // Debug: Check molecule info in cards
      const cardsWithMoleculeInfo = normalizedCards.filter(card => card.moleculeId);
      const cardsWithoutMoleculeInfo = normalizedCards.filter(card => !card.moleculeId);
      console.log('[Laboratory API] Cards with molecule info:', cardsWithMoleculeInfo.length);
      console.log('[Laboratory API] Cards without molecule info (standalone):', cardsWithoutMoleculeInfo.length);

      // IMPORTANT: If cards are from MongoDB, trust the moleculeId values as-is.
      // MongoDB is the source of truth - cards with moleculeId belong to molecules,
      // cards without moleculeId are standalone. Don't try to "fix" them.
      if (fromMongoDB) {
        console.log('[Laboratory API] Cards from MongoDB - trusting moleculeId values as-is');
        // MongoDB cards should already have correct moleculeId values
        // Cards with moleculeId belong to molecules, cards without are standalone
        setLayoutCards(normalizedCards);
      } else if (cardsWithoutMoleculeInfo.length > 0) {
        // Only try to fetch molecule info if cards are NOT from MongoDB (e.g., from localStorage fallback)
        console.log('[Laboratory API] Cards from localStorage - attempting to fetch molecule information from MongoDB');

        // Try to fetch molecule information from MongoDB
        fetchAtomConfigurationsFromMongoDB()
          .then((mongoData) => {
            if (mongoData && mongoData.cards.length > 0) {
              console.log('[Laboratory API] Found MongoDB data with molecule info, updating cards');

              // Create a map of MongoDB cards by their CARD ID (not atomId) for accurate matching
              const mongoCardMap = new Map<string, LayoutCard>();
              mongoData.cards.forEach(mongoCard => {
                // Match by card ID if available, otherwise skip
                if (mongoCard.id) {
                  mongoCardMap.set(mongoCard.id, mongoCard);
                }
              });

              // Update cards with molecule information from MongoDB - match by card ID
              const updatedCards = normalizedCards.map(card => {
                // Only update if we can match by card ID AND the card doesn't already have moleculeId
                if (card.id && mongoCardMap.has(card.id) && !card.moleculeId) {
                  const mongoCard = mongoCardMap.get(card.id)!;
                  console.log(`[Laboratory API] Updating card ${card.id} with molecule info from MongoDB:`, {
                    moleculeId: mongoCard.moleculeId,
                    moleculeTitle: mongoCard.moleculeTitle
                  });
                  return {
                    ...card,
                    moleculeId: mongoCard.moleculeId,
                    moleculeTitle: mongoCard.moleculeTitle
                  };
                }
                // Preserve existing moleculeId if card already has it, or keep as standalone if it doesn't
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
              console.log('[Laboratory API] No MongoDB data found, using cards as-is');
              setLayoutCards(normalizedCards);
            }
          })
          .catch((error) => {
            console.error('[Laboratory API] Failed to fetch molecule info from MongoDB:', error);
            console.log('[Laboratory API] Using cards as-is without molecule info');
            setLayoutCards(normalizedCards);
          });
      } else {
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

      // Ensure all molecules default to isActive: true (unless explicitly set to false)
      const moleculesWithActiveFlag = validWorkflow.map(mol => ({
        ...mol,
        isActive: mol.isActive !== false // Default to true if not specified
      }));

      setWorkflowMolecules(moleculesWithActiveFlag);

      // Set all workflow molecules as collapsed by default when session restarts
      // This ensures molecules are collapsed on page refresh/reload
        const initialCollapsedState: Record<string, boolean> = {};
      moleculesWithActiveFlag.forEach(molecule => {
        // Only set collapsed state for active molecules
        if (molecule.isActive !== false) {
          initialCollapsedState[molecule.moleculeId] = true; // true = collapsed
        }
        });
      console.log('[Laboratory API] Setting all molecules to collapsed by default on session restart:', initialCollapsedState);
        setCollapsedMolecules(initialCollapsedState);

      // Validate and fix standalone card orders
      // Standalone cards with order values referencing non-existent molecule indices
      // should be recalculated or assigned to valid positions
      // NEW: Use afterMoleculeId/beforeMoleculeId references if available for more robust positioning
      // IMPORTANT: Account for inactive molecules (isActive: false) when resolving references
      const fixedCards = normalizedCards.map((card, cardIndex) => {
        // Only process standalone cards (cards without moleculeId)
        if (card.moleculeId) {
          return card; // Cards with moleculeId don't need order validation
        }

        // NEW: Try to use afterMoleculeId/beforeMoleculeId references first (more robust)
        if (card.afterMoleculeId || card.beforeMoleculeId) {
          // Find molecule indices in the FULL workflow array (including inactive)
          // But we only use active molecules for positioning calculations
          const activeMolecules = moleculesWithActiveFlag.filter(m => m.isActive !== false);

          const afterMolecule = card.afterMoleculeId 
            ? moleculesWithActiveFlag.find(m => m.moleculeId === card.afterMoleculeId)
            : null;
          const beforeMolecule = card.beforeMoleculeId
            ? moleculesWithActiveFlag.find(m => m.moleculeId === card.beforeMoleculeId)
            : null;

          const afterIsActive = afterMolecule ? afterMolecule.isActive !== false : false;
          const beforeIsActive = beforeMolecule ? beforeMolecule.isActive !== false : false;

          const afterIndex = afterMolecule && afterIsActive
            ? activeMolecules.findIndex(m => m.moleculeId === card.afterMoleculeId)
            : -1;
          const beforeIndex = beforeMolecule && beforeIsActive
            ? activeMolecules.findIndex(m => m.moleculeId === card.beforeMoleculeId)
            : -1;

          // Case 1: afterMoleculeId exists and is ACTIVE
          if (afterIndex >= 0) {
            // Count existing standalone cards after the same molecule (before this card)
            const existingCardsAfterMolecule = normalizedCards
              .slice(0, cardIndex)
              .filter(c => !c.moleculeId && c.afterMoleculeId === card.afterMoleculeId).length;

            const newOrder = (afterIndex * 1000) + (existingCardsAfterMolecule + 1);
            console.log(`[Laboratory API] Standalone card ${card.id} recalculated from afterMoleculeId: ${card.afterMoleculeId} (active index: ${afterIndex}) → order: ${newOrder}`);
            return {
              ...card,
              order: newOrder
            };
          }

          // Case 2: afterMoleculeId exists but is INACTIVE - find next active molecule after it
          if (afterMolecule && !afterIsActive) {
            // Find the original index in the full array
            const originalAfterIndex = moleculesWithActiveFlag.findIndex(m => m.moleculeId === card.afterMoleculeId);
            if (originalAfterIndex >= 0) {
              // Find the next active molecule after this inactive one
              let nextActiveIndex = -1;
              for (let i = originalAfterIndex + 1; i < moleculesWithActiveFlag.length; i++) {
                if (moleculesWithActiveFlag[i].isActive !== false) {
                  nextActiveIndex = activeMolecules.findIndex(m => m.moleculeId === moleculesWithActiveFlag[i].moleculeId);
                  break;
                }
              }

              if (nextActiveIndex >= 0) {
                // Place before the next active molecule (equivalent to after the inactive one)
                const previousMoleculeIndex = nextActiveIndex - 1;
                if (previousMoleculeIndex >= 0) {
                  const existingCardsAfterPrevious = normalizedCards
                    .slice(0, cardIndex)
                    .filter(c => {
                      if (!c.moleculeId && c.afterMoleculeId) {
                        const cAfterMol = moleculesWithActiveFlag.find(m => m.moleculeId === c.afterMoleculeId);
                        if (cAfterMol && cAfterMol.isActive !== false) {
                          const cAfterIndex = activeMolecules.findIndex(m => m.moleculeId === c.afterMoleculeId);
                          return cAfterIndex === previousMoleculeIndex;
                        }
                      }
                      return false;
                    }).length;

                  const newOrder = (previousMoleculeIndex * 1000) + (existingCardsAfterPrevious + 1);
                  console.log(`[Laboratory API] Standalone card ${card.id} afterMoleculeId ${card.afterMoleculeId} is inactive. Recalculated: after previous active molecule (index: ${previousMoleculeIndex}) → order: ${newOrder}`);
                  return {
                    ...card,
                    order: newOrder,
                    afterMoleculeId: activeMolecules[previousMoleculeIndex]?.moleculeId, // Update reference to active molecule
                  };
                } else {
                  // No previous active molecule - place at start
                  const newOrder = 0;
                  console.log(`[Laboratory API] Standalone card ${card.id} afterMoleculeId ${card.afterMoleculeId} is inactive. Recalculated: before first active molecule → order: ${newOrder}`);
                  return {
                    ...card,
                    order: newOrder,
                  };
                }
              } else {
                // No next active molecule - place after last active molecule
                if (activeMolecules.length > 0) {
                  const lastActiveIndex = activeMolecules.length - 1;
                  const existingCardsAfterLast = normalizedCards
                    .slice(0, cardIndex)
                    .filter(c => !c.moleculeId && c.afterMoleculeId === activeMolecules[lastActiveIndex]?.moleculeId).length;

                  const newOrder = (lastActiveIndex * 1000) + (existingCardsAfterLast + 1);
                  console.log(`[Laboratory API] Standalone card ${card.id} afterMoleculeId ${card.afterMoleculeId} is inactive. Recalculated: after last active molecule (index: ${lastActiveIndex}) → order: ${newOrder}`);
                  return {
                    ...card,
                    order: newOrder,
                    afterMoleculeId: activeMolecules[lastActiveIndex]?.moleculeId, // Update reference to active molecule
                  };
                }
              }
            }
          }

          // Case 3: beforeMoleculeId exists and is ACTIVE, and beforeIndex > 0
          if (beforeIndex >= 1) {
            const previousMoleculeIndex = beforeIndex - 1;
            // Count existing standalone cards after the previous molecule
            const existingCardsAfterPrevious = normalizedCards
              .slice(0, cardIndex)
              .filter(c => {
                if (!c.moleculeId && c.afterMoleculeId) {
                  const cAfterMol = moleculesWithActiveFlag.find(m => m.moleculeId === c.afterMoleculeId);
                  if (cAfterMol && cAfterMol.isActive !== false) {
                    const cAfterIndex = activeMolecules.findIndex(m => m.moleculeId === c.afterMoleculeId);
                    return cAfterIndex === previousMoleculeIndex;
                  }
                }
                return false;
              }).length;

            const newOrder = (previousMoleculeIndex * 1000) + (existingCardsAfterPrevious + 1);
            console.log(`[Laboratory API] Standalone card ${card.id} recalculated from beforeMoleculeId: ${card.beforeMoleculeId} (active index: ${beforeIndex}) → order: ${newOrder} (after previous molecule at index ${previousMoleculeIndex})`);
            return {
              ...card,
              order: newOrder
            };
          }

          // Case 4: beforeMoleculeId exists but is INACTIVE - find previous active molecule before it
          if (beforeMolecule && !beforeIsActive) {
            const originalBeforeIndex = moleculesWithActiveFlag.findIndex(m => m.moleculeId === card.beforeMoleculeId);
            if (originalBeforeIndex >= 0) {
              // Find the previous active molecule before this inactive one
              let previousActiveIndex = -1;
              for (let i = originalBeforeIndex - 1; i >= 0; i--) {
                if (moleculesWithActiveFlag[i].isActive !== false) {
                  previousActiveIndex = activeMolecules.findIndex(m => m.moleculeId === moleculesWithActiveFlag[i].moleculeId);
                  break;
                }
              }

              if (previousActiveIndex >= 0) {
                const existingCardsAfterPrevious = normalizedCards
                  .slice(0, cardIndex)
                  .filter(c => {
                    if (!c.moleculeId && c.afterMoleculeId) {
                      const cAfterMol = moleculesWithActiveFlag.find(m => m.moleculeId === c.afterMoleculeId);
                      if (cAfterMol && cAfterMol.isActive !== false) {
                        const cAfterIndex = activeMolecules.findIndex(m => m.moleculeId === c.afterMoleculeId);
                        return cAfterIndex === previousActiveIndex;
                      }
                    }
                    return false;
                  }).length;

                const newOrder = (previousActiveIndex * 1000) + (existingCardsAfterPrevious + 1);
                console.log(`[Laboratory API] Standalone card ${card.id} beforeMoleculeId ${card.beforeMoleculeId} is inactive. Recalculated: after previous active molecule (index: ${previousActiveIndex}) → order: ${newOrder}`);
                return {
                  ...card,
                  order: newOrder,
                  afterMoleculeId: activeMolecules[previousActiveIndex]?.moleculeId, // Update reference
                };
              } else {
                // No previous active molecule - place at start
                const newOrder = 0;
                console.log(`[Laboratory API] Standalone card ${card.id} beforeMoleculeId ${card.beforeMoleculeId} is inactive. Recalculated: before first active molecule → order: ${newOrder}`);
                return {
                  ...card,
                  order: newOrder,
                };
              }
            }
          }

          // Case 5: beforeMoleculeId exists and is ACTIVE, but beforeIndex === 0 (before first molecule)
          if (beforeIndex === 0) {
            // Place before first molecule - use order 0
            const newOrder = 0;
            console.log(`[Laboratory API] Standalone card ${card.id} recalculated from beforeMoleculeId (first active molecule): ${card.beforeMoleculeId} → order: ${newOrder}`);
            return {
              ...card,
              order: newOrder
            };
          }

          // Case 6: References exist but molecules not found at all (were completely removed)
          console.warn(`[Laboratory API] Standalone card ${card.id} has references (afterMoleculeId: ${card.afterMoleculeId}, beforeMoleculeId: ${card.beforeMoleculeId}) but molecules not found. Using fallback logic.`);
        }

        // FALLBACK: Use existing order-based validation (for backwards compatibility or when references are invalid)
        // Check if standalone card has an order field
        if (card.order !== undefined && typeof card.order === 'number') {
          const moleculeIndex = Math.floor(card.order / 1000);
          const subOrder = card.order % 1000;

          // Validate that the moleculeIndex references an existing molecule in the workflow array
          // Note: We check against the full workflow array length (not just active), 
          // because order values use original molecule indices
          if (moleculeIndex >= 0 && moleculeIndex < moleculesWithActiveFlag.length) {
            // Order is valid, keep it
            console.log(`[Laboratory API] Standalone card ${card.id} has valid order: ${card.order} (moleculeIndex: ${moleculeIndex}, subOrder: ${subOrder})`);
            return card;
          } else {
            // Invalid moleculeIndex - this card should be placed after the last molecule
            // But preserve its subOrder relative to other orphaned cards
            // Use full workflow length (not just active) for consistency
            const newOrder = moleculesWithActiveFlag.length > 0 
              ? ((moleculesWithActiveFlag.length - 1) * 1000) + subOrder 
              : subOrder;
            console.warn(`[Laboratory API] Standalone card ${card.id} has invalid order: ${card.order} (moleculeIndex: ${moleculeIndex} but only ${moleculesWithActiveFlag.length} molecules exist). Recalculating to: ${newOrder}`);
            return {
              ...card,
              order: newOrder
            };
          }
        } else {
          // No order field - assign to after last molecule
          // Use full workflow length minus 1 (to place after last molecule)
          const newOrder = moleculesWithActiveFlag.length > 0 
            ? ((moleculesWithActiveFlag.length - 1) * 1000) + 1 
            : 1;
          console.warn(`[Laboratory API] Standalone card ${card.id} is missing order field. Assigning to: ${newOrder}`);
          return {
            ...card,
            order: newOrder
          };
        }
      });

      // Set cards with validated/fixed orders
      // FIX: Ensure fixedCards is always an array
      if (!Array.isArray(fixedCards)) {
        console.error('[Laboratory API] fixedCards is not an array:', fixedCards);
        setLayoutCards([]);
        return;
      }
      setLayoutCards(fixedCards);

      markLoadingComplete();
    };

    // PRIORITY: Fetch from MongoDB FIRST, then fall back to localStorage if MongoDB fails
    console.info('[Laboratory API] Starting data load - prioritizing MongoDB over localStorage');

    hasPendingAsyncLoad = true;
    fetchAtomConfigurationsFromMongoDB()
      .then((mongoData) => {
        if (!isMounted) {
          return;
        }

        if (mongoData && mongoData.cards && mongoData.cards.length > 0) {
          console.info('[Laboratory API] ✅ Successfully loaded data from MongoDB (primary source)', {
            cardsCount: mongoData.cards.length,
            workflowMoleculesCount: mongoData.workflowMolecules?.length || 0
          });
          applyInitialCards(mongoData.cards, mongoData.workflowMolecules || [], true); // fromMongoDB = true
          return; // Successfully loaded from MongoDB, no need to check localStorage
        } else {
          // FIX: If MongoDB returns empty cards array, clear workflow data and return to regular laboratory mode
          if (mongoData && Array.isArray(mongoData.cards) && mongoData.cards.length === 0) {
            console.info('[Laboratory API] ⚠️ MongoDB returned empty cards array - clearing workflow data and returning to regular laboratory mode');
            // Clear workflow-related localStorage items
            localStorage.removeItem('workflow-molecules');
            localStorage.removeItem('workflow-selected-atoms');
            localStorage.removeItem('workflow-data');
            // Apply empty cards with no workflow molecules to return to regular laboratory mode
            applyInitialCards([], [], true); // fromMongoDB = true, empty cards and workflow molecules
            return;
          }
          console.info('[Laboratory API] ⚠️ MongoDB returned no data, falling back to localStorage');
          // MongoDB returned null/undefined, fall back to localStorage
          return loadFromLocalStorage();
        }
      })
      .catch((error) => {
        if (!isMounted) {
          return;
        }
        console.warn('[Laboratory API] ⚠️ MongoDB fetch failed, falling back to localStorage', error);
        // MongoDB fetch failed, fall back to localStorage
        return loadFromLocalStorage();
      });

    // Helper function to load from localStorage (fallback only)
    function loadFromLocalStorage() {
      if (!isMounted) {
        return;
      }

      console.info('[Laboratory API] Attempting to load from localStorage (fallback)');

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
          console.info('[Laboratory API] ✅ Loaded from localStorage (workflow-selected-atoms)');
          if (initialCards && initialCards.length > 0) {
            applyInitialCards(initialCards, initialWorkflow);
            return;
          }
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
            console.info('[Laboratory API] ✅ Loaded from localStorage (workflow-data)');
            if (initialCards && initialCards.length > 0) {
              applyInitialCards(initialCards, initialWorkflow);
              return;
            }
        }
      } catch (e) {
        console.error('Failed to parse workflow-data', e);
        localStorage.removeItem('workflow-data');
      }
    }

      // If still no cards, try stored layout from localStorage
      if (!initialCards || initialCards.length === 0) {
      const storedLayout = localStorage.getItem(STORAGE_KEY);
      if (storedLayout && storedLayout !== 'undefined') {
        try {
          const raw = JSON.parse(storedLayout);
          initialCards = hydrateLayoutCards(raw);

            // Check for workflow molecules in localStorage
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

            console.info('[Laboratory API] ✅ Loaded from localStorage (stored layout)');
            if (initialCards && initialCards.length > 0) {
              applyInitialCards(initialCards, initialWorkflow);
              return;
            }
        } catch (e) {
          console.error('Failed to parse stored laboratory layout', e);
          localStorage.removeItem(STORAGE_KEY);
        }
      }

      // No data found in MongoDB or localStorage
      console.info('[Laboratory API] No data found in MongoDB or localStorage');
      markLoadingComplete();
    } else {
        // We have initialCards from workflow data, but need to check for workflow molecules
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
              applyInitialCards(initialCards, initialWorkflow);
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
  // useEffect(() => {
  //   setCards(layoutCards);
  // }, [layoutCards, setCards]);

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

  // Derive workflow molecules from layout cards when they change
  useEffect(() => {
    // Only run after initial loading is complete
    if (isCanvasLoading) return;

    // Check if we have layout cards with molecule info
    const hasCardsWithMoleculeId = Array.isArray(layoutCards) && 
      layoutCards.some(card => card.moleculeId);

    if (hasCardsWithMoleculeId) {
      // Derive workflow molecules from layout cards
      const derivedMolecules = deriveWorkflowMolecules(layoutCards);

      // Always update to keep molecules in sync with layout cards
      // CRITICAL: Preserve inactive molecules (isActive: false) to maintain positions
      setWorkflowMolecules(prev => {
        // Create a map of existing molecules by ID to preserve inactive ones
        const existingMoleculesMap = new Map(prev.map(m => [m.moleculeId, m]));

        // Create a map of derived molecules by ID
        const derivedMoleculesMap = new Map(derivedMolecules.map(m => [m.moleculeId, m]));

        // Start with existing molecules to preserve order and inactive molecules
        const preservedMolecules: WorkflowMolecule[] = [];
        const processedIds = new Set<string>();

        // First, process existing molecules in order
        prev.forEach(mol => {
          if (derivedMoleculesMap.has(mol.moleculeId)) {
            // Molecule exists in both - use derived version but preserve isActive if it was false
            const derived = derivedMoleculesMap.get(mol.moleculeId)!;
            preservedMolecules.push({
              ...derived,
              isActive: mol.isActive !== false ? derived.isActive : false // Preserve inactive state
            });
          } else {
            // Molecule not in derived (no cards) - preserve it if inactive
            if (mol.isActive === false) {
              preservedMolecules.push(mol); // Keep inactive molecule for position preservation
            }
            // If active but no cards, remove it
          }
          processedIds.add(mol.moleculeId);
        });

        // Then, add any new derived molecules that weren't in existing
        derivedMolecules.forEach(derived => {
          if (!processedIds.has(derived.moleculeId)) {
            preservedMolecules.push({
              ...derived,
              isActive: derived.isActive !== false // Default to active
            });
          }
        });

        const currentMoleculeIds = prev.map(m => m.moleculeId).sort();
        const preservedMoleculeIds = preservedMolecules.map(m => m.moleculeId).sort();

        // Only update if the IDs or order changed
        if (JSON.stringify(currentMoleculeIds) !== JSON.stringify(preservedMoleculeIds)) {
          return preservedMolecules;
        }
        return prev;
      });
    } else {
      // Clear workflow molecules when no cards have moleculeId
      // But preserve inactive molecules for position preservation
      setWorkflowMolecules(prev => {
        const inactiveMolecules = prev.filter(mol => mol.isActive === false);
        return inactiveMolecules.length > 0 ? inactiveMolecules : [];
      });
    }
  }, [layoutCards, isCanvasLoading]);

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
            // Ensure all molecules default to isActive: true (unless explicitly set to false)
            const moleculesWithActiveFlag = molecules.map((mol: any) => ({
              ...mol,
              isActive: mol.isActive !== false // Default to true if not specified
            }));

            setWorkflowMolecules(moleculesWithActiveFlag);

            // Set collapsed state for restored active molecules only
            const initialCollapsedState: Record<string, boolean> = {};
            moleculesWithActiveFlag.forEach((molecule: any) => {
              if (molecule.isActive !== false) {
              initialCollapsedState[molecule.moleculeId] = true; // collapsed by default
              }
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

      // Find the card to get its moleculeId and current atom count
      const card = (Array.isArray(layoutCards) ? layoutCards : []).find(c => c.id === cardId);
      if (card && card.atoms.length >= 1) {
        toast({
          title:
            'Already one atom is present in the card - please remove atom and then try adding an atom.',
        });
        return;
      }

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
            : atom.id === 'pivot-table'
            ? { ...DEFAULT_PIVOT_TABLE_SETTINGS }
            : atom.id === 'dataframe-operations'
            ? { ...DEFAULT_DATAFRAME_OPERATIONS_SETTINGS }
            : atom.id === 'select-models-feature'
            ? { ...DEFAULT_SELECT_MODELS_FEATURE_SETTINGS }
            : atom.id === 'auto-regressive-models'
            ? { data: { ...DEFAULT_AUTO_REGRESSIVE_MODELS_DATA }, settings: { ...DEFAULT_AUTO_REGRESSIVE_MODELS_SETTINGS } }
            : undefined,
      };

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
  };
  if (position === undefined || position >= (Array.isArray(layoutCards) ? layoutCards.length : 0)) {
    setLayoutCards([...(Array.isArray(layoutCards) ? layoutCards : []), newCard]);
  } else {
    const arr = Array.isArray(layoutCards) ? layoutCards : [];
    setLayoutCards([
      ...arr.slice(0, position),
      newCard,
      ...arr.slice(position),
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

// Workflow-specific addNewCard function that handles molecules and standalone cards
const addNewCardWorkflow = (moleculeId?: string, position?: number, targetMoleculeIndex?: number, insertAfterSubOrder?: number) => {
  // Use workflowMolecules to get title (includes custom molecules) instead of molecules list
  const workflowMolecule = moleculeId ? workflowMolecules.find(m => m.moleculeId === moleculeId) : undefined;
  const newCard: LayoutCard = {
    id: generateClientId('card'),
    atoms: [],
    isExhibited: false,
    moleculeId,
    moleculeTitle: workflowMolecule?.moleculeTitle,
  };

  // If adding to a molecule, insert at specific position within molecule
  if (moleculeId) {
    const arr = Array.isArray(layoutCards) ? layoutCards : [];
    const moleculeCards = arr.filter(card => card.moleculeId === moleculeId);

    if (moleculeCards.length === 0) {
      // No cards in molecule yet, just append
      setLayoutCards([...arr, newCard]);
    } else if (position !== undefined && position < moleculeCards.length) {
      // Insert AFTER the card at position within molecule
      const targetCard = moleculeCards[position];
      const targetIndex = arr.findIndex(card => card.id === targetCard.id);
      if (targetIndex >= 0) {
        setLayoutCards([
          ...arr.slice(0, targetIndex + 1),
          newCard,
          ...arr.slice(targetIndex + 1),
        ]);
      } else {
        // Fallback to end
        const lastIndex = arr.findIndex(card => card.id === moleculeCards[moleculeCards.length - 1]?.id);
        setLayoutCards([
          ...arr.slice(0, lastIndex + 1),
          newCard,
          ...arr.slice(lastIndex + 1),
        ]);
      }
    } else {
      // Append to end of molecule
      const lastMoleculeCardIndex = arr.findIndex(card => 
        card.id === moleculeCards[moleculeCards.length - 1]?.id
      );
      setLayoutCards([
        ...arr.slice(0, lastMoleculeCardIndex + 1),
        newCard,
        ...arr.slice(lastMoleculeCardIndex + 1),
      ]);
    }
  } else {
    // Standalone card
    const arr = Array.isArray(layoutCards) ? layoutCards : [];
    const activeMolecules = workflowMolecules.filter(m => m.isActive !== false);

    // Calculate order based on targetMoleculeIndex and set molecule references
    if (targetMoleculeIndex !== undefined && targetMoleculeIndex >= 0 && targetMoleculeIndex < workflowMolecules.length) {
      // Get the molecule at targetMoleculeIndex (might be inactive)
      const targetMolecule = workflowMolecules[targetMoleculeIndex];
      const targetIsActive = targetMolecule && targetMolecule.isActive !== false;

      // Find the active molecule at or before this position
      let afterMolecule = null;
      let beforeMolecule = null;

      if (targetIsActive) {
        // Target molecule is active - use it as afterMoleculeId
        afterMolecule = targetMolecule;
        // Find next active molecule for beforeMoleculeId
        for (let i = targetMoleculeIndex + 1; i < workflowMolecules.length; i++) {
          if (workflowMolecules[i].isActive !== false) {
            beforeMolecule = workflowMolecules[i];
            break;
          }
        }
      } else {
        // Target molecule is inactive - find previous active molecule
        for (let i = targetMoleculeIndex; i >= 0; i--) {
          if (workflowMolecules[i].isActive !== false) {
            afterMolecule = workflowMolecules[i];
            break;
          }
        }
        // Find next active molecule for beforeMoleculeId
        for (let i = targetMoleculeIndex + 1; i < workflowMolecules.length; i++) {
          if (workflowMolecules[i].isActive !== false) {
            beforeMolecule = workflowMolecules[i];
            break;
          }
        }
      }

      // Set molecule references
      if (afterMolecule) {
        newCard.afterMoleculeId = afterMolecule.moleculeId;
      }
      if (beforeMolecule) {
        newCard.beforeMoleculeId = beforeMolecule.moleculeId;
      }

      if (insertAfterSubOrder !== undefined) {
        // Insert at specific position - need to shift all cards after this position
        const targetSubOrder = insertAfterSubOrder + 1;
        const updatedCards = arr.map(card => {
          if (card.order !== undefined) {
            const cardMoleculeIndex = Math.floor(card.order / 1000);
            const cardSubOrder = card.order % 1000;
            // If card is after insertion point, shift it
            if (cardMoleculeIndex === targetMoleculeIndex && cardSubOrder >= targetSubOrder) {
              return { ...card, order: (cardMoleculeIndex * 1000) + (cardSubOrder + 1) };
            }
          }
          return card;
        });

        newCard.order = (targetMoleculeIndex * 1000) + targetSubOrder;
        setLayoutCards([...updatedCards, newCard]);
      } else {
        // Find existing standalone cards after this molecule to determine subOrder
        const existingStandaloneAfterMolecule = arr.filter(card => {
          if (card.order !== undefined) {
            const cardMoleculeIndex = Math.floor(card.order / 1000);
            return cardMoleculeIndex === targetMoleculeIndex;
          }
          return false;
        });

        // Get the highest subOrder for cards after this molecule, default to 0
        const maxSubOrder = existingStandaloneAfterMolecule.reduce((max, card) => {
          const subOrder = card.order !== undefined ? card.order % 1000 : 0;
          return Math.max(max, subOrder);
        }, 0);

        // Set order as (moleculeIndex * 1000) + (maxSubOrder + 1)
        newCard.order = (targetMoleculeIndex * 1000) + (maxSubOrder + 1);
        setLayoutCards([...arr, newCard]);
      }
    } else {
      // No target molecule - append to end, set afterMoleculeId to last active molecule
      if (activeMolecules.length > 0) {
        const lastActiveMolecule = activeMolecules[activeMolecules.length - 1];
        newCard.afterMoleculeId = lastActiveMolecule.moleculeId;
      }
      setLayoutCards([...arr, newCard]);
    }
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

// Workflow-specific addNewCardWithAtom function that handles molecules and standalone cards
const addNewCardWithAtomWorkflow = async (
  atomId: string,
  moleculeId?: string,
  position?: number,
  targetMoleculeIndex?: number,
  insertAfterSubOrder?: number
) => {
  const arr = Array.isArray(layoutCards) ? layoutCards : [];

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

    // If moleculeTitle is not set, try to get it from workflowMolecules (for custom molecules)
    if (!newCard.moleculeTitle && moleculeId) {
      const workflowMolecule = workflowMolecules.find(m => m.moleculeId === moleculeId);
      if (workflowMolecule) {
        newCard.moleculeTitle = workflowMolecule.moleculeTitle;
      }
    }

    // If adding to a molecule, insert at specific position within molecule
    if (moleculeId) {
      const moleculeCards = arr.filter(card => card.moleculeId === moleculeId);

      if (moleculeCards.length === 0) {
        // No cards in molecule yet, just append
        setLayoutCards([...arr, newCard]);
      } else if (position !== undefined && position < moleculeCards.length) {
        // Insert AFTER the card at position within molecule
        const targetCard = moleculeCards[position];
        const targetIndex = arr.findIndex(card => card.id === targetCard.id);
        if (targetIndex >= 0) {
          setLayoutCards([
            ...arr.slice(0, targetIndex + 1),
            newCard,
            ...arr.slice(targetIndex + 1),
          ]);
        } else {
          // Fallback to end
          const lastIndex = arr.findIndex(card => card.id === moleculeCards[moleculeCards.length - 1]?.id);
          setLayoutCards([
            ...arr.slice(0, lastIndex + 1),
            newCard,
            ...arr.slice(lastIndex + 1),
          ]);
        }
      } else {
        // Append to end of molecule
        const lastMoleculeCardIndex = arr.findIndex(card => 
          card.id === moleculeCards[moleculeCards.length - 1]?.id
        );
        setLayoutCards([
          ...arr.slice(0, lastMoleculeCardIndex + 1),
          newCard,
          ...arr.slice(lastMoleculeCardIndex + 1),
        ]);
      }
    } else {
      // Standalone card
      const activeMolecules = workflowMolecules.filter(m => m.isActive !== false);

      // Calculate order based on targetMoleculeIndex and set molecule references
      // FIX: Ensure targetMoleculeIndex is valid (0 to workflowMolecules.length - 1)
      if (targetMoleculeIndex !== undefined && targetMoleculeIndex >= 0) {
        // Clamp targetMoleculeIndex to valid range
        const validMoleculeIndex = Math.min(targetMoleculeIndex, workflowMolecules.length - 1);

        if (validMoleculeIndex < 0) {
          console.warn(`[addNewCardWithAtomWorkflow] Invalid targetMoleculeIndex: ${targetMoleculeIndex}, falling back to append to end`);
        } else {
          // Get the molecule at validMoleculeIndex (might be inactive)
          const targetMolecule = workflowMolecules[validMoleculeIndex];
        const targetIsActive = targetMolecule && targetMolecule.isActive !== false;

        // Find the active molecule at or before this position
        let afterMolecule = null;
        let beforeMolecule = null;

        if (targetIsActive) {
          // Target molecule is active - use it as afterMoleculeId
          afterMolecule = targetMolecule;
          // Find next active molecule for beforeMoleculeId
            for (let i = validMoleculeIndex + 1; i < workflowMolecules.length; i++) {
            if (workflowMolecules[i].isActive !== false) {
              beforeMolecule = workflowMolecules[i];
              break;
            }
          }
        } else {
          // Target molecule is inactive - find previous active molecule
            for (let i = validMoleculeIndex; i >= 0; i--) {
            if (workflowMolecules[i].isActive !== false) {
              afterMolecule = workflowMolecules[i];
              break;
            }
          }
          // Find next active molecule for beforeMoleculeId
            for (let i = validMoleculeIndex + 1; i < workflowMolecules.length; i++) {
            if (workflowMolecules[i].isActive !== false) {
              beforeMolecule = workflowMolecules[i];
              break;
            }
          }
        }

        // Set molecule references
        if (afterMolecule) {
          newCard.afterMoleculeId = afterMolecule.moleculeId;
        }
        if (beforeMolecule) {
          newCard.beforeMoleculeId = beforeMolecule.moleculeId;
          } else if (validMoleculeIndex === workflowMolecules.length - 1 || !beforeMolecule) {
            // If this is after the last molecule or no beforeMolecule found, mark as afterLastMolecule
            newCard.afterLastMolecule = true;
        }

        if (insertAfterSubOrder !== undefined) {
          // Insert at specific position - need to shift all cards after this position
          const targetSubOrder = insertAfterSubOrder + 1;
          const updatedCards = arr.map(card => {
            if (card.order !== undefined) {
              const cardMoleculeIndex = Math.floor(card.order / 1000);
              const cardSubOrder = card.order % 1000;
              // If card is after insertion point, shift it
                if (cardMoleculeIndex === validMoleculeIndex && cardSubOrder >= targetSubOrder) {
                return { ...card, order: (cardMoleculeIndex * 1000) + (cardSubOrder + 1) };
              }
            }
            return card;
          });

            newCard.order = (validMoleculeIndex * 1000) + targetSubOrder;

            console.log(`📝 [addNewCardWithAtomWorkflow] Inserted standalone card at position:`, {
              targetMoleculeIndex,
              validMoleculeIndex,
              insertAfterSubOrder,
              targetSubOrder,
              order: newCard.order,
              afterMoleculeId: newCard.afterMoleculeId,
              beforeMoleculeId: newCard.beforeMoleculeId
            });

          setLayoutCards([...updatedCards, newCard]);
        } else {
          // Find existing standalone cards after this molecule to determine subOrder
          const existingStandaloneAfterMolecule = arr.filter(card => {
            if (card.order !== undefined) {
              const cardMoleculeIndex = Math.floor(card.order / 1000);
                return cardMoleculeIndex === validMoleculeIndex;
            }
            return false;
          });

          // Get the highest subOrder for cards after this molecule, default to 0
          const maxSubOrder = existingStandaloneAfterMolecule.reduce((max, card) => {
            const subOrder = card.order !== undefined ? card.order % 1000 : 0;
            return Math.max(max, subOrder);
          }, 0);

            // Set order as (validMoleculeIndex * 1000) + (maxSubOrder + 1)
            newCard.order = (validMoleculeIndex * 1000) + (maxSubOrder + 1);

            console.log(`📝 [addNewCardWithAtomWorkflow] Added standalone card after molecule:`, {
              targetMoleculeIndex,
              validMoleculeIndex,
              moleculeId: targetMolecule?.moleculeId,
              order: newCard.order,
              maxSubOrder,
              subOrder: maxSubOrder + 1,
              afterMoleculeId: newCard.afterMoleculeId,
              beforeMoleculeId: newCard.beforeMoleculeId,
              afterLastMolecule: newCard.afterLastMolecule
            });

          setLayoutCards([...arr, newCard]);
          }
        }
      } else {
        // No target molecule - append to end, set afterMoleculeId to last active molecule
        // FIX: Calculate order based on last molecule index (not workflowMolecules.length)
        if (activeMolecules.length > 0) {
          const lastActiveMolecule = activeMolecules[activeMolecules.length - 1];
          newCard.afterMoleculeId = lastActiveMolecule.moleculeId;

          // Find the index of the last active molecule in the full workflowMolecules array
          const lastActiveMoleculeIndex = workflowMolecules.findIndex(m => m.moleculeId === lastActiveMolecule.moleculeId);

          if (lastActiveMoleculeIndex >= 0) {
            // Find existing standalone cards after this molecule to determine subOrder
            const existingStandaloneAfterMolecule = arr.filter(card => {
              if (card.order !== undefined) {
                const cardMoleculeIndex = Math.floor(card.order / 1000);
                return cardMoleculeIndex === lastActiveMoleculeIndex;
              }
              return false;
            });

            // Get the highest subOrder for cards after this molecule, default to 0
            const maxSubOrder = existingStandaloneAfterMolecule.reduce((max, card) => {
              const subOrder = card.order !== undefined ? card.order % 1000 : 0;
              return Math.max(max, subOrder);
            }, 0);

            // Set order as (lastActiveMoleculeIndex * 1000) + (maxSubOrder + 1)
            newCard.order = (lastActiveMoleculeIndex * 1000) + (maxSubOrder + 1);
            newCard.afterLastMolecule = true;

            console.log(`📝 [addNewCardWithAtomWorkflow] Added standalone card after last molecule:`, {
              moleculeId: lastActiveMolecule.moleculeId,
              moleculeIndex: lastActiveMoleculeIndex,
              order: newCard.order,
              maxSubOrder,
              subOrder: maxSubOrder + 1
            });
          }
        }
        setLayoutCards([...arr, newCard]);
      }
    }

    setCollapsedCards(prev => ({ ...prev, [newCard.id]: false }));
    newCard.atoms.forEach(atom => prefillAtomIfRequired(newCard.id, atom));

    // Track atom addition for cross-collection sync if card belongs to a molecule
    if (moleculeId && newCard.atoms.length > 0) {
      setPendingChanges(prev => ({
        ...prev,
        addedAtoms: [...prev.addedAtoms, { 
          moleculeId: moleculeId, 
          atomId: newCard.atoms[0].atomId,
          position: 0
        }]
      }));
      console.log(`📝 Tracked atom addition: ${newCard.atoms[0].atomId} to molecule ${moleculeId} (will sync on save)`);
    }
  } catch (err) {
    console.error('⚠️ Failed to create laboratory card via API, using fallback', err);
    toast({
      title: 'Unable to reach laboratory service',
      description: 'Using local defaults for the new card. Please verify your network connection.',
      variant: 'destructive',
    });
    const fallbackCard = createFallbackCard(atomId, moleculeId);

    // If moleculeTitle is not set, try to get it from workflowMolecules (for custom molecules)
    if (!fallbackCard.moleculeTitle && moleculeId) {
      const workflowMolecule = workflowMolecules.find(m => m.moleculeId === moleculeId);
      if (workflowMolecule) {
        fallbackCard.moleculeTitle = workflowMolecule.moleculeTitle;
      }
    }

    // If adding to a molecule, insert at specific position within molecule
    if (moleculeId) {
      const moleculeCards = arr.filter(card => card.moleculeId === moleculeId);

      if (moleculeCards.length === 0) {
        // No cards in molecule yet, just append
        setLayoutCards([...arr, fallbackCard]);
      } else if (position !== undefined && position < moleculeCards.length) {
        // Insert AFTER the card at position within molecule
        const targetCard = moleculeCards[position];
        const targetIndex = arr.findIndex(card => card.id === targetCard.id);
        if (targetIndex >= 0) {
          setLayoutCards([
            ...arr.slice(0, targetIndex + 1),
            fallbackCard,
            ...arr.slice(targetIndex + 1),
          ]);
        } else {
          // Fallback to end
          const lastIndex = arr.findIndex(card => card.id === moleculeCards[moleculeCards.length - 1]?.id);
          setLayoutCards([
            ...arr.slice(0, lastIndex + 1),
            fallbackCard,
            ...arr.slice(lastIndex + 1),
          ]);
        }
      } else {
        // Append to end of molecule
        const lastMoleculeCardIndex = arr.findIndex(card => 
          card.id === moleculeCards[moleculeCards.length - 1]?.id
        );
        setLayoutCards([
          ...arr.slice(0, lastMoleculeCardIndex + 1),
          fallbackCard,
          ...arr.slice(lastMoleculeCardIndex + 1),
        ]);
      }
    } else {
      // Standalone card - insert at position
      const insertIndex = position === undefined || position >= arr.length ? arr.length : position;
      setLayoutCards([
        ...arr.slice(0, insertIndex),
        fallbackCard,
        ...arr.slice(insertIndex),
      ]);
    }

    setCollapsedCards(prev => ({ ...prev, [fallbackCard.id]: false }));
    fallbackCard.atoms.forEach(atom => prefillAtomIfRequired(fallbackCard.id, atom));
  }
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
    case 'pivot-table':
      return { ...DEFAULT_PIVOT_TABLE_SETTINGS };
    case 'unpivot':
      return { ...DEFAULT_UNPIVOT_SETTINGS };
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

// Workflow-specific handleDropNewCard that uses addNewCardWithAtomWorkflow
const handleDropNewCardWorkflow = async (
  e: React.DragEvent,
  moleculeId?: string,
  position?: number,
  targetMoleculeIndex?: number,
  insertAfterSubOrder?: number
) => {
  e.preventDefault();
  setDragOver(null);
  setAddDragTarget(null);
  const atomData = e.dataTransfer.getData('application/json');
  if (!atomData) return;
  const atom = JSON.parse(atomData);
  if (!atom?.id) return;
  await addNewCardWithAtomWorkflow(atom.id, moleculeId, position, targetMoleculeIndex, insertAfterSubOrder);
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
        atomId: atom.atomId
      };

      setPendingChanges(prev => ({
        ...prev,
        deletedAtoms: [...prev.deletedAtoms, deletionRecord]
      }));

      console.log(`📝 Tracked atom deletion:`, deletionRecord);
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
    // Find the card to get its moleculeId and current atom count
    const card = (Array.isArray(layoutCards) ? layoutCards : []).find(c => c.id === cardId);

    if (card && card.atoms.length >= 1) {
      toast({
        title:
          'Already one atom is present in the card - please remove atom and then try adding an atom.',
      });
      return;
    }

    const newAtom = buildAtomFromApiPayload(info.id, {
      atomId: info.id,
      source: 'ai',
    });

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
              moleculeId: 'standalone',
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

  const handleDeleteAtomClick = (cardId: string, atomId: string, atomTitle: string) => {
    setAtomToDelete({ cardId, atomId, atomTitle });
    setDeleteAtomDialogOpen(true);
  };

  const confirmDeleteAtom = () => {
    if (!atomToDelete) return;
    removeAtom(atomToDelete.cardId, atomToDelete.atomId);
    setDeleteAtomDialogOpen(false);
    setAtomToDelete(null);
  };

  const cancelDeleteAtom = () => {
    setDeleteAtomDialogOpen(false);
    setAtomToDelete(null);
  };

  const handleDeleteAtomDialogOpenChange = (open: boolean) => {
    if (open) {
      setDeleteAtomDialogOpen(true);
    } else {
      cancelDeleteAtom();
    }
  };

  const deleteMoleculeContainer = async (moleculeId: string) => {
    // Get all cards associated with this molecule BEFORE updating state
    const arr = Array.isArray(layoutCards) ? layoutCards : [];
    const moleculeCards = arr.filter(card => card.moleculeId === moleculeId);

    // CRITICAL: Mark molecule as inactive FIRST, before removing cards
    // This ensures the useEffect preservation logic can retain the inactive molecule
    // when it runs due to layoutCards changing
    setWorkflowMolecules(prev => {
      // Mark molecule as inactive instead of removing it
      // This preserves the order of standalone cards without recalculation
      const updatedMolecules = prev.map(mol => 
        mol.moleculeId === moleculeId 
          ? { ...mol, isActive: false }
          : mol
      );

      // Update localStorage
      if (updatedMolecules.length > 0) {
        localStorage.setItem('workflow-molecules', JSON.stringify(updatedMolecules));
      } else {
        localStorage.removeItem('workflow-molecules');
      }

      // No need to recalculate orders - standalone cards keep their original order values
      // Inactive molecules are filtered out during rendering
      console.log(`🗑️ Marked molecule ${moleculeId} as inactive (isActive: false)`);

      return updatedMolecules;
    });

    // NOW remove cards from layoutCards state
    // The useEffect will now see the molecule as inactive and preserve it
    const updatedCards = arr.filter(card => card.moleculeId !== moleculeId);
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

    // Clear collapsed state for this molecule (won't be visible anyway)
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

  // Sync Laboratory changes to Workflow collection
  const syncWorkflowCollectionOnLaboratorySave = async () => {
    try {
      console.log('🔄 [SYNC START] Syncing Laboratory changes to Workflow collection...');
      console.log('🔄 [SYNC] Function called with pendingChanges:', pendingChanges);
      console.log('🔄 [SYNC] Current layoutCards count:', Array.isArray(layoutCards) ? layoutCards.length : 0);

      const hasPendingChanges = pendingChanges.deletedMolecules.length > 0 || 
                                pendingChanges.deletedAtoms.length > 0 || 
                                pendingChanges.addedAtoms.length > 0;
      console.log('🔄 [SYNC] hasPendingChanges:', hasPendingChanges);

      // Get current workflow configuration
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};
      console.log('🔄 [SYNC] Environment config:', { 
        CLIENT_NAME: env.CLIENT_NAME, 
        APP_NAME: env.APP_NAME, 
        PROJECT_NAME: env.PROJECT_NAME 
      });

      console.log('🔄 [SYNC] Fetching workflow data from:', `${MOLECULES_API}/workflow/get`);
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

      console.log('🔄 [SYNC] Fetch response status:', response.status, response.ok);
      
      if (response.ok) {
        const result = await response.json();
        console.log('🔄 [SYNC] Fetch result:', { 
          hasWorkflowData: !!result.workflow_data,
          moleculesCount: result.workflow_data?.canvas_molecules?.length || 0
        });
        
        if (result.workflow_data) {
          // Fetch all molecules from MongoDB (workflow_model_molecule_configuration)
          let updatedCanvasMolecules = [...(result.workflow_data.canvas_molecules || [])];

          console.log(`📦 Fetched ${updatedCanvasMolecules.length} molecules from workflow_model_molecule_configuration`);
          console.log(`🗑️ Molecules to mark as inactive: ${pendingChanges.deletedMolecules.join(', ')}`);

          // Handle molecule deletions - mark as isActive: false instead of removing
          // Simple approach: Check which molecules were deleted in Laboratory Mode
          // and mark them as inactive in the MongoDB data
          if (pendingChanges.deletedMolecules.length > 0) {
            const deletedMoleculeIds = new Set(pendingChanges.deletedMolecules);

            updatedCanvasMolecules = updatedCanvasMolecules.map(mol => {
              if (deletedMoleculeIds.has(mol.id)) {
                console.log(`🔴 Marking molecule ${mol.id} (${mol.title || 'untitled'}) as inactive (isActive: false)`);
                return {
                  ...mol,
                  isActive: false // Mark as inactive instead of removing
                };
              }
              // Ensure isActive is set for molecules that aren't deleted
              // If isActive is undefined, default to true
              if (mol.isActive === undefined) {
                return {
                  ...mol,
                  isActive: true
                };
              }
              return mol;
            });

            console.log(`✅ Marked ${pendingChanges.deletedMolecules.length} molecules as inactive (isActive: false)`);
            console.log(`📊 Final molecule count: ${updatedCanvasMolecules.length} total (${updatedCanvasMolecules.filter(m => m.isActive !== false).length} active, ${updatedCanvasMolecules.filter(m => m.isActive === false).length} inactive)`);
          }

          // Handle atom deletions
          if (pendingChanges.deletedAtoms.length > 0) {
            console.log('🔍 Processing atom deletions:', pendingChanges.deletedAtoms);

            const moleculeBasedDeletions = pendingChanges.deletedAtoms.filter(change => change.moleculeId !== 'standalone');
            // FIX 3: Standalone deletions should NOT affect molecules - standalone cards are separate
            // Remove the bug that incorrectly removes atoms from molecules when deleting standalone cards
            // Standalone deletions are handled separately in standaloneCardsForWorkflow

            // Handle molecule-based atom deletions only
            updatedCanvasMolecules = updatedCanvasMolecules.map(molecule => {
              const atomsToRemove = moleculeBasedDeletions
                .filter(change => change.moleculeId === molecule.id)
                .map(change => change.atomId);

              if (atomsToRemove.length > 0) {
                console.log(`🗑️ Removing atoms from molecule ${molecule.id}:`, atomsToRemove);
                return {
                  ...molecule,
                  atoms: molecule.atoms.filter(atom => !atomsToRemove.includes(atom)),
                  atomOrder: molecule.atomOrder.filter(atom => !atomsToRemove.includes(atom))
                };
              }
              return molecule;
            });

            // FIX 3: Removed buggy code that incorrectly removed standalone atoms from molecules
            // Standalone card deletions are handled by filtering standaloneCardsForWorkflow array
          }

          // Handle atom additions
          if (pendingChanges.addedAtoms.length > 0) {
            console.log('➕ Processing atom additions:', pendingChanges.addedAtoms);

            const currentCards = Array.isArray(layoutCards) ? layoutCards : [];
            const additionsByMolecule = pendingChanges.addedAtoms.reduce((acc, addition) => {
              if (!acc[addition.moleculeId]) {
                acc[addition.moleculeId] = [];
              }
              acc[addition.moleculeId].push(addition);
              return acc;
            }, {} as Record<string, Array<{ atomId: string; position: number }>>);

            updatedCanvasMolecules = updatedCanvasMolecules.map(molecule => {
              const atomsToAdd = additionsByMolecule[molecule.id] || [];

              if (atomsToAdd.length > 0) {
                console.log(`➕ Processing additions for molecule ${molecule.id}:`, atomsToAdd);
                const moleculeCards = currentCards.filter(c => c.moleculeId === molecule.id);
                console.log(`➕ Found ${moleculeCards.length} cards for molecule ${molecule.id}`);

                // FIX 5: Preserve atom order by using tracked positions
                // Create a map of atomId to position for sorting
                const atomPositionMap = new Map<string, number>();
                atomsToAdd.forEach(addition => {
                  atomPositionMap.set(addition.atomId, addition.position);
                });

                // Collect all atoms from cards, maintaining card order (which preserves atom order)
                const allCardAtomIds: string[] = [];
                moleculeCards.forEach(card => {
                  card.atoms.forEach(atom => {
                    allCardAtomIds.push(atom.atomId);
                  });
                });

                // FIX 5: Sort atoms by their tracked positions if available
                // If position is tracked, use it; otherwise maintain card order
                const sortedAtoms = [...allCardAtomIds].sort((a, b) => {
                  const posA = atomPositionMap.get(a);
                  const posB = atomPositionMap.get(b);

                  // If both have positions, sort by position
                  if (posA !== undefined && posB !== undefined) {
                    return posA - posB;
                  }
                  // If only one has position, prioritize it
                  if (posA !== undefined) return -1;
                  if (posB !== undefined) return 1;
                  // Otherwise maintain original order (index in allCardAtomIds)
                  return allCardAtomIds.indexOf(a) - allCardAtomIds.indexOf(b);
                });

                console.log(`➕ Molecule ${molecule.id} will have atoms (ordered):`, sortedAtoms);

                return {
                  ...molecule,
                  atoms: sortedAtoms,
                  atomOrder: sortedAtoms // FIX 2: Preserve atom order
                };
              }
              return molecule;
            });
          }

          // FIX: Preserve atom order for ALL molecules from Laboratory Mode
          // This ensures that when atoms are added/reordered in Laboratory Mode,
          // their order is preserved in Workflow Mode
          console.log('🔄 [SYNC] Starting atom order preservation logic...');
          const currentCards = Array.isArray(layoutCards) ? layoutCards : [];
          const allMoleculeCards = currentCards.filter(card => card.moleculeId);
          console.log('🔄 [SYNC] Total cards:', currentCards.length, 'Molecule cards:', allMoleculeCards.length);

          // CRITICAL FIX: Create a position map once for O(1) lookups instead of O(n) findIndex calls
          // This maps card.id -> position in the original layoutCards array
          // This preserves the exact order cards appear in Laboratory Mode, including
          // when atoms are inserted between existing atoms
          // MUST be created before grouping to use in logging
          const cardPositionMap = new Map<string, number>();
          currentCards.forEach((card, index) => {
            cardPositionMap.set(card.id, index);
          });

          // Build a map of moleculeId -> ordered atomIds from Laboratory Mode cards
          const moleculeAtomOrderMap = new Map<string, string[]>();

          // Group cards by moleculeId
          // CRITICAL: Preserve the order cards appear in the original array when grouping
          const cardsByMolecule = new Map<string, typeof allMoleculeCards>();
          allMoleculeCards.forEach(card => {
            if (!card.moleculeId) return;
            if (!cardsByMolecule.has(card.moleculeId)) {
              cardsByMolecule.set(card.moleculeId, []);
            }
            cardsByMolecule.get(card.moleculeId)!.push(card);
          });

          // Log initial grouping to verify card order
          console.log(`🔄 [Sync] Grouped cards by molecule:`, 
            Array.from(cardsByMolecule.entries()).map(([molId, cards]) => ({
              moleculeId: molId,
              cardCount: cards.length,
              cards: cards.map((c, idx) => ({
                cardId: c.id,
                atomId: c.atoms[0]?.atomId,
                positionInOriginalArray: cardPositionMap.get(c.id) ?? -1,
                groupIndex: idx
              }))
            }))
          );

          // For each molecule, sort cards by their visual order (order field) and extract atoms
          cardsByMolecule.forEach((moleculeCards, moleculeId) => {
            // CRITICAL: Count cards within this molecule to ensure we have the correct count
            const moleculeCardCount = moleculeCards.length;
            console.log(`🔄 [Sync] Processing molecule ${moleculeId} with ${moleculeCardCount} cards`);

            // CRITICAL FIX: Sort cards by their position in the original layoutCards array
            // The positionInOriginalArray is the PRIMARY source of truth for visual order in Laboratory Mode
            // This ensures that when atoms are inserted between existing atoms, their order is preserved
            // The order field is SECONDARY and only used if positionInOriginalArray is not available
            const sortedCards = [...moleculeCards].sort((a, b) => {
              // Priority 1: Use position in the original layoutCards array (currentCards)
              // This is the PRIMARY source of truth - it reflects the exact visual order in Laboratory Mode
              const indexA = cardPositionMap.get(a.id) ?? -1;
              const indexB = cardPositionMap.get(b.id) ?? -1;
              
              // If both have valid positions, sort by position (this is the correct order)
              if (indexA >= 0 && indexB >= 0) {
                return indexA - indexB;
              }
              
              // Priority 2: If only one has position, prioritize it
              if (indexA >= 0) return -1;
              if (indexB >= 0) return 1;
              
              // Priority 3: Fallback to order field if positions are not available
              // This should rarely happen, but provides a fallback
              const orderA = typeof a.order === 'number' ? a.order : Infinity;
              const orderB = typeof b.order === 'number' ? b.order : Infinity;
              
              if (orderA !== Infinity && orderB !== Infinity) {
                return orderA - orderB;
              }
              
              if (orderA !== Infinity) return -1;
              if (orderB !== Infinity) return 1;
              
              // Both not found (shouldn't happen), maintain relative order
              return 0;
            });

            // CRITICAL FIX: Extract atoms in order from sorted cards and assign molecule card index
            // The moleculeCardIndex (0, 1, 2, ...) represents the position of the card within the molecule
            // This index is used to build atomPositions with correct order values
            const orderedAtomIds: string[] = [];
            const cardIndexMap = new Map<string, number>(); // Map card.id -> moleculeCardIndex
            
            sortedCards.forEach((card, moleculeCardIndex) => {
              // Store the molecule card index for this card (0, 1, 2, ...)
              cardIndexMap.set(card.id, moleculeCardIndex);
              
              card.atoms.forEach(atom => {
                // Preserve every occurrence (allow duplicate atoms)
                // The order in orderedAtomIds array will be used to build atomPositions
                orderedAtomIds.push(atom.atomId);
              });
            });

            // Verify the count matches
            if (orderedAtomIds.length !== moleculeCardCount) {
              console.warn(`⚠️ [Sync] Molecule ${moleculeId} atom count (${orderedAtomIds.length}) doesn't match card count (${moleculeCardCount})`);
            }

            console.log(`🔄 [Sync] Molecule ${moleculeId} atom order from Laboratory Mode:`, {
              moleculeId,
              cardCount: moleculeCardCount,
              atomCount: orderedAtomIds.length,
              atomOrder: orderedAtomIds,
              cardOrder: sortedCards.map((c, moleculeCardIndex) => ({
                cardId: c.id,
                atomId: c.atoms[0]?.atomId,
                moleculeCardIndex: moleculeCardIndex, // Index within molecule (0, 1, 2, ...)
                positionInArray: cardPositionMap.get(c.id) ?? -1,
                orderField: c.order,
                expectedAtomPosition: moleculeCardIndex // This will be the order in atomPositions
              }))
            });

            moleculeAtomOrderMap.set(moleculeId, orderedAtomIds);
          });

          // Update all molecules to use the atom order from Laboratory Mode
          updatedCanvasMolecules = updatedCanvasMolecules.map(molecule => {
            const labModeAtomOrder = moleculeAtomOrderMap.get(molecule.id);

            if (labModeAtomOrder && labModeAtomOrder.length > 0) {
              // Use Laboratory Mode atom order
              console.log(`🔄 Preserving atom order for molecule ${molecule.id} (${molecule.title || 'untitled'}):`, labModeAtomOrder);
              return {
                ...molecule,
                atoms: labModeAtomOrder,
                atomOrder: labModeAtomOrder // Preserve order in both fields
              };
            }

            // If no Laboratory Mode cards for this molecule, keep existing atoms
            // (but ensure atomOrder matches atoms if it exists)
            if (molecule.atoms && molecule.atoms.length > 0) {
              return {
                ...molecule,
                atomOrder: molecule.atomOrder || molecule.atoms // Ensure atomOrder exists
              };
            }

            return molecule;
          });

          // Ensure atomPositions is kept in sync with atomOrder for every molecule
          // CRITICAL: buildAtomPositions uses the index in the array (0, 1, 2, ...) as the order value
          // So the order of atoms in atomOrder array directly determines their order in atomPositions
          updatedCanvasMolecules = updatedCanvasMolecules.map(molecule => {
            const orderSource = Array.isArray(molecule.atomOrder) && molecule.atomOrder.length > 0
              ? [...molecule.atomOrder]
              : Array.isArray(molecule.atoms)
                ? [...molecule.atoms]
                : [];

            const atomPositions = buildAtomPositions(orderSource);
            
            // Log the final atomPositions to verify order
            if (atomPositions.length > 0) {
              console.log(`✅ [Sync] Final atomPositions for molecule ${molecule.id}:`, {
                moleculeId: molecule.id,
                atomCount: atomPositions.length,
                atomPositions: atomPositions.map((ap, idx) => ({
                  atomId: ap.atomId,
                  order: ap.order,
                  expectedOrder: idx, // Should match order
                  matches: ap.order === idx
                }))
              });
            }

            return {
              ...molecule,
              atoms: orderSource,
              atomOrder: orderSource,
              atomPositions,
              atom_positions: atomPositions,
            };
          });
          
          // Build standalone cards array from Laboratory Mode cards
          // IMPORTANT: Preserve existing molecule references from MongoDB when possible
          // Only recalculate if referenced molecules were deleted (became inactive)
          const activeCanvasMolecules = updatedCanvasMolecules.filter(mol => mol.isActive !== false);
          const allMoleculeIds = new Set(updatedCanvasMolecules.map(m => m.id));
          const activeMoleculeIds = new Set(activeCanvasMolecules.map(m => m.id));

          // Get existing standalone cards from MongoDB to preserve their molecule references
          const existingStandaloneCards = (result.workflow_data.standalone_cards || []).reduce((acc: any, card: any) => {
            acc[card.id] = card;
            return acc;
          }, {} as Record<string, any>);

          const standaloneCardsForWorkflow = Array.isArray(layoutCards)
            ? layoutCards
                .filter(card => !card.moleculeId && card.atoms.length > 0)
                .map(card => {
                  const cardData: any = {
                    id: card.id,
                    atomId: card.atoms[0]?.atomId || '',
                    title: card.atoms[0]?.title || 'Atom'
                  };

                  // FIX: Use references directly from Laboratory Mode cards (they're already correct)
                  // Only update if referenced molecule no longer exists

                  // Get references from Laboratory card
                  const labAfterMoleculeId = card.afterMoleculeId;
                  const labBeforeMoleculeId = card.beforeMoleculeId;

                  // Check if referenced molecules still exist
                  const afterExists = labAfterMoleculeId ? allMoleculeIds.has(labAfterMoleculeId) : false;
                  const beforeExists = labBeforeMoleculeId ? allMoleculeIds.has(labBeforeMoleculeId) : false;
                  const afterActive = labAfterMoleculeId ? activeMoleculeIds.has(labAfterMoleculeId) : false;
                  const beforeActive = labBeforeMoleculeId ? activeMoleculeIds.has(labBeforeMoleculeId) : false;

                  // Use Laboratory card references if they're valid
                  if (labAfterMoleculeId && labBeforeMoleculeId && afterExists && beforeExists && afterActive && beforeActive) {
                    // Between two molecules - use directly from Laboratory card
                    cardData.betweenMolecules = [labAfterMoleculeId, labBeforeMoleculeId];
                    cardData.afterMoleculeId = labAfterMoleculeId;
                    cardData.beforeMoleculeId = labBeforeMoleculeId;

                    // Calculate order based on afterMoleculeId index
                    const afterIndex = updatedCanvasMolecules.findIndex(m => m.id === labAfterMoleculeId);
                    if (afterIndex >= 0 && typeof card.order === 'number') {
                      const subOrder = card.order % 1000;
                      cardData.order = (afterIndex * 1000) + subOrder;
                    } else if (typeof card.order === 'number') {
                      cardData.order = card.order;
                    }

                    console.log(`✅ Using Laboratory card reference for ${card.id}: between ${labAfterMoleculeId} and ${labBeforeMoleculeId}`);
                  } else if (labAfterMoleculeId && afterExists && afterActive) {
                    // After a molecule - check if it's the last one
                    const afterIndex = updatedCanvasMolecules.findIndex(m => m.id === labAfterMoleculeId);
                    const isLastActive = afterIndex >= 0 && activeCanvasMolecules[activeCanvasMolecules.length - 1]?.id === labAfterMoleculeId;

                    if (isLastActive || card.afterLastMolecule) {
                          cardData.afterLastMolecule = true;
                      cardData.afterMoleculeId = labAfterMoleculeId;
                        } else {
                      // Not last - find next active molecule for betweenMolecules
                      let nextActiveMolecule = null;
                            for (let i = afterIndex + 1; i < updatedCanvasMolecules.length; i++) {
                              if (updatedCanvasMolecules[i].isActive !== false) {
                          nextActiveMolecule = updatedCanvasMolecules[i];
                                break;
                              }
                            }

                      if (nextActiveMolecule) {
                        cardData.betweenMolecules = [labAfterMoleculeId, nextActiveMolecule.id];
                        cardData.afterMoleculeId = labAfterMoleculeId;
                              cardData.beforeMoleculeId = nextActiveMolecule.id;
                            } else {
                              cardData.afterLastMolecule = true;
                        cardData.afterMoleculeId = labAfterMoleculeId;
                      }
                    }

                    // Calculate order based on afterMoleculeId index
                    if (afterIndex >= 0 && typeof card.order === 'number') {
                      const subOrder = card.order % 1000;
                      cardData.order = (afterIndex * 1000) + subOrder;
                    } else if (typeof card.order === 'number') {
                      cardData.order = card.order;
                    }

                    console.log(`✅ Using Laboratory card reference for ${card.id}: after ${labAfterMoleculeId}`);
                  } else if (labBeforeMoleculeId && beforeExists && beforeActive) {
                    // Before a molecule
                    const beforeIndex = updatedCanvasMolecules.findIndex(m => m.id === labBeforeMoleculeId);
                    const isFirstActive = beforeIndex >= 0 && activeCanvasMolecules[0]?.id === labBeforeMoleculeId;

                    cardData.beforeMoleculeId = labBeforeMoleculeId;
                    cardData.beforeFirstMolecule = isFirstActive;

                    // Find previous active molecule for afterMoleculeId
                    if (beforeIndex > 0) {
                      for (let i = beforeIndex - 1; i >= 0; i--) {
                        if (updatedCanvasMolecules[i].isActive !== false) {
                          cardData.afterMoleculeId = updatedCanvasMolecules[i].id;
                          cardData.betweenMolecules = [updatedCanvasMolecules[i].id, labBeforeMoleculeId];
                          break;
                        }
                      }
                    }

                    // Calculate order based on previous molecule index (or beforeMoleculeId - 1)
                    if (beforeIndex > 0 && typeof card.order === 'number') {
                      // Find previous active molecule index
                      let prevActiveIndex = -1;
                      for (let i = beforeIndex - 1; i >= 0; i--) {
                        if (updatedCanvasMolecules[i].isActive !== false) {
                          prevActiveIndex = i;
                          break;
                        }
                      }
                      if (prevActiveIndex >= 0) {
                        const subOrder = card.order % 1000;
                        cardData.order = (prevActiveIndex * 1000) + subOrder;
                      } else {
                        cardData.order = card.order;
                      }
                    } else if (typeof card.order === 'number') {
                      cardData.order = card.order;
                    }

                    console.log(`✅ Using Laboratory card reference for ${card.id}: before ${labBeforeMoleculeId}`);
                  } else {
                    // References invalid - fallback to recalculating from order
                    console.log(`⚠️ Laboratory card references invalid for ${card.id}, recalculating from order`);

                  if (typeof card.order === 'number') {
                      const order = card.order;
                      const moleculeIndex = Math.floor(order / 1000);
                      const subOrder = order % 1000;

                      // Find the molecule at this index (might be inactive)
                      if (moleculeIndex >= 0 && moleculeIndex < updatedCanvasMolecules.length) {
                        const targetMolecule = updatedCanvasMolecules[moleculeIndex];

                        if (targetMolecule && targetMolecule.isActive !== false) {
                          // Molecule is active - use it
                          cardData.afterMoleculeId = targetMolecule.id;
                          cardData.order = order;

                          // Check if it's the last active molecule
                          const isLastActive = activeCanvasMolecules[activeCanvasMolecules.length - 1]?.id === targetMolecule.id;
                          if (isLastActive) {
                            cardData.afterLastMolecule = true;
                          } else {
                            // Find next active molecule
                        for (let i = moleculeIndex + 1; i < updatedCanvasMolecules.length; i++) {
                          if (updatedCanvasMolecules[i].isActive !== false) {
                                cardData.beforeMoleculeId = updatedCanvasMolecules[i].id;
                                cardData.betweenMolecules = [targetMolecule.id, updatedCanvasMolecules[i].id];
                            break;
                          }
                        }
                          }
                        } else {
                          // Molecule is inactive - find previous and next active molecules
                        let previousActiveMolecule = null;
                        for (let i = moleculeIndex; i >= 0; i--) {
                          if (updatedCanvasMolecules[i].isActive !== false) {
                            previousActiveMolecule = updatedCanvasMolecules[i];
                            break;
                          }
                        }

                          let nextActiveMolecule = null;
                          for (let i = moleculeIndex + 1; i < updatedCanvasMolecules.length; i++) {
                            if (updatedCanvasMolecules[i].isActive !== false) {
                              nextActiveMolecule = updatedCanvasMolecules[i];
                            break;
                          }
                        }

                        if (previousActiveMolecule && nextActiveMolecule) {
                          cardData.betweenMolecules = [previousActiveMolecule.id, nextActiveMolecule.id];
                          cardData.afterMoleculeId = previousActiveMolecule.id;
                          cardData.beforeMoleculeId = nextActiveMolecule.id;
                            // Recalculate order based on previous active molecule
                            const prevIndex = updatedCanvasMolecules.findIndex(m => m.id === previousActiveMolecule.id);
                            cardData.order = (prevIndex * 1000) + subOrder;
                        } else if (previousActiveMolecule) {
                          cardData.afterLastMolecule = true;
                          cardData.afterMoleculeId = previousActiveMolecule.id;
                            const prevIndex = updatedCanvasMolecules.findIndex(m => m.id === previousActiveMolecule.id);
                            cardData.order = (prevIndex * 1000) + subOrder;
                        } else if (nextActiveMolecule) {
                      cardData.beforeFirstMolecule = true;
                          cardData.beforeMoleculeId = nextActiveMolecule.id;
                            cardData.order = order; // Keep original order
                        } else {
                            // Fallback to last active molecule
                          if (activeCanvasMolecules.length > 0) {
                      cardData.afterLastMolecule = true;
                            cardData.afterMoleculeId = activeCanvasMolecules[activeCanvasMolecules.length - 1].id;
                              const lastIndex = updatedCanvasMolecules.findIndex(m => m.id === activeCanvasMolecules[activeCanvasMolecules.length - 1].id);
                              cardData.order = (lastIndex * 1000) + subOrder;
                            }
                          }
                      }
                    } else {
                        // Order out of bounds - append to end
                        if (activeCanvasMolecules.length > 0) {
                        cardData.afterLastMolecule = true;
                          cardData.afterMoleculeId = activeCanvasMolecules[activeCanvasMolecules.length - 1].id;
                          const lastIndex = updatedCanvasMolecules.findIndex(m => m.id === activeCanvasMolecules[activeCanvasMolecules.length - 1].id);
                          cardData.order = (lastIndex * 1000) + (card.order % 1000);
                      }
                    }
                  } else {
                      // No order - append to end
                      if (activeCanvasMolecules.length > 0) {
                      cardData.afterLastMolecule = true;
                        cardData.afterMoleculeId = activeCanvasMolecules[activeCanvasMolecules.length - 1].id;
                      }
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
              afterMoleculeId: c.afterMoleculeId,
              order: c.order
            }))
          });

          // Save updated workflow configuration
          // IMPORTANT: Save ALL molecules (active + inactive) to preserve positions
          // Inactive molecules (isActive: false) are kept in the collection but not displayed
          console.log('💾 Saving updated workflow configuration:', {
            total_molecules: updatedCanvasMolecules.length,
            active_molecules: updatedCanvasMolecules.filter(m => m.isActive !== false).length,
            inactive_molecules: updatedCanvasMolecules.filter(m => m.isActive === false).length,
            canvas_molecules: updatedCanvasMolecules.map(m => ({ 
              id: m.id, 
              title: m.title || 'untitled',
              atoms: m.atoms?.length || 0,
              isActive: m.isActive !== false 
            })),
            standalone_cards: standaloneCardsForWorkflow.length
          });
          const saveResponse = await fetch(`${MOLECULES_API}/workflow/save`, {
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

          if (!saveResponse.ok) {
            console.error('❌ Failed to save workflow configuration:', saveResponse.status, saveResponse.statusText);
            return;
          }

          // Clear pending changes after successful sync
          setPendingChanges({
            deletedMolecules: [],
            deletedAtoms: [],
            addedAtoms: []
          });

          console.log('✅ [SYNC END] Laboratory changes synced to Workflow collection');
        } else {
          console.warn('⚠️ [SYNC] No workflow_data, skipping sync');
        }
      } else {
        console.error('❌ [SYNC] Response not OK, skipping sync');
      }
    } catch (error) {
      console.error('❌ [SYNC ERROR] Failed to sync Laboratory changes to Workflow collection:', error);
      console.error('❌ [SYNC ERROR] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    }
  };

  // Expose sync function to parent component via ref
  React.useImperativeHandle(ref, () => ({
    syncWorkflowCollection: syncWorkflowCollectionOnLaboratorySave
  }), [pendingChanges, layoutCards]);

  if (isCanvasLoading) {
    return (
      <div className="relative h-full w-full bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <LoadingAnimation status={currentLoadingMessage} className="rounded-xl" />
      </div>
    );
  }

  // Build unified render array for workflow mode
  const unifiedRenderItems = workflowMolecules.length > 0 
    ? buildUnifiedRenderArray(workflowMolecules, Array.isArray(layoutCards) ? layoutCards : [])
    : [];

  if (workflowMolecules.length > 0) {
    return (
      <>
        <ConfirmationDialog
          open={deleteMoleculeDialogOpen}
          onOpenChange={handleDeleteMoleculeDialogOpenChange}
          onConfirm={confirmDeleteMoleculeContainer}
          onCancel={cancelDeleteMoleculeContainer}
          title="Delete molecule container?"
          description={`Deleting "${moleculeToDelete?.moleculeTitle || ''}" will remove the container and all its associated atoms. When you save, this change will reflect in Workflow Mode.`}
          icon={<Trash2 className="w-6 h-6 text-white" />}
          iconBgClass="bg-red-500"
          confirmLabel="Yes, delete"
          cancelLabel="Cancel"
          confirmButtonClass="bg-red-500 hover:bg-red-600"
        />
        <ConfirmationDialog
          open={deleteAtomDialogOpen}
          onOpenChange={handleDeleteAtomDialogOpenChange}
          onConfirm={confirmDeleteAtom}
          onCancel={cancelDeleteAtom}
          title="Delete atom?"
          description={`Are you sure you want to delete "${atomToDelete?.atomTitle || ''}"? This action cannot be undone.`}
          icon={<Trash2 className="w-6 h-6 text-white" />}
          iconBgClass="bg-red-500"
          confirmLabel="Yes, delete"
          cancelLabel="Cancel"
          confirmButtonClass="bg-red-500 hover:bg-red-600"
        />
        <ConfirmationDialog
          open={deleteAtomDialogOpen}
          onOpenChange={handleDeleteAtomDialogOpenChange}
          onConfirm={confirmDeleteAtom}
          onCancel={cancelDeleteAtom}
          title="Delete atom?"
          description={`Are you sure you want to delete "${atomToDelete?.atomTitle || ''}"? This action cannot be undone.`}
          icon={<Trash2 className="w-6 h-6 text-white" />}
          iconBgClass="bg-red-500"
          confirmLabel="Yes, delete"
          cancelLabel="Cancel"
          confirmButtonClass="bg-red-500 hover:bg-red-600"
        />
      <div className="h-full bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm overflow-auto">
        <div className={canEdit ? '' : 'pointer-events-none'}>
          <div className="p-6 space-y-6">
            {unifiedRenderItems.map((item) => {
              if (item.type === 'molecule-container') {
                const molecule = workflowMolecules.find(m => m.moleculeId === item.moleculeId);
                if (!molecule) return null;
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
                        .map((card, index) => {
                        const cardTitle = card.moleculeTitle
                          ? card.atoms.length > 0
                            ? `${card.moleculeTitle} - ${card.atoms[0].title}`
                            : `${card.moleculeTitle} - Card`
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
                                          handleDeleteAtomClick(card.id, atom.id, atom.title || '');
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
                              ) : atom.atomId === 'pivot-table' ? (
                                <PivotTableAtom atomId={atom.id} />
                                    ) : atom.atomId === 'unpivot' ? (
                                      <UnpivotAtom atomId={atom.id} />
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
                                    ) : atom.atomId === 'clustering' ? (
                                      <ClusteringAtom atomId={atom.id} />
                                    ) : atom.atomId === 'scenario-planner' ? (
                                      <ScenarioPlannerAtom atomId={atom.id} />
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

                        {/* Add New Card Button - Between cards within molecule */}
                        <div className="flex justify-center my-4">
                          <button
                            onClick={() => addNewCardWorkflow(molecule.moleculeId, index)}
                            onDragEnter={e => handleAddDragEnter(e, `molecule-${molecule.moleculeId}-after-${card.id}`)}
                            onDragLeave={handleAddDragLeave}
                            onDragOver={e => e.preventDefault()}
                            onDrop={e => {
                              void handleDropNewCardWorkflow(e, molecule.moleculeId, index);
                            }}
                            className={`flex flex-col items-center justify-center px-2 py-2 bg-white border-2 border-dashed rounded-xl hover:border-[#458EE2] hover:bg-blue-50 transition-all duration-500 ease-in-out group ${addDragTarget === `molecule-${molecule.moleculeId}-after-${card.id}` ? 'min-h-[160px] w-full border-[#458EE2] bg-blue-50' : 'border-gray-300'}`}
                            title="Add new card to molecule"
                          >
                            <Plus className={`w-5 h-5 text-gray-400 group-hover:text-[#458EE2] transition-transform duration-500 ${addDragTarget === `molecule-${molecule.moleculeId}-after-${card.id}` ? 'scale-125 mb-2' : ''}`} />
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

              {/* Add New Card Button - After molecule container */}
              <div className="flex justify-center my-4">
                <button
                  onClick={() => {
                    if (item.moleculeIndex !== undefined) {
                      addNewCardWorkflow(undefined, undefined, item.moleculeIndex, 0);
                    }
                  }}
                  onDragEnter={e => handleAddDragEnter(e, `after-molecule-${molecule.moleculeId}`)}
                  onDragLeave={handleAddDragLeave}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    if (item.moleculeIndex !== undefined) {
                      void handleDropNewCardWorkflow(e, undefined, undefined, item.moleculeIndex, 0);
                    }
                  }}
                  className={`flex flex-col items-center justify-center px-2 py-2 bg-white border-2 border-dashed rounded-xl hover:border-[#458EE2] hover:bg-blue-50 transition-all duration-500 ease-in-out group ${addDragTarget === `after-molecule-${molecule.moleculeId}` ? 'min-h-[160px] w-full border-[#458EE2] bg-blue-50' : 'border-gray-300'}`}
                  title="Add standalone card after molecule"
                >
                  <Plus className={`w-5 h-5 text-gray-400 group-hover:text-[#458EE2] transition-transform duration-500 ${addDragTarget === `after-molecule-${molecule.moleculeId}` ? 'scale-125 mb-2' : ''}`} />
                  <span
                    className="w-0 h-0 overflow-hidden ml-0 group-hover:ml-2 group-hover:w-[120px] group-hover:h-auto text-gray-600 group-hover:text-[#458EE2] font-medium whitespace-nowrap transition-all duration-500 ease-in-out"
                  >
                    Add Standalone Card
                  </span>
                </button>
              </div>
                  </React.Fragment>
                );
              } else if (item.type === 'standalone-card' && item.cardData) {
                // Render standalone card
                const card = item.cardData;
                const cardTitle = card.moleculeTitle
                  ? card.atoms.length > 0
                    ? `${card.moleculeTitle} - ${card.atoms[0].title}`
                    : `${card.moleculeTitle} - Card`
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
              ) : atom.atomId === 'pivot-table' ? (
                <PivotTableAtom atomId={atom.id} />
                                ) : atom.atomId === 'unpivot' ? (
                                  <UnpivotAtom atomId={atom.id} />
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

                    {/* Add New Card Button - After standalone card */}
                    <div className="flex justify-center my-4">
                      <button
                        onClick={() => {
                          if (item.moleculeIndex !== undefined && item.subOrder !== undefined) {
                            addNewCardWorkflow(undefined, undefined, item.moleculeIndex, item.subOrder);
                          }
                        }}
                        onDragEnter={e => handleAddDragEnter(e, `after-standalone-${card.id}`)}
                        onDragLeave={handleAddDragLeave}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => {
                          if (item.moleculeIndex !== undefined && item.subOrder !== undefined) {
                            void handleDropNewCardWorkflow(e, undefined, undefined, item.moleculeIndex, item.subOrder);
                          }
                        }}
                        className={`flex flex-col items-center justify-center px-2 py-2 bg-white border-2 border-dashed rounded-xl hover:border-[#458EE2] hover:bg-blue-50 transition-all duration-500 ease-in-out group ${addDragTarget === `after-standalone-${card.id}` ? 'min-h-[160px] w-full border-[#458EE2] bg-blue-50' : 'border-gray-300'}`}
                        title="Add standalone card"
                      >
                        <Plus className={`w-5 h-5 text-gray-400 group-hover:text-[#458EE2] transition-transform duration-500 ${addDragTarget === `after-standalone-${card.id}` ? 'scale-125 mb-2' : ''}`} />
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
            })}
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
                                handleDeleteAtomClick(card.id, atom.id, atom.title || '');
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
              ) : atom.atomId === 'pivot-table' ? (
                <PivotTableAtom atomId={atom.id} />
                            ) : atom.atomId === 'unpivot' ? (
                              <UnpivotAtom atomId={atom.id} />
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
    <>
      <ConfirmationDialog
        open={deleteAtomDialogOpen}
        onOpenChange={handleDeleteAtomDialogOpenChange}
        onConfirm={confirmDeleteAtom}
        onCancel={cancelDeleteAtom}
        title="Delete atom?"
        description={`Are you sure you want to delete "${atomToDelete?.atomTitle || ''}"? This action cannot be undone.`}
        icon={<Trash2 className="w-6 h-6 text-white" />}
        iconBgClass="bg-red-500"
        confirmLabel="Yes, delete"
        cancelLabel="Cancel"
        confirmButtonClass="bg-red-500 hover:bg-red-600"
      />
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
          
          // Check if someone is editing this card
          const editor = cardEditors?.get(card.id);
          const isBeingEdited = !!editor;
          
          return (
          <React.Fragment key={card.id}>
          <Card
            data-card-id={card.id}
            className={`relative w-full ${collapsedCards[card.id] ? '' : 'min-h-[200px]'} bg-white rounded-2xl border-2 transition-all duration-300 flex flex-col overflow-hidden ${
              dragOver === card.id
                ? 'border-[#458EE2] bg-gradient-to-br from-blue-50 to-blue-100 shadow-lg'
                : isBeingEdited
                ? `shadow-lg`
                : 'border-gray-200 shadow-sm hover:shadow-md'
            }`}
            style={isBeingEdited ? {
              borderColor: editor.user_color,
              boxShadow: `0 0 0 2px ${editor.user_color}40`,
            } : undefined}
            onClick={(e) => handleCardClick(e, card.id, card.isExhibited)}
            onDragOver={(e) => handleDragOver(e, card.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, card.id)}
            onMouseEnter={() => onCardFocus?.(card.id)}
            onMouseLeave={() => onCardBlur?.(card.id)}
          >
            {/* Editor Badge - shows who's editing this card */}
            {isBeingEdited && editor && (
              <div 
                className="absolute top-2 right-2 px-2 py-1 rounded-full text-xs font-medium text-white shadow-md z-10 flex items-center gap-1"
                style={{ backgroundColor: editor.user_color }}
              >
                <div 
                  className="w-2 h-2 rounded-full bg-white/80 animate-pulse"
                  title={`${editor.user_name} is editing`}
                />
                <span className="max-w-[150px] truncate">
                  {editor.user_email}
                </span>
              </div>
            )}
            
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
                            handleDeleteAtomClick(card.id, atom.id, atom.title || '');
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
            ) : atom.atomId === 'pivot-table' ? (
              <PivotTableAtom atomId={atom.id} />
                      ) : atom.atomId === 'unpivot' ? (
                        <UnpivotAtom atomId={atom.id} />
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
                              handleDeleteAtomClick(card.id, atom.id, atom.title || '');
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
              ) : atom.atomId === 'pivot-table' ? (
                <PivotTableAtom atomId={atom.id} />
                          ) : atom.atomId === 'unpivot' ? (
                            <UnpivotAtom atomId={atom.id} />
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
    </>
  );
});

export default CanvasArea;
export type { CanvasAreaRef };