import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowDown, ArrowRight } from 'lucide-react';

interface ConcatOptionsProps {
  settings: {
    file1: string;
    file2: string;
    direction: string;
    performConcat: boolean;
  };
  onSettingsChange: (settings: any) => void;
  onPerformConcat?: () => void;
}

const ConcatOptions: React.FC<ConcatOptionsProps> = ({ settings, onSettingsChange, onPerformConcat }) => {
  return (
    <div className="w-full h-full p-6 bg-gradient-to-br from-slate-50 to-blue-50 overflow-y-auto">
      <div className="mb-6">
        <h4 className="text-lg font-semibold text-gray-900 mb-4">Concatenation Options</h4>
      </div>
      
      <div className="space-y-6">
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-3">Direction</label>
          <div className="grid grid-cols-2 gap-4">
            <div 
              className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                settings.direction === 'vertical' 
                  ? 'border-purple-500 bg-purple-50 shadow-md' 
                  : 'border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-25'
              }`}
              onClick={() => onSettingsChange({ ...settings, direction: 'vertical' })}
            >
              <div className="flex flex-col items-center space-y-2">
                <ArrowDown className="w-6 h-6 text-purple-600" />
                <span className="font-medium text-gray-900">Vertical</span>
                <span className="text-xs text-gray-500 text-center">Stack rows on top of each other</span>
              </div>
            </div>
            
            <div 
              className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 ${
                settings.direction === 'horizontal' 
                  ? 'border-purple-500 bg-purple-50 shadow-md' 
                  : 'border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-25'
              }`}
              onClick={() => onSettingsChange({ ...settings, direction: 'horizontal' })}
            >
              <div className="flex flex-col items-center space-y-2">
                <ArrowRight className="w-6 h-6 text-purple-600" />
                <span className="font-medium text-gray-900">Horizontal</span>
                <span className="text-xs text-gray-500 text-center">Combine columns side by side</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="pt-4">
          <Button 
            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 text-base font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
            onClick={onPerformConcat}
            disabled={!settings.file1 || !settings.file2 || !settings.direction}
          >
            Perform Concatenate
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ConcatOptions; 