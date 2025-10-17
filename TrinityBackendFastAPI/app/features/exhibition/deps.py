from __future__ import annotations

import logging
import os
from functools import lru_cache

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


def _default_mongo_uri() -> str:
    """Construct the exhibition Mongo URI using runtime configuration."""

    username_env = os.getenv("MONGO_USERNAME") or os.getenv("MONGO_USER")
    password_env = os.getenv("MONGO_PASSWORD") or os.getenv("MONGO_PASS")

    username = (
        username_env.strip()
        if isinstance(username_env, str) and username_env.strip()
        else "admin_dev"
    )
    password = (
        password_env.strip()
        if isinstance(password_env, str) and password_env.strip()
        else "pass_dev"
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
        database=DEFAULT_DATABASE,
    )


def _mongo_auth_kwargs(uri: str) -> dict[str, str]:
    """Build authentication keyword arguments for Motor clients."""

    # If credentials are already embedded in the URI (i.e. contains '@'),
    # the client will authenticate using those values so we avoid providing
    # duplicate username/password parameters.
    if "@" in uri.split("//", 1)[-1]:
        return {}

    username_env = os.getenv("MONGO_USERNAME") or os.getenv("MONGO_USER")
    password_env = os.getenv("MONGO_PASSWORD") or os.getenv("MONGO_PASS")
    auth_source_env = os.getenv("MONGO_AUTH_SOURCE") or os.getenv("MONGO_AUTH_DB")

    username = (
        username_env.strip()
        if isinstance(username_env, str) and username_env.strip()
        else "admin_dev"
    )
    password = (
        password_env.strip()
        if isinstance(password_env, str) and password_env.strip()
        else "pass_dev"
    )
    auth_source = (
        auth_source_env.strip()
        if isinstance(auth_source_env, str) and auth_source_env.strip()
        else "admin"
    )
    auth_mechanism = os.getenv("MONGO_AUTH_MECHANISM", "").strip()

    kwargs: dict[str, str] = {}
    if username:
        kwargs["username"] = username
    if password:
        kwargs["password"] = password
    if auth_source:
        kwargs["authSource"] = auth_source
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
