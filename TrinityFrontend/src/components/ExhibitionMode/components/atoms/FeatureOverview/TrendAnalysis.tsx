import React, { useMemo } from 'react';
import TrendAnalysisChart from './TrendAnalysisChart';
import { deriveChartConfig, ChartRendererConfig } from './shared';
import { FeatureOverviewComponentProps } from './types';

const TrendAnalysis: React.FC<FeatureOverviewComponentProps> = ({ metadata, variant }) => {
  const chartConfig = useMemo<ChartRendererConfig | null>(
    () => deriveChartConfig(metadata, variant),
    [metadata, variant],
  );

  return (
    <div className="rounded-2xl border border-border bg-background/80 p-6 shadow-sm">
      {chartConfig ? (
        <TrendAnalysisChart config={chartConfig} />
      ) : (
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          Trend analysis data will appear here after exporting from laboratory mode.
        </div>
      )}
    </div>
  );
};

export default TrendAnalysis;
