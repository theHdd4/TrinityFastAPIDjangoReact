# schemas.py
from __future__ import annotations

from typing import Optional, List, Dict, Union
from datetime import datetime
from pydantic import BaseModel, Field


# ---------- MinIO listing ----------

class MinioObject(BaseModel):
    name: str = Field(..., description="Object key / path in the bucket")
    size: int = Field(..., description="Size in bytes")
    etag: Optional[str] = Field(None, description="Object ETag")
    last_modified: Optional[datetime] = Field(None, description="Last modified time")
    is_dir: bool = Field(False, description="Whether this entry represents a 'directory'")

class ListObjectsResponse(BaseModel):
    bucket: str
    prefix: Optional[str] = None
    count: int
    objects: List[MinioObject]


# ---------- Selected models listing (/files/selected) ----------

class SelectedModelRow(BaseModel):
    # Keep flexible; only present fields will be populated.
    Scope: Optional[str] = None
    combination_id: Optional[str] = None
    y_variable: Optional[str] = None
    x_variables: Optional[List[str]] = None
    model_name: Optional[str] = None
    mape_train: Optional[float] = None
    mape_test: Optional[float] = None
    r2_train: Optional[float] = None
    r2_test: Optional[float] = None
    aic: Optional[float] = None
    bic: Optional[float] = None
    price_elasticity: Optional[float] = None
    run_id: Optional[str] = None
    timestamp: Optional[str] = None  # leave as string; files often store ISO text
    selected_models: Optional[str] = None

class SelectedModelsResponse(BaseModel):
    bucket: str
    prefix: Optional[str] = None
    files_scanned: int
    total_rows_scanned: int
    count: int
    items: List[SelectedModelRow]


# ---------- Actual vs Predicted for all selected ----------

class PerformanceMetrics(BaseModel):
    mae: float
    mse: float
    rmse: float
    r2: float
    mape: float

class ActualPredictedItem(BaseModel):
    combination_id: str
    model_name: str
    file_key: str
    actual_values: List[float]
    predicted_values: List[float]
    dates: Optional[List[str]] = None
    performance_metrics: PerformanceMetrics
    data_points: int

class ActualPredictedResponse(BaseModel):
    results_file_key: str
    bucket: str
    models_count: int
    items: List[ActualPredictedItem]


# ---------- Contributions + YoY for all selected ----------

class ContributionsItem(BaseModel):
    combination_id: str
    model_name: str
    file_key: str
    # years can be numeric or string depending on the source frame
    years: List[Union[int, str]]
    # variable -> series over years
    yearly_contributions: Dict[str, List[float]]
    yoy_contributions_pct: Dict[str, List[float]]

class ContributionsResponse(BaseModel):
    results_file_key: str
    bucket: str
    models_count: int
    items: List[ContributionsItem]


# ---------- Identifiers from dataset ----------

class IdentifierData(BaseModel):
    column_name: Optional[str] = Field(None, description="Actual column name found in dataset")
    unique_values: List[str] = Field(..., description="List of unique values for this identifier")

class IdentifiersResponse(BaseModel):
    identifiers: Dict[str, IdentifierData] = Field(..., description="Identifier name to data mapping")
    object_name: str = Field(..., description="MinIO key of the dataset file")
    bucket: str = Field(..., description="Bucket name")
    count: int = Field(..., description="Number of identifiers found")