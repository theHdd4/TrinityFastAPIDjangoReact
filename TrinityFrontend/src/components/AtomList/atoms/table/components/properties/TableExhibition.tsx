import React from 'react';
import { Card } from '@/components/ui/card';
import { Download, Share2 } from 'lucide-react';

interface Props {
  atomId: string;
}

const TableExhibition: React.FC<Props> = ({ atomId }) => {
  return (
    <div className="space-y-4 p-4">
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-gray-800 mb-3">Export Options</h3>
        <p className="text-xs text-gray-500 mb-4">
          Export and share your table data
        </p>

        <div className="space-y-2">
          <button
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            disabled
          >
            <Download className="w-4 h-4" />
            <span>Export to CSV (Coming Soon)</span>
          </button>

          <button
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            disabled
          >
            <Download className="w-4 h-4" />
            <span>Export to Excel (Coming Soon)</span>
          </button>

          <button
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            disabled
          >
            <Share2 className="w-4 h-4" />
            <span>Share Table (Coming Soon)</span>
          </button>
        </div>
      </Card>
    </div>
  );
};

export default TableExhibition;


