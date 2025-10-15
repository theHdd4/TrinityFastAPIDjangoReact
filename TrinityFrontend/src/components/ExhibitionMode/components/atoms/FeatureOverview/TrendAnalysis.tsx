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
        <div className="space-y-4">
          {(chartConfig.title || metadata.label || metadata.metric) && (
            <div className="flex flex-col gap-1">
              <h3 className="text-lg font-semibold text-foreground">
                {chartConfig.title ?? metadata.label ?? metadata.metric ?? 'Trend analysis'}
              </h3>
              {metadata.featureContext?.dataSource && (
                <p className="text-sm text-muted-foreground">
                  Data source: {metadata.featureContext.dataSource}
                </p>
              )}
            </div>
          )}
          <TrendAnalysisChart config={chartConfig} />
        </div>
      ) : (
        <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
          Trend analysis data will appear here after exporting from laboratory mode.
        </div>
      )}
    </div>
  );
};

export default TrendAnalysis;
