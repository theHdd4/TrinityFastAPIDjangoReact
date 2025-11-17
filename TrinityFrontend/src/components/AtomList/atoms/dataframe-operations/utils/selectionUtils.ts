export type CellLocator = {
  rowKey: string;
  colKey: string;
  address?: string;
};

export type SelectionDescriptor =
  | { type: 'column'; colKeys: string[] }
  | { type: 'row'; rowKeys: string[] }
  | { type: 'cell'; locator: CellLocator }
  | { type: 'range'; start: CellLocator; end: CellLocator };

export const columnIndexToLetter = (index: number): string => {
  if (index < 0) return '';
  let letter = '';
  let current = index;

  while (current >= 0) {
    letter = String.fromCharCode((current % 26) + 65) + letter;
    current = Math.floor(current / 26) - 1;
  }

  return letter;
};

export const letterToColumnIndex = (letters: string): number => {
  const upper = letters.toUpperCase().trim();
  if (!upper) return -1;

  let index = 0;
  for (let i = 0; i < upper.length; i += 1) {
    const charCode = upper.charCodeAt(i);
    if (charCode < 65 || charCode > 90) {
      return -1;
    }
    index = index * 26 + (charCode - 64);
  }

  return index - 1;
};

export const toAddress = (rowIndex: number, colIndex: number): string => {
  if (rowIndex < 0 || colIndex < 0) return '';
  return ${columnIndexToLetter(colIndex)};
};

export const parseAddress = (address: string): { rowIndex: number; colIndex: number } | null => {
  const match = address?.trim().match(/^([A-Za-z]+)(\d+)$/);
  if (!match) {
    return null;
  }

  const colIndex = letterToColumnIndex(match[1]);
  const rowIndex = Number.parseInt(match[2], 10) - 1;

  if (colIndex < 0 || Number.isNaN(rowIndex) || rowIndex < 0) {
    return null;
  }

  return { colIndex, rowIndex };
};

export const makeCellKey = (locator: CellLocator): string => ${locator.rowKey}::;

const DF_DEBUG_FLAG = '__dfDebug';

export const debugSelection = (event: string, payload: unknown): void => {
  if (typeof window === 'undefined') {
    return;
  }

  if (!(window as Record<string, unknown>)[DF_DEBUG_FLAG]) {
    return;
  }

  const timestamp = new Date().toISOString();

  try {
    console.debug([df-selection][] , payload);
  } catch {
    console.debug([df-selection][] , '[unserializable payload]');
  }
};

export const setSelectionDebugEnabled = (enabled: boolean): void => {
  if (typeof window === 'undefined') {
    return;
  }

  (window as Record<string, unknown>)[DF_DEBUG_FLAG] = enabled;
};
