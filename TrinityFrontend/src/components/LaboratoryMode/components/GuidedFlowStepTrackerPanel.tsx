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

  if (!isOpen || Object.keys(activeGuidedFlows).length === 0) {
    return null;
  }

  const activeFlowEntries = Object.entries(activeGuidedFlows);
  const [selectedAtomId, setSelectedAtomId] = React.useState<string | null>(
    activeFlowEntries.length > 0 ? activeFlowEntries[0][0] : null
  );

  const selectedFlow = selectedAtomId ? activeGuidedFlows[selectedAtomId] : null;
  const selectedAtom = selectedAtomId ? getAtom(selectedAtomId) : null;

  return (
    <div className="h-full w-80 bg-white border-l border-gray-200 shadow-lg flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-blue-600" />
          <h3 className="text-sm font-semibold text-gray-900">Guided Workflow</h3>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="h-6 w-6"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

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
                  className={`w-full text-left px-2 py-1.5 rounded text-xs transition-colors ${
                    selectedAtomId === atomId
                      ? 'bg-blue-100 text-blue-700 font-medium'
                      : 'bg-white text-gray-600 hover:bg-gray-100'
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
              <div className="mb-4 pb-3 border-b border-gray-200">
                <div className="text-xs text-gray-500 mb-1">Current Atom</div>
                <div className="text-sm font-medium text-gray-900">{selectedAtom.title}</div>
              </div>
            )}
            <VerticalProgressStepper
              currentStage={selectedFlow.currentStage}
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
      <div className="p-3 border-t border-gray-200 bg-gray-50">
        <p className="text-xs text-gray-500 italic">
          This guide is purely advisory. All decisions remain under your control.
        </p>
      </div>
    </div>
  );
};

