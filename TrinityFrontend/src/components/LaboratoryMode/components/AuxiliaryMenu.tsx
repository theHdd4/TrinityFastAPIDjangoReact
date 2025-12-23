import React, { useCallback, useState, useRef } from 'react';
import SettingsPanel from './SettingsPanel/';
import SavedDataFramesPanel from './SavedDataFramesPanel';
import HelpPanel from './HelpPanel/';
import ExhibitionPanel from './ExhibitionPanel';
import { GuidedWorkflowPanel } from './GuidedWorkflowPanel';
import MetricsPanel from './MetricsPanel';
import { TrinityAIIcon, TrinityAIPanel } from '@/components/TrinityAI';
import { Settings, Database, HelpCircle, GalleryHorizontal, Undo2, Save, Share2, List, Play, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

interface TrinityBackgroundStatus {
  isProcessing: boolean;
  isCollapsed: boolean;
  hasActiveWorkflow: boolean;
}

interface ActiveUser {
  client_id: string;
  name: string;
  email: string;
  color?: string;
}

interface Props {
  selectedAtomId?: string;
  selectedCardId?: string;
  cardExhibited?: boolean;
  active?: 'settings' | 'frames' | 'help' | 'trinity' | 'exhibition' | 'guided' | 'metrics' | null;
  onActiveChange?: (
    active: 'settings' | 'frames' | 'help' | 'trinity' | 'exhibition' | 'guided' | 'metrics' | null,
  ) => void;
  trinityAILayout?: 'vertical' | 'horizontal';
  isTrinityAIVisible?: boolean;
  onTrinityAIClose?: () => void;
  // Toolbar props
  canEdit?: boolean;
  activeUsers?: ActiveUser[];
  autosaveEnabled?: boolean;
  setAutosaveEnabled?: (enabled: boolean) => void;
  onUndo?: () => void;
  onSave?: () => void;
  onShare?: () => void;
  showFloatingNavigationList?: boolean;
  setShowFloatingNavigationList?: (show: boolean) => void;
  // Guided workflow props
  onCreateDataUploadAtom?: () => Promise<void>;
  isGuidedModeEnabled?: boolean;
}

const AuxiliaryMenu: React.FC<Props> = ({
  selectedAtomId,
  selectedCardId,
  cardExhibited,
  active: activeProp,
  onActiveChange,
  trinityAILayout = 'vertical',
  isTrinityAIVisible = true,
  onTrinityAIClose,
  canEdit = true,
  activeUsers = [],
  autosaveEnabled = true,
  setAutosaveEnabled,
  onUndo,
  onSave,
  onShare,
  showFloatingNavigationList = true,
  setShowFloatingNavigationList,
  onCreateDataUploadAtom,
  isGuidedModeEnabled = false,
}) => {
  const [internalActive, setInternalActive] = useState<
    'settings' | 'frames' | 'help' | 'trinity' | 'exhibition' | 'guided' | 'metrics' | null
  >(null);
  const controlled = activeProp !== undefined;
  const active = controlled ? activeProp : internalActive;

  // Get metric guided flow state from store
  const isMetricGuidedFlowOpen = useLaboratoryStore(state => state.isMetricGuidedFlowOpen);

  // Refs to track user interactions with guided workflow
  const userClosedGuidedRef = useRef(false);
  const settingsExplicitlyOpenedRef = useRef(false);

  const setActive = (
    value: 'settings' | 'frames' | 'help' | 'trinity' | 'exhibition' | 'guided' | 'metrics' | null,
  ) => {
    if (controlled) {
      onActiveChange?.(value);
    } else {
      setInternalActive(value);
    }
  };

  const openSettings = () => {
    // Mark as explicitly opened when user clicks Settings icon
    settingsExplicitlyOpenedRef.current = true;
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
  const openGuidedWorkflow = () => setActive(active === 'guided' ? null : 'guided');
  const openMetrics = () => setActive(active === 'metrics' ? null : 'metrics');

  // Keep guided workflow panel open when any guided mode is enabled (data upload or metric)
  const anyGuidedModeActive = isGuidedModeEnabled || isMetricGuidedFlowOpen;
  
  // Track the previous value of anyGuidedModeActive to detect when it changes from true to false
  const prevAnyGuidedModeActiveRef = useRef(anyGuidedModeActive);

  React.useEffect(() => {
    const wasGuidedModeActive = prevAnyGuidedModeActiveRef.current;
    prevAnyGuidedModeActiveRef.current = anyGuidedModeActive;

    if (anyGuidedModeActive) {
      // If Settings tries to open automatically (not explicitly), redirect to Guided Workflow
      if (active === 'settings' && !settingsExplicitlyOpenedRef.current && !userClosedGuidedRef.current) {
        // Use setTimeout to avoid state update conflicts
        const timeoutId = setTimeout(() => {
          setActive('guided');
        }, 0);
        return () => clearTimeout(timeoutId);
      }
      // If no panel is active and user hasn't explicitly closed it, open Guided Workflow
      if (active === null && !userClosedGuidedRef.current) {
        setActive('guided');
      }
    } else {
      // Only close the guided panel if guided mode was previously active and is now disabled
      // This prevents auto-closing when the user manually opens the guided panel
      if (wasGuidedModeActive && active === 'guided') {
        setActive(null);
      }
      userClosedGuidedRef.current = false;
      settingsExplicitlyOpenedRef.current = false;
    }
  }, [anyGuidedModeActive, active, setActive]);

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

      {active === 'guided' && (
        <GuidedWorkflowPanel
          isCollapsed={false}
          onToggle={() => {
            userClosedGuidedRef.current = true;
            setActive(null);
          }}
          onCreateDataUploadAtom={onCreateDataUploadAtom}
        />
      )}

      {active === 'metrics' && (
        <MetricsPanel
          selectedAtomId={selectedAtomId}
          selectedCardId={selectedCardId}
          cardExhibited={cardExhibited}
          onClose={() => setActive(null)}
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


      {/* Icons Column - Always visible and stays on the right */}
      {/* Same icons in both modes - only add opacity effect on non-clickable icons when guided mode is ON */}
      <div className="bg-white border-l border-gray-200 transition-all duration-300 flex flex-col h-full w-12 flex-shrink-0">
        {/* Position 1: Trinity AI - visible but not clickable when guided mode is ON */}
        <div className={`p-3 border-b border-gray-200 flex items-center justify-center relative ${isGuidedModeEnabled ? 'opacity-40' : ''}`}>
          <button
            onClick={() => {
              if (!isGuidedModeEnabled) {
                openTrinityAI();
              }
            }}
            disabled={isGuidedModeEnabled}
            className={`w-9 h-9 rounded-lg transition-all group relative flex items-center justify-center ${
              isGuidedModeEnabled 
                ? 'cursor-not-allowed' 
                : 'hover:bg-muted hover:scale-105 hover:shadow-lg'
            } ${active === 'trinity' ? 'bg-muted text-foreground' : ''}`}
            title="Trinity AI - Click to expand/collapse"
            data-trinity-ai="true"
            type="button"
          >
            <TrinityAIIcon className="text-purple-500" />
            {!isGuidedModeEnabled && (
              <span className="absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
                Trinity AI
              </span>
            )}
          </button>
        </div>
        {/* Position 2: Settings - visible but not clickable when guided mode is ON */}
        <div className={`p-3 border-b border-gray-200 flex items-center justify-center ${isGuidedModeEnabled ? 'opacity-40' : ''}`}>
          <button
            onClick={() => {
              if (!isGuidedModeEnabled) {
                openSettings();
              }
            }}
            disabled={isGuidedModeEnabled}
            className={`w-9 h-9 rounded-lg transition-all group relative flex items-center justify-center ${
              isGuidedModeEnabled 
                ? 'cursor-not-allowed' 
                : 'hover:bg-muted hover:scale-105 hover:shadow-lg'
            } ${active === 'settings' ? 'bg-muted text-foreground' : ''}`}
            title="Settings"
            data-settings="true"
            type="button"
          >
            <Settings className="w-3.5 h-3.5" />
            {!isGuidedModeEnabled && (
              <span className="absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
                Settings
              </span>
            )}
          </button>
        </div>
        {/* Position 3: Metrics - Always visible and clickable */}
        <div className="p-3 border-b border-gray-200 flex items-center justify-center">
          <button
            onClick={openMetrics}
            className={`w-9 h-9 rounded-lg hover:bg-muted transition-all group relative hover:scale-105 hover:shadow-lg flex items-center justify-center ${
              active === 'metrics' ? 'bg-muted text-foreground' : ''
            }`}
            title="Metrics"
            data-metrics="true"
            type="button"
          >
            <span className="text-xs font-semibold">M</span>
            <span className="absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
              Metrics
            </span>
          </button>
        </div>
        {/* Position 4: Saved DataFrames - Always visible and clickable */}
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
            <Database className="w-4 h-4 pointer-events-none" />
            <span className="absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
              Saved DataFrames
            </span>
          </button>
        </div>
        {/* Position 4: Guided Workflow (Wrench) - Shown when global guided mode OR metric guided flow is ON */}
        {(isGuidedModeEnabled || isMetricGuidedFlowOpen) && (
          <div className="p-3 border-b border-gray-200 flex items-center justify-center relative z-10 pointer-events-auto">
            <button
              onClick={(e) => {
                e.stopPropagation();
                openGuidedWorkflow();
              }}
              className={`w-9 h-9 rounded-lg hover:bg-muted transition-all group relative hover:scale-105 hover:shadow-lg flex items-center justify-center z-10 pointer-events-auto ${
                active === 'guided' ? 'bg-muted text-foreground' : ''
              }`}
              title="Guided Workflow"
              data-guided-workflow="true"
              type="button"
            >
              <Wrench className="w-4 h-4 pointer-events-none" />
              <span className="absolute right-full mr-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50 pointer-events-none shadow-lg border border-border">
                Guided Workflow
              </span>
            </button>
          </div>
        )}
        {/* Help - Hidden (has hidden class) */}
        <div className="p-3 border-b border-gray-200 flex items-center justify-center hidden">
          <button
            onClick={openHelp}
            className={`w-9 h-9 rounded-lg hover:bg-muted transition-all group relative hover:scale-105 hover:shadow-lg flex items-center justify-center ${
              active === 'help' ? 'bg-muted text-foreground' : ''
            }`}
            title="Help"
            type="button"
          >
            <HelpCircle className="w-4 h-4 text-gray-600" strokeWidth={2} />
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