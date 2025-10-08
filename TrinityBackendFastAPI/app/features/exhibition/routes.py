from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorCollection
from pydantic import ValidationError

from .deps import get_exhibition_collection
from .schemas import (
    ExhibitionConfigurationIn,
    ExhibitionConfigurationOut,
    ExhibitionFeatureOverview,
)

router = APIRouter(prefix="/exhibition", tags=["Exhibition"])


def _serialise_document(document: Dict[str, Any]) -> Dict[str, Any]:
    payload = {key: value for key, value in document.items() if key != "_id"}
    updated_at = payload.get("updated_at")
    if isinstance(updated_at, datetime):
        payload["updated_at"] = updated_at.astimezone(timezone.utc)
    payload["cards"] = _normalise_cards(payload.get("cards"))
    payload["feature_overview"] = _normalise_feature_overview(
        payload.get("feature_overview") or payload.get("featureOverview")
    )
    return payload


def _normalise_cards(raw_cards: Any) -> List[Dict[str, Any]]:
    if isinstance(raw_cards, dict):
        candidates = list(raw_cards.values())
    elif isinstance(raw_cards, Iterable) and not isinstance(raw_cards, (str, bytes)):
        candidates = list(raw_cards)
    else:
        return []

    cleaned: List[Dict[str, Any]] = []
    for card in candidates:
        if isinstance(card, dict):
            cleaned.append(card)
    return cleaned


def _normalise_feature_overview(raw: Any) -> List[Dict[str, Any]]:
    if raw is None:
        return []

    if isinstance(raw, dict):
        # Some legacy payloads may have been stored as a mapping keyed by card
        # ID. Retain backwards compatibility by treating the values as the
        # actual configuration entries.
        values = list(raw.values())
    elif isinstance(raw, Iterable):
        values = list(raw)
    else:
        return []

    entries: List[Dict[str, Any]] = []
    for entry in values:
        if not isinstance(entry, dict):
            continue
        try:
            model = ExhibitionFeatureOverview.parse_obj(entry)
        except ValidationError:
            # Ignore malformed entries rather than causing the entire request
            # to fail. This keeps the API resilient to older documents.
            continue
        entries.append(model.dict())
    return entries


def _build_empty_configuration(
    client_name: str, app_name: str, project_name: str
) -> ExhibitionConfigurationOut:
    return ExhibitionConfigurationOut(
        client_name=client_name,
        app_name=app_name,
        project_name=project_name,
        cards=[],
        feature_overview=[],
    )


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
        return _build_empty_configuration(client_name, app_name, project_name)

    payload = _serialise_document(document)
    payload.setdefault("client_name", client_name)
    payload.setdefault("app_name", app_name)
    payload.setdefault("project_name", project_name)
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

    payload["cards"] = _normalise_cards(payload.get("cards"))
    payload["feature_overview"] = _normalise_feature_overview(payload.get("feature_overview"))

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
