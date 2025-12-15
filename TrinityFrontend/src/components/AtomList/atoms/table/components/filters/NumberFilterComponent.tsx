import React, { useState, useMemo } from 'react';
import { TableData } from '../../TableAtom';

interface NumberFilterComponentProps {
  column: string;
  data: TableData;
  onApplyFilter: (column: string, filterValue: string[] | [number, number]) => void;
  onClearFilter: (column: string) => void;
  onClose: () => void;
  currentFilter?: string[] | [number, number]; // Current filter values for this column
}

/**
 * Smart number formatting to avoid floating point precision artifacts
 */
function formatNumberForDisplay(num: number): string {
  if (!Number.isFinite(num)) {
    if (isNaN(num)) return 'NaN';
    if (!isFinite(num)) return num > 0 ? 'Infinity' : '-Infinity';
    return num.toString();
  }
  
  if (Number.isInteger(num)) {
    return num.toString();
  }
  
  const absNum = Math.abs(num);
  if (absNum >= 1e15) {
    return num.toExponential(10);
  }
  
  if (absNum < 1e-6 && absNum > 0) {
    return num.toExponential(10);
  }
  
  const highPrecisionStr = num.toFixed(15);
  const trailingNinesMatch = highPrecisionStr.match(/^-?\d+\.(\d*?)(9{6,})0*$/);
  if (trailingNinesMatch) {
    const beforeNines = trailingNinesMatch[1];
    const roundPosition = beforeNines.length + 1;
    
    if (roundPosition <= 15) {
      const multiplier = Math.pow(10, roundPosition);
      const cleanRounded = Math.round(num * multiplier) / multiplier;
      
      let formatted = cleanRounded.toFixed(roundPosition);
      formatted = formatted.replace(/\.?0+$/, '');
      
      const nearestInt = Math.round(cleanRounded);
      if (Math.abs(cleanRounded - nearestInt) < Number.EPSILON * 10) {
        return nearestInt.toString();
      }
      
      return formatted;
    }
  }
  
  return num.toString();
}

const NumberFilterComponent: React.FC<NumberFilterComponentProps> = ({
  column,
  data,
  onApplyFilter,
  onClearFilter,
  onClose,
  currentFilter
}) => {
  const [filterType, setFilterType] = useState<'values' | 'conditions'>('values');
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [conditionType, setConditionType] = useState<string>('equals');
  const [conditionValue1, setConditionValue1] = useState<string>('');
  const [conditionValue2, setConditionValue2] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // Get unique values for this column
  const uniqueValues = useMemo(() => {
    const values = data.rows
      .map(row => Number(row[column]))
      .filter(v => !isNaN(v))
      .sort((a, b) => a - b);
    
    const stringValues = [...new Set(values)].map(v => formatNumberForDisplay(v));
    
    // Check if there are any blank/NaN values
    const hasBlank = data.rows.some(row => {
      const val = row[column];
      return val === null || val === undefined || val === '' ||
             (typeof val === 'string' && val.trim() === '') ||
             (typeof val === 'number' && Number.isNaN(val)) ||
             isNaN(Number(val));
    });
    
    if (hasBlank) {
      return ['(blank)', ...stringValues];
    }
    
    return stringValues;
  }, [data.rows, column]);

  // Update selectedValues when uniqueValues or currentFilter changes
  React.useEffect(() => {
    // Check if currentFilter is a values filter (array of strings/numbers)
    if (currentFilter && Array.isArray(currentFilter) && currentFilter.length > 0) {
      // Check if it's a range filter [min, max] (2 numbers)
      if (currentFilter.length === 2 && typeof currentFilter[0] === 'number' && typeof currentFilter[1] === 'number') {
        // This is a range filter, switch to conditions tab
        setFilterType('conditions');
        // Parse range values for conditions
        setConditionValue1(currentFilter[0].toString());
        setConditionValue2(currentFilter[1].toString());
        setSelectedValues([]);
      } else {
        // Convert filter values to strings and match with uniqueValues
        const filterStrings = currentFilter.map(v => formatNumberForDisplay(Number(v)));
        const validFilterValues = filterStrings.filter(v => uniqueValues.includes(v));
        if (validFilterValues.length > 0) {
          setSelectedValues(validFilterValues);
          setFilterType('values');
        } else {
          // If filter values don't match, select all
          setSelectedValues([...uniqueValues]);
        }
      }
    } else {
      // If no filter, select all by default
      setSelectedValues([...uniqueValues]);
      setFilterType('values');
    }
  }, [uniqueValues, currentFilter]);

  // Get statistics for this column
  const stats = useMemo(() => {
    const values = data.rows
      .map(row => Number(row[column]))
      .filter(v => !isNaN(v));
    if (values.length === 0) return null;
    
    const sorted = values.sort((a, b) => a - b);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    
    return {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      average: avg,
      count: values.length
    };
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

  const handleApplyValuesFilter = () => {
    if (selectedValues.length > 0) {
      // Convert string values back to numbers for filtering
      const numericValues = selectedValues
        .filter(v => v !== '(blank)')
        .map(v => Number(v))
        .filter(v => !isNaN(v));
      
      // Build filter array with both numeric values and blank if selected
      const filterValues: (number | string)[] = [...numericValues];
      if (selectedValues.includes('(blank)')) {
        filterValues.push('(blank)');
      }
      
      if (filterValues.length > 0) {
        onApplyFilter(column, filterValues as any);
      }
    }
    onClose();
  };

  const handleApplyConditionFilter = () => {
    if (!conditionValue1 && !['above_average', 'below_average', 'top_10'].includes(conditionType)) return;
    
    const val1 = Number(conditionValue1);
    const val2 = Number(conditionValue2);
    
    if (isNaN(val1) && !['above_average', 'below_average', 'top_10'].includes(conditionType)) return;
    
    switch (conditionType) {
      case 'equals':
        onApplyFilter(column, [val1, val1]);
        break;
      case 'not_equals':
        onApplyFilter(column, [val1, val1]);
        break;
      case 'greater_than':
        onApplyFilter(column, [val1 + 0.0001, Infinity]);
        break;
      case 'greater_than_equal':
        onApplyFilter(column, [val1, Infinity]);
        break;
      case 'less_than':
        onApplyFilter(column, [-Infinity, val1 - 0.0001]);
        break;
      case 'less_than_equal':
        onApplyFilter(column, [-Infinity, val1]);
        break;
      case 'between':
        if (!isNaN(val2)) {
          onApplyFilter(column, [val1, val2]);
        }
        break;
      case 'above_average':
        if (stats) {
          onApplyFilter(column, [stats.average, Infinity]);
        }
        break;
      case 'below_average':
        if (stats) {
          onApplyFilter(column, [-Infinity, stats.average]);
        }
        break;
      case 'top_10':
        if (stats) {
          const sorted = data.rows
            .map(row => Number(row[column]))
            .filter(v => !isNaN(v))
            .sort((a, b) => b - a);
          const top10Value = sorted[Math.min(9, sorted.length - 1)];
          onApplyFilter(column, [top10Value, Infinity]);
        }
        break;
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
        <h3 className="text-sm font-semibold text-gray-800">Number Filters</h3>
      </div>

      {/* Filter Type Tabs */}
      <div className="flex mb-3">
        <button
          className={`px-3 py-1 text-xs rounded-l border ${
            filterType === 'values' 
              ? 'bg-blue-100 border-blue-300 text-blue-700' 
              : 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100'
          }`}
          onClick={() => setFilterType('values')}
        >
          Values
        </button>
        <button
          className={`px-3 py-1 text-xs rounded-r border-l-0 border ${
            filterType === 'conditions' 
              ? 'bg-blue-100 border-blue-300 text-blue-700' 
              : 'bg-gray-50 border-gray-300 text-gray-600 hover:bg-gray-100'
          }`}
          onClick={() => setFilterType('conditions')}
        >
          Conditions
        </button>
      </div>

      {filterType === 'values' ? (
        /* Values Filter */
        <div>
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
              onClick={handleApplyValuesFilter}
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
      ) : (
        /* Conditions Filter */
        <div>
          {/* Condition Type */}
          <div className="mb-3">
            <select
              value={conditionType}
              onChange={(e) => setConditionType(e.target.value)}
              className="w-full text-xs border border-gray-300 rounded px-2 py-1"
            >
              <option value="equals">Equals</option>
              <option value="not_equals">Does Not Equal</option>
              <option value="greater_than">Greater Than</option>
              <option value="greater_than_equal">Greater Than Or Equal To</option>
              <option value="less_than">Less Than</option>
              <option value="less_than_equal">Less Than Or Equal To</option>
              <option value="between">Between</option>
              <option value="above_average">Above Average</option>
              <option value="below_average">Below Average</option>
              <option value="top_10">Top 10</option>
            </select>
          </div>

          {/* Condition Values */}
          {!['above_average', 'below_average', 'top_10'].includes(conditionType) && (
            <div className="mb-3">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Value"
                  value={conditionValue1}
                  onChange={(e) => setConditionValue1(e.target.value)}
                  className="flex-1 text-xs border border-gray-300 rounded px-2 py-1"
                />
                {conditionType === 'between' && (
                  <>
                    <span className="text-xs text-gray-500">and</span>
                    <input
                      type="number"
                      placeholder="Value"
                      value={conditionValue2}
                      onChange={(e) => setConditionValue2(e.target.value)}
                      className="flex-1 text-xs border border-gray-300 rounded px-2 py-1"
                    />
                  </>
                )}
              </div>
            </div>
          )}

          {/* Statistics Info */}
          {stats && ['above_average', 'below_average', 'top_10'].includes(conditionType) && (
            <div className="mb-3 p-2 bg-gray-50 rounded text-xs">
              <div>Min: {stats.min}</div>
              <div>Max: {stats.max}</div>
              <div>Average: {stats.average.toFixed(2)}</div>
              <div>Count: {stats.count}</div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              className="px-3 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white flex-1"
              onClick={handleApplyConditionFilter}
              disabled={!conditionValue1 && !['above_average', 'below_average', 'top_10'].includes(conditionType)}
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
      )}
    </div>
  );
};

export default NumberFilterComponent;



