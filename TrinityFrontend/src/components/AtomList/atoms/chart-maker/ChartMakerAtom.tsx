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
  
  // Track previous fileId to detect file changes (pipeline file replacement)
  const prevFileIdRef = useRef<string | undefined>(settings.fileId);
  
  // Track rendering state to prevent infinite loops - track per chart, not globally
  const isRenderingRef = useRef<Record<string, boolean>>({});
  const lastRenderTimeRef = useRef<Record<string, number>>({});

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
            
            // Get card_id and canvas_position for pipeline tracking
            const cards = useLaboratoryStore.getState().cards;
            const card = cards.find(c => Array.isArray(c.atoms) && c.atoms.some(a => a.id === atomId));
            const cardId = card?.id || '';
            const canvasPosition = card?.canvas_position ?? 0;
            
            const chartRequest = {
              file_id: (settings as any).dataSource || settings.fileId,
              chart_type: newType === 'stacked_bar' ? 'bar' : newType,
              traces: traces,
              title: updatedChart.title,
              filters: Object.keys(legacyFilters).length > 0 ? legacyFilters : undefined,
              validator_atom_id: atomId,
              card_id: cardId,
              canvas_position: canvasPosition,
              // Include dual axis configuration
              dual_axis_mode: chart.dualAxisMode,
              second_y_axis: chart.secondYAxis,
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
            
            // Get card_id and canvas_position for pipeline tracking
            const cards = useLaboratoryStore.getState().cards;
            const card = cards.find(c => Array.isArray(c.atoms) && c.atoms.some(a => a.id === atomId));
            const cardId = card?.id || '';
            const canvasPosition = card?.canvas_position ?? 0;
            
            const chartRequest = {
              file_id: (settings as any).dataSource || settings.fileId,
              chart_type: chart.type === 'stacked_bar' ? 'bar' : chart.type,
              traces: traces,
              title: chart.title,
              filters: Object.keys(legacyFilters).length > 0 ? legacyFilters : undefined,
              validator_atom_id: atomId,
              card_id: cardId,
              canvas_position: canvasPosition,
              // Include dual axis configuration
              dual_axis_mode: chart.dualAxisMode,
              second_y_axis: chart.secondYAxis,
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
            
            // Get card_id and canvas_position for pipeline tracking
            const cards = useLaboratoryStore.getState().cards;
            const card = cards.find(c => Array.isArray(c.atoms) && c.atoms.some(a => a.id === atomId));
            const cardId = card?.id || '';
            const canvasPosition = card?.canvas_position ?? 0;
            
            const chartRequest = {
              file_id: (settings as any).dataSource || settings.fileId,
              chart_type: chart.type === 'stacked_bar' ? 'bar' : chart.type,
              traces: traces,
              title: chart.title,
              filters: Object.keys(legacyFilters).length > 0 ? legacyFilters : undefined,
              validator_atom_id: atomId,
              card_id: cardId,
              canvas_position: canvasPosition,
              // Include dual axis configuration
              dual_axis_mode: chart.dualAxisMode,
              second_y_axis: chart.secondYAxis,
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
    
    // 🔧 CRITICAL: Check if fileId changed (pipeline run with file replacement)
    const fileIdChanged = prevFileIdRef.current !== undefined && 
                         prevFileIdRef.current !== settings.fileId && 
                         prevFileIdRef.current !== '';
    
    // 🔧 CRITICAL FIX: Check if this is initial mount with unrendered charts (inactive mode scenario)
    // When component mounts in inactive mode after pipeline update, prevFileIdRef is initialized to new fileId
    // So fileIdChanged is false, but we still need to render charts
    const hasUnrenderedCharts = settings.charts && settings.charts.length > 0 && 
                                settings.charts.some((chart: any) => !chart.chartRendered && !chart.chartLoading);
    const isInitialMountWithUnrenderedCharts = initialMount.current && hasUnrenderedCharts;
    
    if (fileIdChanged) {
      console.log('🔄 [AUTO-RENDER] File ID changed (pipeline file replacement) - marking all charts for re-render', {
        oldFileId: prevFileIdRef.current,
        newFileId: settings.fileId
      });
      // Mark all charts for rendering when file changes
      const chartsToRender = settings.charts.map(chart => ({
        ...chart,
        chartRendered: false,
        chartLoading: false,
        pipelineAutoRender: true,
      }));
      updateSettings(atomId, { 
        charts: chartsToRender, 
        pipelineAutoRender: true 
      });
      prevFileIdRef.current = settings.fileId;
      return; // Let the normal auto-render logic handle it
    }
    
    // Update prevFileIdRef for next comparison
    prevFileIdRef.current = settings.fileId;
    
    // Prevent infinite loops - check if any chart is currently rendering
    const anyChartRendering = Object.values(isRenderingRef.current).some(rendering => rendering);
    if (anyChartRendering) {
      console.log('⏸️ [AUTO-RENDER] Some charts are rendering, will continue after they complete');
      // Don't return - we still want to process other charts that aren't rendering
    }
    
    // 🔧 CRITICAL: Get charts to process - update if autoRenderAfterPipeline flag is set or initial mount with unrendered charts
    let chartsToProcess = settings.charts || [];
    
    // 🔧 CRITICAL FIX: Handle initial mount with unrendered charts (inactive mode after pipeline update)
    if (isInitialMountWithUnrenderedCharts) {
      console.log('🔄 [AUTO-RENDER] Initial mount with unrendered charts (inactive mode after pipeline) - marking all charts for re-render', {
        chartsCount: settings.charts.length,
        unrenderedCount: settings.charts.filter((c: any) => !c.chartRendered).length
      });
      // Mark all charts for rendering immediately
      // Use these charts for processing in this same useEffect run
      chartsToProcess = settings.charts.map(chart => ({
        ...chart,
        chartRendered: false,
        chartLoading: false,
        pipelineAutoRender: true,
      }));
      
      // Update settings with marked charts (async, but we use chartsToProcess for immediate processing)
      updateSettings(atomId, { 
        charts: chartsToProcess, 
        pipelineAutoRender: true 
      });
    } else if ((settings as any).autoRenderAfterPipeline) {
      console.log('🚀 [AUTO-RENDER] Pipeline restoration detected - marking all charts for render');
      // Clear the flag first
      updateSettings(atomId, { autoRenderAfterPipeline: false });
      
      // 🔧 CRITICAL: Mark all charts for rendering immediately
      // Use these charts for processing in this same useEffect run
      chartsToProcess = settings.charts.map(chart => ({
        ...chart,
        chartRendered: false,
        chartLoading: false,
        pipelineAutoRender: true,
      }));
      
      // Update settings with marked charts (async, but we use chartsToProcess for immediate processing)
      updateSettings(atomId, { charts: chartsToProcess, pipelineAutoRender: true });
    }
    
    // Calculate current dependencies fresh (don't use memoized version to avoid stale comparisons)
    // NOTE: We intentionally DON'T include 'title' in dependencies because title changes shouldn't trigger re-renders
    // Title is just a display property and doesn't affect chart data/configuration
    const currentChartDeps = chartsToProcess.map(chart => ({
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
      isAdvancedMode: chart.isAdvancedMode,
      // Include chart type and other config that affects rendering
      type: chart.type
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
    
    // Process charts - use async function to handle await properly
    (async () => {
      // Use for...of loop to handle async rendering sequentially and ensure all charts render
      // 🔧 CRITICAL: Use chartsToProcess which includes pipeline updates
      for (const chart of chartsToProcess) {
      // Skip if chart is already rendered on initial mount (prevents unnecessary renders)
      if (initialMount.current && chart.chartRendered && chart.chartConfig) continue;
      // Skip if chart is already loading to prevent infinite loops
      if (chart.chartLoading) continue;
      
      // 🔧 CRITICAL FIX: Skip if chart is already rendered and nothing that affects rendering changed
      // Title changes don't affect rendering, so skip if chart is rendered and only non-rendering properties changed
      if (!initialMount.current && chart.chartRendered && chart.chartConfig && !changedChartIds.has(chart.id)) {
        // Chart is already rendered and nothing that affects rendering changed (like title)
        continue;
      }
      
      const migratedChart = migrateLegacyChart(chart);
      let shouldAutoRender = false;
      
      // Check for pipeline auto-render flag: if set and chart has xAxis/yAxis, trigger render
      const pipelineAutoRender = (chart as any).pipelineAutoRender || (settings as any).pipelineAutoRender;
      const isPipelineRestore = pipelineAutoRender; // 🔧 CRITICAL: Check pipelineAutoRender flag regardless of chartRendered status
      
      // ONLY auto-render if this specific chart changed, or if it's the initial mount, or if it's a pipeline restore
      // For pipeline restore, always render if chart has axes, regardless of changedChartIds or chartRendered status
      if (!initialMount.current && !changedChartIds.has(chart.id) && !isPipelineRestore) continue;
      
      // For pipeline restore, force render if chart has xAxis and yAxis (or legendField)
      if (isPipelineRestore) {
        const hasXAxis = !!chart.xAxis;
        let hasYAxis = false;
        
        if (migratedChart.isAdvancedMode && migratedChart.traces && migratedChart.traces.length > 0) {
          hasYAxis = migratedChart.traces.some(trace => !!trace.yAxis);
        } else {
          hasYAxis = !!chart.yAxis;
        }
        
        // Check if chart has filters - if so, check if all filters are selected
        let filtersReady = true;
        const filterColumns = Object.keys(chart.filters || {});
        if (filterColumns.length > 0) {
          // If filters exist, they must all have values selected
          filtersReady = filterColumns.every(
            (col) => Array.isArray(chart.filters[col]) && chart.filters[col].length > 0
          );
        }
        
        // Check if chart has legendField (segregation) - if so, it should auto-render
        const hasLegendField = chart.legendField && chart.legendField !== 'aggregate';
        
        // For pipeline restore, be more lenient - render if chart is valid OR has any configuration
        // This ensures all charts from pipeline get rendered
        if (validateChart(migratedChart)) {
          if (hasXAxis && hasYAxis) {
            shouldAutoRender = true;
          } else if (filterColumns.length > 0 && filtersReady) {
            // If chart has filters and they're all selected, render even without xAxis/yAxis
            // (they might be set in traces for advanced mode)
            shouldAutoRender = true;
          } else if (hasLegendField) {
            // If chart has legendField (segregation), render it
            shouldAutoRender = true;
          } else if (hasXAxis || hasYAxis) {
            // For pipeline restore, render if chart has at least one axis (more lenient)
            shouldAutoRender = true;
          }
        } else if (hasXAxis || hasYAxis || filterColumns.length > 0 || hasLegendField) {
          // Even if validation fails, if chart has any configuration, try to render it
          // This handles edge cases where charts might have partial configuration
          shouldAutoRender = true;
        }
      }
      
      if (chart.chartRendered) {
        // Case 1: Chart already rendered - auto-render when settings change and all axes have selections
        // 🔧 CRITICAL: If pipelineAutoRender flag is set, always re-render regardless of other conditions
        if (pipelineAutoRender) {
          const hasXAxis = !!chart.xAxis;
          let hasYAxes = false;
          
          if (migratedChart.isAdvancedMode && migratedChart.traces && migratedChart.traces.length > 0) {
            hasYAxes = migratedChart.traces.some(trace => !!trace.yAxis);
          } else {
            hasYAxes = !!chart.yAxis;
          }
          
          const hasLegendField = chart.legendField && chart.legendField !== 'aggregate';
          
          // If pipeline auto-render is set, render if chart has axes OR legendField
          if (hasXAxis && hasYAxes || hasLegendField) {
            shouldAutoRender = true;
            console.log('🔍 [AUTO-RENDER] Pipeline auto-render triggered for already-rendered chart', {
              chartId: chart.id,
              hasAxes: hasXAxis && hasYAxes,
              hasLegendField,
            });
          }
        } else {
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
            
            // Check if chart has filters - if filters exist and are selected, also trigger render
            const filterColumns = Object.keys(chart.filters || {});
            let filtersReady = true;
            if (filterColumns.length > 0) {
              filtersReady = filterColumns.every(
                (col) => Array.isArray(chart.filters[col]) && chart.filters[col].length > 0
              );
            }
            
            // Check if chart has legendField (segregation) - if so, it should auto-render
            const hasLegendField = chart.legendField && chart.legendField !== 'aggregate';
            
            // Auto-render if: (xAxis && yAxis) OR (filters are ready) OR (legendField is set)
            shouldAutoRender = (hasXAxis && hasYAxes) || (filterColumns.length > 0 && filtersReady) || hasLegendField;
          }
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
          const hasLegendField = chart.legendField && chart.legendField !== 'aggregate';
          const hasXAxis = !!chart.xAxis;
          const hasYAxis = !!chart.yAxis;
          
          if (filterColumns.length > 0) {
            const allFiltersSelected = filterColumns.every(
              (col) => Array.isArray(chart.filters[col]) && chart.filters[col].length > 0
            );
            shouldAutoRender = allFiltersSelected;
            console.log('🔍 [AUTO-RENDER] Single series mode filter check', {
              filterColumns,
              allFiltersSelected,
              filterValues: filterColumns.map(col => ({ col, count: Array.isArray(chart.filters[col]) ? chart.filters[col].length : 0 })),
              shouldAutoRender,
            });
          } else if (pipelineAutoRender && (hasXAxis && hasYAxis || hasLegendField)) {
            // If pipeline auto-render is set and chart has axes OR legendField, trigger render
            shouldAutoRender = true;
            console.log('🔍 [AUTO-RENDER] Pipeline auto-render triggered', {
              hasAxes: hasXAxis && hasYAxis,
              hasLegendField,
            });
          }
        }
      }
      
      // Auto-render if conditions are met
      if (shouldAutoRender && !chart.chartLoading && validateChart(migratedChart)) {
        // Prevent rapid re-renders - check if we rendered this chart recently
        const lastRenderTime = lastRenderTimeRef.current[chart.id] || 0;
        const timeSinceLastRender = Date.now() - lastRenderTime;
        const minRenderInterval = 2000; // 2 seconds minimum between renders for same chart
        
        // Skip if this specific chart is already rendering
        if (isRenderingRef.current[chart.id]) {
          console.log('⏸️ [AUTO-RENDER] Chart already rendering, skipping', {
            chartId: chart.id
          });
          continue;
        }
        
        // If chart is already rendered and nothing changed, skip (unless it's a pipeline restore)
        if (chart.chartRendered && !isPipelineRestore && !changedChartIds.has(chart.id)) {
          console.log('⏸️ [AUTO-RENDER] Skipping render - chart already rendered and nothing changed', {
            chartId: chart.id,
            isPipelineRestore,
            changedChartIds: Array.from(changedChartIds)
          });
          continue;
        }
        
        if (timeSinceLastRender < minRenderInterval && chart.chartRendered && !isPipelineRestore) {
          console.log('⏸️ [AUTO-RENDER] Skipping render - too soon since last render', {
            chartId: chart.id,
            timeSinceLastRender,
            minRenderInterval
          });
          continue;
        }
        
        console.log('✅ [AUTO-RENDER] Triggering chart render', {
          chartId: chart.id,
          chartType: chart.type,
          hasFilters: Object.keys(chart.filters || {}).length > 0,
          filterKeys: Object.keys(chart.filters || {}),
          isPipelineRestore,
        });
        
        // Set rendering flag for THIS specific chart to prevent concurrent renders
        isRenderingRef.current[chart.id] = true;
        lastRenderTimeRef.current[chart.id] = Date.now();
        
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
          
          // Get card_id and canvas_position for pipeline tracking
          const cards = useLaboratoryStore.getState().cards;
          const card = cards.find(c => Array.isArray(c.atoms) && c.atoms.some(a => a.id === atomId));
          const cardId = card?.id || '';
          const canvasPosition = card?.canvas_position ?? 0;
          
          // 🔧 NEW: Get ALL charts from current settings first
          const currentAtom = useLaboratoryStore.getState().getAtom(atomId);
          const currentSettings = (currentAtom?.settings as SettingsType) || { ...DEFAULT_CHART_MAKER_SETTINGS };
          const currentCharts = currentSettings.charts || [];
          
          // 🔧 NEW: Build all charts configuration for MongoDB
          // Get ALL charts from current settings to save them together
          const allChartsForConfig = currentCharts.map(c => {
            const migratedC = migrateLegacyChart(c);
            const cTraces = buildTracesForAPI(migratedC);
            const cLegacyFilters = migratedC.isAdvancedMode ? {} : mergeTraceFilters(migratedC);
            return {
              file_id: (settings as any).dataSource || settings.fileId,
              chart_type: c.type === 'stacked_bar' ? 'bar' : c.type,
              title: c.title,
              traces: cTraces,
              filters: Object.keys(cLegacyFilters).length > 0 ? cLegacyFilters : undefined,
              second_y_axis: c.secondYAxis,
              dual_axis_mode: c.dualAxisMode,
            };
          });
          
          const chartRequest = {
            file_id: (settings as any).dataSource || settings.fileId,
            chart_type: chart.type === 'stacked_bar' ? 'bar' : chart.type,
            traces: traces,
            title: chart.title,
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
          const chartResponse = await chartMakerApi.generateChart(chartRequest);
          
          // 🔧 CRITICAL FIX: Get fresh settings after API call to ensure we have latest state
          const freshAtom = useLaboratoryStore.getState().getAtom(atomId);
          const freshSettings = (freshAtom?.settings as SettingsType) || { ...DEFAULT_CHART_MAKER_SETTINGS };
          const freshCharts = freshSettings.charts || [];
          
          // 🔧 CRITICAL FIX: Check if chart already exists to prevent duplicates
          const existingChartIndex = freshCharts.findIndex(c => c.id === chart.id);
          if (existingChartIndex === -1) {
            console.warn('⚠️ [AUTO-RENDER] Chart not found in current charts, skipping update to prevent duplicate', {
              chartId: chart.id,
              currentChartIds: freshCharts.map(c => c.id)
            });
            // Clear rendering flag even if chart not found
            isRenderingRef.current[chart.id] = false;
            continue;
          }
          
          // Check if there are other charts that still need to render
          const otherChartsNeedRender = freshCharts.some(c => 
            c.id !== chart.id && 
            ((c as any).pipelineAutoRender || (freshSettings as any).pipelineAutoRender) &&
            !c.chartRendered
          );
          
          // 🔧 CRITICAL FIX: Update by index to ensure we're updating the exact chart, not creating a duplicate
          const updatedCharts = [...freshCharts];
          const existingChart = freshCharts[existingChartIndex];
          
          // 🔧 CRITICAL: Preserve ALL properties from existing chart, only update rendering-related fields
          // NEVER create a new chart object - always update the existing one
          const updatedChart = {
            ...existingChart, // Preserve ALL existing properties (including title, id, etc.)
            chartConfig: chartResponse.chart_config,
            filteredData: chartResponse.chart_config.data,
            lastUpdateTime: Date.now(),
            chartRendered: true,
            chartLoading: false,
            pipelineAutoRender: false, // Clear flag for this chart after successful render
          };
          
          // 🔧 CRITICAL: Force preserve original ID - it must NEVER change
          if (updatedChart.id !== existingChart.id) {
            console.error('❌ [AUTO-RENDER] Chart ID changed during update! Forcing restore.', {
              originalId: existingChart.id,
              newId: updatedChart.id
            });
            updatedChart.id = existingChart.id;
          }
          
          // Update by index to ensure exact replacement
          updatedCharts[existingChartIndex] = updatedChart;
          
          // 🔧 CRITICAL: Verify no duplicates before updating
          const chartIds = updatedCharts.map(c => c.id);
          const uniqueIds = new Set(chartIds);
          if (chartIds.length !== uniqueIds.size) {
            console.error('❌ [AUTO-RENDER] Duplicate chart IDs detected! Preventing update.', {
              chartIds,
              duplicateIds: chartIds.filter((id, index) => chartIds.indexOf(id) !== index)
            });
            // Clear rendering flag
            isRenderingRef.current[chart.id] = false;
            continue;
          }
          
          // 🔧 CRITICAL: Get the ABSOLUTE latest state right before updating to prevent race conditions
          const latestAtom = useLaboratoryStore.getState().getAtom(atomId);
          const latestSettings = (latestAtom?.settings as SettingsType) || { ...DEFAULT_CHART_MAKER_SETTINGS };
          const latestCharts = latestSettings.charts || [];
          const latestChartIndex = latestCharts.findIndex(c => c.id === chart.id);
          
          if (latestChartIndex === -1) {
            console.warn('⚠️ [AUTO-RENDER] Chart not found in latest state, skipping update to prevent duplicate', {
              chartId: chart.id,
              latestChartIds: latestCharts.map(c => c.id)
            });
            isRenderingRef.current[chart.id] = false;
            continue;
          }
          
          // 🔧 CRITICAL: Update by index in the LATEST state to ensure exact replacement
          // This prevents duplicates from race conditions
          const finalCharts = [...latestCharts];
          finalCharts[latestChartIndex] = {
            ...latestCharts[latestChartIndex], // Preserve all existing properties from latest state
            ...updatedChart, // Apply updates
            id: latestCharts[latestChartIndex].id // Force preserve original ID
          };
          
          // Final deduplication check before update
          const finalIds = finalCharts.map(c => c.id);
          const finalUniqueIds = new Set(finalIds);
          if (finalIds.length !== finalUniqueIds.size) {
            console.error('❌ [AUTO-RENDER] Duplicates detected in final update! Removing duplicates.', {
              finalIds,
              duplicateIds: finalIds.filter((id, index) => finalIds.indexOf(id) !== index)
            });
            const seen = new Set<string>();
            const deduplicated = finalCharts.filter(c => {
              if (seen.has(c.id)) return false;
              seen.add(c.id);
              return true;
            });
            updateSettings(atomId, {
              charts: deduplicated,
              pipelineAutoRender: otherChartsNeedRender ? true : false,
            });
          } else {
            updateSettings(atomId, {
              charts: finalCharts,
              pipelineAutoRender: otherChartsNeedRender ? true : false,
            });
          }
          
          // Clear rendering flag for THIS specific chart after a short delay
          setTimeout(() => {
            isRenderingRef.current[chart.id] = false;
          }, 500);
          
          toast({
            title: 'Chart rendered',
            description: 'Your chart is ready.',
            variant: 'default',
          });
        } catch (error) {
          console.error(`❌ [AUTO-RENDER] Error rendering chart ${chart.id}:`, error);
          
          // Get fresh settings to avoid stale state
          const currentAtom = useLaboratoryStore.getState().getAtom(atomId);
          const currentSettings = (currentAtom?.settings as SettingsType) || { ...DEFAULT_CHART_MAKER_SETTINGS };
          const currentCharts = currentSettings.charts || [];
          
          // Check if there are other charts that still need to render
          const otherChartsNeedRender = currentCharts.some(c => 
            c.id !== chart.id && 
            ((c as any).pipelineAutoRender || (currentSettings as any).pipelineAutoRender) &&
            !c.chartRendered
          );
          
          updateSettings(atomId, {
            charts: currentCharts.map(c =>
              c.id === chart.id
                ? { 
                    ...c, 
                    chartRendered: false, 
                    chartLoading: false,
                    pipelineAutoRender: false, // Clear flag for this chart on error
                  }
                : c
            ),
            // Only clear atom-level flag if all charts are done (or failed)
            pipelineAutoRender: otherChartsNeedRender ? true : false,
          });
          
          // Clear rendering flag for THIS specific chart
          isRenderingRef.current[chart.id] = false;
          
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
    }
    
    // Update previous dependencies AFTER processing all charts
    prevChartDepsRef.current = currentChartDeps;
    initialMount.current = false;
    })(); // Immediately invoke async function
  }, [
    settings.fileId, 
    settings.uploadedData, 
    atomId, 
    updateSettings, 
    settings.charts,
    (settings as any).autoRenderAfterPipeline, // 🔧 CRITICAL: Include pipeline flag in dependencies
    (settings as any).pipelineAutoRender, // 🔧 CRITICAL: Include pipeline flag in dependencies
  ]);

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