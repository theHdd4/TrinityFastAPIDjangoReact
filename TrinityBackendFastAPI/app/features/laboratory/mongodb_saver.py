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


async def save_variable_to_project(document: Dict[str, Any]) -> Dict[str, Any]:
    """Save a variable to a project document with nested structure: _id = client/app/project, variables = {variable_name: {...}}."""
    
    client_id = document.get("client_id", "").strip()
    app_id = document.get("app_id", "").strip()
    project_id = document.get("project_id", "").strip()
    variable_name = document.get("variable_name", "").strip()
    
    if not client_id or not app_id or not project_id:
        return {
            "status": "error",
            "error": "client_id, app_id, and project_id are required",
            "collection": CONFIG_VARIABLE_COLLECTION,
        }
    
    if not variable_name:
        return {
            "status": "error",
            "error": "Variable name is required",
            "collection": CONFIG_VARIABLE_COLLECTION,
        }
    
    try:
        # Document ID is just client/app/project
        doc_id = f"{client_id}/{app_id}/{project_id}"
        
        # Prepare variable data (exclude id, client_id, app_id, project_id, variable_name from nested data)
        variable_data = {
            "value": document.get("value", ""),
            "description": document.get("description"),
            "usage_summary": document.get("usage_summary"),
            "metadata": document.get("metadata", {}),
            "created_at": document.get("created_at") or datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        
        # Check if document exists
        existing_doc = await get_config_variable_collection().find_one({"_id": doc_id})
        
        if existing_doc:
            # Check if variable name already exists
            existing_variables = existing_doc.get("variables", {})
            if variable_name in existing_variables:
                # Update existing variable
                variable_data["created_at"] = existing_variables[variable_name].get("created_at", variable_data["created_at"])
                operation = "updated"
            else:
                operation = "inserted"
            
            # Update the variables object
            existing_variables[variable_name] = variable_data
            
            result = await get_config_variable_collection().update_one(
                {"_id": doc_id},
                {
                    "$set": {
                        "variables": existing_variables,
                        "updated_at": datetime.utcnow(),
                    }
                }
            )
        else:
            # Create new document
            new_doc = {
                "_id": doc_id,
                "client_id": client_id,
                "app_id": app_id,
                "project_id": project_id,
                "project_name": document.get("project_name", project_id),
                "variables": {
                    variable_name: variable_data
                },
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow(),
            }
            
            result = await get_config_variable_collection().insert_one(new_doc)
            operation = "inserted"
        
        # logger.info(
        #     "🔖 %s variable %s in project %s",
        #     "Updated" if operation == "updated" else "Inserted",
        #     variable_name,
        #     doc_id,
        # )
        
        return {
            "status": "success",
            "operation": operation,
            "variable_name": variable_name,
            "project_id": doc_id,
            "collection": CONFIG_VARIABLE_COLLECTION,
        }
    except Exception as exc:  # pylint: disable=broad-except
        logger.exception("Failed to persist variable %s to project", variable_name)
        return {
            "status": "error",
            "error": str(exc),
            "variable_name": variable_name,
            "collection": CONFIG_VARIABLE_COLLECTION,
        }
