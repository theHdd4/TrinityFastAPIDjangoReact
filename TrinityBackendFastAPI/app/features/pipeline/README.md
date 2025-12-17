# Pipeline Execution Feature

## Overview

The Pipeline Execution feature tracks atom executions per card and allows re-executing entire pipelines with optional root file replacements. This feature stores execution data in MongoDB similar to `atom_list_configuration`, tracking:

- Which atoms were executed in each card
- What APIs were called for each atom
- Input files (root files) and output files (derived files)
- Execution parameters and status

## Architecture

### MongoDB Collection: `pipeline_execution`

Stores pipeline execution data with the following structure:

```json
{
  "client_id": "client_name",
  "app_id": "app_name",
  "project_id": "project_name",
  "mode": "laboratory",
  "cards": [
    {
      "card_id": "card-123",
      "canvas_position": 0,
      "atoms": [
        {
          "atom_id": "concat",
          "atom_name": "Concat",
          "card_id": "card-123",
          "canvas_position": 0,
          "atom_position": 0,
          "api_endpoint": "/api/concat/perform",
          "api_method": "POST",
          "input_files": ["file1.parquet", "file2.parquet"],
          "output_file": "concat_result.parquet",
          "is_derived": true,
          "execution_params": {...},
          "execution_time": "2025-01-01T00:00:00Z",
          "status": "success",
          "error_message": null
        }
      ],
      "root_files": ["file1.parquet", "file2.parquet"],
      "derived_files": ["concat_result.parquet"]
    }
  ],
  "all_root_files": ["file1.parquet", "file2.parquet"],
  "all_derived_files": ["concat_result.parquet"],
  "created_at": "2025-01-01T00:00:00Z",
  "updated_at": "2025-01-01T00:00:00Z"
}
```

## API Endpoints

### 1. GET `/api/pipeline/get`

Get pipeline execution data for a project.

**Query Parameters:**
- `client_name`: Client name
- `app_name`: App name
- `project_name`: Project name
- `mode`: Mode (laboratory, workflow, exhibition) - default: "laboratory"

**Response:**
```json
{
  "status": "success",
  "data": {
    "client_id": "...",
    "app_id": "...",
    "project_id": "...",
    "mode": "laboratory",
    "cards": [...],
    "all_root_files": [...],
    "all_derived_files": [...],
    "created_at": "...",
    "updated_at": "..."
  }
}
```

### 2. POST `/api/pipeline/save`

Save pipeline execution data (bulk save).

**Query Parameters:**
- `client_name`: Client name
- `app_name`: App name
- `project_name`: Project name
- `mode`: Mode

**Body:**
```json
{
  "cards": [...],
  "all_root_files": [...],
  "all_derived_files": [...],
  "created_at": "..."
}
```

### 3. POST `/api/pipeline/run`

Run pipeline by re-executing all atoms with optional file replacements.

**Body:**
```json
{
  "client_name": "...",
  "app_name": "...",
  "project_name": "...",
  "mode": "laboratory",
  "file_replacements": [
    {
      "original_file": "file1.parquet",
      "replacement_file": "new_file1.parquet",
      "keep_original": false
    }
  ]
}
```

**Response:**
```json
{
  "status": "success",
  "message": "...",
  "executed_atoms": 10,
  "successful_atoms": 9,
  "failed_atoms": 1,
  "execution_log": [...]
}
```

## Integration Guide

### Recording Atom Executions

To track atom executions, call `record_atom_execution()` from the pipeline service whenever an atom executes. This should be integrated into each atom's endpoint.

**Example integration in an atom endpoint:**

```python
from app.features.pipeline.service import record_atom_execution

@router.post("/perform")
async def perform_atom(
    request: AtomRequest,
    client_name: str = Query(...),
    app_name: str = Query(...),
    project_name: str = Query(...),
    card_id: str = Query(...),
    canvas_position: int = Query(...),
    atom_id: str = Query(...),
    atom_position: int = Query(...)
):
    # Execute atom
    result = await execute_atom_logic(request)
    
    # Record execution
    await record_atom_execution(
        client_name=client_name,
        app_name=app_name,
        project_name=project_name,
        card_id=card_id,
        canvas_position=canvas_position,
        atom_id=atom_id,
        atom_name="Atom Name",
        atom_position=atom_position,
        api_endpoint="/api/atom/perform",
        api_method="POST",
        input_files=request.input_files,
        output_file=result.output_file if result.success else None,
        execution_params=request.dict(),
        status="success" if result.success else "failed",
        error_message=result.error if not result.success else None
    )
    
    return result
```

### Frontend Integration

1. **Display Pipeline Data**: Call `/api/pipeline/get` to retrieve pipeline execution data
2. **Show Root Files**: Display all root files from `all_root_files` in a modal
3. **File Replacement UI**: Allow user to select replacement files or keep originals
4. **Run Pipeline**: Call `/api/pipeline/run` with file replacements

**Example frontend flow:**

```typescript
// 1. Get pipeline data
const pipelineData = await fetch(
  `/api/pipeline/get?client_name=${client}&app_name=${app}&project_name=${project}&mode=${mode}`
).then(r => r.json());

// 2. Show modal with root files
const rootFiles = pipelineData.data.all_root_files;
// Display modal with file replacement options

// 3. Run pipeline
const runResult = await fetch('/api/pipeline/run', {
  method: 'POST',
  body: JSON.stringify({
    client_name: client,
    app_name: app,
    project_name: project,
    mode: mode,
    file_replacements: selectedReplacements
  })
}).then(r => r.json());
```

## File Classification

- **Root Files**: Input files that are not outputs from other atoms (original data files)
- **Derived Files**: Output files produced by atom executions (intermediate or final results)

The system automatically classifies files:
- Input files are added as root files (unless they're already derived)
- Output files are marked as derived and removed from root files if present

## Notes

- Pipeline execution data is stored per `client/app/project/mode` combination
- Each execution updates the existing pipeline data (doesn't create duplicates)
- The `/api/pipeline/run` endpoint currently logs execution but doesn't actually call APIs (TODO: implement actual API calls)
- Frontend modal component needs to be created (TODO)





