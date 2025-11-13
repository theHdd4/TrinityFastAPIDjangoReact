from __future__ import annotations

import base64
import io
import logging
import os
import uuid
from typing import Any, Dict, List, Tuple

import pandas as pd
import polars as pl

UPLOAD_DIR = "./uploaded_dataframes"
os.makedirs(UPLOAD_DIR, exist_ok=True)

logger = logging.getLogger("app.features.dataframe_operations.service")

SESSIONS: Dict[str, pl.DataFrame] = {}


def save_upload_file_tmp(upload_file) -> Tuple[str, str]:
    ext = os.path.splitext(upload_file.filename)[-1]
    file_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}{ext}")
    with open(file_path, "wb") as buffer:
        buffer.write(upload_file.file.read())
    return file_id, file_path


def parse_dataframe(file_path: str) -> Tuple[List[str], List[Dict[str, Any]], Dict[str, str]]:
    if file_path.endswith(".csv"):
        df = pd.read_csv(file_path)
    elif file_path.endswith(".xlsx"):
        df = pd.read_excel(file_path)
    else:
        raise ValueError("Unsupported file type")
    headers = list(df.columns)
    rows = df.to_dict(orient="records")
    column_types = {col: ("number" if pd.api.types.is_numeric_dtype(df[col]) else "text") for col in headers}
    return headers, rows, column_types


def save_dataframe(file_id: str, headers: List[str], rows: List[Dict[str, Any]], file_format: str = "csv") -> str:
    df = pd.DataFrame(rows, columns=headers)
    ext = ".csv" if file_format == "csv" else ".xlsx"
    file_path = os.path.join(UPLOAD_DIR, f"{file_id}{ext}")
    if file_format == "csv":
        df.to_csv(file_path, index=False)
    else:
        df.to_excel(file_path, index=False)
    return file_path


def get_session_dataframe(df_id: str) -> pl.DataFrame:
    try:
        return SESSIONS[df_id]
    except KeyError as exc:  # pragma: no cover - defensive programming
        raise KeyError("DataFrame not found") from exc


def dataframe_payload(df: pl.DataFrame, df_id: str) -> Dict[str, Any]:
    return {
        "df_id": df_id,
        "headers": df.columns,
        "rows": df.to_dicts(),
        "types": {col: str(dtype) for col, dtype in zip(df.columns, df.dtypes)},
        "row_count": df.height,
        "column_count": df.width,
    }


def load_dataframe_from_base64(content_b64: str, *, filename: str | None = None) -> Dict[str, Any]:
    """Create a new session-backed dataframe from an uploaded file payload."""

    try:
        content = base64.b64decode(content_b64)
        df = pl.read_csv(io.BytesIO(content))
    except Exception as exc:  # pragma: no cover - relies on Polars
        logger.exception("Failed to parse uploaded dataframe")
        raise ValueError("Failed to parse uploaded file") from exc

    df_id = str(uuid.uuid4())
    SESSIONS[df_id] = df
    payload = dataframe_payload(df, df_id)
    if filename:
        payload["source_filename"] = filename
    logger.info("dataframe.load success df_id=%s rows=%s cols=%s", df_id, df.height, df.width)
    return payload


def filter_dataframe(df_id: str, column: str, value: Any) -> Dict[str, Any]:
    df = get_session_dataframe(df_id)
    filter_logger = logging.getLogger("dataframe_operations.filter")
    filter_logger.info(
        "🔵 [FILTER] Starting filter operation - df_id: %s, column: %s, value: %s",
        df_id,
        column,
        value,
    )

    filter_logger.info(
        "📊 [FILTER] Before filter - Shape: %s, Dtypes: %s",
        df.shape,
        dict(zip(df.columns, df.dtypes)),
    )

    try:
        if isinstance(value, dict):
            min_v = value.get("min")
            max_v = value.get("max")
            filter_logger.info("🔍 [FILTER] Range filter: %s <= %s <= %s", min_v, column, max_v)
            df = df.filter(pl.col(column).is_between(min_v, max_v))
        elif isinstance(value, list):
            filter_logger.info("🔍 [FILTER] List filter: %s in %s", column, value)
            df = df.filter(pl.col(column).is_in(value))
        else:
            filter_logger.info("🔍 [FILTER] Equality filter: %s == %s", column, value)
            df = df.filter(pl.col(column) == value)
    except Exception as exc:
        filter_logger.error("❌ [FILTER] Filter operation failed: %s", exc)
        filter_logger.error("❌ [FILTER] Error type: %s", type(exc))
        raise ValueError(str(exc))

    filter_logger.info(
        "📊 [FILTER] After filter - Shape: %s, Dtypes: %s",
        df.shape,
        dict(zip(df.columns, df.dtypes)),
    )
    filter_logger.info("✅ [FILTER] Filter operation successful")

    SESSIONS[df_id] = df
    return dataframe_payload(df, df_id)


def sort_dataframe(df_id: str, column: str, direction: str = "asc") -> Dict[str, Any]:
    df = get_session_dataframe(df_id)
    try:
        descending = str(direction).lower() not in {"asc", "ascending"}
        df = df.sort(column, descending=descending)
    except Exception as exc:  # pragma: no cover - relies on Polars sorting
        logger.exception("Failed to sort dataframe")
        raise ValueError(str(exc))

    SESSIONS[df_id] = df
    return dataframe_payload(df, df_id)


__all__ = [
    "SESSIONS",
    "save_upload_file_tmp",
    "parse_dataframe",
    "save_dataframe",
    "get_session_dataframe",
    "dataframe_payload",
    "load_dataframe_from_base64",
    "filter_dataframe",
    "sort_dataframe",
]
