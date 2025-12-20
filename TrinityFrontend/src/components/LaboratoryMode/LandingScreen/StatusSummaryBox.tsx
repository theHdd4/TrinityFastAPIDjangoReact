import React from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import type { StatusSummaryProps } from './types';

export const StatusSummaryBox: React.FC<StatusSummaryProps> = ({
  primedCount,
  unprimedCount,
  totalCount,
}) => {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {primedCount > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-700">
                <span className="font-semibold text-green-700">{primedCount}</span> dataset{primedCount !== 1 ? 's' : ''} primed
              </span>
            </div>
          )}
          {unprimedCount > 0 && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500 flex-shrink-0" />
              <span className="text-sm font-medium text-gray-700">
                <span className="font-semibold text-red-700">{unprimedCount}</span> dataset{unprimedCount !== 1 ? 's' : ''} require{unprimedCount === 1 ? 's' : ''} priming
              </span>
            </div>
          )}
        </div>
        {totalCount > 0 && (
          <div className="text-xs text-gray-500">
            {totalCount} total dataset{totalCount !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
};



