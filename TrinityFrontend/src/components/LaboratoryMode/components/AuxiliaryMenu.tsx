import React, { useState } from 'react';
import SettingsPanel from './SettingsPanel/';
import SavedDataFramesPanel from './SavedDataFramesPanel';
import HelpPanel from './HelpPanel/';
import { Settings, Database, HelpCircle, HelpCircleIcon } from 'lucide-react';

interface Props {
  selectedAtomId?: string;
  selectedCardId?: string;
  cardExhibited?: boolean;
  active?: 'settings' | 'frames' | 'help' | null;
  onActiveChange?: (active: 'settings' | 'frames' | 'help' | null) => void;
}

const AuxiliaryMenu: React.FC<Props> = ({
  selectedAtomId,
  selectedCardId,
  cardExhibited,
  active: activeProp,
  onActiveChange
}) => {
  const [internalActive, setInternalActive] = useState<'settings' | 'frames' | 'help' | null>(null);
  const controlled = activeProp !== undefined;
  const active = controlled ? activeProp : internalActive;

  const setActive = (value: 'settings' | 'frames' | 'help' | null) => {
    if (controlled) {
      onActiveChange?.(value);
    } else {
      setInternalActive(value);
    }
  };

  const openSettings = () => setActive(active === 'settings' ? null : 'settings');
  const openFrames = () => setActive(active === 'frames' ? null : 'frames');
  const openHelp = () => setActive(active === 'help' ? null : 'help');

  return (
    <div className="flex h-full">
      {/* Panel Area - Shows when active */}
      {active === 'settings' && (
        <SettingsPanel
          isCollapsed={false}
          onToggle={() => setActive(null)}
          selectedAtomId={selectedAtomId}
          selectedCardId={selectedCardId}
          cardExhibited={cardExhibited}
        />
      )}
      
      {active === 'frames' && (
        <SavedDataFramesPanel isOpen={true} onToggle={() => setActive(null)} />
      )}

      {active === 'help' && (
        <HelpPanel
          isCollapsed={false}
          onToggle={() => setActive(null)}
          selectedAtomId={selectedAtomId}
          selectedCardId={selectedCardId}
          cardExhibited={cardExhibited}
        />
      )}

      {/* Icons Column - Always visible and stays on the right */}
      <div className="bg-white border-l border-gray-200 transition-all duration-300 flex flex-col h-full w-12 flex-shrink-0">
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <button 
            onClick={openSettings} 
            className={`inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground rounded-md p-1 h-8 w-8 ${
              active === 'settings' ? 'bg-accent text-accent-foreground' : ''
            }`}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <button 
            onClick={openFrames} 
            className={`inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground rounded-md p-1 h-8 w-8 ${
              active === 'frames' ? 'bg-accent text-accent-foreground' : ''
            }`}
          >
            <Database className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <button 
            onClick={openHelp} 
            className={`inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground rounded-md p-1 h-8 w-8 ${
              active === 'help' ? 'bg-accent text-accent-foreground' : ''
            }`}
          >
            <HelpCircle className="w-5 h-5 text-gray-600" strokeWidth={2} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuxiliaryMenu;