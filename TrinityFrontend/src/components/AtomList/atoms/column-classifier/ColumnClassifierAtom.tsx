import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Settings, BarChart3, Eye } from 'lucide-react';
import ColumnClassifierCanvas from './components/ColumnClassifierCanvas';
import ColumnClassifierSettings from './components/ColumnClassifierSettings';
import ColumnClassifierVisualisation from './components/ColumnClassifierVisualisation';
import ColumnClassifierExhibition from './components/ColumnClassifierExhibition';

export interface ColumnData {
  name: string;
  category: 'identifiers' | 'measures' | 'unclassified' | string;
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

const ColumnClassifierAtom: React.FC = () => {
  const [classifierData, setClassifierData] = useState<ClassifierData>({
    files: [],
    activeFileIndex: 0
  });

  const handleClassification = (file: FileClassification) => {
    setClassifierData({ files: [file], activeFileIndex: 0 });
  };

  const handleColumnMove = (columnName: string, newCategory: string, fileIndex?: number) => {
    const targetFileIndex = fileIndex !== undefined ? fileIndex : classifierData.activeFileIndex;

    setClassifierData(prev => ({
      ...prev,
      files: prev.files.map((file, index) => {
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
    }));
  };

  const handleCustomDimensionAdd = (dimensionName: string, fileIndex?: number) => {
    const targetFileIndex = fileIndex !== undefined ? fileIndex : classifierData.activeFileIndex;

    setClassifierData(prev => ({
      ...prev,
      files: prev.files.map((file, index) => {
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
      })
    }));
  };

  const handleFileDelete = (fileIndex: number) => {
    setClassifierData(prev => {
      const newFiles = prev.files.filter((_, index) => index !== fileIndex);
      const newActiveIndex = fileIndex === prev.activeFileIndex
        ? Math.max(0, prev.activeFileIndex - 1)
        : prev.activeFileIndex > fileIndex
          ? prev.activeFileIndex - 1
          : prev.activeFileIndex;

      return {
        files: newFiles,
        activeFileIndex: newFiles.length > 0 ? Math.min(newActiveIndex, newFiles.length - 1) : 0
      };
    });
  };

  const setActiveFile = (fileIndex: number) => {
    setClassifierData(prev => ({
      ...prev,
      activeFileIndex: fileIndex
    }));
  };

  return (
    <div className="w-full h-full bg-white flex">
      <div className="flex-1">
        <ColumnClassifierCanvas
          data={classifierData}
          onColumnMove={handleColumnMove}
          onCustomDimensionAdd={handleCustomDimensionAdd}
          onActiveFileChange={setActiveFile}
          onFileDelete={handleFileDelete}
        />
      </div>

      <div className="w-80 border-l border-gray-200 bg-gray-50">
        <Tabs defaultValue="settings" className="w-full h-full">
          <TabsList className="grid w-full grid-cols-3 mx-4 my-4">
            <TabsTrigger value="settings" className="text-xs">
              <Settings className="w-3 h-3 mr-1" />
              Settings
            </TabsTrigger>
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
            <TabsContent value="settings" className="mt-2">
              <ColumnClassifierSettings onClassification={handleClassification} />
            </TabsContent>

            <TabsContent value="visualisation" className="mt-2">
              <ColumnClassifierVisualisation data={classifierData} />
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
