import React, { useMemo } from 'react';
// OLD D3 import - commented out (now using Recharts)
// import * as d3 from 'd3';
import RechartsChartRenderer from '@/templates/charts/RechartsChartRenderer';
import { ChartRendererConfig } from './shared';

// OLD D3-specific types - commented out (now using Recharts)
// type XValueType = 'date' | 'number' | 'category';
// interface SeriesPoint {
//   xValue: Date | number | string;
//   xLabel: string;
//   y: number;
// }
// interface TrendSeries {
//   id: string;
//   label: string;
//   color: string;
//   points: SeriesPoint[];
// }
// interface NormalisedChartData {
//   series: TrendSeries[];
//   xType: XValueType;
//   xLabel?: string;
//   yLabel?: string;
// }

const DEFAULT_COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f97316', '#ef4444'];
const DEFAULT_CHART_HEIGHT = 400;

// OLD D3 helper functions - commented out (now using Recharts)
// const toNumber = (value: unknown): number | null => {
//   if (typeof value === 'number') {
//     return Number.isFinite(value) ? value : null;
//   }
//   if (typeof value === 'string' && value.trim().length > 0) {
//     const parsed = Number(value);
//     return Number.isFinite(parsed) ? parsed : null;
//   }
//   return null;
// };
// const isValidDate = (value: Date) => Number.isFinite(value.getTime());
// const parseXValue = (value: unknown, index: number): { type: XValueType; value: Date | number | string; label: string } => { ... };
// const determineXType = (values: Array<{ type: XValueType }>): XValueType => { ... };
// const humanize = (value: string) => { ... };
// const buildSeries = (config: ChartRendererConfig): NormalisedChartData => { ... };
// const formatDateLabel = (value: Date): string => { ... };

const TrendAnalysisChart: React.FC<{ config: ChartRendererConfig }> = ({ config }) => {
  // OLD D3 rendering refs - commented out (now using Recharts)
  // const containerRef = useRef<HTMLDivElement | null>(null);
  // const svgRef = useRef<SVGSVGElement | null>(null);
  // const [width, setWidth] = useState<number>(600);
  // const { series, xType, xLabel, yLabel } = useMemo(() => buildSeries(config), [config]);

  // OLD D3 rendering logic - commented out (now using Recharts)
  // useEffect(() => { ... ResizeObserver logic ... }, []);
  // useEffect(() => { ... D3 SVG rendering logic ... }, [config.height, config.showAxisLabels, config.showGrid, series, width, xLabel, xType, yLabel]);

  // NEW Recharts implementation
  const chartData = useMemo(() => {
    return Array.isArray(config.data) ? config.data : [];
  }, [config.data]);

  if (!chartData || chartData.length === 0) {
    return (
      <div className="flex min-h-[280px] items-center justify-center text-sm text-muted-foreground">
        Trend analysis data was not captured for this component.
      </div>
    );
  }

  // Convert chart type to RechartsChartRenderer format
  const chartType = useMemo(() => {
    const type = config.type || 'line_chart';
    // Ensure it's in the correct format for RechartsChartRenderer
    const typeMap: Record<string, 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart' | 'stacked_bar_chart'> = {
      'bar': 'bar_chart',
      'line': 'line_chart',
      'pie': 'pie_chart',
      'area': 'area_chart',
      'scatter': 'scatter_chart',
      'stacked_bar': 'stacked_bar_chart',
      'bar_chart': 'bar_chart',
      'line_chart': 'line_chart',
      'pie_chart': 'pie_chart',
      'area_chart': 'area_chart',
      'scatter_chart': 'scatter_chart',
      'stacked_bar_chart': 'stacked_bar_chart',
    };
    return typeMap[type] || 'line_chart';
  }, [config.type]);

  // Map seriesSettings keys to match actual yField/legendField values
  // In feature-overview, seriesSettings might be saved with "value" key but yField is "volume"
  const mappedSeriesSettings = useMemo(() => {
    if (!config.seriesSettings || Object.keys(config.seriesSettings).length === 0) {
      return {};
    }

    const mapped: Record<string, { color?: string; showDataLabels?: boolean }> = {};
    const originalSettings = config.seriesSettings;
    const originalKeys = Object.keys(originalSettings);

    // If there's a legendField, map using legend values
    if (config.legendField && chartData.length > 0) {
      const legendValues = Array.from(new Set(chartData.map(row => {
        const value = row[config.legendField!];
        return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
      }).filter(Boolean)));
      
      // Try to map each original key to a legend value
      originalKeys.forEach(originalKey => {
        // Try exact match first
        if (legendValues.includes(originalKey)) {
          mapped[originalKey] = originalSettings[originalKey];
        } else {
          // Try to find a matching legend value
          const matchingLegend = legendValues.find((lv: string) => typeof lv === 'string' && lv.toLowerCase() === originalKey.toLowerCase()) as string | undefined;
          if (matchingLegend && typeof matchingLegend === 'string') {
            mapped[matchingLegend] = originalSettings[originalKey];
          }
        }
      });
    } else if (config.yField) {
      // No legendField - map to yField
      // Check if original key matches yField
      originalKeys.forEach(originalKey => {
        if (originalKey === config.yField) {
          mapped[config.yField] = originalSettings[originalKey];
        } else {
          // Common case: "value" key should map to yField (e.g., "volume")
          // This happens when backend normalizes data to "value" field
          if (originalKey === 'value' || originalKey === 'metricValue' || originalKey === 'metric_value') {
            mapped[config.yField] = originalSettings[originalKey];
          } else {
            // Fallback: try to match by similarity or use original key
            mapped[config.yField] = originalSettings[originalKey];
          }
        }
      });
    } else if (config.yFields && config.yFields.length > 0) {
      // Multiple yFields - map each original key to corresponding yField
      originalKeys.forEach((originalKey, index) => {
        const targetYField = config.yFields![index] || config.yFields![0];
        if (originalKey === targetYField) {
          mapped[targetYField] = originalSettings[originalKey];
        } else if (originalKey === 'value' || originalKey === 'metricValue' || originalKey === 'metric_value') {
          mapped[targetYField] = originalSettings[originalKey];
        } else {
          mapped[targetYField] = originalSettings[originalKey];
        }
      });
    }

    return mapped;
  }, [config.seriesSettings, config.yField, config.yFields, config.legendField, chartData]);

  // Prepare props for RechartsChartRenderer
  const rendererProps = {
    type: chartType,
    data: chartData,
    xField: config.xField,
    yField: config.yField,
    yFields: config.yFields,
    title: config.title,
    xAxisLabel: config.xAxisLabel,
    yAxisLabel: config.yAxisLabel,
    legendField: config.legendField,
    colors: config.colors || DEFAULT_COLORS,
    height: config.height || DEFAULT_CHART_HEIGHT,
    showLegend: config.showLegend !== undefined ? config.showLegend : true,
    // showAxisLabels: config.showAxisLabels !== undefined ? config.showAxisLabels : true,
    showXAxisLabels: config.showXAxisLabels !== undefined ? config.showXAxisLabels : true,
    showYAxisLabels: config.showYAxisLabels !== undefined ? config.showYAxisLabels : true,
    showDataLabels: config.showDataLabels !== undefined ? config.showDataLabels : false,
    showGrid: config.showGrid !== undefined ? config.showGrid : true,
    theme: config.theme || 'default',
    sortOrder: config.sortOrder || null,
    seriesSettings: mappedSeriesSettings,
  };

  // Debug: Log seriesSettings being passed to renderer
  if (config.seriesSettings && Object.keys(config.seriesSettings).length > 0) {
    const firstRow = chartData.length > 0 ? chartData[0] : {};
    const dataKeys = Object.keys(firstRow);
    console.log('🔍 TrendAnalysisChart - Mapping seriesSettings:', {
      originalSeriesSettings: config.seriesSettings,
      originalKeys: Object.keys(config.seriesSettings),
      mappedSeriesSettings: mappedSeriesSettings,
      mappedKeys: Object.keys(mappedSeriesSettings),
      yField: rendererProps.yField,
      legendField: rendererProps.legendField,
      yFields: rendererProps.yFields,
      dataKeys: dataKeys,
      willMatch: rendererProps.yField ? mappedSeriesSettings[rendererProps.yField] !== undefined : false,
    });
  }

  return (
    <div 
      className="space-y-4 w-full max-w-full min-w-0"
      onContextMenu={(e) => {
        // Prevent context menu in ExhibitionMode to match ChartMaker behavior
        e.preventDefault();
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
      }}
      onContextMenuCapture={(e) => {
        // Additional capture phase prevention for context menu
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div style={{ width: '100%', height: config.height || DEFAULT_CHART_HEIGHT }}>
        <RechartsChartRenderer {...rendererProps} />
      </div>
    </div>
  );
};

export default TrendAnalysisChart;
