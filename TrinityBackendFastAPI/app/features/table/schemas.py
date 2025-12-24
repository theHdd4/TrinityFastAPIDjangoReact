"""
Pydantic schemas for Table atom API requests and responses.
"""
from pydantic import BaseModel, Field, validator
from typing import List, Dict, Any, Optional, Literal, Union
from enum import Enum


class TableLoadRequest(BaseModel):
    """Request to load a table from MinIO"""
    object_name: str
    atom_id: Optional[str] = None  # Atom ID for session tracking
    project_id: Optional[str] = None  # Project ID for session tracking
    reuse_table_id: Optional[str] = None  # Reuse existing table_id during pipeline runs (instead of creating new UUID)
    skip_pipeline_recording: Optional[bool] = False  # Skip recording to pipeline (used when called from within KPI Dashboard)


class TableSettings(BaseModel):
    """Table configuration settings"""
    visible_columns: Optional[List[str]] = None
    column_order: Optional[List[str]] = None
    column_widths: Optional[Dict[str, int]] = {}
    row_height: int = 32
    show_row_numbers: bool = True
    show_summary_row: bool = False
    frozen_columns: int = 0
    filters: Optional[Dict[str, Any]] = {}
    sort_config: Optional[List[Dict[str, str]]] = []


class TableUpdateRequest(BaseModel):
    """Request to update table settings and recompute"""
    table_id: str
    settings: TableSettings
    atom_id: Optional[str] = None  # Atom ID for session tracking
    project_id: Optional[str] = None  # Project ID for session tracking


class TableMetadata(BaseModel):
    """Table metadata including formatting, design, and layout settings"""
    cell_formatting: Optional[Dict[str, Dict[str, Dict[str, Any]]]] = Field(
        default=None,
        description="Cell-level formatting: { 'row_0': { 'column_name': { 'html': '...', 'bold': true, ... } } }"
    )
    design: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Design settings: theme, borderStyle, customColors, columnAlignment, columnFontStyles"
    )
    layout: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Layout settings: headerRow, totalRow, bandedRows, bandedColumns, firstColumn, lastColumn"
    )
    column_widths: Optional[Dict[str, int]] = Field(
        default=None,
        description="Column widths: { 'column_name': 150 }"
    )
    row_heights: Optional[Dict[int, int]] = Field(
        default=None,
        description="Row heights: { 0: 32, 1: 40 }"
    )


class TableSaveRequest(BaseModel):
    """Request to save table data to MinIO"""
    table_id: str
    filename: Optional[str] = None
    overwrite_original: bool = False
    use_header_row: bool = False  # If True, first row values become column names
    conditional_format_rules: Optional[List[Any]] = Field(
        default=None,
        description="Optional conditional formatting rules to evaluate and save with the table"
    )
    metadata: Optional[TableMetadata] = Field(
        default=None,
        description="Table metadata including formatting, design, and layout settings"
    )
    atom_id: Optional[str] = None  # Atom ID for session tracking
    project_id: Optional[str] = None  # Project ID for session tracking


class TableResponse(BaseModel):
    """Response containing table data"""
    table_id: str
    columns: List[str]
    rows: List[Dict[str, Any]]
    row_count: int
    column_types: Dict[str, str]
    object_name: Optional[str] = None
    settings: Optional[TableSettings] = None
    conditional_format_styles: Optional[Dict[str, Dict[str, Dict[str, str]]]] = Field(
        default=None,
        description="Conditional formatting styles loaded from saved table metadata"
    )
    metadata: Optional[TableMetadata] = Field(
        default=None,
        description="Table metadata including formatting, design, and layout settings"
    )


class TableSaveResponse(BaseModel):
    """Response after saving table"""
    object_name: str
    status: str
    message: str
    row_count: int
    column_count: int


class TablePreviewRequest(BaseModel):
    """Request for paginated preview"""
    table_id: str
    page: int = 1
    page_size: int = 50


class TableAggregateRequest(BaseModel):
    """Request to compute aggregations"""
    table_id: str
    aggregations: Dict[str, List[str]]  # column -> [agg_functions]


# ============================================================================
# Conditional Formatting Schemas
# ============================================================================

class Operator(str, Enum):
    """Supported operators for highlight rules"""
    GREATER_THAN = "gt"
    LESS_THAN = "lt"
    EQUAL = "eq"
    NOT_EQUAL = "ne"
    CONTAINS = "contains"
    STARTS_WITH = "starts_with"
    ENDS_WITH = "ends_with"
    BETWEEN = "between"
    TOP_N = "top_n"
    BOTTOM_N = "bottom_n"
    ABOVE_AVERAGE = "above_average"
    BELOW_AVERAGE = "below_average"


class FormatStyle(BaseModel):
    """Style definition for formatting"""
    backgroundColor: Optional[str] = Field(None, pattern="^#[0-9A-Fa-f]{6}$")
    textColor: Optional[str] = Field(None, pattern="^#[0-9A-Fa-f]{6}$")
    fontWeight: Optional[Literal["bold", "normal"]] = None
    fontSize: Optional[int] = Field(None, ge=8, le=72)


class HighlightRule(BaseModel):
    """Highlight rule - applies style when condition is met"""
    type: Literal["highlight"] = "highlight"
    id: str
    enabled: bool = True
    priority: int = Field(default=0, ge=0, le=1000)  # Lower = higher priority
    column: str
    operator: Operator
    value1: Optional[Any] = None  # Primary value (required for most operators)
    value2: Optional[Any] = None  # Secondary value (for BETWEEN)
    style: FormatStyle
    
    @validator("value1", always=True)
    def validate_value1(cls, v, values):
        operator = values.get("operator")
        if operator in [Operator.BETWEEN, Operator.TOP_N, Operator.BOTTOM_N]:
            if v is None:
                raise ValueError(f"value1 is required for operator {operator}")
        return v
    
    @validator("value2")
    def validate_value2(cls, v, values):
        operator = values.get("operator")
        if operator == Operator.BETWEEN and v is None:
            raise ValueError("value2 is required for BETWEEN operator")
        return v


class ColorScaleRule(BaseModel):
    """Color scale rule - gradient based on value"""
    type: Literal["color_scale"] = "color_scale"
    id: str
    enabled: bool = True
    priority: int = Field(default=0, ge=0, le=1000)
    column: str
    min_color: str = Field(..., pattern="^#[0-9A-Fa-f]{6}$")
    max_color: str = Field(..., pattern="^#[0-9A-Fa-f]{6}$")
    mid_color: Optional[str] = Field(None, pattern="^#[0-9A-Fa-f]{6}$")  # For 3-color scale


class DataBarRule(BaseModel):
    """Data bar rule - horizontal bars in cells"""
    type: Literal["data_bar"] = "data_bar"
    id: str
    enabled: bool = True
    priority: int = Field(default=0, ge=0, le=1000)
    column: str
    color: str = Field(..., pattern="^#[0-9A-Fa-f]{6}$")
    show_value: bool = True  # Show number + bar, or bar only


class IconSetRule(BaseModel):
    """Icon set rule - icons based on thresholds"""
    type: Literal["icon_set"] = "icon_set"
    id: str
    enabled: bool = True
    priority: int = Field(default=0, ge=0, le=1000)
    column: str
    icon_set: Literal["arrows", "traffic_lights", "stars", "checkmarks"]
    thresholds: Dict[str, float]  # {"high": 80, "medium": 50}


# Discriminated union for all rule types
ConditionalFormatRule = Union[HighlightRule, ColorScaleRule, DataBarRule, IconSetRule]


class FormatRequest(BaseModel):
    """Request to evaluate conditional formatting"""
    table_id: str
    rules: List[ConditionalFormatRule] = Field(default_factory=list)


class FormatResponse(BaseModel):
    """Response containing evaluated style map"""
    table_id: str
    styles: Dict[str, Dict[str, Dict[str, str]]] = Field(
        default_factory=dict,
        description="Sparse style map: { 'row_5': { 'Sales': { 'backgroundColor': '#FF0000' } } }"
    )
    evaluated_at: Optional[str] = None  # ISO timestamp for caching


class RestoreSessionRequest(BaseModel):
    """Request to restore a session from MongoDB/MinIO"""
    table_id: str
    atom_id: Optional[str] = None
    project_id: Optional[str] = None


class RestoreSessionResponse(BaseModel):
    """Response after restoring a session"""
    table_id: str
    restored: bool
    has_unsaved_changes: bool
    change_count: int = 0
    data: Optional[TableResponse] = None
    message: Optional[str] = None