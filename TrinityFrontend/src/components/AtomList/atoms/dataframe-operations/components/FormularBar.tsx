import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Calculator,
  Sigma,
  Hash,
  Check,
  X,
  Search,
  BookOpen,
  Zap,
  TrendingUp,
  Calendar,
} from 'lucide-react';
import { DataFrameData } from '../DataFrameOperationsAtom';

interface FormularBarProps {
  data: DataFrameData | null;
  selectedCell: { row: number; col: string } | null;
  selectedColumn: string | null;
  columnFormulas: Record<string, string>;
  formulaInput: string;
  isFormulaMode: boolean;
  isFormulaBarFrozen?: boolean;
  formulaValidationError?: string | null;
  isEditingFormula: boolean;
  onSelectedCellChange: (cell: { row: number; col: string } | null) => void;
  onSelectedColumnChange: (col: string | null) => void;
  onFormulaInputChange: (value: string) => void;
  onFormulaModeChange: (mode: boolean) => void;
  onFormulaSubmit: () => void;
  onValidationError?: (message: string | null) => void;
  onEditingStateChange: (editing: boolean) => void;
}

function safeToString(val: unknown): string {
  if (val === undefined || val === null) return '';
  try {
    if (typeof val === 'object') {
      return JSON.stringify(val);
    }
    return String(val);
  } catch {
    return '';
  }
}

const getCellReference = (rowIndex: number, columnIndex: number) => {
  if (columnIndex < 0) return '';
  const columnLetter = String.fromCharCode(65 + columnIndex);
  return `${columnLetter}${rowIndex + 1}`;
};

type FormulaCategory = 'math' | 'statistical' | 'logical' | 'text' | 'date' | 'mapping' | 'nulls';

interface FormulaItem {
  key: string;
  name: string;
  syntax: string;
  description: string;
  example: string;
  category: FormulaCategory;
  matcher: (value: string) => boolean;
  priority: number;
}

const normalizeFormula = (value: string) => {
  const trimmed = value.trim();
  return {
    trimmed,
    uppercase: trimmed.toUpperCase(),
    condensed: trimmed.replace(/\s+/g, ''),
  };
};

const createFunctionMatcher = (fn: string) => (value: string) => {
  const { uppercase } = normalizeFormula(value);
  return uppercase.startsWith(`=${fn}(`);
};

const createIfMatcher = (
  check: (ctx: { uppercase: string; condensed: string; trimmed: string }) => boolean,
) => (value: string) => {
  const { uppercase, condensed, trimmed } = normalizeFormula(value);
  if (!uppercase.startsWith('=IF(')) {
    return false;
  }
  return check({ uppercase, condensed, trimmed });
};

const countToken = (value: string, token: string) => {
  let count = 0;
  let index = value.indexOf(token);
  while (index !== -1) {
    count += 1;
    index = value.indexOf(token, index + token.length);
  }
  return count;
};

const hasQuotes = (value: string) => /["']/.test(value);

const formatExampleExpression = (formula: FormulaItem) =>
  formula.example.startsWith('=') ? formula.example : `=${formula.example}`;

// Helper function to replace placeholder columns with Col1, Col2, etc. (Excel-like behavior)
const replacePlaceholdersWithColNumbers = (expression: string): string => {
  // Common placeholder patterns: colA, colB, colC, colX, colY, colDate, colEnd, colStart, number, text, value
  const placeholderPattern = /\b(col[A-Z]|colX|colY|colDate|colEnd|colStart|number|text|value)\b/g;
  let colCounter = 1;
  return expression.replace(placeholderPattern, () => `Col${colCounter++}`);
};

// Helper function to replace next ColX with column name
const replaceNextColPlaceholder = (expression: string, columnName: string): string => {
  const colMatch = expression.match(/Col\d+/);
  if (colMatch) {
    const colIndex = expression.indexOf(colMatch[0]);
    const colLength = colMatch[0].length;
    return expression.slice(0, colIndex) + columnName + expression.slice(colIndex + colLength);
  }
  return expression;
};

// Helper function to replace next ColX with typed content
const replaceNextColPlaceholderWithContent = (expression: string, newContent: string, cursorPosition: number): { newExpression: string; newCursorPosition: number } => {
  // Find the ColX closest to cursor position
  let colMatch = null;
  let minDistance = Infinity;
  let colIndex = -1;
  
  const matches = expression.matchAll(/Col\d+/g);
  for (const match of matches) {
    const distance = Math.abs(match.index! - cursorPosition);
    if (distance < minDistance) {
      minDistance = distance;
      colMatch = match;
      colIndex = match.index!;
    }
  }
  
  if (colMatch && colIndex !== -1) {
    const newExpression = expression.slice(0, colIndex) + newContent + expression.slice(colIndex + colMatch[0].length);
    const newCursorPosition = colIndex + newContent.length;
    return { newExpression, newCursorPosition };
  }
  
  return { newExpression: expression, newCursorPosition: cursorPosition };
};

// Enhanced validation system for Excel-like behavior
interface ValidationResult {
  isValid: boolean;
  error: string | null;
  suggestions: string[];
  errorType: 'syntax' | 'column' | 'operation' | 'parenthesis' | null;
}

// Helper function to find similar column names (fuzzy matching)
const findSimilarColumns = (invalidColumn: string, availableColumns: string[]): string[] => {
  const similarities = availableColumns.map(col => ({
    column: col,
    similarity: calculateSimilarity(invalidColumn.toLowerCase(), col.toLowerCase())
  }));
  
  return similarities
    .filter(s => s.similarity > 0.3) // Only return columns with >30% similarity
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3) // Top 3 suggestions
    .map(s => s.column);
};

// Simple similarity calculation (Levenshtein distance based)
const calculateSimilarity = (str1: string, str2: string): number => {
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  
  if (longer.length === 0) return 1.0;
  
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
};

const levenshteinDistance = (str1: string, str2: string): number => {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
  
  for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,     // deletion
        matrix[j - 1][i] + 1,     // insertion
        matrix[j - 1][i - 1] + indicator // substitution
      );
    }
  }
  
  return matrix[str2.length][str1.length];
};

// Enhanced syntax validation
const validateFormulaSyntax = (expression: string): ValidationResult => {
  const trimmed = expression.trim();
  
  // Check if formula starts with =
  if (!trimmed.startsWith('=')) {
    return {
      isValid: false,
      error: 'Formula must start with =',
      suggestions: ['Add = at the beginning'],
      errorType: 'syntax'
    };
  }
  
  // Check for balanced parentheses
  const openParens = (trimmed.match(/\(/g) || []).length;
  const closeParens = (trimmed.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    const missing = openParens > closeParens ? 'closing' : 'opening';
    return {
      isValid: false,
      error: `Missing ${missing} parenthesis`,
      suggestions: [openParens > closeParens ? 'Add ) to close the function' : 'Add ( to open the function'],
      errorType: 'parenthesis'
    };
  }
  
  // Check for basic syntax errors - but allow == for comparison operators
  // This regex looks for 3 or more consecutive = signs, or == at the beginning of the formula
  if (trimmed.match(/[=]{3,}/) || trimmed.match(/^==/)) {
    return {
      isValid: false,
      error: 'Multiple = signs not allowed',
      suggestions: ['Remove extra = signs'],
      errorType: 'syntax'
    };
  }
  
  // Check for invalid characters in function names
  // Only check the first character after = to avoid false positives with operators inside functions
  const afterEquals = trimmed.slice(1); // Everything after the =
  if (afterEquals.length > 0 && !/^[A-Za-z_\(]/.test(afterEquals)) {
    return {
      isValid: false,
      error: 'Invalid character after =',
      suggestions: ['Start with a function name or column reference'],
      errorType: 'syntax'
    };
  }
  
  return {
    isValid: true,
    error: null,
    suggestions: [],
    errorType: null
  };
};

// Enhanced column validation with suggestions
const validateFormulaColumns = (expression: string, availableColumns: string[]): ValidationResult => {
  // Don't validate if user is still typing Col placeholders
  if (expression.includes('Col')) {
    return {
      isValid: true,
      error: null,
      suggestions: [],
      errorType: null
    };
  }
  
  // First, remove all quoted strings from the expression to avoid false positives
  const expressionWithoutQuotes = expression.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
  
  // Extract only actual column references (not function names, numbers, or quoted strings)
  const columnPattern = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
  const matches = expressionWithoutQuotes.match(columnPattern) || [];
  
  // Filter out function names, numbers, and other non-column references
  const functionNames = ['SUM', 'AVG', 'MAX', 'MIN', 'DIV', 'PROD', 'ABS', 'ROUND', 'FLOOR', 'CEIL', 'EXP', 'LOG', 'SQRT', 'MEAN', 'CORR', 'COV', 'ZSCORE', 'NORM', 'COUNT', 'MEDIAN', 'PERCENTILE', 'STD', 'VAR', 'CUMSUM', 'CUMPROD', 'CUMMAX', 'CUMMIN', 'DIFF', 'PCT_CHANGE', 'LAG', 'IF', 'ISNULL', 'LOWER', 'UPPER', 'LEN', 'SUBSTR', 'STR_REPLACE', 'YEAR', 'MONTH', 'DAY', 'WEEKDAY', 'DATE_DIFF', 'MAP', 'FILLNA', 'FILLBLANK', 'BIN', 'AND', 'OR', 'NOT', 'TRUE', 'FALSE'];
  
  const columnReferences = matches.filter(match => 
    !functionNames.includes(match.toUpperCase()) && 
    !match.startsWith('Col') && // Ignore placeholder Col1, Col2, etc.
    !/^\d+$/.test(match) && // Ignore numbers
    !/^[0-9]+\.?[0-9]*$/.test(match) // Ignore decimal numbers
  );
  
  // If no column references found, no validation needed
  if (columnReferences.length === 0) {
    return {
      isValid: true,
      error: null,
      suggestions: [],
      errorType: null
    };
  }
  
  // Validate column references against actual dataframe columns
  const invalidColumns = columnReferences.filter(col => !availableColumns.includes(col));
  if (invalidColumns.length > 0) {
    const suggestions: string[] = [];
    invalidColumns.forEach(invalidCol => {
      const similar = findSimilarColumns(invalidCol, availableColumns);
      if (similar.length > 0) {
        suggestions.push(`Did you mean: ${similar.join(', ')}?`);
      }
    });
    
    return {
      isValid: false,
      error: `Invalid columns: ${invalidColumns.join(', ')}`,
      suggestions,
      errorType: 'column'
    };
  }
  
  return {
    isValid: true,
    error: null,
    suggestions: [],
    errorType: null
  };
};

// Enhanced operation validation
const validateFormulaOperation = (expression: string): ValidationResult => {
  const trimmed = expression.trim();
  
  // Check for common operation errors
  if (trimmed.match(/[+\-*/]{2,}/)) {
    return {
      isValid: false,
      error: 'Multiple operators in sequence',
      suggestions: ['Remove duplicate operators'],
      errorType: 'operation'
    };
  }
  
  // Check for operators at the beginning or end
  if (trimmed.match(/^[+\-*/]/) || trimmed.match(/[+\-*/]$/)) {
    return {
      isValid: false,
      error: 'Operator at beginning or end of formula',
      suggestions: ['Add operands before/after operators'],
      errorType: 'operation'
    };
  }
  
  // Check for division by zero patterns
  if (trimmed.match(/\/\s*0/)) {
    return {
      isValid: false,
      error: 'Division by zero',
      suggestions: ['Use a non-zero divisor'],
      errorType: 'operation'
    };
  }
  
  return {
    isValid: true,
    error: null,
    suggestions: [],
    errorType: null
  };
};

// Main validation function
const validateFormula = (expression: string, availableColumns: string[]): ValidationResult => {
  // First check syntax
  const syntaxResult = validateFormulaSyntax(expression);
  if (!syntaxResult.isValid) {
    return syntaxResult;
  }

  const disallowedRowFunctions = ['IF', 'AND', 'OR', 'NOT'];
  const disallowedPattern = new RegExp(`\\b(${disallowedRowFunctions.join('|')})\\s*\\(`, 'i');
  if (disallowedPattern.test(expression)) {
    return {
      isValid: false,
      error: 'Row-level functions like IF/AND/OR are not supported yet. Please use column-level formulas.',
      suggestions: [],
      errorType: 'operation'
    };
  }
  
  // Then check columns
  const columnResult = validateFormulaColumns(expression, availableColumns);
  if (!columnResult.isValid) {
    return columnResult;
  }
  
  // Finally check operations
  const operationResult = validateFormulaOperation(expression);
  if (!operationResult.isValid) {
    return operationResult;
  }
  
  return {
    isValid: true,
    error: null,
    suggestions: [],
    errorType: null
  };
};

const isFunctionStyleExample = (formula: FormulaItem) => {
  const candidate = formatExampleExpression(formula).slice(1).toUpperCase();
  return /^[A-Z_]+\s*\(/.test(candidate);
};

const isValidFormulaInput = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed.startsWith('=')) {
    return false;
  }
  return trimmed.length > 1;
};

const formulaLibrary: FormulaItem[] = [
  // Math & aggregations
  {
    key: 'sum',
    name: 'Sum',
    syntax: 'SUM(colA, colB, ...)',
    description: 'Adds the supplied columns row-wise.',
    example: '=SUM(colA,colB)',
    category: 'math',
    matcher: createFunctionMatcher('SUM'),
    priority: 10,
  },
  {
    key: 'product',
    name: 'Product',
    syntax: 'PROD(colA, colB, ...)',
    description: 'Multiplies values across the row.',
    example: '=PROD(colA,colB)',
    category: 'math',
    matcher: createFunctionMatcher('PROD'),
    priority: 10,
  },
  {
    key: 'division',
    name: 'Division',
    syntax: 'DIV(colA, colB, ...)',
    description: 'Sequentially divides the provided values.',
    example: '=DIV(colA,colB)',
    category: 'math',
    matcher: createFunctionMatcher('DIV'),
    priority: 10,
  },
  {
    key: 'absolute',
    name: 'Absolute Value',
    syntax: 'ABS(number)',
    description: 'Returns the absolute value for a column.',
    example: '=ABS(colA)',
    category: 'math',
    matcher: createFunctionMatcher('ABS'),
    priority: 10,
  },
  {
    key: 'round',
    name: 'Round',
    syntax: 'ROUND(number, digits)',
    description: 'Rounds a number using the specified precision.',
    example: '=ROUND(colA, 2)',
    category: 'math',
    matcher: createFunctionMatcher('ROUND'),
    priority: 10,
  },
  {
    key: 'floor',
    name: 'Floor',
    syntax: 'FLOOR(number)',
    description: 'Rounds a number down to the nearest integer.',
    example: '=FLOOR(colA)',
    category: 'math',
    matcher: createFunctionMatcher('FLOOR'),
    priority: 10,
  },
  {
    key: 'ceiling',
    name: 'Ceiling',
    syntax: 'CEIL(number)',
    description: 'Rounds a number up to the nearest integer.',
    example: '=CEIL(colA)',
    category: 'math',
    matcher: createFunctionMatcher('CEIL'),
    priority: 10,
  },
  {
    key: 'exponential',
    name: 'Exponential',
    syntax: 'EXP(number)',
    description: 'Returns Euler’s number raised to the value.',
    example: '=EXP(colA)',
    category: 'math',
    matcher: createFunctionMatcher('EXP'),
    priority: 10,
  },
  {
    key: 'natural-log',
    name: 'Natural Logarithm',
    syntax: 'LOG(number)',
    description: 'Computes the natural log of the column value.',
    example: '=LOG(colA)',
    category: 'math',
    matcher: createFunctionMatcher('LOG'),
    priority: 10,
  },
  {
    key: 'square-root',
    name: 'Square Root',
    syntax: 'SQRT(number)',
    description: 'Returns the square root for numeric columns.',
    example: '=SQRT(colA)',
    category: 'math',
    matcher: createFunctionMatcher('SQRT'),
    priority: 10,
  },
  {
    key: 'square',
    name: 'Square',
    syntax: 'number ** 2',
    description: 'Squares the column using Python exponentiation.',
    example: '=colA ** 2',
    category: 'math',
    matcher: (value) => {
      const { trimmed, condensed } = normalizeFormula(value);
      return trimmed.startsWith('=') && condensed.includes('**') && condensed.endsWith('**2');
    },
    priority: 20,
  },
  {
    key: 'add-or-concat',
    name: 'Concatenate / Add',
    syntax: 'colA + colB',
    description: 'Adds numbers or concatenates text values.',
    example: '=colA + colB',
    category: 'math',
    matcher: (value) => {
      const { trimmed, condensed } = normalizeFormula(value);
      if (!trimmed.startsWith('=')) {
        return false;
      }
      return condensed.slice(1).includes('+');
    },
    priority: 25,
  },
  // Statistical
  {
    key: 'average',
    name: 'Average',
    syntax: 'AVG(colA, colB, ...)',
    description: 'Returns the average of the supplied values.',
    example: '=AVG(colA,colB)',
    category: 'statistical',
    matcher: createFunctionMatcher('AVG'),
    priority: 10,
  },
  {
    key: 'mean',
    name: 'Mean',
    syntax: 'MEAN(colA, colB, ...)',
    description: 'Alias for AVG to average row values.',
    example: '=MEAN(colA,colB,colC)',
    category: 'statistical',
    matcher: createFunctionMatcher('MEAN'),
    priority: 10,
  },
  {
    key: 'median',
    name: 'Median',
    syntax: 'MEDIAN(column)',
    description: 'Returns the median value for the specified column.',
    example: '=MEDIAN(Sales)',
    category: 'statistical',
    matcher: createFunctionMatcher('MEDIAN'),
    priority: 11,
  },
  {
    key: 'percentile',
    name: 'Percentile',
    syntax: 'PERCENTILE(column, quantile)',
    description: 'Computes a quantile (0-1) for the column.',
    example: '=PERCENTILE(Sales, 0.9)',
    category: 'statistical',
    matcher: createFunctionMatcher('PERCENTILE'),
    priority: 12,
  },
  {
    key: 'count',
    name: 'Count (Non-null)',
    syntax: 'COUNT(column)',
    description: 'Counts the number of non-null values in a column.',
    example: '=COUNT(colA)',
    category: 'statistical',
    matcher: createFunctionMatcher('COUNT'),
    priority: 11,
  },
  {
    key: 'maximum',
    name: 'Maximum',
    syntax: 'MAX(colA, colB, ...)',
    description: 'Finds the maximum value for each row.',
    example: '=MAX(colA,colB)',
    category: 'statistical',
    matcher: createFunctionMatcher('MAX'),
    priority: 10,
  },
  {
    key: 'minimum',
    name: 'Minimum',
    syntax: 'MIN(colA, colB, ...)',
    description: 'Finds the minimum value for each row.',
    example: '=MIN(colA,colB)',
    category: 'statistical',
    matcher: createFunctionMatcher('MIN'),
    priority: 10,
  },
  {
    key: 'correlation',
    name: 'Correlation',
    syntax: 'CORR(colX, colY)',
    description: 'Computes Pearson correlation between two columns.',
    example: '=CORR(colA,colB)',
    category: 'statistical',
    matcher: createFunctionMatcher('CORR'),
    priority: 10,
  },
  {
    key: 'zscore',
    name: 'Z-Score (Normalize)',
    syntax: 'ZSCORE(column)',
    description: 'Standardizes a numeric column by subtracting the mean and dividing by the standard deviation.',
    example: '=ZSCORE(colA)',
    category: 'statistical',
    matcher: createFunctionMatcher('ZSCORE'),
    priority: 12,
  },
  {
    key: 'normalize',
    name: 'Normalize (Alias)',
    syntax: 'NORM(column)',
    description: 'Alias of ZSCORE that produces the same standardized values for the selected column.',
    example: '=NORM(colA)',
    category: 'statistical',
    matcher: createFunctionMatcher('NORM'),
    priority: 13,
  },
  {
    key: 'std',
    name: 'Standard Deviation',
    syntax: 'STD(column)',
    description: 'Population standard deviation (ddof = 0).',
    example: '=STD(colA)',
    category: 'statistical',
    matcher: createFunctionMatcher('STD'),
    priority: 14,
  },
  {
    key: 'var',
    name: 'Variance',
    syntax: 'VAR(column)',
    description: 'Population variance (ddof = 0) for the column.',
    example: '=VAR(colA)',
    category: 'statistical',
    matcher: createFunctionMatcher('VAR'),
    priority: 15,
  },
  {
    key: 'cov',
    name: 'Covariance',
    syntax: 'COV(colX, colY)',
    description: 'Calculates covariance between two numeric columns.',
    example: '=COV(colA,colB)',
    category: 'statistical',
    matcher: createFunctionMatcher('COV'),
    priority: 16,
  },
  {
    key: 'corr',
    name: 'Correlation',
    syntax: 'CORR(colX, colY)',
    description: 'Computes Pearson correlation between two columns.',
    example: '=CORR(colA,colB)',
    category: 'statistical',
    matcher: createFunctionMatcher('CORR'),
    priority: 17,
  },
  {
    key: 'cumsum',
    name: 'Cumulative Sum',
    syntax: 'CUMSUM(column)',
    description: 'Running total down the column based on current row order.',
    example: '=CUMSUM(Sales)',
    category: 'statistical',
    matcher: createFunctionMatcher('CUMSUM'),
    priority: 18,
  },
  {
    key: 'cumprod',
    name: 'Cumulative Product',
    syntax: 'CUMPROD(column)',
    description: 'Running product of the column values.',
    example: '=CUMPROD(GrowthFactor)',
    category: 'statistical',
    matcher: createFunctionMatcher('CUMPROD'),
    priority: 19,
  },
  {
    key: 'cummax',
    name: 'Cumulative Max',
    syntax: 'CUMMAX(column)',
    description: 'Tracks the maximum observed so far down the column.',
    example: '=CUMMAX(Margin)',
    category: 'statistical',
    matcher: createFunctionMatcher('CUMMAX'),
    priority: 20,
  },
  {
    key: 'cummin',
    name: 'Cumulative Min',
    syntax: 'CUMMIN(column)',
    description: 'Tracks the minimum observed so far down the column.',
    example: '=CUMMIN(Margin)',
    category: 'statistical',
    matcher: createFunctionMatcher('CUMMIN'),
    priority: 21,
  },
  {
    key: 'diff',
    name: 'Difference',
    syntax: 'DIFF(column, periods)',
    description: 'Subtracts the value from a previous row (default 1 period).',
    example: '=DIFF(Sales)',
    category: 'statistical',
    matcher: createFunctionMatcher('DIFF'),
    priority: 22,
  },
  {
    key: 'pct-change',
    name: 'Percent Change',
    syntax: 'PCT_CHANGE(column, periods)',
    description: 'Computes the percentage change vs. a prior row (default 1).',
    example: '=PCT_CHANGE(Sales)',
    category: 'statistical',
    matcher: createFunctionMatcher('PCT_CHANGE'),
    priority: 23,
  },
  {
    key: 'lag',
    name: 'Lag',
    syntax: 'LAG(column, periods)',
    description: 'Shifts the column down by N rows (default 1).',
    example: '=LAG(Sales, 1)',
    category: 'statistical',
    matcher: createFunctionMatcher('LAG'),
    priority: 24,
  },
  // Logical & binning
  {
    key: 'if-isnull',
    name: 'Null via IF',
    syntax: 'IF(ISNULL(value), fallback, value)',
    description: 'Replaces null/blank values inline using IF.',
    example: '=IF(ISNULL(colA), 0, colA)',
    category: 'nulls',
    matcher: createIfMatcher(({ uppercase }) => uppercase.includes('ISNULL(')),
    priority: 5,
  },
  {
    key: 'if-equal',
    name: 'Categorical to Numeric',
    syntax: 'IF(condition, true_value, false_value)',
    description: 'Encodes categories into numbers or text.',
    example: '=IF(colA == "M", 1, 0)',
    category: 'logical',
    matcher: createIfMatcher(({ uppercase }) => uppercase.includes('==')),
    priority: 12,
  },
  {
    key: 'if-nested',
    name: 'Nested Binning',
    syntax: 'IF(condition, value, IF(...))',
    description: 'Creates multi-tier bins with nested IF statements.',
    example: '=IF(colA > 90, "High", IF(colA > 70, "Medium", "Low"))',
    category: 'logical',
    matcher: createIfMatcher(({ uppercase }) => countToken(uppercase, 'IF(') > 1),
    priority: 15,
  },
  {
    key: 'if-relative',
    name: 'Relative Comparison',
    syntax: 'IF(condition, true_value, false_value)',
    description: 'Tags rows using two column values.',
    example: '=IF(colA > colB, "High", "Low")',
    category: 'logical',
    matcher: createIfMatcher(({ uppercase, trimmed }) => {
      const nestedCount = countToken(uppercase, 'IF(');
      return nestedCount === 1 && hasQuotes(trimmed) && !uppercase.includes('ISNULL') && !uppercase.includes('==');
    }),
    priority: 20,
  },
  {
    key: 'if-basic',
    name: 'Conditional Value',
    syntax: 'IF(condition, true_value, false_value)',
    description: 'Returns custom text or numbers when the condition is met, otherwise another value.',
    example: '=IF(colA > 10, "High", "Low")',
    category: 'logical',
    matcher: createIfMatcher(({ uppercase }) => {
      if (uppercase.includes('ISNULL') || countToken(uppercase, 'IF(') > 1) {
        return false;
      }
      return true;
    }),
    priority: 100,
  },
  {
    key: 'bin',
    name: 'Custom Binning',
    syntax: 'BIN(column, [bounds])',
    description: 'Buckets numeric values using explicit boundaries.',
    example: '=BIN(colA, [0, 50, 100])',
    category: 'logical',
    matcher: createFunctionMatcher('BIN'),
    priority: 25,
  },
  // Text
  {
    key: 'lower',
    name: 'Lowercase',
    syntax: 'LOWER(text)',
    description: 'Converts text to lowercase.',
    example: '=LOWER(colA)',
    category: 'text',
    matcher: createFunctionMatcher('LOWER'),
    priority: 10,
  },
  {
    key: 'upper',
    name: 'Uppercase',
    syntax: 'UPPER(text)',
    description: 'Converts text to uppercase.',
    example: '=UPPER(colA)',
    category: 'text',
    matcher: createFunctionMatcher('UPPER'),
    priority: 10,
  },
  {
    key: 'length',
    name: 'Length',
    syntax: 'LEN(text)',
    description: 'Returns the string length.',
    example: '=LEN(colA)',
    category: 'text',
    matcher: createFunctionMatcher('LEN'),
    priority: 10,
  },
  {
    key: 'substring',
    name: 'Substring',
    syntax: 'SUBSTR(text, start, end)',
    description: 'Extracts characters between the start and end index.',
    example: '=SUBSTR(colA, 0, 5)',
    category: 'text',
    matcher: createFunctionMatcher('SUBSTR'),
    priority: 10,
  },
  {
    key: 'str-replace',
    name: 'Replace Text',
    syntax: 'STR_REPLACE(text, "old", "new")',
    description: 'Replaces a substring within the text.',
    example: '=STR_REPLACE(colA, "old", "new")',
    category: 'text',
    matcher: createFunctionMatcher('STR_REPLACE'),
    priority: 10,
  },
  // Date
  {
    key: 'year',
    name: 'Year',
    syntax: 'YEAR(date)',
    description: 'Extracts the year from a date value.',
    example: '=YEAR(colDate)',
    category: 'date',
    matcher: createFunctionMatcher('YEAR'),
    priority: 10,
  },
  {
    key: 'month',
    name: 'Month',
    syntax: 'MONTH(date)',
    description: 'Extracts the month from a date value.',
    example: '=MONTH(colDate)',
    category: 'date',
    matcher: createFunctionMatcher('MONTH'),
    priority: 10,
  },
  {
    key: 'day',
    name: 'Day',
    syntax: 'DAY(date)',
    description: 'Extracts the day of the month from a date value.',
    example: '=DAY(colDate)',
    category: 'date',
    matcher: createFunctionMatcher('DAY'),
    priority: 10,
  },
  {
    key: 'weekday',
    name: 'Weekday',
    syntax: 'WEEKDAY(date)',
    description: 'Returns the textual weekday (Monday, Tuesday, ...).',
    example: '=WEEKDAY(colDate)',
    category: 'date',
    matcher: createFunctionMatcher('WEEKDAY'),
    priority: 10,
  },
  {
    key: 'date-diff',
    name: 'Date Difference',
    syntax: 'DATE_DIFF(end, start)',
    description: 'Calculates the day difference between two dates.',
    example: '=DATE_DIFF(colEnd, colStart)',
    category: 'date',
    matcher: createFunctionMatcher('DATE_DIFF'),
    priority: 10,
  },
  // Mapping & null handling
  {
    key: 'map',
    name: 'Map Categories',
    syntax: 'MAP(column, {"key": "value"})',
    description: 'Replaces values based on a mapping object.',
    example: '=MAP(colA, {"M": "Male", "F": "Female"})',
    category: 'mapping',
    matcher: createFunctionMatcher('MAP'),
    priority: 10,
  },
  {
    key: 'fillna',
    name: 'Fill Nulls',
    syntax: 'FILLNA(column, replacement)',
    description: 'Shortcut helper for replacing null values.',
    example: '=FILLNA(colA, 0)',
    category: 'nulls',
    matcher: createFunctionMatcher('FILLNA'),
    priority: 10,
  },
  {
    key: 'fillblank',
    name: 'Fill Blanks',
    syntax: 'FILLBLANK(column, "value")',
    description: 'Fill all blank cells (NULL, empty strings, whitespace) with a value.',
    example: '=FILLBLANK(Col1, "Unknown")',
    category: 'nulls',
    matcher: createFunctionMatcher('FILLBLANK'),
    priority: 5,
  },
];

const formulaMatchers = formulaLibrary.slice().sort((a, b) => a.priority - b.priority);

const matchFormula = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed.startsWith('=')) {
    return null;
  }
  for (const formula of formulaMatchers) {
    if (formula.matcher(trimmed)) {
      return formula;
    }
  }
  return null;
};

const categoryOrder: FormulaCategory[] = [
  'math',
  'statistical',
  'logical',
  'text',
  'date',
  'mapping',
  'nulls',
];

const categoryLabels: Record<FormulaCategory, { icon: JSX.Element; label: string }> = {
  math: { icon: <Calculator className="w-4 h-4" />, label: 'Mathematical' },
  statistical: { icon: <TrendingUp className="w-4 h-4" />, label: 'Statistical' },
  logical: { icon: <Zap className="w-4 h-4" />, label: 'Logical' },
  text: { icon: <BookOpen className="w-4 h-4" />, label: 'Text' },
  date: { icon: <Calendar className="w-4 h-4" />, label: 'Date & Time' },
  mapping: { icon: <Hash className="w-4 h-4" />, label: 'Mapping' },
  nulls: { icon: <X className="w-4 h-4" />, label: 'Null Handling' },
};

type TabValue = 'all' | FormulaCategory;

const tabLabels: Record<TabValue, string> = {
  all: 'All',
  math: 'Math',
  statistical: 'Stats',
  logical: 'Logic',
  text: 'Text',
  date: 'Date',
  mapping: 'Mapping',
  nulls: 'Nulls',
};

const FormularBar: React.FC<FormularBarProps> = ({
  data,
  selectedCell,
  selectedColumn,
  columnFormulas,
  formulaInput,
  isFormulaMode,
  isFormulaBarFrozen = false,
  formulaValidationError,
  isEditingFormula,
  onSelectedCellChange,
  onSelectedColumnChange,
  onFormulaInputChange,
  onFormulaModeChange,
  onFormulaSubmit,
  onValidationError,
  onEditingStateChange,
}) => {
  const barContainerRef = useRef<HTMLDivElement>(null);

  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFormula, setSelectedFormula] = useState<FormulaItem | null>(null);
  const [activeTab, setActiveTab] = useState<TabValue>('all');
  const [isUsageGuideOpen, setIsUsageGuideOpen] = useState(false);
  const formulaInputRef = useRef<HTMLInputElement>(null);
  const preservedColumnRef = useRef<string | null>(null);
  
  // Real-time validation state
  const [validationResult, setValidationResult] = useState<ValidationResult>({
    isValid: true,
    error: null,
    suggestions: [],
    errorType: null
  });
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [autoCompleteSuggestions, setAutoCompleteSuggestions] = useState<SuggestionItem[]>([]);
  const [showAutoComplete, setShowAutoComplete] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const isColumnSelected = Boolean(selectedColumn);
  
  // Custom undo/redo system
  const [formulaHistory, setFormulaHistory] = useState<string[]>(['']);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isUndoRedoOperation = useRef(false);

  // Add current formula to history when it changes (but not during undo/redo)
  useEffect(() => {
    if (!isUndoRedoOperation.current) {
      // If the formula input is different from current history position
      if (formulaInput !== formulaHistory[historyIndex]) {
        const newHistory = formulaHistory.slice(0, historyIndex + 1);
        newHistory.push(formulaInput);
        setFormulaHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
      }
    }
    isUndoRedoOperation.current = false;
  }, [formulaInput]);

  // Preserve history even when formula input is cleared externally
  // This allows users to undo back to previous formulas even after applying one
  useEffect(() => {
    if (formulaInput === '' && !isUndoRedoOperation.current) {
      // Add empty string to history if it's not already there
      if (formulaHistory[formulaHistory.length - 1] !== '') {
        const newHistory = [...formulaHistory, ''];
        setFormulaHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
      } else {
        // Just update the index to point to the last empty entry
        setHistoryIndex(formulaHistory.length - 1);
      }
    }
  }, [formulaInput]);

  // Undo function
  const handleUndo = () => {
    if (historyIndex > 0) {
      isUndoRedoOperation.current = true;
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      onFormulaInputChange(formulaHistory[newIndex]);
    }
  };

  // Redo function
  const handleRedo = () => {
    if (historyIndex < formulaHistory.length - 1) {
      isUndoRedoOperation.current = true;
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      onFormulaInputChange(formulaHistory[newIndex]);
    }
  };


  // Preserve selected column to prevent it from disappearing
  useEffect(() => {
    if (selectedColumn) {
      preservedColumnRef.current = selectedColumn;
    }
  }, [selectedColumn]);


  // Ensure input is focusable and working (simplified)
  useEffect(() => {
    if (isFormulaMode && formulaInputRef.current) {
      formulaInputRef.current.focus();
    }
  }, [isFormulaMode]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (barContainerRef.current && !barContainerRef.current.contains(event.target as Node)) {
        setShowAutoComplete(false);
        setAutoCompleteSuggestions([]);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Real-time validation effect
  useEffect(() => {
    const trimmed = formulaInput.trim();
    if (!trimmed) {
      setSelectedFormula(null);
      setActiveTab('all');
      setValidationResult({
        isValid: true,
        error: null,
        suggestions: [],
        errorType: null
      });
      setShowSuggestions(false);
      onValidationError?.(null);
      return;
    }
    
    // Run validation
    const availableColumns = data?.headers || [];
    const result = validateFormula(trimmed, availableColumns);
    setValidationResult(result);
    
    // Show suggestions for column errors
    if (!result.isValid && result.errorType === 'column' && result.suggestions.length > 0) {
      setShowSuggestions(true);
    } else {
      setShowSuggestions(false);
    }
    
    // Update parent component with validation error
    if (!result.isValid) {
      onValidationError?.(result.error);
    } else {
      onValidationError?.(null);
    }
    
    // Update selected formula
    const match = matchFormula(trimmed);
    if (match) {
      setSelectedFormula(match);
      setActiveTab(match.category);
    } else {
      setSelectedFormula(null);
    }
  }, [formulaInput, data?.headers, onValidationError]);

  const columnIndex = selectedCell && data ? data.headers.indexOf(selectedCell.col) : -1;
  const cellReference = selectedCell && columnIndex >= 0 ? getCellReference(selectedCell.row, columnIndex) : '';
  const cellValue =
    selectedCell && data && columnIndex >= 0 && data.rows[selectedCell.row]
      ? safeToString(data.rows[selectedCell.row][selectedCell.col])
      : '';

  const filteredFormulas = useMemo(() => {
    if (!searchQuery.trim()) {
      return formulaLibrary;
    }
    const search = searchQuery.trim().toLowerCase();
    return formulaLibrary.filter((formula) => {
      return (
        formula.name.toLowerCase().includes(search) ||
        formula.description.toLowerCase().includes(search) ||
        formula.syntax.toLowerCase().includes(search) ||
        formula.example.toLowerCase().includes(search)
      );
    });
  }, [searchQuery]);

  const handleCancel = () => {
    onSelectedCellChange(null);
    onSelectedColumnChange(null);
    onFormulaInputChange('');
    onFormulaModeChange(true);
    onEditingStateChange(false);
    setSelectedFormula(null);
    setIsLibraryOpen(false);
    setActiveTab('all');
    setIsUsageGuideOpen(false);
    onValidationError?.(null);
  };

  const handleFormulaSelect = (formula: FormulaItem) => {
    setSelectedFormula(formula);
    setActiveTab(formula.category);
    const expression = formatExampleExpression(formula);
    // Replace placeholder columns with Col1, Col2, etc. for Excel-like behavior
    const expressionWithColNumbers = replacePlaceholdersWithColNumbers(expression);
    
    // Update all states together to prevent conflicts
    onFormulaInputChange(expressionWithColNumbers);
    onFormulaModeChange(true);
    
    setIsLibraryOpen(false);
    onValidationError?.(null);
  };

  const handleLibraryOpenChange = (open: boolean) => {
    // Always activate formula mode when opening library
    if (open && !isFormulaMode) {
      onFormulaModeChange(true);
    }
    
    setIsLibraryOpen(open);
  };

  const handleColumnInsert = (column: string) => {
    const inputElement = formulaInputRef.current;
    
    // Check if there are ColX placeholders to replace (Excel-like behavior)
    if (formulaInput.includes('Col')) {
      const newValue = replaceNextColPlaceholder(formulaInput, column);
      onFormulaInputChange(newValue);
      onFormulaModeChange(true);
      
      // Don't change target column when inserting columns into formula
      // The target column should remain stable during formula editing
      
      
      // Set cursor position after the inserted column
      setTimeout(() => {
        if (inputElement) {
          const colMatch = formulaInput.match(/Col\d+/);
          if (colMatch) {
            const colIndex = formulaInput.indexOf(colMatch[0]);
            const newCursorPosition = colIndex + column.length;
            inputElement.setSelectionRange(newCursorPosition, newCursorPosition);
            inputElement.focus();
          }
        }
      }, 0);
      return;
    }
    
    // Fallback to original behavior if no ColX placeholders found
    if (!inputElement) {
      const trimmed = formulaInput.trim();
      let next = formulaInput;
      if (!trimmed) {
        next = `=${column}`;
      } else {
        const separator = /[=(]$/.test(trimmed) ? '' : ', ';
        next = `${formulaInput}${separator}${column}`;
      }
      onFormulaInputChange(next);
      onFormulaModeChange(true);
      
      
      // Don't automatically set the inserted column as target - let user explicitly select target
      return;
    }

    const cursorPosition = inputElement.selectionStart || 0;
    const currentValue = formulaInput;
    
    // Insert column at cursor position
    const newValue = currentValue.slice(0, cursorPosition) + column + currentValue.slice(cursorPosition);
    
    onFormulaInputChange(newValue);
    onFormulaModeChange(true);
    
    
    // Don't automatically set the inserted column as target - let user explicitly select target
    
    // Set cursor position after the inserted column
    setTimeout(() => {
      const newCursorPosition = cursorPosition + column.length;
      inputElement.setSelectionRange(newCursorPosition, newCursorPosition);
      inputElement.focus();
    }, 0);
  };

  // Auto-completion for formulas (functions + columns)
  interface SuggestionItem {
    type: 'function' | 'column';
    label: string;
    insertText: string;
    description?: string;
  }

  const getFunctionSuggestions = (query: string): SuggestionItem[] => {
    const search = query.trim().toLowerCase();
    return formulaLibrary
      .map(item => {
        const syntaxNameMatch = item.syntax.match(/^[A-Za-z_]+/);
        const canonicalName = (syntaxNameMatch ? syntaxNameMatch[0] : item.name).toUpperCase();
        return {
          type: 'function' as const,
          label: item.name,
          insertText: canonicalName,
          description: item.syntax,
          keywords: [
            item.name.toLowerCase(),
            canonicalName.toLowerCase(),
            item.syntax.toLowerCase(),
            item.example.toLowerCase(),
            item.description.toLowerCase(),
          ],
        };
      })
      .filter(item => {
        if (!search) return true;
        return item.keywords.some(keyword => keyword.startsWith(search));
      })
      .map(({ type, label, insertText, description }) => ({ type, label, insertText, description }));
  };

  const getColumnSuggestions = (query: string): SuggestionItem[] => {
    const columns = data?.headers || [];
    const search = query.trim().toLowerCase();
    return columns
      .filter(col => !search || col.toLowerCase().startsWith(search))
      .map(col => ({
        type: 'column' as const,
        label: col,
        insertText: col,
      }));
  };

  const getAutoCompleteSuggestions = (text: string, cursorPos: number): SuggestionItem[] => {
    const beforeCursor = text.slice(0, cursorPos);
    const wordMatch = beforeCursor.match(/([A-Za-z_][A-Za-z0-9_]*)$/);
    const partialWord = wordMatch ? wordMatch[1].toLowerCase() : '';
    const isAtStart = beforeCursor.trim() === partialWord;
    const afterOperator = /[\s(]$/.test(beforeCursor);

    const functions = getFunctionSuggestions(partialWord);
    const columns = getColumnSuggestions(partialWord);

    if (isAtStart || afterOperator) {
      return [...functions, ...columns].slice(0, 10);
    }
    return [...functions, ...columns].slice(0, 10);
  };

  const handleInputChange = (value: string) => {
    const inputElement = formulaInputRef.current;
    const cursorPosition = inputElement?.selectionStart || 0;
    setCursorPosition(cursorPosition);

    if (!selectedColumn) {
      return;
    }

    const leadingEquals = value.trimStart().startsWith('=');
    
    // Check if we're replacing a ColX placeholder (Excel-like behavior)
    if (formulaInput.includes('Col') && value.length > formulaInput.length) {
      const addedContent = value.slice(formulaInput.length);
      const { newExpression, newCursorPosition } = replaceNextColPlaceholderWithContent(formulaInput, addedContent, cursorPosition);
      
      onFormulaInputChange(newExpression);
      onFormulaModeChange(true);
      
      
      // Set cursor position after the replacement
      setTimeout(() => {
        if (inputElement) {
          inputElement.setSelectionRange(newCursorPosition, newCursorPosition);
          inputElement.focus();
        }
      }, 0);
      return;
    }

    if (!leadingEquals || !isEditingFormula) {
      setShowAutoComplete(false);
      setAutoCompleteSuggestions([]);
      setSelectedSuggestionIndex(0);
    } else {
      const suggestions = getAutoCompleteSuggestions(value, cursorPosition);
      if (suggestions.length > 0) {
        setAutoCompleteSuggestions(suggestions);
        setShowAutoComplete(true);
        setSelectedSuggestionIndex(0); // Reset selection
      } else {
        setShowAutoComplete(false);
        setAutoCompleteSuggestions([]);
        setSelectedSuggestionIndex(0);
      }
    }
    
    
    // Normal input handling
    onFormulaInputChange(value);
    onFormulaModeChange(true);
  };


  // Handle auto-completion selection
  const selectAutoCompleteSuggestion = (suggestion: SuggestionItem) => {
    const inputElement = formulaInputRef.current;
    if (!inputElement) return;

    const beforeCursor = formulaInput.slice(0, cursorPosition);
    const wordMatch = beforeCursor.match(/([A-Za-z_][A-Za-z0-9_]*)$/);
    const partialWord = wordMatch ? wordMatch[1] : '';
    const wordStart = wordMatch ? beforeCursor.lastIndexOf(partialWord) : cursorPosition;

    const insertText = suggestion.type === 'function'
      ? `${suggestion.insertText.toUpperCase()}()`
      : suggestion.insertText;

    const newValue =
      formulaInput.slice(0, wordStart) +
      insertText +
      formulaInput.slice(wordStart + partialWord.length);

    onFormulaInputChange(newValue);
    onEditingStateChange(true);
    setShowAutoComplete(false);
    setAutoCompleteSuggestions([]);

    setTimeout(() => {
      const newCursorPosition = suggestion.type === 'function'
        ? wordStart + insertText.length - 1
        : wordStart + insertText.length;
      inputElement.setSelectionRange(newCursorPosition, newCursorPosition);
      inputElement.focus();
    }, 0);
  };

  const handleTabCompletion = () => {
    const trimmed = formulaInput.trim();
    if (!trimmed) {
      return false;
    }

    if (!/^=?[A-Za-z_]+$/.test(trimmed) && !/^=?[A-Za-z_]+\($/.test(trimmed)) {
      return false;
    }

    const normalized = trimmed.startsWith('=') ? trimmed.toUpperCase() : `=${trimmed.toUpperCase()}`;
    const functionMatch = normalized.slice(1).match(/^[A-Z_]+/);
    if (!functionMatch) {
      return false;
    }

    const typedPrefix = `=${functionMatch[0]}`;
    if (typedPrefix.length <= 1) {
      return false;
    }

    const completion = formulaMatchers.find((formula) => {
      if (!isFunctionStyleExample(formula)) {
        return false;
      }
      const exampleExpression = formatExampleExpression(formula).toUpperCase();
      return exampleExpression.startsWith(typedPrefix);
    });

    if (!completion) {
      return false;
    }

    const expression = formatExampleExpression(completion);
    // Replace placeholder columns with Col1, Col2, etc. for Excel-like behavior
    const expressionWithColNumbers = replacePlaceholdersWithColNumbers(expression);
    if (expressionWithColNumbers === formulaInput) {
      return false;
    }

    onFormulaInputChange(expressionWithColNumbers);
    onFormulaModeChange(true);
    onValidationError?.(null);
    return true;
  };

  const handleSubmit = () => {
    console.log('[FormularBar] Submit attempt:', { 
      selectedColumn, 
      formulaInput, 
      hasData: !!data?.headers,
      validationResult
    });

    if (!selectedColumn) {
      console.log('[FormularBar] No selected column');
      onValidationError?.('Please select a target column first');
      return;
    }

    if (!formulaInput.trim()) {
      onValidationError?.('Please enter a formula');
      return;
    }

    // Check validation result
    if (!validationResult.isValid) {
      console.log('[FormularBar] Validation failed:', validationResult.error);
      onValidationError?.(validationResult.error);
      return;
    }

    console.log('[FormularBar] Submitting formula');
    onValidationError?.(null);
    onFormulaSubmit();
    onEditingStateChange(false);
  };

  const renderFormulaCard = (formula: FormulaItem) => {
    const active = selectedFormula?.key === formula.key;
    return (
      <div
        key={formula.key}
        data-formula-card={formula.key}
        className={`p-3 rounded-lg border transition-colors cursor-pointer ${
          active ? 'border-primary bg-primary/5' : 'hover:bg-accent'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          console.log('[FormularBar] Formula card clicked:', formula.name);
          handleFormulaSelect(formula);
        }}
        style={{ 
          position: 'relative',
          zIndex: 1,
          pointerEvents: 'auto'
        }}
      >
        <div className='flex items-center space-x-2 mb-1'>
          {categoryLabels[formula.category].icon}
          <span className='font-semibold text-sm'>{formula.name}</span>
          <Badge variant='outline' className='text-xs ml-auto'>
            {categoryLabels[formula.category].label}
          </Badge>
        </div>
        <div className='text-xs text-muted-foreground mb-1'>{formula.description}</div>
        <div className='text-xs font-mono bg-muted px-2 py-1 rounded'>{formula.syntax}</div>
      </div>
    );
  };

  const renderFormulaList = (items: FormulaItem[]) => {
    if (!items.length) {
      return <div className='p-3 text-xs text-muted-foreground'>No formulas found.</div>;
    }
    return <div className='space-y-2'>{items.map(renderFormulaCard)}</div>;
  };

  return (
    <div ref={barContainerRef} className='flex-shrink-0 border-b border-border bg-gradient-to-r from-card via-card/95 to-card shadow-sm w-full relative z-[1400]'>
      <div className='flex items-center h-12 px-4 space-x-3 w-full min-w-0 relative overflow-visible'>
        <div className='flex items-center space-x-2 flex-shrink-0 z-30'>
          <div 
            className='flex items-center space-x-2 bg-primary/10 rounded-lg px-3 py-1.5 border border-primary/20 shadow-sm cursor-pointer hover:bg-primary/15 transition-colors'
            onClick={(e) => {
              e.stopPropagation();
              console.log('[FormularBar] Target column clicked, state:', { selectedColumn, isFormulaMode });
              // Always activate formula bar when target column is clicked
              if (selectedColumn) {
                onFormulaModeChange(true);
              }
            }}
          >
            <Hash className='w-4 h-4 text-primary' />
            <div className='flex flex-col leading-tight'>
              <span className='text-[10px] uppercase tracking-wide text-primary/70'>Target column</span>
              <span className='text-xs font-semibold text-primary max-w-[160px] truncate'>
                {selectedColumn ?? (selectedCell ? selectedCell.col : 'Select a column')}
              </span>
            </div>
          </div>
        </div>

        <div className='flex items-center flex-1 space-x-2 min-w-0'>
          <Popover open={isUsageGuideOpen} onOpenChange={setIsUsageGuideOpen}>
            <PopoverTrigger asChild>
              <Button
                variant='outline'
                size='sm'
                className={`h-8 w-8 p-0 shadow-sm z-20 ${
                  isUsageGuideOpen ? 'bg-primary/10 text-primary border-primary/40' : ''
                }`}
                title={isUsageGuideOpen ? 'Hide usage guide' : 'Show usage guide'}
                aria-pressed={isUsageGuideOpen}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsUsageGuideOpen(!isUsageGuideOpen);
                }}
              >
                <Calculator className='w-4 h-4' />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className='w-[520px] p-0 shadow-lg border border-border bg-popover overflow-hidden z-[9999]'
              align='start'
              side='bottom'
              sideOffset={8}
              style={{ 
                zIndex: 9999,
                position: 'absolute',
                maxHeight: '80vh',
                overflow: 'auto'
              }}
              avoidCollisions={true}
              collisionPadding={10}
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              {selectedFormula ? (
                <div className='max-h-[70vh] overflow-y-auto'>
                  <div className='p-4 border-b space-y-2'>
                    <div className='flex items-center space-x-2'>
                      <div className='flex items-center justify-center w-8 h-8 rounded-md bg-primary/10 text-primary'>
                        {categoryLabels[selectedFormula.category].icon}
                      </div>
                      <div>
                        <div className='flex items-center space-x-2'>
                          <span className='font-semibold text-sm'>{selectedFormula.name}</span>
                          <Badge variant='secondary' className='text-xs'>
                            {categoryLabels[selectedFormula.category].label}
                          </Badge>
                        </div>
                        <p className='text-xs text-muted-foreground'>{selectedFormula.description}</p>
                      </div>
                    </div>
                    <div className='text-xs font-mono bg-muted px-2 py-1 rounded'>Syntax: {selectedFormula.syntax}</div>
                    <div className='text-xs font-mono bg-muted px-2 py-1 rounded'>Example: {selectedFormula.example}</div>
                  </div>
                  <div className='p-4 space-y-4'>
                    <div>
                      <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>Insert column references</p>
                      <ScrollArea className='mt-2 h-20'>
                        <div className='flex flex-wrap gap-2 pr-2'>
                          {(data?.headers || []).map((header) => (
                            <Badge
                              key={`insert-${header}`}
                              variant='outline'
                              className='cursor-pointer hover:bg-primary/20'
                              onClick={() => handleColumnInsert(header)}
                            >
                              {header}
                            </Badge>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                    {selectedCell && (
                      <div className='border rounded-md bg-muted/50 p-3'>
                        <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>Selected cell</p>
                        <div className='mt-1 text-sm font-mono'>
                          {cellReference || selectedCell.col}
                          {cellValue !== '' && <span className='ml-2 text-xs text-muted-foreground'>→ {cellValue}</span>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className='p-4 text-sm text-muted-foreground'>
                  Please insert a legitimate formula to view guide - check library for more details.
                </div>
              )}
            </PopoverContent>
          </Popover>

          <div className='flex flex-col flex-1 min-w-0 relative' style={{ position: 'relative', zIndex: 1 }}>
            <div className='relative w-full' style={{ position: 'relative', zIndex: 1 }}>
              <Popover open={isLibraryOpen} onOpenChange={handleLibraryOpenChange}>
                <PopoverTrigger asChild>
                  <Button
                    variant='ghost'
                    size='sm'
                    className='absolute left-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0 hover:bg-primary/10 z-[9999]'
                    style={{ 
                      zIndex: 9999,
                      position: 'absolute',
                      pointerEvents: 'auto'
                    }}
                    title='Open formula library'
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      console.log('[FormularBar] Sigma button clicked, current state:', { isLibraryOpen, isFormulaMode, selectedColumn });
                      handleLibraryOpenChange(!isLibraryOpen);
                    }}
                  >
                    <Sigma className='w-4 h-4 text-primary' />
                  </Button>
                </PopoverTrigger>
                <PopoverContent 
                  className='w-96 p-0 shadow-lg z-[9999]' 
                  align='start' 
                  side='bottom' 
                  sideOffset={4}
                  style={{ 
                    zIndex: 9999,
                    position: 'absolute',
                    maxHeight: '80vh',
                    overflow: 'auto',
                    pointerEvents: 'auto'
                  }}
                  avoidCollisions={true}
                  collisionPadding={10}
                  onOpenAutoFocus={(e) => e.preventDefault()}
                  onInteractOutside={(e) => {
                    // Allow interaction with formula cards
                    if (e.target && (e.target as Element).closest('[data-formula-card]')) {
                      e.preventDefault();
                    }
                  }}
                >
                  <div className='border-b p-3'>
                    <div className='flex items-center space-x-2'>
                      <Search className='w-4 h-4 text-muted-foreground' />
                      <Input
                        placeholder='Search formulas...'
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className='h-8 border-0 focus-visible:ring-0'
                      />
                    </div>
                  </div>
                  <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabValue)} className='w-full'>
                    <TabsList className='grid w-full grid-cols-5 p-1 m-1'>
                      <TabsTrigger value='all' className='text-xs'>All</TabsTrigger>
                      {categoryOrder.map((category) => (
                        <TabsTrigger key={category} value={category} className='text-xs'>
                          {tabLabels[category]}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    <ScrollArea className='h-80'>
                      <TabsContent value='all' className='p-2'>
                        {renderFormulaList(filteredFormulas)}
                      </TabsContent>
                      {categoryOrder.map((category) => (
                        <TabsContent key={category} value={category} className='p-2'>
                          {renderFormulaList(filteredFormulas.filter((f) => f.category === category))}
                        </TabsContent>
                      ))}
                    </ScrollArea>
                  </Tabs>
                </PopoverContent>
              </Popover>
              <div className="relative w-full">
                <Input
                  ref={formulaInputRef}
                  value={formulaInput}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onClick={(e) => {
                    if (!isColumnSelected) {
                      e.preventDefault();
                      setShowAutoComplete(false);
                      setAutoCompleteSuggestions([]);
                      return;
                    }
                    if (!isEditingFormula) {
                      e.preventDefault();
                      onEditingStateChange(true);
                      setTimeout(() => {
                        onFormulaModeChange(true);
                        formulaInputRef.current?.focus();
                      }, 0);
                      return;
                    }
                    e.stopPropagation();
                    onFormulaModeChange(true);
                    formulaInputRef.current?.focus();
                  }}
                  readOnly={!isColumnSelected || !isEditingFormula}
                  placeholder={
                    isColumnSelected
                      ? '=SUM(Col1,Col2), =IF(Col1 > 10, Col2, Col3), =DATE_DIFF(Col1, Col2)'
                      : 'Select a column to start writing formulas'
                  }
                  className={`h-8 shadow-sm pl-10 font-mono transition-all duration-200 w-full min-w-0 focus:ring-2 ${
                    !validationResult.isValid
                      ? validationResult.errorType === 'column'
                        ? 'border-yellow-500 bg-yellow-50 focus:ring-yellow-200 focus:border-yellow-500'
                        : 'border-red-500 bg-red-50 focus:ring-red-200 focus:border-red-500'
                      : formulaValidationError 
                        ? 'border-red-500 bg-red-50 focus:ring-red-200 focus:border-red-500' 
                        : 'border-primary/50 bg-primary/5 focus:ring-primary/20 focus:border-primary'
                  } ${!isColumnSelected ? 'bg-slate-100 text-slate-400 cursor-not-allowed placeholder:text-slate-400' : ''} ${isColumnSelected && !isEditingFormula ? 'cursor-pointer' : ''}`}
                onKeyDown={(e) => {
                  if (!isColumnSelected || !isEditingFormula) {
                    e.preventDefault();
                    return;
                  }
                  // Handle auto-completion navigation
                  if (showAutoComplete && autoCompleteSuggestions.length > 0) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setSelectedSuggestionIndex(prev => 
                        prev < autoCompleteSuggestions.length - 1 ? prev + 1 : 0
                      );
                      return;
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setSelectedSuggestionIndex(prev => 
                        prev > 0 ? prev - 1 : autoCompleteSuggestions.length - 1
                      );
                      return;
                    }
                    if (e.key === 'Enter' || e.key === 'Tab') {
                      e.preventDefault();
                      const selected = autoCompleteSuggestions[selectedSuggestionIndex];
                      if (selected) {
                        selectAutoCompleteSuggestion(selected);
                      }
                      return;
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setShowAutoComplete(false);
                      setAutoCompleteSuggestions([]);
                      return;
                    }
                  }
                  
                  // Handle Ctrl+Z (undo) with custom implementation
                  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                    e.preventDefault();
                    handleUndo();
                    return;
                  }
                  
                  // Handle Ctrl+Y or Ctrl+Shift+Z (redo) with custom implementation
                  if (((e.ctrlKey || e.metaKey) && e.key === 'y') || 
                      ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey)) {
                    e.preventDefault();
                    handleRedo();
                    return;
                  }
                  
                  // Handle Ctrl+A (select all) - let browser handle this
                  if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                    return;
                  }
                  
                  // Handle Ctrl+C, Ctrl+V, Ctrl+X - let browser handle these
                  if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'v' || e.key === 'x')) {
                    return;
                  }
                  
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit();
                  }
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    handleCancel();
                  }
                  if (e.key === 'Tab' && !e.shiftKey) {
                    const completed = handleTabCompletion();
                    if (completed) {
                      e.preventDefault();
                    }
                  }
                }}
                />
              </div>
              {/* Enhanced error message and suggestions display */}
              {(formulaValidationError || !validationResult.isValid) && (
                <div className="absolute top-full left-0 right-0 mt-1 z-[1300]">
                  <div className={`px-3 py-2 rounded-lg border shadow-lg ${
                    validationResult.errorType === 'column' 
                      ? 'bg-yellow-50 border-yellow-200 text-yellow-800'
                      : 'bg-red-50 border-red-200 text-red-700'
                  }`}>
                    <div className="text-xs font-medium mb-1">
                      {validationResult.error || formulaValidationError}
                    </div>
                    {validationResult.suggestions.length > 0 && (
                      <div className="text-xs space-y-1">
                        {validationResult.suggestions.map((suggestion, index) => (
                          <div key={index} className="flex items-center space-x-1">
                            <span className="text-yellow-600">💡</span>
                            <span>{suggestion}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Auto-completion dropdown */}
              {showAutoComplete && autoCompleteSuggestions.length > 0 && (
                isEditingFormula && (
                <div className="absolute top-full left-0 right-0 mt-1 z-[1300]">
                  <div className="bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {autoCompleteSuggestions.map((item, index) => (
                      <div
                        key={`${item.type}-${item.insertText}-${index}`}
                        className={`px-3 py-2 text-sm cursor-pointer flex items-center justify-between hover:bg-gray-100 ${
                          index === selectedSuggestionIndex ? 'bg-blue-100 text-blue-800' : 'text-gray-700'
                        }`}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectAutoCompleteSuggestion(item)}
                      >
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold ${item.type === 'function' ? 'text-purple-600' : 'text-slate-500'}`}>
                            {item.type === 'function' ? 'fx' : '#'}
                          </span>
                          <span className="font-mono">
                            {item.type === 'function' ? item.insertText.toUpperCase() : item.insertText}
                          </span>
                        </div>
                        {item.description && item.type === 'function' && (
                          <span className="text-xs text-slate-500 ml-4 truncate max-w-[200px]">
                            {item.description}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                )
              )}
            </div>
          </div>
        </div>


        <div className='flex items-center space-x-1 flex-shrink-0 z-30'>
          <Button
            variant='outline'
            size='sm'
            className='h-8 px-3 shadow-sm'
            onClick={handleSubmit}
            disabled={!selectedColumn || !validationResult.isValid || !formulaInput.trim()}
            title={!selectedColumn ? 'Select a target column first' : 
                   !validationResult.isValid ? validationResult.error || 'Fix formula errors' : 
                   !formulaInput.trim() ? 'Enter a formula' : 'Apply formula'}
          >
            <Check className='w-4 h-4 mr-1' />
            Apply
          </Button>
          <Button
            variant='outline'
            size='sm'
            className='h-8 px-3 shadow-sm'
            onClick={handleCancel}
          >
            <X className='w-4 h-4' />
          </Button>
        </div>
      </div>

    </div>
  );
};

export default FormularBar;