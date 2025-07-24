import React, { useRef, useEffect } from 'react';
import ChartMakerCanvas from './components/ChartMakerCanvas';
import { useLaboratoryStore, DEFAULT_CHART_MAKER_SETTINGS, ChartMakerSettings as SettingsType, ChartMakerConfig } from '@/components/LaboratoryMode/store/laboratoryStore';
import { chartMakerApi } from '@/services/chartMakerApi';
import { useToast } from '@/hooks/use-toast';

export interface ChartData {
  columns: string[];
  rows: Record<string, any>[];
  numeric_columns?: string[];
  categorical_columns?: string[];
  unique_values?: Record<string, string[]>;
  file_id?: string;
  row_count?: number;
}

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

  // Store per-chart loading timers
  const chartLoadingTimers = useRef<Record<string, NodeJS.Timeout | number | null>>({});

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
    }, 1000);

    const updatedCharts = await Promise.all(settings.charts.map(async chart => {
      if (chart.id === chartId) {
        if ((chart as any).chartRendered && settings.fileId && chart.xAxis && chart.yAxis) {
          try {
            const chartRequest = {
              file_id: settings.fileId,
              chart_type: newType,
              traces: [{
                x_column: chart.xAxis,
                y_column: chart.yAxis,
                name: chart.title,
                chart_type: newType,
                aggregation: 'sum' as const,
              }],
              title: chart.title,
              filters: Object.keys(chart.filters).length > 0 ? chart.filters : undefined,
              filtered_data: chart.filteredData,
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
    }, 1000);

    const updatedCharts = await Promise.all(settings.charts.map(async chart => {
      if (chart.id === chartId) {
        const newFilters = { ...chart.filters, [column]: values };
        if ((chart as any).chartRendered && settings.fileId && chart.xAxis && chart.yAxis) {
          try {
            const chartRequest = {
              file_id: settings.fileId,
              chart_type: chart.type,
              traces: [{
                x_column: chart.xAxis,
                y_column: chart.yAxis,
                name: chart.title,
                chart_type: chart.type,
                aggregation: 'sum' as const,
              }],
              title: chart.title,
              filters: Object.keys(newFilters).length > 0 ? newFilters : undefined,
              filtered_data: chart.filteredData,
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

  // Grouped notification for rendering chart (chartLoading)
  React.useEffect(() => {
    const anyChartLoading = settings.charts.some(chart => chart.chartLoading);
    if (anyChartLoading) {
      toast({
        title: 'Rendering chart...',
        description: 'Applying settings and generating chart.',
        variant: 'default',
        duration: 2000,
      });
    } else if (!anyChartLoading && settings.charts.length > 0 && settings.charts.every(chart => chart.chartRendered) && !settings.error) {
      toast({
        title: 'Chart rendered',
        description: 'Your chart is ready.',
        variant: 'default',
        duration: 2000,
      });
    } else if (settings.error) {
      toast({
        title: 'Rendering failed',
        description: settings.error,
        variant: 'destructive',
        duration: 2000,
      });
    }
  }, [settings.charts, settings.error, toast]);

  // Auto-render charts when all filter columns have values selected and chartRendered is false
  useEffect(() => {
    if (!settings.fileId) return;
    settings.charts.forEach(async (chart) => {
      // Only consider charts that are not rendered yet
      if (!chart.chartRendered && chart.xAxis && chart.yAxis) {
        const filterColumns = Object.keys(chart.filters || {});
        // If there are filters, all must have at least one value selected
        const allFiltersSelected = filterColumns.length === 0 || filterColumns.every(
          (col) => Array.isArray(chart.filters[col]) && chart.filters[col].length > 0
        );
        if (allFiltersSelected) {
          // Trigger chart rendering for this chart
          // Use the same logic as handleChartTypeChange, but for current type
          // Prevent duplicate renders by setting chartLoading
          if (!chart.chartLoading) {
            // Set chartLoading to true for this chart
            updateSettings(atomId, {
              charts: settings.charts.map(c =>
                c.id === chart.id ? { ...c, chartLoading: true } : c
              ),
            });
            try {
              const chartRequest = {
                file_id: settings.fileId,
                chart_type: chart.type,
                traces: [{
                  x_column: chart.xAxis,
                  y_column: chart.yAxis,
                  name: chart.title,
                  chart_type: chart.type,
                  aggregation: 'sum' as const,
                }],
                title: chart.title,
                filters: filterColumns.length > 0 ? chart.filters : undefined,
                filtered_data: chart.filteredData,
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
            } catch (error) {
              updateSettings(atomId, {
                charts: settings.charts.map(c =>
                  c.id === chart.id
                    ? { ...c, chartRendered: false, chartLoading: false }
                    : c
                ),
              });
            }
          }
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.charts, settings.fileId, atomId, updateSettings]);

  // Only show rendered charts if they've been marked as rendered
  const chartsToShow = settings.uploadedData ? settings.charts : [];

  return (
    <div className="w-full h-full">
      <ChartMakerCanvas 
        charts={chartsToShow}
        data={settings.uploadedData}
        onChartTypeChange={handleChartTypeChange}
        onChartFilterChange={handleChartFilterChange}
      />
    </div>
  );
};

export default ChartMakerAtom;