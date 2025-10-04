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
  formulaInput: string;
  isFormulaMode: boolean;
  onSelectedCellChange: (cell: { row: number; col: string } | null) => void;
  onSelectedColumnChange: (col: string | null) => void;
  onFormulaInputChange: (value: string) => void;
  onFormulaModeChange: (mode: boolean) => void;
  onFormulaSubmit: () => void;
  onValidationError?: (message: string | null) => void;
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

// Helper function to validate column names in formula - ONLY validate Col1, Col2, etc. placeholders
const validateFormulaColumns = (expression: string, availableColumns: string[]): string | null => {
  // Don't validate if user is still typing Col placeholders
  if (expression.includes('Col')) {
    return null; // Still has placeholders, don't validate yet
  }
  
  // Don't validate if formula is incomplete (missing closing parenthesis)
  const openParens = (expression.match(/\(/g) || []).length;
  const closeParens = (expression.match(/\)/g) || []).length;
  if (openParens > closeParens) {
    return null; // Formula is incomplete, don't validate yet
  }
  
  // First, remove all quoted strings from the expression to avoid false positives
  const expressionWithoutQuotes = expression.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
  
  // Extract only actual column references (not function names, numbers, or quoted strings)
  const columnPattern = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
  const matches = expressionWithoutQuotes.match(columnPattern) || [];
  
  // Filter out function names, numbers, and other non-column references
  const functionNames = ['SUM', 'AVG', 'MAX', 'MIN', 'DIV', 'PROD', 'ABS', 'ROUND', 'FLOOR', 'CEIL', 'EXP', 'LOG', 'SQRT', 'MEAN', 'CORR', 'ZSCORE', 'NORM', 'IF', 'ISNULL', 'LOWER', 'UPPER', 'LEN', 'SUBSTR', 'STR_REPLACE', 'YEAR', 'MONTH', 'DAY', 'WEEKDAY', 'DATE_DIFF', 'MAP', 'FILLNA', 'BIN', 'AND', 'OR', 'NOT', 'TRUE', 'FALSE'];
  
  const columnReferences = matches.filter(match => 
    !functionNames.includes(match.toUpperCase()) && 
    !match.startsWith('Col') && // Ignore placeholder Col1, Col2, etc.
    !/^\d+$/.test(match) && // Ignore numbers
    !/^[0-9]+\.?[0-9]*$/.test(match) // Ignore decimal numbers
  );
  
  // If no column references found, no validation needed
  if (columnReferences.length === 0) {
    return null;
  }
  
  // ONLY validate column references against actual dataframe columns
  const invalidColumns = columnReferences.filter(col => !availableColumns.includes(col));
  if (invalidColumns.length > 0) {
    return `Invalid columns: ${invalidColumns.join(', ')}`;
  }
  
  return null;
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
  formulaInput,
  isFormulaMode,
  onSelectedCellChange,
  onSelectedColumnChange,
  onFormulaInputChange,
  onFormulaModeChange,
  onFormulaSubmit,
  onValidationError,
}) => {
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFormula, setSelectedFormula] = useState<FormulaItem | null>(null);
  const [activeTab, setActiveTab] = useState<TabValue>('all');
  const [isUsageGuideOpen, setIsUsageGuideOpen] = useState(false);
  const formulaInputRef = useRef<HTMLInputElement>(null);
  const preservedColumnRef = useRef<string | null>(null);

  // Preserve selected column to prevent it from disappearing
  useEffect(() => {
    if (selectedColumn) {
      preservedColumnRef.current = selectedColumn;
      console.log('[FormularBar] Column preserved:', selectedColumn);
    }
  }, [selectedColumn]);

  // Ensure selected column and formula input work together
  useEffect(() => {
    // If we have a formula input but no selected column, restore it
    if (formulaInput.trim() && !selectedColumn && preservedColumnRef.current) {
      console.log('[FormularBar] Restoring selected column for formula:', preservedColumnRef.current);
      onSelectedColumnChange(preservedColumnRef.current);
    }
  }, [formulaInput, selectedColumn, onSelectedColumnChange]);

  // Ensure input is focusable and working when maximized
  useEffect(() => {
    const handleResize = () => {
      // Re-focus input after window resize (maximize/restore)
      if (formulaInputRef.current && isFormulaMode) {
        setTimeout(() => {
          formulaInputRef.current?.focus();
        }, 100);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isFormulaMode]);

  useEffect(() => {
    const trimmed = formulaInput.trim();
    if (!trimmed) {
      setSelectedFormula(null);
      setActiveTab('all');
      return;
    }
    const match = matchFormula(trimmed);
    if (match) {
      setSelectedFormula(match);
      setActiveTab(match.category);
    } else {
      setSelectedFormula(null);
    }
  }, [formulaInput]);

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
    setSelectedFormula(null);
    setIsLibraryOpen(false);
    setActiveTab('all');
    setIsUsageGuideOpen(false);
    onValidationError?.(null);
  };

  const handleFormulaSelect = (formula: FormulaItem) => {
    console.log('[FormularBar] Formula selected:', {
      formulaName: formula.name,
      currentSelectedColumn: selectedColumn,
      isFormulaMode,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight
    });
    
    // Preserve the selected column BEFORE any state changes
    const preservedColumn = preservedColumnRef.current || selectedColumn;
    console.log('[FormularBar] Preserving column:', preservedColumn);
    
    setSelectedFormula(formula);
    setActiveTab(formula.category);
    const expression = formatExampleExpression(formula);
    // Replace placeholder columns with Col1, Col2, etc. for Excel-like behavior
    const expressionWithColNumbers = replacePlaceholdersWithColNumbers(expression);
    
    // Update all states together to prevent conflicts
    onFormulaInputChange(expressionWithColNumbers);
    onFormulaModeChange(true);
    
    // Ensure selected column is maintained
    if (preservedColumn) {
      onSelectedColumnChange(preservedColumn);
    }
    
    setIsLibraryOpen(false);
    onValidationError?.(null);
    
    console.log('[FormularBar] Formula selection completed:', {
      formulaApplied: expressionWithColNumbers,
      selectedColumn: preservedColumn,
      isFormulaMode: true
    });
  };

  const handleLibraryOpenChange = (open: boolean) => {
    console.log('[FormularBar] Library open change:', {
      open,
      currentSelectedColumn: selectedColumn,
      isFormulaMode,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight
    });
    
    // Preserve selected column when opening library
    const preservedColumn = preservedColumnRef.current || selectedColumn;
    
    // Prevent state conflicts in maximized mode
    if (open && !isFormulaMode) {
      console.log('[FormularBar] Activating formula mode before opening library');
      onFormulaModeChange(true);
    }
    
    // Ensure selected column is maintained when opening library
    if (open && preservedColumn && !selectedColumn) {
      console.log('[FormularBar] Restoring selected column when opening library:', preservedColumn);
      onSelectedColumnChange(preservedColumn);
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
      
      // If no target column is selected, set the inserted column as the target
      if (!selectedColumn) {
        onSelectedColumnChange(column);
      }
      
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
      
      // If no target column is selected, set the inserted column as the target
      if (!selectedColumn) {
        onSelectedColumnChange(column);
      }
      return;
    }

    const cursorPosition = inputElement.selectionStart || 0;
    const currentValue = formulaInput;
    
    // Insert column at cursor position
    const newValue = currentValue.slice(0, cursorPosition) + column + currentValue.slice(cursorPosition);
    
    onFormulaInputChange(newValue);
    onFormulaModeChange(true);
    
    // If no target column is selected, set the inserted column as the target
    if (!selectedColumn) {
      onSelectedColumnChange(column);
    }
    
    // Set cursor position after the inserted column
    setTimeout(() => {
      const newCursorPosition = cursorPosition + column.length;
      inputElement.setSelectionRange(newCursorPosition, newCursorPosition);
      inputElement.focus();
    }, 0);
  };

  const handleInputChange = (value: string) => {
    const inputElement = formulaInputRef.current;
    const cursorPosition = inputElement?.selectionStart || 0;
    
    // Check if we're replacing a ColX placeholder (Excel-like behavior)
    if (formulaInput.includes('Col') && value.length > formulaInput.length) {
      const addedContent = value.slice(formulaInput.length);
      const { newExpression, newCursorPosition } = replaceNextColPlaceholderWithContent(formulaInput, addedContent, cursorPosition);
      
      onFormulaInputChange(newExpression);
      onFormulaModeChange(true);
      
      // Validate column names if we have data available
      if (data?.headers) {
        const validationError = validateFormulaColumns(newExpression, data.headers);
        onValidationError?.(validationError);
      } else {
        onValidationError?.(null);
      }
      
      // Set cursor position after the replacement
      setTimeout(() => {
        if (inputElement) {
          inputElement.setSelectionRange(newCursorPosition, newCursorPosition);
          inputElement.focus();
        }
      }, 0);
      return;
    }
    
    // Normal input handling
    onFormulaInputChange(value);
    onFormulaModeChange(true);
    
    // Validate column names if we have data available
    if (data?.headers) {
      const validationError = validateFormulaColumns(value, data.headers);
      onValidationError?.(validationError);
    } else {
      onValidationError?.(null);
    }
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
    if (!selectedColumn) {
      onValidationError?.('Please select a target column first');
      return;
    }

    if (!isValidFormulaInput(formulaInput)) {
      onValidationError?.('Please enter a valid formula and then hit Apply');
      return;
    }

    // Validate column names if we have data available
    if (data?.headers) {
      const validationError = validateFormulaColumns(formulaInput, data.headers);
      if (validationError) {
        onValidationError?.(validationError);
        return;
      }
    }

    onValidationError?.(null);
    onFormulaSubmit();
  };

  const renderFormulaCard = (formula: FormulaItem) => {
    const active = selectedFormula?.key === formula.key;
    return (
      <div
        key={formula.key}
        className={`p-3 rounded-lg border transition-colors cursor-pointer ${
          active ? 'border-primary bg-primary/5' : 'hover:bg-accent'
        }`}
        onClick={() => handleFormulaSelect(formula)}
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
    <div className='flex-shrink-0 border-b border-border bg-gradient-to-r from-card via-card/95 to-card shadow-sm w-full relative'>
      <div className='flex items-center h-12 px-4 space-x-3 w-full min-w-0 relative'>
        <div className='flex items-center space-x-2 flex-shrink-0 z-30'>
          <div 
            className='flex items-center space-x-2 bg-primary/10 rounded-lg px-3 py-1.5 border border-primary/20 shadow-sm cursor-pointer hover:bg-primary/15 transition-colors'
            onClick={(e) => {
              e.stopPropagation();
              console.log('[FormularBar] Target column clicked, isFormulaMode:', isFormulaMode, 'selectedColumn:', selectedColumn);
              // Activate formula bar if it's not already active and we have a selected column
              if (!isFormulaMode && selectedColumn) {
                console.log('[FormularBar] Activating formula bar via target column for:', selectedColumn);
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
              className='w-[520px] p-0 shadow-lg border border-border bg-popover overflow-hidden z-[99999]'
              align='start'
              side='bottom'
              sideOffset={8}
              style={{ 
                zIndex: 99999,
                position: 'fixed',
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

          <div className='flex flex-col flex-1 min-w-0 relative'>
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
                      console.log('[FormularBar] Sigma button clicked, isLibraryOpen:', isLibraryOpen, 'isFormulaMode:', isFormulaMode);
                      handleLibraryOpenChange(!isLibraryOpen);
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onMouseUp={(e) => e.stopPropagation()}
                  >
                    <Sigma className='w-4 h-4 text-primary' />
                  </Button>
                </PopoverTrigger>
                <PopoverContent 
                  className='w-96 p-0 shadow-lg z-[99999]' 
                  align='start' 
                  side='bottom' 
                  sideOffset={4}
                  style={{ 
                    zIndex: 99999,
                    position: 'fixed',
                    maxHeight: '80vh',
                    overflow: 'auto'
                  }}
                  avoidCollisions={true}
                  collisionPadding={10}
                  onOpenAutoFocus={(e) => e.preventDefault()}
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
              <Input
                ref={formulaInputRef}
                value={formulaInput}
                onChange={(e) => handleInputChange(e.target.value)}
                onClick={(e) => {
                  e.stopPropagation();
                  console.log('[FormularBar] Formula input clicked, isFormulaMode:', isFormulaMode, 'selectedColumn:', selectedColumn);
                  // Activate formula bar if it's not already active and we have a selected column
                  if (!isFormulaMode && selectedColumn) {
                    console.log('[FormularBar] Activating formula bar for column:', selectedColumn);
                    onFormulaModeChange(true);
                  }
                  formulaInputRef.current?.focus();
                }}
                placeholder='=SUM(Col1,Col2), =IF(Col1 > 10, Col2, Col3), =DATE_DIFF(Col1, Col2)'
                className='h-8 shadow-sm pl-10 font-mono border-primary/50 bg-primary/5 transition-all duration-200 w-full min-w-0 focus:ring-2 focus:ring-primary/20 focus:border-primary'
                onKeyDown={(e) => {
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
          </div>
        </div>


        <div className='flex items-center space-x-1 flex-shrink-0 z-30'>
          <Button
            variant='outline'
            size='sm'
            className='h-8 px-3 shadow-sm'
            onClick={handleSubmit}
            disabled={!selectedColumn}
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
