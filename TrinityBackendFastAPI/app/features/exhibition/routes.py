from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorCollection

from .deps import get_exhibition_layout_collection
from .persistence import save_exhibition_list_configuration
from .schemas import (
    ExhibitionConfigurationIn,
    ExhibitionConfigurationOut,
    ExhibitionLayoutConfigurationIn,
    ExhibitionLayoutConfigurationOut,
    ExhibitionManifestOut,
)
from .service import ExhibitionStorage

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
