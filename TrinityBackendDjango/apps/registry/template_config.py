from __future__ import annotations

import logging
import os
from datetime import datetime
from copy import deepcopy
from typing import Any, Dict, Iterable, List, Tuple

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


def _clone_documents(documents: Iterable[Dict[str, Any]]) -> List[Dict[str, Any]]:
    cloned: List[Dict[str, Any]] = []
    for document in documents:
        cloned.append(deepcopy(document))
    return cloned


def _generate_molecule_identifier(old_identifier: str, context: Dict[str, str], project: Project) -> str:
    base = context.get("project_id") or f"{project.name}_{project.pk}"
    safe_old = old_identifier.replace("/", "-") if old_identifier else "molecule"
    return f"{base}::{safe_old}"


def _remap_molecule_identifiers(
    payload: Any,
    mapping: Dict[str, str],
    *,
    string_keys: Iterable[str] | None = None,
    list_keys: Iterable[str] | None = None,
) -> Any:
    if not mapping:
        return payload

    string_key_set = set(string_keys or {"moleculeId", "molecule_id"})
    list_key_set = set(list_keys or {"containedMolecules", "atomOrder"})

    def _apply(value: Any) -> Any:
        if isinstance(value, dict):
            for key, item in list(value.items()):
                if key in string_key_set and isinstance(item, str):
                    value[key] = mapping.get(item, item)
                elif key in list_key_set and isinstance(item, list):
                    value[key] = [mapping.get(elem, elem) if isinstance(elem, str) else _apply(elem) for elem in item]
                else:
                    value[key] = _apply(item)
            return value
        if isinstance(value, list):
            for index, item in enumerate(value):
                if isinstance(item, str):
                    value[index] = mapping.get(item, item)
                else:
                    value[index] = _apply(item)
            return value
        return value

    return _apply(payload)


def remap_state_molecule_ids(state: Dict[str, Any], mapping: Dict[str, str]) -> Dict[str, Any]:
    if not mapping:
        return state
    cloned = deepcopy(state)
    return _remap_molecule_identifiers(cloned, mapping, string_keys={"moleculeId"})


def _update_env_metadata(document: Dict[str, Any], *, project: Project, context: Dict[str, str]) -> None:
    env_block = document.get("env")
    if isinstance(env_block, dict):
        updated = dict(env_block)
        if context.get("client_name"):
            updated["CLIENT_NAME"] = context["client_name"]
        if context.get("app_name"):
            updated["APP_NAME"] = context["app_name"]
        updated["PROJECT_NAME"] = project.name
        if context.get("project_id"):
            updated["PROJECT_ID"] = context["project_id"]
        document["env"] = updated


def _normalise_contextual_fields(
    document: Dict[str, Any], *, project: Project, context: Dict[str, str], timestamp: datetime, preserve_id: bool = False
) -> Dict[str, Any]:
    updated: Dict[str, Any] = {}
    for key, value in document.items():
        if key == "_id" and not preserve_id:
            continue
        updated[key] = deepcopy(value)

    client_name = context.get("client_name") or updated.get("client_name") or ""
    app_name = context.get("app_name") or updated.get("app_name") or ""
    project_id = context.get("project_id") or updated.get("project_id") or f"{project.name}_{project.pk}"

    updated["client_name"] = client_name
    updated["app_name"] = app_name
    updated["project_name"] = project.name
    updated["project_id"] = project_id

    client_id = context.get("client_id") or updated.get("client_id")
    if client_id:
        updated["client_id"] = client_id
    app_id = context.get("app_id") or updated.get("app_id")
    if app_id:
        updated["app_id"] = app_id

    if "updated_at" in updated:
        updated["updated_at"] = timestamp
    if "last_edited" in updated:
        updated["last_edited"] = timestamp

    _update_env_metadata(updated, project=project, context=context)

    return updated


def _persist_collection_documents(
    collection,
    *,
    documents: List[Dict[str, Any]],
    scope_keys: Tuple[str, ...],
    use_replace: bool = False,
) -> None:
    if not documents:
        return

    if use_replace:
        for document in documents:
            filter_query = {key: document.get(key) for key in scope_keys if document.get(key) is not None}
            if not filter_query:
                continue
            collection.replace_one(filter_query, document, upsert=True)
        return

    delete_filters = set()
    for document in documents:
        filter_values = []
        for key in scope_keys:
            value = document.get(key)
            if value is None or value == "":
                filter_values = []
                break
            filter_values.append(value)
        if filter_values:
            delete_filters.add(tuple(filter_values))

    for values in delete_filters:
        filter_query = {key: value for key, value in zip(scope_keys, values)}
        collection.delete_many(filter_query)

    if documents:
        collection.insert_many(documents)


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

        # Workflow mode configuration --------------------------------------------
        workflow_doc: Dict[str, Any] | None = None
        try:
            workflow_id = "/".join(
                filter(
                    None,
                    [context.get("client_name"), context.get("app_name"), project.name],
                )
            )
            if workflow_id:
                workflow_record = database["workflow_model_molecule_configuration"].find_one(
                    {"_id": workflow_id}
                )
                if workflow_record:
                    workflow_doc = _serialise_docs([workflow_record])[0]
        except Exception as exc:  # pragma: no cover - network/driver errors only
            logger.error(
                "Failed to fetch workflow_model_molecule_configuration for template %s: %s",
                template.pk,
                exc,
            )
            workflow_doc = None

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
            "workflow_model_molecule_configuration": workflow_doc,
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


def apply_template_configuration(*, project: Project, template: Template) -> None:
    """Rehydrate Mongo collections for a project created from a template."""

    mongo_uri = getattr(settings, "MONGO_URI", "mongodb://mongo:27017/trinity_db")
    context = _resolve_project_context(project)
    timestamp = _utc_now()

    try:
        client = MongoClient(mongo_uri)
    except Exception as exc:  # pragma: no cover - connection errors logged only
        logger.error("Unable to create Mongo client when applying template %s: %s", template.pk, exc)
        return

    try:
        database = client["trinity_db"]
        record = database["template_configuration"].find_one({"template_id": str(template.pk)})
        if not record:
            return {}

        exhibition_docs = _clone_documents(record.get("exhibition_list_configuration") or [])
        atom_docs = _clone_documents(record.get("atom_list_configuration") or [])
        molecule_docs = _clone_documents(record.get("molecules_config") or [])
        workflow_doc = deepcopy(record.get("workflow_model_molecule_configuration"))

        molecule_id_map: Dict[str, str] = {}
        for doc in molecule_docs:
            old_identifier = str(doc.get("_id") or "")
            if not old_identifier:
                continue
            molecule_id_map[old_identifier] = _generate_molecule_identifier(old_identifier, context, project)

        prepared_exhibition = [
            _normalise_contextual_fields(
                _remap_molecule_identifiers(doc, molecule_id_map),
                project=project,
                context=context,
                timestamp=timestamp,
            )
            for doc in exhibition_docs
        ]

        prepared_atoms = [
            _normalise_contextual_fields(
                _remap_molecule_identifiers(doc, molecule_id_map),
                project=project,
                context=context,
                timestamp=timestamp,
            )
            for doc in atom_docs
        ]

        prepared_molecules: List[Dict[str, Any]] = []
        for doc in molecule_docs:
            old_identifier = str(doc.get("_id") or "")
            new_identifier = molecule_id_map.get(old_identifier)
            if not new_identifier:
                continue
            remapped_doc = _remap_molecule_identifiers(
                doc,
                molecule_id_map,
                string_keys={"moleculeId", "molecule_id", "source", "target", "from", "to"},
                list_keys={"containedMolecules", "atomOrder"},
            )
            normalised = _normalise_contextual_fields(
                remapped_doc,
                project=project,
                context=context,
                timestamp=timestamp,
            )
            normalised["_id"] = new_identifier
            prepared_molecules.append(normalised)

        exhibition_collection = database["exhibition_list_configuration"]
        _persist_collection_documents(
            exhibition_collection,
            documents=prepared_exhibition,
            scope_keys=("client_name", "app_name", "project_name", "document_type"),
        )

        atom_collection = database["atom_list_configuration"]
        _persist_collection_documents(
            atom_collection,
            documents=prepared_atoms,
            scope_keys=("client_id", "app_id", "project_id", "mode", "canvas_position", "atom_positions"),
        )

        molecule_collection = database["molecules_config"]
        _persist_collection_documents(
            molecule_collection,
            documents=prepared_molecules,
            scope_keys=("_id",),
            use_replace=True,
        )

        workflow_collection = database["workflow_model_molecule_configuration"]
        if workflow_doc:
            workflow_remapped = _remap_molecule_identifiers(
                workflow_doc,
                molecule_id_map,
                string_keys={
                    "id",
                    "moleculeId",
                    "molecule_id",
                    "source",
                    "target",
                    "from",
                    "to",
                    "containerId",
                },
                list_keys={"containedMolecules", "atomOrder"},
            )
            workflow_id = "/".join(
                filter(
                    None,
                    [context.get("client_name"), context.get("app_name"), project.name],
                )
            )
            if not workflow_id:
                workflow_id = f"workflow::{project.pk}"
            workflow_remapped["_id"] = workflow_id
            workflow_remapped["client_name"] = context.get("client_name") or workflow_remapped.get("client_name", "")
            workflow_remapped["app_name"] = context.get("app_name") or workflow_remapped.get("app_name", "")
            workflow_remapped["project_name"] = project.name
            workflow_remapped["updated_at"] = timestamp
            if "created_at" not in workflow_remapped:
                workflow_remapped["created_at"] = timestamp
            workflow_collection.replace_one({"_id": workflow_id}, workflow_remapped, upsert=True)

        return {"molecule_id_map": molecule_id_map}
    finally:
        client.close()
