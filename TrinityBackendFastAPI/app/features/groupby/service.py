from __future__ import annotations

import datetime as dt
import io
import logging
import os
import uuid
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping

import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.ipc as ipc
from minio import Minio
from minio.error import S3Error

from app.core.feature_cache import feature_cache
from app.features.column_classifier.database import get_classifier_config_from_mongo
from app.features.groupby_weighted_avg.groupby.base import perform_groupby as _perform_groupby
from app.features.groupby.year_utils import _ensure_year_identifier

logger = logging.getLogger("app.features.groupby.service")

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "minio:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "admin_dev")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "pass_dev")
MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() in {"1", "true", "yes", "on"}
MINIO_BUCKET = os.getenv("MINIO_BUCKET", "trinity")

_redis_client = feature_cache.router("groupby")
_minio_client: Minio | None = None


def _get_minio_client() -> Minio:
    global _minio_client
    if _minio_client is None:
        _minio_client = Minio(
            MINIO_ENDPOINT,
            access_key=MINIO_ACCESS_KEY,
            secret_key=MINIO_SECRET_KEY,
            secure=MINIO_SECURE,
        )
    return _minio_client


def _read_object(bucket_name: str, object_name: str) -> bytes:
    client = _get_minio_client()
    try:
        response = client.get_object(bucket_name, object_name)
    except S3Error as exc:  # pragma: no cover - depends on MinIO connectivity
        logger.exception("groupby.minio_get_failed bucket=%s object=%s", bucket_name, object_name)
        raise RuntimeError(f"Failed to fetch object '{object_name}' from bucket '{bucket_name}': {exc}")
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def _frame_from_bytes(object_name: str, payload: bytes) -> pd.DataFrame:
    if object_name.endswith(".csv"):
        return pd.read_csv(io.BytesIO(payload))
    if object_name.endswith((".xls", ".xlsx")):
        return pd.read_excel(io.BytesIO(payload))
    if object_name.endswith(".arrow"):
        reader = ipc.RecordBatchFileReader(pa.BufferReader(payload))
        table = reader.read_all()
        return table.to_pandas()
    raise ValueError(f"Unsupported file type for object '{object_name}'")


def load_dataframe(bucket_name: str, object_name: str) -> pd.DataFrame:
    payload = _read_object(bucket_name, object_name)
    frame = _frame_from_bytes(object_name, payload)
    return clean_columns(frame)


def clean_columns(frame: pd.DataFrame) -> pd.DataFrame:
    renamed = frame.copy()
    renamed.columns = [str(col).strip().lower() for col in renamed.columns]
    return renamed


def ensure_prefixed_object(object_name: str, prefix: str) -> str:
    if not prefix:
        return object_name
    if object_name.startswith(prefix):
        return object_name
    if not prefix.endswith("/"):
        prefix = f"{prefix}/"
    return f"{prefix}{object_name}"


def _serialise_scalar(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (pd.Timestamp, dt.datetime, dt.date)):
        return pd.to_datetime(value).isoformat()
    if isinstance(value, (np.integer, np.floating)):
        if pd.isna(value):
            return None
        return value.item()
    if isinstance(value, np.bool_):
        return bool(value)
    if isinstance(value, float) and (np.isnan(value) or np.isinf(value)):
        return None
    return value


def _serialise_records(frame: pd.DataFrame) -> List[Dict[str, Any]]:
    records = frame.to_dict(orient="records")
    serialised: List[Dict[str, Any]] = []
    for record in records:
        converted: Dict[str, Any] = {}
        for key, value in record.items():
            if isinstance(value, Mapping):
                converted[key] = {
                    inner_key: _serialise_scalar(inner_value)
                    for inner_key, inner_value in value.items()
                }
            elif isinstance(value, list):
                converted[key] = [_serialise_scalar(item) for item in value]
            else:
                converted[key] = _serialise_scalar(value)
        serialised.append(converted)
    return serialised


def perform_groupby_task(
    *,
    bucket_name: str,
    source_object: str,
    result_filename: str,
    identifiers: Iterable[str],
    aggregations: MutableMapping[str, Any],
) -> Dict[str, Any]:
    logger.info(
        "groupby.perform_groupby bucket=%s source=%s result=%s identifiers=%s",
        bucket_name,
        source_object,
        result_filename,
        list(identifiers),
    )
    frame = load_dataframe(bucket_name, source_object)

    # 🔧 CRITICAL: Filter identifiers to only those that exist in the dataframe (case-insensitive)
    # Create a case-insensitive mapping of column names
    column_lower_map = {str(col).lower(): str(col) for col in frame.columns}
    
    # Normalize identifiers to lowercase and filter to only existing columns
    normalized_identifiers_list = []
    for ident in identifiers:
        if not isinstance(ident, str):
            continue
        ident_lower = ident.strip().lower()
        if ident_lower and ident_lower in column_lower_map:
            # Use the actual column name from the dataframe (preserves original case)
            normalized_identifiers_list.append(column_lower_map[ident_lower])
        else:
            logger.warning(
                f"⚠️ Identifier '{ident}' not found in dataframe columns. Available columns: {list(frame.columns)}"
            )
    
    if not normalized_identifiers_list:
        available_cols = list(frame.columns)
        return {
            "status": "FAILED",
            "success": False,
            "message": f"None of the requested identifiers {list(identifiers)} exist in the dataframe. Available columns: {available_cols}",
            "result_file": None,
            "row_count": 0,
            "columns": available_cols,
        }

    try:
        frame, normalized_identifiers, derived_from = _ensure_year_identifier(
            frame, normalized_identifiers_list
        )
        if derived_from:
            logger.info(
                "✅ Added synthetic 'year' column from %s to satisfy groupby identifiers",
                derived_from,
            )
    except ValueError as exc:  # Surface guidance instead of crashing
        message = str(exc)
        logger.warning("⚠️ %s", message)
        return {
            "status": "FAILED",
            "success": False,
            "message": message,
            "result_file": None,
            "row_count": 0,
            "columns": list(frame.columns),
        }

    grouped = _perform_groupby(frame, list(normalized_identifiers), dict(aggregations))
    grouped = grouped.reset_index(drop=True)

    csv_bytes = grouped.to_csv(index=False).encode("utf-8")
    client = _get_minio_client()
    client.put_object(
        bucket_name=bucket_name,
        object_name=result_filename,
        data=io.BytesIO(csv_bytes),
        length=len(csv_bytes),
        content_type="text/csv",
    )

    return {
        "status": "SUCCESS",
        "success": True,
        "message": "GroupBy complete",
        "result_file": result_filename,
        "row_count": int(grouped.shape[0]),
        "columns": list(grouped.columns),
        "results": _serialise_records(grouped),
    }


def load_cached_dataframe_page(
    *,
    object_name: str,
    page: int,
    page_size: int,
    bucket_name: str = MINIO_BUCKET,
) -> Dict[str, Any]:
    logger.info(
        "groupby.cached_dataframe object=%s page=%s page_size=%s",
        object_name,
        page,
        page_size,
    )
    if page < 1:
        raise ValueError("page must be >= 1")
    if page_size < 1:
        raise ValueError("page_size must be >= 1")

    cached = _redis_client.get(object_name)
    if cached is None:
        payload = _read_object(bucket_name, object_name)
        _redis_client.setex(object_name, 3600, payload)
    else:
        payload = cached

    if object_name.endswith(".arrow"):
        reader = ipc.RecordBatchFileReader(pa.BufferReader(payload))
        table = reader.read_all()
        frame = table.to_pandas()
    else:
        frame = pd.read_csv(io.BytesIO(payload))

    total_rows = len(frame)
    start_idx = (page - 1) * page_size
    end_idx = min(start_idx + page_size, total_rows)
    page_frame = frame.iloc[start_idx:end_idx]

    csv_data = page_frame.to_csv(index=False)
    return {
        "data": csv_data,
        "pagination": {
            "current_page": page,
            "page_size": page_size,
            "total_rows": total_rows,
            "total_pages": (total_rows + page_size - 1) // page_size,
            "start_row": start_idx + 1 if total_rows else 0,
            "end_row": end_idx,
        },
    }


def compute_cardinality_task(
    *,
    object_name: str,
    bucket_name: str = MINIO_BUCKET,
) -> Dict[str, Any]:
    logger.info("groupby.cardinality object=%s", object_name)
    frame = load_dataframe(bucket_name, object_name)
    cardinality: List[Dict[str, Any]] = []
    for column in frame.columns:
        series = frame[column].dropna()
        try:
            unique_values = series.unique()
        except TypeError:
            unique_values = series.astype(str).unique()

        cardinality.append(
            {
                "column": column,
                "data_type": str(frame[column].dtype),
                "unique_count": int(len(unique_values)),
                "unique_values": [_serialise_scalar(value) for value in unique_values],
            }
        )
    return {"status": "SUCCESS", "cardinality": cardinality}


def _detect_datetime_columns(frame: pd.DataFrame) -> List[str]:
    candidates: List[str] = []
    for column in frame.columns:
        series = frame[column]
        if pd.api.types.is_numeric_dtype(series):
            continue
        sample = series.dropna().head(100)
        if sample.empty:
            continue
        parsed = pd.to_datetime(sample, errors="coerce")
        success_rate = parsed.notna().sum() / len(sample)
        if success_rate >= 0.8:
            candidates.append(column)
    return candidates


def save_groupby_dataframe_task(
    *,
    csv_data: str,
    filename: str | None,
    object_prefix: str,
    bucket_name: str = MINIO_BUCKET,
) -> Dict[str, Any]:
    logger.info("groupby.save filename=%s prefix=%s", filename, object_prefix)
    preview = pd.read_csv(io.StringIO(csv_data), nrows=10000)
    datetime_columns = _detect_datetime_columns(preview)

    frame = pd.read_csv(
        io.StringIO(csv_data),
        parse_dates=datetime_columns,
        infer_datetime_format=True,
        low_memory=False,
        na_values=["", "None", "null", "NULL", "nan", "NaN", "NA", "N/A"],
    )
    for column in datetime_columns:
        if column in frame.columns and frame[column].dtype == "object":
            frame[column] = pd.to_datetime(frame[column], errors="coerce")

    if not filename:
        filename = f"groupby_{uuid.uuid4().hex[:8]}.arrow"
    if not filename.endswith(".arrow"):
        filename = f"{filename}.arrow"

    prefix = object_prefix.rstrip("/")
    object_name = f"{prefix}/groupby/{filename}" if prefix else f"groupby/{filename}"

    table = pa.Table.from_pandas(frame)
    buffer = pa.BufferOutputStream()
    with ipc.new_file(buffer, table.schema) as writer:
        writer.write_table(table)
    payload = buffer.getvalue().to_pybytes()

    client = _get_minio_client()
    client.put_object(
        bucket_name=bucket_name,
        object_name=object_name,
        data=io.BytesIO(payload),
        length=len(payload),
        content_type="application/octet-stream",
    )
    _redis_client.setex(object_name, 3600, payload)

    return {
        "status": "SUCCESS",
        "message": "DataFrame saved successfully",
        "filename": object_name,
        "size_bytes": len(payload),
    }


def initialize_groupby(
    *,
    bucket_name: str,
    object_name: str,
    client_name: str,
    app_name: str,
    project_name: str,
    file_key: str,
) -> Dict[str, Any]:
    frame = load_dataframe(bucket_name, object_name)
    identifiers: List[str] = []
    measures: List[str] = []

    try:
        cfg = get_classifier_config_from_mongo(client_name, app_name, project_name, file_key)
        if cfg:
            identifiers = [col for col in cfg.get("identifiers", []) if isinstance(col, str)]
            measures = [col for col in cfg.get("measures", []) if isinstance(col, str)]
    except Exception:  # pragma: no cover - defensive logging
        logger.exception("groupby.initialize classifier lookup failed")

    if not identifiers and not measures:
        numeric_columns = frame.select_dtypes(include=["number"]).columns.tolist()
        non_numeric = frame.select_dtypes(exclude=["number"]).columns.tolist()
        measures = numeric_columns
        identifiers = non_numeric

    numeric_measures = frame.select_dtypes(include="number").columns.tolist()
    time_column = "date" if "date" in frame.columns else None

    return {
        "status": "SUCCESS",
        "dimensions_from_db": {},
        "identifiers": identifiers,
        "measures": measures,
        "numeric_measures": numeric_measures,
        "time_column_used": time_column,
    }


def build_result_filename(validator_atom_id: str, file_key: str) -> str:
    safe_file_key = file_key.replace("/", "_")
    return f"{validator_atom_id}_{safe_file_key}_grouped.csv"


__all__ = [
    "MINIO_BUCKET",
    "build_result_filename",
    "clean_columns",
    "compute_cardinality_task",
    "ensure_prefixed_object",
    "initialize_groupby",
    "load_cached_dataframe_page",
    "load_dataframe",
    "perform_groupby_task",
    "save_groupby_dataframe_task",
]
