import React, { useEffect, useState, useRef } from 'react';
import { AlertTriangle, Lightbulb, History, RotateCcw, Eye } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { VALIDATE_API } from '@/lib/api';
import { StageLayout } from '../components/StageLayout';
import type { ReturnTypeFromUseGuidedUploadFlow, MissingValueStrategy } from '../useGuidedUploadFlow';

interface U5MissingValuesProps {
  flow: ReturnTypeFromUseGuidedUploadFlow;
  onNext: () => void;
  onBack: () => void;
}

interface ColumnMissingInfo {
  columnName: string;
  dataType: string;
  columnRole: 'identifier' | 'measure';
  missingCount: number;
  missingPercent: number;
  totalRows: number;
  sampleValues: (string | number)[];
  sampleMissingValues: (string | number)[];
  suggestedTreatment: MissingValueStrategy['strategy'];
  selectedTreatment: MissingValueStrategy['strategy'];
  customValue?: string | number;
  tag?: 'previously_used' | 'ai_suggestion' | 'edited_by_user';
  warning?: string;
  note?: string;
  historicalTreatment?: MissingValueStrategy['strategy'];
}

// Treatment options based on data type and role
// Matches backend strategies exactly: drop, mean, median, mode, zero, empty, custom, none
const getTreatmentOptions = (dataType: string, columnRole: 'identifier' | 'measure'): Array<{value: MissingValueStrategy['strategy'], label: string}> => {
  const isNumeric = dataType === 'number';
  const isCategory = dataType === 'category';
  const isDate = dataType === 'date';
  const isText = dataType === 'text';
  const isIdentifier = columnRole === 'identifier';

  if (isNumeric && !isIdentifier) {
    // Numeric Measures - backend supports: drop, mean, median, mode, zero, empty, custom
    return [
      { value: 'zero', label: 'Replace with 0' },
      { value: 'mean', label: 'Replace with mean' },
      { value: 'median', label: 'Replace with median' },
      { value: 'mode', label: 'Replace with mode' },
      { value: 'custom', label: 'Replace with custom value' },
      { value: 'drop', label: 'Drop rows with missing values' },
      { value: 'none', label: 'Leave missing' },
    ];
  } else if (isCategory || (isText && isIdentifier)) {
    // Categorical/Text Identifiers - backend supports: mode, empty, custom, drop
    return [
      { value: 'mode', label: 'Replace with most frequent value' },
      { value: 'empty', label: 'Replace with empty string' },
      { value: 'custom', label: 'Replace with "Unknown"' },
      { value: 'drop', label: 'Drop rows' },
      { value: 'none', label: 'Leave missing' },
    ];
  } else if (isDate) {
    // Dates - backend supports: mode, custom, drop
    return [
      { value: 'mode', label: 'Replace with most frequent date' },
      { value: 'custom', label: 'Replace with custom date' },
      { value: 'drop', label: 'Drop rows' },
      { value: 'none', label: 'Leave missing' },
    ];
  } else if (isText && !isIdentifier) {
    // Text Measures - backend supports: empty, custom, drop
    return [
      { value: 'empty', label: 'Replace with empty string' },
      { value: 'custom', label: 'Replace with "Not provided"' },
      { value: 'drop', label: 'Drop rows' },
      { value: 'none', label: 'Leave missing' },
    ];
  } else {
    // Default (shouldn't happen, but fallback)
    return [
      { value: 'none', label: 'Leave missing' },
    ];
  }
};

// Note: All missing value treatment logic is handled by the backend
// The backend function _apply_missing_strategy() in routes.py handles all strategies:
// - drop: removes rows with missing values
// - mean: fills with mean (only for numeric columns)
// - median: fills with median (only for numeric columns)
// - mode: fills with mode (first mode value, or empty string if no mode)
// - zero: fills with 0
// - empty: fills with empty string ""
// - custom: fills with custom value (converts to numeric if column is numeric, otherwise uses as string)
// - none: no treatment (leave missing)
// 
// Frontend only collects user preferences and sends them to backend via /apply-data-transformations

// Get warning color for missing percentage
function getMissingColor(missingPercent: number): string {
  if (missingPercent <= 5) return 'bg-[#41C185]'; // Green
  if (missingPercent <= 20) return 'bg-[#FFBD59]'; // Yellow
  return 'bg-red-500'; // Red
}

export const U5MissingValues: React.FC<U5MissingValuesProps> = ({ flow, onNext, onBack }) => {
  const { state, setMissingValueStrategies } = flow;
  const { uploadedFiles, dataTypeSelections, missingValueStrategies } = state;
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [columns, setColumns] = useState<ColumnMissingInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const loadedFileRef = useRef<string | null>(null);
  const isFetchingRef = useRef(false);

  const currentFile = uploadedFiles[currentFileIndex];
  const currentDataTypes = currentFile ? (dataTypeSelections[currentFile.name] || []) : [];

  useEffect(() => {
    const fetchMissingValues = async () => {
      if (!currentFile) return;

      // Prevent duplicate fetches
      const fileKey = `${currentFile.name}-${currentFile.path}`;
      if (loadedFileRef.current === fileKey || isFetchingRef.current) {
        return;
      }

      isFetchingRef.current = true;
      setLoading(true);
      setError('');
      try {
        const envStr = localStorage.getItem('env');
        let env: any = {};
        if (envStr) {
          try {
            env = JSON.parse(envStr);
          } catch {
            // Ignore parse errors
          }
        }

        const filePath = currentFile.path;

        // Fetch file metadata (includes missing values)
        const metadataRes = await fetch(`${VALIDATE_API}/file-metadata`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            file_path: filePath,
            client_id: env.CLIENT_ID || '',
            app_id: env.APP_ID || '',
            project_id: env.PROJECT_ID || '',
          }),
        });

        if (!metadataRes.ok) {
          throw new Error('Failed to fetch file metadata');
        }

        const metadataData = await metadataRes.json();
        
        if (!metadataData || !Array.isArray(metadataData.columns)) {
          throw new Error('Invalid response from server: columns array not found');
        }

        const existingStrategies = missingValueStrategies[currentFile.name] || [];

        // Build column info from metadata and data type selections
        const columnInfos: ColumnMissingInfo[] = metadataData.columns
          .map((col: any) => {
            const dataTypeSelection = currentDataTypes.find(dt => dt.columnName === col.name);
            const existingStrategy = existingStrategies.find(s => s.columnName === col.name);
            
            const dataType = dataTypeSelection?.selectedType || 'text';
            const columnRole = dataTypeSelection?.columnRole || 'identifier';
            const missingPercent = col.missing_percentage || 0;
            
            // Default treatment: suggest based on data type and role, or use existing strategy
            // Backend handles all actual treatment logic via _apply_missing_strategy() in routes.py
            // The backend function supports: drop, mean, median, mode, zero, empty, custom, none
            // User selects treatment from dropdown, backend applies it via /apply-data-transformations
            let suggestedTreatment: MissingValueStrategy['strategy'] = existingStrategy?.strategy || 'none';
            
            // If no existing strategy, suggest based on data type, role, and missing percentage
            if (!existingStrategy) {
              const isNumeric = dataType === 'number';
              const isCategory = dataType === 'category';
              const isText = dataType === 'text';
              const isDate = dataType === 'date';
              const isIdentifier = columnRole === 'identifier';
              
              // High missingness (>40%) - suggest drop
              if (missingPercent > 40) {
                suggestedTreatment = 'drop';
              } else if (isNumeric && !isIdentifier) {
                // Numeric measures
                if (missingPercent <= 5) {
                  suggestedTreatment = 'zero';
                } else if (missingPercent <= 20) {
                  suggestedTreatment = 'mean';
                } else {
                  suggestedTreatment = 'median';
                }
              } else if ((isCategory || isText) && isIdentifier) {
                // Categorical/Text identifiers
                if (missingPercent <= 10) {
                  suggestedTreatment = 'mode';
                } else {
                  suggestedTreatment = 'custom';
                }
              } else if (isDate) {
                suggestedTreatment = 'mode';
              } else if (isText && !isIdentifier) {
                suggestedTreatment = 'empty';
              }
            }

            // Determine tag based on existing strategy or AI suggestion
            let tag: 'previously_used' | 'ai_suggestion' | 'edited_by_user' | undefined;
            if (existingStrategy) {
              tag = 'previously_used';
            } else if (suggestedTreatment !== 'none') {
              // AI suggested a treatment
              tag = 'ai_suggestion';
            } else {
              // No suggestion - user needs to select manually
              tag = undefined;
            }
            
            // Set default selected treatment to suggested if no existing strategy
            const selectedTreatment = existingStrategy?.strategy || suggestedTreatment;

            // Generate warnings and notes
            let warning: string | undefined;
            let note: string | undefined;

            if (missingPercent > 40) {
              warning = 'A large portion of this column is missing. This may affect insights.';
            } else if (columnRole === 'identifier' && missingPercent > 0) {
              warning = 'Identifiers rarely contain missing values. Please confirm your choice.';
            }

            // Check for placeholder-like values in sample values
            const sampleStr = col.sample_values?.map((v: any) => String(v).toLowerCase()).join(' ') || '';
            const placeholderPatterns = ['na', 'n/a', '?', 'none', 'missing', 'not available', '--', '-'];
            if (placeholderPatterns.some(pattern => sampleStr.includes(pattern))) {
              note = 'Some values look like placeholders (e.g., "NA", "?", "-"). Should they be considered missing?';
            }

            // Set default custom value from existing strategy if available
            // Backend will handle conversion based on column dtype
            let defaultCustomValue: string | number | undefined = existingStrategy?.value;

            return {
              columnName: col.name,
              dataType,
              columnRole,
              missingCount: col.missing_count || 0,
              missingPercent,
              totalRows: metadataData.total_rows || 0,
              sampleValues: col.sample_values || [],
              sampleMissingValues: [], // Would need additional API call to get actual missing value examples
              suggestedTreatment,
              selectedTreatment,
              customValue: defaultCustomValue || (suggestedTreatment === 'custom' && selectedTreatment === 'custom' 
                ? (columnRole === 'identifier' && (dataType === 'category' || dataType === 'text') ? 'Unknown' : '')
                : defaultCustomValue),
              tag,
              warning,
              note,
              historicalTreatment: existingStrategy?.strategy as MissingValueStrategy['strategy'] | undefined,
            };
          })
          .filter((col: ColumnMissingInfo) => col.missingPercent > 0) // Only show columns with missing values
          .sort((a: ColumnMissingInfo, b: ColumnMissingInfo) => b.missingPercent - a.missingPercent);

        setColumns(columnInfos);
        loadedFileRef.current = fileKey;
      } catch (err: any) {
        console.error('Failed to fetch missing values:', err);
        setError(err.message || 'Failed to load missing value information');
      } finally {
        setLoading(false);
        isFetchingRef.current = false;
      }
    };

    void fetchMissingValues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFile?.name, currentFile?.path, currentDataTypes.length]);

  const handleTreatmentChange = (columnName: string, treatment: MissingValueStrategy['strategy']) => {
    setColumns(prev => prev.map(col => {
      if (col.columnName === columnName) {
        // Set default custom value when switching to custom strategy
        let customValue = col.customValue;
        if (treatment === 'custom' && !customValue) {
          if (col.columnRole === 'identifier' && (col.dataType === 'category' || col.dataType === 'text')) {
            customValue = 'Unknown';
          } else if (col.dataType === 'text' && col.columnRole === 'measure') {
            customValue = 'Not provided';
          } else {
            customValue = '';
          }
        }
        return { 
          ...col, 
          selectedTreatment: treatment, 
          customValue,
          tag: 'edited_by_user' as const 
        };
      }
      return col;
    }));
    
    // Auto-save when treatment changes
    setTimeout(() => {
      handleSave();
    }, 100);
  };

  const handleCustomValueChange = (columnName: string, value: string) => {
    setColumns(prev => prev.map(col =>
      col.columnName === columnName 
        ? { ...col, customValue: value, tag: 'edited_by_user' as const }
        : col
    ));
    
    // Auto-save when custom value changes
    setTimeout(() => {
      handleSave();
    }, 300); // Debounce a bit for custom value input
  };

  const handleReset = (columnName: string) => {
    setColumns(prev => prev.map(col => {
      if (col.columnName === columnName) {
        // Reset to 'none' (no treatment) - backend will handle if user selects a treatment
        return {
          ...col,
          selectedTreatment: 'none' as const,
          customValue: undefined,
          tag: col.historicalTreatment ? 'previously_used' as const : undefined,
        };
      }
      return col;
    }));
    
    // Auto-save after reset
    setTimeout(() => {
      handleSave();
    }, 100);
  };

  // Bulk actions - using backend strategy names
  const handleApplyAllNumeric = () => {
    setColumns(prev => prev.map(col => {
      if (col.dataType === 'number' && col.columnRole === 'measure') {
        return { ...col, selectedTreatment: 'mean' as const, tag: 'edited_by_user' as const };
      }
      return col;
    }));
    // Auto-save after bulk action
    setTimeout(() => {
      handleSave();
    }, 100);
  };

  const handleApplyAllCategorical = () => {
    setColumns(prev => prev.map(col => {
      if ((col.dataType === 'category' || col.dataType === 'text') && col.columnRole === 'identifier') {
        return { 
          ...col, 
          selectedTreatment: 'custom' as const, 
          customValue: 'Unknown',
          tag: 'edited_by_user' as const 
        };
      }
      return col;
    }));
    // Auto-save after bulk action
    setTimeout(() => {
      handleSave();
    }, 100);
  };

  const handleApplyClientMemory = () => {
    setColumns(prev => prev.map(col => {
      if (col.historicalTreatment) {
        return { ...col, selectedTreatment: col.historicalTreatment, tag: 'previously_used' as const };
      }
      return col;
    }));
    // Auto-save after bulk action
    setTimeout(() => {
      handleSave();
    }, 100);
  };

  // AI suggestion logic: suggests treatments based on data type, role, and missing percentage
  const suggestTreatment = (col: ColumnMissingInfo): MissingValueStrategy['strategy'] => {
    const { dataType, columnRole, missingPercent } = col;
    const isNumeric = dataType === 'number';
    const isCategory = dataType === 'category';
    const isText = dataType === 'text';
    const isDate = dataType === 'date';
    const isIdentifier = columnRole === 'identifier';

    // High missingness (>40%) - suggest drop for most cases
    if (missingPercent > 40) {
      return 'drop';
    }

    // Numeric measures - suggest mean for low missingness, zero for very low
    if (isNumeric && !isIdentifier) {
      if (missingPercent <= 5) {
        return 'zero';
      } else if (missingPercent <= 20) {
        return 'mean';
      } else {
        return 'median';
      }
    }

    // Categorical/Text identifiers - suggest mode or custom "Unknown"
    if ((isCategory || isText) && isIdentifier) {
      if (missingPercent <= 10) {
        return 'mode';
      } else {
        return 'custom'; // Will use "Unknown" as default
      }
    }

    // Dates - suggest mode
    if (isDate) {
      return 'mode';
    }

    // Text measures - suggest empty string
    if (isText && !isIdentifier) {
      return 'empty';
    }

    // Default: leave missing
    return 'none';
  };

  const handleApplyAISuggestions = () => {
    setColumns(prev => prev.map(col => {
      const suggested = suggestTreatment(col);
      let customValue = col.customValue;
      
      // Set default custom value if suggested treatment is 'custom'
      if (suggested === 'custom') {
        if (col.columnRole === 'identifier' && (col.dataType === 'category' || col.dataType === 'text')) {
          customValue = 'Unknown';
        } else if (col.dataType === 'text' && col.columnRole === 'measure') {
          customValue = 'Not provided';
        } else {
          customValue = '';
        }
      }
      
      return {
        ...col,
        selectedTreatment: suggested,
        customValue,
        tag: 'ai_suggestion' as const,
      };
    }));
    
    // Auto-save after applying AI suggestions
    setTimeout(() => {
      handleSave();
    }, 100);
  };

  const handleSave = () => {
    if (currentFile) {
      // Build strategies matching backend format exactly
      // Backend expects: { column_name: { strategy: str, value?: str | number } }
      const strategies: MissingValueStrategy[] = columns.map(col => {
        // For 'none' strategy, don't include it in strategies (backend treats it as no strategy)
        if (col.selectedTreatment === 'none') {
          return null;
        }
        
        // For custom strategy, ensure value is set appropriately
        // Backend logic: custom_value is required for 'custom' strategy
        if (col.selectedTreatment === 'custom') {
          let value: string | number = col.customValue || '';
          
          // Set default values based on column type/role if not already set (matching backend expectations)
          if (!col.customValue) {
            if (col.columnRole === 'identifier' && (col.dataType === 'category' || col.dataType === 'text')) {
              value = 'Unknown';
            } else if (col.dataType === 'text' && col.columnRole === 'measure') {
              value = 'Not provided';
            } else if (col.dataType === 'number') {
              // For numeric columns, backend will convert custom_value to numeric
              // Default to 0 for numeric custom values
              value = 0;
            } else {
              value = ''; // Default empty string
            }
          }
          
          return {
            columnName: col.columnName,
            strategy: 'custom',
            value: value, // Backend expects value for custom strategy
          };
        }
        
        // For non-custom strategies, don't include value (backend doesn't need it)
        // Backend logic:
        // - drop: removes rows with missing values
        // - mean: fills with mean (only for numeric columns)
        // - median: fills with median (only for numeric columns)
        // - mode: fills with mode (first mode value, or empty string if no mode)
        // - zero: fills with 0
        // - empty: fills with empty string ""
        return {
          columnName: col.columnName,
          strategy: col.selectedTreatment,
          // Don't include value for non-custom strategies
        };
      }).filter((s): s is MissingValueStrategy => s !== null);
      
      setMissingValueStrategies(currentFile.name, strategies);
    }
  };

  const handleNext = () => {
    handleSave();
    if (currentFileIndex < uploadedFiles.length - 1) {
      loadedFileRef.current = null;
      setCurrentFileIndex(currentFileIndex + 1);
    } else {
      onNext();
    }
  };

  if (loading) {
    return (
      <StageLayout
        title="Step 6: Review Missing Values"
        explanation="Analyzing missing values in your dataset..."
      >
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#458EE2]"></div>
          <p className="mt-4 text-sm text-gray-600">Analyzing missing values...</p>
        </div>
      </StageLayout>
    );
  }

  if (error) {
    return (
      <StageLayout
        title="Step 6: Review Missing Values"
        explanation="Error loading missing value information"
      >
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      </StageLayout>
    );
  }

  if (columns.length === 0) {
    return (
      <StageLayout
        title="Step 6: Review Missing Values"
        explanation="These are the missing values across your dataset. Most treatments are suggested automatically, but you can adjust anything if needed."
        helpText="Correctly handling missing data ensures smooth analysis and calculations."
      >
        <div className="text-center py-8">
          <div className="inline-block p-4 bg-green-50 rounded-full mb-4">
            <AlertTriangle className="w-8 h-8 text-[#41C185]" />
          </div>
          <p className="text-gray-700 font-medium">No missing values detected!</p>
          <p className="text-sm text-gray-600 mt-1">Your dataset is complete and ready to use.</p>
        </div>
      </StageLayout>
    );
  }

  const hasNumericMeasures = columns.some(col => col.dataType === 'number' && col.columnRole === 'measure');
  const hasCategoricalIdentifiers = columns.some(col => (col.dataType === 'category' || col.dataType === 'text') && col.columnRole === 'identifier');
  const hasClientMemory = columns.some(col => col.historicalTreatment);
  const hasWarnings = columns.some(col => col.warning);
  const hasColumns = columns.length > 0;

  return (
    <StageLayout
      title="Step 6: Review Missing Values"
      explanation="These are the missing values across your dataset. Most treatments are suggested automatically, but you can adjust anything if needed."
      helpText="Correctly handling missing data ensures smooth analysis and calculations."
    >
      <div className="space-y-6">
        {/* Bulk Actions */}
        {hasColumns && (
          <div className="flex flex-wrap gap-2 pb-4 border-b">
            <Button
              variant="outline"
              size="sm"
              onClick={handleApplyAISuggestions}
              className="flex items-center gap-2"
            >
              <Lightbulb className="w-4 h-4" />
              Apply AI Suggestions
            </Button>
            {hasNumericMeasures && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleApplyAllNumeric}
                className="flex items-center gap-2"
              >
                Apply Same Treatment to All Numeric Columns
              </Button>
            )}
            {hasCategoricalIdentifiers && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleApplyAllCategorical}
                className="flex items-center gap-2"
              >
                Apply Same Treatment to All Categorical Columns
              </Button>
            )}
            {hasClientMemory && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleApplyClientMemory}
                className="flex items-center gap-2"
              >
                <History className="w-4 h-4" />
                Apply Client Memory Recommendations
              </Button>
            )}
          </div>
        )}

        {/* Warnings */}
        {hasWarnings && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-yellow-900 mb-2">Some columns may need attention</p>
                <div className="space-y-1">
                  {columns.filter(col => col.warning).map((col, idx) => (
                    <p key={idx} className="text-xs text-yellow-800">
                      <strong>{col.columnName}:</strong> {col.warning}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Column Table */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Column Name</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Missing Count (%)</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Sample Values</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Suggested Treatment</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Tags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {columns.map((column, index) => {
                  const treatmentOptions = getTreatmentOptions(column.dataType, column.columnRole);
                  const barColor = getMissingColor(column.missingPercent);
                  
                  return (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <span className="font-medium text-gray-900">{column.columnName}</span>
                        {column.warning && (
                          <div className="mt-1">
                            <Badge variant="outline" className="text-yellow-700 border-yellow-300 text-xs">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              Warning
                            </Badge>
                          </div>
                        )}
                        {column.note && (
                          <p className="text-xs text-gray-500 mt-1">{column.note}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-600">
                              {column.missingCount.toLocaleString()} ({column.missingPercent.toFixed(1)}%)
                            </span>
                            <span className="text-gray-500">
                              of {column.totalRows.toLocaleString()} rows
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${barColor}`}
                              style={{ width: `${Math.min(column.missingPercent, 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-xs text-gray-600 max-w-xs">
                          {column.sampleValues.slice(0, 3).map((val, idx) => (
                            <div key={idx} className="truncate">
                              {String(val).length > 30 ? String(val).substring(0, 30) + '...' : String(val)}
                            </div>
                          ))}
                          {column.sampleValues.length === 0 && (
                            <span className="text-gray-400">No samples</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-2">
                          <Select
                            value={column.selectedTreatment}
                            onValueChange={(value) => handleTreatmentChange(column.columnName, value as MissingValueStrategy['strategy'])}
                          >
                            <SelectTrigger className="w-48">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {treatmentOptions.map(option => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {column.selectedTreatment === 'custom' && (
                            <Input
                              type="text"
                              value={column.customValue || ''}
                              onChange={(e) => handleCustomValueChange(column.columnName, e.target.value)}
                              placeholder={column.columnRole === 'identifier' ? 'e.g., Unknown' : 'e.g., Not provided'}
                              className="w-48 text-xs"
                            />
                          )}
                          {column.selectedTreatment !== 'none' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleReset(column.columnName)}
                              className="h-6 text-xs"
                            >
                              <RotateCcw className="w-3 h-3 mr-1" />
                              Reset to None
                            </Button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {column.tag === 'previously_used' && (
                            <Badge className="bg-[#41C185] text-white text-xs">
                              <History className="w-3 h-3 mr-1" />
                              Previously Used
                            </Badge>
                          )}
                          {column.tag === 'ai_suggestion' && (
                            <Badge className="bg-[#FFBD59] text-white text-xs">
                              <Lightbulb className="w-3 h-3 mr-1" />
                              AI Suggestion
                            </Badge>
                          )}
                          {column.tag === 'edited_by_user' && (
                            <Badge className="bg-[#458EE2] text-white text-xs">
                              <RotateCcw className="w-3 h-3 mr-1" />
                              Edited
                            </Badge>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-gray-700">
            Select a treatment strategy for each column with missing values. The backend will apply your selections using robust logic that handles data type conversions and edge cases automatically.
          </p>
        </div>

        {/* File Navigation */}
        {uploadedFiles.length > 1 && (
          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                if (currentFileIndex > 0) {
                  handleSave();
                  loadedFileRef.current = null;
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
      </div>
    </StageLayout>
  );
};

