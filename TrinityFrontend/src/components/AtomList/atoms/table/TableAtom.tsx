import React, { useState, useEffect } from 'react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import TableCanvas from './components/TableCanvas';
import TableToolbar from './components/TableToolbar';
import TablePagination from './components/TablePagination';
import { loadTable, updateTable, saveTable, evaluateConditionalFormats, getTableInfo, createBlankTable, editTableCell, restoreSession } from './services/tableApi';
import { Loader2, Save, AlertCircle, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

interface TableAtomProps {
  atomId: string;
}

export interface TableData {
  table_id: string;
  columns: string[];
  rows: Array<Record<string, any>>;
  row_count: number;
  column_types: Record<string, string>;
  object_name?: string;
}

// Conditional Formatting Types
export interface ConditionalFormatRule {
  id: string;
  enabled: boolean;
  column: string;
  priority: number;
  rule: {
    type: 'greater_than' | 'less_than' | 'between' | 'equals' | 
          'contains' | 'starts_with' | 'ends_with' |
          'top_n' | 'bottom_n' | 'above_average' | 'below_average' |
          'color_scale_2' | 'color_scale_3' | 'data_bars' | 'icon_set';
    value1?: any;
    value2?: any;
    minColor?: string;
    midColor?: string;
    maxColor?: string;
    barColor?: string;
    showValue?: boolean;
    iconSet?: 'arrows' | 'traffic_lights' | 'stars' | 'checkmarks';
    thresholds?: {
      high: number;
      medium: number;
    };
  };
  format: {
    backgroundColor?: string;
    textColor?: string;
    fontWeight?: 'bold' | 'normal';
    fontSize?: number;
    icon?: string;
  };
}

export interface TableSettings {
  mode?: 'load' | 'blank';
  sourceFile?: string;
  tableId?: string;
  tableData?: TableData;  // ✅ Store data in settings like dataframe-operations
  visibleColumns: string[];
  columnOrder: string[];
  columnWidths: Record<string, number>;
  rowHeight: number;  // Global default (keep for backward compatibility)
  rowHeights?: Record<number, number>;  // NEW: Per-row heights (like Excel)
  showRowNumbers: boolean;
  showSummaryRow: boolean;
  frozenColumns: number;
  filters: Record<string, any>;
  sortConfig: Array<{column: string; direction: 'asc' | 'desc'}>;
  currentPage: number;
  pageSize: number;
  enableRichText?: boolean;  // NEW: Toggle rich text feature (default: false)
  blankTableConfig?: {
    rows: number;
    columns: number;
    columnNames?: string[];
    created: boolean;
  };
  // Phase 1: Layout Options
  layout?: {
    headerRow: boolean;
    totalRow: boolean;
    bandedRows: boolean;
    bandedColumns: boolean;
    firstColumn: boolean;
    lastColumn: boolean;
  };
  // Total row configuration
  totalRowConfig?: {
    [columnName: string]: 'sum' | 'average' | 'count' | 'min' | 'max' | 'none';
  };
  // Phase 2: Design
  design?: {
    theme: string;
    borderStyle: 'all' | 'none' | 'outside' | 'horizontal' | 'vertical' | 'header';
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
  // Phase 3: Conditional Formatting
  conditionalFormats?: ConditionalFormatRule[];
  // Cell Formatting (Rich Text Support)
  cellFormatting?: {
    [rowIndex: string]: {
      [column: string]: {
        html?: string;  // Rich text HTML content
        fontFamily?: string;
        fontSize?: number;
        bold?: boolean;
        italic?: boolean;
        underline?: boolean;
        strikethrough?: boolean;
        textColor?: string;
        backgroundColor?: string;
        textAlign?: 'left' | 'center' | 'right';
      };
    };
  };
}

const DEFAULT_SETTINGS: TableSettings = {
  visibleColumns: [],
  columnOrder: [],
  columnWidths: {},
  rowHeight: 24,  // Reduced by 25%: 32px → 24px
  rowHeights: {},  // NEW: Empty by default, populated as rows are resized
  showRowNumbers: true,
  showSummaryRow: false,
  frozenColumns: 0,
  filters: {},
  sortConfig: [],
  currentPage: 1,
  pageSize: 15,  // ✅ 15 rows per page
  enableRichText: false,  // NEW: Rich text disabled by default (use simple cells)
  // Phase 1: Layout defaults
  layout: {
    headerRow: true,
    totalRow: false,
    bandedRows: false,
    bandedColumns: false,
    firstColumn: false,
    lastColumn: false,
  },
  totalRowConfig: {},
  // Phase 2: Design defaults
  design: {
    theme: 'plain',
    borderStyle: 'all',
  },
  // Phase 3: Conditional Formatting defaults
  conditionalFormats: [],
};

const TableAtom: React.FC<TableAtomProps> = ({ atomId }) => {
  // ✅ Subscribe to cards to get the atom (like dataframe-operations does)
  const cards = useLaboratoryStore(state => state.cards);
  const atom = cards.flatMap(card => card.atoms).find(a => a.id === atomId);
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  
  // 🔍 CRITICAL DEBUG - Component is being called
  console.log('🚀🚀🚀 [TABLE-ATOM] COMPONENT MOUNTED/RENDERED - atomId:', atomId);
  console.log('🚀🚀🚀 [TABLE-ATOM] Atom found in store:', !!atom);
  console.log('🚀🚀🚀 [TABLE-ATOM] Atom details:', atom ? { id: atom.id, atomId: atom.atomId, title: atom.title } : 'NOT FOUND');
  
  const baseSettings = (atom?.settings as Partial<TableSettings> | undefined) || {};
  const settings: TableSettings = {
    ...DEFAULT_SETTINGS,
    ...baseSettings,
    // Deep merge nested objects
    layout: {
      ...DEFAULT_SETTINGS.layout,
      ...(baseSettings.layout || {}),
    },
    design: {
      ...DEFAULT_SETTINGS.design,
      ...(baseSettings.design || {}),
    },
    totalRowConfig: {
      ...DEFAULT_SETTINGS.totalRowConfig,
      ...(baseSettings.totalRowConfig || {}),
    },
    conditionalFormats: baseSettings.conditionalFormats || DEFAULT_SETTINGS.conditionalFormats,
  };
  
  // ✅ Read data from settings, not local state (like dataframe-operations)
  const tableData = settings.tableData || null;
  
  // 🔍 DEBUG LOGGING
  console.log('🎯 [TABLE-ATOM] Render - atomId:', atomId);
  console.log('📋 [TABLE-ATOM] Atom found:', !!atom);
  console.log('📋 [TABLE-ATOM] Settings:', {
    mode: settings.mode,
    sourceFile: settings.sourceFile,
    tableId: settings.tableId,
    hasTableData: !!settings.tableData,
    tableDataKeys: settings.tableData ? Object.keys(settings.tableData) : [],
    visibleColumnsCount: settings.visibleColumns?.length,
    blankTableConfigCreated: settings.blankTableConfig?.created
  });
  console.log('📊 [TABLE-ATOM] tableData state:', {
    hasTableData: !!tableData,
    table_id: tableData?.table_id,
    columns: tableData?.columns,
    rows_length: tableData?.rows?.length,
    row_count: tableData?.row_count,
    column_types: tableData?.column_types ? Object.keys(tableData.column_types) : []
  });
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSaveAsDialog, setShowSaveAsDialog] = useState(false);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const [saveFileName, setSaveFileName] = useState('');
  const [cellStyles, setCellStyles] = useState<Record<string, Record<string, Record<string, string>>>>({});
  const { toast } = useToast();

  // Auto-load data ONLY if sourceFile exists but tableData doesn't (like dataframe-operations)
  useEffect(() => {
    const autoLoadData = async () => {
      // Check if we need to load: mode is 'load', sourceFile exists, and tableData is missing/undefined
      const hasSourceFile = !!settings.sourceFile;
      const hasTableData = settings.tableData !== undefined && settings.tableData !== null;
      const shouldLoad = settings.mode === 'load' && hasSourceFile && !hasTableData && !loading;
      
      console.log('📊 [TABLE-ATOM] Auto-load check:', {
        atomId,
        mode: settings.mode,
        sourceFile: settings.sourceFile,
        hasTableData,
        loading,
        shouldLoad
      });
      
      if (shouldLoad) {
        console.log('📊 [TABLE-ATOM] Auto-loading data from source:', settings.sourceFile);
        setLoading(true);
        setError(null);
        try {
          const data = await loadTable(settings.sourceFile);
          console.log('✅ [TABLE-ATOM] Data loaded successfully:', {
            tableId: data.table_id,
            columns: data.columns?.length,
            rows: data.rows?.length
          });
          
          // ✅ Store data in Zustand settings (like DataFrame Operations)
          updateSettings(atomId, {
            tableData: data,
            tableId: data.table_id,
            sourceFile: settings.sourceFile || data.object_name,  // Store source file for recovery
            visibleColumns: data.columns,
            columnOrder: data.columns,
          });
        } catch (err: any) {
          console.error('❌ [TABLE-ATOM] Auto-load error:', err);
          setError(err.message || 'Failed to load table');
        } finally {
          setLoading(false);
        }
      }
    };
    
    autoLoadData();
  }, [settings.mode, settings.sourceFile, settings.tableData, loading, atomId, updateSettings]);

  // Restore session from MongoDB/MinIO on mount (for loaded tables)
  useEffect(() => {
    const restoreLoadedTableSession = async () => {
      if (
        settings.mode === 'load' && 
        settings.tableId && 
        settings.tableData &&
        !loading
      ) {
        console.log('🔄 [TABLE-ATOM] Checking loaded table session:', settings.tableId);
        
        try {
          // Check if session exists in backend
          await getTableInfo(settings.tableId);
          console.log('✅ [TABLE-ATOM] Session exists, no restoration needed');
        } catch (error: any) {
          // Session doesn't exist, try to restore from MongoDB/MinIO
          console.log('⚠️ [TABLE-ATOM] Session missing, attempting restoration from MongoDB/MinIO...');
          setLoading(true);
          
          try {
            // Try to restore session from draft/original
            const restored = await restoreSession(settings.tableId, atomId);
            
            if (restored.restored && restored.data) {
              console.log('✅ [TABLE-ATOM] Session restored:', restored);
              
              // Update settings with restored data
              updateSettings(atomId, {
                tableData: restored.data,
                tableId: restored.data.table_id,
                sourceFile: restored.data.object_name || settings.sourceFile,
                visibleColumns: restored.data.columns,
                columnOrder: restored.data.columns,
              });
              
              if (restored.has_unsaved_changes) {
                toast({
                  title: 'Session Restored',
                  description: `Restored ${restored.change_count} unsaved changes`,
                });
              }
            } else {
              // Fallback: reload from source file
              if (settings.sourceFile) {
                console.log('🔄 [TABLE-ATOM] Restoring from source file:', settings.sourceFile);
                const data = await loadTable(settings.sourceFile);
                updateSettings(atomId, {
                  tableData: data,
                  tableId: data.table_id,
                  sourceFile: settings.sourceFile || data.object_name,
                  visibleColumns: data.columns,
                  columnOrder: data.columns,
                });
              } else {
                throw new Error('No source file available for restoration');
              }
            }
          } catch (err: any) {
            console.error('❌ [TABLE-ATOM] Failed to restore session:', err);
            // Try fallback to source file
            if (settings.sourceFile) {
              try {
                const data = await loadTable(settings.sourceFile);
                updateSettings(atomId, {
                  tableData: data,
                  tableId: data.table_id,
                  sourceFile: settings.sourceFile || data.object_name,
                  visibleColumns: data.columns,
                  columnOrder: data.columns,
                });
              } catch (loadErr: any) {
                setError(loadErr.message || 'Failed to restore table session');
              }
            } else {
              setError(err.message || 'Failed to restore table session');
            }
          } finally {
            setLoading(false);
          }
        }
      }
    };
    
    restoreLoadedTableSession();
  }, [settings.mode, settings.tableId, settings.tableData, settings.sourceFile, loading, atomId, updateSettings, toast]);

  // Restore blank table session on mount (like DataFrame Operations)
  useEffect(() => {
    const restoreBlankTableSession = async () => {
      if (
        settings.mode === 'blank' && 
        settings.tableId && 
        settings.blankTableConfig?.created &&
        settings.tableData &&
        !loading
      ) {
        console.log('🔄 [TABLE-ATOM] Checking blank table session:', settings.tableId);
        
        try {
          // Check if session exists in backend
          const info = await getTableInfo(settings.tableId);
          console.log('✅ [TABLE-ATOM] Session exists, no restoration needed');
        } catch (error: any) {
          // Session doesn't exist, need to recreate
          console.log('⚠️ [TABLE-ATOM] Session missing, recreating blank table...');
          setLoading(true);
          
          try {
            // Recreate blank table in backend
            const useHeaderRow = settings.layout?.headerRow || false;
            const restoredData = await createBlankTable(
              settings.blankTableConfig.rows,
              settings.blankTableConfig.columns,
              useHeaderRow
            );
            
            console.log('✅ [TABLE-ATOM] Blank table recreated:', restoredData.table_id);
            
            // Restore cell values from settings.tableData
            if (settings.tableData.rows && Array.isArray(settings.tableData.rows) && settings.tableData.rows.length > 0) {
              console.log('🔄 [TABLE-ATOM] Restoring cell values...');
              
              // Restore each cell value
              for (let rowIdx = 0; rowIdx < settings.tableData.rows.length; rowIdx++) {
                const row = settings.tableData.rows[rowIdx];
                if (row && typeof row === 'object') {
                  for (const [colKey, value] of Object.entries(row)) {
                    if (value !== null && value !== undefined && value !== '') {
                      try {
                        await editTableCell(restoredData.table_id, rowIdx, colKey, value);
                      } catch (err) {
                        console.warn(`⚠️ [TABLE-ATOM] Failed to restore cell [${rowIdx}, ${colKey}]:`, err);
                      }
                    }
                  }
                }
              }
              
              console.log('✅ [TABLE-ATOM] Cell values restored');
            }
            
            // Update settings with new table_id
            updateSettings(atomId, {
              tableId: restoredData.table_id,
              tableData: {
                ...settings.tableData,
                table_id: restoredData.table_id
              }
            });
            
            console.log('✅ [TABLE-ATOM] Blank table session restored');
          } catch (err: any) {
            console.error('❌ [TABLE-ATOM] Failed to restore blank table session:', err);
            setError(err.message || 'Failed to restore blank table session');
          } finally {
            setLoading(false);
          }
        }
      }
    };
    
    restoreBlankTableSession();
  }, [settings.mode, settings.tableId, settings.blankTableConfig, settings.tableData, loading, atomId, updateSettings]);

  // Fetch conditional formatting styles when rules change or table loads
  useEffect(() => {
    const fetchFormattingStyles = async () => {
      // Check if we have saved styles from loaded table (highest priority)
      if (tableData?.conditional_format_styles) {
        console.log('🎨 [CF] Using saved styles from loaded table:', tableData.conditional_format_styles);
        setCellStyles(tableData.conditional_format_styles);
        return;
      }

      // If no saved styles, evaluate rules if they exist
      if (!settings.conditionalFormats || settings.conditionalFormats.length === 0) {
        console.log('🎨 [CF] No rules and no saved styles, clearing styles');
        setCellStyles({});
        return;
      }

      if (!settings.tableId) {
        console.log('🎨 [CF] No tableId, skipping evaluation');
        return;
      }

      console.log('🎨 [CF] Evaluating formatting with rules:', settings.conditionalFormats);
      console.log('🎨 [CF] Table ID:', settings.tableId);

      try {
        const response = await evaluateConditionalFormats(settings.tableId, settings.conditionalFormats);
        console.log('✅ [CF] Styles received:', response.styles);
        console.log('📊 [CF] Formatted rows count:', Object.keys(response.styles || {}).length);
        setCellStyles(response.styles || {});
      } catch (err: any) {
        console.error('❌ [CF] Failed to evaluate conditional formatting:', err);
        console.error('❌ [CF] Error details:', err.message, err.stack);
        // Don't clear existing styles on error (graceful degradation)
      }
    };

    fetchFormattingStyles();
  }, [settings.conditionalFormats, settings.tableId, tableData?.conditional_format_styles]);

  const handleLoadData = async () => {
    if (!settings.sourceFile) {
      setError('No source file specified');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      console.log('🔍 [TABLE-ATOM] Manual loading data from:', settings.sourceFile);
      const data = await loadTable(settings.sourceFile);
      
      console.log('✅ [TABLE-ATOM] Data loaded:', data);
      
      // ✅ Store data in Zustand settings (like DataFrame Operations)
      updateSettings(atomId, {
        tableData: data,
        tableId: data.table_id,
        sourceFile: settings.sourceFile || data.object_name,  // Store source file for recovery
        visibleColumns: data.columns,
        columnOrder: data.columns
      });
      
    } catch (err: any) {
      console.error('❌ [TABLE-ATOM] Load error:', err);
      setError(err.message || 'Failed to load table');
    } finally {
      setLoading(false);
    }
  };

  // Save (overwrite original file)
  const handleSave = () => {
    if (!settings.tableId) {
      toast({
        title: 'Error',
        description: 'No table data to save',
        variant: 'destructive'
      });
      return;
    }
    
    if (!settings.sourceFile) {
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
    if (!settings.tableId || !settings.sourceFile) return;
    
    setShowOverwriteDialog(false);
    setSaving(true);
    
    try {
      // Check if header row should be used (blank table with header row ON)
      const useHeaderRow = settings.mode === 'blank' && settings.layout?.headerRow === true;
      const response = await saveTable(
        settings.tableId, 
        settings.sourceFile, 
        true, 
        useHeaderRow,
        settings.conditionalFormats || []
      );
      
      // Update savedFile to sourceFile so filename display updates
      updateSettings(atomId, {
        savedFile: settings.sourceFile
      });
      
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
    if (!settings.tableId) {
      toast({
        title: 'Error',
        description: 'No table data to save',
        variant: 'destructive'
      });
      return;
    }
    
    // Generate default filename
    const defaultName = settings.sourceFile 
      ? `${settings.sourceFile.split('/').pop()?.replace('.arrow', '')}_copy`
      : `table_${Date.now()}`;
    setSaveFileName(defaultName);
    setShowSaveAsDialog(true);
  };

  // Confirm Save As
  const confirmSaveAs = async () => {
    if (!settings.tableId) return;
    
    setSaving(true);
    try {
      // Check if header row should be used (blank table with header row ON)
      const useHeaderRow = settings.mode === 'blank' && settings.layout?.headerRow === true;
      const filename = saveFileName.trim() || `table_${Date.now()}`;
      const response = await saveTable(
        settings.tableId, 
        filename, 
        false, 
        useHeaderRow,
        settings.conditionalFormats || []
      );
      
      toast({
        title: 'Success',
        description: `Table saved as ${response.object_name}`,
      });
      
      // Update settings with new file reference
      updateSettings(atomId, {
        sourceFile: response.object_name,
        savedFile: response.object_name
      });
      
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

  const handleRefresh = () => {
    if (settings.sourceFile) {
      handleLoadData();
    }
  };

  const handleSettingsChange = async (newSettings: Partial<TableSettings>) => {
    // Update settings in store
    updateSettings(atomId, newSettings);

    // If we have a table ID, update backend and refresh data
    if (settings.tableId && settings.tableData) {
      try {
        console.log('🔄 [TABLE-ATOM] Updating settings:', newSettings);
        const updatedData = await updateTable(settings.tableId, {
          visible_columns: newSettings.visibleColumns || settings.visibleColumns,
          column_order: newSettings.columnOrder || settings.columnOrder,
          filters: newSettings.filters || settings.filters,
          sort_config: newSettings.sortConfig || settings.sortConfig,
          show_row_numbers: newSettings.showRowNumbers ?? settings.showRowNumbers,
          show_summary_row: newSettings.showSummaryRow ?? settings.showSummaryRow,
          frozen_columns: newSettings.frozenColumns ?? settings.frozenColumns,
          row_height: newSettings.rowHeight || settings.rowHeight
        });
        
        console.log('✅ [TABLE-ATOM] Settings updated, refreshing data');
        // ✅ Update tableData in settings
        updateSettings(atomId, { tableData: updatedData });
        
      } catch (err: any) {
        console.error('❌ [TABLE-ATOM] Update error:', err);
        setError(err.message || 'Failed to update settings');
      }
    }
  };

  const handlePageChange = (page: number) => {
    updateSettings(atomId, { currentPage: page });
  };

  // Render loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 bg-white rounded-lg shadow">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-teal-500 mx-auto mb-2" />
          <p className="text-gray-600">Loading table data...</p>
        </div>
      </div>
    );
  }

  // Render error state
  if (error && !tableData) {
    return (
      <div className="flex items-center justify-center h-64 bg-white rounded-lg shadow">
        <div className="text-center">
          <p className="text-red-600 mb-4">❌ {error}</p>
          <button
            onClick={handleRefresh}
            className="px-4 py-2 bg-teal-500 text-white rounded hover:bg-teal-600"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Check if we have renderable data (like dataframe-operations does)
  const fileSelected = !!settings.sourceFile || settings.mode === 'blank';
  const hasRenderableData = tableData && tableData.columns && tableData.columns.length > 0;

  console.log('🎨 [TABLE-ATOM] Render conditions:', {
    fileSelected,
    hasRenderableData,
    hasTableData: !!tableData,
    mode: settings.mode,
    sourceFile: settings.sourceFile,
    columnsCount: tableData?.columns?.length
  });

  // Render table (like dataframe-operations)
  return (
    <div className="w-full h-full bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden flex flex-col">
      {fileSelected && hasRenderableData ? (
        <>
          {console.log('✅ [TABLE-ATOM] Rendering TableCanvas with data:', {
            table_id: tableData.table_id,
            columns_count: tableData.columns?.length,
            rows_count: tableData.rows?.length
          })}
          
          {/* Error banner */}
          {error && (
            <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-sm">
              ⚠️ {error}
            </div>
          )}

          {/* Save Buttons Bar */}
          <div className="px-4 py-2 border-b border-gray-200 bg-white flex items-center justify-between gap-2">
            {/* Filename Display */}
            <div className="flex items-center space-x-2 flex-1 min-w-0">
              {(() => {
                // Determine filename to display
                let displayName = '';
                if (settings.savedFile) {
                  // User saved with a new name
                  displayName = settings.savedFile.includes('/') 
                    ? settings.savedFile.split('/').pop() || settings.savedFile
                    : settings.savedFile;
                } else if (settings.sourceFile) {
                  // Loaded from file or saved to original
                  displayName = settings.sourceFile.includes('/')
                    ? settings.sourceFile.split('/').pop() || settings.sourceFile
                    : settings.sourceFile;
                } else if (settings.mode === 'blank' && (tableData?.table_id || settings.tableId)) {
                  // Blank table - show table ID
                  displayName = tableData?.table_id || settings.tableId || 'Untitled Table';
                } else if (tableData?.object_name) {
                  // Fallback to object_name from backend
                  displayName = tableData.object_name.includes('/')
                    ? tableData.object_name.split('/').pop() || tableData.object_name
                    : tableData.object_name;
                } else if (tableData?.table_id) {
                  // Last resort: use table_id
                  displayName = tableData.table_id;
                }
                
                if (displayName) {
                  return (
                    <div className="flex items-center space-x-2 px-3 py-1.5 rounded-md bg-blue-50 border border-blue-200">
                      <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                      <span className="text-sm font-medium text-gray-700 truncate">{displayName}</span>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
            
            {/* Save Buttons */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                onClick={handleSave}
                disabled={saving || !settings.tableId || !settings.sourceFile}
                className="bg-green-600 hover:bg-green-700 text-white flex items-center space-x-2 px-4"
                size="sm"
              >
                {saving ? (
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
                onClick={handleSaveAs}
                disabled={saving || !settings.tableId}
                className="bg-blue-600 hover:bg-blue-700 text-white flex items-center space-x-2 px-4"
                size="sm"
              >
                {saving ? (
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
            </div>
          </div>

          {/* Table Canvas */}
          <div className="flex-1 overflow-hidden">
            <TableCanvas
              data={tableData}
              settings={{...settings, atomId}}
              cellStyles={cellStyles}
              onSettingsChange={handleSettingsChange}
            />
          </div>

          {/* Pagination - only for load mode */}
          {settings.mode === 'load' && (
            <TablePagination
              currentPage={settings.currentPage}
              pageSize={settings.pageSize}
              totalRows={tableData.row_count}
              onPageChange={handlePageChange}
            />
          )}
        </>
      ) : (
        <div className="w-full h-full p-6 bg-gradient-to-br from-slate-50 via-teal-50/30 to-teal-50/50 overflow-y-auto relative min-h-0">
          {console.log('📭 [TABLE-ATOM] Rendering empty state')}
          
          <div className="absolute inset-0 opacity-20">
            <svg width="80" height="80" viewBox="0 0 80 80" className="absolute inset-0 w-full h-full">
              <defs>
                <pattern id="emptyGridTable" width="80" height="80" patternUnits="userSpaceOnUse">
                  <path d="M 80 0 L 0 0 0 80" fill="none" stroke="rgb(148 163 184 / 0.15)" strokeWidth="1"/>
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#emptyGridTable)" />
            </svg>
          </div>

          <div className="relative z-10 flex items-center justify-center h-full">
            <div className="text-center max-w-md">
              {loading ? (
                <>
                  <Loader2 className="w-12 h-12 animate-spin text-teal-500 mx-auto mb-4" />
                  <p className="text-gray-600">Loading table data...</p>
                </>
              ) : error ? (
                <>
                  <p className="text-red-600 mb-4">❌ {error}</p>
                  <button
                    onClick={handleRefresh}
                    className="px-4 py-2 bg-teal-500 text-white rounded hover:bg-teal-600"
                  >
                    Retry
                  </button>
                </>
              ) : (
                <>
                  <div className="w-24 h-24 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center shadow-2xl transform rotate-3 hover:rotate-0 transition-transform duration-300">
                    <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-3xl font-bold text-gray-900 mb-3 bg-gradient-to-r from-teal-500 to-teal-600 bg-clip-text text-transparent">
                    Table
                  </h3>
                  <p className="text-gray-600 mb-6 text-lg font-medium leading-relaxed">
                    Select a data source or create a blank table from the properties panel to get started
                  </p>
                </>
              )}
            </div>
          </div>
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
                  File: {settings.sourceFile?.split('/').pop()}
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

export default TableAtom;

