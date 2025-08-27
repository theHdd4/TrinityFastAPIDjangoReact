import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLaboratoryStore, DEFAULT_SCENARIO_PLANNER_SETTINGS, ScenarioPlannerSettings as SettingsType } from '@/components/LaboratoryMode/store/laboratoryStore';
import { ScenarioPlannerSettings } from '../ScenarioPlannerSettings';
import ScenarioPlannerInputFiles from '../ScenarioPlannerInputFiles';
import { ScenarioPlannerExhibition } from '../ScenarioPlannerExhibition';

interface ScenarioPlannerPropertiesProps {
  atomId: string;
}

export const ScenarioPlannerProperties: React.FC<ScenarioPlannerPropertiesProps> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  
  // ✅ FIXED: Use useMemo to create persistent settings that don't reset on re-render
  const settings: SettingsType = React.useMemo(() => {
    if (atom?.settings) {
      return atom.settings as SettingsType;
    } else {
      return { ...DEFAULT_SCENARIO_PLANNER_SETTINGS };
    }
  }, [atom?.settings]);

  // ✅ REMOVED: Local state that was causing the reset issue
  // const [settings, setSettings] = React.useState<SettingsType>({ ...DEFAULT_SCENARIO_PLANNER_SETTINGS });

  // ✅ REMOVED: useEffect that was updating local state unnecessarily
  // useEffect(() => {
  //   if (atom?.settings) {
  //     setSettings(atom.settings as SettingsType);
  //   } else {
  //     setSettings({ ...DEFAULT_SCENARIO_PLANNER_SETTINGS });
  //   }
  // }, [atom?.settings]);

  const handleDataChange = (newData: Partial<SettingsType>) => {
    // ✅ FIXED: Update store directly without local state
    updateSettings(atomId, newData);
  };

  return (
    <div className="h-full flex flex-col">
              <Tabs defaultValue="inputfiles" className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="inputfiles">Input Files</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="exhibition">Exhibition</TabsTrigger>
        </TabsList>
        
        <TabsContent value="settings" className="flex-1 mt-0">
          <ScenarioPlannerSettings 
            data={settings} 
            onDataChange={handleDataChange}
          />
        </TabsContent>
        
        <TabsContent value="inputfiles" className="flex-1 mt-0">
          <ScenarioPlannerInputFiles atomId={atomId} />
        </TabsContent>
        
        <TabsContent value="exhibition" className="flex-1 mt-0">
          <ScenarioPlannerExhibition data={settings} />
        </TabsContent>
      </Tabs>
    </div>
  );
};