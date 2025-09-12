import React, { useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Database, Target, Cpu, Settings2 } from 'lucide-react';
import { VALIDATE_API } from '@/lib/api';
import { AutoRegressiveModelsData, AutoRegressiveModelsSettings as SettingsType } from '../AutoRegressiveModelsAtom';

interface AutoRegressiveModelsSettingsProps {
  data: AutoRegressiveModelsData;
  settings: SettingsType;
  onDataChange: (data: Partial<AutoRegressiveModelsData>) => void;
  onSettingsChange: (settings: Partial<SettingsType>) => void;
  onDataUpload: (file: File, fileId: string) => void;
}

const availableModels = [
  { id: 'ARIMA', name: 'ARIMA', params: [] },
  { id: 'SARIMA', name: 'SARIMA', params: [] },
  { id: 'Holt-Winters', name: 'Holt-Winters', params: [] },
  { id: 'ETS', name: 'ETS', params: [] },
  { id: 'Prophet', name: 'Prophet', params: [] }
];

const AutoRegressiveModelsSettings: React.FC<AutoRegressiveModelsSettingsProps> = ({
  data,
  settings,
  onDataChange,
  onSettingsChange,
  onDataUpload
}) => {
  // fetch saved dataframes list on mount
  useEffect(() => {
    fetch(`${VALIDATE_API}/list_saved_dataframes`)
      .then(r => r.json())
      .then(d => {
        const files = Array.isArray(d.files) ? d.files.map((f: any)=> f.object_name || f) : [];
        if (files.length && (!data?.availableFiles || data.availableFiles.length === 0)) {
          onDataChange({ availableFiles: files });
        }
      })
      .catch(() => {/* ignore */});
  }, [data?.availableFiles]);

  // Ensure all models are selected by default on first load
  useEffect(() => {
    
    // Only auto-select on initial load when selectedModels is undefined (not when it's an empty array)
    // This allows users to deselect all models without them being auto-selected again
    if (data?.selectedModels === undefined) {
      const allModelIds = availableModels.map(model => model.id);
      onDataChange({
        selectedModels: allModelIds
      });
    } else {
    }
  }, []); // Only run once on mount, not when any dependencies change

  // Filter files that contain "Scope" and extract unique scope numbers
  const scopeFiles = (data?.availableFiles || []).filter(file => 
    typeof file === 'string' && file.includes('Scope_')
  );

  // Extract unique scope numbers from filenames
  const uniqueScopeNumbers = scopeFiles
    .map(file => {
      const match = file.match(/Scope_(\d+)_/);
      return match ? parseInt(match[1]) : null;
    })
    .filter((scopeNum): scopeNum is number => scopeNum !== null)
    .sort((a, b) => a - b);

  // Remove duplicates and create scope options
  const scopeOptions = [...new Set(uniqueScopeNumbers)].map(scopeNum => ({
    value: scopeNum.toString(),
    label: `Scope ${scopeNum}`
  }));

  // Filter files by selected scope number and extract combinations after scope number
  const filesForSelectedScope = data?.selectedScope ? 
    scopeFiles.filter(file => file.includes(`Scope_${data.selectedScope}_`)) : [];

  // Extract combinations after scope number (e.g., "Channel_Convenience_Variant_Flavoured_Brand_HEINZ_Flavoured_PPG_Small_Single")
  const scopeCombinations = filesForSelectedScope.map(file => {
    const match = file.match(/Scope_\d+_(.+?)_\d{8}_\d{6}\.arrow$/);
    return match ? match[1] : null;
  }).filter((combination): combination is string => combination !== null);

  // Remove duplicates and create combination options
  const uniqueCombinations = [...new Set(scopeCombinations)].map(combination => ({
    value: combination,
    label: combination
  }));

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const fileId = `file_${Date.now()}`;
      onDataUpload(file, fileId);
    }
  };

  const handleModelSelection = (modelId: string, checked: boolean) => {
    let updatedModels = [...(data.selectedModels || [])];

    if (checked) {
      updatedModels.push(modelId);
    } else {
      updatedModels = updatedModels.filter(id => id !== modelId);
    }

    onDataChange({
      selectedModels: updatedModels
    });
  };

  const handleCombinationToggle = (combination: string, checked: boolean) => {
    const updatedCombinations = checked
      ? [...(data.selectedCombinations || []), combination]
      : (data.selectedCombinations || []).filter(c => c !== combination);
    
    onDataChange({ selectedCombinations: updatedCombinations });
  };

  const removeCombination = (combination: string) => {
    const updatedCombinations = data?.selectedCombinations?.filter(c => c !== combination) || [];
    onDataChange({ selectedCombinations: updatedCombinations });
  };

  const handleSelectAllCombinations = (checked: boolean) => {
    if (checked) {
      // Select all combinations
      const allCombinations = uniqueCombinations.map(option => option.value);
      onDataChange({ selectedCombinations: allCombinations });
    } else {
      // Deselect all combinations
      onDataChange({ selectedCombinations: [] });
    }
  };

  const handleSelectAllModels = (checked: boolean) => {
    
    // Ensure we have a valid boolean value
    const shouldSelectAll = Boolean(checked);
    
    if (shouldSelectAll) {
      // Select all models
      const allModelIds = availableModels.map(model => model.id);
      onDataChange({
        selectedModels: allModelIds
      });
    } else {
      // Deselect all models
      onDataChange({
        selectedModels: []
      });
    }
  };

  // Check if all combinations are selected
  const allCombinationsSelected = uniqueCombinations.length > 0 && 
    uniqueCombinations.every(option => data?.selectedCombinations?.includes(option.value));

  // Check if all models are selected
  const allModelsSelected = availableModels.length > 0 && 
    data?.selectedModels && 
    data.selectedModels.length > 0 &&
    availableModels.every(model => data.selectedModels.includes(model.id));
  
  return (
    <div className="space-y-6">
      {/* Select Data */}
      <Card>
        <div className="p-4 border-b bg-muted/30">
          <h4 className="font-medium text-foreground flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />
            Select Data
          </h4>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <Label>Scope Selection</Label>
            <Select value={data.selectedScope} onValueChange={(value) => {
              if (value !== data.selectedScope) {
                // Get combinations for the selected scope
                const scopeFiles = (data?.availableFiles || []).filter(file => 
                  typeof file === 'string' && file.includes(`Scope_${value}_`)
                );
                
                const scopeCombinations = scopeFiles.map(file => {
                  const match = file.match(/Scope_\d+_(.+?)_\d{8}_\d{6}\.arrow$/);
                  return match ? match[1] : null;
                }).filter((combination): combination is string => combination !== null);
                
                const uniqueCombinationsForScope = [...new Set(scopeCombinations)];
                
                // Automatically select all combinations for the new scope
                onDataChange({ 
                  selectedScope: value, 
                  selectedCombinations: uniqueCombinationsForScope 
                });
              }
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Select a scope number" />
              </SelectTrigger>
              <SelectContent>
                {scopeOptions.length > 0 ? (
                  scopeOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))
                ) : (
                  <SelectItem value="no-scopes" disabled>No scope files found</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            {/* Select All Checkbox */}
            {uniqueCombinations.length > 0 && (
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
                {uniqueCombinations.map(option => (
                  <div key={option.value} className="flex items-center space-x-2 p-2 border rounded hover:bg-muted/30">
                    <Checkbox
                      id={option.value}
                      checked={data?.selectedCombinations?.includes(option.value) || false}
                      onCheckedChange={(checked) => handleCombinationToggle(option.value, checked as boolean)}
                    />
                    <Label htmlFor={option.value} className="text-sm truncate">{option.label}</Label>
                  </div>
                ))}
              </div>
            </div>
          </div>
          {data?.uploadedFile && (
            <p className="text-sm text-muted-foreground mt-2">
              Uploaded: {data.uploadedFile.name}
            </p>
          )}
        </div>
      </Card>

      {/* Select Model */}
      <Card>
        <div className="p-4 border-b bg-muted/30">
          <h4 className="font-medium text-foreground flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            Select Model
          </h4>
        </div>
        <div className="p-4 space-y-4">
          {/* Select All Models Checkbox */}
          <div className="mb-3 p-2 border rounded bg-muted/20">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="select-all-models"
                checked={allModelsSelected}
                onCheckedChange={(checked) => {
                  
                  // Ensure checked is a boolean
                  const isChecked = checked === true;
                  handleSelectAllModels(isChecked);
                }}
              />
              <Label htmlFor="select-all-models" className="text-sm font-medium">
                Select All Models
              </Label>
            </div>
          </div>
          
          <div className="space-y-3 mt-2">
            {availableModels.map(model => (
              <div key={model.id} className="flex items-center space-x-2">
                <Checkbox
                  id={model.id}
                  checked={data?.selectedModels?.includes(model.id) || false}
                  onCheckedChange={(checked) => handleModelSelection(model.id, checked as boolean)}
                />
                <Label htmlFor={model.id} className="text-sm">{model.name}</Label>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Output Configuration */}
      <Card>
        <div className="p-4 border-b bg-muted/30">
          <h4 className="font-medium text-foreground flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-primary" />
            Output Configuration
          </h4>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <Label>Output File Name</Label>
            <Input
              type="text"
              value={data.outputFileName || ''}
              onChange={(e) => onDataChange({ outputFileName: e.target.value })}
              placeholder="Enter output file name"
              className="mt-1"
            />
          </div>
        </div>
      </Card>
    </div>
  );
};

export default AutoRegressiveModelsSettings;
