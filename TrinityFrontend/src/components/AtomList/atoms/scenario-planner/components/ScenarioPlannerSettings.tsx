import React, { useState, useEffect } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronDown, ChevronRight, GripVertical, Plus, X, RefreshCw } from 'lucide-react';
import { ScenarioPlannerSettings as SettingsType } from '@/components/LaboratoryMode/store/laboratoryStore';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { SCENARIO_PLANNER_API } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface ScenarioPlannerSettingsProps {
  data: SettingsType;
  onDataChange: (newData: Partial<SettingsType>) => void;
  onCacheInitialized?: (d0_key: string) => void;
}

interface AggregatedView {
  id: string;
  name: string;
  identifierOrder: string[];
  selectedIdentifiers: Record<string, string[]>;
}

// Sortable Identifier Component
interface SortableIdentifierProps {
  identifierId: string;
  identifier: any;
  view: AggregatedView;
  onUpdateOrder: (viewId: string, newOrder: string[]) => void;
  onToggleIdentifierSelection: (viewId: string, identifierId: string, valueId: string) => void;
  onDataChange: (newData: Partial<SettingsType>) => void;
  data: SettingsType;
}

const SortableIdentifier: React.FC<SortableIdentifierProps> = ({
  identifierId,
  identifier,
  view,
  onUpdateOrder,
  onToggleIdentifierSelection,
  onDataChange,
  data
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: identifierId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  // Get the current order index
  const orderIndex = view.identifierOrder.indexOf(identifierId) + 1;

  return (
    <Card 
      ref={setNodeRef} 
      style={style} 
      className={`p-2 ${isDragging ? 'shadow-lg border-blue-300 bg-blue-50' : 'border-gray-200'} transition-all duration-200`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <div
            {...attributes}
            {...listeners}
            className={`cursor-move p-1.5 rounded border transition-colors ${
              isDragging 
                ? 'bg-blue-100 border-blue-400 shadow-sm' 
                : 'hover:bg-blue-50 border-gray-200 hover:border-blue-300'
            }`}
            title="Drag to reorder"
          >
            <GripVertical className={`h-4 w-4 transition-colors ${
              isDragging ? 'text-blue-600' : 'text-gray-500 hover:text-blue-600'
            }`} />
          </div>
          <div className="flex items-center space-x-2">
            <span className={`text-xs font-medium px-2 py-1 rounded-full transition-colors ${
              isDragging 
                ? 'bg-blue-200 text-blue-800' 
                : 'bg-blue-100 text-blue-800'
            }`}>
              {orderIndex}
            </span>
            <span className="font-medium text-sm">{identifier.name}</span>
          </div>
        </div>
      </div>
      
      {/* Identifier Values with Clustering-Style Dropdown */}
      <div className="space-y-2">

        
        {/* Clustering-Style Dropdown for Values */}
        <Select
          onValueChange={(value) => {
            if (value === "All") {
              const allValueIds = identifier.values.map((value: any) => value.id);
              onToggleIdentifierSelection(view.id, identifierId, "All");
            }
          }}
        >
          <SelectTrigger className="bg-white border border-gray-300 hover:border-gray-400 transition-colors w-full h-8 px-2">
            <span className="text-xs text-gray-700">
              {(() => {
                const selectedCount = (view.selectedIdentifiers[identifierId] || []).length;
                const totalCount = identifier.values.length;
                if (selectedCount === 0) return "None";
                if (selectedCount === totalCount) return "All values";
                return `${selectedCount} selected`;
              })()}
            </span>
          </SelectTrigger>
          <SelectContent className="w-64 max-h-80">
            <div className="p-3 space-y-2">
              <div className="text-sm font-medium text-gray-700 mb-3 border-b pb-2">
                Select values for {identifier.name.charAt(0).toUpperCase() + identifier.name.slice(1)}
              </div>
              
              {/* Select All option */}
              <div className="flex items-center space-x-3 p-2 hover:bg-gray-100 rounded cursor-pointer"
                   onClick={() => {
                     const currentSelected = view.selectedIdentifiers[identifierId] || [];
                     const allValueIds = identifier.values.map((value: any) => value.id);
                     if (currentSelected.length === allValueIds.length) {
                       // Deselect all
                       onToggleIdentifierSelection(view.id, identifierId, "clearAll");
                     } else {
                       // Select all
                       onToggleIdentifierSelection(view.id, identifierId, "selectAll");
                     }
                   }}>
                <input
                  type="checkbox"
                  checked={(view.selectedIdentifiers[identifierId] || []).length === identifier.values.length}
                  onChange={() => {
                    const currentSelected = view.selectedIdentifiers[identifierId] || [];
                    const allValueIds = identifier.values.map((value: any) => value.id);
                    if (currentSelected.length === allValueIds.length) {
                      // Deselect all
                      onToggleIdentifierSelection(view.id, identifierId, "clearAll");
                    } else {
                      // Select all
                      onToggleIdentifierSelection(view.id, identifierId, "selectAll");
                    }
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 checked:bg-blue-600 checked:border-blue-600"
                />
                <span className="text-sm font-medium">
                  {(view.selectedIdentifiers[identifierId] || []).length === identifier.values.length 
                    ? 'Deselect All' 
                    : 'Select All'}
                </span>
              </div>
              
              <div className="border-t pt-2">
                {/* Individual value options with checkboxes */}
                                  {identifier.values && Array.isArray(identifier.values) ? identifier.values.map((value: any) => (
                  <div key={value.id} className="flex items-center space-x-2 p-2 hover:bg-gray-100 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(view.selectedIdentifiers[identifierId] || []).includes(value.id)}
                      onChange={() => {
                        onToggleIdentifierSelection(view.id, identifierId, value.id);
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 checked:bg-blue-600 checked:border-blue-600"
                    />
                    <span className="text-xs">{value.name}</span>
                  </div>
                )) : null}
              </div>
            </div>
          </SelectContent>
        </Select>
        

      </div>
    </Card>
  );
};

export const ScenarioPlannerSettings: React.FC<ScenarioPlannerSettingsProps> = ({ data, onDataChange, onCacheInitialized }) => {
  const { toast } = useToast();
  
  // API state
  const [loadingIdentifiers, setLoadingIdentifiers] = useState(false);
  const [loadingFeatures, setLoadingFeatures] = useState(false);
  
  // Read identifiers and features from shared store (data prop)
  const backendIdentifiers = data.backendIdentifiers || null;
  const backendFeatures = data.backendFeatures || null;
  
  // Debug logging to see data flow
  console.log('Settings Component - Data from store:', {
    backendIdentifiers: !!backendIdentifiers,
    backendFeatures: !!backendFeatures,
    identifiersCount: backendIdentifiers?.identifier_columns?.length || 0,
    featuresCount: backendFeatures?.all_unique_features?.length || 0
  });
  
  const [openSections, setOpenSections] = useState({
    identifier1: true,
    identifier2: true,
    identifier3: false,
    identifier4: false,
    referenceValue: true,
    referencePeriod: true,
    features: true,
    output: true,
    aggregatedViews: true,
    referenceSettings: true,
    combinationSelection: true,
  });

  // State for managing aggregated views
  const [aggregatedViews, setAggregatedViews] = useState<AggregatedView[]>([
    {
      id: 'view-1',
      name: 'View 1',
      identifierOrder: ['identifier-1', 'identifier-2'],
      selectedIdentifiers: {
        'identifier-1': ['1a', '1b'],
        'identifier-2': ['2a']
      }
    },
    {
      id: 'view-2',
      name: 'View 2',
      identifierOrder: ['identifier-3'],
      selectedIdentifiers: {
        'identifier-3': ['3a']
      }
    },
    {
      id: 'view-3',
      name: 'View 3',
      identifierOrder: ['identifier-4'],
      selectedIdentifiers: {
        'identifier-4': ['4a']
      }
    }
  ]);

  // State for managing identifier filters (clustering-style)
  const [identifierFilters, setIdentifierFilters] = useState<Record<string, string[]>>({});
  const [uniqueValues, setUniqueValues] = useState<Record<string, string[]>>({});
  const [loadingValues, setLoadingValues] = useState<Record<string, boolean>>({});

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // API functions
  const initializeCache = async (d0_key: string, force_refresh: boolean = false) => {
    try {
      const response = await fetch(`${SCENARIO_PLANNER_API}/init-cache?d0_key=${encodeURIComponent(d0_key)}&force_refresh=${force_refresh}`, {
        method: 'GET'
      });
      if (response.ok) {
        const data = await response.json();
        toast({
          title: "Cache Initialized",
          description: `Dataset cached successfully: ${data.action}`,
          variant: "default",
        });
        // After successful cache init, fetch identifiers and features
        await fetchIdentifiers();
        await fetchFeatures();
        
        // Notify parent component that cache is initialized
        if (onCacheInitialized) {
          onCacheInitialized(d0_key);
        }
        
        return data;
      } else {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Failed to initialize cache: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error initializing cache:', error);
      toast({
        title: "Cache Error",
        description: error instanceof Error ? error.message : "Failed to initialize cache",
        variant: "destructive",
      });
      throw error;
    }
  };

  const fetchIdentifiers = async () => {
    try {
      setLoadingIdentifiers(true);
      const response = await fetch(`${SCENARIO_PLANNER_API}/identifiers`);
      if (response.ok) {
        const data = await response.json();
        // Store in shared store instead of local state
        onDataChange({ backendIdentifiers: data });
        toast({
          title: "Success",
          description: `Loaded ${data.total_combinations} model combinations`,
          variant: "default",
        });
      } else {
        throw new Error(`Failed to fetch identifiers: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error fetching identifiers:', error);
      toast({
        title: "Error",
        description: "Failed to load identifiers from backend",
        variant: "destructive",
      });
    } finally {
      setLoadingIdentifiers(false);
    }
  };

  const fetchFeatures = async () => {
    try {
      setLoadingFeatures(true);
      const response = await fetch(`${SCENARIO_PLANNER_API}/features`);
      if (response.ok) {
        const data = await response.json();
        // Store in shared store instead of local state
        onDataChange({ backendFeatures: data });
        toast({
          title: "Success",
          description: `Loaded ${data.all_unique_features?.length || 0} features`,
          variant: "default",
        });
      } else {
        throw new Error(`Failed to fetch features: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error fetching features:', error);
      toast({
        title: "Error",
        description: "Failed to load features from backend",
        variant: "destructive",
      });
    } finally {
      setLoadingFeatures(false);
    }
  };

  // Don't auto-fetch on mount - wait for cache initialization from input files
  // useEffect(() => {
  //   fetchIdentifiers();
  //   fetchFeatures();
  // }, []);

  // Sync backend data with frontend settings when data changes
  useEffect(() => {
    console.log('🔄 Sync useEffect triggered:', {
      hasBackendIdentifiers: !!backendIdentifiers,
      hasBackendFeatures: !!backendFeatures,
      identifierColumns: backendIdentifiers?.identifier_columns,
      allFeatures: backendFeatures?.all_unique_features
    });

    if (backendIdentifiers && backendFeatures && 
        backendIdentifiers.identifier_columns && 
        backendFeatures.all_unique_features) {
      
      try {
        console.log('📊 Backend data available, creating new identifiers and features...');
        
        // Update identifiers based on backend data
        const newIdentifiers = backendIdentifiers.identifier_columns.map((column: string, index: number) => ({
          id: column, // Use actual column name as ID instead of generic identifier-X
          name: column,
          values: (backendIdentifiers.identifier_values?.[column] || []).map((value: string, valueIndex: number) => ({
            id: value, // Use actual value as ID instead of generic Xa, Xb, etc.
            name: value,
            checked: false
          }))
        }));

        // Update features based on backend data
        const newFeatures = backendFeatures.all_unique_features.map((feature: string, index: number) => ({
          id: `feature-${index + 1}`,
          name: feature,
          selected: index < 4 // Select first 4 features by default
        }));

        console.log('✅ New identifiers created:', newIdentifiers);
        console.log('✅ New features created:', newFeatures);

        // Only update if we have new data and it's actually different to prevent infinite loop
        const currentIdentifiers = data.identifiers || [];
        const currentFeatures = data.features || [];
        
        const identifiersChanged = JSON.stringify(newIdentifiers) !== JSON.stringify(currentIdentifiers);
        const featuresChanged = JSON.stringify(newFeatures) !== JSON.stringify(currentFeatures);
        
        if (newIdentifiers.length > 0 && newFeatures.length > 0 && (identifiersChanged || featuresChanged)) {
          console.log('🚀 Calling onDataChange to update store...');
          onDataChange({
            identifiers: newIdentifiers,
            features: newFeatures
          });
          console.log('✅ Store updated successfully!');
        } else {
          console.log('⏭️ Data unchanged, skipping update');
        }
      } catch (error) {
        console.error('❌ Error syncing backend data:', error);
      }
    } else {
      console.log('⏳ Waiting for backend data...', {
        backendIdentifiers: backendIdentifiers,
        backendFeatures: backendFeatures
      });
    }
  }, [backendIdentifiers, backendFeatures]); // Remove onDataChange from dependencies to prevent infinite loop

  // Regenerate combinations when identifiers change (after backend sync)
  useEffect(() => {
    if (data.identifiers && data.identifiers.length > 0) {
      console.log('🔄 Identifiers changed, regenerating combinations...');
      console.log('Current identifiers:', data.identifiers);
      
      // Check if these are real identifiers from backend (not dummy ones)
      const hasRealIdentifiers = data.identifiers.some(id => 
        id.name && id.name !== 'Identifier 1' && id.name !== 'Identifier 2'
      );
      
      if (hasRealIdentifiers) {
        console.log('✅ Real identifiers detected, regenerating combinations...');
        const newCombinations = generateCombinationsFromIdentifiers(data.identifiers);
        console.log('🆕 New combinations generated:', newCombinations);
        
        // Only update if combinations are actually different to prevent infinite loop
        if (JSON.stringify(newCombinations) !== JSON.stringify(data.combinations)) {
          console.log('🔄 Combinations changed, updating store...');
          onDataChange({ combinations: newCombinations });
        } else {
          console.log('⏭️ Combinations unchanged, skipping update');
        }
      } else {
        console.log('⏳ Waiting for real identifiers from backend...');
      }
    }
  }, [data.identifiers]); // Remove onDataChange from dependencies to prevent infinite loop

  // Initialize filters when aggregated views change
  useEffect(() => {
    if (aggregatedViews && Array.isArray(aggregatedViews)) {
      try {
        const allIdentifiers = new Set<string>();
        aggregatedViews.forEach(view => {
          if (view && view.identifierOrder && Array.isArray(view.identifierOrder)) {
            view.identifierOrder.forEach(identifierId => {
              if (identifierId) {
                allIdentifiers.add(identifierId);
              }
            });
          }
        });

        setIdentifierFilters(prev => {
          const newFilters: Record<string, string[]> = {};
          allIdentifiers.forEach(identifierId => {
            if (identifierId in prev) {
              newFilters[identifierId] = prev[identifierId];
            } else {
              newFilters[identifierId] = [];
            }
          });
          return newFilters;
        });
      } catch (error) {
        console.error('Error initializing filters:', error);
      }
    }
  }, [aggregatedViews]);

  // Initialize unique values from data.identifiers
  useEffect(() => {
    if (data.identifiers && Array.isArray(data.identifiers)) {
      try {
        const newUniqueValues: Record<string, string[]> = {};
        data.identifiers.forEach(identifier => {
          if (identifier && identifier.id && identifier.values && Array.isArray(identifier.values)) {
            newUniqueValues[identifier.id] = identifier.values.map(value => value.id).filter(Boolean);
          }
        });
        setUniqueValues(newUniqueValues);
      } catch (error) {
        console.error('Error initializing unique values:', error);
      }
    }
  }, [data.identifiers]);

  // Sync aggregatedViews with main resultViews settings
  useEffect(() => {
    if (data.resultViews && Array.isArray(data.resultViews) && data.resultViews.length > 0) {
      try {
        // Convert resultViews to aggregatedViews format
        const syncedViews = data.resultViews.map(view => ({
          id: view.id || `view-${Date.now()}`,
          name: view.name || 'Unnamed View',
          identifierOrder: [],
          selectedIdentifiers: {}
        }));
        setAggregatedViews(syncedViews);
      } catch (error) {
        console.error('Error syncing aggregated views:', error);
      }
    }
  }, [data.resultViews]);

  // Helper function to capitalize first letter
  const capitalizeFirstLetter = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  // Add new view
  const addView = () => {
    const newViewId = `view-${aggregatedViews.length + 1}`;
    const newView = {
      id: newViewId,
      name: `View ${aggregatedViews.length + 1}`,
      identifierOrder: [],
      selectedIdentifiers: {}
    };
    
    // Update local state
    setAggregatedViews([...aggregatedViews, newView]);
    
    // Sync with main settings - add to resultViews
    const newResultView = {
      id: newViewId,
      name: `View ${aggregatedViews.length + 1}`,
      selectedCombinations: []
    };
    
    const updatedResultViews = [...(data.resultViews || []), newResultView];
    onDataChange({ resultViews: updatedResultViews });
  };

  // Remove view
  const removeView = (viewId: string) => {
    if (aggregatedViews.length > 1) {
      // Update local state
      setAggregatedViews(aggregatedViews.filter(view => view.id !== viewId));
      
      // Sync with main settings - remove from resultViews
      const updatedResultViews = (data.resultViews || []).filter(view => view.id !== viewId);
      onDataChange({ resultViews: updatedResultViews });
      
      // If the removed view was selected, switch to view-1
      if (data.selectedView === viewId) {
        onDataChange({ selectedView: 'view-1' });
      }
    }
  };

  // Update identifier order (drag and drop)
  const updateIdentifierOrder = (viewId: string, newOrder: string[]) => {
    setAggregatedViews(prev => prev.map(view => 
      view.id === viewId ? { ...view, identifierOrder: newOrder } : view
    ));
  };

  // Toggle identifier selection
  const toggleIdentifierSelection = (viewId: string, identifierId: string, valueId: string) => {
    setAggregatedViews(prev => prev.map(view => {
      if (view.id === viewId) {
        let newSelected: string[];
        
        if (valueId === "selectAll") {
          // Select all values for this identifier
          const identifier = data.identifiers.find(id => id.id === identifierId);
          newSelected = identifier ? identifier.values.map(v => v.id) : [];
        } else if (valueId === "clearAll") {
          // Clear all values for this identifier
          newSelected = [];
        } else {
          // Toggle individual value
          const currentSelected = view.selectedIdentifiers[identifierId] || [];
          newSelected = currentSelected.includes(valueId)
            ? currentSelected.filter(id => id !== valueId)
            : [...currentSelected, valueId];
        }
        
        return {
          ...view,
          selectedIdentifiers: {
            ...view.selectedIdentifiers,
            [identifierId]: newSelected
          }
        };
      }
      return view;
    }));
  };

  // Handle drag end for reordering identifiers
  const handleDragEnd = (event: DragEndEvent, viewId: string) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      setAggregatedViews(prev => prev.map(view => {
        if (view.id === viewId) {
          const oldIndex = view.identifierOrder.indexOf(active.id as string);
          const newIndex = view.identifierOrder.indexOf(over?.id as string);
          
          const newOrder = arrayMove(view.identifierOrder, oldIndex, newIndex);
          
          return {
            ...view,
            identifierOrder: newOrder
          };
        }
        return view;
      }));
    }
  };

  // Handle identifier filter changes (clustering-style)
  const handleIdentifierFilterChange = (identifier: string, values: string[]) => {
    setIdentifierFilters(prev => ({
      ...prev,
      [identifier]: values
    }));
  };

  // Handle select all values for an identifier
  const handleSelectAllValues = (identifier: string) => {
    const allValues = uniqueValues[identifier] || [];
    handleIdentifierFilterChange(identifier, allValues);
  };

  // Handle clear all values for an identifier
  const handleClearAllValues = (identifier: string) => {
    handleIdentifierFilterChange(identifier, []);
  };

  // Select all values for an identifier
  const selectAllIdentifierValues = (identifierId: string) => {
    const updatedIdentifiers = data.identifiers.map(identifier => {
      if (identifier.id === identifierId) {
        return {
          ...identifier,
          values: identifier.values.map(value => ({ ...value, checked: true }))
        };
      }
      return identifier;
    });
    
    const updatedCombinations = generateCombinationsFromIdentifiers(updatedIdentifiers);
    onDataChange({ 
      identifiers: updatedIdentifiers,
      combinations: updatedCombinations
    });
  };

  // Deselect all values for an identifier
  const deselectAllIdentifierValues = (identifierId: string) => {
    const updatedIdentifiers = data.identifiers.map(identifier => {
      if (identifier.id === identifierId) {
        return {
          ...identifier,
          values: identifier.values.map(value => ({ ...value, checked: false }))
        };
      }
      return identifier;
    });
    
    const updatedCombinations = generateCombinationsFromIdentifiers(updatedIdentifiers);
    onDataChange({ 
      identifiers: updatedIdentifiers,
      combinations: updatedCombinations
    });
  };

  const generateCombinationsFromIdentifiers = (identifiers: any[]) => {
    const selectedValues = identifiers
      .filter(identifier => identifier.values.some((value: any) => value.checked))
      .map(identifier => ({
        id: identifier.id,
        name: identifier.name,
        values: identifier.values.filter((value: any) => value.checked)
      }))
      .filter(identifier => identifier.values.length > 0);

    if (selectedValues.length === 0) {
      return [];
    }

    const generateCombinations = (arrays: any[], index = 0, current: any[] = []): any[] => {
      if (index === arrays.length) {
        return [current.slice()];
      }

      const combinations: any[] = [];
      for (const value of arrays[index]) {
        current[index] = value;
        combinations.push(...generateCombinations(arrays, index + 1, current));
      }
      return combinations;
    };

    const valueArrays = selectedValues.map(identifier => identifier.values);
    
    const combinations = generateCombinations(valueArrays);

    const finalCombinations = combinations.map((combination, index) => {
      // Create a descriptive name for the combination
      const combinationName = combination.map((value: any, valueIndex: number) => 
        `${selectedValues[valueIndex].name}: ${value.name}`
      ).join(' × ');
      
      return {
        id: `combination-${index + 1}`,
        identifiers: combination.map((value: any, valueIndex: number) => 
          `${selectedValues[valueIndex].id}:${value.id}` // Use colon separator for better parsing
        ),
      values: Object.fromEntries(
        data.features.filter(f => f.selected).map(feature => [
          feature.id,
          {
            input: 0,
            change: 0,
            reference: Math.round(Math.random() * 100 + 50)
          }
        ])
      )
      };
    });
    
    return finalCombinations;
  };

  const toggleIdentifierValue = (identifierId: string, valueId: string) => {
    const updatedIdentifiers = data.identifiers.map(identifier => {
      if (identifier.id === identifierId) {
        return {
          ...identifier,
          values: identifier.values.map(value => 
            value.id === valueId ? { ...value, checked: !value.checked } : value
          )
        };
      }
      return identifier;
    });
    
    // Generate new combinations based on updated identifiers
    const updatedCombinations = generateCombinationsFromIdentifiers(updatedIdentifiers);
    
         // Update both identifiers and combinations together
    const updateData = { 
       identifiers: updatedIdentifiers,
       combinations: updatedCombinations
    };
    
    onDataChange(updateData);
  };

  const selectAllFeatures = () => {
    const updatedFeatures = data.features.map(feature => ({ ...feature, selected: true }));
    onDataChange({ features: updatedFeatures });
  };

  const deselectAllFeatures = () => {
    const updatedFeatures = data.features.map(feature => ({ ...feature, selected: false }));
    onDataChange({ features: updatedFeatures });
  };

  const toggleOutput = (outputId: string) => {
    const updatedOutputs = data.outputs.map(output =>
      output.id === outputId ? { ...output, selected: !output.selected } : output
    );
    onDataChange({ outputs: updatedOutputs });
  };

  const toggleFeature = (featureId: string) => {
    const updatedFeatures = data.features.map(feature =>
      feature.id === featureId ? { ...feature, selected: !feature.selected } : feature
    );
    onDataChange({ features: updatedFeatures });
  };

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Filter identifiers to only show those with unique values > 1 (clustering-style)
  const filteredIdentifiers = data.identifiers.filter(identifier => {
    const count = uniqueValues[identifier.id]?.length || 0;
    return count > 1;
  });

  // Debug logging for current identifiers
  console.log('🎯 Current identifiers in render:', {
    identifiers: data.identifiers,
    backendIdentifiers: backendIdentifiers,
    backendFeatures: backendFeatures,
    filteredIdentifiers: filteredIdentifiers
  });

  return (
    <div className="h-full">
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">

          {/* Combination Selection Box */}
          <Card className="p-2">
            <Collapsible open={openSections.combinationSelection} onOpenChange={() => toggleSection('combinationSelection')}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded-md">
                <span className="font-medium text-sm">Combination Selection</span>
                {openSections.combinationSelection ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
            </CollapsibleTrigger>
            <CollapsibleContent className="px-2 py-1">
                <div className="space-y-2">
          {data.identifiers && Array.isArray(data.identifiers) ? data.identifiers.map((identifier, index) => (
                    <Card key={identifier.id} className="p-0.5">
            <Collapsible 
                        open={openSections[`identifier${index + 1}` as keyof typeof openSections] as boolean} 
              onOpenChange={() => toggleSection(`identifier${index + 1}`)}
            >
                        <CollapsibleTrigger className="flex items-center justify-between w-full p-0.5 hover:bg-gray-50 rounded-md">
                          <span className="font-medium text-sm">{identifier.name}</span>
                          {openSections[`identifier${index + 1}` as keyof typeof openSections] ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
              </CollapsibleTrigger>
              <CollapsibleContent className="px-2 py-2">
                          <div className="space-y-2">
                            {/* Select All / Deselect All Checkbox */}
                            <div className="flex items-center space-x-2">
                              <Checkbox 
                                id={`select-all-${identifier.id}`}
                                checked={identifier.values.every(value => value.checked)}
                                onCheckedChange={(checked) => {
                                  if (checked === true) {
                                    selectAllIdentifierValues(identifier.id);
                                  } else {
                                    deselectAllIdentifierValues(identifier.id);
                                  }
                                }}
                                className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 data-[state=checked]:text-white data-[state=indeterminate]:bg-blue-400 data-[state=indeterminate]:border-blue-400"
                                ref={(el) => {
                                  if (el) {
                                    // Set indeterminate state when some items are selected
                                    (el as HTMLInputElement).indeterminate = identifier.values.some(value => value.checked) && !identifier.values.every(value => value.checked);
                                  }
                                }}
                              />
                                                              <label htmlFor={`select-all-${identifier.id}`} className="text-sm font-medium cursor-pointer">
                                  Select All
                                </label>
                            </div>
                            
                            {/* Individual Checkboxes */}
                <div className="space-y-2">
                  {identifier.values && Array.isArray(identifier.values) ? identifier.values.map(value => (
                    <div key={value.id} className="flex items-center space-x-2">
                      <Checkbox 
                        id={value.id}
                        checked={value.checked}
                        onCheckedChange={(checked) => {
                                      if (checked === true || checked === false) {
                            toggleIdentifierValue(identifier.id, value.id);
                          }
                        }}
                        className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 data-[state=checked]:text-white"
                      />
                      <label htmlFor={value.id} className="text-sm text-foreground cursor-pointer">
                        {value.name}
                      </label>
                    </div>
                  )) : null}
                            </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
                    </Card>
                  )) : null}
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Reference Settings Box */}
          <Card className="p-2">
            <Collapsible open={openSections.referenceSettings} onOpenChange={() => toggleSection('referenceSettings')}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded-md">
                <span className="font-medium text-sm">Reference Settings</span>
                {openSections.referenceSettings ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
              )}
              </CollapsibleTrigger>
              <CollapsibleContent className="px-2 py-2">
                <div className="space-y-4">
          {/* Reference Value */}
          <Collapsible open={openSections.referenceValue} onOpenChange={() => toggleSection('referenceValue')}>
                    <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded-md">
                                              <span className="font-medium text-sm">Reference Method</span>
                      {openSections.referenceValue ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
            </CollapsibleTrigger>
            <CollapsibleContent className="px-2 py-2">
              <div className="space-y-2">
                        {data.referenceMethod && (
                <div className="flex items-center space-x-2">
                            <Checkbox 
                              id="reference-mean"
                              checked={data.referenceMethod === "mean"}
                              onCheckedChange={(checked) => {
                                if (checked === true) {
                                  onDataChange({ referenceMethod: "mean" });
                                }
                              }}
                              className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 data-[state=checked]:text-white"
                            />
                            <label htmlFor="reference-mean" className="text-sm text-foreground cursor-pointer">
                              Mean
                            </label>
                </div>
                        )}
                        {data.referenceMethod && (
                <div className="flex items-center space-x-2">
                            <Checkbox 
                              id="reference-median"
                              checked={data.referenceMethod === "median"}
                              onCheckedChange={(checked) => {
                                if (checked === true) {
                                  onDataChange({ referenceMethod: "median" });
                                }
                              }}
                              className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 data-[state=checked]:text-white"
                            />
                            <label htmlFor="reference-median" className="text-sm text-foreground cursor-pointer">
                              Median
                            </label>
                </div>
                        )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Reference Period */}
          <Collapsible open={openSections.referencePeriod} onOpenChange={() => toggleSection('referencePeriod')}>
                    <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded-md">
                                              <span className="font-medium text-sm">Reference Period</span>
                      {openSections.referencePeriod ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
            </CollapsibleTrigger>
            <CollapsibleContent className="px-2 py-2">
                      <div className="text-sm text-gray-600">
                        From: {data.referencePeriod?.from || 'N/A'}<br/>
                        To: {data.referencePeriod?.to || 'N/A'}
                </div>
                    </CollapsibleContent>
                  </Collapsible>
              </div>
            </CollapsibleContent>
          </Collapsible>
          </Card>

          {/* Features Selection Box */}
          <Card className="p-2">
          <Collapsible open={openSections.features} onOpenChange={() => toggleSection('features')}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded-md">
                <span className="font-medium text-sm">Features Selection</span>
                {openSections.features ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
            </CollapsibleTrigger>
            <CollapsibleContent className="px-2 py-2">
                <div className="space-y-3">
                  {/* Select All / Deselect All Checkbox */}
                  <div className="flex items-center space-x-2">
                    <Checkbox 
                      id="select-all-features"
                      checked={data.features.every(feature => feature.selected)}
                      onCheckedChange={(checked) => {
                        if (checked === true) {
                          selectAllFeatures();
                        } else {
                          deselectAllFeatures();
                        }
                      }}
                      className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 data-[state=checked]:text-white data-[state=indeterminate]:bg-blue-400 data-[state=indeterminate]:border-blue-400"
                      ref={(el) => {
                        if (el) {
                          // Set indeterminate state when some features are selected
                          (el as HTMLInputElement).indeterminate = data.features.some(feature => feature.selected) && !data.features.every(feature => feature.selected);
                        }
                      }}
                    />
                    <label htmlFor="select-all-features" className="text-sm font-medium cursor-pointer">
                      Select All
                    </label>
                  </div>
                  
                  {/* Individual Feature Checkboxes */}
              <div className="space-y-2">
                {data.features && Array.isArray(data.features) ? data.features.map(feature => (
                  <div key={feature.id} className="flex items-center space-x-2">
                        <Checkbox 
                          id={feature.id}
                          checked={feature.selected}
                          onCheckedChange={() => toggleFeature(feature.id)}
                          className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 data-[state=checked]:text-white"
                        />
                        <label htmlFor={feature.id} className="text-sm text-foreground cursor-pointer">
                          {feature.name}
                        </label>
                  </div>
                )) : null}
                  </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
          </Card>

          {/* Output Selection Box */}
          <Card className="p-2">
          <Collapsible open={openSections.output} onOpenChange={() => toggleSection('output')}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded-md">
                <span className="font-medium text-sm">Output Selection</span>
                {openSections.output ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
            </CollapsibleTrigger>
            <CollapsibleContent className="px-2 py-2">
              <div className="space-y-2">
                {data.outputs && Array.isArray(data.outputs) ? data.outputs.map(output => (
                  <div key={output.id} className="flex items-center space-x-2">
                      <Checkbox 
                        id={output.id}
                        checked={output.selected}
                        onCheckedChange={() => toggleOutput(output.id)}
                        className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 data-[state=checked]:text-white"
                      />
                      <label htmlFor={output.id} className="text-sm text-foreground cursor-pointer">
                        {output.name}
                      </label>
                  </div>
                )) : null}
              </div>
            </CollapsibleContent>
          </Collapsible>
          </Card>

          {/* Aggregated Views Box */}
          <Card className="p-3">
          <Collapsible open={openSections.aggregatedViews} onOpenChange={() => toggleSection('aggregatedViews')}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded-md">
                <span className="font-medium text-sm">Aggregated Views</span>
                {openSections.aggregatedViews ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
            </CollapsibleTrigger>
            <CollapsibleContent className="px-2 py-2">
                <div className="space-y-1">
                  {aggregatedViews && Array.isArray(aggregatedViews) ? aggregatedViews.map(view => (
                    <Card key={view.id} className="p-1">
                      <Collapsible defaultOpen={view.id === 'view-1'}>
                        <CollapsibleTrigger className="flex items-center justify-between w-full p-1.5 hover:bg-gray-50 rounded-md">
                          <span className="font-medium text-xs">{view.name}</span>
                          <div className="flex items-center space-x-1">
                            <ChevronDown className="h-3 w-3 text-gray-500" />
                          <Button 
                            variant="ghost" 
                            size="sm" 
                              onClick={(e) => {
                                e.stopPropagation();
                                removeView(view.id);
                              }}
                              className="text-red-500 hover:text-red-700 h-6 w-6 p-0"
                            >
                              <X className="h-3 w-3" />
                          </Button>
                        </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="px-1.5 py-1.5">
                      
                                            {/* Dynamic Identifier Selection Dropdown */}
                      <div className="mb-2">
                        <div className="space-y-2">
                          {/* Identifier Selection Dropdown */}
                          <div className="relative">
                            <Select
                              onValueChange={(value) => {
                                if (value === "selectAll") {
                                  // Select all identifiers
                                  const newOrder = filteredIdentifiers.map(id => id.id);
                                  const newSelectedIdentifiers: Record<string, string[]> = {};
                                  filteredIdentifiers.forEach(identifier => {
                                    newSelectedIdentifiers[identifier.id] = [];
                                  });
                                  setAggregatedViews(prev => prev.map(v => 
                                    v.id === view.id ? {
                                      ...v,
                                      identifierOrder: newOrder,
                                      selectedIdentifiers: newSelectedIdentifiers
                                    } : v
                                  ));
                                } else if (value === "clearAll") {
                                  // Clear all identifiers
                                  setAggregatedViews(prev => prev.map(v => 
                                    v.id === view.id ? {
                                      ...v,
                                      identifierOrder: [],
                                      selectedIdentifiers: {}
                                    } : v
                                  ));
                                }
                              }}
                            >
                              <SelectTrigger className="bg-white border border-gray-300 hover:border-gray-400 transition-colors w-full h-8 px-2">
                                <span className="text-xs text-gray-700">
                                  {(() => {
                                    const selectedCount = view.identifierOrder.length;
                                    const totalCount = filteredIdentifiers.length;
                                    if (selectedCount === 0) return "Select identifiers";
                                    if (selectedCount === totalCount) return "All identifiers selected";
                                    return `${selectedCount} of ${totalCount} identifiers selected`;
                                  })()}
                                </span>
                              </SelectTrigger>
                              <SelectContent className="w-64 max-h-80">
                                <div className="p-3 space-y-2">
                                  <div className="text-sm font-medium text-gray-700 mb-3 border-b pb-2">
                                    Select identifiers for {view.name}
                                  </div>
                                  
                                  {/* Select All / Clear All options */}
                                  <div className="flex items-center space-x-3 p-2 hover:bg-gray-100 rounded cursor-pointer"
                                       onClick={() => {
                                         const currentSelected = view.identifierOrder.length;
                                         const totalCount = filteredIdentifiers.length;
                                         if (currentSelected === totalCount) {
                                           // Clear all
                                           setAggregatedViews(prev => prev.map(v => 
                                             v.id === view.id ? {
                                               ...v,
                                               identifierOrder: [],
                                               selectedIdentifiers: {}
                                             } : v
                                           ));
                                         } else {
                                           // Select all
                                           const newOrder = filteredIdentifiers.map(id => id.id);
                                           const newSelectedIdentifiers: Record<string, string[]> = {};
                                           filteredIdentifiers.forEach(identifier => {
                                             newSelectedIdentifiers[identifier.id] = [];
                                           });
                                           setAggregatedViews(prev => prev.map(v => 
                                             v.id === view.id ? {
                                               ...v,
                                               identifierOrder: newOrder,
                                               selectedIdentifiers: newSelectedIdentifiers
                                             } : v
                                           ));
                                         }
                                       }}>
                                    <input
                                      type="checkbox"
                                      checked={view.identifierOrder.length === filteredIdentifiers.length}
                                      onChange={() => {
                                         const currentSelected = view.identifierOrder.length;
                                         const totalCount = filteredIdentifiers.length;
                                         if (currentSelected === totalCount) {
                                           // Clear all
                                           setAggregatedViews(prev => prev.map(v => 
                                             v.id === view.id ? {
                                               ...v,
                                               identifierOrder: [],
                                               selectedIdentifiers: {}
                                             } : v
                                           ));
                                         } else {
                                           // Select all
                                           const newOrder = filteredIdentifiers.map(id => id.id);
                                           const newSelectedIdentifiers: Record<string, string[]> = {};
                                           filteredIdentifiers.forEach(identifier => {
                                             newSelectedIdentifiers[identifier.id] = [];
                                           });
                                           setAggregatedViews(prev => prev.map(v => 
                                             v.id === view.id ? {
                                               ...v,
                                               identifierOrder: newOrder,
                                               selectedIdentifiers: newSelectedIdentifiers
                                             } : v
                                           ));
                                         }
                                       }}
                                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 checked:bg-blue-600 checked:border-blue-600"
                                    />
                                    <span className="text-sm font-medium">
                                      {view.identifierOrder.length === filteredIdentifiers.length 
                                        ? 'Clear All' 
                                        : 'Select All'}
                                    </span>
                                  </div>
                                  
                                  <div className="border-t pt-2">
                                    {/* Individual identifier options with checkboxes */}
                                    {filteredIdentifiers.map((identifier) => (
                                      <div key={identifier.id} className="flex items-center space-x-2 p-2 hover:bg-gray-100 rounded cursor-pointer">
                                        <input
                                          type="checkbox"
                                          checked={view.identifierOrder.includes(identifier.id)}
                                          onChange={() => {
                                            if (view.identifierOrder.includes(identifier.id)) {
                                              // Remove identifier from view
                                              const newOrder = view.identifierOrder.filter(id => id !== identifier.id);
                                              const newSelectedIdentifiers = { ...view.selectedIdentifiers };
                                              delete newSelectedIdentifiers[identifier.id];
                                              
                                              setAggregatedViews(prev => prev.map(v => 
                                                v.id === view.id ? {
                                                  ...v,
                                                  identifierOrder: newOrder,
                                                  selectedIdentifiers: newSelectedIdentifiers
                                                } : v
                                              ));
                                            } else {
                                              // Add identifier to view
                                              const newOrder = [...view.identifierOrder, identifier.id];
                                              setAggregatedViews(prev => prev.map(v => 
                                                v.id === view.id ? { 
                                                  ...v, 
                                                  identifierOrder: newOrder,
                                                  selectedIdentifiers: {
                                                    ...v.selectedIdentifiers,
                                                    [identifier.id]: []
                                                  }
                                                } : v
                                              ));
                                            }
                                          }}
                                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 checked:bg-blue-600 checked:border-blue-600"
                                        />
                                        <span className="text-xs">{identifier.name}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </SelectContent>
                            </Select>
                          </div>
                          
                          {/* Selected Identifiers Section - Only show when there are selected identifiers */}
                          {view.identifierOrder.length > 0 && (
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <h4 className="text-xs font-medium text-gray-700">Selected Identifiers:</h4>
                                <span className="text-xs text-gray-500">
                                  {view.identifierOrder.length} identifier{view.identifierOrder.length !== 1 ? 's' : ''}
                                </span>
                              </div>
                              <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={(event) => handleDragEnd(event, view.id)}
                              >
                                <SortableContext
                                  items={view.identifierOrder}
                                  strategy={verticalListSortingStrategy}
                                >
                                  <div className="space-y-2">
                                    {view.identifierOrder.map((identifierId, index) => {
                                      const identifier = data.identifiers.find(id => id.id === identifierId);
                                      if (!identifier) return null;
                                      
                                      return (
                                        <SortableIdentifier
                                          key={identifierId}
                                          identifierId={identifierId}
                                          identifier={identifier}
                                          view={view}
                                          onUpdateOrder={updateIdentifierOrder}
                                          onToggleIdentifierSelection={toggleIdentifierSelection}
                                          onDataChange={onDataChange}
                                          data={data}
                                        />
                                      );
                                    })}
                                  </div>
                                </SortableContext>
                              </DndContext>
                            </div>
                          )}
                        </div>
                      </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </Card>
                  )) : null}
                  
                  <Button variant="outline" size="sm" onClick={addView} className="text-xs w-full py-1.5">
                    <Plus className="h-3 w-3 mr-1" /> Add View
                  </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
          </Card>
        </div>
      </ScrollArea>
    </div>
  );
};