import React, { useMemo } from 'react';
import StatisticalSummary from './StatisticalSummary';
import TrendAnalysis from './TrendAnalysis';
import { parseFeatureOverviewMetadata } from './shared';
import { FeatureOverviewComponentProps, FeatureOverviewProps } from './types';

const FeatureOverview: React.FC<FeatureOverviewProps> = ({ metadata, variant = 'full' }) => {
  const parsedMetadata = useMemo(() => parseFeatureOverviewMetadata(metadata), [metadata]);

  if (!parsedMetadata) {
    return <p className="text-sm text-muted-foreground">No exhibition data available for this component yet.</p>;
  }

  const componentProps: FeatureOverviewComponentProps = {
    metadata: parsedMetadata,
    variant,
  };

  switch (parsedMetadata.viewType) {
    case 'trend_analysis':
      return <TrendAnalysis {...componentProps} />;
    case 'statistical_summary':
    default:
      return <StatisticalSummary {...componentProps} />;
  }
};

export default FeatureOverview;
