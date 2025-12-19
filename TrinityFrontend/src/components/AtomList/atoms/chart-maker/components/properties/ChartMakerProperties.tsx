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
  const rawSettings = (atom?.settings as SettingsType) || {} as Partial<SettingsType>;
  const settings: SettingsType = {
    ...DEFAULT_CHART_MAKER_SETTINGS,
    ...rawSettings,
    charts: Array.isArray(rawSettings.charts) ? rawSettings.charts : (rawSettings.charts || DEFAULT_CHART_MAKER_SETTINGS.charts),
  };
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
    // 🔧 CRITICAL FIX: For chart-maker, the store now handles chart deduplication automatically
    // We can pass settings directly - the store will merge charts by ID
    updateSettings(atomId, newSettings);
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

      // 🔧 CRITICAL: Get latest charts from store (not from component settings which might be stale)
      const latestAtom = useLaboratoryStore.getState().getAtom(atomId);
      const latestSettings = (latestAtom?.settings as SettingsType) || {};
      const latestCharts = Array.isArray(latestSettings.charts) ? latestSettings.charts : [];

      // Update data immediately
      // 🔧 CRITICAL: Only reset charts if NOT preserving them (i.e., this is a new file upload, not a reload)
      // When preserveCharts=true (AI-generated charts) OR pipelineRestored=true (pipeline restoration), keep ALL chart data
      const isPipelineRestored = latestSettings.pipelineRestored === true;
      const shouldPreserveCharts = preserveCharts || isPipelineRestored;
      let updatedCharts;
      if (shouldPreserveCharts) {
        // 🔧 CRITICAL: When preserving charts (AI-generated or pipeline-restored), keep them EXACTLY as they are from store
        // Don't clear chartConfig, filteredData, or any other chart data
        updatedCharts = latestCharts; // Use charts from store, not from component settings
        console.log('🔧 PRESERVING charts:', updatedCharts.length, 'charts with full data', {
          reason: isPipelineRestored ? 'pipeline-restored' : 'AI-generated',
          preserveCharts,
          isPipelineRestored
        });
        if (updatedCharts.length > 0) {
          console.log('🔧 Chart 1 has chartConfig:', !!updatedCharts[0].chartConfig);
          console.log('🔧 Chart 1 has filteredData:', !!updatedCharts[0].filteredData);
          console.log('🔧 Chart 1 chartRendered:', updatedCharts[0].chartRendered);
        }
      } else {
        // Only clear chart data when NOT preserving (new file upload)
        updatedCharts = latestCharts.map(chart => ({
          ...chart,
          xAxis: '',
          yAxis: '',
          filters: {},
          chartRendered: false,
          chartConfig: undefined,
          filteredData: undefined,
          lastUpdateTime: undefined
        }));
        console.log('🔧 RESETTING charts (new file upload):', updatedCharts.length);
      }
      
      // Don't update settings yet - wait until we have all data including unique values
      // This prevents multiple re-renders and potential filter loss
      
      // Fetch all required data from backend
      setLoading({ fetchingColumns: true, uploading: false });
      
      // Call all required endpoints as specified by user
      const [allColumnsResponse, columnsResponse] = await Promise.all([
        chartMakerApi.getAllColumns(fileId),
        chartMakerApi.getColumns(fileId)
      ]);

      const resolvedFileId = columnsResponse.file_id || allColumnsResponse.file_id || fileId;

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
        const uniqueValuesResponse = await chartMakerApi.getUniqueValues(resolvedFileId, columnsToFetch);
        const finalFileId = uniqueValuesResponse.file_id || resolvedFileId;

        // Update uploaded data with comprehensive information
        // 🔧 CRITICAL: When preserveCharts=true, use charts from store to ensure we don't lose chartConfig/filteredData
        const finalCharts = preserveCharts 
          ? latestCharts  // Always use latest charts from store when preserving
          : updatedCharts;
        
        console.log('🔧 Final charts to set (with unique values):', finalCharts.length, 'preserveCharts:', preserveCharts);
        if (finalCharts.length > 0 && preserveCharts) {
          console.log('🔧 Preserving chart with chartConfig:', !!finalCharts[0].chartConfig);
        }
        
        handleSettingsChange({
          uploadedData: {
            ...data,
            file_id: finalFileId,
            allColumns: allColumnsResponse.columns,
            numericColumns: columnsResponse.numeric_columns,
            categoricalColumns: columnsResponse.categorical_columns,
            uniqueValuesByColumn: uniqueValuesResponse.values
          },
          fileId: finalFileId,
          dataSource: dataSource || settings.dataSource,
          charts: finalCharts
        });
      } else {
        // Update uploaded data with column information
        // 🔧 CRITICAL: When preserveCharts=true, use charts from store to ensure we don't lose chartConfig/filteredData
        const finalCharts = preserveCharts 
          ? latestCharts  // Always use latest charts from store when preserving
          : updatedCharts;
        
        console.log('🔧 Final charts to set (no unique values):', finalCharts.length, 'preserveCharts:', preserveCharts);
        
        handleSettingsChange({
          uploadedData: {
            ...data,
            file_id: resolvedFileId,
            allColumns: allColumnsResponse.columns,
            numericColumns: columnsResponse.numeric_columns,
            categoricalColumns: columnsResponse.categorical_columns,
            uniqueValuesByColumn: {}
          },
          fileId: resolvedFileId,
          dataSource: dataSource || settings.dataSource,
          charts: finalCharts
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
    ? settings.charts.some(chart => chart.chartRendered || (Array.isArray(chart.traces) && chart.traces.length > 0) || chart.chartConfig)
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

      // 🔧 CRITICAL: Check if this is an AI-initiated dataSource change
      // If charts already exist and were set by AI, we should preserve them
      const currentAtom = useLaboratoryStore.getState().getAtom(atomId);
      const currentSettings = (currentAtom?.settings as SettingsType) || {};
      const hasAICharts = Array.isArray(currentSettings.charts) && currentSettings.charts.length > 0 && (currentSettings as any).aiConfigured;
      const hasRenderedCharts = Array.isArray(currentSettings.charts) && currentSettings.charts.some((c: any) => c.chartRendered || c.chartConfig);
      const shouldPreserveCharts = hasAICharts || (currentSettings as any).autoRenderAfterLoad;

      // 🔧 CRITICAL: If AI is currently setting up charts OR charts are already rendered, skip this reload
      // The AI handler will load the file itself, or charts are already working
      if ((currentSettings as any).chartLoading || (currentSettings as any).autoRenderAfterLoad || hasRenderedCharts) {
        console.log('🔧 Skipping file reload - AI is setting up charts or charts are already rendered', {
          chartLoading: (currentSettings as any).chartLoading,
          autoRenderAfterLoad: (currentSettings as any).autoRenderAfterLoad,
          hasRenderedCharts,
          chartsCount: Array.isArray(currentSettings.charts) ? currentSettings.charts.length : 0
        });
        return;
      }

      // ALWAYS reload the file to get fresh column data and unique values
      // This ensures that even if the same filename is used across different projects,
      // we get the correct column structure and values for the current file
      try {
        setLoading({ uploading: true });
        let objectName = settings.dataSource;
        if (!objectName.endsWith('.arrow')) {
          objectName += '.arrow';
        }
        
        // Get card_id and canvas_position for pipeline tracking
        const cards = useLaboratoryStore.getState().cards;
        const card = cards.find(c => Array.isArray(c.atoms) && c.atoms.some(a => a.id === atomId));
        const cardId = card?.id || '';
        const canvasPosition = card?.canvas_position ?? 0;
        
        const uploadResponse = await chartMakerApi.loadSavedDataframe(objectName, atomId, cardId, canvasPosition);
        const chartData: ChartData = {
          columns: uploadResponse.columns,
          rows: uploadResponse.sample_data,
          numeric_columns: uploadResponse.numeric_columns,
          categorical_columns: uploadResponse.categorical_columns,
          unique_values: uploadResponse.unique_values,
          file_id: uploadResponse.file_id,
          row_count: uploadResponse.row_count,
        };
        // 🔧 CRITICAL: Pass preserveCharts=true when AI has configured charts to prevent clearing them
        await handleDataUpload(chartData, uploadResponse.file_id, settings.dataSource, shouldPreserveCharts);
        
        // 🔧 AUTO-RENDER: If autoRenderAfterLoad flag is set and charts exist, auto-trigger render
        const updatedAtom = useLaboratoryStore.getState().getAtom(atomId);
        const updatedSettings = (updatedAtom?.settings as SettingsType) || {};
        if ((updatedSettings as any).autoRenderAfterLoad && Array.isArray(updatedSettings.charts) && updatedSettings.charts.length > 0) {
          console.log('🚀 Auto-triggering render after file load...');
          // Clear the flag first to prevent re-triggering
          handleSettingsChange({ autoRenderAfterLoad: false });
          // Auto-trigger render after a small delay to ensure file is fully loaded
          setTimeout(() => {
            handleRenderCharts();
          }, 500);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reload dataframe');
        setLoading({ uploading: false });
      }
    };

    ensureFileReady();
    // Only run when the datasource changes on initial load
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.dataSource]);

  // 🔧 CRITICAL FIX: Track render state to prevent duplicate renders
  const isRenderingRef = useRef(false);
  const lastRenderTimeRef = useRef<number>(0);
  
  const handleRenderCharts = async () => {
    if (!settings.fileId) {
      setError('No file uploaded');
      return;
    }

    // 🔧 CRITICAL FIX: Prevent rapid re-renders (debounce)
    const now = Date.now();
    const timeSinceLastRender = now - lastRenderTimeRef.current;
    const minRenderInterval = 1000; // 1 second minimum between manual renders
    
    if (isRenderingRef.current) {
      console.log('⏸️ [RENDER] Already rendering, skipping to prevent duplicates');
      return;
    }
    
    if (timeSinceLastRender < minRenderInterval) {
      console.log('⏸️ [RENDER] Too soon since last render, skipping', {
        timeSinceLastRender,
        minRenderInterval
      });
      return;
    }

    isRenderingRef.current = true;
    lastRenderTimeRef.current = now;
    setLoading({ filtering: true });
    
    try {
      // Process each chart independently
      if (!Array.isArray(settings.charts)) {
        isRenderingRef.current = false;
        return;
      }
      
      // 🔧 CRITICAL FIX: Get fresh charts from store to avoid stale state
      const currentAtom = useLaboratoryStore.getState().getAtom(atomId);
      const currentSettings = (currentAtom?.settings as SettingsType) || { ...DEFAULT_CHART_MAKER_SETTINGS };
      const currentCharts = currentSettings.charts || [];
      
      // 🔧 CRITICAL: Verify chart IDs are stable - log if any are missing
      const chartsWithoutIds = currentCharts.filter(c => !c.id);
      if (chartsWithoutIds.length > 0) {
        console.error('❌ [RENDER] Charts without IDs detected!', chartsWithoutIds);
        isRenderingRef.current = false;
        setLoading({ filtering: false });
        return;
      }
      
      const updatedCharts = await Promise.all(
        currentCharts.map(async (chart) => {
          // 🔧 CRITICAL FIX: Preserve the original chart ID and all properties
          // Migrate legacy chart format
          const migratedChart = migrateLegacyChart(chart);
          
          if (!validateChart(migratedChart)) {
            // 🔧 CRITICAL: Preserve original chart object, just update chartRendered
            return { ...chart, chartRendered: false };
          }

          // Build traces for API
          const traces = buildTracesForAPI(migratedChart);
          
          // For advanced mode, filters are included in individual traces
          // For legacy mode, use merged filters for backward compatibility
          const legacyFilters = migratedChart.isAdvancedMode ? {} : mergeTraceFilters(migratedChart);

          // Get card_id and canvas_position for pipeline tracking
          const cards = useLaboratoryStore.getState().cards;
          const card = cards.find(c => Array.isArray(c.atoms) && c.atoms.some(a => a.id === atomId));
          const cardId = card?.id || '';
          const canvasPosition = card?.canvas_position ?? 0;
          
          // 🔧 NEW: Build all charts configuration for MongoDB
          // Get ALL charts from current settings to save them together
          const allChartsForConfig = currentCharts.map(c => {
            const migratedC = migrateLegacyChart(c);
            const cTraces = buildTracesForAPI(migratedC);
            const cLegacyFilters = migratedC.isAdvancedMode ? {} : mergeTraceFilters(migratedC);
            return {
              file_id: (currentSettings as any).dataSource || currentSettings.fileId!,
              chart_type: c.type === 'stacked_bar' ? 'bar' : c.type,
              title: c.title,
              traces: cTraces,
              filters: Object.keys(cLegacyFilters).length > 0 ? cLegacyFilters : undefined,
              second_y_axis: c.secondYAxis,
              dual_axis_mode: c.dualAxisMode,
            };
          });
          
          // Prepare chart request
          const chartRequest = {
            file_id: (currentSettings as any).dataSource || currentSettings.fileId!,
            chart_type: migratedChart.type === 'stacked_bar' ? 'bar' : migratedChart.type,
            traces: traces,
            title: migratedChart.title,
            filters: Object.keys(legacyFilters).length > 0 ? legacyFilters : undefined,
            validator_atom_id: atomId,
            card_id: cardId,
            canvas_position: canvasPosition,
            // Include dual axis configuration
            dual_axis_mode: chart.dualAxisMode,
            second_y_axis: chart.secondYAxis,
            // 🔧 NEW: Include ALL charts so MongoDB saves them together
            all_charts: allChartsForConfig,
          };

          try {
            // Call the charts endpoint to get recharts config
            const chartResponse = await chartMakerApi.generateChart(chartRequest);
            // 🔧 CRITICAL FIX: Preserve ALL original chart properties, especially ID
            // NEVER change the chart ID - it must remain stable
            const updatedChart = {
              ...chart, // Start with original chart to preserve ID and ALL properties
              ...migratedChart, // Apply migrated format (but don't override ID)
              chartConfig: chartResponse.chart_config,
              filteredData: chartResponse.chart_config.data, // Update filtered data from response
              lastUpdateTime: Date.now(), // <-- ensure this is set per chart
              chartRendered: true, // set to true after successful render
              chartLoading: false // Ensure loading is cleared
            };
            
            // 🔧 CRITICAL: Ensure ID is NEVER changed
            if (updatedChart.id !== chart.id) {
              console.error('❌ [RENDER] Chart ID changed during update! This should never happen.', {
                originalId: chart.id,
                newId: updatedChart.id
              });
              updatedChart.id = chart.id; // Force restore original ID
            }
            
            return updatedChart;
          } catch (error) {
            // 🔧 CRITICAL: Preserve original chart, just update chartRendered
            return { ...chart, chartRendered: false, chartLoading: false };
          }
        })
      );

      // 🔧 CRITICAL FIX: Update charts by index to prevent duplicates
      // Get fresh charts again to ensure we're working with latest state
      const latestAtom = useLaboratoryStore.getState().getAtom(atomId);
      const latestSettings = (latestAtom?.settings as SettingsType) || { ...DEFAULT_CHART_MAKER_SETTINGS };
      const latestCharts = latestSettings.charts || [];
      
      // 🔧 CRITICAL: Update by index to ensure exact chart replacement, not duplication
      const finalCharts = [...latestCharts];
      
      updatedCharts.forEach(updatedChart => {
        const existingIndex = finalCharts.findIndex(c => c.id === updatedChart.id);
        if (existingIndex !== -1) {
          // Chart exists - update it in place, preserving ALL original properties
          const existingChart = finalCharts[existingIndex];
          finalCharts[existingIndex] = {
            ...existingChart, // Preserve ALL existing properties from latest state
            ...updatedChart, // Apply updates
            id: existingChart.id // Force preserve original ID - NEVER change it
          };
        } else {
          // Chart doesn't exist - this shouldn't happen, but log a warning
          console.warn('⚠️ [RENDER] Chart not found in latest charts, skipping to prevent duplicate', {
            chartId: updatedChart.id,
            latestChartIds: latestCharts.map(c => c.id)
          });
          // Don't add it - this prevents duplicates
        }
      });

      // 🔧 CRITICAL: Final deduplication check before updating
      const finalChartIds = finalCharts.map(c => c.id);
      const finalUniqueIds = new Set(finalChartIds);
      if (finalChartIds.length !== finalUniqueIds.size) {
        console.error('❌ [RENDER] Duplicate chart IDs detected in final charts! Deduplicating...', {
          chartIds: finalChartIds,
          duplicateIds: finalChartIds.filter((id, index) => finalChartIds.indexOf(id) !== index)
        });
        // Remove duplicates, keeping the first occurrence
        const seen = new Set<string>();
        const deduplicatedFinal = finalCharts.filter((chart) => {
          if (seen.has(chart.id)) {
            return false;
          }
          seen.add(chart.id);
          return true;
        });
        handleSettingsChange({
          charts: deduplicatedFinal
        });
      } else {
        handleSettingsChange({
          charts: finalCharts
        });
      }

      setLoading({ filtering: false });
      isRenderingRef.current = false;
      toast({
        title: 'Chart rendered',
        description: 'Your chart is ready.',
        variant: 'default',
        duration: 2000,
      });

    } catch (error) {
      isRenderingRef.current = false;
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
            atomId={atomId}
            data={settings.uploadedData}
            onDataUpload={handleDataUpload}
            loading={settings.loading}
            error={settings.error}
            dataSource={settings.dataSource}
            hasExistingUpdates={hasExistingUpdates}
            settings={settings}
            onSettingsChange={handleSettingsChange}
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