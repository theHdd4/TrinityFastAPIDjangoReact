from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorCollection

from .deps import get_exhibition_collection
from .schemas import ExhibitionConfigurationIn, ExhibitionConfigurationOut

router = APIRouter(prefix="/exhibition", tags=["Exhibition"])


def _serialise_document(document: Dict[str, Any]) -> Dict[str, Any]:
    payload = {key: value for key, value in document.items() if key != "_id"}
    updated_at = payload.get("updated_at")
    if isinstance(updated_at, datetime):
        payload["updated_at"] = updated_at.astimezone(timezone.utc)
    return payload


@router.get("/configuration", response_model=ExhibitionConfigurationOut)
async def get_configuration(
    client_name: str = Query(..., min_length=1),
    app_name: str = Query(..., min_length=1),
    project_name: str = Query(..., min_length=1),
    collection: AsyncIOMotorCollection = Depends(get_exhibition_collection),
) -> ExhibitionConfigurationOut:
    document = await collection.find_one(
        {
            "client_name": client_name,
            "app_name": app_name,
            "project_name": project_name,
        }
    )
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exhibition configuration not found")

    payload = _serialise_document(document)
    return ExhibitionConfigurationOut(**payload)


@router.post("/configuration", status_code=status.HTTP_200_OK)
async def save_configuration(
    config: ExhibitionConfigurationIn,
    collection: AsyncIOMotorCollection = Depends(get_exhibition_collection),
) -> Dict[str, Any]:
    payload = config.dict()
    payload["client_name"] = payload["client_name"].strip()
    payload["app_name"] = payload["app_name"].strip()
    payload["project_name"] = payload["project_name"].strip()

    if not payload["client_name"] or not payload["app_name"] or not payload["project_name"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="client_name, app_name, and project_name are required",
        )

    timestamp = datetime.now(timezone.utc)
    payload["updated_at"] = timestamp

    filter_query = {
        "client_name": payload["client_name"],
        "app_name": payload["app_name"],
        "project_name": payload["project_name"],
    }

    await collection.update_one(
        filter_query,
        {
            "$set": payload,
            "$setOnInsert": {"created_at": timestamp},
        },
        upsert=True,
    )

    return {"status": "ok", "updated_at": timestamp}
