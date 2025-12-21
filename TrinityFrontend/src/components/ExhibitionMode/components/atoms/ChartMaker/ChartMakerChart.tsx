import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import RechartsChartRenderer from '@/templates/charts/RechartsChartRenderer';
import { ChartMakerComponentProps } from './types';
import { DEFAULT_CHART_HEIGHT, getFilteredData } from './shared';
import { chartMakerApi } from '@/components/AtomList/atoms/chart-maker/services/chartMakerApi';
import { buildTracesForAPI, mergeTraceFilters, migrateLegacyChart } from '@/components/AtomList/atoms/chart-maker/utils/traceUtils';
import { useLongPress } from '@/hooks/useLongPress';
import { useIsMobile } from '@/hooks/use-mobile';

// FilterMenu component for selecting filter values
const FilterMenu = ({ 
  column, 
  uniqueValues, 
  current, 
  onColumnFilter,
  disabled = false
}: { 
  column: string;
  uniqueValues: string[];
  current: string[];
  onColumnFilter: (column: string, values: string[]) => void;
  disabled?: boolean;
}) => {
  const [temp, setTemp] = useState<string[]>(current);

  useEffect(() => {
    setTemp(current);
  }, [current]);

  const toggleVal = (val: string) => {
    setTemp(prev => (prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]));
  };

  const selectAll = () => {
    setTemp(temp.length === uniqueValues.length ? [] : uniqueValues);
  };

  const apply = () => {
    onColumnFilter(column, temp);
  };

  const cancel = () => {
    setTemp(current);
  };

  if (uniqueValues.length === 0) {
    return (
      <div className="w-64 p-4 text-sm text-muted-foreground">
        No values available for this column.
      </div>
    );
  }

  return (
    <div className="w-64 max-h-80 overflow-y-auto">
      <div className="p-2 border-b border-white/10">
        <div className="flex items-center space-x-2 mb-2">
          <Checkbox 
            checked={temp.length === uniqueValues.length && uniqueValues.length > 0} 
            onCheckedChange={selectAll}
            className="border-white/30"
          />
          <span className="text-sm font-medium text-white/90">Select All</span>
        </div>
      </div>
      <div className="p-2 space-y-1 max-h-60 overflow-y-auto">
        {uniqueValues.map((v, i) => (
          <div key={i} className="flex items-center space-x-2">
            <Checkbox 
              checked={temp.includes(v)} 
              onCheckedChange={() => !disabled && toggleVal(v)}
              className="border-white/30"
              disabled={disabled}
            />
            <span className={`text-sm ${disabled ? 'text-white/40' : 'text-white/80'}`}>{v}</span>
          </div>
        ))}
      </div>
      <div className="p-2 border-t border-white/10 flex space-x-2">
        <Button size="sm" onClick={apply} className="flex-1" disabled={disabled}>Apply</Button>
        <Button size="sm" variant="outline" onClick={cancel} className="flex-1 border-white/20 text-black hover:bg-white/10 bg-white/90" disabled={disabled}>
          Cancel
        </Button>
      </div>
    </div>
  );
};

// Interactive filter tabs component - clickable tabs with Popover menus
const InteractiveFilterTabs = ({ 
  filters, 
  uniqueValuesByColumn,
  onFilterChange,
  disabled = false
}: { 
  filters: Record<string, string[]>;
  uniqueValuesByColumn: Record<string, string[]>;
  onFilterChange: (column: string, values: string[]) => void;
  disabled?: boolean;
}) => {
  const activeFilters = Object.keys(filters).filter(col => 
    filters[col] && Array.isArray(filters[col]) && filters[col].length > 0
  );

  if (activeFilters.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {activeFilters.map((column) => {
        const selectedValues = filters[column] || [];
        const uniqueValues = uniqueValuesByColumn[column] || [];
        const allSelected = selectedValues.length === uniqueValues.length && uniqueValues.length > 0;
        
        return (
          <Popover key={column}>
            <PopoverTrigger asChild>
              <button 
                className={`px-4 py-1.5 bg-gradient-to-r from-blue-500/20 via-purple-500/20 to-blue-500/20 border border-blue-400/30 dark:border-purple-400/30 rounded-full text-sm font-medium text-blue-700 dark:text-purple-300 backdrop-blur-sm transition-colors ${
                  disabled 
                    ? 'opacity-50 cursor-not-allowed' 
                    : 'hover:border-blue-500/50 dark:hover:border-purple-500/50 cursor-pointer'
                }`}
                disabled={disabled}
              >
                {column} {allSelected ? '(All)' : `(${selectedValues.length} selected)`}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 bg-slate-900/95 border-white/20 backdrop-blur-sm" align="start">
              <FilterMenu 
                column={column}
                uniqueValues={uniqueValues}
                current={selectedValues}
                onColumnFilter={onFilterChange}
                disabled={disabled}
              />
            </PopoverContent>
          </Popover>
        );
      })}
    </div>
  );
};

// Chart settings interface
interface ChartSettings {
  theme?: string;
  showGrid?: boolean;
  showLegend?: boolean;
  showDataLabels?: boolean;
  showXAxisLabels?: boolean;
  showYAxisLabels?: boolean;
  sortOrder?: 'asc' | 'desc' | null;
  sortColumn?: string;
  seriesSettings?: Record<string, { color?: string; showDataLabels?: boolean }>;
  customTitle?: string;
  customXAxisLabel?: string;
  customYAxisLabel?: string;
  chartType?: string;
}

// LocalStorage helper functions
const getStorageKey = (chartId: string) => `shared-chart-${chartId}-settings`;

const saveChartSettingsToLocalStorage = (chartId: string, partialSettings: Partial<ChartSettings>) => {
  try {
    const key = getStorageKey(chartId);
    const existing = localStorage.getItem(key);
    const current = existing ? JSON.parse(existing) : {};
    const updated = { ...current, ...partialSettings };
    localStorage.setItem(key, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to save chart settings:', error);
  }
};

const loadChartSettingsFromLocalStorage = (chartId: string): Partial<ChartSettings> | null => {
  try {
    const key = getStorageKey(chartId);
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : null;
  } catch (error) {
    console.error('Failed to load chart settings:', error);
    return null;
  }
};

const ChartMakerChart: React.FC<ChartMakerComponentProps> = ({ metadata, variant }) => {
  const chartState = metadata.chartState;
  const chartId = metadata.chartId || 'chart-1';
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // Local state for interactive filters (allows users to change filter values)
  const [localFilters, setLocalFilters] = useState<Record<string, string[]>>(
    chartState?.filters || {}
  );

  // State for chart data from backend (updated when filters change)
  const [chartConfigData, setChartConfigData] = useState<any[] | null>(
    metadata.chartContext?.chartConfig?.data || null
  );

  // Loading state for chart regeneration
  const [isRegenerating, setIsRegenerating] = useState(false);

  // Chart settings state (for context menu changes)
  const initialChartConfig = metadata.chartContext?.chartConfig || {};
  const [chartSettings, setChartSettings] = useState<ChartSettings>(() => {
    // Initialize from metadata
    const base: ChartSettings = {
      theme: initialChartConfig.theme,
      showGrid: initialChartConfig.showGrid,
      showLegend: initialChartConfig.showLegend,
      showDataLabels: initialChartConfig.showDataLabels,
      showXAxisLabels: initialChartConfig.showXAxisLabels,
      showYAxisLabels: initialChartConfig.showYAxisLabels,
      sortOrder: initialChartConfig.sortOrder || null,
      sortColumn: initialChartConfig.sortColumn,
      seriesSettings: initialChartConfig.seriesSettings,
      customTitle: metadata.chartTitle,
      customXAxisLabel: initialChartConfig.customXAxisLabel,
      customYAxisLabel: initialChartConfig.customYAxisLabel,
      chartType: chartState?.chartType,
    };
    
    // Merge with localStorage if available
    const stored = loadChartSettingsFromLocalStorage(chartId);
    return stored ? { ...base, ...stored } : base;
  });

  // Update local filters and chartConfigData when chartState changes (e.g., when switching between charts)
  useEffect(() => {
    setLocalFilters(chartState?.filters || {});
    setChartConfigData(metadata.chartContext?.chartConfig?.data || null);
  }, [chartState?.filters, metadata.chartContext?.chartConfig?.data]);

  // Initialize chart settings from localStorage on mount
  useEffect(() => {
    const stored = loadChartSettingsFromLocalStorage(chartId);
    if (stored) {
      setChartSettings(prev => ({ ...prev, ...stored }));
    }
  }, [chartId]);

  // Get unique values for a column from uploadedData
  const getUniqueValuesForColumn = (column: string): string[] => {
    const uploadedData = metadata.chartContext?.uploadedData;
    
    // Use cached unique values if available (from backend)
    if (uploadedData?.uniqueValuesByColumn?.[column]) {
      return uploadedData.uniqueValuesByColumn[column];
    }
    
    // Fallback: calculate from rows
    if (uploadedData?.rows && Array.isArray(uploadedData.rows)) {
      const values = new Set(
        uploadedData.rows.map(row => String(row[column] || '')).filter(Boolean) as string[]
      );
      return Array.from(values).sort() as string[];
    }
    
    return [];
  };

  // Build uniqueValuesByColumn object for all filter columns
  const uniqueValuesByColumn = useMemo(() => {
    const filters = localFilters;
    const result: Record<string, string[]> = {};
    
    Object.keys(filters).forEach(column => {
      result[column] = getUniqueValuesForColumn(column);
    });
    
    return result;
  }, [localFilters, metadata.chartContext?.uploadedData]);

  // Regenerate chart with new filters using backend API
  const regenerateChartWithFilters = async (newFilters: Record<string, string[]>): Promise<any[]> => {
    if (!chartState || !metadata.chartContext) {
      throw new Error('Chart state or context is missing');
    }

    // Get file_id from chartContext
    const fileId = metadata.chartContext.dataSource || 
                   (metadata.chartContext as any).fileId || 
                   (metadata.chartContext.uploadedData as any)?.file_id;
    
    if (!fileId) {
      throw new Error('File ID is missing - cannot regenerate chart');
    }

    // Build chart configuration from chartState with new filters
    // Convert chartState to ChartMakerConfig format for buildTracesForAPI
    const chartConfig: any = {
      id: metadata.chartId || 'chart-1',
      title: metadata.chartTitle || 'Chart',
      type: chartState.chartType || 'line',
      xAxis: chartState.xAxis || '',
      yAxis: chartState.yAxis || '',
      secondYAxis: chartState.secondYAxis,
      dualAxisMode: chartState.dualAxisMode,
      filters: newFilters, // ✅ Use new filters (for simple mode)
      aggregation: chartState.aggregation || 'sum',
      legendField: chartState.legendField,
      isAdvancedMode: chartState.isAdvancedMode || false,
      // For advanced mode, update each trace's filters with new filters
      // For simple mode, traces will be built from chart-level filters
      traces: chartState.isAdvancedMode && chartState.traces
        ? chartState.traces.map((trace: any) => ({
            ...trace,
            // Apply new filters to each trace (merge with existing trace-specific filters)
            filters: { ...(trace.filters || {}), ...newFilters }
          }))
        : chartState.traces || [],
    };

    // Migrate chart to ensure proper format
    const migratedChart = migrateLegacyChart(chartConfig);

    // Build traces for API (traces now have updated filters if advanced mode)
    const traces = buildTracesForAPI(migratedChart);

    // For simple mode, use chart-level filters
    // For advanced mode, filters are in traces, so pass empty object
    const requestFilters = migratedChart.isAdvancedMode ? undefined : newFilters;

    // Build chart request
    const chartRequest = {
      file_id: fileId,
      chart_type: (chartState.chartType === 'stacked_bar' ? 'bar' : chartState.chartType) || 'line',
      traces: traces,
      title: metadata.chartTitle || 'Chart',
      filters: requestFilters, // For simple mode, pass filters at request level
    };

    // Call backend API to regenerate chart
    const chartResponse = await chartMakerApi.generateChart(chartRequest);

    // Return the new chart data
    return chartResponse.chart_config.data;
  };

  // Handle filter change callback - now calls backend to regenerate chart
  const handleFilterChange = async (column: string, values: string[]) => {
    const newFilters = {
      ...localFilters,
      [column]: values
    };

    // Update local state immediately (for UI feedback)
    setLocalFilters(newFilters);

    // Regenerate chart with backend API
    setIsRegenerating(true);
    try {
      const newChartData = await regenerateChartWithFilters(newFilters);
      // Update chartConfigData with new aggregated data from backend
      setChartConfigData(newChartData);
    } catch (error) {
      // Handle error - revert filters and show error message
      console.error('Failed to regenerate chart:', error);
      // Revert to previous filters
      setLocalFilters(chartState?.filters || {});
      // Optionally show error toast (if toast is available)
      // toast({ title: 'Error', description: 'Failed to update chart. Please try again.', variant: 'destructive' });
    } finally {
      setIsRegenerating(false);
    }
  };

  // Frontend-only callbacks (no backend API calls)
  const handleThemeChange = (theme: string) => {
    setChartSettings(prev => ({ ...prev, theme }));
    saveChartSettingsToLocalStorage(chartId, { theme });
  };

  const handleGridToggle = (enabled: boolean) => {
    setChartSettings(prev => ({ ...prev, showGrid: enabled }));
    saveChartSettingsToLocalStorage(chartId, { showGrid: enabled });
  };

  const handleLegendToggle = (enabled: boolean) => {
    setChartSettings(prev => ({ ...prev, showLegend: enabled }));
    saveChartSettingsToLocalStorage(chartId, { showLegend: enabled });
  };

  const handleDataLabelsToggle = (enabled: boolean) => {
    setChartSettings(prev => ({ ...prev, showDataLabels: enabled }));
    saveChartSettingsToLocalStorage(chartId, { showDataLabels: enabled });
  };

  const handleXAxisLabelsToggle = (enabled: boolean) => {
    setChartSettings(prev => ({ ...prev, showXAxisLabels: enabled }));
    saveChartSettingsToLocalStorage(chartId, { showXAxisLabels: enabled });
  };

  const handleYAxisLabelsToggle = (enabled: boolean) => {
    setChartSettings(prev => ({ ...prev, showYAxisLabels: enabled }));
    saveChartSettingsToLocalStorage(chartId, { showYAxisLabels: enabled });
  };

  const handleSortChange = (order: 'asc' | 'desc' | null) => {
    setChartSettings(prev => ({ ...prev, sortOrder: order }));
    saveChartSettingsToLocalStorage(chartId, { sortOrder: order });
  };

  const handleSeriesSettingsChange = (settings: Record<string, { color?: string; showDataLabels?: boolean }>) => {
    setChartSettings(prev => ({ ...prev, seriesSettings: settings }));
    saveChartSettingsToLocalStorage(chartId, { seriesSettings: settings });
  };

  const handleTitleChange = (title: string) => {
    setChartSettings(prev => ({ ...prev, customTitle: title }));
    saveChartSettingsToLocalStorage(chartId, { customTitle: title });
  };

  // Backend-required callback (chart type change)
  const handleChartTypeChange = async (newType: 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart' | 'stacked_bar_chart') => {
    if (!chartState || !metadata.chartContext) {
      console.error('Chart state or context is missing');
      return;
    }

    // Map RechartsChartRenderer type to ChartMakerConfig type
    const mappedType = newType === 'stacked_bar_chart' ? 'stacked_bar' : newType.replace('_chart', '') as any;

    setIsRegenerating(true);
    try {
      // Get file_id from chartContext
      const fileId = metadata.chartContext.dataSource || 
                     (metadata.chartContext as any).fileId || 
                     (metadata.chartContext.uploadedData as any)?.file_id;
      
      if (!fileId) {
        throw new Error('File ID is missing - cannot regenerate chart');
      }

      // Build chart configuration with new type
      const chartConfig: any = {
        id: chartId,
        title: chartSettings.customTitle || metadata.chartTitle || 'Chart',
        type: mappedType,
        xAxis: chartState.xAxis || '',
        yAxis: chartState.yAxis || '',
        secondYAxis: chartState.secondYAxis,
        dualAxisMode: chartState.dualAxisMode,
        filters: localFilters,
        aggregation: chartState.aggregation || 'sum',
        legendField: chartState.legendField,
        isAdvancedMode: chartState.isAdvancedMode || false,
        traces: chartState.traces || [],
      };

      const migratedChart = migrateLegacyChart(chartConfig);
      const traces = buildTracesForAPI(migratedChart);
      const legacyFilters = migratedChart.isAdvancedMode ? {} : mergeTraceFilters(migratedChart);

      const chartRequest = {
        file_id: fileId,
        chart_type: mappedType === 'stacked_bar' ? 'bar' : mappedType,
        traces: traces,
        title: chartSettings.customTitle || metadata.chartTitle || 'Chart',
        filters: Object.keys(legacyFilters).length > 0 ? legacyFilters : localFilters,
      };

      const chartResponse = await chartMakerApi.generateChart(chartRequest);

      // Update chart data
      setChartConfigData(chartResponse.chart_config.data);

      // Update chart type in settings
      setChartSettings(prev => ({ ...prev, chartType: mappedType }));
      saveChartSettingsToLocalStorage(chartId, { chartType: mappedType });
    } catch (error) {
      console.error('Failed to change chart type:', error);
    } finally {
      setIsRegenerating(false);
    }
  };

  // Prepare data for RechartsChartRenderer using chartConfigData from backend
  const chartData = useMemo(() => {
    if (!chartState || !metadata.chartContext) {
      return [];
    }
    
    // Use chartConfigData state (updated by backend API when filters change)
    if (chartConfigData && Array.isArray(chartConfigData) && chartConfigData.length > 0) {
      return chartConfigData;
    }
    
    // Fallback to original chartConfig.data (initial load)
    if (metadata.chartContext.chartConfig?.data && Array.isArray(metadata.chartContext.chartConfig.data)) {
      return metadata.chartContext.chartConfig.data;
    }
    
    return [];
  }, [chartState, metadata.chartContext, chartConfigData]); // ✅ Use chartConfigData instead of localFilters

  // Convert chart type from laboratory format to RechartsChartRenderer format
  const chartType = useMemo(() => {
    const type = chartState?.chartType || 'line';
    const typeMap: Record<string, 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart' | 'stacked_bar_chart'> = {
      'bar': 'bar_chart',
      'line': 'line_chart',
      'pie': 'pie_chart',
      'area': 'area_chart',
      'scatter': 'scatter_chart',
      'stacked_bar': 'stacked_bar_chart',
    };
    return typeMap[type] || 'line_chart';
  }, [chartState?.chartType]);

  // Determine yFields for dual axis support (same logic as Laboratory Mode)
  let yFields: string[] | undefined = undefined;
  let yAxisLabels: string[] | undefined = undefined;

  if (chartState) {
    const traces = chartState.traces || [];
    const isAdvancedMode = chartState.isAdvancedMode === true;
    
    // PRIORITY: If secondYAxis exists, use dual-axis mode (simple mode)
    // This takes precedence over traces unless explicitly in advanced mode with multiple traces
    if (chartState.secondYAxis) {
      const yAxis = chartState.yAxis ? String(chartState.yAxis).trim() : '';
      const secondYAxis = String(chartState.secondYAxis).trim();
      
      console.log('🔍 ChartMakerChart - Dual axis branch (PRIORITY):', { 
        yAxis, 
        secondYAxis, 
        yAxisValid: !!yAxis, 
        secondYAxisValid: !!secondYAxis,
        isAdvancedMode,
        tracesLength: traces.length,
      });
      
      // Both axes must be non-empty strings
      if (yAxis && secondYAxis) {
        yFields = [yAxis, secondYAxis];
        yAxisLabels = [yAxis, secondYAxis];
        console.log('🔍 ChartMakerChart - Set yFields to:', yFields);
      } else {
        console.log('🔍 ChartMakerChart - Failed validation, yFields not set');
      }
    }
    // Only use traces if explicitly in advanced mode AND secondYAxis is NOT set
    else if (isAdvancedMode && traces.length > 0) {
      // Advanced mode: use traces
      yFields = traces.map((t: any) => t.dataKey || t.yAxis);
      yAxisLabels = traces.map((t: any) => t.name || t.dataKey || t.yAxis);
      console.log('🔍 ChartMakerChart - Using traces mode (advanced):', { tracesLength: traces.length, yFields });
    } else {
      console.log('🔍 ChartMakerChart - No secondYAxis, single axis mode');
    }
  }

  // Determine if we should force single axis rendering
  const shouldForceSingleAxis = chartState?.dualAxisMode === 'single' && chartState?.secondYAxis && String(chartState.secondYAxis || '').trim().length > 0;

  // Debug logging (after yFields is determined)
  if (chartState?.secondYAxis) {
    console.log('🔍 ChartMakerChart - Dual axis detected:', {
      secondYAxis: chartState.secondYAxis,
      yAxis: chartState.yAxis,
      dualAxisMode: chartState.dualAxisMode,
      yFields,
      yAxisLabels,
      shouldForceSingleAxis,
      tracesLength: chartState.traces?.length || 0,
      conditionCheck: {
        hasSecondYAxis: !!chartState.secondYAxis,
        hasYAxis: !!chartState.yAxis,
        yAxisTrimmed: chartState.yAxis ? String(chartState.yAxis).trim() : '',
        secondYAxisTrimmed: chartState.secondYAxis ? String(chartState.secondYAxis).trim() : '',
      },
    });
  }

  if (!chartState) {
    return (
      <div className={`rounded-2xl border border-border bg-background/80 shadow-sm ${variant === 'compact' ? 'p-3' : 'p-6'}`}>
        <div className="flex min-h-[280px] items-center justify-center text-sm text-muted-foreground">
          Chart data will appear here after exporting from laboratory mode.
        </div>
      </div>
    );
  }

  if (!chartData || chartData.length === 0) {
    return (
      <div className={`rounded-2xl border border-border bg-background/80 shadow-sm ${variant === 'compact' ? 'p-3' : 'p-6'}`}>
        <div className="flex min-h-[280px] items-center justify-center text-sm text-muted-foreground">
          Chart data will appear here after exporting from laboratory mode.
        </div>
      </div>
    );
  }

  // Get saved chart configuration from chartConfig
  const chartConfig = metadata.chartContext?.chartConfig;
  
  // Map yFields to actual column names in the data (backend may add _trace_0, _trace_1 suffixes)
  let mappedYFields = yFields;
  if (yFields && yFields.length > 1 && chartData.length > 0) {
    const firstRow = chartData[0];
    const dataKeys = firstRow ? Object.keys(firstRow) : [];
    
    // Try to find columns that match the yField names (exact match or with _trace_ suffix)
    mappedYFields = yFields.map((yField) => {
      // First try exact match
      if (dataKeys.includes(yField)) {
        return yField;
      }
      // Then try to find column that starts with yField name (e.g., TV_Reach_trace_0)
      const matchingKey = dataKeys.find(key => key.startsWith(yField + '_') || key === yField);
      if (matchingKey) {
        console.log(`🔍 ChartMakerChart - Mapped ${yField} to ${matchingKey}`);
        return matchingKey;
      }
      return yField; // Fallback to original if not found
    });
    
    console.log('🔍 ChartMakerChart - Data check:', {
      originalYFields: yFields,
      mappedYFields,
      firstRowKeys: dataKeys,
      firstRow: firstRow,
    });
  }
  
  // Prepare props for RechartsChartRenderer (same format as Laboratory Mode)
  // Use mappedYFields if available, otherwise fall back to yFields
  const finalYFields = mappedYFields || yFields;
  // Use the first mapped Y field for yField prop (for backward compatibility)
  const finalYField = finalYFields && finalYFields.length > 0 ? finalYFields[0] : chartState.yAxis;
  
  // Calculate dynamic height: 300px for mobile, otherwise use default
  const chartHeight = isMobile ? 300 : DEFAULT_CHART_HEIGHT[variant];
  
  // Use chartSettings if available, otherwise fall back to chartConfig
  const rendererProps = {
    type: chartSettings.chartType ? (() => {
      const typeMap: Record<string, 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart' | 'stacked_bar_chart'> = {
        'bar': 'bar_chart',
        'line': 'line_chart',
        'pie': 'pie_chart',
        'area': 'area_chart',
        'scatter': 'scatter_chart',
        'stacked_bar': 'stacked_bar_chart',
      };
      return typeMap[chartSettings.chartType] || chartType;
    })() : chartType,
    data: chartData,
    xField: chartState.xAxis,
    yField: finalYField,
    yFields: finalYFields,
    title: chartSettings.customTitle || metadata.chartTitle,
    xAxisLabel: chartState.xAxis,
    yAxisLabel: chartState.yAxis,
    yAxisLabels: yAxisLabels,
    legendField: chartState.legendField && chartState.legendField !== 'aggregate' ? chartState.legendField : undefined,
    colors: chartConfig?.colors || ['#3b82f6', '#8b5cf6', '#10b981', '#f97316', '#ef4444'],
    height: chartHeight,
    theme: chartSettings.theme !== undefined ? chartSettings.theme : chartConfig?.theme,
    showLegend: chartSettings.showLegend !== undefined ? chartSettings.showLegend : chartConfig?.showLegend,
    showXAxisLabels: chartSettings.showXAxisLabels !== undefined ? chartSettings.showXAxisLabels : chartConfig?.showXAxisLabels,
    showYAxisLabels: chartSettings.showYAxisLabels !== undefined ? chartSettings.showYAxisLabels : chartConfig?.showYAxisLabels,
    showDataLabels: chartSettings.showDataLabels !== undefined ? chartSettings.showDataLabels : chartConfig?.showDataLabels,
    showGrid: chartSettings.showGrid !== undefined ? chartSettings.showGrid : chartConfig?.showGrid,
    sortOrder: chartSettings.sortOrder !== undefined ? chartSettings.sortOrder : (chartConfig?.sortOrder || null),
    sortColumn: chartSettings.sortColumn || chartConfig?.sortColumn,
    enableScroll: chartConfig?.enableScroll,
    chartsPerRow: chartConfig?.chartsPerRow,
    forceSingleAxis: shouldForceSingleAxis,
    seriesSettings: chartSettings.seriesSettings || chartConfig?.seriesSettings,
    customXAxisLabel: chartSettings.customXAxisLabel,
    customYAxisLabel: chartSettings.customYAxisLabel,
    isMobile: isMobile,
    // Callbacks for context menu
    onThemeChange: handleThemeChange,
    onGridToggle: handleGridToggle,
    onLegendToggle: handleLegendToggle,
    onDataLabelsToggle: handleDataLabelsToggle,
    onXAxisLabelsToggle: handleXAxisLabelsToggle,
    onYAxisLabelsToggle: handleYAxisLabelsToggle,
    onSortChange: handleSortChange,
    onSeriesSettingsChange: handleSeriesSettingsChange,
    onChartTypeChange: handleChartTypeChange,
    onTitleChange: handleTitleChange,
  };
  
  // Debug: Log renderer props
  if (finalYFields && finalYFields.length > 1) {
    // Verify both columns exist in data
    const firstRow = chartData[0];
    const hasBothColumns = firstRow && 
      finalYFields[0] in firstRow && 
      finalYFields[1] in firstRow;
    
    console.log('🔍 ChartMakerChart - Renderer props:', {
      originalYFields: yFields,
      mappedYFields: finalYFields,
      yAxisLabels,
      forceSingleAxis: shouldForceSingleAxis,
      dataLength: chartData.length,
      yField: finalYField,
      hasBothColumns,
      firstRowSample: firstRow ? {
        [finalYFields[0]]: firstRow[finalYFields[0]],
        [finalYFields[1]]: firstRow[finalYFields[1]],
      } : null,
    });
  }

  // Extract note from chartState
  const note = chartState?.note;

  // Long-press handler for mobile (only on chart region)
  const longPressHandlers = useLongPress({
    onLongPress: (e: TouchEvent) => {
      // Convert touch event to mouse event for context menu
      const touch = e.touches[0] || e.changedTouches[0];
      if (!touch) return;

      // Find the RechartsChartRenderer's chart container (the one with onContextMenu)
      // It should be inside our chartContainerRef
      if (chartContainerRef.current) {
        // Find the chart scroll container (RechartsChartRenderer's main container)
        const chartScrollContainer = chartContainerRef.current.querySelector('.chart-scroll-container');
        const targetElement = chartScrollContainer || chartContainerRef.current;

        // Dispatch contextmenu event on the target element
        // This will bubble to RechartsChartRenderer's handleContextMenu
        const contextMenuEvent = new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: touch.clientX,
          clientY: touch.clientY,
          button: 2, // Right mouse button
        });
        targetElement.dispatchEvent(contextMenuEvent);
      }
    },
    delay: 2500,
  });

  return (
    <div className="w-full">
      {/* Chart Title - top left */}
      {metadata.chartTitle && (
        <div className="text-left mb-4">
          <h3 className="text-lg sm:text-xl font-semibold text-white/95">
            {metadata.chartTitle}
          </h3>
        </div>
      )}

      {/* Interactive filter tabs - clickable tabs with Popover menus */}
      {localFilters && Object.keys(localFilters).length > 0 && (
        <div className="relative">
          {isRegenerating && (
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm z-10 rounded-lg pointer-events-none" />
          )}
          <InteractiveFilterTabs 
            filters={localFilters}
            uniqueValuesByColumn={uniqueValuesByColumn}
            onFilterChange={handleFilterChange}
            disabled={isRegenerating}
          />
        </div>
      )}
      
      {/* Chart visualization - with long-press support on chart region only */}
      <div 
        ref={chartContainerRef}
        style={{ width: '100%', height: chartHeight }} 
        className="mb-4 relative"
        {...longPressHandlers}
      >
        {isRegenerating && (
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-lg">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
              <p className="text-sm text-white/70">Updating chart...</p>
            </div>
          </div>
        )}
        <RechartsChartRenderer {...rendererProps} />
      </div>

      {/* Note section - if note exists */}
      {note && typeof note === 'string' && note.trim().length > 0 && (
        <div className="mt-4">
          <div className="text-sm font-medium text-white/70 mb-2">Note:</div>
          <div className="text-sm text-white/60 whitespace-pre-wrap leading-relaxed">
            {note}
          </div>
        </div>
      )}
    </div>
  );
};

export default ChartMakerChart;
