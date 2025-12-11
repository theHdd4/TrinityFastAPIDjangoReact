import React, { useEffect, useState, useRef } from 'react';
import { AlertTriangle, Lightbulb, History, Pencil } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { VALIDATE_API } from '@/lib/api';
import { StageLayout } from '../components/StageLayout';
import type { ReturnTypeFromUseGuidedUploadFlow, DataTypeSelection } from '../useGuidedUploadFlow';

interface U4ReviewDataTypesProps {
  flow: ReturnTypeFromUseGuidedUploadFlow;
  onNext: () => void;
  onBack: () => void;
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

export const U4ReviewDataTypes: React.FC<U4ReviewDataTypesProps> = ({ flow, onNext, onBack }) => {
  const { state, setDataTypeSelections } = flow;
  const { uploadedFiles, columnNameEdits, dataTypeSelections } = state;
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [columns, setColumns] = useState<ColumnTypeInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const loadedFileRef = useRef<string | null>(null);
  const isFetchingRef = useRef(false);

  const currentFile = uploadedFiles[currentFileIndex];
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
          
          // Check if dtype is object/string but values look numeric (matches routes.py _infer_column_type logic)
          if ((dtypeLower === 'object' || dtypeLower === 'string' || dtypeLower === 'str' || dtypeLower === 'category') &&
              col.sample_values?.some((v: any) => {
                const val = String(v).trim();
                return val !== '' && !isNaN(Number(val)) && val !== '';
              })) {
            warning = 'These values look numeric. Should this be a number?';
            suggestedDataType = 'float';
          } 
          // Check if dtype is numeric but values include non-numeric characters
          else if ((dtypeLower.includes('int') || dtypeLower.includes('float')) &&
                   col.sample_values?.some((v: any) => {
                     const val = String(v).trim();
                     return val !== '' && isNaN(Number(val));
                   })) {
            warning = 'Some values include letters. Please confirm if this is a text column.';
            suggestedDataType = 'string';
          } 
          // Check if dtype is object/string but values look like dates (matches routes.py datetime detection)
          else if ((dtypeLower === 'object' || dtypeLower === 'string' || dtypeLower === 'str') &&
                   col.sample_values?.some((v: any) => {
                     const str = String(v);
                     return /^\d{4}[-/]\d{2}[-/]\d{2}/.test(str) || 
                            /^\d{2}[-/]\d{2}[-/]\d{4}/.test(str) ||
                            /^\d{4}-\d{2}-\d{2}/.test(str) || 
                            /^\d{2}\/\d{2}\/\d{4}/.test(str);
                   })) {
            warning = 'These values look like dates. You can set the type to "Date".';
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
    setColumns(prev => prev.map(col => {
      if ((col.dataType === 'int' || col.dataType === 'float') && col.columnRole === 'identifier') {
        return { ...col, columnRole: 'measure' as const, tag: 'edited_by_user' as const };
      }
      return col;
    }));
  };

  const handleConvertAllTextToIdentifiers = () => {
    setColumns(prev => prev.map(col => {
      if ((col.dataType === 'string' || col.dataType === 'date' || col.dataType === 'datetime' || col.dataType === 'boolean') && col.columnRole === 'measure') {
        return { ...col, columnRole: 'identifier' as const, tag: 'edited_by_user' as const };
      }
      return col;
    }));
  };

  const handleSave = () => {
    if (currentFile) {
      const selections: DataTypeSelection[] = columns.map(col => ({
        columnName: col.columnName,
        updateType: col.dataType,
        format: col.dataType === 'date' || col.dataType === 'datetime' ? col.dtype : undefined,
        columnRole: col.columnRole,
      }));
      setDataTypeSelections(currentFile.name, selections);
    }
  };

  const handleNext = () => {
    handleSave();
    if (currentFileIndex < uploadedFiles.length - 1) {
      // Reset loaded file ref when moving to next file
      loadedFileRef.current = null;
      setCurrentFileIndex(currentFileIndex + 1);
    } else {
      onNext();
    }
  };

  if (loading) {
    return (
      <StageLayout
        title="Step 5: Review Your Column Types"
        explanation="Detecting data types and roles for each column..."
      >
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-[#458EE2]"></div>
          <p className="mt-4 text-sm text-gray-600">Detecting data types...</p>
        </div>
      </StageLayout>
    );
  }

  if (error) {
    return (
      <StageLayout
        title="Step 5: Review Your Column Types"
        explanation="Error loading column types"
      >
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-600">{error}</p>
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
      title="Step 5: Review Your Column Types"
      explanation="These are the detected column types and roles. You only need to adjust anything that doesn't look right."
      helpText="Correct types help Trinity interpret numbers, dates, and categories properly."
    >
      <div className="space-y-6">
        {/* Bulk Actions */}
        {(hasNumericIdentifiers || hasTextMeasures) && (
          <div className="flex flex-wrap gap-2 pb-4 border-b">
            {hasNumericIdentifiers && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleConvertAllNumericToMeasures}
                className="flex items-center gap-2"
              >
                Convert All Numeric Columns to Measures
              </Button>
            )}
            {hasTextMeasures && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleConvertAllTextToIdentifiers}
                className="flex items-center gap-2"
              >
                Convert All Text Columns to Identifiers
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
                <p className="text-sm font-medium text-yellow-900 mb-2">Some columns may need type adjustment</p>
                <div className="space-y-2">
                  {columns.filter(col => col.warning).map((col, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2">
                      <p className="text-xs text-yellow-800 flex-1">
                        <strong>{col.columnName}:</strong> {col.warning}
                      </p>
                      {col.suggestedDataType && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            console.log('Apply suggestion for:', col.columnName);
                            handleApplySuggestion(col.columnName);
                          }}
                          className="h-7 text-xs bg-yellow-100 hover:bg-yellow-200 border-yellow-300"
                          type="button"
                        >
                          <Lightbulb className="w-3 h-3 mr-1" />
                          Apply Suggestion
                        </Button>
                      )}
                    </div>
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
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Sample Values</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Data Type</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Column Role</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Tags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {columns.map((column, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">{column.columnName}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-gray-600 max-w-xs truncate">
                        {column.sampleValues.slice(0, 5).map((val, idx) => (
                          <span key={idx}>
                            {String(val).length > 20 ? String(val).substring(0, 20) + '...' : String(val)}
                            {idx < column.sampleValues.length - 1 && idx < 4 && ', '}
                          </span>
                        ))}
                        {column.sampleValues.length === 0 && <span className="text-gray-400">No samples</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div 
                        className="relative inline-block w-40" 
                        onClick={(e) => e.stopPropagation()}
                      >
                        <select
                          value={column.dataType}
                          onChange={(e) => {
                            e.stopPropagation();
                            const value = e.target.value;
                            console.log('Data Type changed:', value, 'for column:', column.columnName);
                            handleDataTypeChange(column.columnName, value);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          className="w-full h-9 px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#458EE2] focus:border-[#458EE2] cursor-pointer appearance-none bg-[right_0.5rem_center] bg-no-repeat pr-8"
                          style={{
                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
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
                    <td className="px-4 py-3">
                      <div 
                        className="relative inline-block w-48" 
                        onClick={(e) => e.stopPropagation()}
                      >
                        <select
                          value={column.columnRole}
                          onChange={(e) => {
                            e.stopPropagation();
                            const value = e.target.value as 'identifier' | 'measure';
                            console.log('Role changed:', value, 'for column:', column.columnName);
                            handleRoleChange(column.columnName, value);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                          className="w-full h-9 px-3 py-1.5 text-sm rounded-md border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#458EE2] focus:border-[#458EE2] cursor-pointer appearance-none bg-[right_0.5rem_center] bg-no-repeat pr-8"
                          style={{
                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3E%3C/svg%3E")`,
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
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {column.tag === 'previously_used_type' && (
                          <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-[#41C185] text-white">
                            <History className="w-3 h-3 mr-1" />
                            Previously Used Type
                          </div>
                        )}
                        {column.tag === 'previously_used_role' && (
                          <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-[#41C185] text-white">
                            <History className="w-3 h-3 mr-1" />
                            Previously Used Role
                          </div>
                        )}
                        {column.tag === 'ai_suggestion' && (
                          <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-[#FFBD59] text-white">
                            <Lightbulb className="w-3 h-3 mr-1" />
                            AI Suggestion
                          </div>
                        )}
                        {column.tag === 'edited_by_user' && (
                          <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-[#458EE2] text-white">
                            <Pencil className="w-3 h-3 mr-1" />
                            Edited by User
                          </div>
                        )}
                        {column.warning && (
                          <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold text-yellow-700 border-yellow-300 bg-yellow-50">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Potential Issue
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-gray-700">
            Most of these types were detected automatically. You can adjust any column that doesn't look right.
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
                  // Reset loaded file ref when moving to previous file
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

