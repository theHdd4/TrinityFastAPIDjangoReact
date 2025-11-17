"""Service helpers for the scope selector atom.

These functions mirror the structure used by other atoms (for example the
dataframe operations feature) so they can be executed locally or on Celery
workers without any FastAPI specific context.
"""

from __future__ import annotations

import logging
from functools import lru_cache
from io import BytesIO
from typing import Any, Dict, Iterable

import pandas as pd
from minio import Minio
from minio.error import S3Error

from .config import get_settings
from .schemas import ScopeFilterRequest


logger = logging.getLogger("app.features.scope_selector.service")
settings = get_settings()


@lru_cache(maxsize=1)
def _get_minio_client() -> Minio:
    """Return a cached MinIO client using the configured credentials."""

    logger.debug("Initialising MinIO client for scope selector service")
    return Minio(
        endpoint=settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_use_ssl,
        region=settings.minio_region,
    )


def _read_minio_object(object_name: str) -> bytes:
    """Fetch an object from MinIO and return its raw bytes."""

    client = _get_minio_client()
    try:
        response = client.get_object(settings.minio_bucket, object_name)
    except S3Error as exc:  # pragma: no cover - depends on MinIO responses
        raise ValueError(f"Error accessing MinIO object '{object_name}': {exc}") from exc

    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def _load_dataframe(object_name: str) -> pd.DataFrame:
    """Load a pandas DataFrame from MinIO using the file extension for parsing."""

    payload = _read_minio_object(object_name)
    object_name_lower = object_name.lower()

    try:
        if object_name_lower.endswith(".parquet"):
            return pd.read_parquet(BytesIO(payload))
        if object_name_lower.endswith((".arrow", ".feather")):
            import pyarrow as pa  # type: ignore
            import pyarrow.ipc as ipc  # type: ignore

            reader = ipc.RecordBatchFileReader(pa.BufferReader(payload))
            return reader.read_all().to_pandas()
        if object_name_lower.endswith(".csv"):
            return pd.read_csv(BytesIO(payload))
        if object_name_lower.endswith(".json"):
            return pd.read_json(BytesIO(payload))

        # Fallback – try parquet first then feather/arrow
        try:
            return pd.read_parquet(BytesIO(payload))
        except Exception:  # pragma: no cover - fallback behaviour
            return pd.read_feather(BytesIO(payload))
    except Exception as exc:  # pragma: no cover - relies on pandas backends
        raise ValueError(f"Unable to load dataset '{object_name}': {exc}") from exc


def create_column_mapping(columns: Iterable[str]) -> Dict[str, str]:
    """Create a case-insensitive mapping of column names."""

    mapping: Dict[str, str] = {}
    for column in columns:
        mapping[str(column).lower()] = str(column)
    return mapping


def _resolve_column(df: pd.DataFrame, column_name: str) -> str:
    mapping = create_column_mapping(df.columns)
    actual = mapping.get(column_name.lower())
    if not actual:
        raise ValueError(
            f"Column '{column_name}' not found in dataset. Available columns: {', '.join(df.columns)}"
        )
    return actual


def _apply_identifier_filters(
    df: pd.DataFrame, identifier_filters: Dict[str, Iterable[Any]] | None
) -> pd.DataFrame:
    if not identifier_filters:
        return df

    mapping = create_column_mapping(df.columns)
    filtered_df = df
    for column, values in identifier_filters.items():
        actual = mapping.get(column.lower())
        if not actual:
            raise ValueError(f"Column '{column}' not found in dataset")
        str_values = [str(value) for value in values]
        filtered_df = filtered_df[filtered_df[actual].astype(str).isin(str_values)]
    return filtered_df


def _apply_date_filters(
    df: pd.DataFrame, start_date: str | None, end_date: str | None
) -> pd.DataFrame:
    if not start_date and not end_date:
        return df

    date_columns = [col for col in df.columns if "date" in str(col).lower()]
    if not date_columns:
        return df

    date_col = date_columns[0]
    working = df.copy()
    working[date_col] = pd.to_datetime(working[date_col], errors="coerce")
    if start_date:
        working = working[working[date_col] >= pd.to_datetime(start_date)]
    if end_date:
        working = working[working[date_col] <= pd.to_datetime(end_date)]
    return working


def fetch_unique_values(object_name: str, column_name: str) -> Dict[str, Any]:
    df = _load_dataframe(object_name)
    actual_column = _resolve_column(df, column_name)

    unique_values = (
        df[actual_column].dropna().astype(str).unique().tolist()
        if actual_column in df
        else []
    )
    unique_values.sort()
    return {"unique_values": unique_values}


def fetch_unique_values_filtered(
    object_name: str, target_column: str, filter_column: str, filter_value: str
) -> Dict[str, Any]:
    df = _load_dataframe(object_name)
    target_actual = _resolve_column(df, target_column)
    filter_actual = _resolve_column(df, filter_column)

    filtered_df = df[df[filter_actual].astype(str) == str(filter_value)]
    unique_values = filtered_df[target_actual].dropna().astype(str).unique().tolist()
    unique_values.sort()
    return {"unique_values": unique_values}


def compute_date_range(object_name: str, column_name: str) -> Dict[str, Any]:
    df = _load_dataframe(object_name)
    actual_column = _resolve_column(df, column_name)

    date_series = pd.to_datetime(df[actual_column], errors="coerce").dropna()
    if date_series.empty:
        raise ValueError(f"No valid dates found in column '{actual_column}'")

    return {
        "min_date": date_series.min().date().isoformat(),
        "max_date": date_series.max().date().isoformat(),
    }


def _prepare_scope_filter_request(payload: Dict[str, Any]) -> ScopeFilterRequest:
    try:
        return ScopeFilterRequest(**payload)
    except Exception as exc:
        raise ValueError(f"Invalid filter payload: {exc}") from exc


def preview_row_count(payload: Dict[str, Any]) -> Dict[str, Any]:
    request = _prepare_scope_filter_request(payload)
    df = _load_dataframe(request.file_key)
    df = _apply_identifier_filters(df, request.identifier_filters)
    df = _apply_date_filters(df, request.start_date, request.end_date)
    return {"record_count": int(len(df))}


def evaluate_percentile(
    payload: Dict[str, Any], percentile: int, threshold_pct: float, base: str, column: str
) -> Dict[str, Any]:
    request = _prepare_scope_filter_request(payload)
    df = _load_dataframe(request.file_key)
    df = _apply_identifier_filters(df, request.identifier_filters)
    df = _apply_date_filters(df, request.start_date, request.end_date)

    if df.empty:
        return {"pass": False, "detail": "No rows after filtering"}

    numeric_column = _resolve_column(df, column)
    series = pd.to_numeric(df[numeric_column], errors="coerce").dropna()

    if series.empty:
        return {"pass": False, "detail": "No numeric data in column after filtering"}

    percentile_value = series.quantile(percentile / 100)
    if base == "max":
        base_value = series.max()
    elif base == "min":
        base_value = series.min()
    elif base == "mean":
        base_value = series.mean()
    else:  # dist
        base_value = series.max() - series.min()

    target_value = (threshold_pct / 100) * base_value
    passed = percentile_value >= target_value

    return {
        "pass": bool(passed),
        "pct_value": percentile_value,
        "base_value": base_value,
        "target_value": target_value,
    }


__all__ = [
    "fetch_unique_values",
    "fetch_unique_values_filtered",
    "compute_date_range",
    "preview_row_count",
    "evaluate_percentile",
    "create_column_mapping",
]

