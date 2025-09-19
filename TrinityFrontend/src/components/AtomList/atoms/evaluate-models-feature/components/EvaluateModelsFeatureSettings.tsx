import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
// Removed Badge and icon imports to avoid type issues
import { EvaluateModelsFeatureData, type EvaluateModelsFeatureSettings } from '../EvaluateModelsFeatureAtom';
import { VALIDATE_API, EVALUATE_API, SELECT_API } from '@/lib/api';
import { useDataSourceChangeWarning } from '@/hooks/useDataSourceChangeWarning';

interface EvaluateModelsFeatureSettingsProps {
  data: EvaluateModelsFeatureData;
  settings: EvaluateModelsFeatureSettings;
  onDataChange: (data: Partial<EvaluateModelsFeatureData>) => void;
  onSettingsChange: (settings: Partial<EvaluateModelsFeatureSettings>) => void;
  onDataUpload: (file: File, fileId: string) => void;
}

const EvaluateModelsFeatureSettings: React.FC<EvaluateModelsFeatureSettingsProps> = ({
  data,
  settings,
  onDataChange,
  onSettingsChange,
  onDataUpload
}) => {
  const [frames, setFrames] = useState<{ object_name: string; csv_name?: string }[]>([]);
  const [localGraphs, setLocalGraphs] = useState(data.graphs || []);

  const hasExistingUpdates = Boolean(
    (Array.isArray(data.modelResults) && data.modelResults.length > 0) ||
    (Array.isArray(data.performanceData) && data.performanceData.length > 0) ||
    (Array.isArray(data.yoyData) && data.yoyData.length > 0) ||
    (Array.isArray(data.weightedEnsembleData) && data.weightedEnsembleData.length > 0) ||
    (Array.isArray(data.elasticityData) && data.elasticityData.length > 0)
  );

  const applyDatasetChange = (value: string) => {
    onDataChange({
      selectedDataframe: value,
      selectedCombinations: []
    });
  };

  const { requestChange: confirmDatasetChange, dialog } = useDataSourceChangeWarning(async value => {
    applyDatasetChange(value);
  });

  const handleDatasetChange = (value: string) => {
    const isDifferentSource = value !== (data.selectedDataframe || '');
    confirmDatasetChange(value, hasExistingUpdates && isDifferentSource);
  };
  
  // Update local state when data.graphs changes
  React.useEffect(() => {
    setLocalGraphs(data.graphs || []);
  }, [data.graphs]);

  useEffect(() => {
    let query = '';
    const envStr = localStorage.getItem('env');
    if (envStr) {
      try {
        const env = JSON.parse(envStr);
        query =
          '?' +
          new URLSearchParams({
            client_id: env.CLIENT_ID || '',
            app_id: env.APP_ID || '',
            project_id: env.PROJECT_ID || '',
            client_name: env.CLIENT_NAME || '',
            app_name: env.APP_NAME || '',
            project_name: env.PROJECT_NAME || ''
          }).toString();
      } catch {
        /* ignore */
      }
    }
    
    // Fetch only model results files
    fetch(`${SELECT_API}/list-model-results-files${query}`)
      .then(r => r.json())
      .then(d => setFrames(Array.isArray(d.files) ? d.files : []))
      .catch(() => setFrames([]));
  }, []);

  const [combinationOptions, setCombinationOptions] = useState<string[]>([]);

  useEffect(() => {
    const key = data.selectedDataframe;
    if (!key) {
      setCombinationOptions([]);
      return;
    }
    
    // Build the URL with identifier values if available
    let url = `${EVALUATE_API}/get-combinations?object_name=${encodeURIComponent(key)}`;
    
              // Add identifier values as query parameter if available
    if (data.selectedIdentifierValues && Object.keys(data.selectedIdentifierValues).length > 0) {
      // Use the actual selected identifier values from the data
      const selectedIdentifierValues = data.selectedIdentifierValues;
      
      if (Object.keys(selectedIdentifierValues).length > 0) {
        url += `&identifier_values=${encodeURIComponent(JSON.stringify(selectedIdentifierValues))}`;
      }
    }
    
    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (data.combinations && Array.isArray(data.combinations)) {
          setCombinationOptions(data.combinations);
        } else {
          setCombinationOptions([]);
        }
      })
      .catch(() => {
        setCombinationOptions([]);
      });
  }, [data.selectedDataframe, data.selectedIdentifierValues]);

  // Auto-select all combinations when dataset changes and combinations are available
  useEffect(() => {
    if (data.selectedDataframe && combinationOptions.length > 0 && data.selectedCombinations.length === 0) {
      console.log('Auto-selecting all combinations for new dataset');
      onDataChange({ selectedCombinations: combinationOptions });
    }
  }, [data.selectedDataframe, combinationOptions, data.selectedCombinations.length, onDataChange]);

  // Update selected combinations when combinationOptions change due to identifier filtering
  useEffect(() => {
    if (data.selectedDataframe && combinationOptions.length > 0) {
      // When combinationOptions change (due to identifier filtering), update selectedCombinations
      // to only include combinations that are still available
      const availableCombinations = data.selectedCombinations.filter(combo => 
        combinationOptions.includes(combo)
      );
      
      // Find newly available combinations that weren't previously selected
      const newlyAvailableCombinations = combinationOptions.filter(combo => 
        !data.selectedCombinations.includes(combo)
      );
      
      // If some combinations are no longer available OR new ones are available, update the selection
      if (availableCombinations.length !== data.selectedCombinations.length || newlyAvailableCombinations.length > 0) {
        // Combine existing available selections with newly available combinations
        const updatedCombinations = [...availableCombinations, ...newlyAvailableCombinations];
        
        console.log('Updating selected combinations due to identifier filtering:', {
          old: data.selectedCombinations,
          new: updatedCombinations,
          reason: newlyAvailableCombinations.length > 0 
            ? 'New combinations available due to identifier changes' 
            : 'Some combinations no longer match identifier criteria',
          newlyAvailable: newlyAvailableCombinations
        });
        
        onDataChange({ selectedCombinations: updatedCombinations });
      }
    }
  }, [combinationOptions, data.selectedDataframe, data.selectedCombinations, onDataChange]);

  const allCombinationsSelected =
    combinationOptions.length > 0 &&
    combinationOptions.every(option => (data.selectedCombinations || []).includes(option));

  // Debug logging for select all checkbox
  console.log('Select All Debug:', {
    combinationOptionsLength: combinationOptions.length,
    selectedCombinations: data.selectedCombinations,
    selectedCombinationsLength: data.selectedCombinations?.length || 0,
    allCombinationsSelected,
    everyCheck: combinationOptions.every(option => (data.selectedCombinations || []).includes(option))
  });

  const handleSelectAllCombinations = (checked: boolean) => {
    console.log('Select All Handler called:', { checked, combinationOptions });
    if (checked) {
      // Select all combinations
      const allCombinations = combinationOptions;
      console.log('Selecting all combinations:', allCombinations);
      onDataChange({ selectedCombinations: allCombinations });
    } else {
      // Deselect all combinations
      console.log('Deselecting all combinations');
      onDataChange({ selectedCombinations: [] });
    }
  };

  const handleIdentifierToggle = (identifierId: string, checked: boolean) => {
    const updatedIdentifiers = data.identifiers.map(identifier =>
      identifier.id === identifierId ? { ...identifier, selected: checked } : identifier
    );
    onDataChange({ identifiers: updatedIdentifiers });
  };

  const handleGraphToggle = (graphId: string, checked: boolean) => {
    console.log('🔧 Settings: handleGraphToggle called with:', { graphId, checked });
    console.log('🔧 Settings: Current localGraphs:', localGraphs);
    
    const updatedGraphs = localGraphs.map(graph =>
      graph.id === graphId ? { ...graph, selected: checked } : graph
    );
    
    console.log('🔧 Settings: Updated graphs:', updatedGraphs);
    
    // Update local state immediately for responsive UI
    setLocalGraphs(updatedGraphs);
    
    console.log('🔧 Settings: Calling onDataChange with:', { graphs: updatedGraphs });
    onDataChange({ graphs: updatedGraphs });
  };

  return (
    <div className="space-y-6">
      {/* Data Selection */}
      <Card>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Dataset</Label>
            <Select
              value={data.selectedDataframe}
              onValueChange={handleDatasetChange}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select a dataset" />
              </SelectTrigger>
              <SelectContent>
                {frames.map((f, idx) => (
                  <SelectItem key={`${f.object_name}-${idx}`} value={f.object_name}>
                    {f.csv_name.split('/').pop()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {dialog}

      {/* Combination Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Select Combination</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label className="text-xs">Combinations</Label>
            {/* Select All Checkbox */}
            {combinationOptions.length > 0 && (
              <div className="mb-3 p-2 border rounded bg-muted/20">
                <div className="flex items-center space-x-2">
                                     <Checkbox
                     id="select-all-combinations"
                     checked={allCombinationsSelected}
                     onCheckedChange={(checked) => handleSelectAllCombinations(checked as boolean)}
                   />
                  <Label htmlFor="select-all-combinations" className="text-sm font-medium">
                    Select All Combinations
                  </Label>
                </div>
              </div>
            )}
            
                         <div className="max-h-60 overflow-y-auto overflow-x-auto mt-2 border rounded p-2">
               <div className="grid grid-cols-1 gap-2 min-w-max">
                {combinationOptions.map((option, idx) => (
                  <div key={option} className="flex items-center space-x-2 p-2 border rounded hover:bg-muted/30">
                                         <Checkbox
                       id={`combo-${idx}`}
                       checked={(data.selectedCombinations || []).includes(option)}
                       onCheckedChange={(checked) => {
                         const isChecked = checked;
                         const currentSelections = data.selectedCombinations || [];
                         const updatedCombinations = isChecked
                           ? [...currentSelections, option]
                           : currentSelections.filter(c => c !== option);
                         
                         console.log('Individual Checkbox Debug - Combination selection:', {
                           option,
                           isChecked,
                           currentSelections,
                           updatedCombinations,
                           willUpdateStore: true
                         });
                         
                         onDataChange({ selectedCombinations: updatedCombinations });
                       }}
                       onClick={(e) => e.stopPropagation()}
                     />
                    <Label htmlFor={`combo-${idx}`} className="text-sm truncate">{option}</Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          
        </CardContent>
      </Card>

      {/* Graph Types */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Graph Types</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {localGraphs.map((graph) => (
            <div key={graph.id} className="flex items-center space-x-2">
              <Checkbox
                id={`graph-${graph.id}`}
                checked={graph.selected}
                onCheckedChange={(checked) => 
                  handleGraphToggle(graph.id, checked as boolean)
                }
              />
              <Label 
                htmlFor={`graph-${graph.id}`} 
                className="text-xs font-normal cursor-pointer"
              >
                {graph.name}
              </Label>
            </div>
          ))}
        </CardContent>
      </Card>

      
    </div>
  );
};

export default EvaluateModelsFeatureSettings;