import React, { useState } from 'react';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import BuildModelFeatureBasedSettings from '../BuildModelFeatureBasedSettings';
import BuildModelFeatureBasedExhibition from '../BuildModelFeatureBasedExhibition';

import { BuildModelFeatureBasedData, BuildModelFeatureBasedSettings as SettingsType } from '../../BuildModelFeatureBasedAtom';

// Props when used outside Laboratory Mode
interface StandaloneProps {
  data: BuildModelFeatureBasedData;
  settings: SettingsType;
  onDataChange: (data: Partial<BuildModelFeatureBasedData>) => void;
  onSettingsChange: (settings: Partial<SettingsType>) => void;
  onDataUpload: (file: File, fileId: string) => void;
  atomId?: string; // Optional atomId for Laboratory Mode
}

const InternalBuildModelFeatureBasedProperties: React.FC<StandaloneProps> = ({
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
          <BuildModelFeatureBasedSettings
            data={data}
            settings={settings}
            onDataChange={onDataChange}
            onSettingsChange={onSettingsChange}
            onDataUpload={onDataUpload}
          />
        </TabsContent>
        <TabsContent value="exhibition" className="mt-0 h-full" forceMount>
          <BuildModelFeatureBasedExhibition data={data} />
        </TabsContent>
      </div>
    </Tabs>
  );
};

// Wrapper component: if atomId provided, connect to store; else act as standalone UI
interface StoreProps { atomId: string; }

type Props = StoreProps | StandaloneProps;

const BuildModelFeatureBasedProperties: React.FC<Props> = (props) => {
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
      selectedModels: [],
      modelConfigs: [],
      yVariable: '',
      xVariables: [],
      transformations: [],
      availableFiles: [],
      availableColumns: ['Feature 1', 'Feature 2', 'Feature 3', 'Feature 4', 'Feature 5', 'Feature 6', 'Feature 7', 'Feature 8'],
      scopes: ['Scope 1', 'Scope 2', 'Scope 3', 'Scope 4', 'Scope 5'],
      outputFileName: ''
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
      ...data
    };

    const completeSettings = {
      ...defaultSettings,
      ...settings
    };

    console.log('Properties - atomId:', atomId);
    console.log('Properties - store data:', data);
    console.log('Properties - complete data:', completeData);
    console.log('Properties - store settings:', settings);

    return (
      <InternalBuildModelFeatureBasedProperties
        data={completeData as any}
        settings={completeSettings as any}
        onDataChange={d => {
          console.log('Properties - onDataChange called with:', d);
          console.log('Properties - current store data:', data);
          const updatedData = { ...completeData, ...d };
          console.log('Properties - updated data:', updatedData);
          updateSettings(atomId, { data: updatedData });
        }}
        onSettingsChange={s => updateSettings(atomId, { settings: { ...completeSettings, ...s } })}
        onDataUpload={(file, fileId) =>
          updateSettings(atomId, {
            data: { ...completeData, uploadedFile: file, selectedDataset: fileId },
          })
        }
      />
    );
  }
  // Stand-alone usage without atomId
  return <InternalBuildModelFeatureBasedProperties {...(props as StandaloneProps)} />;
};

export default BuildModelFeatureBasedProperties;