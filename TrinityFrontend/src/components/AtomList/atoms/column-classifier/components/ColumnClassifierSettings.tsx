import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, File, Check } from 'lucide-react';
import { ColumnData, FileClassification } from '../ColumnClassifierAtom';
import { COLUMN_CLASSIFIER_API, VALIDATE_API, FEATURE_OVERVIEW_API } from '@/lib/api';

interface ColumnClassifierSettingsProps {
  settings: {
    autoClassify: boolean;
    classificationMethod: 'dataType' | 'columnName';
    selectedFiles: string[];
    validatorId?: string;
    fileKey?: string;
  };
  onSettingsChange: (settings: any) => void;
  onDataUpload: (data: FileClassification[]) => void;
}

const ColumnClassifierSettings: React.FC<ColumnClassifierSettingsProps> = ({
  settings,
  onSettingsChange,
  onDataUpload
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; data: any }[]>([]);
  const [savedDataframes, setSavedDataframes] = useState<{ object_name: string; csv_name: string }[]>([]);
  const [selectedDataframe, setSelectedDataframe] = useState('');

  useEffect(() => {
    fetch(`${VALIDATE_API}/list_saved_dataframes`)
      .then(res => res.json())
      .then(res => setSavedDataframes(res.files || []))
      .catch(() => {});
  }, []);

  const prefetchDataframe = async (name: string) => {
    if (!name) return;
    try {
      await fetch(
        `${FEATURE_OVERVIEW_API}/flight_table?object_name=${encodeURIComponent(name)}`
      ).then(r => r.arrayBuffer());
      await fetch(
        `${FEATURE_OVERVIEW_API}/cached_dataframe?object_name=${encodeURIComponent(name)}`
      ).then(r => r.text());
    } catch {
      /* ignore */
    }
  };

  const parseCSV = (text: string): { headers: string[], rows: any[] } => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) return { headers: [], rows: [] };
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const row: any = {};
      headers.forEach((header, index) => {
        const value = values[index] || '';
        const numValue = parseFloat(value);
        row[header] = !isNaN(numValue) && value !== '' ? numValue : value;
      });
      return row;
    });
    
    return { headers, rows };
  };

  const classifyColumnByDataType = (header: string, sampleValues: any[]): 'identifiers' | 'measures' | 'unclassified' => {
    const numericCount = sampleValues.filter(val => typeof val === 'number').length;
    const numericRatio = numericCount / sampleValues.length;
    
    // If mostly numeric, classify as measure
    if (numericRatio > 0.7) {
      return 'measures';
    }
    
    // If mixed or mostly text, classify as identifier
    if (numericRatio < 0.3) {
      return 'identifiers';
    }
    
    return 'unclassified';
  };

  const classifyColumnByName = (header: string, sampleValues: any[]): 'identifiers' | 'measures' | 'unclassified' => {
    const lowerHeader = header.toLowerCase();
    
    // Check for common identifier patterns
    if (lowerHeader.includes('id') || 
        lowerHeader.includes('key') || 
        lowerHeader.includes('name') ||
        lowerHeader.includes('code') ||
        lowerHeader.includes('category') ||
        lowerHeader.includes('type') ||
        lowerHeader.includes('brand') ||
        lowerHeader.includes('product')) {
      return 'identifiers';
    }
    
    // Check for common measure patterns
    if (lowerHeader.includes('amount') ||
        lowerHeader.includes('value') ||
        lowerHeader.includes('price') ||
        lowerHeader.includes('cost') ||
        lowerHeader.includes('revenue') ||
        lowerHeader.includes('sales') ||
        lowerHeader.includes('quantity') ||
        lowerHeader.includes('count') ||
        lowerHeader.includes('total') ||
        lowerHeader.includes('sum') ||
        lowerHeader.includes('avg') ||
        lowerHeader.includes('rate') ||
        lowerHeader.includes('percent')) {
      return 'measures';
    }
    
    return 'unclassified';
  };

  const classifyColumn = (header: string, sampleValues: any[]): 'identifiers' | 'measures' | 'unclassified' => {
    if (settings.classificationMethod === 'dataType') {
      return classifyColumnByDataType(header, sampleValues);
    } else {
      return classifyColumnByName(header, sampleValues);
    }
  };

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const { headers, rows } = parseCSV(text);
        
        const fileData = {
          name: file.name,
          data: { headers, rows }
        };
        
        setUploadedFiles(prev => [...prev, fileData]);
      } catch (error) {
        console.error('Error parsing CSV:', error);
      }
    };
    reader.readAsText(file);
  };

  const handleFileSelection = (fileName: string) => {
    const isSelected = settings.selectedFiles.includes(fileName);
    const newSelectedFiles = isSelected
      ? settings.selectedFiles.filter(name => name !== fileName)
      : [...settings.selectedFiles, fileName];
    
    onSettingsChange({ selectedFiles: newSelectedFiles });
  };

  const handleClassifyColumns = async () => {
    if (selectedDataframe) {
      const fileKey = selectedDataframe.replace(/\.(csv|arrow)$/i, '');
      try {
        const ticketRes = await fetch(`${VALIDATE_API}/latest_ticket/${fileKey}`);
        if (!ticketRes.ok) return;
        const ticket = await ticketRes.json();
        const validatorId = (ticket.flight_path || '').split('/')[0];
        onSettingsChange({ validatorId, fileKey });
        const form = new FormData();
        form.append('validator_atom_id', validatorId);
        form.append('file_key', fileKey);
        form.append('identifiers', JSON.stringify([]));
        form.append('measures', JSON.stringify([]));
        form.append('unclassified', JSON.stringify([]));
        const res = await fetch(`${COLUMN_CLASSIFIER_API}/classify_columns`, { method: 'POST', body: form });
        if (!res.ok) return;
        const data = await res.json();
        const cols: ColumnData[] = [
          ...data.final_classification.identifiers.map((n: string) => ({ name: n, category: 'identifiers' })),
          ...data.final_classification.measures.map((n: string) => ({ name: n, category: 'measures' })),
          ...data.final_classification.unclassified.map((n: string) => ({ name: n, category: 'unclassified' }))
        ];
        onDataUpload([{ fileName: fileKey, columns: cols, customDimensions: {} }]);
        await prefetchDataframe(selectedDataframe);
        return;
      } catch {
        return;
      }
    }
    const selectedFileData = uploadedFiles.filter(file =>
      settings.selectedFiles.includes(file.name)
    );
    
    const classifiedFiles: FileClassification[] = selectedFileData.map(file => {
      const columns: ColumnData[] = file.data.headers.map((header: string) => {
        const sampleValues = file.data.rows.slice(0, 10).map((row: any) => row[header]);
        const category = settings.autoClassify 
          ? classifyColumn(header, sampleValues)
          : 'unclassified';
        
        return {
          name: header,
          category,
          sampleValues
        };
      });
      
      return {
        fileName: file.name,
        columns,
        customDimensions: {}
      };
    });
    
    onDataUpload(classifiedFiles);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach(file => {
      if (file.type === 'text/csv') {
        handleFileUpload(file);
      }
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach(file => {
        handleFileUpload(file);
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Backend Options */}
      <Card className="p-4">
        <h4 className="font-semibold text-gray-900 mb-4">Select Saved Dataframe</h4>
        <Select value={selectedDataframe} onValueChange={val => setSelectedDataframe(val)}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose dataframe" />
          </SelectTrigger>
          <SelectContent>
            {savedDataframes.map(f => (
              <SelectItem key={f.object_name} value={f.csv_name}>{f.csv_name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          className="mt-4 w-full bg-blue-600 hover:bg-blue-700"
          onClick={handleClassifyColumns}
          disabled={!selectedDataframe}
        >
          Classify Columns
        </Button>
      </Card>
      {/* File Upload Drag & Drop */}
      <Card 
        className={`p-6 border-2 border-dashed transition-colors ${
          isDragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="text-center">
          <div className={`w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center ${
            isDragOver ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-400'
          }`}>
            <Upload className="w-6 h-6" />
          </div>
          <p className="text-sm text-gray-600 mb-2">
            Drag and drop your CSV files here
          </p>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => document.getElementById('csv-upload')?.click()}
          >
            Browse Files
          </Button>
          <input
            type="file"
            accept=".csv"
            multiple
            onChange={handleFileSelect}
            className="hidden"
            id="csv-upload"
          />
        </div>
      </Card>

      {/* Uploaded Files Selection */}
      {uploadedFiles.length > 0 && (
        <Card className="p-4">
          <h4 className="font-semibold text-gray-900 mb-4">Select Files to Classify</h4>
          <div className="space-y-2 mb-4">
            {uploadedFiles.map((file) => (
              <div
                key={file.name}
                className={`flex items-center space-x-3 p-2 rounded-lg cursor-pointer transition-colors ${
                  settings.selectedFiles.includes(file.name) 
                    ? 'bg-blue-50 border border-blue-200' 
                    : 'hover:bg-gray-50'
                }`}
                onClick={() => handleFileSelection(file.name)}
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                  settings.selectedFiles.includes(file.name)
                    ? 'bg-blue-500 border-blue-500'
                    : 'border-gray-300'
                }`}>
                  {settings.selectedFiles.includes(file.name) && (
                    <Check className="w-3 h-3 text-white" />
                  )}
                </div>
                <File className="w-4 h-4 text-gray-500" />
                <span className="text-sm font-medium">{file.name}</span>
              </div>
            ))}
          </div>
          
          <Button 
            className="w-full bg-blue-600 hover:bg-blue-700"
            onClick={handleClassifyColumns}
            disabled={settings.selectedFiles.length === 0}
          >
            Classify Columns
          </Button>
        </Card>
      )}

      {/* Classification Settings */}
      <Card className="p-4">
        <h4 className="font-semibold text-gray-900 mb-4">Classification Settings</h4>
        
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              checked={settings.autoClassify}
              onCheckedChange={(checked) => onSettingsChange({ autoClassify: checked })}
            />
            <Label className="text-sm">Auto-classify columns</Label>
          </div>
          
          <div>
            <Label className="text-sm mb-2 block">Classification Method</Label>
            <Select
              value={settings.classificationMethod}
              onValueChange={(value: 'dataType' | 'columnName') => 
                onSettingsChange({ classificationMethod: value })
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select classification method" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="dataType">Based on Data Type</SelectItem>
                <SelectItem value="columnName">Based on Column Name</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-500 mt-1">
              {settings.classificationMethod === 'dataType' 
                ? 'Classifies columns based on the data type of values'
                : 'Classifies columns based on common naming patterns'
              }
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default ColumnClassifierSettings;