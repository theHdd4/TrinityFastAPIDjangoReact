import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RefreshCcw } from 'lucide-react';
import {
  UnpivotSettings as UnpivotSettingsType,
  DEFAULT_UNPIVOT_SETTINGS,
  useLaboratoryStore,
} from '@/components/LaboratoryMode/store/laboratoryStore';
import { cn } from '@/lib/utils';
import { VALIDATE_API, FEATURE_OVERVIEW_API, UNPIVOT_API } from '@/lib/api';
import { resolveTaskResponse } from '@/lib/taskQueue';

interface UnpivotInputFilesProps {
  atomId: string;
}

interface SavedFrame {
  object_name: string;
  csv_name: string;
}

const UnpivotInputFiles: React.FC<UnpivotInputFilesProps> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings: UnpivotSettingsType =
    (atom?.settings as UnpivotSettingsType) || { ...DEFAULT_UNPIVOT_SETTINGS };

  const [frames, setFrames] = useState<SavedFrame[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const envQuery = useMemo(() => {
    const envStr = localStorage.getItem('env');
    if (!envStr) return '';
    try {
      const env = JSON.parse(envStr);
      const params = new URLSearchParams({
        client_id: env.CLIENT_ID || '',
        app_id: env.APP_ID || '',
        project_id: env.PROJECT_ID || '',
        client_name: env.CLIENT_NAME || '',
        app_name: env.APP_NAME || '',
        project_name: env.PROJECT_NAME || '',
      });
      return `?${params.toString()}`;
    } catch (err) {
      console.warn('UnpivotInputFiles: Failed to parse env from localStorage', err);
      return '';
    }
  }, []);

  const fetchAvailableFrames = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${VALIDATE_API}/list_saved_dataframes${envQuery}`);
      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        throw new Error(errorText || `Failed to fetch dataframes (${res.status})`);
      }
      const json = await res.json().catch((err) => {
        throw new Error(`Failed to parse dataframes response: ${err.message}`);
      });
      const files = Array.isArray(json.files) ? json.files : [];
      const arrowFiles = files.filter((f: SavedFrame) => f?.object_name?.endsWith('.arrow'));
      if (settings.datasetPath && !arrowFiles.some(f => f.object_name === settings.datasetPath)) {
        arrowFiles.push({
          object_name: settings.datasetPath,
          csv_name: settings.datasetPath.split('/').pop() || settings.datasetPath,
        });
      }
      setFrames(arrowFiles);
    } catch (err) {
      console.error('UnpivotInputFiles: unable to fetch frames', err);
      setError(err instanceof Error ? err.message : 'Unable to load saved dataframes');
      if (settings.datasetPath) {
        setFrames([{ object_name: settings.datasetPath, csv_name: settings.datasetPath }]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleFrameChange = useCallback(async (value: string) => {
    const normalized = value.endsWith('.arrow') ? value : `${value}.arrow`;
    setIsLoading(true);
    setError(null);
    try {
      // Try using unpivot API's dataset-schema endpoint first (more reliable)
      let columns: string[] = [];
      try {
        const schemaRes = await fetch(`${UNPIVOT_API}/dataset-schema`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dataset_path: normalized }),
        });
        
        if (schemaRes.ok) {
          const schemaData = await schemaRes.json().catch((err) => {
            throw new Error(`Failed to parse schema response: ${err.message}`);
          });
          columns = Array.isArray(schemaData.columns) ? schemaData.columns : [];
          console.log('UnpivotInputFiles: Loaded columns from dataset-schema:', columns.length);
        } else {
          const errorText = await schemaRes.text().catch(() => '');
          throw new Error(errorText || `Schema endpoint failed (${schemaRes.status})`);
        }
      } catch (schemaErr) {
        // Fallback to FEATURE_OVERVIEW_API if unpivot schema endpoint fails
        console.warn('UnpivotInputFiles: Falling back to FEATURE_OVERVIEW_API', schemaErr);
        const res = await fetch(`${FEATURE_OVERVIEW_API}/column_summary?object_name=${encodeURIComponent(normalized)}`);
        if (!res.ok) {
          const errorText = await res.text().catch(() => '');
          throw new Error(errorText || `Failed to load column summary (${res.status})`);
        }
        const raw = await res.json().catch((err) => {
          throw new Error(`Failed to parse column summary response: ${err.message}`);
        });
        const json = await resolveTaskResponse<{ summary?: any[] }>(raw);
        const summary = Array.isArray(json.summary) ? json.summary.filter(Boolean) : [];
        // Try multiple possible field names
        columns = summary
          .map((item: any) => item.column_name || item.column || item.name || item.field)
          .filter(Boolean);
      }

      if (columns.length === 0) {
        throw new Error('No columns found in dataset');
      }

      console.log('UnpivotInputFiles: Extracted columns:', columns);

      // Clear selected columns when dataset changes to avoid errors with non-existent columns
      // Update backend atom's dataset_path if atomId exists
      const currentSettings = useLaboratoryStore.getState().getAtom(atomId)?.settings as UnpivotSettingsType | undefined;
      const currentAtomId = currentSettings?.atomId;
      
      updateSettings(atomId, {
        datasetPath: normalized,
        dataSourceColumns: columns,
        idVars: [],
        valueVars: [],
        unpivotResults: [],
        unpivotStatus: 'idle',
        unpivotError: null,
        unpivotSummary: {},
      });

      // Update backend atom's dataset_path if it exists
      if (currentAtomId && currentSettings?.datasetPath !== normalized) {
        try {
          await fetch(`${UNPIVOT_API}/${encodeURIComponent(currentAtomId)}/dataset-updated`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataset_path: normalized }),
          });
        } catch (err) {
          console.warn('UnpivotInputFiles: Failed to update backend dataset_path', err);
        }
      }
    } catch (err) {
      console.error('UnpivotInputFiles: failed to load columns', err);
      setError(err instanceof Error ? err.message : 'Failed to load dataset columns');
      // Still update dataset path even if column loading fails
      // Clear selected columns when dataset changes to avoid errors with non-existent columns
      // Update backend atom's dataset_path if atomId exists
      const currentSettings = useLaboratoryStore.getState().getAtom(atomId)?.settings as UnpivotSettingsType | undefined;
      const currentAtomId = currentSettings?.atomId;
      
      updateSettings(atomId, {
        datasetPath: normalized,
        dataSourceColumns: [],
        idVars: [],
        valueVars: [],
        unpivotResults: [],
        unpivotStatus: 'idle',
        unpivotError: null,
        unpivotSummary: {},
      });

      // Update backend atom's dataset_path if it exists
      if (currentAtomId && currentSettings?.datasetPath !== normalized) {
        try {
          await fetch(`${UNPIVOT_API}/${encodeURIComponent(currentAtomId)}/dataset-updated`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dataset_path: normalized }),
          });
        } catch (err) {
          console.warn('UnpivotInputFiles: Failed to update backend dataset_path', err);
        }
      }
    } finally {
      setIsLoading(false);
    }

    // Record the current dataframe selection for this atom in the laboratory store
    try {
      const { setAtomCurrentDataframe } = useLaboratoryStore.getState();
      setAtomCurrentDataframe(atomId, normalized);
    } catch {
      // best-effort; do not block unpivot on metrics sync
    }
  }, [atomId, updateSettings]);

  useEffect(() => {
    fetchAvailableFrames().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh columns when dataset path changes
  useEffect(() => {
    if (settings.datasetPath && (!settings.dataSourceColumns || settings.dataSourceColumns.length === 0)) {
      console.log('UnpivotInputFiles: Dataset path changed but no columns, fetching...', settings.datasetPath);
      handleFrameChange(settings.datasetPath).catch((err) => {
        console.error('UnpivotInputFiles: Failed to refresh columns', err);
      });
    }
  }, [settings.datasetPath, settings.dataSourceColumns, handleFrameChange]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Dataset</Label>
        <Button
          variant="ghost"
          size="sm"
          onClick={fetchAvailableFrames}
          disabled={isLoading}
          className="h-7 px-2"
        >
          <RefreshCcw className={cn('h-3 w-3', isLoading && 'animate-spin')} />
        </Button>
      </div>

      <Select
        value={settings.datasetPath || ''}
        onValueChange={handleFrameChange}
        disabled={isLoading}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select a dataset" />
        </SelectTrigger>
        <SelectContent>
          {frames.map((frame) => (
            <SelectItem key={frame.object_name} value={frame.object_name}>
              {frame.csv_name || frame.object_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {error && (
        <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
          {error}
        </div>
      )}
    </div>
  );
};

export default UnpivotInputFiles;

