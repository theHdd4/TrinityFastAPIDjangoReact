"""Pydantic schemas for the select models feature."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class FileListResponse(BaseModel):
    total_files: int
    files: List[Dict[str, Any]]
    bucket: str
    prefix: str


class CombinationIdResponse(BaseModel):
    file_key: str
    unique_combination_ids: List[str] = Field(default_factory=list)
    total_combinations: int
    note: Optional[str] = None


class ModelVariablesResponse(BaseModel):
    file_key: str
    variables: List[str]
    total_variables: int
    note: Optional[str] = None


class FilterBounds(BaseModel):
    min: float
    max: float
    current_min: float
    current_max: float


class AvailableFiltersResponse(BaseModel):
    file_key: str
    combination_id: Optional[str]
    variable: str
    available_filters: Dict[str, FilterBounds]
    note: Optional[str] = None


class ModelFilterRequest(BaseModel):
    file_key: str
    variable: str
    method: Optional[str] = "elasticity"
    combination_id: Optional[str] = None
    min_mape: Optional[float] = None
    max_mape: Optional[float] = None
    min_r2: Optional[float] = None
    max_r2: Optional[float] = None
    min_self_elasticity: Optional[float] = None
    max_self_elasticity: Optional[float] = None
    min_mape_train: Optional[float] = None
    max_mape_train: Optional[float] = None
    min_mape_test: Optional[float] = None
    max_mape_test: Optional[float] = None
    min_r2_train: Optional[float] = None
    max_r2_train: Optional[float] = None
    min_r2_test: Optional[float] = None
    max_r2_test: Optional[float] = None
    min_aic: Optional[float] = None
    max_aic: Optional[float] = None
    min_bic: Optional[float] = None
    max_bic: Optional[float] = None
    variable_filters: Optional[Dict[str, Dict[str, float]]] = None


class FilteredModel(BaseModel):
    model_name: str
    self_elasticity: float
    self_beta: Optional[float] = None
    self_avg: Optional[float] = None
    self_roi: Optional[float] = None
    combination_id: Optional[str] = None


class FilteredModelListResponse(BaseModel):
    results: List[FilteredModel]
    total: int


class VariableRangesResponse(BaseModel):
    file_key: str
    combination_id: Optional[str]
    variable_ranges: Dict[str, FilterBounds]
    note: Optional[str] = None


class SavedCombinationsStatusResponse(BaseModel):
    file_key: str
    atom_id: str
    total_combinations: int
    saved_combinations: List[str]
    pending_combinations: List[str]
    saved_count: int
    pending_count: int
    completion_percentage: float
    note: Optional[str] = None


class GenericModelSelectionRequest(BaseModel):
    file_key: str
    filter_criteria: Dict[str, Any]
    model_name: str
    tags: List[str] = Field(default_factory=list)
    description: Optional[str] = None
    client_name: str
    app_name: str
    project_name: str


class SavedModelResponse(BaseModel):
    model_id: str
    saved_at: datetime | str
    status: str
    row_data: Dict[str, Any]


class ContributionResponse(BaseModel):
    file_key: str
    combination_id: str
    model_name: str
    model_performance: Dict[str, Optional[float]]
    total_contribution: float
    contribution_data: List[Dict[str, Any]]
    summary: Dict[str, Any]


class PerformanceResponse(BaseModel):
    file_key: str
    combination_id: str
    model_name: str
    performance_metrics: List[Dict[str, Any]]


class ActualVsPredictedRequest(BaseModel):
    client_name: str
    app_name: str
    project_name: str
    file_key: str
    combination_name: str
    model_name: str


class ActualVsPredictedResponse(BaseModel):
    success: bool
    actual_values: List[float]
    predicted_values: List[float]
    dates: List[str]
    rmse: float
    mae: float


class YoYResponse(BaseModel):
    success: bool
    dates: List[str]
    actual: List[float]
    predicted: List[float]


class WeightedEnsembleRequest(BaseModel):
    file_key: str
    grouping_keys: List[str]
    include_numeric: Optional[List[str]] = None
    exclude_numeric: Optional[List[str]] = None
    filter_criteria: Optional[Dict[str, Any]] = None
    filtered_models: Optional[List[str]] = None


class ComboResult(BaseModel):
    combo: Dict[str, Any]
    models_used: int
    best_model: Optional[str] = None
    best_mape: Optional[float] = None
    weight_concentration: Optional[float] = None
    model_composition: Dict[str, float]
    weighted: Dict[str, Optional[float]]
    aliases: Dict[str, Optional[float]]
    y_pred_at_mean: Optional[float] = None


class WeightedEnsembleResponse(BaseModel):
    grouping_keys: List[str]
    total_combos: int
    results: List[ComboResult]


class SCurveRequest(BaseModel):
    client_name: str
    app_name: str
    project_name: str
    combination_name: str
    model_name: str


class SCurveSeries(BaseModel):
    media_values: List[float]
    total_volumes: List[float]
    percent_changes: List[float]
    curve_analysis: Dict[str, Any]


class SCurveResponse(BaseModel):
    success: bool
    file_key: str
    combination_id: str
    model_name: str
    price_variable: Optional[str] = None
    intercept: Optional[float] = None
    base_price: Optional[float] = None
    base_volume: Optional[float] = None
    base_revenue: Optional[float] = None
    elasticity_at_base: Optional[float] = None
    rpi_competitor_prices: Dict[str, float] = Field(default_factory=dict)
    quality: Dict[str, Optional[float]] = Field(default_factory=dict)
    s_curves: Dict[str, SCurveSeries] = Field(default_factory=dict)
    curve_data: List[Dict[str, float]] = Field(default_factory=list)
    optimal_revenue: Optional[Dict[str, float]] = None
    note: Optional[str] = None


class ApplicationTypeResponse(BaseModel):
    client_name: str
    app_name: str
    project_name: str
    application_type: str
    is_mmm: bool


__all__ = [
    "ActualVsPredictedRequest",
    "ActualVsPredictedResponse",
    "ApplicationTypeResponse",
    "AvailableFiltersResponse",
    "CombinationIdResponse",
    "ComboResult",
    "ContributionResponse",
    "FilteredModel",
    "FilteredModelListResponse",
    "FileListResponse",
    "GenericModelSelectionRequest",
    "ModelFilterRequest",
    "ModelVariablesResponse",
    "PerformanceResponse",
    "SCurveRequest",
    "SCurveResponse",
    "SCurveSeries",
    "SavedCombinationsStatusResponse",
    "SavedModelResponse",
    "VariableRangesResponse",
    "WeightedEnsembleRequest",
    "WeightedEnsembleResponse",
    "YoYResponse",
]
