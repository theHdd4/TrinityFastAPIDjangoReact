import React from 'react';
import { Save, RefreshCw, Download, Settings } from 'lucide-react';

interface TableToolbarProps {
  onSave: () => void;
  onRefresh: () => void;
  saving?: boolean;
  hasData: boolean;
}

const TableToolbar: React.FC<TableToolbarProps> = ({
  onSave,
  onRefresh,
  saving = false,
  hasData
}) => {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
      {/* Left side - Title */}
      <div className="flex items-center space-x-2">
        <h3 className="text-sm font-semibold text-gray-700">Table View</h3>
      </div>

      {/* Right side - Actions */}
      <div className="flex items-center space-x-2">
        {/* Refresh button */}
        <button
          onClick={onRefresh}
          disabled={!hasData}
          className="flex items-center space-x-1 px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Refresh data"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh</span>
        </button>

        {/* Save button */}
        <button
          onClick={onSave}
          disabled={!hasData || saving}
          className="flex items-center space-x-1 px-3 py-1.5 text-sm text-white bg-teal-500 rounded hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Save table"
        >
          <Save className={`w-4 h-4 ${saving ? 'animate-pulse' : ''}`} />
          <span>{saving ? 'Saving...' : 'Save'}</span>
        </button>

        {/* Export button - placeholder for future */}
        <button
          disabled={!hasData}
          className="flex items-center space-x-1 px-3 py-1.5 text-sm text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Export (coming soon)"
        >
          <Download className="w-4 h-4" />
          <span>Export</span>
        </button>
      </div>
    </div>
  );
};

export default TableToolbar;



