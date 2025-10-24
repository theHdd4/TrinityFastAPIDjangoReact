import React, { useState } from 'react';
import SettingsPanel from './SettingsPanel/';
import SavedDataFramesPanel from './SavedDataFramesPanel';
import HelpPanel from './HelpPanel/';
import ExhibitionPanel from './ExhibitionPanel';
import { SuperagentAIPanel } from '@/components/TrinityAI';
import { Settings, Database, HelpCircle, Sparkles, GalleryHorizontal } from 'lucide-react';

interface Props {
  selectedAtomId?: string;
  selectedCardId?: string;
  cardExhibited?: boolean;
  active?: 'settings' | 'frames' | 'help' | 'superagent' | 'exhibition' | null;
  onActiveChange?: (
    active: 'settings' | 'frames' | 'help' | 'superagent' | 'exhibition' | null,
  ) => void;
}

const AuxiliaryMenu: React.FC<Props> = ({
  selectedAtomId,
  selectedCardId,
  cardExhibited,
  active: activeProp,
  onActiveChange
}) => {
  const [internalActive, setInternalActive] = useState<
    'settings' | 'frames' | 'help' | 'superagent' | 'exhibition' | null
  >(null);
  const controlled = activeProp !== undefined;
  const active = controlled ? activeProp : internalActive;

  const setActive = (
    value: 'settings' | 'frames' | 'help' | 'superagent' | 'exhibition' | null,
  ) => {
    if (controlled) {
      onActiveChange?.(value);
    } else {
      setInternalActive(value);
    }
  };

  const openSettings = () => setActive(active === 'settings' ? null : 'settings');
  const openFrames = () => setActive(active === 'frames' ? null : 'frames');
  const openHelp = () => setActive(active === 'help' ? null : 'help');
  const openExhibition = () => setActive(active === 'exhibition' ? null : 'exhibition');
  const openSuperagent = () => setActive(active === 'superagent' ? null : 'superagent');

  return (
    <div className="relative z-30 flex h-full">
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

      {active === 'superagent' && (
        <SuperagentAIPanel
          isCollapsed={false}
          onToggle={() => setActive(null)}
        />
      )}

      {active === 'exhibition' && <ExhibitionPanel onToggle={() => setActive(null)} />}

      {/* Icons Column - Always visible and stays on the right */}
      <div className="bg-white border-l border-gray-200 transition-all duration-300 flex flex-col h-full w-12 flex-shrink-0">
        <div className="p-3 border-b border-gray-200 flex items-center justify-center">
          <button
            onClick={openSuperagent}
            className={`w-9 h-9 rounded-lg hover:bg-muted transition-all group relative hover:scale-105 hover:shadow-lg flex items-center justify-center ${
              active === 'superagent' ? 'bg-muted text-foreground' : ''
            }`}
            title="Trinity AI"
            data-superagent-ai="true"
            type="button"
          >
            <Sparkles className="w-4 h-4 text-purple-500" />
            <span className="absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
              Trinity AI
            </span>
          </button>
        </div>
        <div className="p-3 border-b border-gray-200 flex items-center justify-center">
          <button
            onClick={openSettings}
            className={`w-9 h-9 rounded-lg hover:bg-muted transition-all group relative hover:scale-105 hover:shadow-lg flex items-center justify-center ${
              active === 'settings' ? 'bg-muted text-foreground' : ''
            }`}
            title="Settings"
            data-settings="true"
            type="button"
          >
            <Settings className="w-4 h-4" />
            <span className="absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
              Settings
            </span>
          </button>
        </div>
        <div className="p-3 border-b border-gray-200 flex items-center justify-center">
          <button
            onClick={openFrames}
            className={`w-9 h-9 rounded-lg hover:bg-muted transition-all group relative hover:scale-105 hover:shadow-lg flex items-center justify-center ${
              active === 'frames' ? 'bg-muted text-foreground' : ''
            }`}
            title="Saved DataFrames"
            data-saved-dataframes="true"
            type="button"
          >
            <Database className="w-4 h-4" />
            <span className="absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
              Saved DataFrames
            </span>
          </button>
        </div>
        <div className="p-3 border-b border-gray-200 flex items-center justify-center">
          <button
            onClick={openExhibition}
            className={`w-9 h-9 rounded-lg hover:bg-muted transition-all group relative hover:scale-105 hover:shadow-lg flex items-center justify-center ${
              active === 'exhibition' ? 'bg-muted text-foreground' : ''
            }`}
            title="Exhibition"
            data-exhibition-panel-toggle="true"
            type="button"
          >
            <GalleryHorizontal className="w-4 h-4 text-gray-600" />
            <span className="absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
              Exhibition
            </span>
          </button>
        </div>
        <div className="p-3 border-b border-gray-200 flex items-center justify-center">
          <button
            onClick={openHelp}
            className={`w-9 h-9 rounded-lg hover:bg-muted transition-all group relative hover:scale-105 hover:shadow-lg flex items-center justify-center ${
              active === 'help' ? 'bg-muted text-foreground' : ''
            }`}
            title="Help"
            type="button"
          >
            <HelpCircle className="w-5 h-5 text-gray-600" strokeWidth={2} />
            <span className="absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
              Help
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default AuxiliaryMenu;