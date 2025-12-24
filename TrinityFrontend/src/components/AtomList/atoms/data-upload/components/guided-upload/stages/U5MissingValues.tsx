import React, { useEffect, useState, useRef } from 'react';
import { AlertTriangle, Lightbulb, History, RotateCcw, Eye } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UPLOAD_API } from '@/lib/api';
import { StageLayout } from '../components/StageLayout';
import type { ReturnTypeFromUseGuidedUploadFlow, MissingValueStrategy } from '../useGuidedUploadFlow';
import { useGuidedFlowFootprints } from '@/components/LaboratoryMode/hooks/useGuidedFlowFootprints';

interface U5MissingValuesProps {
  flow: ReturnTypeFromUseGuidedUploadFlow;
  onNext: () => void;
  onBack: () => void;
  isMaximized?: boolean;
}

interface ColumnMissingInfo {
  columnName: string;
  dataType: string;
  columnRole: 'identifier' | 'measure';
  displayType?: string;
  dtype: string; // Original dtype from metadata (e.g., 'int64', 'float64', 'object', etc.)
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

export const U5MissingValues: React.FC<U5MissingValuesProps> = ({ flow, onNext, onBack, isMaximized = false }) => {
  const { state, setMissingValueStrategies } = flow;
  const { trackEvent } = useGuidedFlowFootprints();
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
        const metadataRes = await fetch(`${UPLOAD_API}/file-metadata`, {
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
                dtype: col.dtype || 'object',
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
              dtype: col.dtype || 'object', // Store original dtype from metadata
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
    const column = columns.find(c => c.columnName === columnName);
    if (column) {
      trackEvent({
        event_type: 'edit',
        stage: 'U5',
        action: 'missing_value_strategy_select',
        target: `column_${columnName}`,
        details: {
          file_name: currentFile?.name,
          column_name: columnName,
          strategy: treatment,
        },
        before_value: column.selectedTreatment,
        after_value: treatment,
      });
    }
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
          
          // Determine tag: only mark as edited if treatment differs from suggestion
          // If user selects the suggested treatment, keep the AI suggestion tag (yellow)
          // If user selects historical treatment, use previously_used tag (green)
          // If user changes to something else, mark as edited (blue)
          let newTag: 'previously_used' | 'ai_suggestion' | 'edited_by_user' | undefined = col.tag;
          if (col.historicalTreatment && treatment === col.historicalTreatment) {
            // User selected the historical treatment
            newTag = 'previously_used';
          } else if (treatment === col.suggestedTreatment) {
            // User selected the same as AI suggested - keep AI suggestion tag (yellow)
            newTag = col.tag === 'ai_suggestion' ? 'ai_suggestion' : (col.tag || 'ai_suggestion');
          } else {
            // User changed from the suggested treatment - mark as edited (blue)
            newTag = 'edited_by_user';
          }
          
          const updatedCol = {
            ...col,
            selectedTreatment: treatment,
            customValue,
            tag: newTag,
          };
          console.log('🔧 U5 Updated column:', updatedCol);
          return updatedCol;
        }
        return col;
      }),
    );
  };

  const handleCustomValueChange = (columnName: string, value: string) => {
    const column = columns.find(c => c.columnName === columnName);
    if (column) {
      trackEvent({
        event_type: 'edit',
        stage: 'U5',
        action: 'missing_value_custom_value',
        target: `column_${columnName}`,
        details: {
          file_name: currentFile?.name,
          column_name: columnName,
        },
        before_value: column.customValue,
        after_value: value,
      });
    }
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

  // AI suggestion logic: default strategy is to leave missing
  const suggestTreatment = (col: ColumnMissingInfo): MissingValueStrategy['strategy'] => {
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
        title=""
        explanation=""
      >
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#458EE2]"></div>
          <p className="mt-4 text-sm text-gray-600">Loading missing values...</p>
        </div>
      </StageLayout>
    );
  }

  if (error) {
    return (
      <StageLayout
        title=""
        explanation=""
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
        title=""
        explanation=""
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
  const hasAISuggestions = columns.some(col => col.tag === 'ai_suggestion' || col.suggestedTreatment !== 'none');

  return (
    <StageLayout
      title=""
      explanation=""
    >
      <div className="space-y-2">
        {/* Bulk Actions */}
        <div className="flex flex-wrap gap-2 pb-2 border-b">
          {hasCategoricalIdentifiers && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleApplyAllCategorical}
              className="flex items-center gap-1.5 text-xs h-7"
              type="button"
            >
              Apply to All Categorical
            </Button>
          )}
          {hasClientMemory && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleApplyClientMemory}
              className="flex items-center gap-1.5 text-xs h-7"
              type="button"
            >
              <History className="w-3.5 h-3.5" />
              Use Historical
            </Button>
          )}
        </div>

        {/* Column Table */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div 
            className="overflow-x-auto" 
            style={{ 
              maxHeight: isMaximized ? 'calc(100vh - 300px)' : '8.75rem',
              overflowY: 'auto',
              scrollbarGutter: 'stable'
            }}
          >
            <table className="text-[10px] table-fixed w-full">
              <colgroup>
                <col style={{ width: '150px' }} />
                <col style={{ width: '120px' }} />
                <col style={{ width: '200px' }} />
                <col style={{ width: '180px' }} />
                <col style={{ width: '130px' }} />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-gray-50">
                <tr className="bg-gray-50" style={{ height: '1.75rem' }}>
                  <th className="px-0.5 py-0 text-left font-medium text-gray-900 border border-gray-300 text-[10px] leading-tight bg-gray-50 whitespace-nowrap overflow-hidden">
                    <div className="truncate">
                      Column Name
                    </div>
                  </th>
                  <th className="px-0.5 py-0 text-left font-medium text-gray-900 border border-gray-300 text-[10px] leading-tight bg-gray-50 whitespace-nowrap overflow-hidden">
                    <div className="truncate">
                      Missing (%)
                    </div>
                  </th>
                  <th className="px-0.5 py-0 text-left font-medium text-gray-900 border border-gray-300 text-[10px] leading-tight bg-gray-50 whitespace-nowrap overflow-hidden">
                    <div className="truncate">
                      Sample Values
                    </div>
                  </th>
                  <th className="px-0.5 py-0 text-left font-medium text-gray-900 border border-gray-300 text-[10px] leading-tight bg-gray-50 whitespace-nowrap overflow-hidden">
                    <div className="truncate">
                      Treatment
                    </div>
                  </th>
                  <th className="px-0.5 py-0 text-left font-medium text-gray-900 border border-gray-300 text-[10px] leading-tight bg-gray-50 whitespace-nowrap overflow-hidden">
                    <div className="truncate">
                      Tags
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {columns.map((column, index) => {
                  const treatmentOptions = getTreatmentOptions(column.dataType, column.columnRole);
                  const barColor = getMissingColor(column.missingPercent);
                  const maxSampleValues = isMaximized ? 20 : 5;
                  const sampleValuesText = Array.from(new Set(column.sampleValues.map(v => String(v)))).slice(0, maxSampleValues).join(', ');
                  const fullSampleValuesText = Array.from(new Set(column.sampleValues.map(v => String(v)))).join(', ');
                  
                  return (
                    <tr
                      key={index}
                      className="hover:bg-gray-50"
                      style={{ height: '1.75rem' }}
                    >
                      <td className="px-0.5 py-0 border border-gray-300 text-[10px] leading-tight whitespace-nowrap overflow-hidden" title={column.columnName}>
                        <div className="flex items-center gap-1 overflow-hidden">
                          <span className="text-gray-700 text-[10px] leading-tight truncate flex-1 whitespace-nowrap">
                            {column.columnName}
                          </span>
                          <span className="text-gray-500 text-[9px] leading-tight flex-shrink-0 whitespace-nowrap font-mono">
                            ({column.dtype || 'object'})
                          </span>
                        </div>
                      </td>
                      <td className="px-0.5 py-0 border border-gray-300 text-[10px] leading-tight whitespace-nowrap overflow-hidden">
                        <div className="flex items-center gap-1">
                          <div className="flex-1 min-w-0">
                            <div className="text-gray-600 truncate">
                              {column.missingCount.toLocaleString()} ({column.missingPercent.toFixed(1)}%)
                            </div>
                          </div>
                          <div className="w-8 bg-gray-200 rounded-full h-1.5 flex-shrink-0">
                            <div
                              className={`h-1.5 rounded-full ${barColor}`}
                              style={{ width: `${Math.min(column.missingPercent, 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-0.5 py-0 border border-gray-300 text-[10px] leading-tight whitespace-nowrap overflow-hidden" title={fullSampleValuesText}>
                        <div className="truncate">
                          {column.sampleValues.length === 0 ? (
                            <span className="text-gray-400">No samples</span>
                          ) : (
                            <>
                              {sampleValuesText}
                              {Array.from(new Set(column.sampleValues.map(v => String(v)))).length > maxSampleValues && '...'}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-0.5 py-0 border border-gray-300 text-[10px] leading-tight whitespace-nowrap overflow-hidden">
                        <div className="space-y-0.5">
                          <div 
                            className="relative inline-block w-full max-w-[160px]" 
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
                              className={`w-full h-5 px-1 py-0 text-[10px] rounded border border-gray-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#458EE2] focus:border-[#458EE2] cursor-pointer appearance-none`}
                              style={{
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
                                backgroundSize: '1em 1em',
                                backgroundPosition: 'right 0.25rem center',
                                backgroundRepeat: 'no-repeat',
                                paddingRight: '1.5rem'
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
                              className="w-full max-w-[160px] h-5 text-[10px] px-1"
                            />
                          )}
                          {column.selectedTreatment !== 'none' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleReset(column.columnName)}
                              className="h-4 text-[9px] px-1 py-0"
                            >
                              <RotateCcw className="w-2.5 h-2.5 mr-0.5" />
                              Reset
                            </Button>
                          )}
                        </div>
                      </td>
                      <td className="px-0.5 py-0 border border-gray-300 text-[10px] leading-tight whitespace-nowrap overflow-hidden">
                        <div className="flex gap-0.5 flex-wrap overflow-hidden">
                          {column.tag === 'previously_used' && (
                            <Badge className="bg-[#41C185] text-white text-[9px] flex items-center px-1 py-0 leading-tight flex-shrink-0 whitespace-nowrap truncate max-w-full">
                              <History className="w-2 h-2 mr-0.5 flex-shrink-0" />
                              <span className="truncate">Previously Used</span>
                            </Badge>
                          )}
                          {column.tag === 'ai_suggestion' && (
                            <Badge className="bg-[#FFBD59] text-white text-[9px] flex items-center px-1 py-0 leading-tight flex-shrink-0 whitespace-nowrap truncate max-w-full">
                              <Lightbulb className="w-2 h-2 mr-0.5 flex-shrink-0" />
                              <span className="truncate">AI Suggestion</span>
                            </Badge>
                          )}
                          {column.tag === 'edited_by_user' && (
                            <Badge className="bg-[#458EE2] text-white text-[9px] flex items-center px-1 py-0 leading-tight flex-shrink-0 whitespace-nowrap truncate max-w-full">
                              <RotateCcw className="w-2 h-2 mr-0.5 flex-shrink-0" />
                              <span className="truncate">Edited</span>
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
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 mb-0 -mt-1">
          <p className="text-xs text-gray-700">
            <strong>{columns.length}</strong> column{columns.length !== 1 ? 's' : ''} with missing values.
          </p>
        </div>
      </div>
    </StageLayout>
  );
};

