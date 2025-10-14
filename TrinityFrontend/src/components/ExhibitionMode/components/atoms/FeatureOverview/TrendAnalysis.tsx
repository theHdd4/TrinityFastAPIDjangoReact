import React, { useMemo } from 'react';
import { deriveChartConfig } from './shared';
import { FeatureOverviewComponentProps } from './types';
import TrendAnalysisChart from './TrendAnalysisChart';

const TrendAnalysis: React.FC<FeatureOverviewComponentProps> = ({ metadata, variant }) => {
  const chartConfig = useMemo(() => deriveChartConfig(metadata, variant), [metadata, variant]);

  if (!chartConfig) {
    return (
      <div className="rounded-2xl border border-border bg-background/80 p-4 shadow-sm">
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          Trend data will appear here after the component captures a visualization in laboratory mode.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-background/80 p-4 shadow-sm">
      <TrendAnalysisChart config={chartConfig} />
    </div>
  );
};

export default TrendAnalysis;
