import React, { useRef, useEffect } from 'react';
import ChartMakerCanvas from './components/ChartMakerCanvas';
import { useLaboratoryStore, DEFAULT_CHART_MAKER_SETTINGS, ChartMakerSettings as SettingsType, ChartMakerConfig } from '@/components/LaboratoryMode/store/laboratoryStore';
import { chartMakerApi } from './services/chartMakerApi';
import { useToast } from '@/hooks/use-toast';
import { BarChart3 } from 'lucide-react';
import { 
  migrateLegacyChart, 
  buildTracesForAPI, 
  mergeTraceFilters, 
  validateChart 
} from './utils/traceUtils';

export interface ChartConfig {
  id: string;
  title: string;
  type: 'line' | 'bar' | 'area' | 'pie' | 'scatter';
  xAxis: string;
  yAxis: string;
  filters: Record<string, string[]>;
}

interface Props {
  atomId: string;
}

const ChartMakerAtom: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings: SettingsType = (atom?.settings as SettingsType) || { ...DEFAULT_CHART_MAKER_SETTINGS };
  const { toast } = useToast();
  
  // 🔧 CRITICAL FIX: Log atom state for debugging
  console.log('🔍 ChartMakerAtom render:', {
    atomId,
    atomExists: !!atom,
    hasFileId: !!settings.fileId,
    hasUploadedData: !!settings.uploadedData,
    chartsCount: settings.charts?.length || 0,
    chartRendered: settings.chartRendered
  });

  // Store per-chart loading timers
  const chartLoadingTimers = useRef<Record<string, NodeJS.Timeout | number | null>>({});
  const initialMount = useRef(true);

  // Track previous chart auto-render dependencies to detect which specific chart changed
  const prevChartDepsRef = useRef<any[]>([]);

  const handleChartTypeChange = async (chartId: string, newType: ChartConfig['type']) => {
    // Start debounce timer for loading spinner
    if (chartLoadingTimers.current[chartId]) clearTimeout(chartLoadingTimers.current[chartId]!);
    let setLoading = false;
    chartLoadingTimers.current[chartId] = setTimeout(() => {
      setLoading = true;
      updateSettings(atomId, {
        charts: settings.charts.map(chart =>
          chart.id === chartId ? { ...chart, chartLoading: true } : chart
        ),
      });
      // Notification logic here
      toast({
        title: 'Rendering chart...',
        description: 'Applying settings and generating chart.',
        variant: 'default',
      });
    }, 1000);

    const updatedCharts = await Promise.all(settings.charts.map(async chart => {
      if (chart.id === chartId) {
        // Migrate legacy chart format
        const migratedChart = migrateLegacyChart(chart);
        
        if ((chart as any).chartRendered && settings.fileId && validateChart({ ...migratedChart, type: newType })) {
          try {
            const updatedChart = { ...migratedChart, type: newType };
            const traces = buildTracesForAPI(updatedChart);
            
            // For advanced mode, filters are included in individual traces
            // For legacy mode, use merged filters for backward compatibility
            const legacyFilters = updatedChart.isAdvancedMode ? {} : mergeTraceFilters(updatedChart);
            
            const chartRequest = {
              file_id: (settings as any).dataSource || settings.fileId,
              chart_type: newType === 'stacked_bar' ? 'bar' : newType,
              traces: traces,
              title: updatedChart.title,
              filters: Object.keys(legacyFilters).length > 0 ? legacyFilters : undefined,
            };
            const chartResponse = await chartMakerApi.generateChart(chartRequest);
            if (chartLoadingTimers.current[chartId]) {
              clearTimeout(chartLoadingTimers.current[chartId]!);
              chartLoadingTimers.current[chartId] = null;
            }
            return {
              ...chart,
              type: newType,
              chartConfig: chartResponse.chart_config,
              filteredData: chartResponse.chart_config.data,
              lastUpdateTime: Date.now(),
              chartRendered: true,
              chartLoading: false,
            };
          } catch (error) {
            if (chartLoadingTimers.current[chartId]) {
              clearTimeout(chartLoadingTimers.current[chartId]!);
              chartLoadingTimers.current[chartId] = null;
            }
            return { ...chart, type: newType, chartRendered: false, chartLoading: false };
          }
        } else {
          if (chartLoadingTimers.current[chartId]) {
            clearTimeout(chartLoadingTimers.current[chartId]!);
            chartLoadingTimers.current[chartId] = null;
          }
          return { ...chart, type: newType, chartLoading: false };
        }
      }
      return chart;
    }));
    updateSettings(atomId, { charts: updatedCharts });
  };

  const handleChartFilterChange = async (chartId: string, column: string, values: string[]) => {
    // Start debounce timer for loading spinner
    if (chartLoadingTimers.current[chartId]) clearTimeout(chartLoadingTimers.current[chartId]!);
    let setLoading = false;
    chartLoadingTimers.current[chartId] = setTimeout(() => {
      setLoading = true;
      updateSettings(atomId, {
        charts: settings.charts.map(chart =>
          chart.id === chartId ? { ...chart, chartLoading: true } : chart
        ),
      });
      // Notification logic here
      toast({
        title: 'Rendering chart...',
        description: 'Applying settings and generating chart.',
        variant: 'default',
      });
    }, 1000);

    const updatedCharts = await Promise.all(settings.charts.map(async chart => {
      if (chart.id === chartId) {
        // Migrate legacy chart format
        const migratedChart = migrateLegacyChart(chart);
        const newFilters = { ...chart.filters, [column]: values };
        
        if ((chart as any).chartRendered && settings.fileId && validateChart(migratedChart)) {
          try {
            const updatedChart = { ...migratedChart, filters: newFilters };
            const traces = buildTracesForAPI(updatedChart);
            
            // For advanced mode, filters are included in individual traces
            // For legacy mode, use merged filters for backward compatibility
            const legacyFilters = updatedChart.isAdvancedMode ? {} : mergeTraceFilters(updatedChart);
            
            const chartRequest = {
              file_id: (settings as any).dataSource || settings.fileId,
              chart_type: chart.type === 'stacked_bar' ? 'bar' : chart.type,
              traces: traces,
              title: chart.title,
              filters: Object.keys(legacyFilters).length > 0 ? legacyFilters : undefined,
            };
            const chartResponse = await chartMakerApi.generateChart(chartRequest);
            if (chartLoadingTimers.current[chartId]) {
              clearTimeout(chartLoadingTimers.current[chartId]!);
              chartLoadingTimers.current[chartId] = null;
            }
            return {
              ...chart,
              filters: newFilters,
              chartConfig: chartResponse.chart_config,
              filteredData: chartResponse.chart_config.data,
              lastUpdateTime: Date.now(),
              chartRendered: true,
              chartLoading: false,
            };
          } catch (error) {
            if (chartLoadingTimers.current[chartId]) {
              clearTimeout(chartLoadingTimers.current[chartId]!);
              chartLoadingTimers.current[chartId] = null;
            }
            return { ...chart, filters: newFilters, chartRendered: false, chartLoading: false };
          }
        } else {
          if (chartLoadingTimers.current[chartId]) {
            clearTimeout(chartLoadingTimers.current[chartId]!);
            chartLoadingTimers.current[chartId] = null;
          }
          return { ...chart, filters: newFilters, chartLoading: false };
        }
      }
      return chart;
    }));
    updateSettings(atomId, { charts: updatedCharts });
  };

  const handleTraceFilterChange = async (chartId: string, traceIndex: number, column: string, values: string[]) => {
    // Start debounce timer for loading spinner
    if (chartLoadingTimers.current[chartId]) clearTimeout(chartLoadingTimers.current[chartId]!);
    let setLoading = false;
    chartLoadingTimers.current[chartId] = setTimeout(() => {
      setLoading = true;
      updateSettings(atomId, {
        charts: settings.charts.map(chart =>
          chart.id === chartId ? { ...chart, chartLoading: true } : chart
        ),
      });
      // Notification logic here
      toast({
        title: 'Rendering chart...',
        description: 'Updating trace filter and regenerating chart.',
        variant: 'default',
      });
    }, 1000);

    const updatedCharts = await Promise.all(settings.charts.map(async chart => {
      if (chart.id === chartId) {
        // Migrate legacy chart format
        const migratedChart = migrateLegacyChart(chart);
        
        // Update the specific trace filter
        const updatedTraces = (migratedChart.traces || []).map((trace, idx) => {
          if (idx === traceIndex) {
            return {
              ...trace,
              filters: { ...trace.filters, [column]: values }
            };
          }
          return trace;
        });
        
        if ((chart as any).chartRendered && settings.fileId && validateChart(migratedChart)) {
          try {
            const updatedChart = { ...migratedChart, traces: updatedTraces };
            const traces = buildTracesForAPI(updatedChart);
            
            // For advanced mode, filters are included in individual traces
            // For legacy mode, use merged filters for backward compatibility
            const legacyFilters = updatedChart.isAdvancedMode ? {} : mergeTraceFilters(updatedChart);
            
            const chartRequest = {
              file_id: (settings as any).dataSource || settings.fileId,
              chart_type: chart.type === 'stacked_bar' ? 'bar' : chart.type,
              traces: traces,
              title: chart.title,
              filters: Object.keys(legacyFilters).length > 0 ? legacyFilters : undefined,
            };
            const chartResponse = await chartMakerApi.generateChart(chartRequest);
            if (chartLoadingTimers.current[chartId]) {
              clearTimeout(chartLoadingTimers.current[chartId]!);
              chartLoadingTimers.current[chartId] = null;
            }
            return {
              ...chart,
              traces: updatedTraces,
              chartConfig: chartResponse.chart_config,
              filteredData: chartResponse.chart_config.data,
              lastUpdateTime: Date.now(),
              chartRendered: true,
              chartLoading: false,
            };
          } catch (error) {
            if (chartLoadingTimers.current[chartId]) {
              clearTimeout(chartLoadingTimers.current[chartId]!);
              chartLoadingTimers.current[chartId] = null;
            }
            return { ...chart, traces: updatedTraces, chartRendered: false, chartLoading: false };
          }
        } else {
          if (chartLoadingTimers.current[chartId]) {
            clearTimeout(chartLoadingTimers.current[chartId]!);
            chartLoadingTimers.current[chartId] = null;
          }
          return { ...chart, traces: updatedTraces, chartLoading: false };
        }
      }
      return chart;
    }));
    updateSettings(atomId, { charts: updatedCharts });
  };

  const handleTraceFilterRemove = async (chartId: string, traceIndex: number, column: string) => {
    const updatedCharts = settings.charts.map(chart => {
      if (chart.id === chartId) {
        // Migrate legacy chart format
        const migratedChart = migrateLegacyChart(chart);
        
        // Remove the specific column filter from the trace
        const updatedTraces = (migratedChart.traces || []).map((trace, idx) => {
          if (idx === traceIndex) {
            const { [column]: removed, ...remainingFilters } = trace.filters || {};
            return {
              ...trace,
              filters: remainingFilters
            };
          }
          return trace;
        });
        
        return { ...chart, traces: updatedTraces };
      }
      return chart;
    });
    updateSettings(atomId, { charts: updatedCharts });
  };

  // Auto-render charts based on chartRendered status and different conditions for single/multi-series
  useEffect(() => {
    if (!settings.fileId || !settings.uploadedData) return;
    
    // Calculate current dependencies fresh (don't use memoized version to avoid stale comparisons)
    const currentChartDeps = settings.charts.map(chart => ({
      id: chart.id,
      xAxis: chart.xAxis,
      yAxis: chart.yAxis,
      aggregation: chart.aggregation,
      legendField: chart.legendField,
      traces: chart.traces?.map(trace => ({
        yAxis: trace.yAxis,
        filters: Object.keys(trace.filters || {}),
        filterValues: Object.values(trace.filters || {}).map(vals => (vals as string[]).length)
      })),
      filters: Object.keys(chart.filters || {}),
      filterValues: Object.values(chart.filters || {}).map(vals => vals.length),
      chartRendered: chart.chartRendered,
      isAdvancedMode: chart.isAdvancedMode
    }));
    
    // Detect which charts actually changed by comparing with previous dependencies
    const changedChartIds = new Set<string>();
    currentChartDeps.forEach((currentDeps, index) => {
      const prevDeps = prevChartDepsRef.current[index];
      
      // Check if this specific chart changed (not on initial mount)
      if (!initialMount.current && prevDeps) {
        const currentStr = JSON.stringify(currentDeps);
        const prevStr = JSON.stringify(prevDeps);
        if (currentStr !== prevStr) {
          changedChartIds.add(currentDeps.id);
        }
      }
    });
    
    settings.charts.forEach(async (chart) => {
      if (initialMount.current && chart.chartRendered && chart.chartConfig) return;
      // Skip if chart is already loading to prevent infinite loops
      if (chart.chartLoading) return;
      
      // ONLY auto-render if this specific chart changed, or if it's the initial mount
      if (!initialMount.current && !changedChartIds.has(chart.id)) return;
      
      const migratedChart = migrateLegacyChart(chart);
      let shouldAutoRender = false;
      
      if (chart.chartRendered) {
        // Case 1: Chart already rendered - auto-render when settings change and all axes have selections
        // Only re-render if enough time has passed since last update to prevent rapid re-renders
        const timeSinceLastUpdate = Date.now() - (chart.lastUpdateTime || 0);
        const minUpdateInterval = 1000; // 1 second minimum between updates
        
        if (validateChart(migratedChart) && timeSinceLastUpdate > minUpdateInterval) {
          const hasXAxis = !!chart.xAxis;
          let hasYAxes = false;
          
          if (migratedChart.isAdvancedMode && migratedChart.traces && migratedChart.traces.length > 0) {
            // Multi-series mode: at least one trace must have y-axis
            hasYAxes = migratedChart.traces.some(trace => !!trace.yAxis);
          } else {
            // Single series mode: check the main yAxis
            hasYAxes = !!chart.yAxis;
          }
          
          shouldAutoRender = hasXAxis && hasYAxes;
        }
      } else {
        // Case 2: Chart not rendered yet - auto-render when filter conditions are met
        if (migratedChart.isAdvancedMode && migratedChart.traces && migratedChart.traces.length > 0) {
          // Multi-series mode: check filter conditions
          let hasFilterColumns = false;
          let allSelectedFiltersHaveValues = true;
          
          for (const trace of migratedChart.traces) {
            const traceFilterColumns = Object.keys(trace.filters || {});
            if (traceFilterColumns.length > 0) {
              hasFilterColumns = true;
              // Check if all filter columns in this trace have at least one value selected
              const allTraceFiltersSelected = traceFilterColumns.every(
                (col) => Array.isArray(trace.filters![col]) && trace.filters![col].length > 0
              );
              if (!allTraceFiltersSelected) {
                allSelectedFiltersHaveValues = false;
                break;
              }
            }
          }
          
          shouldAutoRender = hasFilterColumns && allSelectedFiltersHaveValues;
        } else {
          // Single series mode: check legacy filter conditions (existing logic)
          const filterColumns = Object.keys(chart.filters || {});
          if (filterColumns.length > 0) {
            const allFiltersSelected = filterColumns.every(
              (col) => Array.isArray(chart.filters[col]) && chart.filters[col].length > 0
            );
            shouldAutoRender = allFiltersSelected;
          }
        }
      }
      
      // Auto-render if conditions are met
      if (shouldAutoRender && !chart.chartLoading && validateChart(migratedChart)) {
        updateSettings(atomId, {
          charts: settings.charts.map(c =>
            c.id === chart.id ? { ...c, chartLoading: true } : c
          ),
        });
        try {
          const traces = buildTracesForAPI(migratedChart);
          
          // For advanced mode, filters are included in individual traces
          // For legacy mode, use merged filters for backward compatibility
          const legacyFilters = migratedChart.isAdvancedMode ? {} : mergeTraceFilters(migratedChart);
          
          const chartRequest = {
            file_id: (settings as any).dataSource || settings.fileId,
            chart_type: chart.type === 'stacked_bar' ? 'bar' : chart.type,
            traces: traces,
            title: chart.title,
            filters: Object.keys(legacyFilters).length > 0 ? legacyFilters : undefined,
          };
          const chartResponse = await chartMakerApi.generateChart(chartRequest);
          updateSettings(atomId, {
            charts: settings.charts.map(c =>
              c.id === chart.id
                ? {
                    ...c,
                    chartConfig: chartResponse.chart_config,
                    filteredData: chartResponse.chart_config.data,
                    lastUpdateTime: Date.now(),
                    chartRendered: true,
                    chartLoading: false,
                  }
                : c
            ),
          });
          toast({
            title: 'Chart rendered',
            description: 'Your chart is ready.',
            variant: 'default',
          });
        } catch (error) {
          updateSettings(atomId, {
            charts: settings.charts.map(c =>
              c.id === chart.id
                ? { ...c, chartRendered: false, chartLoading: false }
                : c
            ),
          });
          let errorMessage = 'Failed to render chart';
          if (error instanceof Error) {
            errorMessage = error.message;
          } else if (error && typeof error === 'object' && 'message' in error) {
            errorMessage = String(error.message);
          } else if (error && typeof error === 'string') {
            errorMessage = error;
          }
          toast({
            title: 'Rendering failed',
            description: errorMessage,
            variant: 'destructive',
          });
        }
      }
    });
    
    // Update previous dependencies AFTER processing all charts
    prevChartDepsRef.current = currentChartDeps;
    initialMount.current = false;
  }, [settings.fileId, settings.uploadedData, atomId, updateSettings, settings.charts]);

  // Only show rendered charts if they've been marked as rendered
  const chartsToShow = settings.charts;

  // 🔧 CRITICAL FIX: Show landing page when no file is selected (prevents white screen)
  // This prevents white screen when called from central AI or when dragging atom before file selection
  if (!settings.fileId || !settings.uploadedData) {
    // console.log('⏳ ChartMakerAtom: Waiting for file data...', {
    //   fileId: settings.fileId,
    //   hasUploadedData: !!settings.uploadedData,
    //   chartsCount: settings.charts?.length || 0
    // });
    
    // Always show landing page when no file is selected, regardless of charts configured
    return (
      <div className="w-full h-full p-6 bg-gradient-to-br from-slate-50 via-purple-50/30 to-purple-50/50 overflow-y-auto relative">
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
            <div className="w-24 h-24 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center shadow-2xl transform rotate-3 hover:rotate-0 transition-transform duration-300">
              <BarChart3 className="w-12 h-12 text-white drop-shadow-lg" />
            </div>
            <h3 className="text-3xl font-bold text-gray-900 mb-3 bg-gradient-to-r from-purple-500 to-purple-600 bg-clip-text text-transparent">
              Chart maker operation
            </h3>
            <p className="text-gray-600 mb-6 text-lg font-medium leading-relaxed">
              Select a file from the properties panel to get started
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[28rem]">
      <ChartMakerCanvas 
        atomId={atomId}
        charts={chartsToShow}
        data={settings.uploadedData}
        onChartTypeChange={handleChartTypeChange}
        onChartFilterChange={handleChartFilterChange}
        onTraceFilterChange={handleTraceFilterChange}
      />
    </div>
  );
};

export default ChartMakerAtom;