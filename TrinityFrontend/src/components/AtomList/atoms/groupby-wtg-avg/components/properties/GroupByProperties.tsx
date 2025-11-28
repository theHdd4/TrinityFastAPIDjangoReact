import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Settings, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckboxTemplate } from '@/templates/checkbox';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';

import GroupByInputFiles from '../GroupByInputFiles';
import GroupByExhibition from '../GroupByExhibition';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';

interface GroupByPropertiesProps {
  atomId: string;
}

const GroupByProperties: React.FC<GroupByPropertiesProps> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings = atom?.settings || {};
  // Tab for Input/Settings/Exhibition similar to CreateColumn
  const [tab, setTab] = useState('input');
  // Track if user has explicitly interacted with selections (to prevent useEffect from resetting)
  const userHasInteractedRef = useRef(false);
  // Track previous dataSource to detect file changes
  const previousDataSourceRef = useRef<string | undefined>(settings.dataSource);

  // ------------------------------
  // Initial lists
  // ------------------------------
  const identifiers = settings.identifiers || [];
  const measures = settings.measures || [];
  const selectedIdentifiers = settings.selectedIdentifiers || [];
  const columns = settings.allColumns || [];

  // Fallback logic for identifiers and measures if not found in Mongo
  const categoricalColumns = columns.filter(
    (c: any) => c.data_type && (
      c.data_type.toLowerCase().includes('object') ||
      c.data_type.toLowerCase().includes('string') ||
      c.data_type.toLowerCase().includes('category')
    )
  ).map((c: any) => c.column);
  const numericalColumns = columns.filter(
    (c: any) => c.data_type && (
      c.data_type.toLowerCase().includes('int') ||
      c.data_type.toLowerCase().includes('float') ||
      c.data_type.toLowerCase().includes('number')
    )
  ).map((c: any) => c.column);

  const fallbackIdentifiers = identifiers.length === 0 ? categoricalColumns : identifiers;
  const fallbackMeasures = measures.length === 0 ? numericalColumns : measures;

  // ------------------------------
  // Get draggable lists from global store
  // ------------------------------
  // 🔧 CRITICAL: Get AI-selected identifiers to preserve them even if not in fallbackIdentifiers
  const aiConfig = settings.aiConfig;
  const aiSelectedIdentifiers = aiConfig?.identifiers || [];
  
  // Filter identifierList to only include valid identifiers from fallbackIdentifiers
  // BUT preserve AI-selected identifiers even if not in fallbackIdentifiers
  const rawIdentifierList = settings.identifierList || fallbackIdentifiers;
  const identifierList = rawIdentifierList.filter(id => {
    const isValid = fallbackIdentifiers.includes(id) || aiSelectedIdentifiers.includes(id);
    if (!isValid) {
      console.log('⚠️ [Filter] Removing invalid identifier from list:', id);
    }
    return isValid;
  });
  
  // 🔧 CRITICAL: Also add AI-selected identifiers that aren't in the list yet
  const finalIdentifierList = [...new Set([...identifierList, ...aiSelectedIdentifiers])];
  
  if (rawIdentifierList.length !== finalIdentifierList.length) {
    console.log('🔍 [Filter] Filtered/Updated identifierList:', {
      originalLength: rawIdentifierList.length,
      filteredLength: finalIdentifierList.length,
      removed: rawIdentifierList.filter(id => !fallbackIdentifiers.includes(id) && !aiSelectedIdentifiers.includes(id)),
      addedFromAI: aiSelectedIdentifiers.filter(id => !rawIdentifierList.includes(id))
    });
  }
  const measureList = settings.measureList || fallbackMeasures;
  
  // 🔧 CRITICAL: Use finalIdentifierList (includes AI-selected identifiers) for display
  const displayIdentifierList = finalIdentifierList;

  // Keep global lists in sync when fallback arrays change (e.g. after data fetch)
  useEffect(() => {
    if (fallbackIdentifiers.length > 0) {
      // Always update when data source changes, or if lists are empty
      const shouldUpdate = !settings.identifierList || 
                          settings.identifierList.length === 0 || 
                          JSON.stringify(settings.identifierList) !== JSON.stringify(fallbackIdentifiers);
      
      if (shouldUpdate) {
        updateSettings(atomId, { 
          identifierList: fallbackIdentifiers,
          identifiers: fallbackIdentifiers 
        });
      }
    }
  }, [fallbackIdentifiers, settings.identifierList, atomId, updateSettings]);

  useEffect(() => {
    if (fallbackMeasures.length > 0) {
      // Always update when data source changes, or if lists are empty
      const shouldUpdate = !settings.measureList || 
                          settings.measureList.length === 0 || 
                          JSON.stringify(settings.measureList) !== JSON.stringify(fallbackMeasures);
      
      if (shouldUpdate) {
        updateSettings(atomId, { 
          measureList: fallbackMeasures,
          measures: fallbackMeasures 
        });
      }
    }
  }, [fallbackMeasures, settings.measureList, atomId, updateSettings]);

  // Get selectedMeasures from global store
  const localSelectedMeasures = Array.isArray(settings.selectedMeasureNames) && settings.selectedMeasureNames.length > 0
    ? settings.selectedMeasureNames
    : (Array.isArray(settings.selectedMeasures) && settings.selectedMeasures.length > 0
        ? (typeof settings.selectedMeasures[0] === 'string'
            ? settings.selectedMeasures as string[]
            : (settings.selectedMeasures as any[]).map(m => m.field).filter(Boolean))
        : fallbackMeasures);

  // Ensure global selection includes all measures once they are available
  useEffect(() => {
    if (localSelectedMeasures.length === 0 && fallbackMeasures.length > 0) {
      updateSettings(atomId, { selectedMeasureNames: fallbackMeasures });
    }
  }, [fallbackMeasures, localSelectedMeasures.length, atomId, updateSettings]);

  // Update selected identifiers when data source changes (but NOT when user explicitly changes selection)
  useEffect(() => {
    if (fallbackIdentifiers.length > 0) {
      // 🔧 CRITICAL: If AI config exists, preserve AI-selected identifiers even if not in fallbackIdentifiers
      // This allows AI to select identifiers like "year" and "month" even if they're numeric
      const aiConfig = settings.aiConfig;
      const aiSelectedIdentifiers = aiConfig?.identifiers || [];
      
      // Filter selected identifiers to only include those that exist in the new data
      // BUT preserve AI-selected identifiers even if not in fallbackIdentifiers
      const validSelectedIdentifiers = selectedIdentifiers.filter(id => 
        fallbackIdentifiers.includes(id) || aiSelectedIdentifiers.includes(id)
      );
      
      // Only set defaults if data source actually changed (fallbackIdentifiers changed)
      // AND we have invalid identifiers (meaning data source changed)
      // Do NOT reset if user explicitly set to empty array
      // 🔧 CRITICAL: Don't filter if AI config exists and identifiers are from AI
      const hasInvalidIdentifiers = selectedIdentifiers.length > 0 && 
        selectedIdentifiers.some(id => !fallbackIdentifiers.includes(id) && !aiSelectedIdentifiers.includes(id));
      
      // Only reset if data source changed (has invalid identifiers) and we need to clean up
      // BUT preserve AI-selected identifiers
      if (hasInvalidIdentifiers) {
        // Clean up invalid identifiers, keep valid ones AND AI-selected ones
        const cleanedIdentifiers = validSelectedIdentifiers.length > 0 
          ? validSelectedIdentifiers 
          : (aiSelectedIdentifiers.length > 0 ? aiSelectedIdentifiers : selectedIdentifiers);
        
        console.log('⚙️ [useEffect] Cleaning invalid identifiers after data source change:', {
          validSelectedIdentifiers: cleanedIdentifiers,
          removed: selectedIdentifiers.filter(id => !fallbackIdentifiers.includes(id) && !aiSelectedIdentifiers.includes(id)),
          preservedAIIdentifiers: aiSelectedIdentifiers.filter(id => selectedIdentifiers.includes(id))
        });
        updateSettings(atomId, { selectedIdentifiers: cleanedIdentifiers });
      }
      // Don't set defaults here - let the initial load useEffect handle that
    }
  }, [fallbackIdentifiers, atomId, updateSettings, settings.aiConfig]); // Added aiConfig to deps to react to AI updates

  // Update selected measures when data source changes
  useEffect(() => {
    if (fallbackMeasures.length > 0) {
      // Filter selected measures to only include those that exist in the new data
      const validSelectedMeasures = localSelectedMeasures.filter(measure => 
        fallbackMeasures.includes(measure)
      );
      
      // If no valid measures or data source changed, select all available measures for the settings panel
      if (validSelectedMeasures.length === 0 || 
          JSON.stringify(validSelectedMeasures) !== JSON.stringify(localSelectedMeasures)) {
        updateSettings(atomId, { 
          selectedMeasureNames: fallbackMeasures
        });
      }
    }
  }, [fallbackMeasures, localSelectedMeasures, atomId, updateSettings]);

  // 🔧 CRITICAL FIX: Automatically switch to Exhibition tab when AI results are available
  // useEffect(() => {
  //   const hasAIResults = settings.groupbyResults && 
  //                       settings.groupbyResults.unsaved_data && 
  //                       Array.isArray(settings.groupbyResults.unsaved_data) && 
  //                       settings.groupbyResults.unsaved_data.length > 0;
  //   
  //   if (hasAIResults) {
  //     console.log('🔄 AI results detected, switching to Exhibition tab');
  //     setTab('exhibition');
  //   }
  // }, [settings.groupbyResults?.unsaved_data, settings.groupbyResults?.result_file]);

  // ------------------------------
  // Drag helpers
  // ------------------------------
  type DragMeta = { item: string; source: 'identifiers' | 'measures' };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, meta: DragMeta) => {
    e.dataTransfer.setData('text/plain', JSON.stringify(meta));
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); // Allow drop
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, destination: 'identifiers' | 'measures') => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('text/plain');
    if (!raw) return;
    const { item, source } = JSON.parse(raw) as DragMeta;
    if (source === destination) return;

    if (source === 'identifiers' && destination === 'measures') {
      const newIdentifiers = displayIdentifierList.filter(i => i !== item);
      const newMeasures = [...measureList, item];
      // If the item was selected in identifiers, move its selection to measures
      if (selectedIdentifiers.includes(item)) {
        updateSettings(atomId, {
          selectedIdentifiers: selectedIdentifiers.filter(id => id !== item),
          selectedMeasureNames: [...localSelectedMeasures, item]
        });
      }
      updateSettings(atomId, { 
        identifiers: newIdentifiers, 
        measures: newMeasures,
        identifierList: newIdentifiers,
        measureList: newMeasures
      });
    } else if (source === 'measures' && destination === 'identifiers') {
      const newMeasures = measureList.filter(m => m !== item);
      const newIdentifiers = [...displayIdentifierList, item];
      // If the item was selected in measures, move its selection to identifiers
      if (localSelectedMeasures.includes(item)) {
        updateSettings(atomId, {
          selectedMeasureNames: localSelectedMeasures.filter(m => m !== item)
        });
      }
      updateSettings(atomId, { 
        identifiers: newIdentifiers, 
        measures: newMeasures,
        identifierList: newIdentifiers,
        measureList: newMeasures
      });
    }
  };

  // ------------------------------
  // Toggle helpers
  // ------------------------------
  const toggleIdentifier = useCallback((identifier: string) => {
    userHasInteractedRef.current = true;
    const newSelected = selectedIdentifiers.includes(identifier)
      ? selectedIdentifiers.filter(id => id !== identifier)
      : [...selectedIdentifiers, identifier];
    console.log('🔄 [Toggle Identifier]:', {
      identifier,
      wasSelected: selectedIdentifiers.includes(identifier),
      newSelected: newSelected,
      newLength: newSelected.length
    });
    updateSettings(atomId, { selectedIdentifiers: newSelected });
  }, [selectedIdentifiers, atomId, updateSettings]);

  const toggleMeasure = useCallback((measure: string) => {
    const isSelected = localSelectedMeasures.includes(measure);
    const newSelected = isSelected
      ? localSelectedMeasures.filter(m => m !== measure)
      : [...localSelectedMeasures, measure];
    // Persist selected measure names in settings so canvas dropdown updates but without altering measure rows
    updateSettings(atomId, { selectedMeasureNames: newSelected });
  }, [localSelectedMeasures, atomId, updateSettings]);

  const selectedAggregationMethods = Array.isArray(settings.selectedAggregationMethods) && settings.selectedAggregationMethods.length > 0
    ? settings.selectedAggregationMethods
    : ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'];

  const toggleAggregationMethod = useCallback((agg: string) => {
    const newSelected = selectedAggregationMethods.includes(agg)
      ? selectedAggregationMethods.filter(a => a !== agg)
      : [...selectedAggregationMethods, agg];
    updateSettings(atomId, { selectedAggregationMethods: newSelected });
  }, [selectedAggregationMethods, atomId, updateSettings]);

  // Sample data for visualization
  const chartData = [
    { name: 'Group 1', value: 400 },
    { name: 'Group 2', value: 300 },
    { name: 'Group 3', value: 500 },
    { name: 'Group 4', value: 200 },
    { name: 'Group 5', value: 350 },
  ];

  // Detect file/data source changes and reset interaction flag
  useEffect(() => {
    const currentDataSource = settings.dataSource;
    const previousDataSource = previousDataSourceRef.current;
    
    // If dataSource changed (and it's not the initial render)
    if (previousDataSource !== undefined && currentDataSource !== previousDataSource) {
      console.log('🔄 [File Change Detected] Resetting interaction flag and clearing old measures:', {
        previousDataSource,
        currentDataSource
      });
      userHasInteractedRef.current = false; // Reset so defaults run again
      // Clear selectedMeasures (complex objects with rename_to from previous file)
      updateSettings(atomId, { 
        selectedMeasures: [] // Clear old measure objects with rename_to from previous file
      });
    }
    
    // Update the ref for next comparison
    previousDataSourceRef.current = currentDataSource;
  }, [settings.dataSource, atomId, updateSettings]);

  // Default select identifiers with unique_count > 1, and all measures and aggregation methods
  // Runs on initial load OR when file/data source changes
  useEffect(() => {
    // Check if we have valid selected identifiers for the current file
    // If selectedIdentifiers exist and are valid, don't reset them (user has made selections)
    const hasValidSelections = selectedIdentifiers.length > 0 && 
      selectedIdentifiers.every(id => fallbackIdentifiers.includes(id));
    
    // Only set defaults if:
    // 1. We have identifiers available
    // 2. User hasn't explicitly interacted yet (or file just changed, which resets the flag)
    // 3. AND we don't have valid existing selections (to preserve user selections when returning to same file)
    const shouldSetDefaults = fallbackIdentifiers.length > 0 && 
                              !userHasInteractedRef.current && 
                              !hasValidSelections;
    
    if (shouldSetDefaults) {
      // Get identifiers with unique_count > 1
      const uniqueIdentifiers = fallbackIdentifiers.filter(identifier => {
        const colInfo = (settings.allColumns || []).find((col: any) => col.column === identifier);
        return colInfo && colInfo.unique_count > 1;
      });
      // If we found identifiers with unique_count > 1, use them, otherwise fallback to all identifiers
      const defaultIdentifiers = uniqueIdentifiers.length > 0 ? uniqueIdentifiers : fallbackIdentifiers;
      console.log('⚙️ [useEffect Default] Setting default identifiers:', {
        fallbackIdentifiersLength: fallbackIdentifiers.length,
        selectedIdentifiersLength: selectedIdentifiers.length,
        uniqueIdentifiersLength: uniqueIdentifiers.length,
        defaultIdentifiers: defaultIdentifiers,
        userHasInteracted: userHasInteractedRef.current,
        hasValidSelections: hasValidSelections,
        dataSource: settings.dataSource
      });
      updateSettings(atomId, { selectedIdentifiers: defaultIdentifiers });
    } else if (hasValidSelections) {
      // If we have valid selections, mark as interacted to prevent future resets
      userHasInteractedRef.current = true;
      console.log('✅ [useEffect Default] Preserving existing identifier selections:', {
        selectedIdentifiers: selectedIdentifiers,
        dataSource: settings.dataSource
      });
    }
    // Set default measures if needed (only if user hasn't interacted or file changed)
    if (fallbackMeasures.length > 0 && !userHasInteractedRef.current) {
      const hasValidMeasureSelections = localSelectedMeasures.length > 0 && 
        localSelectedMeasures.every(m => fallbackMeasures.includes(m));
      if (!hasValidMeasureSelections) {
        console.log('⚙️ [useEffect Default] Setting default measures:', {
          fallbackMeasures: fallbackMeasures,
          dataSource: settings.dataSource
        });
        updateSettings(atomId, { selectedMeasureNames: fallbackMeasures });
      }
    }
    
    const allAggs = ['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'];
    if ((!Array.isArray(settings.selectedAggregationMethods) || settings.selectedAggregationMethods.length === 0)) {
      updateSettings(atomId, { selectedAggregationMethods: allAggs });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallbackIdentifiers, fallbackMeasures, settings.dataSource]);

  return (
    <div className="h-full flex flex-col">
      <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="input" className="text-xs font-medium">
            <Upload className="w-3 h-3 mr-1" />
            Input
          </TabsTrigger>
          <TabsTrigger value="settings" className="text-xs font-medium">
            <Settings className="w-3 h-3 mr-1" />
            Settings
          </TabsTrigger>
          <TabsTrigger value="exhibition" className="text-xs font-medium">
            <Eye className="w-3 h-3 mr-1" />
            Exhibition
          </TabsTrigger>
        </TabsList>

        {/* Input Files Tab */}
        <TabsContent value="input" className="flex-1 mt-0" forceMount>
          <GroupByInputFiles atomId={atomId} />
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="flex-1 mt-0" forceMount>
          <Card className="border-l-4 border-l-blue-500"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, 'identifiers')}>
            <CardHeader>
              <CardTitle className="text-lg">Identifiers Selection</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2 pb-2 border-b mb-2">
                <Checkbox
                  id="select-all-identifiers"
                  checked={(() => {
                    const allSelected = displayIdentifierList.length > 0 &&
                      displayIdentifierList.every(id => selectedIdentifiers.includes(id));
                    console.log('🔍 [Identifiers Select All] Debug:', {
                      identifierListLength: displayIdentifierList.length,
                      selectedIdentifiersLength: selectedIdentifiers.length,
                      identifierList: displayIdentifierList,
                      selectedIdentifiers: selectedIdentifiers,
                      allSelected: allSelected,
                      checkResult: displayIdentifierList.every(id => {
                        const included = selectedIdentifiers.includes(id);
                        if (!included) {
                          console.log(`  ❌ Missing: ${id}`);
                        }
                        return included;
                      })
                    });
                    return allSelected;
                  })()}
                  onCheckedChange={(checked) => {
                    userHasInteractedRef.current = true;
                    console.log('🖱️ [Identifiers Select All] Clicked:', {
                      checked,
                      identifierList: displayIdentifierList,
                      willSetTo: checked ? [...displayIdentifierList] : []
                    });
                    updateSettings(atomId, {
                      selectedIdentifiers: checked ? [...displayIdentifierList] : []
                    });
                  }}
                />
                <label
                  htmlFor="select-all-identifiers"
                  className="text-sm font-medium cursor-pointer flex-1"
                >
                  Select All
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-2">
                {displayIdentifierList.map((identifier: string) => {
                  const isSelected = selectedIdentifiers.includes(identifier);
                  return (
                    <div
                       key={identifier}
                       title={identifier}
                       className="cursor-pointer select-none"
                       onClick={() => toggleIdentifier(identifier)}
                       draggable
                       onDragStart={(e) => handleDragStart(e, { item: identifier, source: 'identifiers' })}
                     >
                      <CheckboxTemplate
                        id={identifier}
                        label={identifier}
                        checked={isSelected}
                        onCheckedChange={() => toggleIdentifier(identifier)}
                        labelClassName="text-ms cursor-pointer capitalize truncate max-w-full"
                      />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, 'measures')}>
            <CardHeader>
              <CardTitle className="text-lg">Measures Selection</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-2">
                {measureList.map((measure: string) => {
                  const isSelected = localSelectedMeasures.includes(measure);
                  return (
                    <div
                       key={measure}
                       title={measure}
                       className="cursor-pointer select-none"
                       onClick={() => toggleMeasure(measure)}
                       draggable
                       onDragStart={(e) => handleDragStart(e, { item: measure, source: 'measures' })}
                     >
                      <CheckboxTemplate
                        id={measure}
                        label={measure}
                        checked={isSelected}
                        onCheckedChange={() => toggleMeasure(measure)}
                        labelClassName="text-ms cursor-pointer capitalize truncate max-w-full"
                      />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-orange-500">
            <CardHeader>
              <CardTitle className="text-lg">Aggregation Methods</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-2">
                {['Sum', 'Mean', 'Min', 'Max', 'Count', 'Median', 'Weighted Mean', 'Rank Percentile'].map((agg) => {
                  const isSelected = selectedAggregationMethods.includes(agg);
                  return (
                    <div key={agg} title={agg} className="cursor-pointer select-none"
                       onClick={() => toggleAggregationMethod(agg)}
                     >
                      <CheckboxTemplate
                        id={agg}
                        label={agg}
                        checked={isSelected}
                        onCheckedChange={() => toggleAggregationMethod(agg)}
                        labelClassName="text-ms cursor-pointer capitalize truncate max-w-full"
                      />
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Exhibition Tab */}
        <TabsContent value="exhibition" className="flex-1 mt-0" forceMount>
          <GroupByExhibition settings={settings} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default GroupByProperties;