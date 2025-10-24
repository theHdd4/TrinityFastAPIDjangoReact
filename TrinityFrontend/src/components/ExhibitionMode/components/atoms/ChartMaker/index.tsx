import React, { useMemo } from 'react';
import ChartMakerChart from './ChartMakerChart';
import { DEFAULT_CHART_MAKER_METADATA, parseChartMakerMetadata } from './shared';
import { ChartMakerComponentProps, ChartMakerProps } from './types';

const ChartMaker: React.FC<ChartMakerProps> = ({ metadata, variant = 'full' }) => {
  const parsedMetadata = useMemo(() => parseChartMakerMetadata(metadata), [metadata]);
  const resolvedMetadata = parsedMetadata ?? DEFAULT_CHART_MAKER_METADATA;

  const componentProps: ChartMakerComponentProps = {
    metadata: resolvedMetadata,
    variant: (variant === 'compact' || variant === 'full') ? variant : 'full',
  };

  // Render chart component directly (similar to FeatureOverview's switch pattern)
  return <ChartMakerChart {...componentProps} />;
};

export default ChartMaker;