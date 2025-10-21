from __future__ import annotations

import hashlib
import json
import logging
import os
from datetime import datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.mongo import build_host_mongo_uri

logger = logging.getLogger(__name__)

DEFAULT_MONGO_URI = build_host_mongo_uri()
MONGO_URI = os.getenv("EXHIBITION_MONGO_URI") or os.getenv("MONGO_URI", DEFAULT_MONGO_URI)
MONGO_DB = os.getenv("MONGO_DB", "trinity_db")
EXHIBITION_COLLECTION = os.getenv("EXHIBITION_LAYOUT_COLLECTION", "exhibition_list_configuration")

_client = AsyncIOMotorClient(MONGO_URI)
_db = _client[MONGO_DB]
_collection = _db[EXHIBITION_COLLECTION]


async def save_exhibition_list_configuration(
    client_name: str,
    app_name: str,
    project_name: str,
    exhibition_config_data: dict[str, Any],
    *,
    user_id: str = "",
    project_id: int | None = None,
) -> dict[str, Any]:
    """Persist exhibition layout configuration documents in MongoDB."""
    try:
        client_id = client_name
        app_id = app_name

        mode = exhibition_config_data.get("mode", "exhibition")

        await _collection.delete_many(
            {
                "client_id": client_id,
                "app_id": app_id,
                "project_id": project_name,
                "mode": mode,
            }
        )

        timestamp = datetime.utcnow()
        docs: list[dict[str, Any]] = []

        cards = exhibition_config_data.get("cards", [])

        for canvas_pos, card in enumerate(cards):
            open_card = "no" if card.get("collapsed") else "yes"
            exhibition_preview = "yes" if card.get("isExhibited") else "no"
            scroll_pos = card.get("scroll_position", 0)

            for atom_pos, atom in enumerate(card.get("atoms", [])):
                atom_id = atom.get("atomId") or atom.get("title") or "unknown"
                atom_title = atom.get("title") or atom_id
                atom_settings = atom.get("settings", {})

                if atom.get("atomId") == "dataframe-operations":
                    atom_settings = {
                        key: value
                        for key, value in atom_settings.items()
                        if key not in {"tableData", "data"}
                    }

                version_hash = hashlib.sha256(
                    json.dumps(atom_settings, sort_keys=True).encode()
                ).hexdigest()

                doc = {
                    "client_id": client_id,
                    "app_id": app_id,
                    "project_id": project_name,
                    "mode": mode,
                    "atom_name": atom_id,
                    "atom_title": atom_title,
                    "canvas_position": canvas_pos,
                    "atom_positions": atom_pos,
                    "atom_configs": atom_settings,
                    "open_cards": open_card,
                    "scroll_position": scroll_pos,
                    "exhibition_previews": exhibition_preview,
                    "notes": atom_settings.get("notes", ""),
                    "last_edited": timestamp,
                    "version_hash": version_hash,
                    "mode_meta": {
                        "card_id": card.get("id"),
                        "atom_id": atom.get("id"),
                    },
                    "isDeleted": False,
                }

                docs.append(doc)

        if docs:
            result = await _collection.insert_many(docs)
            logger.info(
                "Stored %s exhibition atom configurations in %s",
                len(result.inserted_ids),
                EXHIBITION_COLLECTION,
            )
            return {
                "status": "success",
                "mongo_id": f"{client_id}/{app_id}/{project_name}",
                "operation": "inserted",
                "collection": EXHIBITION_COLLECTION,
                "documents_inserted": len(result.inserted_ids),
            }

        return {
            "status": "success",
            "mongo_id": f"{client_id}/{app_id}/{project_name}",
            "operation": "no_data",
            "collection": EXHIBITION_COLLECTION,
            "documents_inserted": 0,
        }

    except Exception as exc:  # pragma: no cover - defensive logging
        logger.error(
            "MongoDB save error for %s: %s",
            EXHIBITION_COLLECTION,
            exc,
        )
        return {"status": "error", "error": str(exc)}
