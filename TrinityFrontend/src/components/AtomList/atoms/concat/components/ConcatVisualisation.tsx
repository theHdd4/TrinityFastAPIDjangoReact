import React from 'react';
import { Card } from '@/components/ui/card';

interface ConcatVisualisationProps {
  settings: any;
}

const ConcatVisualisation: React.FC<ConcatVisualisationProps> = ({ settings }) => {
  return (
    <div className="w-full h-full p-6 bg-gradient-to-br from-slate-50 to-blue-50 overflow-y-auto">
      <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm overflow-hidden">
        <div className="bg-gradient-to-r from-yellow-400 to-orange-500 p-1">
          <div className="bg-white rounded-sm">
            <div className="p-6">
              <div className="flex items-center mb-4">
                <div className="w-1 h-8 bg-gradient-to-b from-yellow-400 to-orange-500 rounded-full mr-4"></div>
                <h3 className="text-xl font-bold text-gray-900">Concatenation Visualization</h3>
              </div>
              <div className="bg-gray-50 p-6 rounded text-base text-gray-700 text-center">
                Visualization settings will appear here when concatenation is performed.
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default ConcatVisualisation;