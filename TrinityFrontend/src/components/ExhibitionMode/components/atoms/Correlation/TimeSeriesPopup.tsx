import React, { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, X } from 'lucide-react';
import RechartsChartRenderer from '@/templates/charts/RechartsChartRenderer';
import { COLOR_THEMES } from './CorrelationExhibition';

interface TimeSeriesPopupProps {
  var1: string;
  var2: string;
  correlation: number;
  timeSeriesData: Array<{ date: number; var1Value: number; var2Value: number }> | null;
  isDateAxis: boolean;
  isLoading?: boolean;
  theme?: string;
  variant?: 'full' | 'compact';
  position: { top: number; left: number } | null;
  onClose: () => void;
  isMobile?: boolean;
}

const TimeSeriesPopup: React.FC<TimeSeriesPopupProps> = ({
  var1,
  var2,
  correlation,
  timeSeriesData,
  isDateAxis,
  isLoading = false,
  theme = 'default',
  variant = 'full',
  position,
  onClose,
  isMobile = false,
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

  // Mobile-adaptive chart height
  const timeSeriesChartHeight = isMobile ? 250 : 350;

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
      xAxisLabel: undefined, // Remove verbose label, already in legend
      colors: [themeColors.primary, themeColors.secondary, themeColors.tertiary],
      theme: theme,
      showLegend: true,
      showXAxisLabels: true,
      showYAxisLabels: !isMobile, // Hide Y-axis labels on mobile to prevent overlap
      showGrid: true,
      initialShowDataLabels: false,
      height: timeSeriesChartHeight,
      isMobile: isMobile, // Pass mobile flag to chart renderer for mobile optimizations
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
    isMobile,
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

  if (!position) return null;

  // MOBILE: Clean minimal style matching ChartMaker
  if (isMobile) {
    return (
      <>
        {/* Background overlay for focus */}
        <div 
          className="fixed inset-0 z-[190] bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-300"
          onClick={onClose}
        />
        
        {/* Modal content - matching ChartMaker's transparent aesthetic */}
        <div 
          className="fixed top-16 left-4 right-4 z-[200] animate-in fade-in slide-in-from-bottom-4 duration-400"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Minimal header bar */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h4 className="text-base font-semibold text-white/95">
                {var1} ↔ {var2}
              </h4>
              <Badge variant={strengthVariant} className="text-xs px-2 py-0.5">
                {strengthText}
              </Badge>
            </div>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onClose}
              className="h-8 w-8 p-0 text-white/70 hover:text-white hover:bg-white/10 rounded-full"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Chart container - transparent background like ChartMaker */}
          <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/80 via-slate-800/80 to-slate-900/80 backdrop-blur-sm overflow-hidden">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-64 gap-2">
                <Loader2 className="h-6 w-6 animate-spin text-blue-400" />
                <p className="text-xs text-white/60">Loading time series...</p>
              </div>
            ) : timeSeriesRendererProps && timeSeriesChartData.length > 0 ? (
              <div className="p-3">
                <div style={{ width: '100%', height: timeSeriesChartHeight }}>
                  <RechartsChartRenderer {...timeSeriesRendererProps} />
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-64">
                <p className="text-sm text-white/60">No time series data available</p>
              </div>
            )}
          </div>
          
          {/* Subtle bottom accent line */}
          <div className="mt-3 h-0.5 bg-gradient-to-r from-transparent via-blue-400/30 to-transparent rounded-full" />
        </div>
      </>
    );
  }

  // DESKTOP: Keep original Card style (unchanged)
  return (
    <div
      className="absolute z-[200] animate-in fade-in slide-in-from-bottom-4 duration-400"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      <Card className="w-[800px] p-0 shadow-2xl border border-primary/30 bg-background/95 backdrop-blur-sm overflow-hidden">
        {/* Compact Header: Variables + Strength Badge + Close Button */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border/30 bg-muted/5">
          {/* Variable names with arrow */}
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <span>{var1}</span>
            <span className="text-muted-foreground text-xs">↔</span>
            <span>{var2}</span>
          </div>
          
          {/* Strength badge and close button */}
          <div className="flex items-center gap-2">
            <Badge variant={strengthVariant} className="text-xs px-2 py-0.5 h-5">
              {strengthText}
            </Badge>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-6 w-6 p-0 hover:bg-destructive/10"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Chart Content - Minimal padding */}
        <div className="p-2">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Loading time series data...</p>
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
      </Card>
    </div>
  );
};

export default TimeSeriesPopup;

