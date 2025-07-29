
import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, FileJson, FileSpreadsheet, Copy } from 'lucide-react';
import { ClassifierData } from '../ColumnClassifierAtom';

interface ColumnClassifierExhibitionProps {
  data: ClassifierData;
}

const ColumnClassifierExhibition: React.FC<ColumnClassifierExhibitionProps> = ({ data }) => {
  if (!data.files.length) {
    return (
      <div className="text-center p-8">
        <p className="text-gray-500">No classification data to export</p>
      </div>
    );
  }

  const exportToJSON = () => {
    const exportData = {
      files: data.files.map(file => ({
        fileName: file.fileName,
        classification: {
          identifiers: file.columns.filter(col => col.category === 'identifiers').map(col => col.name),
          measures: file.columns.filter(col => col.category === 'measures').map(col => col.name),
          customDimensions: file.customDimensions,
          unclassified: file.columns.filter(col => col.category === 'unclassified').map(col => col.name)
        }
      }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'column-classification.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToCSV = () => {
    const csvContent = [
      ['Column Name', 'Category'],
      ...currentFile.columns.map(col => [col.name, col.category]),
      ...Object.entries(currentFile.customDimensions).flatMap(([dimension, columns]) =>
        columns.map(col => [col, dimension])
      )
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${displayName}-classification.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = () => {
    const text = JSON.stringify({
      fileName: displayName,
      identifiers: currentFile.columns.filter(col => col.category === 'identifiers').map(col => col.name),
      measures: currentFile.columns.filter(col => col.category === 'measures').map(col => col.name),
      customDimensions: currentFile.customDimensions,
      unclassified: currentFile.columns.filter(col => col.category === 'unclassified').map(col => col.name)
    }, null, 2);

    navigator.clipboard.writeText(text);
  };

  const currentFile = data.files[data.activeFileIndex];
  const displayName = currentFile.fileName.split('/').pop();

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h4 className="font-semibold text-gray-900 mb-4">Export Options</h4>
        <div className="space-y-3">
          <Button 
            variant="outline" 
            className="w-full justify-start"
            onClick={exportToJSON}
          >
            <FileJson className="w-4 h-4 mr-2" />
            Export as JSON
          </Button>
          
          <Button 
            variant="outline" 
            className="w-full justify-start"
            onClick={exportToCSV}
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Export as CSV
          </Button>
          
          <Button 
            variant="outline" 
            className="w-full justify-start"
            onClick={copyToClipboard}
          >
            <Copy className="w-4 h-4 mr-2" />
            Copy to Clipboard
          </Button>
        </div>
      </Card>

      <Card className="p-4">
        <h4 className="font-semibold text-gray-900 mb-4">Classification Preview</h4>
        <div className="space-y-4">
          <div>
            <h5 className="text-sm font-medium text-blue-700 mb-2">Identifiers</h5>
            <div className="flex flex-wrap gap-1">
              {currentFile.columns.filter(col => col.category === 'identifiers').map(col => (
                <Badge key={col.name} variant="secondary" className="bg-blue-100 text-blue-800">
                  {col.name}
                </Badge>
              ))}
            </div>
          </div>
          
          <div>
            <h5 className="text-sm font-medium text-green-700 mb-2">Measures</h5>
            <div className="flex flex-wrap gap-1">
              {currentFile.columns.filter(col => col.category === 'measures').map(col => (
                <Badge key={col.name} variant="secondary" className="bg-green-100 text-green-800">
                  {col.name}
                </Badge>
              ))}
            </div>
          </div>
          
          {Object.entries(currentFile.customDimensions).map(([dimension, columns]) => (
            <div key={dimension}>
              <h5 className="text-sm font-medium text-purple-700 mb-2">{dimension}</h5>
              <div className="flex flex-wrap gap-1">
                {columns.map(col => (
                  <Badge key={col} variant="secondary" className="bg-purple-100 text-purple-800">
                    {col}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
          
          <div>
            <h5 className="text-sm font-medium text-yellow-700 mb-2">Unclassified</h5>
            <div className="flex flex-wrap gap-1">
              {currentFile.columns.filter(col => col.category === 'unclassified').map(col => (
                <Badge key={col.name} variant="secondary" className="bg-yellow-100 text-yellow-800">
                  {col.name}
                </Badge>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <h4 className="font-semibold text-gray-900 mb-4">Classification Summary</h4>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Current File:</span>
            <span className="font-medium break-all whitespace-normal">{displayName}</span>
          </div>
          <div className="flex justify-between">
            <span>Total Columns:</span>
            <span className="font-medium">{currentFile.columns.length}</span>
          </div>
          {Object.keys(currentFile.customDimensions).length > 0 && (
            <div className="flex justify-between">
              <span>Custom Dimensions:</span>
              <span className="font-medium">{Object.keys(currentFile.customDimensions).length}</span>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
};

export default ColumnClassifierExhibition;