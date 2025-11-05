import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { X, Check, Plus } from 'lucide-react';

interface StreamStepApprovalProps {
  stepNumber: number;
  totalSteps: number;
  stepDescription: string;
  onAccept: () => void;
  onReject: () => void;
  onAdd: (additionalInfo: string) => void;
}

const StreamStepApproval: React.FC<StreamStepApprovalProps> = ({
  stepNumber,
  totalSteps,
  stepDescription,
  onAccept,
  onReject,
  onAdd
}) => {
  const [showAddModal, setShowAddModal] = useState(false);
  const [additionalInfo, setAdditionalInfo] = useState('');

  const handleAddClick = () => {
    setShowAddModal(true);
  };

  const handleSubmitAdd = () => {
    if (additionalInfo.trim()) {
      onAdd(additionalInfo.trim());
      setShowAddModal(false);
      setAdditionalInfo('');
    }
  };

  return (
    <>
      <div className="bg-gradient-to-br from-white to-gray-50 rounded-2xl border-2 border-gray-200 shadow-xl p-6 space-y-4 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-800 font-inter text-lg">Step {stepNumber} Completed</h3>
            <p className="text-xs text-gray-600 font-inter mt-1">{stepDescription}</p>
          </div>
          <span className="text-sm font-semibold text-gray-600 font-inter">
            Step {stepNumber} of {totalSteps}
          </span>
        </div>

        {/* Info Banner */}
        <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-3">
          <p className="text-xs text-blue-700 font-inter">
            💡 Review this step and decide: Continue to next step, reject workflow, or add more information to refine the workflow.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 pt-2">
          <Button
            onClick={onReject}
            variant="outline"
            className="flex-1 h-10 border-2 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 font-medium font-inter rounded-xl transition-all duration-200 text-sm"
          >
            <X className="w-4 h-4 mr-1" />
            Reject
          </Button>
          
          <Button
            onClick={handleAddClick}
            className="flex-1 h-10 bg-gradient-to-r from-[#FFBD59] to-[#FFA726] hover:from-[#FFA726] hover:to-[#FF9800] text-white font-medium font-inter rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 text-sm"
          >
            <Plus className="w-4 h-4 mr-1" />
            Add
          </Button>
          
          <Button
            onClick={onAccept}
            className="flex-1 h-10 bg-gradient-to-r from-[#41C185] to-[#3AB077] hover:from-[#3AB077] hover:to-[#34A06B] text-white font-medium font-inter rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 text-sm"
          >
            <Check className="w-4 h-4 mr-1" />
            Continue
          </Button>
        </div>
      </div>

      {/* Add Info Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
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
                {stepNumber === 1
                  ? "Add information to regenerate the entire workflow with your requirements:"
                  : `Add information to refine remaining steps (${stepNumber + 1} to ${totalSteps}):`}
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
                Add & Update
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default StreamStepApproval;

