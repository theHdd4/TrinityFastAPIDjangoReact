
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Save, Share2, Undo2, AlertTriangle, List } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Header from '@/components/Header';
import { safeStringify } from '@/utils/safeStringify';
import CanvasArea from './components/CanvasArea';
import AuxiliaryMenu from './components/AuxiliaryMenu';
import AuxiliaryMenuLeft from './components/AuxiliaryMenuLeft';
import FloatingNavigationList from './components/FloatingNavigationList';
import { useExhibitionStore } from '@/components/ExhibitionMode/store/exhibitionStore';
import { REGISTRY_API, LAB_ACTIONS_API } from '@/lib/api';
import { useLaboratoryStore } from './store/laboratoryStore';
import { useAuth } from '@/contexts/AuthContext';
import { addNavigationItem, logSessionState } from '@/lib/session';

const LaboratoryMode = () => {
  const [selectedAtomId, setSelectedAtomId] = useState<string>();
  const [selectedCardId, setSelectedCardId] = useState<string>();
  const [cardExhibited, setCardExhibited] = useState<boolean>(false);
  const [auxActive, setAuxActive] = useState<'settings' | 'frames' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFloatingNavigationList, setShowFloatingNavigationList] = useState(true);
  const { toast } = useToast();
  const { cards, setCards } = useExhibitionStore();
  const setLabCards = useLaboratoryStore(state => state.setCards);
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('laboratory:edit');

  useEffect(() => {
    if (localStorage.getItem('laboratory-config')) {
      console.log('Successfully Loaded Existing Project State');
      toast({ title: 'Successfully Loaded Existing Project State' });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUndo = async () => {
    if (!canEdit) return;
    const current = localStorage.getItem('current-project');
    if (!current) return;
    try {
      const proj = JSON.parse(current);
      const res = await fetch(`${LAB_ACTIONS_API}/?project=${proj.id}`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        const last = Array.isArray(data) ? data[0] : data.results?.[0];
        if (last && last.state) {
          setLabCards(last.state);
          setCards(last.state);
          try {
            const labConfig = {
              cards: last.state,
              exhibitedCards: last.state.filter((c: any) => c.isExhibited),
              timestamp: new Date().toISOString(),
            };
            await fetch(`${REGISTRY_API}/projects/${proj.id}/`, {
              method: 'PATCH',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ state: { laboratory_config: labConfig } }),
            }).catch(() => {});
            await fetch(`${LAB_ACTIONS_API}/${last.id}/`, { method: 'DELETE', credentials: 'include' }).catch(() => {});
            toast({ title: 'Undo', description: 'Last change reverted' });
          } catch (storageError) {
            console.error('Storage error during undo:', storageError);
            setError('Storage quota exceeded. Please clear browser data and try again.');
          }
        }
      }
    } catch (error) {
      console.error('Undo error:', error);
      setError('Failed to undo. Please try again.');
    }
  };

  const handleAtomDragStart = (e: React.DragEvent, atomId: string) => {
    if (!canEdit) return;
    const atomData = { id: atomId };
    e.dataTransfer.setData('application/json', JSON.stringify(atomData));
  };

  const handleAtomSelect = (atomId: string) => {
    if (!canEdit) return;
    setSelectedAtomId(atomId);
    setSelectedCardId(undefined);
  };

  const handleCardSelect = (cardId: string, exhibited: boolean) => {
    if (!canEdit) return;
    setSelectedAtomId(undefined);
    setSelectedCardId(cardId);
    setCardExhibited(exhibited);
  };

  const toggleSettingsPanel = () => {
    if (!canEdit) return;
    setAuxActive(prev => (prev === 'settings' ? null : 'settings'));
  };

  const handleSave = async () => {
    if (!canEdit) return;
    try {
      const exhibitedCards = cards.filter(card => card.isExhibited);

      setCards(cards);
      
      // Save the current laboratory configuration
      const labConfig = {
        cards,
        exhibitedCards,
        timestamp: new Date().toISOString()
      };

      const current = localStorage.getItem('current-project');
      if (current) {
        try {
          const proj = JSON.parse(current);
          await fetch(`${REGISTRY_API}/projects/${proj.id}/`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              state: { laboratory_config: labConfig },
            }),
          });
          localStorage.setItem('laboratory-layout-cards', safeStringify(cards));
          localStorage.setItem('laboratory-config', safeStringify(labConfig));
        } catch (apiError) {
          console.error('API error during save:', apiError);
          // Don't show error for API failures, just log them
        }
      }
      
      toast({
        title: "Configuration Saved",
        description: `Laboratory configuration saved successfully. ${exhibitedCards.length} card(s) marked for exhibition.`,
      });
      setError(null);
      const allAtoms = cards.flatMap(card =>
        card.atoms.map(atom => ({
          id: atom.id,
          title: atom.title,
          category: atom.category,
          color: atom.color,
          cardId: card.id,
        }))
      );
      addNavigationItem(user?.id, { atom: 'laboratory-save', atoms: allAtoms });
      logSessionState(user?.id);
    } catch (error) {
      console.error('Save error:', error);
      setError('Failed to save configuration. Please try again.');
      toast({
        title: "Save Error",
        description: "Failed to save configuration. Please try again.",
        variant: "destructive",
      });
    }
  };

  const clearStorageAndReload = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
      window.location.reload();
    } catch (e) {
      console.error('Failed to clear storage:', e);
      window.location.reload();
    }
  };

  return (
    <div className="h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col">
      <Header />
      
      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <AlertTriangle className="w-5 h-5 text-red-600 mr-3" />
              <span className="text-red-800 text-sm">{error}</span>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setError(null)}
                className="text-red-600 border-red-300 hover:bg-red-50"
              >
                Dismiss
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearStorageAndReload}
                className="text-red-600 border-red-300 hover:bg-red-50"
              >
                Clear Storage & Reload
              </Button>
            </div>
          </div>
        </div>
      )}
      
      {/* Laboratory Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-200/60 px-6 py-6 flex-shrink-0 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-light text-gray-900 mb-2">Laboratory Mode</h2>
            <p className="text-gray-600 font-light">Build sophisticated applications with modular atoms</p>
          </div>
          
          <div className="flex items-center space-x-3">
            <Button
              variant="outline"
              size="sm"
              className={`border-gray-200 text-gray-700 font-medium ${canEdit ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'}`}
              onClick={handleUndo}
              disabled={!canEdit}
            >
              <Undo2 className="w-4 h-4 mr-2" />
              Undo
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={`border-gray-200 text-gray-700 font-medium ${canEdit ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'}`}
              onClick={handleSave}
              disabled={!canEdit}
            >
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={`border-gray-200 text-gray-700 font-medium ${canEdit ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'}`}
              onClick={() => canEdit && setShowFloatingNavigationList(!showFloatingNavigationList)}
              disabled={!canEdit}
            >
              <List className="w-4 h-4 mr-2" />
              {showFloatingNavigationList ? 'Hide' : 'Show'} Navigation List
            </Button>
            <Button
              variant="outline"
              size="sm"
              className={`border-gray-200 text-gray-700 font-medium ${canEdit ? 'hover:bg-gray-50' : 'opacity-50 cursor-not-allowed'}`}
              disabled={!canEdit}
            >
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
            <Button
              className={`bg-gradient-to-r from-[#41C185] to-[#3ba876] text-white shadow-lg font-medium ${canEdit ? 'hover:from-[#3ba876] to-[#339966]' : 'opacity-50 cursor-not-allowed'}`}
              disabled={!canEdit}
            >
              <Play className="w-4 h-4 mr-2" />
              Run Pipeline
            </Button>
          </div>
        </div>
      </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Atoms Sidebar */}
          <div className={`${canEdit ? '' : 'cursor-not-allowed'} h-full`}>
            <div className={`${canEdit ? '' : 'pointer-events-none'} h-full`}>
              <AuxiliaryMenuLeft onAtomDragStart={handleAtomDragStart} />
            </div>
          </div>

          {/* Main Canvas Area */}
          <div
            className={`flex-1 p-6 ${canEdit ? '' : 'cursor-not-allowed'}`}
            onClick={
              canEdit
                ? () => {
                    setSelectedAtomId(undefined);
                    setSelectedCardId(undefined);
                  }
                : undefined
            }
          >
            <div className={`${canEdit ? '' : 'pointer-events-none'} h-full`}>
              <CanvasArea
                onAtomSelect={handleAtomSelect}
                onCardSelect={handleCardSelect}
                selectedCardId={selectedCardId}
                onToggleSettingsPanel={toggleSettingsPanel}
              />
            </div>
          </div>

          {/* Auxiliary menu */}
          <div className={`${canEdit ? '' : 'cursor-not-allowed'} h-full`}>
            <div className={`${canEdit ? '' : 'pointer-events-none'} h-full`}>
              <AuxiliaryMenu
                selectedAtomId={selectedAtomId}
                selectedCardId={selectedCardId}
                cardExhibited={cardExhibited}
                active={auxActive}
                onActiveChange={setAuxActive}
              />
              <FloatingNavigationList
                isVisible={showFloatingNavigationList}
                onClose={() => setShowFloatingNavigationList(false)}
              />
            </div>
          </div>
        </div>
    </div>
  );
};

export default LaboratoryMode;
