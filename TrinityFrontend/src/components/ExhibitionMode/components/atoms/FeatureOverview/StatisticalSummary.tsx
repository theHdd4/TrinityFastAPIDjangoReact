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

  const shouldUseTransparentBackground =
    variant === 'full' && (metadata.exhibitionControls?.transparentBackground ?? true);

  const defaultPadding = variant === 'compact' ? 'p-3' : 'p-4';

  const containerClass = cn(
    'rounded-2xl',
    shouldUseTransparentBackground
      ? 'bg-transparent p-0 shadow-none border-none'
      : cn('border border-border shadow-sm bg-background/80', defaultPadding),
  );

  return (
    <div className={`${containerClass} w-full max-w-full min-w-0`}>
      {summaryContent ?? (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          Statistical summary will be displayed here after saving combinations in laboratory mode.
        </div>
      )}
    </div>
  );
};

export default StatisticalSummary;
