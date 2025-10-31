from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorCollection

from .deps import get_exhibition_layout_collection
from .persistence import save_exhibition_list_configuration
from .share_links import fetch_shared_link_context
from .schemas import (
    ExhibitionConfigurationIn,
    ExhibitionConfigurationOut,
    ExhibitionExportRequest,
    ExhibitionLayoutConfigurationIn,
    ExhibitionLayoutConfigurationOut,
    ExhibitionManifestOut,
    PDFExportMode,
    SlideScreenshotsResponse,
)
from .service import ExhibitionStorage
from .export import (
    ExportGenerationError,
    build_export_filename,
    build_pdf_bytes,
    build_pptx_bytes,
    render_slide_screenshots,
)

router = APIRouter(prefix="/exhibition", tags=["Exhibition"])
storage = ExhibitionStorage()


@router.get("/configuration", response_model=ExhibitionConfigurationOut)
async def get_configuration(
    client_name: str = Query(..., min_length=1),
    app_name: str = Query(..., min_length=1),
    project_name: str = Query(..., min_length=1),
) -> ExhibitionConfigurationOut:
    record = await storage.get_configuration(client_name, app_name, project_name)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exhibition configuration not found")

    return ExhibitionConfigurationOut(**record)


@router.post("/configuration", status_code=status.HTTP_200_OK)
async def save_configuration(
    config: ExhibitionConfigurationIn,
) -> Dict[str, Any]:
    payload = config.dict()
    payload["client_name"] = payload["client_name"].strip()
    payload["app_name"] = payload["app_name"].strip()
    payload["project_name"] = payload["project_name"].strip()
    payload["atoms"] = payload.get("atoms") or []

    if not payload["client_name"] or not payload["app_name"] or not payload["project_name"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="client_name, app_name, and project_name are required",
        )

    saved = await storage.save_configuration(payload)

    return {"status": "ok", "updated_at": saved.get("updated_at")}


@router.get("/manifest", response_model=ExhibitionManifestOut)
async def get_manifest(
    component_id: str = Query(..., min_length=1),
    client_name: str = Query(..., min_length=1),
    app_name: str = Query(..., min_length=1),
    project_name: str = Query(..., min_length=1),
) -> ExhibitionManifestOut:
    record = await storage.get_manifest(client_name, app_name, project_name, component_id)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exhibition manifest not found")

    return ExhibitionManifestOut(**record)


@router.get("/layout", response_model=ExhibitionLayoutConfigurationOut)
async def get_layout_configuration(
    client_name: str = Query(..., min_length=1),
    app_name: str = Query(..., min_length=1),
    project_name: str = Query(..., min_length=1),
    collection: AsyncIOMotorCollection = Depends(get_exhibition_layout_collection),
) -> ExhibitionLayoutConfigurationOut:
    filter_query = {
        "client_name": client_name.strip(),
        "app_name": app_name.strip(),
        "project_name": project_name.strip(),
    }

    record = await collection.find_one({**filter_query, "document_type": "layout_snapshot"})
    if not record:
        record = await collection.find_one(filter_query)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exhibition layout not found")

    record.pop("_id", None)
    record.pop("document_type", None)
    return ExhibitionLayoutConfigurationOut(**record)


@router.post("/layout", status_code=status.HTTP_200_OK)
async def save_layout_configuration(
    layout: ExhibitionLayoutConfigurationIn,
    collection: AsyncIOMotorCollection = Depends(get_exhibition_layout_collection),
) -> Dict[str, Any]:
    payload = layout.model_dump(by_alias=True)
    client_name = payload.get("client_name", "").strip()
    app_name = payload.get("app_name", "").strip()
    project_name = payload.get("project_name", "").strip()

    if not client_name or not app_name or not project_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="client_name, app_name, and project_name are required",
        )

    cards = payload.get("cards")
    if not isinstance(cards, list):
        cards = []

    slide_objects = payload.get("slide_objects")
    if not isinstance(slide_objects, dict):
        slide_objects = {}

    persistence_result = await save_exhibition_list_configuration(
        client_name=client_name,
        app_name=app_name,
        project_name=project_name,
        exhibition_config_data={
            "mode": payload.get("mode") or "exhibition",
            "cards": cards,
            "slide_objects": slide_objects,
        },
        collection=collection,
    )

    if persistence_result.get("status") != "success":
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=persistence_result.get("error", "Failed to persist exhibition layout"),
        )

    timestamp = persistence_result.get("updated_at", datetime.utcnow())
    updated_at = timestamp.isoformat() if isinstance(timestamp, datetime) else str(timestamp)

    return {
        "status": "ok",
        "updated_at": updated_at,
        "documents_inserted": persistence_result.get("documents_written", 0),
    }


@router.get("/shared/{token}", response_model=ExhibitionLayoutConfigurationOut)
async def get_shared_layout(
    token: str,
    collection: AsyncIOMotorCollection = Depends(get_exhibition_layout_collection),
) -> ExhibitionLayoutConfigurationOut:
    cleaned_token = token.strip()
    if not cleaned_token:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shared exhibition link not found")

    try:
        context = await fetch_shared_link_context(cleaned_token)
    except Exception as exc:  # pragma: no cover - defensive logging in calling layer
        logging.exception("Failed to resolve exhibition share link: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to validate share link",
        ) from exc

    if context is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shared exhibition link not found")

    if not context.is_valid:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shared exhibition link expired")

    filter_query = {
        "client_name": context.client_name.strip(),
        "app_name": context.app_name.strip(),
        "project_name": context.project_name.strip(),
    }

    record = await collection.find_one({**filter_query, "document_type": "layout_snapshot"})
    if not record:
        record = await collection.find_one(filter_query)

    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exhibition layout not found")

    record.pop("_id", None)
    record.pop("document_type", None)
    record.update(filter_query)

    return ExhibitionLayoutConfigurationOut(**record)


@router.post("/export/pptx")
async def export_presentation_pptx(payload: ExhibitionExportRequest) -> Response:
    if not payload.slides:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No slides provided for export.",
        )

    try:
        pptx_bytes = build_pptx_bytes(payload)
    except ExportGenerationError as exc:  # pragma: no cover - defensive path
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    filename = build_export_filename(payload.title, "pptx")
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return Response(
        content=pptx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers=headers,
    )


@router.post("/export/pdf")
async def export_presentation_pdf(payload: ExhibitionExportRequest) -> Response:
    if not payload.slides:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No slides provided for export.",
        )

    try:
        mode = payload.pdf_mode or PDFExportMode.DIGITAL
        pdf_bytes = build_pdf_bytes(payload, mode=mode)
    except ExportGenerationError as exc:  # pragma: no cover - defensive path
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    base_filename = build_export_filename(payload.title, "pdf")
    suffix = "-print" if mode == PDFExportMode.PRINT else "-digital"
    if base_filename.lower().endswith(".pdf"):
        filename = f"{base_filename[:-4]}{suffix}.pdf"
    else:
        filename = f"{base_filename}{suffix}.pdf"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


@router.post("/export/screenshots", response_model=SlideScreenshotsResponse)
async def export_presentation_screenshots(
    payload: ExhibitionExportRequest,
) -> SlideScreenshotsResponse:
    if not payload.slides:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No slides provided for export.",
        )

    try:
        slides = render_slide_screenshots(payload)
    except ExportGenerationError as exc:  # pragma: no cover - defensive path
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    return SlideScreenshotsResponse(slides=slides)
