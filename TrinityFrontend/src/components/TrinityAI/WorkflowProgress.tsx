import React from 'react';
import { CheckCircle2, Circle, Clock, AlertCircle, Loader2 } from 'lucide-react';

interface WorkflowStep {
  step: number;
  agent: string;
  action?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  summary?: string;
  error?: string;
}

interface WorkflowProgressProps {
  totalSteps: number;
  completedSteps: number;
  currentStep: number;
  steps: WorkflowStep[];
}

const WorkflowProgress: React.FC<WorkflowProgressProps> = ({
  totalSteps,
  completedSteps,
  currentStep,
  steps
}) => {
  if (totalSteps === 0) return null;

  const progressPercentage = (completedSteps / totalSteps) * 100;

  return (
    <div className="mt-4 p-4 bg-gradient-to-br from-green-50 to-white border-2 border-green-200 rounded-2xl shadow-lg">
      {/* Progress Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-white animate-spin" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-800 font-inter">
              Workflow Execution
            </h4>
            <p className="text-xs text-gray-600 font-inter">
              Step {completedSteps + 1} of {totalSteps}
            </p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-sm font-bold text-green-600 font-inter">
            {Math.round(progressPercentage)}%
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-gradient-to-r from-green-400 to-green-600 transition-all duration-500 ease-out"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      {/* Steps List */}
      <div className="space-y-2">
        {steps.map((step, index) => (
          <div
            key={index}
            className="flex items-start gap-3 p-2 rounded-lg transition-all duration-200 hover:bg-green-50"
          >
            {/* Step Number & Icon */}
            <div className="flex-shrink-0 mt-0.5">
              {step.status === 'completed' ? (
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              ) : step.status === 'running' ? (
                <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
              ) : step.status === 'failed' ? (
                <AlertCircle className="w-5 h-5 text-red-500" />
              ) : (
                <Circle className="w-5 h-5 text-gray-400" />
              )}
            </div>

            {/* Step Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-800 font-inter">
                  Step {step.step}: {step.agent}
                </span>
                {step.action && (
                  <span className="text-xs text-gray-500 font-inter">
                    ({step.action})
                  </span>
                )}
              </div>

              {step.status === 'running' && (
                <p className="text-xs text-blue-600 mt-1 font-inter">
                  <Clock className="w-3 h-3 inline mr-1" />
                  Executing...
                </p>
              )}

              {step.status === 'completed' && step.summary && (
                <p className="text-xs text-green-700 mt-1 font-inter">
                  ✓ {step.summary}
                </p>
              )}

              {step.status === 'failed' && step.error && (
                <p className="text-xs text-red-700 mt-1 font-inter">
                  ✗ {step.error}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default WorkflowProgress;

