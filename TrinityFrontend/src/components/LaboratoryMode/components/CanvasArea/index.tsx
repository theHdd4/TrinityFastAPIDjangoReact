import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { safeStringify } from '@/utils/safeStringify';
import { sanitizeLabConfig, persistLaboratoryConfig } from '@/utils/projectStorage';
import { Card, Card as AtomBox } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Grid3X3, Trash2, Eye, Settings, ChevronDown, Minus, RefreshCcw, Maximize2, X, HelpCircle, HelpCircleIcon } from 'lucide-react';
import { useExhibitionStore } from '../../../ExhibitionMode/store/exhibitionStore';
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


interface CanvasAreaProps {
  onAtomSelect?: (atomId: string) => void;
  onCardSelect?: (cardId: string, exhibited: boolean) => void;
  selectedCardId?: string;
  onToggleSettingsPanel?: () => void;
  onToggleHelpPanel?: () => void;
  canEdit: boolean;
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

  return rawCards.map((card: any) => ({
    id: card.id,
    atoms: Array.isArray(card.atoms)
      ? card.atoms.map((atom: any) => hydrateDroppedAtom(atom))
      : [],
    isExhibited: !!card.isExhibited,
    moleculeId: card.moleculeId,
    moleculeTitle: card.moleculeTitle,
  }));
};

const CanvasArea: React.FC<CanvasAreaProps> = ({
  onAtomSelect,
  onCardSelect,
  selectedCardId,
  onToggleSettingsPanel,
  onToggleHelpPanel,
  canEdit,
}) => {
  const { cards: layoutCards, setCards: setLayoutCards, updateAtomSettings } = useLaboratoryStore();
  const [workflowMolecules, setWorkflowMolecules] = useState<WorkflowMolecule[]>([]);
  const [activeTab, setActiveTab] = useState<string>('');
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>({});
  const [addDragTarget, setAddDragTarget] = useState<string | null>(null);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [showAtomSuggestion, setShowAtomSuggestion] = useState<Record<string, boolean>>({});
  const [isCanvasLoading, setIsCanvasLoading] = useState(true);
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
      outer: for (let i = layoutCards.length - 1; i >= 0; i--) {
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
    let hasAppliedInitialCards = false;
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

      const normalizedCards = Array.isArray(cards) ? cards : [];
      setLayoutCards(normalizedCards);
      const workflow = workflowOverride ?? deriveWorkflowMolecules(normalizedCards);
      setWorkflowMolecules(workflow);
      setActiveTab(prevTab => {
        if (workflow.length === 0) {
          return '';
        }

        if (prevTab && workflow.some(molecule => molecule.moleculeId === prevTab)) {
          return prevTab;
        }

        return workflow[0].moleculeId;
      });

      hasAppliedInitialCards = true;
      markLoadingComplete();
    };

    const storedAtoms = localStorage.getItem('workflow-selected-atoms');
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

                  const cardsFromConfig = hydrateLayoutCards(cfg.cards);
                  applyInitialCards(cardsFromConfig);
                }
              })
              .catch(() => {
                /* ignore load failures */
              })
              .finally(() => {
                if (!hasAppliedInitialCards) {
                  markLoadingComplete();
                }
              });
          }
        }
      }
    }

    if (initialCards) {
      applyInitialCards(initialCards, initialWorkflow);
    } else if (!hasPendingAsyncLoad && !hasAppliedInitialCards) {
      markLoadingComplete();
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
          fetch(`${LAB_ACTIONS_API}/`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ project: proj.id, state: prevLayout.current }),
          }).catch(() => {});
        } catch {
          /* ignore */
        }
      }
      prevLayout.current = Array.isArray(layoutCards)
        ? layoutCards.map(c => ({ ...c, atoms: [...c.atoms] }))
        : [];
    }
  }, [layoutCards]);

  // Sync cards with exhibition store
  useEffect(() => {
    setCards(layoutCards);
  }, [layoutCards, setCards]);

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
      
      setLayoutCards(
        (Array.isArray(layoutCards) ? layoutCards : []).map(card =>
          card.id === cardId
            ? { ...card, atoms: [...card.atoms, newAtom] }
            : card
        )
      );

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
  if (position === undefined || position >= layoutCards.length) {
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
    const response = await fetch(`${LABORATORY_API}/cards`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ atomId, moleculeId }),
    });
    if (!response.ok) {
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
    setLayoutCards(
      (Array.isArray(layoutCards) ? layoutCards : []).map(card =>
        card.id === cardId ? { ...card, atoms: [...card.atoms, newAtom] } : card
      )
    );

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
      <div className="h-full bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm overflow-auto">
        <div className={canEdit ? '' : 'pointer-events-none'}>
          <div className="p-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="mb-6 bg-white rounded-lg border border-gray-200 p-1 shadow-sm">
              <TabsList className="grid auto-cols-fr grid-flow-col w-full h-12 bg-transparent p-0 gap-1">
                {workflowMolecules.map((molecule) => (
                  <TabsTrigger
                    key={molecule.moleculeId}
                    value={molecule.moleculeId}
                    className="px-6 py-3 text-sm font-medium rounded-md transition-all duration-200 \
                             data-[state=active]:bg-[#458EE2] data-[state=active]:text-white data-[state=active]:shadow-md\
                             data-[state=inactive]:bg-transparent data-[state=inactive]:text-gray-600 \
                             data-[state=inactive]:hover:bg-gray-50 data-[state=inactive]:hover:text-gray-900\
                             border-0 ring-0 focus:ring-0 focus-visible:ring-0"
                  >
                    {molecule.moleculeTitle}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {workflowMolecules.map((molecule) => (
              <TabsContent key={molecule.moleculeId} value={molecule.moleculeId} className="mt-0">
                <div className="space-y-6">
                  <div className="flex items-center mb-6">
                    <h3 className="text-xl font-semibold text-gray-900">
                      {molecule.moleculeTitle} Atoms
                    </h3>
                  </div>

                  <div className="space-y-6 w-full">
                    {Array.isArray(layoutCards) &&
                      layoutCards
                        .filter(card => card.moleculeId === molecule.moleculeId)
                        .map(card => {
                        const cardTitle = card.moleculeTitle
                          ? card.atoms.length > 0
                            ? `${card.moleculeTitle} - ${card.atoms[0].title}`
                            : card.moleculeTitle
                          : card.atoms.length > 0
                            ? card.atoms[0].title
                            : 'Card';
                        return (
                        <Card
                          key={card.id}
                          data-card-id={card.id}
                          className={`w-full min-h-[200px] bg-white rounded-2xl border-2 transition-all duration-300 flex flex-col overflow-hidden ${
                            dragOver === card.id
                              ? 'border-[#458EE2] bg-gradient-to-br from-blue-50 to-blue-100 shadow-lg'
                              : 'border-gray-200 shadow-sm hover:shadow-md'
                          }`}
                          onDragOver={e => handleDragOver(e, card.id)}
                          onDragLeave={handleDragLeave}
                          onDrop={e => handleDrop(e, card.id)}
                        >
                          <div className="flex items-center justify-between p-4 border-b border-gray-100">
                            <div className="flex items-center space-x-2">
                              <Eye className={`w-4 h-4 ${card.isExhibited ? 'text-[#458EE2]' : 'text-gray-400'}`} />
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
                            </div>
                          </div>

                          <div className="flex-1 flex flex-col p-4 overflow-y-auto">
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
                                    ) : atom.atomId === 'chart-maker' ? (
                                      <ChartMakerAtom atomId={atom.id} />
                                    ) : atom.atomId === 'evaluate-models-feature' ? (
                                      <EvaluateModelsFeatureAtom atomId={atom.id} />
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
                        );
                      })}

                    <div className="flex justify-center">
                      <button
                        onClick={() => addNewCard(molecule.moleculeId)}
                        onDragEnter={e => handleAddDragEnter(e, `m-${molecule.moleculeId}`)}
                        onDragLeave={handleAddDragLeave}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => {
                          void handleDropNewCard(e, molecule.moleculeId);
                        }}
                        className={`flex flex-col items-center justify-center px-2 py-2 bg-white border-2 border-dashed rounded-xl hover:border-[#458EE2] hover:bg-blue-50 transition-all duration-500 ease-in-out group ${addDragTarget === `m-${molecule.moleculeId}` ? 'min-h-[160px] w-full border-[#458EE2] bg-blue-50' : 'border-gray-300'}`}
                      >
                        <Plus className={`w-5 h-5 text-gray-400 group-hover:text-[#458EE2] transition-transform duration-500 ${addDragTarget === `m-${molecule.moleculeId}` ? 'scale-125 mb-2' : ''}`} />
                        <span
                          className="w-0 h-0 overflow-hidden ml-0 group-hover:ml-2 group-hover:w-[120px] group-hover:h-auto text-gray-600 group-hover:text-[#458EE2] font-medium whitespace-nowrap transition-all duration-500 ease-in-out"
                        >
                          Add New Card
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>
      </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm overflow-auto">
      <div className={canEdit ? '' : 'pointer-events-none'}>
      {/* Layout Cards Container */}
      <div className="p-6 space-y-6 w-full">
        {Array.isArray(layoutCards) && layoutCards.map((card, index) => {
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
            {/* Card Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <Eye className={`w-4 h-4 ${card.isExhibited ? 'text-[#458EE2]' : 'text-gray-400'}`} />
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
          {index < layoutCards.length - 1 && (
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
              {/* Fullscreen Header */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white shadow-sm">
                <div className="flex items-center space-x-2">
                <Eye className={`w-4 h-4 ${layoutCards.find(c => c.id === expandedCard)?.isExhibited ? 'text-[#458EE2]' : 'text-gray-400'}`} />
                <span className="text-lg font-semibold text-gray-900">
                  {(() => {
                    const card = layoutCards.find(c => c.id === expandedCard);
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
                const card = layoutCards.find(c => c.id === expandedCard);
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
};

export default CanvasArea;
