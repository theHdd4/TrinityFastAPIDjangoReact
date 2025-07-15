import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, Eye } from 'lucide-react';
import ColumnClassifierCanvas from './components/ColumnClassifierCanvas';
import ColumnClassifierVisualisation from './components/ColumnClassifierVisualisation';
import ColumnClassifierExhibition from './components/ColumnClassifierExhibition';
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

  return (
    <div className="w-full h-full bg-white flex">
      <div className="flex-1">
        <ColumnClassifierCanvas
          data={classifierData}
          validatorId={settings.validatorId}
          onColumnMove={handleColumnMove}
          onActiveFileChange={setActiveFile}
          onFileDelete={handleFileDelete}
        />
      </div>

      <div className="w-80 border-l border-gray-200 bg-gray-50">
        <Tabs defaultValue="visualisation" className="w-full h-full">
          <TabsList className="grid w-full grid-cols-2 mx-4 my-4">
            <TabsTrigger value="visualisation" className="text-xs">
              <BarChart3 className="w-3 h-3 mr-1" />
              Charts
            </TabsTrigger>
            <TabsTrigger value="exhibition" className="text-xs">
              <Eye className="w-3 h-3 mr-1" />
              Export
            </TabsTrigger>
          </TabsList>

          <div className="px-4 pb-4 h-[calc(100%-80px)] overflow-y-auto">
            <TabsContent value="visualisation" className="mt-2">
              <ColumnClassifierVisualisation
                data={classifierData}
                onSave={saveAssignments}
                saveDisabled={
                  Object.keys(classifierData.files[classifierData.activeFileIndex].customDimensions).length === 0 ||
                  Object.values(classifierData.files[classifierData.activeFileIndex].customDimensions).every(c => c.length === 0)
                }
              />
            </TabsContent>

            <TabsContent value="exhibition" className="mt-2">
              <ColumnClassifierExhibition data={classifierData} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
};

export default ColumnClassifierAtom;
