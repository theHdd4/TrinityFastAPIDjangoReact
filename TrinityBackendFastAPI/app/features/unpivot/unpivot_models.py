from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class UnpivotFilterConfig(BaseModel):
    """Filter configuration for pre/post unpivot filtering."""
    field: str = Field(..., description="Column name to filter on")
    include: Optional[List[str]] = Field(
        default=None,
        description="List of values to include. If omitted, all values are included.",
    )
    exclude: Optional[List[str]] = Field(
        default=None,
        description="List of values to exclude from the result.",
    )


class VariableDecoderMapping(BaseModel):
    """Mapping configuration for variable decoder segment extraction."""
    index: int = Field(..., description="Segment index (0-based)")
    column: str = Field(..., description="Output column name")
    dtype: str = Field(..., description="Data type: string, int, category")


class VariableDecoderConfig(BaseModel):
    """Configuration for variable decoder that splits variable column into dimensions."""
    enabled: bool = Field(default=False, description="Whether decoder is enabled")
    type: Literal["delimiter", "regex"] = Field(default="delimiter", description="Decoder type")
    delimiter: Optional[str] = Field(default=None, description="Delimiter for split (space, _, -)")
    regex: Optional[str] = Field(default=None, description="Regex pattern with named groups")
    mappings: List[VariableDecoderMapping] = Field(default_factory=list, description="Column mappings")


class UnpivotCreateRequest(BaseModel):
    """Request to create a new unpivot atom."""
    project_id: str = Field(..., description="Project identifier")
    workflow_id: str = Field(..., description="Workflow identifier")
    atom_name: str = Field(..., description="Name of the unpivot atom")
    dataset_path: str = Field(..., description="Path to dataset in MinIO (e.g., minio://datasets/sales_matrix.parquet)")


class UnpivotCreateResponse(BaseModel):
    """Response after creating an unpivot atom."""
    atom_id: str = Field(..., description="Unique identifier for the unpivot atom")
    project_id: str
    workflow_id: str
    atom_name: str
    created_at: datetime
    status: str = Field(default="created", description="Initial status")


class UnpivotPropertiesUpdate(BaseModel):
    """Update request for unpivot atom properties."""
    id_vars: Optional[List[str]] = Field(
        default=None,
        description="Columns to use as identifier variables (will be kept as columns)"
    )
    value_vars: Optional[List[str]] = Field(
        default=None,
        description="Columns to unpivot (will be converted to rows)"
    )
    variable_column_name: Optional[str] = Field(
        default="variable",
        description="Name for the column containing variable names"
    )
    value_column_name: Optional[str] = Field(
        default="value",
        description="Name for the column containing values"
    )
    pre_filters: Optional[List[UnpivotFilterConfig]] = Field(
        default_factory=list,
        description="Filters to apply before unpivoting"
    )
    post_filters: Optional[List[UnpivotFilterConfig]] = Field(
        default_factory=list,
        description="Filters to apply after unpivoting"
    )
    auto_refresh: Optional[bool] = Field(
        default=True,
        description="Whether to automatically recompute when properties change"
    )
    variable_decoder: Optional[VariableDecoderConfig] = Field(
        default=None,
        description="Configuration for variable decoder (splits variable column into dimensions)"
    )


class UnpivotMetadataResponse(BaseModel):
    """Metadata about an unpivot atom."""
    atom_id: str
    project_id: str
    workflow_id: str
    atom_name: str
    dataset_path: str
    id_vars: List[str] = Field(default_factory=list)
    value_vars: List[str] = Field(default_factory=list)
    variable_column_name: str = "variable"
    value_column_name: str = "value"
    pre_filters: List[Dict[str, Any]] = Field(default_factory=list)
    post_filters: List[Dict[str, Any]] = Field(default_factory=list)
    auto_refresh: bool = True
    variable_decoder: Optional[Dict[str, Any]] = Field(default=None, description="Variable decoder configuration")
    created_at: datetime
    updated_at: Optional[datetime] = None
    last_computed_at: Optional[datetime] = None


class UnpivotComputeRequest(BaseModel):
    """Request to compute unpivot transformation."""
    force_recompute: bool = Field(
        default=False,
        description="Force recomputation even if cached result exists"
    )
    preview_limit: Optional[int] = Field(
        default=None,
        description="If set, only compute first N rows for preview"
    )


class UnpivotComputeResponse(BaseModel):
    """Response from unpivot computation."""
    atom_id: str
    status: str = Field(..., description="success or failed")
    updated_at: datetime
    row_count: int
    dataframe: List[Dict[str, Any]] = Field(..., description="Unpivoted data as records")
    summary: Dict[str, Any] = Field(default_factory=dict, description="Summary statistics")
    computation_time: float = Field(..., description="Time taken in seconds")


class UnpivotResultResponse(BaseModel):
    """Response for getting unpivot result."""
    atom_id: str
    status: str
    updated_at: datetime
    row_count: int
    dataframe: List[Dict[str, Any]]
    summary: Dict[str, Any] = Field(default_factory=dict)


class UnpivotValidateRequest(BaseModel):
    """Request to validate unpivot configuration."""
    dataset_path: str = Field(..., description="Path to dataset")
    id_vars: List[str] = Field(..., description="Identifier variables")
    value_vars: List[str] = Field(..., description="Value variables to unpivot")


class UnpivotValidateResponse(BaseModel):
    """Response from validation."""
    valid: bool
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    column_info: Dict[str, Any] = Field(default_factory=dict)


class DatasetSchemaRequest(BaseModel):
    """Request to get dataset schema."""
    dataset_path: str = Field(..., description="Path to dataset")


class DatasetSchemaResponse(BaseModel):
    """Response with dataset schema information."""
    columns: List[str] = Field(..., description="Column names")
    dtypes: Dict[str, str] = Field(..., description="Data types per column")
    null_stats: Dict[str, int] = Field(..., description="Null counts per column")
    row_count: int = Field(..., description="Total row count")
    id_vars_candidates: List[str] = Field(default_factory=list, description="Suggested id_vars")
    value_vars_candidates: List[str] = Field(default_factory=list, description="Suggested value_vars")


class UnpivotSaveRequest(BaseModel):
    """Request to save unpivot result."""
    format: str = Field(default="parquet", description="Output format (parquet, arrow, csv)")
    filename: Optional[str] = Field(
        default=None,
        description="Optional filename for save_as. If not provided, overwrites existing saved file.",
    )


class UnpivotSaveResponse(BaseModel):
    """Response after saving unpivot result."""
    atom_id: str
    status: str = "success"
    minio_path: str = Field(..., description="Path in MinIO where result is saved")
    updated_at: datetime
    row_count: int


class UnpivotDatasetUpdatedRequest(BaseModel):
    """Request when dataset is updated (triggers auto-refresh)."""
    dataset_path: Optional[str] = Field(default=None, description="New dataset path if changed")


class UnpivotAutosaveResponse(BaseModel):
    """Response from autosave operation."""
    atom_id: str
    status: str
    saved_at: datetime
    snapshot_path: Optional[str] = None


class UnpivotCacheResponse(BaseModel):
    """Response for cached result."""
    atom_id: str
    status: str
    updated_at: datetime
    row_count: int
    dataframe: List[Dict[str, Any]]
    summary: Dict[str, Any] = Field(default_factory=dict)

