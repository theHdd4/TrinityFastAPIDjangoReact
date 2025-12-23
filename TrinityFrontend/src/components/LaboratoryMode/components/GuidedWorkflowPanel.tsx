import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { RotateCcw, X, Settings, ChevronRight, ChevronDown, Upload, LogOut, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VerticalProgressStepper } from '@/components/AtomList/atoms/data-upload/components/guided-upload/VerticalProgressStepper';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import type { UploadStage } from '@/components/AtomList/atoms/data-upload/components/guided-upload/useGuidedUploadFlow';

interface GuidedWorkflowPanelProps {
  isCollapsed: boolean;
  onToggle: () => void;
  onCreateDataUploadAtom?: () => Promise<void>;
}

export const GuidedWorkflowPanel: React.FC<GuidedWorkflowPanelProps> = ({
  isCollapsed,
  onToggle,
  onCreateDataUploadAtom,
}) => {
  // Get active guided flows from the laboratory store
  const activeGuidedFlows = useLaboratoryStore((state) => state.activeGuidedFlows || {});
  const getAtom = useLaboratoryStore((state) => state.getAtom);
  const updateGuidedFlowStage = useLaboratoryStore((state) => state.updateGuidedFlowStage);
  const globalGuidedModeEnabled = useLaboratoryStore((state) => state.globalGuidedModeEnabled);
  const setGlobalGuidedMode = useLaboratoryStore((state) => state.setGlobalGuidedMode);

  // Get the first active guided flow (or allow user to select if multiple)
  const activeFlowEntries = Object.entries(activeGuidedFlows);
  const [selectedAtomId, setSelectedAtomId] = useState<string | null>(
    activeFlowEntries.length > 0 ? activeFlowEntries[0][0] : null
  );

  // Auto-select the first available guided flow when flows change
  useEffect(() => {
    if (activeFlowEntries.length > 0 && !selectedAtomId) {
      setSelectedAtomId(activeFlowEntries[0][0]);
    } else if (activeFlowEntries.length === 0) {
      setSelectedAtomId(null);
    } else if (selectedAtomId && !activeGuidedFlows[selectedAtomId]) {
      // Selected atom no longer has a guided flow, select the first available
      setSelectedAtomId(activeFlowEntries.length > 0 ? activeFlowEntries[0][0] : null);
    }
  }, [activeGuidedFlows, selectedAtomId, activeFlowEntries]);

  const selectedFlow = selectedAtomId ? activeGuidedFlows[selectedAtomId] : null;
  const selectedAtom = selectedAtomId ? getAtom(selectedAtomId) : null;

  // State to track if progress stepper is collapsed
  const [isProgressCollapsed, setIsProgressCollapsed] = useState(false);

  // Handle clicking on a step to navigate
  const handleStageClick = (stage: UploadStage) => {
    if (selectedAtomId && updateGuidedFlowStage) {
      updateGuidedFlowStage(selectedAtomId, stage);
    }
  };

  // Toggle progress stepper visibility
  const toggleProgressStepper = () => {
    setIsProgressCollapsed(prev => !prev);
  };

  // Handle reset - go back to step 1 (U2 - Confirm Headers)
  const handleReset = () => {
    if (selectedAtomId && updateGuidedFlowStage) {
      // Reset to U2 (Confirm Headers) - first step in the guided flow (U1 removed)
      updateGuidedFlowStage(selectedAtomId, 'U2');
    }
  };

  // Handle exit workflow mode - disable guided mode and close panel
  const handleExitWorkflowMode = () => {
    setGlobalGuidedMode(false);
    onToggle(); // Close the panel
  };

  if (isCollapsed) {
    return null;
  }

  return (
    <div className="w-80 bg-white border-l border-gray-200 shadow-lg flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-500/10 rounded-full flex items-center justify-center">
            <Settings className="w-4 h-4 text-blue-600" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900">Guided Workflow</h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="h-8 w-8 hover:bg-white/50"
          title="Close guided workflow panel"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Priming Info - Made bigger and bolder */}
      {selectedFlow && (
        <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-blue-50/30">
          <div className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Priming</div>
          <button
            onClick={toggleProgressStepper}
            className="w-full text-left flex items-center justify-between group hover:opacity-80 transition-opacity"
          >
            <div className="text-lg font-bold text-gray-900 flex items-center gap-2">
              {(() => {
                // Get file name from guided flow state
                const state = selectedFlow.state;
                const fileName = 
                  state?.initialFile?.name ||
                  (state?.uploadedFiles && state.uploadedFiles.length > 0 
                    ? (state.selectedFileIndex !== undefined && state.uploadedFiles[state.selectedFileIndex]
                      ? state.uploadedFiles[state.selectedFileIndex].name
                      : state.uploadedFiles[0].name)
                    : null);
                return fileName || 'No file selected';
              })()}
            </div>
            {isProgressCollapsed ? (
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
            )}
          </button>
        </div>
      )}

      {/* Atom Selector (if multiple flows) */}
      {activeFlowEntries.length > 1 && (
        <div className="p-3 border-b border-gray-200 bg-gray-50">
          <div className="text-xs font-medium text-gray-700 mb-2">Active Flows:</div>
          <div className="space-y-1">
            {activeFlowEntries.map(([atomId, flow]) => {
              const atom = getAtom(atomId);
              return (
                <button
                  key={atomId}
                  onClick={() => setSelectedAtomId(atomId)}
                  className={cn(
                    "w-full text-left px-2 py-1.5 rounded text-xs transition-colors",
                    selectedAtomId === atomId
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'bg-white text-gray-600 hover:bg-gray-100'
                  )}
                >
                  {atom?.title || `Atom ${atomId.slice(0, 8)}`}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Steps List - Using real guided flow data */}
      {!isProgressCollapsed && (
        <div className="flex-1 overflow-y-auto p-4">
          {selectedFlow ? (
            <VerticalProgressStepper
              currentStage={selectedFlow.currentStage}
              onStageClick={handleStageClick}
              className="w-full"
            />
          ) : (
            <div className="text-center text-gray-500 py-8">
              <div className="mb-4 flex flex-col items-center gap-2">
                <Upload className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <span>Click on</span>
                  <span className="inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-2 py-1 shadow-sm">
                    <SlidersHorizontal className="w-4 h-4 text-gray-700" />
                  </span>
                  <span>icon to open the guided mode</span>
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Reset Button */}
      {selectedFlow && (
        <div className="p-4 border-t border-gray-200 bg-gray-50/50 space-y-2">
          <Button
            onClick={handleReset}
            variant="outline"
            className="w-full border-gray-300 hover:bg-gray-100"
            size="sm"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Reset
          </Button>
          <Button
            onClick={handleExitWorkflowMode}
            variant="outline"
            className="w-full border-gray-300 hover:bg-red-50 hover:border-red-300 hover:text-red-600"
            size="sm"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Exit
          </Button>
        </div>
      )}

      {/* Exit Workflow Mode Button - shown even when no flow is selected */}
      {!selectedFlow && (
        <div className="p-4 border-t border-gray-200 bg-gray-50/50">
          <Button
            onClick={handleExitWorkflowMode}
            variant="outline"
            className="w-full border-gray-300 hover:bg-red-50 hover:border-red-300 hover:text-red-600"
            size="sm"
          >
            <LogOut className="w-4 h-4 mr-2" />
            Exit
          </Button>
        </div>
      )}

    </div>
  );
};