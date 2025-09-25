import React, { useState } from 'react';
import SettingsPanel from './SettingsPanel/';
import SavedDataFramesPanel from './SavedDataFramesPanel';
import { Sliders, Database } from 'lucide-react';

interface Props {
  selectedAtomId?: string;
  selectedCardId?: string;
  cardExhibited?: boolean;
  active?: 'settings' | 'frames' | null;
  onActiveChange?: (active: 'settings' | 'frames' | null) => void;
}

const AuxiliaryMenu: React.FC<Props> = ({
  selectedAtomId,
  selectedCardId,
  cardExhibited,
  active: activeProp,
  onActiveChange
}) => {
  const [internalActive, setInternalActive] = useState<'settings' | 'frames' | null>(null);
  const controlled = activeProp !== undefined;
  const active = controlled ? activeProp : internalActive;

  const setActive = (value: 'settings' | 'frames' | null) => {
    if (controlled) {
      onActiveChange?.(value);
    } else {
      setInternalActive(value);
    }
  };

  const openSettings = () => setActive(active === 'settings' ? null : 'settings');
  const openFrames = () => setActive(active === 'frames' ? null : 'frames');

  if (!active) {
    return (
      <div className="bg-white border-l border-gray-200 transition-all duration-300 flex flex-col h-full w-12">
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <button onClick={openSettings} className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground rounded-md p-1 h-8 w-8">
            <Sliders className="w-4 h-4" />
          </button>
        </div>
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <button 
            onClick={openFrames} 
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 hover:bg-accent hover:text-accent-foreground rounded-md p-1 h-8 w-8"
            data-saved-dataframes="true"
            title="Saved DataFrames"
          >
            <Database className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  if (active === 'settings') {
    return (
      <SettingsPanel
        isCollapsed={false}
        onToggle={() => setActive(null)}
        selectedAtomId={selectedAtomId}
        selectedCardId={selectedCardId}
        cardExhibited={cardExhibited}
      />
    );
  }

  return <SavedDataFramesPanel isOpen={true} onToggle={() => setActive(null)} />;
};

export default AuxiliaryMenu;