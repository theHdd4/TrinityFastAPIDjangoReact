import React, { useCallback, useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { CheckboxTemplate } from '@/templates/checkbox';
import { Card } from '@/components/ui/card';
import { VALIDATE_API, SELECT_API } from '@/lib/api';
import { resolveTaskResponse } from '@/lib/taskQueue';
import { useDataSourceChangeWarning } from '@/hooks/useDataSourceChangeWarning';

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
  const fetchAndResolve = useCallback(
    async (
      input: RequestInfo | URL,
      init?: RequestInit,
      errorMessage = 'Request failed',
    ) => {
      const response = await fetch(input, init);
      let payload: any;
      try {
        payload = await response.json();
      } catch (error) {
        throw new Error(errorMessage);
      }

      if (!response.ok) {
        const detail =
          payload && typeof payload === 'object' && 'detail' in payload
            ? (payload.detail as string)
            : null;
        throw new Error(detail || errorMessage);
      }

      return resolveTaskResponse(payload);
    },
    [],
  );

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
    fetchAndResolve(
      `${SELECT_API}/list-model-results-files${query}`,
      undefined,
      'Failed to fetch model results files',
    )
      .then(d => setFrames(Array.isArray(d.files) ? d.files : []))
      .catch(() => setFrames([]));
  }, [fetchAndResolve]);

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
      

      const result = await fetchAndResolve(url, undefined, 'Failed to fetch combination IDs');
      
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
  const hasExistingUpdates = Boolean(
    (Array.isArray(data.elasticityData) && data.elasticityData.length > 0) ||
    (Array.isArray(data.weightedEnsembleData) && data.weightedEnsembleData.length > 0) ||
    (Array.isArray(data.selectedModelPerformance) && data.selectedModelPerformance.length > 0) ||
    (Array.isArray(data.performanceData) && data.performanceData.length > 0) ||
    (Array.isArray(data.yoyData) && data.yoyData.length > 0)
  );

  const applyDatasetChange = async (value: string) => {
    onDataChange({ selectedDataset: value });

    if (value) {
      const selectedFrame = frames.find(f => f.object_name === value);
      if (selectedFrame) {
        await fetchCombinationIds(selectedFrame.object_name);
      }
    } else {
      onDataChange({
        availableCombinationIds: [],
        selectedCombinationId: ''
      });
      setCombinationError('');
    }
  };

  const { requestChange: confirmDatasetChange, dialog } = useDataSourceChangeWarning(applyDatasetChange);

  const handleDatasetChange = (value: string) => {
    const isDifferentSource = value !== (data.selectedDataset || '');
    confirmDatasetChange(value, hasExistingUpdates && isDifferentSource);
  };

  return (
    <div className="space-y-4 p-2">
      <Card className="p-4 space-y-3">
        <label className="text-sm font-medium text-gray-700 block">Data Source</label>
        <Select 
          value={data.selectedDataset} 
          onValueChange={handleDatasetChange}
        >
          <SelectTrigger className="bg-white border-gray-300">
            <SelectValue placeholder="Choose a saved dataframe..." />
          </SelectTrigger>
          <SelectContent>
            {(Array.isArray(frames) ? frames : []).map(f => (
              <SelectItem key={f.object_name} value={f.object_name}>
                {f.csv_name.split('/').pop()}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

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

      {dialog}

      {/* Ensemble Method Section */}
      <Card className="p-6">
        <h4 className="text-md font-medium text-foreground mb-4">Model Configuration</h4>
        
        <div className="space-y-4">
          <CheckboxTemplate
            id="ensemble-method"
            label="Ensemble Method"
            checked={data.ensembleMethod}
            onCheckedChange={(checked) => onDataChange({ ensembleMethod: Boolean(checked) })}
          />
        </div>
      </Card>

    </div>
  );
};

export default SelectModelsFeatureSettings;