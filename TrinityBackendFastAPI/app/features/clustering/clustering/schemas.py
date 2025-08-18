from pydantic import BaseModel, Field
from typing import List, Literal, Optional, Union, Tuple, Iterable
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

class DateRange(BaseModel):
    """Filter for date columns with date range"""
    column: str
    from_date: str  # Changed from datetime to str for easier frontend integration
    to_date: str    # Changed from datetime to str for easier frontend integration

# ─── Basic Request Schemas ───────────────────────────────────────────────
class FilterPayload(BaseModel):
    """Request payload for filtering data"""
    file_path: str
    identifier_columns: Optional[List[str]] = None
    measure_columns: Optional[List[str]] = None
    identifier_filters: Optional[List[IdentifierFilter]] = None
    measure_filters: Optional[List[MeasureFilter]] = None
    limit: int = 1000

class ClusteringRequest(BaseModel):
    """Request payload for clustering operations"""
    file_path: str
    algorithm: Literal["kmeans", "dbscan", "hac", "birch", "gmm"]
    n_clusters: Optional[int] = 3
    eps: Optional[float] = 0.5
    min_samples: Optional[int] = 5
    linkage: Optional[str] = "ward"
    threshold: Optional[float] = 0.5

# ─── Combined Filter and Cluster Request ─────────────────────────────────
class FilterAndClusterRequest(BaseModel):
    """Combined request for filtering and clustering in one operation"""
    file_path: str
    
    # Column selection
    identifier_columns: Optional[List[str]] = Field(None, description="Identifier columns to include")
    measure_columns: Optional[List[str]] = Field(None, description="Measure columns to include")
    
    # Filtering
    identifier_filters: Optional[List[IdentifierFilter]] = Field(None, description="Filter by identifier values")
    measure_filters: Optional[List[MeasureFilter]] = Field(None, description="Filter by measure ranges")
    date_range: Optional[DateRange] = Field(None, description="Filter by date range")
    
    # Clustering parameters
    algorithm: Literal["kmeans", "dbscan", "hac", "birch", "gmm"] = Field(..., description="Clustering algorithm")
    
    # K-selection method
    k_selection: Optional[Literal["manual", "elbow", "silhouette", "gap"]] = Field(
        "elbow", 
        description="Method for automatic K selection: manual, elbow, silhouette, or gap"
    )
    
    # Manual K (used when k_selection='manual')
    n_clusters: Optional[int] = Field(3, description="Number of clusters (used only with k_selection='manual')")
    
    # Auto-K selection parameters
    k_min: Optional[int] = Field(2, description="Minimum K for auto-selection (default: 2)")
    k_max: Optional[int] = Field(10, description="Maximum K for auto-selection (default: 10)")
    gap_b: Optional[int] = Field(10, description="Number of bootstrap samples for gap statistic (default: 10)")
    
    # Legacy support
    use_elbow: Optional[bool] = Field(False, description="Legacy flag for elbow method (maps to k_selection='elbow')")
    
    # Algorithm-specific parameters
    eps: Optional[float] = Field(0.5, description="Epsilon parameter for DBSCAN")
    min_samples: Optional[int] = Field(5, description="Minimum samples for DBSCAN")
    linkage: Optional[str] = Field("ward", description="Linkage type for HAC: ward, complete, average, single")
    threshold: Optional[float] = Field(0.5, description="Threshold for BIRCH clustering")
    covariance_type: Optional[str] = Field("full", description="Covariance type for GMM: full, tied, diag, spherical")
    
    # Performance and reproducibility
    random_state: Optional[int] = Field(0, description="Random state for reproducible results")
    n_init: Optional[int] = Field(10, description="Number of initializations for KMeans/GMM")
    
    # Options
    include_preview: bool = Field(True, description="Include data preview in response")
    preview_limit: int = Field(10, description="Number of rows to preview")

# ─── Response Schemas ────────────────────────────────────────────────────
class BucketCheckResponse(BaseModel):
    """Response for bucket/file existence check"""
    exists: bool
    bucket_name: str
    object_path: str
    message: str

class ClusterStats(BaseModel):
    """Statistics for a single cluster"""
    cluster_id: Union[int, str]
    size: int
    centroid: dict  # column -> centroid value
    min_values: dict  # column -> min value
    max_values: dict  # column -> max value
    column_names: Optional[List[str]] = None  # List of column names
    
class FilterAndClusterResponse(BaseModel):
    """Response from combined filter and cluster operation"""
    # Data info
    original_rows: int
    filtered_rows: int
    columns_used: List[str]
    
    # Filter info
    filters_applied: dict
    filtered_file_path: Optional[str] = None  # No automatic saving
    
    # Clustering results
    algorithm_used: str
    n_clusters_found: int
    cluster_sizes: dict  # cluster_id -> count
    cluster_stats: List[ClusterStats]  # Detailed statistics per cluster
    clustered_file_path: Optional[str] = None  # No automatic saving
    redis_key: Optional[str] = None  # Redis key for accessing clustered data
    
    # Output data with cluster IDs
    output_data: List[dict]  # Full dataframe with cluster_id column
    
    # Preview (optional)
    preview_data: Optional[List[dict]] = None
    
    # Metadata
    timestamp: datetime
    processing_time_ms: Optional[float] = None

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
