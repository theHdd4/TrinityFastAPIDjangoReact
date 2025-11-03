import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import TrendAnalysisChart from './TrendAnalysisChart';
import { deriveChartConfig, ChartRendererConfig } from './shared';
import { FeatureOverviewComponentProps } from './types';

const TrendAnalysis: React.FC<FeatureOverviewComponentProps> = ({ metadata, variant }) => {
  const chartConfig = useMemo<ChartRendererConfig | null>(
    () => deriveChartConfig(metadata, variant),
    [metadata, variant],
  );

  const shouldUseTransparentBackground =
    variant === 'full' && (metadata.exhibitionControls?.transparentBackground ?? true);

  const defaultPadding = variant === 'compact' ? 'p-4' : 'p-6';

  const containerClass = cn(
    'rounded-2xl',
    shouldUseTransparentBackground
      ? 'bg-transparent p-0 shadow-none border-none'
      : cn('border border-border shadow-sm bg-background/80', defaultPadding),
  );

  return (
    <div 
      className={`${containerClass} w-full max-w-full min-w-0`}
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
      {chartConfig ? (
        <TrendAnalysisChart
          config={chartConfig}
          transparentBackground={shouldUseTransparentBackground}
        />
      ) : (
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          Trend analysis data will appear here after exporting from laboratory mode.
        </div>
      )}
    </div>
  );
};

export default TrendAnalysis;
