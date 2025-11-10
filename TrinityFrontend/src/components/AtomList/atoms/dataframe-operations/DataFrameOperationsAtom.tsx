import React, { useState, useEffect } from 'react';
import DataFrameOperationsCanvas from './components/DataFrameOperationsCanvas';
import {
  useLaboratoryStore,
  PivotTableSettings as PivotSettings,
  DEFAULT_PIVOT_TABLE_SETTINGS,
} from '@/components/LaboratoryMode/store/laboratoryStore';
import ErrorBoundary from '@/components/ErrorBoundary';
import { loadDataframeByKey } from './services/dataframeOperationsApi';
import { Table } from 'lucide-react';

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
  hiddenColumns: string[]; // Array of hidden column names
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
  columnFormulas: Record<string, string>;
  pivotSettings: PivotSettings;
}

interface Props {
  atomId: string;
}

const DataFrameOperationsAtom: React.FC<Props> = ({ atomId }) => {
  const cards = useLaboratoryStore(state => state.cards);
  const atom = cards.flatMap(card => card.atoms).find(a => a.id === atomId);
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const baseSettings = (atom?.settings as Partial<DataFrameSettings> | undefined) || {};
  const settings: DataFrameSettings = {
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
    ...baseSettings,
    columnFormulas: baseSettings.columnFormulas || {},
    pivotSettings: {
      ...DEFAULT_PIVOT_TABLE_SETTINGS,
      ...(baseSettings.pivotSettings || {}),
    },
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
  
  // Update originalData when data changes (e.g., after save with deletions)
  useEffect(() => {
    if (data && originalData && data.rows.length !== originalData.rows.length) {
      setOriginalData(JSON.parse(JSON.stringify(data)));
    }
  }, [data, originalData]);
  const [viewMode, setViewMode] = useState<'table' | 'chart'>('table');
  const [chartConfig, setChartConfig] = useState<any>(null);

  // Update handleDataUpload to always set selectedColumns to newData.headers
  const handleDataUpload = (newData: DataFrameData, backendFileId?: string) => {
    setOriginalData(JSON.parse(JSON.stringify(newData)));
    const resolvedDataSource =
      backendFileId ??
      settings.selectedFile ??
      (settings.pivotSettings?.dataSource ?? '');
    const pivotDefaults: PivotSettings = {
      ...DEFAULT_PIVOT_TABLE_SETTINGS,
      ...(settings.pivotSettings || {}),
      dataSource: resolvedDataSource,
      dataSourceColumns: newData.headers,
      fields: newData.headers,
      selectedFields: newData.headers,
      rowFields: [],
      columnFields: [],
      filterFields: [],
      valueFields: [],
      pivotResults: [],
      pivotStatus: 'idle',
      pivotError: null,
      pivotRowCount: 0,
      pivotFilterOptions: {},
      pivotFilterSelections: {},
      collapsedKeys: [],
    };

    const newSettings: DataFrameSettings = {
      ...settings,
      selectedColumns: newData.headers,
      searchTerm: '',
      filters: {},
      fileId: backendFileId || settings.fileId || null,
      columnWidths: {},
      rowHeights: {},
      columnFormulas: {},
      pivotSettings: pivotDefaults,
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
    const mergedPivot: PivotSettings = {
      ...DEFAULT_PIVOT_TABLE_SETTINGS,
      ...((current?.pivotSettings as PivotSettings) || {}),
      dataSource: (current?.pivotSettings as PivotSettings)?.dataSource ?? '',
      dataSourceColumns: clonedData.headers,
      fields: clonedData.headers,
      selectedFields: clonedData.headers,
    };

    updateSettings(atomId, {
      ...(current || {}),
      tableData: clonedData,
      selectedColumns: [...clonedData.headers],
      pivotSettings: mergedPivot,
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
        columnFormulas: {},
        pivotSettings: {
          ...DEFAULT_PIVOT_TABLE_SETTINGS,
          ...(settings.pivotSettings || {}),
          dataSource: settings.pivotSettings?.dataSource ?? settings.selectedFile ?? '',
          dataSourceColumns: originalData.headers,
          fields: originalData.headers,
          selectedFields: originalData.headers,
          rowFields: [],
          columnFields: [],
          filterFields: [],
          valueFields: [],
          pivotResults: [],
          pivotStatus: 'idle',
          pivotError: null,
          pivotRowCount: 0,
          pivotFilterOptions: {},
          pivotFilterSelections: {},
          collapsedKeys: [],
        },
      });
    }
  };

  // Only show table/chart after file selection (like concat atom)
  const fileSelected = settings.selectedFile;
  const hasRenderableData = Boolean(
    data && Array.isArray(data.headers) && data.headers.length > 0 && Array.isArray(data.rows)
  );

  // Automatically load dataframe if a file is selected but no table data exists
  useEffect(() => {
    if (!settings.selectedFile || settings.tableData || loading) return;
    setLoading(true);
    loadDataframeByKey(settings.selectedFile)
      .then(resp => {
        const columnTypes: Record<string, 'text' | 'number' | 'date'> = {};
        resp.headers.forEach(h => {
          const rawType = resp.types[h];
          const normalized = (typeof rawType === 'string' ? rawType : String(rawType || '')).toLowerCase();
          if (['float', 'double', 'int', 'decimal', 'numeric', 'number'].some(token => normalized.includes(token))) {
            columnTypes[h] = 'number';
          } else if (['datetime', 'date', 'time', 'timestamp'].some(token => normalized.includes(token))) {
            columnTypes[h] = 'date';
          } else {
            columnTypes[h] = 'text';
          }
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
          hiddenColumns: [],
        };
        updateSettings(atomId, {
          tableData: newData,
          selectedColumns: resp.headers,
          fileId: resp.df_id,
          pivotSettings: {
            ...DEFAULT_PIVOT_TABLE_SETTINGS,
            ...(settings.pivotSettings || {}),
            dataSource:
              settings.selectedFile ??
              resp.df_id ??
              settings.pivotSettings?.dataSource ??
              '',
            dataSourceColumns: resp.headers,
            fields: resp.headers,
            selectedFields: resp.headers,
            rowFields: [],
            columnFields: [],
            filterFields: [],
            valueFields: [],
            pivotResults: [],
            pivotStatus: 'idle',
            pivotError: null,
            pivotRowCount: 0,
            pivotFilterOptions: {},
            pivotFilterSelections: {},
            collapsedKeys: [],
          },
        });
      })
      .catch(err => console.error('[DataFrameOperations] auto-load failed', err))
      .finally(() => setLoading(false));
  }, [settings.selectedFile, settings.tableData, loading, atomId, updateSettings]);


  return (
    <ErrorBoundary>
      <div className="w-full h-full bg-white rounded-xl border border-slate-200 shadow-lg overflow-hidden flex flex-col">
        {fileSelected && hasRenderableData ? (
          <>
            {viewMode === 'table' && (
              <DataFrameOperationsCanvas
                atomId={atomId}
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
          </>
        ) : (
          <div className="w-full h-full p-6 bg-gradient-to-br from-slate-50 via-green-50/30 to-green-50/50 overflow-y-auto relative min-h-0">
              <div className="absolute inset-0 opacity-20">
                <svg width="80" height="80" viewBox="0 0 80 80" className="absolute inset-0 w-full h-full">
                  <defs>
                    <pattern id="emptyGrid" width="80" height="80" patternUnits="userSpaceOnUse">
                      <path d="M 80 0 L 0 0 0 80" fill="none" stroke="rgb(148 163 184 / 0.15)" strokeWidth="1"/>
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#emptyGrid)" />
                </svg>
              </div>

              <div className="relative z-10 flex items-center justify-center h-full">
                <div className="text-center max-w-md">
                  <div className="w-24 h-24 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-2xl transform rotate-3 hover:rotate-0 transition-transform duration-300">
                    <Table className="w-12 h-12 text-white drop-shadow-lg" />
                  </div>
                  <h3 className="text-3xl font-bold text-gray-900 mb-3 bg-gradient-to-r from-green-500 to-green-600 bg-clip-text text-transparent">
                    DataFrame Operations
                  </h3>
                  <p className="text-gray-600 mb-6 text-lg font-medium leading-relaxed">
                    Select a dataframe from the properties panel to get started
                  </p>
                </div>
              </div>
            </div>
          )}
      </div>
    </ErrorBoundary>
  );
};

export default DataFrameOperationsAtom;