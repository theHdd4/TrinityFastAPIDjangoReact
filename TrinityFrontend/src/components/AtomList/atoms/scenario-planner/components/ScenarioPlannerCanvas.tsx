import React, { useState, useMemo, useEffect, useRef } from 'react';

import { Card } from '@/components/ui/card';

import { Button } from '@/components/ui/button';

import { Input } from '@/components/ui/input';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { Badge } from '@/components/ui/badge';

import { SCENARIO_PLANNER_API } from '@/lib/api';

import { generateModelId } from '../utils/scenarioPlannerUtils';


import { Trash2, Maximize2, Minimize2, RefreshCw } from 'lucide-react';

import { 

  ScenarioPlannerSettings

} from '@/components/LaboratoryMode/store/laboratoryStore';

import { 

  getComputedSettings,

  getCurrentScenarioData,

  addNewScenario,

  initializeNewScenario

} from '@/components/AtomList/atoms/scenario-planner/utils/scenarioPlannerUtils';



import { useToast } from '@/hooks/use-toast';

import ScenarioResultsChart from './ScenarioResultsChart';



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

  const { toast } = useToast();



  // ✅ NEW: Maximize mode state

  const [isMaximized, setIsMaximized] = useState(false);



  // ✅ NEW: Scenario renaming state with persistence

  const [editingScenario, setEditingScenario] = useState<string | null>(null);

  
  
  // ✅ NEW: Initialize scenarioNames from global store or local storage

  const [scenarioNames, setScenarioNames] = useState<Record<string, string>>(() => {

    // Try to get from global store first

    if (settings?.scenarioNames) {

      console.log('📝 Loading scenarioNames from global store:', settings.scenarioNames);

      return settings.scenarioNames;

    }

    
    
    // Fallback to local storage

    try {

      const stored = localStorage.getItem('scenarioPlanner_scenarioNames');

      if (stored) {

        const parsed = JSON.parse(stored);

        console.log('📝 Loading scenarioNames from local storage:', parsed);

        return parsed;

      }

    } catch (error) {

      console.warn('⚠️ Failed to parse scenarioNames from local storage:', error);

    }

    
    
    // Default names if nothing stored

    const defaultNames = {

      'scenario-1': 'Scenario 1',

      'scenario-2': 'Scenario 2',

      'scenario-3': 'Scenario 3',

      'scenario-4': 'Scenario 4',

      'scenario-5': 'Scenario 5'

    };

    console.log('📝 Using default scenarioNames:', defaultNames);

    return defaultNames;

  });







  // ✅ FIXED: Get current scenario data for proper isolation

  const currentScenario = settings?.selectedScenario || 'scenario-1';

  const currentScenarioData = settings?.scenarios?.[currentScenario];

  
  
  // ✅ FIXED: Use scenario-specific data merged with global updates

  const computedSettings = useMemo(() => {

    console.log('🔄 Recomputing settings for scenario:', currentScenario, {

      hasScenarioData: !!currentScenarioData,

      combinationsCount: currentScenarioData?.combinations?.length || 0

    });

    
    
    if (currentScenarioData) {

      const result = {

        // Use scenario-specific data as base

        identifiers: currentScenarioData.identifiers || [],

        features: currentScenarioData.features || [],

        outputs: currentScenarioData.outputs || [],

        combinations: currentScenarioData.combinations || [],

        resultViews: currentScenarioData.resultViews || [],

        aggregatedViews: currentScenarioData.aggregatedViews || [],

        selectedView: currentScenarioData.selectedView || 'view-1',

        combinationInputs: currentScenarioData.combinationInputs || {},

        originalReferenceValues: currentScenarioData.originalReferenceValues || {},

        
        
        // Merge with global updates from Settings component

        ...(settings.backendIdentifiers && Array.isArray(settings.backendIdentifiers) && { identifiers: settings.backendIdentifiers }),

        ...(settings.features && Array.isArray(settings.features) && { features: settings.features }), // Use user-selected features

        // ✅ FIXED: Prioritize scenario-specific aggregatedViews over global ones

        ...(currentScenarioData.aggregatedViews && Array.isArray(currentScenarioData.aggregatedViews) && currentScenarioData.aggregatedViews.length > 0 

          ? { aggregatedViews: currentScenarioData.aggregatedViews }

          : (settings.aggregatedViews && Array.isArray(settings.aggregatedViews) && { aggregatedViews: settings.aggregatedViews })

        ),

        ...(settings.selectedView && { selectedView: settings.selectedView })

      };

      
      
      console.log('✅ Computed settings result:', {

        combinationsCount: result.combinations.length,

        combinationIds: result.combinations.map(c => c.combination_id || c.id)
      });

      
      
      return result;

    } else {

      // Fallback to global settings if no scenario data exists

      return {

        identifiers: Array.isArray(settings.backendIdentifiers) ? settings.backendIdentifiers : [],

        features: Array.isArray(settings.features) ? settings.features : [], // Use user-selected features

        outputs: [],

        combinations: [],

        resultViews: [],

        aggregatedViews: Array.isArray(settings.aggregatedViews) ? settings.aggregatedViews : [],

        selectedView: settings.selectedView || 'view-1',

        combinationInputs: {},

        originalReferenceValues: {}

      };

    }

  }, [currentScenarioData, settings.backendIdentifiers, settings.features, settings.aggregatedViews, settings.selectedView]);






  
  // ✅ FIXED: Use scenario-specific combination inputs

  const combinationInputs = currentScenarioData?.combinationInputs || {}; 

  const [loadingReference, setLoadingReference] = useState<string | null>(null); // Track which combination is loading reference

  const [loadedReferenceCombinations, setLoadedReferenceCombinations] = useState<Set<string>>(new Set()); // Track which combinations have reference values loaded

  const [runningScenario, setRunningScenario] = useState(false);



  // ✅ NEW: Helper function to format numbers to exactly 3 decimal places

  const formatToThreeDecimals = (value: any): string => {

    if (value === null || value === undefined) return '0';

    
    
    const numValue = typeof value === 'number' ? value : parseFloat(value);

    if (isNaN(numValue)) return '0';

    
    
    // Round to 3 decimal places and convert to string

    return (Math.round(numValue * 1000) / 1000).toFixed(3);

  };



  // ✅ FIXED: Process individual results for chart display - using per-view results

  const processedChartData = useMemo(() => {

    // ✅ NEW: Get results for the current scenario and selected view

    const currentViewResults = currentScenarioData?.viewResults?.[computedSettings.selectedView];

    
    
    if (!currentViewResults?.individuals || !computedSettings.selectedView) {

      return [];

    }

    
    
    // Get the selected aggregated view configuration

    const selectedAggregatedView = computedSettings.aggregatedViews?.find(v => v.id === computedSettings.selectedView);

    
    
    // Filter individuals based on the selected view's identifier configuration

    const filteredIndividuals = (currentViewResults.individuals || []).filter((individual: any) => {

      if (!selectedAggregatedView || !individual.identifiers) return false;

      
      
          // Check if this individual matches the selected view's identifier configuration

    for (const identifierId of selectedAggregatedView.identifierOrder) {

      const selectedValues = selectedAggregatedView.selectedIdentifiers[identifierId] || [];

      const individualValue = individual.identifiers[identifierId];

      
      
      // If this identifier has selected values, check if individual's value is included

      if (selectedValues.length > 0 && !selectedValues.includes(individualValue)) {

        return false; // This individual doesn't match the view's filter

      }

    }

    
    
    return true; // This individual matches the view's configuration

  });

    
    
    return filteredIndividuals.map((individual: any, index: number) => {

      
      
      // Create combination label from identifiers (only show identifiers that are in the selected view)

      const relevantIdentifiers = selectedAggregatedView?.identifierOrder.reduce((acc: any, identifierId: string) => {

        if (individual.identifiers[identifierId]) {

          acc[identifierId] = individual.identifiers[identifierId];

        }

        return acc;

      }, {}) || individual.identifiers;

      
      
      const identifierParts = Object.entries(relevantIdentifiers)

        .map(([key, value]) => `${key}: ${value}`)

        .join(', ');
      
      
      
      // Extract the correct values based on the actual data structure

      let prediction = 0;

      let pct_uplift = 0;

      
      
      // Handle prediction

      if (individual.scenario?.prediction) {

        prediction = individual.scenario.prediction;

      } else if (typeof individual.prediction === 'number') {

        prediction = individual.prediction;

      }

      
      
      // Handle pct_uplift

      if (individual.pct_uplift?.prediction) {

        pct_uplift = individual.pct_uplift.prediction * 100; // Convert to percentage

      } else if (typeof individual.pct_uplift === 'number') {

        pct_uplift = individual.pct_uplift;

      }

      
      
      console.log(`🔍 Processed individual ${index}:`, {

        combinationLabel: identifierParts,

        prediction,

        pct_uplift

      });

      
      
      return {

        identifiers: individual.identifiers || {},

        prediction,

        pct_uplift,

        combinationLabel: identifierParts || 'Unknown',

        run_id: individual.run_id || currentViewResults?.runId || ''

      };

    });

  }, [currentScenarioData?.viewResults, computedSettings?.selectedView, computedSettings?.aggregatedViews]);

  
  
  // ✅ FIXED: Use computed settings for original reference values

  const originalReferenceValues = computedSettings?.originalReferenceValues || {};

  
  
  // State for cleared combinations removed - only clear functionality needed

  
  
  // Use a ref to track which scenarios have been cleared to prevent infinite loops

  const clearedScenariosRef = useRef<Set<string>>(new Set());
  
  

  // ✅ NEW: Use selected combinations from current scenario instead of global
  const selectedCombinations = currentScenarioData?.selectedCombinations || [];
  const backendCombinations = settings.backendCombinations?.combinations || [];
  
  // ✅ NEW: Transform selected combinations to display format
  const combinations = selectedCombinations.map(combinationId => {
    const combinationData = backendCombinations.find((c: any) => c.combination_id === combinationId);
    if (!combinationData) {
      console.warn(`Combination ${combinationId} not found in backend data`);
      return null;
    }
    return {
      id: combinationId,
      combination_id: combinationId,
      identifiers: combinationData.identifiers || {}
    };
  }).filter(Boolean);
  
  // ✅ DEBUG: Log combination data for troubleshooting
  console.log('🔍 Canvas - Combination Data:', {
    selectedCombinations,
    backendCombinations: backendCombinations.length,
    transformedCombinations: combinations.length,
    combinationDetails: combinations
  });
  
  const currentIdentifiers = computedSettings?.identifiers || [];



  // ✅ NEW: State for toggling between individual and aggregated results

  const [resultViewMode, setResultViewMode] = useState<Record<string, 'individual' | 'aggregated'>>({});

  // ✅ NEW: State for toggling between y-values and uplift in data labels
  const [dataLabelType, setDataLabelType] = useState<Record<string, 'y-values' | 'uplift'>>({});
  
  // ✅ NEW: State for controlling data labels visibility
  const [showDataLabels, setShowDataLabels] = useState<Record<string, boolean>>({});



  // ✅ NEW: Function to toggle result view mode for a specific view

  const toggleResultViewMode = (viewId: string) => {

    console.log('🔄 Toggle button clicked for view:', viewId);

    setResultViewMode(prev => {

      const newMode = prev[viewId] === 'individual' ? 'aggregated' : 'individual';

      console.log('🔄 Switching view mode from', prev[viewId] || 'individual', 'to', newMode);

      const newState = {

        ...prev,

        [viewId]: newMode

      };

      console.log('🔄 New resultViewMode state:', newState);

      return newState;

    });

  };

  // ✅ NEW: Function to toggle data label type for a specific view

  const toggleDataLabelType = (viewId: string) => {
    console.log('🔄 Toggle button clicked for viewId:', viewId);
    
    setDataLabelType(prev => {
      const currentType = prev[viewId] || 'y-values';
      const newType = currentType === 'y-values' ? 'uplift' : 'y-values';
      console.log('🔄 Switching dataLabelType from', currentType, 'to', newType, 'for viewId:', viewId);
      const newState = {
        ...prev,
        [viewId]: newType
      };
      return newState;
    });
    
    // ✅ NEW: Automatically enable data labels when switching to uplift mode
    setShowDataLabels(prev => {
      console.log('🔄 Enabling data labels for viewId:', viewId);
      const newState = {
        ...prev,
        [viewId]: true
      };
      return newState;
    });
  };

  // ✅ NEW: Function to toggle data labels visibility
  const toggleDataLabels = (viewId: string) => {
    setShowDataLabels(prev => {
      const newState = {
        ...prev,
        [viewId]: !prev[viewId]
      };
      return newState;
    });
  };

  // ✅ NEW: Context menu state

  const [contextMenu, setContextMenu] = useState<{

    visible: boolean;

    x: number;

    y: number;

    scenarioId: string;

  } | null>(null);



  // ✅ NEW: Temporary input value state for renaming

  const [tempRenameValue, setTempRenameValue] = useState<string>('');



  // ✅ NEW: Scenario functions

  const handleScenarioClick = (scenarioId: string) => {

    // Simple click - just change selection

    onSettingsChange({ selectedScenario: scenarioId });

  };



  const handleContextMenuAction = (action: 'rename' | 'delete') => {

    if (!contextMenu) return;



    const { scenarioId } = contextMenu;

    console.log('🎯 Context menu action:', { action, scenarioId });

    
    
    if (action === 'rename') {

      console.log('✏️ Setting editing scenario to:', scenarioId);

      console.log('📊 Current editingScenario before:', editingScenario);

      
      
      // ✅ NEW: Set both editing state and temporary input value

      const currentName = scenarioNames[scenarioId] || `Scenario ${scenarioId.replace('scenario-', '')}`;

      setTempRenameValue(currentName);

      setEditingScenario(scenarioId);

      
      
      console.log('📊 editingScenario should now be:', scenarioId);

      console.log('📝 tempRenameValue set to:', currentName);

      // ✅ FIXED: Don't trigger scenario selection change - just set editing state

      // This prevents the component from re-rendering and losing the editing state

    } else if (action === 'delete') {

      handleRemoveScenario(scenarioId);

    }

    
    
    setContextMenu(null);

  };



  const closeContextMenu = () => {

    setContextMenu(null);

  };



  const handleScenarioRename = (scenarioId: string, newName: string) => {

    console.log('🔄 handleScenarioRename called:', { scenarioId, newName });

    
    
    // ✅ SIMPLE: Just save the new name if it's not empty

    const trimmedNewName = newName.trim();

    
    
    if (!trimmedNewName) {

      console.log('⏭️ Empty name, not saving');

      setEditingScenario(null);

      return;

    }

    
    
    console.log('✅ Saving new name:', trimmedNewName);

    setScenarioNames(prev => ({

      ...prev,

      [scenarioId]: trimmedNewName

    }));

    
    
    setEditingScenario(null);

  };



  const handleScenarioRenameCancel = () => {

    console.log('❌ Rename cancelled');

    setEditingScenario(null);

    setTempRenameValue('');

  };



  const handleScenarioRenameKeyDown = (e: React.KeyboardEvent, scenarioId: string) => {

    if (e.key === 'Enter') {

      const target = e.target as HTMLInputElement;

      handleScenarioRename(scenarioId, target.value);

    } else if (e.key === 'Escape') {

      setEditingScenario(null);

    }

  };







  // ✅ NEW: Debug useEffect to monitor resultViewMode changes

  useEffect(() => {

    console.log('🔄 resultViewMode state changed:', resultViewMode);

  }, [resultViewMode]);



  // ✅ NEW: Debug useEffect to monitor editingScenario changes

  useEffect(() => {

    console.log('✏️ editingScenario state changed:', editingScenario);

  }, [editingScenario]);



  // ✅ NEW: Function to generate dynamic view names based on selected identifiers

  const getViewDisplayName = (view: any): string => {

    if (typeof view === 'string') {

      return view.replace('view-', 'View ');

    }

    
    
    // If it's an aggregated view object, generate name from selected identifiers

    if (view.selectedIdentifiers && Object.keys(view.selectedIdentifiers).length > 0) {

      const identifierNames: string[] = [];

      
      
      // ✅ FIXED: Use identifierOrder to respect the reordered sequence

      if (view.identifierOrder && Array.isArray(view.identifierOrder)) {

        // Iterate through identifiers in the correct order

        view.identifierOrder.forEach((identifierId: string) => {

          const valueIds = view.selectedIdentifiers[identifierId];

          if (Array.isArray(valueIds) && valueIds.length > 0) {

            // Find the identifier name from the backend identifiers

            const identifier = computedSettings.identifiers.find(id => id.id === identifierId);

            if (identifier) {

              identifierNames.push(identifier.name);

            }

          }

        });

      } else {

        // Fallback to old method if no identifierOrder

      Object.entries(view.selectedIdentifiers).forEach(([identifierId, valueIds]) => {

        if (Array.isArray(valueIds) && valueIds.length > 0) {

          // Find the identifier name from the backend identifiers

          const identifier = computedSettings.identifiers.find(id => id.id === identifierId);

          if (identifier) {

            identifierNames.push(identifier.name);

          }

        }

      });

      }

      
      
      // If we have identifier names, join them with underscore

      if (identifierNames.length > 0) {

        const displayName = identifierNames.join('_');

        console.log(`🏷️ Generated view name for ${view.id}: ${displayName} (from identifiers: ${identifierNames.join(', ')})`);

        return displayName;

      }

    }

    
    
    // Fallback to view name or default

    const fallbackName = view.name || view.id.replace('view-', 'View ');

    console.log(`🏷️ Using fallback name for ${view.id}: ${fallbackName}`);

    return fallbackName;

  };



  // ✅ NEW: Sync scenarioNames with global store changes

  useEffect(() => {

    if (settings?.scenarioNames && JSON.stringify(settings.scenarioNames) !== JSON.stringify(scenarioNames)) {

      console.log('🔄 Syncing scenarioNames from global store:', settings.scenarioNames);

      setScenarioNames(settings.scenarioNames);

    }

  }, [settings?.scenarioNames]);



  // ✅ UPDATED: Prepare run request payload for ALL views

  const prepareRunRequest = (settings: ScenarioPlannerSettings) => {

    // ✅ FIXED: Use computed settings for data access

    const computedSettings = getComputedSettings(settings);



    // 1. ✅ NEW: Use selected combinations from current scenario instead of global
    const currentScenarioData = getCurrentScenarioData(settings);
    const selectedCombinations = currentScenarioData?.selectedCombinations || [];
    if (selectedCombinations.length === 0) {
      throw new Error('No combinations selected for scenario planning. Please select combinations in the settings panel.');
    }

    // 2. ✅ NEW: Get combination data from backend combinations
    const backendCombinations = settings.backendCombinations?.combinations || [];
    if (backendCombinations.length === 0) {
      throw new Error('No backend combinations available. Please refresh combinations in the settings panel.');
    }

    // 3. ✅ NEW: Transform selected combinations to backend clusters format
    const clusters = selectedCombinations.map(combinationId => {
      // Find the combination data from backend
      const combinationData = backendCombinations.find((c: any) => c.combination_id === combinationId);
      if (!combinationData) {
        console.warn(`Combination ${combinationId} not found in backend data`);
        return null;
      }

      // Use identifiers directly from backend combination data
      const identifiers = combinationData.identifiers || {};


      // Create scenario definitions from input values

      const scenarioDefs: { [key: string]: any } = {};

      (computedSettings.features || []).forEach(feature => {

        if (feature.selected && combinationInputs[combinationId]?.[feature.id]) {
          const input = combinationInputs[combinationId][feature.id];
          const referenceValue = getReferenceValue(combinationId, feature.id);
          
          
          if (referenceValue !== null) {

            const inputValue = parseFloat(input.input) || 0;

            const changeValue = parseFloat(input.change) || 0;

            
            
            if (changeValue !== 0) {

              // User modified percentage - use that

              scenarioDefs[feature.name] = {

                type: 'pct',

                value: changeValue

              };

            } else if (inputValue !== referenceValue) {

              // User modified absolute value - calculate percentage

              const pctChange = ((inputValue - referenceValue) / referenceValue) * 100;

              scenarioDefs[feature.id] = {

                type: 'pct',

                value: pctChange

              };

            }

          }

        }

      });



      return {

        combination_id: combinationId, // ✅ NEW: Include combination_id for backend matching
        scenario_defs: scenarioDefs

      };

    }).filter(Boolean); // Remove null entries


    // 3. Build views structure for all aggregated views

    const views: { [key: string]: any } = {};

    
    
    if (computedSettings.aggregatedViews && computedSettings.aggregatedViews.length > 0) {

      // ✅ NEW: Process ALL aggregated views, not just the current one

      computedSettings.aggregatedViews.forEach(view => {

        if (view && view.selectedIdentifiers) {

          const viewSelectedIdentifiers: { [key: string]: { [key: string]: string[] } } = {};

          
          
          // Convert aggregated view format to backend format

          let idCounter = 1;

          // ✅ FIXED: Use identifierOrder to respect the reordered sequence

          const orderedIdentifiers = view.identifierOrder && Array.isArray(view.identifierOrder) 
            ? view.identifierOrder 
            : Object.keys(view.selectedIdentifiers);

          orderedIdentifiers.forEach((identifierId: string) => {

            const valueIds = view.selectedIdentifiers[identifierId];

            if (Array.isArray(valueIds) && valueIds.length > 0) {

              // Find the identifier name

              const identifier = (computedSettings.identifiers || []).find(id => id.id === identifierId);

              
              
              if (identifier) {

                // Convert value IDs to value names for backend

                const valueNames = valueIds.map(valueId => {

                  const value = (identifier?.values || []).find(v => v.id === valueId);

                  return value ? value.name : valueId; // Fallback to ID if name not found

                }).filter(Boolean); // Remove any null/undefined values

                
                
                if (valueNames.length > 0) {

                  const idKey = `id${idCounter}`;

                  viewSelectedIdentifiers[idKey] = {

                    [identifier.name]: valueNames

                  };

                  idCounter++;

                }

              }

            }

          });

          
          
          // Only add view if it has valid selected identifiers

          if (Object.keys(viewSelectedIdentifiers).length > 0) {

            views[view.id] = {

              selected_identifiers: viewSelectedIdentifiers

            };

          }

        }

      });

    } else {

      // ✅ FALLBACK: Create a default view from checked identifiers

      if (computedSettings.identifiers && computedSettings.identifiers.length > 0) {

        const defaultViewSelectedIdentifiers: { [key: string]: { [key: string]: string[] } } = {};

        
        
        let idCounter = 1;

        (computedSettings.identifiers || []).forEach(identifier => {

          // Get checked values for this identifier

          const checkedValues = (identifier.values || []).filter(v => v.checked);

          
          
          if (checkedValues.length > 0) {

            const idKey = `id${idCounter}`;

            const valueNames = checkedValues.map(v => v.name);

            
            
            defaultViewSelectedIdentifiers[idKey] = {

              [identifier.name]: valueNames

            };

            idCounter++;

          }

        });

        
        
        // Create default view if we have any identifiers

        if (Object.keys(defaultViewSelectedIdentifiers).length > 0) {

          views['view-1'] = {

            selected_identifiers: defaultViewSelectedIdentifiers

          };

        }

      }

    }



    const modelId = generateModelId();
    const payload = {

      model_id: modelId,
      scenario_id: settings.activeScenarioId || 'scenario1',
      start_date: settings.referencePeriod?.from || settings.backendDateRange?.start_date,

      end_date: settings.referencePeriod?.to || settings.backendDateRange?.end_date,

        stat: settings.referenceMethod || 'mean',

      clusters,

      views

    };



    console.log('📦 Final payload prepared:', payload);

    console.log('🔍 Schema validation:', {

      hasStartDate: !!payload.start_date,

      hasEndDate: !!payload.end_date,

      hasStat: !!payload.stat,

      clustersCount: payload.clusters.length,

      viewsCount: Object.keys(payload.views).length,

      viewIds: Object.keys(payload.views),

      backendSchemaMatch: '✅ NEW MULTI-VIEW FORMAT'

    });

    return payload;

  };



  // ✅ NEW: Handle running the scenario

  const handleRunScenario = async () => {

    try {



      // 1. Validate combinations exist
      const currentScenarioData = getCurrentScenarioData(settings);
      if (!currentScenarioData?.selectedCombinations || currentScenarioData.selectedCombinations.length === 0) {

        toast({

          title: "No Combinations Available",

          description: "Please select combinations first in the settings panel",

          variant: "destructive",

        });

        return;

      }



      // 2. Validate features are selected

      const selectedFeatures = computedSettings.features?.filter(f => f.selected) || [];

      if (selectedFeatures.length === 0) {

        toast({

          title: "No Features Selected",

          description: "Please select at least one feature to modify in the scenario",

          variant: "destructive",

        });

        return;

      }



      // 3. Validate reference settings

      if (!settings.referenceMethod || !settings.referencePeriod?.from || !settings.referencePeriod?.to) {

        toast({

          title: "Reference Settings Incomplete",

          description: "Please set reference method and period in the settings panel",

          variant: "destructive",

        });

        return;

      }



      // 4. Validate aggregated view configuration OR fallback to checked identifiers

      if (computedSettings.aggregatedViews && computedSettings.aggregatedViews.length > 0) {

        // ✅ FIXED: Use current scenario's selected view instead of global selectedView

        const currentSelectedView = currentScenarioData?.selectedView || 'view-1';

        const selectedView = (computedSettings.aggregatedViews || []).find(v => v.id === currentSelectedView);

        if (!selectedView) {

          toast({

            title: "No View Selected",

            description: "Please select a view before running the scenario",

            variant: "destructive",

          });

          return;

        }



        // 5. Validate view has identifier selections

        const hasIdentifierSelections = Object.values(selectedView?.selectedIdentifiers || {}).some(values => 

          Array.isArray(values) && values.length > 0

        );



        if (!hasIdentifierSelections) {

          toast({

            title: "No Identifiers Selected in View",

            description: "Please select identifier values in the aggregated view for result filtering",

            variant: "destructive",

          });

          return;

        }

      } else {

        // 4B. Fallback: Validate we have checked identifiers for default aggregated view

                const hasCheckedIdentifiers = (computedSettings.identifiers || []).some(identifier =>

          (identifier.values || []).some(v => v.checked)

        );



        if (!hasCheckedIdentifiers) {

          toast({

            title: "No Identifiers Selected",

            description: "Please select identifier values to create combinations and enable result filtering",

            variant: "destructive",

          });

          return;

        }

      }



      setRunningScenario(true);

      
      
      console.log('🎯 RUNNING SCENARIO FOR ALL VIEWS:', {

        currentScenario,

        scenarioData: currentScenarioData,

        allScenarios: Object.keys(settings.scenarios || {}),

        allViewsInCurrentScenario: currentScenarioData ? Object.keys(currentScenarioData.viewResults || {}) : [],

        aggregatedViewsCount: computedSettings.aggregatedViews?.length || 0,

        allViewIds: computedSettings.aggregatedViews?.map(v => v.id) || []

      });

      
      
      // ✅ NEW: Prepare the request payload with ALL views

      const runRequest = prepareRunRequest(settings);
      
      


      


      const response = await fetch(`${SCENARIO_PLANNER_API}/run`, {

        method: 'POST',

        headers: {

          'Content-Type': 'application/json',

        },

        body: JSON.stringify(runRequest)

      });

      
      
      if (response.ok) {

        const result = await response.json();

        
        
        // ✅ NEW: Process view_results for ALL views returned from backend

        const updatedScenarios = { ...settings.scenarios };

        if (!updatedScenarios[currentScenario]) {

          updatedScenarios[currentScenario] = { ...currentScenarioData };

        }

        
        
        // Initialize viewResults if it doesn't exist

        if (!updatedScenarios[currentScenario].viewResults) {

          updatedScenarios[currentScenario].viewResults = {};

        }

        
        
        // ✅ NEW: Store results for ALL views returned from backend

        if (result.view_results) {

          Object.entries(result.view_results).forEach(([viewId, viewData]: [string, any]) => {

            // Find the view name from aggregated views

            let viewName = viewId.replace('view-', 'View ').replace('_', ' ');

            if (computedSettings.aggregatedViews && computedSettings.aggregatedViews.length > 0) {

              const foundView = computedSettings.aggregatedViews.find(v => v.id === viewId);

              if (foundView) {

                viewName = foundView.name || viewName;

              }

            }

            
            
            updatedScenarios[currentScenario].viewResults[viewId] = {

              runId: result.run_id,

              viewId: viewId,

              viewName: viewName,

              datasetUsed: result.dataset_used,

              createdAt: result.created_at,

              modelsProcessed: result.models_processed,

              yVariable: result.y_variable || 'Value',

              flat: viewData.flat,

              hierarchy: viewData.hierarchy,

              individuals: viewData.individuals

            };

          });

        }

        
        
        onSettingsChange({

          scenarios: updatedScenarios

        });

        
        
        const viewsProcessed = result.view_results ? Object.keys(result.view_results).length : 0;

        
        
        toast({

          title: "Scenario Completed",

          description: `Successfully processed ${result.models_processed} models across ${viewsProcessed} views`,

          variant: "default",

        });
        
        
        
      } else {

        const errorText = await response.text();

        throw new Error(`Failed to run scenario: ${response.status} - ${errorText}`);

      }
      
      
      
    } catch (error) {

      console.error('❌ Error running scenario:', error);

      toast({

        title: "Error",

        description: `Failed to run scenario: ${error instanceof Error ? error.message : 'Unknown error'}`,

        variant: "destructive",

      });

    } finally {

      setRunningScenario(false);

    }

  };



  // Get all available scenarios (including the current one and any others)

  const availableScenarios = useMemo(() => {

    const baseScenarios = ['scenario-1'];

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



  // ✅ NEW: Add new scenario with fresh backend data initialization

  const handleAddScenario = async () => {

    // Ensure availableScenarios is always an array

    if (!Array.isArray(availableScenarios)) {

      console.error('availableScenarios is not an array:', availableScenarios);

      return;

    }

    
    
    // ✅ FIXED: Find the highest scenario number and add 1, instead of just counting scenarios
    const scenarioNumbers = availableScenarios
      .map(scenarioId => {
        const match = scenarioId.match(/scenario-(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(num => num > 0);
    
    const nextScenarioNumber = scenarioNumbers.length > 0 ? Math.max(...scenarioNumbers) + 1 : 1;
    const newScenarioId = `scenario-${nextScenarioNumber}`;
    
    console.log('🔢 Scenario numbering:', {
      availableScenarios,
      scenarioNumbers,
      nextScenarioNumber,
      newScenarioId
    });

  
  
    try {

      // ✅ CHANGED: Duplicate current scenario instead of creating fresh one

      const updatedSettings = addNewScenario(settings, newScenarioId);

      
      
      // ✅ NEW: Update both the selected scenario, all scenarios list, and the scenarios data

      onSettingsChange({ 

        selectedScenario: newScenarioId,

        allScenarios: [...availableScenarios, newScenarioId],

        scenarios: updatedSettings.scenarios

      });

      
      
      // ✅ DEBUG: Log new scenario creation and initialization

      console.log('🆕 New Scenario Created and Initialized:', {

        scenarioId: newScenarioId,

        hasIdentifiers: updatedSettings.scenarios[newScenarioId]?.identifiers?.length > 0,

        hasFeatures: updatedSettings.scenarios[newScenarioId]?.features?.length > 0,

        hasCombinations: updatedSettings.scenarios[newScenarioId]?.combinations?.length > 0,

        referenceMethod: updatedSettings.scenarios[newScenarioId]?.referenceMethod,

        referencePeriod: updatedSettings.scenarios[newScenarioId]?.referencePeriod

      });

      
      
      // ✅ CHANGED: No need to auto-load reference values since we're duplicating existing scenario

      
      
      toast({

        title: "Scenario Duplicated",

        description: `${newScenarioId.replace('scenario-', 'Scenario ')} has been created as a copy of the current scenario.`,

        variant: "default",

      });
      
      
      
    } catch (error) {

      console.error('❌ Error creating new scenario:', error);

      toast({

        title: "Error Creating Scenario",

        description: "Failed to create new scenario. Please try again.",

        variant: "destructive",

      });

    }

  };



  // Remove scenario (only for Scenario 3 and beyond)

  const handleRemoveScenario = (scenarioId: string) => {

    // Don't allow removing Scenario 1

    if (scenarioId === 'scenario-1') {

      return;

    }



            const updatedScenarios = (availableScenarios || []).filter(id => id !== scenarioId);
    
    
    
    // If we're removing the currently selected scenario, switch to Scenario 1

    const newSelectedScenario = settings?.selectedScenario === scenarioId ? 'scenario-1' : settings?.selectedScenario;

    
    
    // ✅ FIXED: Remove scenario data from scenarios object

    const updatedScenariosData = { ...settings.scenarios };

    delete updatedScenariosData[scenarioId];

    
    
    onSettingsChange({ 

      selectedScenario: newSelectedScenario,

      allScenarios: updatedScenarios,

      scenarios: updatedScenariosData

    });

  };



  // ✅ NEW: Function to fetch reference values for specific combinations (for new scenarios)

  const fetchReferenceValuesForAllWithCombinations = async (specificCombinations: any[]) => {

    if (specificCombinations.length === 0) {

      console.log('⚠️ No combinations provided for reference value fetching');

      return;

    }



    try {

      // Show loading state for all combinations

      setLoadingReference('all');



      // ✅ OPTIMIZATION: Make ONE API call instead of multiple calls

      const statMethod = settings.referenceMethod || 'mean';

      const modelId = generateModelId();
      const requestBody: any = {

        model_id: modelId,
        stat: statMethod,

        start_date: settings.referencePeriod?.from || settings.backendDateRange?.start_date ,

        end_date: settings.referencePeriod?.to || settings.backendDateRange?.end_date 
      };

      
      
      const response = await fetch(`${SCENARIO_PLANNER_API}/reference`, {

        method: 'POST',

        headers: {

          'Content-Type': 'application/json',

        },

        body: JSON.stringify(requestBody)

      });

      
      
      if (response.ok) {

        const data = await response.json();

        
        
        // ✅ DEBUG: Log reference values data for verification

        console.log('🔍 Reference Values Debug (New Scenario):', {

          referenceMethod: settings.referenceMethod,

          referencePeriod: settings.referencePeriod,

          totalCombinations: Object.keys(data.reference_values_by_combination || {}).length,
          sampleCombination: Object.entries(data.reference_values_by_combination || {})[0],
          requestBody,

          combinationsCount: specificCombinations.length

        });

        
        
        // Process the specific combinations with the same data

        const newInputs = { ...combinationInputs };

        const newOriginalRefs = { ...originalReferenceValues };

        let totalPopulated = 0;

        
        
        // ✅ DEBUG: Log what we're working with

        console.log('🔍 Processing combinations for reference values:', {

          combinationsCount: specificCombinations.length,

          combinations: specificCombinations,

          availableFeatures: computedSettings?.features?.filter(f => f.selected) || [],

          selectedFeaturesCount: computedSettings?.features?.filter(f => f.selected)?.length || 0

        });

        
        
        specificCombinations.forEach(combination => {

          // ✅ FIXED: Preserve existing user input - don't overwrite if user has data

          if (!newInputs[combination.id]) {

            newInputs[combination.id] = {};

          }

          if (!newOriginalRefs[combination.id]) {

            newOriginalRefs[combination.id] = {};

          }

          
          
          // Extract identifiers for this combination

          // ✅ NEW: Use combination_id directly instead of extracting identifiers
          const combinationId = combination.combination_id || combination.id;
          if (!combinationId) {
            console.warn(`No combination_id found in combination:`, combination);
            return;
          }
          
          // Find matching combination data
          const matchingCombination = data.reference_values_by_combination?.[combinationId];
          
          if (matchingCombination) {
            const modelData = matchingCombination;
            
            
            // Map features to their reference values

            const features = computedSettings?.features || [];

            
            
            features.forEach(feature => {

              if (feature.selected && (modelData as any).reference_values?.[feature.name]) {

                if (!newInputs[combination.id][feature.id]) {

                  newInputs[combination.id][feature.id] = { input: '', change: '' };

                }

                
                
                const referenceValue = (modelData as any).reference_values[feature.name];

                
                
                // Set both Abs (input) and Pct (change) fields

                newInputs[combination.id][feature.id].input = formatToThreeDecimals(referenceValue);

                newInputs[combination.id][feature.id].change = '0'; // Auto-populate percentage with 0

                
                
                // ✅ NEW: Store original reference values for this combination

                if (!newOriginalRefs[combination.id][feature.id]) {

                  newOriginalRefs[combination.id][feature.id] = referenceValue;

                }

                
                
                totalPopulated++;

              }

            });

          }

        });

        
        
        // ✅ FIXED: Update scenario-specific data in global store

        // ✅ NEW: Use the new scenario ID that was passed to this function

        const newScenarioId = specificCombinations[0]?.scenarioId || settings.selectedScenario;

        const updatedScenarios = { ...settings.scenarios };

        
        
        if (!updatedScenarios[newScenarioId]) {

          updatedScenarios[newScenarioId] = {};

        }

        
        
        updatedScenarios[newScenarioId].combinationInputs = newInputs;

        updatedScenarios[newScenarioId].originalReferenceValues = newOriginalRefs;

        
        
        onSettingsChange({ 

          scenarios: updatedScenarios

        });

        
        
        // Mark all combinations as having reference values loaded

        setLoadedReferenceCombinations(prev => new Set([...prev, ...specificCombinations.map(c => c.id)]));

        
        
        console.log(`✅ Successfully populated reference values for ${totalPopulated} feature-combination pairs`);

        
        
        toast({

          title: "Reference Values Loaded",

          description: `Successfully loaded reference values for ${specificCombinations.length} combinations.`,

          variant: "default",

        });
        
        
        
      } else {

        throw new Error(`Failed to fetch reference values: ${response.status}`);

      }

    } catch (error) {

      console.error('❌ Error fetching reference values:', error);

      toast({

        title: "Error Loading Reference Values",

        description: "Failed to load reference values. Please try again.",

        variant: "destructive",

      });

    } finally {

      setLoadingReference(null);

    }

  };



  // New function to fetch reference values for ALL combinations - OPTIMIZED!

  const fetchReferenceValuesForAll = async (overwriteExisting = false) => {

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



      // ✅ OPTIMIZATION: Make ONE API call instead of multiple calls

      const statMethod = settings.referenceMethod || 'mean';

      const modelId = generateModelId();
      const requestBody: any = {

        model_id: modelId,
        stat: statMethod,

        start_date: settings.referencePeriod?.from || settings.backendDateRange?.start_date ,

        end_date: settings.referencePeriod?.to || settings.backendDateRange?.end_date 
      };

      
      
      const response = await fetch(`${SCENARIO_PLANNER_API}/reference`, {

        method: 'POST',

        headers: {

          'Content-Type': 'application/json',

        },

        body: JSON.stringify(requestBody)

      });

      
      
      if (response.ok) {

        const data = await response.json();

        
        
        // ✅ DEBUG: Log reference values data for verification

        console.log('🔍 Reference Values Debug:', {

          referenceMethod: settings.referenceMethod,

          referencePeriod: settings.referencePeriod,

          totalCombinations: Object.keys(data.reference_values_by_combination || {}).length,
          sampleCombination: Object.entries(data.reference_values_by_combination || {})[0],
          requestBody

        });
        
        

        // Process ONLY the selected combinations from the backend response
        const newInputs = { ...combinationInputs };

        const newOriginalRefs = { ...originalReferenceValues }; // ✅ NEW: Store original reference values

        let totalPopulated = 0;

        const processedCombinationIds = new Set<string>(); // ✅ NEW: Track processed combinations

        
        // ✅ DEBUG: Log what combinations we're looking for vs what the backend returned
        console.log('🔍 Combination Matching Debug:', {
          selectedCombinations: combinations.map(c => c.combination_id),
          backendCombinations: Object.keys(data.reference_values_by_combination || {}),
          matchingCombinations: combinations.filter(c => 
            data.reference_values_by_combination?.[c.combination_id]
          ).map(c => c.combination_id)
        });
        
        
        combinations.forEach(combination => {

          // ✅ FIXED: Preserve existing user input - don't overwrite if user has data

          if (!newInputs[combination.id]) {

            newInputs[combination.id] = {};

          }

          if (!newOriginalRefs[combination.id]) {

            newOriginalRefs[combination.id] = {};

          }

          

          // ✅ NEW: Use combination_id directly instead of extracting identifiers
          const combinationId = combination.combination_id || combination.id;
          if (!combinationId) {
            console.warn(`No combination_id found in combination:`, combination);
            return;
          }
          
          // Find matching combination data
          const matchingCombination = data.reference_values_by_combination?.[combinationId];
          
          // ✅ DEBUG: Log the matching process for each combination
          console.log(`🔍 Processing combination ${combinationId}:`, {
            combinationId,
            hasMatchingData: !!matchingCombination,
            availableKeys: Object.keys(data.reference_values_by_combination || {}),
            exactMatch: data.reference_values_by_combination?.[combinationId] ? 'YES' : 'NO'
          });
          
          // ✅ DEBUG: Log matching process
          if (matchingCombination) {
            console.log(`✅ Found matching combination data for ${combinationId}:`, {
              combinationId,
              features: matchingCombination.features,
              referenceValuesCount: Object.keys(matchingCombination.reference_values || {}).length
            });
          } else {
            console.log(`⚠️ No matching combination data found for ${combinationId}:`, {
              combinationId,
              availableCombinations: Object.keys(data.reference_values_by_combination || {})
            });
          }
          
          if (matchingCombination) {
            const modelData = matchingCombination;
            
            
            // Populate features for this combination

            const features = computedSettings?.features || [];

            features.forEach(feature => {

              if (feature.selected && (modelData as any).reference_values?.[feature.name]) {

                if (!newInputs[combination.id][feature.id]) {

                  newInputs[combination.id][feature.id] = { input: '', change: '' };

                }

                
                
                const referenceValue = (modelData as any).reference_values[feature.name];

                
                
                // ✅ DEBUG: Log reference value assignment

                console.log(`📊 Reference Value Assigned:`, {

                  combination: combination.id,

                  feature: feature.name,

                  referenceValue,
                  type: typeof referenceValue,
                  isZero: referenceValue === 0,
                  isUndefined: referenceValue === undefined,

                  hasUserInput: !!combinationInputs[combination.id]?.[feature.id]?.input,
                  willPopulate: !combinationInputs[combination.id]?.[feature.id]?.input
                });

                
                
                // ✅ NEW: Store ORIGINAL reference value (never changes)

                newOriginalRefs[combination.id][feature.id] = referenceValue;

                
                
                                  // ✅ FIXED: Only set input to reference value if user doesn't have input OR if we're overwriting

                  if (!combinationInputs[combination.id]?.[feature.id]?.input || overwriteExisting) {
                    newInputs[combination.id][feature.id].input = formatToThreeDecimals(referenceValue);

                    newInputs[combination.id][feature.id].change = '0';

                    totalPopulated++;

                  } else {

                  // User already has input - preserve it, just store the original reference

                }

              }

            });

          } else {

            // Use best available reference values from any model

            const features = computedSettings?.features || [];

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

                  
                  
                  // ✅ FIXED: Only set input to reference value if user doesn't have input

                  if (!combinationInputs[combination.combination_id || combination.id]?.[feature.id]?.input) {
                  newInputs[combination.id][feature.id].input = bestReferenceValue.toString();

                  newInputs[combination.id][feature.id].change = '0';

                  totalPopulated++;

                  } else {

                    // User already has input - preserve it, just store the original reference

                  }

                } else {

                  // Fallback value

                  const fallbackValue = 100;

                  // ✅ NEW: Store ORIGINAL reference value

                  newOriginalRefs[combination.id][feature.id] = fallbackValue;

                  
                  
                  // ✅ FIXED: Only set input to reference value if user doesn't have input

                  if (!combinationInputs[combination.combination_id || combination.id]?.[feature.id]?.input) {
                  newInputs[combination.id][feature.id].input = fallbackValue.toString();

                  newInputs[combination.id][feature.id].change = '0';

                  totalPopulated++;

                  } else {

                    // User already has input - preserve it, just store the original reference

                  }

                }

              }

            });

          }

          
          
          // ✅ NEW: Add to processed combinations set

          processedCombinationIds.add(combination.id);

        });

        
        
        // ✅ FIXED: Update loaded combinations state ONCE after processing all combinations

        setLoadedReferenceCombinations(prev => {

          const newSet = new Set([...prev, ...processedCombinationIds]);

          console.log('📝 Updated loaded combinations:', {

            previousCount: prev.size,

            newlyProcessed: processedCombinationIds.size,

            totalLoaded: newSet.size,

            newlyProcessedIds: Array.from(processedCombinationIds)

          });

          return newSet;

        });

        
        
        // ✅ FIXED: Update scenario-specific data in global store

        const updatedScenarios = { ...settings.scenarios };

        if (!updatedScenarios[currentScenario]) {

          updatedScenarios[currentScenario] = { ...currentScenarioData };

        }

        updatedScenarios[currentScenario].combinationInputs = newInputs;

        updatedScenarios[currentScenario].originalReferenceValues = newOriginalRefs;

        
        
        onSettingsChange({ 

          scenarios: updatedScenarios

        });

        
        
        // Cleared combinations state removed

        
        
        toast({

          title: "Reference Values Loaded",

          description: `Successfully populated reference values for ${totalPopulated} features ${overwriteExisting ? '(overwrote existing values)' : '(preserved existing user input)'}`,

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










  // Handle Ctrl+Enter key press - now loads ALL combinations

  const handleKeyDown = (e: React.KeyboardEvent) => {

    if (e.ctrlKey && e.key === 'Enter') {

      e.preventDefault();

      fetchReferenceValuesForAll(false); // ✅ Keep false to preserve user changes on manual refresh

    }

  };



  // Clear reference values for a combination - now fetches from MongoDB
  const clearReferenceValues = async (combinationId: string) => {
    try {
      console.log(`🔄 Individual refresh for combination: ${combinationId}`);
      
      // Show loading state
      setLoadingReference(combinationId);
      
      // Extract client/app/project from localStorage (same as generateModelId)
      const envStr = localStorage.getItem('env');
      if (!envStr) {
        throw new Error('No env found in localStorage for MongoDB query');
      }
      
      const env = JSON.parse(envStr);
      const client_name = env.CLIENT_NAME || 'default_client';
      const app_name = env.APP_NAME || 'default_app';
      const project_name = env.PROJECT_NAME || 'default_project';
      
      // Make GET call to retrieve reference points from MongoDB
      const response = await fetch(
        `${SCENARIO_PLANNER_API}/get-reference-points?client_name=${encodeURIComponent(client_name)}&app_name=${encodeURIComponent(app_name)}&project_name=${encodeURIComponent(project_name)}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.success && data.data) {
          const referenceData = data.data;
          
          // Use the same combination ID logic as global refresh
          const searchKey = combinationId; // combinationId is already the correct key
          const matchingData = referenceData.reference_values_by_combination?.[searchKey];
          
          console.log(`🔍 Individual refresh - Looking for combination: ${searchKey}`, {
            found: !!matchingData,
            combinationId,
            searchKey,
            availableKeys: Object.keys(referenceData.reference_values_by_combination || {})
          });
          
          if (matchingData) {
            const newInputs = { ...combinationInputs };
            const newOriginalRefs = { ...originalReferenceValues };
            
            // Initialize if not exists
            if (!newInputs[combinationId]) {
              newInputs[combinationId] = {};
            }
            if (!newOriginalRefs[combinationId]) {
              newOriginalRefs[combinationId] = {};
            }
            
            const features = computedSettings?.features || [];
            features.forEach(feature => {
              if (feature.selected && matchingData.reference_values?.[feature.name]) {
                const referenceValue = matchingData.reference_values[feature.name];
                
                console.log(`📊 Individual refresh - Reference value for ${feature.name}:`, {
                  featureName: feature.name,
                  referenceValue,
                  type: typeof referenceValue,
                  isZero: referenceValue === 0,
                  isUndefined: referenceValue === undefined
                });
                
                // Store original reference value
                newOriginalRefs[combinationId][feature.id] = referenceValue;
                
                // Always overwrite for individual refresh
                newInputs[combinationId][feature.id] = {
                  input: formatToThreeDecimals(referenceValue),
                  change: '0'
                };
              }
            });
            
            // Update global state
      const updatedScenarios = { ...settings.scenarios };
      if (!updatedScenarios[currentScenario]) {
        updatedScenarios[currentScenario] = { ...currentScenarioData };
      }
      updatedScenarios[currentScenario].combinationInputs = newInputs;
            updatedScenarios[currentScenario].originalReferenceValues = newOriginalRefs;
            
            onSettingsChange({ scenarios: updatedScenarios });
            
            console.log('✅ Individual refresh - Reference values processed successfully');
            console.log('🔍 Individual refresh - Updated combinationInputs:', newInputs);
            console.log('🔍 Individual refresh - Updated originalReferenceValues:', newOriginalRefs);
      
      toast({
        title: "Reference Values Restored",
        description: `Reference values restored for ${combinationId}`,
        variant: "default",
            });
          } else {
            toast({
              title: "No Reference Data",
              description: `No reference data found for ${combinationId}`,
              variant: "destructive",
            });
          }
        } else {
          toast({
            title: "No Reference Data",
            description: "No reference data found in MongoDB",
            variant: "destructive",
          });
        }
      } else {
        throw new Error(`Failed to fetch reference values: ${response.statusText}`);
      }
    } catch (error) {
      console.error('❌ Error in individual refresh:', error);
      toast({
        title: "Refresh Error",
        description: "Failed to refresh reference values. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingReference(null);
    }
  };



  // Refresh function removed - only clear functionality needed



  // Handle right-click context menu for scenario actions

  const handleScenarioContextMenu = (e: React.MouseEvent, scenarioId: string) => {

    e.preventDefault();

    e.stopPropagation();

    
    
    // ✅ FIXED: Position context menu to the right of the scenario tab

    const rect = e.currentTarget.getBoundingClientRect();

    const menuX = rect.right + 5; // 5px to the right of the tab

    const menuY = rect.top; // Align with the top of the tab

    
    
    setContextMenu({

      visible: true,

      x: menuX,

      y: menuY,

      scenarioId

    });

  };







  // Restore state from store when component mounts or settings change

  useEffect(() => {

    if (settings?.backendIdentifiers && settings?.backendFeatures) {

      // Check if we need to restore combinations

      const needsCombinationRestoration = !combinations.length && computedSettings.identifiers?.length;

      
      
      if (needsCombinationRestoration) {

        // Combinations need restoration, but this should be handled by Settings component

      }

    }

  }, [settings?.backendIdentifiers, settings?.backendFeatures, combinations.length, computedSettings?.identifiers]);







    // ✅ REMOVED: No more auto-loading of reference values

  useEffect(() => {

    if (combinations.length === 0) {

      // ✅ Clear combination inputs from global store when no combinations

      onSettingsChange({ combinationInputs: {} });

      setLoadedReferenceCombinations(new Set()); // Clear loaded combinations tracking

    }

  }, [combinations.length]);

  // ✅ NEW: Function to initialize select_config defaults (mean and backend date range)
  const initializeSelectConfigDefaults = async () => {
    try {
      console.log('🔄 Initializing select_config defaults...');
      
      // Use backend defaults: mean and backend date range
      const defaultSettings = {
        referenceMethod: 'mean',
        referencePeriod: {
          from: settings.backendDateRange?.start_date || null,
          to: settings.backendDateRange?.end_date || null
        }
      };
      
      console.log('📊 Setting select_config defaults:', {
        referenceMethod: defaultSettings.referenceMethod,
        referencePeriod: defaultSettings.referencePeriod,
        backendDateRange: settings.backendDateRange
      });
      
      onSettingsChange(defaultSettings);
      console.log('✅ Auto-initialized settings with select_config defaults');
    } catch (error) {
      console.log('⚠️ Error initializing select_config defaults:', error);
    }
  };

  // ✅ NEW: Auto-fetch MongoDB reference values on component mount to update settings
  useEffect(() => {
    const initializeMongoReferenceSettings = async () => {
      try {
        console.log('🔄 Auto-initializing MongoDB reference settings on component mount...');
        
        // Extract client/app/project from localStorage
        const envStr = localStorage.getItem('env');
        if (!envStr) {
          console.log('⚠️ No env found in localStorage, skipping MongoDB initialization');
          return;
        }
        
        const env = JSON.parse(envStr);
        const client_name = env.CLIENT_NAME || 'default_client';
        const app_name = env.APP_NAME || 'default_app';
        const project_name = env.PROJECT_NAME || 'default_project';
        
        // Make GET call to retrieve reference points from MongoDB
        const response = await fetch(
          `${SCENARIO_PLANNER_API}/get-reference-points?client_name=${encodeURIComponent(client_name)}&app_name=${encodeURIComponent(app_name)}&project_name=${encodeURIComponent(project_name)}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
        
        if (response.ok) {
          const data = await response.json();
          console.log('✅ MongoDB reference points fetched on initialization:', data);
          
          if (data.success && data.data) {
            const referenceData = data.data;
            const storedStatistics = referenceData.statistic_used;
            const storedDateRange = referenceData.date_range;
            
            console.log('🔍 Auto-initializing with MongoDB values:', {
              storedStatistics,
              storedDateRange,
              currentReferenceMethod: settings.referenceMethod,
              currentReferencePeriod: settings.referencePeriod
            });
            
            // Update settings with MongoDB values if they exist
            let updatedSettings = {};
            if (storedStatistics) {
              updatedSettings.referenceMethod = storedStatistics;
              console.log('📊 Auto-updating reference method to:', storedStatistics);
            }
            
            if (storedDateRange && storedDateRange.start_date && storedDateRange.end_date) {
              updatedSettings.referencePeriod = {
                from: storedDateRange.start_date,
                to: storedDateRange.end_date
              };
              console.log('📅 Auto-updating reference period to:', { 
                from: storedDateRange.start_date, 
                to: storedDateRange.end_date 
              });
            }
            
            // Apply updates if we have any
            if (Object.keys(updatedSettings).length > 0) {
              onSettingsChange(updatedSettings);
              console.log('✅ Auto-initialized settings with MongoDB values');
            }
          } else {
            // No MongoDB data found, fall back to select_config defaults
            console.log('⚠️ No MongoDB reference points found, falling back to select_config defaults');
            await initializeSelectConfigDefaults();
          }
        } else {
          // MongoDB request failed, fall back to select_config defaults
          console.log('⚠️ MongoDB request failed, falling back to select_config defaults');
          await initializeSelectConfigDefaults();
        }
      } catch (error) {
        console.log('⚠️ Error auto-initializing MongoDB reference settings:', error);
        // Don't throw error, just log it - app should continue with default settings
      }
    };

    // Only run on component mount (empty dependency array)
    initializeMongoReferenceSettings();
  }, []); // Empty dependency array = run only on mount // Only depend on combinations length, not the full array

  
  
  // ✅ FIXED: Only clear reference values when settings change - manual reload with Ctrl+Enter

  useEffect(() => {

    console.log('🔍 Canvas: Checking if reference values need clearing...', {

      referenceValuesNeedRefresh: settings.referenceValuesNeedRefresh,

      combinationsLength: combinations.length,

      hasSettings: !!settings

    });

    
    
    if (settings.referenceValuesNeedRefresh && combinations.length > 0) {

      console.log('🧹 Canvas: CLEARING reference values - user must press Ctrl+Enter to reload');

      
      
      // ✅ NEW: Only clear existing reference values - don't auto-reload

      const updatedScenarios = { ...settings.scenarios };

      if (!updatedScenarios[currentScenario]) {

        updatedScenarios[currentScenario] = { ...currentScenarioData };

      }

      
      
      // Clear combination inputs and original reference values

      updatedScenarios[currentScenario].combinationInputs = {};

      updatedScenarios[currentScenario].originalReferenceValues = {};

      
      
      onSettingsChange({ 

        scenarios: updatedScenarios

      });

      
      
      setLoadedReferenceCombinations(new Set());

      
      
      // ✅ FIXED: Use setTimeout to break the circular dependency

      setTimeout(() => {

        onSettingsChange({

          referenceValuesNeedRefresh: false,

          // ✅ NEW: Update last reference values to current ones after clearing

          lastReferenceMethod: settings.referenceMethod,

          lastReferencePeriod: settings.referencePeriod

        });

      }, 0);

      
      
      toast({

        title: "Reference Values Cleared",

        description: "Reference values cleared. Use the refresh button to load new values.",

        variant: "default",

      });

    }

  }, [settings.referenceValuesNeedRefresh, combinations.length, currentScenario]);



  // Clear data when switching to a new scenario (fresh page experience)

  useEffect(() => {

    // Only clear data when first visiting a newly added scenario

    if (settings?.selectedScenario && 

        !settings.selectedScenario.startsWith('scenario-1') && 

    
    
        combinations.length === 0) { // Only clear if no combinations exist

      // This is a newly added scenario (3, 4, 5, etc.) - clear everything

      // Use a ref to prevent infinite loops - only run once per scenario

      const shouldClear = !clearedScenariosRef.current.has(settings.selectedScenario);

      
      
      if (shouldClear) {

        onSettingsChange({ 

          combinations: [],

          identifiers: (computedSettings.identifiers || []).map(identifier => ({

            ...identifier,

            values: (identifier.values || []).map(value => ({

              ...value,

              checked: false

            }))

          }))

        });

        // ✅ FIXED: Clear combination inputs from global store

        onSettingsChange({ combinationInputs: {} });

        clearedScenariosRef.current.add(settings.selectedScenario);

      }

    }

  }, [settings?.selectedScenario, computedSettings?.identifiers, combinations.length]); // Removed onSettingsChange from dependencies



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

    const feature = (computedSettings?.features || []).find(f => f.id === featureId);

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

    return fallbackValue;

  };



  const handleInputChange = (combinationId: string, featureId: string, field: 'input' | 'change', value: string) => {

    const numValue = parseFloat(value) || 0;

    
    
    // ✅ FIXED: Use global store instead of local state for user input persistence

    const newInputs = { ...combinationInputs };

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

          newInputs[combinationId][featureId].input = formatToThreeDecimals(newAbsValue);

        } else if (field === 'input') {

          // Abs field changed - calculate new Pct value

          const newPctValue = calculatePctFromAbs(referenceValue, numValue);

          newInputs[combinationId][featureId].change = formatToThreeDecimals(newPctValue);

        }

      }



      // ✅ FIXED: Update scenario-specific data in global store

      const updatedScenarios = { ...settings.scenarios };

      if (!updatedScenarios[currentScenario]) {

        updatedScenarios[currentScenario] = { ...currentScenarioData };

      }

      updatedScenarios[currentScenario].combinationInputs = newInputs;

      
      
      onSettingsChange({ 

        scenarios: updatedScenarios

    });

  };



  const handleDeleteCombination = (combinationId: string) => {

    console.log('🗑️ Deleting combination:', combinationId);

    

    // ✅ NEW: With the new combination selection approach, we need to remove the combination from selectedCombinations
    const currentScenarioData = getCurrentScenarioData(settings);
    const currentSelectedCombinations = currentScenarioData?.selectedCombinations || [];
    
    // Check if the combination is in the selected list
    if (currentSelectedCombinations.includes(combinationId)) {
      console.log('✅ Found combination in selected list, removing it');
      
      // Remove the combination from selectedCombinations
      const updatedSelectedCombinations = currentSelectedCombinations.filter(id => id !== combinationId);
      
      console.log('📝 Updated selected combinations:', updatedSelectedCombinations);
      
      // Update the current scenario with the new selected combinations and clean up combination inputs
      const updatedScenarios = { ...settings.scenarios };
      const currentScenario = settings.selectedScenario;
      
      if (updatedScenarios[currentScenario]) {
        // Clean up combination inputs for this combination
        const updatedCombinationInputs = { ...currentScenarioData?.combinationInputs };
        delete updatedCombinationInputs[combinationId];
        
        // Update the scenario data with both selectedCombinations and combinationInputs
      updatedScenarios[currentScenario] = {
          ...updatedScenarios[currentScenario],
          selectedCombinations: updatedSelectedCombinations,
          combinationInputs: updatedCombinationInputs
        };
        
      onSettingsChange({ 
        scenarios: updatedScenarios
      });
      }
      
      // Show success message
      toast({

        title: "Combination Deleted",

        description: `Removed combination: ${combinationId}`,
        variant: "default",

      });
      
      
      
    } else {

      console.log('❌ Combination not found in selected list');
      toast({
        title: "Error",
        description: "Combination not found in selected combinations",
        variant: "destructive",
      });
    }

  };



  // ✅ NEW: Helper function to analyze identifier usage across combinations

  const analyzeIdentifierUsage = () => {

    const usedIdentifierValues = new Set<string>();
    
    

    // ✅ NEW: With direct combination selection, we don't need to track identifier usage
    // Combinations are now selected directly from backend, not generated from identifiers
    
    
    console.log('🔍 Current identifier usage analysis:', {

      totalCombinations: combinations.length,

      usedIdentifierValues: Array.from(usedIdentifierValues),

      identifiers: computedSettings?.identifiers?.map(id => ({

        name: id.name,

        totalValues: id.values?.length || 0,

        checkedValues: id.values?.filter(v => v.checked).map(v => v.name) || [],

        usedValues: id.values?.filter(v => usedIdentifierValues.has(`${id.id}:${v.id}`)).map(v => v.name) || []

      }))

    });

    
    
    return usedIdentifierValues;

  };



  // ✅ NEW: Watch for reference method changes and auto-refresh
  useEffect(() => {
    // Only trigger if we have combinations and the reference method actually changed
    if (combinations.length > 0 && settings.referenceMethod) {
      console.log('🔄 Reference method changed, auto-refreshing combinations...', {
        referenceMethod: settings.referenceMethod,
        combinationsCount: combinations.length
      });
      
      // Auto-refresh when reference method changes
      handleGlobalRefreshReferenceValues();
    }
  }, [settings.referenceMethod]); // Watch for reference method changes

  // ✅ NEW: Watch for reference period changes and auto-refresh
  useEffect(() => {
    // Only trigger if we have combinations and the reference period actually changed
    if (combinations.length > 0 && settings.referencePeriod) {
      console.log('🔄 Reference period changed, auto-refreshing combinations...', {
        referencePeriod: settings.referencePeriod,
        combinationsCount: combinations.length
      });
      
      // Auto-refresh when reference period changes
      handleGlobalRefreshReferenceValues();
    }
  }, [settings.referencePeriod]); // Watch for reference period changes

  // ✅ NEW: Function to auto-populate reference values using the new endpoint
  const autoPopulateReferenceValues = async () => {
    try {
      console.log('🔄 Auto-populating reference values for new combinations/features...');
      
      // Get current combinations and selected features
      const combinationIds = combinations.map(c => c.combination_id || c.id);
      const selectedFeatures = computedSettings?.features?.filter(f => f.selected) || [];
      const featureNames = selectedFeatures.map(f => f.name);
      
      if (combinationIds.length === 0 || featureNames.length === 0) {
        console.log('ℹ️ No combinations or features selected for auto-population');
        return;
      }
      
      // Prepare query parameters for GET call
      const modelId = generateModelId();
      const combinationIdsParam = combinationIds.join(',');
      const featureNamesParam = featureNames.join(',');
      
      const queryParams = new URLSearchParams({
        model_id: modelId,
        combination_ids: combinationIdsParam,
        feature_names: featureNamesParam
      });
      
      console.log('🔍 Auto-population request:', {
        model_id: modelId,
        combination_ids: combinationIdsParam,
        feature_names: featureNamesParam
      });
      
      // Make GET call to auto-populate endpoint
      const response = await fetch(`${SCENARIO_PLANNER_API}/get-reference-points-for-combinations?${queryParams}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.success && data.data) {
          const referenceData = data.data.reference_values_by_combination;
          const newInputs = { ...combinationInputs };
          const newOriginalRefs = { ...originalReferenceValues };
          let totalPopulated = 0;
          
          console.log('🔍 Auto-population response:', {
            source: data.data.source,
            combinationsFound: data.data.combinations_found,
            referenceData
          });
          
          combinations.forEach(combination => {
            const searchKey = combination.combination_id || combination.id;
            const matchingData = referenceData?.[searchKey];
            
            if (matchingData) {
              // Initialize if not exists
              if (!newInputs[combination.id]) {
                newInputs[combination.id] = {};
              }
              if (!newOriginalRefs[combination.id]) {
                newOriginalRefs[combination.id] = {};
              }
              
              const features = computedSettings?.features || [];
              features.forEach(feature => {
                if (feature.selected && matchingData.reference_values?.[feature.name]) {
                  const referenceValue = matchingData.reference_values[feature.name];
                  
                  // Store original reference value
                  newOriginalRefs[combination.id][feature.id] = referenceValue;
                  
                  // Only populate if user doesn't have input (preserve user changes)
                  if (!combinationInputs[combination.id]?.[feature.id]?.input) {
                    newInputs[combination.id][feature.id] = {
                      input: formatToThreeDecimals(referenceValue),
                      change: '0'
                    };
                    totalPopulated++;
                  }
                }
              });
            }
          });
          
          // Update global state only if we populated something
          if (totalPopulated > 0) {
            const updatedScenarios = { ...settings.scenarios };
            if (!updatedScenarios[currentScenario]) {
              updatedScenarios[currentScenario] = { ...currentScenarioData };
            }
            updatedScenarios[currentScenario].combinationInputs = newInputs;
            updatedScenarios[currentScenario].originalReferenceValues = newOriginalRefs;
            
            onSettingsChange({ scenarios: updatedScenarios });
            
            console.log(`✅ Auto-populated ${totalPopulated} reference values from ${data.data.source}`);
          } else {
            console.log('ℹ️ No new reference values to populate (user changes preserved)');
          }
        }
      } else {
        console.warn('⚠️ Auto-population failed:', response.statusText);
      }
    } catch (error) {
      console.error('❌ Error in auto-population:', error);
      // Don't show error toast for auto-population failures
    }
  };

  // ✅ NEW: Auto-populate reference values when combinations change
  useEffect(() => {
    console.log('🔍 useEffect triggered - combinations changed:', {
      combinationsLength: combinations.length,
      combinations: combinations.map(c => ({ id: c.id, combination_id: c.combination_id }))
    });
    
    if (combinations.length > 0) {
      console.log('🔄 Combinations changed, auto-populating reference values...');
      autoPopulateReferenceValues();
    }
  }, [combinations.length]); // Watch for combination changes

  // ✅ NEW: Auto-populate reference values when features change
  useEffect(() => {
    const selectedFeatures = computedSettings?.features?.filter(f => f.selected) || [];
    const selectedFeatureIds = selectedFeatures.map(f => f.id).sort().join(',');
    
    console.log('🔍 useEffect triggered - features changed:', {
      selectedFeaturesCount: selectedFeatures.length,
      selectedFeatures: selectedFeatures.map(f => ({ id: f.id, name: f.name })),
      selectedFeatureIds
    });
    
    if (selectedFeatures.length > 0) {
      console.log('🔄 Features changed, auto-populating reference values...');
      autoPopulateReferenceValues();
    }
  }, [computedSettings?.features?.map(f => `${f.id}:${f.selected}`).sort().join(',')]); // Watch for feature selection changes

  // ✅ NEW: Function to fetch reference values from MongoDB using GET call
  const fetchReferenceValuesFromMongo = async (overwriteExisting = false) => {
    try {
      console.log('🔄 Fetching reference values from MongoDB...');
      
      // Extract client/app/project from localStorage (same as generateModelId)
      const envStr = localStorage.getItem('env');
      if (!envStr) {
        throw new Error('No env found in localStorage for MongoDB query');
      }
      
      const env = JSON.parse(envStr);
      const client_name = env.CLIENT_NAME || 'default_client';
      const app_name = env.APP_NAME || 'default_app';
      const project_name = env.PROJECT_NAME || 'default_project';
      
      console.log('🔍 Debug - Extracted from localStorage:', { client_name, app_name, project_name });
      
      // Make GET call to retrieve reference points from MongoDB
      const response = await fetch(
        `${SCENARIO_PLANNER_API}/get-reference-points?client_name=${encodeURIComponent(client_name)}&app_name=${encodeURIComponent(app_name)}&project_name=${encodeURIComponent(project_name)}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        console.log('✅ Reference values fetched from MongoDB:', data);
        
        if (data.success && data.data) {
          // Process the MongoDB data and update the state
          const newInputs = { ...combinationInputs };
          const newOriginalRefs = { ...originalReferenceValues };
          
          // Extract reference values from MongoDB response
          const referenceData = data.data;
          
          // ✅ NEW: Extract and update reference method and period from MongoDB
          const storedStatistics = referenceData.statistic_used;
          const storedDateRange = referenceData.date_range;
          
          console.log('🔍 MongoDB stored values:', {
            storedStatistics,
            storedDateRange,
            currentReferenceMethod: settings.referenceMethod,
            currentReferencePeriod: settings.referencePeriod
          });
          
          // Update reference method and period if they exist in MongoDB
          let updatedSettings = {};
          if (storedStatistics) {
            updatedSettings.referenceMethod = storedStatistics;
            console.log('📊 Updating reference method to:', storedStatistics);
          }
          
          if (storedDateRange && storedDateRange.start_date && storedDateRange.end_date) {
            // Use the stored date range object directly
            updatedSettings.referencePeriod = {
              from: storedDateRange.start_date,
              to: storedDateRange.end_date
            };
            console.log('📅 Updating reference period to:', { 
              from: storedDateRange.start_date, 
              to: storedDateRange.end_date 
            });
          }
          
          combinations.forEach(combination => {
            if (!newInputs[combination.id]) {
              newInputs[combination.id] = {};
            }
            if (!newOriginalRefs[combination.id]) {
              newOriginalRefs[combination.id] = {};
            }
            
            // Find matching combination in MongoDB data
            // Use combination_id if available, otherwise fall back to id
            const searchKey = combination.combination_id || combination.id;
            const matchingData = referenceData.reference_values_by_combination?.[searchKey];
            
            console.log(`🔍 Looking for combination: ${searchKey}`, {
              found: !!matchingData,
              combinationId: combination.id,
              combination_id: combination.combination_id,
              searchKey,
              availableKeys: Object.keys(referenceData.reference_values_by_combination || {})
            });
            
            if (matchingData) {
              const features = computedSettings?.features || [];
              console.log(`🔍 Processing matching data for ${searchKey}:`, {
                matchingData,
                referenceValues: matchingData.reference_values,
                features: features.map(f => ({ id: f.id, name: f.name, selected: f.selected }))
              });
              
              features.forEach(feature => {
                if (feature.selected && matchingData.reference_values?.[feature.name]) {
                  const referenceValue = matchingData.reference_values[feature.name];
                  
                  console.log(`📊 Reference value for ${feature.name}:`, {
                    featureName: feature.name,
                    referenceValue,
                    type: typeof referenceValue,
                    isZero: referenceValue === 0,
                    isUndefined: referenceValue === undefined
                  });
                  
                  // Store original reference value
                  newOriginalRefs[combination.id][feature.id] = referenceValue;
                  
                  // Only populate if user doesn't have input OR if we're overwriting existing values
                  if (overwriteExisting || !combinationInputs[combination.id]?.[feature.id]?.input) {
                    newInputs[combination.id][feature.id] = {
                      input: formatToThreeDecimals(referenceValue),
                      change: '0'
                    };
                  }
                } else {
                  console.log(`⚠️ Feature ${feature.name} not selected or no reference value:`, {
                    featureName: feature.name,
                    selected: feature.selected,
                    hasReferenceValue: !!matchingData.reference_values?.[feature.name],
                    referenceValue: matchingData.reference_values?.[feature.name]
                  });
                }
              });
            }
          });
          
          // Update global state
          const updatedScenarios = { ...settings.scenarios };
          if (!updatedScenarios[currentScenario]) {
            updatedScenarios[currentScenario] = { ...currentScenarioData };
          }
          updatedScenarios[currentScenario].combinationInputs = newInputs;
          updatedScenarios[currentScenario].originalReferenceValues = newOriginalRefs;
          
          // ✅ NEW: Include updated reference method and period in settings change
          onSettingsChange({ 
            scenarios: updatedScenarios,
            ...updatedSettings
          });
          
          console.log('✅ Reference values from MongoDB processed successfully');
          console.log('🔍 Updated combinationInputs:', newInputs);
          console.log('🔍 Updated originalReferenceValues:', newOriginalRefs);
        } else {
          console.warn('⚠️ No reference data found in MongoDB response');
        }
      } else {
        throw new Error(`Failed to fetch reference values: ${response.statusText}`);
      }
    } catch (error) {
      console.error('❌ Error fetching reference values from MongoDB:', error);
      throw error;
    }
  };

  // ✅ NEW: Global refresh function for all combinations

  const handleGlobalRefresh = async () => {

    try {

      console.log('🔄 Starting global refresh for all combinations...');

      
      
      // Show confirmation toast

      toast({

        title: "Refreshing All Combinations",

        description: "Clearing inputs and resetting to reference values...",

        variant: "default",

      });



      // 1. First fetch saved reference values from MongoDB using GET call
      // This function already handles updating the state properly
      // Pass true to overwrite existing user inputs
      await fetchReferenceValuesFromMongo(true);

      // 5. Show success message

      toast({

        title: "Combinations Refreshed",

        description: `Successfully reset ${combinations.length} combinations to fresh reference values`,

        variant: "default",

      });



      console.log('✅ Global refresh completed successfully');



    } catch (error) {

      console.error('❌ Error during global refresh:', error);

      toast({

        title: "Refresh Error",

        description: "Failed to refresh combinations. Please try again.",

        variant: "destructive",

      });

    }

  };

  const handleGlobalRefreshReferenceValues = async () => {

    try {

      console.log('🔄 Starting global refresh for all combinations...');

      
      
      // Show confirmation toast

      toast({

        title: "Refreshing All Combinations",

        description: "Clearing inputs and resetting to reference values...",

        variant: "default",

      });



      // 1. First fetch fresh reference values from backend
      // This function already handles updating the state properly
      await fetchReferenceValuesForAll(true); // ✅ Pass true to overwrite existing values when method/period changes

      // 5. Show success message

      toast({

        title: "Combinations Refreshed",

        description: `Successfully reset ${combinations.length} combinations to fresh reference values`,

        variant: "default",

      });



      console.log('✅ Global refresh completed successfully');



    } catch (error) {

      console.error('❌ Error during global refresh:', error);

      toast({

        title: "Refresh Error",

        description: "Failed to refresh combinations. Please try again.",

        variant: "destructive",

      });

    }

  };


  const selectedFeatures = useMemo(() => {

    const features = computedSettings?.features || [];

    return (features || []).filter(f => f.selected) || [];

  }, [computedSettings?.features]);

  
  
  const selectedOutputs = useMemo(() => {

    const outputs = computedSettings?.outputs || [];

    return (outputs || []).filter(o => o.selected) || [];

  }, [computedSettings?.outputs]);



  // ✅ NEW: Helper functions for scenario + view specific results

  const getResultsForScenarioAndView = useMemo(() => 

    (scenarioId: string, viewId: string) => {

      return settings?.scenarios?.[scenarioId]?.viewResults?.[viewId] || null;

    }, 

    [settings?.scenarios]

  );



  const getChartDataForScenarioAndView = useMemo(() => 

    (scenarioId: string, viewId: string) => {

      const viewResults = getResultsForScenarioAndView(scenarioId, viewId);

      const currentMode = resultViewMode[viewId] || 'individual';

      console.log('📊 getChartDataForScenarioAndView called:', {

        scenarioId,

        viewId,

        currentMode,

        hasViewResults: !!viewResults,

        hasIndividuals: !!(viewResults?.individuals),

        hasFlat: !!(viewResults?.flat),

        individualsLength: viewResults?.individuals?.length || 0,

        flatKeys: viewResults?.flat ? Object.keys(viewResults.flat) : []

      });

      
      
      if (currentMode === 'individual') {

        if (!viewResults?.individuals) {

          console.log('❌ No individual results found for view:', viewId);

          return [];

        }

        console.log('✅ Processing individual results:', viewResults.individuals.length, 'items');

        // Debug: Log the first individual result to see its structure
        if (viewResults.individuals.length > 0) {
          console.log('🔍 First individual result structure:', viewResults.individuals[0]);
        }

        return viewResults.individuals.map((individualResult: any) => {
          // Debug: Log the extracted values
          const scenarioValue = individualResult.scenario?.prediction || individualResult.prediction || 0;
          const baselineValue = individualResult.baseline?.prediction || individualResult.baseline || 0;
          
          console.log('🔍 Individual result values:', {
            identifiers: individualResult.identifiers,
            scenarioValue,
            baselineValue,
            scenarioObject: individualResult.scenario,
            baselineObject: individualResult.baseline
          });

          return {
            identifiers: individualResult.identifiers || {},
            scenario: scenarioValue,
            pct_uplift: individualResult.pct_uplift?.prediction || individualResult.pct_uplift || 0,
            combinationLabel: individualResult.combinationLabel || Object.values(individualResult.identifiers || {})
            .join(', '),
            run_id: individualResult.run_id || viewResults.runId || '',
            baseline: baselineValue,
            delta: individualResult.delta?.prediction || individualResult.delta || 0,
            features: individualResult.scenario?.features || individualResult.features || {}
          };
        });

      } else {

        // Aggregated mode (shows flat results)

        if (!viewResults?.flat) {

          console.log('❌ No flat results found for view:', viewId);

          return [];

        }

        console.log('✅ Processing aggregated (flat) results:', Object.keys(viewResults.flat).length, 'identifier groups');
        
        // Process flat results - they have a different structure

        const flatData = [];

        for (const [identifierKey, identifierResults] of Object.entries(viewResults.flat)) {

          if (Array.isArray(identifierResults)) {

            identifierResults.forEach((result: any) => {
              // Debug: Log the first aggregated result to see its structure
              if (flatData.length === 0) {
                console.log('🔍 First aggregated result structure:', result);
              }

              const scenarioValue = result.scenario?.prediction || result.prediction || 0;
              const baselineValue = result.baseline?.prediction || 0;

              console.log('🔍 Aggregated result values:', {
                identifiers: result.identifiers,
                scenarioValue,
                baselineValue,
                scenarioObject: result.scenario,
                baselineObject: result.baseline
              });

              flatData.push({

                identifiers: result.identifiers || {},

                scenario: scenarioValue,

                pct_uplift: (result.pct_uplift?.prediction) || result.pct_uplift || 0,

                combinationLabel: Object.values(result.identifiers || {}).join('_ '),

                run_id: result.run_id || viewResults.runId || '',

                baseline: baselineValue,

                delta: result.delta?.prediction || 0,

                features: result.scenario?.features || {}

              });

            });

          }

        }

        console.log('✅ Flat data processed:', flatData.length, 'items');

        return flatData;

      }

    }, 

    [getResultsForScenarioAndView, resultViewMode]

  );



  const hasResultsForScenarioAndView = useMemo(() => 

    (scenarioId: string, viewId: string) => {

      const viewResults = getResultsForScenarioAndView(scenarioId, viewId);

      const currentMode = resultViewMode[viewId] || 'individual';

      
      
      if (currentMode === 'individual') {

        // ✅ CHANGED: Check for individual results

        return !!(viewResults?.individuals && viewResults.individuals.length > 0);

      } else {

        // ✅ CHANGED: Check for aggregated (flat) results

        return !!(viewResults?.flat && Object.keys(viewResults.flat).length > 0);

      }

    }, 

    [getResultsForScenarioAndView, resultViewMode]

  );



  // ✅ NEW: Monitor per-view scenario results

  useEffect(() => {

    const currentViewResults = currentScenarioData?.viewResults?.[computedSettings.selectedView];

    if (currentViewResults) {

      console.log('🎉 === VIEW-SPECIFIC RESULTS LOADED ===');

      console.log('🎯 View:', currentViewResults.viewName);

      console.log('🆔 Run ID:', currentViewResults.runId);

      console.log('📊 Models Processed:', currentViewResults.modelsProcessed);

      console.log('📁 Dataset Used:', currentViewResults.datasetUsed);

      console.log('🕒 Created At:', currentViewResults.createdAt);

      
      
      console.log('📈 Flat Results (Aggregated Mode):', currentViewResults.flat);

      console.log('🌳 Hierarchy Results (NOT DISPLAYED):', currentViewResults.hierarchy);

      console.log('👥 Individual Results (Individual Mode):', currentViewResults.individuals);

      
      
      console.log('=== VIEW RESULTS COMPLETED ===');

    }

  }, [currentScenarioData?.viewResults, computedSettings?.selectedView]);



  // Force re-render when views change

  const viewsKey = React.useMemo(() => {

    const views = computedSettings?.resultViews || [];

    return `views-${views.length}-${(views || []).map(v => `${v.id}-${v.name}`).join('-')}`;

  }, [computedSettings?.resultViews]);







  // Show placeholder when no data is loaded
  if (!computedSettings?.objectName && !settings?.objectName) {
    return (
      <div className="w-full h-full p-6 bg-gradient-to-br from-slate-50 via-indigo-50/30 to-indigo-50/50 overflow-y-auto relative">
        <div className="absolute inset-0 opacity-20">
          <svg width="80" height="80" viewBox="0 0 80 80" className="absolute inset-0 w-full h-full">
            <defs>
              <pattern id="emptyGrid" width="80" height="80" patternUnits="userSpaceOnUse">
                <path d="M 80 0 L 0 0 0 80" fill="none" stroke="rgb(148 163 184 / 0.15)" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#emptyGrid)" />
          </svg>
        </div>

        <div className="relative z-10 flex items-center justify-center h-full">
          <div className="text-center max-w-md">
            <div className="w-24 h-24 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-2xl transform rotate-3 hover:rotate-0 transition-transform duration-300">
              <RefreshCw className="w-12 h-12 text-white drop-shadow-lg" />
            </div>
            <h3 className="text-3xl font-bold text-gray-900 mb-3 bg-gradient-to-r from-indigo-500 to-indigo-600 bg-clip-text text-transparent">
              Scenario Planner Operation
            </h3>
            <p className="text-gray-600 mb-6 text-lg font-medium leading-relaxed">
              Select a data source from the properties panel to get started
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (

    <div 

      className={`flex bg-gray-50 ${isMaximized 

        ? 'fixed inset-0 z-50 h-screen w-screen' 

        : 'h-full'

      }`} 

      onKeyDown={handleKeyDown} 

      tabIndex={0}

    >

      {/* Main Canvas - Responsive Layout */}

      <div className={`flex-1 flex flex-col ${isMaximized 

        ? 'px-8 py-4 space-y-4 max-w-none overflow-auto' 

        : 'px-3 py-6 space-y-6 w-full overflow-auto min-w-0'

      }`}>

        {/* Scenario Selection */}

        <Card className={`${isMaximized ? 'p-3' : 'p-4'} shadow-sm border-gray-200`}>

          <div className="flex items-center justify-between">

            <div className="flex items-center space-x-2">

              <div className="grid p-1 bg-gray-100 rounded-lg" style={{ gridTemplateColumns: `repeat(${availableScenarios?.length || 2}, 1fr)` }}>

                {availableScenarios?.map((scenarioId, index) => (

                  <button

                    key={scenarioId}

                    onClick={() => handleScenarioClick(scenarioId)}

                    onContextMenu={(e) => handleScenarioContextMenu(e, scenarioId)}

                    className={`px-4 py-2 text-sm font-medium transition-all duration-200 min-w-[90px] h-[32px] flex items-center justify-center ${

                      settings?.selectedScenario === scenarioId

                        ? 'bg-blue-600 text-white font-semibold shadow-md transform scale-105'

                        : 'bg-transparent text-gray-600 hover:bg-gray-200 hover:text-gray-800'

                    } rounded-md`}

                    title={scenarioId !== 'scenario-1' ? `Right-click for options (rename/delete)` : 'Right-click to rename'}

                  >

                    {(() => {

                      const isEditing = editingScenario === scenarioId;

                      console.log(`🔍 TOP Render check for ${scenarioId}:`, { editingScenario, scenarioId, isEditing });

                      return isEditing;

                    })() ? (

                      <div className="flex flex-col items-center space-y-2">

                        <input

                          type="text"

                          value={tempRenameValue}

                          onChange={(e) => setTempRenameValue(e.target.value)}

                          onClick={(e) => e.stopPropagation()}

                          className="bg-white border border-blue-300 outline-none text-center w-full text-sm font-medium px-2 py-1 rounded text-black"

                          autoFocus

                          style={{ minWidth: '80px' }}

                        />

                        <div className="flex space-x-2">

                          <button

                            onClick={(e) => {

                              e.stopPropagation();

                              handleScenarioRename(scenarioId, tempRenameValue);

                            }}

                            className="px-2 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600"

                          >

                            Rename

                          </button>

                          <button

                            onClick={(e) => {

                              e.stopPropagation();

                              handleScenarioRenameCancel();

                            }}

                            className="px-2 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"

                          >

                            Cancel

                          </button>

                        </div>

                      </div>

                    ) : (

                      <span>{scenarioNames[scenarioId] || scenarioId.replace('scenario-', 'Scenario ')}</span>

                    )}

                  </button>

                ))}

              </div>

            </div>

            
            
            <div className="flex items-center space-x-2">

                         <Button 

               onClick={handleAddScenario}

               variant="outline"

               size="sm"

               className="text-sm px-4 py-2 h-[32px] bg-white border-gray-300 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-all duration-200 shadow-sm"

             >

               + Add Scenario

             </Button>

             
             
             {/* ✅ NEW: Maximize/Minimize Button */}

             <Button 

               onClick={() => setIsMaximized(!isMaximized)}

               variant="outline"

               size="sm"

               className="text-sm px-3 py-2 h-[32px] bg-white border-gray-300 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 shadow-sm"

               title={isMaximized ? "Exit Fullscreen" : "Maximize Editor"}

             >

               {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}

             </Button>

            </div>

          </div>

        </Card>






        
        {/* Main Editor Table */}

        <Card className={`${isMaximized ? 'p-3' : 'p-4'} shadow-sm border-gray-200`}>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">

            <div className={`${isMaximized ? 'max-h-[600px]' : 'max-h-[350px]'} overflow-y-auto`}>

              <div className={`overflow-x-auto ${isMaximized ? 'w-full' : 'w-full'} p-1`}>

                <table 

                  key={combinations.length + '_' + (combinations || []).map(c => c.combination_id || c.id).join('_')} 
                  className="min-w-full border-separate border-spacing-0"

                  style={{ 

                    minWidth: `${Math.max(600, 200 + (selectedFeatures?.length || 0) * 320)}px`

                  }}

                >

                <thead className="bg-gradient-to-r from-gray-50 to-gray-100 sticky top-0 z-10">

                  <tr>

                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900 border-b-2 border-r-2 border-gray-300 min-w-[250px] w-[250px] sticky left-0 z-20 bg-gradient-to-r from-gray-50 to-gray-100 shadow-sm">

                      <div className="flex items-center justify-between">

                        <div className="flex items-center space-x-2">

                          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>

                          <span>Combination</span>

                        </div>

                        {/* ✅ NEW: Global Refresh Button for Combination Section */}

                        <div className="flex items-center space-x-1">

                          <Button

                            onClick={autoPopulateReferenceValues}

                            variant="ghost"

                            size="sm"

                            className="h-6 w-6 p-0 text-green-600 hover:text-green-700 hover:bg-green-50 transition-all duration-200"

                            title="Auto-populate reference values for new combinations/features"

                          >

                            <span className="text-xs font-bold">A</span>

                          </Button>

                        <Button

                          onClick={handleGlobalRefresh}

                          variant="ghost"

                          size="sm"

                          className="h-6 w-6 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-all duration-200"

                          title="Refresh all combinations - Clear inputs and reset to reference values"

                        >

                          <RefreshCw className="w-4 h-4" />

                        </Button>

                        </div>

                      </div>

                    </th>

                    {selectedFeatures && selectedFeatures.length > 0 ? (

                      selectedFeatures.map(feature => (

                                                 <th key={feature.id} className="px-4 py-3 text-center text-sm font-semibold text-gray-900 border-b-2 border-r border-gray-300 w-80 bg-gradient-to-r from-gray-50 to-gray-100 sticky top-0 z-10">

                          <div className="mb-2 font-medium text-gray-800">{feature.name}</div>

                          <div className="grid gap-3 text-xs font-medium" style={{ gridTemplateColumns: '2fr 1fr' }}>

                            <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded">Abs</span>

                            <span className="bg-green-100 text-green-700 px-2 py-1 rounded">%</span>

                          </div>

                        </th>

                      ))

                    ) : (

                      <th className="px-4 py-3 text-center text-sm font-medium text-red-600 border-b-2 border-gray-300 bg-gradient-to-r from-red-50 to-red-100 sticky top-0 z-10 min-w-[250px] w-full">

                        <div className="flex items-center justify-center space-x-2">

                          <div className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0"></div>

                          <span className="whitespace-nowrap">No features selected</span>

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

                            <p className="text-xs text-gray-400 mt-1">Select combinations in the settings panel to get started</p>

                          </div>

                        </div>

                      </td>

                    </tr>

                  ) : combinations.length === 0 ? (
                    <tr>
                      <td colSpan={selectedFeatures?.length ? selectedFeatures.length + 1 : 1} className="text-center py-8 text-gray-500">
                        <div className="space-y-2">
                          <p>No combinations selected</p>
                          <p className="text-sm">Please select combinations in the settings panel to get started</p>
                        </div>
                      </td>
                    </tr>
                  ) : (

                    combinations.map((combination, index) => {

                      return (

                        <tr 

                          key={combination.combination_id || combination.id} 
                          className={`hover:bg-blue-50/50 border-b border-gray-200 transition-colors duration-150 cursor-pointer`}

                        >

                          <td className="px-4 py-3 text-sm text-gray-800 font-medium border-r border-gray-300 min-w-[250px] w-[250px] sticky left-0 z-20 bg-white shadow-sm">

                                                          <div className="flex items-center justify-between group">

                                <div className="space-y-1">

                                  {/* Removed unnecessary checkbox - live calculations work automatically */}

                                  <div className="text-sm font-medium text-gray-800 break-words leading-tight">
                                    {combination.combination_id || combination.id || 'Unknown Combination'}
                                          </div>

                                  <div className="text-xs text-blue-500 opacity-60 flex items-center gap-2">

                                    {loadingReference === (combination.combination_id || combination.id) ? (
                                      <span className="flex items-center gap-1">

                                        <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>

                                        Loading reference...

                                      </span>

                                    ) : loadingReference === 'all' ? (

                                      <span className="flex items-center gap-1 text-blue-600">

                                        <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>

                                        Loading...

                                      </span>

                                    ) : loadedReferenceCombinations.has(combination.id) ? (

                                      <span className="flex items-center gap-1 text-green-600">

                                        <button

                                          onClick={(e) => {

                                            e.stopPropagation();

                                            clearReferenceValues(combination.combination_id || combination.id);

                                          }}

                                          className="text-blue-500 hover:text-blue-700 text-xs"

                                          title="Refresh reference values"

                                        >

                                          <RefreshCw className="w-3 h-3" />

                                        </button>

                                      </span>

                                    ) : (

                                      <span className="flex items-center gap-1">

                                        <button

                                          onClick={(e) => {

                                            e.stopPropagation();

                                            clearReferenceValues(combination.combination_id || combination.id);

                                          }}

                                          className="text-blue-500 hover:text-blue-700 text-xs"

                                          title="Load reference values"

                                        >

                                          <RefreshCw className="w-3 h-3" />

                                        </button>

                                      </span>

                                    )}

                                  </div>

                                </div>

                              <button

                                onClick={() => handleDeleteCombination(combination.combination_id || combination.id)}

                                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-100 rounded text-red-500 hover:text-red-700"

                                title="Delete combination"

                              >

                                <Trash2 className="w-4 w-4" />

                              </button>

                            </div>

                          </td>

                          {selectedFeatures?.map(feature => {

                            return (

                              <td key={feature.id} className="px-3 py-1.5 text-sm text-center border-r border-gray-300 w-80">

                                                                  <div className="grid gap-2" style={{ gridTemplateColumns: '2fr 1fr' }}>

                                    <div className="relative">

                                      <Input 

                                       type="number" 

                                       className="h-7 text-sm border-gray-200 focus:border-blue-300 focus:ring-1 focus:ring-blue-300 transition-all duration-200 px-2 text-center pr-1"

                                       value={combinationInputs[combination.combination_id || combination.id]?.[feature.id]?.input || ''}
                                       onChange={(e) => handleInputChange(combination.combination_id || combination.id, feature.id, 'input', e.target.value)}
                                       placeholder="Abs"

                                       step="any"

                                     />

                                    </div>

                                    <div className="relative">

                                      <Input 

                                       type="number" 

                                       className="h-7 text-sm border-gray-200 focus:border-blue-300 focus:ring-1 focus:ring-blue-300 transition-all duration-200 px-2 text-center pr-1"

                                       value={combinationInputs[combination.combination_id || combination.id]?.[feature.id]?.change || ''}
                                       onChange={(e) => handleInputChange(combination.combination_id || combination.id, feature.id, 'change', e.target.value)}
                                       placeholder="%"

                                       step="any"

                                     />

                                    </div>

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

              <div className="flex flex-col items-end space-y-2">

                                <Button 

                  onClick={handleRunScenario} 

                  className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-medium px-6 py-2 shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"

                  disabled={runningScenario || 

                            !currentScenarioData?.selectedCombinations?.length || 

                            !(computedSettings.features || []).some(f => f.selected) ||

                            !settings.referenceMethod ||

                            !settings.referencePeriod?.from ||

                            !settings.referencePeriod?.to ||

                            !(

                              // Either aggregated views are configured with selections

                              (computedSettings.aggregatedViews?.length && 

                               computedSettings.aggregatedViews?.find(v => v.id === settings.selectedView)?.selectedIdentifiers &&

                               Object.values((computedSettings.aggregatedViews || []).find(v => v.id === settings.selectedView)?.selectedIdentifiers || {}).some(values => Array.isArray(values) && values.length > 0)) ||

                              // OR we have checked identifiers for fallback

                              (!computedSettings.aggregatedViews?.length && 

                               Array.isArray(computedSettings.identifiers) && (computedSettings.identifiers || []).some(identifier => (identifier.values || []).some(v => v.checked)))

                            )}

                  title={!currentScenarioData?.selectedCombinations?.length ? "No combinations available" :

                         !(computedSettings.features || []).some(f => f.selected) ? "No features selected" :

                         !settings.referenceMethod ? "No reference method set" :

                         !settings.referencePeriod?.from || !settings.referencePeriod?.to ? "Reference period incomplete" :

                         !(

                           (computedSettings.aggregatedViews?.length && 

                            computedSettings.aggregatedViews?.find(v => v.id === settings.selectedView)?.selectedIdentifiers &&

                                                           Object.values((computedSettings.aggregatedViews || []).find(v => v.id === settings.selectedView)?.selectedIdentifiers || {}).some(values => Array.isArray(values) && values.length > 0)) ||

                             (!computedSettings.aggregatedViews?.length && 

                              Array.isArray(computedSettings.identifiers) && (computedSettings.identifiers || []).some(identifier => (identifier.values || []).some(v => v.checked)))

                         ) ? "No identifiers selected for result filtering" :

                         "Run scenario"}

                >

                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">

                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />

                  </svg>

                  {runningScenario ? 'Running Scenario...' : 'Calculate Results'}

                </Button>

              </div>

            </div>






            
            {/* ✅ Scenario Results Tabs - Synchronized with top scenario selection */}

            <Tabs 

              value={currentScenario} 

              onValueChange={(scenarioId) => {

                // ✅ NEW: Sync with top scenario tabs - seamless navigation

                handleScenarioClick(scenarioId);

              }}

              className="mb-6"

            >

              <TabsList className="flex w-fit mb-4 p-1.5 bg-gray-100 rounded-lg border border-gray-200 shadow-sm">

                {availableScenarios?.map((scenarioId, index) => (

                  <TabsTrigger 

                    key={scenarioId} 

                    value={scenarioId} 

                    onContextMenu={(e) => handleScenarioContextMenu(e, scenarioId)}

                    className="text-sm font-medium data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:font-semibold data-[state=active]:shadow-md data-[state=inactive]:bg-transparent data-[state=inactive]:text-gray-700 data-[state=inactive]:hover:bg-gray-200 rounded-md transition-all duration-200 px-4 py-2"

                    title="Right-click for options"

                  >

                    <>

                      {scenarioNames[scenarioId] || scenarioId.replace('scenario-', 'Scenario ')}

                      {/* Show results indicator */}

                      {Object.keys(settings?.scenarios?.[scenarioId]?.viewResults || {}).length > 0 && (

                        <span className="ml-2 w-2 h-2 bg-green-400 rounded-full"></span>

                      )}

                    </>

                  </TabsTrigger>

                )) || []}

              </TabsList>

              
              
              {/* ✅ Scenario Content - Each scenario shows its own view tabs and results */}

              {availableScenarios?.map((scenarioId) => (

                <TabsContent key={scenarioId} value={scenarioId}>

                  <div className="space-y-4">

                    {/* ✅ View Tabs for this specific scenario */}

                    <Tabs 

                      key={`${scenarioId}-views`}

                      defaultValue={settings?.scenarios?.[scenarioId]?.selectedView || (computedSettings.aggregatedViews?.[0]?.id || 'view-1')} 

                      value={settings?.scenarios?.[scenarioId]?.selectedView || (computedSettings.aggregatedViews?.[0]?.id || 'view-1')} 

                      onValueChange={(value) => {

                        // Update this specific scenario's selected view

                        const updatedScenarios = { ...settings.scenarios };

                        if (!updatedScenarios[scenarioId]) {

                          updatedScenarios[scenarioId] = {};

                        }

                        updatedScenarios[scenarioId] = {

                          ...updatedScenarios[scenarioId],

                          selectedView: value

                        };

                        onSettingsChange({ scenarios: updatedScenarios });

                      }}

                    >

              <TabsList className="flex w-fit p-1.5 bg-gray-100 rounded-lg border border-gray-200 shadow-sm">

                {/* ✅ FIXED: Use dynamic aggregatedViews instead of hardcoded array */}

                {(computedSettings.aggregatedViews || ['view-1', 'view-2', 'view-3']).map((view) => {

                  const viewId = typeof view === 'string' ? view : view.id;

                  const viewDisplayName = getViewDisplayName(view);

                  
                  
                  return (

                    <TabsTrigger 

                      key={viewId} 

                      value={viewId} 

                      className="text-sm font-medium data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:font-semibold data-[state=active]:shadow-md data-[state=inactive]:bg-transparent data-[state=inactive]:text-gray-700 data-[state=inactive]:hover:bg-gray-200 rounded-md transition-all duration-200 px-4 py-2"

                    >

                      {viewDisplayName}

                    </TabsTrigger>

                  );

                })}

              </TabsList>

              
              
                      {/* ✅ View Content for this specific scenario */}

                      {(computedSettings.aggregatedViews || ['view-1', 'view-2', 'view-3']).map((view) => {

                        const viewId = typeof view === 'string' ? view : view.id;

                        const chartData = getChartDataForScenarioAndView(scenarioId, viewId);
                        const viewResults = getResultsForScenarioAndView(scenarioId, viewId);
                        const hasResults = hasResultsForScenarioAndView(scenarioId, viewId);
                        

                        
                        
                        return (

                          <TabsContent key={viewId} value={viewId} className="mt-4">

                            {hasResults ? (

                              <div className="space-y-6">

                                {/* ✅ Individual Results Chart for this scenario + view */}

                                {chartData.length > 0 && (

                                  <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">

                                    <div className="mb-4">

                                      <div className="flex items-center justify-between">

                                        <div></div>

                                        <div className="text-right">

                                          {/* ✅ NEW: Toggle buttons for switching between individual/aggregated results and data label types */}

                                          <div className="flex gap-2 mb-2">

                                          <button

                                            onClick={() => toggleResultViewMode(viewId)}

                                              className="px-3 py-1.5 text-xs bg-blue-100 border border-blue-400 hover:bg-blue-200 hover:border-blue-500 hover:text-blue-700 transition-all duration-200 font-medium rounded-md flex items-center gap-2"

                                          >

                                            <div className="flex flex-col gap-0.5">

                                              <div className="w-3 h-0.5 bg-current rounded-full"></div>

                                              <div className="w-3 h-0.5 bg-current rounded-full"></div>

                                              <div className="w-3 h-0.5 bg-current rounded-full"></div>

                                            </div>

                                            {resultViewMode[viewId] === 'aggregated' ? 'Show Individual' : 'Show Aggregate'}

                                          </button>

                                            <button

                                              onClick={() => toggleDataLabelType(viewId)}

                                              className="px-3 py-1.5 text-xs bg-green-100 border border-green-400 hover:bg-green-200 hover:border-green-500 hover:text-green-700 transition-all duration-200 font-medium rounded-md flex items-center gap-2"

                                            >

                                              <div className="flex flex-col gap-0.5">

                                                <div className="w-3 h-0.5 bg-current rounded-full"></div>

                                                <div className="w-3 h-0.5 bg-current rounded-full"></div>

                                                <div className="w-3 h-0.5 bg-current rounded-full"></div>

                                              </div>

                                              {dataLabelType[viewId] === 'uplift' ? `Show ${viewResults.yVariable || 'Value'}` : 'Show Uplift'}

                                            </button>

                                          </div>

                                        </div>

                                      </div>

                                    </div>

                                    <div className="w-full overflow-x-auto">
                                    <ScenarioResultsChart 

                                      data={chartData} 

                                      width={900} 

                                      height={450}

                                      viewMode={resultViewMode[viewId] || 'individual'}

                                      dataLabelType={(() => {
                                        const type = dataLabelType[viewId] || 'y-values';
                                        console.log('🔍 Passing dataLabelType to chart:', type, 'for viewId:', viewId);
                                        return type;
                                      })()}

                                      showDataLabels={(() => {
                                        const show = showDataLabels[viewId] || false;
                                        console.log('🔍 Passing showDataLabels to chart:', show, 'for viewId:', viewId);
                                        return show;
                                      })()}

                                      onDataLabelsToggle={(enabled) => {
                                        setShowDataLabels(prev => ({
                                          ...prev,
                                          [viewId]: enabled
                                        }));
                                      }}

                                      yVariable={viewResults.yVariable}

                                      xAxisLabel={getViewDisplayName(view)}

                                      viewSelectedIdentifiers={view?.selectedIdentifiers || {}}

                                    />
                                  </div>

                                  </div>

                                )}

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

                                    <h4 className="text-xl font-semibold text-gray-800">

                                      {scenarioId.replace('scenario-', 'Scenario ')} - {viewId.replace('view-', 'View ')}

                                    </h4>

                                    <p className="text-gray-600">Configure identifiers for this view and run scenario to see results</p>

                                    <div className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2 inline-block">

                                      <p className="text-sm text-gray-700 font-medium">

                                        No results yet - configure and run scenario

                                      </p>

                                    </div>

                                  </div>

                                </div>

                              </div>

                            )}

                          </TabsContent>

                        );

                      })}

                    </Tabs>

                  </div>

                </TabsContent>

              ))}

            </Tabs>

          </div>

        </Card>

      </div>



      {/* ✅ NEW: Context Menu for Scenario Actions */}

      {contextMenu && (

        <div 

          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-2 min-w-[160px]"

          style={{

            left: contextMenu.x,

            top: contextMenu.y,

          }}

        >

          <button

            onClick={() => handleContextMenuAction('rename')}

            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 flex items-center gap-2"

          >

            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">

              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />

            </svg>

            Rename

          </button>

          
          
          {contextMenu.scenarioId !== 'scenario-1' && (

            <button

              onClick={() => handleContextMenuAction('delete')}

              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 hover:text-red-700 flex items-center gap-2"

            >

              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">

                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />

              </svg>

              Delete

            </button>

          )}

        </div>

      )}



      {/* ✅ NEW: Click outside to close context menu */}

      {contextMenu && (

        <div 

          className="fixed inset-0 z-40" 

          onClick={closeContextMenu}

        />

      )}

    </div>

  );

};