import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Settings, Eye } from 'lucide-react';
import ColumnClassifierSettings from '../ColumnClassifierSettings';
// COMMENTED OUT - dimensions disabled
// import ColumnClassifierDimensions from './ColumnClassifierDimensions';
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
  const settings: SettingsType = {
    ...DEFAULT_COLUMN_CLASSIFIER_SETTINGS,
    ...(atom?.settings as SettingsType)
  };

  const handleClassification = (file: FileClassification) => {
    updateSettings(atomId, {
      data: { files: [file], activeFileIndex: 0 },
      assignments: {},
      filterColumnViewUnique: true,
    });
  };

  return (
    <div className="h-full flex flex-col">
      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-1">
          <TabsTrigger value="settings" className="text-xs font-medium">
            <Upload className="w-3 h-3 mr-1" />
            Input
          </TabsTrigger>
          {/* COMMENTED OUT - dimensions disabled */}
          {/* <TabsTrigger value="dimensions" className="text-xs font-medium">
            <Settings className="w-3 h-3 mr-1" />
            Settings
          </TabsTrigger> */}
        </TabsList>

        <TabsContent value="settings" className="flex-1 mt-0" forceMount>
          <ColumnClassifierSettings atomId={atomId} onClassification={handleClassification} />
        </TabsContent>
        {/* COMMENTED OUT - dimensions disabled */}
        {/* <TabsContent value="dimensions" className="flex-1 mt-0" forceMount>
          <ColumnClassifierDimensions atomId={atomId} />
        </TabsContent> */}
      </Tabs>
    </div>
  );
};

export default ColumnClassifierProperties;
