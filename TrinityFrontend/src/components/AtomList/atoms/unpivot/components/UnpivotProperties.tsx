import React, { useState, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Settings as SettingsIcon } from 'lucide-react';
import UnpivotSettings from './UnpivotSettings';
import {
  useLaboratoryStore,
  UnpivotSettings as UnpivotSettingsType,
  DEFAULT_UNPIVOT_SETTINGS,
} from '@/components/LaboratoryMode/store/laboratoryStore';
import UnpivotInputFiles from './UnpivotInputFiles';

interface UnpivotPropertiesProps {
  atomId: string;
  onApply?: () => void;
  isComputing?: boolean;
}

const UnpivotProperties: React.FC<UnpivotPropertiesProps> = ({ atomId, onApply, isComputing: externalIsComputing = false }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const [tab, setTab] = useState<'inputs' | 'settings'>('inputs');
  const [manualApplyToken, setManualApplyToken] = useState(0);

  const rawSettings = atom?.settings as UnpivotSettingsType | undefined;
  const data: UnpivotSettingsType = {
    ...DEFAULT_UNPIVOT_SETTINGS,
    ...(rawSettings || {}),
    idVars: Array.isArray(rawSettings?.idVars) ? rawSettings!.idVars : [],
    valueVars: Array.isArray(rawSettings?.valueVars) ? rawSettings!.valueVars : [],
    dataSourceColumns: Array.isArray(rawSettings?.dataSourceColumns) ? rawSettings!.dataSourceColumns : [],
    preFilters: Array.isArray(rawSettings?.preFilters) ? rawSettings!.preFilters : [],
    postFilters: Array.isArray(rawSettings?.postFilters) ? rawSettings!.postFilters : [],
    unpivotResults: Array.isArray(rawSettings?.unpivotResults) ? rawSettings!.unpivotResults : [],
  };
  
  // Internal apply handler that triggers manual refresh
  const handleApply = useCallback(() => {
    if (onApply) {
      // Use external handler if provided (from UnpivotAtom)
      onApply();
    } else {
      // If no external handler (when used in SettingsPanel), trigger via setting update
      // UnpivotAtom will watch for this change
      const latestAtom = useLaboratoryStore.getState().getAtom(atomId);
      const latestSettings: UnpivotSettingsType =
        (latestAtom?.settings as UnpivotSettingsType) || { ...DEFAULT_UNPIVOT_SETTINGS };
      updateSettings(atomId, {
        ...latestSettings,
        // Trigger refresh by updating a timestamp-like field that UnpivotAtom watches
        lastApplyTrigger: Date.now(),
      });
    }
  }, [atomId, onApply, updateSettings]);
  
  // Check if computing from atom status
  const isComputing = externalIsComputing || data.unpivotStatus === 'pending';

  const handleDataChange = React.useCallback(
    (newData: Partial<UnpivotSettingsType>) => {
      const latestAtom = useLaboratoryStore.getState().getAtom(atomId);
      const latestSettings: UnpivotSettingsType =
        (latestAtom?.settings as UnpivotSettingsType) || { ...DEFAULT_UNPIVOT_SETTINGS };

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
            <UnpivotInputFiles atomId={atomId} />
          </div>
        </TabsContent>

        <TabsContent value="settings" className="flex-1 mt-0" forceMount>
          <div className="p-4">
            <UnpivotSettings 
              data={data} 
              onDataChange={handleDataChange}
              onApply={handleApply}
              isComputing={isComputing}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default UnpivotProperties;

