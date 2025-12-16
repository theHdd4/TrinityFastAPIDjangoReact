
import React, { useState, useRef, useEffect } from 'react';
import { constructFullPath } from '@/components/TrinityAI/handlers/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { SingleSelectDropdown } from '@/templates/dropdown';
import { Badge } from '@/components/ui/badge';
import { Save, Eye, Calculator, Trash2, Plus, ChevronUp, ChevronDown, AlertCircle } from 'lucide-react';
import Table from "@/templates/tables/table";
import createColumn from "../index";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger, ContextMenuSeparator } from '@/components/ui/context-menu';
import { ArrowUp, ArrowDown, FilterIcon } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import { useLaboratoryStore } from '@/components/LaboratoryMode/store/laboratoryStore';
import { CREATECOLUMN_API, FEATURE_OVERVIEW_API, GROUPBY_API } from '@/lib/api';
import { resolveTaskResponse } from '@/lib/taskQueue';
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
  type: 'add' | 'subtract' | 'multiply' | 'divide' | 'power' | 'sqrt' | 'log' | 'abs' | 'dummy' | 'rpi' | 'residual' | 'stl_outlier' | 'logistic' | 'detrend' | 'deseasonalize' | 'detrend_deseasonalize' | 'exp' | 'standardize_zscore' | 'standardize_minmax' | 'datetime';
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
  const settings = atom?.settings || {};
  const envContext = settings?.envContext;

  const resolveObjectName = React.useCallback(
    (objectName: string): string => {
      if (!objectName) return '';

      if (envContext && envContext.client_name && envContext.app_name && envContext.project_name) {
        const prefix = `${envContext.client_name}/${envContext.app_name}/${envContext.project_name}/`;
        if (objectName.startsWith(prefix)) {
          return objectName;
        }

        const tail = objectName.includes('/') ? objectName.split('/').pop() || objectName : objectName;
        return `${prefix}${tail}`;
      }

      if (!objectName.includes('/')) {
        return constructFullPath(objectName, envContext);
      }

      return objectName;
    },
    [envContext]
  );

  const resolvedDataSource = React.useMemo(
    () => resolveObjectName((settings.file_key as string) || (settings.dataSource as string) || ''),
    [resolveObjectName, settings.file_key, settings.dataSource]
  );
  
  // Get input file name for clickable subtitle
  const inputFileName = resolvedDataSource;

  // Handle opening the input file in a new tab
  const handleViewDataClick = () => {
    if (inputFileName && atomId) {
      window.open(`/dataframe?name=${encodeURIComponent(inputFileName)}`, '_blank');
    }
  };

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
  // All columns for datetime operations (since date columns can have various data types)
  const allAvailableColumns: string[] = allColumns.map((c: any) => c.column).filter(Boolean);

  // Helper to get available columns for a specific operation (including created columns from previous operations)
  const getAvailableColumnsForOperation = (operationIndex: number, isNumerical: boolean = true, includeAllColumns: boolean = false) => {
    const baseColumns = includeAllColumns ? allAvailableColumns : (isNumerical ? numericalColumns : categoricalColumns);
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
          // For datetime operations, include all created columns
          if (includeAllColumns || isNumerical || prevOp.type === 'dummy') {
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
      case 'datetime': {
        if (columns.length > 0 && op.param) {
          const dateCol = columns[0];
          const param = op.param as string;
          if (param === 'to_year') return `${dateCol}_year`;
          if (param === 'to_month') return `${dateCol}_month`;
          if (param === 'to_week') return `${dateCol}_week`;
          if (param === 'to_day') return `${dateCol}_day`;
          if (param === 'to_day_name') return `${dateCol}_day_name`;
          if (param === 'to_month_name') return `${dateCol}_month_name`;
        }
        return 'datetime_extract';
      }
      default: return `${op.type}_${columns.join('_')}`;
    }
  };

  // Helper to check if a column name already exists in the uploaded file
  const isNameInUploadedFile = (name: string) => {
    return allColumns.some((c: any) => c.column === name);
  };

  const [loading, setLoading] = useState(false);
  // Initialize preview from global store
  const [preview, setPreview] = useState<any[]>(() => {
    return settings.createResults?.results || [];
  });
  const [error, setError] = useState<string | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveFileName, setSaveFileName] = useState('');
  const [showOverwriteConfirmDialog, setShowOverwriteConfirmDialog] = useState(false);
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
  // 🔧 CRITICAL FIX: Initialize selectedIdentifiers from atom settings (set by AI) or local state
  const [selectedIdentifiers, setSelectedIdentifiers] = useState<string[]>(() => {
    // First try to get from atom settings (set by AI handler)
    if (atom?.settings?.selectedIdentifiers && Array.isArray(atom.settings.selectedIdentifiers)) {
      return atom.settings.selectedIdentifiers;
    }
    return [];
  });
  const [mongoIdentifiers, setMongoIdentifiers] = useState<string[] | null>(null);
  const [catColumns, setCatColumns] = useState<string[]>([]);
  const [showCatSelector, setShowCatSelector] = useState(false);
  const [identifiersCollapsed, setIdentifiersCollapsed] = useState(false);

  // Cardinality View state
  const [cardinalityData, setCardinalityData] = useState<any[]>([]);
  const [cardinalityLoading, setCardinalityLoading] = useState(false);
  const [cardinalityError, setCardinalityError] = useState<string | null>(null);
  
  // Sorting and filtering state for Cardinality View
  const [sortColumn, setSortColumn] = useState<string>('unique_count');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [columnFilters, setColumnFilters] = useState<Record<string, string[]>>({});
  
  // Pagination state for results
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(20);
  
  // Sync with global store changes
  React.useEffect(() => {
    if (settings.createResults?.results) {
      setPreview(settings.createResults.results);
    }
  }, [settings.createResults?.results]);

  // Sorting and filtering state for results
  const [resultsSortColumn, setResultsSortColumn] = useState<string>('');
  const [resultsSortDirection, setResultsSortDirection] = useState<'asc' | 'desc'>('asc');
  const [resultsColumnFilters, setResultsColumnFilters] = useState<{ [key: string]: string[] }>({});

  // Clear error when operations change
  React.useEffect(() => {
    setError(null);
  }, [operations]);

  // Helper function to filter out date-related columns
  const filterDateColumns = (columns: string[]): string[] => {
    const dateKeywords = ['date', 'dates', 'year', 'month', 'week', 'day', 'day_name', 'month_name'];
    return columns.filter(id => {
      const idLower = (id || '').trim().toLowerCase();
      // Exclude exact matches for date keywords
      return !dateKeywords.includes(idLower);
    });
  };

  // 🔧 CRITICAL FIX: Sync selectedIdentifiers from atom settings (set by AI handler)
  React.useEffect(() => {
    if (atom?.settings?.selectedIdentifiers && Array.isArray(atom.settings.selectedIdentifiers)) {
      setSelectedIdentifiers(atom.settings.selectedIdentifiers);
    }
  }, [atom?.settings?.selectedIdentifiers]);

  // Fetch identifiers from MongoDB or fallback to categorical columns after file selection
  useEffect(() => {
    async function fetchIdentifiers() {
      setMongoIdentifiers(null);
      setShowCatSelector(false);
      setCatColumns([]);
      setSelectedIdentifiers([]);
      const dataSource = resolveObjectName((atom?.settings?.file_key as string) || (atom?.settings?.dataSource as string) || '');
      if (!dataSource) return;
      
      // Extract client/app/project from file path like scope_selector does
      const pathParts = dataSource.split('/')
      const clientName = pathParts[0] ?? ''
      const appName = pathParts[1] ?? ''
      const projectName = pathParts[2] ?? ''
      
      try {
        if (clientName && appName && projectName) {
          const resp = await fetch(`${CREATECOLUMN_API}/identifier_options?client_name=${encodeURIComponent(clientName)}&app_name=${encodeURIComponent(appName)}&project_name=${encodeURIComponent(projectName)}`);
          if (resp.ok) {
            const data = await resp.json();
            if (Array.isArray(data.identifiers) && data.identifiers.length > 0) {
              // Filter out all date-related columns from MongoDB/Redis identifiers
              const filteredIdentifiers = filterDateColumns(data.identifiers || []);
              setMongoIdentifiers(filteredIdentifiers);
              setSelectedIdentifiers(filteredIdentifiers);
              setShowCatSelector(false);
              return;
            }
          }
        }
      } catch {}
      // Fallback: fetch columns and filter categorical
      try {
        const res = await fetch(`${FEATURE_OVERVIEW_API}/column_summary?object_name=${encodeURIComponent(dataSource)}`);
        if (res.ok) {
          const raw = await res.json();
          const data = await resolveTaskResponse<{ summary?: any[] }>(raw);
          const summary = (data.summary || []).filter(Boolean);
          // Get categorical columns and filter out date-related columns
          const cats = summary.filter((c: any) =>
            c.data_type && (
              c.data_type.toLowerCase().includes('object') ||
              c.data_type.toLowerCase().includes('string') ||
              c.data_type.toLowerCase().includes('category')
            )
          ).map((c: any) => (c.column || '').trim());
          const filteredCats = filterDateColumns(cats);
          setCatColumns(filteredCats);
          setShowCatSelector(true);
          setSelectedIdentifiers(filteredCats);
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
      formData.append('object_names', resolvedDataSource);
      formData.append('bucket_name', 'trinity'); // TODO: use actual bucket if needed
      // Add each operation as a key with columns as value
      // Operations are processed sequentially - each operation can use columns created by previous operations
      let operationsAdded = 0; // Track how many operations were actually added
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
                operationsAdded++;
              }
            } else {
              if (op.columns.filter(Boolean).length >= 2) {
                if (rename) {
                  formData.append(`${key}_rename`, rename);
                }
                formData.append(key, colString);
                operationsAdded++;
              }
            }
          } else if (op.type === "stl_outlier") {
            if (op.columns.filter(Boolean).length >= 1) {
              if (rename) {
                formData.append(`${key}_rename`, rename);
              }
              formData.append(key, colString);
              operationsAdded++;
            }
          } else if (op.type === 'power') {
            if (op.param) {
              formData.append(`${key}_param`, op.param);
            }
            if (rename) {
              formData.append(`${key}_rename`, rename);
            }
            formData.append(key, colString);
            operationsAdded++;
          } else if (op.type === 'logistic') {
            if (op.param) {
              formData.append(`${key}_param`, JSON.stringify(op.param));
            }
            if (rename) {
              formData.append(`${key}_rename`, rename);
            }
            formData.append(key, colString);
            operationsAdded++;
          } else if (op.type === 'datetime') {
            if (op.param) {
              formData.append(`${key}_param`, op.param as string);
            }
            if (rename) {
              formData.append(`${key}_rename`, rename);
            }
            formData.append(key, colString);
            operationsAdded++;
          } else {
            // For dummy, rpi, etc., require at least 1 column
            if (rename) {
              formData.append(`${key}_rename`, rename);
            }
            formData.append(key, colString);
            operationsAdded++;
          }
          // Add period if user supplied for this op
          if (['detrend', 'deseasonalize', 'detrend_deseasonalize'].includes(op.type) && op.param) {
            formData.append(`${key}_period`, op.param.toString());
          }
        }
      });
      
      // 🔧 CRITICAL FIX: Validate that at least one operation was added
      if (operationsAdded === 0) {
        throw new Error('No valid operations to perform. Please ensure all operations have the required columns selected.');
      }
      
      // Save operations order - backend will process operations sequentially
      // Only include operations that were actually added
      const addedOperationTypes = operations
        .map((op, idx) => {
          const key = `${op.type}_${idx}`;
          // Check if this operation was added by checking if the key exists in formData
          // We'll use a simpler approach - just use all operations since we validated above
          return op.type;
        })
        .filter((type, idx) => {
          // Filter to only include operations that passed validation
          const op = operations[idx];
          if (!op.columns || op.columns.filter(Boolean).length === 0) return false;
          
          if (["add", "subtract", "multiply", "divide", "residual"].includes(op.type)) {
            return op.columns.filter(Boolean).length >= 2;
          } else if (op.type === "stl_outlier") {
            return op.columns.filter(Boolean).length >= 1;
          }
          return true; // power, logistic, datetime, dummy, rpi, etc. are always added if they have columns
        });
      
      formData.append('options', addedOperationTypes.join(','));
      // 🔧 CRITICAL FIX: Get identifiers from atom settings (set by AI) or local state, ensure it's an array
      const identifiersToUse = atom?.settings?.selectedIdentifiers && Array.isArray(atom.settings.selectedIdentifiers) 
        ? atom.settings.selectedIdentifiers 
        : (Array.isArray(selectedIdentifiers) ? selectedIdentifiers : []);
      formData.append('identifiers', identifiersToUse.join(','));
      
      // Debug logging
      console.log('🔍 Manual Perform - FormData being sent:', {
        object_names: resolvedDataSource,
        bucket_name: 'trinity',
        operations_count: operations.length,
        operations_types: operations.map(op => op.type),
        options: operations.map(op => op.type).join(','),
        identifiers: identifiersToUse,
        identifiers_count: identifiersToUse.length
      });
      // Call backend
      const res = await fetch(`${CREATECOLUMN_API}/perform`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        throw new Error(`Backend error ${res.status}`);
      }
      const raw = await res.json();
      const data = await resolveTaskResponse<Record<string, any>>(raw);
      if (data.status && data.status !== 'SUCCESS') {
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
          createResults: {
            ...data.createResults,
            results: data.results || []
          }
        });
      }
      
      // 🔧 CRITICAL FIX: Display data immediately like GroupBy does
      // The backend now returns the actual data in data.results
      if (data.results && Array.isArray(data.results)) {
        setPreview(data.results);
        
        // Set the preview file for pagination
        if (data.result_file) {
          setPreviewFile(data.result_file);
        }
      } else {
        console.warn('⚠️ No results in perform response:', data);
        setPreview([]);
      }
      
      toast({ title: 'Success', description: 'Columns created and preview loaded.' });
      // In handleCreate, after a successful perform, set the last used identifiers
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
      const payload = await response.json();
      const result = await resolveTaskResponse<{ data: string; pagination: any }>(payload);
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

  // Open save modal with default filename
  const handleSaveDataFrame = () => {
    if (preview.length === 0) return;
    
    // Generate default filename (remove file extension before timestamp)
    const sourceFile = atom?.settings?.dataSource?.split('/')?.pop() || 'data';
    const filenameWithoutExt = sourceFile.includes('.') ? sourceFile.substring(0, sourceFile.lastIndexOf('.')) : sourceFile;
    const defaultFilename = `createcolumn_${filenameWithoutExt}_${Date.now()}`;
    setSaveFileName(defaultFilename);
    setShowSaveModal(true);
  };

  // Actually save the DataFrame with the chosen filename
  const confirmSaveDataFrame = async () => {
    if (preview.length === 0) return;
    
    setSaveLoading(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const csv_data = previewToCSV(preview);
      const filename = saveFileName.trim() || `createcolumn_${atom?.settings?.dataSource?.split('/')?.pop() || 'data'}_${Date.now()}`;
      
      // Get environment variables for MongoDB saving
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};
      const stored = localStorage.getItem('current-project');
      const project = stored ? JSON.parse(stored) : {};
      
      // Prepare operation details for MongoDB
      const operation_details = {
        input_file: atom?.settings?.dataSource || 'unknown_input_file',
        operations: operations.map(op => {
          // Get the actual column name created (either rename or default)
          let created_column_name = '';
          if (op.rename && op.rename.trim()) {
            created_column_name = op.rename.trim();
          } else {
            // Use default naming based on operation type
            const columns = op.columns || [];
            switch (op.type) {
              case 'add': created_column_name = columns.join('_plus_'); break;
              case 'subtract': created_column_name = columns.join('_minus_'); break;
              case 'multiply': created_column_name = columns.join('_times_'); break;
              case 'divide': created_column_name = columns.join('_dividedby_'); break;
              case 'residual': created_column_name = `Res_${columns[0] || ''}`; break;
              case 'dummy': created_column_name = columns.length > 0 ? `${columns[0]}_dummy` : 'dummy'; break;
              case 'log': created_column_name = columns.length > 0 ? `${columns[0]}_log` : 'log'; break;
              case 'sqrt': created_column_name = columns.length > 0 ? `${columns[0]}_sqrt` : 'sqrt'; break;
              case 'exp': created_column_name = columns.length > 0 ? `${columns[0]}_exp` : 'exp'; break;
              case 'power': created_column_name = columns.length > 0 && op.param ? `${columns[0]}_power${op.param}` : 'power'; break;
              case 'standardize_zscore': created_column_name = columns.length > 0 ? `${columns[0]}_zscore_scaled` : 'zscore_scaled'; break;
              case 'standardize_minmax': created_column_name = columns.length > 0 ? `${columns[0]}_minmax_scaled` : 'minmax_scaled'; break;
              case 'logistic': created_column_name = columns.length > 0 ? `${columns[0]}_logistic` : 'logistic'; break;
              case 'detrend': created_column_name = columns.length > 0 ? `${columns[0]}_detrended` : 'detrended'; break;
              case 'deseasonalize': created_column_name = columns.length > 0 ? `${columns[0]}_deseasonalized` : 'deseasonalized'; break;
              case 'detrend_deseasonalize': created_column_name = columns.length > 0 ? `${columns[0]}_detrend_deseasonalized` : 'detrend_deseasonalized'; break;
              case 'datetime': {
                if (columns.length > 0 && op.param) {
                  const dateCol = columns[0];
                  const param = op.param as string;
                  if (param === 'to_year') created_column_name = `${dateCol}_year`;
                  else if (param === 'to_month') created_column_name = `${dateCol}_month`;
                  else if (param === 'to_week') created_column_name = `${dateCol}_week`;
                  else if (param === 'to_day') created_column_name = `${dateCol}_day`;
                  else if (param === 'to_day_name') created_column_name = `${dateCol}_day_name`;
                  else if (param === 'to_month_name') created_column_name = `${dateCol}_month_name`;
                  else created_column_name = 'datetime_extract';
                } else {
                  created_column_name = 'datetime_extract';
                }
                break;
              }
              default: created_column_name = `${op.type}_${columns.join('_')}`; break;
            }
          }
          
          return {
            operation_type: op.type,
            columns: op.columns || [],
            rename: op.rename || null,
            param: op.param || null,
            created_column_name: created_column_name
          };
        })
      };
      
      const response = await fetch(`${CREATECOLUMN_API}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csv_data,
          filename,
          client_name: env.CLIENT_NAME || '',
          app_name: env.APP_NAME || '',
          project_name: env.PROJECT_NAME || '',
          user_id: env.USER_ID || '',
          project_id: project.id || null,
          operation_details: JSON.stringify(operation_details)
        }),
      });
      if (!response.ok) {
        throw new Error(`Save failed: ${response.statusText}`);
      }
      const payload = await response.json();
      const result = await resolveTaskResponse<Record<string, any>>(payload);
      setSaveSuccess(true);
      const savedFile = typeof result?.result_file === 'string'
        ? result.result_file
        : filename.endsWith('.arrow')
          ? filename
          : `${filename}.arrow`;
      setPreviewFile(savedFile);
      setShowSaveModal(false);
      // Don't clear the preview data - keep it visible
      toast({ title: 'Success', description: 'DataFrame saved successfully.' });
    } catch (err: any) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save DataFrame');
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to save DataFrame', variant: 'destructive' });
    } finally {
      setSaveLoading(false);
    }
  };

  // Show confirmation dialog before saving to original file
  const handleSaveToOriginalFile = () => {
    if (preview.length === 0) return;
    if (!atom?.settings?.dataSource) {
      toast({ title: 'Error', description: 'No input file found', variant: 'destructive' });
      return;
    }
    setShowOverwriteConfirmDialog(true);
  };

  // Save to original file (update the input file) - called after confirmation
  const confirmOverwriteSave = async () => {
    if (preview.length === 0) return;
    if (!atom?.settings?.dataSource) {
      toast({ title: 'Error', description: 'No input file found', variant: 'destructive' });
      return;
    }
    
    setShowOverwriteConfirmDialog(false);
    setSaveLoading(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const csv_data = previewToCSV(preview);
      // Use the full original path to overwrite at the original location
      let filename = resolvedDataSource;
      // Remove .arrow extension if present (backend will add it back)
      if (filename.endsWith('.arrow')) {
        filename = filename.replace('.arrow', '');
      }
      
      // Get environment variables for MongoDB saving
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};
      const stored = localStorage.getItem('current-project');
      const project = stored ? JSON.parse(stored) : {};
      
      // Prepare operation details for MongoDB
      const operation_details = {
        input_file: resolvedDataSource,
        operations: operations.map(op => {
          // Get the actual column name created (either rename or default)
          let created_column_name = '';
          if (op.rename && op.rename.trim()) {
            created_column_name = op.rename.trim();
          } else {
            // Use default naming based on operation type
            const columns = op.columns || [];
            switch (op.type) {
              case 'add': created_column_name = columns.join('_plus_'); break;
              case 'subtract': created_column_name = columns.join('_minus_'); break;
              case 'multiply': created_column_name = columns.join('_times_'); break;
              case 'divide': created_column_name = columns.join('_dividedby_'); break;
              case 'residual': created_column_name = `Res_${columns[0] || ''}`; break;
              case 'dummy': created_column_name = columns.length > 0 ? `${columns[0]}_dummy` : 'dummy'; break;
              case 'log': created_column_name = columns.length > 0 ? `${columns[0]}_log` : 'log'; break;
              case 'sqrt': created_column_name = columns.length > 0 ? `${columns[0]}_sqrt` : 'sqrt'; break;
              case 'exp': created_column_name = columns.length > 0 ? `${columns[0]}_exp` : 'exp'; break;
              case 'power': created_column_name = columns.length > 0 && op.param ? `${columns[0]}_power${op.param}` : 'power'; break;
              case 'standardize_zscore': created_column_name = columns.length > 0 ? `${columns[0]}_zscore_scaled` : 'zscore_scaled'; break;
              case 'standardize_minmax': created_column_name = columns.length > 0 ? `${columns[0]}_minmax_scaled` : 'minmax_scaled'; break;
              case 'logistic': created_column_name = columns.length > 0 ? `${columns[0]}_logistic` : 'logistic'; break;
              case 'detrend': created_column_name = columns.length > 0 ? `${columns[0]}_detrended` : 'detrended'; break;
              case 'deseasonalize': created_column_name = columns.length > 0 ? `${columns[0]}_deseasonalized` : 'deseasonalized'; break;
              case 'detrend_deseasonalize': created_column_name = columns.length > 0 ? `${columns[0]}_detrend_deseasonalized` : 'detrend_deseasonalized'; break;
              case 'datetime': {
                if (columns.length > 0 && op.param) {
                  const dateCol = columns[0];
                  const param = op.param as string;
                  if (param === 'to_year') created_column_name = `${dateCol}_year`;
                  else if (param === 'to_month') created_column_name = `${dateCol}_month`;
                  else if (param === 'to_week') created_column_name = `${dateCol}_week`;
                  else if (param === 'to_day') created_column_name = `${dateCol}_day`;
                  else if (param === 'to_day_name') created_column_name = `${dateCol}_day_name`;
                  else if (param === 'to_month_name') created_column_name = `${dateCol}_month_name`;
                  else created_column_name = 'datetime_extract';
                } else {
                  created_column_name = 'datetime_extract';
                }
                break;
              }
              default: created_column_name = `${op.type}_${columns.join('_')}`; break;
            }
          }
          
          return {
            operation_type: op.type,
            columns: op.columns || [],
            rename: op.rename || null,
            param: op.param || null,
            created_column_name: created_column_name
          };
        })
      };
      
      const response = await fetch(`${CREATECOLUMN_API}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csv_data,
          filename,
          client_name: env.CLIENT_NAME || '',
          app_name: env.APP_NAME || '',
          project_name: env.PROJECT_NAME || '',
          user_id: env.USER_ID || '',
          project_id: project.id || null,
          operation_details: JSON.stringify(operation_details),
          overwrite_original: true
        }),
      });
      if (!response.ok) {
        throw new Error(`Save failed: ${response.statusText}`);
      }
      const payload = await response.json();
      const result = await resolveTaskResponse<Record<string, any>>(payload);
      setSaveSuccess(true);
      const savedFile = typeof result?.result_file === 'string'
        ? result.result_file
        : filename.endsWith('.arrow')
          ? filename
          : `${filename}.arrow`;
      setPreviewFile(savedFile);
      // Don't clear the preview data - keep it visible
      toast({ title: 'Success', description: 'Original file updated successfully.' });
    } catch (err: any) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save DataFrame');
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Failed to save DataFrame', variant: 'destructive' });
    } finally {
      setSaveLoading(false);
    }
  };

  const handleIdentifiersChange = (ids: string[]) => {
    setSelectedIdentifiers(ids);
  };

  // List of operation types that require identifiers
  const identifierOps = [
    'residual', 'detrend', 'deseasonalize', 'detrend_deseasonalize', 'marketshare', 'kalman_filter', 'standardize_zscore', 'standardize_minmax'
  ];
  const hasIdentifierOp = operations.some(op => identifierOps.includes(op.type));

  // Fetch cardinality data
  const fetchCardinalityData = async () => {
    const resolvedObjectName = resolveObjectName((atom?.settings?.file_key as string) || (atom?.settings?.dataSource as string) || '');
    if (!resolvedObjectName) return;
    
    setCardinalityLoading(true);
    setCardinalityError(null);
    
    try {
      const url = `${GROUPBY_API}/cardinality?object_name=${encodeURIComponent(resolvedObjectName)}`;
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.status === 'SUCCESS' && data.cardinality) {
        setCardinalityData(data.cardinality);
      } else {
        setCardinalityError(data.error || 'Failed to fetch cardinality data');
      }
    } catch (e: any) {
      setCardinalityError(e.message || 'Error fetching cardinality data');
    } finally {
      setCardinalityLoading(false);
    }
  };

  // Cardinality filtering and sorting logic
  const displayedCardinality = React.useMemo(() => {
    let filtered = Array.isArray(cardinalityData) ? cardinalityData : [];

    // Filter out columns with unique_count = 0 (only exclude zero values)
    filtered = filtered.filter(c => c.unique_count > 0);

    // Apply column filters
    Object.entries(columnFilters).forEach(([column, values]) => {
      if (Array.isArray(values) && values.length > 0) {
        filtered = filtered.filter(item => {
          const itemValue = item[column];
          return values.some(value => 
            String(itemValue).toLowerCase().includes(String(value).toLowerCase())
          );
        });
      }
    });

    // Apply sorting
    if (sortColumn) {
      filtered.sort((a, b) => {
        const aVal = a[sortColumn];
        const bVal = b[sortColumn];
        
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }
        
        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();
        return sortDirection === 'asc' 
          ? aStr.localeCompare(bStr)
          : bStr.localeCompare(aStr);
      });
    }

    return filtered;
  }, [cardinalityData, columnFilters, sortColumn, sortDirection]);

  // Sorting and filtering functions
  const handleSort = (column: string, direction: 'asc' | 'desc') => {
    setSortColumn(column);
    setSortDirection(direction);
  };

  const handleColumnFilter = (column: string, values: string[]) => {
    setColumnFilters(prev => ({
      ...prev,
      [column]: values
    }));
  };

  const clearColumnFilter = (column: string) => {
    setColumnFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[column];
      return newFilters;
    });
  };

  const getUniqueColumnValues = (column: string): string[] => {
    let filteredData = Array.isArray(cardinalityData) ? cardinalityData : [];
    
    // Apply other active filters to get context-aware unique values
    Object.entries(columnFilters).forEach(([filterColumn, values]) => {
      if (filterColumn !== column && Array.isArray(values) && values.length > 0) {
        filteredData = filteredData.filter(item => {
          const itemValue = item[filterColumn];
          return values.some(value => 
            String(itemValue).toLowerCase().includes(String(value).toLowerCase())
          );
        });
      }
    });

    // Filter out columns with unique_count = 0
    filteredData = filteredData.filter(c => c.unique_count > 0);

    const uniqueValues = [...new Set(filteredData.map(item => String(item[column])))];
    return uniqueValues.sort();
  };

  const FilterMenu = ({ column }: { column: string }) => {
    const [temp, setTemp] = useState<string[]>([]);
    const [selectAll, setSelectAll] = useState(false);
    const uniqueValues = getUniqueColumnValues(column);
    const currentFilters = columnFilters[column] || [];

    React.useEffect(() => {
      setTemp(currentFilters);
      setSelectAll(currentFilters.length === uniqueValues.length && uniqueValues.length > 0);
    }, [currentFilters, uniqueValues.length]);

    const handleSelectAll = () => {
      if (selectAll) {
        setTemp([]);
        setSelectAll(false);
      } else {
        setTemp(uniqueValues);
        setSelectAll(true);
      }
    };

    const apply = () => {
      handleColumnFilter(column, temp);
    };

    const cancel = () => {
      setTemp(currentFilters);
      setSelectAll(currentFilters.length === uniqueValues.length && uniqueValues.length > 0);
    };

    return (
      <div className="p-3 max-h-64 overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <Checkbox
            checked={selectAll}
            onCheckedChange={handleSelectAll}
          />
          <span className="text-sm font-medium">Select All</span>
        </div>
        <div className="space-y-1 mb-3">
          {uniqueValues.map(value => (
            <div key={value} className="flex items-center space-x-2">
              <Checkbox
                checked={temp.includes(value)}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setTemp([...temp, value]);
                  } else {
                    setTemp(temp.filter(v => v !== value));
                  }
                }}
              />
              <span className="text-sm">{value}</span>
            </div>
          ))}
        </div>
        <div className="flex space-x-2">
          <Button size="sm" onClick={apply} className="flex-1">
            Apply
          </Button>
          <Button size="sm" variant="outline" onClick={cancel} className="flex-1">
            Cancel
          </Button>
        </div>
      </div>
    );
  };

  // Fetch cardinality data on mount or when dataSource changes
  React.useEffect(() => {
    if (atom?.settings?.dataSource) {
      fetchCardinalityData();
    }
  }, [atom?.settings?.dataSource]);

  // Filtering and sorting logic for results (applied to whole dataset)
  const allFilteredResults = React.useMemo(() => {
    if (preview.length === 0) return [];
    
    let filtered = [...preview];
    
    // Apply column filters
    Object.entries(resultsColumnFilters).forEach(([column, filterValues]) => {
      if (Array.isArray(filterValues) && filterValues.length > 0) {
        filtered = filtered.filter(row => 
          filterValues.includes(String(row[column] || ''))
        );
      }
    });
    
    // Apply sorting
    if (resultsSortColumn) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[resultsSortColumn];
        const bVal = b[resultsSortColumn];
        
        // Handle null/undefined values
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return resultsSortDirection === 'asc' ? 1 : -1;
        if (bVal == null) return resultsSortDirection === 'asc' ? -1 : 1;
        
        // Handle numeric values
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return resultsSortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }
        
        // Handle string values
        const aStr = String(aVal).toLowerCase();
        const bStr = String(bVal).toLowerCase();
        return resultsSortDirection === 'asc' 
          ? aStr.localeCompare(bStr)
          : bStr.localeCompare(aStr);
      });
    }
    
    return filtered;
  }, [preview, resultsColumnFilters, resultsSortColumn, resultsSortDirection]);

  // Pagination logic for results
  const displayedResults = React.useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return allFilteredResults.slice(startIndex, endIndex);
  }, [allFilteredResults, currentPage, pageSize]);

  const totalPages = Math.ceil(allFilteredResults.length / pageSize);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handleResultsSort = (column: string, direction?: 'asc' | 'desc') => {
    if (resultsSortColumn === column) {
      if (resultsSortDirection === 'asc') {
        setResultsSortDirection('desc');
      } else if (resultsSortDirection === 'desc') {
        setResultsSortColumn('');
        setResultsSortDirection('asc');
      }
    } else {
      setResultsSortColumn(column);
      setResultsSortDirection(direction || 'asc');
    }
  };

  const handleResultsColumnFilter = (column: string, values: string[]) => {
    setResultsColumnFilters(prev => ({
      ...prev,
      [column]: values
    }));
  };

  const clearResultsColumnFilter = (column: string) => {
    setResultsColumnFilters(prev => {
      const cpy = { ...prev };
      delete cpy[column];
      return cpy;
    });
  };

  const getResultsUniqueColumnValues = (column: string): string[] => {
    if (!preview.length) return [];

    // Apply other active filters to get hierarchical filtering
    const otherFilters = Object.entries(resultsColumnFilters).filter(([key]) => key !== column);
    let dataToUse = preview;

    if (otherFilters.length > 0) {
      dataToUse = preview.filter(item => {
        return otherFilters.every(([filterColumn, filterValues]) => {
          if (!Array.isArray(filterValues) || filterValues.length === 0) return true;
          const cellValue = String(item[filterColumn] || '');
          return filterValues.includes(cellValue);
        });
      });
    }

    const values = dataToUse.map(item => String(item[column] || ''));
    const uniqueValues = Array.from(new Set(values));
    return uniqueValues.sort() as string[];
  };

  const ResultsFilterMenu = ({ column }: { column: string }) => {
    const uniqueValues = getResultsUniqueColumnValues(column);
    const current = resultsColumnFilters[column] || [];
    const [temp, setTemp] = useState<string[]>(current);

    const toggleVal = (val: string) => {
      setTemp(prev => (prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]));
    };

    const selectAll = () => {
      setTemp(temp.length === uniqueValues.length ? [] : uniqueValues);
    };

    const apply = () => {
      handleResultsColumnFilter(column, temp);
      setCurrentPage(1); // Reset to first page when filtering
    };

    return (
      <div className="w-64 max-h-80 overflow-y-auto">
        <div className="p-2 border-b">
          <div className="flex items-center space-x-2 mb-2">
            <Checkbox checked={temp.length === uniqueValues.length} onCheckedChange={selectAll} />
            <span className="text-sm font-medium">Select All</span>
          </div>
        </div>
        <div className="p-2 space-y-1">
          {uniqueValues.map((v, i) => (
            <div key={i} className="flex items-center space-x-2">
              <Checkbox checked={temp.includes(v)} onCheckedChange={() => toggleVal(v)} />
              <span className="text-sm">{v}</span>
            </div>
          ))}
        </div>
        <div className="p-2 border-t flex space-x-2">
          <Button size="sm" onClick={apply}>Apply</Button>
          <Button size="sm" variant="outline" onClick={() => setTemp(current)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  };

  // Reset to first page when new results are loaded
  React.useEffect(() => {
    setCurrentPage(1);
  }, [preview]);

  // Show placeholder when no data source is selected
  if (!atom?.settings?.dataSource) {
    return (
      <div className="w-full h-full p-6 bg-gradient-to-br from-slate-50 via-green-50/30 to-green-50/50 overflow-y-auto relative">
        <div className="absolute inset-0 opacity-20">
          <svg width="80" height="80" viewBox="0 0 80 80" className="absolute inset-0 w-full h-full">
            <defs>
              <pattern id="emptyGrid" width="80" height="80" patternUnits="userSpaceOnUse">
                <path d="M 80 0 L 0 0 0 80" fill="none" stroke="rgb(148 163 184 / 0.15)" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#emptyGrid)" />
          </svg>
        </div>

        <div className="relative z-10 flex items-center justify-center h-full">
          <div className="text-center max-w-md">
            <div className="w-24 h-24 mx-auto mb-8 rounded-2xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-2xl transform rotate-3 hover:rotate-0 transition-transform duration-300">
              <Plus className="w-12 h-12 text-white drop-shadow-lg" />
            </div>
            <h3 className="text-3xl font-bold text-gray-900 mb-3 bg-gradient-to-r from-green-500 to-green-600 bg-clip-text text-transparent">
              Create Column Operation
            </h3>
            <p className="text-gray-600 mb-6 text-lg font-medium leading-relaxed">
              Select a data source from the properties panel to get started
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 h-full">
      {/* Cardinality View - Show immediately after dataset input */}
      {atom?.settings?.dataSource && (
        <div className="space-y-4">
          {cardinalityLoading && (
            <div className="flex items-center justify-center p-8">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500 mx-auto mb-2"></div>
                <span className="text-green-600">Loading cardinality data...</span>
              </div>
            </div>
          )}
          
          {cardinalityError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-md">
              <p className="text-red-600 text-sm">Error loading cardinality data: {cardinalityError}</p>
            </div>
          )}
          
          {!cardinalityLoading && !cardinalityError && displayedCardinality.length > 0 && (
            <Table
              headers={[
                <ContextMenu key="Column">
                  <ContextMenuTrigger asChild>
                    <div className="flex items-center gap-1 cursor-pointer">
                      Column
                      {sortColumn === 'column' && (
                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                      )}
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                    <ContextMenuSub>
                      <ContextMenuSubTrigger className="flex items-center">
                        <ArrowUp className="w-4 h-4 mr-2" /> Sort
                      </ContextMenuSubTrigger>
                      <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                        <ContextMenuItem onClick={() => handleSort('column', 'asc')}>
                          <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => handleSort('column', 'desc')}>
                          <ArrowDown className="w-4 h-4 mr-2" /> Descending
                        </ContextMenuItem>
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuSeparator />
                    <ContextMenuSub>
                      <ContextMenuSubTrigger className="flex items-center">
                        <FilterIcon className="w-4 h-4 mr-2" /> Filter
                      </ContextMenuSubTrigger>
                      <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md p-0">
                        <FilterMenu column="column" />
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                    {columnFilters['column']?.length > 0 && (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem onClick={() => clearColumnFilter('column')}>
                          Clear Filter
                        </ContextMenuItem>
                      </>
                    )}
                  </ContextMenuContent>
                </ContextMenu>,
                <ContextMenu key="Data type">
                  <ContextMenuTrigger asChild>
                    <div className="flex items-center gap-1 cursor-pointer">
                      Data type
                      {sortColumn === 'data_type' && (
                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                      )}
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                    <ContextMenuSub>
                      <ContextMenuSubTrigger className="flex items-center">
                        <ArrowUp className="w-4 h-4 mr-2" /> Sort
                      </ContextMenuSubTrigger>
                      <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                        <ContextMenuItem onClick={() => handleSort('data_type', 'asc')}>
                          <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => handleSort('data_type', 'desc')}>
                          <ArrowDown className="w-4 h-4 mr-2" /> Descending
                        </ContextMenuItem>
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuSeparator />
                    <ContextMenuSub>
                      <ContextMenuSubTrigger className="flex items-center">
                        <FilterIcon className="w-4 h-4 mr-2" /> Filter
                      </ContextMenuSubTrigger>
                      <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md p-0">
                        <FilterMenu column="data_type" />
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                    {columnFilters['data_type']?.length > 0 && (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem onClick={() => clearColumnFilter('data_type')}>
                          Clear Filter
                        </ContextMenuItem>
                      </>
                    )}
                  </ContextMenuContent>
                </ContextMenu>,
                <ContextMenu key="Unique count">
                  <ContextMenuTrigger asChild>
                    <div className="flex items-center gap-1 cursor-pointer">
                      Unique count
                      {sortColumn === 'unique_count' && (
                        sortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                      )}
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                    <ContextMenuSub>
                      <ContextMenuSubTrigger className="flex items-center">
                        <ArrowUp className="w-4 h-4 mr-2" /> Sort
                      </ContextMenuSubTrigger>
                      <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                        <ContextMenuItem onClick={() => handleSort('unique_count', 'asc')}>
                          <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => handleSort('unique_count', 'desc')}>
                          <ArrowDown className="w-4 h-4 mr-2" /> Descending
                        </ContextMenuItem>
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                    <ContextMenuSeparator />
                    <ContextMenuSub>
                      <ContextMenuSubTrigger className="flex items-center">
                        <FilterIcon className="w-4 h-4 mr-2" /> Filter
                      </ContextMenuSubTrigger>
                      <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md p-0">
                        <FilterMenu column="unique_count" />
                      </ContextMenuSubContent>
                    </ContextMenuSub>
                    {columnFilters['unique_count']?.length > 0 && (
                      <>
                        <ContextMenuSeparator />
                        <ContextMenuItem onClick={() => clearColumnFilter('unique_count')}>
                          Clear Filter
                        </ContextMenuItem>
                      </>
                    )}
                  </ContextMenuContent>
                </ContextMenu>,
                "Sample values"
              ]}
              colClasses={["w-[30%]", "w-[20%]", "w-[15%]", "w-[35%]"]}
              bodyClassName="max-h-[484px] overflow-y-auto"
              defaultMinimized={true}
              borderColor={`border-${createColumn.color.replace('bg-', '')}`}
              customHeader={{
                title: "Data Summary",
                subtitle: "Data in detail",
                subtitleClickable: !!inputFileName && !!atomId,
                onSubtitleClick: handleViewDataClick
              }}
            >
              {displayedCardinality.map((col, index) => (
                <tr key={index} className="table-row">
                  <td className="table-cell">{col.column || col.Column || ''}</td>
                  <td className="table-cell">{col.data_type || col.Data_Type || ''}</td>
                  <td className="table-cell">{col.unique_count || col.Unique_Count || 0}</td>
                  <td className="table-cell">
                    <div className="flex flex-wrap items-center gap-1">
                      {Array.isArray(col.unique_values) && col.unique_values.length > 0 ? (
                        <>
                          {col.unique_values.slice(0, 2).map((val: any, i: number) => (
                            <span
                              key={i}
                              className="inline-block bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs mr-1 mb-1"
                            >
                              {String(val)}
                            </span>
                          ))}
                          {col.unique_values.length > 2 && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="flex items-center gap-0.5 text-xs text-slate-600 font-medium cursor-pointer">
                                  <Plus className="w-3 h-3" />
                                  {col.unique_values.length - 2} more
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="text-xs max-w-xs whitespace-pre-wrap">
                                {col.unique_values
                                  .slice(2)
                                  .map((val: any) => String(val))
                                  .join(', ')}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>
      )}

      {/* Show operations message if no operations selected */}
      {operations.length === 0 && (
        <Card className="h-full flex items-center justify-center">
          <CardContent className="text-center">
            <Calculator className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Operations Selected</h3>
            <p className="text-gray-600">
              Go to Settings tab to select operations for creating new columns
            </p>
          </CardContent>
        </Card>
      )}
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
            const availableAllColumns = getAvailableColumnsForOperation(operationIndex, true, true);
            // Show error if the output column name already exists in the uploaded file
            const outputColName = getOutputColName(operation);
            const nameExists = isNameInUploadedFile(outputColName);
            // Only show error if all required columns are selected and outputColName is not empty
            const allColumnsSelected = Array.isArray(operation.columns) && operation.columns.length > 0 && operation.columns.every(col => col && col.trim() !== '');
            const showNameExistsError = nameExists && allColumnsSelected && outputColName;

            // Parameter input fields for new operations
            const showPowerParam = opType === 'power';
            const showLogisticParam = opType === 'logistic';
            const showDatetimeParam = opType === 'datetime';
            // Only allow rename for standardize if one column is selected
            const isStandardize = opType.startsWith('standardize');
            const allowRename = !isStandardize || (opColumns.length === 1);

            return (
              <div key={operation.id} className="p-2 border border-blue-200 rounded-lg bg-gray-50 mb-1 flex items-center space-x-3">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 border border-green-200 text-green-700 min-w-[90px] text-center flex-shrink-0">
                    {operation.name}
                  </span>
                <div className="flex items-center space-x-2 flex-1 min-w-0 overflow-x-auto px-2 custom-scrollbar">
                  {operation.type === 'residual' ? (
                    <>
                      {/* Y Variable selector (no label) */}
                      <SingleSelectDropdown
                        label=""
                        placeholder="Select Y"
                        value={opColumns[0] || ''}
                        onValueChange={value => updateColumnSelector(operation.id, 0, value)}
                        options={availableNumericalColumns.map(option => ({
                          value: option,
                          label: `${option}${isCreatedColumn(option, operationIndex) ? " (created)" : ""}`
                        }))}
                        className="w-36"
                      />
                      {/* X Variable selectors (always show at least one if Y is selected) */}
                      {opColumns[0] && (
                        <>
                          {(opColumns.length === 1 ? [''] : opColumns.slice(1)).map((col, idx) => (
                            <div key={idx + 1} className="flex items-center space-x-2">
                              <SingleSelectDropdown
                                label=""
                                placeholder="Select X"
                                value={col}
                                onValueChange={value => updateColumnSelector(operation.id, idx + 1, value)}
                                options={availableNumericalColumns.map(option => ({
                                  value: option,
                                  label: `${option}${isCreatedColumn(option, operationIndex) ? " (created)" : ""}`
                                }))}
                                className="w-36"
                              />
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
                          <SingleSelectDropdown
                            label=""
                            placeholder={`Select column ${idx + 1}`}
                            value={col}
                            onValueChange={value => updateColumnSelector(operation.id, idx, value)}
                            options={(operation.type === 'dummy' ? availableCategoricalColumns : operation.type === 'datetime' ? availableAllColumns : availableNumericalColumns).map(option => ({
                              value: option,
                              label: `${option}${isCreatedColumn(option, operationIndex) ? " (created)" : ""}`
                            }))}
                            className="w-36"
                          />
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
                {/* Parameter select for datetime */}
                {showDatetimeParam && (
                  <Select
                    value={operation.param as string || ''}
                    onValueChange={(value) => {
                      const updated = operations.map(op =>
                        op.id === operation.id ? { ...op, param: value } : op
                      );
                      onOperationsChange(updated);
                    }}
                  >
                    <SelectTrigger className="w-40 ml-2 bg-white">
                      <SelectValue placeholder="Select component" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="to_year">Year</SelectItem>
                      <SelectItem value="to_month">Month</SelectItem>
                      <SelectItem value="to_week">Week</SelectItem>
                      <SelectItem value="to_day">Day</SelectItem>
                      <SelectItem value="to_day_name">Day Name</SelectItem>
                      <SelectItem value="to_month_name">Month Name</SelectItem>
                    </SelectContent>
                  </Select>
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
        <div className="p-4">
                {((!previewFile && preview.length > 0) || (previewFile && preview.length > 0 && previewHeaders.length === 0)) && (
                  <Table
                    headers={Object.keys(preview[0] || {}).map(header => (
                      <ContextMenu key={header}>
                        <ContextMenuTrigger asChild>
                          <div className="flex items-center gap-1 cursor-pointer">
                            {header}
                            {resultsSortColumn === header && (
                              resultsSortDirection === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                            )}
                          </div>
                        </ContextMenuTrigger>
                        <ContextMenuContent className="w-48 bg-white border border-gray-200 shadow-lg rounded-md">
                          <ContextMenuSub>
                            <ContextMenuSubTrigger className="flex items-center">
                              <ArrowUp className="w-4 h-4 mr-2" /> Sort
                            </ContextMenuSubTrigger>
                            <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md">
                              <ContextMenuItem onClick={() => handleResultsSort(header, 'asc')}>
                                <ArrowUp className="w-4 h-4 mr-2" /> Ascending
                              </ContextMenuItem>
                              <ContextMenuItem onClick={() => handleResultsSort(header, 'desc')}>
                                <ArrowDown className="w-4 h-4 mr-2" /> Descending
                              </ContextMenuItem>
                            </ContextMenuSubContent>
                          </ContextMenuSub>
                          <ContextMenuSeparator />
                          <ContextMenuSub>
                            <ContextMenuSubTrigger className="flex items-center">
                              <FilterIcon className="w-4 h-4 mr-2" /> Filter
                            </ContextMenuSubTrigger>
                            <ContextMenuSubContent className="bg-white border border-gray-200 shadow-lg rounded-md p-0">
                              <ResultsFilterMenu column={header} />
                            </ContextMenuSubContent>
                          </ContextMenuSub>
                          {resultsColumnFilters[header]?.length > 0 && (
                            <>
                              <ContextMenuSeparator />
                              <ContextMenuItem onClick={() => clearResultsColumnFilter(header)}>
                                Clear Filter
                              </ContextMenuItem>
                            </>
                          )}
                        </ContextMenuContent>
                      </ContextMenu>
                    ))}
                    colClasses={Object.keys(preview[0] || {}).map(() => "w-auto")}
                    bodyClassName="max-h-[400px] overflow-y-auto"
                    borderColor={`border-${createColumn.color.replace('bg-', '')}`}
                    customHeader={{
                      title: "Results",
                      controls: (
                        <>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 border border-green-200 text-green-700">
                            {allFilteredResults.length.toLocaleString()} rows • {Object.keys(preview[0] || {}).length} columns
                          </span>
                          <Button
                            onClick={handleSaveToOriginalFile}
                            disabled={saveLoading}
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            {saveLoading ? 'Saving...' : 'Save'}
                          </Button>
                          <Button
                            onClick={handleSaveDataFrame}
                            disabled={saveLoading}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            {saveLoading ? 'Saving...' : 'Save As'}
                          </Button>
                          {saveError && <span className="text-red-600 text-sm ml-2">{saveError}</span>}
                          {saveSuccess && <span className="text-green-600 text-sm ml-2">Saved!</span>}
                        </>
                      )
                    }}
                  >
                    {displayedResults.map((row, rowIndex) => (
                      <tr key={rowIndex} className="table-row">
                        {Object.keys(row).map((header, colIndex) => (
                          <td key={colIndex} className="table-cell">
                            {row[header] !== null && row[header] !== undefined && row[header] !== '' ? (
                              typeof row[header] === 'number' ? row[header] : String(row[header])
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">null</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Table>
                )}
                
                {/* Pagination for main results */}
                {((!previewFile && preview.length > 0) || (previewFile && preview.length > 0 && previewHeaders.length === 0)) && totalPages > 1 && (
                  <Card className="mt-4">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="text-sm text-gray-600">
                          Page {currentPage} of {totalPages}
                        </div>
                        <Pagination>
                          <PaginationContent>
                            <PaginationItem>
                              <PaginationPrevious
                                onClick={() => handlePageChange(Math.max(1, currentPage - 1))}
                                className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                              />
                            </PaginationItem>
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                              let pageNum;
                              if (totalPages <= 5) {
                                pageNum = i + 1;
                              } else if (currentPage <= 3) {
                                pageNum = i + 1;
                              } else if (currentPage >= totalPages - 2) {
                                pageNum = totalPages - 4 + i;
                              } else {
                                pageNum = currentPage - 2 + i;
                              }
                              return (
                                <PaginationItem key={pageNum}>
                                  <PaginationLink
                                    onClick={() => handlePageChange(pageNum)}
                                    isActive={currentPage === pageNum}
                                    className="cursor-pointer"
                                  >
                                    {pageNum}
                                  </PaginationLink>
                                </PaginationItem>
                              );
                            })}
                            <PaginationItem>
                              <PaginationNext
                                onClick={() => handlePageChange(Math.min(totalPages, currentPage + 1))}
                                className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                              />
                            </PaginationItem>
                          </PaginationContent>
                        </Pagination>
                      </div>
                    </CardContent>
                  </Card>
                )}
                
                {(previewFile && previewHeaders.length > 0 && previewData.length > 0) && (
                  <Table
                    headers={previewHeaders.map(header => (
                      <div key={header} className="flex items-center gap-1">
                        {header}
                      </div>
                    ))}
                    colClasses={previewHeaders.map(() => "w-auto")}
                    bodyClassName="max-h-[400px] overflow-y-auto"
                    borderColor={`border-${createColumn.color.replace('bg-', '')}`}
                    customHeader={{
                      title: "Results",
                      controls: (
                        <>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 border border-green-200 text-green-700">
                            {previewData.length.toLocaleString()} rows • {previewHeaders.length} columns
                          </span>
                          <Button
                            onClick={handleSaveToOriginalFile}
                            disabled={saveLoading}
                            className="bg-green-600 hover:bg-green-700 text-white"
                          >
                            {saveLoading ? 'Saving...' : 'Save'}
                          </Button>
                          <Button
                            onClick={handleSaveDataFrame}
                            disabled={saveLoading}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            {saveLoading ? 'Saving...' : 'Save As'}
                          </Button>
                          {saveError && <span className="text-red-600 text-sm ml-2">{saveError}</span>}
                          {saveSuccess && <span className="text-green-600 text-sm ml-2">Saved!</span>}
                        </>
                      )
                    }}
                  >
                    {previewData.map((row, rowIndex) => (
                      <tr key={rowIndex} className="table-row">
                        {previewHeaders.map((header, colIndex) => (
                          <td key={colIndex} className="table-cell">
                            {row[header] !== null && row[header] !== undefined && row[header] !== '' ? (
                              typeof row[header] === 'number' ? row[header] : String(row[header])
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">null</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Table>
                )}
        </div>
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

      {/* Save DataFrame Modal */}
      <Dialog open={showSaveModal} onOpenChange={setShowSaveModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Save DataFrame</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium text-gray-700 mb-2 block">
              File Name
            </label>
            <Input
              value={saveFileName}
              onChange={(e) => setSaveFileName(e.target.value)}
              placeholder="Enter file name"
              className="w-full"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && saveFileName.trim()) {
                  confirmSaveDataFrame();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSaveModal(false)}
              disabled={saveLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmSaveDataFrame}
              disabled={saveLoading || !saveFileName.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {saveLoading ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Overwrite Confirmation Dialog */}
      <Dialog open={showOverwriteConfirmDialog} onOpenChange={setShowOverwriteConfirmDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Confirm Overwrite</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm text-gray-700 mb-2">
                  Are you sure you want to save the changes to the original file?
                </p>
                <p className="text-sm font-medium text-gray-900 mb-1">
                  File: {atom?.settings?.dataSource || 'Unknown'}
                </p>
                <p className="text-xs text-gray-600">
                  This action will overwrite the original file and cannot be undone.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowOverwriteConfirmDialog(false)}
              disabled={saveLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmOverwriteSave}
              disabled={saveLoading}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {saveLoading ? 'Saving...' : 'Yes, Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CreateColumnCanvas;