import React, { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Loader2 } from 'lucide-react';
import RechartsChartRenderer from '@/templates/charts/RechartsChartRenderer';
import { COLOR_THEMES } from './CorrelationExhibition';

interface TimeSeriesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  var1: string;
  var2: string;
  correlation: number;
  timeSeriesData: Array<{ date: number; var1Value: number; var2Value: number }> | null;
  isDateAxis: boolean;
  isLoading?: boolean;
  theme?: string;
  variant?: 'full' | 'compact';
}

const TimeSeriesModal: React.FC<TimeSeriesModalProps> = ({
  open,
  onOpenChange,
  var1,
  var2,
  correlation,
  timeSeriesData,
  isDateAxis,
  isLoading = false,
  theme = 'default',
  variant = 'full',
}) => {
  const isCompactMode = variant === 'compact';
  const themeColors = COLOR_THEMES[theme] || COLOR_THEMES.default;

  // Determine X-axis field name
  const timeSeriesXField = isDateAxis ? 'date' : 'Index';

  // Transform time series data for chart
  const timeSeriesChartData = useMemo(() => {
    if (!timeSeriesData || !var1 || !var2) return [];
    
    const MAX_TIME_SERIES_POINTS = 500;
    
    return timeSeriesData
      .map((d, idx) => {
        const xValue = isDateAxis
          ? typeof d.date === "number"
            ? d.date
            : new Date(d.date).getTime()
          : idx;
        const v1 = typeof d.var1Value === "number" ? d.var1Value : parseFloat(d.var1Value);
        const v2 = typeof d.var2Value === "number" ? d.var2Value : parseFloat(d.var2Value);
        return {
          [timeSeriesXField]: xValue,
          [var1]: v1,
          [var2]: v2,
        };
      })
      .filter(
        (d) =>
          typeof d[var1] === "number" &&
          isFinite(d[var1]) &&
          typeof d[var2] === "number" &&
          isFinite(d[var2]),
      )
      .sort((a, b) => a[timeSeriesXField] - b[timeSeriesXField])
      .slice(-MAX_TIME_SERIES_POINTS);
  }, [timeSeriesData, var1, var2, isDateAxis, timeSeriesXField]);

  const timeSeriesChartHeight = isCompactMode ? 300 : 450;

  // Prepare chart renderer props
  const timeSeriesRendererProps = useMemo(() => {
    if (!var1 || !var2) return null;
    
    return {
      key: `${var1}-${var2}-${timeSeriesXField}`,
      type: "line_chart" as const,
      data: timeSeriesChartData,
      xField: timeSeriesXField,
      yField: var1,
      yFields: [var1, var2],
      yAxisLabel: var1,
      yAxisLabels: [var1, var2],
      xAxisLabel: isDateAxis ? "Date" : "Index",
      colors: [themeColors.primary, themeColors.secondary, themeColors.tertiary],
      theme: theme,
      showLegend: true,
      showXAxisLabels: true,
      showYAxisLabels: true,
      showGrid: true,
      initialShowDataLabels: false,
      height: timeSeriesChartHeight,
    } as const;
  }, [
    var1,
    var2,
    timeSeriesChartData,
    theme,
    themeColors,
    timeSeriesChartHeight,
    timeSeriesXField,
    isDateAxis,
  ]);

  // Strength badge variant
  const strengthVariant = Math.abs(correlation) > 0.7
    ? "destructive"
    : Math.abs(correlation) > 0.3
      ? "default"
      : "secondary";

  const strengthText = Math.abs(correlation) > 0.7
    ? "Strong"
    : Math.abs(correlation) > 0.3
      ? "Moderate"
      : "Weak";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="w-5 h-5 text-primary" />
            Time Series Comparison
          </DialogTitle>
        </DialogHeader>

        {/* Header info */}
        <div className="flex-shrink-0 border-b pb-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {`Visualize how ${var1} and ${var2} change over time`}
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm text-foreground">
                {`Correlation for ${var1} vs ${var2}:`}
              </span>
              <span className="text-lg font-bold text-foreground">
                {correlation.toFixed(3)}
              </span>
              <Badge variant={strengthVariant} className="text-sm">
                {strengthText}
              </Badge>
            </div>
          </div>
        </div>

        {/* Chart area */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading time series data...</p>
            </div>
          ) : timeSeriesRendererProps && timeSeriesChartData.length > 0 ? (
            <div className="w-full" style={{ height: timeSeriesChartHeight }}>
              <RechartsChartRenderer {...timeSeriesRendererProps} />
            </div>
          ) : (
            <div className="flex items-center justify-center h-64">
              <p className="text-sm text-muted-foreground">No time series data available</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default TimeSeriesModal;



