import os
from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, HTTPException, Query

from app.core.task_queue import celery_task_client, format_task_response
from .schemas import (
    ActualPredictedResponse,
    ContributionsResponse,
    ListObjectsResponse,
    SelectedModelsResponse,
)

router = APIRouter(tags=["Evaluate Models Feature Based"])


SERVICE_PATH = "app.features.evaluate_models_feature_based.service"
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "trinity")


def _submit_task(*, name: str, path: str, kwargs: Dict[str, Any], metadata: Optional[Dict[str, Any]] = None):
    submission = celery_task_client.submit_callable(
        name=name,
        dotted_path=f"{SERVICE_PATH}.{path}",
        kwargs=kwargs,
        metadata={"feature": "evaluate_models_feature_based", **(metadata or {})},
    )
    if submission.status == "failure":
        raise HTTPException(status_code=400, detail=submission.detail or "Task submission failed")
    return format_task_response(submission, embed_result=True)


@router.get("/files", response_model=ListObjectsResponse)
def list_minio_files(
    bucket: str = Query(default=MINIO_BUCKET, description="Bucket to list"),
    prefix: Optional[str] = Query(default=None, description="Prefix filter (e.g. 'runs/2024/')"),
    recursive: bool = Query(default=True, description="Recurse into subfolders"),
    limit: int = Query(default=1000, ge=1, le=10000, description="Max objects to return"),
):
    return _submit_task(
        name="evaluate_models_feature_based.list_files",
        path="list_minio_files",
        kwargs={"bucket": bucket, "prefix": prefix, "recursive": recursive, "limit": limit},
        metadata={"operation": "list_files", "bucket": bucket, "prefix": prefix},
    )


@router.get("/application-type", tags=["Application Type"])
async def get_application_type(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
):
    return _submit_task(
        name="evaluate_models_feature_based.application_type",
        path="get_application_type",
        kwargs={
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
        },
        metadata={"operation": "application_type", "client_name": client_name, "app_name": app_name, "project_name": project_name},
    )


@router.get("/files/selected", response_model=SelectedModelsResponse)
def list_selected_models(
    bucket: str = Query(default=MINIO_BUCKET, description="Bucket to read from"),
    prefix: Optional[str] = Query(default=None, description="Prefix to scan (e.g. 'runs/2025-08/')"),
    recursive: bool = Query(default=True, description="Recurse into subfolders"),
    limit: int = Query(default=1000, ge=1, le=10000, description="Max rows to return"),
    offset: int = Query(default=0, ge=0, description="Row offset for pagination"),
    extensions: str = Query(default="parquet,feather,arrow", description="Comma-separated file extensions to include"),
):
    return _submit_task(
        name="evaluate_models_feature_based.list_selected_models",
        path="list_selected_models",
        kwargs={
            "bucket": bucket,
            "prefix": prefix,
            "recursive": recursive,
            "limit": limit,
            "offset": offset,
            "extensions": extensions,
        },
        metadata={"operation": "list_selected_models", "bucket": bucket, "prefix": prefix},
    )


@router.get(
    "/selected/actual-vs-predicted",
    response_model=ActualPredictedResponse,
    tags=["Selected Models", "Charts"],
)
async def selected_actual_vs_predicted(
    results_file_key: str = Query(..., description="MinIO key of the results file with selected_models flags"),
    client_name: str = Query(...),
    app_name: str = Query(...),
    project_name: str = Query(...),
    bucket: str = Query(default=MINIO_BUCKET, description="MinIO bucket for both results & sources"),
    limit_models: int = Query(default=1000, ge=1, le=10000),
):
    return _submit_task(
        name="evaluate_models_feature_based.selected_actual_vs_predicted",
        path="selected_actual_vs_predicted",
        kwargs={
            "results_file_key": results_file_key,
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "bucket": bucket,
            "limit_models": limit_models,
        },
        metadata={
            "operation": "selected_actual_vs_predicted",
            "results_file_key": results_file_key,
            "bucket": bucket,
        },
    )


@router.get(
    "/selected/contributions-yoy",
    response_model=ContributionsResponse,
    tags=["Selected Models", "Charts"],
)
async def selected_contributions_yoy(
    results_file_key: str = Query(..., description="MinIO key of the results file with selected_models flags"),
    client_name: str = Query(...),
    app_name: str = Query(...),
    project_name: str = Query(...),
    bucket: str = Query(default=MINIO_BUCKET),
):
    return _submit_task(
        name="evaluate_models_feature_based.selected_contributions_yoy",
        path="selected_contributions_yoy",
        kwargs={
            "results_file_key": results_file_key,
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "bucket": bucket,
        },
        metadata={
            "operation": "selected_contributions_yoy",
            "results_file_key": results_file_key,
            "bucket": bucket,
        },
    )


@router.get("/get-scope", tags=["Data"])
async def get_scope_from_dataset(
    object_name: str = Query(..., description="MinIO key of the dataset file"),
    bucket: str = Query(default=MINIO_BUCKET),
):
    return _submit_task(
        name="evaluate_models_feature_based.get_scope_from_dataset",
        path="get_scope_from_dataset",
        kwargs={"object_name": object_name, "bucket": bucket},
        metadata={"operation": "get_scope", "object_name": object_name, "bucket": bucket},
    )


@router.get("/get-combinations", tags=["Data"])
async def get_combinations_from_dataset(
    object_name: str = Query(..., description="MinIO key of the dataset file"),
    bucket: str = Query(default=MINIO_BUCKET),
    identifier_values: str = Query(default="", description="JSON string of selected identifier values to filter combinations"),
):
    return _submit_task(
        name="evaluate_models_feature_based.get_combinations_from_dataset",
        path="get_combinations_from_dataset",
        kwargs={
            "object_name": object_name,
            "bucket": bucket,
            "identifier_values": identifier_values,
        },
        metadata={"operation": "get_combinations", "object_name": object_name, "bucket": bucket},
    )


@router.get("/get-identifiers", tags=["Data"])
async def get_identifiers_from_dataset(
    object_name: str = Query(..., description="MinIO key of the dataset file"),
    bucket: str = Query(default=MINIO_BUCKET),
):
    return _submit_task(
        name="evaluate_models_feature_based.get_identifiers_from_dataset",
        path="get_identifiers_from_dataset",
        kwargs={"object_name": object_name, "bucket": bucket},
        metadata={"operation": "get_identifiers", "object_name": object_name, "bucket": bucket},
    )


@router.get("/yoy-growth", tags=["YoY Growth"])
async def yoy_growth(
    results_file_key: str = Query(..., description="MinIO key of the results file"),
    combination_id: str = Query(..., description="Combination ID to analyze"),
    model_name: str = Query(..., description="Model name to analyze"),
    bucket: str = Query(default=MINIO_BUCKET, description="MinIO bucket name"),
):
    return _submit_task(
        name="evaluate_models_feature_based.yoy_growth",
        path="yoy_growth",
        kwargs={
            "results_file_key": results_file_key,
            "combination_id": combination_id,
            "model_name": model_name,
            "bucket": bucket,
        },
        metadata={"operation": "yoy_growth", "combination_id": combination_id, "model_name": model_name},
    )


@router.get("/contribution", tags=["Evaluate"])
async def contribution(
    results_file_key: str = Query(..., description="MinIO key of the results file"),
    combination_id: str = Query(..., description="Combination ID to analyze"),
    model_name: str = Query(..., description="Model name to analyze"),
    bucket: str = Query(default=MINIO_BUCKET, description="MinIO bucket name"),
):
    return _submit_task(
        name="evaluate_models_feature_based.contribution",
        path="contribution",
        kwargs={
            "results_file_key": results_file_key,
            "combination_id": combination_id,
            "model_name": model_name,
            "bucket": bucket,
        },
        metadata={"operation": "contribution", "combination_id": combination_id, "model_name": model_name},
    )


@router.get("/roi", tags=["Evaluate"])
async def roi(
    results_file_key: str = Query(..., description="MinIO key of the results file"),
    combination_id: str = Query(..., description="Combination ID to analyze"),
    model_name: str = Query(..., description="Model name to analyze"),
    bucket: str = Query(default=MINIO_BUCKET, description="MinIO bucket name"),
):
    return _submit_task(
        name="evaluate_models_feature_based.roi",
        path="roi",
        kwargs={
            "results_file_key": results_file_key,
            "combination_id": combination_id,
            "model_name": model_name,
            "bucket": bucket,
        },
        metadata={"operation": "roi", "combination_id": combination_id, "model_name": model_name},
    )


@router.get("/beta", tags=["Evaluate"])
async def beta(
    results_file_key: str = Query(..., description="MinIO key of the results file"),
    combination_id: str = Query(..., description="Combination ID to analyze"),
    model_name: str = Query(..., description="Model name to analyze"),
    bucket: str = Query(default=MINIO_BUCKET, description="MinIO bucket name"),
):
    return _submit_task(
        name="evaluate_models_feature_based.beta",
        path="beta",
        kwargs={
            "results_file_key": results_file_key,
            "combination_id": combination_id,
            "model_name": model_name,
            "bucket": bucket,
        },
        metadata={"operation": "beta", "combination_id": combination_id, "model_name": model_name},
    )


@router.get("/s-curve", tags=["Evaluate"])
async def s_curve(
    results_file_key: str = Query(..., description="MinIO key of the results file"),
    combination_id: str = Query(..., description="Combination ID to analyze"),
    model_name: str = Query(..., description="Model name to analyze"),
    bucket: str = Query(default=MINIO_BUCKET, description="MinIO bucket name"),
):
    return _submit_task(
        name="evaluate_models_feature_based.s_curve",
        path="s_curve",
        kwargs={
            "results_file_key": results_file_key,
            "combination_id": combination_id,
            "model_name": model_name,
            "bucket": bucket,
        },
        metadata={"operation": "s_curve", "combination_id": combination_id, "model_name": model_name},
    )


@router.get("/elasticity", tags=["Evaluate"])
async def elasticity(
    results_file_key: str = Query(..., description="MinIO key of the results file"),
    combination_id: str = Query(..., description="Combination ID to analyze"),
    model_name: str = Query(..., description="Model name to analyze"),
    bucket: str = Query(default=MINIO_BUCKET, description="MinIO bucket name"),
):
    return _submit_task(
        name="evaluate_models_feature_based.elasticity",
        path="elasticity",
        kwargs={
            "results_file_key": results_file_key,
            "combination_id": combination_id,
            "model_name": model_name,
            "bucket": bucket,
        },
        metadata={"operation": "elasticity", "combination_id": combination_id, "model_name": model_name},
    )


@router.get("/averages", tags=["Evaluate"])
async def averages(
    bucket: str = Query(default=MINIO_BUCKET, description="MinIO bucket name"),
    object_key: str = Query(..., description="Object key for the dataset"),
    group_by_column: Optional[str] = Query(default=None, description="Column to group by"),
    target_columns: Optional[str] = Query(default=None, description="Comma-separated list of columns to average"),
):
    return _submit_task(
        name="evaluate_models_feature_based.averages",
        path="averages",
        kwargs={
            "bucket": bucket,
            "object_key": object_key,
            "group_by_column": group_by_column,
            "target_columns": target_columns,
        },
        metadata={"operation": "averages", "bucket": bucket, "object_key": object_key},
    )


@router.post("/save-comments", tags=["Evaluate"])
async def save_comments(
    comments_json: str = Body(..., embed=True, description="JSON string of comments"),
    results_file_key: str = Body(..., embed=True, description="MinIO key of the results file"),
):
    return _submit_task(
        name="evaluate_models_feature_based.save_comments",
        path="save_comments",
        kwargs={"comments_json": comments_json, "results_file_key": results_file_key},
        metadata={"operation": "save_comments", "results_file_key": results_file_key},
    )


__all__ = ["router"]
