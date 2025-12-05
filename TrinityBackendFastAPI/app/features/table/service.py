"""
Service layer for Table atom - handles business logic and data processing.
"""
import polars as pl
import io
import os
import uuid
import logging
from typing import Dict, Optional, List, Any
from minio import Minio
from minio.error import S3Error

from app.DataStorageRetrieval.arrow_client import download_table_bytes

logger = logging.getLogger(__name__)

# In-memory session storage for active DataFrames
SESSIONS: Dict[str, pl.DataFrame] = {}

# MinIO client configuration
MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "admin_dev")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "pass_dev")
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "trinity")

minio_client = Minio(
    MINIO_ENDPOINT,
    access_key=MINIO_ACCESS_KEY,
    secret_key=MINIO_SECRET_KEY,
    secure=False
)


def load_table_from_minio(object_name: str) -> pl.DataFrame:
    """
    Load a DataFrame from MinIO using Arrow format.
    
    Args:
        object_name: Full path to the object in MinIO
        
    Returns:
        Polars DataFrame
        
    Raises:
        Exception: If file cannot be loaded
    """
    logger.info(f"🔍 [TABLE] Loading table from MinIO: {object_name}")
    
    try:
        # Download Arrow file from MinIO
        data = download_table_bytes(object_name)
        logger.info(f"✅ [TABLE] Downloaded {len(data)} bytes")
        
        # Parse Arrow IPC format
        df = pl.read_ipc(io.BytesIO(data))
        logger.info(f"✅ [TABLE] Loaded DataFrame: {df.shape[0]} rows, {df.shape[1]} columns")
        logger.info(f"📋 [TABLE] Columns: {df.columns}")
        
        return df
        
    except Exception as e:
        logger.error(f"❌ [TABLE] Failed to load table: {e}")
        raise Exception(f"Failed to load table from {object_name}: {str(e)}")


def apply_table_settings(df: pl.DataFrame, settings: Dict[str, Any]) -> pl.DataFrame:
    """
    Apply table settings (filtering, sorting, column selection) to DataFrame.
    
    Args:
        df: Input DataFrame
        settings: Dictionary containing table settings
        
    Returns:
        Processed DataFrame
    """
    logger.info(f"🔧 [TABLE] Applying settings to DataFrame")
    
    # Apply filters
    filters = settings.get("filters", {})
    if filters:
        for column, filter_value in filters.items():
            if column in df.columns and filter_value:
                logger.info(f"🔍 [TABLE] Filtering {column} = {filter_value}")
                df = df.filter(pl.col(column) == filter_value)
    
    # Apply sorting
    sort_config = settings.get("sort_config", [])
    if sort_config:
        for sort_item in sort_config:
            column = sort_item.get("column")
            direction = sort_item.get("direction", "asc")
            if column in df.columns:
                logger.info(f"📊 [TABLE] Sorting by {column} ({direction})")
                descending = direction == "desc"
                df = df.sort(column, descending=descending)
    
    # Select visible columns
    visible_columns = settings.get("visible_columns")
    if visible_columns:
        # Ensure all visible columns exist
        valid_columns = [col for col in visible_columns if col in df.columns]
        if valid_columns:
            logger.info(f"👁️ [TABLE] Selecting visible columns: {valid_columns}")
            df = df.select(valid_columns)
    
    # Reorder columns if specified
    column_order = settings.get("column_order")
    if column_order:
        # Filter to only existing columns
        valid_order = [col for col in column_order if col in df.columns]
        if valid_order and len(valid_order) == len(df.columns):
            logger.info(f"🔄 [TABLE] Reordering columns")
            df = df.select(valid_order)
    
    logger.info(f"✅ [TABLE] Settings applied: {df.shape[0]} rows, {df.shape[1]} columns")
    return df


def save_table_to_minio(df: pl.DataFrame, object_name: str) -> str:
    """
    Save a DataFrame to MinIO in Arrow format.
    
    Args:
        df: DataFrame to save
        object_name: Full path where to save in MinIO
        
    Returns:
        Object name of saved file
        
    Raises:
        Exception: If save fails
    """
    logger.info(f"💾 [TABLE] Saving table to MinIO: {object_name}")
    logger.info(f"📊 [TABLE] DataFrame shape: {df.shape}")
    
    try:
        # Write DataFrame to Arrow format
        buffer = io.BytesIO()
        df.write_ipc(buffer)
        buffer.seek(0)
        
        arrow_bytes = buffer.getvalue()
        logger.info(f"📦 [TABLE] Arrow buffer size: {len(arrow_bytes)} bytes")
        
        # Upload to MinIO
        minio_client.put_object(
            bucket_name=MINIO_BUCKET,
            object_name=object_name,
            data=io.BytesIO(arrow_bytes),
            length=len(arrow_bytes),
            content_type="application/octet-stream"
        )
        
        logger.info(f"✅ [TABLE] Successfully saved to: {object_name}")
        return object_name
        
    except Exception as e:
        logger.error(f"❌ [TABLE] Failed to save table: {e}")
        raise Exception(f"Failed to save table to {object_name}: {str(e)}")


def get_column_types(df: pl.DataFrame) -> Dict[str, str]:
    """
    Get column data types as string representations.
    
    Args:
        df: Input DataFrame
        
    Returns:
        Dictionary mapping column names to type strings
    """
    column_types = {}
    for col in df.columns:
        dtype = df[col].dtype
        
        # Map Polars types to simple strings
        if dtype in [pl.Int8, pl.Int16, pl.Int32, pl.Int64, pl.UInt8, pl.UInt16, pl.UInt32, pl.UInt64]:
            column_types[col] = "integer"
        elif dtype in [pl.Float32, pl.Float64]:
            column_types[col] = "float"
        elif dtype == pl.Boolean:
            column_types[col] = "boolean"
        elif dtype == pl.Date:
            column_types[col] = "date"
        elif dtype == pl.Datetime:
            column_types[col] = "datetime"
        else:
            column_types[col] = "string"
    
    return column_types


def dataframe_to_response(df: pl.DataFrame, table_id: str, 
                         object_name: Optional[str] = None,
                         settings: Optional[Dict] = None) -> Dict[str, Any]:
    """
    Convert DataFrame to API response format.
    
    Args:
        df: DataFrame to convert
        table_id: Session ID for this table
        object_name: Optional MinIO object reference
        settings: Optional table settings
        
    Returns:
        Dictionary in TableResponse format
    """
    # Limit rows for initial response (pagination handled separately)
    preview_df = df.head(100)
    
    response = {
        "table_id": table_id,
        "columns": df.columns,
        "rows": preview_df.to_dicts(),
        "row_count": len(df),
        "column_types": get_column_types(df)
    }
    
    if object_name:
        response["object_name"] = object_name
    
    if settings:
        response["settings"] = settings
    
    return response


def compute_aggregations(df: pl.DataFrame, agg_config: Dict[str, List[str]]) -> Dict[str, Dict[str, Any]]:
    """
    Compute aggregations for specified columns.
    
    Args:
        df: Input DataFrame
        agg_config: Dictionary mapping column names to list of aggregation functions
                   e.g., {"Sales": ["sum", "avg", "min", "max"], "Count": ["sum"]}
        
    Returns:
        Dictionary with aggregation results
    """
    logger.info(f"📊 [TABLE] Computing aggregations: {agg_config}")
    
    results = {}
    
    for column, agg_functions in agg_config.items():
        if column not in df.columns:
            logger.warning(f"⚠️ [TABLE] Column {column} not found, skipping")
            continue
        
        col_results = {}
        series = df[column]
        
        for agg_func in agg_functions:
            try:
                if agg_func == "sum":
                    col_results["sum"] = float(series.sum()) if series.sum() is not None else None
                elif agg_func == "avg" or agg_func == "mean":
                    col_results["avg"] = float(series.mean()) if series.mean() is not None else None
                elif agg_func == "min":
                    col_results["min"] = float(series.min()) if series.min() is not None else None
                elif agg_func == "max":
                    col_results["max"] = float(series.max()) if series.max() is not None else None
                elif agg_func == "count":
                    col_results["count"] = int(series.count())
                elif agg_func == "median":
                    col_results["median"] = float(series.median()) if series.median() is not None else None
                elif agg_func == "std":
                    col_results["std"] = float(series.std()) if series.std() is not None else None
            except Exception as e:
                logger.warning(f"⚠️ [TABLE] Failed to compute {agg_func} for {column}: {e}")
                col_results[agg_func] = None
        
        results[column] = col_results
    
    logger.info(f"✅ [TABLE] Aggregations computed: {results}")
    return results



