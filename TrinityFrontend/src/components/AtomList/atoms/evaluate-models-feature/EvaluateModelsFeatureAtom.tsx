import React, { useEffect } from 'react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import EvaluateModelsFeatureCanvas from './components/EvaluateModelsFeatureCanvas';

export interface IdentifierConfig {
  id: string;
  name: string;
  selected: boolean;
}

export interface GraphConfig {
  id: string;
  name: string;
  type: 'waterfall' | 'contribution' | 'actual-vs-predicted' | 'elasticity' | 'beta' | 'averages';
  selected: boolean;
}

export interface EvaluateModelsFeatureData {
  selectedDataframe: string;
  scope: string;
  selectedCombinations: string[];
  identifiers: IdentifierConfig[];
  graphs: GraphConfig[];
  availableColumns: string[];
  modelResults: any[];
  identifiersData?: {[key: string]: {column_name: string | null, unique_values: string[]}};
  selectedIdentifierValues?: {[key: string]: string[]};
}

export interface EvaluateModelsFeatureSettings {
  showLegend: boolean;
  chartHeight: number;
  autoRefresh: boolean;
}

interface EvaluateModelsFeatureAtomProps {
  atomId: string;
  onPropertiesMount?: (component: React.ComponentType<any>) => void;
}

const EvaluateModelsFeatureAtom: React.FC<EvaluateModelsFeatureAtomProps> = ({
  atomId,
  onPropertiesMount
}) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  
  // Force re-render when atom settings change
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);
  
  React.useEffect(() => {
    if (atom?.settings) {
      forceUpdate();
    }
  }, [atom?.settings]);
  
  const defaultData = {
    selectedDataframe: '',
    scope: 'SCOPE 12',
    selectedCombinations: [],
    identifiers: [],
    graphs: [
      { id: '1', name: 'Waterfall Chart', type: 'waterfall', selected: true },
      { id: '2', name: 'Contribution Chart', type: 'contribution', selected: true },
      { id: '3', name: 'Actual vs Predicted', type: 'actual-vs-predicted', selected: true },
      { id: '4', name: 'Elasticity', type: 'elasticity', selected: true },
      { id: '5', name: 'Beta', type: 'beta', selected: true },
      { id: '6', name: 'Averages', type: 'averages', selected: true },
    ],
    availableColumns: ['Column 1', 'Column 2', 'Column 3', 'Column 4'],
    modelResults: [],
    identifiersData: {},
    selectedIdentifierValues: {}
  };

  const defaultSettings = {
    showLegend: true,
    chartHeight: 300,
    autoRefresh: false
  };

  const settings = (atom?.settings as any) || {
    data: defaultData,
    settings: defaultSettings
  };

  // Ensure data structure is complete - get latest from store
  const data = {
    ...defaultData,
    ...settings.data,
    // Force override graphs to ensure correct types and preserve selection state
    graphs: (() => {
      const defaultGraphs = [
        { id: '1', name: 'Waterfall Chart', type: 'waterfall', selected: true },
        { id: '2', name: 'Contribution Chart', type: 'contribution', selected: true },
        { id: '3', name: 'Actual vs Predicted', type: 'actual-vs-predicted', selected: true },
        { id: '4', name: 'Elasticity', type: 'elasticity', selected: true },
        { id: '5', name: 'Beta', type: 'beta', selected: true },
        { id: '6', name: 'Averages', type: 'averages', selected: true },
      ];
      
      // If we have stored graph data, merge it with defaults to preserve selection state
      if (settings.data?.graphs && Array.isArray(settings.data.graphs)) {
        return defaultGraphs.map(defaultGraph => {
          const storedGraph = settings.data.graphs.find(g => g.type === defaultGraph.type);
          return storedGraph ? { ...defaultGraph, selected: storedGraph.selected } : defaultGraph;
        });
      }
      
      return defaultGraphs;
    })()
  };

  const completeSettings = {
    ...defaultSettings,
    ...settings.settings
  };

  console.log('🔧 EvaluateModelsFeatureAtom: Settings for atomId', atomId, ':', settings);
  console.log('🔧 EvaluateModelsFeatureAtom: Selected combinations:', data?.selectedCombinations);
  console.log('🔧 EvaluateModelsFeatureAtom: Current graphs:', data?.graphs);
  console.log('🔧 EvaluateModelsFeatureAtom: Selected graphs:', data?.graphs?.filter(g => g.selected));

  const handleDataChange = (newData: Partial<EvaluateModelsFeatureData>) => {
    console.log('🔧 Data change in atom:', newData);
    console.log('🔧 Current data before update:', data);
    // Update the store with the new data
    const updatedData = { ...data, ...newData };
    console.log('🔧 Updated data after merge:', updatedData);
    updateSettings(atomId, { data: updatedData });
    console.log('🔧 Store update called for atomId:', atomId);
  };

  const handleSettingsChange = (newSettings: Partial<EvaluateModelsFeatureSettings>) => {
    console.log('Settings change in atom:', newSettings);
    // Update the store with the new settings
    const updatedSettings = { ...completeSettings, ...newSettings };
    updateSettings(atomId, { settings: updatedSettings });
  };

  const handleDataUpload = (file: File, fileId: string) => {
    // This will be handled by the properties component
    console.log('File upload in atom:', file.name);
  };

  useEffect(() => {
    if (onPropertiesMount) {
      const PropertiesComponent = React.lazy(() => 
        import('./components/properties/EvaluateModelsFeatureProperties')
      );
      onPropertiesMount(PropertiesComponent);
    }
  }, [onPropertiesMount]);

  return (
    <EvaluateModelsFeatureCanvas
      atomId={atomId}
      data={data}
      settings={completeSettings}
      onDataChange={handleDataChange}
      onSettingsChange={handleSettingsChange}
      onDataUpload={handleDataUpload}
    />
  );
};

export default EvaluateModelsFeatureAtom;