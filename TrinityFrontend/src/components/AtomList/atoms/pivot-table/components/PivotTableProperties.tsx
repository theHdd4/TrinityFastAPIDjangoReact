import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Settings as SettingsIcon } from 'lucide-react';
import PivotTableSettings from './PivotTableSettings';
import {
  useLaboratoryStore,
  PivotTableSettings as PivotTableSettingsType,
  DEFAULT_PIVOT_TABLE_SETTINGS,
} from '@/components/LaboratoryMode/store/laboratoryStore';
import PivotTableInputFiles from './PivotTableInputFiles';

interface PivotTablePropertiesProps {
  atomId: string;
}

const PivotTableProperties: React.FC<PivotTablePropertiesProps> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const [tab, setTab] = useState<'inputs' | 'settings'>('inputs');
  const data: PivotTableSettingsType =
    (atom?.settings as PivotTableSettingsType) || { ...DEFAULT_PIVOT_TABLE_SETTINGS };

  const handleDataChange = React.useCallback(
    (newData: Partial<PivotTableSettingsType>) => {
      const latestAtom = useLaboratoryStore.getState().getAtom(atomId);
      const latestSettings: PivotTableSettingsType =
        (latestAtom?.settings as PivotTableSettingsType) || { ...DEFAULT_PIVOT_TABLE_SETTINGS };

      updateSettings(atomId, {
        ...latestSettings,
        ...newData,
      });
    },
    [atomId, updateSettings]
  );

  return (
    <div className="h-full flex flex-col">
      <Tabs value={tab} onValueChange={value => setTab(value as typeof tab)} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="inputs" className="text-xs font-medium">
            <Upload className="w-3 h-3 mr-1" />
            Input Files
            </TabsTrigger>
          <TabsTrigger value="settings" className="text-xs font-medium">
            <SettingsIcon className="w-3 h-3 mr-1" />
            Settings
            </TabsTrigger>
          </TabsList>

        <TabsContent value="inputs" className="flex-1 mt-0" forceMount>
          <div className="p-4">
            <PivotTableInputFiles atomId={atomId} />
              </div>
            </TabsContent>

        <TabsContent value="settings" className="flex-1 mt-0" forceMount>
          <div className="p-4">
            <PivotTableSettings data={data} onDataChange={handleDataChange} />
          </div>
            </TabsContent>
        </Tabs>
    </div>
  );
};

export default PivotTableProperties;

