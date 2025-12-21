import React, { useEffect, useState, useRef } from 'react';
import { AlertTriangle, Lightbulb, History, Pencil } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { UPLOAD_API } from '@/lib/api';
import { StageLayout } from '../components/StageLayout';
import type { ReturnTypeFromUseGuidedUploadFlow, DataTypeSelection } from '../useGuidedUploadFlow';

interface U4ReviewDataTypesProps {
  flow: ReturnTypeFromUseGuidedUploadFlow;
  onNext: () => void;
  onBack: () => void;
  isMaximized?: boolean;
}

interface ColumnTypeInfo {
  columnName: string;
  dataType: string; // Backend data type: int, float, string, date, datetime, boolean (renamed from updateType)
  columnRole: 'identifier' | 'measure';
  detectedRole: 'identifier' | 'measure';
  sampleValues: (string | number)[];
  dtype: string;
  missingPercentage: number;
  tag?: 'previously_used_type' | 'previously_used_role' | 'ai_suggestion' | 'edited_by_user';
  warning?: string;
  suggestedDataType?: string; // Suggested backend data type from warnings (renamed from suggestedUpdateType)
  historicalType?: string;
  historicalRole?: 'identifier' | 'measure';
}

// Backend data types (matches backend dtype system) - This is now the main "Data Type" column
const DATA_TYPES = [
  { value: 'int', label: 'Integer (int)' },
  { value: 'float', label: 'Float' },
  { value: 'string', label: 'String' },
  { value: 'date', label: 'Date' },
  { value: 'datetime', label: 'DateTime' },
  { value: 'boolean', label: 'Boolean' },
];

const COLUMN_ROLES = [
  { value: 'identifier', label: 'Identifier (dimension)' },
  { value: 'measure', label: 'Measure (metric)' },
];

// Map pandas dtype to backend data type (for "Data Type" column)
// This matches the backend dtype system used in routes.py and SavedDataFramesPanel.tsx
// Backend types: int, float, string, date, datetime, boolean
function mapDtypeToDataType(dtype: string): string {
  if (!dtype) {
    return 'string'; // Default fallback
  }
  
  const dtypeLower = dtype.toLowerCase();
  
  // Integer types (matches backend logic)
  if (dtypeLower.includes('int') && !dtypeLower.includes('float')) {
    // Check for specific integer types: int64, int32, int16, int8, Int64 (nullable), etc.
    if (dtypeLower === 'int64' || dtypeLower === 'int32' || dtypeLower === 'int16' || 
        dtypeLower === 'int8' || dtypeLower === 'int' || dtypeLower === 'integer' ||
        dtypeLower.startsWith('int') || dtypeLower === 'int64' || dtypeLower === 'int32') {
      return 'int';
    }
  }
  
  // Float types (matches backend logic)
  if (dtypeLower.includes('float') || dtypeLower === 'numeric' || dtypeLower === 'double') {
    // Check for specific float types: float64, float32, float16, etc.
    if (dtypeLower === 'float64' || dtypeLower === 'float32' || dtypeLower === 'float16' ||
        dtypeLower === 'float' || dtypeLower.startsWith('float')) {
      return 'float';
    }
  }
  
  // Boolean types (matches backend logic)
  if (dtypeLower.includes('bool') || dtypeLower === 'boolean') {
    return 'boolean';
  }
  
  // Datetime types (matches backend logic)
  // Check for datetime64 variants first (more specific)
  if (dtypeLower.includes('datetime64') || dtypeLower.includes('datetime')) {
    // datetime64[ns], datetime64, datetime64[ns, UTC], etc.
    return 'datetime';
  }
  
  // Date types (matches backend logic)
  if (dtypeLower.includes('date') && !dtypeLower.includes('datetime')) {
    return 'date';
  }
  
  // String/object types (matches backend logic)
  // Default to string for object, category, string, and unknown types
  if (dtypeLower === 'object' || dtypeLower === 'category' || dtypeLower === 'string' ||
      dtypeLower === 'str' || dtypeLower.startsWith('string')) {
    return 'string';
  }
  
  // Default fallback to string (matches backend default)
  return 'string';
}

// Classify role based on data type (backend logic)
function classifyRoleFromDataType(dataType: string): 'identifier' | 'measure' {
  if (dataType === 'int' || dataType === 'float') {
    return 'measure';
  }
  if (dataType === 'date' || dataType === 'datetime' || dataType === 'string' || dataType === 'boolean') {
    return 'identifier';
  }
  return 'identifier'; // Default
}

// Classify column role based on name and type
// This matches the backend _classify_column function exactly (routes.py lines 2562-2597)
function classifyColumnRole(columnName: string, columnType: string, dtype: string): 'identifier' | 'measure' {
  const colLower = columnName.toLowerCase();
  
  // Identifier keywords (matches backend routes.py lines 2648-2653)
  const identifierKeywords = [
    'id', 'name', 'brand', 'market', 'category', 'region', 'channel', 
    'date', 'time', 'year', 'week', 'month', 'variant', 'ppg', 'type', 
    'code', 'packsize', 'packtype', 'sku', 'product',
    'segment', 'subsegment', 'subchannel', 'zone', 'state', 'city', 'cluster', 'store', 'retailer', 'distributor', 'partner', 'account',
    'customer', 'consumer', 'household', 'respondent', 'wave', 'period', 'quarter', 'day'
  ];
  
  // Measure keywords (matches backend routes.py lines 2656-2661)
  const measureKeywords = [
    'sales', 'revenue', 'volume', 'amount', 'value', 'price', 'cost', 
    'profit', 'units', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 
    'salesvalue', 'baseprice', 'promoprice',
    'sale', 'qty', 'quantity', 'mrp', 'nrv', 'margin', 'loss', 'rate', 'spend', 'impressions', 'clicks', 'carts', 'orders', 'views', 'shares', 'likes',
    'comments', 'ratings', 'scores', 'awareness', 'consideration', 'preference', 'nps', 'penetration', 'frequency', 'reach', 'trps', 'grps', 'weight', 'index', 'share'
  ];
  
  // Check keyword matches first (matches backend logic)
  if (identifierKeywords.some(keyword => colLower.includes(keyword))) {
    return 'identifier';
  }
  if (measureKeywords.some(keyword => colLower.includes(keyword))) {
    return 'measure';
  }
  
  // If no keyword match, classify by data type (matches backend _classify_column logic)
  const dtypeLower = dtype.toLowerCase();
  
  // Datetime → identifiers
  if (dtypeLower.includes('datetime') || dtype === 'datetime64[ns]' || dtype === 'datetime64' || dtype === 'date') {
    return 'identifier';
  }
  // Categorical/string/object → identifiers
  if (dtype === 'object' || dtype === 'category' || dtype === 'string') {
    return 'identifier';
  }
  // Numerical → measures
  if (dtypeLower.includes('int') || dtypeLower.includes('float') || 
      ['numeric', 'integer', 'float64', 'float32', 'int64', 'int32'].includes(dtype)) {
    return 'measure';
  }
  
  // Default to identifier for safety (backend returns 'unclassified' but we default to identifier)
  return 'identifier';
}

export const U4ReviewDataTypes: React.FC<U4ReviewDataTypesProps> = ({ flow, onNext, onBack, isMaximized = false }) => {
  const { state, setDataTypeSelections } = flow;
  const { uploadedFiles, columnNameEdits, dataTypeSelections, selectedFileIndex } = state;

  // Only process the file selected in U1
  const chosenIndex = selectedFileIndex !== undefined && selectedFileIndex < uploadedFiles.length ? selectedFileIndex : 0;
  const currentFile = uploadedFiles[chosenIndex];

  const [columns, setColumns] = useState<ColumnTypeInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const loadedFileRef = useRef<string | null>(null);
  const isFetchingRef = useRef(false);

  const currentColumnEdits = currentFile ? (columnNameEdits[currentFile.name] || []) : [];

  useEffect(() => {
    const fetchDataTypes = async () => {
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

        // Use the processed file path from U2/U3 (after header selection was applied)
        // The path should be updated by U2 after applying header selection
        // If still in tmp/, that's okay - file-metadata endpoint can handle it
        const filePath = currentFile.path;

        // Fetch file metadata (includes dtype, sample values, missing percentage)
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
        
        // Validate response
        if (!metadataData || !Array.isArray(metadataData.columns)) {
          throw new Error('Invalid response from server: columns array not found');
        }
        
        // Read existing selections without triggering re-render
        const existingSelections = dataTypeSelections[currentFile.name] || [];

        // Create mapping: original name -> edited name (from U3)
        const originalToEditedMap = new Map<string, string>();
        const editedToOriginalMap = new Map<string, string>();
        if (Array.isArray(currentColumnEdits)) {
          currentColumnEdits.forEach(edit => {
            if (edit.keep !== false) { // Only include columns that are kept
              originalToEditedMap.set(edit.originalName, edit.editedName);
              editedToOriginalMap.set(edit.editedName, edit.originalName);
            }
          });
        }

        // Build column info from metadata
        // File columns have original names (after U2 header selection)
        // We need to map them to edited names from U3
        const columnInfos: (ColumnTypeInfo | null)[] = metadataData.columns.map((col: any) => {
          // Map original name to edited name
          const editedName = originalToEditedMap.get(col.name) || col.name;
          
          // Skip if this column was marked for deletion in U3
          const edit = currentColumnEdits.find(e => e.originalName === col.name);
          if (edit?.keep === false) {
            return null; // Will filter out nulls
          }
          
          const existingSelection = existingSelections.find(s => s.columnName === editedName);
          
          // Use raw dtype directly (same as routes.py /file-metadata and SavedDataFramesPanel.tsx)
          // This matches routes.py line 3770: "dtype": str(col_data.dtype)
          const rawDtype = col.dtype || 'object';
          const detectedDataType = mapDtypeToDataType(rawDtype); // Maps to backend types (int, float, string, etc.)
          // Use the raw dtype from pandas/polars for classification (matches backend _classify_column logic in routes.py)
          const detectedRole = classifyColumnRole(editedName, detectedDataType, rawDtype);
          
          // Determine tag
          let tag: 'previously_used_type' | 'previously_used_role' | 'ai_suggestion' | 'edited_by_user' | undefined;
          if (existingSelection) {
            if ((existingSelection.updateType && existingSelection.updateType !== detectedDataType) || 
                (existingSelection.columnRole && existingSelection.columnRole !== detectedRole)) {
              tag = 'edited_by_user';
            } else if (col.historical_type && existingSelection.updateType === col.historical_type) {
              tag = 'previously_used_type';
            } else if (col.historical_role && existingSelection.columnRole === col.historical_role) {
              tag = 'previously_used_role';
            }
          } else {
            tag = 'ai_suggestion';
          }

          // Check for warnings (using raw dtype for detection, same as routes.py logic)
          let warning: string | undefined;
          let suggestedDataType: string | undefined;
          const dtypeLower = rawDtype.toLowerCase();
          
          // Suggest better dtype based on sample values
          const sampleValues = col.sample_values || [];
          const looksNumeric = sampleValues.some((v: any) => {
            const val = String(v).trim();
            return val !== '' && !isNaN(Number(val));
          });
          const looksInteger = looksNumeric && sampleValues.every((v: any) => {
            const val = String(v).trim();
            if (val === '' || isNaN(Number(val))) return false;
            const num = Number(val);
            return Number.isInteger(num);
          });
          const looksDate = sampleValues.some((v: any) => {
            const str = String(v);
            return /^\d{4}[-/]\d{2}[-/]\d{2}/.test(str) || 
                   /^\d{2}[-/]\d{2}[-/]\d{4}/.test(str) ||
                   /^\d{4}-\d{2}-\d{2}/.test(str) || 
                   /^\d{2}\/\d{2}\/\d{4}/.test(str);
          });
          const hasNonNumericInNumeric = (dtypeLower.includes('int') || dtypeLower.includes('float')) &&
            sampleValues.some((v: any) => {
              const val = String(v).trim();
              return val !== '' && isNaN(Number(val));
            });

          if ((dtypeLower === 'object' || dtypeLower === 'string' || dtypeLower === 'str' || dtypeLower === 'category') && looksNumeric) {
            warning = 'These values look numeric. Consider converting to number.';
            suggestedDataType = looksInteger ? 'int' : 'float';
          } else if (hasNonNumericInNumeric) {
            warning = 'Some values include letters. Consider converting to text.';
            suggestedDataType = 'string';
          } else if ((dtypeLower === 'object' || dtypeLower === 'string' || dtypeLower === 'str') && looksDate) {
            warning = 'These values look like dates. Consider setting type to Date.';
            suggestedDataType = 'date';
          }

          return {
            columnName: editedName,
            dataType: existingSelection?.updateType || detectedDataType,
            columnRole: (existingSelection?.columnRole as 'identifier' | 'measure') || detectedRole,
            detectedRole,
            sampleValues: col.sample_values || [],
            dtype: col.dtype || 'object',
            missingPercentage: col.missing_percentage || 0,
            tag,
            warning,
            historicalType: col.historical_type,
            historicalRole: col.historical_role,
            suggestedDataType,
          };
        });

        // Filter out nulls (columns marked for deletion)
        const keptColumns = columnInfos.filter((col): col is ColumnTypeInfo => col !== null);

        setColumns(keptColumns);
        
        // 🔥 AUTO-SAVE: Save initial suggested types immediately so they're available even if user doesn't interact
        if (currentFile && keptColumns.length > 0) {
          const initialSelections: DataTypeSelection[] = keptColumns.map(col => ({
            columnName: col.columnName,
            updateType: col.suggestedDataType || col.dataType, // Use suggested type as source of truth
            format: ((col.suggestedDataType || col.dataType) === 'date' || 
                     (col.suggestedDataType || col.dataType) === 'datetime') ? col.dtype : undefined,
            columnRole: col.columnRole,
          }));
          
          console.log('🔥 AUTO-SAVE: Saving initial suggested types on load:', {
            fileName: currentFile.name,
            selections: initialSelections
          });
          
          setDataTypeSelections(currentFile.name, initialSelections);
        }
        
        loadedFileRef.current = fileKey;
      } catch (err: any) {
        console.error('Failed to fetch data types:', err);
        setError(err.message || 'Failed to load column types');
      } finally {
        setLoading(false);
        isFetchingRef.current = false;
      }
    };

    void fetchDataTypes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFile?.name, currentFile?.path, currentColumnEdits.length]);

  const handleDataTypeChange = (columnName: string, newDataType: string) => {
    setColumns(prev => prev.map(col => {
      if (col.columnName === columnName) {
        // Auto-update role based on data type
        const newRole = classifyRoleFromDataType(newDataType);
        return { 
          ...col, 
          dataType: newDataType,
          columnRole: newRole,
          tag: 'edited_by_user' as const 
        };
      }
      return col;
    }));
    handleSave();
  };

  const handleSuggestedTypeChange = (columnName: string, newType: string) => {
    console.log('🔧 handleSuggestedTypeChange called:', { columnName, newType });
    setColumns(prev => prev.map(col => {
      if (col.columnName === columnName) {
        const newRole = classifyRoleFromDataType(newType);
        const updatedCol = {
          ...col,
          // Keep original dataType unchanged - it's the detected type for the badge
          suggestedDataType: newType, // Only update the suggested type
          columnRole: newRole,
          tag: 'edited_by_user' as const,
        };
        console.log('🔧 Updated column:', updatedCol);
        return updatedCol;
      }
      return col;
    }));
    // Use setTimeout to ensure state update completes before saving
    setTimeout(() => {
      console.log('🔧 About to call handleSave after suggestedTypeChange');
      // Get the latest columns state and save it
      setColumns(currentColumns => {
        const selections: DataTypeSelection[] = currentColumns.map(col => ({
          columnName: col.columnName,
          updateType: col.suggestedDataType || col.dataType,
          format: ((col.suggestedDataType || col.dataType) === 'date' || 
                   (col.suggestedDataType || col.dataType) === 'datetime') ? col.dtype : undefined,
          columnRole: col.columnRole,
        }));
        
        if (currentFile) {
          console.log('💾 Direct save from setTimeout:', { fileName: currentFile.name, selections });
          setDataTypeSelections(currentFile.name, selections);
        }
        
        return currentColumns; // Return unchanged to avoid re-render
      });
    }, 0);
  };

  const handleRoleChange = (columnName: string, newRole: 'identifier' | 'measure') => {
    setColumns(prev => prev.map(col =>
      col.columnName === columnName 
        ? { ...col, columnRole: newRole, tag: 'edited_by_user' as const }
        : col
    ));
    handleSave();
  };

  const handleApplySuggestion = (columnName: string) => {
    setColumns(prev => prev.map(col => {
      if (col.columnName === columnName && col.suggestedDataType) {
        const newRole = classifyRoleFromDataType(col.suggestedDataType);
        return {
          ...col,
          dataType: col.suggestedDataType,
          columnRole: newRole,
          warning: undefined,
          tag: 'ai_suggestion' as const,
        };
      }
      return col;
    }));
    handleSave();
  };

  // Bulk actions (using data type, matches routes.py logic)
  const handleConvertAllNumericToMeasures = () => {
    setColumns(prev => {
      const updated = prev.map(col => {
        if ((col.dataType === 'int' || col.dataType === 'float') && col.columnRole === 'identifier') {
          return { ...col, columnRole: 'measure' as const, tag: 'edited_by_user' as const };
        }
        return col;
      });
      
      // Save immediately
      if (currentFile) {
        const selections: DataTypeSelection[] = updated.map(col => ({
          columnName: col.columnName,
          updateType: col.suggestedDataType || col.dataType,
          format: ((col.suggestedDataType || col.dataType) === 'date' || 
                   (col.suggestedDataType || col.dataType) === 'datetime') ? col.dtype : undefined,
          columnRole: col.columnRole,
        }));
        setDataTypeSelections(currentFile.name, selections);
      }
      
      return updated;
    });
  };

  const handleConvertAllTextToIdentifiers = () => {
    setColumns(prev => {
      const updated = prev.map(col => {
        if ((col.dataType === 'string' || col.dataType === 'date' || col.dataType === 'datetime' || col.dataType === 'boolean') && col.columnRole === 'measure') {
          return { ...col, columnRole: 'identifier' as const, tag: 'edited_by_user' as const };
        }
        return col;
      });
      
      // Save immediately
      if (currentFile) {
        const selections: DataTypeSelection[] = updated.map(col => ({
          columnName: col.columnName,
          updateType: col.suggestedDataType || col.dataType,
          format: ((col.suggestedDataType || col.dataType) === 'date' || 
                   (col.suggestedDataType || col.dataType) === 'datetime') ? col.dtype : undefined,
          columnRole: col.columnRole,
        }));
        setDataTypeSelections(currentFile.name, selections);
      }
      
      return updated;
    });
  };

  // Apply pending AI suggestions (without overriding manual changes) before save/continue
  const applySuggestionsToColumns = (cols: ColumnTypeInfo[]) => {
    return cols.map(col => {
      if (col.suggestedDataType && col.suggestedDataType !== col.dataType) {
        const newRole = classifyRoleFromDataType(col.suggestedDataType);
        return {
          ...col,
          dataType: col.suggestedDataType,
          columnRole: newRole,
          tag: col.tag ?? 'ai_suggestion',
          warning: undefined,
        };
      }
      return col;
    });
  };

  const handleSave = (colsOverride?: ColumnTypeInfo[]) => {
    const colsToSave = colsOverride ?? columns;
    if (!currentFile) {
      console.log('❌ handleSave: No currentFile, skipping save');
      return;
    }
    
    const selections: DataTypeSelection[] = colsToSave.map(col => ({
      columnName: col.columnName,
      updateType: col.suggestedDataType || col.dataType, // Use suggested type as source of truth
      format: ((col.suggestedDataType || col.dataType) === 'date' || 
               (col.suggestedDataType || col.dataType) === 'datetime') ? col.dtype : undefined,
      columnRole: col.columnRole,
    }));
    
    console.log('💾 handleSave called:', {
      fileName: currentFile.name,
      columnsCount: colsToSave.length,
      selections: selections
    });
    
    setDataTypeSelections(currentFile.name, selections);
    console.log('💾 setDataTypeSelections called successfully');
  };

  const handleNext = () => {
    console.log('🚀 handleNext called - saving before navigation');
    console.log('🚀 Current columns state:', columns);
    
    // Save current state before navigation
    handleSave();
    
    // Navigate to next stage
    console.log('🚀 Navigating to next stage');
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
          <p className="mt-4 text-sm text-gray-600">Loading data types...</p>
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
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      </StageLayout>
    );
  }

  const hasWarnings = columns.some(col => col.warning);
  // Check for numeric identifiers and text measures using data type (matches routes.py logic)
  const hasNumericIdentifiers = columns.some(col => {
    return (col.dataType === 'int' || col.dataType === 'float') && col.columnRole === 'identifier';
  });
  const hasTextMeasures = columns.some(col => {
    return (col.dataType === 'string' || col.dataType === 'date' || col.dataType === 'datetime' || col.dataType === 'boolean') && col.columnRole === 'measure';
  });

  return (
    <StageLayout
      title=""
      explanation=""
    >
      <div className="space-y-2">
        {/* Bulk Actions */}
        {(hasNumericIdentifiers || hasTextMeasures) && (
          <div className="flex flex-wrap gap-2 pb-2 border-b">
            {hasNumericIdentifiers && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleConvertAllNumericToMeasures();
                }}
                className="flex items-center gap-1.5 text-xs h-7"
                type="button"
              >
                Convert All Numeric Columns to Measures
              </Button>
            )}
            {hasTextMeasures && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleConvertAllTextToIdentifiers();
                }}
                className="flex items-center gap-1.5 text-xs h-7"
                type="button"
              >
                Convert All Text Columns to Identifiers
              </Button>
            )}
          </div>
        )}

        {/* Warnings */}
        {hasWarnings && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-yellow-800">
                Some columns may need type adjustment. Check the table below.
              </p>
            </div>
          </div>
        )}

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
                <col style={{ width: '180px' }} />
                <col style={{ width: '200px' }} />
                <col style={{ width: '150px' }} />
                <col style={{ width: '150px' }} />
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
                      Sample Values
                    </div>
                  </th>
                  <th className="px-0.5 py-0 text-left font-medium text-gray-900 border border-gray-300 text-[10px] leading-tight bg-gray-50 whitespace-nowrap overflow-hidden">
                    <div className="truncate">
                      Suggested Type
                    </div>
                  </th>
                  <th className="px-0.5 py-0 text-left font-medium text-gray-900 border border-gray-300 text-[10px] leading-tight bg-gray-50 whitespace-nowrap overflow-hidden">
                    <div className="truncate">
                      Column Role
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
                  const sampleValuesText = Array.from(new Set(column.sampleValues)).slice(0, 5).join(', ');
                  const fullSampleValuesText = Array.from(new Set(column.sampleValues)).join(', ');
                  return (
                    <tr
                      key={`${column.columnName}-${index}`}
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
                      <td className="px-0.5 py-0 border border-gray-300 text-[10px] leading-tight whitespace-nowrap overflow-hidden" title={fullSampleValuesText}>
                        <div className="truncate">
                          {column.sampleValues.length === 0 ? (
                            <span className="text-gray-400">No samples</span>
                          ) : (
                            <>
                              {sampleValuesText}
                              {Array.from(new Set(column.sampleValues)).length > 5 && '...'}
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-0.5 py-0 border border-gray-300 text-[10px] leading-tight whitespace-nowrap overflow-hidden">
                        <div 
                          className="relative inline-block w-full max-w-[140px]" 
                          onClick={(e) => e.stopPropagation()}
                        >
                          <select
                            value={column.suggestedDataType || column.dataType}
                            onChange={(e) => {
                              e.stopPropagation();
                              const value = e.target.value;
                              handleSuggestedTypeChange(column.columnName, value);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            className={`w-full h-5 px-1 py-0 text-[10px] rounded border border-gray-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#458EE2] focus:border-[#458EE2] cursor-pointer appearance-none text-gray-900`}
                            style={{
                              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
                              backgroundSize: '1em 1em',
                              backgroundPosition: 'right 0.25rem center',
                              backgroundRepeat: 'no-repeat',
                              paddingRight: '1.5rem'
                            }}
                          >
                            {DATA_TYPES.map(type => (
                              <option key={type.value} value={type.value}>
                                {type.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="px-0.5 py-0 border border-gray-300 text-[10px] leading-tight whitespace-nowrap overflow-hidden">
                        <div 
                          className="relative inline-block w-full max-w-[140px]" 
                          onClick={(e) => e.stopPropagation()}
                        >
                          <select
                            value={column.columnRole}
                            onChange={(e) => {
                              e.stopPropagation();
                              const value = e.target.value as 'identifier' | 'measure';
                              handleRoleChange(column.columnName, value);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="w-full h-5 px-1 py-0 text-[10px] rounded border border-gray-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#458EE2] focus:border-[#458EE2] cursor-pointer appearance-none text-gray-900"
                            style={{
                              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
                              backgroundSize: '1em 1em',
                              backgroundPosition: 'right 0.25rem center',
                              backgroundRepeat: 'no-repeat',
                              paddingRight: '1.5rem'
                            }}
                          >
                            {COLUMN_ROLES.map(role => (
                              <option key={role.value} value={role.value}>
                                {role.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="px-0.5 py-0 border border-gray-300 text-[10px] leading-tight whitespace-nowrap overflow-hidden">
                        <div className="flex gap-0.5 flex-wrap overflow-hidden">
                          {column.tag === 'previously_used_type' && (
                            <Badge className="bg-[#41C185] text-white text-[9px] flex items-center px-1 py-0 leading-tight flex-shrink-0 whitespace-nowrap truncate max-w-full">
                              <History className="w-2 h-2 mr-0.5 flex-shrink-0" />
                              <span className="truncate">Previously Used Type</span>
                            </Badge>
                          )}
                          {column.tag === 'previously_used_role' && (
                            <Badge className="bg-[#41C185] text-white text-[9px] flex items-center px-1 py-0 leading-tight flex-shrink-0 whitespace-nowrap truncate max-w-full">
                              <History className="w-2 h-2 mr-0.5 flex-shrink-0" />
                              <span className="truncate">Previously Used Role</span>
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
                              <Pencil className="w-2 h-2 mr-0.5 flex-shrink-0" />
                              <span className="truncate">Edited by User</span>
                            </Badge>
                          )}
                          {column.warning && (
                            <Badge className="text-yellow-700 border-yellow-300 bg-yellow-50 text-[9px] flex items-center px-1 py-0 leading-tight flex-shrink-0 whitespace-nowrap truncate max-w-full">
                              <AlertTriangle className="w-2 h-2 mr-0.5 flex-shrink-0" />
                              <span className="truncate">Potential Issue</span>
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
      </div>
    </StageLayout>
  );
};

