import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import '@/templates/tables/table.css';
import { TableData, TableSettings } from '../TableAtom';
import BlankTableCanvas from './BlankTableCanvas';
import { getTheme } from './design/tableThemes';
import { calculateAggregation, formatAggregation, getBorderClasses, getNextColKey } from '../utils/tableUtils';
import { cn } from '@/lib/utils';
import {
  editTableCell,
  loadTable,
  deleteColumn as apiDeleteColumn,
  insertColumn as apiInsertColumn,
  renameColumn as apiRenameColumn,
  roundColumn as apiRoundColumn,
  retypeColumn as apiRetypeColumn,
  transformCase as apiTransformCase,
  duplicateColumn as apiDuplicateColumn,
  updateTable
} from '../services/tableApi';
import { toast } from '@/components/ui/use-toast';
import { ArrowUp, ArrowDown, Info, X, Filter } from 'lucide-react';
import CellRenderer from './CellRenderer';
import { TableRichTextToolbar } from './rich-text';
import type { TableCellFormatting } from './rich-text/types';
import { htmlMatchesValue, getPlainTextFromHtml } from './rich-text/utils/formattingUtils';
import NumberFilterComponent from './filters/NumberFilterComponent';
import TextFilterComponent from './filters/TextFilterComponent';

interface TableCanvasProps {
  data: TableData;
  settings: TableSettings;
  cellStyles?: Record<string, Record<string, Record<string, string>>>;
  onSettingsChange: (settings: Partial<TableSettings>) => void;
}

const TableCanvas: React.FC<TableCanvasProps> = ({
  data,
  settings,
  cellStyles = {},
  onSettingsChange
}) => {
  // Cell editing state
  const [editingCell, setEditingCell] = useState<{row: number, col: string} | null>(null);
  const [editingCellValue, setEditingCellValue] = useState<string>('');
  const [editingCellHtml, setEditingCellHtml] = useState<string>('');
  const editingInputRef = useRef<HTMLInputElement>(null);
  // Use refs to track editing state for commit operations (more reliable than state)
  const editingCellRef = useRef<{row: number, col: string} | null>(null);
  const editingCellValueRef = useRef<string>('');
  const editingCellHtmlRef = useRef<string>('');

  // Helper to clear editing state safely
  const clearEditingState = useCallback(() => {
    setEditingCell(null);
    setEditingCellValue('');
    setEditingCellHtml('');
    setShowToolbar(false);
    editingCellRef.current = null;
    editingCellValueRef.current = '';
    editingCellHtmlRef.current = '';
  }, []);

  // Clear editing state when data/ordering changes (sort/filter/page) to avoid stale refs
  useEffect(() => {
    // Only clear if an edit was in progress
    if (editingCellRef.current) {
      clearEditingState();
    }
  }, [clearEditingState, settings.sortConfig, settings.filters, settings.currentPage]);
  
  // Rich text formatting state for current editing cell
  const [cellFormatting, setCellFormatting] = useState<TableCellFormatting>({
    fontFamily: 'Arial',
    fontSize: 12,
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    textColor: '#000000',
    backgroundColor: 'transparent',
    textAlign: 'left',
  });
  
  // Toolbar visibility
  const [showToolbar, setShowToolbar] = useState(false);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Header editing state (for inline rename)
  const [editingHeader, setEditingHeader] = useState<string | null>(null);
  const [editingHeaderValue, setEditingHeaderValue] = useState<string>('');
  const editingHeaderInputRef = useRef<HTMLInputElement>(null);

  // Context menu state (like DataFrame Operations)
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    col: string;
    colIdx: number;
  } | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  
  // Filter data state - stores data without current column's filter for showing all options
  const [filterData, setFilterData] = useState<TableData | null>(null);
  const [filterColumn, setFilterColumn] = useState<string | null>(null);
  const [loadingFilterData, setLoadingFilterData] = useState(false);
  const headerRefs = useRef<{ [key: string]: HTMLTableCellElement | null }>({});
  const rowRefs = useRef<{ [key: number]: HTMLTableRowElement | null }>({});
  const portalTarget = typeof document !== 'undefined' ? document.body : null;

  // Multi-column selection state
  const [multiSelectedColumns, setMultiSelectedColumns] = useState<Set<string>>(new Set());

  // Delete confirmation modal state
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    isOpen: boolean;
    columnsToDelete: string[];
  }>({
    isOpen: false,
    columnsToDelete: [],
  });

  // Column resize state
  const [resizingCol, setResizingCol] = useState<{
    column: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  // Row resize state
  const [resizingRow, setResizingRow] = useState<{
    rowIndex: number;
    startY: number;
    startHeight: number;
  } | null>(null);

  // Get layout and design settings with defaults
  const layout = settings.layout || {
    headerRow: true,
    totalRow: false,
    bandedRows: false,
    bandedColumns: false,
    firstColumn: false,
    lastColumn: false,
  };
  const design = settings.design || {
    theme: 'plain',
    borderStyle: 'all',
  };
  const totalRowConfig = settings.totalRowConfig || {};

  // Get theme
  const theme = getTheme(design.theme);

  // Always use data.columns from backend (fixed column names)
  // When headerRow is false: No separate header row, but still use data.columns for column access
  // When headerRow is true: Show separate header row with data.columns
  const effectiveColumns = useMemo(() => {
    // Always use backend column names (fixed, not from first row)
    return data.columns;
  }, [data.columns]);

  // Column key mapping: effectiveColumns === data.columns (1:1 mapping, always)
  // Since we always use data.columns, no mapping needed
  const columnKeyMap = useMemo(() => {
    const mapping: Record<string, string> = {};
    effectiveColumns.forEach(col => {
      mapping[col] = col;
    });
    return mapping;
  }, [effectiveColumns]);
  
  // Helper function to get data column key by index
  // Since effectiveColumns === data.columns always, just use the index directly
  const getDataColumnKeyByIndex = useCallback((colIdx: number): string => {
    return effectiveColumns[colIdx] || data.columns[colIdx] || `Column_${colIdx + 1}`;
  }, [effectiveColumns, data.columns]);

  // Get visible columns (filtered by settings if needed)
  const visibleColumns = useMemo(() => {
    if (settings.visibleColumns && settings.visibleColumns.length > 0) {
      return settings.visibleColumns.filter(col => effectiveColumns.includes(col));
    }
    return effectiveColumns;
  }, [effectiveColumns, settings.visibleColumns]);

  // Compute data rows to display
  // Always show all rows (no skipping - headerRow only controls whether to show separate header row)
  const dataRowsToDisplay = useMemo(() => {
    // Safety check: ensure data.rows is an array
    if (!data || !Array.isArray(data.rows) || data.rows.length === 0) {
      return [];
    }
    // Always show all rows
    return data.rows;
  }, [data]);

  // Get column widths (reduced by 25%: 150px → 112.5px)
  const getColumnWidth = (column: string) => {
    return settings.columnWidths[column] || 112.5;
  };

  // Calculate row height from font size
  const calculateRowHeightFromFontSize = useCallback((fontSize: number): number => {
    // Formula: fontSize * lineHeightMultiplier + padding
    // Line height multiplier: 1.5 (standard)
    // Padding: 8px (top + bottom)
    const calculatedHeight = fontSize * 1.5 + 8;
    // Minimum height: 24px, maximum: 200px
    return Math.max(24, Math.min(200, Math.ceil(calculatedHeight)));
  }, []);

  // Get row height (per-row or global default)
  const getRowHeight = (rowIndex: number) => {
    return settings.rowHeights?.[rowIndex] || settings.rowHeight || 24;
  };

  // Start column resize (match DataFrameOperations pattern)
  const startColumnResize = (column: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Get width from settings (like DataFrameOperations)
    const currentWidth = settings.columnWidths?.[column] || 112.5;
    const startX = e.clientX;
    
    setResizingCol({ column, startX, startWidth: currentWidth });
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  // Start row resize (match DataFrameOperations pattern)
  const startRowResize = (rowIndex: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Get height from rowRefs (like DataFrameOperations)
    const startHeight = rowRefs.current[rowIndex]?.offsetHeight || settings.rowHeight || 24;
    const startY = e.clientY;
    
    setResizingRow({ rowIndex, startY, startHeight });
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
  };

  // Handle mouse move during resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (resizingCol) {
        const delta = e.clientX - resizingCol.startX;
        const newWidth = Math.max(Math.min(resizingCol.startWidth + delta, 500), 50);
        
        onSettingsChange({
          columnWidths: {
            ...settings.columnWidths,
            [resizingCol.column]: newWidth,
          },
        });
      }
      
      if (resizingRow) {
        const deltaY = e.clientY - resizingRow.startY;
        const newHeight = Math.max(resizingRow.startHeight + deltaY, 20);
        
        // Update rowHeights (per-row heights)
        const currentRowHeights = settings.rowHeights || {};
        onSettingsChange({
          rowHeights: {
            ...currentRowHeights,
            [resizingRow.rowIndex]: newHeight,
          },
        });
      }
    };
    
    const handleMouseUp = () => {
      if (resizingCol) {
        setResizingCol(null);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
      if (resizingRow) {
        setResizingRow(null);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };
    
    if (resizingCol || resizingRow) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [resizingCol, resizingRow, settings.columnWidths, settings.rowHeights, onSettingsChange]);

  // Shared sort updater - fetch sorted data from backend and persist sortConfig
  const applySort = async (newSortConfig: Array<{ column: string; direction: 'asc' | 'desc' }>) => {
    // If no table session yet, just update local config
    if (!settings.tableId) {
      onSettingsChange({ sortConfig: newSortConfig });
      return;
    }

    try {
      const resp = await updateTable(settings.tableId, {
        ...settings,
        sort_config: newSortConfig,
      });

      onSettingsChange({
        sortConfig: newSortConfig,
        tableData: {
          table_id: resp.table_id,
          columns: resp.columns,
          rows: resp.rows,
          row_count: resp.row_count,
          column_types: resp.column_types,
          object_name: resp.object_name || data.object_name,
        },
      });
    } catch (error: any) {
      toast({
        title: 'Sort failed',
        description: error?.message || 'Failed to sort table',
        variant: 'destructive',
      });
    }
  };

  // Handle sort (for context menu - no click sorting)
  const handleSortAsc = (column: string) => {
    applySort([{ column, direction: 'asc' }]);
  };

  const handleSortDesc = (column: string) => {
    applySort([{ column, direction: 'desc' }]);
  };

  const handleClearSort = () => {
    applySort([]);
  };

  // Get sort indicator (for display only)
  const getSortIndicator = (column: string) => {
    const sort = settings.sortConfig.find(s => s.column === column);
    if (!sort) return null;
    return sort.direction === 'asc' ? '↑' : '↓';
  };

  // Column operation handlers (like DataFrame Operations)
  const handleColumnFilter = async (column: string, filterValue: string[] | [number, number]) => {
    if (!settings.tableId) return;

    try {
      // Update filters in settings
      const newFilters = { ...settings.filters };
      if (Array.isArray(filterValue) && filterValue.length === 0) {
        delete newFilters[column];
      } else {
        newFilters[column] = filterValue;
      }

      // Update table with new filters while preserving current sort order
      const resp = await updateTable(settings.tableId, {
        ...settings,
        filters: newFilters,
        sort_config: settings.sortConfig, // keep current sort when filtering
      });

      // Update tableData from response
      onSettingsChange({
        filters: newFilters,
        tableData: {
          table_id: resp.table_id,
          columns: resp.columns,
          rows: resp.rows,
          row_count: resp.row_count,
          column_types: resp.column_types,
          object_name: resp.object_name || data.object_name,
        }
      });

      // Clear filter data when filter is applied (will reload on next open)
      setFilterData(null);
      setFilterColumn(null);

      toast({
        title: 'Filter applied',
        description: `Filter applied to column: ${column}`,
      });
    } catch (error: any) {
      toast({
        title: 'Filter failed',
        description: error.message || 'Failed to apply filter',
        variant: 'destructive',
      });
    }
  };

  const handleClearFilter = async (column: string) => {
    await handleColumnFilter(column, []);
    // Clear filter data when filter is cleared
    setFilterData(null);
    setFilterColumn(null);
  };

  // Handle opening filter dialog - load data without current column's filter
  const handleOpenFilter = async (column: string) => {
    if (!settings.tableId) {
      // If no tableId, just open filter with current data
      setFilterData(null);
      setFilterColumn(column);
      setOpenDropdown(openDropdown === 'filter' ? null : 'filter');
      return;
    }

    try {
      setLoadingFilterData(true);
      
      // Temporarily remove this column's filter to show all options
      const tempFilters = { ...settings.filters };
      delete tempFilters[column];
      
      // Load data with all filters EXCEPT current column's filter, but preserve sort
      const resp = await updateTable(settings.tableId, {
        ...settings,
        filters: tempFilters,  // All filters EXCEPT current column
        sort_config: settings.sortConfig, // preserve current sort while previewing filter options
      });
      
      // Store this data for filter component (shows all options for this column)
      setFilterData({
        table_id: resp.table_id,
        columns: resp.columns,
        rows: resp.rows,
        row_count: resp.row_count,
        column_types: resp.column_types,
        object_name: resp.object_name || data.object_name,
      });
      setFilterColumn(column);
      setOpenDropdown(openDropdown === 'filter' ? null : 'filter');
    } catch (error: any) {
      console.error('Failed to load filter data:', error);
      // Fallback: use current data if loading fails
      setFilterData(null);
      setFilterColumn(column);
      setOpenDropdown(openDropdown === 'filter' ? null : 'filter');
    } finally {
      setLoadingFilterData(false);
    }
  };

  // Execute deletion of multiple columns
  const executeDeleteColumns = async (columnsToDelete: string[]) => {
    if (!settings.tableId || columnsToDelete.length === 0) return;

    let activeTableId = settings.tableId;
    let deletedCount = 0;

    try {
      // Delete columns sequentially
      for (const column of columnsToDelete) {
        try {
          const resp = await apiDeleteColumn(activeTableId, column);
          activeTableId = resp.table_id; // Update tableId for next iteration
          deletedCount++;
          
          // Update state after each deletion
          onSettingsChange({
            tableData: {
              table_id: resp.table_id,
              columns: resp.columns,
              rows: resp.rows,
              row_count: resp.row_count,
              column_types: resp.column_types,
              object_name: resp.object_name || data.object_name,
            },
            visibleColumns: resp.columns,
            columnOrder: resp.columns,
            tableId: resp.table_id,
          });
        } catch (error: any) {
          // Session recovery for individual column
          const errorMessage = error?.message || String(error);
          if (errorMessage.includes('session not found') || errorMessage.includes('Table session not found')) {
            try {
              const newTableId = await reloadTableFromSource();
              if (newTableId) {
                const resp = await apiDeleteColumn(newTableId, column);
                activeTableId = resp.table_id;
                deletedCount++;
                
                onSettingsChange({
                  tableData: {
                    table_id: resp.table_id,
                    columns: resp.columns,
                    rows: resp.rows,
                    row_count: resp.row_count,
                    column_types: resp.column_types,
                    object_name: resp.object_name || data.object_name,
                  },
                  visibleColumns: resp.columns,
                  columnOrder: resp.columns,
                  tableId: resp.table_id,
                });
              }
            } catch (recoveryError: any) {
              // Recovery failed, continue with next column
            }
          }
        }
      }

      // Clear multi-selection
      setMultiSelectedColumns(new Set());
      setDeleteConfirmModal({ isOpen: false, columnsToDelete: [] });

      // Show success toast
      if (deletedCount > 0) {
        toast({
          title: deletedCount === 1 ? 'Column deleted' : `${deletedCount} columns deleted`,
          description: deletedCount === 1 
            ? `Column "${columnsToDelete[0]}" has been deleted`
            : `${deletedCount} columns have been deleted`,
        });
      }
    } catch (error: any) {
      toast({
        title: 'Delete failed',
        description: error.message || 'Failed to delete columns',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteColumn = async (column: string) => {
    if (!settings.tableId) return;

    // Check if there are multiple selected columns
    if (multiSelectedColumns.size > 1) {
      // Filter out hidden columns and ensure column is in selection
      const columnsToDelete = Array.from(multiSelectedColumns).filter(col => 
        data.columns.includes(col)
      );
      
      if (columnsToDelete.length > 1) {
        setDeleteConfirmModal({
          isOpen: true,
          columnsToDelete,
        });
        return;
      }
    }

    // Single column delete - show confirmation
    if (!confirm(`Are you sure you want to delete column "${column}"?`)) {
      return;
    }

    await executeDeleteColumns([column]);
  };

  const handleInsertColumn = async (colIdx: number, columnName?: string) => {
    if (!settings.tableId) return;

    const name = columnName || getNextColKey(data.columns);
    let activeTableId = settings.tableId;

    try {
      const resp = await apiInsertColumn(activeTableId, colIdx, name, '');

      // Update tableData from response
      onSettingsChange({
        tableData: {
          table_id: resp.table_id,
          columns: resp.columns,
          rows: resp.rows,
          row_count: resp.row_count,
          column_types: resp.column_types,
          object_name: resp.object_name || data.object_name,
        },
        visibleColumns: resp.columns,
        columnOrder: resp.columns,
        tableId: resp.table_id,
      });

      toast({
        title: 'Column inserted',
        description: `Column "${name}" has been inserted`,
      });
    } catch (error: any) {
      // Session recovery: if session not found, reload from source and retry
      const errorMessage = error?.message || String(error);
      if (errorMessage.includes('session not found') || errorMessage.includes('Table session not found')) {
        try {
          const newTableId = await reloadTableFromSource();
          if (newTableId) {
            const resp = await apiInsertColumn(newTableId, colIdx, name, '');
            
            onSettingsChange({
              tableData: {
                table_id: resp.table_id,
                columns: resp.columns,
                rows: resp.rows,
                row_count: resp.row_count,
                column_types: resp.column_types,
                object_name: resp.object_name || data.object_name,
              },
              visibleColumns: resp.columns,
              columnOrder: resp.columns,
              tableId: resp.table_id,
            });

            toast({
              title: 'Column inserted',
              description: `Column "${name}" has been inserted`,
            });
            return;
          }
        } catch (recoveryError: any) {
          toast({
            title: 'Insert failed',
            description: recoveryError.message || 'Failed to insert column (session recovery failed)',
            variant: 'destructive',
          });
          return;
        }
      }
      
      toast({
        title: 'Insert failed',
        description: error.message || 'Failed to insert column',
        variant: 'destructive',
      });
    }
  };

  const handleRenameColumn = async (oldName: string, newName: string) => {
    if (!settings.tableId || !newName.trim()) return;

    let activeTableId = settings.tableId;

    try {
      const resp = await apiRenameColumn(activeTableId, oldName, newName);

      // Update tableData from response
      onSettingsChange({
        tableData: {
          table_id: resp.table_id,
          columns: resp.columns,
          rows: resp.rows,
          row_count: resp.row_count,
          column_types: resp.column_types,
          object_name: resp.object_name || data.object_name,
        },
        visibleColumns: resp.columns,
        columnOrder: resp.columns,
        tableId: resp.table_id,
      });

      toast({
        title: 'Column renamed',
        description: `Column renamed from "${oldName}" to "${newName}"`,
      });
    } catch (error: any) {
      // Session recovery: if session not found, reload from source and retry
      const errorMessage = error?.message || String(error);
      if (errorMessage.includes('session not found') || errorMessage.includes('Table session not found')) {
        try {
          const newTableId = await reloadTableFromSource();
          if (newTableId) {
            const resp = await apiRenameColumn(newTableId, oldName, newName);
            
            onSettingsChange({
              tableData: {
                table_id: resp.table_id,
                columns: resp.columns,
                rows: resp.rows,
                row_count: resp.row_count,
                column_types: resp.column_types,
                object_name: resp.object_name || data.object_name,
              },
              visibleColumns: resp.columns,
              columnOrder: resp.columns,
              tableId: resp.table_id,
            });

            toast({
              title: 'Column renamed',
              description: `Column renamed from "${oldName}" to "${newName}"`,
            });
            return;
          }
        } catch (recoveryError: any) {
          toast({
            title: 'Rename failed',
            description: recoveryError.message || 'Failed to rename column (session recovery failed)',
            variant: 'destructive',
          });
          return;
        }
      }
      
      toast({
        title: 'Rename failed',
        description: error.message || 'Failed to rename column',
        variant: 'destructive',
      });
    }
  };

  // Commit header edit (inline rename)
  const commitHeaderEdit = useCallback(async (column: string, newName?: string) => {
    if (!settings.tableId) {
      setEditingHeader(null);
      return;
    }

    const finalNewName = newName !== undefined ? newName : editingHeaderValue;
    
    // If name unchanged, just close editing
    if (finalNewName.trim() === column) {
      setEditingHeader(null);
      return;
    }

    if (!finalNewName.trim()) {
      setEditingHeader(null);
      return;
    }

    try {
      await handleRenameColumn(column, finalNewName.trim());
      setEditingHeader(null);
      setEditingHeaderValue('');
    } catch (error) {
      // Error already handled in handleRenameColumn
      setEditingHeader(null);
      setEditingHeaderValue('');
    }
  }, [settings.tableId, editingHeaderValue, handleRenameColumn]);

  const handleRoundColumn = async (column: string, decimalPlaces: number) => {
    if (!settings.tableId) return;

    let activeTableId = settings.tableId;

    try {
      const resp = await apiRoundColumn(activeTableId, column, decimalPlaces);

      // Update tableData from response
      onSettingsChange({
        tableData: {
          table_id: resp.table_id,
          columns: resp.columns,
          rows: resp.rows,
          row_count: resp.row_count,
          column_types: resp.column_types,
          object_name: resp.object_name || data.object_name,
        },
        tableId: resp.table_id,
      });

      toast({
        title: 'Column rounded',
        description: `Column "${column}" rounded to ${decimalPlaces} decimal places`,
      });
    } catch (error: any) {
      // Session recovery: if session not found, reload from source and retry
      const errorMessage = error?.message || String(error);
      if (errorMessage.includes('session not found') || errorMessage.includes('Table session not found')) {
        try {
          const newTableId = await reloadTableFromSource();
          if (newTableId) {
            const resp = await apiRoundColumn(newTableId, column, decimalPlaces);
            
            onSettingsChange({
              tableData: {
                table_id: resp.table_id,
                columns: resp.columns,
                rows: resp.rows,
                row_count: resp.row_count,
                column_types: resp.column_types,
                object_name: resp.object_name || data.object_name,
              },
              tableId: resp.table_id,
            });

            toast({
              title: 'Column rounded',
              description: `Column "${column}" rounded to ${decimalPlaces} decimal places`,
            });
            return;
          }
        } catch (recoveryError: any) {
          toast({
            title: 'Round failed',
            description: recoveryError.message || 'Failed to round column (session recovery failed)',
            variant: 'destructive',
          });
          return;
        }
      }
      
      toast({
        title: 'Round failed',
        description: error.message || 'Failed to round column',
        variant: 'destructive',
      });
    }
  };

  const handleRetypeColumn = async (column: string, newType: string) => {
    if (!settings.tableId) return;

    let activeTableId = settings.tableId;

    try {
      const resp = await apiRetypeColumn(activeTableId, column, newType);

      // Update tableData from response
      onSettingsChange({
        tableData: {
          table_id: resp.table_id,
          columns: resp.columns,
          rows: resp.rows,
          row_count: resp.row_count,
          column_types: resp.column_types,
          object_name: resp.object_name || data.object_name,
        },
        tableId: resp.table_id,
      });

      toast({
        title: 'Column type changed',
        description: `Column "${column}" type changed to ${newType}`,
      });
    } catch (error: any) {
      // Session recovery: if session not found, reload from source and retry
      const errorMessage = error?.message || String(error);
      if (errorMessage.includes('session not found') || errorMessage.includes('Table session not found')) {
        try {
          const newTableId = await reloadTableFromSource();
          if (newTableId) {
            const resp = await apiRetypeColumn(newTableId, column, newType);
            
            onSettingsChange({
              tableData: {
                table_id: resp.table_id,
                columns: resp.columns,
                rows: resp.rows,
                row_count: resp.row_count,
                column_types: resp.column_types,
                object_name: resp.object_name || data.object_name,
              },
              tableId: resp.table_id,
            });

            toast({
              title: 'Column type changed',
              description: `Column "${column}" type changed to ${newType}`,
            });
            return;
          }
        } catch (recoveryError: any) {
          toast({
            title: 'Retype failed',
            description: recoveryError.message || 'Failed to change column type (session recovery failed)',
            variant: 'destructive',
          });
          return;
        }
      }
      
      toast({
        title: 'Retype failed',
        description: error.message || 'Failed to change column type',
        variant: 'destructive',
      });
    }
  };

  const handleTransformCase = async (column: string, caseType: string) => {
    if (!settings.tableId) return;

    let activeTableId = settings.tableId;

    try {
      const resp = await apiTransformCase(activeTableId, column, caseType);

      // Update tableData from response
      onSettingsChange({
        tableData: {
          table_id: resp.table_id,
          columns: resp.columns,
          rows: resp.rows,
          row_count: resp.row_count,
          column_types: resp.column_types,
          object_name: resp.object_name || data.object_name,
        },
        tableId: resp.table_id,
      });

      toast({
        title: 'Case transformed',
        description: `Column "${column}" case changed to ${caseType}`,
      });
    } catch (error: any) {
      // Session recovery: if session not found, reload from source and retry
      const errorMessage = error?.message || String(error);
      if (errorMessage.includes('session not found') || errorMessage.includes('Table session not found')) {
        try {
          const newTableId = await reloadTableFromSource();
          if (newTableId) {
            const resp = await apiTransformCase(newTableId, column, caseType);
            
            onSettingsChange({
              tableData: {
                table_id: resp.table_id,
                columns: resp.columns,
                rows: resp.rows,
                row_count: resp.row_count,
                column_types: resp.column_types,
                object_name: resp.object_name || data.object_name,
              },
              tableId: resp.table_id,
            });

            toast({
              title: 'Case transformed',
              description: `Column "${column}" case changed to ${caseType}`,
            });
            return;
          }
        } catch (recoveryError: any) {
          toast({
            title: 'Transform failed',
            description: recoveryError.message || 'Failed to transform case (session recovery failed)',
            variant: 'destructive',
          });
          return;
        }
      }
      
      toast({
        title: 'Transform failed',
        description: error.message || 'Failed to transform case',
        variant: 'destructive',
      });
    }
  };

  const handleDuplicateColumn = async (column: string, newName: string) => {
    if (!settings.tableId || !newName.trim()) return;

    let activeTableId = settings.tableId;

    try {
      const resp = await apiDuplicateColumn(activeTableId, column, newName);

      // Update tableData from response
      onSettingsChange({
        tableData: {
          table_id: resp.table_id,
          columns: resp.columns,
          rows: resp.rows,
          row_count: resp.row_count,
          column_types: resp.column_types,
          object_name: resp.object_name || data.object_name,
        },
        visibleColumns: resp.columns,
        columnOrder: resp.columns,
        tableId: resp.table_id,
      });

      toast({
        title: 'Column duplicated',
        description: `Column "${column}" duplicated as "${newName}"`,
      });
    } catch (error: any) {
      // Session recovery: if session not found, reload from source and retry
      const errorMessage = error?.message || String(error);
      if (errorMessage.includes('session not found') || errorMessage.includes('Table session not found')) {
        try {
          const newTableId = await reloadTableFromSource();
          if (newTableId) {
            const resp = await apiDuplicateColumn(newTableId, column, newName);
            
            onSettingsChange({
              tableData: {
                table_id: resp.table_id,
                columns: resp.columns,
                rows: resp.rows,
                row_count: resp.row_count,
                column_types: resp.column_types,
                object_name: resp.object_name || data.object_name,
              },
              visibleColumns: resp.columns,
              columnOrder: resp.columns,
              tableId: resp.table_id,
            });

            toast({
              title: 'Column duplicated',
              description: `Column "${column}" duplicated as "${newName}"`,
            });
            return;
          }
        } catch (recoveryError: any) {
          toast({
            title: 'Duplicate failed',
            description: recoveryError.message || 'Failed to duplicate column (session recovery failed)',
            variant: 'destructive',
          });
          return;
        }
      }
      
      toast({
        title: 'Duplicate failed',
        description: error.message || 'Failed to duplicate column',
        variant: 'destructive',
      });
    }
  };

  // Frontend-only operations
  const handleHideColumn = (column: string) => {
    const newVisibleColumns = settings.visibleColumns.filter(col => col !== column);
    onSettingsChange({ visibleColumns: newVisibleColumns });
    toast({
      title: 'Column hidden',
      description: `Column "${column}" is now hidden`,
    });
  };

  const handleUnhideColumn = (column: string) => {
    if (!data.columns.includes(column)) return;
    const newVisibleColumns = [...settings.visibleColumns, column];
    onSettingsChange({ visibleColumns: newVisibleColumns });
    toast({
      title: 'Column unhidden',
      description: `Column "${column}" is now visible`,
    });
  };

  // Get hidden columns (use effectiveColumns, not data.columns)
  const hiddenColumns = effectiveColumns.filter(col => !settings.visibleColumns.includes(col));

  // Close context menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setContextMenu(null);
        setOpenDropdown(null);
        // Clear filter data when context menu closes
        setFilterData(null);
        setFilterColumn(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu]);

  // Format cell value based on type
  const formatCellValue = (value: any, columnType: string) => {
    if (value === null || value === undefined) {
      return <span className="text-gray-400 italic">null</span>;
    }

    if (columnType === 'float' && typeof value === 'number') {
      return value.toFixed(2);
    }

    if (columnType === 'integer' && typeof value === 'number') {
      return value.toLocaleString();
    }

    return String(value);
  };

  // Calculate visible rows based on pagination
  // Use dataRowsToDisplay (which already accounts for headerRow setting)
  const startIdx = (settings.currentPage - 1) * settings.pageSize;
  const endIdx = startIdx + settings.pageSize;
  const visibleRows = dataRowsToDisplay.slice(startIdx, endIdx);

  // Get cell formatting from settings
  const getCellFormatting = useCallback((rowIdx: number, column: string) => {
    const rowKey = String(rowIdx);
    const cellFormat = settings.cellFormatting?.[rowKey]?.[column];
    if (cellFormat) {
      return {
        fontFamily: cellFormat.fontFamily || 'Arial',
        fontSize: cellFormat.fontSize || 12,
        bold: cellFormat.bold || false,
        italic: cellFormat.italic || false,
        underline: cellFormat.underline || false,
        strikethrough: cellFormat.strikethrough || false,
        textColor: cellFormat.textColor || '#000000',
        backgroundColor: cellFormat.backgroundColor || 'transparent',
        textAlign: (cellFormat.textAlign || 'left') as 'left' | 'center' | 'right',
      };
    }
    return {
      fontFamily: 'Arial',
      fontSize: 12,
      bold: false,
      italic: false,
      underline: false,
      strikethrough: false,
      textColor: '#000000',
      backgroundColor: 'transparent',
      textAlign: 'left' as 'left' | 'center' | 'right',
    };
  }, [settings.cellFormatting]);

  // Get background color from formatting (not conditional formatting)
  const getCellBackgroundColor = useCallback((rowIdx: number, column: string): string | undefined => {
    const rowKey = String(rowIdx);
    const cellFormat = settings.cellFormatting?.[rowKey]?.[column];
    if (cellFormat?.backgroundColor && cellFormat.backgroundColor !== 'transparent') {
      return cellFormat.backgroundColor;
    }
    return undefined; // Use default/CF background
  }, [settings.cellFormatting]);

  // Handle cell click to start editing
  const handleCellClick = (rowIdx: number, column: string) => {
    // Get the row and access value using column (column is from visibleColumns which matches data.columns)
    const row = visibleRows[rowIdx];
    const currentValue = row?.[column];
    
    // CRITICAL FIX: Use original row index from row data if available (when filters are applied)
    // Otherwise fall back to calculated index (for unfiltered data)
    const originalRowIndex = row?.__original_row_index__;
    const actualRowIdx = originalRowIndex !== undefined 
      ? originalRowIndex 
      : (startIdx + rowIdx);
    
    const rowKey = String(actualRowIdx);
    const cellFormat = settings.cellFormatting?.[rowKey]?.[column];
    const valueString = String(currentValue ?? '');
    
    // Store column identifier consistently (use column from visibleColumns)
    const editingCellState = { row: actualRowIdx, col: column };
    setEditingCell(editingCellState);
    setEditingCellValue(valueString);
    setEditingCellHtml(cellFormat?.html || valueString);
    
    // Update refs for reliable commit operations
    editingCellRef.current = editingCellState;
    editingCellValueRef.current = valueString;
    editingCellHtmlRef.current = cellFormat?.html || valueString;
    
    // Load formatting for this cell
    const formatting = getCellFormatting(actualRowIdx, column);
    setCellFormatting(formatting);
    
    // If row height not set, calculate from font size
    if (!settings.rowHeights?.[actualRowIdx]) {
      const calculatedHeight = calculateRowHeightFromFontSize(formatting.fontSize);
      const currentRowHeights = settings.rowHeights || {};
      onSettingsChange({
        rowHeights: {
          ...currentRowHeights,
          [actualRowIdx]: calculatedHeight,
        },
      });
    }
    
    setShowToolbar(true);
  };

  // Reload table from source file if session is lost (like DataFrame Operations recovery)
  const reloadTableFromSource = async (): Promise<string | null> => {
    if (!settings.sourceFile) {
      return null;
    }

    try {
      const reloadedData = await loadTable(settings.sourceFile);
      
      // Update settings with new session ID and data
      onSettingsChange({
        tableData: reloadedData,
        tableId: reloadedData.table_id,
        sourceFile: settings.sourceFile,  // Preserve source file
        visibleColumns: reloadedData.columns,
        columnOrder: reloadedData.columns,
      });
      
      return reloadedData.table_id;
    } catch (error) {
      throw error;
    }
  };

  // Refresh table from backend with current filters/sort (to preserve view state after edits)
  const refreshTableWithCurrentView = useCallback(async (): Promise<TableData | null> => {
    if (!settings.tableId) return null;
    try {
      const resp = await updateTable(settings.tableId, {
        ...settings,
        filters: settings.filters,
        sort_config: settings.sortConfig,
      });
      return {
        table_id: resp.table_id,
        columns: resp.columns,
        rows: resp.rows,
        row_count: resp.row_count,
        column_types: resp.column_types,
        object_name: resp.object_name || data.object_name,
      };
    } catch (error) {
      console.error('Failed to refresh table with current view:', error);
      return null;
    }
  }, [settings, data.object_name]);

  // Handle cell edit (internal function - called by commitCellEdit)
  // Like DataFrame Operations: uses API response to replace entire tableData
  // Includes session recovery if session is lost
  // Returns updated tableData for combining with formatting updates
  const handleCellEdit = async (globalRowIndex: number, column: string, newValue: string): Promise<TableData | null> => {
    // Use tableId from settings (like DataFrame Operations uses fileId)
    let activeTableId = settings.tableId;
    if (!activeTableId) {
      return null;
    }

    try {
      // Call backend to update cell
      // globalRowIndex is the actual row index in the full dataset (already calculated)
      const resp = await editTableCell(activeTableId, globalRowIndex, column, newValue);
      
      // After edit, refresh data with current filters/sort so view stays consistent
      const refreshed = await refreshTableWithCurrentView();

      if (refreshed) {
        return refreshed;
      }

      // Fallback: use edit response merged with existing data (preview-safe)
      let updatedRows: Array<Record<string, any>>;
      if (resp.rows.length === resp.row_count) {
        updatedRows = resp.rows;
      } else {
        updatedRows = [...resp.rows];
        if (data.rows.length > resp.rows.length) {
          const existingRowsBeyondPreview = data.rows.slice(resp.rows.length);
          const rowsBeyondPreview = existingRowsBeyondPreview.map((row, idx) => {
            const actualIdx = resp.rows.length + idx;
            if (actualIdx === globalRowIndex) {
              return { ...row, [column]: newValue };
            }
            return row;
          });
          updatedRows = [...resp.rows, ...rowsBeyondPreview];
        }
      }

      return {
        table_id: resp.table_id,
        columns: resp.columns,
        rows: updatedRows,
        row_count: resp.row_count,
        column_types: resp.column_types,
        object_name: resp.object_name || data.object_name,
      };
    } catch (error: any) {
      // Session recovery: if session not found, reload from source and retry
      const errorMessage = error?.message || String(error);
      if (errorMessage.includes('session not found') || errorMessage.includes('Table session not found')) {
        try {
          // Reload table from source file
          const newTableId = await reloadTableFromSource();
          
          if (newTableId) {
            // Retry the edit with new session ID
            const resp = await editTableCell(newTableId, globalRowIndex, column, newValue);

            // After recovery edit, refresh with current view to keep filters/sort
            const refreshed = await refreshTableWithCurrentView();
            if (refreshed) {
              return refreshed;
            }

            // Fallback merge if refresh fails
            let updatedRows: Array<Record<string, any>>;
            if (resp.rows.length === resp.row_count) {
              updatedRows = resp.rows;
            } else {
              updatedRows = [...resp.rows];
              if (data.rows.length > resp.rows.length) {
                const existingRowsBeyondPreview = data.rows.slice(resp.rows.length);
                const rowsBeyondPreview = existingRowsBeyondPreview.map((row, idx) => {
                  const actualIdx = resp.rows.length + idx;
                  if (actualIdx === globalRowIndex) {
                    return { ...row, [column]: newValue };
                  }
                  return row;
                });
                updatedRows = [...resp.rows, ...rowsBeyondPreview];
              }
            }
            
            // Return updated tableData after recovery
            return {
              table_id: resp.table_id,
              columns: resp.columns,
              rows: updatedRows,
              row_count: resp.row_count,
              column_types: resp.column_types,
              object_name: resp.object_name || data.object_name,
            };
          }
        } catch (recoveryError) {
          throw recoveryError;
        }
      }
      
      // Re-throw error if not a session error or recovery failed
      throw error;
    }
  };

  // Commit cell edit (like DataFrame Operations - clear state before API call)
  const commitCellEdit = async (globalRowIdx: number, column: string, htmlValue?: string) => {
    // Use refs for reliable state checking (refs don't change during async operations)
    const currentEditingCell = editingCellRef.current;
    
    // Prevent multiple commits if already committing or cell doesn't match
    if (!currentEditingCell || (currentEditingCell.row !== globalRowIdx || currentEditingCell.col !== column)) {
      return;
    }
    
    // Save the value and HTML from refs (more reliable than state during async operations)
    const valueToSave = editingCellValueRef.current || editingCellValue;
    let htmlToSave = htmlValue || editingCellHtmlRef.current || editingCellHtml || valueToSave;
    
    // CRITICAL FIX: Ensure HTML matches plain text value
    // If HTML doesn't match, regenerate it from plain text
    const plainTextFromHtml = htmlToSave ? getPlainTextFromHtml(htmlToSave) : '';
    if (plainTextFromHtml !== valueToSave) {
      // HTML doesn't match plain text - use plain text as HTML (will preserve formatting via CSS)
      htmlToSave = valueToSave;
    }
    
    // Save formatting to settings
    const rowKey = String(globalRowIdx);
    const currentFormatting = settings.cellFormatting || {};
    const rowFormatting = currentFormatting[rowKey] || {};
    
    const updatedFormatting = {
      ...currentFormatting,
      [rowKey]: {
        ...rowFormatting,
        [column]: {
          html: htmlToSave,
          fontFamily: cellFormatting.fontFamily,
          fontSize: cellFormatting.fontSize,
          bold: cellFormatting.bold,
          italic: cellFormatting.italic,
          underline: cellFormatting.underline,
          strikethrough: cellFormatting.strikethrough,
          textColor: cellFormatting.textColor,
          backgroundColor: cellFormatting.backgroundColor,
          // textAlign removed - not supported in table cells
        },
      },
    };
    
    // Call API to save the value FIRST (before clearing state)
    try {
      // Save plain text value to backend
      const updatedTableData = await handleCellEdit(globalRowIdx, column, valueToSave);
      
      // After successful API call, update both formatting and tableData together
      // This ensures they're in sync and prevents race conditions
      const updatesToApply: Partial<TableSettings> = {
        cellFormatting: updatedFormatting,
      };
      
      // Include tableData update if handleCellEdit returned it
      if (updatedTableData) {
        updatesToApply.tableData = updatedTableData;
      }
      
      // Single atomic update with both formatting and tableData
      onSettingsChange(updatesToApply);
      
  // Only clear editing state AFTER successful save
  // CRITICAL: Check if the cell being committed still matches the current editing cell
  // This prevents race conditions where user clicks to edit again before commit finishes
  const stillEditingCell = editingCellRef.current;
  if (stillEditingCell && stillEditingCell.row === globalRowIdx && stillEditingCell.col === column) {
    // Cell still matches - safe to clear editing state
    setEditingCell(null);
    setEditingCellValue('');
    setEditingCellHtml('');
    setShowToolbar(false);
    
    // Clear refs as well
    editingCellRef.current = null;
    editingCellValueRef.current = '';
    editingCellHtmlRef.current = '';
  }
  // If cell doesn't match, user has already clicked to edit again - don't clear state
    } catch (error) {
      // If save fails, restore editing state so user can try again
      setEditingCell({ row: globalRowIdx, col: column });
      setEditingCellValue(valueToSave);
      setEditingCellHtml(htmlToSave);
      setShowToolbar(true);
      
      // Still save formatting even if API call fails (for offline editing)
      // User can retry the API call later, but formatting is preserved
      onSettingsChange({
        cellFormatting: updatedFormatting,
      });
    }
  };

  // Toolbar positioning - position near editing cell
  const [toolbarPosition, setToolbarPosition] = useState<{ top: number; left: number } | null>(null);
  const [toolbarCellRect, setToolbarCellRect] = useState<{ top: number; left: number; width: number } | null>(null);
  
  useEffect(() => {
    if (!editingCell || !showToolbar) {
      setToolbarPosition(null);
      setToolbarCellRect(null);
      return;
    }

    // Use requestAnimationFrame to ensure DOM is updated
    requestAnimationFrame(() => {
      // Double-check editingCell still exists (might have been cleared)
      if (!editingCell) {
        setToolbarPosition(null);
        setToolbarCellRect(null);
        return;
      }

      // Find the cell element
      const cellElement = document.querySelector(
        `[data-table-cell-row="${editingCell.row}"][data-table-cell-col="${editingCell.col}"]`
      ) as HTMLElement;

      if (cellElement) {
        try {
          const rect = cellElement.getBoundingClientRect();
          setToolbarPosition({
            top: Math.max(10, rect.top - 60), // Position above the cell, but not off-screen
            left: rect.left + rect.width / 2, // Center horizontally
          });
          setToolbarCellRect({
            top: rect.top + window.scrollY,
            left: rect.left + window.scrollX,
            width: rect.width,
          });
        } catch (error) {
          setToolbarPosition(null);
          setToolbarCellRect(null);
        }
      } else {
        // Cell element not found - might be scrolled out of view or re-rendered
        // Try again after a short delay
        setTimeout(() => {
          if (editingCell && showToolbar) {
            const retryElement = document.querySelector(
              `[data-table-cell-row="${editingCell.row}"][data-table-cell-col="${editingCell.col}"]`
            ) as HTMLElement;
            if (retryElement) {
              try {
                const rect = retryElement.getBoundingClientRect();
                setToolbarPosition({
                  top: Math.max(10, rect.top - 60),
                  left: rect.left + rect.width / 2,
                });
                setToolbarCellRect({
                  top: rect.top + window.scrollY,
                  left: rect.left + window.scrollX,
                  width: rect.width,
                });
              } catch (error) {
                setToolbarPosition(null);
                setToolbarCellRect(null);
              }
            }
          }
        }, 100);
      }
    });
  }, [editingCell, showToolbar]);

  // Note: Focus is handled in RichTextCellEditor component

  // Focus header input when editing starts
  useEffect(() => {
    if (editingHeader && editingHeaderInputRef.current) {
      editingHeaderInputRef.current.focus();
      editingHeaderInputRef.current.select();
    }
  }, [editingHeader]);

  // Get cell style based on position and settings
  const getCellStyle = (
    rowIdx: number,
    colIdx: number,
    column: string,
    isHeader: boolean = false,
    isTotalRow: boolean = false,
    actualRowIdx?: number  // Actual row index in full dataset for CF lookup
  ): React.CSSProperties => {
    const style: React.CSSProperties = {
      color: theme.colors.cellText,
    };

    // Header row styling
    if (isHeader && layout.headerRow) {
      style.backgroundColor = theme.colors.headerBg;
      style.color = theme.colors.headerText;
      style.fontWeight = 'bold';
      return style;
    }

    // Total row styling
    if (isTotalRow) {
      style.backgroundColor = theme.colors.totalRowBg || theme.colors.headerBg;
      style.fontWeight = 'bold';
      return style;
    }

    // First column emphasis
    if (layout.firstColumn && colIdx === 0) {
      style.backgroundColor = theme.colors.firstColumnBg || theme.colors.headerBg;
      style.fontWeight = 'bold';
      if (layout.firstColumn) {
        style.position = 'sticky';
        style.left = 0;
        style.zIndex = 1001;
      }
    }

    // Last column emphasis
    if (layout.lastColumn && colIdx === visibleColumns.length - 1) {
      style.backgroundColor = theme.colors.totalRowBg || theme.colors.headerBg;
    }

    // Banded rows
    if (layout.bandedRows) {
      const isEvenRow = (startIdx + rowIdx) % 2 === 0;
      if (isEvenRow) {
        style.backgroundColor = theme.colors.evenRowBg;
      } else {
        style.backgroundColor = theme.colors.oddRowBg;
      }
    } else {
      style.backgroundColor = theme.colors.oddRowBg;
    }

    // Banded columns (combine with row background)
    if (layout.bandedColumns && colIdx % 2 === 0) {
      const currentBg = style.backgroundColor as string;
      // Lighten the background for banded columns
      style.backgroundColor = currentBg === theme.colors.oddRowBg 
        ? theme.colors.evenRowBg 
        : theme.colors.oddRowBg;
    }

    // Apply conditional formatting styles (HIGH PRIORITY - overrides theme but not header/total)
    if (!isHeader && !isTotalRow && cellStyles && Object.keys(cellStyles).length > 0 && actualRowIdx !== undefined) {
      // Use provided actualRowIdx or calculate from startIdx + rowIdx
      const rowIndex = actualRowIdx !== undefined ? actualRowIdx : (startIdx + rowIdx);
      const rowKey = `row_${rowIndex}`;
      const rowStyles = cellStyles[rowKey];
      
      if (rowStyles) {
        // Try the column name directly first (backend uses the exact column name from rule)
        // Also try the data column key in case there's a mapping issue
        const dataColumnKey = columnKeyMap?.[column] || column;
        const cellStyle = rowStyles[column] || rowStyles[dataColumnKey];
        
        if (cellStyle) {
          // Merge conditional formatting styles - CRITICAL: These must override theme styles
          // Inline styles in React have high specificity, so they should override
          if (cellStyle.backgroundColor) {
            style.backgroundColor = cellStyle.backgroundColor;
          }
          if (cellStyle.textColor) {
            style.color = cellStyle.textColor;
          }
          if (cellStyle.fontWeight) {
            style.fontWeight = cellStyle.fontWeight as React.CSSProperties['fontWeight'];
          }
          if (cellStyle.fontSize) {
            style.fontSize = typeof cellStyle.fontSize === 'string' ? cellStyle.fontSize : `${cellStyle.fontSize}px`;
          }
        }
      }
    }

    return style;
  };

  // Calculate total row values
  // Use dataRowsToDisplay (all rows)
  const totalRowValues = useMemo(() => {
    if (!layout.totalRow) return {};
    
    const totals: Record<string, string> = {};
    visibleColumns.forEach(column => {
      const aggType = totalRowConfig[column] || 'none';
      if (aggType !== 'none') {
        // Use dataRowsToDisplay for aggregation (already accounts for headerRow setting)
        const value = calculateAggregation(dataRowsToDisplay, column, aggType);
        totals[column] = formatAggregation(value, aggType);
      } else {
        totals[column] = '';
      }
    });
    return totals;
  }, [layout.totalRow, totalRowConfig, visibleColumns, dataRowsToDisplay]);

  // If blank table mode, use BlankTableCanvas
  if (settings.mode === 'blank' && settings.blankTableConfig?.created && data.table_id) {
    return (
      <BlankTableCanvas
        atomId={(settings as any).atomId || ''}
        tableId={data.table_id}
        rows={settings.blankTableConfig.rows}
        columns={settings.blankTableConfig.columns}
        columnNames={settings.blankTableConfig.columnNames || settings.visibleColumns || data.columns}
        settings={settings}
        onSettingsChange={onSettingsChange}
      />
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="table-wrapper">
        <div className="table-overflow">
          <Table className="table-base">
            {/* Header Row Rendering Logic */}
            {layout.headerRow && (
              // When headerRow is true: Show separate header row with right-click menu
              <TableHeader 
                className="table-header"
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 1002,
                  backgroundColor: theme.colors.headerBg
                }}
              >
                <TableRow className="table-header-row">
                  {visibleColumns.map((column, colIdx) => {
                    const isFirstCol = colIdx === 0;
                    const isLastCol = colIdx === visibleColumns.length - 1;
                    const cellStyle = getCellStyle(0, colIdx, column, true);
                    
                    return (
                      <TableHead
                        key={column}
                        ref={(el) => { headerRefs.current[column] = el; }}
                        className={cn(
                          "table-header-cell",
                          getBorderClasses(design.borderStyle, true, true, isFirstCol, isLastCol)
                        )}
                        style={{
                          minWidth: `${getColumnWidth(column)}px`,
                          maxWidth: '500px',  // Allow resizing (min !== max)
                          width: `${getColumnWidth(column)}px`,
                          position: 'relative',  // CRITICAL: For absolute positioning of resize handle
                          ...cellStyle,
                          backgroundColor: multiSelectedColumns.has(column) 
                            ? '#e0e7ff' 
                            : (cellStyle.backgroundColor || theme.colors.headerBg),
                          borderColor: theme.colors.borderColor,
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          const headerElement = e.currentTarget as HTMLElement;
                          const headerRect = headerElement.getBoundingClientRect();
                          
                          // Position menu to the right of the column header
                          const menuX = headerRect.right + 5;
                          const menuY = e.clientY;
                          
                          setContextMenu({
                            x: menuX,
                            y: menuY,
                            col: column,
                            colIdx: colIdx
                          });
                          setOpenDropdown(null);
                        }}
                        onClick={(e) => {
                          // Ignore clicks on resize handle
                          const target = e.target as HTMLElement;
                          if (target.closest('[data-column-resize-handle]')) {
                            return;
                          }
                          
                          // Handle Ctrl+Click for multi-selection
                          if (e.ctrlKey || e.metaKey) {
                            e.preventDefault();
                            e.stopPropagation();
                            setMultiSelectedColumns(prev => {
                              const newSet = new Set(prev);
                              if (newSet.has(column)) {
                                newSet.delete(column);
                              } else {
                                newSet.add(column);
                              }
                              return newSet;
                            });
                          } else {
                            // Regular click - clear multi-selection
                            if (multiSelectedColumns.size > 0) {
                              setMultiSelectedColumns(new Set());
                            }
                          }
                        }}
                        onDoubleClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          // Start inline editing
                          setEditingHeader(column);
                          setEditingHeaderValue(column);
                        }}
                      >
                        {editingHeader === column ? (
                          <input
                            ref={editingHeaderInputRef}
                            type="text"
                            value={editingHeaderValue}
                            onChange={(e) => setEditingHeaderValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                commitHeaderEdit(column, e.currentTarget.value);
                              } else if (e.key === 'Escape') {
                                e.preventDefault();
                                setEditingHeader(null);
                                setEditingHeaderValue('');
                              }
                            }}
                            onBlur={(e) => {
                              commitHeaderEdit(column, e.target.value);
                            }}
                            className="w-full h-full text-sm outline-none border-none bg-transparent px-0 font-bold"
                            style={{
                              padding: '2px 4px',
                              margin: 0,
                              textAlign: 'left',
                              boxSizing: 'border-box',
                              color: cellStyle.color,
                            }}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="truncate">{column}</span>
                            {getSortIndicator(column) && (
                              <span className="text-xs flex-shrink-0">{getSortIndicator(column)}</span>
                            )}
                            {settings.filters?.[column] && (
                              <Filter className="w-3 h-3 text-blue-600 flex-shrink-0" />
                            )}
                          </div>
                        )}
                        <div
                          data-column-resize-handle="true"
                          className="absolute top-0 right-0 h-full cursor-col-resize bg-blue-300 opacity-0 hover:opacity-100 transition-opacity duration-150"
                          onMouseDown={(e) => {
                            e.stopPropagation(); // Prevent header click
                            e.preventDefault(); // Prevent default behavior
                            startColumnResize(column, e);
                          }}
                          style={{ 
                            zIndex: 20,
                            pointerEvents: 'auto', // Ensure handle receives mouse events
                            right: '-2px', // Extend slightly beyond edge for easier clicking
                            width: '4px', // Make handle wider (4px instead of 1px) for easier clicking
                          }}
                          title="Drag to resize column"
                        />
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
            )}
            {/* When headerRow is false: No header row is shown, all rows are data rows */}

            <TableBody>
              {visibleRows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={visibleColumns.length}
                    className={cn(
                      "px-4 py-8 text-center text-gray-500",
                      getBorderClasses(design.borderStyle, false, false, true, true)
                    )}
                    style={{ borderColor: theme.colors.borderColor }}
                  >
                    No data to display
                  </TableCell>
                </TableRow>
              ) : (
                <>
                  {/* All data rows - shown regardless of headerRow setting */}
                  {visibleRows.map((row, rowIdx) => {
                    // CRITICAL FIX: Use original row index from row data if available (when filters are applied)
                    const originalRowIndex = row?.__original_row_index__;
                    const actualRowIdx = originalRowIndex !== undefined 
                      ? originalRowIndex 
                      : (startIdx + rowIdx);
                    const actualRowIdxForStyling = actualRowIdx;
                    
                    return (
                      <TableRow 
                        key={actualRowIdx} 
                        ref={(el) => {
                          if (rowRefs.current && actualRowIdx !== undefined) {
                            rowRefs.current[actualRowIdx] = el;
                          }
                        }}
                        className={cn(
                          "table-row",
                          layout.bandedRows && actualRowIdxForStyling % 2 === 0 && "bg-opacity-50"
                        )}
                        style={{
                          position: 'relative',  // For absolute positioning of resize handle
                        }}
                      >
                        {visibleColumns.map((column, colIdx) => {
                          const isFirstCol = colIdx === 0;
                          const isLastCol = colIdx === visibleColumns.length - 1;
                          // Use the actualRowIdx calculated above (from original row index or calculated)
                          const cellStyle = getCellStyle(rowIdx, colIdx, column, false, false, actualRowIdx);
                          const isEditing = editingCell?.row === actualRowIdx && editingCell?.col === column;
                          
                          // Since effectiveColumns === data.columns always, use column directly
                          const dataColumnKey = columnKeyMap[column] || column;
                          const cellValue = row[dataColumnKey];
                          
                        // Get background color from formatting (prioritize CF, then formatting, then theme)
                        // During editing, use local cellFormatting state; otherwise use saved formatting
                        const formattingBgColor = isEditing && editingCell?.row === actualRowIdx && editingCell?.col === column
                          ? (cellFormatting.backgroundColor !== 'transparent' ? cellFormatting.backgroundColor : undefined)
                          : getCellBackgroundColor(actualRowIdx, column);
                        
                        return (
                          <TableCell
                            key={column}
                            className={cn(
                              "table-cell",
                              getBorderClasses(design.borderStyle, false, false, isFirstCol, isLastCol),
                              layout.firstColumn && isFirstCol && "sticky left-0 z-[1001]",
                              isEditing && "p-0"
                            )}
                            style={{
                              minWidth: `${getColumnWidth(column)}px`,
                              maxWidth: '500px',  // Allow resizing (min !== max)
                              width: `${getColumnWidth(column)}px`,
                              height: `${getRowHeight(actualRowIdx)}px`,  // Use per-row height
                              borderColor: theme.colors.borderColor,
                              ...cellStyle, // Spread CF styles (includes backgroundColor, color, etc.)
                              // CRITICAL: Priority order: CF > Formatting > Theme
                              // CF styles override everything (already in cellStyle)
                              backgroundColor: cellStyle.backgroundColor || formattingBgColor || undefined,
                              color: cellStyle.color || undefined,
                            }}
                            data-table-cell-row={actualRowIdx}
                            data-table-cell-col={column}
                          onDoubleClick={() => {
                            if (!isEditing) {
                              handleCellClick(rowIdx, column);
                            }
                          }}
                        >
                            <CellRenderer
                              value={isEditing ? editingCellValue : String(cellValue ?? '')}
                              html={(() => {
                                const rowKey = String(actualRowIdx);
                                const cellFormat = settings.cellFormatting?.[rowKey]?.[column];
                                const storedHtml = cellFormat?.html;
                                const currentValue = String(cellValue ?? '');
                                
                                // CRITICAL FIX: If HTML exists, verify it matches current value
                                // If HTML doesn't match current value, don't use HTML (will fallback to value)
                                if (storedHtml) {
                                  if (!htmlMatchesValue(storedHtml, currentValue)) {
                                    return undefined; // Force fallback to plain text value
                                  }
                                }
                                
                                return storedHtml;
                              })()}
                              formatting={(() => {
                                const rowKey = String(actualRowIdx);
                                const cellFormat = settings.cellFormatting?.[rowKey]?.[column];
                                if (cellFormat) {
                                  return {
                                    fontFamily: cellFormat.fontFamily,
                                    fontSize: cellFormat.fontSize,
                                    bold: cellFormat.bold,
                                    italic: cellFormat.italic,
                                    underline: cellFormat.underline,
                                    strikethrough: cellFormat.strikethrough,
                                    textColor: cellFormat.textColor,
                                    backgroundColor: cellFormat.backgroundColor,
                                    textAlign: cellFormat.textAlign,
                                  };
                                }
                                return undefined;
                              })()}
                              isEditing={isEditing}
                              onValueChange={(plainText, htmlText) => {
                                setEditingCellValue(plainText);
                                editingCellValueRef.current = plainText; // Update ref immediately
                                if (htmlText) {
                                  setEditingCellHtml(htmlText);
                                  editingCellHtmlRef.current = htmlText; // Update ref immediately
                                }
                              }}
              onFormattingChange={(fmt) => {
                if (!isEditing) return;
                setCellFormatting(prev => ({ ...prev, ...fmt }));
              }}
                              onCommit={(plainText, htmlText) => {
                                commitCellEdit(actualRowIdx, column, htmlText);
                              }}
                              onCancel={() => {
                                setEditingCell(null);
                                setEditingCellValue('');
                                setEditingCellHtml('');
                                setShowToolbar(false);
                                
                                // Clear refs as well
                                editingCellRef.current = null;
                                editingCellValueRef.current = '';
                                editingCellHtmlRef.current = '';
                              }}
                              onClick={() => {
                                // Single-click enters edit mode immediately
                                if (!isEditing) {
                                  handleCellClick(rowIdx, column);
                                }
                              }}
                              onFocus={() => {
                                // Focus handler if needed
                              }}
                              onBlur={() => {
                                // Blur is handled in CellRenderer
                              }}
                              textAlign={settings.design?.columnAlignment?.[column]?.horizontal || 'left'}
                              className={cn(
                                isEditing && "p-0"
                              )}
                              style={{
                                ...cellStyle,
                                // Padding handled by CSS
                              }}
                            />
                          </TableCell>
                        );
                      })}
                      <div
                        className="absolute bottom-0 left-0 w-full h-1 cursor-row-resize bg-blue-300 opacity-0 hover:opacity-100 transition-opacity duration-150 z-20"
                        onMouseDown={(e) => actualRowIdx !== undefined && startRowResize(actualRowIdx, e)}
                        title="Drag to resize row"
                        style={{
                          zIndex: 20,
                        }}
                      />
                      </TableRow>
                    );
                  })}
                  
                  {/* Total Row */}
                  {layout.totalRow && (
                    <TableRow 
                      className="table-total-row"
                      style={{
                        position: 'sticky',
                        bottom: 0,
                        zIndex: 1001,
                        backgroundColor: theme.colors.totalRowBg || theme.colors.headerBg
                      }}
                    >
                      {visibleColumns.map((column, colIdx) => {
                        const isFirstCol = colIdx === 0;
                        const isLastCol = colIdx === visibleColumns.length - 1;
                        const cellStyle = getCellStyle(0, colIdx, column, false, true);
                        const totalValue = totalRowValues[column] || '';
                        
                        return (
                          <TableCell
                            key={column}
                            className={cn(
                              "table-cell font-bold",
                              getBorderClasses(design.borderStyle, false, false, isFirstCol, isLastCol),
                              layout.firstColumn && isFirstCol && "sticky left-0 z-[1002]"
                            )}
                            style={{
                              minWidth: `${getColumnWidth(column)}px`,
                              maxWidth: `${getColumnWidth(column)}px`,
                              height: `${settings.rowHeight}px`,
                              borderColor: theme.colors.borderColor,
                              ...cellStyle,
                            }}
                          >
                            {totalValue || '—'}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  )}
                </>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Info footer */}
      <div className="sticky bottom-0 px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-600">
        Showing {visibleRows.length} of {dataRowsToDisplay.length} rows • {visibleColumns.length} columns
      </div>

      {/* Context Menu - Only show when layout.headerRow is true */}
      {/* When headerRow is false: No header row, first data row is just a regular editable row (no right-click menu) */}
      {/* When headerRow is true: Header row shown with right-click context menu, first data row remains a regular editable row */}
      {portalTarget && contextMenu && layout.headerRow &&
        createPortal(
          <div
            ref={contextMenuRef}
            style={{
              position: 'fixed',
              top: contextMenu.y,
              left: contextMenu.x,
              zIndex: 1000,
              background: 'white',
              border: '1px solid #ddd',
              borderRadius: 6,
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              minWidth: 200
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-3 py-2 text-xs font-semibold border-b border-gray-200 flex items-center justify-between" style={{ color: '#222' }}>
              Column: {contextMenu.col}
              <button
                className="ml-2 w-4 h-4 rounded-full bg-blue-100 hover:bg-blue-200 flex items-center justify-center transition-colors"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu(null);
                  setOpenDropdown(null);
                }}
                title={`Column: ${contextMenu.col}`}
              >
                <Info className="w-2.5 h-2.5 text-blue-600" />
              </button>
            </div>

            {/* Sort Submenu */}
            <div className="relative group">
              <button
                className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenDropdown(openDropdown === 'sort' ? null : 'sort');
                }}
              >
                Sort <span style={{ fontSize: '10px', marginLeft: 4 }}>▶</span>
              </button>
              {openDropdown === 'sort' && (
                <div className="absolute left-full top-0 bg-white border border-gray-200 rounded shadow-md min-w-[160px] z-50">
                  <button
                    className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100 flex items-center gap-2"
                    onClick={() => {
                      handleSortAsc(contextMenu.col);
                      setContextMenu(null);
                      setOpenDropdown(null);
                    }}
                  >
                    <ArrowUp className="w-3 h-3" />
                    Sort Ascending
                  </button>
                  <button
                    className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100 flex items-center gap-2"
                    onClick={() => {
                      handleSortDesc(contextMenu.col);
                      setContextMenu(null);
                      setOpenDropdown(null);
                    }}
                  >
                    <ArrowDown className="w-3 h-3" />
                    Sort Descending
                  </button>
                  {settings.sortConfig.length > 0 && (
                    <>
                      <div className="border-t border-gray-200 my-1"></div>
                      <button
                        className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100"
                        onClick={() => {
                          handleClearSort();
                          setContextMenu(null);
                          setOpenDropdown(null);
                        }}
                      >
                        Clear Sort
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Filter Submenu */}
            <div className="relative group">
              <button
                className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100"
                onClick={(e) => {
                  e.stopPropagation();
                  if (contextMenu) {
                    handleOpenFilter(contextMenu.col);
                  }
                }}
                disabled={loadingFilterData}
              >
                Filter <span style={{ fontSize: '10px', marginLeft: 4 }}>▶</span>
                {loadingFilterData && <span className="ml-2 text-xs text-gray-500">Loading...</span>}
              </button>
              {openDropdown === 'filter' && contextMenu && (
                <div className="absolute left-full top-0 bg-white border border-gray-200 rounded shadow-md z-50">
                  {loadingFilterData ? (
                    <div className="p-4 text-xs text-gray-500">Loading filter options...</div>
                  ) : (
                    <>
                      {data.column_types[contextMenu.col] === 'number' ? (
                        <NumberFilterComponent
                          column={contextMenu.col}
                          data={filterData && filterColumn === contextMenu.col ? filterData : data}
                          onApplyFilter={handleColumnFilter}
                          onClearFilter={handleClearFilter}
                          onClose={() => {
                            setContextMenu(null);
                            setOpenDropdown(null);
                            setFilterData(null);
                            setFilterColumn(null);
                          }}
                          currentFilter={settings.filters[contextMenu.col]}
                        />
                      ) : (
                        <TextFilterComponent
                          column={contextMenu.col}
                          data={filterData && filterColumn === contextMenu.col ? filterData : data}
                          onApplyFilter={handleColumnFilter}
                          onClearFilter={handleClearFilter}
                          onClose={() => {
                            setContextMenu(null);
                            setOpenDropdown(null);
                            setFilterData(null);
                            setFilterColumn(null);
                          }}
                          currentFilter={settings.filters[contextMenu.col]}
                        />
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Convert to Submenu */}
            <div className="relative group">
              <button
                className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenDropdown(openDropdown === 'convert' ? null : 'convert');
                }}
              >
                Convert to <span style={{ fontSize: '10px', marginLeft: 4 }}>▶</span>
              </button>
              {openDropdown === 'convert' && (
                <div className="absolute left-full top-0 bg-white border border-gray-200 rounded shadow-md min-w-[140px] z-50">
                  <button
                    className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100"
                    onClick={() => {
                      handleRetypeColumn(contextMenu.col, 'text');
                      setContextMenu(null);
                      setOpenDropdown(null);
                    }}
                  >
                    String/Text
                  </button>
                  <button
                    className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100"
                    onClick={() => {
                      handleRetypeColumn(contextMenu.col, 'number');
                      setContextMenu(null);
                      setOpenDropdown(null);
                    }}
                  >
                    Integer
                  </button>
                  <button
                    className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100"
                    onClick={() => {
                      handleRetypeColumn(contextMenu.col, 'float');
                      setContextMenu(null);
                      setOpenDropdown(null);
                    }}
                  >
                    Float
                  </button>
                  <button
                    className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100"
                    onClick={() => {
                      handleRetypeColumn(contextMenu.col, 'date');
                      setContextMenu(null);
                      setOpenDropdown(null);
                    }}
                  >
                    Date/DateTime
                  </button>
                </div>
              )}
            </div>

            {/* Round Submenu */}
            <div className="relative group">
              <button
                className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpenDropdown(openDropdown === 'round' ? null : 'round');
                }}
              >
                Round <span style={{ fontSize: '10px', marginLeft: 4 }}>▶</span>
              </button>
              {openDropdown === 'round' && (
                <div className="absolute left-full top-0 bg-white border border-gray-200 rounded shadow-md min-w-[140px] z-50 p-2">
                  <div className="flex items-center space-x-2 mb-2">
                    <input
                      type="number"
                      min="0"
                      max="10"
                      defaultValue="2"
                      id="round-decimal-input"
                      className="w-12 text-xs text-center border border-gray-300 rounded px-1 py-0.5"
                      placeholder="2"
                    />
                    <label htmlFor="round-decimal-input" className="text-xs">decimals</label>
                  </div>
                  <button
                    className="w-full px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                    onClick={() => {
                      const input = document.getElementById('round-decimal-input') as HTMLInputElement;
                      const decimalPlaces = parseInt(input?.value || '2') || 2;
                      handleRoundColumn(contextMenu.col, decimalPlaces);
                      setContextMenu(null);
                      setOpenDropdown(null);
                    }}
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>

            {/* Column Operations */}
            <div className="border-t border-gray-200 my-1"></div>
            <button
              className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                // Start inline editing (double-click alternative)
                setEditingHeader(contextMenu.col);
                setEditingHeaderValue(contextMenu.col);
                setContextMenu(null);
                setOpenDropdown(null);
                // Focus the input after a brief delay to ensure it's rendered
                setTimeout(() => {
                  editingHeaderInputRef.current?.focus();
                  editingHeaderInputRef.current?.select();
                }, 0);
              }}
            >
              Rename (or double-click header)
            </button>
            <button
              className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const newName = prompt(`Enter name for duplicate of "${contextMenu.col}":`, `${contextMenu.col}_copy`);
                if (newName && newName.trim()) {
                  handleDuplicateColumn(contextMenu.col, newName.trim());
                }
                setContextMenu(null);
                setOpenDropdown(null);
              }}
            >
              Duplicate
            </button>
            <button
              className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleInsertColumn(contextMenu.colIdx);
                setContextMenu(null);
                setOpenDropdown(null);
              }}
            >
              Insert Column
            </button>
            <button
              className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDeleteColumn(contextMenu.col);
                setContextMenu(null);
                setOpenDropdown(null);
              }}
            >
              Delete{multiSelectedColumns.size > 1 ? ` (${multiSelectedColumns.size} selected)` : ''}
            </button>
            <button
              className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleHideColumn(contextMenu.col);
                setContextMenu(null);
                setOpenDropdown(null);
              }}
            >
              Hide
            </button>
            {hiddenColumns.length > 0 && (
              <div className="relative group">
                <button
                  className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenDropdown(openDropdown === 'unhide' ? null : 'unhide');
                  }}
                >
                  Unhide <span style={{ fontSize: '10px', marginLeft: 4 }}>▶</span>
                </button>
                {openDropdown === 'unhide' && (
                  <div className="absolute left-full top-0 bg-white border border-gray-200 rounded shadow-md min-w-[180px] max-h-[200px] overflow-y-auto z-50">
                    {hiddenColumns.map((col) => (
                      <button
                        key={col}
                        className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-100"
                        onClick={() => {
                          handleUnhideColumn(col);
                          setContextMenu(null);
                          setOpenDropdown(null);
                        }}
                      >
                        {col}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>,
          portalTarget
        )}

      {/* Rich Text Formatting Toolbar - Commented out */}
      {false && showToolbar && editingCell && toolbarCellRect && portalTarget &&
        createPortal(
          <TableRichTextToolbar
            formatting={cellFormatting}
            onFormattingChange={(fmt) => setCellFormatting(prev => ({ ...prev, ...fmt }))}
            cellPosition={toolbarCellRect}
            isVisible={true}
          />,
          portalTarget
        )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmModal.isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[2000]">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Delete Columns</h3>
                <button
                  onClick={() => setDeleteConfirmModal({ isOpen: false, columnsToDelete: [] })}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <p className="text-sm text-gray-600 mb-4">
                Are you sure you want to delete {deleteConfirmModal.columnsToDelete.length} column{deleteConfirmModal.columnsToDelete.length > 1 ? 's' : ''}?
              </p>
              
              <div className="max-h-48 overflow-y-auto mb-4 border border-gray-200 rounded p-2">
                <ul className="text-xs text-gray-700 space-y-1">
                  {deleteConfirmModal.columnsToDelete.map((col) => (
                    <li key={col} className="flex items-center">
                      <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                      {col}
                    </li>
                  ))}
                </ul>
              </div>
              
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setDeleteConfirmModal({ isOpen: false, columnsToDelete: [] })}
                  className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    executeDeleteColumns(deleteConfirmModal.columnsToDelete);
                  }}
                  className="px-4 py-2 text-sm text-white bg-red-600 rounded hover:bg-red-700"
                >
                  Delete {deleteConfirmModal.columnsToDelete.length} Column{deleteConfirmModal.columnsToDelete.length > 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TableCanvas;

