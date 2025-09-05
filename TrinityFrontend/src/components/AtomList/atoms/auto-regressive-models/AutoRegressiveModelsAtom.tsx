import React from 'react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import AutoRegressiveModelsCanvas from './components/AutoRegressiveModelsCanvas';

export interface AutoRegressiveModelConfig {
  id: string;
  name: string;
  parameters: Record<string, any>;
}

export interface TimeSeriesTransformation {
  id: string;
  component1: string;
  component2: string;
  transformationType: string;
}

export interface AutoRegressiveModelsData {
  uploadedFile: File | null;
  selectedDataset: string;
  selectedScope: string;
  selectedCombinations: string[];
  selectedModels: string[];
  modelConfigs: AutoRegressiveModelConfig[];
  targetVariable: string;
  timeVariable: string;
  exogenousVariables: (string | string[])[];
  transformations: TimeSeriesTransformation[];
  availableFiles?: string[];
  availableColumns: string[];
  scopes: string[];
  outputFileName: string;
  timeSeriesLength?: number;
  forecastHorizon?: number;
  validationSplit?: number;
  frequency?: string;
  availableDateColumns?: string[];
  // New fields for model training results
  modelResults?: any; // Store the API response from model training
  lastRunTimestamp?: string; // ISO timestamp of last training run
  trainingStatus?: 'idle' | 'training' | 'completed' | 'error'; // Current training status
  lastError?: string; // Last error message if training failed
}

export interface AutoRegressiveModelsSettings {
  dataType: string;
  aggregationLevel: string;
  dateFrom: string;
  dateTo: string;
}

interface Props {
  atomId: string;
}

const AutoRegressiveModelsAtom: React.FC<Props> = ({ atomId }) => {
  console.log('🔧 AutoRegressiveModelsAtom: Component rendered with atomId:', atomId);
  
  try {
    const atom = useLaboratoryStore(state => state.getAtom(atomId));
    console.log('🔧 AutoRegressiveModelsAtom: Retrieved atom from store:', atom);
    
    const defaultData = {
      uploadedFile: null,
      selectedDataset: '',
      selectedScope: '',
      selectedCombinations: [],
      selectedModels: ['ARIMA', 'SARIMA', 'Holt-Winters', 'ETS', 'Prophet'], // Only models supported by backend
      modelConfigs: [
        { id: 'ARIMA', name: 'ARIMA', parameters: { 'AR Order': '1', 'Differencing': '1', 'MA Order': '1' } },
        { id: 'SARIMA', name: 'SARIMA', parameters: { 'AR Order': '1', 'Differencing': '1', 'MA Order': '1', 'Seasonal Period': '12' } },
        { id: 'Holt-Winters', name: 'Holt-Winters', parameters: { 'Trend': 'additive', 'Seasonal': 'additive', 'Seasonal Periods': '12' } },
        { id: 'ETS', name: 'ETS', parameters: { 'Error': 'additive', 'Trend': 'additive', 'Seasonal': 'additive' } },
        { id: 'Prophet', name: 'Prophet', parameters: { 'Growth': 'linear', 'Seasonality': 'additive', 'Holidays': 'auto' } }
      ],
      targetVariable: '',
      timeVariable: '',
      exogenousVariables: [],
      transformations: [],
      availableFiles: [],
      availableColumns: ['Time', 'Target', 'Feature 1', 'Feature 2', 'Feature 3', 'Feature 4', 'Feature 5'],
      scopes: ['Scope 1', 'Scope 2', 'Scope 3', 'Scope 4', 'Scope 5'],
      outputFileName: '',
      timeSeriesLength: 100,
      forecastHorizon: 12,
      validationSplit: 0.2,
      frequency: 'D', // Added frequency field
      availableDateColumns: ['Date'], // Added availableDateColumns field
      // New training-related fields
      trainingStatus: 'idle' as const,
      lastRunTimestamp: undefined,
      lastError: undefined
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

    // Ensure data structure is complete, but preserve manual selections
    const completeData = {
      ...defaultData,
      ...settings.data,
      // Always default to all models selected if no models are explicitly selected
      selectedModels: settings.data?.selectedModels && settings.data.selectedModels.length > 0 
        ? settings.data.selectedModels 
        : defaultData.selectedModels
    };

    // Ensure all models are selected by default on first load
    if (!settings.data?.selectedModels || settings.data.selectedModels.length === 0) {
      completeData.selectedModels = defaultData.selectedModels;
    }

    console.log('🔧 AutoRegressiveModelsAtom: Settings for atomId', atomId, ':', settings);
    console.log('🔧 AutoRegressiveModelsAtom: Selected scope:', completeData?.selectedScope);
    console.log('🔧 AutoRegressiveModelsAtom: Selected combinations:', completeData?.selectedCombinations);
    console.log('🔧 AutoRegressiveModelsAtom: Selected models:', completeData?.selectedModels);
    console.log('🔧 AutoRegressiveModelsAtom: Settings data selectedModels:', settings.data?.selectedModels);

    return (
      <div className="w-full h-full bg-white rounded-lg overflow-hidden flex flex-col">
        <AutoRegressiveModelsCanvas
          atomId={atomId}
          data={completeData}
          onClose={() => {}}
          onDataChange={(newData) => {
            const currentSettings = atom?.settings || {};
            useLaboratoryStore.getState().updateAtomSettings(atomId, {
              data: { ...(currentSettings.data || {}), ...newData },
            });
          }}
        />
      </div>
    );
  } catch (err) {
    console.error('🔧 AutoRegressiveModelsAtom: Component error:', err);
    return (
      <div className="w-full h-full bg-white rounded-lg overflow-hidden flex flex-col items-center justify-center">
        <div className="text-red-500 text-center">
          <h3 className="text-lg font-semibold mb-2">Error Loading Auto-Regressive Models Atom</h3>
          <p className="text-sm">Please try refreshing the page or contact support.</p>
          <p className="text-xs mt-2">Error: {err instanceof Error ? err.message : String(err)}</p>
        </div>
      </div>
    );
  }
};

export default AutoRegressiveModelsAtom;
