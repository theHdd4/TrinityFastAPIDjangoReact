import React from 'react';

import ColumnClassifierCanvas from './components/ColumnClassifierCanvas';
import ColumnClassifierVisualisation from './components/ColumnClassifierVisualisation';
import {
  useLaboratoryStore,
  DEFAULT_COLUMN_CLASSIFIER_SETTINGS,
  ColumnClassifierSettings as SettingsType,
  ColumnClassifierData,
  ColumnClassifierFile,
  ColumnClassifierColumn
} from '@/components/LaboratoryMode/store/laboratoryStore';
import { CLASSIFIER_API } from '@/lib/api';

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

  const handleClassification = (file: FileClassification) => {
    updateSettings(atomId, { data: { files: [file], activeFileIndex: 0 } });
  };

  const handleColumnMove = (columnName: string, newCategory: string, fileIndex?: number) => {
    const targetFileIndex = fileIndex !== undefined ? fileIndex : classifierData.activeFileIndex;
    const updated = {
      ...classifierData,
      files: classifierData.files.map((file, index) => {
        if (index === targetFileIndex) {
          const updatedCustom = { ...file.customDimensions };
          Object.keys(updatedCustom).forEach(key => {
            updatedCustom[key] = updatedCustom[key].filter(col => col !== columnName);
          });

          const updatedColumns = file.columns.map(col =>
            col.name === columnName ? { ...col, category: newCategory } : col
          );

          if (newCategory !== 'identifiers' && newCategory !== 'measures' && newCategory !== 'unclassified') {
            if (!updatedCustom[newCategory]) {
              updatedCustom[newCategory] = [];
            }
            updatedCustom[newCategory].push(columnName);
          }

          return {
            ...file,
            columns: updatedColumns,
            customDimensions: updatedCustom
          };
        }
        return file;
      })
    };
    updateSettings(atomId, { data: updated });
  };


  const handleFileDelete = (fileIndex: number) => {
    const newFiles = classifierData.files.filter((_, index) => index !== fileIndex);
    const newActiveIndex =
      fileIndex === classifierData.activeFileIndex
        ? Math.max(0, classifierData.activeFileIndex - 1)
        : classifierData.activeFileIndex > fileIndex
        ? classifierData.activeFileIndex - 1
        : classifierData.activeFileIndex;

    updateSettings(atomId, {
      data: {
        files: newFiles,
        activeFileIndex:
          newFiles.length > 0 ? Math.min(newActiveIndex, newFiles.length - 1) : 0
      }
    });
  };

  const setActiveFile = (fileIndex: number) => {
    updateSettings(atomId, { data: { ...classifierData, activeFileIndex: fileIndex } });
  };

  const saveAssignments = async () => {
    if (!settings.validatorId || !classifierData.files.length) return;
    const currentFile = classifierData.files[classifierData.activeFileIndex];
    const stored = localStorage.getItem('current-project');
    const projectId = stored ? JSON.parse(stored).id : null;
    const form = new FormData();
    form.append('validator_atom_id', settings.validatorId);
    form.append('file_key', currentFile.fileName);
    form.append('identifier_assignments', JSON.stringify(currentFile.customDimensions));
    if (projectId) {
      form.append('project_id', String(projectId));
    }
    await fetch(`${CLASSIFIER_API}/assign_identifiers_to_dimensions`, {
      method: 'POST',
      body: form,
      credentials: 'include'
    });
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
    <div className="w-full h-full bg-white flex">
      <div className="w-3/5 p-4 overflow-y-auto">
        <ColumnClassifierCanvas
          data={classifierData}
          validatorId={settings.validatorId}
          onColumnMove={handleColumnMove}
          onActiveFileChange={setActiveFile}
          onFileDelete={handleFileDelete}
          onSave={saveAssignments}
          saveDisabled={saveDisabled}
        />
      </div>

      <div className="w-2/5 border-l border-gray-200 bg-gray-50 p-4 overflow-y-auto">
        <ColumnClassifierVisualisation data={classifierData} />
      </div>
    </div>
  );
};

export default ColumnClassifierAtom;
