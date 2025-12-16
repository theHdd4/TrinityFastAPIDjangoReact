import React, { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertCircle, Save, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { KPIDashboardData, KPIDashboardSettings } from '../KPIDashboardAtom';
import { VALIDATE_API } from '@/lib/api';
import { loadTable, createBlankTable } from '@/components/AtomList/atoms/table/services/tableApi';
import GridSelector from '@/components/AtomList/atoms/table/components/GridSelector';
import ThemeSelector from '@/components/AtomList/atoms/table/components/design/ThemeSelector';
import { isNumericColumn } from '@/components/AtomList/atoms/table/utils/tableUtils';

interface Frame {
  object_name: string;
  arrow_name?: string;
  csv_name?: string;
}

interface KPIDashboardTableConfigProps {
  data: KPIDashboardData | null;
  settings: KPIDashboardSettings;
  onSettingsChange: (settings: Partial<KPIDashboardSettings>) => void;
}

const KPIDashboardTableConfig: React.FC<KPIDashboardTableConfigProps> = ({
  data,
  settings,
  onSettingsChange
}) => {
  const { toast } = useToast();
  
  // Find the selected table box
  const selectedTableBox = useMemo(() => {
    return settings.layouts?.flatMap(layout => layout.boxes)
      .find(box => box.id === settings.selectedBoxId && box.elementType === 'table');
  }, [settings.layouts, settings.selectedBoxId]);

  // Get table settings from the selected box or defaults
  const tableSettings = useMemo(() => {
    if (selectedTableBox?.tableSettings) {
      return selectedTableBox.tableSettings;
    }
    return {
      mode: 'blank' as 'load' | 'blank',
      tableId: undefined as string | undefined,
      tableData: undefined as any,
      sourceFile: undefined as string | undefined,
      visibleColumns: [] as string[],
      columnOrder: [] as string[],
      columnWidths: {} as Record<string, number>,
      rowHeight: 24,
      showRowNumbers: true,
      showSummaryRow: false,
      frozenColumns: 0,
      filters: {} as Record<string, any>,
      sortConfig: [] as Array<{column: string; direction: 'asc' | 'desc'}>,
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
        borderStyle: 'all' as 'all' | 'none' | 'outside' | 'horizontal' | 'vertical' | 'header',
      },
      totalRowConfig: {} as Record<string, 'sum' | 'average' | 'count' | 'min' | 'max' | 'none'>,
    };
  }, [selectedTableBox]);

  const [frames, setFrames] = useState<Frame[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>(tableSettings.sourceFile || '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [showSaveAsDialog, setShowSaveAsDialog] = useState(false);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const [saveFileName, setSaveFileName] = useState('');
  
  // Blank table state
  const [createBlankChecked, setCreateBlankChecked] = useState(false);
  const [gridRows, setGridRows] = useState(5);
  const [gridCols, setGridCols] = useState(5);
  const [manualRows, setManualRows] = useState(10);
  const [manualCols, setManualCols] = useState(5);
  const [creatingBlank, setCreatingBlank] = useState(false);
  const [showManualInputs, setShowManualInputs] = useState(false);

  // Fetch available dataframes
  useEffect(() => {
    fetch(`${VALIDATE_API}/list_saved_dataframes`)
      .then(r => r.json())
      .then(d => {
        const allFiles = Array.isArray(d.files) ? d.files : [];
        const arrowFiles = allFiles.filter((f: any) => 
          f.object_name && f.object_name.endsWith('.arrow')
        );
        setFrames(arrowFiles);
      })
      .catch((err) => {
        console.error('Failed to fetch dataframes:', err);
        setFrames([]);
      });
  }, []);

  // Update table settings in the selected box
  const updateTableSettings = (newSettings: Partial<typeof tableSettings>) => {
    if (!selectedTableBox) return;

    const updatedLayouts = settings.layouts?.map(layout => ({
      ...layout,
      boxes: layout.boxes.map(box =>
        box.id === settings.selectedBoxId
          ? {
              ...box,
              tableSettings: {
                ...tableSettings,
                ...newSettings,
              }
            }
          : box
      )
    }));

    onSettingsChange({ layouts: updatedLayouts });
  };

  // Load table from dataframe
  const handleFileSelect = async (fileId: string) => {
    if (!selectedTableBox) {
      toast({
        title: 'No Table Selected',
        description: 'Please select a table element in the canvas first',
        variant: 'destructive'
      });
      return;
    }

    setError(null);
    setSelectedFile(fileId);
    setLoading(true);

    try {
      const tableData = await loadTable(fileId);
      
      updateTableSettings({
        mode: 'load',
        sourceFile: fileId,
        tableId: tableData.table_id,
        tableData: tableData,
        visibleColumns: tableData.columns,
        columnOrder: tableData.columns,
      });

      toast({
        title: 'Success',
        description: 'Table loaded successfully',
      });
    } catch (err: any) {
      console.error('Error loading table:', err);
      setError(err.message || 'Failed to load table');
      toast({
        title: 'Error',
        description: err.message || 'Failed to load table',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  // Create blank table
  const handleCreateBlankTable = async () => {
    if (!selectedTableBox) {
      toast({
        title: 'No Table Selected',
        description: 'Please select a table element in the canvas first',
        variant: 'destructive'
      });
      return;
    }

    const rows = gridRows > 0 ? gridRows : manualRows;
    const cols = gridCols > 0 ? gridCols : manualCols;
    
    if (rows < 1 || cols < 1) {
      setError('Please enter valid dimensions (minimum 1×1)');
      return;
    }
    
    setCreatingBlank(true);
    setError(null);
    
    try {
      const useHeaderRow = tableSettings.layout?.headerRow || false;
      const blankTableData = await createBlankTable(rows, cols, useHeaderRow);
      
      const tableData = {
        table_id: blankTableData.table_id,
        columns: blankTableData.column_names || [],
        rows: [],
        row_count: rows,
        column_types: blankTableData.column_types || {},
      };

      updateTableSettings({
        mode: 'blank',
        tableId: blankTableData.table_id,
        tableData: tableData,
        blankTableConfig: {
          rows,
          columns: cols,
          columnNames: blankTableData.column_names,
          useHeaderRow: blankTableData.use_header_row || false,
          created: true
        },
        visibleColumns: blankTableData.column_names || [],
        columnOrder: blankTableData.column_names || [],
      });

      toast({
        title: 'Success',
        description: 'Blank table created successfully',
      });
    } catch (err: any) {
      console.error('Error creating blank table:', err);
      setError(err.message || 'Failed to create blank table');
      toast({
        title: 'Error',
        description: err.message || 'Failed to create blank table',
        variant: 'destructive'
      });
    } finally {
      setCreatingBlank(false);
    }
  };

  const handleGridSelect = (rows: number, cols: number) => {
    setGridRows(rows);
    setGridCols(cols);
  };

  // Handle setting changes
  const handleSettingChange = (key: string, value: any) => {
    updateTableSettings({ [key]: value });
  };

  const handleLayoutChange = (key: string, value: boolean) => {
    updateTableSettings({
      layout: {
        ...tableSettings.layout!,
        [key]: value,
      }
    });
  };

  const handleDesignChange = (key: string, value: any) => {
    updateTableSettings({
      design: {
        ...tableSettings.design!,
        [key]: value,
      }
    });
  };

  const handleTotalRowConfigChange = (column: string, aggType: string) => {
    updateTableSettings({
      totalRowConfig: {
        ...tableSettings.totalRowConfig!,
        [column]: aggType,
      }
    });
  };

  // If no table box is selected, show message
  if (!selectedTableBox) {
    return (
      <div className="space-y-2 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-xs text-muted-foreground text-center">
          Select a table element in the canvas to configure it
        </p>
      </div>
    );
  }

  const layout = tableSettings.layout || {
    headerRow: true,
    totalRow: false,
    bandedRows: false,
    bandedColumns: false,
    firstColumn: false,
    lastColumn: false,
  };
  const design = tableSettings.design || {
    theme: 'plain',
    borderStyle: 'all',
  };
  const totalRowConfig = tableSettings.totalRowConfig || {};
  const tableData = tableSettings.tableData;
  const visibleColumns = tableSettings.visibleColumns || [];

  return (
    <div className="space-y-4 p-2">
      {/* Data Source Selection - Show if no dataframe selected in Settings OR if table box is selected */}
      <Card className="p-4 space-y-3">
        <Label className="text-sm font-medium">Data Source</Label>
        <Select value={selectedFile} onValueChange={handleFileSelect} disabled={loading || !selectedTableBox}>
          <SelectTrigger className="bg-white border-gray-300">
            <SelectValue placeholder={selectedTableBox ? "Select a saved dataframe..." : "Select a table element first"} />
          </SelectTrigger>
          <SelectContent>
            {frames.length === 0 ? (
              <SelectItem value="no-data" disabled>
                No dataframes available
              </SelectItem>
            ) : (
              frames.map(f => (
                <SelectItem key={f.object_name} value={f.object_name}>
                  {f.arrow_name?.split('/').pop() || f.csv_name || f.object_name}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        {!selectedTableBox && (
          <p className="text-xs text-amber-600">
            Select a table element in the canvas to load data
          </p>
        )}
        {loading && (
          <p className="text-xs text-blue-600">Loading dataframe...</p>
        )}
        {error && (
          <p className="text-xs text-red-600">{error}</p>
        )}
      </Card>

      {/* Create Blank Table */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="createBlank"
            checked={createBlankChecked}
            onCheckedChange={(checked) => {
              setCreateBlankChecked(checked as boolean);
            }}
          />
          <Label htmlFor="createBlank" className="text-sm font-medium cursor-pointer">
            Create Blank Table
          </Label>
        </div>

        {createBlankChecked && (
          <div className="space-y-4 pt-3 border-t border-gray-200">
            <div>
              <h4 className="text-xs font-medium text-gray-700 mb-2">
                Quick Select (10×10 Grid)
              </h4>
              <p className="text-xs text-gray-500 mb-2">
                Click on the grid to select table dimensions
              </p>
              
              <div className="flex justify-center">
                <GridSelector
                  onSelect={handleGridSelect}
                  selectedRows={gridRows}
                  selectedCols={gridCols}
                />
              </div>

              <p className="text-xs text-center mt-2 font-medium text-teal-600">
                Selected: {gridRows} rows × {gridCols} columns
              </p>
            </div>

            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="showManualInputs"
                checked={showManualInputs}
                onCheckedChange={(checked) => setShowManualInputs(checked as boolean)}
              />
              <Label htmlFor="showManualInputs" className="text-xs cursor-pointer">
                Enter custom dimensions
              </Label>
            </div>

            {showManualInputs && (
              <div className="pt-3 border-t border-gray-200">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="manualRows" className="text-xs">
                      Rows
                    </Label>
                    <Input
                      id="manualRows"
                      type="number"
                      min="1"
                      max="1000"
                      value={manualRows}
                      onChange={(e) => setManualRows(parseInt(e.target.value) || 1)}
                      className="mt-1 text-sm"
                    />
                  </div>

                  <div>
                    <Label htmlFor="manualCols" className="text-xs">
                      Columns
                    </Label>
                    <Input
                      id="manualCols"
                      type="number"
                      min="1"
                      max="100"
                      value={manualCols}
                      onChange={(e) => setManualCols(parseInt(e.target.value) || 1)}
                      className="mt-1 text-sm"
                    />
                  </div>
                </div>

                <p className="text-xs text-center mt-2 text-gray-600">
                  Preview: {manualRows} rows × {manualCols} columns
                </p>
              </div>
            )}

            <Button
              onClick={handleCreateBlankTable}
              disabled={creatingBlank}
              className="w-full bg-teal-500 hover:bg-teal-600 text-white"
            >
              {creatingBlank ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Blank Table'
              )}
            </Button>
          </div>
        )}
      </Card>

      {/* Display Options - Only show if table is created */}
      {tableSettings.tableId && (
        <>
          <Card className="p-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">Display Options</h3>

            <div className="flex items-center justify-between">
              <Label htmlFor="showRowNumbers" className="text-sm">
                Show Row Numbers
              </Label>
              <Switch
                id="showRowNumbers"
                checked={tableSettings.showRowNumbers ?? true}
                onCheckedChange={(checked) => handleSettingChange('showRowNumbers', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="showSummaryRow" className="text-sm">
                Show Summary Row
              </Label>
              <Switch
                id="showSummaryRow"
                checked={tableSettings.showSummaryRow ?? false}
                onCheckedChange={(checked) => handleSettingChange('showSummaryRow', checked)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">
                Row Height: {tableSettings.rowHeight || 24}px
              </Label>
              <Slider
                min={18}
                max={48}
                step={3}
                value={[tableSettings.rowHeight || 24]}
                onValueChange={([value]) => handleSettingChange('rowHeight', value)}
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Rows per Page</Label>
              <select
                value={tableSettings.pageSize || 50}
                onChange={(e) => handleSettingChange('pageSize', parseInt(e.target.value))}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
              >
                <option value="25">25</option>
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
              </select>
            </div>
          </Card>

          {/* Layout Options */}
          <Card className="p-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">Layout Options</h3>

            <div className="flex items-center justify-between">
              <Label htmlFor="headerRow" className="text-sm">
                Header Row
              </Label>
              <Switch
                id="headerRow"
                checked={layout.headerRow}
                onCheckedChange={(checked) => handleLayoutChange('headerRow', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="totalRow" className="text-sm">
                Total Row
              </Label>
              <Switch
                id="totalRow"
                checked={layout.totalRow}
                onCheckedChange={(checked) => handleLayoutChange('totalRow', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="bandedRows" className="text-sm">
                Banded Rows
              </Label>
              <Switch
                id="bandedRows"
                checked={layout.bandedRows}
                onCheckedChange={(checked) => handleLayoutChange('bandedRows', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="bandedColumns" className="text-sm">
                Banded Columns
              </Label>
              <Switch
                id="bandedColumns"
                checked={layout.bandedColumns}
                onCheckedChange={(checked) => handleLayoutChange('bandedColumns', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="firstColumn" className="text-sm">
                First Column Emphasis
              </Label>
              <Switch
                id="firstColumn"
                checked={layout.firstColumn}
                onCheckedChange={(checked) => handleLayoutChange('firstColumn', checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="lastColumn" className="text-sm">
                Last Column Emphasis
              </Label>
              <Switch
                id="lastColumn"
                checked={layout.lastColumn}
                onCheckedChange={(checked) => handleLayoutChange('lastColumn', checked)}
              />
            </div>

            {/* Total Row Configuration */}
            {layout.totalRow && tableData && visibleColumns.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-200">
                <Label className="text-sm font-medium mb-2 block">Total Row Aggregations</Label>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {visibleColumns.map((column) => {
                    const isNumeric = tableData.rows && tableData.rows.length > 0 
                      ? isNumericColumn(tableData.rows, column)
                      : false;
                    const currentAgg = totalRowConfig[column] || 'none';
                    
                    return (
                      <div key={column} className="flex items-center justify-between">
                        <Label className="text-xs text-gray-600 flex-1 truncate mr-2">
                          {column}
                        </Label>
                        <select
                          value={currentAgg}
                          onChange={(e) => handleTotalRowConfigChange(column, e.target.value)}
                          className="text-xs px-2 py-1 border border-gray-300 rounded focus:ring-teal-500 focus:border-teal-500"
                          disabled={!isNumeric && currentAgg !== 'none' && currentAgg !== 'count'}
                        >
                          <option value="none">None</option>
                          {isNumeric && <option value="sum">Sum</option>}
                          {isNumeric && <option value="average">Average</option>}
                          <option value="count">Count</option>
                          {isNumeric && <option value="min">Min</option>}
                          {isNumeric && <option value="max">Max</option>}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Card>

          {/* Table Design */}
          <Card className="p-4 space-y-4">
            <h3 className="text-sm font-semibold text-gray-800">Table Design</h3>

            <div>
              <Label className="text-sm mb-2 block">Theme</Label>
              <ThemeSelector
                selectedTheme={design.theme}
                onThemeChange={(themeId) => handleDesignChange('theme', themeId)}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Border Style</Label>
              <select
                value={design.borderStyle}
                onChange={(e) => handleDesignChange('borderStyle', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-teal-500 focus:border-teal-500"
              >
                <option value="all">All Borders</option>
                <option value="none">No Borders</option>
                <option value="outside">Outside Only</option>
                <option value="horizontal">Horizontal Only</option>
                <option value="vertical">Vertical Only</option>
                <option value="header">Header Border Only</option>
              </select>
            </div>
          </Card>
        </>
      )}
    </div>
  );
};

export default KPIDashboardTableConfig;

