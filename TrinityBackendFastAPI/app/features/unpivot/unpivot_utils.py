from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import HTTPException

from app.DataStorageRetrieval.arrow_client import download_dataframe
from app.features.data_upload_validate.app.routes import get_object_prefix

logger = logging.getLogger(__name__)


async def resolve_object_path(data_source: str) -> str:
    """Resolve dataset path to full MinIO path."""
    path = (data_source or "").strip()
    if not path:
        raise HTTPException(status_code=400, detail="data_source is required")

    # Remove minio:// prefix if present
    if path.startswith("minio://"):
        path = path[8:]

    # Ensure .arrow extension if not present
    if not path.lower().endswith((".arrow", ".parquet", ".csv")):
        path = f"{path}.arrow"

    prefix = await get_object_prefix()
    if isinstance(prefix, tuple):
        prefix = prefix[0]

    if path.startswith(prefix):
        return path

    # Allow absolute style paths
    if path.startswith("/"):
        path = path.lstrip("/")

    if prefix.endswith("/") and path.startswith(prefix):
        return path

    full_path = f"{prefix}{path}"
    logger.debug("Unpivot resolved data source %s -> %s", data_source, full_path)
    return full_path


def ensure_column_mapping(columns: List[str]) -> Dict[str, str]:
    """Create case-insensitive column name mapping."""
    return {col.lower(): col for col in columns}


def resolve_columns(df: pd.DataFrame, requested: List[str]) -> List[str]:
    """Resolve column names (case-insensitive) to actual column names."""
    if not requested:
        return []
    
    mapping = ensure_column_mapping(df.columns)
    resolved: List[str] = []
    
    for raw in requested:
        if not raw:
            continue
        col = mapping.get(raw.lower()) or (raw if raw in df.columns else None)
        if not col:
            raise HTTPException(
                status_code=404,
                detail=f"Column '{raw}' not found in dataset. Available columns: {', '.join(df.columns)}",
            )
        resolved.append(col)
    
    return resolved


def apply_filters(df: pd.DataFrame, filters: List[Dict[str, Any]]) -> pd.DataFrame:
    """Apply filters to dataframe."""
    if not filters:
        return df

    result = df.copy()
    mapping = ensure_column_mapping(result.columns)

    for entry in filters:
        field = entry.get("field")
        if not field:
            continue
        
        include_values = entry.get("include")
        exclude_values = entry.get("exclude")

        resolved = mapping.get(field.lower()) or (field if field in result.columns else None)
        if not resolved:
            raise HTTPException(status_code=404, detail=f"Filter column '{field}' not found")

        as_text = result[resolved].astype(str)
        if include_values:
            include_set = {str(v) for v in include_values}
            result = result[as_text.isin(include_set)]
        if exclude_values:
            exclude_set = {str(v) for v in exclude_values}
            result = result[~as_text.isin(exclude_set)]

    return result


def convert_numpy(value: Any) -> Any:
    """Convert numpy types to native Python types for JSON serialization."""
    if isinstance(value, dict):
        return {k: convert_numpy(v) for k, v in value.items()}
    if isinstance(value, list):
        return [convert_numpy(v) for v in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating,)):
        return float(value)
    if isinstance(value, (pd.Timestamp,)):
        return value.isoformat()
    if pd.isna(value):
        return None
    return value


def validate_unpivot_config(
    df: pd.DataFrame,
    id_vars: List[str],
    value_vars: List[str],
) -> tuple[bool, List[str], List[str]]:
    """Validate unpivot configuration.
    
    Returns:
        (is_valid, errors, warnings)
    """
    errors: List[str] = []
    warnings: List[str] = []
    
    all_columns = set(df.columns)
    
    # Check id_vars exist
    for col in id_vars:
        if col not in all_columns:
            errors.append(f"id_var '{col}' not found in dataset")
    
    # Check value_vars exist
    for col in value_vars:
        if col not in all_columns:
            errors.append(f"value_var '{col}' not found in dataset")
    
    # Check for overlap
    id_set = set(id_vars)
    value_set = set(value_vars)
    overlap = id_set & value_set
    if overlap:
        errors.append(f"Columns cannot be in both id_vars and value_vars: {overlap}")
    
    # Check if both are empty
    if not id_vars and not value_vars:
        errors.append("At least one of id_vars or value_vars must be specified")
    
    # Check if all columns are specified
    if id_vars and value_vars:
        specified = id_set | value_set
        unspecified = all_columns - specified
        if unspecified:
            warnings.append(f"Unspecified columns will be dropped: {unspecified}")
    
    is_valid = len(errors) == 0
    return is_valid, errors, warnings


def get_dataset_schema_info(df: pd.DataFrame) -> Dict[str, Any]:
    """Extract schema information from dataframe."""
    columns = df.columns.tolist()
    dtypes = {col: str(df[col].dtype) for col in columns}
    null_stats = {col: int(df[col].isna().sum()) for col in columns}
    row_count = len(df)
    
    # Suggest id_vars (typically non-numeric or categorical columns)
    id_vars_candidates = []
    value_vars_candidates = []
    
    for col in columns:
        dtype = df[col].dtype
        # Suggest numeric columns as value_vars
        if pd.api.types.is_numeric_dtype(dtype):
            value_vars_candidates.append(col)
        else:
            # Suggest non-numeric as id_vars
            id_vars_candidates.append(col)
    
    return {
        "columns": columns,
        "dtypes": dtypes,
        "null_stats": null_stats,
        "row_count": row_count,
        "id_vars_candidates": id_vars_candidates,
        "value_vars_candidates": value_vars_candidates,
    }

