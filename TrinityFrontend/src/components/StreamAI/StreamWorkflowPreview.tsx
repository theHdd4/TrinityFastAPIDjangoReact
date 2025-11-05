import React from 'react';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Circle, ArrowRight, Sparkles, X, Check } from 'lucide-react';

interface WorkflowStep {
  step_number: number;
  atom_id: string;
  description: string;
}

interface StreamWorkflowPreviewProps {
  workflow: {
    total_steps: number;
    workflow_steps: WorkflowStep[];
  };
  onAccept: () => void;
  onReject: () => void;
}

const StreamWorkflowPreview: React.FC<StreamWorkflowPreviewProps> = ({
  workflow,
  onAccept,
  onReject
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
      'data-upload-validate': '📁'
    };
    return icons[atomId] || '⚡';
  };

  const getAtomColor = (atomId: string) => {
    const colors: Record<string, string> = {
      'merge': 'from-blue-500 to-blue-600',
      'concat': 'from-purple-500 to-purple-600',
      'groupby-wtg-avg': 'from-green-500 to-green-600',
      'dataframe-operations': 'from-orange-500 to-orange-600',
      'create-column': 'from-pink-500 to-pink-600',
      'chart-maker': 'from-indigo-500 to-indigo-600',
      'correlation': 'from-red-500 to-red-600',
      'explore': 'from-yellow-500 to-yellow-600',
      'data-upload-validate': 'from-gray-500 to-gray-600'
    };
    return colors[atomId] || 'from-[#41C185] to-[#3AB077]';
  };

  return (
    <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl border-2 border-gray-200 shadow-xl p-6 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#41C185] to-[#3AB077] flex items-center justify-center shadow-lg">
            <Sparkles className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-gray-800 font-inter text-lg">AI-Generated Workflow</h3>
            <p className="text-xs text-gray-600 font-inter">{workflow.total_steps} steps planned</p>
          </div>
        </div>
      </div>

      {/* Workflow Steps */}
      <div className="space-y-3">
        {workflow.workflow_steps.map((step, index) => (
          <div key={step.step_number}>
            {/* Step Card */}
            <div className="bg-white rounded-xl border-2 border-gray-200 p-4 hover:border-[#41C185] transition-all duration-200 hover:shadow-md group">
              <div className="flex items-start gap-3">
                {/* Step Icon */}
                <div className={`flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br ${getAtomColor(step.atom_id)} flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-200`}>
                  <span className="text-xl">{getAtomIcon(step.atom_id)}</span>
                </div>

                {/* Step Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-700 text-xs font-bold font-inter">
                      {step.step_number}
                    </span>
                    <h4 className="font-semibold text-gray-800 font-inter text-sm">
                      {step.atom_id.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                    </h4>
                  </div>
                  <p className="text-xs text-gray-600 font-inter leading-relaxed">
                    {step.description}
                  </p>
                </div>

                {/* Status Indicator */}
                <Circle className="w-5 h-5 text-gray-300 flex-shrink-0 mt-1" />
              </div>
            </div>

            {/* Arrow Between Steps */}
            {index < workflow.workflow_steps.length - 1 && (
              <div className="flex justify-center py-2">
                <ArrowRight className="w-5 h-5 text-[#41C185]" />
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4 border-t-2 border-gray-200">
        <Button
          onClick={onReject}
          variant="outline"
          className="flex-1 h-12 border-2 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 font-semibold font-inter rounded-xl transition-all duration-200"
        >
          <X className="w-5 h-5 mr-2" />
          Reject
        </Button>
        <Button
          onClick={onAccept}
          className="flex-1 h-12 bg-gradient-to-r from-[#41C185] to-[#3AB077] hover:from-[#3AB077] hover:to-[#34A06B] text-white font-semibold font-inter rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105"
        >
          <Check className="w-5 h-5 mr-2" />
          Accept & Execute
        </Button>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-3">
        <p className="text-xs text-blue-700 font-inter">
          <Sparkles className="w-4 h-4 inline mr-1" />
          This workflow was intelligently generated by AI based on your request and available data.
        </p>
      </div>
    </div>
  );
};

export default StreamWorkflowPreview;

