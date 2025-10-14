import React, { useMemo } from 'react';
import { deriveChartConfig, renderChart } from './shared';
import { FeatureOverviewComponentProps } from './types';

const TrendAnalysis: React.FC<FeatureOverviewComponentProps> = ({ metadata, variant }) => {
  const chartConfig = useMemo(() => deriveChartConfig(metadata, variant), [metadata, variant]);

  return (
    <div className="rounded-2xl border border-border bg-background/80 p-4 shadow-sm">
      {renderChart(chartConfig)}
    </div>
  );
};

export default TrendAnalysis;
