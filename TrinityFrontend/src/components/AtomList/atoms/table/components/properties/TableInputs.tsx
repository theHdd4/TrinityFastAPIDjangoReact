import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { VALIDATE_API } from '@/lib/api';
import { loadTable, createBlankTable } from '../../services/tableApi';
import GridSelector from '../GridSelector';

interface Frame {
  object_name: string;
  arrow_name: string;
}

interface Props {
  atomId: string;
}

const TableInputs: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings = atom?.settings || {};

  const [frames, setFrames] = useState<Frame[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>(settings.sourceFile || '');
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

  // Fetch available dataframes
  useEffect(() => {
    fetch(`${VALIDATE_API}/list_saved_dataframes`)
      .then(r => r.json())
      .then(d => {
        const framesList = Array.isArray(d.files)
          ? d.files
              .filter((f: any) => !!f.arrow_name)
              .map((f: any) => ({ object_name: f.object_name, arrow_name: f.arrow_name }))
          : [];
        setFrames(framesList);
      })
      .catch((err) => {
        setFrames([]);
      });
  }, []);

  const handleFileSelect = async (fileId: string) => {
    setError(null);
    setSelectedFile(fileId);
    
    if (!fileId) {
      setError('Please select a valid file.');
      return;
    }

    setLoading(true);

    try {
      const data = await loadTable(fileId);

      const newSettings = {
        sourceFile: fileId,
        tableId: data.table_id,
        mode: 'load' as const,
        tableData: data,  // ✅ Store full data in settings!
        visibleColumns: data.columns,
        columnOrder: data.columns
      };

      // ✅ Store data in Zustand settings (like dataframe-operations)
      updateSettings(atomId, newSettings);

    } catch (err: any) {
      setError(err.message || 'Failed to load file');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateBlankTable = async () => {
    const rows = gridRows > 0 ? gridRows : manualRows;
    const cols = gridCols > 0 ? gridCols : manualCols;
    
    if (rows < 1 || cols < 1) {
      setError('Please enter valid dimensions (minimum 1×1)');
      return;
    }
    
    setCreatingBlank(true);
    setError(null);
    
    try {
      // Get current settings to check if header row is enabled
      const currentSettings = atom?.settings || {};
      const useHeaderRow = currentSettings.layout?.headerRow || false;
      
      const data = await createBlankTable(rows, cols, useHeaderRow);

      // ✅ Create tableData structure and store in settings
      // Note: column_names are internal identifiers (col_0, col_1, etc.), not displayed
      const blankTableData = {
        table_id: data.table_id,
        columns: data.column_names || [], // Internal identifiers only
        rows: [], // Blank table starts empty - will be populated as cells are edited
        row_count: rows,
        column_types: data.column_types || {},
      };

      const newSettings = {
        tableId: data.table_id,
        mode: 'blank' as const,
        tableData: blankTableData,  // ✅ Store data in settings!
        blankTableConfig: {
          rows,
          columns: cols,
          columnNames: data.column_names, // Internal identifiers
          useHeaderRow: data.use_header_row || false,
          created: true
        },
        visibleColumns: data.column_names || [], // For internal use
        columnOrder: data.column_names || [],
        // Ensure header row is OFF by default for blank tables
        layout: {
          ...(currentSettings.layout || {}),
          headerRow: data.use_header_row || false,
        }
      };

      // Update atom settings with data
      updateSettings(atomId, newSettings);

    } catch (err: any) {
      setError(err.message || 'Failed to create blank table');
    } finally {
      setCreatingBlank(false);
    }
  };

  const handleGridSelect = (rows: number, cols: number) => {
    setGridRows(rows);
    setGridCols(cols);
  };

  return (
    <div className="space-y-4 p-2">
      {/* Card 1: Select DataFrame */}
      <Card className="p-4 space-y-3">
        <label className="text-sm font-medium text-gray-700 block">
          Data Source
        </label>
        <Select value={selectedFile} onValueChange={handleFileSelect}>
          <SelectTrigger className="bg-white border-gray-300">
            <SelectValue placeholder="Choose a saved dataframe..." />
          </SelectTrigger>
          <SelectContent>
            {frames.map(f => (
              <SelectItem key={f.object_name} value={f.object_name}>
                {f.arrow_name.split('/').pop()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {loading && (
          <div className="text-xs text-gray-600">Loading data...</div>
        )}
        
        {error && (
          <div className="text-red-600 text-xs p-2">{error}</div>
        )}
      </Card>

      {/* Card 2: Create Blank Table */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="createBlank"
            checked={createBlankChecked}
            onCheckedChange={(checked) => {
              setCreateBlankChecked(checked as boolean);
            }}
          />
          <label
            htmlFor="createBlank"
            className="text-sm font-medium text-gray-700 cursor-pointer"
          >
            Create Blank Table
          </label>
        </div>

        {/* Collapsible content - shows when checkbox is checked */}
        {createBlankChecked && (
          <div className="space-y-4 pt-3 border-t border-gray-200">
            {/* Grid Selector */}
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

            {/* Checkbox to show manual inputs */}
            <div className="flex items-center space-x-2 pt-2">
              <Checkbox
                id="showManualInputs"
                checked={showManualInputs}
                onCheckedChange={(checked) => setShowManualInputs(checked as boolean)}
              />
              <label
                htmlFor="showManualInputs"
                className="text-xs text-gray-700 cursor-pointer"
              >
                Enter custom dimensions
              </label>
            </div>

            {/* Manual Input - Only shown when checkbox is checked */}
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

            {/* Create Button */}
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
};

export default TableInputs;

