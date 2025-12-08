import React, { useEffect, useState } from 'react';
import { AlertTriangle, Lightbulb, History } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { VALIDATE_API, DATAFRAME_VALIDATION_API } from '@/lib/api';
import { StageLayout } from '../components/StageLayout';
import type { ReturnTypeFromUseGuidedUploadFlow, DataTypeSelection } from '../useGuidedUploadFlow';

interface U5ReviewDataTypesProps {
  flow: ReturnTypeFromUseGuidedUploadFlow;
  onNext: () => void;
  onBack: () => void;
}

interface ColumnTypeInfo {
  columnName: string;
  detectedType: string;
  selectedType: string;
  sampleValues: string[];
  format?: string;
  warning?: string;
  ruleBasedInsight?: string;
  historicalType?: string;
}

const DATA_TYPES = [
  { value: 'numeric', label: 'Numeric' },
  { value: 'categorical', label: 'Categorical' },
  { value: 'text', label: 'Text' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Boolean' },
];

export const U5ReviewDataTypes: React.FC<U5ReviewDataTypesProps> = ({ flow, onNext }) => {
  const { state, setDataTypeSelections } = flow;
  const { uploadedFiles, columnNameEdits, dataTypeSelections } = state;
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [columns, setColumns] = useState<ColumnTypeInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const currentFile = uploadedFiles[currentFileIndex];
  const currentColumnEdits = currentFile ? columnNameEdits[currentFile.name] : [];

  useEffect(() => {
    const fetchDataTypes = async () => {
      if (!currentFile) return;

      setLoading(true);
      try {
        const envStr = localStorage.getItem('env');
        let query = '';
        if (envStr) {
          try {
            const env = JSON.parse(envStr);
            query = '?' + new URLSearchParams({
              object_name: currentFile.path,
              client_id: env.CLIENT_ID || '',
              app_id: env.APP_ID || '',
              project_id: env.PROJECT_ID || '',
            }).toString();
          } catch {
            query = `?object_name=${encodeURIComponent(currentFile.path)}`;
          }
        } else {
          query = `?object_name=${encodeURIComponent(currentFile.path)}`;
        }

        // Get column names (use edited names if available)
        const columnNames = currentColumnEdits.length > 0
          ? currentColumnEdits.map(e => e.editedName)
          : [];

        // Fetch data type detection
        const res = await fetch(`${DATAFRAME_VALIDATION_API}/validate-dataframe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            file_path: currentFile.path,
            columns: columnNames.map(name => ({
              name,
              values: [], // Will be fetched separately
              dtype: 'object', // Default
            })),
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const columnInfos: ColumnTypeInfo[] = (data.columns || []).map((col: any, idx: number) => {
            const existingSelection = dataTypeSelections[currentFile.name]?.find(
              s => s.columnName === col.name
            );
            return {
              columnName: col.name,
              detectedType: col.type_detection?.detected_type || 'text',
              selectedType: existingSelection?.selectedType || col.type_detection?.detected_type || 'text',
              sampleValues: col.sample_values || [],
              format: col.type_detection?.detected_format,
              warning: col.type_detection?.status === 'failed' ? col.type_detection?.errors?.[0] : undefined,
              ruleBasedInsight: col.type_detection?.suggestions?.[0], // Rule-based suggestions from validator
              historicalType: col.historical_type,
            };
          });
          setColumns(columnInfos);
        } else {
          // Fallback: create basic column info
          const columnInfos: ColumnTypeInfo[] = columnNames.map(name => ({
            columnName: name,
            detectedType: 'text',
            selectedType: 'text',
            sampleValues: [],
          }));
          setColumns(columnInfos);
        }
      } catch (error) {
        console.error('Failed to fetch data types:', error);
      } finally {
        setLoading(false);
      }
    };

    void fetchDataTypes();
  }, [currentFile, currentColumnEdits, dataTypeSelections]);

  const handleTypeChange = (columnName: string, newType: string) => {
    setColumns(prev => prev.map(col =>
      col.columnName === columnName ? { ...col, selectedType: newType } : col
    ));
  };

  const handleSave = () => {
    if (currentFile) {
      const selections: DataTypeSelection[] = columns.map(col => ({
        columnName: col.columnName,
        detectedType: col.detectedType,
        selectedType: col.selectedType,
        format: col.format,
      }));
      setDataTypeSelections(currentFile.name, selections);
    }
  };

  const handleNext = () => {
    handleSave();
    if (currentFileIndex < uploadedFiles.length - 1) {
      setCurrentFileIndex(currentFileIndex + 1);
    } else {
      onNext();
    }
  };

  if (loading) {
    return (
      <StageLayout
        title="Confirm Data Types"
        explanation="What Trinity needs: Detecting data types for each column..."
      >
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#458EE2]"></div>
          <p className="mt-4 text-sm text-gray-600">Detecting data types...</p>
        </div>
      </StageLayout>
    );
  }

  const hasWarnings = columns.some(col => col.warning);
  const hasRuleBasedInsights = columns.some(col => col.ruleBasedInsight);

  return (
    <StageLayout
      title="Confirm Data Types"
      explanation={`What Trinity found: Detected data types for each column. Review and confirm or change as needed. File ${currentFileIndex + 1} of ${uploadedFiles.length}: ${currentFile.name}`}
      helpText={hasWarnings ? "Some columns have type warnings. Review them carefully and adjust if needed." : undefined}
      aiInsight={hasRuleBasedInsights ? "Rule-based suggestions are available for columns that may need type conversion." : undefined}
    >

      {/* Single Key Action: Confirm or Change Data Types */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {columns.map((column, index) => (
          <div
            key={index}
            className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
          >
            <div className="flex items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium text-gray-900">{column.columnName}</span>
                  {column.warning && (
                    <Badge variant="destructive" className="flex items-center gap-1 text-xs">
                      <AlertTriangle className="w-3 h-3" />
                      Warning
                    </Badge>
                  )}
                  {column.ruleBasedInsight && (
                    <Badge className="bg-[#FFBD59] text-white text-xs flex items-center gap-1">
                      <Lightbulb className="w-3 h-3" />
                      Rule-Based Suggestion
                    </Badge>
                  )}
                  {column.historicalType && column.selectedType === column.historicalType && (
                    <Badge className="bg-[#41C185] text-white text-xs flex items-center gap-1">
                      <History className="w-3 h-3" />
                      Previously Used
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <Select
                    value={column.selectedType}
                    onValueChange={(value) => handleTypeChange(column.columnName, value)}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DATA_TYPES.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {column.selectedType === 'date' && column.format && (
                    <span className="text-xs text-gray-500">
                      Format: {column.format}
                    </span>
                  )}
                </div>
                {column.sampleValues.length > 0 && (
                  <div className="text-xs text-gray-500 mt-2">
                    Sample: {column.sampleValues.slice(0, 3).join(', ')}
                    {column.sampleValues.length > 3 && '...'}
                  </div>
                )}
                {column.warning && (
                  <div className="text-xs text-amber-600 mt-2 flex items-start gap-1">
                    <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span>{column.warning}</span>
                  </div>
                )}
                {column.ruleBasedInsight && (
                  <div className="text-xs text-gray-600 mt-2 flex items-start gap-1">
                    <Lightbulb className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span>{column.ruleBasedInsight}</span>
                  </div>
                )}
                {column.historicalType && (
                  <div className="text-xs text-gray-600 mt-2 flex items-start gap-1">
                    <History className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    <span>In previous uploads for this client, this column was treated as {column.historicalType}.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {uploadedFiles.length > 1 && (
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={() => {
              if (currentFileIndex > 0) {
                handleSave();
                setCurrentFileIndex(currentFileIndex - 1);
              }
            }}
            disabled={currentFileIndex === 0}
          >
            Previous File
          </Button>
          <span className="text-sm text-gray-600">
            {currentFileIndex + 1} / {uploadedFiles.length}
          </span>
          <Button
            variant="outline"
            onClick={handleNext}
            disabled={currentFileIndex === uploadedFiles.length - 1}
          >
            Next File
          </Button>
        </div>
      )}
    </StageLayout>
  );
};

