# app/routes.py

from fastapi import APIRouter, Form, HTTPException, Query, Body
from fastapi.responses import Response

import io
import json
from datetime import datetime
import numpy as np
import pandas as pd

from app.core.task_queue import format_task_response
from app.features.data_upload_validate.app.routes import get_object_prefix
from .deps import get_minio_df, minio_client, MINIO_BUCKET, redis_client
from .mongodb_saver import (
    save_create_data_settings,
    save_createandtransform_configs,
    get_createandtransform_config_from_mongo,
)
from .task_service import (
    submit_cached_dataframe,
    submit_cardinality,
    submit_classification,
    submit_perform_createcolumn,
    submit_save_dataframe,
)

router = APIRouter()



CREATE_OPTIONS = {
    "add",
    "subtract",
    "multiply",
    "divide",
    "residual",
    "dummy",
    "seasonality",
    "trend",
    "rpi",
    "datetime"
}




@router.get("/options")
async def get_create_options():
    return {"status": "SUCCESS", "available_create_operations": CREATE_OPTIONS}

# IDENTIFIER OPTIONS ENDPOINT
# ============================================================================

from app.features.column_classifier.database import get_classifier_config_from_mongo  # import here to avoid circular deps

@router.get("/identifier_options")
async def identifier_options(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
):
    """Return identifier column names using Redis ▶ Mongo ▶ fallback logic.

    1. Attempt to read JSON config from Redis key
       `<client>/<app>/<project>/column_classifier_config`.
    2. If missing, fetch from Mongo (`column_classifier_config` collection).
       Cache the document back into Redis.
    3. If still unavailable, return empty list – the frontend will
       fall back to its existing column_summary extraction flow.
    """
    import json
    from typing import Any
    
    key = f"{client_name}/{app_name}/{project_name}/column_classifier_config"
    cfg: dict[str, Any] | None = None

    # --- Redis lookup -------------------------------------------------------
    try:
        cached = redis_client.get(key)
        if cached:
            cfg = json.loads(cached)
    except Exception as exc:
        print(f"⚠️ Redis read error for {key}: {exc}")

    # --- Mongo fallback ------------------------------------------------------
    if cfg is None:
        cfg = get_classifier_config_from_mongo(client_name, app_name, project_name)
        if cfg:
            try:
                redis_client.setex(key, 3600, json.dumps(cfg, default=str))
            except Exception as exc:
                print(f"⚠️ Redis write error for {key}: {exc}")

    identifiers: list[str] = []
    if cfg and isinstance(cfg.get("identifiers"), list):
        identifiers = cfg["identifiers"]

    return {"identifiers": identifiers}


@router.post("/settings")
async def set_create_options(
    options: str = Form(...),
    validator_atom_id: str = Form(...),
    file_key: str = Form(...),
    ):

    options = [opt.strip() for opt in options.split(",") if opt.strip()]

    await save_create_data_settings(
        collection_name="create_settings",
        data={
            "validator_atom_id": validator_atom_id,
            "file_key": file_key,
            "operations": options
            # "result": df_transformed.to_dict(orient="records")  # optional
        }
    )

    return {"status": "SUCCESS", "message": "Options updated", "current_options": options}



from pandas import DataFrame
from typing import List
# from fastapi import Request
from starlette.requests import Request

# latest_create_data: DataFrame | None = None

@router.post("/perform")
async def perform_create(
    request: Request,
    object_names: str = Form(...),
    bucket_name: str = Form(...),
    identifiers: str = Form(None),
    client_name: str = Form(""),
    app_name: str = Form(""),
    project_name: str = Form(""),
):
    form_data = await request.form()
    form_items = [(key, value) for key, value in form_data.multi_items()]
    prefix = await get_object_prefix(
        client_name=client_name,
        app_name=app_name,
        project_name=project_name,
    )

    submission = submit_perform_createcolumn(
        bucket_name=bucket_name,
        object_name=object_names,
        object_prefix=prefix,
        identifiers=identifiers,
        form_items=form_items,
        client_name=client_name,
        app_name=app_name,
        project_name=project_name,
    )

    if submission.status == "failure":
        raise HTTPException(
            status_code=400,
            detail=submission.detail or "Failed to process create column request",
        )

    return format_task_response(submission)

@router.get("/results")
async def get_create_data(
    object_names: str = Query(...),
    bucket_name: str = Query(...)
):
    try:
        # 🔧 CRITICAL FIX: Resolve the full MinIO object path
        prefix = await get_object_prefix()
        full_object_path = f"{prefix}{object_names}" if not object_names.startswith(prefix) else object_names
        create_key = f"{full_object_path}_create.csv"
        
        print(f"🔧 File path resolution for results: original={object_names}, prefix={prefix}, full_path={full_object_path}, create_key={create_key}")
        
        create_obj = minio_client.get_object(bucket_name, create_key)
        create_df = pd.read_csv(io.BytesIO(create_obj.read()))
        clean_df = create_df.replace({np.nan: None, np.inf: None, -np.inf: None})
        return {
            "row_count": len(create_df),
            "create_data": clean_df.to_dict(orient="records")
        }
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Unable to fetch create data: {str(e)}")



@router.post("/save")
async def save_createcolumn_dataframe(
    csv_data: str = Body(..., embed=True),
    filename: str = Body(..., embed=True),
    client_name: str = Body(None),
    app_name: str = Body(None),
    project_name: str = Body(None),
    user_id: str = Body(None),
    project_id: int = Body(None),
    operation_details: str = Body(None),
    overwrite_original: bool = Body(False)
):
    prefix = await get_object_prefix(
        client_name=client_name or "",
        app_name=app_name or "",
        project_name=project_name or "",
    )

    submission = submit_save_dataframe(
        csv_data=csv_data,
        filename=filename,
        object_prefix=prefix,
        overwrite_original=overwrite_original,
        client_name=client_name,
        app_name=app_name,
        project_name=project_name,
        user_id=user_id,
        project_id=project_id,
        operation_details=operation_details,
    )

    if submission.status == "failure":
        raise HTTPException(
            status_code=400,
            detail=submission.detail or "Failed to save dataframe",
        )

    return format_task_response(submission)

@router.get("/cached_dataframe")
async def cached_dataframe(
    object_name: str,
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(50, ge=1, le=1000, description="Number of rows per page")
):
    submission = submit_cached_dataframe(
        object_name=object_name,
        page=page,
        page_size=page_size,
    )

    if submission.status == "failure":
        raise HTTPException(
            status_code=400,
            detail=submission.detail or "Failed to load cached dataframe",
        )

    return format_task_response(submission)

@router.get("/export_csv")
async def export_csv(object_name: str):
    """Export the saved dataframe as CSV file."""
    from urllib.parse import unquote
    object_name = unquote(object_name)
    print(f"➡️ createcolumn export_csv request: {object_name}")
    
    try:
        content = redis_client.get(object_name)
        if content is None:
            response = minio_client.get_object(MINIO_BUCKET, object_name)
            content = response.read()
            redis_client.setex(object_name, 3600, content)

        if object_name.endswith(".arrow"):
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            import pandas as pd
            import io
            df = pd.read_csv(io.BytesIO(content))
        
        # Convert to CSV bytes
        csv_bytes = df.to_csv(index=False).encode("utf-8")
        
        return Response(
            content=csv_bytes,
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=createcolumn_result_{object_name.split('/')[-1].replace('.arrow', '')}.csv"
            }
        )
    except Exception as e:
        print(f"⚠️ createcolumn export_csv error for {object_name}: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/export_excel")
async def export_excel(object_name: str):
    """Export the saved dataframe as Excel file."""
    from urllib.parse import unquote
    object_name = unquote(object_name)
    print(f"➡️ createcolumn export_excel request: {object_name}")
    
    try:
        content = redis_client.get(object_name)
        if content is None:
            response = minio_client.get_object(MINIO_BUCKET, object_name)
            content = response.read()
            redis_client.setex(object_name, 3600, content)

        if object_name.endswith(".arrow"):
            reader = ipc.RecordBatchFileReader(pa.BufferReader(content))
            df = reader.read_all().to_pandas()
        else:
            import pandas as pd
            import io
            df = pd.read_csv(io.BytesIO(content))
        
        # Convert to Excel bytes
        import io
        excel_buffer = io.BytesIO()
        df.to_excel(excel_buffer, index=False, engine='openpyxl')
        excel_bytes = excel_buffer.getvalue()
        
        return Response(
            content=excel_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename=createcolumn_result_{object_name.split('/')[-1].replace('.arrow', '')}.xlsx"
            }
        )
    except Exception as e:
        print(f"⚠️ createcolumn export_excel error for {object_name}: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/classification")
async def get_column_classification(
    validator_atom_id: str = Query(...),
    file_key: str = Query(...)
):
    submission = submit_classification(
        validator_atom_id=validator_atom_id,
        file_key=file_key,
    )

    if submission.status == "failure":
        raise HTTPException(
            status_code=400,
            detail=submission.detail or "Failed to fetch classification",
        )

    return format_task_response(submission)

# =============================================================================
# SAVE CONFIG ENDPOINTS
# =============================================================================

@router.post("/save-config")
async def save_createcolumn_configuration(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
    config_data: dict = Body(..., description="Createcolumn configuration data to save"),
    user_id: str = Query("", description="User ID"),
    project_id: int = Query(None, description="Project ID")
):
    """Save createcolumn configuration to MongoDB"""
    try:
        result = await save_createandtransform_configs(
            client_name=client_name,
            app_name=app_name,
            project_name=project_name,
            operation_data=config_data,
            user_id=user_id,
            project_id=project_id
        )
        
        if result["status"] == "success":
            return {
                "success": True,
                "message": f"Createcolumn configuration saved successfully",
                "mongo_id": result["mongo_id"],
                "operation": result["operation"],
                "collection": result["collection"]
            }
        else:
            raise HTTPException(status_code=500, detail=f"Failed to save createcolumn configuration: {result['error']}")
            
    except Exception as e:
        print(f"Error saving createcolumn configuration: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to save createcolumn configuration: {str(e)}")

@router.get("/get-config")
async def get_createcolumn_configuration(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name")
):
    """Retrieve saved createcolumn configuration from MongoDB"""
    try:
        result = await get_createandtransform_config_from_mongo(client_name, app_name, project_name)
        
        if result:
            return {
                "success": True,
                "data": result
            }
        else:
            return {
                "success": False,
                "message": "No createcolumn configuration found",
                "data": None
            }
            
    except Exception as e:
        print(f"Error retrieving createcolumn configuration: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to retrieve createcolumn configuration: {str(e)}")

@router.get("/cardinality")
async def get_cardinality_data(
    object_name: str = Query(..., description="Object name/path of the dataframe"),
):
    submission = submit_cardinality(
        bucket_name=MINIO_BUCKET,
        object_name=object_name,
    )

    if submission.status == "failure":
        raise HTTPException(
            status_code=400,
            detail=submission.detail or "Failed to get cardinality data",
        )

    return format_task_response(submission)
