import type { SlideObject } from '../../../store/exhibitionStore';
import { FONT_OPTIONS } from '../textBox/constants';

export const DEFAULT_TABLE_ROWS = 3;
export const DEFAULT_TABLE_COLS = 3;
export const DEFAULT_TABLE_WIDTH = 420;
export const DEFAULT_TABLE_HEIGHT = 260;

export type TableTextAlign = 'left' | 'center' | 'right';

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
    groupId: null,
    props: {
      data,
      rows,
      cols,
      locked: Boolean(options.locked),
      showOutline: options.showOutline !== false,
    },
    ...overrides,
  };
};
