import React, { useState, useEffect } from 'react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import TableCanvas from './components/TableCanvas';
import TableToolbar from './components/TableToolbar';
import TablePagination from './components/TablePagination';
import { loadTable, updateTable, saveTable } from './services/tableApi';
import { Loader2, Save, AlertCircle } from 'lucide-react';
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

export interface TableSettings {
  mode?: 'load' | 'blank';
  sourceFile?: string;
  tableId?: string;
  tableData?: TableData;  // ✅ Store data in settings like dataframe-operations
  visibleColumns: string[];
  columnOrder: string[];
  columnWidths: Record<string, number>;
  rowHeight: number;
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
}

const DEFAULT_SETTINGS: TableSettings = {
  visibleColumns: [],
  columnOrder: [],
  columnWidths: {},
  rowHeight: 32,
  showRowNumbers: true,
  showSummaryRow: false,
  frozenColumns: 0,
  filters: {},
  sortConfig: [],
  currentPage: 1,
  pageSize: 15  // ✅ 15 rows per page
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
    ...baseSettings
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
  const { toast } = useToast();

  // Auto-load data ONLY if sourceFile exists but tableData doesn't (like dataframe-operations)
  useEffect(() => {
    const autoLoadData = async () => {
      if (settings.mode === 'load' && settings.sourceFile && !settings.tableData && !loading) {
        console.log('📊 [TABLE-ATOM] Auto-loading data from source:', settings.sourceFile);
        setLoading(true);
        setError(null);
        try {
          const data = await loadTable(settings.sourceFile);
          console.log('✅ [TABLE-ATOM] Data loaded:', data);
          
          // ✅ Store data in Zustand settings
          updateSettings(atomId, {
            tableData: data,
            tableId: data.table_id,
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
      
      // ✅ Store data in Zustand settings
      updateSettings(atomId, {
        tableData: data,
        tableId: data.table_id,
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
      const response = await saveTable(settings.tableId, settings.sourceFile, true);
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
      const filename = saveFileName.trim() || `table_${Date.now()}`;
      const response = await saveTable(settings.tableId, filename, false);
      
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
          <div className="px-4 py-2 border-b border-gray-200 bg-white flex items-center justify-end gap-2">
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

          {/* Table Canvas */}
          <div className="flex-1 overflow-hidden">
            <TableCanvas
              data={tableData}
              settings={{...settings, atomId}}
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

