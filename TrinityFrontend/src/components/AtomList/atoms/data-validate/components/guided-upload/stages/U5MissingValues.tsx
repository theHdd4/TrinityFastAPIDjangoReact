import React, { useEffect, useState, useRef } from 'react';
import { AlertTriangle, Lightbulb, History, RotateCcw, Eye } from 'lucide-react';
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
  displayType?: string;
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

// Map backend/step-4 dtypes to missing-value buckets
const mapDataTypeForMissing = (rawType?: string, role?: 'identifier' | 'measure'): 'number' | 'category' | 'text' | 'date' => {
  const t = (rawType || '').toLowerCase();
  // Numeric
  if (['int', 'float', 'numeric', 'number'].some(k => t.includes(k))) return 'number';
  // Dates
  if (t === 'date' || t === 'datetime') return 'date';
  // Boolean behaves like categorical
  if (t.includes('bool')) return 'category';
  // Strings: identifiers -> category; measures -> text
  if (t.includes('string') || t.includes('object') || t.includes('category') || t.includes('str')) {
    return role === 'measure' ? 'text' : 'category';
  }
  return 'text';
};

// Fallback role inference when Step 4 role is missing
const inferRoleFromType = (rawType?: string): 'identifier' | 'measure' => {
  const t = (rawType || '').toLowerCase();
  if (['int', 'float', 'numeric', 'number'].some(k => t.includes(k))) return 'measure';
  return 'identifier';
};

// Treatment options based on data type and role (aligned to backend-supported strategies)
// Backend strategies supported: drop, mean, median, mode, zero, empty, custom, ffill, bfill, none
const getTreatmentOptions = (dataType: string, columnRole: 'identifier' | 'measure'): Array<{value: MissingValueStrategy['strategy'], label: string}> => {
  const isNumeric = dataType === 'number';
  const isCategory = dataType === 'category';
  const isDate = dataType === 'date';
  const isText = dataType === 'text';
  const isIdentifier = columnRole === 'identifier';

  if (isNumeric && !isIdentifier) {
    // Numeric (Measures)
    return [
      { value: 'zero', label: 'Replace with 0' },
      { value: 'mean', label: 'Replace with mean' },
      { value: 'median', label: 'Replace with median' },
      { value: 'ffill', label: 'Forward fill' },
      { value: 'bfill', label: 'Backward fill' },
      { value: 'drop', label: 'Drop rows with missing' },
      { value: 'none', label: 'Leave missing' },
    ];
  }

  if (isNumeric && isIdentifier) {
    // Numeric Identifiers
    return [
      { value: 'custom', label: 'Replace with "Unknown"' },
      { value: 'mode', label: 'Replace with highest-frequency value' },
      { value: 'drop', label: 'Drop rows with missing' },
      { value: 'none', label: 'Leave missing' },
    ];
  }

  if ((isCategory || isText) && isIdentifier) {
    // Category/Text (Identifiers)
    return [
      { value: 'custom', label: 'Replace with "Unknown"' },
      { value: 'mode', label: 'Replace with highest-frequency category' },
      { value: 'drop', label: 'Drop rows with missing' },
      { value: 'none', label: 'Leave missing' },
    ];
  }

  if (isDate) {
    // Dates
    return [
      { value: 'ffill', label: 'Forward fill date' },
      { value: 'bfill', label: 'Backward fill' },
      { value: 'drop', label: 'Drop rows with missing' },
      { value: 'none', label: 'Leave missing' },
    ];
  }

  if (isText && !isIdentifier) {
    // Text (Measures)
    return [
      { value: 'custom', label: 'Replace with "Not provided"' },
      { value: 'empty', label: 'Replace with empty string' },
      { value: 'drop', label: 'Drop rows with missing' },
      { value: 'none', label: 'Leave missing' },
    ];
  }

  // Default fallback
  return [
    { value: 'drop', label: 'Drop rows with missing' },
    { value: 'none', label: 'Leave missing' },
  ];
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
// - ffill: forward fill
// - bfill: backward fill
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
  const { uploadedFiles, dataTypeSelections, missingValueStrategies, selectedFileIndex, columnNameEdits } = state;
  const chosenIndex = selectedFileIndex !== undefined && selectedFileIndex < uploadedFiles.length ? selectedFileIndex : 0;
  const [columns, setColumns] = useState<ColumnMissingInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const loadedFileRef = useRef<string | null>(null);
  const isFetchingRef = useRef(false);
  const columnsRef = useRef<ColumnMissingInfo[]>([]);

  const currentFile = uploadedFiles[chosenIndex];
  const currentDataTypes = currentFile ? (dataTypeSelections[currentFile.name] || []) : [];
  const currentColumnEdits = currentFile ? (columnNameEdits[currentFile.name] || []) : [];

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

        // Build maps for edited column names (from U3)
        const originalToEditedMap = new Map<string, string>();
        const editedToOriginalMap = new Map<string, string>();
        if (Array.isArray(currentColumnEdits)) {
          currentColumnEdits.forEach(edit => {
            if (edit.keep !== false) {
              originalToEditedMap.set(edit.originalName, edit.editedName);
              editedToOriginalMap.set(edit.editedName, edit.originalName);
            }
          });
        }

        // Build column info from metadata and data type selections
        const columnInfos: ColumnMissingInfo[] = metadataData.columns
          .map((col: any) => {
            const editedName = originalToEditedMap.get(col.name) || col.name;

            // Skip columns that were deleted in U3
            const editEntry = currentColumnEdits.find(e => e.originalName === col.name);
            if (editEntry?.keep === false) {
              return null;
            }

            const dataTypeSelection = currentDataTypes.find(dt => dt.columnName === editedName);
            const existingStrategy = existingStrategies.find(s => s.columnName === editedName);
            
            const selectionType =
              dataTypeSelection?.updateType
              || dataTypeSelection?.selectedType
              || dataTypeSelection?.detectedType
              || col.dtype
              || 'string';
            const columnRole = dataTypeSelection?.columnRole || inferRoleFromType(selectionType);
            const dataType = mapDataTypeForMissing(selectionType, columnRole);
            const displayType = selectionType || 'string';
            const missingPercent = col.missing_percentage || 0;
            
            // Default treatment: suggest based on data type and role, or use existing strategy
            // Backend handles all actual treatment logic via _apply_missing_strategy() in routes.py
            // The backend function supports: drop, mean, median, mode, zero, empty, custom, none
            // User selects treatment from dropdown, backend applies it via /apply-data-transformations
            const suggestedTreatment: MissingValueStrategy['strategy'] = existingStrategy?.strategy
              || suggestTreatment({
                columnName: col.name,
                dataType,
                columnRole,
                missingPercent,
                missingCount: col.missing_count || 0,
                totalRows: metadataData.total_rows || 0,
                sampleValues: col.sample_values || [],
                sampleMissingValues: [],
                suggestedTreatment: 'none',
                selectedTreatment: 'none',
              } as ColumnMissingInfo);

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
              columnName: editedName,
              displayType,
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
          .filter((col: ColumnMissingInfo | null): col is ColumnMissingInfo => col !== null && col.missingPercent > 0) // Only show columns with missing values
          .sort((a: ColumnMissingInfo, b: ColumnMissingInfo) => (b?.missingPercent || 0) - (a?.missingPercent || 0));

        setColumns(columnInfos);
        columnsRef.current = columnInfos;
        
        // 🔥 AUTO-SAVE: Save initial suggested treatments immediately so they're available even if user doesn't interact
        if (currentFile && columnInfos.length > 0) {
          const initialStrategies: MissingValueStrategy[] = columnInfos
            .map(col => {
              if (col.selectedTreatment === 'none') {
                return null;
              }

              if (col.selectedTreatment === 'custom') {
                let value: string | number = col.customValue ?? '';

                if (!col.customValue) {
                  if (col.columnRole === 'identifier') {
                    value = 'Unknown';
                  } else if (col.dataType === 'text' && col.columnRole === 'measure') {
                    value = 'Not provided';
                  } else if (col.dataType === 'number') {
                    value = 0;
                  } else {
                    value = '';
                  }
                }

                if (col.dataType === 'number' && value !== undefined && value !== null) {
                  const numericValue = typeof value === 'string' ? Number(value) : value;
                  if (!Number.isNaN(Number(numericValue))) {
                    value = numericValue as number;
                  }
                }

                return {
                  columnName: col.columnName,
                  strategy: 'custom',
                  value,
                };
              }

              return {
                columnName: col.columnName,
                strategy: col.selectedTreatment,
              };
            })
            .filter((s): s is MissingValueStrategy => s !== null);

          console.log('🔥 U5 AUTO-SAVE: Saving initial suggested treatments on load:', {
            fileName: currentFile.name,
            strategies: initialStrategies
          });

          setMissingValueStrategies(currentFile.name, initialStrategies);
        }
        
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

  const updateColumns = (
    updater: (prev: ColumnMissingInfo[]) => ColumnMissingInfo[],
    autoSave: boolean = true,
  ) => {
    let nextColumns: ColumnMissingInfo[] = [];
    setColumns(prev => {
      nextColumns = updater(prev);
      return nextColumns;
    });
    columnsRef.current = nextColumns;
    if (autoSave) {
      handleSave(nextColumns);
    }
  };

  const handleTreatmentChange = (columnName: string, treatment: MissingValueStrategy['strategy']) => {
    console.log('🔧 U5 handleTreatmentChange called:', { columnName, treatment });
    updateColumns(prev =>
      prev.map(col => {
        if (col.columnName === columnName) {
          let customValue = col.customValue;
          if (treatment === 'custom' && !customValue) {
            if (col.columnRole === 'identifier') {
              customValue = 'Unknown';
            } else if (col.dataType === 'text' && col.columnRole === 'measure') {
              customValue = 'Not provided';
            } else {
              customValue = '';
            }
          }
          const updatedCol = {
            ...col,
            selectedTreatment: treatment,
            customValue,
            tag: 'edited_by_user' as const,
          };
          console.log('🔧 U5 Updated column:', updatedCol);
          return updatedCol;
        }
        return col;
      }),
    );
  };

  const handleCustomValueChange = (columnName: string, value: string) => {
    updateColumns(prev =>
      prev.map(col =>
        col.columnName === columnName
          ? { ...col, customValue: value, tag: 'edited_by_user' as const }
          : col,
      ),
    );
  };

  const handleReset = (columnName: string) => {
    updateColumns(prev =>
      prev.map(col => {
        if (col.columnName === columnName) {
          return {
            ...col,
            selectedTreatment: 'none' as const,
            customValue: undefined,
            tag: col.historicalTreatment ? ('previously_used' as const) : undefined,
          };
        }
        return col;
      }),
    );
  };

  // Bulk actions - using backend strategy names
  const handleApplyAllNumeric = () => {
    updateColumns(prev =>
      prev.map(col => {
        if (col.dataType === 'number' && col.columnRole === 'measure') {
          return { ...col, selectedTreatment: 'mean' as const, tag: 'edited_by_user' as const };
        }
        return col;
      }),
    );
  };

  const handleApplyAllCategorical = () => {
    updateColumns(prev =>
      prev.map(col => {
        if ((col.dataType === 'category' || col.dataType === 'text') && col.columnRole === 'identifier') {
          return {
            ...col,
            selectedTreatment: 'custom' as const,
            customValue: 'Unknown',
            tag: 'edited_by_user' as const,
          };
        }
        return col;
      }),
    );
  };

  const handleApplyClientMemory = () => {
    updateColumns(prev =>
      prev.map(col => {
        if (col.historicalTreatment) {
          return { ...col, selectedTreatment: col.historicalTreatment, tag: 'previously_used' as const };
        }
        return col;
      }),
    );
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

    // Numeric measures
    if (isNumeric && !isIdentifier) {
      if (missingPercent <= 5) return 'zero';
      if (missingPercent <= 20) return 'mean';
      return 'median';
    }

    // Category/Text identifiers
    if ((isCategory || isText) && isIdentifier) {
      if (missingPercent <= 10) return 'mode'; // highest-frequency
      return 'custom'; // Unknown
    }

    // Numeric identifiers
    if (isNumeric && isIdentifier) {
      if (missingPercent <= 10) return 'mode';
      return 'custom';
    }

    // Dates
    if (isDate) {
      return 'ffill';
    }

    // Text measures
    if (isText && !isIdentifier) {
      return 'custom'; // Not provided
    }

    // Default: leave missing
    return 'none';
  };

  const handleApplyAISuggestions = () => {
    updateColumns(prev =>
      prev.map(col => {
        const suggested = suggestTreatment(col);
        let customValue = col.customValue;

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
      }),
    );
  };

  function handleSave(nextColumns?: ColumnMissingInfo[]) {
    if (!currentFile) {
      console.log('❌ U5 handleSave: No currentFile, skipping save');
      return;
    }

    const colsToUse = nextColumns ?? columnsRef.current ?? columns;

    const strategies: MissingValueStrategy[] = colsToUse
      .map(col => {
        if (col.selectedTreatment === 'none') {
          return null;
        }

        if (col.selectedTreatment === 'custom') {
          let value: string | number = col.customValue ?? '';

          if (!col.customValue) {
            if (col.columnRole === 'identifier') {
              value = 'Unknown';
            } else if (col.dataType === 'text' && col.columnRole === 'measure') {
              value = 'Not provided';
            } else if (col.dataType === 'number') {
              value = 0;
            } else {
              value = '';
            }
          }

          if (col.dataType === 'number' && value !== undefined && value !== null) {
            const numericValue = typeof value === 'string' ? Number(value) : value;
            if (!Number.isNaN(Number(numericValue))) {
              value = numericValue as number;
            }
          }

          return {
            columnName: col.columnName,
            strategy: 'custom',
            value,
          };
        }

        return {
          columnName: col.columnName,
          strategy: col.selectedTreatment,
        };
      })
      .filter((s): s is MissingValueStrategy => s !== null);

    console.log('💾 U5 handleSave called:', {
      fileName: currentFile.name,
      columnsCount: colsToUse.length,
      strategies: strategies
    });

    setMissingValueStrategies(currentFile.name, strategies);
    console.log('💾 U5 setMissingValueStrategies called successfully');
  }

  const handleNext = () => {
    console.log('🚀 U5 handleNext called - saving strategies to state');
    console.log('🚀 U5 Current columns state:', columns);
    
    // Save strategies to state - the actual API call is handled by GuidedUploadFlow
    // using the same /process_saved_dataframe API that SavedDataFramesPanel uses
    handleSave();
    
    console.log('🚀 U5 Navigating to next stage');
    onNext();
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
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{column.columnName}</span>
                          {column.displayType && (
                            <Badge variant="outline" className="text-xs text-gray-700 border-gray-300">
                              {column.displayType}
                            </Badge>
                          )}
                        </div>
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
                          <div
                            className="relative inline-block w-48"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <select
                              value={column.selectedTreatment}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleTreatmentChange(column.columnName, e.target.value as MissingValueStrategy['strategy']);
                              }}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                              className="w-full h-9 px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#458EE2] focus:border-[#458EE2] cursor-pointer appearance-none bg-[right_0.5rem_center] bg-no-repeat pr-8"
                              style={{
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
                              }}
                            >
                              {treatmentOptions.map(option => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>
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

        {/* Debug Section - Remove this after fixing */}
        <div className="bg-gray-50 border border-gray-300 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-700">Debug: Current Saved Missing Value Strategies</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const currentStrategies = currentFile ? (missingValueStrategies[currentFile.name] || []) : [];
                console.log('🔍 U5 Current saved missingValueStrategies:', currentStrategies);
                alert(`Saved strategies: ${JSON.stringify(currentStrategies, null, 2)}`);
              }}
            >
              Show Saved Strategies
            </Button>
          </div>
          <p className="text-xs text-gray-600">
            Click "Show Saved Strategies" to see what's currently saved in missingValueStrategies. 
            This should update when you change treatment dropdowns.
          </p>
        </div>

        {/* Summary */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-gray-700">
            Select a treatment strategy for each column with missing values. The backend will apply your selections using robust logic that handles data type conversions and edge cases automatically.
          </p>
        </div>

        {/* Single-file flow after U1 selection: no file navigation */}
      </div>
    </StageLayout>
  );
};

