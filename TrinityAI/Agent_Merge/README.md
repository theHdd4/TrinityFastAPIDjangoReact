# Agent_Merge

LLM-powered assistant that prepares merge configurations for the Merge atom.
The language model prompt and JSON extraction live in `ai_logic.py` so an AI
expert can tweak behaviour without touching the FastAPI code.

## Endpoints

- `POST http://10.2.1.242:8002/merge` – generate merge settings from a prompt.
- `GET http://10.2.1.242:8002/history/{session_id}` – view conversation history.
- `GET http://10.2.1.242:8002/debug/{session_id}` – debug a merge session.
- `DELETE http://10.2.1.242:8002/session/{session_id}` – clear a session.
- `GET http://10.2.1.242:8002/sessions` – list active sessions.
- `GET http://10.2.1.242:8002/files` – list available files.
- `POST http://10.2.1.242:8002/reload-files` – reload file metadata from MinIO.
- `GET http://10.2.1.242:8002/health` – health information.

## Usage

Send a POST request to `/merge` with `{ "prompt": "merge orders.csv with products.csv" }`. The response contains a `merge_json` structure that specifies file names, join columns and join type. Use it with the FastAPI `/api/merge/perform` endpoint.
