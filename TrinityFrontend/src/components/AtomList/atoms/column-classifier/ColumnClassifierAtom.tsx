import React from 'react';
import { useToast } from '@/hooks/use-toast';

import ColumnClassifierCanvas from './components/ColumnClassifierCanvas';
import ColumnClassifierDimensionConfig from './components/ColumnClassifierDimensionConfig';
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
import { logSessionState } from '@/lib/session';

export type ColumnData = ColumnClassifierColumn;
export type FileClassification = ColumnClassifierFile;
export type ClassifierData = ColumnClassifierData;
interface Props {
  atomId: string;
}

const ColumnClassifierAtom: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings: SettingsType = (atom?.settings as SettingsType) || {
    ...DEFAULT_COLUMN_CLASSIFIER_SETTINGS
  };
  const classifierData = settings.data;
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

    const key = `${payload.client_name}/${payload.app_name}/${payload.project_name}/column_classifier_config`;
    console.log('🆔 identifiers', identifiers);
    console.log('🏷️ dimensions', payload.dimensions);
    console.log('📁 will save configuration to', key);
    console.log('📦 saving configuration', payload);
    const res = await fetch(`${CLASSIFIER_API}/save_config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'include'
    });
    console.log('✅ save configuration response', res.status);
    if (res.ok) {
      toast({ title: 'Configuration Saved Successfully' });
      try {
        const json = await res.json();
        console.log('📝 configuration save result', json);
        console.log('🔑 redis namespace', json.key);
        console.log('📂 saved data', json.data);
      } catch (err) {
        console.warn('assignment save result parse error', err);
      }
      logSessionState(user?.id);
    } else {
      toast({ title: 'Unable to Save Configuration', variant: 'destructive' });
      try {
        const txt = await res.text();
        console.warn('assignment save error response', txt);
      } catch (err) {
        console.warn('assignment save error parse fail', err);
      }
    }
  };

  const saveDisabled =
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
        <div className="w-full p-4 overflow-y-auto">
          <ColumnClassifierCanvas
            data={classifierData}
            onColumnMove={handleColumnMove}
            onActiveFileChange={setActiveFile}
          />
        </div>
      </div>
      <div className="border-t p-4 overflow-y-auto">
        <ColumnClassifierDimensionConfig
          data={classifierData}
          onColumnMove={handleColumnMove}
          onSave={saveAssignments}
          saveDisabled={saveDisabled}
        />
      </div>
    </div>
  );
};

export default ColumnClassifierAtom;
