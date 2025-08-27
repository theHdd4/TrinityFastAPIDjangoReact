import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { SCENARIO_PLANNER_API } from '@/lib/api';

import { Trash2 } from 'lucide-react';
import { ScenarioPlannerSettings } from '@/components/LaboratoryMode/store/laboratoryStore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useToast } from '@/hooks/use-toast';

interface ScenarioPlannerCanvasProps {
  atomId: string;
  settings: ScenarioPlannerSettings;
  onSettingsChange: (newSettings: Partial<ScenarioPlannerSettings>) => void;
}

export const ScenarioPlannerCanvas: React.FC<ScenarioPlannerCanvasProps> = ({ 
  atomId, 
  settings, 
  onSettingsChange 
}) => {

  const [combinationInputs, setCombinationInputs] = useState<{[key: string]: {[featureId: string]: {input: string; change: string}}}>({}); 
  const [loadingReference, setLoadingReference] = useState<string | null>(null); // Track which combination is loading reference
  const [loadedReferenceCombinations, setLoadedReferenceCombinations] = useState<Set<string>>(new Set()); // Track which combinations have reference values loaded
  
  // ✅ NEW: State for ORIGINAL reference values (never changes)
  const [originalReferenceValues, setOriginalReferenceValues] = useState<{
    [combinationId: string]: {
      [featureId: string]: number;
    };
  }>({});
  
  // Use toast for notifications
  const { toast } = useToast();
  
  // Use a ref to track which scenarios have been cleared to prevent infinite loops
  const clearedScenariosRef = useRef<Set<string>>(new Set());
  
  // Use combinations directly from global store (settings)
  const combinations = settings?.combinations || [];
  const currentIdentifiers = settings?.identifiers || [];

  // Get all available scenarios (including the current one and any others)
  const availableScenarios = useMemo(() => {
    const baseScenarios = ['scenario-1', 'scenario-2'];
    const currentScenario = settings?.selectedScenario;
    
    // Get all scenarios from settings if they exist, with fallback to base scenarios
    const allScenarios = settings?.allScenarios || baseScenarios;
    
    // Ensure allScenarios is always an array
    if (!Array.isArray(allScenarios)) {
      return baseScenarios;
    }
    
    // If current scenario is not in all scenarios, add it
    if (currentScenario && !allScenarios.includes(currentScenario)) {
      return [...allScenarios, currentScenario];
    }
    
    return allScenarios;
  }, [settings?.selectedScenario, settings?.allScenarios]);

  // Add new scenario
  const handleAddScenario = () => {
    // Ensure availableScenarios is always an array
    if (!Array.isArray(availableScenarios)) {
      console.error('availableScenarios is not an array:', availableScenarios);
      return;
    }
    
    const nextScenarioNumber = availableScenarios.length + 1;
    const newScenarioId = `scenario-${nextScenarioNumber}`;
    
    console.log('=== Adding New Scenario ===');
    console.log('Current available scenarios:', availableScenarios);
    console.log('Next scenario number:', nextScenarioNumber);
    console.log('New scenario ID:', newScenarioId);
    console.log('=== Adding New Scenario completed ===');
    
    // Update both the selected scenario and the list of all scenarios
    onSettingsChange({ 
      selectedScenario: newScenarioId,
      allScenarios: [...availableScenarios, newScenarioId]
    });
  };

  // Remove scenario (only for Scenario 3 and beyond)
  const handleRemoveScenario = (scenarioId: string) => {
    // Don't allow removing Scenario 1 and Scenario 2
    if (scenarioId === 'scenario-1' || scenarioId === 'scenario-2') {
      return;
    }

    const updatedScenarios = availableScenarios.filter(id => id !== scenarioId);
    
    // If we're removing the currently selected scenario, switch to Scenario 1
    const newSelectedScenario = settings?.selectedScenario === scenarioId ? 'scenario-1' : settings?.selectedScenario;
    
    console.log('=== Removing Scenario ===');
    console.log('Removing scenario:', scenarioId);
    console.log('Updated scenarios:', updatedScenarios);
    console.log('New selected scenario:', newSelectedScenario);
    console.log('=== Removing Scenario completed ===');
    
    onSettingsChange({ 
      selectedScenario: newSelectedScenario,
      allScenarios: updatedScenarios
    });
  };

  // New function to fetch reference values for ALL combinations - OPTIMIZED!
  const fetchReferenceValuesForAll = async () => {
    if (combinations.length === 0) {
      toast({
        title: "No Combinations Available",
        description: "Please create combinations first by selecting identifier values",
        variant: "default",
      });
      return;
    }

    try {
      // Show loading state for all combinations
      setLoadingReference('all');
      
      console.log('🔍 Fetching reference values for ALL combinations:', combinations.length);
      
      // ✅ OPTIMIZATION: Make ONE API call instead of multiple calls
      const statMethod = settings.referenceMethod || 'period-mean';
      const requestBody: any = {
        stat: statMethod,
        start_date: settings.referencePeriod?.from || '2024-01-01',
        end_date: settings.referencePeriod?.to || '2024-12-31'
      };
      
      console.log('📊 Making single API call for all combinations:', requestBody);
      
      const response = await fetch(`${SCENARIO_PLANNER_API}/reference`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Reference values fetched for all combinations:', data);
        
        // Process ALL combinations with the same data
        const newInputs = { ...combinationInputs };
        const newOriginalRefs = { ...originalReferenceValues }; // ✅ NEW: Store original reference values
        let totalPopulated = 0;
        
        combinations.forEach(combination => {
          if (!newInputs[combination.id]) {
            newInputs[combination.id] = {};
          }
          if (!newOriginalRefs[combination.id]) {
            newOriginalRefs[combination.id] = {};
          }
          
          // Extract identifiers for this combination
          const identifiers: { [key: string]: string } = {};
          if (Array.isArray(combination.identifiers)) {
            combination.identifiers.forEach((identifierId: string) => {
              const [identifierIdPart, valueIdPart] = identifierId.split(':');
              identifiers[identifierIdPart] = valueIdPart;
            });
          }
          
          console.log(`🔍 Processing combination ${combination.id}:`, identifiers);
          
          // Find matching model for this combination
          const matchingModel = Object.entries(data.reference_values_by_model).find(([modelId, modelData]: [string, any]) => {
            const modelIdentifiers = modelData.identifiers || {};
            return Object.keys(identifiers).every(key => 
              modelIdentifiers[key] === identifiers[key]
            );
          });
          
          if (matchingModel) {
            const [modelId, modelData] = matchingModel;
            console.log(`🎯 Found matching model for ${combination.id}:`, modelId);
            
            // Populate features for this combination
            const features = settings?.features || [];
            features.forEach(feature => {
              if (feature.selected && (modelData as any).reference_values?.[feature.name]) {
                if (!newInputs[combination.id][feature.id]) {
                  newInputs[combination.id][feature.id] = { input: '', change: '' };
                }
                
                const referenceValue = (modelData as any).reference_values[feature.name];
                
                // ✅ NEW: Store ORIGINAL reference value (never changes)
                newOriginalRefs[combination.id][feature.id] = referenceValue;
                
                // Set current input to reference value
                newInputs[combination.id][feature.id].input = referenceValue.toString();
                newInputs[combination.id][feature.id].change = '0';
                totalPopulated++;
              }
            });
          } else {
            console.log(`⚠️ No exact match for ${combination.id}, using best available values`);
            
            // Use best available reference values from any model
            const features = settings?.features || [];
            features.forEach(feature => {
              if (feature.selected) {
                if (!newInputs[combination.id][feature.id]) {
                  newInputs[combination.id][feature.id] = { input: '', change: '' };
                }
                
                // Find best available reference value
                let bestReferenceValue = null;
                Object.entries(data.reference_values_by_model).forEach(([modelId, modelData]: [string, any]) => {
                  if (modelData.reference_values?.[feature.name]) {
                    bestReferenceValue = modelData.reference_values[feature.name];
                  }
                });
                
                if (bestReferenceValue !== null) {
                  // ✅ NEW: Store ORIGINAL reference value
                  newOriginalRefs[combination.id][feature.id] = bestReferenceValue;
                  
                  newInputs[combination.id][feature.id].input = bestReferenceValue.toString();
                  newInputs[combination.id][feature.id].change = '0';
                  totalPopulated++;
                } else {
                  // Fallback value
                  const fallbackValue = 100;
                  // ✅ NEW: Store ORIGINAL reference value
                  newOriginalRefs[combination.id][feature.id] = fallbackValue;
                  
                  newInputs[combination.id][feature.id].input = fallbackValue.toString();
                  newInputs[combination.id][feature.id].change = '0';
                  totalPopulated++;
                }
              }
            });
          }
          
          // Mark this combination as loaded
          setLoadedReferenceCombinations(prev => new Set([...prev, combination.id]));
        });
        
        // ✅ NEW: Update both inputs and original reference values
        setCombinationInputs(newInputs);
        setOriginalReferenceValues(newOriginalRefs);
        
        console.log(`✅ Successfully populated ${totalPopulated} feature values across ${combinations.length} combinations`);
        console.log('🎯 Original reference values stored:', newOriginalRefs);
        
        toast({
          title: "Reference Values Loaded",
          description: `Successfully populated reference values for ALL ${combinations.length} combination(s)`,
          variant: "default",
        });
        
      } else {
        throw new Error(`Failed to fetch reference values: ${response.statusText}`);
      }
      
    } catch (error) {
      console.error('❌ Error fetching reference values for all combinations:', error);
      toast({
        title: "Error",
        description: "Failed to fetch reference values for some combinations",
        variant: "destructive",
      });
    } finally {
      setLoadingReference(null);
    }
  };

  // Refactored function to fetch reference values for a single combination
  const fetchReferenceValuesForCombination = async (combination: any) => {
    try {
      console.log('🔍 Fetching reference values for combination:', combination);
      
      // Extract identifiers from combination for the request
      const identifiers: { [key: string]: string } = {};
      if (Array.isArray(combination.identifiers)) {
        combination.identifiers.forEach((identifierId: string) => {
          const [identifierIdPart, valueIdPart] = identifierId.split(':');
          identifiers[identifierIdPart] = valueIdPart;
        });
      }
      
      console.log('🎯 Extracted identifiers for reference request:', identifiers);
      
      // Call the reference endpoint
      // ✅ FIXED: Backend requires dates for ALL methods, not just period-based ones
      const statMethod = settings.referenceMethod || 'period-mean';
      const isPeriodBased = statMethod.startsWith('period-');
      
      // Backend schema requires start_date and end_date for ALL methods
      const requestBody: any = {
        stat: statMethod,
        start_date: settings.referencePeriod?.from || '2024-01-01',
        end_date: settings.referencePeriod?.to || '2024-12-31'
      };
      
      console.log('📊 Using reference settings:', {
        method: statMethod,
        requestBody,
        originalSettings: {
          referenceMethod: settings.referenceMethod,
          referencePeriod: settings.referencePeriod
        }
      });
      
      const response = await fetch(`${SCENARIO_PLANNER_API}/reference`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Reference values fetched:', data);
        
        // Find the model that matches our combination identifiers
        console.log('🔍 Looking for matching model with identifiers:', identifiers);
        console.log('🔍 Available models:', Object.entries(data.reference_values_by_model).map(([id, model]: [string, any]) => ({
          modelId: id,
          modelIdentifiers: model.identifiers,
          features: model.features,
          hasReferenceValues: !!model.reference_values
        })));
        
        const matchingModel = Object.entries(data.reference_values_by_model).find(([modelId, modelData]: [string, any]) => {
          // Check if model identifiers match our combination
          const modelIdentifiers = modelData.identifiers || {};
          
          console.log(`🔍 Checking model ${modelId}:`, {
            modelIdentifiers,
            combinationIdentifiers: identifiers,
            matchResult: Object.keys(identifiers).every(key => 
              modelIdentifiers[key] === identifiers[key]
            )
          });
          
          return Object.keys(identifiers).every(key => 
            modelIdentifiers[key] === identifiers[key]
          );
        });
        
        if (matchingModel) {
          const [modelId, modelData] = matchingModel;
          console.log('🎯 Found matching model:', modelId, modelData);
          
          // Populate the Abs boxes with reference values
          const newInputs = { ...combinationInputs };
          if (!newInputs[combination.id]) {
            newInputs[combination.id] = {};
          }
          
          // Map features to their reference values
          const features = settings?.features || [];
          console.log('🎯 Mapping features to reference values:', {
            features: features.map(f => ({ id: f.id, name: f.name, selected: f.selected })),
            modelData: modelData,
            referenceValues: (modelData as any).reference_values,
            currentCombinationInputs: newInputs[combination.id]
          });
          
          features.forEach(feature => {
            if (feature.selected && (modelData as any).reference_values?.[feature.name]) {
              if (!newInputs[combination.id][feature.id]) {
                newInputs[combination.id][feature.id] = { input: '', change: '' };
              }
              
              const referenceValue = (modelData as any).reference_values[feature.name];
              console.log(`📊 Setting reference value for ${feature.name} (${feature.id}):`, referenceValue);
              
              // Set both Abs (input) and Pct (change) fields
              newInputs[combination.id][feature.id].input = referenceValue.toString();
              newInputs[combination.id][feature.id].change = '0'; // Auto-populate percentage with 0
            } else {
              console.log(`⚠️ Feature ${feature.name} (${feature.id}) not selected or no reference value:`, {
                selected: feature.selected,
                hasReferenceValue: !!(modelData as any).reference_values?.[feature.name],
                referenceValue: (modelData as any).reference_values?.[feature.name]
              });
            }
          });
          
          console.log('🔄 Updated combination inputs:', newInputs[combination.id]);
          
          setCombinationInputs(newInputs);
          
          // Mark this combination as having reference values loaded
          setLoadedReferenceCombinations(prev => new Set([...prev, combination.id]));
          
          return true; // Success
        } else {
          console.warn('⚠️ No exact model match found for combination:', identifiers);
          
          // Try to find the best available reference values from any model
          // This ensures ALL combinations get reference values populated
          const newInputs = { ...combinationInputs };
          if (!newInputs[combination.id]) {
            newInputs[combination.id] = {};
          }
          
          const features = settings?.features || [];
          console.log('🔄 Trying to find best available reference values for features:', features.map(f => f.name));
          
          features.forEach(feature => {
            if (feature.selected) {
              if (!newInputs[combination.id][feature.id]) {
                newInputs[combination.id][feature.id] = { input: '', change: '' };
              }
              
              // Try to find reference value from any available model
              let bestReferenceValue = null;
              
              // Look through all models to find the best match
              Object.entries(data.reference_values_by_model).forEach(([modelId, modelData]: [string, any]) => {
                if (modelData.reference_values?.[feature.name]) {
                  bestReferenceValue = modelData.reference_values[feature.name];
                  console.log(`🎯 Found reference value for ${feature.name} from model ${modelId}:`, bestReferenceValue);
                }
              });
              
              if (bestReferenceValue !== null) {
                console.log(`✅ Using best available reference value for ${feature.name}:`, bestReferenceValue);
                newInputs[combination.id][feature.id].input = bestReferenceValue.toString();
                newInputs[combination.id][feature.id].change = '0'; // Auto-populate percentage with 0
              } else {
                // If no reference value found anywhere, use fallback
                const fallbackValue = '0';
                console.log(`⚠️ No reference value found for ${feature.name}, using fallback:`, fallbackValue);
                newInputs[combination.id][feature.id].input = fallbackValue;
                newInputs[combination.id][feature.id].change = '0'; // Auto-populate percentage with 0
              }
            }
          });
          
          setCombinationInputs(newInputs);
          
          // Mark this combination as having reference values loaded
          setLoadedReferenceCombinations(prev => new Set([...prev, combination.id]));
          
          return true; // Success with best available or fallback values
        }
      } else {
        throw new Error(`Failed to fetch reference values: ${response.statusText}`);
      }
    } catch (error) {
      console.error('❌ Error fetching reference values:', error);
      return false; // Error occurred
    }
  };



  // Handle Ctrl+Enter key press - now loads ALL combinations
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      fetchReferenceValuesForAll();
    }
  };

  // Clear reference values for a combination
  const clearReferenceValues = (combinationId: string) => {
    const newInputs = { ...combinationInputs };
    const newOriginalRefs = { ...originalReferenceValues };
    
    if (newInputs[combinationId]) {
      // Clear only the input values (keep change values)
      Object.keys(newInputs[combinationId]).forEach(featureId => {
        if (newInputs[combinationId][featureId]) {
          newInputs[combinationId][featureId].input = '';
        }
      });
      setCombinationInputs(newInputs);
      
      // ✅ NEW: Clear original reference values for this combination
      if (newOriginalRefs[combinationId]) {
        delete newOriginalRefs[combinationId];
        setOriginalReferenceValues(newOriginalRefs);
      }
      
      // Remove from loaded reference combinations
      setLoadedReferenceCombinations(prev => {
        const newSet = new Set(prev);
        newSet.delete(combinationId);
        return newSet;
      });
      
      toast({
        title: "Reference Values Cleared",
        description: `Reference values cleared for ${combinationId}`,
        variant: "default",
      });
    }
  };

  // Handle right-click context menu for scenario removal
  const handleScenarioContextMenu = (e: React.MouseEvent, scenarioId: string) => {
    e.preventDefault();
    
    // Only allow removal for Scenario 3 and beyond
    if (scenarioId === 'scenario-1' || scenarioId === 'scenario-2') {
      return;
    }
    
    // Show toast notification for scenario removal
    toast({
      title: "Remove Scenario",
      description: `Are you sure you want to remove ${scenarioId.replace('scenario-', 'Scenario ')}?`,
      action: (
        <div className="flex gap-2 mt-2">
          <Button
            size="sm"
            variant="default"
            onClick={() => {
              handleRemoveScenario(scenarioId);
              toast({
                title: "Scenario Removed",
                description: `${scenarioId.replace('scenario-', 'Scenario ')} has been removed successfully.`,
                variant: "default",
              });
            }}
          >
            Remove
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              // Dismiss the toast
              toast({
                title: "Cancelled",
                description: "Scenario removal was cancelled.",
                variant: "default",
              });
            }}
          >
            Cancel
          </Button>
        </div>
      ),
      variant: "default",
    });
  };

  // Debug: Log when data changes
  useEffect(() => {
    console.log('=== Canvas: Data received ===');
    console.log('Canvas: settings.combinations:', settings?.combinations);
    console.log('Canvas: settings.combinations?.length:', settings?.combinations?.length);
    console.log('Canvas: settings.identifiers:', settings?.identifiers);
    console.log('Canvas: combinations variable:', combinations);
    console.log('Canvas: combinations.length:', combinations.length);
    console.log('Canvas: currentIdentifiers:', currentIdentifiers);
    console.log('Canvas: currentIdentifiers length:', currentIdentifiers.length);
    console.log('Canvas: Backend data available:', {
      hasBackendIdentifiers: !!settings?.backendIdentifiers,
      hasBackendFeatures: !!settings?.backendFeatures
    });
    console.log('=== Canvas: Data received completed ===');
  }, [settings?.combinations, settings?.identifiers, currentIdentifiers]); // Only depend on specific properties, not the entire settings object

  // Restore state from store when component mounts or settings change
  useEffect(() => {
    console.log('🔄 Canvas: Checking for state restoration...');
    
    if (settings?.backendIdentifiers && settings?.backendFeatures) {
      console.log('✅ Canvas: Backend data available, checking if state needs restoration');
      
      // Check if we need to restore combinations
      const needsCombinationRestoration = !combinations.length && settings.identifiers?.length;
      
      if (needsCombinationRestoration) {
        console.log('🔄 Canvas: Combinations need restoration, but this should be handled by Settings component');
      } else {
        console.log('✅ Canvas: State already restored, no action needed');
      }
    } else {
      console.log('⏳ Canvas: Waiting for backend data...');
    }
  }, [settings?.backendIdentifiers, settings?.backendFeatures, combinations.length, settings?.identifiers]);

  // Debug: Monitor combinations changes
  useEffect(() => {
    console.log('=== Canvas: Combinations changed ===');
    console.log('Canvas: combinations updated:', combinations);
    console.log('Canvas: combinations.length:', combinations.length);
    console.log('=== Canvas: Combinations changed completed ===');
  }, [combinations]);

  // Auto-load reference values when new combinations are created
  useEffect(() => {
    if (combinations.length === 0) {
      setCombinationInputs({});
    } else {
      // Check if we have new combinations that need reference values
      const newCombinations = combinations.filter(combination => 
        !loadedReferenceCombinations.has(combination.id)
      );
      
      console.log(`🔍 Combinations status:`, {
        total: combinations.length,
        loaded: loadedReferenceCombinations.size,
        new: newCombinations.length,
        newIds: newCombinations.map(c => c.id),
        hasBackendData: !!(settings?.backendIdentifiers && settings?.backendFeatures)
      });
      
      if (newCombinations.length > 0 && settings?.backendIdentifiers && settings?.backendFeatures) {
        console.log(`🔄 Auto-loading reference values for ${newCombinations.length} new combinations`);
        // Auto-trigger reference value loading for new combinations
        fetchReferenceValuesForAll();
      }
    }
  }, [combinations, loadedReferenceCombinations, settings?.backendIdentifiers, settings?.backendFeatures]);
  
  // ✅ FIXED: Auto-refresh reference values when settings change
  useEffect(() => {
    if (settings.referenceValuesNeedRefresh && combinations.length > 0) {
      console.log('🔄 Auto-refresh triggered for reference values');
      
      // Clear existing reference values to force reload
      setCombinationInputs({});
      setLoadedReferenceCombinations(new Set());
      setOriginalReferenceValues({});
      
      // Fetch new reference values with updated settings
      fetchReferenceValuesForAll();
      
      // ✅ FIXED: Use setTimeout to break the circular dependency
      setTimeout(() => {
        onSettingsChange({
          referenceValuesNeedRefresh: false
        });
      }, 0);
      
      toast({
        title: "Reference Values Refreshed",
        description: "Reference values updated with new method and period settings",
        variant: "default",
      });
    }
  }, [settings.referenceValuesNeedRefresh, combinations.length]); // Removed onSettingsChange from dependencies

  // Clear data when switching to a new scenario (fresh page experience)
  useEffect(() => {
    // Only clear data when first visiting a newly added scenario
    if (settings?.selectedScenario && 
        !settings.selectedScenario.startsWith('scenario-1') && 
        !settings.selectedScenario.startsWith('scenario-2') &&
        combinations.length === 0) { // Only clear if no combinations exist
      // This is a newly added scenario (3, 4, 5, etc.) - clear everything
      // Use a ref to prevent infinite loops - only run once per scenario
      const shouldClear = !clearedScenariosRef.current.has(settings.selectedScenario);
      
      if (shouldClear) {
        onSettingsChange({ 
          combinations: [],
          identifiers: settings.identifiers?.map(identifier => ({
            ...identifier,
            values: identifier.values?.map(value => ({
              ...value,
              checked: false
            })) || []
          })) || []
        });
        setCombinationInputs({});
        clearedScenariosRef.current.add(settings.selectedScenario);
      }
    }
  }, [settings?.selectedScenario, settings?.identifiers, combinations.length]); // Removed onSettingsChange from dependencies

  // Live calculation functions for Pct and Abs fields
  const calculateAbsFromPct = (referenceValue: number, pctChange: number): number => {
    if (referenceValue === 0) return 0;
    return referenceValue * (1 + pctChange / 100);
  };

  const calculatePctFromAbs = (referenceValue: number, newAbsValue: number): number => {
    if (referenceValue === 0) return 0;
    return ((newAbsValue - referenceValue) / referenceValue) * 100;
  };

  // Helper function to get reference value for a feature - Now uses ORIGINAL reference values!
  const getReferenceValue = (combinationId: string, featureId: string): number | null => {
    // Find the feature name from the feature ID
    const feature = settings?.features?.find(f => f.id === featureId);
    if (!feature) return null;

    // ✅ Priority 1: Use ORIGINAL reference value (never changes)
    if (originalReferenceValues[combinationId]?.[featureId] !== undefined) {
      const originalValue = originalReferenceValues[combinationId][featureId];
      console.log(`🎯 Using ORIGINAL reference value for ${combinationId}:${featureId}:`, originalValue);
      return originalValue;
    }
    
    // Priority 2: Use loaded reference values from backend (fallback)
    if (loadedReferenceCombinations.has(combinationId)) {
      const currentInput = combinationInputs[combinationId]?.[featureId]?.input;
      if (currentInput && !isNaN(parseFloat(currentInput))) {
        return parseFloat(currentInput);
      }
    }
    
    // Priority 3: Use fallback reference value (default: 100)
    const fallbackValue = 100;
    console.log(`🔄 Using fallback reference value ${fallbackValue} for ${combinationId}:${featureId}`);
    return fallbackValue;
  };

  const handleInputChange = (combinationId: string, featureId: string, field: 'input' | 'change', value: string) => {
    const numValue = parseFloat(value) || 0;
    
    setCombinationInputs(prev => {
      const newInputs = { ...prev };
      if (!newInputs[combinationId]) {
        newInputs[combinationId] = { [featureId]: { input: '', change: '' } };
      }
      if (!newInputs[combinationId][featureId]) {
        newInputs[combinationId][featureId] = { input: '', change: '' };
      }

      // Update the changed field
      newInputs[combinationId][featureId][field] = value;

      // Get the current reference value for this feature
      const referenceValue = getReferenceValue(combinationId, featureId);
      
      if (referenceValue !== null && !isNaN(referenceValue)) {
        // Live calculation based on which field changed
        if (field === 'change') {
          // Pct field changed - calculate new Abs value
          const newAbsValue = calculateAbsFromPct(referenceValue, numValue);
          newInputs[combinationId][featureId].input = newAbsValue.toFixed(2);
          console.log(`🔄 Pct changed to ${numValue}% → Abs updated to ${newAbsValue.toFixed(2)}`);
        } else if (field === 'input') {
          // Abs field changed - calculate new Pct value
          const newPctValue = calculatePctFromAbs(referenceValue, numValue);
          newInputs[combinationId][featureId].change = newPctValue.toFixed(2);
          console.log(`🔄 Abs changed to ${numValue} → Pct updated to ${newPctValue.toFixed(2)}%`);
        }
      }

      return newInputs;
    });
  };

  const handleDeleteCombination = (combinationId: string) => {
    // Find the combination to be deleted
    const combinationToDelete = combinations.find(c => c.id === combinationId);
    
    if (combinationToDelete) {
      // Remove the combination from the data
      const updatedCombinations = combinations.filter(c => c.id !== combinationId);
      
      // Collect all identifier values still needed by remaining combinations
      const stillNeededValues = new Set<string>();
      updatedCombinations?.forEach(combination => {
        combination.identifiers?.forEach(identifierString => {
          stillNeededValues.add(identifierString);
        });
      });
      
      // Update the identifiers to uncheck only values that are no longer needed
      const updatedIdentifiers = currentIdentifiers?.map(identifier => {
        return {
          ...identifier,
          values: identifier.values?.map(value => {
            // Create the full identifier string (e.g., "identifier-1-1a")
            const fullIdentifierString = `${identifier.id}-${value.id}`;
            
            // Check if this value is still needed by any remaining combination
            const isStillNeeded = stillNeededValues.has(fullIdentifierString);
            
            // Only uncheck if it was checked before but is no longer needed
            return {
              ...value,
              checked: isStillNeeded ? value.checked : false
            };
          }) || []
        };
      }) || [];
      
      // Update both combinations and identifiers together
      onSettingsChange({ 
        combinations: updatedCombinations,
        identifiers: updatedIdentifiers
      });
      
      // Also clear any inputs for this combination
      const newCombinationInputs = { ...combinationInputs };
      delete newCombinationInputs[combinationId];
      setCombinationInputs(newCombinationInputs);
    }
  };

  const selectedFeatures = useMemo(() => 
    settings?.features?.filter(f => f.selected) || [], 
    [settings?.features]
  );
  const selectedOutputs = useMemo(() => 
    settings?.outputs?.filter(o => o.selected) || [], 
    [settings?.outputs]
  );

  // Debug: Monitor features changes
  useEffect(() => {
    console.log('Features changed:', {
      allFeatures: settings?.features?.map(f => ({ id: f.id, name: f.name, selected: f.selected })) || [],
      selectedFeatures: selectedFeatures.map(f => ({ id: f.id, name: f.name, selected: f.selected }))
    });
  }, [settings?.features, selectedFeatures]);

  // Debug: Monitor resultViews changes
  useEffect(() => {
    console.log('=== Canvas: ResultViews changed ===');
    console.log('Canvas: settings.resultViews:', settings?.resultViews);
    console.log('Canvas: resultViews length:', settings?.resultViews?.length);
    console.log('Canvas: resultViews names:', settings?.resultViews?.map(v => v.name));
    console.log('Canvas: resultViews IDs:', settings?.resultViews?.map(v => v.id));
    console.log('=== Canvas: ResultViews changed completed ===');
  }, [settings?.resultViews]);

  // Debug: Monitor settings changes
  useEffect(() => {
    console.log('=== Canvas: Settings changed ===');
    console.log('Canvas: Full settings object:', settings);
    console.log('Canvas: selectedView:', settings?.selectedView);
    console.log('Canvas: resultViews from settings:', settings?.resultViews);
    console.log('=== Canvas: Settings changed completed ===');
  }, [settings]);

  // Force re-render when views change
  const viewsKey = React.useMemo(() => {
    const views = settings?.resultViews || [];
    return `views-${views.length}-${views.map(v => `${v.id}-${v.name}`).join('-')}`;
  }, [settings?.resultViews]);

  // Mock chart data
  const chartData = [
    { name: 'Jan', value: 400 },
    { name: 'Feb', value: 300 },
    { name: 'Mar', value: 500 },
    { name: 'Apr', value: 280 },
  ];

  return (
    <div className="flex h-full bg-gray-50" onKeyDown={handleKeyDown} tabIndex={0}>
      {/* Main Canvas - Full Width */}
      <div className="flex-1 flex flex-col p-6 space-y-6">
        {/* Scenario Selection */}
        <Card className="p-4 shadow-sm border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <h4 className="text-sm font-medium text-gray-700 mb-0">Active Scenario:</h4>
              <div className="grid p-1 bg-gray-100 rounded-lg" style={{ gridTemplateColumns: `repeat(${availableScenarios?.length || 2}, 1fr)` }}>
                {availableScenarios?.map((scenarioId, index) => (
                  <button
                    key={scenarioId}
                    onClick={() => onSettingsChange({ selectedScenario: scenarioId })}
                    onContextMenu={(e) => handleScenarioContextMenu(e, scenarioId)}
                    className={`px-4 py-2 text-sm font-medium transition-all duration-200 min-w-[90px] h-[32px] flex items-center justify-center ${
                      settings?.selectedScenario === scenarioId
                        ? 'bg-blue-600 text-white font-semibold shadow-md transform scale-105'
                        : 'bg-transparent text-gray-600 hover:bg-gray-200 hover:text-gray-800'
                    } rounded-md`}
                    title={scenarioId !== 'scenario-1' && scenarioId !== 'scenario-2' ? `Right-click to remove ${scenarioId.replace('scenario-', 'Scenario ')}` : undefined}
                  >
                    <span>{scenarioId.replace('scenario-', 'Scenario ')}</span>
                  </button>
                ))}
              </div>
            </div>
            
                         <Button 
               onClick={handleAddScenario}
               variant="outline"
               size="sm"
               className="text-sm px-4 py-2 h-[32px] bg-white border-gray-300 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-all duration-200 shadow-sm"
             >
               + Add Scenario
             </Button>
          </div>
        </Card>


        
        {/* Main Editor Table */}
        <Card className="p-4 shadow-sm border-gray-200">
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <div className="max-h-[350px] overflow-y-auto">
              <div className="overflow-x-auto" style={{ width: '920px', maxWidth: '920px', overflow: 'auto' }}>
                <table 
                  key={combinations.length + '_' + combinations.map(c => c.id).join('_')} 
                  className="min-w-full border-collapse"
                  style={{ 
                    width: `${Math.max(920, 200 + (selectedFeatures?.length || 0) * 180)}px`
                  }}
                >
                <thead className="bg-gradient-to-r from-gray-50 to-gray-100 sticky top-0 z-10">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 border-b-2 border-r-2 border-gray-300 w-48 sticky left-0 z-20 bg-gradient-to-r from-gray-50 to-gray-100 shadow-sm">
                      <div className="flex items-center space-x-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        <span>Combination</span>
                      </div>
                    </th>
                    {selectedFeatures && selectedFeatures.length > 0 ? (
                      selectedFeatures.map(feature => (
                        <th key={feature.id} className="px-4 py-3 text-center text-sm font-semibold text-gray-900 border-b-2 border-r border-gray-300 w-36 bg-gradient-to-r from-gray-50 to-gray-100">
                          <div className="mb-2 font-medium text-gray-800">{feature.name}</div>
                          <div className="grid grid-cols-2 gap-2 text-xs font-medium">
                            <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">Abs</span>
                            <span className="bg-green-100 text-green-700 px-2 py-1 rounded">Pct</span>
                          </div>
                        </th>
                      ))
                    ) : (
                      <th className="px-4 py-3 text-center text-sm font-medium text-red-600 border-b-2 border-gray-300 bg-gradient-to-r from-red-50 to-red-100">
                        <div className="flex items-center justify-center space-x-2">
                          <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                          <span>No features selected</span>
                        </div>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {combinations.length === 0 ? (
                    <tr>
                      <td colSpan={(selectedFeatures?.length || 0) + 1} className="px-6 py-12 text-center">
                        <div className="flex flex-col items-center space-y-3">
                          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center">
                            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                            </svg>
                          </div>
                          <div className="text-gray-500">
                            <p className="text-sm font-medium">No combinations created yet</p>
                            <p className="text-xs text-gray-400 mt-1">Select identifier values in the settings panel to create combinations</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    combinations.map((combination, index) => {
                      return (
                        <tr 
                          key={combination.id} 
                          className={`hover:bg-blue-50/50 border-b border-gray-200 transition-colors duration-150 cursor-pointer`}
                        >
                          <td className="px-4 py-3 text-sm text-gray-800 font-medium border-r border-gray-300 w-48 sticky left-0 z-20 bg-white shadow-sm">
                                                          <div className="flex items-center justify-between group">
                                <div className="space-y-1">
                                  {/* Removed unnecessary checkbox - live calculations work automatically */}
                                  {Array.isArray(combination.identifiers) 
                                    ? combination.identifiers.map((identifierId, idx) => {
                                        // Extract the identifier and value names for display
                                        const [identifierIdPart, valueIdPart] = identifierId.split(':');
                                        const identifier = currentIdentifiers?.find(id => id.id === identifierIdPart);
                                        const value = identifier?.values?.find(v => v.id === valueIdPart);
                                        
                                        // Debug logging for each identifier display
                                        console.log('🎨 Canvas: Displaying identifier:', {
                                          identifierId,
                                          identifierIdPart,
                                          valueIdPart,
                                          foundIdentifier: identifier,
                                          foundValue: value,
                                          currentIdentifiers: currentIdentifiers
                                        });
                                        
                                        return (
                                          <div key={idx} className="text-xs">
                                            {value ? value.name : identifierId}
                                            {idx < combination.identifiers.length - 1 && (
                                              <span className="text-gray-400 ml-1">×</span>
                                            )}
                                          </div>
                                        );
                                      })
                                    : <div className="text-xs text-red-500">Invalid combination</div>
                                  }
                                  <div className="text-xs text-blue-500 opacity-60 flex items-center gap-2">
                                    {loadingReference === combination.id ? (
                                      <span className="flex items-center gap-1">
                                        <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                        Loading reference...
                                      </span>
                                    ) : loadingReference === 'multiple' ? ( // Removed isSelected from here
                                      <span className="flex items-center gap-1 text-blue-600">
                                        <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                                        Loading with batch...
                                      </span>
                                    ) : loadedReferenceCombinations.has(combination.id) ? (
                                      <span className="flex items-center gap-1 text-green-600">
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            clearReferenceValues(combination.id);
                                          }}
                                          className="text-red-500 hover:text-red-700 text-xs underline"
                                          title="Clear reference values"
                                        >
                                          Clear
                                        </button>
                                      </span>
                                                                          ) : null}
                                  </div>
                                </div>
                              <button
                                onClick={() => handleDeleteCombination(combination.id)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-100 rounded text-red-500 hover:text-red-700"
                                title="Delete combination"
                              >
                                <Trash2 className="w-4 w-4" />
                              </button>
                            </div>
                          </td>
                          {selectedFeatures?.map(feature => {
                            return (
                              <td key={feature.id} className="px-4 py-3 text-sm text-center border-r border-gray-300 w-36">
                                <div className="grid grid-cols-2 gap-2">
                                  <Input 
                                    type="number" 
                                    className="h-8 text-xs border-gray-200 focus:border-blue-300 focus:ring-1 focus:ring-blue-300 transition-all duration-200"
                                    value={combinationInputs[combination.id]?.[feature.id]?.input || ''}
                                    onChange={(e) => handleInputChange(combination.id, feature.id, 'input', e.target.value)}
                                    placeholder="Abs"
                                  />
                                  <Input 
                                    type="number" 
                                    className="h-8 text-xs border-gray-200 focus:border-blue-300 focus:ring-1 focus:ring-blue-300 transition-all duration-200"
                                    value={combinationInputs[combination.id]?.[feature.id]?.change || ''}
                                    onChange={(e) => handleInputChange(combination.id, feature.id, 'change', e.target.value)}
                                    placeholder="Pct(%)"
                                  />
                                </div>
                              </td>
                            );
                          }) || []}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              </div>
            </div>
          </div>
        </Card>

        {/* Results Section */}
        <Card className="flex-1 p-6 shadow-sm border-gray-200">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-3">
                <h3 className="text-xl font-bold text-gray-900">Results & Analytics</h3>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                {settings?.backendIdentifiers && settings?.backendFeatures && (
                  <Badge variant="outline" className="text-xs text-green-600">
                    ✅ Backend data loaded
                  </Badge>
                )}
              </div>
              <Button 
                onClick={() => {}} 
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium px-6 py-2 shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Calculate Results
              </Button>
            </div>
            
            <Tabs defaultValue="scenario-1" className="mb-6">
              <TabsList className="flex w-fit mb-4 p-1.5 bg-gray-100 rounded-lg border border-gray-200 shadow-sm">
                {availableScenarios?.map((scenarioId, index) => (
                  <TabsTrigger 
                    key={scenarioId} 
                    value={scenarioId} 
                    className="text-sm font-medium data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:font-semibold data-[state=active]:shadow-md data-[state=inactive]:bg-transparent data-[state=inactive]:text-gray-700 data-[state=inactive]:hover:bg-gray-200 rounded-md transition-all duration-200 px-4 py-2"
                  >
                    {scenarioId.replace('scenario-', 'Scenario ')}
                  </TabsTrigger>
                )) || []}
              </TabsList>
            </Tabs>

            <Tabs 
              key={viewsKey}
              defaultValue={settings?.selectedView || 'view-1'} 
              value={settings?.selectedView || 'view-1'} 
              onValueChange={(value) => onSettingsChange({ selectedView: value })}
            >

              
              <TabsList className="flex w-fit p-1.5 bg-gray-100 rounded-lg border border-gray-200 shadow-sm">
                {settings?.resultViews?.map((view) => (
                  <TabsTrigger 
                    key={view.id} 
                    value={view.id} 
                    className="text-sm font-medium data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:font-semibold data-[state=active]:shadow-md data-[state=inactive]:bg-transparent data-[state=inactive]:text-gray-700 data-[state=inactive]:hover:bg-gray-200 rounded-md transition-all duration-200 px-4 py-2"
                  >
                    {view.name}
                  </TabsTrigger>
                )) || []}
              </TabsList>
              
              {settings?.resultViews?.map((view) => (
                <TabsContent key={view.id} value={view.id} className="mt-4">
                  {view.id === 'view-1' ? (
                    <div className="grid grid-cols-2 gap-4">
                      {selectedOutputs?.slice(0, 4).map((output, index) => (
                        <div key={output.id} className="bg-white border border-gray-200 rounded-xl p-5 overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-base font-semibold text-gray-800">{output.name}</h4>
                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          </div>
                          <div className="w-full h-[140px] overflow-x-auto bg-gradient-to-br from-gray-50 to-blue-50 rounded-lg p-2">
                            <ResponsiveContainer width={Math.max(400, chartData.length * 80)} height={140}>
                              <BarChart data={chartData} margin={{ left: 10, right: 10, top: 10, bottom: 25 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                                <XAxis 
                                  dataKey="name" 
                                  tick={{ fontSize: 11, fill: '#6B7280' }} 
                                  interval={0}
                                  angle={-45}
                                  textAnchor="end"
                                  height={60}
                                />
                                <YAxis tick={{ fontSize: 11, fill: '#6B7280' }} />
                                <Tooltip 
                                  contentStyle={{
                                    backgroundColor: 'white',
                                    border: '1px solid #E5E7EB',
                                    borderRadius: '8px',
                                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                  }}
                                />
                                <Bar dataKey="value" fill="url(#blueGradient)" radius={[4, 4, 0, 0]} />
                                <defs>
                                  <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#3B82F6" />
                                    <stop offset="100%" stopColor="#1D4ED8" />
                                  </linearGradient>
                                </defs>
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      )) || []}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <div className="space-y-4">
                        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                          <svg className="w-10 h-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                          </svg>
                        </div>
                        <div className="space-y-2">
                          <h4 className="text-xl font-semibold text-gray-800">{view.name}</h4>
                          <p className="text-gray-600">Configure this view in the settings panel</p>
                          {view.selectedCombinations && view.selectedCombinations.length > 0 && (
                            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 inline-block">
                              <p className="text-sm text-blue-700 font-medium">
                                Selected combinations: {view.selectedCombinations.length}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </TabsContent>
              )) || []}
            </Tabs>
          </div>
        </Card>
      </div>
    </div>
  );
};