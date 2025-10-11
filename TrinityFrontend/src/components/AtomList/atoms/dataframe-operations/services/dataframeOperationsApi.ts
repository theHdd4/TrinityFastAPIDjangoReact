import { DATAFRAME_OPERATIONS_API } from '@/lib/api';

export interface DataFrameResponse {
  df_id: string;
  headers: string[];
  rows: any[];
  types: Record<string, string>;
  row_count: number;
  column_count: number;
}

async function postJSON(url: string, body: any) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text);
  }
}

export async function loadDataframe(file: File): Promise<DataFrameResponse> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${DATAFRAME_OPERATIONS_API}/load`, {
    method: 'POST',
    body: form,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(text);
  }
  return JSON.parse(text);
}

export function loadDataframeByKey(objectName: string): Promise<DataFrameResponse> {
  return postJSON(`${DATAFRAME_OPERATIONS_API}/load_cached`, { object_name: objectName });
}

export function editCell(dfId: string, row: number, column: string, value: any) {
  return postJSON(`${DATAFRAME_OPERATIONS_API}/edit_cell`, { df_id: dfId, row, column, value });
}

export function insertRow(dfId: string, index: number, direction: 'above' | 'below') {
  return postJSON(`${DATAFRAME_OPERATIONS_API}/insert_row`, { df_id: dfId, index, direction });
}

export function deleteRow(dfId: string, index: number) {
  return postJSON(`${DATAFRAME_OPERATIONS_API}/delete_row`, { df_id: dfId, index });
}

export function deleteRowsBulk(dfId: string, indices: number[]) {
  return postJSON(`${DATAFRAME_OPERATIONS_API}/delete_rows_bulk`, { df_id: dfId, indices });
}

export function duplicateRow(dfId: string, index: number) {
  return postJSON(`${DATAFRAME_OPERATIONS_API}/duplicate_row`, { df_id: dfId, index });
}

export function insertColumn(dfId: string, index: number, name: string, def: any = '') {
  return postJSON(`${DATAFRAME_OPERATIONS_API}/insert_column`, { df_id: dfId, index, name, default: def });
}

export function deleteColumn(dfId: string, name: string) {
  console.log('[API] deleteColumn called with:', { df_id: dfId, name });
  return postJSON(`${DATAFRAME_OPERATIONS_API}/delete_column`, { df_id: dfId, name });
}

export function duplicateColumn(dfId: string, name: string, new_name: string) {
  return postJSON(`${DATAFRAME_OPERATIONS_API}/duplicate_column`, { df_id: dfId, name, new_name });
}

export function moveColumn(dfId: string, from: string, to_index: number) {
  return postJSON(`${DATAFRAME_OPERATIONS_API}/move_column`, { df_id: dfId, from, to_index });
}

export function retypeColumn(dfId: string, name: string, new_type: string) {
  return postJSON(`${DATAFRAME_OPERATIONS_API}/retype_column`, { df_id: dfId, name, new_type });
}

export function roundColumn(dfId: string, name: string, decimal_places: number) {
  return postJSON(`${DATAFRAME_OPERATIONS_API}/round_column`, { df_id: dfId, name, decimal_places });
}

export function renameColumn(dfId: string, old_name: string, new_name: string) {
  return postJSON(`${DATAFRAME_OPERATIONS_API}/rename_column`, { df_id: dfId, old_name, new_name });
}

export function sortDataframe(dfId: string, column: string, direction: 'asc' | 'desc') {
  return postJSON(`${DATAFRAME_OPERATIONS_API}/sort`, { df_id: dfId, column, direction });
}

export function filterRows(dfId: string, column: string, value: any) {
  return postJSON(`${DATAFRAME_OPERATIONS_API}/filter_rows`, { df_id: dfId, column, value });
}

export function applyFormula(dfId: string, target_column: string, formula: string) {
  return postJSON(`${DATAFRAME_OPERATIONS_API}/apply_formula`, {
    df_id: dfId,
    target_column,
    formula,
  });
}

export function describeColumn(dfId: string, column: string) {
  return postJSON(`${DATAFRAME_OPERATIONS_API}/describe_column`, {
    df_id: dfId,
    column,
  });
}

export function transformColumnCase(dfId: string, column: string, caseType: 'lower' | 'upper' | 'camel' | 'pascal' | 'lower_camel' | 'snake' | 'screaming_snake' | 'kebab' | 'train' | 'flat') {
  return postJSON(`${DATAFRAME_OPERATIONS_API}/transform_column_case`, {
    df_id: dfId,
    column,
    case_type: caseType,
  });
}

export function findAndReplace(dfId: string, findText: string, replaceText: string, replaceAll: boolean = false, caseSensitive: boolean = false) {
  return postJSON(`${DATAFRAME_OPERATIONS_API}/find_and_replace`, {
    df_id: dfId,
    find_text: findText,
    replace_text: replaceText,
    replace_all: replaceAll,
    case_sensitive: caseSensitive,
  });
}

export function countMatches(dfId: string, findText: string, caseSensitive: boolean = false) {
  return postJSON(`${DATAFRAME_OPERATIONS_API}/count_matches`, {
    df_id: dfId,
    find_text: findText,
    case_sensitive: caseSensitive,
  });
}