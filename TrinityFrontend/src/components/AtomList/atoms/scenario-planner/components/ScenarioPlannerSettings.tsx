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
import { generateModelId } from '../utils/scenarioPlannerUtils';
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
              const allValueIds = (identifier.values || []).map((value: any) => value.id);
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
                     const allValueIds = (identifier.values || []).map((value: any) => value.id);
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
                                         const allValueIds = (identifier.values || []).map((value: any) => value.id);
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
  const [loadingCombinations, setLoadingCombinations] = useState(false);
  const [loadingYVariable, setLoadingYVariable] = useState(false);
  const [yVariableInfo, setYVariableInfo] = useState<{
    y_variable: string;
    model_info: any;
    models_count: number;
    message: string;
  } | null>(null);
  
  // Date range state
  const [dateRange, setDateRange] = useState<{
    start_date: string;
    end_date: string;
  } | null>(null);
  const [loadingDateRange, setLoadingDateRange] = useState(false);
  
  // Function to fetch date range from backend
  const fetchDateRange = async () => {
    try {
      setLoadingDateRange(true);
      const modelId = generateModelId();
      const response = await fetch(`${SCENARIO_PLANNER_API}/get-date-range?model_id=${encodeURIComponent(modelId)}`);
      
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          setDateRange({
            start_date: result.data.start_date,
            end_date: result.data.end_date
          });
          
          // Auto-populate reference period if not set
          if (!data.referencePeriod?.from || !data.referencePeriod?.to) {
            onDataChange({
              referencePeriod: {
                from: result.data.start_date,
                to: result.data.end_date
              }
            });
          }
        }
      }
    } catch (error) {
      console.error('Error fetching date range:', error);
    } finally {
      setLoadingDateRange(false);
    }
  };
  
  // Removed unused refs to simplify the solution
  
  // Fetch date range on component mount
  useEffect(() => {
    fetchDateRange();
  }, []);

  // Read identifiers, features, and combinations from shared store (data prop)
  const backendIdentifiers = data.backendIdentifiers || null;
  const backendFeatures = data.backendFeatures || null;
  const backendCombinations = data.backendCombinations || null;
  
  // Debug logging to see data flow
  console.log('Settings Component - Data from store:', {
    backendIdentifiers: !!backendIdentifiers,
    backendFeatures: !!backendFeatures,
    backendCombinations: !!backendCombinations,
    identifiersCount: backendIdentifiers?.identifier_columns?.length || 0,
    featuresCount: backendFeatures?.all_unique_features?.length || 0,
    combinationsCount: backendCombinations?.total_combinations || 0,
    hasIdentifiers: !!data.identifiers?.length,
    hasFeatures: !!data.features?.length,
    hasCombinations: !!data.combinations?.length,
    // ✅ NEW: Check if data is real or dummy
    hasRealData: data.identifiers?.some(id => 
      id.name && id.name !== 'Identifier 1' && id.name !== 'Identifier 2'
    ) || false,
    selectedCombinations: data.selectedCombinations?.length || 0,
    fullDataObject: data,
    dataBackendCombinations: data.backendCombinations
  });
  
  // ✅ NEW: Debug backendCombinations specifically
  console.log('🔍 backendCombinations debug:', {
    exists: !!backendCombinations,
    type: typeof backendCombinations,
    combinations: backendCombinations?.combinations,
    total_combinations: backendCombinations?.total_combinations,
    fullObject: backendCombinations
  });

  // Restore state from store when component mounts or data changes
  useEffect(() => {
    console.log('🔄 Settings: Checking for state restoration...');
    
    if (backendIdentifiers && backendFeatures) {
      console.log('✅ Settings: Backend data available, checking if state needs restoration');
      
      // Check if we need to restore identifiers and features from backend data
      const needsRestoration = !data.identifiers?.length || !data.features?.length;
      
      if (needsRestoration) {
        console.log('🔄 Settings: Restoring state from backend data...');
        // The sync useEffect will handle this automatically
      } else {
        console.log('✅ Settings: State already restored, no action needed');
      }
    } else {
      console.log('⏳ Settings: Waiting for backend data...');
    }
  }, [backendIdentifiers, backendFeatures, data.identifiers, data.features]);
  
  // ✅ FIXED: Prevent unnecessary data clearing when switching tabs
  useEffect(() => {
    console.log('🔄 Settings: Component mounted/updated, checking data persistence...');
    
    // If we have existing data, preserve it
    if (data.identifiers?.length && data.features?.length) {
      console.log('✅ Settings: Existing data found, preserving state');
      return; // Don't clear existing data
    }
    
    // Only clear if we have no data at all
    if (!data.identifiers?.length && !data.features?.length) {
      console.log('⚠️ Settings: No existing data, this is a fresh start');
    }
  }, []); // Only run on mount
  
  // ✅ IMPROVED: Prevent unnecessary backend data fetching if we already have real data
  useEffect(() => {
    if (backendIdentifiers && backendFeatures) {
      // ✅ FIXED: Check if we already have meaningful data (not dummy data from default settings)
      const hasRealData = data.identifiers?.some(id => 
        id.name && 
        // Check for dummy identifiers from default settings
        id.name !== 'Identifier 1' && 
        id.name !== 'Identifier 2' && 
        id.name !== 'Identifier 3' && 
        id.name !== 'Identifier 4' &&
        id.name !== 'identifier-1' && 
        id.name !== 'identifier-2' &&
        id.name !== 'identifier-3' &&
        id.name !== 'identifier-4' &&
        !id.name.startsWith('Identifier') && // Generic check
        !id.name.startsWith('identifier-') && // Generic check
        // Check for dummy values
        !id.values?.some(val => 
          val.name && (
            val.name.startsWith('Identifier 1-') ||
            val.name.startsWith('Identifier 2-') ||
            val.name.startsWith('Identifier 3-') ||
            val.name.startsWith('Identifier 4-') ||
            val.name.startsWith('1a') ||
            val.name.startsWith('2a') ||
            val.name.startsWith('3a') ||
            val.name.startsWith('4a')
          )
        )
      );
      
      if (hasRealData) {
        console.log('✅ Settings: Real data already exists, skipping backend sync');
        return; // Don't overwrite existing real data
      }
      
      console.log('🔄 Settings: No real data exists, backend sync will proceed');
    }
      }, [backendIdentifiers, backendFeatures, data.identifiers]);
    
    // ✅ FIXED: Only auto-refresh when reference settings actually change (not on tab switch)
    useEffect(() => {
      // Only trigger if we have real data and reference values are already loaded
      const hasRealData = data.identifiers?.some(id => 
        id.name && 
        id.name !== 'Identifier 1' && 
        id.name !== 'Identifier 2' && 
        id.name !== 'Identifier 3' && 
        id.name !== 'Identifier 4' &&
        id.name !== 'identifier-1' && 
        id.name !== 'identifier-2' &&
        id.name !== 'identifier-3' &&
        id.name !== 'identifier-4' &&
        !id.name.startsWith('Identifier') && 
        !id.name.startsWith('identifier-')
      );
      
      // ✅ FIXED: Only trigger if reference settings actually changed, not just on mount
      // Initialize lastReference values if they don't exist
      const hasLastValues = data.lastReferenceMethod && data.lastReferencePeriod;
      const referenceMethodChanged = hasLastValues && data.referenceMethod !== data.lastReferenceMethod;
      const referencePeriodChanged = hasLastValues && (
        data.referencePeriod?.from !== data.lastReferencePeriod?.from ||
        data.referencePeriod?.to !== data.lastReferencePeriod?.to
      );
      
      // ✅ DEBUG: Log reference period comparison
      console.log('🔍 Reference period change detection:', {
        currentMethod: data.referenceMethod,
        lastMethod: data.lastReferenceMethod,
        methodChanged: referenceMethodChanged,
        currentPeriod: data.referencePeriod,
        lastPeriod: data.lastReferencePeriod,
        periodChanged: referencePeriodChanged,
        hasRealData,
        combinationsCount: data.combinations?.length || 0
      });
      
      if (hasRealData && data.combinations?.length > 0 && (referenceMethodChanged || referencePeriodChanged)) {
        console.log('🔄 Reference settings actually changed, triggering auto-refresh of reference values');
        console.log('Changes detected:', { referenceMethodChanged, referencePeriodChanged });
        
        // Notify parent component to refresh reference values
        if (onDataChange) {
          onDataChange({
            lastReferenceMethod: data.referenceMethod,
            lastReferencePeriod: data.referencePeriod
          });
        }
      } else if (hasRealData && data.combinations?.length > 0) {
        console.log('✅ No reference settings changed, skipping auto-refresh to preserve user input');
        
        // ✅ NEW: Initialize last values if they don't exist but we have current values
        if (!hasLastValues && data.referenceMethod && data.referencePeriod && onDataChange) {
          console.log('🔧 Initializing last reference values for future change detection');
          onDataChange({
            lastReferenceMethod: data.referenceMethod,
            lastReferencePeriod: data.referencePeriod
          });
        }
      }
    }, [data.referenceMethod, data.referencePeriod, data.identifiers, data.combinations]); // Removed onDataChange to prevent infinite loops
    
  
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

  // State for managing aggregated views - will be populated from backend data
  const [aggregatedViews, setAggregatedViews] = useState<AggregatedView[]>([]);

  // State for managing identifier filters (clustering-style)
  const [identifierFilters, setIdentifierFilters] = useState<Record<string, string[]>>({});
  const [uniqueValues, setUniqueValues] = useState<Record<string, string[]>>({});
  const [loadingValues, setLoadingValues] = useState<Record<string, boolean>>({});

  // ✅ FIXED: Initialize aggregatedViews from global store data
  useEffect(() => {
    if (data.aggregatedViews && Array.isArray(data.aggregatedViews) && data.aggregatedViews.length > 0) {
      console.log('🔄 Settings: Initializing aggregatedViews from global store:', data.aggregatedViews);
      setAggregatedViews(data.aggregatedViews);
    } else if (data.scenarios && data.selectedScenario && data.scenarios[data.selectedScenario]?.aggregatedViews) {
      // Fallback to scenario-specific aggregatedViews
      const scenarioViews = data.scenarios[data.selectedScenario].aggregatedViews;
      if (Array.isArray(scenarioViews) && scenarioViews.length > 0) {
        console.log('🔄 Settings: Initializing aggregatedViews from scenario-specific data:', scenarioViews);
        setAggregatedViews(scenarioViews);
      }
    }
  }, [data.aggregatedViews, data.scenarios, data.selectedScenario]);

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
      const modelId = generateModelId();
      const response = await fetch(`${SCENARIO_PLANNER_API}/init-cache?d0_key=${encodeURIComponent(d0_key)}&model_id=${encodeURIComponent(modelId)}&force_refresh=${force_refresh}`, {
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
      const modelId = generateModelId();
      const response = await fetch(`${SCENARIO_PLANNER_API}/identifiers?model_id=${encodeURIComponent(modelId)}`);
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
      const modelId = generateModelId();
      const response = await fetch(`${SCENARIO_PLANNER_API}/features?model_id=${encodeURIComponent(modelId)}`);
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

  // ✅ NEW: Fetch combinations from backend
  const fetchCombinations = async () => {
    try {
      setLoadingCombinations(true);
      const modelId = generateModelId();
      const response = await fetch(`${SCENARIO_PLANNER_API}/combinations?model_id=${encodeURIComponent(modelId)}`);
      if (response.ok) {
        const data = await response.json();
        console.log('🔍 fetchCombinations - Received data:', data);
        console.log('🔍 fetchCombinations - Combinations array:', data.combinations);
        // Store combinations in shared store
        onDataChange({ backendCombinations: data });
        console.log('🔍 fetchCombinations - Called onDataChange with:', { backendCombinations: data });
        toast({
          title: "Success",
          description: `Loaded ${data.total_combinations || 0} combinations`,
          variant: "default",
        });
      } else {
        throw new Error(`Failed to fetch combinations: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error fetching combinations:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch combinations",
        variant: "destructive",
      });
    } finally {
      setLoadingCombinations(false);
    }
  };

  // ✅ NEW: Fetch y_variable information from backend
  const fetchYVariableInfo = async () => {
    try {
      setLoadingYVariable(true);
      const modelId = generateModelId();
      const response = await fetch(`${SCENARIO_PLANNER_API}/y-variable?model_id=${encodeURIComponent(modelId)}`);
      if (response.ok) {
        const data = await response.json();
        console.log('🎯 fetchYVariableInfo - Received data:', data);
        setYVariableInfo(data);
        toast({
          title: "Target Variable Loaded",
          description: data.message || `Target variable: ${data.y_variable}`,
          variant: "default",
        });
      } else {
        throw new Error(`Failed to fetch y_variable info: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error fetching y_variable info:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to fetch target variable info",
        variant: "destructive",
      });
    } finally {
      setLoadingYVariable(false);
    }
  };

  // ✅ FIXED: Auto-fetch backend data on mount if not already loaded
  useEffect(() => {
    // Only fetch if we don't have backend data yet
    if (!backendIdentifiers || !backendFeatures || !backendCombinations) {
      console.log('🔄 Auto-fetching backend data on mount...');
      fetchIdentifiers();
      fetchFeatures();
      fetchCombinations();
    } else {
      console.log('✅ Backend data already available, skipping auto-fetch');
    }
    
    // Always fetch y_variable info as it's independent
    if (!yVariableInfo) {
      console.log('🎯 Auto-fetching y_variable info on mount...');
      fetchYVariableInfo();
    }
  }, []); // Only run on mount

  // ✅ SIMPLE LOG: Check if backend data is being received
  useEffect(() => {
    console.log('🔍 Backend Data Status:', {
      hasIdentifiers: !!backendIdentifiers,
      hasFeatures: !!backendFeatures,
      hasCombinations: !!backendCombinations,
      identifiersCount: backendIdentifiers?.identifier_columns?.length || 0,
      featuresCount: backendFeatures?.all_unique_features?.length || 0,
      combinationsCount: backendCombinations?.total_combinations || 0
    });
  }, [backendIdentifiers, backendFeatures, backendCombinations]);

  // ✅ SIMPLE LOG: Check if reference values are being received
  useEffect(() => {
    console.log('🔍 Reference Values Status:', {
      hasReferenceData: !!data.originalReferenceValues,
      referenceValuesCount: Object.keys(data.originalReferenceValues || {}).length,
      sampleReferenceData: Object.keys(data.originalReferenceValues || {}).slice(0, 2) // Show first 2 keys
    });
  }, [data.originalReferenceValues]);

  // ✅ FIXED: Sync backend data with frontend settings when data changes
  useEffect(() => {
    // ✅ SIMPLIFIED: No more dummy data checks - always sync when backend data is available
    if (data.identifiers && data.identifiers.length > 0) {
      // Continue with sync to ensure backend data is properly integrated
    } else {
      // Backend sync will proceed to load data
    }

    if (backendIdentifiers && backendFeatures && 
        backendIdentifiers.identifier_columns && 
        backendFeatures.all_unique_features) {
      
      try {
        // Update identifiers based on backend data
        const newIdentifiers = (backendIdentifiers.identifier_columns || []).map((column: string, index: number) => ({
          id: column, // Use actual column name as ID instead of generic identifier-X
          name: column,
          values: (backendIdentifiers.identifier_values?.[column] || []).map((value: string, valueIndex: number) => ({
            id: value, // Use actual value as ID instead of generic Xa, Xb, etc.
            name: value,
            checked: false
          }))
        }));

        // Update features based on backend data
        const newFeatures = (backendFeatures.all_unique_features || []).map((feature: string, index: number) => ({
          id: `feature-${index + 1}`,
          name: feature,
          selected: index < 3// Select first 3 features by default
        }));

        // ✅ IMPROVED: Only update if we have new data and it's actually different to prevent infinite loop
        const currentIdentifiers = data.identifiers || [];
        const currentFeatures = data.features || [];
        
        const identifiersChanged = JSON.stringify(newIdentifiers) !== JSON.stringify(currentIdentifiers);
        const featuresChanged = JSON.stringify(newFeatures) !== JSON.stringify(currentFeatures);
        
        if (newIdentifiers.length > 0 && newFeatures.length > 0 && (identifiersChanged || featuresChanged)) {
          // ✅ FIXED: Update both global data and current scenario data
          const updateData: Partial<SettingsType> = {
            identifiers: newIdentifiers,
            features: newFeatures
          };
          
          // Also update the current scenario's data if we have scenario-specific structure
          if (data.scenarios && data.selectedScenario) {
            const updatedScenarios = { ...data.scenarios };
            if (updatedScenarios[data.selectedScenario]) {
              updatedScenarios[data.selectedScenario] = {
                ...updatedScenarios[data.selectedScenario],
                identifiers: newIdentifiers,
                features: newFeatures
              };
              updateData.scenarios = updatedScenarios;
            }
          }
          
          onDataChange(updateData);
        }
      } catch (error) {
        console.error('❌ Error syncing backend data:', error);
      }
    } else {
      // ✅ NEW: If we have backend data but it's not being used, force a sync
      if (backendIdentifiers && backendFeatures && (!data.identifiers || data.identifiers.length === 0)) {
        // This will trigger the sync logic in the next render cycle
      }
    }
  }, [backendIdentifiers, backendFeatures, data.identifiers]); // ✅ FIXED: Removed data.features - features shouldn't trigger combination regeneration


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
            newUniqueValues[identifier.id] = (identifier.values || []).map(value => value.id).filter(Boolean);
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
      const syncedViews = (data.resultViews || []).map(view => ({
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

     // ✅ NEW: Initialize aggregated views when backend identifiers are loaded
   useEffect(() => {
     if (data.identifiers && data.identifiers.length > 0 && aggregatedViews.length === 0) {
       console.log('🔄 Initializing aggregated views with backend identifiers:', data.identifiers);
       
       // Create default aggregated views with real backend identifiers and default selections
       const defaultViews: AggregatedView[] = [
         {
           id: 'view-1',
           name: 'View 1',
           identifierOrder: data.identifiers.slice(0, 2).map(id => id.id),
           selectedIdentifiers: (() => {
             const selections: Record<string, string[]> = {};
             // Add all available values for first 2 identifiers as default
             data.identifiers.slice(0, 2).forEach(identifier => {
               if (identifier.values && identifier.values.length > 0) {
                 selections[identifier.id] = identifier.values.map(v => v.id);
               }
             });
             return selections;
           })()
         },
         {
           id: 'view-2',
           name: 'View 2', 
           identifierOrder: data.identifiers.slice(0, 1).map(id => id.id),
           selectedIdentifiers: (() => {
             const selections: Record<string, string[]> = {};
             // Add all available values for first identifier as default
             if (data.identifiers.length > 0) {
               const identifier = data.identifiers[0];
               if (identifier.values && identifier.values.length > 0) {
                 selections[identifier.id] = identifier.values.map(v => v.id);
               }
             }
             return selections;
           })()
         },
         {
           id: 'view-3',
           name: 'View 3',
           identifierOrder: data.identifiers.slice(1, 2).map(id => id.id),
           selectedIdentifiers: (() => {
             const selections: Record<string, string[]> = {};
             // Add all available values for second identifier as default
             if (data.identifiers.length > 1) {
               const identifier = data.identifiers[1];
               if (identifier.values && identifier.values.length > 0) {
                 selections[identifier.id] = identifier.values.map(v => v.id);
               }
             }
             return selections;
           })()
         }
       ];
       
       console.log('🔄 Created default aggregated views with selections:', defaultViews);
       setAggregatedViews(defaultViews);
     }
   }, [data.identifiers, aggregatedViews.length]);

     // ✅ NEW: Save aggregatedViews to both global store and scenario-specific data
   useEffect(() => {
     if (aggregatedViews && aggregatedViews.length > 0) {
       console.log('🔄 Saving aggregatedViews to global store and scenario-specific data:', aggregatedViews);
       console.log('🔄 Current aggregatedViews selectedIdentifiers:', 
         aggregatedViews.map(view => ({
           id: view.id,
           name: view.name,
           selectedIdentifiers: view.selectedIdentifiers,
           identifierOrder: view.identifierOrder
         }))
       );
       
       // Save to global store
       onDataChange({ aggregatedViews: aggregatedViews });
       
       // ✅ NEW: Also save to scenario-specific data if we're in a scenario context
       if (data.selectedScenario) {
         const updatedScenarios = { ...data.scenarios };
         if (!updatedScenarios[data.selectedScenario]) {
           updatedScenarios[data.selectedScenario] = {};
         }
         
         updatedScenarios[data.selectedScenario] = {
           ...updatedScenarios[data.selectedScenario],
           aggregatedViews: aggregatedViews
         };
         
         console.log('🔄 Updated scenario-specific aggregatedViews for:', data.selectedScenario);
         
         // Save scenario-specific data
         onDataChange({ 
           aggregatedViews: aggregatedViews,
           scenarios: updatedScenarios
         });
       }
     }
   }, [aggregatedViews]); // ✅ FIXED: Removed onDataChange to prevent infinite loop

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
    
    console.log('🔄 Adding new view:', newView);
    console.log('🔄 Current aggregatedViews count:', aggregatedViews.length);
    
    // Update local state
    setAggregatedViews([...aggregatedViews, newView]);
    
    // Sync with main settings - add to resultViews
    const newResultView = {
      id: newViewId,
      name: `View ${aggregatedViews.length + 1}`,
      selectedCombinations: []
    };
    
    const updatedResultViews = [...(data.resultViews || []), newResultView];
    
    // ✅ NEW: Also update scenario-specific aggregatedViews if we're in a scenario context
    const updatedScenarios = { ...data.scenarios };
    if (data.selectedScenario && updatedScenarios[data.selectedScenario]) {
      updatedScenarios[data.selectedScenario] = {
        ...updatedScenarios[data.selectedScenario],
        aggregatedViews: [...(updatedScenarios[data.selectedScenario].aggregatedViews || []), newView]
      };
      console.log('🔄 Updated scenario-specific aggregatedViews for:', data.selectedScenario);
    }
    
    onDataChange({ 
      resultViews: updatedResultViews,
      scenarios: updatedScenarios
    });
    
    console.log('🔄 Updated resultViews count:', updatedResultViews.length);
  };

    // Remove view
  const removeView = (viewId: string) => {
    if (aggregatedViews.length > 1) {
      // Update local state
      setAggregatedViews((aggregatedViews || []).filter(view => view.id !== viewId));
      
      // Sync with main settings - remove from resultViews
      const updatedResultViews = (data.resultViews || []).filter(view => view.id !== viewId);
      
      // ✅ NEW: Also update scenario-specific aggregatedViews if we're in a scenario context
      const updatedScenarios = { ...data.scenarios };
      if (data.selectedScenario && updatedScenarios[data.selectedScenario]) {
        updatedScenarios[data.selectedScenario] = {
          ...updatedScenarios[data.selectedScenario],
          aggregatedViews: (updatedScenarios[data.selectedScenario].aggregatedViews || []).filter(view => view.id !== viewId)
        };
        console.log('🔄 Removed view from scenario-specific aggregatedViews for:', data.selectedScenario);
      }
      
      onDataChange({ 
        resultViews: updatedResultViews,
        scenarios: updatedScenarios
      });
      
      // If the removed view was selected, switch to view-1
      if (data.selectedView === viewId) {
        onDataChange({ selectedView: 'view-1' });
      }
    }
  };

  // Update identifier order (drag and drop)
  const updateIdentifierOrder = (viewId: string, newOrder: string[]) => {
    console.log('🔄 Updating identifier order for view:', viewId, 'new order:', newOrder);
    setAggregatedViews(prev => prev.map(view => 
      view.id === viewId ? { ...view, identifierOrder: newOrder } : view
    ));
  };

     // Toggle identifier selection
   const toggleIdentifierSelection = (viewId: string, identifierId: string, valueId: string) => {
     console.log('🔄 toggleIdentifierSelection called:', { viewId, identifierId, valueId });
     
     setAggregatedViews(prev => {
       const updated = prev.map(view => {
         if (view.id === viewId) {
           let newSelected: string[];
           
           if (valueId === "selectAll") {
             // Select all values for this identifier
             const identifier = (data.identifiers || []).find(id => id.id === identifierId);
             newSelected = identifier ? (identifier.values || []).map(v => v.id) : [];
             console.log('🔄 Selecting all values for', identifierId, ':', newSelected);
           } else if (valueId === "clearAll") {
             // Clear all values for this identifier
             newSelected = [];
             console.log('🔄 Clearing all values for', identifierId);
           } else {
             // Toggle individual value
             const currentSelected = view.selectedIdentifiers[identifierId] || [];
             newSelected = currentSelected.includes(valueId)
               ? (currentSelected || []).filter(id => id !== valueId)
               : [...currentSelected, valueId];
             console.log('🔄 Toggling value', valueId, 'for', identifierId, '. New selected:', newSelected);
           }
           
           const updatedView = {
             ...view,
             selectedIdentifiers: {
               ...view.selectedIdentifiers,
               [identifierId]: newSelected
             }
           };
           
           console.log('🔄 Updated view:', updatedView);
           return updatedView;
         }
         return view;
       });
       
       console.log('🔄 All updated aggregated views:', updated);
       return updated;
     });
   };

  // Handle drag end for reordering identifiers
  const handleDragEnd = (event: DragEndEvent, viewId: string) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const updatedViews = aggregatedViews.map(view => {
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
      });
      
      // Update local state
      setAggregatedViews(updatedViews);
      
      // ✅ FIXED: Persist changes to scenario data
      onDataChange({ aggregatedViews: updatedViews });
      
      console.log('🔄 Identifier reordered:', {
        viewId,
        oldOrder: aggregatedViews.find(v => v.id === viewId)?.identifierOrder,
        newOrder: updatedViews.find(v => v.id === viewId)?.identifierOrder
      });
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


  const selectAllFeatures = () => {
    const updatedFeatures = (data.features || []).map(feature => ({ ...feature, selected: true }));
    onDataChange({ features: updatedFeatures });
  };

  const deselectAllFeatures = () => {
    const updatedFeatures = (data.features || []).map(feature => ({ ...feature, selected: false }));
    onDataChange({ features: updatedFeatures });
  };

  const toggleOutput = (outputId: string) => {
    const updatedOutputs = (data.outputs || []).map(output =>
      output.id === outputId ? { ...output, selected: !output.selected } : output
    );
    onDataChange({ outputs: updatedOutputs });
  };

  const toggleFeature = (featureId: string) => {
    const updatedFeatures = (data.features || []).map(feature =>
      feature.id === featureId ? { ...feature, selected: !feature.selected } : feature
    );
    onDataChange({ features: updatedFeatures });
  };

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // ✅ FIXED: Show all identifiers in aggregated views (don't filter by unique values > 1)
  // The clustering-style filter was too restrictive for aggregated views
  const filteredIdentifiers = data.identifiers || [];

  // Debug logging for current identifiers
  console.log('🎯 Current identifiers in render:', {
    identifiers: data.identifiers,
    backendIdentifiers: backendIdentifiers,
    backendFeatures: backendFeatures,
    filteredIdentifiers: filteredIdentifiers
  });

  return (
    <div className="h-full flex flex-col">
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
                  
                  {/* ✅ NEW: Direct Combination Selection */}
                  {(() => {
                    console.log('🔍 Settings: Rendering condition check:', {
                      backendCombinations: !!backendCombinations,
                      hasCombinations: !!backendCombinations?.combinations,
                      combinationsLength: backendCombinations?.combinations?.length,
                      fullBackendCombinations: backendCombinations
                    });
                    return backendCombinations && backendCombinations.combinations;
                  })() ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Available Combinations ({backendCombinations.total_combinations || 0})</span>
                      </div>
                      
                      {/* Select All / Deselect All for Combinations */}
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="select-all-combinations"
                          checked={data.selectedCombinations?.length === backendCombinations.combinations?.length}
                          onCheckedChange={(checked) => {
                            if (checked === true) {
                              // Select all combinations
                              const allCombinationIds = backendCombinations.combinations.map((c: any) => c.combination_id);
                              onDataChange({ selectedCombinations: allCombinationIds });
                            } else {
                              // Deselect all combinations
                              onDataChange({ selectedCombinations: [] });
                            }
                          }}
                          className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 data-[state=checked]:text-white"
                        />
                        <label htmlFor="select-all-combinations" className="text-sm">
                          Select All Combinations
                        </label>
                      </div>
                      
                      {/* Individual Combination Selection - Matching Build Atom Layout */}
                      <div className="max-h-60 overflow-y-auto overflow-x-auto border rounded p-2">
                        <div className="grid grid-cols-1 gap-2 min-w-max">
                          {backendCombinations.combinations.map((combination: any) => (
                            <div key={combination.combination_id} className="flex items-center space-x-2 p-2 border rounded hover:bg-muted/30">
                              <Checkbox 
                                id={`combination-${combination.combination_id}`}
                                checked={data.selectedCombinations?.includes(combination.combination_id) || false}
                                onCheckedChange={(checked) => {
                                  const currentSelected = data.selectedCombinations || [];
                                  console.log('🔍 Settings: Combination toggle:', {
                                    combinationId: combination.combination_id,
                                    checked,
                                    currentSelected,
                                    dataSelectedCombinations: data.selectedCombinations
                                  });
                                  
                                  if (checked === true) {
                                    // Add combination
                                    const newSelected = [...currentSelected, combination.combination_id];
                                    console.log('🔍 Settings: Adding combination, new selection:', newSelected);
                                    onDataChange({ 
                                      selectedCombinations: [...currentSelected, combination.combination_id] 
                                    });
                                  } else {
                                    // Remove combination
                                    const newSelected = currentSelected.filter((id: string) => id !== combination.combination_id);
                                    console.log('🔍 Settings: Removing combination, new selection:', newSelected);
                                    onDataChange({ 
                                      selectedCombinations: currentSelected.filter((id: string) => id !== combination.combination_id) 
                                    });
                                  }
                                }}
                                className="data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600 data-[state=checked]:text-white"
                              />
                              <div className="flex-1">
                                <label htmlFor={`combination-${combination.combination_id}`} className="text-xs font-medium cursor-pointer truncate">
                                  {combination.combination_id}
                                </label>
                                <div className="text-xs text-gray-500 truncate">
                                  {combination.identifiers ? Object.entries(combination.identifiers).map(([key, value]) => `${key}: ${value}`).join(', ') : 'No identifiers'}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-sm text-gray-500 mb-2">No combinations available</p>
                      <div className="space-y-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={fetchCombinations}
                          disabled={loadingCombinations}
                        >
                          {loadingCombinations ? "Loading..." : "Load Combinations"}
                        </Button>
                      </div>
                    </div>
                  )}
                  
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* Reference Settings Box */}
          <Card className="p-2">
            <Collapsible open={openSections.referenceSettings} onOpenChange={() => toggleSection('referenceSettings')}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded-md">
                  <div className="flex items-center space-x-2">
                <span className="font-medium text-sm">Reference Settings</span>
                  </div>
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
                <Select 
                  value={data.referenceMethod || 'mean'} 
                  onValueChange={(value: 'period-mean' | 'period-median' | 'mean' | 'median') => onDataChange({ referenceMethod: value })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="period-mean">Period Mean</SelectItem>
                    <SelectItem value="period-median">Period Median</SelectItem>
                    <SelectItem value="mean">Mean</SelectItem>
                    <SelectItem value="median">Median</SelectItem>
                  </SelectContent>
                </Select>
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
              <div className="space-y-3">
                <div className="space-y-2">
                  <label htmlFor="reference-start-date" className="text-sm font-medium text-gray-700">
                    Start Date:
                  </label>
                  <input
                    id="reference-start-date"
                    type="date"
                    value={data.referencePeriod?.from || dateRange?.start_date || ''}
                    onChange={(e) => onDataChange({
                      referencePeriod: {
                        ...data.referencePeriod,
                        from: e.target.value
                      }
                    })}
                    min={dateRange?.start_date}
                    max={dateRange?.end_date}
                    disabled={data.referenceMethod === 'mean' || data.referenceMethod === 'median'}
                    className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      data.referenceMethod === 'mean' || data.referenceMethod === 'median'
                        ? 'border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed'
                        : 'border-gray-300 bg-white'
                    }`}
                  />
                </div>
                
                <div className="space-y-2">
                  <label htmlFor="reference-end-date" className="text-sm font-medium text-gray-700">
                    End Date:
                  </label>
                  <input
                    id="reference-end-date"
                    type="date"
                    value={data.referencePeriod?.to || dateRange?.end_date || ''}
                    onChange={(e) => onDataChange({
                      referencePeriod: {
                        ...data.referencePeriod,
                        to: e.target.value
                      }
                    })}
                    min={data.referencePeriod?.from || dateRange?.start_date}
                    max={dateRange?.end_date}
                    disabled={data.referenceMethod === 'mean' || data.referenceMethod === 'median'}
                    className={`w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      data.referenceMethod === 'mean' || data.referenceMethod === 'median'
                        ? 'border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed'
                        : 'border-gray-300 bg-white'
                    }`}
                  />
                </div>
                
                {/* Show loading indicator for date range */}
                {loadingDateRange && (
                  <div className="text-xs text-gray-500 flex items-center gap-2">
                    <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                    Loading date range...
                  </div>
                )}
                
                {/* Show info about disabled fields */}
                {(data.referenceMethod === 'mean' || data.referenceMethod === 'median') && (
                  <div className="text-xs text-gray-500 bg-blue-50 p-2 rounded">
                    Date fields are disabled for {data.referenceMethod} method. Use Period Mean or Period Median to enable date selection.
                  </div>
                )}
                  
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
                      checked={(data.features || []).every(feature => feature.selected)}
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
                          (el as HTMLInputElement).indeterminate = (data.features || []).some(feature => feature.selected) && !(data.features || []).every(feature => feature.selected);
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

          {/* Target Variable Information Box */}
          <Card className="p-2">
          <Collapsible open={openSections.output} onOpenChange={() => toggleSection('output')}>
              <CollapsibleTrigger className="flex items-center justify-between w-full p-2 hover:bg-gray-50 rounded-md">
                <span className="font-medium text-sm">Target Variable</span>
                {openSections.output ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
            </CollapsibleTrigger>
            <CollapsibleContent className="px-2 py-2">
              <div className="space-y-2">
                {/* Y-Variable Information */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm font-medium text-gray-700">Target Variable:</span>
                      <span className="text-sm font-semibold text-blue-800">
                        {yVariableInfo?.y_variable || 'Not loaded'}
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={fetchYVariableInfo}
                      disabled={loadingYVariable}
                      className="h-6 px-2 text-xs"
                    >
                      {loadingYVariable ? (
                        <RefreshCw className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                    </Button>
                  </div>
                </div>
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
                                              const newOrder = (view.identifierOrder || []).filter(id => id !== identifier.id);
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
                                      const identifier = (data.identifiers || []).find(id => id.id === identifierId);
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