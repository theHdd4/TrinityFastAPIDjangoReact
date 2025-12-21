import React, { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import type { KPIDashboardData, KPIDashboardSettings } from '../KPIDashboardAtom';
import { VALIDATE_API } from '@/lib/api';
import { loadTable, createBlankTable, aggregateTable } from '@/components/AtomList/atoms/table/services/tableApi';
import GridSelector from '@/components/AtomList/atoms/table/components/GridSelector';
import ThemeSelector from '@/components/AtomList/atoms/table/components/design/ThemeSelector';
import RowHeightControl from '@/components/AtomList/atoms/table/components/RowHeightControl';
import RuleList from '@/components/AtomList/atoms/table/components/conditional-formatting/RuleList';
import RuleBuilder from '@/components/AtomList/atoms/table/components/conditional-formatting/RuleBuilder';
import { ConditionalFormatRule } from '@/components/AtomList/atoms/table/components/conditional-formatting/types';
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
      // Ensure rowHeight is set properly (handle legacy data or missing values)
      const settings = { ...selectedTableBox.tableSettings };
      // If rowHeight is missing, undefined, 0, or less than 18px, set default
      // Default: 30px (10 units) for blank tables, 24px (8 units) for load mode
      if (!settings.rowHeight || settings.rowHeight < 18) {
        const mode = settings.mode || 'blank';
        settings.rowHeight = mode === 'blank' ? 30 : 24;
      }
      return settings;
    }
    return {
      mode: 'blank' as 'load' | 'blank',
      tableId: undefined as string | undefined,
      tableData: undefined as any,
      sourceFile: undefined as string | undefined,
      visibleColumns: [] as string[],
      columnOrder: [] as string[],
      columnWidths: {} as Record<string, number>,
      rowHeight: 30, // Default: 30px (10 units) for blank tables
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
      showCardinalityView: false,
      conditionalFormats: [] as ConditionalFormatRule[],
    };
  }, [selectedTableBox]);

  const [frames, setFrames] = useState<Frame[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>(tableSettings.sourceFile || '');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Blank table state
  const [createBlankChecked, setCreateBlankChecked] = useState(false);
  const [gridRows, setGridRows] = useState(5);
  const [gridCols, setGridCols] = useState(5);
  const [manualRows, setManualRows] = useState(10);
  const [manualCols, setManualCols] = useState(5);
  const [creatingBlank, setCreatingBlank] = useState(false);
  const [showManualInputs, setShowManualInputs] = useState(false);

  // Conditional Formatting state
  const [showRuleBuilder, setShowRuleBuilder] = useState(false);
  const [editingRule, setEditingRule] = useState<ConditionalFormatRule | undefined>(undefined);

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

  // Migrate legacy rowHeight values (handle missing or invalid rowHeight)
  useEffect(() => {
    if (selectedTableBox?.tableSettings && tableSettings.tableId) {
      const currentHeight = tableSettings.rowHeight;
      // If rowHeight is missing, undefined, 0, or less than 18px, set default
      if (!currentHeight || currentHeight < 18) {
        const mode = tableSettings.mode || 'blank';
        const defaultHeight = mode === 'blank' ? 30 : 24;
        updateTableSettings({ rowHeight: defaultHeight });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTableBox?.tableSettings?.tableId, tableSettings.rowHeight, tableSettings.mode, selectedTableBox]);

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
        rowHeight: tableSettings.rowHeight || 24, // Default: 24px (8 units) for load mode
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

    const rows = showManualInputs ? manualRows : gridRows;
    const cols = showManualInputs ? manualCols : gridCols;
    
    if (rows < 1 || cols < 1) {
      setError('Please enter valid dimensions (minimum 1×1)');
      return;
    }
    
    setCreatingBlank(true);
    setError(null);
    
    try {
      const useHeaderRow = tableSettings.layout?.headerRow || false;
      const blankTableData = await createBlankTable(rows, cols, useHeaderRow);
      
      // CRITICAL: For blank tables, rows array should be empty initially
      // BlankTableCanvas manages cell values in its own state (cellValues)
      // The rows array will be populated as cells are edited and saved
      const tableData = {
        table_id: blankTableData.table_id,
        columns: blankTableData.column_names || [],
        rows: [], // Empty initially - BlankTableCanvas uses cellValues state for editing
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
        rowHeight: 30, // Default: 30px (10 units) for blank tables
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

  // Track previous theme to detect changes
  const prevThemeRef = React.useRef<string>(tableSettings.design?.theme || 'plain');

  const handleDesignChange = (key: string, value: any) => {
    const newDesign = {
      ...tableSettings.design!,
      [key]: value,
    };
    
    updateTableSettings({
      design: newDesign
    });

    // Auto-enable banded rows when theme changes from 'plain' to any other theme
    if (key === 'theme' && prevThemeRef.current === 'plain' && value !== 'plain') {
      if (!tableSettings.layout?.bandedRows) {
        updateTableSettings({
          layout: {
            ...tableSettings.layout!,
            bandedRows: true,
          }
        });
      }
    }
    
    // Update ref for next comparison
    if (key === 'theme') {
      prevThemeRef.current = value;
    }
  };

  // Update ref when design.theme changes externally
  useEffect(() => {
    prevThemeRef.current = tableSettings.design?.theme || 'plain';
  }, [tableSettings.design?.theme]);

  // Handle total row config change with API call
  const handleTotalRowConfigChange = async (column: string, aggType: string) => {
    const newTotalRowConfig = {
      ...tableSettings.totalRowConfig!,
      [column]: aggType,
    };
    
    updateTableSettings({
      totalRowConfig: newTotalRowConfig,
    });

    // If Total Row is enabled, call API to calculate aggregations on all rows
    if (tableSettings.layout?.totalRow && tableSettings.tableId && tableSettings.tableData) {
      try {
        // Build aggregations object for all columns with non-'none' aggregations
        const aggregations: Record<string, string[]> = {};
        Object.entries(newTotalRowConfig).forEach(([col, agg]) => {
          if (agg !== 'none' && typeof agg === 'string') {
            aggregations[col] = [agg];
          }
        });

        // Only call API if there are aggregations to calculate
        if (Object.keys(aggregations).length > 0) {
          const result = await aggregateTable(tableSettings.tableId, aggregations);
          
          // Store aggregation results in settings for display
          updateTableSettings({
            totalRowAggregations: result,
          });

          toast({
            title: 'Aggregations Calculated',
            description: 'Total row values updated based on all table rows',
          });
        }
      } catch (error: any) {
        console.error('Failed to calculate aggregations:', error);
        toast({
          title: 'Error',
          description: error.message || 'Failed to calculate aggregations',
          variant: 'destructive',
        });
      }
    }
  };

  // Conditional Formatting handlers
  const conditionalFormats = tableSettings.conditionalFormats || [];
  
  const handleRuleAdd = (rule: ConditionalFormatRule) => {
    const newRules = [...conditionalFormats, rule];
    updateTableSettings({ conditionalFormats: newRules });
    setShowRuleBuilder(false);
    setEditingRule(undefined);
  };

  const handleRuleEdit = (rule: ConditionalFormatRule) => {
    setEditingRule(rule);
    setShowRuleBuilder(true);
  };

  const handleRuleDelete = (ruleId: string) => {
    const newRules = conditionalFormats.filter(r => r.id !== ruleId);
    updateTableSettings({ conditionalFormats: newRules });
  };

  const handleRuleToggle = (ruleId: string) => {
    const newRules = conditionalFormats.map(r =>
      r.id === ruleId ? { ...r, enabled: !r.enabled } : r
    );
    updateTableSettings({ conditionalFormats: newRules });
  };

  const handleRuleSave = (rule: ConditionalFormatRule) => {
    if (editingRule) {
      // Update existing rule
      const newRules = conditionalFormats.map(r =>
        r.id === editingRule.id ? rule : r
      );
      updateTableSettings({ conditionalFormats: newRules });
    } else {
      // Add new rule
      handleRuleAdd(rule);
    }
    setShowRuleBuilder(false);
    setEditingRule(undefined);
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
  const mode = tableSettings.mode || 'blank';
  const isLoadMode = mode === 'load';
  const isBlankMode = mode === 'blank';

  // Only show settings if table is created
  if (!tableSettings.tableId) {
    return (
      <div className="space-y-4 p-2">
        {/* ========== INPUTS SECTION ========== */}
        
        {/* Data Source */}
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
          {loading && (
            <p className="text-xs text-blue-600">Loading dataframe...</p>
          )}
          {error && (
            <p className="text-xs text-red-600">{error}</p>
          )}
        </Card>

        {/* Show Cardinality View - Only for load mode */}
        {isLoadMode && tableSettings.sourceFile && (
          <Card className="p-4 space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="cardinality-toggle"
                checked={tableSettings.showCardinalityView || false}
                onCheckedChange={(checked) => {
                  updateTableSettings({ showCardinalityView: !!checked });
                }}
              />
              <Label
                htmlFor="cardinality-toggle"
                className="text-sm font-medium cursor-pointer"
              >
                Show Cardinality View
              </Label>
            </div>
          </Card>
        )}

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
                {creatingBlank ? 'Creating...' : 'Create Blank Table'}
              </Button>
            </div>
          )}
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* 0. CARDINALITY VIEW - Only for load mode when dataframe is loaded */}
      {isLoadMode && tableSettings.sourceFile && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="cardinality-toggle-settings"
              checked={tableSettings.showCardinalityView || false}
              onCheckedChange={(checked) => {
                updateTableSettings({ showCardinalityView: !!checked });
              }}
            />
            <Label
              htmlFor="cardinality-toggle-settings"
              className="text-sm font-medium cursor-pointer"
            >
              Show Cardinality View
            </Label>
          </div>
        </Card>
      )}

      {/* 1. DISPLAY OPTIONS */}
      <Card className="p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Display Options</h3>

        {/* Row Height */}
        <RowHeightControl
          value={tableSettings.rowHeight || (isBlankMode ? 30 : 24)}
          onChange={(value) => handleSettingChange('rowHeight', value)}
        />
      </Card>

      {/* 2. TABLE DESIGN */}
      <Card className="p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Table Design</h3>

        {/* Theme Selector */}
        <div>
          <Label className="text-sm mb-2 block">Theme</Label>
          <ThemeSelector
            selectedTheme={design.theme}
            onThemeChange={(themeId) => handleDesignChange('theme', themeId)}
          />
        </div>

        {/* Border Style */}
        <div className="space-y-2">
          <Label className="text-sm">Border Style</Label>
          <select
            value={typeof design.borderStyle === 'string' ? design.borderStyle : 'all'}
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

      {/* 3. LAYOUT OPTIONS */}
      <Card className="p-4 space-y-4">
        <h3 className="text-sm font-semibold text-gray-800">Layout Options</h3>

        {/* Both Modes: Banded Rows */}
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

        {/* Both Modes: Banded Columns */}
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

        {/* Blank Table Mode Only: Header Row */}
        {isBlankMode && (
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
        )}

        {/* Blank Table Mode Only: Total Row */}
        {isBlankMode && (
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
        )}

        {/* Blank Table Mode Only: First Column Emphasis */}
        {isBlankMode && (
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
        )}

        {/* Blank Table Mode Only: Last Column Emphasis */}
        {isBlankMode && (
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
        )}

        {/* Total Row Aggregations - Only for Blank Table Mode when Total Row is enabled */}
        {isBlankMode && layout.totalRow && tableData && visibleColumns.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <Label className="text-sm font-medium mb-2 block">Total Row Aggregations</Label>
            <p className="text-xs text-gray-500 mb-3">
              Aggregations are calculated using all rows in the table
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {visibleColumns.map((column, colIdx) => {
                // When header row is ON, use first row cell value as display name and config key
                // Otherwise use column ID (col_0, col_1, etc.)
                const headerRowValue = layout.headerRow && tableData.rows?.[0]?.[column] 
                  ? String(tableData.rows[0][column]).trim() 
                  : null;
                const displayName = headerRowValue && headerRowValue !== '' 
                  ? headerRowValue 
                  : column;
                const configKey = layout.headerRow && headerRowValue && headerRowValue !== ''
                  ? headerRowValue
                  : column;
                
                // For numeric check, use data rows (skip header row if present)
                const dataRows = layout.headerRow && tableData.rows.length > 0
                  ? tableData.rows.slice(1)
                  : (tableData.rows || []);
                const isNumeric = dataRows.length > 0 
                  ? isNumericColumn(dataRows, column)
                  : false;
                const currentAgg = totalRowConfig[configKey] || 'none';
                
                return (
                  <div key={column} className="flex items-center justify-between">
                    <Label className="text-xs text-gray-600 flex-1 truncate mr-2" title={column}>
                      {displayName}
                    </Label>
                    <select
                      value={currentAgg}
                      onChange={(e) => handleTotalRowConfigChange(configKey, e.target.value)}
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

      {/* 4. CONDITIONAL FORMATTING */}
      <Card className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">Conditional Formatting</h3>
          <Button
            onClick={() => {
              setEditingRule(undefined);
              setShowRuleBuilder(true);
            }}
            size="sm"
            variant="outline"
            className="text-xs"
          >
            Add Rule
          </Button>
        </div>

        <RuleList
          rules={conditionalFormats}
          onEdit={handleRuleEdit}
          onDelete={handleRuleDelete}
          onToggle={handleRuleToggle}
        />
      </Card>

      {/* Rule Builder Dialog - Conditionally rendered */}
      {showRuleBuilder && (
        <RuleBuilder
          columns={visibleColumns}
          onSave={handleRuleSave}
          onCancel={() => {
            setShowRuleBuilder(false);
            setEditingRule(undefined);
          }}
          existingRule={editingRule}
        />
      )}
    </div>
  );
};

export default KPIDashboardTableConfig;
