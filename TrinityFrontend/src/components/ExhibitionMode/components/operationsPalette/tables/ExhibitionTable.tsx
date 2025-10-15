import React, { useMemo, useState } from 'react';
import {
  ContextMenu,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import { ExhibitionTableTray } from './ExhibitionTableTray';

export interface ExhibitionTableProps {
  id: string;
  headers?: string[];
  data: string[][];
  locked?: boolean;
  rows?: number;
  cols?: number;
  selectedCell?: { row: number; col: number } | null;
  onCellSelect?: (cell: { row: number; col: number }) => void;
  onUpdateCell?: (row: number, col: number, value: string) => void;
  className?: string;
  canEdit?: boolean;
  onToggleLock?: () => void;
  onDelete?: () => void;
  onDeleteColumn?: (colIndex: number) => void;
  onDelete2Columns?: (colIndex: number) => void;
  onDeleteRow?: (rowIndex: number) => void;
  onDelete2Rows?: (rowIndex: number) => void;
  onAddColumn?: () => void;
  onAdd2Columns?: () => void;
  onAddRow?: () => void;
  onAdd2Rows?: () => void;
}

const noop = () => {};

export const ExhibitionTable: React.FC<ExhibitionTableProps> = ({
  id,
  headers,
  data,
  locked = false,
  canEdit = true,
  rows,
  cols,
  selectedCell,
  onCellSelect,
  onUpdateCell,
  className,
  onToggleLock = noop,
  onDelete = noop,
  onDeleteColumn = noop,
  onDelete2Columns = noop,
  onDeleteRow = noop,
  onDelete2Rows = noop,
  onAddColumn = noop,
  onAdd2Columns = noop,
  onAddRow = noop,
  onAdd2Rows = noop,
}) => {
  const [internalSelection, setInternalSelection] = useState<{
    row: number;
    col: number;
  } | null>(null);

  const effectiveSelection = selectedCell ?? internalSelection;

  const rowCount = useMemo(() => {
    if (typeof rows === 'number') {
      return rows;
    }
    return data.length;
  }, [rows, data]);

  const colCount = useMemo(() => {
    if (typeof cols === 'number') {
      return cols;
    }
    if (Array.isArray(headers) && headers.length > 0) {
      return headers.length;
    }
    return data[0]?.length ?? 0;
  }, [cols, headers, data]);

  const tableData = useMemo(() => {
    return Array.from({ length: rowCount }, (_, rowIndex) => {
      const sourceRow = data[rowIndex] ?? [];
      return Array.from({ length: colCount }, (_, colIndex) => {
        return sourceRow[colIndex] ?? '';
      });
    });
  }, [data, rowCount, colCount]);

  const displayHeaders = useMemo(() => {
    if (headers && headers.length === colCount) {
      return headers;
    }
    if (colCount === 0) {
      return [] as string[];
    }
    return Array.from({ length: colCount }, (_, index) => `Column ${index + 1}`);
  }, [headers, colCount]);

  const handleCellSelect = (rowIndex: number, colIndex: number) => {
    const cell = { row: rowIndex, col: colIndex };
    setInternalSelection(cell);
    onCellSelect?.(cell);
  };

  const handleCellBlur = (
    rowIndex: number,
    colIndex: number,
    event: React.FocusEvent<HTMLTableCellElement>,
  ) => {
    if (locked || !canEdit) {
      return;
    }
    const value = event.currentTarget.textContent ?? '';
    onUpdateCell?.(rowIndex, colIndex, value);
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            'inline-block overflow-hidden rounded-xl border border-border bg-background shadow-sm',
            className,
          )}
        >
          <table className="min-w-[320px] border-collapse" data-table-id={id}>
            {displayHeaders.length > 0 && (
              <thead className="bg-muted/50">
                <tr>
                  {displayHeaders.map((header, headerIndex) => (
                    <th
                      key={`${id}-header-${headerIndex}`}
                      className="border border-border px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {tableData.map((rowData, rowIndex) => (
                <tr key={`${id}-row-${rowIndex}`} className="even:bg-muted/20">
                  {rowData.map((value, colIndex) => {
                    const isActive =
                      effectiveSelection?.row === rowIndex && effectiveSelection?.col === colIndex;
                    return (
                      <td
                        key={`${id}-cell-${rowIndex}-${colIndex}`}
                        className={cn(
                          'border border-border px-4 py-3 text-sm text-foreground align-middle transition-colors',
                          !locked && 'cursor-text',
                          isActive && 'bg-primary/10 outline outline-2 outline-primary/60',
                        )}
                        contentEditable={canEdit && !locked}
                        suppressContentEditableWarning
                        onFocus={() => handleCellSelect(rowIndex, colIndex)}
                        onClick={() => handleCellSelect(rowIndex, colIndex)}
                        onBlur={event => handleCellBlur(rowIndex, colIndex, event)}
                      >
                        {value}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ContextMenuTrigger>

      <ExhibitionTableTray
        locked={locked}
        canEdit={canEdit}
        rows={rowCount}
        cols={colCount}
        selectedCell={effectiveSelection}
        onToggleLock={onToggleLock}
        onDelete={onDelete}
        onDeleteColumn={() => {
          if (effectiveSelection) {
            onDeleteColumn(effectiveSelection.col);
          }
        }}
        onDelete2Columns={() => {
          if (effectiveSelection) {
            onDelete2Columns(effectiveSelection.col);
          }
        }}
        onDeleteRow={() => {
          if (effectiveSelection) {
            onDeleteRow(effectiveSelection.row);
          }
        }}
        onDelete2Rows={() => {
          if (effectiveSelection) {
            onDelete2Rows(effectiveSelection.row);
          }
        }}
        onAddColumn={onAddColumn}
        onAdd2Columns={onAdd2Columns}
        onAddRow={onAddRow}
        onAdd2Rows={onAdd2Rows}
      />
    </ContextMenu>
  );
};

export default ExhibitionTable;
