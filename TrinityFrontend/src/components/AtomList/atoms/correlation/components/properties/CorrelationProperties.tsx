import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Settings, Eye } from 'lucide-react';
import CorrelationSettings from '../CorrelationSettings';
import CorrelationExhibition from '../CorrelationExhibition';
import CorrelationVisualisation from '../CorrelationVisualisation';
import { useLaboratoryStore, DEFAULT_CORRELATION_SETTINGS, CorrelationSettings as SettingsType } from '@/components/LaboratoryMode/store/laboratoryStore';

interface Props {
  atomId: string;
}

const CorrelationProperties: React.FC<Props> = ({ atomId }) => {
  const [tab, setTab] = useState('settings');
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings: SettingsType = (atom?.settings as SettingsType) || { ...DEFAULT_CORRELATION_SETTINGS };

  const handleChange = (newSettings: Partial<SettingsType>) => {
    updateSettings(atomId, newSettings);

    // Sync current dataframe for this atom into the laboratory store whenever the file changes
    if (newSettings.selectedFile) {
      try {
        const { setAtomCurrentDataframe } = useLaboratoryStore.getState();
        const objectName = newSettings.selectedFile;
        setAtomCurrentDataframe(atomId, objectName);
      } catch {
        // best-effort; do not block correlation updates on metrics sync
      }
    }
  };

  return (
    <div className="h-full flex flex-col">
      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="settings" className="text-xs font-medium">
            <Upload className="w-3 h-3 mr-1" />
            Input
          </TabsTrigger>
          <TabsTrigger value="visualisation" className="text-xs font-medium">
            <Settings className="w-3 h-3 mr-1" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="exhibition" className="text-xs font-medium">
            <Eye className="w-3 h-3 mr-1" />
            Exhibition
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settings" className="flex-1 mt-0" forceMount>
          <CorrelationSettings data={settings} onDataChange={handleChange} />
        </TabsContent>
        <TabsContent value="visualisation" className="flex-1 mt-0" forceMount>
          <CorrelationVisualisation data={settings} onDataChange={handleChange} />
        </TabsContent>
        <TabsContent value="exhibition" className="flex-1 mt-0" forceMount>
          <CorrelationExhibition data={settings} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default CorrelationProperties;