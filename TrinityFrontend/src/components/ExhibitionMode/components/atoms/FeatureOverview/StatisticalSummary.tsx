import React, { useMemo } from 'react';
import { extractSummaryEntries, renderSummaryEntries } from './shared';
import { FeatureOverviewComponentProps } from './types';

const StatisticalSummary: React.FC<FeatureOverviewComponentProps> = ({ metadata }) => {
  const summaryEntries = useMemo(
    () => extractSummaryEntries(metadata.statisticalDetails),
    [metadata.statisticalDetails],
  );

  const summaryContent = useMemo(() => renderSummaryEntries(summaryEntries), [summaryEntries]);

  return (
    <div className="rounded-2xl border border-border bg-background/80 p-4 shadow-sm">
      {summaryContent ?? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          Statistical summary will be displayed here after saving combinations in laboratory mode.
        </div>
      )}
    </div>
  );
};

export default StatisticalSummary;
