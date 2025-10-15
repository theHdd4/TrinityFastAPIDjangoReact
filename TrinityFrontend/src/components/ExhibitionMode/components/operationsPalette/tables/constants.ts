import type { SlideObject } from '../../../store/exhibitionStore';

export const DEFAULT_TABLE_ROWS = 3;
export const DEFAULT_TABLE_COLS = 3;
export const DEFAULT_TABLE_WIDTH = 420;
export const DEFAULT_TABLE_HEIGHT = 260;

export interface TableCellData {
  content: string;
  rowSpan?: number;
  colSpan?: number;
}

const coerceCellValue = (value: unknown): string => {
  if (typeof value === 'string') {
    return value;
  }
  if (value && typeof value === 'object' && 'content' in (value as Record<string, unknown>)) {
    const content = (value as Record<string, unknown>).content;
    return typeof content === 'string' ? content : '';
  }
  if (value == null) {
    return '';
  }
  return String(value);
};

export const createEmptyTableData = (rows: number, cols: number): string[][] => {
  const safeRows = Number.isFinite(rows) && rows > 0 ? Math.floor(rows) : DEFAULT_TABLE_ROWS;
  const safeCols = Number.isFinite(cols) && cols > 0 ? Math.floor(cols) : DEFAULT_TABLE_COLS;

  return Array.from({ length: safeRows }, () => Array.from({ length: safeCols }, () => ''));
};

const toMatrix = (value: unknown): string[][] | null => {
  if (!Array.isArray(value)) {
    return null;
  }

  const rows: string[][] = [];

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
): string[][] => {
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
    return Array.from({ length: colCount }, (_, colIndex) => sourceRow[colIndex] ?? '');
  });
};

export interface TableObjectProps {
  data: string[][];
  rows: number;
  cols: number;
  locked?: boolean;
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
    },
    ...overrides,
  };
};
