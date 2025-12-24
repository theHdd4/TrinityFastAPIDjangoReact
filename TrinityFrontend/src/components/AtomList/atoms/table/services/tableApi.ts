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

import { ConditionalFormatRule } from '../components/conditional-formatting/types';

export interface TableMetadata {
  cellFormatting?: {
    [rowIndex: string]: {
      [column: string]: {
        html?: string;
        fontFamily?: string;
        fontSize?: number;
        bold?: boolean;
        italic?: boolean;
        underline?: boolean;
        strikethrough?: boolean;
        textColor?: string;
        backgroundColor?: string;
        textAlign?: 'left' | 'center' | 'right';
      };
    };
  };
  design?: {
    theme?: string;
    borderStyle?: string;
    customColors?: {
      header?: string;
      oddRow?: string;
      evenRow?: string;
      border?: string;
    };
    columnAlignment?: {
      [columnName: string]: {
        horizontal: 'left' | 'center' | 'right';
        vertical: 'top' | 'middle' | 'bottom';
      };
    };
    columnFontStyles?: {
      [columnName: string]: {
        fontSize?: number;
        bold?: boolean;
        italic?: boolean;
        color?: string;
      };
    };
  };
  layout?: {
    headerRow?: boolean;
    totalRow?: boolean;
    bandedRows?: boolean;
    bandedColumns?: boolean;
    firstColumn?: boolean;
    lastColumn?: boolean;
  };
  columnWidths?: Record<string, number>;
  rowHeights?: Record<number, number>;
}

export interface TableSaveRequest {
  table_id: string;
  filename?: string;
  overwrite_original?: boolean;
  use_header_row?: boolean;
  conditional_format_rules?: ConditionalFormatRule[];
  metadata?: TableMetadata;
}

// Backend metadata format (snake_case) - matches backend schema
export interface BackendTableMetadata {
  cell_formatting?: {
    [rowIndex: string]: {
      [column: string]: {
        html?: string;
        fontFamily?: string;
        fontSize?: number;
        bold?: boolean;
        italic?: boolean;
        underline?: boolean;
        strikethrough?: boolean;
        textColor?: string;
        backgroundColor?: string;
        textAlign?: 'left' | 'center' | 'right';
      };
    };
  };
  design?: {
    theme?: string;
    borderStyle?: string;
    customColors?: {
      header?: string;
      oddRow?: string;
      evenRow?: string;
      border?: string;
    };
    columnAlignment?: {
      [columnName: string]: {
        horizontal: 'left' | 'center' | 'right';
        vertical: 'top' | 'middle' | 'bottom';
      };
    };
    columnFontStyles?: {
      [columnName: string]: {
        fontSize?: number;
        bold?: boolean;
        italic?: boolean;
        color?: string;
      };
    };
  };
  layout?: {
    headerRow?: boolean;
    totalRow?: boolean;
    bandedRows?: boolean;
    bandedColumns?: boolean;
    firstColumn?: boolean;
    lastColumn?: boolean;
  };
  column_widths?: Record<string, number>;
  row_heights?: Record<number, number>;
}

export interface TableResponse {
  table_id: string;
  columns: string[];
  rows: Array<Record<string, any>>;
  row_count: number;
  column_types: Record<string, string>;
  object_name?: string;
  settings?: TableSettings;
  conditional_format_styles?: Record<string, Record<string, Record<string, string>>>;
  metadata?: BackendTableMetadata;  // Backend sends snake_case
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
 * @param objectName Path to Arrow file in MinIO
 * @param atomId Atom instance ID for pipeline tracking
/**
 * Load a table from MinIO
 * @param objectName Path to the Arrow file in MinIO
 * @param atomId Atom instance ID for pipeline tracking
 * @param cardId Card ID for pipeline tracking
 * @param canvasPosition Canvas position for pipeline tracking
 * @param skipPipelineRecording Skip recording to pipeline (used when called from within KPI Dashboard)
 */
export const loadTable = async (
  objectName: string,
  atomId?: string,
  cardId?: string,
  canvasPosition?: number,
  skipPipelineRecording?: boolean
): Promise<TableResponse> => {
  // Build query parameters for pipeline tracking (like feature-overview and groupby)
  const queryParams = new URLSearchParams();
  if (atomId) queryParams.append('atom_id', atomId);
  if (cardId) queryParams.append('card_id', cardId);
  if (canvasPosition !== undefined) queryParams.append('canvas_position', canvasPosition.toString());
  
  const url = `${TABLE_API}/load${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      object_name: objectName,
      atom_id: atomId,
      project_id: undefined, // Will be extracted from environment
      skip_pipeline_recording: skipPipelineRecording || false
    })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to load table' }));
    throw new Error(error.detail || 'Failed to load table');
  }
  
  return response.json();
};

/**
 * Update table settings and get updated data
 * @param tableId Table session ID
 * @param settings Table settings to apply
 * @param atomId Atom instance ID for pipeline tracking
 * @param cardId Card ID for pipeline tracking
 * @param canvasPosition Canvas position for pipeline tracking
 */
export const updateTable = async (
  tableId: string, 
  settings: TableSettings,
  atomId?: string,
  cardId?: string,
  canvasPosition?: number
): Promise<TableResponse> => {
  // Build query parameters for pipeline tracking
  const queryParams = new URLSearchParams();
  if (atomId) queryParams.append('atom_id', atomId);
  if (cardId) queryParams.append('card_id', cardId);
  if (canvasPosition !== undefined) queryParams.append('canvas_position', canvasPosition.toString());
  
  const url = `${TABLE_API}/update${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      table_id: tableId, 
      settings,
      atom_id: atomId,
      project_id: undefined // Will be extracted from environment
    })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to update table' }));
    throw new Error(error.detail || 'Failed to update table');
  }
  
  return response.json();
};

/**
 * Save table to MinIO
 * @param tableId Table session ID
 * @param filename Optional filename (without .arrow extension)
 * @param overwriteOriginal If true, overwrite original file
 * @param useHeaderRow If true, first row values become column names (for blank tables with header row ON)
 * @param conditionalFormatRules Optional conditional formatting rules
 * @param metadata Optional table metadata (formatting, design, layout)
 * @param atomId Atom instance ID for pipeline tracking
 * @param cardId Card ID for pipeline tracking
 * @param canvasPosition Canvas position for pipeline tracking
 */
export const saveTable = async (
  tableId: string, 
  filename?: string, 
  overwriteOriginal?: boolean,
  useHeaderRow?: boolean,
  conditionalFormatRules?: ConditionalFormatRule[],
  metadata?: TableMetadata,
  atomId?: string,
  cardId?: string,
  canvasPosition?: number
): Promise<TableSaveResponse> => {
  // Get environment variables for client/app/project (same as Metrics)
  const envStr = localStorage.getItem('env');
  const env = envStr ? JSON.parse(envStr) : {};
  const stored = localStorage.getItem('current-project');
  const project = stored ? JSON.parse(stored) : {};
  
  // Build query parameters for pipeline tracking
  const queryParams = new URLSearchParams();
  if (atomId) queryParams.append('atom_id', atomId);
  if (cardId) queryParams.append('card_id', cardId);
  if (canvasPosition !== undefined) queryParams.append('canvas_position', canvasPosition.toString());
  // Add client/app/project to query params (same as Metrics pattern)
  if (env.CLIENT_NAME) queryParams.append('client_name', env.CLIENT_NAME);
  if (env.APP_NAME) queryParams.append('app_name', env.APP_NAME);
  if (env.PROJECT_NAME) queryParams.append('project_name', env.PROJECT_NAME);
  
  const url = `${TABLE_API}/save${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      table_id: tableId, 
      filename,
      overwrite_original: overwriteOriginal || false,
      use_header_row: useHeaderRow || false,
      conditional_format_rules: conditionalFormatRules || [],
      metadata: metadata ? {
        cell_formatting: metadata.cellFormatting,
        design: metadata.design,
        layout: metadata.layout,
        column_widths: metadata.columnWidths,
        row_heights: metadata.rowHeights,
      } : undefined,
      atom_id: atomId,
      project_id: undefined // Will be extracted from environment
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
 * @param rows Number of rows
 * @param columns Number of columns
 * @param useHeaderRow If true, first row will be treated as headers (default: false)
 */
export const createBlankTable = async (rows: number, columns: number, useHeaderRow: boolean = false) => {
  const response = await fetch(`${TABLE_API}/create-blank`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows, columns, use_header_row: useHeaderRow })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to create blank table' }));
    throw new Error(error.detail || 'Failed to create blank table');
  }

  return response.json();
};

/**
 * Edit a single cell in the table
 * @param tableId Table session ID
 * @param row Row index
 * @param column Column name
 * @param value New cell value
 * @param atomId Atom instance ID for pipeline tracking
 * @param cardId Card ID for pipeline tracking
 * @param canvasPosition Canvas position for pipeline tracking
 */
export const editTableCell = async (
  tableId: string, 
  row: number, 
  column: string, 
  value: any,
  atomId?: string,
  cardId?: string,
  canvasPosition?: number
) => {
  // Build query parameters for pipeline tracking
  const queryParams = new URLSearchParams();
  if (atomId) queryParams.append('atom_id', atomId);
  if (cardId) queryParams.append('card_id', cardId);
  if (canvasPosition !== undefined) queryParams.append('canvas_position', canvasPosition.toString());
  
  const url = `${TABLE_API}/edit-cell${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      table_id: tableId, 
      row, 
      column, 
      value,
      atom_id: atomId,
      project_id: undefined // Will be extracted from environment
    })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to edit cell' }));
    throw new Error(error.detail || 'Failed to edit cell');
  }
  
  return response.json();
};

/**
 * Delete a column from the table
 * @param tableId Table session ID
 * @param column Column name to delete
 * @param atomId Atom instance ID for pipeline tracking
 * @param cardId Card ID for pipeline tracking
 * @param canvasPosition Canvas position for pipeline tracking
 */
export const deleteColumn = async (
  tableId: string, 
  column: string,
  atomId?: string,
  cardId?: string,
  canvasPosition?: number
): Promise<TableResponse> => {
  // Build query parameters for pipeline tracking
  const queryParams = new URLSearchParams();
  if (atomId) queryParams.append('atom_id', atomId);
  if (cardId) queryParams.append('card_id', cardId);
  if (canvasPosition !== undefined) queryParams.append('canvas_position', canvasPosition.toString());
  
  const url = `${TABLE_API}/delete-column${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      table_id: tableId, 
      column,
      atom_id: atomId,
      project_id: undefined // Will be extracted from environment
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to delete column' }));
    throw new Error(error.detail || 'Failed to delete column');
  }

  return response.json();
};

/**
 * Insert a new column into the table
 * @param tableId Table session ID
 * @param index Index where to insert the column
 * @param name Column name
 * @param defaultValue Default value for the new column
 * @param atomId Atom instance ID for pipeline tracking
 * @param cardId Card ID for pipeline tracking
 * @param canvasPosition Canvas position for pipeline tracking
 */
export const insertColumn = async (
  tableId: string,
  index: number,
  name: string,
  defaultValue?: any,
  atomId?: string,
  cardId?: string,
  canvasPosition?: number
): Promise<TableResponse> => {
  // Build query parameters for pipeline tracking
  const queryParams = new URLSearchParams();
  if (atomId) queryParams.append('atom_id', atomId);
  if (cardId) queryParams.append('card_id', cardId);
  if (canvasPosition !== undefined) queryParams.append('canvas_position', canvasPosition.toString());
  
  const url = `${TABLE_API}/insert-column${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      table_id: tableId,
      index,
      name,
      default_value: defaultValue,
      atom_id: atomId,
      project_id: undefined // Will be extracted from environment
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to insert column' }));
    throw new Error(error.detail || 'Failed to insert column');
  }

  return response.json();
};

/**
 * Rename a column
 * @param tableId Table session ID
 * @param oldName Current column name
 * @param newName New column name
 * @param atomId Atom instance ID for pipeline tracking
 * @param cardId Card ID for pipeline tracking
 * @param canvasPosition Canvas position for pipeline tracking
 */
export const renameColumn = async (
  tableId: string,
  oldName: string,
  newName: string,
  atomId?: string,
  cardId?: string,
  canvasPosition?: number
): Promise<TableResponse> => {
  // Build query parameters for pipeline tracking
  const queryParams = new URLSearchParams();
  if (atomId) queryParams.append('atom_id', atomId);
  if (cardId) queryParams.append('card_id', cardId);
  if (canvasPosition !== undefined) queryParams.append('canvas_position', canvasPosition.toString());
  
  const url = `${TABLE_API}/rename-column${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      table_id: tableId,
      old_name: oldName,
      new_name: newName,
      atom_id: atomId,
      project_id: undefined // Will be extracted from environment
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to rename column' }));
    throw new Error(error.detail || 'Failed to rename column');
  }

  return response.json();
};

/**
 * Round numeric values in a column
 * @param tableId Table session ID
 * @param column Column name
 * @param decimalPlaces Number of decimal places
 * @param atomId Atom instance ID for pipeline tracking
 * @param cardId Card ID for pipeline tracking
 * @param canvasPosition Canvas position for pipeline tracking
 */
export const roundColumn = async (
  tableId: string,
  column: string,
  decimalPlaces: number,
  atomId?: string,
  cardId?: string,
  canvasPosition?: number
): Promise<TableResponse> => {
  // Build query parameters for pipeline tracking
  const queryParams = new URLSearchParams();
  if (atomId) queryParams.append('atom_id', atomId);
  if (cardId) queryParams.append('card_id', cardId);
  if (canvasPosition !== undefined) queryParams.append('canvas_position', canvasPosition.toString());
  
  const url = `${TABLE_API}/round-column${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      table_id: tableId,
      column,
      decimal_places: decimalPlaces,
      atom_id: atomId,
      project_id: undefined // Will be extracted from environment
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to round column' }));
    throw new Error(error.detail || 'Failed to round column');
  }

  return response.json();
};

/**
 * Change column data type
 * @param tableId Table session ID
 * @param column Column name
 * @param newType New data type
 * @param atomId Atom instance ID for pipeline tracking
 * @param cardId Card ID for pipeline tracking
 * @param canvasPosition Canvas position for pipeline tracking
 */
export const retypeColumn = async (
  tableId: string,
  column: string,
  newType: string,
  atomId?: string,
  cardId?: string,
  canvasPosition?: number
): Promise<TableResponse> => {
  // Build query parameters for pipeline tracking
  const queryParams = new URLSearchParams();
  if (atomId) queryParams.append('atom_id', atomId);
  if (cardId) queryParams.append('card_id', cardId);
  if (canvasPosition !== undefined) queryParams.append('canvas_position', canvasPosition.toString());
  
  const url = `${TABLE_API}/retype-column${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      table_id: tableId,
      column,
      new_type: newType,
      atom_id: atomId,
      project_id: undefined // Will be extracted from environment
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to retype column' }));
    throw new Error(error.detail || 'Failed to retype column');
  }

  return response.json();
};

/**
 * Transform text case in a column
 * @param tableId Table session ID
 * @param column Column name
 * @param caseType Case type (uppercase, lowercase, title)
 * @param atomId Atom instance ID for pipeline tracking
 * @param cardId Card ID for pipeline tracking
 * @param canvasPosition Canvas position for pipeline tracking
 */
export const transformCase = async (
  tableId: string,
  column: string,
  caseType: string,
  atomId?: string,
  cardId?: string,
  canvasPosition?: number
): Promise<TableResponse> => {
  // Build query parameters for pipeline tracking
  const queryParams = new URLSearchParams();
  if (atomId) queryParams.append('atom_id', atomId);
  if (cardId) queryParams.append('card_id', cardId);
  if (canvasPosition !== undefined) queryParams.append('canvas_position', canvasPosition.toString());
  
  const url = `${TABLE_API}/transform-case${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      table_id: tableId,
      column,
      case_type: caseType,
      atom_id: atomId,
      project_id: undefined // Will be extracted from environment
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to transform case' }));
    throw new Error(error.detail || 'Failed to transform case');
  }

  return response.json();
};

/**
 * Duplicate a column
 */
/**
 * Duplicate a column
 * @param tableId Table session ID
 * @param column Column name to duplicate
 * @param newName Name for the duplicated column
 * @param atomId Atom instance ID for pipeline tracking
 * @param cardId Card ID for pipeline tracking
 * @param canvasPosition Canvas position for pipeline tracking
 */
export const duplicateColumn = async (
  tableId: string,
  column: string,
  newName: string,
  atomId?: string,
  cardId?: string,
  canvasPosition?: number
): Promise<TableResponse> => {
  // Build query parameters for pipeline tracking
  const queryParams = new URLSearchParams();
  if (atomId) queryParams.append('atom_id', atomId);
  if (cardId) queryParams.append('card_id', cardId);
  if (canvasPosition !== undefined) queryParams.append('canvas_position', canvasPosition.toString());
  
  const url = `${TABLE_API}/duplicate-column${queryParams.toString() ? '?' + queryParams.toString() : ''}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      table_id: tableId,
      column,
      new_name: newName,
      atom_id: atomId,
      project_id: undefined // Will be extracted from environment
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to duplicate column' }));
    throw new Error(error.detail || 'Failed to duplicate column');
  }

  return response.json();
};

/**
 * Conditional Formatting Types
 */
export interface ConditionalFormatRule {
  type: 'highlight' | 'color_scale' | 'data_bar' | 'icon_set';
  id: string;
  enabled: boolean;
  priority: number;
  column: string;
  operator?: 'gt' | 'lt' | 'eq' | 'ne' | 'contains' | 'starts_with' | 'ends_with' | 'between' | 'top_n' | 'bottom_n' | 'above_average' | 'below_average';
  value1?: any;
  value2?: any;
  style?: {
    backgroundColor?: string;
    textColor?: string;
    fontWeight?: 'bold' | 'normal';
    fontSize?: number;
  };
  min_color?: string;
  max_color?: string;
  mid_color?: string;
  color?: string;
  show_value?: boolean;
  icon_set?: 'arrows' | 'traffic_lights' | 'stars' | 'checkmarks';
  thresholds?: Record<string, number>;
}

export interface FormatRequest {
  table_id: string;
  rules: ConditionalFormatRule[];
}

export interface FormatResponse {
  table_id: string;
  styles: Record<string, Record<string, Record<string, string>>>;
  evaluated_at?: string;
}

/**
 * Evaluate conditional formatting rules
 */
export const evaluateConditionalFormats = async (
  tableId: string,
  rules: ConditionalFormatRule[]
): Promise<FormatResponse> => {
  const response = await fetch(`${TABLE_API}/formatting/evaluate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      table_id: tableId,
      rules
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to evaluate conditional formatting' }));
    throw new Error(error.detail || 'Failed to evaluate conditional formatting');
  }

  return response.json();
};

/**
 * Clear conditional formatting cache
 */
export const clearFormattingCache = async (tableId: string): Promise<{ status: string; cleared_keys: number }> => {
  const response = await fetch(`${TABLE_API}/formatting/cache/${tableId}`, {
    method: 'DELETE'
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to clear cache' }));
    throw new Error(error.detail || 'Failed to clear cache');
  }

  return response.json();
};

/**
 * Restore a session from MongoDB/MinIO draft
 */
export interface RestoreSessionRequest {
  table_id: string;
  atom_id?: string;
  project_id?: string;
}

export interface RestoreSessionResponse {
  table_id: string;
  restored: boolean;
  has_unsaved_changes: boolean;
  change_count: number;
  data?: TableResponse;
  message?: string;
}

export const restoreSession = async (
  tableId: string,
  atomId?: string,
  projectId?: string
): Promise<RestoreSessionResponse> => {
  const response = await fetch(`${TABLE_API}/restore-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      table_id: tableId,
      atom_id: atomId,
      project_id: projectId
    })
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Failed to restore session' }));
    throw new Error(error.detail || 'Failed to restore session');
  }

  return response.json();
};

