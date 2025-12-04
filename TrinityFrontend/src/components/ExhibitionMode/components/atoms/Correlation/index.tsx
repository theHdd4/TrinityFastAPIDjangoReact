import React, { useMemo } from 'react';
import CorrelationExhibition from './CorrelationExhibition';
import { DEFAULT_CORRELATION_METADATA, parseCorrelationMetadata } from './shared';
import { CorrelationProps } from './types';

const Correlation: React.FC<CorrelationProps> = ({ metadata, variant = 'full' }) => {
  const parsedMetadata = useMemo(() => parseCorrelationMetadata(metadata), [metadata]);
  const resolvedMetadata = parsedMetadata ?? DEFAULT_CORRELATION_METADATA;

  return <CorrelationExhibition data={resolvedMetadata} variant={variant} />;
};

export default Correlation;


