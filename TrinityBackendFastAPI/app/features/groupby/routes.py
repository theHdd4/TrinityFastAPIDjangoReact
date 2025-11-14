from __future__ import annotations

import io
import json
from typing import Any, Dict, List
from urllib.parse import unquote

from fastapi import APIRouter, Body, Depends, Form, HTTPException, Query, Response

from app.core.observability import timing_dependency_factory
from app.core.task_queue import celery_task_client, format_task_response
from app.features.data_upload_validate.app.routes import get_object_prefix

from .service import (
    MINIO_BUCKET,
    build_result_filename,
    ensure_prefixed_object,
    initialize_groupby,
    load_dataframe,
)

timing_dependency = timing_dependency_factory("app.features.groupby")
router = APIRouter(prefix="/groupby", tags=["groupby"], dependencies=[Depends(timing_dependency)])


@router.get("/")
async def root() -> Dict[str, Any]:
    return {
        "message": "GroupBy backend is running",
        "endpoints": [
            "/ping",
            "/init",
            "/run",
            "/cached_dataframe",
            "/cardinality",
            "/save",
            "/export_csv",
            "/export_excel",
        ],
    }


@router.get("/ping")
async def ping() -> Dict[str, str]:
    return {"msg": "GroupBy backend is alive"}


@router.post("/init")
async def init_groupby(
    bucket_name: str = Form(...),
    object_names: str = Form(...),
    client_name: str = Form(...),
    app_name: str = Form(...),
    project_name: str = Form(...),
    file_key: str = Form(...),
) -> Dict[str, Any]:
    try:
        return initialize_groupby(
            bucket_name=bucket_name,
            object_name=object_names,
            client_name=client_name,
            app_name=app_name,
            project_name=project_name,
            file_key=file_key,
        )
    except Exception as exc:  # pragma: no cover - defensive logging
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/run")
async def run_groupby(
    validator_atom_id: str = Form(...),
    file_key: str = Form(...),
    bucket_name: str = Form(...),
    object_names: str = Form(...),
    identifiers: str = Form(...),
    aggregations: str = Form(...),
) -> Dict[str, Any]:
    try:
        identifiers_payload: List[str] = json.loads(identifiers) if isinstance(identifiers, str) else identifiers
        if not isinstance(identifiers_payload, list):
            raise ValueError("identifiers must be a list")
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid identifiers payload") from exc

    try:
        aggregations_payload: Dict[str, Any] = json.loads(aggregations) if isinstance(aggregations, str) else aggregations
        if not isinstance(aggregations_payload, dict):
            raise ValueError("aggregations must be a mapping")
    except (ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Invalid aggregations payload") from exc

    prefix = await get_object_prefix()
    source_object = ensure_prefixed_object(object_names, prefix)
    result_filename = build_result_filename(validator_atom_id, file_key)

    submission = celery_task_client.submit_callable(
        name="groupby.run",
        dotted_path="app.features.groupby.service.perform_groupby_task",
        kwargs={
            "bucket_name": bucket_name,
            "source_object": source_object,
            "result_filename": result_filename,
            "identifiers": identifiers_payload,
            "aggregations": aggregations_payload,
        },
        metadata={
            "atom": "groupby",
            "operation": "run",
            "file_key": file_key,
            "source_object": source_object,
        },
    )

    if submission.status == "failure":
        raise HTTPException(status_code=500, detail=submission.detail or "Failed to execute groupby")

    return format_task_response(submission)


@router.get("/cached_dataframe")
async def cached_dataframe(
    object_name: str,
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    page_size: int = Query(50, ge=1, le=1000, description="Number of rows per page"),
) -> Dict[str, Any]:
    resolved_name = unquote(object_name)
    submission = celery_task_client.submit_callable(
        name="groupby.cached_dataframe",
        dotted_path="app.features.groupby.service.load_cached_dataframe_page",
        kwargs={"object_name": resolved_name, "page": page, "page_size": page_size},
        metadata={
            "atom": "groupby",
            "operation": "cached_dataframe",
            "object_name": resolved_name,
            "page": page,
            "page_size": page_size,
        },
    )

    if submission.status == "failure":
        raise HTTPException(status_code=400, detail=submission.detail or "Failed to load cached dataframe")

    return format_task_response(submission)


@router.get("/cardinality")
async def cardinality(object_name: str = Query(..., description="Object name/path of the dataframe")) -> Dict[str, Any]:
    resolved_name = unquote(object_name)
    submission = celery_task_client.submit_callable(
        name="groupby.cardinality",
        dotted_path="app.features.groupby.service.compute_cardinality_task",
        kwargs={"object_name": resolved_name},
        metadata={
            "atom": "groupby",
            "operation": "cardinality",
            "object_name": resolved_name,
        },
    )

    if submission.status == "failure":
        raise HTTPException(status_code=400, detail=submission.detail or "Failed to compute cardinality")

    return format_task_response(submission)


@router.post("/save")
async def save_groupby(
    payload: Dict[str, Any] = Body(..., description="Grouped CSV payload"),
) -> Dict[str, Any]:
    csv_data = payload.get("csv_data")
    if not isinstance(csv_data, str) or not csv_data.strip():
        raise HTTPException(status_code=400, detail="csv_data must be a non-empty string")
    filename = payload.get("filename")
    if filename is not None and not isinstance(filename, str):
        raise HTTPException(status_code=400, detail="filename must be a string if provided")

    prefix = await get_object_prefix()
    submission = celery_task_client.submit_callable(
        name="groupby.save",
        dotted_path="app.features.groupby.service.save_groupby_dataframe_task",
        kwargs={
            "csv_data": csv_data,
            "filename": filename,
            "object_prefix": prefix,
        },
        metadata={
            "atom": "groupby",
            "operation": "save",
            "object_prefix": prefix,
        },
    )

    if submission.status == "failure":
        raise HTTPException(status_code=500, detail=submission.detail or "Failed to save groupby dataframe")

    return format_task_response(submission)


@router.get("/export_csv")
async def export_csv(object_name: str) -> Response:
    resolved_name = unquote(object_name)
    try:
        frame = load_dataframe(MINIO_BUCKET, resolved_name)
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=404, detail=f"Export failed: {exc}") from exc

    csv_bytes = frame.to_csv(index=False).encode("utf-8")
    filename = resolved_name.split("/")[-1].replace(".arrow", "").replace(".xlsx", "") or "groupby_result"
    return Response(
        content=csv_bytes,
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}.csv",
        },
    )


@router.get("/export_excel")
async def export_excel(object_name: str) -> Response:
    resolved_name = unquote(object_name)
    try:
        frame = load_dataframe(MINIO_BUCKET, resolved_name)
    except Exception as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=404, detail=f"Export failed: {exc}") from exc

    buffer = io.BytesIO()
    try:
        frame.to_excel(buffer, index=False, engine="openpyxl")
    except Exception:  # pragma: no cover - fallback for missing engine
        frame.to_excel(buffer, index=False)
    excel_bytes = buffer.getvalue()

    filename = resolved_name.split("/")[-1].replace(".arrow", "").replace(".csv", "") or "groupby_result"
    return Response(
        content=excel_bytes,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": f"attachment; filename={filename}.xlsx",
        },
    )
