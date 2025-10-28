"""Mongo persistence helpers for exhibition layout data."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, Iterable, List

from motor.motor_asyncio import AsyncIOMotorCollection

try:  # pragma: no cover - pymongo should be available at runtime
    from pymongo.errors import PyMongoError
except Exception:  # pragma: no cover - executed only when pymongo missing
    PyMongoError = Exception  # type: ignore[assignment]

logger = logging.getLogger(__name__)

def _normalise_cards(cards: Any) -> List[Dict[str, Any]]:
    if not isinstance(cards, list):
        return []

    sanitised: List[Dict[str, Any]] = []
    for card in cards:
        if isinstance(card, dict):
            sanitised.append(dict(card))
    return sanitised


def _normalise_slide_objects(slide_objects: Any) -> Dict[str, Any]:
    if isinstance(slide_objects, dict):
        return dict(slide_objects)
    return {}


def _build_document(
    *,
    client_name: str,
    app_name: str,
    project_name: str,
    mode: str,
    cards: Iterable[Dict[str, Any]],
    slide_objects: Dict[str, Any],
    timestamp: datetime,
) -> Dict[str, Any]:
    return {
        "client_name": client_name,
        "app_name": app_name,
        "project_name": project_name,
        "mode": mode,
        "document_type": "layout_snapshot",
        "cards": list(cards),
        "slide_objects": slide_objects,
        "updated_at": timestamp,
    }


async def save_exhibition_list_configuration(
    *,
    client_name: str,
    app_name: str,
    project_name: str,
    exhibition_config_data: Dict[str, Any],
    collection: AsyncIOMotorCollection,
) -> Dict[str, Any]:
    """Persist the active exhibition slides to MongoDB.

    Parameters
    ----------
    client_name, app_name, project_name:
        Identity values that scope the stored configuration.
    exhibition_config_data:
        Payload containing the ``cards`` collection and optional
        ``slide_objects`` mapping supplied by the frontend.
    collection:
        Authenticated Motor collection reference targeting the
        ``exhibition_list_configuration`` collection.
    """

    client_id = client_name.strip()
    app_id = app_name.strip()
    project_id = project_name.strip()
    mode = exhibition_config_data.get("mode") or "exhibition"

    cards = _normalise_cards(exhibition_config_data.get("cards"))
    slide_objects = _normalise_slide_objects(exhibition_config_data.get("slide_objects"))

    timestamp = datetime.utcnow()

    filter_query = {
        "client_name": client_id,
        "app_name": app_id,
        "project_name": project_id,
        "document_type": "layout_snapshot",
    }

    document = _build_document(
        client_name=client_id,
        app_name=app_id,
        project_name=project_id,
        mode=mode,
        cards=cards,
        slide_objects=slide_objects,
        timestamp=timestamp,
    )

    try:
        # Remove any legacy exhibition documents that stored laboratory atoms so the
        # collection only retains the slide metadata snapshot for the active project.
        legacy_filter = {
            "client_name": client_id,
            "app_name": app_id,
            "project_name": project_id,
            "document_type": {"$ne": "layout_snapshot"},
        }
        await collection.delete_many(legacy_filter)

        # Remove stray records that may exist in the legacy ``trinity`` database so
        # the slide configuration lives exclusively inside ``trinity_db``.
        if collection.database.name != "trinity":
            legacy_db_collection = collection.database.client["trinity"][collection.name]
            await legacy_db_collection.delete_many(legacy_filter)

        result = await collection.replace_one(filter_query, document, upsert=True)
        documents_written = 1 if (result.upserted_id or result.modified_count or result.matched_count) else 0

        logger.info(
            "📦 Stored exhibition layout snapshot for %s/%s/%s in %s.%s",
            client_id,
            app_id,
            project_id,
            collection.database.name,
            collection.name,
        )

        return {
            "status": "success",
            "updated_at": timestamp,
            "documents_written": documents_written,
            "collection": collection.name,
            "database": collection.database.name,
        }

    except PyMongoError as exc:  # pragma: no cover - depends on runtime infra
        logger.error(
            "❌ MongoDB save error for %s.%s: %s", collection.database.name, collection.name, exc
        )
        return {"status": "error", "error": str(exc)}

