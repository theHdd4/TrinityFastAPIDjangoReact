# DataFrame Operations API

Base URL: `/api/dataframe-operations`

## Endpoints

### POST `/load`
Upload a CSV file and begin a server-side session.

### POST `/filter_rows`
Body: `{ "df_id": "<id>", "column": "Country", "value": "India" }`

### POST `/sort`
Body: `{ "df_id": "<id>", "column": "Date", "direction": "asc" }`

### POST `/insert_row`
Body: `{ "df_id": "<id>", "row": {"A":1} }`

### POST `/delete_row`
Body: `{ "df_id": "<id>", "index": 10 }`

### POST `/insert_column`
Body: `{ "df_id": "<id>", "column": "NewCol", "value": 0 }`

### POST `/delete_column`
Body: `{ "df_id": "<id>", "column": "OldCol" }`

### POST `/update_cell`
Body: `{ "df_id": "<id>", "row_idx": 0, "column": "Sales", "value": 1000 }`

### POST `/rename_column`
Body: `{ "df_id": "<id>", "old": "Revenue", "new": "Sales" }`

### GET `/preview`
Query: `df_id`, `n` (optional) – returns first rows for preview.

### GET `/info`
Query: `df_id` – returns row/column counts and types.

### POST `/ai/execute_operations`
Body: `{ "df_id": "<id>", "operations": [ {"op": "filter_rows", "params": {"column":"Country","value":"India"}} ] }`

### POST `/save`
Existing endpoint for persisting data to MinIO.

## Frontend Integration
The frontend calls these APIs via `DATAFRAME_OPERATIONS_API` defined in `src/lib/api.ts`. Actions like editing cells, adding rows, or sorting send requests to the corresponding endpoints and refresh the table with returned data.
