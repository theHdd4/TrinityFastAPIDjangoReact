import React, { useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Database, Target, Cpu } from 'lucide-react';
import { VALIDATE_API } from '@/lib/api';
import { BuildModelFeatureBasedData, BuildModelFeatureBasedSettings as SettingsType, ModelConfig } from '../BuildModelFeatureBasedAtom';

interface BuildModelFeatureBasedSettingsProps {
  data: BuildModelFeatureBasedData;
  settings: SettingsType;
  onDataChange: (data: Partial<BuildModelFeatureBasedData>) => void;
  onSettingsChange: (settings: Partial<SettingsType>) => void;
  onDataUpload: (file: File, fileId: string) => void;
}

const availableModels = [
  { id: 'Linear Regression', name: 'Linear Regression', params: [] },
  { id: 'Ridge Regression', name: 'Ridge Regression', params: ['Alpha'] },
  { id: 'Lasso Regression', name: 'Lasso Regression', params: ['Alpha'] },
  { id: 'ElasticNet Regression', name: 'ElasticNet Regression', params: ['Alpha', 'L1 Ratio'] },
  { id: 'Bayesian Ridge Regression', name: 'Bayesian Ridge Regression', params: [] },
  { id: 'Custom Constrained Ridge', name: 'Custom Constrained Ridge', params: ['L2 Penalty', 'Learning Rate', 'Iterations', 'Adam'] },
  { id: 'Constrained Linear Regression', name: 'Constrained Linear Regression', params: ['Learning Rate', 'Iterations', 'Adam'] }
];

const BuildModelFeatureBasedSettings: React.FC<BuildModelFeatureBasedSettingsProps> = ({
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

  // Settings data processing

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
    let updatedModels = [...data.selectedModels];
    let updatedConfigs = [...data.modelConfigs];

    if (checked) {
      updatedModels.push(modelId);
      const model = availableModels.find(m => m.id === modelId);
      if (model) {
        // Get default parameters from the default data structure
        const defaultModelConfigs = [
          { id: 'Linear Regression', name: 'Linear Regression', parameters: {} },
          { id: 'Ridge Regression', name: 'Ridge Regression', parameters: { 'Alpha': '1.0' } },
          { id: 'Lasso Regression', name: 'Lasso Regression', parameters: { 'Alpha': '1.0' } },
          { id: 'ElasticNet Regression', name: 'ElasticNet Regression', parameters: { 'Alpha': '1.0', 'L1 Ratio': '0.5' } },
          { id: 'Bayesian Ridge Regression', name: 'Bayesian Ridge Regression', parameters: {} },
          { id: 'Custom Constrained Ridge', name: 'Custom Constrained Ridge', parameters: { 'L2 Penalty': '0.1', 'Learning Rate': '0.001', 'Iterations': '10000', 'Adam': 'false' } },
          { id: 'Constrained Linear Regression', name: 'Constrained Linear Regression', parameters: { 'Learning Rate': '0.001', 'Iterations': '10000', 'Adam': 'false' } }
        ];
        
        // Find the default config for this model
        const defaultConfig = defaultModelConfigs.find(config => config.id === modelId);
        const defaultParams = defaultConfig?.parameters || {};
        
        // Ensure all required parameters have default values
        model.params.forEach(param => {
          if (!(param in defaultParams)) {
            defaultParams[param] = '';
          }
        });
        
        updatedConfigs.push({
          id: modelId,
          name: model.name,
          parameters: defaultParams
        });
      }
    } else {
      updatedModels = updatedModels.filter(id => id !== modelId);
      updatedConfigs = updatedConfigs.filter(config => config.id !== modelId);
    }

    onDataChange({
      selectedModels: updatedModels,
      modelConfigs: updatedConfigs
    });
  };

  const handleParameterChange = (modelId: string, paramName: string, value: string) => {
    const updatedConfigs = data.modelConfigs.map(config => {
      if (config.id === modelId) {
        return {
          ...config,
          parameters: {
            ...config.parameters,
            [paramName]: value
          }
        };
      }
      return config;
    });

    onDataChange({ modelConfigs: updatedConfigs });
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
    if (checked) {
      // Select all models
      const allModelIds = availableModels.map(model => model.id);
      const allModelConfigs = availableModels.map(model => {
        const defaultParams: Record<string, any> = {};
        model.params.forEach(param => {
          // Set default values based on model type
          if (param === 'Alpha') defaultParams[param] = '1.0';
          else if (param === 'L1 Ratio') defaultParams[param] = '0.5';
          else if (param === 'L2 Penalty') defaultParams[param] = '0.1';
          else if (param === 'Learning Rate') defaultParams[param] = '0.001';
          else if (param === 'Iterations') defaultParams[param] = '10000';
          else if (param === 'Adam') defaultParams[param] = 'false';
          else defaultParams[param] = '';
        });
        return {
          id: model.id,
          name: model.name,
          parameters: defaultParams
        };
      });
      onDataChange({
        selectedModels: allModelIds,
        modelConfigs: allModelConfigs
      });
    } else {
      // Deselect all models
      onDataChange({
        selectedModels: [],
        modelConfigs: []
      });
    }
  };

  // Check if all combinations are selected
  const allCombinationsSelected = uniqueCombinations.length > 0 && 
    uniqueCombinations.every(option => data?.selectedCombinations?.includes(option.value));

  // Check if all models are selected
  const allModelsSelected = availableModels.length > 0 && 
    availableModels.every(model => data?.selectedModels?.includes(model.id));
  
  // Debug logging to ensure the logic works correctly
  console.log('🔧 Settings: availableModels:', availableModels.map(m => m.id));
  console.log('🔧 Settings: data.selectedModels:', data?.selectedModels);
  console.log('🔧 Settings: allModelsSelected:', allModelsSelected);

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
            
            {/* <Label>Select File from Bucket</Label> */}
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
            <Cpu className="w-4 h-4 text-primary" />
            Select Model
          </h4>
        </div>
        <div className="p-4 space-y-4">
          {/* Training Parameters */}
          <div className="space-y-4">
            <div>
              <Label>K-Fold Cross Validation</Label>
              <Input
                type="number"
                min="2"
                max="10"
                value={data?.kFolds || 5}
                onChange={(e) => onDataChange({ kFolds: parseInt(e.target.value) || 5 })}
                placeholder="5"
                className="mt-1"
              />
            </div>
            
            <div>
              <Label>Test Size Ratio</Label>
              <Input
                type="number"
                min="0.1"
                max="0.5"
                step="0.1"
                value={data?.testSize || 0.2}
                onChange={(e) => onDataChange({ testSize: parseFloat(e.target.value) || 0.2 })}
                placeholder="0.2"
                className="mt-1"
              />
              {/* <p className="text-xs text-muted-foreground mt-1">Ratio of data for testing (0.1-0.5)</p> */}
            </div>
          </div>
          
          {/* Separator Line */}
          <div className="border-t border-blue-200 my-4"></div>
          
          <div>
            {/* Select All Models Checkbox */}
            <div className="mb-3 p-2 border rounded bg-muted/20">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="select-all-models"
                  checked={allModelsSelected}
                  onCheckedChange={(checked) => handleSelectAllModels(checked as boolean)}
                />
                <Label htmlFor="select-all-models" className="text-sm font-medium">
                  Select All Models
                </Label>
              </div>
            </div>
            
            {/* <Label>Multi Selection</Label> */}
            <div className="space-y-3 mt-2">
              {availableModels.map(model => (
                <div key={model.id} className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id={model.id}
                      checked={data?.selectedModels?.includes(model.id) || false}
                      onCheckedChange={(checked) => handleModelSelection(model.id, checked as boolean)}
                    />
                    <Label htmlFor={model.id} className="text-sm">{model.name}</Label>
                  </div>
                  
                  {data?.selectedModels?.includes(model.id) && (
                    <div className="ml-6 space-y-2 border-l-2 border-border pl-4">
                      {model.params.map(param => {
                        const config = data?.modelConfigs?.find(c => c.id === model.id);
                        const value = config?.parameters?.[param] || '';
                        
                        return (
                          <div key={param}>
                            <Label className="text-xs text-muted-foreground">{param}</Label>
                            <Input
                              value={value}
                              onChange={(e) => handleParameterChange(model.id, param, e.target.value)}
                              placeholder="Insert Value"
                              className="mt-1"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>


    </div>
  );
};

export default BuildModelFeatureBasedSettings;