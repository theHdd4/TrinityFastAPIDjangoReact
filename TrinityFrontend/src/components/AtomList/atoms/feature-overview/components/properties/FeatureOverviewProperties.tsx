import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, BarChart3, Eye } from 'lucide-react';
import FeatureOverviewSettings from '../FeatureOverviewSettings';
import FeatureOverviewVisualisation from '../FeatureOverviewVisualisation';
import FeatureOverviewExhibition from '../FeatureOverviewExhibition';
import { useLaboratoryStore, DEFAULT_FEATURE_OVERVIEW_SETTINGS, FeatureOverviewSettings as SettingsType } from '@/components/LaboratoryMode/store/laboratoryStore';

interface Props {
  atomId: string;
}

const FeatureOverviewProperties: React.FC<Props> = ({ atomId }) => {
  const [tab, setTab] = useState('settings');
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings: SettingsType = (atom?.settings as SettingsType) || { ...DEFAULT_FEATURE_OVERVIEW_SETTINGS };

  const handleChange = (newSettings: Partial<SettingsType>) => {
    updateSettings(atomId, newSettings);
  };

  return (
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      <TabsList className="grid w-full grid-cols-3 mx-4 my-4">
        <TabsTrigger value="settings" className="text-xs">
          <Settings className="w-3 h-3 mr-1" />
          Settings
        </TabsTrigger>
        <TabsTrigger value="visual" className="text-xs">
          <BarChart3 className="w-3 h-3 mr-1" />
          Visualisation
        </TabsTrigger>
        <TabsTrigger value="exhibition" className="text-xs">
          <Eye className="w-3 h-3 mr-1" />
          Exhibition
        </TabsTrigger>
      </TabsList>

      <div className="px-4">
        <TabsContent value="settings" className="space-y-4" forceMount>
          <FeatureOverviewSettings settings={settings} onSettingsChange={handleChange} />
        </TabsContent>
        <TabsContent value="visual" className="space-y-4" forceMount>
          <FeatureOverviewVisualisation
            numericColumns={(settings.numericColumns || []).filter(Boolean)}
            allColumns={
              (settings.allColumns || [])
                .filter((c: any) => c && c.column)
                .map((c: any) => c.column)
            }
            yValues={settings.yAxes || []}
            xValue={settings.xAxis || 'date'}
            onYChange={val => handleChange({ yAxes: val })}
            onXChange={val => handleChange({ xAxis: val })}
          />
        </TabsContent>
        <TabsContent value="exhibition" className="space-y-4" forceMount>
          <FeatureOverviewExhibition />
        </TabsContent>
      </div>
    </Tabs>
  );
};

export default FeatureOverviewProperties;
