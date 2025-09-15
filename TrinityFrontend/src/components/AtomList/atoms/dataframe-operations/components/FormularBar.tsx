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
            title={isFormulaMode ? "Exit Formula Mode" : "Enter Formula Mode"}
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
              placeholder={isFormulaMode ? "=SUM(colA,colB), =AVG(colA,colB), =colA+colB..." : "Enter value..."}
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
          <div className="flex items-center space-x-4 text-xs text-muted-foreground">
            <span className="flex items-center space-x-1">
              <Badge variant="secondary" className="text-xs">SUM(colA,colB)</Badge>
              <span>Sum columns</span>
            </span>
            <span className="flex items-center space-x-1">
              <Badge variant="secondary" className="text-xs">AVG(colA,colB)</Badge>
              <span>Average columns</span>
            </span>
            <span className="flex items-center space-x-1">
              <Badge variant="secondary" className="text-xs">CORR(colA,colB)</Badge>
              <span>Correlation</span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default FormularBar;
