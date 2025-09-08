// Web worker to process dataframe operations in the background
import type { DataFrameRow } from '../DataFrameOperationsAtom';

function safeToString(val: any): string {
  if (val === undefined || val === null) return '';
  try {
    return val.toString();
  } catch {
    return '';
  }
}

self.onmessage = (e: MessageEvent) => {
  const { headers, rows, filters, searchTerm, duplicateMap } = e.data as {
    headers: string[];
    rows: DataFrameRow[];
    filters: Record<string, any>;
    searchTerm: string;
    duplicateMap: Record<string, string>;
  };

  const term = searchTerm?.trim().toLowerCase() || '';

  const filtered: DataFrameRow[] = [];
  const uniqueSets: { [key: string]: Set<string> } = {};
  headers.forEach(h => {
    uniqueSets[h] = new Set();
  });

  const matchesRow = (row: DataFrameRow) => {
    if (term) {
      let found = false;
      for (const col of headers) {
        const valStr = safeToString(row[col]);
        if (valStr.toLowerCase().includes(term)) {
          found = true;
          break;
        }
      }
      if (!found) return false;
    }

    for (const [col, val] of Object.entries(filters)) {
      const filterCol = duplicateMap[col] || col;
      const cell = row[filterCol];
      if (Array.isArray(val)) {
        if (!val.includes(safeToString(cell))) return false;
      } else if (val && typeof val === 'object' && 'min' in val && 'max' in val) {
        const num = Number(cell);
        if (num < val.min || num > val.max) return false;
      } else {
        if (safeToString(cell) !== safeToString(val)) return false;
      }
    }
    return true;
  };

  for (const row of rows) {
    if (matchesRow(row)) {
      filtered.push(row);
      headers.forEach(h => {
        uniqueSets[h].add(safeToString(row[h]));
      });
    }
  }

  const uniqueValues: { [key: string]: string[] } = {};
  Object.keys(uniqueSets).forEach(h => {
    uniqueValues[h] = Array.from(uniqueSets[h])
      .filter(v => v !== '')
      .sort()
      .slice(0, 50);
  });

  (self as any).postMessage({ filteredRows: filtered, uniqueValues });
};

export {};
