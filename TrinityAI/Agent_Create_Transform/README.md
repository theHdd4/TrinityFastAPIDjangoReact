# Agent_create_transform

Smart feature creation and transformation helper for data processing operations. It uses an LLM to understand natural language requests for creating new columns, transforming existing data, and renaming columns.

## Endpoints

- `POST http://10.2.1.242:8002/create-transform/` – process a create/transform prompt and return transformation instructions.
- `GET http://10.2.1.242:8002/create-transform/files` – list available files from storage.
- `POST http://10.2.1.242:8002/create-transform/reload-files` – reload files from MinIO.
- `DELETE http://10.2.1.242:8002/create-transform/session/{session_id}` – clear session history.
- `GET http://10.2.1.242:8002/create-transform/health` – service health status.

## Usage

POST to `/create-transform/` with `{ "prompt": "create a new column total_price by multiplying price and quantity", "session_id": "optional_session_id" }`. The response includes transformation configuration that can be passed to the backend for execution.

## Examples

```json
{
  "prompt": "create a new column total_price by multiplying price and quantity",
  "session_id": "user_session_123"
}
```

```json
{
  "prompt": "rename column 'old_name' to 'new_name'",
  "session_id": "user_session_123"
}
```

```json
{
  "prompt": "transform the date column to extract year and month",
  "session_id": "user_session_123"
}
```

The agent understands various transformation operations like mathematical calculations, string operations, date transformations, conditional logic, and column renaming.