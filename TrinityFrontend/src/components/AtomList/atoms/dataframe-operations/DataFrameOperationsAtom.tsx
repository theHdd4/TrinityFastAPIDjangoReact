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
import { loadDataframeByKey } from './services/dataframeOperationsApi';

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
  const [loading, setLoading] = useState(false);

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
        enableEditing: true
      });
    }
  };

  // Only show table/chart after file selection (like concat atom)
  const fileSelected = settings.selectedFile;

  // Automatically load dataframe if a file is selected but no table data exists
  useEffect(() => {
    if (!settings.selectedFile || settings.tableData || loading) return;
    setLoading(true);
    loadDataframeByKey(settings.selectedFile)
      .then(resp => {
        const columnTypes: Record<string, string> = {};
        resp.headers.forEach(h => {
          const t = resp.types[h];
          columnTypes[h] = t.includes('float') || t.includes('int') ? 'number' : 'text';
        });
        const fileName = settings.selectedFile!.split('/').pop() || settings.selectedFile!;
        const newData: DataFrameData = {
          headers: resp.headers,
          rows: resp.rows,
          fileName,
          columnTypes,
          pinnedColumns: [],
          frozenColumns: 0,
          cellColors: {},
        };
        updateSettings(atomId, {
          tableData: newData,
          selectedColumns: resp.headers,
          fileId: resp.df_id,
        });
      })
      .catch(err => console.error('[DataFrameOperations] auto-load failed', err))
      .finally(() => setLoading(false));
  }, [settings.selectedFile, settings.tableData, loading, atomId, updateSettings]);


  return (
    <ErrorBoundary>
      <div className="w-full h-full bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden">
        <div className="h-full">
          {fileSelected && data && data.headers && data.rows && data.headers.length > 0 && data.rows.length > 0 ? (
            <div className="h-full">
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