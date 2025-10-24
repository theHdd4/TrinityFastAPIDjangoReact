import React, { useMemo } from 'react';
import EvaluateModelsFeatureChart from './EvaluateModelsFeatureChart';
import { DEFAULT_EVALUATE_MODELS_FEATURE_METADATA, parseEvaluateModelsFeatureMetadata } from './shared';
import { EvaluateModelsFeatureComponentProps, EvaluateModelsFeatureProps } from './types';

const EvaluateModelsFeature: React.FC<EvaluateModelsFeatureProps> = ({ metadata, variant = 'full' }) => {
  const parsedMetadata = useMemo(() => {
    return parseEvaluateModelsFeatureMetadata(metadata);
  }, [metadata]);
  
  const resolvedMetadata = parsedMetadata ?? DEFAULT_EVALUATE_MODELS_FEATURE_METADATA;

  const componentProps: EvaluateModelsFeatureComponentProps = {
    metadata: resolvedMetadata,
    variant: (variant === 'compact' || variant === 'full') ? variant : 'full',
  };

  // Render the actual chart component (similar to ChartMaker's pattern)
  return <EvaluateModelsFeatureChart {...componentProps} />;
};

export default EvaluateModelsFeature;

