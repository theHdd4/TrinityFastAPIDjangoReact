import React, { useMemo } from 'react';
import StatisticalSummary from './StatisticalSummary';
import TrendAnalysis from './TrendAnalysis';
import { DEFAULT_FEATURE_OVERVIEW_TREND_METADATA, parseFeatureOverviewMetadata } from './shared';
import { FeatureOverviewComponentProps, FeatureOverviewProps } from './types';

const FeatureOverview: React.FC<FeatureOverviewProps> = ({ metadata, variant = 'full' }) => {
  const parsedMetadata = useMemo(() => parseFeatureOverviewMetadata(metadata), [metadata]);
  const resolvedMetadata = parsedMetadata ?? DEFAULT_FEATURE_OVERVIEW_TREND_METADATA;

  const componentProps: FeatureOverviewComponentProps = {
    metadata: resolvedMetadata,
    variant,
  };

  switch (resolvedMetadata.viewType) {
    case 'trend_analysis':
      return <TrendAnalysis {...componentProps} />;
    case 'statistical_summary':
    default:
      return <StatisticalSummary {...componentProps} />;
  }
};

export default FeatureOverview;
