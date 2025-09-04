import React, { useState, useRef, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, BarChart3 } from 'lucide-react';
import ChartMakerSettings from '../ChartMakerSettings';
import ChartMakerVisualization from '../ChartMakerVisualization';
import { useLaboratoryStore, DEFAULT_CHART_MAKER_SETTINGS, ChartMakerSettings as SettingsType, ChartData } from '@/components/LaboratoryMode/store/laboratoryStore';
import { chartMakerApi } from '../../services/chartMakerApi';
import { useToast } from '@/hooks/use-toast';
import { 
  migrateLegacyChart, 
  buildTracesForAPI, 
  mergeTraceFilters, 
  validateChart 
} from '../../utils/traceUtils';

interface Props {
  atomId: string;
}

const ChartMakerProperties: React.FC<Props> = ({ atomId }) => {
  const [tab, setTab] = useState('settings');
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings: SettingsType = (atom?.settings as SettingsType) || { ...DEFAULT_CHART_MAKER_SETTINGS };
  const { toast } = useToast();
  
  // Track if this is the initial mount to prevent false notifications
  const isInitialMount = useRef(true);
  const previousFilteringState = useRef(settings.loading?.filtering);

  // Reset initial mount flag after first render
  useEffect(() => {
    isInitialMount.current = false;
  }, []);

  const handleSettingsChange = (newSettings: Partial<SettingsType>) => {
    // Always get the latest atom from the store, not from the render closure
    const latestAtom = useLaboratoryStore.getState().getAtom(atomId);
    const latestSettings = (latestAtom?.settings as SettingsType) || { ...DEFAULT_CHART_MAKER_SETTINGS };
    updateSettings(atomId, {
      ...latestSettings,
      ...newSettings
    });
  };

  const setLoading = (loadingState: Partial<SettingsType['loading']>) => {
    handleSettingsChange({
      loading: {
        ...settings.loading,
        ...loadingState
      }
    });
    // Notification logic moved here
    const isProcessing = loadingState.uploading || loadingState.fetchingColumns || loadingState.fetchingUniqueValues;
    if (isProcessing) {
      toast({
        title: 'Processing file...',
        description: 'Your data is being processed.',
        variant: 'default',
        duration: 2000,
      });
    } else if (loadingState.uploading === false && loadingState.fetchingColumns === false && loadingState.fetchingUniqueValues === false && settings.uploadedData && !settings.error) {
      toast({
        title: 'File processed',
        description: 'Data is ready for charting.',
        variant: 'default',
        duration: 2000,
      });
    }
  };

  const setError = (error?: string) => {
    handleSettingsChange({ error });
    if (error) {
      toast({
        title: 'Processing failed',
        description: error,
        variant: 'destructive',
        duration: 2000,
      });
    }
  };

  const handleDataUpload = async (data: ChartData | null, fileId: string, dataSource?: string) => {
    try {
      setError(undefined);

      // If data is null, this is the start of loading - set loading state immediately
      if (data === null) {
        setLoading({ uploading: true });
        handleSettingsChange({
          dataSource: dataSource || settings.dataSource,
        });
        return;
      }

      // Update data immediately
      const updatedCharts = settings.charts.map(chart => ({
        ...chart,
        xAxis: '',
        yAxis: '',
        filters: {},
        chartRendered: false,
        chartConfig: undefined,
        filteredData: undefined,
        lastUpdateTime: undefined
      }));
      
      handleSettingsChange({
        uploadedData: data,
        fileId: fileId,
        dataSource: dataSource || settings.dataSource,
        charts: updatedCharts
      });

      // Fetch all required data from backend
      setLoading({ fetchingColumns: true, uploading: false });
      
      // Call all required endpoints as specified by user
      const [allColumnsResponse, columnsResponse, categoricalColumns] = await Promise.all([
        chartMakerApi.getAllColumns(fileId),
        chartMakerApi.getColumns(fileId),
        chartMakerApi.getColumns(fileId).then(response => response.categorical_columns)
      ]);

      // Get unique values for categorical columns
      if (categoricalColumns.length > 0) {
        setLoading({ fetchingUniqueValues: true, fetchingColumns: false });
        const uniqueValuesResponse = await chartMakerApi.getUniqueValues(fileId, categoricalColumns);
        
        // Update uploaded data with comprehensive information
        handleSettingsChange({
          uploadedData: {
            ...data,
            allColumns: allColumnsResponse.columns,
            numericColumns: columnsResponse.numeric_columns,
            categoricalColumns: columnsResponse.categorical_columns,
            uniqueValuesByColumn: uniqueValuesResponse.values
          }
        });
      } else {
        // Update uploaded data with column information
        handleSettingsChange({
          uploadedData: {
            ...data,
            allColumns: allColumnsResponse.columns,
            numericColumns: columnsResponse.numeric_columns,
            categoricalColumns: columnsResponse.categorical_columns,
            uniqueValuesByColumn: {}
          }
        });
      }

      // Clear loading states
      setLoading({
        uploading: false,
        fetchingColumns: false,
        fetchingUniqueValues: false,
        filtering: false
      });

    } catch (error) {
      console.error('Error in data upload process:', error);
      setError(error instanceof Error ? error.message : 'Failed to process uploaded data');
      setLoading({
        uploading: false,
        fetchingColumns: false,
        fetchingUniqueValues: false,
        filtering: false
      });
    }
  };

  // Ensure the backend has a valid file for the selected datasource when the
  // project is reloaded. The saved `fileId` may point to a temporary file that
  // no longer exists on the server, which would cause chart generation to fail
  // with a 500 error. When a datasource is present, verify the stored `fileId`
  // and reload the dataframe if necessary to obtain a fresh identifier.
  useEffect(() => {
    const ensureFileReady = async () => {
      if (!settings.dataSource) return;

      let fileValid = false;

      if (settings.fileId) {
        try {
          await chartMakerApi.getAllColumns(settings.fileId);
          fileValid = true;
        } catch {
          console.warn('[ChartMakerProperties] Stored file_id is invalid, reloading');
        }
      }

      if (!fileValid) {
        try {
          setLoading({ uploading: true });
          let objectName = settings.dataSource;
          if (!objectName.endsWith('.arrow')) {
            objectName += '.arrow';
          }
          const uploadResponse = await chartMakerApi.loadSavedDataframe(objectName);
          const chartData: ChartData = {
            columns: uploadResponse.columns,
            rows: uploadResponse.sample_data,
            numeric_columns: uploadResponse.numeric_columns,
            categorical_columns: uploadResponse.categorical_columns,
            unique_values: uploadResponse.unique_values,
            file_id: uploadResponse.file_id,
            row_count: uploadResponse.row_count,
          };
          await handleDataUpload(chartData, uploadResponse.file_id, settings.dataSource);
        } catch (err) {
          console.error('[ChartMakerProperties] Failed to reload dataframe:', err);
          setError(err instanceof Error ? err.message : 'Failed to reload dataframe');
          setLoading({ uploading: false });
        }
      }
    };

    ensureFileReady();
    // Only run when the datasource changes on initial load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.dataSource]);

  const handleRenderCharts = async () => {
    if (!settings.fileId) {
      setError('No file uploaded');
      return;
    }

    setLoading({ filtering: true });
    try {
      // Process each chart independently
      const updatedCharts = await Promise.all(
        settings.charts.map(async (chart) => {
          // Migrate legacy chart format
          const migratedChart = migrateLegacyChart(chart);
          
          if (!validateChart(migratedChart)) {
            return { ...migratedChart, chartRendered: false };
          }

          // Build traces for API
          const traces = buildTracesForAPI(migratedChart);
          
          // For advanced mode, filters are included in individual traces
          // For legacy mode, use merged filters for backward compatibility
          const legacyFilters = migratedChart.isAdvancedMode ? {} : mergeTraceFilters(migratedChart);

          // Prepare chart request
          const chartRequest = {
            file_id: settings.fileId!,
            chart_type: migratedChart.type,
            traces: traces,
            title: migratedChart.title,
            filters: Object.keys(legacyFilters).length > 0 ? legacyFilters : undefined,
          };

          // Log the data being sent to /charts endpoint
          console.log('[ChartMakerProperties] Sending to /charts:', chartRequest);

          try {
            // Call the charts endpoint to get recharts config
            const chartResponse = await chartMakerApi.generateChart(chartRequest);
            return {
              ...migratedChart,
              chartConfig: chartResponse.chart_config,
              filteredData: chartResponse.chart_config.data, // Update filtered data from response
              lastUpdateTime: Date.now(), // <-- ensure this is set per chart
              chartRendered: true // set to true after successful render
            };
          } catch (error) {
            return { ...chart, chartRendered: false };
          }
        })
      );

      handleSettingsChange({
        charts: updatedCharts,
        chartRendered: true,
        lastUpdateTime: Date.now()
      });

      setLoading({ filtering: false });
      toast({
        title: 'Chart rendered',
        description: 'Your chart is ready.',
        variant: 'default',
        duration: 2000,
      });

    } catch (error) {
      console.error('Error rendering charts:', error);
      setError(error instanceof Error ? error.message : 'Failed to render charts');
      setLoading({ filtering: false });
    }
  };

  // REMOVE notification useEffects

  return (
    <Tabs
      value={tab}
      onValueChange={setTab}
      className="flex flex-col h-full w-full"
    >
      <TabsList className="grid w-full grid-cols-2 mx-4 my-4">
        <TabsTrigger value="settings" className="text-xs">
          <Settings className="w-3 h-3 mr-1" />
          Settings
        </TabsTrigger>
        <TabsTrigger value="visualization" className="text-xs">
          <BarChart3 className="w-3 h-3 mr-1" />
          Visualization
        </TabsTrigger>
      </TabsList>

      <div className="px-4 flex-1 overflow-y-auto overflow-x-hidden">
        <TabsContent value="settings" className="space-y-4" forceMount>
          <ChartMakerSettings
            data={settings.uploadedData}
            onDataUpload={handleDataUpload}
            loading={settings.loading}
            error={settings.error}
            dataSource={settings.dataSource}
          />
        </TabsContent>
        
        <TabsContent value="visualization" className="space-y-4" forceMount>
          <ChartMakerVisualization
            settings={settings}
            onSettingsChange={handleSettingsChange}
            onRenderCharts={handleRenderCharts}
          />
        </TabsContent>
      </div>
    </Tabs>
  );
};

export default ChartMakerProperties;