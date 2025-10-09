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
    from pymongo import MongoClient
    from pymongo.collection import Collection
    from pymongo.errors import CollectionInvalid, ConfigurationError, PyMongoError
except Exception:  # pragma: no cover - executed only if pymongo missing
    MongoClient = None  # type: ignore
    Collection = None  # type: ignore
    PyMongoError = Exception  # type: ignore

DEFAULT_DATABASE = os.getenv("MONGO_DB", "trinity_db")
DEFAULT_COLLECTION = os.getenv("EXHIBITION_COLLECTION", "exhibition_catalogue")
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
        self._mongo_client: Optional[MongoClient] = None
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
    @staticmethod
    def _mongo_auth_kwargs(uri: str) -> Dict[str, str]:
        if "@" in uri.split("//", 1)[-1]:
            return {}

        username = os.getenv("MONGO_USERNAME", "").strip()
        password = os.getenv("MONGO_PASSWORD", "").strip()
        auth_source = os.getenv("MONGO_AUTH_SOURCE", "").strip() or os.getenv("MONGO_AUTH_DB", "admin").strip()
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

    @staticmethod
    def _build_host_mongo_uri() -> str:
        host = next(
            (
                value.strip()
                for value in (os.getenv("HOST_IP"), os.getenv("MONGO_HOST"))
                if isinstance(value, str) and value.strip()
            ),
            "localhost",
        )
        port_env = os.getenv("MONGO_PORT")
        port = port_env.strip() if isinstance(port_env, str) and port_env.strip() else "9005"

        username_env = os.getenv("MONGO_USERNAME")
        password_env = os.getenv("MONGO_PASSWORD")
        username = username_env.strip() if isinstance(username_env, str) and username_env.strip() else "admin_dev"
        password = password_env.strip() if isinstance(password_env, str) and password_env.strip() else "pass_dev"

        auth_env = os.getenv("MONGO_AUTH_SOURCE") or os.getenv("MONGO_AUTH_DB")
        auth_source = auth_env.strip() if isinstance(auth_env, str) and auth_env.strip() else "admin"

        credentials = ""
        if username and password:
            credentials = f"{username}:{password}@"
        elif username:
            credentials = f"{username}@"

        query = f"?authSource={auth_source}" if auth_source else ""

        return f"mongodb://{credentials}{host}:{port}/{DEFAULT_DATABASE}{query}"

    def _initialise_mongo(self) -> None:
        if DISABLE_MONGO:
            logging.info("ExhibitionStorage Mongo integration disabled via environment")
            return

        if MongoClient is None:
            logging.warning("pymongo not available; exhibition catalogue will use file storage only")
            return

        uri = (
            os.getenv("EXHIBITION_MONGO_URI")
            or os.getenv("MONGO_URI")
            or self._build_host_mongo_uri()
        )

        auth_kwargs = self._mongo_auth_kwargs(uri)
        try:
            client = MongoClient(uri, serverSelectionTimeoutMS=5000, **auth_kwargs)
            client.admin.command("ping")
        except Exception as exc:  # pragma: no cover - best effort logging
            logging.warning("MongoDB connection unavailable for exhibition catalogue: %s", exc)
            return

        database = None
        try:
            database = client.get_default_database()
        except ConfigurationError:
            database = None
        except Exception as exc:  # pragma: no cover - best effort logging
            logging.warning("Unable to determine exhibition catalogue database: %s", exc)
            try:
                client.close()
            except Exception:  # pragma: no cover - ignore close errors
                pass
            return

        if database is None:
            database = client[DEFAULT_DATABASE]

        try:
            database.create_collection(DEFAULT_COLLECTION)
        except CollectionInvalid:
            # Collection already exists; nothing to do.
            pass
        except PyMongoError as exc:  # pragma: no cover - best effort logging
            logging.warning("Unable to ensure exhibition catalogue collection: %s", exc)
            try:
                client.close()
            except Exception:  # pragma: no cover - ignore close errors
                pass
            return

        self._mongo_client = client
        self._mongo_collection = database[DEFAULT_COLLECTION]
        logging.info("ExhibitionStorage initialised Mongo collection %s.%s", database.name, DEFAULT_COLLECTION)

    def _mongo_document_id(self, client: str, app: str, project: str) -> str:
        return f"{client}/{app}/{project}"

    def _fetch_from_mongo(self, document_id: str) -> Optional[Dict[str, Any]]:
        if self._mongo_collection is None:
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
        if self._mongo_collection is None:
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
        if self._mongo_collection is None:
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
        if self._mongo_collection is not None:
            mongo_records = await run_in_threadpool(self._list_from_mongo)
        if mongo_records:
            return mongo_records
        return await run_in_threadpool(self._read_all_sync)

    async def get_configuration(self, client_name: str, app_name: str, project_name: str) -> Optional[Dict[str, Any]]:
        if self._mongo_collection is not None:
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
