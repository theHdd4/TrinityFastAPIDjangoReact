import React, { useEffect, useState } from 'react';
import { AlertCircle, Lightbulb, CheckCircle2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { VALIDATE_API, DATAFRAME_VALIDATION_API } from '@/lib/api';
import { StageLayout } from '../components/StageLayout';
import type { ReturnTypeFromUseGuidedUploadFlow, MissingValueStrategy } from '../useGuidedUploadFlow';

interface U6MissingValuesProps {
  flow: ReturnTypeFromUseGuidedUploadFlow;
  onNext: () => void;
  onBack: () => void;
}

interface ColumnMissingInfo {
  columnName: string;
  dataType: string;
  missingCount: number;
  missingPercent: number;
  totalCount: number;
  sampleMissingRows: any[][];
  strategy: MissingValueStrategy['strategy'];
  value?: string | number;
  ruleBasedInsight?: string;
}

const NUMERIC_STRATEGIES = [
  { value: 'fill_zero', label: 'Fill with 0' },
  { value: 'fill_mean', label: 'Fill with mean' },
  { value: 'fill_median', label: 'Fill with median' },
  { value: 'forward_fill', label: 'Forward-fill (if date exists)' },
  { value: 'leave_missing', label: 'Leave missing' },
  { value: 'drop_rows', label: 'Drop rows with missing values' },
];

const CATEGORICAL_STRATEGIES = [
  { value: 'replace_unknown', label: 'Replace with "Unknown"' },
  { value: 'leave_missing', label: 'Leave missing' },
  { value: 'drop_rows', label: 'Drop rows' },
];

export const U6MissingValues: React.FC<U6MissingValuesProps> = ({ flow, onNext }) => {
  const { state, setMissingValueStrategies } = flow;
  const { uploadedFiles, dataTypeSelections, missingValueStrategies } = state;
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [columns, setColumns] = useState<ColumnMissingInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const currentFile = uploadedFiles[currentFileIndex];
  const currentDataTypes = currentFile ? dataTypeSelections[currentFile.name] : [];

  useEffect(() => {
    const fetchMissingValues = async () => {
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

        // Fetch missing value analysis
        const res = await fetch(`${DATAFRAME_VALIDATION_API}/validate-dataframe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            file_path: currentFile.path,
            columns: currentDataTypes.map(dt => ({
              name: dt.columnName,
              values: [],
              dtype: dt.selectedType,
            })),
            missing_threshold: 0.1,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const columnInfos: ColumnMissingInfo[] = (data.columns || [])
            .map((col: any) => {
              const existingStrategy = missingValueStrategies[currentFile.name]?.find(
                s => s.columnName === col.name
              );
              const missingData = col.missing_values_rules || {};
              return {
                columnName: col.name,
                dataType: col.type_detection?.detected_type || 'text',
                missingCount: missingData.missing_count || 0,
                missingPercent: missingData.missing_percent || 0,
                totalCount: missingData.total_count || 0,
                sampleMissingRows: [],
                strategy: existingStrategy?.strategy || (missingData.missing_percent > 0 ? 'leave_missing' : 'leave_missing'),
                value: existingStrategy?.value,
                ruleBasedInsight: missingData.suggestions?.[0], // Rule-based suggestions from validator
              };
            })
            .filter((col: ColumnMissingInfo) => col.missingPercent > 0)
            .sort((a: ColumnMissingInfo, b: ColumnMissingInfo) => b.missingPercent - a.missingPercent);

          setColumns(columnInfos);
        } else {
          setColumns([]);
        }
      } catch (error) {
        console.error('Failed to fetch missing values:', error);
        setColumns([]);
      } finally {
        setLoading(false);
      }
    };

    void fetchMissingValues();
  }, [currentFile, currentDataTypes, missingValueStrategies]);

  const handleStrategyChange = (columnName: string, strategy: MissingValueStrategy['strategy']) => {
    setColumns(prev => prev.map(col =>
      col.columnName === columnName ? { ...col, strategy } : col
    ));
  };

  const handleSave = () => {
    if (currentFile) {
      const strategies: MissingValueStrategy[] = columns.map(col => ({
        columnName: col.columnName,
        strategy: col.strategy,
        value: col.value,
      }));
      setMissingValueStrategies(currentFile.name, strategies);
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
        title="How Should Trinity Handle Missing Values?"
        explanation="What Trinity needs: Analyzing missing values in your dataset..."
      >
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#458EE2]"></div>
          <p className="mt-4 text-sm text-gray-600">Analyzing missing values...</p>
        </div>
      </StageLayout>
    );
  }

  const strategies = (column: ColumnMissingInfo) => {
    const isNumeric = ['numeric', 'int64', 'float64'].includes(column.dataType.toLowerCase());
    return isNumeric ? NUMERIC_STRATEGIES : CATEGORICAL_STRATEGIES;
  };

  const hasRuleBasedInsights = columns.some(col => col.ruleBasedInsight);

  if (columns.length === 0) {
    return (
      <StageLayout
        title="How Should Trinity Handle Missing Values?"
        explanation={`What Trinity found: No missing values detected in your dataset! File ${currentFileIndex + 1} of ${uploadedFiles.length}: ${currentFile?.name}`}
      >
        <div className="text-center py-8">
          <CheckCircle2 className="w-12 h-12 text-[#41C185] mx-auto mb-2" />
          <p className="text-gray-700 font-medium">No missing values detected!</p>
          <p className="text-sm text-gray-600 mt-1">Your dataset is complete and ready to use.</p>
        </div>
      </StageLayout>
    );
  }

  return (
    <StageLayout
      title="How Should Trinity Handle Missing Values?"
      explanation={`What Trinity found: Missing values detected in some columns. Choose how to handle them. File ${currentFileIndex + 1} of ${uploadedFiles.length}: ${currentFile?.name}`}
      helpText="Select a strategy for each column with missing values. Different strategies work better for different data types."
      aiInsight={hasRuleBasedInsights ? "Rule-based suggestions are available based on column data types and patterns." : undefined}
    >
      {/* Single Key Action: Select Missing Value Strategy */}
      <div className="space-y-4 max-h-96 overflow-y-auto">
          {columns.map((column, index) => (
            <div
              key={index}
              className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium text-gray-900">{column.columnName}</span>
                    <Badge variant="outline" className="text-xs">
                      {column.dataType}
                    </Badge>
                    {column.ruleBasedInsight && (
                      <Badge className="bg-[#FFBD59] text-white text-xs flex items-center gap-1">
                        <Lightbulb className="w-3 h-3" />
                        Rule-Based Suggestion
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">
                        Missing: {column.missingCount.toLocaleString()} ({column.missingPercent.toFixed(1)}%)
                      </span>
                      <span className="text-gray-500">
                        Total: {column.totalCount.toLocaleString()}
                      </span>
                    </div>
                    <Progress value={column.missingPercent} className="h-2" />
                  </div>
                  <div className="mt-3">
                    <Select
                      value={column.strategy}
                      onValueChange={(value) => handleStrategyChange(column.columnName, value as MissingValueStrategy['strategy'])}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {strategies(column).map(strategy => (
                          <SelectItem key={strategy.value} value={strategy.value}>
                            {strategy.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {column.ruleBasedInsight && (
                    <div className="text-xs text-gray-600 mt-2 flex items-start gap-1">
                      <Lightbulb className="w-3 h-3 mt-0.5 flex-shrink-0" />
                      <span>{column.ruleBasedInsight}</span>
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

