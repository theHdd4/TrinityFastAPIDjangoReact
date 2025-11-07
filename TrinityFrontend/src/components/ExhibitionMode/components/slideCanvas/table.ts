import {
  DEFAULT_TABLE_COLS,
  DEFAULT_TABLE_ROWS,
  normaliseTableData,
  normaliseTableHeaders,
  ensureTableStyleId,
  type TableCellData,
  type TableCellFormatting,
} from '../operationsPalette/tables/constants';
import type { SlideObject } from '../../store/exhibitionStore';

export type TableState = {
  data: TableCellData[][];
  rows: number;
  cols: number;
  locked: boolean;
  showOutline: boolean;
  headers: TableCellData[];
  styleId: string;
};

const coercePositiveInteger = (value: unknown, fallback: number): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  const integer = Math.floor(numeric);
  return integer > 0 ? integer : fallback;
};

const extractTableHeaders = (value: unknown, fallbackCount: number): TableCellData[] => {
  return normaliseTableHeaders(value, fallbackCount);
};

export const readTableState = (object: SlideObject): TableState => {
  const props = (object.props ?? {}) as Record<string, unknown> | undefined;
  const fallbackRows = coercePositiveInteger(props?.rows, DEFAULT_TABLE_ROWS);
  const fallbackCols = coercePositiveInteger(props?.cols, DEFAULT_TABLE_COLS);
  const data = normaliseTableData(props?.data, fallbackRows, fallbackCols);
  const colCount = data[0]?.length ?? 0;
  const headers = extractTableHeaders(props?.headers, colCount);
  const styleId = ensureTableStyleId(props?.styleId);

  return {
    data,
    rows: data.length,
    cols: colCount,
    locked: Boolean(props?.locked),
    showOutline: props?.showOutline !== false,
    headers,
    styleId,
  };
};

export const tableStatesEqual = (a: TableState, b: TableState) => {
  return (
    a.data === b.data &&
    a.rows === b.rows &&
    a.cols === b.cols &&
    a.locked === b.locked &&
    a.showOutline === b.showOutline &&
    a.headers === b.headers &&
    a.styleId === b.styleId
  );
};

export const formattingShallowEqual = (a: TableCellFormatting, b: TableCellFormatting) => {
  if (a === b) {
    return true;
  }
  if (!a || !b) {
    return false;
  }
  const keys = Object.keys({ ...a, ...b }) as (keyof TableCellFormatting)[];
  return keys.every(key => a[key] === b[key]);
};
