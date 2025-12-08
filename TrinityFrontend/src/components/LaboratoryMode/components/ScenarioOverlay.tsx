import React from 'react';
import { Button } from '@/components/ui/button';
import { Upload, Database, Play, FileText, BarChart3, Table, Sparkles, Plus, GitMerge, Layers, ArrowRight, X } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { LaboratoryScenario, ScenarioData } from '../hooks/useLaboratoryScenario';
import { GuidedUploadFlow } from '@/components/AtomList/atoms/data-upload-validate/components/guided-upload';
import type { GuidedUploadFlowState } from '@/components/AtomList/atoms/data-upload-validate/components/guided-upload/useGuidedUploadFlow';
import { useGuidedFlowPersistence } from '../hooks/useGuidedFlowPersistence';

interface ScenarioOverlayProps {
  scenario: LaboratoryScenario;
  scenarioData: ScenarioData;
  onDismiss: () => void;
  onStartUpload: () => void;
  onStartPriming: (filePath: string) => void;
  onResumeFlow: () => void;
  onRestartFlow: () => void;
  onIgnoreAndContinue: () => void;
  onActionSelected: (action: string) => void;
}

export const ScenarioOverlay: React.FC<ScenarioOverlayProps> = ({
  scenario,
  scenarioData,
  onDismiss,
  onStartUpload,
  onStartPriming,
  onResumeFlow,
  onRestartFlow,
  onIgnoreAndContinue,
  onActionSelected,
}) => {
  const [showGuidedFlow, setShowGuidedFlow] = React.useState(false);
  const [guidedFlowFile, setGuidedFlowFile] = React.useState<{ name: string; path: string } | null>(null);
  const [guidedFlowStage, setGuidedFlowStage] = React.useState<'U0' | 'U1'>('U0');
  const [savedFlowState, setSavedFlowState] = React.useState<Partial<GuidedUploadFlowState> | undefined>(undefined);
  const [showWarningDialog, setShowWarningDialog] = React.useState(false);
  const [showSampleDialog, setShowSampleDialog] = React.useState(false);
  const { loadState } = useGuidedFlowPersistence();

  if (scenario === 'loading') {
    return (
      <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#458EE2] mx-auto mb-4"></div>
          <p className="text-gray-600">Checking your project status...</p>
        </div>
      </div>
    );
  }

  // Scenario A: Brand New Project
  if (scenario === 'A') {
    return (
      <>
        <div className="absolute inset-0 bg-white/95 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="max-w-2xl w-full mx-4 bg-white rounded-lg shadow-xl border border-gray-200 p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-[#458EE2] bg-opacity-10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Database className="w-8 h-8 text-[#458EE2]" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                Welcome to your new project
              </h2>
              <p className="text-gray-600">
                To begin your analysis, let's upload your data. Once uploaded, it will need to be primed. 
                Data Priming is an important step to ensure interpretability.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={() => {
                  setSavedFlowState(undefined); // Clear any saved state for new upload
                  setGuidedFlowStage('U0');
                  setGuidedFlowFile(null);
                  setShowGuidedFlow(true);
                }}
                className="bg-[#458EE2] hover:bg-[#3a7bc7] text-white"
                size="lg"
              >
                <Upload className="w-5 h-5 mr-2" />
                Upload Data (Excel/CSV)
              </Button>
              <Button
                onClick={() => {
                  setShowSampleDialog(true);
                }}
                variant="outline"
                size="lg"
              >
                <Database className="w-5 h-5 mr-2" />
                Use Sample Dataset
              </Button>
            </div>
          </div>
        </div>

        {showGuidedFlow && (
          <GuidedUploadFlow
            open={showGuidedFlow}
            onOpenChange={(open) => {
              setShowGuidedFlow(open);
              if (!open) {
                setSavedFlowState(undefined);
                onDismiss();
              }
            }}
            initialStage={guidedFlowStage}
            savedState={savedFlowState}
            onComplete={(result) => {
              setShowGuidedFlow(false);
              setSavedFlowState(undefined);
              onDismiss();
              onActionSelected('upload-complete');
            }}
          />
        )}

        {/* Warning Dialog for Scenario B */}
        <AlertDialog open={showWarningDialog} onOpenChange={setShowWarningDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Non-Primed Files Warning</AlertDialogTitle>
              <AlertDialogDescription>
                Non-primed files will not be available for analysis. Are you sure you want to continue?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  onIgnoreAndContinue();
                  onDismiss();
                  setShowWarningDialog(false);
                }}
              >
                Continue Anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Sample Dataset Dialog for Scenario A */}
        <AlertDialog open={showSampleDialog} onOpenChange={setShowSampleDialog}>
          <AlertDialogContent className="max-w-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle>Select Sample Dataset</AlertDialogTitle>
              <AlertDialogDescription>
                Choose a pre-loaded sample dataset to explore Trinity's features before uploading your own data.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
              <div className="grid grid-cols-1 gap-3">
                {/* Sample datasets list - can be extended with actual API call */}
                {[
                  { id: 'sales', name: 'Sales Data', description: 'Sample sales transaction data with dates, products, and revenue' },
                  { id: 'customer', name: 'Customer Data', description: 'Customer demographics and behavior data' },
                  { id: 'inventory', name: 'Inventory Data', description: 'Product inventory levels and stock movements' },
                ].map((dataset) => (
                  <button
                    key={dataset.id}
                    onClick={() => {
                      // TODO: Implement actual sample dataset loading
                      // For now, just close the dialog
                      setShowSampleDialog(false);
                      onActionSelected(`sample-dataset-${dataset.id}`);
                    }}
                    className="text-left p-4 border rounded-lg hover:bg-gray-50 hover:border-[#458EE2] transition-colors"
                  >
                    <div className="font-medium text-gray-900">{dataset.name}</div>
                    <div className="text-sm text-gray-500 mt-1">{dataset.description}</div>
                  </button>
                ))}
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // Scenario B: Dataset Exists but Not Primed
  if (scenario === 'B') {
    const firstUnprimedFile = scenarioData.unprimedFiles[0] || scenarioData.inProgressFiles[0];
    
    return (
      <>
        <div className="absolute inset-0 bg-white/95 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="max-w-3xl w-full mx-4 bg-white rounded-lg shadow-xl border border-gray-200 p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileText className="w-8 h-8 text-amber-600" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                Files Need Priming
              </h2>
              <p className="text-gray-600 mb-4">
                The following files exist in the project but have not been primed. 
                Data Priming is an important step to ensure interpretability. 
                Would you like to upload more data or start priming existing files?
              </p>
              
              {scenarioData.unprimedFiles.length > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left max-h-48 overflow-y-auto">
                  <p className="text-sm font-medium text-gray-700 mb-2">Unprimed Files:</p>
                  <ul className="text-sm text-gray-600 space-y-1">
                    {scenarioData.unprimedFiles.slice(0, 5).map((file) => (
                      <li key={file.object_name} className="truncate">• {file.file_name}</li>
                    ))}
                    {scenarioData.unprimedFiles.length > 5 && (
                      <li className="text-gray-500">...and {scenarioData.unprimedFiles.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={() => {
                    setGuidedFlowStage('U0');
                    setGuidedFlowFile(null);
                    setShowGuidedFlow(true);
                  }}
                  className="bg-[#458EE2] hover:bg-[#3a7bc7] text-white flex-1"
                  size="lg"
                >
                  <Upload className="w-5 h-5 mr-2" />
                  Upload Additional Dataset
                </Button>
                {firstUnprimedFile && (
                  <Button
                    onClick={() => {
                      setGuidedFlowStage('U1');
                      setGuidedFlowFile({
                        name: firstUnprimedFile.file_name,
                        path: firstUnprimedFile.object_name,
                      });
                      setShowGuidedFlow(true);
                    }}
                    variant="default"
                    size="lg"
                    className="flex-1"
                  >
                    <Play className="w-5 h-5 mr-2" />
                    Start Data Priming
                  </Button>
                )}
              </div>
              <Button
                onClick={() => {
                  setShowWarningDialog(true);
                }}
                variant="outline"
                size="lg"
                className="w-full"
              >
                Ignore and Continue
              </Button>
            </div>
          </div>
        </div>

        {showGuidedFlow && (
          <GuidedUploadFlow
            open={showGuidedFlow}
            onOpenChange={(open) => {
              setShowGuidedFlow(open);
              if (!open) {
                onDismiss();
              }
            }}
            existingDataframe={guidedFlowFile ? {
              name: guidedFlowFile.name,
              path: guidedFlowFile.path,
            } : undefined}
            initialStage={guidedFlowStage}
            onComplete={(result) => {
              setShowGuidedFlow(false);
              onDismiss();
              onActionSelected('priming-complete');
            }}
          />
        )}
      </>
    );
  }

  // Scenario C: Upload/Priming Started Previously
  if (scenario === 'C') {
    const savedStage = scenarioData.savedFlowState?.currentStage || 'U1';
    
    return (
      <>
        <div className="absolute inset-0 bg-white/95 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="max-w-2xl w-full mx-4 bg-white rounded-lg shadow-xl border border-gray-200 p-8">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Play className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-2xl font-semibold text-gray-900 mb-2">
                Continue Where You Left Off
              </h2>
              <p className="text-gray-600">
                You began priming your data earlier. Would you like to continue where you left off?
              </p>
              {savedStage && (
                <p className="text-sm text-gray-500 mt-2">
                  Last stage: {savedStage}
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                onClick={async () => {
                  // Load saved state before opening flow
                  const loadedState = await loadState();
                  if (loadedState) {
                    setSavedFlowState(loadedState);
                    setGuidedFlowStage(loadedState.currentStage || 'U1');
                    setShowGuidedFlow(true);
                  } else {
                    // Fallback: use scenarioData saved state if available
                    if (scenarioData.savedFlowState) {
                      setSavedFlowState(scenarioData.savedFlowState);
                      setGuidedFlowStage(scenarioData.savedFlowState.currentStage || 'U1');
                    }
                    setShowGuidedFlow(true);
                  }
                }}
                className="bg-[#458EE2] hover:bg-[#3a7bc7] text-white"
                size="lg"
              >
                <Play className="w-5 h-5 mr-2" />
                Resume Priming Steps
              </Button>
              <Button
                onClick={() => {
                  onRestartFlow();
                  setSavedFlowState(undefined); // Clear saved state when restarting
                  setGuidedFlowStage('U0');
                  setGuidedFlowFile(null);
                  setShowGuidedFlow(true);
                }}
                variant="outline"
                size="lg"
              >
                Restart Upload Process
              </Button>
              <Button
                onClick={() => {
                  setSavedFlowState(undefined); // Clear saved state when uploading new dataset
                  setGuidedFlowStage('U0');
                  setGuidedFlowFile(null);
                  setShowGuidedFlow(true);
                }}
                variant="outline"
                size="lg"
              >
                <Upload className="w-5 h-5 mr-2" />
                Upload New Dataset
              </Button>
            </div>
          </div>
        </div>

        {showGuidedFlow && (
          <GuidedUploadFlow
            open={showGuidedFlow}
            onOpenChange={(open) => {
              setShowGuidedFlow(open);
              if (!open) {
                setSavedFlowState(undefined);
                onDismiss();
              }
            }}
            existingDataframe={guidedFlowFile ? {
              name: guidedFlowFile.name,
              path: guidedFlowFile.path,
            } : undefined}
            initialStage={guidedFlowStage}
            savedState={savedFlowState}
            onComplete={(result) => {
              setShowGuidedFlow(false);
              setSavedFlowState(undefined);
              onDismiss();
              onActionSelected('flow-complete');
            }}
          />
        )}
      </>
    );
  }

  // Scenario D: Dataset Fully Primed
  if (scenario === 'D') {
    return (
      <div className="absolute inset-0 bg-white/95 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="max-w-3xl w-full mx-4 bg-white rounded-lg shadow-xl border border-gray-200 p-8 max-h-[90vh] overflow-y-auto">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Database className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">
              Your Data is Ready
            </h2>
            <p className="text-gray-600">
              What would you like to do next?
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            <Button
              onClick={() => {
                setGuidedFlowStage('U0');
                setGuidedFlowFile(null);
                setShowGuidedFlow(true);
              }}
              variant="outline"
              className="justify-start h-auto py-3"
            >
              <Upload className="w-5 h-5 mr-3" />
              <div className="text-left">
                <div className="font-medium">Add Another Dataset</div>
                <div className="text-xs text-gray-500">Upload and prime new data</div>
              </div>
            </Button>

            <Button
              onClick={() => onActionSelected('validate-dataset')}
              variant="outline"
              className="justify-start h-auto py-3"
            >
              <FileText className="w-5 h-5 mr-3" />
              <div className="text-left">
                <div className="font-medium">Validate Dataset</div>
                <div className="text-xs text-gray-500">Run validation checks</div>
              </div>
            </Button>

            <Button
              onClick={() => onActionSelected('view-overview')}
              variant="outline"
              className="justify-start h-auto py-3"
            >
              <BarChart3 className="w-5 h-5 mr-3" />
              <div className="text-left">
                <div className="font-medium">View Overview</div>
                <div className="text-xs text-gray-500">Explore data features</div>
              </div>
            </Button>

            <Button
              onClick={() => onActionSelected('create-metrics')}
              variant="outline"
              className="justify-start h-auto py-3"
            >
              <Plus className="w-5 h-5 mr-3" />
              <div className="text-left">
                <div className="font-medium">Create Metrics</div>
                <div className="text-xs text-gray-500">Add new columns</div>
              </div>
            </Button>

            <Button
              onClick={() => onActionSelected('merge-files')}
              variant="outline"
              className="justify-start h-auto py-3"
            >
              <GitMerge className="w-5 h-5 mr-3" />
              <div className="text-left">
                <div className="font-medium">Merge Files</div>
                <div className="text-xs text-gray-500">Combine on common columns</div>
              </div>
            </Button>

            <Button
              onClick={() => onActionSelected('groupby')}
              variant="outline"
              className="justify-start h-auto py-3"
            >
              <Layers className="w-5 h-5 mr-3" />
              <div className="text-left">
                <div className="font-medium">Aggregate Data</div>
                <div className="text-xs text-gray-500">Group by higher level</div>
              </div>
            </Button>

            <Button
              onClick={() => onActionSelected('stack-files')}
              variant="outline"
              className="justify-start h-auto py-3"
            >
              <Layers className="w-5 h-5 mr-3" />
              <div className="text-left">
                <div className="font-medium">Stack Files</div>
                <div className="text-xs text-gray-500">Concatenate with common columns</div>
              </div>
            </Button>

            <Button
              onClick={() => onActionSelected('visualize-charts')}
              variant="outline"
              className="justify-start h-auto py-3"
            >
              <BarChart3 className="w-5 h-5 mr-3" />
              <div className="text-left">
                <div className="font-medium">Visualize Charts</div>
                <div className="text-xs text-gray-500">Create data visualizations</div>
              </div>
            </Button>

            <Button
              onClick={() => onActionSelected('visualize-table')}
              variant="outline"
              className="justify-start h-auto py-3"
            >
              <Table className="w-5 h-5 mr-3" />
              <div className="text-left">
                <div className="font-medium">Visualize Table</div>
                <div className="text-xs text-gray-500">View data in table format</div>
              </div>
            </Button>

            <Button
              onClick={() => onActionSelected('trinity-ai-suggest')}
              variant="outline"
              className="justify-start h-auto py-3"
            >
              <Sparkles className="w-5 h-5 mr-3" />
              <div className="text-left">
                <div className="font-medium">Ask Trinity AI</div>
                <div className="text-xs text-gray-500">Get next step suggestions</div>
              </div>
            </Button>
          </div>

          <div className="flex justify-center gap-3 pt-4 border-t">
            <Button
              onClick={onDismiss}
              variant="outline"
            >
              Continue Working
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

