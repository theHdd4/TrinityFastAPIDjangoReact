from __future__ import annotations

import logging
import os
from datetime import datetime
from typing import Any, Dict, List

from django.conf import settings
from django.utils import timezone
from django.utils.timezone import is_aware
from pymongo import MongoClient

from .models import Project, RegistryEnvironment, Template

logger = logging.getLogger(__name__)

try:  # pragma: no cover - bson is provided by pymongo at runtime
    from bson import ObjectId  # type: ignore
except Exception:  # pragma: no cover - executed in limited test envs
    ObjectId = None  # type: ignore


def _utc_now() -> datetime:
    """Return a naive UTC timestamp compatible with MongoDB."""

    timestamp = timezone.now()
    if is_aware(timestamp):
        timestamp = timestamp.astimezone(timezone.utc)
    return timestamp.replace(tzinfo=None)


def _serialise_docs(documents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Return Mongo documents with JSON-serialisable ``_id`` fields."""

    serialised: List[Dict[str, Any]] = []
    for document in documents:
        converted = {}
        for key, value in document.items():
            if key == "_id" and ObjectId is not None and isinstance(value, ObjectId):
                converted[key] = str(value)
            else:
                converted[key] = value
        serialised.append(converted)
    return serialised


def _get_registry_environment(project: Project) -> RegistryEnvironment | None:
    """Return the cached registry environment for the given project."""

    try:
        return (
            RegistryEnvironment.objects.filter(
                app_name=project.app.slug,
                project_name=project.name,
            ).first()
        )
    except Exception:  # pragma: no cover - defensive fallback only
        logger.exception("Failed to load RegistryEnvironment for project %s", project.pk)
        return None


def _resolve_project_context(project: Project) -> Dict[str, str]:
    """Assemble client/app identifiers required for Mongo queries."""

    default_client_name = os.environ.get("CLIENT_NAME", "")
    default_app_name = os.environ.get("APP_NAME", project.app.slug if project.app else "")
    default_client_id = os.environ.get("CLIENT_ID", "")
    default_app_id = os.environ.get("APP_ID", str(project.app_id) if project.app_id else "")
    default_project_id = os.environ.get("PROJECT_ID", "")

    registry_env = _get_registry_environment(project)
    client_name = registry_env.client_name if registry_env and registry_env.client_name else default_client_name
    app_name = registry_env.app_name if registry_env and registry_env.app_name else default_app_name

    envvars = registry_env.envvars if registry_env else {}

    client_id = str(envvars.get("CLIENT_ID") or default_client_id or "")
    app_id = str(envvars.get("APP_ID") or default_app_id or "")
    project_id = str(envvars.get("PROJECT_ID") or default_project_id or "")

    if not project_id:
        # Fall back to the convention used by signals (``<name>_<pk>``)
        project_id = f"{project.name}_{project.pk}" if project.pk else project.name

    return {
        "client_name": client_name,
        "app_name": app_name,
        "client_id": client_id,
        "app_id": app_id,
        "project_id": project_id,
    }


def store_template_configuration(*, project: Project, template: Template, state: Dict[str, Any]) -> Dict[str, Any]:
    """Persist related Mongo configurations for a saved template.

    Returns a summary dictionary describing the captured configuration that can
    be surfaced to API consumers.
    """

    mongo_uri = getattr(settings, "MONGO_URI", "mongodb://mongo:27017/trinity_db")
    context = _resolve_project_context(project)
    timestamp = _utc_now()

    try:
        client = MongoClient(mongo_uri)
    except Exception as exc:  # pragma: no cover - connection errors logged only
        logger.error("Unable to create Mongo client: %s", exc)
        return {}

    try:
        database = client["trinity_db"]

        # Exhibition layout snapshot -------------------------------------------------
        exhibition_docs: List[Dict[str, Any]] = []
        try:
            exhibition_filter = {
                "client_name": context["client_name"],
                "app_name": context["app_name"],
                "project_name": project.name,
                "document_type": "layout_snapshot",
            }
            exhibition_cursor = database["exhibition_list_configuration"].find(exhibition_filter)
            exhibition_docs = _serialise_docs(list(exhibition_cursor))
        except Exception as exc:  # pragma: no cover - network/driver errors only
            logger.error(
                "Failed to fetch exhibition_list_configuration for template %s: %s",
                template.pk,
                exc,
            )
            exhibition_docs = []

        # Atom list configuration ----------------------------------------------------
        atom_docs: List[Dict[str, Any]] = []
        try:
            atom_filter = {
                key: value
                for key, value in (
                    ("client_id", context.get("client_id")),
                    ("app_id", context.get("app_id")),
                    ("project_id", context.get("project_id")),
                )
                if value
            }
            if atom_filter:
                atom_filter["isDeleted"] = {"$ne": True}
                atom_cursor = database["atom_list_configuration"].find(atom_filter)
                atom_docs = _serialise_docs(list(atom_cursor))
        except Exception as exc:  # pragma: no cover - network/driver errors only
            logger.error(
                "Failed to fetch atom_list_configuration for template %s: %s",
                template.pk,
                exc,
            )
            atom_docs = []

        # Molecules configuration ----------------------------------------------------
        molecule_docs: List[Dict[str, Any]] = []
        try:
            molecule_filter = {
                key: value
                for key, value in (
                    ("client_id", context.get("client_id")),
                    ("app_id", context.get("app_id")),
                    ("project_id", context.get("project_id")),
                )
                if value
            }
            if molecule_filter:
                molecule_cursor = database["molecules_config"].find(molecule_filter)
                molecule_docs = _serialise_docs(list(molecule_cursor))
        except Exception as exc:  # pragma: no cover - network/driver errors only
            logger.error(
                "Failed to fetch molecules_config for template %s: %s",
                template.pk,
                exc,
            )
            molecule_docs = []

        # Summary --------------------------------------------------------------------
        exhibition_slide_count = sum(len(doc.get("cards", [])) for doc in exhibition_docs)
        atom_card_summary = {
            "laboratory": len(((state.get("laboratory_config") or {}).get("cards")) or []),
            "workflow": len(((state.get("workflow_config") or {}).get("cards")) or []),
            "exhibition": len(((state.get("exhibition_config") or {}).get("cards")) or []),
        }
        summary = {
            "exhibition_slides": exhibition_slide_count,
            "atom_cards": atom_card_summary,
            "atom_entry_count": len(atom_docs),
            "molecule_count": len(molecule_docs),
        }

        document = {
            "template_id": str(template.pk),
            "template_name": template.name,
            "template_slug": template.slug,
            "project_name": project.name,
            "project_id": context.get("project_id"),
            "client_name": context.get("client_name"),
            "client_id": context.get("client_id"),
            "app_name": context.get("app_name"),
            "app_id": context.get("app_id"),
            "created_at": timestamp,
            "updated_at": timestamp,
            "exhibition_list_configuration": exhibition_docs,
            "atom_list_configuration": atom_docs,
            "molecules_config": molecule_docs,
            "summary": summary,
        }

        database["template_configuration"].replace_one(
            {"template_id": str(template.pk)},
            document,
            upsert=True,
        )
        return summary
    finally:
        client.close()
