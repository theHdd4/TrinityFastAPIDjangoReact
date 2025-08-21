import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLaboratoryStore, DEFAULT_SCENARIO_PLANNER_SETTINGS, ScenarioPlannerSettings as SettingsType } from '@/components/LaboratoryMode/store/laboratoryStore';
import { ScenarioPlannerSettings } from '../ScenarioPlannerSettings';
import ScenarioPlannerVisualisation from '../ScenarioPlannerVisualisation';
import { ScenarioPlannerExhibition } from '../ScenarioPlannerExhibition';

interface ScenarioPlannerPropertiesProps {
  atomId: string;
}

export const ScenarioPlannerProperties: React.FC<ScenarioPlannerPropertiesProps> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const [settings, setSettings] = React.useState<SettingsType>({ ...DEFAULT_SCENARIO_PLANNER_SETTINGS });

  // Update local settings when store changes
  useEffect(() => {
    if (atom?.settings) {
      setSettings(atom.settings as SettingsType);
    } else {
      setSettings({ ...DEFAULT_SCENARIO_PLANNER_SETTINGS });
    }
  }, [atom?.settings]);

  const handleDataChange = (newData: Partial<SettingsType>) => {
    const updatedSettings = { ...settings, ...newData };
    
    // Update both local state and store
    setSettings(updatedSettings);
    updateSettings(atomId, newData);
  };

  return (
    <div className="h-full flex flex-col">
      <Tabs defaultValue="settings" className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="visualisation">Visualisation</TabsTrigger>
          <TabsTrigger value="exhibition">Exhibition</TabsTrigger>
        </TabsList>
        
        <TabsContent value="settings" className="flex-1 mt-0">
          <ScenarioPlannerSettings 
            data={settings} 
            onDataChange={handleDataChange}
          />
        </TabsContent>
        
        <TabsContent value="visualisation" className="flex-1 mt-0">
          <ScenarioPlannerVisualisation data={settings} />
        </TabsContent>
        
        <TabsContent value="exhibition" className="flex-1 mt-0">
          <ScenarioPlannerExhibition data={settings} />
        </TabsContent>
      </Tabs>
    </div>
  );
};