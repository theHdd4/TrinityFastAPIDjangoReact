import React, { useMemo } from 'react';
import {
  buildContextEntries,
  collectCombinationEntries,
  collectDimensions,
  deriveChartConfig,
  renderChart,
  renderCombinationEntries,
  renderContextEntries,
  renderDimensions,
} from './shared';
import { FeatureOverviewComponentProps } from './types';

const TrendAnalysis: React.FC<FeatureOverviewComponentProps> = ({ metadata, variant }) => {
  const chartConfig = useMemo(() => deriveChartConfig(metadata, variant), [metadata, variant]);

  const dimensions = useMemo(() => collectDimensions(metadata), [metadata]);
  const combinationEntries = useMemo(() => collectCombinationEntries(metadata), [metadata]);
  const contextEntries = useMemo(() => buildContextEntries(metadata), [metadata]);

  return (
    <div className="space-y-4">
      {renderDimensions(dimensions)}
      {renderCombinationEntries(combinationEntries)}

      <div className="rounded-2xl border border-border bg-background/80 p-4 shadow-sm">
        {renderChart(chartConfig)}
      </div>

      {renderContextEntries(contextEntries)}
    </div>
  );
};

export default TrendAnalysis;
