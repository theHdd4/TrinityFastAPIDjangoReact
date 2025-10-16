import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  createDefaultHeaderCell,
  createEmptyCell,
  type TableCellData,
  type TableCellFormatting,
} from './constants';
import { ExhibitionTableTray } from './ExhibitionTableTray';

export interface TableSelection {
  row: number;
  col: number;
  region?: 'header' | 'body';
}

export interface ExhibitionTableProps {
  id: string;
  headers?: TableCellData[];
  data: TableCellData[][];
  locked?: boolean;
  showOutline?: boolean;
  rows?: number;
  cols?: number;
  selectedCell?: TableSelection | null;
  onCellSelect?: (cell: TableSelection) => void;
  onUpdateCell?: (row: number, col: number, value: string) => void;
  onUpdateCellFormatting?: (row: number, col: number, updates: Partial<TableCellFormatting>) => void;
  onUpdateHeader?: (col: number, value: string) => void;
  onUpdateHeaderFormatting?: (col: number, updates: Partial<TableCellFormatting>) => void;
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

const normaliseEditableText = (rawValue: string): string => {
  if (!rawValue) {
    return '';
  }

  let value = rawValue.replace(/\u00a0/g, ' ');
  while (value.endsWith('\n')) {
    value = value.slice(0, -1);
  }

  return value;
};

const sanitiseStoredContent = (rawValue: string): string => {
  if (!rawValue) {
    return '';
  }

  let working = rawValue;
  const htmlLikePattern = /<[^>]+>/i;

  if (htmlLikePattern.test(working)) {
    working = working
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\/(div|p)>/gi, '\n')
      .replace(/<div[^>]*>/gi, '')
      .replace(/<p[^>]*>/gi, '')
      .replace(/<span[^>]*>/gi, '')
      .replace(/<\/span>/gi, '')
      .replace(/<[^>]+>/g, '');
  }

  if (/&[a-z#0-9]+;/i.test(working) && typeof window !== 'undefined') {
    const textarea = window.document.createElement('textarea');
    textarea.innerHTML = working;
    working = textarea.value;
  }

  return normaliseEditableText(working);
};

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

interface ContentEditableCellProps {
  value: string;
  formatting: TableCellFormatting;
  editable: boolean;
  onFocus: () => void;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  onInteract?: () => void;
}

const ContentEditableCell: React.FC<ContentEditableCellProps> = ({
  value,
  formatting,
  editable,
  onFocus,
  onChange,
  onCommit,
  onInteract,
}) => {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const lastValueRef = useRef<string>('');

  const setDomValue = useCallback((nextValue: string) => {
    const node = elementRef.current;
    if (!node) {
      return;
    }

    const prepared = sanitiseStoredContent(nextValue ?? '');

    if (lastValueRef.current !== prepared) {
      node.textContent = prepared;
      lastValueRef.current = prepared;
    }
  }, []);

  const readDomValue = useCallback(() => {
    const node = elementRef.current;
    if (!node) {
      return '';
    }

    const text = node.textContent ?? '';
    return normaliseEditableText(text);
  }, []);

  useEffect(() => {
    setDomValue(value ?? '');
  }, [setDomValue, value]);

  const emitChange = useCallback(() => {
    const nextValue = readDomValue();
    if (lastValueRef.current !== nextValue) {
      lastValueRef.current = nextValue;
      onChange(nextValue);
    }
  }, [onChange, readDomValue]);

  const emitCommit = useCallback(() => {
    const nextValue = readDomValue();
    if (lastValueRef.current !== nextValue) {
      lastValueRef.current = nextValue;
      onCommit(nextValue);
    }
  }, [onCommit, readDomValue]);

  const handleInput = useCallback(() => {
    if (!editable) {
      return;
    }
    onInteract?.();
    emitChange();
  }, [editable, emitChange, onInteract]);

  const handleBlur = useCallback(() => {
    if (!editable) {
      return;
    }
    emitCommit();
  }, [editable, emitCommit]);

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      if (!editable) {
        return;
      }

      event.preventDefault();
      const plainText = event.clipboardData.getData('text/plain');
      const ownerDocument = event.currentTarget.ownerDocument;
      if (plainText && ownerDocument && typeof ownerDocument.execCommand === 'function') {
        ownerDocument.execCommand('insertText', false, plainText);
      }
    },
    [editable],
  );

  return (
    <div
      ref={node => {
        elementRef.current = node;
        if (node) {
          setDomValue(value ?? '');
        }
      }}
      className="min-h-[40px] w-full px-3 py-2 text-sm focus:outline-none"
      data-exhibition-table-cell-content={editable ? 'true' : 'false'}
      style={{
        fontFamily: formatting.fontFamily,
        fontSize: `${formatting.fontSize}px`,
        color: formatting.color,
        fontWeight: formatting.bold ? 600 : 400,
        fontStyle: formatting.italic ? 'italic' : 'normal',
        textDecoration: buildTextDecoration(formatting),
        whiteSpace: 'pre-wrap',
      }}
      contentEditable={editable}
      suppressContentEditableWarning
      onFocus={onFocus}
      onInput={handleInput}
      onBlur={handleBlur}
      onPaste={handlePaste}
      spellCheck={false}
    />
  );
};

interface EditableTableCellProps {
  rowIndex: number;
  colIndex: number;
  cell: TableCellData;
  formatting: TableCellFormatting;
  isActive: boolean;
  canEdit: boolean;
  locked: boolean;
  showOutline: boolean;
  onSelect: (cell: TableSelection) => void;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  onInteract?: () => void;
}

const EditableTableCell: React.FC<EditableTableCellProps> = ({
  rowIndex,
  colIndex,
  cell,
  formatting,
  isActive,
  canEdit,
  locked,
  showOutline,
  onSelect,
  onChange,
  onCommit,
  onInteract,
}) => {
  const editable = canEdit && !locked;

  const handleSelect = useCallback(() => {
    onSelect({ row: rowIndex, col: colIndex, region: 'body' });
  }, [colIndex, onSelect, rowIndex]);

  const handleFocus = useCallback(() => {
    handleSelect();
    if (editable) {
      onInteract?.();
    }
  }, [editable, handleSelect, onInteract]);

  return (
    <td
      className={cn(
        'align-top transition-colors',
        showOutline ? 'border border-border' : 'border border-transparent',
        editable ? 'cursor-text' : 'cursor-default',
        isActive && 'bg-primary/10 outline outline-2 outline-primary/60',
      )}
      data-exhibition-table-cell={editable ? 'editable' : 'readonly'}
      style={{ textAlign: formatting.align }}
      onClick={() => {
        handleSelect();
        if (editable) {
          onInteract?.();
        }
      }}
    >
      <ContentEditableCell
        value={cell?.content ?? ''}
        formatting={formatting}
        editable={editable}
        onFocus={handleFocus}
        onChange={onChange}
        onCommit={onCommit}
        onInteract={onInteract}
      />
    </td>
  );
};

interface EditableHeaderCellProps {
  colIndex: number;
  cell: TableCellData;
  formatting: TableCellFormatting;
  isActive: boolean;
  canEdit: boolean;
  locked: boolean;
  showOutline: boolean;
  onSelect: (cell: TableSelection) => void;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  onInteract?: () => void;
}

const EditableHeaderCell: React.FC<EditableHeaderCellProps> = ({
  colIndex,
  cell,
  formatting,
  isActive,
  canEdit,
  locked,
  showOutline,
  onSelect,
  onChange,
  onCommit,
  onInteract,
}) => {
  const editable = canEdit && !locked;

  const handleSelect = useCallback(() => {
    onSelect({ row: -1, col: colIndex, region: 'header' });
  }, [colIndex, onSelect]);

  const handleFocus = useCallback(() => {
    handleSelect();
    if (editable) {
      onInteract?.();
    }
  }, [editable, handleSelect, onInteract]);

  return (
    <th
      className={cn(
        'align-middle transition-colors',
        showOutline ? 'border border-border' : 'border border-transparent',
        editable ? 'cursor-text' : 'cursor-default',
        isActive && 'bg-primary/10 outline outline-2 outline-primary/60',
      )}
      style={{ textAlign: formatting.align }}
      onClick={() => {
        handleSelect();
        if (editable) {
          onInteract?.();
        }
      }}
    >
      <ContentEditableCell
        value={cell?.content ?? ''}
        formatting={formatting}
        editable={editable}
        onFocus={handleFocus}
        onChange={onChange}
        onCommit={onCommit}
        onInteract={onInteract}
      />
    </th>
  );
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
  onUpdateHeader,
  onUpdateHeaderFormatting,
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
  const [internalSelection, setInternalSelection] = useState<TableSelection | null>(null);
  const [toolbarFormatting, setToolbarFormatting] = useState<TableCellFormatting>(DEFAULT_CELL_FORMATTING);

  const effectiveSelection = selectedCell ?? internalSelection;
  const selectionRegion = effectiveSelection
    ? effectiveSelection.region ?? (effectiveSelection.row === -1 ? 'header' : 'body')
    : null;

  useEffect(() => {
    if (selectedCell === undefined) {
      return;
    }

    if (selectedCell === null) {
      setInternalSelection(null);
      return;
    }

    setInternalSelection(selectedCell);
  }, [selectedCell]);

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
    const headerCount = Array.isArray(headers) ? headers.length : 0;
    const dataCount = data[0]?.length ?? 0;
    return Math.max(headerCount, dataCount);
  }, [cols, headers, data]);

  const tableData = useMemo(() => {
    return Array.from({ length: rowCount }, (_, rowIndex) => {
      const sourceRow = data[rowIndex] ?? [];
      return Array.from({ length: colCount }, (_, colIndex) => {
        return sourceRow[colIndex] ?? createEmptyCell();
      });
    });
  }, [data, rowCount, colCount]);

  const headerCells = useMemo(() => {
    if (colCount === 0) {
      return [] as TableCellData[];
    }

    return Array.from({ length: colCount }, (_, index) => {
      const source = headers?.[index];
      if (source) {
        return {
          content: source.content ?? '',
          formatting: source.formatting ?? createCellFormatting({ bold: true }),
          rowSpan: source.rowSpan,
          colSpan: source.colSpan,
        };
      }
      return createDefaultHeaderCell(index);
    });
  }, [headers, colCount]);

  useEffect(() => {
    if (!effectiveSelection) {
      setToolbarFormatting(DEFAULT_CELL_FORMATTING);
      return;
    }

    if (selectionRegion === 'header') {
      const header = headerCells[effectiveSelection.col];
      if (header) {
        setToolbarFormatting(header.formatting ?? DEFAULT_CELL_FORMATTING);
      } else {
        setToolbarFormatting(DEFAULT_CELL_FORMATTING);
      }
      return;
    }

    const { row, col } = effectiveSelection;
    const cell = tableData[row]?.[col];
    if (cell) {
      setToolbarFormatting(cell.formatting);
    } else {
      setToolbarFormatting(DEFAULT_CELL_FORMATTING);
    }
  }, [effectiveSelection, headerCells, selectionRegion, tableData]);

  const handleSelection = useCallback(
    (cell: TableSelection) => {
      setInternalSelection(cell);
      onCellSelect?.(cell);
    },
    [onCellSelect],
  );

  const handleBodyCellInput = useCallback(
    (rowIndex: number, colIndex: number, value: string) => {
      if (locked || !canEdit || !onUpdateCell) {
        return;
      }
      onInteract?.();
      onUpdateCell(rowIndex, colIndex, value);
    },
    [canEdit, locked, onInteract, onUpdateCell],
  );

  const handleBodyCellCommit = useCallback(
    (rowIndex: number, colIndex: number, value: string) => {
      if (locked || !canEdit || !onUpdateCell) {
        return;
      }
      onInteract?.();
      onUpdateCell(rowIndex, colIndex, value);
    },
    [canEdit, locked, onInteract, onUpdateCell],
  );

  const handleHeaderInput = useCallback(
    (colIndex: number, value: string) => {
      if (locked || !canEdit || !onUpdateHeader) {
        return;
      }
      onInteract?.();
      onUpdateHeader(colIndex, value);
    },
    [canEdit, locked, onInteract, onUpdateHeader],
  );

  const handleHeaderCommit = useCallback(
    (colIndex: number, value: string) => {
      if (locked || !canEdit || !onUpdateHeader) {
        return;
      }
      onInteract?.();
      onUpdateHeader(colIndex, value);
    },
    [canEdit, locked, onInteract, onUpdateHeader],
  );

  const applyFormatting = useCallback(
    (updates: Partial<TableCellFormatting>) => {
      if (!effectiveSelection) {
        return;
      }

      if (selectionRegion === 'header') {
        if (!onUpdateHeaderFormatting) {
          return;
        }
        onInteract?.();
        setToolbarFormatting(prev => ({ ...prev, ...updates }));
        onUpdateHeaderFormatting(effectiveSelection.col, updates);
        return;
      }
      if (!onUpdateCellFormatting) {
        return;
      }
      onInteract?.();
      setToolbarFormatting(prev => ({ ...prev, ...updates }));
      onUpdateCellFormatting(effectiveSelection.row, effectiveSelection.col, updates);
    },
    [
      effectiveSelection,
      onInteract,
      onUpdateCellFormatting,
      onUpdateHeaderFormatting,
      selectionRegion,
    ],
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
            {headerCells.length > 0 && (
              <thead className="bg-muted/40">
                <tr>
                  {headerCells.map((headerCell, headerIndex) => {
                    const headerFormatting = headerCell?.formatting ?? createCellFormatting({ bold: true });
                    const isActiveHeader =
                      selectionRegion === 'header' && effectiveSelection?.col === headerIndex;

                    return (
                      <EditableHeaderCell
                        key={`${id}-header-${headerIndex}`}
                        colIndex={headerIndex}
                        cell={headerCell}
                        formatting={headerFormatting}
                        isActive={Boolean(isActiveHeader)}
                        canEdit={canEdit}
                        locked={locked}
                        showOutline={showOutline}
                        onSelect={handleSelection}
                        onChange={value => handleHeaderInput(headerIndex, value)}
                        onCommit={value => handleHeaderCommit(headerIndex, value)}
                        onInteract={onInteract}
                      />
                    );
                  })}
                </tr>
              </thead>
            )}
            <tbody>
              {tableData.map((rowData, rowIndex) => (
                <tr key={`${id}-row-${rowIndex}`} className="even:bg-muted/20">
                  {rowData.map((cell, colIndex) => {
                    const isActive =
                      selectionRegion === 'body' &&
                      effectiveSelection?.row === rowIndex &&
                      effectiveSelection?.col === colIndex;
                    const cellFormatting = cell?.formatting ?? createCellFormatting();

                    return (
                      <EditableTableCell
                        key={`${id}-cell-${rowIndex}-${colIndex}`}
                        rowIndex={rowIndex}
                        colIndex={colIndex}
                        cell={cell}
                        formatting={cellFormatting}
                        isActive={Boolean(isActive)}
                        canEdit={canEdit}
                        locked={locked}
                        showOutline={showOutline}
                        onSelect={handleSelection}
                        onChange={value => handleBodyCellInput(rowIndex, colIndex, value)}
                        onCommit={value => handleBodyCellCommit(rowIndex, colIndex, value)}
                        onInteract={onInteract}
                      />
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
          if (effectiveSelection && effectiveSelection.col >= 0) {
            onDeleteColumn(effectiveSelection.col);
          }
        }}
        onDelete2Columns={() => {
          if (effectiveSelection && effectiveSelection.col >= 0) {
            onDelete2Columns(effectiveSelection.col);
          }
        }}
        onDeleteRow={() => {
          if (effectiveSelection && selectionRegion === 'body' && effectiveSelection.row >= 0) {
            onDeleteRow(effectiveSelection.row);
          }
        }}
        onDelete2Rows={() => {
          if (effectiveSelection && selectionRegion === 'body' && effectiveSelection.row >= 0) {
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
