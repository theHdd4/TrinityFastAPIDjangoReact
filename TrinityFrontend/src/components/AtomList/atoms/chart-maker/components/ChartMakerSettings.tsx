import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertCircle, Database } from 'lucide-react';
import { ChartData } from '@/components/LaboratoryMode/store/laboratoryStore';
import { chartMakerApi } from '../services/chartMakerApi';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { VALIDATE_API, FEATURE_OVERVIEW_API } from '@/lib/api';
import { useDataSourceChangeWarning } from '@/hooks/useDataSourceChangeWarning';

interface ChartMakerSettingsProps {
  data: ChartData | null;
  onDataUpload: (data: ChartData | null, fileId: string, dataSource?: string) => void;
  loading?: {
    uploading: boolean;
    fetchingColumns: boolean;
    fetchingUniqueValues: boolean;
    filtering: boolean;
  };
  error?: string;
  dataSource?: string;
  hasExistingUpdates?: boolean;
}

interface Frame {
  object_name: string;
  arrow_name: string;
}

const ChartMakerSettings: React.FC<ChartMakerSettingsProps> = ({
  data,
  onDataUpload,
  loading = {
    uploading: false,
    fetchingColumns: false,
    fetchingUniqueValues: false,
    filtering: false,
  },
  error,
  dataSource,
  hasExistingUpdates = false
}) => {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [selectedDataSource, setSelectedDataSource] = useState<string>(dataSource || '');
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${VALIDATE_API}/list_saved_dataframes`)
      .then(r => r.json())
      .then(d =>
        setFrames(
          Array.isArray(d.files)
            ? d.files
                .filter((f: any) => !!f.arrow_name)
                .map((f: any) => ({
                  object_name: f.object_name,
                  arrow_name: f.arrow_name,
                }))
            : []
        )
      )
      .catch(() => setFrames([]));
  }, []);

  useEffect(() => {
    if (dataSource) {
      setSelectedDataSource(dataSource);
    }
  }, [dataSource]);

  const applyDataframeSelect = async (objectName: string) => {
    try {
      setUploadError(null);
      setSelectedDataSource(objectName);

      onDataUpload(null, '', objectName);

      let processedObjectName = objectName;
      if (!processedObjectName.endsWith('.arrow')) {
        processedObjectName += '.arrow';
      }

      let uploadResponse;

      try {
        uploadResponse = await chartMakerApi.loadSavedDataframe(processedObjectName);
      } catch (error) {
        const displayName =
          frames
            .find(df => df.object_name === objectName)
            ?.arrow_name.split('/').pop()?.replace('.arrow', '') || objectName;
        const isArrow = processedObjectName.endsWith('.arrow');

        if (isArrow) {
          const response = await fetch(`${FEATURE_OVERVIEW_API}/flight_table?object_name=${encodeURIComponent(processedObjectName)}`);
          if (!response.ok) {
            throw new Error(`Failed to load Arrow dataframe: ${response.statusText}`);
          }
          const arrowBuffer = await response.arrayBuffer();
          const file = new File([arrowBuffer], `${displayName}.arrow`, { type: 'application/vnd.apache.arrow.file' });
          uploadResponse = await chartMakerApi.uploadArrow(file);
        } else {
          const response = await fetch(`${FEATURE_OVERVIEW_API}/cached_dataframe?object_name=${encodeURIComponent(processedObjectName)}`);
          if (!response.ok) {
            throw new Error(`Failed to load dataframe: ${response.statusText}`);
          }
          const csvContent = await response.text();
          const file = new File([csvContent], `${displayName}.csv`, { type: 'text/csv' });
          uploadResponse = await chartMakerApi.uploadCSV(file);
        }
      }

      const chartData: ChartData = {
        columns: uploadResponse.columns,
        rows: uploadResponse.sample_data,
        numeric_columns: uploadResponse.numeric_columns,
        categorical_columns: uploadResponse.categorical_columns,
        unique_values: uploadResponse.unique_values,
        file_id: uploadResponse.file_id,
        row_count: uploadResponse.row_count
      };

      onDataUpload(chartData, uploadResponse.file_id, objectName);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Failed to load saved dataframe');
      onDataUpload(null, '', objectName);
    }
  };

  const { requestChange: confirmDataSourceChange, dialog } = useDataSourceChangeWarning(applyDataframeSelect);

  const handleDataframeSelect = (objectName: string) => {
    if (!objectName) return;
    const isDifferentSource = objectName !== (dataSource || '');
    confirmDataSourceChange(objectName, hasExistingUpdates && isDifferentSource);
  };

  const isLoading = loading.uploading || loading.fetchingColumns || loading.fetchingUniqueValues;

  return (
    <div className="space-y-4 p-2">
      <Card className="p-4 space-y-3">
        <label className="text-sm font-medium text-gray-700 block">Data Source</label>
        {isLoading ? (
          <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
            <p className="text-sm text-blue-800 dark:text-blue-200">
              {loading.uploading && "Loading dataframe..."}
              {loading.fetchingColumns && "Fetching column information..."}
              {loading.fetchingUniqueValues && "Analyzing data values..."}
              {loading.filtering && "Applying filters..."}
            </p>
          </div>
        ) : (
          <Select value={selectedDataSource} onValueChange={handleDataframeSelect}>
            <SelectTrigger className="bg-white border-gray-300">
              <SelectValue placeholder="Choose a saved dataframe..." />
            </SelectTrigger>
            <SelectContent>
              {frames.map(f => (
                <SelectItem key={f.object_name} value={f.object_name}>
              {f.arrow_name.split('/').pop()?.replace('.arrow', '')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        
        {(error || uploadError) && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error || uploadError}
            </AlertDescription>
          </Alert>
        )}
      </Card>

      {/* {data && !isLoading && (
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
            <Database className="w-4 h-4 text-green-600" />
            <div className="flex-1">
              <p className="text-sm font-medium text-green-800 dark:text-green-200">
                Data loaded successfully
              </p>
              <p className="text-xs text-green-600 dark:text-green-400">
                {data.rows.length} rows, {data.columns.length} columns
              </p>
            </div>
          </div>

          <div className="text-xs space-y-2">
            <div>
              <strong>Columns:</strong> {data.columns.join(', ')}
            </div>
          </div>
        </Card>
      )} */}

      {dialog}
      
      {frames.length === 0 && !isLoading && (
        <Card className="p-4">
          <div className="text-center py-4">
            <Database className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              No saved dataframes available
            </p>
          </div>
        </Card>
      )}
    </div>
  );
};

export default ChartMakerSettings;