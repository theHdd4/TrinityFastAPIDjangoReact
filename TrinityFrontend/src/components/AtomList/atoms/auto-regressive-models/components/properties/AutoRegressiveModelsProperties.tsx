import React, { useState } from 'react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import AutoRegressiveModelsSettings from '../AutoRegressiveModelsSettings';
import AutoRegressiveModelsExhibition from '../AutoRegressiveModelsExhibition';

import { AutoRegressiveModelsData, AutoRegressiveModelsSettings as SettingsType } from '../../AutoRegressiveModelsAtom';

// Props when used outside Laboratory Mode
interface StandaloneProps {
  data: AutoRegressiveModelsData;
  settings: SettingsType;
  onDataChange: (data: Partial<AutoRegressiveModelsData>) => void;
  onSettingsChange: (settings: Partial<SettingsType>) => void;
  onDataUpload: (file: File, fileId: string) => void;
  atomId?: string; // Optional atomId for Laboratory Mode
}

const InternalAutoRegressiveModelsProperties: React.FC<StandaloneProps> = ({
  data,
  settings,
  onDataChange,
  onSettingsChange,
  onDataUpload
}) => {
  const [tab, setTab] = useState('settings');

  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full h-full flex flex-col">
      <TabsList className="grid w-full grid-cols-2 bg-gray-50 mb-4 shrink-0 mx-4 mt-4">
        <TabsTrigger value="settings" className="font-medium">Settings</TabsTrigger>
        <TabsTrigger value="exhibition" className="font-medium">Exhibition</TabsTrigger>
      </TabsList>
      <div className="flex-1 overflow-auto px-4">
        <TabsContent value="settings" className="mt-0 h-full" forceMount>
          <AutoRegressiveModelsSettings
            data={data}
            settings={settings}
            onDataChange={onDataChange}
            onSettingsChange={onSettingsChange}
            onDataUpload={onDataUpload}
          />
        </TabsContent>
        <TabsContent value="exhibition" className="mt-0 h-full" forceMount>
          <AutoRegressiveModelsExhibition data={data} />
        </TabsContent>
      </div>
    </Tabs>
  );
};

// Wrapper component: if atomId provided, connect to store; else act as standalone UI
interface StoreProps { atomId: string; }

type Props = StoreProps | StandaloneProps;

const AutoRegressiveModelsProperties: React.FC<Props> = (props) => {
  // Check if we have atomId (either from StoreProps or StandaloneProps)
  const atomId = 'atomId' in props ? props.atomId : (props as StandaloneProps).atomId;
  
  if (atomId) {
    const atom = useLaboratoryStore(state => state.getAtom(atomId));
    const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
    const { data = {}, settings = {} } = (atom?.settings || {}) as any;

    // Provide complete default data structure
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
      validationSplit: 0.2
    };

    const defaultSettings = {
      dataType: '',
      aggregationLevel: '',
      dateFrom: '',
      dateTo: ''
    };

    // Ensure complete data structure
    const completeData = {
      ...defaultData,
      ...data,
      // Ensure selectedModels defaults to all models if none are explicitly set
      selectedModels: data.selectedModels && data.selectedModels.length > 0 
        ? data.selectedModels 
        : defaultData.selectedModels
    };

    const completeSettings = {
      ...defaultSettings,
      ...settings
    };

    return (
      <InternalAutoRegressiveModelsProperties
        data={completeData}
        settings={completeSettings}
        onDataChange={(newData) => {
          const updatedData = { ...completeData, ...newData };
          updateSettings(atomId, { data: updatedData });
        }}
        onSettingsChange={(newSettings) => {
          const updatedSettings = { ...completeSettings, ...newSettings };
          updateSettings(atomId, { settings: updatedSettings });
        }}
        onDataUpload={(file, fileId) => {
          // Handle file upload if needed
          console.log('File upload:', file, fileId);
        }}
        atomId={atomId}
      />
    );
  }

  // Standalone mode - use props directly
  return (
    <InternalAutoRegressiveModelsProperties
      data={props.data}
      settings={props.settings}
      onDataChange={props.onDataChange}
      onSettingsChange={props.onSettingsChange}
      onDataUpload={props.onDataUpload}
    />
  );
};

export default AutoRegressiveModelsProperties;