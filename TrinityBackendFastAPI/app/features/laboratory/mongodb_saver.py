from __future__ import annotations

import logging
import os
from datetime import datetime
import re
from typing import Any, Dict, Tuple
from uuid import uuid4

from motor.motor_asyncio import AsyncIOMotorClient

from app.core.mongo import build_host_mongo_uri

logger = logging.getLogger(__name__)


def _default_mongo_uri() -> str:
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

    database = os.getenv("MONGO_DB", "trinity_db")

    return build_host_mongo_uri(
        username=username,
        password=password,
        auth_source=auth_source,
        database=database,
    )


def _mongo_auth_kwargs(uri: str) -> Dict[str, str]:
    if "@" in uri.split("//", 1)[-1]:
        return {}

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
    auth_source = (
        os.getenv("MONGO_AUTH_SOURCE")
        or os.getenv("MONGO_AUTH_DB")
        or "admin"
    ).strip()
    auth_mechanism = os.getenv("MONGO_AUTH_MECHANISM", "").strip()

    kwargs: Dict[str, str] = {}
    if username:
        kwargs["username"] = username
    if password:
        kwargs["password"] = password
    if (username or password) and auth_source:
        kwargs["authSource"] = auth_source
    if auth_mechanism:
        kwargs["authMechanism"] = auth_mechanism
    return kwargs


DEFAULT_MONGO_URI = _default_mongo_uri()
MONGO_URI = os.getenv("LABORATORY_MONGO_URI") or os.getenv("MONGO_URI") or DEFAULT_MONGO_URI
MONGO_DB = os.getenv("MONGO_DB", "trinity_db")

_client = AsyncIOMotorClient(MONGO_URI, **_mongo_auth_kwargs(MONGO_URI))
_db = _client[MONGO_DB]

CONFIG_VARIABLE_COLLECTION = "config_variable"


def _build_variable_name_key(raw_name: Any) -> str:
    """Create a normalised key for variable names (trimmed, collapsed spaces, lowercase)."""

    if not isinstance(raw_name, str):
        return ""

    collapsed = " ".join(raw_name.strip().split())
    return collapsed.lower()


def _normalise_variable_document(document: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    """Ensure the document has required Mongo-ready fields and timestamps."""

    record = dict(document)
    variable_id = record.pop("id", None) or record.pop("_id", None) or f"variable-{uuid4().hex}"
    now = datetime.utcnow()

    created_at = record.get("created_at") or now

    variable_name = record.get("variable_name") or ""
    name_key = _build_variable_name_key(variable_name)

    record.update(
        {
            "_id": variable_id,
            "variable_name": variable_name.strip() if isinstance(variable_name, str) else variable_name,
            "variable_name_key": name_key,
            "created_at": created_at,
            "updated_at": now,
        }
    )
    return variable_id, record


def get_config_variable_collection():
    """Return the Motor collection handle for config_variable."""

    return _db[CONFIG_VARIABLE_COLLECTION]


async def save_variable_definition(document: Dict[str, Any]) -> Dict[str, Any]:
    """Persist a variable definition document into MongoDB."""

    variable_id, record = _normalise_variable_document(document)
    name_key = record.get("variable_name_key", "")

    if not name_key:
        return {
            "status": "error",
            "error": "Variable name is required",
            "variable_id": variable_id,
            "collection": CONFIG_VARIABLE_COLLECTION,
        }

    try:
        # Prevent duplicate variable names within the same project scope
        duplicate_filter: Dict[str, Any] = {
            "client_id": record.get("client_id"),
            "app_id": record.get("app_id"),
            "project_id": record.get("project_id"),
            "_id": {"$ne": variable_id},
            "$or": [
                {"variable_name_key": name_key},
                {
                    "variable_name": {
                        "$regex": rf"^{re.escape(record.get('variable_name', '').strip())}$",
                        "$options": "i",
                    }
                },
            ],
        }

        # Remove None values from the duplicate filter to avoid matching missing scope fields
        duplicate_filter = {k: v for k, v in duplicate_filter.items() if v is not None}

        existing = await get_config_variable_collection().find_one(duplicate_filter)
        if existing:
            logger.info(
                "⚠️ Duplicate variable name detected for %s (existing id: %s)",
                record.get("variable_name"),
                existing.get("_id"),
            )
            return {
                "status": "conflict",
                "error": "A variable with this name already exists in the project.",
                "variable_id": variable_id,
                "collection": CONFIG_VARIABLE_COLLECTION,
                "conflict_with": str(existing.get("_id")),
            }

        filter_query: Dict[str, Any] = {"_id": variable_id}
        for scope_field in ("client_id", "app_id", "project_id"):
            value = record.get(scope_field)
            if value:
                filter_query[scope_field] = value

        result = await get_config_variable_collection().replace_one(
            filter_query,
            record,
            upsert=True,
        )
        operation = "updated" if result.matched_count > 0 else "inserted"
        logger.info(
            "🔖 %s variable definition %s in %s",
            "Updated" if operation == "updated" else "Inserted",
            variable_id,
            CONFIG_VARIABLE_COLLECTION,
        )
        return {
            "status": "success",
            "operation": operation,
            "variable_id": variable_id,
            "collection": CONFIG_VARIABLE_COLLECTION,
        }
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Failed to persist variable definition %s", variable_id)
        return {
            "status": "error",
            "error": str(exc),
            "variable_id": variable_id,
            "collection": CONFIG_VARIABLE_COLLECTION,
        }

