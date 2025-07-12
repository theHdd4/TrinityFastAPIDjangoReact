import React, { useState, useEffect } from 'react';
import { safeStringify } from '@/utils/safeStringify';
import { Card, Card as AtomBox } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Grid3X3, Trash2, Eye, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import { useExhibitionStore } from '../../ExhibitionMode/store/exhibitionStore';
import { atoms as allAtoms } from '@/components/AtomList/data';
import { molecules } from '@/components/MoleculeList/data';
import {
  REGISTRY_API,
  TEXT_API,
  CARD_API,
  LAB_ACTIONS_API,
  VALIDATE_API,
  FEATURE_OVERVIEW_API,
} from '@/lib/api';
import { AIChatBot } from '@/components/TrinityAI';
import TextBoxEditor from '@/components/AtomList/atoms/text-box/TextBoxEditor';
import DataUploadValidateAtom from '@/components/AtomList/atoms/data-upload-validate/DataUploadValidateAtom';
import FeatureOverviewAtom from '@/components/AtomList/atoms/feature-overview/FeatureOverviewAtom';
import ConcatAtom from '@/components/AtomList/atoms/concat/ConcatAtom';
import MergeAtom from '@/components/AtomList/atoms/merge/MergeAtom';

import {
  useLaboratoryStore,
  LayoutCard,
  DroppedAtom,
  DEFAULT_TEXTBOX_SETTINGS,
  DEFAULT_DATAUPLOAD_SETTINGS,
  DEFAULT_FEATURE_OVERVIEW_SETTINGS,
} from '../store/laboratoryStore';


interface WorkflowMolecule {
  moleculeId: string;
  moleculeTitle: string;
  atoms: Array<{
    atomName: string;
    order: number;
  }>;
}

interface CanvasAreaProps {
  onAtomSelect?: (atomId: string) => void;
  onCardSelect?: (cardId: string, exhibited: boolean) => void;
  selectedCardId?: string;
  onToggleSettingsPanel?: () => void;
}

const deriveWorkflowMolecules = (cards: LayoutCard[]): WorkflowMolecule[] => {
  const map = new Map<string, WorkflowMolecule>();
  cards.forEach(card => {
    if (card.moleculeId) {
      const info = molecules.find(m => m.id === card.moleculeId);
      if (!map.has(card.moleculeId)) {
        map.set(card.moleculeId, {
          moleculeId: card.moleculeId,
          moleculeTitle: card.moleculeTitle || (info ? info.title : card.moleculeId),
          atoms: []
        });
      }
    }
  });
  return Array.from(map.values());
};

const STORAGE_KEY = 'laboratory-layout-cards';

const CanvasArea: React.FC<CanvasAreaProps> = ({ onAtomSelect, onCardSelect, selectedCardId, onToggleSettingsPanel }) => {
  const { cards: layoutCards, setCards: setLayoutCards, updateAtomSettings } = useLaboratoryStore();
  const [workflowMolecules, setWorkflowMolecules] = useState<WorkflowMolecule[]>([]);
  const [activeTab, setActiveTab] = useState<string>('');
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>({});
  const prevLayout = React.useRef<LayoutCard[] | null>(null);
  const initialLoad = React.useRef(true);
  
  const { updateCard, setCards } = useExhibitionStore();

  interface ColumnInfo {
    column: string;
    data_type: string;
    unique_count: number;
    unique_values: string[];
  }

  const fetchColumnSummary = async (csv: string) => {
    try {
      console.log('🔎 fetching column summary for', csv);
      const res = await fetch(
        `${FEATURE_OVERVIEW_API}/column_summary?object_name=${encodeURIComponent(csv)}`
      );
      if (!res.ok) {
        console.warn('⚠️ column summary request failed', res.status);
        return { summary: [], numeric: [], xField: '' };
      }
      const data = await res.json();
      const summary: ColumnInfo[] = (data.summary || []).filter(Boolean);
      console.log('ℹ️ fetched column summary rows', summary.length);
      const numeric = summary
        .filter(c => !['object', 'string'].includes(c.data_type.toLowerCase()))
        .map(c => c.column);
      const xField =
        summary.find(c => c.column.toLowerCase().includes('date'))?.column ||
        (summary[0]?.column || '');
      return { summary, numeric, xField };
    } catch (err) {
      console.error('⚠️ failed to fetch column summary', err);
      return { summary: [], numeric: [], xField: '' };
    }
  };

  const prefetchDataframe = async (name: string) => {
    if (!name) return;
    try {
      console.log('✈️ fetching flight table', name);
      const fr = await fetch(
        `${FEATURE_OVERVIEW_API}/flight_table?object_name=${encodeURIComponent(name)}`
      );
      if (fr.ok) {
        await fr.arrayBuffer();
        console.log('✅ fetched flight table', name);
      }
      console.log('🔎 prefetching dataframe', name);
      const res = await fetch(
        `${FEATURE_OVERVIEW_API}/cached_dataframe?object_name=${encodeURIComponent(name)}`
      );
      if (res.ok) {
        await res.text();
        console.log('✅ prefetched dataframe', name);
      } else {
        console.warn('⚠️ prefetch dataframe failed', res.status);
      }
    } catch (err) {
      console.error('⚠️ prefetch dataframe error', err);
    }
  };

  const findLatestDataSource = async () => {
    console.log('🔎 searching for latest data source');
    if (!Array.isArray(layoutCards)) return null;
    for (let i = layoutCards.length - 1; i >= 0; i--) {
      const card = layoutCards[i];
      for (let j = card.atoms.length - 1; j >= 0; j--) {
        const a = card.atoms[j];
        if (a.atomId === 'feature-overview' && a.settings?.dataSource) {
          console.log('✔️ found feature overview data source', a.settings.dataSource);
          await prefetchDataframe(a.settings.dataSource);
          const cols = await fetchColumnSummary(a.settings.dataSource);
          return {
            csv: a.settings.dataSource,
            display: a.settings.csvDisplay || a.settings.dataSource,
            identifiers: a.settings.selectedColumns || [],
            ...(cols || {}),
          };
        }
        if (a.atomId === 'data-upload-validate') {
          const req = a.settings?.requiredFiles?.[0];
          const validatorId = a.settings?.validatorId;
          if (req) {
            try {
              const [ticketRes, confRes] = await Promise.all([
                fetch(`${VALIDATE_API}/latest_ticket/${encodeURIComponent(req)}`),
                validatorId
                  ? fetch(`${VALIDATE_API}/get_validator_config/${validatorId}`)
                  : Promise.resolve(null as any),
              ]);
              if (ticketRes.ok) {
                const ticket = await ticketRes.json();
                if (ticket.arrow_name) {
                  console.log('✔️ using validated data source', ticket.arrow_name);
                  await prefetchDataframe(ticket.arrow_name);
                  const cols = await fetchColumnSummary(ticket.arrow_name);
                  let ids: string[] = [];
                  if (confRes && confRes.ok) {
                    const cfg = await confRes.json();
                    ids =
                      cfg.classification?.[req]?.final_classification?.identifiers || [];
                  }
                  return {
                    csv: ticket.arrow_name,
                    display: ticket.csv_name,
                    identifiers: ids,
                    ...(cols || {}),
                  };
                }
              }
            } catch {
              /* ignore */
            }
          }
        }
      }
    }

    try {
      const res = await fetch(`${VALIDATE_API}/list_saved_dataframes`);
      if (res.ok) {
        const data = await res.json();
        const file = Array.isArray(data.files) ? data.files[0] : null;
        if (file) {
          console.log('✔️ defaulting to first saved dataframe', file.object_name);
          await prefetchDataframe(file.object_name);
          const cols = await fetchColumnSummary(file.object_name);
          return { csv: file.object_name, display: file.csv_name, ...(cols || {}) };
        }
      }
    } catch {
      /* ignore */
    }

    return null;
  };

  const prefillFeatureOverview = async (cardId: string, atomId: string) => {
    const prev = await findLatestDataSource();
    if (!prev || !prev.csv) {
      console.warn('⚠️ no data source found for feature overview');
      return;
    }
    console.log('ℹ️ prefill data source details', prev);
    await prefetchDataframe(prev.csv);
    console.log('✅ pre-filling feature overview with', prev.csv);
    const summary = Array.isArray(prev.summary) ? prev.summary : [];
    const identifiers = Array.isArray(prev.identifiers) ? prev.identifiers : [];
    const filtered =
      identifiers.length > 0
        ? summary.filter(s => identifiers.includes(s.column))
        : summary;
    const selected =
      identifiers.length > 0
        ? identifiers
        : (Array.isArray(summary) ? summary : []).map(cc => cc.column);

    updateAtomSettings(atomId, {
      dataSource: prev.csv,
      csvDisplay: prev.display || prev.csv,
      allColumns: summary,
      columnSummary: filtered,
      selectedColumns: selected,
      numericColumns: Array.isArray(prev.numeric) ? prev.numeric : [],
      xAxis: prev.xField || 'date',
    });
  };

  // Load saved layout and workflow rendering
  useEffect(() => {
    let initialCards: LayoutCard[] | null = null;

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
              atoms: []
            });
          }
          moleculeMap.get(atom.moleculeId)!.atoms.push({
            atomName: atom.atomName,
            order: atom.order
          });
        });

        moleculeMap.forEach(molecule => {
          molecule.atoms.sort((a, b) => a.order - b.order);
        });

        const molecules = Array.from(moleculeMap.values());
        setWorkflowMolecules(molecules);

        if (molecules.length > 0) {
          setActiveTab(molecules[0].moleculeId);
        }
        localStorage.removeItem('workflow-selected-atoms');
      } catch (e) {
        console.error('Failed to parse workflow atoms', e);
      }
    }

    if (workflowAtoms.length > 0) {
      initialCards = workflowAtoms.map(atom => {
        const atomInfo =
          allAtoms.find(a => a.id === atom.atomName || a.title === atom.atomName) ||
          ({} as any);
        const dropped: DroppedAtom = {
          id: `${atom.atomName}-${Date.now()}-${Math.random()}`,
          atomId: atomInfo.id || atom.atomName,
          title: atomInfo.title || atom.atomName,
          category: atomInfo.category || 'Atom',
          color: atomInfo.color || 'bg-gray-400'
        };
        return {
          id: `card-${atom.atomName}-${Date.now()}-${Math.random()}`,
          atoms: [dropped],
          isExhibited: false,
          moleculeId: atom.moleculeId,
          moleculeTitle: atom.moleculeTitle
        } as LayoutCard;
      });
      const wfInit = deriveWorkflowMolecules(initialCards);
      setWorkflowMolecules(wfInit);
      if (wfInit.length > 0) {
        setActiveTab(wfInit[0].moleculeId);
      }
    } else {
      const storedLayout = localStorage.getItem(STORAGE_KEY);
      if (storedLayout && storedLayout !== 'undefined') {
        try {
          const raw = JSON.parse(storedLayout);
          initialCards = Array.isArray(raw)
            ? raw.map((c: any) => ({
                id: c.id,
                atoms: Array.isArray(c.atoms) ? c.atoms.map((a: any) => ({ ...a })) : [],
                isExhibited: !!c.isExhibited,
                moleculeId: c.moleculeId,
                moleculeTitle: c.moleculeTitle
              }))
            : null;
          if (initialCards) {
            const wf = deriveWorkflowMolecules(initialCards);
            if (wf.length > 0) {
              setWorkflowMolecules(wf);
              setActiveTab(wf[0].moleculeId);
            }
          }
        } catch (e) {
          console.error('Failed to parse stored laboratory layout', e);
          localStorage.removeItem(STORAGE_KEY);
        }
      } else {
        const current = localStorage.getItem('current-project');
        if (current) {
          fetch(`${REGISTRY_API}/projects/${JSON.parse(current).id}/`, { credentials: 'include' })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
              if (data && data.state && data.state.laboratory_config) {
                const cfg = data.state.laboratory_config;
                localStorage.setItem(STORAGE_KEY, safeStringify(cfg.cards));
                localStorage.setItem('laboratory-config', safeStringify(cfg));
                if (!storedAtoms && data.state.workflow_selected_atoms) {
                  localStorage.setItem('workflow-selected-atoms', safeStringify(data.state.workflow_selected_atoms));
                }
                window.location.reload();
              }
            })
            .catch(() => {});
        }
      }
    }

    if (initialCards) {
      setLayoutCards(initialCards);
    }
  }, []);

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
        settings:
          atom.id === 'text-box'
            ? { ...DEFAULT_TEXTBOX_SETTINGS }
            : atom.id === 'data-upload-validate'
            ? { ...DEFAULT_DATAUPLOAD_SETTINGS }
            : atom.id === 'feature-overview'
            ? { ...DEFAULT_FEATURE_OVERVIEW_SETTINGS }
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
      }
    }
  };

const addNewCard = (moleculeId?: string, position?: number) => {
  const info = moleculeId ? molecules.find(m => m.id === moleculeId) : undefined;
  const newCard: LayoutCard = {
    id: `card-${Date.now()}`,
    atoms: [],
    isExhibited: false,
    moleculeId,
    moleculeTitle: info?.title
  };
  if (position === undefined || position >= layoutCards.length) {
    setLayoutCards([...(Array.isArray(layoutCards) ? layoutCards : []), newCard]);
  } else {
    const arr = Array.isArray(layoutCards) ? layoutCards : [];
    setLayoutCards([
      ...arr.slice(0, position),
      newCard,
      ...arr.slice(position)
    ]);
  }
  setCollapsedCards(prev => ({ ...prev, [newCard.id]: false }));
};

  const removeAtom = (cardId: string, atomId: string) => {
    setLayoutCards(
      (Array.isArray(layoutCards) ? layoutCards : []).map(card =>
        card.id === cardId
          ? { ...card, atoms: card.atoms.filter(atom => atom.id !== atomId) }
          : card
      )
    );
  };


  const normalizeName = (s: string) => s.toLowerCase().replace(/[\s_-]/g, '');

  const addAtomByName = (cardId: string, atomName: string) => {
    const norm = normalizeName(atomName);
    const info = allAtoms.find(
      a => normalizeName(a.id) === norm || normalizeName(a.title) === norm
    );
    if (!info) return;
    const newAtom: DroppedAtom = {
      id: `${info.id}-${Date.now()}`,
      atomId: info.id,
      title: info.title,
      category: info.category,
      color: info.color,
      settings:
        info.id === 'text-box'
          ? { ...DEFAULT_TEXTBOX_SETTINGS }
          : info.id === 'data-upload-validate'
          ? { ...DEFAULT_DATAUPLOAD_SETTINGS }
          : info.id === 'feature-overview'
          ? { ...DEFAULT_FEATURE_OVERVIEW_SETTINGS }
          : undefined,
    };
    setLayoutCards(
      (Array.isArray(layoutCards) ? layoutCards : []).map(card =>
        card.id === cardId ? { ...card, atoms: [...card.atoms, newAtom] } : card
      )
    );

    if (info.id === 'feature-overview') {
      prefillFeatureOverview(cardId, newAtom.id);
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
        await fetch(`${REGISTRY_API}/projects/${proj.id}/`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: { laboratory_config: { cards: updated } } }),
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

  const handleExhibitionToggle = (cardId: string, isExhibited: boolean) => {
    const updated = (Array.isArray(layoutCards) ? layoutCards : []).map(card =>
      card.id === cardId ? { ...card, isExhibited } : card
    );

    setLayoutCards(updated);
    setCards(updated);
  };

  if (workflowMolecules.length > 0) {
    return (
      <div className="h-full bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm overflow-auto">
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
                              <span className="text-xs text-gray-500">Exhibit the Card</span>
                              <Switch
                                checked={card.isExhibited || false}
                                onCheckedChange={checked => handleExhibitionToggle(card.id, checked)}
                                onClick={e => e.stopPropagation()}
                                className="data-[state=checked]:bg-[#458EE2]"
                              />
                              <button
                                onClick={e => { e.stopPropagation(); deleteCard(card.id); }}
                                className="p-1 hover:bg-gray-100 rounded"
                              >
                                <Trash2 className="w-4 h-4 text-gray-400" />
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
                                        <button
                                          onClick={e => handleAtomSettingsClick(e, atom.id)}
                                          className="p-1 hover:bg-gray-100 rounded"
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
                                        className="opacity-0 group-hover:opacity-100 transition-all duration-200 p-1 hover:bg-gray-100 rounded"
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
                        className="flex items-center px-2 py-2 bg-white border-2 border-dashed border-gray-300 rounded-xl hover:border-[#458EE2] hover:bg-blue-50 transition-all duration-500 ease-in-out group"
                      >
                        <Plus className="w-5 h-5 text-gray-400 group-hover:text-[#458EE2]" />
                        <span
                          className="max-w-0 overflow-hidden ml-0 group-hover:ml-2 group-hover:max-w-[120px] text-gray-600 group-hover:text-[#458EE2] font-medium whitespace-nowrap transition-all duration-500 ease-in-out"
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
    );
  }

  return (
    <div className="h-full w-full bg-gradient-to-br from-gray-50 to-gray-100 rounded-xl border border-gray-200 shadow-sm overflow-auto">
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
            {/* Card Header with Exhibition Toggle */}
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
                    onClick={e => handleAtomSettingsClick(e, card.atoms[0].id)}
                    className="p-1 hover:bg-gray-100 rounded"
                    title="Atom Settings"
                  >
                    <Settings className="w-4 h-4 text-gray-400" />
                  </button>
                )}
                <button
                  onClick={e => { e.stopPropagation(); toggleCardCollapse(card.id); }}
                  className="p-1 hover:bg-gray-100 rounded"
                  title="Toggle Card"
                >
                  {collapsedCards[card.id] ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </button>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500">Exhibit the Card</span>
                <Switch
                  checked={card.isExhibited || false}
                  onCheckedChange={(checked) => handleExhibitionToggle(card.id, checked)}
                  onClick={e => e.stopPropagation()}
                  className="data-[state=checked]:bg-[#458EE2]"
                />
                <button
                  onClick={e => { e.stopPropagation(); deleteCard(card.id); }}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <Trash2 className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            </div>

            {/* Card Content */}
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
                          <button
                            onClick={e => handleAtomSettingsClick(e, atom.id)}
                            className="p-1 hover:bg-gray-100 rounded"
                            title="Atom Settings"
                          >
                            <Settings className="w-4 h-4 text-gray-400" />
                          </button>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeAtom(card.id, atom.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-all duration-200 p-1 hover:bg-gray-100 rounded"
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
                      ) : atom.atomId === 'concat' ? (
                        <ConcatAtom atomId={atom.id} />
                      ) : atom.atomId === 'merge' ? (
                        <MergeAtom atomId={atom.id} />
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
                className="flex items-center px-2 py-2 bg-white border-2 border-dashed border-gray-300 rounded-xl hover:border-[#458EE2] hover:bg-blue-50 transition-all duration-500 ease-in-out group"
                title="Add new card"
              >
                <Plus className="w-5 h-5 text-gray-400 group-hover:text-[#458EE2]" />
                <span
                  className="max-w-0 overflow-hidden ml-0 group-hover:ml-2 group-hover:max-w-[120px] text-gray-600 group-hover:text-[#458EE2] font-medium whitespace-nowrap transition-all duration-500 ease-in-out"
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
            className="flex items-center px-2 py-2 bg-white border-2 border-dashed border-gray-300 rounded-xl hover:border-[#458EE2] hover:bg-blue-50 transition-all duration-500 ease-in-out group"
          >
            <Plus className="w-5 h-5 text-gray-400 group-hover:text-[#458EE2]" />
            <span
              className="max-w-0 overflow-hidden ml-0 group-hover:ml-2 group-hover:max-w-[120px] text-gray-600 group-hover:text-[#458EE2] font-medium whitespace-nowrap transition-all duration-500 ease-in-out"
            >
              Add New Card
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CanvasArea;
