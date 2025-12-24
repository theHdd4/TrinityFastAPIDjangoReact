import React, { useImperativeHandle } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { SingleSelectDropdown } from '@/templates/dropdown';
import MultiSelectDropdown from '@/templates/dropdown/multiselect/MultiSelectDropdown';
import { Plus, Minus, X, Divide, Circle, BarChart3, Calculator, TrendingDown, Activity, Calendar, ChevronDown, ChevronRight, Trash2, AlertCircle, Hash, Type, Filter, Users, TrendingUp, Clock, FileText, FunctionSquare, HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useLaboratoryStore, LayoutCard } from '../../../store/laboratoryStore';
import { FEATURE_OVERVIEW_API, CREATECOLUMN_API, PIPELINE_API } from '@/lib/api';
import { resolveTaskResponse } from '@/lib/taskQueue';
import { useToast } from '@/hooks/use-toast';
import { atoms as allAtoms } from "@/components/AtomList/data";

// Operation type definition
interface OperationType {
  type: string;
  name: string;
  icon: any;
  description: string;
}

// Category definition
interface OperationCategory {
  name: string;
  icon: any;
  color: string;
  operations: OperationType[];
}

// All operations - keeping existing ones exactly the same
const allOperations: OperationType[] = [
  // Numeric (existing)
  { type: 'add', name: 'Addition', icon: Plus, description: 'Add two or more columns' },
  { type: 'subtract', name: 'Subtraction', icon: Minus, description: 'Subtract two or more columns' },
  { type: 'multiply', name: 'Multiplication', icon: X, description: 'Multiply two or more columns' },
  { type: 'divide', name: 'Division', icon: Divide, description: 'Divide two or more columns' },
  { type: 'power', name: 'Power', icon: Activity, description: 'Raise column(s) to a power (requires exponent parameter)' },
  { type: 'log', name: 'Log', icon: Activity, description: 'Natural logarithm of column(s)' },
  { type: 'exp', name: 'Exponential', icon: Activity, description: 'Exponential of column(s)' },
  { type: 'sqrt', name: 'Square Root', icon: Activity, description: 'Square root of column(s)' },
  { type: 'logistic', name: 'Logistic', icon: Activity, description: 'Apply logistic transformation (requires gr, co, mp parameters)' },
  { type: 'dummy', name: 'Indicator Variable', icon: Circle, description: 'Create indicator variables (0/1) for categorical columns' },
  // Numeric (new placeholders)
  { type: 'pct_change', name: '% Change', icon: TrendingUp, description: 'Calculate percentage change' },
  
  // String Ops (placeholders)
  // { type: 'concat', name: 'Concat', icon: Type, description: 'Concatenate string columns' },
  { type: 'lower', name: 'Lower', icon: Type, description: 'Convert to lowercase' },
  { type: 'upper', name: 'Upper', icon: Type, description: 'Convert to uppercase' },
  { type: 'strip', name: 'Strip', icon: Type, description: 'Strip whitespace' },
  { type: 'replace', name: 'Replace', icon: Type, description: 'Replace text in strings' },
  { type: 'fill_na', name: 'Fill NA', icon: Type, description: 'Fill missing values with different methods' },
  
  // Conditional & boolean (placeholders) - COMMENTED OUT: No backend implementation
  // { type: 'if_then_else', name: 'If Then Else', icon: Filter, description: 'Conditional logic' },
  // { type: 'multiple_conditions', name: 'Multiple Conditions', icon: Filter, description: 'Multiple conditional logic' },
  // { type: 'in_list_flag', name: 'In List Flag', icon: Filter, description: 'Check if column is in list' },
  // { type: 'between_flag', name: 'Between Flag', icon: Filter, description: 'Check if value is between two values' },
  
  // Grouped metrics (placeholders)
  { type: 'compute_metrics_within_group', name: 'Compute Metrics Within Group', icon: Users, description: 'Compute metrics within groups (sum, mean, median, max, min, count, nunique, rank, rank_pct)' },
  // { type: 'group_sum', name: 'Group Sum', icon: Users, description: 'Sum within groups' },
  // { type: 'group_mean', name: 'Group Mean', icon: Users, description: 'Mean within groups' },
  // { type: 'group_median', name: 'Group Median', icon: Users, description: 'Median within groups' },
  // { type: 'group_min', name: 'Group Min', icon: Users, description: 'Min within groups' },
  // { type: 'group_max', name: 'Group Max', icon: Users, description: 'Max within groups' },
  // { type: 'group_count', name: 'Group Count', icon: Users, description: 'Count within groups' },
  // { type: 'group_nunique', name: 'Group Nunique', icon: Users, description: 'Number of unique values within groups' },
  { type: 'group_share_of_total', name: 'Group Share of Total', icon: Users, description: 'Column / Group Sum(Column)' },
  // { type: 'group_rank_within', name: 'Group Rank Within', icon: Users, description: 'Rank within groups' },
  // { type: 'group_percentile_rank', name: 'Group Percentile Rank', icon: Users, description: 'Percentile rank within groups' },
  { type: 'group_contribution', name: 'Group Contribution', icon: Users, description: '(Group Sum / Overall Sum) × 100' },
  
  // Time series and window functions (placeholders)
  { type: 'lag', name: 'Lag', icon: Clock, description: 'Lag values by periods' },
  { type: 'lead', name: 'Lead', icon: Clock, description: 'Lead values by periods' },
  { type: 'diff', name: 'Diff', icon: Clock, description: 'Difference between periods' },
  { type: 'growth_rate', name: 'Growth Rate', icon: Clock, description: 'Calculate growth rate' },
  { type: 'rolling_mean', name: 'Rolling Mean', icon: Clock, description: 'Rolling mean' },
  { type: 'rolling_sum', name: 'Rolling Sum', icon: Clock, description: 'Rolling sum' },
  { type: 'rolling_min', name: 'Rolling Min', icon: Clock, description: 'Rolling min' },
  { type: 'rolling_max', name: 'Rolling Max', icon: Clock, description: 'Rolling max' },
  { type: 'cumulative_sum', name: 'Cumulative Sum', icon: Clock, description: 'Cumulative sum' },
  
  // Date and calendar helpers (existing + placeholders)
  { type: 'datetime', name: 'DateTime Extract', icon: Calendar, description: 'Extract datetime components (year, month, week, day) from date column' },
  { type: 'fiscal_mapping', name: 'Fiscal Mapping', icon: Calendar, description: 'Map to fiscal periods' },
  { type: 'is_weekend', name: 'Is Weekend', icon: Calendar, description: 'Check if date is weekend' },
  { type: 'is_month_end', name: 'Is Month End', icon: Calendar, description: 'Check if date is month end' },
  { type: 'is_qtr_end', name: 'Is Qtr End', icon: Calendar, description: 'Check if date is quarter end' },
  { type: 'date_builder', name: 'Date Builder', icon: Calendar, description: 'Build date from components' },
  
  // Row filtering (placeholders)
  { type: 'filter_rows_condition', name: 'Filter Rows Based Condition', icon: Filter, description: 'Filter rows based on condition (multiple)' },
  { type: 'filter_top_n_per_group', name: 'Filter Rows Top N Per Group', icon: Filter, description: 'Filter top N rows per group by metric' },
  { type: 'filter_percentile', name: 'Filter Percentile', icon: Filter, description: 'Filter rows by percentile' },
  
  // Dataframe level ops (placeholders)
  { type: 'select_columns', name: 'Select Only Special Columns', icon: FileText, description: 'Select specific columns' },
  { type: 'drop_columns', name: 'Drop Columns', icon: FileText, description: 'Drop columns' },
  { type: 'rename', name: 'Rename', icon: FileText, description: 'Rename columns' },
  { type: 'reorder', name: 'Reorder', icon: FileText, description: 'Reorder columns' },
  { type: 'deduplicate', name: 'Deduplicate', icon: FileText, description: 'Deduplicate based on subset of cols' },
  { type: 'sort_rows', name: 'Sort Rows', icon: FileText, description: 'Sort rows' },
  
  // Statistical (existing + placeholders)
  { type: 'detrend', name: 'Detrend', icon: TrendingDown, description: 'Remove trend from a column using STL decomposition' },
  { type: 'deseasonalize', name: 'Deseasonalize', icon: TrendingDown, description: 'Remove seasonality from a column using STL decomposition' },
  { type: 'detrend_deseasonalize', name: 'Detrend & Deseasonalize', icon: TrendingDown, description: 'Remove both trend and seasonality from a column using STL decomposition' },
  { type: 'stl_outlier', name: 'STL Outlier', icon: Activity, description: 'Detect outliers using STL decomposition' },
  { type: 'standardize_minmax', name: 'Standardize (Min-Max)', icon: Activity, description: 'Standardize column(s) using Min-Max scaling' },
  { type: 'standardize_zscore', name: 'Standardize (Z-Score)', icon: Activity, description: 'Standardize column(s) using Z-Score' },
  { type: 'residual', name: 'Residual', icon: TrendingDown, description: 'Calculate residuals (target vs predictors)' },
  { type: 'rpi', name: 'RPI', icon: BarChart3, description: 'Relative Price Index calculation' },
  // Statistical (new placeholders) - COMMENTED OUT: No backend implementation
  // { type: 'dsdt', name: 'DSDT', icon: FunctionSquare, description: 'DSDT transformation' },
  // { type: 'stl_outlier_residual', name: 'STL Outlier Residual', icon: Activity, description: 'STL outlier residual' },
];

// Categorized operations
const operationCategories: OperationCategory[] = [
  {
    name: 'Numeric',
    icon: Hash,
    color: 'bg-blue-500',
    operations: allOperations.filter(op => 
      ['add', 'subtract', 'multiply', 'divide', 'pct_change', 'power', 'log', 'exp', 'sqrt', 'logistic', 'dummy'].includes(op.type)
    )
  },
  {
    name: 'String Ops',
    icon: Type,
    color: 'bg-green-500',
    operations: allOperations.filter(op => 
      ['lower', 'upper', 'strip', 'replace', 'fill_na'].includes(op.type)
    )
  },
  // Conditional & Boolean category - COMMENTED OUT: No backend implementation
  // {
  //   name: 'Conditional & Boolean',
  //   icon: Filter,
  //   color: 'bg-purple-500',
  //   operations: allOperations.filter(op => 
  //     ['if_then_else', 'multiple_conditions', 'in_list_flag', 'between_flag'].includes(op.type)
  //   )
  // },
  {
    name: 'Grouped Metrics',
    icon: Users,
    color: 'bg-orange-500',
    operations: allOperations.filter(op => 
      ['compute_metrics_within_group', 'group_share_of_total', 'group_contribution'].includes(op.type)
    )
  },
  {
    name: 'Time Series and Window Functions',
    icon: Clock,
    color: 'bg-pink-500',
    operations: allOperations.filter(op => 
      ['lag', 'lead', 'diff', 'growth_rate', 'rolling_mean', 'rolling_sum', 'rolling_min', 'rolling_max', 'cumulative_sum'].includes(op.type)
    )
  },
  {
    name: 'Date and Calendar Helpers',
    icon: Calendar,
    color: 'bg-indigo-500',
    operations: allOperations.filter(op => 
      ['datetime', 'fiscal_mapping', 'is_weekend', 'is_month_end', 'is_qtr_end', 'date_builder'].includes(op.type)
    )
  },
  {
    name: 'Row Filtering',
    icon: Filter,
    color: 'bg-red-500',
    operations: allOperations.filter(op => 
      ['filter_rows_condition', 'filter_top_n_per_group', 'filter_percentile'].includes(op.type)
    )
  },
  {
    name: 'Dataframe Level Ops',
    icon: FileText,
    color: 'bg-teal-500',
    operations: allOperations.filter(op => 
      ['select_columns', 'drop_columns', 'rename', 'reorder', 'deduplicate', 'sort_rows'].includes(op.type)
    )
  },
  {
    name: 'Statistical',
    icon: FunctionSquare,
    color: 'bg-gray-500',
    operations: allOperations.filter(op => 
      ['detrend', 'deseasonalize', 'detrend_deseasonalize', 'stl_outlier', 'standardize_minmax', 'standardize_zscore', 'residual', 'rpi'].includes(op.type)
    )
  }
];

// Operations that combine columns into one result
const combineColumnOps = ['add', 'subtract', 'multiply', 'divide', 'rpi', 'pct_change', 'residual'];
// Operations that create individual results for each column
const individualColumnOps = ['dummy', 'abs', 'power', 'log', 'sqrt', 'exp', 'logistic', 'detrend', 'deseasonalize', 'detrend_deseasonalize', 'standardize_zscore', 'standardize_minmax', 'lower', 'upper', 'strip', 'lag', 'lead', 'diff', 'growth_rate', 'rolling_mean', 'rolling_sum', 'rolling_min', 'rolling_max', 'cumulative_sum'];
// Operations that modify columns in-place (no rename allowed)
const inPlaceOps = ['lower', 'upper', 'strip', 'replace', 'fill_na'];
// Dataframe-level operations (no rename allowed, they operate on the dataframe structure)
const dataframeOps = ['select_columns', 'drop_columns', 'rename', 'reorder', 'deduplicate', 'sort_rows', 'filter_rows_condition', 'filter_top_n_per_group', 'filter_percentile', 'compute_metrics_within_group', 'group_share_of_total', 'group_contribution'];
// All multi-column operations (combine + individual)
const multiColumnOps = [...combineColumnOps, ...individualColumnOps, ...dataframeOps];

// Formula mapping for operations with backend code
const operationFormulas: Record<string, string> = {
  'add': 'col1 + col2 + ...',
  'subtract': 'col1 - col2 - ...',
  'multiply': 'col1 × col2 × ...',
  'divide': 'col1 ÷ col2 ÷ ...',
  'pct_change': '((col2 - col1) / col1) × 100',
  'power': 'col^exponent',
  'log': 'ln(col)',
  'exp': 'e^col',
  'sqrt': '√col',
  'logistic': '1 / (1 + exp(-gr × (x - mp))) with adstock',
  'dummy': 'Categorical codes (0/1)',
  'residual': 'y - predicted_y',
  'stl_outlier': 'STL decomposition outlier detection',
  'detrend': 'STL residual + seasonal',
  'deseasonalize': 'STL residual + trend',
  'detrend_deseasonalize': 'STL residual',
  'standardize_zscore': '(x - mean) / std',
  'standardize_minmax': '(x - min) / (max - min)',
  'rpi': 'Relative Price Index calculation',
  'datetime': 'Extract datetime components (year, month, week, day)',
  'lower': 'Convert to lowercase (in-place)',
  'upper': 'Convert to uppercase (in-place)',
  'strip': 'Strip whitespace (in-place)',
  'replace': 'Replace oldValue with newValue in strings',
  'fill_na': 'Fill missing values (strategy: mean/median/mode/custom)',
  'lag': 'Shift values down by period (creates NaN at beginning)',
  'lead': 'Shift values up by period (creates NaN at end)',
  'diff': 'x(t) - x(t-n)',
  'rolling_mean': 'Rolling mean over window',
  'rolling_sum': 'Rolling sum over window',
  'rolling_min': 'Rolling minimum over window',
  'rolling_max': 'Rolling maximum over window',
  'cumulative_sum': 'Running cumulative sum',
  'growth_rate': 'Percentage growth rate: ((x(t) - x(t-n)) / x(t-n)) × 100',
  'compute_metrics_within_group': 'Group aggregation: sum, mean, median, max, min, count, nunique, rank, rank_pct',
  'group_share_of_total': 'Column / Group Sum(Column)',
  'group_contribution': '(Group Sum / Overall Sum) × 100',
  'filter_rows_condition': 'Filter rows based on conditions (>, <, =, !=, >=, <=)',
  'filter_top_n_per_group': 'Filter top N rows per group by metric column',
  'filter_percentile': 'Filter rows by percentile threshold',
  'select_columns': 'Select specific columns to keep',
  'drop_columns': 'Drop specified columns',
  'rename': 'Rename columns',
  'reorder': 'Reorder columns',
  'deduplicate': 'Remove duplicate rows based on subset of columns',
  'sort_rows': 'Sort rows by specified columns',
  'fiscal_mapping': 'Map dates to fiscal periods',
  'is_weekend': 'Check if date is weekend (True/False)',
  'is_month_end': 'Check if date is month end (True/False)',
  'is_qtr_end': 'Check if date is quarter end (True/False)',
  'date_builder': 'Build date from year, month, day components',
};

interface MetricsColOpsProps {
  hideSaveButtons?: boolean;
  onSave?: () => void;
  onSaveAs?: () => void;
  onColumnCreated?: (column: { columnName: string; tableName: string; objectName: string }) => void;
  onTableCreated?: (table: { newTableName: string; originalTableName: string; objectName: string }) => void;
}

export interface MetricsColOpsRef {
  save: () => void;
  saveAs: () => void;
  canSave: () => boolean;
  isSaving: () => boolean;
}

const MetricsColOps = React.forwardRef<MetricsColOpsRef, MetricsColOpsProps>(({ hideSaveButtons = false, onSave, onSaveAs, onColumnCreated, onTableCreated }, ref) => {
  const [search, setSearch] = React.useState('');
  const [isOpen, setIsOpen] = React.useState(true);
  const [openCategories, setOpenCategories] = React.useState<Record<string, boolean>>({});
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
  const [replaceUniqueValues, setReplaceUniqueValues] = React.useState<Record<string, string[]>>({});
  const [loadingReplaceValues, setLoadingReplaceValues] = React.useState<Record<string, boolean>>({});
  const [columnsWithMissingValues, setColumnsWithMissingValues] = React.useState<string[]>([]);
  const { toast } = useToast();
  const metricsInputs = useLaboratoryStore(state => state.metricsInputs);
  const updateMetricsInputs = useLaboratoryStore(state => state.updateMetricsInputs);
  const selectedOperations = metricsInputs.operations;
  
  // Get column operations identifiers from store with defaults
  const allIdentifiers = metricsInputs.columnOpsAllIdentifiers || [];
  const selectedIdentifiers = metricsInputs.columnOpsSelectedIdentifiers || [];
  const columnOpsSelectedIdentifiersForBackend = metricsInputs.columnOpsSelectedIdentifiersForBackend || [];
  const identifiersListOpen = metricsInputs.columnOpsIdentifiersListOpen || false;
  
  // Convert selectedIdentifiersForBackend array to Set for easier manipulation
  const selectedIdentifiersForBackend = React.useMemo(() => new Set(columnOpsSelectedIdentifiersForBackend), [columnOpsSelectedIdentifiersForBackend]);
  const addMetricsOperation = useLaboratoryStore(state => state.addMetricsOperation);
  const updateMetricsOperation = useLaboratoryStore(state => state.updateMetricsOperation);
  const removeMetricsOperation = useLaboratoryStore(state => state.removeMetricsOperation);

  // Filter categories and operations based on search
  const filteredCategories = operationCategories.map(category => {
    const filteredOps = category.operations.filter(op =>
      op.name.toLowerCase().includes(search.toLowerCase()) ||
      op.description.toLowerCase().includes(search.toLowerCase())
    );
    return { ...category, operations: filteredOps };
  }).filter(category => category.operations.length > 0);

  // Auto-open categories that have matching operations when searching
  React.useEffect(() => {
    if (search.trim()) {
      // When searching, open all categories with matches
      const categoriesWithMatches: Record<string, boolean> = {};
      operationCategories.forEach(category => {
        const hasMatch = category.operations.some(op =>
          op.name.toLowerCase().includes(search.toLowerCase()) ||
          op.description.toLowerCase().includes(search.toLowerCase())
        );
        if (hasMatch) {
          categoriesWithMatches[category.name] = true;
        }
      });
      setOpenCategories(categoriesWithMatches);
    } else {
      // When search is cleared, close all categories
      setOpenCategories({});
    }
  }, [search]);

  const toggleCategory = (categoryName: string) => {
    setOpenCategories(prev => {
      const isCurrentlyOpen = prev[categoryName] ?? false;
      // If searching, allow multiple categories to be open
      // If not searching, accordion behavior (only one open at a time)
      if (search.trim()) {
        // During search, just toggle the clicked category
        return {
          ...prev,
          [categoryName]: !isCurrentlyOpen
        };
      } else {
        // Accordion behavior: close all categories first, then open the clicked one if it was closed
        const newState: Record<string, boolean> = {};
        if (!isCurrentlyOpen) {
          newState[categoryName] = true;
        }
        return newState;
      }
    });
  };

  // Helper function to filter out date-related columns
  const filterDateColumns = (columns: string[]): string[] => {
    const dateKeywords = ['date', 'dates', 'year', 'month', 'week', 'day', 'day_name', 'month_name'];
    return columns.filter(id => {
      const idLower = (id || '').trim().toLowerCase();
      // Exclude any column that contains "date" in its name
      if (idLower.includes('date')) return false;
      // Exclude exact matches for other date keywords
      return !dateKeywords.includes(idLower);
    });
  };

  // Fetch identifiers from MongoDB or fallback to categorical columns after file selection
  // Always use backend logic - never skip or preserve identifiers from AI/hardcoded values
  React.useEffect(() => {
    async function fetchIdentifiers() {
      updateMetricsInputs({ columnOpsSelectedIdentifiers: [] });
      const dataSource = metricsInputs.dataSource;
      if (!dataSource) return;
      
      // Extract client/app/project and file_name from file path (same as groupby atom)
      const pathParts = dataSource.split('/');
      const clientName = pathParts[0] ?? '';
      const appName = pathParts[1] ?? '';
      const projectName = pathParts[2] ?? '';
      // Extract file_name (everything after project_name)
      const fileName = pathParts.slice(3).join('/') || null;
      
      try {
        if (clientName && appName && projectName) {
          // Build URL with optional file_name parameter (same pattern as groupby atom)
          const urlParams = new URLSearchParams({
            client_name: clientName,
            app_name: appName,
            project_name: projectName,
          });
          if (fileName) {
            urlParams.append('file_name', fileName);
          }
          const resp = await fetch(`${CREATECOLUMN_API}/identifier_options?${urlParams.toString()}`);
          if (resp.ok) {
            const data = await resp.json();
            if (Array.isArray(data.identifiers) && data.identifiers.length > 0) {
              // console.log('[MetricsColOps] All identifiers from backend:', data.identifiers);
              // Store unfiltered identifiers for compute_metrics_within_group
              const allIds = data.identifiers || [];
              // Filter out all date-related columns for backend (but show all in UI)
              const filteredIdentifiers = filterDateColumns(allIds);
              // console.log('[MetricsColOps] Filtered identifiers (for backend):', filteredIdentifiers);
              // Set all identifiers for display, but only non-time-related ones selected for backend
              updateMetricsInputs({
                columnOpsAllIdentifiers: allIds,
                columnOpsSelectedIdentifiers: allIds, // Show all in UI
                columnOpsSelectedIdentifiersForBackend: filteredIdentifiers, // Only non-time-related selected
              });
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
          // Store unfiltered categorical columns for compute_metrics_within_group
          const filteredCats = filterDateColumns(cats);
          // Set all categorical columns for display, but only non-time-related ones selected for backend
          updateMetricsInputs({
            columnOpsAllIdentifiers: cats,
            columnOpsSelectedIdentifiers: cats, // Show all in UI
            columnOpsSelectedIdentifiersForBackend: filteredCats, // Only non-time-related selected
          });
        }
      } catch {}
    }
    fetchIdentifiers();
  }, [metricsInputs.dataSource, updateMetricsInputs]);

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
          
          // Fetch columns with missing values for fill_na operation
          fetchColumnsWithMissingValues(metricsInputs.dataSource, summary);
        }
      } catch (error) {
        console.error('Failed to fetch columns', error);
        setAllColumns([]);
        setColumnsWithMissingValues([]);
      }
    };

    fetchColumns();
  }, [metricsInputs.dataSource]);

  // Fetch columns with missing values
  const fetchColumnsWithMissingValues = async (objectName: string, summary: any[]) => {
    if (!objectName) {
      setColumnsWithMissingValues([]);
      return;
    }
    
    // Skip fetching if file path contains 'create-data' (newly created files may not be immediately available)
    // This prevents CORS/500 errors for newly saved files
    if (objectName.includes('create-data') || objectName.includes('create_data')) {
      // console.log('[MetricsColOps] Skipping columns_with_missing_values fetch for newly created file:', objectName);
      setColumnsWithMissingValues([]);
      return;
    }
    
    try {
      // Call createcolumn API to get columns with missing values
      const res = await fetch(`${CREATECOLUMN_API}/columns_with_missing_values?object_name=${encodeURIComponent(objectName)}`);
      if (res.ok) {
        const raw = await res.json();
        const data = await resolveTaskResponse<{ columns_with_missing_values?: string[] }>(raw);
        const columns = (data.columns_with_missing_values || []).filter(Boolean);
        setColumnsWithMissingValues(columns);
      } else {
        // Silently fail - this is not critical functionality
        // Only log if it's not a 500/CORS error (which are common and expected)
        if (res.status !== 500 && res.status !== 0) {
          console.warn('[MetricsColOps] Failed to fetch columns with missing values:', res.status, res.statusText);
        }
        setColumnsWithMissingValues([]);
      }
    } catch (error: any) {
      // Silently fail - this is not critical functionality (only used for fill_na operation)
      // CORS errors and network errors are common and expected - don't log them
      const errorMessage = error?.message || String(error);
      const isCorsOrNetworkError = errorMessage.includes('CORS') || 
                                   errorMessage.includes('Failed to fetch') || 
                                   errorMessage.includes('NetworkError') ||
                                   errorMessage.includes('net::ERR_FAILED');
      
      if (!isCorsOrNetworkError) {
        console.warn('[MetricsColOps] Failed to fetch columns with missing values (non-critical):', error);
      }
      setColumnsWithMissingValues([]);
    }
  };

  const numericalColumns: string[] = allColumns.filter((c: any) =>
    c && typeof c.data_type === 'string' &&
    ['int', 'float', 'number', 'double', 'numeric'].some(type => c.data_type.toLowerCase().includes(type))
  ).map((c: any) => c.column).filter((col: string) => {
    const isIdentifier = allIdentifiers.includes(col);
    if (isIdentifier) {
      // console.log(`[MetricsColOps] Excluding ${col} from numericalColumns (it's an identifier)`);
    }
    return !isIdentifier;
  });
  
  // Debug log
  // React.useEffect(() => {
  //   console.log('[MetricsColOps] allIdentifiers:', allIdentifiers);
  //   console.log('[MetricsColOps] numericalColumns (after filtering identifiers):', numericalColumns);
  // }, [allIdentifiers, numericalColumns]);

  const categoricalColumns: string[] = allColumns.filter((c: any) =>
    c && typeof c.data_type === 'string' &&
    ['object', 'string', 'category', 'bool'].some(type => c.data_type.toLowerCase().includes(type))
  ).map((c: any) => c.column);

  const dateColumns: string[] = allColumns.filter((c: any) =>
    c && typeof c.data_type === 'string' &&
    ['date', 'datetime', 'timestamp'].some(type => c.data_type.toLowerCase().includes(type))
  ).map((c: any) => c.column);

  const allAvailableColumns: string[] = allColumns.map((c: any) => c.column).filter(Boolean);

  const handleOperationClick = (opType: OperationType) => {
    let defaultCols: string[];
    if (["add", "subtract", "multiply", "divide", "pct_change"].includes(opType.type)) {
      defaultCols = ['', ''];
    } else if (opType.type === 'date_builder') {
      defaultCols = ['', '', '']; // Year, Month/Week, Day/DayOfWeek
    } else if (opType.type === 'select_columns' || opType.type === 'drop_columns' || opType.type === 'reorder' || opType.type === 'deduplicate' || opType.type === 'sort_rows' || opType.type === 'filter_rows_condition' || opType.type === 'filter_top_n_per_group' || opType.type === 'filter_percentile' || opType.type === 'compute_metrics_within_group' || opType.type === 'group_share_of_total' || opType.type === 'group_contribution' || opType.type === 'lower' || opType.type === 'upper' || opType.type === 'strip') {
      defaultCols = []; // Multi-select starts with empty array
    } else if (opType.type === 'rename') {
      defaultCols = ['']; // Single select starts with one empty column
    } else {
      defaultCols = [''];
    }
    const newOperation = {
      id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: opType.type,
      name: opType.name,
      columns: defaultCols,
      rename: opType.type === 'rename' ? {} : '',
      param: opType.type === 'replace' ? { oldValue: '', newValue: '' } : (opType.type === 'fill_na' ? { strategy: '', customValue: '' } : (opType.type === 'date_builder' ? 'from_year_month_day' : (opType.type === 'power' || opType.type === 'lag' || opType.type === 'lead' || opType.type === 'diff' || opType.type === 'rolling_mean' || opType.type === 'rolling_sum' || opType.type === 'rolling_min' || opType.type === 'rolling_max' ? '' : (opType.type === 'growth_rate' ? { period: '1', frequency: 'none', comparison_type: 'period' } : (opType.type === 'filter_rows_condition' ? {} : (opType.type === 'filter_top_n_per_group' ? { n: '1', metric_col: '', ascending: false } : (opType.type === 'filter_percentile' ? { percentile: '10', metric_col: '', direction: 'top' } : (opType.type === 'compute_metrics_within_group' ? { metric_cols: [{ metric_col: '', method: 'sum', rename: '' }] } : (opType.type === 'group_share_of_total' ? { metric_cols: [{ metric_col: '', rename: '' }] } : (opType.type === 'group_contribution' ? { metric_cols: [{ metric_col: '', rename: '' }] } : undefined)))))))))),
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
    // For rename operation, initialize the rename value for the new column
    if (op.type === 'rename') {
      const currentRename = (op.rename && typeof op.rename === 'object' ? op.rename as Record<string, any> : {}) || {};
      const newRename = { ...currentRename, [current.length]: '' };
      updateMetricsOperation(opId, { rename: newRename });
    }
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
    
    // Clear cached unique values for replace operation when column changes
    if (op.type === 'replace' && idx === 0) {
      setReplaceUniqueValues(prev => {
        const newState = { ...prev };
        delete newState[opId];
        return newState;
      });
      // Also clear the selected oldValue when column changes
      const currentParam = (op.param as Record<string, any>) || { oldValue: '', newValue: '' };
      updateMetricsOperation(opId, { param: { ...currentParam, oldValue: '' } });
    }
  };

  // Fetch unique values for replace operation
  const fetchReplaceUniqueValues = async (opId: string, columnName: string) => {
    if (!metricsInputs.dataSource || !columnName) return;
    
    setLoadingReplaceValues(prev => ({ ...prev, [opId]: true }));
    try {
      const res = await fetch(`${FEATURE_OVERVIEW_API}/column_summary?object_name=${encodeURIComponent(metricsInputs.dataSource)}`);
      if (res.ok) {
        const raw = await res.json();
        const data = await resolveTaskResponse<{ summary?: any[] }>(raw);
        const summary = (data.summary || []).filter(Boolean);
        // API returns lowercase column names, so compare case-insensitively
        const columnNameLower = columnName.toLowerCase().trim();
        const columnSummary = summary.find((c: any) => (c.column || '').toLowerCase().trim() === columnNameLower);
        if (columnSummary && Array.isArray(columnSummary.unique_values)) {
          const values = columnSummary.unique_values
            .map((v: any) => String(v))
            .filter((v: string) => v !== null && v !== undefined && v !== '');
          setReplaceUniqueValues(prev => ({ ...prev, [opId]: values }));
        } else {
          console.warn('Column summary not found or no unique values:', { columnName, columnNameLower, summary: summary.map((c: any) => c.column) });
          setReplaceUniqueValues(prev => ({ ...prev, [opId]: [] }));
        }
      } else {
        console.error('Failed to fetch column summary:', res.status, res.statusText);
        setReplaceUniqueValues(prev => ({ ...prev, [opId]: [] }));
      }
    } catch (error) {
      console.error('Failed to fetch unique values', error);
      setReplaceUniqueValues(prev => ({ ...prev, [opId]: [] }));
    } finally {
      setLoadingReplaceValues(prev => ({ ...prev, [opId]: false }));
    }
  };

  const removeOperation = (opId: string) => {
    removeMetricsOperation(opId);
  };

  const getAvailableColumns = (opType: string) => {
    if (opType === 'dummy') return categoricalColumns;
    if (opType === 'datetime') return dateColumns;
    if (opType === 'fiscal_mapping') return dateColumns;
    if (opType === 'is_weekend') return dateColumns;
    if (opType === 'is_month_end') return dateColumns;
    if (opType === 'is_qtr_end') return dateColumns;
    if (opType === 'date_builder') return numericalColumns;
    if (opType === 'replace') return allAvailableColumns;
    if (opType === 'lower' || opType === 'upper' || opType === 'strip') return allAvailableColumns;
    if (opType === 'select_columns') return allAvailableColumns;
    if (opType === 'drop_columns') return allAvailableColumns;
    if (opType === 'reorder') return allAvailableColumns;
    if (opType === 'deduplicate') return allAvailableColumns;
    if (opType === 'sort_rows') return allAvailableColumns;
    if (opType === 'filter_rows_condition') return allAvailableColumns;
    if (opType === 'filter_top_n_per_group') return allAvailableColumns;
    if (opType === 'filter_percentile') return allAvailableColumns;
    if (opType === 'rename') return allAvailableColumns;
    if (opType === 'fill_na') {
      // Return all available columns - users should be able to fill NA in any column
      return allAvailableColumns;
    }
    return numericalColumns;
  };

  // Helper to get the output column name for a single column in an operation
  // Used for operations that use global identifiers and create one column per input column
  const getOutputColNameForColumn = (op: typeof selectedOperations[0], col: string) => {
    if (op.rename && typeof op.rename === 'string' && op.rename.trim()) {
      // If rename is provided and only one column, use rename (lowercase for case-insensitive matching)
      // For multiple columns with rename, we'd need per-column rename (not currently supported)
      const columns = op.columns?.filter(Boolean) || [];
      if (columns.length === 1) {
        return op.rename.trim().toLowerCase();
      }
    }
    
    let result = '';
    switch (op.type) {
      case 'dummy': result = `${col}_dummy`; break;
      case 'log': result = `${col}_log`; break;
      case 'sqrt': result = `${col}_sqrt`; break;
      case 'exp': result = `${col}_exp`; break;
      case 'power': result = op.param ? `${col}_power${op.param}` : `${col}_power`; break;
      case 'standardize_zscore': result = `${col}_zscore_scaled`; break;
      case 'standardize_minmax': result = `${col}_minmax_scaled`; break;
      case 'logistic': result = `${col}_logistic`; break;
      case 'detrend': result = `${col}_detrended`; break;
      case 'deseasonalize': result = `${col}_deseasonalized`; break;
      case 'detrend_deseasonalize': result = `${col}_detrend_deseasonalized`; break;
      case 'lag': result = `${col}_lag`; break;
      case 'lead': result = `${col}_lead`; break;
      case 'diff': result = `${col}_diff`; break;
      case 'rolling_mean': result = `${col}_rolling_mean`; break;
      case 'rolling_sum': result = `${col}_rolling_sum`; break;
      case 'rolling_min': result = `${col}_rolling_min`; break;
      case 'rolling_max': result = `${col}_rolling_max`; break;
      case 'cumulative_sum': result = `${col}_cumulative_sum`; break;
      case 'growth_rate': result = `${col}_growth_rate`; break;
      case 'abs': result = `${col}_abs`; break;
      case 'lower': result = `${col}_lower`; break;
      case 'upper': result = `${col}_upper`; break;
      case 'strip': result = `${col}_strip`; break;
      default: result = `${col}_${op.type}`; break;
    }
    // Convert all output column names to lowercase for case-insensitive matching
    return result.toLowerCase();
  };

  // Helper to get the output column name for an operation
  // IMPORTANT: These names must match the backend naming in service.py
  const getOutputColName = (op: typeof selectedOperations[0]) => {
    // Convert rename to lowercase for case-insensitive matching
    if (op.rename && typeof op.rename === 'string' && op.rename.trim()) return op.rename.trim().toLowerCase();
    const columns = op.columns?.filter(Boolean) || [];
    let result = '';
    switch (op.type) {
      // Backend: "_plus_".join(columns)
      case 'add': result = columns.join('_plus_'); break;
      // Backend: "_minus_".join(columns)
      case 'subtract': result = columns.join('_minus_'); break;
      case 'multiply': result = columns.join('_x_'); break;  // Backend uses _x_ not _times_
      case 'divide': result = columns.join('_div_'); break;   // Backend uses _div_ not _dividedby_
      case 'pct_change': result = columns.length === 2 ? `${columns[1]}_pct_change_from_${columns[0]}` : 'pct_change'; break;
      // Backend: f"Res_{y_var}" - convert to lowercase
      case 'residual': result = `res_${columns[0] || ''}`; break;
      // Backend: f"{col}_dummy"
      case 'dummy': result = columns.length > 0 ? `${columns[0]}_dummy` : 'dummy'; break;
      // Backend: f"{col}_log"
      case 'log': result = columns.length > 0 ? `${columns[0]}_log` : 'log'; break;
      // Backend: f"{col}_sqrt"
      case 'sqrt': result = columns.length > 0 ? `${columns[0]}_sqrt` : 'sqrt'; break;
      // Backend: f"{col}_exp"
      case 'exp': result = columns.length > 0 ? `${columns[0]}_exp` : 'exp'; break;
      // Backend: f"{col}_abs"
      case 'abs': result = columns.length > 0 ? `${columns[0]}_abs` : 'abs'; break;
      // Backend: f"{col}_power{param}"
      case 'power': result = columns.length > 0 && op.param ? `${columns[0]}_power${op.param}` : 'power'; break;
      // Backend: f"{col}_zscore_scaled"
      case 'standardize_zscore': result = columns.length > 0 ? `${columns[0]}_zscore_scaled` : 'zscore_scaled'; break;
      // Backend: f"{col}_minmax_scaled"
      case 'standardize_minmax': result = columns.length > 0 ? `${columns[0]}_minmax_scaled` : 'minmax_scaled'; break;
      // Backend: f"{col}_logistic"
      case 'logistic': result = columns.length > 0 ? `${columns[0]}_logistic` : 'logistic'; break;
      // Backend: f"{col}_detrended"
      case 'detrend': result = columns.length > 0 ? `${columns[0]}_detrended` : 'detrended'; break;
      // Backend: f"{col}_deseasonalized"
      case 'deseasonalize': result = columns.length > 0 ? `${columns[0]}_deseasonalized` : 'deseasonalized'; break;
      // Backend: f"{col}_detrend_deseasonalized"
      case 'detrend_deseasonalize': result = columns.length > 0 ? `${columns[0]}_detrend_deseasonalized` : 'detrend_deseasonalized'; break;
      // Backend: f"{col}_lag"
      case 'lag': result = columns.length > 0 ? `${columns[0]}_lag` : 'lag'; break;
      // Backend: f"{col}_lead"
      case 'lead': result = columns.length > 0 ? `${columns[0]}_lead` : 'lead'; break;
      // Backend: f"{col}_diff"
      case 'diff': result = columns.length > 0 ? `${columns[0]}_diff` : 'diff'; break;
      // Backend: f"{col}_rolling_mean"
      case 'rolling_mean': result = columns.length > 0 ? `${columns[0]}_rolling_mean` : 'rolling_mean'; break;
      // Backend: f"{col}_rolling_sum"
      case 'rolling_sum': result = columns.length > 0 ? `${columns[0]}_rolling_sum` : 'rolling_sum'; break;
      // Backend: f"{col}_rolling_min"
      case 'rolling_min': result = columns.length > 0 ? `${columns[0]}_rolling_min` : 'rolling_min'; break;
      // Backend: f"{col}_rolling_max"
      case 'rolling_max': result = columns.length > 0 ? `${columns[0]}_rolling_max` : 'rolling_max'; break;
      // Backend: f"{col}_cumulative_sum"
      case 'cumulative_sum': result = columns.length > 0 ? `${columns[0]}_cumulative_sum` : 'cumulative_sum'; break;
      // Backend: f"{col}_growth_rate"
      case 'growth_rate': result = columns.length > 0 ? `${columns[0]}_growth_rate` : 'growth_rate'; break;
      // Backend: f"{date_col}_year", f"{date_col}_month", etc.
      case 'datetime': {
        if (columns.length > 0 && op.param) {
          const dateCol = columns[0];
          const param = op.param as string;
          if (param === 'to_year') result = `${dateCol}_year`;
          else if (param === 'to_month') result = `${dateCol}_month`;
          else if (param === 'to_week') result = `${dateCol}_week`;
          else if (param === 'to_day') result = `${dateCol}_day`;
          else if (param === 'to_day_name') result = `${dateCol}_day_name`;
          else if (param === 'to_month_name') result = `${dateCol}_month_name`;
          else result = 'datetime_extract';
        } else {
          result = 'datetime_extract';
        }
        break;
      }
      // Backend: f"{date_col}_fiscal_year", f"{date_col}_fiscal_quarter", etc.
      case 'fiscal_mapping': {
        if (columns.length > 0 && op.param) {
          const dateCol = columns[0];
          const param = op.param as string;
          if (param === 'fiscal_year') result = `${dateCol}_fiscal_year`;
          else if (param === 'fiscal_quarter') result = `${dateCol}_fiscal_quarter`;
          else if (param === 'fiscal_month') result = `${dateCol}_fiscal_month`;
          else if (param === 'fiscal_year_full') result = `${dateCol}_fiscal_year_full`;
          else result = 'fiscal_mapping';
        } else {
          result = 'fiscal_mapping';
        }
        break;
      }
      // Backend: f"{date_col}_is_weekend"
      case 'is_weekend': result = columns.length > 0 ? `${columns[0]}_is_weekend` : 'is_weekend'; break;
      // Backend: f"{date_col}_is_month_end"
      case 'is_month_end': result = columns.length > 0 ? `${columns[0]}_is_month_end` : 'is_month_end'; break;
      // Backend: f"{date_col}_is_qtr_end"
      case 'is_qtr_end': result = columns.length > 0 ? `${columns[0]}_is_qtr_end` : 'is_qtr_end'; break;
      // Backend: "built_date"
      case 'date_builder': result = 'built_date'; break;
      // Backend: "is_outlier"
      case 'stl_outlier': result = 'is_outlier'; break;
      // Backend: f"{metric_col}_group_{method}" for compute_metrics_within_group
      case 'compute_metrics_within_group': {
        if (op.param && typeof op.param === 'object') {
          const param = op.param as Record<string, any>;
          const metricCols = param.metric_cols;
          if (Array.isArray(metricCols) && metricCols.length > 0) {
            result = metricCols.map((item: any) => {
              const rename = item.rename?.trim();
              if (rename) return rename.toLowerCase();
              return `${item.metric_col}_group_${item.method}`;
            }).join(', ');
          } else {
            result = 'compute_metrics_within_group';
          }
        } else {
          result = 'compute_metrics_within_group';
        }
        break;
      }
      // Backend: f"{metric_col}_share_of_total"
      case 'group_share_of_total': {
        if (op.param && typeof op.param === 'object') {
          const param = op.param as Record<string, any>;
          const metricCols = param.metric_cols;
          if (Array.isArray(metricCols) && metricCols.length > 0) {
            result = metricCols.map((item: any) => {
              const rename = item.rename?.trim();
              if (rename) return rename.toLowerCase();
              return `${item.metric_col}_share_of_total`;
            }).join(', ');
          } else {
            result = 'group_share_of_total';
          }
        } else {
          result = 'group_share_of_total';
        }
        break;
      }
      // Backend: f"{metric_col}_contribution"
      case 'group_contribution': {
        if (op.param && typeof op.param === 'object') {
          const param = op.param as Record<string, any>;
          const metricCols = param.metric_cols;
          if (Array.isArray(metricCols) && metricCols.length > 0) {
            result = metricCols.map((item: any) => {
              const rename = item.rename?.trim();
              if (rename) return rename.toLowerCase();
              return `${item.metric_col}_contribution`;
            }).join(', ');
          } else {
            result = 'group_contribution';
          }
        } else {
          result = 'group_contribution';
        }
        break;
      }
      default: result = `${op.type}_${columns.join('_')}`; break;
    }
    // Convert all output column names to lowercase for case-insensitive matching
    return result.toLowerCase();
  };

  // Helper to expand operations for metadata storage
  // Handles multi-output operations, multi-column operations with identifiers, and in-place operations
  const expandOperationsForMetadata = (operations: typeof selectedOperations): Array<{
    operation_type: string;
    columns: string[];
    rename: string | null;
    param: any;
    created_column_name: string;
    is_transformed?: boolean;
    metric_col?: string;
    method?: string;
  }> => {
    const inPlaceOps = ['lower', 'upper', 'strip', 'replace', 'fill_na'];
    const usesGlobalIdentifiers = [
      'detrend', 'deseasonalize', 'detrend_deseasonalize', 
      'standardize_zscore', 'standardize_minmax', 
      'residual', 'rpi', 'logistic',
      'lag', 'lead', 'diff', 'growth_rate',
      'rolling_mean', 'rolling_sum', 'rolling_min', 'rolling_max',
      'cumulative_sum', 'abs', 'log', 'sqrt', 'exp', 'power',
      'lower', 'upper', 'strip', 'fill_na', 'replace', 'dummy'
    ];
    const hasIdentifiers = (columnOpsSelectedIdentifiersForBackend || []).length > 0;

    return operations.flatMap(op => {
      const columns = op.columns?.filter(Boolean) || [];

      // 1. Multi-output operations: compute_metrics_within_group
      if (op.type === 'compute_metrics_within_group' && op.param && typeof op.param === 'object') {
        const metricCols = (op.param as any).metric_cols || [];
        return metricCols
          .filter((item: any) => item.metric_col && item.method)
          .map((item: any) => ({
            operation_type: op.type,
            columns: op.columns || [],
            rename: op.rename || null,
            param: op.param,
            created_column_name: item.rename || `${item.metric_col}_group_${item.method}`,
            metric_col: item.metric_col,
            method: item.method
          }));
      }

      // 2. Multi-output operations: group_share_of_total
      if (op.type === 'group_share_of_total' && op.param && typeof op.param === 'object') {
        const metricCols = (op.param as any).metric_cols || [];
        return metricCols
          .filter((item: any) => item.metric_col)
          .map((item: any) => ({
            operation_type: op.type,
            columns: op.columns || [],
            rename: op.rename || null,
            param: op.param,
            created_column_name: item.rename || `${item.metric_col}_share_of_total`,
            metric_col: item.metric_col
          }));
      }

      // 3. Multi-output operations: group_contribution
      if (op.type === 'group_contribution' && op.param && typeof op.param === 'object') {
        const metricCols = (op.param as any).metric_cols || [];
        return metricCols
          .filter((item: any) => item.metric_col)
          .map((item: any) => ({
            operation_type: op.type,
            columns: op.columns || [],
            rename: op.rename || null,
            param: op.param,
            created_column_name: item.rename || `${item.metric_col}_contribution`,
            metric_col: item.metric_col
          }));
      }

      // 4. Multi-output operations: rpi
      if (op.type === 'rpi') {
        return columns.map((col: string) => ({
          operation_type: op.type,
          columns: op.columns || [],
          rename: op.rename || null,
          param: op.param || null,
          created_column_name: `${col}_rpi`
        }));
      }

      // 5. In-place operations
      if (inPlaceOps.includes(op.type)) {
        return columns.map((col: string) => ({
          operation_type: op.type,
          columns: [col],
          rename: op.rename || null,
          param: op.param || null,
          created_column_name: col, // Same as input column (in-place)
          is_transformed: true
        }));
      }

      // 6. Multi-column operations with identifiers
      if (usesGlobalIdentifiers.includes(op.type) && hasIdentifiers && columns.length > 1) {
        return columns.map((col: string) => {
          let created_column_name = '';
          if (op.rename && typeof op.rename === 'string' && op.rename.trim() && columns.length === 1) {
            // Only use rename if single column
            created_column_name = op.rename.trim();
          } else {
            // Use per-column naming
            created_column_name = getOutputColNameForColumn(op, col);
          }
          return {
            operation_type: op.type,
            columns: [col], // Single column per entry
            rename: op.rename || null,
            param: op.param || null,
            created_column_name: created_column_name
          };
        });
      }

      // 7. Single-output operations (default case)
      let created_column_name = '';
      if (op.rename && typeof op.rename === 'string' && op.rename.trim()) {
        created_column_name = op.rename.trim();
      } else {
        created_column_name = getOutputColName(op);
      }
      return [{
        operation_type: op.type,
        columns: op.columns || [],
        rename: op.rename || null,
        param: op.param || null,
        created_column_name: created_column_name
      }];
    });
  };

  // Helper to build created_columns list for operations
  // Handles operations that use global identifiers (create one column per input column)
  const buildCreatedColumns = (operations: typeof selectedOperations): string[] => {
    const created_columns: string[] = [];
    
    operations.forEach(op => {
      const columns = op.columns?.filter(Boolean) || [];
      
      // Operations that use global identifiers create one column per input column
      // These operations apply to each column individually within identifier groups
      const usesGlobalIdentifiers = [
        'detrend', 'deseasonalize', 'detrend_deseasonalize', 
        'standardize_zscore', 'standardize_minmax', 
        'residual', 'rpi', 'logistic',
        'lag', 'lead', 'diff', 'growth_rate',
        'rolling_mean', 'rolling_sum', 'rolling_min', 'rolling_max',
        'cumulative_sum', 'abs', 'log', 'sqrt', 'exp', 'power',
        'lower', 'upper', 'strip', 'fill_na', 'replace', 'dummy'
      ].includes(op.type);
      
      if (usesGlobalIdentifiers) {
        // Create one column per input column
        columns.forEach((col: string) => {
          if (op.rename && typeof op.rename === 'string' && op.rename.trim() && columns.length === 1) {
            // If rename is provided and only one column, use rename
            created_columns.push(op.rename.trim());
          } else {
            // Use default naming pattern per column
            const colName = getOutputColNameForColumn(op, col);
            if (colName) created_columns.push(colName);
          }
        });
      } else if (op.type === 'compute_metrics_within_group' && op.param && typeof op.param === 'object') {
        // Group operations create multiple columns (one per metric_col + method)
        const metricCols = (op.param as any).metric_cols || [];
        metricCols.forEach((item: any) => {
          if (item.metric_col && item.method) {
            const colName = item.rename || `${item.metric_col}_group_${item.method}`;
            if (colName) created_columns.push(colName);
          }
        });
      } else if (op.type === 'group_share_of_total' && op.param && typeof op.param === 'object') {
        const metricCols = (op.param as any).metric_cols || [];
        metricCols.forEach((item: any) => {
          if (item.metric_col) {
            const colName = item.rename || `${item.metric_col}_share_of_total`;
            if (colName) created_columns.push(colName);
          }
        });
      } else if (op.type === 'group_contribution' && op.param && typeof op.param === 'object') {
        const metricCols = (op.param as any).metric_cols || [];
        metricCols.forEach((item: any) => {
          if (item.metric_col) {
            const colName = item.rename || `${item.metric_col}_contribution`;
            if (colName) created_columns.push(colName);
          }
        });
      } else {
        // Regular operations create a single column (add, subtract, multiply, divide, etc.)
        if (op.rename && typeof op.rename === 'string' && op.rename.trim()) {
          created_columns.push(op.rename.trim());
        } else {
          const colName = getOutputColName(op);
          if (colName) created_columns.push(colName);
        }
      }
    });
    
    return created_columns;
  };

  // Helper to check if a column name already exists in the uploaded file (case-insensitive)
  const isNameInUploadedFile = (name: string) => {
    const nameLower = (name || '').toLowerCase().trim();
    return allColumns.some((c: any) => (c.column || '').toLowerCase().trim() === nameLower);
  };

  // Helper to convert preview data to CSV
  const previewToCSV = (data: any[]): string => {
    if (!data.length) return '';
    const headers = Object.keys(data[0]);
    const rows = data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','));
    return [headers.join(','), ...rows].join('\n');
  };

  // Helper to get filtered identifiers that will be sent to backend
  const getFilteredIdentifiersForBackend = (): string[] => {
    const datetimeSuffixes = ['_year', '_month', '_week', '_day', '_day_name', '_month_name'];
    const generatedSuffixes = ['_dummy', '_detrended', '_deseasonalized', '_detrend_deseasonalized', '_log', '_sqrt', '_exp', '_power', '_logistic', '_abs', '_scaled', '_zscore', '_minmax', '_residual', '_outlier', '_rpi', '_lag', '_lead', '_diff', '_growth_rate', '_rolling_mean', '_rolling_sum', '_rolling_min', '_rolling_max', '_cumulative_sum'];
    return selectedIdentifiers.filter(id => {
      const idLower = id.toLowerCase();
      // Exclude any column that contains "date" in its name
      if (idLower.includes('date')) return false;
      // Exclude any columns ending with datetime suffixes
      if (datetimeSuffixes.some(suffix => idLower.endsWith(suffix))) return false;
      // Exclude generated columns (created by operations)
      if (generatedSuffixes.some(suffix => idLower.endsWith(suffix))) return false;
      return true;
    }).filter(id => selectedIdentifiersForBackend.has(id)); // Only include selected ones
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
          let rename = (op.rename && typeof op.rename === 'string' && op.rename.trim()) ? op.rename.trim() : '';
          // Use operationsAdded as the index to ensure sequential numbering
          let key = `${op.type}_${operationsAdded}`;
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
          } else if (op.type === 'lag' || op.type === 'lead' || op.type === 'diff' || op.type === 'rolling_mean' || op.type === 'rolling_sum' || op.type === 'rolling_min' || op.type === 'rolling_max') {
            if (op.param) {
              formData.append(`${key}_param`, op.param.toString());
            }
            if (rename) {
              formData.append(`${key}_rename`, rename);
            }
            formData.append(key, colString);
            operationsAdded++;
          } else if (op.type === 'growth_rate') {
            if (op.param && typeof op.param === 'object') {
              const growthRateParam = op.param as Record<string, any>;
              if (growthRateParam.period) {
                formData.append(`${key}_param`, growthRateParam.period.toString());
              }
              // Only send frequency if it's not 'none' or empty
              // Convert 'none' to empty string for backend (but keep 'none' in UI state)
              const frequencyValue = growthRateParam.frequency === 'none' ? '' : growthRateParam.frequency;
              if (frequencyValue && frequencyValue !== '') {
                formData.append(`${key}_frequency`, frequencyValue);
              }
              // Send comparison_type if provided
              if (growthRateParam.comparison_type && growthRateParam.comparison_type !== 'period') {
                formData.append(`${key}_comparison_type`, growthRateParam.comparison_type);
              }
            } else if (op.param) {
              // Fallback: if param is a string/number, treat as period
              formData.append(`${key}_param`, op.param.toString());
            }
            if (rename) {
              formData.append(`${key}_rename`, rename);
            }
            formData.append(key, colString);
            operationsAdded++;
          } else if (op.type === 'cumulative_sum') {
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
          } else if (op.type === 'fiscal_mapping') {
            if (op.param) {
              formData.append(`${key}_param`, op.param as string);
            }
            // Add fiscal start month parameter
            const fiscalStartMonth = (op as any).fiscalStartMonth || '1';
            formData.append(`${key}_fiscal_start_month`, fiscalStartMonth);
            if (rename) {
              formData.append(`${key}_rename`, rename);
            }
            formData.append(key, colString);
            operationsAdded++;
          } else if (op.type === 'is_weekend') {
            if (op.columns.filter(Boolean).length >= 1) {
              if (rename) {
                formData.append(`${key}_rename`, rename);
              }
              formData.append(key, colString);
              operationsAdded++;
            }
          } else if (op.type === 'is_month_end') {
            if (op.columns.filter(Boolean).length >= 1) {
              if (rename) {
                formData.append(`${key}_rename`, rename);
              }
              formData.append(key, colString);
              operationsAdded++;
            }
          } else if (op.type === 'is_qtr_end') {
            if (op.columns.filter(Boolean).length >= 1) {
              if (rename) {
                formData.append(`${key}_rename`, rename);
              }
              formData.append(key, colString);
              operationsAdded++;
            }
          } else if (op.type === 'date_builder') {
            if (op.columns.filter(Boolean).length >= 1) {
              // Add mode parameter (from_year_month_day or from_year_week_dayofweek)
              const mode = (op.param as string) || 'from_year_month_day';
              formData.append(`${key}_param`, mode);
              if (rename) {
                formData.append(`${key}_rename`, rename);
              }
              formData.append(key, colString);
              operationsAdded++;
            }
          } else if (op.type === 'replace') {
            if (op.columns.filter(Boolean).length >= 1) {
              if (op.param && typeof op.param === 'object') {
                const replaceParam = op.param as Record<string, any>;
                if (replaceParam.oldValue) {
                  formData.append(`${key}_oldValue`, replaceParam.oldValue);
                }
                if (replaceParam.newValue !== undefined) {
                  formData.append(`${key}_newValue`, replaceParam.newValue);
                }
              }
              formData.append(key, colString);
              operationsAdded++;
            }
          } else if (op.type === 'fill_na') {
            if (op.columns.filter(Boolean).length >= 1) {
              if (op.param && typeof op.param === 'object') {
                const fillNaParam = op.param as Record<string, any>;
                if (fillNaParam.strategy) {
                  formData.append(`${key}_strategy`, fillNaParam.strategy);
                }
                if (fillNaParam.customValue !== undefined && fillNaParam.strategy === 'custom') {
                  formData.append(`${key}_customValue`, fillNaParam.customValue);
                }
              }
              formData.append(key, colString);
              operationsAdded++;
            }
          } else if (op.type === 'select_columns' || op.type === 'drop_columns' || op.type === 'reorder' || op.type === 'deduplicate' || op.type === 'sort_rows') {
            // Dataframe operations: select_columns, drop_columns, reorder, deduplicate, sort_rows
            if (op.columns.filter(Boolean).length >= 1) {
              if (rename) {
                formData.append(`${key}_rename`, rename);
              }
              formData.append(key, colString);
              operationsAdded++;
            }
          } else if (op.type === 'filter_rows_condition') {
            // Filter rows based on conditions
            if (op.columns.filter(Boolean).length >= 1) {
              if (op.param && typeof op.param === 'object') {
                const filterParam = op.param as Record<string, any>;
                op.columns.filter(Boolean).forEach((col, idx) => {
                  const operator = filterParam[`condition_${idx}_operator`];
                  const value = filterParam[`condition_${idx}_value`];
                  if (operator !== undefined) {
                    formData.append(`${key}_condition_${idx}_operator`, operator);
                  }
                  if (value !== undefined && value !== '') {
                    formData.append(`${key}_condition_${idx}_value`, value.toString());
                  }
                });
              }
              formData.append(key, colString);
              operationsAdded++;
            }
          } else if (op.type === 'filter_top_n_per_group') {
            // Filter top N per group
            if (op.columns.filter(Boolean).length >= 1) {
              if (op.param && typeof op.param === 'object') {
                const filterParam = op.param as Record<string, any>;
                if (filterParam.n !== undefined) {
                  formData.append(`${key}_n`, filterParam.n.toString());
                }
                if (filterParam.metric_col !== undefined && filterParam.metric_col !== '') {
                  formData.append(`${key}_metric_col`, filterParam.metric_col);
                }
                if (filterParam.ascending !== undefined) {
                  formData.append(`${key}_ascending`, filterParam.ascending ? 'true' : 'false');
                }
              }
              formData.append(key, colString);
              operationsAdded++;
            }
          } else if (op.type === 'filter_percentile') {
            // Filter percentile - only needs metric_col, not columns selection
            if (op.param && typeof op.param === 'object') {
              const filterParam = op.param as Record<string, any>;
              const metricCol = filterParam.metric_col;
              
              // Check if metric_col is provided (required)
              if (metricCol && metricCol !== '') {
                if (filterParam.percentile !== undefined && filterParam.percentile !== '') {
                  formData.append(`${key}_percentile`, filterParam.percentile.toString());
                }
                formData.append(`${key}_metric_col`, metricCol);
                if (filterParam.direction !== undefined) {
                  formData.append(`${key}_direction`, filterParam.direction);
                }
                // Use metric_col as the column for backend compatibility
                formData.append(key, metricCol);
                operationsAdded++;
              }
            }
          } else if (op.type === 'compute_metrics_within_group') {
            // Compute metrics within group - uses identifiers as columns, and metric_col + method
            if (op.columns.filter(Boolean).length >= 1 && op.param && typeof op.param === 'object') {
              const computeParam = op.param as Record<string, any>;
              const metricCols = computeParam.metric_cols || [];
              
              // Find ALL valid metric_col + method pairs
              const validPairs = metricCols.filter((item: any) => item.metric_col && item.metric_col !== '' && item.method && item.method !== '');
              
              if (validPairs.length > 0) {
                // Check for duplicate column names
                const columnNames = validPairs.map((p: any) => p.rename || `${p.metric_col}_group_${p.method}`).filter(Boolean);
                const duplicates = columnNames.filter((name: string, idx: number) => columnNames.indexOf(name) !== idx);
                if (duplicates.length > 0) {
                  toast({
                    title: "Error",
                    description: `Duplicate column names found: ${duplicates.join(', ')}`,
                    variant: "destructive",
                  });
                  return;
                }
                
                // Send identifiers as columns
                formData.append(key, colString);
                // Send all metric columns, methods, and renames as JSON array
                formData.append(`${key}_metric_cols`, JSON.stringify(validPairs.map((p: any) => ({ metric_col: p.metric_col, method: p.method, rename: p.rename || '' }))));
                operationsAdded++;
              }
            }
          } else if (op.type === 'group_share_of_total') {
            // Group share of total - uses identifiers as columns, and metric_col (no method needed)
            if (op.columns.filter(Boolean).length >= 1 && op.param && typeof op.param === 'object') {
              const computeParam = op.param as Record<string, any>;
              const metricCols = computeParam.metric_cols || [];
              
              // Find ALL valid metric_col pairs (no method needed)
              const validPairs = metricCols.filter((item: any) => item.metric_col && item.metric_col !== '');
              
              if (validPairs.length > 0) {
                // Check for duplicate column names
                const columnNames = validPairs.map((p: any) => p.rename || `${p.metric_col}_share_of_total`).filter(Boolean);
                const duplicates = columnNames.filter((name: string, idx: number) => columnNames.indexOf(name) !== idx);
                if (duplicates.length > 0) {
                  toast({
                    title: "Error",
                    description: `Duplicate column names found: ${duplicates.join(', ')}`,
                    variant: "destructive",
                  });
                  return;
                }
                
                // Send identifiers as columns
                formData.append(key, colString);
                // Send all metric columns and renames as JSON array (no method)
                formData.append(`${key}_metric_cols`, JSON.stringify(validPairs.map((p: any) => ({ metric_col: p.metric_col, rename: p.rename || '' }))));
                operationsAdded++;
              }
            }
          } else if (op.type === 'group_contribution') {
            // Group contribution - uses identifiers as columns, and metric_col (no method needed)
            if (op.columns.filter(Boolean).length >= 1 && op.param && typeof op.param === 'object') {
              const computeParam = op.param as Record<string, any>;
              const metricCols = computeParam.metric_cols || [];
              
              // Find ALL valid metric_col pairs (no method needed)
              const validPairs = metricCols.filter((item: any) => item.metric_col && item.metric_col !== '');
              
              if (validPairs.length > 0) {
                // Check for duplicate column names
                const columnNames = validPairs.map((p: any) => p.rename || `${p.metric_col}_contribution`).filter(Boolean);
                const duplicates = columnNames.filter((name: string, idx: number) => columnNames.indexOf(name) !== idx);
                if (duplicates.length > 0) {
                  toast({
                    title: "Error",
                    description: `Duplicate column names found: ${duplicates.join(', ')}`,
                    variant: "destructive",
                  });
                  return;
                }
                
                // Send identifiers as columns
                formData.append(key, colString);
                // Send all metric columns and renames as JSON array (no method)
                formData.append(`${key}_metric_cols`, JSON.stringify(validPairs.map((p: any) => ({ metric_col: p.metric_col, rename: p.rename || '' }))));
                operationsAdded++;
              }
            }
          } else if (op.type === 'rename') {
            // Rename operation: each column can have its own rename value
            if (op.columns.filter(Boolean).length >= 1) {
              // For rename, we need to handle multiple rename values
              // If rename is an object, join the values with commas
              // Otherwise, use the rename string directly
              let renameValue = '';
              if (op.rename && typeof op.rename === 'object') {
                const renameObj = op.rename as Record<string, any>;
                // Get rename values in the same order as columns, convert to lowercase for case-insensitive matching
                const renameValues = op.columns
                  .map((col, idx) => col ? ((renameObj[idx] || '').toLowerCase()) : '')
                  .filter(Boolean);
                renameValue = renameValues.join(',');
              } else if (op.rename) {
                // Convert to lowercase for case-insensitive matching
                renameValue = op.rename.toString().toLowerCase();
              }
              
              if (renameValue) {
                formData.append(`${key}_rename`, renameValue);
              }
              formData.append(key, colString);
              operationsAdded++;
            }
          } else {
            // For dummy, rpi, detrend, deseasonalize, etc., require at least 1 column
            if (rename) {
              formData.append(`${key}_rename`, rename);
            }
            formData.append(key, colString);
            operationsAdded++;
          }
          // Add period if user supplied for detrend/deseasonalize operations
          // Note: key is set before operationsAdded is incremented, so use key directly
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
      
      // Filter out datetime-extracted columns and generated columns from identifiers
      const datetimeSuffixes = ['_year', '_month', '_week', '_day', '_day_name', '_month_name'];
      const generatedSuffixes = ['_dummy', '_detrended', '_deseasonalized', '_detrend_deseasonalized', '_log', '_sqrt', '_exp', '_power', '_logistic', '_abs', '_scaled', '_zscore', '_minmax', '_residual', '_outlier', '_rpi', '_lag', '_lead', '_diff', '_growth_rate', '_rolling_mean', '_rolling_sum', '_rolling_min', '_rolling_max', '_cumulative_sum'];
      const filteredIdentifiers = selectedIdentifiers.filter(id => {
        const idLower = id.toLowerCase();
        // Exclude any column that contains "date" in its name
        if (idLower.includes('date')) return false;
        // Exclude any columns ending with datetime suffixes
        if (datetimeSuffixes.some(suffix => idLower.endsWith(suffix))) return false;
        // Exclude generated columns (created by operations)
        if (generatedSuffixes.some(suffix => idLower.endsWith(suffix))) return false;
        // Only include if selected by user
        if (!selectedIdentifiersForBackend.has(id)) return false;
        return true;
      });
      
      formData.append('identifiers', filteredIdentifiers.join(','));
      
      // Debug: Log all FormData entries
      // console.log('🔍 MetricsColOps - FormData entries:');
      // for (const [key, value] of formData.entries()) {
      //   console.log(`  ${key}: ${value}`);
      // }
      
      // Call backend
      const res = await fetch(`${CREATECOLUMN_API}/perform`, {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        // Try to get error details from response
        let errorDetail = `Backend error ${res.status}`;
        try {
          const errorData = await res.json();
          errorDetail = errorData.detail || errorData.error || errorData.message || errorDetail;
        } catch (e) {
          // If response is not JSON, use status text
          errorDetail = res.statusText || errorDetail;
        }
        throw new Error(errorDetail);
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
      
      // Prepare operation details - expand operations for metadata storage
      const operation_details = {
        input_file: metricsInputs.dataSource,
        operations: expandOperationsForMetadata(selectedOperations)
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
      
      // ========================================================================
      // SAVE COLUMN OPERATIONS TO PIPELINE EXECUTION
      // ========================================================================
      try {
        const created_columns = buildCreatedColumns(selectedOperations);
        
        const operations_for_pipeline = selectedOperations.map(op => ({
          id: op.id,
          type: op.type,
          name: op.name,
          columns: op.columns || [],
          rename: op.rename || null,
          param: op.param || null,
          created_column_name: op.rename && typeof op.rename === 'string' && op.rename.trim()
            ? op.rename.trim()
            : getOutputColName(op)
        }));
        
        await fetch(`${PIPELINE_API}/save-column-operations?client_name=${encodeURIComponent(env.CLIENT_NAME || '')}&app_name=${encodeURIComponent(env.APP_NAME || '')}&project_name=${encodeURIComponent(env.PROJECT_NAME || '')}&mode=laboratory`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input_file: metricsInputs.dataSource,
            output_file: null, // Overwrite, so no new file
            overwrite_original: true,
            operations: operations_for_pipeline,
            created_columns: created_columns,
            identifiers: columnOpsSelectedIdentifiersForBackend || []  // Send identifiers for grouping operations
          }),
        });
        console.log('✅ Column operations saved to pipeline execution');
      } catch (err) {
        console.warn('⚠️ Failed to save column operations to pipeline execution:', err);
        // Don't fail the save operation if pipeline save fails
      }
      
      // ========================================================================
      // AUTO-DISPLAY IN TABLE ATOM (Save - overwrites same dataframe)
      // ========================================================================
      await handleTableAtomAutoDisplay(savedFile, metricsInputs, true);
      
      // Call onColumnCreated for each created column (for guided flow)
      if (onColumnCreated) {
        const resolveObjectName = (objectName: string) => {
          if (!objectName) return objectName;
          if (objectName.includes('/')) return objectName;
          try {
            const env = JSON.parse(localStorage.getItem('env') || '{}');
            const { CLIENT_NAME, APP_NAME, PROJECT_NAME } = env;
            if (CLIENT_NAME && APP_NAME && PROJECT_NAME) {
              return `${CLIENT_NAME}/${APP_NAME}/${PROJECT_NAME}/${objectName}`;
            }
          } catch {}
          return objectName;
        };
        
        selectedOperations.forEach(op => {
          const columnName = op.rename && typeof op.rename === 'string' ? op.rename : getOutputColName(op);
          if (columnName) {
            onColumnCreated({
              columnName: columnName,
              tableName: filename.split('/').pop() || filename,
              operations: [op.type],
              objectName: resolveObjectName(savedFile),
              operationDetails: [{
                type: op.type,
                columns: op.columns || [],
                parameters: op.param ? (typeof op.param === 'object' ? op.param : { value: op.param }) : undefined,
              }],
            });
          }
        });
      }
      
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
    // Generate default filename (remove file extension before timestamp)
    const sourceFile = metricsInputs.dataSource?.split('/')?.pop() || 'data';
    const filenameWithoutExt = sourceFile.includes('.') ? sourceFile.substring(0, sourceFile.lastIndexOf('.')) : sourceFile;
    const defaultFilename = `createcolumn_${filenameWithoutExt}_${Date.now()}`;
    setSaveFileName(defaultFilename);
    setShowSaveModal(true);
  };

  // Expose save methods via ref
  React.useImperativeHandle(ref, () => ({
    save: handleSave,
    saveAs: handleSaveAs,
    canSave: () => selectedOperations.length > 0 && !!metricsInputs.dataSource,
    isSaving: () => saveLoading,
  }), [selectedOperations.length, metricsInputs.dataSource, saveLoading]);

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
      
      // Prepare operation details - expand operations for metadata storage
      const operation_details = {
        input_file: metricsInputs.dataSource || 'unknown_input_file',
        operations: expandOperationsForMetadata(selectedOperations)
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
      
      // ========================================================================
      // SAVE COLUMN OPERATIONS TO PIPELINE EXECUTION
      // ========================================================================
      try {
        const created_columns = buildCreatedColumns(selectedOperations);
        
        const operations_for_pipeline = selectedOperations.map(op => ({
          id: op.id,
          type: op.type,
          name: op.name,
          columns: op.columns || [],
          rename: op.rename || null,
          param: op.param || null,
          created_column_name: op.rename && typeof op.rename === 'string' && op.rename.trim()
            ? op.rename.trim()
            : getOutputColName(op)
        }));
        
        await fetch(`${PIPELINE_API}/save-column-operations?client_name=${encodeURIComponent(env.CLIENT_NAME || '')}&app_name=${encodeURIComponent(env.APP_NAME || '')}&project_name=${encodeURIComponent(env.PROJECT_NAME || '')}&mode=laboratory`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input_file: metricsInputs.dataSource,
            output_file: savedFile, // New file created
            overwrite_original: false,
            operations: operations_for_pipeline,
            created_columns: created_columns,
            identifiers: columnOpsSelectedIdentifiersForBackend || []  // Send identifiers for grouping operations
          }),
        });
        console.log('✅ Column operations saved to pipeline execution');
      } catch (err) {
        console.warn('⚠️ Failed to save column operations to pipeline execution:', err);
        // Don't fail the save operation if pipeline save fails
      }
      
      // ========================================================================
      // AUTO-DISPLAY IN TABLE ATOM (Save As - creates new dataframe)
      // ========================================================================
      await handleTableAtomAutoDisplay(savedFile, metricsInputs, false);
      
      // Call onTableCreated (for guided flow)
      if (onTableCreated) {
        const resolveObjectName = (objectName: string) => {
          if (!objectName) return objectName;
          if (objectName.includes('/')) return objectName;
          try {
            const env = JSON.parse(localStorage.getItem('env') || '{}');
            const { CLIENT_NAME, APP_NAME, PROJECT_NAME } = env;
            if (CLIENT_NAME && APP_NAME && PROJECT_NAME) {
              return `${CLIENT_NAME}/${APP_NAME}/${PROJECT_NAME}/${objectName}`;
            }
          } catch {}
          return objectName;
        };
        
        const newTableName = saveFileName.trim().replace('.arrow', '') || `createcolumn_${metricsInputs.dataSource?.split('/')?.pop() || 'data'}_${Date.now()}`;
        onTableCreated({
          newTableName: newTableName,
          originalTableName: metricsInputs.dataSource?.split('/').pop() || metricsInputs.dataSource || 'unknown',
          objectName: resolveObjectName(savedFile),
        });
      }
      
      toast({ title: 'Success', description: 'DataFrame saved successfully.' });
    } catch (err: any) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save DataFrame';
      setSaveError(errorMsg);
      toast({ title: 'Error', description: errorMsg, variant: 'destructive' });
    } finally {
      setSaveLoading(false);
    }
  };

  // Helper function to handle table atom auto-display after save
  const handleTableAtomAutoDisplay = async (
    savedFile: string,
    metricsInputs: any,
    isOverwrite: boolean
  ) => {
    try {
      // console.log('🎯 [MetricsColOps Table Atom] Save completed, handling table atom display:', {
      //   savedFile,
      //   isOverwrite,
      //   contextCardId: metricsInputs.contextCardId,
      //   contextAtomId: metricsInputs.contextAtomId
      // });

      const store = useLaboratoryStore.getState();
      const contextCardId = metricsInputs.contextCardId;
      const contextAtomId = metricsInputs.contextAtomId;

      // console.log('🎯 [MetricsColOps Table Atom] Checking context:', {
      //   contextCardId,
      //   contextAtomId,
      //   savedFile,
      //   hasContext: !!(contextCardId && contextAtomId),
      //   allMetricsInputs: metricsInputs
      // });

      if (contextCardId && contextAtomId) {
        // Context available - check atom type
        const card = store.findCardByAtomId?.(contextAtomId);
        const currentAtom = card?.atoms.find(a => a.id === contextAtomId);

        // console.log('🎯 [MetricsColOps Table Atom] Context found:', {
        //   cardFound: !!card,
        //   cardId: card?.id,
        //   cardIndex: card ? store.cards.findIndex(c => c.id === card.id) : -1,
        //   currentAtomType: currentAtom?.atomId,
        //   currentAtomId: currentAtom?.id,
        //   allCardsCount: store.cards.length,
        //   allCardIds: store.cards.map(c => c.id)
        // });

        if (currentAtom?.atomId === 'table') {
          // Update existing Table atom
          // console.log('✅ [MetricsColOps Table Atom] Condition 1: Updating existing Table atom', {
          //   contextAtomId,
          //   savedFile
          // });
          await store.updateTableAtomWithFile?.(contextAtomId, savedFile);
          toast({
            title: 'Table updated',
            description: 'The updated dataframe has been displayed in the Table atom'
          });
        } else if (currentAtom) {
          // Condition 2: Replace atom with Table, move original to next card
          // BUT FIRST: Check if pattern already exists (Card N = Table, Card N+1 = Original atom)
          const cardN = card;
          const cardNIndex = store.findCardIndex?.(contextCardId) ?? -1;
          const cards = store.cards;
          const cardNPlus1 = cardNIndex >= 0 && cardNIndex < cards.length - 1 ? cards[cardNIndex + 1] : undefined;
          
          // Check pattern: Card N has Table AND Card N+1 has original atom
          const hasTableAtN = cardN?.atoms[0]?.atomId === 'table';
          const hasCardNPlus1 = !!cardNPlus1;
          const hasOriginalAtomAtNPlus1 = hasCardNPlus1 && 
            cardNPlus1.atoms[0]?.id === contextAtomId;
          
          // console.log('🔍 [Condition 2] Pattern check:', {
          //   cardNIndex,
          //   hasTableAtN,
          //   hasCardNPlus1,
          //   hasOriginalAtomAtNPlus1,
          //   cardNAtomType: cardN?.atoms[0]?.atomId,
          //   cardNPlus1AtomId: cardNPlus1?.atoms[0]?.id,
          //   contextAtomId
          // });
          
          if (hasTableAtN && hasCardNPlus1 && hasOriginalAtomAtNPlus1) {
            // Pattern exists - check files
            const tableAtN = cardN.atoms[0];
            const originalAtomAtNPlus1 = cardNPlus1.atoms[0];
            
            // Get source files from different possible locations
            const tableFile = tableAtN.settings?.sourceFile;
            const originalFile = originalAtomAtNPlus1.settings?.sourceFile || 
                               originalAtomAtNPlus1.settings?.dataSource ||
                               originalAtomAtNPlus1.settings?.file_key ||
                               originalAtomAtNPlus1.settings?.selectedDataSource;
            const newFile = savedFile;
            
            // console.log('🔍 [Condition 2] File comparison:', {
            //   tableFile,
            //   originalFile,
            //   newFile,
            //   sameFile: tableFile === originalFile && originalFile === newFile
            // });
            
            if (tableFile === originalFile && originalFile === newFile) {
              // Same file → Update Table at N
              // console.log('✅ [Condition 2] Same file detected - updating Table at N');
              await store.updateTableAtomWithFile?.(tableAtN.id, newFile);
              
              toast({
                title: 'Table updated',
                description: 'The updated dataframe has been displayed in the Table atom'
              });
            } else {
              // Different file → Move old Table to N-1, create new Table at N
              // console.log('🔄 [Condition 2] Different file detected - moving old Table to N-1, creating new Table at N');
              
              // Save old Table atom
              const oldTableAtom = { ...tableAtN };
              
              // Create new Table atom with new file
              const newTableAtomId = `table-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
              const tableAtomInfo = allAtoms.find(a => a.id === 'table');
              const newTableAtom: any = {
                id: newTableAtomId,
                atomId: 'table',
                title: tableAtomInfo?.title || 'Table',
                category: tableAtomInfo?.category || 'Atom',
                color: tableAtomInfo?.color || 'bg-teal-500',
                source: 'ai' as const,
                settings: {
                  sourceFile: newFile,
                  mode: 'load',
                  visibleColumns: [],
                  columnOrder: [],
                  columnWidths: {},
                  rowHeight: 24,
                  rowHeights: {},
                  showRowNumbers: true,
                  showSummaryRow: false,
                  frozenColumns: 0,
                  filters: {},
                  sortConfig: [],
                  currentPage: 1,
                  pageSize: 15,
                }
              };
              
              // Create card for old Table at N-1
              const oldTableCardId = `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
              const oldTableCard: LayoutCard = {
                id: oldTableCardId,
                atoms: [oldTableAtom],
                isExhibited: false,
                variables: cardN.variables || [],
                moleculeId: cardN.moleculeId,
                moleculeTitle: cardN.moleculeTitle,
              };
              
              // Update cards array: Insert old Table at N-1, replace N with new Table
              const updatedCards = [
                ...cards.slice(0, cardNIndex),
                oldTableCard,                        // N-1: Old Table
                { ...cardN, atoms: [newTableAtom] },  // N: New Table
                ...cards.slice(cardNIndex + 1)        // N+1 onwards (includes original atom)
              ];
              
              store.setCards(updatedCards);
              
              toast({
                title: 'Data displayed in Table',
                description: 'The updated dataframe has been displayed in a new Table atom. The previous Table has been moved to the previous card.'
              });
            }
          } else {
            // No pattern - use existing replacement logic
            // console.log('🔄 [MetricsColOps Table Atom] Condition 2: No pattern found, using standard replacement', {
            //   contextCardId,
            //   contextAtomId,
            //   currentAtomType: currentAtom.atomId,
            //   savedFile
            // });
            const result = await store.replaceAtomWithTable?.(
              contextCardId,
              contextAtomId,
              savedFile
            );

            if (result?.success && result.tableAtomId) {
              toast({
                title: 'Data displayed in Table',
                description: 'The updated dataframe has been displayed in a Table atom. The original atom has been moved to the next card.'
              });
            } else {
              console.warn('⚠️ [MetricsColOps Table Atom] Failed to replace atom:', result?.error);
            }
          }
        } else {
          // console.warn('⚠️ [MetricsColOps Table Atom] Atom not found in card, creating new card', {
          //   contextCardId,
          //   contextAtomId,
          //   cardFound: !!card,
          //   cardAtoms: card?.atoms.map(a => ({ id: a.id, atomId: a.atomId }))
          // });
          // Atom not found, create new card
          const result = await store.createCardWithTableAtom?.(savedFile);
          // console.log('🆕 [MetricsColOps Table Atom] createCardWithTableAtom result (atom not found):', result);
          
          if (result && result.tableAtomId && result.cardId) {
            // console.log('✅ [MetricsColOps Table Atom] Created new card with Table atom (atom not found case)', {
            //   tableAtomId: result.tableAtomId,
            //   cardId: result.cardId
            // });
            
            // Auto-set context to the newly created Table atom
            const beforeContext = store.metricsInputs;
            store.updateMetricsInputs({
              contextCardId: result.cardId,
              contextAtomId: result.tableAtomId,
            });
            
            // Verify context was set
            // const afterContext = useLaboratoryStore.getState().metricsInputs;
            // console.log('✅ [Condition 3] Auto-set context (atom not found case):', {
            //   beforeContext: {
            //     contextCardId: beforeContext.contextCardId,
            //     contextAtomId: beforeContext.contextAtomId
            //   },
            //   settingContext: {
            //     contextCardId: result.cardId,
            //     contextAtomId: result.tableAtomId
            //   },
            //   afterContext: {
            //     contextCardId: afterContext.contextCardId,
            //     contextAtomId: afterContext.contextAtomId
            //   },
            //   contextSet: afterContext.contextCardId === result.cardId && afterContext.contextAtomId === result.tableAtomId
            // });
            
            toast({
              title: 'Data displayed in Table',
              description: 'The updated dataframe has been displayed in a new Table atom'
            });
          }
        }
      } else {
        // No context - create new card with Table atom
        // console.log('🆕 [MetricsColOps Table Atom] Condition 3: No context, creating new card', {
        //   contextCardId,
        //   contextAtomId,
        //   savedFile
        // });
        const result = await store.createCardWithTableAtom?.(savedFile);
        // console.log('🆕 [MetricsColOps Table Atom] createCardWithTableAtom result:', result);
        
        if (result && result.tableAtomId && result.cardId) {
          // console.log('✅ [MetricsColOps Table Atom] Created new card with Table atom', {
          //   tableAtomId: result.tableAtomId,
          //   cardId: result.cardId,
          //   savedFile
          // });
          
          // Auto-set context to the newly created Table atom (Condition 3)
          const beforeContext = store.metricsInputs;
          store.updateMetricsInputs({
            contextCardId: result.cardId,
            contextAtomId: result.tableAtomId,
          });
          
          // Verify context was set
          // const afterContext = useLaboratoryStore.getState().metricsInputs;
          // console.log('✅ [Condition 3] Auto-set context to new Table:', {
          //   beforeContext: {
          //     contextCardId: beforeContext.contextCardId,
          //     contextAtomId: beforeContext.contextAtomId
          //   },
          //   settingContext: {
          //     contextCardId: result.cardId,
          //     contextAtomId: result.tableAtomId
          //   },
          //   afterContext: {
          //     contextCardId: afterContext.contextCardId,
          //     contextAtomId: afterContext.contextAtomId
          //   },
          //   contextSet: afterContext.contextCardId === result.cardId && afterContext.contextAtomId === result.tableAtomId
          // });
          
          toast({
            title: 'Data displayed in Table',
            description: 'The updated dataframe has been displayed in a new Table atom'
          });
        } else {
          console.warn('⚠️ [MetricsColOps Table Atom] Failed to create new card');
        }
      }
    } catch (tableError) {
      console.error('❌ [MetricsColOps Table Atom] Error:', tableError);
      // Don't fail the save operation if table display fails, but try fallback
      try {
        // console.log('🔄 [MetricsColOps Table Atom] Attempting fallback: create new card');
        const store = useLaboratoryStore.getState();
        const result = await store.createCardWithTableAtom?.(savedFile);
        if (result && result.tableAtomId && result.cardId) {
          // Auto-set context to the newly created Table atom (fallback case)
          store.updateMetricsInputs({
            contextCardId: result.cardId,
            contextAtomId: result.tableAtomId,
          });
          
          console.log('✅ [Condition 3 Fallback] Auto-set context to new Table:', {
            contextCardId: result.cardId,
            contextAtomId: result.tableAtomId
          });
        }
      } catch (fallbackError) {
        console.error('❌ [MetricsColOps Table Atom] Fallback error:', fallbackError);
      }
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
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-2 custom-scrollbar rounded-md">
                {filteredCategories.map((category) => (
                  <Collapsible
                    key={category.name}
                    open={openCategories[category.name] ?? false}
                    onOpenChange={() => toggleCategory(category.name)}
                  >
                    <CollapsibleTrigger className="flex items-center justify-between w-full p-1 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 rounded transition-colors">
                      <div className="flex items-center space-x-1.5 flex-1 min-w-0">
                        <div className="w-4 h-4 bg-gray-100 border border-gray-300 rounded flex items-center justify-center flex-shrink-0">
                          <category.icon className="w-2.5 h-2.5 text-gray-700" />
                        </div>
                        <span className="font-medium text-gray-900 text-[11px] truncate">{category.name}</span>
                        <span className="text-[10px] text-gray-400 flex-shrink-0">({category.operations.length})</span>
                      </div>
                      {openCategories[category.name] ? (
                        <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0 ml-1" />
                      ) : (
                        <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0 ml-1" />
                      )}
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-1.5 pb-1.5">
                      <div className="ml-2 pl-2 border-l-2 border-gray-200 grid grid-cols-2 gap-1.5">
                        {category.operations.map((op) => (
                          <TooltipProvider key={op.type} delayDuration={0}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div
                                  onClick={() => handleOperationClick(op)}
                                  className="p-1.5 border border-gray-200 rounded-lg bg-white transition-all cursor-pointer group relative flex items-center space-x-1.5 hover:shadow-md hover:border-gray-300"
                                >
                                  <Plus className="w-3 h-3 text-gray-600" />
                                  <span className="text-[10px] font-medium text-gray-900">{op.name}</span>
                                </div>
                              </TooltipTrigger>
                              {operationFormulas[op.type] && (
                                <TooltipContent side="top" className="text-xs">
                                  <p className="font-semibold mb-1">Formula:</p>
                                  <p>{operationFormulas[op.type]}</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </TooltipProvider>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                ))}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      {/* Identifiers List Section */}
      {selectedIdentifiers.length > 0 && (
        <Card className="border border-gray-200 shadow-sm">
          <Collapsible open={identifiersListOpen} onOpenChange={(open) => updateMetricsInputs({ columnOpsIdentifiersListOpen: open })}>
            <CardHeader className="pb-2 pt-3">
              <CollapsibleTrigger asChild>
                <CardTitle className="flex items-center justify-between text-sm font-semibold cursor-pointer hover:bg-gray-50 -mx-4 -my-2 px-4 py-2 rounded transition-colors">
                  <div className="flex items-center space-x-2">
                    {/* <Hash className="w-5 h-5 text-gray-600" /> */}
                    <span>Identifiers</span>
                    <span className="text-xs text-gray-400 font-normal">
                      ({getFilteredIdentifiersForBackend().length} of {selectedIdentifiers.length})
                    </span>
                  </div>
                  {identifiersListOpen ? (
                    <ChevronDown className="w-4 h-4 text-gray-600" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-600" />
                  )}
                </CardTitle>
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <div className="space-y-2">
                  <div className="text-[10px] text-gray-500 mb-2">
                    These are the identifiers for the selected file. Make sure to remove any date related columns from the selection.
                  </div>
                  <div className="max-h-48 overflow-y-auto pr-2 custom-scrollbar rounded-md">
                    <div className="grid grid-cols-2 gap-1">
                      {selectedIdentifiers.map((identifier, idx) => {
                        const idLower = identifier.toLowerCase();
                        const isDateColumn = idLower.includes('date');
                        const datetimeSuffixes = ['_year', '_month', '_week', '_day', '_day_name', '_month_name'];
                        const generatedSuffixes = ['_dummy', '_detrended', '_deseasonalized', '_detrend_deseasonalized', '_log', '_sqrt', '_exp', '_power', '_logistic', '_abs', '_scaled', '_zscore', '_minmax', '_residual', '_outlier', '_rpi', '_lag', '_lead', '_diff', '_growth_rate', '_rolling_mean', '_rolling_sum', '_rolling_min', '_rolling_max', '_cumulative_sum'];
                        const isGenerated = generatedSuffixes.some(suffix => idLower.endsWith(suffix));
                        const isDatetimeSuffix = datetimeSuffixes.some(suffix => idLower.endsWith(suffix));
                        const isTimeRelated = isDateColumn || isDatetimeSuffix || isGenerated;
                        const isSelected = selectedIdentifiersForBackend.has(identifier);
                        
                        return (
                          <TooltipProvider key={idx} delayDuration={0}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center space-x-1.5 p-1 hover:bg-gray-50 rounded">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    disabled={isTimeRelated}
                                    onChange={(e) => {
                                      const newSet = new Set(columnOpsSelectedIdentifiersForBackend);
                                      if (e.target.checked) {
                                        newSet.add(identifier);
                                      } else {
                                        newSet.delete(identifier);
                                      }
                                      updateMetricsInputs({ columnOpsSelectedIdentifiersForBackend: Array.from(newSet) });
                                    }}
                                    className="w-3 h-3 text-blue-600 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0"
                                  />
                                  <span className={`text-[10px] flex-1 truncate ${isTimeRelated ? 'text-gray-400' : isSelected ? 'text-blue-700 font-medium' : 'text-gray-600'}`} title={identifier}>
                                    {identifier}
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs max-w-xs">
                                <p>{identifier}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

      {selectedOperations.length > 0 && (
        <div className="space-y-2">
          {selectedOperations.map((selectedOperation) => {
            const opType = selectedOperation.type;
            const opColumns = selectedOperation.columns || [];
            const showPowerParam = opType === 'power';
            const showLogisticParam = opType === 'logistic';
            const showDatetimeParam = opType === 'datetime';
            const showFiscalMappingParam = opType === 'fiscal_mapping';
            const showDateBuilderParam = opType === 'date_builder';
            const showFillNaParam = opType === 'fill_na';
            const showLagParam = opType === 'lag';
            const showLeadParam = opType === 'lead';
            const showDiffParam = opType === 'diff';
            const showRollingParam = opType === 'rolling_mean' || opType === 'rolling_sum' || opType === 'rolling_min' || opType === 'rolling_max';
            const showGrowthRateParam = opType === 'growth_rate';
            const showSTLPeriodParam = opType === 'detrend' || opType === 'deseasonalize' || opType === 'detrend_deseasonalize';
            const isStandardize = opType.startsWith('standardize');
            // For individual column ops: allow rename only when 1 column, disable when multiple
            // For combine column ops: always allow rename (they create one combined result)
            // For in-place ops (lower, upper, strip): never allow rename (they modify original column)
            const isIndividualColumnOp = individualColumnOps.includes(opType);
            const isInPlaceOp = inPlaceOps.includes(opType);
            const isDataframeOp = dataframeOps.includes(opType);
            // Rename operation doesn't show the global rename field (each row has its own rename input)
            const allowRename = opType === 'rename'
              ? false
              : ((isInPlaceOp || isDataframeOp)
                ? false 
                : (isIndividualColumnOp 
                  ? (opColumns.length === 1) 
                  : (!isStandardize || (opColumns.length === 1))));

            return (
              <Card key={selectedOperation.id} className="bg-white">
                <CardContent className="pt-2 pb-2">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between pb-1 border-b border-gray-200">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 border border-green-200 text-green-700">
                        {selectedOperation.name}
                        {operationFormulas[selectedOperation.type] && (
                          <TooltipProvider delayDuration={0}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="w-3 h-3 text-gray-500 cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                <p className="font-semibold mb-1">Formula:</p>
                                <p>{operationFormulas[selectedOperation.type]}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
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
                      {selectedOperation.type === 'pct_change' ? (
                        <>
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-600">Columns</label>
                            <div className="grid grid-cols-2 gap-1">
                              <div className="[&_button]:h-6 [&_button]:text-[10px] [&_button]:max-w-full [&_button]:overflow-hidden [&_button]:text-ellipsis [&_button]:whitespace-nowrap [&_button_span]:overflow-hidden [&_button_span]:text-ellipsis [&_button_span]:whitespace-nowrap min-w-0">
                                <SingleSelectDropdown
                                  label=""
                                  placeholder="Column 1"
                                  value={opColumns[0] || ''}
                                  onValueChange={value => updateColumnSelector(selectedOperation.id, 0, value)}
                                  options={getAvailableColumns(opType).map(option => ({
                                    value: option,
                                    label: option
                                  }))}
                                  className="w-full space-y-0"
                                />
                              </div>
                              <div className="[&_button]:h-6 [&_button]:text-[10px] [&_button]:max-w-full [&_button]:overflow-hidden [&_button]:text-ellipsis [&_button]:whitespace-nowrap [&_button_span]:overflow-hidden [&_button_span]:text-ellipsis [&_button_span]:whitespace-nowrap min-w-0">
                                <SingleSelectDropdown
                                  label=""
                                  placeholder="Column 2"
                                  value={opColumns[1] || ''}
                                  onValueChange={value => updateColumnSelector(selectedOperation.id, 1, value)}
                                  options={getAvailableColumns(opType).map(option => ({
                                    value: option,
                                    label: option
                                  }))}
                                  className="w-full space-y-0"
                                />
                              </div>
                            </div>
                          </div>
                        </>
                      ) : selectedOperation.type === 'replace' ? (
                        <>
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-600">Column</label>
                            <div className="[&_button]:h-6 [&_button]:text-[10px] [&_button]:max-w-full [&_button]:overflow-hidden [&_button]:text-ellipsis [&_button]:whitespace-nowrap [&_button_span]:overflow-hidden [&_button_span]:text-ellipsis [&_button_span]:whitespace-nowrap min-w-0">
                              <SingleSelectDropdown
                                label=""
                                placeholder="Select column"
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
                            <>
                              <div className="space-y-1">
                                <label className="text-[10px] text-gray-600">Replace value</label>
                                <Select
                                  value={(selectedOperation.param as Record<string, any>)?.oldValue || ''}
                                  onValueChange={(value) => {
                                    const currentParam = (selectedOperation.param as Record<string, any>) || { oldValue: '', newValue: '' };
                                    updateMetricsOperation(selectedOperation.id, { param: { ...currentParam, oldValue: value } });
                                  }}
                                  onOpenChange={(open) => {
                                    // Fetch unique values when dropdown is opened
                                    if (open && opColumns[0]) {
                                      const existingValues = replaceUniqueValues[selectedOperation.id];
                                      // Only fetch if we don't already have values or if column changed
                                      if (!existingValues || existingValues.length === 0) {
                                        fetchReplaceUniqueValues(selectedOperation.id, opColumns[0]);
                                      }
                                    }
                                  }}
                                >
                                  <SelectTrigger className="h-6 text-[10px]">
                                    <SelectValue placeholder="Select value to replace" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {loadingReplaceValues[selectedOperation.id] ? (
                                      <div className="px-2 py-1.5 text-[10px] text-gray-500">Loading...</div>
                                    ) : (replaceUniqueValues[selectedOperation.id] || []).length > 0 ? (
                                      (replaceUniqueValues[selectedOperation.id] || [])
                                        .filter(val => val !== null && val !== undefined && val !== '')
                                        .map((val) => (
                                          <SelectItem key={val} value={String(val)} className="text-[10px]">
                                            {String(val)}
                                          </SelectItem>
                                        ))
                                    ) : (
                                      <div className="px-2 py-1.5 text-[10px] text-gray-500">No values available</div>
                                    )}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] text-gray-600">Replace with</label>
                                <input
                                  type="text"
                                  value={(selectedOperation.param as Record<string, any>)?.newValue || ''}
                                  onChange={e => {
                                    const currentParam = (selectedOperation.param as Record<string, any>) || { oldValue: '', newValue: '' };
                                    updateMetricsOperation(selectedOperation.id, { param: { ...currentParam, newValue: e.target.value } });
                                  }}
                                  placeholder="Enter replacement value"
                                  className="w-full px-1.5 py-1 h-6 text-[10px] border border-gray-200 rounded focus:border-gray-400 focus:ring-1 focus:ring-gray-100"
                                />
                              </div>
                            </>
                          )}
                        </>
                      ) : selectedOperation.type === 'fill_na' ? (
                        <>
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-600">Column</label>
                            <div className="[&_button]:h-6 [&_button]:text-[10px] [&_button]:max-w-full [&_button]:overflow-hidden [&_button]:text-ellipsis [&_button]:whitespace-nowrap [&_button_span]:overflow-hidden [&_button_span]:text-ellipsis [&_button_span]:whitespace-nowrap min-w-0">
                              <SingleSelectDropdown
                                label=""
                                placeholder="Select column"
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
                            <>
                              <div className="space-y-1">
                                <label className="text-[10px] text-gray-600">Method</label>
                                <Select
                                  value={(selectedOperation.param as Record<string, any>)?.strategy || ''}
                                  onValueChange={(value) => {
                                    const currentParam = (selectedOperation.param as Record<string, any>) || { strategy: '', customValue: '' };
                                    updateMetricsOperation(selectedOperation.id, { param: { ...currentParam, strategy: value } });
                                  }}
                                >
                                  <SelectTrigger className="h-6 text-[10px]">
                                    <SelectValue placeholder="Select method" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="mean" className="text-[10px]">Fill with Mean</SelectItem>
                                    <SelectItem value="median" className="text-[10px]">Fill with Median</SelectItem>
                                    <SelectItem value="zero" className="text-[10px]">Fill with 0</SelectItem>
                                    <SelectItem value="mode" className="text-[10px]">Fill with Mode</SelectItem>
                                    <SelectItem value="empty" className="text-[10px]">Fill with Empty String</SelectItem>
                                    <SelectItem value="custom" className="text-[10px]">Custom Value</SelectItem>
                                    <SelectItem value="drop" className="text-[10px]">Drop Rows</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              {(selectedOperation.param as Record<string, any>)?.strategy === 'custom' && (
                                <div className="space-y-1">
                                  <label className="text-[10px] text-gray-600">Custom Value</label>
                                  <input
                                    type="text"
                                    value={(selectedOperation.param as Record<string, any>)?.customValue || ''}
                                    onChange={e => {
                                      const currentParam = (selectedOperation.param as Record<string, any>) || { strategy: '', customValue: '' };
                                      updateMetricsOperation(selectedOperation.id, { param: { ...currentParam, customValue: e.target.value } });
                                    }}
                                    placeholder="Enter custom value"
                                    className="w-full px-1.5 py-1 h-6 text-[10px] border border-gray-200 rounded focus:border-gray-400 focus:ring-1 focus:ring-gray-100"
                                  />
                                </div>
                              )}
                            </>
                          )}
                        </>
                      ) : selectedOperation.type === 'date_builder' ? (
                        <>
                          {/* Date builder has its own custom UI below in the showDateBuilderParam section */}
                          {/* No default column selector needed here */}
                        </>
                      ) : selectedOperation.type === 'rename' ? (
                        <>
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] text-gray-600">Columns</label>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => addColumnSelector(selectedOperation.id)}
                                className="h-5 w-5"
                              >
                                <Plus className="w-2.5 h-2.5" />
                              </Button>
                            </div>
                            <div className="space-y-1">
                              {opColumns.map((col, idx) => {
                                return (
                                  <div key={idx} className="flex items-center gap-1">
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
                                    <div className="flex-1">
                                      <input
                                        type="text"
                                        value={(selectedOperation.rename && typeof selectedOperation.rename === 'object' ? (selectedOperation.rename as Record<string, any>)[idx] : '') || ''}
                                        onChange={e => {
                                          const currentRename = (selectedOperation.rename && typeof selectedOperation.rename === 'object' ? selectedOperation.rename as Record<string, any> : {}) || {};
                                          // Convert to lowercase for case-insensitive matching
                                          const newRename = { ...currentRename, [idx]: e.target.value.toLowerCase() };
                                          updateMetricsOperation(selectedOperation.id, { rename: newRename });
                                        }}
                                        placeholder="New name"
                                        className="w-full px-1.5 py-1 h-6 text-[10px] border border-gray-200 rounded focus:border-gray-400 focus:ring-1 focus:ring-gray-100"
                                      />
                                    </div>
                                    {opColumns.length > 1 && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => {
                                          removeColumnSelector(selectedOperation.id, idx);
                                          // Also remove the rename value for this index
                                          const currentRename = (selectedOperation.rename && typeof selectedOperation.rename === 'object' ? selectedOperation.rename as Record<string, any> : {}) || {};
                                          const newRename = { ...currentRename };
                                          delete newRename[idx];
                                          // Reindex remaining rename values
                                          const reindexed: Record<string, any> = {};
                                          Object.keys(newRename).forEach((key, newIdx) => {
                                            const oldIdx = parseInt(key);
                                            if (oldIdx > idx) {
                                              reindexed[oldIdx - 1] = newRename[key];
                                            } else if (oldIdx < idx) {
                                              reindexed[oldIdx] = newRename[key];
                                            }
                                          });
                                          updateMetricsOperation(selectedOperation.id, { rename: reindexed });
                                        }}
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
                      ) : selectedOperation.type === 'filter_rows_condition' ? (
                        <>
                          <div className="space-y-1 w-full">
                            <label className="text-[10px] text-gray-600">Select Columns</label>
                            <div className="w-full">
                              <MultiSelectDropdown
                                placeholder="Select columns to filter"
                                selectedValues={opColumns.filter(Boolean)}
                                onSelectionChange={(selectedValues) => {
                                  updateOperationColumns(selectedOperation.id, selectedValues);
                                  // Initialize conditions for new columns
                                  const currentParam = (selectedOperation.param as Record<string, any>) || {};
                                  const newParam = { ...currentParam };
                                  selectedValues.forEach((col, idx) => {
                                    if (!newParam[`condition_${idx}_operator`]) {
                                      newParam[`condition_${idx}_operator`] = '==';
                                      newParam[`condition_${idx}_value`] = '';
                                    }
                                  });
                                  // Remove conditions for removed columns
                                  Object.keys(newParam).forEach(key => {
                                    if (key.startsWith('condition_') && !selectedValues.some((_, idx) => key === `condition_${idx}_operator` || key === `condition_${idx}_value`)) {
                                      delete newParam[key];
                                    }
                                  });
                                  updateMetricsOperation(selectedOperation.id, { param: newParam });
                                }}
                                options={getAvailableColumns(opType).map(option => ({
                                  value: option,
                                  label: option
                                }))}
                                showSelectAll={true}
                                showDeselectAll={true}
                                showTrigger={true}
                                triggerClassName="h-6 text-[10px] w-full"
                                maxHeight="200px"
                                className="w-full"
                              />
                            </div>
                          </div>
                          {opColumns.filter(Boolean).length > 0 && (
                            <div className="space-y-2">
                              <label className="text-[10px] text-gray-600">Conditions</label>
                              {opColumns.filter(Boolean).map((col, idx) => {
                                const currentParam = (selectedOperation.param as Record<string, any>) || {};
                                const operator = currentParam[`condition_${idx}_operator`] || '==';
                                const value = currentParam[`condition_${idx}_value`] || '';
                                return (
                                  <div key={idx} className="space-y-1 p-2 border border-gray-200 rounded">
                                    <div className="text-[10px] font-medium text-gray-700">{col}</div>
                                    <div className="grid grid-cols-2 gap-1">
                                      <Select
                                        value={operator}
                                        onValueChange={(newOperator) => {
                                          const newParam = { ...currentParam, [`condition_${idx}_operator`]: newOperator };
                                          updateMetricsOperation(selectedOperation.id, { param: newParam });
                                        }}
                                      >
                                        <SelectTrigger className="h-6 text-[10px]">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="==" className="text-[10px]">Equals (==)</SelectItem>
                                          <SelectItem value="!=" className="text-[10px]">Not Equals (!=)</SelectItem>
                                          <SelectItem value=">" className="text-[10px]">Greater Than (&gt;)</SelectItem>
                                          <SelectItem value=">=" className="text-[10px]">Greater or Equal (&gt;=)</SelectItem>
                                          <SelectItem value="<" className="text-[10px]">Less Than (&lt;)</SelectItem>
                                          <SelectItem value="<=" className="text-[10px]">Less or Equal (&lt;=)</SelectItem>
                                          <SelectItem value="contains" className="text-[10px]">Contains</SelectItem>
                                          <SelectItem value="not_contains" className="text-[10px]">Not Contains</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      <input
                                        type="text"
                                        value={value}
                                        onChange={e => {
                                          const newParam = { ...currentParam, [`condition_${idx}_value`]: e.target.value };
                                          updateMetricsOperation(selectedOperation.id, { param: newParam });
                                        }}
                                        placeholder="Value"
                                        className="w-full px-1.5 py-1 h-6 text-[10px] border border-gray-200 rounded focus:border-gray-400 focus:ring-1 focus:ring-gray-100"
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      ) : selectedOperation.type === 'filter_top_n_per_group' ? (
                        <>
                          <div className="space-y-1 w-full">
                            <label className="text-[10px] text-gray-600">Select Columns (Identifiers + Metric)</label>
                            <div className="w-full">
                              <MultiSelectDropdown
                                placeholder="Select columns (identifiers and metric)"
                                selectedValues={opColumns.filter(Boolean)}
                                onSelectionChange={(selectedValues) => {
                                  updateOperationColumns(selectedOperation.id, selectedValues);
                                }}
                                options={getAvailableColumns(opType).map(option => ({
                                  value: option,
                                  label: option
                                }))}
                                showSelectAll={true}
                                showDeselectAll={true}
                                showTrigger={true}
                                triggerClassName="h-6 text-[10px] w-full"
                                maxHeight="200px"
                                className="w-full"
                              />
                            </div>
                          </div>
                          {opColumns.filter(Boolean).length > 0 && (
                            <>
                              <div className="space-y-1">
                                <label className="text-[10px] text-gray-600">N (Number of rows)</label>
                                <input
                                  type="number"
                                  min="1"
                                  value={(selectedOperation.param as Record<string, any>)?.n || '1'}
                                  onChange={e => {
                                    const currentParam = (selectedOperation.param as Record<string, any>) || { n: '1', metric_col: '', ascending: false };
                                    updateMetricsOperation(selectedOperation.id, { param: { ...currentParam, n: e.target.value } });
                                  }}
                                  placeholder="1"
                                  className="w-full px-1.5 py-1 h-6 text-[10px] border border-gray-200 rounded focus:border-gray-400 focus:ring-1 focus:ring-gray-100"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] text-gray-600">Metric Column</label>
                                <Select
                                  value={(selectedOperation.param as Record<string, any>)?.metric_col || ''}
                                  onValueChange={(value) => {
                                    const currentParam = (selectedOperation.param as Record<string, any>) || { n: '1', metric_col: '', ascending: false };
                                    updateMetricsOperation(selectedOperation.id, { param: { ...currentParam, metric_col: value } });
                                  }}
                                >
                                  <SelectTrigger className="h-6 text-[10px]">
                                    <SelectValue placeholder="Select metric column" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {opColumns.filter(Boolean).map(col => (
                                      <SelectItem key={col} value={col} className="text-[10px]">{col}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] text-gray-600">Sort Order</label>
                                <Select
                                  value={(selectedOperation.param as Record<string, any>)?.ascending ? 'ascending' : 'descending'}
                                  onValueChange={(value) => {
                                    const currentParam = (selectedOperation.param as Record<string, any>) || { n: '1', metric_col: '', ascending: false };
                                    updateMetricsOperation(selectedOperation.id, { param: { ...currentParam, ascending: value === 'ascending' } });
                                  }}
                                >
                                  <SelectTrigger className="h-6 text-[10px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="descending" className="text-[10px]">Descending (Top N)</SelectItem>
                                    <SelectItem value="ascending" className="text-[10px]">Ascending (Bottom N)</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </>
                          )}
                        </>
                      ) : selectedOperation.type === 'filter_percentile' ? (
                        <>
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-600">Percentile (0-100)</label>
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={(selectedOperation.param as Record<string, any>)?.percentile || '10'}
                              onChange={e => {
                                const currentParam = (selectedOperation.param as Record<string, any>) || { percentile: '10', metric_col: '', direction: 'top' };
                                updateMetricsOperation(selectedOperation.id, { param: { ...currentParam, percentile: e.target.value } });
                              }}
                              placeholder="10"
                              className="w-full px-1.5 py-1 h-6 text-[10px] border border-gray-200 rounded focus:border-gray-400 focus:ring-1 focus:ring-gray-100"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-600">Metric Column (Numerical)</label>
                            <Select
                              value={(selectedOperation.param as Record<string, any>)?.metric_col || opColumns.filter(Boolean)[0] || ''}
                              onValueChange={(value) => {
                                const currentParam = (selectedOperation.param as Record<string, any>) || { percentile: '10', metric_col: '', direction: 'top' };
                                updateMetricsOperation(selectedOperation.id, { param: { ...currentParam, metric_col: value } });
                                // Update columns array with the metric column for backend compatibility
                                updateOperationColumns(selectedOperation.id, [value]);
                              }}
                            >
                              <SelectTrigger className="h-6 text-[10px]">
                                <SelectValue placeholder="Select numerical column" />
                              </SelectTrigger>
                              <SelectContent>
                                {numericalColumns.map(col => (
                                  <SelectItem key={col} value={col} className="text-[10px]">{col}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-600">Direction</label>
                            <Select
                              value={(selectedOperation.param as Record<string, any>)?.direction || 'top'}
                              onValueChange={(value) => {
                                const currentParam = (selectedOperation.param as Record<string, any>) || { percentile: '10', metric_col: '', direction: 'top' };
                                updateMetricsOperation(selectedOperation.id, { param: { ...currentParam, direction: value } });
                              }}
                            >
                              <SelectTrigger className="h-6 text-[10px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="top" className="text-[10px]">Top Percentile</SelectItem>
                                <SelectItem value="bottom" className="text-[10px]">Bottom Percentile</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </>
                      ) : selectedOperation.type === 'compute_metrics_within_group' ? (
                        <>
                          <div className="space-y-1 w-full">
                            <label className="text-[10px] text-gray-600">Identifiers</label>
                            <div className="w-full">
                              <MultiSelectDropdown
                                placeholder="Select identifiers for grouping"
                                selectedValues={opColumns.filter(Boolean)}
                                onSelectionChange={(selectedValues) => {
                                  updateOperationColumns(selectedOperation.id, selectedValues);
                                }}
                                options={(() => {
                                  // console.log('[MetricsColOps] compute_metrics_within_group identifiers options:', allIdentifiers);
                                  return allIdentifiers.map(id => ({
                                    value: id,
                                    label: id
                                  }));
                                })()}
                                showSelectAll={true}
                                showDeselectAll={true}
                                showTrigger={true}
                                triggerClassName="h-6 text-[10px] w-full"
                                maxHeight="200px"
                                className="w-full"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] text-gray-600">Numerical Column & Method</label>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  const currentParam = (selectedOperation.param as Record<string, any>) || { metric_cols: [{ metric_col: '', method: 'sum', rename: '' }] };
                                  const metricCols = currentParam.metric_cols || [{ metric_col: '', method: 'sum', rename: '' }];
                                  updateMetricsOperation(selectedOperation.id, { param: { ...currentParam, metric_cols: [...metricCols, { metric_col: '', method: 'sum', rename: '' }] } });
                                }}
                                className="h-5 w-5"
                              >
                                <Plus className="w-2.5 h-2.5" />
                              </Button>
                            </div>
                            {((selectedOperation.param as Record<string, any>)?.metric_cols || [{ metric_col: '', method: 'sum', rename: '' }]).map((item: any, idx: number) => {
                              const metricCols = (selectedOperation.param as Record<string, any>)?.metric_cols || [{ metric_col: '', method: 'sum', rename: '' }];
                              // Check for duplicate column names
                              const allRenames = metricCols.map((m: any) => m.rename || (m.metric_col && m.method ? `${m.metric_col}_group_${m.method}` : '')).filter(Boolean);
                              const duplicateRenames = allRenames.filter((name: string, i: number) => allRenames.indexOf(name) !== i);
                              const currentRename = item.rename || (item.metric_col && item.method ? `${item.metric_col}_group_${item.method}` : '');
                              const hasDuplicate = duplicateRenames.includes(currentRename) && currentRename;
                              
                              return (
                                <div key={idx} className="space-y-1">
                                  <div className="flex items-center gap-1">
                                    <div className="flex-1 [&_button]:h-6 [&_button]:text-[10px]">
                                      <SingleSelectDropdown
                                        label=""
                                        placeholder="Select numerical column"
                                        value={item.metric_col || ''}
                                        onValueChange={value => {
                                          const currentParam = (selectedOperation.param as Record<string, any>) || { metric_cols: [{ metric_col: '', method: 'sum', rename: '' }] };
                                          const newMetricCols = [...(currentParam.metric_cols || [{ metric_col: '', method: 'sum', rename: '' }])];
                                          newMetricCols[idx] = { ...newMetricCols[idx], metric_col: value };
                                          updateMetricsOperation(selectedOperation.id, { param: { ...currentParam, metric_cols: newMetricCols } });
                                        }}
                                        options={numericalColumns.map(option => ({
                                          value: option,
                                          label: option
                                        }))}
                                        className="w-full space-y-0"
                                      />
                                    </div>
                                    <div className="flex-1">
                                      <Select
                                        value={item.method || 'sum'}
                                        onValueChange={(value) => {
                                          const currentParam = (selectedOperation.param as Record<string, any>) || { metric_cols: [{ metric_col: '', method: 'sum', rename: '' }] };
                                          const newMetricCols = [...(currentParam.metric_cols || [{ metric_col: '', method: 'sum', rename: '' }])];
                                          newMetricCols[idx] = { ...newMetricCols[idx], method: value };
                                          updateMetricsOperation(selectedOperation.id, { param: { ...currentParam, metric_cols: newMetricCols } });
                                        }}
                                      >
                                        <SelectTrigger className="h-6 text-[10px]">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="sum" className="text-[10px]">Sum</SelectItem>
                                          <SelectItem value="mean" className="text-[10px]">Mean</SelectItem>
                                          <SelectItem value="median" className="text-[10px]">Median</SelectItem>
                                          <SelectItem value="max" className="text-[10px]">Max</SelectItem>
                                          <SelectItem value="min" className="text-[10px]">Min</SelectItem>
                                          <SelectItem value="count" className="text-[10px]">Count</SelectItem>
                                          <SelectItem value="nunique" className="text-[10px]">Nunique</SelectItem>
                                          <SelectItem value="rank" className="text-[10px]">Rank</SelectItem>
                                          <SelectItem value="rank_pct" className="text-[10px]">Rank Percentile</SelectItem>
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    {idx >= 1 && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => {
                                          const currentParam = (selectedOperation.param as Record<string, any>) || { metric_cols: [{ metric_col: '', method: 'sum', rename: '' }] };
                                          const newMetricCols = [...(currentParam.metric_cols || [{ metric_col: '', method: 'sum', rename: '' }])];
                                          newMetricCols.splice(idx, 1);
                                          updateMetricsOperation(selectedOperation.id, { param: { ...currentParam, metric_cols: newMetricCols } });
                                        }}
                                        className="h-4 w-4 text-red-400 hover:text-red-600 flex-shrink-0"
                                      >
                                        <Trash2 className="w-1.5 h-1.5" />
                                      </Button>
                                    )}
                                  </div>
                                  <div className="flex-1">
                                    <Input
                                      placeholder={item.metric_col && item.method ? `${item.metric_col}_group_${item.method}` : 'Column name (optional)'}
                                      value={item.rename || ''}
                                      onChange={(e) => {
                                        const currentParam = (selectedOperation.param as Record<string, any>) || { metric_cols: [{ metric_col: '', method: 'sum', rename: '' }] };
                                        const newMetricCols = [...(currentParam.metric_cols || [{ metric_col: '', method: 'sum', rename: '' }])];
                                        newMetricCols[idx] = { ...newMetricCols[idx], rename: e.target.value };
                                        updateMetricsOperation(selectedOperation.id, { param: { ...currentParam, metric_cols: newMetricCols } });
                                      }}
                                      className={`h-6 text-[10px] ${hasDuplicate ? 'border-red-500' : ''}`}
                                    />
                                    {hasDuplicate && (
                                      <p className="text-[9px] text-red-500 mt-0.5">Duplicate column name</p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      ) : selectedOperation.type === 'group_share_of_total' ? (
                        <>
                          <div className="space-y-1 w-full">
                            <label className="text-[10px] text-gray-600">Identifiers</label>
                            <div className="w-full">
                              <MultiSelectDropdown
                                placeholder="Select identifiers for grouping"
                                selectedValues={opColumns.filter(Boolean)}
                                onSelectionChange={(selectedValues) => {
                                  updateOperationColumns(selectedOperation.id, selectedValues);
                                }}
                                options={(() => {
                                  // console.log('[MetricsColOps] group_share_of_total identifiers options:', allIdentifiers);
                                  return allIdentifiers.map(id => ({
                                    value: id,
                                    label: id
                                  }));
                                })()}
                                showSelectAll={true}
                                showDeselectAll={true}
                                showTrigger={true}
                                triggerClassName="h-6 text-[10px] w-full"
                                maxHeight="200px"
                                className="w-full"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] text-gray-600">Numerical Column</label>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  const currentParam = (selectedOperation.param as Record<string, any>) || { metric_cols: [{ metric_col: '', rename: '' }] };
                                  const metricCols = currentParam.metric_cols || [{ metric_col: '', rename: '' }];
                                  updateMetricsOperation(selectedOperation.id, { param: { ...currentParam, metric_cols: [...metricCols, { metric_col: '', rename: '' }] } });
                                }}
                                className="h-5 w-5"
                              >
                                <Plus className="w-2.5 h-2.5" />
                              </Button>
                            </div>
                            {((selectedOperation.param as Record<string, any>)?.metric_cols || [{ metric_col: '', rename: '' }]).map((item: any, idx: number) => {
                              const metricCols = (selectedOperation.param as Record<string, any>)?.metric_cols || [{ metric_col: '', rename: '' }];
                              // Check for duplicate column names
                              const allRenames = metricCols.map((m: any) => m.rename || (m.metric_col ? `${m.metric_col}_share_of_total` : '')).filter(Boolean);
                              const duplicateRenames = allRenames.filter((name: string, i: number) => allRenames.indexOf(name) !== i);
                              const currentRename = item.rename || (item.metric_col ? `${item.metric_col}_share_of_total` : '');
                              const hasDuplicate = duplicateRenames.includes(currentRename) && currentRename;
                              
                              return (
                                <div key={idx} className="space-y-1">
                                  <div className="flex items-center gap-1">
                                    <div className="flex-1 [&_button]:h-6 [&_button]:text-[10px]">
                                      <SingleSelectDropdown
                                        label=""
                                        placeholder="Select numerical column"
                                        value={item.metric_col || ''}
                                        onValueChange={value => {
                                          const currentParam = (selectedOperation.param as Record<string, any>) || { metric_cols: [{ metric_col: '', rename: '' }] };
                                          const newMetricCols = [...(currentParam.metric_cols || [{ metric_col: '', rename: '' }])];
                                          newMetricCols[idx] = { ...newMetricCols[idx], metric_col: value };
                                          updateMetricsOperation(selectedOperation.id, { param: { ...currentParam, metric_cols: newMetricCols } });
                                        }}
                                        options={numericalColumns.map(option => ({
                                          value: option,
                                          label: option
                                        }))}
                                        className="w-full space-y-0"
                                      />
                                    </div>
                                    {idx >= 1 && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => {
                                          const currentParam = (selectedOperation.param as Record<string, any>) || { metric_cols: [{ metric_col: '', rename: '' }] };
                                          const newMetricCols = [...(currentParam.metric_cols || [{ metric_col: '', rename: '' }])];
                                          newMetricCols.splice(idx, 1);
                                          updateMetricsOperation(selectedOperation.id, { param: { ...currentParam, metric_cols: newMetricCols } });
                                        }}
                                        className="h-4 w-4 text-red-400 hover:text-red-600 flex-shrink-0"
                                      >
                                        <Trash2 className="w-1.5 h-1.5" />
                                      </Button>
                                    )}
                                  </div>
                                  <div className="flex-1">
                                    <Input
                                      placeholder={item.metric_col ? `${item.metric_col}_share_of_total` : 'Column name (optional)'}
                                      value={item.rename || ''}
                                      onChange={(e) => {
                                        const currentParam = (selectedOperation.param as Record<string, any>) || { metric_cols: [{ metric_col: '', rename: '' }] };
                                        const newMetricCols = [...(currentParam.metric_cols || [{ metric_col: '', rename: '' }])];
                                        newMetricCols[idx] = { ...newMetricCols[idx], rename: e.target.value };
                                        updateMetricsOperation(selectedOperation.id, { param: { ...currentParam, metric_cols: newMetricCols } });
                                      }}
                                      className={`h-6 text-[10px] ${hasDuplicate ? 'border-red-500' : ''}`}
                                    />
                                    {hasDuplicate && (
                                      <p className="text-[9px] text-red-500 mt-0.5">Duplicate column name</p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      ) : selectedOperation.type === 'group_contribution' ? (
                        <>
                          <div className="space-y-1 w-full">
                            <label className="text-[10px] text-gray-600">Identifiers</label>
                            <div className="w-full">
                              <MultiSelectDropdown
                                placeholder="Select identifiers for grouping"
                                selectedValues={opColumns.filter(Boolean)}
                                onSelectionChange={(selectedValues) => {
                                  updateOperationColumns(selectedOperation.id, selectedValues);
                                }}
                                options={(() => {
                                  // console.log('[MetricsColOps] group_contribution identifiers options:', allIdentifiers);
                                  return allIdentifiers.map(id => ({
                                    value: id,
                                    label: id
                                  }));
                                })()}
                                showSelectAll={true}
                                showDeselectAll={true}
                                showTrigger={true}
                                triggerClassName="h-6 text-[10px] w-full"
                                maxHeight="200px"
                                className="w-full"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] text-gray-600">Numerical Column</label>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => {
                                  const currentParam = (selectedOperation.param as Record<string, any>) || { metric_cols: [{ metric_col: '', rename: '' }] };
                                  const metricCols = currentParam.metric_cols || [{ metric_col: '', rename: '' }];
                                  updateMetricsOperation(selectedOperation.id, { param: { ...currentParam, metric_cols: [...metricCols, { metric_col: '', rename: '' }] } });
                                }}
                                className="h-5 w-5"
                              >
                                <Plus className="w-2.5 h-2.5" />
                              </Button>
                            </div>
                            {((selectedOperation.param as Record<string, any>)?.metric_cols || [{ metric_col: '', rename: '' }]).map((item: any, idx: number) => {
                              const metricCols = (selectedOperation.param as Record<string, any>)?.metric_cols || [{ metric_col: '', rename: '' }];
                              // Check for duplicate column names
                              const allRenames = metricCols.map((m: any) => m.rename || (m.metric_col ? `${m.metric_col}_contribution` : '')).filter(Boolean);
                              const duplicateRenames = allRenames.filter((name: string, i: number) => allRenames.indexOf(name) !== i);
                              const currentRename = item.rename || (item.metric_col ? `${item.metric_col}_contribution` : '');
                              const hasDuplicate = duplicateRenames.includes(currentRename) && currentRename;
                              
                              return (
                                <div key={idx} className="space-y-1">
                                  <div className="flex items-center gap-1">
                                    <div className="flex-1 [&_button]:h-6 [&_button]:text-[10px]">
                                      <SingleSelectDropdown
                                        label=""
                                        placeholder="Select numerical column"
                                        value={item.metric_col || ''}
                                        onValueChange={value => {
                                          const currentParam = (selectedOperation.param as Record<string, any>) || { metric_cols: [{ metric_col: '', rename: '' }] };
                                          const newMetricCols = [...(currentParam.metric_cols || [{ metric_col: '', rename: '' }])];
                                          newMetricCols[idx] = { ...newMetricCols[idx], metric_col: value };
                                          updateMetricsOperation(selectedOperation.id, { param: { ...currentParam, metric_cols: newMetricCols } });
                                        }}
                                        options={numericalColumns.map(option => ({
                                          value: option,
                                          label: option
                                        }))}
                                        className="w-full space-y-0"
                                      />
                                    </div>
                                    {idx >= 1 && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => {
                                          const currentParam = (selectedOperation.param as Record<string, any>) || { metric_cols: [{ metric_col: '', rename: '' }] };
                                          const newMetricCols = [...(currentParam.metric_cols || [{ metric_col: '', rename: '' }])];
                                          newMetricCols.splice(idx, 1);
                                          updateMetricsOperation(selectedOperation.id, { param: { ...currentParam, metric_cols: newMetricCols } });
                                        }}
                                        className="h-4 w-4 text-red-400 hover:text-red-600 flex-shrink-0"
                                      >
                                        <Trash2 className="w-1.5 h-1.5" />
                                      </Button>
                                    )}
                                  </div>
                                  <div className="flex-1">
                                    <Input
                                      placeholder={item.metric_col ? `${item.metric_col}_contribution` : 'Column name (optional)'}
                                      value={item.rename || ''}
                                      onChange={(e) => {
                                        const currentParam = (selectedOperation.param as Record<string, any>) || { metric_cols: [{ metric_col: '', rename: '' }] };
                                        const newMetricCols = [...(currentParam.metric_cols || [{ metric_col: '', rename: '' }])];
                                        newMetricCols[idx] = { ...newMetricCols[idx], rename: e.target.value };
                                        updateMetricsOperation(selectedOperation.id, { param: { ...currentParam, metric_cols: newMetricCols } });
                                      }}
                                      className={`h-6 text-[10px] ${hasDuplicate ? 'border-red-500' : ''}`}
                                    />
                                    {hasDuplicate && (
                                      <p className="text-[9px] text-red-500 mt-0.5">Duplicate column name</p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </>
                      ) : selectedOperation.type === 'select_columns' || selectedOperation.type === 'drop_columns' || selectedOperation.type === 'reorder' || selectedOperation.type === 'deduplicate' || selectedOperation.type === 'sort_rows' || selectedOperation.type === 'lower' || selectedOperation.type === 'upper' || selectedOperation.type === 'strip' ? (
                        <>
                          <div className="space-y-1 w-full">
                            <label className="text-[10px] text-gray-600">Select Columns</label>
                            <div className="w-full">
                              <MultiSelectDropdown
                                placeholder={
                                  selectedOperation.type === 'select_columns' 
                                    ? "Select columns to keep" 
                                    : selectedOperation.type === 'drop_columns'
                                    ? "Select columns to drop"
                                    : selectedOperation.type === 'reorder'
                                    ? "Select columns in desired order"
                                    : selectedOperation.type === 'deduplicate'
                                    ? "Select columns to check for duplicates"
                                    : selectedOperation.type === 'sort_rows'
                                    ? "Select columns to sort by (in priority order)"
                                    : "Select columns to transform"
                                }
                                selectedValues={opColumns.filter(Boolean)}
                                onSelectionChange={(selectedValues) => {
                                  updateOperationColumns(selectedOperation.id, selectedValues);
                                }}
                                options={getAvailableColumns(opType).map(option => ({
                                  value: option,
                                  label: option
                                }))}
                                showSelectAll={true}
                                showDeselectAll={true}
                                showTrigger={true}
                                triggerClassName="h-6 text-[10px] w-full"
                                maxHeight="200px"
                                className="w-full"
                              />
                            </div>
                          </div>
                        </>
                      ) : selectedOperation.type === 'residual' ? (
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
                                const isIndividualColumnOp = individualColumnOps.includes(opType);
                                // For individual column ops: show trash when > 1 column
                                // For combine column ops: show trash when > 2 columns
                                // For single column ops: show trash when > 1 column
                                const shouldShowTrash = isIndividualColumnOp 
                                  ? opColumns.length > 1 
                                  : (isMultiColumn ? opColumns.length > 2 : opColumns.length > 1);
                                
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
                                    {shouldShowTrash && (
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

                    {showLagParam && (
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-600">Period</label>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          value={selectedOperation.param || ''}
                          onChange={e => {
                            updateMetricsOperation(selectedOperation.id, { param: e.target.value });
                          }}
                          placeholder="Enter period"
                          className="w-full px-1.5 py-1 h-6 text-[10px] border border-gray-200 rounded focus:border-gray-400 focus:ring-1 focus:ring-gray-100"
                        />
                      </div>
                    )}

                    {showLeadParam && (
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-600">Period</label>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          value={selectedOperation.param || ''}
                          onChange={e => {
                            updateMetricsOperation(selectedOperation.id, { param: e.target.value });
                          }}
                          placeholder="Enter period"
                          className="w-full px-1.5 py-1 h-6 text-[10px] border border-gray-200 rounded focus:border-gray-400 focus:ring-1 focus:ring-gray-100"
                        />
                      </div>
                    )}

                    {showDiffParam && (
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-600">Period</label>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          value={selectedOperation.param || ''}
                          onChange={e => {
                            updateMetricsOperation(selectedOperation.id, { param: e.target.value });
                          }}
                          placeholder="Enter period"
                          className="w-full px-1.5 py-1 h-6 text-[10px] border border-gray-200 rounded focus:border-gray-400 focus:ring-1 focus:ring-gray-100"
                        />
                      </div>
                    )}

                    {showRollingParam && (
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-600">Window</label>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          value={selectedOperation.param || ''}
                          onChange={e => {
                            updateMetricsOperation(selectedOperation.id, { param: e.target.value });
                          }}
                          placeholder="Enter window size"
                          className="w-full px-1.5 py-1 h-6 text-[10px] border border-gray-200 rounded focus:border-gray-400 focus:ring-1 focus:ring-gray-100"
                        />
                      </div>
                    )}

                    {showSTLPeriodParam && (
                      <div className="space-y-1">
                        <label className="text-[10px] text-gray-600">Period (Optional - auto-detected if not provided)</label>
                        <input
                          type="number"
                          step="1"
                          min="2"
                          value={selectedOperation.param || ''}
                          onChange={e => {
                            updateMetricsOperation(selectedOperation.id, { param: e.target.value });
                          }}
                          placeholder="Enter period (e.g., 7 for weekly, 12 for monthly)"
                          className="w-full px-1.5 py-1 h-6 text-[10px] border border-gray-200 rounded focus:border-gray-400 focus:ring-1 focus:ring-gray-100"
                        />
                        <p className="text-[9px] text-gray-500">Leave empty to auto-detect from date frequency</p>
                      </div>
                    )}

                    {showGrowthRateParam && (
                      <>
                        <div className="space-y-1">
                          <label className="text-[10px] text-gray-600">Period</label>
                          <input
                            type="number"
                            step="1"
                            min="1"
                            value={(selectedOperation.param as Record<string, any>)?.period || '1'}
                            onChange={e => {
                              const currentParam = (selectedOperation.param as Record<string, any>) || { period: '1', frequency: 'none', comparison_type: 'period' };
                              updateMetricsOperation(selectedOperation.id, { param: { ...currentParam, period: e.target.value } });
                            }}
                            placeholder="Enter period"
                            className="w-full px-1.5 py-1 h-6 text-[10px] border border-gray-200 rounded focus:border-gray-400 focus:ring-1 focus:ring-gray-100"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-gray-600">Frequency (Optional)</label>
                          <Select
                            value={(selectedOperation.param as Record<string, any>)?.frequency || 'none'}
                            onValueChange={(value) => {
                              const currentParam = (selectedOperation.param as Record<string, any>) || { period: '1', frequency: 'none', comparison_type: 'period' };
                              // Store the actual value (not converting to empty string) for UI state
                              // We'll convert to empty string only when sending to backend
                              updateMetricsOperation(selectedOperation.id, { param: { ...currentParam, frequency: value } });
                            }}
                          >
                            <SelectTrigger className="h-6 text-[10px]">
                              <SelectValue placeholder="Select frequency (optional)" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none" className="text-[10px]">None (Simple period shift)</SelectItem>
                              <SelectItem value="daily" className="text-[10px]">Daily</SelectItem>
                              <SelectItem value="weekly" className="text-[10px]">Weekly</SelectItem>
                              <SelectItem value="monthly" className="text-[10px]">Monthly</SelectItem>
                              <SelectItem value="quarterly" className="text-[10px]">Quarterly</SelectItem>
                              <SelectItem value="yearly" className="text-[10px]">Yearly</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {(() => {
                          const freqValue = (selectedOperation.param as Record<string, any>)?.frequency;
                          const showComparison = freqValue && freqValue !== 'none' && freqValue !== '';
                          return showComparison ? (
                            <div className="space-y-1">
                              <label className="text-[10px] text-gray-600">Comparison Type</label>
                              <Select
                                value={(selectedOperation.param as Record<string, any>)?.comparison_type || 'period'}
                                onValueChange={(value) => {
                                  const currentParam = (selectedOperation.param as Record<string, any>) || { period: '1', frequency: 'none', comparison_type: 'period' };
                                  updateMetricsOperation(selectedOperation.id, { param: { ...currentParam, comparison_type: value } });
                                }}
                              >
                                <SelectTrigger className="h-6 text-[10px]">
                                  <SelectValue placeholder="Select comparison type" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="period" className="text-[10px]">Period-over-Period (Consecutive)</SelectItem>
                                  <SelectItem value="yoy" className="text-[10px]">Year-over-Year (Same Period)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          ) : null;
                        })()}
                      </>
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

                    {showFiscalMappingParam && (
                      <>
                        <div className="space-y-1">
                          <label className="text-[10px] text-gray-600">Fiscal Period Type</label>
                          <Select
                            value={(selectedOperation.param as string) || ''}
                            onValueChange={(value) => {
                              updateMetricsOperation(selectedOperation.id, { param: value });
                            }}
                          >
                            <SelectTrigger className="w-full h-6 text-[10px] bg-white">
                              <SelectValue placeholder="Select fiscal period" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="fiscal_year">Fiscal Year (FY23)</SelectItem>
                              <SelectItem value="fiscal_year_full">Fiscal Year Full (FY2023)</SelectItem>
                              <SelectItem value="fiscal_quarter">Fiscal Quarter (FY23-Q1)</SelectItem>
                              <SelectItem value="fiscal_month">Fiscal Month (FY23-M01)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-gray-600">Fiscal Start Month</label>
                          <Select
                            value={String((selectedOperation as any).fiscalStartMonth || '1')}
                            onValueChange={(value) => {
                              updateMetricsOperation(selectedOperation.id, { fiscalStartMonth: value });
                            }}
                          >
                            <SelectTrigger className="w-full h-6 text-[10px] bg-white">
                              <SelectValue placeholder="Select month" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">January</SelectItem>
                              <SelectItem value="2">February</SelectItem>
                              <SelectItem value="3">March</SelectItem>
                              <SelectItem value="4">April</SelectItem>
                              <SelectItem value="5">May</SelectItem>
                              <SelectItem value="6">June</SelectItem>
                              <SelectItem value="7">July</SelectItem>
                              <SelectItem value="8">August</SelectItem>
                              <SelectItem value="9">September</SelectItem>
                              <SelectItem value="10">October</SelectItem>
                              <SelectItem value="11">November</SelectItem>
                              <SelectItem value="12">December</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}

                    {showDateBuilderParam && (
                      <>
                        <div className="space-y-1">
                          <label className="text-[10px] text-gray-600">Build Mode</label>
                          <Select
                            value={(selectedOperation.param as string) || 'from_year_month_day'}
                            onValueChange={(value) => {
                              updateMetricsOperation(selectedOperation.id, { param: value });
                            }}
                          >
                            <SelectTrigger className="w-full h-6 text-[10px] bg-white">
                              <SelectValue placeholder="Select mode" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="from_year_month_day">From Year/Month/Day</SelectItem>
                              <SelectItem value="from_year_week">From Year/Week</SelectItem>
                              <SelectItem value="from_year_week_dayofweek">From Year/Week/DayOfWeek</SelectItem>
                              <SelectItem value="from_year_month_week">From Year/Month/Week</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-gray-600 mb-0.5 block">Columns (up to 3)</label>
                          <div className="space-y-1">
                            {/* Year Column (Column 1) */}
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] text-gray-500 w-12 flex-shrink-0">
                                {(selectedOperation.param as string) === 'from_year_week_dayofweek' ? 'Year:' : 'Year:'}
                              </span>
                              <div className="flex-1 [&_button]:h-6 [&_button]:text-[10px]">
                                <SingleSelectDropdown
                                  label=""
                                  placeholder="Year column"
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
                            {/* Second Column (Month or Week) */}
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] text-gray-500 w-12 flex-shrink-0">
                                {((selectedOperation.param as string) === 'from_year_week' || 
                                  (selectedOperation.param as string) === 'from_year_week_dayofweek') ? 'Week:' : 'Month:'}
                              </span>
                              <div className="flex-1 [&_button]:h-6 [&_button]:text-[10px]">
                                <SingleSelectDropdown
                                  label=""
                                  placeholder={((selectedOperation.param as string) === 'from_year_week' || 
                                              (selectedOperation.param as string) === 'from_year_week_dayofweek') ? 'Week column' : 'Month column'}
                                  value={opColumns[1] || ''}
                                  onValueChange={value => updateColumnSelector(selectedOperation.id, 1, value === '(none)' ? '' : value)}
                                  options={[
                                    { value: '(none)', label: '(None - Optional)' },
                                    ...getAvailableColumns(opType).map(option => ({
                                      value: option,
                                      label: option
                                    }))
                                  ]}
                                  className="w-full space-y-0"
                                />
                              </div>
                            </div>
                            {/* Third Column (Day, Week, or DayOfWeek) */}
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] text-gray-500 w-12 flex-shrink-0">
                                {(selectedOperation.param as string) === 'from_year_week_dayofweek' ? 'DayOfWk:' : 
                                 (selectedOperation.param as string) === 'from_year_month_week' ? 'Week:' : 'Day:'}
                              </span>
                              <div className="flex-1 [&_button]:h-6 [&_button]:text-[10px]">
                                <SingleSelectDropdown
                                  label=""
                                  placeholder={(selectedOperation.param as string) === 'from_year_week_dayofweek' ? 'Day of week' : 
                                              (selectedOperation.param as string) === 'from_year_month_week' ? 'Week column' : 'Day column'}
                                  value={opColumns[2] || ''}
                                  onValueChange={value => updateColumnSelector(selectedOperation.id, 2, value === '(none)' ? '' : value)}
                                  options={[
                                    { value: '(none)', label: '(None - Optional)' },
                                    ...getAvailableColumns(opType).map(option => ({
                                      value: option,
                                      label: option
                                    }))
                                  ]}
                                  className="w-full space-y-0"
                                />
                              </div>
                            </div>
                          </div>
                          <div className="text-[9px] text-gray-500 mt-1 italic">
                            {(selectedOperation.param as string) === 'from_year_week' 
                              ? 'Creates date for Monday of the specified week'
                              : (selectedOperation.param as string) === 'from_year_week_dayofweek' 
                              ? 'DayOfWeek: 1=Mon, 7=Sun (ISO) | Optional 3rd column'
                              : (selectedOperation.param as string) === 'from_year_month_week'
                              ? 'Week: 1-5 (week number within the month)'
                              : 'Optional: Select "(None)" to use only Year or Year+Month'}
                          </div>
                        </div>
                      </>
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

      {selectedOperations.length > 0 && !hideSaveButtons && (
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-2 py-2 z-10">
          {error && (
            <div className="mb-2">
              <span className="text-red-500 text-[10px]">{error}</span>
            </div>
          )}
          <div className="flex gap-2">
            <Button 
              onClick={onSave || handleSave} 
              disabled={saveLoading || !metricsInputs.dataSource} 
              className="bg-green-600 hover:bg-green-700 text-white h-6 text-[10px] flex-1"
            >
              {saveLoading ? 'Saving...' : 'Save'}
            </Button>
            <Button 
              onClick={onSaveAs || handleSaveAs} 
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
      {/* Custom scrollbar styles */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          height: 10px;
          background: #f3f4f6;
          border-radius: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #d1d5db;
          border-radius: 8px;
          border: 2px solid #f3f4f6;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #9ca3af;
        }
        .custom-scrollbar {
          scrollbar-color: #d1d5db #f3f4f6;
          scrollbar-width: thin;
        }
      `}</style>
    </div>
  );
});

MetricsColOps.displayName = 'MetricsColOps';

export default MetricsColOps;

