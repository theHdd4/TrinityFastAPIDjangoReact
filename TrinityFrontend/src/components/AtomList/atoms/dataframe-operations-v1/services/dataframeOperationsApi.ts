import { DATAFRAME_OPERATIONS_V1_API } from '@/lib/api';

export interface DataFrameResponse {
  df_id: string;
  headers: string[];
  rows: any[];
  types: Record<string, string>;
  row_count: number;
  column_count: number;
}

async function postJSON(url: string, body: any) {
  console.log('[DataFrameOperationsAPI] POST', url, body);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('[DataFrameOperationsAPI] error', url, text);
    throw new Error(text);
  }
  try {
    const data = JSON.parse(text);
    console.log('[DataFrameOperationsAPI] response', url, data);
    return data;
  } catch {
    console.error('[DataFrameOperationsAPI] invalid JSON response', text);
    throw new Error(text);
  }
}

export async function loadDataframe(file: File): Promise<DataFrameResponse> {
  console.log('[DataFrameOperationsAPI] uploading file', file.name);
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${DATAFRAME_OPERATIONS_V1_API}/load`, {
    method: 'POST',
    body: form,
  });
  const text = await res.text();
  if (!res.ok) {
    console.error('[DataFrameOperationsAPI] load error', text);
    throw new Error(text);
  }
  const data = JSON.parse(text);
  console.log('[DataFrameOperationsAPI] load response', data);
  return data;
}

export function loadDataframeByKey(objectName: string): Promise<DataFrameResponse> {
  console.log('[DataFrameOperationsAPI] load by key', objectName);
  return postJSON(`${DATAFRAME_OPERATIONS_V1_API}/load_cached`, { object_name: objectName });
}

export function editCell(dfId: string, row: number, column: string, value: any) {
  return postJSON(`${DATAFRAME_OPERATIONS_V1_API}/edit_cell`, { df_id: dfId, row, column, value });
}

export function insertRow(dfId: string, index: number, direction: 'above' | 'below') {
  return postJSON(`${DATAFRAME_OPERATIONS_V1_API}/insert_row`, { df_id: dfId, index, direction });
}

export function deleteRow(dfId: string, index: number) {
  return postJSON(`${DATAFRAME_OPERATIONS_V1_API}/delete_row`, { df_id: dfId, index });
}

export function duplicateRow(dfId: string, index: number) {
  return postJSON(`${DATAFRAME_OPERATIONS_V1_API}/duplicate_row`, { df_id: dfId, index });
}

export function insertColumn(dfId: string, index: number, name: string, def: any = '') {
  return postJSON(`${DATAFRAME_OPERATIONS_V1_API}/insert_column`, { df_id: dfId, index, name, default: def });
}

export function deleteColumn(dfId: string, name: string) {
  return postJSON(`${DATAFRAME_OPERATIONS_V1_API}/delete_column`, { df_id: dfId, name });
}

export function duplicateColumn(dfId: string, name: string, new_name: string) {
  return postJSON(`${DATAFRAME_OPERATIONS_V1_API}/duplicate_column`, { df_id: dfId, name, new_name });
}

export function moveColumn(dfId: string, from: string, to_index: number) {
  return postJSON(`${DATAFRAME_OPERATIONS_V1_API}/move_column`, { df_id: dfId, from, to_index });
}

export function retypeColumn(dfId: string, name: string, new_type: string) {
  return postJSON(`${DATAFRAME_OPERATIONS_V1_API}/retype_column`, { df_id: dfId, name, new_type });
}

export function renameColumn(dfId: string, old_name: string, new_name: string) {
  return postJSON(`${DATAFRAME_OPERATIONS_V1_API}/rename_column`, { df_id: dfId, old_name, new_name });
}

export function sortDataframe(dfId: string, column: string, direction: 'asc' | 'desc') {
  return postJSON(`${DATAFRAME_OPERATIONS_V1_API}/sort`, { df_id: dfId, column, direction });
}

export function filterRows(dfId: string, column: string, value: any) {
  return postJSON(`${DATAFRAME_OPERATIONS_V1_API}/filter_rows`, { df_id: dfId, column, value });
}
