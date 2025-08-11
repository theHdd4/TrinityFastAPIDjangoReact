# Agent_Groupby

Smart groupby and aggregation helper for data analysis operations. It uses an LLM to understand natural language requests for grouping and aggregating data.

## Endpoints

- `POST http://10.2.1.242:8002/groupby/` – process a groupby prompt and return aggregation instructions.
- `GET http://10.2.1.242:8002/groupby/files` – list available files from storage.
- `POST http://10.2.1.242:8002/groupby/reload-files` – reload files from MinIO.
- `DELETE http://10.2.1.242:8002/groupby/session/{session_id}` – clear session history.
- `GET http://10.2.1.242:8002/groupby/health` – service health status.

## Usage

POST to `/groupby/` with `{ "prompt": "group by region and sum sales", "session_id": "optional_session_id" }`. The response includes aggregation configuration that can be passed to the backend for execution.

## Examples

```json
{
  "prompt": "group by region and calculate average sales",
  "session_id": "user_session_123"
}
```

```json
{
  "prompt": "group by category and product, then sum quantity and count orders",
  "session_id": "user_session_123"
}
```

The agent understands various aggregation functions like sum, count, average, min, max, and can handle multiple grouping columns and aggregation operations.