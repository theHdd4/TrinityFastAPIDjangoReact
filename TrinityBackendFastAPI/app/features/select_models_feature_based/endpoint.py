"""FastAPI router for the select models feature."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from app.core.task_queue import celery_task_client, format_task_response

from .schemas import (
    ActualVsPredictedRequest,
    ApplicationTypeResponse,
    AvailableFiltersResponse,
    CombinationIdResponse,
    FileListResponse,
    GenericModelSelectionRequest,
    ModelFilterRequest,
    ModelVariablesResponse,
    SCurveRequest,
    SavedCombinationsStatusResponse,
    SavedModelResponse,
    VariableRangesResponse,
    WeightedEnsembleRequest,
)
from .service import (
    calculate_actual_vs_predicted,
    calculate_weighted_ensemble,
    calculate_yoy,
    filter_models,
    filter_models_with_existing,
    generate_s_curve,
    get_application_type,
    get_ensemble_actual_vs_predicted,
    get_ensemble_contribution,
    get_ensemble_yoy,
    get_filter_options,
    get_model_contribution,
    get_model_performance,
    get_saved_combinations_status,
    get_variable_ranges,
    list_combination_ids,
    list_model_results_files,
    list_variables,
    save_model,
)

router = APIRouter(prefix="/select", tags=["Select Feature Based"])


def _submit_task(name: str, dotted_path: str, kwargs: dict, metadata: dict) -> dict:
    try:
        submission = celery_task_client.submit_callable(
            name=name,
            dotted_path=dotted_path,
            kwargs=kwargs,
            metadata=metadata,
        )
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return format_task_response(submission)


@router.get("/list-model-results-files", response_model=FileListResponse)
def get_model_result_files() -> FileListResponse:
    payload = list_model_results_files()
    return FileListResponse.model_validate(payload)


@router.get("/combination-ids", response_model=CombinationIdResponse)
def get_combination_ids(file_key: str = Query(...)) -> CombinationIdResponse:
    payload = list_combination_ids(file_key)
    return CombinationIdResponse.model_validate(payload)


@router.get("/models/variables", response_model=ModelVariablesResponse)
def get_model_variables(
    file_key: str = Query(...),
    mode: str | None = Query(None, description="Return base variable names when set"),
) -> ModelVariablesResponse:
    payload = list_variables(file_key, mode)
    return ModelVariablesResponse.model_validate(payload)


@router.get("/models/filters", response_model=AvailableFiltersResponse)
def get_available_filters(
    file_key: str = Query(...),
    combination_id: str | None = Query(None),
    variable: str = Query(...),
) -> AvailableFiltersResponse:
    payload = get_filter_options(file_key, combination_id, variable)
    return AvailableFiltersResponse.model_validate(payload)


@router.post("/models/filter")
def post_filter_models(request: ModelFilterRequest) -> dict:
    return _submit_task(
        name="select_models_feature_based.filter_models",
        dotted_path="app.features.select_models_feature_based.service.filter_models",
        kwargs={"payload": request.model_dump()},
        metadata={
            "feature": "select_models_feature_based",
            "operation": "filter_models",
            "file_key": request.file_key,
            "combination_id": request.combination_id,
            "variable": request.variable,
        },
    )


@router.post("/models/filter-filtered")
def post_filter_models_existing(request: ModelFilterRequest) -> dict:
    return _submit_task(
        name="select_models_feature_based.filter_models_existing",
        dotted_path="app.features.select_models_feature_based.service.filter_models_with_existing",
        kwargs={"payload": request.model_dump()},
        metadata={
            "feature": "select_models_feature_based",
            "operation": "filter_models_existing",
            "file_key": request.file_key,
            "combination_id": request.combination_id,
            "variable": request.variable,
        },
    )


@router.get("/models/variable-ranges", response_model=VariableRangesResponse)
def get_variable_ranges_endpoint(
    file_key: str = Query(...),
    combination_id: str | None = Query(None),
    variables: str = Query(..., description="Comma separated list of variables"),
) -> VariableRangesResponse:
    payload = get_variable_ranges(file_key, combination_id, [var.strip() for var in variables.split(",") if var.strip()])
    return VariableRangesResponse.model_validate(payload)


@router.get("/models/saved-combinations-status", response_model=SavedCombinationsStatusResponse)
def get_saved_status(
    file_key: str = Query(...),
    atom_id: str = Query(...),
) -> SavedCombinationsStatusResponse:
    payload = get_saved_combinations_status(file_key, atom_id)
    return SavedCombinationsStatusResponse.model_validate(payload)


@router.post("/models/select-save-generic", response_model=SavedModelResponse)
def post_save_model(request: GenericModelSelectionRequest) -> SavedModelResponse:
    payload = save_model(request.model_dump())
    return SavedModelResponse.model_validate(payload)


@router.get("/models/contribution")
def get_contribution(
    file_key: str = Query(...),
    combination_id: str = Query(...),
    model_name: str = Query(...),
) -> dict:
    return _submit_task(
        name="select_models_feature_based.contribution",
        dotted_path="app.features.select_models_feature_based.service.get_model_contribution",
        kwargs={
            "file_key": file_key,
            "combination_id": combination_id,
            "model_name": model_name,
        },
        metadata={
            "feature": "select_models_feature_based",
            "operation": "model_contribution",
            "file_key": file_key,
            "combination_id": combination_id,
            "model_name": model_name,
        },
    )


@router.get("/models/performance")
def get_performance(
    file_key: str = Query(...),
    combination_id: str = Query(...),
    model_name: str = Query(...),
) -> dict:
    return _submit_task(
        name="select_models_feature_based.performance",
        dotted_path="app.features.select_models_feature_based.service.get_model_performance",
        kwargs={
            "file_key": file_key,
            "combination_id": combination_id,
            "model_name": model_name,
        },
        metadata={
            "feature": "select_models_feature_based",
            "operation": "model_performance",
            "file_key": file_key,
            "combination_id": combination_id,
            "model_name": model_name,
        },
    )


@router.post("/actual-vs-predicted")
def post_actual_vs_predicted(request: ActualVsPredictedRequest) -> dict:
    return _submit_task(
        name="select_models_feature_based.actual_vs_predicted",
        dotted_path="app.features.select_models_feature_based.service.calculate_actual_vs_predicted",
        kwargs={"payload": request.model_dump()},
        metadata={
            "feature": "select_models_feature_based",
            "operation": "actual_vs_predicted",
            "combination_id": request.combination_name,
            "model_name": request.model_name,
        },
    )


@router.post("/yoy-calculation")
def post_yoy(request: ActualVsPredictedRequest) -> dict:
    return _submit_task(
        name="select_models_feature_based.yoy",
        dotted_path="app.features.select_models_feature_based.service.calculate_yoy",
        kwargs={"payload": request.model_dump()},
        metadata={
            "feature": "select_models_feature_based",
            "operation": "yoy_calculation",
            "combination_id": request.combination_name,
            "model_name": request.model_name,
        },
    )


@router.get("/models/actual-vs-predicted-ensemble")
def get_ensemble_actual_vs_predicted_endpoint(
    file_key: str = Query(...),
    combination_id: str = Query(...),
) -> dict:
    return _submit_task(
        name="select_models_feature_based.ensemble_actual_vs_predicted",
        dotted_path="app.features.select_models_feature_based.service.get_ensemble_actual_vs_predicted",
        kwargs={
            "file_key": file_key,
            "combination_id": combination_id,
        },
        metadata={
            "feature": "select_models_feature_based",
            "operation": "ensemble_actual_vs_predicted",
            "file_key": file_key,
            "combination_id": combination_id,
        },
    )


@router.get("/models/contribution-ensemble")
def get_ensemble_contribution_endpoint(
    file_key: str = Query(...),
    combination_id: str = Query(...),
) -> dict:
    return _submit_task(
        name="select_models_feature_based.ensemble_contribution",
        dotted_path="app.features.select_models_feature_based.service.get_ensemble_contribution",
        kwargs={
            "file_key": file_key,
            "combination_id": combination_id,
        },
        metadata={
            "feature": "select_models_feature_based",
            "operation": "ensemble_contribution",
            "file_key": file_key,
            "combination_id": combination_id,
        },
    )


@router.get("/models/yoy-calculation-ensemble")
def get_ensemble_yoy_endpoint(
    file_key: str = Query(...),
    combination_id: str = Query(...),
) -> dict:
    return _submit_task(
        name="select_models_feature_based.ensemble_yoy",
        dotted_path="app.features.select_models_feature_based.service.get_ensemble_yoy",
        kwargs={
            "file_key": file_key,
            "combination_id": combination_id,
        },
        metadata={
            "feature": "select_models_feature_based",
            "operation": "ensemble_yoy",
            "file_key": file_key,
            "combination_id": combination_id,
        },
    )


@router.post("/models/weighted-ensemble")
def post_weighted_ensemble(request: WeightedEnsembleRequest) -> dict:
    return _submit_task(
        name="select_models_feature_based.weighted_ensemble",
        dotted_path="app.features.select_models_feature_based.service.calculate_weighted_ensemble",
        kwargs={"payload": request.model_dump()},
        metadata={
            "feature": "select_models_feature_based",
            "operation": "weighted_ensemble",
            "file_key": request.file_key,
        },
    )


@router.post("/models/s-curve")
def post_s_curve(request: SCurveRequest) -> dict:
    return _submit_task(
        name="select_models_feature_based.s_curve",
        dotted_path="app.features.select_models_feature_based.service.generate_s_curve",
        kwargs={"payload": request.model_dump()},
        metadata={
            "feature": "select_models_feature_based",
            "operation": "s_curve",
            "combination_id": request.combination_name,
            "model_name": request.model_name,
        },
    )


@router.get("/application-type", response_model=ApplicationTypeResponse)
def get_application_type_endpoint(
    client_name: str = Query(...),
    app_name: str = Query(...),
    project_name: str = Query(...),
) -> ApplicationTypeResponse:
    payload = get_application_type(client_name, app_name, project_name)
    return ApplicationTypeResponse.model_validate(payload)


__all__ = ["router"]
