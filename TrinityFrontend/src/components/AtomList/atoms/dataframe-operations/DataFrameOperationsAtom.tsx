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
    };
    updateSettings(atomId, newSettings);
  };

  // In handleSettingsChange, always update tableData and selectedColumns if headers are present
  const handleSettingsChange = (newSettings: Partial<DataFrameSettings>) => {
    let mergedSettings = { ...settings, ...newSettings };
    if ('filters' in newSettings) {
      // If filters is present, fully replace it (do not merge with old filters)
      mergedSettings.filters = newSettings.filters;
    }
    if (data && (!mergedSettings.selectedColumns || mergedSettings.selectedColumns.length === 0)) {
      mergedSettings.selectedColumns = data.headers;
    }
    // Always update tableData if data is present
    if (data) {
      mergedSettings.tableData = data;
    }
    updateSettings(atomId, mergedSettings);
  };

  // In handleDataChange, always update tableData and selectedColumns
  const handleDataChange = (newData: DataFrameData, newFileId?: string) => {
    // Deep clone to ensure new references for Zustand/React
    const clonedData = JSON.parse(JSON.stringify(newData));
    // Merge with existing settings to preserve properties like selectedFile
    updateSettings(atomId, {
      ...settings,
      tableData: clonedData,
      selectedColumns: [...clonedData.headers],
      fileId: newFileId || settings.fileId || null,
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
        enableEditing: true
      });
    }
  };

  // Only show table/chart after file selection (like concat atom)
  const fileSelected = settings.selectedFile;


  return (
    <ErrorBoundary>
      <div className="w-full h-full bg-gradient-to-br from-green-50 via-white to-green-50 rounded-xl border border-green-200 shadow-lg overflow-hidden">
        <div className="h-full">
          {fileSelected && data && data.headers && data.rows && data.headers.length > 0 && data.rows.length > 0 ? (
            <div className="h-full">
              {/* File name above the table, small font */}
              <div className="px-6 pt-2 pb-1">
                <span className="text-xs font-medium text-gray-600" style={{ fontSize: '0.85rem' }}>{data.fileName}</span>
              </div>
              {viewMode === 'table' && (
                <DataFrameOperationsCanvas 
                  data={data} 
                  settings={settings}
                  onSettingsChange={handleSettingsChange}
                  onDataUpload={handleDataUpload}
                  onDataChange={handleDataChange}
                  onClearAll={handleReset}
                  fileId={settings.fileId || null}
                />
              )}
              {viewMode === 'chart' && chartConfig && (
                <div className="flex items-center justify-center h-full text-green-800 text-lg font-semibold">
                  [Chart will be rendered here]
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 w-full h-full flex items-center justify-center">
              <Card>
                <CardContent className="p-4">
                  <p className="text-gray-500">No DataFrame available. Upload a CSV or Excel file to see results here.</p>
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