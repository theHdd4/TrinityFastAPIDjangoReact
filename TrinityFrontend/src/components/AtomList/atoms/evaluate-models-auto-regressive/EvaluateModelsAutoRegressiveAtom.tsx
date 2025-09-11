import React from 'react';
import { useLaboratoryStore, EvaluateModelsAutoRegressiveData, DEFAULT_EVALUATE_MODELS_AUTO_REGRESSIVE_DATA } from '@/components/LaboratoryMode/store/laboratoryStore';

interface Props {
  atomId: string;
}

const EvaluateModelsAutoRegressiveAtom: React.FC<Props> = ({ atomId }) => {
  console.log('🔧 EvaluateModelsAutoRegressiveAtom: Component rendered with atomId:', atomId);
  
  try {
    const atom = useLaboratoryStore(state => state.getAtom(atomId));
    console.log('🔧 EvaluateModelsAutoRegressiveAtom: Retrieved atom from store:', atom);
    
    const defaultData: EvaluateModelsAutoRegressiveData = {
      ...DEFAULT_EVALUATE_MODELS_AUTO_REGRESSIVE_DATA,
      ...(atom?.settings?.data || {})
    };

    return (
      <div className="w-full h-full p-4">
        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Evaluate Models - Auto Regressive</h3>
            <p className="text-sm text-gray-600 mb-4">
              Evaluate the performance of auto-regressive models using various metrics.
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
                <option value="Select Variable to Evaluate">Select Variable to Evaluate</option>
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
                <option value="Select Model to Evaluate">Select Model to Evaluate</option>
                <option value="ARIMA">ARIMA</option>
                <option value="SARIMA">SARIMA</option>
                <option value="Prophet">Prophet</option>
                <option value="ETS">ETS</option>
              </select>
            </div>
            
            {/* Evaluation Metrics Display */}
            <div className="pt-4">
              <h4 className="text-md font-medium text-gray-800 mb-2">Evaluation Metrics</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 p-3 rounded-md">
                  <div className="text-sm text-gray-600">MAPE</div>
                  <div className="text-lg font-semibold text-gray-900">{defaultData.evaluationMetrics.mape.toFixed(3)}</div>
                </div>
                <div className="bg-gray-50 p-3 rounded-md">
                  <div className="text-sm text-gray-600">RMSE</div>
                  <div className="text-lg font-semibold text-gray-900">{defaultData.evaluationMetrics.rmse.toFixed(3)}</div>
                </div>
                <div className="bg-gray-50 p-3 rounded-md">
                  <div className="text-sm text-gray-600">MAE</div>
                  <div className="text-lg font-semibold text-gray-900">{defaultData.evaluationMetrics.mae.toFixed(3)}</div>
                </div>
                <div className="bg-gray-50 p-3 rounded-md">
                  <div className="text-sm text-gray-600">R²</div>
                  <div className="text-lg font-semibold text-gray-900">{defaultData.evaluationMetrics.rSquared.toFixed(3)}</div>
                </div>
              </div>
            </div>
            
            <div className="pt-4">
              <button 
                className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 transition-colors"
                onClick={() => {
                  // TODO: Implement model evaluation logic
                  console.log('Evaluating auto-regressive models...');
                }}
              >
                Evaluate Models
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  } catch (error) {
    console.error('🔧 EvaluateModelsAutoRegressiveAtom: Error rendering component:', error);
    return (
      <div className="w-full h-full p-4">
        <div className="text-red-600">
          Error rendering Evaluate Models Auto Regressive Atom: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      </div>
    );
  }
};

export default EvaluateModelsAutoRegressiveAtom;
