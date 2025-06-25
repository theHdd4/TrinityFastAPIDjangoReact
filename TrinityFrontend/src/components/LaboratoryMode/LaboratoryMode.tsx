
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Save, Share2, Undo2, Database } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Header from '@/components/Header';
import { safeStringify } from '@/utils/safeStringify';
import AtomLibrary from '@/components/AtomList/AtomLibrary';
import CanvasArea from './components/CanvasArea';
import SettingsPanel from './components/SettingsPanel';
import SavedDataFramesPanel from './components/SavedDataFramesPanel';
import { useExhibitionStore } from '@/components/ExhibitionMode/store/exhibitionStore';
import { REGISTRY_API, LAB_ACTIONS_API } from '@/lib/api';
import { useLaboratoryStore } from './store/laboratoryStore';

const LaboratoryMode = () => {
  const [selectedAtomId, setSelectedAtomId] = useState<string>();
  const [selectedCardId, setSelectedCardId] = useState<string>();
  const [cardExhibited, setCardExhibited] = useState<boolean>(false);
  const [isSettingsCollapsed, setIsSettingsCollapsed] = useState(false);
  const [showSavedFrames, setShowSavedFrames] = useState(false);
  const { toast } = useToast();
  const { cards, setCards } = useExhibitionStore();
  const setLabCards = useLaboratoryStore(state => state.setCards);

  const handleUndo = async () => {
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
          localStorage.setItem('laboratory-layout-cards', safeStringify(last.state));
          const labConfig = {
            cards: last.state,
            exhibitedCards: last.state.filter((c: any) => c.isExhibited),
            timestamp: new Date().toISOString(),
          };
          localStorage.setItem('laboratory-config', safeStringify(labConfig));
          await fetch(`${REGISTRY_API}/projects/${proj.id}/`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state: { laboratory_config: labConfig } }),
          }).catch(() => {});
          await fetch(`${LAB_ACTIONS_API}/${last.id}/`, { method: 'DELETE', credentials: 'include' }).catch(() => {});
          toast({ title: 'Undo', description: 'Last change reverted' });
        }
      }
    } catch {
      /* ignore */
    }
  };

  const handleAtomDragStart = (e: React.DragEvent, atomId: string) => {
    const atomData = { id: atomId };
    e.dataTransfer.setData('application/json', JSON.stringify(atomData));
  };

  const handleAtomSelect = (atomId: string) => {
    setSelectedAtomId(atomId);
    setSelectedCardId(undefined);
  };

  const handleCardSelect = (cardId: string, exhibited: boolean) => {
    setSelectedAtomId(undefined);
    setSelectedCardId(cardId);
    setCardExhibited(exhibited);
  };

  const toggleSettings = () => {
    setIsSettingsCollapsed(!isSettingsCollapsed);
  };

  const handleSave = async () => {
    const exhibitedCards = cards.filter(card => card.isExhibited);

    setCards(cards);
    
    // Save the current laboratory configuration
    const labConfig = {
      cards,
      exhibitedCards,
      timestamp: new Date().toISOString()
    };
    
    // Store in localStorage for persistence
    localStorage.setItem('laboratory-config', safeStringify(labConfig));

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
      } catch {
        /* ignore */
      }
    }
    
    toast({
      title: "Configuration Saved",
      description: `Laboratory configuration saved successfully. ${exhibitedCards.length} card(s) marked for exhibition.`,
    });
  };

  return (
    <div className="h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex flex-col">
      <Header />
      
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
              className="border-gray-200 hover:bg-gray-50 text-gray-700 font-medium"
              onClick={handleUndo}
            >
              <Undo2 className="w-4 h-4 mr-2" />
              Undo
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-gray-200 hover:bg-gray-50 text-gray-700 font-medium"
              onClick={handleSave}
            >
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-gray-200 hover:bg-gray-50 text-gray-700 font-medium"
              onClick={() => setShowSavedFrames(!showSavedFrames)}
            >
              <Database className="w-4 h-4 mr-2" />
              DataFrames
            </Button>
            <Button variant="outline" size="sm" className="border-gray-200 hover:bg-gray-50 text-gray-700 font-medium">
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
            <Button className="bg-gradient-to-r from-[#41C185] to-[#3ba876] hover:from-[#3ba876] to-[#339966] text-white shadow-lg font-medium">
              <Play className="w-4 h-4 mr-2" />
              Run Pipeline
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Atoms Sidebar */}
        <AtomLibrary onAtomDragStart={handleAtomDragStart} />

        {/* Main Canvas Area */}
        <div className="flex-1 p-6" onClick={() => {setSelectedAtomId(undefined); setSelectedCardId(undefined);}}>
          <CanvasArea onAtomSelect={handleAtomSelect} onCardSelect={handleCardSelect} selectedCardId={selectedCardId} />
        </div>

        {/* Settings Panel */}
        <SettingsPanel
          isCollapsed={isSettingsCollapsed}
          onToggle={toggleSettings}
          selectedAtomId={selectedAtomId}
          selectedCardId={selectedCardId}
          cardExhibited={cardExhibited}
        />
        <SavedDataFramesPanel isOpen={showSavedFrames} onClose={() => setShowSavedFrames(false)} />
      </div>
    </div>
  );
};

export default LaboratoryMode;
