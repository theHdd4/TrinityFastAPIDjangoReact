import { EvaluateModelsFeatureMetadata } from './types';
import { EvaluateModelsFeatureExhibitionSelectionGraphState } from '@/components/LaboratoryMode/store/laboratoryStore';

export const DEFAULT_EVALUATE_MODELS_FEATURE_METADATA: EvaluateModelsFeatureMetadata = {
  graphId: 'unknown',
  graphTitle: 'Graph',
  graphState: {
    graphType: 'waterfall',
    graphName: 'Graph',
    graphId: 'unknown',
    selected: true,
  },
  graphContext: {
    selectedDataframe: '',
    scope: '',
    selectedCombinations: [],
    identifiers: [],
    modelResults: [],
    identifiersData: {},
    selectedIdentifierValues: {},
    chartData: [],
  },
  capturedAt: new Date().toISOString(),
  sourceAtomTitle: 'Evaluate Models Feature',
};

export const parseEvaluateModelsFeatureMetadata = (metadata: unknown): EvaluateModelsFeatureMetadata | null => {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  // Handle nested metadata structure that comes from MongoDB (similar to FeatureOverview)
  const nested = (metadata as any).metadata && typeof (metadata as any).metadata === 'object'
    ? { ...metadata, ...(metadata as any).metadata }
    : metadata;

  const result: EvaluateModelsFeatureMetadata = {};

  const graphId = typeof nested.graphId === 'string' ? nested.graphId : 
                  typeof nested.graph_id === 'string' ? nested.graph_id :
                  typeof nested.id === 'string' ? nested.id : undefined;
  if (graphId) {
    result.graphId = graphId;
  }

  const graphTitle = typeof nested.graphTitle === 'string' ? nested.graphTitle :
                     typeof nested.graph_title === 'string' ? nested.graph_title :
                     typeof nested.title === 'string' ? nested.title : undefined;
  if (graphTitle) {
    result.graphTitle = graphTitle;
  }

  if (nested.graphState && typeof nested.graphState === 'object') {
    result.graphState = nested.graphState as EvaluateModelsFeatureExhibitionSelectionGraphState;
  } else if (nested.graph_state && typeof nested.graph_state === 'object') {
    // Handle MongoDB field naming variations
    result.graphState = nested.graph_state as EvaluateModelsFeatureExhibitionSelectionGraphState;
  }

  if (nested.graphContext && typeof nested.graphContext === 'object') {
    result.graphContext = nested.graphContext;
  } else if (nested.graph_context && typeof nested.graph_context === 'object') {
    // Handle MongoDB field naming variations
    result.graphContext = nested.graph_context;
  }

  const capturedAt = typeof nested.capturedAt === 'string' ? nested.capturedAt : undefined;
  if (capturedAt) {
    result.capturedAt = capturedAt;
  }

  const sourceAtomTitle = typeof nested.sourceAtomTitle === 'string' ? nested.sourceAtomTitle : undefined;
  if (sourceAtomTitle) {
    result.sourceAtomTitle = sourceAtomTitle;
  }

  return result;
};

