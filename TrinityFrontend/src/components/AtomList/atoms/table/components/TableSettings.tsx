import React from 'react';
import { TableSettings as TableSettingsType } from '../TableAtom';

interface TableSettingsProps {
  settings: TableSettingsType;
  onSettingsChange: (settings: Partial<TableSettingsType>) => void;
}

const TableSettings: React.FC<TableSettingsProps> = ({
  settings,
  onSettingsChange
}) => {
  return (
    <div className="p-4 space-y-4 bg-white border-l border-gray-200">
      <h3 className="text-lg font-semibold text-gray-800">Table Settings</h3>

      {/* Display Options */}
      <div className="space-y-2">
        <h4 className="text-sm font-medium text-gray-700">Display Options</h4>

        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={settings.showRowNumbers}
            onChange={(e) => onSettingsChange({ showRowNumbers: e.target.checked })}
            className="rounded text-teal-500 focus:ring-teal-500"
          />
          <span className="text-sm text-gray-700">Show row numbers</span>
        </label>

        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={settings.showSummaryRow}
            onChange={(e) => onSettingsChange({ showSummaryRow: e.target.checked })}
            className="rounded text-teal-500 focus:ring-teal-500"
          />
          <span className="text-sm text-gray-700">Show summary row</span>
        </label>
      </div>

      {/* Row Height */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Row Height: {settings.rowHeight}px
        </label>
        <input
          type="range"
          min="24"
          max="64"
          step="4"
          value={settings.rowHeight}
          onChange={(e) => onSettingsChange({ rowHeight: parseInt(e.target.value) })}
          className="w-full"
        />
      </div>

      {/* Frozen Columns */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Frozen Columns: {settings.frozenColumns}
        </label>
        <input
          type="number"
          min="0"
          max="5"
          value={settings.frozenColumns}
          onChange={(e) => onSettingsChange({ frozenColumns: parseInt(e.target.value) })}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-teal-500 focus:border-teal-500"
        />
      </div>

      {/* Page Size */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">
          Rows per page
        </label>
        <select
          value={settings.pageSize}
          onChange={(e) => onSettingsChange({ pageSize: parseInt(e.target.value), currentPage: 1 })}
          className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-teal-500 focus:border-teal-500"
        >
          <option value="25">25</option>
          <option value="50">50</option>
          <option value="100">100</option>
          <option value="200">200</option>
        </select>
      </div>
    </div>
  );
};

export default TableSettings;





