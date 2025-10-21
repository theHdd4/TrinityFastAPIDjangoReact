"""MongoDB persistence helpers for exhibition layouts.

The exhibition workspace shares the same card/atom structure as the laboratory
mode.  Saving the layout should therefore reuse the same authentication flow as
the ``atom_list_configuration`` pipeline while persisting documents into the
``exhibition_list_configuration`` collection.  This module mirrors the
behaviour of :func:`app.features.build_model_feature_based.mongodb_saver.
save_atom_list_configuration` but targets the exhibition collection and stores
an additional snapshot document that retains the full layout state for fast
retrieval via the REST API.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.mongo import build_host_mongo_uri

logger = logging.getLogger(__name__)

_CLIENT: Optional[AsyncIOMotorClient] = None


def _default_mongo_uri() -> str:
    """Return a Mongo URI that matches the docker-compose credentials."""

    from os import getenv

    username = (getenv("MONGO_USERNAME") or getenv("MONGO_USER") or "root").strip()
    password = (getenv("MONGO_PASSWORD") or getenv("MONGO_PASS") or "rootpass").strip()
    auth_source = (
        getenv("MONGO_AUTH_SOURCE")
        or getenv("MONGO_AUTH_DB")
        or "admin"
    ).strip()
    database = getenv("EXHIBITION_MONGO_DB") or getenv("MONGO_DB") or "trinity_db"

    return build_host_mongo_uri(
        username=username or "root",
        password=password or "rootpass",
        auth_source=auth_source or "admin",
        database=database,
    )


def _resolve_mongo_uri() -> str:
    from os import getenv

    return getenv("EXHIBITION_MONGO_URI") or getenv("MONGO_URI") or _default_mongo_uri()


def _mongo_client() -> AsyncIOMotorClient:
    global _CLIENT
    if _CLIENT is None:
        uri = _resolve_mongo_uri()
        _CLIENT = AsyncIOMotorClient(uri)
    return _CLIENT


async def _delete_existing(
    collection,
    *,
    client_id: str,
    app_id: str,
    project_id: str,
    mode: str,
) -> None:
    await collection.delete_many(
        {
            "client_id": client_id,
            "app_id": app_id,
            "project_id": project_id,
            "mode": mode,
        }
    )


def _normalise_cards(cards: Any) -> List[Dict[str, Any]]:
    if not isinstance(cards, list):
        return []
    return [card for card in cards if isinstance(card, dict)]


def _normalise_slide_objects(slide_objects: Any) -> Dict[str, Any]:
    if isinstance(slide_objects, dict):
        return slide_objects
    return {}


def _build_documents(
    *,
    cards: Iterable[Dict[str, Any]],
    slide_objects: Dict[str, Any],
    client_id: str,
    app_id: str,
    project_id: str,
    mode: str,
    timestamp: datetime,
) -> List[Dict[str, Any]]:
    documents: List[Dict[str, Any]] = []

    for canvas_position, card in enumerate(cards):
        try:
            card_id = card.get("id")
        except AttributeError:
            continue

        open_card = "no" if card.get("collapsed") else "yes"
        exhibition_preview = "yes" if card.get("isExhibited") else "no"
        scroll_pos = card.get("scroll_position", 0)

        for atom_position, atom in enumerate(card.get("atoms", [])):
            if not isinstance(atom, dict):
                continue

            atom_id = atom.get("atomId") or atom.get("title") or "unknown"
            atom_title = atom.get("title") or atom_id
            atom_settings = atom.get("settings", {}) or {}

            version_hash = hashlib.sha256(
                json.dumps(atom_settings, sort_keys=True, default=str).encode()
            ).hexdigest()

            documents.append(
                {
                    "client_id": client_id,
                    "app_id": app_id,
                    "project_id": project_id,
                    "mode": mode,
                    "atom_name": atom_id,
                    "atom_title": atom_title,
                    "canvas_position": canvas_position,
                    "atom_positions": atom_position,
                    "atom_configs": atom_settings,
                    "open_cards": open_card,
                    "scroll_position": scroll_pos,
                    "exhibition_previews": exhibition_preview,
                    "notes": atom_settings.get("notes", ""),
                    "last_edited": timestamp,
                    "version_hash": version_hash,
                    "mode_meta": {
                        "card_id": card_id,
                        "atom_id": atom.get("id"),
                    },
                    "isDeleted": False,
                    "slide_objects": slide_objects.get(card_id, []),
                }
            )

    documents.append(
        {
            "client_id": client_id,
            "app_id": app_id,
            "project_id": project_id,
            "mode": mode,
            "document_type": "layout_snapshot",
            "cards": list(cards),
            "slide_objects": slide_objects,
            "last_edited": timestamp,
        }
    )

    return documents


async def save_exhibition_list_configuration(
    *,
    client_name: str,
    app_name: str,
    project_name: str,
    exhibition_config_data: Dict[str, Any],
) -> Dict[str, Any]:
    """Persist exhibition configuration documents to MongoDB.

    Parameters
    ----------
    client_name, app_name, project_name:
        Identity values that scope the stored configuration.
    exhibition_config_data:
        Payload containing the ``cards`` collection and optional
        ``slide_objects`` mapping supplied by the frontend.
    """

    client_id = client_name
    app_id = app_name
    project_id = project_name
    mode = exhibition_config_data.get("mode") or "exhibition"

    cards = _normalise_cards(exhibition_config_data.get("cards", []))
    slide_objects = _normalise_slide_objects(exhibition_config_data.get("slide_objects"))

    timestamp = datetime.utcnow()

    try:
        client = _mongo_client()
        default_db = client.get_default_database()
        database_name = (
            exhibition_config_data.get("mongo_db")
            or (default_db.name if default_db is not None else None)
            or os.getenv("EXHIBITION_MONGO_DB")
            or os.getenv("MONGO_DB")
            or "trinity_db"
        )
        db = client[database_name]
        collection = db["exhibition_list_configuration"]

        await _delete_existing(
            collection,
            client_id=client_id,
            app_id=app_id,
            project_id=project_id,
            mode=mode,
        )

        documents = _build_documents(
            cards=cards,
            slide_objects=slide_objects,
            client_id=client_id,
            app_id=app_id,
            project_id=project_id,
            mode=mode,
            timestamp=timestamp,
        )

        if documents:
            await collection.insert_many(documents)
            logger.info(
                "📦 Stored %s exhibition configuration documents for %s/%s/%s",
                len(documents),
                client_id,
                app_id,
                project_id,
            )
        else:
            logger.info(
                "ℹ️ Exhibition configuration for %s/%s/%s contained no cards",
                client_id,
                app_id,
                project_id,
            )

        return {
            "status": "success",
            "documents_inserted": len(documents),
            "updated_at": timestamp,
            "collection": "exhibition_list_configuration",
        }

    except Exception as exc:  # pragma: no cover - network errors depend on runtime
        logger.error("❌ MongoDB save error for exhibition_list_configuration: %s", exc)
        return {"status": "error", "error": str(exc)}
