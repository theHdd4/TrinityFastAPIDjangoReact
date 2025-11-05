import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Circle, Loader2, AlertCircle, ChevronDown, ChevronRight, PlayCircle, Square } from 'lucide-react';

interface StepResult {
  step_number: number;
  atom_id: string;
  parameters_generated: Record<string, any>;
  card_id: string | null;
  execution_result: Record<string, any>;
  status: 'completed' | 'failed' | 'pending';
  error_message?: string;
  output_file?: string;
  columns?: string[];
  row_count?: number;
}

interface ExecutionState {
  sequence_id: string;
  phase: string;
  status: string;
  current_step: number;
  total_steps: number;
  completed_steps: StepResult[];
  waiting_for_approval: boolean;
  workflow_plan: {
    workflow_steps: Array<{
      step_number: number;
      atom_id: string;
      description: string;
    }>;
  };
}

interface StepExecutionMonitorProps {
  execution: ExecutionState;
  onApprove: () => void;
  onCancel: () => void;
}

export const StepExecutionMonitor: React.FC<StepExecutionMonitorProps> = ({
  execution,
  onApprove,
  onCancel
}) => {
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set([execution.current_step]));

  const toggleStepExpansion = (stepNumber: number) => {
    const newExpanded = new Set(expandedSteps);
    if (newExpanded.has(stepNumber)) {
      newExpanded.delete(stepNumber);
    } else {
      newExpanded.add(stepNumber);
    }
    setExpandedSteps(newExpanded);
  };

  const getStepStatus = (stepNumber: number): 'completed' | 'current' | 'pending' => {
    if (stepNumber < execution.current_step) return 'completed';
    if (stepNumber === execution.current_step) return 'current';
    return 'pending';
  };

  const formatAtomName = (atomId: string): string => {
    return atomId
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const getStatusIcon = (status: 'completed' | 'current' | 'pending') => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-[#41C185]" />;
      case 'current':
        return <Loader2 className="w-5 h-5 text-[#458EE2] animate-spin" />;
      case 'pending':
        return <Circle className="w-5 h-5 text-gray-300" />;
    }
  };

  const currentStepResult = execution.completed_steps[execution.current_step - 1];

  return (
    <div className="animate-fade-in space-y-4">
      {/* Progress Header */}
      <Card className="p-5 bg-gradient-to-r from-[#458EE2]/10 to-[#41C185]/10 border-2 border-[#458EE2]/30">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-bold text-gray-800 font-inter">Executing Workflow</h3>
          <span className="text-sm font-semibold text-gray-600 font-inter">
            Step {execution.current_step} of {execution.total_steps}
          </span>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#41C185] to-[#458EE2] transition-all duration-500 ease-out"
            style={{ width: `${(execution.current_step / execution.total_steps) * 100}%` }}
          />
        </div>
        
        <p className="text-xs text-gray-600 font-inter mt-2">
          {execution.waiting_for_approval ? 
            '⏸️ Waiting for your approval to continue' : 
            '⚙️ Processing...'}
        </p>
      </Card>

      {/* Step List */}
      <div className="space-y-2">
        {execution.workflow_plan.workflow_steps.map((step) => {
          const stepStatus = getStepStatus(step.step_number);
          const stepResult = execution.completed_steps.find(s => s.step_number === step.step_number);
          const isExpanded = expandedSteps.has(step.step_number);
          const isActive = step.step_number === execution.current_step;

          return (
            <Card
              key={step.step_number}
              className={`border-2 transition-all duration-300 ${
                isActive
                  ? 'border-[#458EE2] shadow-lg shadow-[#458EE2]/20 bg-[#458EE2]/5'
                  : stepStatus === 'completed'
                  ? 'border-[#41C185]/30 bg-[#41C185]/5'
                  : 'border-gray-200'
              }`}
            >
              {/* Step Header */}
              <button
                onClick={() => stepResult && toggleStepExpansion(step.step_number)}
                className="w-full p-4 flex items-center gap-3 hover:bg-gray-50/50 transition-colors"
                disabled={!stepResult}
              >
                {/* Status Icon */}
                <div className="flex-shrink-0">
                  {getStatusIcon(stepStatus)}
                </div>

                {/* Step Info */}
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-bold text-gray-800 font-inter">
                      Step {step.step_number}:
                    </span>
                    <span className="font-semibold text-gray-700 font-inter">
                      {formatAtomName(step.atom_id)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 font-inter">
                    {step.description}
                  </p>
                </div>

                {/* Expand Icon */}
                {stepResult && (
                  <div className="flex-shrink-0">
                    {isExpanded ? (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                )}
              </button>

              {/* Expanded Step Details */}
              {isExpanded && stepResult && (
                <div className="px-4 pb-4 border-t border-gray-200 pt-4 space-y-3">
                  {/* Parameters Generated */}
                  <div>
                    <h5 className="text-xs font-semibold text-gray-700 font-inter mb-2">
                      Generated Parameters:
                    </h5>
                    <pre className="text-xs bg-gray-50 p-3 rounded border border-gray-200 overflow-x-auto font-mono">
                      {JSON.stringify(stepResult.parameters_generated, null, 2)}
                    </pre>
                  </div>

                  {/* Results */}
                  {stepResult.output_file && (
                    <div>
                      <h5 className="text-xs font-semibold text-gray-700 font-inter mb-2">
                        Results:
                      </h5>
                      <div className="text-xs bg-[#41C185]/10 p-3 rounded border border-[#41C185]/30 font-inter">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold">Output File:</span>
                          <span className="text-gray-700">{stepResult.output_file}</span>
                        </div>
                        {stepResult.row_count !== undefined && (
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold">Rows:</span>
                            <span className="text-gray-700">{stepResult.row_count}</span>
                          </div>
                        )}
                        {stepResult.columns && stepResult.columns.length > 0 && (
                          <div className="flex items-start gap-2">
                            <span className="font-semibold">Columns:</span>
                            <span className="text-gray-700">
                              {stepResult.columns.slice(0, 5).join(', ')}
                              {stepResult.columns.length > 5 && ` ... (${stepResult.columns.length} total)`}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Card ID with Link */}
                  {stepResult.card_id && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-gray-700 font-inter">Laboratory Card:</span>
                      <code className="px-2 py-1 bg-gray-100 rounded text-gray-700 font-mono">
                        {stepResult.card_id}
                      </code>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-xs border-[#458EE2] text-[#458EE2] hover:bg-[#458EE2]/10"
                        onClick={() => {
                          // Switch to Laboratory Mode to view the card
                          console.log('View card in Laboratory:', stepResult.card_id);
                          // You can add navigation logic here if needed
                        }}
                      >
                        View in Lab
                      </Button>
                    </div>
                  )}

                  {/* Error Message */}
                  {stepResult.error_message && (
                    <div className="flex items-start gap-2 text-xs bg-red-50 p-3 rounded border border-red-200 text-red-700 font-inter">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <span>{stepResult.error_message}</span>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Action Buttons */}
      {execution.waiting_for_approval && (
        <div className="flex items-center justify-between gap-3 pt-4 border-t-2 border-gray-200">
          <Button
            onClick={onCancel}
            variant="outline"
            className="font-inter border-2 border-red-200 hover:border-red-400 hover:bg-red-50 text-red-600"
          >
            <Square className="w-4 h-4 mr-2" />
            Cancel Execution
          </Button>

          <Button
            onClick={onApprove}
            className="bg-gradient-to-r from-[#41C185] to-[#3AB077] hover:from-[#3AB077] hover:to-[#41C185] text-white font-bold font-inter shadow-lg hover:shadow-xl transition-all duration-300"
          >
            <PlayCircle className="w-4 h-4 mr-2" />
            {execution.current_step < execution.total_steps ? 'Continue to Next Step' : 'Complete Workflow'}
          </Button>
        </div>
      )}

      {/* Completion Message */}
      {execution.status === 'completed' && (
        <Card className="p-5 bg-gradient-to-r from-[#41C185]/20 to-[#458EE2]/20 border-2 border-[#41C185]">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-[#41C185]" />
            <div>
              <h4 className="font-bold text-gray-800 font-inter">Workflow Complete! 🎉</h4>
              <p className="text-sm text-gray-600 font-inter">
                All {execution.total_steps} steps executed successfully.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
};

export default StepExecutionMonitor;

