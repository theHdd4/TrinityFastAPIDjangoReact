import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Upload, Database, Target, Cpu } from 'lucide-react';
import { BuildModelFeatureBasedData, BuildModelFeatureBasedSettings as SettingsType, ModelConfig } from '../BuildModelFeatureBasedAtom';

interface BuildModelFeatureBasedSettingsProps {
  data: BuildModelFeatureBasedData;
  settings: SettingsType;
  onDataChange: (data: Partial<BuildModelFeatureBasedData>) => void;
  onSettingsChange: (settings: Partial<SettingsType>) => void;
  onDataUpload: (file: File, fileId: string) => void;
}

const availableModels = [
  { id: 'linear-regression', name: 'Linear Regression', params: ['Learning Rate', 'Max Iterations', 'Tolerance'] },
  { id: 'random-forest', name: 'Random Forest', params: ['N Estimators', 'Max Depth', 'Min Samples Split'] },
  { id: 'svm', name: 'Support Vector Machine', params: ['C Parameter', 'Kernel', 'Gamma'] },
  { id: 'neural-network', name: 'Neural Network', params: ['Hidden Layers', 'Learning Rate', 'Epochs'] }
];

const BuildModelFeatureBasedSettings: React.FC<BuildModelFeatureBasedSettingsProps> = ({
  data,
  settings,
  onDataChange,
  onSettingsChange,
  onDataUpload
}) => {
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
        const defaultParams: Record<string, any> = {};
        model.params.forEach(param => {
          defaultParams[param] = '';
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
            <Label>Single Selection</Label>
            <Select value={data.selectedDataset} onValueChange={(value) => onDataChange({ selectedDataset: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Sales Data" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sales-data">Sales Data</SelectItem>
                <SelectItem value="marketing-data">Marketing Data</SelectItem>
                <SelectItem value="customer-data">Customer Data</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="file-upload">Upload File</Label>
            <div className="mt-2">
              <Input
                id="file-upload"
                type="file"
                accept=".csv,.xlsx,.json"
                onChange={handleFileUpload}
                className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
              />
            </div>
            {data.uploadedFile && (
              <p className="text-sm text-muted-foreground mt-2">
                Uploaded: {data.uploadedFile.name}
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Select Scope */}
      <Card>
        <div className="p-4 border-b bg-muted/30">
          <h4 className="font-medium text-foreground flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            Select Scope
          </h4>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <Label>Multi Selection</Label>
            <Select value={data.selectedScope} onValueChange={(value) => onDataChange({ selectedScope: value })}>
              <SelectTrigger>
                <SelectValue placeholder="Select scope" />
              </SelectTrigger>
              <SelectContent>
                {data.scopes.map(scope => (
                  <SelectItem key={scope} value={scope}>{scope}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="space-y-2">
            {data.scopes.map((scope, index) => (
              <div key={scope} className="flex justify-between items-center">
                <span className="text-sm">{scope}</span>
                <Button variant="ghost" size="sm">×</Button>
              </div>
            ))}
          </div>
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
          <div>
            <Label>Multi Selection</Label>
            <div className="space-y-3 mt-2">
              {availableModels.map(model => (
                <div key={model.id} className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id={model.id}
                      checked={data.selectedModels.includes(model.id)}
                      onCheckedChange={(checked) => handleModelSelection(model.id, checked as boolean)}
                    />
                    <Label htmlFor={model.id} className="text-sm">{model.name}</Label>
                  </div>
                  
                  {data.selectedModels.includes(model.id) && (
                    <div className="ml-6 space-y-2 border-l-2 border-border pl-4">
                      {model.params.map(param => {
                        const config = data.modelConfigs.find(c => c.id === model.id);
                        const value = config?.parameters[param] || '';
                        
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

      {/* Output File */}
      <Card>
        <div className="p-4 border-b bg-muted/30">
          <h4 className="font-medium text-foreground flex items-center gap-2">
            <Upload className="w-4 h-4 text-primary" />
            Output File
          </h4>
        </div>
        <div className="p-4">
          <div>
            <Label>File Name</Label>
            <Input
              value={data.outputFileName}
              onChange={(e) => onDataChange({ outputFileName: e.target.value })}
              placeholder="Enter file name"
              className="mt-2"
            />
          </div>
        </div>
      </Card>
    </div>
  );
};

export default BuildModelFeatureBasedSettings;