import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings } from 'lucide-react';
import ColumnClassifierSettings from '../ColumnClassifierSettings';
import ColumnClassifierDimensions from './ColumnClassifierDimensions';
import {
  useLaboratoryStore,
  DEFAULT_COLUMN_CLASSIFIER_SETTINGS,
  ColumnClassifierSettings as SettingsType,
  ColumnClassifierFile,
  ColumnClassifierColumn,
  ColumnClassifierData
} from '@/components/LaboratoryMode/store/laboratoryStore';
import type { FileClassification } from '../ColumnClassifierAtom';

interface Props {
  atomId: string;
}

const ColumnClassifierProperties: React.FC<Props> = ({ atomId }) => {
  const [tab, setTab] = useState('settings');
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings: SettingsType = (atom?.settings as SettingsType) || {
    ...DEFAULT_COLUMN_CLASSIFIER_SETTINGS
  };

  const handleClassification = (file: FileClassification) => {
    updateSettings(atomId, { data: { files: [file], activeFileIndex: 0 } });
  };

  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      <TabsList className="grid w-full grid-cols-2 mx-4 my-4">
        <TabsTrigger value="settings" className="text-xs">
          <Settings className="w-3 h-3 mr-1" />
          Settings
        </TabsTrigger>
        <TabsTrigger value="dimensions" className="text-xs">
          Dimensions
        </TabsTrigger>
      </TabsList>

      <div className="px-4">
        <TabsContent value="settings" className="space-y-4" forceMount>
          <ColumnClassifierSettings atomId={atomId} onClassification={handleClassification} />
        </TabsContent>
        <TabsContent value="dimensions" className="space-y-4" forceMount>
          <ColumnClassifierDimensions atomId={atomId} />
        </TabsContent>
      </div>
    </Tabs>
  );
};

export default ColumnClassifierProperties;
