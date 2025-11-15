import React, { useState, useMemo, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { 
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/components/ui/pagination';
import {
  Upload, Download, Search, Filter, ArrowUpDown, Pin, Palette, Trash2, Plus, 
  GripVertical, RotateCcw, FileText, Check, AlertCircle, Info, Edit2,
  ChevronDown, ChevronUp, X, PlusCircle, MinusCircle, Save, Replace,
  AlignLeft, AlignCenter, AlignRight, Grid3x3
} from 'lucide-react';
import { DataFrameData, DataFrameSettings } from '../DataFrameOperationsAtom';
import {
  DATAFRAME_OPERATIONS_API,
  VALIDATE_API,
  PIVOT_API,
} from '@/lib/api';
import {
  loadDataframe,
  editCell as apiEditCell,
  insertRow as apiInsertRow,
  deleteRow as apiDeleteRow,
  deleteRowsBulk as apiDeleteRowsBulk,
  insertColumn as apiInsertColumn,
  deleteColumn as apiDeleteColumn,
  sortDataframe as apiSort,
  filterRows as apiFilter,
  renameColumn as apiRenameColumn,
  duplicateRow as apiDuplicateRow,
  duplicateColumn as apiDuplicateColumn,
  moveColumn as apiMoveColumn,
  retypeColumn as apiRetypeColumn,
  roundColumn as apiRoundColumn,
  applyFormula as apiApplyFormula,
  loadDataframeByKey,
  describeColumn as apiDescribeColumn,
  transformColumnCase as apiTransformColumnCase,
  findAndReplace as apiFindAndReplace,
  countMatches as apiCountMatches,
} from '../services/dataframeOperationsApi';
import { toast } from '@/components/ui/use-toast';
import '@/templates/tables/table.css';
import FormularBar from './FormularBar';
import CollapsibleFormulaBar from './CollapsibleFormulaBar';
import DataFrameCardinalityView from './DataFrameCardinalityView';
import LoadingAnimation from '@/templates/LoadingAnimation/LoadingAnimation';
import {
  PivotTableSettings as PivotSettings,
  DEFAULT_PIVOT_TABLE_SETTINGS,
} from '@/components/LaboratoryMode/store/laboratoryStore';
import PivotTableCanvas from '@/components/AtomList/atoms/pivot-table/components/PivotTableCanvas';

interface DataFrameOperationsCanvasProps {
  atomId: string;
  data: DataFrameData | null;
  settings: DataFrameSettings;
  onSettingsChange: (settings: Partial<DataFrameSettings>) => void;
  onDataUpload: (data: DataFrameData, backendFileId?: string) => void;
  onDataChange: (data: DataFrameData) => void;
  onClearAll: () => void;
  fileId?: string | null;
  originalData?: DataFrameData | null;
}

type UndoSnapshot = {
  data: DataFrameData;
  columnFormulas: Record<string, string>;
  selectedColumn: string | null;
};

interface NumberFilterComponentProps {
  column: string;
  data: DataFrameData;
  onApplyFilter: (column: string, filterValue: string[] | [number, number]) => void;
  onClearFilter: (column: string) => void;
  onClose: () => void;
}

function safeToString(val: any): string {
  if (val === undefined || val === null) return '';
  try {
    return val.toString();
  } catch {/* empty */
    return '';
  }
}

const NumberFilterComponent: React.FC<NumberFilterComponentProps> = ({
  column,
  data,
  onApplyFilter,
  onClearFilter,
  onClose
}) => {
  const [filterType, setFilterType] = useState<'values' | 'conditions'>('values');
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [conditionType, setConditionType] = useState<string>('equals');
  const [conditionValue1, setConditionValue1] = useState<string>('');
  const [conditionValue2, setConditionValue2] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showCustomFilter, setShowCustomFilter] = useState<boolean>(false);

  // Get unique values for this column
  const uniqueValues = useMemo(() => {
    const values = data.rows
      .map(row => Number(row[column]))
      .filter(v => !isNaN(v))
      .sort((a, b) => a - b);
    
    const stringValues = [...new Set(values)].map(v => v.toString());
    
    // Check if there are any blank/NaN values
    const hasBlank = data.rows.some(row => {
      const val = row[column];
      return val === null || val === undefined || val === '' ||
             (typeof val === 'string' && val.trim() === '') ||
             (typeof val === 'number' && Number.isNaN(val)) ||
             isNaN(Number(val));
    });
    
    // Add "(blank)" option if there are blanks
    if (hasBlank) {
      return ['(blank)', ...stringValues];
    }
    
    return stringValues;
  }, [data.rows, column]);

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
      onApplyFilter(column, selectedValues);
    }
    onClose();
  };

  const handleApplyConditionFilter = () => {
    if (!conditionValue1 && !['above_average', 'below_average', 'top_10'].includes(conditionType)) return;
    
    const val1 = Number(conditionValue1);
    const val2 = Number(conditionValue2);
    
    if (isNaN(val1) && !['above_average', 'below_average', 'top_10'].includes(conditionType)) return;
    
    let filterValue: [number, number] | string[];
    
    switch (conditionType) {
      case 'equals':
        onApplyFilter(column, [val1, val1]);
        break;
      case 'not_equals':
        // For not equals, we'll need to handle this differently in the filter logic
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

          {/* Action Buttons - Excel-like (Apply/Clear) */}
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

          {/* Action Buttons - Excel-like (Apply/Clear) */}
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

      {/* No separate footer clear; use inline Apply/Clear buttons */}
    </div>
  );
};

// Debounce function
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

function highlightMatch(text: string, search: string) {
  if (!search) return text;
  const idx = text.toLowerCase().indexOf(search.toLowerCase());
  if (idx === -1) return text;
  return <>
    {text.slice(0, idx)}
    <span style={{ background: '#bbf7d0', color: '#166534', borderRadius: 2 }}>{text.slice(idx, idx + search.length)}</span>
    {text.slice(idx + search.length)}
  </>;
}

const areFormulaMapsEqual = (a: Record<string, string>, b: Record<string, string>) => {
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) {
    return false;
  }
  return aKeys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && b[key] === a[key]);
};

const shallowEqualArray = (a?: string[], b?: string[]) => {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

// Helper to generate a unique valid column key
function getNextColKey(headers: string[]): string {
  let idx = 1;
  let key = `col_${idx}`;
  while (headers.includes(key)) {
    idx++;
    key = `col_${idx}`;
  }
  return key;
}

// Generic error handler for API operations
function handleApiError(action: string, err: unknown) {
  console.error(`[DataFrameOperations] ${action}:`, err);
  toast({
    title: action,
    description: err instanceof Error ? err.message : String(err),
    variant: 'destructive',
  });
}

const CONTEXT_MENU_PADDING = 8;

const DataFrameOperationsCanvas: React.FC<DataFrameOperationsCanvasProps> = ({
  atomId,
  data,
  settings,
  onSettingsChange,
  onDataUpload,
  onDataChange,
  onClearAll,
  fileId,
  originalData
}) => {
  const [currentPage, setCurrentPage] = useState(1);

  const [editingCell, setEditingCell] = useState<{row: number, col: string} | null>(null);
  const [editingHeader, setEditingHeader] = useState<number | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [draggedCol, setDraggedCol] = useState<string | null>(null);
  const [targetPosition, setTargetPosition] = useState<number | null>(null);
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  // 1. Add state for selected cell and selected column
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: string } | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const [formulaInput, setFormulaInput] = useState('');
  const [isEditingFormula, setIsEditingFormula] = useState(false);
  const editingSessionRef = useRef(false);
  const setEditingState = useCallback((next: boolean) => {
    editingSessionRef.current = next;
    setIsEditingFormula(next);
  }, []);
  const [columnFormulas, setColumnFormulas] = useState<Record<string, string>>(settings.columnFormulas || {});
  const settingsColumnFormulasRef = useRef<Record<string, string>>(settings.columnFormulas || {});
  const [formulaValidationError, setFormulaValidationError] = useState<string | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [forceRefresh, setForceRefresh] = useState(0);
  const [isProcessingOperation, setIsProcessingOperation] = useState(false);
  const operationQueueRef = useRef<Array<() => Promise<void>>>([]);
  const [cellAlignment, setCellAlignment] = useState<'left' | 'center' | 'right'>('left');
  const [columnAlignments, setColumnAlignments] = useState<Record<string, 'left' | 'center' | 'right'>>({});
  const headersKey = useMemo(() => (data?.headers || []).join('|'), [data?.headers]);

  // Helper function to get alignment for a column
  const getColumnAlignment = (column: string): 'left' | 'center' | 'right' => {
    return columnAlignments[column] || cellAlignment;
  };

  // Function to process operations sequentially
  const processOperationQueue = useCallback(async () => {
    if (isProcessingOperation || operationQueueRef.current.length === 0) {
      return;
    }
    
    setIsProcessingOperation(true);
    
    while (operationQueueRef.current.length > 0) {
      const operation = operationQueueRef.current.shift();
      if (operation) {
        try {
          await operation();
          // Add a small delay between operations to ensure proper sequencing
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error) {
          console.error('Operation failed:', error);
        }
      }
    }
    
    setIsProcessingOperation(false);
  }, [isProcessingOperation]);

  // Function to add operation to queue
  const queueOperation = useCallback((operation: () => Promise<void>) => {
    operationQueueRef.current.push(operation);
    processOperationQueue();
  }, [processOperationQueue]);

  // Debounced data update to prevent conflicts
  const debouncedDataUpdate = useCallback(
    debounce((newData: DataFrameData) => {
      onDataChange(newData);
    }, 100),
    [onDataChange]
  );

  // Function to show error with auto-dismiss
  const showValidationError = (error: string | null) => {
    // Clear existing timeout
    if (errorTimeoutRef.current) {
      clearTimeout(errorTimeoutRef.current);
    }
    
    setFormulaValidationError(error);
    
    // Auto-dismiss after 3 seconds if error is shown
    if (error) {
      errorTimeoutRef.current = setTimeout(() => {
        setFormulaValidationError(null);
      }, 3000);
    }
  };


  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) {
        clearTimeout(errorTimeoutRef.current);
      }
    };
  }, []);
  const [isFormulaMode, setIsFormulaMode] = useState(false); // Start with formula bar disabled
  const [isFormulaBarFrozen, setIsFormulaBarFrozen] = useState(false); // Track if formula bar should be frozen after application
  const [openDropdown, setOpenDropdown] = useState<null | 'insert' | 'delete' | 'sort' | 'filter' | 'operation' | 'round'>(null);
  const [convertSubmenuOpen, setConvertSubmenuOpen] = useState(false);
  const [caseSubmenuOpen, setCaseSubmenuOpen] = useState(false);
  const [roundDecimalPlaces, setRoundDecimalPlaces] = useState(2);
  const [unhideSubmenuOpen, setUnhideSubmenuOpen] = useState(false);
  const [selectedHiddenColumns, setSelectedHiddenColumns] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    pointerX: number;
    pointerY: number;
    x: number;
    y: number;
    col: string;
    colIdx: number;
  } | null>(null);
  const [describeModal, setDescribeModal] = useState<{
    isOpen: boolean;
    column: string;
    data: any;
  }>({
    isOpen: false,
    column: '',
    data: null,
  });
  const [multiSelectedColumns, setMultiSelectedColumns] = useState<Set<string>>(new Set());
  const [multiSelectedRows, setMultiSelectedRows] = useState<Set<number>>(new Set());
  const [selectAllRows, setSelectAllRows] = useState(false);
  const [insertMenuOpen, setInsertMenuOpen] = useState(false);
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false);
  // Track permanently deleted rows across filter changes
  const [permanentlyDeletedRows, setPermanentlyDeletedRows] = useState<Set<number>>(new Set());
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    isOpen: boolean;
    columnsToDelete: string[];
  }>({
    isOpen: false,
    columnsToDelete: [],
  });
  const [rowDeleteConfirmModal, setRowDeleteConfirmModal] = useState<{
    isOpen: boolean;
    rowsToDelete: number[];
  }>({
    isOpen: false,
    rowsToDelete: [],
  });

  const pivotSettings = useMemo<PivotSettings>(() => ({
        ...DEFAULT_PIVOT_TABLE_SETTINGS,
    ...(settings.pivotSettings || {}),
  }), [settings.pivotSettings]);

  const [activeTab, setActiveTab] = useState<'dataframe' | 'pivot'>('dataframe');
  const [pivotIsComputing, setPivotIsComputing] = useState(false);
  const [pivotComputeError, setPivotComputeError] = useState<string | null>(null);
  const [pivotManualRefreshToken, setPivotManualRefreshToken] = useState(0);
  const [pivotIsSaving, setPivotIsSaving] = useState(false);
  const [pivotSaveError, setPivotSaveError] = useState<string | null>(null);
  const [pivotSaveMessage, setPivotSaveMessage] = useState<string | null>(null);
  const [showPivotSaveModal, setShowPivotSaveModal] = useState(false);
  const [pivotSaveFileName, setPivotSaveFileName] = useState('');

  const pivotSettingsRef = useRef(pivotSettings);
  useEffect(() => {
    pivotSettingsRef.current = pivotSettings;
  }, [pivotSettings]);

  useEffect(() => {
    return () => {
      if (headerClickTimeoutRef.current) {
        clearTimeout(headerClickTimeoutRef.current);
      }
    };
  }, []);

  // Track if this is the initial load to preserve restored data from MongoDB
  const isInitialLoadRef = useRef(true);
  const lastComputedSignatureRef = useRef<string | null>(null);

  const updatePivotSettings = useCallback(
    (partial: Partial<PivotSettings>) => {
      // Use pivotSettingsRef.current to get the latest values, not the potentially stale pivotSettings from useMemo
      const currentSettings = pivotSettingsRef.current;
      onSettingsChange({
        pivotSettings: {
          ...currentSettings,
          ...partial,
        },
      });
    },
    [onSettingsChange],
  );

  const updatePivotSettingsRef = useRef(updatePivotSettings);
  useEffect(() => {
    updatePivotSettingsRef.current = updatePivotSettings;
  }, [updatePivotSettings]);

  useEffect(() => {
    const optionsMap = pivotSettings.pivotFilterOptions ?? {};
    const selectionsMap = pivotSettings.pivotFilterSelections ?? {};
    let updated = false;
    const nextSelections: Record<string, string[]> = { ...selectionsMap };

    const normalize = (field: string) => field.toLowerCase();

    pivotSettings.filterFields.forEach((field) => {
      const key = normalize(field);
      const options = optionsMap[field] ?? optionsMap[key] ?? [];
      const existing = selectionsMap[field] ?? selectionsMap[key];

      const shouldSync =
        !existing ||
        (existing.length === 0 && options.length > 0);

      if (shouldSync) {
        const next = options.slice();
        if (!shallowEqualArray(existing, next)) {
          nextSelections[field] = next;
          nextSelections[key] = next;
          updated = true;
        }
      }
    });

    Object.keys(nextSelections).forEach((key) => {
      const canonicalField = pivotSettings.filterFields.find(
        (field) => key === field || key === field.toLowerCase(),
      );
      if (!canonicalField) {
        delete nextSelections[key];
        updated = true;
      }
    });

    if (updated) {
      updatePivotSettingsRef.current({ pivotFilterSelections: nextSelections });
    }
  }, [pivotSettings.filterFields, pivotSettings.pivotFilterOptions]);

  const pivotComputeSignature = useMemo(() => {
    const selectionsSnapshot = pivotSettings.filterFields.reduce<Record<string, string[]>>((acc, field) => {
        const key = field.toLowerCase();
        const selection =
          pivotSettings.pivotFilterSelections?.[field] ??
          pivotSettings.pivotFilterSelections?.[key];
        if (selection) {
          acc[field] = [...selection].sort();
        }
        return acc;
    }, {});
    const payload = {
      dataSource: pivotSettings.dataSource,
      rows: pivotSettings.rowFields,
      columns: pivotSettings.columnFields,
      values: pivotSettings.valueFields,
      filters: pivotSettings.filterFields,
      selections: selectionsSnapshot,
      grandTotals: pivotSettings.grandTotalsMode,
    };
    return JSON.stringify(payload);
  }, [
    pivotSettings.dataSource,
    pivotSettings.rowFields,
    pivotSettings.columnFields,
    pivotSettings.valueFields,
    pivotSettings.filterFields,
    pivotSettings.pivotFilterSelections,
    pivotSettings.grandTotalsMode,
  ]);

  // Removed Redis cache loading - pivot data now comes from MongoDB (via settings) or gets computed fresh
  // The pivot settings (including results) are restored from MongoDB when the atom loads
  // If no results exist, the compute useEffect will handle fresh computation

  useEffect(() => {
    setPivotSaveMessage(null);
    setPivotSaveError(null);

    const latestSettings = pivotSettingsRef.current;

    const readyForCompute =
      !!latestSettings.dataSource &&
      Array.isArray(latestSettings.valueFields) &&
      latestSettings.valueFields.length > 0;

    if (!readyForCompute) {
      setPivotIsComputing(false);
      setPivotComputeError(null);
      return;
    }

    // Check if we already have valid pivot results from MongoDB (restored session)
    // On initial load: if we have restored results, skip computation to preserve them
    // On subsequent runs: if signature changed or refresh requested, recompute (handled by dependencies)
    const hasValidResults = latestSettings.pivotResults &&
                            Array.isArray(latestSettings.pivotResults) &&
                            latestSettings.pivotResults.length > 0;

    const isInitialLoad = isInitialLoadRef.current;
    const signatureChanged = lastComputedSignatureRef.current !== pivotComputeSignature;

    // Only skip computation on initial load if we have valid restored results
    // If signature changed or refresh was requested, we should recompute
    if (isInitialLoad && hasValidResults && latestSettings.pivotStatus !== 'failed' && !signatureChanged) {
      // Initial load with valid restored data from MongoDB, skip computation
      console.log('[Pivot Compute] Initial load: Valid results found from MongoDB, skipping computation. Rows:', latestSettings.pivotResults.length);
      isInitialLoadRef.current = false;
      lastComputedSignatureRef.current = pivotComputeSignature;
      setPivotIsComputing(false);
      setPivotComputeError(latestSettings.pivotError || null);
      return;
    }

    // Mark that we're past initial load
    isInitialLoadRef.current = false;

    const controller = new AbortController();

    const runCompute = async () => {
      setPivotIsComputing(true);
      setPivotComputeError(null);
      updatePivotSettingsRef.current({
        pivotStatus: 'pending',
        pivotError: null,
      });

      try {
        const payload = {
          data_source: latestSettings.dataSource,
          rows: latestSettings.rowFields.filter(Boolean),
          columns: latestSettings.columnFields.filter(Boolean),
          values: latestSettings.valueFields
            .filter((item) => item?.field)
            .map((item) => ({
              field: item.field,
              aggregation: item.aggregation || 'sum',
            })),
          filters: latestSettings.filterFields.filter(Boolean).map((field) => {
              const key = field.toLowerCase();
              const selections =
              latestSettings.pivotFilterSelections?.[field] ??
              latestSettings.pivotFilterSelections?.[key] ?? [];
              const options =
              latestSettings.pivotFilterOptions?.[field] ??
              latestSettings.pivotFilterOptions?.[key] ?? [];

              const includeValues =
                selections.length > 0 && selections.length !== options.length
                  ? selections
                  : undefined;

            return includeValues
              ? { field, include: includeValues }
              : { field };
            }),
          grand_totals: latestSettings.grandTotalsMode || 'off',
        };

        const computeUrl = `${PIVOT_API}/${encodeURIComponent(atomId)}/compute`;
        console.log('[Pivot Compute] Computing with atomId:', atomId, 'URL:', computeUrl);
        const response = await fetch(
          computeUrl,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            signal: controller.signal,
          }
        );

        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `Pivot compute failed (${response.status})`);
        }

        const result = await response.json();
        console.log('[Pivot Compute] Compute completed successfully, data rows:', result?.data?.length || 0);
        
        // Removed Redis cache verification - data persistence is handled through MongoDB
        updatePivotSettingsRef.current({
          pivotResults: result?.data ?? [],
          pivotStatus: result?.status ?? 'success',
          pivotError: null,
          pivotUpdatedAt: result?.updated_at,
          pivotRowCount: result?.rows,
          pivotHierarchy: Array.isArray(result?.hierarchy) ? result.hierarchy : [],
          pivotColumnHierarchy: Array.isArray(result?.column_hierarchy)
            ? result.column_hierarchy
            : [],
          collapsedKeys: [],
        });
        // Track the signature that was used for this computation
        lastComputedSignatureRef.current = pivotComputeSignature;
        setPivotIsComputing(false);
        setPivotComputeError(null);
      } catch (error) {
        if ((error as any)?.name === 'AbortError') {
          return;
        }
        const message =
          error instanceof Error
            ? error.message
            : 'Pivot computation failed. Please try again.';
        setPivotIsComputing(false);
        setPivotComputeError(message);
        updatePivotSettingsRef.current({
          pivotStatus: 'failed',
          pivotError: message,
        });
      }
    };

    runCompute();

    return () => {
      controller.abort();
    };
  }, [atomId, pivotComputeSignature, pivotManualRefreshToken]);

  const handlePivotRefresh = useCallback(() => {
    setPivotManualRefreshToken((prev) => prev + 1);
  }, []);

  const handlePivotSave = useCallback(async () => {
    const latestSettings = pivotSettingsRef.current;
    if (!latestSettings.dataSource) {
      setPivotSaveError('No data source selected. Please configure the pivot table first.');
      return;
    }
    if (!(latestSettings.pivotResults?.length ?? 0)) {
      setPivotSaveError('No pivot data available. Please compute the pivot table first.');
      return;
    }
    if (pivotIsComputing) {
      setPivotSaveError('Please wait for the pivot table computation to complete.');
      return;
    }
    
    setPivotIsSaving(true);
    setPivotSaveError(null);
    setPivotSaveMessage(null);
    try {
      // Save without filename to overwrite existing file
      const saveUrl = `${PIVOT_API}/${encodeURIComponent(atomId)}/save`;
      console.log('[Pivot Save] Attempting to save with atomId:', atomId, 'URL:', saveUrl);
      const response = await fetch(
        saveUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        }
      );
      if (!response.ok) {
        const text = await response.text();
        let errorMessage = text || `Pivot save failed (${response.status})`;
        
        // Parse JSON error if available
        try {
          const errorJson = JSON.parse(text);
          if (errorJson.detail) {
            errorMessage = errorJson.detail;
          }
        } catch {
          // Not JSON, use text as-is
        }
        
        console.error('[Pivot Save] Save failed:', {
          atomId,
          status: response.status,
          errorMessage,
        });
        
        // Provide more helpful error message if data is not available
        if (response.status === 404) {
          if (errorMessage.includes('No pivot data available') || errorMessage.includes('not found')) {
            errorMessage = `No pivot data available to save for atomId: ${atomId}. The pivot table may not have finished computing, or the data may have expired. Please click Refresh to recompute the pivot table.`;
          }
        }
        
        throw new Error(errorMessage);
      }
      const result = await response.json();
      const message = result?.object_name
        ? `Saved pivot to ${result.object_name}`
        : 'Pivot table saved successfully';
      setPivotSaveMessage(message);
      updatePivotSettingsRef.current({
        pivotLastSavedPath: result?.object_name ?? null,
        pivotLastSavedAt: result?.updated_at ?? null,
      });
        } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to save pivot table. Please try again.';
      setPivotSaveError(message);
    } finally {
      setPivotIsSaving(false);
    }
  }, [atomId, pivotIsComputing]);

  const handlePivotSaveAs = useCallback(() => {
    const latestSettings = pivotSettingsRef.current;
    if (!latestSettings.dataSource) {
      setPivotSaveError('No data source selected. Please configure the pivot table first.');
      return;
    }
    if (!(latestSettings.pivotResults?.length ?? 0)) {
      setPivotSaveError('No pivot data available. Please compute the pivot table first.');
      return;
    }
    
    // Generate default filename
    const baseName = latestSettings.dataSource ? latestSettings.dataSource.split('/').pop()?.replace(/\.[^/.]+$/, '') : 'pivot';
    const defaultFilename = `PIVOT_${Date.now()}_${baseName}`;
    setPivotSaveFileName(defaultFilename);
    setShowPivotSaveModal(true);
    setPivotSaveError(null);
  }, []);

  const confirmPivotSaveAs = useCallback(async () => {
    const latestSettings = pivotSettingsRef.current;
    if (!latestSettings.dataSource) {
      setPivotSaveError('No data source selected. Please configure the pivot table first.');
      return;
    }
    if (!(latestSettings.pivotResults?.length ?? 0)) {
      setPivotSaveError('No pivot data available. Please compute the pivot table first.');
      return;
    }
    if (pivotIsComputing) {
      setPivotSaveError('Please wait for the pivot table computation to complete.');
      return;
    }
    if (!pivotSaveFileName.trim()) {
      setPivotSaveError('Please enter a file name.');
      return;
    }
    
    setPivotIsSaving(true);
    setPivotSaveError(null);
    setPivotSaveMessage(null);
    try {
      const saveUrl = `${PIVOT_API}/${encodeURIComponent(atomId)}/save`;
      const filename = pivotSaveFileName.trim().endsWith('.arrow') 
        ? pivotSaveFileName.trim() 
        : `${pivotSaveFileName.trim()}.arrow`;
      
      console.log('[Pivot Save As] Attempting to save with atomId:', atomId, 'filename:', filename, 'URL:', saveUrl);
      const response = await fetch(
        saveUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename }),
        }
      );
      
      if (!response.ok) {
        const text = await response.text();
        let errorMessage = text || `Pivot save failed (${response.status})`;
        
        try {
          const errorJson = JSON.parse(text);
          if (errorJson.detail) {
            errorMessage = errorJson.detail;
          }
        } catch {
          // Not JSON, use text as-is
        }
        
        console.error('[Pivot Save As] Save failed:', {
          atomId,
          filename,
          status: response.status,
          errorMessage,
        });
        
        throw new Error(errorMessage);
      }
      
      const result = await response.json();
      const message = result?.object_name
        ? `Saved pivot to ${result.object_name}`
        : 'Pivot table saved successfully';
      setPivotSaveMessage(message);
      updatePivotSettingsRef.current({
        pivotLastSavedPath: result?.object_name ?? null,
        pivotLastSavedAt: result?.updated_at ?? null,
      });
      setShowPivotSaveModal(false);
      setPivotSaveFileName('');
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Unable to save pivot table. Please try again.';
      setPivotSaveError(message);
    } finally {
      setPivotIsSaving(false);
    }
  }, [atomId, pivotIsComputing, pivotSaveFileName]);

  const pivotReadinessMessage = useMemo(() => {
    if (!pivotSettings.dataSource) {
      return 'Select a data source from the Input Files tab to generate a pivot table.';
    }
    if (!pivotSettings.valueFields || pivotSettings.valueFields.length === 0) {
      return 'Add at least one field to the Values area to compute the pivot table.';
    }
    return null;
  }, [pivotSettings.dataSource, pivotSettings.valueFields]);

  const handlePivotDataChange = useCallback((newData: Partial<PivotSettings>) => {
    const latest = pivotSettingsRef.current;
    const merged: PivotSettings = {
      ...DEFAULT_PIVOT_TABLE_SETTINGS,
      ...latest,
      ...newData,
    };
    pivotSettingsRef.current = merged;
    updatePivotSettingsRef.current(merged);
  }, []);

  const handlePivotGrandTotalsChange = useCallback((mode: 'off' | 'rows' | 'columns' | 'both') => {
    updatePivotSettingsRef.current({ grandTotalsMode: mode });
  }, []);

  const handlePivotSubtotalsChange = useCallback((mode: 'off' | 'top' | 'bottom') => {
    updatePivotSettingsRef.current({ subtotalsMode: mode });
  }, []);

  const handlePivotStyleChange = useCallback((styleId: string) => {
    updatePivotSettingsRef.current({ pivotStyleId: styleId });
  }, []);

  const handlePivotStyleOptionsChange = useCallback(
    (options: PivotSettings['pivotStyleOptions']) => {
      updatePivotSettingsRef.current({ pivotStyleOptions: options });
    },
    [],
  );

  const handlePivotReportLayoutChange = useCallback((layout: 'compact' | 'outline' | 'tabular') => {
    updatePivotSettingsRef.current({ reportLayout: layout });
  }, []);

  const handlePivotToggleCollapse = useCallback((key: string) => {
    const current = new Set(pivotSettingsRef.current.collapsedKeys ?? []);
    if (current.has(key)) {
      current.delete(key);
    } else {
      current.add(key);
    }
    updatePivotSettingsRef.current({ collapsedKeys: Array.from(current) });
  }, []);

  const pivotFilterOptions = pivotSettings.pivotFilterOptions ?? {};
  const pivotFilterSelections = pivotSettings.pivotFilterSelections ?? {};
  const pivotCollapsedKeys = pivotSettings.collapsedKeys ?? [];
  const pivotReportLayout = pivotSettings.reportLayout ?? 'compact';

  const pivotContainerRef = useRef<HTMLDivElement | null>(null);
  // 1. Add a ref to track the currently editing cell/header
  const editingCellRef = useRef<{ row: number; col: string } | null>(null);
  const editingHeaderRef = useRef<string | null>(null);
  // Track mapping from duplicated columns to their original source
  const [duplicateMap, setDuplicateMap] = useState<{ [key: string]: string }>({});
  const previousSelectedColumnRef = useRef<string | null>(null);

  // Ref to store header cell elements for context-menu positioning
  const headerRefs = useRef<{ [key: string]: HTMLTableCellElement | null }>({});
  const headerClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rowRefs = useRef<{ [key: number]: HTMLTableRowElement | null }>({});
  const [resizingCol, setResizingCol] = useState<{ key: string; startX: number; startWidth: number } | null>(null);
  const [resizingRow, setResizingRow] = useState<{ index: number; startY: number; startHeight: number } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const rowContextMenuRef = useRef<HTMLDivElement | null>(null);
  const portalTarget = typeof document !== 'undefined' ? document.body : null;

  const clampMenuPosition = useCallback((pointerX: number, pointerY: number, width: number, height: number) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const maxX = Math.max(viewportWidth - width - CONTEXT_MENU_PADDING, CONTEXT_MENU_PADDING);
    const maxY = Math.max(viewportHeight - height - CONTEXT_MENU_PADDING, CONTEXT_MENU_PADDING);
    const x = Math.min(Math.max(pointerX, CONTEXT_MENU_PADDING), maxX);
    const y = Math.min(Math.max(pointerY, CONTEXT_MENU_PADDING), maxY);
    return { x, y };
  }, []);

  const repositionColumnContextMenu = useCallback(() => {
    setContextMenu(prev => {
      if (!prev || !contextMenuRef.current) {
        return prev;
      }
      const rect = contextMenuRef.current.getBoundingClientRect();
      const { x, y } = clampMenuPosition(prev.pointerX, prev.pointerY, rect.width, rect.height);
      if (x === prev.x && y === prev.y) {
        return prev;
      }
      return { ...prev, x, y };
    });
  }, [clampMenuPosition]);

  const repositionRowContextMenu = useCallback(() => {
    setRowContextMenu(prev => {
      if (!prev || !rowContextMenuRef.current) {
        return prev;
      }
      const rect = rowContextMenuRef.current.getBoundingClientRect();
      const { x, y } = clampMenuPosition(prev.pointerX, prev.pointerY, rect.width, rect.height);
      if (x === prev.x && y === prev.y) {
        return prev;
      }
      return { ...prev, x, y };
    });
  }, [clampMenuPosition]);

  const startColResize = (key: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('Column resize started for:', key);
    
    // Get the current width from settings or default (simplified approach like row resize)
    const currentWidth = settings.columnWidths?.[key] || 150;
    const startX = e.clientX;
    
    setResizingCol({ key, startX, startWidth: currentWidth });
    
    // Add visual feedback
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const startRowResize = (index: number, e: React.MouseEvent) => {
    e.preventDefault();
    const startHeight = rowRefs.current[index]?.offsetHeight || 0;
    setResizingRow({ index, startY: e.clientY, startHeight });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (resizingCol) {
        const delta = e.clientX - resizingCol.startX;
        const newWidth = Math.max(Math.min(resizingCol.startWidth + delta, 500), 50);
        console.log('Column resize:', resizingCol.key, 'new width:', newWidth);
        onSettingsChange({
          columnWidths: { ...(settings.columnWidths || {}), [resizingCol.key]: newWidth }
        });
      }
      if (resizingRow) {
        const deltaY = e.clientY - resizingRow.startY;
        const newHeight = Math.max(resizingRow.startHeight + deltaY, 20);
        onSettingsChange({
          rowHeights: { ...(settings.rowHeights || {}), [resizingRow.index]: newHeight }
        });
      }
    };
    const handleMouseUp = () => {
      if (resizingCol) {
        setResizingCol(null);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
      if (resizingRow) setResizingRow(null);
    };
    if (resizingCol || resizingRow) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      // Clean up cursor styles on unmount
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizingCol, resizingRow, settings.columnWidths, settings.rowHeights, onSettingsChange]);

  // Clear column selection when clicking outside the selected column
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (selectedColumn && !isFormulaMode) {
        const target = e.target as HTMLElement;
        if (!target.closest(`[data-col="${selectedColumn}"]`)) {
          setSelectedColumn(null);
        }
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [selectedColumn, isFormulaMode]);

  useEffect(() => {
    const incoming = settings.columnFormulas || {};
    if (areFormulaMapsEqual(incoming, settingsColumnFormulasRef.current)) {
      return;
    }
    settingsColumnFormulasRef.current = incoming;
    setColumnFormulas(prev => (areFormulaMapsEqual(prev, incoming) ? prev : incoming));
  }, [settings.columnFormulas]);

  useEffect(() => {
    // Don't update column formulas during operations to prevent conflicts
    if (isProcessingOperation) {
      return;
    }
    
    setColumnFormulas(prev => {
      if (!data?.headers?.length) {
        if (Object.keys(prev).length) {
          onSettingsChange({ columnFormulas: {} });
          return {};
        }
        return prev;
      }

      const allowed = new Set(data.headers);
      const next: Record<string, string> = {};
      let changed = false;

      Object.entries(prev).forEach(([col, formula]) => {
        if (allowed.has(col)) {
          next[col] = formula as string;
        } else {
          changed = true;
        }
      });

      if (!changed && Object.keys(next).length === Object.keys(prev).length) {
        return prev;
      }

      onSettingsChange({ columnFormulas: next });
      return next;
    });
  }, [headersKey, data?.headers, onSettingsChange, isProcessingOperation]);

  // Handle selectedColumn state when data changes (e.g., when columns are inserted/deleted)
  useEffect(() => {
    if (!data?.headers || !selectedColumn) {
      return;
    }

    // Check if the selected column still exists in the new data
    const columnStillExists = data.headers.includes(selectedColumn);
    
    if (!columnStillExists) {
      console.log('[DataFrameOperations] Selected column no longer exists, clearing selection:', selectedColumn);
      setSelectedColumn(null);
      setFormulaInput('');
      setFormulaValidationError(null);
    }
  }, [data?.headers, selectedColumn]);

  useEffect(() => {
    const storedFormula = selectedColumn ? columnFormulas[selectedColumn] : undefined;

    if (selectedColumn !== previousSelectedColumnRef.current) {
      previousSelectedColumnRef.current = selectedColumn;
      if (selectedColumn) {
        const nextFormula = storedFormula ?? '';
        if (nextFormula !== formulaInput) {
          setFormulaInput(nextFormula);
        }
        setEditingState(false);
        setFormulaValidationError(null);
      } else {
        setEditingState(false);
        setFormulaValidationError(null);
      }
      return;
    }

    if (
      selectedColumn &&
      storedFormula !== undefined &&
      storedFormula !== formulaInput &&
      !isEditingFormula
    ) {
      setFormulaInput(storedFormula);
    }
  }, [selectedColumn, columnFormulas, formulaInput, isEditingFormula]);
  
  // Initialize column order when data changes
  useEffect(() => {
    if (data?.headers) {
      // Always update column order when data changes to ensure it's current
      
      // Only update if the headers are different from current column order
      if (JSON.stringify(columnOrder) !== JSON.stringify(data.headers)) {
        setColumnOrder(data.headers);
      }
    }
  }, [data?.headers, columnOrder]);
  
  // Helper function to preserve column order when applying backend responses
  const preserveColumnOrder = useCallback((backendHeaders: string[], currentHeaders: string[]) => {
    console.log('[DataFrameOperations] Preserving column order:', {
      columnOrderLength: columnOrder.length,
      backendHeadersLength: backendHeaders.length,
      currentHeadersLength: currentHeaders.length,
      columnOrder: columnOrder,
      backendHeaders: backendHeaders
    });
    
    if (columnOrder.length === 0) {
      console.log('[DataFrameOperations] No tracked column order, using backend order');
      return backendHeaders;
    }
    
    // Use the tracked column order, but only include columns that exist in the backend response
    const orderedHeaders = columnOrder.filter(header => backendHeaders.includes(header));
    
    // Add any new columns from backend that aren't in our tracked order
    const newColumns = backendHeaders.filter(header => !columnOrder.includes(header));
    
    const result = [...orderedHeaders, ...newColumns];
    
    console.log('[DataFrameOperations] Column order preserved:', {
      orderedHeaders,
      newColumns,
      result
    });
    
    return result;
  }, [columnOrder]);
  
  // 1. Add state for filter range
  const [filterRange, setFilterRange] = useState<{ min: number; max: number; value: [number, number] } | null>(null);

  // Add Save DataFrame logic
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const saveSuccessTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [savedFiles, setSavedFiles] = useState<any[]>([]);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveFileName, setSaveFileName] = useState('');
  const [showOverwriteConfirmDialog, setShowOverwriteConfirmDialog] = useState(false);

  // Add local state for editing value
  const [editingCellValue, setEditingCellValue] = useState<string>('');
  const [editingHeaderValue, setEditingHeaderValue] = useState<string>('');
  const [headerDisplayNames, setHeaderDisplayNames] = useState<{ [key: string]: string }>({});

  // Add local state for raw min/max input in the component
  const [filterMinInput, setFilterMinInput] = useState<string | number>('');
  const [filterMaxInput, setFilterMaxInput] = useState<string | number>('');

  // State for tracking filter selections before applying
  const [filterSelections, setFilterSelections] = useState<Record<string, string[]>>({});

  // Loading indicator for server-side operations
  const [operationLoading, setOperationLoading] = useState(false);
  const [formulaLoading, setFormulaLoading] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);
  const [columnOperationLoading, setColumnOperationLoading] = useState(false);
  const [sortLoading, setSortLoading] = useState(false);
  const [filterLoading, setFilterLoading] = useState(false);
  const [convertLoading, setConvertLoading] = useState(false);
  const [duplicateLoading, setDuplicateLoading] = useState(false);
  const [insertLoading, setInsertLoading] = useState(false);
  
  // Undo/Redo state management
  const [undoStack, setUndoStack] = useState<UndoSnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<UndoSnapshot[]>([]);
  const [isUndoRedoOperation, setIsUndoRedoOperation] = useState(false);

  // History panel state
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const [historyPanelMinimized, setHistoryPanelMinimized] = useState(false);
  const [historyPanelPosition, setHistoryPanelPosition] = useState({ x: 0, y: 0 });
  
  // Find and Replace state
  const [findReplaceModalOpen, setFindReplaceModalOpen] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [replaceAll, setReplaceAll] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [findReplaceLoading, setFindReplaceLoading] = useState(false);
  const [matchCount, setMatchCount] = useState(0);
  const [matchCountLoading, setMatchCountLoading] = useState(false);
  const [matchesByColumn, setMatchesByColumn] = useState<Record<string, number>>({});
  const [highlightedText, setHighlightedText] = useState('');
  const [historyOperations, setHistoryOperations] = useState<Array<{
    id: string;
    type: string;
    description: string;
    timestamp: Date;
    status: 'success' | 'error' | 'pending';
  }>>([]);

  // Removed overlay system - frozen columns handle background blocking

  // Function to add operation to history
  const addToHistory = useCallback((type: string, description: string, status: 'success' | 'error' | 'pending' = 'success') => {
    const operation = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      description,
      timestamp: new Date(),
      status
    };
    setHistoryOperations(prev => [operation, ...prev].slice(0, 100)); // Keep last 100 operations
  }, []);

  const createSnapshot = useCallback(
    (sourceData?: DataFrameData): UndoSnapshot | null => {
      const baseData = sourceData ?? data;
      if (!baseData) return null;
      return {
        data: JSON.parse(JSON.stringify(baseData)),
        columnFormulas: JSON.parse(JSON.stringify(columnFormulas || {})),
        selectedColumn,
      };
    },
    [data, columnFormulas, selectedColumn],
  );

  const applySnapshot = useCallback(
    (snapshot: UndoSnapshot) => {
      const restoredData = JSON.parse(JSON.stringify(snapshot.data));
      const restoredFormulas = JSON.parse(JSON.stringify(snapshot.columnFormulas || {}));
      onDataChange(restoredData);
      setColumnFormulas(restoredFormulas);
      onSettingsChange({ columnFormulas: restoredFormulas });
      setSelectedColumn(snapshot.selectedColumn);
      if (snapshot.selectedColumn) {
        setFormulaInput(restoredFormulas[snapshot.selectedColumn] || '');
        setIsFormulaMode(true);
      } else {
        setFormulaInput('');
        setIsFormulaMode(false);
      }
      setEditingState(false);
    },
    [onDataChange, onSettingsChange, setColumnFormulas, setSelectedColumn, setFormulaInput, setIsFormulaMode, setEditingState],
  );

  // Function to save current state to undo stack
  const saveToUndoStack = useCallback(
    (currentData?: DataFrameData) => {
      if (isUndoRedoOperation) return; // Don't save during undo/redo operations
      const snapshot = createSnapshot(currentData);
      if (!snapshot) return;
      setUndoStack(prev => {
        const newStack = [...prev, snapshot];
        // Limit undo stack to 50 operations
        return newStack.slice(-50);
      });
      // Clear redo stack when new operation is performed
      setRedoStack([]);
    },
    [isUndoRedoOperation, createSnapshot],
  );

  // Function to undo last operation
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    
    const previousState = undoStack[undoStack.length - 1];
    if (!previousState) return;
    
    setIsUndoRedoOperation(true);
    
    const currentSnapshot = createSnapshot();
    if (currentSnapshot) {
      setRedoStack(prev => [...prev, currentSnapshot]);
    }
    
    setUndoStack(prev => prev.slice(0, -1));
    
    applySnapshot(previousState);
    
    addToHistory('Undo', 'Reverted last operation');
    
    toast({
      title: "Undo Applied",
      description: "Last operation has been undone",
    });
    
    setTimeout(() => setIsUndoRedoOperation(false), 100);
  }, [undoStack, createSnapshot, applySnapshot, addToHistory]);

  // Function to redo last undone operation
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    
    const nextState = redoStack[redoStack.length - 1];
    if (!nextState) return;
    
    setIsUndoRedoOperation(true);
    
    const currentSnapshot = createSnapshot();
    if (currentSnapshot) {
      setUndoStack(prev => [...prev, currentSnapshot]);
    }
    
    setRedoStack(prev => prev.slice(0, -1));
    
    applySnapshot(nextState);
    
    toast({
      title: "Redo Applied",
      description: "Last undone operation has been redone",
    });
    
    setTimeout(() => setIsUndoRedoOperation(false), 100);
  }, [redoStack, createSnapshot, applySnapshot]);

  // Helper to convert current table to CSV (includes filtered and deleted state)
  const toCSV = () => {
    if (!data) return '';
    const headers = data.headers;
    // Use processed data that includes all filters (search, column filters, and deleted rows)
    const rows = processedData.filteredRows;
    const csvRows = [headers.join(',')];
    for (const row of rows) {
      csvRows.push(headers.map(h => JSON.stringify(row[h] ?? '')).join(','));
    }
    return csvRows.join('\n');
  };

  const fetchSavedDataFrames = async () => {
    try {
      const res = await fetch(`${VALIDATE_API}/list_saved_dataframes`, {
        credentials: 'include'
      });
      const data = await res.json();
      setSavedFiles(data.files || []);
    } catch {/* empty */
      // Optionally handle error
    }
  };

  // Load existing saved files once so we can compute the next DF_OPS serial
  useEffect(() => {
    fetchSavedDataFrames();
  }, []);

  // Open save modal with default filename
  const handleSaveDataFrame = () => {
    if (!data) return;

      // Determine next serial number for DF_OPS files
      const maxSerial = savedFiles.reduce((max, f) => {
        const m = f.object_name?.match(/dataframe operations\/DF_OPS_(\d+)_/);
        return m ? Math.max(max, parseInt(m[1], 10)) : max;
      }, 0);
      const nextSerial = maxSerial + 1;

      // Base name from current file without extension
      const baseName = data.fileName ? data.fileName.replace(/\.[^/.]+$/, '') : `dataframe_${Date.now()}`;
    const defaultFilename = `DF_OPS_${nextSerial}_${baseName}`;
    
    setSaveFileName(defaultFilename);
    setShowSaveModal(true);
  };

  // Actually save the DataFrame with the chosen filename
  const confirmSaveDataFrame = async () => {
    if (!data) return;
    
    setSaveLoading(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const csv_data = toCSV();

      const filename = saveFileName.trim() ? `${saveFileName.trim()}.arrow` : `dataframe_${Date.now()}.arrow`;

      // 🔧 REVERTED TO ORIGINAL APPROACH: Always use CSV
      // This ensures all UI changes (deletions, filters, search) are captured
      // Backend has enhanced CSV parsing that preserves dtypes
      const payload: Record<string, unknown> = { 
        filename,
        csv_data: csv_data  // Always send CSV (captures all UI state)
      };
      
      const response = await fetch(`${DATAFRAME_OPERATIONS_API}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Save failed: ${response.statusText} - ${errorText}`);
      }
      const result = await response.json();
      setSaveSuccess(true);
      setShowSaveModal(false);
      if (saveSuccessTimeout.current) clearTimeout(saveSuccessTimeout.current);
      saveSuccessTimeout.current = setTimeout(() => setSaveSuccess(false), 2000);
      
      // Add a small delay to allow MinIO eventual consistency to catch up
      setTimeout(() => {
        fetchSavedDataFrames(); // Refresh the saved dataframes list in the UI
      }, 500);
      // Simple update like the old file - only update settings, not data
      onSettingsChange({
        tableData: { ...data, fileName: filename },
        columnWidths: settings.columnWidths,
        rowHeights: settings.rowHeights,
        fileId: (result?.df_id as string | undefined) ?? fileId ?? settings.fileId ?? null,
      });
      toast({
        title: 'DataFrame Saved',
        description: result?.message ?? `${filename} saved successfully with ${processedData.filteredRows.length} filtered rows.`,
        variant: 'default',
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save DataFrame');
      toast({
        title: 'Save Error',
        description: err instanceof Error ? err.message : 'Failed to save DataFrame',
        variant: 'destructive',
      });
    } finally {
      setSaveLoading(false);
    }
  };

  // Show confirmation dialog before saving to original file
  const handleSaveToOriginalFile = () => {
    if (!data) return;
    if (!settings.selectedFile) {
      toast({ title: 'Error', description: 'No input file found', variant: 'destructive' });
      return;
    }
    setShowOverwriteConfirmDialog(true);
  };

  // Save to original file (update the input file) - called after confirmation
  const confirmOverwriteSave = async () => {
    if (!data) return;
    if (!settings.selectedFile) {
      toast({ title: 'Error', description: 'No input file found', variant: 'destructive' });
      return;
    }
    
    setShowOverwriteConfirmDialog(false);
    setSaveLoading(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const csv_data = toCSV();
      
      // Use the original file path
      let filename = settings.selectedFile;
      // Remove .arrow extension if present (backend will add it back)
      if (filename.endsWith('.arrow')) {
        filename = filename.replace('.arrow', '');
      }

      const payload: Record<string, unknown> = { 
        csv_data, 
        filename,
        overwrite_original: true 
      };
      
      const response = await fetch(`${DATAFRAME_OPERATIONS_API}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`Save failed: ${response.statusText}`);
      }
      const result = await response.json();
      setSaveSuccess(true);
      if (saveSuccessTimeout.current) clearTimeout(saveSuccessTimeout.current);
      saveSuccessTimeout.current = setTimeout(() => setSaveSuccess(false), 2000);
      
      toast({
        title: 'File Updated',
        description: result?.message ?? 'Original file updated successfully.',
        variant: 'default',
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save DataFrame');
      toast({
        title: 'Save Error',
        description: err instanceof Error ? err.message : 'Failed to save DataFrame',
        variant: 'destructive',
      });
    } finally {
      setSaveLoading(false);
    }
  };

  const resetSaveSuccess = () => { if (saveSuccess) setSaveSuccess(false); };

  const [rowContextMenu, setRowContextMenu] = useState<{
    pointerX: number;
    pointerY: number;
    x: number;
    y: number;
    rowIdx: number;
  } | null>(null);

  const normalizeBackendColumnTypes = useCallback((
    types: Record<string, string> | undefined,
    headers: string[]
  ): Record<string, 'text' | 'number' | 'date'> => {
    const mapped: Record<string, 'text' | 'number' | 'date'> = {};
    headers.forEach(header => {
      const raw = types?.[header]?.toLowerCase() || '';
      if (['float', 'double', 'int', 'decimal', 'numeric', 'number'].some(token => raw.includes(token))) {
        mapped[header] = 'number';
      } else if (['datetime', 'date', 'time', 'timestamp'].some(token => raw.includes(token))) {
        mapped[header] = 'date';
      } else {
        mapped[header] = 'text';
      }
    });
    return mapped;
  }, []);

   // Helper function to filter backend response to preserve deleted and hidden columns
  interface FilteredBackendResponse {
    headers: string[];
    rows: DataFrameData['rows'];
    columnTypes: Record<string, 'text' | 'number' | 'date'>;
    hiddenColumns: string[];
    deletedColumns: string[];
  }

  const filterBackendResponse = useCallback((resp: any, currentHiddenColumns: string[], currentDeletedColumns: string[] = []): FilteredBackendResponse => {
     // Combine hidden and deleted columns to filter out
     const columnsToFilter = [...currentHiddenColumns, ...currentDeletedColumns];
     
     // First filter out hidden/deleted columns
     const availableHeaders = resp.headers.filter((header: string) => !columnsToFilter.includes(header));
     
     // Then preserve column order if we have a tracked order
     const filteredHeaders = preserveColumnOrder(availableHeaders, data?.headers || []);
    
    const filteredRows = resp.rows.map((row: any) => {
      const filteredRow: any = {};
      filteredHeaders.forEach((header: string) => {
        if (row.hasOwnProperty(header)) {
          filteredRow[header] = row[header];
        }
      });
      return filteredRow;
    });
    
    const columnTypes = normalizeBackendColumnTypes(resp.types, resp.headers);
    const filteredColumnTypes: Record<string, 'text' | 'number' | 'date'> = {};
    filteredHeaders.forEach((header: string) => {
      if (columnTypes[header]) {
        filteredColumnTypes[header] = columnTypes[header];
      }
    });
    
    return {
      headers: filteredHeaders,
      rows: filteredRows,
      columnTypes: filteredColumnTypes,
      hiddenColumns: [...currentHiddenColumns],
      deletedColumns: [...currentDeletedColumns],
    };
  }, [normalizeBackendColumnTypes, preserveColumnOrder, data?.headers]);

  const buildFilterPayload = useCallback((value: any) => {
    if (Array.isArray(value)) {
      if (value.length === 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
        return { min: value[0], max: value[1] };
      }
      return value;
    }
    if (value && typeof value === 'object') {
      if ('value' in value) {
        return value.value;
      }
      if ('min' in value && 'max' in value) {
        return value;
      }
    }
    return value;
  }, []);

  const rebuildDataWithFilters = useCallback(async (
    filtersToApply: Record<string, any>
  ): Promise<boolean> => {
    if (!data || !settings.selectedFile) {
      return false;
    }

    setOperationLoading(true);
    try {
      let resp = await loadDataframeByKey(settings.selectedFile);
      let workingHeaders = resp.headers;
      let workingRows = resp.rows;
      let workingTypes = resp.types;
      let workingFileId: string | null = resp.df_id;

      for (const [filterCol, filterValue] of Object.entries(filtersToApply)) {
        if (!workingFileId) {
          break;
        }
        const payload = buildFilterPayload(filterValue);
        const filteredResp = await apiFilter(workingFileId, filterCol, payload);
        workingHeaders = filteredResp.headers;
        workingRows = filteredResp.rows;
        workingTypes = filteredResp.types;
        workingFileId = filteredResp.df_id;
      }

      const columnTypes = normalizeBackendColumnTypes(workingTypes, workingHeaders);

      onDataChange({
        headers: workingHeaders,
        rows: workingRows,
        fileName: data.fileName,
        columnTypes,
        pinnedColumns: data.pinnedColumns,
        frozenColumns: data.frozenColumns,
        cellColors: data.cellColors,
        hiddenColumns: data.hiddenColumns || [],
        deletedColumns: data.deletedColumns || [],
      });

      onSettingsChange({
        filters: { ...filtersToApply },
        fileId: workingFileId || settings.fileId,
      });

      setCurrentPage(1);
      return true;
    } catch (err) {
      handleApiError('Filter rebuild failed', err);
      return false;
    } finally {
      setOperationLoading(false);
    }
  }, [data, settings.selectedFile, settings.fileId, buildFilterPayload, normalizeBackendColumnTypes, onDataChange, onSettingsChange]);

  // Effect: when all filters cleared externally, reset local filter UI states
  useEffect(() => {
    if (Object.keys(settings.filters || {}).length === 0) {
      setFilterRange(null);
      setFilterMinInput('');
      setFilterMaxInput('');
      setCurrentPage(1);
    }
  }, [settings.filters]);


  // 2. Add effect to close dropdowns on outside click or right-click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      // 🔧 FIX: Use unique IDs per atom instance
      const cm = document.getElementById(`df-ops-context-menu-${atomId}`);
      const rcm = document.getElementById(`df-ops-row-context-menu-${atomId}`);
      if (cm?.contains(e.target as Node) || rcm?.contains(e.target as Node)) {
        return;
      }
       setOpenDropdown(null);
       setContextMenu(null);
       setRowContextMenu(null);
       // Clear filter selections when closing context menu
       setFilterSelections({});
    };
    const handleContextMenu = (e: MouseEvent) => {
      // 🔧 FIX: Use unique IDs per atom instance
      const cm = document.getElementById(`df-ops-context-menu-${atomId}`);
      const rcm = document.getElementById(`df-ops-row-context-menu-${atomId}`);
      if (cm?.contains(e.target as Node) || rcm?.contains(e.target as Node)) {
        return;
      }
      setOpenDropdown(null);
    };
    if (openDropdown || contextMenu || rowContextMenu) {
      document.addEventListener('mousedown', handleClick);
      document.addEventListener('contextmenu', handleContextMenu);
    }
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [openDropdown, contextMenu, rowContextMenu]);

  useLayoutEffect(() => {
    if (!contextMenu) {
      return;
    }
    repositionColumnContextMenu();
  }, [contextMenu, repositionColumnContextMenu]);

  useLayoutEffect(() => {
    if (!rowContextMenu) {
      return;
    }
    repositionRowContextMenu();
  }, [rowContextMenu, repositionRowContextMenu]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }
    const handleWindowUpdate = () => {
      repositionColumnContextMenu();
    };
    window.addEventListener('resize', handleWindowUpdate);
    window.addEventListener('scroll', handleWindowUpdate, true);
    return () => {
      window.removeEventListener('resize', handleWindowUpdate);
      window.removeEventListener('scroll', handleWindowUpdate, true);
    };
  }, [contextMenu, repositionColumnContextMenu]);

  useEffect(() => {
    if (!rowContextMenu) {
      return;
    }
    const handleWindowUpdate = () => {
      repositionRowContextMenu();
    };
    window.addEventListener('resize', handleWindowUpdate);
    window.addEventListener('scroll', handleWindowUpdate, true);
    return () => {
      window.removeEventListener('resize', handleWindowUpdate);
      window.removeEventListener('scroll', handleWindowUpdate, true);
    };
  }, [rowContextMenu, repositionRowContextMenu]);

  // Process and filter data
  const processedData = useMemo(() => {
    if (!data || !Array.isArray(data.headers) || !Array.isArray(data.rows)) {
      return { filteredRows: [], totalRows: 0, uniqueValues: {} };
    }

    // First, exclude permanently deleted rows
    let filteredRows = data.rows.filter((_, index) => !permanentlyDeletedRows.has(index));

    // Apply search filter locally
    if (settings?.searchTerm?.trim()) {
      const term = settings.searchTerm.trim();
      const termLower = term.toLowerCase();
      const exactRegex = new RegExp(`^(?:${term.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')})$`, 'i');
      filteredRows = filteredRows
        .map((row, idx) => {
          let score = 0;
          for (const col of data.headers) {
            const valStr = safeToString(row[col]);
            if (exactRegex.test(valStr.trim())) { score = 2; break; }
            if (valStr.toLowerCase().includes(termLower)) { score = Math.max(score, 1); }
          }
          return { row, idx, score };
        })
        .sort((a, b) => {
          if (a.score !== b.score) return b.score - a.score;
          return a.idx - b.idx;
        })
        .map(item => item.row);
    }

    // Apply column filters locally to preserve all columns
    const appliedFilters = settings.filters || {};
    for (const [column, filterValue] of Object.entries(appliedFilters)) {
      if (!filterValue || (Array.isArray(filterValue) && filterValue.length === 0)) {
        continue;
      }

      filteredRows = filteredRows.filter(row => {
        const cellValue = row[column];
        
        if (Array.isArray(filterValue)) {
          if (typeof filterValue[0] === 'number') {
            // Range filter for numbers - handle special cases for Infinity
            const num = Number(cellValue);
            if (isNaN(num)) return false;
            
            const minVal = filterValue[0];
            const maxVal = filterValue[1];
            
            // Handle Infinity values for greater than/less than filters
            if (minVal === -Infinity && maxVal === Infinity) {
              return true; // Show all values
            } else if (minVal === -Infinity) {
              return num <= maxVal;
            } else if (maxVal === Infinity) {
              return num >= minVal;
            } else {
              return num >= minVal && num <= maxVal;
            }
          } else {
            // Multi-select filter for strings
            const cellStr = safeToString(cellValue);
            
            // Check if filter includes "(blank)" and cell is blank
            if (filterValue.includes('(blank)')) {
              const isBlank = cellValue === null || cellValue === undefined || 
                             cellValue === '' || 
                             (typeof cellValue === 'string' && cellValue.trim() === '') ||
                             (typeof cellValue === 'number' && Number.isNaN(cellValue));
              if (isBlank) return true;
            }
            
            return filterValue.includes(cellStr);
          }
        } else if (filterValue && typeof filterValue === 'object' && 'min' in filterValue && 'max' in filterValue) {
          // Range filter object
          const num = Number(cellValue);
          if (isNaN(num)) return false;
          
          const minVal = Number((filterValue as any).min);
          const maxVal = Number((filterValue as any).max);
          
          if (minVal === -Infinity && maxVal === Infinity) {
            return true;
          } else if (minVal === -Infinity) {
            return num <= maxVal;
          } else if (maxVal === Infinity) {
            return num >= minVal;
          } else {
            return num >= minVal && num <= maxVal;
          }
        } else {
          // Single value filter
          return safeToString(cellValue) === safeToString(filterValue);
        }
      });
    }

    // Unique values for filter UI (support hierarchical filtering and duplicated columns)
    const uniqueValues: { [key: string]: string[] } = {};
    const originalHeaders = new Set(originalData?.headers || []);
    const currentRows = data.rows.filter((_, index) => !permanentlyDeletedRows.has(index));

    data.headers.forEach(header => {
      const sourceCol = duplicateMap[header] || header;
      const filtersToApply = Object.entries(appliedFilters).filter(([col]) => col !== header);
      
      // 🔧 FIX: Always use currentRows to reflect latest cell edits
      // Previously used originalData when needsCurrentRows was false, causing stale filter values
      let rowsForHeader = [...currentRows];

      filtersToApply.forEach(([col, val]) => {
        const filterCol = duplicateMap[col] || col;
        rowsForHeader = rowsForHeader.filter(row => {
          const cell = row[filterCol];
          if (Array.isArray(val)) {
            // Special handling for "(blank)" filter
            if (val.includes('(blank)')) {
              const isBlank = cell === null || cell === undefined || cell === '' || 
                             (typeof cell === 'string' && cell.trim() === '') ||
                             (typeof cell === 'number' && Number.isNaN(cell));
              if (isBlank) return true;
            }
            return val.includes(safeToString(cell));
          }
          if (val && typeof val === 'object' && 'min' in val && 'max' in val) {
            const num = Number(cell);
            const minVal = Number(val.min);
            const maxVal = Number(val.max);
            return num >= minVal && num <= maxVal;
          }
          return safeToString(cell) === safeToString(val);
        });
      });

      // Get unique values including detection of blanks
      const allRowValues = rowsForHeader.map(row => {
        const val = row[sourceCol];
        // Check if value is blank (NULL, empty string, whitespace, NaN)
        if (val === null || val === undefined || val === '' || 
            (typeof val === 'string' && val.trim() === '') ||
            (typeof val === 'number' && Number.isNaN(val))) {
          return '(blank)';
        }
        return safeToString(val);
      });
      
      // 🔧 FIX: Removed unnecessary fallback that used originalData
      // Now we always work with currentRows, so no fallback needed
      let values = Array.from(new Set(allRowValues)).sort() as string[];

      uniqueValues[header] = values.slice(0, 50);
    });

    const result = { filteredRows, totalRows: filteredRows.length, uniqueValues };
    return result;
  }, [data, originalData, settings.searchTerm, settings.filters, duplicateMap, permanentlyDeletedRows, forceRefresh]);

  // Pagination
  const totalPages = Math.ceil(processedData.totalRows / (settings.rowsPerPage || 15));

  // Ensure current page is valid when data size changes
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [totalPages]);
  const startIndex = (currentPage - 1) * (settings.rowsPerPage || 15);
  const paginatedRows = processedData.filteredRows.slice(startIndex, startIndex + (settings.rowsPerPage || 15));

  // Effect: update select all checkbox state based on individual row selections
  useEffect(() => {
    if (!data || processedData.filteredRows.length === 0) {
      setSelectAllRows(false);
      return;
    }

    const visibleRowIndices = processedData.filteredRows.map((_, rowIndex) => {
      const originalRowIndex = data.rows.findIndex((originalRow, idx) => {
        if (permanentlyDeletedRows.has(idx)) return false;
        return originalRow === processedData.filteredRows[rowIndex];
      });
      return originalRowIndex;
    }).filter(index => index !== -1);

    const allVisibleSelected = visibleRowIndices.every(index => multiSelectedRows.has(index));
    const someVisibleSelected = visibleRowIndices.some(index => multiSelectedRows.has(index));
    
    if (allVisibleSelected && visibleRowIndices.length > 0) {
      setSelectAllRows(true);
    } else if (!someVisibleSelected) {
      setSelectAllRows(false);
    }
    // For partial selection, we don't change the selectAllRows state to maintain the indeterminate state
  }, [multiSelectedRows, processedData.filteredRows, data, permanentlyDeletedRows]);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const resp = await loadDataframe(file);
      const columnTypes = normalizeBackendColumnTypes(resp.types, resp.headers);
      const newData: DataFrameData = {
        headers: resp.headers,
        rows: resp.rows,
        fileName: file.name,
        columnTypes,
        pinnedColumns: [],
        frozenColumns: 0,
        cellColors: {},
        hiddenColumns: []
      };
      setUploadError(null);
      setPermanentlyDeletedRows(new Set()); // Clear deleted rows for new data
      onDataUpload(newData, resp.df_id);
      setCurrentPage(1);
    } catch {/* empty */
      setUploadError('Error parsing file');
    }
  }, [onDataUpload, normalizeBackendColumnTypes]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0 && fileInputRef.current) {
      const dt = new DataTransfer();
      files.forEach(file => dt.items.add(file as File));
      fileInputRef.current.files = dt.files;
      handleFileUpload({ target: { files: dt.files } } as React.ChangeEvent<HTMLInputElement>);
    }
  }, [handleFileUpload]);

  // Rename the file drag-over handler
  const handleFileDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleSort = async (column: string, direction: 'asc' | 'desc') => {
    // 🔧 FIX: Use settings.fileId (updated after operations) with fallback to prop
    const activeFileId = settings.fileId || fileId;
    if (!data || !activeFileId) return;
    
    // Save current state before making changes
    saveToUndoStack(data);
    
    setSortLoading(true);
    try {
      const resp = await apiSort(activeFileId, column, direction);
      
       // Preserve deleted columns by filtering out columns that were previously deleted
       const currentHiddenColumns = data.hiddenColumns || [];
       const currentDeletedColumns = data.deletedColumns || [];
       const filtered = filterBackendResponse(resp, currentHiddenColumns, currentDeletedColumns);
      
      onDataChange({
        headers: filtered.headers,
        rows: filtered.rows,
        fileName: data.fileName,
        columnTypes: filtered.columnTypes,
        pinnedColumns: data.pinnedColumns.filter(p => !currentHiddenColumns.includes(p)),
        frozenColumns: data.frozenColumns,
        cellColors: data.cellColors,
         hiddenColumns: currentHiddenColumns,
         deletedColumns: currentDeletedColumns,
       });
      onSettingsChange({ sortColumns: [{ column, direction }], fileId: resp.df_id });
    } catch (err) {
      handleApiError('Sort failed', err);
    } finally {
      setSortLoading(false);
    }
  };

  const handleColumnFilter = async (column: string, selectedValues: string[] | [number, number]) => {
    if (!data) return;

    if (Array.isArray(selectedValues) && selectedValues.length === 0) {
      await handleClearFilter(column);
      return;
    }

    // Use local filtering to preserve all columns and deletions
    const updatedFilters = {
      ...(settings.filters || {}),
      [column]: selectedValues,
    } as Record<string, any>;

    onSettingsChange({ filters: { ...updatedFilters } });
    setCurrentPage(1);
    
    // Add to history
    if (Array.isArray(selectedValues) && selectedValues.length === 2 && typeof selectedValues[0] === 'number') {
      addToHistory('Filter', `Applied range filter to column "${column}": ${selectedValues[0]} - ${selectedValues[1]}`);
    } else {
      addToHistory('Filter', `Applied filter to column "${column}": ${Array.isArray(selectedValues) ? selectedValues.length + ' values' : 'custom filter'}`);
    }
  };

// Helper to commit a cell edit after user finishes editing
const commitCellEdit = (rowIndex: number, column: string) => {
  // Save current state before making changes
  if (data) {
    saveToUndoStack(data);
  }
  handleCellEdit(rowIndex, column, editingCellValue);
  setEditingCell(null);
};

// Helper to commit a header edit
const commitHeaderEdit = async (colIdx: number, value?: string) => {
  // 🔧 FIX: Use settings.fileId (updated after operations) with fallback to prop
  const activeFileId = settings.fileId || fileId;
  if (!data || !activeFileId) { setEditingHeader(null); return; }
  
  // 🔧 FIX: colIdx is the visible column index, need to map to actual column
  const visibleHeaders = data.headers.filter(header => !(data.hiddenColumns || []).includes(header));
  
  if (colIdx < 0 || colIdx >= visibleHeaders.length) {
    setEditingHeader(null);
    return;
  }
  
  const oldHeader = visibleHeaders[colIdx];
  
  if (!oldHeader) {
    setEditingHeader(null);
    return;
  }
  
  const newHeader = value !== undefined ? value : editingHeaderValue;
  
  if (newHeader === oldHeader) { setEditingHeader(null); return; }
  
  // Check if the column has been deleted
  if (data.deletedColumns && data.deletedColumns.includes(oldHeader)) {
    setEditingHeader(null);
    return;
  }
  
  // Save current state before making changes
  saveToUndoStack(data);
  
  try {
    const resp = await apiRenameColumn(activeFileId, oldHeader, newHeader);
    
    // 🔧 SAFETY: Update selectedCell if the renamed column is the active column
    if (selectedCell?.col === oldHeader) {
      setSelectedCell({ row: selectedCell.row, col: newHeader });
      console.log('[DataFrameOperations] Updated active cell column name:', oldHeader, '→', newHeader);
    }
    
    // Create updated column order by replacing old name with new name BEFORE filtering
    const updatedColumnOrder = columnOrder.map(col => col === oldHeader ? newHeader : col);
    
    // Update the columnOrder state
    setColumnOrder(updatedColumnOrder);
    
    // 🔧 FIX: Preserve ALL columns (including hidden) in data.headers
    // Hidden columns should stay in headers array, just marked as hidden
    const currentHiddenColumns = data.hiddenColumns || [];
    const currentDeletedColumns = data.deletedColumns || [];
    
    // Filter out ONLY deleted columns (keep hidden columns in headers)
    const columnsToFilter = [...currentDeletedColumns];
    const availableHeaders = resp.headers.filter((header: string) => !columnsToFilter.includes(header));
    
    // Use the UPDATED column order (not the state which is async)
    let orderedHeaders: string[];
    if (updatedColumnOrder.length === 0) {
      orderedHeaders = availableHeaders;
    } else {
      // Preserve order using the updated column order
      orderedHeaders = updatedColumnOrder.filter((header: string) => availableHeaders.includes(header));
      // Add any new columns that aren't in our tracked order
      const newColumns = availableHeaders.filter((header: string) => !updatedColumnOrder.includes(header));
      orderedHeaders = [...orderedHeaders, ...newColumns];
    }
    
    // Keep ALL columns in rows (including hidden), let rendering handle visibility
    const allRows = resp.rows;
    
    // Normalize column types for ALL columns
    const columnTypes = normalizeBackendColumnTypes(resp.types, resp.headers);
    
    onDataChange({
      headers: orderedHeaders,
      rows: allRows,
      fileName: data.fileName,
      columnTypes: columnTypes,
      pinnedColumns: data.pinnedColumns.filter(p => !currentHiddenColumns.includes(p)).map(p => p === oldHeader ? newHeader : p),
      frozenColumns: data.frozenColumns,
      cellColors: data.cellColors,
      hiddenColumns: currentHiddenColumns,
      deletedColumns: currentDeletedColumns,
    });
    
    // Update formulas for the renamed column
    setColumnFormulas(prev => {
      if (!Object.prototype.hasOwnProperty.call(prev, oldHeader)) {
        return prev;
      }
      const { [oldHeader]: stored, ...rest } = prev;
      const next = stored === undefined ? rest : { ...rest, [newHeader]: stored };
      onSettingsChange({ columnFormulas: next });
      return next;
    });
    
    // Add to history
    addToHistory('Rename Column', `Renamed column "${oldHeader}" to "${newHeader}"`);
    
    toast({
      title: "Column Renamed",
      description: `Column "${oldHeader}" renamed to "${newHeader}"`,
    });
    
  } catch (err) {
    handleApiError('Rename column failed', err);
    addToHistory('Rename Column', `Failed to rename column "${oldHeader}"`, 'error');
  }
  setEditingHeader(null);
};

// Original immediate update util (kept for programmatic usage)
  const handleCellEdit = async (rowIndex: number, column: string, newValue: string) => {
    resetSaveSuccess();
    // 🔧 FIX: Use settings.fileId (updated after operations) with fallback to prop
    const activeFileId = settings.fileId || fileId;
    if (!data || !activeFileId) return;
    const globalRowIndex = startIndex + rowIndex;
    try {
      const resp = await apiEditCell(activeFileId, globalRowIndex, column, newValue);
      
       // Preserve deleted columns by filtering out columns that were previously deleted
       const currentHiddenColumns = data.hiddenColumns || [];
       const currentDeletedColumns = data.deletedColumns || [];
       const filtered = filterBackendResponse(resp, currentHiddenColumns, currentDeletedColumns);
      
      onDataChange({
        headers: filtered.headers,
        rows: filtered.rows,
        fileName: data.fileName,
        columnTypes: filtered.columnTypes,
        pinnedColumns: data.pinnedColumns.filter(p => !currentHiddenColumns.includes(p)),
        frozenColumns: data.frozenColumns,
        cellColors: data.cellColors,
         hiddenColumns: currentHiddenColumns,
         deletedColumns: currentDeletedColumns,
       });
       
       // Close any open filter dropdowns to force refresh when reopened
       setContextMenu(null);
       
       // Force refresh to update filters with new values (delayed to ensure state update)
       setTimeout(() => {
         setForceRefresh(prev => prev + 1);
       }, 50);
    } catch (err) {
      handleApiError('Edit cell failed', err);
    }
  };

  const handleAddRow = async () => {
    resetSaveSuccess();
    // 🔧 FIX: Use settings.fileId (updated after operations) with fallback to prop
    const activeFileId = settings.fileId || fileId;
    if (!data || !activeFileId) return;
    
    // Save current state before making changes
    saveToUndoStack(data);
    
    const idx = data.rows.length > 0 ? data.rows.length - 1 : 0;
    const dir: 'above' | 'below' = data.rows.length > 0 ? 'below' : 'above';
    try {
      const resp = await apiInsertRow(activeFileId, idx, dir);
      
       // Preserve deleted columns by filtering out columns that were previously deleted
       const currentHiddenColumns = data.hiddenColumns || [];
       const currentDeletedColumns = data.deletedColumns || [];
       const filtered = filterBackendResponse(resp, currentHiddenColumns, currentDeletedColumns);
      
      onDataChange({
        headers: filtered.headers,
        rows: filtered.rows,
        fileName: data.fileName,
        columnTypes: filtered.columnTypes,
        pinnedColumns: data.pinnedColumns.filter(p => !currentHiddenColumns.includes(p)),
        frozenColumns: data.frozenColumns,
        cellColors: data.cellColors,
         hiddenColumns: currentHiddenColumns,
         deletedColumns: currentDeletedColumns,
       });
       
       // Close any open filter dropdowns to force refresh when reopened
       setContextMenu(null);
       
       // Force refresh to update filters (delayed to ensure state update)
       setTimeout(() => {
         setForceRefresh(prev => prev + 1);
       }, 50);
    } catch (err) {
      handleApiError('Insert row failed', err);
    }
  };

  const handleAddColumn = async () => {
    resetSaveSuccess();
    // 🔧 FIX: Use settings.fileId (updated after operations) with fallback to prop
    const activeFileId = settings.fileId || fileId;
    if (!data || !activeFileId) return;
    
    // Save current state before making changes
    saveToUndoStack(data);
    
    const newColumnName = `Column_${data.headers.length + 1}`;
    
    // Calculate the correct backend index for adding at the end
    const frontendEndIndex = data.headers.length;
    const backendEndIndex = getBackendColumnIndex(frontendEndIndex);
    
    try {
      const resp = await apiInsertColumn(activeFileId, backendEndIndex, newColumnName, '');
      
       // Preserve deleted columns by filtering out columns that were previously deleted
       const currentHiddenColumns = data.hiddenColumns || [];
       const currentDeletedColumns = data.deletedColumns || [];
       const filtered = filterBackendResponse(resp, currentHiddenColumns, currentDeletedColumns);
      
      onDataChange({
        headers: filtered.headers,
        rows: filtered.rows,
        fileName: data.fileName,
        columnTypes: filtered.columnTypes,
        pinnedColumns: data.pinnedColumns.filter(p => !currentHiddenColumns.includes(p)),
        frozenColumns: data.frozenColumns,
        cellColors: data.cellColors,
         hiddenColumns: currentHiddenColumns,
         deletedColumns: currentDeletedColumns,
       });
      
      // Auto-select the newly added column for formula operations
      if (filtered.headers.includes(newColumnName)) {
        setSelectedColumn(newColumnName);
        console.log('[DataFrameOperations] Auto-selected newly added column:', newColumnName);
      }
    } catch (err) {
      handleApiError('Insert column failed', err);
    }
  };

  
  
  const handleDeleteCell = () => {
    resetSaveSuccess();
    if (!data || !selectedCell) return;
    const idx = startIndex + selectedCell.row;
    const col = selectedCell.col;
    const newRows = [...data.rows];
    if (newRows[idx]) newRows[idx][col] = '';
    onDataChange({ ...data, rows: newRows });
    
    // Close any open filter dropdowns to force refresh when reopened
    setContextMenu(null);
    
    // Force refresh to update filters with blank values (delayed to ensure state update)
    setTimeout(() => {
      setForceRefresh(prev => prev + 1);
    }, 50);
  };

  const handleDragStart = (col: string) => {
    setDraggedCol(col);
    setTargetPosition(null);
  };

  const handleDragOver = (e: React.DragEvent, col: string) => {
    e.preventDefault();
    if (draggedCol === col) return;
    const headers = [...data?.headers || []];
    const draggedIndex = headers.indexOf(draggedCol || '');
    const targetIndex = headers.indexOf(col);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      // Store the target position for use in handleDragEnd
      setTargetPosition(targetIndex);
      
      const newHeaders = [...headers];
      newHeaders.splice(draggedIndex, 1);
      newHeaders.splice(targetIndex, 0, draggedCol || '');
      onDataChange({ ...data, headers: newHeaders });
    }
  };

  const handleDragEnd = async () => {
    // 🔧 FIX: Use settings.fileId (updated after operations) with fallback to prop
    const activeFileId = settings.fileId || fileId;
    if (draggedCol && data && activeFileId && targetPosition !== null) {
      // Save current state before making changes
      saveToUndoStack(data);
      
      // Use the stored target position instead of current position
      const toIndex = targetPosition;
      const backendToIndex = getBackendColumnIndex(toIndex);
      
      console.log('[DataFrameOperations] Moving column with backend update:', {
        draggedCol,
        targetPosition,
        toIndex,
        backendToIndex,
        currentHeaders: data.headers
      });
      
      try {
        // Call the backend API to update the column order
        const resp = await apiMoveColumn(activeFileId, draggedCol, backendToIndex);
        
        console.log('[DataFrameOperations] Move column API response:', {
          responseHeaders: resp.headers,
          responseHeadersLength: resp.headers?.length,
          currentHeadersLength: data.headers.length
        });
        
        // Preserve deleted columns by filtering out columns that were previously deleted
        const currentHiddenColumns = data.hiddenColumns || [];
        const currentDeletedColumns = data.deletedColumns || [];
        const filtered = filterBackendResponse(resp, currentHiddenColumns, currentDeletedColumns);
        
        console.log('[DataFrameOperations] After filtering:', {
          filteredHeaders: filtered.headers,
          filteredHeadersLength: filtered.headers?.length
        });
        
        onDataChange({
          headers: filtered.headers,
          rows: filtered.rows,
          fileName: data.fileName,
          columnTypes: filtered.columnTypes,
          pinnedColumns: data.pinnedColumns.filter(p => !currentHiddenColumns.includes(p)),
          frozenColumns: data.frozenColumns,
          cellColors: data.cellColors,
          hiddenColumns: currentHiddenColumns,
          deletedColumns: currentDeletedColumns,
        });
        
        // Track the new column order
        setColumnOrder(filtered.headers);
        
        // Add to history
        addToHistory('Move Column', `Moved column "${draggedCol}" to position ${toIndex + 1}`);
        
        // Show success message
        toast({
          title: "Column Moved",
          description: `Column "${draggedCol}" moved to position ${toIndex + 1}`,
        });
        
      } catch (err) {
        console.error('[DataFrameOperations] Move column failed:', err);
        handleApiError('Move column failed', err);
        addToHistory('Move Column', `Failed to move column "${draggedCol}"`, 'error');
      }
    }
    setDraggedCol(null);
    setTargetPosition(null);
  };






const handleSortAsc = (colIdx: number) => {
  if (!data) return;
  // 🔧 FIX: colIdx is the visible column index, map to actual column
  const visibleHeaders = data.headers.filter(header => !(data.hiddenColumns || []).includes(header));
  const col = visibleHeaders[colIdx];
  if (!col) return;
  handleSort(col, 'asc');
  addToHistory('Sort', `Sorted column "${col}" in ascending order`);
  setContextMenu(null);
  setOpenDropdown(null);
};

const handleSortDesc = (colIdx: number) => {
  if (!data) return;
  // 🔧 FIX: colIdx is the visible column index, map to actual column
  const visibleHeaders = data.headers.filter(header => !(data.hiddenColumns || []).includes(header));
  const col = visibleHeaders[colIdx];
  if (!col) return;
  handleSort(col, 'desc');
  addToHistory('Sort', `Sorted column "${col}" in descending order`);
  setContextMenu(null);
  setOpenDropdown(null);
};

const handleClearSort = () => {
  if (!data || !contextMenu) return;
  const col = contextMenu.col;
  const newSortColumns = settings.sortColumns.filter(s => s.column !== col);
  onSettingsChange({ sortColumns: newSortColumns });
  addToHistory('Clear Sort', `Cleared sorting for column "${col}"`);
  setContextMenu(null);
  setOpenDropdown(null);
};

// Update handleClearFilter to accept a column name (string)
const handleClearFilter = async (col: string) => {
  if (!data) return;
  const existingFilters = settings.filters || {};
  if (!Object.prototype.hasOwnProperty.call(existingFilters, col)) {
    onSettingsChange({ filters: { ...existingFilters } });
    setFilterRange(null);
    setCurrentPage(1);
    setFilterMinInput('');
    setFilterMaxInput('');
    return;
  }

  const newFilters = { ...existingFilters } as Record<string, any>;
  delete newFilters[col];

  // Use local filtering to preserve all columns and deletions
  onSettingsChange({ filters: { ...newFilters } });
  
  // Add to history
  addToHistory('Clear Filter', `Cleared filter for column "${col}"`);

  setFilterRange(null);
  setCurrentPage(1);
  setFilterMinInput('');
  setFilterMaxInput('');
};

const handleCellClick = (rowIndex: number, column: string) => {
  // 🔧 CRITICAL FIX: Calculate originalRowIndex from paginated rowIndex
  // rowIndex is the index in paginatedRows (0-14), we need the index in data.rows
  const globalFilteredIndex = startIndex + rowIndex;
  const originalRowIndex = data?.rows.findIndex((originalRow, idx) => {
    if (permanentlyDeletedRows.has(idx)) return false;
    // Check if this original row matches the current paginated row
    return originalRow === processedData.filteredRows[globalFilteredIndex];
  }) ?? -1;
  
  if (originalRowIndex === -1) {
    console.warn('[DataFrameOperations] Could not find original row index for paginated row:', rowIndex);
    return;
  }
  
  // 🔧 Excel-like behavior: Track active cell position for visual indicator
  setSelectedCell({ row: originalRowIndex, col: column });
  
  // 🔧 Excel-like: Set selectedColumn so the column header is highlighted
  setSelectedColumn(column);
  
  // When clicking on a cell, just highlight column; user must click formula bar to edit
  // 🔧 FIX: Clear row AND column multi-selections when clicking a cell
  // Multi-selections should only persist when explicitly using Ctrl+Click
  setMultiSelectedRows(new Set());
  setMultiSelectedColumns(new Set());
  
  console.log('[DataFrameOperations] Active cell:', { row: originalRowIndex, col: column, paginatedRow: rowIndex }, 'Column header will highlight');
};

// Function to completely reset the formula bar to a clean state
const resetFormulaBar = () => {
  setFormulaInput('');
  setSelectedColumn(null);
  setSelectedCell(null);
  setIsFormulaMode(false); // Disable formula bar after reset
  setIsFormulaBarFrozen(false); // Don't freeze formula bar - allow continued use
  setEditingState(false);
  showValidationError(null);
  console.log('[DataFrameOperations] Formula bar completely reset and frozen');
};

// Function to activate formula bar for a specific column
const activateFormulaBar = (column: string, options?: { editMode?: boolean }) => {
  setSelectedColumn(column);
  setIsFormulaMode(true);
  setIsFormulaBarFrozen(false);
  const storedFormula = columnFormulas[column];
  setFormulaInput(storedFormula || '');
  if (options?.editMode) {
    setEditingState(true);
  } else {
    setEditingState(false);
  }
  showValidationError(null);
  console.log('[DataFrameOperations] Formula bar activated for column:', column, storedFormula ? `with stored formula: ${storedFormula}` : 'new column');
};

// Helper function to replace next ColX with column name (Excel-like behavior)
const replaceNextColPlaceholder = (expression: string, columnName: string): string => {
  const colMatch = expression.match(/Col\d+/);
  if (colMatch) {
    const colIndex = expression.indexOf(colMatch[0]);
    const colLength = colMatch[0].length;
    return expression.slice(0, colIndex) + columnName + expression.slice(colIndex + colLength);
  }
  return expression;
};

const insertColumnIntoFormula = (columnName: string) => {
  // Only insert column into formula if formula bar is already active
  if (!isFormulaMode || !editingSessionRef.current) {
    return;
  }
  
  console.log('[DataFrameOperations] insertColumnIntoFormula called:', { columnName, selectedColumn, isFormulaMode });
  
  // Use the same logic as FormularBar's handleColumnInsert function
  // 🔧 FIX: Scope query to this atom instance only
  const inputElement = document.querySelector(`#atom-${atomId} input[placeholder*="=SUM"]`) as HTMLInputElement;
  
  // Check if there are ColX placeholders to replace (Excel-like behavior)
  if (formulaInput.includes('Col')) {
    // Use the exact same replaceNextColPlaceholder function as FormularBar
    const newValue = replaceNextColPlaceholder(formulaInput, columnName);
    
    // Use the same state update pattern as FormularBar
    setFormulaInput(newValue);
    setIsFormulaMode(true);
    
    console.log('[DataFrameOperations] Column inserted into formula:', { columnName, newValue, selectedColumn });
    
    // Don't change target column when inserting columns into formula
    // The target column should remain stable during formula editing
    
    // Set cursor position after the inserted column name (same as FormularBar)
    setTimeout(() => {
      if (inputElement) {
        const colMatch = formulaInput.match(/Col\d+/);
        if (colMatch) {
          const colIndex = formulaInput.indexOf(colMatch[0]);
          const newCursorPosition = colIndex + columnName.length;
          inputElement.setSelectionRange(newCursorPosition, newCursorPosition);
          inputElement.focus();
        }
      }
    }, 0);
    return;
  }
  
  // Fallback to original behavior if no ColX placeholders found
  // 🔧 FIX: Scope query to this atom instance only
  const formulaInputElement = document.querySelector(`#atom-${atomId} input[placeholder*="=SUM"]`) as HTMLInputElement;
  if (!formulaInputElement) return;
  
  const cursorPosition = formulaInputElement.selectionStart || 0;
  const currentFormula = formulaInput;
  
  // Insert column name at cursor position
  const newFormula = currentFormula.slice(0, cursorPosition) + columnName + currentFormula.slice(cursorPosition);
  
  setFormulaInput(newFormula);
  
  // If no target column is selected, set the clicked column as the target
  if (!selectedColumn) {
    setSelectedColumn(columnName);
  }
  
  // Set cursor position after the inserted column name
  setTimeout(() => {
    const newCursorPosition = cursorPosition + columnName.length;
    formulaInputElement.setSelectionRange(newCursorPosition, newCursorPosition);
    formulaInputElement.focus();
  }, 0);
};

const handleHeaderClick = (header: string) => {
  resetSaveSuccess();

  const isEditingActiveFormula = isFormulaMode && editingSessionRef.current;

  // Only treat header clicks as column insertions when actively editing a formula
  if (isEditingActiveFormula) {
    // Insert column name into formula at cursor position
    insertColumnIntoFormula(header);
    return;
  }
  
  // 🔧 Excel-like: Clear cell selection when clicking column header (select entire column)
  setSelectedCell(null);
  
  // Normal column selection behavior - update selection only
  setSelectedCell(null);
  setSelectedColumn(header);
  setIsFormulaMode(true);
  setIsFormulaBarFrozen(false);
  const storedFormula = columnFormulas[header];
  setFormulaInput(storedFormula || '');
  setEditingState(false);
  showValidationError(null);
  
  console.log('[DataFrameOperations] Column header clicked:', header, 'Cell selection cleared');
};

  const handleFormulaSubmit = async () => {
    resetSaveSuccess();
    // 🔧 FIX: Use settings.fileId (updated after operations) with fallback to prop
    const activeFileId = settings.fileId || fileId;
    
    // 🔧 IMPROVED: Better error messages for debugging
    if (!data) {
      showValidationError('No data loaded. Please load a file first.');
      console.error('[Formula] Cannot apply formula: No data loaded');
      return;
    }
    
    if (!selectedColumn) {
      showValidationError('Please select a target column first');
      console.error('[Formula] Cannot apply formula: No target column selected');
      return;
    }
    
    if (!activeFileId) {
      showValidationError('File ID missing. Please reload the file and try again.');
      console.error('[Formula] Cannot apply formula: Missing fileId', {
        settingsFileId: settings.fileId,
        propFileId: fileId,
        activeFileId
      });
      return;
    }
    
    const trimmedFormula = formulaInput.trim();
    if (!trimmedFormula) {
      showValidationError('Please enter a formula');
      return;
    }
  
    console.log('[Formula] 🚀 Applying formula:', {
      fileId: activeFileId,
      targetColumn: selectedColumn,
      formula: trimmedFormula
    });
  
  // Apply formula directly without queuing to test
  setFormulaLoading(true);
  setIsProcessingOperation(false); // Reset processing state
  try {
    // Save current state before making changes
    saveToUndoStack(data);
      // Check if we have active filters or search
      const hasActiveFilters = Object.keys(settings.filters || {}).length > 0 || !!settings.searchTerm;
      const currentFilters = settings.filters || {};
      const currentSearchTerm = settings.searchTerm || '';
      
      // 🔧 CRITICAL: Apply the formula to the original data via backend endpoint
      console.log('[Formula] 📡 Calling API endpoint: /apply_formula');
      console.log('[Formula] Request payload:', {
        df_id: activeFileId,
        target_column: selectedColumn,
        formula: trimmedFormula
      });
      
      const resp = await apiApplyFormula(activeFileId, selectedColumn, trimmedFormula);
      console.log('[Formula] ✅ API response received:', resp);
      
      // 🔧 CRITICAL: Update fileId from response if provided (for future operations)
      const updatedFileId = resp?.df_id || activeFileId;
      if (updatedFileId && updatedFileId !== activeFileId) {
        console.log('[Formula] 🔄 Updating fileId:', activeFileId, '→', updatedFileId);
        onSettingsChange({ fileId: updatedFileId });
      }
    
    // Preserve deleted columns by filtering out columns that were previously deleted
    const currentHiddenColumns = data.hiddenColumns || [];
    const currentDeletedColumns = data.deletedColumns || [];
    const filtered = filterBackendResponse(resp, currentHiddenColumns, currentDeletedColumns);
    
    console.log('[Formula] 📊 Updating canvas with calculated values:', {
      rows: filtered.rows.length,
      headers: filtered.headers.length,
      targetColumn: selectedColumn
    });
    
    onDataChange({
      headers: filtered.headers,
      rows: filtered.rows, // ✅ This contains the CALCULATED values from backend
      fileName: data.fileName,
      columnTypes: filtered.columnTypes,
      pinnedColumns: data.pinnedColumns.filter(p => !currentHiddenColumns.includes(p)),
      frozenColumns: data.frozenColumns,
      cellColors: data.cellColors,
      hiddenColumns: currentHiddenColumns,
      deletedColumns: currentDeletedColumns,
    });
    
    // Close any open filter dropdowns to force refresh when reopened
    setContextMenu(null);
    
    // Force a refresh AFTER data updates (delay to ensure state is updated)
    setTimeout(() => {
    setForceRefresh(prev => prev + 1);
    }, 100);
    
    // Don't re-apply filters - let the data update naturally
    // The processedData will automatically reflect the new data with existing filters
    
    setColumnFormulas(prev => {
      if (prev[selectedColumn] === trimmedFormula) {
        return prev;
      }
      const next = { ...prev, [selectedColumn]: trimmedFormula };
      onSettingsChange({ columnFormulas: next });
      return next;
    });
    
    // Reset formula bar to completely clean state after successful application
    resetFormulaBar();
    
    // Force a complete reset to ensure the new column is usable for future operations
    setTimeout(() => {
      resetFormulaBar();
    }, 200);
    
    // Add to history
    addToHistory('Apply Formula', `Applied formula "${trimmedFormula}" to column "${selectedColumn}"`);
    
    // Show success notification
    toast({
      title: "Formula Applied Successfully",
      description: `Formula applied to column "${selectedColumn}". Click on formula bar to edit this column again.`,
    });
    
  } catch (err) {
    console.error('[DataFrameOperations] Formula application failed:', err);
    handleApiError('Apply formula failed', err);
    addToHistory('Apply Formula', `Failed to apply formula "${trimmedFormula}" to column "${selectedColumn}"`, 'error');
  } finally {
    setFormulaLoading(false);
  }
};

const insertDisabled = !selectedCell && !selectedColumn;
const deleteDisabled = !selectedCell && !selectedColumn;

const selectedColumns = Array.isArray(settings.selectedColumns) ? settings.selectedColumns : [];
const sortColumns = Array.isArray(settings.sortColumns) ? settings.sortColumns : [];
const filters = typeof settings.filters === 'object' && settings.filters !== null ? settings.filters : {};

  // Add a ref to each column header and store its bounding rect when right-clicked

  // Helper function to map frontend column index to backend column index
  const getBackendColumnIndex = useCallback((frontendIndex: number) => {
    if (!data) return frontendIndex;
    
    // For move operations, we can use the frontend index directly
    // since the backend should have the same column structure as frontend
    // (excluding hidden/deleted columns which are handled by the backend)
    console.log('[DataFrameOperations] Using frontend index as backend index:', {
      frontendIndex,
      totalColumns: data.headers.length
    });
    
    return frontendIndex;
  }, [data]);

  // Simple and direct insert column implementation
  const handleInsertColumn = async (colIdx: number) => {
    // 🔧 FIX: Use settings.fileId (updated after operations) with fallback to prop
    const activeFileId = settings.fileId || fileId;
    if (!data || !activeFileId) return;
    
    console.log('[DataFrameOperations] Insert column called with colIdx:', colIdx);
    console.log('[DataFrameOperations] Current headers:', data.headers);
    
    // Save current state before making changes
    saveToUndoStack(data);
    
    // Get the column name at the clicked position
    const visibleHeaders = data.headers.filter(header => !(data.hiddenColumns || []).includes(header));
    const clickedColumn = visibleHeaders[colIdx];
    
    // Find the position of this column in the original headers array
    const insertPosition = data.headers.indexOf(clickedColumn) + 1;
    
    console.log('[DataFrameOperations] Insert details:', {
      colIdx,
      clickedColumn,
      insertPosition,
      totalColumns: data.headers.length
    });
    
    // Generate a unique column name
    const newColumnName = getNextColKey(data.headers);
    
    setInsertLoading(true);
    try {
      // Call the backend API with the exact position
      const resp = await apiInsertColumn(activeFileId, insertPosition, newColumnName, '');
      
      // Update the data with the response
      onDataChange({
        headers: resp.headers,
        rows: resp.rows,
        fileName: data.fileName,
        columnTypes: resp.columnTypes,
        pinnedColumns: data.pinnedColumns,
        frozenColumns: data.frozenColumns,
        cellColors: data.cellColors,
        hiddenColumns: data.hiddenColumns,
        deletedColumns: data.deletedColumns,
      });
      
      // Auto-select the newly inserted column
      setSelectedColumn(newColumnName);
      
      // Add to history
      addToHistory('Insert Column', `Inserted column "${newColumnName}" after "${clickedColumn}"`);
      
      toast({
        title: "Column Inserted",
        description: `New column "${newColumnName}" inserted after "${clickedColumn}"`,
      });
      
    } catch (err) {
      console.error('[DataFrameOperations] Insert column error:', err);
      handleApiError('Insert column failed', err);
      addToHistory('Insert Column', `Failed to insert column after "${clickedColumn}"`, 'error');
    } finally {
      setInsertLoading(false);
    }
  };

  const handleDeleteColumn = async (colIdx: number) => {
    resetSaveSuccess();
    if (!data || !fileId) return;
    
    // 🔧 FIX: colIdx is the visible column index, need to map to actual column
    const visibleHeaders = data.headers.filter(header => !(data.hiddenColumns || []).includes(header));
    
    if (colIdx < 0 || colIdx >= visibleHeaders.length) {
      return;
    }
    const col = visibleHeaders[colIdx];
    
    if (!col) {
      return;
    }
    
    // 🔧 SAFETY: Clear selectedCell if deleting the active column
    if (selectedCell?.col === col) {
      setSelectedCell(null);
      console.log('[DataFrameOperations] Cleared active cell - column deleted:', col);
    }
    
    // Save current state before making changes
    saveToUndoStack(data);
    
    // Check if there are multiple selected columns
    if (multiSelectedColumns.size > 1) {
      // Show confirmation modal for multiple columns
      const columnsToDelete = Array.from(multiSelectedColumns);
      setDeleteConfirmModal({
        isOpen: true,
        columnsToDelete,
      });
    } else {
      // Delete single column (original behavior)
      
      // ALWAYS do frontend-only delete to avoid backend sync issues
      // The backend API is unreliable and causes 404 errors
      // Frontend delete is instant and always works
      const updatedHiddenColumns = (data.hiddenColumns || []).filter(h => h !== col);
      const updatedDeletedColumns = [...(data.deletedColumns || []), col]; // Track deleted columns
      const updatedHeaders = data.headers.filter(h => h !== col);
      
      // Remove column from rows
      const updatedRows = data.rows.map(row => {
        const { [col]: removed, ...rest } = row;
        return rest;
      });
      
      // Remove from columnTypes
      const { [col]: removedType, ...remainingTypes } = data.columnTypes;
      
      onDataChange({
        headers: updatedHeaders,
        rows: updatedRows,
        fileName: data.fileName,
        columnTypes: remainingTypes,
        pinnedColumns: data.pinnedColumns.filter(p => p !== col),
        frozenColumns: data.frozenColumns,
        cellColors: data.cellColors,
        hiddenColumns: updatedHiddenColumns,
        deletedColumns: updatedDeletedColumns,
      });
      
      // Clear selection
      setMultiSelectedColumns(prev => {
        const newSet = new Set(prev);
        newSet.delete(col);
        return newSet;
      });
      
      addToHistory('Delete Column', `Deleted column "${col}"`);
      
      toast({
        title: "Column Deleted",
        description: `Column "${col}" deleted successfully`,
      });
    }
  };

  // Completely rewritten duplicate column functionality
  const handleDuplicateColumn = async (colIdx: number) => {
    // 🔧 FIX: Use settings.fileId (updated after operations) with fallback to prop
    const activeFileId = settings.fileId || fileId;
    if (!data || !activeFileId) return;
    
    console.log('[DataFrameOperations] Duplicate column called with colIdx:', colIdx);
    console.log('[DataFrameOperations] Current headers:', data.headers);
    console.log('[DataFrameOperations] Hidden columns:', data.hiddenColumns);
    
    // Save current state before making changes
    saveToUndoStack(data);
    
    setDuplicateLoading(true);
    
    // Get the actual column name from visible headers
    const visibleHeaders = data.headers.filter(header => !(data.hiddenColumns || []).includes(header));
    const originalColumn = visibleHeaders[colIdx];
    
    // Find the position of the original column in the full headers array
    const originalPosition = data.headers.indexOf(originalColumn);
    
    console.log('[DataFrameOperations] Duplicate details:', {
      colIdx,
      originalColumn,
      originalPosition,
      totalColumns: data.headers.length,
      visibleHeaders,
      allHeaders: data.headers
    });
    
    // Generate unique name for the duplicated column
    let newColumnName = `${originalColumn}_copy`;
    while (data.headers.includes(newColumnName)) {
      newColumnName += '_copy';
    }
    
    try {
      // Call the backend API to duplicate the column
      const resp = await apiDuplicateColumn(activeFileId, originalColumn, newColumnName);
      
      console.log('[DataFrameOperations] Duplicate response:', resp);
      
      // Update the data with the response
      onDataChange({
        headers: resp.headers,
        rows: resp.rows,
        fileName: data.fileName,
        columnTypes: resp.columnTypes,
        pinnedColumns: data.pinnedColumns,
        frozenColumns: data.frozenColumns,
        cellColors: data.cellColors,
        hiddenColumns: data.hiddenColumns,
        deletedColumns: data.deletedColumns,
      });
      
      // Auto-select the newly duplicated column
      setSelectedColumn(newColumnName);
      
      // Add to history
      addToHistory('Duplicate Column', `Duplicated "${originalColumn}" as "${newColumnName}"`);
      
      toast({
        title: "Column Duplicated",
        description: `"${originalColumn}" duplicated as "${newColumnName}"`,
      });
      
    } catch (err) {
      console.error('[DataFrameOperations] Duplicate column error:', err);
      handleApiError('Duplicate column failed', err);
      addToHistory('Duplicate Column', `Failed to duplicate "${originalColumn}"`, 'error');
    } finally {
      setDuplicateLoading(false);
    }
  };

  // Row insert / delete handlers
  const handleInsertRow = async (position: 'above' | 'below', rowIdx: number) => {
    // 🔧 FIX: Use settings.fileId (updated after operations) with fallback to prop
    const activeFileId = settings.fileId || fileId;
    if (!data || !activeFileId) return;
    
    // Save current state before making changes
    saveToUndoStack(data);
    
    setInsertLoading(true);
    try {
      const resp = await apiInsertRow(activeFileId, rowIdx, position);
      
       // Preserve deleted columns by filtering out columns that were previously deleted
       const currentHiddenColumns = data.hiddenColumns || [];
       const currentDeletedColumns = data.deletedColumns || [];
       const filtered = filterBackendResponse(resp, currentHiddenColumns, currentDeletedColumns);
      
      onDataChange({
        headers: filtered.headers,
        rows: filtered.rows,
        fileName: data.fileName,
        columnTypes: filtered.columnTypes,
        pinnedColumns: data.pinnedColumns.filter(p => !currentHiddenColumns.includes(p)),
        frozenColumns: data.frozenColumns,
        cellColors: data.cellColors,
         hiddenColumns: currentHiddenColumns,
         deletedColumns: currentDeletedColumns,
       });
      
      // Add to history
      addToHistory('Insert Row', `Inserted row ${position} row ${rowIdx + 1}`);
    } catch (err) {
      handleApiError('Insert row failed', err);
      addToHistory('Insert Row', `Failed to insert row ${position} row ${rowIdx + 1}`, 'error');
    } finally {
      setInsertLoading(false);
    }
  };

  const handleDuplicateRow = async (rowIdx: number) => {
    // 🔧 FIX: Use settings.fileId (updated after operations) with fallback to prop
    const activeFileId = settings.fileId || fileId;
    if (!data || !activeFileId) return;
    
    // Save current state before making changes
    saveToUndoStack(data);
    
    setDuplicateLoading(true);
    try {
      const resp = await apiDuplicateRow(activeFileId, rowIdx);
      
       // Preserve deleted columns by filtering out columns that were previously deleted
       const currentHiddenColumns = data.hiddenColumns || [];
       const currentDeletedColumns = data.deletedColumns || [];
       const filtered = filterBackendResponse(resp, currentHiddenColumns, currentDeletedColumns);
      
      onDataChange({
        headers: filtered.headers,
        rows: filtered.rows,
        fileName: data.fileName,
        columnTypes: filtered.columnTypes,
        pinnedColumns: data.pinnedColumns.filter(p => !currentHiddenColumns.includes(p)),
        frozenColumns: data.frozenColumns,
        cellColors: data.cellColors,
         hiddenColumns: currentHiddenColumns,
         deletedColumns: currentDeletedColumns,
       });
      
      // Add to history
      addToHistory('Duplicate Row', `Duplicated row ${rowIdx + 1}`);
    } catch (err) {
      handleApiError('Duplicate row failed', err);
      addToHistory('Duplicate Row', `Failed to duplicate row ${rowIdx + 1}`, 'error');
    } finally {
      setDuplicateLoading(false);
    }
  };

  const handleRetypeColumn = async (col: string, newType: 'number' | 'text' | 'date') => {
    // 🔧 FIX: Use settings.fileId (updated after operations) with fallback to prop
    const activeFileId = settings.fileId || fileId;
    if (!data || !activeFileId) return;
    
    // Save current state before making changes
    saveToUndoStack(data);
    
    setConvertLoading(true);
    try {
      console.log('[DataFrameOperations] Retype column:', col, 'to', newType);
      const resp = await apiRetypeColumn(activeFileId, col, newType === 'text' ? 'string' : newType);
      console.log('[DataFrameOperations] Retype response:', resp);
      
       // Preserve deleted columns by filtering out columns that were previously deleted
       const currentHiddenColumns = data.hiddenColumns || [];
       const currentDeletedColumns = data.deletedColumns || [];
       const filtered = filterBackendResponse(resp, currentHiddenColumns, currentDeletedColumns);
      console.log('[DataFrameOperations] Filtered column types:', filtered.columnTypes);
      
      const updatedData = {
        headers: filtered.headers,
        rows: filtered.rows,
        fileName: data.fileName,
        columnTypes: filtered.columnTypes,
        pinnedColumns: data.pinnedColumns.filter(p => !currentHiddenColumns.includes(p)),
        frozenColumns: data.frozenColumns,
        cellColors: data.cellColors,
        hiddenColumns: currentHiddenColumns,
      };
      
      onDataChange(updatedData);
      
      // Add to history
      addToHistory('Retype Column', `Changed column "${col}" type to ${newType}`);
      
      toast({
        title: "Column Type Changed",
        description: `Column "${col}" converted to ${newType}`,
      });
    } catch (err) {
      handleApiError('Retype column failed', err);
      addToHistory('Retype Column', `Failed to retype column "${col}"`, 'error');
    } finally {
      setConvertLoading(false);
    }
  };

  const handleMultiColumnRetype = async (columns: string[], newType: string) => {
    if (!data || !settings.fileId || columns.length === 0) return;
    
    const fileId = settings.fileId;
    
    setConvertLoading(true);
    try {
      console.log('[DataFrameOperations] Retype multiple columns:', columns, 'to', newType);
      
      // Process each column sequentially
      let currentData = data;
      for (const col of columns) {
        const resp = await apiRetypeColumn(fileId, col, newType === 'text' ? 'string' : newType);
        
        // Preserve deleted columns by filtering out columns that were previously deleted
        const currentHiddenColumns = currentData.hiddenColumns || [];
        const currentDeletedColumns = currentData.deletedColumns || [];
        const filtered = filterBackendResponse(resp, currentHiddenColumns, currentDeletedColumns);
        
        currentData = {
          headers: filtered.headers,
          rows: filtered.rows,
          fileName: currentData.fileName,
          columnTypes: filtered.columnTypes,
          pinnedColumns: currentData.pinnedColumns.filter(p => !currentHiddenColumns.includes(p)),
          frozenColumns: currentData.frozenColumns,
          cellColors: currentData.cellColors,
          hiddenColumns: currentHiddenColumns,
          deletedColumns: currentDeletedColumns,
        };
      }
      
      onDataChange(currentData);
      addToHistory('Multi-Column Retype', `${columns.length} columns converted to ${newType}: ${columns.join(', ')}`);
      
      toast({
        title: "Multiple Columns Converted",
        description: `${columns.length} columns converted to ${newType}`,
      });
      
      // Clear selection
      setMultiSelectedColumns(new Set());
    } catch (err) {
      handleApiError('Multi-column retype failed', err);
      addToHistory('Multi-Column Retype', `Failed to convert ${columns.length} columns`, 'error');
    } finally {
      setConvertLoading(false);
    }
  };

  const handleRoundColumns = async (columns: string[], decimalPlaces: number) => {
    if (!data || !settings.fileId || columns.length === 0) return;
    
    const fileId = settings.fileId;
    
    setConvertLoading(true);
    try {
      console.log('[DataFrameOperations] Round columns:', columns, 'to', decimalPlaces, 'decimal places');
      
      // Process each column sequentially
      let currentData = data;
      for (const col of columns) {
        // Check if column exists and is numeric
        if (!data.headers.includes(col)) {
          throw new Error(`Column "${col}" does not exist`);
        }
        
        const columnType = data.columnTypes[col];
        if (columnType !== 'number') {
          console.warn(`[DataFrameOperations] Column "${col}" is not numeric (type: ${columnType}), skipping...`);
          continue;
        }
        
        const resp = await apiRoundColumn(fileId, col, decimalPlaces);
        
        // Preserve deleted columns by filtering out columns that were previously deleted
        const currentHiddenColumns = currentData.hiddenColumns || [];
        const currentDeletedColumns = currentData.deletedColumns || [];
        const filtered = filterBackendResponse(resp, currentHiddenColumns, currentDeletedColumns);
        
        currentData = {
          headers: filtered.headers,
          rows: filtered.rows,
          fileName: currentData.fileName,
          columnTypes: filtered.columnTypes,
          pinnedColumns: currentData.pinnedColumns.filter(p => !currentHiddenColumns.includes(p)),
          frozenColumns: currentData.frozenColumns,
          cellColors: currentData.cellColors,
          hiddenColumns: currentHiddenColumns,
          deletedColumns: currentDeletedColumns,
        };
      }
      
      onDataChange(currentData);
      addToHistory('Round Columns', `${columns.length} columns rounded to ${decimalPlaces} decimal places: ${columns.join(', ')}`);
      
      toast({
        title: "Columns Rounded",
        description: `${columns.length} columns rounded to ${decimalPlaces} decimal places`,
      });
      
      // Clear selection
      setMultiSelectedColumns(new Set());
    } catch (err) {
      console.error('[DataFrameOperations] Round columns error:', err);
      handleApiError('Round columns failed', err);
      addToHistory('Round Columns', `Failed to round ${columns.length} columns`, 'error');
    } finally {
      setConvertLoading(false);
    }
  };

  const handleTransformColumnCase = async (columns: string[], caseType: 'lower' | 'upper' | 'camel' | 'pascal' | 'lower_camel' | 'snake' | 'screaming_snake' | 'kebab' | 'train' | 'flat') => {
    if (!data || !settings.fileId || columns.length === 0) return;
    
    const fileId = settings.fileId;
    
    setConvertLoading(true);
    try {
      console.log('[DataFrameOperations] Transform column case:', columns, 'to', caseType);
      
      // Process each column sequentially
      let currentData = data;
      for (const col of columns) {
        // Check if column exists
        if (!data.headers.includes(col)) {
          throw new Error(`Column "${col}" does not exist`);
        }
        
        const resp = await apiTransformColumnCase(fileId, col, caseType);
        
        // Preserve deleted columns by filtering out columns that were previously deleted
        const currentHiddenColumns = currentData.hiddenColumns || [];
        const currentDeletedColumns = currentData.deletedColumns || [];
        const filtered = filterBackendResponse(resp, currentHiddenColumns, currentDeletedColumns);
        
        currentData = {
          headers: filtered.headers,
          rows: filtered.rows,
          fileName: currentData.fileName,
          columnTypes: filtered.columnTypes,
          pinnedColumns: currentData.pinnedColumns.filter(p => !currentHiddenColumns.includes(p)),
          frozenColumns: currentData.frozenColumns,
          cellColors: currentData.cellColors,
          hiddenColumns: currentHiddenColumns,
          deletedColumns: currentDeletedColumns,
        };
      }
      
      onDataChange(currentData);
      const caseTypeLabel = caseType === 'lower' ? 'lowercase' : caseType === 'upper' ? 'uppercase' : 'camelCase';
      addToHistory('Transform Column Case', `${columns.length} columns transformed to ${caseTypeLabel}: ${columns.join(', ')}`);
      
      toast({
        title: "Columns Case Transformed",
        description: `${columns.length} columns transformed to ${caseTypeLabel}`,
      });
      
      // Clear selection
      setMultiSelectedColumns(new Set());
    } catch (err) {
      console.error('[DataFrameOperations] Transform column case error:', err);
      handleApiError('Transform column case failed', err);
      addToHistory('Transform Column Case', `Failed to transform ${columns.length} columns`, 'error');
    } finally {
      setConvertLoading(false);
    }
  };

  const highlightText = (text: string, searchText: string, caseSensitive: boolean = false) => {
    if (!searchText || !text) return text;
    
    const flags = caseSensitive ? 'g' : 'gi';
    const regex = new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    
    return text.replace(regex, (match) => {
      return `<mark style="background-color: #FFE066; padding: 1px 2px; border-radius: 2px;">${match}</mark>`;
    });
  };

  const handleCountMatches = async (searchText: string, caseSensitive: boolean) => {
    if (!data || !settings.fileId || !searchText.trim()) {
      setMatchCount(0);
      setMatchesByColumn({});
      setHighlightedText('');
      return;
    }
    
    const fileId = settings.fileId;
    
    setMatchCountLoading(true);
    try {
      const resp = await apiCountMatches(fileId, searchText, caseSensitive);
      setMatchCount(resp.total_matches);
      setMatchesByColumn(resp.matches_by_column);
      setHighlightedText(searchText);
    } catch (err) {
      console.error('[DataFrameOperations] Count matches error:', err);
      setMatchCount(0);
      setMatchesByColumn({});
      setHighlightedText('');
    } finally {
      setMatchCountLoading(false);
    }
  };

  const handleFindAndReplace = async () => {
    if (!data || !settings.fileId || !findText.trim()) {
      return;
    }
    
    const fileId = settings.fileId;
    
    setFindReplaceLoading(true);
    try {
      console.log('[DataFrameOperations] Find and replace:', { findText, replaceText, replaceAll, caseSensitive });
      
      const resp = await apiFindAndReplace(fileId, findText, replaceText, replaceAll, caseSensitive);
      
      // Preserve deleted columns by filtering out columns that were previously deleted
      const currentHiddenColumns = data.hiddenColumns || [];
      const currentDeletedColumns = data.deletedColumns || [];
      const filtered = filterBackendResponse(resp, currentHiddenColumns, currentDeletedColumns);
      
      onDataChange({
        headers: filtered.headers,
        rows: filtered.rows,
        fileName: data.fileName,
        columnTypes: filtered.columnTypes,
        pinnedColumns: data.pinnedColumns.filter(p => !currentHiddenColumns.includes(p)),
        frozenColumns: data.frozenColumns,
        cellColors: data.cellColors,
        hiddenColumns: currentHiddenColumns,
        deletedColumns: currentDeletedColumns,
      });
      
      const actionText = replaceAll ? 'Replaced all' : 'Replaced';
      addToHistory('Find and Replace', `${actionText} "${findText}" with "${replaceText}"`);
      
      toast({
        title: "Find and Replace Complete",
        description: `${actionText} occurrences of "${findText}"`,
      });
      
      // Close modal after successful operation
      setFindReplaceModalOpen(false);
      setFindText('');
      setReplaceText('');
    } catch (err) {
      console.error('[DataFrameOperations] Find and replace error:', err);
      handleApiError('Find and replace failed', err);
      addToHistory('Find and Replace', `Failed to replace "${findText}"`, 'error');
    } finally {
      setFindReplaceLoading(false);
    }
  };

  const handleDeleteRow = async (rowIdx: number) => {
    if (!data) return;
    
    // 🔧 SAFETY: Clear selectedCell if deleting the active row
    if (selectedCell?.row === rowIdx) {
      setSelectedCell(null);
      console.log('[DataFrameOperations] Cleared active cell - row deleted:', rowIdx);
    }
    
    // Check if there are multiple selected rows
    if (multiSelectedRows.size > 1) {
      // Show confirmation modal for multiple rows
      const rowsToDelete = Array.from(multiSelectedRows);
      setRowDeleteConfirmModal({
        isOpen: true,
        rowsToDelete,
      });
    } else {
      // Mark row as permanently deleted (local only)
      setPermanentlyDeletedRows(prev => new Set([...prev, rowIdx]));
      
      // Clear selection if this row was selected
      setMultiSelectedRows(prev => {
        const newSet = new Set(prev);
        newSet.delete(rowIdx);
        return newSet;
      });
    }
  };

  const handleDescribeColumn = async (column: string) => {
    // 🔧 FIX: Use settings.fileId (updated after operations) with fallback to prop
    const activeFileId = settings.fileId || fileId;
    if (!data || !activeFileId) return;
    try {
      const describeData = await apiDescribeColumn(activeFileId, column);
      setDescribeModal({
        isOpen: true,
        column,
        data: describeData,
      });
    } catch (err) {
      handleApiError('Describe column failed', err);
    }
  };

  const handleFreezePane = (colIdx: number) => {
    if (!data) return;
    
    // Save current state before making changes
    saveToUndoStack(data);
    
    // 📝 NOTE: colIdx here is the visible column index, which is correct for freeze pane
    // We want to freeze the first N visible columns (colIdx + 1)
    // Set frozen columns to the index + 1 (since we want to freeze up to and including this column)
    // The # column is always included when freeze pane is active
    const newFrozenColumns = colIdx + 1;
    
    // Update the data with new frozen columns
    const updatedData = {
      ...data,
      frozenColumns: newFrozenColumns
    };
    
    onDataChange(updatedData);
    
    // Add to history
    addToHistory('Freeze Pane', `Froze columns 1-${newFrozenColumns} (including # column)`);
    
    toast({
      title: "Freeze Pane Applied",
      description: `Columns 1-${newFrozenColumns} are now frozen (including # column)`,
    });
  };

  const handleUnfreezePane = () => {
    if (!data) return;
    
    // Save current state before making changes
    saveToUndoStack(data);
    
    // Reset frozen columns to 0
    const updatedData = {
      ...data,
      frozenColumns: 0
    };
    
    onDataChange(updatedData);
    
    // Add to history
    addToHistory('Unfreeze Pane', 'Removed freeze pane from all columns');
    
    toast({
      title: "Freeze Pane Removed",
      description: "All columns are now unfrozen",
    });
  };

  const handleHideColumn = (col: string) => {
    if (!data) return;
    
    // Check if there are multiple selected columns
    if (multiSelectedColumns.size > 1) {
      // Hide all selected columns at once
      const columnsToHide = Array.from(multiSelectedColumns);
      
      // Save current state before making changes
      saveToUndoStack(data);
      
      const updatedData = {
        ...data,
        hiddenColumns: [...(data.hiddenColumns || []), ...columnsToHide]
      };
      
      onDataChange(updatedData);
      
      // Add to history
      addToHistory('Hide Columns', `Hidden ${columnsToHide.length} columns: ${columnsToHide.join(', ')}`);
      
      toast({
        title: "Columns Hidden",
        description: `${columnsToHide.length} column(s) are now hidden`,
      });
      
      // Clear selection
      setMultiSelectedColumns(new Set());
    } else {
      // Hide single column
      // Save current state before making changes
      saveToUndoStack(data);
      
      // Add column to hidden columns list
      const updatedData = {
        ...data,
        hiddenColumns: [...(data.hiddenColumns || []), col]
      };
      
      onDataChange(updatedData);
      
      // Add to history
      addToHistory('Hide Column', `Hidden column "${col}"`);
      
      toast({
        title: "Column Hidden",
        description: `Column "${col}" is now hidden`,
      });
    }
  };

  const handleUnhideColumn = (col: string) => {
    if (!data) return;
    
    // Save current state before making changes
    saveToUndoStack(data);
    
    // Remove column from hidden columns list
    const updatedHiddenColumns = (data.hiddenColumns || []).filter(c => c !== col);
    const updatedData = {
      ...data,
      hiddenColumns: updatedHiddenColumns
    };
    
    onDataChange(updatedData);
    
    // Add to history
    addToHistory('Unhide Column', `Unhidden column "${col}"`);
    
    toast({
      title: "Column Unhidden",
      description: `Column "${col}" is now visible`,
    });
  };

  const handleColumnMultiSelect = (
    header: string,
    modifiers?: { ctrlKey?: boolean; metaKey?: boolean },
  ) => {
    const isMultiSelect = modifiers?.ctrlKey || modifiers?.metaKey;
    if (isMultiSelect) {
      // Multi-select mode
      setMultiSelectedColumns(prev => {
        const newSet = new Set(prev);
        if (newSet.has(header)) {
          newSet.delete(header);
        } else {
          newSet.add(header);
        }
        return newSet;
      });
    } else {
      // Single select mode
      setMultiSelectedColumns(new Set([header]));
    }
  };

  const handleRowMultiSelect = (rowIndex: number, event: React.MouseEvent) => {
    // Calculate the original row index in the unfiltered data
    const originalRowIndex = data?.rows.findIndex((_, idx) => {
      if (permanentlyDeletedRows.has(idx)) return false;
      const filteredIndex = data.rows.slice(0, idx).filter((_, i) => !permanentlyDeletedRows.has(i)).length;
      return filteredIndex === startIndex + rowIndex;
    }) ?? -1;
    
    if (originalRowIndex === -1) return;
    
    if (event.ctrlKey || event.metaKey) {
      // Multi-select mode
      setMultiSelectedRows(prev => {
        const newSet = new Set(prev);
        if (newSet.has(originalRowIndex)) {
          newSet.delete(originalRowIndex);
        } else {
          newSet.add(originalRowIndex);
        }
        return newSet;
      });
    } else if (event.shiftKey && multiSelectedRows.size > 0) {
      // Range select mode
      const selectedRows = Array.from(multiSelectedRows).sort((a, b) => (a as number) - (b as number));
      const lastSelected = selectedRows[selectedRows.length - 1];
      if (lastSelected === undefined) return;
      const start = Math.min(lastSelected as number, originalRowIndex);
      const end = Math.max(lastSelected as number, originalRowIndex);
      
      setMultiSelectedRows(prev => {
        const newSet = new Set(prev);
        for (let i = start; i <= end; i++) {
          if (!permanentlyDeletedRows.has(i)) {
            newSet.add(i);
          }
        }
        return newSet;
      });
    } else {
      // Single select mode
      setMultiSelectedRows(new Set([originalRowIndex]));
      
      // 🔧 Excel-like: Also set as active cell (first visible column)
      if (data?.headers) {
        const firstVisibleColumn = data.headers.filter(h => !(data.hiddenColumns || []).includes(h))[0];
        if (firstVisibleColumn) {
          setSelectedCell({ row: originalRowIndex, col: firstVisibleColumn });
          activateFormulaBar(firstVisibleColumn, { editMode: true });
        }
      }
    }
  };

  const handleRowCheckboxChange = (rowIndex: number, checked: boolean) => {
    // Calculate the original row index in the unfiltered data
    const originalRowIndex = data?.rows.findIndex((_, idx) => {
      if (permanentlyDeletedRows.has(idx)) return false;
      const filteredIndex = data.rows.slice(0, idx).filter((_, i) => !permanentlyDeletedRows.has(i)).length;
      return filteredIndex === startIndex + rowIndex;
    }) ?? -1;
    
    if (originalRowIndex === -1) return;
    
    setMultiSelectedRows(prev => {
      const newSet = new Set(prev);
      if (checked) {
        newSet.add(originalRowIndex);
      } else {
        newSet.delete(originalRowIndex);
      }
      return newSet;
    });
  };

  const handleCheckboxClick = (rowIndex: number, event: React.MouseEvent) => {
    // Calculate the original row index in the unfiltered data
    const originalRowIndex = data?.rows.findIndex((_, idx) => {
      if (permanentlyDeletedRows.has(idx)) return false;
      const filteredIndex = data.rows.slice(0, idx).filter((_, i) => !permanentlyDeletedRows.has(i)).length;
      return filteredIndex === startIndex + rowIndex;
    }) ?? -1;
    
    if (originalRowIndex === -1) return;
    
    // Prevent the row click event from firing when clicking checkbox
    event.stopPropagation();
    
    const isCurrentlySelected = multiSelectedRows.has(originalRowIndex);
    const newCheckedState = !isCurrentlySelected;
    
    setMultiSelectedRows(prev => {
      const newSet = new Set(prev);
      
      // Default behavior: multi-select mode (like filter checkboxes)
      // Toggle this row without clearing others
      if (newCheckedState) {
        newSet.add(originalRowIndex);
      } else {
        newSet.delete(originalRowIndex);
      }
      
      return newSet;
    });
  };

  const handleSelectAllRows = (checked: boolean) => {
    setSelectAllRows(checked);
    if (checked) {
      // Select all visible rows
      const allVisibleRowIndices = processedData.filteredRows.map((_, rowIndex) => {
        const originalRowIndex = data?.rows.findIndex((originalRow, idx) => {
          if (permanentlyDeletedRows.has(idx)) return false;
          return originalRow === processedData.filteredRows[rowIndex];
        }) ?? -1;
        return originalRowIndex;
      }).filter(index => index !== -1);
      
      setMultiSelectedRows(new Set(allVisibleRowIndices));
    } else {
      // Deselect all rows
      setMultiSelectedRows(new Set());
    }
  };

  const handleConfirmDelete = async () => {
    if (!data || deleteConfirmModal.columnsToDelete.length === 0) return;
    
    console.log('[DataFrameOperations] Bulk delete - columns:', deleteConfirmModal.columnsToDelete);
    
    // 🔧 SAFETY: Clear selectedCell if any deleted column is the active column
    if (selectedCell && deleteConfirmModal.columnsToDelete.includes(selectedCell.col)) {
      setSelectedCell(null);
      console.log('[DataFrameOperations] Cleared active cell - column in bulk delete');
    }
    
    // Save current state before making changes
    saveToUndoStack(data);
    
    setBulkDeleteLoading(true);
    try {
      // ALWAYS do frontend-only delete - no API calls
      // This avoids backend sync issues and 404 errors
      const columnsToDelete = deleteConfirmModal.columnsToDelete;
      
      // Remove columns from headers
      const headers = data.headers.filter(h => !columnsToDelete.includes(h));
      
      // Remove columns from rows
      const rows = data.rows.map(row => {
        const newRow = { ...row };
        columnsToDelete.forEach(col => delete newRow[col]);
        return newRow;
      });
      
      // Remove from columnTypes
      const types = { ...data.columnTypes };
      columnsToDelete.forEach(col => delete types[col]);
      
      // Remove from hiddenColumns
      const updatedHiddenColumns = (data.hiddenColumns || []).filter(
        h => !columnsToDelete.includes(h)
      );
      
      // Track deleted columns
      const updatedDeletedColumns = [...(data.deletedColumns || []), ...columnsToDelete];
      
      const updatedData = {
        headers,
        rows,
        fileName: data.fileName,
        columnTypes: types,
        pinnedColumns: data.pinnedColumns.filter(p => !columnsToDelete.includes(p)),
        frozenColumns: data.frozenColumns,
        cellColors: data.cellColors,
        hiddenColumns: updatedHiddenColumns,
        deletedColumns: updatedDeletedColumns
      };
      
      onDataChange(updatedData);
      
      // Clear selection after deletion
      setMultiSelectedColumns(new Set());
      
      // Add to history
      addToHistory('Bulk Delete Columns', `Deleted ${columnsToDelete.length} columns: ${columnsToDelete.join(', ')}`);
      
      toast({
        title: "Success",
        description: `${columnsToDelete.length} column(s) deleted successfully`,
      });
    } catch (err) {
      console.error('[DataFrameOperations] Bulk delete error:', err);
      handleApiError('Bulk delete failed', err);
    } finally {
      setBulkDeleteLoading(false);
      setDeleteConfirmModal({ isOpen: false, columnsToDelete: [] });
    }
  };

  const handleConfirmRowDelete = async () => {
    if (!data || rowDeleteConfirmModal.rowsToDelete.length === 0) return;
    
    setBulkDeleteLoading(true);
    try {
      // 🔧 SAFETY: Clear selectedCell if any deleted row is the active row
      if (selectedCell && rowDeleteConfirmModal.rowsToDelete.includes(selectedCell.row)) {
        setSelectedCell(null);
        console.log('[DataFrameOperations] Cleared active cell - row in bulk delete');
      }
      
      // Mark rows as permanently deleted (local only)
      setPermanentlyDeletedRows(prev => {
        const newSet = new Set(prev);
        rowDeleteConfirmModal.rowsToDelete.forEach(rowIdx => newSet.add(rowIdx));
        return newSet;
      });
      
      // Clear selection after deletion
      setMultiSelectedRows(new Set());
      
      // Add to history
      addToHistory('Bulk Delete Rows', `Deleted ${rowDeleteConfirmModal.rowsToDelete.length} rows`);
      
      toast({
        title: "Success",
        description: `${rowDeleteConfirmModal.rowsToDelete.length} row(s) deleted successfully`,
      });
    } catch (err) {
      handleApiError('Bulk row delete failed', err);
    } finally {
      setBulkDeleteLoading(false);
      setRowDeleteConfirmModal({ isOpen: false, rowsToDelete: [] });
    }
  };

  useLayoutEffect(() => {
    if (!data) return;
    const el = containerRef.current;
    if (el) {
      // Only reset scroll position, don't modify height to preserve flex layout
      el.scrollTop = 0;
    }
  }, [data]);

  // Keyboard shortcuts for multi-select
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Handle Ctrl+Z for undo
      if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
        if (isEditingFormula) {
          return;
        }
        e.preventDefault();
        handleUndo();
        return;
      }
      
      // Handle Ctrl+Y or Ctrl+Shift+Z for redo
      if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
        if (isEditingFormula) {
          return;
        }
        e.preventDefault();
        handleRedo();
        return;
      }
      
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'f') {
          e.preventDefault();
          setFindReplaceModalOpen(true);
          return;
        }
        if (e.key === 'a' && data?.headers) {
          e.preventDefault();
          setMultiSelectedColumns(new Set(data.headers));
          // Select all filtered rows (not just visible ones)
          const filteredIndices = processedData.filteredRows.map(filteredRow => {
            return data.rows.findIndex((row, origIndex) => {
              if (permanentlyDeletedRows.has(origIndex)) return false;
              return row === filteredRow;
            });
          }).filter(index => index !== -1);
          
          setMultiSelectedRows(new Set(filteredIndices));
          setSelectAllRows(true);
        }
      }
      if (e.key === 'Escape') {
        setMultiSelectedColumns(new Set());
        setMultiSelectedRows(new Set());
        setSelectAllRows(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [data?.headers, data?.rows, permanentlyDeletedRows, processedData.filteredRows, handleUndo, handleRedo, isEditingFormula]);

  // Debounced search effect
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (findText.trim()) {
        handleCountMatches(findText, caseSensitive);
      } else {
        setMatchCount(0);
        setMatchesByColumn({});
        setHighlightedText('');
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [findText, caseSensitive]);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={handleFileUpload}
        className="hidden"
      />

      <div id={`atom-${atomId}`} ref={containerRef} className="w-full h-full p-6 overflow-y-auto" style={{position: 'relative'}}>
        <style>{`
          #atom-${atomId} .table-base th,
          #atom-${atomId} .table-base td {
            min-width: 3rem !important;
          }
        `}</style>
        <div className="mx-auto w-full rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* File name display in separate blue header section */}
        {data?.fileName && (
          <div className="border-b border-blue-200 bg-blue-50">
            <div className="flex items-center px-6 py-4">
              <div className="relative">
                <div className="flex items-center space-x-2 px-5 py-3 rounded-t-xl text-sm font-medium border-t border-l border-r border-slate-200 bg-white -mb-px shadow-lg">
                  <FileText className="w-4 h-4" />
                  <span>{data.fileName.split('/').pop()}</span>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* Cardinality view (aligned with Column Classifier) */}
        {data && data.headers && data.headers.length > 0 && (
          <div className="border-b border-slate-200 px-5 py-4">
            <DataFrameCardinalityView data={data} atomId={atomId} />
          </div>
        )}

        {/* Controls section */}
        
        {/* Tab Navigation and Controls */}
        <div className="border-b border-slate-200 bg-white">
          <div className="flex items-center justify-between px-6 py-3">
            {/* Tabs */}
            <div className="flex items-center space-x-1 bg-slate-100 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('dataframe')}
                className={`px-4 py-2.5 text-sm font-medium transition-all duration-200 rounded-md flex items-center space-x-2 whitespace-nowrap ${
                  activeTab === 'dataframe'
                    ? 'bg-white text-blue-600 shadow-sm border border-blue-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Table className="w-4 h-4" />
                <span>DataFrame Operations</span>
              </button>
              <button
                onClick={() => setActiveTab('pivot')}
                className={`px-4 py-2.5 text-sm font-medium transition-all duration-200 rounded-md flex items-center space-x-2 ${
                  activeTab === 'pivot'
                    ? 'bg-white text-emerald-600 shadow-sm border border-emerald-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Grid3x3 className="w-4 h-4" />
                <span>Pivot Table</span>
              </button>
            </div>

            {/* Alignment Control and Save Buttons */}
            <div className="flex items-center gap-7">
              {/* Alignment Control */}
              {activeTab === 'dataframe' && (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 w-8 p-0"
                      title={`Text Alignment${selectedColumn ? ` (${selectedColumn})` : ' (All Columns)'}`}
                    >
                      {(() => {
                        const currentAlignment = selectedColumn ? getColumnAlignment(selectedColumn) : cellAlignment;
                        if (currentAlignment === 'left') return <AlignLeft className="h-4 w-4" />;
                        if (currentAlignment === 'center') return <AlignCenter className="h-4 w-4" />;
                        if (currentAlignment === 'right') return <AlignRight className="h-4 w-4" />;
                        return <AlignLeft className="h-4 w-4" />;
                      })()}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-48 p-2">
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-gray-700 mb-2">
                        Text Alignment{selectedColumn ? ` - ${selectedColumn}` : ' - All Columns'}
                      </div>
                      <Button
                        variant={(() => {
                          const currentAlignment = selectedColumn ? getColumnAlignment(selectedColumn) : cellAlignment;
                          return currentAlignment === 'left' ? 'default' : 'ghost';
                        })()}
                        size="sm"
                        className="w-full justify-start h-8"
                        onClick={() => {
                          if (selectedColumn) {
                            setColumnAlignments(prev => ({ ...prev, [selectedColumn]: 'left' }));
                          } else {
                            setCellAlignment('left');
                            setColumnAlignments({}); // Reset column-specific alignments
                          }
                        }}
                      >
                        <AlignLeft className="h-4 w-4 mr-2" />
                        Left Align
                      </Button>
                      <Button
                        variant={(() => {
                          const currentAlignment = selectedColumn ? getColumnAlignment(selectedColumn) : cellAlignment;
                          return currentAlignment === 'center' ? 'default' : 'ghost';
                        })()}
                        size="sm"
                        className="w-full justify-start h-8"
                        onClick={() => {
                          if (selectedColumn) {
                            setColumnAlignments(prev => ({ ...prev, [selectedColumn]: 'center' }));
                          } else {
                            setCellAlignment('center');
                            setColumnAlignments({}); // Reset column-specific alignments
                          }
                        }}
                      >
                        <AlignCenter className="h-4 w-4 mr-2" />
                        Center Align
                      </Button>
                      <Button
                        variant={(() => {
                          const currentAlignment = selectedColumn ? getColumnAlignment(selectedColumn) : cellAlignment;
                          return currentAlignment === 'right' ? 'default' : 'ghost';
                        })()}
                        size="sm"
                        className="w-full justify-start h-8"
                        onClick={() => {
                          if (selectedColumn) {
                            setColumnAlignments(prev => ({ ...prev, [selectedColumn]: 'right' }));
                          } else {
                            setCellAlignment('right');
                            setColumnAlignments({}); // Reset column-specific alignments
                          }
                        }}
                      >
                        <AlignRight className="h-4 w-4 mr-2" />
                        Right Align
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
              
              {/* Save Buttons - Only show when DataFrame tab is active */}
              {activeTab === 'dataframe' && (
                <>
                  <Button
                    onClick={handleSaveToOriginalFile}
                    disabled={saveLoading}
                    className="bg-green-600 hover:bg-green-700 text-white flex items-center space-x-2 px-4"
                  >
                    {saveLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>Save</span>
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleSaveDataFrame}
                    disabled={saveLoading}
                    className="bg-blue-600 hover:bg-blue-700 text-white flex items-center space-x-2 px-4"
                  >
                    {saveLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>Save As</span>
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'dataframe' && (
          <>
            {/* Formula Validation Error Display */}
            {formulaValidationError && (
              <div className="flex-shrink-0 border-b border-slate-200 px-5 py-2 bg-white">
                <div className="relative">
                  <div className="px-3 py-2 bg-red-100 border border-red-300 rounded-lg shadow-sm">
                    <div className="text-xs font-medium text-red-700">
                      {formulaValidationError}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Table section - Excel-like appearance */}
            <div 
              className="flex-1 flex flex-col overflow-hidden min-h-0"
              onClick={(e) => {
                // Deselect column when clicking in empty area above the table
                if (selectedColumn && e.target === e.currentTarget) {
                  setSelectedColumn(null);
                }
              }}
            >
            {data && (
              <div 
                className="flex items-center border-b border-slate-200 min-h-0"
                onClick={(e) => {
                  // Deselect column when clicking in formula bar area
                  if (selectedColumn && e.target === e.currentTarget) {
                    setSelectedColumn(null);
                  }
                }}
              >
                <div className="flex-1 min-w-0">
                  <CollapsibleFormulaBar
                    data={data}
                    selectedCell={selectedCell}
                    selectedColumn={selectedColumn}
                    formulaInput={formulaInput}
                    isFormulaMode={isFormulaMode}
                    isFormulaBarFrozen={isFormulaBarFrozen}
                    formulaValidationError={formulaValidationError}
                    onSelectedCellChange={setSelectedCell}
                    onSelectedColumnChange={setSelectedColumn}
                    onFormulaInputChange={setFormulaInput}
                    onFormulaModeChange={setIsFormulaMode}
                    onFormulaSubmit={handleFormulaSubmit}
                    onValidationError={showValidationError}
                    formulaLoading={formulaLoading}
                    columnFormulas={columnFormulas}
                    isEditingFormula={isEditingFormula}
                    onEditingStateChange={setEditingState}
                  />
                </div>
                <button
                  onClick={() => setFindReplaceModalOpen(true)}
                  className="p-2 mx-1 hover:bg-blue-50 rounded-md transition-colors"
                  title="Find and Replace (Ctrl+F)"
                >
                  <Search className="w-6 h-6 text-blue-600" />
                </button>
                <button
                  onClick={() => setHistoryPanelOpen(true)}
                  className="p-2 mx-1 hover:bg-purple-50 rounded-md transition-colors"
                  title="History"
                >
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </button>
              </div>
            )}
            <div className="flex-1 min-h-0" style={{maxHeight: 'calc(100vh - 300px)'}}>
              {/* Placeholder for when no data is loaded */}
              {!data || !Array.isArray(data.headers) || data.headers.length === 0 ? (
                <div className="flex flex-1 items-center justify-center bg-gray-50">
                  <div className="border border-gray-200 bg-white rounded-lg p-4 text-center max-w-md w-full mx-auto">
                    <p className="p-4 text-center text-gray-500">No results to display. Upload a CSV or Excel file to see results here.</p>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  {operationLoading && (
                    <div className="absolute inset-0 bg-white/80 flex flex-col items-center justify-center z-10 text-sm text-slate-700">
                      <div className="flex flex-col items-center space-y-3">
                        {/* Rotating Circle Spinner */}
                        <div className="relative">
                          <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                        </div>
                        {/* Processing Text */}
                        <div className="text-center">
                          <p className="text-sm font-medium text-slate-700">Processing...</p>
                          <p className="text-xs text-slate-500 mt-1">Please wait while the operation completes</p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {/* Bulk Delete Loading */}
                  {bulkDeleteLoading && (
                    <LoadingAnimation status="Deleting rows..." />
                  )}
                  
                  {/* Sort Loading */}
                  {sortLoading && (
                    <LoadingAnimation status="Sorting data..." />
                  )}
                  
                  {/* Duplicate Loading */}
                  {duplicateLoading && (
                    <LoadingAnimation status="Duplicating..." />
                  )}
                  
                  {/* Insert Loading */}
                  {insertLoading && (
                    <LoadingAnimation status="Inserting..." />
                  )}
                  
                  {/* Convert Loading */}
                  {convertLoading && (
                    <LoadingAnimation status="Converting columns..." />
                  )}
                  
                  <Table className="table-base w-full" maxHeight="max-h-[500px]">
              <TableHeader 
                className="table-header"
                style={{
                  // 🔧 CRITICAL: thead MUST have higher z-index than tbody
                  // This ensures ALL headers render above ALL body cells
                  position: 'sticky',
                  top: 0,
                  zIndex: 1002,
                  backgroundColor: 'transparent'
                }}
              >
                <TableRow className="table-header-row">
                  {settings.showRowNumbers && (
                    <TableHead 
                      className="table-header-cell row-number-column text-center relative"
                      style={{
                        position: 'sticky',
                        left: '0px',
                        top: 0,
                        zIndex: 3, // Relative to thead (1002), this becomes 1005 in global context
                        // 🔧 Match color scheme: darker gray when frozen, lighter when not
                        backgroundColor: data.frozenColumns > 0 ? '#e5e7eb' : '#f3f4f6', // gray-200 (frozen) or gray-100 (unfrozen)
                        opacity: 1,
                        borderLeft: '2px solid #22c55e',
                        borderRight: '1px solid #d1d5db',
                        borderTop: '1px solid #d1d5db',
                        borderBottom: '1px solid #d1d5db',
                        boxShadow: data.frozenColumns > 0 ? '2px 0 4px rgba(0,0,0,0.1)' : 'none',
                        // 🔧 CRITICAL: Force GPU compositing and solid rendering
                        isolation: 'isolate',
                        WebkitBackfaceVisibility: 'hidden',
                        backfaceVisibility: 'hidden',
                        willChange: 'transform',
                        transform: 'translateZ(0)' // Force GPU layer
                      }}
                    >
                      <div className="flex items-center justify-center">
                        <Checkbox
                          checked={selectAllRows}
                          onCheckedChange={handleSelectAllRows}
                          className="mr-2"
                        />
                        <span className="font-bold text-black">#</span>
                      </div>
                    </TableHead>
                  )}
                  {Array.isArray(data?.headers) && data.headers.filter(header => !(data.hiddenColumns || []).includes(header)).map((header, colIdx) => {
                    // Get the original column index for API calls
                    const originalColIdx = data.headers.indexOf(header);
                    // Check if there are hidden columns before this one
                    const hiddenBefore = data.headers.slice(0, originalColIdx).filter(h => (data.hiddenColumns || []).includes(h)).length;
                    return (
                    <>
                    <TableHead
                      key={header + '-' + colIdx}
                      data-col={header}
                       className={`table-header-cell border border-gray-200 relative ${
                         // 🔧 Excel-like: Highlight column header when column is selected (via cell click or header click)
                         selectedColumn === header ? 'border-2 border-blue-500' : ''
                       } ${
                         multiSelectedColumns.has(header) ? 'border-blue-500' : ''
                       } ${
                         filters[header] ? 'bg-yellow-50' : ''
                       }`}
                      style={{
                        ...(settings.columnWidths?.[header] ? { 
                          width: settings.columnWidths[header], 
                          minWidth: '50px',
                          maxWidth: '500px'
                        } : { 
                          width: '150px', 
                          minWidth: '50px', 
                          maxWidth: '500px' 
                        }),
                        // 🔧 CRITICAL FIX: ALL headers must be sticky vertically (not just frozen)
                        position: 'sticky',
                        top: 0,
                        zIndex: data.frozenColumns && colIdx < data.frozenColumns ? 2 : 1, // Relative to thead (1002)
                        // 🔧 ALL headers get backgroundColor via inline style (overrides template CSS)
                        backgroundColor: (() => {
                          if (selectedColumn === header || multiSelectedColumns.has(header)) {
                            return '#dbeafe'; // blue-100 when selected
                          }
                          // Frozen columns: darker gray, Unfrozen: lighter gray
                          return (data.frozenColumns && colIdx < data.frozenColumns) ? '#e5e7eb' : '#f3f4f6';
                        })(),
                        ...(data.frozenColumns && colIdx < data.frozenColumns ? { 
                          // 🔧 Frozen columns: Also sticky horizontally (left positioning)
                          // Note: position: sticky and top: 0 are already set above for all headers
                          left: (() => {
                            let leftOffset = 0;
                            // Add width of # column if it's shown and frozen
                            if (settings.showRowNumbers && data.frozenColumns > 0) {
                              leftOffset += 64; // w-16 = 64px
                            }
                            for (let i = 0; i < colIdx; i++) {
                              const colWidth = settings.columnWidths?.[data.headers[i]] || 150;
                              leftOffset += colWidth;
                            }
                            return `${leftOffset}px`;
                          })(),
                          marginRight: colIdx === data.frozenColumns - 1 ? '2px' : '0px',
                          opacity: 1,
                          borderLeft: colIdx === 0 ? '1px solid #d1d5db' : '1px solid #d1d5db',
                          borderRight: colIdx === data.frozenColumns - 1 ? '2px solid #22c55e' : '1px solid #d1d5db',
                          borderTop: '1px solid #d1d5db',
                          borderBottom: '1px solid #d1d5db',
                          // 🔧 Shadow on last frozen column for visual separator
                          boxShadow: colIdx === data.frozenColumns - 1 ? '2px 0 4px rgba(0,0,0,0.1)' : 'none'
                        } : {}),
                        textAlign: getColumnAlignment(header)
                      }}
                      draggable
                      onDragStart={() => handleDragStart(header)}
                      onDragOver={e => handleDragOver(e, header)}
                      onDragEnd={handleDragEnd}
                      onContextMenu={e => {
                        e.preventDefault();
                        const { clientX, clientY } = e;
                        setContextMenu({
                          pointerX: clientX,
                          pointerY: clientY,
                          x: clientX,
                          y: clientY,
                          col: header,
                          colIdx
                        });
                        setRowContextMenu(null);
                      }}
                    onClick={(e) => {
                        const isFormulaEditingActive =
                          isFormulaMode && isEditingFormula;
                        // Only handle multi-select if not actively editing a formula
                        if (!isFormulaEditingActive) {
                          handleColumnMultiSelect(header, { ctrlKey: e.ctrlKey, metaKey: e.metaKey });
                        }

                        if (headerClickTimeoutRef.current) {
                          clearTimeout(headerClickTimeoutRef.current);
                        }

                        headerClickTimeoutRef.current = setTimeout(() => {
                          handleHeaderClick(header);
                          headerClickTimeoutRef.current = null;
                        }, 180);
                      }}
                      onDoubleClick={(e) => {
                        if (headerClickTimeoutRef.current) {
                          clearTimeout(headerClickTimeoutRef.current);
                          headerClickTimeoutRef.current = null;
                        }
                        e.stopPropagation();
                        e.preventDefault();
                        // Always allow header editing regardless of enableEditing setting
                        setEditingHeader(colIdx);
                        setEditingHeaderValue(header);
                      }}
                      ref={el => {
                        if (headerRefs.current) {
                          headerRefs.current[header] = el;
                        }
                      }}
                    >
                      {editingHeader === colIdx ? (
                        <input
                          type="text"
                          className="h-7 text-xs outline-none border-none bg-white px-0 font-bold text-black truncate w-full"
                          style={{ width: '100%', boxSizing: 'border-box', background: 'inherit', textAlign: getColumnAlignment(header), padding: 0, margin: 0 }}
                          value={editingHeaderValue}
                          autoFocus
                          onChange={e => setEditingHeaderValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') commitHeaderEdit(colIdx, (e.target as HTMLInputElement).value);
                            if (e.key === 'Escape') setEditingHeader(null);
                          }}
                          onBlur={e => commitHeaderEdit(colIdx, (e.target as HTMLInputElement).value)}
                        />
                      ) : (
                         <div
                           className="flex items-center cursor-pointer w-full h-full overflow-hidden"
                           style={{
                             justifyContent: getColumnAlignment(header) === 'left' ? 'flex-start' : 
                                           getColumnAlignment(header) === 'center' ? 'center' : 'flex-end',
                             width: '100%', 
                             height: '100%',
                             textOverflow: 'ellipsis',
                             whiteSpace: 'nowrap'
                           }}
                           onDoubleClick={() => {
                             // Always allow header editing regardless of enableEditing setting
                             setEditingHeader(colIdx);
                             setEditingHeaderValue(header);
                           }}
                           title={`Click to select • Ctrl+Click for multi-select • Double-click to edit • Delete key to delete selected\nHeader: ${headerDisplayNames[header] ?? header}`}
                         >
                           <span className="flex items-center gap-1 font-bold text-black overflow-hidden" style={{ maxWidth: '100%' }}>
                             <span className="truncate">{headerDisplayNames[header] ?? header}</span>
                             {filters[header] && (
                               <Filter className="w-3 h-3 text-blue-600 flex-shrink-0" />
                             )}
                           </span>
                         </div>
                      )}
                      <div
                        className="absolute top-0 right-0 h-full w-1 cursor-col-resize bg-blue-300 opacity-0 hover:opacity-100 transition-opacity duration-150"
                        onMouseDown={e => startColResize(header, e)}
                        style={{ 
                          zIndex: 20
                        }}
                        title="Drag to resize column"
                      />
                    </TableHead>
                    </>
                    );
                  })}
                  <TableHead className="table-header-cell w-8 sticky top-0 z-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRows.map((row, rowIndex) => {
                  // Calculate the original row index in the unfiltered data
                  const globalFilteredIndex = startIndex + rowIndex;
                  const originalRowIndex = data?.rows.findIndex((originalRow, idx) => {
                    if (permanentlyDeletedRows.has(idx)) return false;
                    // Check if this original row matches the current paginated row
                    return originalRow === row;
                  }) ?? -1;
                  const isRowSelected = originalRowIndex !== -1 && multiSelectedRows.has(originalRowIndex);
                  
                  return (
                    <TableRow
                      key={rowIndex}
                      className={`table-row relative ${isRowSelected ? 'bg-blue-100 border-blue-500' : ''}`}
                      ref={el => { if (rowRefs.current && originalRowIndex !== -1) rowRefs.current[originalRowIndex] = el; }}
                      style={{ height: originalRowIndex !== -1 ? settings.rowHeights?.[originalRowIndex] : undefined }}
                      onClick={(e) => handleRowMultiSelect(rowIndex, e)}
                    >
                      {settings.showRowNumbers && (
                        <TableCell
                          className="table-cell row-number-column text-center text-xs font-medium"
                          style={{
                            // 🔧 Row index: ONLY sticky horizontally (left), NOT vertically
                            // This allows row numbers to scroll UP behind the # header
                            position: 'sticky',
                            left: '0px',
                            // NO top: 0 here! We want rows to scroll vertically
                            zIndex: 1, // tbody cells are in a lower stacking context than thead (1002)
                            // 🔧 Row index background: Darker gray base, blue when selected/active
                            backgroundColor: (() => {
                              const isActiveCell = selectedCell?.row === originalRowIndex && !isRowSelected && selectedCell?.col && !(data.hiddenColumns || []).includes(selectedCell.col);
                              
                              if (isRowSelected) return '#bfdbfe'; // blue-200 for checkbox selected
                              if (isActiveCell) return '#dbeafe'; // blue-100 for active cell row
                              // Match color scheme: darker gray when frozen, lighter when not
                              return data.frozenColumns > 0 ? '#e5e7eb' : '#f3f4f6'; // gray-200 (frozen) or gray-100 (unfrozen)
                            })(),
                            // 🔧 Always apply fontWeight for active cell indicator
                            fontWeight: (selectedCell?.row === originalRowIndex && !isRowSelected && selectedCell?.col && !(data.hiddenColumns || []).includes(selectedCell.col)) ? 'bold' : 'normal',
                            opacity: 1,
                            borderLeft: '2px solid #22c55e',
                            borderRight: '1px solid #d1d5db',
                            borderTop: '1px solid #d1d5db',
                            borderBottom: '1px solid #d1d5db',
                            // 🔧 Shadow on right side (always present since # is always frozen)
                            boxShadow: data.frozenColumns === 0 ? '2px 0 4px rgba(0,0,0,0.1)' : 'none'
                            // 🔧 REMOVED isolation and willChange - they can interfere with scrolling
                          }}
                          onContextMenu={e => {
                            e.preventDefault();
                            const { clientX, clientY } = e;
                            setRowContextMenu({
                              pointerX: clientX,
                              pointerY: clientY,
                              x: clientX,
                              y: clientY,
                              rowIdx: originalRowIndex
                            });
                            setContextMenu(null);
                          }}
                        >
                           <div className="flex items-center justify-center">
                             <Checkbox
                               checked={isRowSelected}
                               onCheckedChange={(checked) => handleRowCheckboxChange(rowIndex, checked as boolean)}
                               onClick={(event) => handleCheckboxClick(rowIndex, event)}
                               className="mr-2"
                               title="Click to toggle selection (multi-select enabled)"
                             />
                             <span>{originalRowIndex !== -1 ? originalRowIndex + 1 : globalFilteredIndex + 1}</span>
                           </div>
                        </TableCell>
                      )}
                    {(data.headers || []).filter(column => !(data.hiddenColumns || []).includes(column)).map((column, colIdx) => {
                      const cellValue = row[column];
                      const isEditing = editingCell?.row === rowIndex && editingCell?.col === column;
                        return (
                          <TableCell
                            key={colIdx}
                            data-col={column}
                            className={`table-cell font-medium border border-gray-200 ${
                              // 🔧 Excel-like: Four highlighting modes:
                              // 1. Specific cell selected (active cell - stronger border + blue BG)
                              selectedCell?.row === originalRowIndex && selectedCell?.col === column 
                                ? 'border-2 border-blue-500' 
                                // 2. Entire column selected via header click (no specific cell)
                                : (!selectedCell && selectedColumn === column)
                                  ? 'border-blue-400'
                                  // 3. Multi-selected column (Ctrl+Click headers)
                                  : multiSelectedColumns.has(column)
                                    ? 'border-blue-400'
                                    // 4. No highlighting
                                    : ''
                            }`}
                            style={{
                              ...(settings.columnWidths?.[column] ? { 
                                width: settings.columnWidths[column], 
                                minWidth: '50px',
                                maxWidth: '500px'
                              } : { 
                                width: '150px', 
                                minWidth: '50px', 
                                maxWidth: '500px' 
                              }),
                              // 🔧 ALL cells get backgroundColor via inline style (overrides template CSS)
                              backgroundColor: (() => {
                                if (isRowSelected) return '#dbeafe'; // blue for row selection
                                if (selectedCell?.row === originalRowIndex && selectedCell?.col === column) return '#dbeafe'; // blue for active cell
                                if (!selectedCell && selectedColumn === column) return '#dbeafe'; // blue for column selection
                                if (multiSelectedColumns.has(column)) return '#dbeafe'; // blue for multi-select
                                return 'white'; // white for data cells
                              })(),
                              ...(data.frozenColumns && colIdx < data.frozenColumns ? { 
                                // 🔧 Frozen data cells: ONLY sticky horizontally (left), NOT vertically
                                // This allows cells to scroll UP behind the frozen headers
                                position: 'sticky', 
                                left: (() => {
                                  let leftOffset = 0;
                                  // Add width of # column if it's shown and frozen
                                  if (settings.showRowNumbers && data.frozenColumns > 0) {
                                    leftOffset += 64; // w-16 = 64px
                                  }
                                  for (let i = 0; i < colIdx; i++) {
                                    const colWidth = settings.columnWidths?.[data.headers[i]] || 150;
                                    leftOffset += colWidth;
                                  }
                                  return `${leftOffset}px`;
                                })(),
                                // NO top: 0 here! We want cells to scroll vertically
                                zIndex: 1, // tbody cells are in a lower stacking context than thead (1002)
                                marginRight: colIdx === data.frozenColumns - 1 ? '2px' : '0px',
                                opacity: 1,
                                borderLeft: colIdx === 0 ? '1px solid #d1d5db' : '1px solid #d1d5db',
                                borderRight: colIdx === data.frozenColumns - 1 ? '2px solid #22c55e' : '1px solid #d1d5db',
                                borderTop: '1px solid #d1d5db',
                                borderBottom: '1px solid #d1d5db',
                                // 🔧 Shadow on last frozen column for visual separator
                                boxShadow: colIdx === data.frozenColumns - 1 ? '2px 0 4px rgba(0,0,0,0.1)' : 'none'
                                // 🔧 REMOVED isolation and willChange - they can interfere with scrolling
                              } : {}),
                              textAlign: getColumnAlignment(column)
                            }}
                            onClick={(e) => {
                              e.stopPropagation(); // Prevent row selection when clicking cell
                              handleCellClick(rowIndex, column);
                            }}
                            onDoubleClick={() => {
                            // Always allow cell editing regardless of enableEditing setting
                            setEditingCell({ row: rowIndex, col: column });
                            setEditingCellValue(safeToString(row[column]));
                          }}
                        >
                          {editingCell?.row === rowIndex && editingCell?.col === column ? (
                            <input
                              type="text"
                              className="h-7 text-xs outline-none border-none bg-white px-1"
                              style={{ width: '100%', boxSizing: 'border-box', background: 'inherit' }}
                              value={editingCellValue}
                              autoFocus
                              onChange={e => setEditingCellValue(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') commitCellEdit(rowIndex, column);
                                if (e.key === 'Escape') setEditingCell(null);
                              }}
                              onBlur={() => commitCellEdit(rowIndex, column)}
                            />
                          ) : (
                            <div 
                              className="text-xs p-1 hover:bg-blue-50 rounded cursor-pointer min-h-[20px] flex items-center text-gray-800 overflow-hidden"
                              style={{
                                maxWidth: '100%',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                wordBreak: 'break-all',
                                justifyContent: getColumnAlignment(column) === 'left' ? 'flex-start' : 
                                              getColumnAlignment(column) === 'center' ? 'center' : 'flex-end'
                              }}
                              onDoubleClick={() => {
                                // Always allow cell editing regardless of enableEditing setting
                                setEditingCell({ row: rowIndex, col: column });
                                setEditingCellValue(safeToString(row[column]));
                              }}
                              title={`Double-click to edit cell\nValue: ${safeToString(row[column])}`}
                            >
                              {(() => {
                                const cellValue = safeToString(row[column]);
                                if (cellValue === '') return null;
                                
                                // Use find and replace highlighting if active
                                if (highlightedText && findReplaceModalOpen) {
                                  const highlightedValue = highlightText(cellValue, highlightedText, caseSensitive);
                                  if (highlightedValue !== cellValue) {
                                    return <span dangerouslySetInnerHTML={{ __html: highlightedValue }} />;
                                  }
                                }
                                
                                // Fall back to existing search highlighting
                                return highlightMatch(cellValue, settings.searchTerm || '');
                              })()}
                            </div>
                          )}
                        </TableCell>
                      );
                    })}
                      <TableCell className="table-cell w-8">
                      </TableCell>
                      <div
                        className="absolute bottom-0 left-0 w-full h-1 cursor-row-resize"
                        onMouseDown={e => originalRowIndex !== -1 && startRowResize(originalRowIndex, e)}
                      />
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
                </div>
              )}
            </div>
            {totalPages > 1 && (
            <div className="flex flex-col items-center py-4">
              <div className="text-sm text-muted-foreground mb-2">
                {`Showing ${startIndex + 1} to ${Math.min(startIndex + (settings.rowsPerPage || 15), processedData.totalRows)} of ${processedData.totalRows} entries`}
              </div>
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages }).map((_, i) => {
                    const pageNum = i + 1;
                    if (
                      pageNum === 1 ||
                      pageNum === totalPages ||
                      Math.abs(pageNum - currentPage) <= 2
                    ) {
                      return (
                        <PaginationItem key={pageNum}>
                          <PaginationLink
                            onClick={() => setCurrentPage(pageNum)}
                            isActive={currentPage === pageNum}
                            className="cursor-pointer"
                          >
                            {pageNum}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    }
                    if (
                      (pageNum === currentPage - 3 && pageNum > 1) ||
                      (pageNum === currentPage + 3 && pageNum < totalPages)
                    ) {
                      return <PaginationEllipsis key={pageNum} />;
                    }
                    return null;
                  })}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
            </div>
          </>
        )}

        {activeTab === 'pivot' && (
          <div ref={pivotContainerRef} className="p-6">
            <PivotTableCanvas
              data={pivotSettings}
              onDataChange={handlePivotDataChange}
              isLoading={pivotIsComputing}
              error={pivotComputeError}
              infoMessage={pivotReadinessMessage}
              isSaving={pivotIsSaving}
              saveError={pivotSaveError}
              saveMessage={
                pivotSaveMessage ||
                (pivotSettings.pivotLastSavedPath
                  ? `Last saved: ${pivotSettings.pivotLastSavedPath}`
                  : null)
              }
              onRefresh={handlePivotRefresh}
              onSave={handlePivotSave}
              onSaveAs={handlePivotSaveAs}
              filterOptions={pivotFilterOptions}
              filterSelections={pivotFilterSelections}
              onGrandTotalsChange={handlePivotGrandTotalsChange}
              onSubtotalsChange={handlePivotSubtotalsChange}
              onStyleChange={handlePivotStyleChange}
              onStyleOptionsChange={handlePivotStyleOptionsChange}
              reportLayout={pivotReportLayout}
              onReportLayoutChange={handlePivotReportLayoutChange}
              collapsedKeys={pivotCollapsedKeys}
              onToggleCollapse={handlePivotToggleCollapse}
            />
          </div>
        )}
        </div>
      </div>

      {portalTarget && contextMenu && data && typeof contextMenu.col === 'string' &&
        createPortal(
          <div
            ref={contextMenuRef}
            id={`df-ops-context-menu-${atomId}`}
            style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 1000, background: 'white', border: '1px solid #ddd', borderRadius: 6, boxShadow: '0 2px 8px #0001', minWidth: 200 }}
          >
          <div className="px-3 py-2 text-xs font-semibold border-b border-gray-200 flex items-center justify-between" style={{color:'#222'}}>
            {multiSelectedColumns.size > 1 ? 
              `${multiSelectedColumns.size} Columns Selected` : 
              `Column: ${contextMenu.col}`
            }
            <button 
              className="ml-2 w-4 h-4 rounded-full bg-blue-100 hover:bg-blue-200 flex items-center justify-center transition-colors"
              onClick={e => { 
                e.preventDefault(); 
                e.stopPropagation(); 
                handleDescribeColumn(contextMenu.col); 
                setContextMenu(null); 
                setOpenDropdown(null); 
              }}
              title={`Describe column: ${contextMenu.col}`}
            >
              <Info className="w-2.5 h-2.5 text-blue-600" />
            </button>
          </div>
          {/* Sort */}
          <div className="relative group">
            <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={e => { e.stopPropagation(); setOpenDropdown(openDropdown === 'sort' ? null : 'sort'); }}>
              Sort <span style={{fontSize:'10px',marginLeft:4}}>▶</span>
            </button>
            {openDropdown === 'sort' && (
              <div className="absolute left-full top-0 bg-white border border-gray-200 rounded shadow-md min-w-[160px] z-50">
                <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleSortAsc(contextMenu.colIdx); setContextMenu(null); setOpenDropdown(null); }}>Sort Ascending</button>
                <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleSortDesc(contextMenu.colIdx); setContextMenu(null); setOpenDropdown(null); }}>Sort Descending</button>
              </div>
            )}
          </div>
          {/* Filter */}
          <div className="relative group">
             <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={e => { 
               e.stopPropagation(); 
               // Initialize filter selections with current filter state
               if (openDropdown !== 'filter') {
                 setFilterSelections(prev => ({
                   ...prev,
                   [contextMenu.col]: Array.isArray(filters[contextMenu.col]) ? filters[contextMenu.col] : []
                 }));
               }
               setOpenDropdown(openDropdown === 'filter' ? null : 'filter'); 
             }}>
               Filter <span style={{fontSize:'10px',marginLeft:4}}>▶</span>
             </button>
            {openDropdown === 'filter' && (
              <div className="absolute left-full top-0 bg-white border border-gray-200 rounded shadow-md min-w-[180px] z-50 p-2">
                {/* Excel-like Number Filter UI */}
                {data && data.columnTypes[contextMenu.col] === 'number' ? (
                  <NumberFilterComponent
                    column={contextMenu.col}
                    data={data}
                    onApplyFilter={handleColumnFilter}
                    onClearFilter={handleClearFilter}
                    onClose={() => {
                      setContextMenu(null);
                      setOpenDropdown(null);
                    }}
                  />
                 ) : (
                   <div className="max-h-48 overflow-y-auto space-y-1">
                     {/* Select All / Deselect All */}
                     <div className="border-b border-gray-200 pb-2 mb-2">
                       <label className="flex items-center space-x-2 text-xs cursor-pointer font-medium" style={{userSelect:'none'}} onMouseDown={e => e.stopPropagation()}>
                         <input
                           type="checkbox"
                           checked={Array.isArray(filterSelections[contextMenu.col]) && processedData.uniqueValues[contextMenu.col]?.every(value => 
                             Array.isArray(filterSelections[contextMenu.col]) && filterSelections[contextMenu.col].includes(value)
                           )}
                           onMouseDown={e => e.stopPropagation()}
                           onChange={e => {
                             const allValues = processedData.uniqueValues[contextMenu.col] || [];
                             if (e.target.checked) {
                               setFilterSelections(prev => ({
                                 ...prev,
                                 [contextMenu.col]: allValues
                               }));
                             } else {
                               setFilterSelections(prev => ({
                                 ...prev,
                                 [contextMenu.col]: []
                               }));
                             }
                           }}
                           style={{ accentColor: '#222' }}
                         />
                         <span className="truncate font-semibold">
                           {Array.isArray(filterSelections[contextMenu.col]) && processedData.uniqueValues[contextMenu.col]?.every(value => 
                             Array.isArray(filterSelections[contextMenu.col]) && filterSelections[contextMenu.col].includes(value)
                           ) ? 'Deselect All' : 'Select All'}
                         </span>
                       </label>
                     </div>
                     
                     {/* Individual filter options */}
                     {processedData.uniqueValues[contextMenu.col]?.map((value) => (
                       <label key={value} className="flex items-center space-x-2 text-xs cursor-pointer" style={{userSelect:'none'}} onMouseDown={e => e.stopPropagation()}>
                         <input
                           type="checkbox"
                           checked={Array.isArray(filterSelections[contextMenu.col]) && filterSelections[contextMenu.col].includes(value)}
                           onMouseDown={e => e.stopPropagation()}
                           onChange={e => {
                             const currentSelections = Array.isArray(filterSelections[contextMenu.col]) ? filterSelections[contextMenu.col] : [];
                             const newSelections = e.target.checked
                               ? [...currentSelections, value]
                               : currentSelections.filter(v => v !== value);
                             // Update local selections without applying
                             setFilterSelections(prev => ({
                               ...prev,
                               [contextMenu.col]: newSelections
                             }));
                           }}
                           style={{ accentColor: '#222' }}
                         />
                         <span className="truncate">{value}</span>
                       </label>
                     ))}
                     
                     {/* Action buttons */}
                     <div className="mt-3 flex gap-2">
                       <button
                         className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white flex-1"
                         onClick={e => {
                           e.preventDefault();
                           e.stopPropagation();
                           const currentSelections = filterSelections[contextMenu.col] || [];
                           handleColumnFilter(contextMenu.col, currentSelections);
                           setContextMenu(null);
                           setOpenDropdown(null);
                         }}
                       >Apply</button>
                       <button
                         className="px-2 py-1 text-xs rounded bg-blue-500 hover:bg-blue-600 text-white flex-1"
                         onClick={e => {
                           e.preventDefault();
                           e.stopPropagation();
                           handleClearFilter(contextMenu.col);
                           setFilterSelections(prev => ({
                             ...prev,
                             [contextMenu.col]: []
                           }));
                           setContextMenu(null);
                           setOpenDropdown(null);
                         }}
                       >Clear</button>
                     </div>
                   </div>
                 )}
              </div>
            )}
          </div>
          {/* Operation Submenu - placed after Filter */}
          {/* Convert To - moved from Operation submenu */}
          <div 
            className="relative"
            onMouseEnter={() => setConvertSubmenuOpen(true)}
            onMouseLeave={() => setConvertSubmenuOpen(false)}
          >
            <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100">
              Convert to <span style={{fontSize:'10px',marginLeft:4}}>▶</span>
            </button>
            {convertSubmenuOpen && (
              <div className="absolute left-full top-0 bg-white border border-gray-200 rounded shadow-md min-w-[140px] max-h-[300px] overflow-y-auto z-50" style={{ scrollbarWidth: 'thin' }}>
                {multiSelectedColumns.size > 1 ? (
                  <>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleMultiColumnRetype(Array.from(multiSelectedColumns), 'text'); setContextMenu(null); setOpenDropdown(null); setConvertSubmenuOpen(false); }}>String/Text (All)</button>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleMultiColumnRetype(Array.from(multiSelectedColumns), 'number'); setContextMenu(null); setOpenDropdown(null); setConvertSubmenuOpen(false); }}>Integer (All)</button>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleMultiColumnRetype(Array.from(multiSelectedColumns), 'number'); setContextMenu(null); setOpenDropdown(null); setConvertSubmenuOpen(false); }}>Float (All)</button>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleMultiColumnRetype(Array.from(multiSelectedColumns), 'date'); setContextMenu(null); setOpenDropdown(null); setConvertSubmenuOpen(false); }}>Date/DateTime (All)</button>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleMultiColumnRetype(Array.from(multiSelectedColumns), 'text'); setContextMenu(null); setOpenDropdown(null); setConvertSubmenuOpen(false); }}>Boolean (All)</button>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleMultiColumnRetype(Array.from(multiSelectedColumns), 'text'); setContextMenu(null); setOpenDropdown(null); setConvertSubmenuOpen(false); }}>Category (All)</button>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleMultiColumnRetype(Array.from(multiSelectedColumns), 'number'); setContextMenu(null); setOpenDropdown(null); setConvertSubmenuOpen(false); }}>Decimal (All)</button>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleMultiColumnRetype(Array.from(multiSelectedColumns), 'text'); setContextMenu(null); setOpenDropdown(null); setConvertSubmenuOpen(false); }}>Object (All)</button>
                  </>
                ) : (
                  <>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleRetypeColumn(contextMenu.col, 'text'); setContextMenu(null); setOpenDropdown(null); setConvertSubmenuOpen(false); }}>String/Text</button>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleRetypeColumn(contextMenu.col, 'number'); setContextMenu(null); setOpenDropdown(null); setConvertSubmenuOpen(false); }}>Integer</button>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleRetypeColumn(contextMenu.col, 'number'); setContextMenu(null); setOpenDropdown(null); setConvertSubmenuOpen(false); }}>Float</button>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleRetypeColumn(contextMenu.col, 'date'); setContextMenu(null); setOpenDropdown(null); setConvertSubmenuOpen(false); }}>Date/DateTime</button>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleRetypeColumn(contextMenu.col, 'text'); setContextMenu(null); setOpenDropdown(null); setConvertSubmenuOpen(false); }}>Boolean</button>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleRetypeColumn(contextMenu.col, 'text'); setContextMenu(null); setOpenDropdown(null); setConvertSubmenuOpen(false); }}>Category</button>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleRetypeColumn(contextMenu.col, 'number'); setContextMenu(null); setOpenDropdown(null); setConvertSubmenuOpen(false); }}>Decimal</button>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleRetypeColumn(contextMenu.col, 'text'); setContextMenu(null); setOpenDropdown(null); setConvertSubmenuOpen(false); }}>Object</button>
                  </>
                )}
              </div>
            )}
          </div>
          {/* Letter Case - dropdown like Convert to */}
          <div 
            className="relative"
            onMouseEnter={() => setCaseSubmenuOpen(true)}
            onMouseLeave={() => setCaseSubmenuOpen(false)}
          >
            <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100">
              Letter Case <span style={{fontSize:'10px',marginLeft:4}}>▶</span>
            </button>
            {caseSubmenuOpen && (
              <div className="absolute left-full top-0 bg-white border border-gray-200 rounded shadow-md min-w-[180px] max-h-[400px] overflow-y-auto z-50" style={{ scrollbarWidth: 'thin' }}>
                {multiSelectedColumns.size > 1 ? (
                  <>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleTransformColumnCase(Array.from(multiSelectedColumns), 'lower'); setContextMenu(null); setOpenDropdown(null); setCaseSubmenuOpen(false); }}>Lowercase (All)</button>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleTransformColumnCase(Array.from(multiSelectedColumns), 'upper'); setContextMenu(null); setOpenDropdown(null); setCaseSubmenuOpen(false); }}>Uppercase (All)</button>
                    <div className="border-t border-gray-100 my-1"></div>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleTransformColumnCase(Array.from(multiSelectedColumns), 'pascal'); setContextMenu(null); setOpenDropdown(null); setCaseSubmenuOpen(false); }}>Pascal Case (All)</button>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleTransformColumnCase(Array.from(multiSelectedColumns), 'lower_camel'); setContextMenu(null); setOpenDropdown(null); setCaseSubmenuOpen(false); }}>Lower Camel Case (All)</button>
                    <div className="border-t border-gray-100 my-1"></div>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleTransformColumnCase(Array.from(multiSelectedColumns), 'snake'); setContextMenu(null); setOpenDropdown(null); setCaseSubmenuOpen(false); }}>Snake Case (All)</button>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleTransformColumnCase(Array.from(multiSelectedColumns), 'screaming_snake'); setContextMenu(null); setOpenDropdown(null); setCaseSubmenuOpen(false); }}>SCREAMING_SNAKE_CASE (All)</button>
                    <div className="border-t border-gray-100 my-1"></div>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleTransformColumnCase(Array.from(multiSelectedColumns), 'kebab'); setContextMenu(null); setOpenDropdown(null); setCaseSubmenuOpen(false); }}>Kebab Case (All)</button>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleTransformColumnCase(Array.from(multiSelectedColumns), 'train'); setContextMenu(null); setOpenDropdown(null); setCaseSubmenuOpen(false); }}>Train Case (All)</button>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleTransformColumnCase(Array.from(multiSelectedColumns), 'flat'); setContextMenu(null); setOpenDropdown(null); setCaseSubmenuOpen(false); }}>Flat Case (All)</button>
                  </>
                ) : (
                  <>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleTransformColumnCase([contextMenu.col], 'lower'); setContextMenu(null); setOpenDropdown(null); setCaseSubmenuOpen(false); }}>Lowercase</button>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleTransformColumnCase([contextMenu.col], 'upper'); setContextMenu(null); setOpenDropdown(null); setCaseSubmenuOpen(false); }}>Uppercase</button>
                    <div className="border-t border-gray-100 my-1"></div>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleTransformColumnCase([contextMenu.col], 'pascal'); setContextMenu(null); setOpenDropdown(null); setCaseSubmenuOpen(false); }}>Pascal Case</button>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleTransformColumnCase([contextMenu.col], 'lower_camel'); setContextMenu(null); setOpenDropdown(null); setCaseSubmenuOpen(false); }}>Lower Camel Case</button>
                    <div className="border-t border-gray-100 my-1"></div>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleTransformColumnCase([contextMenu.col], 'snake'); setContextMenu(null); setOpenDropdown(null); setCaseSubmenuOpen(false); }}>Snake Case</button>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleTransformColumnCase([contextMenu.col], 'screaming_snake'); setContextMenu(null); setOpenDropdown(null); setCaseSubmenuOpen(false); }}>SCREAMING_SNAKE_CASE</button>
                    <div className="border-t border-gray-100 my-1"></div>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleTransformColumnCase([contextMenu.col], 'kebab'); setContextMenu(null); setOpenDropdown(null); setCaseSubmenuOpen(false); }}>Kebab Case</button>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleTransformColumnCase([contextMenu.col], 'train'); setContextMenu(null); setOpenDropdown(null); setCaseSubmenuOpen(false); }}>Train Case</button>
                    <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleTransformColumnCase([contextMenu.col], 'flat'); setContextMenu(null); setOpenDropdown(null); setCaseSubmenuOpen(false); }}>Flat Case</button>
                  </>
                )}
              </div>
            )}
          </div>
          {/* Round - dropdown like Sort */}
          <div className="relative group">
            <button 
              className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" 
              onClick={e => { 
                e.stopPropagation(); 
                setOpenDropdown(openDropdown === 'round' ? null : 'round'); 
              }}
            >
              Round <span style={{fontSize:'10px',marginLeft:4}}>▶</span>
            </button>
            {openDropdown === 'round' && (
              <div className="absolute left-full top-0 bg-white border border-gray-200 rounded shadow-md min-w-[120px] z-50 p-2">
                <div className="flex items-center space-x-2 mb-2">
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={roundDecimalPlaces}
                    onChange={(e) => setRoundDecimalPlaces(Math.max(0, Math.min(10, parseInt(e.target.value) || 0)))}
                    className="w-12 text-xs text-center border border-gray-300 rounded px-1 py-0.5"
                    placeholder="2"
                  />
                </div>
                <button 
                  className="w-full px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                  onClick={() => {
                    const columnsToRound = multiSelectedColumns.size > 1 ? 
                      Array.from(multiSelectedColumns) : 
                      (contextMenu?.col ? [contextMenu.col] : []);
                    
                    if (columnsToRound.length > 0) {
                      handleRoundColumns(columnsToRound, roundDecimalPlaces);
                      setContextMenu(null);
                      setOpenDropdown(null);
                    }
                  }}
                >
                  Apply
                </button>
              </div>
            )}
          </div>
          {/* Duplicate - moved from Operation submenu */}
          <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={e => { e.preventDefault(); e.stopPropagation(); handleDuplicateColumn(contextMenu.colIdx); setContextMenu(null); setOpenDropdown(null); }}>Duplicate</button>
          {/* Hide - moved from Operation submenu */}
          <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={e => { e.preventDefault(); e.stopPropagation(); handleHideColumn(contextMenu.col); setContextMenu(null); setOpenDropdown(null); }}>Hide</button>
          {/* Unhide - shows submenu with hidden columns only when there are hidden columns */}
          {data.hiddenColumns && data.hiddenColumns.length > 0 && (
            <div 
              className="relative"
              onMouseEnter={() => {
                setUnhideSubmenuOpen(true);
                setSelectedHiddenColumns([]); // Reset selections when opening
              }}
              onMouseLeave={() => setUnhideSubmenuOpen(false)}
            >
              <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100">
                Unhide <span style={{fontSize:'10px',marginLeft:4}}>▶</span>
              </button>
              {unhideSubmenuOpen && (
                <div 
                  className="absolute bg-white border border-gray-200 rounded shadow-md min-w-[180px] max-h-[300px] overflow-y-auto z-50 p-2" 
                  style={{ 
                    scrollbarWidth: 'thin',
                    left: '100%',
                    top: 0,
                    transform: 'translateY(0)'
                  }}
                  onMouseDown={e => e.stopPropagation()}
                >
                  {/* Select All / Deselect All */}
                  <div className="border-b border-gray-200 pb-2 mb-2">
                    <label className="flex items-center space-x-2 text-xs cursor-pointer font-medium" style={{userSelect:'none'}}>
                      <input
                        type="checkbox"
                        checked={selectedHiddenColumns.length === data.hiddenColumns.length}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedHiddenColumns([...data.hiddenColumns]);
                          } else {
                            setSelectedHiddenColumns([]);
                          }
                        }}
                        style={{ accentColor: '#2563eb' }}
                      />
                      <span className="truncate font-semibold">
                        {selectedHiddenColumns.length === data.hiddenColumns.length ? 'Deselect All' : 'Select All'}
                      </span>
                    </label>
                  </div>
                  
                  {/* Individual hidden columns with checkboxes */}
                  {data.hiddenColumns.map(hiddenCol => (
                    <label
                      key={hiddenCol}
                      className="flex items-center space-x-2 text-xs cursor-pointer py-1 hover:bg-gray-50 rounded px-1"
                      style={{userSelect:'none'}}
                    >
                      <input
                        type="checkbox"
                        checked={selectedHiddenColumns.includes(hiddenCol)}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedHiddenColumns(prev => [...prev, hiddenCol]);
                          } else {
                            setSelectedHiddenColumns(prev => prev.filter(c => c !== hiddenCol));
                          }
                        }}
                        style={{ accentColor: '#2563eb' }}
                      />
                      <span className="truncate">{hiddenCol}</span>
                    </label>
                  ))}
                  
                  {/* Action Buttons */}
                  <div className="mt-3 pt-2 border-t border-gray-200 flex gap-2">
                    <button
                      className="px-3 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white flex-1"
                      onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (selectedHiddenColumns.length > 0) {
                          // Unhide all selected columns
                          const updatedData = {
                            ...data,
                            hiddenColumns: (data.hiddenColumns || []).filter(c => !selectedHiddenColumns.includes(c))
                          };
                          saveToUndoStack(data);
                          onDataChange(updatedData);
                          addToHistory('Unhide Columns', `Unhidden ${selectedHiddenColumns.length} columns: ${selectedHiddenColumns.join(', ')}`);
                          toast({
                            title: "Columns Unhidden",
                            description: `${selectedHiddenColumns.length} column(s) are now visible`,
                          });
                          setSelectedHiddenColumns([]);
                          setUnhideSubmenuOpen(false);
                        }
                        setContextMenu(null);
                        setOpenDropdown(null);
                      }}
                      disabled={selectedHiddenColumns.length === 0}
                    >
                      Unhide ({selectedHiddenColumns.length})
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {/* Insert */}
          <button
            className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100"
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              handleInsertColumn(contextMenu.colIdx);
              setContextMenu(null);
            }}
          >Insert</button>
          {/* Delete */}
          <button
            className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100"
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              handleDeleteColumn(contextMenu.colIdx);
              setContextMenu(null);
            }}
          >Delete</button>
          {/* Freeze Pane */}
          {data.frozenColumns === 0 ? (
            <button
              className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100"
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                handleFreezePane(contextMenu.colIdx);
                setContextMenu(null);
              }}
            >Freeze Pane</button>
          ) : (
            <button
              className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100"
              onClick={e => {
                e.preventDefault();
                e.stopPropagation();
                handleUnfreezePane();
                setContextMenu(null);
              }}
            >Unfreeze Pane</button>
          )}
          </div>,
          portalTarget
        )}
      {portalTarget && rowContextMenu && typeof rowContextMenu.rowIdx === 'number' &&
        createPortal(
          <div
            ref={rowContextMenuRef}
            id={`df-ops-row-context-menu-${atomId}`}
            style={{ position: 'fixed', top: rowContextMenu.y, left: rowContextMenu.x, zIndex: 1000, background: 'white', border: '1px solid #ddd', borderRadius: 6, boxShadow: '0 2px 8px #0001', minWidth: 140 }}
          >
          <div className="px-3 py-2 text-xs font-semibold border-b border-gray-200" style={{color:'#222'}}>Row: {rowContextMenu.rowIdx + 1}</div>
          <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={e => { e.preventDefault(); e.stopPropagation(); handleInsertRow('above', rowContextMenu.rowIdx); setRowContextMenu(null); }}>Insert</button>
          <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={e => { e.preventDefault(); e.stopPropagation(); handleDuplicateRow(rowContextMenu.rowIdx); setRowContextMenu(null); }}>Duplicate</button>
          <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={e => { e.preventDefault(); e.stopPropagation(); handleDeleteRow(rowContextMenu.rowIdx); setRowContextMenu(null); }}>Delete</button>
          </div>,
          portalTarget
        )}
      
      {/* Describe Modal */}
      {describeModal.isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]"
          onClick={() => setDescribeModal({ isOpen: false, column: '', data: null })}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">
                Column Description: {describeModal.column}
              </h3>
            </div>
            <div className="p-3">
              {describeModal.data && (
                <div className="space-y-3">
                  {/* Basic Info */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-gray-50 p-2 rounded">
                      <div className="text-xs font-medium text-gray-700">Data Type</div>
                      <div className="text-xs text-gray-900">{describeModal.data.dtype}</div>
                    </div>
                    <div className="bg-gray-50 p-2 rounded">
                      <div className="text-xs font-medium text-gray-700">Total Count</div>
                      <div className="text-xs text-gray-900">{describeModal.data.total_count}</div>
                    </div>
                    <div className="bg-gray-50 p-2 rounded">
                      <div className="text-xs font-medium text-gray-700">Non-Null Count</div>
                      <div className="text-xs text-gray-900">{describeModal.data.non_null_count}</div>
                    </div>
                    <div className="bg-gray-50 p-2 rounded">
                      <div className="text-xs font-medium text-gray-700">Unique Count</div>
                      <div className="text-xs text-gray-900">{describeModal.data.unique_count}</div>
                    </div>
                    <div className="bg-gray-50 p-2 rounded">
                      <div className="text-xs font-medium text-gray-700">Null Count</div>
                      <div className="text-xs text-gray-900">{describeModal.data.null_count}</div>
                    </div>
                    <div className="bg-gray-50 p-2 rounded">
                      <div className="text-xs font-medium text-gray-700">Null Percentage</div>
                      <div className="text-xs text-gray-900">{describeModal.data.null_percentage}%</div>
                    </div>
                  </div>

                  {/* Numeric Statistics - Only show for numeric columns */}
                  {describeModal.data.is_numeric && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-900 mb-2">Numeric Statistics</h4>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-blue-50 p-2 rounded">
                          <div className="text-xs font-medium text-gray-700">Mean</div>
                          <div className="text-xs text-gray-900">
                            {describeModal.data.mean !== null ? describeModal.data.mean.toFixed(4) : 'N/A'}
                          </div>
                        </div>
                        <div className="bg-blue-50 p-2 rounded">
                          <div className="text-xs font-medium text-gray-700">Median</div>
                          <div className="text-xs text-gray-900">
                            {describeModal.data.median !== null ? describeModal.data.median.toFixed(4) : 'N/A'}
                          </div>
                        </div>
                        <div className="bg-blue-50 p-2 rounded">
                          <div className="text-xs font-medium text-gray-700">Standard Deviation</div>
                          <div className="text-xs text-gray-900">
                            {describeModal.data.std !== null ? describeModal.data.std.toFixed(4) : 'N/A'}
                          </div>
                        </div>
                        <div className="bg-blue-50 p-2 rounded">
                          <div className="text-xs font-medium text-gray-700">Min</div>
                          <div className="text-xs text-gray-900">
                            {describeModal.data.min !== null ? describeModal.data.min.toFixed(4) : 'N/A'}
                          </div>
                        </div>
                        <div className="bg-blue-50 p-2 rounded">
                          <div className="text-xs font-medium text-gray-700">Max</div>
                          <div className="text-xs text-gray-900">
                            {describeModal.data.max !== null ? describeModal.data.max.toFixed(4) : 'N/A'}
                          </div>
                        </div>
                        <div className="bg-blue-50 p-2 rounded">
                          <div className="text-xs font-medium text-gray-700">Sum</div>
                          <div className="text-xs text-gray-900">
                            {describeModal.data.sum !== null ? describeModal.data.sum.toFixed(4) : 'N/A'}
                          </div>
                        </div>
                        <div className="bg-blue-50 p-2 rounded">
                          <div className="text-xs font-medium text-gray-700">Q25 (25th Percentile)</div>
                          <div className="text-xs text-gray-900">
                            {describeModal.data.q25 !== null ? describeModal.data.q25.toFixed(4) : 'N/A'}
                          </div>
                        </div>
                        <div className="bg-blue-50 p-2 rounded">
                          <div className="text-xs font-medium text-gray-700">Q75 (75th Percentile)</div>
                          <div className="text-xs text-gray-900">
                            {describeModal.data.q75 !== null ? describeModal.data.q75.toFixed(4) : 'N/A'}
                          </div>
                        </div>
                        <div className="bg-blue-50 p-2 rounded col-span-2">
                          <div className="text-xs font-medium text-gray-700">Range</div>
                          <div className="text-xs text-gray-900">
                            {describeModal.data.range !== null ? describeModal.data.range.toFixed(4) : 'N/A'}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Top Values - Show for categorical columns */}
                  {!describeModal.data.is_numeric && describeModal.data.top_values && describeModal.data.top_values.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold text-gray-900 mb-2">Top Values</h4>
                      <div className="space-y-1">
                        {describeModal.data.top_values.map((item: any, index: number) => (
                          <div key={index} className="flex justify-between items-center bg-green-50 p-2 rounded">
                            <span className="text-xs text-gray-900">{item.value}</span>
                            <span className="text-xs font-medium text-gray-700">{item.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmModal.isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]"
          onClick={() => setDeleteConfirmModal({ isOpen: false, columnsToDelete: [] })}
        >
          <div 
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0 w-10 h-10 mx-auto bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
            </div>
            
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Delete Columns
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Are you sure you want to delete {deleteConfirmModal.columnsToDelete.length} column{deleteConfirmModal.columnsToDelete.length > 1 ? 's' : ''}? This action cannot be undone.
              </p>
              
              <div className="text-xs text-gray-400 mb-4">
                Columns to be deleted: {deleteConfirmModal.columnsToDelete.join(', ')}
              </div>
            </div>
            
            <div className="flex space-x-3 justify-end">
              <button
                onClick={() => setDeleteConfirmModal({ isOpen: false, columnsToDelete: [] })}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
              >
                Delete {deleteConfirmModal.columnsToDelete.length} Column{deleteConfirmModal.columnsToDelete.length > 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Row Delete Confirmation Modal */}
      {rowDeleteConfirmModal.isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]"
          onClick={() => setRowDeleteConfirmModal({ isOpen: false, rowsToDelete: [] })}
        >
          <div 
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center mb-4">
              <div className="flex-shrink-0 w-10 h-10 mx-auto bg-red-100 rounded-full flex items-center justify-center">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
            </div>
            
            <div className="text-center">
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Delete Rows
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                Are you sure you want to delete {rowDeleteConfirmModal.rowsToDelete.length} row{rowDeleteConfirmModal.rowsToDelete.length > 1 ? 's' : ''}? This action cannot be undone.
              </p>
              
              <div className="text-xs text-gray-400 mb-4">
                {rowDeleteConfirmModal.rowsToDelete.length <= 10 ? (
                  `Rows to be deleted: ${rowDeleteConfirmModal.rowsToDelete.map(row => `Row ${row + 1}`).join(', ')}`
                ) : (
                  `All ${rowDeleteConfirmModal.rowsToDelete.length} rows will be deleted`
                )}
              </div>
            </div>
            
            <div className="flex space-x-3 justify-end">
              <button
                onClick={() => setRowDeleteConfirmModal({ isOpen: false, rowsToDelete: [] })}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRowDelete}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
              >
                Delete {rowDeleteConfirmModal.rowsToDelete.length} Row{rowDeleteConfirmModal.rowsToDelete.length > 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Find and Replace Modal */}
      {findReplaceModalOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]"
          onClick={() => setFindReplaceModalOpen(false)}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <div className="flex items-center space-x-2">
                <Search className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">Find and Replace</h3>
              </div>
              <button
                onClick={() => setFindReplaceModalOpen(false)}
                className="p-1 hover:bg-gray-100 rounded-md transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              {/* Find Text Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Find
                </label>
                <Input
                  value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                  placeholder="Enter text to find..."
                  className="w-full"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && findText.trim()) {
                      handleFindAndReplace();
                    }
                  }}
                />
                {/* Match Count Display */}
                {findText.trim() && (
                  <div className="mt-2 text-sm">
                    {matchCountLoading ? (
                      <div className="flex items-center text-gray-500">
                        <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin mr-2"></div>
                        Searching...
                      </div>
                    ) : (
                      <div className="text-gray-600">
                        <span className="font-medium text-blue-600">{matchCount}</span> match{matchCount !== 1 ? 'es' : ''} found
                        {matchCount > 0 && (
                          <div className="text-xs text-gray-500 mt-1">
                            {Object.entries(matchesByColumn)
                              .filter(([_, count]) => (count as number) > 0)
                              .slice(0, 3)
                              .map(([col, count]) => `${col}: ${count}`)
                              .join(', ')}
                            {Object.keys(matchesByColumn).filter(col => (matchesByColumn[col] as number) > 0).length > 3 && '...'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Replace Text Input */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Replace with
                </label>
                <Input
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  placeholder="Enter replacement text..."
                  className="w-full"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && findText.trim()) {
                      handleFindAndReplace();
                    }
                  }}
                />
              </div>
              
              {/* Options */}
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="caseSensitive"
                    checked={caseSensitive}
                    onChange={(e) => setCaseSensitive(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="caseSensitive" className="text-sm text-gray-700">
                    Case sensitive
                  </label>
                </div>
                
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="replaceAll"
                    checked={replaceAll}
                    onChange={(e) => setReplaceAll(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label htmlFor="replaceAll" className="text-sm text-gray-700">
                    Replace all occurrences
                  </label>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex space-x-3 pt-4">
                <Button
                  onClick={handleFindAndReplace}
                  disabled={!findText.trim() || findReplaceLoading}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {findReplaceLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                      Processing...
                    </>
                  ) : (
                    <>
                      <Replace className="w-4 h-4 mr-2" />
                      {replaceAll ? 'Replace All' : 'Replace'}
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => setFindReplaceModalOpen(false)}
                  variant="outline"
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
              
              {/* Help Text */}
              <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-md">
                <p><strong>Shortcut:</strong> Press Ctrl+F to open this dialog</p>
                <p><strong>Tip:</strong> Leave "Replace with" empty to delete found text</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History Panel */}

      {historyPanelOpen && (
        <div className="fixed inset-0 z-[9999] pointer-events-none">
          <div 
            className={`absolute right-0 top-0 h-full bg-white shadow-2xl border-l border-gray-200 transition-all duration-300 ${
              historyPanelMinimized ? 'w-16' : 'w-96'
            } pointer-events-auto`}
            style={{
              transform: `translateX(${historyPanelPosition.x}px) translateY(${historyPanelPosition.y}px)`
            }}
          >
            {/* Panel Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-purple-700 text-white">
              <div className="flex items-center">
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {!historyPanelMinimized && (
                  <h3 className="font-semibold">
                    Operation History <span className="text-purple-200 ml-2">({historyOperations.length})</span>
                  </h3>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setHistoryPanelMinimized(!historyPanelMinimized)}
                  className="p-1 hover:bg-white/20 rounded transition-colors"
                  title={historyPanelMinimized ? "Expand" : "Minimize"}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={historyPanelMinimized ? "M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" : "M9 9V4.5M9 9H4.5M9 9L3.5 3.5M15 9v4.5M15 9h4.5M15 9l5.5-5.5M9 15v4.5M9 15H4.5M9 15l-5.5 5.5M15 15h4.5M15 15v4.5m0-4.5l5.5 5.5"} />
                  </svg>
                </button>
                <button
                  onClick={() => setHistoryPanelOpen(false)}
                  className="p-1 hover:bg-white/20 rounded transition-colors"
                  title="Close"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Panel Content */}
            {!historyPanelMinimized && (
              <div className="flex-1 overflow-y-auto p-4 max-h-[calc(100vh-80px)]" style={{ scrollbarWidth: 'thin' }}>
                <div className="space-y-2">
                  {/* Operations History */}
                  {historyOperations.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p>No operations recorded yet</p>
                      <p className="text-sm">Start working with your data to see the history</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                        {historyOperations.map((operation, index) => (
                          <div key={operation.id} className="relative">
                            {/* Connection Line */}
                            {index < historyOperations.length - 1 && (
                              <div className="absolute left-4 top-8 w-0.5 h-6 bg-gray-300"></div>
                            )}
                            
                            {/* Operation Node */}
                            <div className={`flex items-start p-3 rounded-lg border-l-4 ${
                              operation.status === 'success' ? 'bg-green-50 border-green-400' :
                              operation.status === 'error' ? 'bg-red-50 border-red-400' :
                              'bg-yellow-50 border-yellow-400'
                            }`}>
                              {/* Status Icon */}
                              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center mr-3 ${
                                operation.status === 'success' ? 'bg-green-100 text-green-600' :
                                operation.status === 'error' ? 'bg-red-100 text-red-600' :
                                'bg-yellow-100 text-yellow-600'
                              }`}>
                                {operation.status === 'success' ? (
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : operation.status === 'error' ? (
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                ) : (
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                )}
                              </div>
                              
                              {/* Operation Details */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <h5 className="font-medium text-gray-900 text-sm">{operation.type}</h5>
                                  <span className="text-xs text-gray-500">
                                    {operation.timestamp.toLocaleTimeString()}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-600 mt-1">{operation.description}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}

                  {/* Clear History Button */}
                  {historyOperations.length > 0 && (
                    <div className="pt-4 border-t border-gray-200">
                      <button
                        onClick={() => setHistoryOperations([])}
                        className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                      >
                        Clear History
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Save DataFrame Modal */}
      <Dialog open={showSaveModal} onOpenChange={setShowSaveModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Save DataFrame</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              File Name
            </label>
            <Input
              value={saveFileName}
              onChange={(e) => setSaveFileName(e.target.value)}
              placeholder="Enter file name"
              className="w-full"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && saveFileName.trim()) {
                  confirmSaveDataFrame();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSaveModal(false)}
              disabled={saveLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmSaveDataFrame}
              disabled={saveLoading || !saveFileName.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saveLoading ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save Pivot Table Modal */}
      <Dialog open={showPivotSaveModal} onOpenChange={setShowPivotSaveModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Save Pivot Table</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              File Name
            </label>
            <Input
              value={pivotSaveFileName}
              onChange={(e) => setPivotSaveFileName(e.target.value)}
              placeholder="Enter file name"
              className="w-full"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && pivotSaveFileName.trim()) {
                  confirmPivotSaveAs();
                }
              }}
            />
            {pivotSaveError && (
              <p className="text-red-500 text-sm mt-2">{pivotSaveError}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowPivotSaveModal(false);
                setPivotSaveFileName('');
                setPivotSaveError(null);
              }}
              disabled={pivotIsSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmPivotSaveAs}
              disabled={pivotIsSaving || !pivotSaveFileName.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {pivotIsSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Overwrite Confirmation Dialog */}
      <Dialog open={showOverwriteConfirmDialog} onOpenChange={setShowOverwriteConfirmDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Confirm Overwrite</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-gray-700 mb-2">
                  Are you sure you want to save the changes to the original file?
                </p>
                <p className="text-sm font-medium text-gray-900 mb-1">
                  File: {settings.selectedFile}
                </p>
                <p className="text-xs text-gray-600">
                  This action will overwrite the original file and cannot be undone.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowOverwriteConfirmDialog(false)}
              disabled={saveLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmOverwriteSave}
              disabled={saveLoading}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {saveLoading ? 'Saving...' : 'Yes, Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default DataFrameOperationsCanvas;