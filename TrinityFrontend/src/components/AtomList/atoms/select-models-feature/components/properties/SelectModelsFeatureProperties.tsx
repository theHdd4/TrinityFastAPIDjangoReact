import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Database, Settings, Eye } from 'lucide-react';
import SelectModelsFeatureSettings from '../SelectModelsFeatureSettings';
import SelectModelsFeatureExhibition from '../SelectModelsFeatureExhibtion';
import SelectModelsFeatureVisualisation from '../SelectModelsFeatureVisualisation';
import { useLaboratoryStore, DEFAULT_SELECT_MODELS_FEATURE_SETTINGS, SelectModelsFeatureSettings as SettingsType } from '@/components/LaboratoryMode/store/laboratoryStore';
import { useToast } from '@/hooks/use-toast';

interface Props {
  atomId: string;
}

const SelectModelsFeatureProperties: React.FC<Props> = ({ atomId }) => {
  const [tab, setTab] = useState('settings');
  const [error, setError] = useState<string | null>(null);
  
  try {
    const { toast } = useToast();
    const atom = useLaboratoryStore(state => state.getAtom(atomId));
    const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
    const settings: SettingsType = (atom?.settings as SettingsType) || { ...DEFAULT_SELECT_MODELS_FEATURE_SETTINGS };

    const handleChange = (newSettings: Partial<SettingsType>) => {
      try {
        console.log('🔧 SelectModelsFeatureProperties: Updating settings:', newSettings);
        console.log('🔧 SelectModelsFeatureProperties: atomId:', atomId);
        updateSettings(atomId, newSettings);
        console.log('🔧 SelectModelsFeatureProperties: Settings updated successfully');
      } catch (err) {
        console.error('🔧 SelectModelsFeatureProperties: Error updating settings:', err);
        setError('Failed to update settings. Please try again.');
      }
    };

    return (
      <div className="w-full h-full flex flex-col">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
            <p className="text-red-800 text-sm">{error}</p>
            <button 
              onClick={() => setError(null)}
              className="text-red-600 text-xs mt-2 hover:text-red-800"
            >
              Dismiss
            </button>
          </div>
        )}
        <Tabs value={tab} onValueChange={setTab} className="w-full h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-3 bg-gray-50 mb-4 shrink-0 mx-4 mt-4">
            <TabsTrigger value="settings" className="text-xs font-medium">
              <Settings className="w-3 h-3 mr-1" />
              Settings
            </TabsTrigger>
            <TabsTrigger value="exhibition" className="text-xs font-medium">
              <Eye className="w-3 h-3 mr-1" />
              Exhibition
            </TabsTrigger>
            <TabsTrigger value="visualisation" className="text-xs font-medium">
              <Database className="w-3 h-3 mr-1" />
              Visualisation
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-auto px-4">
            <TabsContent value="settings" className="mt-0 h-full" forceMount>
              <SelectModelsFeatureSettings 
                data={settings} 
                onDataChange={handleChange}
              />
            </TabsContent>
            <TabsContent value="exhibition" className="mt-0 h-full" forceMount>
              <SelectModelsFeatureExhibition data={settings} />
            </TabsContent>
            <TabsContent value="visualisation" className="mt-0 h-full" forceMount>
              <SelectModelsFeatureVisualisation data={settings} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    );
  } catch (err) {
    console.error('🔧 SelectModelsFeatureProperties: Component error:', err);
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800 text-sm">Failed to load select models feature properties: {err instanceof Error ? err.message : 'Unknown error'}</p>
        </div>
      </div>
    );
  }
};

export default SelectModelsFeatureProperties;