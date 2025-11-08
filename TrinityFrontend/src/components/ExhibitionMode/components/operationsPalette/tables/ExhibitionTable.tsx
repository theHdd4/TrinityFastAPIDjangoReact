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
  getTableStyleById,
  type TableCellData,
  type TableCellFormatting,
  type TableSelection,
  type TableSelectionPoint,
  type TableStyleDefinition,
  DEFAULT_TABLE_STYLE_ID,
  DEFAULT_TABLE_COLUMN_WIDTH,
  MIN_TABLE_COLUMN_WIDTH,
  MAX_TABLE_COLUMN_WIDTH,
} from './constants';
import { ExhibitionTableTray } from './ExhibitionTableTray';

export interface ExhibitionTableProps {
  id: string;
  headers?: TableCellData[];
  data: TableCellData[][];
  locked?: boolean;
  showOutline?: boolean;
  rows?: number;
  cols?: number;
  columnWidths?: number[];
  selectedCell?: TableSelection | null;
  onCellSelect?: (selection: TableSelection | null) => void;
  onUpdateCell?: (row: number, col: number, value: string) => void;
  onUpdateCellFormatting?: (row: number, col: number, updates: Partial<TableCellFormatting>) => void;
  onUpdateHeader?: (col: number, value: string) => void;
  onUpdateHeaderFormatting?: (col: number, updates: Partial<TableCellFormatting>) => void;
  className?: string;
  canEdit?: boolean;
  styleId?: string;
  isSelected?: boolean;
  onToggleLock?: () => void;
  onToggleOutline?: () => void;
  onDelete?: () => void;
  onDeleteColumn?: (startIndex: number, count: number) => void;
  onDelete2Columns?: (startIndex: number, count: number) => void;
  onDeleteRow?: (startIndex: number, count: number) => void;
  onDelete2Rows?: (startIndex: number, count: number) => void;
  onAddColumn?: () => void;
  onAdd2Columns?: () => void;
  onAddRow?: () => void;
  onAdd2Rows?: () => void;
  onToolbarStateChange?: (toolbar: React.ReactNode | null) => void;
  onInteract?: () => void;
  onStyleChange?: (styleId: string) => void;
  onUpdateColumnWidth?: (colIndex: number, width: number) => void;
  onBringToFront?: () => void;
  onBringForward?: () => void;
  onSendBackward?: () => void;
  onSendToBack?: () => void;
  onBeginCellTextEdit?: (target: TableCellEditTarget) => void;
  onEndCellTextEdit?: (target: TableCellEditTarget) => void;
  editingCell?: TableCellEditTarget | null;
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

const LIST_LINE_SEPARATOR = /\r?\n/;
const BULLET_PATTERN = /^\s*[•-]\s+/;
const NUMBERED_PATTERN = /^\s*\d+[.)]?\s+/;

const stripListPrefix = (line: string): string => {
  if (BULLET_PATTERN.test(line)) {
    return line.replace(BULLET_PATTERN, '');
  }
  if (NUMBERED_PATTERN.test(line)) {
    return line.replace(NUMBERED_PATTERN, '');
  }
  return line;
};

const clampColumnWidthValue = (value: number | undefined): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_TABLE_COLUMN_WIDTH;
  }

  const rounded = Math.round(value!);
  if (!Number.isFinite(rounded)) {
    return DEFAULT_TABLE_COLUMN_WIDTH;
  }
  if (rounded < MIN_TABLE_COLUMN_WIDTH) {
    return MIN_TABLE_COLUMN_WIDTH;
  }
  if (rounded > MAX_TABLE_COLUMN_WIDTH) {
    return MAX_TABLE_COLUMN_WIDTH;
  }
  return rounded;
};

const buildColumnWidthsForCount = (count: number, source?: number[]): number[] => {
  if (count <= 0) {
    return [];
  }

  return Array.from({ length: count }, (_, index) => clampColumnWidthValue(source?.[index]));
};

const columnWidthArraysEqual = (a: number[], b: number[]): boolean => {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  return a.every((value, index) => value === b[index]);
};

const toggleBulletedListContent = (value: string): string => {
  const lines = value.split(LIST_LINE_SEPARATOR);
  const isBulleted = lines.every(line => line.trim().length === 0 || BULLET_PATTERN.test(line));

  if (isBulleted) {
    return lines.map(line => line.replace(BULLET_PATTERN, '')).join('\n');
  }

  return lines
    .map(line => {
      const base = stripListPrefix(line).trimStart();
      return base.length > 0 ? `• ${base}` : '• ';
    })
    .join('\n');
};

const toggleNumberedListContent = (value: string): string => {
  const lines = value.split(LIST_LINE_SEPARATOR);
  const isNumbered = lines.every(line => line.trim().length === 0 || NUMBERED_PATTERN.test(line));

  if (isNumbered) {
    return lines.map(line => line.replace(NUMBERED_PATTERN, '')).join('\n');
  }

  return lines
    .map((line, index) => {
      const base = stripListPrefix(line).trimStart();
      const prefix = `${index + 1}. `;
      return base.length > 0 ? `${prefix}${base}` : prefix;
    })
    .join('\n');
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

const DEFAULT_TEXT_COLOR = DEFAULT_CELL_FORMATTING.color;

const applyStyleTextColor = (
  formatting: TableCellFormatting,
  styleColor?: string,
): TableCellFormatting => {
  if (!styleColor) {
    return formatting;
  }

  if (formatting.color !== DEFAULT_TEXT_COLOR && formatting.color !== styleColor) {
    return formatting;
  }

  if (formatting.color === styleColor) {
    return formatting;
  }

  return {
    ...formatting,
    color: styleColor,
  };
};

export type SelectionRegion = TableSelection['region'];

export interface TableCellEditTarget {
  region: SelectionRegion;
  row: number;
  col: number;
}

interface SelectionTarget {
  region: SelectionRegion;
  row: number;
  col: number;
}

interface BodySelectionBounds {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
}

interface HeaderSelectionBounds {
  startCol: number;
  endCol: number;
}

const clampIndex = (value: number, min: number, max: number) => {
  if (max < min) {
    return min;
  }
  return Math.min(Math.max(value, min), max);
};

const getBodySelectionBounds = (selection: TableSelection): BodySelectionBounds => {
  const { anchor, focus } = selection;

  const rawStartRow = Math.min(anchor.row, focus.row);
  const rawEndRow = Math.max(anchor.row, focus.row);
  const rawStartCol = Math.min(anchor.col, focus.col);
  const rawEndCol = Math.max(anchor.col, focus.col);

  return {
    startRow: Math.max(0, rawStartRow),
    endRow: Math.max(0, rawEndRow),
    startCol: Math.max(0, rawStartCol),
    endCol: Math.max(0, rawEndCol),
  };
};

const getHeaderSelectionBounds = (selection: TableSelection): HeaderSelectionBounds => {
  const rawStartCol = Math.min(selection.anchor.col, selection.focus.col);
  const rawEndCol = Math.max(selection.anchor.col, selection.focus.col);

  return {
    startCol: Math.max(0, rawStartCol),
    endCol: Math.max(0, rawEndCol),
  };
};

const clampBodyBounds = (
  bounds: BodySelectionBounds,
  rowCount: number,
  colCount: number,
): BodySelectionBounds | null => {
  if (rowCount <= 0 || colCount <= 0) {
    return null;
  }

  const maxRow = rowCount - 1;
  const maxCol = colCount - 1;

  const startRow = clampIndex(bounds.startRow, 0, maxRow);
  const endRow = clampIndex(bounds.endRow, 0, maxRow);
  const startCol = clampIndex(bounds.startCol, 0, maxCol);
  const endCol = clampIndex(bounds.endCol, 0, maxCol);

  return {
    startRow: Math.min(startRow, endRow),
    endRow: Math.max(startRow, endRow),
    startCol: Math.min(startCol, endCol),
    endCol: Math.max(startCol, endCol),
  };
};

const clampHeaderBounds = (
  bounds: HeaderSelectionBounds,
  colCount: number,
): HeaderSelectionBounds | null => {
  if (colCount <= 0) {
    return null;
  }

  const maxCol = colCount - 1;

  const startCol = clampIndex(bounds.startCol, 0, maxCol);
  const endCol = clampIndex(bounds.endCol, 0, maxCol);

  return {
    startCol: Math.min(startCol, endCol),
    endCol: Math.max(startCol, endCol),
  };
};

interface ContentEditableCellProps {
  value: string;
  formatting: TableCellFormatting;
  editable: boolean;
  isEditing: boolean;
  onFocus: () => void;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  onInteract?: () => void;
  onBlur?: () => void;
}

const ContentEditableCell: React.FC<ContentEditableCellProps> = ({
  value,
  formatting,
  editable,
  isEditing,
  onFocus,
  onChange,
  onCommit,
  onInteract,
  onBlur,
}) => {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const lastValueRef = useRef<string>('');
  const wasEditingRef = useRef<boolean>(false);

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
    if (!editable || !isEditing) {
      return;
    }
    onInteract?.();
    emitChange();
  }, [editable, emitChange, isEditing, onInteract]);

  const handleBlur = useCallback(() => {
    if (!editable || !isEditing) {
      return;
    }
    emitCommit();
    onBlur?.();
  }, [editable, emitCommit, isEditing, onBlur]);

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
      if (!editable || !isEditing) {
        return;
      }

      event.preventDefault();
      const plainText = event.clipboardData.getData('text/plain');
      const ownerDocument = event.currentTarget.ownerDocument;
      if (plainText && ownerDocument && typeof ownerDocument.execCommand === 'function') {
        ownerDocument.execCommand('insertText', false, plainText);
      }
    },
    [editable, isEditing],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (!editable || !isEditing) {
        return;
      }

      event.stopPropagation();
      if (typeof event.nativeEvent.stopImmediatePropagation === 'function') {
        event.nativeEvent.stopImmediatePropagation();
      }
    },
    [editable, isEditing],
  );

  useEffect(() => {
    const node = elementRef.current;
    if (!node) {
      wasEditingRef.current = isEditing;
      return;
    }

    if (!editable || !isEditing) {
      wasEditingRef.current = isEditing;
      return;
    }

    if (wasEditingRef.current) {
      wasEditingRef.current = isEditing;
      return;
    }

    wasEditingRef.current = isEditing;

    const ownerDocument = node.ownerDocument;
    if (!ownerDocument) {
      return;
    }

    const focusNode = () => {
      try {
        node.focus({ preventScroll: true });
      } catch {
        node.focus();
      }

      const selection = ownerDocument.getSelection();
      const selectionInside = Boolean(
        selection?.rangeCount &&
        selection?.anchorNode &&
        node.contains(selection.anchorNode),
      );

      if (!selectionInside && ownerDocument.createRange) {
        try {
          const range = ownerDocument.createRange();
          range.selectNodeContents(node);
          selection?.removeAllRanges();
          selection?.addRange(range);
        } catch {
          // Ignore selection errors
        }
      }
    };

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(focusNode);
    } else {
      focusNode();
    }
  }, [editable, isEditing]);

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
      contentEditable={editable && isEditing}
      suppressContentEditableWarning
      onFocus={onFocus}
      onInput={handleInput}
      onBlur={handleBlur}
      onPaste={handlePaste}
      onKeyDown={handleKeyDown}
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
  backgroundColor?: string;
  borderColor: string;
  onSelectionStart: (target: SelectionTarget, options?: { extend?: boolean }) => void;
  onSelectionExtend: (target: SelectionTarget) => void;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  onInteract?: () => void;
  columnWidth?: number;
  minColumnWidth?: number;
  maxColumnWidth?: number;
  onEnterEditMode?: (target: SelectionTarget) => void;
  onExitEditMode?: (target: SelectionTarget) => void;
  isEditing?: boolean;
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
  backgroundColor,
  borderColor,
  onSelectionStart,
  onSelectionExtend,
  onChange,
  onCommit,
  onInteract,
  columnWidth,
  minColumnWidth,
  maxColumnWidth,
  onEnterEditMode,
  onExitEditMode,
  isEditing,
}) => {
  const editable = canEdit && !locked;

  const selectionTarget = useMemo<SelectionTarget>(
    () => ({ region: 'body', row: rowIndex, col: colIndex }),
    [colIndex, rowIndex],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLTableCellElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }

      const targetElement = event.target as HTMLElement | null;
      const isDoubleClick = event.detail > 1;
      const isContentTarget = targetElement?.dataset.exhibitionTableCellContent === 'true';

      if (isEditing && isContentTarget) {
        return;
      }

      if (!event.shiftKey && !isDoubleClick && !isContentTarget) {
        event.preventDefault();
      }

      onSelectionStart(selectionTarget, { extend: event.shiftKey });
    },
    [isEditing, onSelectionStart, selectionTarget],
  );

  const handlePointerEnter = useCallback(
    (event: React.PointerEvent<HTMLTableCellElement>) => {
      if (event.pointerType === 'mouse' && event.buttons !== 1) {
        return;
      }

      if (isEditing) {
        return;
      }

      onSelectionExtend(selectionTarget);
    },
    [isEditing, onSelectionExtend, selectionTarget],
  );

  const handleFocus = useCallback(() => {
    if (!isEditing) {
      onSelectionStart(selectionTarget);
    }
    if (editable) {
      onInteract?.();
    }
  }, [editable, isEditing, onInteract, onSelectionStart, selectionTarget]);

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLTableCellElement>) => {
      if (!editable) {
        return;
      }

      event.stopPropagation();
      if (!isEditing) {
        onSelectionStart(selectionTarget);
        onEnterEditMode?.(selectionTarget);
      }
      onInteract?.();
    },
    [editable, isEditing, onEnterEditMode, onInteract, onSelectionStart, selectionTarget],
  );

  return (
    <td
      className={cn(
        'align-top transition-colors border',
        editable ? 'cursor-text' : 'cursor-default',
        isActive && 'outline outline-2 outline-primary/60',
      )}
      data-exhibition-table-cell={editable ? 'editable' : 'readonly'}
      data-exhibition-table-cell-row={rowIndex}
      data-exhibition-table-cell-col={colIndex}
      data-exhibition-table-cell-region="body"
      style={{
        textAlign: formatting.align,
        backgroundColor: isActive ? undefined : backgroundColor,
        borderColor: showOutline ? borderColor : 'transparent',
        width: columnWidth,
        minWidth: minColumnWidth,
        maxWidth: maxColumnWidth,
      }}
      onPointerDown={handlePointerDown}
      onPointerEnter={handlePointerEnter}
      onClick={() => {
        if (editable) {
          onInteract?.();
        }
      }}
      onDoubleClick={handleDoubleClick}
    >
      <ContentEditableCell
        value={cell?.content ?? ''}
        formatting={formatting}
        editable={editable}
        isEditing={Boolean(isEditing)}
        onFocus={handleFocus}
        onChange={onChange}
        onCommit={onCommit}
        onInteract={onInteract}
        onBlur={() => {
          if (editable && isEditing) {
            onExitEditMode?.(selectionTarget);
          }
        }}
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
  backgroundColor?: string;
  borderColor: string;
  onSelectionStart: (target: SelectionTarget, options?: { extend?: boolean }) => void;
  onSelectionExtend: (target: SelectionTarget) => void;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
  onInteract?: () => void;
  columnWidth?: number;
  minColumnWidth?: number;
  maxColumnWidth?: number;
  canResize?: boolean;
  onResizeStart?: (event: React.PointerEvent<HTMLDivElement>) => void;
  onEnterEditMode?: (target: SelectionTarget) => void;
  onExitEditMode?: (target: SelectionTarget) => void;
  isEditing?: boolean;
}

const EditableHeaderCell: React.FC<EditableHeaderCellProps> = ({
  colIndex,
  cell,
  formatting,
  isActive,
  canEdit,
  locked,
  showOutline,
  backgroundColor,
  borderColor,
  onSelectionStart,
  onSelectionExtend,
  onChange,
  onCommit,
  onInteract,
  columnWidth,
  minColumnWidth,
  maxColumnWidth,
  canResize,
  onResizeStart,
  onEnterEditMode,
  onExitEditMode,
  isEditing,
}) => {
  const editable = canEdit && !locked;
  const enableResizeHandle = Boolean(canResize && onResizeStart);

  const selectionTarget = useMemo<SelectionTarget>(
    () => ({ region: 'header', row: -1, col: colIndex }),
    [colIndex],
  );

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLTableCellElement>) => {
      if (event.pointerType === 'mouse' && event.button !== 0) {
        return;
      }

      const targetElement = event.target as HTMLElement | null;
      const isDoubleClick = event.detail > 1;
      const isContentTarget = targetElement?.dataset.exhibitionTableCellContent === 'true';

      if (isEditing && isContentTarget) {
        return;
      }

      if (!event.shiftKey && !isDoubleClick && !isContentTarget) {
        event.preventDefault();
      }

      onSelectionStart(selectionTarget, { extend: event.shiftKey });
    },
    [isEditing, onSelectionStart, selectionTarget],
  );

  const handlePointerEnter = useCallback(
    (event: React.PointerEvent<HTMLTableCellElement>) => {
      if (event.pointerType === 'mouse' && event.buttons !== 1) {
        return;
      }

      if (isEditing) {
        return;
      }

      onSelectionExtend(selectionTarget);
    },
    [isEditing, onSelectionExtend, selectionTarget],
  );

  const handleFocus = useCallback(() => {
    if (!isEditing) {
      onSelectionStart(selectionTarget);
    }
    if (editable) {
      onInteract?.();
    }
  }, [editable, isEditing, onInteract, onSelectionStart, selectionTarget]);

  const handleDoubleClick = useCallback(
    (event: React.MouseEvent<HTMLTableCellElement>) => {
      if (!editable) {
        return;
      }

      event.stopPropagation();
      if (!isEditing) {
        onSelectionStart(selectionTarget);
        onEnterEditMode?.(selectionTarget);
      }
      onInteract?.();
    },
    [editable, isEditing, onEnterEditMode, onInteract, onSelectionStart, selectionTarget],
  );

  return (
    <th
      className={cn(
        'group relative align-middle transition-colors border',
        editable ? 'cursor-text' : 'cursor-default',
        isActive && 'outline outline-2 outline-primary/60',
      )}
      style={{
        textAlign: formatting.align,
        backgroundColor: isActive ? undefined : backgroundColor,
        borderColor: showOutline ? borderColor : 'transparent',
        width: columnWidth,
        minWidth: minColumnWidth,
        maxWidth: maxColumnWidth,
      }}
      onPointerDown={handlePointerDown}
      onPointerEnter={handlePointerEnter}
      onClick={() => {
        if (editable) {
          onInteract?.();
        }
      }}
      onDoubleClick={handleDoubleClick}
      data-exhibition-table-cell-row={-1}
      data-exhibition-table-cell-col={colIndex}
      data-exhibition-table-cell-region="header"
    >
      {enableResizeHandle && (
        <div
          role="presentation"
          className="absolute inset-y-0 right-0 z-20 w-3 translate-x-1/2 cursor-col-resize touch-none"
          data-exhibition-table-resizer="true"
          onPointerDown={event => onResizeStart?.(event)}
        >
          <span className="pointer-events-none absolute left-1/2 top-1/2 hidden h-6 w-px -translate-x-1/2 -translate-y-1/2 bg-border group-hover:block" />
        </div>
      )}
      <ContentEditableCell
        value={cell?.content ?? ''}
        formatting={formatting}
        editable={editable}
        isEditing={Boolean(isEditing)}
        onFocus={handleFocus}
        onChange={onChange}
        onCommit={onCommit}
        onInteract={onInteract}
        onBlur={() => {
          if (editable && isEditing) {
            onExitEditMode?.(selectionTarget);
          }
        }}
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
  columnWidths: columnWidthsProp,
  selectedCell,
  onCellSelect = noop,
  onUpdateCell,
  onUpdateCellFormatting,
  onUpdateHeader,
  onUpdateHeaderFormatting,
  className,
  styleId = DEFAULT_TABLE_STYLE_ID,
  isSelected = false,
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
  onInteract = noop,
  onStyleChange = noop,
  onUpdateColumnWidth,
  onBringToFront,
  onBringForward,
  onSendBackward,
  onSendToBack,
  onBeginCellTextEdit,
  onEndCellTextEdit,
  editingCell = null,
}) => {
  const [internalSelection, setInternalSelection] = useState<TableSelection | null>(null);
  const [toolbarFormatting, setToolbarFormatting] = useState<TableCellFormatting>(DEFAULT_CELL_FORMATTING);
  const dragStateRef = useRef<{ region: SelectionRegion; anchor: TableSelectionPoint } | null>(null);

  const clearDragState = useCallback(() => {
    dragStateRef.current = null;
  }, []);

  const commitSelection = useCallback(
    (nextSelection: TableSelection | null, notify = true) => {
      setInternalSelection(nextSelection);
      if (notify) {
        onCellSelect(nextSelection ?? null);
      }
    },
    [onCellSelect],
  );

  const effectiveSelection = selectedCell ?? internalSelection;
  const selectionRegion: SelectionRegion | null = effectiveSelection ? effectiveSelection.region : null;

  const handleBringToFront = useCallback(() => {
    if (!onBringToFront) {
      return;
    }
    onInteract();
    onBringToFront();
  }, [onBringToFront, onInteract]);

  const handleBringForward = useCallback(() => {
    if (!onBringForward) {
      return;
    }
    onInteract();
    onBringForward();
  }, [onBringForward, onInteract]);

  const handleSendBackward = useCallback(() => {
    if (!onSendBackward) {
      return;
    }
    onInteract();
    onSendBackward();
  }, [onInteract, onSendBackward]);

  const handleSendToBack = useCallback(() => {
    if (!onSendToBack) {
      return;
    }
    onInteract();
    onSendToBack();
  }, [onInteract, onSendToBack]);

  useEffect(() => {
    if (selectedCell === undefined) {
      return;
    }

    if (selectedCell === null) {
      clearDragState();
      setInternalSelection(null);
      return;
    }

    clearDragState();
    setInternalSelection(selectedCell);
  }, [clearDragState, selectedCell]);

  const handleSelectionStart = useCallback(
    (target: SelectionTarget, options?: { extend?: boolean }) => {
      const { region, row, col } = target;
      const extend = Boolean(options?.extend);
      let anchor: TableSelectionPoint = { row, col };

      if (extend && internalSelection && internalSelection.region === region) {
        anchor = internalSelection.anchor;
      }

      const nextSelection: TableSelection = {
        region,
        anchor,
        focus: { row, col },
      };

      dragStateRef.current = { region, anchor };
      commitSelection(nextSelection);

      if (typeof window !== 'undefined' && window.document) {
        window.document.addEventListener('pointerup', clearDragState, { once: true });
      }
    },
    [clearDragState, commitSelection, internalSelection],
  );

  const handleSelectionExtend = useCallback(
    (target: SelectionTarget) => {
      const dragState = dragStateRef.current;
      if (!dragState || dragState.region !== target.region) {
        return;
      }

      const { row, col } = target;
      const nextSelection: TableSelection = {
        region: target.region,
        anchor: dragState.anchor,
        focus: { row, col },
      };

      commitSelection(nextSelection);
    },
    [commitSelection],
  );

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

  const [columnWidthState, setColumnWidthState] = useState<number[]>(() =>
    buildColumnWidthsForCount(colCount, columnWidthsProp),
  );
  const columnWidthsRef = useRef<number[]>(columnWidthState);
  const resizingColumnRef = useRef<
    { index: number; startX: number; startWidth: number; pointerId: number; target: Element | null } | null
  >(null);
  const pendingColumnWidthRef = useRef<{ index: number; width: number } | null>(null);
  const activeResizeHandlersRef = useRef<{ move: (event: PointerEvent) => void; up: () => void } | null>(null);

  useEffect(() => {
    columnWidthsRef.current = columnWidthState;
  }, [columnWidthState]);

  useEffect(() => {
    if (resizingColumnRef.current) {
      return;
    }

    const nextWidths = buildColumnWidthsForCount(colCount, columnWidthsProp);
    if (!columnWidthArraysEqual(columnWidthsRef.current, nextWidths)) {
      columnWidthsRef.current = nextWidths;
      setColumnWidthState(nextWidths);
    }
  }, [colCount, columnWidthsProp]);

  useEffect(() => {
    return () => {
      const handlers = activeResizeHandlersRef.current;
      if (handlers && typeof window !== 'undefined') {
        window.removeEventListener('pointermove', handlers.move);
        window.removeEventListener('pointerup', handlers.up);
      }

      if (typeof document !== 'undefined') {
        document.body.style.cursor = '';
      }

      const resizeState = resizingColumnRef.current;
      if (resizeState?.target && typeof resizeState.target.releasePointerCapture === 'function') {
        try {
          resizeState.target.releasePointerCapture(resizeState.pointerId);
        } catch {
          // Ignore release errors
        }
      }

      activeResizeHandlersRef.current = null;
      resizingColumnRef.current = null;
      pendingColumnWidthRef.current = null;
    };
  }, []);

  const handleColumnResizeStart = useCallback(
    (colIndex: number, pointerEvent: React.PointerEvent<HTMLDivElement>) => {
      if (!canEdit || locked) {
        return;
      }

      pointerEvent.preventDefault();
      pointerEvent.stopPropagation();

      const startWidth = clampColumnWidthValue(columnWidthsRef.current[colIndex]);
      const startX = pointerEvent.clientX;

      const targetElement = pointerEvent.currentTarget instanceof Element ? pointerEvent.currentTarget : null;
      resizingColumnRef.current = {
        index: colIndex,
        startX,
        startWidth,
        pointerId: pointerEvent.pointerId,
        target: targetElement,
      };
      pendingColumnWidthRef.current = { index: colIndex, width: startWidth };

      onInteract();

      const moveListener = (event: PointerEvent) => {
        const resizeState = resizingColumnRef.current;
        if (!resizeState) {
          return;
        }

        const delta = event.clientX - resizeState.startX;
        const nextWidth = clampColumnWidthValue(resizeState.startWidth + delta);
        pendingColumnWidthRef.current = { index: resizeState.index, width: nextWidth };

        setColumnWidthState(prev => {
          if (prev[resizeState.index] === nextWidth) {
            return prev;
          }
          const next = [...prev];
          next[resizeState.index] = nextWidth;
          columnWidthsRef.current = next;
          return next;
        });
      };

      const stopResizing = () => {
        if (typeof document !== 'undefined') {
          document.body.style.cursor = '';
        }
        if (typeof window !== 'undefined') {
          window.removeEventListener('pointermove', moveListener);
          window.removeEventListener('pointerup', stopResizing);
        }
        activeResizeHandlersRef.current = null;

        const resizeState = resizingColumnRef.current;
        if (resizeState?.target && typeof resizeState.target.releasePointerCapture === 'function') {
          try {
            resizeState.target.releasePointerCapture(resizeState.pointerId);
          } catch {
            // Ignore release errors
          }
        }

        const pendingWidth = pendingColumnWidthRef.current;
        if (pendingWidth && pendingWidth.index === colIndex) {
          onUpdateColumnWidth?.(pendingWidth.index, pendingWidth.width);
        }

        pendingColumnWidthRef.current = null;
        resizingColumnRef.current = null;
      };

      if (typeof document !== 'undefined') {
        document.body.style.cursor = 'col-resize';
      }

      if (typeof window !== 'undefined') {
        const handlers = activeResizeHandlersRef.current;
        if (handlers) {
          window.removeEventListener('pointermove', handlers.move);
          window.removeEventListener('pointerup', handlers.up);
        }

        window.addEventListener('pointermove', moveListener);
        window.addEventListener('pointerup', stopResizing);
        activeResizeHandlersRef.current = { move: moveListener, up: stopResizing };
      }

      if (targetElement && typeof targetElement.setPointerCapture === 'function') {
        try {
          targetElement.setPointerCapture(pointerEvent.pointerId);
        } catch {
          // Ignore capture errors
        }
      }
    },
    [canEdit, locked, onInteract, onUpdateColumnWidth],
  );

  const allowColumnResize = canEdit && !locked;

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

  const bodySelectionBounds = useMemo(() => {
    if (!effectiveSelection || effectiveSelection.region !== 'body') {
      return null;
    }

    const rawBounds = getBodySelectionBounds(effectiveSelection);
    return clampBodyBounds(rawBounds, rowCount, colCount);
  }, [colCount, effectiveSelection, rowCount]);

  const headerSelectionBounds = useMemo(() => {
    if (!effectiveSelection || effectiveSelection.region !== 'header') {
      return null;
    }

    const rawBounds = getHeaderSelectionBounds(effectiveSelection);
    return clampHeaderBounds(rawBounds, colCount);
  }, [colCount, effectiveSelection]);

  const columnSelectionBounds = useMemo(() => {
    if (!effectiveSelection) {
      return null;
    }

    if (effectiveSelection.region === 'header') {
      return headerSelectionBounds;
    }

    if (!bodySelectionBounds) {
      return null;
    }

    const { startCol, endCol } = bodySelectionBounds;
    return { startCol, endCol };
  }, [bodySelectionBounds, effectiveSelection, headerSelectionBounds]);

  const selectedColumnCount = useMemo(() => {
    if (!columnSelectionBounds) {
      return 0;
    }
    const { startCol, endCol } = columnSelectionBounds;
    return Math.max(0, endCol - startCol + 1);
  }, [columnSelectionBounds]);

  const selectedRowCount = useMemo(() => {
    if (!bodySelectionBounds) {
      return 0;
    }

    const { startRow, endRow } = bodySelectionBounds;
    return Math.max(0, endRow - startRow + 1);
  }, [bodySelectionBounds]);

  const tableStyle: TableStyleDefinition = useMemo(() => getTableStyleById(styleId), [styleId]);
  const tableBorderColor = tableStyle.table.borderColor;
  const tableBackground = tableStyle.table.background;
  const headerBackground = tableStyle.header.background;
  const headerBorderColor = tableStyle.header.borderColor;
  const headerTextColor = tableStyle.header.textColor;
  const bodyBorderColor = tableStyle.body.borderColor;
  const bodyOddBackground = tableStyle.body.oddBackground;
  const bodyEvenBackground = tableStyle.body.evenBackground;
  const bodyTextColor = tableStyle.body.textColor;
  const showTableOutline = showOutline && isSelected;

  useEffect(() => {
    if (!effectiveSelection) {
      setToolbarFormatting(DEFAULT_CELL_FORMATTING);
      return;
    }

    if (selectionRegion === 'header') {
      const bounds = headerSelectionBounds;
      if (!bounds) {
        setToolbarFormatting(DEFAULT_CELL_FORMATTING);
        return;
      }

      const header = headerCells[bounds.startCol];
      setToolbarFormatting(header?.formatting ?? DEFAULT_CELL_FORMATTING);
      return;
    }

    if (selectionRegion === 'body') {
      const bounds = bodySelectionBounds;
      if (!bounds) {
        setToolbarFormatting(DEFAULT_CELL_FORMATTING);
        return;
      }

      const cell = tableData[bounds.startRow]?.[bounds.startCol];
      if (cell) {
        setToolbarFormatting(cell.formatting);
        return;
      }
    }

    setToolbarFormatting(DEFAULT_CELL_FORMATTING);
  }, [
    bodySelectionBounds,
    effectiveSelection,
    headerCells,
    headerSelectionBounds,
    selectionRegion,
    tableData,
  ]);

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

  const applyListTransformation = useCallback(
    (transformer: (value: string) => string) => {
      if (!effectiveSelection) {
        return;
      }

      if (selectionRegion === 'header') {
        if (!onUpdateHeader || !headerSelectionBounds) {
          return;
        }
        for (let col = headerSelectionBounds.startCol; col <= headerSelectionBounds.endCol; col += 1) {
          const headerCell = headerCells[col];
          if (!headerCell) {
            continue;
          }

          const nextValue = transformer(headerCell.content ?? '');
          if (nextValue !== (headerCell.content ?? '')) {
            handleHeaderInput(col, nextValue);
          }
        }
        return;
      }

      if (!bodySelectionBounds) {
        return;
      }

      for (let row = bodySelectionBounds.startRow; row <= bodySelectionBounds.endRow; row += 1) {
        const targetRow = tableData[row];
        if (!targetRow) {
          continue;
        }

        for (let col = bodySelectionBounds.startCol; col <= bodySelectionBounds.endCol; col += 1) {
          const targetCell = targetRow[col];
          if (!targetCell) {
            continue;
          }

          const nextValue = transformer(targetCell.content ?? '');
          if (nextValue !== (targetCell.content ?? '')) {
            handleBodyCellInput(row, col, nextValue);
          }
        }
      }
    },
    [
      bodySelectionBounds,
      effectiveSelection,
      handleBodyCellInput,
      handleHeaderInput,
      headerCells,
      headerSelectionBounds,
      onUpdateHeader,
      selectionRegion,
      tableData,
    ],
  );

  const handleBulletedList = useCallback(() => {
    applyListTransformation(toggleBulletedListContent);
  }, [applyListTransformation]);

  const handleNumberedList = useCallback(() => {
    applyListTransformation(toggleNumberedListContent);
  }, [applyListTransformation]);

  const applyFormatting = useCallback(
    (updates: Partial<TableCellFormatting>) => {
      if (!effectiveSelection) {
        return;
      }

      if (selectionRegion === 'header') {
        if (!onUpdateHeaderFormatting || !headerSelectionBounds) {
          return;
        }
        onInteract?.();
        setToolbarFormatting(prev => ({ ...prev, ...updates }));
        for (let col = headerSelectionBounds.startCol; col <= headerSelectionBounds.endCol; col += 1) {
          onUpdateHeaderFormatting(col, updates);
        }
        return;
      }
      if (!onUpdateCellFormatting || !bodySelectionBounds) {
        return;
      }
      onInteract?.();
      setToolbarFormatting(prev => ({ ...prev, ...updates }));
      for (let row = bodySelectionBounds.startRow; row <= bodySelectionBounds.endRow; row += 1) {
        for (let col = bodySelectionBounds.startCol; col <= bodySelectionBounds.endCol; col += 1) {
          onUpdateCellFormatting(row, col, updates);
        }
      }
    },
    [
      bodySelectionBounds,
      effectiveSelection,
      onInteract,
      onUpdateCellFormatting,
      onUpdateHeaderFormatting,
      headerSelectionBounds,
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
        onBulletedList={handleBulletedList}
        onNumberedList={handleNumberedList}
        color={toolbarFormatting.color}
        onColorChange={handleColor}
        onDelete={canEdit ? onDelete : undefined}
      />
    );
  }, [
    canEdit,
    effectiveSelection,
    handleBulletedList,
    handleAlign,
    handleColor,
    handleDecreaseFontSize,
    handleFontFamily,
    handleNumberedList,
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
            'h-full w-full overflow-hidden rounded-2xl border border-transparent bg-transparent p-3 transition-colors',
            canEdit && !locked && 'hover:border-border/70',
            className,
          )}
        >
          <table
            className={cn('h-full w-full table-fixed border-collapse border')}
            style={{
              backgroundColor: tableBackground,
              borderColor: showTableOutline ? tableBorderColor : 'transparent',
            }}
            data-table-id={id}
          >
            {columnWidthState.length > 0 && (
              <colgroup>
                {columnWidthState.map((width, colIndex) => (
                  <col
                    key={`${id}-col-${colIndex}`}
                    style={{
                      width: `${width}px`,
                      minWidth: `${MIN_TABLE_COLUMN_WIDTH}px`,
                      maxWidth: `${MAX_TABLE_COLUMN_WIDTH}px`,
                    }}
                  />
                ))}
              </colgroup>
            )}
            {headerCells.length > 0 && (
              <thead className="bg-transparent">
                <tr>
                  {headerCells.map((headerCell, headerIndex) => {
                    const headerFormatting = headerCell?.formatting ?? createCellFormatting({ bold: true });
                    const styledHeaderFormatting = applyStyleTextColor(headerFormatting, headerTextColor);
                    const isActiveHeader =
                      selectionRegion === 'header' &&
                      headerSelectionBounds != null &&
                      headerIndex >= headerSelectionBounds.startCol &&
                      headerIndex <= headerSelectionBounds.endCol;

                    return (
                      <EditableHeaderCell
                        key={`${id}-header-${headerIndex}`}
                        colIndex={headerIndex}
                        cell={headerCell}
                        formatting={styledHeaderFormatting}
                        isActive={Boolean(isActiveHeader)}
                        canEdit={canEdit}
                        locked={locked}
                        showOutline={showOutline}
                        backgroundColor={headerBackground}
                        borderColor={headerBorderColor}
                        onSelectionStart={handleSelectionStart}
                        onSelectionExtend={handleSelectionExtend}
                        onChange={value => handleHeaderInput(headerIndex, value)}
                        onCommit={value => handleHeaderCommit(headerIndex, value)}
                        onInteract={onInteract}
                        columnWidth={columnWidthState[headerIndex]}
                        minColumnWidth={MIN_TABLE_COLUMN_WIDTH}
                        maxColumnWidth={MAX_TABLE_COLUMN_WIDTH}
                        canResize={allowColumnResize}
                        onResizeStart={
                          allowColumnResize
                            ? event => handleColumnResizeStart(headerIndex, event)
                            : undefined
                        }
                        onEnterEditMode={onBeginCellTextEdit}
                        onExitEditMode={onEndCellTextEdit}
                        isEditing={
                          Boolean(
                            editingCell &&
                              editingCell.region === 'header' &&
                              editingCell.col === headerIndex,
                          )
                        }
                      />
                    );
                  })}
                </tr>
              </thead>
            )}
            <tbody>
              {tableData.map((rowData, rowIndex) => {
                const rowBackgroundColor = rowIndex % 2 === 0 ? bodyOddBackground : bodyEvenBackground;

                return (
                  <tr key={`${id}-row-${rowIndex}`}>
                    {rowData.map((cell, colIndex) => {
                      const isActive =
                        selectionRegion === 'body' &&
                        bodySelectionBounds != null &&
                        rowIndex >= bodySelectionBounds.startRow &&
                        rowIndex <= bodySelectionBounds.endRow &&
                        colIndex >= bodySelectionBounds.startCol &&
                        colIndex <= bodySelectionBounds.endCol;
                      const cellFormatting = cell?.formatting ?? createCellFormatting();
                      const styledCellFormatting = applyStyleTextColor(cellFormatting, bodyTextColor);

                      return (
                        <EditableTableCell
                          key={`${id}-cell-${rowIndex}-${colIndex}`}
                          rowIndex={rowIndex}
                          colIndex={colIndex}
                          cell={cell}
                          formatting={styledCellFormatting}
                          isActive={Boolean(isActive)}
                          canEdit={canEdit}
                          locked={locked}
                          showOutline={showOutline}
                          backgroundColor={rowBackgroundColor}
                          borderColor={bodyBorderColor}
                          onSelectionStart={handleSelectionStart}
                          onSelectionExtend={handleSelectionExtend}
                          onChange={value => handleBodyCellInput(rowIndex, colIndex, value)}
                          onCommit={value => handleBodyCellCommit(rowIndex, colIndex, value)}
                          onInteract={onInteract}
                          columnWidth={columnWidthState[colIndex]}
                          minColumnWidth={MIN_TABLE_COLUMN_WIDTH}
                          maxColumnWidth={MAX_TABLE_COLUMN_WIDTH}
                          onEnterEditMode={onBeginCellTextEdit}
                          onExitEditMode={onEndCellTextEdit}
                          isEditing={
                            Boolean(
                              editingCell &&
                                editingCell.region === 'body' &&
                                editingCell.row === rowIndex &&
                                editingCell.col === colIndex,
                            )
                          }
                        />
                      );
                    })}
                  </tr>
                );
              })}
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
        styleId={tableStyle.id}
        onToggleLock={onToggleLock}
        onToggleOutline={onToggleOutline}
        onDelete={onDelete}
        onDeleteColumn={() => {
          if (!columnSelectionBounds || selectedColumnCount <= 0) {
            return;
          }
          onDeleteColumn(columnSelectionBounds.startCol, selectedColumnCount);
        }}
        onDelete2Columns={() => {
          if (!columnSelectionBounds || selectedColumnCount <= 0) {
            return;
          }
          const removalCount = Math.max(2, selectedColumnCount);
          onDelete2Columns(columnSelectionBounds.startCol, removalCount);
        }}
        onDeleteRow={() => {
          if (!bodySelectionBounds || selectedRowCount <= 0) {
            return;
          }
          onDeleteRow(bodySelectionBounds.startRow, selectedRowCount);
        }}
        onDelete2Rows={() => {
          if (!bodySelectionBounds || selectedRowCount <= 0) {
            return;
          }
          const removalCount = Math.max(2, selectedRowCount);
          onDelete2Rows(bodySelectionBounds.startRow, removalCount);
        }}
        onAddColumn={onAddColumn}
        onAdd2Columns={onAdd2Columns}
        onAddRow={onAddRow}
        onAdd2Rows={onAdd2Rows}
        onSelectStyle={onStyleChange}
        onBringToFront={onBringToFront ? handleBringToFront : undefined}
        onBringForward={onBringForward ? handleBringForward : undefined}
        onSendBackward={onSendBackward ? handleSendBackward : undefined}
        onSendToBack={onSendToBack ? handleSendToBack : undefined}
      />
    </ContextMenu>
  );
};
