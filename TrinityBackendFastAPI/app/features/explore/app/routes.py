# routes.py - Explore Atom Routes - Complete Implementation
from fastapi import APIRouter, HTTPException, Form, Query, Depends
from app.core.task_queue import celery_task_client, format_task_response
from app.features.column_classifier.database import get_classifier_config_from_mongo
from app.core.observability import timing_dependency_factory
from app.core.feature_cache import feature_cache

import json
from typing import Optional
from urllib.parse import unquote, quote


redis_client = feature_cache.router("explore")

# Create router
timing_dependency = timing_dependency_factory("app.features.explore")

router = APIRouter(dependencies=[Depends(timing_dependency)])


@router.get("/columns")
async def get_columns(object_name: str):
    """Return column names for a saved dataframe via Celery."""
    submission = celery_task_client.submit_callable(
        name="explore.columns",
        dotted_path="app.features.explore.service.fetch_columns_task",
        kwargs={"object_name": object_name},
        metadata={
            "atom": "explore",
            "operation": "columns",
            "object_name": object_name,
        },
    )

    if submission.status == "failure":
        raise HTTPException(
            status_code=400,
            detail=submission.detail or "Failed to fetch explore columns",
        )

    return format_task_response(submission)


@router.get("/column_summary")
async def column_summary(object_name: str):
    """Return column summary statistics through a Celery task."""
    submission = celery_task_client.submit_callable(
        name="explore.column_summary",
        dotted_path="app.features.explore.service.column_summary_task",
        kwargs={"object_name": object_name},
        metadata={
            "atom": "explore",
            "operation": "column_summary",
            "object_name": object_name,
        },
    )

    if submission.status == "failure":
        raise HTTPException(
            status_code=400,
            detail=submission.detail
            or "Failed to build explore column summary",
        )

    return format_task_response(submission)



# Removed unused endpoint: / (root endpoint)



@router.get("/get-dimensions-and-identifiers/{validator_atom_id}")
async def get_dimensions_and_identifiers(
    validator_atom_id: str,
    client_name: str = Query(None, description="Client name for column classifier lookup"),
    app_name: str = Query(None, description="App name for column classifier lookup"),
    project_name: str = Query(None, description="Project name for column classifier lookup"),
    file_key: str = Query(None, description="Specific file key to fetch dimensions for"),
):
    """Fetch available dimensions and identifiers through a Celery task."""
    submission = celery_task_client.submit_callable(
        name="explore.dimensions",
        dotted_path="app.features.explore.service.get_dimensions_task",
        kwargs={
            "validator_atom_id": validator_atom_id,
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "file_key": file_key,
        },
        metadata={
            "atom": "explore",
            "operation": "dimensions",
            "validator_atom_id": validator_atom_id,
        },
    )

    if submission.status == "failure":
        raise HTTPException(
            status_code=400,
            detail=submission.detail
            or "Failed to load dimensions for explore atom",
        )

    return format_task_response(submission)

@router.get("/get-measures/{validator_atom_id}")
async def get_measures(
    validator_atom_id: str,
    client_name: str = Query(None, description="Client name for column classifier lookup"),
    app_name: str = Query(None, description="App name for column classifier lookup"),
    project_name: str = Query(None, description="Project name for column classifier lookup"),
    file_key: str = Query(None, description="Specific file key to fetch measures for"),
):
    """Fetch measures and identifiers through a Celery task."""
    submission = celery_task_client.submit_callable(
        name="explore.measures",
        dotted_path="app.features.explore.service.get_measures_task",
        kwargs={
            "validator_atom_id": validator_atom_id,
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "file_key": file_key,
        },
        metadata={
            "atom": "explore",
            "operation": "measures",
            "validator_atom_id": validator_atom_id,
        },
    )

    if submission.status == "failure":
        raise HTTPException(
            status_code=400,
            detail=submission.detail
            or "Failed to load measures for explore atom",
        )

    return format_task_response(submission)

@router.post("/select-dimensions-and-measures")
async def select_dimensions_and_measures(
    validator_atom_id: str = Form(...),
    atom_name: str = Form(...),
    selected_dimensions: str = Form(...),
    selected_measures: str = Form(...),
):
    """Persist the selected dimensions and measures via Celery."""
    submission = celery_task_client.submit_callable(
        name="explore.select_dimensions",
        dotted_path="app.features.explore.service.save_dimensions_and_measures_task",
        kwargs={
            "validator_atom_id": validator_atom_id,
            "atom_name": atom_name,
            "selected_dimensions": selected_dimensions,
            "selected_measures": selected_measures,
        },
        metadata={
            "atom": "explore",
            "operation": "select_dimensions",
            "validator_atom_id": validator_atom_id,
        },
    )

    if submission.status == "failure":
        raise HTTPException(
            status_code=400,
            detail=submission.detail
            or "Failed to save explore dimensions and measures",
        )

    return format_task_response(submission)

@router.get("/column-classifier/configs")
async def list_column_classifier_configs():
    """
    List all available column classifier configurations
    Returns a list of client/app/project combinations that have saved configs
    """
    try:
        # Column classifier integration is disabled
        # Return empty config list since this feature is not being used
        config_list = []
        
        return {
            "status": "success",
            "configs": config_list,
            "total_configs": len(config_list)
        }
        
    except Exception as e:
        print(f"❌ Error listing column classifier configs: {e}")
        return {
            "status": "error",
            "message": f"Failed to list configurations: {str(e)}",
            "configs": []
        }


@router.get("/column-classifier/config/{client_name}/{app_name}/{project_name}")
async def get_column_classifier_config(
    client_name: str,
    app_name: str,
    project_name: str,
    file: Optional[str] = Query(None, alias="file"),
):
    """
    Get column classifier configuration for a specific client/app/project combination
    This endpoint provides direct access to the column classifier data
    """
    try:
        # Try Redis first (fast lookup)
        key = f"{client_name}/{app_name}/{project_name}/column_classifier_config"
        decoded_file = unquote(file) if file else None
        specific_key = None
        if decoded_file:
            safe_file = quote(decoded_file, safe="")
            specific_key = f"{key}:{safe_file}"
            cached_specific = redis_client.get(specific_key)
            if cached_specific:
                config_data = json.loads(cached_specific)
                print(
                    f"✅ Found column classifier config in Redis for {specific_key}"
                )
                return {
                    "status": "success",
                    "source": "redis",
                    "config": config_data,
                    "redis_key": specific_key,
                    "summary": {
                        "client_name": client_name,
                        "app_name": app_name,
                        "project_name": project_name,
                        "identifiers": config_data.get("identifiers", []),
                        "measures": config_data.get("measures", []),
                        "dimensions": config_data.get("dimensions", {}),
                        "total_identifiers": len(config_data.get("identifiers", [])),
                        "total_measures": len(config_data.get("measures", [])),
                        "total_dimensions": len(config_data.get("dimensions", {})),
                        "file_name": config_data.get("file_name"),
                    },
                }

        cached = redis_client.get(key)

        if cached:
            config_data = json.loads(cached)
            if decoded_file:
                stored_file = config_data.get("file_name")
                if stored_file and stored_file != decoded_file:
                    config_data = None
            if config_data is not None:
                print(f"✅ Found column classifier config in Redis for {key}")

                return {
                    "status": "success",
                    "source": "redis",
                    "config": config_data,
                    "redis_key": key,
                    "summary": {
                        "client_name": client_name,
                        "app_name": app_name,
                        "project_name": project_name,
                        "identifiers": config_data.get("identifiers", []),
                        "measures": config_data.get("measures", []),
                        "dimensions": config_data.get("dimensions", {}),
                        "total_identifiers": len(config_data.get("identifiers", [])),
                        "total_measures": len(config_data.get("measures", [])),
                        "total_dimensions": len(config_data.get("dimensions", {})),
                        "file_name": config_data.get("file_name"),
                    },
                }

        # If not in Redis, try MongoDB
        mongo_data = get_classifier_config_from_mongo(
            client_name,
            app_name,
            project_name,
            decoded_file,
        )
        if mongo_data:
            # Cache back to Redis
            redis_client.setex(key, 3600, json.dumps(mongo_data, default=str))
            if specific_key:
                redis_client.setex(
                    specific_key, 3600, json.dumps(mongo_data, default=str)
                )
            print(f"✅ Found column classifier config in MongoDB for {client_name}/{app_name}/{project_name}")

            return {
                "status": "success",
                "source": "mongodb",
                "config": mongo_data,
                "mongo_id": f"{client_name}/{app_name}/{project_name}",
                "summary": {
                    "client_name": client_name,
                    "app_name": app_name,
                    "project_name": project_name,
                    "identifiers": mongo_data.get("identifiers", []),
                    "measures": mongo_data.get("measures", []),
                    "dimensions": mongo_data.get("dimensions", {}),
                    "total_identifiers": len(mongo_data.get("identifiers", [])),
                    "total_measures": len(mongo_data.get("measures", [])),
                    "total_dimensions": len(mongo_data.get("dimensions", {})),
                    "file_name": mongo_data.get("file_name"),
                }
            }
        
        # Configuration not found
        return {
            "status": "error",
            "message": "Configuration not found",
            "details": {
                "client_name": client_name,
                "app_name": app_name,
                "project_name": project_name,
                "redis_key": key,
                "mongo_id": f"{client_name}/{app_name}/{project_name}"
            }
        }
        
    except Exception as e:
        print(f"❌ Error fetching column classifier config: {e}")
        return {
            "status": "error",
            "message": f"Failed to fetch configuration: {str(e)}",
            "details": {
                "client_name": client_name,
                "app_name": app_name,
                "project_name": project_name
            }
        }


# Removed unused endpoint: /list-saved-atoms




# Accept both with and without trailing slash for robustness
@router.post("/specify-operations")
async def specify_operations(
    explore_atom_id: str = Form(...),
    operations: str = Form(...),
):
    """Validate and persist explore operations via Celery."""
    submission = celery_task_client.submit_callable(
        name="explore.specify_operations",
        dotted_path="app.features.explore.service.specify_operations_task",
        kwargs={
            "explore_atom_id": explore_atom_id,
            "operations": operations,
        },
        metadata={
            "atom": "explore",
            "operation": "specify_operations",
            "explore_atom_id": explore_atom_id,
        },
    )

    if submission.status == "failure":
        raise HTTPException(
            status_code=400,
            detail=submission.detail
            or "Failed to validate explore operations",
        )

    return format_task_response(submission)

@router.get("/chart-data-multidim/{explore_atom_id}")
async def chart_data_multidim(explore_atom_id: str):
    """Generate chart data via Celery for the given explore atom."""
    submission = celery_task_client.submit_callable(
        name="explore.chart_data",
        dotted_path="app.features.explore.service.chart_data_multidim_task",
        kwargs={"explore_atom_id": explore_atom_id},
        metadata={
            "atom": "explore",
            "operation": "chart_data",
            "explore_atom_id": explore_atom_id,
        },
    )

    if submission.status == "failure":
        raise HTTPException(
            status_code=400,
            detail=submission.detail or "Failed to generate explore chart data",
        )

    return format_task_response(submission)

@router.get("/date-range")
async def date_range(
    object_name: Optional[str] = Query(None, description="Full MinIO object path e.g. qmmqq/sales/myfile.arrow"),
    file_key: Optional[str] = Query(None, description="Alias for object_name used by older frontend builds"),
    date_column: Optional[str] = Query(None, description="Name of the date column to analyse (optional)"),
):
    """Resolve the min/max date for the provided dataset via Celery."""
    submission = celery_task_client.submit_callable(
        name="explore.date_range",
        dotted_path="app.features.explore.service.date_range_task",
        kwargs={
            "object_name": object_name,
            "file_key": file_key,
            "date_column": date_column,
        },
        metadata={
            "atom": "explore",
            "operation": "date_range",
            "object_name": object_name or file_key,
        },
    )

    if submission.status == "failure":
        raise HTTPException(
            status_code=400,
            detail=submission.detail or "Failed to compute explore date range",
        )

    return format_task_response(submission)

@router.post("/perform")
async def perform_explore(
    exploration_config: str = Form(...),
    file_name: str = Form(...),
    bucket_name: str = Form("trinity"),
):
    """Execute AI driven explore workflow via Celery."""
    submission = celery_task_client.submit_callable(
        name="explore.perform",
        dotted_path="app.features.explore.service.perform_explore_task",
        kwargs={
            "exploration_config": exploration_config,
            "file_name": file_name,
            "bucket_name": bucket_name,
        },
        metadata={
            "atom": "explore",
            "operation": "perform",
            "file_name": file_name,
        },
    )

    if submission.status == "failure":
        raise HTTPException(
            status_code=400,
            detail=submission.detail or "Failed to perform explore workflow",
        )

    return format_task_response(submission)
