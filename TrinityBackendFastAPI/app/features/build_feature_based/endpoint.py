"""FastAPI router for the build_feature_based feature."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.core.task_queue import celery_task_client, format_task_response
from app.features.dataframe_operations.service import SESSIONS

from .schema import (
    ColumnListResponse,
    DatasetListResponse,
    FeatureMatrixRequest,
    FeatureSummaryRequest,
    TrainModelRequest,
)
from .service import describe_dataframe, list_columns, list_sessions

router = APIRouter(prefix="/build-feature-based", tags=["Build Feature Based"])


def _ensure_session(df_id: str) -> None:
    if df_id not in SESSIONS:
        raise HTTPException(status_code=404, detail="Dataframe session not found")


@router.get("/datasets", response_model=DatasetListResponse)
def get_datasets() -> DatasetListResponse:
    """Return all known dataframe sessions for the feature."""

    payload = list_sessions()
    return DatasetListResponse.model_validate(payload)


@router.get("/datasets/{df_id}")
def get_dataset_detail(df_id: str) -> dict:
    """Return a dataframe payload for quick previews."""

    _ensure_session(df_id)
    return describe_dataframe(df_id)


@router.get("/datasets/{df_id}/columns", response_model=ColumnListResponse)
def get_dataset_columns(df_id: str) -> ColumnListResponse:
    _ensure_session(df_id)
    payload = list_columns(df_id)
    return ColumnListResponse.model_validate(payload)


@router.post("/feature-summary")
def post_feature_summary(request: FeatureSummaryRequest):
    _ensure_session(request.df_id)
    submission = celery_task_client.submit_callable(
        name="build_feature_based.feature_summary",
        dotted_path="app.features.build_feature_based.service.summarise_features",
        kwargs=request.model_dump(),
        metadata={
            "feature": "build_feature_based",
            "operation": "feature_summary",
            "df_id": request.df_id,
        },
    )
    return format_task_response(submission)


@router.post("/feature-matrix")
def post_feature_matrix(request: FeatureMatrixRequest):
    _ensure_session(request.df_id)
    submission = celery_task_client.submit_callable(
        name="build_feature_based.feature_matrix",
        dotted_path="app.features.build_feature_based.service.feature_matrix",
        kwargs=request.model_dump(),
        metadata={
            "feature": "build_feature_based",
            "operation": "feature_matrix",
            "df_id": request.df_id,
        },
    )
    return format_task_response(submission)


@router.post("/train-model")
def post_train_model(request: TrainModelRequest):
    _ensure_session(request.df_id)
    submission = celery_task_client.submit_callable(
        name="build_feature_based.train_model",
        dotted_path="app.features.build_feature_based.service.train_linear_model",
        kwargs=request.model_dump(),
        metadata={
            "feature": "build_feature_based",
            "operation": "train_model",
            "df_id": request.df_id,
            "target_column": request.target_column,
        },
    )
    return format_task_response(submission)


@router.get("/datasets/{df_id}/columns/search")
def search_columns(df_id: str, q: str = Query(..., min_length=1, description="Case insensitive search term")) -> dict:
    _ensure_session(df_id)
    payload = list_columns(df_id)
    term = q.lower()
    filtered = [col for col in payload["columns"] if term in col["name"].lower()]
    return {"columns": filtered, "query": q}


__all__ = ["router"]
