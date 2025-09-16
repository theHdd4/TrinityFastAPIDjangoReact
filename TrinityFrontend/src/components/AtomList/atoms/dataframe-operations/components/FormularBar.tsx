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

  const formulaSuggestions = [
    { example: 'SUM(colA,colB)', description: 'Sum columns' },
    { example: 'AVG(colA,colB)', description: 'Average columns' },
    { example: 'MEAN(colA,colB,colC)', description: 'Mean of row values' },
    { example: 'PROD(colA,colB)', description: 'Product' },
    { example: 'DIV(colA,colB)', description: 'Division' },
    { example: 'MAX(colA,colB)', description: 'Max value' },
    { example: 'MIN(colA,colB)', description: 'Min value' },
    { example: 'CORR(colA,colB)', description: 'Correlation' },
    { example: 'IF(colA > 10, colB, colC)', description: 'If colA > 10 then colB else colC' },
    { example: 'IF(colA == "M", 1, 0)', description: 'Convert categorical to numeric' },
    { example: 'IF(colA > colB, "High", "Low")', description: 'Tag based on condition' },
    { example: 'IF(colA > 90, "High", IF(colA > 70, "Medium", "Low"))', description: 'Nested binning' },
    { example: 'LOWER(colA)', description: 'Convert to lowercase' },
    { example: 'UPPER(colA)', description: 'Convert to uppercase' },
    { example: 'LEN(colA)', description: 'Length of text' },
    { example: 'colA + colB', description: 'Concatenate or add values' },
    { example: 'SUBSTR(colA, 0, 5)', description: 'Substring from index 0 to 5' },
    { example: 'STR_REPLACE(colA, "old", "new")', description: 'Replace text' },
    { example: 'YEAR(colDate)', description: 'Extract year from date' },
    { example: 'MONTH(colDate)', description: 'Extract month from date' },
    { example: 'DAY(colDate)', description: 'Extract day from date' },
    { example: 'WEEKDAY(colDate)', description: 'Get day of week' },
    { example: 'DATE_DIFF(colEnd, colStart)', description: 'Difference between two dates' },
    { example: 'ABS(colA)', description: 'Absolute value' },
    { example: 'ROUND(colA, 2)', description: 'Round to 2 decimals' },
    { example: 'FLOOR(colA)', description: 'Floor function' },
    { example: 'CEIL(colA)', description: 'Ceiling function' },
    { example: 'EXP(colA)', description: 'Exponential' },
    { example: 'LOG(colA)', description: 'Natural logarithm' },
    { example: 'SQRT(colA)', description: 'Square root' },
    { example: 'colA ** 2', description: 'Power of 2' },
    { example: 'BIN(colA, [0, 50, 100])', description: 'Custom binning' },
    { example: 'MAP(colA, {"M": "Male", "F": "Female"})', description: 'Category mapping' },
    { example: 'IF(ISNULL(colA), 0, colA)', description: 'Fill nulls via IF' },
    { example: 'FILLNA(colA, 0)', description: 'Shortcut to fill nulls' }
  ];

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
                  ? "=SUM(colA,colB), =AVG(colA,colB), =PROD(colA,colB)..."
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
        <div className="px-4 pb-2">
          <div className="flex items-center flex-wrap gap-4 text-xs text-muted-foreground">
            {formulaSuggestions.map((f) => (
              <span
                key={f.example}
                className="flex items-center space-x-1 cursor-pointer"
                onClick={() => onFormulaInputChange(`=${f.example}`)}
              >
                <Badge variant="secondary" className="text-xs">{f.example}</Badge>
                <span>{f.description}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default FormularBar;

