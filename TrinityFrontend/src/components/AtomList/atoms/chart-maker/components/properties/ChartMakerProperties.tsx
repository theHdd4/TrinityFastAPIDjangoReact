import React, { useState, useRef, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Settings, Eye } from 'lucide-react';
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
  
  // Watch for selectedChartIndex changes to auto-switch to visualization tab
  useEffect(() => {
    const selectedChartIndex = (settings as any).selectedChartIndex;
    if (selectedChartIndex !== undefined && selectedChartIndex >= 0) {
      setTab('visualization');
    }
  }, [(settings as any).selectedChartIndex]);

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

  const handleDataUpload = async (data: ChartData | null, fileId: string, dataSource?: string, preserveCharts: boolean = false) => {
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
      // Only reset charts if NOT preserving them (i.e., this is a new file upload, not a reload)
      const updatedCharts = preserveCharts ? settings.charts : settings.charts.map(chart => ({
        ...chart,
        xAxis: '',
        yAxis: '',
        filters: {},
        chartRendered: false,
        chartConfig: undefined,
        filteredData: undefined,
        lastUpdateTime: undefined
      }));
      
      // Don't update settings yet - wait until we have all data including unique values
      // This prevents multiple re-renders and potential filter loss
      
      // Fetch all required data from backend
      setLoading({ fetchingColumns: true, uploading: false });
      
      // Call all required endpoints as specified by user
      const [allColumnsResponse, columnsResponse] = await Promise.all([
        chartMakerApi.getAllColumns(fileId),
        chartMakerApi.getColumns(fileId)
      ]);

      // Fetch unique values for ALL columns (both categorical and numeric)
      // This ensures that any column can be used as a filter with full unique values
      const allColumns = allColumnsResponse.columns || [];
      let columnsToFetch = allColumns;
      
      // When preserving charts, still collect filter columns to ensure they're included
      if (preserveCharts) {
        const filterColumns = new Set<string>(allColumns);
        updatedCharts.forEach(chart => {
          // Collect filter columns from simple mode
          Object.keys(chart.filters || {}).forEach(col => filterColumns.add(col));
          // Collect filter columns from advanced mode traces
          (chart.traces || []).forEach(trace => {
            Object.keys(trace.filters || {}).forEach(col => filterColumns.add(col));
          });
        });
        columnsToFetch = Array.from(filterColumns);
      }

      // Get unique values for ALL columns (both categorical and numeric)
      if (columnsToFetch.length > 0) {
        setLoading({ fetchingUniqueValues: true, fetchingColumns: false });
        const uniqueValuesResponse = await chartMakerApi.getUniqueValues(fileId, columnsToFetch);
        
        // Update uploaded data with comprehensive information
        handleSettingsChange({
          uploadedData: {
            ...data,
            allColumns: allColumnsResponse.columns,
            numericColumns: columnsResponse.numeric_columns,
            categoricalColumns: columnsResponse.categorical_columns,
            uniqueValuesByColumn: uniqueValuesResponse.values
          },
          fileId: fileId,
          dataSource: dataSource || settings.dataSource,
          charts: updatedCharts
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
          },
          fileId: fileId,
          dataSource: dataSource || settings.dataSource,
          charts: updatedCharts
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
      setError(error instanceof Error ? error.message : 'Failed to process uploaded data');
      setLoading({
        uploading: false,
        fetchingColumns: false,
        fetchingUniqueValues: false,
        filtering: false
      });
    }
  };

  const hasRenderedCharts = Array.isArray(settings.charts)
    ? settings.charts.some(chart => chart.chartRendered || (chart.traces && chart.traces.length > 0) || chart.chartConfig)
    : false;
  const hasUploadedData = Boolean(settings.uploadedData);
  const hasExistingUpdates = hasRenderedCharts || hasUploadedData;

  // Ensure the backend has a valid file for the selected datasource when the
  // project is reloaded. ALWAYS reload the file to fetch fresh column information
  // and unique values, as the same filename may have different column structures
  // across different projects/uploads.
  useEffect(() => {
    const ensureFileReady = async () => {
      if (!settings.dataSource) return;

      // ALWAYS reload the file to get fresh column data and unique values
      // This ensures that even if the same filename is used across different projects,
      // we get the correct column structure and values for the current file
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
        // Pass preserveCharts=true to keep existing chart configurations when reloading file
        await handleDataUpload(chartData, uploadResponse.file_id, settings.dataSource, true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reload dataframe');
        setLoading({ uploading: false });
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
            file_id: (settings as any).dataSource || settings.fileId!,
            chart_type: migratedChart.type,
            traces: traces,
            title: migratedChart.title,
            filters: Object.keys(legacyFilters).length > 0 ? legacyFilters : undefined,
          };

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
        charts: updatedCharts
      });

      setLoading({ filtering: false });
      toast({
        title: 'Chart rendered',
        description: 'Your chart is ready.',
        variant: 'default',
        duration: 2000,
      });

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to render charts');
      setLoading({ filtering: false });
    }
  };

  // REMOVE notification useEffects

  return (
    <div className="h-full flex flex-col">
      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex-1 flex flex-col"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="settings" className="text-xs font-medium">
            <Upload className="w-3 h-3 mr-1" />
            Input
          </TabsTrigger>
          <TabsTrigger value="visualization" className="text-xs font-medium">
            <Settings className="w-3 h-3 mr-1" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="flex-1 mt-0" forceMount>
          <ChartMakerSettings
            data={settings.uploadedData}
            onDataUpload={handleDataUpload}
            loading={settings.loading}
            error={settings.error}
            dataSource={settings.dataSource}
            hasExistingUpdates={hasExistingUpdates}
          />
        </TabsContent>
        
        <TabsContent value="visualization" className="flex-1 mt-0" forceMount>
          <ChartMakerVisualization
            settings={settings}
            onSettingsChange={handleSettingsChange}
            onRenderCharts={handleRenderCharts}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ChartMakerProperties;