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

  // Prepare props for RechartsChartRenderer
  const rendererProps = {
    type: 'line_chart' as const,
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
  };

  return (
    <div 
      className="space-y-4"
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
