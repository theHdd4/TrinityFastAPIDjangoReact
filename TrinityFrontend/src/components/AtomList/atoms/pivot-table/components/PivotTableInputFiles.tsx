import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RefreshCcw } from 'lucide-react';
import {
  PivotTableSettings as PivotTableSettingsType,
  DEFAULT_PIVOT_TABLE_SETTINGS,
  useLaboratoryStore,
} from '@/components/LaboratoryMode/store/laboratoryStore';
import { cn } from '@/lib/utils';
import { VALIDATE_API, FEATURE_OVERVIEW_API } from '@/lib/api';
import { resolveTaskResponse } from '@/lib/taskQueue';

interface PivotTableInputFilesProps {
  atomId: string;
}

interface SavedFrame {
  object_name: string;
  csv_name: string;
}

const PivotTableInputFiles: React.FC<PivotTableInputFilesProps> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings: PivotTableSettingsType =
    (atom?.settings as PivotTableSettingsType) || { ...DEFAULT_PIVOT_TABLE_SETTINGS };

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
      console.warn('PivotTableInputFiles: Failed to parse env from localStorage', err);
      return '';
    }
  }, []);

  const fetchAvailableFrames = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${VALIDATE_API}/list_saved_dataframes${envQuery}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch dataframes (${res.status})`);
      }
      const json = await res.json();
      const files = Array.isArray(json.files) ? json.files : [];
      const arrowFiles = files.filter((f: SavedFrame) => f?.object_name?.endsWith('.arrow'));
      if (settings.dataSource && !arrowFiles.some(f => f.object_name === settings.dataSource)) {
        arrowFiles.push({
          object_name: settings.dataSource,
          csv_name: settings.dataSource.split('/').pop() || settings.dataSource,
        });
      }
      setFrames(arrowFiles);
    } catch (err) {
      console.error('PivotTableInputFiles: unable to fetch frames', err);
      setError(err instanceof Error ? err.message : 'Unable to load saved dataframes');
      if (settings.dataSource) {
        setFrames([{ object_name: settings.dataSource, csv_name: settings.dataSource }]);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAvailableFrames().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.dataSource]);

  const handleFrameChange = async (value: string) => {
    const normalized = value.endsWith('.arrow') ? value : `${value}.arrow`;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${FEATURE_OVERVIEW_API}/column_summary?object_name=${encodeURIComponent(normalized)}`);
      if (!res.ok) {
        throw new Error(`Failed to load column summary (${res.status})`);
      }
      const raw = await res.json();
      const json = await resolveTaskResponse<{ summary?: any[] }>(raw);
      const summary = Array.isArray(json.summary) ? json.summary.filter(Boolean) : [];
      const columns = summary.map(col => col.column).filter(Boolean);
      const filterOptions: Record<string, string[]> = {};
      summary.forEach((item) => {
        const column = item?.column;
        if (!column) return;
        const rawValues = Array.isArray(item?.unique_values) ? item.unique_values : [];
        const values = rawValues
          .map((value: unknown) => (value === null || value === undefined ? null : String(value)))
          .filter((value: string | null): value is string => value !== null);
        if (values.length > 0) {
          filterOptions[column] = values;
          filterOptions[column.toLowerCase()] = values;
        }
      });

      updateSettings(atomId, {
        dataSource: normalized,
        dataSourceColumns: columns,
        fields: columns,
        selectedFields: [],
        rowFields: [],
        columnFields: [],
        filterFields: [],
        valueFields: [],
        pivotResults: [],
        pivotStatus: 'idle',
        pivotError: null,
        pivotRowCount: 0,
        pivotLastSavedPath: null,
        pivotLastSavedAt: null,
        pivotFilterOptions: filterOptions,
        pivotFilterSelections: {},
      });
    } catch (err) {
      console.error('PivotTableInputFiles: Failed to initialize pivot table data', err);
      setError(err instanceof Error ? err.message : 'Unable to prepare pivot table data');
      updateSettings(atomId, {
        dataSource: normalized,
        pivotResults: [],
        pivotStatus: 'failed',
        pivotError: err instanceof Error ? err.message : 'Unable to prepare pivot table data',
        pivotLastSavedPath: null,
        pivotLastSavedAt: null,
        pivotFilterOptions: settings.pivotFilterOptions ?? {},
        pivotFilterSelections: {},
        fields: settings.fields ?? [],
        selectedFields: [],
        rowFields: [],
        columnFields: [],
        filterFields: [],
        valueFields: [],
      });
    } finally {
      setIsLoading(false);
    }

    // Record the current dataframe selection for this atom in the laboratory store
    try {
      const { setAtomCurrentDataframe } = useLaboratoryStore.getState();
      setAtomCurrentDataframe(atomId, normalized);
    } catch {
      // best-effort; do not block pivot-table on metrics sync
    }
  };

  const currentFileLabel = useMemo(() => {
    if (!settings.dataSource) return 'No data source selected';
    const frame = frames.find(f => f.object_name === settings.dataSource);
    return frame ? frame.csv_name.split('/').pop() : settings.dataSource.split('/').pop();
  }, [frames, settings.dataSource]);

  return (
    <div className="h-full space-y-3">
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-foreground">Data Source</h4>
            <p className="text-xs text-muted-foreground">
              Select a saved dataframe to power this pivot table. Only Arrow files are supported.
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => fetchAvailableFrames()} disabled={isLoading}>
            <RefreshCcw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
          </Button>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium text-muted-foreground">Saved dataframes</Label>
          <Select value={settings.dataSource} onValueChange={handleFrameChange} disabled={isLoading}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder={isLoading ? 'Loading…' : 'Choose a saved dataframe...'} />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {(frames || []).map(frame => (
                <SelectItem key={frame.object_name} value={frame.object_name}>
                  {frame.csv_name.split('/').pop()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <div className="rounded-md border border-dashed border-border bg-muted/40 p-3">
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Current Source</p>
          <p className="text-sm text-foreground mt-1">{currentFileLabel || 'None'}</p>
        </div>

        <div className="rounded-md bg-muted/20 p-3 text-xs text-muted-foreground leading-relaxed">
          Need to upload a new dataset? Use the Data Upload atom or import a dataframe elsewhere,
          then refresh this list.
        </div>
      </Card>
    </div>
  );
};

export default PivotTableInputFiles;

