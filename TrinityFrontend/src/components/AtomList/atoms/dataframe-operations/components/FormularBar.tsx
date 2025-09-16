import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
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
  name: string;
  syntax: string;
  description: string;
  example: string;
  category: FormulaCategory;
}

const formulaLibrary: FormulaItem[] = [
  // Math & aggregations
  {
    name: 'Sum',
    syntax: 'SUM(colA, colB, ...)',
    description: 'Adds the supplied columns row-wise.',
    example: '=SUM(colA,colB)',
    category: 'math',
  },
  {
    name: 'Product',
    syntax: 'PROD(colA, colB, ...)',
    description: 'Multiplies values across the row.',
    example: '=PROD(colA,colB)',
    category: 'math',
  },
  {
    name: 'Division',
    syntax: 'DIV(colA, colB, ...)',
    description: 'Sequentially divides the provided values.',
    example: '=DIV(colA,colB)',
    category: 'math',
  },
  {
    name: 'Absolute Value',
    syntax: 'ABS(number)',
    description: 'Returns the absolute value for a column.',
    example: '=ABS(colA)',
    category: 'math',
  },
  {
    name: 'Round',
    syntax: 'ROUND(number, digits)',
    description: 'Rounds a number using the specified precision.',
    example: '=ROUND(colA, 2)',
    category: 'math',
  },
  {
    name: 'Floor',
    syntax: 'FLOOR(number)',
    description: 'Rounds a number down to the nearest integer.',
    example: '=FLOOR(colA)',
    category: 'math',
  },
  {
    name: 'Ceiling',
    syntax: 'CEIL(number)',
    description: 'Rounds a number up to the nearest integer.',
    example: '=CEIL(colA)',
    category: 'math',
  },
  {
    name: 'Exponential',
    syntax: 'EXP(number)',
    description: 'Returns Euler’s number raised to the value.',
    example: '=EXP(colA)',
    category: 'math',
  },
  {
    name: 'Natural Logarithm',
    syntax: 'LOG(number)',
    description: 'Computes the natural log of the column value.',
    example: '=LOG(colA)',
    category: 'math',
  },
  {
    name: 'Square Root',
    syntax: 'SQRT(number)',
    description: 'Returns the square root for numeric columns.',
    example: '=SQRT(colA)',
    category: 'math',
  },
  {
    name: 'Square',
    syntax: 'number ** 2',
    description: 'Squares the column using Python exponentiation.',
    example: '=colA ** 2',
    category: 'math',
  },
  {
    name: 'Concatenate / Add',
    syntax: 'colA + colB',
    description: 'Adds numbers or concatenates text values.',
    example: '=colA + colB',
    category: 'math',
  },
  // Statistical
  {
    name: 'Average',
    syntax: 'AVG(colA, colB, ...)',
    description: 'Returns the average of the supplied values.',
    example: '=AVG(colA,colB)',
    category: 'statistical',
  },
  {
    name: 'Mean',
    syntax: 'MEAN(colA, colB, ...)',
    description: 'Alias for AVG to average row values.',
    example: '=MEAN(colA,colB,colC)',
    category: 'statistical',
  },
  {
    name: 'Maximum',
    syntax: 'MAX(colA, colB, ...)',
    description: 'Finds the maximum value for each row.',
    example: '=MAX(colA,colB)',
    category: 'statistical',
  },
  {
    name: 'Minimum',
    syntax: 'MIN(colA, colB, ...)',
    description: 'Finds the minimum value for each row.',
    example: '=MIN(colA,colB)',
    category: 'statistical',
  },
  {
    name: 'Correlation',
    syntax: 'CORR(colX, colY)',
    description: 'Computes Pearson correlation between two columns.',
    example: '=CORR(colA,colB)',
    category: 'statistical',
  },
  // Logical & binning
  {
    name: 'Conditional Value',
    syntax: 'IF(condition, true_value, false_value)',
    description: 'Returns one value when the condition is true, otherwise another.',
    example: '=IF(colA > 10, colB, colC)',
    category: 'logical',
  },
  {
    name: 'Categorical to Numeric',
    syntax: 'IF(condition, true_value, false_value)',
    description: 'Encodes categories into numbers.',
    example: '=IF(colA == "M", 1, 0)',
    category: 'logical',
  },
  {
    name: 'Relative Comparison',
    syntax: 'IF(condition, true_value, false_value)',
    description: 'Tags rows using two column values.',
    example: '=IF(colA > colB, "High", "Low")',
    category: 'logical',
  },
  {
    name: 'Nested Binning',
    syntax: 'IF(condition, value, IF(...))',
    description: 'Creates multi-tier bins with nested IF statements.',
    example: '=IF(colA > 90, "High", IF(colA > 70, "Medium", "Low"))',
    category: 'logical',
  },
  {
    name: 'Custom Binning',
    syntax: 'BIN(column, [bounds])',
    description: 'Buckets numeric values using explicit boundaries.',
    example: '=BIN(colA, [0, 50, 100])',
    category: 'logical',
  },
  // Text
  {
    name: 'Lowercase',
    syntax: 'LOWER(text)',
    description: 'Converts text to lowercase.',
    example: '=LOWER(colA)',
    category: 'text',
  },
  {
    name: 'Uppercase',
    syntax: 'UPPER(text)',
    description: 'Converts text to uppercase.',
    example: '=UPPER(colA)',
    category: 'text',
  },
  {
    name: 'Length',
    syntax: 'LEN(text)',
    description: 'Returns the string length.',
    example: '=LEN(colA)',
    category: 'text',
  },
  {
    name: 'Substring',
    syntax: 'SUBSTR(text, start, end)',
    description: 'Extracts characters between the start and end index.',
    example: '=SUBSTR(colA, 0, 5)',
    category: 'text',
  },
  {
    name: 'Replace Text',
    syntax: 'STR_REPLACE(text, "old", "new")',
    description: 'Replaces a substring within the text.',
    example: '=STR_REPLACE(colA, "old", "new")',
    category: 'text',
  },
  // Date
  {
    name: 'Year',
    syntax: 'YEAR(date)',
    description: 'Extracts the year from a date value.',
    example: '=YEAR(colDate)',
    category: 'date',
  },
  {
    name: 'Month',
    syntax: 'MONTH(date)',
    description: 'Extracts the month from a date value.',
    example: '=MONTH(colDate)',
    category: 'date',
  },
  {
    name: 'Day',
    syntax: 'DAY(date)',
    description: 'Extracts the day of the month from a date value.',
    example: '=DAY(colDate)',
    category: 'date',
  },
  {
    name: 'Weekday',
    syntax: 'WEEKDAY(date)',
    description: 'Returns the textual weekday (Monday, Tuesday, ...).',
    example: '=WEEKDAY(colDate)',
    category: 'date',
  },
  {
    name: 'Date Difference',
    syntax: 'DATE_DIFF(end, start)',
    description: 'Calculates the day difference between two dates.',
    example: '=DATE_DIFF(colEnd, colStart)',
    category: 'date',
  },
  // Mapping & null handling
  {
    name: 'Map Categories',
    syntax: 'MAP(column, {"key": "value"})',
    description: 'Replaces values based on a mapping object.',
    example: '=MAP(colA, {"M": "Male", "F": "Female"})',
    category: 'mapping',
  },
  {
    name: 'Null via IF',
    syntax: 'IF(ISNULL(value), fallback, value)',
    description: 'Replaces null/blank values inline using IF.',
    example: '=IF(ISNULL(colA), 0, colA)',
    category: 'nulls',
  },
  {
    name: 'Fill Nulls',
    syntax: 'FILLNA(column, replacement)',
    description: 'Shortcut helper for replacing null values.',
    example: '=FILLNA(colA, 0)',
    category: 'nulls',
  },
];

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

const quickFormulaHelpers: { expression: string; label: string; description: string }[] = [
  {
    expression: '=SUM(colA,colB)',
    label: 'SUM(colA,colB)',
    description: 'Row sum',
  },
  {
    expression: '=IF(colA > 10, colB, colC)',
    label: 'IF > 10',
    description: 'Conditional split',
  },
  {
    expression: '=LOWER(colA)',
    label: 'LOWER(colA)',
    description: 'Lowercase text',
  },
  {
    expression: '=DATE_DIFF(colEnd, colStart)',
    label: 'DATE_DIFF',
    description: 'Days between dates',
  },
  {
    expression: '=FILLNA(colA, 0)',
    label: 'FILLNA',
    description: 'Replace blanks',
  },
];

type TabValue = 'all' | FormulaCategory;

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
}) => {
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isUsageOpen, setIsUsageOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFormula, setSelectedFormula] = useState<FormulaItem | null>(null);
  const [activeTab, setActiveTab] = useState<TabValue>('all');

  const columnIndex = selectedCell && data ? data.headers.indexOf(selectedCell.col) : -1;
  const cellReference = selectedCell && columnIndex >= 0 ? getCellReference(selectedCell.row, columnIndex) : 'Select Cell';
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
    onFormulaModeChange(false);
    setSelectedFormula(null);
    setIsLibraryOpen(false);
    setIsUsageOpen(false);
  };

  const handleFormulaSelect = (formula: FormulaItem) => {
    setSelectedFormula(formula);
    setActiveTab(formula.category);
    onFormulaInputChange(formula.example);
    if (!isFormulaMode) {
      onFormulaModeChange(true);
    }
    setIsLibraryOpen(false);
  };

  const handleLibraryOpenChange = (open: boolean) => {
    setIsLibraryOpen(open);
    if (open && !isFormulaMode) {
      onFormulaModeChange(true);
    }
  };

  const handleUsageOpenChange = (open: boolean) => {
    setIsUsageOpen(open);
    if (open && !isFormulaMode) {
      onFormulaModeChange(true);
    }
  };

  const handleQuickInsert = (expression: string) => {
    onFormulaInputChange(expression);
    if (!isFormulaMode) {
      onFormulaModeChange(true);
    }
    const match = formulaLibrary.find((item) => item.example === expression);
    if (match) {
      setSelectedFormula(match);
      setActiveTab(match.category);
    }
  };

  const handleColumnInsert = (column: string) => {
    const trimmed = formulaInput.trim();
    let next = formulaInput;
    if (!trimmed) {
      next = `=${column}`;
    } else {
      const separator = /[=(]$/.test(trimmed) ? '' : ', ';
      next = `${formulaInput}${separator}${column}`;
    }
    onFormulaInputChange(next);
    if (!isFormulaMode) {
      onFormulaModeChange(true);
    }
  };

  const handleInputChange = (value: string) => {
    onFormulaInputChange(value);
    if (!isFormulaMode && value.trim().startsWith('=')) {
      onFormulaModeChange(true);
    }
    const match = formulaLibrary.find((item) => item.example === value.trim());
    if (match) {
      setSelectedFormula(match);
      setActiveTab(match.category);
    } else if (selectedFormula && value.trim() !== selectedFormula.example.trim()) {
      setSelectedFormula(null);
    }
  };

  const renderFormulaCard = (formula: FormulaItem) => {
    const active = selectedFormula?.example === formula.example;
    return (
      <div
        key={formula.example}
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
    <div className='flex-shrink-0 border-b border-border bg-gradient-to-r from-card via-card/95 to-card shadow-sm'>
      <div className='flex items-center h-12 px-4 space-x-3'>
        <div className='flex items-center space-x-2'>
          <div className='flex items-center space-x-1 bg-primary/10 rounded-lg px-3 py-1.5 border border-primary/20 shadow-sm'>
            <Hash className='w-4 h-4 text-primary' />
            <span className='text-sm font-mono font-semibold text-primary min-w-[60px]'>{cellReference}</span>
          </div>
          <div className='flex flex-col leading-tight'>
            <span className='text-[10px] uppercase tracking-wide text-muted-foreground'>Target column</span>
            <span className='text-xs font-semibold'>
              {selectedColumn ?? (selectedCell ? selectedCell.col : 'Select a column')}
            </span>
          </div>
          <Button
            variant='outline'
            size='sm'
            className='h-8 w-8 p-0 shadow-sm'
            onClick={() => onFormulaModeChange(!isFormulaMode)}
            title={isFormulaMode ? 'Exit formula mode' : 'Enter formula mode'}
          >
            <Sigma className={`w-4 h-4 ${isFormulaMode ? 'text-primary' : 'text-muted-foreground'}`} />
          </Button>
          <Popover open={isUsageOpen} onOpenChange={handleUsageOpenChange}>
            <PopoverTrigger asChild>
              <Button
                variant='outline'
                size='sm'
                className='h-8 w-8 p-0 shadow-sm'
                title='Formula usage guide'
              >
                <Calculator className='w-4 h-4' />
              </Button>
            </PopoverTrigger>
            <PopoverContent className='w-[420px] p-0 shadow-lg' align='start'>
              {selectedFormula ? (
                <div className='flex flex-col'>
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
                    <div className='text-xs font-mono bg-muted px-2 py-1 rounded'>
                      Syntax: {selectedFormula.syntax}
                    </div>
                    <div className='text-xs font-mono bg-muted px-2 py-1 rounded'>
                      Example: {selectedFormula.example}
                    </div>
                  </div>
                  <div className='p-4 space-y-4'>
                    <div>
                      <p className='text-xs font-medium text-muted-foreground uppercase tracking-wide'>Target column</p>
                      <Command className='mt-2 border rounded-md'>
                        <CommandInput placeholder='Search columns...' className='h-8' />
                        <CommandList>
                          <CommandEmpty>No columns found.</CommandEmpty>
                          <CommandGroup heading='Columns'>
                            {(data?.headers || []).map((header) => (
                              <CommandItem
                                key={header}
                                value={header}
                                onSelect={(value) => onSelectedColumnChange(value)}
                              >
                                <span>{header}</span>
                                {selectedColumn === header && <Check className='ml-auto h-4 w-4' />}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                      <p className='text-xs mt-2'>
                        {selectedColumn ? (
                          <>Applying to <span className='font-semibold'>{selectedColumn}</span>.</>
                        ) : (
                          <span className='text-destructive'>Select a column to write the results.</span>
                        )}
                      </p>
                    </div>
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
                  Select a formula from the library to view usage guidance.
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>

        <div className='flex-1 relative'>
          <div className='relative'>
            {isFormulaMode && (
              <Sigma className='absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary z-10' />
            )}
            <Input
              value={formulaInput}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder={
                isFormulaMode
                  ? '=SUM(colA,colB), =IF(colA > 10, colB, colC), =DATE_DIFF(colEnd, colStart)'
                  : 'Enter value...'
              }
              className={`h-8 shadow-sm ${
                isFormulaMode ? 'pl-10 font-mono border-primary/50 bg-primary/5' : 'bg-background'
              } transition-all duration-200`}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onFormulaSubmit();
                }
                if (e.key === 'Escape') {
                  handleCancel();
                }
              }}
            />
          </div>
        </div>

        {isFormulaMode && (
          <Popover open={isLibraryOpen} onOpenChange={handleLibraryOpenChange}>
            <PopoverTrigger asChild>
              <Button variant='outline' size='sm' className='h-8 px-3 shadow-sm'>
                <BookOpen className='w-4 h-4 mr-1' />
                Library
              </Button>
            </PopoverTrigger>
            <PopoverContent className='w-96 p-0 shadow-lg' align='end'>
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
                <TabsList className='grid w-full grid-cols-4 gap-1 p-1 m-1'>
                  <TabsTrigger value='all' className='text-xs'>All</TabsTrigger>
                  {categoryOrder.map((category) => (
                    <TabsTrigger key={category} value={category} className='text-xs'>
                      {categoryLabels[category].label.split(' ')[0]}
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
        )}

        <div className='flex items-center space-x-1'>
          <Button
            variant='outline'
            size='sm'
            className='h-8 px-3 shadow-sm'
            onClick={onFormulaSubmit}
            disabled={!selectedColumn || !formulaInput.trim()}
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

      {isFormulaMode && (
        <div className='px-4 pb-3'>
          <ScrollArea className='w-full'>
            <div className='flex items-center space-x-3 text-xs text-muted-foreground pb-1'>
              {quickFormulaHelpers.map((helper) => (
                <span
                  key={helper.expression}
                  className='flex items-center space-x-1 cursor-pointer hover:text-foreground transition-colors'
                  onClick={() => handleQuickInsert(helper.expression)}
                >
                  <Badge variant='secondary' className='text-xs hover:bg-primary/20'>
                    {helper.label}
                  </Badge>
                  <span>{helper.description}</span>
                </span>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  );
};

export default FormularBar;
