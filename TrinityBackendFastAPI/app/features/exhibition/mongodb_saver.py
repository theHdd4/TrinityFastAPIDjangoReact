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

MONGO_DB = os.getenv("MONGO_DB", "trinity_db")
EXHIBITION_COLLECTION = os.getenv("EXHIBITION_LAYOUT_COLLECTION", "exhibition_list_configuration")


def _default_mongo_uri() -> str:
    """Construct a Mongo URI that targets ``trinity_db`` with root credentials."""

    username_env = os.getenv("MONGO_USERNAME") or os.getenv("MONGO_USER")
    password_env = os.getenv("MONGO_PASSWORD") or os.getenv("MONGO_PASS")

    username = (
        username_env.strip()
        if isinstance(username_env, str) and username_env.strip()
        else "root"
    )
    password = (
        password_env.strip()
        if isinstance(password_env, str) and password_env.strip()
        else "rootpass"
    )

    auth_source_env = os.getenv("MONGO_AUTH_SOURCE") or os.getenv("MONGO_AUTH_DB")
    auth_source = (
        auth_source_env.strip()
        if isinstance(auth_source_env, str) and auth_source_env.strip()
        else "admin"
    )

    return build_host_mongo_uri(
        username=username,
        password=password,
        auth_source=auth_source,
        default_host="mongo",
        default_port="27017",
        database=MONGO_DB,
    )


def _mongo_auth_kwargs(uri: str) -> dict[str, str]:
    """Return authentication kwargs unless credentials exist in ``uri``."""

    if "@" in uri.split("//", 1)[-1]:
        return {}

    username = (
        os.getenv("MONGO_USERNAME")
        or os.getenv("MONGO_USER")
        or "root"
    ).strip()
    password = (
        os.getenv("MONGO_PASSWORD")
        or os.getenv("MONGO_PASS")
        or "rootpass"
    ).strip()
    auth_source = (
        os.getenv("MONGO_AUTH_SOURCE")
        or os.getenv("MONGO_AUTH_DB")
        or "admin"
    ).strip()
    auth_mechanism = os.getenv("MONGO_AUTH_MECHANISM", "").strip()

    kwargs: dict[str, str] = {}
    if username:
        kwargs["username"] = username
    if password:
        kwargs["password"] = password
    if (username or password) and auth_source:
        kwargs["authSource"] = auth_source
    if auth_mechanism:
        kwargs["authMechanism"] = auth_mechanism

    return kwargs


MONGO_URI = (
    os.getenv("EXHIBITION_LAYOUT_MONGO_URI")
    or os.getenv("EXHIBITION_MONGO_URI")
    or os.getenv("MONGO_URI")
    or _default_mongo_uri()
)
_AUTH_KWARGS = _mongo_auth_kwargs(MONGO_URI)

_client = AsyncIOMotorClient(MONGO_URI, **_AUTH_KWARGS)
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

            raw_catalogue_atoms = card.get("catalogueAtoms") or []
            raw_components_source = raw_catalogue_atoms or card.get("atoms") or []
            raw_slide_objects = slide_objects.get(slide_id) or []

            sanitised_slide_objects: list[dict[str, Any]] = []
            if isinstance(raw_slide_objects, list):
                for entry in raw_slide_objects:
                    if isinstance(entry, dict):
                        sanitised_slide_objects.append(entry)

            sanitised_components: list[dict[str, Any]] = []
            if isinstance(raw_components_source, list):
                for component in raw_components_source:
                    if not isinstance(component, dict):
                        continue

                    raw_component_id = component.get("id") or component.get("atomId")
                    if raw_component_id is None:
                        continue

                    component_id = str(raw_component_id).strip()
                    if not component_id:
                        continue

                    prepared: dict[str, Any] = {
                        "id": component_id,
                        "atomId": component.get("atomId"),
                        "title": component.get("title"),
                        "category": component.get("category"),
                        "color": component.get("color"),
                    }

                    metadata = component.get("metadata")
                    if isinstance(metadata, dict):
                        prepared["metadata"] = metadata

                    manifest = component.get("manifest")
                    if isinstance(manifest, dict):
                        prepared["manifest"] = manifest

                    manifest_id = component.get("manifest_id") or component.get("manifestId")
                    if isinstance(manifest_id, str) and manifest_id.strip():
                        prepared["manifest_id"] = manifest_id.strip()

                    sanitised_components.append(prepared)

            version_basis = {
                "components": sanitised_components,
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
                "components": sanitised_components,
                "catalogue_atoms": sanitised_components,
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
