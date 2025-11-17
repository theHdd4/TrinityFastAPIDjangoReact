"""FastAPI router for the build_autoregressive feature."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.core.task_queue import celery_task_client, format_task_response

from .schemas import (
    ColumnListResponse,
    GrowthRequest,
    SaveCombinationRequest,
    SavedCombinationStatusResponse,
    TrainAutoregressiveRequest,
)
from .service import (
    calculate_fiscal_growth,
    calculate_halfyearly_growth,
    calculate_quarterly_growth,
    detect_frequency,
    get_saved_combinations_status,
    list_numeric_columns,
    save_single_combination,
    train_autoregressive_models,
    validate_training_request,
)

router = APIRouter(prefix="/build-autoregressive", tags=["Build Autoregressive"])


@router.post("/validate-request")
def post_validate_request(request: TrainAutoregressiveRequest) -> dict:
    return validate_training_request(request.model_dump())


@router.get("/get_columns", response_model=ColumnListResponse)
def get_columns(scope: str = Query(...), combination: str = Query(...)) -> ColumnListResponse:
    payload = list_numeric_columns(scope, combination)
    return ColumnListResponse.model_validate(payload)


@router.post("/detect_frequency")
def post_detect_frequency(request: dict) -> dict:
    try:
        return detect_frequency(request)
    except ValueError as exc:  # pragma: no cover - defensive programming
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/train-autoregressive-models-direct")
def post_train_models(request: TrainAutoregressiveRequest) -> dict:
    submission = celery_task_client.submit_callable(
        name="build_autoregressive.train_models",
        dotted_path="app.features.build_autoregressive.service.train_autoregressive_models",
        kwargs={"payload": request.model_dump()},
        metadata={
            "feature": "build_autoregressive",
            "operation": "train_models",
            "scope_number": request.scope_number,
        },
    )
    return format_task_response(submission)


def _submit_growth_task(endpoint: str, request: GrowthRequest) -> dict:
    return format_task_response(
        celery_task_client.submit_callable(
            name=f"build_autoregressive.{endpoint}",
            dotted_path=f"app.features.build_autoregressive.service.{endpoint}",
            kwargs={"payload": request.model_dump()},
            metadata={
                "feature": "build_autoregressive",
                "operation": endpoint,
                "scope": request.scope,
                "combination": request.combination,
            },
        )
    )


@router.post("/calculate-fiscal-growth")
def post_fiscal_growth(request: GrowthRequest) -> dict:
    return _submit_growth_task("calculate_fiscal_growth", request)


@router.post("/calculate-halfyearly-growth")
def post_halfyearly_growth(request: GrowthRequest) -> dict:
    return _submit_growth_task("calculate_halfyearly_growth", request)


@router.post("/calculate-quarterly-growth")
def post_quarterly_growth(request: GrowthRequest) -> dict:
    return _submit_growth_task("calculate_quarterly_growth", request)


@router.post("/models/save-single-combination")
def post_save_single_combination(request: SaveCombinationRequest) -> dict:
    return save_single_combination(request.model_dump())


@router.get("/models/saved-combinations-status", response_model=SavedCombinationStatusResponse)
def get_saved_combination_status(scope: str = Query(...)) -> SavedCombinationStatusResponse:
    payload = get_saved_combinations_status(scope)
    return SavedCombinationStatusResponse.model_validate(payload)


__all__ = ["router"]

