import React, { useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Play, X, Settings2, Target, Zap } from 'lucide-react';
import { BuildModelFeatureBasedData, VariableTransformation, ModelConfig } from '../BuildModelFeatureBasedAtom';

interface BuildModelFeatureBasedCanvasProps {
  data: BuildModelFeatureBasedData;
  onDataChange: (data: Partial<BuildModelFeatureBasedData>) => void;
  onClose?: () => void;
}

const availableModels = [
  { id: 'linear-regression', name: 'Linear Regression', params: ['Learning Rate', 'Max Iterations', 'Tolerance'] },
  { id: 'random-forest', name: 'Random Forest', params: ['N Estimators', 'Max Depth', 'Min Samples Split'] },
  { id: 'svm', name: 'Support Vector Machine', params: ['C Parameter', 'Kernel', 'Gamma'] },
  { id: 'neural-network', name: 'Neural Network', params: ['Hidden Layers', 'Learning Rate', 'Epochs'] }
];

const BuildModelFeatureBasedCanvas: React.FC<BuildModelFeatureBasedCanvasProps> = ({
  data,
  onDataChange,
  onClose
}) => {
  const addTransformation = () => {
    const newTransformation: VariableTransformation = {
      id: `transform_${Date.now()}`,
      component1: '',
      component2: '',
      operation: ''
    };
    onDataChange({
      transformations: [...data.transformations, newTransformation]
    });
  };

  const updateTransformation = (id: string, field: string, value: string) => {
    const updatedTransformations = data.transformations.map(t => 
      t.id === id ? { ...t, [field]: value } : t
    );
    onDataChange({ transformations: updatedTransformations });
  };

  const removeTransformation = (id: string) => {
    onDataChange({
      transformations: data.transformations.filter(t => t.id !== id)
    });
  };

  const addXVariable = () => {
    onDataChange({
      xVariables: [...data.xVariables, ''],
      transformations: [...data.transformations, '']
    });
  };

  const updateXVariable = (index: number, value: string) => {
    const updatedXVariables = [...data.xVariables];
    updatedXVariables[index] = value;
    onDataChange({ xVariables: updatedXVariables });
  };

  useEffect(() => {
    if (data.xVariables.length === 0) {
      addXVariable();
    }
  }, []);

  const removeXVariable = (index: number) => {
    onDataChange({
      xVariables: data.xVariables.filter((_, i) => i !== index),
      transformations: data.transformations.filter((_, i) => i !== index)
    });
  };

  return (
    <div className="w-full h-full bg-background p-6 overflow-y-auto">
      {onClose && (
        <div className="flex justify-end mb-4">
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Scope Selected */}
      <Card className="mb-6">
        <div className="p-4 border-b bg-muted/30">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-primary" />
            Scope Selected
          </h3>
        </div>
        <div className="p-4">
          <div className="flex flex-wrap gap-2">
            {data.scopes.map((scope, index) => (
              <Badge key={index} variant="secondary" className="px-3 py-1">
                {scope}
              </Badge>
            ))}
          </div>
        </div>
      </Card>

      {/* Modelling Section */}
      <Card className="mb-6">
        <div className="p-4 border-b bg-muted/30">
          <h3 className="font-semibold text-foreground flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            Modelling
          </h3>
        </div>
        <div className="p-6 space-y-6">
          {/* Header row for Y & X variable controls */}
          <div className="flex items-center mb-2">
            <label className="text-sm font-medium text-muted-foreground w-3/12">Select Y-Variable</label>
            <label className="text-sm font-medium text-muted-foreground w-3/12 pl-4">Select X-Variable</label>
            <div className="flex-1" />
            <Button size="sm" className="bg-gradient-to-r from-indigo-500 to-teal-500 text-white hover:opacity-90" onClick={addXVariable}>
              <Plus className="w-4 h-4 mr-2" />
              Add X Variable
            </Button>
          </div>

          {/* Combined Y & X-Variables Selection list */}
          <div className="space-y-3">
            
            {data.xVariables.map((variable, index) => (
              <div key={`${variable}-${index}`} className={`grid grid-cols-12 gap-4 items-center p-3 rounded-lg shadow-sm ${index % 2 === 0 ? 'bg-white border-l-4 border-indigo-300' : 'bg-gray-50 border-l-4 border-teal-300'}`}>
                {/* Y-variable column only for first row */}
                {index === 0 ? (
                  <div className="col-span-3">
                    <Select value={data.yVariable} onValueChange={(value) => onDataChange({ yVariable: value })}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select Y-Variable" />
                      </SelectTrigger>
                      <SelectContent>
                        {data.availableColumns.map(col => (
                          <SelectItem key={col} value={col}>{col}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="col-span-3" />
                )}

                {/* X-variable select */}
                <div className="col-span-3">
                  <Select value={variable} onValueChange={(value) => updateXVariable(index, value)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select X-Variable" />
                    </SelectTrigger>
                    <SelectContent>
                      {data.availableColumns.map(col => (
                        <SelectItem key={col} value={col}>{col}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Transformation select */}
                <div className="col-span-3">
                  <Select value={data.transformations[index] || ''} onValueChange={(val) => {
                    const updated = [...data.transformations];
                    updated[index] = val;
                    onDataChange({ transformations: updated });
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Transformation" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="log">Log Transform</SelectItem>
                      <SelectItem value="sqrt">Square Root</SelectItem>
                      <SelectItem value="normalize">Normalize</SelectItem>
                      <SelectItem value="standardize">Standardize</SelectItem>
                    </SelectContent>
                  </Select>
                </div>


                {/* Remove button */}
                <div className="col-span-1">
                  <Button size="sm" variant="ghost" onClick={() => removeXVariable(index)}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>


        </div>
      </Card>

      {/* Model Sections */}
      {data.selectedModels.map((modelId, index) => {
        const model = availableModels.find(m => m.id === modelId);
        const modelConfig = data.modelConfigs.find(c => c.id === modelId);
        
        return (
          <Card key={modelId} className="mb-4">
            <div className="p-4 border-b bg-muted/30">
              <h3 className="font-semibold text-foreground">Model {index + 1}</h3>
              <p className="text-sm text-muted-foreground">{model?.name}</p>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-3 gap-4">
                {model?.params.map((param, paramIndex) => (
                  <div key={paramIndex}>
                    <label className="text-sm font-medium text-muted-foreground">{param}</label>
                    <div className="mt-1 p-2 bg-muted/50 rounded text-sm text-muted-foreground">
                      Inserted Value
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        );
      })}

      {/* Run Model Button */}
      <div className="mb-6">
        <Button className="bg-primary hover:bg-primary/90">
          <Play className="w-4 h-4 mr-2" />
          Run the Model
        </Button>
      </div>

      {/* Results Table */}
      <Card>
        <div className="p-4 border-b bg-muted/30">
          <h3 className="font-semibold text-foreground">Hide Cell Results</h3>
        </div>
        <div className="p-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature 1</TableHead>
                <TableHead>Feature 2</TableHead>
                <TableHead>Feature 3</TableHead>
                <TableHead>Feature 4</TableHead>
                <TableHead>Feature 5</TableHead>
                <TableHead>Feature 6</TableHead>
                <TableHead>Feature 7</TableHead>
                <TableHead>Feature 8</TableHead>
                <TableHead>trans_feature</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {Array.from({ length: 5 }).map((_, index) => (
                <TableRow key={index}>
                  <TableCell>-</TableCell>
                  <TableCell>-</TableCell>
                  <TableCell>-</TableCell>
                  <TableCell>-</TableCell>
                  <TableCell>-</TableCell>
                  <TableCell>-</TableCell>
                  <TableCell>-</TableCell>
                  <TableCell>-</TableCell>
                  <TableCell>-</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
};

export default BuildModelFeatureBasedCanvas;