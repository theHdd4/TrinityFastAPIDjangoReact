
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Play, Save, Share2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Header from '@/components/Header';
import { safeStringify } from '@/utils/safeStringify';
import AtomLibrary from '@/components/AtomList/AtomLibrary';
import CanvasArea from './components/CanvasArea';
import SettingsPanel from './components/SettingsPanel';
import { useExhibitionStore } from '@/components/ExhibitionMode/store/exhibitionStore';
import { REGISTRY_API } from '@/lib/api';

const LaboratoryMode = () => {
  const [selectedAtomId, setSelectedAtomId] = useState<string>();
  const [isSettingsCollapsed, setIsSettingsCollapsed] = useState(false);
  const { toast } = useToast();
  const { cards, setCards } = useExhibitionStore();

  const handleAtomDragStart = (e: React.DragEvent, atomId: string) => {
    const atomData = { id: atomId };
    e.dataTransfer.setData('application/json', JSON.stringify(atomData));
  };

  const handleAtomSelect = (atomId: string) => {
    setSelectedAtomId(atomId);
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
              onClick={handleSave}
            >
              <Save className="w-4 h-4 mr-2" />
              Save
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
        <div className="flex-1 p-6">
          <CanvasArea onAtomSelect={handleAtomSelect} />
        </div>

        {/* Settings Panel */}
        <SettingsPanel
          isCollapsed={isSettingsCollapsed}
          onToggle={toggleSettings}
          selectedAtomId={selectedAtomId}
        />
      </div>
    </div>
  );
};

export default LaboratoryMode;
