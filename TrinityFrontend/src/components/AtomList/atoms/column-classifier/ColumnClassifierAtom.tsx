import React from 'react';
import { useLaboratoryStore, DEFAULT_COLUMN_CLASSIFIER_SETTINGS, ColumnClassifierSettings } from '@/components/LaboratoryMode/store/laboratoryStore';

export interface ColumnData {
  name: string;
  category: 'identifiers' | 'measures' | 'unclassified' | string;
  sampleValues?: any[];
}

export interface FileClassification {
  fileName: string;
  columns: ColumnData[];
  customDimensions: { [key: string]: string[] };
}

export interface ClassifierData {
  files: FileClassification[];
  activeFileIndex: number;
}
import ColumnClassifierCanvas from './components/ColumnClassifierCanvas';

interface Props {
  atomId: string;
}

const ColumnClassifierAtom: React.FC<Props> = ({ atomId }) => {
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  const settings: ColumnClassifierSettings = (atom?.settings as ColumnClassifierSettings) || { ...DEFAULT_COLUMN_CLASSIFIER_SETTINGS };

  const handleColumnMove = (columnName: string, newCategory: string, fileIndex?: number) => {
    const data = settings.classifierData;
    const targetFileIndex = fileIndex !== undefined ? fileIndex : data.activeFileIndex;
    const updatedFiles = data.files.map((file, index) => {
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
        return { ...file, columns: updatedColumns, customDimensions: updatedCustom };
      }
      return file;
    });
    updateSettings(atomId, { classifierData: { ...data, files: updatedFiles } });
  };

  const handleCustomDimensionAdd = (dimensionName: string, fileIndex?: number) => {
    const data = settings.classifierData;
    const targetFileIndex = fileIndex !== undefined ? fileIndex : data.activeFileIndex;
    const updatedFiles = data.files.map((file, index) => {
      if (index === targetFileIndex) {
        return {
          ...file,
          customDimensions: {
            ...file.customDimensions,
            [dimensionName]: []
          }
        };
      }
      return file;
    });
    updateSettings(atomId, { classifierData: { ...data, files: updatedFiles } });
  };

  const setActiveFile = (fileIndex: number) => {
    updateSettings(atomId, { classifierData: { ...settings.classifierData, activeFileIndex: fileIndex } });
  };

  const handleFileDelete = (fileIndex: number) => {
    const data = settings.classifierData;
    const newFiles = data.files.filter((_, idx) => idx !== fileIndex);
    const newActive = fileIndex === data.activeFileIndex ? Math.max(0, data.activeFileIndex - 1) : data.activeFileIndex > fileIndex ? data.activeFileIndex - 1 : data.activeFileIndex;
    updateSettings(atomId, { classifierData: { files: newFiles, activeFileIndex: newFiles.length > 0 ? Math.min(newActive, newFiles.length - 1) : 0 } });
  };

  return (
    <div className="w-full h-full bg-white rounded-lg overflow-hidden flex flex-col">
      <ColumnClassifierCanvas
        data={settings.classifierData}
        onColumnMove={handleColumnMove}
        onCustomDimensionAdd={handleCustomDimensionAdd}
        onActiveFileChange={setActiveFile}
        onFileDelete={handleFileDelete}
      />
    </div>
  );
};

export default ColumnClassifierAtom;
