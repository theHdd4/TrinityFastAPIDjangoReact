import React, { useState, useEffect } from 'react';
import { safeStringify } from '@/utils/safeStringify';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Plus, Grid3X3, Trash2, Eye } from 'lucide-react';
import { useExhibitionStore } from '../../ExhibitionMode/store/exhibitionStore';
import { atoms as allAtoms } from '@/components/AtomList/data';
import { molecules } from '@/components/MoleculeList/data';
import { REGISTRY_API } from '@/lib/api';

interface DroppedAtom {
  id: string;
  atomId: string;
  title: string;
  category: string;
  color: string;
}

interface LayoutCard {
  id: string;
  atoms: DroppedAtom[];
  isExhibited: boolean;
  moleculeId?: string;
  moleculeTitle?: string;
}

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

const CanvasArea: React.FC<CanvasAreaProps> = ({ onAtomSelect }) => {
  const [layoutCards, setLayoutCards] = useState<LayoutCard[]>([
    {
      id: 'card-1',
      atoms: [],
      isExhibited: false,
      moleculeId: undefined,
      moleculeTitle: undefined
    }
  ]);
  const [workflowMolecules, setWorkflowMolecules] = useState<WorkflowMolecule[]>([]);
  const [activeTab, setActiveTab] = useState<string>('');
  const [dragOver, setDragOver] = useState<string | null>(null);
  
  const { updateCard, setCards } = useExhibitionStore();

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
      if (storedLayout) {
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

  // Persist layout to localStorage safely
  useEffect(() => {
    try {
      const serializable = layoutCards.map(card => ({
        id: card.id,
        atoms: card.atoms.map(a => ({ ...a })),
        isExhibited: card.isExhibited,
        moleculeId: card.moleculeId,
        moleculeTitle: card.moleculeTitle
      }));
      localStorage.setItem(STORAGE_KEY, safeStringify(serializable));
    } catch (err) {
      console.error('Failed to persist laboratory layout', err);
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
        color: info?.color || atom.color || 'bg-gray-400'
      };
      
      setLayoutCards(prev => 
        prev.map(card => 
          card.id === cardId 
            ? { ...card, atoms: [...card.atoms, newAtom] }
            : card
        )
      );
    }
  };

  const addNewCard = (moleculeId?: string) => {
    const info = moleculeId ? molecules.find(m => m.id === moleculeId) : undefined;
    const newCard: LayoutCard = {
      id: `card-${Date.now()}`,
      atoms: [],
      isExhibited: false,
      moleculeId,
      moleculeTitle: info?.title
    };
    setLayoutCards(prev => [...prev, newCard]);
  };

  const removeAtom = (cardId: string, atomId: string) => {
    setLayoutCards(prev => 
      prev.map(card => 
        card.id === cardId 
          ? { ...card, atoms: card.atoms.filter(atom => atom.id !== atomId) }
          : card
      )
    );
  };

  const handleAtomClick = (atomId: string) => {
    if (onAtomSelect) {
      onAtomSelect(atomId);
    }
  };

  const handleExhibitionToggle = (cardId: string, isExhibited: boolean) => {
    setLayoutCards(prev => {
      const updated = prev.map(card =>
        card.id === cardId ? { ...card, isExhibited } : card
      );

      // persist updated layout immediately
      localStorage.setItem(STORAGE_KEY, safeStringify(updated));

      // persist exhibition configuration for direct use in Exhibition mode
      const exhibitedCards = updated.filter(c => c.isExhibited);
      const labConfig = {
        cards: updated,
        exhibitedCards,
        timestamp: new Date().toISOString(),
      };
      localStorage.setItem('laboratory-config', safeStringify(labConfig));

      return updated;
    });

    // keep exhibition store in sync
    updateCard(cardId, { isExhibited });
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
                    {layoutCards
                      .filter(card => card.moleculeId === molecule.moleculeId)
                      .map(card => (
                        <div
                          key={card.id}
                          className={`w-full min-h-[200px] bg-white rounded-2xl border-2 transition-all duration-300 flex flex-col ${
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
                                {card.moleculeTitle ? (
                                  card.atoms.length > 0
                                    ? `${card.moleculeTitle} - ${card.atoms[0].title}`
                                    : card.moleculeTitle
                                ) : card.atoms.length > 0 ? card.atoms[0].title : 'Card'}
                              </span>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="text-xs text-gray-500">Exhibit the Card</span>
                              <Switch
                                checked={card.isExhibited || false}
                                onCheckedChange={checked => handleExhibitionToggle(card.id, checked)}
                                className="data-[state=checked]:bg-[#458EE2]"
                              />
                            </div>
                          </div>

                          <div className="flex-1 flex flex-col p-4">
                            {card.atoms.length === 0 ? (
                              <div className="flex-1 flex flex-col items-center justify-center text-center border-2 border-dashed border-gray-300 rounded-lg min-h-[140px] mx-4 mb-4">
                                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                  <Grid3X3 className="w-8 h-8 text-gray-400" />
                                </div>
                                <p className="text-gray-500 mb-2">No atoms in this section</p>
                                <p className="text-sm text-gray-400">Configure this atom for your application</p>
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {card.atoms.map(atom => (
                                  <Card
                                    key={atom.id}
                                    className="p-4 cursor-pointer hover:shadow-lg transition-all duration-200 group border border-gray-200 bg-white"
                                    onClick={() => handleAtomClick(atom.id)}
                                  >
                                    <div className="flex items-center justify-between mb-3">
                                      <div className={`w-3 h-3 ${atom.color} rounded-full`}></div>
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

                                    <div>
                                      <h4 className="font-semibold text-gray-900 mb-1 text-sm">{atom.title}</h4>
                                      <p className="text-xs text-gray-600 mb-2">{atom.category}</p>
                                      <p className="text-xs text-gray-500">Configure this atom for your application</p>
                                    </div>
                                  </Card>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}

                    <div className="flex justify-center">
                      <button
                        onClick={() => addNewCard(molecule.moleculeId)}
                        className="flex items-center space-x-2 px-6 py-3 bg-white border-2 border-dashed border-gray-300 rounded-xl hover:border-[#458EE2] hover:bg-blue-50 transition-all duration-200 group"
                      >
                        <Plus className="w-5 h-5 text-gray-400 group-hover:text-[#458EE2]" />
                        <span className="text-gray-600 group-hover:text-[#458EE2] font-medium">Add a new card</span>
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
        {layoutCards.map((card, index) => (
          <div
            key={card.id}
            className={`w-full min-h-[200px] bg-white rounded-2xl border-2 transition-all duration-300 flex flex-col ${
              dragOver === card.id
                ? 'border-[#458EE2] bg-gradient-to-br from-blue-50 to-blue-100 shadow-lg'
                : 'border-gray-200 shadow-sm hover:shadow-md'
            }`}
            onDragOver={(e) => handleDragOver(e, card.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, card.id)}
          >
            {/* Card Header with Exhibition Toggle */}
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <div className="flex items-center space-x-2">
                <Eye className={`w-4 h-4 ${card.isExhibited ? 'text-[#458EE2]' : 'text-gray-400'}`} />
                <span className="text-sm font-medium text-gray-700">
                  {card.moleculeTitle ? (
                    card.atoms.length > 0
                      ? `${card.moleculeTitle} - ${card.atoms[0].title}`
                      : card.moleculeTitle
                  ) : card.atoms.length > 0 ? card.atoms[0].title : 'Card'}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs text-gray-500">Exhibit the Card</span>
                <Switch
                  checked={card.isExhibited || false}
                  onCheckedChange={(checked) => handleExhibitionToggle(card.id, checked)}
                  className="data-[state=checked]:bg-[#458EE2]"
                />
              </div>
            </div>

            {/* Card Content */}
            <div className="flex-1 flex flex-col p-4">
              {card.atoms.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center border-2 border-dashed border-gray-300 rounded-lg min-h-[140px] mx-4 mb-4">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                    <Grid3X3 className="w-8 h-8 text-gray-400" />
                  </div>
                  <p className="text-gray-500 mb-2">No atoms in this section</p>
                  <p className="text-sm text-gray-400">Configure this atom for your application</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {card.atoms.map((atom) => (
                    <Card 
                      key={atom.id}
                      className="p-4 cursor-pointer hover:shadow-lg transition-all duration-200 group border border-gray-200 bg-white"
                      onClick={() => handleAtomClick(atom.id)}
                    >
                      {/* Atom Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className={`w-3 h-3 ${atom.color} rounded-full`}></div>
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
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-1 text-sm">{atom.title}</h4>
                        <p className="text-xs text-gray-600 mb-2">{atom.category}</p>
                        <p className="text-xs text-gray-500">
                          Configure this atom for your application
                        </p>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Add New Card Button */}
        <div className="flex justify-center">
          <button
            onClick={() => addNewCard()}
            className="flex items-center space-x-2 px-6 py-3 bg-white border-2 border-dashed border-gray-300 rounded-xl hover:border-[#458EE2] hover:bg-blue-50 transition-all duration-200 group"
          >
            <Plus className="w-5 h-5 text-gray-400 group-hover:text-[#458EE2]" />
            <span className="text-gray-600 group-hover:text-[#458EE2] font-medium">
              Add a new card
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default CanvasArea;
