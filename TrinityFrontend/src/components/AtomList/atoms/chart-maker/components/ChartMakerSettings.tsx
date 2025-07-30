import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, FileText, Check, Loader2, AlertCircle, Database } from 'lucide-react';
import { ChartData } from '../ChartMakerAtom';
import { chartMakerApi } from '../services/chartMakerApi';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useSavedDataframes } from '@/hooks/useSavedDataframes';
import { FEATURE_OVERVIEW_API } from '@/lib/api';

interface ChartMakerSettingsProps {
  data: ChartData | null;
  onDataUpload: (data: ChartData, fileId: string) => void;
  onStartUpload?: () => void;
  loading?: {
    uploading: boolean;
    fetchingColumns: boolean;
    fetchingUniqueValues: boolean;
    filtering: boolean;
  };
  error?: string;
}

const ChartMakerSettings: React.FC<ChartMakerSettingsProps> = ({ 
  data, 
  onDataUpload, 
  onStartUpload,
  loading = {
    uploading: false,
    fetchingColumns: false,
    fetchingUniqueValues: false,
    filtering: false,
  },
  error 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const { dataframes, loading: dataframesLoading, error: dataframesError, refetch } = useSavedDataframes();

  const handleDataframeSelect = async (objectName: string) => {
    try {
      setUploadError(null);
      
      // Signal start of upload process if handler is provided
      if (onStartUpload) onStartUpload();
      
      // Determine if the file is Arrow or not
      const isArrow = objectName.endsWith('.arrow');
      let uploadResponse;
      let displayName = dataframes.find(df => df.object_name === objectName)?.csv_name.split('/').pop()?.replace('.arrow', '') || objectName;
      if (isArrow) {
        // Fetch the Arrow file from the backend
        const response = await fetch(`${FEATURE_OVERVIEW_API}/flight_table?object_name=${encodeURIComponent(objectName)}`);
        if (!response.ok) {
          throw new Error(`Failed to load Arrow dataframe: ${response.statusText}`);
        }
        const arrowBuffer = await response.arrayBuffer();
        // Create a File object for Arrow
        const file = new File([arrowBuffer], `${displayName}.arrow`, { type: 'application/vnd.apache.arrow.file' });
        // Upload Arrow file to backend
        uploadResponse = await chartMakerApi.uploadArrow(file);
      } else {
        // Fallback: Fetch the CSV data from the saved dataframe
        const response = await fetch(`${FEATURE_OVERVIEW_API}/cached_dataframe?object_name=${encodeURIComponent(objectName)}`);
        if (!response.ok) {
          throw new Error(`Failed to load dataframe: ${response.statusText}`);
        }
        const csvContent = await response.text();
        // Create a File object from the CSV content
        const file = new File([csvContent], `${displayName}.csv`, { type: 'text/csv' });
        // Upload CSV file to backend
        uploadResponse = await chartMakerApi.uploadCSV(file);
      }
      // Use the upload response to build chart data
      const chartData: ChartData = {
        columns: uploadResponse.columns,
        rows: uploadResponse.sample_data,
        numeric_columns: uploadResponse.numeric_columns,
        categorical_columns: uploadResponse.categorical_columns,
        unique_values: uploadResponse.unique_values,
        file_id: uploadResponse.file_id,
        row_count: uploadResponse.row_count
      };
      // Call the parent handler with both chart data and file ID
      onDataUpload(chartData, uploadResponse.file_id);
    } catch (error) {
      console.error('Error loading saved dataframe:', error);
      setUploadError(error instanceof Error ? error.message : 'Failed to load saved dataframe');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.includes('csv') && !file.name.endsWith('.csv')) {
      setUploadError('Please upload a CSV file');
      return;
    }

    setUploadError(null);

    if (onStartUpload) onStartUpload();

    try {
      // Upload CSV to backend and get comprehensive data
      console.log('Uploading CSV to backend...');
      const response = await chartMakerApi.uploadCSV(file);
      console.log('Response:', response);
      // Transform backend response to frontend ChartData format
      const chartData: ChartData = {
        columns: response.columns,
        rows: response.sample_data // Use sample data initially, full data will be fetched as needed
      };

      // Call the parent handler with both chart data and file ID
      onDataUpload(chartData, response.file_id);
      
    } catch (error) {
      console.error('Error uploading CSV:', error);
      setUploadError(error instanceof Error ? error.message : 'Failed to upload CSV file');
    }
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const isLoading = loading.uploading || loading.fetchingColumns || loading.fetchingUniqueValues;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Data Upload</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
            {isLoading ? (
              <div className="flex flex-col items-center">
                <Loader2 className="mx-auto h-8 w-8 text-primary mb-2 animate-spin" />
                <p className="text-sm text-muted-foreground mb-2">
                  {loading.uploading && "Uploading and processing file..."}
                  {loading.fetchingColumns && "Fetching column information..."}
                  {loading.fetchingUniqueValues && "Analyzing data values..."}
                  {loading.filtering && "Applying filters..."}
                </p>
              </div>
            ) : (
              <>
                <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground mb-2">
                  Select from saved dataframes
                </p>
                {/* File input and button are hidden for UI, but kept for backwards compatibility */}
                <div style={{ display: 'none' }}>
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="mb-2"
                    disabled={isLoading}
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Choose File
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={isLoading}
                  />
                </div>
                {/* Removed: <p className="text-xs text-muted-foreground">Supports CSV files up to 10MB</p> */}
              </>
            )}
          </div>
          
          {(error || uploadError) && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {error || uploadError}
              </AlertDescription>
            </Alert>
          )}
          
          {data && !isLoading && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200 dark:border-green-800">
              <Check className="w-4 h-4 text-green-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  Data uploaded successfully
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">
                  {data.rows.length} rows, {data.columns.length} columns
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Data Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs space-y-2">
              <div>
                <strong>Columns:</strong> {data.columns.join(', ')}
              </div>
              <div>
                <strong>Sample Data:</strong>
                <div className="mt-1 p-2 bg-muted rounded text-xs font-mono">
                  {JSON.stringify(data.rows[0] || {}, null, 2)}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Saved Dataframes</CardTitle>
        </CardHeader>
        <CardContent>
          {dataframesLoading ? (
            <div className="text-center py-4">
              <Loader2 className="mx-auto h-8 w-8 text-muted-foreground mb-2 animate-spin" />
              <p className="text-sm text-muted-foreground">Loading saved dataframes...</p>
            </div>
          ) : dataframesError ? (
            <div className="text-center py-4">
              <AlertCircle className="mx-auto h-8 w-8 text-destructive mb-2" />
              <p className="text-sm text-destructive mb-2">{dataframesError}</p>
              <Button variant="outline" size="sm" onClick={refetch}>
                Retry
              </Button>
            </div>
          ) : dataframes.length === 0 ? (
            <div className="text-center py-4">
              <Database className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground mb-2">
                No saved dataframes available
              </p>
              <Button variant="outline" size="sm" onClick={refetch}>
                Refresh
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground mb-3">
                Select a saved dataframe to load it into the chart maker
              </p>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {dataframes.map((df) => (
                  <Button
                    key={df.object_name}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start text-left h-auto py-2 px-3"
                    onClick={() => handleDataframeSelect(df.object_name)}
                    disabled={isLoading}
                  >
                    <Database className="w-4 h-4 mr-2 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {df.csv_name.split('/').pop()?.replace('.arrow', '') || df.object_name}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {df.object_name}
                      </div>
                    </div>
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ChartMakerSettings;
