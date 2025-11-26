import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { SingleSelectDropdown } from '@/templates/dropdown';
import { Plus, Minus, X, Divide, Circle, BarChart3, Calculator, TrendingDown, Activity, Calendar, ChevronDown, ChevronRight, Trash2, AlertCircle } from 'lucide-react';
import { useLaboratoryStore } from '../../../store/laboratoryStore';
import { FEATURE_OVERVIEW_API, CREATECOLUMN_API } from '@/lib/api';
import { resolveTaskResponse } from '@/lib/taskQueue';
import { useToast } from '@/hooks/use-toast';

const operationTypes = [
  { type: 'add', name: 'Addition', icon: Plus, description: 'Add two or more columns' },
  { type: 'subtract', name: 'Subtraction', icon: Minus, description: 'Subtract two or more columns' },
  { type: 'multiply', name: 'Multiplication', icon: X, description: 'Multiply two or more columns' },
  { type: 'divide', name: 'Division', icon: Divide, description: 'Divide two or more columns' },
  { type: 'dummy', name: 'Indicator Variable', icon: Circle, description: 'Create indicator variables (0/1) for categorical columns' },
  { type: 'rpi', name: 'RPI', icon: BarChart3, description: 'Relative Price Index calculation' },
  { type: 'residual', name: 'Residual', icon: TrendingDown, description: 'Calculate residuals (target vs predictors)' },
  { type: 'stl_outlier', name: 'STL Outlier', icon: Activity, description: 'Detect outliers using STL decomposition' },
  { type: 'detrend', name: 'Detrend', icon: TrendingDown, description: 'Remove trend from a column using STL decomposition' },
  { type: 'deseasonalize', name: 'Deseasonalize', icon: TrendingDown, description: 'Remove seasonality from a column using STL decomposition' },
  { type: 'detrend_deseasonalize', name: 'Detrend & Deseasonalize', icon: TrendingDown, description: 'Remove both trend and seasonality from a column using STL decomposition' },
  { type: 'power', name: 'Power', icon: Activity, description: 'Raise column(s) to a power (requires exponent parameter)' },
  { type: 'log', name: 'Log', icon: Activity, description: 'Natural logarithm of column(s)' },
  { type: 'sqrt', name: 'Square Root', icon: Activity, description: 'Square root of column(s)' },
  { type: 'exp', name: 'Exponential', icon: Activity, description: 'Exponential of column(s)' },
  { type: 'standardize_zscore', name: 'Standardize (Z-Score)', icon: Activity, description: 'Standardize column(s) using Z-Score' },
  { type: 'standardize_minmax', name: 'Standardize (Min-Max)', icon: Activity, description: 'Standardize column(s) using Min-Max scaling' },
  { type: 'logistic', name: 'Logistic', icon: Activity, description: 'Apply logistic transformation (requires gr, co, mp parameters)' },
  { type: 'datetime', name: 'DateTime Extract', icon: Calendar, description: 'Extract datetime components (year, month, week, day) from date column' },
];

const multiColumnOps = ['add', 'subtract', 'multiply', 'divide', 'dummy', 'rpi'];

const MetricsColOps: React.FC = () => {
  const [search, setSearch] = React.useState('');
  const [isOpen, setIsOpen] = React.useState(true);
  const [allColumns, setAllColumns] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<any[]>([]);
  const [previewFile, setPreviewFile] = React.useState<string | null>(null);
  const [saveLoading, setSaveLoading] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [showSaveModal, setShowSaveModal] = React.useState(false);
  const [saveFileName, setSaveFileName] = React.useState('');
  const [showOverwriteConfirmDialog, setShowOverwriteConfirmDialog] = React.useState(false);
  const [selectedIdentifiers, setSelectedIdentifiers] = React.useState<string[]>([]);
  const { toast } = useToast();
  const metricsInputs = useLaboratoryStore(state => state.metricsInputs);
  const selectedOperations = metricsInputs.operations;
  const addMetricsOperation = useLaboratoryStore(state => state.addMetricsOperation);
  const updateMetricsOperation = useLaboratoryStore(state => state.updateMetricsOperation);
  const removeMetricsOperation = useLaboratoryStore(state => state.removeMetricsOperation);

  const filteredOperationTypes = operationTypes.filter(op =>
    op.name.toLowerCase().includes(search.toLowerCase()) ||
    op.description.toLowerCase().includes(search.toLowerCase())
  );

  // Helper function to filter out date-related columns
  const filterDateColumns = (columns: string[]): string[] => {
    const dateKeywords = ['date', 'dates', 'year', 'month', 'week', 'day', 'day_name', 'month_name'];
    return columns.filter(id => {
      const idLower = (id || '').trim().toLowerCase();
      // Exclude exact matches for date keywords
      return !dateKeywords.includes(idLower);
    });
  };

  // Fetch identifiers from MongoDB or fallback to categorical columns after file selection
  React.useEffect(() => {
    async function fetchIdentifiers() {
      setSelectedIdentifiers([]);
      const dataSource = metricsInputs.dataSource;
      if (!dataSource) return;
      
      // Extract client/app/project from file path like createcolumn does
      const pathParts = dataSource.split('/');
      const clientName = pathParts[0] ?? '';
      const appName = pathParts[1] ?? '';
      const projectName = pathParts[2] ?? '';
      
      try {
        if (clientName && appName && projectName) {
          const resp = await fetch(`${CREATECOLUMN_API}/identifier_options?client_name=${encodeURIComponent(clientName)}&app_name=${encodeURIComponent(appName)}&project_name=${encodeURIComponent(projectName)}`);
          if (resp.ok) {
            const data = await resp.json();
            if (Array.isArray(data.identifiers) && data.identifiers.length > 0) {
              // Filter out all date-related columns from MongoDB/Redis identifiers
              const filteredIdentifiers = filterDateColumns(data.identifiers || []);
              setSelectedIdentifiers(filteredIdentifiers);
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
          setSelectedIdentifiers(filteredCats);
        }
      } catch {}
    }
    fetchIdentifiers();
  }, [metricsInputs.dataSource]);

  // Fetch columns when dataSource changes
  React.useEffect(() => {
    const fetchColumns = async () => {
      if (!metricsInputs.dataSource) {
        setAllColumns([]);
        return;
      }

      try {
        const res = await fetch(`${FEATURE_OVERVIEW_API}/column_summary?object_name=${encodeURIComponent(metricsInputs.dataSource)}`);
        if (res.ok) {
          const raw = await res.json();
          const data = await resolveTaskResponse<{ summary?: any[] }>(raw);
          const summary = (data.summary || []).filter(Boolean);
          setAllColumns(summary);
        }
      } catch (error) {
        console.error('Failed to fetch columns', error);
        setAllColumns([]);
      }
    };

    fetchColumns();
  }, [metricsInputs.dataSource]);

  const numericalColumns: string[] = allColumns.filter((c: any) =>
    c && typeof c.data_type === 'string' &&
    ['int', 'float', 'number', 'double', 'numeric'].some(type => c.data_type.toLowerCase().includes(type))
  ).map((c: any) => c.column);

  const categoricalColumns: string[] = allColumns.filter((c: any) =>
    c && typeof c.data_type === 'string' &&
    ['object', 'string', 'category', 'bool'].some(type => c.data_type.toLowerCase().includes(type))
  ).map((c: any) => c.column);

  const allAvailableColumns: string[] = allColumns.map((c: any) => c.column).filter(Boolean);

  const handleOperationClick = (opType: typeof operationTypes[0]) => {
    const defaultCols = ["add", "subtract", "multiply", "divide"].includes(opType.type) ? ['', ''] : [''];
    const newOperation = {
      id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: opType.type,
      name: opType.name,
      columns: defaultCols,
      rename: '',
    };
    addMetricsOperation(newOperation);
  };

  const updateOperationColumns = (opId: string, newColumns: string[]) => {
    updateMetricsOperation(opId, { columns: [...newColumns] });
  };

  const addColumnSelector = (opId: string) => {
    const op = selectedOperations.find(o => o.id === opId);
    if (!op) return;
    const current = op.columns || [];
    updateOperationColumns(opId, [...current, '']);
  };

  const removeColumnSelector = (opId: string, idx: number) => {
    const op = selectedOperations.find(o => o.id === opId);
    if (!op) return;
    const current = op.columns || [];
    if (current.length <= 1) return;
    updateOperationColumns(opId, current.filter((_, i) => i !== idx));
  };

  const updateColumnSelector = (opId: string, idx: number, value: string) => {
    const op = selectedOperations.find(o => o.id === opId);
    if (!op) return;
    const current = op.columns || [];
    const updated = [...current];
    updated[idx] = value;
    updateOperationColumns(opId, updated);
  };

  const removeOperation = (opId: string) => {
    removeMetricsOperation(opId);
  };

  const getAvailableColumns = (opType: string) => {
    if (opType === 'dummy') return categoricalColumns;
    if (opType === 'datetime') return allAvailableColumns;
    return numericalColumns;
  };

  // Helper to get the output column name for an operation
  const getOutputColName = (op: typeof selectedOperations[0]) => {
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

  // Helper to convert preview data to CSV
  const previewToCSV = (data: any[]): string => {
    if (!data.length) return '';
    const headers = Object.keys(data[0]);
    const rows = data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','));
    return [headers.join(','), ...rows].join('\n');
  };

  // Perform operations (internal function that returns preview data)
  const performOperations = async (): Promise<any[]> => {
    // Check for duplicate output column names
    const colNames = selectedOperations.map(getOutputColName).filter(Boolean);
    const duplicates = colNames.filter((name, idx) => colNames.indexOf(name) !== idx);
    if (duplicates.length > 0) {
      throw new Error(`Duplicate output column name: "${duplicates[0]}". Please use unique names.`);
    }
    // Check for output column names that already exist in the uploaded file
    const alreadyExists = colNames.find(name => isNameInUploadedFile(name));
    if (alreadyExists) {
      throw new Error(`Column name "${alreadyExists}" already exists in the uploaded file. Please provide a unique name.`);
    }
    setError(null);
    try {
      // Validate required fields
      if (!metricsInputs.dataSource) throw new Error('No input file selected.');
      if (!selectedOperations.length) throw new Error('No operations selected.');
      // Prepare form data
      const formData = new FormData();
      formData.append('object_names', metricsInputs.dataSource);
      formData.append('bucket_name', 'trinity');
      // Add each operation as a key with columns as value
      let operationsAdded = 0;
      selectedOperations.forEach((op, idx) => {
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
              formData.append(`${key}_param`, op.param.toString());
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
      
      // Validate that at least one operation was added
      if (operationsAdded === 0) {
        throw new Error('No valid operations to perform. Please ensure all operations have the required columns selected.');
      }
      
      // Save operations order
      const addedOperationTypes = selectedOperations
        .map((op, idx) => {
          return op.type;
        })
        .filter((type, idx) => {
          const op = selectedOperations[idx];
          if (!op.columns || op.columns.filter(Boolean).length === 0) return false;
          
          if (["add", "subtract", "multiply", "divide", "residual"].includes(op.type)) {
            return op.columns.filter(Boolean).length >= 2;
          } else if (op.type === "stl_outlier") {
            return op.columns.filter(Boolean).length >= 1;
          }
          return true;
        });
      
      formData.append('options', addedOperationTypes.join(','));
      
      // Filter out datetime-extracted columns from identifiers (year, month, week, day, day_name, month_name)
      const datetimeSuffixes = ['_year', '_month', '_week', '_day', '_day_name', '_month_name'];
      const filteredIdentifiers = selectedIdentifiers.filter(id => {
        const idLower = id.toLowerCase();
        // Exclude 'date' and any columns ending with datetime suffixes
        if (idLower === 'date') return false;
        return !datetimeSuffixes.some(suffix => idLower.endsWith(suffix));
      });
      
      formData.append('identifiers', filteredIdentifiers.join(','));
      
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
          throw new Error('The frequency of your data could not be detected. Please enter the period (number of intervals in a season) for your data.');
        }
        throw new Error(data.error || 'Backend error');
      }
      
      // Store preview data
      if (data.results && Array.isArray(data.results)) {
        setPreview(data.results);
        if (data.result_file) {
          setPreviewFile(data.result_file);
        }
        return data.results;
      } else {
        console.warn('⚠️ No results in perform response:', data);
        setPreview([]);
        return [];
      }
    } catch (e: any) {
      const errorMsg = e?.message || (typeof e === 'string' ? e : 'Failed to create columns');
      throw new Error(errorMsg);
    }
  };

  // Save to original file
  const handleSave = async () => {
    if (!metricsInputs.dataSource) {
      toast({ title: 'Error', description: 'No input file found', variant: 'destructive' });
      return;
    }
    setShowOverwriteConfirmDialog(true);
  };

  // Confirm overwrite save
  const confirmOverwriteSave = async () => {
    if (!metricsInputs.dataSource) {
      toast({ title: 'Error', description: 'No input file found', variant: 'destructive' });
      return;
    }
    
    setShowOverwriteConfirmDialog(false);
    setSaveLoading(true);
    setSaveError(null);
    try {
      // First perform operations
      const previewData = await performOperations();
      if (previewData.length === 0) {
        throw new Error('No data to save');
      }
      
      const csv_data = previewToCSV(previewData);
      let filename = metricsInputs.dataSource;
      if (filename.endsWith('.arrow')) {
        filename = filename.replace('.arrow', '');
      }
      
      // Get environment variables
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};
      const stored = localStorage.getItem('current-project');
      const project = stored ? JSON.parse(stored) : {};
      
      // Prepare operation details
      const operation_details = {
        input_file: metricsInputs.dataSource,
        operations: selectedOperations.map(op => {
          let created_column_name = '';
          if (op.rename && op.rename.trim()) {
            created_column_name = op.rename.trim();
          } else {
            created_column_name = getOutputColName(op);
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
      const savedFile = typeof result?.result_file === 'string'
        ? result.result_file
        : filename.endsWith('.arrow')
          ? filename
          : `${filename}.arrow`;
      setPreviewFile(savedFile);
      toast({ title: 'Success', description: 'DataFrame saved successfully.' });
    } catch (err: any) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save DataFrame';
      setSaveError(errorMsg);
      toast({ title: 'Error', description: errorMsg, variant: 'destructive' });
    } finally {
      setSaveLoading(false);
    }
  };

  // Save As - open modal
  const handleSaveAs = () => {
    const defaultFilename = `createcolumn_${metricsInputs.dataSource?.split('/')?.pop() || 'data'}_${Date.now()}`;
    setSaveFileName(defaultFilename);
    setShowSaveModal(true);
  };

  // Confirm Save As
  const confirmSaveDataFrame = async () => {
    setSaveLoading(true);
    setSaveError(null);
    try {
      // First perform operations
      const previewData = await performOperations();
      if (previewData.length === 0) {
        throw new Error('No data to save');
      }
      
      const csv_data = previewToCSV(previewData);
      const filename = saveFileName.trim() || `createcolumn_${metricsInputs.dataSource?.split('/')?.pop() || 'data'}_${Date.now()}`;
      
      // Get environment variables
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};
      const stored = localStorage.getItem('current-project');
      const project = stored ? JSON.parse(stored) : {};
      
      // Prepare operation details
      const operation_details = {
        input_file: metricsInputs.dataSource || 'unknown_input_file',
        operations: selectedOperations.map(op => {
          let created_column_name = '';
          if (op.rename && op.rename.trim()) {
            created_column_name = op.rename.trim();
          } else {
            created_column_name = getOutputColName(op);
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
      const savedFile = typeof result?.result_file === 'string'
        ? result.result_file
        : filename.endsWith('.arrow')
          ? filename
          : `${filename}.arrow`;
      setPreviewFile(savedFile);
      setShowSaveModal(false);
      toast({ title: 'Success', description: 'DataFrame saved successfully.' });
    } catch (err: any) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save DataFrame';
      setSaveError(errorMsg);
      toast({ title: 'Error', description: errorMsg, variant: 'destructive' });
    } finally {
      setSaveLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full relative">
      <div className="flex-1 overflow-y-auto space-y-4 px-2 pb-2">
        <Card className="bg-white">
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CardHeader className="pb-2 pt-3">
            <CollapsibleTrigger asChild>
              <CardTitle className="flex items-center justify-between text-sm font-semibold cursor-pointer hover:bg-gray-50 -mx-4 -my-2 px-4 py-2 rounded transition-colors">
                <div className="flex items-center space-x-2">
                  <Calculator className="w-5 h-5 text-gray-600" />
                  <span>Available Operations</span>
                </div>
                {isOpen ? (
                  <ChevronDown className="w-4 h-4 text-gray-600" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                )}
              </CardTitle>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <Input
                type="text"
                placeholder="Search operations..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="mb-3 h-8 text-xs bg-white border border-gray-200 focus:border-gray-400 focus:ring-gray-100"
              />
              <div className="max-h-48 overflow-y-auto grid grid-cols-2 gap-2 pr-2 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-gray-50 rounded-md">
                {filteredOperationTypes.map((op) => (
                  <div
                    key={op.type}
                    onClick={() => handleOperationClick(op)}
                    className="p-1.5 border border-gray-200 rounded-lg bg-white transition-all cursor-pointer group relative flex items-center space-x-1.5 hover:shadow-md hover:border-gray-300"
                  >
                    <Plus className="w-3 h-3 text-gray-600" />
                    <span className="text-xs font-medium text-gray-900">{op.name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {selectedOperations.length > 0 && (
        <div className="space-y-2">
          {selectedOperations.map((selectedOperation) => {
            const opType = selectedOperation.type;
            const opColumns = selectedOperation.columns || [];
            const showPowerParam = opType === 'power';
            const showLogisticParam = opType === 'logistic';
            const showDatetimeParam = opType === 'datetime';
            const isStandardize = opType.startsWith('standardize');
            const allowRename = !isStandardize || (opColumns.length === 1);

            return (
              <Card key={selectedOperation.id} className="bg-white">
                <CardContent className="pt-2 pb-2">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between pb-1 border-b border-gray-200">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 border border-green-200 text-green-700">
                        {selectedOperation.name}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => removeOperation(selectedOperation.id)}
                        className="h-4 w-4 text-red-500 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-1.5 h-1.5" />
                      </Button>
                    </div>
                    
                    <div className="space-y-1.5">
                      {selectedOperation.type === 'residual' ? (
                        <>
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-600">Y Variable</label>
                            <div className="[&_button]:h-6 [&_button]:text-[10px] [&_button]:max-w-full [&_button]:overflow-hidden [&_button]:text-ellipsis [&_button]:whitespace-nowrap [&_button_span]:overflow-hidden [&_button_span]:text-ellipsis [&_button_span]:whitespace-nowrap min-w-0">
                              <SingleSelectDropdown
                                label=""
                                placeholder="Select Y"
                                value={opColumns[0] || ''}
                                onValueChange={value => updateColumnSelector(selectedOperation.id, 0, value)}
                                options={getAvailableColumns(opType).map(option => ({
                                  value: option,
                                  label: option
                                }))}
                                className="w-full space-y-0"
                              />
                            </div>
                          </div>
                          {opColumns[0] && (
                            <div className="space-y-1">
                              <div className="flex items-center justify-between">
                                <label className="text-[10px] text-gray-600">X Variables</label>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => addColumnSelector(selectedOperation.id)}
                                  className="h-5 w-5"
                                >
                                  <Plus className="w-2.5 h-2.5" />
                                </Button>
                              </div>
                              <div className="grid grid-cols-2 gap-1">
                                {(opColumns.length === 1 ? [''] : opColumns.slice(1)).map((col, idx) => {
                                  const actualIdx = idx + 1;
                                  const xColumns = opColumns.length === 1 ? [''] : opColumns.slice(1);
                                  const isLast = idx === xColumns.length - 1;
                                  const isOddTotal = xColumns.length % 2 === 1;
                                  const shouldSpanFull = isLast && isOddTotal;
                                  
                                  return (
                                    <div key={actualIdx} className={`flex items-center gap-1 ${shouldSpanFull ? 'col-span-2' : ''}`}>
                                      <div className="flex-1 [&_button]:h-6 [&_button]:text-[10px] [&_button]:max-w-full [&_button]:overflow-hidden [&_button]:text-ellipsis [&_button]:whitespace-nowrap [&_button_span]:overflow-hidden [&_button_span]:text-ellipsis [&_button_span]:whitespace-nowrap min-w-0">
                                        <SingleSelectDropdown
                                          label=""
                                          placeholder="Select X"
                                          value={col}
                                          onValueChange={value => updateColumnSelector(selectedOperation.id, actualIdx, value)}
                                          options={getAvailableColumns(opType).map(option => ({
                                            value: option,
                                            label: option
                                          }))}
                                          className="w-full space-y-0"
                                        />
                                      </div>
                                      {opColumns.length > 2 && (
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          onClick={() => removeColumnSelector(selectedOperation.id, actualIdx)}
                                          className="h-4 w-4 text-red-400 hover:text-red-600 flex-shrink-0"
                                        >
                                          <Trash2 className="w-1.5 h-1.5" />
                                        </Button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] text-gray-600">Columns</label>
                              {multiColumnOps.includes(opType) && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => addColumnSelector(selectedOperation.id)}
                                  className="h-5 w-5"
                                >
                                  <Plus className="w-2.5 h-2.5" />
                                </Button>
                              )}
                            </div>
                            <div className="grid grid-cols-2 gap-1">
                              {opColumns.map((col, idx) => {
                                const isLast = idx === opColumns.length - 1;
                                const isOddTotal = opColumns.length % 2 === 1;
                                const shouldSpanFull = isLast && isOddTotal;
                                const isMultiColumn = multiColumnOps.includes(opType);
                                
                                return (
                                  <div key={idx} className={`flex items-center gap-1 ${shouldSpanFull ? 'col-span-2' : ''}`}>
                                    <div className="flex-1 [&_button]:h-6 [&_button]:text-[10px] [&_button]:max-w-full [&_button]:overflow-hidden [&_button]:text-ellipsis [&_button]:whitespace-nowrap [&_button_span]:overflow-hidden [&_button_span]:text-ellipsis [&_button_span]:whitespace-nowrap min-w-0">
                                      <SingleSelectDropdown
                                        label=""
                                        placeholder={`Column ${idx + 1}`}
                                        value={col}
                                        onValueChange={value => updateColumnSelector(selectedOperation.id, idx, value)}
                                        options={getAvailableColumns(opType).map(option => ({
                                          value: option,
                                          label: option
                                        }))}
                                        className="w-full space-y-0"
                                      />
                                    </div>
                                    {opColumns.length > (isMultiColumn ? 2 : 1) && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => removeColumnSelector(selectedOperation.id, idx)}
                                        className="h-4 w-4 text-red-400 hover:text-red-600 flex-shrink-0"
                                      >
                                        <Trash2 className="w-1.5 h-1.5" />
                                      </Button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </>
                      )}
                    </div>

                    {showPowerParam && (
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-600">Exponent</label>
                        <input
                          type="number"
                          step="any"
                          value={selectedOperation.param || ''}
                          onChange={e => {
                            updateMetricsOperation(selectedOperation.id, { param: e.target.value });
                          }}
                          placeholder="Enter exponent"
                          className="w-full px-1.5 py-1 h-6 text-[10px] border border-gray-200 rounded focus:border-gray-400 focus:ring-1 focus:ring-gray-100"
                        />
                      </div>
                    )}

                    {showLogisticParam && (
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-600">Parameters</label>
                        <div className="grid grid-cols-3 gap-1">
                          <input
                            type="number"
                            step="any"
                            value={(selectedOperation.param as Record<string, any>)?.gr || ''}
                            onChange={e => {
                              const currentParam = (selectedOperation.param as Record<string, any>) || {};
                              updateMetricsOperation(selectedOperation.id, { param: { ...currentParam, gr: e.target.value } });
                            }}
                            placeholder="gr"
                            className="px-1.5 py-1 h-6 text-[10px] border border-gray-200 rounded focus:border-gray-400 focus:ring-1 focus:ring-gray-100"
                          />
                          <input
                            type="number"
                            step="any"
                            value={(selectedOperation.param as Record<string, any>)?.co || ''}
                            onChange={e => {
                              const currentParam = (selectedOperation.param as Record<string, any>) || {};
                              updateMetricsOperation(selectedOperation.id, { param: { ...currentParam, co: e.target.value } });
                            }}
                            placeholder="co"
                            className="px-1.5 py-1 h-6 text-[10px] border border-gray-200 rounded focus:border-gray-400 focus:ring-1 focus:ring-gray-100"
                          />
                          <input
                            type="number"
                            step="any"
                            value={(selectedOperation.param as Record<string, any>)?.mp || ''}
                            onChange={e => {
                              const currentParam = (selectedOperation.param as Record<string, any>) || {};
                              updateMetricsOperation(selectedOperation.id, { param: { ...currentParam, mp: e.target.value } });
                            }}
                            placeholder="mp"
                            className="px-1.5 py-1 h-6 text-[10px] border border-gray-200 rounded focus:border-gray-400 focus:ring-1 focus:ring-gray-100"
                          />
                        </div>
                      </div>
                    )}

                    {showDatetimeParam && (
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-600">Component</label>
                        <Select
                          value={(selectedOperation.param as string) || ''}
                          onValueChange={(value) => {
                            updateMetricsOperation(selectedOperation.id, { param: value });
                          }}
                        >
                          <SelectTrigger className="w-full h-6 text-[10px] bg-white">
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
                      </div>
                    )}

                    {allowRename && (
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-600">Rename (optional)</label>
                        <input
                          type="text"
                          value={selectedOperation.rename || ''}
                          onChange={e => {
                            updateMetricsOperation(selectedOperation.id, { rename: e.target.value });
                          }}
                          placeholder="New column name"
                          className="w-full px-1.5 py-1 h-6 text-[10px] border border-gray-200 rounded focus:border-gray-400 focus:ring-1 focus:ring-gray-100"
                        />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      </div>

      {selectedOperations.length > 0 && (
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-2 py-2 z-10">
          {error && (
            <div className="mb-2">
              <span className="text-red-500 text-[10px]">{error}</span>
            </div>
          )}
          <div className="flex gap-2">
            <Button 
              onClick={handleSave} 
              disabled={saveLoading || !metricsInputs.dataSource} 
              className="bg-green-600 hover:bg-green-700 text-white h-6 text-[10px] flex-1"
            >
              {saveLoading ? 'Saving...' : 'Save'}
            </Button>
            <Button 
              onClick={handleSaveAs} 
              disabled={saveLoading || !metricsInputs.dataSource} 
              className="bg-blue-600 hover:bg-blue-700 text-white h-6 text-[10px] flex-1"
            >
              {saveLoading ? 'Saving...' : 'Save As'}
            </Button>
          </div>
        </div>
      )}

      {/* Save As Dialog */}
      <Dialog open={showSaveModal} onOpenChange={setShowSaveModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Save DataFrame</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Filename</label>
              <Input
                value={saveFileName}
                onChange={(e) => setSaveFileName(e.target.value)}
                placeholder="Enter filename"
                className="w-full"
              />
              {saveError && (
                <p className="text-sm text-red-500">{saveError}</p>
              )}
            </div>
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
                  File: {metricsInputs.dataSource || 'Unknown'}
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

export default MetricsColOps;

