import React from 'react';
import { useLaboratoryStore, SelectModelsAutoRegressiveData, DEFAULT_SELECT_MODELS_AUTO_REGRESSIVE_DATA } from '@/components/LaboratoryMode/store/laboratoryStore';

interface Props {
  atomId: string;
}

const SelectModelsAutoRegressiveAtom: React.FC<Props> = ({ atomId }) => {
  console.log('🔧 SelectModelsAutoRegressiveAtom: Component rendered with atomId:', atomId);
  
  try {
    const atom = useLaboratoryStore(state => state.getAtom(atomId));
    console.log('🔧 SelectModelsAutoRegressiveAtom: Retrieved atom from store:', atom);
    
    const defaultData: SelectModelsAutoRegressiveData = {
      ...DEFAULT_SELECT_MODELS_AUTO_REGRESSIVE_DATA,
      ...(atom?.settings?.data || {})
    };

    return (
      <div className="w-full h-full p-4">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Select Models - Auto Regressive</h3>
            <p className="text-sm text-gray-600 mb-4">
              Select and evaluate the best auto-regressive models for your time series data.
            </p>
          </div>
          
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Scope
              </label>
              <select 
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={defaultData.selectedScope}
                onChange={(e) => {
                  const currentSettings = atom?.settings || {};
                  useLaboratoryStore.getState().updateAtomSettings(atomId, {
                    data: { ...(currentSettings.data || {}), selectedScope: e.target.value },
                  });
                }}
              >
                {defaultData.availableScopes.map((scope) => (
                  <option key={scope} value={scope}>{scope}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Variable
              </label>
              <select 
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={defaultData.selectedVariable}
                onChange={(e) => {
                  const currentSettings = atom?.settings || {};
                  useLaboratoryStore.getState().updateAtomSettings(atomId, {
                    data: { ...(currentSettings.data || {}), selectedVariable: e.target.value },
                  });
                }}
              >
                <option value="Select Variable to View Model Results">Select Variable to View Model Results</option>
                <option value="Sales">Sales</option>
                <option value="Revenue">Revenue</option>
                <option value="Volume">Volume</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Model
              </label>
              <select 
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={defaultData.selectedModel}
                onChange={(e) => {
                  const currentSettings = atom?.settings || {};
                  useLaboratoryStore.getState().updateAtomSettings(atomId, {
                    data: { ...(currentSettings.data || {}), selectedModel: e.target.value },
                  });
                }}
              >
                <option value="Select Model to View Model Performance">Select Model to View Model Performance</option>
                <option value="ARIMA">ARIMA</option>
                <option value="SARIMA">SARIMA</option>
                <option value="Prophet">Prophet</option>
                <option value="ETS">ETS</option>
              </select>
            </div>
            
            <div className="pt-4">
              <button 
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
                onClick={() => {
                  // TODO: Implement model selection logic
                  console.log('Selecting models for auto-regressive analysis...');
                }}
              >
                Select Best Models
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error('🔧 SelectModelsAutoRegressiveAtom: Error rendering component:', error);
    return (
      <div className="w-full h-full p-4">
        <div className="text-red-600">
          Error rendering Select Models Auto Regressive Atom: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      </div>
    );
  }
};

export default SelectModelsAutoRegressiveAtom;
