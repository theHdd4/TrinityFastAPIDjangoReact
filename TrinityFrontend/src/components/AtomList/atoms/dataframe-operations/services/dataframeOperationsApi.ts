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
  const res = await fetch(`${DATAFRAME_OPERATIONS_API}/load`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function updateCell(dfId: string, row_idx: number, column: string, value: any) {
  return postJSON(`${DATAFRAME_OPERATIONS_API}/update_cell`, { df_id: dfId, row_idx, column, value });
}

export function insertRow(dfId: string, row: any = {}, index?: number) {
  return postJSON(`${DATAFRAME_OPERATIONS_API}/insert_row`, { df_id: dfId, row, index });
}

export function deleteRow(dfId: string, index: number) {
  return postJSON(`${DATAFRAME_OPERATIONS_API}/delete_row`, { df_id: dfId, index });
}

export function insertColumn(dfId: string, column: string, value: any = null, index?: number) {
  return postJSON(`${DATAFRAME_OPERATIONS_API}/insert_column`, { df_id: dfId, column, value, index });
}

export function deleteColumn(dfId: string, column: string) {
  return postJSON(`${DATAFRAME_OPERATIONS_API}/delete_column`, { df_id: dfId, column });
}

export function sortDataframe(dfId: string, column: string, direction: 'asc' | 'desc') {
  return postJSON(`${DATAFRAME_OPERATIONS_API}/sort`, { df_id: dfId, column, direction });
}

export function filterRows(dfId: string, column: string, value: any) {
  return postJSON(`${DATAFRAME_OPERATIONS_API}/filter_rows`, { df_id: dfId, column, value });
}
