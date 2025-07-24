# Agent_concat

Smart concatenation helper for the Concat atom. It uses an LLM to suggest files and orientation based on a text prompt.

## Endpoints

- `POST http://192.168.1.98:8002/concat` – process a prompt and return concatenation instructions.
- `GET http://192.168.1.98:8002/history/{session_id}` – retrieve chat history for a session.
- `GET http://192.168.1.98:8002/session_details/{session_id}` – debug details for a session.
- `GET http://192.168.1.98:8002/files` – list available files from storage.
- `GET http://192.168.1.98:8002/health` – service health status.

## Usage

POST to `/concat` with `{ "prompt": "concat sales_2023.csv with sales_2024.csv" }`. The response includes a `concat_json` section that can be passed to the backend `/api/concat/perform` endpoint.
