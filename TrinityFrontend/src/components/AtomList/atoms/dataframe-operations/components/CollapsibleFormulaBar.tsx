import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
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

const columnIndexToLetter = (index: number): string => {
  if (index < 0) return '';
  let letter = '';
  let current = index;
  while (current >= 0) {
    letter = String.fromCharCode((current % 26) + 65) + letter;
    current = Math.floor(current / 26) - 1;
  }
  return letter;
};

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

  const { cellAddress, cellValue } = useMemo(() => {
    if (selectedCell && data?.headers) {
      const colIdx = data.headers.indexOf(selectedCell.col);
      if (colIdx >= 0) {
        const address = `${columnIndexToLetter(colIdx)}${selectedCell.row + 1}`;
        const value = data.rows[selectedCell.row]?.[selectedCell.col];
        return { cellAddress: address, cellValue: value };
      }
    }
    return { cellAddress: null, cellValue: null };
  }, [data?.headers, data?.rows, selectedCell]);

  const contextLabel = useMemo(() => {
    if (cellAddress) {
      return `Cell: ${cellAddress}`;
    }
    if (selectedColumn) {
      return `Column: ${selectedColumn}`;
    }
    return 'No selection';
  }, [cellAddress, selectedColumn]);

  return (
    <div className="w-full">
      <div
        className={`flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 transition-colors ${
          collapsed ? 'bg-white' : 'bg-blue-50/60'
        }`}
      >
        <button
          type="button"
          onClick={() => setCollapsed(prev => !prev)}
          className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-white px-2 py-1 text-sm font-semibold text-blue-700 shadow-sm transition-colors hover:border-blue-300 hover:text-blue-800"
          title={collapsed ? 'Show formula bar' : 'Hide formula bar'}
        >
          {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          fx
        </button>
        <div className="flex flex-1 items-center">
          <span className="truncate text-xs font-medium text-slate-600">
            {contextLabel}
            {cellAddress && cellValue !== null && cellValue !== undefined && (
              <span className="ml-2 text-[11px] text-slate-500">→ {String(cellValue)}</span>
            )}
          </span>
        </div>
      </div>

      {!collapsed && (
        <div className="mt-3">
          <div className="relative">
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
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80">
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
                  <span>Processing formula...</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CollapsibleFormulaBar;

