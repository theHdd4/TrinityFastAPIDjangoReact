import React, { forwardRef, useImperativeHandle } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Minus, X, Divide, Circle, BarChart3, Calculator, TrendingDown, Activity, Calendar, ChevronDown, ChevronRight, Trash2, AlertCircle, Hash, Type, Filter, Users, TrendingUp, Clock, FileText, FunctionSquare, HelpCircle, Search } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { FEATURE_OVERVIEW_API, CREATECOLUMN_API } from '@/lib/api';
import { resolveTaskResponse } from '@/lib/taskQueue';
import { useToast } from '@/hooks/use-toast';
import type { CreatedColumn, CreatedTable, ColumnOperationsState, PreviewColumnData } from '../useMetricGuidedFlow';

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

// Component props interface
interface MetricsColOpsProps {
  dataSource?: string;
  featureOverviewApi?: string;
  onColumnCreated?: (column: CreatedColumn) => void;
  onTableCreated?: (table: CreatedTable) => void;
  onPreviewReady?: (previewData: PreviewColumnData) => void;
}

// Ref interface for exposing save functions
export interface MetricsColOpsRef {
  save: () => void;
  saveAs: () => void;
  canSave: () => boolean;
  isSaving: () => boolean;
  continueToPreview: () => Promise<void>;
  canContinue: () => boolean;
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

// ============================================================================
// Intent-Based Search Helper Functions
// ============================================================================

/**
 * Tokenizes a search query by lowercasing, removing punctuation, and splitting on whitespace
 */
const tokenizeQuery = (query: string): string[] => {
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
    .split(/\s+/) // Split on whitespace
    .filter(token => token.length > 0); // Remove empty tokens
};

/**
 * Builds a comprehensive searchable text string from an operation's metadata
 */
const buildOperationSearchText = (
  operation: OperationType,
  formulas: Record<string, string>
): string => {
  const parts = [
    operation.name.toLowerCase(),
    operation.type.toLowerCase(),
    operation.description.toLowerCase(),
  ];
  
  const formula = formulas[operation.type];
  if (formula) {
    parts.push(formula.toLowerCase());
  }
  
  return parts.join(' ');
};

/**
 * Synonym dictionary mapping operation types to their common synonyms
 * Used for intent-based matching
 */
const OPERATION_SYNONYMS: Record<string, string[]> = {
  add: ['add', 'sum', 'plus', 'combine', 'total', 'addition'],
  subtract: ['subtract', 'minus', 'difference', 'subtraction', 'remove'],
  multiply: ['multiply', 'times', 'product', 'multiplication'],
  divide: ['divide', 'ratio', 'per', 'division', 'quotient'],
  pct_change: ['percentage', 'growth', 'change', 'increase', 'decrease', 'pct', 'percent'],
  rolling_mean: ['moving average', 'rolling avg', 'smoothing', 'rolling mean', 'ma', 'sma'],
  rolling_sum: ['rolling sum', 'moving sum', 'window sum'],
  rolling_min: ['rolling min', 'moving min', 'window min'],
  rolling_max: ['rolling max', 'moving max', 'window max'],
  lag: ['previous', 'prior', 'last', 'shift down', 'lag'],
  lead: ['next', 'future', 'shift up', 'lead', 'forward'],
  diff: ['difference', 'diff', 'delta', 'change'],
  growth_rate: ['growth rate', 'growth', 'rate of change'],
  cumulative_sum: ['cumulative', 'running total', 'cumsum', 'running sum'],
  group_contribution: ['contribution', 'share', 'percentage of total', 'group contribution'],
  group_share_of_total: ['share of total', 'group share', 'proportion'],
  compute_metrics_within_group: ['group metrics', 'aggregate', 'within group', 'group by', 'grouped'],
  dummy: ['one hot', 'binary', 'indicator', 'dummy', 'categorical code'],
  filter_rows_condition: ['filter', 'where', 'condition', 'filter rows'],
  filter_top_n_per_group: ['top n', 'top rows', 'filter top', 'top per group', 'top n per group'],
  filter_percentile: ['percentile', 'filter percentile', 'quantile'],
  sort_rows: ['sort', 'order', 'arrange', 'sort rows'],
  select_columns: ['select', 'keep columns', 'choose columns'],
  drop_columns: ['drop', 'remove columns', 'delete columns'],
  rename: ['rename', 'relabel', 'change name'],
  reorder: ['reorder', 'rearrange columns', 'change order'],
  deduplicate: ['deduplicate', 'remove duplicates', 'unique', 'distinct'],
  datetime: ['datetime', 'date time', 'extract date', 'date components'],
  fiscal_mapping: ['fiscal', 'fiscal period', 'fiscal year', 'fiscal quarter'],
  is_weekend: ['weekend', 'is weekend', 'weekend check'],
  is_month_end: ['month end', 'end of month', 'month end check'],
  is_qtr_end: ['quarter end', 'qtr end', 'end of quarter'],
  date_builder: ['build date', 'create date', 'date builder', 'construct date'],
  standardize_zscore: ['zscore', 'z score', 'standardize', 'normalize', 'z-score'],
  standardize_minmax: ['min max', 'min-max', 'minmax scaling', 'normalize'],
  detrend: ['detrend', 'remove trend', 'trend removal'],
  deseasonalize: ['deseasonalize', 'remove seasonality', 'seasonality removal'],
  detrend_deseasonalize: ['detrend deseasonalize', 'remove trend and seasonality'],
  stl_outlier: ['outlier', 'outlier detection', 'stl outlier', 'anomaly'],
  residual: ['residual', 'residuals', 'error', 'prediction error'],
  rpi: ['rpi', 'relative price index', 'price index'],
  power: ['power', 'exponent', 'raise to power', 'exponentiate'],
  log: ['log', 'logarithm', 'ln', 'natural log'],
  exp: ['exp', 'exponential', 'e to the power'],
  sqrt: ['sqrt', 'square root', 'root'],
  logistic: ['logistic', 'sigmoid', 'logistic transformation'],
  lower: ['lower', 'lowercase', 'to lower', 'convert to lower'],
  upper: ['upper', 'uppercase', 'to upper', 'convert to upper'],
  strip: ['strip', 'trim', 'whitespace', 'remove whitespace'],
  replace: ['replace', 'substitute', 'swap', 'change text'],
  fill_na: ['fill na', 'fill missing', 'impute', 'fill null', 'missing values'],
};

/**
 * Category intent mapping - keywords that indicate a user is looking for operations in a specific category
 */
const CATEGORY_INTENTS: Record<string, string[]> = {
  'Numeric': ['numeric', 'number', 'math', 'arithmetic', 'calculate', 'compute', 'add', 'subtract', 'multiply', 'divide'],
  'String Ops': ['string', 'text', 'lowercase', 'uppercase', 'case', 'replace text', 'trim'],
  'Grouped Metrics': ['group', 'aggregate', 'within group', 'grouped', 'by group', 'contribution', 'share'],
  'Time Series and Window Functions': ['time', 'series', 'window', 'rolling', 'moving', 'lag', 'lead', 'shift', 'cumulative'],
  'Date and Calendar Helpers': ['date', 'calendar', 'fiscal', 'weekend', 'month end', 'quarter end', 'datetime'],
  'Row Filtering': ['filter', 'where', 'condition', 'top', 'percentile', 'filter rows', 'where clause'],
  'Dataframe Level Ops': ['select', 'drop', 'rename', 'reorder', 'sort', 'deduplicate', 'columns', 'dataframe'],
  'Statistical': ['statistical', 'standardize', 'normalize', 'detrend', 'outlier', 'residual', 'zscore', 'statistics'],
};

/**
 * Scores an operation based on how well it matches the query tokens
 * Returns a relevance score (higher = more relevant)
 * @param operationCategory - The name of the category this operation belongs to
 */
const scoreOperation = (
  operation: OperationType,
  queryTokens: string[],
  formulas: Record<string, string>,
  synonyms: Record<string, string[]>,
  operationCategory: string | null = null
): number => {
  if (queryTokens.length === 0) {
    return 1; // Empty query matches everything
  }

  let score = 0;
  const searchText = buildOperationSearchText(operation, formulas);
  const searchTextLower = searchText.toLowerCase();

  // Token-based keyword matching (+2 points per token match)
  for (const token of queryTokens) {
    if (searchTextLower.includes(token)) {
      score += 2;
    }
  }

  // Synonym-based intent matching (+5 points for strong synonym match)
  const operationSynonyms = synonyms[operation.type] || [];
  for (const token of queryTokens) {
    // Check for exact synonym match
    if (operationSynonyms.includes(token)) {
      score += 5;
    }
    // Check for multi-word synonym matches (e.g., "moving average")
    for (const synonym of operationSynonyms) {
      if (synonym.includes(' ') && synonym.includes(token)) {
        // Check if all words in the synonym are present in query
        const synonymWords = synonym.split(/\s+/);
        const allWordsPresent = synonymWords.every(word => 
          queryTokens.some(qt => qt.includes(word) || word.includes(qt))
        );
        if (allWordsPresent) {
          score += 5;
          break; // Only count once per synonym
        }
      }
    }
  }

  // Category-aware scoring
  // If query clearly indicates a category, boost operations in that category
  let matchedCategory: string | null = null;
  for (const [categoryName, intents] of Object.entries(CATEGORY_INTENTS)) {
    for (const intent of intents) {
      if (queryTokens.some(token => intent.includes(token) || token.includes(intent))) {
        matchedCategory = categoryName;
        break;
      }
    }
    if (matchedCategory) break;
  }

  // Apply category boost/penalty
  if (matchedCategory && operationCategory) {
    if (matchedCategory === operationCategory) {
      score += 1; // Small boost for category match
    } else {
      // Small penalty only if query is very specific about category
      const queryString = queryTokens.join(' ');
      const categoryKeywords = CATEGORY_INTENTS[matchedCategory] || [];
      const isStrongCategoryIntent = categoryKeywords.some(keyword => 
        queryString.includes(keyword) && keyword.length > 3
      );
      if (isStrongCategoryIntent) {
        score -= 1; // Small penalty for category mismatch
      }
    }
  }

  return Math.max(0, score); // Ensure non-negative score
};

const MetricsColOps = forwardRef<MetricsColOpsRef, MetricsColOpsProps>(({ dataSource, featureOverviewApi, onColumnCreated, onTableCreated, columnOperationsState, onColumnOperationsStateChange, onPreviewReady }, ref) => {
  const [openColumnCategories, setOpenColumnCategories] = React.useState<Record<string, boolean>>({});
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
  const [allIdentifiers, setAllIdentifiers] = React.useState<string[]>([]);
  const [selectedIdentifiers, setSelectedIdentifiers] = React.useState<string[]>([]);
  const [selectedIdentifiersForBackend, setSelectedIdentifiersForBackend] = React.useState<string[]>([]);
  const [identifiersListOpen, setIdentifiersListOpen] = React.useState(false);
  const openedBySearchRef = React.useRef(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const restoredColumnStateKeyRef = React.useRef<string | null>(null);
  const isRestoringRef = React.useRef(false);
  const { toast } = useToast();

  // Local operations state for guideflow – independent of global laboratory store
  const [selectedOperations, setSelectedOperations] = React.useState<Array<{
    id: string;
    type: string;
    name: string;
    columns: string[];
    rename?: string | Record<string, any>;
    param?: string | number | Record<string, any>;
    fiscalStartMonth?: string;
  }>>([]);
  
  // Active tab state for tab-based UI when multiple operations exist
  const [activeOperationId, setActiveOperationId] = React.useState<string | null>(null);
  
  // Column search and explore state
  const [columnSearchQuery, setColumnSearchQuery] = React.useState('');
  const [exploreOpen, setExploreOpen] = React.useState(false);
  
  // Restore column operations state from snapshot when provided
  React.useEffect(() => {
    if (columnOperationsState) {
      // Create a key to identify this state (based on its content)
      const stateKey = JSON.stringify({
        selectedOperationsCount: columnOperationsState.selectedOperations.length,
        activeOperationId: columnOperationsState.activeOperationId,
        columnSearchQuery: columnOperationsState.columnSearchQuery,
        exploreOpen: columnOperationsState.exploreOpen,
      });
      
      // Only restore if this is a different state than what we've already restored
      if (restoredColumnStateKeyRef.current !== stateKey) {
        isRestoringRef.current = true;
        setSelectedOperations(columnOperationsState.selectedOperations);
        setActiveOperationId(columnOperationsState.activeOperationId);
        setColumnSearchQuery(columnOperationsState.columnSearchQuery);
        setExploreOpen(columnOperationsState.exploreOpen);
        restoredColumnStateKeyRef.current = stateKey;
        // Reset restoration flag after state updates complete
        requestAnimationFrame(() => {
          isRestoringRef.current = false;
        });
      }
    } else {
      // Reset restoration tracking when state becomes null
      restoredColumnStateKeyRef.current = null;
    }
  }, [columnOperationsState]);

  // Ensure active tab is set when operations exist
  React.useEffect(() => {
    if (selectedOperations.length > 0 && !activeOperationId) {
      setActiveOperationId(selectedOperations[0].id);
    } else if (selectedOperations.length === 0) {
      setActiveOperationId(null);
    } else if (selectedOperations.length > 0 && activeOperationId) {
      // Ensure active tab still exists in operations
      const activeOpExists = selectedOperations.some(op => op.id === activeOperationId);
      if (!activeOpExists) {
        setActiveOperationId(selectedOperations[0].id);
      }
    }
  }, [selectedOperations.length, activeOperationId]);

  // Track previous state to avoid unnecessary updates
  const prevColOpsStateRef = React.useRef<string>('');
  
  // Save column operations state whenever it changes (but not during restoration)
  React.useEffect(() => {
    if (onColumnOperationsStateChange && !isRestoringRef.current) {
      // Create a stable string representation to detect actual changes
      const currentStateString = JSON.stringify({
        selectedOperations: selectedOperations.map(op => ({
          id: op.id,
          type: op.type,
          columns: op.columns,
          rename: op.rename,
        })),
        activeOperationId,
        columnSearchQuery,
        exploreOpen,
      });
      
      // Only call callback if state actually changed
      if (currentStateString !== prevColOpsStateRef.current) {
        prevColOpsStateRef.current = currentStateString;
        onColumnOperationsStateChange({
          selectedOperations,
          activeOperationId,
          columnSearchQuery,
          exploreOpen,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOperations, activeOperationId, columnSearchQuery, exploreOpen]);
  
  // Convert selectedIdentifiersForBackend array to Set for easier manipulation
  const selectedIdentifiersForBackendSet = React.useMemo(
    () => new Set(selectedIdentifiersForBackend),
    [selectedIdentifiersForBackend]
  );

  // Use provided API or default to FEATURE_OVERVIEW_API (memoized to prevent infinite loops)
  const apiBase = React.useMemo(() => 
    featureOverviewApi || FEATURE_OVERVIEW_API,
    [featureOverviewApi]
  );

  // Filter operations based on intent-based search with scoring
  const filteredColumnCategories = React.useMemo(() => {
    const query = (columnSearchQuery || '').trim();
    
    // If query is empty, return all categories
    if (!query) {
      return operationCategories;
    }

    // Tokenize the query
    const queryTokens = tokenizeQuery(query);

    // Score and filter operations for each category
    const scoredCategories = operationCategories.map(category => {
      // Score each operation in this category
      const scoredOperations = category.operations.map(operation => ({
        operation,
        score: scoreOperation(
          operation,
          queryTokens,
          operationFormulas,
          OPERATION_SYNONYMS,
          category.name
        )
      }));

      // Filter out operations with score 0 and sort by score (descending)
      const filteredAndSorted = scoredOperations
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score) // Higher score first
        .map(item => item.operation);

      return {
        ...category,
        operations: filteredAndSorted
      };
    });

    // Filter out categories with no matching operations
    return scoredCategories.filter(category => category.operations.length > 0);
  }, [columnSearchQuery]);

  // Auto-open explore when user starts typing
  React.useEffect(() => {
    if (columnSearchQuery.trim()) {
      openedBySearchRef.current = true;
      setExploreOpen(true);
    }
  }, [columnSearchQuery]);

  // Maintain focus on search input when layout switches (runs synchronously after DOM update)
  React.useLayoutEffect(() => {
    if (columnSearchQuery.trim()) {
      // Small delay to ensure DOM has updated after conditional render switch
      const timeoutId = setTimeout(() => {
        if (searchInputRef.current && document.activeElement !== searchInputRef.current) {
          searchInputRef.current.focus();
          // Move cursor to end of input
          const length = searchInputRef.current.value.length;
          searchInputRef.current.setSelectionRange(length, length);
        }
      }, 10);
      return () => clearTimeout(timeoutId);
    }
  }, [columnSearchQuery, exploreOpen]);

  // When search is active, auto-open matching categories. Otherwise, categories stay collapsed.
  React.useEffect(() => {
    if (!exploreOpen) {
      return;
    }

    if (columnSearchQuery.trim()) {
      // Search is active: open only matching categories from filtered results
      const categoriesWithMatches: Record<string, boolean> = {};
      filteredColumnCategories.forEach(category => {
        if (category.operations.length > 0) {
          categoriesWithMatches[category.name] = true;
        }
      });
      setOpenColumnCategories(categoriesWithMatches);
    }
    // When search is empty, don't modify openColumnCategories - let them stay collapsed
  }, [exploreOpen, columnSearchQuery, filteredColumnCategories]);

  // Handler for explore button - immediately open all categories if opening without search
  const handleExploreToggle = (open?: boolean) => {
    const next =
      typeof open === 'boolean' ? open : !exploreOpen;

    if (!next) {
      openedBySearchRef.current = false;
    }

    setExploreOpen(next);
  };

  const toggleColumnCategory = (categoryName: string) => {
    setOpenColumnCategories(prev => {
      const isCurrentlyOpen = prev[categoryName] ?? false;
      // Simple toggle - allow multiple categories open simultaneously
      return { ...prev, [categoryName]: !isCurrentlyOpen };
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
      if (!dataSource) {
        setAllIdentifiers([]);
        setSelectedIdentifiers([]);
        setSelectedIdentifiersForBackend([]);
        return;
      }
      
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
              console.log('[MetricsColOps] All identifiers from backend:', data.identifiers);
              // Store unfiltered identifiers for compute_metrics_within_group
              const allIds = data.identifiers || [];
              // Filter out all date-related columns from MongoDB/Redis identifiers
              const filteredIdentifiers = filterDateColumns(allIds);
              console.log('[MetricsColOps] Filtered identifiers (for global list):', filteredIdentifiers);
              // Set all filtered identifiers as selected by default
              setAllIdentifiers(allIds);
              setSelectedIdentifiers(filteredIdentifiers);
              setSelectedIdentifiersForBackend(filteredIdentifiers);
              return;
            }
          }
        }
      } catch {}
      // Fallback: fetch columns and filter categorical
      try {
        const res = await fetch(`${apiBase}/column_summary?object_name=${encodeURIComponent(dataSource)}`);
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
          // Set all filtered categorical columns as selected by default
          setAllIdentifiers(cats);
          setSelectedIdentifiers(filteredCats);
          setSelectedIdentifiersForBackend(filteredCats);
        }
      } catch {}
    }
    fetchIdentifiers();
  }, [dataSource, apiBase]);

  // Fetch columns when dataSource changes
  React.useEffect(() => {
    const fetchColumns = async () => {
      if (!dataSource) {
        setAllColumns([]);
        return;
      }

      try {
        const res = await fetch(`${apiBase}/column_summary?object_name=${encodeURIComponent(dataSource)}`);
        if (res.ok) {
          const raw = await res.json();
          const data = await resolveTaskResponse<{ summary?: any[] }>(raw);
          const summary = (data.summary || []).filter(Boolean);
          setAllColumns(summary);
          
          // Fetch columns with missing values for fill_na operation
          fetchColumnsWithMissingValues(dataSource, summary);
        }
      } catch (error) {
        console.error('Failed to fetch columns', error);
        setAllColumns([]);
        setColumnsWithMissingValues([]);
      }
    };

    fetchColumns();
  }, [dataSource, apiBase]);

  // Fetch columns with missing values
  const fetchColumnsWithMissingValues = async (objectName: string, summary: any[]) => {
    if (!objectName) {
      setColumnsWithMissingValues([]);
      return;
    }
    
    // Skip fetching if file path contains 'create-data' (newly created files may not be immediately available)
    // This prevents CORS/500 errors for newly saved files
    if (objectName.includes('create-data') || objectName.includes('create_data')) {
      console.log('[MetricsColOps] Skipping columns_with_missing_values fetch for newly created file:', objectName);
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
      console.log(`[MetricsColOps] Excluding ${col} from numericalColumns (it's an identifier)`);
    }
    return !isIdentifier;
  });
  
  // Debug log
  React.useEffect(() => {
    console.log('[MetricsColOps] allIdentifiers:', allIdentifiers);
    console.log('[MetricsColOps] numericalColumns (after filtering identifiers):', numericalColumns);
  }, [allIdentifiers, numericalColumns]);

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
    setSelectedOperations(prev => [...prev, newOperation]);
    // Set new operation as active tab
    setActiveOperationId(newOperation.id);
    // Close explore operations and clear search when an operation is selected
    setExploreOpen(false);
    setColumnSearchQuery('');
  };

  const updateOperationColumns = (opId: string, newColumns: string[]) => {
    setSelectedOperations(prev =>
      prev.map(op =>
        op.id === opId ? { ...op, columns: [...newColumns] } : op
      )
    );
  };

  const addColumnSelector = (opId: string) => {
    const op = selectedOperations.find(o => o.id === opId);
    if (!op) return;
    const current = op.columns || [];
    updateOperationColumns(opId, [...current, '']);
    // For rename operation, initialize the rename value for the new column
    if (op.type === 'rename') {
      const currentRename = (op.rename && typeof op.rename === 'object'
        ? (op.rename as Record<string, any>)
        : {}) || {};
      const newRename = { ...currentRename, [current.length]: '' };
      setSelectedOperations(prev =>
        prev.map(o =>
          o.id === opId ? { ...o, rename: newRename } : o
        )
      );
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
      setSelectedOperations(prev =>
        prev.map(o =>
          o.id === opId
            ? { ...o, param: { ...currentParam, oldValue: '' } }
            : o
        )
      );
    }
  };

  // Fetch unique values for replace operation
  const fetchReplaceUniqueValues = async (opId: string, columnName: string) => {
    if (!dataSource || !columnName) return;
    
    setLoadingReplaceValues(prev => ({ ...prev, [opId]: true }));
    try {
      const res = await fetch(`${apiBase}/column_summary?object_name=${encodeURIComponent(dataSource)}`);
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
    setSelectedOperations(prev => prev.filter(op => op.id !== opId));
  };

  const handleCloseTab = (opId: string) => {
    const currentIndex = selectedOperations.findIndex(op => op.id === opId);
    const isActiveTab = activeOperationId === opId;
    
    // Remove the operation
    setSelectedOperations(prev => prev.filter(op => op.id !== opId));
    
    // Handle active tab switching
    if (isActiveTab) {
      const remainingOps = selectedOperations.filter(op => op.id !== opId);
      if (remainingOps.length > 0) {
        // Switch to next tab, or previous if closing last tab
        const newActiveIndex = currentIndex < remainingOps.length 
          ? currentIndex 
          : currentIndex - 1;
        setActiveOperationId(remainingOps[newActiveIndex].id);
      } else {
        setActiveOperationId(null);
      }
    }
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
      // Only return columns that have missing values
      return columnsWithMissingValues;
    }
    return numericalColumns;
  };

  // Helper to get the output column name for an operation
  const getOutputColName = (op: typeof selectedOperations[0]) => {
    if (op.rename && typeof op.rename === 'string' && op.rename.trim()) return op.rename.trim();
    const columns = op.columns?.filter(Boolean) || [];
    switch (op.type) {
      case 'add': return columns.join('_plus_');
      case 'subtract': return columns.join('_minus_');
      case 'multiply': return columns.join('_times_');
      case 'divide': return columns.join('_dividedby_');
      case 'pct_change': return columns.length === 2 ? `${columns[1]}_pct_change_from_${columns[0]}` : 'pct_change';
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
      case 'lag': return columns.length > 0 ? `${columns[0]}_lag` : 'lag';
      case 'lead': return columns.length > 0 ? `${columns[0]}_lead` : 'lead';
      case 'diff': return columns.length > 0 ? `${columns[0]}_diff` : 'diff';
      case 'rolling_mean': return columns.length > 0 ? `${columns[0]}_rolling_mean` : 'rolling_mean';
      case 'rolling_sum': return columns.length > 0 ? `${columns[0]}_rolling_sum` : 'rolling_sum';
      case 'rolling_min': return columns.length > 0 ? `${columns[0]}_rolling_min` : 'rolling_min';
      case 'rolling_max': return columns.length > 0 ? `${columns[0]}_rolling_max` : 'rolling_max';
      case 'cumulative_sum': return columns.length > 0 ? `${columns[0]}_cumulative_sum` : 'cumulative_sum';
      case 'growth_rate': return columns.length > 0 ? `${columns[0]}_growth_rate` : 'growth_rate';
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
    }).filter(id => selectedIdentifiersForBackendSet.has(id)); // Only include selected ones
  };

  // Perform operations (internal function that returns preview data)
  const performOperations = async (operationsToPerform?: typeof selectedOperations): Promise<any[]> => {
    // Use provided operations or fall back to selectedOperations
    const ops = operationsToPerform || selectedOperations;
    
    // Check for duplicate output column names
    const colNames = ops.map(getOutputColName).filter(Boolean);
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
      if (!dataSource) throw new Error('No input file selected.');
      if (!ops.length) throw new Error('No operations selected.');
      // Prepare form data
      const formData = new FormData();
      formData.append('object_names', dataSource);
      formData.append('bucket_name', 'trinity');
      // Add each operation as a key with columns as value
      let operationsAdded = 0;
      ops.forEach((op, idx) => {
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
                // Get rename values in the same order as columns
                const renameValues = op.columns
                  .map((col, idx) => col ? (renameObj[idx] || '') : '')
                  .filter(Boolean);
                renameValue = renameValues.join(',');
              } else if (op.rename) {
                renameValue = op.rename.toString();
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
      const addedOperationTypes = ops
        .map((op, idx) => {
          return op.type;
        })
        .filter((type, idx) => {
          const op = ops[idx];
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
        if (!selectedIdentifiersForBackendSet.has(id)) return false;
        return true;
      });
      
      formData.append('identifiers', filteredIdentifiers.join(','));
      
      // Debug: Log all FormData entries
      console.log('🔍 MetricsColOps - FormData entries:');
      for (const [key, value] of formData.entries()) {
        console.log(`  ${key}: ${value}`);
      }
      
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
    if (!dataSource) {
      toast({ title: 'Error', description: 'No input file found', variant: 'destructive' });
      return;
    }
    setShowOverwriteConfirmDialog(true);
  };

  // Confirm overwrite save
  const confirmOverwriteSave = async () => {
    if (!dataSource) {
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
      let filename = dataSource;
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
        input_file: dataSource,
        operations: selectedOperations.map(op => {
          let created_column_name = '';
          if (op.rename && typeof op.rename === 'string' && op.rename.trim()) {
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
      
      // After successful save, call callbacks to trigger navigation
      if (onColumnCreated || onTableCreated) {
        // Determine if this is a table operation or column operation
        const hasDataframeOps = selectedOperations.some(op => dataframeOps.includes(op.type));
        
        if (hasDataframeOps && onTableCreated) {
          // It's a table operation
          onTableCreated({
            newTableName: dataSource,
            originalTableName: dataSource,
            objectName: savedFile
          });
        } else if (onColumnCreated) {
          // It's a column operation - create entries for all operations
          selectedOperations.forEach(op => {
            onColumnCreated({
              columnName: getOutputColName(op),
              tableName: dataSource,
              operations: [op.type],
              objectName: savedFile,
              operationDetails: [{
                type: op.type,
                columns: op.columns || [],
                method: typeof op.param === 'object' && op.param?.method ? op.param.method : undefined,
                identifiers: op.columns.filter(col => allIdentifiers.includes(col)),
                parameters: op.param || undefined
              }]
            });
          });
        }
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
    const defaultFilename = `createcolumn_${dataSource?.split('/')?.pop() || 'data'}_${Date.now()}`;
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
      const filename = saveFileName.trim() || `createcolumn_${dataSource?.split('/')?.pop() || 'data'}_${Date.now()}`;
      
      // Get environment variables
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};
      const stored = localStorage.getItem('current-project');
      const project = stored ? JSON.parse(stored) : {};
      
      // Prepare operation details
      const operation_details = {
        input_file: dataSource || 'unknown_input_file',
        operations: selectedOperations.map(op => {
          let created_column_name = '';
          if (op.rename && typeof op.rename === 'string' && op.rename.trim()) {
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
      
      // After successful save, call callbacks to trigger navigation
      if (onColumnCreated || onTableCreated) {
        // Determine if this is a table operation or column operation
        const hasDataframeOps = selectedOperations.some(op => dataframeOps.includes(op.type));
        
        if (hasDataframeOps && onTableCreated) {
          // It's a table operation
          onTableCreated({
            newTableName: saveFileName.trim(),
            originalTableName: dataSource || '',
            objectName: savedFile
          });
        } else if (onColumnCreated) {
          // It's a column operation - create entries for all operations
          selectedOperations.forEach(op => {
            onColumnCreated({
              columnName: getOutputColName(op),
              tableName: saveFileName.trim(),
              operations: [op.type],
              objectName: savedFile,
              operationDetails: [{
                type: op.type,
                columns: op.columns || [],
                method: typeof op.param === 'object' && op.param?.method ? op.param.method : undefined,
                identifiers: op.columns.filter(col => allIdentifiers.includes(col)),
                parameters: op.param || undefined
              }]
            });
          });
        }
      }
      
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

  // Continue to preview (performs operations without saving)
  const continueToPreview = async () => {
    if (!dataSource) {
      toast({ title: 'Error', description: 'No input file found', variant: 'destructive' });
      return;
    }
    
    try {
      // Perform operations (doesn't save, just returns preview data)
      const previewResults = await performOperations();
      if (previewResults.length === 0) {
        throw new Error('No data to preview');
      }
      
      // Prepare operation details for saving later
      const operationDetails = {
        input_file: dataSource,
        operations: selectedOperations.map(op => {
          let created_column_name = '';
          if (op.rename && typeof op.rename === 'string' && op.rename.trim()) {
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
      
      // Build preview data structure
      const previewData: PreviewColumnData = {
        previewResults,
        resultFile: previewFile || undefined,
        operationDetails
      };
      
      // Call callback to store preview data in flow state
      if (onPreviewReady) {
        onPreviewReady(previewData);
      }
      
      toast({ title: 'Success', description: 'Preview ready. Review your data before saving.' });
    } catch (err: any) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to generate preview';
      setError(errorMsg);
      toast({ title: 'Error', description: errorMsg, variant: 'destructive' });
      throw err; // Re-throw so parent can handle error state
    }
  };

  // Expose save functions via ref
  useImperativeHandle(ref, () => ({
    save: handleSave,
    saveAs: handleSaveAs,
    canSave: () => selectedOperations.length > 0 && !!dataSource && !saveLoading,
    isSaving: () => saveLoading,
    continueToPreview,
    canContinue: () => selectedOperations.length > 0 && !!dataSource && !saveLoading,
  }), [selectedOperations, dataSource, saveLoading]);

  return (
    <div className="flex flex-col h-full relative">
      <style>{`
        @keyframes fadeInSlide {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      <div className="flex-1 overflow-y-auto space-y-4 px-2 pb-2">
        {/* Selected Operations - rendered at top when operations are selected */}
        {selectedOperations.length > 0 && (
        <>
          {/* Tabs - always show when operations exist */}
          <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto">
            {selectedOperations.map((op) => (
              <div
                key={op.id}
                className={`
                  flex items-center gap-1.5 px-3 py-2 text-xs font-medium cursor-pointer
                  border-b-2 transition-all duration-200 whitespace-nowrap
                  ${activeOperationId === op.id 
                    ? 'border-blue-500 text-blue-600 bg-blue-50' 
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }
                `}
                onClick={() => setActiveOperationId(op.id)}
              >
                <span className="truncate max-w-[120px]">{op.name}</span>
                {operationFormulas[op.type] && (
                  <TooltipProvider delayDuration={0}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-3 h-3 text-gray-500 cursor-help flex-shrink-0" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        <p className="font-semibold mb-1">Formula:</p>
                        <p>{operationFormulas[op.type]}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseTab(op.id);
                  }}
                  className="ml-1 p-0.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 flex-shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>

          {/* Configuration Card - show active operation */}
          {(() => {
            const operationToShow = selectedOperations.find(op => op.id === activeOperationId);
            
            if (!operationToShow) return null;
            
            const selectedOperation = operationToShow;
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
              <div 
                key={activeOperationId} 
                className="space-y-2 transition-all duration-200 ease-in-out"
                style={{
                  animation: 'fadeInSlide 0.2s ease-in-out'
                }}
              >
                <div className="space-y-1.5">
                      {selectedOperation.type === 'pct_change' ? (
                        <>
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-600">Columns</label>
                            <div className="grid grid-cols-2 gap-1">
                              <div className="min-w-0">
                                <select
                                  value={opColumns[0] || ''}
                                  onChange={e => updateColumnSelector(selectedOperation.id, 0, e.target.value)}
                                  className="w-full h-6 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                  <option value="">Column 1</option>
                                  {getAvailableColumns(opType).map(option => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="min-w-0">
                                <select
                                  value={opColumns[1] || ''}
                                  onChange={e => updateColumnSelector(selectedOperation.id, 1, e.target.value)}
                                  className="w-full h-6 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                  <option value="">Column 2</option>
                                  {getAvailableColumns(opType).map(option => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>
                        </>
                      ) : selectedOperation.type === 'replace' ? (
                        <>
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-600">Column</label>
                            <div className="min-w-0">
                              <select
                                value={opColumns[0] || ''}
                                onChange={e => updateColumnSelector(selectedOperation.id, 0, e.target.value)}
                                className="w-full h-6 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              >
                                <option value="">Select column</option>
                                {getAvailableColumns(opType).map(option => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          {opColumns[0] && (
                            <>
                              <div className="space-y-1">
                                <label className="text-[10px] text-gray-600">Replace value</label>
                                <select
                                  value={(selectedOperation.param as Record<string, any>)?.oldValue || ''}
                                  onChange={e => {
                                    const currentParam = (selectedOperation.param as Record<string, any>) || { oldValue: '', newValue: '' };
                                    setSelectedOperations(prev =>
                                      prev.map(op =>
                                        op.id === selectedOperation.id
                                          ? { ...op, param: { ...currentParam, oldValue: e.target.value } }
                                          : op
                                      )
                                    );
                                  }}
                                  onFocus={() => {
                                    // Fetch unique values when dropdown is focused
                                    if (opColumns[0]) {
                                      const existingValues = replaceUniqueValues[selectedOperation.id];
                                      // Only fetch if we don't already have values or if column changed
                                      if (!existingValues || existingValues.length === 0) {
                                        fetchReplaceUniqueValues(selectedOperation.id, opColumns[0]);
                                      }
                                    }
                                  }}
                                  className="w-full h-6 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                  <option value="">Select value to replace</option>
                                  {loadingReplaceValues[selectedOperation.id] ? (
                                    <option disabled>Loading...</option>
                                  ) : (replaceUniqueValues[selectedOperation.id] || []).length > 0 ? (
                                    (replaceUniqueValues[selectedOperation.id] || [])
                                      .filter(val => val !== null && val !== undefined && val !== '')
                                      .map((val) => (
                                        <option key={val} value={String(val)}>{String(val)}</option>
                                      ))
                                  ) : (
                                    <option disabled>No values available</option>
                                  )}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] text-gray-600">Replace with</label>
                                <input
                                  type="text"
                                  value={(selectedOperation.param as Record<string, any>)?.newValue || ''}
                                  onChange={e => {
                                    const currentParam = (selectedOperation.param as Record<string, any>) || { oldValue: '', newValue: '' };
                                    setSelectedOperations(prev =>
                                      prev.map(op =>
                                        op.id === selectedOperation.id
                                          ? { ...op, param: { ...currentParam, newValue: e.target.value } }
                                          : op
                                      )
                                    );
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
                            <div className="min-w-0">
                              <select
                                value={opColumns[0] || ''}
                                onChange={e => updateColumnSelector(selectedOperation.id, 0, e.target.value)}
                                className="w-full h-6 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              >
                                <option value="">Select column</option>
                                {getAvailableColumns(opType).map(option => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                          {opColumns[0] && (
                            <>
                              <div className="space-y-1">
                                <label className="text-[10px] text-gray-600">Method</label>
                                <select
                                  value={(selectedOperation.param as Record<string, any>)?.strategy || ''}
                                  onChange={e => {
                                    const currentParam = (selectedOperation.param as Record<string, any>) || { strategy: '', customValue: '' };
                                    setSelectedOperations(prev =>
                                      prev.map(op =>
                                        op.id === selectedOperation.id
                                          ? { ...op, param: { ...currentParam, strategy: e.target.value } }
                                          : op
                                      )
                                    );
                                  }}
                                  className="w-full h-6 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                  <option value="">Select method</option>
                                  <option value="mean">Fill with Mean</option>
                                  <option value="median">Fill with Median</option>
                                  <option value="zero">Fill with 0</option>
                                  <option value="mode">Fill with Mode</option>
                                  <option value="empty">Fill with Empty String</option>
                                  <option value="custom">Custom Value</option>
                                  <option value="drop">Drop Rows</option>
                                </select>
                              </div>
                              {(selectedOperation.param as Record<string, any>)?.strategy === 'custom' && (
                                <div className="space-y-1">
                                  <label className="text-[10px] text-gray-600">Custom Value</label>
                                  <input
                                    type="text"
                                    value={(selectedOperation.param as Record<string, any>)?.customValue || ''}
                                    onChange={e => {
                                      const currentParam = (selectedOperation.param as Record<string, any>) || { strategy: '', customValue: '' };
                                      setSelectedOperations(prev =>
                                        prev.map(op =>
                                          op.id === selectedOperation.id
                                            ? { ...op, param: { ...currentParam, customValue: e.target.value } }
                                            : op
                                        )
                                      );
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
                                    <div className="flex-1 min-w-0">
                                      <select
                                        value={col}
                                        onChange={e => updateColumnSelector(selectedOperation.id, idx, e.target.value)}
                                        className="w-full h-6 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                      >
                                        <option value="">Column {idx + 1}</option>
                                        {getAvailableColumns(opType).map(option => (
                                          <option key={option} value={option}>{option}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="flex-1">
                                      <input
                                        type="text"
                                        value={(selectedOperation.rename && typeof selectedOperation.rename === 'object' ? (selectedOperation.rename as Record<string, any>)[idx] : '') || ''}
                                        onChange={e => {
                                          const currentRename = (selectedOperation.rename && typeof selectedOperation.rename === 'object' ? selectedOperation.rename as Record<string, any> : {}) || {};
                                          const newRename = { ...currentRename, [idx]: e.target.value };
                                          setSelectedOperations(prev =>
                                            prev.map(op =>
                                              op.id === selectedOperation.id
                                                ? { ...op, rename: newRename }
                                                : op
                                            )
                                          );
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
                                          Object.keys(newRename).forEach((key) => {
                                            const oldIdx = parseInt(key);
                                            if (oldIdx > idx) {
                                              reindexed[oldIdx - 1] = newRename[key];
                                            } else if (oldIdx < idx) {
                                              reindexed[oldIdx] = newRename[key];
                                            }
                                          });
                                          setSelectedOperations(prev =>
                                            prev.map(op =>
                                              op.id === selectedOperation.id
                                                ? { ...op, rename: reindexed }
                                                : op
                                            )
                                          );
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
                              <select
                                multiple
                                value={opColumns.filter(Boolean)}
                                onChange={e => {
                                  const selected = Array.from(e.target.selectedOptions).map((opt: HTMLOptionElement) => opt.value);
                                  updateOperationColumns(selectedOperation.id, selected);
                                  // Initialize conditions for new columns
                                  const currentParam = (selectedOperation.param as Record<string, any>) || {};
                                  const newParam = { ...currentParam };
                                  selected.forEach((col, idx) => {
                                    if (!newParam[`condition_${idx}_operator`]) {
                                      newParam[`condition_${idx}_operator`] = '==';
                                      newParam[`condition_${idx}_value`] = '';
                                    }
                                  });
                                  // Remove conditions for removed columns
                                  Object.keys(newParam).forEach(key => {
                                    if (key.startsWith('condition_') && !selected.some((_, idx) => key === `condition_${idx}_operator` || key === `condition_${idx}_value`)) {
                                      delete newParam[key];
                                    }
                                  });
                                  setSelectedOperations(prev =>
                                    prev.map(op =>
                                      op.id === selectedOperation.id
                                        ? { ...op, param: newParam }
                                        : op
                                    )
                                  );
                                }}
                                className="w-full h-24 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              >
                                {getAvailableColumns(opType).map(option => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </select>
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
                                      <select
                                        value={operator}
                                        onChange={e => {
                                  const newParam = { ...currentParam, [`condition_${idx}_operator`]: e.target.value };
                                  setSelectedOperations(prev =>
                                    prev.map(op =>
                                      op.id === selectedOperation.id
                                        ? { ...op, param: newParam }
                                        : op
                                    )
                                  );
                                        }}
                                        className="h-6 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                      >
                                        <option value="==">Equals (==)</option>
                                        <option value="!=">Not Equals (!=)</option>
                                        <option value=">">Greater Than (&gt;)</option>
                                        <option value=">=">Greater or Equal (&gt;=)</option>
                                        <option value="<">Less Than (&lt;)</option>
                                        <option value="<=">Less or Equal (&lt;=)</option>
                                        <option value="contains">Contains</option>
                                        <option value="not_contains">Not Contains</option>
                                      </select>
                                      <input
                                        type="text"
                                        value={value}
                                        onChange={e => {
                                          const newParam = { ...currentParam, [`condition_${idx}_value`]: e.target.value };
                                          setSelectedOperations(prev =>
                                            prev.map(op =>
                                              op.id === selectedOperation.id
                                                ? { ...op, param: newParam }
                                                : op
                                            )
                                          );
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
                              <select
                                multiple
                                value={opColumns.filter(Boolean)}
                                onChange={e => {
                                  const selected = Array.from(e.target.selectedOptions).map((opt: HTMLOptionElement) => opt.value);
                                  updateOperationColumns(selectedOperation.id, selected);
                                }}
                                className="w-full h-24 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              >
                                {getAvailableColumns(opType).map(option => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </select>
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
                                    const newParam = { ...currentParam, n: e.target.value };
                                    setSelectedOperations(prev =>
                                      prev.map(op =>
                                        op.id === selectedOperation.id
                                          ? { ...op, param: newParam }
                                          : op
                                      )
                                    );
                                  }}
                                  placeholder="1"
                                  className="w-full px-1.5 py-1 h-6 text-[10px] border border-gray-200 rounded focus:border-gray-400 focus:ring-1 focus:ring-gray-100"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] text-gray-600">Metric Column</label>
                                <select
                                  value={(selectedOperation.param as Record<string, any>)?.metric_col || ''}
                                  onChange={e => {
                                    const currentParam = (selectedOperation.param as Record<string, any>) || { n: '1', metric_col: '', ascending: false };
                                    const newParam = { ...currentParam, metric_col: e.target.value };
                                    setSelectedOperations(prev =>
                                      prev.map(op =>
                                        op.id === selectedOperation.id
                                          ? { ...op, param: newParam }
                                          : op
                                      )
                                    );
                                  }}
                                  className="w-full h-6 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                  <option value="">Select metric column</option>
                                  {opColumns.filter(Boolean).map(col => (
                                    <option key={col} value={col}>{col}</option>
                                  ))}
                                </select>
                              </div>
                              <div className="space-y-1">
                                <label className="text-[10px] text-gray-600">Sort Order</label>
                                <select
                                  value={(selectedOperation.param as Record<string, any>)?.ascending ? 'ascending' : 'descending'}
                                  onChange={e => {
                                    const currentParam = (selectedOperation.param as Record<string, any>) || { n: '1', metric_col: '', ascending: false };
                                    const newParam = { ...currentParam, ascending: e.target.value === 'ascending' };
                                    setSelectedOperations(prev =>
                                      prev.map(op =>
                                        op.id === selectedOperation.id
                                          ? { ...op, param: newParam }
                                          : op
                                      )
                                    );
                                  }}
                                  className="w-full h-6 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                  <option value="descending">Descending (Top N)</option>
                                  <option value="ascending">Ascending (Bottom N)</option>
                                </select>
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
                                const newParam = { ...currentParam, percentile: e.target.value };
                                setSelectedOperations(prev =>
                                  prev.map(op =>
                                    op.id === selectedOperation.id
                                      ? { ...op, param: newParam }
                                      : op
                                  )
                                );
                              }}
                              placeholder="10"
                              className="w-full px-1.5 py-1 h-6 text-[10px] border border-gray-200 rounded focus:border-gray-400 focus:ring-1 focus:ring-gray-100"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-600">Metric Column (Numerical)</label>
                            <select
                              value={(selectedOperation.param as Record<string, any>)?.metric_col || opColumns.filter(Boolean)[0] || ''}
                              onChange={e => {
                                const currentParam = (selectedOperation.param as Record<string, any>) || { percentile: '10', metric_col: '', direction: 'top' };
                                const newParam = { ...currentParam, metric_col: e.target.value };
                                setSelectedOperations(prev =>
                                  prev.map(op =>
                                    op.id === selectedOperation.id
                                      ? { ...op, param: newParam }
                                      : op
                                  )
                                );
                                // Update columns array with the metric column for backend compatibility
                                updateOperationColumns(selectedOperation.id, [e.target.value]);
                              }}
                              className="w-full h-6 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                              <option value="">Select numerical column</option>
                              {numericalColumns.map(col => (
                                <option key={col} value={col}>{col}</option>
                              ))}
                            </select>
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-600">Direction</label>
                            <select
                              value={(selectedOperation.param as Record<string, any>)?.direction || 'top'}
                              onChange={e => {
                                const currentParam = (selectedOperation.param as Record<string, any>) || { percentile: '10', metric_col: '', direction: 'top' };
                                const newParam = { ...currentParam, direction: e.target.value };
                                setSelectedOperations(prev =>
                                  prev.map(op =>
                                    op.id === selectedOperation.id
                                      ? { ...op, param: newParam }
                                      : op
                                  )
                                );
                              }}
                              className="w-full h-6 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            >
                              <option value="top">Top Percentile</option>
                              <option value="bottom">Bottom Percentile</option>
                            </select>
                          </div>
                        </>
                      ) : selectedOperation.type === 'compute_metrics_within_group' ? (
                        <>
                          <div className="space-y-1 w-full">
                            <label className="text-[10px] text-gray-600">Identifiers</label>
                            <div className="w-full">
                              <select
                                multiple
                                value={opColumns.filter(Boolean)}
                                onChange={e => {
                                  const selected = Array.from(e.target.selectedOptions).map((opt: HTMLOptionElement) => opt.value);
                                  updateOperationColumns(selectedOperation.id, selected);
                                }}
                                className="w-full h-24 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              >
                                {allIdentifiers.map(id => (
                                  <option key={id} value={id}>{id}</option>
                                ))}
                              </select>
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
                                  const newParam = { ...currentParam, metric_cols: [...metricCols, { metric_col: '', method: 'sum', rename: '' }] };
                                  setSelectedOperations(prev =>
                                    prev.map(op =>
                                      op.id === selectedOperation.id
                                        ? { ...op, param: newParam }
                                        : op
                                    )
                                  );
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
                                    <div className="flex-1 min-w-0">
                                      <select
                                        value={item.metric_col || ''}
                                        onChange={e => {
                                          const currentParam = (selectedOperation.param as Record<string, any>) || { metric_cols: [{ metric_col: '', method: 'sum', rename: '' }] };
                                          const newMetricCols = [...(currentParam.metric_cols || [{ metric_col: '', method: 'sum', rename: '' }])];
                                          newMetricCols[idx] = { ...newMetricCols[idx], metric_col: e.target.value };
                                          const newParam = { ...currentParam, metric_cols: newMetricCols };
                                          setSelectedOperations(prev =>
                                            prev.map(op =>
                                              op.id === selectedOperation.id
                                                ? { ...op, param: newParam }
                                                : op
                                            )
                                          );
                                        }}
                                        className="w-full h-6 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                      >
                                        <option value="">Select numerical column</option>
                                        {numericalColumns.map(option => (
                                          <option key={option} value={option}>{option}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="flex-1">
                                      <select
                                        value={item.method || 'sum'}
                                        onChange={e => {
                                          const currentParam = (selectedOperation.param as Record<string, any>) || { metric_cols: [{ metric_col: '', method: 'sum', rename: '' }] };
                                          const newMetricCols = [...(currentParam.metric_cols || [{ metric_col: '', method: 'sum', rename: '' }])];
                                          newMetricCols[idx] = { ...newMetricCols[idx], method: e.target.value };
                                          const newParam = { ...currentParam, metric_cols: newMetricCols };
                                          setSelectedOperations(prev =>
                                            prev.map(op =>
                                              op.id === selectedOperation.id
                                                ? { ...op, param: newParam }
                                                : op
                                            )
                                          );
                                        }}
                                        className="w-full h-6 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                      >
                                        <option value="sum">Sum</option>
                                        <option value="mean">Mean</option>
                                        <option value="median">Median</option>
                                        <option value="max">Max</option>
                                        <option value="min">Min</option>
                                        <option value="count">Count</option>
                                        <option value="nunique">Nunique</option>
                                        <option value="rank">Rank</option>
                                        <option value="rank_pct">Rank Percentile</option>
                                      </select>
                                    </div>
                                    {idx >= 1 && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => {
                                          const currentParam = (selectedOperation.param as Record<string, any>) || { metric_cols: [{ metric_col: '', method: 'sum', rename: '' }] };
                                          const newMetricCols = [...(currentParam.metric_cols || [{ metric_col: '', method: 'sum', rename: '' }])];
                                          newMetricCols.splice(idx, 1);
                                          const newParam = { ...currentParam, metric_cols: newMetricCols };
                                          setSelectedOperations(prev =>
                                            prev.map(op =>
                                              op.id === selectedOperation.id
                                                ? { ...op, param: newParam }
                                                : op
                                            )
                                          );
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
                                        const newParam = { ...currentParam, metric_cols: newMetricCols };
                                        setSelectedOperations(prev =>
                                          prev.map(op =>
                                            op.id === selectedOperation.id
                                              ? { ...op, param: newParam }
                                              : op
                                          )
                                        );
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
                              <select
                                multiple
                                value={opColumns.filter(Boolean)}
                                onChange={e => {
                                  const selected = Array.from(e.target.selectedOptions).map((opt: HTMLOptionElement) => opt.value);
                                  updateOperationColumns(selectedOperation.id, selected);
                                }}
                                className="w-full h-24 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              >
                                {allIdentifiers.map(id => (
                                  <option key={id} value={id}>{id}</option>
                                ))}
                              </select>
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
                                  const newParam = { ...currentParam, metric_cols: [...metricCols, { metric_col: '', rename: '' }] };
                                  setSelectedOperations(prev =>
                                    prev.map(op =>
                                      op.id === selectedOperation.id
                                        ? { ...op, param: newParam }
                                        : op
                                    )
                                  );
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
                                    <div className="flex-1 min-w-0">
                                      <select
                                        value={item.metric_col || ''}
                                        onChange={e => {
                                          const currentParam = (selectedOperation.param as Record<string, any>) || { metric_cols: [{ metric_col: '', rename: '' }] };
                                          const newMetricCols = [...(currentParam.metric_cols || [{ metric_col: '', rename: '' }])];
                                          newMetricCols[idx] = { ...newMetricCols[idx], metric_col: e.target.value };
                                          const newParam = { ...currentParam, metric_cols: newMetricCols };
                                          setSelectedOperations(prev =>
                                            prev.map(op =>
                                              op.id === selectedOperation.id
                                                ? { ...op, param: newParam }
                                                : op
                                            )
                                          );
                                        }}
                                        className="w-full h-6 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                      >
                                        <option value="">Select numerical column</option>
                                        {numericalColumns.map(option => (
                                          <option key={option} value={option}>{option}</option>
                                        ))}
                                      </select>
                                    </div>
                                    {idx >= 1 && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => {
                                          const currentParam = (selectedOperation.param as Record<string, any>) || { metric_cols: [{ metric_col: '', rename: '' }] };
                                          const newMetricCols = [...(currentParam.metric_cols || [{ metric_col: '', rename: '' }])];
                                          newMetricCols.splice(idx, 1);
                                          const newParam = { ...currentParam, metric_cols: newMetricCols };
                                          setSelectedOperations(prev =>
                                            prev.map(op =>
                                              op.id === selectedOperation.id
                                                ? { ...op, param: newParam }
                                                : op
                                            )
                                          );
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
                                        const newParam = { ...currentParam, metric_cols: newMetricCols };
                                        setSelectedOperations(prev =>
                                          prev.map(op =>
                                            op.id === selectedOperation.id
                                              ? { ...op, param: newParam }
                                              : op
                                          )
                                        );
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
                              <select
                                multiple
                                value={opColumns.filter(Boolean)}
                                onChange={e => {
                                  const selected = Array.from(e.target.selectedOptions).map((opt: HTMLOptionElement) => opt.value);
                                  updateOperationColumns(selectedOperation.id, selected);
                                }}
                                className="w-full h-24 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              >
                                {allIdentifiers.map(id => (
                                  <option key={id} value={id}>{id}</option>
                                ))}
                              </select>
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
                                  const newParam = { ...currentParam, metric_cols: [...metricCols, { metric_col: '', rename: '' }] };
                                  setSelectedOperations(prev =>
                                    prev.map(op =>
                                      op.id === selectedOperation.id
                                        ? { ...op, param: newParam }
                                        : op
                                    )
                                  );
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
                                    <div className="flex-1 min-w-0">
                                      <select
                                        value={item.metric_col || ''}
                                        onChange={e => {
                                          const currentParam = (selectedOperation.param as Record<string, any>) || { metric_cols: [{ metric_col: '', rename: '' }] };
                                          const newMetricCols = [...(currentParam.metric_cols || [{ metric_col: '', rename: '' }])];
                                          newMetricCols[idx] = { ...newMetricCols[idx], metric_col: e.target.value };
                                          const newParam = { ...currentParam, metric_cols: newMetricCols };
                                          setSelectedOperations(prev =>
                                            prev.map(op =>
                                              op.id === selectedOperation.id
                                                ? { ...op, param: newParam }
                                                : op
                                            )
                                          );
                                        }}
                                        className="w-full h-6 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                      >
                                        <option value="">Select numerical column</option>
                                        {numericalColumns.map(option => (
                                          <option key={option} value={option}>{option}</option>
                                        ))}
                                      </select>
                                    </div>
                                    {idx >= 1 && (
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => {
                                          const currentParam = (selectedOperation.param as Record<string, any>) || { metric_cols: [{ metric_col: '', rename: '' }] };
                                          const newMetricCols = [...(currentParam.metric_cols || [{ metric_col: '', rename: '' }])];
                                          newMetricCols.splice(idx, 1);
                                          const newParam = { ...currentParam, metric_cols: newMetricCols };
                                          setSelectedOperations(prev =>
                                            prev.map(op =>
                                              op.id === selectedOperation.id
                                                ? { ...op, param: newParam }
                                                : op
                                            )
                                          );
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
                                        const newParam = { ...currentParam, metric_cols: newMetricCols };
                                        setSelectedOperations(prev =>
                                          prev.map(op =>
                                            op.id === selectedOperation.id
                                              ? { ...op, param: newParam }
                                              : op
                                          )
                                        );
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
                              <select
                                multiple
                                value={opColumns.filter(Boolean)}
                                onChange={e => {
                                  const selected = Array.from(e.target.selectedOptions).map((opt: HTMLOptionElement) => opt.value);
                                  updateOperationColumns(selectedOperation.id, selected);
                                }}
                                className="w-full h-24 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                title={
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
                              >
                                {getAvailableColumns(opType).map(option => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </>
                      ) : selectedOperation.type === 'residual' ? (
                        <>
                          <div className="space-y-1">
                            <label className="text-[10px] text-gray-600">Y Variable</label>
                            <div className="min-w-0">
                              <select
                                value={opColumns[0] || ''}
                                onChange={e => updateColumnSelector(selectedOperation.id, 0, e.target.value)}
                                className="w-full h-6 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              >
                                <option value="">Select Y</option>
                                {getAvailableColumns(opType).map(option => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </select>
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
                                      <div className="flex-1 min-w-0">
                                        <select
                                          value={col}
                                          onChange={e => updateColumnSelector(selectedOperation.id, actualIdx, e.target.value)}
                                          className="w-full h-6 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        >
                                          <option value="">Select X</option>
                                          {getAvailableColumns(opType).map(option => (
                                            <option key={option} value={option}>{option}</option>
                                          ))}
                                        </select>
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
                                    <div className="flex-1 min-w-0">
                                      <select
                                        value={col}
                                        onChange={e => updateColumnSelector(selectedOperation.id, idx, e.target.value)}
                                        className="w-full h-6 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                      >
                                        <option value="">Column {idx + 1}</option>
                                        {getAvailableColumns(opType).map(option => (
                                          <option key={option} value={option}>{option}</option>
                                        ))}
                                      </select>
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
                            const newParam = e.target.value;
                            setSelectedOperations(prev =>
                              prev.map(op =>
                                op.id === selectedOperation.id
                                  ? { ...op, param: newParam }
                                  : op
                              )
                            );
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
                            const newParam = e.target.value;
                            setSelectedOperations(prev =>
                              prev.map(op =>
                                op.id === selectedOperation.id
                                  ? { ...op, param: newParam }
                                  : op
                              )
                            );
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
                            const newParam = e.target.value;
                            setSelectedOperations(prev =>
                              prev.map(op =>
                                op.id === selectedOperation.id
                                  ? { ...op, param: newParam }
                                  : op
                              )
                            );
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
                            const newParam = e.target.value;
                            setSelectedOperations(prev =>
                              prev.map(op =>
                                op.id === selectedOperation.id
                                  ? { ...op, param: newParam }
                                  : op
                              )
                            );
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
                            const newParam = e.target.value;
                            setSelectedOperations(prev =>
                              prev.map(op =>
                                op.id === selectedOperation.id
                                  ? { ...op, param: newParam }
                                  : op
                              )
                            );
                          }}
                          placeholder="Enter window size"
                          className="w-full px-1.5 py-1 h-6 text-[10px] border border-gray-200 rounded focus:border-gray-400 focus:ring-1 focus:ring-gray-100"
                        />
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
                              const newParam = { ...currentParam, period: e.target.value };
                              setSelectedOperations(prev =>
                                prev.map(op =>
                                  op.id === selectedOperation.id
                                    ? { ...op, param: newParam }
                                    : op
                                )
                              );
                            }}
                            placeholder="Enter period"
                            className="w-full px-1.5 py-1 h-6 text-[10px] border border-gray-200 rounded focus:border-gray-400 focus:ring-1 focus:ring-gray-100"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-gray-600">Frequency (Optional)</label>
                          <select
                            value={(selectedOperation.param as Record<string, any>)?.frequency || 'none'}
                            onChange={e => {
                              const currentParam = (selectedOperation.param as Record<string, any>) || { period: '1', frequency: 'none', comparison_type: 'period' };
                              const newParam = { ...currentParam, frequency: e.target.value };
                              setSelectedOperations(prev =>
                                prev.map(op =>
                                  op.id === selectedOperation.id
                                    ? { ...op, param: newParam }
                                    : op
                                )
                              );
                            }}
                            className="w-full h-6 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="none">None (Simple period shift)</option>
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                            <option value="quarterly">Quarterly</option>
                            <option value="yearly">Yearly</option>
                          </select>
                        </div>
                        {(() => {
                          const freqValue = (selectedOperation.param as Record<string, any>)?.frequency;
                          const showComparison = freqValue && freqValue !== 'none' && freqValue !== '';
                          return showComparison ? (
                            <div className="space-y-1">
                              <label className="text-[10px] text-gray-600">Comparison Type</label>
                              <select
                                value={(selectedOperation.param as Record<string, any>)?.comparison_type || 'period'}
                                onChange={e => {
                                  const currentParam = (selectedOperation.param as Record<string, any>) || { period: '1', frequency: 'none', comparison_type: 'period' };
                                  const newParam = { ...currentParam, comparison_type: e.target.value };
                                  setSelectedOperations(prev =>
                                    prev.map(op =>
                                      op.id === selectedOperation.id
                                        ? { ...op, param: newParam }
                                        : op
                                    )
                                  );
                                }}
                                className="w-full h-6 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              >
                                <option value="period">Period-over-Period (Consecutive)</option>
                                <option value="yoy">Year-over-Year (Same Period)</option>
                              </select>
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
                              const newParam = { ...currentParam, gr: e.target.value };
                              setSelectedOperations(prev =>
                                prev.map(op =>
                                  op.id === selectedOperation.id
                                    ? { ...op, param: newParam }
                                    : op
                                )
                              );
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
                              const newParam = { ...currentParam, co: e.target.value };
                              setSelectedOperations(prev =>
                                prev.map(op =>
                                  op.id === selectedOperation.id
                                    ? { ...op, param: newParam }
                                    : op
                                )
                              );
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
                              const newParam = { ...currentParam, mp: e.target.value };
                              setSelectedOperations(prev =>
                                prev.map(op =>
                                  op.id === selectedOperation.id
                                    ? { ...op, param: newParam }
                                    : op
                                )
                              );
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
                        <select
                          value={(selectedOperation.param as string) || ''}
                          onChange={e => {
                            const newParam = e.target.value;
                            setSelectedOperations(prev =>
                              prev.map(op =>
                                op.id === selectedOperation.id
                                  ? { ...op, param: newParam }
                                  : op
                              )
                            );
                          }}
                          className="w-full h-6 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">Select component</option>
                          <option value="to_year">Year</option>
                          <option value="to_month">Month</option>
                          <option value="to_week">Week</option>
                          <option value="to_day">Day</option>
                          <option value="to_day_name">Day Name</option>
                          <option value="to_month_name">Month Name</option>
                        </select>
                      </div>
                    )}

                    {showFiscalMappingParam && (
                      <>
                        <div className="space-y-1">
                          <label className="text-[10px] text-gray-600">Fiscal Period Type</label>
                          <select
                            value={(selectedOperation.param as string) || ''}
                            onChange={e => {
                              const newParam = e.target.value;
                              setSelectedOperations(prev =>
                                prev.map(op =>
                                  op.id === selectedOperation.id
                                    ? { ...op, param: newParam }
                                    : op
                                )
                              );
                            }}
                            className="w-full h-6 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="">Select fiscal period</option>
                            <option value="fiscal_year">Fiscal Year (FY23)</option>
                            <option value="fiscal_year_full">Fiscal Year Full (FY2023)</option>
                            <option value="fiscal_quarter">Fiscal Quarter (FY23-Q1)</option>
                            <option value="fiscal_month">Fiscal Month (FY23-M01)</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-gray-600">Fiscal Start Month</label>
                          <select
                            value={String((selectedOperation as any).fiscalStartMonth || '1')}
                            onChange={e => {
                              const newFiscalStartMonth = e.target.value;
                              setSelectedOperations(prev =>
                                prev.map(op =>
                                  op.id === selectedOperation.id
                                    ? { ...op, fiscalStartMonth: newFiscalStartMonth }
                                    : op
                                )
                              );
                            }}
                            className="w-full h-6 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="1">January</option>
                            <option value="2">February</option>
                            <option value="3">March</option>
                            <option value="4">April</option>
                            <option value="5">May</option>
                            <option value="6">June</option>
                            <option value="7">July</option>
                            <option value="8">August</option>
                            <option value="9">September</option>
                            <option value="10">October</option>
                            <option value="11">November</option>
                            <option value="12">December</option>
                          </select>
                        </div>
                      </>
                    )}

                    {showDateBuilderParam && (
                      <>
                        <div className="space-y-1">
                          <label className="text-[10px] text-gray-600">Build Mode</label>
                          <select
                            value={(selectedOperation.param as string) || 'from_year_month_day'}
                            onChange={e => {
                              const newParam = e.target.value;
                              setSelectedOperations(prev =>
                                prev.map(op =>
                                  op.id === selectedOperation.id
                                    ? { ...op, param: newParam }
                                    : op
                                )
                              );
                            }}
                            className="w-full h-6 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="from_year_month_day">From Year/Month/Day</option>
                            <option value="from_year_week">From Year/Week</option>
                            <option value="from_year_week_dayofweek">From Year/Week/DayOfWeek</option>
                            <option value="from_year_month_week">From Year/Month/Week</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[10px] text-gray-600 mb-0.5 block">Columns (up to 3)</label>
                          <div className="space-y-1">
                            {/* Year Column (Column 1) */}
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] text-gray-500 w-12 flex-shrink-0">
                                {(selectedOperation.param as string) === 'from_year_week_dayofweek' ? 'Year:' : 'Year:'}
                              </span>
                              <div className="flex-1 min-w-0">
                                <select
                                  value={opColumns[0] || ''}
                                  onChange={e => updateColumnSelector(selectedOperation.id, 0, e.target.value)}
                                  className="w-full h-6 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                  <option value="">Year column</option>
                                  {getAvailableColumns(opType).map(option => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            {/* Second Column (Month or Week) */}
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] text-gray-500 w-12 flex-shrink-0">
                                {((selectedOperation.param as string) === 'from_year_week' || 
                                  (selectedOperation.param as string) === 'from_year_week_dayofweek') ? 'Week:' : 'Month:'}
                              </span>
                              <div className="flex-1 min-w-0">
                                <select
                                  value={opColumns[1] || ''}
                                  onChange={e => updateColumnSelector(selectedOperation.id, 1, e.target.value === '(none)' ? '' : e.target.value)}
                                  className="w-full h-6 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                  <option value="">{((selectedOperation.param as string) === 'from_year_week' || 
                                              (selectedOperation.param as string) === 'from_year_week_dayofweek') ? 'Week column' : 'Month column'}</option>
                                  <option value="(none)">(None - Optional)</option>
                                  {getAvailableColumns(opType).map(option => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            {/* Third Column (Day, Week, or DayOfWeek) */}
                            <div className="flex items-center gap-1">
                              <span className="text-[9px] text-gray-500 w-12 flex-shrink-0">
                                {(selectedOperation.param as string) === 'from_year_week_dayofweek' ? 'DayOfWk:' : 
                                 (selectedOperation.param as string) === 'from_year_month_week' ? 'Week:' : 'Day:'}
                              </span>
                              <div className="flex-1 min-w-0">
                                <select
                                  value={opColumns[2] || ''}
                                  onChange={e => updateColumnSelector(selectedOperation.id, 2, e.target.value === '(none)' ? '' : e.target.value)}
                                  className="w-full h-6 text-[10px] px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                >
                                  <option value="">{(selectedOperation.param as string) === 'from_year_week_dayofweek' ? 'Day of week' : 
                                              (selectedOperation.param as string) === 'from_year_month_week' ? 'Week column' : 'Day column'}</option>
                                  <option value="(none)">(None - Optional)</option>
                                  {getAvailableColumns(opType).map(option => (
                                    <option key={option} value={option}>{option}</option>
                                  ))}
                                </select>
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
                            const newRename = e.target.value;
                            setSelectedOperations(prev =>
                              prev.map(op =>
                                op.id === selectedOperation.id
                                  ? { ...op, rename: newRename }
                                  : op
                              )
                            );
                          }}
                          placeholder="New column name"
                          className="w-full px-1.5 py-1 h-6 text-[10px] border border-gray-200 rounded focus:border-gray-400 focus:ring-1 focus:ring-gray-100"
                        />
                      </div>
                    )}
              </div>
            );
          })()}
          </>
        )}

        {/* Search bar and Explore button - rendered below selected operations */}
        <div className="flex items-center gap-2 pt-2">
          <div className="flex-1 relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              key="column-search-input"
              ref={searchInputRef}
              value={columnSearchQuery}
              onChange={(e) => setColumnSearchQuery(e.target.value)}
              placeholder='Describe what you want to calculate… e.g. "max price by brand", "add two columns", "moving average"'
              className="h-12 pl-10 text-base"
              aria-label="Search column operations"
            />
          </div>
          <Button
            variant="outline"
            onClick={handleExploreToggle}
            className="flex items-center gap-2"
          >
            {exploreOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            Explore Operations
          </Button>
        </div>

        {/* Operations Browser - only shown when exploreOpen is true */}
        {exploreOpen && (
          <div className="p-3">
            <Collapsible open={exploreOpen} onOpenChange={handleExploreToggle}>
              <CollapsibleContent>
                {(() => {
                  // Determine what to show: filtered results if searching, all categories if not
                  const categoriesToShow = columnSearchQuery.trim() 
                    ? filteredColumnCategories 
                    : operationCategories;
                      
                  if (categoriesToShow.length === 0) {
                    return (
                      <p className="text-xs text-gray-500 text-center py-4">
                        {columnSearchQuery.trim() 
                          ? "No operations match your search."
                          : "No operations available."}
                      </p>
                    );
                  }
                      
                  return categoriesToShow.map((category) => (
                    <Collapsible
                      key={category.name}
                      open={openColumnCategories[category.name] ?? false}
                      onOpenChange={() => toggleColumnCategory(category.name)}
                    >
                      <CollapsibleTrigger className="flex items-center justify-between w-full p-1.5 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 rounded transition-colors">
                        <div className="flex items-center space-x-1.5 flex-1 min-w-0">
                          <div className="w-4 h-4 bg-gray-100 border border-gray-300 rounded flex items-center justify-center flex-shrink-0">
                            <category.icon className="w-2.5 h-2.5 text-gray-700" />
                          </div>
                          <span className="font-medium text-gray-900 text-xs truncate">{category.name}</span>
                          <span className="text-[10px] text-gray-400 flex-shrink-0">({category.operations.length})</span>
                        </div>
                        {openColumnCategories[category.name] ? (
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
                                <TooltipContent side="top" className="text-xs max-w-xs">
                                  <p className="font-semibold mb-1">{op.name}</p>
                                  <p className="mb-1">{op.description}</p>
                                  {operationFormulas[op.type] && (
                                    <p className="text-[10px] text-gray-400 italic">
                                      Formula: {operationFormulas[op.type]}
                                    </p>
                                  )}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ))}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ));
                })()}
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

      </div>

      {/* Commented out: Save and Save As buttons moved to footer only */}
      {/* {selectedOperations.length > 0 && (
        <div className="sticky bottom-0 bg-white border-t border-gray-200 px-2 py-2 z-10">
          {error && (
            <div className="mb-2">
              <span className="text-red-500 text-[10px]">{error}</span>
            </div>
          )}
          <div className="flex gap-2">
            <Button 
              onClick={handleSave} 
              disabled={saveLoading || !dataSource} 
              className="bg-green-600 hover:bg-green-700 text-white h-6 text-[10px] flex-1"
            >
              {saveLoading ? 'Saving...' : 'Save'}
            </Button>
            <Button 
              onClick={handleSaveAs} 
              disabled={saveLoading || !dataSource} 
              className="bg-blue-600 hover:bg-blue-700 text-white h-6 text-[10px] flex-1"
            >
              {saveLoading ? 'Saving...' : 'Save As'}
            </Button>
          </div>
        </div>
      )} */}

      {/* Save As Dialog */}
      <Dialog open={showSaveModal} onOpenChange={setShowSaveModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Save DataFrame</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Table Name</label>
              <Input
                value={saveFileName}
                onChange={(e) => setSaveFileName(e.target.value)}
                placeholder="Enter table name"
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
                  File: {dataSource || 'Unknown'}
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

export default MetricsColOps;

