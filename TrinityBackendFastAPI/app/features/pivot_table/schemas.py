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
]


class PivotValueConfig(BaseModel):
    field: str = Field(..., description="Column to aggregate")
    aggregation: AggregationLiteral = Field(
        "sum", description="Aggregation function to apply to the field"
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
        default="both",
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


class PivotSaveResponse(BaseModel):
    config_id: str
    status: Literal["success"]
    object_name: str
    updated_at: datetime
    rows: int

