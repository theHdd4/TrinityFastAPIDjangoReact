import React from 'react';
import UnpivotCanvas from './components/UnpivotCanvas';
import UnpivotProperties from './components/UnpivotProperties';
import {
  useLaboratoryStore,
  UnpivotSettings,
  DEFAULT_UNPIVOT_SETTINGS,
} from '@/components/LaboratoryMode/store/laboratoryStore';
import { UNPIVOT_API } from '@/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface UnpivotAtomProps {
  atomId: string;
}

const UnpivotAtom: React.FC<UnpivotAtomProps> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings: UnpivotSettings = {
    ...DEFAULT_UNPIVOT_SETTINGS,
    ...(atom?.settings as UnpivotSettings),
  };

  const [isComputing, setIsComputing] = React.useState(false);
  const [computeError, setComputeError] = React.useState<string | null>(null);
  const [manualRefreshToken, setManualRefreshToken] = React.useState(0);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saveMessage, setSaveMessage] = React.useState<string | null>(null);
  const [showSaveAsModal, setShowSaveAsModal] = React.useState(false);
  const [saveAsFileName, setSaveAsFileName] = React.useState('');

  React.useEffect(() => {
    if (!atom?.settings) {
      updateSettings(atomId, { ...DEFAULT_UNPIVOT_SETTINGS });
    }
  }, [atom?.settings, atomId, updateSettings]);

  // Track previous dataset path to detect changes
  const prevDatasetPathRef = React.useRef<string | undefined>(settings.datasetPath);
  
  // Reset atomId when dataset path changes to ensure backend uses new dataset
  React.useEffect(() => {
    if (prevDatasetPathRef.current !== undefined && 
        prevDatasetPathRef.current !== settings.datasetPath && 
        settings.datasetPath) {
      // Dataset path changed - reset atomId so new backend atom is created with new dataset
      updateSettings(atomId, { atomId: undefined });
    }
    prevDatasetPathRef.current = settings.datasetPath;
  }, [settings.datasetPath, atomId, updateSettings]);

  const handleDataChange = React.useCallback(
    (newData: Partial<UnpivotSettings>) => {
      const latestAtom = useLaboratoryStore.getState().getAtom(atomId);
      const latestSettings: UnpivotSettings = {
        ...DEFAULT_UNPIVOT_SETTINGS,
        ...(latestAtom?.settings as UnpivotSettings),
      };

      updateSettings(atomId, {
        ...latestSettings,
        ...newData,
      });
    },
    [atomId, updateSettings]
  );

  // Manual apply handler - triggers computation
  const handleApply = React.useCallback(() => {
    setManualRefreshToken((prev) => prev + 1);
  }, []);

  // Compute ONLY when Apply button is clicked (manualRefreshToken or lastApplyTrigger changes)
  React.useEffect(() => {
    // Only compute if manualRefreshToken is > 0 (Apply button was clicked) OR lastApplyTrigger changed
    const lastApplyTrigger = (settings as any).lastApplyTrigger || 0;
    if (manualRefreshToken === 0 && lastApplyTrigger === 0) {
      return;
    }

    setSaveMessage(null);
    setSaveError(null);

    const readyForCompute =
      !!settings.datasetPath &&
      (settings.idVars.length > 0 || settings.valueVars.length > 0);

    if (!readyForCompute) {
      setIsComputing(false);
      setComputeError(null);
      return;
    }

    const controller = new AbortController();

    const runCompute = async () => {
      setIsComputing(true);
      setComputeError(null);
      updateSettings(atomId, {
        unpivotStatus: 'pending',
        unpivotError: null,
      });

      try {
        // First, update properties via PATCH
        const updatePayload = {
          id_vars: settings.idVars,
          value_vars: settings.valueVars,
          variable_column_name: settings.variableColumnName || undefined,
          value_column_name: settings.valueColumnName || undefined,
          pre_filters: settings.preFilters,
          post_filters: settings.postFilters,
          auto_refresh: settings.autoRefresh,
        };

        // Get or create atom_id
        let currentAtomId = settings.atomId;
        if (!currentAtomId) {
          // Create atom if it doesn't exist
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
              dataset_path: settings.datasetPath || '',
            }),
            signal: controller.signal,
          });

          if (!createResponse.ok) {
            throw new Error(`Failed to create atom (${createResponse.status})`);
          }

          const createResult = await createResponse.json();
          currentAtomId = createResult.atom_id;
          updateSettings(atomId, { atomId: currentAtomId });
        }

        // Update properties
        const updateResponse = await fetch(
          `${UNPIVOT_API}/${encodeURIComponent(currentAtomId)}/properties`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload),
            signal: controller.signal,
          }
        );

        if (!updateResponse.ok) {
          const text = await updateResponse.text();
          throw new Error(text || `Properties update failed (${updateResponse.status})`);
        }

        // Compute (auto-refresh will trigger this, but we can also call it explicitly)
        const computeResponse = await fetch(
          `${UNPIVOT_API}/${encodeURIComponent(currentAtomId)}/compute`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ force_recompute: true }),
            signal: controller.signal,
          }
        );

        if (!computeResponse.ok) {
          const text = await computeResponse.text();
          throw new Error(text || `Compute failed (${computeResponse.status})`);
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
        setIsComputing(false);
        setComputeError(null);
      } catch (error) {
        if ((error as any)?.name === 'AbortError') {
          return;
        }
        const message =
          error instanceof Error
            ? error.message
            : 'Unpivot computation failed. Please try again.';
        setIsComputing(false);
        setComputeError(message);
        updateSettings(atomId, {
          unpivotStatus: 'failed',
          unpivotError: message,
        });
      }
    };

    runCompute();

    return () => {
      controller.abort();
    };
    // Only trigger when Apply button is clicked (manualRefreshToken or lastApplyTrigger changes)
    // We read settings values inside the effect, but don't trigger on their changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atomId, manualRefreshToken, (settings as any).lastApplyTrigger, updateSettings]);

  const handleRefresh = React.useCallback(() => {
    setManualRefreshToken((prev) => prev + 1);
  }, []);

  const handleSave = React.useCallback(async () => {
    if (!settings.datasetPath || !(settings.unpivotResults?.length ?? 0)) {
      return;
    }
    if (!settings.atomId) {
      setSaveError('Atom ID not found. Please compute first.');
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      const response = await fetch(
        `${UNPIVOT_API}/${encodeURIComponent(settings.atomId)}/save`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ format: 'parquet' }),
        }
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Save failed (${response.status})`);
      }
      const result = await response.json();
      const message = result?.minio_path
        ? `Saved to ${result.minio_path}`
        : 'Unpivot result saved successfully';
      setSaveMessage(message);
      updateSettings(atomId, {
        unpivotLastSavedPath: result?.minio_path ?? null,
        unpivotLastSavedAt: result?.updated_at ?? null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to save result. Please try again.';
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  }, [atomId, settings.datasetPath, settings.unpivotResults, settings.atomId, updateSettings]);

  const handleSaveAs = React.useCallback(() => {
    const defaultFilename = `unpivot_${atomId}_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    setSaveAsFileName(defaultFilename);
    setShowSaveAsModal(true);
  }, [atomId]);

  const confirmSaveAs = React.useCallback(async () => {
    if (!settings.datasetPath || !(settings.unpivotResults?.length ?? 0)) {
      return;
    }
    if (!settings.atomId) {
      setSaveError('Atom ID not found. Please compute first.');
      return;
    }
    if (!saveAsFileName.trim()) {
      setSaveError('Please enter a filename');
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    setSaveMessage(null);
    try {
      const response = await fetch(
        `${UNPIVOT_API}/${encodeURIComponent(settings.atomId)}/save`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ format: 'parquet', filename: saveAsFileName.trim() }),
        }
      );
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `Save failed (${response.status})`);
      }
      const result = await response.json();
      const message = result?.minio_path
        ? `Saved as ${result.minio_path}`
        : 'Unpivot result saved successfully';
      setSaveMessage(message);
      setShowSaveAsModal(false);
      setSaveAsFileName('');
      updateSettings(atomId, {
        unpivotLastSavedPath: result?.minio_path ?? null,
        unpivotLastSavedAt: result?.updated_at ?? null,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unable to save result. Please try again.';
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  }, [atomId, settings.datasetPath, settings.unpivotResults, settings.atomId, saveAsFileName, updateSettings]);

  const readinessMessage = React.useMemo(() => {
    if (!settings.datasetPath) {
      return 'Select a dataset from the Input Files tab to start unpivoting.';
    }
    if (settings.idVars.length === 0 && settings.valueVars.length === 0) {
      return 'Configure ID Variables and/or Value Variables in the Settings tab.';
    }
    return null;
  }, [settings.datasetPath, settings.idVars, settings.valueVars]);

  return (
    <div className="w-full h-full">
      <UnpivotCanvas
        data={settings}
        onDataChange={handleDataChange}
        isLoading={isComputing}
        atomId={atomId}
        error={computeError}
        infoMessage={readinessMessage}
        isSaving={isSaving}
        saveError={saveError}
        saveMessage={
          saveMessage ||
          (settings.unpivotLastSavedPath
            ? `Last saved: ${settings.unpivotLastSavedPath}`
            : null)
        }
        onRefresh={handleRefresh}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
      />

      {/* Save As Modal */}
      <Dialog open={showSaveAsModal} onOpenChange={setShowSaveAsModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Save Unpivot Result As</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              File Name
            </label>
            <Input
              value={saveAsFileName}
              onChange={(e) => setSaveAsFileName(e.target.value)}
              placeholder="Enter file name"
              className="w-full"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && saveAsFileName.trim()) {
                  confirmSaveAs();
                }
              }}
            />
            <p className="text-xs text-muted-foreground mt-2">
              The file will be saved as a Parquet (.parquet) file.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowSaveAsModal(false);
                setSaveAsFileName('');
              }}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmSaveAs}
              disabled={isSaving || !saveAsFileName.trim()}
              className="bg-[#1A73E8] hover:bg-[#1455ad] text-white"
            >
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export { UnpivotProperties };
export default UnpivotAtom;

