import React, { useState, useRef } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import '@/templates/tables/table.css';
import { editTableCell } from '../services/tableApi';

interface BlankTableCanvasProps {
  atomId: string;
  tableId: string;
  rows: number;
  columns: number;
  columnNames: string[];
  settings: any;
}

const BlankTableCanvas: React.FC<BlankTableCanvasProps> = ({
  atomId,
  tableId,
  rows,
  columns,
  columnNames,
  settings
}) => {
  const [editingCell, setEditingCell] = useState<{row: number, col: string} | null>(null);
  const [cellValues, setCellValues] = useState<Record<string, Record<string, any>>>({});
  const editInputRef = useRef<HTMLInputElement>(null);

  // Get cell value
  const getCellValue = (rowIdx: number, colName: string) => {
    return cellValues[rowIdx]?.[colName] ?? '';
  };

  // Handle cell edit
  const handleCellEdit = async (rowIdx: number, column: string, newValue: string) => {
    console.log(`✏️ [BLANK-TABLE] Editing cell [${rowIdx}, ${column}] = "${newValue}"`);

    try {
      // Update local state immediately for responsiveness
      setCellValues(prev => ({
        ...prev,
        [rowIdx]: {
          ...(prev[rowIdx] || {}),
          [column]: newValue
        }
      }));

      // Call backend to update session
      await editTableCell(tableId, rowIdx, column, newValue);
      console.log('✅ [BLANK-TABLE] Cell updated');

    } catch (error) {
      console.error('❌ [BLANK-TABLE] Edit failed:', error);
      alert('Failed to update cell');
    } finally {
      setEditingCell(null);
    }
  };

  const handleCellClick = (rowIdx: number, colName: string) => {
    setEditingCell({ row: rowIdx, col: colName });
  };

  const handleKeyDown = (e: React.KeyboardEvent, rowIdx: number, colName: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const newValue = (e.target as HTMLInputElement).value;
      handleCellEdit(rowIdx, colName, newValue);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    } else if (e.key === 'Tab') {
      // Allow default tab behavior for now
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>, rowIdx: number, colName: string) => {
    const newValue = e.target.value;
    const currentValue = getCellValue(rowIdx, colName);
    
    if (newValue !== currentValue) {
      handleCellEdit(rowIdx, colName, newValue);
    } else {
      setEditingCell(null);
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="table-wrapper">
        <div className="table-overflow">
          <Table className="table-base">
            {/* No header row, no row numbers - just cells */}
            <TableBody>
              {Array.from({ length: rows }, (_, rowIdx) => (
                <TableRow key={rowIdx} className="table-row">
                  {/* Data cells - plain white, editable on click, no column headers */}
                  {Array.from({ length: columns }, (_, colIdx) => {
                    const colName = columnNames[colIdx] || `Column${colIdx + 1}`;
                    const isEditing = editingCell?.row === rowIdx && editingCell?.col === colName;
                    const value = getCellValue(rowIdx, colName);

                    return (
                      <TableCell
                        key={colIdx}
                        className="table-cell border border-gray-200 cursor-pointer"
                        style={{ backgroundColor: 'white' }}
                        onClick={() => !isEditing && handleCellClick(rowIdx, colName)}
                      >
                        {isEditing ? (
                          <input
                            ref={editInputRef}
                            type="text"
                            autoFocus
                            defaultValue={value}
                            onBlur={(e) => handleBlur(e, rowIdx, colName)}
                            onKeyDown={(e) => handleKeyDown(e, rowIdx, colName)}
                            className="w-full px-2 py-1 border border-teal-400 rounded focus:outline-none focus:ring-2 focus:ring-teal-500"
                            onClick={(e) => e.stopPropagation()}
                          />
                        ) : (
                          <div className="table-cell-content">
                            {value || ''}
                          </div>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Info footer */}
      <div className="sticky bottom-0 px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-600">
        Blank Table: {rows} rows × {columns} columns • Click any cell to edit
      </div>
    </div>
  );
};

export default BlankTableCanvas;


