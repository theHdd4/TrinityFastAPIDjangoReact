from pydantic import BaseModel, Field
from typing import List, Literal, Optional, Union
from datetime import datetime


# ─── Filter Schemas ──────────────────────────────────────────────────────
class IdentifierFilter(BaseModel):
    """Filter for identifier columns with specific values"""
    column: str
    values: List[str]  # List of values to filter by
    
class MeasureFilter(BaseModel):
    """Filter for measure columns with numeric comparisons"""
    column: str
    operator: Literal["eq", "gt", "lt", "gte", "lte", "between"]
    value: Optional[Union[float, int]] = None
    min_value: Optional[Union[float, int]] = None  # For between operator
    max_value: Optional[Union[float, int]] = None  # For between operator


# ─── Basic Request Schemas ───────────────────────────────────────────────
class FilterPayload(BaseModel):
    """Request payload for filtering data"""
    file_path: str
    identifier_columns: Optional[List[str]] = None
    measure_columns: Optional[List[str]] = None
    identifier_filters: Optional[List[IdentifierFilter]] = None
    measure_filters: Optional[List[MeasureFilter]] = None
    limit: int = 1000


# ─── Combined Filter and Correlate Request ─────────────────────────────────
class FilterAndCorrelateRequest(BaseModel):
    """Combined request for filtering and correlation in one operation"""
    file_path: str
    
    # Column selection
    identifier_columns: Optional[List[str]] = Field(None, description="Identifier columns to include")
    measure_columns: Optional[List[str]] = Field(None, description="Measure columns to include")
    
    # Filtering
    identifier_filters: Optional[List[IdentifierFilter]] = Field(None, description="Filter by identifier values")
    measure_filters: Optional[List[MeasureFilter]] = Field(None, description="Filter by measure ranges")
    
    # Correlation parameters
    method: Literal["pearson", "spearman", "phi_coefficient", "cramers_v"] = Field(..., description="Correlation method")
    columns: Optional[List[str]] = Field(None, description="Specific columns for phi/cramers_v (must be exactly 2)")
    
    # Options
    save_filtered: bool = Field(True, description="Save filtered data separately")
    include_preview: bool = Field(True, description="Include data preview in response")
    preview_limit: int = Field(10, description="Number of rows to preview")
    
    # Date analysis options
    include_date_analysis: bool = Field(False, description="Include date column analysis")
    date_column: Optional[str] = Field(None, description="Specific date column to use for filtering")
    date_range_filter: Optional[dict] = Field(None, description="Date range filter {'start': 'YYYY-MM-DD', 'end': 'YYYY-MM-DD'}")


# ─── Response Schemas ────────────────────────────────────────────────────
class BucketCheckResponse(BaseModel):
    """Response for bucket/file existence check"""
    exists: bool
    bucket_name: str
    object_path: str
    message: str


class FilterAndCorrelateResponse(BaseModel):
    """Response from combined filter and correlate operation"""
    # Data info
    original_rows: int
    filtered_rows: int
    columns_used: List[str]
    
    # Filter info
    filters_applied: dict
    filtered_file_path: Optional[str] = None
    
    # Correlation results
    correlation_method: str
    correlation_results: dict  # Results vary by method
    correlation_file_path: str
    
    # Preview (optional)
    preview_data: Optional[List[dict]] = None
    
    # Date analysis (optional)
    date_analysis: Optional["DateAnalysisResponse"] = None
    date_filtered_rows: Optional[int] = None
    
    # Metadata
    timestamp: datetime
    processing_time_ms: float


# ─── Additional Response Schemas (Optional) ──────────────────────────────
class ColumnInfo(BaseModel):
    """Information about a column in the dataset"""
    column: str
    dtype: str
    unique_count: int
    null_count: int
    sample_values: List[Union[str, int, float]]


class DataPreviewResponse(BaseModel):
    """Response for data preview endpoint"""
    file_path: str
    shape: tuple
    columns: List[ColumnInfo]
    preview: List[dict]


class ColumnValuesResponse(BaseModel):
    """Response for unique column values endpoint"""
    file_path: str
    column: str
    unique_values: List[Union[str, int, float]]
    count: int


class BucketListResponse(BaseModel):
    """Response for bucket listing"""
    buckets: List[dict]


class ObjectListResponse(BaseModel):
    """Response for object listing in a bucket"""
    bucket: str
    prefix: str
    count: int
    objects: List[dict]


# ─── Date Analysis Schemas ───────────────────────────────────────────────
class DateColumnInfo(BaseModel):
    """Information about a single date column"""
    column_name: str
    min_date: Optional[str] = None
    max_date: Optional[str] = None
    format_detected: str
    granularity: str  # "daily", "monthly", "yearly", "irregular"
    sample_values: List[str]
    is_valid_date: bool


class DateAnalysisResponse(BaseModel):
    """Response from date analysis endpoint"""
    has_date_data: bool
    date_columns: List[DateColumnInfo]
    overall_date_range: Optional[dict] = None  # {"min_date": str, "max_date": str}
    recommended_granularity: str
    date_format_detected: str
