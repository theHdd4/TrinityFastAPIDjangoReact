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
    def _sanitise_cards(cards: Any) -> List[Dict[str, Any]]:
        if isinstance(cards, list):
            return [card for card in cards if isinstance(card, dict)]
        return []

    @staticmethod
    def _sanitise_feature_overview(feature_overview: Any) -> List[Dict[str, Any]]:
        if isinstance(feature_overview, list):
            return [entry for entry in feature_overview if isinstance(entry, dict)]
        return []

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

    def _mongo_document_id(self, client: str, app: str, project: str) -> str:
        return f"{client}/{app}/{project}"

    def _fetch_from_mongo(self, document_id: str) -> Optional[Dict[str, Any]]:
        if not self._ensure_mongo_ready():
            return None

        try:
            document = self._mongo_collection.find_one({"_id": document_id})
        except PyMongoError as exc:  # pragma: no cover - best effort logging
            logging.error("MongoDB read error for exhibition catalogue: %s", exc)
            return None

        if not document:
            return None

        payload = dict(document)
        payload.pop("_id", None)
        return payload

    def _persist_to_mongo(self, payload: Dict[str, Any]) -> None:
        if not self._ensure_mongo_ready():
            return

        client = payload.get("client_name", "")
        app = payload.get("app_name", "")
        project = payload.get("project_name", "")
        if not client or not app or not project:
            return

        document_id = self._mongo_document_id(client, app, project)
        mongo_payload = dict(payload)
        mongo_payload["_id"] = document_id

        try:
            existing = self._mongo_collection.find_one({"_id": document_id})
            if existing and "created_at" in existing and "created_at" not in mongo_payload:
                mongo_payload["created_at"] = existing["created_at"]
            self._mongo_collection.replace_one({"_id": document_id}, mongo_payload, upsert=True)
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
            document_id = self._mongo_document_id(
                self._normalise_identity(client_name),
                self._normalise_identity(app_name),
                self._normalise_identity(project_name),
            )
            mongo_result = await run_in_threadpool(lambda: self._fetch_from_mongo(document_id))
            if mongo_result:
                return mongo_result

        def _lookup() -> Optional[Dict[str, Any]]:
            client = self._normalise_identity(client_name)
            app = self._normalise_identity(app_name)
            project = self._normalise_identity(project_name)

            for record in self._read_all_sync():
                if (
                    self._normalise_identity(str(record.get("client_name", ""))) == client
                    and self._normalise_identity(str(record.get("app_name", ""))) == app
                    and self._normalise_identity(str(record.get("project_name", ""))) == project
                ):
                    return record
            return None

        return await run_in_threadpool(_lookup)

    async def save_configuration(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        def _save() -> Dict[str, Any]:
            records = self._read_all_sync()

            client = self._normalise_identity(str(payload.get("client_name", "")))
            app = self._normalise_identity(str(payload.get("app_name", "")))
            project = self._normalise_identity(str(payload.get("project_name", "")))

            updated_payload: Dict[str, Any] = {
                **payload,
                "client_name": client,
                "app_name": app,
                "project_name": project,
                "cards": self._sanitise_cards(payload.get("cards")),
                "feature_overview": self._sanitise_feature_overview(payload.get("feature_overview")),
            }

            timestamp = self._timestamp()
            updated_payload.setdefault("created_at", timestamp)
            updated_payload["updated_at"] = timestamp

            replaced = False
            for index, record in enumerate(records):
                if (
                    self._normalise_identity(str(record.get("client_name", ""))) == client
                    and self._normalise_identity(str(record.get("app_name", ""))) == app
                    and self._normalise_identity(str(record.get("project_name", ""))) == project
                ):
                    updated_payload.setdefault("created_at", record.get("created_at", timestamp))
                    records[index] = updated_payload
                    replaced = True
                    break

            if not replaced:
                records.append(updated_payload)

            self._write_all_sync(records)
            self._persist_to_mongo(updated_payload)
            return updated_payload

        return await run_in_threadpool(_save)


__all__ = ["ExhibitionStorage"]
