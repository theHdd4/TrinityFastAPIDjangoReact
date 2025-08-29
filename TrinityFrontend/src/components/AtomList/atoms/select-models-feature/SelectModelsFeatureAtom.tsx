import React, { useEffect } from 'react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import SelectModelsFeatureCanvas from './components/SelectModelsFeatureCanvas';

interface Props {
  atomId: string;
}

const SelectModelsFeatureAtom: React.FC<Props> = ({ atomId }) => {
  
  try {
    const atom = useLaboratoryStore(state => state.getAtom(atomId));
    const settings = (atom?.settings as any) || {
      uploadedFile: null,
      selectedDataset: '',
      ensembleMethod: true,
      selectedScope: '',
      availableScopes: [],
      selectedCombinationId: 'all',
      availableCombinationIds: [],
      selectedVariable: '',
      availableVariables: [],
      elasticityData: [],
      modelResults: [
        { name: 'Jan', value: 45 },
        { name: 'Feb', value: 62 },
        { name: 'Mar', value: 38 },
        { name: 'Apr', value: 75 },
        { name: 'May', value: 55 },
        { name: 'Jun', value: 88 },
        { name: 'Jul', value: 42 },
        { name: 'Aug', value: 68 },
        { name: 'Sep', value: 35 },
        { name: 'Oct', value: 92 },
        { name: 'Nov', value: 58 },
        { name: 'Dec', value: 73 }
      ],
      modelFilters: {
        mape_train: null,
        mape_test: null,
        r2_train: null,
        r2_test: null,
        aic: null,
        bic: null,
        self_elasticity: null
      },
              selectedModel: 'Select Model to View Model Performance',
        selectedModelPerformance: [],
      performanceData: [],
      yoyData: [],
      weightedEnsembleData: [],
      isRunning: false,
      dataType: '',
      aggregationLevel: ''
    };



    return (
      <div className="w-full h-full bg-white rounded-lg overflow-hidden flex flex-col">
        <SelectModelsFeatureCanvas
          atomId={atomId}
          data={settings}
        />
      </div>
    );
  } catch (err) {
    console.error('🔧 SelectModelsFeatureAtom: Component error:', err);
    return (
      <div className="w-full h-full bg-white rounded-lg overflow-hidden flex flex-col p-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <h3 className="text-yellow-800 font-medium mb-2">Select Models Feature Atom Unavailable</h3>
          <p className="text-yellow-700 text-sm mb-2">
            The select models feature atom is currently unavailable. This might be due to:
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

export default SelectModelsFeatureAtom;