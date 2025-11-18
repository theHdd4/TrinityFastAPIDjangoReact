import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Circle, ArrowRight, Sparkles, X, Check, Plus, FastForward } from 'lucide-react';
import { useAgentMode } from './context/AgentModeContext';

interface WorkflowStep {
  step_number: number;
  atom_id: string;
  description: string;
  prompt?: string;
  files_used?: string[];
  inputs?: string[];
  output_alias?: string;
}

interface StreamWorkflowPreviewProps {
  workflow: {
    total_steps: number;
    workflow_steps: WorkflowStep[];
  };
  onAccept: () => void;
  onReject: () => void;
  onAdd?: (additionalInfo: string) => void;
  onRunAll?: () => void;
  isAutoRunning?: boolean;
}

const StreamWorkflowPreview: React.FC<StreamWorkflowPreviewProps> = ({
  workflow,
  onAccept,
  onReject,
  onAdd,
  onRunAll,
  isAutoRunning = false
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [additionalInfo, setAdditionalInfo] = useState('');
  const { isAgentMode } = useAgentMode();

  const handleAddClick = () => {
    setShowAddModal(true);
  };

  const handleSubmitAdd = () => {
    if (additionalInfo.trim() && onAdd) {
      onAdd(additionalInfo.trim());
      setShowAddModal(false);
      setAdditionalInfo('');
    }
  };
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
    <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl border-2 border-gray-200 shadow-xl p-6 space-y-6 animate-fade-in w-full">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
              <div className="flex flex-wrap sm:flex-nowrap items-start gap-3">
                {/* Step Icon */}
                <div className={`flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br ${getAtomColor(step.atom_id)} flex items-center justify-center shadow-md group-hover:scale-110 transition-transform duration-200`}>
                  <span className="text-xl">{getAtomIcon(step.atom_id)}</span>
                </div>

                {/* Step Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-700 text-xs font-bold font-inter">
                      {step.step_number}
                    </span>
                    <h4 className="font-semibold text-gray-800 font-inter text-sm">
                      {step.atom_id.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                    </h4>
                  </div>
                  <p className="text-xs text-gray-600 font-inter leading-relaxed break-words">
                    {step.description}
                  </p>

                  {step.files_used && step.files_used.length > 0 && (
                    <div className="mt-2 bg-gray-50 border border-gray-200 rounded-lg p-2">
                      <p className="text-xs font-semibold text-gray-700 font-inter">Files Referenced:</p>
                      <ul className="text-xs text-gray-600 font-inter list-disc list-inside space-y-1">
                        {step.files_used.map((file) => (
                          <li key={file}>{file}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {step.prompt && (
                    <div className="mt-2 bg-[#F8FBFF] border border-blue-200 rounded-lg p-3">
                      <p className="text-xs font-semibold text-[#2761A3] font-inter mb-1">LLM Prompt:</p>
                      <pre className="text-xs text-gray-700 font-inter whitespace-pre-wrap leading-relaxed">{step.prompt}</pre>
                    </div>
                  )}

                  {step.output_alias && (
                    <p className="text-[11px] text-gray-500 font-inter mt-2 italic">Output saved as: <span className="font-semibold">{step.output_alias}</span></p>
                  )}
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

      {/* Action / Status */}
      {isAgentMode ? (
        <div className="pt-4 border-t-2 border-gray-200">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 bg-[#41C185]/10 border border-[#41C185]/30 rounded-2xl px-4 py-3 transition-all duration-300">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#41C185] text-white shadow-lg shadow-[#41C185]/30">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-[#1f6b4a] font-inter">Agent Mode active</p>
              <p className="text-xs text-[#2f855a] font-inter">
                This workflow is executing automatically in the background. Monitor progress and status updates below.
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3 pt-4 border-t-2 border-gray-200">
          <Button
            onClick={onReject}
            variant="outline"
            className="flex-1 min-w-[150px] h-10 border-2 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 font-medium font-inter rounded-xl transition-all duration-200 text-sm"
          >
            <X className="w-4 h-4 mr-1" />
            Reject
          </Button>
          <Button
            onClick={handleAddClick}
            className="flex-1 min-w-[150px] h-10 bg-gradient-to-r from-[#FFBD59] to-[#FFA726] hover:from-[#FFA726] hover:to-[#FF9800] text-white font-medium font-inter rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 text-sm"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
          <Button
            onClick={onAccept}
            disabled={isAutoRunning}
            className="flex-1 min-w-[150px] h-10 bg-gradient-to-r from-[#41C185] to-[#3AB077] hover:from-[#3AB077] hover:to-[#34A06B] text-white font-medium font-inter rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 text-sm"
          >
            <Check className="w-4 h-4 mr-1" />
            Accept
          </Button>
          <Button
            onClick={() => {
              if (!isAutoRunning && onRunAll) {
                onRunAll();
              }
            }}
            disabled={isAutoRunning}
            className="flex-1 min-w-[150px] h-10 bg-gradient-to-r from-[#458EE2] to-[#3C7CC5] hover:from-[#3C7CC5] hover:to-[#356CB0] text-white font-medium font-inter rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 text-sm disabled:opacity-70 disabled:hover:scale-100"
          >
            <FastForward className="w-4 h-4 mr-1" />
            {isAutoRunning ? 'Auto-running' : 'Accept & Run All'}
          </Button>
        </div>
      )}
      
      {/* Add Info Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 mt-6">
          <div className="bg-white rounded-2xl border-2 border-gray-200 shadow-2xl max-w-2xl w-full p-6 space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-800 font-inter text-lg">Add Additional Information</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowAddModal(false);
                  setAdditionalInfo('');
                }}
                className="h-8 w-8 p-0 hover:bg-gray-100 rounded-xl"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-gray-600 font-inter">
                Add information to regenerate the entire workflow with your requirements:
              </p>
              
              <Textarea
                value={additionalInfo}
                onChange={(e) => setAdditionalInfo(e.target.value)}
                placeholder="Example: Use inner join for merge, group by year and month, create bar chart with specific colors..."
                className="min-h-[120px] resize-none font-inter rounded-xl border-2 border-gray-200 focus:border-[#FFBD59] transition-colors"
                style={{ fontSize: '14px' }}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                onClick={() => {
                  setShowAddModal(false);
                  setAdditionalInfo('');
                }}
                variant="outline"
                className="flex-1 h-11 border-2 border-gray-200 hover:bg-gray-50 font-inter rounded-xl"
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitAdd}
                disabled={!additionalInfo.trim()}
                className="flex-1 h-11 bg-gradient-to-r from-[#FFBD59] to-[#FFA726] hover:from-[#FFA726] hover:to-[#FF9800] text-white font-semibold font-inter rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add & Regenerate
              </Button>
            </div>
          </div>
        </div>
      )}

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

