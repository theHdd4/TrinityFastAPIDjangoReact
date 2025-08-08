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
  if ('atomId' in props) {
    const { atomId } = props;
    const atom = useLaboratoryStore(state => state.getAtom(atomId));
    const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
    const { data = {}, settings = {} } = (atom?.settings || {}) as any;

    return (
      <InternalBuildModelFeatureBasedProperties
        data={data as any}
        settings={settings as any}
        onDataChange={d => updateSettings(atomId, { data: { ...data, ...d } })}
        onSettingsChange={s => updateSettings(atomId, { settings: { ...settings, ...s } })}
        onDataUpload={(file, fileId) =>
          updateSettings(atomId, {
            data: { ...data, uploadedFile: file, selectedDataset: fileId },
          })
        }
      />
    );
  }
  // Stand-alone usage
  return <InternalBuildModelFeatureBasedProperties {...(props as StandaloneProps)} />;
};

export default BuildModelFeatureBasedProperties;