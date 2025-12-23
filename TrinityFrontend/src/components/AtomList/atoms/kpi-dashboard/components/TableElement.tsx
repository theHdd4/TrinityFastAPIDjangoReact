import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Table2, Loader2, AlertCircle } from 'lucide-react';
import TableCanvas from '@/components/AtomList/atoms/table/components/TableCanvas';
import TablePagination from '@/components/AtomList/atoms/table/components/TablePagination';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import type { TableSettings, TableData } from '@/components/AtomList/atoms/table/TableAtom';
import { evaluateConditionalFormats, saveTable, updateTable, previewTable, type TableMetadata } from '@/components/AtomList/atoms/table/services/tableApi';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

export interface KPITableSettings {
  mode?: 'load' | 'blank';
  sourceFile?: string;
  savedFile?: string;  // Last saved filename (for display purposes)
  tableId?: string;
  tableData?: TableData;
  visibleColumns?: string[];
  columnOrder?: string[];
  columnWidths?: Record<string, number>;
  rowHeight?: number;
  rowHeights?: Record<number, number>;
  showRowNumbers?: boolean;
  showSummaryRow?: boolean;
  frozenColumns?: number;
  filters?: Record<string, any>;
  sortConfig?: Array<{column: string; direction: 'asc' | 'desc'}>;
  currentPage?: number;
  pageSize?: number;
  layout?: {
    headerRow?: boolean;
    totalRow?: boolean;
    bandedRows?: boolean;
    bandedColumns?: boolean;
    firstColumn?: boolean;
    lastColumn?: boolean;
  };
  design?: {
    theme?: string;
    borderStyle?: 'all' | 'none' | 'outside' | 'horizontal' | 'vertical' | 'header' | {
      top: boolean;
      bottom: boolean;
      left: boolean;
      right: boolean;
      insideHorizontal: boolean;
      insideVertical: boolean;
      header: boolean;
    };
    customColors?: {
      header?: string;
      oddRow?: string;
      evenRow?: string;
      border?: string;
    };
    columnAlignment?: {
      [columnName: string]: {
        horizontal: 'left' | 'center' | 'right';
        vertical: 'top' | 'middle' | 'bottom';
      };
    };
    columnFontStyles?: {
      [columnName: string]: {
        fontSize?: number;
        bold?: boolean;
        italic?: boolean;
        color?: string;
      };
    };
  };
  totalRowConfig?: Record<string, 'sum' | 'average' | 'count' | 'min' | 'max' | 'none'>;
  totalRowAggregations?: Record<string, any>;
  blankTableConfig?: {
    rows?: number;
    columns?: number;
    columnNames?: string[];
    useHeaderRow?: boolean;
    created?: boolean;
  };
  conditionalFormats?: Array<any>;
  cellFormatting?: Record<string, Record<string, any>>;
  showCardinalityView?: boolean;
  cardinalitySortColumn?: string;
  cardinalitySortDirection?: 'asc' | 'desc';
  cardinalityColumnFilters?: Record<string, string[]>;
}

interface TableElementProps {
  tableSettings?: KPITableSettings;
  width?: number;
  height?: number;
  onSettingsChange?: (newSettings: Partial<KPITableSettings>) => void;
  atomId?: string; // Optional atomId for BlankTableCanvas (uses KPI dashboard atomId + boxId if available)
  boxId?: string; // Optional boxId for unique table element identification
}

const TableElement: React.FC<TableElementProps> = ({ 
  tableSettings, 
  width, 
  height = 300,
  onSettingsChange,
  atomId,
  boxId
}) => {
  const { toast } = useToast();
  // State for conditional formatting cell styles
  const [cellStyles, setCellStyles] = useState<Record<string, Record<string, Record<string, string>>>>({});
  // Save state
  const [saving, setSaving] = useState(false);
  const [showSaveAsDialog, setShowSaveAsDialog] = useState(false);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const [saveFileName, setSaveFileName] = useState('');

  // Convert tableSettings to TableSettings format expected by TableCanvas
  const settings: TableSettings = useMemo(() => {
    if (!tableSettings) {
      return {
        visibleColumns: [],
        columnOrder: [],
        columnWidths: {},
        rowHeight: 24,
        showRowNumbers: false,
        showSummaryRow: false,
        frozenColumns: 0,
        filters: {},
        sortConfig: [],
        currentPage: 1,
        pageSize: 50,
        layout: {
          headerRow: true,
          totalRow: false,
          bandedRows: false,
          bandedColumns: false,
          firstColumn: false,
          lastColumn: false,
        },
        design: {
          theme: 'plain',
          borderStyle: 'all',
        },
        totalRowConfig: {},
        conditionalFormats: [],
      };
    }

    return {
      mode: tableSettings.mode || 'blank',
      sourceFile: tableSettings.sourceFile,
      // CRITICAL: Ensure tableId is always set - use tableData.table_id as fallback
      tableId: tableSettings.tableId || tableSettings.tableData?.table_id,
      tableData: tableSettings.tableData,
      visibleColumns: tableSettings.visibleColumns || [],
      columnOrder: tableSettings.columnOrder || [],
      columnWidths: tableSettings.columnWidths || {},
      rowHeight: tableSettings.rowHeight || 24,
      rowHeights: tableSettings.rowHeights || {},
      showRowNumbers: tableSettings.showRowNumbers ?? true,
      showSummaryRow: tableSettings.showSummaryRow ?? false,
      frozenColumns: tableSettings.frozenColumns || 0,
      filters: tableSettings.filters || {},
      sortConfig: tableSettings.sortConfig || [],
      currentPage: tableSettings.currentPage || 1,
      pageSize: tableSettings.pageSize || 50,
      layout: tableSettings.layout || {
        headerRow: true,
        totalRow: false,
        bandedRows: false,
        bandedColumns: false,
        firstColumn: false,
        lastColumn: false,
      },
      design: tableSettings.design || {
        theme: 'plain',
        borderStyle: 'all',
      },
      totalRowConfig: tableSettings.totalRowConfig || {},
      totalRowAggregations: tableSettings.totalRowAggregations,
      blankTableConfig: tableSettings.blankTableConfig,
      conditionalFormats: tableSettings.conditionalFormats || [],
      cellFormatting: tableSettings.cellFormatting,
      showCardinalityView: tableSettings.showCardinalityView,
      cardinalitySortColumn: tableSettings.cardinalitySortColumn,
      cardinalitySortDirection: tableSettings.cardinalitySortDirection,
      cardinalityColumnFilters: tableSettings.cardinalityColumnFilters,
    };
  }, [tableSettings]);

  // Fetch conditional formatting styles when rules change or table loads
  useEffect(() => {
    const fetchFormattingStyles = async () => {
      // Check if we have saved styles from loaded table (highest priority)
      if (tableSettings?.tableData?.conditional_format_styles) {
        setCellStyles(tableSettings.tableData.conditional_format_styles);
        return;
      }

      // If no saved styles, evaluate rules if they exist
      if (!settings.conditionalFormats || settings.conditionalFormats.length === 0) {
        setCellStyles({});
        return;
      }

      if (!settings.tableId) {
        return;
      }

      try {
        const response = await evaluateConditionalFormats(settings.tableId, settings.conditionalFormats);
        setCellStyles(response.styles || {});
      } catch (err: any) {
        // Don't clear existing styles on error (graceful degradation)
        console.error('Failed to evaluate conditional formats:', err);
      }
    };

    fetchFormattingStyles();
  }, [settings.conditionalFormats, settings.tableId, tableSettings?.tableData?.conditional_format_styles]);

  // Track previous filters to detect changes
  const previousFiltersRef = useRef<string>('');
  const isReloadingRef = useRef(false);
  const isInitializedRef = useRef(false);
  const previousTableIdRef = useRef<string | number | undefined>(undefined);
  
  // Initialize previousFiltersRef when table becomes ready (after refresh/reload)
  useEffect(() => {
    // Reset initialization if tableId changed (new table loaded)
    if (previousTableIdRef.current !== undefined && previousTableIdRef.current !== settings.tableId) {
      isInitializedRef.current = false;
      previousFiltersRef.current = '';
    }
    previousTableIdRef.current = settings.tableId;
    
    // Only initialize if table is ready and we haven't initialized yet
    if (settings.tableId && tableSettings?.mode === 'load' && tableSettings?.tableData && !isInitializedRef.current) {
      const currentFiltersStr = JSON.stringify(settings.filters || {});
      previousFiltersRef.current = currentFiltersStr;
      isInitializedRef.current = true;
    }
  }, [settings.tableId, tableSettings?.mode, tableSettings?.tableData]);
  
  // Reload table when filters change (e.g., from global filters)
  useEffect(() => {
    const reloadTableWithFilters = async () => {
      // Only reload if we have a tableId and it's a loaded table (not blank)
      // CRITICAL: Also check that tableData exists to ensure table is fully loaded
      if (!settings.tableId || !tableSettings?.mode || tableSettings.mode !== 'load' || !tableSettings?.tableData) {
        // Reset initialization flag if table becomes unavailable
        if (!settings.tableId || !tableSettings?.tableData) {
          isInitializedRef.current = false;
        }
        return;
      }

      // Validate tableId is a valid string/number (not empty or invalid)
      if (typeof settings.tableId !== 'string' && typeof settings.tableId !== 'number') {
        console.warn('Invalid tableId format, skipping table reload:', settings.tableId);
        return;
      }

      // Serialize current filters for comparison
      const currentFiltersStr = JSON.stringify(settings.filters || {});
      
      // Initialize previousFiltersRef if not yet initialized (handles case where table becomes ready)
      if (!isInitializedRef.current) {
        previousFiltersRef.current = currentFiltersStr;
        isInitializedRef.current = true;
        return; // Don't reload on initial setup, just sync the ref
      }
      
      // Skip if filters haven't actually changed
      if (currentFiltersStr === previousFiltersRef.current) {
        return;
      }
      
      // Skip if already reloading
      if (isReloadingRef.current) {
        return;
      }
      
      // Update ref to current filters
      previousFiltersRef.current = currentFiltersStr;
      isReloadingRef.current = true;

      try {
        // Call updateTable to apply filters and get filtered data (page 1)
        // This works even if filters are empty (clears filters)
        const pageSize = tableSettings.pageSize || 50;
        const response = await updateTable(
          settings.tableId,
          {
            ...settings,
            filters: settings.filters || {},
            sort_config: settings.sortConfig,
            current_page: 1, // Always fetch page 1 when filters change
            page_size: pageSize,
          }
        );

        // Update tableData with filtered results and reset pagination to page 1
        if (onSettingsChange && response) {
          onSettingsChange({
            tableData: {
              table_id: response.table_id,
              columns: response.columns,
              rows: response.rows || [],
              row_count: response.row_count || 0,
              column_types: response.column_types,
              object_name: response.object_name || tableSettings.tableData?.object_name,
            },
            currentPage: 1 // Reset to page 1 when filters change
          });
        }
      } catch (error: any) {
        console.error('Failed to reload table with filters:', error);
        // Don't reset isReloadingRef on error to prevent rapid retries
        // The error will be logged and user can manually refresh if needed
      } finally {
        isReloadingRef.current = false;
      }
    };

    // Use a small delay to debounce rapid filter changes
    const timeoutId = setTimeout(() => {
      reloadTableWithFilters();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [JSON.stringify(settings.filters), settings.tableId, tableSettings?.mode]);

  // Handle settings change from TableCanvas
  const handleSettingsChange = (newSettings: Partial<TableSettings>) => {
    if (!onSettingsChange) return;

    // Convert TableSettings back to tableSettings format
    const updatedSettings: Partial<KPITableSettings> = {};
    
    if (newSettings.visibleColumns !== undefined) {
      updatedSettings.visibleColumns = newSettings.visibleColumns;
    }
    if (newSettings.columnOrder !== undefined) {
      updatedSettings.columnOrder = newSettings.columnOrder;
    }
    if (newSettings.columnWidths !== undefined) {
      updatedSettings.columnWidths = newSettings.columnWidths;
    }
    if (newSettings.rowHeight !== undefined) {
      updatedSettings.rowHeight = newSettings.rowHeight;
    }
    if (newSettings.rowHeights !== undefined) {
      updatedSettings.rowHeights = newSettings.rowHeights;
    }
    if (newSettings.showRowNumbers !== undefined) {
      updatedSettings.showRowNumbers = newSettings.showRowNumbers;
    }
    if (newSettings.showSummaryRow !== undefined) {
      updatedSettings.showSummaryRow = newSettings.showSummaryRow;
    }
    if (newSettings.frozenColumns !== undefined) {
      updatedSettings.frozenColumns = newSettings.frozenColumns;
    }
    if (newSettings.filters !== undefined) {
      updatedSettings.filters = newSettings.filters;
    }
    if (newSettings.sortConfig !== undefined) {
      updatedSettings.sortConfig = newSettings.sortConfig;
    }
    if (newSettings.currentPage !== undefined) {
      updatedSettings.currentPage = newSettings.currentPage;
    }
    if (newSettings.pageSize !== undefined) {
      updatedSettings.pageSize = newSettings.pageSize;
    }
    if (newSettings.layout !== undefined) {
      updatedSettings.layout = newSettings.layout;
    }
    if (newSettings.design !== undefined) {
      updatedSettings.design = newSettings.design;
    }
    if (newSettings.totalRowConfig !== undefined) {
      updatedSettings.totalRowConfig = newSettings.totalRowConfig;
    }
    if (newSettings.totalRowAggregations !== undefined) {
      updatedSettings.totalRowAggregations = newSettings.totalRowAggregations;
    }
    if (newSettings.conditionalFormats !== undefined) {
      updatedSettings.conditionalFormats = newSettings.conditionalFormats;
    }
    if (newSettings.cellFormatting !== undefined) {
      updatedSettings.cellFormatting = newSettings.cellFormatting;
    }
    if (newSettings.showCardinalityView !== undefined) {
      updatedSettings.showCardinalityView = newSettings.showCardinalityView;
    }
    if (newSettings.cardinalitySortColumn !== undefined) {
      updatedSettings.cardinalitySortColumn = newSettings.cardinalitySortColumn;
    }
    if (newSettings.cardinalitySortDirection !== undefined) {
      updatedSettings.cardinalitySortDirection = newSettings.cardinalitySortDirection;
    }
    if (newSettings.cardinalityColumnFilters !== undefined) {
      updatedSettings.cardinalityColumnFilters = newSettings.cardinalityColumnFilters;
    }
    // CRITICAL: Handle tableData updates from cell edits
    if (newSettings.tableData !== undefined) {
      updatedSettings.tableData = newSettings.tableData;
      // Also update tableId if it changed in the response
      if (newSettings.tableData.table_id) {
        updatedSettings.tableId = newSettings.tableData.table_id;
      }
    }
    // CRITICAL: Handle tableId updates (e.g., from session recovery)
    if (newSettings.tableId !== undefined) {
      updatedSettings.tableId = newSettings.tableId;
    }

    onSettingsChange(updatedSettings);
  };

  // Handle page change - fetch new page data from backend
  const handlePageChange = async (page: number) => {
    if (!onSettingsChange || !tableSettings?.tableId || !tableSettings?.mode || tableSettings.mode !== 'load') {
      return;
    }

    try {
      // Use updateTable to ensure filters are applied when fetching page data
      // This ensures pagination works correctly with filtered data
      const pageSize = tableSettings.pageSize || 50;
      const tableId = tableSettings.tableId;
      
      // Get pipeline tracking parameters
      const cards = useLaboratoryStore.getState().cards;
      const card = cards.find(c => Array.isArray(c.atoms) && c.atoms.some(a => a.id === (tableSettings as any).atomId));
      const atomId = (tableSettings as any).atomId || '';
      const cardId = card?.id || '';
      const canvasPosition = card?.canvas_position ?? 0;
      
      // Use updateTable with current filters and page to ensure filtered pagination works
      const response = await updateTable(
        tableId,
        {
          ...settings,
          filters: settings.filters || {},
          sort_config: settings.sortConfig,
          current_page: page,
          page_size: pageSize,
        },
        atomId,
        cardId,
        canvasPosition
      );
      
      // Update settings with new page and data
      if (onSettingsChange && response) {
        onSettingsChange({ 
          currentPage: page,
          tableData: {
            table_id: response.table_id,
            columns: response.columns,
            rows: response.rows || [],
            row_count: response.row_count || 0,
            column_types: response.column_types,
            object_name: response.object_name || tableSettings.tableData?.object_name,
          }
        });
      }
    } catch (error: any) {
      console.error('Failed to fetch page data:', error);
      // Fallback to previewTable if updateTable fails
      try {
        const pageSize = tableSettings.pageSize || 50;
        const newData = await previewTable(tableSettings.tableId, page, pageSize);
        if (onSettingsChange && newData) {
          onSettingsChange({ 
            currentPage: page,
            tableData: {
              ...tableSettings.tableData!,
              rows: newData.rows || [],
              row_count: newData.row_count || tableSettings.tableData?.row_count || 0,
              table_id: newData.table_id || tableSettings.tableData?.table_id,
              columns: newData.columns || tableSettings.tableData?.columns,
              column_types: newData.column_types || tableSettings.tableData?.column_types,
              object_name: newData.object_name || tableSettings.tableData?.object_name,
            }
          });
        }
      } catch (previewError: any) {
        console.error('Failed to fetch page data with previewTable:', previewError);
        // Still update currentPage even if fetch fails (for UI consistency)
        if (onSettingsChange) {
          onSettingsChange({ currentPage: page });
        }
      }
    }
  };

  // Save (overwrite original file)
  const handleSave = () => {
    if (!tableSettings?.tableId) {
      toast({
        title: 'Error',
        description: 'No table data to save',
        variant: 'destructive'
      });
      return;
    }
    
    if (!tableSettings.sourceFile) {
      toast({
        title: 'Error',
        description: 'No original file to overwrite. Use "Save As" instead.',
        variant: 'destructive'
      });
      return;
    }
    
    setShowOverwriteDialog(true);
  };

  // Confirm overwrite save
  const confirmOverwriteSave = async () => {
    if (!tableSettings?.tableId || !tableSettings.sourceFile) return;
    
    setShowOverwriteDialog(false);
    setSaving(true);
    
    try {
      // Check if header row should be used (blank table with header row ON)
      const useHeaderRow = tableSettings.mode === 'blank' && tableSettings.layout?.headerRow === true;
      
      // Collect metadata for saving
      const metadata: TableMetadata = {
        cellFormatting: tableSettings.cellFormatting,
        design: tableSettings.design ? {
          ...tableSettings.design,
          borderStyle: typeof tableSettings.design.borderStyle === 'string' 
            ? tableSettings.design.borderStyle 
            : JSON.stringify(tableSettings.design.borderStyle),
        } : undefined,
        layout: tableSettings.layout,
        columnWidths: tableSettings.columnWidths,
        rowHeights: tableSettings.rowHeights,
      };
      
      const response = await saveTable(
        tableSettings.tableId, 
        tableSettings.sourceFile, 
        true, 
        useHeaderRow,
        tableSettings.conditionalFormats || [],
        metadata
      );
      
      // Refresh tableData from the existing session to ensure frontend state matches saved state
      // This uses updateTable which refreshes from the existing session (doesn't create a new one)
      if (tableSettings.tableId && tableSettings.tableData && onSettingsChange) {
        try {
          const refreshedData = await updateTable(tableSettings.tableId, {
            visible_columns: tableSettings.visibleColumns,
            column_order: tableSettings.columnOrder,
            column_widths: tableSettings.columnWidths,
            row_height: tableSettings.rowHeight,
            show_row_numbers: tableSettings.showRowNumbers,
            show_summary_row: tableSettings.showSummaryRow,
            frozen_columns: tableSettings.frozenColumns,
            filters: tableSettings.filters || {},
            sort_config: tableSettings.sortConfig || [],
          });
          
          // Update tableData with refreshed data from session
          onSettingsChange({ 
            savedFile: tableSettings.sourceFile,
            tableData: {
              ...tableSettings.tableData,
              ...refreshedData,
              rows: refreshedData.rows,
            }
          });
        } catch (refreshError) {
          console.warn('Failed to refresh table data after save:', refreshError);
          // Still update savedFile even if refresh fails
          onSettingsChange({ savedFile: tableSettings.sourceFile });
        }
      } else {
        // Update savedFile to sourceFile so filename display updates
        if (onSettingsChange) {
          onSettingsChange({ savedFile: tableSettings.sourceFile });
        }
      }
      
      toast({
        title: 'Success',
        description: 'Table saved successfully',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save table',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  // Save As (create new file)
  const handleSaveAs = () => {
    if (!tableSettings?.tableId) {
      toast({
        title: 'Error',
        description: 'No table data to save',
        variant: 'destructive'
      });
      return;
    }
    
    // Generate default filename
    const defaultName = tableSettings.sourceFile 
      ? `${tableSettings.sourceFile.split('/').pop()?.replace('.arrow', '')}_copy`
      : `table_${Date.now()}`;
    setSaveFileName(defaultName);
    setShowSaveAsDialog(true);
  };

  // Confirm Save As
  const confirmSaveAs = async () => {
    if (!tableSettings?.tableId) return;
    
    setSaving(true);
    try {
      // Check if header row should be used (blank table with header row ON)
      const useHeaderRow = tableSettings.mode === 'blank' && tableSettings.layout?.headerRow === true;
      const filename = saveFileName.trim() || `table_${Date.now()}`;
      
      // Collect metadata for saving
      const metadata: TableMetadata = {
        cellFormatting: tableSettings.cellFormatting,
        design: tableSettings.design ? {
          ...tableSettings.design,
          borderStyle: typeof tableSettings.design.borderStyle === 'string' 
            ? tableSettings.design.borderStyle 
            : JSON.stringify(tableSettings.design.borderStyle),
        } : undefined,
        layout: tableSettings.layout,
        columnWidths: tableSettings.columnWidths,
        rowHeights: tableSettings.rowHeights,
      };
      
      const response = await saveTable(
        tableSettings.tableId, 
        filename, 
        false, 
        useHeaderRow,
        tableSettings.conditionalFormats || [],
        metadata
      );
      
      toast({
        title: 'Success',
        description: `Table saved as ${response.object_name}`,
      });
      
      // Refresh tableData from the existing session to ensure frontend state matches saved state
      // This uses updateTable which refreshes from the existing session (doesn't create a new one)
      if (tableSettings.tableId && tableSettings.tableData && onSettingsChange) {
        try {
          const refreshedData = await updateTable(tableSettings.tableId, {
            visible_columns: tableSettings.visibleColumns,
            column_order: tableSettings.columnOrder,
            column_widths: tableSettings.columnWidths,
            row_height: tableSettings.rowHeight,
            show_row_numbers: tableSettings.showRowNumbers,
            show_summary_row: tableSettings.showSummaryRow,
            frozen_columns: tableSettings.frozenColumns,
            filters: tableSettings.filters || {},
            sort_config: tableSettings.sortConfig || [],
          });
          
          // Update settings with new file reference and refreshed data
          onSettingsChange({
            sourceFile: response.object_name,
            savedFile: response.object_name,
            tableData: {
              ...tableSettings.tableData,
              ...refreshedData,
              rows: refreshedData.rows,
            }
          });
        } catch (refreshError) {
          console.warn('Failed to refresh table data after save:', refreshError);
          // Still update file references even if refresh fails
          onSettingsChange({
            sourceFile: response.object_name,
            savedFile: response.object_name
          });
        }
      } else {
        // Update settings with new file reference
        if (onSettingsChange) {
          onSettingsChange({
            sourceFile: response.object_name,
            savedFile: response.object_name
          });
        }
      }
      
      setShowSaveAsDialog(false);
      setSaveFileName('');
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save table',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  // If no table settings or table data, show placeholder
  if (!tableSettings || !tableSettings.tableData || !tableSettings.tableId) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 space-y-3">
        <Table2 className="w-8 h-8 text-teal-500" />
        <p className="text-sm font-medium text-foreground">Table</p>
        <p className="text-xs text-muted-foreground text-center px-4">
          {!tableSettings 
            ? 'Configure a table in the Tables tab to display data'
            : 'Create a blank table or load from dataframe to get started'}
        </p>
      </div>
    );
  }

  // Check if table data is valid
  if (!tableSettings.tableData || !tableSettings.tableData.columns || tableSettings.tableData.columns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 space-y-3">
        <Table2 className="w-8 h-8 text-teal-500" />
        <p className="text-sm font-medium text-foreground">No Table Data</p>
        <p className="text-xs text-muted-foreground text-center px-4">
          Table data is not available. Please create or load a table.
        </p>
      </div>
    );
  }

  // CRITICAL: Match TableAtom pattern exactly
  // In TableAtom, atomId is a required prop and passed directly: settings={{...settings, atomId}}
  // We need to ensure atomId is always a string for the spread to work correctly
  // Generate unique identifier: use atomId + boxId combination for unique identification in KPI dashboard
  // CRITICAL: Compute atomId value that will be used in settings spread (must always be a string)
  const atomIdValue: string = (() => {
    const safeAtomId = atomId || '';
    const safeBoxId = boxId || '';
    
    if (safeAtomId && safeBoxId) {
      return `${safeAtomId}-${safeBoxId}`;
    }
    if (safeAtomId) {
      return safeAtomId;
    }
    if (safeBoxId) {
      return `kpi-table-${safeBoxId}`;
    }
    return 'kpi-table-default';
  })();

  // Render the table in a constrained container with pagination
  // CRITICAL: The 'group/table' class on this container ensures hover is strictly scoped to this table element only
  // Hovering elsewhere on the canvas will NOT trigger pagination visibility
  return (
    <div className="group/table relative w-full h-full flex flex-col overflow-hidden bg-white rounded-xl border border-slate-200 shadow-lg" style={{ maxHeight: height, maxWidth: width }}>
      {/* Table Canvas with horizontal and vertical scrolling */}
      {/* CRITICAL: Use overflow-hidden like TableAtom to ensure proper toolbar/portal rendering */}
      {/* CRITICAL: Pass atomId in spread like TableAtom does */}
      <div className="flex-1 overflow-hidden min-h-0">
        <TableCanvas
          data={tableSettings.tableData}
          settings={{
            ...settings,
            atomId: atomIdValue
          }}
          cellStyles={cellStyles}
          onSettingsChange={handleSettingsChange}
        />
      </div>
      
      {/* Pagination - only for load mode, hidden by default, shown on hover */}
      {/* CRITICAL: group-hover/table only triggers when hovering within the table container (group/table parent) */}
      {tableSettings.mode === 'load' && tableSettings.tableData?.row_count && (
        <div className="max-h-0 overflow-hidden opacity-0 group-hover/table:max-h-[200px] group-hover/table:opacity-100 transition-all duration-300 ease-in-out pointer-events-none group-hover/table:pointer-events-auto">
          <TablePagination
            currentPage={tableSettings.currentPage || 1}
            pageSize={tableSettings.pageSize || 50}
            totalRows={tableSettings.tableData.row_count}
            onPageChange={handlePageChange}
          />
        </div>
      )}

      {/* Save As Dialog */}
      <Dialog open={showSaveAsDialog} onOpenChange={setShowSaveAsDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Save Table As</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="filename" className="text-sm mb-2 block">
              Filename (without .arrow extension)
            </Label>
            <Input
              id="filename"
              value={saveFileName}
              onChange={(e) => setSaveFileName(e.target.value)}
              placeholder="table_name"
              className="w-full"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !saving) {
                  confirmSaveAs();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSaveAsDialog(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmSaveAs}
              disabled={saving || !saveFileName.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Overwrite Confirmation Dialog */}
      <Dialog open={showOverwriteDialog} onOpenChange={setShowOverwriteDialog}>
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
                  File: {tableSettings.sourceFile?.split('/').pop()}
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
              onClick={() => setShowOverwriteDialog(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmOverwriteSave}
              disabled={saving}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {saving ? 'Saving...' : 'Yes, Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TableElement;
