# Unpivot Atom - Endpoint Connection Verification

## API Base URL
- **Frontend**: `${UNPIVOT_API}` = `/api/v1/atoms/unpivot`
- **Backend Router Prefix**: `/v1/atoms/unpivot`
- **Full Path**: `/api/v1/atoms/unpivot/*`

## Endpoint Mappings

### ✅ 1. Create Atom
- **Frontend**: `POST ${UNPIVOT_API}/create`
- **Backend**: `POST /v1/atoms/unpivot/create`
- **Request**: 
  ```json
  {
    "project_id": string,
    "workflow_id": string,
    "atom_name": string,
    "dataset_path": string
  }
  ```
- **Response**: 
  ```json
  {
    "atom_id": string,
    "project_id": string,
    "workflow_id": string,
    "atom_name": string,
    "created_at": datetime
  }
  ```
- **Status**: ✅ Connected

### ✅ 2. Update Properties
- **Frontend**: `PATCH ${UNPIVOT_API}/${atomId}/properties`
- **Backend**: `PATCH /v1/atoms/unpivot/{atom_id}/properties`
- **Request**:
  ```json
  {
    "id_vars": string[],
    "value_vars": string[],
    "variable_column_name": string,
    "value_column_name": string,
    "pre_filters": Array<{field: string, include?: string[], exclude?: string[]}>,
    "post_filters": Array<{field: string, include?: string[], exclude?: string[]}>,
    "auto_refresh": boolean
  }
  ```
- **Response**: `UnpivotMetadataResponse`
- **Status**: ✅ Connected

### ✅ 3. Compute Unpivot
- **Frontend**: `POST ${UNPIVOT_API}/${atomId}/compute`
- **Backend**: `POST /v1/atoms/unpivot/{atom_id}/compute`
- **Request**:
  ```json
  {
    "force_recompute": boolean
  }
  ```
- **Response**:
  ```json
  {
    "atom_id": string,
    "status": "success" | "failed",
    "updated_at": datetime,
    "row_count": int,
    "dataframe": Array<Record<string, any>>,
    "summary": {
      "original_rows": int,
      "original_columns": int,
      "unpivoted_rows": int,
      "unpivoted_columns": int,
      "id_vars_count": int,
      "value_vars_count": int
    },
    "computation_time": float
  }
  ```
- **Status**: ✅ Connected

### ✅ 4. Save Result
- **Frontend**: `POST ${UNPIVOT_API}/${atomId}/save`
- **Backend**: `POST /v1/atoms/unpivot/{atom_id}/save`
- **Request**:
  ```json
  {
    "format": "parquet" | "arrow" | "csv",
    "filename": string (optional, for save_as)
  }
  ```
- **Response**:
  ```json
  {
    "atom_id": string,
    "status": "success",
    "minio_path": string,
    "updated_at": datetime,
    "row_count": int
  }
  ```
- **Status**: ✅ Connected (Fixed: Added filename support)

## Field Name Verification

### Request Fields
| Frontend | Backend | Status |
|----------|---------|--------|
| `id_vars` | `id_vars` | ✅ Match |
| `value_vars` | `value_vars` | ✅ Match |
| `variable_column_name` | `variable_column_name` | ✅ Match |
| `value_column_name` | `value_column_name` | ✅ Match |
| `pre_filters` | `pre_filters` | ✅ Match |
| `post_filters` | `post_filters` | ✅ Match |
| `auto_refresh` | `auto_refresh` | ✅ Match |
| `force_recompute` | `force_recompute` | ✅ Match |
| `format` | `format` | ✅ Match |
| `filename` | `filename` | ✅ Match (Fixed) |

### Response Fields
| Backend | Frontend | Status |
|---------|----------|--------|
| `atom_id` | `result?.atom_id` | ✅ Match |
| `dataframe` | `result?.dataframe` | ✅ Match |
| `row_count` | `result?.row_count` | ✅ Match |
| `summary` | `result?.summary` | ✅ Match |
| `computation_time` | `result?.computation_time` | ✅ Match |
| `updated_at` | `result?.updated_at` | ✅ Match |
| `minio_path` | `result?.minio_path` | ✅ Match |
| `status` | `result?.status` | ✅ Match |

## Issues Fixed

1. ✅ **Save As Functionality**: Added `filename` parameter to `UnpivotSaveRequest` model
2. ✅ **Save Service Logic**: Updated to handle custom filename for "Save As" vs standard filename for "Save"

## All Endpoints Verified ✅

All frontend-to-backend connections are correctly configured and verified.

