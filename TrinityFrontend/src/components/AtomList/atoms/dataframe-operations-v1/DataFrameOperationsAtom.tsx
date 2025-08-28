import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import DataFrameOperationsCanvas from './components/DataFrameOperationsCanvas';
import DataFrameOperationsSettings from './components/DataFrameOperationsSettings';
import DataFrameOperationsVisualisation from './components/DataFrameOperationsVisualisation';
import DataFrameOperationsExhibition from './components/DataFrameOperationsExhibition';
import {
  useLaboratoryStore,
  DEFAULT_FEATURE_OVERVIEW_SETTINGS,
} from '@/components/LaboratoryMode/store/laboratoryStore';
import { Button } from '@/components/ui/button';
import ErrorBoundary from '@/components/ErrorBoundary';

export interface DataFrameRow {
  [key: string]: string | number | null;
}

export interface DataFrameData {
  headers: string[];
  rows: DataFrameRow[];
  fileName: string;
  columnTypes: { [key: string]: 'text' | 'number' | 'date' };
  pinnedColumns: string[];
  frozenColumns: number;
  cellColors: { [key: string]: string }; // key format: "row-col"
}

export interface DataFrameSettings {
  rowsPerPage: number;
  searchTerm: string;
  sortColumns: Array<{ column: string; direction: 'asc' | 'desc' }>;
  filters: { [key: string]: any };
  selectedColumns: string[];
  showRowNumbers: boolean;
  enableEditing: boolean;
  uploadedFile?: string; // Added for file upload
  selectedFile?: string; // Added for file selection
  tableData?: DataFrameData; // Added for table data
  fileId?: string | null; // Persist backend dataframe id
  columnWidths: { [key: string]: number };
  rowHeights: { [key: number]: number };
  rendered?: boolean;
}

interface Props {
  atomId: string;
}

const DataFrameOperationsAtom: React.FC<Props> = ({ atomId }) => {
  const cards = useLaboratoryStore(state => state.cards);
  const atom = cards.flatMap(card => card.atoms).find(a => a.id === atomId);
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings: DataFrameSettings = atom?.settings || {
    rowsPerPage: 15,
    searchTerm: '',
    sortColumns: [],
    filters: {},
    selectedColumns: [],
    showRowNumbers: true,
    enableEditing: true,
    fileId: null,
    columnWidths: {},
    rowHeights: {},
    rendered: false,
  };
  // Always use tableData as the source of truth
  const data = settings.tableData || null;

  // 1. Store the original uploaded data
  const [originalData, setOriginalData] = useState<DataFrameData | null>(null);
  useEffect(() => {
    if (data && !originalData) {
      setOriginalData(JSON.parse(JSON.stringify(data)));
    }
  }, [data, originalData]);
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');
  const [chartConfig, setChartConfig] = useState<any>(null);

  // Update handleDataUpload to always set selectedColumns to newData.headers
  const handleDataUpload = (newData: DataFrameData, backendFileId?: string) => {
    setOriginalData(JSON.parse(JSON.stringify(newData)));
    const newSettings: DataFrameSettings = {
      ...settings,
      selectedColumns: newData.headers,
      searchTerm: '',
      filters: {},
      fileId: backendFileId || settings.fileId || null,
      columnWidths: {},
      rowHeights: {},
    };
    updateSettings(atomId, newSettings);
  };

  // In handleSettingsChange, update settings without overwriting tableData
  const handleSettingsChange = (newSettings: Partial<DataFrameSettings>) => {
    const current = useLaboratoryStore.getState().getAtom(atomId)?.settings as DataFrameSettings;
    let mergedSettings = { ...(current || {}), ...newSettings };
    if ("filters" in newSettings) {
      mergedSettings.filters = newSettings.filters;
    }
    if (current?.tableData && (!mergedSettings.selectedColumns || mergedSettings.selectedColumns.length === 0)) {
      mergedSettings.selectedColumns = current.tableData.headers;
    }
    updateSettings(atomId, mergedSettings);
  };

  // In handleDataChange, always update tableData and selectedColumns
  const handleDataChange = (newData: DataFrameData) => {
    const clonedData = JSON.parse(JSON.stringify(newData));
    const current = useLaboratoryStore.getState().getAtom(atomId)?.settings as DataFrameSettings;
    updateSettings(atomId, {
      ...(current || {}),
      tableData: clonedData,
      selectedColumns: [...clonedData.headers],
    });
  };

  // 2. Update Reset button handler to restore original data and settings
  const handleReset = () => {
    if (originalData) {
      updateSettings(atomId, {
        ...settings,
        tableData: JSON.parse(JSON.stringify(originalData)),
        data: JSON.parse(JSON.stringify(originalData)),
        selectedColumns: originalData.headers,
        searchTerm: '',
        filters: {},
        sortColumns: [],
        rowsPerPage: 15,
        showRowNumbers: true,
        enableEditing: true,
        columnWidths: {},
        rowHeights: {},
      });
    }
  };

  // Only show table/chart after file selection (like concat atom)
  const fileSelected = settings.selectedFile;

  return (
    <ErrorBoundary>
      <div className="w-full h-full bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden flex flex-col min-h-0">
        <div className="h-full flex flex-col min-h-0">
          {fileSelected && settings.rendered && data && data.headers && data.rows && data.headers.length > 0 && data.rows.length > 0 ? (
            <div className="h-full flex flex-col min-h-0">
              {viewMode === 'table' && (
                <DataFrameOperationsCanvas
                  data={data}
                  settings={settings}
                  onSettingsChange={handleSettingsChange}
                  onDataUpload={handleDataUpload}
                  onDataChange={handleDataChange}
                  onClearAll={handleReset}
                  fileId={settings.fileId || null}
                  originalData={originalData}
                />
              )}
              {viewMode === 'chart' && chartConfig && (
                <div className="flex items-center justify-center h-full text-gray-800 text-lg font-semibold">
                  [Chart will be rendered here]
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 w-full h-full flex items-center justify-center">
              <Card>
                <CardContent className="p-4">
                  <p className="text-gray-500">
                    {!fileSelected
                      ? 'No DataFrame available. Upload a CSV or Excel file to see results here.'
                      : 'Select a dataframe and click "Render DataFrame" in the Properties panel.'}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default DataFrameOperationsAtom;