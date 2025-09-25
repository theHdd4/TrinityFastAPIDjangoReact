import React from 'react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import BuildModelFeatureBasedCanvas from './components/BuildModelFeatureBasedCanvas';

export interface ModelConfig {
  id: string;
  name: string;
  parameters: Record<string, any>;
  tuning_mode?: 'auto' | 'manual';
}

export interface VariableTransformation {
  id: string;
  component1: string;
  component2: string;
  operation: string;
}

export interface BuildModelFeatureBasedData {
  uploadedFile: File | null;
  selectedDataset: string;
  selectedScope: string;
  selectedCombinations: string[];
  selectedModels: string[];
  modelConfigs: ModelConfig[];
  yVariable: string;
  xVariables: (string | string[])[];
  transformations: VariableTransformation[];
  availableFiles?: string[];
  availableColumns: string[];
  scopes: string[];
  outputFileName: string;
  kFolds?: number;
  testSize?: number;
  // Individual modeling fields
  individualModeling: boolean;
  individualKFolds?: number;
  individualTestSize?: number;
  individualSelectedModels: string[];
  individualModelConfigs: ModelConfig[];
  // Stack modeling fields
  stackModeling: boolean;
  stackKFolds?: number;
  stackTestSize?: number;
  stackSelectedModels: string[];
  stackModelConfigs: ModelConfig[];
  poolByIdentifiers: string[];
  numericalColumnsForClustering: string[];
  applyInteractionTerms: boolean;
  numericalColumnsForInteraction: string[];
  // Constraint configuration
  negativeConstraints: string[];
  positiveConstraints: string[];
}

export interface BuildModelFeatureBasedSettings {
  dataType: string;
  aggregationLevel: string;
  dateFrom: string;
  dateTo: string;
}

interface Props {
  atomId: string;
}

const BuildModelFeatureBasedAtom: React.FC<Props> = ({ atomId }) => {
  
  
  try {
    const atom = useLaboratoryStore(state => state.getAtom(atomId));
    const defaultData = {
      uploadedFile: null,
      selectedDataset: '',
      selectedScope: '',
      selectedCombinations: [],
      selectedModels: ['Linear Regression', 'Ridge Regression', 'Lasso Regression', 'ElasticNet Regression', 'Bayesian Ridge Regression', 'Custom Constrained Ridge', 'Constrained Linear Regression'],
      modelConfigs: [
        { id: 'Linear Regression', name: 'Linear Regression', parameters: {} },
        { id: 'Ridge Regression', name: 'Ridge Regression', parameters: { 'Alpha': '1.0' } },
        { id: 'Lasso Regression', name: 'Lasso Regression', parameters: { 'Alpha': '1.0' } },
        { id: 'ElasticNet Regression', name: 'ElasticNet Regression', parameters: { 'Alpha': '1.0', 'L1 Ratio': '0.5' } },
        { id: 'Bayesian Ridge Regression', name: 'Bayesian Ridge Regression', parameters: {} },
        { id: 'Custom Constrained Ridge', name: 'Custom Constrained Ridge', parameters: { 'L2 Penalty': '0.1', 'Learning Rate': '0.001', 'Iterations': '10000', 'Adam': 'false' } },
        { id: 'Constrained Linear Regression', name: 'Constrained Linear Regression', parameters: { 'Learning Rate': '0.001', 'Iterations': '10000', 'Adam': 'false' } }
      ],
      yVariable: '',
      xVariables: [],
      transformations: [],
      availableFiles: [],
      availableColumns: ['Feature 1', 'Feature 2', 'Feature 3', 'Feature 4', 'Feature 5', 'Feature 6', 'Feature 7', 'Feature 8'],
      scopes: ['Scope 1', 'Scope 2', 'Scope 3', 'Scope 4', 'Scope 5'],
      outputFileName: '',
      kFolds: 5,
      testSize: 0.2,
      // Individual modeling defaults
      individualModeling: true,
      individualKFolds: 5,
      individualTestSize: 0.2,
      individualSelectedModels: ['Linear Regression', 'Ridge Regression', 'Lasso Regression', 'ElasticNet Regression', 'Bayesian Ridge Regression', 'Custom Constrained Ridge', 'Constrained Linear Regression'],
      individualModelConfigs: [
        { id: 'Linear Regression', name: 'Linear Regression', parameters: {}, tuning_mode: 'manual' },
        { id: 'Ridge Regression', name: 'Ridge Regression', parameters: { 'Alpha': '1.0' }, tuning_mode: 'auto' },
        { id: 'Lasso Regression', name: 'Lasso Regression', parameters: { 'Alpha': '1.0' }, tuning_mode: 'auto' },
        { id: 'ElasticNet Regression', name: 'ElasticNet Regression', parameters: { 'Alpha': '1.0', 'L1 Ratio': '0.5' }, tuning_mode: 'auto' },
        { id: 'Bayesian Ridge Regression', name: 'Bayesian Ridge Regression', parameters: {}, tuning_mode: 'manual' },
        { id: 'Custom Constrained Ridge', name: 'Custom Constrained Ridge', parameters: { 'L2 Penalty': '0.1', 'Learning Rate': '0.001', 'Iterations': '10000', 'Adam': 'false' }, tuning_mode: 'auto' },
        { id: 'Constrained Linear Regression', name: 'Constrained Linear Regression', parameters: { 'Learning Rate': '0.001', 'Iterations': '10000', 'Adam': 'false' }, tuning_mode: 'manual' }
      ],
      // Stack modeling defaults
      stackModeling: false,
      stackKFolds: 5,
      stackTestSize: 0.2,
      stackSelectedModels: [],
      stackModelConfigs: [
        { id: 'Linear Regression', name: 'Linear Regression', parameters: {}, tuning_mode: 'manual' },
        { id: 'Ridge Regression', name: 'Ridge Regression', parameters: { 'Alpha': '1.0' }, tuning_mode: 'auto' },
        { id: 'Lasso Regression', name: 'Lasso Regression', parameters: { 'Alpha': '1.0' }, tuning_mode: 'auto' },
        { id: 'ElasticNet Regression', name: 'ElasticNet Regression', parameters: { 'Alpha': '1.0', 'L1 Ratio': '0.5' }, tuning_mode: 'auto' },
        { id: 'Bayesian Ridge Regression', name: 'Bayesian Ridge Regression', parameters: {}, tuning_mode: 'manual' },
        { id: 'Constrained Ridge', name: 'Constrained Ridge', parameters: { 'L2 Penalty': '0.1', 'Learning Rate': '0.001', 'Iterations': '10000', 'Adam': 'false' }, tuning_mode: 'auto' },
        { id: 'Constrained Linear Regression', name: 'Constrained Linear Regression', parameters: { 'Learning Rate': '0.001', 'Iterations': '10000', 'Adam': 'false' }, tuning_mode: 'manual' }
      ],
      poolByIdentifiers: [],
      numericalColumnsForClustering: [],
      applyInteractionTerms: false,
      numericalColumnsForInteraction: [],
      // Constraint configuration
      negativeConstraints: [],
      positiveConstraints: []
    };

    const defaultSettings = {
      dataType: '',
      aggregationLevel: '',
      dateFrom: '',
      dateTo: ''
    };

    const settings = (atom?.settings as any) || {
      data: defaultData,
      settings: defaultSettings
    };

    // Ensure data structure is complete
    const completeData = {
      ...defaultData,
      ...settings.data,
      modelResult: settings.modelResult,
      modelError: settings.modelError
    };

    

    return (
      <div className="w-full h-full bg-white rounded-lg overflow-hidden flex flex-col">
        <BuildModelFeatureBasedCanvas
          atomId={atomId}
          data={completeData}
          onClose={() => {}}
        />
      </div>
    );
  } catch (err) {
    console.error('🔧 BuildModelFeatureBasedAtom: Component error:', err);
    return (
      <div className="w-full h-full bg-white rounded-lg overflow-hidden flex flex-col p-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <h3 className="text-yellow-800 font-medium mb-2">Build Model Feature Based Atom Unavailable</h3>
          <p className="text-yellow-700 text-sm mb-2">
            The build model feature based atom is currently unavailable. This might be due to:
          </p>
          <ul className="text-yellow-700 text-sm list-disc list-inside space-y-1 mb-3">
            <li>Browser storage quota exceeded</li>
            <li>Network connectivity issues</li>
            <li>API permission problems</li>
          </ul>
          <div className="space-x-2">
            <button 
              onClick={() => window.location.reload()}
              className="px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700 text-sm"
            >
              Reload Page
            </button>
            <button 
              onClick={() => {
                try {
                  sessionStorage.clear();
                  window.location.reload();
                } catch (e) {
                  console.error('Failed to clear storage:', e);
                }
              }}
              className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
            >
              Clear Storage & Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
};

export default BuildModelFeatureBasedAtom;