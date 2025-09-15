import React from 'react';
import { useToast } from '@/hooks/use-toast';
import LoadingAnimation from '@/templates/LoadingAnimation';

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

  React.useEffect(() => {
    const loadMapping = async () => {
      const mapping = await fetchDimensionMapping();
      if (Object.keys(mapping).length && classifierData.files.length > 0) {
        const file = classifierData.files[0];
        const updatedFile: ColumnClassifierFile = {
          ...file,
          customDimensions: mapping,
        };
        updateSettings(atomId, {
          data: { files: [updatedFile], activeFileIndex: 0 },
          dimensions: Object.keys(mapping),
          enableDimensionMapping: true,
        });
      }
    };
    if (classifierData.files.length > 0) {
      loadMapping();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    const stored = localStorage.getItem('column-classifier-config');
    if (!stored || !classifierData.files.length) return;
    try {
      const cfg = JSON.parse(stored);
      const file = classifierData.files[0];
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
    columnName: string,
    newCategory: string,
    fileIndex?: number
  ) => {
    const targetFileIndex =
      fileIndex !== undefined ? fileIndex : classifierData.activeFileIndex;

    const updated = {
      ...classifierData,
      files: classifierData.files.map((file, index) => {
        if (index !== targetFileIndex) return file;

        const updatedCustom = { ...file.customDimensions };
        // remove from all custom dimensions first
        Object.keys(updatedCustom).forEach(key => {
          updatedCustom[key] = updatedCustom[key].filter(col => col !== columnName);
        });

        let updatedColumns = file.columns;

        if (
          newCategory === 'identifiers' ||
          newCategory === 'measures' ||
          newCategory === 'unclassified'
        ) {
          // regular category change
          updatedColumns = file.columns.map(col =>
            col.name === columnName ? { ...col, category: newCategory } : col
          );
        } else {
          // assigning to a dimension: keep identifier category
          if (!updatedCustom[newCategory]) {
            updatedCustom[newCategory] = [];
          }
          if (!updatedCustom[newCategory].includes(columnName)) {
            updatedCustom[newCategory].push(columnName);
          }
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

    const payload = {
      project_id: project.id || null,
      client_name: env.CLIENT_NAME || '',
      app_name: env.APP_NAME || '',
      project_name: env.PROJECT_NAME || '',
      identifiers,
      measures,
      dimensions: currentFile.customDimensions
    };

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
          <div className="w-full p-4">
            {settings.isLoading ? (
              <LoadingAnimation />
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
