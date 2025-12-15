// File: MetricGuideFlowModal.tsx
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { X, Check } from 'lucide-react';

import TypeTab from './MetricTabs/TypeTab';
import DatasetTab from './MetricTabs/DatasetTab';
import OperationsTab, { OperationsTabRef } from './MetricTabs/OperationsTab';
import PreviewTab from './MetricTabs/PreviewTab';
import { useSavedDataframes } from '../hooks/useSavedDataframes';
import type { SavedFrame } from '../hooks/useSavedDataframes';

interface MetricGuideFlowModalProps {
  open: boolean;
  onClose: () => void;
}

export interface CreatedVariable {
  name: string;
  value?: string;
  method: 'assign' | 'compute';
  description?: string;
  // Detailed operation information for better descriptions
  operationDetails?: {
    operationMethod: string; // 'sum', 'mean', 'max', etc.
    column?: string; // Column name used
    groupBy?: string[]; // Identifiers used for grouping
    secondColumn?: string; // For operations like add, subtract
    customName?: string;
  };
}

export interface CreatedColumn {
  columnName: string;
  tableName: string; // original table
  operations: string[]; // list of operations applied (kept for backward compatibility)
  objectName: string; // for URL construction
  // Detailed operation information
  operationDetails?: Array<{
    type: string; // Operation type
    columns: string[]; // Columns used
    method?: string; // For grouped operations (e.g., 'sum', 'mean')
    identifiers?: string[]; // For group by operations
    parameters?: Record<string, any>; // Additional parameters
  }>;
}

export interface CreatedTable {
  newTableName: string;
  originalTableName: string;
  objectName: string; // for URL construction
}

export interface MetricFlowState {
  selectedType: 'variable' | 'column' | null;
  dataSource: string;
  createdVariables: CreatedVariable[];
  createdColumns: CreatedColumn[];
  createdTables: CreatedTable[];
}

const MetricGuideFlowModal: React.FC<MetricGuideFlowModalProps> = ({ open, onClose }) => {
  const [activeStep, setActiveStep] = useState<'type'|'dataset'|'operations'|'preview'>('type');
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());
  const operationsTabRef = useRef<OperationsTabRef>(null);
  const [operationsTabState, setOperationsTabState] = useState({ canSave: false, isSaving: false });
  
  // Centralized state for all changes
  const [flowState, setFlowState] = useState<MetricFlowState>({
    selectedType: null,
    dataSource: '',
    createdVariables: [],
    createdColumns: [],
    createdTables: [],
  });

  // get frames from the hook here and keep local state to pass as "state" to DatasetTab
  const { frames, loading: framesLoading, error: framesError } = useSavedDataframes();
  const [framesState, setFramesState] = useState<SavedFrame[]>(frames ?? []);

  // keep framesState in sync with hook result (useful if hook updates after mount)
  useEffect(() => {
    setFramesState(frames ?? []);
  }, [frames]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setActiveStep('type');
      setCompletedSteps(new Set());
      setFlowState({
        selectedType: null,
        dataSource: '',
        createdVariables: [],
        createdColumns: [],
        createdTables: [],
      });
    }
  }, [open]);

  const steps = [
    { key: 'type', label: 'Select Type', sub: 'Step 1' },
    { key: 'dataset', label: 'Configure', sub: 'Step 2' },
    { key: 'operations', label: 'Operations', sub: 'Step 3' },
    { key: 'preview', label: 'Complete', sub: 'Step 4' },
  ];

  const handleStepComplete = useCallback((stepKey: string) => {
    setCompletedSteps(prev => new Set([...prev, stepKey]));
  }, []);

  const canProceedFromStep = (step: string): boolean => {
    switch (step) {
      case 'type':
        return flowState.selectedType !== null;
      case 'dataset':
        return flowState.dataSource !== '';
      case 'operations':
        return (
          flowState.createdVariables.length > 0 ||
          flowState.createdColumns.length > 0 ||
          flowState.createdTables.length > 0
        );
      case 'preview':
        return true;
      default:
        return false;
    }
  };

  const handleBack = useCallback(() => {
    const stepOrder: Array<'type'|'dataset'|'operations'|'preview'> = ['type', 'dataset', 'operations', 'preview'];
    const currentIndex = stepOrder.indexOf(activeStep);
    if (currentIndex > 0) {
      const previousStep = stepOrder[currentIndex - 1];
      // Remove current step from completed steps when going back
      setCompletedSteps(prev => {
        const newSet = new Set(prev);
        newSet.delete(activeStep);
        return newSet;
      });
      
      // If going back to type selection, clear all created items since type change would invalidate them
      if (previousStep === 'type') {
        setFlowState(prev => ({
          ...prev,
          createdVariables: [],
          createdColumns: [],
          createdTables: [],
        }));
      }
      
      setActiveStep(previousStep);
    }
  }, [activeStep]);

  const handleNext = useCallback(() => {
    if (!canProceedFromStep(activeStep)) {
      return;
    }

    const stepOrder: Array<'type'|'dataset'|'operations'|'preview'> = ['type', 'dataset', 'operations', 'preview'];
    const currentIndex = stepOrder.indexOf(activeStep);
    if (currentIndex < stepOrder.length - 1) {
      const nextStep = stepOrder[currentIndex + 1];
      handleStepComplete(activeStep);
      setActiveStep(nextStep);
    }
  }, [activeStep, flowState, handleStepComplete]);

  const handleSave = useCallback(() => {
    // TODO: Implement save logic
    console.log('Saving flow state:', flowState);
    onClose();
  }, [flowState, onClose]);

  const handleDataSourceChange = useCallback((dataSource: string) => {
    setFlowState(prev => ({ ...prev, dataSource }));
  }, []);

  const isStepCompleted = (stepKey: string) => completedSteps.has(stepKey);

  // Update button states when on operations step - use interval to check ref state
  useEffect(() => {
    if (activeStep !== 'operations') return;
    
    const updateState = () => {
      if (operationsTabRef.current) {
        const canSave = flowState.selectedType === 'variable' 
          ? operationsTabRef.current.canSaveVariable()
          : flowState.selectedType === 'column'
          ? operationsTabRef.current.canSaveColumn()
          : false;
        const isSaving = operationsTabRef.current.isSaving();
        setOperationsTabState(prev => {
          if (prev.canSave !== canSave || prev.isSaving !== isSaving) {
            return { canSave, isSaving };
          }
          return prev;
        });
      }
    };
    
    // Update immediately
    updateState();
    
    // Update periodically while on operations step
    const interval = setInterval(updateState, 500);
    return () => clearInterval(interval);
  }, [activeStep, flowState.selectedType, flowState.dataSource]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[90vh] bg-white p-0 overflow-hidden flex flex-col" hideCloseButton>
        <DialogHeader className="flex flex-row items-center justify-between px-6 py-4 border-b border-slate-200 flex-shrink-0">
          <DialogTitle className="text-lg font-semibold text-slate-900">Create New Metric</DialogTitle>
          <div className="flex items-center gap-2">
            <Badge className="bg-[#41C185] text-white">Guided</Badge>
            <Button variant="ghost" size="icon" onClick={onClose} className="text-slate-500 hover:text-slate-700">
              <X className="w-5 h-5" />
            </Button>
          </div>
        </DialogHeader>

        <div className="px-6 pt-4 flex flex-col flex-1 min-h-0">
          <Tabs value={activeStep} className="flex flex-col gap-4 flex-1 min-h-0">
            <TabsList className="sr-only">
              <TabsTrigger value="type">Select Metric Type</TabsTrigger>
              <TabsTrigger value="dataset">Confirm Input Dataset</TabsTrigger>
              <TabsTrigger value="operations">Select Operation + Guided Configuration</TabsTrigger>
              <TabsTrigger value="preview">Preview & Save</TabsTrigger>
            </TabsList>

            <div className="space-y-4 flex-shrink-0">
              <div className="flex items-center justify-between gap-4">
                {steps.map((step, index, arr) => {
                  const isCompleted = isStepCompleted(step.key);
                  const isActive = activeStep === step.key;
                  return (
                    <div key={step.key} className="flex items-center flex-1">
                      <div
                        className={`flex items-center justify-center h-10 w-10 rounded-full border text-sm font-semibold transition-colors ${
                          isCompleted
                            ? 'bg-[#41C185] border-[#41C185] text-white'
                            : isActive
                            ? 'bg-[#458EE2] border-[#458EE2] text-white'
                            : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        {isCompleted ? <Check className="w-5 h-5" /> : index + 1}
                      </div>
                      <div className="ml-3">
                        <div className="text-sm font-semibold text-slate-900">{step.label}</div>
                        <div className="text-xs text-slate-500">{step.sub}</div>
                      </div>
                      {index < arr.length - 1 && (
                        <div className={`flex-1 mx-4 h-0.5 ${isCompleted ? 'bg-[#41C185]' : 'bg-slate-200'}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <ScrollArea className="flex-1 pr-3 min-h-0">
              <TabsContent value="type" className="space-y-4 mt-0">
                <TypeTab 
                  onTypeChange={(type) => {
                    setFlowState(prev => {
                      // If type changes, clear all created items as they're type-specific
                      if (prev.selectedType !== type) {
                        return {
                          ...prev,
                          selectedType: type,
                          createdVariables: [],
                          createdColumns: [],
                          createdTables: [],
                        };
                      }
                      return { ...prev, selectedType: type };
                    });
                  }}
                  selectedType={flowState.selectedType}
                />
              </TabsContent>

              <TabsContent value="dataset" className="space-y-4 mt-0">
                <DatasetTab 
                  frames={framesState}
                  framesLoading={framesLoading}
                  framesError={framesError ?? null}
                  onDataSourceChange={handleDataSourceChange}
                  dataSource={flowState.dataSource}
                  isActive={activeStep === 'dataset'}
                />
              </TabsContent>

              <TabsContent value="operations" className="space-y-4 mt-0">
                <OperationsTab 
                  ref={operationsTabRef}
                  selectedType={flowState.selectedType}
                  dataSource={flowState.dataSource}
                  onVariableCreated={(vars) => {
                    setFlowState(prev => ({ 
                      ...prev, 
                      createdVariables: [...prev.createdVariables, ...vars] 
                    }));
                    // Auto-navigate to preview tab when variables are created
                    setActiveStep('preview');
                    handleStepComplete('operations');
                  }}
                  onColumnCreated={(column) => {
                    setFlowState(prev => ({ 
                      ...prev, 
                      createdColumns: [...prev.createdColumns, column] 
                    }));
                    // Auto-navigate to preview tab when columns are created
                    setActiveStep('preview');
                    handleStepComplete('operations');
                  }}
                  onTableCreated={(table) => {
                    setFlowState(prev => ({ 
                      ...prev, 
                      createdTables: [...prev.createdTables, table] 
                    }));
                    // Auto-navigate to preview tab when tables are created
                    setActiveStep('preview');
                    handleStepComplete('operations');
                  }}
                />
              </TabsContent>

              <TabsContent value="preview" className="space-y-4 mt-0">
                <PreviewTab 
                  flowState={flowState}
                  onSave={handleSave}
                />
              </TabsContent>
            </ScrollArea>
          </Tabs>

          {/* Centralized Footer - Fixed at bottom */}
          <div className="flex items-center justify-between pt-4 pb-4 border-t border-slate-200 flex-shrink-0 mt-auto">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <div className="flex items-center gap-2">
              {activeStep !== 'type' && (
                <Button variant="ghost" onClick={handleBack}>
                  Back
                </Button>
              )}
              {activeStep === 'operations' ? (
                // Show Save buttons for operations step
                <>
                  {flowState.selectedType === 'variable' && (
                    <Button 
                      onClick={async () => {
                        if (operationsTabRef.current) {
                          await operationsTabRef.current.saveVariable();
                        }
                      }}
                      disabled={!operationsTabState.canSave || operationsTabState.isSaving}
                      className="bg-[#458EE2] hover:bg-[#3c7ac5] text-white"
                    >
                      {operationsTabState.isSaving ? 'Saving...' : 'Save'}
                    </Button>
                  )}
                  {flowState.selectedType === 'column' && (
                    <>
                      <Button 
                        onClick={() => {
                          if (operationsTabRef.current) {
                            operationsTabRef.current.saveColumnAs();
                            // Navigation to preview happens via onColumnCreated/onTableCreated callbacks
                          }
                        }}
                        disabled={operationsTabState.isSaving || !flowState.dataSource}
                        variant="outline"
                        className="text-slate-700 border-slate-200"
                      >
                        Save As
                      </Button>
                      <Button 
                        onClick={async () => {
                          if (operationsTabRef.current) {
                            await operationsTabRef.current.saveColumn();
                            // Navigation to preview happens via onColumnCreated callbacks
                          }
                        }}
                        disabled={operationsTabState.isSaving || !flowState.dataSource}
                        className="bg-[#458EE2] hover:bg-[#3c7ac5] text-white"
                      >
                        {operationsTabState.isSaving ? 'Saving...' : 'Save'}
                      </Button>
                    </>
                  )}
                </>
              ) : activeStep === 'preview' ? (
                <Button 
                  onClick={handleSave}
                  className="bg-[#458EE2] hover:bg-[#3c7ac5] text-white"
                >
                  Close
                </Button>
              ) : (
                <Button 
                  onClick={handleNext}
                  disabled={!canProceedFromStep(activeStep)}
                  className="bg-[#458EE2] hover:bg-[#3c7ac5] text-white"
                >
                  Continue
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MetricGuideFlowModal;
