import React, { useCallback, useState } from 'react';
import SettingsPanel from './SettingsPanel/';
import SavedDataFramesPanel from './SavedDataFramesPanel';
import HelpPanel from './HelpPanel/';
import ExhibitionPanel from './ExhibitionPanel';
import { TrinityAIIcon, TrinityAIPanel } from '@/components/TrinityAI';
import { Settings, Database, HelpCircle, GalleryHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TrinityBackgroundStatus {
  isProcessing: boolean;
  isCollapsed: boolean;
  hasActiveWorkflow: boolean;
}

interface Props {
  selectedAtomId?: string;
  selectedCardId?: string;
  cardExhibited?: boolean;
  active?: 'settings' | 'frames' | 'help' | 'trinity' | 'exhibition' | null;
  onActiveChange?: (
    active: 'settings' | 'frames' | 'help' | 'trinity' | 'exhibition' | null,
  ) => void;
  trinityAILayout?: 'vertical' | 'horizontal';
  isTrinityAIVisible?: boolean;
  onTrinityAIClose?: () => void;
}

const AuxiliaryMenu: React.FC<Props> = ({
  selectedAtomId,
  selectedCardId,
  cardExhibited,
  active: activeProp,
  onActiveChange,
  trinityAILayout = 'vertical',
  isTrinityAIVisible = true,
  onTrinityAIClose
}) => {
  const [internalActive, setInternalActive] = useState<
    'settings' | 'frames' | 'help' | 'trinity' | 'exhibition' | null
  >(null);
  const controlled = activeProp !== undefined;
  const active = controlled ? activeProp : internalActive;

  const setActive = (
    value: 'settings' | 'frames' | 'help' | 'trinity' | 'exhibition' | null,
  ) => {
    if (controlled) {
      onActiveChange?.(value);
    } else {
      setInternalActive(value);
    }
  };

  const openSettings = () => {
    // In horizontal layout, don't close AI panel when opening settings
    if (trinityAILayout === 'horizontal') {
      setActive(active === 'settings' ? null : 'settings');
    } else {
      setActive(active === 'settings' ? null : 'settings');
    }
  };
  const openFrames = () => {
    // In horizontal layout, don't close AI panel when opening frames
    if (trinityAILayout === 'horizontal') {
      setActive(active === 'frames' ? null : 'frames');
    } else {
      setActive(active === 'frames' ? null : 'frames');
    }
  };
  const openHelp = () => setActive(active === 'help' ? null : 'help');
  const openExhibition = () => setActive(active === 'exhibition' ? null : 'exhibition');
  const openTrinityAI = () => setActive(active === 'trinity' ? null : 'trinity');

  const [trinityBackgroundStatus, setTrinityBackgroundStatus] = useState<TrinityBackgroundStatus>({
    isProcessing: false,
    isCollapsed: true,
    hasActiveWorkflow: false
  });

  const handleTrinityBackgroundStatus = useCallback((status: TrinityBackgroundStatus) => {
    setTrinityBackgroundStatus(status);
  }, []);

  const showTrinityBackgroundBanner = trinityBackgroundStatus.isProcessing && trinityBackgroundStatus.isCollapsed;

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

      {/* Trinity AI Panel - Only render for vertical layout */}
      {/* For horizontal layout, it's rendered in LaboratoryMode component at bottom */}
      {trinityAILayout === 'vertical' && isTrinityAIVisible && (
        <div className={active === 'trinity' ? '' : 'hidden'}>
          <TrinityAIPanel
            isCollapsed={active !== 'trinity'}
            onToggle={() => setActive(active === 'trinity' ? null : 'trinity')}
            onBackgroundStatusChange={handleTrinityBackgroundStatus}
            layout="vertical"
            onClose={onTrinityAIClose}
          />
        </div>
      )}

      {showTrinityBackgroundBanner && (
        <div className="absolute right-16 bottom-8 z-40 pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3 bg-white/95 border-2 border-[#458EE2]/30 rounded-2xl shadow-xl px-4 py-3 backdrop-blur-md">
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-gray-800 font-inter">
                Trinity AI is processing in background
              </span>
              {trinityBackgroundStatus.hasActiveWorkflow && (
                <span className="text-xs text-gray-500 font-inter">
                  Workflow execution continues
                </span>
              )}
            </div>
            <Button
              onClick={() => setActive('trinity')}
              className="h-9 bg-[#458EE2] hover:bg-[#376fba] text-white font-semibold px-4 rounded-xl transition-all duration-200"
            >
              Reopen
            </Button>
          </div>
        </div>
      )}

      {active === 'exhibition' && <ExhibitionPanel onToggle={() => setActive(null)} />}

      {/* Icons Column - Always visible and stays on the right */}
      <div className="bg-white border-l border-gray-200 transition-all duration-300 flex flex-col h-full w-12 flex-shrink-0">
        <div className="p-3 border-b border-gray-200 flex items-center justify-center">
          <button
            onClick={() => {
              // Toggle between collapsed and expanded, but never completely hide
              // The panel is always visible, just minimized or expanded
              openTrinityAI();
            }}
            className={`w-9 h-9 rounded-lg hover:bg-muted transition-all group relative hover:scale-105 hover:shadow-lg flex items-center justify-center ${
              active === 'trinity' ? 'bg-muted text-foreground' : ''
            }`}
            title="Trinity AI - Click to expand/collapse"
            data-trinity-ai="true"
            type="button"
          >
            <TrinityAIIcon className="text-purple-500" />
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
        <div className="p-3 border-b border-gray-200 flex items-center justify-center hidden">
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