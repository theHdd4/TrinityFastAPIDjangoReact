from __future__ import annotations

import re

from fastapi import APIRouter, HTTPException, Response, status
from starlette.concurrency import run_in_threadpool

from .schemas import ExportRequest
from .service import build_pdf_document, build_pptx_document

router = APIRouter(prefix="/export", tags=["Presentation Export"])


def _safe_filename(title: str, extension: str) -> str:
    base = re.sub(r"[^A-Za-z0-9._-]+", " ", title).strip()
    base = re.sub(r"\s+", " ", base)
    if not base:
        base = "presentation"
    return f"{base}.{extension}"


@router.post("/pptx")
async def export_pptx(payload: ExportRequest) -> Response:
    if not payload.slides:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No slides provided")

    try:
        pptx_bytes = await run_in_threadpool(build_pptx_document, payload)
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    filename = _safe_filename(payload.title, "pptx")
    return Response(
        content=pptx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/pdf")
async def export_pdf(payload: ExportRequest) -> Response:
    if not payload.screenshots:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No screenshots provided")

    try:
        pdf_bytes = await run_in_threadpool(build_pdf_document, payload)
    except Exception as exc:  # pragma: no cover
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    filename = _safe_filename(payload.title, "pdf")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
