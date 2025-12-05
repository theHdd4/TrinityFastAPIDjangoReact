"""
Pydantic schemas for Table atom API requests and responses.
"""
from pydantic import BaseModel
from typing import List, Dict, Any, Optional


class TableLoadRequest(BaseModel):
    """Request to load a table from MinIO"""
    object_name: str


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


class TableSaveRequest(BaseModel):
    """Request to save table data to MinIO"""
    table_id: str
    filename: Optional[str] = None
    overwrite_original: bool = False


class TableResponse(BaseModel):
    """Response containing table data"""
    table_id: str
    columns: List[str]
    rows: List[Dict[str, Any]]
    row_count: int
    column_types: Dict[str, str]
    object_name: Optional[str] = None
    settings: Optional[TableSettings] = None


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



