import React, { useState, useMemo, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
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
  ChevronDown, ChevronUp, X, PlusCircle, MinusCircle, Save
} from 'lucide-react';
import { DataFrameData, DataFrameSettings } from '../DataFrameOperationsAtom';
import { DATAFRAME_OPERATIONS_API, VALIDATE_API } from '@/lib/api';
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
} from '../services/dataframeOperationsApi';
import { toast } from '@/components/ui/use-toast';
import '@/templates/tables/table.css';
import FormularBar from './FormularBar';

interface DataFrameOperationsCanvasProps {
  data: DataFrameData | null;
  settings: DataFrameSettings;
  onSettingsChange: (settings: Partial<DataFrameSettings>) => void;
  onDataUpload: (data: DataFrameData, backendFileId?: string) => void;
  onDataChange: (data: DataFrameData) => void;
  onClearAll: () => void;
  fileId?: string | null;
  originalData?: DataFrameData | null;
}

function safeToString(val: any): string {
  if (val === undefined || val === null) return '';
  try {
    return val.toString();
  } catch {/* empty */
    return '';
  }
}

// Debounce function
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: number | null = null;
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
  // 1. Add state for selected cell and selected column
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: string } | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const [formulaInput, setFormulaInput] = useState('');
  const [columnFormulas, setColumnFormulas] = useState<Record<string, string>>(settings.columnFormulas || {});
  const [formulaValidationError, setFormulaValidationError] = useState<string | null>(null);
  const errorTimeoutRef = useRef<number | null>(null);
  const [forceRefresh, setForceRefresh] = useState(0);
  const [isProcessingOperation, setIsProcessingOperation] = useState(false);
  const operationQueueRef = useRef<Array<() => Promise<void>>>([]);
  const headersKey = useMemo(() => (data?.headers || []).join('|'), [data?.headers]);

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
      console.log('[DataFrameOperations] Debounced data update:', {
        headers: newData.headers.length,
        rows: newData.rows.length,
        fileName: newData.fileName
      });
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
  // 1. Add a ref to track the currently editing cell/header
  const editingCellRef = useRef<{ row: number; col: string } | null>(null);
  const editingHeaderRef = useRef<string | null>(null);
  // Track mapping from duplicated columns to their original source
  const [duplicateMap, setDuplicateMap] = useState<{ [key: string]: string }>({});
  const previousSelectedColumnRef = useRef<string | null>(null);
  const previousStoredFormulaRef = useRef<string | undefined>(undefined);

  // Ref to store header cell elements for context-menu positioning
  const headerRefs = useRef<{ [key: string]: HTMLTableCellElement | null }>({});
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
          console.log('[DataFrameOperations] Clearing selectedColumn due to outside click:', { selectedColumn, isFormulaMode, target: target.tagName });
          setSelectedColumn(null);
        }
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [selectedColumn, isFormulaMode]);

  useEffect(() => {
    const incoming = settings.columnFormulas || {};
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
    const stored = selectedColumn ? columnFormulas[selectedColumn] : undefined;
    if (selectedColumn !== previousSelectedColumnRef.current) {
      previousSelectedColumnRef.current = selectedColumn;
      previousStoredFormulaRef.current = stored;
      if (selectedColumn) {
        if (stored !== undefined) {
          setFormulaInput(stored);
        } else {
          setFormulaInput('');
        }
        setFormulaValidationError(null);
      }
      return;
    }

    if (selectedColumn && stored !== previousStoredFormulaRef.current) {
      previousStoredFormulaRef.current = stored;
      if (stored !== undefined) {
        setFormulaInput(stored);
      } else {
        setFormulaInput('');
      }
      setFormulaValidationError(null);
    }

    if (!selectedColumn) {
      previousStoredFormulaRef.current = undefined;
      setFormulaValidationError(null);
    }
  }, [selectedColumn, columnFormulas]);
  // 1. Add state for filter range
  const [filterRange, setFilterRange] = useState<{ min: number; max: number; value: [number, number] } | null>(null);

  // Add Save DataFrame logic
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const saveSuccessTimeout = useRef<number | null>(null);
  const [savedFiles, setSavedFiles] = useState<any[]>([]);

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
  
  // Undo/Redo state management
  const [undoStack, setUndoStack] = useState<DataFrameData[]>([]);
  const [redoStack, setRedoStack] = useState<DataFrameData[]>([]);
  const [isUndoRedoOperation, setIsUndoRedoOperation] = useState(false);

  // History panel state
  const [historyPanelOpen, setHistoryPanelOpen] = useState(false);
  const [historyPanelMinimized, setHistoryPanelMinimized] = useState(false);
  const [historyPanelPosition, setHistoryPanelPosition] = useState({ x: 0, y: 0 });
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

  // Function to save current state to undo stack
  const saveToUndoStack = useCallback((currentData: DataFrameData) => {
    if (isUndoRedoOperation) return; // Don't save during undo/redo operations
    
    setUndoStack(prev => {
      const newStack = [...prev, JSON.parse(JSON.stringify(currentData))];
      // Limit undo stack to 50 operations
      return newStack.slice(-50);
    });
    // Clear redo stack when new operation is performed
    setRedoStack([]);
  }, [isUndoRedoOperation]);

  // Function to undo last operation
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0 || !data) return;
    
    setIsUndoRedoOperation(true);
    
    // Move current state to redo stack
    setRedoStack(prev => [...prev, JSON.parse(JSON.stringify(data))]);
    
    // Restore previous state
    const previousState = undoStack[undoStack.length - 1];
    setUndoStack(prev => prev.slice(0, -1));
    
    // Update the data
    onDataChange(previousState);
    
    // Add to history
    addToHistory('Undo', 'Reverted last operation');
    
    toast({
      title: "Undo Applied",
      description: "Last operation has been undone",
    });
    
    // Reset flag after a short delay
    setTimeout(() => setIsUndoRedoOperation(false), 100);
  }, [undoStack, data, onDataChange, addToHistory]);

  // Function to redo last undone operation
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0 || !data) return;
    
    setIsUndoRedoOperation(true);
    
    // Move current state to undo stack
    setUndoStack(prev => [...prev, JSON.parse(JSON.stringify(data))]);
    
    // Restore next state
    const nextState = redoStack[redoStack.length - 1];
    setRedoStack(prev => prev.slice(0, -1));
    
    // Update the data
    onDataChange(nextState);
    
    toast({
      title: "Redo Applied",
      description: "Last undone operation has been redone",
    });
    
    // Reset flag after a short delay
    setTimeout(() => setIsUndoRedoOperation(false), 100);
  }, [redoStack, data, onDataChange]);

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

  const handleSaveDataFrame = async () => {
    setSaveLoading(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      if (!data) throw new Error('No DataFrame loaded');

      const csv_data = toCSV();

      // Determine next serial number for DF_OPS files
      const maxSerial = savedFiles.reduce((max, f) => {
        const m = f.object_name?.match(/dataframe operations\/DF_OPS_(\d+)_/);
        return m ? Math.max(max, parseInt(m[1], 10)) : max;
      }, 0);
      const nextSerial = maxSerial + 1;

      // Base name from current file without extension
      const baseName = data.fileName ? data.fileName.replace(/\.[^/.]+$/, '') : `dataframe_${Date.now()}`;
      const filename = `DF_OPS_${nextSerial}_${baseName}.arrow`;

      // Always use CSV data to ensure processed state is saved
      const payload: Record<string, unknown> = { csv_data, filename };
      // Don't include df_id to force backend to use the CSV data instead of original DataFrame
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
   const filterBackendResponse = useCallback((resp: any, currentHiddenColumns: string[], currentDeletedColumns: string[] = []) => {
     // Combine hidden and deleted columns to filter out
     const columnsToFilter = [...currentHiddenColumns, ...currentDeletedColumns];
     
     const filteredHeaders = resp.headers.filter((header: string) => !columnsToFilter.includes(header));
    
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
    const filteredColumnTypes: any = {};
    filteredHeaders.forEach((header: string) => {
      if (columnTypes[header]) {
        filteredColumnTypes[header] = columnTypes[header];
      }
    });
    
    return {
      headers: filteredHeaders,
      rows: filteredRows,
      columnTypes: filteredColumnTypes
    };
  }, [normalizeBackendColumnTypes]);

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
      const cm = document.getElementById('df-ops-context-menu');
      const rcm = document.getElementById('df-ops-row-context-menu');
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
      const cm = document.getElementById('df-ops-context-menu');
      const rcm = document.getElementById('df-ops-row-context-menu');
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
    console.log('[DataFrameOperations] processedData recalculating with data:', {
      hasData: !!data,
      headersLength: data?.headers?.length,
      rowsLength: data?.rows?.length,
      searchTerm: settings.searchTerm,
      filtersCount: Object.keys(settings.filters || {}).length
    });
    
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
            // Range filter for numbers
            const num = Number(cellValue);
            return num >= filterValue[0] && num <= filterValue[1];
          } else {
            // Multi-select filter for strings
            return filterValue.includes(safeToString(cellValue));
          }
        } else if (filterValue && typeof filterValue === 'object' && 'min' in filterValue && 'max' in filterValue) {
          // Range filter object
          const num = Number(cellValue);
          const minVal = Number((filterValue as any).min);
          const maxVal = Number((filterValue as any).max);
          return num >= minVal && num <= maxVal;
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
      const needsCurrentRows =
        !originalHeaders.has(sourceCol) ||
        filtersToApply.some(([col]) => {
          const filterCol = duplicateMap[col] || col;
          return !originalHeaders.has(filterCol);
        });

      let rowsForHeader = needsCurrentRows
        ? [...currentRows]
        : [...(originalData?.rows.filter((_, index) => !permanentlyDeletedRows.has(index)) || currentRows)];

      filtersToApply.forEach(([col, val]) => {
        const filterCol = duplicateMap[col] || col;
        rowsForHeader = rowsForHeader.filter(row => {
          const cell = row[filterCol];
          if (Array.isArray(val)) {
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

      let values = Array.from(new Set(rowsForHeader.map(row => safeToString(row[sourceCol]))))
        .filter((v): v is string => v !== '')
        .sort();

      if (values.length === 0 && !needsCurrentRows) {
        values = Array.from(new Set(currentRows.map(row => safeToString(row[sourceCol]))))
          .filter((v): v is string => v !== '')
          .sort();
      }

      uniqueValues[header] = values.slice(0, 50);
    });

    const result = { filteredRows, totalRows: filteredRows.length, uniqueValues };
    console.log('[DataFrameOperations] processedData result:', {
      filteredRowsCount: result.filteredRows.length,
      totalRows: result.totalRows,
      uniqueValuesCount: Object.keys(result.uniqueValues).length
    });
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
    if (!data || !fileId) return;
    
    // Save current state before making changes
    saveToUndoStack(data);
    
    setOperationLoading(true);
    try {
      console.log('[DataFrameOperations] sort', column, direction);
      const resp = await apiSort(fileId, column, direction);
      
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
      setOperationLoading(false);
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
  if (!data || !fileId) { setEditingHeader(null); return; }
  const newHeader = value !== undefined ? value : editingHeaderValue;
  const oldHeader = data.headers[colIdx];
  if (newHeader === oldHeader) { setEditingHeader(null); return; }
  
  // Check if the column has been deleted
  if (data.deletedColumns && data.deletedColumns.includes(oldHeader)) {
    console.warn('[DataFrameOperations] Cannot rename deleted column:', oldHeader);
    setEditingHeader(null);
    return;
  }
  
  // Save current state before making changes
  saveToUndoStack(data);
  
  try {
    const resp = await apiRenameColumn(fileId, oldHeader, newHeader);
    
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
  } catch (err) {
    handleApiError('Rename column failed', err);
    addToHistory('Rename Column', `Failed to rename column "${oldHeader}"`, 'error');
  }
  setEditingHeader(null);
};

// Original immediate update util (kept for programmatic usage)
  const handleCellEdit = async (rowIndex: number, column: string, newValue: string) => {
    resetSaveSuccess();
    if (!data || !fileId) return;
    const globalRowIndex = startIndex + rowIndex;
    try {
      const resp = await apiEditCell(fileId, globalRowIndex, column, newValue);
      
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
    } catch (err) {
      handleApiError('Edit cell failed', err);
    }
  };

  const handleAddRow = async () => {
    resetSaveSuccess();
    if (!data || !fileId) return;
    
    // Save current state before making changes
    saveToUndoStack(data);
    
    const idx = data.rows.length > 0 ? data.rows.length - 1 : 0;
    const dir: 'above' | 'below' = data.rows.length > 0 ? 'below' : 'above';
    try {
      const resp = await apiInsertRow(fileId, idx, dir);
      
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
    } catch (err) {
      handleApiError('Insert row failed', err);
    }
  };

  const handleAddColumn = async () => {
    resetSaveSuccess();
    if (!data || !fileId) return;
    
    // Save current state before making changes
    saveToUndoStack(data);
    
    const newColumnName = `Column_${data.headers.length + 1}`;
    
    // Calculate the correct backend index for adding at the end
    const frontendEndIndex = data.headers.length;
    const backendEndIndex = getBackendColumnIndex(frontendEndIndex);
    
    try {
      const resp = await apiInsertColumn(fileId, backendEndIndex, newColumnName, '');
      
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
  };

  const handleDragStart = (col: string) => {
    setDraggedCol(col);
  };

  const handleDragOver = (e: React.DragEvent, col: string) => {
    e.preventDefault();
    if (draggedCol === col) return;
    const headers = [...data?.headers || []];
    const draggedIndex = headers.indexOf(draggedCol || '');
    const targetIndex = headers.indexOf(col);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      const newHeaders = [...headers];
      newHeaders.splice(draggedIndex, 1);
      newHeaders.splice(targetIndex, 0, draggedCol || '');
      onDataChange({ ...data, headers: newHeaders });
    }
  };

  const handleDragEnd = async () => {
    if (draggedCol && data && fileId) {
      // Save current state before making changes
      saveToUndoStack(data);
      
      const toIndex = data.headers.indexOf(draggedCol);
      const backendToIndex = getBackendColumnIndex(toIndex);
      try {
        const resp = await apiMoveColumn(fileId, draggedCol, backendToIndex);
        
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
        addToHistory('Move Column', `Moved column "${draggedCol}" to position ${toIndex + 1}`);
      } catch (err) {
        handleApiError('Move column failed', err);
        addToHistory('Move Column', `Failed to move column "${draggedCol}"`, 'error');
      }
    }
    setDraggedCol(null);
  };






const handleSortAsc = (colIdx: number) => {
  if (!data) return;
  const col = data.headers[colIdx];
  handleSort(col, 'asc');
  addToHistory('Sort', `Sorted column "${col}" in ascending order`);
  setContextMenu(null);
  setOpenDropdown(null);
};

const handleSortDesc = (colIdx: number) => {
  if (!data) return;
  const col = data.headers[colIdx];
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
  // When clicking on a cell, activate formula bar for that column (like small screen behavior)
  activateFormulaBar(column);
  console.log('[DataFrameOperations] Column selected:', column, 'Formula bar activated');
};

// Function to completely reset the formula bar to a clean state
const resetFormulaBar = () => {
  setFormulaInput('');
  setSelectedColumn(null);
  setSelectedCell(null);
  setIsFormulaMode(false); // Disable formula bar after reset
  setIsFormulaBarFrozen(false); // Don't freeze formula bar - allow continued use
  showValidationError(null);
  console.log('[DataFrameOperations] Formula bar completely reset and frozen');
};

// Function to activate formula bar for a specific column
const activateFormulaBar = (column: string) => {
  setSelectedColumn(column);
  setSelectedCell(null);
  setIsFormulaMode(true);
  setIsFormulaBarFrozen(false); // Unfreeze formula bar when explicitly activated
  setFormulaInput('');
  showValidationError(null);
  console.log('[DataFrameOperations] Formula bar activated for column:', column);
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
  if (!isFormulaMode) {
    return;
  }
  
  console.log('[DataFrameOperations] insertColumnIntoFormula called:', { columnName, selectedColumn, isFormulaMode });
  
  // Use the same logic as FormularBar's handleColumnInsert function
  const inputElement = document.querySelector('input[placeholder*="=SUM"]') as HTMLInputElement;
  
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
  const formulaInputElement = document.querySelector('input[placeholder*="=SUM"]') as HTMLInputElement;
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
  
  // Check if we're in formula mode (formula input starts with =)
  if (formulaInput.trim().startsWith('=')) {
    // Insert column name into formula at cursor position
    insertColumnIntoFormula(header);
    return;
  }
  
  // Normal column selection behavior - activate formula bar
  activateFormulaBar(header);
};

  const handleFormulaSubmit = async () => {
    console.log('[DataFrameOperations] handleFormulaSubmit called');
    resetSaveSuccess();
    if (!data || !selectedColumn || !fileId) {
      console.log('[DataFrameOperations] Missing required data:', { data: !!data, selectedColumn, fileId });
      showValidationError('Please select a target column first');
      return;
    }
    const trimmedFormula = formulaInput.trim();
    if (!trimmedFormula) {
      console.log('[DataFrameOperations] No formula provided');
      showValidationError('Please enter a formula');
      return;
    }
  
  // Debug logging
  console.log('[DataFrameOperations] Applying formula:', {
    selectedColumn,
    formula: trimmedFormula,
    fileId,
    currentHeaders: data.headers,
    hasFilters: Object.keys(settings.filters || {}).length > 0,
    hasSearchTerm: !!settings.searchTerm,
    currentDataRows: data.rows.length,
    processedDataRows: processedData.filteredRows.length,
    isProcessingOperation
  });
  
  // Apply formula directly without queuing to test
  console.log('[DataFrameOperations] Starting formula application');
  setFormulaLoading(true);
  setIsProcessingOperation(false); // Reset processing state
  try {
    // Save current state before making changes
    saveToUndoStack(data);
      // Check if we have active filters or search
      const hasActiveFilters = Object.keys(settings.filters || {}).length > 0 || !!settings.searchTerm;
      const currentFilters = settings.filters || {};
      const currentSearchTerm = settings.searchTerm || '';
      
      console.log('[DataFrameOperations] Current data state:', {
        hasActiveFilters,
        currentFilters,
        currentSearchTerm,
        originalDataRows: data.rows.length,
        filteredDataRows: processedData.filteredRows.length
      });
      
      // Apply the formula to the original data (backend requirement)
      // But we'll ensure the filtered view reflects the changes
      console.log('[DataFrameOperations] Calling apiApplyFormula with:', {
        fileId,
        selectedColumn,
        formula: trimmedFormula
      });
      
      const resp = await apiApplyFormula(fileId, selectedColumn, trimmedFormula);
    
    console.log('[DataFrameOperations] Formula applied successfully:', {
      selectedColumn,
      responseHeaders: resp.headers,
      responseRowsCount: resp.rows?.length,
      responseTypes: resp.types
    });
    
    // Preserve deleted columns by filtering out columns that were previously deleted
    const currentHiddenColumns = data.hiddenColumns || [];
    const currentDeletedColumns = data.deletedColumns || [];
    const filtered = filterBackendResponse(resp, currentHiddenColumns, currentDeletedColumns);
    
    console.log('[DataFrameOperations] Updating data with:', {
      headers: filtered.headers.length,
      rows: filtered.rows.length,
      fileName: data.fileName,
      columnTypes: Object.keys(filtered.columnTypes || {}).length
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
    
    console.log('[DataFrameOperations] Data updated successfully');
    
    // Force a refresh to ensure the UI updates with the new data
    setForceRefresh(prev => prev + 1);
    
    // Don't re-apply filters - let the data update naturally
    // The processedData will automatically reflect the new data with existing filters
    console.log('[DataFrameOperations] Formula applied to original data, filtered view will update automatically');
    
    console.log('[DataFrameOperations] Data updated after formula:', {
      selectedColumn,
      newHeaders: filtered.headers,
      newRowsCount: filtered.rows?.length,
      columnStillExists: filtered.headers.includes(selectedColumn),
      firstRowSample: filtered.rows?.[0] ? Object.keys(filtered.rows[0]) : []
    });
    
    setColumnFormulas(prev => {
      if (prev[selectedColumn] === trimmedFormula) {
        return prev;
      }
      const next = { ...prev, [selectedColumn]: trimmedFormula };
      console.log('[DataFrameOperations] Updating column formulas:', next);
      onSettingsChange({ columnFormulas: next });
      return next;
    });
    
    // Reset formula bar to completely clean state after successful application
    resetFormulaBar();
    
    // Force a complete reset to ensure the new column is usable for future operations
    setTimeout(() => {
      resetFormulaBar();
      console.log('[DataFrameOperations] Formula bar completely reset - new column ready for future operations');
    }, 200);
    
    console.log('[DataFrameOperations] Formula application completed successfully');
    
    console.log('[DataFrameOperations] Formula state updated:', {
      selectedColumn,
      formulaApplied: trimmedFormula,
      formulaBarReset: true,
      columnFormulasUpdated: true
    });
    
    // Add to history
    addToHistory('Apply Formula', `Applied formula "${trimmedFormula}" to column "${selectedColumn}"`);
    
    // Show success notification
    toast({
      title: "Formula Applied Successfully",
      description: `Formula applied to column "${selectedColumn}". Click on formula bar to edit this column again.`,
    });
    
    console.log('[DataFrameOperations] Formula application process completed');
  } catch (err) {
    console.error('[DataFrameOperations] Formula application failed:', err);
    handleApiError('Apply formula failed', err);
    addToHistory('Apply Formula', `Failed to apply formula "${trimmedFormula}" to column "${selectedColumn}"`, 'error');
  } finally {
    console.log('[DataFrameOperations] Formula application finally block - setting loading to false');
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
    
    // Get the column at the frontend index
    const targetColumn = data.headers[frontendIndex];
    if (!targetColumn) return frontendIndex;
    
    // Find the position of this column in the original data structure
    // We need to account for hidden and deleted columns
    const allColumns = [...data.headers];
    
    // Add back hidden columns to get the full original structure
    if (data.hiddenColumns) {
      data.hiddenColumns.forEach(hiddenCol => {
        if (!allColumns.includes(hiddenCol)) {
          allColumns.push(hiddenCol);
        }
      });
    }
    
    // Add back deleted columns to get the full original structure  
    if (data.deletedColumns) {
      data.deletedColumns.forEach(deletedCol => {
        if (!allColumns.includes(deletedCol)) {
          allColumns.push(deletedCol);
        }
      });
    }
    
    // Find the index of the target column in the full structure
    const backendIndex = allColumns.indexOf(targetColumn);
    console.log('[DataFrameOperations] Mapping frontend index to backend:', {
      frontendIndex,
      targetColumn,
      backendIndex,
      allColumns: allColumns.length
    });
    
    return backendIndex >= 0 ? backendIndex : frontendIndex;
  }, [data]);

  // 1. Fix column insert/delete logic
  const handleInsertColumn = async (colIdx: number) => {
    resetSaveSuccess();
    if (!data || !fileId) return;
    
    // Save current state before making changes
    saveToUndoStack(data);
    
    // Map frontend index to backend index
    const backendIndex = getBackendColumnIndex(colIdx);
    
    const newColKey = getNextColKey(data.headers);
    try {
      const resp = await apiInsertColumn(fileId, backendIndex, newColKey, '');
      
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
      
      // Auto-select the newly inserted column for formula operations
      if (filtered.headers.includes(newColKey)) {
        setSelectedColumn(newColKey);
        console.log('[DataFrameOperations] Auto-selected newly inserted column:', newColKey);
      }
      
      // Add to history
      addToHistory('Insert Column', `Inserted column "${newColKey}" at position ${colIdx + 1}`);
    } catch (err) {
      handleApiError('Insert column failed', err);
      addToHistory('Insert Column', `Failed to insert column at position ${colIdx + 1}`, 'error');
    }
  };

  const handleDeleteColumn = async (colIdx: number) => {
    resetSaveSuccess();
    if (!data || !fileId) return;
    if (colIdx < 0 || colIdx >= data.headers.length) return;
    
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
      const col = data.headers[colIdx];
      
      console.log('[DataFrameOperations] Deleting single column:', col);
      console.log('[DataFrameOperations] fileId:', fileId);
      console.log('[DataFrameOperations] data.hiddenColumns:', data.hiddenColumns);
      console.log('[DataFrameOperations] data.headers:', data.headers);
      
      // Save current state before making changes
      saveToUndoStack(data);
      
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

  const handleDuplicateColumn = async (colIdx: number) => {
    resetSaveSuccess();
    if (!data || !fileId) return;
    
    // Save current state before making changes
    saveToUndoStack(data);
    
    const col = data.headers[colIdx];
    let newName = `${col}_copy`;
    while (data.headers.includes(newName)) {
      newName += '_copy';
    }
    try {
      const resp = await apiDuplicateColumn(fileId, col, newName);
      
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
      // Remember the source for this duplicated column
      setDuplicateMap(prev => ({ ...prev, [newName]: prev[col] || col }));
      
      // Add to history
      addToHistory('Duplicate Column', `Duplicated column "${col}" as "${newName}"`);
    } catch (err) {
      handleApiError('Duplicate column failed', err);
      addToHistory('Duplicate Column', `Failed to duplicate column "${col}"`, 'error');
    }
  };

  // Row insert / delete handlers
  const handleInsertRow = async (position: 'above' | 'below', rowIdx: number) => {
    if (!data || !fileId) return;
    
    // Save current state before making changes
    saveToUndoStack(data);
    
    try {
      const resp = await apiInsertRow(fileId, rowIdx, position);
      
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
    }
  };

  const handleDuplicateRow = async (rowIdx: number) => {
    if (!data || !fileId) return;
    
    // Save current state before making changes
    saveToUndoStack(data);
    
    try {
      const resp = await apiDuplicateRow(fileId, rowIdx);
      
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
    }
  };

  const handleRetypeColumn = async (col: string, newType: 'number' | 'text' | 'date') => {
    if (!data || !fileId) return;
    
    // Save current state before making changes
    saveToUndoStack(data);
    
    try {
      console.log('[DataFrameOperations] Retype column:', col, 'to', newType);
      const resp = await apiRetypeColumn(fileId, col, newType === 'text' ? 'string' : newType);
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
    }
  };

  const handleMultiColumnRetype = async (columns: string[], newType: string) => {
    if (!data || !settings.fileId || columns.length === 0) return;
    
    const fileId = settings.fileId;
    
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
    }
  };

  const handleRoundColumns = async (columns: string[], decimalPlaces: number) => {
    if (!data || !settings.fileId || columns.length === 0) return;
    
    const fileId = settings.fileId;
    
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
        if (columnType !== 'number' && columnType !== 'float' && columnType !== 'integer') {
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
    }
  };

  const handleDeleteRow = async (rowIdx: number) => {
    if (!data) return;
    
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
    if (!data || !fileId) return;
    try {
      const describeData = await apiDescribeColumn(fileId, column);
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
    const updatedData = {
      ...data,
      hiddenColumns: (data.hiddenColumns || []).filter(c => c !== col)
    };
    
    onDataChange(updatedData);
    
    // Add to history
    addToHistory('Unhide Column', `Unhidden column "${col}"`);
    
    toast({
      title: "Column Unhidden",
      description: `Column "${col}" is now visible`,
    });
  };

  const handleColumnMultiSelect = (header: string, event: React.MouseEvent) => {
    if (event.ctrlKey || event.metaKey) {
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
    
    // Save current state before making changes
    saveToUndoStack(data);
    
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
      setDeleteConfirmModal({ isOpen: false, columnsToDelete: [] });
    }
  };

  const handleConfirmRowDelete = async () => {
    if (!data || rowDeleteConfirmModal.rowsToDelete.length === 0) return;
    
    try {
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
        e.preventDefault();
        handleUndo();
        return;
      }
      
      // Handle Ctrl+Y or Ctrl+Shift+Z for redo
      if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
        e.preventDefault();
        handleRedo();
        return;
      }
      
      if (e.ctrlKey || e.metaKey) {
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
  }, [data?.headers, data?.rows, permanentlyDeletedRows, processedData.filteredRows, handleUndo, handleRedo]);

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={handleFileUpload}
        className="hidden"
      />

      <div ref={containerRef} className="w-full h-full p-6 overflow-y-auto" style={{position: 'relative'}}>
        <div className="mx-auto max-w-screen-2xl rounded-2xl border border-slate-200 bg-white shadow-sm w-full">
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
        {/* Controls section */}
            <div className="flex-shrink-0 flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div className="flex items-center space-x-4">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search..."
                  value={settings.searchTerm || ''}
                  onChange={(e) => onSettingsChange({ searchTerm: e.target.value })}
                  className="pl-9 w-64"
                />
              </div>
              <div className="flex items-center space-x-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    showValidationError(null);
                    setPermanentlyDeletedRows(new Set());
                    onClearAll();
                  }}
                >
                  <RotateCcw className="w-4 h-4 mr-1" />
                  Reset
                </Button>
                {formulaValidationError && (
                  <div className="relative">
                    <div className="absolute bottom-full left-0 mb-2 px-3 py-2 bg-red-100 border border-red-300 rounded-lg shadow-lg z-50 whitespace-nowrap">
                      <div className="text-xs font-medium text-red-700">
                        {formulaValidationError}
                      </div>
                      <div className="absolute top-full left-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-red-300"></div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="relative flex items-center gap-2">
              <Button
                onClick={handleSaveDataFrame}
                disabled={saveLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white flex items-center space-x-2"
              >
                {saveLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save DataFrame</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Table section - Excel-like appearance */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {data && (
              <div className="flex items-center border-b border-slate-200 min-h-0">
                <div className="flex-1 min-w-0">
                  <div className="relative w-full" style={{ position: 'relative', zIndex: 1 }}>
                    <FormularBar
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
                    />
                    {formulaLoading && (
                      <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-10">
                        <div className="flex items-center space-x-2 text-sm text-slate-700">
                          <div className="w-4 h-4 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
                          <span>Processing formula...</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
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
                  
                  <Table className="table-base w-full" maxHeight="max-h-[500px]">
              <TableHeader className="table-header">
                <TableRow className="table-header-row">
                  {settings.showRowNumbers && (
                    <TableHead 
                      className={`table-header-cell row-number-column text-center relative sticky top-0 z-10 ${
                        data.frozenColumns > 0 ? 'frozen-column' : ''
                      }`}
                      style={{
                        ...(data.frozenColumns > 0 ? { 
                          position: 'sticky', 
                          left: '0px',
                          zIndex: 1001,
                          marginRight: data.frozenColumns > 0 ? '2px' : '0px',
                          backgroundColor: 'white',
                          opacity: 1,
                          borderLeft: '2px solid #22c55e',
                          borderRight: '1px solid #d1d5db',
                          borderTop: '1px solid #d1d5db',
                          borderBottom: '1px solid #d1d5db'
                        } : {})
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
                       className={`table-header-cell text-center bg-white border-r border-gray-200 relative sticky top-0 z-10 ${
                         selectedColumn === header ? 'border-2 border-blue-500 bg-blue-100' : ''
                       } ${
                         multiSelectedColumns.has(header) ? 'bg-blue-100 border-blue-500' : ''
                       } ${
                         filters[header] ? 'bg-yellow-50' : ''
                       } ${
                         data.frozenColumns && colIdx < data.frozenColumns ? 'frozen-column' : ''
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
                        ...(data.frozenColumns && colIdx < data.frozenColumns ? { 
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
                          zIndex: 1001,
                          marginRight: colIdx === data.frozenColumns - 1 ? '2px' : '0px',
                          backgroundColor: 'white',
                          opacity: 1,
                          borderLeft: colIdx === 0 ? '1px solid #d1d5db' : '1px solid #d1d5db',
                          borderRight: colIdx === data.frozenColumns - 1 ? '2px solid #22c55e' : '1px solid #d1d5db',
                          borderTop: '1px solid #d1d5db',
                          borderBottom: '1px solid #d1d5db'
                        } : {})
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
                        // Only handle multi-select if not in formula mode
                        if (!isFormulaMode || !formulaInput.trim().startsWith('=')) {
                          handleColumnMultiSelect(header, e);
                        }
                        handleHeaderClick(header);
                      }}
                      onDoubleClick={() => {
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
                          className="h-7 text-xs outline-none border-none bg-white px-0 font-bold text-black truncate text-center w-full"
                          style={{ width: '100%', boxSizing: 'border-box', background: 'inherit', textAlign: 'center', padding: 0, margin: 0 }}
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
                           className="flex items-center justify-center cursor-pointer w-full h-full overflow-hidden"
                           onDoubleClick={() => {
                             // Always allow header editing regardless of enableEditing setting
                             setEditingHeader(colIdx);
                             setEditingHeaderValue(header);
                           }}
                           title={`Click to select • Ctrl+Click for multi-select • Double-click to edit • Delete key to delete selected\nHeader: ${headerDisplayNames[header] ?? header}`}
                           style={{ 
                             width: '100%', 
                             height: '100%',
                             textOverflow: 'ellipsis',
                             whiteSpace: 'nowrap'
                           }}
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
                          className={`table-cell row-number-column text-center text-xs font-medium ${isRowSelected ? 'bg-blue-200' : ''} ${
                            data.frozenColumns > 0 ? 'frozen-column' : ''
                          }`}
                          style={{
                            ...(data.frozenColumns > 0 ? { 
                              position: 'sticky', 
                              left: '0px',
                              zIndex: 1001,
                              marginRight: data.frozenColumns > 0 ? '2px' : '0px',
                              backgroundColor: 'white',
                              opacity: 1,
                              borderLeft: '2px solid #22c55e',
                              borderRight: '1px solid #d1d5db',
                              borderTop: '1px solid #d1d5db',
                              borderBottom: '1px solid #d1d5db'
                            } : {})
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
                            className={`table-cell text-center font-medium ${selectedCell?.row === rowIndex && selectedCell?.col === column ? 'border border-blue-500 bg-blue-50' : selectedColumn === column ? 'border border-blue-500 bg-blue-50' : ''} ${isRowSelected ? 'bg-blue-100' : ''} ${data.frozenColumns && colIdx < data.frozenColumns ? 'frozen-column' : ''}`}
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
                              ...(data.frozenColumns && colIdx < data.frozenColumns ? { 
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
                                zIndex: 1001,
                                marginRight: colIdx === data.frozenColumns - 1 ? '2px' : '0px',
                                backgroundColor: 'white',
                                opacity: 1,
                                borderLeft: colIdx === 0 ? '1px solid #d1d5db' : '1px solid #d1d5db',
                                borderRight: colIdx === data.frozenColumns - 1 ? '2px solid #22c55e' : '1px solid #d1d5db',
                                borderTop: '1px solid #d1d5db',
                                borderBottom: '1px solid #d1d5db'
                              } : {})
                            }}
                            onClick={() => handleCellClick(rowIndex, column)}
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
                                wordBreak: 'break-all'
                              }}
                              onDoubleClick={() => {
                                // Always allow cell editing regardless of enableEditing setting
                                setEditingCell({ row: rowIndex, col: column });
                                setEditingCellValue(safeToString(row[column]));
                              }}
                              title={`Double-click to edit cell\nValue: ${safeToString(row[column])}`}
                            >
                              {safeToString(row[column]) !== '' ? highlightMatch(safeToString(row[column]), settings.searchTerm || '') : null}
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
        </div>
      </div>
      {portalTarget && contextMenu && data && typeof contextMenu.col === 'string' &&
        createPortal(
          <div
            ref={contextMenuRef}
            id="df-ops-context-menu"
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
                {/* Filter UI (same as before) */}
                {data && data.columnTypes[contextMenu.col] === 'number' ? (
                  (() => {
                    const values = data.rows.map(row => Number(row[contextMenu.col])).filter(v => !isNaN(v));
                    const min = Math.min(...values);
                    const max = Math.max(...values);
                    const range: [number, number] = (filterRange && filterRange.min === min && filterRange.max === max ? filterRange.value : [min, max]) as [number, number];
                    return (
                      <div className="flex flex-col gap-2" onMouseDown={e => e.stopPropagation()}>
                        <div className="flex items-center gap-2">
                          <span className="text-xs">{min}</span>
                          <input
                            type="number"
                            min={min}
                            max={range[1]}
                            value={filterMinInput === '' ? '' : filterMinInput}
                            onChange={e => {
                              const raw = e.target.value;
                              setFilterMinInput(raw);
                              if (raw !== '') {
                                let val = Number(raw);
                                if (isNaN(val)) return;
                                if (val < min) val = min;
                                if (val > range[1]) val = range[1];
                                setFilterRange({ min, max, value: [val, range[1]] });
                              }
                            }}
                            onBlur={e => {
                              let raw = e.target.value;
                              if (raw === '') {
                                setFilterMinInput(min);
                                setFilterRange({ min, max, value: [min, range[1]] });
                              } else {
                                let val = Number(raw);
                                if (val > range[1]) val = range[1];
                                if (val < min) val = min;
                                setFilterMinInput(val);
                                setFilterRange({ min, max, value: [val, range[1]] });
                              }
                            }}
                            className="w-16 text-xs border rounded px-1 py-0.5 mr-1"
                            onMouseDown={e => e.stopPropagation()}
                          />
                          <input
                            type="range"
                            step={1}
                            min={min}
                            max={range[1]}
                            value={range[0]}
                            onChange={e => {
                              let val = Number(e.target.value);
                              if (val > range[1]) val = range[1];
                              setFilterMinInput(val);
                              setFilterRange({ min, max, value: [val, range[1]] });
                            }}
                            className="mx-1"
                            onMouseDown={e => e.stopPropagation()}
                          />
                          <span className="mx-1 text-xs">to</span>
                          <input
                            type="range"
                            step={1}
                            min={range[0]}
                            max={max}
                            value={range[1]}
                            onChange={e => {
                              let val = Number(e.target.value);
                              if (val < range[0]) val = range[0];
                              setFilterMaxInput(val);
                              setFilterRange({ min, max, value: [range[0], val] });
                            }}
                            className="mx-1"
                            onMouseDown={e => e.stopPropagation()}
                          />
                          <input
                            type="number"
                            min={range[0]}
                            max={max}
                            value={filterMaxInput === '' ? '' : filterMaxInput}
                            onChange={e => {
                              const raw = e.target.value;
                              setFilterMaxInput(raw);
                              if (raw !== '') {
                                let val = Number(raw);
                                if (isNaN(val)) return;
                                if (val > max) val = max;
                                if (val < range[0]) val = range[0];
                                setFilterRange({ min, max, value: [range[0], val] });
                              }
                            }}
                            onBlur={e => {
                              let raw = e.target.value;
                              if (raw === '') {
                                setFilterMaxInput(max);
                                setFilterRange({ min, max, value: [range[0], max] });
                              } else {
                                let val = Number(raw);
                                if (val < range[0]) val = range[0];
                                if (val > max) val = max;
                                setFilterMaxInput(val);
                                setFilterRange({ min, max, value: [range[0], val] });
                              }
                            }}
                            className="w-16 text-xs border rounded px-1 py-0.5 ml-1"
                            onMouseDown={e => e.stopPropagation()}
                          />
                          <span className="text-xs">{max}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={() => { handleColumnFilter(contextMenu.col, range as [number, number]); setContextMenu(null); setOpenDropdown(null); }}
                          >Apply Filter</button>
                          <button
                            className="px-2 py-1 text-xs rounded bg-blue-600 hover:bg-blue-700 text-white"
                            onClick={e => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleClearFilter(contextMenu.col);
                              setContextMenu(null);
                              setOpenDropdown(null);
                            }}
                          >Clear Filter</button>
                        </div>
                      </div>
                    );
                  })()
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
            id="df-ops-row-context-menu"
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
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
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
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
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
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
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

      {/* History Panel */}

      {historyPanelOpen && (
        <div className="fixed inset-0 z-50 pointer-events-none">
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
    </>
  );
};

export default DataFrameOperationsCanvas;