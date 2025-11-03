import { EvaluateModelsFeatureExhibitionSelectionGraphState } from '@/components/LaboratoryMode/store/laboratoryStore';

export interface EvaluateModelsFeatureMetadata {
  graphId?: string;
  graphTitle?: string;
  graphState?: EvaluateModelsFeatureExhibitionSelectionGraphState;
  graphContext?: {
    selectedDataframe?: string;
    scope?: string;
    selectedCombinations?: string[];
    identifiers?: Array<{
      id: string;
      name: string;
      selected: boolean;
    }>;
    modelResults?: any[];
    identifiersData?: {[key: string]: {column_name: string | null, unique_values: string[]}};
    selectedIdentifierValues?: {[key: string]: string[]};
    chartData?: Array<{name: string; value: number}>;
  };
  capturedAt?: string;
  sourceAtomTitle?: string;
}

export interface EvaluateModelsFeatureComponentProps {
  metadata: EvaluateModelsFeatureMetadata;
  variant: 'full' | 'compact';
}

export interface EvaluateModelsFeatureProps {
  metadata?: Record<string, unknown> | null;
  variant?: 'full' | 'compact';
}

