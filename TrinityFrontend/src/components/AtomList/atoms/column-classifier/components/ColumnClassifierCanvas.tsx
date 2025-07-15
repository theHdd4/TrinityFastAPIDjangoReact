
import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit2, X, FileText, Trash2, TrendingUp, BarChart3, Tag } from 'lucide-react';
import { ClassifierData, ColumnData } from '../ColumnClassifierAtom';

interface ColumnClassifierCanvasProps {
  data: ClassifierData;
  validatorId?: string;
  onColumnMove: (columnName: string, newCategory: string, fileIndex?: number) => void;
  onActiveFileChange: (fileIndex: number) => void;
  onFileDelete?: (fileIndex: number) => void;
}

const ColumnClassifierCanvas: React.FC<ColumnClassifierCanvasProps> = ({
  data,
  validatorId,
  onColumnMove,
  onActiveFileChange,
  onFileDelete
}) => {
  const [showDropdowns, setShowDropdowns] = useState<{ [key: string]: boolean }>({});

  if (!data.files.length) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-50">
        <div className="text-center p-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-200 rounded-full flex items-center justify-center">
            <Edit2 className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-700 mb-2">Column Classifier</h3>
          <p className="text-gray-500">Use the Properties panel to upload files and classify columns</p>
        </div>
      </div>
    );
  }

  const currentFile = data.files[data.activeFileIndex];
  const identifiers = currentFile?.columns.filter(col => col.category === 'identifiers') || [];
  const measures = currentFile?.columns.filter(col => col.category === 'measures') || [];

  const getUnclassifiedColumns = () => {
    if (!currentFile) return [];
    return currentFile.columns.filter(col => col.category === 'unclassified');
  };

  const getAvailableIdentifiers = () => {
    if (!currentFile) return [];
    const used = new Set(Object.values(currentFile.customDimensions).flat());
    return currentFile.columns.filter(
      col => col.category === 'identifiers' && !used.has(col.name)
    );
  };

  const toggleDropdown = (category: string) => {
    setShowDropdowns(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const handleColumnSelect = (columnName: string, category: string) => {
    onColumnMove(columnName, category, data.activeFileIndex);
    setShowDropdowns(prev => ({ ...prev, [category]: false }));
  };


  const handleFileDelete = (fileIndex: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (onFileDelete) {
      onFileDelete(fileIndex);
    }
  };

  const DimensionCard: React.FC<{
    title: string;
    icon: React.ReactNode;
    gradient: string;
    columns: ColumnData[];
    category: string;
    onRemove: (columnName: string) => void;
  }> = ({ title, icon, gradient, columns, category, onRemove }) => (
    <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm overflow-hidden transform hover:scale-105 transition-all duration-300">
      <div className={`${gradient} p-3`}>
        <h4 className="font-bold text-white text-lg flex items-center">
          {icon}
          {title}
        </h4>
      </div>
      <div className="p-4">
        <div className="flex flex-wrap gap-3">
          {columns.map(column => (
            <Badge
              key={column.name}
              className={`${gradient.replace('bg-gradient-to-r', 'bg-gradient-to-r')} text-white px-4 py-2 font-medium flex items-center gap-1`}
            >
              {column.name}
              <X
                className="w-3 h-3 cursor-pointer hover:text-red-200"
                onClick={() => onRemove(column.name)}
              />
            </Badge>
          ))}
          <div className="flex items-center gap-2">
            {showDropdowns[category] && (
              <select
                className="p-2 border rounded bg-white text-sm min-w-[120px]"
                onChange={(e) => {
                  const val = e.target.value;
                  if (val) {
                    handleColumnSelect(val, category);
                  }
                }}
                value=""
              >
                <option value="">Select...</option>
                {getAvailableIdentifiers().map(column => (
                  <option key={column.name} value={column.name}>
                    {column.name}
                  </option>
                ))}
              </select>
            )}
            <div
              className={`flex items-center justify-center w-10 h-10 ${gradient} text-white rounded-full font-bold text-lg shadow-lg cursor-pointer hover:scale-110 transition-transform`}
              onClick={() => toggleDropdown(category)}
            >
              +
            </div>
          </div>
        </div>
      </div>
    </Card>
  );

  return (
    <div className="w-full h-full p-4 bg-gradient-to-br from-gray-50 to-gray-100 overflow-y-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          Column <span className="bg-yellow-200 px-2 py-1 rounded">Classifier</span>
        </h2>
        
        {/* File Tabs */}
        <div className="flex space-x-2 mb-6">
          {data.files.map((file, index) => (
            <div
              key={index}
              className={`flex items-center space-x-2 px-4 py-3 rounded-lg border-2 transition-all duration-200 ${
                index === data.activeFileIndex 
                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white border-blue-500 shadow-lg' 
                  : 'bg-white border-gray-300 hover:bg-gray-50 hover:border-gray-400'
              }`}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onActiveFileChange(index)}
                className={`flex items-center space-x-2 p-0 h-auto ${
                  index === data.activeFileIndex ? 'text-white hover:text-white' : ''
                }`}
              >
                <FileText className="w-4 h-4" />
                <span className="font-medium">{file.fileName}</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => handleFileDelete(index, e)}
                className={`p-1 h-auto rounded hover:bg-red-500 hover:text-white transition-colors ${
                  index === data.activeFileIndex ? 'text-white' : 'text-gray-500'
                }`}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        {/* Identifiers Section */}
        <DimensionCard
          title="Identifiers"
          icon={<Tag className="w-5 h-5 mr-2" />}
          gradient="bg-gradient-to-r from-blue-500 to-blue-600"
          columns={identifiers}
          category="identifiers"
          onRemove={(columnName) => onColumnMove(columnName, 'unclassified', data.activeFileIndex)}
        />

        {/* Measures Section */}
        <DimensionCard
          title="Measures"
          icon={<BarChart3 className="w-5 h-5 mr-2" />}
          gradient="bg-gradient-to-r from-green-500 to-green-600"
          columns={measures}
          category="measures"
          onRemove={(columnName) => onColumnMove(columnName, 'unclassified', data.activeFileIndex)}
        />

        {/* Unclassified Columns - if any */}
        {getUnclassifiedColumns().length > 0 && (
          <Card className="border-2 border-dashed border-orange-300 bg-orange-50">
            <div className="p-4">
              <h4 className="font-semibold text-orange-800 mb-3 flex items-center">
                <Edit2 className="w-4 h-4 mr-2" />
                Unclassified Columns
              </h4>
              <div className="flex flex-wrap gap-2">
                {getUnclassifiedColumns().map(column => (
                  <Badge
                    key={column.name}
                    variant="outline"
                    className="bg-white border-orange-300 text-orange-700"
                  >
                    {column.name}
                  </Badge>
                ))}
              </div>
            </div>
          </Card>
        )}

        {/* Custom Dimensions */}
        {Object.keys(currentFile.customDimensions).length === 0 ? (
          <p className="text-sm text-gray-500">
            Configure Dimensions in Properties -&gt; Dimensions to set Dimensions
          </p>
        ) : (
          Object.entries(currentFile.customDimensions).map(([dimensionName, columnNames]) => {
            const dimensionColumns = columnNames.map(name =>
              currentFile.columns.find(col => col.name === name)
            ).filter(Boolean) as ColumnData[];

            return (
              <DimensionCard
                key={dimensionName}
                title={dimensionName}
                icon={<TrendingUp className="w-5 h-5 mr-2" />}
                gradient="bg-gradient-to-r from-purple-500 to-purple-600"
                columns={dimensionColumns}
                category={dimensionName}
                onRemove={(columnName) => onColumnMove(columnName, 'unclassified', data.activeFileIndex)}
              />
            );
          })
        )}

      </div>
    </div>
  );
};

export default ColumnClassifierCanvas;