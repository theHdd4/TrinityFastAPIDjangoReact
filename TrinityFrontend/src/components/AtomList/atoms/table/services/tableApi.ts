/**
 * API client for Table atom backend endpoints
 */

const TABLE_API = '/api/v1/atoms/table';

export interface TableLoadRequest {
  object_name: string;
}

export interface TableSettings {
  visible_columns?: string[];
  column_order?: string[];
  column_widths?: Record<string, number>;
  row_height?: number;
  show_row_numbers?: boolean;
  show_summary_row?: boolean;
  frozen_columns?: number;
  filters?: Record<string, any>;
  sort_config?: Array<{column: string; direction: 'asc' | 'desc'}>;
}

export interface TableUpdateRequest {
  table_id: string;
  settings: TableSettings;
}

export interface TableSaveRequest {
  table_id: string;
  filename?: string;
  overwrite_original?: boolean;
}

export interface TableResponse {
  table_id: string;
  columns: string[];
  rows: Array<Record<string, any>>;
  row_count: number;
  column_types: Record<string, string>;
  object_name?: string;
  settings?: TableSettings;
}

export interface TableSaveResponse {
  object_name: string;
  status: string;
  message: string;
  row_count: number;
  column_count: number;
}

/**
 * Load a table from MinIO
 */
export const loadTable = async (objectName: string): Promise<TableResponse> => {
  const response = await fetch(`${TABLE_API}/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ object_name: objectName })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to load table' }));
    throw new Error(error.detail || 'Failed to load table');
  }
  
  return response.json();
};

/**
 * Update table settings and get updated data
 */
export const updateTable = async (tableId: string, settings: TableSettings): Promise<TableResponse> => {
  const response = await fetch(`${TABLE_API}/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table_id: tableId, settings })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to update table' }));
    throw new Error(error.detail || 'Failed to update table');
  }
  
  return response.json();
};

/**
 * Save table to MinIO
 */
export const saveTable = async (tableId: string, filename?: string, overwriteOriginal?: boolean): Promise<TableSaveResponse> => {
  const response = await fetch(`${TABLE_API}/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      table_id: tableId, 
      filename,
      overwrite_original: overwriteOriginal || false
    })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to save table' }));
    throw new Error(error.detail || 'Failed to save table');
  }
  
  return response.json();
};

/**
 * Get paginated preview of table
 */
export const previewTable = async (tableId: string, page: number = 1, pageSize: number = 50) => {
  const response = await fetch(`${TABLE_API}/preview`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table_id: tableId, page, page_size: pageSize })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to preview table' }));
    throw new Error(error.detail || 'Failed to preview table');
  }
  
  return response.json();
};

/**
 * Compute aggregations
 */
export const aggregateTable = async (tableId: string, aggregations: Record<string, string[]>) => {
  const response = await fetch(`${TABLE_API}/aggregate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table_id: tableId, aggregations })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to compute aggregations' }));
    throw new Error(error.detail || 'Failed to compute aggregations');
  }
  
  return response.json();
};

/**
 * Get table info
 */
export const getTableInfo = async (tableId: string) => {
  const response = await fetch(`${TABLE_API}/info/${tableId}`);
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to get table info' }));
    throw new Error(error.detail || 'Failed to get table info');
  }
  
  return response.json();
};

/**
 * Delete table session
 */
export const deleteTableSession = async (tableId: string) => {
  const response = await fetch(`${TABLE_API}/session/${tableId}`, {
    method: 'DELETE'
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to delete session' }));
    throw new Error(error.detail || 'Failed to delete session');
  }
  
  return response.json();
};

/**
 * Check if service is alive
 */
export const checkTableService = async () => {
  try {
    const response = await fetch(`${TABLE_API}/test_alive`);
    return response.ok;
  } catch {
    return false;
  }
};

/**
 * Create blank table with m×n dimensions
 */
export const createBlankTable = async (rows: number, columns: number) => {
  const response = await fetch(`${TABLE_API}/create-blank`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows, columns })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to create blank table' }));
    throw new Error(error.detail || 'Failed to create blank table');
  }

  return response.json();
};

/**
 * Edit a single cell in the table
 */
export const editTableCell = async (tableId: string, row: number, column: string, value: any) => {
  const response = await fetch(`${TABLE_API}/edit-cell`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ table_id: tableId, row, column, value })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to edit cell' }));
    throw new Error(error.detail || 'Failed to edit cell');
  }

  return response.json();
};

