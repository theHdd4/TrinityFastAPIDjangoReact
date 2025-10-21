from __future__ import annotations

from datetime import datetime
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorCollection

from .deps import get_exhibition_layout_collection
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

    record = await collection.find_one(filter_query)
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exhibition layout not found")

    record.pop("_id", None)
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

    timestamp = datetime.utcnow()

    document = {
        "client_name": client_name,
        "app_name": app_name,
        "project_name": project_name,
        "cards": cards,
        "slide_objects": slide_objects,
        "updated_at": timestamp,
    }

    await collection.update_one(
        {"client_name": client_name, "app_name": app_name, "project_name": project_name},
        {"$set": document},
        upsert=True,
    )

    return {"status": "ok", "updated_at": timestamp}
