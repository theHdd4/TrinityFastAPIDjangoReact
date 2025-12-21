import React from 'react';
import { X, Sparkles } from 'lucide-react';
import { VerticalProgressStepper } from '@/components/AtomList/atoms/data-upload/components/guided-upload/VerticalProgressStepper';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import type { UploadStage } from '@/components/AtomList/atoms/data-upload/components/guided-upload/useGuidedUploadFlow';
import { Button } from '@/components/ui/button';

interface GuidedFlowStepTrackerPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GuidedFlowStepTrackerPanel: React.FC<GuidedFlowStepTrackerPanelProps> = ({
  isOpen,
  onClose,
}) => {
  const activeGuidedFlows = useLaboratoryStore((state) => state.activeGuidedFlows || {});
  const getAtom = useLaboratoryStore((state) => state.getAtom);
  const updateGuidedFlowStage = useLaboratoryStore((state) => state.updateGuidedFlowStage);

  if (!isOpen || Object.keys(activeGuidedFlows).length === 0) {
    return null;
  }

  const activeFlowEntries = Object.entries(activeGuidedFlows);
  const [selectedAtomId, setSelectedAtomId] = React.useState<string | null>(
    activeFlowEntries.length > 0 ? activeFlowEntries[0][0] : null
  );

  const selectedFlow = selectedAtomId ? activeGuidedFlows[selectedAtomId] : null;
  const selectedAtom = selectedAtomId ? getAtom(selectedAtomId) : null;

  // Handle clicking on a step to navigate
  const handleStageClick = (stage: UploadStage) => {
    if (selectedAtomId && updateGuidedFlowStage) {
      updateGuidedFlowStage(selectedAtomId, stage);
    }
  };

  return (
    <div className="fixed top-0 right-0 h-full w-80 z-50">
      {/* Glassomorphic panel */}
      <div className="h-full bg-white/90 backdrop-blur-md border-l border-white/20 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/20 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-blue-600" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900">Guided Workflow</h3>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 hover:bg-white/50"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Atom Selector (if multiple flows) */}
        {activeFlowEntries.length > 1 && (
          <div className="p-3 border-b border-white/20 bg-white/50">
            <div className="text-xs font-medium text-gray-700 mb-2">Active Flows:</div>
            <div className="space-y-1">
              {activeFlowEntries.map(([atomId, flow]) => {
                const atom = getAtom(atomId);
                return (
                  <button
                    key={atomId}
                    onClick={() => setSelectedAtomId(atomId)}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                      selectedAtomId === atomId
                        ? 'bg-blue-100/80 text-blue-700 font-medium backdrop-blur-sm'
                        : 'bg-white/50 text-gray-600 hover:bg-white/70'
                    }`}
                  >
                    {atom?.title || `Atom ${atomId.slice(0, 8)}`}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Step Tracker */}
        <div className="flex-1 overflow-y-auto p-4">
          {selectedFlow ? (
            <div>
              {selectedAtom && (
                <div className="mb-4 pb-3 border-b border-white/20">
                  <div className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Current Atom</div>
                  <div className="text-lg font-bold text-gray-900">{selectedAtom.title}</div>
                </div>
              )}
              <VerticalProgressStepper
                currentStage={selectedFlow.currentStage}
                onStageClick={handleStageClick}
                className="w-full"
              />
            </div>
          ) : (
            <div className="text-center text-sm text-gray-500 py-8">
              No active guided flow
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-white/20 bg-gray-50/50">
          <p className="text-xs text-gray-500 italic text-center">
            Click steps to navigate • All decisions remain under your control
          </p>
        </div>
      </div>
    </div>
  );
};
