import React, { useState, useCallback } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, Settings as SettingsIcon } from 'lucide-react';
import UnpivotSettings from './UnpivotSettings';
import {
  useLaboratoryStore,
  UnpivotSettings as UnpivotSettingsType,
  DEFAULT_UNPIVOT_SETTINGS,
} from '@/components/LaboratoryMode/store/laboratoryStore';
import UnpivotInputFiles from './UnpivotInputFiles';
import { UNPIVOT_API } from '@/lib/api';

interface UnpivotPropertiesProps {
  atomId: string;
  onApply?: () => void;
  onPreview?: () => void;
  isComputing?: boolean;
}

const UnpivotProperties: React.FC<UnpivotPropertiesProps> = ({ atomId, onApply, onPreview, isComputing: externalIsComputing = false }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const [tab, setTab] = useState<'inputs' | 'settings'>('inputs');
  const [manualApplyToken, setManualApplyToken] = useState(0);

  const rawSettings = atom?.settings as UnpivotSettingsType | undefined;
  const data: UnpivotSettingsType = {
    ...DEFAULT_UNPIVOT_SETTINGS,
    ...(rawSettings || {}),
    idVars: Array.isArray(rawSettings?.idVars) ? rawSettings!.idVars : [],
    valueVars: Array.isArray(rawSettings?.valueVars) ? rawSettings!.valueVars : [],
    dataSourceColumns: Array.isArray(rawSettings?.dataSourceColumns) ? rawSettings!.dataSourceColumns : [],
    preFilters: Array.isArray(rawSettings?.preFilters) ? rawSettings!.preFilters : [],
    postFilters: Array.isArray(rawSettings?.postFilters) ? rawSettings!.postFilters : [],
    unpivotResults: Array.isArray(rawSettings?.unpivotResults) ? rawSettings!.unpivotResults : [],
  };
  
  // Helper to ensure backend atom exists
  const ensureBackendAtom = useCallback(async (): Promise<string> => {
    let currentAtomId = data.atomId;
    
    if (!currentAtomId) {
      const envStr = localStorage.getItem('env');
      let projectId = '';
      let workflowId = '';
      if (envStr) {
        try {
          const env = JSON.parse(envStr);
          projectId = env.PROJECT_ID || '';
          workflowId = env.WORKFLOW_ID || '';
        } catch (e) {
          console.warn('Failed to parse env', e);
        }
      }

      const createResponse = await fetch(`${UNPIVOT_API}/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          workflow_id: workflowId,
          atom_name: `Unpivot ${atomId}`,
          dataset_path: data.datasetPath || '',
        }),
      });

      if (!createResponse.ok) {
        throw new Error(`Failed to create atom (${createResponse.status})`);
      }

      const createResult = await createResponse.json();
      currentAtomId = createResult.atom_id;
      updateSettings(atomId, { atomId: currentAtomId });
      return currentAtomId;
    }
    
    return currentAtomId;
  }, [atomId, data.atomId, data.datasetPath, updateSettings]);

  // Internal apply handler - calls provided handler or triggers computation directly
  const handleApply = useCallback(async () => {
    if (onApply) {
      // Use external handler if provided (from UnpivotAtom)
      onApply();
      return;
    }
    
    // If no handler provided, trigger computation directly
    console.log('handleApply: triggering computation directly');
    if (!data.datasetPath || (data.idVars.length === 0 && data.valueVars.length === 0)) {
      return;
    }

    updateSettings(atomId, {
      unpivotStatus: 'pending',
      unpivotError: null,
    });

    try {
      const updatePayload: any = {
        id_vars: data.idVars,
        value_vars: data.valueVars,
        variable_column_name: data.variableColumnName || undefined,
        value_column_name: data.valueColumnName || undefined,
        pre_filters: data.preFilters,
        post_filters: data.postFilters,
        auto_refresh: data.autoRefresh,
      };
      
      if (data.variableDecoder) {
        updatePayload.variable_decoder = data.variableDecoder;
      }

      const currentAtomId = await ensureBackendAtom();

      const updateResponse = await fetch(
        `${UNPIVOT_API}/${encodeURIComponent(currentAtomId)}/properties`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload),
        }
      );

      if (!updateResponse.ok) {
        throw new Error(`Properties update failed (${updateResponse.status})`);
      }

      const computeResponse = await fetch(
        `${UNPIVOT_API}/${encodeURIComponent(currentAtomId)}/compute`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force_recompute: true, preview_limit: 1000 }),
        }
      );

      if (!computeResponse.ok) {
        throw new Error(`Compute failed (${computeResponse.status})`);
      }

      const result = await computeResponse.json();
      updateSettings(atomId, {
        unpivotResults: result?.dataframe ?? [],
        unpivotStatus: result?.status ?? 'success',
        unpivotError: null,
        unpivotUpdatedAt: result?.updated_at,
        unpivotRowCount: result?.row_count,
        unpivotSummary: result?.summary ?? {},
        computationTime: result?.computation_time,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Computation failed';
      updateSettings(atomId, {
        unpivotStatus: 'failed',
        unpivotError: message,
      });
    }
  }, [onApply, atomId, data, ensureBackendAtom, updateSettings]);
  
  // Internal preview handler - calls provided handler or triggers preview computation directly
  const handlePreview = useCallback(async () => {
    if (onPreview) {
      // Use external handler if provided (from UnpivotAtom)
      onPreview();
      console.log('handlePreview: using external handler');
      return;
    }
    
    // If no handler provided, trigger preview computation directly
    console.log('handlePreview: triggering preview computation directly');
    if (!data.datasetPath || (data.idVars.length === 0 && data.valueVars.length === 0)) {
      return;
    }

    updateSettings(atomId, {
      unpivotStatus: 'pending',
      unpivotError: null,
    });

    try {
      const updatePayload: any = {
        id_vars: data.idVars,
        value_vars: data.valueVars,
        variable_column_name: data.variableColumnName || undefined,
        value_column_name: data.valueColumnName || undefined,
        pre_filters: data.preFilters,
        post_filters: data.postFilters,
        auto_refresh: data.autoRefresh,
      };
      
      if (data.variableDecoder) {
        updatePayload.variable_decoder = data.variableDecoder;
      }

      const currentAtomId = await ensureBackendAtom();

      const updateResponse = await fetch(
        `${UNPIVOT_API}/${encodeURIComponent(currentAtomId)}/properties`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload),
        }
      );

      if (!updateResponse.ok) {
        throw new Error(`Properties update failed (${updateResponse.status})`);
      }

      const computeResponse = await fetch(
        `${UNPIVOT_API}/${encodeURIComponent(currentAtomId)}/compute`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force_recompute: true, preview_limit: 100 }),
        }
      );

      if (!computeResponse.ok) {
        throw new Error(`Preview compute failed (${computeResponse.status})`);
      }

      const result = await computeResponse.json();
      updateSettings(atomId, {
        unpivotResults: result?.dataframe ?? [],
        unpivotStatus: result?.status ?? 'success',
        unpivotError: null,
        unpivotUpdatedAt: result?.updated_at,
        unpivotRowCount: result?.row_count,
        unpivotSummary: result?.summary ?? {},
        computationTime: result?.computation_time,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Preview computation failed';
      updateSettings(atomId, {
        unpivotStatus: 'failed',
        unpivotError: message,
      });
    }
  }, [onPreview, atomId, data, ensureBackendAtom, updateSettings]);
  
  // Check if computing from atom status
  const isComputing = externalIsComputing || data.unpivotStatus === 'pending';

  const handleDataChange = React.useCallback(
    (newData: Partial<UnpivotSettingsType>) => {
      const latestAtom = useLaboratoryStore.getState().getAtom(atomId);
      const latestSettings: UnpivotSettingsType =
        (latestAtom?.settings as UnpivotSettingsType) || { ...DEFAULT_UNPIVOT_SETTINGS };

      updateSettings(atomId, {
        ...latestSettings,
        ...newData,
      });
    },
    [atomId, updateSettings]
  );

  return (
    <div className="h-full flex flex-col">
      <Tabs value={tab} onValueChange={value => setTab(value as typeof tab)} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="inputs" className="text-xs font-medium">
            <Upload className="w-3 h-3 mr-1" />
            Input Files
          </TabsTrigger>
          <TabsTrigger value="settings" className="text-xs font-medium">
            <SettingsIcon className="w-3 h-3 mr-1" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="inputs" className="flex-1 mt-0" forceMount>
          <div className="p-4">
            <UnpivotInputFiles atomId={atomId} />
          </div>
        </TabsContent>

        <TabsContent value="settings" className="flex-1 mt-0" forceMount>
          <div className="p-4">
            <UnpivotSettings 
              data={data} 
              onDataChange={handleDataChange}
              onApply={handleApply}
              onPreview={handlePreview}
              isComputing={isComputing}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default UnpivotProperties;

