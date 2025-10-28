import type { SlideObject } from '../../../store/exhibitionStore';
import { FONT_OPTIONS } from '../textBox/constants';

export const DEFAULT_TABLE_ROWS = 3;
export const DEFAULT_TABLE_COLS = 3;
export const DEFAULT_TABLE_WIDTH = 420;
export const DEFAULT_TABLE_HEIGHT = 260;

export type TableTextAlign = 'left' | 'center' | 'right';

export interface TableSelectionPoint {
  row: number;
  col: number;
}

export interface TableSelection {
  region: 'header' | 'body';
  anchor: TableSelectionPoint;
  focus: TableSelectionPoint;
}

export interface TableCellFormatting {
  fontFamily: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  align: TableTextAlign;
  color: string;
}

export interface TableCellData {
  content: string;
  formatting: TableCellFormatting;
  rowSpan?: number;
  colSpan?: number;
}

export interface TableStyleDefinition {
  id: string;
  label: string;
  category: 'Light' | 'Medium' | 'Dark';
  table: {
    background: string;
    borderColor: string;
  };
  header: {
    background: string;
    textColor: string;
    borderColor: string;
  };
  body: {
    oddBackground: string;
    evenBackground: string;
    textColor: string;
    borderColor: string;
  };
  preview: {
    header: string;
    odd: string;
    even: string;
    border: string;
  };
}

export interface TableStyleGroup {
  id: 'Light' | 'Medium' | 'Dark';
  label: string;
  styles: TableStyleDefinition[];
}

const DEFAULT_CELL_COLOR = '#111827';

const createDefaultFormatting = (
  overrides: Partial<TableCellFormatting> = {},
): TableCellFormatting => ({
  fontFamily: FONT_OPTIONS[0],
  fontSize: 16,
  bold: false,
  italic: false,
  underline: false,
  strikethrough: false,
  align: 'left',
  color: DEFAULT_CELL_COLOR,
  ...overrides,
});

export const createCellFormatting = (
  overrides: Partial<TableCellFormatting> = {},
): TableCellFormatting => createDefaultFormatting(overrides);

export const DEFAULT_CELL_FORMATTING = createCellFormatting();

export const createDefaultHeaderCell = (index: number): TableCellData => ({
  content: `Column ${index + 1}`,
  formatting: createCellFormatting({ bold: true }),
});

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const parseNumber = (value: unknown): number | undefined => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

const normaliseAlign = (value: unknown): TableTextAlign => {
  return value === 'center' || value === 'right' ? value : 'left';
};

const normaliseFormatting = (value: unknown): TableCellFormatting => {
  if (!isRecord(value)) {
    return createCellFormatting();
  }

  const fontFamily =
    typeof value.fontFamily === 'string' && value.fontFamily.trim().length > 0
      ? value.fontFamily
      : FONT_OPTIONS[0];
  const fontSize = parseNumber(value.fontSize);
  const color =
    typeof value.color === 'string' && value.color.trim().length > 0
      ? value.color
      : DEFAULT_CELL_COLOR;

  return createCellFormatting({
    fontFamily,
    fontSize: fontSize && fontSize > 0 ? Math.min(Math.max(fontSize, 8), 200) : undefined,
    bold: Boolean(value.bold),
    italic: Boolean(value.italic),
    underline: Boolean(value.underline),
    strikethrough: Boolean(value.strikethrough),
    align: normaliseAlign(value.align),
    color,
  });
};

export const createEmptyCell = (): TableCellData => ({
  content: '',
  formatting: createDefaultFormatting(),
});

export const cloneCell = (cell: TableCellData): TableCellData => ({
  ...cell,
  formatting: { ...cell.formatting },
});

export const cloneTableMatrix = (matrix: TableCellData[][]): TableCellData[][] =>
  matrix.map(row => row.map(cell => cloneCell(cell)));

export const cloneTableHeaders = (headers: TableCellData[]): TableCellData[] =>
  headers.map(header => cloneCell(header));

const coerceCellValue = (value: unknown): TableCellData => {
  if (isRecord(value)) {
    const content =
      typeof value.content === 'string'
        ? value.content
        : value.content == null
        ? ''
        : String(value.content);
    const rowSpan = parseNumber(value.rowSpan);
    const colSpan = parseNumber(value.colSpan);
    const formatting = normaliseFormatting(value.formatting);

    return {
      content,
      formatting,
      rowSpan: rowSpan && rowSpan > 1 ? Math.floor(rowSpan) : undefined,
      colSpan: colSpan && colSpan > 1 ? Math.floor(colSpan) : undefined,
    };
  }

  if (typeof value === 'string') {
    return { content: value, formatting: createCellFormatting() };
  }

  if (value == null) {
    return createEmptyCell();
  }

  return { content: String(value), formatting: createCellFormatting() };
};

export const createEmptyTableRow = (cols: number): TableCellData[] =>
  Array.from({ length: cols }, () => createEmptyCell());

export const createEmptyTableData = (rows: number, cols: number): TableCellData[][] => {
  const safeRows = Number.isFinite(rows) && rows > 0 ? Math.floor(rows) : DEFAULT_TABLE_ROWS;
  const safeCols = Number.isFinite(cols) && cols > 0 ? Math.floor(cols) : DEFAULT_TABLE_COLS;

  return Array.from({ length: safeRows }, () => createEmptyTableRow(safeCols));
};

const toMatrix = (value: unknown): TableCellData[][] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const rows: TableCellData[][] = [];

  value.forEach((row, rowIndex) => {
    if (!Array.isArray(row)) {
      return;
    }

    rows[rowIndex] = row.map(cell => coerceCellValue(cell));
  });

  return rows;
};

const TABLE_STYLES: TableStyleDefinition[] = [
  {
    id: 'transparent',
    label: 'Transparent',
    category: 'Light',
    table: {
      background: 'transparent',
      borderColor: 'rgba(148, 163, 184, 0.45)',
    },
    header: {
      background: 'transparent',
      textColor: DEFAULT_CELL_COLOR,
      borderColor: 'rgba(148, 163, 184, 0.35)',
    },
    body: {
      oddBackground: 'transparent',
      evenBackground: 'transparent',
      textColor: DEFAULT_CELL_COLOR,
      borderColor: 'rgba(148, 163, 184, 0.25)',
    },
    preview: {
      header: 'rgba(148, 163, 184, 0.28)',
      odd: 'rgba(148, 163, 184, 0.1)',
      even: 'rgba(148, 163, 184, 0.18)',
      border: 'rgba(148, 163, 184, 0.38)',
    },
  },
  {
    id: 'light-slate',
    label: 'Slate',
    category: 'Light',
    table: {
      background: '#ffffff',
      borderColor: '#e2e8f0',
    },
    header: {
      background: '#f1f5f9',
      textColor: '#0f172a',
      borderColor: '#cbd5e1',
    },
    body: {
      oddBackground: '#ffffff',
      evenBackground: '#f8fafc',
      textColor: '#1f2937',
      borderColor: '#e2e8f0',
    },
    preview: {
      header: '#f1f5f9',
      odd: '#ffffff',
      even: '#f8fafc',
      border: '#cbd5e1',
    },
  },
  {
    id: 'light-sky',
    label: 'Sky',
    category: 'Light',
    table: {
      background: '#ffffff',
      borderColor: '#bae6fd',
    },
    header: {
      background: '#e0f2fe',
      textColor: '#0c4a6e',
      borderColor: '#7dd3fc',
    },
    body: {
      oddBackground: '#f0f9ff',
      evenBackground: '#dbeafe',
      textColor: '#0f172a',
      borderColor: '#bae6fd',
    },
    preview: {
      header: '#e0f2fe',
      odd: '#f0f9ff',
      even: '#dbeafe',
      border: '#7dd3fc',
    },
  },
  {
    id: 'light-emerald',
    label: 'Emerald',
    category: 'Light',
    table: {
      background: '#ffffff',
      borderColor: '#a7f3d0',
    },
    header: {
      background: '#d1fae5',
      textColor: '#065f46',
      borderColor: '#6ee7b7',
    },
    body: {
      oddBackground: '#ecfdf5',
      evenBackground: '#d1fae5',
      textColor: '#064e3b',
      borderColor: '#a7f3d0',
    },
    preview: {
      header: '#d1fae5',
      odd: '#ecfdf5',
      even: '#d1fae5',
      border: '#6ee7b7',
    },
  },
  {
    id: 'light-violet',
    label: 'Violet',
    category: 'Light',
    table: {
      background: '#ffffff',
      borderColor: '#ddd6fe',
    },
    header: {
      background: '#ede9fe',
      textColor: '#4c1d95',
      borderColor: '#c4b5fd',
    },
    body: {
      oddBackground: '#f5f3ff',
      evenBackground: '#ede9fe',
      textColor: '#312e81',
      borderColor: '#ddd6fe',
    },
    preview: {
      header: '#ede9fe',
      odd: '#f5f3ff',
      even: '#ede9fe',
      border: '#c4b5fd',
    },
  },
  {
    id: 'medium-blue',
    label: 'Blue',
    category: 'Medium',
    table: {
      background: '#ffffff',
      borderColor: '#93c5fd',
    },
    header: {
      background: '#bfdbfe',
      textColor: '#1e3a8a',
      borderColor: '#60a5fa',
    },
    body: {
      oddBackground: '#eff6ff',
      evenBackground: '#dbeafe',
      textColor: '#1f2937',
      borderColor: '#93c5fd',
    },
    preview: {
      header: '#bfdbfe',
      odd: '#eff6ff',
      even: '#dbeafe',
      border: '#60a5fa',
    },
  },
  {
    id: 'medium-amber',
    label: 'Amber',
    category: 'Medium',
    table: {
      background: '#ffffff',
      borderColor: '#fcd34d',
    },
    header: {
      background: '#fde68a',
      textColor: '#78350f',
      borderColor: '#f59e0b',
    },
    body: {
      oddBackground: '#fffbeb',
      evenBackground: '#fef3c7',
      textColor: '#92400e',
      borderColor: '#fcd34d',
    },
    preview: {
      header: '#fde68a',
      odd: '#fffbeb',
      even: '#fef3c7',
      border: '#f59e0b',
    },
  },
  {
    id: 'medium-teal',
    label: 'Teal',
    category: 'Medium',
    table: {
      background: '#ffffff',
      borderColor: '#5eead4',
    },
    header: {
      background: '#99f6e4',
      textColor: '#134e4a',
      borderColor: '#2dd4bf',
    },
    body: {
      oddBackground: '#f0fdfa',
      evenBackground: '#ccfbf1',
      textColor: '#115e59',
      borderColor: '#5eead4',
    },
    preview: {
      header: '#99f6e4',
      odd: '#f0fdfa',
      even: '#ccfbf1',
      border: '#2dd4bf',
    },
  },
  {
    id: 'dark-slate',
    label: 'Slate',
    category: 'Dark',
    table: {
      background: '#0f172a',
      borderColor: '#475569',
    },
    header: {
      background: '#334155',
      textColor: '#e2e8f0',
      borderColor: '#475569',
    },
    body: {
      oddBackground: '#111827',
      evenBackground: '#1f2937',
      textColor: '#f8fafc',
      borderColor: '#475569',
    },
    preview: {
      header: '#334155',
      odd: '#111827',
      even: '#1f2937',
      border: '#475569',
    },
  },
  {
    id: 'dark-indigo',
    label: 'Indigo',
    category: 'Dark',
    table: {
      background: '#1e1b4b',
      borderColor: '#4c1d95',
    },
    header: {
      background: '#3730a3',
      textColor: '#eef2ff',
      borderColor: '#4c1d95',
    },
    body: {
      oddBackground: '#312e81',
      evenBackground: '#4338ca',
      textColor: '#e0e7ff',
      borderColor: '#4c1d95',
    },
    preview: {
      header: '#3730a3',
      odd: '#312e81',
      even: '#4338ca',
      border: '#4c1d95',
    },
  },
  {
    id: 'dark-emerald',
    label: 'Emerald',
    category: 'Dark',
    table: {
      background: '#022c22',
      borderColor: '#047857',
    },
    header: {
      background: '#065f46',
      textColor: '#ecfdf5',
      borderColor: '#047857',
    },
    body: {
      oddBackground: '#064e3b',
      evenBackground: '#047857',
      textColor: '#d1fae5',
      borderColor: '#047857',
    },
    preview: {
      header: '#065f46',
      odd: '#064e3b',
      even: '#047857',
      border: '#047857',
    },
  },
];

export const TABLE_STYLE_GROUPS: TableStyleGroup[] = [
  {
    id: 'Light',
    label: 'Light',
    styles: TABLE_STYLES.filter(style => style.category === 'Light'),
  },
  {
    id: 'Medium',
    label: 'Medium',
    styles: TABLE_STYLES.filter(style => style.category === 'Medium'),
  },
  {
    id: 'Dark',
    label: 'Dark',
    styles: TABLE_STYLES.filter(style => style.category === 'Dark'),
  },
];

const TABLE_STYLE_LOOKUP = new Map(TABLE_STYLES.map(style => [style.id, style]));

export const DEFAULT_TABLE_STYLE_ID = TABLE_STYLES[0]?.id ?? 'light-slate';

export const ensureTableStyleId = (value: unknown): string => {
  if (typeof value === 'string' && TABLE_STYLE_LOOKUP.has(value)) {
    return value;
  }
  return DEFAULT_TABLE_STYLE_ID;
};

export const getTableStyleById = (value: string | undefined): TableStyleDefinition => {
  if (value && TABLE_STYLE_LOOKUP.has(value)) {
    return TABLE_STYLE_LOOKUP.get(value)!;
  }
  return TABLE_STYLE_LOOKUP.get(DEFAULT_TABLE_STYLE_ID)!;
};

const ensureHeaderCell = (value: unknown, index: number): TableCellData => {
  const cell = coerceCellValue(value);
  const content = cell.content && cell.content.trim().length > 0 ? cell.content : `Column ${index + 1}`;

  return {
    ...cloneCell(cell),
    content,
  };
};

export const normaliseTableHeaders = (
  value: unknown,
  fallbackCount: number,
): TableCellData[] => {
  const source = Array.isArray(value) ? value : [];
  const count = Math.max(fallbackCount, source.length, 1);

  return Array.from({ length: count }, (_, index) => {
    const header = index < source.length ? ensureHeaderCell(source[index], index) : createDefaultHeaderCell(index);
    return header;
  });
};

export const normaliseTableData = (
  value: unknown,
  fallbackRows: number = DEFAULT_TABLE_ROWS,
  fallbackCols: number = DEFAULT_TABLE_COLS,
): TableCellData[][] => {
  const matrix = toMatrix(value) ?? [];

  const rowCount = Math.max(matrix.length, fallbackRows, 1);
  const colCount = Math.max(
    matrix.reduce((max, row) => Math.max(max, row.length), 0),
    fallbackCols,
    1,
  );

  if (rowCount === 0 || colCount === 0) {
    return createEmptyTableData(fallbackRows, fallbackCols);
  }

  return Array.from({ length: rowCount }, (_, rowIndex) => {
    const sourceRow = matrix[rowIndex] ?? [];
    return Array.from({ length: colCount }, (_, colIndex) => {
      const cell = sourceRow[colIndex];
      return cell ? cloneCell(cell) : createEmptyCell();
    });
  });
};

export interface TableObjectProps {
  data: TableCellData[][];
  rows: number;
  cols: number;
  locked?: boolean;
  showOutline?: boolean;
  styleId?: string;
}

export const createTableSlideObject = (
  id: string,
  overrides: Partial<SlideObject> = {},
  options: Partial<TableObjectProps> = {},
): SlideObject => {
  const baseRows = Number.isFinite(options.rows) && options.rows ? Math.max(1, Math.floor(options.rows)) : DEFAULT_TABLE_ROWS;
  const baseCols = Number.isFinite(options.cols) && options.cols ? Math.max(1, Math.floor(options.cols)) : DEFAULT_TABLE_COLS;
  const data = normaliseTableData(options.data, baseRows, baseCols);
  const rows = data.length;
  const cols = data[0]?.length ?? 0;

  return {
    id,
    type: 'table',
    x: 144,
    y: 144,
    width: DEFAULT_TABLE_WIDTH,
    height: DEFAULT_TABLE_HEIGHT,
    zIndex: 1,
    rotation: 0,
    groupId: null,
    props: {
      data,
      rows,
      cols,
      locked: Boolean(options.locked),
      showOutline: options.showOutline !== false,
      ...(typeof options.styleId === 'string' ? { styleId: options.styleId } : {}),
    },
    ...overrides,
  };
};
