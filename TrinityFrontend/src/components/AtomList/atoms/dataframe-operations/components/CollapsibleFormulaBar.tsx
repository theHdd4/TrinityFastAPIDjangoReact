import React, { useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import FormularBar from './FormularBar';
import { DataFrameData } from '../DataFrameOperationsAtom';

interface CollapsibleFormulaBarProps {
  data: DataFrameData | null;
  selectedCell: { row: number; col: string } | null;
  selectedColumn: string | null;
  formulaInput: string;
  isFormulaMode: boolean;
  isFormulaBarFrozen: boolean;
  formulaValidationError: string | null;
  columnFormulas: Record<string, string>;
  isEditingFormula: boolean;
  onSelectedCellChange: (cell: { row: number; col: string } | null) => void;
  onSelectedColumnChange: (col: string | null) => void;
  onFormulaInputChange: (value: string) => void;
  onFormulaModeChange: (mode: boolean) => void;
  onEditingStateChange: (editing: boolean) => void;
  onFormulaSubmit: () => void;
  onValidationError: (error: string | null) => void;
  formulaLoading?: boolean;
}

const CollapsibleFormulaBar: React.FC<CollapsibleFormulaBarProps> = ({
  data,
  selectedCell,
  selectedColumn,
  formulaInput,
  isFormulaMode,
  isEditingFormula,
  columnFormulas,
  isFormulaBarFrozen,
  formulaValidationError,
  onSelectedCellChange,
  onSelectedColumnChange,
  onFormulaInputChange,
  onFormulaModeChange,
  onEditingStateChange,
  onFormulaSubmit,
  onValidationError,
  formulaLoading = false,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const hasSelection = Boolean(selectedCell || selectedColumn);
  const selectionLabel = selectedCell
    ? `${selectedCell.col} · #${selectedCell.row + 1}`
    : selectedColumn
      ? `Column: ${selectedColumn}`
      : 'No selection';

  const handleSelectionClick = () => {
    if (!hasSelection) return;
    setCollapsed(false);
    onFormulaModeChange(true);
    onEditingStateChange(true);
  };

  return (
    <div className={`w-full flex items-center gap-3 ${collapsed ? 'pb-2' : 'pb-3'}`}>
      <button
        type="button"
        onClick={handleSelectionClick}
        className={`flex flex-col leading-tight text-left rounded-lg px-3 py-1.5 border shadow-sm transition-colors min-w-[160px] ${
          hasSelection
            ? 'bg-primary/10 border-primary/20 text-primary hover:bg-primary/15'
            : 'bg-muted border-muted-foreground/20 text-muted-foreground cursor-not-allowed'
        }`}
      >
        <span className="text-[10px] uppercase tracking-wide text-current/80">Selection</span>
        <span className="text-xs font-semibold truncate">{selectionLabel}</span>
      </button>

      <button
        type="button"
        onClick={() => setCollapsed(prev => !prev)}
        className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-white px-3 py-1.5 text-sm font-semibold text-blue-700 shadow-sm transition-colors hover:border-blue-300 hover:text-blue-800"
        title={collapsed ? 'Show formula bar' : 'Hide formula bar'}
      >
        {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        fx
      </button>

      <div className="flex-1 min-w-0">
        <div
          className={`relative min-h-[70px] flex items-center transition-opacity duration-200 ${
            collapsed ? 'opacity-0 pointer-events-none select-none' : 'opacity-100'
          }`}
        >
          <FormularBar
            data={data}
            selectedCell={selectedCell}
            selectedColumn={selectedColumn}
            columnFormulas={columnFormulas}
            formulaInput={formulaInput}
            isFormulaMode={isFormulaMode}
            isEditingFormula={isEditingFormula}
            isFormulaBarFrozen={isFormulaBarFrozen}
            formulaValidationError={formulaValidationError}
            onSelectedCellChange={onSelectedCellChange}
            onSelectedColumnChange={onSelectedColumnChange}
            onEditingStateChange={onEditingStateChange}
            onFormulaInputChange={onFormulaInputChange}
            onFormulaModeChange={onFormulaModeChange}
            onFormulaSubmit={onFormulaSubmit}
            onValidationError={onValidationError}
          />
          {formulaLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
                <span>Processing formula...</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CollapsibleFormulaBar;

