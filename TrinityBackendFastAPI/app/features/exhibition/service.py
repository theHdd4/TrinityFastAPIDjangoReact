from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Any, Dict, Iterable, List, Optional

from fastapi.concurrency import run_in_threadpool

try:  # pragma: no cover - pymongo should be installed but we guard for tests
    from pymongo.collection import Collection
    from pymongo.errors import PyMongoError
except Exception:  # pragma: no cover - executed only if pymongo missing
    Collection = None  # type: ignore
    PyMongoError = Exception  # type: ignore

if __package__:
    from .mongo import ensure_mongo_connection, get_mongo_collection
else:  # pragma: no cover - allows direct module loading in unit tests
    import importlib.util

    _mongo_path = Path(__file__).resolve().parent / "mongo.py"
    _mongo_spec = importlib.util.spec_from_file_location("exhibition.mongo", _mongo_path)
    _mongo_module = importlib.util.module_from_spec(_mongo_spec) if _mongo_spec else None
    if _mongo_spec and _mongo_spec.loader and _mongo_module:
        _mongo_spec.loader.exec_module(_mongo_module)
        ensure_mongo_connection = _mongo_module.ensure_mongo_connection  # type: ignore[attr-defined]
        get_mongo_collection = _mongo_module.get_mongo_collection  # type: ignore[attr-defined]
    else:  # pragma: no cover - fallback when spec cannot be resolved
        def ensure_mongo_connection(*_args: Any, **_kwargs: Any) -> bool:
            logging.warning("ExhibitionStorage could not import Mongo helpers; Mongo disabled")
            return False

        def get_mongo_collection() -> Optional[Collection]:  # type: ignore[override]
            return None

DISABLE_MONGO = os.getenv("EXHIBITION_DISABLE_MONGO", "").strip().lower() in {"1", "true", "yes"}


def _default_storage_path() -> Path:
    """Return the default JSON file location for exhibition configurations."""

    root_dir = Path(os.getenv("EXHIBITION_STORAGE_DIR", "").strip() or Path(__file__).resolve().parents[3] / "storage")
    return Path(root_dir) / "exhibition_configurations.json"


class ExhibitionStorage:
    """Persist exhibition configurations to MongoDB with a JSON fallback."""

    def __init__(self, storage_file: Optional[os.PathLike[str] | str] = None) -> None:
        self._path = Path(storage_file) if storage_file is not None else _default_storage_path()
        self._lock = Lock()
        self._mongo_collection: Optional[Collection] = None
        self._initialise_mongo()

    # ------------------------------------------------------------------
    # Internal helpers - file storage
    # ------------------------------------------------------------------
    def _read_all_sync(self) -> List[Dict[str, Any]]:
        with self._lock:
            if not self._path.exists():
                return []

            try:
                with self._path.open("r", encoding="utf-8") as handle:
                    payload = json.load(handle)
            except json.JSONDecodeError:
                return []

            if isinstance(payload, list):
                return [entry for entry in payload if isinstance(entry, dict)]
            return []

    def _write_all_sync(self, records: Iterable[Dict[str, Any]]) -> None:
        with self._lock:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            serialisable = list(records)
            with self._path.open("w", encoding="utf-8") as handle:
                json.dump(serialisable, handle, ensure_ascii=False, indent=2, sort_keys=True, default=str)

    @staticmethod
    def _normalise_identity(value: str) -> str:
        return value.strip()

    @staticmethod
    def _resolve_component_payload(atom_like: Any) -> Any:
        """Return the raw component collection from a Mongo or file entry.

        Historic documents have stored the exhibited components under a few
        different keys (``exhibited_components``, ``exhibited_cards`` or even a
        spaced variant).  The latest API contract standardises on
        ``exhibited_components`` so we normalise any of these legacy keys here
        before sanitising.
        """

        if isinstance(atom_like, dict):
            for key in (
                "exhibited_components",
                "exhibited_cards",
                "exhibitedComponents",
                "exhibitedCards",
                "exhibited components",
            ):
                if key in atom_like:
                    return atom_like.get(key)
        return []

    @staticmethod
    def _sanitise_components(components: Any) -> List[Dict[str, Any]]:
        if not isinstance(components, list):
            return []

        sanitised: List[Dict[str, Any]] = []
        for component in components:
            if not isinstance(component, dict):
                continue

            identifier = str(component.get("id", "")).strip()
            if not identifier:
                continue

            sanitised_component: Dict[str, Any] = {"id": identifier}
            for key in ("atomId", "title", "category", "color"):
                value = component.get(key)
                if value is None:
                    continue
                sanitised_component[key] = value

            metadata = component.get("metadata")
            if isinstance(metadata, dict):
                sanitised_component["metadata"] = metadata

            manifest = component.get("manifest")
            if isinstance(manifest, dict):
                sanitised_component["manifest"] = manifest

            manifest_id = component.get("manifest_id") or component.get("manifestId")
            if isinstance(manifest_id, str) and manifest_id.strip():
                sanitised_component["manifest_id"] = manifest_id.strip()

            sanitised.append(sanitised_component)

        return sanitised

    @staticmethod
    def _sanitise_atoms(atoms: Any) -> List[Dict[str, Any]]:
        if not isinstance(atoms, list):
            return []

        sanitised: List[Dict[str, Any]] = []
        seen_ids: set[str] = set()

        for atom in atoms:
            if not isinstance(atom, dict):
                continue

            raw_atom_name = str(atom.get("atom_name", "")).strip()
            raw_identifier = str(atom.get("id", raw_atom_name)).strip()
            if not raw_atom_name or not raw_identifier:
                continue

            if raw_identifier in seen_ids:
                continue

            raw_components = ExhibitionStorage._resolve_component_payload(atom)
            components = ExhibitionStorage._sanitise_components(raw_components)
            sanitised.append(
                {
                    "id": raw_identifier,
                    "atom_name": raw_atom_name,
                    "exhibited_components": components,
                }
            )
            seen_ids.add(raw_identifier)

        return sanitised

    @staticmethod
    def _timestamp() -> str:
        return datetime.now(timezone.utc).isoformat()

    # ------------------------------------------------------------------
    # Mongo helpers
    # ------------------------------------------------------------------
    def _initialise_mongo(self) -> None:
        if DISABLE_MONGO:
            logging.info("ExhibitionStorage Mongo integration disabled via environment")
            return

        if not ensure_mongo_connection():
            return

        self._mongo_collection = get_mongo_collection()
        if self._mongo_collection is None:
            logging.warning("ExhibitionStorage could not obtain Mongo collection reference")

    def _ensure_mongo_ready(self) -> bool:
        if self._mongo_collection is not None:
            return True

        if ensure_mongo_connection():
            self._mongo_collection = get_mongo_collection()
            if self._mongo_collection is not None:
                return True

        return False

    def _mongo_document_id(self, client: str, app: str, project: str, entry_id: str) -> str:
        return f"{client}/{app}/{project}/{entry_id}"

    def _fetch_project_entries_from_mongo(self, client: str, app: str, project: str) -> List[Dict[str, Any]]:
        if not self._ensure_mongo_ready():
            return []

        try:
            cursor = self._mongo_collection.find(
                {
                    "client_name": client,
                    "app_name": app,
                    "project_name": project,
                }
            )
            documents = list(cursor)
        except PyMongoError as exc:  # pragma: no cover - best effort logging
            logging.error("MongoDB read error for exhibition catalogue: %s", exc)
            return []

        entries: List[Dict[str, Any]] = []
        for document in documents:
            entry = dict(document)
            entry.pop("_id", None)
            entries.append(entry)

        return entries

    def _persist_to_mongo(self, payload: Dict[str, Any]) -> None:
        if not self._ensure_mongo_ready():
            return

        client = payload.get("client_name", "")
        app = payload.get("app_name", "")
        project = payload.get("project_name", "")
        entries = payload.get("atoms", [])
        if not client or not app or not project:
            return

        if not isinstance(entries, list):
            entries = []

        try:
            existing_docs = list(
                self._mongo_collection.find(
                    {
                        "client_name": client,
                        "app_name": app,
                        "project_name": project,
                    }
                )
            )
        except PyMongoError as exc:  # pragma: no cover - best effort logging
            logging.error("MongoDB read error for exhibition catalogue: %s", exc)
            existing_docs = []

        existing_index = {str(doc.get("id", "")): doc for doc in existing_docs if doc.get("id")}
        incoming_ids = set()

        try:
            for entry in entries:
                if not isinstance(entry, dict):
                    continue

                entry_id = str(entry.get("id", "")).strip()
                atom_name = str(entry.get("atom_name", "")).strip()
                if not entry_id or not atom_name:
                    continue

                incoming_ids.add(entry_id)
                document_id = self._mongo_document_id(client, app, project, entry_id)
                components = ExhibitionStorage._sanitise_components(
                    ExhibitionStorage._resolve_component_payload(entry)
                )

                mongo_payload = {
                    "_id": document_id,
                    "id": entry_id,
                    "client_name": client,
                    "app_name": app,
                    "project_name": project,
                    "atom_name": atom_name,
                    "exhibited_components": components,
                    "updated_at": entry.get("updated_at"),
                }

                existing = existing_index.get(entry_id)
                if existing and existing.get("created_at") and "created_at" not in mongo_payload:
                    mongo_payload["created_at"] = existing["created_at"]
                else:
                    mongo_payload.setdefault("created_at", entry.get("created_at"))

                self._mongo_collection.replace_one({"_id": document_id}, mongo_payload, upsert=True)

            if existing_index:
                obsolete_ids = [doc_id for doc_id in existing_index.keys() if doc_id not in incoming_ids]
                if obsolete_ids:
                    self._mongo_collection.delete_many(
                        {
                            "client_name": client,
                            "app_name": app,
                            "project_name": project,
                            "id": {"$in": obsolete_ids},
                        }
                    )
        except PyMongoError as exc:  # pragma: no cover - best effort logging
            logging.error("MongoDB save error for exhibition catalogue: %s", exc)

    def _list_from_mongo(self) -> List[Dict[str, Any]]:
        if not self._ensure_mongo_ready():
            return []

        try:
            documents = list(self._mongo_collection.find())
        except PyMongoError as exc:  # pragma: no cover - best effort logging
            logging.error("MongoDB list error for exhibition catalogue: %s", exc)
            return []

        payloads: List[Dict[str, Any]] = []
        for document in documents:
            entry = dict(document)
            entry.pop("_id", None)
            payloads.append(entry)
        return payloads

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    async def list_configurations(self) -> List[Dict[str, Any]]:
        mongo_records: List[Dict[str, Any]] = []
        if self._ensure_mongo_ready():
            mongo_records = await run_in_threadpool(self._list_from_mongo)
        if mongo_records:
            return mongo_records
        return await run_in_threadpool(self._read_all_sync)

    async def get_configuration(self, client_name: str, app_name: str, project_name: str) -> Optional[Dict[str, Any]]:
        if self._ensure_mongo_ready():
            mongo_result = await run_in_threadpool(
                lambda: self._fetch_project_entries_from_mongo(
                    self._normalise_identity(client_name),
                    self._normalise_identity(app_name),
                    self._normalise_identity(project_name),
                )
            )
            if mongo_result:
                return self._aggregate_entries(
                    client_name,
                    app_name,
                    project_name,
                    mongo_result,
                )

        def _lookup() -> Optional[Dict[str, Any]]:
            client = self._normalise_identity(client_name)
            app = self._normalise_identity(app_name)
            project = self._normalise_identity(project_name)

            records = [
                record
                for record in self._read_all_sync()
                if self._normalise_identity(str(record.get("client_name", ""))) == client
                and self._normalise_identity(str(record.get("app_name", ""))) == app
                and self._normalise_identity(str(record.get("project_name", ""))) == project
            ]

            if not records:
                return None

            return self._aggregate_entries(client, app, project, records)

        return await run_in_threadpool(_lookup)

    async def get_manifest(
        self,
        client_name: str,
        app_name: str,
        project_name: str,
        component_id: str,
    ) -> Optional[Dict[str, Any]]:
        record = await self.get_configuration(client_name, app_name, project_name)
        if not record:
            return None

        component_key = str(component_id).strip()
        if not component_key:
            return None

        atoms = record.get("atoms", [])
        if not isinstance(atoms, list):
            return None

        for atom in atoms:
            if not isinstance(atom, dict):
                continue

            components = atom.get("exhibited_components", [])
            if not isinstance(components, list):
                continue

            for component in components:
                if not isinstance(component, dict):
                    continue

                raw_id = str(component.get("id", "")).strip()
                if not raw_id or raw_id != component_key:
                    continue

                raw_manifest = component.get("manifest")
                if not isinstance(raw_manifest, dict):
                    metadata = component.get("metadata")
                    if isinstance(metadata, dict):
                        fallback_manifest = metadata.get("visualizationManifest")
                        raw_manifest = fallback_manifest if isinstance(fallback_manifest, dict) else None

                manifest_payload = dict(raw_manifest) if isinstance(raw_manifest, dict) else None

                raw_metadata = component.get("metadata")
                metadata_payload = dict(raw_metadata) if isinstance(raw_metadata, dict) else None

                manifest_identifier = component.get("manifest_id")
                if not isinstance(manifest_identifier, str) or not manifest_identifier.strip():
                    if isinstance(metadata_payload, dict):
                        manifest_identifier = metadata_payload.get("manifestId")
                manifest_identifier = (
                    manifest_identifier.strip()
                    if isinstance(manifest_identifier, str) and manifest_identifier.strip()
                    else None
                )

                return {
                    "component_id": raw_id,
                    "manifest": manifest_payload,
                    "manifest_id": manifest_identifier,
                    "metadata": metadata_payload,
                    "atom_id": atom.get("id"),
                    "atom_name": atom.get("atom_name"),
                    "updated_at": record.get("updated_at"),
                }

        return None

    async def save_configuration(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        def _save() -> Dict[str, Any]:
            client = self._normalise_identity(str(payload.get("client_name", "")))
            app = self._normalise_identity(str(payload.get("app_name", "")))
            project = self._normalise_identity(str(payload.get("project_name", "")))

            atoms = self._sanitise_atoms(payload.get("atoms"))
            timestamp = self._timestamp()

            records = self._read_all_sync()
            remaining_records = [
                record
                for record in records
                if not (
                    self._normalise_identity(str(record.get("client_name", ""))) == client
                    and self._normalise_identity(str(record.get("app_name", ""))) == app
                    and self._normalise_identity(str(record.get("project_name", ""))) == project
                )
            ]

            existing_by_id = {
                str(record.get("id", "")): record
                for record in records
                if self._normalise_identity(str(record.get("client_name", ""))) == client
                and self._normalise_identity(str(record.get("app_name", ""))) == app
                and self._normalise_identity(str(record.get("project_name", ""))) == project
                and record.get("id")
            }

            project_entries: List[Dict[str, Any]] = []
            for atom_entry in atoms:
                entry_id = atom_entry["id"]
                previous = existing_by_id.get(entry_id)
                entry = {
                    "id": entry_id,
                    "client_name": client,
                    "app_name": app,
                    "project_name": project,
                    "atom_name": atom_entry["atom_name"],
                    "exhibited_components": atom_entry.get("exhibited_components", []),
                    "updated_at": timestamp,
                    "created_at": previous.get("created_at", timestamp) if previous else timestamp,
                }
                project_entries.append(entry)

            serialised = remaining_records + project_entries
            self._write_all_sync(serialised)

            persist_payload = {
                "client_name": client,
                "app_name": app,
                "project_name": project,
                "atoms": project_entries,
            }
            self._persist_to_mongo(persist_payload)

            aggregated = self._aggregate_entries(client, app, project, project_entries)
            aggregated["updated_at"] = timestamp
            return aggregated

        return await run_in_threadpool(_save)

    def _aggregate_entries(
        self,
        client: str,
        app: str,
        project: str,
        entries: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        atoms: List[Dict[str, Any]] = []
        latest_update: Optional[str] = None

        for entry in entries:
            if not isinstance(entry, dict):
                continue

            entry_id = str(entry.get("id", "")).strip()
            atom_name = str(entry.get("atom_name", "")).strip()
            if not entry_id or not atom_name:
                continue

            raw_components = self._resolve_component_payload(entry)
            components = self._sanitise_components(raw_components)
            atom_payload = {
                "id": entry_id,
                "atom_name": atom_name,
                "exhibited_components": components,
            }
            atoms.append(atom_payload)

            updated_at = entry.get("updated_at")
            if isinstance(updated_at, str):
                if latest_update is None or updated_at > latest_update:
                    latest_update = updated_at

        return {
            "client_name": client,
            "app_name": app,
            "project_name": project,
            "atoms": atoms,
            "updated_at": latest_update,
        }


__all__ = ["ExhibitionStorage"]
