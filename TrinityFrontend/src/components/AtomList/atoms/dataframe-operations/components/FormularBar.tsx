import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Calculator, Sigma, Hash, Check, X } from 'lucide-react';
import { DataFrameData } from '../DataFrameOperationsAtom';

interface FormularBarProps {
  data: DataFrameData | null;
  selectedColumn: string | null;
  formulaInput: string;
  isFormulaMode: boolean;
  onSelectedColumnChange: (col: string | null) => void;
  onFormulaInputChange: (value: string) => void;
  onFormulaModeChange: (mode: boolean) => void;
  onFormulaSubmit: () => void;
}

const FormularBar: React.FC<FormularBarProps> = ({
  data,
  selectedColumn,
  formulaInput,
  isFormulaMode,
  onSelectedColumnChange,
  onFormulaInputChange,
  onFormulaModeChange,
  onFormulaSubmit
}) => {
  const handleCancel = () => {
    onSelectedColumnChange(null);
    onFormulaInputChange('');
    onFormulaModeChange(false);
  };

  const columnTypes = data?.columnTypes ?? {};
  const headers = data?.headers ?? [];
  const selectedType = selectedColumn ? columnTypes[selectedColumn] : undefined;

  const appendUnique = (list: string[], value?: string) => {
    if (value && !list.includes(value)) {
      list.push(value);
    }
  };

  const buildPool = (preferred: string[], fallback: string[], includeSelected: boolean) => {
    const pool: string[] = [];
    if (includeSelected && selectedColumn) {
      appendUnique(pool, selectedColumn);
    }
    preferred.forEach(col => appendUnique(pool, col));
    if (!pool.length) {
      headers.forEach(col => appendUnique(pool, col));
    }
    fallback.forEach(col => appendUnique(pool, col));
    return pool;
  };

  const numericPreferred = headers.filter(h => columnTypes[h] === 'number');
  const textPreferred = headers.filter(h => columnTypes[h] === 'text');
  const datePreferred = headers.filter(h => columnTypes[h] === 'date');

  const includeNumeric = Boolean(selectedColumn && (selectedType === 'number' || selectedType === undefined));
  const includeText = Boolean(selectedColumn && (selectedType === 'text' || selectedType === undefined));
  const includeDate = Boolean(selectedColumn && selectedType === 'date');

  const numericPool = buildPool(numericPreferred, ['columnA', 'columnB', 'columnC', 'columnD'], includeNumeric);
  const textPool = buildPool(textPreferred, ['textColumn', 'categoryColumn'], includeText);
  const datePool = buildPool(datePreferred, ['dateColumn', 'dateColumn2'], includeDate);
  const anyPool = buildPool(headers, ['columnA', 'columnB', 'columnC'], Boolean(selectedColumn));

  const fromPool = (pool: string[], index: number) => {
    if (!pool.length) return '';
    return pool[index] ?? pool[pool.length - 1];
  };

  const numA = fromPool(numericPool, 0);
  const numB = fromPool(numericPool, 1);
  const numC = fromPool(numericPool, 2);
  const textA = fromPool(textPool, 0);
  const textB = fromPool(textPool, 1);
  const dateA = fromPool(datePool, 0);
  const dateB = fromPool(datePool, 1);
  const anyA = fromPool(anyPool, 0);

  const formulaSuggestions = [
    { example: `SUM(${numA}, ${numB})`, description: 'Sum columns' },
    { example: `AVG(${numA}, ${numB})`, description: 'Average columns' },
    { example: `MEAN(${numA}, ${numB}, ${numC})`, description: 'Row mean' },
    { example: `CORR(${numA}, ${numB})`, description: 'Correlation across columns' },
    { example: `PROD(${numA}, ${numB})`, description: 'Product of values' },
    { example: `DIV(${numA}, ${numB})`, description: 'Sequential division' },
    { example: `MAX(${numA}, ${numB})`, description: 'Maximum value' },
    { example: `MIN(${numA}, ${numB})`, description: 'Minimum value' },
    { example: `IF(${numA} > 10, ${numB}, ${numC})`, description: 'Conditional value' },
    { example: `IF(${textA} == "M", 1, 0)`, description: 'Convert categories to numeric' },
    { example: `IF(${numA} > ${numB}, "High", "Low")`, description: 'Tag based on comparison' },
    { example: `IF(${numA} > 90, "High", IF(${numA} > 70, "Medium", "Low"))`, description: 'Nested binning' },
    { example: `LOWER(${textA})`, description: 'Convert to lowercase' },
    { example: `UPPER(${textA})`, description: 'Convert to uppercase' },
    { example: `LEN(${textA})`, description: 'Length of text' },
    { example: `${textA} + ${textB}`, description: 'Concatenate values' },
    { example: `SUBSTR(${textA}, 0, 5)`, description: 'Substring from index 0 to 5' },
    { example: `STR_REPLACE(${textA}, "old", "new")`, description: 'Replace text values' },
    { example: `MAP(${textA}, {"M": "Male", "F": "Female"})`, description: 'Category mapping' },
    { example: `BIN(${numA}, [0, 50, 100])`, description: 'Custom binning' },
    { example: `YEAR(${dateA})`, description: 'Extract year' },
    { example: `MONTH(${dateA})`, description: 'Extract month' },
    { example: `DAY(${dateA})`, description: 'Extract day' },
    { example: `WEEKDAY(${dateA})`, description: 'Day of week' },
    { example: `DATE_DIFF(${dateA}, ${dateB})`, description: 'Difference between dates' },
    { example: `ABS(${numA})`, description: 'Absolute value' },
    { example: `ROUND(${numA}, 2)`, description: 'Round to 2 decimals' },
    { example: `FLOOR(${numA})`, description: 'Floor function' },
    { example: `CEIL(${numA})`, description: 'Ceiling function' },
    { example: `EXP(${numA})`, description: 'Exponential' },
    { example: `LOG(${numA})`, description: 'Natural logarithm' },
    { example: `SQRT(${numA})`, description: 'Square root' },
    { example: `${numA} ** 2`, description: 'Power of 2' },
    { example: `IF(ISNULL(${anyA}), 0, ${anyA})`, description: 'Fill nulls with zero' },
    { example: `FILLNA(${anyA}, 0)`, description: 'Shortcut to fill nulls' }
  ];

  const placeholderExample = `=SUM(${numA}, ${numB}), =IF(${numA} > 10, ${numB}, ${numC}), =LOWER(${textA})`;

  return (
    <div className="flex-shrink-0 border-b border-border bg-gradient-to-r from-card via-card/95 to-card">
      <div className="flex items-center h-12 px-4 space-x-3">
        {/* Column Reference Display */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1 bg-primary/10 rounded-md px-3 py-1.5 border border-primary/20">
            <Hash className="w-4 h-4 text-primary" />
            <span className="text-sm font-mono font-semibold text-primary min-w-[60px]">
              {selectedColumn ?? 'Select Column'}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onFormulaModeChange(!isFormulaMode)}
            title="Show Formulas"
          >
            <Calculator className={`w-4 h-4 ${isFormulaMode ? 'text-primary' : 'text-muted-foreground'}`} />
          </Button>
        </div>

        {/* Formula Input */}
        <div className="flex-1 relative">
          <div className="relative">
            {isFormulaMode && (
              <Sigma className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-primary z-10" />
            )}
            <Input
              value={formulaInput}
              onChange={(e) => onFormulaInputChange(e.target.value)}
              placeholder={
                isFormulaMode
                  ? placeholderExample
                  : "Enter value..."
              }
              className={`h-8 ${isFormulaMode ? 'pl-10 font-mono border-primary/50 bg-primary/5' : 'bg-background'} transition-all duration-200`}
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

        {/* Action Buttons */}
        <div className="flex items-center space-x-1">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3"
            onClick={onFormulaSubmit}
            disabled={!selectedColumn}
          >
            <Check className="w-4 h-4 mr-1" />
            Apply
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-3"
            onClick={handleCancel}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Formula Helper */}
      {isFormulaMode && (
        <div className="px-4 pb-3">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3 text-xs text-muted-foreground">
            {formulaSuggestions.map((f) => (
              <button
                key={f.example}
                type="button"
                className="flex items-center space-x-2 rounded-md border border-dashed border-muted-foreground/40 px-2 py-1 text-left transition hover:border-primary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                onClick={() => onFormulaInputChange(`=${f.example}`)}
              >
                <Badge variant="secondary" className="text-[10px] font-mono uppercase tracking-wide">
                  {f.example}
                </Badge>
                <span className="flex-1 leading-snug">{f.description}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FormularBar;

