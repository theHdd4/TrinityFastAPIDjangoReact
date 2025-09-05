import { SCENARIO_PLANNER_API } from '@/lib/api';
import { ScenarioPlannerSettings } from '@/components/LaboratoryMode/store/laboratoryStore';

// ✅ NEW: Utility function to generate model_id from session context
export const generateModelId = (): string => {
  const envStr = localStorage.getItem('env');
  if (!envStr) {
    console.warn('No env found in localStorage, using default model_id');
    return 'default_client/default_app/default_project';
  }
  
  try {
    const env = JSON.parse(envStr);
    const modelId = `${env.CLIENT_NAME || 'default_client'}/${env.APP_NAME || 'default_app'}/${env.PROJECT_NAME || 'default_project'}`;
    console.log('🔧 Generated model_id:', modelId);
    return modelId;
  } catch (error) {
    console.error('Error parsing env from localStorage:', error);
    return 'default_client/default_app/default_project';
  }
};

// ✅ NEW: Dedicated function to initialize a new scenario with fresh backend data
export const initializeNewScenario = async (settings: ScenarioPlannerSettings, scenarioId: string) => {
  try {
    console.log('🔄 Starting new scenario initialization for:', scenarioId);
    
    // 1. Generate model_id from session context
    const modelId = generateModelId();
    
    // 2. Fetch fresh identifiers from backend
    const identifiersResponse = await fetch(`${SCENARIO_PLANNER_API}/identifiers?model_id=${encodeURIComponent(modelId)}`);
    if (!identifiersResponse.ok) {
      throw new Error(`Failed to fetch identifiers: ${identifiersResponse.status}`);
    }
    const identifiersData = await identifiersResponse.json();
    console.log('📊 Identifiers response:', identifiersData);
    
    // 3. Fetch fresh features from backend
    const featuresResponse = await fetch(`${SCENARIO_PLANNER_API}/features?model_id=${encodeURIComponent(modelId)}`);
    if (!featuresResponse.ok) {
      throw new Error(`Failed to fetch features: ${featuresResponse.status}`);
    }
    const featuresData = await featuresResponse.json();
    console.log('📊 Features response:', featuresData);
    
    // 3. Process identifiers with unchecked state - ADD SAFETY CHECKS
    const processedIdentifiers = (identifiersData.identifier_columns || []).map((identifier: any) => {
      // ✅ SAFETY: Ensure identifier has required properties
      if (!identifier || typeof identifier.id !== 'string' || typeof identifier.name !== 'string') {
        console.warn('⚠️ Skipping invalid identifier:', identifier);
        return null;
      }
      
      return {
        id: identifier.id,
        name: identifier.name,
        values: (identifier.values || []).map((value: any) => {
          // ✅ SAFETY: Ensure value has required properties
          if (!value || typeof value.id !== 'string' || typeof value.name !== 'string') {
            console.warn('⚠️ Skipping invalid identifier value:', value);
            return null;
          }
          
          return {
            id: value.id,
            name: value.name,
            checked: false // ✅ Fresh start - no pre-checked values
          };
        }).filter(Boolean) // Remove null values
      };
    }).filter(Boolean); // Remove null identifiers
    
    console.log('✅ Processed identifiers:', processedIdentifiers);
    
         // 4. Process features with unselected state - ADD SAFETY CHECKS
     const processedFeatures = (featuresData.all_unique_features || []).map((feature: any, index: number) => {
       // ✅ SAFETY: Ensure feature has required properties
       if (!feature || typeof feature.id !== 'string' || typeof feature.name !== 'string') {
         console.warn('⚠️ Skipping invalid feature:', feature);
         return null;
       }
       
       // ✅ FIXED: Don't auto-select features - let user choose
       return {
         id: feature.id,
         name: feature.name,
         selected: false // ✅ Let user manually select features
       };
     }).filter(Boolean); // Remove null features
    
    console.log('✅ Processed features:', processedFeatures);
    
    // 5. Generate fresh combinations from identifiers
    const freshCombinations = generateCombinationsFromIdentifiers(processedIdentifiers);
    console.log('✅ Generated combinations:', freshCombinations);
    
    // 6. Create fresh aggregated views
    const freshAggregatedViews = createAggregatedViewsFromIdentifiers(processedIdentifiers);
    console.log('✅ Created aggregated views:', freshAggregatedViews);
    
    // 7. Update the scenario with fresh data
    const updatedScenarios = { ...settings.scenarios };
    updatedScenarios[scenarioId] = {
      ...updatedScenarios[scenarioId],
      identifiers: processedIdentifiers,
      features: processedFeatures,
      combinations: freshCombinations,
      aggregatedViews: freshAggregatedViews
    };
    
    console.log('✅ Scenario initialization completed for:', scenarioId);
    return {
      ...settings,
      scenarios: updatedScenarios
    };
    
  } catch (error) {
    console.error('❌ Error initializing new scenario:', error);
    // Return original settings if initialization fails
    return settings;
  }
};

// ✅ NEW: Helper function to generate combinations from identifiers
export const generateCombinationsFromIdentifiers = (identifiers: any[]) => {
  // ✅ SAFETY: Ensure identifiers is an array
  if (!Array.isArray(identifiers) || identifiers.length === 0) {
    console.log('⚠️ No valid identifiers provided for combinations');
    return [];
  }
  
  const combinations = [];
  let combinationId = 1;
  
  // Generate all possible combinations of identifier values
  const generateCombos = (currentCombo: string[], identifierIndex: number) => {
    if (identifierIndex === identifiers.length) {
      if (currentCombo.length > 0) {
        combinations.push({
          id: `combination-${combinationId++}`,
          identifiers: currentCombo
        });
      }
      return;
    }
    
    const identifier = identifiers[identifierIndex];
    
    // ✅ SAFETY: Ensure identifier has required properties
    if (!identifier || !identifier.values || !Array.isArray(identifier.values)) {
      console.warn('⚠️ Skipping invalid identifier in combinations:', identifier);
      generateCombos(currentCombo, identifierIndex + 1);
      return;
    }
    
    const checkedValues = identifier.values.filter((v: any) => v && v.checked === true);
    
    if (checkedValues.length === 0) {
      // If no values checked for this identifier, skip it
      generateCombos(currentCombo, identifierIndex + 1);
    } else {
      // Add each checked value to current combination
      checkedValues.forEach((value: any) => {
        if (value && value.id && identifier.id) {
          generateCombos([...currentCombo, `${identifier.id}:${value.id}`], identifierIndex + 1);
        }
      });
    }
  };
  
  generateCombos([], 0);
  console.log('🔧 Generated combinations:', combinations);
  return combinations;
};

// ✅ NEW: Helper function to create aggregated views from identifiers
export const createAggregatedViewsFromIdentifiers = (identifiers: any[]) => {
  // ✅ SAFETY: Ensure identifiers is an array
  if (!Array.isArray(identifiers) || identifiers.length === 0) {
    console.log('⚠️ No valid identifiers provided for aggregated views');
    return [];
  }
  
  return identifiers.map((identifier, index) => {
    if (!identifier || !identifier.id || !identifier.name || !Array.isArray(identifier.values)) {
      console.warn('⚠️ Skipping invalid identifier in aggregated views:', identifier);
      return null;
    }
    
    return {
      id: `view-${index + 1}`,
      name: `${identifier.name} View`,
      identifierOrder: [identifier.id],
      selectedIdentifiers: {
        [identifier.id]: identifier.values
          .filter((v: any) => v && v.id) // Filter out invalid values
          .map((v: any) => v.id)
      }
    };
  }).filter(Boolean); // Remove null views
};

// ✅ NEW: Helper functions for working with scenario-specific data
export const getCurrentScenarioData = (settings: ScenarioPlannerSettings) => {
  const currentScenario = settings.selectedScenario;
  return settings.scenarios[currentScenario] || null;
};

// ✅ NEW: Backward compatibility getters (to prevent infinite loops)
export const getCurrentIdentifiers = (settings: ScenarioPlannerSettings) => {
  const currentData = getCurrentScenarioData(settings);
  return currentData?.identifiers || [];
};

export const getCurrentFeatures = (settings: ScenarioPlannerSettings) => {
  const currentData = getCurrentScenarioData(settings);
  return currentData?.features || [];
};

export const getCurrentCombinations = (settings: ScenarioPlannerSettings) => {
  const currentData = getCurrentScenarioData(settings);
  return currentData?.combinations || [];
};

export const getCurrentCombinationInputs = (settings: ScenarioPlannerSettings) => {
  const currentData = getCurrentScenarioData(settings);
  return currentData?.combinationInputs || {};
};

export const getCurrentOriginalReferenceValues = (settings: ScenarioPlannerSettings) => {
  const currentData = getCurrentScenarioData(settings);
  return currentData?.originalReferenceValues || {};
};

export const getCurrentResultViews = (settings: ScenarioPlannerSettings) => {
  const currentData = getCurrentScenarioData(settings);
  return currentData?.resultViews || [];
};

export const getCurrentSelectedView = (settings: ScenarioPlannerSettings) => {
  const currentData = getCurrentScenarioData(settings);
  return currentData?.selectedView || 'view-1';
};

// ✅ NEW: Function to create backward-compatible settings (prevents infinite loops)
export const createBackwardCompatibleSettings = (settings: ScenarioPlannerSettings): ScenarioPlannerSettings => {
  const currentData = getCurrentScenarioData(settings);
  
  if (!currentData) {
    return settings;
  }
  
  return {
    ...settings,
    // Populate backward compatibility properties from current scenario
    identifiers: currentData.identifiers,
    features: currentData.features,
    outputs: currentData.outputs,
    combinations: currentData.combinations,
    resultViews: currentData.resultViews,
    combinationInputs: currentData.combinationInputs,
    originalReferenceValues: currentData.originalReferenceValues,
    aggregatedViews: currentData.aggregatedViews
  };
};

// ✅ NEW: Computed properties getter (prevents infinite loops by not storing these)
export const getComputedSettings = (settings: ScenarioPlannerSettings) => {
  const currentData = getCurrentScenarioData(settings);
  
  if (!currentData) {
    return settings;
  }
  
  // Return computed properties without modifying the original settings
  return {
    ...settings,
    // These are computed on-demand, not stored
    identifiers: currentData.identifiers,
    features: currentData.features,
    outputs: currentData.outputs,
    combinations: currentData.combinations,
    resultViews: currentData.resultViews,
    combinationInputs: currentData.combinationInputs,
    originalReferenceValues: currentData.originalReferenceValues,
    aggregatedViews: currentData.aggregatedViews
  };
};

export const updateCurrentScenarioData = (
  settings: ScenarioPlannerSettings, 
  updates: Partial<ScenarioPlannerSettings['scenarios'][string]>
) => {
  const currentScenario = settings.selectedScenario;
  const currentData = settings.scenarios[currentScenario] || {};
  
  return {
    ...settings,
    scenarios: {
      ...settings.scenarios,
      [currentScenario]: {
        ...currentData,
        ...updates
      }
    }
  };
};

export const createNewScenario = (settings: ScenarioPlannerSettings, scenarioId: string) => {
  // ✅ NEW: Create fresh scenario structure without copying data
  return {
    ...settings,
    scenarios: {
      ...settings.scenarios,
      [scenarioId]: {
        // ✅ Fresh data structure - no copying from other scenarios
        identifiers: [], // Will be populated by initializeNewScenario
        features: [], // Will be populated by initializeNewScenario
        outputs: [], // Will be populated by initializeNewScenario
        combinations: [], // Will be generated from fresh identifiers
        referenceMethod: settings.referenceMethod || 'period-mean',
        referencePeriod: settings.referencePeriod || { from: '01-JAN-2020', to: '30-MAR-2024' },
        resultViews: [
          { id: 'view-1', name: 'View 1', selectedCombinations: [] },
          { id: 'view-2', name: 'View 2', selectedCombinations: [] },
          { id: 'view-3', name: 'View 3', selectedCombinations: [] }
        ],
        selectedView: 'view-1',
        selectedCombinations: [],
        combinationInputs: {},
        originalReferenceValues: {},
        aggregatedViews: [] // Will be created from fresh identifiers
      }
    }
  };
};

// ✅ NEW: Duplicate current scenario instead of creating fresh one
export const duplicateCurrentScenario = (settings: ScenarioPlannerSettings, newScenarioId: string) => {
  const currentScenario = settings.selectedScenario;
  const currentScenarioData = settings.scenarios?.[currentScenario];
  
  if (!currentScenarioData) {
    // Fallback to fresh scenario if no current scenario data
    return createNewScenario(settings, newScenarioId);
  }
  
  // ✅ FIXED: Proper deep clone to avoid reference issues between scenarios
  const duplicatedScenarioData = {
    ...currentScenarioData,
    // Deep clone combinationInputs to prevent sharing references
    combinationInputs: currentScenarioData.combinationInputs ? 
      Object.keys(currentScenarioData.combinationInputs).reduce((acc, key) => {
        acc[key] = { ...currentScenarioData.combinationInputs[key] };
        return acc;
      }, {} as any) : {},
    // Deep clone originalReferenceValues to prevent sharing references
    originalReferenceValues: currentScenarioData.originalReferenceValues ? 
      Object.keys(currentScenarioData.originalReferenceValues).reduce((acc, key) => {
        acc[key] = { ...currentScenarioData.originalReferenceValues[key] };
        return acc;
      }, {} as any) : {},
    // ✅ NEW: Copy selectedCombinations to make each scenario independent
    selectedCombinations: currentScenarioData.selectedCombinations ? [...currentScenarioData.selectedCombinations] : []
  };
  
  // Clear results and reset some fields for the new scenario
  duplicatedScenarioData.viewResults = {}; // Clear all view results
  duplicatedScenarioData.selectedView = 'view-1'; // Reset to View 1
  
  // Keep all the configuration but clear the results
  return {
    ...settings,
    scenarios: {
      ...settings.scenarios,
      [newScenarioId]: duplicatedScenarioData
    },
    selectedScenario: newScenarioId
  };
};

// ✅ NEW: Enhanced function to add a new scenario by duplicating current one
export const addNewScenario = (settings: ScenarioPlannerSettings, newScenarioId: string) => {
  // 1. Add to allScenarios array
  const updatedAllScenarios = [...settings.allScenarios, newScenarioId];
  
  // ✅ CHANGED: Duplicate the current scenario instead of creating fresh one
  const updatedSettings = duplicateCurrentScenario(settings, newScenarioId);
  
  // 3. Update allScenarios array
  updatedSettings.allScenarios = updatedAllScenarios;
  
  return updatedSettings;
};

// ✅ NEW: Function to remove a scenario and clean up its data
export const removeScenario = (settings: ScenarioPlannerSettings, scenarioId: string) => {
  // Don't allow removing the last scenario
  if (settings.allScenarios.length <= 1) {
    return settings;
  }
  
  // 1. Remove from allScenarios array
  const updatedAllScenarios = settings.allScenarios.filter(id => id !== scenarioId);
  
  // 2. Remove scenario data
  const updatedScenarios = { ...settings.scenarios };
  delete updatedScenarios[scenarioId];
  
  // 3. If the removed scenario was selected, switch to first available
  let updatedSelectedScenario = settings.selectedScenario;
  if (scenarioId === settings.selectedScenario) {
    updatedSelectedScenario = updatedAllScenarios[0];
  }
  
  return {
    ...settings,
    allScenarios: updatedAllScenarios,
    scenarios: updatedScenarios,
    selectedScenario: updatedSelectedScenario
  };
};
