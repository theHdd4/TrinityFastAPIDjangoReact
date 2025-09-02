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

  // ✅ NEW: Get current scenario data for Settings component
  const currentScenario = settings?.selectedScenario || 'scenario-1';
  const currentScenarioData = settings?.scenarios?.[currentScenario];
  
  // ✅ NEW: Create scenario-specific data for Settings component
  const scenarioSettingsForSettings = React.useMemo(() => {
    // ✅ FIXED: Don't create empty arrays - let Settings component handle the sync
    if (currentScenarioData) {
      const result = {
        ...settings,
        // Use current scenario data as-is - let Settings component sync if needed
        identifiers: currentScenarioData.identifiers || [],
        features: currentScenarioData.features || [],
        outputs: currentScenarioData.outputs || [],
        combinations: currentScenarioData.combinations || [],
        resultViews: currentScenarioData.resultViews || [],
        aggregatedViews: currentScenarioData.aggregatedViews || [],
        selectedView: currentScenarioData.selectedView || 'view-1',
        combinationInputs: currentScenarioData.combinationInputs || {},
        originalReferenceValues: currentScenarioData.originalReferenceValues || {},
        
        // Merge with global backend data
        backendIdentifiers: settings.backendIdentifiers,
        backendFeatures: settings.backendFeatures,
        referenceMethod: settings.referenceMethod,
        referencePeriod: settings.referencePeriod
      };
      
      console.log('🔍 Properties: scenarioSettingsForSettings result:', {
        identifiersCount: result.identifiers.length,
        featuresCount: result.features.length,
        hasBackendData: !!(settings.backendIdentifiers && settings.backendFeatures)
      });
      
      return result;
    } else {
      // Fallback to global settings if no scenario data exists
      return settings;
    }
  }, [settings, currentScenario, currentScenarioData]);

  // Debug: Log when scenario changes
  React.useEffect(() => {
    console.log('🔍 Properties: Scenario changed:', {
      currentScenario,
      hasScenarioData: !!currentScenarioData,
      scenarioDataKeys: currentScenarioData ? Object.keys(currentScenarioData) : [],
      identifiersCount: currentScenarioData?.identifiers?.length || 0,
      featuresCount: currentScenarioData?.features?.length || 0,
      aggregatedViewsCount: currentScenarioData?.aggregatedViews?.length || 0
    });
  }, [currentScenario, currentScenarioData]);

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
    console.log('🔍 Properties: handleDataChange called with:', newData);
    
    // Special debug for refresh reference values
    if (newData.referenceValuesNeedRefresh) {
      console.log('🔄 REFRESH REFERENCE VALUES TRIGGERED!', {
        referenceValuesNeedRefresh: newData.referenceValuesNeedRefresh,
        lastReferenceMethod: newData.lastReferenceMethod,
        lastReferencePeriod: newData.lastReferencePeriod
      });
    }
    
    // ✅ FIXED: Only update if we have actual changes to prevent infinite loops
    if (Object.keys(newData).length === 0) {
      console.log('🔍 Properties: No data to update, skipping');
      return;
    }
    
    // ✅ FIXED: Simplified update logic to prevent infinite loops
    if (currentScenarioData) {
      // Only update scenario-specific properties that actually changed
      const updatedScenarios = { ...settings.scenarios };
      if (updatedScenarios[currentScenario]) {
        const currentData = updatedScenarios[currentScenario];
        let hasChanges = false;
        
        // Check each property for actual changes
        Object.entries(newData).forEach(([key, value]) => {
          if (value !== undefined && JSON.stringify(currentData[key]) !== JSON.stringify(value)) {
            updatedScenarios[currentScenario] = {
              ...updatedScenarios[currentScenario],
              [key]: value
            };
            hasChanges = true;
          }
        });
        
        if (hasChanges) {
          console.log('🔍 Properties: Updating scenario data with changes');
          updateSettings(atomId, { scenarios: updatedScenarios });
        } else {
          console.log('🔍 Properties: No scenario changes detected, skipping update');
        }
      }
    }
    
    // Update global properties separately to avoid circular updates
    const globalUpdates: Partial<SettingsType> = {};
    if (newData.backendIdentifiers) globalUpdates.backendIdentifiers = newData.backendIdentifiers;
    if (newData.backendFeatures) globalUpdates.backendFeatures = newData.backendFeatures;
    if (newData.referenceMethod) globalUpdates.referenceMethod = newData.referenceMethod;
    if (newData.referencePeriod) globalUpdates.referencePeriod = newData.referencePeriod;
    if (newData.referenceValuesNeedRefresh !== undefined) globalUpdates.referenceValuesNeedRefresh = newData.referenceValuesNeedRefresh;
    if (newData.lastReferenceMethod) globalUpdates.lastReferenceMethod = newData.lastReferenceMethod;
    if (newData.lastReferencePeriod) globalUpdates.lastReferencePeriod = newData.lastReferencePeriod;
    
    if (Object.keys(globalUpdates).length > 0) {
      console.log('🔍 Properties: Updating global properties:', globalUpdates);
      updateSettings(atomId, globalUpdates);
    }
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
          {/* Show current scenario only (backend status removed) */}
          <div className="text-xs text-gray-600 bg-blue-50 p-2 rounded border mb-2">
            <strong>Current Scenario:</strong> {currentScenario.replace('scenario-', 'Scenario ')}
            {currentScenarioData ? ' ✅' : ' ❌ (No data)'}
          </div>

          <ScenarioPlannerSettings 
            data={scenarioSettingsForSettings} 
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