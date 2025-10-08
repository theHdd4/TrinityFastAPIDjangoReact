import React from 'react';
import { Card } from '@/components/ui/card';
import { TrendingUp, BarChart3 } from 'lucide-react';
import RechartsChartRenderer from '@/templates/charts/RechartsChartRenderer';

type TimeseriesPoint = { date: string | number; value: number };

type ChartSettings = {
  chartType?: string;
  chartTheme?: string;
  showDataLabels?: boolean;
  showAxisLabels?: boolean;
  xAxisLabel?: string;
  yAxisLabel?: string;
};

export interface StatisticalSummaryAtomMetadata {
  metric?: string;
  metricLabel?: string;
  summary?: Record<string, any>;
  timeseries?: TimeseriesPoint[];
  chartSettings?: ChartSettings;
  chart_settings?: {
    chart_type?: string;
    chart_theme?: string;
    show_data_labels?: boolean;
    show_axis_labels?: boolean;
    x_axis_label?: string;
    y_axis_label?: string;
  };
  combination?: Record<string, any>;
  skuTitle?: string;
  skuId?: string;
  skuDetails?: Record<string, any>;
}

interface StatisticalSummaryAtomProps {
  metadata?: StatisticalSummaryAtomMetadata;
}

const normalizeChartSettings = (metadata?: StatisticalSummaryAtomMetadata): Required<ChartSettings> => {
  const settings = metadata?.chartSettings ?? {};
  const snake = metadata?.chart_settings ?? {};

  return {
    chartType: settings.chartType || snake.chart_type || 'line_chart',
    chartTheme: settings.chartTheme || snake.chart_theme || 'default',
    showDataLabels: settings.showDataLabels ?? snake.show_data_labels ?? false,
    showAxisLabels: settings.showAxisLabels ?? snake.show_axis_labels ?? true,
    xAxisLabel: settings.xAxisLabel || snake.x_axis_label || 'Date',
    yAxisLabel: settings.yAxisLabel || snake.y_axis_label || metadata?.metricLabel || metadata?.metric || 'Value',
  };
};

const formatNumber = (value: unknown): string => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toFixed(2);
  }
  return '-';
};

export const StatisticalSummaryAtom: React.FC<StatisticalSummaryAtomProps> = ({ metadata }) => {
  const chartSettings = normalizeChartSettings(metadata);
  const summary = metadata?.summary ?? {};
  const timeseries = Array.isArray(metadata?.timeseries) ? metadata?.timeseries : [];
  const metricLabel = metadata?.metricLabel || metadata?.metric || 'Metric';
  const skuTitle = metadata?.skuTitle || metadata?.skuId || 'SKU';
  const combinationEntries = metadata?.combination && typeof metadata.combination === 'object'
    ? Object.entries(metadata.combination)
    : [];
  const chartType = (chartSettings.chartType ?? 'line_chart') as 'bar_chart' | 'line_chart' | 'pie_chart' | 'area_chart' | 'scatter_chart';
  const chartTheme = chartSettings.chartTheme ?? 'default';

  return (
    <Card className="border border-gray-200 shadow-lg bg-white/95 backdrop-blur-sm overflow-hidden">
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-gray-900" />
            {skuTitle}
          </h3>
          <p className="text-xs text-gray-500">{metricLabel}</p>
        </div>
        {combinationEntries.length > 0 && (
          <div className="text-[11px] text-gray-500 flex flex-wrap gap-2">
            {combinationEntries.map(([key, value]) => (
              <span key={key} className="px-2 py-0.5 bg-gray-100 rounded-full border border-gray-200">
                {key}: {String(value)}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="p-4 space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Average</p>
            <p className="text-lg font-semibold text-gray-900">{formatNumber(summary.avg)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Minimum</p>
            <p className="text-lg font-semibold text-gray-900">{formatNumber(summary.min)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-xs text-gray-500 uppercase tracking-wide">Maximum</p>
            <p className="text-lg font-semibold text-gray-900">{formatNumber(summary.max)}</p>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2 text-gray-900 font-semibold text-sm">
            <TrendingUp className="w-4 h-4" /> Trend Analysis
          </div>
          <div className="p-4">
            {timeseries.length > 0 ? (
              <div className="h-64">
                <RechartsChartRenderer
                  type={chartType}
                  data={timeseries as any}
                  xField="date"
                  yField="value"
                  width={undefined}
                  height={undefined}
                  title=""
                  xAxisLabel={chartSettings.xAxisLabel}
                  yAxisLabel={chartSettings.yAxisLabel}
                  showDataLabels={chartSettings.showDataLabels}
                  showAxisLabels={chartSettings.showAxisLabels}
                  theme={chartTheme as any}
                />
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-sm text-gray-500">
                No timeseries data available for this metric.
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default StatisticalSummaryAtom;
