"""Celery tasks for the data upload validation workflow."""
from __future__ import annotations

import asyncio
import io
import logging
import os
from pathlib import Path
from typing import Any, Dict, Optional

import pandas as pd
import polars as pl

from app.celery_app import celery_app
from app.core.task_tracking import (
    record_task_failure,
    record_task_progress,
    record_task_started,
    record_task_success,
)
from app.DataStorageRetrieval.minio_utils import ensure_minio_bucket, upload_to_minio
from app.features.data_upload_validate.app.routes import CSV_READ_KWARGS, _smart_csv_parse, get_object_prefix

logger = logging.getLogger("app.features.data_upload_validate.tasks")


def _resolve_prefix(context: Dict[str, Any]) -> str:
    prefix = asyncio.run(
        get_object_prefix(
            context.get("client_id", ""),
            context.get("app_id", ""),
            context.get("project_id", ""),
            client_name=context.get("client_name", ""),
            app_name=context.get("app_name", ""),
            project_name=context.get("project_name", ""),
        )
    )
    return prefix


def _process_upload(file_bytes: bytes, file_name: str, context: Dict[str, Any]) -> Dict[str, Any]:
    for env_key in ("CLIENT_ID", "APP_ID", "PROJECT_ID", "CLIENT_NAME", "APP_NAME", "PROJECT_NAME"):
        value = context.get(env_key.lower())
        if value:
            os.environ[env_key] = value

    ensure_minio_bucket()
    prefix = _resolve_prefix(context)
    tmp_prefix = prefix + "tmp/"

    logger.info("upload_task.start filename=%s prefix=%s", file_name, tmp_prefix)

    if file_name.lower().endswith(".csv"):
        df_pl, parsing_warnings, parsing_metadata = _smart_csv_parse(file_bytes, CSV_READ_KWARGS)
        if parsing_warnings:
            logger.warning("upload_task.csv_warnings count=%s", len(parsing_warnings))
    elif file_name.lower().endswith((".xls", ".xlsx")):
        try:
            df_pandas = pd.read_excel(io.BytesIO(file_bytes))
        except Exception:
            df_pandas = pd.read_excel(io.BytesIO(file_bytes), dtype=str)
        df_pl = pl.from_pandas(df_pandas)
        parsing_metadata = {}
    else:
        raise ValueError("Only CSV and XLSX files supported")

    arrow_buf = io.BytesIO()
    df_pl.write_ipc(arrow_buf)
    arrow_name = Path(file_name).stem + ".arrow"

    logger.info(
        "upload_task.arrow_ready filename=%s rows=%s cols=%s size=%s",
        file_name,
        df_pl.height,
        df_pl.width,
        len(arrow_buf.getvalue()),
    )

    result = upload_to_minio(arrow_buf.getvalue(), arrow_name, tmp_prefix)
    if result.get("status") != "success":
        logger.error("upload_task.minio_failure filename=%s error=%s", file_name, result.get("error_message"))
        raise RuntimeError(result.get("error_message", "Upload failed"))

    payload: Dict[str, Any] = {
        "file_path": result["object_name"],
        "file_name": file_name,
        "parsing_metadata": parsing_metadata,
    }
    return payload


@celery_app.task(name="data_upload.process_temp_upload", bind=True)
def process_temp_upload(self, file_bytes: bytes, file_name: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    context = context or {}
    record_task_started(self.request.id)
    record_task_progress(self.request.id, message="Parsing uploaded file")
    try:
        result = _process_upload(file_bytes, file_name, context)
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.exception("upload_task.failed filename=%s", file_name)
        record_task_failure(self.request.id, error=str(exc))
        raise
    record_task_success(self.request.id, result=result)
    return result


__all__ = ["process_temp_upload"]
