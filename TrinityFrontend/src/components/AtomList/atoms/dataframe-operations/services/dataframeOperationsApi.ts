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
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function loadDataframe(file: File): Promise<DataFrameResponse> {
  const form = new FormData();
  form.append('file', file);
  console.log('API Call: /load');
  const res = await fetch(`${DATAFRAME_OPERATIONS_API}/load`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function editCell(dfId: string, row: number, column: string, value: any) {
  console.log('API Call: /edit_cell', { dfId, row, column, value });
  return postJSON(`${DATAFRAME_OPERATIONS_API}/edit_cell`, { df_id: dfId, row, column, value });
}

export function insertRow(dfId: string, index: number, direction: 'above' | 'below') {
  console.log('API Call: /insert_row', { dfId, index, direction });
  return postJSON(`${DATAFRAME_OPERATIONS_API}/insert_row`, { df_id: dfId, index, direction });
}

export function deleteRow(dfId: string, index: number) {
  console.log('API Call: /delete_row', { dfId, index });
  return postJSON(`${DATAFRAME_OPERATIONS_API}/delete_row`, { df_id: dfId, index });
}

export function duplicateRow(dfId: string, index: number) {
  console.log('API Call: /duplicate_row', { dfId, index });
  return postJSON(`${DATAFRAME_OPERATIONS_API}/duplicate_row`, { df_id: dfId, index });
}

export function insertColumn(dfId: string, index: number, name: string, def: any = '') {
  console.log('API Call: /insert_column', { dfId, index, name, def });
  return postJSON(`${DATAFRAME_OPERATIONS_API}/insert_column`, { df_id: dfId, index, name, default: def });
}

export function deleteColumn(dfId: string, name: string) {
  console.log('API Call: /delete_column', { dfId, name });
  return postJSON(`${DATAFRAME_OPERATIONS_API}/delete_column`, { df_id: dfId, name });
}

export function duplicateColumn(dfId: string, name: string, new_name: string) {
  console.log('API Call: /duplicate_column', { dfId, name, new_name });
  return postJSON(`${DATAFRAME_OPERATIONS_API}/duplicate_column`, { df_id: dfId, name, new_name });
}

export function moveColumn(dfId: string, from: string, to_index: number) {
  console.log('API Call: /move_column', { dfId, from, to_index });
  return postJSON(`${DATAFRAME_OPERATIONS_API}/move_column`, { df_id: dfId, from, to_index });
}

export function retypeColumn(dfId: string, name: string, new_type: string) {
  console.log('API Call: /retype_column', { dfId, name, new_type });
  return postJSON(`${DATAFRAME_OPERATIONS_API}/retype_column`, { df_id: dfId, name, new_type });
}

export function renameColumn(dfId: string, old_name: string, new_name: string) {
  console.log('API Call: /rename_column', { dfId, old_name, new_name });
  return postJSON(`${DATAFRAME_OPERATIONS_API}/rename_column`, { df_id: dfId, old_name, new_name });
}

export function sortDataframe(dfId: string, column: string, direction: 'asc' | 'desc') {
  console.log('API Call: /sort', { dfId, column, direction });
  return postJSON(`${DATAFRAME_OPERATIONS_API}/sort`, { df_id: dfId, column, direction });
}

export function filterRows(dfId: string, column: string, value: any) {
  console.log('API Call: /filter_rows', { dfId, column, value });
  return postJSON(`${DATAFRAME_OPERATIONS_API}/filter_rows`, { df_id: dfId, column, value });
}
