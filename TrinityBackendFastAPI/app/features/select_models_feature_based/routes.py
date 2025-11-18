"""Routes for the select models feature without task queue indirection.

These endpoints mirror the behaviour from the legacy ``new_workflow_sol_branch``
implementation where requests were served directly instead of being queued
through Celery. Service functions are invoked inline so responses are returned
immediately to the client.
"""

from __future__ import annotations

from fastapi import APIRouter, Query

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

router = APIRouter(tags=["Select Feature Based"])


@router.get("/list-model-results-files", response_model=FileListResponse)
def get_model_result_files(
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="Application name"),
    project_name: str = Query(..., description="Project name"),
    prefix: str = Query("model-results/", description="Folder prefix inside the project"),
    limit: int = Query(100, description="Maximum number of files to return"),
) -> FileListResponse:
    payload = list_model_results_files(
        client_name=client_name,
        app_name=app_name,
        project_name=project_name,
        prefix=prefix,
        limit=limit,
    )
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
    return filter_models(request.model_dump())


@router.post("/models/filter-filtered")
def post_filter_models_existing(request: ModelFilterRequest) -> dict:
    return filter_models_with_existing(request.model_dump())


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
    return get_model_contribution(file_key=file_key, combination_id=combination_id, model_name=model_name)


@router.get("/models/performance")
def get_performance(
    file_key: str = Query(...),
    combination_id: str = Query(...),
    model_name: str = Query(...),
) -> dict:
    return get_model_performance(file_key=file_key, combination_id=combination_id, model_name=model_name)


@router.post("/actual-vs-predicted")
def post_actual_vs_predicted(request: ActualVsPredictedRequest) -> dict:
    return calculate_actual_vs_predicted(request.model_dump())


@router.post("/yoy-calculation")
def post_yoy(request: ActualVsPredictedRequest) -> dict:
    return calculate_yoy(request.model_dump())


@router.get("/models/actual-vs-predicted-ensemble")
def get_ensemble_actual_vs_predicted_endpoint(
    file_key: str = Query(...),
    combination_id: str = Query(...),
) -> dict:
    return get_ensemble_actual_vs_predicted(file_key=file_key, combination_id=combination_id)


@router.get("/models/contribution-ensemble")
def get_ensemble_contribution_endpoint(
    file_key: str = Query(...),
    combination_id: str = Query(...),
) -> dict:
    return get_ensemble_contribution(file_key=file_key, combination_id=combination_id)


@router.get("/models/yoy-calculation-ensemble")
def get_ensemble_yoy_endpoint(
    file_key: str = Query(...),
    combination_id: str = Query(...),
) -> dict:
    return get_ensemble_yoy(file_key=file_key, combination_id=combination_id)


@router.post("/models/weighted-ensemble")
def post_weighted_ensemble(request: WeightedEnsembleRequest) -> dict:
    return calculate_weighted_ensemble(request.model_dump())


@router.post("/models/s-curve")
def post_s_curve(request: SCurveRequest) -> dict:
    return generate_s_curve(request.model_dump())


@router.get("/application-type", response_model=ApplicationTypeResponse)
def get_application_type_endpoint(
    client_name: str = Query(...),
    app_name: str = Query(...),
    project_name: str = Query(...),
) -> ApplicationTypeResponse:
    payload = get_application_type(client_name, app_name, project_name)
    return ApplicationTypeResponse.model_validate(payload)


__all__ = ["router"]
