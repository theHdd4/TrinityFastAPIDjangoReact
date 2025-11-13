"""Pydantic schemas for build_autoregressive."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class AutoregressiveModelConfig(BaseModel):
    forecast_horizon: int = Field(12, ge=1, le=60)
    fiscal_start_month: int = Field(1, ge=1, le=12)
    frequency: str = Field("M")
    models_to_run: Optional[List[str]] = None


class TrainAutoregressiveRequest(BaseModel):
    scope_number: str = Field(..., min_length=1)
    combinations: List[str] = Field(..., min_length=1)
    y_variable: str = Field(..., min_length=1)
    forecast_horizon: int = Field(12, ge=1, le=120)
    fiscal_start_month: int = Field(1, ge=1, le=12)
    frequency: str = Field("M", min_length=1, max_length=1)
    models_to_run: Optional[List[str]] = None
    run_id: Optional[str] = None


class AutoregressiveTrainingResponse(BaseModel):
    run_id: str
    status: str
    message: str
    scope_id: str
    set_name: str
    total_combinations: int
    processed_combinations: int
    results: List[Dict[str, Any]]


class DetectFrequencyRequest(BaseModel):
    scope: str = Field(..., min_length=1)
    combination: str = Field(..., min_length=1)
    date_column: Optional[str] = None


class GrowthRequest(BaseModel):
    scope: str = Field(..., min_length=1)
    combination: str = Field(..., min_length=1)
    forecast_horizon: int = Field(12, ge=1, le=120)
    fiscal_start_month: int = Field(1, ge=1, le=12)
    frequency: str = Field("M", min_length=1, max_length=1)
    run_id: Optional[str] = None
    start_year: Optional[int] = None


class SaveCombinationRequest(BaseModel):
    scope: Optional[str] = None
    combination_id: str = Field(..., min_length=1)
    result: Optional[Dict[str, Any]] = None
    status: Optional[str] = None
    tags: Optional[List[str]] = None
    description: Optional[str] = None
    client_name: Optional[str] = None
    app_name: Optional[str] = None
    project_name: Optional[str] = None
    client_id: Optional[str] = None
    app_id: Optional[str] = None
    project_id: Optional[str] = None


class SavedCombinationStatusResponse(BaseModel):
    scope: str
    saved_combinations: List[str]
    pending_combinations: List[str]
    saved_count: int
    pending_count: int
    total_combinations: int
    completion_percentage: float
    note: Optional[str] = None


class ColumnListResponse(BaseModel):
    scope: str
    combination: str
    numerical_columns: List[str]
    categorical_columns: List[str]


__all__ = [
    "AutoregressiveModelConfig",
    "AutoregressiveTrainingResponse",
    "ColumnListResponse",
    "DetectFrequencyRequest",
    "GrowthRequest",
    "SaveCombinationRequest",
    "SavedCombinationStatusResponse",
    "TrainAutoregressiveRequest",
]

