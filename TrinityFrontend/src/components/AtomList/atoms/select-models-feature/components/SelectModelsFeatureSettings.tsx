import React, { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { VALIDATE_API, SELECT_API } from '@/lib/api';

interface SelectModelsFeatureSettingsProps {
  data: any;
  onDataChange: (newData: Partial<any>) => void;
}

interface Frame { object_name: string; csv_name: string; }

const SelectModelsFeatureSettings: React.FC<SelectModelsFeatureSettingsProps> = ({
  data,
  onDataChange
}) => {
  const [frames, setFrames] = useState<Frame[]>([]);
  const [combinationError, setCombinationError] = useState<string>('');
  const [isLoadingCombinations, setIsLoadingCombinations] = useState(false);

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

  // Function to fetch combination_id values when dataset is selected
  const fetchCombinationIds = async (fileKey: string) => {
    setIsLoadingCombinations(true);
    setCombinationError('');
    
    try {
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};

      // Construct URL properly to avoid double question marks
      const baseUrl = `${SELECT_API}/combination-ids`;
      const params = new URLSearchParams({
        file_key: fileKey,
        client_id: env.CLIENT_ID || '',
        app_id: env.APP_ID || '',
        project_id: env.PROJECT_ID || '',
        client_name: env.CLIENT_NAME || '',
        app_name: env.APP_NAME || '',
        project_name: env.PROJECT_NAME || ''
      });
      const url = `${baseUrl}?${params.toString()}`;
      

      const response = await fetch(url);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to fetch combination IDs');
      }
      
      const result = await response.json();
      
      if (result.unique_combination_ids && result.unique_combination_ids.length > 0) {
        onDataChange({ 
          availableCombinationIds: result.unique_combination_ids,
          selectedCombinationId: ''
        });
      } else {
        throw new Error('No combination_id values found in the file');
      }
      
    } catch (error) {
      setCombinationError(error instanceof Error ? error.message : 'Failed to fetch combination IDs');
      onDataChange({ 
        availableCombinationIds: [],
        selectedCombinationId: ''
      });
    } finally {
      setIsLoadingCombinations(false);
    }
  };

  // Handle dataset selection
  const handleDatasetChange = (value: string) => {
    onDataChange({ selectedDataset: value });
    
    if (value) {
      // Find the frame to get the file key
      const selectedFrame = frames.find(f => f.object_name === value);
      if (selectedFrame) {
        fetchCombinationIds(selectedFrame.object_name);
      }
    } else {
      // Clear combination IDs when no dataset is selected
      onDataChange({ 
        availableCombinationIds: [],
        selectedCombinationId: ''
      });
      setCombinationError('');
    }
  };

  return (
    <div className="w-full h-full p-6 space-y-6 bg-background overflow-y-auto">
      {/* Data Source Section */}
      <Card className="p-6">
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="data-source" className="text-sm font-medium text-foreground">
              Select Data Source
            </Label>
            <Select 
              value={data.selectedDataset} 
              onValueChange={handleDatasetChange}
            >
              <SelectTrigger className="mt-2 bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors">
                <SelectValue placeholder="Select dataframe" />
              </SelectTrigger>
              <SelectContent>
                {(Array.isArray(frames) ? frames : []).map(f => (
                  <SelectItem key={f.object_name} value={f.object_name}>
                    {f.csv_name.split('/').pop()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Combination ID Status */}
          {isLoadingCombinations && (
            <div className="mt-4">
              <div className="text-sm text-blue-600">
                🔄 Loading combination IDs from selected dataset...
              </div>
            </div>
          )}

          {combinationError && (
            <div className="mt-4">
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                <strong>Combination ID Error:</strong> {combinationError}
              </div>
            </div>
          )}

          {data.availableCombinationIds && data.availableCombinationIds.length > 0 && !combinationError && (
            <div className="mt-4">
              <div className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-md p-3">
                ✅ Found {data.availableCombinationIds.length} unique combination IDs
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Ensemble Method Section */}
      <Card className="p-6">
        <h4 className="text-md font-medium text-foreground mb-4">Model Configuration</h4>
        
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="ensemble-method"
              checked={data.ensembleMethod}
              onCheckedChange={(checked) => onDataChange({ ensembleMethod: Boolean(checked) })}
            />
            <Label 
              htmlFor="ensemble-method" 
              className="text-sm font-medium text-foreground cursor-pointer"
            >
              Ensemble Method
            </Label>
          </div>
        </div>
      </Card>


    </div>
  );
};

export default SelectModelsFeatureSettings;