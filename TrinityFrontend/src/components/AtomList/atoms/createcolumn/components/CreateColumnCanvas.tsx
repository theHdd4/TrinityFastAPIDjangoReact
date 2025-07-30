
import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Save, Eye, Calculator, Trash2, Plus, ChevronUp, ChevronDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { CREATECOLUMN_API, FEATURE_OVERVIEW_API } from '@/lib/api';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import CreateColumnInputFiles from './CreateColumnInputFiles';

interface Operation {
  id: string;
  type: 'add' | 'subtract' | 'multiply' | 'divide' | 'power' | 'sqrt' | 'log' | 'abs' | 'dummy' | 'rpi' | 'residual' | 'stl_outlier' | 'logistic' | 'detrend' | 'deseasonalize' | 'detrend_deseasonalize' | 'exp' | 'standardize_zscore' | 'standardize_minmax';
  name: string;
  columns?: string[];
  newColumnName: string;
  rename?: string;
  param?: string | number | Record<string, any>;
}

interface CreateColumnCanvasProps {
  atomId: string;
  operations: Operation[];
  sampleData: any[];
  onOperationsChange: (operations: Operation[]) => void;
}

interface PaginationInfo {
  current_page: number;
  page_size: number;
  total_rows: number;
  total_pages: number;
  start_row: number;
  end_row: number;
}

const multiColumnOps = ['add', 'subtract', 'multiply', 'divide', 'dummy', 'rpi'];
const singleColumnOps = ['sqrt', 'log', 'abs', 'power'];

const CreateColumnCanvas: React.FC<CreateColumnCanvasProps> = ({
  atomId,
  operations,
  sampleData,
  onOperationsChange,
}) => {
  const { toast } = useToast();
  // Get columns from atom settings (from selected data source)
  const atom = useLaboratoryStore(state => state.getAtom(atomId));
  const updateSettings = useLaboratoryStore(state => state.updateAtomSettings);
  // Only show numerical columns
  const allColumns: any[] = Array.isArray(atom?.settings?.allColumns) ? atom.settings.allColumns : [];
  const numericalColumns: string[] = allColumns.filter((c: any) =>
    c && typeof c.data_type === 'string' &&
    ['int', 'float', 'number', 'double', 'numeric'].some(type => c.data_type.toLowerCase().includes(type))
  ).map((c: any) => c.column);
  const categoricalColumns: string[] = allColumns.filter((c: any) =>
    c && typeof c.data_type === 'string' &&
    ['object', 'string', 'category', 'bool'].some(type => c.data_type.toLowerCase().includes(type))
  ).map((c: any) => c.column);

  // Helper to get available columns for a specific operation (including created columns from previous operations)
  const getAvailableColumnsForOperation = (operationIndex: number, isNumerical: boolean = true) => {
    const baseColumns = isNumerical ? numericalColumns : categoricalColumns;
    const createdColumns: string[] = [];
    
    // Add output columns from previous operations
    // For categorical operations (like dummy), only include created columns if they are categorical
    for (let i = 0; i < operationIndex; i++) {
      const prevOp = operations[i];
      if (prevOp && prevOp.columns && prevOp.columns.filter(Boolean).length > 0) {
        const outputColName = getOutputColName(prevOp);
        if (outputColName) {
          // For categorical operations, only include created columns if they are categorical
          // For numerical operations, include all created columns
          if (isNumerical || prevOp.type === 'dummy') {
            createdColumns.push(outputColName);
          }
        }
      }
    }
    
    return [...baseColumns, ...createdColumns];
  };

  // Helper to check if a column is created by a previous operation
  const isCreatedColumn = (columnName: string, operationIndex: number) => {
    for (let i = 0; i < operationIndex; i++) {
      const prevOp = operations[i];
      if (prevOp && prevOp.columns && prevOp.columns.filter(Boolean).length > 0) {
        const outputColName = getOutputColName(prevOp);
        if (outputColName === columnName) {
          return true;
        }
      }
    }
    return false;
  };

  // Helper to get the output column name for an operation
  const getOutputColName = (op: Operation) => {
    if (op.rename && op.rename.trim()) return op.rename.trim();
    const columns = op.columns?.filter(Boolean) || [];
    switch (op.type) {
      case 'add': return columns.join('_plus_');
      case 'subtract': return columns.join('_minus_');
      case 'multiply': return columns.join('_times_');
      case 'divide': return columns.join('_dividedby_');
      case 'residual': return `Res_${columns[0] || ''}`;
      case 'dummy': return columns.length > 0 ? `${columns[0]}_dummy` : 'dummy';
      case 'log': return columns.length > 0 ? `${columns[0]}_log` : 'log';
      case 'sqrt': return columns.length > 0 ? `${columns[0]}_sqrt` : 'sqrt';
      case 'exp': return columns.length > 0 ? `${columns[0]}_exp` : 'exp';
      case 'power': return columns.length > 0 && op.param ? `${columns[0]}_power${op.param}` : 'power';
      case 'standardize_zscore': return columns.length > 0 ? `${columns[0]}_zscore_scaled` : 'zscore_scaled';
      case 'standardize_minmax': return columns.length > 0 ? `${columns[0]}_minmax_scaled` : 'minmax_scaled';
      case 'logistic': return columns.length > 0 ? `${columns[0]}_logistic` : 'logistic';
      case 'detrend': return columns.length > 0 ? `${columns[0]}_detrended` : 'detrended';
      case 'deseasonalize': return columns.length > 0 ? `${columns[0]}_deseasonalized` : 'deseasonalized';
      case 'detrend_deseasonalize': return columns.length > 0 ? `${columns[0]}_detrend_deseasonalized` : 'detrend_deseasonalized';
      default: return `${op.type}_${columns.join('_')}`;
    }
  };

  // Helper to check if a column name already exists in the uploaded file
  const isNameInUploadedFile = (name: string) => {
    return allColumns.some((c: any) => c.column === name);
  };

  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, any>[]>([]);
  const [previewHeaders, setPreviewHeaders] = useState<string[]>([]);
  const [previewPagination, setPreviewPagination] = useState<PaginationInfo | null>(null);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [operationsCollapsed, setOperationsCollapsed] = useState(false);
  const [periodPrompt, setPeriodPrompt] = useState<{ opIdx: number, opType: string } | null>(null);
  const [customPeriod, setCustomPeriod] = useState<number>(7);
  const [periodNeeded, setPeriodNeeded] = useState<{ [opId: string]: boolean }>({});
  const [selectedIdentifiers, setSelectedIdentifiers] = useState<string[]>([]);
  const [mongoIdentifiers, setMongoIdentifiers] = useState<string[] | null>(null);
  const [catColumns, setCatColumns] = useState<string[]>([]);
  const [showCatSelector, setShowCatSelector] = useState(false);
  const [identifiersCollapsed, setIdentifiersCollapsed] = useState(false);

  // Clear error when operations change
  React.useEffect(() => {
    setError(null);
  }, [operations]);

  // Fetch identifiers from MongoDB or fallback to categorical columns after file selection
  useEffect(() => {
    async function fetchIdentifiers() {
      setMongoIdentifiers(null);
      setShowCatSelector(false);
      setCatColumns([]);
      setSelectedIdentifiers([]);
      const dataSource = atom?.settings?.dataSource;
      const validator_atom_id = atom?.settings?.validator_atom_id || '';
      if (!dataSource) return;
      try {
        if (validator_atom_id && dataSource) {
          const resp = await fetch(`${CREATECOLUMN_API}/classification?validator_atom_id=${encodeURIComponent(validator_atom_id)}&file_key=${encodeURIComponent(dataSource)}`);
          if (resp.ok) {
            const data = await resp.json();
            setMongoIdentifiers(data.identifiers || []);
            setSelectedIdentifiers(data.identifiers || []);
            setShowCatSelector(false);
            return;
          }
        }
      } catch {}
      // Fallback: fetch columns and filter categorical
      try {
        const res = await fetch(`${FEATURE_OVERVIEW_API}/column_summary?object_name=${encodeURIComponent(dataSource)}`);
        if (res.ok) {
          const data = await res.json();
          const summary = (data.summary || []).filter(Boolean);
          // Exclude 'date' (case-insensitive) from selectable identifiers
          const cats = summary.filter((c: any) =>
            c.data_type && (
              c.data_type.toLowerCase().includes('object') ||
              c.data_type.toLowerCase().includes('string') ||
              c.data_type.toLowerCase().includes('category')
            ) &&
            c.column.toLowerCase() !== 'date'
          ).map((c: any) => c.column);
          setCatColumns(cats);
          setShowCatSelector(true);
          setSelectedIdentifiers(cats);
        }
      } catch {}
    }
    fetchIdentifiers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atom?.settings?.dataSource]);

  // Helper to update columns for an operation
  const updateOperationColumns = (opId: string, newColumns: string[]) => {
    // Always preserve the number of selectors, even if some are empty
    const updated = operations.map(op =>
      op.id === opId ? { ...op, columns: [...newColumns] } : op
    );
    onOperationsChange(updated);
  };

  // Add a new column selector for an operation
  const addColumnSelector = (opId: string) => {
    const op = operations.find(o => o.id === opId);
    if (!op) return;
    const current = op.columns || [];
    updateOperationColumns(opId, [...current, '']);
  };

  // Remove a column selector for an operation
  const removeColumnSelector = (opId: string, idx: number) => {
    const op = operations.find(o => o.id === opId);
    if (!op) return;
    const current = op.columns || [];
    if (current.length <= 1) return; // Always keep at least one
    updateOperationColumns(opId, current.filter((_, i) => i !== idx));
  };

  // Update a specific column selector
  const updateColumnSelector = (opId: string, idx: number, value: string) => {
    const op = operations.find(o => o.id === opId);
    if (!op) return;
    const current = op.columns || [];
    const updated = [...current];
    updated[idx] = value;
    updateOperationColumns(opId, updated);
  };

  // CREATE button handler
  const handleCreate = async () => {
    // Check for duplicate output column names
    const colNames = operations.map(getOutputColName).filter(Boolean);
    const duplicates = colNames.filter((name, idx) => colNames.indexOf(name) !== idx);
    if (duplicates.length > 0) {
      setError(`Duplicate output column name: "${duplicates[0]}". Please use unique names.`);
      return;
    }
    // Check for output column names that already exist in the uploaded file
    const alreadyExists = colNames.find(name => isNameInUploadedFile(name));
    if (alreadyExists) {
      setError(`Column name "${alreadyExists}" already exists in the uploaded file. Please provide a unique name.`);
      return;
    }
    setLoading(true);
    setError(null);
    setPreview([]);
    try {
      // Validate required fields
      if (!atom?.settings?.dataSource) throw new Error('No input file selected.');
      if (!operations.length) throw new Error('No operations selected.');
      // Prepare form data
      const formData = new FormData();
      formData.append('object_names', atom.settings.dataSource);
      formData.append('bucket_name', 'trinity'); // TODO: use actual bucket if needed
      // Add each operation as a key with columns as value
      // Operations are processed sequentially - each operation can use columns created by previous operations
      operations.forEach((op, idx) => {
        if (op.columns && op.columns.filter(Boolean).length > 0) {
          let colString = op.columns.filter(Boolean).join(',');
          let rename = op.rename && op.rename.trim() ? op.rename.trim() : '';
          let key = `${op.type}_${idx}`;
          // For multi-column operations (add, subtract, multiply, divide, residual)
          if (["add", "subtract", "multiply", "divide", "residual"].includes(op.type)) {
            if (op.type === "residual") {
              if (op.columns.filter(Boolean).length >= 2) {
                if (rename) {
                  formData.append(`${key}_rename`, rename);
                }
                formData.append(key, colString);
              }
            } else {
              if (op.columns.filter(Boolean).length >= 2) {
                if (rename) {
                  formData.append(`${key}_rename`, rename);
                }
                formData.append(key, colString);
              }
            }
          } else if (op.type === "stl_outlier") {
            if (op.columns.filter(Boolean).length >= 1) {
              if (rename) {
                formData.append(`${key}_rename`, rename);
              }
              formData.append(key, colString);
            }
          } else if (op.type === 'power') {
            if (op.param) {
              formData.append(`${key}_param`, op.param);
            }
            if (rename) {
              formData.append(`${key}_rename`, rename);
            }
            formData.append(key, colString);
          } else if (op.type === 'logistic') {
            if (op.param) {
              formData.append(`${key}_param`, JSON.stringify(op.param));
            }
            if (rename) {
              formData.append(`${key}_rename`, rename);
            }
            formData.append(key, colString);
          } else {
            // For dummy, rpi, etc., require at least 1 column
            if (rename) {
              formData.append(`${key}_rename`, rename);
            }
            formData.append(key, colString);
          }
          // Add period if user supplied for this op
          if (['detrend', 'deseasonalize', 'detrend_deseasonalize'].includes(op.type) && op.param) {
            formData.append(`${key}_period`, op.param.toString());
          }
        }
      });
      // Save operations order - backend will process operations sequentially
      formData.append('options', operations.map(op => op.type).join(','));
      // In handleCreate, get the latest identifiers from the ref
      console.log('DEBUG: identifiers at perform', selectedIdentifiers);
      formData.append('identifiers', selectedIdentifiers.join(','));
      // Call backend
      const res = await fetch(`${CREATECOLUMN_API}/perform`, {
        method: 'POST',
        body: formData,
      });
      const text = await res.text();
      console.log('Backend response:', text);
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('Backend did not return valid JSON. Response: ' + text.slice(0, 200));
      }
      if (data.status !== 'SUCCESS') {
        if (data.error && data.error.includes('Unsupported or custom frequency')) {
          // Set periodNeeded for all STL ops that don't have a period set
          const stlOps = operations.filter(
            op => ['detrend', 'deseasonalize', 'detrend_deseasonalize'].includes(op.type) && !op.param
          );
          setPeriodNeeded(prev => {
            const updated = { ...prev };
            stlOps.forEach(op => { updated[op.id] = true; });
            return updated;
          });
          setError('The frequency of your data could not be detected. Please enter the period (number of intervals in a season) for your data.');
          return;
        }
        throw new Error(data.error || 'Backend error');
      }
      
      // Save the createResults to atom settings
      if (data.createResults) {
        const currentSettings = atom?.settings || {};
        updateSettings(atomId, {
          ...currentSettings,
          createResults: data.createResults
        });
      }
      
      // Fetch preview
      const previewRes = await fetch(`${CREATECOLUMN_API}/results?object_names=${atom.settings.dataSource}&bucket_name=trinity`);
      const previewText = await previewRes.text();
      console.log('Preview backend response:', previewText);
      let previewData;
      try {
        previewData = JSON.parse(previewText);
      } catch {
        throw new Error('Preview backend did not return valid JSON. Response: ' + previewText.slice(0, 200));
      }
      setPreview(Array.isArray(previewData.create_data) ? previewData.create_data : []);
      toast({ title: 'Success', description: 'Columns created and preview loaded.' });
      // In handleCreate, after a successful perform, set the last used identifiers
      console.log('DEBUG: selectedIdentifiers at perform', selectedIdentifiers);
      // setLastUsedIdentifiers(selectedIdentifiers); // This state is no longer needed
    } catch (e: any) {
      const errorMsg = e?.message || (typeof e === 'string' ? e : 'Failed to create columns');
      setError(errorMsg);
      toast({ title: 'Error', description: errorMsg, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Helper to convert preview data to CSV
  const previewToCSV = (data: any[]): string => {
    if (!data.length) return '';
    const headers = Object.keys(data[0]);
    const rows = data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','));
    return [headers.join(','), ...rows].join('\n');
  };

  // Helper to parse CSV
  const parseCSV = (csvText: string): { headers: string[]; rows: Record<string, any>[] } => {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) return { headers: [], rows: [] };
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    const rows = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const row: Record<string, any> = {};
      headers.forEach((h, i) => {
        const value = values[i] || '';
        const num = parseFloat(value);
        row[h] = !isNaN(num) && value !== '' ? num : value;
      });
      return row;
    });
    return { headers, rows };
  };

  // Fetch paginated preview data
  const fetchPreviewData = async (file: string, page: number = 1) => {
    setPreviewLoading(true);
    try {
      const response = await fetch(
        `${CREATECOLUMN_API}/cached_dataframe?object_name=${encodeURIComponent(file)}&page=${page}&page_size=20`
      );
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const result = await response.json();
      const { headers, rows } = parseCSV(result.data);
      setPreviewData(rows);
      setPreviewHeaders(headers);
      setPreviewPagination(result.pagination);
      setPreviewPage(page);
    } catch (err) {
      setPreviewData([]);
      setPreviewHeaders([]);
      setPreviewPagination(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  // After saving, set previewFile and fetch preview
  React.useEffect(() => {
    if (saveSuccess && previewFile) {
      fetchPreviewData(previewFile, 1);
    }
  }, [saveSuccess, previewFile]);

  // Keep preview data when switching to paginated view
  React.useEffect(() => {
    if (previewFile && previewHeaders.length === 0 && previewData.length === 0 && preview.length > 0) {
      // If we have preview data but no paginated data, keep showing the preview
      // This prevents the results from disappearing when save is clicked
    }
  }, [previewFile, previewHeaders.length, previewData.length, preview.length]);

  // Save DataFrame handler
  const handleSaveDataFrame = async () => {
    setSaveLoading(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const csv_data = previewToCSV(preview);
      const filename = `createcolumn_${atom?.settings?.dataSource?.split('/')?.pop() || 'data'}_${Date.now()}`;
      const response = await fetch(`${CREATECOLUMN_API}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csv_data, filename }),
      });
      if (!response.ok) {
        throw new Error(`Save failed: ${response.statusText}`);
      }
      setSaveSuccess(true);
      setPreviewFile(filename.endsWith('.arrow') ? filename : filename + '.arrow');
      // Don't clear the preview data - keep it visible
      toast({ title: 'Success', description: 'DataFrame saved successfully.' });
    } catch (err: any) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save DataFrame');
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to save DataFrame', variant: 'destructive' });
    } finally {
      setSaveLoading(false);
    }
  };

  const handleIdentifiersChange = (ids: string[]) => {
    console.log('DEBUG: onIdentifiersChange called', ids);
    setSelectedIdentifiers(ids);
  };

  // List of operation types that require identifiers
  const identifierOps = [
    'residual', 'detrend', 'deseasonalize', 'detrend_deseasonalize', 'marketshare', 'kalman_filter', 'standardize_zscore', 'standardize_minmax'
  ];
  const hasIdentifierOp = operations.some(op => identifierOps.includes(op.type));

  if (operations.length === 0) {
    return (
      <Card className="h-full flex items-center justify-center">
        <CardContent className="text-center">
          <Calculator className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Operations Selected</h3>
          <p className="text-gray-600">
            Go to Settings tab to select operations for creating new columns
          </p>
        </CardContent>
      </Card>
    );
  }



  return (
    <div className="space-y-6 h-full">
      {periodPrompt && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white p-6 rounded shadow-lg flex flex-col items-center">
            <h3 className="text-lg font-semibold mb-2">Custom Period Required</h3>
            <p className="mb-4 text-gray-700">The frequency of your data could not be detected. Please enter the period (number of intervals in a season) for your data.</p>
            <input
              type="number"
              min={2}
              value={customPeriod}
              onChange={e => setCustomPeriod(Number(e.target.value))}
              className="border border-gray-300 rounded px-3 py-1 mb-4 w-32 text-center"
            />
            <div className="flex space-x-2">
              <Button
                onClick={() => {
                  setPeriodPrompt(null);
                  handleCreate();
                }}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                Submit
              </Button>
              <Button
                variant="outline"
                onClick={() => setPeriodPrompt(null)}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
{/*
            <button
              className="p-1 rounded hover:bg-green-100 transition-colors"
              onClick={() => setIdentifiersCollapsed(v => !v)}
              aria-label={identifiersCollapsed ? 'Expand identifiers' : 'Collapse identifiers'}
            >
              {identifiersCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
            </button>
          </div>
          {!identifiersCollapsed && (
            <CardContent className="space-y-3 pt-0">
              {mongoIdentifiers && mongoIdentifiers.length > 0 && (
                <div className="p-4 space-y-3 bg-gradient-to-br from-blue-50 to-blue-100 rounded">
                  <div className="font-medium text-blue-700 mb-2">Identifiers (from classification)</div>
                  <div className="flex flex-wrap gap-2">
                    {mongoIdentifiers.map(id => (
                      
                    ))}
                  </div>
                </div>
              )}
              {showCatSelector && catColumns.length > 0 && (
                <div className="p-4 space-y-3 bg-gradient-to-br from-green-50 to-green-100 rounded">
                  <div className="font-medium text-green-700 mb-2">Select Identifiers</div>
                  <div className="flex flex-wrap gap-2">
                    {catColumns.map(col => (
                      <span key={col} className={`inline-block px-3 py-1 rounded font-semibold text-xs cursor-pointer transition-all border border-green-200 ${selectedIdentifiers.includes(col) ? 'bg-green-400 text-white' : 'bg-green-50 text-green-800'}`}
                        onClick={() => {
                          setSelectedIdentifiers(selectedIdentifiers.includes(col) ? selectedIdentifiers.filter(c => c !== col) : [...selectedIdentifiers, col]);
                        }}
                      >
                        {col}
                        <span className="ml-1 text-xs font-bold">×</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}
*/}
      {/* Operations Configuration with Create Button on top right */}
      <Card>
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <div className="flex items-center space-x-2">
            <Calculator className="w-5 h-5 text-green-500" />
            <span className="font-semibold text-base">Operations</span>
            <span className="text-xs text-gray-500">({operations.length})</span>
          </div>
          <button
            className="p-1 rounded hover:bg-green-100 transition-colors"
            onClick={() => setOperationsCollapsed(v => !v)}
            aria-label={operationsCollapsed ? 'Expand operations' : 'Collapse operations'}
          >
            {operationsCollapsed ? <ChevronDown className="w-5 h-5" /> : <ChevronUp className="w-5 h-5" />}
          </button>
        </div>
        {!operationsCollapsed && (
          <CardContent className="space-y-4 pt-0">
          {operations.map((operation, operationIndex) => {
            const opType = operation.type;
            let defaultCols = [''];
            if (["add", "subtract", "multiply", "divide"].includes(opType)) {
              defaultCols = ['', ''];
            }
            // Always use the columns array as-is, preserving empty slots
            const opColumns = Array.isArray(operation.columns) ? operation.columns : defaultCols;
            // Get available columns for this operation (including created columns from previous operations)
            const availableNumericalColumns = getAvailableColumnsForOperation(operationIndex, true);
            const availableCategoricalColumns = getAvailableColumnsForOperation(operationIndex, false);
            // Show error if the output column name already exists in the uploaded file
            const outputColName = getOutputColName(operation);
            const nameExists = isNameInUploadedFile(outputColName);
            // Only show error if all required columns are selected and outputColName is not empty
            const allColumnsSelected = Array.isArray(operation.columns) && operation.columns.length > 0 && operation.columns.every(col => col && col.trim() !== '');
            const showNameExistsError = nameExists && allColumnsSelected && outputColName;

            // Parameter input fields for new operations
            const showPowerParam = opType === 'power';
            const showLogisticParam = opType === 'logistic';
            // Only allow rename for standardize if one column is selected
            const isStandardize = opType.startsWith('standardize');
            const allowRename = !isStandardize || (opColumns.length === 1);

            return (
              <div key={operation.id} className="p-2 border border-blue-200 rounded-lg bg-gray-50 mb-1 flex items-center space-x-3">
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 min-w-[90px] text-center flex-shrink-0">
                    {operation.name}
                  </Badge>
                <div className="flex items-center space-x-2 flex-1 min-w-0 overflow-x-auto px-2 custom-scrollbar">
                  {operation.type === 'residual' ? (
                    <>
                      {/* Y Variable selector (no label) */}
                      <Select
                        value={opColumns[0] || ''}
                        onValueChange={value => updateColumnSelector(operation.id, 0, value)}
                      >
                        <SelectTrigger className="w-36">
                          <SelectValue placeholder="Select Y" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableNumericalColumns.map(option => (
                            <SelectItem 
                              key={option} 
                              value={option}
                              className={isCreatedColumn(option, operationIndex) ? "text-blue-600 font-medium" : ""}
                            >
                              {option}
                              {isCreatedColumn(option, operationIndex) && " (created)"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {/* X Variable selectors (always show at least one if Y is selected) */}
                      {opColumns[0] && (
                        <>
                          {(opColumns.length === 1 ? [''] : opColumns.slice(1)).map((col, idx) => (
                            <div key={idx + 1} className="flex items-center space-x-2">
                              <Select
                                value={col}
                                onValueChange={value => updateColumnSelector(operation.id, idx + 1, value)}
                              >
                                <SelectTrigger className="w-36">
                                  <SelectValue placeholder="Select X" />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableNumericalColumns.map(option => (
                                    <SelectItem 
                                      key={option} 
                                      value={option}
                                      className={isCreatedColumn(option, operationIndex) ? "text-blue-600 font-medium" : ""}
                                    >
                                      {option}
                                      {isCreatedColumn(option, operationIndex) && " (created)"}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {/* Bin icon for X variable (if more than one X) */}
                              {opColumns.length > 2 && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => removeColumnSelector(operation.id, idx + 1)}
                                  className="text-red-400 hover:text-red-600"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          ))}
                          {/* Plus button for X variables */}
                          <Button
                            size="icon"
                            variant="outline"
                            className="ml-2"
                            onClick={() => addColumnSelector(operation.id)}
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      {opColumns.map((col, idx) => (
                        <div key={idx} className="flex items-center space-x-2">
                          <Select
                            value={col}
                            onValueChange={value => updateColumnSelector(operation.id, idx, value)}
                          >
                            <SelectTrigger className="w-36">
                              <SelectValue placeholder={`Select column ${idx + 1}`} />
                            </SelectTrigger>
                            <SelectContent>
                              {(operation.type === 'dummy' ? availableCategoricalColumns : availableNumericalColumns).map(option => (
                                <SelectItem 
                                  key={option} 
                                  value={option}
                                  className={isCreatedColumn(option, operationIndex) ? "text-blue-600 font-medium" : ""}
                                >
                                  {option}
                                  {isCreatedColumn(option, operationIndex) && " (created)"}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {opColumns.length > (multiColumnOps.includes(opType) ? 2 : 1) && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => removeColumnSelector(operation.id, idx)}
                              className="text-red-400 hover:text-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                      {multiColumnOps.includes(opType) && (
                        <Button
                          size="icon"
                          variant="outline"
                          className="ml-2"
                          onClick={() => addColumnSelector(operation.id)}
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                      )}
                    </>
                  )}
                </div>
                {/* Parameter input for power */}
                {showPowerParam && (
                  <input
                    type="number"
                    step="any"
                    value={operation.param || ''}
                    onChange={e => {
                      const updated = operations.map(op =>
                        op.id === operation.id ? { ...op, param: e.target.value } : op
                      );
                      onOperationsChange(updated);
                    }}
                    placeholder="Exponent"
                    className="ml-2 px-2 py-1 border border-blue-200 rounded text-sm w-24 flex-shrink-0"
                    style={{ minWidth: 0 }}
                  />
                )}
                {/* Parameter inputs for logistic */}
                {showLogisticParam && (
                  <div className="flex items-center space-x-1 ml-2">
                    <input
                      type="number"
                      step="any"
                      value={operation.param?.gr || ''}
                      onChange={e => {
                        const updated = operations.map(op =>
                          op.id === operation.id ? { ...op, param: { ...op.param, gr: e.target.value } } : op
                        );
                        onOperationsChange(updated);
                      }}
                      placeholder="gr"
                      className="px-2 py-1 border border-blue-200 rounded text-sm w-16 flex-shrink-0"
                      style={{ minWidth: 0 }}
                    />
                    <input
                      type="number"
                      step="any"
                      value={operation.param?.co || ''}
                      onChange={e => {
                        const updated = operations.map(op =>
                          op.id === operation.id ? { ...op, param: { ...op.param, co: e.target.value } } : op
                        );
                        onOperationsChange(updated);
                      }}
                      placeholder="co"
                      className="px-2 py-1 border border-blue-200 rounded text-sm w-16 flex-shrink-0"
                      style={{ minWidth: 0 }}
                    />
                    <input
                      type="number"
                      step="any"
                      value={operation.param?.mp || ''}
                      onChange={e => {
                        const updated = operations.map(op =>
                          op.id === operation.id ? { ...op, param: { ...op.param, mp: e.target.value } } : op
                        );
                        onOperationsChange(updated);
                      }}
                      placeholder="mp"
                      className="px-2 py-1 border border-blue-200 rounded text-sm w-16 flex-shrink-0"
                      style={{ minWidth: 0 }}
                    />
                  </div>
                )}
                {['detrend', 'deseasonalize', 'detrend_deseasonalize'].includes(opType) && periodNeeded[operation.id] && (
                  <input
                    type="number"
                    min={2}
                    value={operation.param || ''}
                    onChange={e => {
                      const updated = operations.map(op =>
                        op.id === operation.id ? { ...op, param: e.target.value } : op
                      );
                      onOperationsChange(updated);
                    }}
                    placeholder="Period"
                    className="ml-2 px-2 py-1 border border-blue-200 rounded text-sm w-24 flex-shrink-0"
                    style={{ minWidth: 0 }}
                  />
                )}
                {/* Rename input just before the bin icon */}
                {allowRename && (
                  <input
                    type="text"
                    value={operation.rename || ''}
                    onChange={e => {
                      const updated = operations.map(op =>
                        op.id === operation.id ? { ...op, rename: e.target.value } : op
                      );
                      onOperationsChange(updated);
                    }}
                    placeholder="Rename column (optional)"
                    className="ml-2 px-2 py-1 border border-blue-200 rounded text-sm w-40 flex-shrink-0"
                    style={{ minWidth: 0 }}
                  />
                )}
                {showNameExistsError && (
                  <span className="text-red-500 text-xs ml-2">Name already exists in file</span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onOperationsChange(operations.filter(op => op.id !== operation.id))}
                  className="text-red-500 hover:text-red-700 flex-shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            );
          })}
          {/* Create Button inside the grid, left-aligned */}
          <div className="flex justify-start items-center space-x-4 mt-2">
            {error && <span className="text-red-500 text-sm">{error}</span>}
            <Button onClick={handleCreate} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white">
              {loading ? 'Performing...' : 'Perform'}
            </Button>
          </div>
        </CardContent>
        )}
        {/* Custom scrollbar styles for operation row */}
        <style>{`
          .custom-scrollbar::-webkit-scrollbar {
            height: 10px;
            background: #f0fdf4;
            border-radius: 8px;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #bbf7d0;
            border-radius: 8px;
            border: 2px solid #f0fdf4;
          }
          .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #86efac;
          }
          .custom-scrollbar {
            scrollbar-color: #bbf7d0 #f0fdf4;
            scrollbar-width: thin;
          }
        `}</style>
      </Card>
      {/* Add a loading spinner for paginated preview */}
      {previewFile && previewLoading && (
        <div className="flex items-center justify-center p-8">
          <svg className="animate-spin h-8 w-8 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
          </svg>
          <span className="ml-2 text-blue-600">Loading preview...</span>
        </div>
      )}

      {/* Create Column Results */}
      {(preview.length > 0 || (previewFile && previewHeaders.length > 0 && previewData.length > 0) || (previewFile && preview.length > 0)) && !previewLoading && (
        <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm overflow-hidden">
          <div className="bg-gradient-to-r from-green-500 to-green-600 p-1">
            <div className="bg-white rounded-sm">
              <div className="p-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <div className="w-1 h-8 bg-gradient-to-b from-green-500 to-green-600 rounded-full mr-4"></div>
                    <h3 className="text-xl font-bold text-gray-900">Results</h3>
                    {preview.length > 0 && (
                      <Badge variant="outline" className="bg-green-50 border-green-200 text-green-700 ml-3">
                        {preview.length.toLocaleString()} rows • {Object.keys(preview[0] || {}).length} columns
                      </Badge>
                    )}
                    {previewHeaders.length > 0 && previewData.length > 0 && (
                      <Badge variant="outline" className="bg-green-50 border-green-200 text-green-700 ml-3">
                        {previewData.length.toLocaleString()} rows • {previewHeaders.length} columns
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center">
                    <Button
                      onClick={handleSaveDataFrame}
                      disabled={saveLoading}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {saveLoading ? 'Saving...' : 'Save DataFrame'}
                    </Button>
                    {saveError && <span className="text-red-600 text-sm ml-2">{saveError}</span>}
                    {saveSuccess && <span className="text-green-600 text-sm ml-2">Saved!</span>}
                  </div>
                </div>

                {((!previewFile && preview.length > 0) || (previewFile && preview.length > 0 && previewHeaders.length === 0)) && (
                  <div className="rounded-md border border-green-100">
                    <Table className="min-w-full" maxHeight="max-h-96">
                      <TableHeader>
                        <TableRow>
                          {Object.keys(preview[0]).map((header, index) => (
                            <TableHead key={index} className="sticky top-0 z-30 bg-green-50 border-b border-green-200 font-bold text-gray-800 text-center py-4">{header}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.slice(0, 20).map((row, rowIndex) => (
                          <TableRow
                            key={rowIndex}
                            className="bg-white hover:bg-gray-50 transition-all duration-200 border-b border-gray-100"
                          >
                            {Object.keys(row).map((header, colIndex) => (
                              <TableCell key={colIndex} className="py-4 text-center font-medium text-gray-700">
                                {row[header] !== null && row[header] !== undefined && row[header] !== '' ? (
                                  typeof row[header] === 'number' ? row[header] : String(row[header])
                                ) : (
                                  <Badge variant="outline" className="text-gray-500">null</Badge>
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="text-sm text-gray-500 mt-2">Showing first 20 rows of {preview.length} total rows</div>
                  </div>
                )}
                
                {(previewFile && previewHeaders.length > 0 && previewData.length > 0) && (
                  <div className="rounded-md border border-green-100">
                    <Table className="min-w-full" maxHeight="max-h-96">
                      <TableHeader>
                        <TableRow>
                          {previewHeaders.map((header, index) => (
                            <TableHead key={index} className="sticky top-0 z-30 bg-green-50 border-b border-green-200 font-bold text-gray-800 text-center py-4">{header}</TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {previewData.map((row, rowIndex) => (
                          <TableRow
                            key={rowIndex}
                            className="bg-white hover:bg-gray-50 transition-all duration-200 border-b border-gray-100"
                          >
                            {previewHeaders.map((header, colIndex) => (
                              <TableCell key={colIndex} className="py-4 text-center font-medium text-gray-700">
                                {row[header] !== null && row[header] !== undefined && row[header] !== '' ? (
                                  typeof row[header] === 'number' ? row[header] : String(row[header])
                                ) : (
                                  <Badge variant="outline" className="text-gray-500">null</Badge>
                                )}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Pagination */}
      {previewPagination && previewPagination.total_pages > 1 && (
        <Card className="border-0 shadow-xl bg-white/80 backdrop-blur-sm overflow-hidden">
          <div className="bg-gradient-to-r from-gray-500 to-gray-600 p-1">
            <div className="bg-white rounded-sm">
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    Page {previewPagination.current_page} of {previewPagination.total_pages}
                  </div>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => fetchPreviewData(previewFile!, Math.max(1, previewPagination.current_page - 1))}
                          className={previewPagination.current_page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                      {Array.from({ length: Math.min(5, previewPagination.total_pages) }, (_, i) => {
                        let pageNum;
                        if (previewPagination.total_pages <= 5) {
                          pageNum = i + 1;
                        } else if (previewPagination.current_page <= 3) {
                          pageNum = i + 1;
                        } else if (previewPagination.current_page >= previewPagination.total_pages - 2) {
                          pageNum = previewPagination.total_pages - 4 + i;
                        } else {
                          pageNum = previewPagination.current_page - 2 + i;
                        }
                        return (
                          <PaginationItem key={pageNum}>
                            <PaginationLink
                              onClick={() => fetchPreviewData(previewFile!, pageNum)}
                              isActive={previewPagination.current_page === pageNum}
                              className="cursor-pointer"
                            >
                              {pageNum}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      })}
                      <PaginationItem>
                        <PaginationNext
                          onClick={() => fetchPreviewData(previewFile!, Math.min(previewPagination.total_pages, previewPagination.current_page + 1))}
                          className={previewPagination.current_page === previewPagination.total_pages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* If paginated preview fails, show error and fallback
      {previewFile && !previewLoading && previewHeaders.length === 0 && (
        <div className="p-4 text-center text-red-600">Failed to load paginated preview. Showing last previewed data.</div>
      )} */}
    </div>
  );
};

export default CreateColumnCanvas;