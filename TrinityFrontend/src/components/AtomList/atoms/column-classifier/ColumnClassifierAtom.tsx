import React from 'react';
import { useToast } from '@/hooks/use-toast';
import LoadingAnimation from '@/templates/LoadingAnimation/LoadingAnimation';

import ColumnClassifierCanvas from './components/ColumnClassifierCanvas';
import ColumnClassifierDimensionMapping from './components/ColumnClassifierDimensionMapping';
import { Button } from '@/components/ui/button';
import {
  useLaboratoryStore,
  DEFAULT_COLUMN_CLASSIFIER_SETTINGS,
  ColumnClassifierSettings as SettingsType,
  ColumnClassifierData,
  ColumnClassifierFile,
  ColumnClassifierColumn
} from '@/components/LaboratoryMode/store/laboratoryStore';
import { CLASSIFIER_API } from '@/lib/api';
import { fetchDimensionMapping } from '@/lib/dimensions';
import { useAuth } from '@/contexts/AuthContext';
import { logSessionState, updateSessionState, addNavigationItem } from '@/lib/session';

export type ColumnData = ColumnClassifierColumn;
export type FileClassification = ColumnClassifierFile;
export type ClassifierData = ColumnClassifierData;
interface Props {
  atomId: string;
}

const ColumnClassifierAtom: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings: SettingsType = {
    ...DEFAULT_COLUMN_CLASSIFIER_SETTINGS,
    ...(atom?.settings as SettingsType)
  };
  const classifierData = settings.data || DEFAULT_COLUMN_CLASSIFIER_SETTINGS.data;
  const { toast } = useToast();
  const { user } = useAuth();

  const processedFileRef = React.useRef<string | null>(null);
  const pendingMappingRef = React.useRef<AbortController | null>(null);
  const lastActiveIndexRef = React.useRef<number | null>(null);
  const lastFileNameRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    const activeIndex = classifierData.activeFileIndex ?? 0;
    const activeFile = classifierData.files[activeIndex];
    const fileName = activeFile?.fileName || null;

    const ensureToggleState = (enable: boolean, dims: string[]) => {
      const sortedDims = enable ? [...dims].sort() : [];
      const currentDims = [...(settings.dimensions || [])].sort();
      const dimsChanged =
        sortedDims.length !== currentDims.length ||
        sortedDims.some((dim, idx) => dim !== currentDims[idx]);
      const currentToggle = settings.enableDimensionMapping || false;
      if (dimsChanged || currentToggle !== enable) {
        updateSettings(atomId, {
          enableDimensionMapping: enable,
          dimensions: sortedDims,
        });
      }
    };

    const fileChanged =
      lastActiveIndexRef.current !== activeIndex ||
      lastFileNameRef.current !== fileName;

    if (!activeFile) {
      processedFileRef.current = null;
      lastActiveIndexRef.current = classifierData.activeFileIndex ?? null;
      lastFileNameRef.current = null;
      if (pendingMappingRef.current) {
        pendingMappingRef.current.abort();
        pendingMappingRef.current = null;
      }
      if ((settings.enableDimensionMapping || false) || (settings.dimensions || []).length) {
        ensureToggleState(false, []);
      }
      return;
    }

    if (fileChanged) {
      lastActiveIndexRef.current = activeIndex;
      lastFileNameRef.current = fileName;
      processedFileRef.current = null;
      if (pendingMappingRef.current) {
        pendingMappingRef.current.abort();
        pendingMappingRef.current = null;
      }
      ensureToggleState(false, []);
    }

    if (!fileName) {
      processedFileRef.current = null;
      return;
    }

    if (processedFileRef.current === fileName) {
      return;
    }

    const controller = new AbortController();
    if (pendingMappingRef.current) {
      pendingMappingRef.current.abort();
    }
    pendingMappingRef.current = controller;

    (async () => {
      try {
        const { mapping, config } = await fetchDimensionMapping({
          objectName: fileName,
          signal: controller.signal,
        });
        if (controller.signal.aborted) {
          return;
        }
        processedFileRef.current = fileName;
        const keys = Object.keys(mapping || {});
        const sortedKeys = keys.length > 0 ? [...keys].sort() : [];
        const store = useLaboratoryStore.getState();
        const atomSnapshot = store.getAtom(atomId);

        if (!atomSnapshot) {
          ensureToggleState(keys.length > 0, sortedKeys);
          return;
        }

        const snapshotSettings: SettingsType = {
          ...DEFAULT_COLUMN_CLASSIFIER_SETTINGS,
          ...(atomSnapshot.settings as SettingsType),
        };
        const snapshotData =
          snapshotSettings.data || DEFAULT_COLUMN_CLASSIFIER_SETTINGS.data;

        if (!snapshotData.files.length) {
          ensureToggleState(keys.length > 0, sortedKeys);
          return;
        }

        const snapshotIndex = snapshotData.activeFileIndex ?? activeIndex;
        const identifierSet = new Set(
          Array.isArray(config?.identifiers) ? config?.identifiers : [],
        );
        const measureSet = new Set(
          Array.isArray(config?.measures) ? config?.measures : [],
        );
        const syncCategories = identifierSet.size > 0 || measureSet.size > 0;

        const updatedFiles = snapshotData.files.map((file, index) => {
          if (index !== snapshotIndex) {
            return file;
          }
          const updatedColumns = syncCategories
            ? file.columns.map(col => {
                if (identifierSet.has(col.name)) {
                  return { ...col, category: 'identifiers' };
                }
                if (measureSet.has(col.name)) {
                  return { ...col, category: 'measures' };
                }
                return { ...col, category: 'unclassified' };
              })
            : file.columns;
          return {
            ...file,
            columns: updatedColumns,
            customDimensions: keys.length > 0 ? mapping : {},
          };
        });

        store.updateAtomSettings(atomId, {
          data: { ...snapshotData, files: updatedFiles },
          dimensions: sortedKeys,
          enableDimensionMapping: keys.length > 0,
          filterColumnViewUnique:
            snapshotSettings.filterColumnViewUnique ?? true,
        });
      } catch (err) {
        if (!controller.signal.aborted) {
          processedFileRef.current = fileName;
          const store = useLaboratoryStore.getState();
          const atomSnapshot = store.getAtom(atomId);
          if (atomSnapshot) {
            const snapshotSettings: SettingsType = {
              ...DEFAULT_COLUMN_CLASSIFIER_SETTINGS,
              ...(atomSnapshot.settings as SettingsType),
            };
            const snapshotData =
              snapshotSettings.data || DEFAULT_COLUMN_CLASSIFIER_SETTINGS.data;
            if (snapshotData.files.length) {
              const snapshotIndex = snapshotData.activeFileIndex ?? activeIndex;
              const clearedFiles = snapshotData.files.map((file, index) =>
                index === snapshotIndex
                  ? { ...file, customDimensions: {} }
                  : file,
              );
              store.updateAtomSettings(atomId, {
                data: { ...snapshotData, files: clearedFiles },
                dimensions: [],
                enableDimensionMapping: false,
              });
            } else {
              ensureToggleState(false, []);
            }
          } else {
            ensureToggleState(false, []);
          }
        }
      } finally {
        if (pendingMappingRef.current === controller) {
          pendingMappingRef.current = null;
        }
      }
    })();

    return () => {
      controller.abort();
    };
  }, [
    atomId,
    classifierData.activeFileIndex,
    classifierData.files,
    settings.dimensions,
    settings.enableDimensionMapping,
    updateSettings,
  ]);

  React.useEffect(() => {
    const stored = localStorage.getItem('column-classifier-config');
    if (!stored || !classifierData.files.length) return;
    try {
      const cfg = JSON.parse(stored);
      const file = classifierData.files[0];
      if (cfg?.file_name && file?.fileName && cfg.file_name !== file.fileName) {
        return;
      }
      const updatedFile: ColumnClassifierFile = {
        ...file,
        columns: file.columns.map(col => ({
          ...col,
          category: cfg.identifiers?.includes(col.name)
            ? 'identifiers'
            : cfg.measures?.includes(col.name)
            ? 'measures'
            : 'unclassified',
        })),
        customDimensions: cfg.dimensions || {},
      };
      updateSettings(atomId, {
        data: { files: [updatedFile], activeFileIndex: 0 },
        dimensions: Object.keys(cfg.dimensions || {}),
        enableDimensionMapping: Object.keys(cfg.dimensions || {}).length > 0,
        filterColumnViewUnique: true,
      });
    } catch (err) {
      console.warn('failed to apply stored config', err);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  const handleColumnMove = (
    columnName: string | string[],
    newCategory: string,
    fileIndex?: number
  ) => {
    const targetFileIndex =
      fileIndex !== undefined ? fileIndex : classifierData.activeFileIndex;

    // Convert single column to array for consistent processing
    const columnsToMove = Array.isArray(columnName) ? columnName : [columnName];

    const updated = {
      ...classifierData,
      files: classifierData.files.map((file, index) => {
        if (index !== targetFileIndex) return file;

        const updatedCustom = { ...file.customDimensions };
        // remove from all custom dimensions first
        columnsToMove.forEach(colName => {
          Object.keys(updatedCustom).forEach(key => {
            updatedCustom[key] = updatedCustom[key].filter(col => col !== colName);
          });
        });

        let updatedColumns = file.columns;

        if (
          newCategory === 'identifiers' ||
          newCategory === 'measures' ||
          newCategory === 'unclassified'
        ) {
          // regular category change - update all specified columns
          updatedColumns = file.columns.map(col =>
            columnsToMove.includes(col.name) ? { ...col, category: newCategory } : col
          );
        } else {
          // assigning to a dimension: keep identifier category
          if (!updatedCustom[newCategory]) {
            updatedCustom[newCategory] = [];
          }
          columnsToMove.forEach(colName => {
            if (!updatedCustom[newCategory].includes(colName)) {
              updatedCustom[newCategory].push(colName);
            }
          });
        }

        return {
          ...file,
          columns: updatedColumns,
          customDimensions: updatedCustom
        };
      })
    };

    updateSettings(atomId, { data: updated });
  };

  const handleRemoveCustomDimension = (dimensionName: string) => {
    const dims = (settings.dimensions || []).filter(d => d !== dimensionName);
    const updatedFiles = classifierData.files.map((file, index) => {
      if (index !== classifierData.activeFileIndex) return file;
      const updatedCustom = { ...file.customDimensions };
      const removedCols = updatedCustom[dimensionName] || [];
      delete updatedCustom[dimensionName];
      updatedCustom['unattributed'] = Array.from(
        new Set([...(updatedCustom['unattributed'] || []), ...removedCols])
      );
      return { ...file, customDimensions: updatedCustom };
    });
    updateSettings(atomId, {
      dimensions: dims,
      data: { ...classifierData, files: updatedFiles },
    });
  };

  const handleDimensionUpdate = (dimensions: Record<string, string[]>) => {
    const updatedFiles = classifierData.files.map((file, index) =>
      index === classifierData.activeFileIndex
        ? { ...file, customDimensions: dimensions }
        : file
    );
    updateSettings(atomId, { data: { ...classifierData, files: updatedFiles } });
  };


  const handleFilterToggle = (val: boolean) => {
    updateSettings(atomId, { filterColumnViewUnique: val });
  };


  const setActiveFile = (fileIndex: number) => {
    updateSettings(atomId, { data: { ...classifierData, activeFileIndex: fileIndex } });
  };

  const saveAssignments = async () => {
    if (!classifierData.files.length) return;
    const currentFile = classifierData.files[classifierData.activeFileIndex];
    const stored = localStorage.getItem('current-project');
    const envStr = localStorage.getItem('env');
    const project = stored ? JSON.parse(stored) : {};
    const env = envStr ? JSON.parse(envStr) : {};

    const identifiers = currentFile.columns
      .filter(c => c.category === 'identifiers')
      .map(c => c.name);
    const measures = currentFile.columns
      .filter(c => c.category === 'measures')
      .map(c => c.name);

    const payload: Record<string, any> = {
      project_id: project.id || null,
      client_name: env.CLIENT_NAME || '',
      app_name: env.APP_NAME || '',
      project_name: env.PROJECT_NAME || '',
      identifiers,
      measures,
      dimensions: currentFile.customDimensions
    };
    if (currentFile.fileName) {
      payload.file_name = currentFile.fileName;
    }

    try {
      const res = await fetch(`${CLASSIFIER_API}/save_config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include'
      });

      if (res.ok) {
        toast({ title: 'Configuration Saved Successfully' });
        localStorage.setItem('column-classifier-config', JSON.stringify(payload));
        updateSessionState(user?.id, {
          identifiers,
          measures,
          dimensions: currentFile.customDimensions,
        });
        addNavigationItem(user?.id, {
          atom: 'column-classifier',
          identifiers,
          measures,
          dimensions: currentFile.customDimensions,
        });
        logSessionState(user?.id);
      } else {
        toast({ title: 'Unable to Save Configuration', variant: 'destructive' });
        try {
          const txt = await res.text();
          console.warn('assignment save error response', txt);
        } catch (err) {
          console.warn('assignment save error parse fail', err);
        }
        logSessionState(user?.id);
      }
    } catch (err) {
      toast({ title: 'Unable to Save Configuration', variant: 'destructive' });
      console.warn('assignment save request failed', err);
      logSessionState(user?.id);
    }
  };

  const saveDisabled =
    !settings.enableDimensionMapping ||
    !classifierData.files.length ||
    Object.keys(
      classifierData.files[classifierData.activeFileIndex]?.customDimensions || {}
    ).length === 0 ||
    Object.values(
      classifierData.files[classifierData.activeFileIndex]?.customDimensions || {}
    ).every(c => c.length === 0);

  return (
    <div className="w-full h-full bg-white flex flex-col">
        <div className="flex flex-1">
          <div className="relative w-full h-full p-4 min-h-[450px]">
            {settings.isLoading ? (
              <LoadingAnimation status={settings.loadingStatus} />
            ) : (
              <ColumnClassifierCanvas
                data={classifierData}
                onColumnMove={handleColumnMove}
                onActiveFileChange={setActiveFile}
                showColumnView={settings.enableColumnView ?? true}
                filterUnique={settings.filterColumnViewUnique || false}
                onFilterToggle={handleFilterToggle}
                atomId={atomId}
              />
            )}
          </div>
        </div>
      {!settings.isLoading && settings.enableDimensionMapping && (
        <div className="border-t p-4 overflow-y-auto">
          <ColumnClassifierDimensionMapping
            customDimensions={
              classifierData.files[classifierData.activeFileIndex]?.customDimensions || {}
            }
            onRemoveDimension={handleRemoveCustomDimension}
            onDimensionUpdate={handleDimensionUpdate}
          />
          <Button
            disabled={saveDisabled}
            onClick={saveAssignments}
            className="w-full h-12 text-sm font-semibold bg-gradient-to-r from-gray-800 to-gray-900 hover:from-gray-900 hover:to-black mt-4"
          >
            Save Configuration
          </Button>
        </div>
      )}
    </div>
  );
};

export default ColumnClassifierAtom;
