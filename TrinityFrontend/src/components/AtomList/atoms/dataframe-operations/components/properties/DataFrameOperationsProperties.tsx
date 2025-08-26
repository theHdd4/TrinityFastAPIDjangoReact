import React, { useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Upload, Settings, Database, Eye, BarChart3 } from 'lucide-react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import DataFrameOperationsSettings from '../DataFrameOperationsSettings';
import DataFrameOperationsVisualisation from '../DataFrameOperationsVisualisation';
import DataFrameOperationsExhibition from '../DataFrameOperationsExhibition';
import DataFrameOperationsInputs from './DataFrameOperationsInputs';
import DataFrameOperationsCharts from './DataFrameOperationsCharts';
import { DataFrameData } from '../../DataFrameOperationsAtom';
import { VALIDATE_API } from '@/lib/api';
import { loadDataframeByKey } from '../../services/dataframeOperationsApi';

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
  const settings: DataFrameOperationsSettingsWithTableData = atom?.settings || { ...DEFAULT_DATAFRAME_OPERATIONS_SETTINGS };
  // Always use tableData as the data source
  const data = settings.tableData || null;
  const [tab, setTab] = React.useState('inputs');
  const [selectedFile, setSelectedFile] = React.useState(settings.selectedFile || '');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedFrame, setSelectedFrame] = React.useState<any>(null);

  // Fetch and load data when a file is selected
  const handleFileSelect = async (fileId: string) => {
    setSelectedFile(fileId);
    setLoading(true);
    setError(null);
    try {
      // Fetch the list of frames to get csv_name for display
      const framesRes = await fetch(`${VALIDATE_API}/list_saved_dataframes`);
      const framesData = await framesRes.json();
      const frames = Array.isArray(framesData.files) ? framesData.files : [];
      const foundFrame = frames.find((f: any) => f.object_name === fileId);
      setSelectedFrame(foundFrame || null);
      const resp = await loadDataframeByKey(fileId);

      const columnTypes: Record<string, string> = {};
      resp.headers.forEach(h => {
        const t = resp.types[h];
        columnTypes[h] = t.includes('float') || t.includes('int') ? 'number' : 'text';
      });
      const newData: DataFrameData = {
        headers: resp.headers,
        rows: resp.rows,
        fileName: foundFrame ? foundFrame.csv_name.split('/').pop() : fileId,
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

  return (
    <div className="w-80 h-full bg-white border-l border-green-200 flex flex-col">
      <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-green-200">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mx-4 my-4">
            <TabsTrigger value="inputs" className="text-xs">
              <Database className="w-3 h-3 mr-1" />
              Inputs
            </TabsTrigger>
            <TabsTrigger value="charts" className="text-xs">
              <BarChart3 className="w-3 h-3 mr-1" />
              Charts
            </TabsTrigger>
            <TabsTrigger value="exhibition" className="text-xs">
              <Eye className="w-3 h-3 mr-1" />
              Exhibition
            </TabsTrigger>
          </TabsList>
          <div className="px-4">
            <TabsContent value="inputs">
              <DataFrameOperationsInputs
                data={data}
                settings={settings}
                selectedFile={selectedFile}
                onFileSelect={handleFileSelect}
              />
              {loading && <div className="text-green-700 text-xs p-2">Loading data...</div>}
              {error && <div className="text-red-600 text-xs p-2">{error}</div>}
            </TabsContent>
            <TabsContent value="charts">
              <DataFrameOperationsCharts data={data} settings={settings} />
            </TabsContent>
            <TabsContent value="exhibition">
              <DataFrameOperationsExhibition data={(settings as any).tableData || data} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
};

export default DataFrameOperationsProperties; 