import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
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
  insertColumn as apiInsertColumn,
  deleteColumn as apiDeleteColumn,
  sortDataframe as apiSort,
  filterRows as apiFilter,
  renameColumn as apiRenameColumn,
  duplicateRow as apiDuplicateRow,
  duplicateColumn as apiDuplicateColumn,
  moveColumn as apiMoveColumn,
  retypeColumn as apiRetypeColumn,
  loadDataframeByKey,
} from '../services/dataframeOperationsApi';
import { toast } from '@/components/ui/use-toast';
import '@/Templates/Table/table.css';

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
  const [saving, setSaving] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [draggedCol, setDraggedCol] = useState<string | null>(null);
  // 1. Add state for selected cell and selected column
  const [selectedCell, setSelectedCell] = useState<{ row: number; col: string } | null>(null);
  const [selectedColumn, setSelectedColumn] = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<null | 'insert' | 'delete' | 'sort' | 'filter'>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; col: string; colIdx: number } | null>(null);
  const [insertMenuOpen, setInsertMenuOpen] = useState(false);
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false);
  // 1. Add a ref to track the currently editing cell/header
  const editingCellRef = useRef<{ row: number; col: string } | null>(null);
  const editingHeaderRef = useRef<string | null>(null);

  // Ref to store header cell elements for context-menu positioning
  const headerRefs = useRef<{ [key: string]: HTMLTableCellElement | null }>({});
  const rowRefs = useRef<{ [key: number]: HTMLTableRowElement | null }>({});
  const [resizingCol, setResizingCol] = useState<{ key: string; startX: number; startWidth: number } | null>(null);
  const [resizingRow, setResizingRow] = useState<{ index: number; startY: number; startHeight: number } | null>(null);

  const startColResize = (key: string, e: React.MouseEvent) => {
    e.preventDefault();
    const startWidth = headerRefs.current[key]?.offsetWidth || 0;
    setResizingCol({ key, startX: e.clientX, startWidth });
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
        const newWidth = Math.max(resizingCol.startWidth + delta, 30);
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
      if (resizingCol) setResizingCol(null);
      if (resizingRow) setResizingRow(null);
    };
    if (resizingCol || resizingRow) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingCol, resizingRow, settings.columnWidths, settings.rowHeights, onSettingsChange]);

  // Clear column selection when clicking outside the selected column
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (selectedColumn) {
        const target = e.target as HTMLElement;
        if (!target.closest(`[data-col="${selectedColumn}"]`)) {
          setSelectedColumn(null);
        }
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [selectedColumn]);
  // 1. Add state for filter range
  const [filterRange, setFilterRange] = useState<{ min: number; max: number; value: [number, number] } | null>(null);

  // Add Save DataFrame logic
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const saveSuccessTimeout = useRef<NodeJS.Timeout | null>(null);
  const [savedFiles, setSavedFiles] = useState<any[]>([]);

  // Add local state for editing value
  const [editingCellValue, setEditingCellValue] = useState<string>('');
  const [editingHeaderValue, setEditingHeaderValue] = useState<string>('');
  const [headerDisplayNames, setHeaderDisplayNames] = useState<{ [key: string]: string }>({});

  // Add local state for raw min/max input in the component
  const [filterMinInput, setFilterMinInput] = useState<string | number>('');
  const [filterMaxInput, setFilterMaxInput] = useState<string | number>('');

  // Loading indicator for server-side operations
  const [operationLoading, setOperationLoading] = useState(false);


  // Helper to convert current table to CSV
  const toCSV = () => {
    if (!data) return '';
    const headers = data.headers;
    const rows = data.rows;
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

      const response = await fetch(`${DATAFRAME_OPERATIONS_API}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv_data, filename }),
      });
      if (!response.ok) {
        throw new Error(`Save failed: ${response.statusText}`);
      }
      await response.json();
      setSaveSuccess(true);
      if (saveSuccessTimeout.current) clearTimeout(saveSuccessTimeout.current);
      saveSuccessTimeout.current = setTimeout(() => setSaveSuccess(false), 2000);
      fetchSavedDataFrames(); // Refresh the saved dataframes list in the UI
      onSettingsChange({
        tableData: { ...data, fileName: filename },
        columnWidths: settings.columnWidths,
        rowHeights: settings.rowHeights,
      });
      toast({
        title: 'DataFrame Saved',
        description: `${filename} saved successfully.`,
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

  const [rowContextMenu, setRowContextMenu] = useState<{ x: number; y: number; rowIdx: number } | null>(null);

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

  // Process and filter data
  const processedData = useMemo(() => {
    if (!data || !Array.isArray(data.headers) || !Array.isArray(data.rows)) {
      return { filteredRows: [], totalRows: 0, uniqueValues: {} };
    }

    let filteredRows = [...data.rows];

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

    // Unique values for filter UI (use originalData if available)
    const sourceRows = originalData?.rows || data.rows;
    const uniqueValues: { [key: string]: string[] } = {};
    data.headers.forEach(header => {
      const values = Array.from(new Set(sourceRows.map(row => safeToString(row[header]))))
        .filter(val => val !== '')
        .sort();
      uniqueValues[header] = values.slice(0, 50);
    });

    return { filteredRows, totalRows: filteredRows.length, uniqueValues };
  }, [data, originalData, settings.searchTerm]);

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

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const resp = await loadDataframe(file);
      const columnTypes: any = {};
      resp.headers.forEach(h => {
        const t = resp.types[h];
        columnTypes[h] = t.includes('float') || t.includes('int') ? 'number' : 'text';
      });
      const newData: DataFrameData = {
        headers: resp.headers,
        rows: resp.rows,
        fileName: file.name,
        columnTypes,
        pinnedColumns: [],
        frozenColumns: 0,
        cellColors: {}
      };
      setUploadError(null);
      onDataUpload(newData, resp.df_id);
      setCurrentPage(1);
    } catch {/* empty */
      setUploadError('Error parsing file');
    }
  }, [onDataUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0 && fileInputRef.current) {
      const dt = new DataTransfer();
      files.forEach(file => dt.items.add(file));
      fileInputRef.current.files = dt.files;
      handleFileUpload({ target: { files: dt.files } } as any);
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
    setOperationLoading(true);
    try {
      console.log('[DataFrameOperations] sort', column, direction);
      const resp = await apiSort(fileId, column, direction);
      const columnTypes: any = {};
      resp.headers.forEach(h => {
        const t = resp.types[h];
        columnTypes[h] = t.includes('float') || t.includes('int') ? 'number' : 'text';
      });
      onDataChange({
        headers: resp.headers,
        rows: resp.rows,
        fileName: data.fileName,
        columnTypes,
        pinnedColumns: data.pinnedColumns,
        frozenColumns: data.frozenColumns,
        cellColors: data.cellColors,
      });
      onSettingsChange({ sortColumns: [{ column, direction }], fileId: resp.df_id });
    } catch (err) {
      handleApiError('Sort failed', err);
    } finally {
      setOperationLoading(false);
    }
  };

  const handleColumnFilter = async (column: string, selectedValues: string[] | [number, number]) => {
    if (!data || !fileId) return;
    setOperationLoading(true);
    let value: any = null;
    if (Array.isArray(selectedValues)) {
      if (typeof selectedValues[0] === 'number') {
        value = { min: selectedValues[0], max: selectedValues[1] };
      } else {
        value = selectedValues;
      }
    } else {
      value = selectedValues;
    }
    try {
      console.log('[DataFrameOperations] filter', column, value);
      const resp = await apiFilter(fileId, column, value);
      const columnTypes: any = {};
      resp.headers.forEach(h => {
        const t = resp.types[h];
        columnTypes[h] = t.includes('float') || t.includes('int') ? 'number' : 'text';
      });
      onDataChange({
        headers: resp.headers,
        rows: resp.rows,
        fileName: data.fileName,
        columnTypes,
        pinnedColumns: data.pinnedColumns,
        frozenColumns: data.frozenColumns,
        cellColors: data.cellColors,
      });
      onSettingsChange({ filters: { ...settings.filters, [column]: selectedValues }, fileId: resp.df_id });
      setCurrentPage(1);
    } catch (err) {
      handleApiError('Filter failed', err);
    } finally {
      setOperationLoading(false);
    }
  };

// Helper to commit a cell edit after user finishes editing
const commitCellEdit = (rowIndex: number, column: string) => {
  handleCellEdit(rowIndex, column, editingCellValue);
  setEditingCell(null);
};

// Helper to commit a header edit
const commitHeaderEdit = async (colIdx: number, value?: string) => {
  if (!data || !fileId) { setEditingHeader(null); return; }
  const newHeader = value !== undefined ? value : editingHeaderValue;
  const oldHeader = data.headers[colIdx];
  if (newHeader === oldHeader) { setEditingHeader(null); return; }
  try {
    const resp = await apiRenameColumn(fileId, oldHeader, newHeader);
    const columnTypes: any = {};
    resp.headers.forEach(h => {
      const t = resp.types[h];
      columnTypes[h] = t.includes('float') || t.includes('int') ? 'number' : 'text';
    });
    onDataChange({
      headers: resp.headers,
      rows: resp.rows,
      fileName: data.fileName,
      columnTypes,
      pinnedColumns: data.pinnedColumns,
      frozenColumns: data.frozenColumns,
      cellColors: data.cellColors,
    });
  } catch (err) {
    handleApiError('Rename column failed', err);
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
      const columnTypes: any = {};
      resp.headers.forEach(h => {
        const t = resp.types[h];
        columnTypes[h] = t.includes('float') || t.includes('int') ? 'number' : 'text';
      });
      onDataChange({
        headers: resp.headers,
        rows: resp.rows,
        fileName: data.fileName,
        columnTypes,
        pinnedColumns: data.pinnedColumns,
        frozenColumns: data.frozenColumns,
        cellColors: data.cellColors
      });
    } catch (err) {
      handleApiError('Edit cell failed', err);
    }
  };

  const handleAddRow = async () => {
    resetSaveSuccess();
    if (!data || !fileId) return;
    const idx = data.rows.length > 0 ? data.rows.length - 1 : 0;
    const dir: 'above' | 'below' = data.rows.length > 0 ? 'below' : 'above';
    try {
      const resp = await apiInsertRow(fileId, idx, dir);
      const columnTypes: any = {};
      resp.headers.forEach(h => {
        const t = resp.types[h];
        columnTypes[h] = t.includes('float') || t.includes('int') ? 'number' : 'text';
      });
      onDataChange({
        headers: resp.headers,
        rows: resp.rows,
        fileName: data.fileName,
        columnTypes,
        pinnedColumns: data.pinnedColumns,
        frozenColumns: data.frozenColumns,
        cellColors: data.cellColors,
      });
    } catch (err) {
      handleApiError('Insert row failed', err);
    }
  };

  const handleAddColumn = async () => {
    resetSaveSuccess();
    if (!data || !fileId) return;
    const newColumnName = `Column_${data.headers.length + 1}`;
    try {
      const resp = await apiInsertColumn(fileId, data.headers.length, newColumnName, '');
      const columnTypes: any = {};
      resp.headers.forEach(h => {
        const t = resp.types[h];
        columnTypes[h] = t.includes('float') || t.includes('int') ? 'number' : 'text';
      });
      onDataChange({
        headers: resp.headers,
        rows: resp.rows,
        fileName: data.fileName,
        columnTypes,
        pinnedColumns: data.pinnedColumns,
        frozenColumns: data.frozenColumns,
        cellColors: data.cellColors,
      });
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
      const toIndex = data.headers.indexOf(draggedCol);
      try {
        const resp = await apiMoveColumn(fileId, draggedCol, toIndex);
        const columnTypes: any = {};
        resp.headers.forEach(h => {
          const t = resp.types[h];
          columnTypes[h] = t.includes('float') || t.includes('int') ? 'number' : 'text';
        });
        onDataChange({
          headers: resp.headers,
          rows: resp.rows,
          fileName: data.fileName,
          columnTypes,
          pinnedColumns: data.pinnedColumns,
          frozenColumns: data.frozenColumns,
          cellColors: data.cellColors,
        });
      } catch (err) {
        handleApiError('Move column failed', err);
      }
    }
    setDraggedCol(null);
  };






const handleContextMenu = (e: React.MouseEvent, col: string) => {
  e.preventDefault();
  const idx = data ? data.headers.indexOf(col) : -1;
  setContextMenu({ x: e.clientX, y: e.clientY, col, colIdx: idx });
};

const handleSortAsc = (colIdx: number) => {
  if (!data) return;
  const col = data.headers[colIdx];
  handleSort(col, 'asc');
  setContextMenu(null);
  setOpenDropdown(null);
};

const handleSortDesc = (colIdx: number) => {
  if (!data) return;
  const col = data.headers[colIdx];
  handleSort(col, 'desc');
  setContextMenu(null);
  setOpenDropdown(null);
};

const handleClearSort = () => {
  if (!data || !contextMenu) return;
  const col = contextMenu.col;
  const newSortColumns = settings.sortColumns.filter(s => s.column !== col);
  onSettingsChange({ sortColumns: newSortColumns });
  setContextMenu(null);
  setOpenDropdown(null);
};

// Update handleClearFilter to accept a column name (string)
const handleClearFilter = async (col: string) => {
  if (!data || !settings.selectedFile) return;
  const newFilters = { ...settings.filters };
  delete newFilters[col];
  try {
    setOperationLoading(true);
    console.log('[DataFrameOperations] clear filter', col);
    const resp = await loadDataframeByKey(settings.selectedFile);
    const columnTypes: any = {};
    resp.headers.forEach(h => {
      const t = resp.types[h];
      columnTypes[h] = t.includes('float') || t.includes('int') ? 'number' : 'text';
    });
    onDataChange({
      headers: resp.headers,
      rows: resp.rows,
      fileName: data.fileName,
      columnTypes,
      pinnedColumns: data.pinnedColumns,
      frozenColumns: data.frozenColumns,
      cellColors: data.cellColors,
    });
    onSettingsChange({ filters: { ...newFilters }, fileId: resp.df_id });
  } catch (err) {
    handleApiError('Clear filter failed', err);
  } finally {
    setOperationLoading(false);
  }
  setFilterRange(null); // Reset numeric filter range UI
  setCurrentPage(1);
  setFilterMinInput('');
  setFilterMaxInput('');
};

const handleCellClick = (rowIndex: number, column: string) => {
  setSelectedCell({ row: rowIndex, col: column });
  setSelectedColumn(null);
};

const handleHeaderClick = (header: string) => {
  resetSaveSuccess();
  setSelectedColumn(header);
  setSelectedCell(null);
};

const insertDisabled = !selectedCell && !selectedColumn;
const deleteDisabled = !selectedCell && !selectedColumn;

const selectedColumns = Array.isArray(settings.selectedColumns) ? settings.selectedColumns : [];
const sortColumns = Array.isArray(settings.sortColumns) ? settings.sortColumns : [];
const filters = typeof settings.filters === 'object' && settings.filters !== null ? settings.filters : {};

  // Add a ref to each column header and store its bounding rect when right-clicked

  // 1. Fix column insert/delete logic
  const handleInsertColumn = async (colIdx: number) => {
    resetSaveSuccess();
    if (!data || !fileId) return;
    const newColKey = getNextColKey(data.headers);
    try {
      const resp = await apiInsertColumn(fileId, colIdx, newColKey, '');
      const columnTypes: any = {};
      resp.headers.forEach(h => {
        const t = resp.types[h];
        columnTypes[h] = t.includes('float') || t.includes('int') ? 'number' : 'text';
      });
      onDataChange({
        headers: resp.headers,
        rows: resp.rows,
        fileName: data.fileName,
        columnTypes,
        pinnedColumns: data.pinnedColumns,
        frozenColumns: data.frozenColumns,
        cellColors: data.cellColors,
      });
    } catch (err) {
      handleApiError('Insert column failed', err);
    }
  };

  const handleDeleteColumn = async (colIdx: number) => {
    resetSaveSuccess();
    if (!data || !fileId) return;
    if (colIdx < 0 || colIdx >= data.headers.length) return;
    const col = data.headers[colIdx];
    try {
      const resp = await apiDeleteColumn(fileId, col);
      const columnTypes: any = {};
      resp.headers.forEach(h => {
        const t = resp.types[h];
        columnTypes[h] = t.includes('float') || t.includes('int') ? 'number' : 'text';
      });
      onDataChange({
        headers: resp.headers,
        rows: resp.rows,
        fileName: data.fileName,
        columnTypes,
        pinnedColumns: data.pinnedColumns,
        frozenColumns: data.frozenColumns,
        cellColors: data.cellColors,
      });
    } catch (err) {
      handleApiError('Delete column failed', err);
    }
  };

  const handleDuplicateColumn = async (colIdx: number) => {
    resetSaveSuccess();
    if (!data || !fileId) return;
    const col = data.headers[colIdx];
    let newName = `${col}_copy`;
    while (data.headers.includes(newName)) {
      newName += '_copy';
    }
    try {
      const resp = await apiDuplicateColumn(fileId, col, newName);
      const columnTypes: any = {};
      resp.headers.forEach(h => {
        const t = resp.types[h];
        columnTypes[h] = t.includes('float') || t.includes('int') ? 'number' : 'text';
      });
      onDataChange({
        headers: resp.headers,
        rows: resp.rows,
        fileName: data.fileName,
        columnTypes,
        pinnedColumns: data.pinnedColumns,
        frozenColumns: data.frozenColumns,
        cellColors: data.cellColors,
      });
    } catch (err) {
      handleApiError('Duplicate column failed', err);
    }
  };

  // Row insert / delete handlers
  const handleInsertRow = async (position: 'above' | 'below', rowIdx: number) => {
    if (!data || !fileId) return;
    try {
      const resp = await apiInsertRow(fileId, rowIdx, position);
      const columnTypes: any = {};
      resp.headers.forEach(h => {
        const t = resp.types[h];
        columnTypes[h] = t.includes('float') || t.includes('int') ? 'number' : 'text';
      });
      onDataChange({
        headers: resp.headers,
        rows: resp.rows,
        fileName: data.fileName,
        columnTypes,
        pinnedColumns: data.pinnedColumns,
        frozenColumns: data.frozenColumns,
        cellColors: data.cellColors,
      });
    } catch (err) {
      handleApiError('Insert row failed', err);
    }
  };

  const handleDuplicateRow = async (rowIdx: number) => {
    if (!data || !fileId) return;
    try {
      const resp = await apiDuplicateRow(fileId, rowIdx);
      const columnTypes: any = {};
      resp.headers.forEach(h => {
        const t = resp.types[h];
        columnTypes[h] = t.includes('float') || t.includes('int') ? 'number' : 'text';
      });
      onDataChange({
        headers: resp.headers,
        rows: resp.rows,
        fileName: data.fileName,
        columnTypes,
        pinnedColumns: data.pinnedColumns,
        frozenColumns: data.frozenColumns,
        cellColors: data.cellColors,
      });
    } catch (err) {
      handleApiError('Duplicate row failed', err);
    }
  };

  const handleRetypeColumn = async (col: string, newType: 'number' | 'text') => {
    if (!data || !fileId) return;
    try {
      const resp = await apiRetypeColumn(fileId, col, newType === 'text' ? 'string' : newType);
      const columnTypes: any = {};
      resp.headers.forEach(h => {
        const t = resp.types[h];
        columnTypes[h] = t.includes('float') || t.includes('int') ? 'number' : 'text';
      });
      onDataChange({
        headers: resp.headers,
        rows: resp.rows,
        fileName: data.fileName,
        columnTypes,
        pinnedColumns: data.pinnedColumns,
        frozenColumns: data.frozenColumns,
        cellColors: data.cellColors,
      });
    } catch (err) {
      handleApiError('Retype column failed', err);
    }
  };

  const handleDeleteRow = async (rowIdx: number) => {
    if (!data || !fileId) return;
    try {
      const resp = await apiDeleteRow(fileId, rowIdx);
      const columnTypes: any = {};
      resp.headers.forEach(h => {
        const t = resp.types[h];
        columnTypes[h] = t.includes('float') || t.includes('int') ? 'number' : 'text';
      });
      onDataChange({
        headers: resp.headers,
        rows: resp.rows,
        fileName: data.fileName,
        columnTypes,
        pinnedColumns: data.pinnedColumns,
        frozenColumns: data.frozenColumns,
        cellColors: data.cellColors,
      });
    } catch (err) {
      handleApiError('Delete row failed', err);
    }
  };


  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={handleFileUpload}
        className="hidden"
      />
      
      <div className="flex flex-col">
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
        <div className="p-4 overflow-hidden">
          <div className="mx-auto max-w-screen-2xl rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col">
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
              <Button variant="outline" size="sm" onClick={onClearAll}>
                <RotateCcw className="w-4 h-4 mr-1" />
                Reset
              </Button>
            </div>
            <div className="relative flex flex-col items-center" style={{ minWidth: 180 }}>
              <Button
                onClick={handleSaveDataFrame}
                disabled={saveLoading}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {saveLoading ? 'Saving...' : 'Save DataFrame'}
              </Button>
            </div>
          </div>

          {/* Table section - Excel-like appearance */}
          <div className="overflow-auto">
            {/* Placeholder for when no data is loaded */}
            {!data || !Array.isArray(data.headers) || data.headers.length === 0 ? (
              <div className="flex flex-1 items-center justify-center bg-gray-50">
                <div className="border border-gray-200 bg-white rounded-lg p-4 text-center max-w-md w-full mx-auto">
                  <p className="p-4 text-center text-gray-500">No results to display. Upload a CSV or Excel file to see results here.</p>
                </div>
              </div>
            ) : (
              <div className="table-wrapper">
                <div className="table-edge-left" />
                <div className="table-edge-right" />
                <div className="table-overflow relative">
                  {operationLoading && (
                    <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10 text-sm text-slate-700">
                      Operation Loading...
                    </div>
                  )}
                  <Table className="table-base">
              <TableHeader className="table-header">
                <TableRow className="table-header-row">
                  {settings.showRowNumbers && (
                    <TableHead className="table-header-cell w-16 text-center">#</TableHead>
                  )}
                  {Array.isArray(data?.headers) && data.headers.map((header, colIdx) => (
                    <TableHead
                      key={header + '-' + colIdx}
                      data-col={header}
                      className={`table-header-cell text-center bg-white border-r border-gray-200 relative ${selectedColumn === header ? 'border-2 border-black' : ''}`}
                      style={settings.columnWidths?.[header] ? { width: settings.columnWidths[header], minWidth: settings.columnWidths[header] } : undefined}
                      draggable
                      onDragStart={() => handleDragStart(header)}
                      onDragOver={e => handleDragOver(e, header)}
                      onDragEnd={handleDragEnd}
                      onContextMenu={e => {
                        e.preventDefault();
                        let rect = undefined;
                        if (headerRefs.current && headerRefs.current[header]) {
                          rect = headerRefs.current[header].getBoundingClientRect?.();
                        }
                        setContextMenu({
                          x: rect ? rect.right : e.clientX,
                          y: rect ? rect.top : e.clientY,
                          col: header,
                          colIdx: colIdx
                        });
                        setRowContextMenu(null);
                      }}
                      onClick={() => handleHeaderClick(header)}
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
                          className="h-7 text-xs outline-none border-none bg-white px-0 font-bold text-gray-800 truncate text-center w-full"
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
                          className="flex items-center justify-center cursor-pointer w-full h-full"
                          onDoubleClick={() => {
                            // Always allow header editing regardless of enableEditing setting
                            setEditingHeader(colIdx);
                            setEditingHeaderValue(header);
                          }}
                          title="Double-click to edit column name"
                          style={{ width: '100%', height: '100%' }}
                        >
                          {headerDisplayNames[header] ?? header}
                        </div>
                      )}
                      <div
                        className="absolute top-0 right-0 h-full w-1 cursor-col-resize"
                        onMouseDown={e => startColResize(header, e)}
                      />
                    </TableHead>
                  ))}
                  <TableHead className="table-header-cell w-8" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRows.map((row, rowIndex) => (
                  <TableRow
                    key={rowIndex}
                    className="table-row relative"
                    ref={el => { if (rowRefs.current) rowRefs.current[startIndex + rowIndex] = el; }}
                    style={{ height: settings.rowHeights?.[startIndex + rowIndex] }}
                  >
                    {settings.showRowNumbers && (
                      <TableCell
                        className="table-cell w-16 text-center text-xs font-medium"
                        onContextMenu={e => {
                          e.preventDefault();
                          setRowContextMenu({ x: e.clientX, y: e.clientY, rowIdx: startIndex + rowIndex });
                          setContextMenu(null);
                        }}
                      >
                        {startIndex + rowIndex + 1}
                      </TableCell>
                    )}
                    {(data.headers || []).map((column, colIdx) => {
                      const cellValue = row[column];
                      const isEditing = editingCell?.row === rowIndex && editingCell?.col === column;
                        return (
                          <TableCell
                            key={colIdx}
                            data-col={column}
                            className={`table-cell text-center font-medium ${selectedCell?.row === rowIndex && selectedCell?.col === column ? 'border border-blue-400' : selectedColumn === column ? 'border border-black' : ''}`}
                            style={settings.columnWidths?.[column] ? { width: settings.columnWidths[column], minWidth: settings.columnWidths[column] } : undefined}
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
                            <div className="text-xs p-1 hover:bg-blue-50 rounded cursor-pointer min-h-[20px] flex items-center text-gray-800"
                              onDoubleClick={() => {
                                // Always allow cell editing regardless of enableEditing setting
                                setEditingCell({ row: rowIndex, col: column });
                                setEditingCellValue(safeToString(row[column]));
                              }}
                              title="Double-click to edit cell"
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
                      onMouseDown={e => startRowResize(startIndex + rowIndex, e)}
                    />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
          )}
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
        {contextMenu && data && typeof contextMenu.col === 'string' && (
        <div
          id="df-ops-context-menu"
          style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 1000, background: 'white', border: '1px solid #ddd', borderRadius: 6, boxShadow: '0 2px 8px #0001', minWidth: 200 }}
        >
          <div className="px-3 py-2 text-xs font-semibold border-b border-gray-200" style={{color:'#222'}}>Column: {contextMenu.col}</div>
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
            <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={e => { e.stopPropagation(); setOpenDropdown(openDropdown === 'filter' ? null : 'filter'); }}>
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
                    {processedData.uniqueValues[contextMenu.col]?.map((value) => (
                      <label key={value} className="flex items-center space-x-2 text-xs cursor-pointer" style={{userSelect:'none'}} onMouseDown={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={Array.isArray(filters[contextMenu.col]) && filters[contextMenu.col].includes(value)}
                          onMouseDown={e => e.stopPropagation()}
                          onChange={e => {
                            const currentFilters = Array.isArray(filters[contextMenu.col]) ? filters[contextMenu.col] : [];
                            const newFilters = e.target.checked
                              ? [...currentFilters, value]
                              : currentFilters.filter(v => v !== value);
                            handleColumnFilter(contextMenu.col, newFilters);
                          }}
                          style={{ accentColor: '#222' }}
                        />
                        <span className="truncate">{value}</span>
                      </label>
                    ))}
                    <div className="mt-2">
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
                )}
              </div>
            )}
          </div>
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
          {/* Duplicate */}
          <button
            className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100"
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              handleDuplicateColumn(contextMenu.colIdx);
              setContextMenu(null);
            }}
          >Duplicate</button>
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
          {/* Retype */}
          {data && data.columnTypes[contextMenu.col] !== 'number' && (
            <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleRetypeColumn(contextMenu.col, 'number'); setContextMenu(null); }}>Convert to Number</button>
          )}
          {data && data.columnTypes[contextMenu.col] !== 'text' && (
            <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={() => { handleRetypeColumn(contextMenu.col, 'text'); setContextMenu(null); }}>Convert to Text</button>
          )}
          <div className="px-3 py-2 text-xs text-gray-400">Right-click to close</div>
        </div>
      )}
      {rowContextMenu && typeof rowContextMenu.rowIdx === 'number' && (
        <div
          id="df-ops-row-context-menu"
          style={{ position: 'fixed', top: rowContextMenu.y, left: rowContextMenu.x, zIndex: 1000, background: 'white', border: '1px solid #ddd', borderRadius: 6, boxShadow: '0 2px 8px #0001', minWidth: 140 }}
        >
          <div className="px-3 py-2 text-xs font-semibold border-b border-gray-200" style={{color:'#222'}}>Row: {rowContextMenu.rowIdx + 1}</div>
          <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={e => { e.preventDefault(); e.stopPropagation(); handleInsertRow('above', rowContextMenu.rowIdx); setRowContextMenu(null); }}>Insert</button>
          <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={e => { e.preventDefault(); e.stopPropagation(); handleDuplicateRow(rowContextMenu.rowIdx); setRowContextMenu(null); }}>Duplicate</button>
          <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onClick={e => { e.preventDefault(); e.stopPropagation(); handleDeleteRow(rowContextMenu.rowIdx); setRowContextMenu(null); }}>Delete</button>
          <div className="px-3 py-2 text-xs text-gray-400">Right-click to close</div>
        </div>
      )}
      </div>
    </>
  );
};

export default DataFrameOperationsCanvas;
