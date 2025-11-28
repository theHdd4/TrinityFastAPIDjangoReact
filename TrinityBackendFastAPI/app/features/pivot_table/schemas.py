from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


AggregationLiteral = Literal[
    "sum",
    "avg",
    "average",
    "mean",
    "count",
    "min",
    "max",
    "median",
    "weighted_average",
]


class PivotValueConfig(BaseModel):
    field: str = Field(..., description="Column to aggregate")
    aggregation: AggregationLiteral = Field(
        "sum", description="Aggregation function to apply to the field"
    )
    weight_column: Optional[str] = Field(
        default=None,
        description="Weight column for weighted_average aggregation. Required when aggregation is 'weighted_average'.",
    )


class PivotFilterConfig(BaseModel):
    field: str = Field(..., description="Column name to filter on")
    include: Optional[List[str]] = Field(
        default=None,
        description="List of values to include. If omitted, all values are included.",
    )
    exclude: Optional[List[str]] = Field(
        default=None,
        description="List of values to exclude from the result.",
    )


class PivotSortConfig(BaseModel):
    type: Literal["asc", "desc", "value_asc", "value_desc"] = Field(
        ..., description="Sort type: asc/desc for alphabetical, value_asc/value_desc for by aggregated value"
    )
    level: Optional[int] = Field(
        default=None,
        description="Hierarchy level to apply sorting (0-based). If None, applies to the field's natural level."
    )
    preserve_hierarchy: bool = Field(
        default=True,
        description="Whether to preserve parent-child relationships when sorting. If True, children are sorted within their parent groups."
    )


class PivotComputeRequest(BaseModel):
    data_source: str = Field(..., description="Arrow Flight path or MinIO object name")
    rows: List[str] = Field(default_factory=list, description="Row grouping fields")
    columns: List[str] = Field(
        default_factory=list, description="Column grouping fields"
    )
    values: List[PivotValueConfig] = Field(
        default_factory=list, description="Measures to aggregate"
    )
    filters: List[PivotFilterConfig] = Field(
        default_factory=list, description="Optional filters applied before aggregation"
    )
    sorting: Dict[str, PivotSortConfig] = Field(
        default_factory=dict,
        description="Sorting configuration per field: {fieldName: {type: 'asc'|'desc'|'value_asc'|'value_desc'}}"
    )
    dropna: bool = Field(
        default=True,
        description="Whether to drop columns/rows with all missing values",
    )
    fill_value: Optional[float] = Field(
        default=None, description="Fill value for missing entries in pivot"
    )
    limit: Optional[int] = Field(
        default=None,
        ge=1,
        le=20000,
        description="Optional limit on number of rows returned",
    )
    grand_totals: Literal[
        "off",
        "rows",
        "columns",
        "both",
    ] = Field(
        default="off",
        description=(
            "Control visibility of grand totals. "
            "'off' hides all. 'rows' adds a footer row. "
            "'columns' adds a summary column. 'both' adds both."
        ),
    )


class PivotComputeResponse(BaseModel):
    config_id: str
    status: Literal["success", "failed"]
    updated_at: datetime
    rows: int
    data: List[Dict[str, Any]]
    hierarchy: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Hierarchical nodes describing row field structure for compact/outline layouts",
    )
    column_hierarchy: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Hierarchical nodes describing column field structure for column headers",
    )


class PivotStatusResponse(BaseModel):
    config_id: str
    status: Literal["pending", "success", "failed", "unknown"]
    updated_at: Optional[datetime] = None
    message: Optional[str] = None
    rows: Optional[int] = None


class PivotRefreshResponse(BaseModel):
    config_id: str
    status: Literal["success", "failed"]
    updated_at: datetime
    rows: int


class PivotSaveRequest(BaseModel):
    filename: Optional[str] = Field(
        default=None,
        description="Optional filename for save_as. If not provided, overwrites existing saved file.",
    )
    data: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Optional pre-calculated data to save. If provided, this data will be saved directly (e.g., with percentage values already calculated).",
    )


class PivotSaveResponse(BaseModel):
    config_id: str
    status: Literal["success"]
    object_name: str
    updated_at: datetime
    rows: int

