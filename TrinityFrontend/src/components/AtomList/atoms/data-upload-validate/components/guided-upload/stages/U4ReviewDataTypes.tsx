import React, { useEffect, useState, useRef } from 'react';
import { AlertTriangle, Lightbulb, History, Pencil, RotateCcw } from 'lucide-react';
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
  detectedType: string;
  selectedType: string;
  columnRole: 'identifier' | 'measure';
  detectedRole: 'identifier' | 'measure';
  sampleValues: (string | number)[];
  dtype: string;
  missingPercentage: number;
  tag?: 'previously_used_type' | 'previously_used_role' | 'ai_suggestion' | 'edited_by_user';
  warning?: string;
  historicalType?: string;
  historicalRole?: 'identifier' | 'measure';
}

const DATA_TYPES = [
  { value: 'number', label: 'Number' },
  { value: 'category', label: 'Category' },
  { value: 'text', label: 'Text' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Boolean' },
];

const COLUMN_ROLES = [
  { value: 'identifier', label: 'Identifier (dimension)' },
  { value: 'measure', label: 'Measure (metric)' },
];

// Map pandas dtype to our data types
// This matches what pandas/polars returns when reading files
function mapDtypeToType(dtype: string): string {
  const dtypeLower = dtype.toLowerCase();
  if (dtypeLower.includes('int') || dtypeLower.includes('float') || dtypeLower === 'numeric') {
    return 'number';
  }
  if (dtypeLower.includes('bool')) {
    return 'boolean';
  }
  if (dtypeLower.includes('datetime') || dtypeLower.includes('date')) {
    return 'date';
  }
  if (dtypeLower === 'category') {
    return 'category';
  }
  return 'text';
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
          
          const detectedType = mapDtypeToType(col.dtype || 'object');
          // Use the raw dtype from pandas/polars for classification (matches backend logic)
          const detectedRole = classifyColumnRole(editedName, detectedType, col.dtype || 'object');
          
          // Determine tag
          let tag: 'previously_used_type' | 'previously_used_role' | 'ai_suggestion' | 'edited_by_user' | undefined;
          if (existingSelection) {
            if (existingSelection.selectedType !== detectedType || (existingSelection.columnRole && existingSelection.columnRole !== detectedRole)) {
              tag = 'edited_by_user';
            } else if (col.historical_type && existingSelection.selectedType === col.historical_type) {
              tag = 'previously_used_type';
            } else if (col.historical_role && existingSelection.columnRole === col.historical_role) {
              tag = 'previously_used_role';
            }
          } else {
            tag = 'ai_suggestion';
          }

          // Check for warnings
          let warning: string | undefined;
          if (detectedType === 'text' && col.sample_values?.some((v: any) => !isNaN(Number(v)) && v !== '')) {
            warning = 'These values look numeric. Should this be a number?';
          } else if (detectedType === 'number' && col.sample_values?.some((v: any) => isNaN(Number(v)) && String(v).trim() !== '')) {
            warning = 'Some values include letters. Please confirm if this is a text column.';
          } else if (detectedType === 'text' && col.sample_values?.some((v: any) => {
            const str = String(v);
            return /^\d{4}-\d{2}-\d{2}/.test(str) || /^\d{2}\/\d{2}\/\d{4}/.test(str);
          })) {
            warning = 'These values look like dates. You can set the type to "Date".';
          }

          return {
            columnName: editedName,
            detectedType,
            selectedType: existingSelection?.selectedType || detectedType,
            columnRole: (existingSelection?.columnRole as 'identifier' | 'measure') || detectedRole,
            detectedRole,
            sampleValues: col.sample_values || [],
            dtype: col.dtype || 'object',
            missingPercentage: col.missing_percentage || 0,
            tag,
            warning,
            historicalType: col.historical_type,
            historicalRole: col.historical_role,
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

  const handleTypeChange = (columnName: string, newType: string) => {
    setColumns(prev => prev.map(col =>
      col.columnName === columnName 
        ? { ...col, selectedType: newType, tag: 'edited_by_user' as const }
        : col
    ));
  };

  const handleRoleChange = (columnName: string, newRole: 'identifier' | 'measure') => {
    setColumns(prev => prev.map(col =>
      col.columnName === columnName 
        ? { ...col, columnRole: newRole, tag: 'edited_by_user' as const }
        : col
    ));
  };

  const handleReset = (columnName: string) => {
    setColumns(prev => prev.map(col => {
      if (col.columnName === columnName) {
        return {
          ...col,
          selectedType: col.detectedType,
          columnRole: col.detectedRole,
          tag: undefined,
        };
      }
      return col;
    }));
  };

  // Bulk actions
  const handleConvertAllNumericToMeasures = () => {
    setColumns(prev => prev.map(col => {
      if (col.selectedType === 'number' && col.columnRole === 'identifier') {
        return { ...col, columnRole: 'measure' as const, tag: 'edited_by_user' as const };
      }
      return col;
    }));
  };

  const handleConvertAllTextToIdentifiers = () => {
    setColumns(prev => prev.map(col => {
      if (col.selectedType === 'text' && col.columnRole === 'measure') {
        return { ...col, columnRole: 'identifier' as const, tag: 'edited_by_user' as const };
      }
      return col;
    }));
  };

  const handleSave = () => {
    if (currentFile) {
      const selections: DataTypeSelection[] = columns.map(col => ({
        columnName: col.columnName,
        detectedType: col.detectedType,
        selectedType: col.selectedType,
        format: col.selectedType === 'date' ? col.dtype : undefined,
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
  const hasNumericIdentifiers = columns.some(col => col.selectedType === 'number' && col.columnRole === 'identifier');
  const hasTextMeasures = columns.some(col => col.selectedType === 'text' && col.columnRole === 'measure');

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
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Sample Values</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">Detected Type</th>
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
                      <Select
                        value={column.selectedType}
                        onValueChange={(value) => handleTypeChange(column.columnName, value)}
                      >
                        <SelectTrigger className="w-40">
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
                      {column.selectedType !== column.detectedType && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReset(column.columnName)}
                          className="mt-1 h-6 text-xs"
                        >
                          <RotateCcw className="w-3 h-3 mr-1" />
                          Reset
                        </Button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={column.columnRole}
                        onValueChange={(value) => handleRoleChange(column.columnName, value as 'identifier' | 'measure')}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COLUMN_ROLES.map(role => (
                            <SelectItem key={role.value} value={role.value}>
                              {role.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1 flex-wrap">
                        {column.tag === 'previously_used_type' && (
                          <Badge className="bg-[#41C185] text-white text-xs">
                            <History className="w-3 h-3 mr-1" />
                            Previously Used Type
                          </Badge>
                        )}
                        {column.tag === 'previously_used_role' && (
                          <Badge className="bg-[#41C185] text-white text-xs">
                            <History className="w-3 h-3 mr-1" />
                            Previously Used Role
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
                            <Pencil className="w-3 h-3 mr-1" />
                            Edited by User
                          </Badge>
                        )}
                        {column.warning && (
                          <Badge variant="outline" className="text-yellow-700 border-yellow-300 text-xs">
                            <AlertTriangle className="w-3 h-3 mr-1" />
                            Potential Issue
                          </Badge>
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

