# Merge Atom

## Purpose
The merge atom turns natural-language requests into a merge configuration that joins two saved datasets on shared keys. The backend produces the configuration with conversational guidance; the frontend validates, executes the merge, and streams the status back to the user.

## Component Map
- Prompt contract: `ai_logic.py` (`build_merge_prompt`, `call_merge_llm`, `extract_json`)
- Merge agent core: `llm_merge.py` (`SmartMergeAgent`)
- FastAPI router: `main_app.py` (`POST /merge`, `/files`, `/history/{session_id}`, `/health`)
- Frontend integration: `TrinityFrontend/src/components/TrinityAI/handlers/mergeHandler.ts`
- Shared UI helpers: `handlers/utils.ts` (smart-response formatting, environment discovery, validation)

## Workflow Overview
1. **User prompt** – The UI posts a merge instruction, `session_id`, and environment metadata to `POST /merge`.
2. **Prompt generation** – `SmartMergeAgent.process_request` ensures MinIO file metadata is current, builds a history-aware prompt, and enforces required JSON schema (success vs guidance).
3. **LLM invocation** – `call_merge_llm` sends the prompt to the configured LLM (`LLM_API_URL`, default `deepseek-r1:32b`) with a high token budget to allow detailed `smart_response` output.
4. **Response parsing** – `extract_json` removes `<think>` blocks, balances braces, and validates JSON structure. The agent records successful merges in session memory (for suggestion biasing) and applies preferences such as defaulting to `outer` joins.
5. **API response shaping** – `main_app.py` normalises `file1`/`file2` to bare filenames, ensures `smart_response` exists (building a fallback if needed), and returns the enriched JSON with timing information.
6. **Frontend success handling** (`mergeHandler.handleSuccess`):
   - Shows the AI `smart_response` in chat and injects a forced test message for smoke verification.
   - Validates file paths (`validateFileInput`) and join columns.
   - Calls `list_saved_dataframes` from the Validate API to map the AI filenames to the canonical `object_name`.
   - Normalises join columns to lowercase (backend contract).
   - Stores config in atom state and triggers the merge perform endpoint (`${MERGE_API}/perform`) with URL-encoded form data `{ file1, file2, bucket_name, join_columns, join_type }`.
   - Saves results (`mergeResults.unsaved_data`) and posts completion details (join type, columns, shape).
   - Auto-saves the step outcome via `autoSaveStepResult`.
7. **Frontend failure handling** – If the agent returns guidance, the handler formats `smart_response`, suggestions, file analysis, and next steps directly into the chat while caching them in atom state for follow-up interactions.

## Required Fields for Success
- `merge_json.bucket_name` must be `"trinity"`.
- `merge_json.file1` and `merge_json.file2` must be valid saved datasets (arrays or strings).
- `merge_json.join_columns` has to list at least one shared column; the handler lowercases the values.
- `merge_json.join_type` defaults to `"outer"`; `"inner"`, `"left"`, `"right"` are also allowed.
- `smart_response` is mandatory in both success and failure cases. The backend synthesises one if the LLM omits it.

## External Dependencies
- **MinIO** – Source of dataframe objects. `SmartMergeAgent` loads files with columns using `FileLoader` and MinIO SDK.
- **Validate API** – Provides `list_saved_dataframes` for filename reconciliation and environment context via `get_object_prefix`.
- **Merge service** (`MERGE_API`) – Executes the actual data join on the backend when called with the LLM-produced configuration.
- **Laboratory store** – The handler interacts with atom settings to persist AI guidance and perform results.

## Sample API Call
```bash
curl -X POST "http://localhost:8000/api/merge" \
  -H "Content-Type: application/json" \
  -d '{
        "prompt": "Merge the latest mayo and beans datasets on market and week using an inner join",
        "session_id": "demo-merge",
        "client_name": "acme",
        "app_name": "sales-ai",
        "project_name": "pilot"
      }'
```
Expected success response excerpt:
```json
{
  "success": true,
  "smart_response": "I've configured the merge operation...",
  "merge_json": {
    "bucket_name": "trinity",
    "file1": "20250813_094555_D0_KHC_UK_Mayo.arrow",
    "file2": "20250810_102155_D0_KHC_UK_Beans.arrow",
    "join_columns": ["market", "week"],
    "join_type": "inner"
  },
  "message": "Merge configuration ready: 20250813_094555_D0_KHC_UK_Mayo.arrow + 20250810_102155_D0_KHC_UK_Beans.arrow using ['market', 'week'] columns with inner join",
  "processing_time": 1.87
}
```

## Behavioural Details
- `SmartMergeAgent` aggressively logs prompt, payload, and response content for observability and fallback construction.
- Session memory tracks `successful_configs` and `user_preferences`, enabling context-aware suggestions and default join types.
- The frontend handler always adds a forced diagnostic message when the success path runs. Remove or gate this message when moving beyond debugging scenarios.
- Join column validation is strict: missing columns trigger an error message with actionable next steps.
- When auto-perform succeeds, the handler stores the returned data in `mergeResults.unsaved_data`; the UI can render previews without immediate persistence.

## Troubleshooting
- **Join columns missing** – Ensure both datasets share the specified columns. The backend does not infer columns; the handler lowercases column names before execution.
- **File path mismatch** – Watch the handler logs for mapping attempts. If necessary, manually align MinIO object names with the names the LLM tends to produce or enrich session history to teach the model.
- **Perform endpoint failure** – Inspect the HTTP status and any JSON `detail` returned by `${MERGE_API}/perform`; the handler appends these details to the chat error message.
- **Stale file catalogue** – Trigger a new session or update environment variables so the agent refreshes prefixes and reloads MinIO metadata.



