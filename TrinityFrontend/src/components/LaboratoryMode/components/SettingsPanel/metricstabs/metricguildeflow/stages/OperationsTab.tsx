/**
 * OperationsTab Component
 * 
 * ACCEPTANCE CRITERIA:
 * - UI shows Saved/Imported panel and Create panel (collapsible) when selectedType === 'variable'
 * - Assign flow: add/remove rows, inline errors, prevents saving invalid input, logs correct payload
 * - Compute flow: operations UI supports all methods, builds and logs payload matching VariableTab shape
 * - If featureOverviewApi + dataSource provided: columns and identifiers populate and are selectable
 * - If props not provided: friendly messaging appears
 * - All major functions (validateAssign, buildAssignPayload, validateCompute, buildComputePayload) are exported
 * - Component is self-contained and doesn't break existing flow
 * 
 * README - How to wire API endpoints:
 * - Assign endpoint: POST to ${LABORATORY_API}/variables/assign with payload from buildAssignPayload()
 *   Reference: VariableTab.tsx lines 328-335
 * - Compute endpoint: POST to ${LABORATORY_API}/variables/compute with payload from buildComputePayload()
 *   Reference: VariableTab.tsx lines 453-460
 * 
 * README - How to reuse overwrite confirmation logic:
 * - VariableTab.tsx lines 1217-1251 contains the overwrite confirmation dialog
 * - When wiring backend, check response for existingVariables array
 * - If present, show confirmation dialog before proceeding with confirmOverwrite: true
 * - TODO: Extract overwrite dialog into shared component for reuse
 */


import React, { useEffect, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Card } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Trash2, Plus, Table, Sparkles, Loader2, Minus, X, Divide, Circle, BarChart3, Calculator, TrendingDown, Activity, Calendar, Hash, Type, Filter, Users, TrendingUp, Clock, FileText, FunctionSquare, HelpCircle, Search, Info } from 'lucide-react';
import { FEATURE_OVERVIEW_API, CREATECOLUMN_API, LABORATORY_API } from '@/lib/api';
import { resolveTaskResponse } from '@/lib/taskQueue';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import MultiSelectDropdown from '@/templates/dropdown/multiselect/MultiSelectDropdown';
import type { CreatedVariable, CreatedColumn, CreatedTable } from '../useMetricGuidedFlow';
import MetricsColOps, { MetricsColOpsRef } from './MetricsColOps';

// Type Definitions
export type SavedVar = {
  id: string;
  variableName: string;
  value?: string;
  description?: string;
  metadata?: any;
  createdAt?: string;
  updatedAt?: string;
};

export type AssignedVar = {
  id: string;
  variableName: string;
  value: string;
  nameError?: string | null;
  valueError?: string | null;
};

export type Operation = {
  id: string;
  numericalColumn: string;
  method: string;
  secondInputType?: 'column' | 'number';
  secondColumn?: string;
  secondValue?: string;
  customName?: string;
};

export type AssignPayload = {
  assignments: Array<{ variableName: string; value: string }>;
  dataSource?: string;
  clientName?: string;
  appName?: string;
  projectName?: string;
  confirmOverwrite?: boolean;
};

export type ComputePayload = {
  dataSource?: string;
  computeMode: 'whole-dataframe' | 'within-group';
  identifiers?: string[];
  operations: Array<{
    id: string;
    numericalColumn: string;
    method: string;
    secondColumn?: string;
    secondValue?: number;
    customName?: string;
  }>;
  clientName?: string;
  appName?: string;
  projectName?: string;
};

// Column Operations Types
export type ColumnOperationType = {
  type: string;
  name: string;
  icon: any;
  description: string;
};

export type ColumnOperationCategory = {
  name: string;
  icon: any;
  color: string;
  operations: ColumnOperationType[];
};

export type ColumnOperation = {
  id: string;
  type: string;
  name: string;
  columns: string[];
  rename?: string | Record<string, any>;
  param?: string | number | Record<string, any>;
  fiscalStartMonth?: string;
};

interface OperationsTabProps {
  selectedType?: 'variable' | 'column' | null;
  importedVariables?: SavedVar[];
  onImport?: (v: SavedVar) => void;
  dataSource?: string;
  featureOverviewApi?: string;
  onVariableCreated?: (vars: CreatedVariable[]) => void;
  onColumnCreated?: (column: CreatedColumn) => void;
  onTableCreated?: (table: CreatedTable) => void;
  readOnly?: boolean;
}

export interface OperationsTabRef {
  saveVariable: () => Promise<void>;
  saveColumn: () => Promise<void>;
  saveColumnAs: () => void;
  canSaveVariable: () => boolean;
  canSaveColumn: () => boolean;
  isSaving: () => boolean;
}

// Helper function to check if a method requires a second column
const requiresSecondColumn = (method: string): boolean => {
  return ['add', 'subtract', 'multiply', 'divide'].includes(method);
};

// Exported validation function for testing
export const validateAssign = (
  assignments: AssignedVar[]
): { valid: boolean; errors: Record<string, { nameError?: string; valueError?: string }> } => {
  const errors: Record<string, { nameError?: string; valueError?: string }> = {};
  let valid = true;

  assignments.forEach((assignment) => {
    const nameError = !assignment.variableName.trim() ? 'Variable name is required' : undefined;
    const valueError = !assignment.value.trim() ? 'Value is required' : undefined;

    if (nameError || valueError) {
      valid = false;
      errors[assignment.id] = { nameError, valueError };
    }
  });

  return { valid: valid && assignments.length > 0, errors };
};

// Exported payload builder for testing
export const buildAssignPayload = (
  assignments: AssignedVar[],
  dataSource?: string
): AssignPayload => {
  // Get client/app/project from environment (same pattern as VariableTab lines 288-302)
  const envStr = localStorage.getItem('env');
  let client_name = '';
  let app_name = '';
  let project_name = '';

  if (envStr) {
    try {
      const env = JSON.parse(envStr);
      client_name = env.CLIENT_NAME || '';
      app_name = env.APP_NAME || '';
      project_name = env.PROJECT_NAME || '';
    } catch {
      // Ignore parse errors
    }
  }

  return {
    assignments: assignments.map((assignment) => ({
      variableName: assignment.variableName.trim(),
      value: assignment.value.trim(),
    })),
    dataSource,
    clientName: client_name || undefined,
    appName: app_name || undefined,
    projectName: project_name || undefined,
    confirmOverwrite: false,
  };
};

// Exported validation function for testing
export const validateCompute = (
  operations: Operation[],
  computeMode: 'whole-dataframe' | 'within-group',
  selectedIdentifiers: string[]
): { valid: boolean; errors: Record<string, string> } => {
  const errors: Record<string, string> = {};
  let valid = true;

  operations.forEach((operation) => {
    if (!operation.numericalColumn || !operation.method) {
      errors[operation.id] = 'Numerical column and method are required';
      valid = false;
      return;
    }

    if (requiresSecondColumn(operation.method)) {
      if (operation.secondInputType === 'column') {
        if (!operation.secondColumn) {
          errors[operation.id] = 'Second column is required for arithmetic operations';
          valid = false;
        }
      } else if (operation.secondInputType === 'number') {
        if (!operation.secondValue || isNaN(parseFloat(operation.secondValue))) {
          errors[operation.id] = 'Valid numeric value is required for arithmetic operations';
          valid = false;
        }
      } else {
        errors[operation.id] = 'Second input type must be specified for arithmetic operations';
        valid = false;
      }
    }
  });

  if (computeMode === 'within-group' && selectedIdentifiers.length === 0) {
    errors['identifiers'] = 'At least one identifier must be selected for within-group computation';
    valid = false;
  }

  if (operations.length === 0) {
    errors['operations'] = 'At least one operation is required';
    valid = false;
  }

  return { valid, errors };
};

// Exported payload builder for testing
export const buildComputePayload = (
  operations: Operation[],
  computeMode: 'whole-dataframe' | 'within-group',
  selectedIdentifiers: string[],
  dataSource?: string
): ComputePayload => {
  // Get client/app/project from environment (same pattern as VariableTab lines 407-422)
  const envStr = localStorage.getItem('env');
  let client_name = '';
  let app_name = '';
  let project_name = '';

  if (envStr) {
    try {
      const env = JSON.parse(envStr);
      client_name = env.CLIENT_NAME || '';
      app_name = env.APP_NAME || '';
      project_name = env.PROJECT_NAME || '';
    } catch {
      // Ignore parse errors
    }
  }

  return {
    dataSource,
    computeMode,
    identifiers: computeMode === 'within-group' ? selectedIdentifiers : undefined,
    operations: operations.map((op) => ({
      id: op.id,
      numericalColumn: op.numericalColumn,
      method: op.method,
      secondColumn: op.secondInputType === 'column' ? (op.secondColumn || undefined) : undefined,
      secondValue:
        op.secondInputType === 'number' && op.secondValue ? parseFloat(op.secondValue) : undefined,
      customName: op.customName || undefined,
    })),
    clientName: client_name || undefined,
    appName: app_name || undefined,
    projectName: project_name || undefined,
  };
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
  operation: ColumnOperationType,
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
  operation: ColumnOperationType,
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

// Column Operations Definitions (from MetricsColOps)
const allColumnOperations: ColumnOperationType[] = [
  // Numeric
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
  { type: 'pct_change', name: '% Change', icon: TrendingUp, description: 'Calculate percentage change' },
  
  // String Ops
  { type: 'lower', name: 'Lower', icon: Type, description: 'Convert to lowercase' },
  { type: 'upper', name: 'Upper', icon: Type, description: 'Convert to uppercase' },
  { type: 'strip', name: 'Strip', icon: Type, description: 'Strip whitespace' },
  { type: 'replace', name: 'Replace', icon: Type, description: 'Replace text in strings' },
  { type: 'fill_na', name: 'Fill NA', icon: Type, description: 'Fill missing values with different methods' },
  
  // Grouped metrics
  { type: 'compute_metrics_within_group', name: 'Compute Metrics Within Group', icon: Users, description: 'Compute metrics within groups (sum, mean, median, max, min, count, nunique, rank, rank_pct)' },
  { type: 'group_share_of_total', name: 'Group Share of Total', icon: Users, description: 'Column / Group Sum(Column)' },
  { type: 'group_contribution', name: 'Group Contribution', icon: Users, description: '(Group Sum / Overall Sum) × 100' },
  
  // Time series and window functions
  { type: 'lag', name: 'Lag', icon: Clock, description: 'Lag values by periods' },
  { type: 'lead', name: 'Lead', icon: Clock, description: 'Lead values by periods' },
  { type: 'diff', name: 'Diff', icon: Clock, description: 'Difference between periods' },
  { type: 'growth_rate', name: 'Growth Rate', icon: Clock, description: 'Calculate growth rate' },
  { type: 'rolling_mean', name: 'Rolling Mean', icon: Clock, description: 'Rolling mean' },
  { type: 'rolling_sum', name: 'Rolling Sum', icon: Clock, description: 'Rolling sum' },
  { type: 'rolling_min', name: 'Rolling Min', icon: Clock, description: 'Rolling min' },
  { type: 'rolling_max', name: 'Rolling Max', icon: Clock, description: 'Rolling max' },
  { type: 'cumulative_sum', name: 'Cumulative Sum', icon: Clock, description: 'Cumulative sum' },
  
  // Date and calendar helpers
  { type: 'datetime', name: 'DateTime Extract', icon: Calendar, description: 'Extract datetime components (year, month, week, day) from date column' },
  { type: 'fiscal_mapping', name: 'Fiscal Mapping', icon: Calendar, description: 'Map to fiscal periods' },
  { type: 'is_weekend', name: 'Is Weekend', icon: Calendar, description: 'Check if date is weekend' },
  { type: 'is_month_end', name: 'Is Month End', icon: Calendar, description: 'Check if date is month end' },
  { type: 'is_qtr_end', name: 'Is Qtr End', icon: Calendar, description: 'Check if date is quarter end' },
  { type: 'date_builder', name: 'Date Builder', icon: Calendar, description: 'Build date from components' },
  
  // Row filtering
  { type: 'filter_rows_condition', name: 'Filter Rows Based Condition', icon: Filter, description: 'Filter rows based on condition (multiple)' },
  { type: 'filter_top_n_per_group', name: 'Filter Rows Top N Per Group', icon: Filter, description: 'Filter top N rows per group by metric' },
  { type: 'filter_percentile', name: 'Filter Percentile', icon: Filter, description: 'Filter rows by percentile' },
  
  // Dataframe level ops
  { type: 'select_columns', name: 'Select Only Special Columns', icon: FileText, description: 'Select specific columns' },
  { type: 'drop_columns', name: 'Drop Columns', icon: FileText, description: 'Drop columns' },
  { type: 'rename', name: 'Rename', icon: FileText, description: 'Rename columns' },
  { type: 'reorder', name: 'Reorder', icon: FileText, description: 'Reorder columns' },
  { type: 'deduplicate', name: 'Deduplicate', icon: FileText, description: 'Deduplicate based on subset of cols' },
  { type: 'sort_rows', name: 'Sort Rows', icon: FileText, description: 'Sort rows' },
  
  // Statistical
  { type: 'detrend', name: 'Detrend', icon: TrendingDown, description: 'Remove trend from a column using STL decomposition' },
  { type: 'deseasonalize', name: 'Deseasonalize', icon: TrendingDown, description: 'Remove seasonality from a column using STL decomposition' },
  { type: 'detrend_deseasonalize', name: 'Detrend & Deseasonalize', icon: TrendingDown, description: 'Remove both trend and seasonality from a column using STL decomposition' },
  { type: 'stl_outlier', name: 'STL Outlier', icon: Activity, description: 'Detect outliers using STL decomposition' },
  { type: 'standardize_minmax', name: 'Standardize (Min-Max)', icon: Activity, description: 'Standardize column(s) using Min-Max scaling' },
  { type: 'standardize_zscore', name: 'Standardize (Z-Score)', icon: Activity, description: 'Standardize column(s) using Z-Score' },
  { type: 'residual', name: 'Residual', icon: TrendingDown, description: 'Calculate residuals (target vs predictors)' },
  { type: 'rpi', name: 'RPI', icon: BarChart3, description: 'Relative Price Index calculation' },
];

const columnOperationCategories: ColumnOperationCategory[] = [
  {
    name: 'Numeric',
    icon: Hash,
    color: 'bg-blue-500',
    operations: allColumnOperations.filter(op => 
      ['add', 'subtract', 'multiply', 'divide', 'pct_change', 'power', 'log', 'exp', 'sqrt', 'logistic', 'dummy'].includes(op.type)
    )
  },
  {
    name: 'String Ops',
    icon: Type,
    color: 'bg-green-500',
    operations: allColumnOperations.filter(op => 
      ['lower', 'upper', 'strip', 'replace', 'fill_na'].includes(op.type)
    )
  },
  {
    name: 'Grouped Metrics',
    icon: Users,
    color: 'bg-orange-500',
    operations: allColumnOperations.filter(op => 
      ['compute_metrics_within_group', 'group_share_of_total', 'group_contribution'].includes(op.type)
    )
  },
  {
    name: 'Time Series and Window Functions',
    icon: Clock,
    color: 'bg-pink-500',
    operations: allColumnOperations.filter(op => 
      ['lag', 'lead', 'diff', 'growth_rate', 'rolling_mean', 'rolling_sum', 'rolling_min', 'rolling_max', 'cumulative_sum'].includes(op.type)
    )
  },
  {
    name: 'Date and Calendar Helpers',
    icon: Calendar,
    color: 'bg-indigo-500',
    operations: allColumnOperations.filter(op => 
      ['datetime', 'fiscal_mapping', 'is_weekend', 'is_month_end', 'is_qtr_end', 'date_builder'].includes(op.type)
    )
  },
  {
    name: 'Row Filtering',
    icon: Filter,
    color: 'bg-red-500',
    operations: allColumnOperations.filter(op => 
      ['filter_rows_condition', 'filter_top_n_per_group', 'filter_percentile'].includes(op.type)
    )
  },
  {
    name: 'Dataframe Level Ops',
    icon: FileText,
    color: 'bg-teal-500',
    operations: allColumnOperations.filter(op => 
      ['select_columns', 'drop_columns', 'rename', 'reorder', 'deduplicate', 'sort_rows'].includes(op.type)
    )
  },
  {
    name: 'Statistical',
    icon: FunctionSquare,
    color: 'bg-gray-500',
    operations: allColumnOperations.filter(op => 
      ['detrend', 'deseasonalize', 'detrend_deseasonalize', 'stl_outlier', 'standardize_minmax', 'standardize_zscore', 'residual', 'rpi'].includes(op.type)
    )
  }
];

const columnOperationFormulas: Record<string, string> = {
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

const OperationsTab = forwardRef<OperationsTabRef, OperationsTabProps>(({
  selectedType,
  importedVariables = [],
  onImport,
  dataSource,
  featureOverviewApi,
  onVariableCreated,
  onColumnCreated,
  onTableCreated,
  readOnly = false,
}, ref) => {
  // Mode: compute | assign (only for variable type)
  const [variableMode, setVariableMode] = useState<'compute' | 'assign' | null>(null);

  // Saved variables (can be fed by props or fetched later)
  const [savedVars, setSavedVars] = useState<SavedVar[]>(importedVariables || []);
  const [loadingVariables, setLoadingVariables] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const [activeVariableTab, setActiveVariableTab] = useState<'create' | 'assign' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Assign UI state
  const [assignedVars, setAssignedVars] = useState<AssignedVar[]>([]);
  const newVarRef = useRef<HTMLInputElement | null>(null);
  const openedBySearchRef = useRef(false);
  const metricsColOpsRef = useRef<MetricsColOpsRef>(null);

  // Compute state
  const [computeWithinGroup, setComputeWithinGroup] = useState(false);
  const [identifiers, setIdentifiers] = useState<string[]>([]);
  const [selectedIdentifiers, setSelectedIdentifiers] = useState<string[]>([]);
  const [numericalColumns, setNumericalColumns] = useState<string[]>([]);
  const [loadingIdentifiers, setLoadingIdentifiers] = useState(false);
  const [loadingNumericalColumns, setLoadingNumericalColumns] = useState(false);
  const [identifiersListOpen, setIdentifiersListOpen] = useState(false);
  const [operations, setOperations] = useState<Operation[]>([
    {
      id: String(Date.now()),
      numericalColumn: '',
      method: 'sum',
      secondInputType: 'column',
      secondColumn: '',
      secondValue: '',
      customName: '',
    },
  ]);
  const [operationErrors, setOperationErrors] = useState<Record<string, string>>({});

  // API call state
  const [saving, setSaving] = useState(false);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);
  const [existingVariables, setExistingVariables] = useState<string[]>([]);
  const [pendingPayload, setPendingPayload] = useState<AssignPayload | ComputePayload | null>(null);
  const { toast } = useToast();

  // Column operations state
  const [columnOperations, setColumnOperations] = useState<ColumnOperation[]>([]);
  const [columnSearchQuery, setColumnSearchQuery] = useState('');
  const [exploreOpen, setExploreOpen] = useState(false);
  const [openColumnCategories, setOpenColumnCategories] = useState<Record<string, boolean>>({});
  const [allColumns, setAllColumns] = useState<any[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);
  const [columnIdentifiers, setColumnIdentifiers] = useState<string[]>([]);
  const [selectedColumnIdentifiers, setSelectedColumnIdentifiers] = useState<string[]>([]);
  const [loadingColumnIdentifiers, setLoadingColumnIdentifiers] = useState(false);
  const [columnSaveLoading, setColumnSaveLoading] = useState(false);
  const [showColumnOverwriteConfirm, setShowColumnOverwriteConfirm] = useState(false);
  const [showColumnSaveAs, setShowColumnSaveAs] = useState(false);
  const [columnSaveFileName, setColumnSaveFileName] = useState('');
  const [replaceUniqueValues, setReplaceUniqueValues] = useState<Record<string, any[]>>({});
  const [loadingReplaceValues, setLoadingReplaceValues] = useState<Record<string, boolean>>({});

  // Use provided API or default to FEATURE_OVERVIEW_API (memoized to prevent infinite loops)
  const apiBase = useMemo(() => 
    featureOverviewApi || FEATURE_OVERVIEW_API,
    [featureOverviewApi]
  );

  // Helper to filter date columns
  const filterDateColumns = (columns: string[]): string[] => {
    const dateKeywords = ['date', 'dates', 'year', 'month', 'week', 'day', 'day_name', 'month_name'];
    return columns.filter(id => {
      const idLower = (id || '').trim().toLowerCase();
      if (idLower.includes('date')) return false;
      return !dateKeywords.includes(idLower);
    });
  };

  // Derived column lists
  const numericalColumnsForOps: string[] = useMemo(() => {
    return allColumns
      .filter((c: any) =>
        c && typeof c.data_type === 'string' &&
        ['int', 'float', 'number', 'double', 'numeric'].some(type => c.data_type.toLowerCase().includes(type))
      )
      .map((c: any) => c.column)
      .filter((col: string) => !columnIdentifiers.includes(col));
  }, [allColumns, columnIdentifiers]);

  const categoricalColumnsForOps: string[] = useMemo(() => {
    return allColumns
      .filter((c: any) =>
        c && typeof c.data_type === 'string' &&
        ['object', 'string', 'category', 'bool'].some(type => c.data_type.toLowerCase().includes(type))
      )
      .map((c: any) => c.column);
  }, [allColumns]);

  const dateColumnsForOps: string[] = useMemo(() => {
    return allColumns
      .filter((c: any) =>
        c && typeof c.data_type === 'string' &&
        ['date', 'datetime', 'timestamp'].some(type => c.data_type.toLowerCase().includes(type))
      )
      .map((c: any) => c.column);
  }, [allColumns]);

  const allAvailableColumnsForOps: string[] = useMemo(() => {
    return allColumns.map((c: any) => c.column).filter(Boolean);
  }, [allColumns]);

  // Filter operations based on intent-based search with scoring
  const filteredColumnCategories = useMemo(() => {
    const query = (columnSearchQuery || '').trim();
    
    // If query is empty, return all categories
    if (!query) {
      return columnOperationCategories;
    }

    // Tokenize the query
    const queryTokens = tokenizeQuery(query);

    // Score and filter operations for each category
    const scoredCategories = columnOperationCategories.map(category => {
      // Score each operation in this category
      const scoredOperations = category.operations.map(operation => ({
        operation,
        score: scoreOperation(
          operation,
          queryTokens,
          columnOperationFormulas,
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
  useEffect(() => {
    if (columnSearchQuery.trim()) {
      openedBySearchRef.current = true;
      setExploreOpen(true);
    }
  }, [columnSearchQuery]);

  // Simple logic: when explore opens, open all categories. When search is active, open matching ones.
  useEffect(() => {
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
    } else {
      // No search: open ALL categories immediately - use source directly, no dependencies
      const allCategoriesOpen: Record<string, boolean> = {};
      columnOperationCategories.forEach(category => {
        allCategoriesOpen[category.name] = true;
      });
      setOpenColumnCategories(allCategoriesOpen);
    }
  }, [exploreOpen, columnSearchQuery, filteredColumnCategories]);

  // Fetch columns when dataSource changes (for column operations)
  useEffect(() => {
    if (selectedType !== 'column' || !dataSource) {
      setAllColumns([]);
      return;
    }

    const fetchColumns = async () => {
      setLoadingColumns(true);
      try {
        const res = await fetch(`${apiBase}/column_summary?object_name=${encodeURIComponent(dataSource)}`);
        if (res.ok) {
          const raw = await res.json();
          const data = await resolveTaskResponse<{ summary?: any[] }>(raw);
          const summary = (data.summary || []).filter(Boolean);
          setAllColumns(summary);
        }
      } catch (error) {
        console.error('Failed to fetch columns', error);
        setAllColumns([]);
      } finally {
        setLoadingColumns(false);
      }
    };

    fetchColumns();
  }, [dataSource, selectedType, apiBase]);

  // Fetch identifiers for column operations
  useEffect(() => {
    if (selectedType !== 'column' || !dataSource) {
      setColumnIdentifiers([]);
      setSelectedColumnIdentifiers([]);
      return;
    }

    const fetchIdentifiers = async () => {
      setLoadingColumnIdentifiers(true);
      try {
        const pathParts = dataSource.split('/');
        const clientName = pathParts[0] ?? '';
        const appName = pathParts[1] ?? '';
        const projectName = pathParts[2] ?? '';
        const fileName = pathParts.slice(3).join('/') || null;

        if (clientName && appName && projectName) {
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
              const allIds = data.identifiers || [];
              const filteredIdentifiers = filterDateColumns(allIds);
              setColumnIdentifiers(allIds);
              setSelectedColumnIdentifiers(filteredIdentifiers);
              return;
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch identifiers', error);
      } finally {
        setLoadingColumnIdentifiers(false);
      }

      // Fallback: fetch from column summary
      try {
        const res = await fetch(`${apiBase}/column_summary?object_name=${encodeURIComponent(dataSource)}`);
        if (res.ok) {
          const raw = await res.json();
          const data = await resolveTaskResponse<{ summary?: any[] }>(raw);
          const summary = (data.summary || []).filter(Boolean);
          const cats = summary
            .filter((c: any) =>
              c.data_type && (
                c.data_type.toLowerCase().includes('object') ||
                c.data_type.toLowerCase().includes('string') ||
                c.data_type.toLowerCase().includes('category')
              )
            )
            .map((c: any) => (c.column || '').trim());
          const filteredCats = filterDateColumns(cats);
          setColumnIdentifiers(cats);
          setSelectedColumnIdentifiers(filteredCats);
        }
      } catch (error) {
        console.error('Failed to fetch categorical columns', error);
      }
    };

    fetchIdentifiers();
  }, [dataSource, selectedType, apiBase]);

  // Column operations handlers
  const handleColumnOperationClick = (opType: ColumnOperationType) => {
    let defaultCols: string[];
    if (["add", "subtract", "multiply", "divide", "pct_change"].includes(opType.type)) {
      defaultCols = ['', ''];
    } else if (opType.type === 'date_builder') {
      defaultCols = ['', '', ''];
    } else if (opType.type === 'select_columns' || opType.type === 'drop_columns' || opType.type === 'reorder' || 
               opType.type === 'deduplicate' || opType.type === 'sort_rows' || opType.type === 'filter_rows_condition' || 
               opType.type === 'filter_top_n_per_group' || opType.type === 'filter_percentile' || 
               opType.type === 'compute_metrics_within_group' || opType.type === 'group_share_of_total' || 
               opType.type === 'group_contribution' || opType.type === 'lower' || opType.type === 'upper' || 
               opType.type === 'strip') {
      defaultCols = [];
    } else if (opType.type === 'rename') {
      defaultCols = [''];
    } else {
      defaultCols = [''];
    }

    const newOperation: ColumnOperation = {
      id: `col_op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: opType.type,
      name: opType.name,
      columns: defaultCols,
      rename: opType.type === 'rename' ? {} : '',
      param: opType.type === 'replace' ? { oldValue: '', newValue: '' } : 
             opType.type === 'fill_na' ? { strategy: '', customValue: '' } : 
             opType.type === 'date_builder' ? 'from_year_month_day' : 
             opType.type === 'power' || opType.type === 'lag' || opType.type === 'lead' || 
             opType.type === 'diff' || opType.type === 'rolling_mean' || opType.type === 'rolling_sum' || 
             opType.type === 'rolling_min' || opType.type === 'rolling_max' ? '' : 
             opType.type === 'growth_rate' ? { period: '1', frequency: 'none', comparison_type: 'period' } : 
             opType.type === 'filter_rows_condition' ? {} : 
             opType.type === 'filter_top_n_per_group' ? { n: '1', metric_col: '', ascending: false } : 
             opType.type === 'filter_percentile' ? { percentile: '10', metric_col: '', direction: 'top' } : 
             opType.type === 'compute_metrics_within_group' ? { metric_cols: [{ metric_col: '', method: 'sum', rename: '' }] } : 
             opType.type === 'group_share_of_total' ? { metric_cols: [{ metric_col: '', rename: '' }] } : 
             opType.type === 'group_contribution' ? { metric_cols: [{ metric_col: '', rename: '' }] } : 
             undefined,
    };

    setColumnOperations([...columnOperations, newOperation]);
    setExploreOpen(false); // Close explore panel after adding
  };

  const removeColumnOperation = (opId: string) => {
    setColumnOperations(columnOperations.filter(op => op.id !== opId));
  };

  const updateColumnOperation = (opId: string, updates: Partial<ColumnOperation>) => {
    setColumnOperations(columnOperations.map(op => 
      op.id === opId ? { ...op, ...updates } : op
    ));
  };

  const addColumnToOperation = (opId: string) => {
    const op = columnOperations.find(o => o.id === opId);
    if (!op) return;
    const current = op.columns || [];
    updateColumnOperation(opId, { columns: [...current, ''] });
    if (op.type === 'rename') {
      const currentRename = (op.rename && typeof op.rename === 'object' ? op.rename as Record<string, any> : {}) || {};
      const newRename = { ...currentRename, [current.length]: '' };
      updateColumnOperation(opId, { rename: newRename });
    }
  };

  const removeColumnFromOperation = (opId: string, idx: number) => {
    const op = columnOperations.find(o => o.id === opId);
    if (!op) return;
    const current = op.columns || [];
    if (current.length <= 1) return;
    updateColumnOperation(opId, { columns: current.filter((_, i) => i !== idx) });
  };

  const updateColumnInOperation = (opId: string, idx: number, value: string) => {
    const op = columnOperations.find(o => o.id === opId);
    if (!op) return;
    const current = op.columns || [];
    const updated = [...current];
    updated[idx] = value;
    updateColumnOperation(opId, { columns: updated });
    
    // Clear cached unique values for replace operation when column changes
    if (op.type === 'replace' && idx === 0) {
      setReplaceUniqueValues(prev => {
        const newState = { ...prev };
        delete newState[opId];
        return newState;
      });
      // Also clear the selected oldValue when column changes
      const currentParam = (op.param as Record<string, any>) || { oldValue: '', newValue: '' };
      updateColumnOperation(opId, { param: { ...currentParam, oldValue: '' } });
    }
  };

  // Helper function to get available columns based on operation type
  const getAvailableColumns = (opType: string): string[] => {
    if (opType === 'dummy') return categoricalColumnsForOps;
    if (opType === 'datetime' || opType === 'fiscal_mapping' || opType === 'is_weekend' || 
        opType === 'is_month_end' || opType === 'is_qtr_end') return dateColumnsForOps;
    if (opType === 'date_builder') return numericalColumnsForOps;
    if (opType === 'replace' || opType === 'lower' || opType === 'upper' || opType === 'strip') return allAvailableColumnsForOps;
    if (opType === 'select_columns' || opType === 'drop_columns' || opType === 'reorder' || 
        opType === 'deduplicate' || opType === 'sort_rows') return allAvailableColumnsForOps;
    if (opType === 'filter_rows_condition' || opType === 'filter_top_n_per_group' || 
        opType === 'filter_percentile') return allAvailableColumnsForOps;
    return numericalColumnsForOps;
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
        
        // Find the column and get unique values if available
        const column = summary.find((c: any) => c.column === columnName);
        if (column && column.unique_values && Array.isArray(column.unique_values)) {
          setReplaceUniqueValues(prev => ({ ...prev, [opId]: column.unique_values }));
        } else {
          setReplaceUniqueValues(prev => ({ ...prev, [opId]: [] }));
        }
      }
    } catch (error) {
      console.error('Failed to fetch unique values for replace operation', error);
      setReplaceUniqueValues(prev => ({ ...prev, [opId]: [] }));
    } finally {
      setLoadingReplaceValues(prev => ({ ...prev, [opId]: false }));
    }
  };

  // Handler for explore button - immediately open all categories if opening without search
  const handleExploreToggle = (open?: boolean) => {
    const next =
      typeof open === 'boolean' ? open : !exploreOpen;

    if (!next) {
      openedBySearchRef.current = false;
    }

    setExploreOpen(next);
    
    // // If opening explore and no search, immediately open all categories
    // if (newExploreOpen && !columnSearchQuery.trim()) {
    //   const allCategoriesOpen: Record<string, boolean> = {};
    //   columnOperationCategories.forEach(category => {
    //     allCategoriesOpen[category.name] = true;
    //   });
    //   setOpenColumnCategories(allCategoriesOpen);
    // }
  };

  const toggleColumnCategory = (categoryName: string) => {
    setOpenColumnCategories(prev => {
      const isCurrentlyOpen = prev[categoryName] ?? false;
      if (columnSearchQuery.trim()) {
        return { ...prev, [categoryName]: !isCurrentlyOpen };
      } else {
        const newState: Record<string, boolean> = {};
        if (!isCurrentlyOpen) {
          newState[categoryName] = true;
        }
        return newState;
      }
    });
  };

  // Derived filtered saved variables
  const filteredSaved = useMemo(() => {
    const q = (searchQuery || '').trim().toLowerCase();
    if (!q) return savedVars;
    return savedVars.filter(
      (v) =>
      (v.variableName || '').toLowerCase().includes(q) ||
      (v.value || '').toLowerCase().includes(q) ||
      (v.description || '').toLowerCase().includes(q)
    );
  }, [savedVars, searchQuery]);

  // Fetch saved variables from backend (same pattern as VariableTab)
  const fetchSavedVariables = async () => {
    const envStr = localStorage.getItem('env');
    let client_name = '';
    let app_name = '';
    let project_name = '';

    if (envStr) {
      try {
        const env = JSON.parse(envStr);
        client_name = env.CLIENT_NAME || '';
        app_name = env.APP_NAME || '';
        project_name = env.PROJECT_NAME || '';
      } catch {
        // Ignore parse errors
      }
    }

    if (!client_name || !app_name || !project_name) {
      return;
    }

    setLoadingVariables(true);
    try {
      const params = new URLSearchParams({
        clientId: client_name,
        appId: app_name,
        projectId: project_name,
      });

      const response = await fetch(`${LABORATORY_API}/variables?${params.toString()}`, {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setSavedVars(data.variables || []);
      }
    } catch (error) {
      console.error('Failed to fetch saved variables', error);
    } finally {
      setLoadingVariables(false);
    }
  };

  // Fetch variables on mount
  useEffect(() => {
    fetchSavedVariables();
  }, []);

  // Sync imported variables from props (but don't override if we have fetched variables)
  useEffect(() => {
    if (importedVariables && importedVariables.length > 0 && savedVars.length === 0) {
      setSavedVars(importedVariables);
    }
  }, [importedVariables, savedVars.length]);

  // Fetch identifiers when dataSource is available and Create tab is active
  useEffect(() => {
    async function fetchIdentifiers() {
      if (!dataSource || selectedType !== 'variable' || activeVariableTab !== 'create') {
        setIdentifiers([]);
        // Don't clear selectedIdentifiers here - let user keep their selection
        return;
      }

      setLoadingIdentifiers(true);

      try {
        // Try identifier_options endpoint first (same pattern as VariableTab lines 530-564)
        const pathParts = dataSource.split('/');
        const clientName = pathParts[0] ?? '';
        const appName = pathParts[1] ?? '';
        const projectName = pathParts[2] ?? '';
        const fileName = pathParts.slice(3).join('/') || null;

        if (clientName && appName && projectName) {
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
              const allIds = (data.identifiers || []).map((id: string) => id.toLowerCase());
              setIdentifiers(allIds);
              // Default state: no checkbox selected
              setLoadingIdentifiers(false);
              return;
            }
          }
        }
      } catch (err) {
        console.warn('Failed to fetch identifiers from identifier_options endpoint', err);
      }

      // Fallback: fetch columns and filter categorical (same pattern as VariableTab lines 570-601)
      try {
        const res = await fetch(`${apiBase}/column_summary?object_name=${encodeURIComponent(dataSource)}`);
        if (res.ok) {
          const raw = await res.json();
          const data = await resolveTaskResponse<{ summary?: any[] }>(raw);
          const summary = (data.summary || []).filter(Boolean);

          // Get categorical columns and convert to lowercase
          const cats = summary
            .filter(
              (c: any) =>
                c.data_type &&
                (c.data_type.toLowerCase().includes('object') ||
                  c.data_type.toLowerCase().includes('string') ||
                  c.data_type.toLowerCase().includes('category'))
            )
            .map((c: any) => (c.column || '').trim().toLowerCase());

          setIdentifiers(cats);
          // Default state: no checkbox selected
        }
      } catch (err) {
        console.warn('Failed to fetch identifiers from column_summary', err);
      }

      setLoadingIdentifiers(false);
    }

    fetchIdentifiers();
  }, [dataSource, selectedType, activeVariableTab, apiBase]);

  // Fetch numerical columns when dataSource is available
  useEffect(() => {
    async function fetchNumericalColumns() {
      if (!dataSource) {
        setNumericalColumns([]);
        return;
      }

      setLoadingNumericalColumns(true);

      try {
        const res = await fetch(`${apiBase}/column_summary?object_name=${encodeURIComponent(dataSource)}`);
        if (res.ok) {
          const raw = await res.json();
          const data = await resolveTaskResponse<{ summary?: any[] }>(raw);
          const summary = (data.summary || []).filter(Boolean);

          // Get numerical columns (excluding identifiers) and convert to lowercase
          // Same pattern as VariableTab lines 629-636
          const nums = summary
            .filter(
              (c: any) =>
                c &&
                typeof c.data_type === 'string' &&
                ['int', 'float', 'number', 'double', 'numeric'].some((type) =>
                  c.data_type.toLowerCase().includes(type)
                )
            )
            .map((c: any) => (c.column || '').trim().toLowerCase())
            .filter((col: string) => !identifiers.includes(col));

          setNumericalColumns(nums);
        }
      } catch (err) {
        console.warn('Failed to fetch numerical columns', err);
      }

      setLoadingNumericalColumns(false);
    }

    fetchNumericalColumns();
  }, [dataSource, identifiers, apiBase]);

  // Helpers for Assign rows
  const addAssignRow = () => {
    if (readOnly) return;
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    setAssignedVars((prev) => [
      ...prev,
      { id, variableName: '', value: '', nameError: null, valueError: null },
    ]);
    setTimeout(() => newVarRef.current?.focus(), 0);
  };

  const removeAssignRow = (id: string) => {
    if (readOnly) return;
    setAssignedVars((prev) => prev.filter((r) => r.id !== id));
  };

  const updateAssignRow = (id: string, fields: Partial<AssignedVar>) => {
    if (readOnly) return;
    setAssignedVars((prev) => prev.map((r) => (r.id === id ? { ...r, ...fields } : r)));
  };

  // Handler for tab changes
  const handleTabChange = (value: string) => {
    if (readOnly) return;
    if (value === 'create') {
      setActiveVariableTab('create');
      setVariableMode('compute');
    } else if (value === 'assign') {
      setActiveVariableTab('assign');
      setVariableMode('assign');
      // Initialize assign rows if user opens assign and there are none
      if (assignedVars.length === 0) {
        setTimeout(addAssignRow, 0);
      }
    } else {
      setActiveVariableTab(null);
      setVariableMode(null);
    }
  };

  // Handle confirmed overwrite
  const handleConfirmOverwrite = async () => {
    if (!pendingPayload) return;

    setSaving(true);
    setShowOverwriteConfirm(false);

    try {
      const payloadWithConfirm = { ...pendingPayload, confirmOverwrite: true };

      // Determine endpoint based on payload structure
      const endpoint =
        'assignments' in payloadWithConfirm
          ? `${LABORATORY_API}/variables/assign`
          : `${LABORATORY_API}/variables/compute`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payloadWithConfirm),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Success',
          description: `Successfully updated ${result.newColumns?.length || result.newVariables?.length || 0} variable(s).`,
        });
        // Refresh saved variables after successful save
        await fetchSavedVariables();
        // Notify parent component
        if ('assignments' in payloadWithConfirm) {
          // Assign variables
          if (onVariableCreated) {
            onVariableCreated(
              (payloadWithConfirm.assignments || []).map((a) => ({
                name: a.variableName,
                value: a.value,
                method: 'assign' as const,
                operationDetails: undefined, // Assign doesn't need operation details
              }))
            );
          }
        } else if ('operations' in payloadWithConfirm && result.newColumns) {
          // Compute variables
          if (onVariableCreated) {
            onVariableCreated(
              result.newColumns.map((colName: string) => ({
                name: colName,
                method: 'compute' as const,
              }))
            );
          }
        }
      } else {
        throw new Error(result.error || 'Failed to save variables');
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save variables. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
      setPendingPayload(null);
      setExistingVariables([]);
    }
  };

  const handleCancelOverwrite = () => {
    setShowOverwriteConfirm(false);
    setPendingPayload(null);
    setExistingVariables([]);
  };

  // Helper to convert preview data to CSV (same as MetricsColOps)
  const previewToCSV = (data: any[]): string => {
    if (!data.length) return '';
    const headers = Object.keys(data[0]);
    const rows = data.map(row => headers.map(h => JSON.stringify(row[h] ?? '')).join(','));
    return [headers.join(','), ...rows].join('\n');
  };

  // Column operations save functionality
  const buildColumnOperationsPayload = (): FormData => {
    const formData = new FormData();
    if (!dataSource) throw new Error('No data source selected');
    
    formData.append('object_names', dataSource);
    formData.append('bucket_name', 'trinity');
    
    let operationsAdded = 0;
    columnOperations.forEach((op) => {
      if (op.columns && op.columns.filter(Boolean).length > 0) {
        let colString = op.columns.filter(Boolean).join(',');
        let rename = (op.rename && typeof op.rename === 'string' && op.rename.trim()) ? op.rename.trim() : '';
        let key = `${op.type}_${operationsAdded}`;
        
        // Handle different operation types (simplified version - reference MetricsColOps for full implementation)
        if (["add", "subtract", "multiply", "divide", "pct_change"].includes(op.type)) {
          if (op.columns.filter(Boolean).length >= 2) {
            if (rename) formData.append(`${key}_rename`, rename);
            formData.append(key, colString);
            operationsAdded++;
          }
        } else if (op.type === 'power' || op.type === 'lag' || op.type === 'lead' || op.type === 'diff' || 
                   op.type === 'rolling_mean' || op.type === 'rolling_sum' || op.type === 'rolling_min' || 
                   op.type === 'rolling_max') {
          if (op.param) formData.append(`${key}_param`, op.param.toString());
          if (rename) formData.append(`${key}_rename`, rename);
          formData.append(key, colString);
          operationsAdded++;
        } else if (op.type === 'datetime' || op.type === 'fiscal_mapping') {
          if (op.param) formData.append(`${key}_param`, op.param as string);
          if (op.type === 'fiscal_mapping' && (op as any).fiscalStartMonth) {
            formData.append(`${key}_fiscal_start_month`, (op as any).fiscalStartMonth);
          }
          if (rename) formData.append(`${key}_rename`, rename);
          formData.append(key, colString);
          operationsAdded++;
        } else if (op.type === 'replace' || op.type === 'fill_na') {
          if (op.param && typeof op.param === 'object') {
            const param = op.param as Record<string, any>;
            Object.keys(param).forEach(k => {
              if (param[k] !== undefined && param[k] !== '') {
                formData.append(`${key}_${k}`, param[k].toString());
              }
            });
          }
          formData.append(key, colString);
          operationsAdded++;
        } else if (op.type === 'select_columns' || op.type === 'drop_columns' || op.type === 'reorder' || 
                   op.type === 'deduplicate' || op.type === 'sort_rows' || op.type === 'lower' || 
                   op.type === 'upper' || op.type === 'strip') {
          if (rename) formData.append(`${key}_rename`, rename);
          formData.append(key, colString);
          operationsAdded++;
        } else if (op.type === 'rename') {
          if (op.rename && typeof op.rename === 'object') {
            const renameObj = op.rename as Record<string, any>;
            const renameValues = op.columns
              .map((col, idx) => col ? (renameObj[idx] || '') : '')
              .filter(Boolean);
            if (renameValues.length > 0) {
              formData.append(`${key}_rename`, renameValues.join(','));
            }
          }
          formData.append(key, colString);
          operationsAdded++;
        } else if (op.type === 'compute_metrics_within_group' || op.type === 'group_share_of_total' || 
                   op.type === 'group_contribution') {
          if (op.param && typeof op.param === 'object') {
            const computeParam = op.param as Record<string, any>;
            const metricCols = computeParam.metric_cols || [];
            const validPairs = metricCols.filter((item: any) => 
              item.metric_col && item.metric_col !== '' && 
              (op.type === 'compute_metrics_within_group' ? item.method && item.method !== '' : true)
            );
            if (validPairs.length > 0) {
              formData.append(key, colString);
              formData.append(`${key}_metric_cols`, JSON.stringify(validPairs.map((p: any) => ({
                metric_col: p.metric_col,
                method: op.type === 'compute_metrics_within_group' ? p.method : undefined,
                rename: p.rename || ''
              })).filter((p: any) => p.method !== undefined || op.type !== 'compute_metrics_within_group')));
              operationsAdded++;
            }
          }
        } else {
          // Default: single column operations
          if (rename) formData.append(`${key}_rename`, rename);
          if (op.type === 'detrend' || op.type === 'deseasonalize' || op.type === 'detrend_deseasonalize') {
            if (op.param) formData.append(`${key}_period`, op.param.toString());
          }
          formData.append(key, colString);
          operationsAdded++;
        }
      }
    });
    
    if (operationsAdded === 0) {
      throw new Error('No valid operations to perform. Please ensure all operations have the required columns selected.');
    }
    
    const addedOperationTypes = columnOperations
      .map((op, idx) => {
        if (!op.columns || op.columns.filter(Boolean).length === 0) return null;
        if (["add", "subtract", "multiply", "divide", "pct_change"].includes(op.type)) {
          return op.columns.filter(Boolean).length >= 2 ? op.type : null;
        }
        return op.type;
      })
      .filter(Boolean);
    
    formData.append('options', addedOperationTypes.join(','));
    
    // Filter identifiers
    const datetimeSuffixes = ['_year', '_month', '_week', '_day', '_day_name', '_month_name'];
    const generatedSuffixes = ['_dummy', '_detrended', '_deseasonalized', '_detrend_deseasonalized', '_log', '_sqrt', '_exp', '_power', '_logistic', '_abs', '_scaled', '_zscore', '_minmax', '_residual', '_outlier', '_rpi', '_lag', '_lead', '_diff', '_growth_rate', '_rolling_mean', '_rolling_sum', '_rolling_min', '_rolling_max', '_cumulative_sum'];
    const filteredIdentifiers = selectedColumnIdentifiers.filter(id => {
      const idLower = id.toLowerCase();
      if (idLower.includes('date')) return false;
      if (datetimeSuffixes.some(suffix => idLower.endsWith(suffix))) return false;
      if (generatedSuffixes.some(suffix => idLower.endsWith(suffix))) return false;
      return true;
    });
    
    formData.append('identifiers', filteredIdentifiers.join(','));
    
    // Debug: Log all FormData entries
    console.log('🔍 OperationsTab - FormData entries:');
    for (const [key, value] of formData.entries()) {
      console.log(`  ${key}: ${value}`);
    }
    
    return formData;
  };

  // Perform column operations (internal function that returns preview data)
  const performColumnOperations = async (): Promise<any[]> => {
    if (!dataSource) throw new Error('No data source selected');
    if (columnOperations.length === 0) throw new Error('No operations selected');
    
    try {
      const formData = buildColumnOperationsPayload();
      
      // Call backend
      const res = await fetch(`${CREATECOLUMN_API}/perform`, {
        method: 'POST',
        body: formData,
      });
      
      if (!res.ok) {
        let errorDetail = `Backend error ${res.status}`;
        try {
          const errorData = await res.json();
          errorDetail = errorData.detail || errorData.error || errorData.message || errorDetail;
        } catch (e) {
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
      
      // Return results for preview/save
      if (data.results && Array.isArray(data.results)) {
        return data.results;
      } else {
        console.warn('⚠️ No results in perform response:', data);
        return [];
      }
    } catch (e: any) {
      const errorMsg = e?.message || (typeof e === 'string' ? e : 'Failed to create columns');
      throw new Error(errorMsg);
    }
  };

  const handleSaveColumnOperations = async (overwrite: boolean = false) => {
    if (readOnly) return;
    if (!dataSource) {
      toast({ title: 'Error', description: 'No data source selected', variant: 'destructive' });
      return;
    }
    
    if (columnOperations.length === 0) {
      toast({ title: 'Error', description: 'No operations selected', variant: 'destructive' });
      return;
    }
    
    setColumnSaveLoading(true);
    try {
      // First perform operations (same pattern as MetricsColOps)
      const previewData = await performColumnOperations();
      if (previewData.length === 0) {
        throw new Error('No data to save');
      }
      
      // Convert to CSV format (FIX: was using JSON.stringify)
      const csv_data = previewToCSV(previewData);
      let filename = dataSource;
      if (filename.endsWith('.arrow')) {
        filename = filename.replace('.arrow', '');
      }
      
      const envStr = localStorage.getItem('env');
      const env = envStr ? JSON.parse(envStr) : {};
      const stored = localStorage.getItem('current-project');
      const project = stored ? JSON.parse(stored) : {};
      
      const operation_details = {
        input_file: dataSource,
        operations: columnOperations.map(op => ({
          operation_type: op.type,
          columns: op.columns || [],
          rename: op.rename || null,
          param: op.param || null,
          created_column_name: typeof op.rename === 'string' ? op.rename : ''
        }))
      };
      
      const saveResponse = await fetch(`${CREATECOLUMN_API}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          csv_data,
          filename: overwrite ? filename : (columnSaveFileName || `createcolumn_${filename.split('/').pop() || 'data'}_${Date.now()}`),
          client_name: env.CLIENT_NAME || '',
          app_name: env.APP_NAME || '',
          project_name: env.PROJECT_NAME || '',
          user_id: env.USER_ID || '',
          project_id: project.id || null,
          operation_details: JSON.stringify(operation_details),
          overwrite_original: overwrite
        }),
      });
      
      if (!saveResponse.ok) {
        throw new Error(`Save failed: ${saveResponse.statusText}`);
      }
      
      const savePayload = await saveResponse.json();
      const saveResult = await resolveTaskResponse<Record<string, any>>(savePayload);
      
      const savedFile = typeof saveResult?.result_file === 'string'
        ? saveResult.result_file
        : filename.endsWith('.arrow')
          ? filename
          : `${filename}.arrow`;
      
      toast({ 
        title: 'Success', 
        description: 'DataFrame saved successfully.' 
      });
      
      // Resolve object name for URL construction
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

      if (overwrite) {
        // Column created in existing table
        const createdColumns: CreatedColumn[] = [];
        
        columnOperations.forEach(op => {
          if (op.type === 'compute_metrics_within_group' || op.type === 'group_share_of_total' || op.type === 'group_contribution') {
            // For grouped operations, each metric_col creates a separate column
            const param = (op.param as Record<string, any>) || {};
            const metricCols = param.metric_cols || [];
            const identifiers = op.columns.filter(Boolean);
            
            metricCols.forEach((metricCol: any) => {
              const columnName = metricCol.rename || (metricCol.metric_col && metricCol.method ? `${metricCol.metric_col}_group_${metricCol.method}` : '');
              if (columnName) {
                createdColumns.push({
                  columnName: columnName,
                  tableName: dataSource.split('/').pop() || dataSource,
                  operations: [op.type], // Keep for backward compatibility
                  objectName: resolveObjectName(dataSource),
                  operationDetails: [{
                    type: op.type,
                    columns: metricCol.metric_col ? [metricCol.metric_col] : [],
                    method: metricCol.method,
                    identifiers: identifiers,
                    parameters: param,
                  }],
                });
              }
            });
          } else {
            // For other operations, use op.rename
            const columnName = typeof op.rename === 'string' ? op.rename : '';
            if (columnName) {
              // Build detailed operation information
              const operationDetails: Array<{
                type: string;
                columns: string[];
                method?: string;
                identifiers?: string[];
                parameters?: Record<string, any>;
              }> = [{
                type: op.type,
                columns: op.columns.filter(Boolean),
                identifiers: undefined,
                parameters: op.param ? (typeof op.param === 'object' ? op.param : { value: op.param }) : undefined,
              }];
              
              createdColumns.push({
                columnName: columnName,
                tableName: dataSource.split('/').pop() || dataSource,
                operations: [op.type], // Keep for backward compatibility
                objectName: resolveObjectName(dataSource),
                operationDetails: operationDetails,
              });
            }
          }
        });
        
        createdColumns.forEach(column => {
          if (onColumnCreated) {
            onColumnCreated(column);
          }
        });
      } else {
        // New table created
        const newTableName = columnSaveFileName || `createcolumn_${filename.split('/').pop() || 'data'}_${Date.now()}`;
        const resolvedObjectName = resolveObjectName(savedFile);
        
        if (onTableCreated) {
          onTableCreated({
            newTableName: newTableName.replace('.arrow', ''),
            originalTableName: dataSource.split('/').pop() || dataSource,
            objectName: resolvedObjectName,
          });
        }
      }
      
      if (!overwrite) {
        setShowColumnSaveAs(false);
        setColumnSaveFileName('');
      }
      setShowColumnOverwriteConfirm(false);
      
    } catch (err: any) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save DataFrame';
      toast({ title: 'Error', description: errorMsg, variant: 'destructive' });
    } finally {
      setColumnSaveLoading(false);
    }
  };

  const handleSaveAssign = async () => {
    if (readOnly) return;
    if (assignedVars.length === 0) {
      addAssignRow();
      return;
    }

    const validation = validateAssign(assignedVars);
    if (!validation.valid) {
      // Update error states
      setAssignedVars((prev) =>
        prev.map((r) => ({
          ...r,
          nameError: validation.errors[r.id]?.nameError || null,
          valueError: validation.errors[r.id]?.valueError || null,
        }))
      );
      return;
    }

    // In preview mode: just store values in state without saving to backend
    // The actual save will happen from the Preview tab
    toast({
      title: 'Prepared',
      description: `Prepared ${assignedVars.length} variable(s) for review. Continue to Preview.`,
    });
    
    // Notify parent component with assigned variables (not saved yet)
    if (onVariableCreated) {
      onVariableCreated(
        assignedVars.map((p) => ({
          name: p.variableName.trim(),
          value: p.value.trim(),
          method: 'assign' as const,
        }))
      );
    }
  };

  // Compute operations management
  const addOperation = () => {
    const newId = String(Date.now());
    setOperations((prev) => [
      ...prev,
      {
        id: newId,
        numericalColumn: '',
        method: 'sum',
        secondInputType: 'column',
        secondColumn: '',
        secondValue: '',
        customName: '',
      },
    ]);
  };

  const removeOperation = (id: string) => {
    if (readOnly) return;
    if (operations.length > 1) {
      setOperations((prev) => prev.filter((o) => o.id !== id));
      setOperationErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[id];
        return newErrors;
      });
    }
  };

  const updateOperation = (id: string, update: Partial<Omit<Operation, 'id'>>) => {
    if (readOnly) return;
    setOperations((prev) => prev.map((o) => (o.id === id ? { ...o, ...update } : o)));
    // Clear error for this operation when updated
    setOperationErrors((prev) => {
      const newErrors = { ...prev };
      delete newErrors[id];
      return newErrors;
    });
  };

  const handleSaveCompute = async () => {
    if (readOnly) return;
    const computeMode = computeWithinGroup ? 'within-group' : 'whole-dataframe';
    const validation = validateCompute(operations, computeMode, selectedIdentifiers);

    if (!validation.valid) {
      setOperationErrors(validation.errors);
      return;
    }

    // Build payload with preview flag set to true
    const payload = {
      ...buildComputePayload(operations, computeMode, selectedIdentifiers, dataSource),
      preview: true, // Enable preview mode - compute but don't save
    };
    setSaving(true);

    try {
      const response = await fetch(`${LABORATORY_API}/variables/compute`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();

      if (result.success) {
        // In preview mode, result.computedValues contains the computed variables with their values
        if (result.computedValues && result.computedValues.length > 0) {
          toast({
            title: 'Computed',
            description: `Successfully computed ${result.computedValues.length} variable(s). Review in Preview.`,
          });
          
          // Notify parent component with computed values (including actual values)
          if (onVariableCreated) {
            const variableDetails = result.computedValues.map((computedVar: any) => ({
              name: computedVar.name,
              value: computedVar.value, // Include the computed value
              method: 'compute' as const,
              operationDetails: computedVar.operationDetails || {
                operationMethod: computedVar.operationDetails?.operationMethod,
                column: computedVar.operationDetails?.column,
                groupBy: computedVar.operationDetails?.groupBy,
                secondColumn: computedVar.operationDetails?.secondColumn,
                customName: computedVar.operationDetails?.customName,
              },
            }));
            onVariableCreated(variableDetails);
          }
        } else {
          // Fallback: if no computedValues, try to construct from operations
          if (onVariableCreated && operations.length > 0) {
            toast({
              title: 'Computed',
              description: `Computed ${operations.length} variable(s). Review in Preview.`,
            });
            onVariableCreated(
              operations
                .filter(op => op.customName || op.numericalColumn)
                .map(op => ({
                  name: op.customName || `${op.numericalColumn}_${op.method}`,
                  method: 'compute' as const,
                  operationDetails: {
                    operationMethod: op.method,
                    column: op.numericalColumn,
                    groupBy: computeWithinGroup ? selectedIdentifiers : undefined,
                    secondColumn: op.secondInputType === 'column' ? op.secondColumn : undefined,
                    secondValue: op.secondInputType === 'number' && op.secondValue ? parseFloat(op.secondValue) : undefined,
                    customName: op.customName,
                  },
                }))
            );
          }
        }
      } else {
        throw new Error(result.error || 'Failed to compute variables');
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to compute variables. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // Import a saved variable into current flow
  const handleImportVar = (v: SavedVar) => {
    if (onImport) {
      onImport(v);
    }
  };

  // Toggle identifier selection
  const toggleIdentifier = (identifier: string) => {
    setSelectedIdentifiers((prev) => {
      if (prev.includes(identifier)) {
        return prev.filter((id) => id !== identifier);
      } else {
        return [...prev, identifier];
      }
    });
  };

  const selectAllIdentifiers = () => {
    setSelectedIdentifiers([...identifiers]);
  };

  const deselectAllIdentifiers = () => {
    if (readOnly) return;
    setSelectedIdentifiers([]);
  };

  // Expose save handlers to parent via ref
  useImperativeHandle(ref, () => ({
    saveVariable: async () => {
      if (variableMode === 'assign') {
        await handleSaveAssign();
      } else if (variableMode === 'compute') {
        await handleSaveCompute();
      }
    },
    saveColumn: () => {
      // Use MetricsColOps save function if available (for column operations)
      if (metricsColOpsRef.current) {
        metricsColOpsRef.current.save();
      } else {
        // Fallback to old behavior for variable operations or when ref not available
        setShowColumnOverwriteConfirm(true);
      }
    },
    saveColumnAs: () => {
      // Use MetricsColOps saveAs function if available (for column operations)
      if (metricsColOpsRef.current) {
        metricsColOpsRef.current.saveAs();
      } else {
        // Fallback to old behavior for variable operations or when ref not available
        setShowColumnSaveAs(true);
      }
    },
    canSaveVariable: () => {
      if (variableMode === 'assign') {
        return assignedVars.length > 0 && assignedVars.every(v => v.variableName.trim() && v.value.trim());
      } else if (variableMode === 'compute') {
        const computeMode = computeWithinGroup ? 'within-group' : 'whole-dataframe';
        const validation = validateCompute(operations, computeMode, selectedIdentifiers);
        return validation.valid;
      }
      return false;
    },
    canSaveColumn: () => {
      // Use MetricsColOps canSave if available (for column operations)
      if (metricsColOpsRef.current) {
        return metricsColOpsRef.current.canSave();
      }
      // Fallback to old behavior
      return columnOperations.length > 0 && !!dataSource;
    },
    isSaving: () => {
      // Use MetricsColOps isSaving if available (for column operations)
      if (metricsColOpsRef.current) {
        return metricsColOpsRef.current.isSaving();
      }
      // Fallback to old behavior
      return saving || columnSaveLoading;
    },
  }), [variableMode, assignedVars, operations, computeWithinGroup, selectedIdentifiers, columnOperations, dataSource, saving, columnSaveLoading]);

  return (
    <>
      <div className="bg-white shadow-sm p-5 space-y-5">
        {/* Selection metadata area */}
        {/* If variable chosen: show saved/import and create panels */}
        {selectedType === 'variable' && (
          <>
            {/* Create and Assign Tabs */}
            <Tabs 
              value={activeVariableTab || ''} 
              onValueChange={handleTabChange}
              className={cn("w-full", readOnly && "opacity-60")}
            >
              <TabsList className="grid w-full grid-cols-2 mb-0 border-b border-slate-200 rounded-t-lg rounded-b-none bg-white">
                <TabsTrigger 
                  value="create" 
                  className="flex items-center gap-2 data-[state=active]:border-b-2 data-[state=active]:border-blue-600"
                >
                  <Calculator className="w-4 h-4" />
                  <span>Compute</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <div className="space-y-2 text-xs">
                          <p className="text-muted-foreground">
                            Compute variables from dataframe columns using operations like sum, mean, arithmetic, etc.
                          </p>
                          <p className="italic text-muted-foreground">
                            Examples:
                            <br />• total_sales = sum(sales_column)
                            <br />• avg_price = mean(price_column)
                            <br />• revenue = multiply(quantity, price)
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TabsTrigger>
                <TabsTrigger 
                  value="assign" 
                  disabled={readOnly}
                  className={cn(
                    "flex items-center gap-2 data-[state=active]:border-b-2 data-[state=active]:border-green-600",
                    readOnly && "opacity-60 cursor-not-allowed"
                  )}
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Assign</span>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-xs">
                        <div className="space-y-2 text-xs">
                          <p className="font-medium">Assign a Variable</p>
                          <p className="text-muted-foreground">
                            Assign constant values or labels to variables manually.
                          </p>
                          <p className="italic text-muted-foreground">
                            Examples:
                            <br />• growth_target = 1.12
                            <br />• discount_rate = 0.15
                            <br />• status = "active"
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="create" className="mt-4 bg-white p-3 space-y-3">
                        {/* Compute within group - Multi-select dropdown */}
                        <div className="flex items-center gap-2">
                          <Label className="text-sm font-medium text-gray-700 whitespace-nowrap">
                            Compute within Group
                          </Label>
                          <div className="flex-1">
                            {loadingIdentifiers ? (
                              <div className="flex items-center gap-2">
                                <Loader2 className="w-4 h-4 animate-spin text-[#458EE2]" />
                                <p className="text-xs text-gray-500">Loading identifiers...</p>
                              </div>
                            ) : identifiers.length > 0 ? (
                              <MultiSelectDropdown
                                placeholder="Select identifiers for grouping"
                                selectedValues={selectedIdentifiers}
                                onSelectionChange={(values) => {
                                  if (readOnly) return;
                                  setSelectedIdentifiers(values);
                                  setComputeWithinGroup(values.length > 0);
                                  // Clear identifier errors when selection changes
                                  if (values.length > 0 && operationErrors['identifiers']) {
                                    setOperationErrors(prev => {
                                      const newErrors = { ...prev };
                                      delete newErrors['identifiers'];
                                      return newErrors;
                                    });
                                  }
                                }}
                                options={identifiers.map(id => ({
                                  value: id,
                                  label: id
                                }))}
                                showSelectAll={true}
                                showDeselectAll={true}
                                showTrigger={true}
                                triggerClassName="h-9 text-sm"
                                disabled={!dataSource || readOnly}
                              />
                            ) : dataSource ? (
                              <p className="text-xs text-gray-500">
                                No identifiers found for the selected file.
                              </p>
                            ) : (
                              <p className="text-xs text-gray-500">
                                Please select a data source in the Dataset tab first.
                              </p>
                            )}
                          </div>
                          <TooltipProvider delayDuration={300}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Info className="h-4 w-4 text-gray-500 cursor-help flex-shrink-0" />
                              </TooltipTrigger>
                              <TooltipContent side="top" className="max-w-sm text-xs">
                                <div className="space-y-2">
                                  <p className="text-muted-foreground">
                                    Group By splits your data into groups based on selected identifiers (like brand, market, or year) and then performs the calculation separately for each group.
                                  </p>
                                  <p className="text-muted-foreground italic">
                                    For example, Max Price by Brand calculates the maximum price within each brand, creating one result per brand instead of a single overall value.
                                  </p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>

                        {/* Operations list */}
                        <div className="space-y-2">
                          {operations.length === 0 && (
                            <div className="text-xs text-slate-500">
                              No operations yet. Click Add to create a new operation.
                            </div>
                          )}

                          {operations.map((operation) => (
                            <div key={operation.id} className="space-y-2">
                              {/* Main row: Aggregation type, Numerical column, Variable name */}
                              <div className="flex items-start gap-2">
                                {/* Aggregation type */}
                                <div className="flex-1">
                                  <select
                                    value={operation.method}
                                    onChange={(e) => {
                                      if (readOnly) return;
                                      const value = e.target.value;
                                      updateOperation(operation.id, {
                                        method: value,
                                        secondColumn: requiresSecondColumn(value) ? operation.secondColumn : '',
                                        secondInputType: requiresSecondColumn(value)
                                          ? operation.secondInputType || 'column'
                                          : undefined,
                                        secondValue: requiresSecondColumn(value) ? operation.secondValue || '' : '',
                                      });
                                    }}
                                    disabled={readOnly}
                                    className={cn(
                                      "w-full h-9 text-sm px-2 py-1 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
                                      readOnly ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                                    )}
                                    aria-label="Operation method"
                                  >
                                    <option value="sum">Sum</option>
                                    <option value="mean">Mean</option>
                                    <option value="median">Median</option>
                                    <option value="max">Max</option>
                                    <option value="min">Min</option>
                                    <option value="count">Count</option>
                                    <option value="nunique">Nunique</option>
                                    <option value="rank_pct">Rank Percentile</option>
                                    <option value="add">Addition</option>
                                    <option value="subtract">Subtraction</option>
                                    <option value="multiply">Multiplication</option>
                                    <option value="divide">Division</option>
                                  </select>
                                  {operationErrors[operation.id] && (
                                    <div className="text-xs text-red-500 mt-1">{operationErrors[operation.id]}</div>
                                  )}
                                </div>

                                {/* Numerical column selector */}
                                <div className="flex-1">
                                  <select
                                    value={operation.numericalColumn || ''}
                                    onChange={(e) => updateOperation(operation.id, { numericalColumn: e.target.value })}
                                    className="w-full h-9 text-sm px-2 py-1 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                                    title={operation.numericalColumn || 'Select numerical column'}
                                    aria-label="Numerical column"
                                    disabled={loadingNumericalColumns}
                                  >
                                    <option value="" disabled>
                                      {loadingNumericalColumns
                                        ? 'Loading...'
                                        : dataSource
                                          ? 'Select numerical column'
                                          : 'No numerical columns found. Select a data source first.'}
                                    </option>
                                    {numericalColumns.length > 0 &&
                                      numericalColumns.map((col) => (
                                        <option key={col} value={col} title={col}>
                                          {col}
                                        </option>
                                      ))}
                                  </select>
                                </div>

                                {/* Variable name input */}
                                <div className="flex-1">
                                  <Input
                                    type="text"
                                    placeholder={computeWithinGroup 
                                      ? "Variable name"
                                      : `${operation.numericalColumn}_${operation.method}${
                                          operation.secondColumn
                                            ? `_${operation.secondColumn}`
                                            : operation.secondValue
                                              ? `_${operation.secondValue}`
                                              : ''
                                        }`}
                                    value={operation.customName || ''}
                                    onChange={(e) => {
                                      if (readOnly) return;
                                      updateOperation(operation.id, { customName: e.target.value });
                                    }}
                                    disabled={readOnly}
                                    className={cn(
                                      "h-9 text-sm",
                                      readOnly && "opacity-60 cursor-not-allowed"
                                    )}
                                    title="Variable name"
                                    aria-label="Variable name"
                                  />
                                </div>

                                {/* Delete button */}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    if (readOnly) return;
                                    removeOperation(operation.id);
                                  }}
                                  disabled={readOnly}
                                  className={cn(
                                    "h-9 w-9 p-0 text-gray-500 hover:text-red-600",
                                    readOnly && "opacity-60 cursor-not-allowed"
                                  )}
                                  title="Delete operation"
                                  aria-label="Delete operation"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>

                              {/* Second column/number input for arithmetic operations - shown as additional row when needed */}
                              {requiresSecondColumn(operation.method) && (
                                <div className="flex items-start gap-2">
                                  <div className="flex-1">
                                    <select
                                      value={operation.secondInputType || 'column'}
                                      onChange={(e) => {
                                        if (readOnly) return;
                                        const value = e.target.value as 'column' | 'number';
                                        updateOperation(operation.id, {
                                          secondInputType: value,
                                          secondColumn: value === 'column' ? operation.secondColumn : '',
                                          secondValue: value === 'number' ? operation.secondValue : '',
                                        });
                                      }}
                                      disabled={readOnly}
                                      className={cn(
                                        "w-full h-9 text-sm px-2 py-1 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
                                        readOnly ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                                      )}
                                      aria-label="Second input type"
                                    >
                                      <option value="column">Column</option>
                                      <option value="number">Number</option>
                                    </select>
                                  </div>
                                  {operation.secondInputType === 'number' ? (
                                    <div className="flex-1">
                                      <Input
                                        type="number"
                                        step="any"
                                        placeholder="Enter number"
                                        value={operation.secondValue || ''}
                                        onChange={(e) => {
                                          if (readOnly) return;
                                          updateOperation(operation.id, { secondValue: e.target.value });
                                        }}
                                        disabled={readOnly}
                                        className={cn(
                                          "h-9 text-sm",
                                          readOnly && "opacity-60 cursor-not-allowed"
                                        )}
                                        aria-label="Second number value"
                                      />
                                    </div>
                                  ) : (
                                    <div className="flex-1">
                                      <select
                                        value={operation.secondColumn || ''}
                                        onChange={(e) => {
                                          if (readOnly) return;
                                          updateOperation(operation.id, { secondColumn: e.target.value });
                                        }}
                                        className={cn(
                                          "w-full h-9 text-sm px-2 py-1 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
                                          readOnly ? "cursor-not-allowed opacity-60" : "cursor-pointer"
                                        )}
                                        title={operation.secondColumn || 'Select second column'}
                                        aria-label="Second column"
                                        disabled={loadingNumericalColumns || readOnly}
                                      >
                                        <option value="" disabled>
                                          {loadingNumericalColumns ? 'Loading...' : 'Select second column'}
                                        </option>
                                        {numericalColumns.length > 0 &&
                                          numericalColumns
                                            .filter((col) => col !== operation.numericalColumn)
                                            .map((col) => (
                                              <option key={col} value={col} title={col}>
                                                {col}
                                              </option>
                                            ))}
                                        {!loadingNumericalColumns && numericalColumns.length === 0 && (
                                          <option value="" disabled>
                                            No numerical columns found
                                          </option>
                                        )}
                                      </select>
                                    </div>
                                  )}
                                  <div className="w-9"></div>
                                </div>
                              )}
                            </div>
                          ))}

                          {/* Add button - moved to left */}
                          <div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                if (readOnly) return;
                                addOperation();
                              }}
                              disabled={readOnly}
                              className={cn(
                                "inline-flex items-center gap-2",
                                readOnly && "opacity-60 cursor-not-allowed"
                              )}
                              aria-label="Add new operation"
                            >
                              <Plus className="w-4 h-4" /> Add
                            </Button>
                          </div>
                        </div>

                        {/* Error message for identifiers */}
                        {operationErrors['identifiers'] && (
                          <div className="text-xs text-red-500">{operationErrors['identifiers']}</div>
                        )}

                        {/* Error message for operations */}
                        {operationErrors['operations'] && (
                          <div className="text-xs text-red-500">{operationErrors['operations']}</div>
                        )}
              </TabsContent>

              <TabsContent value="assign" className="mt-4 bg-white p-3 space-y-3">
                  <div className="space-y-2">
                    {assignedVars.length === 0 && (
                      <div className="text-xs text-slate-500">
                        No variables yet. Click Add to create a new assignment.
                      </div>
                    )}

                    {assignedVars.map((row, idx) => (
                      <div key={row.id} className="flex items-start gap-2">
                        <div className="flex-1">
                          <Input
                            ref={idx === assignedVars.length - 1 ? newVarRef : undefined}
                            value={row.variableName}
                            onChange={(e) => {
                              if (readOnly) return;
                              updateAssignRow(row.id, { variableName: e.target.value, nameError: null });
                            }}
                            placeholder="Variable name"
                            disabled={readOnly}
                            className={cn(
                              "h-9 text-sm",
                              row.nameError && "border-red-400",
                              readOnly && "opacity-60 cursor-not-allowed"
                            )}
                            aria-label="Variable name"
                          />
                          {row.nameError && (
                            <div className="text-xs text-red-500 mt-1">{row.nameError}</div>
                          )}
                        </div>

                        <div className="flex-1">
                          <Input
                            value={row.value}
                            onChange={(e) => {
                              if (readOnly) return;
                              updateAssignRow(row.id, { value: e.target.value, valueError: null });
                            }}
                            placeholder="Constant value"
                            disabled={readOnly}
                            className={cn(
                              "h-9 text-sm",
                              row.valueError && "border-red-400",
                              readOnly && "opacity-60 cursor-not-allowed"
                            )}
                            aria-label="Constant value"
                          />
                          {row.valueError && (
                            <div className="text-xs text-red-500 mt-1">{row.valueError}</div>
                          )}
                        </div>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (readOnly) return;
                            removeAssignRow(row.id);
                          }}
                          disabled={readOnly}
                          className={cn(
                            "h-9 w-9 p-0 text-gray-500 hover:text-red-600",
                            readOnly && "opacity-60 cursor-not-allowed"
                          )}
                          title="Delete assignment"
                          aria-label="Delete assignment"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}

                    <div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (readOnly) return;
                          addAssignRow();
                        }}
                        disabled={readOnly}
                        className={cn(
                          "inline-flex items-center gap-2",
                          readOnly && "opacity-60 cursor-not-allowed"
                        )}
                        aria-label="Add new assignment row"
                      >
                        <Plus className="w-4 h-4" /> Add
                      </Button>
                    </div>
                  </div>

                  {/* <div className="flex items-center justify-between mt-2">
                    <div className="text-xs text-slate-500">
                      Assigned variables are stored in the lab and can be reused in computations.
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        className="text-slate-700 border-slate-200"
                        onClick={() => {
                          setAssignedVars([]);
                          setVariableMode(null);
                          setActiveVariableTab(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div> */}

                </TabsContent>
            </Tabs>
            {/* Saved Variables */}
            <Card className={cn("p-3", readOnly && "opacity-60")}>
              <Collapsible
                open={savedOpen}
                onOpenChange={(open) => {
                  if (readOnly) return;
                  setSavedOpen(open);
                }}
                disabled={readOnly}
              >
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between cursor-pointer">
                    <Label className="text-sm font-medium text-gray-900">Saved / Imported Variables</Label>
                    <div className="flex items-center gap-2">
                      {savedVars.length > 0 && (
                        <span className="text-xs text-gray-500">
                          {savedVars.length} variable{savedVars.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      {savedOpen ? (
                        <ChevronDown className="w-4 h-4 text-gray-500" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-500" />
                      )}
                    </div>
                  </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="mt-2 space-y-2">
                    {loadingVariables ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-[#458EE2]" />
                        <p className="text-xs text-gray-500">Loading variables...</p>
                      </div>
                    ) : savedVars.length === 0 ? (
                      <p className="text-xs text-gray-500">
                        No saved variables found. You can create new variables below or import from another source.
                      </p>
                    ) : (
                      <>
                        <Input
                          value={searchQuery}
                          onChange={(e) => {
                            if (readOnly) return;
                            setSearchQuery(e.target.value);
                          }}
                          placeholder="Search variables..."
                          disabled={readOnly}
                          className={cn(
                            "h-8 text-xs",
                            readOnly && "opacity-60 cursor-not-allowed"
                          )}
                          aria-label="Search saved variables"
                        />
                        <div className="max-h-44 overflow-y-auto mt-2 space-y-1">
                          {filteredSaved.length === 0 ? (
                            <p className="text-xs text-gray-500">No variables match your search.</p>
                          ) : (
                            filteredSaved.map((v) => {
                              const metadata = v.metadata || {};
                              const tooltipContent = (
                                <div className="text-xs space-y-1">
                                  <div>
                                    <strong>Value:</strong> {v.value || 'N/A'}
                                  </div>
                                  {v.description && (
                                    <div>
                                      <strong>Description:</strong> {v.description}
                                    </div>
                                  )}
                                  {metadata.data_source && (
                                    <div>
                                      <strong>Data Source:</strong> {metadata.data_source}
                                    </div>
                                  )}
                                  {metadata.compute_mode && (
                                    <div>
                                      <strong>Compute Mode:</strong> {metadata.compute_mode}
                                    </div>
                                  )}
                                  {metadata.operation && (
                                    <div>
                                      <strong>Operation:</strong> {metadata.operation.method} on{' '}
                                      {metadata.operation.numericalColumn}
                                      {metadata.operation.secondColumn &&
                                        ` and ${metadata.operation.secondColumn}`}
                                    </div>
                                  )}
                                  {metadata.identifiers &&
                                    Object.keys(metadata.identifiers).length > 0 && (
                                      <div>
                                        <strong>Identifiers:</strong>{' '}
                                        {JSON.stringify(metadata.identifiers)}
                                      </div>
                                    )}
                                  {v.createdAt && (
                                    <div>
                                      <strong>Created:</strong> {new Date(v.createdAt).toLocaleString()}
                                    </div>
                                  )}
                                  {v.updatedAt && (
                                    <div>
                                      <strong>Updated:</strong> {new Date(v.updatedAt).toLocaleString()}
                                    </div>
                                  )}
                                </div>
                              );

                              return (
                                <TooltipProvider key={v.id} delayDuration={300}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center justify-between p-2 hover:bg-slate-50 rounded cursor-pointer">
                                        <div className="text-sm text-slate-700 truncate" title={v.variableName}>
                                          {v.variableName}
                                        </div>
                                      <div className="flex items-center gap-2">
                                          <div className="text-xs text-slate-500 truncate" title={v.value}>
                                            {v.value}
                                          </div>
                                          {onImport && (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                handleImportVar(v);
                                              }}
                                              className="text-xs px-2 py-0.5 h-6"
                                              aria-label={`Import variable ${v.variableName}`}
                                        >
                                          Import
                                            </Button>
                                          )}
                                      </div>
                                    </div>
                                  </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-md text-xs">
                                      {tooltipContent}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              );
                            })
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          </>
        )}

        {/* Column operations UI */}
        {selectedType === 'column' && (
          <MetricsColOps 
            ref={metricsColOpsRef}
            dataSource={dataSource}
            featureOverviewApi={featureOverviewApi}
            onColumnCreated={onColumnCreated}
            onTableCreated={onTableCreated}
          />
          // <div className="space-y-4">
          //   {/* Conditional layout based on state */}
          //   {columnOperations.length === 0 && !columnSearchQuery.trim() && !exploreOpen? (
          //     // Centered empty state with large search bar
          //     <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
          //       <div className="w-full max-w-2xl space-y-4">
          //         <div className="relative">
          //           <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          //           <Input
          //             value={columnSearchQuery}
          //             onChange={(e) => setColumnSearchQuery(e.target.value)}
          //             placeholder='Describe what you want to calculate… e.g. "max price by brand", "add two columns", "moving average"'
          //             className="h-12 pl-12 text-base"
          //             aria-label="Search column operations"
          //           />
          //         </div>
          //         <div className="flex justify-center">
          //           <Button
          //             variant="outline"
          //             onClick={()=>handleExploreToggle()}
          //             className="flex items-center gap-2"
          //           >
          //             {exploreOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          //             Explore Operations
          //           </Button>
          //         </div>
          //       </div>
          //     </div>
          //   ) : (
          //     // Normal layout with search at top
          //     <>
          //       <div className="space-y-2">
          //         <div className="flex items-center gap-2">
          //           <div className="flex-1 relative">
          //             <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          //             <Input
          //               value={columnSearchQuery}
          //               onChange={(e) => setColumnSearchQuery(e.target.value)}
          //               placeholder='Describe what you want to calculate… e.g. "max price by brand", "add two columns", "moving average"'
          //               className="h-12 pl-10 text-base"
          //               aria-label="Search column operations"
          //             />
          //           </div>
          //           <Button
          //             variant="outline"
          //             onClick={handleExploreToggle}
          //             className="flex items-center gap-2"
          //           >
          //             {exploreOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          //             Explore Operations
          //           </Button>
          //         </div>

          //         {/* Operations Browser */}
          //         {exploreOpen && (
          //           <div className="p-3">
          //             <Collapsible open={exploreOpen} onOpenChange={handleExploreToggle}>
          //               <CollapsibleContent>
          //                 {(() => {
          //                   // Determine what to show: filtered results if searching, all categories if not
          //                   const categoriesToShow = columnSearchQuery.trim() 
          //                     ? filteredColumnCategories 
          //                     : columnOperationCategories;
                            
          //                   if (categoriesToShow.length === 0) {
          //                     return (
          //                       <p className="text-xs text-gray-500 text-center py-4">
          //                         {columnSearchQuery.trim() 
          //                           ? "No operations match your search."
          //                           : "No operations available."}
          //                       </p>
          //                     );
          //                   }
                            
          //                   return categoriesToShow.map((category) => (
          //                     <Collapsible
          //                       key={category.name}
          //                       open={openColumnCategories[category.name] ?? false}
          //                       onOpenChange={() => toggleColumnCategory(category.name)}
          //                     >
          //                       <CollapsibleTrigger className="flex items-center justify-between w-full p-1.5 border border-gray-200 hover:border-gray-300 hover:bg-gray-50 rounded transition-colors">
          //                         <div className="flex items-center space-x-1.5 flex-1 min-w-0">
          //                           <div className="w-4 h-4 bg-gray-100 border border-gray-300 rounded flex items-center justify-center flex-shrink-0">
          //                             <category.icon className="w-2.5 h-2.5 text-gray-700" />
          //                           </div>
          //                           <span className="font-medium text-gray-900 text-xs truncate">{category.name}</span>
          //                           <span className="text-[10px] text-gray-400 flex-shrink-0">({category.operations.length})</span>
          //                         </div>
          //                         {openColumnCategories[category.name] ? (
          //                           <ChevronDown className="w-3 h-3 text-gray-400 flex-shrink-0 ml-1" />
          //                         ) : (
          //                           <ChevronRight className="w-3 h-3 text-gray-400 flex-shrink-0 ml-1" />
          //                         )}
          //                       </CollapsibleTrigger>
          //                       <CollapsibleContent className="pt-1.5 pb-1.5">
          //                         <div className="ml-2 pl-2 border-l-2 border-gray-200 grid grid-cols-2 gap-1.5">
          //                           {category.operations.map((op) => (
          //                             <TooltipProvider key={op.type} delayDuration={0}>
          //                               <Tooltip>
          //                                 <TooltipTrigger asChild>
          //                                   <div
          //                                     onClick={() => handleColumnOperationClick(op)}
          //                                     className="p-1.5 border border-gray-200 rounded-lg bg-white transition-all cursor-pointer group relative flex items-center space-x-1.5 hover:shadow-md hover:border-gray-300"
          //                                   >
          //                                     <Plus className="w-3 h-3 text-gray-600" />
          //                                     <span className="text-[10px] font-medium text-gray-900">{op.name}</span>
          //                                   </div>
          //                                 </TooltipTrigger>
          //                                 <TooltipContent side="top" className="text-xs max-w-xs">
          //                                   <p className="font-semibold mb-1">{op.name}</p>
          //                                   <p className="mb-1">{op.description}</p>
          //                                   {columnOperationFormulas[op.type] && (
          //                                     <p className="text-[10px] text-gray-400 italic">
          //                                       Formula: {columnOperationFormulas[op.type]}
          //                                     </p>
          //                                   )}
          //                                 </TooltipContent>
          //                               </Tooltip>
          //                             </TooltipProvider>
          //                           ))}
          //                         </div>
          //                       </CollapsibleContent>
          //                     </Collapsible>
          //                   ));
          //                 })()}
          //               </CollapsibleContent>
          //             </Collapsible>
          //           </div>
          //         )}
          //       </div>

          //       {/* Selected Operations */}
          //       {columnOperations.length > 0 && (
          //         <div className="space-y-3">
          //           <div className="flex items-center justify-between">
          //             <div className="flex items-center gap-2">
          //               <span className="text-sm font-medium text-gray-900">
          //                 Selected Operations
          //               </span>
          //               <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
          //                 {columnOperations.length} {columnOperations.length === 1 ? 'operation' : 'operations'}
          //               </span>
          //             </div>
          //             <Button
          //               variant="outline"
          //               size="sm"
          //               onClick={() => setColumnOperations([])}
          //               className="text-xs"
          //             >
          //               Clear All
          //             </Button>
          //           </div>

          //       {columnOperations.map((op) => {
          //         const opType = allColumnOperations.find(o => o.type === op.type);
          //         const Icon = opType?.icon || Activity;
                  
          //         return (
          //           <Card key={op.id} className="p-3">
          //             <div className="space-y-3">
          //               <div className="flex items-center justify-between border-b border-gray-200 pb-2">
          //                 <div className="flex items-center gap-2">
          //                   <div className="h-6 w-6 rounded bg-blue-100 flex items-center justify-center">
          //                     <Icon className="w-3 h-3 text-blue-600" />
          //                   </div>
          //                   <span className="text-sm font-medium text-gray-900">{op.name}</span>
          //                   {columnOperationFormulas[op.type] && (
          //                     <TooltipProvider delayDuration={0}>
          //                       <Tooltip>
          //                         <TooltipTrigger asChild>
          //                           <HelpCircle className="w-3 h-3 text-gray-400 cursor-help" />
          //                         </TooltipTrigger>
          //                         <TooltipContent side="top" className="text-xs">
          //                           <p>{columnOperationFormulas[op.type]}</p>
          //                         </TooltipContent>
          //                       </Tooltip>
          //                     </TooltipProvider>
          //                   )}
          //                 </div>
          //                 <Button
          //                   variant="ghost"
          //                   size="icon"
          //                   onClick={() => removeColumnOperation(op.id)}
          //                   className="h-6 w-6 text-red-500 hover:text-red-700 hover:bg-red-50"
          //                 >
          //                   <Trash2 className="w-3 h-3" />
          //                 </Button>
          //               </div>

          //               {/* Simplified Configuration UI - will be expanded based on operation type */}
          //               <div className="space-y-2">
          //                 {/* Column selectors - simplified version */}
          //                 {op.type === 'add' || op.type === 'subtract' || op.type === 'multiply' || op.type === 'divide' || op.type === 'pct_change' ? (
          //                   <div className="space-y-2">
          //                     <div className="flex items-center justify-between">
          //                       <Label className="text-xs text-gray-600">Columns</Label>
          //                       {(op.type === 'add' || op.type === 'subtract' || op.type === 'multiply' || op.type === 'divide') && (
          //                         <Button
          //                           size="icon"
          //                           variant="ghost"
          //                           onClick={() => addColumnToOperation(op.id)}
          //                           className="h-5 w-5"
          //                         >
          //                           <Plus className="w-2.5 h-2.5" />
          //                         </Button>
          //                       )}
          //                     </div>
          //                     <div className="grid grid-cols-2 gap-2">
          //                       {op.columns.map((col, idx) => {
          //                         const isLast = idx === op.columns.length - 1;
          //                         const isOddTotal = op.columns.length % 2 === 1;
          //                         const shouldSpanFull = isLast && isOddTotal;
          //                         const shouldShowTrash = (op.type === 'add' || op.type === 'subtract' || op.type === 'multiply' || op.type === 'divide') 
          //                           ? op.columns.length > 2 
          //                           : op.columns.length > 1;
                                  
          //                         return (
          //                           <div key={idx} className={`flex items-center gap-1 ${shouldSpanFull ? 'col-span-2' : ''}`}>
          //                             <div className="flex-1 space-y-1">
          //                               <Label className="text-xs text-gray-600">Column {idx + 1}</Label>
          //                               <select
          //                                 value={col}
          //                                 onChange={(e) => updateColumnInOperation(op.id, idx, e.target.value)}
          //                                 className="w-full h-8 text-xs px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          //                               >
          //                                 <option value="">Select column...</option>
          //                                 {numericalColumnsForOps.map(colName => (
          //                                   <option key={colName} value={colName}>{colName}</option>
          //                                 ))}
          //                               </select>
          //                             </div>
          //                             {shouldShowTrash && (
          //                               <Button
          //                                 size="icon"
          //                                 variant="ghost"
          //                                 onClick={() => removeColumnFromOperation(op.id, idx)}
          //                                 className="h-4 w-4 text-red-400 hover:text-red-600 flex-shrink-0 mt-5"
          //                               >
          //                                 <Trash2 className="w-1.5 h-1.5" />
          //                               </Button>
          //                             )}
          //                           </div>
          //                         );
          //                       })}
          //                     </div>
          //                   </div>
          //                 ) : op.type === 'power' || op.type === 'lag' || op.type === 'lead' || op.type === 'diff' || 
          //                   op.type === 'rolling_mean' || op.type === 'rolling_sum' || op.type === 'rolling_min' || 
          //                   op.type === 'rolling_max' ? (
          //                   <>
          //                     <div className="space-y-1">
          //                       <Label className="text-xs text-gray-600">Column</Label>
          //                       <select
          //                         value={op.columns[0] || ''}
          //                         onChange={(e) => updateColumnInOperation(op.id, 0, e.target.value)}
          //                         className="w-full h-8 text-xs px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          //                       >
          //                         <option value="">Select column...</option>
          //                         {getAvailableColumns(op.type).map(colName => (
          //                           <option key={colName} value={colName}>{colName}</option>
          //                         ))}
          //                       </select>
          //                     </div>
          //                     <div className="space-y-1">
          //                       <Label className="text-xs text-gray-600">
          //                         {op.type === 'power' ? 'Exponent' : op.type === 'rolling_mean' || op.type === 'rolling_sum' || op.type === 'rolling_min' || op.type === 'rolling_max' ? 'Window Size' : 'Period'}
          //                       </Label>
          //                         <Input
          //                           type="number"
          //                           step={op.type === 'power' ? 'any' : '1'}
          //                           value={op.param || ''}
          //                           onChange={(e) => updateColumnOperation(op.id, { param: e.target.value })}
          //                           placeholder={op.type === 'power' ? 'Enter exponent' : 'Enter value'}
          //                           className="h-8 text-xs"
          //                         />
          //                     </div>
          //                   </>
          //                 ) : op.type === 'log' || op.type === 'sqrt' || op.type === 'exp' || op.type === 'detrend' || 
          //                   op.type === 'deseasonalize' || op.type === 'detrend_deseasonalize' || op.type === 'standardize_minmax' || 
          //                   op.type === 'standardize_zscore' || op.type === 'lower' || op.type === 'upper' || op.type === 'strip' || 
          //                   op.type === 'dummy' ? (
          //                   <div className="space-y-1">
          //                     <Label className="text-xs text-gray-600">Column</Label>
          //                     <select
          //                       value={op.columns[0] || ''}
          //                       onChange={(e) => updateColumnInOperation(op.id, 0, e.target.value)}
          //                       className="w-full h-8 text-xs px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          //                     >
          //                       <option value="">Select column...</option>
          //                       {getAvailableColumns(op.type).map(colName => (
          //                         <option key={colName} value={colName}>{colName}</option>
          //                       ))}
          //                     </select>
          //                   </div>
          //                 ) : op.type === 'datetime' ? (
          //                   <>
          //                     <div className="space-y-1">
          //                       <Label className="text-xs text-gray-600">Date Column</Label>
          //                       <select
          //                         value={op.columns[0] || ''}
          //                         onChange={(e) => updateColumnInOperation(op.id, 0, e.target.value)}
          //                         className="w-full h-8 text-xs px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          //                       >
          //                         <option value="">Select date column...</option>
          //                         {getAvailableColumns(op.type).map(colName => (
          //                           <option key={colName} value={colName}>{colName}</option>
          //                         ))}
          //                       </select>
          //                     </div>
          //                     <div className="space-y-1">
          //                       <Label className="text-xs text-gray-600">Component</Label>
          //                       <select
          //                         value={(op.param as string) || ''}
          //                         onChange={(e) => updateColumnOperation(op.id, { param: e.target.value })}
          //                         className="w-full h-8 text-xs px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          //                       >
          //                         <option value="">Select component...</option>
          //                         <option value="to_year">Year</option>
          //                         <option value="to_month">Month</option>
          //                         <option value="to_week">Week</option>
          //                         <option value="to_day">Day</option>
          //                         <option value="to_day_name">Day Name</option>
          //                         <option value="to_month_name">Month Name</option>
          //                       </select>
          //                     </div>
          //                   </>
          //                 ) : op.type === 'compute_metrics_within_group' ? (
          //                   <>
          //                     <div className="space-y-1 w-full">
          //                       <Label className="text-xs text-gray-600">Identifiers</Label>
          //                       <div className="w-full">
          //                         <MultiSelectDropdown
          //                           placeholder="Select identifiers for grouping"
          //                           selectedValues={op.columns.filter(Boolean)}
          //                           onSelectionChange={(selectedValues) => {
          //                             updateColumnOperation(op.id, { columns: selectedValues });
          //                           }}
          //                           options={selectedColumnIdentifiers.map(id => ({
          //                             value: id,
          //                             label: id
          //                           }))}
          //                           showSelectAll={true}
          //                           showDeselectAll={true}
          //                           showTrigger={true}
          //                           triggerClassName="h-8 text-xs w-full"
          //                           maxHeight="200px"
          //                           className="w-full"
          //                         />
          //                       </div>
          //                     </div>
          //                     <div className="space-y-2">
          //                       <div className="flex items-center justify-between">
          //                         <Label className="text-xs text-gray-600">Numerical Column & Method</Label>
          //                         <Button
          //                           size="icon"
          //                           variant="ghost"
          //                           onClick={() => {
          //                             const currentParam = (op.param as Record<string, any>) || { metric_cols: [{ metric_col: '', method: 'sum', rename: '' }] };
          //                             const metricCols = currentParam.metric_cols || [{ metric_col: '', method: 'sum', rename: '' }];
          //                             updateColumnOperation(op.id, { param: { ...currentParam, metric_cols: [...metricCols, { metric_col: '', method: 'sum', rename: '' }] } });
          //                           }}
          //                           className="h-5 w-5"
          //                         >
          //                           <Plus className="w-2.5 h-2.5" />
          //                         </Button>
          //                       </div>
          //                       {((op.param as Record<string, any>)?.metric_cols || [{ metric_col: '', method: 'sum', rename: '' }]).map((item: any, idx: number) => {
          //                         const metricCols = (op.param as Record<string, any>)?.metric_cols || [{ metric_col: '', method: 'sum', rename: '' }];
          //                         // Check for duplicate column names
          //                         const allRenames = metricCols.map((m: any) => m.rename || (m.metric_col && m.method ? `${m.metric_col}_group_${m.method}` : '')).filter(Boolean);
          //                         const duplicateRenames = allRenames.filter((name: string, i: number) => allRenames.indexOf(name) !== i);
          //                         const currentRename = item.rename || (item.metric_col && item.method ? `${item.metric_col}_group_${item.method}` : '');
          //                         const hasDuplicate = duplicateRenames.includes(currentRename) && currentRename;
                                  
          //                         return (
          //                           <div key={idx} className="space-y-1">
          //                             <div className="flex items-center gap-1">
          //                               <div className="flex-1">
          //                                 <select
          //                                   value={item.metric_col || ''}
          //                                   onChange={(e) => {
          //                                     const currentParam = (op.param as Record<string, any>) || { metric_cols: [{ metric_col: '', method: 'sum', rename: '' }] };
          //                                     const newMetricCols = [...(currentParam.metric_cols || [{ metric_col: '', method: 'sum', rename: '' }])];
          //                                     newMetricCols[idx] = { ...newMetricCols[idx], metric_col: e.target.value };
          //                                     updateColumnOperation(op.id, { param: { ...currentParam, metric_cols: newMetricCols } });
          //                                   }}
          //                                   className="w-full h-8 text-xs px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          //                                 >
          //                                   <option value="">Select numerical column</option>
          //                                   {numericalColumnsForOps.map(colName => (
          //                                     <option key={colName} value={colName}>{colName}</option>
          //                                   ))}
          //                                 </select>
          //                               </div>
          //                               <div className="flex-1">
          //                                 <select
          //                                   value={item.method || 'sum'}
          //                                   onChange={(e) => {
          //                                     const currentParam = (op.param as Record<string, any>) || { metric_cols: [{ metric_col: '', method: 'sum', rename: '' }] };
          //                                     const newMetricCols = [...(currentParam.metric_cols || [{ metric_col: '', method: 'sum', rename: '' }])];
          //                                     newMetricCols[idx] = { ...newMetricCols[idx], method: e.target.value };
          //                                     updateColumnOperation(op.id, { param: { ...currentParam, metric_cols: newMetricCols } });
          //                                   }}
          //                                   className="w-full h-8 text-xs px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          //                                 >
          //                                   <option value="sum">Sum</option>
          //                                   <option value="mean">Mean</option>
          //                                   <option value="median">Median</option>
          //                                   <option value="max">Max</option>
          //                                   <option value="min">Min</option>
          //                                   <option value="count">Count</option>
          //                                   <option value="nunique">Nunique</option>
          //                                   <option value="rank">Rank</option>
          //                                   <option value="rank_pct">Rank Percentile</option>
          //                                 </select>
          //                               </div>
          //                               {idx >= 1 && (
          //                                 <Button
          //                                   size="icon"
          //                                   variant="ghost"
          //                                   onClick={() => {
          //                                     const currentParam = (op.param as Record<string, any>) || { metric_cols: [{ metric_col: '', method: 'sum', rename: '' }] };
          //                                     const newMetricCols = [...(currentParam.metric_cols || [{ metric_col: '', method: 'sum', rename: '' }])];
          //                                     newMetricCols.splice(idx, 1);
          //                                     updateColumnOperation(op.id, { param: { ...currentParam, metric_cols: newMetricCols } });
          //                                   }}
          //                                   className="h-4 w-4 text-red-400 hover:text-red-600 flex-shrink-0"
          //                                 >
          //                                   <Trash2 className="w-1.5 h-1.5" />
          //                                 </Button>
          //                               )}
          //                             </div>
          //                             <div className="flex-1">
          //                               <Input
          //                                 placeholder={item.metric_col && item.method ? `${item.metric_col}_group_${item.method}` : 'Column name (optional)'}
          //                                 value={item.rename || ''}
          //                                 onChange={(e) => {
          //                                   const currentParam = (op.param as Record<string, any>) || { metric_cols: [{ metric_col: '', method: 'sum', rename: '' }] };
          //                                   const newMetricCols = [...(currentParam.metric_cols || [{ metric_col: '', method: 'sum', rename: '' }])];
          //                                   newMetricCols[idx] = { ...newMetricCols[idx], rename: e.target.value };
          //                                   updateColumnOperation(op.id, { param: { ...currentParam, metric_cols: newMetricCols } });
          //                                 }}
          //                                 className={`h-8 text-xs ${hasDuplicate ? 'border-red-500' : ''}`}
          //                               />
          //                               {hasDuplicate && (
          //                                 <p className="text-[9px] text-red-500 mt-0.5">Duplicate column name</p>
          //                               )}
          //                             </div>
          //                           </div>
          //                         );
          //                       })}
          //                     </div>
          //                   </>
          //                 ) : op.type === 'group_share_of_total' || op.type === 'group_contribution' ? (
          //                   <>
          //                     <div className="space-y-1 w-full">
          //                       <Label className="text-xs text-gray-600">Identifiers</Label>
          //                       <div className="w-full">
          //                         <MultiSelectDropdown
          //                           placeholder="Select identifiers for grouping"
          //                           selectedValues={op.columns.filter(Boolean)}
          //                           onSelectionChange={(selectedValues) => {
          //                             updateColumnOperation(op.id, { columns: selectedValues });
          //                           }}
          //                           options={selectedColumnIdentifiers.map(id => ({
          //                             value: id,
          //                             label: id
          //                           }))}
          //                           showSelectAll={true}
          //                           showDeselectAll={true}
          //                           showTrigger={true}
          //                           triggerClassName="h-8 text-xs w-full"
          //                           maxHeight="200px"
          //                           className="w-full"
          //                         />
          //                       </div>
          //                     </div>
          //                     <div className="space-y-2">
          //                       <div className="flex items-center justify-between">
          //                         <Label className="text-xs text-gray-600">Numerical Column</Label>
          //                         <Button
          //                           size="icon"
          //                           variant="ghost"
          //                           onClick={() => {
          //                             const currentParam = (op.param as Record<string, any>) || { metric_cols: [{ metric_col: '', rename: '' }] };
          //                             const metricCols = currentParam.metric_cols || [{ metric_col: '', rename: '' }];
          //                             updateColumnOperation(op.id, { param: { ...currentParam, metric_cols: [...metricCols, { metric_col: '', rename: '' }] } });
          //                           }}
          //                           className="h-5 w-5"
          //                         >
          //                           <Plus className="w-2.5 h-2.5" />
          //                         </Button>
          //                       </div>
          //                       {((op.param as Record<string, any>)?.metric_cols || [{ metric_col: '', rename: '' }]).map((item: any, idx: number) => {
          //                         const metricCols = (op.param as Record<string, any>)?.metric_cols || [{ metric_col: '', rename: '' }];
          //                         // Check for duplicate column names
          //                         const allRenames = metricCols.map((m: any) => m.rename || (m.metric_col ? `${m.metric_col}_${op.type}` : '')).filter(Boolean);
          //                         const duplicateRenames = allRenames.filter((name: string, i: number) => allRenames.indexOf(name) !== i);
          //                         const currentRename = item.rename || (item.metric_col ? `${item.metric_col}_${op.type}` : '');
          //                         const hasDuplicate = duplicateRenames.includes(currentRename) && currentRename;
                                  
          //                         return (
          //                           <div key={idx} className="space-y-1">
          //                             <div className="flex items-center gap-1">
          //                               <div className="flex-1">
          //                                 <select
          //                                   value={item.metric_col || ''}
          //                                   onChange={(e) => {
          //                                     const currentParam = (op.param as Record<string, any>) || { metric_cols: [{ metric_col: '', rename: '' }] };
          //                                     const newMetricCols = [...(currentParam.metric_cols || [{ metric_col: '', rename: '' }])];
          //                                     newMetricCols[idx] = { ...newMetricCols[idx], metric_col: e.target.value };
          //                                     updateColumnOperation(op.id, { param: { ...currentParam, metric_cols: newMetricCols } });
          //                                   }}
          //                                   className="w-full h-8 text-xs px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          //                                 >
          //                                   <option value="">Select numerical column</option>
          //                                   {numericalColumnsForOps.map(colName => (
          //                                     <option key={colName} value={colName}>{colName}</option>
          //                                   ))}
          //                                 </select>
          //                               </div>
          //                               {idx >= 1 && (
          //                                 <Button
          //                                   size="icon"
          //                                   variant="ghost"
          //                                   onClick={() => {
          //                                     const currentParam = (op.param as Record<string, any>) || { metric_cols: [{ metric_col: '', rename: '' }] };
          //                                     const newMetricCols = [...(currentParam.metric_cols || [{ metric_col: '', rename: '' }])];
          //                                     newMetricCols.splice(idx, 1);
          //                                     updateColumnOperation(op.id, { param: { ...currentParam, metric_cols: newMetricCols } });
          //                                   }}
          //                                   className="h-4 w-4 text-red-400 hover:text-red-600 flex-shrink-0"
          //                                 >
          //                                   <Trash2 className="w-1.5 h-1.5" />
          //                                 </Button>
          //                               )}
          //                             </div>
          //                             <div className="flex-1">
          //                               <Input
          //                                 placeholder={item.metric_col ? `${item.metric_col}_${op.type}` : 'Column name (optional)'}
          //                                 value={item.rename || ''}
          //                                 onChange={(e) => {
          //                                   const currentParam = (op.param as Record<string, any>) || { metric_cols: [{ metric_col: '', rename: '' }] };
          //                                   const newMetricCols = [...(currentParam.metric_cols || [{ metric_col: '', rename: '' }])];
          //                                   newMetricCols[idx] = { ...newMetricCols[idx], rename: e.target.value };
          //                                   updateColumnOperation(op.id, { param: { ...currentParam, metric_cols: newMetricCols } });
          //                                 }}
          //                                 className={`h-8 text-xs ${hasDuplicate ? 'border-red-500' : ''}`}
          //                               />
          //                               {hasDuplicate && (
          //                                 <p className="text-[9px] text-red-500 mt-0.5">Duplicate column name</p>
          //                               )}
          //                             </div>
          //                           </div>
          //                         );
          //                       })}
          //                     </div>
          //                   </>
          //                 ) : op.type === 'replace' ? (
          //                   <>
          //                     <div className="space-y-1">
          //                       <Label className="text-xs text-gray-600">Column</Label>
          //                       <select
          //                         value={op.columns[0] || ''}
          //                         onChange={(e) => updateColumnInOperation(op.id, 0, e.target.value)}
          //                         className="w-full h-8 text-xs px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          //                       >
          //                         <option value="">Select column...</option>
          //                         {getAvailableColumns(op.type).map(colName => (
          //                           <option key={colName} value={colName}>{colName}</option>
          //                         ))}
          //                       </select>
          //                     </div>
          //                     {op.columns[0] && (
          //                       <>
          //                         <div className="space-y-1">
          //                           <Label className="text-xs text-gray-600">Replace value</Label>
          //                           <Select
          //                             value={(op.param as Record<string, any>)?.oldValue || ''}
          //                             onValueChange={(value) => {
          //                               const currentParam = (op.param as Record<string, any>) || { oldValue: '', newValue: '' };
          //                               updateColumnOperation(op.id, { param: { ...currentParam, oldValue: value } });
          //                             }}
          //                             onOpenChange={(open) => {
          //                               // Fetch unique values when dropdown is opened
          //                               if (open && op.columns[0]) {
          //                                 const existingValues = replaceUniqueValues[op.id];
          //                                 // Only fetch if we don't already have values or if column changed
          //                                 if (!existingValues || existingValues.length === 0) {
          //                                   fetchReplaceUniqueValues(op.id, op.columns[0]);
          //                                 }
          //                               }
          //                             }}
          //                           >
          //                             <SelectTrigger className="h-8 text-xs">
          //                               <SelectValue placeholder="Select value to replace" />
          //                             </SelectTrigger>
          //                             <SelectContent>
          //                               {loadingReplaceValues[op.id] ? (
          //                                 <div className="px-2 py-1.5 text-xs text-gray-500">Loading...</div>
          //                               ) : (replaceUniqueValues[op.id] || []).length > 0 ? (
          //                                 (replaceUniqueValues[op.id] || [])
          //                                   .filter(val => val !== null && val !== undefined && val !== '')
          //                                   .map((val) => (
          //                                     <SelectItem key={val} value={String(val)} className="text-xs">
          //                                       {String(val)}
          //                                     </SelectItem>
          //                                   ))
          //                               ) : (
          //                                 <div className="px-2 py-1.5 text-xs text-gray-500">No values available</div>
          //                               )}
          //                             </SelectContent>
          //                           </Select>
          //                         </div>
          //                         <div className="space-y-1">
          //                           <Label className="text-xs text-gray-600">Replace with</Label>
          //                           <Input
          //                             type="text"
          //                             value={(op.param as Record<string, any>)?.newValue || ''}
          //                             onChange={(e) => {
          //                               const currentParam = (op.param as Record<string, any>) || { oldValue: '', newValue: '' };
          //                               updateColumnOperation(op.id, { param: { ...currentParam, newValue: e.target.value } });
          //                             }}
          //                             placeholder="Enter replacement value"
          //                             className="h-8 text-xs"
          //                           />
          //                         </div>
          //                       </>
          //                     )}
          //                   </>
          //                 ) : (
          //                   <div className="space-y-1">
          //                     <Label className="text-xs text-gray-600">Column</Label>
          //                     <select
          //                       value={op.columns[0] || ''}
          //                       onChange={(e) => updateColumnInOperation(op.id, 0, e.target.value)}
          //                       className="w-full h-8 text-xs px-2 border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          //                     >
          //                       <option value="">Select column...</option>
          //                       {getAvailableColumns(op.type).map(colName => (
          //                         <option key={colName} value={colName}>{colName}</option>
          //                       ))}
          //                     </select>
          //                   </div>
          //                 )}

          //                 {/* Rename field (for operations that support it) */}
          //                 {op.type !== 'rename' && op.type !== 'lower' && op.type !== 'upper' && op.type !== 'strip' && 
          //                  op.type !== 'select_columns' && op.type !== 'drop_columns' && op.type !== 'reorder' && 
          //                  op.type !== 'deduplicate' && op.type !== 'sort_rows' && op.type !== 'filter_rows_condition' && 
          //                  op.type !== 'filter_top_n_per_group' && op.type !== 'filter_percentile' && 
          //                  op.type !== 'compute_metrics_within_group' && op.type !== 'group_share_of_total' && 
          //                  op.type !== 'group_contribution' && (
          //                   <div className="space-y-1">
          //                     <Label className="text-xs text-gray-600">Rename (optional)</Label>
          //                     <Input
          //                       type="text"
          //                       value={typeof op.rename === 'string' ? op.rename : ''}
          //                       onChange={(e) => updateColumnOperation(op.id, { rename: e.target.value })}
          //                       placeholder="New column name"
          //                       className="h-8 text-xs"
          //                     />
          //                   </div>
          //                 )}
          //               </div>
          //             </div>
          //           </Card>
          //         );
          //       })}

          //         </div>
          //       )}
          //     </>
          //   )}
          // </div>
        )}
      </div>


      {/* Column Operations Save As Dialog */}
      <Dialog open={showColumnSaveAs} onOpenChange={setShowColumnSaveAs}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Save Column Operations</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium text-gray-700">Filename</Label>
              <Input
                value={columnSaveFileName}
                onChange={(e) => setColumnSaveFileName(e.target.value)}
                placeholder={`createcolumn_${dataSource?.split('/').pop() || 'data'}_${Date.now()}`}
                className="w-full"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowColumnSaveAs(false)}
              disabled={columnSaveLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={() => handleSaveColumnOperations(false)}
              disabled={columnSaveLoading || !columnSaveFileName.trim()}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {columnSaveLoading ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Column Operations Overwrite Confirmation Dialog */}
      <Dialog open={showColumnOverwriteConfirm} onOpenChange={setShowColumnOverwriteConfirm}>
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
              onClick={() => setShowColumnOverwriteConfirm(false)}
              disabled={columnSaveLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={() => handleSaveColumnOperations(true)}
              disabled={columnSaveLoading}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {columnSaveLoading ? 'Saving...' : 'Yes, Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Overwrite Confirmation Dialog */}
      {showOverwriteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="p-6 max-w-md w-full mx-4 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Overwrite Existing Variables?</h3>
              <p className="text-sm text-gray-600 mt-2">
                The following variable(s) already exist and will be overwritten:
              </p>
              <ul className="list-disc list-inside text-sm text-gray-700 mt-2 max-h-40 overflow-y-auto">
                {existingVariables.map((varName, idx) => (
                  <li key={idx} className="truncate" title={varName}>
                    {varName}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-gray-600 mt-2">Are you sure you want to continue?</p>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={handleCancelOverwrite}>
                Cancel
              </Button>
              <Button onClick={handleConfirmOverwrite} className="bg-red-600 hover:bg-red-700">
                Overwrite
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
});

OperationsTab.displayName = 'OperationsTab';

export default OperationsTab;
