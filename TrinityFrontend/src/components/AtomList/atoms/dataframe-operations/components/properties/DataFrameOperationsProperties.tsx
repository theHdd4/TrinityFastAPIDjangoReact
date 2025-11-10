import React from 'react';
import { Upload, Settings, Eye } from 'lucide-react';
import {
  useLaboratoryStore,
  DEFAULT_PIVOT_TABLE_SETTINGS,
  PivotTableSettings as PivotSettings,
} from '@/components/LaboratoryMode/store/laboratoryStore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DataFrameOperationsExhibition from '../DataFrameOperationsExhibition';
import DataFrameOperationsInputs from './DataFrameOperationsInputs';
import PivotTableSettings from '@/components/AtomList/atoms/pivot-table/components/PivotTableSettings';
import { DataFrameData } from '../../DataFrameOperationsAtom';
import { VALIDATE_API } from '@/lib/api';
import { loadDataframeByKey } from '../../services/dataframeOperationsApi';
import { useDataSourceChangeWarning } from '@/hooks/useDataSourceChangeWarning';

const arraysEqual = (a: string[] = [], b: string[] = []) => {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
};

// Define DataFrameOperationsSettings interface and default settings locally
export interface DataFrameOperationsSettings {
  rowsPerPage: number;
  searchTerm: string;
  sortColumns: Array<{ column: string; direction: 'asc' | 'desc' }>;
  filters: { [key: string]: any };
  selectedColumns: string[];
  showRowNumbers: boolean;
  enableEditing: boolean;
  uploadedFile?: string;
  selectedFile?: string;
  pivotSettings?: PivotSettings;
}

export const DEFAULT_DATAFRAME_OPERATIONS_SETTINGS: DataFrameOperationsSettings = {
  rowsPerPage: 15,
  searchTerm: '',
  sortColumns: [],
  filters: {},
  selectedColumns: [],
  showRowNumbers: true,
  enableEditing: true,
  selectedFile: '',
  pivotSettings: { ...DEFAULT_PIVOT_TABLE_SETTINGS },
};

// Extend DataFrameOperationsSettings type to include tableData
interface DataFrameOperationsSettingsWithTableData extends DataFrameOperationsSettings {
  tableData?: any;
}

interface Props {
  atomId: string;
}

const DataFrameOperationsProperties: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings: DataFrameOperationsSettingsWithTableData = {
    ...DEFAULT_DATAFRAME_OPERATIONS_SETTINGS,
    ...(atom?.settings || {}),
  };
  if (!settings.pivotSettings) {
    settings.pivotSettings = { ...DEFAULT_PIVOT_TABLE_SETTINGS };
  }
  // Always use tableData as the data source
  const data = settings.tableData || null;
  const [tab, setTab] = React.useState('inputs');
  const [selectedFile, setSelectedFile] = React.useState(settings.selectedFile || '');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedFrame, setSelectedFrame] = React.useState<any>(null);

  const pivotConfig = React.useMemo<PivotSettings>(() => {
    return {
      ...DEFAULT_PIVOT_TABLE_SETTINGS,
      ...(settings.pivotSettings || {}),
    };
  }, [settings.pivotSettings]);

  React.useEffect(() => {
    if (!data) {
      return;
    }

    const headers = Array.isArray(data.headers) ? data.headers.filter(Boolean) : [];
    const dataSource =
      settings.selectedFile ||
      settings.fileId ||
      pivotConfig.dataSource ||
      '';
    const normalizedSelectedFields = (pivotConfig.selectedFields || []).filter(field =>
      headers.includes(field),
    );

    const needsDataSourceUpdate = (pivotConfig.dataSource || '') !== dataSource;
    const needsColumnSync =
      headers.length > 0 &&
      (!arraysEqual(pivotConfig.dataSourceColumns || [], headers) ||
        !arraysEqual(pivotConfig.fields || [], headers));
    const needsSelectedSync =
      headers.length > 0 &&
      (!normalizedSelectedFields.length ||
        !arraysEqual(normalizedSelectedFields, pivotConfig.selectedFields || []));

    if (!needsDataSourceUpdate && !needsColumnSync && !needsSelectedSync) {
      return;
    }

    updateSettings(atomId, {
      pivotSettings: {
        ...pivotConfig,
        dataSource,
        dataSourceColumns: headers,
        fields: headers,
        selectedFields: needsSelectedSync ? headers : normalizedSelectedFields,
      },
    });
  }, [atomId, data, pivotConfig, settings.fileId, settings.selectedFile, updateSettings]);

  const handlePivotDataChange = React.useCallback(
    (changes: Partial<PivotSettings>) => {
      const latestAtom = useLaboratoryStore.getState().getAtom(atomId);
      const latestPivot = (latestAtom?.settings as { pivotSettings?: PivotSettings } | undefined)
        ?.pivotSettings;
      const merged: PivotSettings = {
        ...DEFAULT_PIVOT_TABLE_SETTINGS,
        ...(latestPivot || {}),
        ...changes,
      };
      updateSettings(atomId, { pivotSettings: merged });
    },
    [atomId, updateSettings],
  );

  const applyFileSelect = async (fileId: string) => {
    setSelectedFile(fileId);
    setLoading(true);
    setError(null);
    try {
      const framesRes = await fetch(`${VALIDATE_API}/list_saved_dataframes`);
      const framesData = await framesRes.json();
      const frames = Array.isArray(framesData.files)
        ? framesData.files.filter((f: any) => f.arrow_name)
        : [];
      const foundFrame = frames.find((f: any) => f.object_name === fileId);
      setSelectedFrame(foundFrame || null);
      const resp = await loadDataframeByKey(fileId);

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
      const newData: DataFrameData = {
        headers: resp.headers,
        rows: resp.rows,
        fileName: foundFrame ? foundFrame.arrow_name.split('/').pop() : fileId,
        columnTypes,
        pinnedColumns: [],
        frozenColumns: 0,
        cellColors: {},
      };
      updateSettings(atomId, {
        ...settings,
        selectedFile: fileId,
        selectedColumns: resp.headers,
        searchTerm: '',
        filters: {},
        data: newData,
        tableData: newData,
        fileId: resp.df_id,
      });
      setLoading(false);
    } catch (err: any) {
      console.error('Failed to fetch or load dataframe', err);
      setError('Failed to fetch or load dataframe.');
      setLoading(false);
    }
  };

  const { requestChange: confirmFileChange, dialog } = useDataSourceChangeWarning(applyFileSelect);

  const handleFileSelect = (fileId: string) => {
    const hasExistingUpdates = Boolean(settings.tableData && Array.isArray(settings.tableData.rows) && settings.tableData.rows.length > 0);
    const isDifferentSource = fileId !== (settings.selectedFile || '');
    confirmFileChange(fileId, hasExistingUpdates && isDifferentSource);
  };

  return (
    <div className="h-full flex flex-col">
      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="inputs" className="text-xs font-medium">
            <Upload className="w-3 h-3 mr-1" />
            Input
          </TabsTrigger>
          <TabsTrigger value="charts" className="text-xs font-medium">
            <Settings className="w-3 h-3 mr-1" />
            Pivot Settings
          </TabsTrigger>
          <TabsTrigger value="exhibition" className="text-xs font-medium">
            <Eye className="w-3 h-3 mr-1" />
            Exhibition
          </TabsTrigger>
        </TabsList>
        <TabsContent value="inputs" className="flex-1 mt-0">
          <DataFrameOperationsInputs
            data={data}
            settings={settings}
            selectedFile={selectedFile}
            onFileSelect={handleFileSelect}
          />
          {loading && <div className="text-slate-700 text-xs p-2">Loading data...</div>}
          {error && <div className="text-red-600 text-xs p-2">{error}</div>}
        </TabsContent>
        <TabsContent value="charts" className="flex-1 mt-0">
          <div className="h-full overflow-y-auto p-4">
            <PivotTableSettings data={pivotConfig} onDataChange={handlePivotDataChange} />
          </div>
        </TabsContent>
        <TabsContent value="exhibition" className="flex-1 mt-0">
          <DataFrameOperationsExhibition data={(settings as any).tableData || data} />
        </TabsContent>
      </Tabs>
      {dialog}
    </div>
  );
};

export default DataFrameOperationsProperties; 