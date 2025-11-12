# GroupBy Atom

## Purpose
The groupby atom interprets user intent into an aggregation blueprint: which dataset to group, which identifiers to group on, which measures to aggregate, and how to rename results. The backend focuses on prompt orchestration and JSON validation; the frontend wires the configuration into the GroupBy UI, runs the aggregation, and streams outcomes back into the chat.

## Component Map
- Prompt builder and JSON extraction: `ai_logic.py` (`build_prompt_group_by`, `call_llm_group_by`, `extract_json_group_by`)
- Agent state & orchestration: `llm_groupby.py` (`SmartGroupByAgent`)
- FastAPI router: `main_app.py` (`POST /groupby`, `/files`, `/history/{session_id}`, `/health`)
- Frontend handler: `TrinityFrontend/src/components/TrinityAI/handlers/groupbyHandler.ts`
- Shared utilities: `handlers/utils.ts` (environment discovery, smart responses, validation, auto-save)

## System Flow
1. **User query** – The UI posts the prompt, session ID, and optional environment (`client_name`, `app_name`, `project_name`) to `POST /groupby`.
2. **Prompt context** – `build_prompt_group_by` embeds:
   - Available files with columns (from MinIO)
   - Supported aggregations and the required JSON output format
   - Conversation history, previously successful configurations, and reminders about lowercase column names and weighted mean requirements.
3. **LLM execution** – `call_llm_group_by` hits the configured LLM (`LLM_MODEL_NAME`, default `deepseek-r1:32b`) with deterministic sampling (`temperature=0.0`) to reduce schema variance.
4. **Response validation** – `extract_json_group_by` strips `<think>` sections, balances braces, and verifies the presence of `smart_response`. Session memory captures both successful configs and guidance interactions.
5. **API output** – `main_app.py` guarantees a `smart_response` (injecting a fallback if missing), echoes the `groupby_json` untouched, and adds timing metadata.
6. **Frontend success processing** (`groupbyHandler.handleSuccess`):
   - Displays the `smart_response` (Individual AI mode only) and logs configuration details.
   - Collapses AI-provided filenames to a single source file and reconciles it against `/list_saved_dataframes` (exact, filename-only, partial, alias matching).
   - Falls back to the atom’s existing `dataSource` if the LLM output is a placeholder.
   - Translates aggregation definitions into the UI model (`selectedMeasures`, `selectedIdentifiers`, aggregator labels).
   - Populates atom settings (`envContext`, `bucketName`, `selectedAggregationMethods`, `dataSource`, `aiConfig`).
   - Triggers the perform endpoint `${GROUPBY_API}/run` with URL-encoded form data that includes `validator_atom_id`, `file_key`, `object_names`, `bucket_name`, `identifiers`, and an object describing each aggregation (`agg`, `weight_by`, `rename_to`).
   - On success, fetches the saved result via `${GROUPBY_API}/cached_dataframe`, parses CSV rows into structured data, updates atom settings with `groupbyResults`, and posts a success message. Results are auto-saved through `autoSaveStepResult`.
7. **Frontend guidance path** – When `success: false`, the handler converts suggestions and file analysis into chat output, stores them on the atom, and waits for the user to clarify.

## Required Success Payload
- `groupby_json` keys:
  - `object_names` / `file_key` / `file_name`: reference to the dataset (frontend narrows to one path).
  - `identifiers`: array of dimension columns (must be lowercase).
  - `aggregations`: dictionary where each key is a measure and each value contains at least `agg` and `rename_to`; `weight_by` is mandatory when `agg = "weighted_mean"`.
  - `bucket_name`: `"trinity"`.
- `smart_response`: human-readable explanation for the UI.
- `session_id`: echoed from the request when provided.

## External Dependencies
- **MinIO** – Stores the datasets the agent inspects.
- **Validate API** – Supplies dataframe listings (`list_saved_dataframes`) to map AI suggestions to real objects.
- **GroupBy backend** (`GROUPBY_API`) – Executes the aggregation (`/run`) and exposes results (`/cached_dataframe`).
- **Laboratory store** – The handler updates atom settings and reads existing configuration when reconciling filenames.

## Sample Request
```bash
curl -X POST "http://localhost:8000/api/groupby" \
  -H "Content-Type: application/json" \
  -d '{
        "prompt": "Group the mayo dataset by market and channel, summing volume and averaging price",
        "session_id": "demo-groupby",
        "client_name": "acme",
        "app_name": "sales-ai",
        "project_name": "pilot"
      }'
```
Representative success response:
```json
{
  "success": true,
  "smart_response": "I've configured the groupby operation...",
  "groupby_json": {
    "bucket_name": "trinity",
    "object_names": "20250813_094555_D0_KHC_UK_Mayo.arrow",
    "identifiers": ["market", "channel"],
    "aggregations": {
      "volume": { "agg": "sum", "rename_to": "total_volume" },
      "price": { "agg": "mean", "rename_to": "avg_price" }
    }
  },
  "message": "GroupBy configuration ready",
  "processing_time": 1.58
}
```

## Implementation Details
- Aggregation instructions emphasise lowercase column names and weighted-mean requirements to reduce backend validation failures.
- The handler supports Stream AI mode; in that context it suppresses immediate chat messages but still updates atom state and executes the backend call.
- Result retrieval reads cached CSV data, converts it into rows, and stores both the parsed rows and raw CSV for downstream consumers.
- Auto-save ensures that even when the UI closes, the performed aggregation can be resumed via saved workflow steps.
- Error messages include actionable guidance, e.g., prompting users to select a dataset when the LLM returns placeholders like `"your_file.csv"`.

## Troubleshooting
- **Placeholder or missing filenames** – Review logs for mapping attempts. If unresolved, teach the model by referencing the fully qualified object name in the prompt or pre-select the data source in the UI.
- **Weighted mean errors** – Ensure the LLM response includes `weight_by`. The handler does not infer weights automatically.
- **Perform endpoint failures** – The handler appends backend error detail to the chat message and keeps `operationCompleted: false` so the user can retry manually.
- **CSV parsing issues** – Verify `${GROUPBY_API}/cached_dataframe` returns valid CSV text; the handler expects headers on the first line and comma separation.



