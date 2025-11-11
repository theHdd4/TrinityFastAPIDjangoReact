# Create / Transform Atom

## Purpose
The create/transform atom converts user requests into JSON describing column-level feature engineering to run against a single dataset (adding, multiplying, rolling, STL decomposition, etc.). The backend returns only the configuration; the frontend validates, populates the Create Column UI, executes the operation, and surfaces results.

## Component Map
- Prompt and JSON parsing: `ai_logic.py` (`build_prompt_create_transform`, `call_llm_create_transform`, `extract_json_from_response`)
- Agent orchestration: `llm_create.py` (`SmartCreateTransformAgent`)
- FastAPI router: `main_app.py` (`POST /create-transform`, `/files`, `/history/{session_id}`, `/health`)
- Frontend integration: `TrinityFrontend/src/components/TrinityAI/handlers/createColumnHandler.ts`
- Shared utilities: `handlers/utils.ts` for message formatting, environment resolution, validation, path construction

## Workflow
1. **User request** – The chat UI collects `prompt`, `session_id`, and optional context (`client_name`, `app_name`, `project_name`) and posts to `POST /create-transform`.
2. **Prompt generation** – `build_prompt_create_transform` assembles:
   - Available files and columns (via MinIO + `FileLoader`)
   - Supported operations (passed from `SmartCreateTransformAgent`)
   - Operation format examples and prior history
   - Intelligent suggestions derived from the file catalogue (numeric vs categorical, typical combinations)
3. **LLM call** – `call_llm_create_transform` invokes the configured model (`LLM_MODEL_NAME`, default `qwen3:30b`) with retry logic and conservative sampling (`temperature=0.1`). The prompt mandates:
   - `success: true` – Array of configs with `bucket_name`, `object_name`, and operation keys (`add_0`, `add_0_rename`, etc.)
   - `success: false` – Guidance containing `smart_response`, suggestions, and `session_id`.
4. **JSON extraction** – `extract_json_from_response` iteratively tries multiple parsing strategies (backticks, brace matching, aggressive search) and validates that each operation has a rename companion.
5. **Agent memory update** – Successful configs are stored in session history, enabling preference-aware recommendations and file reuse.
6. **API response** – `main_app.py`:
   - Normalises the payload to always include `create_transform_json`, `json`, and `create_transform_config`.
   - Adds timing metadata and ensures the smart response from the LLM is preserved.
7. **Frontend success handling** (`createColumnHandler.handleSuccess`):
   - Displays the AI `smart_response`.
   - Validates `object_name` and parses operation keys (`add_0`, `multiply_1`, etc.) into the Create Column UI structure.
   - Queries `VALIDATE_API/list_saved_dataframes` to map AI filenames to canonical `object_name`.
   - Hydrates environment context by calling `VALIDATE_API/get_object_prefix` and, if necessary, infers `CLIENT_NAME/APP_NAME/PROJECT_NAME` from the resolved object path.
   - Ensures the final `object_name` is fully qualified (prefix + filename) using cached prefixes or `constructFullPath`.
   - Loads column metadata via `${FEATURE_OVERVIEW_API}/column_summary` and populates the UI (`allColumns`, `file_key`, `operations`).
   - Stores context (`envContext`, `bucketName`, `selectedIdentifiers`) and awaits manual execution or additional UI adjustments (auto-perform is optional depending on downstream configuration).
8. **Frontend failure path** – Renders `smart_response`, suggestion bullets, file analysis, and next steps in chat; caches them in atom settings for future prompts.

## Required JSON Structure
- `bucket_name`: always `"trinity"`.
- `object_name`: filename only (the backend resolves full MinIO paths; the frontend upgrades to qualified paths before execution).
- Operations: keys in the format `<operation>_<index>` paired with `<operation>_<index>_rename`. Supported operations include arithmetic (`add`, `subtract`, `multiply`, `divide`), statistical (`rolling_mean`, `pct_change`, `zscore`), categorical (`dummy`), and time-series (`trend`, `seasonality`, `residual`).
- Validation enforces at least one operation, non-empty column lists, and rename strings.

## External Services
- **MinIO** – Source of datasets and schema discovery.
- **Validate API** – Supplies object prefixes (`get_object_prefix`) and dataframe listings (`list_saved_dataframes`).
- **Feature Overview API** (`FEATURE_OVERVIEW_API`) – Returns column summaries so the UI can display selection chips without additional user clicks.
- **Create Column backend** (`CREATECOLUMN_API`) – Consumes the final configuration when the user executes the transform (handled elsewhere in the UI).

## Sample Request
```bash
curl -X POST "http://localhost:8000/api/create-transform" \
  -H "Content-Type: application/json" \
  -d '{
        "prompt": "In the mayo dataset, add volume and sales, and calculate price * quantity",
        "session_id": "demo-transform",
        "client_name": "acme",
        "app_name": "sales-ai",
        "project_name": "pilot"
      }'
```
Typical success payload:
```json
{
  "success": true,
  "smart_response": "I've configured the data transformation...",
  "json": [
    {
      "bucket_name": "trinity",
      "object_name": "20250813_094555_D0_KHC_UK_Mayo.arrow",
      "add_0": "volume,salesvalue",
      "add_0_rename": "total_volume_sales",
      "multiply_0": "price,quantity",
      "multiply_0_rename": "revenue"
    }
  ],
  "message": "Create/Transform configuration ready",
  "processing_time": 1.65
}
```

## Implementation Notes
- `SmartCreateTransformAgent` passes an explicit dictionary of supported operations and example formats into the LLM prompt to reduce schema drift.
- The handler expands AI operations into the internal UI schema (assigning unique IDs, display names, optional parameters).
- Environment hydration runs twice (initial context, fallback fetch) to cope with missing `CLIENT_NAME` or stale prefixes.
- Column loading fetches the full object name to avoid mismatches when auto-saved files live under nested folders (for example, `concatenated-data/`).
- Session memory enables the LLM to reuse preferred operations, files, and naming styles across the conversation.

## Troubleshooting
- **Invalid data source** – Ensure the dataset exists under the current MinIO prefix. The handler logs mapping attempts and falls back to raw object names.
- **Missing rename fields** – The JSON validator rejects operations without `_rename`. Prompt the user (or fine-tune the LLM) to include rename labels.
- **Column summary empty** – Confirm `${FEATURE_OVERVIEW_API}` is reachable and the service recognises the fully qualified object name.
- **Placeholder filenames** – The handler attempts exact, filename-only, partial, and alias matches against `list_saved_dataframes`. Review logs to understand which step failed.


