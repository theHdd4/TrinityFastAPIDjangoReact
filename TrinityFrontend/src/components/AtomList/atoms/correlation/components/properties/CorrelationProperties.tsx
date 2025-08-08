import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Database, Settings, Eye, BarChart3 } from 'lucide-react';
import CorrelationSettings from '../CorrelationSettings';
import CorrelationExhibition from '../CorrelationExhibition';
import CorrelationVisualisationCompact from '../CorrelationVisualisationCompact';
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
  };

  return (
    <div className="w-full">
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mx-4 my-4">
          <TabsTrigger value="settings" className="text-xs">
            <Settings className="w-3 h-3 mr-1" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="exhibition" className="text-xs">
            <Eye className="w-3 h-3 mr-1" />
            Exhibition
          </TabsTrigger>
          <TabsTrigger value="visualisation" className="text-xs">
            <BarChart3 className="w-3 h-3 mr-1" />
            Visualisation
          </TabsTrigger>
        </TabsList>

        <div className="px-4">
          <TabsContent value="settings" className="space-y-4" forceMount>
            <CorrelationSettings data={settings} onDataChange={handleChange} />
          </TabsContent>
          <TabsContent value="exhibition" className="space-y-4" forceMount>
            <CorrelationExhibition data={settings} />
          </TabsContent>
          <TabsContent value="visualisation" className="space-y-4" forceMount>
            <CorrelationVisualisationCompact data={settings} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default CorrelationProperties;