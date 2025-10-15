import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ContextMenu,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { cn } from '@/lib/utils';
import TextBoxToolbar from '../textBox/TextBoxToolbar';
import type { TextAlignOption } from '../textBox/types';
import {
  DEFAULT_CELL_FORMATTING,
  createCellFormatting,
  createEmptyCell,
  type TableCellData,
  type TableCellFormatting,
} from './constants';
import { ExhibitionTableTray } from './ExhibitionTableTray';

export interface ExhibitionTableProps {
  id: string;
  headers?: string[];
  data: TableCellData[][];
  locked?: boolean;
  showOutline?: boolean;
  rows?: number;
  cols?: number;
  selectedCell?: { row: number; col: number } | null;
  onCellSelect?: (cell: { row: number; col: number }) => void;
  onUpdateCell?: (row: number, col: number, value: string) => void;
  onUpdateCellFormatting?: (row: number, col: number, updates: Partial<TableCellFormatting>) => void;
  className?: string;
  canEdit?: boolean;
  onToggleLock?: () => void;
  onToggleOutline?: () => void;
  onDelete?: () => void;
  onDeleteColumn?: (colIndex: number) => void;
  onDelete2Columns?: (colIndex: number) => void;
  onDeleteRow?: (rowIndex: number) => void;
  onDelete2Rows?: (rowIndex: number) => void;
  onAddColumn?: () => void;
  onAdd2Columns?: () => void;
  onAddRow?: () => void;
  onAdd2Rows?: () => void;
  onToolbarStateChange?: (toolbar: React.ReactNode | null) => void;
  onInteract?: () => void;
}

const noop = () => {};

const clampFontSize = (value: number) => Math.min(Math.max(value, 8), 200);

const buildTextDecoration = (formatting: TableCellFormatting) => {
  if (formatting.underline && formatting.strikethrough) {
    return 'underline line-through';
  }
  if (formatting.underline) {
    return 'underline';
  }
  if (formatting.strikethrough) {
    return 'line-through';
  }
  return 'none';
};

export const ExhibitionTable: React.FC<ExhibitionTableProps> = ({
  id,
  headers,
  data,
  locked = false,
  showOutline = true,
  canEdit = true,
  rows,
  cols,
  selectedCell,
  onCellSelect,
  onUpdateCell,
  onUpdateCellFormatting,
  className,
  onToggleLock = noop,
  onToggleOutline = noop,
  onDelete = noop,
  onDeleteColumn = noop,
  onDelete2Columns = noop,
  onDeleteRow = noop,
  onDelete2Rows = noop,
  onAddColumn = noop,
  onAdd2Columns = noop,
  onAddRow = noop,
  onAdd2Rows = noop,
  onToolbarStateChange,
  onInteract,
}) => {
  const [internalSelection, setInternalSelection] = useState<{ row: number; col: number } | null>(null);
  const [toolbarFormatting, setToolbarFormatting] = useState<TableCellFormatting>(DEFAULT_CELL_FORMATTING);

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
        return sourceRow[colIndex] ?? createEmptyCell();
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

  useEffect(() => {
    if (!effectiveSelection) {
      setToolbarFormatting(DEFAULT_CELL_FORMATTING);
      return;
    }

    const { row, col } = effectiveSelection;
    const cell = tableData[row]?.[col];
    if (cell) {
      setToolbarFormatting(cell.formatting);
    } else {
      setToolbarFormatting(DEFAULT_CELL_FORMATTING);
    }
  }, [effectiveSelection, tableData]);

  const handleCellSelect = useCallback(
    (rowIndex: number, colIndex: number) => {
      const cell = { row: rowIndex, col: colIndex };
      setInternalSelection(cell);
      onCellSelect?.(cell);
    },
    [onCellSelect],
  );

  const handleCellInput = useCallback(
    (rowIndex: number, colIndex: number, event: React.FormEvent<HTMLDivElement>) => {
      if (locked || !canEdit) {
        return;
      }
      onInteract?.();
      const value = event.currentTarget.innerHTML ?? '';
      onUpdateCell?.(rowIndex, colIndex, value);
    },
    [canEdit, locked, onInteract, onUpdateCell],
  );

  const handleCellBlur = useCallback(
    (rowIndex: number, colIndex: number, event: React.FocusEvent<HTMLDivElement>) => {
      if (locked || !canEdit) {
        return;
      }
      onInteract?.();
      const value = event.currentTarget.innerHTML ?? '';
      onUpdateCell?.(rowIndex, colIndex, value);
    },
    [canEdit, locked, onInteract, onUpdateCell],
  );

  const applyFormatting = useCallback(
    (updates: Partial<TableCellFormatting>) => {
      if (!effectiveSelection || !onUpdateCellFormatting) {
        return;
      }
      onInteract?.();
      setToolbarFormatting(prev => ({ ...prev, ...updates }));
      onUpdateCellFormatting(effectiveSelection.row, effectiveSelection.col, updates);
    },
    [effectiveSelection, onInteract, onUpdateCellFormatting],
  );

  const handleAlign = useCallback(
    (align: TextAlignOption) => {
      applyFormatting({ align });
    },
    [applyFormatting],
  );

  const handleFontFamily = useCallback(
    (fontFamily: string) => {
      applyFormatting({ fontFamily });
    },
    [applyFormatting],
  );

  const handleColor = useCallback(
    (color: string) => {
      applyFormatting({ color });
    },
    [applyFormatting],
  );

  const handleIncreaseFontSize = useCallback(() => {
    applyFormatting({ fontSize: clampFontSize(toolbarFormatting.fontSize + 2) });
  }, [applyFormatting, toolbarFormatting.fontSize]);

  const handleDecreaseFontSize = useCallback(() => {
    applyFormatting({ fontSize: clampFontSize(toolbarFormatting.fontSize - 2) });
  }, [applyFormatting, toolbarFormatting.fontSize]);

  const handleToggle = useCallback(
    (key: keyof Pick<TableCellFormatting, 'bold' | 'italic' | 'underline' | 'strikethrough'>) => {
      applyFormatting({ [key]: !toolbarFormatting[key] } as Partial<TableCellFormatting>);
    },
    [applyFormatting, toolbarFormatting],
  );

  const toolbarNode = useMemo(() => {
    if (!canEdit || locked || !effectiveSelection) {
      return null;
    }

    return (
      <TextBoxToolbar
        fontFamily={toolbarFormatting.fontFamily}
        onFontFamilyChange={handleFontFamily}
        fontSize={toolbarFormatting.fontSize}
        onIncreaseFontSize={handleIncreaseFontSize}
        onDecreaseFontSize={handleDecreaseFontSize}
        bold={toolbarFormatting.bold}
        italic={toolbarFormatting.italic}
        underline={toolbarFormatting.underline}
        strikethrough={toolbarFormatting.strikethrough}
        onToggleBold={() => handleToggle('bold')}
        onToggleItalic={() => handleToggle('italic')}
        onToggleUnderline={() => handleToggle('underline')}
        onToggleStrikethrough={() => handleToggle('strikethrough')}
        align={toolbarFormatting.align}
        onAlign={handleAlign}
        color={toolbarFormatting.color}
        onColorChange={handleColor}
        onDelete={canEdit ? onDelete : undefined}
      />
    );
  }, [
    applyFormatting,
    canEdit,
    effectiveSelection,
    handleAlign,
    handleColor,
    handleDecreaseFontSize,
    handleFontFamily,
    handleIncreaseFontSize,
    handleToggle,
    locked,
    onDelete,
    toolbarFormatting,
  ]);

  useEffect(() => {
    onToolbarStateChange?.(toolbarNode);

    return () => {
      if (toolbarNode) {
        onToolbarStateChange?.(null);
      }
    };
  }, [toolbarNode, onToolbarStateChange]);

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            'h-full w-full overflow-hidden',
            className,
          )}
        >
          <table
            className={cn(
              'h-full w-full table-fixed border-collapse',
              showOutline ? 'border border-border' : 'border border-transparent',
            )}
            data-table-id={id}
          >
            {displayHeaders.length > 0 && (
              <thead className="bg-muted/40">
                <tr>
                  {displayHeaders.map((header, headerIndex) => (
                    <th
                      key={`${id}-header-${headerIndex}`}
                      className={cn(
                        'px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground',
                        showOutline ? 'border border-border' : 'border border-transparent',
                      )}
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
                  {rowData.map((cell, colIndex) => {
                    const isActive =
                      effectiveSelection?.row === rowIndex && effectiveSelection?.col === colIndex;
                    const cellFormatting = cell?.formatting ?? createCellFormatting();

                    return (
                      <td
                        key={`${id}-cell-${rowIndex}-${colIndex}`}
                        className={cn(
                          'align-top transition-colors',
                          showOutline ? 'border border-border' : 'border border-transparent',
                          !locked && canEdit ? 'cursor-text' : 'cursor-default',
                          isActive && 'bg-primary/10 outline outline-2 outline-primary/60',
                        )}
                        style={{ textAlign: cellFormatting.align }}
                        onClick={() => {
                          handleCellSelect(rowIndex, colIndex);
                          if (!locked && canEdit) {
                            onInteract?.();
                          }
                        }}
                      >
                        <div
                          className="min-h-[40px] w-full px-3 py-2 text-sm focus:outline-none"
                          style={{
                            fontFamily: cellFormatting.fontFamily,
                            fontSize: `${cellFormatting.fontSize}px`,
                            color: cellFormatting.color,
                            fontWeight: cellFormatting.bold ? 600 : 400,
                            fontStyle: cellFormatting.italic ? 'italic' : 'normal',
                            textDecoration: buildTextDecoration(cellFormatting),
                          }}
                          contentEditable={canEdit && !locked}
                          suppressContentEditableWarning
                          onFocus={() => handleCellSelect(rowIndex, colIndex)}
                          onBlur={event => handleCellBlur(rowIndex, colIndex, event)}
                          onInput={event => handleCellInput(rowIndex, colIndex, event)}
                          dangerouslySetInnerHTML={{ __html: cell?.content ?? '' }}
                        />
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
        showOutline={showOutline}
        selectedCell={effectiveSelection}
        onToggleLock={onToggleLock}
        onToggleOutline={onToggleOutline}
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
