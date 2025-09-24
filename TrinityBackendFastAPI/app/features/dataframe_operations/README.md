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
Body: `{ "df_id": "<id>", "index": 4, "direction": "below" }`

### POST `/delete_row`
Body: `{ "df_id": "<id>", "index": 10 }`

### POST `/duplicate_row`
Body: `{ "df_id": "<id>", "index": 7 }`

### POST `/insert_column`
Body: `{ "df_id": "<id>", "index": 3, "name": "New Col", "default": "" }`

### POST `/delete_column`
Body: `{ "df_id": "<id>", "name": "OldCol" }`

### POST `/duplicate_column`
Body: `{ "df_id": "<id>", "name": "Revenue", "new_name": "Revenue_copy" }`

### POST `/move_column`
Body: `{ "df_id": "<id>", "from": "Date", "to_index": 1 }`

### POST `/retype_column`
Body: `{ "df_id": "<id>", "name": "Amount", "new_type": "number" }`

### POST `/edit_cell`
Body: `{ "df_id": "<id>", "row": 0, "column": "Sales", "value": 1000 }`

### POST `/rename_column`
Body: `{ "df_id": "<id>", "old_name": "Revenue", "new_name": "Sales" }`

### GET `/preview`
Query: `df_id`, `n` (optional) – returns first rows for preview.

### GET `/info`
Query: `df_id` – returns row/column counts and types.

### POST `/ai/execute_operations`
Body: `{ "df_id": "<id>", "operations": [ {"op": "filter_rows", "params": {"column":"Country","value":"India"}} ] }`

### POST `/save`
Existing endpoint for persisting data to MinIO.

**Body**

```json
{
  "df_id": "optional session identifier",
  "filename": "optional override for the saved Arrow file name",
  "csv_data": "CSV fallback used when no in-memory session is available"
}
```

When `df_id` is supplied the API reads directly from the active in-memory
session, which captures all of the latest dataframe operations without having
to reparse CSV payloads from the browser. If the session has expired, provide
`csv_data` so the dataframe can still be saved.

## Frontend Integration
The frontend calls these APIs via `DATAFRAME_OPERATIONS_API` defined in `src/lib/api.ts`. Actions like editing cells, adding rows, or sorting send requests to the corresponding endpoints and refresh the table with returned data.
