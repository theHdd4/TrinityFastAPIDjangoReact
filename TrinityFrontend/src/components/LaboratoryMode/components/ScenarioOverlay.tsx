import React from 'react';
import { Button } from '@/components/ui/button';
import { Upload, Play, Sparkles, X, CheckCircle2, Circle, Settings, Eye, Database, FileCheck } from 'lucide-react';
import type { LaboratoryScenario, ScenarioData } from '../hooks/useLaboratoryScenario';

import { cn } from '@/lib/utils';


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
  onCreateDataUploadAtom?: () => Promise<void>;
  currentGuidedStep?: string;
}

// Guided workflow steps configuration
const GUIDED_STEPS = [
  { 
    id: 'U0', 
    label: 'Upload Dataset', 
    shortLabel: 'Upload',
    icon: Upload,
    status: 'SETUP',
    description: 'Select and upload your data file'
  },
  { 
    id: 'U1', 
    label: 'Structural Scan', 
    shortLabel: 'Scan',
    icon: Eye,
    status: 'CONFIGURATION',
    description: 'Analyze file structure and format'
  },
  { 
    id: 'U2', 
    label: 'Confirm Headers', 
    shortLabel: 'Headers',
    icon: FileCheck,
    status: 'CONFIGURATION',
    description: 'Verify column headers'
  },
  { 
    id: 'U3', 
    label: 'Column Names', 
    shortLabel: 'Columns',
    icon: Database,
    status: 'CONFIGURATION',
    description: 'Configure column names'
  },
  { 
    id: 'U4', 
    label: 'Data Types', 
    shortLabel: 'Types',
    icon: Settings,
    status: 'CONFIGURATION',
    description: 'Set appropriate data types'
  },
  { 
    id: 'U5', 
    label: 'Validation', 
    shortLabel: 'Validate',
    icon: CheckCircle2,
    status: 'VALIDATION',
    description: 'Final validation and preview'
  },
];

const STATUS_COLORS = {
  SETUP: 'bg-blue-500/20 text-blue-700 border-blue-300',
  CONFIGURATION: 'bg-green-500/20 text-green-700 border-green-300',
  VALIDATION: 'bg-orange-500/20 text-orange-700 border-orange-300',
};

export const ScenarioOverlay: React.FC<ScenarioOverlayProps> = ({
  scenario,
  scenarioData,
  onDismiss,
  onActionSelected,
  onCreateDataUploadAtom,
  currentGuidedStep = 'U0',
}) => {

  const [currentStep, setCurrentStep] = React.useState(currentGuidedStep);
  const [isMinimized, setIsMinimized] = React.useState(false);

  // Update current step when prop changes
  React.useEffect(() => {
    setCurrentStep(currentGuidedStep);
  }, [currentGuidedStep]);


  if (scenario === 'loading') {
    return (
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#458EE2] mx-auto mb-4"></div>
          <p className="text-white">Checking your project status...</p>
        </div>
      </div>
    );
  }

  const hasDatasets = scenarioData.files.length > 0;
  const hasPrimedDatasets = scenarioData.primedFiles.length > 0;

  const handleStepClick = (stepId: string) => {
    setCurrentStep(stepId);
    console.log(`Navigating to step: ${stepId}`);
    
    // Handle step navigation logic
    switch (stepId) {
      case 'U0':
        // Navigate to upload step
        onActionSelected('navigate-to-upload');
        break;
      case 'U1':
        // Navigate to structural scan
        onActionSelected('navigate-to-scan');
        break;
      case 'U2':
        // Navigate to headers confirmation
        onActionSelected('navigate-to-headers');
        break;
      case 'U3':
        // Navigate to column names
        onActionSelected('navigate-to-columns');
        break;
      case 'U4':
        // Navigate to data types
        onActionSelected('navigate-to-types');
        break;
      case 'U5':
        // Navigate to validation
        onActionSelected('navigate-to-validation');
        break;
      default:
        console.log(`Unknown step: ${stepId}`);
    }
  };

  return (
    <>
      {/* Glassomorphic blur overlay for left side */}
      <div className="guided-panel-overlay absolute inset-0 z-40" />
      
      {/* Fixed right-side guided workflow panel */}
      <div className={cn(
        "fixed top-0 right-0 h-full z-50 transition-all duration-300 ease-in-out",
        isMinimized ? "w-12" : "w-80"
      )}>
        {/* Glassomorphic panel */}
        <div className="guided-panel-glass h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/20 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-[#458EE2]/20 rounded-full flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-[#458EE2]" />
              </div>
              {!isMinimized && <h3 className="text-sm font-semibold text-gray-900">Guided Workflow</h3>}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMinimized(!isMinimized)}
                className="h-8 w-8 hover:bg-white/50"
                title={isMinimized ? "Expand panel" : "Minimize panel"}
              >
                <div className={cn(
                  "w-4 h-4 transition-transform duration-200",
                  isMinimized ? "rotate-180" : ""
                )}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </div>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={onDismiss}
                className="h-8 w-8 hover:bg-white/50"
                title="Close guided mode"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Current Atom Info */}
          {!isMinimized && (
            <div className="p-4 border-b border-white/20 bg-white/50">
              <div className="text-xs text-gray-500 mb-1">Current Atom</div>
              <div className="text-sm font-medium text-gray-900">Data Upload</div>
            </div>
          )}

          {/* Steps List */}
          <div className={cn(
            "guided-panel-scroll flex-1 overflow-y-auto space-y-3",
            isMinimized ? "p-2" : "p-4"
          )}>
            {GUIDED_STEPS.map((step, index) => {
              const isCompleted = index < GUIDED_STEPS.findIndex(s => s.id === currentStep);
              const isCurrent = step.id === currentStep;
              const isUpcoming = index > GUIDED_STEPS.findIndex(s => s.id === currentStep);
              const IconComponent = step.icon;

              if (isMinimized) {
                // Minimized view - show only icons
                return (
                  <div
                    key={step.id}
                    onClick={() => handleStepClick(step.id)}
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-110 mx-auto",
                      isCompleted && "bg-green-500 text-white hover:bg-green-600",
                      isCurrent && "bg-[#458EE2] text-white hover:bg-[#3a7bc7] animate-pulse",
                      isUpcoming && "bg-gray-200 text-gray-400 hover:bg-gray-300"
                    )}
                    title={`${step.label} - Click to navigate`}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      <IconComponent className="w-4 h-4" />
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={step.id}
                  onClick={() => handleStepClick(step.id)}
                  className={cn(
                    "guided-step-card relative p-3 rounded-lg cursor-pointer transform transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]",
                    isCompleted && "completed hover:shadow-green-200/50",
                    isCurrent && "current hover:shadow-blue-200/50 ring-2 ring-blue-200/30",
                    isUpcoming && "hover:shadow-gray-200/50"
                  )}
                  title={`Click to navigate to ${step.label}`}
                >
                  <div className="flex items-start gap-3">
                    {/* Step Icon */}
                    <div 
                      className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 hover:scale-110 cursor-pointer",
                        isCompleted && "bg-green-500 text-white hover:bg-green-600 shadow-lg shadow-green-200/50",
                        isCurrent && "bg-[#458EE2] text-white hover:bg-[#3a7bc7] shadow-lg shadow-blue-200/50 animate-pulse",
                        isUpcoming && "bg-gray-200 text-gray-400 hover:bg-gray-300 hover:text-gray-500"
                      )}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStepClick(step.id);
                      }}
                      title={`${step.label} - Click to navigate`}
                    >
                      {isCompleted ? (
                        <CheckCircle2 className="w-4 h-4" />
                      ) : (
                        <IconComponent className="w-4 h-4" />
                      )}
                    </div>

                    {/* Step Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-xs font-medium border",
                          STATUS_COLORS[step.status as keyof typeof STATUS_COLORS]
                        )}>
                          {step.status}
                        </span>
                        {isCompleted && (
                          <span className="text-xs text-green-600 font-medium">✓</span>
                        )}
                      </div>
                      <div className={cn(
                        "text-sm font-medium mb-1",
                        isCurrent && "text-[#458EE2]",
                        isCompleted && "text-green-700",
                        isUpcoming && "text-gray-600"
                      )}>
                        {step.label}
                      </div>
                      <div className="text-xs text-gray-500 mb-1">
                        {step.id}
                      </div>
                      <div className="text-xs text-gray-400">
                        {step.description}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Buttons */}
          {!isMinimized && (
            <div className="p-4 border-t border-white/20 bg-white/50 space-y-2">
            {!hasDatasets ? (
              <Button
                onClick={async () => {
                  if (onCreateDataUploadAtom) {
                    await onCreateDataUploadAtom();
                    onDismiss();
                  }
                }}
                className="w-full bg-[#458EE2] hover:bg-[#3a7bc7] text-white"
                size="sm"
              >
                <Upload className="w-4 h-4 mr-2" />
                Upload Dataset
              </Button>
            ) : (
              <div className="space-y-2">
                <Button
                  onClick={() => {
                    onDismiss();
                    onActionSelected('start-analysis');
                  }}
                  className="w-full bg-[#458EE2] hover:bg-[#3a7bc7] text-white"
                  size="sm"
                >
                  <Play className="w-4 h-4 mr-2" />
                  Start Analysis
                </Button>
                <Button
                  onClick={async () => {
                    if (onCreateDataUploadAtom) {
                      await onCreateDataUploadAtom();
                      onDismiss();
                    }
                  }}
                  variant="outline"
                  className="w-full bg-white/50 hover:bg-white/70"
                  size="sm"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload More Data
                </Button>
              </div>
            )}
            </div>
          )}

          {/* Footer */}
          {!isMinimized && (
            <div className="p-3 border-t border-white/20 bg-gray-50/50">
              <p className="text-xs text-gray-500 italic text-center">
                Click steps to navigate • All decisions remain under your control
              </p>
            </div>
          )}
        </div>
      </div>

    </>
  );


};

