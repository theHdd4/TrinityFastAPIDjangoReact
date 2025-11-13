# Celery Worker Coverage Report

## Summary
- Data upload & validate now queues the `/upload-file` and `/validate` workflows so long-running parsing and rule execution run on workers while the API immediately returns task handles.【F:TrinityBackendFastAPI/app/features/data_upload_validate/app/routes.py†L498-L588】【F:TrinityBackendFastAPI/app/features/data_upload_validate/service.py†L185-L378】
- Only the DataFrame Operations atom currently submits work to Celery, and even there only the `/load`, `/filter_rows`, and `/sort` endpoints use the task client while all other mutations run inline on the API worker.【F:TrinityBackendFastAPI/app/features/dataframe_operations/app/routes.py†L702-L806】
- Every other atom in `TrinityBackendFastAPI/app/features/` still performs its heavy lifting synchronously inside the FastAPI process, so long-running uploads, dataframe transforms, model training, and cache refresh routines will continue to block requests unless they are refactored onto Celery workers.

## Feature Findings

### DataFrame Operations
- Celery coverage: `/load`, `/filter_rows`, and `/sort` push into `celery_task_client.submit_callable`, so these execute on workers when `CELERY_TASKS_ALWAYS_EAGER` is false.【F:TrinityBackendFastAPI/app/features/dataframe_operations/app/routes.py†L702-L763】
- Remaining endpoints like `/insert_row`, `/delete_row`, `/insert_column`, and many others still mutate session data synchronously and should be wrapped in tasks if they are expected to scale to large dataframes.【F:TrinityBackendFastAPI/app/features/dataframe_operations/app/routes.py†L766-L1039】

### Data Upload & Validate
- Celery coverage: `/upload-file` and `/validate` marshal uploaded payloads to `process_temp_upload` and `run_validation` service helpers that run entirely on workers and store result metadata in Redis, returning task identifiers for polling.【F:TrinityBackendFastAPI/app/features/data_upload_validate/app/routes.py†L498-L588】【F:TrinityBackendFastAPI/app/features/data_upload_validate/service.py†L27-L210】
- Remaining operations like `/save_dataframes`, `/apply-data-transformations`, and the validator configuration endpoints still execute synchronously and should be migrated next so large uploads, Arrow exports, and Mongo bookkeeping do not block request threads.【F:TrinityBackendFastAPI/app/features/data_upload_validate/app/routes.py†L2959-L3080】【F:TrinityBackendFastAPI/app/features/data_upload_validate/app/routes.py†L3869-L3950】

### Feature Overview
- Operations such as `/column_summary` pull large Arrow datasets from MinIO/Arrow Flight and compute summaries directly within the request handler without Celery involvement.【F:TrinityBackendFastAPI/app/features/feature_overview/routes.py†L125-L218】
- Recommendation: move dataset download and summarisation into a background task and return task IDs so the frontend can poll.

### Build Model (Feature-Based)
- Endpoints like `/train-models-direct` orchestrate extensive MinIO reads, pandas transformations, and model training steps inline, with no Celery submission or task tracking.【F:TrinityBackendFastAPI/app/features/build_model_feature_based/routes.py†L625-L717】
- Recommendation: wrap each training run (direct, stacked, MMM) in Celery jobs that stream status updates through the task result store.

### Build Autoregressive
- The autoregressive atom manages its own `ThreadPoolExecutor` and long-running forecasting loops directly in the API process, never delegating to Celery workers.【F:TrinityBackendFastAPI/app/features/build_autoregressive/routes.py†L3-L158】
- Recommendation: replace the thread pool with Celery submissions so CPU-bound forecasting leaves the FastAPI event loop responsive.

### Chart Maker
- File ingestion, MinIO reloads, column analysis, and chart preparation occur immediately in the request handlers without Celery involvement.【F:TrinityBackendFastAPI/app/features/chart_maker/endpoint.py†L1-L198】
- Recommendation: offload expensive file parsing and aggregation (especially for large Arrow uploads) to Celery tasks.

### Pivot Table
- The compute, refresh, and save endpoints now push work to Celery via the shared task client, returning task identifiers while the worker reconstructs the original `PivotComputeRequest` payload and persists results through the adapter tasks.【F:TrinityBackendFastAPI/app/features/pivot_table/routes.py†L34-L94】【F:TrinityBackendFastAPI/app/features/pivot_table/service.py†L752-L820】
- Remaining read endpoints such as `/pivot/{config_id}/data` and `/status` continue to serve cached payloads synchronously and do not require Celery delegation.

### Select Models (Feature-Based)
- Model selection endpoints read large result files from MinIO, parse them with pandas, and compute filters inline, with no Celery usage.【F:TrinityBackendFastAPI/app/features/select_models_feature_based/routes.py†L1-L200】
- Recommendation: migrate data extraction, ensemble scoring, and MinIO exports into Celery jobs that can be re-used by other analytics atoms.

### Group By / Weighted Average
- GroupBy endpoints fetch Arrow objects from MinIO, materialise pandas dataframes, and perform aggregations synchronously inside each HTTP request.【F:TrinityBackendFastAPI/app/features/groupby_weighted_avg/routes.py†L1-L197】
- Recommendation: move expensive aggregation and export routines to Celery, leaving the API to return task handles and cached results.

### Scope Selector
- Scope selector requests currently perform Redis/Mongo lookups and potentially large MinIO dataframe scans within the request lifecycle, without Celery orchestration.【F:TrinityBackendFastAPI/app/features/scope_selector/routes.py†L1-L190】
- Recommendation: convert identifier extraction, multi-filter evaluation, and combination materialisation flows into asynchronous Celery tasks.

### Create & Transform
- The create/transform atom loads dataframes from MinIO and executes statistical transforms (STL, Kalman filters, scaling) inline on the request thread.【F:TrinityBackendFastAPI/app/features/createcolumn/routes.py†L1-L200】
- Recommendation: enqueue each transform pipeline run on Celery so CPU-intensive operations do not tie up API workers.

### Evaluate Models
- Evaluation endpoints stream Arrow/Parquet data from MinIO and calculate metrics such as betas and contributions synchronously.【F:TrinityBackendFastAPI/app/features/evaluate_models_feature_based/routes.py†L1-L200】
- Recommendation: push heavy metric calculations and export preparation into Celery tasks, exposing polling endpoints similar to the new task queue router.

## Next Steps
1. Identify the critical request paths per atom and encapsulate them behind small service functions (mirroring `dataframe_operations.service`) to make Celery delegation straightforward.
2. For each heavy routine above, register a corresponding Celery task (using `celery_task_client.submit_callable`) and return the `task_id` plus metadata from the API route.
3. Extend frontend polling/webhook integration to consume `/task-queue` status endpoints so progress is visible for all atoms once their workloads execute on workers.
