import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Circle, ArrowRight, Clock, FileText, Play, X } from 'lucide-react';

interface WorkflowStep {
  step_number: number;
  atom_id: string;
  description: string;
  files_used: string[];
  reason: string;
}

interface WorkflowPlan {
  workflow_steps: WorkflowStep[];
  estimated_duration: string;
  total_steps: number;
  original_prompt: string;
}

interface WorkflowPreviewProps {
  plan: WorkflowPlan;
  onApprove: () => void;
  onModify?: () => void;
  onCancel?: () => void;
}

export const WorkflowPreview: React.FC<WorkflowPreviewProps> = ({
  plan,
  onApprove,
  onModify,
  onCancel
}) => {
  // Format atom ID for display
  const formatAtomName = (atomId: string): string => {
    return atomId
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Get atom icon based on type
  const getAtomIcon = (atomId: string): string => {
    const iconMap: Record<string, string> = {
      'data-upload-validate': '📊',
      'feature-overview': '🔍',
      'dataframe-operations': '⚙️',
      'groupby-wtg-avg': '📈',
      'merge': '🔗',
      'concat': '📑',
      'chart-maker': '📉',
      'correlation': '🔬',
      'explore': '🧭',
      'create-column': '➕'
    };
    return iconMap[atomId] || '⚡';
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <Card className="p-6 mb-4 bg-gradient-to-r from-[#41C185]/10 to-[#458EE2]/10 border-2 border-[#41C185]/30">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-800 font-inter mb-2 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-[#41C185]" />
              Workflow Plan Generated
            </h3>
            <p className="text-sm text-gray-600 font-inter mb-3">
              <strong>Your Request:</strong> "{plan.original_prompt}"
            </p>
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1 text-gray-700 font-inter">
                <Circle className="w-4 h-4 text-[#458EE2]" />
                <strong>{plan.total_steps}</strong> steps
              </span>
              <span className="flex items-center gap-1 text-gray-700 font-inter">
                <Clock className="w-4 h-4 text-[#FFBD59]" />
                Est. {plan.estimated_duration}
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Step Sequence Visualization */}
      <div className="mb-6">
        <h4 className="text-sm font-semibold text-gray-700 font-inter mb-3">Execution Steps:</h4>
        <div className="space-y-3">
          {plan.workflow_steps.map((step, index) => (
            <div key={step.step_number} className="relative">
              {/* Connector Line */}
              {index < plan.workflow_steps.length - 1 && (
                <div className="absolute left-6 top-16 w-0.5 h-8 bg-gradient-to-b from-[#41C185] to-[#458EE2]" />
              )}
              
              {/* Step Card */}
              <Card className="p-4 border-2 border-gray-200 hover:border-[#41C185]/50 transition-all duration-200 hover:shadow-lg">
                <div className="flex items-start gap-4">
                  {/* Step Number Circle */}
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#41C185] to-[#458EE2] flex items-center justify-center text-white font-bold font-inter shadow-lg">
                      {step.step_number}
                    </div>
                  </div>
                  
                  {/* Step Details */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xl">{getAtomIcon(step.atom_id)}</span>
                      <h5 className="text-base font-bold text-gray-800 font-inter">
                        {formatAtomName(step.atom_id)}
                      </h5>
                      <span className="text-xs px-2 py-1 bg-gray-100 rounded text-gray-600 font-inter">
                        {step.atom_id}
                      </span>
                    </div>
                    
                    <p className="text-sm text-gray-700 font-inter mb-2">
                      {step.description}
                    </p>
                    
                    <div className="flex items-center gap-4 text-xs text-gray-600 font-inter">
                      {step.files_used && step.files_used.length > 0 && (
                        <span className="flex items-center gap-1">
                          <FileText className="w-3 h-3" />
                          Files: {step.files_used.join(', ')}
                        </span>
                      )}
                      <span className="text-gray-500">
                        {step.reason}
                      </span>
                    </div>
                  </div>
                  
                  {/* Arrow to Next */}
                  {index < plan.workflow_steps.length - 1 && (
                    <ArrowRight className="w-5 h-5 text-[#41C185] flex-shrink-0 mt-3" />
                  )}
                </div>
              </Card>
            </div>
          ))}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between gap-3 pt-4 border-t-2 border-gray-200">
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button
              onClick={onCancel}
              variant="outline"
              className="font-inter border-2 border-red-200 hover:border-red-400 hover:bg-red-50 text-red-600"
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
          )}
          {onModify && (
            <Button
              onClick={onModify}
              variant="outline"
              className="font-inter border-2 border-gray-300 hover:border-[#458EE2] hover:bg-[#458EE2]/10"
            >
              Modify Plan
            </Button>
          )}
        </div>
        
        <Button
          onClick={onApprove}
          className="bg-gradient-to-r from-[#41C185] to-[#3AB077] hover:from-[#3AB077] hover:to-[#41C185] text-white font-bold font-inter shadow-lg hover:shadow-xl transition-all duration-300"
        >
          <Play className="w-4 h-4 mr-2" />
          Start Execution
        </Button>
      </div>
    </div>
  );
};

export default WorkflowPreview;

