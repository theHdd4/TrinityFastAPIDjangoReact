import React, { useState, useEffect, useRef } from 'react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import TableCanvas from './components/TableCanvas';
import TableToolbar from './components/TableToolbar';
import TablePagination from './components/TablePagination';
import { loadTable, updateTable, saveTable, evaluateConditionalFormats, getTableInfo, createBlankTable, editTableCell, restoreSession, type TableMetadata } from './services/tableApi';
import { ConditionalFormatRule } from './components/conditional-formatting/types';
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
  metadata?: any;  // Backend metadata (design, layout, cellFormatting, etc.)
  conditional_format_styles?: Record<string, Record<string, Record<string, string>>>;
}

export interface TableSettings {
  mode?: 'load' | 'blank';
  sourceFile?: string;
  savedFile?: string;  // Last saved filename (for display purposes)
  tableId?: string;
  tableData?: TableData;  // ✅ Store data in settings like dataframe-operations
  reloadTrigger?: number;  // Timestamp to force reload when same file is overwritten
  pipelineExecutionTimestamp?: number;  // Timestamp from pipeline execution to force reload
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
  // Total row aggregation results from API
  totalRowAggregations?: Record<string, any>;
  // Phase 2: Design
  design?: {
    theme: string;
    borderStyle: 'all' | 'none' | 'outside' | 'horizontal' | 'vertical' | 'header' | {
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
  // Cardinality view filtering and sorting
  showCardinalityView?: boolean;
  cardinalitySortColumn?: string;
  cardinalitySortDirection?: 'asc' | 'desc';
  cardinalityColumnFilters?: Record<string, string[]>;
}

// Helper function to convert backend metadata (snake_case) to frontend format (camelCase)
const convertBackendMetadataToFrontend = (backendMetadata: any): TableMetadata | undefined => {
  if (!backendMetadata) return undefined;
  
  return {
    cellFormatting: backendMetadata.cell_formatting,
    design: backendMetadata.design,
    layout: backendMetadata.layout,
    columnWidths: backendMetadata.column_widths,
    rowHeights: backendMetadata.row_heights,
  };
};

// Helper function to apply metadata to settings
const applyMetadataToSettings = (
  metadata: TableMetadata | undefined,
  currentSettings: Partial<TableSettings> = {}
): Partial<TableSettings> => {
  if (!metadata) return {};
  
  const updates: Partial<TableSettings> = {};
  
  // CRITICAL: Apply cell formatting (metadata takes priority)
  // Deep merge to preserve all cell formatting from metadata
  if (metadata.cellFormatting) {
    // Start with current settings (if any)
    const mergedCellFormatting: Record<string, Record<string, any>> = {
      ...(currentSettings.cellFormatting || {}),
    };
    
    // Deep merge each row's formatting
    Object.keys(metadata.cellFormatting).forEach(rowKey => {
      if (!mergedCellFormatting[rowKey]) {
        mergedCellFormatting[rowKey] = {};
      }
      // Merge column-level formatting for this row
      mergedCellFormatting[rowKey] = {
        ...mergedCellFormatting[rowKey],
        ...metadata.cellFormatting![rowKey],
      };
    });
    
    updates.cellFormatting = mergedCellFormatting;
    
    console.log('📋 [TABLE-METADATA] Applied cell formatting:', {
      rowCount: Object.keys(mergedCellFormatting).length,
      totalCells: Object.values(mergedCellFormatting).reduce((sum, cols) => sum + Object.keys(cols).length, 0)
    });
  }
  
  // Apply design (theme, borderStyle, etc.) - metadata takes priority
  if (metadata.design) {
    // Type-safe borderStyle handling: backend may return string, but we need union type
    const borderStyle = metadata.design.borderStyle;
    const validBorderStyles = ['all', 'none', 'outside', 'horizontal', 'vertical', 'header'] as const;
    const isValidBorderStyleString = typeof borderStyle === 'string' && 
      validBorderStyles.includes(borderStyle as any);
    
    updates.design = {
      ...(currentSettings.design || DEFAULT_SETTINGS.design),
      ...metadata.design,
      // Ensure borderStyle is properly typed
      borderStyle: isValidBorderStyleString 
        ? (borderStyle as typeof validBorderStyles[number])
        : typeof borderStyle === 'object' 
          ? borderStyle 
          : (currentSettings.design || DEFAULT_SETTINGS.design)?.borderStyle || 'all',
    } as TableSettings['design'];
  }
  
  // Apply layout - metadata takes priority
  if (metadata.layout) {
    updates.layout = {
      ...(currentSettings.layout || DEFAULT_SETTINGS.layout),
      ...metadata.layout,  // Loaded layout overrides everything
    };
  }
  
  // Apply column widths (merge, metadata takes priority)
  if (metadata.columnWidths) {
    updates.columnWidths = {
      ...(currentSettings.columnWidths || {}),
      ...metadata.columnWidths,
    };
  }
  
  // Apply row heights (merge, metadata takes priority)
  if (metadata.rowHeights) {
    updates.rowHeights = {
      ...(currentSettings.rowHeights || {}),
      ...metadata.rowHeights,
    };
  }
  
  return updates;
};

const DEFAULT_SETTINGS: TableSettings = {
  visibleColumns: [],
  columnOrder: [],
  columnWidths: {},
  rowHeight: 30,  // Default: 10 units (30px) for blank tables
  rowHeights: {},  // NEW: Empty by default, populated as rows are resized
  showRowNumbers: false,  // OFF by default for blank tables (out of theme)
  showSummaryRow: false,
  frozenColumns: 0,
  filters: {},
  sortConfig: [],
  currentPage: 1,
  pageSize: 15,  // ✅ 15 rows per page
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
  
  const baseSettings = (atom?.settings as Partial<TableSettings> | undefined) || {};
  
  // ✅ Read data from settings, not local state (like dataframe-operations)
  const tableData = baseSettings.tableData || null;
  
  // Check if tableData has metadata that should be applied (highest priority)
  const loadedMetadata = tableData?.metadata 
    ? convertBackendMetadataToFrontend(tableData.metadata)
    : null;
  
  // Apply loaded metadata first (if available)
  const metadataSettings = loadedMetadata
    ? applyMetadataToSettings(loadedMetadata, baseSettings)
    : {};
  
  // Merge settings with priority: Loaded Metadata > Base Settings > Defaults
  const settings: TableSettings = {
    ...DEFAULT_SETTINGS,
    ...baseSettings,
    ...metadataSettings,  // Loaded metadata overrides base settings
    // Deep merge nested objects (metadata takes priority)
    layout: {
      ...DEFAULT_SETTINGS.layout,
      ...(baseSettings.layout || {}),
      ...(metadataSettings.layout || {}),  // Loaded metadata layout takes priority
    },
    design: {
      ...DEFAULT_SETTINGS.design,
      ...(baseSettings.design || {}),
      ...(metadataSettings.design || {}),  // Loaded metadata design takes priority
    },
    totalRowConfig: {
      ...DEFAULT_SETTINGS.totalRowConfig,
      ...(baseSettings.totalRowConfig || {}),
    },
    conditionalFormats: (baseSettings.conditionalFormats as ConditionalFormatRule[] | undefined) || DEFAULT_SETTINGS.conditionalFormats,
  };
  
  // Debug logging for metadata application
  if (loadedMetadata) {
    console.log('📋 [TABLE] Applied metadata from tableData:', {
      design: metadataSettings.design,
      layout: metadataSettings.layout,
    });
  }
  
  // Effect to ensure metadata is applied when tableData changes
  useEffect(() => {
    if (tableData?.metadata && atom) {
      const frontendMetadata = convertBackendMetadataToFrontend(tableData.metadata);
      if (frontendMetadata) {
        // Check if metadata is already applied (avoid infinite loop)
        const currentSettings = atom.settings as Partial<TableSettings> | undefined;
        const currentDesign = currentSettings?.design;
        const currentLayout = currentSettings?.layout;
        
        // Only update if metadata differs from current settings
        const designChanged = frontendMetadata.design && 
          JSON.stringify(frontendMetadata.design) !== JSON.stringify(currentDesign);
        const layoutChanged = frontendMetadata.layout && 
          JSON.stringify(frontendMetadata.layout) !== JSON.stringify(currentLayout);
        
        if (designChanged || layoutChanged) {
          console.log('📋 [TABLE] Re-applying metadata from tableData (settings out of sync)', {
            designChanged,
            layoutChanged,
            metadataDesign: frontendMetadata.design,
            currentDesign,
          });
          const metadataUpdates = applyMetadataToSettings(frontendMetadata, currentSettings || {});
          updateSettings(atomId, metadataUpdates);
        }
      }
    }
  }, [tableData?.metadata, atomId, atom?.settings, updateSettings]);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showSaveAsDialog, setShowSaveAsDialog] = useState(false);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const [saveFileName, setSaveFileName] = useState('');
  const [cellStyles, setCellStyles] = useState<Record<string, Record<string, Record<string, string>>>>({});
  const { toast } = useToast();

  // Track previous sourceFile and reloadTrigger to detect changes
  const prevSourceFileRef = useRef<string | undefined>(settings.sourceFile);
  const prevReloadTriggerRef = useRef<number | undefined>(settings.reloadTrigger);
  const prevTableDataRef = useRef<TableData | null | undefined>(settings.tableData);
  const prevPipelineExecutionTimestampRef = useRef<number | undefined>(settings.pipelineExecutionTimestamp);

  // Auto-load data ONLY if sourceFile exists but tableData doesn't (like dataframe-operations)
  useEffect(() => {
    const autoLoadData = async () => {
      // Check if we need to load: mode is 'load', sourceFile exists, and tableData is missing/undefined/null
      const hasSourceFile = !!settings.sourceFile;
      const hasTableData = settings.tableData !== undefined && settings.tableData !== null;
      const sourceFileChanged = settings.sourceFile !== prevSourceFileRef.current;
      const reloadTriggerChanged = settings.reloadTrigger !== undefined && settings.reloadTrigger !== prevReloadTriggerRef.current;
      const tableDataCleared = prevTableDataRef.current !== null && prevTableDataRef.current !== undefined && !hasTableData;
      
      // CRITICAL: Also check if tableData was explicitly set to null (from pipeline)
      // This handles the case where pipeline clears tableData to force reload
      const tableDataExplicitlyCleared = settings.tableData === null && prevTableDataRef.current !== null && prevTableDataRef.current !== undefined;
      
      // CRITICAL: Check if pipelineExecutionTimestamp changed (pipeline re-execution)
      // This is the PRIMARY way pipeline updates trigger reloads (like feature-overview)
      const pipelineExecutionChanged = settings.pipelineExecutionTimestamp !== undefined && 
                                       settings.pipelineExecutionTimestamp !== prevPipelineExecutionTimestampRef.current;
      
      // CRITICAL: Pipeline execution triggers reload ONLY if we don't have executor tableData
      // If executor provided tableData (with all operations applied), we should use it instead of reloading
      // This prevents unnecessary reloads when pipeline executor has already done all the work
      const shouldLoadFromPipeline = pipelineExecutionChanged && hasSourceFile && !loading && !hasTableData;
      
      // Should load if:
      // 1. Pipeline execution changed AND no executor tableData (executor didn't provide data, so reload)
      // 2. Normal case: mode is 'load', sourceFile exists, no tableData, not loading
      // 3. Force reload: reloadTrigger changed (for overwrite case) - CRITICAL FIX
      // 4. File changed: sourceFile changed and we have tableData (need to reload new file)
      // 5. Table data was cleared: tableData was present but is now null/undefined (for overwrite case)
      const shouldLoad = shouldLoadFromPipeline || (
        settings.mode === 'load' && hasSourceFile && !loading && (
          !hasTableData ||  // No data yet - normal load
          reloadTriggerChanged ||  // Force reload triggered (overwrite case) - PRIMARY FIX
          (sourceFileChanged && hasTableData) ||  // File changed - reload new file
          tableDataCleared ||  // Table data was cleared (overwrite case) - SECONDARY FIX
          tableDataExplicitlyCleared  // Table data explicitly set to null (pipeline case) - PIPELINE FIX
        )
      );
      
      console.log('📊 [TABLE-ATOM] Auto-load check:', {
        atomId,
        mode: settings.mode,
        sourceFile: settings.sourceFile,
        hasTableData,
        loading,
        sourceFileChanged,
        reloadTriggerChanged,
        tableDataCleared,
        tableDataExplicitlyCleared,
        pipelineExecutionChanged,
        currentReloadTrigger: settings.reloadTrigger,
        prevReloadTrigger: prevReloadTriggerRef.current,
        currentPipelineTimestamp: settings.pipelineExecutionTimestamp,
        prevPipelineTimestamp: prevPipelineExecutionTimestampRef.current,
        currentTableData: settings.tableData === null ? 'null' : settings.tableData ? 'exists' : 'undefined',
        prevTableData: prevTableDataRef.current === null ? 'null' : prevTableDataRef.current ? 'exists' : 'undefined',
        shouldLoad
      });
      
      if (shouldLoad) {
        console.log('🔄 [TABLE-ATOM] Auto-loading data from source:', settings.sourceFile, {
          reason: pipelineExecutionChanged ? 'pipelineExecutionTimestamp changed (pipeline re-execution)' :
                  reloadTriggerChanged ? 'reloadTrigger changed' : 
                  tableDataExplicitlyCleared ? 'tableData explicitly cleared (pipeline)' :
                  tableDataCleared ? 'tableData cleared' : 
                  sourceFileChanged ? 'sourceFile changed' : 
                  'no tableData'
        });
        setLoading(true);
        setError(null);
        try {
          // Get card_id and canvas_position for pipeline tracking (like feature-overview and groupby)
          const cards = useLaboratoryStore.getState().cards;
          const card = cards.find(c => Array.isArray(c.atoms) && c.atoms.some(a => a.id === atomId));
          const cardId = card?.id || '';
          const canvasPosition = card?.canvas_position ?? 0;
          
          const data = await loadTable(settings.sourceFile, atomId, cardId, canvasPosition);
          console.log('✅ [TABLE-ATOM] Data loaded successfully:', {
            tableId: data.table_id,
            columns: data.columns?.length,
            rows: data.rows?.length,
            columnNames: data.columns?.slice(0, 5) // Log first 5 column names
          });
          
          // ✅ Store data in Zustand settings (like DataFrame Operations)
          const settingsUpdate: Partial<TableSettings> = {
            tableData: data,
            tableId: data.table_id,
            sourceFile: settings.sourceFile || data.object_name,  // Store source file for recovery
            visibleColumns: data.columns,
            columnOrder: data.columns,
            reloadTrigger: undefined,  // Clear reloadTrigger after successful load
          };
          
          // Apply metadata if available (formatting, design, layout)
          // Metadata should override any existing settings
          const frontendMetadata = convertBackendMetadataToFrontend(data.metadata);
          // console.log('📋 [TABLE-LOAD] Converted metadata:', frontendMetadata);
          
          const metadataUpdates = applyMetadataToSettings(frontendMetadata, {});
          // console.log('📋 [TABLE-LOAD] Metadata updates to apply:', metadataUpdates);
          
          // Merge metadata updates into settings update
          Object.assign(settingsUpdate, metadataUpdates);
          
          console.log('💾 [TABLE-ATOM] Updating settings with loaded data:', {
            hasTableData: !!settingsUpdate.tableData,
            columnCount: settingsUpdate.visibleColumns?.length,
            reloadTriggerCleared: settingsUpdate.reloadTrigger === undefined,
            hasCellFormatting: !!metadataUpdates.cellFormatting,
            cellFormattingRows: metadataUpdates.cellFormatting ? Object.keys(metadataUpdates.cellFormatting).length : 0
          });
          
          updateSettings(atomId, settingsUpdate);
          
          // Update refs to track current state AFTER successful load
          prevSourceFileRef.current = settings.sourceFile;
          prevReloadTriggerRef.current = undefined;
          prevTableDataRef.current = data;
          prevPipelineExecutionTimestampRef.current = settings.pipelineExecutionTimestamp;
          
          console.log('✅ [TABLE-ATOM] Refs updated after successful load');
        } catch (err: any) {
          console.error('❌ [TABLE-ATOM] Auto-load error:', err);
          setError(err.message || 'Failed to load table');
        } finally {
          setLoading(false);
        }
      } else {
        // Update refs even if not loading (to track state for next check)
        // CRITICAL: Only update refs AFTER we've checked for changes
        // This ensures the next useEffect run can detect the changes
        // Only update if values actually changed to avoid unnecessary updates
        if (prevSourceFileRef.current !== settings.sourceFile) {
          prevSourceFileRef.current = settings.sourceFile;
          console.log('📝 [TABLE-ATOM] Updated prevSourceFileRef to:', settings.sourceFile);
        }
        if (prevReloadTriggerRef.current !== settings.reloadTrigger) {
          prevReloadTriggerRef.current = settings.reloadTrigger;
          console.log('📝 [TABLE-ATOM] Updated prevReloadTriggerRef to:', settings.reloadTrigger);
        }
        if (prevTableDataRef.current !== settings.tableData) {
          prevTableDataRef.current = settings.tableData || null;
          console.log('📝 [TABLE-ATOM] Updated prevTableDataRef to:', settings.tableData === null ? 'null' : settings.tableData ? 'exists' : 'undefined');
        }
        if (prevPipelineExecutionTimestampRef.current !== settings.pipelineExecutionTimestamp) {
          prevPipelineExecutionTimestampRef.current = settings.pipelineExecutionTimestamp;
          console.log('📝 [TABLE-ATOM] Updated prevPipelineExecutionTimestampRef to:', settings.pipelineExecutionTimestamp);
        }
      }
    };
    
    autoLoadData();
  }, [settings.mode, settings.sourceFile, settings.tableData, settings.reloadTrigger, settings.pipelineExecutionTimestamp, loading, atomId, updateSettings]);

  // Restore session from MongoDB/MinIO on mount (for loaded tables)
  useEffect(() => {
    const restoreLoadedTableSession = async () => {
      if (
        settings.mode === 'load' && 
        settings.tableId && 
        settings.tableData &&
        !loading
      ) {
        try {
          // Check if session exists in backend
          await getTableInfo(settings.tableId);
        } catch (error: any) {
          // Session doesn't exist, try to restore from MongoDB/MinIO
          setLoading(true);
          
          try {
            // Try to restore session from draft/original
            const restored = await restoreSession(settings.tableId, atomId);
            
            if (restored.restored && restored.data) {
              console.log('📋 [TABLE-RESTORE] Restored data with metadata:', restored.data.metadata);
              
              // Update settings with restored data
              const settingsUpdate: Partial<TableSettings> = {
                tableData: restored.data,
                tableId: restored.data.table_id,
                sourceFile: restored.data.object_name || settings.sourceFile,
                visibleColumns: restored.data.columns,
                columnOrder: restored.data.columns,
              };
              
              // Apply metadata if available (metadata takes priority)
              const frontendMetadata = convertBackendMetadataToFrontend(restored.data.metadata);
              const metadataUpdates = applyMetadataToSettings(frontendMetadata, {});
              Object.assign(settingsUpdate, metadataUpdates);
              
              console.log('📋 [TABLE-RESTORE] Applied metadata updates:', metadataUpdates);
              
              updateSettings(atomId, settingsUpdate);
              
              if (restored.has_unsaved_changes) {
                toast({
                  title: 'Session Restored',
                  description: `Restored ${restored.change_count} unsaved changes`,
                });
              }
            } else {
              // Fallback: reload from source file
              if (settings.sourceFile) {
                // Get card_id and canvas_position for pipeline tracking
                const cards = useLaboratoryStore.getState().cards;
                const card = cards.find(c => Array.isArray(c.atoms) && c.atoms.some(a => a.id === atomId));
                const cardId = card?.id || '';
                const canvasPosition = card?.canvas_position ?? 0;
                
                const data = await loadTable(settings.sourceFile, atomId, cardId, canvasPosition);
                console.log('📋 [TABLE-RESTORE] Fallback load with metadata:', data.metadata);
                
                const settingsUpdate: Partial<TableSettings> = {
                  tableData: data,
                  tableId: data.table_id,
                  sourceFile: settings.sourceFile || data.object_name,
                  visibleColumns: data.columns,
                  columnOrder: data.columns,
                };
                
                // Apply metadata if available (metadata takes priority)
                const frontendMetadata = convertBackendMetadataToFrontend(data.metadata);
                const metadataUpdates = applyMetadataToSettings(frontendMetadata, {});
                Object.assign(settingsUpdate, metadataUpdates);
                
                console.log('📋 [TABLE-RESTORE] Applied metadata updates:', metadataUpdates);
                
                updateSettings(atomId, settingsUpdate);
              } else {
                throw new Error('No source file available for restoration');
              }
            }
          } catch (err: any) {
            // Try fallback to source file
            if (settings.sourceFile) {
              try {
                // Get card_id and canvas_position for pipeline tracking
                const cards = useLaboratoryStore.getState().cards;
                const card = cards.find(c => Array.isArray(c.atoms) && c.atoms.some(a => a.id === atomId));
                const cardId = card?.id || '';
                const canvasPosition = card?.canvas_position ?? 0;
                
                const data = await loadTable(settings.sourceFile, atomId, cardId, canvasPosition);
                console.log('📋 [TABLE-RESTORE] Error fallback load with metadata:', data.metadata);
                
                const settingsUpdate: Partial<TableSettings> = {
                  tableData: data,
                  tableId: data.table_id,
                  sourceFile: settings.sourceFile || data.object_name,
                  visibleColumns: data.columns,
                  columnOrder: data.columns,
                };
                
                // Apply metadata if available (metadata takes priority)
                const frontendMetadata = convertBackendMetadataToFrontend(data.metadata);
                const metadataUpdates = applyMetadataToSettings(frontendMetadata, {});
                Object.assign(settingsUpdate, metadataUpdates);
                
                updateSettings(atomId, settingsUpdate);
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
        try {
          // Check if session exists in backend
          await getTableInfo(settings.tableId);
        } catch (error: any) {
          // Session doesn't exist, need to recreate
          setLoading(true);
          
          try {
            // Recreate blank table in backend
            const useHeaderRow = settings.layout?.headerRow || false;
            const restoredData = await createBlankTable(
              settings.blankTableConfig.rows,
              settings.blankTableConfig.columns,
              useHeaderRow
            );
            
            // Restore cell values from settings.tableData
            if (settings.tableData.rows && Array.isArray(settings.tableData.rows) && settings.tableData.rows.length > 0) {
              // Restore each cell value
              for (let rowIdx = 0; rowIdx < settings.tableData.rows.length; rowIdx++) {
                const row = settings.tableData.rows[rowIdx];
                if (row && typeof row === 'object') {
                  for (const [colKey, value] of Object.entries(row)) {
                    if (value !== null && value !== undefined && value !== '') {
                      try {
                        // Get card_id and canvas_position for pipeline tracking
                        const cards = useLaboratoryStore.getState().cards;
                        const card = cards.find(c => Array.isArray(c.atoms) && c.atoms.some(a => a.id === atomId));
                        const cardId = card?.id || '';
                        const canvasPosition = card?.canvas_position ?? 0;
                        
                        await editTableCell(restoredData.table_id, rowIdx, colKey, value, atomId, cardId, canvasPosition);
                      } catch (err) {
                        // Silently continue if cell restore fails
                      }
                    }
                  }
                }
              }
            }
            
            // Update settings with new table_id
            updateSettings(atomId, {
              tableId: restoredData.table_id,
              tableData: {
                ...settings.tableData,
                table_id: restoredData.table_id
              }
            });
          } catch (err: any) {
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
        setCellStyles(tableData.conditional_format_styles);
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
      // Get card_id and canvas_position for pipeline tracking
      const cards = useLaboratoryStore.getState().cards;
      const card = cards.find(c => Array.isArray(c.atoms) && c.atoms.some(a => a.id === atomId));
      const cardId = card?.id || '';
      const canvasPosition = card?.canvas_position ?? 0;
      
      const data = await loadTable(settings.sourceFile, atomId, cardId, canvasPosition);
      
      console.log('📋 [TABLE-LOAD] Manual load with metadata:', data.metadata);
      
      // ✅ Store data in Zustand settings (like DataFrame Operations)
      const settingsUpdate: Partial<TableSettings> = {
        tableData: data,
        tableId: data.table_id,
        sourceFile: settings.sourceFile || data.object_name,  // Store source file for recovery
        visibleColumns: data.columns,
        columnOrder: data.columns
      };
      
      // Apply metadata if available (formatting, design, layout)
      // Metadata should override any existing settings
      const frontendMetadata = convertBackendMetadataToFrontend(data.metadata);
      console.log('📋 [TABLE-LOAD] Converted metadata:', frontendMetadata);
      
      const metadataUpdates = applyMetadataToSettings(frontendMetadata, {});
      console.log('📋 [TABLE-LOAD] Metadata updates to apply:', metadataUpdates);
      
      // Merge metadata updates into settings update
      Object.assign(settingsUpdate, metadataUpdates);
      
      console.log('📋 [TABLE-LOAD] Final settings update:', settingsUpdate);
      
      updateSettings(atomId, settingsUpdate);
      
    } catch (err: any) {
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
      
      // Collect metadata for saving
      const metadata: TableMetadata = {
        cellFormatting: settings.cellFormatting,
        design: settings.design ? {
          ...settings.design,
          borderStyle: typeof settings.design.borderStyle === 'string' 
            ? settings.design.borderStyle 
            : JSON.stringify(settings.design.borderStyle),
        } : undefined,
        layout: settings.layout,
        columnWidths: settings.columnWidths,
        rowHeights: settings.rowHeights,
      };
      
      console.log('💾 [TABLE-SAVE] Saving metadata:', {
        design: metadata.design,
        layout: metadata.layout,
        hasCellFormatting: !!metadata.cellFormatting,
        columnWidthsCount: Object.keys(metadata.columnWidths || {}).length,
        rowHeightsCount: Object.keys(metadata.rowHeights || {}).length,
      });
      
      // Get card_id and canvas_position for pipeline tracking
      const cards = useLaboratoryStore.getState().cards;
      const card = cards.find(c => Array.isArray(c.atoms) && c.atoms.some(a => a.id === atomId));
      const cardId = card?.id || '';
      const canvasPosition = card?.canvas_position ?? 0;
      
      const response = await saveTable(
        settings.tableId, 
        settings.sourceFile, 
        true, 
        useHeaderRow,
        settings.conditionalFormats || [],
        metadata,
        atomId,
        cardId,
        canvasPosition
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
      
      // Collect metadata for saving
      const metadata: TableMetadata = {
        cellFormatting: settings.cellFormatting,
        design: settings.design ? {
          ...settings.design,
          borderStyle: typeof settings.design.borderStyle === 'string' 
            ? settings.design.borderStyle 
            : JSON.stringify(settings.design.borderStyle),
        } : undefined,
        layout: settings.layout,
        columnWidths: settings.columnWidths,
        rowHeights: settings.rowHeights,
      };
      
      console.log('💾 [TABLE-SAVE-AS] Saving metadata:', {
        design: metadata.design,
        layout: metadata.layout,
        hasCellFormatting: !!metadata.cellFormatting,
        columnWidthsCount: Object.keys(metadata.columnWidths || {}).length,
        rowHeightsCount: Object.keys(metadata.rowHeights || {}).length,
      });
      
      // Get card_id and canvas_position for pipeline tracking
      const cards = useLaboratoryStore.getState().cards;
      const card = cards.find(c => Array.isArray(c.atoms) && c.atoms.some(a => a.id === atomId));
      const cardId = card?.id || '';
      const canvasPosition = card?.canvas_position ?? 0;
      
      const response = await saveTable(
        settings.tableId, 
        filename, 
        false, 
        useHeaderRow,
        settings.conditionalFormats || [],
        metadata,
        atomId,
        cardId,
        canvasPosition
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
    // BUT: Skip updateTable call if tableData is being updated (cell edits, etc.)
    // This prevents overwriting the updated tableData with stale data from updateTable
    if (settings.tableId && settings.tableData && !newSettings.tableData) {
      try {
        // Get card_id and canvas_position for pipeline tracking
        const cards = useLaboratoryStore.getState().cards;
        const card = cards.find(c => Array.isArray(c.atoms) && c.atoms.some(a => a.id === atomId));
        const cardId = card?.id || '';
        const canvasPosition = card?.canvas_position ?? 0;
        
        const updatedData = await updateTable(
          settings.tableId, 
          {
          visible_columns: newSettings.visibleColumns || settings.visibleColumns,
          column_order: newSettings.columnOrder || settings.columnOrder,
          filters: newSettings.filters || settings.filters,
          sort_config: newSettings.sortConfig || settings.sortConfig,
          show_row_numbers: newSettings.showRowNumbers ?? settings.showRowNumbers,
          show_summary_row: newSettings.showSummaryRow ?? settings.showSummaryRow,
          frozen_columns: newSettings.frozenColumns ?? settings.frozenColumns,
          row_height: newSettings.rowHeight || settings.rowHeight
        },
        atomId,
        cardId,
        canvasPosition
        );
        
        // ✅ Update tableData in settings (only if we didn't already update it above)
        updateSettings(atomId, { tableData: updatedData });
        
      } catch (err: any) {
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

  // Render table (like dataframe-operations)
  return (
    <div className="w-full h-full bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden flex flex-col">
      {fileSelected && hasRenderableData ? (
        <>
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
              settings={settings}
              cellStyles={cellStyles}
              onSettingsChange={handleSettingsChange}
              atomId={atomId}
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

