import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Database } from 'lucide-react';
import { BUILD_MODEL_API } from '@/lib/api';
import { resolveTaskResponse } from '@/lib/taskQueue';
import { BuildModelFeatureBasedData } from '../BuildModelFeatureBasedAtom';

interface BuildModelFeatureBasedInputProps {
  data: BuildModelFeatureBasedData;
  onDataChange: (data: Partial<BuildModelFeatureBasedData>) => void;
}

const BuildModelFeatureBasedInput: React.FC<BuildModelFeatureBasedInputProps> = ({
  data,
  onDataChange
}) => {
  const [scopes, setScopes] = useState<Array<{
    scope_id: string;
    scope_number: string;
    scope_name: string;
    combinations: Array<{
      value: string;
      label: string;
      file_key: string;
      record_count: number;
    }>;
  }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch scopes and combinations from backend API
  useEffect(() => {
    const fetchScopes = async () => {
      // Get environment variables for MongoDB querying
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};
      
      const client_name = env.CLIENT_NAME || 'default_client';
      const app_name = env.APP_NAME || 'default_app';
      const project_name = env.PROJECT_NAME || 'default_project';
      
      // Build API URL with query parameters
      const apiUrl = `${BUILD_MODEL_API}/build-atom/scopes?client_name=${encodeURIComponent(client_name)}&app_name=${encodeURIComponent(app_name)}&project_name=${encodeURIComponent(project_name)}`;
      
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch(apiUrl);
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
        }
        
        const payload = await response.json();
        const result = await resolveTaskResponse(payload);

        if (result.success) {
          setScopes(result.scopes);
        } else {
          throw new Error(result.message || 'Failed to fetch scopes');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch scopes');
      } finally {
        setLoading(false);
      }
    };

    fetchScopes();
  }, []);

  // Create scope options from backend data
  const scopeOptions = scopes.map(scope => ({
    value: scope.scope_number,
    label: scope.scope_name
  }));

  // Get combinations for selected scope
  const selectedScopeData = scopes.find(scope => scope.scope_number === data.selectedScope);
  const uniqueCombinations = selectedScopeData?.combinations || [];

  const handleCombinationToggle = (combination: string, checked: boolean) => {
    const updatedCombinations = checked
      ? [...(data.selectedCombinations || []), combination]
      : (data.selectedCombinations || []).filter(c => c !== combination);
    
    onDataChange({ selectedCombinations: updatedCombinations });
  };

  const handleSelectAllCombinations = (checked: boolean) => {
    if (checked) {
      // Select all combinations
      const allCombinations = uniqueCombinations.map(combination => combination.value);
      onDataChange({ selectedCombinations: allCombinations });
    } else {
      // Deselect all combinations
      onDataChange({ selectedCombinations: [] });
    }
  };

  // Check if all combinations are selected
  const allCombinationsSelected = uniqueCombinations.length > 0 && 
    uniqueCombinations.every(combination => data?.selectedCombinations?.includes(combination.value));

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
                // Get combinations for the selected scope from backend data
                const selectedScopeData = scopes.find(scope => scope.scope_number === value);
                const combinationsForScope = selectedScopeData?.combinations.map(c => c.value) || [];
                
                // Automatically select all combinations for the new scope
                onDataChange({ 
                  selectedScope: value, 
                  selectedCombinations: combinationsForScope 
                });
              }
            }}>
              <SelectTrigger>
                <SelectValue placeholder="Select a scope number" />
              </SelectTrigger>
              <SelectContent>
                {loading ? (
                  <SelectItem value="loading" disabled>Loading scopes...</SelectItem>
                ) : error ? (
                  <SelectItem value="error" disabled>Error loading scopes: {error}</SelectItem>
                ) : scopeOptions.length > 0 ? (
                  scopeOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))
                ) : (
                  <SelectItem value="no-scopes" disabled>No scopes found</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label>Application Area</Label>
            <Select 
              value={data.modelType || 'general'} 
              onValueChange={(value) => onDataChange({ modelType: value })}
            >
              <SelectTrigger className="text-left">
                <SelectValue placeholder="Select application area" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General Models (Individual & Stack)</SelectItem>
                <SelectItem value="mmm">MMM Models (Marketing Mix Modeling)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Separator line between scope and combination sections */}
          <div className="border-t border-gray-200 my-4"></div>
          
          <div>
            {/* Select All Checkbox */}
            {uniqueCombinations.length > 0 && (
              <div className="mb-3">
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
            
            {/* Separator line */}
            {uniqueCombinations.length > 0 && (
              <div className="border-t border-gray-200 mb-3"></div>
            )}
            
            <div className="max-h-60 overflow-y-auto overflow-x-auto mt-2">
              <div className="space-y-1 min-w-max">
                {uniqueCombinations.map(combination => (
                  <div key={combination.value} className="flex items-center space-x-2 py-1">
                    <Checkbox
                      id={combination.value}
                      checked={data?.selectedCombinations?.includes(combination.value) || false}
                      onCheckedChange={(checked) => handleCombinationToggle(combination.value, checked as boolean)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Label htmlFor={combination.value} className="text-sm truncate">
                          {combination.label}
                          {combination.record_count > 0 && (
                            <span className="text-xs text-muted-foreground ml-2">
                              ({combination.record_count} records)
                            </span>
                          )}
                        </Label>
                      </TooltipTrigger>
                      <TooltipContent>
                        <div>
                          <p className="font-medium">{combination.label}</p>
                          <p className="text-xs text-muted-foreground">
                            Records: {combination.record_count}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            File: {combination.file_key.split('/').pop()}
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
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
    </div>
  );
};

export default BuildModelFeatureBasedInput;
