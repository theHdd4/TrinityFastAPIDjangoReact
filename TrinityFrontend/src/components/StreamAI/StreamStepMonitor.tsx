import React from 'react';
import { CheckCircle2, Circle, Loader2, AlertCircle, Clock } from 'lucide-react';

interface StepStatus {
  step_number: number;
  atom_id: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  summary?: string;
  error?: string;
  output_alias?: string;
}

interface StreamStepMonitorProps {
  steps: StepStatus[];
  currentStep: number;
  totalSteps: number;
}

const StreamStepMonitor: React.FC<StreamStepMonitorProps> = ({
  steps,
  currentStep,
  totalSteps
}) => {
  const getAtomIcon = (atomId: string) => {
    const icons: Record<string, string> = {
      'merge': '🔗',
      'concat': '📋',
      'groupby-wtg-avg': '📊',
      'dataframe-operations': '🔧',
      'create-column': '➕',
      'chart-maker': '📈',
      'correlation': '📉',
      'explore': '🔍',
      'data-upload': '📤',
      'data-validate': '✅'
    };
    return icons[atomId] || '⚡';
  };

  const progressPercentage = Math.round((currentStep / totalSteps) * 100);

  return (
    <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl border-2 border-gray-200 shadow-xl p-6 space-y-4 animate-fade-in w-full">
      {/* Header with Progress */}
      <div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-2">
          <h3 className="font-bold text-gray-800 font-inter text-lg leading-tight">Workflow Execution</h3>
          <span className="text-sm font-semibold text-gray-600 font-inter">
            Step {currentStep} of {totalSteps}
          </span>
        </div>
        
        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden shadow-inner">
          <div
            className="bg-gradient-to-r from-[#41C185] to-[#3AB077] h-full rounded-full transition-all duration-500 ease-out shadow-sm"
            style={{ width: `${progressPercentage}%` }}
          >
            <div className="w-full h-full bg-white/20 animate-pulse"></div>
          </div>
        </div>
        <div className="text-right mt-1">
          <span className="text-xs text-gray-600 font-inter font-semibold">{progressPercentage}%</span>
        </div>
      </div>

      {/* Steps List */}
      <div className="space-y-2">
        {steps.map((step) => (
          <div
            key={step.step_number}
            className={`flex flex-wrap sm:flex-nowrap items-start gap-3 p-3 rounded-xl transition-all duration-200 ${
              step.status === 'running' 
                ? 'bg-blue-50 border-2 border-blue-200 shadow-md' 
                : step.status === 'completed'
                ? 'bg-green-50 border-2 border-green-200'
                : step.status === 'failed'
                ? 'bg-red-50 border-2 border-red-200'
                : 'bg-white border-2 border-gray-200'
            }`}
          >
            {/* Step Icon & Status */}
            <div className="flex-shrink-0 mt-0.5">
              {step.status === 'completed' ? (
                <CheckCircle2 className="w-6 h-6 text-green-600 animate-in zoom-in duration-300" />
              ) : step.status === 'running' ? (
                <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
              ) : step.status === 'failed' ? (
                <AlertCircle className="w-6 h-6 text-red-500 animate-in zoom-in duration-300" />
              ) : (
                <Circle className="w-6 h-6 text-gray-400" />
              )}
            </div>

            {/* Step Content */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <span className="text-sm font-bold text-gray-800 font-inter">
                  {getAtomIcon(step.atom_id)} {step.atom_id.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                </span>
                {step.status === 'running' && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500 text-white font-inter animate-pulse">
                    Processing
                  </span>
                )}
                {step.status === 'completed' && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-500 text-white font-inter">
                    Done
                  </span>
                )}
                {step.status === 'failed' && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500 text-white font-inter">
                    Failed
                  </span>
                )}
              </div>

              <p className="text-xs text-gray-600 font-inter leading-relaxed break-words">
                {step.description}
              </p>

              {step.output_alias && (
                <p className="text-[11px] text-gray-500 font-inter mt-1 italic">
                  Output alias: <span className="font-semibold text-gray-700">{step.output_alias}</span>
                </p>
              )}

              {step.status === 'running' && (
                <p className="text-xs text-blue-600 mt-2 font-inter flex items-center">
                  <Clock className="w-3 h-3 mr-1" />
                  Executing atom and generating results...
                </p>
              )}

              {step.status === 'completed' && step.summary && (
                <p className="text-xs text-green-700 mt-2 font-inter">
                  ✓ {step.summary}
                </p>
              )}

              {step.status === 'failed' && step.error && (
                <p className="text-xs text-red-700 mt-2 font-inter">
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

export default StreamStepMonitor;

