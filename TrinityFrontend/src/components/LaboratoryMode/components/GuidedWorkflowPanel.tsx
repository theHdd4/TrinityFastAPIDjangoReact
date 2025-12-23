import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { RotateCcw, X, Settings, ChevronRight, ChevronDown, Upload, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VerticalProgressStepper as DataUploadVerticalProgressStepper } from '@/components/AtomList/atoms/data-upload/components/guided-upload/VerticalProgressStepper';
import { VerticalProgressStepper as MetricVerticalProgressStepper } from '@/components/LaboratoryMode/components/SettingsPanel/metricstabs/metricguildeflow/VerticalProgressStepper';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import type { UploadStage } from '@/components/AtomList/atoms/data-upload/components/guided-upload/useGuidedUploadFlow';
import type { MetricStage } from '@/components/LaboratoryMode/components/SettingsPanel/metricstabs/metricguildeflow/useMetricGuidedFlow';

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
  const activeMetricGuidedFlow = useLaboratoryStore((state) => state.activeMetricGuidedFlow);
  const isMetricGuidedFlowOpen = useLaboratoryStore((state) => state.isMetricGuidedFlowOpen);
  const getAtom = useLaboratoryStore((state) => state.getAtom);
  const updateGuidedFlowStage = useLaboratoryStore((state) => state.updateGuidedFlowStage);
  const setActiveMetricGuidedFlow = useLaboratoryStore((state) => state.setActiveMetricGuidedFlow);
  const globalGuidedModeEnabled = useLaboratoryStore((state) => state.globalGuidedModeEnabled);

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

  // State to track if progress steppers are collapsed
  const [isDataUploadProgressCollapsed, setIsDataUploadProgressCollapsed] = useState(false);
  const [isMetricProgressCollapsed, setIsMetricProgressCollapsed] = useState(true); // Collapsed by default

  // Handle clicking on a step to navigate (data upload)
  const handleDataUploadStageClick = (stage: UploadStage) => {
    if (selectedAtomId && updateGuidedFlowStage) {
      updateGuidedFlowStage(selectedAtomId, stage);
    }
  };

  // Handle clicking on a step to navigate (metric)
  const handleMetricStageClick = (stage: MetricStage) => {
    if (activeMetricGuidedFlow) {
      setActiveMetricGuidedFlow(stage, activeMetricGuidedFlow.state);
    }
  };

  // Toggle data upload progress stepper visibility
  const toggleDataUploadProgressStepper = () => {
    setIsDataUploadProgressCollapsed(prev => !prev);
  };

  // Toggle metric progress stepper visibility
  const toggleMetricProgressStepper = () => {
    setIsMetricProgressCollapsed(prev => !prev);
  };

  // Handle reset for data upload - go back to step 1
  const handleDataUploadReset = () => {
    if (selectedAtomId && updateGuidedFlowStage) {
      // Reset to U2 (Confirm Headers) - first step in the guided flow (U1 removed)
      updateGuidedFlowStage(selectedAtomId, 'U2');
    }
  };

  // Handle reset for metric - go back to step 1
  const handleMetricReset = () => {
    if (activeMetricGuidedFlow) {
      // Reset to type stage
      setActiveMetricGuidedFlow('type', {
        selectedType: null,
        dataSource: '',
        createdVariables: [],
        createdColumns: [],
        createdTables: [],
      });
    }
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

      {/* Priming Info - Made bigger and bolder (Data Upload) */}
      {selectedFlow && (
        <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-blue-50/30">
          <div className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Priming</div>
          <button
            onClick={toggleDataUploadProgressStepper}
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
            {isDataUploadProgressCollapsed ? (
              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
            )}
          </button>
        </div>
      )}

      {/* Atom Selector (if multiple data upload flows) */}
      {activeFlowEntries.length > 1 && (
        <div className="p-3 border-b border-gray-200 bg-gray-50">
          <div className="text-xs font-medium text-gray-700 mb-2">Active Data Upload Flows:</div>
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

      {/* Steps List - Data Upload Flow */}
      <div className="flex-1 overflow-y-auto">
        {!isDataUploadProgressCollapsed && (
          <div className="p-4">
            {selectedFlow ? (
              <DataUploadVerticalProgressStepper
                currentStage={selectedFlow.currentStage}
                onStageClick={handleDataUploadStageClick}
                className="w-full"
              />
            ) : (
              <div className="text-center text-gray-500 py-8">
                <div className="mb-4">
                  <Upload className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm">No files uploaded yet</p>
                  <p className="text-xs text-gray-400 mt-1">Use the guided upload flow to get started</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Reset Button for Data Upload */}
        {selectedFlow && !isDataUploadProgressCollapsed && (
          <div className="px-4 pb-4">
            <Button
              onClick={handleDataUploadReset}
              variant="outline"
              className="w-full border-gray-300 hover:bg-gray-100"
              size="sm"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset Data Upload
            </Button>
          </div>
        )}

        {/* Metric Flow Section - Collapsible */}
        {isMetricGuidedFlowOpen && activeMetricGuidedFlow && (
          <>
            <div className="border-t border-gray-200">
              <div className="p-4">
                <div className="text-xs text-gray-500 mb-1 uppercase tracking-wide">Metric Creation</div>
                <button
                  onClick={toggleMetricProgressStepper}
                  className="w-full text-left flex items-center justify-between group hover:opacity-80 transition-opacity"
                >
                  <div className="text-lg font-bold text-gray-900">
                    {(() => {
                      const dataSource = activeMetricGuidedFlow.state?.dataSource || '';
                      if (!dataSource) return 'No data source selected';
                      // Extract just the filename from the MinIO path
                      const filename = dataSource.split('/').pop() || dataSource;
                      return filename;
                    })()}
                  </div>
                  {isMetricProgressCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
                  )}
                </button>
              </div>
            </div>

            {!isMetricProgressCollapsed && (
              <>
                <div className="p-4">
                  <MetricVerticalProgressStepper
                    currentStage={activeMetricGuidedFlow.currentStage}
                    onStageClick={handleMetricStageClick}
                    className="w-full"
                  />
                </div>
                <div className="px-4 pb-4">
                  <Button
                    onClick={handleMetricReset}
                    variant="outline"
                    className="w-full border-gray-300 hover:bg-gray-100"
                    size="sm"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Reset Metric Flow
                  </Button>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-gray-200 bg-gray-100/50">
        <p className="text-xs text-gray-500 italic text-center">
          Click steps to navigate • All decisions remain under your control
        </p>
      </div>
    </div>
  );
};