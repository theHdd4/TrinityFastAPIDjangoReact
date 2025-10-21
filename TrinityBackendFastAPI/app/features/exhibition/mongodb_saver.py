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
        slide_objects = exhibition_config_data.get("slide_objects") or {}

        for canvas_pos, card in enumerate(cards):
            slide_id = str(card.get("id") or f"slide-{canvas_pos}")
            slide_title = card.get("title") or card.get("moleculeTitle") or slide_id
            molecule_id = card.get("moleculeId")
            molecule_title = card.get("moleculeTitle")
            presentation_settings = card.get("presentationSettings") or {}

            raw_atoms = card.get("atoms") or []
            raw_catalogue_atoms = card.get("catalogueAtoms") or []
            raw_slide_objects = slide_objects.get(slide_id) or []

            sanitised_slide_objects: list[dict[str, Any]] = []
            if isinstance(raw_slide_objects, list):
                for entry in raw_slide_objects:
                    if isinstance(entry, dict):
                        sanitised_slide_objects.append(entry)

            sanitised_atoms: list[dict[str, Any]] = []
            for atom in raw_atoms:
                if not isinstance(atom, dict):
                    continue

                atom_id = atom.get("atomId") or atom.get("title") or "unknown"
                atom_settings = atom.get("settings", {})

                if atom.get("atomId") == "dataframe-operations":
                    atom_settings = {
                        key: value
                        for key, value in atom_settings.items()
                        if key not in {"tableData", "data"}
                    }

                sanitised_atoms.append(
                    {
                        "id": atom.get("id"),
                        "atomId": atom.get("atomId"),
                        "title": atom.get("title"),
                        "category": atom.get("category"),
                        "color": atom.get("color"),
                        "settings": atom_settings,
                    }
                )

            sanitised_catalogue_atoms: list[dict[str, Any]] = []
            for atom in raw_catalogue_atoms:
                if not isinstance(atom, dict):
                    continue
                sanitised_catalogue_atoms.append(atom)

            version_basis = {
                "atoms": sanitised_atoms,
                "catalogueAtoms": sanitised_catalogue_atoms,
                "slideObjects": sanitised_slide_objects,
                "presentationSettings": presentation_settings,
            }

            version_hash = hashlib.sha256(
                json.dumps(version_basis, sort_keys=True, default=str).encode()
            ).hexdigest()

            doc = {
                "client_id": client_id,
                "app_id": app_id,
                "project_id": project_name,
                "mode": mode,
                "slide_id": slide_id,
                "slide_title": slide_title,
                "canvas_position": canvas_pos,
                "molecule_id": molecule_id,
                "molecule_title": molecule_title,
                "atoms": sanitised_atoms,
                "catalogue_atoms": sanitised_catalogue_atoms,
                "slide_objects": sanitised_slide_objects,
                "presentation_settings": presentation_settings,
                "last_edited": timestamp,
                "version_hash": version_hash,
                "isDeleted": False,
            }

            docs.append(doc)

        if docs:
            result = await _collection.insert_many(docs)
            logger.info(
                "Stored %s exhibition slide configurations in %s",
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
