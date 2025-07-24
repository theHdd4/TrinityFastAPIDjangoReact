import React, { useState, useRef, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, BarChart3 } from 'lucide-react';
import ChartMakerSettings from '../ChartMakerSettings';
import ChartMakerVisualization from '../ChartMakerVisualization';
import { useLaboratoryStore, DEFAULT_CHART_MAKER_SETTINGS, ChartMakerSettings as SettingsType } from '@/components/LaboratoryMode/store/laboratoryStore';
import { chartMakerApi } from '@/services/chartMakerApi';
import { ChartData } from '../../ChartMakerAtom';
import { useToast } from '@/hooks/use-toast';

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

  const handleDataUpload = async (data: ChartData, fileId: string) => {
    try {
      // Remove: setLoading({ uploading: true });
      setError(undefined);

      // Update data immediately
      const updatedCharts = settings.charts.map(chart => ({
        ...chart,
        xAxis: '',
        yAxis: '',
        filters: {},
        chartRendered: false
      }));
      
      handleSettingsChange({
        uploadedData: data,
        fileId: fileId,
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
          if (!chart.xAxis || !chart.yAxis) {
            return { ...chart, chartRendered: false };
          }

          // Prepare chart request
          const chartRequest = {
            file_id: settings.fileId!,
            chart_type: chart.type,
            traces: [{
              x_column: chart.xAxis,
              y_column: chart.yAxis,
              name: chart.title,
              chart_type: chart.type,
              aggregation: "sum" as const
            }],
            title: chart.title,
            filters: Object.keys(chart.filters).length > 0 ? chart.filters : undefined,
            filtered_data: chart.filteredData // Use cached filtered data if available
          };

          // Log the data being sent to /charts endpoint
          console.log('[ChartMakerProperties] Sending to /charts:', chartRequest);

          try {
            // Call the charts endpoint to get recharts config
            const chartResponse = await chartMakerApi.generateChart(chartRequest);
            return {
              ...chart,
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
    <Tabs value={tab} onValueChange={setTab} className="w-full">
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

      <div className="px-4">
        <TabsContent value="settings" className="space-y-4" forceMount>
          <ChartMakerSettings
            data={settings.uploadedData}
            onDataUpload={handleDataUpload}
            onStartUpload={() => setLoading({ uploading: true })}
            loading={settings.loading}
            error={settings.error}
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
