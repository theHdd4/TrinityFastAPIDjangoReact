"""FastAPI router for the select models feature."""

from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

from app.core.task_queue import celery_task_client, format_task_response

logger = logging.getLogger(__name__)

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
from .ensemble_method import (
    get_ensemble_actual_vs_predicted,
    get_ensemble_contribution,
    get_ensemble_yoy,
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
    method: str | None = Query(None, description="Method type: elasticity, beta, average, or roi"),
) -> VariableRangesResponse:
    payload = get_variable_ranges(
        file_key, 
        combination_id, 
        [var.strip() for var in variables.split(",") if var.strip()],
        method=method
    )
    return VariableRangesResponse.model_validate(payload)


@router.get("/models/saved-combinations-status", response_model=SavedCombinationsStatusResponse)
def get_saved_status(
    file_key: str = Query(...),
    atom_id: str = Query(...),
) -> SavedCombinationsStatusResponse:
    payload = get_saved_combinations_status(file_key, atom_id)
    return SavedCombinationsStatusResponse.model_validate(payload)


@router.post("/models/select-save-generic", response_model=SavedModelResponse)
async def post_save_model(request: GenericModelSelectionRequest) -> SavedModelResponse:
    payload = await save_model(request.model_dump())
    return SavedModelResponse.model_validate(payload)


@router.get("/models/contribution")
def get_contribution(
    file_key: str = Query(..., description="MinIO file key for the model results file"),
    combination_id: str = Query(..., description="Combination ID to filter by"),
    model_name: str = Query(..., description="Model name to get contribution for"),
) -> dict:
    """Get contribution data for a specific model and combination"""
    try:
        result = get_model_contribution(file_key, combination_id, model_name)
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/models/performance")
def get_performance(
    file_key: str = Query(..., description="MinIO file key for the model results file"),
    combination_id: str = Query(..., description="Combination ID to filter by"),
    model_name: str = Query(..., description="Model name to get performance for"),
) -> dict:
    """Get performance metrics for a specific model and combination"""
    try:
        result = get_model_performance(file_key, combination_id, model_name)
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/actual-vs-predicted")
def post_actual_vs_predicted(request: ActualVsPredictedRequest) -> dict:
    """Calculate actual vs predicted values using stored coefficients and actual X values from MongoDB"""
    return _submit_task(
        name="select_models_feature_based.actual_vs_predicted",
        dotted_path="app.features.select_models_feature_based.service.calculate_actual_vs_predicted",
        kwargs={"payload": request.model_dump()},
        metadata={
            "feature": "select_models_feature_based",
            "operation": "actual_vs_predicted",
            "file_key": request.file_key,
            "combination_name": request.combination_name,
            "model_name": request.model_name,
        },
    )


@router.post("/yoy-calculation")
def post_yoy(request: ActualVsPredictedRequest) -> dict:
    """Calculate Year-over-Year (YoY) growth using stored coefficients and actual X values from MongoDB"""
    return _submit_task(
        name="select_models_feature_based.yoy_calculation",
        dotted_path="app.features.select_models_feature_based.service.calculate_yoy",
        kwargs={"payload": request.model_dump()},
        metadata={
            "feature": "select_models_feature_based",
            "operation": "yoy_calculation",
            "file_key": request.file_key,
            "combination_name": request.combination_name,
            "model_name": request.model_name,
        },
    )


@router.get("/models/actual-vs-predicted-ensemble", tags=["Ensemble Actual vs Predicted"])
def get_ensemble_actual_vs_predicted_endpoint(
    file_key: str = Query(..., description="MinIO file key for the model results file"),
    combination_id: str = Query(..., description="Combination ID to filter data"),
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
) -> dict:
    """Calculate actual vs predicted values using ensemble weighted metrics and source file data"""
    try:
        result = get_ensemble_actual_vs_predicted(file_key, combination_id, client_name, app_name, project_name)
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/models/contribution-ensemble", tags=["Ensemble Contribution"])
def get_ensemble_contribution_endpoint(
    file_key: str = Query(..., description="MinIO file key for the model results file"),
    combination_id: str = Query(..., description="Combination ID to filter data"),
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
) -> dict:
    """Get contribution data for ensemble using weighted ensemble metrics"""
    try:
        result = get_ensemble_contribution(file_key, combination_id, client_name, app_name, project_name)
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/models/yoy-calculation-ensemble", tags=["Ensemble YoY Calculation"])
def get_ensemble_yoy_endpoint(
    file_key: str = Query(..., description="MinIO file key for the model results file"),
    combination_id: str = Query(..., description="Combination ID to filter data"),
    client_name: str = Query(..., description="Client name"),
    app_name: str = Query(..., description="App name"),
    project_name: str = Query(..., description="Project name"),
) -> dict:
    """Calculate Year-over-Year (YoY) growth using ensemble weighted metrics and source file data"""
    try:
        result = get_ensemble_yoy(file_key, combination_id, client_name, app_name, project_name)
        return result
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


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
    """Generate S-curve data for media variables with ROI calculations."""
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
async def get_application_type_endpoint(
    client_name: str = Query(...),
    app_name: str = Query(...),
    project_name: str = Query(...),
) -> ApplicationTypeResponse:
    """Get the application type for a specific project from MongoDB build configuration."""
    from .database import db, client
    
    try:
        # Check database connection
        if db is None or client is None:
            logger.warning("MongoDB connection not available, defaulting to 'general'")
            application_type = "general"
        else:
            # Get the build configuration document
            document_id = f"{client_name}/{app_name}/{project_name}"
            logger.info(f"Fetching application type for: {document_id}")
            
            try:
                build_config = await db["build-model_featurebased_configs"].find_one({"_id": document_id})
                
                if not build_config:
                    logger.warning(f"No build configuration found for {document_id}, defaulting to 'general'")
                    application_type = "general"
                else:
                    # Extract application type from build config
                    application_type = build_config.get("application_type", "general")
                    logger.info(f"Application type from build config for {document_id}: {application_type}")
            except Exception as db_error:
                logger.error(f"Database error while fetching application type: {str(db_error)}")
                application_type = "general"
        
        payload = {
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "application_type": application_type,
            "is_mmm": application_type == "mmm",
        }
        
        return ApplicationTypeResponse.model_validate(payload)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(f"Error getting application type: {str(exc)}", exc_info=True)
        # Return default instead of raising error to prevent CORS issues
        payload = {
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
            "application_type": "general",
            "is_mmm": False,
        }
        return ApplicationTypeResponse.model_validate(payload)


__all__ = ["router"]
