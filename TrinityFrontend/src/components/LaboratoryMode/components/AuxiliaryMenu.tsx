import React, { useState } from 'react';
import SettingsPanel from './SettingsPanel/';
import SavedDataFramesPanel from './SavedDataFramesPanel';
import HelpPanel from './HelpPanel/';
import ExhibitionPanel from './ExhibitionPanel';
import { SuperagentAIPanel } from '@/components/TrinityAI';
import { Settings, Database, HelpCircle, Sparkles, GalleryHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

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

      {active === 'superagent' && (
        <SuperagentAIPanel
          isCollapsed={false}
          onToggle={() => setActive(null)}
        />
      )}

      {active === 'exhibition' && <ExhibitionPanel onToggle={() => setActive(null)} />}

      {/* Icons Column - Always visible and stays on the right */}
      <div className="bg-white border-l border-gray-200 transition-all duration-300 flex flex-col h-full w-12 flex-shrink-0">
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <button
            onClick={openSettings}
            className={cn(
              'group relative inline-flex h-8 w-8 items-center justify-center gap-2 whitespace-nowrap rounded-md p-1 text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
              active === 'settings' && 'bg-accent text-accent-foreground'
            )}
            title="Settings"
            data-settings="true"
          >
            <Settings className="w-4 h-4" />
            <span className="absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
              Settings
            </span>
          </button>
        </div>
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <button
            onClick={openFrames}
            className={cn(
              'group relative inline-flex h-8 w-8 items-center justify-center gap-2 whitespace-nowrap rounded-md p-1 text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
              active === 'frames' && 'bg-accent text-accent-foreground'
            )}
            title="Saved DataFrames"
            data-saved-dataframes="true"
          >
            <Database className="w-4 h-4" />
            <span className="absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
              Saved DataFrames
            </span>
          </button>
        </div>
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <button
            onClick={openSuperagent}
            className={cn(
              'group relative inline-flex h-8 w-8 items-center justify-center gap-2 whitespace-nowrap rounded-md p-1 text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
              active === 'superagent' && 'bg-accent text-accent-foreground'
            )}
            title="Trinity AI"
            data-superagent-ai="true"
          >
            <Sparkles className="w-4 h-4 text-purple-500" />
            <span className="absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
              Trinity AI
            </span>
          </button>
        </div>
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <button
            onClick={openExhibition}
            className={cn(
              'group relative inline-flex h-8 w-8 items-center justify-center gap-2 whitespace-nowrap rounded-md p-1 text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
              active === 'exhibition' && 'bg-accent text-accent-foreground'
            )}
            title="Exhibition"
            data-exhibition-panel-toggle="true"
          >
            <GalleryHorizontal className="w-4 h-4 text-gray-600" />
            <span className="absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
              Exhibition
            </span>
          </button>
        </div>
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <button
            onClick={openHelp}
            className={cn(
              'group relative inline-flex h-8 w-8 items-center justify-center gap-2 whitespace-nowrap rounded-md p-1 text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
              active === 'help' && 'bg-accent text-accent-foreground'
            )}
            title="Help"
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