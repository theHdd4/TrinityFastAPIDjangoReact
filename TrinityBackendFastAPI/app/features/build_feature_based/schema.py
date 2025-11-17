"""Pydantic schemas for the build_feature_based feature."""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

from pydantic import BaseModel, Field, validator


class DatasetSummary(BaseModel):
    df_id: str = Field(..., description="Identifier of the dataframe session")
    row_count: int = Field(..., ge=0)
    column_count: int = Field(..., ge=0)
    columns: Sequence[str] = Field(default_factory=list)


class DatasetListResponse(BaseModel):
    datasets: List[DatasetSummary]


class ColumnSummary(BaseModel):
    name: str
    dtype: str
    null_count: int = Field(..., ge=0)
    unique_count: int = Field(..., ge=0)
    mean: Optional[float] = None
    stddev: Optional[float] = None


class ColumnListResponse(BaseModel):
    columns: List[ColumnSummary]


class FeatureSummaryRequest(BaseModel):
    df_id: str
    feature_columns: List[str] = Field(..., min_items=1)
    target_column: Optional[str] = None

    @validator("feature_columns")
    def validate_columns(cls, value: List[str]) -> List[str]:
        cleaned = [col for col in value if col]
        if not cleaned:
            raise ValueError("feature_columns must contain at least one column name")
        return cleaned


class FeatureSummaryResponse(BaseModel):
    summary: List[Dict[str, Any]]
    target_column: Optional[str] = None
    correlations: Dict[str, float] = Field(default_factory=dict)


class FeatureMatrixRequest(BaseModel):
    df_id: str
    feature_columns: List[str] = Field(..., min_items=1)
    target_column: Optional[str] = None
    limit: int = Field(2000, gt=0, le=10000)
    include_target: bool = True


class FeatureMatrixResponse(BaseModel):
    rows: List[Dict[str, Any]]
    row_count: int
    column_count: int
    columns: List[str]


class TrainModelRequest(BaseModel):
    df_id: str
    target_column: str
    feature_columns: List[str] = Field(..., min_items=1)


class TrainModelResponse(BaseModel):
    df_id: str
    target_column: str
    intercept: float
    coefficients: Dict[str, float]
    metrics: Dict[str, Any]
    rows_used: int
    rank: int
    singular_values: List[float]


__all__ = [
    "DatasetListResponse",
    "ColumnListResponse",
    "FeatureSummaryRequest",
    "FeatureSummaryResponse",
    "FeatureMatrixRequest",
    "FeatureMatrixResponse",
    "TrainModelRequest",
    "TrainModelResponse",
]
