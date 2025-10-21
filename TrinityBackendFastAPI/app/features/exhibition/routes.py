from __future__ import annotations

import logging
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
from .mongodb_saver import save_exhibition_list_configuration

router = APIRouter(prefix="/exhibition", tags=["Exhibition"])
project_state_router = APIRouter(
    prefix="/exhibition-project-state",
    tags=["Exhibition Project State"],
)
storage = ExhibitionStorage()
logger = logging.getLogger(__name__)


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


async def _load_layout_configuration(
    client_name: str,
    app_name: str,
    project_name: str,
    collection: AsyncIOMotorCollection,
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


async def _persist_layout_configuration(
    layout: ExhibitionLayoutConfigurationIn,
    collection: AsyncIOMotorCollection,
) -> Dict[str, Any]:
    payload = layout.dict(by_alias=True)
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

    exhibition_config_payload = {
        "mode": "exhibition",
        "cards": cards,
        "slide_objects": slide_objects,
    }

    try:
        exhibition_config_result = await save_exhibition_list_configuration(
            client_name=client_name,
            app_name=app_name,
            project_name=project_name,
            exhibition_config_data=exhibition_config_payload,
        )
    except Exception as exc:  # pragma: no cover - defensive logging
        logger.exception(
            "Failed to persist exhibition configuration to %s: %s",
            "exhibition_list_configuration",
            exc,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save exhibition configuration",
        ) from exc

    if exhibition_config_result.get("status") != "success":
        error_message = exhibition_config_result.get("error", "Unknown error")
        logger.error(
            "exhibition_list_configuration save failed for exhibition layout: %s",
            error_message,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save exhibition configuration: {error_message}",
        )

    await collection.update_one(
        {"client_name": client_name, "app_name": app_name, "project_name": project_name},
        {"$set": document},
        upsert=True,
    )

    response: Dict[str, Any] = {
        "status": "ok",
        "updated_at": timestamp,
    }
    if exhibition_config_result:
        response["exhibition_configuration"] = {
            "operation": exhibition_config_result.get("operation"),
            "documents_inserted": exhibition_config_result.get("documents_inserted"),
            "collection": exhibition_config_result.get("collection"),
        }

    return response


@router.get("/layout", response_model=ExhibitionLayoutConfigurationOut)
async def get_layout_configuration(
    client_name: str = Query(..., min_length=1),
    app_name: str = Query(..., min_length=1),
    project_name: str = Query(..., min_length=1),
    collection: AsyncIOMotorCollection = Depends(get_exhibition_layout_collection),
) -> ExhibitionLayoutConfigurationOut:
    return await _load_layout_configuration(client_name, app_name, project_name, collection)


@project_state_router.get("", response_model=ExhibitionLayoutConfigurationOut)
async def get_project_state_layout(
    client_name: str = Query(..., min_length=1),
    app_name: str = Query(..., min_length=1),
    project_name: str = Query(..., min_length=1),
    collection: AsyncIOMotorCollection = Depends(get_exhibition_layout_collection),
) -> ExhibitionLayoutConfigurationOut:
    return await _load_layout_configuration(client_name, app_name, project_name, collection)


@router.post("/layout", status_code=status.HTTP_200_OK)
async def save_layout_configuration(
    layout: ExhibitionLayoutConfigurationIn,
    collection: AsyncIOMotorCollection = Depends(get_exhibition_layout_collection),
) -> Dict[str, Any]:
    return await _persist_layout_configuration(layout, collection)


@project_state_router.post("/save", status_code=status.HTTP_200_OK)
async def save_project_state_layout(
    layout: ExhibitionLayoutConfigurationIn,
    collection: AsyncIOMotorCollection = Depends(get_exhibition_layout_collection),
) -> Dict[str, Any]:
    return await _persist_layout_configuration(layout, collection)
