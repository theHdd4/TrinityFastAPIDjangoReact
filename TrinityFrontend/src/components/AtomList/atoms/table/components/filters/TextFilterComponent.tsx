import React, { useState, useMemo } from 'react';
import { TableData } from '../../TableAtom';

interface TextFilterComponentProps {
  column: string;
  data: TableData;
  onApplyFilter: (column: string, filterValue: string[] | [number, number]) => void;
  onClearFilter: (column: string) => void;
  onClose: () => void;
}

function safeToString(val: any): string {
  if (val === undefined || val === null) return '';
  if (typeof val === 'number') {
    if (isNaN(val)) return 'NaN';
    if (!isFinite(val)) return val > 0 ? 'Infinity' : '-Infinity';
    return val.toString();
  }
  try {
    return val.toString();
  } catch {
    return '';
  }
}

const TextFilterComponent: React.FC<TextFilterComponentProps> = ({
  column,
  data,
  onApplyFilter,
  onClearFilter,
  onClose
}) => {
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Get unique values for this column
  const uniqueValues = useMemo(() => {
    const values = data.rows
      .map(row => safeToString(row[column]))
      .filter(v => v !== '');
    
    const unique = [...new Set(values)].sort();
    
    // Check if there are any blank values
    const hasBlank = data.rows.some(row => {
      const val = row[column];
      return val === null || val === undefined || val === '' ||
             (typeof val === 'string' && val.trim() === '');
    });
    
    if (hasBlank) {
      return ['(blank)', ...unique];
    }
    
    return unique;
  }, [data.rows, column]);

  // Filter values based on search term
  const filteredValues = useMemo(() => {
    if (!searchTerm) return uniqueValues;
    return uniqueValues.filter(value => 
      value.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [uniqueValues, searchTerm]);

  const handleValueToggle = (value: string) => {
    setSelectedValues(prev => 
      prev.includes(value) 
        ? prev.filter(v => v !== value)
        : [...prev, value]
    );
  };

  const handleSelectAll = () => {
    setSelectedValues(filteredValues);
  };

  const handleDeselectAll = () => {
    setSelectedValues([]);
  };

  const handleApplyFilter = () => {
    if (selectedValues.length > 0) {
      onApplyFilter(column, selectedValues);
    }
    onClose();
  };

  const handleClearFilter = () => {
    onClearFilter(column);
    onClose();
  };

  const allSelected = filteredValues.length > 0 && filteredValues.every(v => selectedValues.includes(v));
  const someSelected = selectedValues.some(v => filteredValues.includes(v));

  return (
    <div className="w-80" onMouseDown={e => e.stopPropagation()}>
      {/* Header */}
      <div className="border-b border-gray-200 pb-2 mb-3">
        <h3 className="text-sm font-semibold text-gray-800">Text Filter</h3>
      </div>

      {/* Search */}
      <div className="mb-3">
        <input
          type="text"
          placeholder="Search values..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full text-xs border border-gray-300 rounded px-2 py-1"
        />
      </div>

      {/* Select All */}
      <div className="border-b border-gray-200 pb-2 mb-2">
        <label className="flex items-center space-x-2 text-xs cursor-pointer font-medium">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(input) => {
              if (input) input.indeterminate = someSelected && !allSelected;
            }}
            onChange={() => allSelected ? handleDeselectAll() : handleSelectAll()}
            className="rounded"
          />
          <span className="truncate font-semibold">
            {allSelected ? 'Deselect All' : 'Select All'}
          </span>
        </label>
      </div>

      {/* Values List */}
      <div className="max-h-48 overflow-y-auto space-y-1 mb-3">
        {filteredValues.map((value) => (
          <label key={value} className="flex items-center space-x-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={selectedValues.includes(value)}
              onChange={() => handleValueToggle(value)}
              className="rounded"
            />
            <span className="truncate">{value}</span>
          </label>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          className="px-3 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white flex-1"
          onClick={handleApplyFilter}
          disabled={selectedValues.length === 0}
        >
          Apply
        </button>
        <button
          className="px-3 py-1 text-xs rounded bg-blue-500 hover:bg-blue-600 text-white flex-1"
          onClick={handleClearFilter}
        >
          Clear
        </button>
      </div>
    </div>
  );
};

export default TextFilterComponent;

