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

interface FunctionArgument {
  name: string;        // "number1", "colA", "digits"
  optional: boolean;   // true if [number2]
  isVariadic: boolean; // true if ...
}

interface FormulaItem {
  key: string;
  name: string;
  syntax: string;
  description: string;
  example: string;
  category: FormulaCategory;
  matcher: (value: string) => boolean;
  priority: number;
  arguments?: FunctionArgument[]; // Parsed arguments for signature helper
}

const normalizeFormula = (value: string) => {
  const trimmed = value.trim();
  return {
    trimmed,
    uppercase: trimmed.toUpperCase(),
    condensed: trimmed.replace(/\s+/g, ''),
  };
};

// Normalize function names to uppercase (e.g., =sum( -> =SUM(), =Sum -> =SUM)
// Only normalizes words that are followed by '(' (possibly with whitespace)
// Preserves column names, strings, numbers, and other identifiers
const normalizeFunctionNames = (formula: string): string => {
  if (!formula || !formula.startsWith('=')) {
    return formula;
  }

  const result: string[] = [];
  let i = 1; // Start after '='
  const length = formula.length;
  let inString = false;
  let stringChar = '';

  while (i < length) {
    const char = formula[i];
    const prevChar = i > 0 ? formula[i - 1] : '';

    // Handle string literals (preserve as-is)
    if ((char === '"' || char === "'") && prevChar !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
        result.push(char);
        i++;
        continue;
      } else if (char === stringChar) {
        inString = false;
        stringChar = '';
        result.push(char);
        i++;
        continue;
      }
    }

    if (inString) {
      result.push(char);
      i++;
      continue;
    }

    // Detect potential function names (alphanumeric + underscore)
    if (/[A-Za-z_]/.test(char)) {
      const start = i;
      // Collect the identifier
      while (i < length && /[A-Za-z0-9_]/.test(formula[i])) {
        i++;
      }
      const identifier = formula.slice(start, i);
      
      // Check if this is followed by '(' (possibly with whitespace)
      let j = i;
      while (j < length && /\s/.test(formula[j])) {
        j++;
      }
      
      if (j < length && formula[j] === '(') {
        // This is a function name - normalize to uppercase
        result.push(identifier.toUpperCase());
        // Add any whitespace between function name and '('
        if (j > i) {
          result.push(formula.slice(i, j));
        }
        // Continue from j (the '(' will be added in next iteration)
        i = j;
        continue;
      } else {
        // Not a function - preserve original case (could be a column name)
        result.push(identifier);
        continue;
      }
    }

    // All other characters (operators, parentheses, numbers, etc.) - preserve as-is
    result.push(char);
    i++;
  }

  return '=' + result.join('');
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

const stripQuotedStrings = (expression: string): string =>
  expression.replace(/"([^"\\]|\\.)*"/g, '').replace(/'([^'\\]|\\.)*'/g, '');

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const maskKnownColumns = (
  expression: string,
  columns: string[],
): { sanitizedExpression: string; matchedColumns: Set<string> } => {
  if (!columns.length) {
    return { sanitizedExpression: stripQuotedStrings(expression), matchedColumns: new Set() };
  }

  const matchedColumns = new Set<string>();
  let sanitizedExpression = stripQuotedStrings(expression);
  const sortedColumns = [...columns]
    .filter(col => Boolean(col))
    .sort((a, b) => b.length - a.length);

  sortedColumns.forEach(column => {
    const escaped = escapeRegExp(column);
    const columnRegex = new RegExp(`(^|[^A-Za-z0-9_])(${escaped})(?=[^A-Za-z0-9_]|$)`, 'g');
    sanitizedExpression = sanitizedExpression.replace(columnRegex, (_match, prefix) => {
      matchedColumns.add(column);
      return `${prefix} `;
    });
  });

  return { sanitizedExpression, matchedColumns };
};

// Enhanced validation system for Excel-like behavior
interface ValidationResult {
  isValid: boolean;
  error: string | null;
  suggestions: string[];
  errorType: 'syntax' | 'column' | 'operation' | 'parenthesis' | 'backend' | null;
  severity?: 'warning' | 'error'; // 'warning' = yellow (non-blocking), 'error' = red (blocking)
  errorDetails?: {
    invalidColumns?: string[];
    availableColumns?: string[];
    functionName?: string;
    position?: number;
  };
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

// Parse function signature to extract structured arguments
const parseFunctionSignature = (syntax: string): FunctionArgument[] => {
  // Extract function name and arguments part
  // Example: "SUM(colA, colB, ...)" -> "colA, colB, ..."
  const match = syntax.match(/^[A-Z_]+\s*\((.*)\)$/i);
  if (!match) return [];
  
  const argsString = match[1].trim();
  if (!argsString) return [];
  
  // Handle variadic functions with ...
  if (argsString === '...') {
    return [{ name: '...', optional: false, isVariadic: true }];
  }
  
  // Split by comma, but be careful with nested parentheses and brackets
  const args: FunctionArgument[] = [];
  let currentArg = '';
  let depth = 0;
  let inBrackets = false;
  
  for (let i = 0; i < argsString.length; i++) {
    const char = argsString[i];
    
    if (char === '[') {
      inBrackets = true;
      currentArg += char;
    } else if (char === ']') {
      inBrackets = false;
      currentArg += char;
    } else if (char === '(') {
      depth++;
      currentArg += char;
    } else if (char === ')') {
      depth--;
      currentArg += char;
    } else if (char === ',' && depth === 0 && !inBrackets) {
      // Found an argument separator
      const trimmed = currentArg.trim();
      if (trimmed) {
        const isOptional = trimmed.startsWith('[') && trimmed.endsWith(']');
        const argName = isOptional ? trimmed.slice(1, -1).trim() : trimmed;
        const isVariadic = argName === '...' || trimmed.endsWith('...');
        
        args.push({
          name: isVariadic ? '...' : argName,
          optional: isOptional,
          isVariadic: isVariadic
        });
      }
      currentArg = '';
    } else {
      currentArg += char;
    }
  }
  
  // Add the last argument
  if (currentArg.trim()) {
    const trimmed = currentArg.trim();
    const isOptional = trimmed.startsWith('[') && trimmed.endsWith(']');
    const argName = isOptional ? trimmed.slice(1, -1).trim() : trimmed;
    const isVariadic = argName === '...' || trimmed.endsWith('...');
    
    args.push({
      name: isVariadic ? '...' : argName,
      optional: isOptional,
      isVariadic: isVariadic
    });
  }
  
  return args;
};

// Detect active function at cursor position
const detectActiveFunction = (
  formula: string,
  cursorPos: number
): { functionName: string; startPos: number; openParenPos: number } | null => {
  if (cursorPos < 1 || !formula.startsWith('=')) return null;
  
  const beforeCursor = formula.slice(0, cursorPos);
  const afterCursor = formula.slice(cursorPos);
  
  // Walk backwards from cursor to find the innermost function
  let parenDepth = 0;
  let lastOpenParen = -1;
  let functionStart = -1;
  let functionName = '';
  
  // Find the innermost opening parenthesis before cursor
  for (let i = cursorPos - 1; i >= 0; i--) {
    const char = formula[i];
    
    if (char === ')') {
      parenDepth++;
    } else if (char === '(') {
      parenDepth--;
      if (parenDepth < 0) {
        // Found an opening parenthesis
        lastOpenParen = i;
        
        // Now find the function name before this parenthesis
        let j = i - 1;
        // Skip whitespace
        while (j >= 0 && /\s/.test(formula[j])) j--;
        
        // Find the end of function name
        let nameEnd = j;
        // Find the start of function name (alphanumeric or underscore)
        while (j >= 0 && /[A-Za-z0-9_]/.test(formula[j])) j--;
        
        if (j < nameEnd) {
          functionStart = j + 1;
          functionName = formula.slice(functionStart, nameEnd + 1).toUpperCase();
          
          // Verify it starts with = or is after a comma/parenthesis
          const beforeFunc = formula.slice(0, functionStart);
          if (beforeFunc.endsWith('=') || /[,\s\(]/.test(beforeFunc[beforeFunc.length - 1])) {
            // Check if cursor is still inside this function's parentheses
            // Count parentheses from openParen to cursor
            // Allow cursor to be right after opening parenthesis (depth = 1)
            let depth = 1;
            for (let k = lastOpenParen + 1; k < cursorPos; k++) {
              if (formula[k] === '(') depth++;
              if (formula[k] === ')') depth--;
              if (depth === 0) {
                // Cursor is outside this function
                return null;
              }
            }
            
            // Cursor is inside this function (including right after opening paren)
            // depth should be >= 1 (1 means cursor is right after opening paren, which is valid)
            return {
              functionName,
              startPos: functionStart,
              openParenPos: lastOpenParen + 1 // Position after opening parenthesis
            };
          }
        }
        break;
      }
    }
  }
  
  return null;
};

// Get current argument index (0-based)
const getCurrentArgumentIndex = (
  formula: string,
  cursorPos: number,
  openParenPos: number
): number => {
  const betweenParens = formula.slice(openParenPos, cursorPos);
  
  let argIndex = 0;
  let depth = 0;
  let inString = false;
  let stringChar = '';
  
  for (let i = 0; i < betweenParens.length; i++) {
    const char = betweenParens[i];
    
    // Handle string literals
    if ((char === '"' || char === "'") && (i === 0 || betweenParens[i - 1] !== '\\')) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = '';
      }
      continue;
    }
    
    if (inString) continue;
    
    // Track nested parentheses
    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
    } else if (char === ',' && depth === 0) {
      // Found an argument separator at top level
      argIndex++;
    }
  }
  
  return argIndex;
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
      errorType: 'syntax',
      severity: 'error' // Error: required syntax
    };
  }
  
  // Check for balanced parentheses - REMOVED: No longer showing warning for unbalanced parentheses
  // Users can type freely and the backend will handle validation
  
  // Check for basic syntax errors - but allow == for comparison operators
  // This regex looks for 3 or more consecutive = signs, or == at the beginning of the formula
  if (trimmed.match(/[=]{3,}/) || trimmed.match(/^==/)) {
    return {
      isValid: false,
      error: 'Multiple = signs not allowed',
      suggestions: ['Remove extra = signs'],
      errorType: 'syntax',
      severity: 'error' // Error: invalid syntax
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
      errorType: 'syntax',
      severity: 'error' // Error: invalid syntax
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
  
  const { sanitizedExpression, matchedColumns } = maskKnownColumns(expression, availableColumns);
  
  // Extract only actual column references (not function names, numbers, or quoted strings)
  const columnPattern = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
  const matches = sanitizedExpression.match(columnPattern) || [];
  
  // Filter out function names, numbers, and other non-column references
  const functionNames = ['SUM', 'AVG', 'MAX', 'MIN', 'DIV', 'PROD', 'ABS', 'ROUND', 'FLOOR', 'CEIL', 'EXP', 'LOG', 'SQRT', 'MEAN', 'CORR', 'COV', 'ZSCORE', 'NORM', 'COUNT', 'MEDIAN', 'PERCENTILE', 'STD', 'VAR', 'CUMSUM', 'CUMPROD', 'CUMMAX', 'CUMMIN', 'DIFF', 'PCT_CHANGE', 'LAG', 'ROLLINGSUM', 'IF', 'ISNULL', 'LOWER', 'UPPER', 'LEN', 'SUBSTR', 'STR_REPLACE', 'YEAR', 'MONTH', 'DAY', 'WEEKDAY', 'QUARTER', 'DATE_DIFF', 'MAP', 'FILLNA', 'FILLBLANK', 'BIN', 'AND', 'OR', 'NOT', 'TRUE', 'FALSE'];
  
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
  const invalidColumns = columnReferences.filter(col => !availableColumns.includes(col) && !matchedColumns.has(col));
  if (invalidColumns.length > 0) {
    const suggestions: string[] = [];
    invalidColumns.forEach(invalidCol => {
      const similar = findSimilarColumns(invalidCol, availableColumns);
      if (similar.length > 0) {
        suggestions.push(`Did you mean: ${similar.join(', ')}?`);
      } else {
        suggestions.push(`Column "${invalidCol}" not found. Available columns: ${availableColumns.slice(0, 5).join(', ')}${availableColumns.length > 5 ? '...' : ''}`);
      }
    });
    
    return {
      isValid: false,
      error: invalidColumns.length === 1 
        ? `Column "${invalidColumns[0]}" not found`
        : `Invalid columns: ${invalidColumns.join(', ')}`,
      suggestions,
      errorType: 'column',
      severity: 'error', // Error: invalid column reference (but only show on Apply, not while typing)
      errorDetails: {
        invalidColumns,
        availableColumns
      }
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
      errorType: 'operation',
      severity: 'warning' // Warning: user might still be typing
    };
  }

  // Check for operators at the beginning or end
  if (trimmed.match(/^[+\-*/]/) || trimmed.match(/[+\-*/]$/)) {
    return {
      isValid: false,
      error: 'Operator at beginning or end of formula',
      suggestions: ['Add operands before/after operators'],
      errorType: 'operation',
      severity: 'warning' // Warning: user might still be typing
    };
  }

  // Check for division by zero patterns
  if (trimmed.match(/\/\s*0/)) {
    return {
      isValid: false,
      error: 'Division by zero',
      suggestions: ['Use a non-zero divisor'],
      errorType: 'operation',
      severity: 'error' // Error: critical logic error
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

  // Check for balanced parentheses - Only on Apply (not while typing)
  const trimmed = expression.trim();
  const openParens = (trimmed.match(/\(/g) || []).length;
  const closeParens = (trimmed.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    const missing = openParens > closeParens ? 'closing' : 'opening';
    return {
      isValid: false,
      error: `Missing ${missing} parenthesis`,
      suggestions: [openParens > closeParens ? 'Add ) to close the function' : 'Add ( to open the function'],
      errorType: 'parenthesis',
      severity: 'error' // Error: blocking on Apply
    };
  }

  const disallowedRowFunctions = ['IF', 'AND', 'OR', 'NOT'];
  const disallowedPattern = new RegExp(`\\b(${disallowedRowFunctions.join('|')})\\s*\\(`, 'i');
  if (disallowedPattern.test(expression)) {
    return {
      isValid: false,
      error: 'Row-level functions like IF/AND/OR are not supported yet. Please use column-level formulas.',
      suggestions: [],
      errorType: 'operation',
      severity: 'error' // Error: not supported
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

// Helper to create formula with pre-parsed arguments
const createFormula = (
  key: string,
  name: string,
  syntax: string,
  description: string,
  example: string,
  category: FormulaCategory,
  matcher: (value: string) => boolean,
  priority: number
): FormulaItem => {
  const args = parseFunctionSignature(syntax);
  return {
    key,
    name,
    syntax,
    description,
    example,
    category,
    matcher,
    priority,
    arguments: args
  };
};

const formulaLibrary: FormulaItem[] = [
  // Math & aggregations
  createFormula(
    'sum',
    'Sum',
    'SUM(colA, colB, ...)',
    'Adds the supplied columns row-wise.',
    '=SUM(colA,colB,...)',
    'math',
    createFunctionMatcher('SUM'),
    10
  ),
  createFormula(
    'product',
    'Product',
    'PROD(colA, colB, ...)',
    'Multiplies values across the row.',
    '=PROD(colA,colB,...)',
    'math',
    createFunctionMatcher('PROD'),
    10
  ),
  createFormula(
    'division',
    'Division',
    'DIV(colA, colB, ...)',
    'Sequentially divides the provided values.',
    '=DIV(colA,colB,...)',
    'math',
    createFunctionMatcher('DIV'),
    10
  ),
  createFormula(
    'absolute',
    'Absolute Value',
    'ABS(colA)',
    'Returns the absolute value for a column.',
    '=ABS(colA)',
    'math',
    createFunctionMatcher('ABS'),
    10
  ),
  createFormula(
    'round',
    'Round',
    'ROUND(colA, digits)',
    'Rounds a number using the specified precision.',
    '=ROUND(colA, 2)',
    'math',
    createFunctionMatcher('ROUND'),
    10
  ),
  createFormula(
    'floor',
    'Floor',
    'FLOOR(colA)',
    'Rounds a number down to the nearest integer.',
    '=FLOOR(colA)',
    'math',
    createFunctionMatcher('FLOOR'),
    10
  ),
  createFormula(
    'ceiling',
    'Ceiling',
    'CEIL(colA)',
    'Rounds a number up to the nearest integer.',
    '=CEIL(colA)',
    'math',
    createFunctionMatcher('CEIL'),
    10
  ),
  createFormula(
    'exponential',
    'Exponential',
    'EXP(colA)',
    "Returns Euler's number raised to the value.",
    '=EXP(colA)',
    'math',
    createFunctionMatcher('EXP'),
    10
  ),
  createFormula(
    'natural-log',
    'Natural Logarithm',
    'LOG(colA)',
    'Computes the natural log of the column value.',
    '=LOG(colA)',
    'math',
    createFunctionMatcher('LOG'),
    10
  ),
  createFormula(
    'square-root',
    'Square Root',
    'SQRT(colA)',
    'Returns the square root for numeric columns.',
    '=SQRT(colA)',
    'math',
    createFunctionMatcher('SQRT'),
    10
  ),
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
  createFormula(
    'average',
    'Average',
    'AVG(colA, colB, ...)',
    'Returns the average of the supplied values.',
    '=AVG(colA,colB,...)',
    'statistical',
    createFunctionMatcher('AVG'),
    10
  ),
  createFormula(
    'mean',
    'Mean',
    'MEAN(colA, colB, ...)',
    'Alias for AVG to average row values.',
    '=MEAN(colA,colB,...)',
    'statistical',
    createFunctionMatcher('MEAN'),
    10
  ),
  createFormula(
    'median',
    'Median',
    'MEDIAN(colA)',
    'Returns the median value for the specified column.',
    '=MEDIAN(colA)',
    'statistical',
    createFunctionMatcher('MEDIAN'),
    11
  ),
  createFormula(
    'percentile',
    'Percentile',
    'PERCENTILE(colA, quantile)',
    'Computes a quantile (0-1) for the column.',
    '=PERCENTILE(colA, 0.9)',
    'statistical',
    createFunctionMatcher('PERCENTILE'),
    12
  ),
  createFormula(
    'count',
    'Count (Non-null)',
    'COUNT(colA)',
    'Counts the number of non-null values in a column.',
    '=COUNT(colA)',
    'statistical',
    createFunctionMatcher('COUNT'),
    11
  ),
  createFormula(
    'maximum',
    'Maximum',
    'MAX(colA, colB, ...)',
    'Finds the maximum value for each row.',
    '=MAX(colA,colB,...)',
    'statistical',
    createFunctionMatcher('MAX'),
    10
  ),
  createFormula(
    'minimum',
    'Minimum',
    'MIN(colA, colB, ...)',
    'Finds the minimum value for each row.',
    '=MIN(colA,colB,...)',
    'statistical',
    createFunctionMatcher('MIN'),
    10
  ),
  createFormula(
    'correlation',
    'Correlation',
    'CORR(colA, colB)',
    'Computes Pearson correlation between two columns.',
    '=CORR(colA,colB)',
    'statistical',
    createFunctionMatcher('CORR'),
    10
  ),
  createFormula(
    'zscore',
    'Z-Score (Normalize)',
    'ZSCORE(colA)',
    'Standardizes a numeric column by subtracting the mean and dividing by the standard deviation.',
    '=ZSCORE(colA)',
    'statistical',
    createFunctionMatcher('ZSCORE'),
    12
  ),
  createFormula(
    'normalize',
    'Normalize (Alias)',
    'NORM(colA)',
    'Alias of ZSCORE that produces the same standardized values for the selected column.',
    '=NORM(colA)',
    'statistical',
    createFunctionMatcher('NORM'),
    13
  ),
  createFormula(
    'std',
    'Standard Deviation',
    'STD(colA)',
    'Population standard deviation (ddof = 0).',
    '=STD(colA)',
    'statistical',
    createFunctionMatcher('STD'),
    14
  ),
  createFormula(
    'var',
    'Variance',
    'VAR(colA)',
    'Population variance (ddof = 0) for the column.',
    '=VAR(colA)',
    'statistical',
    createFunctionMatcher('VAR'),
    15
  ),
  createFormula(
    'cov',
    'Covariance',
    'COV(colA, colB)',
    'Calculates covariance between two numeric columns.',
    '=COV(colA,colB)',
    'statistical',
    createFunctionMatcher('COV'),
    16
  ),
  createFormula(
    'corr',
    'Correlation',
    'CORR(colA, colB)',
    'Computes Pearson correlation between two columns.',
    '=CORR(colA,colB)',
    'statistical',
    createFunctionMatcher('CORR'),
    17
  ),
  createFormula(
    'cumsum',
    'Cumulative Sum',
    'CUMSUM(colA)',
    'Running total down the column based on current row order.',
    '=CUMSUM(colA)',
    'statistical',
    createFunctionMatcher('CUMSUM'),
    18
  ),
  createFormula(
    'cumprod',
    'Cumulative Product',
    'CUMPROD(colA)',
    'Running product of the column values.',
    '=CUMPROD(colA)',
    'statistical',
    createFunctionMatcher('CUMPROD'),
    19
  ),
  createFormula(
    'cummax',
    'Cumulative Max',
    'CUMMAX(colA)',
    'Tracks the maximum observed so far down the column.',
    '=CUMMAX(colA)',
    'statistical',
    createFunctionMatcher('CUMMAX'),
    20
  ),
  createFormula(
    'cummin',
    'Cumulative Min',
    'CUMMIN(colA)',
    'Tracks the minimum observed so far down the column.',
    '=CUMMIN(colA)',
    'statistical',
    createFunctionMatcher('CUMMIN'),
    21
  ),
  createFormula(
    'diff',
    'Difference',
    'DIFF(colA, [periods])',
    'Subtracts the value from a previous row (default 1 period).',
    '=DIFF(colA)',
    'statistical',
    createFunctionMatcher('DIFF'),
    22
  ),
  createFormula(
    'pct-change',
    'Percent Change',
    'PCT_CHANGE(colA, [periods])',
    'Computes the percentage change vs. a prior row (default 1).',
    '=PCT_CHANGE(colA)',
    'statistical',
    createFunctionMatcher('PCT_CHANGE'),
    23
  ),
  createFormula(
    'lag',
    'Lag',
    'LAG(colA, [periods])',
    'Shifts the column down by N rows (default 1).',
    '=LAG(colA, 1)',
    'statistical',
    createFunctionMatcher('LAG'),
    24
  ),
  createFormula(
    'rolling-sum',
    'Rolling Sum',
    'ROLLINGSUM(colA, window)',
    'Calculates rolling sum with specified window size. First (window-1) rows are blank.',
    '=ROLLINGSUM(colA, 12)',
    'statistical',
    createFunctionMatcher('ROLLINGSUM'),
    25
  ),
  // Logical & binning
  // Note: IF functions are complex and don't follow standard argument patterns
  // They are kept as-is since they require special handling
  {
    key: 'if-isnull',
    name: 'Null via IF',
    syntax: 'IF(ISNULL(value), fallback, value)',
    description: 'Replaces null/blank values inline using IF.',
    example: '=IF(ISNULL(colA), 0, colA)',
    category: 'nulls',
    matcher: createIfMatcher(({ uppercase }) => uppercase.includes('ISNULL(')),
    priority: 5,
    arguments: [
      { name: 'condition', optional: false, isVariadic: false },
      { name: 'true_value', optional: false, isVariadic: false },
      { name: 'false_value', optional: false, isVariadic: false }
    ]
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
    arguments: [
      { name: 'condition', optional: false, isVariadic: false },
      { name: 'true_value', optional: false, isVariadic: false },
      { name: 'false_value', optional: false, isVariadic: false }
    ]
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
    arguments: [
      { name: 'condition', optional: false, isVariadic: false },
      { name: 'true_value', optional: false, isVariadic: false },
      { name: 'false_value', optional: false, isVariadic: false }
    ]
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
    arguments: [
      { name: 'condition', optional: false, isVariadic: false },
      { name: 'true_value', optional: false, isVariadic: false },
      { name: 'false_value', optional: false, isVariadic: false }
    ]
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
    arguments: [
      { name: 'condition', optional: false, isVariadic: false },
      { name: 'true_value', optional: false, isVariadic: false },
      { name: 'false_value', optional: false, isVariadic: false }
    ]
  },
  createFormula(
    'bin',
    'Custom Binning',
    'BIN(colA, [bounds])',
    'Buckets numeric values using explicit boundaries.',
    '=BIN(colA, [0, 50, 100])',
    'logical',
    createFunctionMatcher('BIN'),
    25
  ),
  // Text
  createFormula(
    'lower',
    'Lowercase',
    'LOWER(colA)',
    'Converts text to lowercase.',
    '=LOWER(colA)',
    'text',
    createFunctionMatcher('LOWER'),
    10
  ),
  createFormula(
    'upper',
    'Uppercase',
    'UPPER(colA)',
    'Converts text to uppercase.',
    '=UPPER(colA)',
    'text',
    createFunctionMatcher('UPPER'),
    10
  ),
  createFormula(
    'length',
    'Length',
    'LEN(colA)',
    'Returns the string length.',
    '=LEN(colA)',
    'text',
    createFunctionMatcher('LEN'),
    10
  ),
  createFormula(
    'substring',
    'Substring',
    'SUBSTR(colA, start, end)',
    'Extracts characters between the start and end index.',
    '=SUBSTR(colA, 0, 5)',
    'text',
    createFunctionMatcher('SUBSTR'),
    10
  ),
  createFormula(
    'str-replace',
    'Replace Text',
    'STR_REPLACE(colA, old_text, new_text)',
    'Replaces a substring within the text.',
    '=STR_REPLACE(colA, "old", "new")',
    'text',
    createFunctionMatcher('STR_REPLACE'),
    10
  ),
  // Date
  createFormula(
    'year',
    'Year',
    'YEAR(colA)',
    'Extracts the year from a date value.',
    '=YEAR(colDate)',
    'date',
    createFunctionMatcher('YEAR'),
    10
  ),
  createFormula(
    'month',
    'Month',
    'MONTH(colA)',
    'Extracts the month from a date value.',
    '=MONTH(colDate)',
    'date',
    createFunctionMatcher('MONTH'),
    10
  ),
  createFormula(
    'day',
    'Day',
    'DAY(colA)',
    'Extracts the day of the month from a date value.',
    '=DAY(colDate)',
    'date',
    createFunctionMatcher('DAY'),
    10
  ),
  createFormula(
    'weekday',
    'Weekday',
    'WEEKDAY(colA)',
    'Returns the textual weekday (Monday, Tuesday, ...).',
    '=WEEKDAY(colDate)',
    'date',
    createFunctionMatcher('WEEKDAY'),
    10
  ),
  createFormula(
    'quarter',
    'Quarter',
    'QUARTER(colDate)',
    'Extracts quarter from date (JFM, AMJ, JAS, OND).',
    '=QUARTER(colDate)',
    'date',
    createFunctionMatcher('QUARTER'),
    10
  ),
  createFormula(
    'date-diff',
    'Date Difference',
    'DATE_DIFF(colA, colB)',
    'Calculates the day difference between two dates.',
    '=DATE_DIFF(colDate1, colDate2)',
    'date',
    createFunctionMatcher('DATE_DIFF'),
    10
  ),
  // Mapping & null handling
  createFormula(
    'map',
    'Map Categories',
    'MAP(colA, mapping_dict)',
    'Replaces values based on a mapping object.',
    '=MAP(colA, {"M": "Male", "F": "Female"})',
    'mapping',
    createFunctionMatcher('MAP'),
    10
  ),
  createFormula(
    'fillna',
    'Fill Nulls',
    'FILLNA(colA, replacement)',
    'Shortcut helper for replacing null values.',
    '=FILLNA(colA, 0)',
    'nulls',
    createFunctionMatcher('FILLNA'),
    10
  ),
  createFormula(
    'fillblank',
    'Fill Blanks',
    'FILLBLANK(colA, value)',
    'Fill all blank cells (NULL, empty strings, whitespace) with a value.',
    '=FILLBLANK(colA, "Unknown")',
    'nulls',
    createFunctionMatcher('FILLBLANK'),
    5
  ),
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
  // Track last interaction source to control when autocomplete appears
  const lastInputSourceRef = useRef<'keyboard' | 'mouse' | null>(null);
  
  // State for function signature helper (Excel-like)
  const [activeFunctionSignature, setActiveFunctionSignature] = useState<{
    functionName: string;
    arguments: FunctionArgument[];
    currentArgumentIndex: number;
    formulaItem: FormulaItem | null;
  } | null>(null);
  
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
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1); // -1 = no selection, requires Down Arrow to activate
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
    if (isFormulaMode && isEditingFormula && formulaInputRef.current) {
      formulaInputRef.current.focus();
    }
  }, [isFormulaMode, isEditingFormula]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Any document click is considered a mouse interaction
      lastInputSourceRef.current = 'mouse';
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
    
    // If there's a backend error from formulaValidationError prop, show it
    if (formulaValidationError && !trimmed) {
      setValidationResult({
        isValid: false,
        error: formulaValidationError,
        suggestions: [],
        errorType: 'backend',
        severity: 'error'
      });
      return;
    }
    
    if (!trimmed) {
      setSelectedFormula(null);
      setActiveTab('all');
      setValidationResult({
        isValid: true,
        error: null,
        suggestions: [],
        errorType: null,
        severity: undefined
      });
      setShowSuggestions(false);
      onValidationError?.(null);
      return;
    }
    
    // Run validation - but SKIP column validation while typing (only validate on Apply)
    const availableColumns = data?.headers || [];
    
    // First check syntax and operations (these show warnings/errors while typing)
    const syntaxResult = validateFormulaSyntax(trimmed);
    if (!syntaxResult.isValid) {
      setValidationResult(syntaxResult);
      // Only show error to parent if it's a blocking error, not a warning
      if (syntaxResult.severity === 'error') {
        onValidationError?.(syntaxResult.error);
      } else {
        onValidationError?.(null);
      }
      setShowSuggestions(false);
      // Update selected formula
      const match = matchFormula(trimmed);
      if (match) {
        setSelectedFormula(match);
        setActiveTab(match.category);
      } else {
        setSelectedFormula(null);
      }
      return;
    }
    
    // Check for disallowed functions
    const disallowedRowFunctions = ['IF', 'AND', 'OR', 'NOT'];
    const disallowedPattern = new RegExp(`\\b(${disallowedRowFunctions.join('|')})\\s*\\(`, 'i');
    if (disallowedPattern.test(trimmed)) {
      const disallowedResult = {
        isValid: false,
        error: 'Row-level functions like IF/AND/OR are not supported yet. Please use column-level formulas.',
        suggestions: [],
        errorType: 'operation' as const,
        severity: 'error' as const
      };
      setValidationResult(disallowedResult);
      onValidationError?.(disallowedResult.error);
      setShowSuggestions(false);
      const match = matchFormula(trimmed);
      if (match) {
        setSelectedFormula(match);
        setActiveTab(match.category);
      } else {
        setSelectedFormula(null);
      }
      return;
    }
    
    // Check operations (warnings/errors)
    const operationResult = validateFormulaOperation(trimmed);
    if (!operationResult.isValid) {
      setValidationResult(operationResult);
      // Only show error to parent if it's a blocking error, not a warning
      if (operationResult.severity === 'error') {
        onValidationError?.(operationResult.error);
      } else {
        onValidationError?.(null);
      }
      setShowSuggestions(false);
      // Update selected formula
      const match = matchFormula(trimmed);
      if (match) {
        setSelectedFormula(match);
        setActiveTab(match.category);
      } else {
        setSelectedFormula(null);
      }
      return;
    }
    
    // SKIP column validation while typing - only validate on Apply
    // Set as valid for now (column validation will happen on Apply)
    setValidationResult({
      isValid: true,
      error: null,
      suggestions: [],
      errorType: null,
      severity: undefined
    });
    onValidationError?.(null);
    setShowSuggestions(false);
    
    // If there's a backend error, prioritize it over frontend validation
    if (formulaValidationError) {
      setValidationResult({
        isValid: false,
        error: formulaValidationError,
        suggestions: [
          'This error occurred when the formula was evaluated on the server',
          'Check the formula syntax and column references',
          'Verify that all functions are used correctly'
        ],
        errorType: 'backend',
        severity: 'error'
      });
      onValidationError?.(formulaValidationError);
    }
    
    // Update selected formula
    const match = matchFormula(trimmed);
    if (match) {
      setSelectedFormula(match);
      setActiveTab(match.category);
    } else {
      setSelectedFormula(null);
    }
  }, [formulaInput, data?.headers, onValidationError, formulaValidationError]);

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
    if (!isColumnSelected) {
      onValidationError?.('Select a target column before inserting a formula');
      return;
    }

    setSelectedFormula(formula);
    setActiveTab(formula.category);
    const expression = formatExampleExpression(formula);
    // Replace placeholder columns with Col1, Col2, etc. for Excel-like behavior
    let expressionWithColNumbers = replacePlaceholdersWithColNumbers(expression);
    // Normalize function names (handles case-insensitive function names)
    expressionWithColNumbers = normalizeFunctionNames(expressionWithColNumbers);
    
    // Update all states together to prevent conflicts
    onFormulaInputChange(expressionWithColNumbers);
    onFormulaModeChange(true);
    onEditingStateChange(true);
    
    setIsLibraryOpen(false);
    onValidationError?.(null);

    // Position cursor at first placeholder to encourage editing
    setTimeout(() => {
      if (!formulaInputRef.current) return;
      const placeholderMatch = expressionWithColNumbers.match(/Col\d+/);
      if (placeholderMatch) {
        const start = expressionWithColNumbers.indexOf(placeholderMatch[0]);
        const end = start + placeholderMatch[0].length;
        formulaInputRef.current.setSelectionRange(start, end);
      } else {
        const position = expressionWithColNumbers.length;
        formulaInputRef.current.setSelectionRange(position, position);
      }
      formulaInputRef.current.focus();
    }, 0);
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
      // Hide suggestions during mouse-driven insertions
      lastInputSourceRef.current = 'mouse';
      setShowAutoComplete(false);
      setAutoCompleteSuggestions([]);
      
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
    // Hide suggestions during mouse-driven insertions
    lastInputSourceRef.current = 'mouse';
    setShowAutoComplete(false);
    setAutoCompleteSuggestions([]);
    
    
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
    syntax?: string;
    example?: string;
    category?: FormulaCategory;
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
          description: item.description,
          syntax: item.syntax,
          example: item.example,
          category: item.category,
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
        return item.keywords.some(keyword => keyword.startsWith(search) || keyword.includes(search));
      })
      .map(({ type, label, insertText, description, syntax, example, category }) => ({ 
        type, 
        label, 
        insertText, 
        description,
        syntax,
        example,
        category
      }));
  };

  const getColumnSuggestions = (query: string): SuggestionItem[] => {
    const columns = data?.headers || [];
    const search = query.trim().toLowerCase();
    return columns
      .filter(col => !search || col.toLowerCase().includes(search))
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

    // Detect active function for signature helper (real-time)
    const activeFunc = detectActiveFunction(value, cursorPosition);
    if (activeFunc) {
      // Find matching formula in library - try multiple ways
      const formulaItem = formulaLibrary.find(f => {
        // Try matching by function name from syntax
        const funcNameFromSyntax = f.syntax.match(/^([A-Z_]+)/i)?.[1]?.toUpperCase();
        if (funcNameFromSyntax === activeFunc.functionName) return true;
        
        // Try matching by matcher function name
        const matcherStr = f.matcher.toString();
        const matcherMatch = matcherStr.match(/['"]([A-Z_]+)['"]/i);
        if (matcherMatch && matcherMatch[1].toUpperCase() === activeFunc.functionName) return true;
        
        return false;
      });
      
      if (formulaItem) {
        // Parse arguments if not already parsed
        let args = formulaItem.arguments;
        if (!args || args.length === 0) {
          args = parseFunctionSignature(formulaItem.syntax);
        }
        
        // Only show if we have arguments
        if (args && args.length > 0) {
          // Get current argument index
          const currentArgIndex = getCurrentArgumentIndex(value, cursorPosition, activeFunc.openParenPos);
          
          // Clamp currentArgIndex to valid range
          const clampedArgIndex = Math.min(currentArgIndex, args.length - 1);
          
          // Update signature state
          setActiveFunctionSignature({
            functionName: activeFunc.functionName,
            arguments: args,
            currentArgumentIndex: clampedArgIndex,
            formulaItem
          });
        } else {
          setActiveFunctionSignature(null);
        }
      } else {
        setActiveFunctionSignature(null);
      }
    } else {
      setActiveFunctionSignature(null);
    }

    const trimmedStart = value.trimStart();
    const leadingEquals = trimmedStart.startsWith('=');
    const justFirstEquals = trimmedStart === '='; // only the initial =
    
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

    // Extract current token before cursor
    const beforeCursor = value.slice(0, cursorPosition);
    const wordMatch = beforeCursor.match(/([A-Za-z_][A-Za-z0-9_]*)$/);
    const hasPartialToken = Boolean(wordMatch && wordMatch[1]?.length > 0);

    // Normalize function names (only affects identifiers followed by '(')
    // This is safe to call on every change since it only uppercases function names, preserving length
    const normalizedValue = normalizeFunctionNames(value);
    // Cursor position stays the same since normalization only changes case (not length)

    // Only show autocomplete when typing from keyboard, while editing, and
    // either user is typing a partial token OR they just typed the very first '='
    if (
      !isEditingFormula ||
      lastInputSourceRef.current !== 'keyboard' ||
      (!hasPartialToken && !justFirstEquals)
    ) {
      setShowAutoComplete(false);
      setAutoCompleteSuggestions([]);
      setSelectedSuggestionIndex(-1); // Reset to no selection
    } else {
      const suggestions = getAutoCompleteSuggestions(normalizedValue, cursorPosition);
      if (suggestions.length > 0) {
        setAutoCompleteSuggestions(suggestions);
        setShowAutoComplete(true);
        setSelectedSuggestionIndex(-1); // No auto-selection - user must press Down Arrow to select
      } else {
        setShowAutoComplete(false);
        setAutoCompleteSuggestions([]);
        setSelectedSuggestionIndex(-1);
      }
    }
    
    
    // Normal input handling - use normalized value
    // Only update if normalization actually changed something to avoid unnecessary re-renders
    if (normalizedValue !== value) {
      onFormulaInputChange(normalizedValue);
      // Cursor position should remain the same (normalization only changes case)
      if (inputElement) {
        setTimeout(() => {
          if (inputElement) {
            inputElement.setSelectionRange(cursorPosition, cursorPosition);
          }
        }, 0);
      }
    } else {
      onFormulaInputChange(value);
    }
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

    let newValue =
      formulaInput.slice(0, wordStart) +
      insertText +
      formulaInput.slice(wordStart + partialWord.length);

    // Normalize function names after insertion (handles case-insensitive function names)
    newValue = normalizeFunctionNames(newValue);

    onFormulaInputChange(newValue);
    onEditingStateChange(true);
    setShowAutoComplete(false);
    setAutoCompleteSuggestions([]);

    setTimeout(() => {
      const newCursorPosition = suggestion.type === 'function'
        ? wordStart + insertText.length - 1  // Position inside parentheses: SUM(|)
        : wordStart + insertText.length;
      inputElement.setSelectionRange(newCursorPosition, newCursorPosition);
      inputElement.focus();
      
      // If function was inserted, immediately detect and show signature helper
      if (suggestion.type === 'function') {
        // Trigger signature helper detection with new formula and cursor position
        const activeFunc = detectActiveFunction(newValue, newCursorPosition);
        if (activeFunc) {
          // Find matching formula in library
          const formulaItem = formulaLibrary.find(f => {
            const funcNameFromSyntax = f.syntax.match(/^([A-Z_]+)/i)?.[1]?.toUpperCase();
            if (funcNameFromSyntax === activeFunc.functionName) return true;
            
            const matcherStr = f.matcher.toString();
            const matcherMatch = matcherStr.match(/['"]([A-Z_]+)['"]/i);
            if (matcherMatch && matcherMatch[1].toUpperCase() === activeFunc.functionName) return true;
            
            return false;
          });
          
          if (formulaItem) {
            // Parse arguments if not already parsed
            let args = formulaItem.arguments;
            if (!args || args.length === 0) {
              args = parseFunctionSignature(formulaItem.syntax);
            }
            
            // Only show if we have arguments
            if (args && args.length > 0) {
              // Get current argument index (should be 0 when cursor is right after opening paren)
              const currentArgIndex = getCurrentArgumentIndex(newValue, newCursorPosition, activeFunc.openParenPos);
              const clampedArgIndex = Math.min(currentArgIndex, args.length - 1);
              
              // Update signature state immediately
              setActiveFunctionSignature({
                functionName: activeFunc.functionName,
                arguments: args,
                currentArgumentIndex: clampedArgIndex,
                formulaItem
              });
            }
          }
        }
      }
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
    let expressionWithColNumbers = replacePlaceholdersWithColNumbers(expression);
    // Normalize function names (handles case-insensitive function names)
    expressionWithColNumbers = normalizeFunctionNames(expressionWithColNumbers);
    
    if (expressionWithColNumbers === formulaInput) {
      return false;
    }

    onFormulaInputChange(expressionWithColNumbers);
    onFormulaModeChange(true);
    onValidationError?.(null);
    return true;
  };

  const handleSubmit = () => {
    console.log(`
╔════════════════════════════════════════════════════════════════
║ [FormularBar] 🚀 APPLY BUTTON CLICKED
╠════════════════════════════════════════════════════════════════
║ selectedColumn: "${selectedColumn}"
║ formulaInput: "${formulaInput}"
║ hasData: ${!!data?.headers}
║ validationResult.isValid: ${validationResult.isValid}
║ validationResult.error: ${validationResult.error || 'none'}
╚════════════════════════════════════════════════════════════════
    `);

    if (!selectedColumn) {
      console.error('[FormularBar] ❌ BLOCKED: No selected column');
      onValidationError?.('Please select a target column first');
      return;
    }

    if (!formulaInput.trim()) {
      console.error('[FormularBar] ❌ BLOCKED: Empty formula');
      onValidationError?.('Please enter a formula');
      return;
    }

    // Normalize function names before validation and submission
    const normalizedFormula = normalizeFunctionNames(formulaInput.trim());
    
    // Update the input with normalized formula if it changed
    if (normalizedFormula !== formulaInput.trim()) {
      onFormulaInputChange(normalizedFormula);
    }

    // Run FULL validation including column validation on Apply
    const trimmed = normalizedFormula;
    const availableColumns = data?.headers || [];
    const fullValidationResult = validateFormula(trimmed, availableColumns);
    
    // Check validation result (including column validation)
    if (!fullValidationResult.isValid) {
      console.error('[FormularBar] ❌ BLOCKED: Validation failed:', fullValidationResult.error);
      // Update validation result to show column errors
      setValidationResult(fullValidationResult);
      onValidationError?.(fullValidationResult.error);
      return;
    }

    console.log('[FormularBar] ✅ All checks passed - Calling onFormulaSubmit()');
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
                    !validationResult.isValid && validationResult.severity
                      ? validationResult.severity === 'warning'
                        ? 'border-yellow-500 bg-yellow-50 focus:ring-yellow-200 focus:border-yellow-500'
                        : 'border-red-500 bg-red-50 focus:ring-red-200 focus:border-red-500'
                      : formulaValidationError 
                        ? 'border-red-500 bg-red-50 focus:ring-red-200 focus:border-red-500' 
                        : 'border-primary/50 bg-primary/5 focus:ring-primary/20 focus:border-primary'
                  } ${!isColumnSelected ? 'bg-slate-100 text-slate-400 cursor-not-allowed placeholder:text-slate-400' : ''} ${isColumnSelected && !isEditingFormula ? 'cursor-pointer' : ''}`}
                onKeyDown={(e) => {
                  // Mark this interaction as keyboard for autocomplete gating
                  lastInputSourceRef.current = 'keyboard';
                  // If comma is pressed, hide suggestions until the next token starts
                  if (e.key === ',') {
                    setShowAutoComplete(false);
                    setAutoCompleteSuggestions([]);
                    setSelectedSuggestionIndex(-1);
                  }
                  if (!isColumnSelected || !isEditingFormula) {
                    e.preventDefault();
                    return;
                  }
                  // Handle auto-completion navigation
                  if (showAutoComplete && autoCompleteSuggestions.length > 0) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setSelectedSuggestionIndex(prev => {
                        // If no selection (-1), go to first item (0)
                        // Otherwise, cycle through items
                        if (prev === -1) {
                          return 0;
                        }
                        return prev < autoCompleteSuggestions.length - 1 ? prev + 1 : 0;
                      });
                      return;
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setSelectedSuggestionIndex(prev => {
                        // If at first item (0), go to no selection (-1)
                        // Otherwise, go to previous item
                        if (prev === 0) {
                          return -1;
                        }
                        return prev > 0 ? prev - 1 : autoCompleteSuggestions.length - 1;
                      });
                      return;
                    }
                    if (e.key === 'Enter' || e.key === 'Tab') {
                      // Only insert if user has explicitly selected an item (index >= 0)
                      if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < autoCompleteSuggestions.length) {
                        e.preventDefault();
                        const selected = autoCompleteSuggestions[selectedSuggestionIndex];
                        if (selected) {
                          selectAutoCompleteSuggestion(selected);
                        }
                        return;
                      }
                      // If no selection, let Enter proceed normally (submit formula)
                      // Don't preventDefault here - let it fall through to handleSubmit
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setShowAutoComplete(false);
                      setAutoCompleteSuggestions([]);
                      setSelectedSuggestionIndex(-1);
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
              {/* Only show warnings/errors while typing (not column errors - those show on Apply) */}
              {(formulaValidationError || (!validationResult.isValid && validationResult.severity && validationResult.errorType !== 'column')) && (
                <div className="absolute top-full left-0 right-0 mt-1 z-[1300]">
                  <div className={`px-3 py-2.5 rounded-lg border shadow-lg max-w-full ${
                    validationResult.severity === 'warning'
                      ? 'bg-yellow-50 border-yellow-300 text-yellow-900'
                      : validationResult.errorType === 'backend'
                      ? 'bg-red-50 border-red-300 text-red-900'
                      : 'bg-red-50 border-red-300 text-red-900'
                  }`}>
                    <div className="flex items-start space-x-2">
                      <span className="text-base mt-0.5">
                        {validationResult.severity === 'warning' ? '⚠️' : '❌'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold mb-1.5 break-words">
                          {validationResult.error || formulaValidationError}
                        </div>
                        {validationResult.suggestions.length > 0 && (
                          <div className="text-xs space-y-1.5 mt-2 pt-2 border-t border-current/20">
                            {validationResult.suggestions.map((suggestion, index) => (
                              <div key={index} className="flex items-start space-x-1.5">
                                <span className="text-current/70 mt-0.5">💡</span>
                                <span className="flex-1">{suggestion}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {/* Show column errors only on Apply (when severity is set and errorType is column) */}
              {!validationResult.isValid && validationResult.errorType === 'column' && validationResult.severity && (
                <div className="absolute top-full left-0 right-0 mt-1 z-[1300]">
                  <div className="px-3 py-2.5 rounded-lg border shadow-lg max-w-full bg-red-50 border-red-300 text-red-900">
                    <div className="flex items-start space-x-2">
                      <span className="text-base mt-0.5">❌</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold mb-1.5 break-words">
                          {validationResult.error}
                        </div>
                        {validationResult.suggestions.length > 0 && (
                          <div className="text-xs space-y-1.5 mt-2 pt-2 border-t border-current/20">
                            {validationResult.suggestions.map((suggestion, index) => (
                              <div key={index} className="flex items-start space-x-1.5">
                                <span className="text-current/70 mt-0.5">💡</span>
                                <span className="flex-1">{suggestion}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {validationResult.errorDetails?.invalidColumns && validationResult.errorDetails.availableColumns && (
                          <div className="text-xs mt-2 pt-2 border-t border-current/20">
                            <div className="font-medium mb-1">Available columns:</div>
                            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                              {validationResult.errorDetails.availableColumns.slice(0, 20).map((col, idx) => (
                                <span 
                                  key={idx}
                                  className="px-1.5 py-0.5 bg-current/10 rounded text-xs cursor-pointer hover:bg-current/20"
                                  onClick={() => handleColumnInsert(col)}
                                  title={`Click to insert "${col}"`}
                                >
                                  {col}
                                </span>
                              ))}
                              {validationResult.errorDetails.availableColumns.length > 20 && (
                                <span className="px-1.5 py-0.5 text-xs opacity-70">
                                  +{validationResult.errorDetails.availableColumns.length - 20} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Function Signature Helper - Excel-like */}
              {activeFunctionSignature && isEditingFormula && activeFunctionSignature.arguments && activeFunctionSignature.arguments.length > 0 && (
                <div className="absolute top-full left-0 mt-1 z-[1301]">
                  <div className="px-2.5 py-1.5 bg-gray-100 rounded border border-gray-300 shadow-sm">
                    <div className="text-xs font-mono text-gray-800">
                      <span className="font-semibold">{activeFunctionSignature.functionName}</span>
                      <span>(</span>
                      {activeFunctionSignature.arguments.map((arg, idx) => {
                        const isCurrentArg = idx === activeFunctionSignature.currentArgumentIndex;
                        return (
                          <span key={idx}>
                            {isCurrentArg ? (
                              <span className="font-bold text-blue-700">{arg.name}</span>
                            ) : (
                              <span>
                                {arg.optional ? `[${arg.name}]` : arg.name}
                              </span>
                            )}
                            {arg.isVariadic && !arg.name.includes('...') && <span className="text-gray-500">...</span>}
                            {idx < activeFunctionSignature.arguments.length - 1 && <span>, </span>}
                          </span>
                        );
                      })}
                      <span>)</span>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Enhanced Auto-completion dropdown - One-line format */}
              {showAutoComplete && autoCompleteSuggestions.length > 0 && (
                isEditingFormula && (
                <div className={`absolute top-full left-0 right-0 z-[1300] ${
                  activeFunctionSignature && activeFunctionSignature.arguments && activeFunctionSignature.arguments.length > 0
                    ? 'mt-10' // Push down when signature helper is visible (signature helper height ~36px + mt-1 = ~40px)
                    : 'mt-1'  // Normal spacing when no signature helper
                }`}>
                  <div className="bg-white border border-gray-300 rounded-lg shadow-xl max-h-64 overflow-y-auto">
                    {autoCompleteSuggestions.map((item, index) => (
                      <div
                        key={`${item.type}-${item.insertText}-${index}`}
                        className={`px-3 py-2 text-sm cursor-pointer border-b border-gray-100 last:border-b-0 ${
                          index === selectedSuggestionIndex 
                            ? 'bg-blue-50 border-blue-200 text-blue-900' 
                            : 'hover:bg-gray-50 text-gray-700'
                        }`}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => {
                          setSelectedSuggestionIndex(index); // Set selection on click
                          selectAutoCompleteSuggestion(item);
                        }}
                        onMouseEnter={() => setSelectedSuggestionIndex(index)}
                      >
                        <div className="flex items-center justify-between gap-3 w-full">
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <div className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center text-xs font-bold ${
                              item.type === 'function' 
                                ? 'bg-purple-100 text-purple-700' 
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {item.type === 'function' ? 'fx' : '#'}
                            </div>
                            <span className="font-mono font-semibold whitespace-nowrap">
                              {item.type === 'function' ? item.insertText.toUpperCase() : item.insertText}
                            </span>
                          </div>
                          {item.example && (
                            <span className="font-mono text-xs text-gray-600 whitespace-nowrap flex-shrink-0 ml-auto">
                              {item.example}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {autoCompleteSuggestions.length > 5 && (
                      <div className="px-3 py-2 text-xs text-gray-500 bg-gray-50 border-t border-gray-200">
                        Use ↑↓ to navigate, Enter/Tab to select, Esc to close
                      </div>
                    )}
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
            disabled={!selectedColumn || (!validationResult.isValid && validationResult.severity === 'error') || !formulaInput.trim()}
            title={!selectedColumn ? 'Select a target column first' : 
                   (!validationResult.isValid && validationResult.severity === 'error') ? validationResult.error || 'Fix formula errors' : 
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