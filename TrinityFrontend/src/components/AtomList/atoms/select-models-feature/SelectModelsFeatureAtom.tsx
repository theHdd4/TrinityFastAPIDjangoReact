import React, { useEffect } from 'react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import SelectModelsFeatureCanvas from './components/SelectModelsFeatureCanvas';

interface Props {
  atomId: string;
}

const SelectModelsFeatureAtom: React.FC<Props> = ({ atomId }) => {
  console.log('🔧 SelectModelsFeatureAtom: Component rendered with atomId:', atomId);
  
  try {
    const atom = useLaboratoryStore(state => state.getAtom(atomId));
    const settings = (atom?.settings as any) || {
      uploadedFile: null,
      selectedDataset: '',
      ensembleMethod: true,
      selectedScope: 'SCOPE 12',
      availableScopes: ['SCOPE 12', 'SCOPE 13', 'SCOPE 14', 'SCOPE 15'],
      selectedVariable: 'Select Variable to View Model Results',
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
        mape: 0.75,
        pValue: 0.45,
        rSquared: 0.82,
        aic: 0.63,
        filters: []
      },
      selectedModel: 'Select Model to View Model Performance',
      performanceData: [],
      isRunning: false,
      dataType: '',
      aggregationLevel: ''
    };

    // Add useEffect to track settings changes
    useEffect(() => {
      console.log('🔧 SelectModelsFeatureAtom: Settings changed for atomId', atomId, ':', settings);
    }, [settings, atomId]);

    // Force re-render when atom changes
    useEffect(() => {
      console.log('🔧 SelectModelsFeatureAtom: Atom object changed:', atom);
    }, [atom]);

    console.log('🔧 SelectModelsFeatureAtom: Settings for atomId', atomId, ':', settings);
    console.log('🔧 SelectModelsFeatureAtom: atom object:', atom);

    // Force re-render when settings change
    const settingsKey = JSON.stringify(settings);

    return (
      <div className="w-full h-full bg-white rounded-lg overflow-hidden flex flex-col">
        <SelectModelsFeatureCanvas
          atomId={atomId}
          data={settings}
          key={settingsKey} // Force re-render when settings change
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