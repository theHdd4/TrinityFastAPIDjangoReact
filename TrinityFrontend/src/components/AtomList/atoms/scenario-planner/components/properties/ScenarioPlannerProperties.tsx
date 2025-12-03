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
    // ✅ FIXED: Always use scenario data if it exists, to ensure updates are reflected
    const scenarioIdentifiers = currentScenarioData?.identifiers;
    const scenarioFeatures = currentScenarioData?.features;
    
    const result = {
      ...settings,
      // ✅ CRITICAL: Always use scenario data if it exists (even if empty), to reflect user selections
      // Only use empty array if scenario data doesn't exist at all (Settings will sync from backend)
      identifiers: scenarioIdentifiers !== undefined ? scenarioIdentifiers : [],
      features: scenarioFeatures !== undefined ? scenarioFeatures : [],
      outputs: currentScenarioData?.outputs || [],
      combinations: currentScenarioData?.combinations || [],
      resultViews: currentScenarioData?.resultViews || [],
      aggregatedViews: currentScenarioData?.aggregatedViews || [],
      selectedView: currentScenarioData?.selectedView || 'view-1',
      combinationInputs: currentScenarioData?.combinationInputs || {},
      originalReferenceValues: currentScenarioData?.originalReferenceValues || {},
      
      // ✅ CRITICAL: Always include backend data - Settings component needs this to sync
      backendIdentifiers: settings.backendIdentifiers,
      backendFeatures: settings.backendFeatures,
      backendCombinations: settings.backendCombinations,
      selectedCombinations: currentScenarioData?.selectedCombinations || [],
      referenceMethod: settings.referenceMethod,
      referencePeriod: settings.referencePeriod
    };
    
    console.log('🔍 Properties: scenarioSettingsForSettings result:', {
      identifiersCount: result.identifiers.length,
      featuresCount: result.features.length,
      scenarioIdentifiersCount: scenarioIdentifiers?.length || 0,
      scenarioFeaturesCount: scenarioFeatures?.length || 0,
      hasBackendIdentifiers: !!result.backendIdentifiers,
      hasBackendFeatures: !!result.backendFeatures,
      hasBackendCombinations: !!result.backendCombinations,
      backendIdentifiersKeys: result.backendIdentifiers ? Object.keys(result.backendIdentifiers) : [],
      backendFeaturesKeys: result.backendFeatures ? Object.keys(result.backendFeatures) : [],
      identifierColumnsCount: result.backendIdentifiers?.identifier_columns?.length || 0,
      allUniqueFeaturesCount: result.backendFeatures?.all_unique_features?.length || 0,
      selectedCombinations: result.selectedCombinations?.length || 0,
      backendCombinationsCount: result.backendCombinations?.combinations?.length || 0
    });
    
    return result;
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
    
    // ✅ FIXED: Handle scenario-specific updates (identifiers, features, etc.)
    const scenarioUpdates: Partial<SettingsType> = {};
    let hasScenarioUpdates = false;
    
    // Properties that should be updated in the scenario
    const scenarioProperties = ['identifiers', 'features', 'outputs', 'combinations', 'resultViews', 'aggregatedViews', 'selectedView', 'combinationInputs', 'originalReferenceValues', 'selectedCombinations'];
    
    if (currentScenarioData) {
      const updatedScenarios = { ...settings.scenarios };
      if (!updatedScenarios[currentScenario]) {
        // Initialize scenario if it doesn't exist
        updatedScenarios[currentScenario] = { ...currentScenarioData };
      }
      
      // Update scenario-specific properties
      scenarioProperties.forEach(prop => {
        if (newData[prop] !== undefined) {
          const currentValue = updatedScenarios[currentScenario][prop];
          if (JSON.stringify(currentValue) !== JSON.stringify(newData[prop])) {
            updatedScenarios[currentScenario] = {
              ...updatedScenarios[currentScenario],
              [prop]: newData[prop]
            };
            hasScenarioUpdates = true;
          }
        }
      });
      
      // Also handle scenarios object if it's being updated
      if (newData.scenarios) {
        scenarioUpdates.scenarios = newData.scenarios;
        hasScenarioUpdates = true;
      } else if (hasScenarioUpdates) {
        scenarioUpdates.scenarios = updatedScenarios;
      }
    } else if (newData.identifiers || newData.features) {
      // If no scenario data exists but we have identifiers/features, create it
      const updatedScenarios = { ...settings.scenarios };
      if (!updatedScenarios[currentScenario]) {
        // Initialize with default structure
        updatedScenarios[currentScenario] = {
          identifiers: [],
          features: [],
          outputs: [],
          combinations: [],
          referenceMethod: 'mean',
          referencePeriod: null,
          resultViews: [],
          selectedView: 'view-1'
        };
      }
      if (newData.identifiers) updatedScenarios[currentScenario].identifiers = newData.identifiers;
      if (newData.features) updatedScenarios[currentScenario].features = newData.features;
      scenarioUpdates.scenarios = updatedScenarios;
      hasScenarioUpdates = true;
    }
    
    if (hasScenarioUpdates) {
      console.log('🔍 Properties: Updating scenario data with changes:', {
        identifiersCount: scenarioUpdates.scenarios?.[currentScenario]?.identifiers?.length || 0,
        featuresCount: scenarioUpdates.scenarios?.[currentScenario]?.features?.length || 0
      });
      updateSettings(atomId, scenarioUpdates);
    }
    
    // Update global properties separately to avoid circular updates
    const globalUpdates: Partial<SettingsType> = {};
    if (newData.backendIdentifiers) globalUpdates.backendIdentifiers = newData.backendIdentifiers;
    if (newData.backendFeatures) globalUpdates.backendFeatures = newData.backendFeatures;
    if (newData.backendCombinations) globalUpdates.backendCombinations = newData.backendCombinations;
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