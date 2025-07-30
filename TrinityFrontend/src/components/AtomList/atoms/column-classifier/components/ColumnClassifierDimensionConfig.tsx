import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TrendingUp, X } from 'lucide-react';
import { ClassifierData, ColumnData } from '../ColumnClassifierAtom';

interface Props {
  data: ClassifierData;
  onColumnMove: (columnName: string, newCategory: string, fileIndex?: number) => void;
  onSave?: () => void;
  saveDisabled?: boolean;
}

const ColumnClassifierDimensionConfig: React.FC<Props> = ({ data, onColumnMove, onSave, saveDisabled }) => {
  const [showDropdowns, setShowDropdowns] = useState<{ [key: string]: boolean }>({});

  if (!data.files.length) return null;
  const currentFile = data.files[data.activeFileIndex];
  const identifiers = currentFile.columns.filter(c => c.category === 'identifiers');
  const assigned = Object.values(currentFile.customDimensions).flat();
  const getAvailableIdentifiers = () => identifiers.filter(id => !assigned.includes(id.name));

  const toggle = (dim: string) => {
    setShowDropdowns(prev => ({ ...prev, [dim]: !prev[dim] }));
  };
  const handleSelect = (name: string, dimension: string) => {
    onColumnMove(name, dimension, data.activeFileIndex);
    setShowDropdowns(prev => ({ ...prev, [dimension]: false }));
  };

  return (
    <div className="space-y-4">
      <h4 className="font-semibold text-gray-700 text-lg">Dimensions Config</h4>
      {Object.keys(currentFile.customDimensions).length === 0 ? (
        <p className="text-sm text-gray-500">
          Configure Dimensions in Properties -&gt; Dimensions to set Dimensions
        </p>
      ) : (
        Object.entries(currentFile.customDimensions).map(([dimensionName, columnNames]) => {
          const dimensionColumns = columnNames
            .map(name => currentFile.columns.find(col => col.name === name))
            .filter(Boolean) as ColumnData[];

          return (
            <Card key={dimensionName} className="border-0 shadow-xl bg-white/90 backdrop-blur-sm overflow-hidden">
              <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-3">
                <h4 className="font-bold text-white text-lg flex items-center">
                  <TrendingUp className="w-5 h-5 mr-2" />
                  {dimensionName}
                </h4>
              </div>
              <div className="p-4">
                <div className="flex flex-wrap gap-3">
                  {dimensionColumns.map(column => (
                    <Badge
                      key={column.name}
                      className="bg-gradient-to-r from-blue-500 to-blue-600 text-white px-4 py-2 font-medium flex items-center gap-1"
                    >
                      {column.name}
                      <X className="w-3 h-3 cursor-pointer hover:text-red-200" onClick={() => onColumnMove(column.name, 'identifiers', data.activeFileIndex)} />
                    </Badge>
                  ))}
                  <div className="flex items-center gap-2">
                    {showDropdowns[dimensionName] && (
                      <select
                        className="p-2 border rounded bg-white text-sm min-w-[120px]"
                        onChange={(e) => { const val = e.target.value; if (val) handleSelect(val, dimensionName); }}
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
                      className="flex items-center justify-center w-10 h-10 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-full font-bold text-lg shadow-lg cursor-pointer hover:scale-110 transition-transform"
                      onClick={() => toggle(dimensionName)}
                    >
                      +
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          );
        })
      )}
      <Button
        disabled={saveDisabled}
        onClick={onSave}
        className="w-full h-12 text-sm font-semibold bg-gradient-to-r from-gray-800 to-gray-900 hover:from-gray-900 hover:to-black"
      >
        Save Configuration
      </Button>
    </div>
  );
};

export default ColumnClassifierDimensionConfig;
