"""Mongo helpers for the exhibition feature.

This module mirrors the approach used by the column classifier feature where
the ``column_classifier_config`` collection is initialised at import time and
verified on demand when the service is used.  By centralising the logic here we
avoid duplicating connection code throughout the exhibition module while also
ensuring that the ``exhibition_catalogue`` collection exists before any reads
or writes occur.
"""

from __future__ import annotations

import logging
import os
from typing import Optional

try:  # pragma: no cover - ``pymongo`` should be installed in runtime images
    from pymongo import MongoClient
    from pymongo.collection import Collection
    from pymongo.database import Database
    from pymongo.errors import CollectionInvalid, ConfigurationError, PyMongoError
except Exception:  # pragma: no cover - executed only when pymongo is missing
    MongoClient = None  # type: ignore[assignment]
    Collection = None  # type: ignore[assignment]
    Database = None  # type: ignore[assignment]
    CollectionInvalid = Exception  # type: ignore[assignment]
    ConfigurationError = Exception  # type: ignore[assignment]
    PyMongoError = Exception  # type: ignore[assignment]

try:
    from app.core.mongo import build_host_mongo_uri
except Exception:  # pragma: no cover - fallback when app package imports fail
    def build_host_mongo_uri(
        *,
        username: str = "admin_dev",
        password: str = "pass_dev",
        auth_source: str = "admin",
        database: str | None = None,
        default_host: str = "localhost",
        default_port: str = "9005",
        options: Optional[dict[str, str]] = None,
    ) -> str:
        host = os.getenv("HOST_IP") or os.getenv("MONGO_HOST") or default_host
        port = os.getenv("MONGO_PORT") or default_port

        credentials = ""
        if username and password:
            credentials = f"{username}:{password}@"
        elif username:
            credentials = f"{username}@"

        path = f"/{database}" if database else "/"

        query_params: dict[str, str] = {}
        if auth_source:
            query_params["authSource"] = auth_source
        if options:
            query_params.update({k: v for k, v in options.items() if v is not None})

        query = ""
        if query_params:
            query = "?" + "&".join(f"{key}={value}" for key, value in query_params.items())

        return f"mongodb://{credentials}{host}:{port}{path}{query}"

try:  # pragma: no cover - exhibition module should not depend on classifier config
    from app.features.column_classifier.config import settings as _classifier_settings
except Exception:  # pragma: no cover - fallback when classifier settings unavailable
    _classifier_settings = None

DEFAULT_DATABASE = (
    os.getenv("EXHIBITION_MONGO_DB")
    or os.getenv("EXHIBITION_DB")
    or os.getenv("EXHIBITION_DATABASE")
    or (
        getattr(_classifier_settings, "classifier_configs_database", None)
        if _classifier_settings is not None
        else None
    )
    or "trinity_db"
)
DEFAULT_COLLECTION = os.getenv("EXHIBITION_COLLECTION", "exhibition_catalogue")

_mongo_client: Optional[MongoClient] = None
_mongo_database: Optional[Database] = None
_mongo_collection: Optional[Collection] = None


def _mongo_disabled() -> bool:
    return os.getenv("EXHIBITION_DISABLE_MONGO", "").strip().lower() in {"1", "true", "yes"}


def _mongo_auth_kwargs(uri: str) -> dict[str, str]:
    """Build authentication kwargs for :class:`~pymongo.MongoClient`.

    If credentials are embedded in the URI we avoid passing duplicate values,
    mirroring the behaviour used by other features such as the column
    classifier module.
    """

    if "@" in uri.split("//", 1)[-1]:
        return {}

    username = os.getenv("MONGO_USERNAME", "").strip()
    password = os.getenv("MONGO_PASSWORD", "").strip()
    auth_source = os.getenv("MONGO_AUTH_SOURCE", "").strip() or os.getenv("MONGO_AUTH_DB", "admin").strip()
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


def _default_mongo_uri() -> str:
    """Construct the default MongoDB URI for the exhibition catalogue."""

    username_env = os.getenv("MONGO_USERNAME")
    password_env = os.getenv("MONGO_PASSWORD")

    username = username_env.strip() if isinstance(username_env, str) and username_env.strip() else "admin_dev"
    password = password_env.strip() if isinstance(password_env, str) and password_env.strip() else "pass_dev"

    auth_source_env = os.getenv("MONGO_AUTH_SOURCE") or os.getenv("MONGO_AUTH_DB")
    auth_source = auth_source_env.strip() if isinstance(auth_source_env, str) and auth_source_env.strip() else "admin"

    return build_host_mongo_uri(
        username=username,
        password=password,
        auth_source=auth_source,
        database=DEFAULT_DATABASE,
    )


def ensure_mongo_connection(*, force: bool = False) -> bool:
    """Ensure the MongoDB client and collection are ready for use.

    The logic mirrors :func:`app.features.column_classifier.database.ensure_mongo_connection`
    so that the exhibition catalogue collection is created with the same
    guarantees as the ``column_classifier_config`` collection.
    """

    global _mongo_client, _mongo_database, _mongo_collection

    if _mongo_disabled():
        return False

    if not force and _mongo_client is not None and _mongo_database is not None and _mongo_collection is not None:
        return True

    if MongoClient is None:  # pragma: no cover - guards tests without pymongo
        logging.warning("pymongo not available; exhibition catalogue will rely on file storage")
        return False

    uri = os.getenv("EXHIBITION_MONGO_URI") or os.getenv("MONGO_URI") or _default_mongo_uri()
    auth_kwargs = _mongo_auth_kwargs(uri)

    client: Optional[MongoClient] = None
    try:
        client = MongoClient(uri, serverSelectionTimeoutMS=5000, **auth_kwargs)
        client.admin.command("ping")

        desired_database_name = DEFAULT_DATABASE

        database: Optional[Database] = None
        try:
            default_db = client.get_default_database()
        except ConfigurationError:
            default_db = None

        if default_db is not None and default_db.name != desired_database_name:
            logging.info(
                "Exhibition catalogue overriding Mongo default database %s with %s",
                default_db.name,
                desired_database_name,
            )

        database = client[desired_database_name]

        try:
            existing_collections = set(database.list_collection_names())
        except PyMongoError as exc:  # pragma: no cover - best effort logging
            logging.warning("Unable to list Mongo collections for exhibition catalogue: %s", exc)
            existing_collections = set()

        if DEFAULT_COLLECTION not in existing_collections:
            try:
                database.create_collection(DEFAULT_COLLECTION)
            except CollectionInvalid:
                # Another process may have created the collection concurrently.
                pass

        _mongo_client = client
        _mongo_database = database
        _mongo_collection = database[DEFAULT_COLLECTION]
        logging.info("Exhibition catalogue Mongo initialised at %s.%s", database.name, DEFAULT_COLLECTION)
        return True
    except PyMongoError as exc:  # pragma: no cover - best effort logging
        logging.warning("MongoDB connection unavailable for exhibition catalogue: %s", exc)
    except Exception as exc:  # pragma: no cover - defensive guard
        logging.warning("Unexpected Mongo initialisation failure for exhibition catalogue: %s", exc)

    if client is not None:
        try:
            client.close()
        except Exception:  # pragma: no cover - ignore close errors
            pass

    _mongo_client = None
    _mongo_database = None
    _mongo_collection = None
    return False


def get_mongo_client() -> Optional[MongoClient]:
    """Return the cached MongoDB client for the exhibition catalogue."""

    return _mongo_client


def get_mongo_collection() -> Optional[Collection]:
    """Return the Mongo collection used for exhibition configurations."""

    return _mongo_collection


__all__ = [
    "DEFAULT_COLLECTION",
    "DEFAULT_DATABASE",
    "ensure_mongo_connection",
    "get_mongo_client",
    "get_mongo_collection",
]

