import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import axios from 'axios';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import { DATAFRAME_OPERATIONS_API } from '@/lib/api';
import { toast } from '@/components/ui/use-toast';

interface DataFrameOperationsCanvasProps {
  data: DataFrameData | null;
  settings: DataFrameSettings;
  onSettingsChange: (settings: Partial<DataFrameSettings>) => void;
  onDataUpload: (data: DataFrameData) => void;
  onDataChange: (data: DataFrameData) => void;
  onClearAll: () => void;
  fileId?: string | null;
}

function safeToString(val: any): string {
  if (val === undefined || val === null) return '';
  try {
    return val.toString();
  } catch {
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

const DataFrameOperationsCanvas: React.FC<DataFrameOperationsCanvasProps> = ({
  data,
  settings,
  onSettingsChange,
  onDataUpload,
  onDataChange,
  onClearAll,
  fileId
}) => {
  console.log('Rendering DataFrameOperationsCanvas', data ? data.headers : null);
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
      const res = await fetch('/dataframe-operations/list_saved_dataframes');
      const data = await res.json();
      setSavedFiles(data.files || []);
    } catch (e) {
      // Optionally handle error
    }
  };

  const handleSaveDataFrame = async () => {
    setSaveLoading(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const csv_data = toCSV();
      const filename = `dataframe_ops_${data?.fileName?.replace(/\.[^/.]+$/, '') || 'file'}_${Date.now()}`;
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
      setOpenDropdown(null);
      setContextMenu(null);
      setRowContextMenu(null);
    };
    const handleContextMenu = (e: MouseEvent) => {
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
    console.log('processedData useMemo: settings.filters =', settings.filters);
    if (!data || !Array.isArray(data.headers) || !Array.isArray(data.rows)) {
      return { filteredRows: [], totalRows: 0, uniqueValues: {} };
    }

    let filteredRows = [...data.rows];

    // Apply search filter
    if (settings?.searchTerm?.trim()) {
      const term = settings.searchTerm.trim();
      const termLower = term.toLowerCase();
      const exactRegex = new RegExp(`^(?:${term.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')})$`, 'i');
      // decorate rows with ranking score then sort
      filteredRows = filteredRows
        .map((row, idx) => {
          let score = 0;
          for (const col of data.headers) {
            const valStr = safeToString(row[col]);
            if (exactRegex.test(valStr.trim())) { score = 2; break; }
            if (valStr.toLowerCase().includes(termLower)) { score = Math.max(score,1); }
          }
          return { row, idx, score }; // keep original idx for stable sort
        })
        .sort((a, b) => {
          if (b.row === undefined) return 0;
          if (a.score !== b.score) return b.score - a.score; // higher score first
          return a.idx - b.idx; // stable
        })
        .map(item => item.row);
    }

    // Apply column filters
    Object.entries(settings?.filters || {}).forEach(([column, filterValues]) => {
      if (!filterValues || (Array.isArray(filterValues) && filterValues.length === 0)) {
        // Skip columns with no filter
        return;
      }
      if (Array.isArray(filterValues) && filterValues.length > 0) {
        // Categorical filter
        filteredRows = filteredRows.filter(row => {
          return filterValues.includes(safeToString(row[column]));
        });
      } else if (filterValues && typeof filterValues === 'object' && filterValues.type === 'range' && Array.isArray(filterValues.value)) {
        // Numeric range filter
        const [min, max] = filterValues.value;
        filteredRows = filteredRows.filter(row => {
          const val = Number(row[column]);
          return !isNaN(val) && val >= min && val <= max;
        });
      }
    });

    // Apply sorting
    if (Array.isArray(settings?.sortColumns) && settings.sortColumns.length > 0) {
      // Only sort by the first column in sortColumns
      const sort = settings.sortColumns[0];
      if (sort) {
        filteredRows.sort((a, b) => {
          const aVal = a[sort.column];
          const bVal = b[sort.column];
          if (aVal === bVal) return 0;
          let comparison = 0;
          if (typeof aVal === 'number' && typeof bVal === 'number') {
            comparison = aVal - bVal;
          } else {
            comparison = safeToString(aVal).localeCompare(safeToString(bVal));
          }
          return sort.direction === 'desc' ? -comparison : comparison;
        });
      }
    }

    // Get unique values for filtering
    const uniqueValues: {[key: string]: string[]} = {};
    data.headers.forEach(header => {
      const values = Array.from(new Set(data.rows.map(row => safeToString(row[header]))))
        .filter(val => val !== '')
        .sort();
      uniqueValues[header] = values.slice(0, 50);
    });

    return { filteredRows, totalRows: filteredRows.length, uniqueValues };
  }, [data, settings]);

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

  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length === 0) {
          setUploadError('File is empty');
          return;
        }

        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        const rows = lines.slice(1).map((line) => {
          const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
          const row: any = {};
          headers.forEach((header, i) => {
            const value = values[i] || '';
            row[header] = !isNaN(parseFloat(value)) && isFinite(parseFloat(value)) ? parseFloat(value) : value;
          });
          return row;
        }).filter(row => Object.values(row).some(v => v !== null && v !== ''));

        const columnTypes: any = {};
        headers.forEach(header => {
          const hasNumbers = rows.some(row => typeof row[header] === 'number');
          columnTypes[header] = hasNumbers ? 'number' : 'text';
        });

        const newData: DataFrameData = {
          headers,
          rows,
          fileName: file.name,
          columnTypes,
          pinnedColumns: [],
          frozenColumns: 0,
          cellColors: {}
        };

        setUploadError(null);
        onDataUpload(newData);
        setCurrentPage(1);
      } catch (error) {
        setUploadError('Error parsing file');
      }
    };
    reader.readAsText(file);
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

  const handleSort = (column: string) => {
    const existingSort = settings.sortColumns.find(s => s.column === column);
    let newSortColumns;
    
    if (existingSort) {
      if (existingSort.direction === 'asc') {
        newSortColumns = settings.sortColumns.map(s => 
          s.column === column ? { ...s, direction: 'desc' as const } : s
        );
      } else {
        newSortColumns = settings.sortColumns.filter(s => s.column !== column);
      }
    } else {
      newSortColumns = [...settings.sortColumns, { column, direction: 'asc' as const }];
    }
    
    onSettingsChange({ sortColumns: newSortColumns });
  };

  const handleColumnFilter = (column: string, selectedValues: string[] | [number, number]) => {
    const newFilters = { ...settings.filters };
    if (Array.isArray(selectedValues) && selectedValues.length === 2 && typeof selectedValues[0] === 'number' && typeof selectedValues[1] === 'number') {
      // Numeric range filter
      newFilters[column] = { type: 'range', value: selectedValues };
    } else if (Array.isArray(selectedValues) && selectedValues.length > 0) {
      newFilters[column] = selectedValues;
    } else {
      delete newFilters[column];
    }
    onSettingsChange({ filters: newFilters });
    setCurrentPage(1);
  };

// Helper to commit a cell edit after user finishes editing
const commitCellEdit = (rowIndex: number, column: string) => {
  handleCellEdit(rowIndex, column, editingCellValue);
  setEditingCell(null);
};

// Helper to commit a header edit
const commitHeaderEdit = (colIdx: number, value?: string) => {
  if (!data) { setEditingHeader(null); return; }
  const newHeader = value !== undefined ? value : editingHeaderValue;
  const latestHeaders = [...data.headers];
  if (newHeader === latestHeaders[colIdx]) { setEditingHeader(null); return; }
  latestHeaders[colIdx] = newHeader;
  const newRows = data.rows.map(row => {
    const newRow: any = {};
    Object.entries(row).forEach(([k, v], i) => {
      newRow[i === colIdx ? newHeader : k] = v;
    });
    return newRow;
  });
  const newColumnTypes: any = {};
  Object.entries(data.columnTypes).forEach(([k, v], i) => {
    newColumnTypes[i === colIdx ? newHeader : k] = v;
  });
  onDataChange({ ...data, headers: latestHeaders, rows: newRows, columnTypes: newColumnTypes });
  setEditingHeader(null);
};

// Original immediate update util (kept for programmatic usage)
const handleCellEdit = (rowIndex: number, column: string, newValue: string) => {
    resetSaveSuccess();
    if (!data) return;
    
    const updatedRows = [...data.rows];
    const globalRowIndex = startIndex + rowIndex;
    
    let parsedValue: any = newValue;
    if (data.columnTypes[column] === 'number' && newValue) {
      const numValue = parseFloat(newValue);
      if (!isNaN(numValue)) {
        parsedValue = numValue;
      }
    }
    
    updatedRows[globalRowIndex] = {
      ...updatedRows[globalRowIndex],
      [column]: parsedValue
    };

    onDataChange({
      ...data,
      rows: updatedRows
    });
  };

  const handleAddRow = () => {
    resetSaveSuccess();
    if (!data) return;
    const newRow: any = {};
    data.headers.forEach(header => {
      newRow[header] = data.columnTypes[header] === 'number' ? 0 : '';
    });
    
    onDataChange({
      ...data,
      rows: [...data.rows, newRow]
    });
  };

  const handleAddColumn = () => {
    resetSaveSuccess();
    if (!data) return;
    const newColumnName = `Column_${data.headers.length + 1}`;
    
    onDataChange({
      ...data,
      headers: [...data.headers, newColumnName],
      columnTypes: {
        ...data.columnTypes,
        [newColumnName]: 'text'
      },
      rows: data.rows.map(row => ({
        ...row,
        [newColumnName]: ''
      }))
    });
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

  const handleDragEnd = () => {
    setDraggedCol(null);
  };






const handleContextMenu = (e: React.MouseEvent, col: string) => {
  e.preventDefault();
  setContextMenu({ x: e.clientX, y: e.clientY, col, colIdx: data?.headers.indexOf(col) || -1 });
};

const handleSortAsc = (colIdx: number) => {
  if (!data) return;
  const col = data.headers[colIdx];
  // Update settings to only sort by this column ascending
  onSettingsChange({ sortColumns: [{ column: col, direction: 'asc' }] });
  setContextMenu(null);
  setOpenDropdown(null);
};

const handleSortDesc = (colIdx: number) => {
  if (!data) return;
  const col = data.headers[colIdx];
  // Update settings to only sort by this column descending
  onSettingsChange({ sortColumns: [{ column: col, direction: 'desc' }] });
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
const handleClearFilter = (col: string) => {
  if (!data) return;
  const newFilters = { ...settings.filters };
  console.log('handleClearFilter called for column:', col, 'before:', newFilters);
  delete newFilters[col];
  console.log('after delete:', newFilters);
  // Trigger parent to update filters only (avoids accidentally sending stale copies of other settings)
  onSettingsChange({ filters: { ...newFilters } });
  setFilterRange(null); // Reset numeric filter range UI
  setCurrentPage(1);
  // Optionally reset local filterMinInput/filterMaxInput if needed
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
  const handleInsertColumn = (colIdx: number) => {
    if (!data) return;
    // Generate a visually blank unique key ("", " ", "  ", ...)
    let newColKey = '';
    while (data.headers.includes(newColKey)) {
      newColKey += ' ';
    }
    // Insert the new (blank-looking) key into headers
    const originalHeaders = [...data.headers];
    const newHeaders = [...data.headers];
    newHeaders.splice(colIdx, 0, newColKey);
    // Add blank value for each row
    const newRows = data.rows.map(row => {
      const newRow: any = {};
      newHeaders.forEach((h, i) => {
        if (i === colIdx) {
          newRow[h] = '';
        } else if (i < colIdx) {
          newRow[h] = row[originalHeaders[i]];
        } else {
          newRow[h] = row[originalHeaders[i - 1]];
        }
      });
      return newRow;
    });
    // Add to columnTypes
    const newColumnTypes: { [key: string]: 'number' | 'date' | 'text' } = { ...data.columnTypes };
    newColumnTypes[newColKey] = 'text';
    onDataChange({ ...data, headers: newHeaders, rows: newRows, columnTypes: newColumnTypes });
  
  };

  const handleDeleteColumn = (colIdx: number) => {
    if (!data) return;
    if (colIdx < 0 || colIdx >= data.headers.length) return;
    const col = data.headers[colIdx];
    const newHeaders = data.headers.filter((_, i) => i !== colIdx);
    const newRows = data.rows.map(row => {
      const newRow: any = {};
      newHeaders.forEach(h => {
        newRow[h] = row[h];
      });
      return newRow;
    });
    const newColumnTypes = { ...data.columnTypes };
    delete newColumnTypes[col];
    onDataChange({ ...data, headers: newHeaders, rows: newRows, columnTypes: newColumnTypes });
  
  };

  // Row insert / delete handlers
  const handleInsertRow = (position: 'above' | 'below', rowIdx: number) => {
    if (!data) return;
    const idx = Math.max(0, Math.min(rowIdx, data.rows.length - 1));
    const newRow: any = {};
    data.headers.forEach(h => {
      newRow[h] = '';
    });
    const newRows = [...data.rows];
    newRows.splice(position === 'above' ? idx : idx + 1, 0, newRow);
    onDataChange({ ...data, rows: newRows });
  };

  const handleDeleteRow = (rowIdx: number) => {
    if (!data) return;
    if (rowIdx < 0 || rowIdx >= data.rows.length) return;
    const newRows = data.rows.filter((_, i) => i !== rowIdx);
    onDataChange({ ...data, rows: newRows });
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
      
      {/* File name above table, small font, only if present */}
      {/* Remove the file name display from the card (delete the block that renders data.fileName) */}
      {/* Shift the table upwards to use the freed space */}
      {/* Move the pagination controls so they are always visible directly below the table */}
      <div className="h-full flex flex-col bg-background">
        <div className="flex-shrink-0 p-4 border-b border-border bg-card" />
        {/* Controls section */}
        <div className="flex-shrink-0 p-4 border-b border-border bg-card/50">
          <div className="flex items-center justify-between">
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
        </div>

        {/* Table section - Excel-like appearance */}
        <div className="flex-1 overflow-auto bg-white">
          {/* Placeholder for when no data is loaded */}
          {data && !Array.isArray(data.headers) || data.headers.length === 0 ? (
            <div className="flex flex-1 items-center justify-center bg-gray-50">
              <div className="border border-gray-200 bg-white rounded-lg p-4 text-center max-w-md w-full mx-auto">
                <p className="p-4 text-center text-gray-500">No results to display. Upload a CSV or Excel file to see results here.</p>
              </div>
            </div>
          ) : (
            <Table className="border-collapse w-full">
              <TableHeader className="bg-gradient-to-r from-gray-50 to-green-50 border-b-2 border-gray-100">
                <TableRow className="bg-gradient-to-r from-gray-50 to-green-50 border-b-2 border-gray-100">
                  {settings.showRowNumbers && (
                    <TableHead className="w-16 text-center font-bold text-gray-800 text-center py-4 bg-white border-r border-gray-200">#</TableHead>
                  )}
                  {Array.isArray(data?.headers) && data.headers.map((header, colIdx) => (
                    <TableHead
                      key={header + '-' + colIdx}
                      className={`font-bold text-gray-800 text-center py-4 bg-white border-r border-gray-200 ${selectedColumn === header ? 'border-2 border-blue-500' : ''}`}
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
                            setEditingHeader(colIdx);
                            setEditingHeaderValue(header);
                          }}
                          title="Double-click to edit column name"
                          style={{ width: '100%', height: '100%' }}
                        >
                          {headerDisplayNames[header] ?? header}
                        </div>
                      )}
                    </TableHead>
                  ))}
                  <TableHead className="w-8 bg-white border-l border-gray-200" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRows.map((row, rowIndex) => (
                  <TableRow key={rowIndex} className="hover:bg-green-50 border-b border-green-200">
                    {settings.showRowNumbers && (
                      <TableCell
                        className="w-16 text-center bg-white border-r border-gray-200 text-xs text-gray-700 font-medium px-2 py-2"
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
                          className={`py-4 text-center font-medium text-gray-700 bg-white border-r border-gray-200 min-w-[120px] ${selectedCell?.row === rowIndex && selectedCell?.col === column ? 'border border-blue-400' : ''}`}
                          onClick={() => setSelectedCell({ row: rowIndex, col: column })}
                          onDoubleClick={() => {
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
                                setEditingCell({ row: rowIndex, col: column });
                                setEditingCellValue(safeToString(row[column]));
                              }}
                            >
                              {safeToString(row[column]) !== '' ? highlightMatch(safeToString(row[column]), settings.searchTerm || '') : null}
                            </div>
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell className="w-8 bg-green-50 border-l border-green-200">
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
      {contextMenu && data && typeof contextMenu.col === 'string' && (
        <div
          id="df-ops-context-menu"
          style={{ position: 'fixed', top: contextMenu.y, left: contextMenu.x, zIndex: 1000, background: 'white', border: '1px solid #ddd', borderRadius: 6, boxShadow: '0 2px 8px #0001', minWidth: 200 }}
        >
          <div className="px-3 py-2 text-xs font-semibold border-b border-gray-200" style={{color:'#222'}}>Column: {contextMenu.col}</div>
          {/* Sort */}
          <div className="relative group">
            <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onMouseDown={e => { e.stopPropagation(); setOpenDropdown(openDropdown === 'sort' ? null : 'sort'); }}>
              Sort <span style={{fontSize:'10px',marginLeft:4}}>▶</span>
            </button>
            {openDropdown === 'sort' && (
              <div className="absolute left-full top-0 bg-white border border-gray-200 rounded shadow-md min-w-[160px] z-50">
                <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onMouseDown={() => { handleSortAsc(contextMenu.colIdx); setContextMenu(null); setOpenDropdown(null); }}>Sort Ascending</button>
                <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onMouseDown={() => { handleSortDesc(contextMenu.colIdx); setContextMenu(null); setOpenDropdown(null); }}>Sort Descending</button>
              </div>
            )}
          </div>
          {/* Filter */}
          <div className="relative group">
            <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onMouseDown={e => { e.stopPropagation(); setOpenDropdown(openDropdown === 'filter' ? null : 'filter'); }}>
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
                        <button
                          className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100 border border-gray-200 rounded mt-2"
                          onMouseDown={() => { handleColumnFilter(contextMenu.col, range as [number, number]); setContextMenu(null); setOpenDropdown(null); }}
                        >Apply Filter</button>
                        <button
                          className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100 border border-gray-200 rounded"
                          onMouseDown={e => { 
                            e.preventDefault(); 
                            e.stopPropagation(); 
                            console.log('Clear Filter button clicked for column:', contextMenu.col);
                            handleClearFilter(contextMenu.col); 
                            setContextMenu(null); 
                            setOpenDropdown(null); 
                          }}
                        >Clear Filter</button>
                      </div>
                    );
                  })()
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {processedData.uniqueValues[contextMenu.col]?.map((value) => (
                      <label key={value} className="flex items-center space-x-2 text-xs cursor-pointer" style={{userSelect:'none'}} onMouseDown={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={filters[contextMenu.col]?.includes(value) ?? false}
                          onMouseDown={e => e.stopPropagation()}
                          onChange={e => {
                            const currentFilters = filters[contextMenu.col] || [];
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
                    <button
                      className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100 border border-gray-200 rounded mt-2"
                      onMouseDown={e => { 
                        e.preventDefault(); 
                        e.stopPropagation(); 
                        console.log('Clear Filter button clicked for column:', contextMenu.col);
                        handleClearFilter(contextMenu.col); 
                        setContextMenu(null); 
                        setOpenDropdown(null); 
                      }}
                    >Clear Filter</button>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* Insert */}
          <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onMouseDown={() => { handleInsertColumn(contextMenu.colIdx); setContextMenu(null); }}>Insert</button>
          {/* Delete */}
          <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onMouseDown={() => { handleDeleteColumn(contextMenu.colIdx); setContextMenu(null); }}>Delete</button>
          <div className="px-3 py-2 text-xs text-gray-400">Right-click to close</div>
        </div>
      )}
      {rowContextMenu && typeof rowContextMenu.rowIdx === 'number' && (
        <div
          id="df-ops-row-context-menu"
          style={{ position: 'fixed', top: rowContextMenu.y, left: rowContextMenu.x, zIndex: 1000, background: 'white', border: '1px solid #ddd', borderRadius: 6, boxShadow: '0 2px 8px #0001', minWidth: 140 }}
        >
          <div className="px-3 py-2 text-xs font-semibold border-b border-gray-200" style={{color:'#222'}}>Row: {rowContextMenu.rowIdx + 1}</div>
          <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onMouseDown={e => { e.preventDefault(); e.stopPropagation(); handleInsertRow('above', rowContextMenu.rowIdx); setRowContextMenu(null); }}>Insert</button>
          <button className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100" onMouseDown={e => { e.preventDefault(); e.stopPropagation(); handleDeleteRow(rowContextMenu.rowIdx); setRowContextMenu(null); }}>Delete</button>
          <div className="px-3 py-2 text-xs text-gray-400">Right-click to close</div>
        </div>
      )}
    </>
  );
};

export default DataFrameOperationsCanvas;