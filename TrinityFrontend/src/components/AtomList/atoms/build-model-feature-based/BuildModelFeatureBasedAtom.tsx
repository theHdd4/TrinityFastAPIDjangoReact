import React, { useState, useEffect } from 'react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import BuildModelFeatureBasedCanvas from './components/BuildModelFeatureBasedCanvas';
import BuildModelFeatureBasedProperties from './components/properties/BuildModelFeatureBasedProperties';

export interface ModelConfig {
  id: string;
  name: string;
  parameters: Record<string, any>;
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
  selectedModels: string[];
  modelConfigs: ModelConfig[];
  yVariable: string;
  xVariables: string[];
  transformations: VariableTransformation[];
  availableColumns: string[];
  scopes: string[];
  outputFileName: string;
}

export interface BuildModelFeatureBasedSettings {
  dataType: string;
  aggregationLevel: string;
  dateFrom: string;
  dateTo: string;
}

interface BuildModelFeatureBasedAtomProps {
  atomId?: string; // provided when rendered inside Laboratory Mode
  onClose?: () => void;
  onPropertiesChange?: (data: any, component: React.ReactNode) => void;
}

const BuildModelFeatureBasedAtom: React.FC<BuildModelFeatureBasedAtomProps> = ({ 
  atomId,
  onClose, 
  onPropertiesChange 
}) => {
  // If atomId is supplied, pull data & settings from Zustand store; otherwise fall back to local state for standalone use.
  const storeAtom = useLaboratoryStore(state => (atomId ? state.getAtom(atomId) : undefined));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);

  const initialData: BuildModelFeatureBasedData = (storeAtom?.settings as any)?.data || {
    uploadedFile: null,
    selectedDataset: '',
    selectedScope: '',
    selectedModels: [],
    modelConfigs: [],
    yVariable: '',
    xVariables: [],
    transformations: [],
    availableColumns: ['Feature 1', 'Feature 2', 'Feature 3', 'Feature 4', 'Feature 5', 'Feature 6', 'Feature 7', 'Feature 8'],
    scopes: ['Scope 1', 'Scope 2', 'Scope 3', 'Scope 4', 'Scope 5'],
    outputFileName: ''
  };

  const [data, setData] = useState<BuildModelFeatureBasedData>(initialData);

  const [settings, setSettings] = useState<BuildModelFeatureBasedSettings>({
    dataType: '',
    aggregationLevel: '',
    dateFrom: '',
    dateTo: ''
  });

  const handleDataChange = (newData: Partial<BuildModelFeatureBasedData>) => {
    const updatedData = { ...data, ...newData };
    setData(updatedData);
    
    if (onPropertiesChange) {
      onPropertiesChange(
        updatedData,
        <BuildModelFeatureBasedProperties
          data={updatedData}
          settings={settings}
          onDataChange={handleDataChange}
          onSettingsChange={handleSettingsChange}
          onDataUpload={handleDataUpload}
        />
      );
    }
  };

  const handleSettingsChange = (newSettings: Partial<BuildModelFeatureBasedSettings>) => {
    const updatedSettings = { ...settings, ...newSettings };
    setSettings(updatedSettings);
  };

  const handleDataUpload = (file: File, fileId: string) => {
    handleDataChange({ 
      uploadedFile: file,
      selectedDataset: fileId,
      availableColumns: ['Feature 1', 'Feature 2', 'Feature 3', 'Feature 4', 'Feature 5', 'Feature 6', 'Feature 7', 'Feature 8']
    });
  };

  // write default settings to store once when mounted
  useEffect(() => {
    if (atomId && updateSettings) {
      updateSettings(atomId, { data: initialData, settings });
    }
    if (onPropertiesChange) {
      onPropertiesChange(
        data,
        <BuildModelFeatureBasedProperties
          data={data}
          settings={settings}
          onDataChange={handleDataChange}
          onSettingsChange={handleSettingsChange}
          onDataUpload={handleDataUpload}
        />
      );
    }
  }, []);

  return (
    <BuildModelFeatureBasedCanvas
      data={data}
      onDataChange={handleDataChange}
      onClose={onClose}
    />
  );
};

export default BuildModelFeatureBasedAtom;