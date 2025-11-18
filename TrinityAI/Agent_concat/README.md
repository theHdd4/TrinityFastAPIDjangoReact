# Concat Atom

## Purpose
The concat atom converts natural-language instructions into an executable configuration for concatenating two saved datasets (Arrow, CSV, Excel) inside MinIO. The backend produces the configuration only; the frontend validates the files, auto-executes the concat service, and streams user-facing feedback back into the Trinity AI chat.

## Component Map
- Backend prompt logic: `ai_logic.py` (`build_prompt`, `call_llm`, `extract_json`)
- Backend orchestration: `llm_concat.py` (`SmartConcatAgent`)
- API surface: `main_app.py` (`POST /concat`, `GET /files`, `GET /history/{session_id}`, `GET /health`)
- Frontend handler: `TrinityFrontend/src/components/TrinityAI/handlers/concatHandler.ts`
- Shared utilities: `TrinityFrontend/src/components/TrinityAI/handlers/utils.ts` (environment context, validation, messaging)

## End-to-End Flow
1. **Chat request** – The user asks to combine files. The UI sends the prompt, session, and environment context (`client/app/project`) to `POST /concat`.
2. **Prompt assembly** – `SmartConcatAgent.process_request` ensures file metadata is loaded from MinIO (via `FileLoader`) and builds a rich prompt with file inventories, conversation history, and memory.
3. **LLM call** – `call_llm` issues a chat completion to the configured model (`LLM_API_URL`, default `deepseek-r1:32b`). The prompt enforces two response shapes:
   - `success: true` → return `concat_json` with `bucket_name`, `file1`, `file2`, `concat_direction`
   - `success: false` → return suggestions, file analysis, and a `smart_response`
4. **JSON extraction** – `extract_json` strips `<think>` blocks and code fences, then parses the response. `SmartConcatAgent` updates per-session memory (history, successful configs, user preferences).
5. **FastAPI response** – `main_app.py` returns the processed JSON plus a trimmed `concat_config` helper with bare filenames and latency metadata.
6. **Frontend success flow** (`concatHandler.handleSuccess`):
   - Displays the `smart_response` message in chat.
   - Resolves AI filenames against `/api/data-upload-validate/list_saved_dataframes` to map to UI dropdown values (`object_name`).
   - Updates atom state (`file1`, `file2`, `direction`, `aiConfig`, `aiMessage`).
   - Auto-calls the concat perform endpoint (`${CONCAT_API}/perform`) with payload `{ file1, file2, concat_direction }`, using filename-only values.
   - Persists results and posts a completion message with result metadata.
7. **Frontend failure flow** – If `success: false`, the handler prints `smart_response` or suggestion lists, caches tips in atom state, and waits for user clarification.

## Required Inputs
A successful configuration requires:
- Two accessible file paths in MinIO (`file1`, `file2`). The LLM can output either bare filenames or prefixed paths; the frontend normalizes them.
- `concat_direction`: `"vertical"` (default) or `"horizontal"`.
- `bucket_name`: always `"trinity"`.
- Optional conversational memory: the agent prioritises files and orientations previously confirmed during the session.

## External Services
- **MinIO** – Source of stored dataframes. `SmartConcatAgent` dynamically discovers files by calling `/api/data-upload-validate/get_object_prefix` then listing objects with that prefix.
- **Trinity concat API** (`CONCAT_API`) – Performs the actual concatenation when the UI calls `/perform`.
- **Validate API** (`VALIDATE_API`) – Provides `list_saved_dataframes`, used by the frontend to map AI suggestions to UI selections.

## Sample API Usage
```bash
curl -X POST "http://localhost:8000/api/concat" \
  -H "Content-Type: application/json" \
  -d '{
        "prompt": "Combine mayo and beans datasets vertically",
        "session_id": "demo-session",
        "client_name": "acme",
        "app_name": "sales-ai",
        "project_name": "pilot"
      }'
```
Example `success` payload from the agent:
```json
{
  "success": true,
  "message": "Concat configuration ready: 20250813_094555_D0_KHC_UK_Mayo.arrow + 20250810_102155_D0_KHC_UK_Beans.arrow with vertical direction",
  "smart_response": "I've configured the concatenation operation...",
  "concat_json": {
    "bucket_name": "trinity",
    "file1": ["20250813_094555_D0_KHC_UK_Mayo.arrow"],
    "file2": ["20250810_102155_D0_KHC_UK_Beans.arrow"],
    "concat_direction": "vertical"
  },
  "session_id": "demo-session",
  "processing_time": 1.42
}
```

## Key Implementation Notes
- `SmartConcatAgent` caches file metadata but refreshes prefixes whenever environment context changes, ensuring multi-tenant correctness.
- JSON parsing strips `<think>` and fenced blocks to tolerate different LLM behaviours.
- The frontend always surfaces the `smart_response`. If the LLM omits it, a fallback message is injected before proceeding.
- Auto-perform includes guardrails: validation of file names, perform error messaging, and state rollbacks if the backend call fails.

## Troubleshooting
- **Missing files** – Ensure `/api/data-upload-validate/get_object_prefix` returns the correct prefix and that the files exist under that path in MinIO.
- **No auto-perform** – Confirm `CONCAT_API` is set and reachable. The handler logs the exact payload sent to `/perform`.
- **LLM returns placeholder names** – The handler logs mapping attempts and will default to raw values if no match is found; double-check recent dataframe saves.
- **Unexpected direction** – The agent learns preferred concatenation directions across the session; reset the session ID to start fresh.
# Agent_concat

Smart concatenation helper for the Concat atom. It uses an LLM to suggest files and orientation based on a text prompt.

The prompt template and response parsing live in `ai_logic.py`. Adjust that file
to change how the assistant works.

## Endpoints

- `POST http://192.168.1.98:8002/concat` – process a prompt and return concatenation instructions.
- `GET http://192.168.1.98:8002/history/{session_id}` – retrieve chat history for a session.
- `GET http://192.168.1.98:8002/session_details/{session_id}` – debug details for a session.
- `GET http://192.168.1.98:8002/files` – list available files from storage.
- `GET http://192.168.1.98:8002/health` – service health status.

## Usage

POST to `/concat` with `{ "prompt": "concat sales_2023.csv with sales_2024.csv" }`. The response includes a `concat_json` section that can be passed to the backend `/api/concat/perform` endpoint.

If the environment variable `CONCAT_PERFORM_URL` is set, the service will
automatically call this URL after a successful prompt parse and include the
`concat_result` from the backend in the response. It defaults to
`http://<HOST_IP>:<FASTAPI_PORT>/api/concat/perform`.
