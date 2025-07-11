import React from 'react';
import { Button } from '@/components/ui/button';

interface MergeOptionsProps {
  settings: {
    joinColumns: string[];
    joinType: string;
    availableColumns: string[];
  };
  onSettingsChange: (settings: any) => void;
  onPerformMerge?: () => void;
}

const joinTypes = [
  { value: 'inner', label: 'Inner Join', desc: 'Only matching rows' },
  { value: 'outer', label: 'Outer Join', desc: 'All rows' },
  { value: 'left', label: 'Left Join', desc: 'All from primary' },
  { value: 'right', label: 'Right Join', desc: 'All from secondary' },
];

const MergeOptions: React.FC<MergeOptionsProps> = ({ settings, onSettingsChange, onPerformMerge }) => {
  const handleSelectAll = () => {
    if (settings.joinColumns.length === settings.availableColumns.length) {
      // If all are selected, deselect all
      onSettingsChange({ ...settings, joinColumns: [] });
    } else {
      // Select all
      onSettingsChange({ ...settings, joinColumns: [...settings.availableColumns] });
    }
  };

  const isAllSelected = settings.joinColumns.length === settings.availableColumns.length && settings.availableColumns.length > 0;

  return (
    <div className="w-full h-full p-6 bg-gradient-to-br from-slate-50 to-blue-50 overflow-y-auto">
      {/* <div className="mb-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Merge Options</h4>
      </div> */}
      <div className="space-y-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-gray-700">Join Columns</label>
            <button
              type="button"
              onClick={handleSelectAll}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              {isAllSelected ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          <div className="relative">
            <div className="flex flex-wrap gap-1 max-h-48 overflow-y-auto p-3 bg-white/60 backdrop-blur-sm rounded-lg border border-gray-200 shadow-inner">
              {settings.availableColumns.map(col => (
                <button
                  key={col}
                  type="button"
                  className={`px-2 py-1 rounded-lg border-2 text-xs font-medium transition-all duration-200 shadow-sm hover:shadow-md ${
                    settings.joinColumns.includes(col) 
                      ? 'bg-blue-100 text-green-800 border-blue-300 shadow-md transform scale-105' 
                      : 'bg-white/80 text-green-600 border-gray-300 hover:bg-blue-50 hover:border-blue-300 hover:scale-105'
                  }`}
                  onClick={() => {
                    const next = settings.joinColumns.includes(col)
                      ? settings.joinColumns.filter(c => c !== col)
                      : [...settings.joinColumns, col];
                    onSettingsChange({ ...settings, joinColumns: next });
                  }}
                >
                  {col}
                </button>
              ))}
            </div>
            {/* Custom scrollbar styling */}
            <style jsx>{`
              .overflow-y-auto::-webkit-scrollbar {
                width: 8px;
              }
              .overflow-y-auto::-webkit-scrollbar-track {
                background: rgba(241, 245, 249, 0.5);
                border-radius: 4px;
              }
              .overflow-y-auto::-webkit-scrollbar-thumb {
                background: linear-gradient(135deg, #3b82f6, #1d4ed8);
                border-radius: 4px;
                border: 1px solid rgba(59, 130, 246, 0.2);
              }
              .overflow-y-auto::-webkit-scrollbar-thumb:hover {
                background: linear-gradient(135deg, #2563eb, #1e40af);
              }
            `}</style>
          </div>
          {settings.joinColumns.length > 0 && (
            <div className="mt-2 text-sm text-gray-600">
              Selected: {settings.joinColumns.length} of {settings.availableColumns.length} columns
            </div>
          )}
        </div>
        
        {/* Visual Separator */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-200"></div>
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-gradient-to-br from-slate-50 to-blue-50 px-3 text-gray-500 font-medium">Join Configuration</span>
          </div>
        </div>
        
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-3">Join Type</label>
          <div className="grid grid-cols-2 gap-4">
            {/* First row - 2 side by side */}
            <div
              className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${settings.joinType === 'inner' ? 'border-purple-500 bg-purple-50 shadow-md' : 'border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-25'}`}
              onClick={() => onSettingsChange({ ...settings, joinType: 'inner' })}
            >
              <div className="flex flex-col items-center space-y-2">
                <span className="font-medium text-gray-900">Inner Join</span>
                <span className="text-xs text-gray-500 text-center">Only matching rows</span>
              </div>
            </div>
            <div
              className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${settings.joinType === 'outer' ? 'border-purple-500 bg-purple-50 shadow-md' : 'border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-25'}`}
              onClick={() => onSettingsChange({ ...settings, joinType: 'outer' })}
            >
              <div className="flex flex-col items-center space-y-2">
                <span className="font-medium text-gray-900">Outer Join</span>
                <span className="text-xs text-gray-500 text-center">All rows</span>
              </div>
            </div>
            {/* Second row - 2 side by side */}
            <div
              className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${settings.joinType === 'left' ? 'border-purple-500 bg-purple-50 shadow-md' : 'border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-25'}`}
              onClick={() => onSettingsChange({ ...settings, joinType: 'left' })}
            >
              <div className="flex flex-col items-center space-y-2">
                <span className="font-medium text-gray-900">Left Join</span>
                <span className="text-xs text-gray-500 text-center">All from primary</span>
              </div>
            </div>
            <div
              className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${settings.joinType === 'right' ? 'border-purple-500 bg-purple-50 shadow-md' : 'border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-25'}`}
              onClick={() => onSettingsChange({ ...settings, joinType: 'right' })}
            >
              <div className="flex flex-col items-center space-y-2">
                <span className="font-medium text-gray-900">Right Join</span>
                <span className="text-xs text-gray-500 text-center">All from secondary</span>
              </div>
            </div>
          </div>
        </div>
        <div className="pt-4">
          <Button
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 text-base font-medium"
            onClick={onPerformMerge}
          >
            Perform Merge
          </Button>
        </div>
      </div>
    </div>
  );
};

export default MergeOptions; 