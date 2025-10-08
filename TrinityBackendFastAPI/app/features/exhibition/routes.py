from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorCollection
from pymongo.errors import CollectionInvalid

from .catalogue import build_catalogue_metadata, merge_catalogue_components
from .deps import get_exhibition_catalogue_collection, get_exhibition_collection
from .schemas import ExhibitionConfigurationIn, ExhibitionConfigurationOut

router = APIRouter(prefix="/exhibition", tags=["Exhibition"])


async def _ensure_collection(collection: AsyncIOMotorCollection) -> None:
    """Create the backing collection when MongoDB does not already have it."""

    try:
        await collection.database.create_collection(collection.name)
    except CollectionInvalid:
        return
    except Exception:
        existing = await collection.database.list_collection_names()
        if collection.name in existing:
            return
        raise


def _context_filter(client: str, app: str, project: str) -> Dict[str, str]:
    return {"client_name": client, "app_name": app, "project_name": project}


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
    catalogue_collection: AsyncIOMotorCollection = Depends(get_exhibition_catalogue_collection),
) -> ExhibitionConfigurationOut:
    filter_query = _context_filter(client_name, app_name, project_name)
    document = await collection.find_one(filter_query)
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exhibition configuration not found")

    payload = _serialise_document(document)

    catalogue_cursor = catalogue_collection.find(filter_query)
    catalogue_entries: List[Dict[str, Any]] = await catalogue_cursor.to_list(length=None)
    if catalogue_entries:
        feature_overview = payload.get("feature_overview")
        payload["feature_overview"] = merge_catalogue_components(feature_overview, catalogue_entries)

    return ExhibitionConfigurationOut(**payload)


async def _sync_catalogue(
    collection: AsyncIOMotorCollection,
    context: Dict[str, str],
    entries: Iterable[Dict[str, Any]],
    timestamp: datetime,
) -> None:
    await _ensure_collection(collection)

    entry_list = list(entries)
    if not entry_list:
        await collection.delete_many(context)
        return

    active_ids: List[str] = []
    for entry in entry_list:
        catalogue_id = str(entry.get("catalogue_id"))
        active_ids.append(catalogue_id)
        document = {
            **context,
            "_id": catalogue_id,
            "atom_id": entry.get("atom_id"),
            "card_id": entry.get("card_id"),
            "component_type": entry.get("component_type"),
            "component_label": entry.get("component_label"),
            "catalogue_title": entry.get("catalogue_title"),
            "catalogue_id": catalogue_id,
            "sku_id": entry.get("sku_id"),
            "sku_title": entry.get("sku_title"),
            "sku_details": entry.get("sku_details"),
            "metadata": entry.get("metadata"),
            "updated_at": timestamp,
        }

        await collection.update_one(
            {"_id": catalogue_id},
            {
                "$set": document,
                "$setOnInsert": {"created_at": timestamp},
            },
            upsert=True,
        )

    await collection.delete_many({**context, "_id": {"$nin": active_ids}})


@router.post("/configuration", status_code=status.HTTP_200_OK)
async def save_configuration(
    config: ExhibitionConfigurationIn,
    collection: AsyncIOMotorCollection = Depends(get_exhibition_collection),
    catalogue_collection: AsyncIOMotorCollection = Depends(get_exhibition_catalogue_collection),
) -> Dict[str, Any]:
    payload = config.dict()
    payload["client_name"] = payload["client_name"].strip()
    payload["app_name"] = payload["app_name"].strip()
    payload["project_name"] = payload["project_name"].strip()
    payload["cards"] = payload.get("cards") or []

    feature_overview_raw = payload.get("feature_overview") or []
    feature_overview, catalogue_entries = build_catalogue_metadata(feature_overview_raw)
    payload["feature_overview"] = feature_overview

    if not payload["client_name"] or not payload["app_name"] or not payload["project_name"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="client_name, app_name, and project_name are required",
        )

    timestamp = datetime.now(timezone.utc)
    payload["updated_at"] = timestamp

    context = _context_filter(payload["client_name"], payload["app_name"], payload["project_name"])

    await collection.update_one(
        context,
        {
            "$set": payload,
            "$setOnInsert": {"created_at": timestamp},
        },
        upsert=True,
    )

    await _sync_catalogue(catalogue_collection, context, catalogue_entries, timestamp)

    return {"status": "ok", "updated_at": timestamp}
