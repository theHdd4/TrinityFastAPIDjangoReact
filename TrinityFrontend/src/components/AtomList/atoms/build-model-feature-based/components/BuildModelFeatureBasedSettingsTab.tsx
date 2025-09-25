import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { SwitchBuild } from '@/components/ui/switch_build';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Cpu, Database, ChevronDown, ChevronRight } from 'lucide-react';
import { BuildModelFeatureBasedData, ModelConfig } from '../BuildModelFeatureBasedAtom';
import { VALIDATE_API, BUILD_MODEL_API } from '@/lib/api';

interface BuildModelFeatureBasedSettingsTabProps {
  data: BuildModelFeatureBasedData;
  onDataChange: (data: Partial<BuildModelFeatureBasedData>) => void;
}

const individualModels = [
  { id: 'Linear Regression', name: 'Linear Regression', params: [], supportsAutoTuning: false },
  { id: 'Ridge Regression', name: 'Ridge Regression', params: ['Alpha'], supportsAutoTuning: true },
  { id: 'Lasso Regression', name: 'Lasso Regression', params: ['Alpha'], supportsAutoTuning: true },
  { id: 'ElasticNet Regression', name: 'ElasticNet Regression', params: ['Alpha', 'L1 Ratio'], supportsAutoTuning: true },
  { id: 'Bayesian Ridge Regression', name: 'Bayesian Ridge Regression', params: [], supportsAutoTuning: false },
  { id: 'Custom Constrained Ridge', name: 'Custom Constrained Ridge', params: ['L2 Penalty', 'Learning Rate', 'Iterations', 'Adam'], supportsAutoTuning: true },
  { id: 'Constrained Linear Regression', name: 'Constrained Linear Regression', params: ['Learning Rate', 'Iterations', 'Adam'], supportsAutoTuning: false }
];

const stackModels = [
  { id: 'Linear Regression', name: 'Linear Regression', params: [], supportsAutoTuning: false },
  { id: 'Ridge Regression', name: 'Ridge Regression', params: ['Alpha'], supportsAutoTuning: true },
  { id: 'Lasso Regression', name: 'Lasso Regression', params: ['Alpha'], supportsAutoTuning: true },
  { id: 'ElasticNet Regression', name: 'ElasticNet Regression', params: ['Alpha', 'L1 Ratio'], supportsAutoTuning: true },
  { id: 'Bayesian Ridge Regression', name: 'Bayesian Ridge Regression', params: [], supportsAutoTuning: false },
  { id: 'Constrained Ridge', name: 'Constrained Ridge', params: ['L2 Penalty', 'Learning Rate', 'Iterations', 'Adam'], supportsAutoTuning: true },
  { id: 'Constrained Linear Regression', name: 'Constrained Linear Regression', params: ['Learning Rate', 'Iterations', 'Adam'], supportsAutoTuning: false }
];

const BuildModelFeatureBasedSettingsTab: React.FC<BuildModelFeatureBasedSettingsTabProps> = ({
  data,
  onDataChange
}) => {
  // State for numerical columns and pool identifiers
  const [numericalColumns, setNumericalColumns] = useState<string[]>([]);
  const [isLoadingColumns, setIsLoadingColumns] = useState(false);
  const [poolIdentifiers, setPoolIdentifiers] = useState<string[]>([]);
  const [isLoadingIdentifiers, setIsLoadingIdentifiers] = useState(false);
  const [isIndividualModelingCollapsed, setIsIndividualModelingCollapsed] = useState(false);
  const [isStackModelingCollapsed, setIsStackModelingCollapsed] = useState(false);

  // Fetch numerical columns when scope and combinations are selected
  useEffect(() => {
    const fetchNumericalColumns = async () => {
      if (data?.selectedScope && data?.selectedCombinations && data.selectedCombinations.length > 0) {
        setIsLoadingColumns(true);
        try {
          // Use the first selected combination to get column info
          const firstCombination = data.selectedCombinations[0];
          
          // Create URLSearchParams for form data
          const formData = new URLSearchParams();
          formData.append('scope', data.selectedScope);
          formData.append('combination', firstCombination);
          
          const response = await fetch(`${BUILD_MODEL_API}/get_columns`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: formData
          });
          
          if (response.ok) {
            const responseData = await response.json();
            console.log('Fetched columns response:', responseData);
            
            // Use the numerical_columns directly from the backend response
            const numericalCols = responseData.numerical_columns || [];
            console.log('Numerical columns:', numericalCols);
            setNumericalColumns(numericalCols);
          } else {
            console.error('Failed to fetch numerical columns:', response.status, response.statusText);
            setNumericalColumns([]);
          }
        } catch (error) {
          console.error('Error fetching numerical columns:', error);
          setNumericalColumns([]);
        } finally {
          setIsLoadingColumns(false);
        }
      }
    };

    fetchNumericalColumns();
  }, [data?.selectedScope, data?.selectedCombinations]);

  // Fetch pool identifiers when scope is selected
  useEffect(() => {
    const fetchPoolIdentifiers = async () => {
      if (data?.selectedScope) {
        setIsLoadingIdentifiers(true);
        try {
          const response = await fetch(`${BUILD_MODEL_API}/pool-identifiers/${data.selectedScope}`);
          
          if (response.ok) {
            const responseData = await response.json();
            const identifiers = responseData.identifiers || [];
            console.log('Fetched pool identifiers:', identifiers);
            setPoolIdentifiers(identifiers);
          } else {
            console.error('Failed to fetch pool identifiers:', response.status, response.statusText);
            setPoolIdentifiers([]);
          }
        } catch (error) {
          console.error('Error fetching pool identifiers:', error);
          setPoolIdentifiers([]);
        } finally {
          setIsLoadingIdentifiers(false);
        }
      } else {
        setPoolIdentifiers([]);
      }
    };

    fetchPoolIdentifiers();
  }, [data?.selectedScope]);
  const handleModelSelection = (modelId: string, checked: boolean) => {
    let updatedModels = [...data.selectedModels];
    let updatedConfigs = [...data.modelConfigs];

    if (checked) {
      updatedModels.push(modelId);
      const model = individualModels.find(m => m.id === modelId);
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
          parameters: defaultParams,
          tuning_mode: model.supportsAutoTuning ? 'auto' : 'manual'
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

  const handleTuningModeChange = (modelId: string, tuningMode: string) => {
    const updatedConfigs = data.modelConfigs.map(config => {
      if (config.id === modelId) {
        return {
          ...config,
          tuning_mode: tuningMode
        };
      }
      return config;
    });

    onDataChange({ modelConfigs: updatedConfigs });
  };

  const handleSelectAllModels = (checked: boolean) => {
    if (checked) {
      // Select all models
      const allModelIds = individualModels.map(model => model.id);
      const allModelConfigs = individualModels.map(model => {
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
          parameters: defaultParams,
          tuning_mode: model.supportsAutoTuning ? 'auto' : 'manual'
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

  // Check if all models are selected
  const allModelsSelected = individualModels.length > 0 && 
    individualModels.every(model => data?.selectedModels?.includes(model.id));

  return (
    <div className="space-y-6">
      {/* Individual Modeling */}
      <Card>
        <div className="p-4 border-b bg-muted/30">
          <div 
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setIsIndividualModelingCollapsed(!isIndividualModelingCollapsed)}
          >
          <h4 className="font-medium text-foreground flex items-center gap-2">
            <Cpu className="w-4 h-4 text-primary" />
              Individual Modeling
          </h4>
            {isIndividualModelingCollapsed ? (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>
        {!isIndividualModelingCollapsed && (
        <div className="p-4 space-y-4">
          {/* Enable Individual Modeling Toggle */}
          <div className="flex items-center space-x-2">
            <SwitchBuild
              id="individual-modeling"
              checked={data?.individualModeling ?? true}
              onCheckedChange={(checked) => onDataChange({ individualModeling: !!checked })}
            />
            <Label htmlFor="individual-modeling" className="text-sm font-medium">
              Enable Individual Modeling
            </Label>
          </div>

          {/* Individual Modeling Configuration - Only show when enabled */}
          {data?.individualModeling && (
            <div className="space-y-4 pl-6 border-l-2 border-border">
          {/* Training Parameters */}
          <div className="space-y-4">
            <div>
              <Label>K-Fold Cross Validation</Label>
              <Input
                type="number"
                min="2"
                max="10"
                    value={data?.individualKFolds || 5}
                    onChange={(e) => onDataChange({ individualKFolds: parseInt(e.target.value) || 5 })}
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
                    value={data?.individualTestSize || 0.2}
                    onChange={(e) => onDataChange({ individualTestSize: parseFloat(e.target.value) || 0.2 })}
                placeholder="0.2"
                className="mt-1"
              />
            </div>
          </div>
          
          {/* Separator Line */}
          <div className="border-t border-blue-200 my-4"></div>
          
          <div>
                {/* Select All Individual Models Checkbox */}
            <div className="mb-3 p-2 border rounded bg-muted/20">
              <div className="flex items-center space-x-2">
                <SwitchBuild
                      id="select-all-individual-models"
                      checked={data?.individualSelectedModels?.length === individualModels.length}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          const allModelIds = individualModels.map(model => model.id);
                          const allModelConfigs = individualModels.map(model => {
                            const defaultParams: Record<string, any> = {};
                            model.params.forEach(param => {
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
                              parameters: defaultParams,
                              tuning_mode: model.supportsAutoTuning ? 'auto' : 'manual'
                            };
                          });
                          onDataChange({
                            individualSelectedModels: allModelIds,
                            individualModelConfigs: allModelConfigs
                          });
                        } else {
                          onDataChange({
                            individualSelectedModels: [],
                            individualModelConfigs: []
                          });
                        }
                      }}
                    />
                    <Label htmlFor="select-all-individual-models" className="text-sm font-medium">
                  Select All Models
                </Label>
              </div>
            </div>
            
            <div className="space-y-3 mt-2">
              {individualModels.map(model => (
                <div key={model.id} className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <SwitchBuild
                          id={`individual-${model.id}`}
                          checked={data?.individualSelectedModels?.includes(model.id) || false}
                          onCheckedChange={(checked) => {
                            const current = data?.individualSelectedModels || [];
                            const currentConfigs = data?.individualModelConfigs || [];
                            
                            if (checked) {
                              const updatedModels = [...current, model.id];
                              const defaultParams: Record<string, any> = {};
                              model.params.forEach(param => {
                                if (param === 'Alpha') defaultParams[param] = '1.0';
                                else if (param === 'L1 Ratio') defaultParams[param] = '0.5';
                                else if (param === 'L2 Penalty') defaultParams[param] = '0.1';
                                else if (param === 'Learning Rate') defaultParams[param] = '0.001';
                                else if (param === 'Iterations') defaultParams[param] = '10000';
                                else if (param === 'Adam') defaultParams[param] = 'false';
                                else defaultParams[param] = '';
                              });
                              const updatedConfigs = [...currentConfigs, {
                                id: model.id,
                                name: model.name,
                                parameters: defaultParams,
                                tuning_mode: model.supportsAutoTuning ? 'auto' : 'manual'
                              }];
                              onDataChange({
                                individualSelectedModels: updatedModels,
                                individualModelConfigs: updatedConfigs
                              });
                            } else {
                              const updatedModels = current.filter(id => id !== model.id);
                              const updatedConfigs = currentConfigs.filter(config => config.id !== model.id);
                              onDataChange({
                                individualSelectedModels: updatedModels,
                                individualModelConfigs: updatedConfigs
                              });
                            }
                          }}
                        />
                        <Label htmlFor={`individual-${model.id}`} className="text-sm">{model.name}</Label>
                      </div>
                      
                      {data?.individualSelectedModels?.includes(model.id) && (
                        <div className="ml-6 space-y-2 border-l-2 border-border pl-4">
                          {/* Manual Parameters Toggle - Only show for models that support auto tuning */}
                          {model.supportsAutoTuning && (
                            <div className="flex items-center space-x-2">
                              <Checkbox
                                id={`manual-params-${model.id}`}
                                checked={data?.individualModelConfigs?.find(c => c.id === model.id)?.tuning_mode === 'manual'}
                                onCheckedChange={(checked) => {
                                  const updatedConfigs = (data?.individualModelConfigs || []).map(c => {
                                    if (c.id === model.id) {
                                      return {
                                        ...c,
                                        tuning_mode: checked ? 'manual' : 'auto'
                                      };
                                    }
                                    return c;
                                  });
                                  onDataChange({ individualModelConfigs: updatedConfigs });
                                }}
                              />
                              <Label htmlFor={`manual-params-${model.id}`} className="text-xs text-muted-foreground">
                                Use Manual Parameters (default: auto-tuning)
                              </Label>
                            </div>
                          )}
                          
                {/* Parameters - Only show when manual tuning is selected or model doesn't support auto tuning */}
                {(!model.supportsAutoTuning || (data?.individualModelConfigs?.find(c => c.id === model.id)?.tuning_mode === 'manual')) && model.params.map(param => {
                  // For Custom Constrained Ridge with auto tuning, hide L2 Penalty parameter
                  if (model.id === 'Custom Constrained Ridge' && 
                      data?.individualModelConfigs?.find(c => c.id === model.id)?.tuning_mode === 'auto' && 
                      param === 'L2 Penalty') {
                    return null;
                  }
                            const config = data?.individualModelConfigs?.find(c => c.id === model.id);
                            const value = config?.parameters?.[param] || '';
                            
                            return (
                              <div key={param}>
                                <Label className="text-xs text-muted-foreground">{param}</Label>
                                <Input
                                  value={value}
                                  onChange={(e) => {
                                    const updatedConfigs = (data?.individualModelConfigs || []).map(c => {
                                      if (c.id === model.id) {
                                        return {
                                          ...c,
                                          parameters: {
                                            ...c.parameters,
                                            [param]: e.target.value
                                          }
                                        };
                                      }
                                      return c;
                                    });
                                    onDataChange({ individualModelConfigs: updatedConfigs });
                                  }}
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
          )}
          </div>
        )}
      </Card>

      {/* Stack Modeling */}
      <Card>
        <div className="p-4 border-b bg-muted/30">
          <div 
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setIsStackModelingCollapsed(!isStackModelingCollapsed)}
          >
            <h4 className="font-medium text-foreground flex items-center gap-2">
              <Cpu className="w-4 h-4 text-primary" />
              Stack Modeling
            </h4>
            {isStackModelingCollapsed ? (
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>
        {!isStackModelingCollapsed && (
          <div className="p-4 space-y-4">
          {/* Enable Stack Modeling Toggle */}
          <div className="flex items-center space-x-2">
            <SwitchBuild
              id="stack-modeling"
              checked={data?.stackModeling || false}
              onCheckedChange={(checked) => onDataChange({ stackModeling: checked as boolean })}
            />
            <Label htmlFor="stack-modeling" className="text-sm font-medium">
              Enable Stack Modeling
            </Label>
          </div>

          {/* Stack Modeling Configuration - Only show when enabled */}
          {data?.stackModeling && (
            <div className="space-y-4 pl-6 border-l-2 border-border">
              {/* Pool by Identifiers */}
              <div>
                <Label className="text-sm font-medium">Pool by Identifiers</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="outline" 
                      className="w-full justify-between mt-2"
                      disabled={isLoadingIdentifiers}
                    >
                      <span>
                        {isLoadingIdentifiers 
                          ? "Loading..." 
                          : data?.poolByIdentifiers?.length > 0 
                            ? `${data.poolByIdentifiers.length} identifier${data.poolByIdentifiers.length > 1 ? 's' : ''} selected`
                            : "Select Identifiers"
                        }
                      </span>
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="bg-white border-gray-200 max-h-60 overflow-y-auto w-56 p-2">
                    {isLoadingIdentifiers ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">Loading identifiers...</div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 py-1 border-b mb-2">
                          <Checkbox
                            checked={data?.poolByIdentifiers?.length === poolIdentifiers.length}
                            onCheckedChange={(checked) => {
                              onDataChange({ poolByIdentifiers: checked ? poolIdentifiers : [] });
                            }}
                          />
                          <span className="text-sm font-medium">Select All</span>
                        </div>
                        {poolIdentifiers.map(identifier => {
                          const isChecked = data?.poolByIdentifiers?.includes(identifier) || false;
                          return (
                            <div key={identifier} className="flex items-center gap-2 py-1">
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={(checked) => {
                                  const current = data?.poolByIdentifiers || [];
                                  const updated = checked 
                                    ? [...current, identifier]
                                    : current.filter(id => id !== identifier);
                                  onDataChange({ poolByIdentifiers: updated });
                                }}
                              />
                              <span className="text-sm">{identifier}</span>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </PopoverContent>
                </Popover>
              </div>

              {/* Numerical Columns for Clustering */}
              <div>
                <Label className="text-sm font-medium">Columns for Clustering</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button 
                      variant="outline" 
                      className="w-full justify-between mt-2"
                      disabled={isLoadingColumns}
                    >
                      <span>
                        {isLoadingColumns 
                          ? "Loading..." 
                          : data?.numericalColumnsForClustering?.length > 0 
                            ? `${data.numericalColumnsForClustering.length} column${data.numericalColumnsForClustering.length > 1 ? 's' : ''} selected`
                            : "Select Columns"
                        }
                      </span>
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="bg-white border-gray-200 max-h-60 overflow-y-auto w-56 p-2">
                    {isLoadingColumns ? (
                      <div className="px-2 py-1.5 text-sm text-muted-foreground">Loading numerical columns...</div>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 py-1 border-b mb-2">
                          <Checkbox
                            checked={data?.numericalColumnsForClustering?.length === numericalColumns.length}
                            onCheckedChange={(checked) => {
                              onDataChange({ 
                                numericalColumnsForClustering: checked ? numericalColumns : [] 
                              });
                            }}
                          />
                          <span className="text-sm font-medium">Select All</span>
                        </div>
                        {numericalColumns.map(column => {
                          const isChecked = data?.numericalColumnsForClustering?.includes(column) || false;
                          return (
                            <div key={column} className="flex items-center gap-2 py-1">
                              <Checkbox
                                checked={isChecked}
                                onCheckedChange={(checked) => {
                                  const current = data?.numericalColumnsForClustering || [];
                                  const updated = checked 
                                    ? [...current, column]
                                    : current.filter(col => col !== column);
                                  onDataChange({ numericalColumnsForClustering: updated });
                                }}
                              />
                              <span className="text-sm">{column}</span>
                            </div>
                          );
                        })}
                      </>
                    )}
                  </PopoverContent>
                </Popover>
              </div>

              
              {/* Separator Line */}
              <div className="border-t border-blue-200 my-4"></div>
              
              {/* Stack Modeling Training Parameters */}
              <div className="space-y-4">
                <div>
                  <Label>K-Fold Cross Validation</Label>
                  <Input
                    type="number"
                    min="2"
                    max="10"
                    value={data?.stackKFolds || 5}
                    onChange={(e) => onDataChange({ stackKFolds: parseInt(e.target.value) || 5 })}
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
                    value={data?.stackTestSize || 0.2}
                    onChange={(e) => onDataChange({ stackTestSize: parseFloat(e.target.value) || 0.2 })}
                    placeholder="0.2"
                    className="mt-1"
                  />
                </div>
              </div>
              
              {/* Separator Line */}
              <div className="border-t border-blue-200 my-4"></div>
              
              {/* Stack Modeling Models Selection */}
              <div>
                {/* Select All Stack Models Checkbox */}
                <div className="mb-3 p-2 border rounded bg-muted/20">
                  <div className="flex items-center space-x-2">
                    <SwitchBuild
                      id="select-all-stack-models"
                      checked={data?.stackSelectedModels?.length === stackModels.length}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          const allModelIds = stackModels.map(model => model.id);
                          const allModelConfigs = stackModels.map(model => {
                            const defaultParams: Record<string, any> = {};
                            model.params.forEach(param => {
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
                              parameters: defaultParams,
                              tuning_mode: model.supportsAutoTuning ? 'auto' : 'manual'
                            };
                          });
                          onDataChange({
                            stackSelectedModels: allModelIds,
                            stackModelConfigs: allModelConfigs
                          });
                        } else {
                          onDataChange({
                            stackSelectedModels: [],
                            stackModelConfigs: []
                          });
                        }
                      }}
                    />
                    <Label htmlFor="select-all-stack-models" className="text-sm font-medium">
                      Select All Stack Models
                    </Label>
                  </div>
                </div>
                
                <Label className="text-sm font-medium mb-3 block">Select Stack Models</Label>
                <div className="space-y-3">
                  {stackModels.map(model => (
                    <div key={model.id}>
                      <div className="flex items-center space-x-2">
                        <SwitchBuild
                          id={`stack-${model.id}`}
                          checked={data?.stackSelectedModels?.includes(model.id) || false}
                          onCheckedChange={(checked) => {
                            const current = data?.stackSelectedModels || [];
                            const currentConfigs = data?.stackModelConfigs || [];
                            
                            if (checked) {
                              const updatedModels = [...current, model.id];
                              const defaultParams: Record<string, any> = {};
                              model.params.forEach(param => {
                                if (param === 'Alpha') defaultParams[param] = '1.0';
                                else if (param === 'L1 Ratio') defaultParams[param] = '0.5';
                                else if (param === 'L2 Penalty') defaultParams[param] = '0.1';
                                else if (param === 'Learning Rate') defaultParams[param] = '0.001';
                                else if (param === 'Iterations') defaultParams[param] = '10000';
                                else if (param === 'Adam') defaultParams[param] = 'false';
                                else defaultParams[param] = '';
                              });
                              const updatedConfigs = [...currentConfigs, {
                                id: model.id,
                                name: model.name,
                                parameters: defaultParams,
                                tuning_mode: model.supportsAutoTuning ? 'auto' : 'manual'
                              }];
                              onDataChange({
                                stackSelectedModels: updatedModels,
                                stackModelConfigs: updatedConfigs
                              });
                            } else {
                              const updatedModels = current.filter(id => id !== model.id);
                              const updatedConfigs = currentConfigs.filter(config => config.id !== model.id);
                              onDataChange({
                                stackSelectedModels: updatedModels,
                                stackModelConfigs: updatedConfigs
                              });
                            }
                          }}
                        />
                        <Label htmlFor={`stack-${model.id}`} className="text-sm">{model.name}</Label>
                  </div>
                  
                      {data?.stackSelectedModels?.includes(model.id) && (
                    <div className="ml-6 space-y-2 border-l-2 border-border pl-4">
                      {/* Manual Parameters Toggle - Only show for models that support auto tuning */}
                      {model.supportsAutoTuning && (
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id={`manual-params-stack-${model.id}`}
                            checked={data?.stackModelConfigs?.find(c => c.id === model.id)?.tuning_mode === 'manual'}
                            onCheckedChange={(checked) => {
                              const updatedConfigs = (data?.stackModelConfigs || []).map(c => {
                                if (c.id === model.id) {
                                  return {
                                    ...c,
                                    tuning_mode: checked ? 'manual' : 'auto'
                                  };
                                }
                                return c;
                              });
                              onDataChange({ stackModelConfigs: updatedConfigs });
                            }}
                          />
                          <Label htmlFor={`manual-params-stack-${model.id}`} className="text-xs text-muted-foreground">
                            Use Manual Parameters (default: auto-tuning)
                          </Label>
                        </div>
                      )}
                      
                      {/* Parameters - Only show when manual tuning is selected or model doesn't support auto tuning */}
                      {(!model.supportsAutoTuning || (data?.stackModelConfigs?.find(c => c.id === model.id)?.tuning_mode === 'manual')) && model.params.map(param => {
                            const config = data?.stackModelConfigs?.find(c => c.id === model.id);
                        const value = config?.parameters?.[param] || '';
                        
                        // Hide L2 Penalty parameter for Stack Constrained Ridge when auto-tuning is enabled
                        if (model.id === 'Stack Constrained Ridge' && 
                            data?.stackModelConfigs?.find(c => c.id === model.id)?.tuning_mode === 'auto' && 
                            param === 'L2 Penalty') {
                          return null;
                        }
                        
                        return (
                          <div key={param}>
                            <Label className="text-xs text-muted-foreground">{param}</Label>
                            <Input
                              value={value}
                                  onChange={(e) => {
                                    const updatedConfigs = (data?.stackModelConfigs || []).map(c => {
                                      if (c.id === model.id) {
                                        return {
                                          ...c,
                                          parameters: {
                                            ...c.parameters,
                                            [param]: e.target.value
                                          }
                                        };
                                      }
                                      return c;
                                    });
                                    onDataChange({ stackModelConfigs: updatedConfigs });
                                  }}
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
          )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default BuildModelFeatureBasedSettingsTab;
