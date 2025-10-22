import React, { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { extractSummaryEntries, renderSummaryEntries } from './shared';
import { FeatureOverviewComponentProps } from './types';

const StatisticalSummary: React.FC<FeatureOverviewComponentProps> = ({ metadata, variant }) => {
  const summaryEntries = useMemo(
    () => extractSummaryEntries(metadata.statisticalDetails),
    [metadata.statisticalDetails],
  );

  const summaryContent = useMemo(() => renderSummaryEntries(summaryEntries), [summaryEntries]);

  const containerClass = cn(
    'rounded-2xl border border-border p-4 shadow-sm',
    variant === 'full' ? 'bg-transparent' : 'bg-background/80',
  );

  return (
    <div className={containerClass}>
      {summaryContent ?? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          Statistical summary will be displayed here after saving combinations in laboratory mode.
        </div>
      )}
    </div>
  );
};

export default StatisticalSummary;
