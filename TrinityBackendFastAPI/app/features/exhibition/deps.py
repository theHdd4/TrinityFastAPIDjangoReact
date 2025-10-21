from __future__ import annotations

import logging
import os
from functools import lru_cache
from typing import Iterable, Optional
from urllib.parse import parse_qs, urlparse

from fastapi import Depends
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection, AsyncIOMotorDatabase

from app.core.mongo import build_host_mongo_uri

try:  # pragma: no cover - pymongo should be present but guard for tests
    from pymongo.errors import CollectionInvalid, PyMongoError
except Exception:  # pragma: no cover - executed only when pymongo missing
    CollectionInvalid = Exception  # type: ignore[assignment]
    PyMongoError = Exception  # type: ignore[assignment]

DEFAULT_DATABASE = os.getenv("MONGO_DB", "trinity_db")
DEFAULT_COLLECTION = os.getenv("EXHIBITION_COLLECTION", "exhibition_catalogue")
LAYOUT_COLLECTION = os.getenv("EXHIBITION_LAYOUT_COLLECTION", "exhibition_list_configuration")

_USERNAME_ENV_VARS: tuple[str, ...] = (
    "EXHIBITION_MONGO_USERNAME",
    "MONGO_USERNAME",
    "MONGO_USER",
    "MONGO_INITDB_ROOT_USERNAME",
    "MONGO_INITDB_USERNAME",
    "MONGO_ROOT_USERNAME",
)
_PASSWORD_ENV_VARS: tuple[str, ...] = (
    "EXHIBITION_MONGO_PASSWORD",
    "MONGO_PASSWORD",
    "MONGO_PASS",
    "MONGO_INITDB_ROOT_PASSWORD",
    "MONGO_INITDB_PASSWORD",
    "MONGO_ROOT_PASSWORD",
)
_AUTH_SOURCE_ENV_VARS: tuple[str, ...] = (
    "EXHIBITION_MONGO_AUTH_SOURCE",
    "MONGO_AUTH_SOURCE",
    "MONGO_AUTH_DB",
)
_AUTH_MECHANISM_ENV_VARS: tuple[str, ...] = (
    "EXHIBITION_MONGO_AUTH_MECHANISM",
    "MONGO_AUTH_MECHANISM",
)
_AUTH_FLAG_ENV_VARS: tuple[str, ...] = (
    "EXHIBITION_REQUIRE_MONGO_AUTH",
    "MONGO_REQUIRE_AUTH",
)


def _first_non_empty_env(names: Iterable[str]) -> Optional[str]:
    for name in names:
        value = os.getenv(name)
        if value is None:
            continue
        stripped = value.strip()
        if stripped:
            return stripped
    return None


def _first_truthy_flag(names: Iterable[str]) -> Optional[bool]:
    truthy = {"1", "true", "yes", "on"}
    falsy = {"0", "false", "no", "off"}
    for name in names:
        value = os.getenv(name)
        if value is None:
            continue
        lowered = value.strip().lower()
        if not lowered:
            continue
        if lowered in truthy:
            return True
        if lowered in falsy:
            return False
    return None


def _auth_source_from_uri(uri: str) -> Optional[str]:
    parsed = urlparse(uri)
    if parsed.query:
        query = parse_qs(parsed.query)
        for candidate in query.get("authSource", []):
            candidate = candidate.strip()
            if candidate:
                return candidate
    return None


def _should_require_auth(uri: str) -> bool:
    flag = _first_truthy_flag(_AUTH_FLAG_ENV_VARS)
    if flag is not None:
        return flag

    parsed = urlparse(uri)
    if parsed.username or parsed.password:
        return False

    if _first_non_empty_env(_USERNAME_ENV_VARS):
        return True
    if _first_non_empty_env(_PASSWORD_ENV_VARS):
        return True
    if _first_non_empty_env(_AUTH_SOURCE_ENV_VARS):
        return True
    if _auth_source_from_uri(uri):
        return True
    return False


def _mongo_credentials(uri: str) -> tuple[Optional[str], Optional[str], Optional[str], bool]:
    username = _first_non_empty_env(_USERNAME_ENV_VARS)
    password = _first_non_empty_env(_PASSWORD_ENV_VARS)
    auth_source = _first_non_empty_env(_AUTH_SOURCE_ENV_VARS)

    require_auth = _should_require_auth(uri)
    if not require_auth:
        return None, None, None, False

    username = username or "admin_dev"
    password = password or "pass_dev"
    if not auth_source:
        auth_source = _auth_source_from_uri(uri) or "admin"

    return username, password, auth_source, True


def _default_mongo_uri() -> str:
    """Construct the exhibition Mongo URI using runtime configuration."""

    username, password, auth_source, require_auth = _mongo_credentials("")

    if not require_auth:
        username = ""
        password = ""
        auth_source = ""

    return build_host_mongo_uri(
        username=username or "",
        password=password or "",
        auth_source=auth_source or "",
        database=DEFAULT_DATABASE,
    )


def _mongo_auth_kwargs(uri: str) -> dict[str, str]:
    """Build authentication keyword arguments for Motor clients."""

    if "@" in uri.split("//", 1)[-1]:
        return {}

    username, password, auth_source, require_auth = _mongo_credentials(uri)
    if not require_auth:
        return {}

    kwargs: dict[str, str] = {}
    if username:
        kwargs["username"] = username
    if password:
        kwargs["password"] = password
    if auth_source:
        kwargs["authSource"] = auth_source

    auth_mechanism = _first_non_empty_env(_AUTH_MECHANISM_ENV_VARS)
    if auth_mechanism:
        kwargs["authMechanism"] = auth_mechanism

    return kwargs


@lru_cache(maxsize=1)
def get_mongo_client() -> AsyncIOMotorClient:
    uri = os.getenv("EXHIBITION_MONGO_URI") or os.getenv("MONGO_URI") or _default_mongo_uri()
    auth_kwargs = _mongo_auth_kwargs(uri)
    return AsyncIOMotorClient(uri, **auth_kwargs)


def get_database(client: AsyncIOMotorClient = Depends(get_mongo_client)) -> AsyncIOMotorDatabase:
    default_db = client.get_default_database()
    if default_db is not None:
        return default_db
    return client[DEFAULT_DATABASE]


async def get_exhibition_collection(
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> AsyncIOMotorCollection:
    async def _ensure_collection() -> None:
        try:
            collections = await database.list_collection_names()
        except PyMongoError as exc:  # pragma: no cover - best effort logging
            logging.warning("Unable to list Mongo collections for exhibition catalogue: %s", exc)
            return

        if DEFAULT_COLLECTION in collections:
            return

        try:
            await database.create_collection(DEFAULT_COLLECTION)
        except CollectionInvalid:
            # Collection created concurrently by another process.
            pass
        except PyMongoError as exc:  # pragma: no cover - best effort logging
            logging.warning("Unable to create exhibition catalogue collection: %s", exc)

    await _ensure_collection()

    return database[DEFAULT_COLLECTION]


async def get_exhibition_layout_collection(
    database: AsyncIOMotorDatabase = Depends(get_database),
) -> AsyncIOMotorCollection:
    async def _ensure_collection() -> None:
        try:
            collections = await database.list_collection_names()
        except PyMongoError as exc:  # pragma: no cover - best effort logging
            logging.warning("Unable to list Mongo collections for exhibition layouts: %s", exc)
            return

        if LAYOUT_COLLECTION in collections:
            return

        try:
            await database.create_collection(LAYOUT_COLLECTION)
        except CollectionInvalid:
            # Collection created concurrently by another process.
            pass
        except PyMongoError as exc:  # pragma: no cover - best effort logging
            logging.warning("Unable to create exhibition layout collection: %s", exc)

    await _ensure_collection()

    return database[LAYOUT_COLLECTION]
