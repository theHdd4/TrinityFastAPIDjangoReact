"""Celery powered dataframe transformations."""
from __future__ import annotations

import io
import logging
from typing import Any, Dict, List, Optional

import pandas as pd

from app.celery_app import celery_app
from app.core.task_tracking import (
    record_task_failure,
    record_task_progress,
    record_task_started,
    record_task_success,
)

logger = logging.getLogger("app.features.dataframe_operations.tasks")


def _apply_operation(df: pd.DataFrame, operation: Dict[str, Any]) -> pd.DataFrame:
    op_type = operation.get("type")
    column = operation.get("column")
    if op_type == "filter_equals":
        return df[df[column] == operation.get("value")]
    if op_type == "filter_in":
        return df[df[column].isin(operation.get("values", []))]
    if op_type == "filter_range":
        lower = operation.get("min")
        upper = operation.get("max")
        return df[df[column].between(lower, upper)]
    if op_type == "sort":
        return df.sort_values(column, ascending=operation.get("direction", "asc") == "asc")
    raise ValueError(f"Unsupported operation: {operation}")


def _preview(df: pd.DataFrame, limit: int = 25) -> List[Dict[str, Any]]:
    return df.head(limit).to_dict(orient="records")


@celery_app.task(name="dataframe.load_csv", bind=True)
def load_csv(self, file_bytes: bytes, *, read_kwargs: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    record_task_started(self.request.id)
    record_task_progress(self.request.id, message="Parsing CSV data")
    try:
        df = pd.read_csv(io.BytesIO(file_bytes), **(read_kwargs or {}))
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.exception("dataframe.load_csv failed")
        record_task_failure(self.request.id, error=str(exc))
        raise
    payload = {
        "shape": df.shape,
        "columns": list(df.columns),
        "preview": _preview(df),
        "data": df.to_dict(orient="records"),
    }
    record_task_success(self.request.id, result=payload)
    return payload


@celery_app.task(name="dataframe.apply_transformations", bind=True)
def apply_transformations(
    self,
    frame: List[Dict[str, Any]],
    operations: List[Dict[str, Any]],
    *,
    context: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    record_task_started(self.request.id)
    record_task_progress(self.request.id, message="Applying transformations", progress={"operations": len(operations)})
    try:
        df = pd.DataFrame(frame)
        for operation in operations:
            df = _apply_operation(df, operation)
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.exception("dataframe.apply_transformations failed")
        record_task_failure(self.request.id, error=str(exc))
        raise
    payload = {
        "shape": df.shape,
        "columns": list(df.columns),
        "preview": _preview(df),
    }
    record_task_success(self.request.id, result=payload)
    return payload


__all__ = ["apply_transformations", "load_csv"]
